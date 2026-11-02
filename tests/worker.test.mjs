// Test du Worker avec une D1 simulée (SQLite en mémoire de Node 22) — connexion, catalogue en lecture, conflit de version.
import { DatabaseSync } from "node:sqlite";
const W = (await import(new URL("../src/worker.js", import.meta.url).href)).default;
function d1(db) {
  const prep = (sql) => { let args = []; const o = {
    bind: (...a) => { args = a; return o; },
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  }; return o; };
  return { prepare: prep, batch: async (st) => { const out = []; for (const s of st) out.push(await s.run()); return out; } };
}
const own = new DatabaseSync(":memory:"), cat = new DatabaseSync(":memory:");
cat.exec("CREATE TABLE docs (k TEXT PRIMARY KEY, v TEXT NOT NULL, ver INTEGER NOT NULL, t INTEGER NOT NULL)");
cat.exec("CREATE TABLE history (id INTEGER PRIMARY KEY AUTOINCREMENT, k TEXT NOT NULL, action TEXT NOT NULL, avant TEXT, t INTEGER NOT NULL)");
cat.prepare("INSERT INTO docs VALUES (?,?,?,?)").run("structure", JSON.stringify({ families: [{ id: "chainsaw", specs: [{ k: "weight" }] }] }), 3, 1);
cat.prepare("INSERT INTO docs VALUES (?,?,?,?)").run("p:msa-220-1", JSON.stringify({ name: "MSA 220.1", family: "chainsaw" }), 1, 1);
const env = { DB: d1(own), CATALOGUE: d1(cat), ADMIN_PASSWORD: "test", ASSETS: { fetch: () => new Response("asset") } };
const req = (path, o = {}) => W.fetch(new Request("https://x.dev" + path, o), env);
let r = await req("/api/catalogue"); console.log("sans session:", r.status);
r = await req("/api/login", { method: "POST", body: JSON.stringify({ password: "faux" }), headers: { Origin: "https://x.dev" } }); console.log("mauvais mot de passe:", r.status);
r = await req("/api/login", { method: "POST", body: JSON.stringify({ password: "test" }), headers: { Origin: "https://x.dev" } });
const ck = r.headers.get("Set-Cookie").split(";")[0]; console.log("connexion:", r.status);
const H = { Cookie: ck, Origin: "https://x.dev" };
r = await req("/api/catalogue", { headers: H }); const c = await r.json(); console.log("catalogue:", r.status, c.machines.map((m) => m.name), !!c.structure);
r = await req("/api/doc?k=book:msa-220-c-b", { method: "PUT", headers: H, body: JSON.stringify({ ver: 0, v: { lang: "fr" } }) }); console.log("création book:", r.status, await r.json());
r = await req("/api/doc?k=book:msa-220-c-b", { method: "PUT", headers: H, body: JSON.stringify({ ver: 0, v: { lang: "en" } }) }); console.log("écriture concurrente (ver périmée):", r.status, (await r.json()).error);
r = await req("/api/doc?k=book:msa-220-c-b", { method: "PUT", headers: H, body: JSON.stringify({ ver: 1, v: { lang: "en" } }) }); console.log("modification:", r.status);
r = await req("/api/history?k=book:msa-220-c-b", { headers: H }); console.log("historique:", (await r.json()).entries.length, "version(s) précédente(s)");
r = await req("/api/doc?k=../etc", { method: "PUT", headers: H, body: "{}" }); console.log("clé invalide:", r.status);
r = await req("/api/doc?k=book:x1y", { method: "PUT", headers: { Cookie: ck, Origin: "https://evil.dev" }, body: "{}" }); console.log("autre origine:", r.status);

r = await req("/api/catalogue/spec", { method: "POST", headers: H, body: JSON.stringify({ catId: "msa-220-1", k: "weight", value: "3,6" }) });
console.log("valeur ajoutée au catalogue:", r.status, JSON.parse(cat.prepare("SELECT v FROM docs WHERE k='p:msa-220-1'").get().v).specs, "historique catalogue:", cat.prepare("SELECT count(*) n FROM history").get().n);
r = await req("/api/catalogue/field", { method: "POST", headers: H, body: JSON.stringify({ family: "chainsaw", tech: "battery", k: "chainSpeed", label: "Chain speed", unit: "m/s" }) });
console.log("ligne ajoutée au catalogue:", r.status, JSON.parse(cat.prepare("SELECT v FROM docs WHERE k='structure'").get().v).families[0].specs.map((x) => x.k));
r = await req("/api/catalogue/spec", { method: "POST", headers: H, body: JSON.stringify({ catId: "../x", k: "weight", value: "1" }) }); console.log("machine invalide:", r.status);

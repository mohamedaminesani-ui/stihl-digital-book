// STIHL Digital Book Builder — API (Cloudflare Worker + D1 + R2)
// Site privé : toute donnée et toute photo demandent une session. Mot de passe : secret Cloudflare ADMIN_PASSWORD
// (comptes nominatifs et rôles : étape 3).
// Données propres : D1 « digital-book » (books versionnés, historique) + R2 « digital-book-photos ».
// Données techniques : LUES dans la base du Catalogue Builder (binding CATALOGUE, lecture seule) et ses photos (CAT_PHOTOS).
// Chaque enregistrement envoie la version lue ; si quelqu'un a modifié entre-temps : 409, rien n'est écrasé.

const enc = new TextEncoder();
const SESSION_MS = 14 * 86400e3, MAX_DOC = 600000, MAX_IMG = 30 * 1024 * 1024;
const IMG_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const KEY_RE = /^(settings|book:[a-z0-9-]{3,80}|shared:[a-z0-9-]{3,64})$/;
const IMG_RE = /^img\/[a-f0-9]{32}\.(png|jpg|webp)$/, CAT_IMG_RE = /^img\/[a-f0-9]{32}\.(png|jpg|webp|svg)$/;
const CAT_ASSET_RE = /^assets\/[a-z0-9_\/.-]{1,120}\.(png|jpg|jpeg|webp)$/i;
const CATALOGUE_SITE = "https://stihl-catalogue-2027.mohamedaminesani.workers.dev";

const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const alea = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const json = (d, status = 200, h = {}) => new Response(JSON.stringify(d), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...h } });
function egal(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

let pret = null;
function init(env) {
  if (!pret) pret = env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS docs (k TEXT PRIMARY KEY, v TEXT NOT NULL, ver INTEGER NOT NULL, t INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, k TEXT NOT NULL, action TEXT NOT NULL, avant TEXT, t INTEGER NOT NULL)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS history_k ON history (k, id)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS private (k TEXT PRIMARY KEY, v TEXT NOT NULL, exp INTEGER)"),
  ]).catch((e) => { pret = null; throw e; });
  return pret;
}

// ---------- session
function jeton(req) { const m = /(?:^|;\s*)db_session=([a-f0-9]{48})/.exec(req.headers.get("Cookie") || ""); return m ? m[1] : null; }
async function session(req, env) {
  const j = jeton(req); if (!j) return false;
  const r = await env.DB.prepare("SELECT exp FROM private WHERE k=?").bind("session:" + (await sha(j))).first();
  return !!r && r.exp > Date.now();
}
const cookie = (j, age) => `db_session=${j}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Strict`;
function memeOrigine(req) {
  const o = req.headers.get("Origin"), sf = req.headers.get("Sec-Fetch-Site");
  if (sf && sf !== "same-origin" && sf !== "none") return false;
  return !o || o === new URL(req.url).origin;
}
async function lireJson(req, max) {
  if (+(req.headers.get("Content-Length") || 0) > max) throw json({ error: "trop volumineux" }, 413);
  const t = await req.text(); if (t.length > max) throw json({ error: "trop volumineux" }, 413);
  try { return t ? JSON.parse(t) : {}; } catch { throw json({ error: "JSON invalide" }, 400); }
}
async function connexion(req, env) {
  if (!env.ADMIN_PASSWORD) return json({ error: "Le mot de passe n'est pas encore défini : ajoute le secret ADMIN_PASSWORD dans Cloudflare (Worker > Settings > Variables and Secrets)." }, 503);
  const ip = req.headers.get("CF-Connecting-IP") || "local", k = "echec:" + ip, now = Date.now();
  const e = await env.DB.prepare("SELECT v, exp FROM private WHERE k=?").bind(k).first();
  const n = e && e.exp > now ? +e.v : 0;
  if (n >= 8) return json({ error: "Trop d'essais. Réessaie dans 15 minutes." }, 429);
  const b = await lireJson(req, 2000);
  if (!egal(String(b.password || ""), env.ADMIN_PASSWORD)) {
    await env.DB.prepare("INSERT INTO private (k, v, exp) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, exp=excluded.exp").bind(k, String(n + 1), now + 15 * 60e3).run();
    await new Promise((ok) => setTimeout(ok, 400));
    return json({ error: "Mot de passe incorrect." }, 401);
  }
  const j = alea(24);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO private (k, v, exp) VALUES (?, '{}', ?)").bind("session:" + (await sha(j)), now + SESSION_MS),
    env.DB.prepare("DELETE FROM private WHERE k=? OR (exp IS NOT NULL AND exp < ?)").bind(k, now),
  ]);
  return json({ ok: true }, 200, { "Set-Cookie": cookie(j, SESSION_MS / 1000) });
}

// ---------- catalogue (lecture seule)
async function catalogue(env) {
  if (!env.CATALOGUE) return json({ error: "Base du Catalogue Builder non reliée (binding CATALOGUE)." }, 503);
  const { results } = await env.CATALOGUE.prepare("SELECT k, v, ver, t FROM docs WHERE k='structure' OR k LIKE 'p:%'").all();
  const out = { structure: null, machines: [] };
  for (const r of results) {
    const v = JSON.parse(r.v);
    if (r.k === "structure") out.structure = v;
    else out.machines.push({ id: r.k.slice(2), ver: r.ver, t: r.t, ...v });
  }
  return json(out);
}

// ---------- documents (books, blocs partagés, réglages)
async function toutLire(env) {
  const { results } = await env.DB.prepare("SELECT k, v, ver, t FROM docs").all();
  const docs = {};
  for (const r of results) docs[r.k] = { v: JSON.parse(r.v), ver: r.ver, t: r.t };
  return json({ docs });
}
async function ecrire(req, env, k) {
  const b = await lireJson(req, MAX_DOC);
  const ver = Number.isInteger(b.ver) ? b.ver : 0, v = JSON.stringify(b.v ?? null), now = Date.now();
  if (b.v === null || typeof b.v !== "object") return json({ error: "document vide" }, 400);
  const cur = await env.DB.prepare("SELECT v, ver FROM docs WHERE k=?").bind(k).first();
  if ((cur ? cur.ver : 0) !== ver) return json({ error: "conflit", ver: cur ? cur.ver : 0 }, 409);
  if (cur) {
    const r = await env.DB.prepare("UPDATE docs SET v=?, ver=ver+1, t=? WHERE k=? AND ver=?").bind(v, now, k, ver).run();
    if (!r.meta.changes) return json({ error: "conflit" }, 409);
    await env.DB.prepare("INSERT INTO history (k, action, avant, t) VALUES (?, 'modif', ?, ?)").bind(k, cur.v, now).run();
  } else {
    const r = await env.DB.prepare("INSERT OR IGNORE INTO docs (k, v, ver, t) VALUES (?, ?, 1, ?)").bind(k, v, now).run();
    if (!r.meta.changes) return json({ error: "conflit" }, 409);
  }
  return json({ ok: true, ver: ver + 1, t: now });
}
async function supprimer(env, k, ver) {
  const cur = await env.DB.prepare("SELECT v, ver FROM docs WHERE k=?").bind(k).first();
  if (!cur) return json({ ok: true });
  if (cur.ver !== ver) return json({ error: "conflit" }, 409);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM docs WHERE k=? AND ver=?").bind(k, ver),
    env.DB.prepare("INSERT INTO history (k, action, avant, t) VALUES (?, 'suppression', ?, ?)").bind(k, cur.v, Date.now()),
  ]);
  return json({ ok: true });
}
async function historique(env, k) {
  const { results } = await env.DB.prepare("SELECT id, action, avant, t FROM history WHERE k=? ORDER BY id DESC LIMIT 50").bind(k).all();
  return json({ entries: results.map((r) => ({ ...r, avant: r.avant ? JSON.parse(r.avant) : null })) });
}

// ---------- photos
async function envoyerImage(req, env) {
  const type = (req.headers.get("Content-Type") || "").split(";")[0].trim();
  const ext = IMG_TYPES[type]; if (!ext) return json({ error: "format non accepté (PNG, JPEG ou WebP)" }, 415);
  const buf = await req.arrayBuffer(); if (!buf.byteLength || buf.byteLength > MAX_IMG) return json({ error: "photo vide ou trop lourde (30 Mo max.)" }, 413);
  const key = `img/${alea(16)}.${ext}`;
  await env.PHOTOS.put(key, buf, { httpMetadata: { contentType: type } });
  return json({ key, size: buf.byteLength });
}
async function lireImage(bucket, key) {
  const o = bucket && (await bucket.get(key));
  if (!o) return new Response("introuvable", { status: 404 });
  const h = new Headers({ "Content-Type": o.httpMetadata?.contentType || "application/octet-stream", "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", ETag: o.httpEtag });
  if (key.endsWith(".svg")) h.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  return new Response(o.body, { headers: h });
}

// photos reprises du catalogue 2026 : fichiers publics du site Catalogue Builder (liaison de service, sinon adresse publique)
async function assetCatalogue(env, key) {
  const u = `${CATALOGUE_SITE}/${key}`;
  const r = env.CATALOGUE_SITE ? await env.CATALOGUE_SITE.fetch(new Request(u)) : await fetch(u);
  if (!r.ok) return new Response("introuvable", { status: 404 });
  const ct = r.headers.get("Content-Type") || "";
  if (!ct.startsWith("image/")) return new Response("introuvable", { status: 404 });
  return new Response(r.body, { headers: { "Content-Type": ct, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname, m = req.method;
    if (!p.startsWith("/api/") && !p.startsWith("/img/") && !p.startsWith("/cat-img/")) return env.ASSETS.fetch(req);
    try {
      await init(env);
      if (m !== "GET" && !memeOrigine(req)) return json({ error: "origine refusée" }, 403);
      if (p === "/api/login" && m === "POST") return await connexion(req, env);
      if (p === "/api/logout" && m === "POST") {
        const j = jeton(req); if (j) await env.DB.prepare("DELETE FROM private WHERE k=?").bind("session:" + (await sha(j))).run();
        return json({ ok: true }, 200, { "Set-Cookie": cookie("x", 0) });
      }
      if (!(await session(req, env))) return json({ error: "connexion requise" }, 401);

      if (p.startsWith("/img/")) { const key = p.slice(1); return IMG_RE.test(key) ? await lireImage(env.PHOTOS, key) : new Response("introuvable", { status: 404 }); }
      if (p.startsWith("/cat-img/")) {
        const key = p.slice(9);
        if (CAT_IMG_RE.test(key)) return await lireImage(env.CAT_PHOTOS, key);
        if (CAT_ASSET_RE.test(key) && !key.includes("..")) return await assetCatalogue(env, key);
        return new Response("introuvable", { status: 404 });
      }
      if (p === "/api/catalogue" && m === "GET") return await catalogue(env);
      if (p === "/api/data" && m === "GET") return await toutLire(env);
      if (p === "/api/doc") {
        const k = url.searchParams.get("k") || ""; if (!KEY_RE.test(k)) return json({ error: "clé invalide" }, 400);
        if (m === "PUT") return await ecrire(req, env, k);
        if (m === "DELETE") return await supprimer(env, k, +url.searchParams.get("ver"));
      }
      if (p === "/api/history" && m === "GET") { const k = url.searchParams.get("k") || ""; return KEY_RE.test(k) ? await historique(env, k) : json({ error: "clé invalide" }, 400); }
      if (p === "/api/img" && m === "POST") return await envoyerImage(req, env);
      return json({ error: "introuvable" }, 404);
    } catch (e) {
      if (e instanceof Response) return e;
      console.error(e && e.stack);
      return json({ error: "erreur serveur" }, 500);
    }
  },
};

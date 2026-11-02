// Accès aux données : API du Worker (en ligne) ou stockage local (mode démonstration, sans serveur).
const LOCAL = "dbb-demo-docs";

export class Conflict extends Error { constructor(ver) { super("conflit"); this.ver = ver; } }

async function req(url, o = {}) {
  const r = await fetch(url, { credentials: "same-origin", ...o });
  const ct = r.headers.get("Content-Type") || "";
  const j = ct.includes("json") ? await r.json() : null;
  if (r.status === 409) throw new Conflict(j?.ver);
  if (!r.ok || !j) { const e = new Error(j?.error || `Erreur ${r.status}`); e.status = j ? r.status : 0; throw e; }
  return j;
}

export function createApi(mode) {
  if (mode === "api") return {
    mode,
    catalogue: () => req("/api/catalogue"),
    data: () => req("/api/data"),
    save: (k, v, ver) => req(`/api/doc?k=${encodeURIComponent(k)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ v, ver }) }),
    remove: (k, ver) => req(`/api/doc?k=${encodeURIComponent(k)}&ver=${ver}`, { method: "DELETE" }),
    history: (k) => req(`/api/history?k=${encodeURIComponent(k)}`),
    upload: async (blob) => (await req("/api/img", { method: "POST", headers: { "Content-Type": blob.type }, body: blob })).key,
    // écriture dans le Catalogue Builder (seulement sur demande)
    catSpec: (catId, k, value) => req("/api/catalogue/spec", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ catId, k, value }) }),
    catField: (family, tech, k, label, unit) => req("/api/catalogue/field", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ family, tech, k, label, unit }) }),
  };
  // démonstration : documents gardés dans ce navigateur seulement
  const read = () => { try { return JSON.parse(localStorage.getItem(LOCAL) || "{}"); } catch { return {}; } };
  const write = (d) => { try { localStorage.setItem(LOCAL, JSON.stringify(d)); } catch { /* stockage indisponible */ } };
  let mem = read();
  return {
    mode,
    catalogue: () => req("samples/catalogue.json"),
    data: async () => ({ docs: JSON.parse(JSON.stringify(mem)) }),
    save: async (k, v, ver) => {
      const cur = mem[k];
      if ((cur?.ver || 0) !== ver) throw new Conflict(cur?.ver || 0);
      mem[k] = { v, ver: ver + 1, t: Date.now(), hist: [...(cur ? [{ id: Date.now(), action: "modif", avant: cur.v, t: cur.t }] : []), ...(cur?.hist || [])].slice(0, 30) };
      write(mem);
      return { ok: true, ver: ver + 1, t: mem[k].t };
    },
    remove: async (k) => { delete mem[k]; write(mem); return { ok: true }; },
    history: async (k) => ({ entries: mem[k]?.hist || [] }),
    upload: async (blob) => await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); }),
    // démonstration : le « catalogue » est une copie locale, modifiée en mémoire seulement
    catSpec: async (_id, _k, value) => ({ ok: true, value }),
    catField: async (_f, _t, k) => ({ ok: true, k }),
  };
}

// Photo prête pour l'impression : 2400 px maximum, transparence gardée (PNG), sinon JPEG qualité 0,9.
export async function prepareImage(file) {
  const bmp = await createImageBitmap(file);
  const max = 2400, s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  if (s === 1 && (file.type === "image/jpeg" || file.type === "image/png") && file.size < 8e6) return { blob: file, w, h };
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); g.drawImage(bmp, 0, 0, w, h);
  let alpha = false;
  if (file.type !== "image/jpeg") {
    const d = g.getImageData(0, 0, w, h).data;
    for (let i = 3; i < d.length; i += 4 * 7) if (d[i] < 250) { alpha = true; break; }
  }
  const type = alpha ? "image/png" : "image/jpeg";
  const blob = await new Promise((ok) => c.toBlob(ok, type, 0.9));
  return { blob, w, h };
}

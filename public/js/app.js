// STIHL Digital Book Builder — interface (bibliothèque, éditeur par bloc avec aperçu en direct, blocs partagés).
import { createStudio, download } from "./studio.js";
import { createApi, Conflict, prepareImage } from "./api.js";
import { STATUS, SHARED, SHARED_FOR, emptyBook, resolveBook, newId, mKey } from "./model.js";
import { familyTitle, specLabel } from "./engine/i18n.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const CATALOGUE_URL = "https://stihl-catalogue-2027.mohamedaminesani.workers.dev";
const SAMPLES = ["book-msa-220-c-b.json", "book-mh-610-710.json"];
const S = { api: null, cat: null, docs: {}, samples: [], studio: null, ed: null };

// ---------------------------------------------------------------- utilitaires
function toast(t, ms = 3500) { const e = $("toast"); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (e.hidden = true), ms); }
function dialog(html, onClick) {
  const d = $("dlg"); $("dlgBody").innerHTML = html; d.showModal();
  d.onclick = (e) => { if (e.target === d) d.close(); const b = e.target.closest("[data-act]"); if (b) onClick?.(b.dataset.act, b, d); };
  return d;
}
const fmtDate = (t) => (t ? new Date(t).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
function setPath(o, p, v) { const ks = p.split("."); let a = o; ks.slice(0, -1).forEach((k, i) => { if (a[k] == null) a[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; a = a[k]; }); a[ks[ks.length - 1]] = v; }
const famName = (id) => S.cat?.structure?.families?.find((f) => f.id === id)?.name || id; // nom anglais du catalogue
const techName = (id) => S.cat?.structure?.techs?.find((t) => t.id === id)?.fr || id;
const books = () => Object.entries(S.docs).filter(([k]) => k.startsWith("book:")).map(([k, d]) => ({ id: k.slice(5), ...d }));
const sharedDocs = () => Object.fromEntries(Object.entries(S.docs).filter(([k]) => k.startsWith("shared:")).map(([k, d]) => [k.slice(7), d.v]));

// ---------------------------------------------------------------- démarrage
async function start() {
  try {
    S.api = createApi("api");
    S.cat = await S.api.catalogue();
    $("mode").textContent = `Catalogue Builder : ${S.cat.machines.length} machines`;
  } catch (e) {
    if (e.status === 401) { $("login").hidden = false; $("pw").focus(); return; }
    S.api = createApi("demo");
    S.cat = await S.api.catalogue();
    S.cat.machines = S.cat.machines || [];
    $("mode").textContent = "Mode démonstration : enregistré dans ce navigateur seulement";
  }
  S.docs = (await S.api.data()).docs;
  for (const f of SAMPLES) { try { S.samples.push(await (await fetch("samples/" + f)).json()); } catch { /* exemple absent */ } }
  S.studio = await createStudio();
  addEventListener("hashchange", route);
  route();
}

let leaving = false;
function route() {
  if (S.ed?.dirty && !leaving && !location.hash.startsWith("#/book/" + S.ed.id)) {
    if (!confirm("Des modifications ne sont pas enregistrées. Quitter quand même ?")) { leaving = true; history.back(); setTimeout(() => (leaving = false), 50); return; }
  }
  const h = location.hash || "#/";
  const sec = h.startsWith("#/shared") ? "shared" : h.startsWith("#/book") ? "books" : "dash";
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("on", sec === a.dataset.nav));
  if (!h.startsWith("#/book/")) S.ed = null;
  if (h.startsWith("#/book/")) openEditor(decodeURIComponent(h.slice(7)));
  else if (h.startsWith("#/shared")) viewShared();
  else if (h.startsWith("#/books")) viewLibrary(new URLSearchParams(h.split("?")[1] || ""));
  else viewDashboard();
}
addEventListener("beforeunload", (e) => { if (S.ed?.dirty || Object.values(S.sh || {}).some((x) => x.dirty)) { e.preventDefault(); e.returnValue = ""; } });

// ---------------------------------------------------------------- tableau de bord
function viewDashboard() {
  const bs = books(), ms = S.cat.machines || [];
  const covered = new Set(bs.flatMap((b) => (b.v.machines || []).map((m) => m.catId).filter(Boolean)));
  const n = (st) => bs.filter((b) => (b.v.status || "draft") === st).length;
  const without = ms.filter((m) => !covered.has(m.id)).sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
  const fams = (S.cat.structure?.families || []).map((f) => ({ f, ms: ms.filter((m) => m.family === f.id), bs: bs.filter((b) => b.v.family === f.id) })).filter((x) => x.ms.length || x.bs.length);
  const recent = bs.slice().sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 5);
  const kpi = (v, l, href, cls = "") => `<a class="kpi ${cls}" href="${href}"><b>${v}</b><span>${l}</span></a>`;
  $("view").innerHTML = `<div class="head-row"><div><h1>Tableau de bord</h1><p class="muted">Digital books d'après-formation · Fiche d'information 3 pages · FR / EN</p></div>
      <div class="actions"><a class="btn" href="#/books">Voir les books</a><button class="btn primary" id="dNew">Nouveau book</button></div></div>
    <div class="kpis">${kpi(bs.length, "books", "#/books")}${kpi(n("draft"), "brouillons", "#/books?s=draft")}${kpi(n("review"), "à valider", "#/books?s=review", n("review") ? "warn" : "")}${kpi(n("valid"), "validés", "#/books?s=valid")}</div>
    <div class="kpis">${kpi(ms.length, "machines dans le catalogue", CATALOGUE_URL)}${kpi(covered.size, "machines avec un book", "#/books")}${kpi(without.length, "machines sans book", "#sans-book", without.length ? "warn" : "")}<a class="kpi" href="#/books" id="kErr"><b>…</b><span>books avec défaut bloquant</span></a></div>
    <section><h2>Par famille</h2>${fams.length ? `<div class="famtable">${fams.map(({ f, ms, bs }) => {
      const c = ms.filter((m) => covered.has(m.id)).length;
      return `<a class="famrow" href="#/books?f=${encodeURIComponent(f.id)}"><b>${esc(familyTitle("fr", f, f.techs?.[0], S.cat.structure?.techs).replace(/ (à batterie|thermique|électrique)$/, ""))}</b>
        <span class="bar" aria-hidden="true"><i style="width:${ms.length ? Math.round((100 * c) / ms.length) : 0}%"></i></span>
        <span class="muted">${c}/${ms.length} machines couvertes · ${bs.length} book(s)</span></a>`;
    }).join("")}</div>` : `<p class="empty">Aucune machine dans le catalogue.</p>`}</section>
    <section id="sans-book"><h2>Machines du catalogue sans book (${without.length})</h2>${without.length ? `<ul class="books">${without.slice(0, 15).map((m) => `<li class="bk"><div class="bk-main"><b>${esc(m.name)}</b><span class="muted">${esc(familyTitle("fr", S.cat.structure?.families?.find((f) => f.id === m.family), m.tech, S.cat.structure?.techs))}</span></div><button class="btn small" data-newfor="${esc(m.id)}">Créer le book</button></li>`).join("")}</ul>${without.length > 15 ? `<p class="muted">… et ${without.length - 15} autres : utilise « Nouveau book ».</p>` : ""}` : `<p class="empty">Toutes les machines du catalogue ont un book.</p>`}</section>
    <section><h2>Derniers books modifiés</h2>${recent.length ? `<ul class="books">${recent.map((b) => `<li class="bk"><div class="bk-main"><b>${esc((b.v.machines || []).map((m) => m.name || m.catId).join(" / "))}</b><span class="muted">${esc((b.v.lang || "fr").toUpperCase())} · modifié le ${esc(fmtDate(b.t))}</span></div><span class="pill ${b.v.status}">${STATUS[b.v.status] || "Brouillon"}</span><a class="btn small" href="#/book/${encodeURIComponent(b.id)}">Ouvrir</a></li>`).join("")}</ul>` : `<p class="empty">Aucun book pour l'instant.</p>`}</section>
    <section><h2>Comment ça marche</h2><ol class="steps">
      <li><b>Nouveau book</b> : 1 à 4 machines du catalogue (même famille et technologie), ou une machine hors catalogue.</li>
      <li><b>Remplir</b> : un formulaire par bloc, aperçu en direct. Les caractéristiques viennent du Catalogue Builder ; une valeur modifiée ou une ligne ajoutée peut être renvoyée au catalogue.</li>
      <li><b>Contrôler</b> : le contrôle qualité signale les manques et les textes trop longs ; « Validé » n'est possible que sans défaut bloquant.</li>
      <li><b>Exporter</b> : PPTX éditable et PDF identique à l'aperçu.</li></ol></section>`;
  $("dNew").onclick = () => newBookDialog();
  $("view").querySelector('a[href="#sans-book"]').onclick = (e) => { e.preventDefault(); $("sans-book").scrollIntoView({ behavior: "smooth" }); };
  $("view").querySelectorAll("[data-newfor]").forEach((b) => (b.onclick = () => newBookDialog(b.dataset.newfor)));
  // défauts bloquants : calculés book par book après l'affichage
  (async () => {
    let err = 0;
    for (const b of bs) {
      if (location.hash && location.hash !== "#/" && !location.hash.startsWith("#sans")) return;
      try { const r = await S.studio.build(resolveBook(b.v, S.cat, sharedDocs()), S.cat); if (r.issues.some((x) => x.level === "error")) err++; } catch { err++; }
    }
    const k = $("kErr"); if (k) { k.querySelector("b").textContent = err; k.classList.toggle("warn", err > 0); }
  })();
}

// ---------------------------------------------------------------- bibliothèque
function viewLibrary(q = new URLSearchParams()) {
  const f = { fam: q.get("f") || "", tech: q.get("t") || "", st: q.get("s") || "", txt: (q.get("q") || "").toLowerCase() };
  const all = books();
  const list = all.filter((b) => (!f.fam || b.v.family === f.fam) && (!f.tech || b.v.tech === f.tech) && (!f.st || (b.v.status || "draft") === f.st)
    && (!f.txt || (b.v.machines || []).map((m) => m.name || m.catId).join(" ").toLowerCase().includes(f.txt))).sort((a, b) => (b.t || 0) - (a.t || 0));
  const fams = [...new Set(all.map((b) => b.v.family))];
  const card = (b, sample) => {
    const v = sample ? b : b.v;
    const names = (v.machines || []).map((m) => m.name || m.catId).join(" / ") || "Sans machine";
    return `<li class="bk"><div class="bk-main"><b>${esc(names)}</b>
      <span class="muted">${esc(famName(v.family))} · ${esc(techName(v.tech))} · ${esc((v.lang || "fr").toUpperCase())}${sample ? " · exemple" : ` · modifié le ${esc(fmtDate(b.t))}`}</span></div>
      ${sample ? `<button class="btn" data-copy="${esc(v.id)}">Copier dans mes books</button>` : `<span class="pill ${v.status}">${STATUS[v.status] || "Brouillon"}</span><a class="btn" href="#/book/${encodeURIComponent(b.id)}">Ouvrir</a>`}</li>`;
  };
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`;
  $("view").innerHTML = `<div class="head-row"><h1>Mes digital books</h1><button class="btn primary" id="btnNew">Nouveau book</button></div>
    <form class="filters" id="flt">
      <input id="fq" type="search" placeholder="Rechercher une machine" value="${esc(q.get("q") || "")}" aria-label="Rechercher une machine">
      <select id="ff" aria-label="Famille">${opt("", "Toutes les familles", f.fam)}${fams.map((x) => opt(x, famName(x), f.fam)).join("")}</select>
      <select id="ft" aria-label="Technologie">${opt("", "Toutes technologies", f.tech)}${(S.cat.structure?.techs || []).map((t) => opt(t.id, t.fr, f.tech)).join("")}</select>
      <select id="fs" aria-label="Statut">${opt("", "Tous les statuts", f.st)}${Object.entries(STATUS).map(([k, v]) => opt(k, v, f.st)).join("")}</select>
    </form>
    ${all.length ? (list.length ? `<p class="muted">${list.length} book(s)</p><ul class="books">${list.map((b) => card(b)).join("")}</ul>` : `<p class="empty">Aucun book ne correspond à ces filtres.</p>`) : `<p class="empty">Aucun book pour l'instant. Crée le premier avec « Nouveau book ».</p>`}
    ${S.api.mode === "demo" ? `<h2>Exemples</h2><ul class="books">${S.samples.map((s) => card(s, true)).join("")}</ul>` : ""}`;
  $("btnNew").onclick = () => newBookDialog();
  const go = () => { const p = new URLSearchParams(); for (const [k, id] of [["q", "fq"], ["f", "ff"], ["t", "ft"], ["s", "fs"]]) if ($(id).value) p.set(k, $(id).value); history.replaceState(null, "", "#/books" + (p.toString() ? "?" + p : "")); viewLibrary(p); };
  $("flt").onchange = go; $("fq").oninput = () => { clearTimeout(go.t); go.t = setTimeout(() => { go(); const i = $("fq"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
  $("view").querySelectorAll("[data-copy]").forEach((b) => (b.onclick = async () => {
    const s = JSON.parse(JSON.stringify(S.samples.find((x) => x.id === b.dataset.copy)));
    s.id = newId(s.machines.map((m) => m.name), s.lang); s.status = "draft"; delete s._note;
    s.shared = s.shared || {}; s.hide = s.hide || {};
    await createBook(s);
  }));
}

async function createBook(book) {
  book.updatedAt = new Date().toISOString();
  const r = await S.api.save("book:" + book.id, book, 0);
  S.docs["book:" + book.id] = { v: book, ver: r.ver, t: r.t };
  location.hash = "#/book/" + encodeURIComponent(book.id);
}

function newBookDialog(preId) {
  const fams = S.cat.structure?.families || [];
  const techs = S.cat.structure?.techs || [];
  const pre = preId && S.cat.machines.find((m) => m.id === preId);
  let picked = pre ? [{ catId: pre.id, name: pre.name, family: pre.family, tech: pre.tech }] : [];
  const render = (q = "") => {
    const ql = q.toLowerCase();
    const ms = S.cat.machines.filter((m) => !ql || `${m.name} ${famName(m.family)}`.toLowerCase().includes(ql)).sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
    const first = picked[0];
    $("pickList").innerHTML = ms.map((m) => {
      const on = picked.some((p) => p.catId === m.id);
      const off = !on && first && (m.family !== first.family || m.tech !== first.tech || picked.length >= 4);
      return `<li><label class="${off ? "dis" : ""}"><input type="checkbox" data-mid="${esc(m.id)}" ${on ? "checked" : ""} ${off ? "disabled" : ""}> <b>${esc(m.name)}</b> <span class="muted">${esc(famName(m.family))} · ${esc(techName(m.tech))}</span></label></li>`;
    }).join("") || `<li class="muted">Aucune machine trouvée dans le catalogue.</li>`;
    $("pickSel").textContent = picked.length ? `Sélection : ${picked.map((p) => p.name).join(" / ")}` : "Choisis 1 à 4 machines de la même famille et de la même technologie.";
  };
  dialog(`<h2 id="dlgTitle">Nouveau book</h2>
    <div class="tabs" role="tablist"><button class="tab on" data-act="t-cat" type="button">Machines du catalogue</button><button class="tab" data-act="t-free" type="button">Machine hors catalogue</button></div>
    <div id="pCat"><input id="pickQ" type="search" placeholder="Rechercher une machine (ex. MSA, GTA, tronçonneuse)" aria-label="Rechercher une machine"><ul id="pickList" class="pick"></ul><p id="pickSel" class="muted"></p></div>
    <div id="pFree" hidden><p class="muted">Pour une machine 2026 ou « uniquement en DIGIBOOK » absente du Catalogue Builder. Ses caractéristiques seront saisies dans le book et signalées comme non vérifiées.</p>
      <label for="fName">Nom de la machine</label><input id="fName" placeholder="ex. MSA 220 C-B">
      <div class="row2"><div><label for="fFam">Famille</label><select id="fFam">${fams.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("")}</select></div>
      <div><label for="fTech">Technologie</label><select id="fTech">${techs.map((t) => `<option value="${esc(t.id)}">${esc(t.fr)}</option>`).join("")}</select></div></div></div>
    <div class="row2"><div><label for="nLang">Langue</label><select id="nLang"><option value="fr">Français</option><option value="en">English</option></select></div></div>
    <div class="dlg-actions"><button class="btn" data-act="close" type="button">Annuler</button><button class="btn primary" data-act="create" type="button">Créer le book</button></div>`,
  async (act, btn, d) => {
    if (act === "close") d.close();
    if (act === "t-cat" || act === "t-free") { $("pCat").hidden = act !== "t-cat"; $("pFree").hidden = act !== "t-free"; d.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t === btn)); }
    if (act === "create") {
      const lang = $("nLang").value;
      let book;
      if (!$("pFree").hidden) {
        const name = $("fName").value.trim();
        if (!name) { $("fName").focus(); return; }
        book = emptyBook({ lang, family: $("fFam").value, tech: $("fTech").value, machines: [{ name, family: $("fFam").value, tech: $("fTech").value, specs: {}, images: { main: null } }] });
      } else {
        if (!picked.length) { toast("Choisis au moins une machine."); return; }
        book = emptyBook({ lang, family: picked[0].family, tech: picked[0].tech, machines: picked.map((p) => ({ catId: p.catId, name: p.name })) });
      }
      d.close();
      try { await createBook(book); } catch (e) { toast("Création impossible : " + e.message); }
    }
  });
  render();
  $("pickQ").oninput = (e) => render(e.target.value);
  $("pickList").onchange = (e) => {
    const id = e.target.dataset.mid; if (!id) return;
    const m = S.cat.machines.find((x) => x.id === id);
    picked = e.target.checked ? [...picked, { catId: id, name: m.name, family: m.family, tech: m.tech }] : picked.filter((p) => p.catId !== id);
    render($("pickQ").value);
  };
}

// ---------------------------------------------------------------- éditeur
function openEditor(id) {
  const doc = S.docs["book:" + id];
  if (!doc) { $("view").innerHTML = `<p class="empty">Ce book n'existe pas (ou plus). <a href="#/books">Retour aux books</a></p>`; return; }
  if (S.ed && S.ed.id === id) return;
  S.ed = { id, book: JSON.parse(JSON.stringify(doc.v)), ver: doc.ver, saved: JSON.stringify(doc.v), dirty: false, res: null, tab: "form" };
  const b = S.ed.book;
  b.shared = b.shared || {}; b.hide = b.hide || {}; b.feature = b.feature || {}; b.calendar = b.calendar || { rows: [] };
  $("view").innerHTML = `<div class="ed-bar">
      <a class="btn" href="#/books">← Books</a>
      <b class="ed-title" id="edTitle"></b>
      <select id="edStatus" aria-label="Statut">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
      <button class="btn primary" id="edSave">Enregistrer</button>
      <button class="btn" id="edPptx">PPTX</button><button class="btn" id="edPdf">PDF</button>
      <button class="btn" id="edMore" aria-haspopup="dialog">Plus…</button>
    </div>
    <p id="edState" class="status" role="status" aria-live="polite"></p>
    <div class="mtabs" role="tablist"><button class="tab on" data-tab="form">Contenu</button><button class="tab" data-tab="prev">Aperçu</button><button class="tab" data-tab="qc">Contrôle <span id="qcBadge"></span></button></div>
    <div class="ed" data-show="form">
      <form id="edForm" class="ed-form" onsubmit="return false"></form>
      <div class="ed-side"><div id="qcBox" class="qc"></div><div id="preview" class="preview" aria-label="Aperçu des pages"></div></div>
    </div>`;
  $("edStatus").value = b.status || "draft";
  $("edStatus").onchange = (e) => { b.status = e.target.value; markDirty(); };
  $("edSave").onclick = () => save();
  $("edPptx").onclick = () => exporter("pptx");
  $("edPdf").onclick = () => exporter("pdf");
  $("edMore").onclick = moreDialog;
  document.querySelectorAll(".mtabs .tab").forEach((t) => (t.onclick = () => { document.querySelectorAll(".mtabs .tab").forEach((x) => x.classList.toggle("on", x === t)); document.querySelector(".ed").dataset.show = t.dataset.tab; fit(); }));
  try { renderForm(); } catch (err) { showError(err); return; }
  refresh();
}
function showError(err) {
  console.error(err);
  const box = document.getElementById("edForm") || $("view");
  box.insertAdjacentHTML("afterbegin", `<p class="err">Erreur d'affichage : ${esc(err.message)}. Envoie une capture de ce message pour correction.</p>`);
}

function markDirty() {
  const e = S.ed; e.dirty = JSON.stringify(e.book) !== e.saved;
  $("edState").textContent = e.dirty ? "Modifications non enregistrées." : `Enregistré · version ${e.ver}`;
  $("edState").classList.toggle("warn", e.dirty);
  clearTimeout(markDirty.t); markDirty.t = setTimeout(refresh, 350);
}

// ----- formulaire
const field = (label, path, o = {}) => {
  const v = getPath(S.ed.book, path) ?? "";
  const id = "f-" + path.replace(/\W/g, "-");
  const lim = o.max ? ` <span class="cnt" data-cnt="${path}" data-max="${o.max}">${String(v).length}/${o.max}</span>` : "";
  return `<div class="fld"><label for="${id}">${label}${lim}</label>${o.area ? `<textarea id="${id}" data-path="${path}" rows="${o.rows || 3}" placeholder="${esc(o.ph || "")}">${esc(v)}</textarea>` : `<input id="${id}" data-path="${path}" value="${esc(v)}" placeholder="${esc(o.ph || "")}">`}${o.help ? `<small>${o.help}</small>` : ""}</div>`;
};
const lines = (label, path, o = {}) => {
  const v = (getPath(S.ed.book, path) || []).join("\n");
  const id = "f-" + path.replace(/\W/g, "-");
  return `<div class="fld"><label for="${id}">${label}</label><textarea id="${id}" data-lines="${path}" rows="${o.rows || 4}" placeholder="${esc(o.ph || "Une ligne = une puce")}">${esc(v)}</textarea><small>${o.help || "Une ligne = une puce."}</small></div>`;
};
const photo = (label, path) => {
  const k = getPath(S.ed.book, path);
  return `<div class="fld"><span class="lbl">${label}</span><div class="ph-field" data-drop="${path}">
    ${k ? `<img src="${esc(S.studio.urlFor(k))}" alt="">` : `<span class="muted">Aucune photo</span>`}
    <label class="btn small">Choisir…<input type="file" accept="image/png,image/jpeg,image/webp" data-photo="${path}" hidden></label>
    ${k ? `<button class="btn small" type="button" data-clear="${path}">Retirer</button>` : ""}<small>ou glisser-déposer ici · PNG détouré conservé</small></div></div>`;
};
// tableau éditable : cols [{ k, label, w }]
const table = (label, path, cols, o = {}) => {
  const rows = getPath(S.ed.book, path) || [];
  return `<div class="fld"><span class="lbl">${label}</span>
    <div class="tbl-ed" style="--cols:${cols.map((c) => c.w || "1fr").join(" ")} 64px">
      <div class="tr th">${cols.map((c) => `<span>${c.label}</span>`).join("")}<span></span></div>
      ${rows.map((r, i) => `<div class="tr">${cols.map((c) => `<input aria-label="${esc(c.label)} ${i + 1}" data-path="${path}.${i}.${c.k}" value="${esc(r[c.k])}">`).join("")}
        <span class="rbtn"><button type="button" data-up="${path}.${i}" aria-label="Monter">↑</button><button type="button" data-del="${path}.${i}" aria-label="Supprimer">×</button></span></div>`).join("")}
    </div>
    <div class="tbl-actions"><button class="btn small" type="button" data-add="${path}" data-cols="${cols.map((c) => c.k).join(",")}">+ Ligne</button>
    <button class="btn small" type="button" data-paste="${path}" data-cols="${cols.map((c) => c.k).join(",")}">Coller depuis Excel</button></div>
    ${o.help ? `<small>${o.help}</small>` : ""}</div>`;
};
const sharedSel = (slot, label) => {
  const kind = SHARED_FOR[slot], cur = S.ed.book.shared?.[slot] || "";
  const opts = Object.entries(SHARED).filter(([, d]) => d.kind === kind);
  return `<div class="fld"><label for="sh-${slot}">${label}</label><select id="sh-${slot}" data-path="shared.${slot}" data-rerender="1">
    <option value="">${slot === "epi" ? "Aucun" : "Spécifique à ce book (saisi ci-dessous)"}</option>
    ${opts.map(([id, d]) => `<option value="${id}" ${cur === id ? "selected" : ""}>Bloc partagé : ${esc(d.title)}${S.docs["shared:" + id] ? "" : " (pas encore créé)"}</option>`).join("")}</select>
    ${cur ? `<small>Modifié une fois dans <a href="#/shared">Blocs partagés</a>, repris dans tous les books qui l'utilisent.</small>` : ""}</div>`;
};

function famSpecs(b) {
  const fam = S.cat.structure?.families?.find((f) => f.id === b.family);
  return [...(fam?.specs || []).filter((s) => !s.techs?.length || s.techs.includes(b.tech)), ...(b.extraSpecs || []).map((x) => ({ ...x, extra: true }))];
}
function machinesSection() {
  const b = S.ed.book, fam = S.cat.structure?.families?.find((f) => f.id === b.family);
  const resolved = resolveBook(b, S.cat, sharedDocs()).machines;
  const specs = famSpecs(b);
  const chosen = new Set(b.specKeys?.length ? b.specKeys : specs.map((s) => s.k));
  const label = (s) => esc(b.specLabels?.[s.k] || (s.extra ? s.label : specLabel(b.lang, s)));
  const cell = (m, i, s) => {
    const lab = `${label(s)} ${esc(m.name)}`;
    if (m.source !== "catalogue") return `<input aria-label="${lab}" data-path="machines.${i}.specs.${s.k}" value="${esc(b.machines[i].specs?.[s.k] ?? "")}" placeholder="—">`;
    const mk = mKey(b.machines[i]), cat = m.catSpecs?.[s.k] ?? "", ed = b.specEdits?.[mk]?.[s.k];
    const edited = ed !== undefined && String(ed) !== String(cat);
    return `<span class="cv"><input aria-label="${lab}" data-cspec="${esc(mk)}|${s.k}" value="${esc(ed ?? cat)}" placeholder="—" class="${edited ? "edited" : ""}">${edited ? `<button type="button" data-crevert="${esc(mk)}|${s.k}" title="Revenir à la valeur du catalogue${cat ? " : " + esc(cat) : ""}" aria-label="Revenir à la valeur du catalogue">↺</button>` : ""}</span>`;
  };
  return `<p class="muted">${esc(familyTitle("fr", fam, b.tech, S.cat.structure?.techs))} · ${resolved.length} machine(s) sur 4.</p>
    <ul class="mlist">${resolved.map((m, i) => `<li><b>${esc(m.name)}</b> <span class="tag ${m.source}">${m.source === "catalogue" ? "Catalogue" : m.source === "missing" ? "Introuvable" : "Hors catalogue"}</span>
      <span class="rbtn">${i ? `<button type="button" data-mup="${i}" aria-label="Monter">↑</button>` : ""}<button type="button" data-mdel="${i}" aria-label="Retirer">×</button></span></li>`).join("")}</ul>
    ${resolved.length < 4 ? `<button class="btn small" type="button" id="addMachine">+ Ajouter une machine</button>` : ""}
    ${field("Titre de famille (page 1)", "familyTitle", { ph: familyTitle(b.lang, fam, b.tech, S.cat.structure?.techs), help: "Vide = titre automatique." })}
    <div class="fld"><span class="lbl">Caractéristiques (9 lignes au maximum)</span>
      <div class="spec-grid" style="--n:${resolved.length}">
        <span class="th">Afficher</span>${resolved.map((m) => `<span class="th">${esc(m.name)}</span>`).join("")}
        ${specs.map((s) => `<label class="sk"><input type="checkbox" data-speck="${s.k}" ${chosen.has(s.k) ? "checked" : ""}> <span>${label(s)}${s.unit ? ` [${esc(s.unit)}]` : ""}${s.extra ? ` <em class="tag book">ce book</em>` : ""}</span>${s.extra ? `<button type="button" class="xdel" data-xdel="${s.k}" aria-label="Supprimer la ligne">×</button>` : ""}</label>
          ${resolved.map((m, i) => cell(m, i, s)).join("")}`).join("")}
      </div>
      <div class="tbl-actions"><button class="btn small" type="button" id="addSpec">+ Ajouter une caractéristique</button></div>
      <small>Les valeurs viennent du Catalogue Builder. Tu peux les modifier ici : la case passe en orange, et le site te propose de l'enregistrer aussi dans le catalogue. ↺ = revenir à la valeur du catalogue.</small></div>`;
}

// camelCase anglais pour la clé d'une nouvelle caractéristique (ex. « Chain speed » → chainSpeed)
function specKeyFrom(label, taken) {
  const w = String(label).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 ]+/g, " ").trim().split(/\s+/).filter(Boolean);
  let k = w.map((x, i) => (i ? x[0].toUpperCase() + x.slice(1).toLowerCase() : x.toLowerCase())).join("") || "spec";
  if (/^\d/.test(k)) k = "x" + k;
  k = k.slice(0, 36);
  let out = k, i = 2;
  while (taken.has(out)) out = k + i++;
  return out;
}

// une valeur modifiée pour une machine du catalogue : proposer de l'enregistrer aussi dans le catalogue
function askCatalogueValue(mk, k) {
  const b = S.ed.book, i = b.machines.findIndex((m) => mKey(m) === mk), m = b.machines[i];
  const val = b.specEdits?.[mk]?.[k];
  if (!m?.catId || val === undefined) return;
  const spec = famSpecs(b).find((s) => s.k === k) || { k, label: k };
  const lab = b.specLabels?.[k] || (spec.extra ? spec.label : specLabel(b.lang, spec));
  const cat = S.cat.machines.find((x) => x.id === m.catId)?.specs?.[k];
  dialog(`<h2 id="dlgTitle">Ajouter aussi au catalogue ?</h2>
    <p><b>${esc(lab)}</b> · ${esc(m.name)} : <b>${esc(val)}</b>${cat ? ` (catalogue : ${esc(cat)})` : " (vide dans le catalogue)"}.</p>
    <p class="muted">${spec.extra ? `La ligne « ${esc(lab)} » n'existe pas encore dans le catalogue : elle sera ajoutée à la famille, pour toutes les machines ${esc(techName(b.tech).toLowerCase())}. ` : ""}Dans le catalogue, la valeur apparaîtra aussi dans les tableaux du Pocket Guide et dans tous les books de cette machine.</p>
    <div class="dlg-actions"><button class="btn" data-act="book" type="button">Seulement dans ce book</button><button class="btn primary" data-act="cat" type="button">Oui, l'enregistrer dans le catalogue</button></div>`,
  async (act, _b, d) => {
    d.close();
    if (act !== "cat") return;
    try {
      if (spec.extra) await pushFieldToCatalogue(spec);
      await S.api.catSpec(m.catId, k, val);
      const cm = S.cat.machines.find((x) => x.id === m.catId); if (cm) { cm.specs = cm.specs || {}; cm.specs[k] = val; }
      delete b.specEdits[mk][k];
      rerender(); markDirty();
      toast(`Enregistré dans le Catalogue Builder : ${lab} — ${m.name} = ${val}.`, 5000);
    } catch (e) { toast(e instanceof Conflict ? "Le catalogue a été modifié entre-temps : recharge la page et recommence." : "Catalogue non modifié : " + e.message, 7000); }
  });
}
// ligne ajoutée dans le book → famille du catalogue (libellé anglais)
async function pushFieldToCatalogue(spec) {
  const b = S.ed.book;
  await S.api.catField(b.family, b.tech, spec.k, spec.labelEn || spec.label, spec.unit || "");
  const fam = S.cat.structure?.families?.find((f) => f.id === b.family);
  if (fam && !fam.specs.some((x) => x.k === spec.k)) fam.specs.push({ k: spec.k, label: spec.labelEn || spec.label, unit: spec.unit || "", techs: [b.tech], table: true, card: true, header: [] });
  b.specLabels = { ...(b.specLabels || {}), [spec.k]: spec.label };
  b.extraSpecs = (b.extraSpecs || []).filter((x) => x.k !== spec.k);
}

function addSpecDialog() {
  const b = S.ed.book, res = resolveBook(b, S.cat, sharedDocs()).machines;
  dialog(`<h2 id="dlgTitle">Ajouter une caractéristique</h2>
    <div class="row2"><div><label for="asLab">Libellé (${esc((b.lang || "fr").toUpperCase())})</label><input id="asLab" placeholder="ex. Vitesse de chaîne"></div>
    <div><label for="asUnit">Unité</label><input id="asUnit" placeholder="ex. m/s"></div></div>
    <label for="asEn" style="margin-top:10px">Libellé anglais (pour le catalogue)</label><input id="asEn" placeholder="ex. Chain speed">
    <div class="spec-add">${res.map((m, i) => `<label for="asV${i}">${esc(m.name)}</label><input id="asV${i}" placeholder="valeur (source fiable)">`).join("")}</div>
    <p class="muted">Ajouter aussi cette ligne au Catalogue Builder ? Elle sera ajoutée à la famille pour toutes les machines ${esc(techName(b.tech).toLowerCase())}, et les valeurs des machines du catalogue y seront enregistrées.</p>
    <div class="dlg-actions"><button class="btn" data-act="close" type="button">Annuler</button><button class="btn" data-act="book" type="button">Ajouter à ce book seulement</button><button class="btn primary" data-act="cat" type="button">Ajouter au book et au catalogue</button></div>`,
  async (act, _b, d) => {
    if (act === "close") return d.close();
    const label = $("asLab").value.trim(), unit = $("asUnit").value.trim(), labelEn = $("asEn").value.trim() || label;
    if (!label) { $("asLab").focus(); return; }
    const taken = new Set(famSpecs(b).map((x) => x.k));
    const spec = { k: specKeyFrom(labelEn, taken), label, unit, labelEn };
    const vals = res.map((_, i) => $("asV" + i).value.trim());
    d.close();
    b.extraSpecs = [...(b.extraSpecs || []), spec];
    if (b.specKeys?.length) b.specKeys = [...b.specKeys, spec.k];
    b.specEdits = b.specEdits || {};
    vals.forEach((v, i) => {
      if (!v) return;
      const m = b.machines[i];
      if (m.catId) { const mk = mKey(m); b.specEdits[mk] = { ...(b.specEdits[mk] || {}), [spec.k]: v }; }
      else { m.specs = { ...(m.specs || {}), [spec.k]: v }; }
    });
    if (act === "cat") {
      try {
        await pushFieldToCatalogue(spec);
        for (const [i, v] of vals.entries()) {
          const m = b.machines[i]; if (!v || !m.catId) continue;
          await S.api.catSpec(m.catId, spec.k, v);
          const cm = S.cat.machines.find((x) => x.id === m.catId); if (cm) { cm.specs = cm.specs || {}; cm.specs[spec.k] = v; }
          delete b.specEdits[mKey(m)][spec.k];
        }
        toast(`« ${label} » ajoutée au book et au Catalogue Builder.`, 5000);
      } catch (e) { toast((e instanceof Conflict ? "Le catalogue a été modifié entre-temps" : "Catalogue non modifié : " + e.message) + " — la ligne reste dans ce book.", 7000); }
    } else toast(`« ${label} » ajoutée à ce book seulement.`);
    rerender(); markDirty();
  });
}

function renderForm() {
  const b = S.ed.book;
  $("edTitle").textContent = resolveBook(b, S.cat, sharedDocs()).machines.map((m) => m.name).join(" / ") + ` · ${(b.lang || "fr").toUpperCase()}`;
  const sec = (id, title, body, open) => `<details class="sec" data-sec="${id}" ${open || S.ed.open?.has(id) ? "open" : ""}><summary>${title}</summary><div class="sec-body">${body}</div></details>`;
  $("edForm").innerHTML =
    sec("mach", "Machines et caractéristiques", machinesSection(), true) +
    sec("feat", "Page 1 · Fonction spécifique", field("Titre", "feature.title", { max: 40 }) + field("Texte", "feature.text", { area: true, max: 170, rows: 4 }) + field("Mention (ex. modèle concerné)", "feature.note", { max: 40 }) + photo("Photo de détail", "feature.photo")) +
    sec("cible", "Page 1 · Groupe cible, applications, argus", lines("Groupe cible principal (2 à 4)", "targets") + lines("Applications (2 à 4)", "applications") + lines("Argus (4 à 6, bénéfice client d'abord)", "argus", { rows: 6 })) +
    sec("acc", "Page 1 · Accessoires (photos)", table("Accessoires inclus (4 max.)", "accIncluded", [{ k: "name", label: "Nom" }]) + photosOf("accIncluded") +
      `<label class="chk"><input type="checkbox" data-path="showOptional" data-rerender="1" ${b.showOptional ? "checked" : ""}> Afficher « Accessoires (en option) »</label>` +
      (b.showOptional || (b.accOptional || []).length ? table("Accessoires en option (3 max.)", "accOptional", [{ k: "name", label: "Nom" }]) + photosOf("accOptional") : "")) +
    sec("p2", "Page 2 · Après-vente", `<label class="chk"><input type="checkbox" data-path="hide.apresVente" data-inv="1" data-rerender="1" ${b.hide.apresVente ? "" : "checked"}> Inclure la page 2</label>` +
      sharedSel("maintenance", "Intervalles de maintenance") + (b.shared.maintenance ? "" : table("Intervalles de maintenance", "maintenance", [{ k: "op", label: "Opération", w: "1.4fr" }, { k: "interval", label: "Intervalle" }])) +
      (b.tech === "battery" ? sharedSel("batteryReco", "Recommandations batterie") + (b.shared.batteryReco ? "" : lines("Recommandations batterie", "batteryReco", { help: "Une ligne = une recommandation." })) : "") +
      table("Pièces de rechange à forte rotation", "parts", [{ k: "ref", label: "N° d'article" }, { k: "desc", label: "Description", w: "1.4fr" }, { k: "model", label: "Modèle", w: ".7fr" }], { help: "Plus de 18 lignes : texte réduit, puis page « (suite) » automatique." }) +
      sharedSel("consumables", "Consommables") + (b.shared.consumables ? "" : table("Consommables", "consumables", [{ k: "ref", label: "N° d'article" }, { k: "desc", label: "Description", w: "1.4fr" }, { k: "model", label: "Modèle", w: ".7fr" }])) +
      lines("Checklist pré-livraison (7 max.)", "checklist", { help: "Une ligne = un contrôle." }) + photo("Photo à côté de la checklist (vide = photo de la machine)", "checklistPhoto")) +
    sec("p3", "Page 3 · Accessoires et calendrier", `<label class="chk"><input type="checkbox" data-path="hide.accessoires" data-inv="1" data-rerender="1" ${b.hide.accessoires ? "" : "checked"}> Inclure la page 3</label>` +
      table("Accessoires", "accessories", [{ k: "ref", label: "N° d'article" }, { k: "desc", label: "Description", w: "1.4fr" }, { k: "model", label: "Modèle", w: ".7fr" }]) +
      sharedSel("epi", "EPI ajoutés à la fin du tableau") +
      calendarField());
  S.ed.open = S.ed.open || new Set(["mach"]);
}
function photosOf(path) {
  const rows = getPath(S.ed.book, path) || [];
  return rows.map((r, i) => photo(`Photo · ${esc(r.name || "accessoire " + (i + 1))}`, `${path}.${i}.photo`)).join("");
}
function calendarField() {
  const v = (S.ed.book.calendar?.rows || []).map((r) => (r.group ? "# " : "") + r.label).join("\n");
  return `<div class="fld"><label for="f-cal">Calendrier d'application : usages</label><textarea id="f-cal" data-cal="1" rows="6" placeholder="# Travail du sol&#10;Labour superficiel">${esc(v)}</textarea>
    <small>Une ligne = un usage ; « # » au début = titre de groupe. Les 12 mois restent vides : le client les coche. Vide = 6 lignes vierges.</small></div>`;
}

// ----- événements du formulaire (délégués)
document.addEventListener("input", (e) => {
  if (!S.ed || !e.target.closest("#edForm")) return;
  const t = e.target, b = S.ed.book;
  if (t.dataset.cspec) {
    const [mk, k] = t.dataset.cspec.split("|"), m = b.machines.find((x) => mKey(x) === mk);
    const cat = S.cat.machines.find((x) => x.id === m?.catId)?.specs?.[k] ?? "";
    b.specEdits = b.specEdits || {}; b.specEdits[mk] = b.specEdits[mk] || {};
    if (t.value.trim() === String(cat) || (!t.value.trim() && !cat)) delete b.specEdits[mk][k]; else b.specEdits[mk][k] = t.value.trim();
    t.classList.toggle("edited", b.specEdits[mk][k] !== undefined);
  } else if (t.dataset.path && t.type !== "checkbox" && t.tagName !== "SELECT") {
    setPath(b, t.dataset.path, t.value);
    const c = document.querySelector(`[data-cnt="${t.dataset.path}"]`);
    if (c) { c.textContent = `${t.value.length}/${c.dataset.max}`; c.classList.toggle("over", t.value.length > +c.dataset.max); }
  } else if (t.dataset.lines) setPath(b, t.dataset.lines, t.value.split("\n").map((s) => s.trim()).filter(Boolean));
  else if (t.dataset.cal) b.calendar = { rows: t.value.split("\n").map((s) => s.trim()).filter(Boolean).map((s) => (s.startsWith("#") ? { label: s.replace(/^#+\s*/, ""), group: true } : { label: s })) };
  else return;
  markDirty();
});
document.addEventListener("change", async (e) => {
  if (!S.ed || !e.target.closest("#edForm")) return;
  const t = e.target, b = S.ed.book;
  if (t.dataset.photo && t.files?.[0]) return uploadPhoto(t.dataset.photo, t.files[0]);
  if (t.dataset.cspec) { const [mk, k] = t.dataset.cspec.split("|"); rerender(); if (b.specEdits?.[mk]?.[k] !== undefined) askCatalogueValue(mk, k); return; }
  if (t.dataset.speck) {
    const all = famSpecs(b).map((s) => s.k);
    const cur = new Set(b.specKeys?.length ? b.specKeys : all);
    t.checked ? cur.add(t.dataset.speck) : cur.delete(t.dataset.speck);
    b.specKeys = all.filter((k) => cur.has(k));
    if (b.specKeys.length > 9) toast("Plus de 9 caractéristiques : seules les 9 premières renseignées seront affichées.");
  } else if (t.dataset.path && (t.type === "checkbox" || t.tagName === "SELECT")) {
    setPath(b, t.dataset.path, t.type === "checkbox" ? (t.dataset.inv ? !t.checked : t.checked) : t.value);
  } else return;
  if (t.dataset.rerender) rerender();
  markDirty();
});
document.addEventListener("click", async (e) => {
  if (!S.ed || !e.target.closest("#edForm")) return;
  const t = e.target.closest("button"); if (!t) return;
  const b = S.ed.book, d = t.dataset;
  const arr = (p) => { const ks = p.split("."); const i = +ks.pop(); return [getPath(b, ks.join(".")), i]; };
  if (d.add) { const a = getPath(b, d.add) || []; a.push(Object.fromEntries(d.cols.split(",").map((k) => [k, ""]))); setPath(b, d.add, a); }
  else if (d.del) { const [a, i] = arr(d.del); a.splice(i, 1); }
  else if (d.up) { const [a, i] = arr(d.up); if (i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]]; }
  else if (d.paste) return pasteDialog(d.paste, d.cols.split(","));
  else if (d.clear) setPath(b, d.clear, null);
  else if (d.mdel !== undefined) { if (b.machines.length < 2) { toast("Un book garde au moins une machine."); return; } b.machines.splice(+d.mdel, 1); b.specKeys = b.specKeys || []; }
  else if (d.mup !== undefined) { const i = +d.mup; [b.machines[i - 1], b.machines[i]] = [b.machines[i], b.machines[i - 1]]; }
  else if (t.id === "addMachine") return addMachineDialog();
  else if (t.id === "addSpec") return addSpecDialog();
  else if (d.crevert) { const [mk, k] = d.crevert.split("|"); delete b.specEdits?.[mk]?.[k]; }
  else if (d.xdel) {
    if (!confirm("Supprimer cette ligne de ce book ?")) return;
    b.extraSpecs = (b.extraSpecs || []).filter((x) => x.k !== d.xdel);
    b.specKeys = (b.specKeys || []).filter((k) => k !== d.xdel);
    for (const e of Object.values(b.specEdits || {})) delete e[d.xdel];
    for (const m of b.machines) if (m.specs) delete m.specs[d.xdel];
  }
  else return;
  rerender(); markDirty();
});
document.addEventListener("toggle", (e) => { const s = e.target.closest?.("details.sec"); if (s && S.ed) s.open ? S.ed.open.add(s.dataset.sec) : S.ed.open.delete(s.dataset.sec); }, true);
document.addEventListener("dragover", (e) => { if (e.target.closest?.("[data-drop]")) e.preventDefault(); });
document.addEventListener("drop", (e) => { const z = e.target.closest?.("[data-drop]"); if (!z || !S.ed) return; e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) uploadPhoto(z.dataset.drop, f); });

function rerender() { const y = scrollY; renderForm(); scrollTo(0, y); }

async function uploadPhoto(path, file) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast("Format non accepté : PNG, JPEG ou WebP."); return; }
  try {
    toast("Préparation de la photo…", 8000);
    const { blob, w, h } = await prepareImage(file);
    const key = await S.api.upload(blob);
    setPath(S.ed.book, path, key);
    rerender(); markDirty();
    toast(`Photo ajoutée (${w} × ${h} px).`);
  } catch (e) { toast("Envoi de la photo impossible : " + e.message); }
}

function pasteDialog(path, cols) {
  dialog(`<h2 id="dlgTitle">Coller depuis Excel</h2><p class="muted">Copie les lignes dans Excel (colonnes : ${cols.join(", ")}) puis colle-les ici. Elles s'ajoutent à la fin du tableau.</p>
    <textarea id="pasteBox" rows="8" aria-label="Lignes à coller"></textarea>
    <div class="dlg-actions"><button class="btn" data-act="close" type="button">Annuler</button><button class="btn primary" data-act="ok" type="button">Ajouter</button></div>`,
  (act, _b, d) => {
    if (act === "close") d.close();
    if (act === "ok") {
      const rows = $("pasteBox").value.split(/\r?\n/).filter((l) => l.trim()).map((l) => { const c = l.split("\t"); return Object.fromEntries(cols.map((k, i) => [k, (c[i] || "").trim()])); });
      setPath(S.ed.book, path, [...(getPath(S.ed.book, path) || []), ...rows]);
      d.close(); rerender(); markDirty(); toast(`${rows.length} ligne(s) ajoutée(s).`);
    }
  });
}

function addMachineDialog() {
  const b = S.ed.book, used = new Set(b.machines.map((m) => m.catId).filter(Boolean));
  const ms = S.cat.machines.filter((m) => m.family === b.family && m.tech === b.tech && !used.has(m.id));
  dialog(`<h2 id="dlgTitle">Ajouter une machine</h2><p class="muted">Même famille et même technologie : ${esc(famName(b.family))} · ${esc(techName(b.tech))}.</p>
    <ul class="pick">${ms.map((m) => `<li><button class="btn small" type="button" data-act="cat" data-id="${esc(m.id)}">${esc(m.name)}</button></li>`).join("") || `<li class="muted">Aucune autre machine de ce type dans le catalogue.</li>`}</ul>
    <label for="amName">Ou machine hors catalogue</label><input id="amName" placeholder="Nom de la machine">
    <div class="dlg-actions"><button class="btn" data-act="close" type="button">Annuler</button><button class="btn primary" data-act="free" type="button">Ajouter hors catalogue</button></div>`,
  (act, btn, d) => {
    if (act === "close") return d.close();
    if (act === "cat") { const m = S.cat.machines.find((x) => x.id === btn.dataset.id); b.machines.push({ catId: m.id, name: m.name }); }
    else if (act === "free") { const n = $("amName").value.trim(); if (!n) return; b.machines.push({ name: n, family: b.family, tech: b.tech, specs: {}, images: { main: null } }); }
    else return;
    d.close(); rerender(); markDirty();
  });
}

// ----- aperçu et contrôle
async function refresh() {
  if (!S.ed) return;
  let book, res;
  try {
    book = resolveBook(S.ed.book, S.cat, sharedDocs());
    res = await S.studio.build(book, S.cat);
  } catch (err) { showError(err); return; }
  if (!S.ed) return;
  S.ed.res = res; S.ed.resolved = book;
  const lvl = (n) => { const l = res.issues.filter((x) => x.page === n).map((x) => x.level); return l.includes("error") ? "err" : l.includes("warn") ? "warn" : "ok"; };
  $("preview").innerHTML = res.pages.map((p) => {
    const flagged = new Set(res.issues.filter((x) => x.page === p.n && x.level === "error").map((x) => x.block));
    return `<div class="sheet ${lvl(p.n) === "err" ? "has-err" : ""}" id="page-${p.n}" style="aspect-ratio:${res.page.w}/${res.page.h}"><div class="scaler">${S.studio.pageHtml(p, flagged)}</div><span class="num">Page ${p.n}</span></div>`;
  }).join("");
  fit();
  const c = { error: 0, warn: 0, info: 0 }; res.issues.forEach((x) => c[x.level]++);
  const order = { error: 0, warn: 1, info: 2 }, label = { error: "Bloquant", warn: "À vérifier", info: "Info" };
  $("qcBadge").textContent = c.error ? `(${c.error})` : "";
  $("qcBox").innerHTML = `<h2>Contrôle qualité</h2><ol class="pages">${res.pages.map((p) => `<li><a href="#page-${p.n}" class="${lvl(p.n)}" data-goto="${p.n}"><span class="dot"></span>Page ${p.n}</a></li>`).join("")}</ol>
    <p class="qcsum">${c.error} bloquant(s) · ${c.warn} à vérifier · ${c.info} info</p>
    <details ${c.error ? "open" : ""}><summary>Voir le détail</summary>${res.issues.slice().sort((a, b) => order[a.level] - order[b.level] || a.page - b.page).map((x) => `<div class="issue ${x.level}"><span class="lv">${label[x.level]}</span><span class="where">p. ${x.page} · ${esc(x.block)}</span><br>${esc(x.msg)}</div>`).join("")}</details>`;
  $("qcBox").querySelectorAll("[data-goto]").forEach((a) => (a.onclick = (ev) => { ev.preventDefault(); document.getElementById("page-" + a.dataset.goto)?.scrollIntoView({ behavior: "smooth" }); }));
  if (!S.ed.dirty) $("edState").textContent = `Enregistré · version ${S.ed.ver}`;
}
function fit() {
  for (const sh of document.querySelectorAll(".sheet")) {
    const sc = sh.querySelector(".scaler"), pg = sc.firstElementChild;
    if (pg && sh.clientWidth) sc.style.transform = `scale(${sh.clientWidth / pg.offsetWidth})`;
  }
}
addEventListener("resize", fit);

// ----- enregistrement, versions, exports
async function save(force) {
  const e = S.ed, b = e.book;
  if (b.status === "valid" && e.res?.issues.some((x) => x.level === "error")) { toast("Statut « Validé » impossible : il reste des défauts bloquants (voir Contrôle)."); return; }
  b.updatedAt = new Date().toISOString();
  try {
    const r = await S.api.save("book:" + e.id, b, force ?? e.ver);
    e.ver = r.ver; e.saved = JSON.stringify(b); e.dirty = false;
    S.docs["book:" + e.id] = { v: JSON.parse(e.saved), ver: r.ver, t: r.t };
    $("edState").classList.remove("warn");
    $("edState").textContent = `Enregistré · version ${e.ver}`;
    toast("Book enregistré.");
    refresh();
  } catch (err) {
    if (err instanceof Conflict) {
      dialog(`<h2 id="dlgTitle">Quelqu'un a modifié ce book entre-temps</h2><p>Ta version n'a pas été enregistrée, rien n'a été écrasé.</p>
        <div class="dlg-actions"><button class="btn" data-act="reload" type="button">Charger la version en ligne (perdre mes changements)</button><button class="btn primary" data-act="mine" type="button">Garder la mienne (remplacer)</button></div>`,
      async (act, _b, d) => {
        d.close();
        const fresh = (await S.api.data()).docs; S.docs = fresh;
        if (act === "reload") { S.ed = null; openEditor(e.id); }
        if (act === "mine") save(fresh["book:" + e.id]?.ver || 0);
      });
    } else toast("Enregistrement impossible : " + err.message);
  }
}

async function exporter(kind) {
  const e = S.ed; if (!e.res) return;
  const err = e.res.issues.filter((x) => x.level === "error").length;
  try {
    toast(`Export ${kind.toUpperCase()}…`, 10000);
    const t0 = performance.now();
    const f = await S.studio[kind](e.resolved, e.res);
    download(f);
    toast(`${f.name} exporté en ${((performance.now() - t0) / 1000).toFixed(1)} s${err ? ` · ${err} défaut(s) bloquant(s) signalé(s)` : ""}.`, 6000);
  } catch (x) { toast("Export impossible : " + x.message); }
}

function moreDialog() {
  const e = S.ed, other = e.book.lang === "en" ? "fr" : "en";
  dialog(`<h2 id="dlgTitle">Autres actions</h2><div class="menu">
    <button class="btn" data-act="dup" type="button">Dupliquer ce book</button>
    <button class="btn" data-act="tr" type="button">Créer la version ${other.toUpperCase()} (copie à traduire)</button>
    <button class="btn" data-act="hist" type="button">Historique et restauration</button>
    <button class="btn danger" data-act="del" type="button">Supprimer ce book</button></div>
    <div class="dlg-actions"><button class="btn" data-act="close" type="button">Fermer</button></div>`,
  async (act, _b, d) => {
    if (act === "close") return d.close();
    if (act === "dup" || act === "tr") {
      if (e.dirty) { toast("Enregistre d'abord tes modifications."); return; }
      const c = JSON.parse(JSON.stringify(e.book)); c.status = "draft";
      if (act === "tr") c.lang = other;
      c.id = newId(resolveBook(c, S.cat, sharedDocs()).machines.map((m) => m.name), c.lang);
      d.close(); S.ed = null; await createBook(c); toast(act === "tr" ? `Copie ${other.toUpperCase()} créée : les textes saisis sont à traduire.` : "Copie créée.");
    }
    if (act === "hist") return historyDialog();
    if (act === "del") {
      if (!confirm("Supprimer ce book ? Il reste récupérable dans l'historique de la base.")) return;
      await S.api.remove("book:" + e.id, e.ver); delete S.docs["book:" + e.id]; S.ed = null; d.close(); location.hash = "#/books"; toast("Book supprimé.");
    }
  });
}
async function historyDialog() {
  const e = S.ed, { entries } = await S.api.history("book:" + e.id);
  dialog(`<h2 id="dlgTitle">Historique</h2>${entries.length ? `<ul class="hist">${entries.map((h, i) => `<li><span>${esc(fmtDate(h.t))} · ${h.action === "suppression" ? "avant suppression" : "version précédente"} · ${esc(STATUS[h.avant?.status] || "")}</span><button class="btn small" data-act="r" data-i="${i}" type="button">Restaurer</button></li>`).join("")}</ul>` : `<p class="muted">Aucune version précédente.</p>`}
    <div class="dlg-actions"><button class="btn" data-act="close" type="button">Fermer</button></div>`,
  (act, btn, d) => {
    if (act === "close") return d.close();
    if (act === "r") { const v = entries[+btn.dataset.i].avant; S.ed.book = JSON.parse(JSON.stringify(v)); S.ed.book.shared = S.ed.book.shared || {}; S.ed.book.hide = S.ed.book.hide || {}; d.close(); renderForm(); $("edStatus").value = S.ed.book.status || "draft"; markDirty(); toast("Version chargée : enregistre pour la rétablir."); }
  });
}

// ---------------------------------------------------------------- blocs partagés
// Chaque bloc s'édite sous la forme qu'il a dans le digital book : un tableau avec les mêmes colonnes et le même en-tête.
const SH_COLS = {
  maintenance: [{ k: "op", label: "Opération", w: "1.4fr" }, { k: "interval", label: "Intervalle" }],
  batteryReco: [{ k: "text", label: "Recommandations" }],
  consumables: [{ k: "ref", label: "Numéro d'article" }, { k: "desc", label: "Description", w: "1.4fr" }, { k: "model", label: "Modèle", w: ".7fr" }],
  accessories: [{ k: "ref", label: "Numéro d'article" }, { k: "desc", label: "Description", w: "1.4fr" }, { k: "model", label: "Modèle", w: ".7fr" }],
};
const SH_PAGE = { maintenance: "Page 2 · Intervalles de maintenance", batteryReco: "Page 2 · Recommandations batterie", consumables: "Page 2 · Consommables", accessories: "Page 3 · Accessoires (ajoutés à la fin du tableau)" };
function shRows(id) {
  const def = SHARED[id], doc = S.docs["shared:" + id];
  const rows = doc?.v.rows ?? def.rows;
  return def.kind === "batteryReco" ? rows.map((t) => ({ text: t })) : rows.map((r) => ({ ...r }));
}
function viewShared() {
  S.sh = S.sh || {};
  for (const id of Object.keys(SHARED)) if (!S.sh[id]) S.sh[id] = { rows: shRows(id), dirty: false };
  const used = (id) => books().filter((b) => Object.values(b.v.shared || {}).includes(id)).length;
  const card = (id) => {
    const def = SHARED[id], doc = S.docs["shared:" + id], cols = SH_COLS[def.kind], st = S.sh[id];
    return `<section class="sh-card" data-id="${id}"><h2>${esc(def.title)}</h2>
      <p class="muted">${esc(SH_PAGE[def.kind])} · utilisé par ${used(id)} book(s) · ${doc ? `version ${doc.ver}` : "pas encore enregistré"}</p>
      <div class="tbl-ed book-look" style="--cols:${cols.map((c) => c.w || "1fr").join(" ")} 64px">
        <div class="tr th">${cols.map((c) => `<span>${esc(c.label)}</span>`).join("")}<span></span></div>
        ${st.rows.map((r, i) => `<div class="tr">${cols.map((c) => `<input aria-label="${esc(c.label)} ${i + 1}" data-shp="${id}.${i}.${c.k}" value="${esc(r[c.k])}">`).join("")}
          <span class="rbtn"><button type="button" data-shup="${id}.${i}" aria-label="Monter">↑</button><button type="button" data-shdel="${id}.${i}" aria-label="Supprimer">×</button></span></div>`).join("") || `<div class="tr empty-row"><span>Aucune ligne : ajoute-en une, ou colle-les depuis Excel.</span></div>`}
      </div>
      <div class="tbl-actions"><button class="btn small" type="button" data-shadd="${id}">+ Ligne</button><button class="btn small" type="button" data-shpaste="${id}">Coller depuis Excel</button>
        <button class="btn primary small" type="button" data-shsave="${id}">Enregistrer</button><span class="muted sh-state" data-shstate="${id}">${st.dirty ? "Modifications non enregistrées" : ""}</span></div></section>`;
  };
  $("view").innerHTML = `<div class="head-row"><h1>Blocs partagés</h1></div><p class="muted">Un bloc partagé se modifie une fois ici et se met à jour dans tous les books qui l'utilisent (au prochain aperçu ou export). Chaque bloc a les mêmes colonnes que dans le digital book.</p>
    <div class="shared">${Object.keys(SHARED).map(card).join("")}</div>`;
  const v = $("view");
  const dirty = (id) => { S.sh[id].dirty = true; const e = v.querySelector(`[data-shstate="${id}"]`); if (e) e.textContent = "Modifications non enregistrées"; };
  v.oninput = (e) => { const p = e.target.dataset.shp; if (!p) return; const [id, i, k] = p.split("."); S.sh[id].rows[+i][k] = e.target.value; dirty(id); };
  v.onclick = async (e) => {
    const t = e.target.closest("button"); if (!t) return;
    const d = t.dataset;
    if (d.shadd) { const cols = SH_COLS[SHARED[d.shadd].kind]; S.sh[d.shadd].rows.push(Object.fromEntries(cols.map((c) => [c.k, ""]))); dirty(d.shadd); return viewShared(); }
    if (d.shdel || d.shup) { const [id, i] = (d.shdel || d.shup).split("."), rows = S.sh[id].rows, n = +i; if (d.shdel) rows.splice(n, 1); else if (n > 0) [rows[n - 1], rows[n]] = [rows[n], rows[n - 1]]; dirty(id); return viewShared(); }
    if (d.shpaste) {
      const id = d.shpaste, cols = SH_COLS[SHARED[id].kind];
      return dialog(`<h2 id="dlgTitle">Coller depuis Excel</h2><p class="muted">Copie les lignes dans Excel (colonnes : ${cols.map((c) => c.label).join(" · ")}) puis colle-les ici. Elles s'ajoutent à la fin du tableau.</p>
        <textarea id="pasteBox" rows="8" aria-label="Lignes à coller"></textarea><div class="dlg-actions"><button class="btn" data-act="close" type="button">Annuler</button><button class="btn primary" data-act="ok" type="button">Ajouter</button></div>`,
      (act, _b, dl) => {
        if (act === "close") return dl.close();
        const rows = $("pasteBox").value.split(/\r?\n/).filter((l) => l.trim()).map((l) => { const c = l.split("\t"); return Object.fromEntries(cols.map((x, i) => [x.k, (c[i] || "").trim()])); });
        S.sh[id].rows.push(...rows); S.sh[id].dirty = true; dl.close(); viewShared(); toast(`${rows.length} ligne(s) ajoutée(s).`);
      });
    }
    if (d.shsave) {
      const id = d.shsave, def = SHARED[id], cur = S.docs["shared:" + id];
      const clean = S.sh[id].rows.filter((r) => Object.values(r).some((x) => String(x).trim()));
      const rows = def.kind === "batteryReco" ? clean.map((r) => r.text.trim()) : clean.map((r) => Object.fromEntries(Object.entries(r).map(([k, x]) => [k, String(x).trim()])));
      try {
        const r = await S.api.save("shared:" + id, { title: def.title, kind: def.kind, rows }, cur?.ver || 0);
        S.docs["shared:" + id] = { v: { title: def.title, kind: def.kind, rows }, ver: r.ver, t: r.t };
        S.sh[id] = { rows: shRows(id), dirty: false };
        toast("Bloc partagé enregistré."); viewShared();
      } catch (err) { toast(err instanceof Conflict ? "Modifié entre-temps par quelqu'un d'autre : recharge la page." : "Enregistrement impossible : " + err.message); }
    }
  };
}

// ---------------------------------------------------------------- connexion
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: $("pw").value }) });
  if (r.ok) { $("login").hidden = true; start(); }
  else $("loginErr").textContent = (await r.json().catch(() => ({}))).error || "Connexion impossible.";
});
start().catch((e) => { $("view").innerHTML = `<p class="err">Erreur au démarrage : ${esc(e.message)}</p>`; });

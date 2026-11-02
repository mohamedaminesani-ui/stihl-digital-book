// Étape 2 : machine pilote — aperçu identique à l'export, contrôle qualité, export PPTX et PDF dans le navigateur.
// L'éditeur complet (formulaires par bloc, bibliothèque, versions, rôles) arrive à l'étape 3.
import { createStudio, download } from "./studio.js";

const $ = (id) => document.getElementById(id);
const S = { mode: "api", catalogue: null, books: [], book: null, res: null, studio: null };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const status = (t) => { $("status").textContent = t; };

async function getJson(url) {
  const r = await fetch(url, { credentials: "same-origin" });
  const ct = r.headers.get("Content-Type") || "";
  if (!ct.includes("json")) { const e = new Error("pas une API"); e.status = 0; throw e; }
  const j = await r.json();
  if (!r.ok) { const e = new Error(j.error || r.statusText); e.status = r.status; throw e; }
  return j;
}

// Exemples livrés avec le site : le pilote MSA 220 C-B et la fiche MH 610/710 reconstruite
const SAMPLES = ["book-msa-220-c-b.json", "book-mh-610-710.json"];

async function start() {
  try {
    S.catalogue = await getJson("/api/catalogue");
    // machines du catalogue : photos servies par /cat-img/
    for (const m of S.catalogue.machines || []) if (m.images?.main) m.images.main = "cat:" + m.images.main;
    const data = await getJson("/api/data");
    S.books = Object.entries(data.docs).filter(([k]) => k.startsWith("book:")).map(([k, d]) => ({ id: k.slice(5), v: d.v, ver: d.ver }));
    $("mode").textContent = "Données : Catalogue Builder";
  } catch (e) {
    if (e.status === 401) { $("login").hidden = false; $("pw").focus(); return; }
    S.mode = "demo";
    S.catalogue = await getJson("samples/catalogue.json");
    $("mode").textContent = "Mode démonstration (exemples intégrés)";
  }
  for (const f of SAMPLES) { const v = await getJson("samples/" + f); S.books.push({ id: v.id, v, sample: true }); }
  $("app").hidden = false;
  $("bookSel").innerHTML = S.books.map((b, i) => `<option value="${i}">${esc((b.v.machines || []).map((m) => m.name).join(" / ") || b.id)}${b.sample ? " (exemple)" : ""}</option>`).join("");
  status("Chargement des polices…");
  S.studio = await createStudio();
  await select(0);
}

async function select(i) {
  const b = S.books[+i];
  S.book = JSON.parse(JSON.stringify(b.v));
  S.book.lang = $("langSel").value;
  await refresh();
}

async function refresh() {
  const t0 = performance.now();
  S.res = await S.studio.build(S.book, S.catalogue);
  renderPreview();
  renderQc();
  status(`Aperçu calculé en ${Math.round(performance.now() - t0)} ms — ${S.res.pages.length} pages.`);
}

function pageLevel(n) {
  const l = S.res.issues.filter((x) => x.page === n).map((x) => x.level);
  return l.includes("error") ? "err" : l.includes("warn") ? "warn" : "ok";
}

function renderPreview() {
  const box = $("preview");
  box.innerHTML = S.res.pages.map((p) => {
    const flagged = new Set(S.res.issues.filter((x) => x.page === p.n && x.level === "error").map((x) => x.block));
    return `<div class="sheet ${pageLevel(p.n) === "err" ? "has-err" : ""}" id="page-${p.n}" style="aspect-ratio:${S.res.page.w}/${S.res.page.h}">
      <div class="scaler">${S.studio.pageHtml(p, flagged)}</div><span class="num">Page ${p.n}</span></div>`;
  }).join("");
  fit();
}
// mise à l'échelle : la page (mm) occupe toute la largeur disponible
function fit() {
  for (const sh of document.querySelectorAll(".sheet")) {
    const sc = sh.querySelector(".scaler"), pg = sc.firstElementChild;
    sc.style.transform = `scale(${sh.clientWidth / pg.offsetWidth})`;
  }
}
addEventListener("resize", fit);

function renderQc() {
  const { issues, pages } = S.res;
  $("pagesList").innerHTML = pages.map((p) => { const l = pageLevel(p.n); return `<li><a href="#page-${p.n}" class="${l}"><span class="dot"></span>Page ${p.n}</a></li>`; }).join("");
  const order = { error: 0, warn: 1, info: 2 }, label = { error: "Bloquant", warn: "À vérifier", info: "Info" };
  const c = { error: 0, warn: 0, info: 0 }; issues.forEach((x) => c[x.level]++);
  $("qcList").innerHTML = `<p class="qcsum">${c.error} bloquant(s) · ${c.warn} à vérifier · ${c.info} info</p>` +
    issues.slice().sort((a, b) => order[a.level] - order[b.level] || a.page - b.page).map((x) =>
      `<div class="issue ${x.level}"><span class="lv">${label[x.level]}</span><span class="where">p. ${x.page} · ${esc(x.block)}</span><br>${esc(x.msg)}</div>`).join("");
}

async function exporter(kind) {
  const btns = [$("btnPptx"), $("btnPdf")];
  btns.forEach((b) => (b.disabled = true));
  try {
    status(`Export ${kind.toUpperCase()} en cours…`);
    const t0 = performance.now();
    const f = await S.studio[kind](S.book, S.res);
    download(f);
    const err = S.res.issues.filter((x) => x.level === "error").length;
    status(`${f.name} exporté en ${((performance.now() - t0) / 1000).toFixed(1)} s${err ? ` — attention : ${err} défaut(s) bloquant(s) signalé(s)` : ""}.`);
  } catch (e) {
    status("Export impossible : " + e.message);
  } finally { btns.forEach((b) => (b.disabled = false)); }
}

$("bookSel").addEventListener("change", (e) => select(e.target.value));
$("langSel").addEventListener("change", () => { S.book.lang = $("langSel").value; refresh(); });
$("btnPptx").addEventListener("click", () => exporter("pptx"));
$("btnPdf").addEventListener("click", () => exporter("pdf"));
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: $("pw").value }) });
  if (r.ok) { $("login").hidden = true; start(); }
  else $("loginErr").textContent = (await r.json().catch(() => ({}))).error || "Connexion impossible.";
});
start().catch((e) => status("Erreur : " + e.message));

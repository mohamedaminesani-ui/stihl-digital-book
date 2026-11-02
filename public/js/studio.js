// Studio : relie le moteur au navigateur (polices, template, photos, téléchargements). Aucune compilation.
import { loadFonts } from "./engine/fonts.js";
import { buildBook, bookFileName } from "./engine/layout.js";
import { renderPptx } from "./engine/render-pptx.js";
import { renderPdf } from "./engine/render-pdf.js";
import { renderPageHtml } from "./engine/render-html.js";
import { imageInfo } from "./engine/images.js";

const scripts = {};
function loadScript(src) {
  if (!scripts[src]) scripts[src] = new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = src; s.onload = ok; s.onerror = () => ko(new Error("Chargement impossible : " + src));
    document.head.appendChild(s);
  });
  return scripts[src];
}
const bytesOf = async (url) => {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`${url} : ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
};

// clé de photo → URL : « @logo », « cat:img/… » (catalogue), « img/… » (Digital Book), « mh/… » (exemples)
export function urlFor(key) {
  if (!key) return null;
  if (key === "@logo") return "template/logo.png";
  if (key.startsWith("cat:")) return "/cat-img/" + key.slice(4);
  if (key.startsWith("img/")) return "/" + key;
  return "samples/" + key;
}

export async function createStudio() {
  await loadScript("vendor/fontkit-1.1.1.umd.min.js");
  const F = await loadFonts(window.fontkit, (p) => bytesOf(p));
  const images = new Map(); // clé → { bytes, ext, w, h, url } | null

  async function toPng(bytes) { // WebP → PNG (le PDF n'accepte que PNG / JPEG)
    const bmp = await createImageBitmap(new Blob([bytes], { type: "image/webp" }));
    const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
    c.getContext("2d").drawImage(bmp, 0, 0);
    const blob = await new Promise((ok) => c.toBlob(ok, "image/png"));
    return new Uint8Array(await blob.arrayBuffer());
  }
  async function loadImage(key) {
    if (images.has(key)) return images.get(key);
    let r = null;
    try {
      let b = await bytesOf(urlFor(key));
      let info = imageInfo(b);
      if (info && info.ext === "webp") { b = await toPng(b); info = imageInfo(b); }
      if (info && info.w) r = { bytes: b, ...info, url: URL.createObjectURL(new Blob([b], { type: `image/${info.ext}` })) };
    } catch { r = null; }
    images.set(key, r);
    return r;
  }
  function keysOf(book) {
    const k = new Set(["@logo"]);
    for (const m of book.machines || []) if (m.images?.main) k.add(m.images.main);
    for (const x of [book.feature?.photo, book.checklistPhoto]) if (x) k.add(x);
    for (const a of [...(book.accIncluded || []), ...(book.accOptional || [])]) if (a.photo) k.add(a.photo);
    return [...k];
  }

  return {
    async build(book, catalogue) {
      await Promise.all(keysOf(book).map(loadImage));
      return buildBook({ book, catalogue, measure: F.measure, imageInfo: (k) => images.get(k) || null });
    },
    pageHtml(page, flagged) { return renderPageHtml(page, { imageUrl: (k) => images.get(k)?.url, flagged }); },
    async pptx(book, res) {
      const [template] = await Promise.all([bytesOf("template/fiche.pptx"), loadScript("vendor/fflate-0.8.2.min.js")]);
      const data = renderPptx({ pages: res.pages, template, getImage: (k) => images.get(k), fflate: window.fflate, meta: meta(book) });
      return { name: bookFileName(book, "pptx"), blob: new Blob([data], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }) };
    },
    async pdf(book, res) {
      await loadScript("vendor/pdf-lib-1.17.1.min.js");
      const data = await renderPdf({ pages: res.pages, lib: window.PDFLib, fontkit: window.fontkit, fontBytes: F.bytes, measure: F.measure, getImage: (k) => images.get(k), meta: meta(book) });
      return { name: bookFileName(book, "pdf"), blob: new Blob([data], { type: "application/pdf" }) };
    },
  };
}
const meta = (book) => ({ title: bookFileName(book, "x").slice(0, -2), lang: book.lang, date: book.updatedAt });

export function download({ name, blob }) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

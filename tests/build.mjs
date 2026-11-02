// Génère les exemples (PPTX + PDF + aperçu HTML) avec le même moteur que le site.
// Usage : node tests/build.mjs <dossier de sortie>
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUB = join(ROOT, "public");
const fontkit = require(join(PUB, "vendor/fontkit-1.1.1.umd.min.js"));
const PDFLib = require(join(PUB, "vendor/pdf-lib-1.17.1.min.js"));
const fflate = require(join(PUB, "vendor/fflate-0.8.2.min.js"));

const { loadFonts } = await import(join(PUB, "js/engine/fonts.js"));
const { buildBook, bookFileName } = await import(join(PUB, "js/engine/layout.js"));
const { renderPptx } = await import(join(PUB, "js/engine/render-pptx.js"));
const { renderPdf } = await import(join(PUB, "js/engine/render-pdf.js"));
const { renderPageHtml, PREVIEW_CSS } = await import(join(PUB, "js/engine/render-html.js"));
const { imageInfo } = await import(join(PUB, "js/engine/images.js"));

const out = process.argv[2] || join(ROOT, "out");
mkdirSync(out, { recursive: true });
const FIX = join(ROOT, "tests/fixtures");
const catalogue = JSON.parse(readFileSync(join(FIX, "catalogue.json"), "utf8"));
const F = await loadFonts(fontkit, async (p) => new Uint8Array(readFileSync(join(PUB, p))));

// images : clé → fichier
const imgPath = (key) => (key === "@logo" ? join(PUB, "template/logo.png") : join(FIX, key));
const imgCache = new Map();
function readImage(key) {
  if (!key) return null;
  if (imgCache.has(key)) return imgCache.get(key);
  const p = imgPath(key);
  let r = null;
  if (existsSync(p)) {
    const bytes = new Uint8Array(readFileSync(p));
    r = { bytes, ...imageInfo(bytes) };
  }
  imgCache.set(key, r);
  return r;
}
const books = process.argv.slice(3).length ? process.argv.slice(3) : ["book-msa-220-c-b.json", "book-mh-610-710.json"];
const report = [];
for (const f of books) {
  const book = JSON.parse(readFileSync(join(FIX, f), "utf8"));
  const t0 = performance.now();
  const res = buildBook({ book, catalogue, measure: F.measure, imageInfo: (k) => readImage(k) });
  const t1 = performance.now();
  const meta = { title: bookFileName(book, "").slice(0, -1), lang: book.lang, date: book.updatedAt };
  const pptx = renderPptx({ pages: res.pages, template: new Uint8Array(readFileSync(join(PUB, "template/fiche.pptx"))), getImage: readImage, fflate, meta });
  const t2 = performance.now();
  const pdf = await renderPdf({ pages: res.pages, lib: PDFLib, fontkit, fontBytes: F.bytes, measure: F.measure, getImage: readImage, meta });
  const t3 = performance.now();
  writeFileSync(join(out, bookFileName(book, "pptx")), pptx);
  writeFileSync(join(out, bookFileName(book, "pdf")), pdf);
  const html = `<!doctype html><meta charset="utf-8"><title>${book.id}</title><style>${PREVIEW_CSS.replace(/url\(fonts\//g, `url(${join(PUB, "fonts")}/`)}body{margin:0;background:#888}.db-page{margin:0 0 4mm}</style>` +
    res.pages.map((p) => renderPageHtml(p, { imageUrl: (k) => "file://" + imgPath(k) })).join("");
  writeFileSync(join(out, book.id + ".preview.html"), html);
  writeFileSync(join(out, book.id + ".layout.json"), JSON.stringify(res, null, 1));
  report.push({ book: book.id, pages: res.pages.length, ms: { layout: Math.round(t1 - t0), pptx: Math.round(t2 - t1), pdf: Math.round(t3 - t2) }, issues: res.issues });
}
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 1));
for (const r of report) {
  console.log(`${r.book}: ${r.pages} pages, ${JSON.stringify(r.ms)} ms`);
  const c = {}; for (const i of r.issues) c[i.level] = (c[i.level] || 0) + 1;
  console.log("  contrôles :", JSON.stringify(c));
}

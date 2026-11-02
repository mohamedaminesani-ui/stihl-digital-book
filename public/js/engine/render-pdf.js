// Rendu PDF (pdf-lib + Contraface embarquée) : dessine exactement les lignes calculées par le moteur.
import { PAGE } from "./spec.js";
import { PT } from "./text.js";

const P = (mm) => mm / PT; // mm → pt
const hex = (h, rgb) => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);

// lib = PDFLib (global UMD) ; fontBytes = { text, bold, title } ; getImage(key) → { bytes, ext }
export async function renderPdf({ pages, lib, fontkit, fontBytes, measure, getImage, meta = {} }) {
  const { PDFDocument, rgb, StandardFonts } = lib;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = {};
  for (const k of Object.keys(fontBytes)) fonts[k] = await doc.embedFont(fontBytes[k], { subset: false, features: { liga: false, clig: false, dlig: false, calt: false, kern: false } }); // pas de ligature ni de crénage : mêmes chasses que le moteur
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const imgs = new Map();
  const embed = async (key) => {
    if (imgs.has(key)) return imgs.get(key);
    const im = getImage(key);
    let e = null;
    if (im) e = im.ext === "png" ? await doc.embedPng(im.bytes) : await doc.embedJpg(im.bytes);
    imgs.set(key, e);
    return e;
  };
  const W = P(PAGE.w), H = P(PAGE.h);

  for (const page of pages) {
    const pg = doc.addPage([W, H]);
    const drawLines = (lines, ox, oy) => {
      for (const l of lines) {
        const by = H - P(oy + l.baseline);
        if (l.bullet) pg.drawText(l.bullet.char, { x: P(ox + l.bullet.x), y: by, size: l.bullet.size, font: fonts[l.bullet.font] || fonts.text, color: hex(l.bullet.color || "000000", rgb) });
        for (const s of l.segs) {
          if (!s.text.trim()) continue;
          // crénage : le segment est posé en morceaux aux positions crénées calculées par le moteur
          for (const c of measure.chunks(s.font, s.text, s.size)) {
            if (!c.text.trim()) continue;
            pg.drawText(c.text, { x: P(ox + s.x) + c.x, y: by, size: s.size, font: fonts[s.font] || fonts.text, color: hex(s.color || "000000", rgb) });
          }
        }
      }
    };
    const seg = (x1, y1, x2, y2, pt, color) => pg.drawLine({ start: { x: P(x1), y: H - P(y1) }, end: { x: P(x2), y: H - P(y2) }, thickness: pt, color: hex(color, rgb) });

    for (const it of page.items) {
      if (it.t === "rect") pg.drawRectangle({ x: P(it.x), y: H - P(it.y + it.h), width: P(it.w), height: P(it.h), color: hex(it.fill, rgb) });
      else if (it.t === "line") seg(it.x1, it.y1, it.x2, it.y2, it.pt, it.color);
      else if (it.t === "master") pg.drawText(it.text, { x: P(it.x), y: H - P(it.y) - 0.905 * it.size, size: it.size, font: helv, color: rgb(0, 0, 0), opacity: 0.5 });
      else if (it.t === "image") {
        const e = await embed(it.key);
        if (e) pg.drawImage(e, { x: P(it.x), y: H - P(it.y + it.h), width: P(it.w), height: P(it.h) });
      } else if (it.t === "text") drawLines(it.lines, it.x + it.ins.l, it.y + it.ins.t);
      else if (it.t === "table") {
        let cx = it.x;
        const xs = it.cols.map((w) => { const x = cx; cx += w; return x; });
        for (const r of it.rows) for (let c = 0; c < r.cells.length; c++) {
          const cell = r.cells[c];
          if (cell.fill) pg.drawRectangle({ x: P(xs[c]), y: H - P(it.y + r.y + r.h), width: P(it.cols[c]), height: P(r.h), color: hex(cell.fill, rgb) });
        }
        for (const r of it.rows) for (let c = 0; c < r.cells.length; c++) drawLines(r.cells[c].lines, xs[c] + it.mar.l, it.y + r.y + it.mar.t);
        for (const r of it.rows) for (let c = 0; c < r.cells.length; c++) {
          const b = r.cells[c].borders || {}, x0 = xs[c], x1 = xs[c] + it.cols[c], y0 = it.y + r.y, y1 = y0 + r.h;
          if (b.t) seg(x0, y0, x1, y0, b.t.pt, b.t.color);
          if (b.b) seg(x0, y1, x1, y1, b.b.pt, b.b.color);
          if (b.l) seg(x0, y0, x0, y1, b.l.pt, b.l.color);
          if (b.r) seg(x1, y0, x1, y1, b.r.pt, b.r.color);
        }
      }
    }
  }
  doc.setTitle(meta.title || "Digital Book");
  doc.setAuthor(meta.author || "STIHL AF/ME");
  doc.setCreator("STIHL Digital Book Builder");
  doc.setProducer("STIHL Digital Book Builder");
  doc.setLanguage(meta.lang === "en" ? "en-GB" : "fr-FR");
  if (meta.date) { doc.setCreationDate(new Date(meta.date)); doc.setModificationDate(new Date(meta.date)); }
  return await doc.save();
}

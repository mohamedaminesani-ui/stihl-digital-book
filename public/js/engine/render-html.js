// Aperçu HTML : mêmes coordonnées et mêmes lignes que le PDF et le PPTX (chaque ligne est posée à sa ligne de base).
import { PAGE } from "./spec.js";
import { ASC } from "./fonts.js";
import { PT } from "./text.js";

const FAMILY = { text: "cf-text", bold: "cf-bold", title: "cf-title" };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v) => +v.toFixed(3);

function linesHtml(lines, ox, oy) {
  let h = "";
  const span = (txt, font, size, color, x, base) =>
    `<span class="ln" style="left:${n(ox + x)}mm;top:${n(oy + base - ASC * size * PT)}mm;font-family:${FAMILY[font] || FAMILY.text};font-size:${size}pt;color:#${color || "000000"}">${esc(txt)}</span>`;
  for (const l of lines) {
    if (l.bullet) h += span(l.bullet.char, l.bullet.font, l.bullet.size, l.bullet.color, l.bullet.x, l.baseline);
    for (const s of l.segs) if (s.text.trim()) h += span(s.text, s.font, s.size, s.color, s.x, l.baseline);
  }
  return h;
}

// imageUrl(key) → URL affichable ; flagged = Set de noms de blocs en défaut (contour rouge)
export function renderPageHtml(page, { imageUrl, flagged = new Set() } = {}) {
  let h = `<div class="db-page" style="width:${PAGE.w}mm;height:${n(PAGE.h)}mm">`;
  for (const it of page.items) {
    if (it.t === "rect") h += `<div class="bx" style="left:${n(it.x)}mm;top:${n(it.y)}mm;width:${n(it.w)}mm;height:${n(it.h)}mm;background:#${it.fill}"></div>`;
    else if (it.t === "line") {
      const w = Math.max(Math.abs(it.x2 - it.x1), 0), hh = Math.max(Math.abs(it.y2 - it.y1), 0), t = it.pt * PT;
      h += `<div class="bx" style="left:${n(Math.min(it.x1, it.x2) - (w ? 0 : t / 2))}mm;top:${n(Math.min(it.y1, it.y2) - (hh ? 0 : t / 2))}mm;width:${n(w || t)}mm;height:${n(hh || t)}mm;background:#${it.color}"></div>`;
    } else if (it.t === "master") h += `<span class="ln master" style="left:${n(it.x)}mm;top:${n(it.y)}mm;font-size:${it.size}pt">${esc(it.text)}</span>`;
    else if (it.t === "image") {
      const u = imageUrl ? imageUrl(it.key) : null;
      if (u) h += `<img class="bx" alt="${esc(it.name || "")}" src="${esc(u)}" style="left:${n(it.x)}mm;top:${n(it.y)}mm;width:${n(it.w)}mm;height:${n(it.h)}mm">`;
    } else if (it.t === "ph") h += `<div class="bx ph" style="left:${n(it.x)}mm;top:${n(it.y)}mm;width:${n(it.w)}mm;height:${n(it.h)}mm"><span>${esc(it.label)}</span></div>`;
    else if (it.t === "text") {
      const bad = it.overflow || flagged.has(it.name);
      h += `<div class="bx tb${bad ? " bad" : ""}" data-block="${esc(it.name)}" style="left:${n(it.x)}mm;top:${n(it.y)}mm;width:${n(it.w)}mm;height:${n(it.h)}mm"></div>`;
      h += linesHtml(it.lines, it.x + it.ins.l, it.y + it.ins.t);
    } else if (it.t === "table") {
      let cx = it.x;
      const xs = it.cols.map((w) => { const x = cx; cx += w; return x; });
      for (const r of it.rows) r.cells.forEach((c, i) => {
        const b = c.borders || {}, bs = (e) => (e ? `${n(e.pt * PT)}mm solid #${e.color}` : "none");
        h += `<div class="bx cell" style="left:${n(xs[i])}mm;top:${n(it.y + r.y)}mm;width:${n(it.cols[i])}mm;height:${n(r.h)}mm;${c.fill ? `background:#${c.fill};` : ""}border-top:${bs(b.t)};border-bottom:${bs(b.b)};border-left:${bs(b.l)};border-right:${bs(b.r)}"></div>`;
      });
      for (const r of it.rows) r.cells.forEach((c, i) => { h += linesHtml(c.lines, xs[i] + it.mar.l, it.y + r.y + it.mar.t); });
      if (flagged.has(it.name)) h += `<div class="bx bad" style="left:${n(it.x)}mm;top:${n(it.y)}mm;width:${n(it.w)}mm;height:${n(it.h)}mm"></div>`;
    }
  }
  return h + "</div>";
}

// CSS commun (polices web = mêmes fichiers que le PDF)
export const PREVIEW_CSS = `
@font-face{font-family:cf-text;src:url(fonts/contraface-text.woff2) format("woff2")}
@font-face{font-family:cf-bold;src:url(fonts/contraface-text-bold.woff2) format("woff2")}
@font-face{font-family:cf-title;src:url(fonts/contraface-titling.woff2) format("woff2")}
.db-page{position:relative;background:#fff;overflow:hidden;color:#000;font-kerning:normal;font-variant-ligatures:none;font-synthesis:none;-webkit-text-size-adjust:none;text-size-adjust:none}
.db-page .bx{position:absolute;box-sizing:border-box;margin:0}
.db-page .cell{border-style:solid}
.db-page .ln{position:absolute;white-space:pre;line-height:1.2;margin:0;padding:0}
.db-page .master{font-family:Arial,"Liberation Sans",Helvetica,sans-serif;line-height:1.15;color:rgba(0,0,0,.5)}
.db-page .ph{border:0.3mm dashed #c9c4bd;display:flex;align-items:center;justify-content:center;font:9pt system-ui,sans-serif;color:#8a847d;text-align:center}
.db-page .bad{outline:0.6mm solid #d32f2f;outline-offset:-0.3mm;background:rgba(211,47,47,.06)}
`;

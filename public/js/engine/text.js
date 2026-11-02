// Mise en lignes des paragraphes (positions en mm, tailles de police en pt).
// Coupure aux espaces : la décision se prend sur la largeur SANS crénage (la plus large), la pose avec crénage.
// Chaque fin de ligne est typée : 'wrap' (retour automatique sûr), 'soft' (un logiciel qui crène aurait pu
// mettre un mot de plus → le PPTX y place un saut de ligne pour garder les mêmes coupures), 'br' (saut voulu).
import { BASE, LINE } from "./fonts.js";

export const PT = 25.4 / 72; // 1 pt en mm

// Paragraphe : { runs:[{ text, font:'text'|'bold'|'title', size, color }], align:'l'|'ctr'|'r',
//   marL, indent (mm), bullet:{ char } | null, spcBef, spcAft (pt), size (taille si vide) }
export function layoutParas(paras, width, measure) {
  const lines = [];
  let y = 0, forced = false;
  paras.forEach((p, pi) => {
    if (pi > 0 && p.spcBef) y += p.spcBef * PT;
    const res = layoutPara(p, width, measure);
    forced = forced || res.forced;
    for (const l of res.lines) {
      l.p = pi;
      l.top = y;
      l.baseline = y + BASE * l.size * PT;
      y += l.h;
      lines.push(l);
    }
    if (pi < paras.length - 1 && p.spcAft) y += p.spcAft * PT;
  });
  return { lines, height: y, forced };
}

function tokens(p) {
  const out = [];
  for (const r of p.runs || []) {
    for (const s of String(r.text ?? "").split(/(\n| +)/)) {
      if (!s) continue;
      if (s === "\n" || s[0] === " ") { out.push({ ...r, text: s, kind: s === "\n" ? "br" : "space" }); continue; }
      // coupure possible après un trait d'union (« hache-|paille »), comme PowerPoint et LibreOffice
      s.split(/(?<=[^\s-]-)(?=[^\s-])/).forEach((w, i) => { if (i) out.push({ ...r, text: "", kind: "opp" }); out.push({ ...r, text: w, kind: "word" }); });
    }
  }
  return out;
}

function layoutPara(p, width, measure) {
  const marL = p.marL || 0, indent = p.indent || 0;
  const startFirst = p.bullet ? marL : marL + indent;
  const uw = (t) => measure.width(t.font, t.text, t.size) * PT; // décision
  const kw = (t) => measure.kwidth(t.font, t.text, t.size) * PT; // pose
  const lines = [];
  let forced = false;

  const items = [];
  for (const t of tokens(p)) {
    if (t.kind === "word" && items.length && items[items.length - 1].kind === "word" && !items[items.length - 1].opp) items[items.length - 1].parts.push(t);
    else if (t.kind === "opp") { if (items.length) items[items.length - 1].opp = true; }
    else items.push(t.kind === "word" ? { kind: "word", parts: [t] } : t);
  }

  let cur = [], curU = 0, curK = 0, pend = [], first = true;
  const avail = () => width - (first ? startFirst : marL);
  const mkLine = (segs, isFirst, brk) => {
    const start = isFirst ? startFirst : marL;
    let lw = 0;
    for (const s of segs) lw += kw(s);
    // espaces de fin exclus de la largeur
    for (let i = segs.length - 1; i >= 0 && segs[i].kind === "space"; i--) lw -= kw(segs[i]);
    const free = width - start - lw;
    const off = p.align === "ctr" ? free / 2 : p.align === "r" ? free : 0;
    let x = start + off;
    const out = [];
    for (const s of segs) { out.push({ text: s.text, font: s.font, size: s.size, color: s.color, x }); x += kw(s); }
    const size = segs.reduce((m, s) => Math.max(m, s.size), 0) || p.size || (p.runs?.[0]?.size ?? 10);
    const line = { segs: out, width: lw, x: start + off, size, h: size * LINE * PT, bullet: null, brk };
    if (isFirst && p.bullet) {
      const b = p.runs?.[0] || {};
      line.bullet = { char: p.bullet.char || "•", font: p.bullet.font || b.font || "text", size: b.size || size, color: b.color, x: marL + indent };
    }
    return line;
  };
  const flush = (brk) => { lines.push(mkLine(cur, first, brk)); cur = []; curU = 0; curK = 0; pend = []; first = false; };

  let afterOpp = false;
  for (const it of items) {
    const prevOpp = afterOpp;
    afterOpp = false;
    if (it.kind === "br") { flush("br"); continue; }
    if (it.kind === "space") { if (cur.length) pend.push(it); continue; }
    if (prevOpp) afterOpp = true;
    const wu = it.parts.reduce((s, t) => s + uw(t), 0), wk = it.parts.reduce((s, t) => s + kw(t), 0);
    const pu = pend.reduce((s, t) => s + uw(t), 0), pk = pend.reduce((s, t) => s + kw(t), 0);
    if (cur.length && curU + pu + wu > avail() + 1e-6) flush(afterOpp ? "br" : curK + pk + wk <= avail() + 1e-6 ? "soft" : "wrap");
    if (!cur.length && wu > avail() + 1e-6) {
      forced = true; // mot trop long : coupure lettre par lettre, sauts forcés
      for (const t of it.parts) for (const ch of t.text) {
        const c = { ...t, text: ch };
        if (cur.length && curU + uw(c) > avail() + 1e-6) flush("br");
        cur.push(c); curU += uw(c); curK += kw(c);
      }
      continue;
    }
    if (cur.length) for (const s of pend) { cur.push(s); curU += uw(s); curK += kw(s); }
    pend = [];
    for (const t of it.parts) { cur.push(t); curU += uw(t); curK += kw(t); }
    afterOpp = !!it.opp;
  }
  if (cur.length || !lines.length) lines.push(mkLine(cur, first, "end"));
  // fusion des morceaux contigus de même style
  for (const l of lines) {
    const m = [];
    for (const s of l.segs) {
      const last = m[m.length - 1];
      if (last && last.font === s.font && last.size === s.size && last.color === s.color) last.text += s.text;
      else m.push({ ...s });
    }
    l.segs = m;
  }
  return { lines, forced };
}

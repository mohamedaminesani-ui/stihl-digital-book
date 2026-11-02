// Polices et mesure du texte. Un seul jeu de métriques sert à l'aperçu, au PDF et au PPTX.
// - width  : chasses brutes (sans crénage) → sert à DÉCIDER où couper les lignes (cas le plus large : la ligne tient partout)
// - kwidth : chasses avec crénage (GPOS « kern ») → sert à POSER les mots, comme PowerPoint, LibreOffice et le navigateur
// Aucune ligature (Contraface en a) : un caractère = un glyphe partout.

export const FONT_FILES = {
  text: "fonts/contraface-text.ttf",
  bold: "fonts/contraface-text-bold.ttf",
  title: "fonts/contraface-titling.ttf",
};

// Noms des polices installées sur les PC STIHL (ceux des fiches d'origine). Le gras de « Text » = style lié Bold.
export const FONT_PPTX = {
  text: { face: "STIHL Contraface Text", b: 0 },
  bold: { face: "STIHL Contraface Text", b: 1 },
  title: { face: "STIHL Contraface Display Title", b: 0 },
};

// Métriques verticales communes aux trois fichiers (hhea : 940 / -260 / 0 pour 1000 unités).
export const ASC = 0.94, DESC = 0.26, LINE = 1.2;
// Position de la 1re ligne de base sous le haut de la ligne. PowerPoint la place à l'ascendante de la police (0,94 em),
// LibreOffice à 1,00 em (mesuré). Le moteur prend le milieu (0,97 em) : écart ≤ 0,03 em avec les deux (0,26 mm à 24 pt).
export const BASE = 0.97;
export const FEATURES = { kern: true, liga: false, clig: false, dlig: false, calt: false, rlig: false };

export async function loadFonts(fontkit, getBytes) {
  const bytes = {}, fonts = {};
  for (const [k, path] of Object.entries(FONT_FILES)) {
    bytes[k] = await getBytes(path);
    fonts[k] = fontkit.create(bytes[k]);
  }
  return { bytes, fonts, measure: measurer(fonts) };
}

export function measurer(fonts) {
  const cache = {}, kcache = {};
  for (const k of Object.keys(fonts)) { cache[k] = new Map(); kcache[k] = new Map(); }
  const adv = (k, ch) => {
    let w = cache[k].get(ch);
    if (w === undefined) {
      const f = fonts[k];
      w = f.glyphsForString(ch).reduce((s, x) => s + x.advanceWidth, 0) / f.unitsPerEm;
      cache[k].set(ch, w);
    }
    return w;
  };
  // positions crénées d'une chaîne (en em) : [{ ch, x }] + largeur totale
  const kern = (k, str) => {
    let r = kcache[k].get(str);
    if (!r) {
      const f = fonts[k], run = f.layout(str, FEATURES);
      const chars = [...str];
      let x = 0;
      const pos = [];
      if (run.glyphs.length === chars.length) {
        run.positions.forEach((p, i) => { pos.push({ ch: chars[i], x: x / f.unitsPerEm }); x += p.xAdvance; });
      } else {
        for (const ch of chars) { pos.push({ ch, x: x / f.unitsPerEm }); x += adv(k, ch) * f.unitsPerEm; }
      }
      r = { pos, w: x / f.unitsPerEm };
      if (kcache[k].size > 5000) kcache[k].clear();
      kcache[k].set(str, r);
    }
    return r;
  };
  const missing = (k, str) => {
    const f = fonts[k], out = new Set();
    for (const ch of str) if (ch.trim() && !f.hasGlyphForCodePoint(ch.codePointAt(0))) out.add(ch);
    return [...out];
  };
  // largeurs en points
  const width = (k, str, sizePt) => { let w = 0; for (const ch of str) w += adv(k, ch); return w * sizePt; };
  const kwidth = (k, str, sizePt) => kern(k, str).w * sizePt;
  // morceaux de texte à poser séparément pour reproduire le crénage dans le PDF : [{ text, x (pt) }]
  const chunks = (k, str, sizePt) => {
    const { pos } = kern(k, str), out = [];
    let cur = null, natural = 0;
    for (const p of pos) {
      const x = p.x * sizePt;
      if (!cur || Math.abs(x - natural) > 0.01) { cur = { text: "", x }; out.push(cur); natural = x; }
      cur.text += p.ch;
      natural += adv(k, p.ch) * sizePt;
    }
    return out;
  };
  return { width, kwidth, chunks, missing };
}

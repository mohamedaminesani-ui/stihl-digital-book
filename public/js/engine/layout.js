// Moteur de mise en page : données du book (+ catalogue) → pages = listes d'éléments positionnés (mm).
// Ces listes sont la seule source des trois rendus (aperçu HTML, PDF, PPTX). Aucune coupure de texte silencieuse :
// si un texte ne tient pas, il est d'abord réduit jusqu'à la taille minimale de son style, sinon la page est signalée.
import { PAGE, COLOR, STYLE, GRID, INSETS, BLANK_ROWS } from "./spec.js";
import { layoutParas, PT } from "./text.js";
import { T, familyTitle, specLabel } from "./i18n.js";

const run = (style, text, extra = {}) => ({ text, font: style.font, size: style.size, color: style.color || COLOR.black, min: style.min, ...extra });
const para = (runs, o = {}) => ({ runs: Array.isArray(runs) ? runs : [runs], ...o });

export function joinNames(names) {
  if (names.length < 2) return names[0] || "";
  const m = names.map((n) => /^([A-Za-z]+)\s+(.+)$/.exec(n));
  if (m.every((x) => x && x[1] === m[0][1])) return `${m[0][1]} ${m.map((x) => x[2]).join(" / ")}`;
  return names.join(" / ");
}

export function bookFileName(book, ext) {
  const names = (book.machines || []).map((m) => m.name);
  const id = joinNames(names).replace(/[\/]+/g, "-").replace(/[^A-Za-z0-9.+-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `DigitalBook_${id || "sans-nom"}_${(book.lang || "fr").toUpperCase()}_${book.year || 2027}.${ext}`;
}

const fmtDate = (lang, d) => new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(d);

export function buildBook({ book, catalogue, measure, imageInfo }) {
  const lang = book.lang || "fr", t = T[lang] || T.fr;
  const issues = [];
  const pages = [];
  const machines = (book.machines || []).slice();
  const first = machines[0] || {};
  const famDef = catalogue?.structure?.families?.find((f) => f.id === (book.family || first.family));
  const tech = book.tech || first.tech || "petrol";
  const img = (key) => (key && imageInfo ? imageInfo(key) : null);
  const issue = (level, page, block, msg) => issues.push({ level, page, block, msg });

  // ---------- éléments
  const textBox = (page, name, f, paras, o = {}) => {
    const ins = f.ins || INSETS;
    const w = f.w - ins.l - ins.r, hAvail = f.h - ins.t - ins.b;
    let ps = paras, res = layoutParas(ps, w, measure), step = 0;
    while (o.shrink !== false && res.height > hAvail + 0.05 && step < 20) {
      step++;
      let changed = false;
      ps = paras.map((p) => ({ ...p, runs: p.runs.map((r) => {
        const s = Math.max(r.min || r.size, r.size - 0.5 * step);
        if (s !== r.size) changed = true;
        return { ...r, size: s };
      }) }));
      if (!changed) break;
      res = layoutParas(ps, w, measure);
    }
    const overflow = res.height > hAvail + 0.05;
    if (overflow) issue("error", page.n, name, `Texte trop long pour sa zone (dépasse de ${(res.height - hAvail).toFixed(1)} mm, même à la taille minimale).`);
    else if (step) issue("info", page.n, name, "Texte réduit automatiquement pour tenir dans sa zone.");
    if (res.forced) issue("warn", page.n, name, "Un mot est plus long que la ligne : il a été coupé.");
    for (const p of ps) for (const r of p.runs) { const miss = measure.missing(r.font, r.text || ""); if (miss.length) issue("error", page.n, name, `Caractères absents de la police Contraface : ${miss.join(" ")}`); }
    const it = { t: "text", name, x: f.x, y: f.y, w: f.w, h: f.h, ins, paras: ps, lines: res.lines, overflow };
    page.items.push(it);
    return it;
  };
  const line = (page, x1, y1, x2, y2, pt = 1, color = COLOR.rule) => page.items.push({ t: "line", x1, y1, x2, y2, pt, color });
  const rect = (page, x, y, w, h, fill) => page.items.push({ t: "rect", x, y, w, h, fill });
  const ph = (page, x, y, w, h, label) => page.items.push({ t: "ph", x, y, w, h, label });
  const image = (page, name, key, x, y, w, h, valign = "ctr") => {
    const info = img(key);
    if (!info) return false;
    const s = Math.min(w / info.w, h / info.h), iw = info.w * s, ih = info.h * s;
    const iy = valign === "b" ? y + h - ih : valign === "t" ? y : y + (h - ih) / 2;
    page.items.push({ t: "image", name, key, x: x + (w - iw) / 2, y: iy, w: iw, h: ih, dpi: info.w / (iw / 25.4) });
    if (info.w / (iw / 25.4) < 150) issue("warn", page.n, name, `Photo en basse résolution (${Math.round(info.w / (iw / 25.4))} dpi à l'impression, 150 minimum).`);
    return true;
  };
  // tableau : cols (mm), rows [{ minH, fill, cells:[{ paras, fill }] }], border(r, c, nRows, nCols) → { l,t,r,b }
  const table = (page, name, x, y, cols, rows, mar, border) => {
    const out = [];
    let yy = 0;
    rows.forEach((r, ri) => {
      let h = r.minH || 0;
      const cells = r.cells.map((c, ci) => {
        const w = cols[ci] - mar.l - mar.r;
        const res = layoutParas(c.paras, w, measure);
        if (res.forced) issue("warn", page.n, name, "Un mot est plus long que sa colonne : il a été coupé.");
        h = Math.max(h, mar.t + res.height + mar.b);
        return { ...c, lines: res.lines, textH: res.height, fill: c.fill ?? r.fill ?? null, borders: border(ri, ci, rows.length, cols.length) };
      });
      out.push({ h, y: yy, cells });
      yy += h;
    });
    const it = { t: "table", name, x, y, cols, rows: out, mar, h: yy, w: cols.reduce((a, b) => a + b, 0) };
    page.items.push(it);
    return it;
  };
  const orangeBorders = (ri, ci, nr, nc) => {
    const o = { pt: GRID.table.borderPt, color: COLOR.orange };
    return { l: ci === 0 ? o : null, r: ci === nc - 1 ? o : null, t: ri === 0 ? o : null, b: ri === nr - 1 ? o : ri === 0 ? o : null };
  };
  const gridBorders = (ri, ci) => {
    const g = { pt: 0.75, color: COLOR.dark };
    return { l: g, r: g, t: g, b: g };
  };

  // ---------- éléments communs
  const names = machines.map((m) => m.name);
  const newPage = (kind) => {
    const page = { n: pages.length + 1, kind, items: [] };
    pages.push(page);
    page.items.push({ t: "master", x: GRID.master.x, y: GRID.master.y, size: GRID.master.size, text: GRID.master.text });
    page.items.push({ t: "image", name: "logo", key: "@logo", x: GRID.logo.x, y: GRID.logo.y, w: GRID.logo.w, h: GRID.logo.h, fixed: true });
    textBox(page, "en-tête", GRID.header, [
      para(run(STYLE.header, t.sheet, { color: COLOR.orange })),
      para(run(STYLE.header, "ƒ", { color: COLOR.orange })),
      para(run(STYLE.header, `STIHL ${joinNames(names)}`, { min: 12 })),
    ]);
    line(page, GRID.headerRule.x, GRID.headerRule.y, GRID.headerRule.x + GRID.headerRule.w, GRID.headerRule.y);
    return page;
  };
  const footer = (page) => {
    const F = GRID.footer;
    rect(page, F.x, F.y, F.w, F.h, COLOR.orange);
    textBox(page, "pied SSC", F.left, [para(run(STYLE.footLabel, t.sscTitle)), ...t.sscItems.map((s) => para(run(STYLE.footItem, s)))], { shrink: false });
    textBox(page, "pied Academy titre", { ...F.codes, w: 93.5 }, [para(run(STYLE.footLabel, t.academyTitle))], { shrink: false });
    const blank = para([], { size: STYLE.footLabel.size });
    textBox(page, "pied Academy codes", F.codes, [blank, ...t.academyItems.map(([c]) => para(run(STYLE.footItem, `${c} :`)))], { shrink: false });
    textBox(page, "pied Academy libellés", F.right, [blank, ...t.academyItems.map(([, l]) => para(run(STYLE.footItem, l)))], { shrink: false });
    line(page, F.x, F.rule, F.x + 180.1, F.rule);
  };

  if (!machines.length) issue("error", 1, "machines", "Aucune machine dans ce book.");
  if (machines.length > GRID.specs.maxModels) issue("error", 1, "caractéristiques", `${machines.length} machines : 4 au maximum par fiche.`);
  for (const m of machines) if (m.source !== "catalogue") issue("warn", 1, "machines", `${m.name} n'est pas dans le Catalogue Builder : ses caractéristiques ne sont pas vérifiées par le catalogue.`);

  // ================= PAGE 1 · Présentation
  {
    const page = newPage("presentation");
    const G = GRID;
    if (book.updatedAt) textBox(page, "date", { x: 128.0, y: 18.3, w: 57.4, h: 5.0, ins: { l: 0, t: 0.5, r: 0, b: 0 } },
      [para(run({ font: "text", size: 8, color: "595959" }, `${lang === "fr" ? "Mise à jour" : "Updated"} : ${fmtDate(lang, new Date(book.updatedAt))}`), { align: "r" })], { shrink: false });

    textBox(page, "famille", G.family, [
      para(run(STYLE.family, book.familyTitle || familyTitle(lang, famDef, tech, catalogue?.structure?.techs), { min: 14 })),
      para(run(STYLE.familyLine, "ƒ")),
    ]);

    // A2 · caractéristiques (catalogue)
    const shown = machines.slice(0, G.specs.maxModels);
    let specs = (famDef?.specs || []).filter((s) => !s.techs?.length || s.techs.includes(tech));
    if (book.specKeys?.length) specs = book.specKeys.map((k) => specs.find((s) => s.k === k) || { k, label: k, unit: "" });
    if (specs.length > G.specs.maxRows) {
      const filled = specs.filter((s) => shown.some((m) => valueOf(m, s.k)));
      specs = (filled.length ? filled : specs).slice(0, G.specs.maxRows);
      issue("warn", 1, "caractéristiques", `Plus de ${G.specs.maxRows} caractéristiques : seules les ${specs.length} premières renseignées sont affichées.`);
    }
    if (!famDef) issue("error", 1, "caractéristiques", "Famille introuvable dans le catalogue.");
    const n = Math.max(1, shown.length), mw = (G.specs.w - G.specs.labelW) / n;
    const cols = [G.specs.labelW, ...shown.map(() => mw)];
    const rows = [{ minH: G.specs.headH, fill: COLOR.orange, cells: [{ paras: [para([], { size: STYLE.specHead.size })] }, ...shown.map((m) => ({ paras: [para(run(STYLE.specHead, m.name), { align: "ctr" })] }))] }];
    for (const s of specs) {
      const label = specLabel(lang, s), unit = s.unit ? ` [${s.unit}]` : "";
      rows.push({ minH: G.specs.rowH, cells: [
        { paras: [para([run(STYLE.specLabel, label), ...(unit ? [run(STYLE.specUnit, unit)] : [])])] },
        ...shown.map((m) => {
          const v = valueOf(m, s.k);
          if (!v) issue("warn", 1, "caractéristiques", `Valeur absente du catalogue : ${label} — ${m.name}`);
          return { paras: [para(v ? run(STYLE.specValue, v) : [], { align: "ctr", size: STYLE.specValue.size })] };
        }),
      ] });
    }
    const st = table(page, "caractéristiques", G.specs.x, G.specs.y, cols, rows, G.specs.mar, orangeBorders);

    // A3 · photos produit (catalogue)
    {
      const y = st.y + st.h + G.photos.gapTop, h = G.photos.bottom - y;
      const keys = shown.map((m) => m.images?.main).filter((k) => img(k));
      if (h < 25) issue("error", 1, "photos", "Plus assez de place pour les photos : trop de lignes de caractéristiques.");
      if (!keys.length) { ph(page, G.photos.x, y, G.photos.w, h, "Photo produit (catalogue)"); issue("warn", 1, "photos", "Aucune photo produit dans le catalogue."); }
      else {
        const sw = (G.photos.w - G.photos.gap * (keys.length - 1)) / keys.length;
        keys.forEach((k, i) => image(page, "photo produit", k, G.photos.x + i * (sw + G.photos.gap), y, sw, h));
      }
    }

    line(page, G.divider.x, G.divider.y, G.divider.x, G.divider.y + G.divider.h);
    // A4 · fonction spécifique
    const fz = book.feature || {};
    textBox(page, "fonction spécifique (titre)", G.featureLabel, [para(run(STYLE.featureLabel, t.feature))], { shrink: false });
    if (!image(page, "photo fonction", fz.photo, G.featurePhoto.x, G.featurePhoto.y, G.featurePhoto.w, G.featurePhoto.h)) ph(page, G.featurePhoto.x, G.featurePhoto.y, G.featurePhoto.w, G.featurePhoto.h, "Photo de détail");
    const fparas = [];
    if (fz.title) fparas.push(para(run(STYLE.featureTitle, fz.title)));
    if (fz.text) fparas.push(para(run(STYLE.featureText, fz.text)));
    if (fz.note) fparas.push(para(run(STYLE.featureNote, fz.note), { spcBef: 4 }));
    if (!fparas.length) { fparas.push(para([], { size: STYLE.featureText.size })); issue("warn", 1, "fonction spécifique", "Fonction spécifique à compléter."); }
    textBox(page, "fonction spécifique", G.featureText, fparas);

    // B · cibles, applications, argus
    rect(page, G.band.x, G.band.y, G.band.w, G.band.h, COLOR.band);
    const B = G.bullets;
    const bullets = (list) => (list || []).filter((s) => String(s).trim()).map((s) => para(run(STYLE.bullet, String(s).trim()), { marL: B.marL, indent: B.indent, bullet: { char: "•" }, spcAft: B.spcAft }));
    const left = [para(run(STYLE.heading, t.targets), { spcAft: B.headAft }), ...bullets(book.targets), para(run(STYLE.heading, t.applications), { spcBef: B.headBef, spcAft: B.headAft }), ...bullets(book.applications)];
    textBox(page, "cibles et applications", G.left, left);
    textBox(page, "argus", G.right, [para(run(STYLE.heading, t.argus), { spcAft: B.headAft }), ...bullets(book.argus)]);
    if (!book.targets?.length) issue("warn", 1, "cibles et applications", "Groupe cible à compléter.");
    if (!book.applications?.length) issue("warn", 1, "cibles et applications", "Applications à compléter.");
    if (!book.argus?.length) issue("warn", 1, "argus", "Argus à compléter.");

    // C · accessoires (photos)
    line(page, G.accRule.x, G.accRule.y, G.accRule.x + G.accRule.w, G.accRule.y);
    const withOpt = (book.accOptional || []).length > 0 || book.showOptional;
    const tl = withOpt ? G.accTitleL : { ...G.accTitleL, w: 180.1 };
    textBox(page, "accessoires inclus (titre)", tl, [para(run(STYLE.accTitle, t.accIncluded), { align: "ctr" })], { shrink: false });
    const thumbs = (list, area, name) => {
      const items = (list || []).slice(0, area.max);
      if ((list || []).length > area.max) issue("warn", 1, name, `${list.length} accessoires : ${area.max} au maximum dans cette zone.`);
      if (!items.length) { issue("info", 1, name, "Aucun accessoire renseigné."); return; }
      const sw = Math.min(area.w / items.length, 32), x0 = area.x + (area.w - sw * items.length) / 2, capH = 3.6;
      items.forEach((a, i) => {
        const x = x0 + i * sw;
        if (!image(page, name, a.photo, x + 1, area.y, sw - 2, area.h - capH - 0.5, "b")) ph(page, x + 1, area.y, sw - 2, area.h - capH - 0.5, "Photo");
        if (a.name) textBox(page, name + " (légende)", { x, y: area.y + area.h - capH, w: sw, h: capH, ins: { l: 0, t: 0, r: 0, b: 0 } }, [para(run(STYLE.accCaption, a.name), { align: "ctr" })]);
      });
    };
    thumbs(book.accIncluded, withOpt ? G.accThumbsL : { ...G.accThumbsL, w: 176 }, "accessoires inclus");
    if (withOpt) {
      textBox(page, "accessoires en option (titre)", G.accTitleR, [para(run(STYLE.accTitle, t.accOptional), { align: "ctr" })], { shrink: false });
      line(page, G.accDivider.x, G.accDivider.y, G.accDivider.x, G.accDivider.y + G.accDivider.h);
      thumbs(book.accOptional, G.accThumbsR, "accessoires en option");
    }
    line(page, G.bottomRule.x, G.bottomRule.y, G.bottomRule.x + G.bottomRule.w, G.bottomRule.y);
  }

  // ================= PAGES 2 et 3 · blocs empilés
  const FL = GRID.flow, TB = GRID.table;
  const blankRow = (ncols) => ({ minH: TB.rowH, cells: Array.from({ length: ncols }, () => ({ paras: [para([], { size: STYLE.tableBody.size })] })) });
  const bodyRow = (vals, opts = {}) => ({ minH: TB.rowH, cells: vals.map((v) => ({ paras: [para(v ? run(STYLE.tableBody, String(v)) : [], { size: STYLE.tableBody.size, ...opts })] })) });
  const headRow = (labels, align) => ({ minH: TB.headH, fill: COLOR.orange, cells: labels.map((l) => ({ paras: [para(run(STYLE.tableHead, l), { align })] })) });
  // bloc tableau : { title, cols, head, rows, kind, width, side } ; retourne la hauteur nécessaire en simulant
  // Avant de créer une page « suite », on essaie de réduire le texte des tableaux (10 → 9 pt) pour tout garder sur une page.
  const resize = (blocks, size) => blocks.map((b) => ({ ...b, rows: b.rows.map((r) => ({ ...r, minH: r.minH === TB.rowH ? TB.rowH * size / STYLE.tableBody.size : r.minH,
    cells: r.cells.map((c) => ({ ...c, paras: c.paras.map((p) => ({ ...p, size: p.size === STYLE.tableBody.size ? size : p.size,
      runs: p.runs.map((x) => (x.size === STYLE.tableBody.size && x.font === STYLE.tableBody.font ? { ...x, size } : x)) })) })) })) }));
  // hauteur de chaque ligne d'un bloc, calculée une seule fois (une ligne de tableau ne dépend pas des autres)
  const heights = (b) => {
    const probe = { n: 0, items: [] };
    return [b.head, ...b.rows].map((r) => table(probe, b.title, 0, 0, b.cols, [r], TB.mar, b.border || orangeBorders).h);
  };
  const fits = (blocks) => {
    let y = FL.top;
    for (const b of blocks) {
      y += FL.titleToTable + heights(b).reduce((a, c) => a + c, 0);
      if (y > FL.bottom + 1e-6) return false;
      y += FL.gap;
    }
    return true;
  };
  const flowPages = (kind, blocks0) => {
    let blocks = blocks0;
    if (!fits(blocks)) {
      for (const s of [9.5, 9]) { const b2 = resize(blocks0, s); if (fits(b2)) { blocks = b2; issue("info", pages.length + 1, kind, `Texte des tableaux réduit à ${s} pt pour tenir sur une page.`); break; } }
    }
    let page = null, y = 0;
    const start = () => { page = newPage(kind); y = FL.top; };
    const end = () => { if (page) footer(page); };
    start();
    for (const b of blocks) {
      const hs = heights(b), headH = hs[0];
      let rows = b.rows.slice(), rh = hs.slice(1), cont = false;
      while (true) {
        // combien de lignes tiennent dans la place restante ?
        const room = FL.bottom - y - FL.titleToTable - headH;
        let k = 0, used = 0;
        while (k < rows.length && used + rh[k] <= room + 1e-6) used += rh[k++];
        const minNeeded = Math.min(3, rows.length);
        if (k < minNeeded && y > FL.top + 0.01) { end(); start(); continue; }
        if (k === 0) k = 1;
        textBox(page, b.title, { x: 3.1, y, w: 182.0, h: FL.titleH, ins: INSETS }, [para(run(STYLE.section, cont ? `${b.title} ${T[lang].continued}` : b.title))], { shrink: false });
        const tb = table(page, b.title, FL.x, y + FL.titleToTable, b.cols, [b.head, ...rows.slice(0, k)], TB.mar, b.border || orangeBorders);
        if (b.side) b.side(page, y + FL.titleToTable, tb.h);
        y += FL.titleToTable + tb.h + FL.gap;
        rows = rows.slice(k); rh = rh.slice(k);
        if (!rows.length) break;
        cont = true;
        issue("info", page.n, b.title, "Tableau trop long : suite sur la page suivante.");
        end(); start();
      }
    }
    end();
  };
  const fill = (list, n, map) => (list && list.length ? list.map(map) : Array.from({ length: n }, () => null));
  const W = FL.w;

  // page 2 · après-vente
  const p2 = [];
  p2.push({ title: t.maintenance, cols: [W / 2, W / 2], head: headRow([t.operation, t.interval]),
    rows: fill(book.maintenance, BLANK_ROWS.maintenance, (r) => bodyRow([r.op, r.interval])).map((r) => r || blankRow(2)) });
  if (tech === "battery") p2.push({ title: t.batteryReco, cols: [W], head: headRow([t.recommendations]),
    rows: fill(book.batteryReco, BLANK_ROWS.batteryReco, (s) => bodyRow([s])).map((r) => r || blankRow(1)) });
  p2.push({ title: t.parts, cols: [90, 60, 30], head: headRow([t.articleNo, t.description, t.model]),
    rows: fill(book.parts, BLANK_ROWS.parts, (r) => bodyRow([r.ref, r.desc, r.model])).map((r) => r || blankRow(3)) });
  p2.push({ title: t.consumables, cols: [90, 60, 30], head: headRow([t.articleNo, t.description, t.model]),
    rows: fill(book.consumables, BLANK_ROWS.consumables, (r) => bodyRow([r.ref, r.desc, r.model])).map((r) => r || blankRow(3)) });
  const ckPhoto = book.checklistPhoto || first.images?.main;
  p2.push({ title: t.preDelivery, cols: [GRID.checklist.w], head: headRow([t.checklist], "ctr"),
    rows: fill(book.checklist, BLANK_ROWS.checklist, (s) => bodyRow([`- ${s}`])).map((r) => r || blankRow(1)),
    side: (page, y, h) => { const P = GRID.checklist.photo; if (ckPhoto) image(page, "photo pré-livraison", ckPhoto, P.x, y, P.w, Math.min(P.h, Math.max(h, 30))); } });
  flowPages("apres-vente", p2);

  // page 3 · accessoires et calendrier
  const C = GRID.calendar;
  const calRows = (book.calendar?.rows?.length ? book.calendar.rows : Array.from({ length: BLANK_ROWS.calendar }, () => ({ label: "" })))
    .map((r) => ({ minH: r.group ? TB.rowH + 1 : C.rowH, fill: r.group ? COLOR.band : null, cells: [
      { paras: [para(r.label ? run(r.group ? STYLE.calGroup : STYLE.calBody, r.label) : [], { size: STYLE.calBody.size })] },
      ...Array.from({ length: 12 }, () => ({ paras: [para([], { size: STYLE.calBody.size })] })),
    ] }));
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  flowPages("accessoires", [
    { title: t.accessories, cols: [90, 60, 30], head: headRow([t.articleNo, t.description, t.model]),
      rows: fill(book.accessories, BLANK_ROWS.accessories, (r) => bodyRow([r.ref, r.desc, r.model])).map((r) => r || blankRow(3)) },
    { title: t.calendar, cols: [C.firstCol, ...months.map(() => C.monthW)], border: gridBorders,
      head: { minH: C.headH, fill: COLOR.dark, cells: [{ paras: [para(run(STYLE.calHead, t.usage.toUpperCase()))] }, ...months.map((m) => ({ paras: [para(run(STYLE.calHead, m), { align: "ctr" })] }))] },
      rows: calRows },
  ]);

  if (!(book.maintenance || []).length) issue("info", 2, "maintenance", "Intervalles de maintenance vides (à remplir).");
  if (!(book.parts || []).length) issue("info", 2, "pièces", "Pièces de rechange vides (à remplir).");
  if (!(book.accessories || []).length) issue("info", 3, "accessoires", "Accessoires vides (à remplir).");
  return { pages, issues, page: PAGE };
}

function valueOf(m, k) {
  const v = m?.specs?.[k];
  return v === undefined || v === null ? "" : String(v).trim();
}

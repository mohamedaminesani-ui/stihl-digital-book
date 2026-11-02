// Rendu PPTX : injecte les pages dans le template officiel (masque, dispositions, thème et étiquette de la fiche d'origine).
// Vrai texte et vrais tableaux, éditables. Positions et coupures de ligne = celles du moteur (boîtes fixes, pas d'ajustement auto).
import { PAGE } from "./spec.js";
import { FONT_PPTX } from "./fonts.js";

const E = (mm) => Math.round(mm * 36000);
const esc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const NO_STYLE = "{2D5ABB26-0587-4C30-8999-92F81FD0307C}"; // « Aucun style, aucune grille »

function rPr(r, lang) {
  const f = FONT_PPTX[r.font] || FONT_PPTX.text;
  // kern="100" : crénage à partir de 1 pt, comme le moteur (qui pose les mots avec les paires de crénage de Contraface)
  return `<a:rPr lang="${lang}" sz="${Math.round(r.size * 100)}" b="${f.b}" i="0" kern="100" dirty="0"><a:solidFill><a:srgbClr val="${r.color || "000000"}"/></a:solidFill><a:latin typeface="${esc(f.face)}"/><a:cs typeface="${esc(f.face)}"/></a:rPr>`;
}
// Paragraphe reconstruit à partir des lignes du moteur : retour automatique là où tous les logiciels coupent pareil,
// saut de ligne (Maj+Entrée) là où un logiciel pourrait couper autrement. Le texte reste du vrai texte modifiable.
function paraXml(p, i, lines, lang) {
  const attrs = [`marL="${E(p.marL || 0)}"`, `indent="${E(p.indent || 0)}"`, `algn="${p.align || "l"}"`].join(" ");
  const first = p.runs[0] || { font: "text", size: p.size || 10 };
  const sp = (tag, pt) => `<a:${tag}><a:spcPts val="${Math.round((pt || 0) * 100)}"/></a:${tag}>`;
  const bu = p.bullet
    ? `<a:buClr><a:srgbClr val="${first.color || "000000"}"/></a:buClr><a:buSzPct val="100000"/><a:buFont typeface="${esc((FONT_PPTX[first.font] || FONT_PPTX.text).face)}"/><a:buChar char="${esc(p.bullet.char || "•")}"/>`
    : "<a:buNone/>";
  const pPr = `<a:pPr ${attrs}><a:lnSpc><a:spcPct val="100000"/></a:lnSpc>${sp("spcBef", i > 0 ? p.spcBef : 0)}${sp("spcAft", p.spcAft)}${bu}</a:pPr>`;
  const runs = [];
  lines.forEach((l, k) => {
    for (const s of l.segs) if (s.text) runs.push(`<a:r>${rPr(s, lang)}<a:t>${esc(s.text)}</a:t></a:r>`);
    if (k === lines.length - 1) return;
    const last = l.segs[l.segs.length - 1] || lines[k + 1].segs[0] || first;
    if (l.brk === "wrap") runs.push(`<a:r>${rPr(last, lang)}<a:t xml:space="preserve"> </a:t></a:r>`);
    else runs.push(`<a:br>${rPr(last, lang)}</a:br>`);
  });
  const end = rPr({ ...first, size: first.size || p.size || 10 }, lang).replace("<a:rPr", "<a:endParaRPr").replace("</a:rPr>", "</a:endParaRPr>");
  return `<a:p>${pPr}${runs.join("")}${end}</a:p>`;
}
const parasXml = (paras, lines, lang) => {
  if (!paras.length) return `<a:p><a:endParaRPr lang="${lang}" sz="1000"/></a:p>`;
  return paras.map((p, i) => paraXml(p, i, lines.filter((l) => l.p === i), lang)).join("");
};

function lineXml(b) {
  if (!b) return null;
  return `w="${Math.round(b.pt * 12700)}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="${b.color}"/></a:solidFill><a:prstDash val="solid"/><a:round/><a:headEnd type="none" w="med" len="med"/><a:tailEnd type="none" w="med" len="med"/>`;
}
const ln = (tag, b) => { const x = lineXml(b); return x ? `<a:${tag} ${x}</a:${tag}>` : `<a:${tag} w="0"><a:noFill/></a:${tag}>`; };

function slideXml(page, ctx) {
  let id = 2;
  const out = [];
  const nv = (name, inner) => `<p:cNvPr id="${id++}" name="${esc(name)}"/>${inner}`;
  for (const it of page.items) {
    if (it.t === "master" || it.t === "ph") continue; // l'étiquette vient du masque ; les cadres « à compléter » n'existent que dans l'aperçu
    if (it.t === "rect") {
      out.push(`<p:sp><p:nvSpPr>${nv("Fond", "<p:cNvSpPr/><p:nvPr/>")}</p:nvSpPr><p:spPr><a:xfrm><a:off x="${E(it.x)}" y="${E(it.y)}"/><a:ext cx="${E(it.w)}" cy="${E(it.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${it.fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`);
    } else if (it.t === "line") {
      const x = Math.min(it.x1, it.x2), y = Math.min(it.y1, it.y2);
      out.push(`<p:cxnSp><p:nvCxnSpPr>${nv("Filet", "<p:cNvCxnSpPr/><p:nvPr/>")}</p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="${E(x)}" y="${E(y)}"/><a:ext cx="${E(Math.abs(it.x2 - it.x1))}" cy="${E(Math.abs(it.y2 - it.y1))}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="${Math.round(it.pt * 12700)}"><a:solidFill><a:srgbClr val="${it.color}"/></a:solidFill></a:ln></p:spPr></p:cxnSp>`);
    } else if (it.t === "image") {
      const rid = ctx.addImage(it.key);
      if (!rid) continue;
      out.push(`<p:pic><p:nvPicPr>${nv(it.name || "Photo", '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/>')}</p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${E(it.x)}" y="${E(it.y)}"/><a:ext cx="${E(it.w)}" cy="${E(it.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`);
    } else if (it.t === "text") {
      const i = it.ins;
      out.push(`<p:sp><p:nvSpPr>${nv(it.name, '<p:cNvSpPr txBox="1"/><p:nvPr/>')}</p:nvSpPr><p:spPr><a:xfrm><a:off x="${E(it.x)}" y="${E(it.y)}"/><a:ext cx="${E(it.w)}" cy="${E(it.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="${E(i.l)}" tIns="${E(i.t)}" rIns="${E(i.r)}" bIns="${E(i.b)}" rtlCol="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>${parasXml(it.paras, it.lines, ctx.lang)}</p:txBody></p:sp>`);
    } else if (it.t === "table") {
      const cols = it.cols.map(E);
      const rowsH = it.rows.map((r) => E(r.h));
      const m = it.mar;
      const trs = it.rows.map((r, ri) => `<a:tr h="${rowsH[ri]}">${r.cells.map((c) => {
        const b = c.borders || {};
        const fill = c.fill ? `<a:solidFill><a:srgbClr val="${c.fill}"/></a:solidFill>` : "<a:noFill/>";
        return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${parasXml(c.paras, c.lines, ctx.lang)}</a:txBody><a:tcPr marL="${E(m.l)}" marR="${E(m.r)}" marT="${E(m.t)}" marB="${E(m.b)}" anchor="t">${ln("lnL", b.l)}${ln("lnR", b.r)}${ln("lnT", b.t)}${ln("lnB", b.b)}${fill}</a:tcPr></a:tc>`;
      }).join("")}</a:tr>`).join("");
      out.push(`<p:graphicFrame><p:nvGraphicFramePr>${nv(it.name, '<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/>')}</p:nvGraphicFramePr><p:xfrm><a:off x="${E(it.x)}" y="${E(it.y)}"/><a:ext cx="${cols.reduce((a, b) => a + b, 0)}" cy="${rowsH.reduce((a, b) => a + b, 0)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="0" bandRow="0"><a:tableStyleId>${NO_STYLE}</a:tableStyleId></a:tblPr><a:tblGrid>${cols.map((w) => `<a:gridCol w="${w}"/>`).join("")}</a:tblGrid>${trs}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sld ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${out.join("")}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

const dec = new TextDecoder(), enc = new TextEncoder();

// getImage(key) → { bytes: Uint8Array, ext: 'png'|'jpeg' } | null
export function renderPptx({ pages, template, getImage, fflate, meta = {} }) {
  const files = fflate.unzipSync(template);
  const txt = (n) => dec.decode(files[n]);
  const put = (n, s) => { files[n] = typeof s === "string" ? enc.encode(s) : s; };
  const lang = meta.lang === "en" ? "en-GB" : "fr-FR";

  // disposition « Blank »
  let layout = "slideLayout7.xml";
  for (const n of Object.keys(files)) if (/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(n) && /<p:cSld name="Blank"/.test(txt(n))) layout = n.split("/").pop();

  const media = new Map(); // clé → nom de fichier
  let mediaN = 0;
  const sldIds = [], presRels = [], overrides = [];
  pages.forEach((page, i) => {
    const n = i + 1, rels = [`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/${layout}"/>`];
    const local = new Map();
    const ctx = {
      lang,
      addImage(key) {
        if (local.has(key)) return local.get(key);
        let file = media.get(key);
        if (!file) {
          const im = getImage(key);
          if (!im) return null;
          file = `image${++mediaN}.${im.ext === "jpeg" || im.ext === "jpg" ? "jpeg" : "png"}`;
          put(`ppt/media/${file}`, im.bytes);
          media.set(key, file);
        }
        const rid = `rId${rels.length + 1}`;
        rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${file}"/>`);
        local.set(key, rid);
        return rid;
      },
    };
    put(`ppt/slides/slide${n}.xml`, slideXml(page, ctx));
    put(`ppt/slides/_rels/slide${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`);
    sldIds.push(`<p:sldId id="${255 + n}" r:id="rIdDB${n}"/>`);
    presRels.push(`<Relationship Id="rIdDB${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${n}.xml"/>`);
    overrides.push(`<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`);
  });

  put("ppt/presentation.xml", txt("ppt/presentation.xml").replace("<p:sldSz", `<p:sldIdLst>${sldIds.join("")}</p:sldIdLst><p:sldSz`));
  put("ppt/_rels/presentation.xml.rels", txt("ppt/_rels/presentation.xml.rels").replace("</Relationships>", presRels.join("") + "</Relationships>"));
  put("[Content_Types].xml", txt("[Content_Types].xml").replace("</Types>", overrides.join("") + "</Types>"));
  if (files["docProps/app.xml"]) put("docProps/app.xml", txt("docProps/app.xml").replace(/<Slides>\d+<\/Slides>/, `<Slides>${pages.length}</Slides>`));
  if (files["docProps/core.xml"]) {
    const now = (meta.date ? new Date(meta.date) : new Date()).toISOString().replace(/\.\d+Z$/, "Z");
    let c = txt("docProps/core.xml");
    const set = (tag, v) => { c = new RegExp(`<${tag}[^>]*>[^<]*</${tag}>`).test(c) ? c.replace(new RegExp(`(<${tag}[^>]*>)[^<]*(</${tag}>)`), `$1${esc(v)}$2`) : c.replace("</cp:coreProperties>", `<${tag}>${esc(v)}</${tag}></cp:coreProperties>`); };
    set("dc:title", meta.title || "Digital Book");
    set("dc:creator", meta.author || "STIHL AF/ME");
    set("cp:lastModifiedBy", "STIHL Digital Book Builder");
    c = c.replace(/(<dcterms:modified[^>]*>)[^<]*(<\/dcterms:modified>)/, `$1${now}$2`).replace(/(<dcterms:created[^>]*>)[^<]*(<\/dcterms:created>)/, `$1${now}$2`);
    put("docProps/core.xml", c);
  }
  // [Content_Types].xml en premier dans l'archive
  const ordered = { "[Content_Types].xml": files["[Content_Types].xml"] };
  for (const k of Object.keys(files)) if (k !== "[Content_Types].xml") ordered[k] = files[k];
  return fflate.zipSync(ordered, { level: 6 });
}

export const PPTX_PAGE = { cx: E(PAGE.w), cy: Math.round(PAGE.h * 36000) };

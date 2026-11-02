// Grille de la Fiche d'information — décrite UNE fois, utilisée par l'aperçu, le PDF et le PPTX.
// Mesures relevées dans le XML de la fiche MH 610/710 (référence), en mm. 1 mm = 36 000 EMU.
// Les écarts entre fiches d'origine (jusqu'à 4 mm) sont fixés ici sur une seule valeur.

export const PAGE = { w: 190.5, h: 9906000 / 36000 }; // 6 858 000 × 9 906 000 EMU (préréglage « A4 » de PowerPoint)

export const COLOR = {
  black: "000000",
  white: "FFFFFF",
  orange: "F37A1F", // accent2 du template (charte STIHL)
  rule: "BFBFBF", // bg1 à 75 % dans les fiches d'origine
  band: "F2F2F2", // bg1 à 95 %
  dark: "404040", // en-tête du calendrier
  grid: "A6A6A6",
};

// tailles en pt ; min = taille minimale autorisée par la réduction automatique
export const STYLE = {
  header: { font: "title", size: 16 },
  family: { font: "text", size: 18 },
  familyLine: { font: "title", size: 24 },
  specHead: { font: "title", size: 11, color: COLOR.white },
  specLabel: { font: "bold", size: 8 },
  specUnit: { font: "text", size: 8 },
  specValue: { font: "text", size: 8 },
  featureLabel: { font: "title", size: 14 },
  featureTitle: { font: "bold", size: 14, min: 11 },
  featureText: { font: "text", size: 14, min: 10 },
  featureNote: { font: "text", size: 12, min: 9 },
  heading: { font: "title", size: 12 },
  bullet: { font: "text", size: 11, min: 9 },
  accTitle: { font: "title", size: 12 },
  accCaption: { font: "text", size: 8 },
  section: { font: "title", size: 12 },
  tableHead: { font: "title", size: 10, color: COLOR.white },
  tableBody: { font: "text", size: 10, min: 8 },
  calHead: { font: "bold", size: 9, color: COLOR.white },
  calGroup: { font: "bold", size: 10 },
  calBody: { font: "text", size: 10 },
  footLabel: { font: "title", size: 9, color: COLOR.black },
  footItem: { font: "text", size: 12, color: COLOR.white },
};

const INS = { l: 2.54, t: 1.27, r: 2.54, b: 1.27 }; // marges internes PowerPoint par défaut (91 440 / 45 720 EMU)
export const INSETS = INS;

export const GRID = {
  // commun à toutes les pages
  master: { x: 3005900 / 36000, y: 63500 / 36000, size: 10, text: "Intern | Internal" }, // vient du masque (étiquette Purview)
  header: { x: 3.0, y: 7.1, w: 124.5, h: 23.1, ins: INS },
  logo: { x: 157.1, y: 5.5, w: 28.3, h: 12.3 },
  headerRule: { x: 5.3, y: 29.1, w: 180.1, pt: 1 },

  // page 1
  family: { x: 2.7, y: 28.8, w: 115.1, h: 20.5, ins: INS },
  specs: { x: 5.3, y: 49.9, w: 107.3, labelW: 49.6, headH: 4.9, rowH: 4.6, maxRows: 9, mar: { l: 0.53, r: 0.53, t: 0.53, b: 0.53 }, maxModels: 4 },
  photos: { x: 5.3, w: 107.3, gapTop: 2.5, bottom: 156.0, gap: 3 },
  divider: { x: 117.7, y: 29.2, h: 127.5, pt: 1 },
  featureLabel: { x: 117.2, y: 29.6, w: 68.3, h: 8.8, ins: INS },
  featurePhoto: { x: 121.5, y: 39.0, w: 60.0, h: 48.0 },
  featureText: { x: 117.2, y: 89.0, w: 68.3, h: 67.0, ins: INS },
  band: { x: 5.3, y: 160.2, w: 180.3, h: 58.2 },
  left: { x: 5.3, y: 162.0, w: 84.0, h: 55.0, ins: { l: 3.0, t: 1.27, r: 1.0, b: 1.27 } },
  right: { x: 91.0, y: 162.0, w: 94.4, h: 55.0, ins: { l: 3.0, t: 1.27, r: 1.0, b: 1.27 } },
  bullets: { marL: 7.5, indent: -4.5, spcAft: 3, headAft: 3, headBef: 6 },
  accRule: { x: 5.3, y: 222.7, w: 180.1, pt: 1 },
  accTitleL: { x: 5.3, y: 223.8, w: 81.1, h: 7.7, ins: INS },
  accTitleR: { x: 91.9, y: 223.8, w: 93.5, h: 7.7, ins: INS },
  accDivider: { x: 88.6, y: 225.8, h: 36.4, pt: 1 },
  accThumbsL: { x: 7.0, y: 232.0, w: 78.0, h: 31.0, max: 4 },
  accThumbsR: { x: 93.0, y: 232.0, w: 91.0, h: 31.0, max: 3 },
  bottomRule: { x: 5.3, y: 265.4, w: 180.1, pt: 1 },

  // pages 2 et 3 : blocs empilés entre top et bottom ; au-delà, page « suite »
  flow: { top: 31.0, bottom: 234.5, gap: 3.0, titleH: 7.7, titleToTable: 6.5, x: 5.3, w: 180.0 },
  table: { headH: 6.0, rowH: 4.65, mar: { l: 0.27, r: 0.27, t: 0.21, b: 0.21 }, borderPt: 1 }, // marges de cellule 7 636 EMU comme l'original
  checklist: { w: 113.4, photo: { x: 131.0, w: 50.0, h: 42.0 } },
  calendar: { firstCol: 60.0, monthW: 10.0, headH: 10.0, rowH: 8.0 },
  footer: { x: 5.3, y: 237.0, w: 179.8, h: 31.0, rule: 269.6,
    left: { x: 5.3, y: 238.2, w: 80.8, h: 26.9, ins: INS },
    codes: { x: 88.9, y: 238.2, w: 16.0, h: 26.9, ins: INS },
    right: { x: 103.0, y: 238.2, w: 80.0, h: 26.9, ins: INS } },
};

// Lignes vides par défaut quand un tableau n'est pas rempli (vous les complétez ensuite)
export const BLANK_ROWS = { maintenance: 6, batteryReco: 5, parts: 8, consumables: 2, checklist: 6, accessories: 8, calendar: 6 };

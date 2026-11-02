// Modèle d'un book et résolution avant mise en page.
// Un book stocke des RÉFÉRENCES : machines du catalogue (catId) et blocs partagés (shared). Les valeurs techniques
// des machines du catalogue ne sont jamais copiées dans le book : elles sont relues à chaque aperçu et chaque export.

export const STATUS = { draft: "Brouillon", review: "À valider", valid: "Validé" };

// Blocs partagés : modifiés une fois, repris par tous les books qui les utilisent.
// Contenu de départ = lignes reprises de tes fiches d'origine (aucune donnée inventée).
export const SHARED = {
  "maint-4t": { title: "Maintenance — moteur 4 temps", kind: "maintenance",
    note: "Repris des fiches GR 40/60/80 et MH 610/710 (identiques).",
    rows: [["Vérifier le niveau d'huile", "Avant chaque utilisation"], ["Vérifier le filtre à air", "Avant chaque utilisation"], ["Nettoyer le filtre à air", "Toutes les 20 h ou selon besoin"], ["Vidange moteur 1ère fois", "20 h / 1 mois"], ["Vidange moteur périodique", "100 h / 6 mois"], ["Contrôle de la bougie", "100 h / 6 mois"], ["Inspection revendeur STIHL", "300 h / 12 mois"]].map(([op, interval]) => ({ op, interval })) },
  "maint-2t": { title: "Maintenance — moteur 2 temps", kind: "maintenance", note: "À remplir.", rows: [] },
  "maint-battery": { title: "Maintenance — machine à batterie", kind: "maintenance", note: "À remplir.", rows: [] },
  "battery-reco": { title: "Recommandations batterie (AS / AK / ALLPRO)", kind: "batteryReco",
    note: "Repris de la fiche GTA ; « la débroussailleuse » remplacé par « la machine ».",
    rows: ["Niveau de charge recommandé : entre 40 % et 60 % (2 LED vertes allumées)", "Conserver la batterie hors de portée des enfants", "La stocker dans un endroit propre, sec et fermé", "Toujours la séparer de la machine", "Si elle reste dans le chargeur, débrancher le chargeur du secteur", "Respecter les températures de stockage recommandées", "Recharger une batterie déchargée avant stockage pour éviter tout dommage irréversible"] },
  "conso-4t": { title: "Consommables — moteur 4 temps", kind: "consumables", note: "À remplir.", rows: [] },
  "conso-2t": { title: "Consommables — moteur 2 temps", kind: "consumables", note: "À remplir.", rows: [] },
  "epi": { title: "Équipements de protection (EPI)", kind: "accessories",
    note: "Repris des fiches d'origine (références complètes seulement). Ajouté à la fin du tableau Accessoires.",
    rows: [{ ref: "00008840367", desc: "Lunettes de protection FUNCTION", model: "" }, { ref: "00008840539", desc: "Protection auditive CONCEPT", model: "" }] },
};
// quel bloc partagé peut remplacer quel tableau du book
export const SHARED_FOR = { maintenance: "maintenance", batteryReco: "batteryReco", consumables: "consumables", epi: "accessories" };

export function slug(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
export function newId(names, lang) {
  return `${slug(names.join(" ")).slice(0, 60) || "book"}-${lang}-${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyBook({ machines, lang = "fr", family, tech }) {
  const names = machines.map((m) => m.name);
  return {
    id: newId(names, lang), lang, year: 2027, status: "draft", family, tech, machines,
    familyTitle: "", specKeys: [], feature: { title: "", text: "", note: "", photo: null },
    targets: [], applications: [], argus: [], accIncluded: [], accOptional: [], showOptional: false,
    maintenance: [], batteryReco: [], parts: [], consumables: [], checklist: [], checklistPhoto: null,
    accessories: [], calendar: { rows: [] },
    shared: { maintenance: tech === "petrol" ? "" : "", batteryReco: tech === "battery" ? "battery-reco" : "", consumables: "", epi: "" },
    hide: { apresVente: false, accessoires: false },
  };
}

// Photo du catalogue : fiche { key, w, h, … } (ou ancien format : texte) → clé « cat:<chemin> »
// assets/2026/products/… = photos reprises du catalogue 2026 (site du catalogue) ; img/… = photos envoyées (R2 du catalogue)
export function catImageKey(main) {
  const k = typeof main === "string" ? main : main && typeof main === "object" ? main.key : null;
  if (!k) return null;
  return k.startsWith("cat:") ? k : "cat:" + k;
}
// Machine du catalogue → forme attendue par le moteur
export function catMachine(cat, id) {
  const m = (cat?.machines || []).find((x) => x.id === id);
  if (!m) return null;
  return { name: m.name, family: m.family, tech: m.tech, specs: m.specs || {}, images: { main: catImageKey(m.images?.main) }, source: "catalogue", catId: id };
}

// book enregistré → book complet pour le moteur (machines du catalogue relues, blocs partagés appliqués)
export function resolveBook(book, cat, sharedDocs) {
  const b = JSON.parse(JSON.stringify(book));
  b.machines = (book.machines || []).map((m) => (m.catId ? catMachine(cat, m.catId) || { name: m.name || m.catId, family: book.family, tech: book.tech, specs: {}, images: {}, source: "missing" } : { ...m, source: "book" }));
  const sh = (id) => (id && sharedDocs?.[id]?.rows) || null;
  const s = book.shared || {};
  if (sh(s.maintenance)) b.maintenance = sh(s.maintenance);
  if (sh(s.batteryReco)) b.batteryReco = sh(s.batteryReco);
  if (sh(s.consumables)) b.consumables = sh(s.consumables);
  if (sh(s.epi)) b.accessories = [...(book.accessories || []), ...sh(s.epi)];
  return b;
}

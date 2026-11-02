// Textes fixes des fiches (FR / EN). Les valeurs techniques ne sont jamais ici : elles viennent du catalogue.
// Les libellés des caractéristiques suivent les clés du Catalogue Builder ; une clé inconnue garde le libellé anglais du catalogue.

export const LANGS = ["fr", "en"];

export const T = {
  fr: {
    sheet: "FICHE D'INFORMATION",
    feature: "Fonction spécifique",
    targets: "Groupe cible principal",
    applications: "Applications",
    argus: "Argus",
    accIncluded: "Accessoires inclus",
    accOptional: "Accessoires (en option)",
    maintenance: "Intervalles de maintenance",
    operation: "Opération",
    interval: "Intervalle",
    batteryReco: "Recommandations batterie",
    recommendations: "Recommandations",
    parts: "Pièces de rechange à forte rotation",
    consumables: "Consommables",
    articleNo: "Numéro d'article",
    description: "Description",
    model: "Modèle",
    preDelivery: "Pré-livraison",
    checklist: "CHECKLIST",
    accessories: "Accessoires",
    calendar: "Calendrier d'application",
    usage: "Usage",
    sscTitle: "Supports complémentaires sur SSC",
    sscItems: ["Liste des pièces de rechange", "Temps de réparation", "Instructions de réparation"],
    academyTitle: "Supports complémentaires sur STIHL Academy",
    academyItems: [["eNI", "Information nouveau produit"], ["IM", "Information générale"], ["eSP", "Information technique"]],
    continued: "(suite)",
  },
  en: {
    sheet: "PRODUCT INFORMATION",
    feature: "Special feature",
    targets: "Main target group",
    applications: "Applications",
    argus: "Sales arguments",
    accIncluded: "Included accessories",
    accOptional: "Optional accessories",
    maintenance: "Maintenance intervals",
    operation: "Operation",
    interval: "Interval",
    batteryReco: "Battery recommendations",
    recommendations: "Recommendations",
    parts: "High-turnover spare parts",
    consumables: "Consumables",
    articleNo: "Part number",
    description: "Description",
    model: "Model",
    preDelivery: "Pre-delivery",
    checklist: "CHECKLIST",
    accessories: "Accessories",
    calendar: "Application calendar",
    usage: "Usage",
    sscTitle: "Additional support on SSC",
    sscItems: ["Spare parts list", "Repair times", "Repair instructions"],
    academyTitle: "Additional support on STIHL Academy",
    academyItems: [["eNI", "New product information"], ["IM", "General information"], ["eSP", "Technical information"]],
    continued: "(continued)",
  },
};

// Titre de famille par technologie (bloc A1). EN construit depuis le catalogue si absent.
export const FAMILY_TITLES = {
  fr: {
    cultivator: { petrol: "Motobineuse thermique", battery: "Motobineuse à batterie" },
    auger: { petrol: "Tarière thermique", battery: "Tarière à batterie" },
    pump: { petrol: "Motopompe thermique" },
    generator: { petrol: "Générateur thermique" },
    engine: { petrol: "Moteur stationnaire" },
    sprayer: { petrol: "Atomiseur thermique", battery: "Pulvérisateur à batterie", manual: "Pulvérisateur manuel" },
    harvester: { petrol: "Récolteuse thermique", battery: "Récolteuse à batterie" },
    brushcutter: { petrol: "Débroussailleuse thermique", battery: "Débroussailleuse à batterie" },
    chainsaw: { petrol: "Tronçonneuse thermique", battery: "Tronçonneuse à batterie" },
    polepruner: { petrol: "Perche élagueuse thermique", battery: "Perche élagueuse à batterie" },
    chains: { manual: "Chaînes et guide-chaînes" },
    hedgetrimmer: { petrol: "Taille-haies thermique", battery: "Taille-haies à batterie" },
    cutoff: { petrol: "Découpeuse thermique", battery: "Découpeuse à batterie" },
    blower: { petrol: "Souffleur thermique", battery: "Souffleur à batterie" },
    vacuumshredder: { petrol: "Aspiro-broyeur thermique", battery: "Aspiro-broyeur à batterie" },
    shredder: { petrol: "Broyeur thermique", electric: "Broyeur électrique" },
    pressurecleaner: { battery: "Nettoyeur haute pression à batterie", electric: "Nettoyeur haute pression électrique" },
    vacuum: { battery: "Aspirateur eau et poussière à batterie", electric: "Aspirateur eau et poussière électrique" },
    rideon: { petrol: "Tracteur de pelouse thermique", battery: "Tracteur de pelouse à batterie" },
    lawnmower: { petrol: "Tondeuse thermique", battery: "Tondeuse à batterie", electric: "Tondeuse électrique" },
    lubricants: { manual: "Lubrifiants et graisses" },
    handtools: { manual: "Outils manuels et forestiers" },
    ppe: { manual: "Équipements de protection individuelle" },
    batteries: { battery: "Batteries et chargeurs" },
  },
};

export const SPEC_LABELS = {
  fr: {
    engineType: "Type de moteur", motor: "Moteur", displacement: "Cylindrée", power: "Puissance du moteur", ratedOutput: "Puissance nominale",
    voltage: "Tension nominale", drive: "Entraînement", tillingSet: "Jeu de fraises Ø", workingWidth: "Largeur de travail", pto: "Prise de force (PTO)",
    runtime: "Autonomie*", weight: "Poids", fuelTank: "Capacité du réservoir de carburant", spindleSpeed: "Vitesse de la broche",
    augerDiameter: "Ø de tarière (trous verticaux)", hose: "Raccord de tuyau", output: "Débit max.", suction: "Hauteur d'aspiration max.",
    pumpingHeight: "Hauteur de refoulement max.", continuousPower: "Puissance continue", maxPower: "Puissance max.", voltageFrequency: "Tension / fréquence",
    sockets: "Prises", runtimeHalf: "Autonomie à 50 % de charge", electricStart: "Démarrage électrique", torque: "Couple max.", shaftDiameter: "Diamètre de l'arbre",
    shaftLength: "Longueur de l'arbre", dimensions: "Dimensions (L × l × H)", airThroughput: "Débit d'air max.", pressure: "Pression de pulvérisation max.",
    flowRate: "Débit volumique", capacity: "Capacité du réservoir", length: "Longueur totale", cuttingTool: "Outil de coupe standard", handle: "Poignée",
    bar: "Longueur du guide-chaîne", chainType: "Type de chaîne", pitch: "Pas de chaîne", powerWeight: "Rapport poids / puissance", oilTank: "Capacité du réservoir d'huile",
    overallLength: "Longueur totale", gauge: "Épaisseur des maillons", use: "Utilisation", strokeRate: "Nombre de courses", cuttingLength: "Longueur de coupe",
    toothSpacing: "Écartement des dents", bladeOpening: "Ouverture max. des lames", sound: "Niveau de pression sonore", wheel: "Ø du disque",
    cuttingDepth: "Profondeur de coupe max.", blowingForce: "Force de soufflage", airSpeed: "Vitesse de l'air max.", bag: "Volume du sac", branch: "Ø de branche max.",
    motorType: "Type de moteur", maxPressure: "Pression max.", workingPressure: "Pression de travail", maxFlow: "Débit d'eau max.", powerConsumption: "Puissance absorbée",
    maxTemp: "Température d'entrée max.", pumpHead: "Matériau de la tête de pompe", maxPowerW: "Puissance max.", operatingPressure: "Pression de fonctionnement",
    airflow: "Débit d'air", tank: "Volume de la cuve", soundPower: "Niveau de puissance sonore", engineModel: "Moteur", cuttingWidth: "Largeur de coupe",
    cuttingHeight: "Hauteur de coupe", speedForward: "Vitesse avant", speedBackward: "Vitesse arrière", lawnArea: "Surface de pelouse jusqu'à",
    catcher: "Bac de ramassage", packSize: "Conditionnements", branchDiameter: "Ø de branche jusqu'à", weightG: "Poids", sizes: "Tailles", material: "Matériau",
    standard: "Norme", energy: "Énergie", chargeTime: "Temps de charge",
  },
};

export function familyTitle(lang, family, tech, techs) {
  const t = FAMILY_TITLES[lang]?.[family?.id]?.[tech];
  if (t) return t;
  const prefix = techs?.find((x) => x.id === tech)?.prefix || "";
  const s = `${prefix} ${family?.noun || family?.name || ""}`.trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function specLabel(lang, spec) {
  return SPEC_LABELS[lang]?.[spec.k] || spec.label;
}

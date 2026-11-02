// Parcours de l'éditeur en mode démonstration (sans serveur d'API) : copie d'un exemple, modification, enregistrement,
// nouveau book hors catalogue, bloc partagé, collage depuis Excel, photo, exports, onglets mobiles.
const { chromium, devices } = require("playwright");
const fs = require("fs"), path = require("path");
const OUT = process.argv[2] || "out/e2e-editor", URL = process.argv[3] || "http://localhost:8787/";
fs.mkdirSync(OUT, { recursive: true });
const ok = (c, m) => { console.log((c ? "OK   " : "ÉCHEC ") + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(URL + "#/books"); await p.waitForSelector("#btnNew");
  // 1. copier l'exemple MH
  await p.click("[data-copy^='mh-610-710']"); await p.waitForSelector(".sheet");
  ok(/#\/book\//.test(p.url()), "copie de l'exemple MH ouverte dans l'éditeur");
  await p.click("details[data-sec=feat] summary");
  await p.fill("[data-path='feature.title']", "Prise de force (PTO) — test");
  await p.waitForTimeout(700);
  ok((await p.textContent("#edState")).includes("non enregistrées"), "modification signalée « non enregistrée »");
  ok((await p.textContent("#preview")).includes("Prise de force (PTO) — test"), "aperçu mis à jour en direct");
  await p.click("#edSave"); await p.waitForTimeout(300);
  ok((await p.textContent("#edState")).includes("Enregistré"), "enregistrement");
  await p.reload(); await p.waitForSelector(".sheet");
  ok((await p.textContent("#preview")).includes("— test"), "modification retrouvée après rechargement");
  // export
  const [d1] = await Promise.all([p.waitForEvent("download"), p.click("#edPptx")]); await d1.saveAs(path.join(OUT, d1.suggestedFilename()));
  const [d2] = await Promise.all([p.waitForEvent("download"), p.click("#edPdf")]); await d2.saveAs(path.join(OUT, d2.suggestedFilename()));
  ok(d1.suggestedFilename().endsWith(".pptx") && d2.suggestedFilename().endsWith(".pdf"), `exports ${d1.suggestedFilename()} / ${d2.suggestedFilename()}`);
  await p.screenshot({ path: path.join(OUT, "1-editeur-mh.png") });
  // 2. nouveau book hors catalogue
  await p.goto(URL + "#/books"); await p.click("#btnNew");
  await p.click("[data-act=t-free]"); await p.fill("#fName", "MSA 220 C-B");
  await p.selectOption("#fFam", "chainsaw"); await p.selectOption("#fTech", "battery");
  await p.click("[data-act=create]"); await p.waitForSelector(".sheet");
  await p.fill("[data-path='machines.0.specs.weight']", "3,6"); await p.waitForTimeout(600);
  ok((await p.textContent("#preview")).includes("3,6"), "valeur saisie pour une machine hors catalogue");
  await p.click("details[data-sec=cible] summary");
  await p.fill("[data-lines=argus]", "Coupe rapide grâce à la chaîne 1/4\" P\nAutonomie pour une journée de taille");
  await p.click("details[data-sec=p2] summary");
  await p.click("[data-paste=parts]"); await p.fill("#pasteBox", "0000 400 7029\tBougie\tMSA 220 C-B\n1234 567 8900\tFiltre\tMSA 220 C-B");
  await p.click("[data-act=ok]"); await p.waitForTimeout(600);
  ok((await p.textContent("#preview")).includes("0000 400 7029"), "collage de 2 lignes depuis Excel");
  // photo : fonction spécifique
  await p.click("details[data-sec=feat] summary");
  await p.setInputFiles("[data-photo='feature.photo']", "public/samples/mh/pto.png"); await p.waitForTimeout(1200);
  ok((await p.$$eval(".sheet img", (a) => a.length)) >= 2, "photo envoyée et visible dans l'aperçu");
  await p.click("#edSave"); await p.waitForTimeout(300);
  // 3. bloc partagé batterie
  await p.goto(URL + "#/shared"); await p.click("[data-shsave=battery-reco]"); await p.waitForTimeout(300);
  await p.goto(URL + "#/books"); await p.click("a.btn[href*='msa-220-c-b']"); await p.waitForSelector(".sheet"); await p.waitForTimeout(600);
  ok((await p.textContent("#preview")).includes("Toujours la séparer de la machine"), "bloc partagé « Recommandations batterie » repris dans le book");
  // 4. historique
  await p.click("#edMore"); await p.click("[data-act=hist]"); await p.waitForTimeout(300);
  ok((await p.$$("#dlgBody .hist li")).length >= 1, "historique : version précédente disponible");
  await p.click("[data-act=close]");
  await p.screenshot({ path: path.join(OUT, "2-editeur-msa.png") });
  // 4b. machine du catalogue avec photo au format du Catalogue Builder ({ key, w, h })
  await p.route("**/cat-img/assets/**", (r) => r.fulfill({ path: "/home/claude/stihl-catalogue-2027/public/" + new (require("url").URL)(r.request().url()).pathname.replace(/^\/cat-img\//, ""), contentType: "image/jpeg" }));
  await p.goto(URL + "#/books"); await p.click("#btnNew"); await p.fill("#pickQ", "ASA");
  await p.check("[data-mid='asa-20']"); await p.click("[data-act=create]"); await p.waitForSelector(".sheet"); await p.waitForTimeout(800);
  const prev = await p.textContent("#preview");
  ok(prev.includes("10.8") && prev.includes("0.98"), "ASA 20 : caractéristiques lues dans le catalogue");
  ok(await p.$$eval(".sheet img[alt='photo produit']", (a) => a.length) === 1, "ASA 20 : photo du catalogue affichée");
  ok(!(await p.$("#edForm .err")), "ASA 20 : aucune erreur d'affichage");
  await p.screenshot({ path: path.join(OUT, "2b-editeur-asa20.png") });
  // 4c. caractéristiques modifiables + proposition d'envoi au catalogue
  await p.fill("[data-cspec='asa-20|weight']", "1.05"); await p.dispatchEvent("[data-cspec='asa-20|weight']", "change");
  await p.waitForSelector("#dlg[open] [data-act=book]");
  ok((await p.textContent("#dlgBody")).includes("Ajouter aussi au catalogue"), "valeur modifiée : le site propose de l'ajouter au catalogue");
  await p.click("#dlg [data-act=book]"); await p.waitForTimeout(600);
  ok((await p.textContent("#preview")).includes("1.05") && (await p.textContent("#qcBox")).includes("Valeur modifiée dans ce book"), "valeur modifiée dans le book seulement, signalée au contrôle");
  await p.fill("[data-cspec='asa-20|sound']", "71"); await p.dispatchEvent("[data-cspec='asa-20|sound']", "change");
  await p.waitForSelector("#dlg[open] [data-act=cat]"); await p.click("#dlg [data-act=cat]"); await p.waitForTimeout(600);
  ok(!(await p.$eval("[data-cspec='asa-20|sound']", (e) => e.classList.contains("edited"))) && (await p.textContent("#preview")).includes("71"), "valeur envoyée au catalogue (plus marquée comme modifiée)");
  await p.click("#addSpec"); await p.fill("#asLab", "Vitesse de coupe"); await p.fill("#asUnit", "coupes/s"); await p.fill("#asEn", "Cutting speed"); await p.fill("#asV0", "2");
  await p.click("#dlg [data-act=book]"); await p.waitForTimeout(600);
  ok((await p.textContent("#preview")).includes("Vitesse de coupe"), "ligne de caractéristique ajoutée au book");
  await p.click("#edSave"); await p.waitForTimeout(300);
  // 4d. tableau de bord
  await p.goto(URL + "#/"); await p.waitForSelector(".kpis"); await p.waitForTimeout(1500);
  const kerr = await p.textContent("#kErr b");
  ok(/^\d+$/.test(kerr), `tableau de bord : ${await p.$$eval(".kpi", (a) => a.length)} indicateurs, books avec défaut bloquant = ${kerr}`);
  await p.screenshot({ path: path.join(OUT, "2c-tableau-de-bord.png"), fullPage: true });
  // 5. mobile
  const m = await (await b.newContext({ ...devices["iPhone 13"], acceptDownloads: true })).newPage();
  m.on("pageerror", (e) => errs.push(e.message));
  await m.goto(URL + "#/books"); await m.waitForSelector("#btnNew");
  await m.click("[data-copy^='msa-220-c-b']"); await m.waitForSelector("#edForm");
  await m.screenshot({ path: path.join(OUT, "3-mobile-contenu.png") });
  await m.click(".mtabs [data-tab=prev]"); await m.waitForTimeout(500);
  await m.screenshot({ path: path.join(OUT, "4-mobile-apercu.png") });
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "pas de défilement horizontal sur téléphone");
  ok(!errs.length, "aucune erreur JavaScript" + (errs.length ? " : " + errs.join(" | ") : ""));
  await b.close();
})();

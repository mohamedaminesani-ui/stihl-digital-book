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
  await p.goto(URL); await p.waitForSelector("#btnNew");
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
  await p.goto(URL + "#/"); await p.click("#btnNew");
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
  await p.goto(URL + "#/"); await p.click("a.btn[href*='msa-220-c-b']"); await p.waitForSelector(".sheet"); await p.waitForTimeout(600);
  ok((await p.textContent("#preview")).includes("Toujours la séparer de la machine"), "bloc partagé « Recommandations batterie » repris dans le book");
  // 4. historique
  await p.click("#edMore"); await p.click("[data-act=hist]"); await p.waitForTimeout(300);
  ok((await p.$$("#dlgBody .hist li")).length >= 1, "historique : version précédente disponible");
  await p.click("[data-act=close]");
  await p.screenshot({ path: path.join(OUT, "2-editeur-msa.png") });
  // 5. mobile
  const m = await (await b.newContext({ ...devices["iPhone 13"], acceptDownloads: true })).newPage();
  m.on("pageerror", (e) => errs.push(e.message));
  await m.goto(URL); await m.waitForSelector("#btnNew");
  await m.click("[data-copy^='msa-220-c-b']"); await m.waitForSelector("#edForm");
  await m.screenshot({ path: path.join(OUT, "3-mobile-contenu.png") });
  await m.click(".mtabs [data-tab=prev]"); await m.waitForTimeout(500);
  await m.screenshot({ path: path.join(OUT, "4-mobile-apercu.png") });
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "pas de défilement horizontal sur téléphone");
  ok(!errs.length, "aucune erreur JavaScript" + (errs.length ? " : " + errs.join(" | ") : ""));
  await b.close();
})();

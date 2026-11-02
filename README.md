# STIHL Digital Book Builder · AF/ME

Plateforme privée pour remplir les **digital books d'après-formation** (« Fiche d'information » de 3 pages par machine ou par gamme) et les exporter en **PPTX éditable** et en **PDF**, prêts à envoyer aux importateurs.

## Principe : un seul moteur de mise en page
La grille de la fiche est décrite **une fois** (`public/js/engine/spec.js`, mesures relevées dans le XML de la fiche MH 610/710 d'origine). Le moteur (`layout.js` + `text.js`) transforme un book en pages d'éléments positionnés au 1/1000 mm, lignes de texte déjà coupées. Ces pages alimentent trois rendus :

| Rendu | Fichier | Comment |
|---|---|---|
| Aperçu | `render-html.js` | chaque ligne posée à sa ligne de base, polices Contraface web |
| PDF | `render-pdf.js` | pdf-lib, Contraface embarquée, crénage reproduit |
| PPTX | `render-pptx.js` | injecté dans `public/template/fiche.pptx` (masque, dispositions, thème, étiquette « Intern \| Internal » de la fiche d'origine) ; vrai texte, vrais tableaux |

Règles du moteur :
- Coupure des lignes décidée sur la largeur **sans** crénage (la plus large), mots posés **avec** crénage. Là où un logiciel qui crène pourrait couper autrement, le PPTX reçoit un saut de ligne (Maj+Entrée) : les coupures sont les mêmes dans PowerPoint, LibreOffice, l'aperçu et le PDF.
- Texte trop long : réduction par pas de 0,5 pt jusqu'à la taille minimale du style, sinon défaut **bloquant** signalé en rouge. Jamais de texte coupé en silence.
- Tableaux trop longs (pages 2 et 3) : texte réduit à 9,5 puis 9 pt pour tenir sur la page, sinon page « (suite) » automatique.
- Aucune valeur technique inventée : une valeur absente du catalogue reste vide et est signalée.

## Utilisation
- **Books** : la bibliothèque. « Nouveau book » : 1 à 4 machines du Catalogue Builder (même famille, même technologie), ou une machine hors catalogue (machines 2026 ou « uniquement en DIGIBOOK »). Les exemples se copient dans « Mes books ».
- **Éditeur** : un formulaire par bloc (machines et caractéristiques, fonction spécifique, cibles / applications / argus, accessoires, page 2, page 3), aperçu en direct à côté (onglets Contenu / Aperçu / Contrôle sur téléphone). Valeurs du catalogue verrouillées ; tableaux éditables avec « Coller depuis Excel » ; photos par glisser-déposer (2400 px max., transparence PNG gardée) ; pages 2 et 3 masquables.
- **Statuts** Brouillon / À valider / Validé (« Validé » refusé s'il reste un défaut bloquant), historique avec restauration, alerte « modifications non enregistrées », anti-écrasement, duplication, copie FR → EN à traduire.
- **Blocs partagés** : maintenance 4T / 2T / batterie, recommandations batterie, consommables, EPI. Modifiés une fois, repris dans tous les books qui les utilisent.

## Données
- **Caractéristiques, familles, photos produit** : lues dans la base du Catalogue Builder (D1 `catalogue-2027`, R2 `catalogue-2027-photos`) via les bindings `CATALOGUE` et `CAT_PHOTOS`, en lecture seule.
- **Books, blocs partagés, historique** : D1 `digital-book`, photos R2 `digital-book-photos`. Chaque enregistrement envoie la version lue (409 en cas de conflit, rien n'est écrasé) ; l'historique garde les versions précédentes.

## Arborescence
- `src/worker.js` — API Cloudflare Worker (session, catalogue en lecture, books versionnés, photos).
- `public/` — le site, sans compilation : `index.html`, `js/app.js` (bibliothèque, éditeur, blocs partagés), `js/model.js` (book, blocs partagés, résolution), `js/api.js` (API ou mode démonstration), `js/studio.js` (liaison navigateur), `js/engine/` (moteur), `template/fiche.pptx`, `fonts/`, `vendor/` (pdf-lib 1.17.1, fontkit 1.1.1, fflate 0.8.2), `samples/` (exemples de démonstration).
- `tools/make_template.py` — reconstruit `template/fiche.pptx` à partir d'une fiche d'origine.
- `tests/` — `build.mjs` (exemples PPTX + PDF), `parity.py` (preuve de parité), `worker.test.mjs` (API), `e2e.cjs` et `e2e-editor.cjs` (navigateur, mobile et ordinateur).

## Tests
```bash
node tests/build.mjs out                                   # PPTX + PDF + aperçus des exemples
soffice --headless --convert-to pdf --outdir out/lo out/*.pptx
python3 tests/parity.py out/<book>.pdf out/lo/<book>.pdf out/<id>.layout.json out/parite-<id>
node tests/worker.test.mjs                                 # API avec une D1 simulée
cd public && python3 -m http.server 8787 & node tests/e2e.cjs out/e2e
```
La parité se mesure avec Contraface installée (copies renommées « STIHL Contraface Text » et « STIHL Contraface Display Title »).

## Mise en ligne
1. Cloudflare › Workers & Pages › Create › Import a repository › ce dépôt › Deploy. Chaque envoi sur `main` redéploie le site.
2. Worker `stihl-digital-book` › Settings › Variables and Secrets › Add › Secret `ADMIN_PASSWORD`.
Base `digital-book` et compartiment `digital-book-photos` déjà créés ; identifiants dans `wrangler.jsonc`.

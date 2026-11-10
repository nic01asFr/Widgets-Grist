# Harnais de non-regression qgis2grist (index_v2.html)

But : apres toute modification d'`index_v2.html` ou de `lib/q2g-*.js`, refaire la
capture dans un vrai navigateur et obtenir un ecart nul (ou un ecart precis) par
rapport aux golden suivis dans `tests/golden/`.

Ce harnais ne touche ni Atlas, ni `published/`. Il n'ecrit que dans
`tests/harness/_sortie/` (ignore par git) et, sur demande explicite, dans `tests/golden/`.

## 1. Lancer le serveur

```
node tests/harness/serveur.mjs          # http://127.0.0.1:8711/index_v2.html
```

Sert `projects/qgis2grist` (no-store, MIME corrects) et `/grist_forms/*` depuis le
dossier frere `projects/grist_forms` (lecture seule, car `index_v2.html` charge
`../grist_forms/shared/publish.js`). `POST /__sortie/<nom>.json` ecrit dans
`tests/harness/_sortie/`. Arreter le serveur a la fin (Ctrl+C / fermer le processus).
Le navigateur doit avoir acces a Internet : `index_v2.html` charge grist-plugin-api,
JSZip, MapLibre, et `loadSqlJs` / `loadProj4` chargent sql.js et proj4 depuis cdnjs.

## 2. Capturer (chrome-devtools MCP)

1. `new_page` / `navigate_page` sur `http://127.0.0.1:8711/index_v2.html` (page neuve a chaque capture).
2. `evaluate_script` :

```js
async () => {
  await new Promise((ok, ko) => { const s = document.createElement('script');
    s.src = '/tests/harness/golden-run.js'; s.onload = ok; s.onerror = () => ko(new Error('chargement'));
    document.head.appendChild(s); });
  return (await window.__q2gGolden.runEtEnvoyerTout()).length;   // 19 fichiers attendus : 14 parse + 5 import
}
```

Les scenarios d'import sont `bees`, `marseille_qfield`, `marseille_webmap`, `nimes_flood` et `wastewater`.
Depuis le 09/11/2026 le profil d'import RAPIDE (lots de 5000 lignes ou 700 Ko) est le defaut de `index_v2.html` ;
`?perf=standard` revient aux lots d'origine (100 lignes avec geometrie, 500 sinon). Les golden d'import ont ete
promus avec le profil rapide : capturer sur `http://127.0.0.1:8711/index_v2.html` sans parametre. `?carte=legacy`
et `?atlas=<adresse>` n'ont pas d'effet sur la capture (`showMap` est un espion).

Options : `runEtEnvoyerTout({sansImport:true})`, `{sansParse:true}`, `{scenarios:['bees']}`.
`window.__q2gGolden.run()` rend l'objet complet sans rien ecrire ; `runImport('bees')`
rend `{golden, brut}`.

Fichiers produits dans `tests/harness/_sortie/` :
`parse-<fixture>.json` (14 dont `unitaires.json`), `import-<scenario>.json` (5) et
`import-<scenario>.brut.json` (actions Grist brutes, entree du rejeu en 4) : 19 captures a comparer.

## 3. Comparer

```
node tests/harness/comparer.mjs                 # toutes les captures
node tests/harness/comparer.mjs import-bees     # une seule
node tests/harness/comparer.mjs --max=100       # plus d'ecarts affiches
```

Code retour 0 = identique, 1 = ecart (chemin JSON, valeur golden, valeur capturee), 2 = golden ou capture manquant.
Pour accepter un changement VOULU : `node tests/harness/comparer.mjs --promouvoir` (copie
`_sortie/` vers `tests/golden/parse|import/`), puis relire le diff git des golden.

## Ce que contiennent les golden

- `tests/golden/parse/parse-<fixture>.json` : sortie des parseurs globaux (`parseZipFile`,
  `parseQgzFile`, `parseQgsXml`, `parseGpkgFile`, `parseQgis2webHtml`) sur 13 fixtures :
  couches completes (champs, styles, options, relations) ; entites resumees (compte, 3
  premieres, derniere, empreinte de hachage de TOUTES les entites) ; `_currentMeta`.
- `tests/golden/parse/unitaires.json` : fonctions pures sur entrees fixes (sanitize*, inferType,
  jsTypeToGrist, qgsTypeToGrist, rgbaCssToHex, resolveRefType, normalizeGeomType,
  linearizeArc3, buildLayerFromGeojson, flattenGeoJsonFeatures, detectGeomTypeFromFeatures,
  topoSortByRefs, buildRefLookupNeeds, parseGpkgGeom sur WKB construits, parseQgis2webStyleBody).
- `tests/golden/import/import-<scenario>.json` : `showPreview` + `startImport()` reels contre un
  faux Grist en memoire (scenarios `bees`, `marseille_qfield`, `marseille_webmap`, `nimes_flood`, `wastewater`) :
  suite des `applyUserActions` (AddTable avec types/libelles/widgetOptions, BulkAddRecord par
  colonne avec compte + empreinte, rowIds simules 1..n), lectures, toasts, tables finales, et les
  couches telles que passees a `showMap` (`_geometryCols`, `_fillColorCol`, `_lod`, couleurs).
  Les tables `SceneManifest`, `QgisWidgets` et `Formulaires` y figurent EN ENTIER (manifest
  Scene V0.2.x, config v3, FormDef), dates et hachage du manifest masques (`<DATE>`, `<HASH>`).
  `showMap` et `showToast` sont remplaces par des espions pendant la capture.

Les fonctions sont appelees par leur nom global : apres modularisation, garder des
enveloppes globales de meme nom/signature dans `index_v2.html` (sinon l'ecart sera
`{"absente": true}` dans `unitaires.json` ou une erreur de capture).

## 4. Rejeu en Grist reel (docs.getgrist.com, document anonyme jetable)

Les widgets locaux sont bloques par Grist cloud : on rejoue les actions brutes
via l'API interne de la page Grist.

1. `new_page` sur `https://docs.getgrist.com/` (visiteur `@Guest`), cookies : Refuser,
   bouton « Blank document ». Ne jamais utiliser un document de l'utilisateur.
2. Verifier : `window.gristDocPageModel.gristDoc.get().docData.sendActions` est une fonction.
3. `fetch('http://127.0.0.1:8711/...')` depuis docs.getgrist.com se bloque (acces reseau local
   non accorde) : passer les fichiers par un `<input type=file>` injecte, puis `upload_file` :
   - `evaluate_script` : creer `<input type=file id=q2g-upload multiple>` dans `document.body` ;
   - `take_snapshot` pour obtenir son uid, `upload_file` avec `tests/harness/rejeu-grist.js`,
     puis `evaluate_script` : `(0,eval)(await document.getElementById('q2g-upload').files[0].text())` ;
   - `upload_file` avec `tests/harness/_sortie/import-<scenario>.brut.json` puis :

```js
async () => {
  const brut = JSON.parse(await document.getElementById('q2g-upload').files[0].text());
  const rap = await window.__q2gRejeu.rejouer(brut);   // { acceptees, refusees, erreurs, tables, ecarts }
  await window.__q2gRejeu.nettoyer(brut);               // supprime les tables creees
  return rap;
}
```
4. Fermer l'onglet Grist a la fin. (Piege : apres `select_page`, l'onglet selectionne peut
   changer ; verifier avec `list_pages`.) Si le rejeu en grand est trop lourd, `node tests/harness/reduire-brut.mjs <scenario> 2`
   produit une version reduite (15 Ko) collable directement dans `evaluate_script`.

`rejouer` compare ce que l'AddTable demandait a ce que Grist a cree : type de base, libelle,
description, choix (`Choice`), cible des `Ref`, renommages de colonne/table. Attendu : 0 refusee, 0 ecart.

## 5. Mesures de l'interface (hors golden)

Trois scripts a charger par `evaluate_script` (comme `golden-run.js`), sans ecriture :

- `tests/harness/mesures-ui.js` -> `window.__q2gMesures` : `barre()` (rectangles des zones de la barre du haut, etat de
  synchronisation visible / dans l'en-tete / tronque, recouvrements, defilement horizontal), `contrastes({ tout, racine })`
  (paires texte / fond sous 4,5:1, couleurs composees jusqu'au fond reel ; `tout: true` liste aussi celles qui passent),
  `cibles()` (boutons et champs sous 44 px, a lancer avec `emulate` `390x844x2,mobile,touch`), `polices()` (textes sous 11 px).
  Procedure : `emulate` une largeur (1500, 1250, 1000, 824, puis 390 mobile : l'emulation mobile recharge la page, rejouer l'ouverture),
  cliquer la fixture « Dev localhost » QField Wastewater, `showPreviewMap()`, attendre 3 a 4 s, puis `barre()` ; ouvrir chaque
  bouton `[aria-expanded]` du tiroir et relancer `contrastes()`, `polices()` et `cibles()`.
- `tests/harness/faux-docapi.js` -> `window.__q2gFaux.installer({ latenceMs, tables })` : faux `docApi` en memoire (listTables,
  fetchTable colonaire, AddTable / AddColumn / AddRecord / UpdateRecord ; toute autre action est refusee et le journal garde sa trace).
  Avec `_gristAvailable = true; _previewMapMode = false; await chargerVuesAtlas()` il permet d'essayer le panneau Vues
  (enregistrer, renommer, supprimer, focus) sans Grist. Piege : le bouton « Supprimer » se desarme apres 3,5 s ; deux appuis
  sur Entree doivent suivre de pres. La suppression passe par `UpdateRecord` (bloc JSON reecrit), pas par `RemoveRecord`.
- `tests/harness/mesure-carte.js` -> `window.__q2gPerf.mesurer({ jalons, latenceGristMs })` : delai `showPreviewMap` -> toast
  « Carte prete ». Onglet NEUF (`new_page`, mesure, `close_page`) entre deux mesures, 5 mesures, mediane. Pour comparer a un
  commit : `git archive <commit> projects/qgis2grist projects/grist_forms` dans un dossier temporaire, y copier `mesure-carte.js`,
  `node tests/harness/serveur.mjs <autre port>`, arreter ce serveur apres. Le reseau (Atlas sur github.io) donne des valeurs
  aberrantes : comparer les medianes.

Limite de ces mesures : elles tournent en apercu local ou avec le faux `docApi`. Le mode Grist reel (connexion, thème d'instance,
ecriture reelle dans `Atlas_ScenePrefs`, import avec remplacement, fiche d'entite sur un document vivant) reste a verifier a la main
dans un document Grist ouvert avec le widget (`?atlas=` par defaut).

## Ce que le golden NE couvre PAS

- L'interface (preview, panneaux BigQgisMCP, popups, slider, polling) : `showMap` est un espion.
- L'interface du widget autour de la carte (barre du haut, tiroir Couches / Filtres / Legende / Vues, menu Tables liees, fiche
  a sections, pastille de volume, apercu d'import groupe, vues enregistrees) : aucune capture golden. Boucle de developpement
  sans Grist : ouvrir `http://127.0.0.1:8711/index_v2.html`, cliquer une fixture « Dev localhost » (ex. QField Wastewater),
  `showPreviewMap()` dans `evaluate_script`, puis mesurer et capturer (viewport etroit : `emulate` `390x844x2,mobile,touch`).
  Les vues enregistrees se verifient avec un faux `docApi` en memoire (`window.grist = Object.create(grist)` avec une propriete
  `docApi`, puis `_gristAvailable = true; _previewMapMode = false; chargerVuesAtlas()`) ; seule l'ecriture reelle dans
  `Atlas_ScenePrefs` d'un Grist vivant reste a verifier a la main.
- L'interface de la CARTE ATLAS, qui est la carte par defaut : iframe du composant publie, `setScene`, `setTheme` et `setFond`
  (theme : `Theme_document`, puis theme de l'instance Grist, puis rendu d'origine ; le fond d'Atlas suit tout theme applique),
  fiche et bulle (dates et references lisibles), filtres, legende, synchronisation, liste blanche de `?atlas=`, garde contre
  le double import. Ces parties ont des tests Node (`q2g-atlas-host.test.js`, `q2g-theme.test.js`, `q2g-html.test.js`,
  `q2g-garde.test.js`, avec un faux client Atlas) mais AUCUNE capture navigateur ; elles se verifient a la main, dans Grist,
  avec la carte par defaut, puis avec `?carte=legacy`.
- Le comportement d'un vrai Grist sur les valeurs (le faux Grist ne valide ni types ni Ref ; le rejeu reel
  ne verifie que schema + acceptation, et les lignes comptees, pas leurs valeurs une a une).
- Les chemins d'erreur d'import (collisions de nom de table avec `replaceExisting`, tables existantes,
  renommage de colonnes par Grist, longueur de batch 100/500 selon geometrie : seul le cas nominal est capture).
- La restauration au chargement (`loadLatestWidget`), la publication de pack QField, le mode terrain (`terrain.html`).
- Le drag-and-drop et `handleFile` lui-meme (l'aiguillage par extension est reproduit par le harnais).
- `index.html` (v1) et `terrain.html`.
- Les fixtures absentes : `qgis2grist_marseille4e.qgz` seul donne 0 couche (comportement actuel, fige tel quel) ;
  `qgis2grist_marseille4e_voirie.gpkg` contient une table vide (0 entite, type Polygon par defaut).
- L'empreinte des entites est un hachage non cryptographique ; une collision est improbable, pas impossible.
- Les golden dependent de la version des bibliotheques CDN (sql.js 1.12.0, proj4 2.9.0, JSZip 3.10.1).

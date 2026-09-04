# Projet : Atlas — Maquette 3D Territoriale

## Contexte

Widget Grist de maquette territoriale 3D (MapLibre + three.js), direction UX **Atlas**.
Cible : construire et présenter une scène (import, symbolisation, contrôles, récit, modèles 3D).

Interop Cerema : lecture **Scene Manifest V0.2.2** produit par qgis2grist, prefs utilisateur
`Atlas_LayerPrefs`, récit `Atlas_Story`.

## Architecture des fichiers

```
Atlas/
├── index_v7.html          # Entrée courante (v7) — source de publication
├── app_v7.js              # Logique v7 (ES module)
├── lib/                   # Binding Scene Manifest / Grist / contrôles / récit
│   ├── scene-loader.js
│   ├── declarative-style.js
│   ├── controls.js
│   ├── manifest-binding.js
│   ├── story.js
│   ├── grist-sync.js
│   ├── grist-rows.js
│   ├── grist-bool.js
│   ├── geo-tables.js
│   └── viewport.js
├── docs/
│   ├── BINDING-ATLAS-v7.md
│   ├── CADRAGE-BINDING-COMPLET.md
│   └── MANUAL_TEST.md
├── tests/                 # node --test
└── CLAUDE.md
```

> **`projects/Atlas/app.js` sur `origin/main` — ne pas écraser.**
> Cette entrée pré-v7 (3 110 lignes) porte deux fonctionnalités **absentes de la
> v7 et de la version en ligne** : l'export QGIS (`layerToQML`, `qgisSymbol`,
> `hexToQgisColor`, `downloadFile`) et le modèle 3D par objet en pièce jointe
> Grist (`model_glb`, colonne `Attachments`). Elles ont quitté le widget lors du
> passage à la v7, le 30 juillet 2026 — sans décision explicite : la v7 a été
> développée sur une branche qui ignorait cette lignée.
>
> Tant qu'elles ne sont pas portées dans la v7, ce fichier est leur **dernière
> copie**. Les versions de travail pré-v7 ont été retirées du poste
> (sauvegarde : `backups/atlas-prev7/`) parce qu'un `git add projects/Atlas/`
> aurait remplacé la version complète par une copie tronquée de 2 371 lignes.
>
> Portage : l'export QGIS ≈ 108 lignes, quatre fonctions isolables en
> `lib/qgis-export.js` — mais le QML doit alors être **généré depuis le
> StyleDeclarative**, pas depuis l'état interne, pour respecter
> `BINDING-QGIS-GRIST-CEREMA-v2.md` §5.2. Pour `model_glb`, arbitrer d'abord la
> coexistence avec le catalogue partagé (`catalog.json`) : pièce jointe par objet
> > `gltf_url` de couche > catalogue > cercle 2D.

**Publication** : `published/atlas/` = copie de `index_v7.html` → `index.html`, `app_v7.js` → `app.js`, + `lib/`.

## Décisions techniques

1. **MapLibre GL JS v5** (globe) — plus de Mapbox.
2. **Modèles 3D** : custom layer three.js / InstancedMesh (`Models3D`).
3. **Fonds** : OpenFreeMap + IGN Géoplateforme.
4. **Binding** : Scene Manifest → style + controls ; prefs Atlas prioritaires (voir `docs/BINDING-ATLAS-v7.md`).
5. **Inspecteur droit** : ouvert au clic couche ; fermeture via ✕ (pas de pastille flottante).
6. **Dock soleil** : barre compacte ancrée à gauche de la boussole, repliable en pastille soleil.

## Modules UI

Lieu · Couches · Soleil · Vues · Contrôles · Récit · Réglages (+ symboliser via inspecteur).

## État actuel — fonctionne

**En ligne : v1.1.3** (`published/atlas/`, GitHub Pages).

- Chargement Scene Manifest / tables qgis2grist (cas Bee Farming validé).
- Symbolisation (fixe / catégorisé / gradué), contrôles, récit, export JSON `2.2-atlas-binding`.
- Dock soleil haut-droite (repli style boussole) ; inspecteur fermable.
- Couches fond (buildings/landscape/lines) masquées par défaut à l’import.
- **Mode lecture** : `?mode=view` ou accès Grist `read table` ; badge Lecture ; pas d’écriture prefs/story/features.
- **Mobile ≤720px** : bottom nav Carte / Couches / Récit ; panneaux en sheet ; géolocalisation ; `?no3d=1` / light3d.

## Points d’attention

- **Cadrage portable / partage iframe (26/08/2026)** :
  `docs/CADRAGE-PORTABLE-PARTAGE-IFRAME.md` — Grist = socle droits ; Atlas
  portable = Scene Manifest existant ; embed privé = session document + ACL /
  link keys ; Component Manifest hub hors contrat Atlas.

- **Colonnes géométriques** : `source.geometry_fields` du manifest prime sur la
  convention `latitude`/`longitude`/`geometry_json`. Sans lui (imports anciens),
  repli sur les variantes suffixées (`latitude2`) quand lat/lon valent 0 —
  collision qgis2grist. `(0, 0)` est traité comme « pas de coordonnée ».
- **Visibilité par défaut** : sans `visibility.defaultVisible` explicite,
  `isBasemapLayer` masque toute couche de plus de 2 500 entités. Une couche
  d’analyse volumineuse doit donc porter `defaultVisible: true` dans le manifest.
- **Chargement différé** : une couche masquée de plus de `DEFER_FEATURE_THRESHOLD`
  entités n’est convertie en GeoJSON qu’à son activation (`materializeDeferredLayer`).
  Le critère est le volume seul — pas le nom de la couche. La matérialisation est
  portée par `setLayerVisibility`, donc valable quelle que soit l’origine de
  l’activation (pastille, récit, prefs).
- **Zoom manifest non appliqué** : Atlas ignore `visibility.minZoom`/`maxZoom` —
  seul `defaultVisible` agit. Le LOD zoom du manifest ne vaut que pour les
  lecteurs qui l’implémentent (carte qgis2grist).

- **Zone de travail retirée du panneau Lieu.** `setRadius` stockait la valeur et
  redessinait le panneau ; `STATE.location.radius` n’était lu nulle part ailleurs.
  Quatre boutons sans effet. Ne pas la remettre sans lui donner un rôle réel —
  emprise d’import OSM, cadrage caméra, ou cercle sur la carte.

## Apparence des couches

Réglages portés par `style.symbolization` (persistés dans `Atlas_LayerPrefs`) :

| Réglage | Clé | Défaut |
|---|---|---|
| Opacité de couche | `opacity` | `null` = suit l’entité puis la géométrie (point 0.92 · ligne 0.9 · surface plate 0.55 · volume 0.85) |
| Contour | `stroke: {enabled, mode, color, width}` | actif, `mode:'follow'` (suit le remplissage), 1.5 px |
| Base d’extrusion | `extrusion.base` | 0 |
| Étiquette | `label: {size, color}` | 12 px, `#2D2820` |
| Rendu surfacique | `style.polygonMode` | `'flat'` pour les imports qgis2grist |

- **Ordre de priorité de l’opacité** : valeur fixée par l’utilisateur → `_fill_opacity`
  de l’entité (issue des `stops[].opacity` du style déclaratif, lue par
  `opacityFnFromDeclarative`) → défaut de la géométrie.
- `_fill_opacity` n’est posé sur une entité **que** si une opacité est déclarée ;
  sinon il reste absent pour que le `coalesce` retombe sur l’opacité de couche.
- Le contour en mode `follow` réutilise `layerPaintColor`, donc il suit la
  symbolisation (catégorisée ou graduée) au lieu d’une couleur unique.
- Sur une surface **à plat**, l’onglet Taille masque « Hauteur extrusion » —
  le réglage serait sans effet. La bascule « À plat / En volume » le réactive.
- **`polygonMode` par défaut** : `’flat’` n’est posé d’office que pour les imports
  `qgis2grist`. Toute autre couche surfacique part donc **en volume** (`extrude =
  polygonMode !== ‘flat’`), ce qui la rend invisible en vue régionale (sous-pixel,
  et le repli en points ne vise que les surfaces à plat) et coûte très cher au
  rendu. Une grille d’analyse doit déclarer `polygonMode: ‘flat’`.
- **`_fill_color` fait foi dès qu’un style déclaratif existe** (`layerPaintColor`),
  plus seulement pour `qgis2grist` : une table Grist stylée par un récit se peint
  comme un import.
- **Les couleurs du déclaratif priment sur la rampe nommée**
  (`sequentialPaletteForSym`). Sans cela `applyLayerStyle` recoloriait les couches
  `qgis2grist` depuis `colorRamp` et effaçait la symbologie du récit.
- **Une valeur hors classification prend le repli, jamais une classe.**
  `expressionCouleurDeclarative` est un `case`, pas un `step` : `step` ne compare
  qu'en `>=`, or les classes d'une graduation sont **hautes inclusives** (règle
  de QGIS, et celle qu'applique `stops.find()` côté peinture par entité). Une
  valeur posée sur une borne partagée — 50 entre `[0,50]` et `[50,200]`, cas
  courant puisque les bornes sont rondes — changeait de classe selon qu'Atlas
  détient ses entités ou non. Corollaires : un attribut absent, à `null` ou
  portant la chaîne `'NULL'` (fréquent en sortie de base — un bâtiment sur 400
  à Sète) tombe au repli au lieu de se lire comme une mesure basse ; et le
  repère hors-classe est **fini**, car `-Infinity` s'écrit `null` en JSON et
  `to-number(null)` vaut **0** — une expression réenregistrée dans
  `Atlas_LayerPrefs` aurait reclassé toutes les entités muettes dans la classe
  qui contient zéro, à la seconde ouverture seulement.
- **Classes graduées bornées** : si les `stops` portent `lower`/`upper`, ils sont
  appliqués tels quels ; l’étalement linéaire min→max n’est qu’un repli. Sur une
  distribution asymétrique (mailles à 1–2 bâtiments, maximum à 134) l’étalement
  verse la quasi-totalité dans la première classe.
- **`label` est créé s’il manque**, comme `stroke` et `extrusion`.
  `initSymbolization` se contentait de le compléter : une couche enregistrée
  avant l’arrivée des étiquettes — ou restaurée depuis une étape de récit
  ancienne, `applyStoryLayerMeta` remplaçant toute la symbolisation — arrivait
  sans `label`, et l’onglet Étiquette lisait `undefined.enabled`.
- `applyLayerPrefsBinding` restaure l’apparence **en plus** du style déclaratif
  (`mergeAppearancePrefs`) : un `declarative` dans les prefs ne doit pas effacer
  opacité, contour ni base d’extrusion.

## Placement 3D réservé aux couches à modèles (`lib/model-layer.js`)

`isModelLayer(layer)` = mode `library`/`custom` **et** géométrie ponctuelle. Les
réglages de placement (échelle, rotations, altitude, décalages) pilotent une
instance three.js posée sur un point — `Models3D.placement()` lit
`feature.geometry.coordinates` comme `[lng, lat]` — donc ils n'ont ni effet ni sens
sur une surface, une ligne ou un point rendu en cercle 2D.

- L'inspecteur d'objet compose ses onglets via `objectInspectorTabs()` :
  « Attributs » pour tout objet unique (édition si `qgis2grist`, lecture sinon),
  « Placement 3D » seulement si `isModelLayer`. Une sélection multiple non 3D
  n'a aucun onglet et affiche un état vide.
- **Le corps de l'inspecteur suit l'onglet actif.** Il avait auparavant sa propre
  cascade de conditions : retirer l'onglet sans toucher au corps aurait laissé les
  curseurs 3D visibles pour les objets non `qgis2grist`, en sélection multiple et
  en mode lecture.
- **`atlas_3d_json` n'est sérialisé que pour une couche à modèles**
  (`featureToRowUpdate`). C'est la seule garde qui protège la donnée : sans elle,
  des surcharges héritées — ou une couche ayant changé de mode — écriraient des
  transformations 3D sur des objets qui ne seront jamais rendus ainsi.
- « Reset » ne rétablit que les surcharges de placement : il n'apparaît qu'avec
  l'onglet 3D. « Enregistrer » reste, car `applySelected` persiste aussi les
  attributs.
- La règle est réécrite à la main en **8 points** d'`app_v7.js` (les numéros
  autrefois notés ici étaient périmés — le fichier a gagné 900 lignes). Audit du
  04/09/2026 : la dette est **cosmétique**, pas fonctionnelle. Cinq sites
  omettent la condition ponctuelle, mais quatre sont protégés par un aiguillage
  en amont — `applyPointStyle` n'est appelée que sur des points, l'onglet
  « Modèle 3D » n'apparaît que si `isPoint`, `resolveFeatureProps` ne sert qu'aux
  instances. Restent `renderLayersPanel` et `renderLayersPanelLecture`, qui
  posent un **badge « 3D »** sur une couche non ponctuelle déclarant un
  `gltf_url` — et seulement en édition, le panneau Couches étant refusé en mode
  vitrine. Vérifié sur une scène d'essai : un polygone portant un `gltf_url` est
  bien rendu en surface, jamais en cercles.

## Scène 3D — trois causes distinctes de décalage

Les modèles « bougeaient avec la carte ». Trois défauts indépendants s’y
mêlaient, et seuls les deux premiers se voient au banc de mesure
(`tests/manuel/projection-3d.html`, qui compare en pixels la position du cube
three.js à celle que MapLibre donne pour les mêmes coordonnées).

**1. Le viewport du renderer — la cause principale.** three.js relève la taille
du canvas **à sa création** et ne la revoit jamais. Ce canvas étant celui de
MapLibre, l’ouverture d’un panneau rétrécit la carte sans que le renderer le
sache : les objets sont dessinés à la mauvaise échelle **et** décalés, ce qui en
navigation se lit comme un glissement latéral. Repère décisif, donné par
l’utilisateur : *le défaut n’apparaît que lorsqu’un panneau est ouvert*. Le
viewport est resynchronisé dans `render()` dès que `canvas.width/height` change.
Un banc sans panneau ne peut pas voir ce défaut, et une mesure portant sur la
matrice de projection non plus — elle est correcte.

**2. La projection globe.** Le custom layer pose une translation **plane** là où
MapLibre projette sur une **sphère**. Écart mesuré :

    z3 → 570 px · z6 → 1692 px · z9 → 2248 px · z11 → 2337 px · z12 → 0 px

Rien n’est à sa place sous z12. `MODEL3D_ZOOM_GATE` ne s’appliquait qu’au-delà de
4 000 objets : une couche de quinze lampadaires s’affichait donc grossièrement
décalée en vue régionale. Sous `GLOBE_MERCATOR_ZOOM` (12) et en projection globe,
les modèles ne sont plus rendus — à ces échelles un lampadaire mesure de toute
façon moins d’un pixel.

**3. Le relief échantillonné trop tôt.** `queryTerrainElevation` dépend de la
finesse du maillage, donc du zoom : sur un même point, **1029,79 m à z16,8** et
**1034,14 m à z18,3**. Les tuiles arrivant après coup, les objets sont posés sur
un relevé grossier puis le sol bouge sous eux — en vue oblique, encore un
glissement latéral. Atlas écoute donc `data` sur `terrain-dem` et rejoue le
calage, groupé sur 600 ms, en plus du recalage par palier de zoom
(`paliersDemDifferents`).

- Le cache d’altitude n’est **plus vidé à chaque `moveend`** : un simple
  panoramique faisait re-sonder tous les objets, et ceux dont la tuile n’était
  pas revenue retombaient à zéro.
- `readOriginElev` conserve la dernière altitude connue de l’origine plutôt que
  de retomber au niveau de la mer (`altitudeOrigineStable`). **Symétrie
  obligatoire** : `placement()` doit alors caler une entité sans altitude **sur
  l’origine**, pas sur zéro — sinon toute la scène s’enfonce de la hauteur de
  l’origine.
- `recalerRelief()` est le point d’entrée unique : modèles et surfaces lisent le
  même cache, les recaler séparément les ferait diverger.

## Surfaces en volume posées sur le relief (`lib/terrain-base.js`)

`fill-extrusion-base` et `fill-extrusion-height` se comptent depuis le **niveau
de la mer**, pas depuis le sol. Une maille extrudée de 0 à 12 m était donc
ancrée à l’altitude zéro : sur un relief à 50 m elle disparaissait, à 10 m seuls
deux mètres dépassaient — d’où les interférences entre la donnée et le terrain.

- Chaque entité reçoit l’altitude du sol sous son centre (`_sol`), et les
  expressions deviennent `['+', sol, base]` / `['+', sol, base, height]`. Le
  sommet **inclut la base**, sinon l’épaisseur repartirait du sol.
- L’échantillonnage passe par **`Models3D.elevRaw`**, le même que celui qui pose
  les modèles 3D, cache compris : un lampadaire et le bâti sous lui reposent à
  la même altitude par construction. Avant, seuls les modèles étaient posés —
  un bâtiment extrudé traversait la colline.
- **`0` est une altitude valide** (bord de mer) : `elevRaw` renvoie `null` quand
  la tuile MNT manque, et l’entité est laissée intacte plutôt que collée au
  niveau zéro. `elevAt` conserve son contrat historique (nombre, zéro à défaut).
- **`queryTerrainElevation` retourne l’altitude exagérée** — vérifié à l’écran à
  ×3. Le calage doit donc être rejoué à chaque changement d’exagération, de
  source, de bascule du relief, et sur les étapes de récit qui l’activent.
- Couper le relief **nettoie** `_sol` : sans cela les entités resteraient en
  lévitation au-dessus d’une carte redevenue plate.
- Seules les surfaces **en volume** sont concernées : à plat, MapLibre drape
  déjà le remplissage, comme pour les points et les lignes.
- Coût mesuré : **~1,1 s pour 42 182 mailles**, sur action explicite seulement.
  Ne pas poser les entités dans `refreshTerrainBases` **et** dans
  `applyLayerStyle` — le doublon coûtait 2,3 s.

## Montage des couches — `isStyleLoaded()` n’est pas le bon prérequis

`map.isStyleLoaded()` signifie « le style **et toutes ses sources** sont
chargés ». Le montage d’une couche volumineuse (42 182 polygones, cas CRESO) le
fait retomber à faux le temps d’indexer sa source. L’utiliser comme garde pour
*ajouter* une couche, dans une boucle qui ajoute des couches, **fait abandonner
tout ce qui suit la première couche lourde** — et la reprogrammation rejoue le
même ordre, donc le même abandon. Résultat observé : sur sept couches, une seule
peinte, la légende annonçant trois couches visibles que la carte ne montrait pas.

- `mapStyleUsable()` remplace ce garde partout où l’on monte ou réordonne des
  couches. Elle suit `_styleUsable`, posé par `onStyleReady` (donc sur `load` et
  après chaque `setStyle`) et levé juste avant un changement de fond.
- **`map.once('load', …)` posé après le démarrage ne part jamais** : `load` ne
  survient qu’une fois. `scheduleMapLayersSync` attend désormais `idle`, qui
  revient à chaque stabilisation — sans quoi la reprise était définitivement
  perdue après un changement de fond.
- Le garde-fou `reconcilePanelVisibilityToMap` était lui-même désarmé par le
  même test : il ne voyait rien à réparer. C’est ce qui a laissé le défaut
  invisible.

Repère : le défaut ne se manifeste que si une couche est assez lourde pour
occuper le style d’une passe à l’autre. Sur une scène légère, tout finit par
monter — d’où des années sans le voir.

## Scan des tables géo — métadonnées seulement

`scanGeoTables` détecte les colonnes géométriques dans `_grist_Tables_column`,
**jamais en lisant les données**. Télécharger chaque table pour y chercher un nom
de colonne rapatriait le document entier : **≈ 126 Mo mesurés** sur la scène
CRESO, dont 68 Mo pour une table pourtant déclarée masquée, et le balayage était
répété deux à trois fois. Après correction : **≈ 27 Mo**, et plus aucune table
non géographique.

- Conséquence assumée : le scan ne connaît ni le nombre d’entités ni le type de
  géométrie. `geoTableMeta()` ne les affiche donc pas — annoncer « 0 obj. »
  serait faux. `linkTableFromGrist` charge la table au clic, seul moment où elle
  est nécessaire.
- Le scan ne tourne plus au chargement de scène : il ne sert qu’à la liste
  « tables géo du document · à afficher » du panneau Couches, et se déclenche à
  son ouverture.
- Tests : `tests/geo-tables-scan.test.js` — le faux `docApi` **lève** si on lit
  autre chose que les deux tables de métadonnées. C’est la garde anti-régression.

## Ordre des couches (`lib/layer-order.js`, `lib/edge-scroll.js`)

MapLibre empile dans l’ordre d’ajout et Atlas ajoute toujours au sommet : sans
remise en ordre, une couche remontée (bascule de visibilité, chargement différé,
changement de style, repli en points) repasse **devant** les autres. L’ordre
observé dépendait donc de l’historique des clics.

- **Sens** : la **dernière** couche de `STATE.layers` est peinte **au-dessus**.
  C’est la sémantique historique — la redéfinir inverserait la superposition de
  toutes les scènes déjà enregistrées. Seul l’**affichage** est retourné
  (`displayOrder`), pour respecter l’usage des SIG : le dessus en premier.
- `applyLayerOrder()` rejoue `moveSequence` après tout (re)montage. Les
  habillages d’une couche (`-outline`, `-pts`, `-label`) se déplacent **d’un
  bloc** : séparés, un contour passerait sous son propre remplissage.
- **Persistance** : `rank` dans le StyleJSON des prefs, relu par `sortByRank`.
  Une couche sans rang se range **après** celles qui en ont un — d’où
  l’enregistrement de **tous** les rangs à chaque déplacement, pas seulement des
  couches déplacées. Un rang partiel donne un ordre faux au rechargement.
- `insertionIndex` place une nouvelle couche au-dessus des géométries de même
  rang ou plus grossier, sous les plus fines (surface < ligne < point) — sinon un
  bâti importé recouvre la voirie.
- **Glisser-déposer** : poignée ⠿ (`.layer-grip`), Pointer Events avec capture,
  seuil de 4 px avant bascule, repère d’insertion, équivalent clavier ↑ ↓ sur la
  poignée focalisable. `edgeScrollStep` fait défiler le panneau quand le pointeur
  approche d’un bord : au doigt, aucune molette ne vient défiler pendant le
  geste, et une couche ne pourrait pas sortir de la portion visible.

## Gestes tactiles

Tout passe par les **Pointer Events** — un seul jeu d’écouteurs pour la souris,
le doigt et le stylet, avec `setPointerCapture` (via `capturePointer`, qui avale
l’exception si le pointeur est déjà parti) plutôt que des écouteurs `window`.

| Geste | Souris | Doigt |
|---|---|---|
| Ordre des couches | glisser la poignée (ou ↑ ↓) | idem + défilement de bord |
| Arc solaire | glisser | idem, `touch-action: none` sur `.sun-arc` |
| Sélection rectangulaire | **Maj** + glisser | **appui long** immobile puis glisser |

- L’appui long (`LONG_PRESS_MS`, `LONG_PRESS_TOLERANCE_PX`) est le seul moyen de
  distinguer « sélectionner » de « déplacer la carte » sans touche Maj. Un
  mouvement avant l’échéance, ou un second doigt (zoom), annule.
- Le rectangle naissant étant invisible, la bascule s’annonce par une vibration
  et un toast — sans quoi rien ne dit que le geste a changé de nature.
- `boxJustEnded` (et non `boxing`) absorbe le `click` de fin de geste : la garde
  doit fermer `boxing` **immédiatement**, car la capture livre le `pointerup` à
  `cc` d’où il remonte jusqu’à `window` — sinon la sélection est rejouée.

## Repli en points (`lib/point-fallback.js`)

Une maille d’analyse de 200 m mesure moins d’un pixel en vue régionale : le
polygone est chargé, mais rien ne s’affiche. `pointFallbackZoom()` calcule le
zoom sous lequel les surfaces d’une couche passent sous `MIN_FEATURE_PX` (3 px)
à partir de leur taille réelle ; en deçà, Atlas peint une couche `circle` sur
leurs centres (rayon fixe à l’écran), au-delà les surfaces reprennent la main.

- Actif seulement sur les couches **surfaciques à plat** d’au moins
  `POINT_FALLBACK_MIN_FEATURES` (300) entités.
- Source parallèle `<layer.id>-pts`, alimentée par `centroidCollection()` et
  **filtrée comme la couche principale** (cf. `syncLayerSourceData`).
- Les propriétés sont conservées, donc les points gardent la symbolisation.
- Une couche différée est vide au montage : son seuil est réévalué et la couche
  remontée dès qu’elle se peuple (`_pointFallbackAt`).
- Un anneau GeoJSON étant fermé, `featureCentroid()` ignore le sommet répété —
  sans quoi chaque centre serait décalé vers ce sommet.

- Le rayon des points ne descend pas sous `MIN_FEATURE_PX` : un repli plus fin
  que le seuil reproduirait l'invisibilité qu'il corrige.
- Le masquage d'une couche couvre tous ses habillages (`-outline`, `-label`,
  `-hit`, `-pts`) : sans `-pts`, le repli restait à l'écran après extinction ;
  sans `-hit`, la zone de clic restait active sur une couche invisible.

Repère mesuré : mailles de 200 m → bascule vers **z10,8**.

## Droits — ce que Grist transmet ne dit pas ce qu’on croit

`?access=full&readonly=false` décrit le niveau accordé **au widget** (le réglage
« Niveau d’accès » de la vue), **pas** les droits de la personne sur le document.
Les ACL s’appliquent par-dessus, côté sandbox : en simulant un lecteur
(`aclAsUser_=viewer@example.com`), l’iframe reçoit quand même
`access=full&readonly=false`. Atlas ouvrait donc l’édition à qui ne peut rien
écrire.

- Seule la **sonde d’écriture** tranche (`probeCanWriteDoc`) : un `UpdateRecord`
  sur une ligne inexistante. `resolveAccess` la déclenche désormais aussi quand
  Grist annonce l’écriture. Le sens inverse reste sans appel : quand Grist
  déclare la lecture, il ne se trompe pas.
- La sonde ne force la lecture que sur une **erreur ACL franche**. Le libellé que
  Grist renvoie réellement est **`Blocked by table update access rules`** (403) —
  ni « blocked » ni « access rules » n’étaient dans `isWriteAclError`, qui
  retombait sur son repli « en cas de doute, privilégier l’édition ». Variantes
  couvertes : table / row / column × update / create / remove, plus
  `not authorized` / `unauthorized`.
- « not found » — le cas **normal** pour un éditeur, puisque la ligne sondée
  n’existe pas — ne doit jamais basculer en lecture. Un éditeur bloqué à tort
  serait pire que le défaut corrigé.

En lecture : les modules d’auteur sont refusés par `openModule`, l’inspecteur
d’objet passe en consultation (`geoReadOnly`, pas de bouton Enregistrer), et la
barre du haut perd Charger / Enregistrer / Exporter — **une virgule de trop**
dans le CSS les agrégeait à la règle de l’avatar et les laissait visibles. À leur
place, un bouton **Récit** (`#btn-story.has-story`), sans lequel un récit publié
n’avait plus aucun point d’entrée une fois le rail retiré.

## Persistance — ce qui s’écrit, et quand

| Objet | Table | Déclenchement |
|---|---|---|
| Apparence d’une couche `qgis2grist` | `Atlas_LayerPrefs` | immédiat (`saveLayerPref`) |
| Autres couches | `Maquette_Layers` | « Enregistrer » explicite |
| Récit | `Atlas_Story` | à chaque capture, débounce 400 ms |
| Contrôles exposés en lecture | avec la couche (`_controls`) | idem couche |

- **`Maquette_Layers` est créée à la demande** (`ensureMaquetteLayersTable`).
  `initGristTables` ne tourne que sur les documents en mode maquette : en mode
  Scene Manifest, la table n’existait pas et enregistrer une couche non
  `qgis2grist` échouait sur « [Sandbox] KeyError 'Maquette_Layers' ». La créer à
  l’écriture, et pas au chargement, garde une empreinte nulle sur les documents
  qui ne s’en servent pas.
- **Le récit s’écrit en une seule transaction.** Effacement et réécriture
  partaient en **deux** `applyUserActions` : le `BulkRemoveRecord` était déjà
  commis quand le `BulkAddRecord` échouait, et un refus d’ACL au mauvais moment
  **effaçait le récit** au lieu de le mettre à jour. Grist applique une liste
  d’actions comme un tout : les deux y sont désormais.
- **Un échec d’écriture doit se voir.** « Étape capturée » s’affiche dès le clic,
  avant même que l’enregistrement ne parte ; l’erreur était avalée par un
  `.catch` interne, `enterViewModeOnWriteFail` n’était jamais appelé, et
  l’utilisateur croyait son récit conservé. Elle remonte à l’appelant, qui la
  signale — la chaîne de sauvegardes, elle, reste saine, sinon plus rien ne
  partirait ensuite.

## Récit (`Atlas_Story`)

- Chaque étape emporte **sa propre copie** de la symbolisation : deux étapes
  peuvent montrer la même couche catégorisée ici, graduée là. `captureStoryState`
  clone (`cloneJson`), `applyStoryState` travaille sur un clone, `applyLayerStyle`
  repeint. Le piège serait une `symbolization` stockée **par référence** : couche
  vivante et étape pointeraient sur le même objet, et tout réglage ultérieur
  réécrirait le passé du récit — toutes les étapes finiraient identiques.
  `tests/story-symbolization.test.js` verrouille cela, étiquettes comprises.
- Une étape décrit l’**état complet** de la scène : `applyStoryState` masque les
  couches qu’elle ne cite pas. `captureStoryState` enregistre toujours toutes les
  couches ; seuls les récits écrits à la main sont partiels.
- `findStoryLayer` résout par **`sourceTable` d’abord**, puis id, puis nom. Le nom
  n’est qu’un repli : deux couches homonymes issues d’imports différents feraient
  sinon appliquer styles et filtres aux mauvaises données.
- `storyExit` rétablit l’état d’avant présentation (visibilité, filtres,
  symbolisation, **rendu surfacique**) via `restorePreStorySnapshot` +
  `remountAllLayers`.
- Une étape peut porter **`polygonMode`** : posé *avant* l’affichage de la couche,
  car le repli en points ne vise que les surfaces à plat et doit connaître le mode
  au montage. C’est ce qui permet de montrer un bâti en volume (morphologie =
  critère SEVI_B) puis de le remettre à plat.
- La caméra se cale sur la **zone utile**, pas sur la carte entière : la bulle de
  texte masque le tiers inférieur, et le panneau latéral (s’il reste ouvert) la
  moitié gauche. En projection **globe**, sous z≈8, le calcul Mercator surestime
  le zoom d’environ un cran — caler à l’œil plutôt que par la formule.
- Un filtre `range` sur un champ absent est ignoré ; un filtre `select` sur un
  champ absent exclut toutes les entités (cf. `buildControlPredicate`).
- **`requireValue`** sur un contrôle `range` inverse cette tolérance : une entité
  dépourvue de l’attribut (ou de valeur non numérique) est **écartée**. À poser
  sur les vues thématiques dont l’attribut n’est renseigné que partiellement —
  sans lui, les entités muettes reçoivent la couleur de repli du style gradué et
  recouvrent la thématique (cas de `nb_bat`, absent de 67 % des mailles de la
  grille sarde). Transmis par `applyStoryControlsToLayer` et conservé par
  `captureStoryState`.

## Ombres portées — ce que la carte montre, et où elle s'écarte du réel

Les ombres sont calculées par three.js sur les modèles 3D et sur un bâti
d'appoint (`ensureShadowFeatures`), pas par une shadow map MapLibre au sol.

**Le soleil ne descend jamais vraiment.** La lumière directionnelle est
contrainte en hauteur :

```js
Math.max(this.sunDir.y * dist, dist * 0.4)   // jamais sous 40 % de la distance
```

Ce n'est pas un défaut à corriger mais un **compromis assumé** : à soleil
rasant, la caméra orthographique de la shadow map devient quasi parallèle au
sol, sa profondeur utile s'effondre et les ombres deviennent inexploitables
(bandes, acné, ombres infinies). Le clamp garde une carte lisible.

> **Conséquence à connaître** : aux heures basses — avant 8 h, après 18 h — les
> ombres sont **plus courtes que la réalité**. Atlas affiche l'heure solaire
> exacte, ce qui invite à lire la longueur d'ombre comme une mesure ; elle n'en
> est pas une à ces heures-là. Une étude d'ensoleillement ne doit pas s'appuyer
> dessus sans le savoir.

**Les matériaux de modèles ne sont pas libérés.** `fixGltfMaterial` clone le
matériau de chaque sous-maille, et aucun `dispose()` ne les reprend au retrait
d'une couche. La fuite est **bornée** — un clone par URL de modèle, pas par
image ni par instance — donc sans effet sur une scène ordinaire. Elle mordrait
sur une session qui enchaînerait des dizaines de modèles distincts.

- Ombres = éclairage modèles three.js (pas shadow map MapLibre au sol).
- Modèles GLB via **`published/atlas/models/`** (GitHub Pages) — sous le widget,
  depuis leur co-localisation. Le défaut de `MODEL_LIBRARY.baseRoot` a longtemps
  visé `/Widgets-Grist/models/`, qui renvoie 404 : en ligne la sonde `./models/`
  rattrapait l’erreur (le widget est servi depuis `/atlas/`), mais en
  développement aucun modèle ne chargeait. Pour essayer la 3D en local, servir la
  racine du repo — la sonde tente `../../published/atlas/models/` en premier.
- Tests : `node --test projects/Atlas/tests/*.test.js` (chemins quotés sous PowerShell).
- Spec lecture/mobile : `docs/superpowers/specs/2026-07-30-atlas-view-mobile-design.md`

## Publication

```bash
# Déjà fait via promote manuel → published/atlas/
npm run manifest
# Commit published/atlas + manifest, puis push pour gh-pages
```

URL widget : `https://nic01asfr.github.io/Widgets-Grist/atlas/`  
Édition : `requiredAccess: 'full'` (défaut). Lecture : `?mode=view` → `read table`.

## Paramètres d'URL — qui pose quoi, et ce qui n'arrive jamais jusqu'à Atlas

Trois couches se superposent, et les confondre coûte cher. Elles ne s'adressent
pas au même destinataire.

### 1. Ce que Grist met sur l'URL du **document**

`?embed=true&style=singlePage`, `/p/5`… Ces paramètres pilotent l'**interface de
Grist** : masquer la barre latérale, ouvrir telle page. Ils ne parviennent
**jamais** à Atlas — le widget vit dans une iframe dont l'URL est celle du
widget, pas celle du document.

C'est ce qui permet d'intégrer une scène réelle dans une page tierce : on
embarque le document (`embed=true&style=singlePage`), et Atlas s'y trouve comme
dans n'importe quel document, avec les données et les droits qui vont avec.

### 2. Ce que Grist met sur l'URL du **widget**

`?access=full&readonly=true&culture=fr-FR…` — posés par Grist sur l'iframe.
Lus par `lib/view-mode.js`.

> **Piège vérifié** : `access=full&readonly=false` est envoyé **toujours**, y
> compris à un lecteur. Il décrit le niveau demandé par le widget, pas les
> droits de la personne. S'y fier ouvrait l'édition à qui n'a pas le droit
> d'écrire — d'où la sonde d'écriture réelle.

### 3. Ce que l'auteur de la page met sur l'URL du widget

| Paramètre | Lu par | Effet |
|---|---|---|
| `?scene=<url>` | `lib/scene-externe.js` | **charge la scène à cette adresse, et coupe l'accès au document** |
| `?vitrine=1` | `lib/data-client.js` | « la page qui m'encadre est une présentation, pas un document » — sans lui, Atlas encadré croit avoir un document à interroger |
| `?mode=…` | `lib/view-mode.js` | force le mode lecture, pour tester |
| `?no3d` | `app_v7.js` | coupe les modèles 3D (appareil modeste) |
| `?models=…` | `app_v7.js` | source du catalogue 3D |
| `?nav` | `index_v7.html` | barre de navigation inter-vues |

### `?scene=` — deux régimes de confiance, pas un réglage

Une scène lue dans le document est **de confiance** : pour l'y mettre, il fallait
déjà pouvoir écrire dans le document. Une scène chargée par `?scene=` ne l'est
pas — n'importe qui peut fabriquer l'adresse et la faire ouvrir. Atlas ne lui
donne donc **pas le document** : `grist.ready()` n'est jamais appelé, `docApi`
n'existe pas, aucune préférence ni aucun récit ne s'écrit.

Trois conséquences à connaître avant de toucher à ce chemin :

- une couche `source.table` d'une scène externe **tombe en échec déclaré**, avec
  un message qui envoie la publier. Ce n'est pas une limite, c'est la règle ;
- le `popup_template` est rendu **comme du texte**. Il est injecté tel quel
  (`app_v7.js`, `buildViewPopupHtml`) : les valeurs sont échappées, le gabarit
  ne l'est pas. Venu d'une adresse, il s'exécuterait dans une iframe qui tient
  les droits de la personne sur son document ;
- seuls `https:` et `http://localhost` sont admis. `data:` et `blob:` portent un
  contenu **sans origine** — inattribuable, irrévocable ; `http:` distant
  laisserait un tiers réécrire la scène en chemin. `localhost` est un contexte
  sécurisé au sens du navigateur, et le refuser pousserait à publier pour
  essayer.

Cadrage complet : `docs/CADRAGE-SCENE-EXTERNE-ET-DECOUPLAGE.md`.

### Deux pièges vérifiés en branchant `?scene=`

**`_mapSyncAfter` est une file, pas un slot.** Deux appelants attendent que le
style redevienne utilisable — `onStyleReady`, qui cadre depuis les entités
locales, et `mountLoadedLayers`, qui cadre depuis ce que le manifeste déclare.
Avec une variable unique, le second effaçait le premier **sans rien dire**. Dans
un document Grist l'ordre était favorable (l'ouverture est lente, le style a le
temps d'être prêt) ; une scène chargée par URL arrive avant le style, et c'est le
cadrage du manifeste qui se perdait — la carte s'ouvrait sur la position par
défaut, ce qui ressemble à un choix.

**`layerVisibleCount` rend `null` quand on ne sait pas.** Il rendait `|| 0`, donc
zéro pour une couche vide **comme** pour une couche dont Atlas ne détient pas les
entités. Zéro est un nombre plausible : « 0 obj. » se lit comme un renseignement
et envoie chercher pourquoi la donnée est vide. `formatLayerCount` affiche
« ≈400 » quand le manifeste déclare sans qu'on ait vérifié, et « — » quand
personne ne sait.

### Non-régression vérifiée en Grist réel (25/08/2026)

Document `nrRTKiyiz1suJ3NF1QcbqK` (espace *Widgets*), Atlas servi en **https
local** — un document en HTTPS refuse une iframe en `http://localhost`
(contenu mixte), d'où le certificat auto-signé pour l'essai. Une seule scène
portant **les deux origines à la fois** :

| Couche | Ce qui est vérifié |
|---|---|
| `Batiments_locaux` (table) | chemin nominal intact — 5 objets lus et peints |
| Bâtiments BD TOPO (URL) | chemin distant — « ≈400 obj. », symbologie appliquée |

`Atlas_LayerPrefs` est bien créée et écrite : l'écriture des préférences n'a pas
régressé.

**Effet de bord constaté, non corrigé** — précisé le 04/09/2026 : ce n'est pas
la *présence* d'une couche distante qui crée `Maquette_Layers`. `initGristTables`
n'est appelée que **hors** mode Scene Manifest, donc une scène n'y touche pas au
chargement. Deux conséquences distinctes :

1. **Régler l'apparence d'une couche distante n'enregistre rien.**
   `saveLayerPrefIfSynced` exige `source === 'qgis2grist'`, et sort **en
   silence** sinon. Le réglage est perdu au rechargement, sans message.
2. **« Enregistrer » sur cette couche écrit une donnée fausse.** La branche
   non-`qgis2grist` crée `Maquette_Layers` et y pose
   `GeoJSON: JSON.stringify(layer.geojson)` — or sur une couche distante,
   `layer.geojson` est une **adresse**. On écrit une URL dans une colonne censée
   porter des entités.

**La réponse est arrêtée** (cadrage §« Ce qui reste indéterminé ») : indexer sur
`sourceTable || id` et reformuler le garde en « cette couche vient du manifeste
du document ». **Jamais l'URL comme clé** — elle change quand un jeton expire, et
les préférences seraient perdues au renouvellement ; l'`id` du manifeste est
stable par construction.

Et dans une **scène externe**, on n'écrit rien : il n'y a pas de document, donc
pas de propriétaire. Ce qu'un lecteur déplace y est éphémère par nature.
La règle : **on écrit là où il y a un propriétaire, et on ne prétend pas en
inventer un quand il n'y en a pas.**

### `inline` n'est pas `distant` — le manifeste peut porter ses données

`geojson` accepte **un objet autant qu'une adresse**. Avec un objet, la scène est
autonome en données : les entités voyagent avec elle, et la couche est aussi
complète qu'une couche lue dans une table.

> **`_distant` doit donc rester faux pour `inline`.** Le drapeau commande une
> dizaine de comportements — filtrage par expression, sol constant au lieu du sol
> par entité, compte déclaré préfixé « ≈ », clic en consultation au lieu de la
> sélection. Le poser sur une couche qui porte ses entités revient à **l'amputer
> de ce qu'elle n'a pas perdu**, sans que rien à l'écran ne dise pourquoi.

Même raison pour l'emprise : une couche `inline` **ne réclame pas de `bbox`**,
la sienne se calcule. Lui en réclamer une signalerait un manque qui n'en est pas
un — et un avertissement qui se trompe occupe la place d'un avertissement qui a
raison.

La fabrique s'appelle `coucheHorsTable` et non plus `coucheDistante` : elle sert
les deux cas, et un nom qui ment est le troisième visage de
`skills/echecs-silencieux.md`.

### Contrôles d'une couche distante — le manifeste répond, MapLibre filtre

Deux dérivations lisaient les entités locales, et deux réponses par défaut
mentaient :

| | Avant | Maintenant |
|---|---|---|
| `controlUniqueValues` | `[]` — un filtre sans choix ressemble à un filtre déjà appliqué | les `values[]` du contrôle (`options`), **`count: null`** et jamais zéro |
| `controlBounds` | `{min:0, max:1}` — un curseur de hauteur de 0 à 1 m | `dataMin`/`dataMax` déclarés ; sinon `_bornesInconnues` |

**`filteredGeoJSON` effaçait la couche.** Sur une couche distante, `geojson` est
une **adresse** ; filtrer « ce qu'on a » rendait une `FeatureCollection` vide, donc
supprimait la couche au premier contrôle activé. Un filtre qui supprime tout
ressemble à un filtre trop strict — on cherche l'erreur dans ses bornes.

Le filtrage de ces couches passe par **`expressionFiltreControles`** : on décrit
à MapLibre ce qu'il doit garder, au lieu de retrancher des entités qu'on n'a pas.
L'habillage suit (`-outline`, `-label`, `-hit`, `-pts`), sinon on verrait le
contour d'un objet écarté, et on pourrait encore cliquer dessus.

**La légende avait gardé le défaut que les contrôles n'avaient plus.**
`controlUniqueValues` sait retomber sur ce que le manifeste déclare ;
`filteredUniqueValues`, sa jumelle, ne le savait pas — et c'est elle qui
alimente la légende. Deux conséquences, vues à l'écran sur la démo des
Aygalades :

| | Avant | Maintenant |
|---|---|---|
| compte de la couche | **`0` écrit en dur** (`app_v7.js`, branche catégorisée) alors que `total` valait « ≈175 » | `total`, comme partout ailleurs |
| classes affichées | aucune — donc aucune clé de lecture sous une carte en trois couleurs | celles des `stops` du déclaratif, comptes à `—` |

Le repli ne vaut **que** pour une couche qui ne détient pas ses entités
(`geojson` n'est pas un tableau de features). Une couche locale dont le filtre
ne laisse rien doit continuer à rendre une liste vide : là, l'absence est
constatée, et la masquer ferait passer un filtre trop strict pour une légende
normale. `tests/controles-couche-distante.test.js` verrouille les deux sens.

> Le correctif avait été écrit une fois, appliqué à une seule des deux fonctions.
> C'est le pont rompu de `skills/echecs-silencieux.md` dans sa forme la plus
> coûteuse : **la version corrigée existe et prouve qu'on savait**.

> **La règle du couple** : `expressionFiltreControles` et `buildControlPredicate`
> doivent **classer pareil**. C'est la même scène et les mêmes bornes ; un écart
> donnerait deux cartes selon l'origine de la donnée, et on l'attribuerait à la
> donnée. `tests/controles-couche-distante.test.js` compare les deux entité par
> entité, bornes exactes et valeurs illisibles comprises.

Vérifié à l'écran sur la scène de Sète : le curseur s'ouvre sur 10 → 20,2 m
(les bornes déclarées, non mesurables ici), et le pousser à 18,98 ne laisse que
les bâtiments les plus hauts.

### Symboliser une couche qu'on ne détient pas

L'inspecteur annonçait « 0 objets », proposait « — Champ — » et concluait
« ⚠️ Pas de valeurs numériques ». Trois affirmations, toutes fausses, et aucune
ne se présentait comme une ignorance.

| Source | Ce qu'elle apporte |
|---|---|
| `fields[]` du manifeste (`name`, `label`, **`gType`**) | les champs et leur type Grist — `_fields` ne venait que de la config widget qgis2grist, absente ici |
| `style.declarative.field` et `controls[].field` | un repli quand `fields[]` manque : la scène nomme les champs dont elle se sert |
| `controls[].dataMin`/`dataMax` | « Valeurs déclarées : 1,4 → 20,2 » au lieu de « pas de valeurs » |

> **`gType` fait autorité sur l'échantillon.** C'est ce que la colonne *est*, pas
> ce que ses valeurs ont l'air d'être — et il répond même quand il n'y a rien à
> échantillonner. Sans lui, `detectFieldType` rendait « text » par défaut, ce qui
> **retire le champ des choix d'une symbologie graduée**.

### Le nom d'une scène se lit sous `title`, et sous lui seul

`scene-loader.js` lit `manifest.title`, la clé **normative** du contrat 0.2.2 —
`project_name` n'est pas au schéma. Une scène qui ne porte que `project_name`
s'affiche « Import QGIS », le libellé de repli : un nom plausible, donc qu'on ne
songe pas à mettre en doute. Les scènes attestées déclarent les deux ; une scène
neuve doit au minimum déclarer `title`.

### Le compte se lit sous deux clés, et il en existe deux

`featureCount` est la clé du **contrat 0.2.2** ; `n_features` celle qu'écrit la
cascade de publication amont. Atlas ne lisait que la seconde : un producteur
parfaitement conforme aurait affiché « — ». C'est le pont rompu classique — le
producteur écrit d'un côté, le consommateur lit de l'autre, et chacun fonctionne
très bien chez soi (cf. `skills/echecs-silencieux.md`).

### Inspecter, poser, borner — sans détenir les entités

**Le clic passe par la feature que MapLibre rend.** `showViewFeaturePopup` prend
un quatrième argument : sur une couche détenue on préfère toujours la feature
source, qui porte la géométrie entière — MapLibre, lui, rend des géométries
découpées par tuile ; sur une couche distante il n'y a pas de source, et la
feature rendue **est** tout ce qu'on aura. Elle porte les attributs, qui sont ce
que la fiche montre.

**Une couche distante n'entre jamais en mode sélection.** Il n'y a ni ligne Grist
à écrire ni feature source à modifier : l'inspecteur d'édition s'ouvrirait sur un
objet qu'on ne peut pas enregistrer, et un « Enregistrer » qui échoue est pire
que son absence. Le clic y ouvre la fiche, en consultation, même en édition.

> C'est ce qui a permis d'**éprouver la garde du gabarit de popup** : scène
> chargée par URL, `popup_template` contenant `<img src=x onerror=…>`, clic sur
> un bâtiment. Le gabarit ressort en texte (`&lt;img …&gt;`), aucune balise n'est
> créée, le script ne s'exécute pas.

**Le relief : une altitude par couche, pas zéro.** `extrusionExpressions` accepte
un `solConstant`. Sans lui, `['coalesce', ['get','_sol'], 0]` retombait au niveau
de la mer : sur un relief à 50 m, **toute la couche disparaissait sous le sol** —
elle est là, elle est peinte, et on ne la voit pas. L'altitude est sondée au
centre de la `bbox` déclarée. C'est approximatif (le relief varie sur une
emprise) et c'est assumé : cela sépare « mal calée » de « disparue ».

### Relief + couche distante extrudée = une nappe suspendue

`extrusionExpressions` accepte un `solConstant` pour les couches dont Atlas ne
détient pas les entités : une altitude sondée **au centre de la bbox**, faute de
pouvoir en sonder une par bâtiment. Le CLAUDE.md la disait « approximative et
assumée ». Mesuré sur les Aygalades, l'approximation ne tient pas :

| Lieu | Sol réel | Altitude posée | Écart |
|---|---:|---:|---:|
| Cascade, fond de vallon | 80 m | 136,9 m | **flotte 57 m** |
| Coteau ouest | 99 m | 136,9 m | flotte 38 m |
| Coteau est | 285 m | 136,9 m | **enfoui 148 m** |
| Centre de la bbox | 137 m | 136,9 m | exact |

Le sol constant n'est juste qu'au seul point où il a été sondé. Sur une emprise
au relief marqué — 220 m d'amplitude ici — le bâti forme **une nappe plate
suspendue** au-dessus d'un terrain qui, lui, ondule ; et les lignes drapées
(voirie, cours d'eau) le traversent, puisqu'elles suivent le sol.

> **La règle** : `terrain3D` et une couche **distante extrudée** ne vont pas
> ensemble. Soit la couche porte ses entités (inline, ou table du document) et
> chacune reçoit son `_sol`, soit on la passe **à plat** — MapLibre la drape
> alors entité par entité, ce qui est exact par construction et se lit très bien
> sur un relief.

MapLibre ne sait pas aligner nativement une extrusion sur le terrain :
`fill-extrusion-base-alignment` existe chez Mapbox GL v3, **pas** dans MapLibre
(vérifié en 5.6.1, la propriété est refusée). Il n'y a donc pas de raccourci.

L'étape « relief » de la démo des Aygalades applique cette règle : bâti et
emprises à plat, et le texte le dit — une démo qui affirme poser les volumes sur
le sol échantillonné pendant qu'ils flottent apprend le contraire de ce qu'elle
montre.

### Les bornes de zoom du manifeste sont appliquées

`visibility.minZoom`/`maxZoom` étaient **ignorées** — seul `defaultVisible`
agissait. C'est la réponse au repli en points sur une couche distante :
`pointFallbackZoom` déduit le seuil de bascule de la **taille réelle** des
entités, qu'on n'a pas.

> **Ne pas l'estimer depuis `bbox` et `featureCount`.** Mesuré sur Sète :
> `√(aire_bbox / n)` donne 165 m par entité là où les bâtiments en font 20 — les
> entités ne remplissent pas leur emprise. Un seuil faux ferait basculer au
> mauvais moment, sans que rien ne le signale.

Le producteur, lui, sait à quelle échelle sa couche est lisible. `poserBornesZoom`
combine les deux sources et retient **le minimum le plus restrictif**, pour qu'une
couche ne remonte pas au-dessus de l'échelle où son producteur la dit lisible.
Trois orthographes sont lues (`visibility.minZoom`, `visibility.min_zoom`,
`min_zoom` de la cascade de tuiles) : n'en lire qu'une serait un pont rompu de
plus.

### Une couche à modèles 3D doit porter ses entités

Les instances sont construites en parcourant `filteredGeoJSON(layer).features`
et en lisant `feature.geometry.coordinates`. Sur une couche servie par **URL**,
Atlas ne détient pas les entités : MapLibre les a, lui, mais Atlas n'y accède
pas. La liste est vide, et **rien n'est instancié**.

Le symptôme est trompeur : la couche est bien montée, la légende l'affiche avec
son compte déclaré et ses classes, le catalogue est chargé — et la carte reste
nue. Rien ne signale que le placement n'a jamais eu lieu ; on cherche du côté du
modèle, de l'échelle ou du zoom.

> **La règle** : `style.mode: 'library'` comme `'custom'` exigent une couche
> `inline` ou `table`. Éprouvé sur la démo des Aygalades — 374 objets de
> mobilier servis par URL n'affichaient rien ; les mêmes en `inline` (76 Ko)
> donnent 1 245 instances.

Corollaire visible, et voulu : une couche `inline` étant comptée pour de vrai,
sa légende affiche « Lampadaire 239 » sans le « ≈ » des couches distantes.

**`_modelId` par entité prime sur `style.library.modelId`.** Une seule couche
peut donc porter plusieurs modèles — lampadaires, arbres, bancs, abribus — et le
choix appartient à la donnée, pas à la couche. `style.library.modelId` n'est
alors qu'un repli pour les entités qui n'en déclarent aucun.

### Un contrôle inactif n'existe pas pour le lecteur

Seuls les contrôles `active: true` deviennent des pastilles (`listDockPills`).
Le schéma pose pourtant `active: false` par défaut, avec une bonne raison — « un
contrôle proposé n'est pas un contrôle appliqué ».

Les deux règles se combinent mal sur une **scène publiée** : le mode vitrine
refuse aussi le rail d'auteur, donc un contrôle déclaré mais inactif n'a
strictement aucun point d'entrée. Il est dans le manifeste, il n'est nulle part
à l'écran.

> Une scène destinée à être lue doit activer ce qu'elle veut rendre manipulable,
> avec des bornes couvrant toute la plage : le filtre est alors visible sans rien
> retrancher tant qu'on n'y touche pas.

### Couches de service externe — `xyz` seulement

Une couche `source.type: "xyz"` devient une source `raster` : MapLibre va
chercher les images au gabarit d'adresse, **rien ne transite par Atlas**. Elle
porte `_raster: true`, qui la tient à l'écart de tout ce qui suppose du
vectoriel — symbologie, contrôles, filtres, inspection : un fond de plan n'a ni
champ à graduer ni objet à inspecter.

`maxzoom` est **posé d'office à 19** faute de déclaration. Ce n'est pas une
précaution cosmétique : un service qui ne sert pas au-delà d'un niveau renvoie
des erreurs en boucle, et la carte **n'atteint alors jamais `idle`** — tout ce
qui attend cet état reste suspendu (mesuré sur `tile.openstreetmap.org`).

`wms`, `wmts` et `wfs` restent des échecs déclarés. `wfs` n'est d'ailleurs pas
des tuiles mais du GeoJSON par requête : il relèvera du chemin URL déjà écrit.

> **Chausse-trape héritée de QGIS** : les tuiles XYZ y sont rangées sous le
> fournisseur `wms` ; seul `type=xyz` dans la datasource les distingue. Sans
> cette lecture, un fond OSM serait annoncé comme un service WMS.

### L'avertissement MapLibre vient du fond de carte, pas d'Atlas

`Expected value to be of type number, but found null instead`, quelques fois au
montage d'une scène. **Élucidé le 04/09/2026** — il ne vient pas de nos données.

Le raisonnement qui bloquait était : « il n'apparaît pas sans scène, ce n'est
donc pas le style de fond ». Il est **faux**, et pour une raison qu'on ne voit
pas : sans scène, Atlas affiche son écran d'accueil et **la carte n'est jamais
montée**. Le fond n'étant pas rendu, il ne pouvait rien signaler. L'absence
d'avertissement ne prouvait rien du tout.

Le test qui tranche : une scène **triviale** — un point, couleur fixe, aucune
expression lisant un attribut — cadrée sur la même zone dense. L'avertissement
apparaît quand même. Compté sur cette scène : **zéro** couche de scène porte une
expression numérique lisant un attribut, contre **16 couches du fond**
OpenFreeMap qui en portent (boucliers d'autoroute, noms de routes, libellés de
plans d'eau).

> Ce n'est donc pas un garde-fou d'Atlas qui parle, et il n'y a rien à corriger
> chez nous. À savoir avant de repartir en chasse : le prochain qui verra ce
> message perdra le même temps.

**Leçon de méthode** : « le symptôme disparaît quand je retire X » ne prouve que
quelque chose si retirer X laisse le reste en état. Ici, retirer la scène
retirait aussi la carte.

### `fitToLayer` cadre aussi sur ce qui est déclaré

« Couche vide » était dit d'une couche distante, **qui ne l'est pas** : ses
entités sont ailleurs, pas absentes. Le message envoyait chercher une donnée
manquante au lieu d'une emprise non déclarée. `fitToLayer` retombe désormais sur
`_bboxDeclaree` et **retourne un booléen** — l'appelant n'annonce plus un zoom qui
n'a pas eu lieu, et dit à la place que le manifeste ne déclare pas de `bbox`.

**La règle qui découle des trois couches** : `vitrine=1` ne se pose que si l'on
embarque **le widget seul**. Si l'on embarque un **document** Grist, Atlas y est
réellement dans Grist — le poser lui ferait ignorer le document qu'il a sous la
main.

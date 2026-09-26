# Vérification — nuit, horloge et luminaires (24/09/2026)

Vérification en navigateur (Chrome, fenêtre 1 707 × 769 à 1,5, puis 1 281 × 800 ;
téléphone émulé 390 × 844 × 3) de ce qui a été ajouté à Atlas autour de
l'éclairage et de l'heure : horloge de scène, couche `atlas-nuit`, luminaires
EclExt (spots, ombres, nappe, halos), pastille Soleil sur 24 h,
`viewer_controls` d'une scène externe.

Scènes : `essais-eclairage/scene-soleil.json` (Jarret, 95 luminaires), et, créées
pour l'occasion (dossier hors git) : `scene-verif.json` (tuiles pix2hdr + arbres
GLB + 14 luminaires fictifs à 4 m d'un arbre + un bloc extrudé Atlas,
`fabriquer-verif.mjs`), `scene-facades.json` (le Jarret, bâti du fond recopié
en couche Atlas extrudée, 1 243 volumes). Comparaisons à la version publiée
(`https://nic01asfr.github.io/Widgets-Grist/atlas/`) sur les démos
`osm-marseille-vieux-port`, `guide-interactif`, `vieille-charite-marseille`.
Captures : `essais-eclairage/verification/` (numérotées comme ci-dessous) ;
écarts calculés pixel à pixel (`essais-eclairage/diff.py`, bandeau exclu).

## Défauts corrigés (chacun avec un test qui échouait avant)

| # | Défaut | Mesure avant | Correction | Test |
|---|---|---|---|---|
| C1 | **Aucune ombre de luminaire ne s'affichait.** `shadowMap.enabled` était décidé *avant* `Eclairage.avantRendu()`, qui attribue les ombres ; l'image où les spots prennent leur ombre était rendue shadow map coupée, three.js y compilait les matériaux **sans** ombre et ne les recompile plus (il suit le nombre de lumières ombrantes, pas `shadowMap.enabled`). | 0 pixel d'écart entre 4 ombres et 0 ombre (02 / 02b) ; programme du récepteur sans `USE_SHADOWMAP`. Après recompilation forcée : 12 285 px changent, ombre de fût nette (02f). | Décision déplacée **après** `avantRendu` ; à chaque bascule de `shadowMap.enabled`, `needsUpdate` sur les matériaux de la scène (`app_v7.js`, `render`). Vérifié à l'ouverture : ombres des 4 mâts les plus proches (03). | `tests/ombres-luminaires-ordre.test.js` (contrat d'ordre) |
| C2 | **Le budget d'ombres allait aux projecteurs tournés vers le ciel**, les plus proches de la caméra dans la scène d'essai. | 2 des 4 ombres sur les deux projecteurs FICTIFS montants (axe y = +1 et +0,82). | `repartirSources` : les ombres vont aux sources qui éclairent le sol (`eclaireLeSol`, axe `dir.y < −0,05`, la règle de la nappe), en tête des lumières ; un projecteur montant reste une lumière, sans ombre. Après : 4 ombres sur 4 mâts. | `tests/eclairage-scene.test.js` |
| C3 | **Le curseur d'heure coûtait 60 ms par cran.** `partiesDansFuseau` construisait un `Intl.DateTimeFormat` à chaque appel (≈ 20 par luminaire). | `A.setTime` : médiane 60,7 ms, p95 92,6 ms, max 132 ms (200 changements, 95 luminaires) ; `mettreAJourEtats` seul 59 ms. | Un formateur par fuseau, mémorisé (`lib/eclairage-profil.js`). Après : médiane **5,7 ms**, p95 9,1 ms, max 15,8 ms. Inutile de limiter le geste : un `pointermove` par image coûte moins d'un tiers d'image. | `tests/eclairage-profil.test.js` (≤ 1 construction pour 100 appels) |
| C4 | **Niveau de détail du catalogue figé à 0** : `map.getFreeCameraOptions` n'existe pas en MapLibre 5.6.1 (vérifié : `undefined`). | `distanceCamera(undefined)` = 0 partout. | `positionCameraMetres` / `distanceCameraObjet` (`lib/viewport.js`) depuis `transform.getCameraLngLat()` et `cameraToCenterDistance` (présents en globe comme en mercator ; `getCameraAltitude()` rend `null` en globe, mesuré). Au Jarret, z18, 62° : 114,4 m calculés, MapLibre 112,75 m (`cameraPosition[2]`). `Eclairage.avantRendu` utilise la même fonction. | `tests/viewport.test.js` |
| C5 | **Le cadrage `camera` d'une scène `?scene=` n'était pas appliqué** : jamais lu, et le `fitBounds` animé de repli était arrêté par le `map.stop()` de `setBasemap`. La scène d'essai s'ouvrait au centre par défaut (Vieux-Port). | Console : `fitBounds initial`, puis la carte reste à 5,374 / 43,2951. | `cameraDeclaree(manifest)` (`lib/viewport.js`), posée d'un `jumpTo` dans `monterSceneExterne`, sauf caméra de session proche des données (même règle que pour l'emprise). Vérifié : ouverture à z18 / 62° / −25° (03). | `tests/viewport.test.js` |
| C6 | **Changement de fond : calque 3D, nuit et trajet perdus ou enterrés.** `onStyleReady` était attaché au premier `idle`, qui peut être émis **sur l'ancien style** pendant la requête du nouveau (une image rendue suffit). Style recréé : couches effacées ; style appliqué par différence : couches du nouveau fond empilées **au-dessus** de la nuit et des modèles. | `setBasemap('positron')` + un `triggerRepaint` : `three-models-3d`, `atlas-nuit`, `atlas-trajet-line` absents. Récit Vieille Charité, étape « Nuit sur le Panier » (Positron → Liberty) : nuit et modèles aux rangs 0 et 1, sol de jour sous des volumes de nuit, vol de caméra jamais lancé. | `quandNouveauStyle` (`lib/basemap-layers.js`) : attend l'`idle` qui suit le remplacement de `map.style.stylesheet` (recréation comme différence ; délai max 5 s pour un style identique). Utilisé par `setBasemap` et par le fond d'étape de récit. Après : ordre juste (rangs n−3, n−2, n−1) dans les deux cas, vol de l'étape 6 effectué. | `tests/basemap-layers.test.js` |
| C7 | **Modèle non éclairé (glTF `KHR_materials_unlit`) en plein jour dans la nuit** — la chapelle photogrammétrique de la Vieille Charité. Multiplier les lumières n'atteint pas un `MeshBasicMaterial` ; le voile CSS l'assombrissait. | Zone de la chapelle à 22 h 30 : publié 73,6 / 75,0 / 90,7 ; nouveau **118,2 / 115,6 / 123,6** (35). | Couleur des matériaux non éclairés multipliée par le facteur de nuit (`estNonEclaire`, `couleurSousNuit`, `lib/nuit-rendu.js` ; `Models3D.fixGltfMaterial` / `setSun`). Après : **70,7 / 72,8 / 88,9** (36), à 3/255 du publié. De jour, couleur d'origine exacte. | `tests/eclairage-scene.test.js` |
| C8 | **Luminaires dessinés en globe sous z12**, décalés : les modèles y sont retirés par `Models3D.build`, pas les luminaires (reconstruits ailleurs). | Pied des lampes projeté par three.js vs `map.project` : **312 px** à z3, **798 px** à z9 ; 0 px dès z12, et 0 partout en mercator. | `luminairesDessinables` (`lib/eclairage-rendu.js`) : racine des luminaires masquée en globe sous `GLOBE_MERCATOR_ZOOM`, et plus d'ombre à calculer. Revérifié à z3, 9, 11,9 (masqués) et 12, 16 (visibles). | `tests/eclairage-scene.test.js` |
| C9 | **Téléphone : l'arc de la pastille Soleil perdait la nuit.** Date + heure + arc = 282 px pour 230 px d'hôte (390 px de large) : 16 h 30 → 24 h masqués, le point de 22 h sous le chevron (42). | Arc 145 → 313 px, hôte 31 → 261. | Sous 480 px, la date cède sa place (l'heure reste) : arc 77 → 245, point visible, bleu nuit (43). CSS seule (`index_v7.html`). | mesure seulement (mise en page) |

## Tableau par point

| Point | Attendu | Mesuré | Verdict |
|---|---|---|---|
| **1a. Ombres du soleil, jour** | Inchangées | Vieille Charité 15 h 20 (GLB + volumes d'ombre extrudés), nouveau vs publié : **0 pixel différent** (33). Guide interactif 15 h : 10 px (étiquettes). | Bon |
| 1b. Ombres des sources la nuit | Visibles, justes | Absentes (C1) → corrigé : fût projeté à l'opposé de la tête, jusqu'au bord du cône ; 4 mâts ombrés à l'ouverture. | Corrigé |
| 1c. Choix des sources ombrées | Proches, éclairant le sol | Projecteurs montants choisis (C2) → corrigé. | Corrigé |
| 1d. Acné, bandes, clignotement | Aucun | Pas d'acné visible sur le récepteur ni sur les fûts à z19,5–20,5 ; pas de clignotement au balayage (réattribution seulement au-delà de 2 m de déplacement de la caméra). La réattribution fait **sauter** l'ombre d'un mât à l'autre quand l'ordre des distances change : saut franc, sans fondu. | Bon ; saut à arbitrer (P7) |
| 1e. Récepteur et relief | Plat sans relief | Sans relief : juste. **Relief activé** : les luminaires ne sont pas recalés (`sol` = 0 pour les 95, construction non relancée), taches coupées net par le terrain près de la caméra et **peintes sur les toits** au loin (41) ; ombres des spots coupées (volontaire). | Défaut connu (lot E5) — P3 |
| **2. Projections** | Rien de décalé | Mercator : 0 px à z3, 9, 12, 16, 19. Globe : 0 px dès z12 ; sous z12, 312 / 798 px (C8) → corrigé. Couche de nuit : quad plein écran, juste à tous les zooms. | Corrigé |
| **3a. Images/s** (Intel UHD, 1 281 × 800 à 1,5, balayage de cap, 2 × 3 s, **ombres réellement rendues**) | — | Rue z19,5 : sans luminaires 51–59 · 0 ombre/0 lumière 52–58 · 0/16 43–55 · 1/16 51–54 · **4/16 (défaut) 39–51** · 16/16 31–34. Quartier z17 : 58 · 56–58 · 55 · 50–54 · **50–52** · 41. Les mesures du 24/09 au matin (4/16 : 41,7) ne comptaient aucune ombre (C1). | À arbitrer (P1) |
| 3b. Coût d'un changement d'heure | Faible | 60,7 → **5,7 ms** (C3). | Corrigé |
| 3c. Fuite | Aucune | 200 changements d'heure : géométries 14 → 14, textures 16 → 16, programmes 35 → 35. 20 changements de fond : 14 → 14, 4 → 4, 10 → 10, même renderer, **aucun écouteur de carte ajouté** (comptes `_listeners` identiques). | Bon |
| **4a. Changement de fond** | Nuit, ordre, trajet justes | Justes quand l'`idle` tombe après le style ; perdus ou enterrés sinon (C6) → corrigé, revérifié (positron, liberty, plan-ign, fond d'étape de récit). | Corrigé |
| 4b. Récit qui change d'heure | Lampes et nuit suivent ; la sortie rétablit | Vieille Charité, étapes 4 (17 h) et 6 (22 h 30, changement de fond) : nuit juste après C6 et C7. Sortie du récit non mesurée (onglet perdu pendant la séquence). | Bon (sortie non vérifiée) |
| 4c. Mode lecture | — | Scène `?scene=` en lecture : pastille Soleil présente (`viewer_controls`), luminaires rendus sur grand écran. | Bon |
| 4d. Téléphone | Pastille au doigt | Arc tronqué (C9) → corrigé. **Aucun luminaire au téléphone** : `light3d` coupe la 3D en lecture étroite pour la session — la nuit s'affiche, pas les lampes. | Corrigé / P6 |
| 4e. Fuseau `Indian/Reunion` | Heures du site | 15 janvier : allumé 05 h 30, éteint 06 h 00 et 19 h 00, allumé 20 h 00 ; 15 juin : allumé 18 h 00, éteint 07 h 00 — cohérent avec le coucher et le lever NOAA locaux. | Bon |
| 4f. Changements d'heure | Heures du site justes | Paris 29/03 : 02 h 30 inexistante → glisse (abaissé) ; 07 h 00 allumé (lever 07 h 25), 20 h 00 éteint (coucher 20 h 01). 25/10 : 18 h 00 allumé (coucher 17 h 39), 07 h 00 allumé (lever 07 h 04). | Bon |
| **5a. Jour inchangé, démos sans luminaire** | Strictement | Vieux-Port 14 h : 99,82 % identiques, volumes 140,8 / 135,1 / 125,8 des deux côtés ; Charité 15 h 20 : 100 %. | Bon |
| 5b. Nuit des démos sans luminaire | Comme l'ancienne | Vieux-Port 23 h : volumes 33,8 / 36,1 / 42,4 contre 34,7 / 36,2 / 42,5 publiés ; l'écart est l'attribution MapLibre, qui n'est plus assombrie (connu). Charité 22 h 30 : chapelle trop claire (C7) → corrigé. | Bon après C7 |
| **Bâtis « presque noirs » la nuit** | Pas de double assombrissement | Même noirceur que la version publiée (Jarret 23 h : 36,3 / 38,3 / 44,5 contre 37,1 / 38,1 / 44,2 ; Vieux-Port ci-dessus). Elle vient de `map.setLight` abaissé la nuit **et** du facteur de nuit — déjà cumulés sous le voile CSS. | Pas de régression ; P5 |
| **6. `getFreeCameraOptions`, `camera`** | Corrigés | C4, C5. | Corrigé |

## Qui reçoit la lumière des luminaires (demande complémentaire A)

| Récepteur | Reçoit ? | Mesure / capture |
|---|---|---|
| Modèles GLB du catalogue (arbres, mobilier, luminaires) | **Oui**, par les 16 spots et leurs ombres | Arbres de `scene-verif` teintés au pied des mâts (10). |
| Bâti chargé comme objet (tuile pix2hdr ancrée) | **Oui** | Façades et sol de la tuile éclairés (10). **Mais** le récepteur plat (sol MapLibre) **s'ajoute** au sol de la tuile, déjà éclairé : 166 046 px éclaircis de **+49/255** en moyenne (luminance 59 → 108), en tache découpée là où le sol GLB passe sous le plan (10 / 10b). → P2. |
| Bâti du fond de plan, couche Atlas extrudée (fill-extrusion MapLibre) | **Non** (attendu) | Façades noires face aux mâts (20). |
| Sol | Récepteur + nappe, sans relief | Voir 1e. |

## Prototype mesuré, non intégré (demande complémentaire B)

Copie des volumes d'ombre (`buildExtrusionShadowMeshes`, 1 243 bâtiments
recopiés en couche Atlas, 12 508 triangles) avec le matériau du récepteur (ne
voit que les spots, fusion additive), `FrontSide`, décalée de **10 cm le long
de la normale** : le `polygonOffset` seul ne suffit pas (0 px ajouté).

- Superposition : juste à +10 cm (8 008 px éclairés, +21/255) ; à 0 cm
  2 602 px seulement (z-fighting) ; à −10 cm, 16 px (masqué). Hauteurs
  cohérentes ici (5 m des deux côtés) ; **incohérentes en général** :
  `featureExtrusionHeightM` borne à 120 m et prend 12 m sans hauteur, MapLibre
  prend `max(h, 0,5)` sans borne — une façade sans hauteur serait éclairée
  sur 12 m pour un volume de 0,5 m.
- Coût : **48 → 37 images/s** (−23 %, rue, 16 spots dont 4 ombrés).
- Portée : ne couvre que les couches Atlas extrudées — **pas le bâti du fond
  de plan**, qui n'a pas de copie three.js (`collectExtrusionsForShadow` ne lit
  que `STATE.layers`) — et seulement ombres activées, hors relief, z ≥ 14.

Conclusion : ni assez bon marché ni assez général pour un réglage ; non
intégré. Captures 20, 24, 25. Pistes en P4.

## Avertissements « READ-usage buffer … » (question complémentaire)

Origine : **MapLibre, projection globe** — `_renderErrorTexture` /
`updateErrorLoop` (mesure de l'erreur numérique du globe), qui crée un tampon
`STREAM_READ` et relit des pixels derrière une barrière. Sur page fraîche sans
script de mesure : 6 avertissements en 12 s de chargement (relief coupé, souris
immobile, nuit). En rendu continu, pile d'appels relevée et comptage : **26
`readPixels` pour 60 images en globe, 0 en mercator** (même scène, même rendu).
Ni Atlas, ni three.js, ni le relief, ni les scripts de comparaison. Coût :
relecture asynchrone, non mesurable dans les images/s. Rien à corriger dans
Atlas ; une scène de rue peut déclarer `projection: 'mercator'` pour une
console propre.

## À arbitrer (mesures, sans trancher)

- **P1. Budget par défaut 4 ombres / 16 lumières** : maintenant que les ombres
  existent, il coûte 7 à 12 images/s à l'échelle de la rue sur Intel UHD
  (39–51 contre 51–59). Options : 1 ou 2 ombres (1/16 : 51–54), ombres des spots
  coupées sous z16, ou soumises au réglage « Ombres » — **aujourd'hui les
  ombres des spots l'ignorent** (seul le relief les coupe). En mercator, à z3,
  les 16 spots et 4 ombres sont encore calculés pour des objets sous le pixel.
- **P2. Double apport sur un sol GLB** (tuile pix2hdr) : +49/255. Pistes : un
  pochoir (les modèles écrivent 1, récepteur et nappe ne dessinent que là où il
  vaut 0), ou couper récepteur et nappe sous l'emprise d'une maquette.
- **P3. Relief activé** : masquer récepteur et nappe (garder lampes et halos)
  jusqu'au lot E5, plutôt que des taches sur les toits ; et relancer
  `Eclairage.construire` au recalage du relief (les `sol` restent à 0).
- **P4. Façades** : si on y revient, borner la copie éclairée aux bâtiments à
  moins de `PORTEE_M` d'une source allumée (quelques dizaines au lieu de
  1 243), aligner la règle de hauteur sur celle de MapLibre, et construire une
  copie du bâti **du fond** (`querySourceFeatures`, `render_height`).
- **P5. Bâti presque noir la nuit** : inchangé par rapport au publié ; vient du
  cumul `setLight` abaissé × facteur de nuit. Adoucir `computeAmbient` la nuit
  changerait la nuit de toutes les scènes — décision de rendu.
- **P6. Téléphone en lecture** : `light3d` coupe la 3D pour la session, donc
  les lampes. Pour une scène d'éclairage, garder au moins lampes et halos
  (sans spots) ?
- **P7. Saut d'ombre** à la réattribution (un mât perd son ombre, un autre la
  prend) : hystérésis sur le rang, ou fondu d'intensité.
- **P8. Téléphone étroit (≤ 375 px)** : même sans la date, l'arc (168 px) dépasse
  encore d'environ 15 px ; un arc à largeur variable demanderait de sortir les
  168 px écrits en dur (`arcSet`, SVG, point).

## Non vérifié

La sortie du récit (retour à l'heure et au fond d'avant) : l'onglet de mesure a
été fermé pendant la séquence.

## Fichiers touchés

`app_v7.js` (ordre des ombres, caméra, cadrage de scène, fond, matériaux non
éclairés, globe), `lib/eclairage-rendu.js`, `lib/eclairage-profil.js`,
`lib/viewport.js`, `lib/basemap-layers.js`, `lib/nuit-rendu.js`,
`lib/luminaires-three.js` et `lib/horloge-scene.js` (versions d'import),
`index_v7.html` (CSS téléphone, `?v=`). Tests : `eclairage-scene`,
`eclairage-profil`, `viewport`, `basemap-layers`, `ombres-luminaires-ordre`
(nouveau). 844 tests passent ; `esbuild` sans erreur.

## Passe réalisme et performance (24-25/09/2026)

Consigne : « le plus réaliste et performant possible, sur mobile comme sur
ordinateur ». Même vue pour toutes les mesures (Jarret, `scene-soleil.json`,
z19,5, inclinaison 62°, cap −25°, 22 h, 15 janvier, 95 luminaires allumés),
**rendu continu** (un `triggerRepaint` par image, carte immobile), fenêtres de
3 s ; temps GPU par requêtes `EXT_disjoint_timer_query_webgl2` autour du seul
rendu three.js. La machine (Intel UHD, Chrome partagé avec d'autres sessions,
navigateur redémarré plusieurs fois pendant la passe) dérive d'une séance à
l'autre de ± 15 % : chaque comparaison est faite **dans la même séance**, la
« carte seule » (luminaires masqués) mesurée à côté. Captures :
`essais-eclairage/realisme/`. L'« avant » est le code d'avant la passe, servi
temporairement à côté (fichiers retirés depuis).

### Images/s avant / après

**Ordinateur** — fenêtre 1 440 × 900, ratio 1,5 (objectif ≥ 55).

| Mesure | Avant (défaut 4 ombres / 16 lumières) | Après |
|---|---|---|
| Carte seule, sans luminaires (même séance) | 48–52 | 43,5–53 |
| Luminaires, défaut | **29,7–31,3** (≈ 60 % de la carte seule) ; 31–40 dans une séance plus rapide | palier `haut` (4 / 16) : **37–39** dans la séance lente (carte seule 43,5), **46–51** dans la rapide (carte seule 52–53) — ≈ 88–92 % de la carte seule |
| Paliers après (séance rapide, même page) | — | haut 45–47 · moyen 47–48 · bas 50–51 · minimal 50–51 |
| GPU du calque three.js | 5,3–6,9 ms (4 / 16) | haut 1,4 ms · moyen 1,0 · bas 0,45 · minimal 0,42 |
| Mode adaptatif | — | reste en `haut` (une descente d'essai sans gain, annulée) |

**Téléphone** — émulé 390 × 844 × 3, `mobile, touch`, processeur ÷ 4 (objectif ≥ 30).

| Mesure | Avant | Après |
|---|---|---|
| Scène en lecture | 3D coupée (`light3d`), **aucune lampe** : 24,5–25 (ratio 3) | lampes, halos, taches (nappe calculée) |
| Palier `bas` (4 lumières, ratio plafonné à 2) | — | **30–31** (carte seule au même ratio : 28–35) |
| Palier `minimal` (aucune vraie lumière, ratio 1,5) | — | **40** |
| Palier `bas` sans plafond de ratio (3) | — | 19–23 |
| Mode adaptatif | — | part en `bas`, descend une fois en `minimal` : **31–37** |

### Ce qui a changé

1. **La nappe remplace le récepteur** (le vrai gain). Le récepteur était un
   plan où chaque pixel évaluait les 16 spots et 4 ombres PCF : 3,7 ms sur les
   5,5 ms du calque. Chaque source (vraie lumière comprise) peint maintenant sa
   tache dans un quadrilatère borné qui n'évalue **que sa source** ; l'ombre
   d'une source ombrée est lue dans la shadow map de son `SpotLight`, PCF doux
   de three.js recopié (capture 02 : ombres des fûts intactes). Les vraies
   lumières n'éclairent plus que les modèles three.js. Shadow maps des lampes
   **figées** hors soleil (`autoUpdate` suit le soleil seul ; `needsUpdate` quand
   les sources ombrées, la scène ou le réglage changent) : ≈ 1 ms de moins à
   4 ombres.
2. **Qualité adaptative** (P1, P6) — `lib/qualite-eclairage.js`, testé.
   Paliers haut (4 / 16), moyen (2 / 8), bas (0 / 4, ratio ≤ 2), minimal
   (0 / 0, ratio ≤ 1,5). Départ selon l'appareil (téléphone, mémoire, cœurs,
   ratio, `light3d`) ; régulateur : descente après deux fenêtres de 0,75 s sous
   90 % de l'objectif, remontée après trois au-dessus de l'objectif + 6 %,
   délai qui double après chaque chute, palier abandonné après deux chutes ;
   images de chargement de tuiles ignorées ; **descente sans gain de 10 %
   annulée** (la carte seule plafonne sous 55 à cette taille : sans ce
   garde-fou, le régulateur descendait jusqu'à `minimal` pour rien — mesuré).
   Le bouton « Ombres » et le relief coupent les ombres des lampes
   (`budgetDuPalier`). En lecture au téléphone, `light3d` coupe les modèles
   mais plus les luminaires. `?eclairage_palier=` fige le palier.
3. **Hystérésis des ombres** (P7) — `repartirSources(…, precedente)` : une
   source garde son ombre (et sa vraie lumière) tant qu'elle reste au rang
   < budget + 2 et à moins de 1,3 × la distance de la dernière retenue + 5 m ;
   ordre d'avant conservé (même lampe du réservoir). Tests.
4. **Lumière comptée deux fois** (P2) — pochoir : les matériaux glTF écrivent 1,
   la nappe des vraies lumières ne se peint pas là ; pochoir effacé avant le
   rendu three.js, masque de MapLibre invalidé après. `scene-verif` (10, 10b,
   10c) : sans pochoir, **+75,6/255 sur 223 433 px** de sol de maquette ; avec,
   **0 px** sur les modèles (la tache ne reste que sur 7 795 px de sol MapLibre
   visible dans une trouée de la maquette).
5. **Relief** (P3) — pied de chaque luminaire sondé **exactement**
   (`queryTerrainElevation` ; le cache de `elevRaw` range par cases de 1e-4°,
   2 à 3 m d'écart sur ces pentes), pente locale (`penteAuPied`, différences
   centrées à ± 3 m, bornée à 35 %), tache posée et inclinée au pied de sa
   source, **avancée de 2 m vers la caméra dans le seul tampon de profondeur**
   (`gl_FragDepth`, même pixel) pour passer devant les bosses du MNT ; recalée
   avec les modèles (`recomputeAll` → `Eclairage.recaler`). Jarret LiDAR HD
   (`scene-relief.json`) : pieds de −33 à +14 m autour de l'origine. Captures
   20 et 21 (avant l'avance : taches trouées par le terrain), 22 (après).
   Reste : un talus plus raide qu'un plan incliné troue encore une tache (22,
   au pied du mât en forte pente).
6. **Façades** (P4) — prototype borné écrit (`lib/facades-eclairees.js`,
   testé) : murs seuls, bâti du fond (`render_height` / `render_min_height`,
   plancher 0,5 m) à moins de 3 × la hauteur de feu d'une source à vraie
   lumière, **arêtes** proches seulement (le fond OpenFreeMap fusionne tout le
   bâti de même hauteur en un multipolygone : 32 000 arêtes pour « un »
   bâtiment), z ≥ 17, à plat, paliers haut/moyen. Coût mesuré (même page,
   alterné) : avec ombres **−10 %** (38–40 contre 42–45), sans ombres
   **−5,5 %** (41–43 contre 44–45). Gain visuel quasi nul sur cette scène
   (capture 30 : les cônes à 70° n'atteignent les murs qu'en incidence
   rasante ; sens des normales vérifié, 30b). **Non activé par défaut** ;
   `?eclairage_facades=1` l'active, sans ombres. Les couches Atlas extrudées
   n'y entrent pas encore.
7. **Nuit du bâti** (P5) — **appliqué**. `LUMIERE_BATI_NUIT = [128, 128, 148]`
   au lieu de `#141c3c` (et `AMBIANCE_NUIT` des modèles `[40, 44, 66]` au lieu
   de `[16, 22, 52]`), sous −6° ; le crépuscule part de cette valeur ; le jour
   (soleil > 0°) n'est pas touché. Même vue (40 → 42) : bâti **38/40/45 →
   45/47/63**, toits et murs se distinguent ; sol non éclairé 89/94/113 et
   taches 221/207/202 inchangés. Essais écartés (41, 41b, 41c) : `#6e625a`
   (37/37/43, rien de gagné), blanc (72/75/92, bâti aussi clair que la rue).
8. **P8** — sous 400 px, le mot « Hauteur » quitte la pastille (la valeur
   reste) : à 375 px, arc 77 → 245 dans un hôte 31 → 247 (il dépassait de
   ≈ 15 px). CSS seule (capture 50).
9. **Sortie du récit** (non vérifiée la dernière fois) — Vieille Charité,
   étape 6 (22 h 30, Positron → Liberty) puis sortie : lumière `#ffffff` / 0,55
   (15 h 20 d'origine), Positron (60 couches ; 115 pendant l'étape), ordre
   `atlas-trajet-line`, `atlas-nuit`, `three-models-3d` aux rangs n−3, n−2,
   n−1. Seul écart : la couche MapLibre d'appui (masquée) de la chapelle GLB
   n'est pas remontée — sans effet visible (le modèle n'est affiché, avant
   comme après, que par les étapes).

Corrigés en passant : taille des halos calculée au ratio **de la carte**
(plafonné) et non de l'écran ; position locale de la caméra corrigée du sol
du centre de la vue sous relief.

### En deçà des objectifs, et pourquoi

- **Ordinateur, 55 images/s** : non atteint (37–51 selon la séance). La carte
  seule, sans aucun luminaire, fait 43,5–53 à 1 440 × 900 × 1,5 sur cet Intel
  UHD : le bâti extrudé du fond coûte ≈ 8 images/s, le ratio 1 donnerait 99.
  L'éclairage ne prend plus que 8 à 12 % de l'image (contre ≈ 40 %). Aller
  au-delà demande d'agir sur le fond (ratio de pixels ordinateur, bâti) —
  hors de l'éclairage, non fait.
- **Téléphone, 30 images/s** : atteint **par le plafond du ratio de pixels**
  (la carte seule fait 25 à ratio 3) : 30–31 au palier `bas` (ratio 2), 40 au
  `minimal` (1,5) ; le régulateur finit en `minimal` sur l'émulation. Lampes,
  halos et taches n'y coûtent presque rien.
- Relief : taches trouées par les talus plus raides qu'un plan ; façades :
  gain visuel trop faible pour leur coût ; ombres de lampes toujours coupées
  sous relief.

Tests : `qualite-eclairage` (nouveau), `facades-eclairees` (nouveau),
`eclairage-scene` (+1), `ombres-luminaires-ordre` (+3) ; suite entière verte,
`esbuild` sans erreur.

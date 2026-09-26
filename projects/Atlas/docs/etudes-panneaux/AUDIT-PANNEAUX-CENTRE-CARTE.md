# Audit — panneaux d'Atlas et centre de la carte (26/09/2026)

Audit sans correction. Code lu dans l'état du 26/09/2026 (branche
`atlas-formulaire-entite`, `app_v7.js` en cours de modification par une autre
session : les numéros de ligne cités sont ceux de cette date et peuvent avoir
glissé de quelques lignes).

Mesures faites dans un onglet isolé sur `https://localhost:8443/projects/Atlas/index_v7.html`,
hors Grist :

- **lecture** : `?scene=…/demos/guide-interactif/scene.json` (une scène externe
  est toujours en lecture) ;
- **édition** : Atlas autonome (« Continuer sans se connecter ») avec les trois
  GeoJSON du guide importés par le bouton Fichier : `ilots` (30 surfaces),
  `axes` (3 lignes), `lieux` (4 points). Tangage remis à 0 pour que les emprises
  projetées soient des rectangles.

La carte a été capturée par interception de `maplibregl.Map.prototype.fire`, et
les appels caméra (`flyTo`, `easeTo`, `fitBounds`, `jumpTo`, `resize`, `stop`)
journalisés avec la largeur du conteneur au moment de l'appel. Les clics sur la
carte sont simulés par `map.fire('click', { point, lngLat })`, qui emprunte le
même gestionnaire que le vrai clic (`setupInteraction`, `app_v7.js:7882`).

**« Zone visible »** : le rectangle du conteneur `#map`, moins ce qui le
recouvre en position fixe (feuilles mobiles, barre du bas, bulle du récit). Un
écart `dx`/`dy` est la distance entre le centre de l'objet visé et le centre de
cette zone. Sur ordinateur, les panneaux ne recouvrent pas la carte : ils la
rétrécissent (flex, `index_v7.html:215-248`).

Captures dans `projects/Atlas/essais-panneaux/` (dossier non suivi par git, mais
**pas** ignoré : ne pas l'ajouter par un `git add projects/Atlas/`).

| Fichier | Ce qu'on voit |
|---|---|
| `01-bureau-1440-ouverture.png` | lecture, récit à l'étape 1, bulle en bas, pastilles du dock |
| `02-bureau-1440-edition-couches.png` | édition, module Couches ouvert, carte de 1 116 px |
| `03-bureau-1440-clic-bord-droit-objet-sous-fiche.png` | l'îlot cliqué au bord droit a disparu sous la fiche |
| `04-tablette-820-module-et-fiche-carte-136px.png` | tablette portrait : carte de 136 px, légende coupée, attribution sur quatre lignes |
| `05-tablette-820-barre-selection-tronquee.png` | barre de sélection coupée : ◀ et ✕ hors de la carte, boussole masquée |

La mesure sur téléphone n'a pas de capture : voir « Incident » en fin de
document.

---

## 1. Largeur réelle de la carte

Rail 64 px, module 260 px, fiche 360 px (`index_v7.html:94-96`), tous fixes. Au-dessus
de 720 px, c'est la mise en page d'ordinateur, **tablette comprise**.

| Écran | Rien d'ouvert | Module | Fiche | Module + fiche |
|---|---|---|---|---|
| Ordinateur 1440×900 | **1 376** (mesuré) | **1 116** (mesuré) | 1 016 | **756** (mesuré) |
| Portable 1280×720 | 1 216 | 956 | 856 | 596 |
| Tablette paysage 1180×820 | **1 116** (mesuré) | **856** (mesuré) | 756 | **496** (mesuré) |
| Widget Grist ≈ 1 184 px | ≈ 1 120 | ≈ 860 | ≈ 760 | **≈ 500** |
| Tablette portrait 820×1180 | 756 | **496** (mesuré) | 396 | **136** (mesuré) |
| Téléphone 390×844 | conteneur 390×792, visible 390×736 | feuille à mi-hauteur : visible **390×297** | idem | une seule feuille |

Hauteur de la carte : fenêtre moins l'en-tête de 52 px (848 à 1440×900, 668 à
1280×720). En lecture, le rail disparaît (`--rail-w: 0`) : la carte fait toute la
largeur, et la fiche n'existe qu'en mode saisie.

Sur téléphone, `#map` est en `inset: 0` dans `.map-frame` : le `padding-bottom`
de 56 px (`index_v7.html:1267`) ne le réduit pas. **La carte passe sous la
barre du bas** : conteneur de 52 à 844, barre de 788 à 844. Le centre
géométrique de la carte est donc 28 px sous le centre de ce qu'on voit, même
sans aucune feuille.

---

## 2. Matrice panneaux × contextes

Légende : V = visible, R = recouvre, F = fermé ou masqué.

### Ordinateur et tablette (> 720 px)

| Contexte | Module | Fiche | Barre de sélection | Dock | Ce qui se passe |
|---|---|---|---|---|---|
| Aucun panneau | F | F | F | V | carte pleine largeur moins le rail |
| Module ouvert | V (260) | F | F | V | carte rétrécie à gauche, centre conservé |
| Couche choisie dans Couches | V | V, symbolisation | F | V | la fiche se rouvre à chaque rendu tant que `selectedLayer` existe |
| Clic sur un objet | inchangé | V, fiche d'objet | V | V | la carte rétrécit à droite de 360 px — voir D2 |
| ✕ de la fiche pendant une sélection | inchangé | F | **reste V** | V | la sélection et le halo restent ; la fiche revient au prochain rendu — D5 |
| Revue objet par objet (◀ ▶) | inchangé | V | V | V | la caméra ne suit que les points — D3 |
| Création ou modification d'objet | inchangé | V, forcée | F | V | `_saisieObjet` passe en tête de `renderInspector` ; ✕ abandonne la création |
| Palette (Ctrl K) | inchangé | inchangé | inchangé | inchangé | voile plein écran (z 4000), rien d'autre n'est accessible ; focus perdu à la fermeture — D9 |
| Pastille du dock ouverte | V | V | décalée à 78 px sous le dock | panneau V | Échap ne referme pas la pastille |
| Récit en présentation (édition) | **reste V** | **reste V** | selon l'étape | données seules | la bulle est centrée dans la carte restante ; la caméra vise la zone au-dessus de la bulle |
| Lecture `?mode=view` | F (masqué en CSS) | F sauf mode saisie | F sauf mode saisie | V | carte pleine largeur, clic = popup |
| Lecture + mode saisie | F | V (360) | V | V | la carte rétrécit comme en édition |

### Téléphone (≤ 720 px, `body.mobile-layout`)

| Contexte | Feuille des modules | Fiche | Visible de la carte | Remarque |
|---|---|---|---|---|
| Rien | fermée | fermée | 52 à 788 | la carte passe sous la barre du bas |
| Onglet Couches | mi-hauteur (349 à 788) | fermée | 52 à 349 | **le centre de la carte (448) est sous la feuille** |
| Clic sur un objet, module ouvert | repliée (rendue à la fermeture de la fiche) | mi-hauteur | 52 à 349 | une feuille à la fois, conforme au CLAUDE.md |
| Onglet choisi, fiche ouverte | mi-hauteur | cède (`ficheCedee`) | 52 à 349 | la fiche revient au prochain objet touché |
| Toucher l'onglet actif | fermée | fermée | 52 à 788 | referme les deux |
| Champ de la fiche touché | repliée | pleine (0,92) | ≈ 0 | voulu : le clavier prend le bas |
| Palette | — | — | — | **inaccessible en édition** : la loupe n'est affichée qu'en lecture (`index_v7.html:1147`, `:1180`) |
| Lecture | pas de barre du bas | la fiche touche le bas | 52 à 844 | conforme |

---

## 3. Le centre de la carte — mesures

### Ordinateur 1440×900, édition

| Geste | Panneaux | Résultat | Écart au centre visible |
|---|---|---|---|
| « Zoomer sur la couche » `ilots` | module | emprise 580–1184 × 132–820, dans la zone | **0, 0** |
| Ouverture de la fiche (symbolisation) après ce zoom | module + fiche | même emprise décalée de −180 px, reste centrée | **0, 0** |
| « Zoomer sur la couche » | module + fiche | marge 80, emprise dans la zone | **0, 0** |
| Fermeture de la fiche | module | recentrée | **0, 0** |
| Clic sur un **îlot** à 100 px du bord droit (x = 1 340) | module → module + fiche | l'îlot passe à x = 1 160, **sous la fiche** (zone visible 324–1080) | **+458**, hors zone |
| Clic sur un **point** à 100 px du bord droit | module → module + fiche | `flyTo` centre le point, mais sur l'ancienne largeur : x = 882 | **+180** |
| Palette → « Îlot 01 » | module → module + fiche | `fitBounds` calculé sur 1 116 px, la fiche s'ouvre pendant l'animation | **+180** |
| Palette → « Kiosque » (point) | module → module + fiche | `fitBounds` puis `flyTo` qui le remplace ; même décalage | **+180** |
| « Zoomer sur la couche », puis Échap 150 ms après (ferme le module) | module → rien | l'animation va au bout, mais le cadrage est décalé | **−130** |
| Même geste sans Échap | rien | référence | **0** |
| Revue `ilots` à z 18, ◀ ▶ jusqu'à 5/30 | module + fiche | aucun mouvement caméra ; Îlot 05 à x 2 044–2 319, zone 324–1 080 | **hors écran** |

Lecture, 1440×900 :

| Geste | Résultat |
|---|---|
| Étape 1 du récit (marge basse 190 px posée par `flyTo`) | centre de l'étape à y = 381, centre au-dessus de la bulle 387 : **−6 px**, correct |
| Sortie du récit | marge remise à zéro par `libererMargeRecit` sans déplacer la vue |
| Clic sur « Îlots » dans la légende | emprise centrée, **0, 0** |

### Tablette portrait 820×1180, module + fiche (carte de 136 px)

| Geste | Résultat |
|---|---|
| « Zoomer sur la couche » | `margeCadrage` = 27 px, cadrage accepté, emprise 351–433, **centrée**. La correction du 26/09 tient. |
| Clic sur un îlot | barre de sélection de 179 à 605 pour une carte de 324 à 460 : **◀ et ✕ hors de la carte** (coupés par `overflow: hidden`), boussole (390–444, z 8) sous la barre (z 10) |
| Légende | 220 px de large à partir de x = 348 : **coupée** à 460 |
| Attribution | sur quatre lignes |

### Téléphone 390×844, édition, module Couches à mi-hauteur

| Geste | Résultat |
|---|---|
| « Zoomer sur la couche » `ilots` | marge 78 px ; emprise 317–579 en hauteur, zone visible 52–349 : **230 px sur 262 sous la feuille** ; centre de l'emprise à y = 448, **+247 px** sous le centre visible (201) |
| Clic sur un point (déduit de la mesure ci-dessus : `flyTo` pose le point au centre du conteneur, y = 448) | la fiche s'ouvre à mi-hauteur, bord haut à 349 : **le point est 99 px sous la fiche** |

### Ce que ferait un padding MapLibre

MapLibre sait viser un centre décalé : `padding` passé à `flyTo`/`easeTo`/`jumpTo`
reste dans la transformation, et **tous** les appels suivants (`fitBounds`,
`flyTo`, `resetView`) visent alors le centre de la zone non couverte. Atlas ne
s'en sert que pour la bulle du récit (`app_v7.js:4561`, `:4185-4195`,
`libererMargeRecit` `:6229`). Aucun `setPadding` ailleurs.

- Sur **ordinateur**, le padding n'est pas nécessaire au repos : les panneaux
  rétrécissent la carte, et `resize()` garde le centre géographique au centre de
  la nouvelle carte (mesuré : 0, 0). Le défaut est ailleurs : ce qui n'était pas
  au centre glisse de la moitié de la largeur du panneau (D2), et un
  redimensionnement **pendant** une animation fausse sa cible (D1).
- Sur **téléphone**, c'est l'inverse : la carte ne change pas de taille, les
  feuilles la recouvrent. Avec `padding.bottom` = hauteur de la feuille + 56 px,
  le « Zoomer sur la couche » ci-dessus aurait cadré l'emprise dans 52–349 au
  lieu de 317–579, et le point cliqué serait tombé à y ≈ 200 au lieu de 448.
- `setPadding` seul déplace la vue d'un coup (le centre géographique saute au
  nouveau centre décalé) ; `easeTo({ padding, duration: 250 })` fait la même
  chose en douceur, et c'est ce qu'il faut appeler quand une feuille change de
  position. La marge du récit et celle des feuilles doivent alors être
  **composées** par une seule fonction : aujourd'hui le récit écrit
  `{ top: 0, left: 0, right: 0, bottom: bulle }` et écraserait une marge de
  feuille.

---

## 4. Effets de bord

**Animation et redimensionnement.** Dans MapLibre 5.6.1, `resize()` n'arrête pas
une animation en cours (`stop()` n'est appelé que si la carte est immobile).
L'animation va donc au bout — mais `flyTo`/`easeTo` figent au départ le point
d'écran où poser le centre (`pointAtOffset = centerPoint + offset`). Après un
redimensionnement, ce point est l'ancien centre : la cible finit décalée de la
moitié de la variation de largeur. C'est ce qu'on mesure (+180 à l'ouverture de
la fiche, −130 à la fermeture du module). Le symptôme du 26/09 (« un clic qui
ferme le module coupait Zoomer sur la couche ») se reproduit sous cette forme :
le zoom a lieu, mais il n'est plus centré ; sur une carte étroite, l'objet peut
sortir de la vue et le zoom paraît perdu.

**`fitBounds` refusé faute de place.** `fitToLayer` et `fitToFeatures` passent par
`margeCadrage` (`app_v7.js:8504`). Il reste deux cadrages à marge fixe de 60 px :
`applyInitialViewport` (`:2800`, `:2809`). À 136 px de large il reste 16 px utiles :
accepté, mais à la limite. Sur un téléphone en paysage (844×390, donc mise en
page d'ordinateur), module + fiche laissent 160 px : même situation. Aucun autre
`fitBounds` ni `cameraForBounds` dans le fichier.

**Recouvrements mesurés.** Barre de sélection coupée et boussole masquée sous
560 px de carte environ (426 px de barre, centrée) ; légende de 220 px coupée
sous 270 px de carte ; toast « Mode sélection » posé sur le bas de la fiche
(captures 03 et 05, sans gravité) ; en lecture, attribution et légende
correctement étagées (capture 01).

---

## 5. Défauts classés par gravité

### Majeurs

**D1 — Un panneau qui s'ouvre ou se ferme pendant une animation fausse le cadrage.**
Mesure : +180 px (palette, clic sur un point), −130 px (Échap pendant « Zoomer »).

- Cause : `resizeMapSoon` (`app_v7.js:6581`) redimensionne dans un
  `requestAnimationFrame`, **après** le `flyTo` lancé par `enterSelectionMode`
  (`:8210`) ou `allerAObjet` (`:10031`) ; `openModule` (`:4608`) et
  `closeModulePanel` (`:4682`) ne redimensionnent pas du tout et laissent faire le
  `ResizeObserver` de MapLibre, lui aussi asynchrone.
- Correction : (a) redimensionner **tout de suite** : `map.resize()` synchrone
  dans `openInspectorPanel`/`closeInspectorPanel`, et dans `openModule`/`closeModulePanel`
  au bureau (la mise en page est recalculée dès la lecture de `clientWidth`) ;
  garder le second appel différé pour les transitions ; (b) retenir la dernière
  visée (`{ kind: 'fit', bounds, options }` ou `{ kind: 'fly', center, zoom }`) et,
  sur l'événement `resize` pendant `map.isMoving()`, la relancer depuis la
  position courante avec la durée restante.
- Test : `tests/visee-redimensionnement.test.js` sur une fonction pure
  `viseeApresRedimensionnement({ visee, avant, apres })` qui rend la visée à
  relancer ; plus un essai navigateur documenté : Zoomer puis Échap à 150 ms,
  écart au centre ≤ 2 px.

**D2 — L'objet cliqué près du bord passe sous la fiche (surfaces et lignes).**
Mesure : îlot cliqué à x = 1 340, retrouvé à x = 1 160, zone visible jusqu'à 1 080.

- Cause : `flyToFeature` (`app_v7.js:8285`) ne traite que les points ; une surface
  ou une ligne cliquée ne déclenche aucun mouvement, et la fiche retire 360 px à
  droite (`openInspectorPanel`, `:6588`) : tout ce qui était dans les 180 px de
  droite sort de la vue.
- Correction : une fonction `garderVisible(feature)` appelée après le
  redimensionnement de la fiche : si l'emprise de l'objet déborde de la carte
  (moins une marge `margeCadrage`), `easeTo` du plus petit déplacement qui la
  ramène dedans, sans changer le zoom ; si elle est plus grande que la carte,
  `fitBounds`. Ne rien faire quand l'objet est déjà visible : un clic ne doit pas
  faire bouger une carte qui montre déjà ce qu'on vise.
- Test : fonction pure `deplacementPourVoir({ emprise, carte, marge })` dans
  `lib/viewport.js`, testée dans `tests/viewport.test.js` (objet visible → 0 ;
  objet à 100 px du bord d'une carte qui perd 360 px → décalage de 180 + marge).

**D3 — La revue objet par objet ne suit pas les lignes ni les surfaces.**
Mesure : en revue `ilots`, à 5/30, l'objet courant est à x = 2 044–2 319 pour une
zone de 324–1 080 ; aucun appel caméra.

- Cause : `nav` (`app_v7.js:11890`) et `editLayerObjects` (`:11249`) passent par
  `flyToFeature`, qui ignore tout sauf `Point`.
- Correction : `flyToFeature` cadre toute géométrie : point → `flyTo` comme
  aujourd'hui ; autre → `fitBounds` de son emprise avec `margeCadrage` et
  `maxZoom` = zoom courant (on ne dézoome que si l'objet ne tient pas).
- Test : `tests/cadrage-objet.test.js` sur `cameraPourObjet(geometrie)` : rend
  `{ kind: 'fly' }` pour un point, `{ kind: 'fit', bounds }` pour ligne,
  surface, multi-parties.

**D4 — Sur téléphone, la caméra vise sous la feuille.**
Mesure : « Zoomer sur la couche » avec la feuille à mi-hauteur : 88 % de l'emprise
sous la feuille (+247 px) ; un point touché est posé 99 px sous le bord de la
fiche ; même sans feuille, le centre est 28 px sous le centre visible (la carte
passe sous la barre du bas).

- Cause : aucun appel caméra ne connaît les feuilles (`poserPanneau`,
  `app_v7.js:8952`, ne touche pas à la carte) ; `#map` en `inset: 0` sous la barre
  du bas (`index_v7.html:238`, `:1267`).
- Correction : une fonction `margesCarte()` qui compose tout ce qui recouvre la
  carte — bas : `max(feuille visible + barre du bas, bulle du récit)` ; rien sur
  les côtés au bureau — et un `map.easeTo({ padding: margesCarte(), duration: 250 })`
  à chaque changement de position de feuille (`poserFeuille`, `poserFiche`,
  `fermerFicheMobile`), à l'entrée et à la sortie du récit. Le récit passe par la
  même fonction au lieu d'écrire sa propre marge (`:4561`, `:4185-4195`,
  `libererMargeRecit`). Alternative plus simple pour la barre du bas : poser
  `bottom: 56px` sur `#map` plutôt qu'un `padding-bottom` sur son parent.
- Test : `margesCarte` pure dans `lib/feuille-mobile.js`, testée dans
  `tests/feuille-mobile.test.js` (fermée → 56 ; mi-hauteur sur 844 → 439 + 56 ;
  lecture → pas de barre ; récit plus haut que la feuille → la bulle l'emporte).

**D5 — Tablette portrait et fenêtres de 721 à ~1 100 px : la carte tombe à 136 px.**
Mesure : 820×1180, module + fiche : carte de 136 px ; légende coupée, barre de
sélection coupée (✕ et ◀ hors de la carte), boussole masquée, attribution sur
quatre lignes.

- Cause : trois colonnes fixes (64 + 260 + 360) au-dessus de 720 px
  (`index_v7.html:94-96`, `:215`, `:242`), sans règle qui les rende exclusives.
- Correction : étendre la règle du téléphone, « une feuille à la fois, la fiche
  prime », à toute carte qui passerait sous un seuil (≈ 420 px) : ouvrir la fiche
  replie le module et le lui rend à la fermeture — la mécanique existe déjà
  (`feuilleAvantFiche`, `ouvrirFicheMobile`, `:8993`). La décision se prend sur
  la largeur de la carte, comme `etageCoteACote`.
- Test : fonction pure `panneauxCompatibles({ largeurFenetre, rail, module, fiche, seuil })`
  dans `lib/habillage-carte.js`, testée dans `tests/habillage-carte.test.js`
  (1440 → les deux ; 820 → la fiche seule).

### Moyens

**D6 — Le ✕ de la fiche ne ferme pas la sélection, et la fiche revient.**
Mesure : clic sur un îlot, ✕ : fiche fermée, barre de sélection et halo restent ;
clic sur « Soleil » dans le rail : la fiche de l'îlot se rouvre.

- Cause : `closeInspectorByUser` (`app_v7.js:6606`) ne sort pas de la sélection,
  et `renderInspector` (`:6616`, ligne `inspectorUserClosed = false` à `:6623`)
  efface le choix de l'utilisateur à chaque rendu dès qu'une sélection existe.
- Correction : choisir l'un des deux. Soit ✕ pendant une sélection =
  `exitSelectionMode()` (la barre a déjà son ✕, les deux se valent) ; soit
  `inspectorUserClosed` ne retombe qu'à un **changement** de sélection
  (`enterSelectionMode`, `afterSelectionChange`), jamais dans `renderInspector`.
- Test : `tests/inspecteur-etat.test.js` sur une fonction pure
  `ficheOuverte({ selection, fermeeParUtilisateur, saisie, module, couche, lecture })`
  extraite de `renderInspector`.

**D7 — Barre de sélection et boussole sur une carte étroite.**
Mesure : à 136 px, barre de 426 px centrée, ✕ hors de la carte ; boussole sous
la barre.

- Cause : `.selection-bar` centrée sans largeur maximale au bureau
  (`index_v7.html:587`) ; la version compacte n'existe que sous 720 px de fenêtre
  (`:1157`), pas sous une largeur de carte.
- Correction : `container-type: inline-size` sur `.map-frame` et une règle
  `@container (max-width: 560px)` qui reprend la forme compacte du téléphone
  (✕ toujours visible, « Désélectionner » masqué), et `top` décalé sous la
  boussole.
- Test : ajouter aux essais navigateur du CLAUDE.md la vérification « ✕ de la
  barre dans la carte » à 820 px ; un test unitaire n'y verrait rien.

**D8 — Palette sur téléphone en édition : absente.**
`body.mobile-layout .app-header .cmdk { display: none }` (`index_v7.html:1147`),
réaffichée en lecture seulement (`:1180`) ; la feuille « Plus » ne propose pas
de recherche. On ne peut pas chercher un objet par son nom en édition sur
téléphone. Correction : la loupe seule, comme en lecture. Test : aucun
automatisable ; essai navigateur.

**D9 — Échap et le focus.**
Relevé dans le code (`app_v7.js:12065-12071`), confirmé pour le focus :

- Échap ne quitte pas la présentation du récit (seul le ✕ de la bulle, `:6138`) ;
- Échap ne replie pas une pastille ouverte du dock ;
- Échap ne ferme pas la fiche de symbolisation : après une sélection, un premier
  Échap rend la symbolisation, un second ferme le **module** et la fiche avec lui ;
- aucun test sur la cible : Échap tapé **dans un champ de la fiche** sort de la
  sélection et ferme la fiche (non mesuré avec un formulaire rempli — à vérifier
  avant de conclure à une perte de saisie) ;
- après la palette, le focus retombe sur `BODY` (mesuré) : `closeCmd` (`:9971`) ne
  le rend pas à l'élément qui l'avait.

Correction : une pile d'états fermables dans l'ordre palette → saisie → choix sur
carte → pastille du dock → sélection → récit → module, ignorée quand la cible est
un champ de saisie sauf pour la palette ; `openCmd` retient
`document.activeElement` et `closeCmd` le lui rend. Test :
`tests/echap.test.js` sur `quoiFermer(etat)` pure.

### Mineurs

**D10 — Double animation depuis la palette sur un point.** `allerAObjet`
(`:10031`) lance `fitToFeatures`, puis `enterSelectionMode` lance `flyToFeature`
qui l'annule (journal : `fitBounds`, `flyTo`, `stop`, `flyTo`). Correction : ne
cadrer qu'une fois, via `flyToFeature` corrigé (D3).

**D11 — Cadrage initial à marge fixe.** `applyInitialViewport` (`:2800`, `:2809`)
garde `padding: 60`. Correction : `margeCadrage()`. Test : l'existant sur
`margeCadrage` s'il y en a un, sinon un cas « carte de 136 px » dans
`tests/viewport.test.js`.

**D12 — Toast sur la fiche.** Les toasts se posent en bas à droite, sur la fiche
(captures 03 et 05). Correction : les ancrer au bord droit de la carte
(`right: calc(var(--inspector-w) + 16px)` quand la fiche est ouverte).

---

## 6. Ce qui fonctionne et doit le rester

- Au bureau, un objet **centré** reste centré quand un panneau s'ouvre ou se
  ferme sans animation en cours (mesuré : 0, 0 dans les quatre cas).
- `margeCadrage` : le cadrage est accepté sur une carte de 136 px (marge 27).
- Récit : la caméra vise au-dessus de la bulle (−6 px) et la marge part sans
  déplacer la vue.
- Téléphone : une feuille à la fois, la fiche prime ; l'onglet actif referme ;
  le champ touché déploie la fiche.
- Lecture : légende cliquable qui cadre l'emprise au centre.

---

## Incident pendant l'audit

Deux fois, l'onglet d'audit a disparu de la liste des pages de l'outil de
navigateur, qui est alors revenu sur l'onglet Grist de l'utilisateur (page 1).
Les scripts avaient une garde sur `location.host` : aucun script n'a tourné sur
la page Grist. En revanche, **un appel d'émulation « téléphone 390×844, tactile,
mobile » a été appliqué à l'onglet Grist** : une capture prise ensuite montrait
le document Grist en vue téléphone. Cette capture a été supprimée aussitôt.
L'onglet Grist est donc probablement encore émulé en 390×844 : il faut remettre
l'émulation à zéro (ou fermer et rouvrir l'onglet). Les mesures sur téléphone
ont ensuite été reprises dans un nouvel onglet isolé, sans émulation « mobile »
(largeur seule, ce qui suffit à `matchMedia('(max-width: 720px)')`), puis les
essais ont été arrêtés.

---

## Suite : corrections du 26/09/2026

| Défaut | Correction | Mesure après |
|---|---|---|
| D1 panneau pendant une animation | visée retenue et relancée sur `resize` (`relancerVisee`, `dureeRestante`), `map.resize()` immédiat | Zoomer puis Échap à 150 ms : **0, 0** (−130 avant) |
| D2 objet sous la fiche | `garderVisible` / `deplacementPourVoir` | îlot cliqué à x = 1 016 sur 1 116 px → 537–732 sur 756 px, **visible** |
| D3 revue ◀ ▶ | `flyToFeature` suit toute géométrie | 2/30 à 6/30 : chaque îlot **dans la carte** |
| D4 téléphone | marge de caméra = feuilles + barre du bas (`margesCarte`), récit composé | feuille à mi-hauteur : marge 495, emprise 59–238 dans 0–297, **dy 0** (+247 avant) ; fermée : marge 56, **dy 0** |
| D5 tablette | `moduleCedeALaFiche`, `.module-cede` | fiche d'objet : carte **397 px** (136 avant) ; fermée : module rendu, 497 px |

Ajout demandé en cours de route : l'objet courant ressort des autres
sélectionnés (halo `_courant`). Tests : `tests/zone-visible.test.js`.

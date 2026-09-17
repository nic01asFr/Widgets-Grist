# Cascade des Aygalades — Marseille 15ᵉ (démo Atlas)

Scène de démonstration autonome : elle s'ouvre par `?scene=<url>`, sans document
Grist, sans compte, sans écriture.

```
index_v7.html?scene=<url>/scene.json
```

## Pourquoi ce site

Un vallon de bastides devenu zone industrielle, franchi par l'autoroute A7 et le
faisceau Paris-Lyon-Marseille, où le ruisseau des Aygalades — busé sur une
grande partie de son cours — refait surface le temps d'une cascade. Le site est
l'emprise du futur parc des Aygalades.

Le choix n'est pas décoratif : **la donnée porte elle-même le sujet**. Sur les
15 tronçons d'eau cartographiés, 6 sont tagués `tunnel`/`covered`. Un cours
d'eau busé n'est pas absent de la carte, il y est invisible — et c'est
exactement ce qu'une symbologie catégorisée sait montrer.

## Contenu

| Couche | Entités | Ce qu'elle montre |
|---|---:|---|
| Bâti | 2 820 | extrudable ; `height_m` depuis OSM, sinon 9 m |
| Voirie | 175 | catégorisée : Autoroute · Voie principale · Desserte |
| Voies ferrées | 20 | les deux lignes qui franchissent le vallon |
| Emprises | 19 | Activité · Ferroviaire · Espace vert |
| Ruisseau et canal | 15 | catégorisée : à ciel ouvert · **busé** |
| Mobilier urbain | 374 | **inline** — 239 lampadaires, 120 arbres, 6 bancs, 9 abribus, chacun avec son modèle du catalogue |
| Arbres (LiDAR HD) | 640 | **inline** — sommets de canopée relevés dans le MNH de l'IGN, hauteur mesurée, modèle mis à l'échelle par entité |

Fond : **orthophotographie IGN sur le relief LiDAR HD**, à l'échelle vraie sauf à
l'étape 7, qui l'accentue et le dit.

Poids total servi : ~1,8 Mo — le bâti (1,0 Mo), et le manifeste qui embarque mobilier et arbres (inline).

### Pourquoi le mobilier est *inline* et pas servi par URL

Les instances 3D sont construites en parcourant `filteredGeoJSON(layer).features`
et en lisant `feature.geometry.coordinates`. Sur une couche servie par URL,
**Atlas ne détient pas les entités** — MapLibre les a, lui, mais Atlas n'y accède
pas. La liste est donc vide et rien n'est instancié : la couche apparaît dans la
légende avec son compte déclaré, et la carte reste nue.

C'est un échec parfaitement silencieux, et la règle qui en découle vaut pour
toute scène : **une couche à modèles 3D doit porter ses entités** (inline, ou
table du document). 76 Ko ici.

Effet de bord visible et voulu : la légende affiche « Lampadaire 239 » en compte
**exact**, sans le « ≈ » des couches distantes — parce qu'ici Atlas compte
vraiment.

## Les arbres viennent du LiDAR, pas d'un décor

`build-arbres-lidar.mjs` lit deux grilles de l'IGN au pas de 0,5 m — le modèle de
surface (MNS) et le modèle de terrain (MNT) — sur 360 m de côté autour de la
cascade. Leur différence est la hauteur de ce qui pousse. Un arbre est un
**sommet local** de cette hauteur, cherché dans un rayon proportionnel à sa
taille.

Le script écarte ce qui n'est pas de la végétation : le bâti OSM (un toit est un
sommet), les abords de l'autoroute et des voies ferrées (un viaduc aussi), et le
volume du relevé photogrammétrique.

Chaque point porte `hauteur_m`, `_modelId`, `_scale` (hauteur mesurée ÷ 5,9 m,
hauteur du modèle du catalogue) et `_rotationZ` dérivé de sa position — stable
d'une extraction à l'autre, contrairement à un tirage au hasard.

> **Ce n'est pas un inventaire.** L'essence est inconnue, deux houppiers
> jointifs peuvent ne donner qu'un sommet, et un arbre sous un plus grand
> manque. La couche le dit dans sa fiche : « sommet local du MNH ».

Aucune dépendance npm : le WMS-R sert du `image/x-bil;bits=32` (float32
petit-boutiste, lignes du nord au sud — vérifié contre le GeoTIFF), et la
conversion Lambert-93 → WGS84 est l'algorithme publié par l'IGN. Contrôle :
les points retombent au centre des mailles de 0,5 m.

## Le récit — huit étapes

| # | Titre | Ce qui est démontré |
|---|---|---|
| 1 | Un vallon au nord de Marseille | vue d'ensemble, symbologie simple, catégorisée |
| 2 | Le ruisseau, et là où il disparaît | catégorisation sur un attribut qui *dit* quelque chose |
| 3 | Ce qui est passé par-dessus | superposition, ordre des couches, vue oblique |
| 4 | Le bâti en volume | extrusion + graduation par bornes + **ombres** |
| 5 | La cascade | le site réel : ravin, canopée LiDAR, chute mesurée dans le MNT |
| 6 | Le catalogue, posé sur de vraies données | modèles 3D **représentatifs** du catalogue, un par entité |
| 7 | Le vallon a une forme | **relief accentué 2×**, volumes drapés par MapLibre |
| 8 | Ce qui reste ouvert | retour au plan, lecture d'ensemble |

### Contrôles exposés

Deux pastilles sont actives et manipulables par le lecteur : **Hauteur (m)**
(plage, sur le bâti) et **Tracé** (sélection busé / à ciel ouvert, sur l'eau).
Trois autres sont déclarés mais inactifs (usage du sol, type de mobilier,
origine de la hauteur).

> `active: true` n'est pas cosmétique : **seul un contrôle actif devient une
> pastille**. À `false` — le défaut du schéma, « un contrôle proposé n'est pas
> un contrôle appliqué » — le lecteur d'une scène publiée ne le voit jamais,
> puisque le mode vitrine lui refuse aussi le rail d'auteur. Les bornes
> couvrent toute la plage : le filtre est visible sans rien retrancher tant
> qu'on n'y touche pas.

Chaque couche porte aussi un `popup_template` : le clic ouvre une fiche. Venu
d'une adresse, ce gabarit est rendu **comme du texte** — les valeurs sont
échappées, rien n'y est exécutable.

Chaque étape emporte sa propre copie de la symbolisation, son heure solaire et
son état d'ombres.

## Reconstruire

```bash
node build-from-overpass.mjs   # interroge Overpass -> les 7 GeoJSON + _bbox.json
node build-arbres-lidar.mjs    # lit MNS/MNT IGN -> arbres-lidar.geojson
node build-scene.mjs           # relit les GeoJSON -> scene.json (comptes inclus)
```

Les deux sont séparés à dessein : l'extraction se rejoue quand la donnée bouge,
la mise en scène se retouche à chaque relecture du récit. Les mêler obligerait à
réinterroger Overpass pour corriger une phrase.

`build-scene.mjs` **relit les comptes dans les GeoJSON** au lieu de les recopier.
Un `featureCount` écrit à la main devient faux à la première réextraction, sans
que rien ne le signale — Atlas afficherait « ≈2820 » sur une couche qui n'en a
plus autant.

Valider avant publication :

```bash
node ../../../../scripts/valider-schema.js \
     ../../../../published/schemas/scene-manifest-0.2.2.schema.json scene.json
```

## Le relevé photogrammétrique, retiré du récit (17/09/2026)

`_cascade-sketchfab.glb` — **La Cascade** par **M.Dailly**,
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/),
[page source](https://sketchfab.com/3d-models/la-cascade-820f7441157546949d07e3ce52b2287a).

Il n'est plus dans la scène, et son nom commence par `_` : la promotion ne copie
donc pas ses 6 Mo vers `published/`.

Pourquoi : posé sur le sol LiDAR, il s'est révélé être un **fragment de paroi**
sans échelle absolue. Son origine est au milieu de sa boîte englobante, donc la
moitié basse passait sous le terrain ; remonté, il flottait. À côté d'une
orthophotographie à 20 cm drapée sur un MNT à 50 cm, il ne tenait pas la
comparaison — il ajoutait du faux à du vrai.

Tant que la scène posait tout sur un fond clair **sans relief**, rien de cela ne
se voyait : le modèle planait sur une feuille blanche, et c'est ce que la
première version montrait à l'étape 5.

Un relevé propre viendra du chantier LiDAR (nuage de points COPC de l'IGN).

## Le site de la cascade, mesuré

Profil radial dans le MNT LiDAR HD à 0,5 m, autour du nœud OSM `789366740`
(`waterway=waterfall`, `5.3632144, 43.3531876`) :

| Mesure | Valeur |
|---|---|
| amont | 58,5 m |
| pied | 46,7 m |
| chute | **11,8 m sur 6 m** |
| azimut de l'aval | 160° (sud-sud-est) |
| sursol autour (MNS − MNT) | 7 à 26 m — la cascade est sous canopée |

D'où le cadrage de l'étape 5 : depuis l'aval, en regardant l'amont
(`bearing: 345`).

## Limites connues

- Les bastides repérées par OSM (`historic=manor`) sont classées dans le bâti,
  pas dans la couche « mémoire » : ce sont des polygones `building`, captés
  comme tels. La couche `memoire.geojson` ne retient donc que 4 points
  (monuments aux morts, fontaine) et n'est pas exposée dans le récit.
- L'orthophotographie de la Géoplateforme s'arrête au **zoom 19** : au-delà,
  MapLibre agrandit la dernière tuile servie (image floue). Sans la borne
  `maxzoom`, elle demandait des tuiles 20 et 21, recevait des 404, et laissait
  un **trou** dans la carte — corrigé dans Atlas le 16/09/2026.
- Le MNT IGN rend des **502 par intermittence** quand les tuiles partent en
  rafale. Atlas réessaie deux fois ; en cas d'échec, il n'invente plus un sol
  plat à 0 m — ce repli donnait une falaise au bord du vide.
- L'extraction dépend d'Overpass, dont les instances publiques répondent 504
  sous charge. `postOverpass` bascule sur trois miroirs et nomme tous les refus ;
  le mobilier, lui, est non bloquant — son absence ne doit pas emporter le bâti
  et la voirie déjà obtenus.

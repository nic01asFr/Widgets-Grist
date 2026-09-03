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
| Cascade (relevé 3D) | 1 | GLB photogrammétrique posé à ses coordonnées |

Poids total : ~7,4 Mo, dont 6,0 pour le modèle 3D et 1,0 pour le bâti.

## Le récit — six étapes

| # | Titre | Ce qui est démontré |
|---|---|---|
| 1 | Un vallon au nord de Marseille | vue d'ensemble, symbologie simple, catégorisée |
| 2 | Le ruisseau, et là où il disparaît | catégorisation sur un attribut qui *dit* quelque chose |
| 3 | Ce qui est passé par-dessus | superposition, ordre des couches, vue oblique |
| 4 | Le bâti en volume | extrusion + graduation par bornes + **ombres** |
| 5 | La cascade | modèle 3D éclairé, ombre portée, calage géographique |
| 6 | Ce qui reste ouvert | retour au plan, lecture d'ensemble |

Chaque étape emporte sa propre copie de la symbolisation, son heure solaire et
son état d'ombres.

## Reconstruire

```bash
node build-from-overpass.mjs   # interroge Overpass -> les 6 GeoJSON + _bbox.json
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

## Le modèle 3D

`cascade.glb` — **La Cascade** par **M.Dailly**, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/),
[page source](https://sketchfab.com/3d-models/la-cascade-820f7441157546949d07e3ce52b2287a).
Attribution complète : [CREDITS.md](../../../../CREDITS.md) à la racine du dépôt.

Converti par `_convertir-glb.mjs` : le fichier d'origine porte
`KHR_materials_unlit`, un matériau qui **ignore toute lumière**. three.js le
charge alors en `MeshBasicMaterial`, qui ne reçoit ni ne projette d'ombre — le
relevé aurait eu le même aspect à midi et à minuit, ce qui vide l'étape 5 de son
propos. La conversion en PBR lui rend l'éclairage ; la géométrie et la texture
sont intactes.

```bash
node _convertir-glb.mjs entree.glb cascade.glb
```

## Points de calage

| Paramètre | Valeur | Pourquoi |
|---|---|---|
| Ancre | `5.3632144, 43.3531876` | nœud OSM `789366740`, `waterway=waterfall` |
| `scale` | `1.8` | le relevé Metashape n'a pas d'échelle absolue ; 1 unité ≠ 1 m. Donne 9,6 × 8,8 × 12,5 m, mesuré dans la scène |
| `rotationZ` | `0` | non calé — l'orientation du scan n'est pas géoréférencée |

Un bâtiment OSM (`way/97710100`, 13 × 12 m) se trouve **à 10 m au nord** de la
cascade. Il ne recouvre pas le modèle — mesuré : rayon du modèle 6,5 m — mais il
le masque aux azimuts est, d'où le cadrage de l'étape 5 par l'ouest
(`bearing: 250`).

## Limites connues

- Le tracé du ruisseau est drapé **par-dessus** le relevé : c'est une couche
  2D, MapLibre la pose sur le sol. Cohérent ici (la cascade *est* sur le
  ruisseau), mais à savoir avant de réutiliser le procédé ailleurs.
- Les bastides repérées par OSM (`historic=manor`) sont classées dans le bâti,
  pas dans la couche « mémoire » : ce sont des polygones `building`, captés
  comme tels. La couche `memoire.geojson` ne retient donc que 4 points
  (monuments aux morts, fontaine) et n'est pas exposée dans le récit.
- `terrain3D` est à `false` sur toutes les étapes. Le relief n'a pas été éprouvé
  ici, et le calage d'altitude d'une couche distante n'a qu'une valeur par
  emprise.

# Crédits et licences des contenus tiers

La [LICENSE](LICENSE) MIT de ce dépôt couvre **le code**. Elle ne couvre pas les
données et les médias listés ici : ceux-ci restent sous la licence de leur
auteur, et leur réutilisation suit **cette** licence, pas la MIT.

Cette page n'est pas une politesse. Une licence Creative Commons portant la
mention « BY » fait de l'attribution une **condition** : sans auteur, titre,
lien et licence nommés, la réutilisation n'est pas autorisée, quelle que soit
l'intention. Tout média ajouté au dépôt doit donc arriver avec ces quatre
informations, ou ne pas y entrer.

---

## Modèles 3D

### `projects/Atlas/demos/cascade-aygalades-marseille/cascade.glb`

| | |
|---|---|
| Œuvre | **La Cascade** — relevé photogrammétrique de la cascade des Aygalades, Marseille |
| Auteur | **M.Dailly** ([sketchfab.com/m.dailly](https://sketchfab.com/m.dailly)) |
| Source | [sketchfab.com/3d-models/la-cascade-820f7441157546949d07e3ce52b2287a](https://sketchfab.com/3d-models/la-cascade-820f7441157546949d07e3ce52b2287a) |
| Licence | **CC BY 4.0** — [creativecommons.org/licenses/by/4.0/](https://creativecommons.org/licenses/by/4.0/) |
| Modifications | Matériau `KHR_materials_unlit` converti en PBR (`metallic 0`, `roughness 0.95`, double face) afin que le modèle reçoive l'éclairage et projette une ombre. Géométrie et texture inchangées. |

La même attribution est inscrite dans le fichier lui-même, en `asset.copyright` :
elle voyage donc avec le modèle, y compris si quelqu'un le récupère seul. Le
script de conversion est versionné à côté du modèle
(`_convertir-glb.mjs`), pour que la transformation soit vérifiable et rejouable.

### `projects/Atlas/demos/monument-glb-marseille/`

Ce manifeste référence le **DamagedHelmet** des [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets)
par son adresse ; aucun fichier n'est copié ici. Modèle de Theo Armour et
contributeurs, sous CC BY 4.0.

### `projects/Atlas/demos/vieille-charite-marseille/chapelle.glb`

> **Non publiable en l'état.** L'origine exacte de ce relevé n'a pas pu être
> retrouvée : le fichier ne porte pas de `asset.copyright`, et la recherche sur
> Sketchfab n'a pas identifié le modèle. Tout ce qu'on en sait est « Sketchfab,
> CC BY-NC », ce qui ne suffit ni à satisfaire le « BY » (auteur et lien
> manquants), ni à cohabiter avec un dépôt sous MIT (la clause NC interdit
> l'usage commercial, que la MIT accorde).
>
> Cette démo reste donc **hors du dépôt** tant que son origine n'est pas établie.
> La démo des Aygalades la remplace : même ville, même propos, licence propre.

---

## Données géographiques

Toutes les démos Atlas s'appuient sur **OpenStreetMap** :

> © les contributeurs OpenStreetMap — [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)

Les extractions passent par l'API Overpass ; les scripts qui les produisent sont
versionnés à côté des données (`build-from-overpass.mjs`), de sorte que chaque
GeoJSON du dépôt est retraçable jusqu'à sa requête.

Fonds de carte : [OpenFreeMap](https://openfreemap.org/) et
[OpenMapTiles](https://www.openmaptiles.org/), sur données OpenStreetMap.

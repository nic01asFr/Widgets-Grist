# Catalogue d'objets d'Atlas (`atlas-objets/0.1`)

Le catalogue qu'Atlas charge quand aucun autre n'est pointé (`?objets=`, ou le
module Modèles). Il est **réaliste** au sens du contrat : chaque objet reçoit le
modèle que ses champs désignent, dimensionné par ses mesures, et non un modèle
générique de la bibliothèque low-poly (`published/atlas/models/`), qui reste le
repli.

Il commence par l'**éclairage public** : les points lumineux décrits au
géostandard CNIG **EclExt** (champs `structure`, `support`, `hauteurFeu`).

| Type | Fiches EclExt reconnues | Fichiers |
|---|---|---|
| `mat_crosse` — mât avec crosse et lanterne | `support` ∈ MAT, POT (et `structure` ∈ LANT, VASQ, XX) | 6 classes de hauteur de feu : h4, h5, h6, h8, h10, h12 |
| `applique_facade` — applique de façade | `structure` = APP, ou `support` = MUR | 1 |
| `axial_suspendu` — luminaire suspendu | `support` = CAT | 1 |
| `projecteur_facade` — projecteur de mise en lumière | `structure` = PROJ | 1 |
| `encastre_sol` — encastré de sol | `structure` = EN, ou `support` = SOL | 1 |

La classe de hauteur se choisit par `hauteurFeu` (seuils 4,5 · 5,5 · 7 · 9 ·
11 m) ; un luminaire n'est jamais tiré en échelle. Chaque modèle porte son
émetteur (`KHR_lights_punctual`, nœud `emetteur_0`) ; Atlas en lit la position,
l'axe et l'ouverture, et calcule l'intensité depuis la fiche.

## Licence

Les **modèles et le catalogue** de ce dossier sont publiés sous la
[Licence Ouverte / Open Licence 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/)
(Etalab, SPDX `etalab-2.0`) — la licence de leurs sources, le LiDAR HD de l'IGN
et le géostandard CNIG EclExt. Producteur : nic01asFr. Réutilisation libre, y
compris commerciale, à condition de mentionner la source : « Atlas — catalogue
d'objets atlas.objets, nic01asFr », avec la date de mise à jour. La licence est
compatible avec CC BY 4.0 et ODC-BY.

Le **code** d'Atlas reste sous licence MIT (`LICENSE` à la racine du dépôt) :
la Licence Ouverte ne vaut que pour ce dossier.

## D'où il vient

Produit par le générateur pix2hdr (`experiments/eclairage/modeles_atlas`,
version 0.1.0) : règles de construction, et le déport de crosse mesuré au
LiDAR HD de l'IGN. Chaque fichier déclare ses sources et le statut de chaque
dimension (mesure ou règle) dans `catalog.json`. Copie conforme de la sortie
du générateur ; seuls l'identifiant (`atlas.objets`) et la licence changent.

Pour le mettre à jour : relancer le générateur (son README), recopier
`out/catalogue/` ici, remettre `catalog_id` à `atlas.objets` et la licence
(`spdx: etalab-2.0`, voir plus haut) sur chaque fichier, puis
`node --test tests/catalogue-integre.test.js` — il vérifie octets et md5 de
chaque fichier, l'usage public et la reconnaissance des fiches EclExt.

## Ce qui reste à faire

- Les dimensions autres que le déport de crosse sont des **règles**, pas des
  relevés ; aucune crosse n'a été mesurée au-dessus de 7,3 m.
- Pas encore de variantes (une par type), ni de niveaux de détail.
- Familles suivantes : mobilier urbain, végétation (le platane d'essai de
  pix2hdr suit le même contrat).

# Guide interactif — un récit dont le sujet est Atlas

Dix-huit étapes qui s'adressent au lecteur et l'invitent à agir. Le propos n'est pas
un territoire : c'est l'outil lui-même.

```
index_v7.html?scene=<url>/scene.json
```

## Ce qui le distingue de la démo des Aygalades

| | Aygalades | Guide |
|---|---|---|
| Sujet | un lieu, et l'outil en chemin | l'outil, le lieu est un prétexte |
| Données | OpenStreetMap, réelles | fabriquées pour la démonstration |
| Poids | 7,5 Mo | **93 Ko** |
| Dépendances | Overpass à l'extraction | aucune |
| Ton | descriptif | s'adresse au lecteur, l'invite à essayer |

Les deux ont leur place : la première prouve qu'Atlas tient sur de la donnée
réelle, la seconde apprend à s'en servir.

## Pourquoi des données fabriquées

1. **On montre ce qu'on veut montrer.** Une graduation a besoin de valeurs
   étalées sur toute sa plage ; un jeu réel a des trous et des extrêmes qui
   parasitent la leçon. Ils ont leur place dans une démo de territoire, pas dans
   une explication. Deux îlots portent tout de même une valeur vide — mais
   **délibérément**, pour montrer ce que devient une entité non classée.
2. **Rien ne dépend d'un tiers.** Overpass a répondu 504 en série sur trois
   miroirs pendant la construction des Aygalades. Un guide qui sert à apprendre
   l'outil ne peut pas dépendre de la charge d'un serveur public.
3. **93 Ko.** Il s'ouvre instantanément, y compris depuis une page de
   présentation où on le lance par curiosité.

## Le récit

Dix-huit étapes, cinq couches.

| Famille | Étapes | Ce qui est montré |
|---|---|---|
| **Comprendre** | Bienvenue · Trois géométries | ce qu'est une scène ; points, lignes, surfaces |
| **Symboliser** | Catégorie · Mesure · Ce qu'une surface peut être | catégorisé, gradué, le **non classé**, plat/volume |
| **Interroger** | Filtrer | contrôles exposés, manipulables pendant le récit |
| **Éclairer** | Le volume · Le soleil est daté · Neuf heures | extrusion, ombres, la même scène à deux heures |
| **Représenter** | Ce qu'un point peut être · Un modèle par catégorie · Des objets | cercle, étiquette, modèle ; **un modèle par attribut** |
| **Habiller** | Changer de fond · Le relief · Le décor complet | ortho IGN, terrain, ciel et bâti du fond |
| **Situer** | La Terre est ronde | projection globe |
| **Comprendre les limites** | Éditer — mais pas ici | ce qu'une scène publiée ne peut pas faire |
| **Conclure** | Et maintenant, la vôtre | ce que ça veut dire dans un document |

### Les couches

| Couche | Entités | Ce qu'elle démontre |
|---|---:|---|
| Îlots | 30 | surfaces : les trois symbologies, le volume, le filtre |
| Axes | 3 | lignes : catégorisation, drapage |
| Lieux | 4 | points en cercle 2D, avec étiquette |
| Plantation | 14 | **un modèle 3D par catégorie** — trois essences, trois modèles |
| Repères | 2 | modèle 3D unique |

### Un modèle par catégorie, et pourquoi ça compte

La plantation déclare la règle **une fois** :

```json
"model": {
  "field": "essence",
  "categories": [
    { "value": "Feuillu",  "modelId": "tree_deciduous" },
    { "value": "Conifère", "modelId": "tree_conifer" },
    { "value": "Palmier",  "modelId": "tree_palm" }
  ]
}
```

La démo des Aygalades obtient le même résultat autrement : elle pose `_modelId`
sur chacun de ses 374 objets. Les deux marchent, mais changer le modèle d'une
essence tient ici en une ligne, là en une réextraction complète.

> Ce support n'existait pas : Atlas savait choisir un modèle d'après un attribut,
> mais `scene-loader` ne lisait pas `style.model`. Une scène ne pouvait le
> demander qu'en recopiant `_modelId` partout. Ajouté avec `style.label`, qui
> souffrait du même manque.

## Ce qui rend les gestes possibles

Pendant qu'un récit joue, restent **actifs** : les pastilles de filtre, la
légende cliquable, la navigation (glisser, zoomer, pivoter) et le clic sur un
objet. Est **masqué** : le rail d'auteur — un récit s'exécute en mode lecture.

> Ce guide s'adresse donc à qui **regarde** une scène, pas à qui la fabrique.
> Symboliser, importer, réordonner sont des gestes d'auteur : ils ne peuvent pas
> être enseignés par un récit, et il ne faut pas le promettre.

La disponibilité des pastilles pendant le récit tenait jusqu'ici à un **accident
de spécificité CSS** — une règle les masquait, une autre les montrait, la
seconde l'emportait d'un cheveu. C'est désormais écrit explicitement dans
`index_v7.html` : le dock d'environnement disparaît (l'étape pilote soleil, vue
et fond), les pastilles de données restent.

## Reconstruire

```bash
node build-guide.mjs      # -> les 5 GeoJSON + scene.json
```

Valider :

```bash
node ../../../../scripts/valider-schema.js \
     ../../../../published/schemas/scene-manifest-0.2.2.schema.json scene.json
```

## Décisions de réglage, prises à l'écran

- **Îlots `inline`, pas par URL.** Servie par adresse, la couche afficherait
  « Écoles — » au lieu de « Écoles 8 » : Atlas ne détient pas les entités, donc
  ne les compte pas. Une étape qui invite à cliquer une classe ne peut pas
  laisser son effectif dans le flou.
- **Carrés de ~75 m.** À 0,0022° la grille faisait 1,1 km et on n'en voyait que
  cinq à l'écran.
- **L'étape des repères à plat.** Des repères de 17 m entre des blocs de 6 à
  50 m, vus en oblique, sont masqués — trois cadrages successifs n'y ont rien
  changé. Une étape isole une notion : celle-ci parle d'objets ponctuels, le
  volume a eu les siennes.
- **La Terre est ronde à z2,5.** À z9, MapLibre rend déjà à plat : l'étape
  annonçait une rondeur invisible. La bascule visuelle se joue vers z5-6 — à ne
  pas confondre avec `GLOBE_MERCATOR_ZOOM` (12), seuil interne des modèles 3D.
- **Les essences à z18,2.** Plus loin, les trois formes d'arbres se confondent
  et la catégorisation ne se démontre plus.
- **Le relief avec les surfaces à plat.** Une couche extrudée s'y poserait sur
  le point culminant de chaque entité, plus une marge : sur un relief marqué,
  les volumes flottent. Drapées, les surfaces épousent le sol par construction.
- **Opacité 1 partout.** Sous 1, MapLibre perd l'écriture de profondeur et les
  volumes cessent de s'occulter.

## Ce que le guide ne couvre pas

- Le **filtre temporel** (`type: 'time'`) : implémenté dans Atlas, jamais
  démontré ni éprouvé. Il faudrait un attribut daté — les îlots en portent un
  (`livraison`), il ne reste qu'à écrire l'étape.
- Les **tuiles XYZ** en fond de carte, autres que les fonds intégrés.
- Le **repli en points** (`pointFallbackZoom`), qui n'a jamais été vu à l'œuvre :
  il demande une couche surfacique d'au moins 300 entités, le guide en a 30.
- L'**ordre des couches** au glisser-déposer, et l'**export** — gestes d'auteur,
  hors de portée d'un récit.

> Et surtout : **tout le mode édition**. Un récit s'exécute en lecture ; ce guide
> apprend à lire une scène, pas à en fabriquer une. C'est une limite du format,
> pas un oubli — mais elle laisse la moitié d'Atlas sans guide.

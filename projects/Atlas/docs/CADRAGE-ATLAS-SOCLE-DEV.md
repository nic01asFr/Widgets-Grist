# Cadrage — Atlas comme socle de développement

## 1. Point de départ mesuré

| Couche | Volume | Couplage | État |
|---|---|---|---|
| Modèle (styles, contrôles, géométrie, règles) | ~1 500 l. / 6 modules / **57 fonctions publiques** | ni DOM, ni MapLibre, ni Grist | **déjà réutilisable**, 140 tests |
| Adaptateurs Grist | ~1 000 l. / 6 modules | Grist | isolé, mais seul adaptateur possible |
| Moteur de carte + interface | `app_v7.js` 4 975 l. + `index_v7.html` 1 088 l. | 154 réf. DOM, 138 réf. MapLibre, 60 réf. Grist | **monolithe** |

Le cœur métier est donc **déjà** un socle : `applyDeclarativeToLayer`,
`buildControlPredicate`, `pointFallbackZoom`, `isModelLayer`… tournent en Node,
sans navigateur ni Grist. Ce qui manque n'est pas le modèle : c'est tout ce qui
est coincé entre le modèle et le DOM.

Symptôme concret : `layerPaintColor` et `applyMapLayerVisibility` — deux
correctifs livrés le 03/08 — **n'ont pas pu être couverts par un test**, parce
qu'ils vivent dans `app_v7.js` qui n'exporte rien. La dette de structure a un
coût déjà payé.

## 2. Les quatre usages à servir

| Cas | Besoin du développeur | Aujourd'hui |
|---|---|---|
| **A** | Utiliser le widget tel quel dans Grist | possible (URL + document) |
| **B** | Une carte Atlas dans **sa propre** application web | impossible |
| **C** | Réutiliser le **modèle** (styles, filtres) sans carte | **possible dès maintenant** |
| **D** | **Étendre** (type de style, contrôle, source) | non spécifié |

Le cas C est déjà servi et personne ne le sait. Le cas B est celui que vise
« bâtir des solutions carto web avec Atlas ». Le cas D conditionne la durabilité.

## 3. Architecture cible — quatre couches

```
atlas-model     styles, contrôles, géométrie, règles métier
                (aucune dépendance — Node & navigateur)
      |
atlas-engine    monte et pilote les couches MapLibre depuis le modèle :
                style, filtres, visibilité, ordre, repli en points, récit
                (dépend de MapLibre ; ni DOM ni source)
      |
atlas-sources   adaptateurs : Grist (existant), GeoJSON, REST…
                contrat commun : fournir couches + champs, lire/écrire les prefs
      |
atlas-ui        panneaux Couches / Inspecteur / Contrôles / Récit / Légende
```

L'**application** (le widget actuel) devient l'assemblage des quatre. Une
solution web n'en prend que ce dont elle a besoin — typiquement `model` +
`engine` + sa propre interface.

**`atlas-engine` est la pièce qui débloque tout.** C'est elle qui permettrait
d'écrire, dans n'importe quelle page :

```js
const atlas = new AtlasEngine(map);
await atlas.setScene(manifest, { source: geojsonSource });
atlas.setLayerVisibility('batiments', false);
atlas.playStory(story);
```

## 4. Chemin proposé — par valeur décroissante rapportée au coût

### Étape 1 — Nommer et documenter le noyau existant · coût quasi nul

Aucun refactor : le code est déjà découplé et testé. Il s'agit de lui donner un
point d'entrée (`lib/index.js`), une version, et une page d'API listant les 57
fonctions par domaine. Sert immédiatement le cas C, et donne une référence
stable aux autres projets de l'offre.

### Étape 2 — Extraire `atlas-engine` · le vrai chantier

Sortir de `app_v7.js` les ~138 fonctions qui parlent à MapLibre, en coupant leur
lien au DOM. Bénéfices en cascade : le cas B devient possible, les fonctions de
rendu deviennent testables (fin de la dette du §1), et le chantier « ordre des
couches » déjà cadré s'y insère naturellement — `applyLayerOrder` appartient à
l'engine, pas à l'interface.

À faire par tranches, en gardant le widget fonctionnel à chaque étape : rendu de
couche, puis filtres, puis récit.

### Étape 3 — Abstraire la source

Définir le contrat `DataSource` (lister les couches, lire les entités et les
champs, lire/écrire les préférences), et faire de l'implémentation Grist actuelle
la première d'une famille. Les modules `grist-*` bougent peu : ils deviennent
`sources/grist/`.

### Étape 4 — Composants d'interface

Le plus long et le moins urgent. À n'engager qu'une fois l'engine stable, et en
tranchant d'abord l'articulation avec la bibliothèque commune de composants cartographiques (cf. §6) : autant
ne pas produire deux familles de composants carto.

## 5. Points d'extension à spécifier (cas D)

- **Style** : ajouter un `kind` au StyleDeclarative (aujourd'hui `single`,
  `categorized`, `graduated` ; la spec prévoit `rule_based`, `3d_model`,
  `extrusion`).
- **Contrôle** : ajouter un type au ControlDeclarative (`range`, `select`,
  `time`).
- **Source** : implémenter `DataSource`.
- **Rendu** : ajouter un type de couche (au-delà de fill / line / circle /
  fill-extrusion / symbol).

Chaque point d'extension doit être **documenté et testé**, sinon les projets
contourneront le modèle au lieu de l'étendre — c'est ainsi que naissent les
lignées divergentes.

## 6. Ce qui reste à trancher

**Articulation avec la bibliothèque commune de composants cartographiques** (projet Passerelle) : la répartition
naturelle est *Atlas apporte le modèle applicatif, les Web Components apportent
l'embarquabilité*. À confirmer avec Passerelle **avant l'étape 4**, sinon deux
familles de composants coexisteront.

**Distribution** : paquet npm privé, sous-dossier du monorepo, ou copie
versionnée ? Aujourd'hui la promotion se fait par script de copie — insuffisant
dès qu'un projet tiers en dépend.

**Nom** : « runtime » décrit mal un outil dont l'essentiel du code sert à
composer une scène. « Socle applicatif carto » couvre mieux modèle + moteur +
composants.

## 7. Ce qu'on peut annoncer honnêtement, aujourd'hui

- Le **modèle** est réutilisable maintenant (étape 1 : le rendre visible).
- Le **moteur** ne l'est pas encore (étape 2).
- Les **composants d'interface** ne le sont pas du tout (étape 4).

Annoncer « Atlas est le socle » avant l'étape 2 promettrait ce qui n'est pas
livrable. Annoncer « le modèle Atlas fait référence, le socle se construit »
serait exact.

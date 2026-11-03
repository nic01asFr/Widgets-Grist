# Atlas — la seconde origine de données

> **État : cadré, non commencé.** Écrit le 23/08/2026 avec `Interop-Carto`
> (qgis-sspcloud, BigQgisMCP). L'arbitrage de priorité appartient à nic01asFr.
>
> Cadrage amont : `qgis-sspcloud/docs/cadrage-composant-atlas.md` et
> `docs/interop-atlas-scene-manifest.md`.

---

## Le problème

`lib/scene-loader.js:102` ne résout **qu'une seule origine** :

```js
const tableName = ml.source?.table || ml.id;
... docApi.fetchTable(tableName) ... catch -> console.warn -> continue
```

Quand une couche vient d'ailleurs, `source.table` est `undefined`, on retombe sur
`ml.id` **comme nom de table**, `fetchTable` échoue, et la couche est passée en
silence. Un manifest parfaitement valide rend alors une carte **incomplète sans
le dire** — rien ne distingue une couche qui a échoué d'une couche qu'on aurait
choisi de ne pas mettre.

C'est le cas **nominal** pour les scènes de qgis-sspcloud, pas un cas limite :
leur `source` racine est une provenance de projet, leurs couches n'ont pas de
`source.table`.

---

## Ce qui est plus petit que prévu

**MapLibre accepte déjà une URL.** `app_v7.js:1386` :

```js
map.addSource(layer.id, { type: 'geojson', data: data || {…} });
```

`data` accepte un objet GeoJSON **ou une URL string**. Les deux premiers paliers
de la cascade amont ne demandent donc aucun code de chargement — seulement de
laisser passer la valeur au lieu de la construire depuis Grist.

Pour les tuiles, le pattern existe aussi (`app_v7.js:1259`, source `raster-dem`
avec `tiles`) : il manque le protocole `pmtiles` et sa bibliothèque, pas le
chemin.

### La cascade que le producteur amont applique

| Taille | Ce que porte la couche |
|---|---|
| < 500 Ko | `geojson` : dict inline |
| 500 Ko – ~5 Mo | `geojson` : **une URL** (gzip, servie par le hub) |
| > 5 Mo | `source_type: "pmtiles"` + `tiles_url` + `bbox` + `min_zoom`/`max_zoom` |

19 Mo de BD TOPO deviennent ~2 Mo en PMTiles, streamés par *Range Requests*.
C'est **moins de travail qu'un chargeur GeoJSON**, et un meilleur résultat sur
les couches lourdes — celles-là mêmes que `DEFER_FEATURE_THRESHOLD` protège mal.

---

## Ce qui est plus gros que prévu

**Atlas ne suppose pas seulement pouvoir charger les données : il suppose les
détenir.** `layer.geojson` apparaît **26 fois** dans `app_v7.js`, et pas dans des
recoins :

| Appel | Ce qui tombe sans les features |
|---|---|
| `boundsFromGeoJSON(layer.geojson)` | le cadrage initial de la scène |
| `pointFallbackZoom(layer.geojson)` | le repli en points des polygones menus |
| `resolveFeatureProps(layer.geojson)` | la résolution des propriétés |
| `applyTerrainBase(layer.geojson)` | le calage sur le relief |

S'ajoutent le filtrage par contrôles (`buildControlPredicate`, appelé en 1647 et
2022) et les comptes de la légende, qui travaillent sur des features locales.

**Le rendu marchera ; ce sont les fonctions qui comptent, cadrent et dérivent qui
tomberont** — et silencieusement : une scène qui s'affiche mais ne se cadre pas.

Le chantier n'est donc pas « ajouter une origine » mais **rendre Atlas capable de
fonctionner sans détenir les features**. C'est ce qui sépare un widget d'un
runtime.

---

## La sortie : ce qu'on ne peut pas calculer, le contrat le déclare

Le producteur amont écrit déjà `bbox`, `n_features`, `min_zoom`/`max_zoom`,
`geojson_size_bytes`. **Ce qu'Atlas dérivait des features, le manifest le
déclare.** C'est l'esprit du contrat mené à son terme.

**Demande formulée à l'amont le 23/08** : `bbox` **systématique et obligatoire**
sur toute couche non-inline. Sans elle, une couche par URL ou par tuiles ne peut
pas être cadrée et la scène s'ouvre sur l'océan. Et `n_features` quand il est
connu : il permet de décider de reporter une couche **avant** de la demander, ce
que `DEFER_FEATURE_THRESHOLD` ne sait faire qu'après.

---

## Classe d'origine : externe ou atelier

L'amont distingue désormais (qgis-sspcloud@b5566b5) :

| Classe | Origines | Ce qu'Atlas peut en faire |
|---|---|---|
| `externe` | `wms` · `wmts` · `xyz` · `wfs` | **lire directement** — rien n'est copié |
| `atelier` | base, fichier local | **rien** — doit être matérialisé avant publication |

Ce n'est pas une précaution mais une nécessité physique : le serveur PostgreSQL de l'organisation
est un service **ClusterIP sans IP externe**. QGIS s'y connecte parce qu'il tourne
dans le cluster ; un navigateur ne le peut pas, même avec des identifiants.

**Bénéfice pour le diagnostic** : une couche `externe` qu'Atlas ne sait pas lire
est une limite d'Atlas ; une couche `atelier` qui arrive jusqu'à lui est un bug
amont. Mieux qu'un échec indistinct.

> **Chausse-trape** : QGIS range les tuiles **XYZ sous le fournisseur `wms`** ;
> seul `type=xyz` dans la datasource les distingue. Sans cette lecture, un fond
> OSM serait annoncé comme un service WMS.

---

## La forme d'intégration retenue

Les blocs riches de l'éditeur amont sont **déjà des iframes vers le rendu du
hub**, pas des composants React — « pas de duplication code MapLibre côté React »
est assumé dans leur code. **Il n'y a donc rien à porter en React ni à publier en
npm.**

```html
<iframe src="…/w/atlas/?scene=<url>&readonly=1&vitrine=1">
```

`readonly` et `vitrine` **existent déjà** (vérifié : Atlas lit `access`, `mode`,
`readonly`, `vitrine`). **Seul `scene` est à ajouter.** Côté amont, deux points de
bascule : `rendering.runtime: "atlas"` et un gabarit Jinja — l'éditeur, la page
publiée et le widget Grist en bénéficient sans changer une ligne.

---

## Ordre proposé

1. **Rendre l'échec visible.** Séparable du reste, sans toucher au format, et
   garde sa valeur ensuite — le cas « URL injoignable hors ligne » ne disparaîtra
   jamais. Une couche qui ne se résout pas doit le dire : nom, origine attendue,
   raison.
2. **Laisser passer une URL** dans `data`, et lire `bbox` du manifest plutôt que
   de la calculer.
3. **Découpler les fonctions dérivées** des features locales, une par une.
4. **PMTiles** : protocole et bibliothèque.
5. **Le paramètre `scene`** et l'habillage de publication (chantier 2).

---

## Engagements réciproques

- Le **JSON Schema 0.2.2 servi depuis Widgets-Grist fait référence** (arbitrage
  du 23/08) : il ne bouge pas sans annonce sur le canal, et les ajouts se font en
  **extension compatible, jamais en redéfinition**.
- L'amont garde une **copie** du schéma pour valider hors ligne, documentée comme
  copie. `schemas/index.json` porte désormais une **empreinte sha256** par
  contrat : une copie peut se vérifier sans rapatrier le schéma.
- Une scène refusée par le schéma se transmet **telle quelle** : c'est soit un
  bug amont, soit une lacune du schéma, et personne ne peut trancher sans la voir.

# Projet : qgis2grist

Widget Grist d'import de projets QGIS (qgis2web HTML/ZIP, .qgz/.qgs, GeoPackage,
paquets QField). Crée le schéma de tables Grist et y peuple les données ; rend
ensuite une carte Leaflet live-synchro.

## Contexte

L'objectif n'est pas d'afficher une carte par-dessus QGIS — c'est de **rendre
les données QGIS exploitables nativement dans Grist** : colonnes typées, choix,
relations, libellés humains. La carte est un sous-produit pour visualiser le
résultat.

## Architecture

Fichiers widget :

| Fichier | Rôle |
|---------|------|
| `index.html` | **v1.1 stable** — Leaflet ; publié dans `published/qgis2grist/` |
| `index_v2.html` | **v2 dev** — MapLibre + Scene Manifest |
| `lib/qml-to-declarative.js` | QML → StyleDeclarative (F1) |
| `lib/scene-manifest.js` | Build Scene Manifest V0.2 (F2) |
| `lib/maplibre-bridge.js` | Runtime carto MapLibre (D3) |
| `lib/provenance.js` | Source Strate lite + provenance import (D8) |
| `tests/qml-to-declarative.test.js` | Tests unitaires |
| `tests/provenance.test.js` | Tests provenance D8 |

Spec binding v2 : `docs/BINDING-QGIS-GRIST-CEREMA-v2.md`.
**Gate v2** : `docs/CADRAGE-v2.md` — D1–D10 actés (2026-07-26) ; Phases 1–2 autorisées.

### Machine d'états

```
drop → reading → preview → importing → map ↔ original
                                             ↓
                                          error
```

État courant dans `currentState`. Transitions via `setState(name)`.

### Pipeline de parsing

| Format | Entry point | Sortie commune |
|---|---|---|
| qgis2web HTML | `parseQgis2webHtml(html)` | `[layer, ...]` |
| qgis2web ZIP | `parseQgis2webZip(zip)` | idem |
| QGZ | `parseQgzFile(ab, parentZip, name)` | idem (delègue à `parseQgsXml`) |
| GeoPackage standalone | `parseGpkgFile(ab)` | idem |
| GeoJSON dans ZIP | `parseGeojsonFiles(zip, names)` | idem |

`layer` = `{name, displayName, geomType, fields, features, featureCount, hasData,
datasource, style, _layerId?}`.

`fields[]` = `{name, _rawKey, label, qType, gType, widgetOptions?, description?,
_valueMap?, _refTargetTable?, _refTargetField?, _externalResource?}`.

### Pipeline d'import Grist

`startImport()` :
1. Tri topologique `topoSortByRefs` — parents avant enfants pour les Refs.
2. Pour chaque couche, dans l'ordre :
   - `listTables()` → générer un nom unique.
   - `AddTable` avec `label`, `widgetOptions`, `description`.
   - Boucle `BulkAddRecord` par lots (100 si Polygon/Line, 500 si Point).
   - Capture des nouveaux rowIds via `result.retValues[0]`.
   - Si la couche est référencée par d'autres : indexer `valeur → rowId`
     dans `parentMaps[tableName][refField]`.
3. Lors de l'insertion d'une couche enfant, transformer chaque FK en rowId
   via `parentMaps`.

### Métadonnées de colonne (passes 1b + 2)

| Source QGIS | → Grist |
|---|---|
| `<aliases><alias>` | `label` |
| `<editWidget type="ValueMap">` | `Choice` + `widgetOptions.choices` + `_valueMap` (transform à l'import) |
| `<editWidget type="Range">` | `Numeric` (ou `Int` si Step entier sans Precision) |
| `<editWidget type="CheckBox">` | `Bool` |
| `<editWidget type="DateTime">` | `Date` ou `DateTime` selon `field_format` |
| `<editWidget type="ValueRelation">` | `Ref:` ou `RefList:` (passe 3) |
| `<editWidget type="ExternalResource">` | marqueur `_externalResource` ; la colonne reste `Text` (chemin de la photo), le formulaire ne promet un champ fichier que sur une vraie colonne `Attachments` |
| `<relations><relation>` | `Ref:<TargetTable>` sur le champ référençant |
| GPKG `gpkg_data_columns.title/description` | `label`/`description` |
| GPKG `gpkg_data_column_constraints type='enum'` | `Choice` |
| GPKG `qgis_projects.xml` | `.qgs` complet → aliases + editWidgets si pas déjà lus |

### Persistance

Une table `QgisWidgets` (auto-créée) stocke un JSON de config par import. Permet
restauration au prochain chargement du widget. Schéma : `widget_name`,
`source_file`, `config_json`, `created_at`. Le `config_json` contient meta
BigQgisMCP, fields enrichis, refs, styles.

Pas de `setOption()` ici : on veut que la config survive à un duplicata du
document (la table fait partie du document, l'option non).

## Conventions spécifiques

### Géométrie

- Point : colonnes `latitude`, `longitude` (Numeric).
- Line / Polygon : colonnes `geometry_json` (Text, JSON GeoJSON arrondi à 5
  décimales ≈ 1 m), `centroid_lat`, `centroid_lon`.
- Pas de `Ref:Geometry` Grist — la géométrie est sérialisée.

**Collision de noms** : si la source porte déjà un champ `latitude` /
`geometry_json` / `fill_color`, Grist suffixe la colonne que nous ajoutons
(`latitude2`). Les données partent au bon endroit (`colIdByFieldName` est
capturé depuis `AddTable`), mais un consommateur qui applique la convention
lirait la colonne source homonyme — souvent vide ou à 0. L'import mémorise donc
les colIds effectifs dans `layer._geometryCols`, et le manifest les publie dans
`source.geometry_fields` (émis seulement en cas d'écart). Atlas lit ce champ en
priorité ; à défaut il retombe sur la convention puis sur les variantes
numérotées. Extension additive à V0.2.1, à valider côté
`cerema-offre-de-service`.

### LOD zoom (`lib/scene-lod.js`)

Aucune contrainte de zoom en **Profil A** : la couche tient en mémoire, la
brider ne ferait que la rendre invisible. À partir du Profil B, `minZoom` suit
la géométrie (Point 8 / Line 9 / Polygon 10) et une grille voit son plancher
relevé à `GRID_MIN_ZOOM` (11). Jamais de `maxZoom` : une maille 200 m est
illisible en petite échelle, pas en grande — l'inverse ferait disparaître la
couche quand on zoome dessus.

### Couleur par feature

Colonne auto `fill_color` (Text) calculée à l'import via le QML / les fonctions
qgis2web. Permet à n'importe quelle vue Grist de récupérer la couleur sans
re-parser le style. **Inconvénient** : si l'utilisateur édite la valeur de
classification, `fill_color` n'est pas recalculé. À documenter pour l'utilisateur.

### `_rawKey` vs `label` vs `name`

- `_rawKey` = clé brute dans les properties GeoJSON (ex: `ht_max`).
- `label` = libellé humain affiché (alias QGIS / `gpkg_data_columns.title` /
  ou `_rawKey` à défaut).
- `name` = id Grist sanitisé (ex: `ht_max`, ou `Hauteur_d_eau` si caractères
  spéciaux).

`flattenGeoJsonFeatures` cherche `props[_rawKey]` en priorité.
`makeMarkerColorFn` (style) cherche dans cet ordre : `_rawKey`, `label`, `name`.

## État actuel

### v1.1 (`index.html`) — stable

Fait :
- Parsers qgis2web HTML/ZIP, QGZ/QGS, GPKG (avec sql.js + WKB pur JS), GeoJSON.
- Reprojection EPSG:3857 native, autres CRS via proj4js on-demand.
- QML (categorized/graduated/single) extraction couleurs.
- BigQgisMCP : titre, slider, palettes flood/building, légende dynamique.
- Import : labels, widgetOptions Choice, relations Ref:, FK → rowId, GPKG
  metadata.
- Carte Leaflet live-synchro (polling Grist 5 s) + bandeau restauration.

À faire / limites connues :
- **ExternalResource → Attachments** : marqueur posé (`_externalResource`), mais
  la colonne reste **du texte** — elle porte le chemin de la photo sur
  l'appareil. Le FormDef déclare donc le type réel de la colonne (18/09/2026) :
  un champ fichier n'est promis que sur une vraie colonne `Attachments`. Sans
  cette garde, enregistrer la fiche écrivait `"[1]"` dans la colonne, après
  avoir effacé le chemin.
  **Reste à arbitrer** : que faire des photos d'un paquet QField — créer la
  colonne en `Attachments` et verser les fichiers du paquet (le chemin est alors
  perdu), ou garder deux colonnes, le chemin et les pièces jointes.
- **QGIS 2.x** : `<edittypes>` legacy détectés mais leur format `widgetv2config`
  (avec `<value key= value=>`) n'est pas parsé — ValueMap dégradé en Text.
- **Polling 5 s sans backoff** : sur grosse table c'est coûteux. Pas de pause
  quand l'onglet est en arrière-plan.
- **`adaptHtmlForGrist` / `renderAsWidget` / storage local** : supprimés en v2 Phase 1 (`index_v2.html`).

### v2 (`index_v2.html`) — Phases 2–3 ✅

- **MapLibre GL JS**, Scene Manifest, config v3
- **Provenance D8** : `meta.sources[]`, `meta.provenance`, `source_info` (config + manifest)
- Restauration provenance depuis config ou table `SceneManifest`

Phases suivantes : import `.grist` (Phase 4), tests manuels §8.

## Points d'attention

### `BulkAddRecord` retVal capture

`result.retValues[0]` contient le tableau des nouveaux rowIds. Cette capture
est essentielle pour les Refs ; sans elle on ne peut pas indexer les parents.

### Tri topologique

Cycles ignorés via `visiting`/`visited`. Si A référence B et B référence A,
les deux sont émis dans l'ordre de découverte ; les Refs cycliques ne seront
pas résolues correctement (acceptable, c'est un cas exotique en QGIS).

### Réimport du même fichier

`startImport` génère un nom unique en suffixant (`Batiments_1`, `_2`…) : quatre
imports du même GPKG produisent quatre jeux de tables et quatre lignes
`SceneManifest`, sans que rien n'indique lequel fait foi. La prévisualisation
signale donc les tables homonymes déjà présentes (`renderReimportHint`) et offre
une case « Remplacer les tables existantes » — décochée par défaut, car un
remplacement détruit aussi les vues et les préférences de style (`Atlas_LayerPrefs`)
attachées à ces tables.

### Renommage de table en cas de collision

`tableNameRemap[layer.name] = tableName` enregistre la correspondance avant
`AddTable`. `resolveRefType` traduit ensuite `Ref:OldName` → `Ref:NewName` à
la création des colonnes Refs des enfants.

### `_valueMap` et le label Grist

Les valeurs catégorisées QGIS sont transformées en LABELS Choice à l'import.
Si l'utilisateur ajoute une nouvelle valeur dans Grist qui n'existe pas dans
`_valueMap`, elle sera stockée telle quelle. C'est OK : Grist accepte les
valeurs hors-`choices` (elles sont marquées invalides en UI mais persistées).

## Patterns réutilisables

- `parseOptionTree(el)` : parser récursif de `<Option type="Map|List|...">`,
  format de sérialisation `QgsXmlUtils::writeVariant`. Réutilisable pour
  d'autres outils QGIS web.
- `WkbReader` : parser WKB/EWKB/ISO Z·M·ZM pur JS, ~50 lignes.
- `topoSortByRefs(layers)` : tri topologique générique sur graphes de Refs.

## Documentation binding (v2)

- Spec : `docs/BINDING-QGIS-GRIST-CEREMA-v2.md`
- **Cadrage (gate)** : `docs/CADRAGE-v2.md` — D1–D10 actés ; Phases 1–2 autorisées
- v1 : `index.html` (Leaflet) · v2 : `index_v2.html` (MapLibre — Phase 2)

## Publication

```bash
npm run promote:qgis2grist   # → published/qgis2grist/v2/ + package.json dual
npm run manifest
```

| Widget ID | URL | Contenu |
|-----------|-----|---------|
| `qgis2grist` | `…/qgis2grist/` | **v1** Leaflet (stable) |
| `qgis2grist-v2` | `…/qgis2grist/v2/` | **v2** MapLibre + Scene Manifest + terrain |

`terrain.html` + deps `grist_forms` vendorisées sous `v2/vendor/grist_forms/`.

## Tests manuels

Fixtures : `tests/fixtures/web/qfield_bees.zip`, flood HTML.
Automatisés (échantillon) : `node --test projects/qgis2grist/tests/`

Vérifier dans Grist :
- Labels humains présents sur les colonnes.
- `Choice` avec choix valides pour ValueMap.
- `Ref:Parent` cliquable sur les FK (le widget Grist doit afficher la ligne parent).
- Restauration après reload du widget.
- **v2** : table `SceneManifest`, toast Atlas-ready, pack terrain.

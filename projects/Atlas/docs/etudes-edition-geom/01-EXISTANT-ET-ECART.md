# Édition et création de géométries — l'existant et l'écart

*Étude du 24/09/2026 · branche `atlas-formulaire-entite` · lecture de code seule, aucune modification.*

Références : `app_v7.js` = `projects/Atlas/app_v7.js` ; `lib/…` = `projects/Atlas/lib/…`.
Les numéros de ligne valent pour l'arbre de travail du 24/09/2026 (non commité, et
**modifié par une autre session pendant l'étude** : 10 552 lignes à la fin, les
repères au-delà de la ligne ~9 660 ont glissé de 3 lignes et ont été relevés à
nouveau). « Lu » = constaté par lecture du code ; « éprouvé » = exécuté ;
« non vérifié » = ni l'un ni l'autre.

Tests lancés pour cette étude (`node --test` sur scene-loader, model-layer,
controles-types, prefs-couche-cle, geometry-fields, trajet, fiche-formulaire,
data-client, grist-adapter, access-rights, view-mode) : **327 réussis, 0 échec**.
Aucun scénario n'a été éprouvé en Grist réel.

---

## 0. Le verdict précédent, point par point

| Affirmation | Verdict | Preuve |
|---|---|---|
| Atlas sait importer, entabler, saisir des attributs | **Confirmé** | import OSM `runOSM` `app_v7.js:7138`, fichier `processFile` `app_v7.js:7358`, table liée `linkTableFromGrist` `app_v7.js:7384` ; `entableLayer` `app_v7.js:7253` ; saisie par le moteur `monterFormulaireEntite` `app_v7.js:6438` et par le repli `renderAttrFields` `app_v7.js:6335` |
| … ne sait pas créer une couche vide | **Confirmé**, et c'est **refusé explicitement** à quatre endroits | `entableLayer` lève `'couche vide'` `app_v7.js:7255` ; `linkTableFromGrist` refuse une table sans entité `app_v7.js:7396` ; `peutPasserEnTable` exige `n > 0` `lib/grist-sync.js:163-164` ; le chargeur de manifeste saute une table vide `lib/scene-loader.js:575` |
| … ne sait ni dessiner ni modifier une géométrie | **Confirmé** | aucune bibliothèque de dessin chargée (`index_v7.html:10-45`) ; aucune fonction n'affecte `feature.geometry` ; le seul « déplacement » d'objet est le décalage 3D `_offsetX/_offsetY` en mètres, par curseurs (`app_v7.js:6637-6649`, `setFeatureOverride` `app_v7.js:7102`), qui ne touche pas la géométrie |
| L'écriture `geometry_json` / lat-lon via `saveFeatureToSource` existe déjà | **Partiellement vrai** | elle existe (`lib/grist-sync.js:273-353`), mais : n'est atteinte que pour `source === 'qgis2grist'` (`app_v7.js:10211`) ; ignore `layer.geometryColumn` et `geometry_fields` ; ne sait pas écrire un point dans `geometry_json` ; ne met pas à jour `centroid_lat/lon` ; réécrit en 2D. Détail §1.4 |
| Il manque l'UI et la création d'entité | **Confirmé, et il manque davantage** | aucun `AddRecord` sur la table d'une couche hors `entableLayer` (le seul `AddRecord` de la fiche vise une table **liée** : `lib/fiche-formulaire.js:887`) ; il manque aussi une écriture de géométrie correcte pour les couches entablées ou liées (§4.3), un réindexage après relecture (P3), et la levée de `_syncPaused` (P4) |
| P0 : unifier `applySelected` sur `coucheAvecLignes` | **Confirmé**, bug démontré §4 — mais **insuffisant seul** : brancher `saveFeaturesToSource` tel quel sur une couche entablée ferait échouer l'écriture des points et des colonnes 3D, et basculerait la session en lecture (§4.3) |

---

## 1. Le chemin d'écriture d'une entité vers Grist

### 1.1 Identité ligne ↔ entité

- **`_row_id`** = `id` Grist, posé à la lecture : `rowToFeature` `lib/grist-rows.js:122` (couches de manifeste), `tableToGeoJSON` `lib/geo-tables.js:71` (couches liées ou entablées, qui posent aussi `feature.id`, `lib/geo-tables.js:91`). C'est la seule clé d'écriture (`featureToRowUpdate` `lib/grist-sync.js:275-276`, `pontFormulaire` `lib/fiche-formulaire.js:901`).
- **`_idx`** = rang de l'entité dans `layer.geojson.features`, posé par `indexFeatures` `app_v7.js:2408-2413`. La sélection est un **tableau d'indices** (`STATE.selection.features`) ; le clic lit `f.properties._idx ?? 0` `app_v7.js:6709` ; `Models3D` saute toute entité sans `_idx` `app_v7.js:1539-1540`.
- `indexFeatures` n'est appelée que par `addLayerToMap` `app_v7.js:2479`, `entableLayer` `app_v7.js:7289` et `reloadGenericTableLayer` `app_v7.js:7376`. **Pas** par `refreshLayerFromTable` (`lib/grist-sync.js:356-390`) ni par le polling (`app_v7.js:8421-8436`) — piège P3.
- `mergeFeatureOverrides` recopie par `_row_id` toutes les propriétés `_*` de l'ancienne entité, **`_idx` compris** (`lib/grist-sync.js:249` n'exclut que `_row_id`, `_fill_color`, `_l_*`).
- Le trajet mémorise `sourceRowId: feature.properties.id ?? feature.id` `app_v7.js:3443` : `properties.id` n'existe jamais (colonne `id` sautée, `COLONNES_INTERNES_GRIST` `lib/grist-rows.js:79`), et `feature.id` n'existe que sur les couches lues par `tableToGeoJSON`. Sur une couche qgis2grist, `sourceRowId` vaut donc `null` (lu).

### 1.2 Formats de géométrie

| Format | Lecture | Écriture |
|---|---|---|
| `geometry_json` (GeoJSON texte) | `rowToFeature`, prioritaire `lib/grist-rows.js:89-98` ; `parseGeometryValue` `lib/geo-tables.js:46-52` (accepte aussi un `Feature`) | `featureToRowUpdate` pour ligne/surface `lib/grist-sync.js:308-311` ; `entableLayer` pour **tous** les types, points compris `app_v7.js:7267, 7279` |
| `latitude`/`longitude` (+ alias `lat`, `lon`, `lng`, `centroid_*`, suffixés `latitude2`) | `rowToFeature` si `geomType === 'Point'` et pas de GeoJSON `lib/grist-rows.js:100-116` | `featureToRowUpdate` pour un point `lib/grist-sync.js:305-307`, **noms en dur** |
| `{lat, lng}` quelconques (`lat`/`y`, `lng`/`lon`/`x`) | `detectGeometryColumn` `lib/geo-tables.js:18, 28-30` ; `parseGeometryValue` `lib/geo-tables.js:35-41` | **aucune** |
| `geometry_fields` du manifeste (colIds réels, ex. `latitude2`) | `rowToFeature` `lib/grist-rows.js:85-86, 103-105` ; testé `tests/geometry-fields.test.js:61-96` | **ignoré** |
| `geometry`, `geom`, `wkt` (noms de colonne) | colonne **détectée** `lib/geo-tables.js:17, 24-27` | — |
| WKT (contenu) | **non lu** : `parseGeometryValue` ne parse qu'un texte commençant par `{` `lib/geo-tables.js:45-54`. Une table WKT est proposée comme géo par le scan, puis refusée « Table sans géométrie exploitable » `app_v7.js:7396` | aucune |
| Z / M | **perdus à la lecture** : `flattenCoords2D` `lib/grist-rows.js:50-57, 119` | réécrits en 2D `lib/grist-sync.js:310` |

Convention du producteur (qgis2grist) : point → `latitude`/`longitude` ; ligne/surface → `geometry_json` + `centroid_lat`/`centroid_lon` (`projects/qgis2grist/lib/scene-manifest.js:40-43`, `projects/qgis2grist/lib/geom-reconcile.js:17-27`). Convention d'`entableLayer` : `geometry_json` pour tout, sans centroïde, sans lat/lon. **Les deux coexistent dans un même document.**

### 1.3 Qui décide du format par couche

Personne de façon unique. Trois sources concurrentes :
- `layer.geometryColumn` — posé par `entableLayer` (`'geometry_json'`, `app_v7.js:7287`), `linkTableFromGrist` (chaîne **ou objet `{lat,lng}`**, `app_v7.js:7399`), `loadLayersFromGrist` (`app_v7.js:8495`) ; **lu seulement à la lecture** (`reloadGenericTableLayer` `app_v7.js:7374`), jamais par `featureToRowUpdate`.
- `layer._manifestLayer.source.geometry_fields` — lu à la lecture (`lib/scene-loader.js:550, 690`), ignoré à l'écriture.
- `layer.geometryType` — décide du **type** écrit (`declaredLayerGeometryKind` `lib/grist-sync.js:269-271`, repli `'Polygon'` s'il est absent).

### 1.4 `featureToRowUpdate` / `saveFeatureToSource` (`lib/grist-sync.js:273-353`)

- Attributs : ceux de `layer._fields` (ou, à défaut, toutes les propriétés non `_`), filtrés par `layer._gristColumns` s'il est non vide `lib/grist-sync.js:279-295` ; listes réécrites `['L', …]` depuis `_l_<champ>` (testé `tests/controles-types.test.js:80-87`).
- Géométrie : point → `longitude`/`latitude` ; autre → `geometry_json` ; garde-fou qui refuse d'écrire un Point sur une couche surfacique `lib/grist-sync.js:301-304` (testé `tests/scene-loader.test.js:288-303`).
- `fill_color` si `_fill_color` ; `atlas_3d_json` si couche à modèles `lib/grist-sync.js:314-331` (testé `tests/model-layer.test.js:106-125`).
- **Tout d'un bloc** : attributs **et** géométrie à chaque enregistrement, même quand seul un attribut a changé.
- `saveFeatureToSource` = un `UpdateRecord` par entité `lib/grist-sync.js:337-345` ; `saveFeaturesToSource` = boucle séquentielle, **une transaction par entité** `lib/grist-sync.js:347-353`.
- `_gristColumns` n'est rempli que pour les couches de manifeste (`lib/scene-loader.js:603, 615`, `lib/grist-sync.js:360`). Sur une couche liée ou entablée il est **absent** : le filtre `colSet` ne s'applique plus, et `latitude`, `longitude`, `geometry_json`, `atlas_3d_json` partent **sans savoir si la colonne existe**.

### 1.5 Ce qui se passe autour de l'écriture

- **`markDirty`** `app_v7.js:340-345` : `dirty = true`, **`_syncPaused = true`**, classe `dirty` sur l'en-tête ; sans effet en lecture.
- **`_syncPaused`** n'est remis à faux qu'à **un seul endroit** : la branche qgis2grist d'`applySelected` `app_v7.js:10215`. `saveLayerToGrist` remet `dirty` à faux (`app_v7.js:8575`), pas `_syncPaused`.
- **Polling** : `startScenePolling` `lib/grist-sync.js:421-450`, monté par `startSceneManifestPolling` `app_v7.js:8412-8438`, suspendu si `_syncPaused || dirty || _storyPresenting` `app_v7.js:8420`. Il ne relit que les couches `source === 'qgis2grist'`, visibles, non différées `lib/grist-sync.js:412-419`. Les couches liées ou entablées ne sont **jamais** relues automatiquement.
- **Relecture après écriture** : formulaire → `apresEcriture` → `A.refreshLayer` `app_v7.js:6500` → `refreshLayerFromTable` (qgis2grist, `app_v7.js:9145-9151`) ou `reloadGenericTableLayer(l, true)` (`app_v7.js:9154`). `applySelected` ne relit rien.
- **Erreur** : `enterViewModeOnWriteFail` `app_v7.js:7499-7508` bascule toute la session en lecture ; `applySelected` l'appelle **sur n'importe quelle erreur** (`app_v7.js:10221`), sans passer par `isWriteAclError`. Une colonne absente ferait donc passer un éditeur en lecture (lu ; non éprouvé).

### 1.6 Les autres écritures qui touchent une couche

- `saveLayerToGrist` `app_v7.js:8562-8599` : couche à clé (`sourceTable` ou `manifestLayerId`, `clePrefsCouche` `lib/grist-sync.js:126-128`) → **apparence seule** dans `Atlas_LayerPrefs` (+ ligne d'inventaire si `ligneInventaireRequise`, `lib/grist-sync.js:186-190`) ; sinon → **blob GeoJSON complet** dans `Maquette_Layers`.
- `exitSelectionMode` appelle `saveLayerToGrist(layer, true)` **à chaque sortie** de sélection hors lecture `app_v7.js:7030`.
- `pontFormulaire` `lib/fiche-formulaire.js:839-906` : `UpdateRecord` sur la ligne de la couche, ou `AddRecord` dans une table **liée** avec la référence `via` ; garde d'écriture consultée à la soumission.
- `deleteLayer` ne retire que la ligne d'inventaire `Maquette_Layers` `app_v7.js:9580` : jamais la table, jamais une ligne d'entité.

---

## 2. `entableLayer` et la création de table

`app_v7.js:7253-7297` :

1. Refuse une couche sans entité `app_v7.js:7255`.
2. Colonnes : `geometry_json` (Text) ; un attribut par propriété non `_`, type inféré par les valeurs (`inferGristType` `app_v7.js:7227-7242` : Bool / Int / Numeric / Text) ; `scale`, `rotation_x` … `offset_z` (Numeric) **si** des surcharges existent ; `model_id` (Text) si couche 3D `app_v7.js:7258-7271`.
3. Nom : `sanitizeId('Atlas_' + layer.name)` `app_v7.js:7244-7251, 7272` ; le nom réel est relu dans `retValues[0].table_id` `app_v7.js:7274` (Grist suffixe en cas de doublon).
4. `AddTable` puis, pour un point, `AddColumn model_glb` (Attachments), erreur avalée `app_v7.js:7273-7275`.
5. `BulkAddRecord` par lots de 200 `app_v7.js:7276-7283` — **plusieurs transactions** : un échec au milieu laisse une table partielle.
6. Relecture `fetchTable` → `tableToGeoJSON(cols, 'geometry_json')` ; bascule `kind = 'table'`, `sourceTable`, `geometryColumn`, **`source = 'grist-table'`** `app_v7.js:7285-7287` ; remontage ; `saveLayerToGrist` (prefs + inventaire) puis **`markDirty()`** `app_v7.js:7295`.

**Créer une couche VIDE par le même chemin** — ce qui marche déjà, ce qui bloque :

- Le **rechargement** d'une couche liée vide passe : `loadLayersFromGrist` monte une ligne d'inventaire `_binding.kind === 'table'` sans exiger d'entité, avec `geometryType` lu dans `GeomType` (`app_v7.js:8486-8511`). C'est le bon véhicule ; `ecrireLigneInventaire` `app_v7.js:8551-8560` sait la poser.
- Bloquent : le `throw 'couche vide'` (`app_v7.js:7255`) ; l'inférence de type par les valeurs (sans valeur, tout serait Text, `app_v7.js:7237`) ; l'absence de toute colonne attributaire à proposer ; `linkTableFromGrist` qui refuse une table vide (`app_v7.js:7396`) — la même table ne pourrait pas être re-liée par « Table ».
- Une couche vide ne peut **pas** passer par le manifeste qgis2grist : `lib/scene-loader.js:575` la saute.
- `getLayerFields` sur une couche sans entité ne connaît que les champs de symbologie et de contrôles `app_v7.js:836-849` : pour une couche vide, il faut lire le schéma (`STATE.schema`, chargé par `chargerSchema` dans `lireFormulairesDuDocument`, `app_v7.js:7445`).
- Dans l'application, `ClientRest.fetchTable` reconstruit les colonnes **depuis les enregistrements** (`recordsVersColonnes` `lib/data-client.js:379-391`) : une table vide y rend `{id: []}`, sans aucune colonne. Seul le schéma dit ce qu'elle contient.

---

## 3. Mode sélection et inspecteur droit

- **Deux inspecteurs, un seul panneau** (`#insp-head/#insp-tabs/#insp-body/#insp-foot`) : `renderInspector` `app_v7.js:5974-5988` choisit l'**inspecteur d'objet** si une sélection existe, sinon l'**inspecteur de couche** (`renderSymbologyInspector` `app_v7.js:6028`) quand le module Couches ou Symbo a une couche choisie (`A.selectLayer` `app_v7.js:9101`).
- L'inspecteur de couche porte déjà, en tête, deux actions sur les objets : `boutonEnTable` `app_v7.js:6410-6416` et `boutonRevueObjets` `app_v7.js:6002-6014` (→ `editLayerObjects` `app_v7.js:9643-9658`, revue ◀ ▶ de toute la couche). **C'est l'endroit naturel de « Nouvel objet ».**
- `enterSelectionMode(layerId, idx)` `app_v7.js:6990-7022` : gère la lecture (popup sauf couche en saisie), met en pause le suivi de trajet, pose `mode-saisie`, replie la pastille Relevé, ouvre la barre de sélection, puis `afterSelectionChange` et `flyToFeature` — qui ne vole que vers un **point** (`app_v7.js:7095-7098`). `exitSelectionMode` `app_v7.js:7024-7035`.
- `renderObjectInspector` `app_v7.js:6530-6677` : onglets = un par formulaire + « Placement 3D » (`objectInspectorTabs` `lib/model-layer.js:70-80`) ; `isQgis = coucheAvecLignes(layer)` `app_v7.js:6547` ; `attrsReadOnly = (view && !saisieTerrain) || !isQgis` `app_v7.js:6571`. Corps : moteur de formulaire, repli `renderAttrFields`, ou curseurs 3D. Pied : muet si le moteur tient le corps (`_formulaireMonte`), sinon « Enregistrer · N objets » → `applySelected` (`app_v7.js:6656-6676`).
- `renderAttrFields` masque `geometry_json`, `latitude`, `longitude`, `fill_color`, `atlas_3d_json` `app_v7.js:6340-6342` : la géométrie n'est **jamais** montrée. Restent visibles et éditables : `centroid_lat/lon`, les colonnes suffixées, les colonnes 3D d'`entableLayer` (`scale`, `rotation_x`…) — celles-ci sont masquées côté formulaire seulement (`COLONNES_ATLAS` `lib/fiche-formulaire.js:228-232`).
- `editFeature` `app_v7.js:10175-10199` : curseurs 3D → `setFeatureOverride` (`_scale`, `_offsetX`…). `setFeatureAttr` `app_v7.js:10231-10241` : coercition à deux types seulement, écrit en mémoire + `markDirty`.
- **Greffes possibles** : un onglet « Géométrie » dans `objectInspectorTabs` (même mécanique que `ONGLET_3D`) ; « Nouvel objet » dans la tête de `renderSymbologyInspector` ; le moteur de formulaire sait **créer** une ligne (`pont.addRow`, `lib/fiche-formulaire.js:880-892`, aujourd'hui réservé aux tables liées) — il faut une variante « ligne de la couche, géométrie comprise ».

---

## 4. P0 `applySelected` / `coucheAvecLignes` — démonstration

### 4.1 Le code

`applySelected` `app_v7.js:10206-10229` teste **`l.source === 'qgis2grist'`** (`app_v7.js:10211`). Toute autre couche part sur `markDirty(); saveLayerToGrist(l, true)` puis affiche « N objet(s) enregistré(s) » (`app_v7.js:10226-10228`). Or l'inspecteur décide de l'éditabilité par `coucheAvecLignes` (`!!layer.sourceTable`, `lib/grist-sync.js:144-146`), dont le commentaire (`lib/grist-sync.js:136-142`) décrit exactement ce défaut pour la fiche — corrigé là, pas ici. Une couche entablée (`source: 'grist-table'`, `app_v7.js:7287`) ou liée par « Table » (`app_v7.js:7401`, `8496`) est donc **éditable à l'écran et non écrite**.

### 4.2 Scénario concret (lu, non éprouvé en Grist réel)

1. Importer « Arbres » depuis OSM → couche `source: 'import'` (`makeLayer`, `app_v7.js:7187`).
2. « Enregistrer en table Grist » → `entableLayer` → table `Atlas_Arbres`, `source: 'grist-table'`, `sourceTable` posé.
3. Pas de FormDef utilisable **ou** moteur non chargé : l'onglet rend `renderAttrFields` **éditable** (`isQgis` vrai) sous « Modifications enregistrées dans **Atlas_Arbres** » (`app_v7.js:6624-6626`). Avec un FormDef et le moteur, c'est le moteur qui écrit, correctement, par `pontFormulaire` : le défaut ne se voit pas — d'où son caractère latent.
4. Taper une valeur → `setFeatureAttr` → mémoire + `markDirty`.
5. « Enregistrer · 1 objet » → `applySelected` → branche non qgis2grist → `saveLayerToGrist` → `clePrefsCouche` vaut `Atlas_Arbres` → **seule l'apparence** part dans `Atlas_LayerPrefs` (+ inventaire) (`app_v7.js:8565-8580`). Toast « 1 objet(s) enregistré(s) ».
6. Au rechargement, `tableToGeoJSON` relit la table : la valeur saisie a disparu.

Même issue pour l'onglet « Placement 3D » d'une couche entablée à modèles : les curseurs déplacent le modèle, « Enregistrer » ne l'écrit nulle part.

Effet de bord : `_syncPaused` reste vrai pour la session (§1.5), ce qui **gèle le polling des couches qgis2grist** du même document.

### 4.3 Pourquoi « unifier sur `coucheAvecLignes` » ne suffit pas

Brancher `saveFeaturesToSource` tel quel sur une couche entablée ou liée :
- **point entablé** : la géométrie est dans `geometry_json`, mais `featureToRowUpdate` écrit `longitude`/`latitude` (`lib/grist-sync.js:305-307`) ; `_gristColumns` étant absent, rien ne filtre → `UpdateRecord` sur des colonnes inexistantes (refus Grist attendu, libellé exact non vérifié) → `enterViewModeOnWriteFail` → **session basculée en lecture** ;
- **table liée à colonne `geom`/`geometry` ou `{lat,lng}`** : même défaut, `geometry_json` ou `latitude` visés à côté de la vraie colonne ;
- **placement 3D entablé** : `entableLayer` écrit `scale`, `rotation_x`… (`app_v7.js:7261-7264, 7281`) quand `featureToRowUpdate` écrit `atlas_3d_json` ; et à la lecture, `tableToGeoJSON` rend `scale` en propriété simple, que `resolveFeatureProps` ne lit pas (il lit `_scale`, `app_v7.js:2044`). Deux conventions de placement coexistent ; aucune n'est relue sur une couche entablée.

Le correctif P0 est donc : **un seul critère** (`coucheAvecLignes`) **et** une écriture qui connaît les colonnes réelles de la couche (§9, point 1).

---

## 5. Interactions carte en conflit avec un mode dessin

| Élément | Où | Conflit |
|---|---|---|
| Clic carte | `setupInteraction` `app_v7.js:6696-6746` | chaîne de drapeaux : `boxing/boxJustEnded` → `locationPickMode` → `trajetPickMode` → récit → lecture → couche distante → sélection. Un mode dessin serait un **quatrième drapeau** ; aucun n'exclut les autres (rien n'empêche d'armer `pickOnMap` `app_v7.js:9076` pendant `trajetPickMode`) |
| Survol | `app_v7.js:6688-6694` | pose le curseur ; `trajetPickMode` court-circuite, `locationPickMode` sort sans poser de curseur |
| `hitLayerIds` | `app_v7.js:6682-6684` | n'interroge que la couche principale `l.id` (ni `-outline`, ni `-pts`, ni `-hit`) : une ligne fine se touche mal au doigt ; la couche `-hit` est annoncée « reste à faire » dans `CLAUDE.md` |
| Sélection rectangulaire | `app_v7.js:6751-6834` | Maj+glisser (souris), **appui long 450 ms / 8 px** au doigt (`app_v7.js:2863-2864`) ; ne retient **que des points** (`selectInBox` `app_v7.js:6960-6974`) ; coupe `dragPan` pendant le geste. Un glisser de sommet au doigt entrerait en collision directe avec l'appui long |
| Double-clic | aucun `doubleClickZoom.disable()` dans `app_v7.js` (recherche faite) | le double-clic zoome : « double-clic pour terminer une ligne » est pris par MapLibre |
| Échap | `app_v7.js:10423-10428` | ordre : trajet → lieu → sélection → module. Le dessin doit s'y insérer (annuler le dernier sommet, ou tout) |
| Poignées de trajet | `new maplibregl.Marker({draggable:true})` `app_v7.js:3400` | modèle réutilisable pour des sommets ; mais un `Marker` par sommet est du DOM, coûteux au-delà de quelques centaines de sommets (non mesuré) |
| Récit en présentation | `app_v7.js:6711-6715` ; pause du suivi dans `enterSelectionMode` `app_v7.js:6993-6997` | un dessin pendant la présentation doit être interdit, ou mettre en pause de la même façon |
| Halo de sélection | `HALO_SELECTION` / `updateHighlight` `app_v7.js:7066-7093` | source `sel-hl` par-dessus ; une géométrie en cours d'édition doit remplacer le halo, pas s'y superposer |
| Filtres de contrôles | `filteredGeoJSON` `lib/controls.js:427-442` | un filtre `select` sur un champ absent **exclut toutes les entités** (`CLAUDE.md` §Récit) : un objet tout juste dessiné, sans attribut, disparaît de la carte |
| Repli en points | `lib/point-fallback.js`, `app_v7.js:2491-2499` | une surface plate se rend en point sous un seuil de zoom : ses sommets ne sont pas éditables à ce zoom |
| Relief / globe | `map.setTerrain` `app_v7.js:2319` | dépôt de sommets sur relief et en projection globe : comportement de `e.lngLat` sous MapLibre 5.6.1 **non vérifié** |
| Pastilles du dock | `_openDockPill` `app_v7.js:308`, repli dans `enterSelectionMode` `app_v7.js:7004` | une pastille ouverte recouvre la barre de sélection ; même traitement pour une barre de dessin |
| Téléphone | feuilles `lib/feuille-mobile.js`, `ficheCedee` `app_v7.js:5940, 7044` | la fiche occupe la moitié basse : dessiner demande de replier la feuille pendant le tracé puis de la rouvrir sur le formulaire |

---

## 6. Grist : lecture, écriture, droits, application

- **Deux lecteurs** aux règles différentes : couches de manifeste → `rowsToGeoJSON` (`lib/grist-rows.js:170-180`, sait `geometry_fields`, suffixés, (0,0)) ; couches liées ou entablées → `tableToGeoJSON` (`lib/geo-tables.js:58-94`, sait `{lat,lng}` et les listes `['L']`). Les deux **écartent une ligne sans géométrie** (`lib/grist-rows.js:114, 118`, `lib/geo-tables.js:70`) : une ligne créée sans géométrie est invisible.
- **Droits** : `resolveAccess` / `probeCanWriteDoc` `lib/view-mode.js:50, 241-263` ; `CONFIG.viewMode` (outils d'auteur) et `CONFIG.peutSaisir` (droit d'écrire) sont orthogonaux (`app_v7.js:8068-8103`). `assertCanWrite` `app_v7.js:7493-7497` ne regarde que `viewMode`. `VIEW_AUTHOR_MODULES` `app_v7.js:3997` contient `couches` : « Nouvelle couche » sera refusée en lecture sans rien ajouter. La saisie hors édition (`saisieHorsEdition` `lib/fiche-formulaire.js:688`) couvre **corriger une ligne** et **ajouter une ligne liée** — créer un objet de la couche sur le terrain est une décision à prendre, pas un acquis.
- **ACL par table** : la sonde vise une table arbitraire (`resolveProbeTableId` `lib/view-mode.js:214-230`) ; seul le refus réel de Grist tranche (`isWriteAclError` `lib/view-mode.js:193-205`). Créer une table (`AddTable`) relève du droit de **structure** du document, distinct de l'écriture de lignes (règle Grist ; comportement d'Atlas face à ce refus non vérifié).
- **Application (APK, `packages/atlas-app/`)** : `grist.docApi` y est un adaptateur sur `ClientRest` (`lib/grist-adapter.js:37-72`, installé avant `app_v7.js`, `lib/grist-adapter.js:78-91`) ; `applyUserActions` → `POST /apply` (`lib/data-client.js:339-343`). `AddTable`, `AddRecord`, `UpdateRecord` suivent donc le même appel ; que la réponse de `/apply` porte `retValues[0].table_id` comme le lit `entableLayer` (`app_v7.js:7274`) n'est **pas vérifié**. En PWA sans clé, `/apply` répond 403 (`lib/data-client.js:19-22`). Aucun rafraîchissement poussé hors widget (`lib/grist-adapter.js:26-27`). `fetchTable` REST ne livre pas les colonnes d'une table vide (§2).
- **Position de l'utilisateur** : utilisable dans l'application et le navigateur, pas dans le widget (`CLAUDE.md` §Pastille Relevé). « Poser un point à ma position » est donc une fonction d'application.

---

## 7. Tableau existe / partiel / manque

| Capacité | État | Où |
|---|---|---|
| Importer OSM / GeoJSON | existe | `app_v7.js:7138`, `7358` |
| Lier une table existante | existe (GeoJSON texte, lat/lng) | `app_v7.js:7384` |
| Entabler une copie | existe (couche non vide) | `app_v7.js:7253` |
| Créer une couche vide | **manque** (refusé) | `app_v7.js:7255`, `7396` |
| Recharger une couche liée vide | existe, par l'inventaire | `app_v7.js:8486-8511` |
| Lire du WKT | **manque** | `lib/geo-tables.js:45-54` |
| Garder le Z | **manque** | `lib/grist-rows.js:119` |
| Corriger les attributs d'une ligne (moteur) | existe | `lib/fiche-formulaire.js:895-903` |
| Corriger les attributs (repli) — couche qgis2grist | existe | `app_v7.js:10211-10225` |
| … couche entablée ou liée | **cassé** (P0) | §4 |
| Ajouter une ligne dans une table liée | existe | `lib/fiche-formulaire.js:880-892` |
| Ajouter une entité à la couche | **manque** | — |
| Écrire la géométrie — ligne/surface qgis2grist | partiel (2D, centroïdes périmés) | `lib/grist-sync.js:308-311` |
| … point qgis2grist | partiel (`latitude`/`longitude` en dur) | `lib/grist-sync.js:305-307` |
| … couche entablée ou liée | **manque** (viserait les mauvaises colonnes) | §4.3 |
| Dessiner un point / une ligne / une surface | **manque** | — |
| Déplacer un objet, éditer ses sommets | **manque** (seul un décalage 3D en mètres) | `app_v7.js:6637-6649` |
| Supprimer une entité | **manque** | `deleteLayer` `app_v7.js:9575-9585` ne touche que l'inventaire |
| Placement 3D persistant | partiel : `atlas_3d_json` (manifeste) contre colonnes `scale…` (entablée, jamais relues) | `lib/grist-sync.js:322-331`, `app_v7.js:7261-7281` |
| Poignées déplaçables sur la carte | existe (trajet) | `app_v7.js:3400` |
| Tracer un trajet | partiel : copie d'une ligne existante | `app_v7.js:3494-3515`, `lib/trajet.js:48-72` |
| Garde lecture / refus ACL | existe | `app_v7.js:7493-7508`, `lib/view-mode.js:193-263` |

---

## 8. Pièges et bugs latents

| # | Piège | Preuve | Gravité pour le chantier |
|---|---|---|---|
| P1 | `applySelected` n'écrit les entités que si `source === 'qgis2grist'` ; ailleurs, toast de succès sans écriture | `app_v7.js:10211, 10226-10228` | bloquant |
| P2 | `featureToRowUpdate` ignore `geometryColumn` et `geometry_fields`, ne sait pas écrire un point en `geometry_json` ; sans `_gristColumns`, vise des colonnes peut-être absentes | `lib/grist-sync.js:279-312` | bloquant |
| P3 | Pas de réindexage `_idx` après `refreshLayerFromTable` (polling, bouton, formulaire), et `mergeFeatureOverrides` recopie l'ancien `_idx`. Une ligne ajoutée n'a pas d'`_idx` → un clic sélectionne l'objet 0 (`app_v7.js:6709`), pas de modèle 3D (`app_v7.js:1540`) ; une ligne supprimée décale les suivantes | `lib/grist-sync.js:249, 356-390`, `app_v7.js:8421-8436, 9145-9151` | bloquant pour « Nouvel objet » sur une couche de manifeste |
| P4 | `_syncPaused` jamais relâché hors `applySelected` qgis2grist : tout `markDirty` (lieu, trajet, entabler, future nouvelle couche) **gèle le polling** pour la session | `app_v7.js:340-345, 10215` | élevé |
| P5 | Une écriture refusée pour une cause non ACL bascule quand même la session en lecture | `app_v7.js:10220-10222`, `7499-7508` | élevé (une colonne manquante suffit) |
| P6 | La géométrie est réécrite à chaque sauvegarde d'attributs : Z/M perdus, `centroid_lat/lon` laissés périmés | `lib/grist-rows.js:119`, `lib/grist-sync.js:308-311` | moyen |
| P7 | Point qgis2grist à `geometry_fields` suffixés : les coordonnées partent dans `latitude`/`longitude`, qui peuvent être **des attributs de la source** — corruption silencieuse | `lib/grist-sync.js:305-307` contre `lib/grist-rows.js:103-105`, `projects/qgis2grist/lib/scene-manifest.js:46-60` | moyen |
| P8 | Deux conventions de placement 3D ; celle d'`entableLayer` n'est jamais relue | `app_v7.js:7261-7281, 2044` | moyen |
| P9 | Une ligne sans géométrie est écartée par les deux lecteurs : créer puis géométriser en deux temps fait disparaître l'objet entre les deux | `lib/grist-rows.js:118`, `lib/geo-tables.js:70` | à concevoir |
| P10 | Couche vide refusée par `entableLayer`, `linkTableFromGrist`, `peutPasserEnTable`, `scene-loader` | `app_v7.js:7255, 7396`, `lib/grist-sync.js:164`, `lib/scene-loader.js:575` | bloquant pour « Nouvelle couche » |
| P11 | `BulkAddRecord` par lots = transactions séparées ; un échec partiel laisse une table partielle | `app_v7.js:7276-7283` | faible |
| P12 | `saveFeaturesToSource` = une transaction par objet | `lib/grist-sync.js:347-353` | faible (à regrouper pour l'édition multiple) |
| P13 | `sourceRowId` du trajet toujours `null` sur une couche qgis2grist | `app_v7.js:3443` | faible — compte si un trajet tracé doit se rattacher à une ligne |
| P14 | `flyToFeature` ne vole que vers un point | `app_v7.js:7095-7098` | faible |
| P15 | Sans `_fields`, l'écriture envoie toutes les propriétés, colonnes formule comprises (refus Grist attendu) | `lib/grist-sync.js:283-285` | non vérifié |
| P16 | Filtre de contrôle sur champ absent : l'objet neuf disparaît de la carte | `lib/controls.js:427-442` | à concevoir |
| P17 | `app_v7.js` est modifié par une autre session au moment de l'étude (+867/-36 lignes non commitées selon `git diff --stat`) | constat du 24/09/2026 | à coordonner avant d'y toucher |

---

## 9. Points de branchement recommandés

1. **Une écriture par capacité, préalable à tout** : dans `lib/grist-sync.js`, une fonction pure « colonnes de géométrie de la couche » qui résout, dans cet ordre, `geometry_fields` du manifeste, `layer.geometryColumn` (chaîne ou `{lat,lng}`), puis la convention du producteur (point → lat/lon, sinon `geometry_json` + centroïdes). `featureToRowUpdate` s'en sert ; `_gristColumns` est rempli pour **toute** couche à `sourceTable` (ou lu dans `STATE.schema`). Tests à côté de `tests/scene-loader.test.js:272-303`.
2. **P0 `applySelected`** (`app_v7.js:10206`) : critère `coucheAvecLignes(l) && CONFIG.grist.ready` ; `enterViewModeOnWriteFail` sur erreur ACL seulement (`isWriteAclError`) ; relâcher `_syncPaused` ; relire la couche après écriture. Séparer l'écriture « attributs » de l'écriture « géométrie », pour cesser de réécrire la géométrie à chaque attribut (P6).
3. **Réindexer** après toute relecture (`indexFeatures` dans `refreshLayerFromTable` ou `onLayerUpdated`), et remapper la sélection par `_row_id` plutôt que par indice (P3).
4. **Nouvelle couche** : un `creerCoucheVide({nom, type, colonnes})` qui fait `AddTable` (colonnes de géométrie selon la convention retenue + attributs choisis, types explicites) puis pose la ligne d'inventaire par `ecrireLigneInventaire` (`app_v7.js:8551-8560`) — le rechargement sait déjà la remonter. Bouton dans `actions()` du module Couches (`app_v7.js:4153-4160`), gardé par `assertCanWrite`. Lever le refus de table vide dans `linkTableFromGrist` pour une table dont le schéma porte une colonne de géométrie.
5. **Nouvel objet** : bouton dans la tête de `renderSymbologyInspector` (`app_v7.js:6028`), près de `boutonRevueObjets` ; il ouvre le mode dessin ; en fin de tracé, **un seul `AddRecord` qui porte la géométrie** (P9), relecture, sélection de la nouvelle ligne **par `_row_id`**, formulaire ouvert sur elle.
6. **Modifier la géométrie** : un onglet « Géométrie » dans `objectInspectorTabs` (`lib/model-layer.js:70`), sur le modèle de `ONGLET_3D`, présent si `coucheAvecLignes` et écriture permise.
7. **Un seul mode carte** : remplacer `locationPickMode`, `trajetPickMode` et le futur dessin par un état exclusif consulté en tête du clic, du survol, de l'appui long et d'Échap (`app_v7.js:6688-6700, 6775, 10423`) ; couper `doubleClickZoom` pendant le dessin.
8. **Tracer un trajet** : réutiliser le dessin de ligne et alimenter `poserTrajetDepuis` (`app_v7.js:3438`) avec la ligne dessinée au lieu de `copieLineaire` ; `lib/trajet.js` n'a rien à changer — il ne consomme que des coordonnées.

---

## 10. Tests existants utiles

| Fichier | Couvre |
|---|---|
| `tests/scene-loader.test.js:272-303` | `featureToRowUpdate` point lat/lon ; garde-fou Point sur polygone ; `mergeFeatureOverrides` |
| `tests/model-layer.test.js:100-125` | `atlas_3d_json` seulement pour une couche à modèles ; onglets de l'inspecteur |
| `tests/controles-types.test.js:80-90` | réécriture des listes `['L', …]` |
| `tests/geometry-fields.test.js:61-130` | lecture `geometry_fields`, suffixés, (0,0), lignes non localisées — **lecture seule** |
| `tests/prefs-couche-cle.test.js` | `clePrefsCouche`, `ligneInventaire(Requise)`, `peutPasserEnTable` (couche vide comprise) |
| `tests/fiche-formulaire.test.js` | `pontFormulaire`, `saisieHorsEdition`, colonnes Atlas masquées |
| `tests/trajet.test.js` | géométrie du trajet (`copieLineaire`, `projeter`, abscisses) |
| `tests/access-rights.test.js`, `tests/view-mode.test.js` | `resolveAccess`, `isWriteAclError`, sonde |
| `tests/data-client.test.js`, `tests/grist-adapter.test.js` | client REST et adaptateur (`applyUserActions` relayé) |

**Aucun test** ne couvre : `entableLayer`, `applySelected`, l'aller-retour écriture → `tableToGeoJSON`, l'écriture avec `geometry_fields`, l'écriture sur une couche sans `_gristColumns`, le réindexage après relecture. `entableLayer`, `applySelected` et `setupInteraction` vivent dans `app_v7.js`, que `node --test` n'importe pas : les rendre testables suppose d'extraire leur partie pure dans `lib/`.

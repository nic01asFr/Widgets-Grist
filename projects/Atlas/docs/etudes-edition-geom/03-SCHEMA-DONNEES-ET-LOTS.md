# Étude 03 — Édition géographique : modèle de données, API Grist et lots

> Étude de cadrage, 24/09/2026. **Aucun code modifié.** Branche lue :
> `atlas-formulaire-entite`. Les références `fichier:ligne` renvoient à
> `projects/Atlas/` sauf mention contraire. `app_v7.js` changeait pendant la
> lecture (une autre session y travaillait) : ses numéros de ligne valent pour
> le 24/09/2026 et peuvent glisser de quelques lignes ; le nom de fonction cité
> fait foi.
>
> Convention de preuve : **[vérifié]** = constaté à la lecture du code, ou déjà
> prouvé en Grist réel par un document du dépôt (cité) ; **[non vérifié]** =
> hypothèse sur le comportement de Grist ou de l'application, à éprouver avant
> de s'y fier. Aucune API Grist n'a été appelée pour cette étude.

## 0. Ce qu'il faut retenir

1. **Atlas ne sait aujourd'hui modifier aucune géométrie.** Aucun code ne
   déplace un sommet ni ne pose un objet ; seuls les réglages 3D (échelle,
   rotation, décalage) sont éditables. L'écriture de géométrie existe dans
   `featureToRowUpdate` (`lib/grist-sync.js:273-335`), mais elle n'est appelée
   que pour les couches `qgis2grist` (`app_v7.js:10223`) et elle a trois défauts
   (§1.3). L'affirmation de la session précédente est donc **à moitié vraie**.
2. **Format recommandé pour une couche créée dans Atlas** : `latitude` /
   `longitude` (Numeric) pour les points, `geometry_json` (Text, GeoJSON 2D,
   7 décimales) pour les lignes et les surfaces. C'est la convention de
   qgis2grist et du Scene Manifest, et celle qu'écrit déjà `featureToRowUpdate`.
3. **Une couche = une table mono-type** + une ligne d'inventaire dans
   `Maquette_Layers` (qui porte le type de géométrie, indispensable pour une
   table vide) + une ligne d'apparence dans `Atlas_LayerPrefs`. Le tout en **une
   seule transaction**.
4. **Créer un objet = dessiner → fiche → un seul `AddRecord`** portant la
   géométrie et les attributs. Le pont du formulaire injecte la géométrie comme
   il injecte déjà la référence d'un formulaire lié. Annuler n'écrit rien.
5. **L'identité d'un objet est son `_row_id`**, jamais son rang : la sélection
   d'Atlas est aujourd'hui indexée par position (`STATE.selection.features`),
   ce qui casse dès qu'une ligne est ajoutée ou retirée.
6. **Créer une couche est un droit de structure**, distinct du droit d'écrire
   des lignes : un refus ne doit pas faire basculer la session en lecture.

---

## 1. Formats de géométrie

### 1.1 Ce qu'Atlas sait lire — deux chemins, deux règles

Atlas lit une table géographique par **deux fonctions distinctes**, qui ne
reconnaissent pas les mêmes colonnes. [vérifié]

| | Chemin « manifeste » `rowToFeature` | Chemin « table liée » `tableToGeoJSON` |
|---|---|---|
| Où | `lib/grist-rows.js:81-168` | `lib/geo-tables.js:34-94` |
| Qui l'emprunte | couches `qgis2grist` (`lib/scene-loader.js:594`), leur rafraîchissement (`lib/grist-sync.js:356-390`) | tables liées, entablées, inventaire `Maquette_Layers` (`app_v7.js:7384`, `7398`, `8517`) |
| Colonne GeoJSON | `geometry_fields.geojson` du manifeste, sinon `geometry_json` (`grist-rows.js:86`) | premier nom trouvé parmi `geometry_json`, `geometry`, `geom`, `wkt` (`geo-tables.js:17`, casse indifférente) |
| Valeur GeoJSON acceptée | chaîne JSON ou objet ; une `Feature` n'est **pas** dépliée | chaîne commençant par `{`, ou objet ; une `Feature` est dépliée en sa géométrie (`geo-tables.js:49`) |
| Latitude / longitude | seulement si le type déclaré est `Point` ; `geometry_fields.lat/lon`, sinon `latitude, Latitude, lat, centroid_lat` et `longitude, Longitude, lon, lng, centroid_lon` (`grist-rows.js:27-28`), puis variantes suffixées `latitude2` (`:40-47`) | `latitude, lat, y` et `longitude, lng, lon, x` (`geo-tables.js:18`) |
| `(0, 0)` | écarté : « pas de coordonnée » (`grist-rows.js:31-33`) | **accepté** |
| Cellule vide | écartée | **transformée en point `(0, 0)`** : `+null` et `+''` valent `0`, qui passe `Number.isFinite` (`geo-tables.js:36-39`) |
| Z / M | retirés (`flattenCoords2D`, `grist-rows.js:50-57`) | **conservés** |
| WKT | non | **non** — une colonne `wkt` est *détectée* comme géométrie, mais sa valeur, qui ne commence pas par `{`, rend `null` (`geo-tables.js:46-54`). La table apparaît dans « tables géo du document », puis est refusée : « Table sans géométrie exploitable » (`app_v7.js:7410`) |

Autres formats (WKB, coordonnées projetées Lambert 93, GeoJSON rangé dans une
colonne `Any`) : **non lus**. Aucune reprojection n'existe ; tout est supposé
en WGS84 (EPSG:4326).

> **Deux défauts de lecture à corriger avant toute création**, parce que la
> création les rendra fréquents :
> - une ligne créée sans coordonnées dans une table lat/lon devient un point
>   posé au large du golfe de Guinée ;
> - la règle « qu'est-ce qu'une géométrie » existe deux fois et diverge sur
>   `(0,0)`, le vide, le Z et les noms. C'est exactement le motif que
>   `COLONNES_INTERNES_GRIST` a dû réunifier (`grist-rows.js:64-79`).

### 1.2 Ce qu'Atlas sait écrire

| Écrivain | Ce qu'il écrit | Référence |
|---|---|---|
| `entableLayer` | `geometry_json` = `JSON.stringify(f.geometry)` pour **tous** les types, **points compris** ; Z conservé, précision pleine | `app_v7.js:7267-7311` |
| `featureToRowUpdate` | point → `longitude`, `latitude` ; ligne/surface → `geometry_json` 2D ; garde : jamais un `Point` dans une couche surfacique | `lib/grist-sync.js:297-312` |
| Import OSM | `[el.lon, el.lat]` (ordre GeoJSON correct) | `app_v7.js:7184` |

### 1.3 Les trois défauts de l'écrivain existant [vérifié par lecture]

1. **Noms de colonnes figés.** `featureToRowUpdate` écrit `latitude`,
   `longitude`, `geometry_json` en dur. Il ignore `layer.geometryColumn` et le
   `geometry_fields` du manifeste : sur une table où Grist a suffixé
   `latitude2` (cas documenté, `CLAUDE.md` « Colonnes géométriques »), il
   écrirait dans la colonne de la **source**, pas dans celle d'Atlas.
2. **Point rangé en `geometry_json` : rien n'est écrit.** C'est le cas de toute
   couche entablée de points (`Atlas_Arbres`). Si `_gristColumns` est connu, la
   condition `colSet.has('latitude')` est fausse et la géométrie est ignorée
   **sans message** ; s'il ne l'est pas (couche `grist-table`, où rien ne le
   renseigne), l'`UpdateRecord` vise des colonnes inexistantes et Grist refuse
   [non vérifié : libellé exact du refus].
3. **Seules les couches `qgis2grist` écrivent leurs lignes.** `applySelected`
   (`app_v7.js:10219-10238`) aiguille une couche `grist-table` vers
   `saveLayerToGrist`, qui n'écrit que l'apparence et l'inventaire. Pour ces
   couches, seul le moteur de formulaire écrit dans la table (`pontFormulaire`).

**Conséquence** : l'édition de géométrie demande **un écrivain neuf**, piloté
par `layer.geometryColumn` (chaîne ou `{lat, lng}`), et non la réutilisation
de `featureToRowUpdate`. Le lot 0 le pose, et `featureToRowUpdate` s'y ramène.

### 1.4 Format adopté pour une couche créée dans Atlas

| Type | Colonnes | Type Grist | Pourquoi |
|---|---|---|---|
| Point | `latitude`, `longitude` | `Numeric` | lisibles et corrigibles dans la grille Grist ; triables, filtrables, utilisables en formule ; compris par les widgets carte qui attendent deux colonnes ; convention qgis2grist (`projects/qgis2grist/lib/geom-reconcile.js:16-22`) et Scene Manifest (`projects/qgis2grist/lib/scene-manifest.js:40-44`) ; déjà ce qu'écrit `featureToRowUpdate` |
| Ligne, Surface | `geometry_json` | `Text` | seul format qu'Atlas lit sur les deux chemins ; convention qgis2grist ; relisible par QGIS |

**Écartés** : le WKT (non lu, §1.1) ; `geometry_json` pour les points
(précédent `entableLayer`, mais illisible dans la grille et incompatible avec
l'écrivain actuel) ; une colonne `Any` portant un objet (l'API plugin et l'API
REST ne le rendraient pas forcément de la même façon [non vérifié]).

`centroid_lat` / `centroid_lon`, que qgis2grist ajoute aux surfaces : **pas dans
le MVP**. Écrits comme données, ils deviennent faux au premier sommet déplacé ;
Atlas ne les lit pas (`grist-rows.js:134`) et calcule ses centres lui-même
(`lib/point-fallback.js`). Si un besoin apparaît, en faire des colonnes
**formule** calculées par Grist depuis `geometry_json` — un seul écrivain
[non vérifié : disponibilité du module `json` dans le bac à sable Python].

### 1.5 Règles d'écriture

| Règle | Valeur | Raison |
|---|---|---|
| Système | WGS84, degrés décimaux | seul système lu |
| Ordre | `[longitude, latitude]` dans le GeoJSON ; deux colonnes pour un point | RFC 7946 ; `flattenCoords2D` garde `c[0], c[1]` |
| Dimension | 2D ; Z et M retirés | MapLibre ne s'en sert pas ; le relief vient du MNT |
| Précision | **7 décimales** | ≈ 1,1 cm en latitude, ≈ 0,8 cm en longitude à 43° N ; un pixel à z20 vaut ≈ 11 cm à cette latitude, un GPS de terrain 3 à 5 m. `JSON.stringify` écrit aujourd'hui jusqu'à 17 chiffres : du volume sans information |
| Bornes | lon ∈ [-180, 180], lat ∈ [-90, 90], jamais `(0, 0)` | `(0, 0)` est la sentinelle « absent » d'Atlas |
| Point | deux nombres finis | |
| Ligne | ≥ 2 sommets distincts après fusion des doublons consécutifs ; longueur > 0 | |
| Surface | anneau extérieur fermé (premier = dernier, ajouté si absent) ; ≥ 3 sommets distincts ; aire > 0 ; **pas d'auto-intersection** ; anneau extérieur antihoraire (RFC 7946 — réorienté plutôt que refusé) ; pas de trou dans le MVP | un anneau croisé donne un remplissage et une extrusion faux, sans erreur |
| Doublons | sommets consécutifs à moins de 5 cm fusionnés — le seuil de `pointsDistincts` du trajet (`lib/trajet.js:23-33`) | un double-clic de fin de tracé en pose un |
| Types | simples seulement (`Point`, `LineString`, `Polygon`) ; l'outil a le type de la couche | une `LineString` dans une couche en volume est fermée et extrudée en silence (`CLAUDE.md`, « Le halo, éprouvé sur les trois familles ») |
| Taille | plafond souple : 5 000 sommets ou 200 Ko par cellule, avec message | Grist n'impose pas de limite documentée à une cellule `Text` [non vérifié] ; `entableLayer` découpe déjà par lots de 200 par prudence sur la charge utile |

---

## 2. Schéma d'une table créée par « Nouvelle couche »

### 2.1 Colonnes

Colonnes de Grist, jamais créées ni offertes : `id`, `manualSort`
(`COLONNES_INTERNES_GRIST`, `lib/grist-rows.js:79`). [vérifié]

Colonnes réservées par Atlas (`COLONNES_ATLAS`, `lib/fiche-formulaire.js:228-232`) :
`model_id`, `model_glb`, `scale`, `rotation_x|y|z`, `offset_x|y|z` — plus
`atlas_3d_json` (`lib/grist-sync.js:41`), que `colonnesHorsFormulaire` retire
aussi (`fiche-formulaire.js:265-275`). **Aucune n'est créée par « Nouvelle
couche »** : elles ne servent qu'aux couches à modèles 3D, et `entableLayer`
les ajoute à la demande. Deux conventions coexistent d'ailleurs pour le
placement 3D (colonnes séparées chez `entableLayer`, JSON `atlas_3d_json` chez
`featureToRowUpdate`) : ne pas en ajouter une troisième.

Schéma recommandé :

| `id` de colonne | Libellé | Type Grist | Point | Ligne | Surface | Rôle |
|---|---|---|:-:|:-:|:-:|---|
| `nom` | Nom | `Text` | ✓ | ✓ | ✓ | le nom lisible ; `nomObjet` le trouve déjà (fiche, palette) |
| `latitude` | Latitude | `Numeric` | ✓ | | | géométrie |
| `longitude` | Longitude | `Numeric` | ✓ | | | géométrie |
| `geometry_json` | Géométrie (GeoJSON) | `Text` | | ✓ | ✓ | géométrie |

Rien d'autre. Les colonnes métier s'ajoutent ensuite dans Grist ou par le
générateur de formulaires (`projects/grist_forms/shared/ensure-schema.js:168-196`
pose les `AddColumn` manquantes et ne remplace jamais une colonne incompatible).
Atlas ne livre aucun modèle de fiche — règle de `docs/CADRAGE-FICHE-ENTITE.md`,
« Rien n'existe tant que l'utilisateur ne l'a pas fait ».

Option, hors MVP : `cree_le` (`DateTime`) et `cree_par` (`Text`) en **formules
déclenchées à la création** (`NOW()`, `user.Email`). Le serveur les remplit :
l'auteur ne peut pas être falsifié par le client, et le cadrage de la fiche
range l'auteur parmi les faits « injectés, invisibles »
(`CADRAGE-FICHE-ENTITE.md`, « Ce que le contexte remplit d'autre »).
[non vérifié : paramétrage exact `recalcWhen` / `recalcDeps` par
`applyUserActions`]

La colonne de géométrie n'apparaît dans aucun formulaire :
`colonnesHorsFormulaire` l'écarte déjà, qu'elle soit une chaîne ou un couple
`{lat, lng}` (`fiche-formulaire.js:273-274`). [vérifié]

### 2.2 Nom de la table

- Le nom saisi, translittéré par la règle de `sanitizeId` (`app_v7.js:7258-7265`),
  **sans préfixe `Atlas_`**. Le préfixe désigne les tables d'Atlas lui-même
  (`Atlas_LayerPrefs`, `Atlas_ScenePrefs`, `Atlas_Story`) ; une couche est la
  donnée de l'utilisateur, avec sa page à son nom dans Grist.
- **Garde contre les noms réservés.** `entableLayer` préfixe par `Atlas_` : une
  couche nommée « Story » y deviendrait `Atlas_Story`, la table du récit, si
  celui-ci n'existe pas encore — et `GEO_SKIP_TABLES` (`lib/geo-tables.js:8-15`)
  la masquerait ensuite. La même garde est à porter dans `entableLayer`.
- Collision : proposer `Arbres_2` avant d'écrire, à partir de `listTables()`,
  plutôt que de laisser Grist renommer. Grist peut renommer quand même en cas de
  course ; le nom réel se lit dans `retValues[i].table_id`, comme le fait déjà
  `entableLayer` (`app_v7.js:7288`). [vérifié pour la lecture du nom ; le
  renommage par Grist est non vérifié]

### 2.3 Format des définitions de colonnes — à trancher en Grist réel

Atlas passe à `AddTable` des colonnes `{ id, fields: { label, type } }`
(`app_v7.js:7279-7283`, `lib/grist-sync.js:28-33`). `skills/schema.md` et
`grist_forms/shared/ensure-schema.js` utilisent la forme **plate**
`{ id, type, label }`. La forme `fields` est celle de l'API REST `POST /tables`.

L'épreuve du 05/09/2026 (`CADRAGE-FICHE-ENTITE.md:808`) note « `natural`
(Text, inférée) » : elle ne tranche pas, car une colonne `Any` qui reçoit du
texte est **aussi** devinée `Text` par Grist. **[non vérifié]** : que libellés et
types passent réellement sous la forme `fields` dans l'action utilisateur.
Premier contrôle du lot 1, dans « Données brutes » : `latitude` doit être
`Numeric` **avant** toute ligne, et libellée « Latitude ».

### 2.4 Comment Atlas la reconnaît ensuite

| Mécanisme | Suffit-il ? | Référence |
|---|---|---|
| Détection automatique `scanGeoTables` | la liste « tables géo du document » la montre, mais sans type ni objets ; `linkTableFromGrist` **refuse une table vide** | `lib/geo-tables.js:111-137`, `app_v7.js:7410` |
| **Ligne d'inventaire `Maquette_Layers`** | **oui** : `Name`, `GeomType`, et `_binding {kind:'table', sourceTable, geometryColumn}` dans `StyleJSON` ; `loadLayersFromGrist` la remonte au chargement, **table vide comprise**, en mode maquette comme en mode manifeste | `lib/grist-sync.js:186-214`, `app_v7.js:8478-8544` |
| `Atlas_LayerPrefs` | apparence et visibilité, clé = `sourceTable` | `lib/grist-sync.js:126-128`, `216-233` |
| Scene Manifest | **non** : Atlas ne l'écrit pas, qgis2grist en est le producteur (`CADRAGE-BINDING-COMPLET.md` §7) | |

Recommandation : **l'inventaire est la déclaration.** C'est le seul endroit qui
porte le type d'une table encore vide, et le mécanisme existe, testé
(`ligneInventaireRequise`, `ligneInventaire`). Le type ne doit pas se deviner
du premier objet, comme le fait `linkTableFromGrist` (`app_v7.js:7411`).

Piste écartée : ranger le type dans les `widgetOptions` de la colonne de
géométrie. Élégant — la table se décrirait seule —, mais `schemaDepuisMeta` ne
lit pas ce champ pour cela, et l'interface Grist peut réécrire l'objet
[non vérifié].

### 2.5 La transaction « Nouvelle couche »

Une seule `applyUserActions`, pour qu'un refus ne laisse ni table orpheline ni
inventaire sans table — la leçon du récit écrit en deux temps (`CLAUDE.md`,
« Persistance ») :

```text
[ ['AddTable', 'Maquette_Layers', …]      si absente (cf. ensureMaquetteLayersTable)
  ['AddTable', 'Atlas_LayerPrefs', …]     si absente (cf. ensureAtlasPrefsTable)
  ['AddTable', <T>, <colonnes du §2.1>]
  ['AddRecord', 'Maquette_Layers', null, ligneInventaire(couche)]
  ['AddRecord', 'Atlas_LayerPrefs', null, { source_table: <T>, StyleJSON, Visible, UpdatedAt }] ]
```

Puis : lire `retValues` (nom réel de `<T>`, `gristId` de l'inventaire,
`_prefRowId`), monter la couche vide avec son `geometryType` déclaré,
`geometryColumn` = `'geometry_json'` ou `{lat: 'latitude', lng: 'longitude'}`,
`kind: 'table'`, `source: 'grist-table'`.

`entableLayer`, lui, n'est pas atomique : `AddTable`, puis `AddColumn`, puis N
lots — un échec au troisième lot laisse une table à moitié remplie. Hors
périmètre ici, mais à noter.

[non vérifié] : `AddTable` en action utilisateur crée aussi une **page** dans le
document. C'est plutôt souhaitable — la personne voit sa donnée — mais c'est une
empreinte à annoncer.

---

## 3. Séquences d'écriture

### 3.1 Identité ligne ↔ entité

- L'identité est `properties._row_id` = l'`id` Grist, posé par les deux chemins
  de lecture (`grist-rows.js:122`, `geo-tables.js:71`). [vérifié]
- **La sélection, elle, est un rang** : `STATE.selection.features` contient des
  positions dans `layer.geojson.features`, recopiées en `_idx`
  (`app_v7.js:2422-2427`, `6757`, `7026`). Un `AddRecord` ou un `RemoveRecord`
  suivi d'une relecture décale les rangs : la fiche ouverte montrerait un autre
  objet. Toute relecture après écriture doit **resélectionner par `_row_id`**
  (fonction pure `rangsDepuisRowIds`).
- Le nouvel identifiant vient de `retValues[0]` de l'`AddRecord` (déjà lu ainsi
  par `saveLayerToGrist`, `app_v7.js:8609`). [vérifié dans le widget ; en REST,
  la présence de `retValues` dans la réponse de `/apply` est **non vérifiée**]

### 3.2 Créer un objet

**Séquence recommandée — une seule écriture, après la fiche :**

```text
1. outil de tracé  → géométrie brute (clics, ou position GPS dans l'application)
2. normaliserGeometrie + validerGeometrie (lot 0) → refus nommé, ou géométrie propre
3. cellules = cellulesGeometrie(géométrie, layer.geometryColumn)
      Point  → { latitude, longitude }
      sinon  → { geometry_json: '…' }
4. fiche : FormEngine monté avec un pont en mode « création sur la couche »
      pas d'editRowId ; addRow(table, data) →
      ['AddRecord', layer.sourceTable, null, { ...data, ...cellules }]
5. retValues[0] → _row_id ; l'objet rejoint layer.geojson ; sélection par _row_id
6. Annuler (fermer la fiche) → rien n'a été écrit
```

Pourquoi cet ordre plutôt que « dessiner → `AddRecord` → fiche » :

| | `AddRecord` d'abord | Fiche d'abord (recommandé) |
|---|---|---|
| Champs obligatoires | contournés : la ligne existe avant la validation | tenus : `validateRequired` passe avant l'écriture (`grist_forms/runtime/engine.js:567-579`, `872-874`) |
| Abandon | ligne incomplète à supprimer (et si la suppression est refusée ?) | rien à défaire |
| Annulation | deux actions | une action, d'inverse simple (`RemoveRecord`) |
| Photo | envoyée puis rattachée à une ligne déjà là | inchangé : `uploadFile` passe avant l'écriture (`engine.js:884-898`) |

Le moteur le permet déjà : `defaultSubmit` prend `bridge.addRow` quand il n'y a
pas d'`editRowId` (`engine.js:581-592`). Et `pontFormulaire` fait **déjà** ce
geste pour un formulaire lié, en injectant la référence
(`lib/fiche-formulaire.js:880-893`). La création sur la couche est le même
motif, la géométrie à la place de la référence : c'est un fait du contexte — on
a dessiné —, pas une saisie. [vérifié par lecture ; non éprouvé]

Repli sans moteur (`moteurDisponible()` faux, `fiche-formulaire.js:36-38`) :
`AddRecord` de la géométrie seule, puis fiche en mise à jour (`updateRow`). Les
obligatoires ne sont alors pas tenus ; le dire.

Quel formulaire : `Attributs` (le dérivé, toujours présent en premier,
`fiche-formulaire.js:308-360`) en édition ; en terrain, le premier formulaire
**offert** sur la couche (`formulairesOffertsEnLecture`). Un formulaire lié
(`surLaCouche === false`) ne sert jamais à créer l'objet.

### 3.3 Modifier la géométrie

```text
['UpdateRecord', T, rowId, cellulesGeometrie(nouvelle, geometryColumn)]
```

- **Seules les cellules de géométrie partent.** Le formulaire n'envoie que ses
  champs, dont la géométrie ne fait pas partie : les deux écrivains ne se
  recouvrent pas — constaté le 05/09/2026 (`CADRAGE-FICHE-ENTITE.md:818-822`).
- Avant d'écrire, garder la valeur d'origine telle que lue : c'est l'inverse
  pour annuler.
- Conflit avec un autre éditeur : l'API plugin n'offre ni verrou ni version de
  ligne. Option sûre et bon marché : relire la ligne juste avant l'écriture et
  la comparer à la valeur d'ouverture ; si elle a changé, avertir au lieu
  d'écraser (fonction pure `geometrieAChange`). Sinon, la dernière écriture
  gagne.

### 3.4 Supprimer

```text
['RemoveRecord', T, rowId]
```

- Confirmation obligatoire, qui **compte les relevés rattachés** : les tables
  qui référencent la couche sont connues (`tablesReferencant`,
  `lib/schema-grist.js:106-116`). « Supprimer ce bâtiment et laisser 3 visites
  sans objet ? »
- [non vérifié] : ce que Grist fait des `Ref` qui pointent la ligne supprimée
  (vidées, ou laissées en référence invalide).
- Pas d'annulation par Atlas : recréer la ligne donnerait un **autre** `id`, et
  les relevés liés resteraient orphelins. L'annulation du document dans Grist
  couvre-t-elle une action venue d'un widget ? [non vérifié]

### 3.5 Rafraîchir sans perdre l'état de la carte

État actuel [vérifié] :

- **Atlas n'écoute pas `grist.onRecords`** : aucune occurrence dans `app_v7.js`
  ni dans `lib/`. La seule relecture automatique est un minuteur de 30 s
  (`CONFIG.pollIntervalMs`, `app_v7.js:237`), **limité aux couches
  `qgis2grist` visibles et non différées** (`layersToRefresh`,
  `lib/grist-sync.js:412-419`), suspendu si `_syncPaused || dirty ||
  _storyPresenting` (`app_v7.js:8434`).
- Une couche `grist-table` (liée, entablée, créée) n'est **jamais** relue
  d'elle-même : seulement par le bouton Rafraîchir (`app_v7.js:9151-9177`) ou
  après une écriture de fiche (`apresEcriture`, `app_v7.js:6514`).
- `reloadGenericTableLayer` refuse de relire quand `dirty`, sauf forçage
  (`app_v7.js:7386`) ; il remplace tout `layer.geojson`.
- `mergeFeatureOverrides` (`lib/grist-sync.js:236-260`) remet dans l'objet relu
  les attributs **absents** de la nouvelle lecture : un champ vidé par la fiche
  réapparaît avec son ancienne valeur jusqu'au rechargement. Défaut existant, à
  corriger au lot 4.

Règles pour l'édition :

1. **Après une écriture d'Atlas, pas de relecture de la table** : appliquer le
   changement localement (ajout, remplacement de géométrie, retrait par
   `_row_id`), puis `syncLayerSourceData` (`app_v7.js:830-840`). Relire la table
   entière pour un point, c'est le coût que le scan des tables géo a déjà payé
   (126 Mo → 27 Mo).
2. **Suspendre le minuteur pendant un tracé ou une modification** : un drapeau
   `_editionGeom` ajouté à `isPaused`. Sans lui, sur une couche `qgis2grist`,
   une relecture en plein déplacement de sommet remplacerait la géométrie en
   cours.
3. **Resélectionner par `_row_id`** après toute relecture (§3.1).
4. Ne pas passer par `markDirty` (`app_v7.js:340-345`) : il dit « la scène a
   des changements non enregistrés », alors qu'une géométrie est enregistrée à
   chaque geste — et il suspend la synchronisation.

### 3.6 Annuler

Pile locale d'actions inverses, pour la session, calculées **avant** d'écrire
(fonction pure `actionInverse`) :

| Action | Inverse | Tenue |
|---|---|---|
| `AddRecord` (création) | `RemoveRecord` du `rowId` obtenu | exacte |
| `UpdateRecord` de géométrie | `UpdateRecord` avec les cellules d'origine | exacte si personne n'a écrit entre-temps (§3.3) |
| `RemoveRecord` | aucune | voir §3.4 |

---

## 4. Droits

### 4.1 Trois droits distincts, pas un

| Geste | Droit Grist | Comment Atlas le sait |
|---|---|---|
| Créer une couche (`AddTable`) | **structure** du document : propriétaire, ou éditeur si les règles d'accès lui laissent la structure [non vérifié : nom et défaut de la règle] | **il ne le sait pas** : la sonde fait un `UpdateRecord` (`lib/view-mode.js:241-264`), qui ne dit rien de la structure |
| Créer un objet (`AddRecord`) | création sur la table de la couche | seulement en écrivant |
| Modifier une géométrie (`UpdateRecord`) | mise à jour sur la table, voire **sur la seule colonne** de géométrie | seulement en écrivant |

Conséquence, et c'est le point de conception : **un refus de structure, de
création ou de colonne n'est pas un refus d'écriture.** Aujourd'hui, un refus
franc bascule toute la session en lecture (`enterViewModeOnWriteFail`,
`app_v7.js:7513-7523`), et `isWriteAclError` reconnaît « blocked by » et
« access rules » quel que soit le verbe (`lib/view-mode.js:193-204`). Appliquer
cette réaction à « Nouvelle couche » fermerait la fiche d'objet à un éditeur qui
a le droit d'écrire des lignes, mais pas de créer des tables. D'où :

- refus d'`AddTable` → message nommé, **la session reste en édition** ;
- refus d'`AddRecord` / `UpdateRecord` sur une couche → l'édition de **cette
  couche** se ferme (`layer._editionRefusee = motif`), pas la session ;
- seul un refus sur l'apparence ou le récit garde le comportement actuel.

Libellés à distinguer (fonction pure `natureRefus`) : « Blocked by table create
access rules », « … update … », « … remove … », « … column … » — tous déjà
reconnus par `isWriteAclError` (`view-mode.js:196-202`). Le libellé exact d'un
refus de structure est [non vérifié].

On ne prédit pas le verdict : même doctrine que la saisie hors édition
(`CADRAGE-FICHE-ENTITE.md`, « La sonde par table n'existera pas »). Les outils
s'offrent selon le mode, Grist tranche à l'écriture, le refus se nomme.

### 4.2 Qui voit quels outils

| Contexte | Nouvelle couche | Nouvel objet | Modifier / supprimer une géométrie |
|---|:-:|:-:|:-:|
| Édition (`viewMode` faux) | ✓ | ✓ | ✓ |
| Lecture demandée par `?mode=view`, `peutSaisir` vrai (lien de terrain) | ✗ | **lot 7** : seulement si la scène l'a ouvert pour cette couche | ✗ |
| Lecture imposée par Grist (`grist-readonly`) | ✗ | ✗ | ✗ |
| Scène externe `?scene=` (pas de `docApi`, `app_v7.js:8070-8073`) | ✗ | ✗ | ✗ |

`CONFIG.peutSaisir` et `viewMode` restent orthogonaux (`app_v7.js:8079-8118`).
La création hors édition suit la règle de `saisieHorsEdition`
(`lib/fiche-formulaire.js:688-691`), complétée d'un réglage de couche rangé
comme `formulaire.exposes` et `formulaire.retires` dans les prefs : sans lui, un
lecteur ne pose rien. Modifier une géométrie hors édition reste fermé : un
relevé de terrain ajoute des objets, il ne déplace pas ceux des autres.

Le mode lecture n'écrit jamais, pas même pour créer une table ou une colonne
(`CADRAGE-IDENTITE-ACL.md` §6).

### 4.3 L'application (hors widget)

- L'application pose un `grist` de même forme, adossé au client REST
  (`lib/grist-adapter.js:38-76`) : `applyUserActions` part en `POST /apply`
  (`lib/data-client.js:340-345`). [vérifié par lecture]
- Écrire demande la clé d'accès, donc le client HTTP natif :
  `capacites().ecriture` n'est vrai que dans l'application Capacitor
  (`lib/data-client.js:83-98`). Dans un navigateur sans application, création et
  modification ne doivent **pas** s'afficher, et `raison` dit pourquoi.
- **Table vide en REST** : `/records` d'une table sans ligne rend `[]`, et
  `recordsVersColonnes` n'en tire que `{ id: [] }` — aucune colonne
  (`data-client.js:379-390`). Une couche tout juste créée paraît donc sans
  colonnes dans l'application. Ses colonnes se lisent au schéma
  (`chargerSchema` passe par `/sql`, `data-client.js:322-337`), qui les sert.
  [vérifié par lecture ; non éprouvé]
- `getAccessToken` rend `null` (`grist-adapter.js:55`) : pas d'identifiant
  d'utilisateur, donc un « auteur » ne peut venir que d'une formule côté serveur
  (§2.1).
- Atout propre à l'application : la position. `localisationDisponible()`
  (`app_v7.js:4440`) y est vraie, et fausse dans le widget, dont l'iframe n'a pas
  la géolocalisation. « Poser un point à ma position » est une fonction de
  l'application.
- [non vérifié] : `AddTable` par `/apply` avec une clé d'éditeur ; `retValues`
  dans la réponse ; `AddRecord` depuis la fiche dans l'application (l'envoi de
  photo est prouvé, pas l'écriture de la ligne en REST).

---

## 5. Lien avec les formulaires

- Nouvel objet : §3.2. Le pont gagne un troisième mode, à côté de « sur la
  couche » (`updateRow`) et « lié » (`addRow` + référence) :

  | Mode | `editRowId` | Soumission | Injecté par Atlas |
  |---|---|---|---|
  | sur la couche | l'objet | `UpdateRecord` | — |
  | lié | absent | `AddRecord` dans la table liée | la référence `via` |
  | **création** | absent | `AddRecord` dans la table de la couche | **les cellules de géométrie** |

  Le garde d'écriture reste consulté à chaque soumission
  (`fiche-formulaire.js:848-855`), et `apresEcriture` reçoit le `rowId`.
- **Obligatoires** : le moteur ne réclame que les champs **rendus**
  (`champsDuFormulaire`, `fiche-formulaire.js:532-549`). Un obligatoire masqué
  par la scène laisse créer des objets incomplets ; le module Formulaires le
  montre déjà. En création, c'est plus grave qu'en correction : l'objet naît
  incomplet. Proposition : en mode création, un obligatoire masqué est signalé
  dans la fiche elle-même.
- Une table fraîchement créée n'a que `nom` : `Attributs` montre un seul champ.
  C'est juste — la personne compose ensuite son formulaire, et `ensure-schema`
  crée les colonnes qu'il demande.
- Recharger les formulaires après « Nouvelle couche » (`chargerFormulaires`),
  comme le fait déjà `enregistrerDansGrist` (`app_v7.js:9641`) : sans cela le
  module Formulaires affiche « Aucune table à saisir ».

---

## 6. Couches qui ne sont pas des tables Grist

Critère unique, déjà écrit : **`coucheAvecLignes(layer)`** — une `sourceTable`,
donc des lignes (`lib/grist-sync.js:144-146`). Une capacité, pas un producteur.
L'édition de géométrie en dérive, avec le type de géométrie en plus.

| Couche | Édition | Message | Chemin proposé |
|---|---|---|---|
| Table créée dans Atlas, liée, entablée (`grist-table`) | oui | — | — |
| Table `qgis2grist` décrite par le manifeste | **pas au MVP** | « Couche importée de QGIS : modification de géométrie à venir » | lot 6 : `geometry_fields` respectés, centroïdes, Z |
| Copie dans le document (`osm`, `import`, `fichier`, blob `Maquette_Layers`) | non | « Copie sans ligne Grist : enregistrez-la en table pour modifier ses objets » | « Enregistrer en table » (`peutPasserEnTable`, `lib/grist-sync.js:162-165`) |
| Couche `inline` du manifeste | non | idem | idem — `peutPasserEnTable` l'accepte, n'étant ni distante ni tabulée |
| Couche distante (`_distant`, manifeste ou scène externe) | non | « Couche distante : ses objets ne sont pas dans ce document » | aucun |
| Couche raster / `xyz` (`_raster`) | non | pas d'outil du tout | — |
| Fond de carte (bâti OpenFreeMap, IGN) | non | pas d'outil du tout | — |
| Scène externe entière (`?scene=`) | non | « Scène publiée sans document : consultation seule » | — |

Pourquoi `qgis2grist` attend le lot 6 [vérifié par lecture] :
`featureToRowUpdate` écrit des colonnes en dur (§1.3) ; les surfaces portent
des `centroid_lat/lon` écrits comme données, qui deviendraient faux ; et
`flattenCoords2D` retire le Z à l'écriture : une couche QGIS en 3D perdrait ses
altitudes au premier sommet déplacé, sans message.

Le **trajet de récit** n'est pas une couche : il vit dans `state.trace` de
chaque étape d'`Atlas_Story` (`CLAUDE.md`, « Récit »), et `lib/trajet.js` n'en
connaît que la copie d'une ligne existante (`copieLineaire`). Le tracer à la
main réutilise l'outil et la validation du lot 0 (type `LineString`) ; sa
destination est l'étape, pas une ligne de table. Aucune action Grist propre :
l'écriture est celle du récit (une transaction, débounce de 400 ms).

---

## 7. Lots

Chaque lot est livrable seul et laisse l'existant intact. Tests :
`node --test projects/Atlas/tests/*.test.js`. Épreuve en Grist réel : document
de non-régression, widget servi en https local (méthode de `CLAUDE.md`, « Ce que
seul un vrai document révèle »), plus une session simulée en lecteur
(`aclAsUser_`).

### Lot 0 — Une seule règle de géométrie (pur, sans interface)

**Livre** `lib/geometrie-saisie.js`, et y ramène les lecteurs et l'écrivain :

- `lireGeometrie(ligne, geometryColumn)` — **une** lecture pour les deux
  chemins : cellules vides et `(0,0)` écartées, `Feature` dépliée, Z retiré ;
  `tableToGeoJSON` et `rowToFeature` l'appellent.
- `normaliserGeometrie(geom, type)` — 2D, 7 décimales, doublons consécutifs
  fusionnés, anneau fermé et réorienté.
- `validerGeometrie(geom, type)` → `{ ok, erreurs: [{ code, message }] }` —
  bornes, nombre de sommets, aire et longueur non nulles, auto-intersection,
  type conforme à la couche, taille.
- `cellulesGeometrie(geom, geometryColumn)` — `{latitude, longitude}` ou
  `{geometry_json}` selon la couche.
- `featureToRowUpdate` passe par `cellulesGeometrie` et `layer.geometryColumn`
  (corrige les trois défauts du §1.3).

**Tests** `tests/geometrie-saisie.test.js` : ligne vide en table lat/lon → pas
d'objet ; `(0,0)` → pas d'objet ; `Feature` dépliée ; arrondi à 7 décimales ;
anneau ouvert refermé ; anneau en huit refusé (`auto-intersection`) ; double
sommet final fusionné ; triangle aplati refusé ; `LineString` refusée dans une
couche `Polygon` ; point rangé en `geometry_json` réécrit en `geometry_json` ;
table `latitude2` écrite en `latitude2`. Étendre `tests/geometry-fields.test.js`
et `tests/geo-tables-scan.test.js` sans les affaiblir.

**Acceptation en Grist réel** : non-régression seule — les scènes de référence
(Bee Farming, `Atlas_Arbres`) s'affichent à l'identique, même nombre d'objets
par couche ; une ligne sans coordonnées ajoutée à la main dans une table lat/lon
ne fait plus apparaître de point en `(0,0)`.

### Lot 1 — « Nouvelle couche »

**Livre** `lib/nouvelle-couche.js` (pur) et son entrée dans le module Couches :
nom + type (Point / Ligne / Surface), transaction du §2.5, couche vide montée,
formulaires rechargés.

- `nomTableLibre(nom, tables)` — translittération, noms réservés, suffixe.
- `colonnesNouvelleCouche(type)` — schéma du §2.1.
- `actionsNouvelleCouche({ nom, type, tables, prefs })` — le paquet d'actions.
- `lireCreation(retValues, attendu)` — nom réel, `gristId`, `_prefRowId`.
- `natureRefus(erreur)` — structure / création / mise à jour / colonne / autre.

**Tests** `tests/nouvelle-couche.test.js` : « Éclairage » → `Eclairage` ;
« Story » refusé ou renommé ; collision → `Arbres_2` ; Point → `latitude` et
`longitude` en `Numeric` ; Surface → `geometry_json` en `Text` ;
`Maquette_Layers` absente → son `AddTable` est dans le **même** paquet ; aucune
colonne de `COLONNES_ATLAS` ; `natureRefus` sur les libellés réels de Grist.

**Acceptation en Grist réel** :
1. En éditeur : « Arbres essai », Point → dans « Données brutes », une table
   `Arbres_essai`, colonnes `nom` / `latitude` / `longitude` **déjà typées et
   libellées** (tranche le §2.3) ; une ligne dans `Maquette_Layers` avec
   `GeomType` = `Point` et le `_binding` ; une ligne dans `Atlas_LayerPrefs`.
2. Recharger le widget → la couche est là, vide, de type Point.
3. En lecteur simulé → pas de bouton.
4. En éditeur privé de structure → refus nommé, **la session reste en
   édition**, et la fiche d'un objet existant s'enregistre toujours.

### Lot 2 — Créer un point, et sa fiche

**Livre** l'outil « Nouvel objet » pour les couches Point, le pont en mode
création, l'insertion locale et la resélection par `_row_id`, la suspension du
minuteur pendant le geste.

**Tests** (`tests/fiche-formulaire.test.js`, faux `docApi` comme les tests
existants) : le pont de création n'a pas d'`editRowId` ; `addRow` écrit **un**
`AddRecord` qui porte données et cellules ; le garde est consulté à la
soumission ; `apresEcriture` reçoit le `rowId`. `rangsDepuisRowIds` après ajout
et retrait. `actionInverse(AddRecord)` = `RemoveRecord`.

**Acceptation** : clic sur la carte → fiche → Enregistrer → **une** ligne,
coordonnées à 7 décimales, attributs saisis ; un obligatoire vide bloque l'envoi
et rien n'est écrit ; Annuler → zéro ligne ; l'objet reste sélectionné après
l'ajout ; annuler l'ajout → la ligne disparaît ; au rechargement, le point est à
sa place.

### Lot 3 — Lignes et surfaces

**Livre** le tracé multi-sommets (fin par double-clic ou bouton, retrait du
dernier sommet), les messages de validation, l'écriture `geometry_json`.

**Tests** : les cas de validation du lot 0 appliqués au tracé ; un tracé de
3 clics en couche Surface donne un anneau fermé de 4 positions.

**Acceptation** : surface de 5 sommets → `geometry_json` fermé, 2D, 7 décimales,
relu à l'identique ; tracé en huit refusé avec son motif ; l'outil Ligne
n'existe pas sur une couche Surface ; la surface s'affiche en volume sans
triangle parasite.

### Lot 4 — Modifier la géométrie

**Livre** le déplacement d'un point ; le déplacement, l'ajout et le retrait de
sommets ; l'annulation de la dernière modification ; la vérification de
conflit ; la correction de `mergeFeatureOverrides` (§3.5).

**Tests** : `actionInverse(UpdateRecord)` rend les cellules d'origine
**exactes** (même chaîne) ; `geometrieAChange` ; `mergeFeatureOverrides` ne
ressuscite plus un attribut vidé.

**Acceptation** : un sommet déplacé → dans « Données brutes », seule
`geometry_json` a changé ; Annuler → la chaîne d'origine, caractère pour
caractère ; deux sessions sur le même objet → la seconde est avertie au lieu
d'écraser ; en lecteur simulé → aucune poignée.

### Lot 5 — Supprimer

**Livre** la suppression, avec une confirmation qui compte les relevés
rattachés.

**Tests** : `messageSuppression({ liees })` — 0, 1, n relevés, plusieurs
tables ; retrait local par `_row_id`.

**Acceptation** : un bâtiment avec deux visites → le message les annonce ;
après suppression, constater (et consigner dans ce dossier) ce que Grist fait
des deux `Ref` (§3.4) ; refus d'ACL de suppression → message, couche toujours
éditable pour le reste.

### Lot 6 — Couches `qgis2grist`

**Livre** l'ouverture de l'édition aux tables du manifeste : colonnes de
`geometry_fields`, centroïdes recalculés dans le même `UpdateRecord` quand la
table les porte, avertissement quand la source a du Z.

**Tests** : table `latitude2` ; surface avec `centroid_lat/lon` → les trois
cellules dans une seule action ; géométrie 3D → avertissement, pas d'écriture
silencieuse.

**Acceptation** : sur la scène Bee Farming, un point déplacé → `latitude` et
`longitude` justes ; la table reste relisible par qgis2grist et QGIS.

### Lot 7 — Création hors édition, et application

**Livre** le réglage de couche « création ouverte en terrain », l'outil en mode
lecture quand il est posé, « à ma position » dans l'application, le masquage
motivé quand `capacites().ecriture` est faux.

**Tests** : `creationHorsEdition({ view, peutEcrire, reglage, formulaires, moteur })`
sur le modèle de `saisieHorsEdition` ; colonnes d'une table vide lues au schéma
en REST.

**Acceptation** : lien de terrain (`?mode=view`) → la pastille « Relevé »
propose « Nouvel objet » sur la seule couche ouverte ; dans l'application avec
clé → point posé à la position GPS, ligne créée ; dans un navigateur sans
application → pas d'outil, raison affichée.

### Lot 8 — Tracer un trajet de récit

**Livre** l'outil Ligne du lot 3 branché sur `STATE.trajet` / `state.trace`, au
lieu d'une table.

**Tests** : `tests/trajet.test.js` étendu — une ligne tracée passe par
`normaliserGeometrie` et donne les mêmes abscisses qu'une ligne copiée.

**Acceptation** : tracer, capturer une étape → la ligne d'`Atlas_Story` porte
`state.trace` ; aucune table créée ; la lecture du récit longe le tracé.

---

## 8. Vérification des affirmations de la session précédente

| Affirmation | Verdict |
|---|---|
| « L'écriture `geometry_json` / lat-lon via `saveFeatureToSource` existe » | **En partie.** Le code existe (`lib/grist-sync.js:297-312`), mais il n'est appelé que pour `qgis2grist` (`app_v7.js:10223`), aucune interface ne modifie une géométrie, et il écrit des noms de colonnes figés (§1.3) |
| « Nouvelle couche devrait créer une table `geometry_json` à la façon d'`entableLayer` » | **À corriger** : lat/lon pour les points ; transaction unique avec l'inventaire ; pas de préfixe `Atlas_` ; type déclaré dans l'inventaire (§2) |
| « Nouvel objet = dessiner → `AddRecord` → fiche » | **Inverser les deux derniers temps** : dessiner → fiche → un seul `AddRecord` (§3.2) ; l'ordre proposé reste le repli sans moteur |
| « MVP Point / Ligne / Polygone simples » | **Oui**, couche mono-type, sans multi-géométrie ni trou |

## 9. Points à trancher en Grist réel avant le lot 1

1. Forme `{ id, fields }` ou plate dans `AddTable` (§2.3).
2. `AddTable` crée-t-il une page ? (§2.5)
3. Libellé exact d'un refus de structure, et règle qui laisse la structure aux
   éditeurs (§4.1).
4. `retValues` dans la réponse de `POST /apply` (§3.1, §4.3).
5. Sort des `Ref` après `RemoveRecord` (§3.4), et annulation Grist d'une action
   venue d'un widget (§3.6).

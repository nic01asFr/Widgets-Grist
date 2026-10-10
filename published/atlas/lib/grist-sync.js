/**
 * Synchronisation Grist ↔ Atlas v7 (tables source qgis2grist).
 */
import {
  fetchTableToRows,
  rowsToGeoJSON,
  configLayerMeta,
  resolveSceneGeometryType,
} from './grist-rows.js?v=1.16.4';
import {
  layerPrefsPayload,
  applyLayerPrefsBinding,
} from './manifest-binding.js?v=1.16.4';
import { parseGristBool } from './grist-bool.js';
import { COLONNES_INTERNES_GRIST } from './grist-rows.js?v=1.16.4';
import { isModelLayer } from './model-layer.js?v=1.16.4';
import { parametresDObjetValides } from './parametres-objet.js?v=1.16.4';
import { colonnesGeometrie, nomsColonnesGeometrie, cellulesGeometrie } from './geometrie-saisie.js?v=1.16.4';
import {
  manifestGeometryType,
  atlasGeomToBridge,
  primaryColorFromDeclarative,
  colorFnFromDeclarative,
  syncFeatureColorsFromSymbolization,
} from './declarative-style.js?v=1.16.4';

export const ATLAS_PREFS_TABLE = 'Atlas_LayerPrefs';

export const ATLAS_PREFS_SCHEMA = [
  { id: 'source_table', label: 'Table source', type: 'Text' },
  { id: 'StyleJSON', label: 'Style Atlas (JSON)', type: 'Text' },
  { id: 'Visible', label: 'Visible', type: 'Bool' },
  { id: 'UpdatedAt', label: 'Mis à jour', type: 'DateTime' },
];

const SKIP_PROPS = new Set([
  ...COLONNES_INTERNES_GRIST,
  '_row_id', '_fill_color', '_visible', '_fill_opacity', '_line_opacity', '_idx',
  '_scale', '_rotationX', '_rotationY', '_rotationZ', '_offsetX', '_offsetY', '_offsetZ', '_modelId', '_params',
]);

const ATLAS_3D_COL = 'atlas_3d_json';

/** Couche fond carto (buildings, lines…) — masquée par défaut. */
export function isBasemapLayer(ml, featureCount) {
  const profile = ml?.profile || 'A';
  if (profile === 'B' || profile === 'C') return true;
  const name = String(ml?.name || ml?.id || '').toLowerCase();
  if (/^(buildings|landscape|lines|batiments|bati|osm_|fond_)/.test(name)) return true;
  if (/building|landscape|landcover/.test(name) && featureCount > 200) return true;
  if (featureCount > 2500) return true;
  return false;
}

export function defaultLayerVisible(ml, featureCount) {
  if (ml?.visibility?.defaultVisible === true) return true;
  if (ml?.visibility?.defaultVisible === false) return false;
  return !isBasemapLayer(ml, featureCount);
}

export { parseGristBool } from './grist-bool.js';

export async function ensureAtlasPrefsTable(docApi, opts = {}) {
  if (opts.viewMode) return;
  const tables = await docApi.listTables();
  if (tables.includes(ATLAS_PREFS_TABLE)) return;
  await docApi.applyUserActions([['AddTable', ATLAS_PREFS_TABLE, ATLAS_PREFS_SCHEMA]]);
}

/** Map source_table → { style, visible, prefRowId } */
export async function loadLayerPrefs(docApi) {
  const out = new Map();
  try {
    const tables = await docApi.listTables();
    if (!tables.includes(ATLAS_PREFS_TABLE)) return out;
    const rec = await docApi.fetchTable(ATLAS_PREFS_TABLE);
    const ids = rec.id || [];
    for (let i = 0; i < ids.length; i++) {
      const key = rec.source_table?.[i];
      if (!key) continue;
      let style = null;
      try { style = JSON.parse(rec.StyleJSON?.[i] || 'null'); } catch (_) { style = null; }
      out.set(key, {
        prefRowId: ids[i],
        style,
        visible: parseGristBool(rec.Visible?.[i], true),
      });
    }
  } catch (e) {
    console.warn('[Atlas sync] loadLayerPrefs', e.message);
  }
  return out;
}

export function applyLayerPrefs(layer, prefsMap) {
  // Meme cle qu'a l'ecriture : les deux sens vont ensemble, sinon on ecrit
  // d'un cote et on lit de l'autre — le pont rompu de skills/echecs-silencieux.
  const p = prefsMap?.get(clePrefsCouche(layer));
  if (!p) return;
  applyLayerPrefsBinding(layer, p);
}

/**
 * La cle sous laquelle s'enregistre l'apparence d'une couche — ou `null` si
 * elle ne se range pas la.
 *
 * Le bon critere de tri n'est pas « d'ou viennent les donnees » mais **« que
 * faut-il enregistrer »** :
 *
 * | Table | Contenu | Pour quelles couches |
 * |---|---|---|
 * | `Atlas_LayerPrefs` | style + visibilite, **aucune geometrie** | celles que le manifeste du document decrit deja |
 * | `Maquette_Layers` | style **et entites** | celles qu'Atlas detient et dont il est seul depositaire |
 *
 * Une couche portee par le manifeste — table, `inline` ou distante — releve de
 * la premiere : le manifeste tient la donnee, les prefs tiennent l'apparence.
 * Une couche qui n'a de cle nulle part n'est decrite par rien : elle doit
 * emporter ses entites, donc aller dans `Maquette_Layers`.
 *
 * `sourceTable` d'abord, pour ne pas perdre les prefs deja ecrites sous ce nom.
 * Sinon `manifestLayerId`, l'`id` que le producteur a fixe dans le manifeste,
 * **stable par construction**.
 *
 * > **Jamais l'URL comme cle.** Elle change quand un jeton expire, et les
 * > preferences seraient perdues au renouvellement, sans que rien ne le dise.
 */
export function clePrefsCouche(layer) {
  return layer?.sourceTable || layer?.manifestLayerId || null;
}

/**
 * Les objets de cette couche sont-ils des lignes qu'on peut mettre a jour ?
 *
 * `saveFeatureToSource` n'a besoin que de deux choses : une `sourceTable`, et un
 * `_row_id` sur l'entite. Elle ne regarde jamais `layer.source`.
 *
 * > **Le test posait pourtant `source === 'qgis2grist'`.** Une couche entablee
 * > par `entableLayer` porte `source: 'grist-table'` : elle a une table, chaque
 * > objet a sa ligne, et la fiche restait quand meme en lecture seule. On venait
 * > d'enregistrer les entites dans Grist, et Atlas repondait encore « les objets
 * > de cette couche ne sont pas des lignes Grist ». Meme pont rompu que
 * > `clePrefsCouche` : la condition nommait un producteur la ou il fallait
 * > nommer une capacite.
 */
export function coucheAvecLignes(layer) {
  return !!layer?.sourceTable;
}

/**
 * Peut-on proposer « Enregistrer en table Grist » sur cette couche ?
 *
 * Seulement pour une **copie** : des entités détenues par Atlas, sans table
 * derrière. Le bouton testait `kind === 'table'`, que seules les couches
 * enregistrées ou liées depuis Atlas portent — une table décrite par le
 * manifeste ne l'a pas. Sur « Bâtiments (table du document) », le panneau
 * disait donc à la fois « table », « Saisir sur les objets · 4 formulaires » et
 * « Copie dans le document : ses objets n'ont pas de ligne Grist ». Constaté le
 * 16/09/2026. Le critère est celui de la fiche : `coucheAvecLignes`.
 *
 * @param {object} layer
 * @param {{lecture?: boolean, grist?: boolean}} [contexte]
 */
export function peutPasserEnTable(layer, { lecture = false, grist = true } = {}) {
  const n = layer?.geojson?.features?.length || 0;
  return !lecture && !!grist && !!layer && !coucheAvecLignes(layer) && !layer._distant && n > 0;
}

/**
 * Faut-il a cette couche une ligne d'inventaire dans `Maquette_Layers` ?
 *
 * `clePrefsCouche` range l'apparence de toute couche portee par une table dans
 * `Atlas_LayerPrefs`, parce que « le manifeste tient la donnee ». Mais une
 * table **que le manifeste ne decrit pas** — enregistree depuis Atlas, ou liee
 * par « Table » — n'est tenue par rien : elle disparaissait au rechargement.
 * Constate le 11/09/2026 dans un document vide.
 *
 * Le critere est donc « le manifeste la decrit-il ? » (`manifestLayerId`), et
 * pas le mode du document. Un document qgis2grist porte aussi des couches
 * ajoutees a la main ; les exclure parce qu'il a un manifeste les faisait
 * perdre au rechargement — l'incoherence la plus grave des deux persistances.
 *
 * La ligne dit seulement que la scene contient cette table, et sous quel nom ;
 * les entites restent dans la table, l'apparence dans les prefs.
 *
 * @param {object} layer
 */
export function ligneInventaireRequise(layer) {
  return layer?.kind === 'table'
    && !!layer?.sourceTable
    && !layer?.manifestLayerId;
}

/**
 * La ligne d'inventaire : de quoi retrouver la couche, **jamais ses entites**.
 *
 * Une copie des entites a cote de la table serait perimee des la premiere
 * saisie, et rien ne la relirait jamais.
 */
export function ligneInventaire(layer) {
  const style = { ...(layer?.style || {}) };
  if (layer?.controls?.length) style._controls = layer.controls;
  style._binding = {
    kind: 'table',
    sourceTable: layer?.sourceTable,
    geometryColumn: layer?.geometryColumn || 'geometry_json',
  };
  return {
    Name: layer?.name || layer?.sourceTable,
    Color: layer?.color,
    Visible: layer?.visible !== false,
    GeomType: layer?.geometryType,
    StyleJSON: JSON.stringify(style),
    GeoJSON: '{}',
  };
}

/** La ligne d'`Atlas_LayerPrefs` d'une couche : apparence, visibilité, date. */
export function lignePrefs(layer, maintenant = Date.now()) {
  return {
    source_table: clePrefsCouche(layer),
    StyleJSON: JSON.stringify(layerPrefsPayload(layer)),
    Visible: layer.visible !== false,
    UpdatedAt: Math.floor(maintenant / 1000),
  };
}

/**
 * Les écritures de préférences se font UNE À LA FOIS.
 *
 * N appels rapprochés (`toggleAllLayers` en lance un par couche) lisaient tous
 * « la table n'existe pas » avant que le premier l'ait créée : Grist créait
 * `Atlas_LayerPrefs`, `Atlas_LayerPrefs2`, … Deux appels sur la même couche
 * ajoutaient deux lignes avant que le premier ait rendu son identifiant. Relevé
 * à la relecture du 02/10/2026. La file continue après un échec ; l'appelant,
 * lui, reçoit l'erreur.
 */
let _fileEcrituresPrefs = Promise.resolve();

export function saveLayerPref(docApi, layer, opts = {}) {
  const tache = _fileEcrituresPrefs.then(() => ecrirePref(docApi, layer, opts));
  _fileEcrituresPrefs = tache.catch(() => {});
  return tache;
}

async function ecrirePref(docApi, layer, opts = {}) {
  if (opts.viewMode) return;
  const cle = clePrefsCouche(layer);
  if (!cle) return;
  await ensureAtlasPrefsTable(docApi, opts);
  const data = lignePrefs(layer);
  if (layer._prefRowId) {
    await docApi.applyUserActions([['UpdateRecord', ATLAS_PREFS_TABLE, layer._prefRowId, data]]);
  } else {
    const r = await docApi.applyUserActions([['AddRecord', ATLAS_PREFS_TABLE, null, data]]);
    layer._prefRowId = r.retValues?.[0];
  }
}

/** Préserve overrides 3D / édition locale lors d'un refresh. */
export function mergeFeatureOverrides(oldGeojson, newGeojson) {
  const byRow = new Map();
  for (const f of (oldGeojson?.features || [])) {
    const id = f.properties?._row_id;
    if (id != null) byRow.set(id, f.properties);
  }
  for (const f of (newGeojson?.features || [])) {
    const id = f.properties?._row_id;
    const old = id != null ? byRow.get(id) : null;
    if (!old) continue;
    for (const k of Object.keys(old)) {
      // `_l_<champ>` vient de la table, comme le champ lui-même : l'ancienne
      // liste écraserait la nouvelle au rafraîchissement.
      if (k.startsWith('_') && k !== '_row_id' && k !== '_fill_color' && !k.startsWith('_l_')) {
        f.properties[k] = old[k];
      }
    }
    for (const [k, v] of Object.entries(old)) {
      if (!SKIP_PROPS.has(k) && !k.startsWith('_') && f.properties[k] === undefined) {
        f.properties[k] = v;
      }
    }
  }
  return newGeojson;
}

function geometryKindFromType(geomType) {
  if (!geomType) return null;
  if (geomType === 'Point' || geomType === 'MultiPoint') return 'Point';
  if (geomType === 'LineString' || geomType === 'MultiLineString') return 'LineString';
  return 'Polygon';
}

function declaredLayerGeometryKind(layer) {
  return geometryKindFromType(layer.geometryType) || 'Polygon';
}

/**
 * Les colonnes qu'une écriture peut viser, pour une table.
 *
 * Le schéma du document fait foi : il connaît les colonnes vides partout, et
 * il dit lesquelles sont des formules — y écrire serait refusé par Grist. Sans
 * schéma (lecture qui a échoué), les colonnes qu'on a lues, qui existent au
 * moins. Les colonnes de Grist lui-même n'en sont jamais.
 *
 * @param {Array<{colId: string, isFormula?: boolean}>} [colonnesSchema]
 * @param {string[]} [repli] noms connus par la lecture
 * @returns {string[]}
 */
export function colonnesEcrivables(colonnesSchema, repli = []) {
  const internes = new Set(COLONNES_INTERNES_GRIST);
  if (Array.isArray(colonnesSchema) && colonnesSchema.length) {
    return colonnesSchema
      .filter((c) => c?.colId && !c.isFormula && !internes.has(c.colId))
      .map((c) => c.colId);
  }
  return [...new Set(repli || [])].filter((k) => k && !internes.has(k));
}

export function featureToRowUpdate(feature, layer) {
  const props = feature?.properties || {};
  const rowId = props._row_id;
  if (!rowId) return null;

  const update = {};
  const gristCols = layer._gristColumns || [];
  const colSet = new Set(gristCols);

  // Les colonnes où vit la géométrie de CETTE couche : manifeste, colonne
  // retenue à la lecture, ou convention. Elles ne sont jamais des attributs.
  const colonnes = colonnesGeometrie(layer);
  const horsAttributs = new Set(['geometry_json', 'latitude', 'longitude', ...nomsColonnesGeometrie(colonnes)]);
  const fieldNames = (layer._fields || []).map((f) => f.name).filter(Boolean);
  const editable = fieldNames.length
    ? fieldNames.filter((n) => !SKIP_PROPS.has(n) && !horsAttributs.has(n))
    : Object.keys(props).filter((k) => !k.startsWith('_') && !SKIP_PROPS.has(k) && !horsAttributs.has(k));

  for (const name of editable) {
    if (props[name] === undefined) continue;
    if (gristCols.length && !colSet.has(name)) continue;
    // Une liste se réécrit dans son codage Grist. Le texte « a, b » qui la
    // rend lisible sur la carte, écrit tel quel, remplacerait les choix par
    // une seule valeur inconnue.
    const liste = props[`_l_${name}`];
    update[name] = Array.isArray(liste) ? ['L', ...liste] : props[name];
  }

  const geom = feature.geometry;
  const featKind = geometryKindFromType(geom?.type);
  const layerKind = declaredLayerGeometryKind(layer);

  // Garde-fou : ne jamais écraser geometry_json d'une couche polygone/ligne
  // avec un Point issu d'une mauvaise lecture (cfg QgisWidgets Point + lat/lon).
  if (featKind && layerKind !== 'Point' && featKind === 'Point') {
    /* attributs seulement */
  } else if (featKind && featKind === layerKind) {
    // Dans les colonnes réelles de la couche : un point rangé en
    // `geometry_json` y retourne, une source suffixée (`latitude2`) garde les
    // siennes. Écrit en dur, `latitude`/`longitude` visait des colonnes
    // absentes — ou pire, des attributs homonymes de la source.
    const cellules = cellulesGeometrie(geom, colonnes) || {};
    for (const [col, v] of Object.entries(cellules)) {
      if (!gristCols.length || colSet.has(col)) update[col] = v;
    }
  }

  if (props._fill_color && (!gristCols.length || colSet.has('fill_color'))) {
    update.fill_color = props._fill_color;
  }

  // Placement 3D : n'a de sens que pour une couche rendue en modèles. Sans cette
  // garde, des surcharges héritées — ou une couche ayant changé de mode —
  // écriraient des transformations 3D sur des objets qui ne seront jamais rendus
  // ainsi, salissant la table de l'utilisateur.
  // Le placement et les réglages d'objet dont la table n'a pas (encore) la colonne technique d'Atlas.
  let colonne3dManquante = null;
  if (isModelLayer(layer)) {
    const atlas3d = {};
    for (const k of ['scale', 'rotationX', 'rotationY', 'rotationZ', 'offsetX', 'offsetY', 'offsetZ', 'modelId']) {
      const v = props['_' + k];
      if (v != null && v !== '') atlas3d[k] = v;
    }
    // Les réglages d'objet (puissance, hauteur de feu…) voyagent avec le placement : même colonne,
    // même garde. Ils ne deviennent jamais des colonnes de la table de l'équipe.
    const params = parametresDObjetValides(props._params);
    if (params) atlas3d.params = params;
    if (Object.keys(atlas3d).length) {
      if (!gristCols.length || colSet.has(ATLAS_3D_COL)) update[ATLAS_3D_COL] = JSON.stringify(atlas3d);
      // Sans la colonne, le placement et les réglages étaient perdus en silence : « Enregistré » ne
      // disait pas que rien n'avait été écrit. `saveFeatureToSource` la crée, et le dit.
      else colonne3dManquante = JSON.stringify(atlas3d);
    }
  }

  if (!Object.keys(update).length && !colonne3dManquante) return null;
  return colonne3dManquante ? { rowId, update, colonne3dManquante } : { rowId, update };
}

/**
 * S'assure que la table a la colonne technique d'Atlas (`atlas_3d_json`), ou dit qu'on ne peut pas.
 *
 * Elle porte le placement 3D et les réglages d'un objet. Atlas la crée **au premier besoin** — le premier
 * réglage d'un objet, ou à défaut son enregistrement — et non à l'ouverture : tout le monde n'a pas le
 * droit de modifier la structure, et une table qu'on se contente d'afficher n'a pas à changer.
 *
 * Deux choses que Grist fait, et qu'il faut tenir (mesuré le 02/10/2026) :
 * - il ne REFUSE PAS un doublon : ajouter « atlas_3d_json » à une table qui l'a déjà crée
 *   « atlas_3d_json2 » et le dit dans sa réponse. Si Atlas ne savait pas que la colonne existait (liste
 *   périmée, ajoutée depuis par quelqu'un d'autre), la colonne parasite est retirée ;
 * - ajouter une colonne est une modification de STRUCTURE : un document partagé en saisie seule la refuse.
 *
 * @param {{applyUserActions: Function}} docApi
 * @param {{sourceTable: string, _gristColumns?: string[]}} layer
 * @param {Iterable<string>} [connues] les colonnes que la table porte, d'après ce qu'Atlas en sait
 * @returns {Promise<{ etat: 'presente' | 'creee' | 'refusee' | 'inconnue', message?: string }>}
 *   `inconnue` : Atlas ne sait pas quelles colonnes la table porte — il n'y touche pas.
 */
export async function assurerColonneAtlas3d(docApi, layer, connues = layer?._gristColumns) {
  const noms = new Set(connues || []);
  if (!noms.size) return { etat: 'inconnue' };
  if (noms.has(ATLAS_3D_COL)) return { etat: 'presente' };
  let creee;
  try {
    const r = await docApi.applyUserActions([['AddColumn', layer.sourceTable, ATLAS_3D_COL, { type: 'Text', label: 'Atlas 3D (JSON)' }]]);
    const retours = Array.isArray(r) ? r : r?.retValues;
    creee = retours?.[0]?.colId;
  } catch (e) {
    // Sans réseau, ce n'est pas un refus de droits : on ne sait simplement pas, et on réessaiera.
    if (e?.horsReseau) return { etat: 'inconnue' };
    return { etat: 'refusee', message: String(e?.message || e) };
  }
  if (Array.isArray(layer._gristColumns) && !layer._gristColumns.includes(ATLAS_3D_COL)) layer._gristColumns.push(ATLAS_3D_COL);
  if (creee && creee !== ATLAS_3D_COL) {
    try { await docApi.applyUserActions([['RemoveColumn', layer.sourceTable, creee]]); } catch (_) { /* colonne parasite : au pire elle reste vide */ }
    return { etat: 'presente' };
  }
  return { etat: 'creee' };
}

export async function saveFeatureToSource(docApi, layer, featureIndex) {
  const f = layer.geojson?.features?.[featureIndex];
  const payload = featureToRowUpdate(f, layer);
  if (!payload) return false;
  if (payload.colonne3dManquante) {
    const r = await assurerColonneAtlas3d(docApi, layer);
    if (r.etat === 'creee') layer.colonne3dCreee = true;
    if (r.etat === 'creee' || r.etat === 'presente') {
      payload.update[ATLAS_3D_COL] = payload.colonne3dManquante;
    } else if (r.etat === 'refusee') {
      // Le reste de la ligne s'écrit quand même ; le placement et les réglages, non — et on le dit.
      layer.colonne3dRefusee = r.message;
    }
  }
  if (!Object.keys(payload.update).length) return false;
  await docApi.applyUserActions([
    ['UpdateRecord', layer.sourceTable, payload.rowId, payload.update],
  ]);
  return true;
}

export async function saveFeaturesToSource(docApi, layer, featureIndices) {
  let n = 0;
  for (const idx of featureIndices) {
    if (await saveFeatureToSource(docApi, layer, idx)) n++;
  }
  return n;
}

/** Recharge une couche depuis sa table Grist source. */
export async function refreshLayerFromTable(docApi, layer, widgetConfig, manifestLayer) {
  if (!layer.sourceTable) return false;
  const tableName = layer.sourceTable;
  const colData = await docApi.fetchTable(tableName);
  layer._gristColumns = Object.keys(colData).filter((k) => k !== 'id');

  const cfgLayer = configLayerMeta(widgetConfig, tableName);
  const ml = manifestLayer || { geometry_type: layer.geometryType, style: { declarative: layer._declarative } };
  let geometryType = manifestGeometryType(ml.geometry_type || cfgLayer?.geomType);
  const declarative = layer._declarative || ml.style?.declarative || cfgLayer?.style?.declarative;
  const fallbackColor = layer.color || primaryColorFromDeclarative(declarative, '#808080');

  const layerMeta = {
    geomType: atlasGeomToBridge(geometryType),
    fields: layer._fields || cfgLayer?.fields || [],
    _color: fallbackColor,
    color: fallbackColor,
  };

  const rows = fetchTableToRows(colData);
  const colorFn = colorFnFromDeclarative(declarative, fallbackColor, layer._fields || cfgLayer?.fields || []);
  const newGeojson = rowsToGeoJSON(rows, layerMeta, colorFn);

  applyAtlas3dFromRows(rows, newGeojson);
  geometryType = resolveSceneGeometryType(
    ml.geometry_type,
    cfgLayer?.geomType,
    newGeojson,
    geometryType
  );
  layer.geometryType = geometryType;
  layer.geojson = mergeFeatureOverrides(layer.geojson, newGeojson);
  syncFeatureColorsFromSymbolization(layer);
  return true;
}

export function applyAtlas3dFromRows(rows, geojson) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const f of (geojson?.features || [])) {
    const row = byId.get(f.properties?._row_id);
    if (!row?.[ATLAS_3D_COL]) continue;
    try {
      const o = JSON.parse(row[ATLAS_3D_COL]);
      for (const [k, v] of Object.entries(o)) f.properties['_' + k] = v;
    } catch (_) { /* ignore */ }
  }
}

/**
 * Couches qu'il vaut la peine de rafraîchir périodiquement.
 *
 * Un cycle recharge la table entière, la reconvertit en GeoJSON et repeint la
 * couche. Le faire pour une couche qu'on ne voit pas coûte le volume complet
 * sans rien apporter : sur une scène d'analyse, les couches lourdes sont
 * justement celles qui sont masquées par défaut.
 */
export function layersToRefresh(layers) {
  return (layers || []).filter((l) => l?.source === 'qgis2grist'
    // Différée : pas encore convertie en GeoJSON. Elle sera chargée à jour au
    // moment où on l'allumera (materializeDeferredLayer).
    && !l._deferredLoad
    // Masquée : rien n'est peint, et l'affichage déclenche déjà un rafraîchissement.
    && l.visible !== false);
}

export function startScenePolling(opts) {
  const {
    docApi,
    getLayers,
    getWidgetConfig,
    getManifest,
    onLayerUpdated,
    // Appelé avant que la couche ne soit remplacée : ce qu'il rend est passé à
    // `onLayerUpdated`. Sert à relever ce qui ne se retrouve qu'avant — les
    // lignes sélectionnées, que la relecture renumérote.
    avantMiseAJour = () => undefined,
    intervalMs = 30000,
    isPaused = () => false,
  } = opts;

  return setInterval(async () => {
    if (isPaused()) return;
    const layers = layersToRefresh(getLayers());
    if (!layers.length) return;
    const widgetConfig = getWidgetConfig();
    const manifest = getManifest();
    const manifestByTable = new Map((manifest?.layers || []).map((ml) => [ml.source?.table || ml.id, ml]));

    for (const layer of layers) {
      try {
        const ml = manifestByTable.get(layer.sourceTable);
        const avant = avantMiseAJour(layer);
        await refreshLayerFromTable(docApi, layer, widgetConfig, ml);
        onLayerUpdated(layer, avant);
      } catch (e) {
        console.warn('[Atlas sync] refresh', layer.sourceTable, e.message);
      }
    }
  }, intervalMs);
}

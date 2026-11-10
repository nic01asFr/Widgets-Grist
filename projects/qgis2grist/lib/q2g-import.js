/**
 * Q2GImport - logique pure d'import des couches vers Grist.
 *
 * Aucune dependance au DOM ni a window. Tout ce qui est externe est injecte :
 *   - docApi  : objet compatible grist.docApi (listTables, applyUserActions, fetchTable)
 *   - schema  : Q2GSchema (sanitizeColName obligatoire ; topoSortByRefs,
 *               buildRefLookupNeeds, resolveRefType : ceux de q2g-schema.js si
 *               le schema fourni ne les expose pas ; makeMarkerColorFn optionnel)
 *   - sceneLod: Q2GSceneLod (resolveLayerLod, isTileFetchMode,
 *               fieldsForGristImport, stripGeometryFromRow)
 *
 * Les rappels d'interface (progression, fin de couche, erreur) sont des
 * parametres : l'interface reste dans la page appelante.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Q2GImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // ── Helpers Refs ────────────────────────────────────────────
  // topoSortByRefs, buildRefLookupNeeds et resolveRefType vivent dans Q2GSchema
  // (une seule implementation). Ici : simple resolution du module schema.

  function defaultSchema() {
    let s = null;
    try {
      if (typeof require === 'function') s = require('./q2g-schema.js');
    } catch (_) { s = null; }
    return s || (root && root.Q2GSchema) || {};
  }

  // Fonction de schema : celui fourni s'il l'expose, sinon le module par defaut.
  function schemaFn(schema, name) {
    const fn = (schema && schema[name]) || defaultSchema()[name];
    if (typeof fn !== 'function') throw new Error('Q2GImport : schema.' + name + ' manquant');
    return fn;
  }

  // Lectures/ecritures de proprietes PROPRES (ownGet/setOwn de Q2GSchema) : les noms de
  // tables et les valeurs de cles etrangeres viennent des fichiers importes, et un objet
  // simple repond 'constructor' ou 'toString' pour une cle absente. Resolues une fois.
  let _own = null;
  function own() {
    return _own || (_own = { get: schemaFn(null, 'ownGet'), set: schemaFn(null, 'setOwn') });
  }

  function topoSortByRefs(layers) { return schemaFn(null, 'topoSortByRefs')(layers); }
  function buildRefLookupNeeds(layers) { return schemaFn(null, 'buildRefLookupNeeds')(layers); }
  function resolveRefType(gType, refTargetTable, tableNameRemap) {
    return schemaFn(null, 'resolveRefType')(gType, refTargetTable, tableNameRemap);
  }

  // ── Conversion d'une valeur de cellule ──────────────────────

  function convertCellValue(f, v, tableNameRemap, parentMaps) {
    if (v === null || v === undefined) return null;
    // Ref / RefList : convertir FK -> rowId du parent
    if (f._refTargetTable) {
      const { get } = own();
      const actualParent = get(tableNameRemap, f._refTargetTable) || f._refTargetTable;
      const lookup = get(get(parentMaps, actualParent), f._refTargetField);
      if (!lookup) return 0; // parent non importe -> Ref vide
      if (f.gType.startsWith('RefList:')) {
        const ids = String(v).split(/[,;]/)
          .map((s) => get(lookup, s.trim()))
          .filter((id) => id != null);
        return ids.length ? ['L', ...ids] : null;
      }
      return get(lookup, String(v)) || 0;
    }
    if (f.gType === 'Int') return Number.isFinite(parseInt(v)) ? parseInt(v) : null;
    if (f.gType === 'Numeric') return Number.isFinite(parseFloat(v)) ? parseFloat(v) : null;
    if (f.gType === 'Bool') return !!v ? 1 : 0;
    // Choice (ValueMap) : valeur stockee -> libelle affiche.
    if (f.gType === 'Choice' && f._valueMap) {
      const k = String(v);
      return f._valueMap[k] || String(v);
    }
    return String(v);
  }

  // ── Reparation de la longitude des points ───────────────────

  // deps : { docApi, log } ; log = { log, warn } optionnel.
  async function repairMissingPointLon(tableName, sourceRows, colIdByFieldName, deps) {
    deps = deps || {};
    const docApi = deps.docApi || (typeof grist !== 'undefined' && grist.docApi);
    const logger = deps.logger || console;
    colIdByFieldName = colIdByFieldName || {};
    const lonKey = colIdByFieldName.longitude || 'longitude';
    const latKey = colIdByFieldName.latitude || 'latitude';
    try {
      const data = await docApi.fetchTable(tableName);
      if (!data || !data.id || !data.id.length) return;
      const ids = [];
      const lons = [];
      for (let i = 0; i < data.id.length; i++) {
        const lon = data[lonKey] ? data[lonKey][i] : undefined;
        const lat = data[latKey] ? data[latKey][i] : undefined;
        const src = sourceRows[i];
        const srcLon = src ? (src.longitude != null ? src.longitude
          : src.Longitude != null ? src.Longitude : src.lon) : undefined;
        if ((lon == null || lon === '') && lat != null && srcLon != null && Number.isFinite(parseFloat(srcLon))) {
          ids.push(data.id[i]);
          lons.push(parseFloat(srcLon));
        }
      }
      if (!ids.length) return;
      await docApi.applyUserActions([['BulkUpdateRecord', tableName, ids, { [lonKey]: lons }]]);
      logger.log('[Import] Longitude réparée sur', ids.length, 'ligne(s) —', tableName);
    } catch (e) {
      logger.warn('[Import] repairMissingPointLon', tableName, e);
    }
  }

  // ── Decoupage en lots ───────────────────────────────────────

  // Taille historique : 100 lignes avec geometrie, 500 sinon.
  function legacyBatchSize(hasGeom) { return hasGeom ? 100 : 500; }

  // Estimation (sans serialiser) du poids JSON d'une ligne dans un BulkAddRecord en
  // colonnes, apres conversion des valeurs. Elle reste PESSIMISTE (marge de 20 % sur les
  // chaines pour les echappements et les accents sur 2 octets, nombres au pire cas
  // raisonnable) : elle borne les lots, elle ne les facture pas. Utilisee seulement quand
  // batchMaxBytes est donne ; le decoupage historique ne l'appelle pas.
  const COUT_LIGNE_FIXE = 5 + 10 + 1;   // "null," (rowId), valeur fill_color "#rrggbb", virgule

  // Cout d'une chaine JSON : guillemets, virgule, marge de 20 % (echappements, UTF-8).
  function coutChaine(n) { return Math.ceil(n * 1.2) + 4; }

  // Cout d'un nombre JSON : entier court exact, sinon pire cas d'un double (17 chiffres).
  function coutNombre(v) {
    if (Number.isInteger(v)) return Math.abs(v) < 1e9 ? 11 : 18;
    return 21;
  }

  // 'texte' : champ ecrit comme chaine ; 'nombre' : Int / Numeric ; 'bool' ; 'ref' ; 'reflist'.
  function typeEstimation(f) {
    const t = String(f.gType || '');
    if (f._refTargetTable) return t.startsWith('RefList:') ? 'reflist' : 'ref';
    if (t === 'Int' || t === 'Numeric') return 'nombre';
    if (t === 'Bool') return 'bool';
    return 'texte';
  }

  /**
   * Fabrique { estimate(row), lot } pour une liste de champs importes : estimate donne le
   * poids d'une ligne, lot le surcout fixe d'un lot (noms de colonnes, enveloppe de
   * l'action) a ajouter une fois par lot.
   */
  function makeRowEstimator(fields) {
    const cols = fields.map((f) => ({ key: f.name, t: typeEstimation(f), map: f.gType === 'Choice' ? f._valueMap : null }));
    let lot = 120 + 'fill_color'.length + 6;
    for (const f of fields) lot += f.name.length + 6;
    function estimate(row) {
      let n = COUT_LIGNE_FIXE;
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        const v = row[c.key];
        if (v === null || v === undefined) { n += 5; continue; }
        switch (c.t) {
          case 'bool': n += 2; break;
          case 'ref': n += 10; break;                                    // rowId du parent
          case 'reflist': n += 14 + 10 * (1 + String(v).split(/[,;]/).length); break;
          case 'nombre': n += typeof v === 'number' ? coutNombre(v) : 22; break;
          default: {
            let t = v;
            if (c.map) { const lib = c.map[String(v)]; if (lib) t = lib; } // libelle affiche, pas le code
            if (typeof t === 'string') n += coutChaine(t.length);
            else if (typeof t === 'number') n += coutNombre(t) + 2;
            else if (typeof t === 'boolean') n += 8;
            else n += coutChaine(String(t).length);
          }
        }
      }
      return n;
    }
    return { estimate, lot };
  }

  /**
   * Decoupe [0, rows.length) en intervalles [debut, fin).
   * Sans batchMaxRows ni batchMaxBytes : taille historique (comportement inchange).
   * Avec l'un ou l'autre : un lot se ferme des qu'il atteint batchMaxRows lignes ou
   * batchMaxBytes octets estimes (au moins une ligne par lot).
   */
  function planBatches(rows, fields, hasGeom, opts) {
    const maxRows = opts && opts.batchMaxRows > 0 ? opts.batchMaxRows : 0;
    const maxBytes = opts && opts.batchMaxBytes > 0 ? opts.batchMaxBytes : 0;
    const out = [];
    if (!maxRows && !maxBytes) {
      const size = legacyBatchSize(hasGeom);
      for (let i = 0; i < rows.length; i += size) out.push([i, Math.min(i + size, rows.length)]);
      return out;
    }
    const est = maxBytes ? makeRowEstimator(fields) : null;
    let start = 0;
    let bytes = est ? est.lot : 0;
    for (let i = 0; i < rows.length; i++) {
      if (est) bytes += est.estimate(rows[i]);
      const count = i - start + 1;
      if ((maxRows && count >= maxRows) || (maxBytes && bytes >= maxBytes)) {
        out.push([start, i + 1]);
        start = i + 1;
        bytes = est ? est.lot : 0;
      }
    }
    if (start < rows.length) out.push([start, rows.length]);
    return out;
  }

  // Profil de performance recommande : a passer a importLayers par `perf: 'rapide'`
  // (les options explicites l'emportent). Plafond d'octets prudent : 700 Ko estimes,
  // soit moins de 1 Mo reel (marge de l'estimateur), la valeur usuelle des limites de
  // corps JSON. La limite reelle du canal docApi d'un Grist n'est pas mesuree.
  const PERF_RAPIDE = Object.freeze({
    batchMaxRows: 5000,
    batchMaxBytes: 700000,
    skipUselessRepairFetch: true,
  });

  /** Fusionne le profil `perf` et les options explicites (celles-ci gagnent). */
  function resolvePerfOptions(opts) {
    opts = opts || {};
    const profil = opts.perf === true || opts.perf === 'rapide' ? PERF_RAPIDE : null;
    const pick = (k) => (opts[k] !== undefined ? opts[k] : profil ? profil[k] : undefined);
    return {
      batchMaxRows: pick('batchMaxRows'),
      batchMaxBytes: pick('batchMaxBytes'),
      skipUselessRepairFetch: !!pick('skipUselessRepairFetch'),
    };
  }

  // Vrai si repairMissingPointLon peut trouver quelque chose a reparer : une
  // longitude convertie en null alors qu'une source alternative est numerique.
  // Meme regle que la reparation, sans lire la table.
  function pointLonRepairPossible(sourceRows) {
    for (const src of sourceRows) {
      if (!src || src.longitude != null) continue; // converti : non nul, ou non numerique (aucune reparation)
      const srcLon = src.Longitude != null ? src.Longitude : src.lon;
      if (srcLon != null && Number.isFinite(parseFloat(srcLon))) return true;
    }
    return false;
  }

  // ── Import d'une couche ─────────────────────────────────────

  function abortError() {
    const e = new Error('Import annulé');
    e.name = 'AbortError';
    return e;
  }

  // ctx : etat partage { opts, deps, parentMaps, tableNameRemap, refLookupNeeds }
  async function importLayer(layer, ctx) {
    const { docApi, schema, sceneLod, logger, signal } = ctx.deps;
    const { parentMaps, tableNameRemap, refLookupNeeds } = ctx;
    const progress = (pct, done, error) => ctx.onProgress(layer.name, pct, done, error);
    const checkAbort = () => { if (signal && signal.aborted) throw abortError(); };
    const resolveType = schemaFn(schema, 'resolveRefType');

    checkAbort();
    ctx.onLayerStart(layer);
    progress(10);

    let tableName = layer.name;
    try {
      // Remplacement demande : supprimer l'homonyme pour reutiliser son nom.
      if (ctx.replaceExisting) {
        const before = await docApi.listTables();
        if (before.includes(layer.name)) {
          await docApi.applyUserActions([['RemoveTable', layer.name]]);
          logger.log('[import] table remplacée:', layer.name);
        }
      }
      const existingTables = await docApi.listTables();
      let n = 0;
      while (existingTables.includes(tableName)) {
        n++;
        tableName = layer.name + '_' + n;
      }
    } catch (e) {
      // listTables echoue (tres improbable) -> tenter quand meme
    }
    own().set(tableNameRemap, layer.name, tableName);

    const importFields = sceneLod.fieldsForGristImport(layer);
    // Une Ref vers une table qui n'est pas importee (couche sans donnees, exclue) rend
    // TOUS les BulkAddRecord de la table impossibles dans Grist ("NoneType ... table_id",
    // verifie en Grist reel, meme avec des valeurs vides) : la colonne reste alors du texte
    // et garde la valeur d'origine.
    const refDegradees = new Set(importFields
      .filter((f) => f._refTargetTable && !ctx.nomsSelectionnes.has(f._refTargetTable))
      .map((f) => f.name));
    if (refDegradees.size) {
      logger.warn('[import] ' + layer.name + ' : Ref sans table cible importee, colonne gardee en texte :',
        [...refDegradees].join(', '));
    }
    const gristCols = [
      ...importFields.map((f) => {
        const type = refDegradees.has(f.name)
          ? 'Text'
          : f._refTargetTable
            ? resolveType(f.gType, f._refTargetTable, tableNameRemap)
            : f.gType;
        const col = { id: f.name, type };
        if (f.label && f.label !== f.name) col.label = f.label;
        if (f.widgetOptions) col.widgetOptions = f.widgetOptions;
        if (f.description) col.description = f.description;
        return col;
      }),
      { id: 'fill_color', type: 'Text', label: 'Couleur (auto)' },
    ];
    progress(25);

    checkAbort();
    // Grist peut renommer le tableId : capturer le nom reel.
    const addRes = await docApi.applyUserActions([['AddTable', tableName, gristCols]]);
    const addMeta = (addRes && addRes.retValues && addRes.retValues[0]) || {};
    const actualTableId = addMeta.table_id;
    if (actualTableId && actualTableId !== tableName) {
      logger.log('[AddTable] Grist a renommé', tableName, '→', actualTableId);
      tableName = actualTableId;
      own().set(tableNameRemap, layer.name, tableName);
    }
    // Grist peut renommer les colIds.
    const actualColIds = addMeta.columns;
    const colIdByFieldName = {};
    if (Array.isArray(actualColIds) && actualColIds.length >= importFields.length) {
      importFields.forEach((f, i) => {
        const actual = actualColIds[i];
        if (actual && actual !== f.name) {
          colIdByFieldName[f.name] = actual;
          logger.log('[AddTable] Colonne renommée', f.name, '→', actual);
        }
      });
      const fillActual = actualColIds[importFields.length];
      if (fillActual && fillActual !== 'fill_color') {
        colIdByFieldName.fill_color = fillActual;
      }
    }
    progress(40);

    // Insertion par lots (100 avec geometrie, 500 sinon) - capture des rowIds pour les FK.
    const rows = layer.features;
    const hasGeom = importFields.some((f) => f.name === 'geometry_json');
    const total = Math.max(rows.length, 1);
    const colorFnFactory = schema.makeMarkerColorFn || ctx.makeMarkerColorFn;
    const getMarkerColorFn = colorFnFactory
      ? colorFnFactory(layer, layer._color)
      : () => layer._color;
    const allNewRowIds = [];

    for (const [debut, fin] of planBatches(rows, importFields, hasGeom, ctx.batchOpts)) {
      checkAbort();
      const batchRaw = rows.slice(debut, fin);
      const batch = sceneLod.isTileFetchMode(layer._lod)
        ? batchRaw.map((r) => sceneLod.stripGeometryFromRow(r))
        : batchRaw;
      const colData = {};
      for (const f of importFields) {
        const rowKey = f.name;
        const colKey = colIdByFieldName[rowKey] || rowKey;
        colData[colKey] = refDegradees.has(f.name)
          ? batch.map((r) => (r[rowKey] === null || r[rowKey] === undefined ? null : String(r[rowKey])))
          : batch.map((r) => convertCellValue(f, r[rowKey], tableNameRemap, parentMaps));
      }
      colData[colIdByFieldName.fill_color || 'fill_color'] = batch.map((r) => getMarkerColorFn(r));

      const result = await docApi.applyUserActions([[
        'BulkAddRecord', tableName,
        Array(batch.length).fill(null),
        colData,
      ]]);
      const batchIds = (result && result.retValues && result.retValues[0]) || [];
      for (let k = 0; k < batchIds.length; k++) allNewRowIds.push(batchIds[k]);

      progress(Math.round(40 + fin / total * 55));
    }

    for (const f of importFields) {
      const mapped = colIdByFieldName[f.name];
      if (mapped) f.name = mapped;
    }

    // Colonnes geometriques effectives (collision de noms -> suffixe par Grist).
    const geomColId = (canonical) => colIdByFieldName[canonical] || canonical;
    layer._geometryCols = layer.geomType === 'Point'
      ? { lat: geomColId('latitude'), lon: geomColId('longitude') }
      : {
          geojson: geomColId('geometry_json'),
          lat: geomColId('centroid_lat'),
          lon: geomColId('centroid_lon'),
        };
    layer._fillColorCol = colIdByFieldName.fill_color || 'fill_color';
    const renamedGeom = Object.entries(layer._geometryCols)
      .filter(([k, v]) => v !== (k === 'geojson' ? 'geometry_json'
        : layer.geomType === 'Point' ? (k === 'lat' ? 'latitude' : 'longitude')
        : (k === 'lat' ? 'centroid_lat' : 'centroid_lon')));
    if (renamedGeom.length) {
      logger.warn(
        `[import] ${tableName} : collision de noms, géométrie stockée dans`,
        Object.fromEntries(renamedGeom)
      );
    }

    if (layer.geomType === 'Point' && !(ctx.skipUselessRepairFetch && !pointLonRepairPossible(rows))) {
      await repairMissingPointLon(tableName, rows, colIdByFieldName, { docApi, logger });
    }

    // Indexer les valeurs des champs references par d'autres couches.
    // Dictionnaires sans prototype : une valeur de cle 'constructor' ou '__proto__' est une
    // cle comme une autre (sinon lookup['constructor'] renvoie Object et la Ref devient une fonction).
    const needsForThis = own().get(refLookupNeeds, layer.name);
    if (needsForThis && needsForThis.size && allNewRowIds.length === rows.length) {
      const parentMap = own().get(parentMaps, tableName) || own().set(parentMaps, tableName, Object.create(null));
      for (const refField of needsForThis) {
        const sanField = schema.sanitizeColName(refField);
        const map = Object.create(null);
        rows.forEach((row, i) => {
          const val = row[sanField];
          const rid = allNewRowIds[i];
          if (val != null && rid != null) map[String(val)] = rid;
        });
        parentMap[refField] = map;
      }
    }

    progress(100, true);
    return tableName;
  }

  // ── Boucle d'import ─────────────────────────────────────────

  /**
   * importLayers(selectedLayers, opts)
   * opts :
   *   docApi, schema, sceneLod       (obligatoires)
   *   replaceExisting                (bool)
   *   makeMarkerColorFn(layer, col)  (si schema.makeMarkerColorFn absent)
   *   onProgress(layerName, pct, done, error)
   *   onLayerStart(layer)
   *   onLayerDone(layer, tableName)
   *   onError(layer, err)
   *   signal                         (AbortSignal optionnel)
   *   batchMaxRows, batchMaxBytes    (optionnels) lots plus gros, bornes en lignes
   *                                  et en octets estimes ; absents : 100/500 lignes
   *                                  comme avant (sortie strictement identique)
   *   skipUselessRepairFetch         (bool, defaut false) ne relit pas la table des
   *                                  points quand aucune longitude n'est reparable
   *   perf                           ('rapide' ou true) applique PERF_RAPIDE (lots de 5000
   *                                  lignes / 700 Ko estimes, sans relecture inutile) ; les
   *                                  trois options ci-dessus, si fournies, l'emportent
   *   logger                         ({log, warn, error}, defaut console)
   * Retourne { importedLayerData, layerErrors, tableNameRemap, allOk, aborted }.
   * Une couche en erreur n'arrete pas les suivantes (sauf annulation).
   * Les couches doivent deja porter _lod et _color (pre-assignes par l'appelant).
   */
  async function importLayers(selectedLayers, opts) {
    opts = opts || {};
    const docApi = opts.docApi || (typeof grist !== 'undefined' && grist.docApi);
    const schema = opts.schema || root.Q2GSchema || defaultSchema();
    const sceneLod = opts.sceneLod || root.Q2GSceneLod;
    if (!docApi) throw new Error('Q2GImport : docApi manquant');
    if (!sceneLod) throw new Error('Q2GImport : sceneLod manquant');
    if (typeof schema.sanitizeColName !== 'function') {
      throw new Error('Q2GImport : schema.sanitizeColName manquant');
    }
    const logger = opts.logger || console;
    const noop = () => {};
    const perf = resolvePerfOptions(opts);
    const ctx = {
      deps: { docApi, schema, sceneLod, logger, signal: opts.signal },
      onProgress: opts.onProgress || noop,
      onLayerStart: opts.onLayerStart || noop,
      replaceExisting: !!opts.replaceExisting,
      batchOpts: { batchMaxRows: perf.batchMaxRows, batchMaxBytes: perf.batchMaxBytes },
      skipUselessRepairFetch: perf.skipUselessRepairFetch,
      makeMarkerColorFn: opts.makeMarkerColorFn,
      nomsSelectionnes: new Set(selectedLayers.map((l) => l.name)),   // couches reellement importees
      parentMaps: Object.create(null), // tableName -> { refedField -> { value: rowId } }
      tableNameRemap: {},  // layerName -> nom de table effectif
    };
    const onLayerDone = opts.onLayerDone || noop;
    const onError = opts.onError || noop;

    const sorted = schemaFn(schema, 'topoSortByRefs')(selectedLayers);
    ctx.refLookupNeeds = schemaFn(schema, 'buildRefLookupNeeds')(selectedLayers);

    const importedLayerData = {};
    const layerErrors = {};
    let allOk = true;
    let aborted = false;

    for (const layer of sorted) {
      try {
        const tableName = await importLayer(layer, ctx);
        importedLayerData[tableName] = layer;
        onLayerDone(layer, tableName);
      } catch (err) {
        logger.error('Import error for', layer.name, err);
        layerErrors[layer.displayName || layer.name] = (err && err.message) || String(err);
        ctx.onProgress(layer.name, 100, false, true);
        allOk = false;
        onError(layer, err);
        if (err && err.name === 'AbortError') { aborted = true; break; }
      }
    }

    return { importedLayerData, layerErrors, tableNameRemap: ctx.tableNameRemap, allOk, aborted };
  }

  return {
    importLayers,
    importLayer,
    planBatches,
    makeRowEstimator,
    PERF_RAPIDE,
    resolvePerfOptions,
    pointLonRepairPossible,
    repairMissingPointLon,
    convertCellValue,
    topoSortByRefs,
    buildRefLookupNeeds,
    resolveRefType,
  };
});

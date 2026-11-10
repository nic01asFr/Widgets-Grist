/**
 * Q2GSchema : schema et preparation des donnees pour Grist.
 *
 * Module pur (aucun acces DOM, window ni reseau). Fonctions extraites a
 * l'identique de index_v2.html (buildLayerFromGeojson, detectGeomTypeFromFeatures,
 * rowStoreKey, flattenGeoJsonFeatures, inferType, jsTypeToGrist,
 * sanitizeTableName, sanitizeColName, topoSortByRefs, buildRefLookupNeeds,
 * resolveRefType).
 *
 * Dependance : Q2GGeometry (computeCentroid, flattenCoords2D, getPointCoords).
 * Resolution, dans l'ordre : injection via Q2GSchema.create({ geometry }),
 * puis require('./q2g-geometry.js'), puis le global Q2GGeometry. Sans module
 * geometrie, les fonctions qui en dependent levent une erreur explicite.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Q2GSchema = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function resolveGeometry(injected) {
    if (injected) return injected;
    let g = null;
    try {
      if (typeof require === 'function') g = require('./q2g-geometry.js');
    } catch (_) { g = null; }
    if (!g && root && root.Q2GGeometry) g = root.Q2GGeometry;
    return g || {};
  }

  // Mots reserves pour les ids de colonnes Grist : mots-cles Python (le sandbox
  // accede aux colonnes par attribut) et colonnes systeme (id, manualSort).
  const RESERVED_COL_NAMES = new Set([
    'false', 'none', 'true', 'and', 'as', 'assert', 'async', 'await', 'break', 'class',
    'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global',
    'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return',
    'try', 'while', 'with', 'yield',
    'id', 'manualsort',
  ]);

  // ---- Dictionnaires sur des cles venant des donnees ----
  // Les cles (noms de tables, de champs, valeurs de cles etrangeres) viennent des
  // fichiers importes. Dans un objet simple, 'constructor', 'toString' ou '__proto__'
  // heritent d'Object.prototype : une lecture renvoie une fonction, une ecriture de
  // '__proto__' change le prototype. Ces deux aides lisent et ecrivent uniquement des
  // proprietes propres, et laissent les objets simples (donc la sortie) inchanges.

  const _hasOwn = Object.prototype.hasOwnProperty;

  /** Lit obj[key] seulement si la propriete est propre ; sinon undefined. */
  function ownGet(obj, key) {
    return obj != null && _hasOwn.call(obj, key) ? obj[key] : undefined;
  }

  /** obj[key] = value en propriete propre, y compris pour '__proto__'. Renvoie value. */
  function setOwn(obj, key, value) {
    if (key === '__proto__') {
      Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
    } else {
      obj[key] = value;
    }
    return value;
  }

  // ---- Fonctions sans dependance ----

  let _localRowSeq = 0;
  function rowStoreKey(row) {
    if (row.id != null && row.id !== '') return row.id;
    if (row._localId == null) row._localId = 'L' + (++_localRowSeq);
    return row._localId;
  }

  /** Remet le compteur d'identifiants locaux a zero (usage tests uniquement). */
  function _resetRowSeq() { _localRowSeq = 0; }

  function detectGeomTypeFromFeatures(features) {
    // Vote majoritaire pour le type dominant (evite le bruit des collections mixtes)
    const votes = { Point: 0, Line: 0, Polygon: 0 };
    for (const f of features.slice(0, 50)) {
      const t = (f.geometry?.type || '').toLowerCase();
      if (t.includes('polygon')) votes.Polygon++;
      else if (t.includes('linestring') || t === 'multiline') votes.Line++;
      else if (t.includes('point')) votes.Point++;
    }
    if (votes.Polygon >= votes.Point && votes.Polygon >= votes.Line) return 'Polygon';
    if (votes.Line >= votes.Point) return 'Line';
    if (votes.Point > 0) return 'Point';
    return 'Polygon';
  }

  function inferType(v) {
    if (v === null || v === undefined) return 'string';
    if (typeof v === 'boolean') return 'boolean';
    if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'double';
    return 'string';
  }

  function jsTypeToGrist(v) {
    if (v === null || v === undefined) return 'Text';
    if (typeof v === 'boolean') return 'Bool';
    if (typeof v === 'number') return Number.isInteger(v) ? 'Int' : 'Numeric';
    return 'Text';
  }

  function sanitizeTableName(name) {
    let s = name.normalize('NFD').replace(/[̀-ͯ]/g, '');
    s = s.replace(/[^A-Za-z0-9_]/g, '_').replace(/^[0-9]/, 'T$&').replace(/_+/g, '_').replace(/^_|_$/g, '');
    // Grist exige une majuscule initiale pour les tableId ; sinon il renomme
    // silencieusement et le BulkAddRecord suivant echoue.
    if (s && /^[a-z]/.test(s)) s = s.charAt(0).toUpperCase() + s.slice(1);
    return s || 'Couche';
  }

  function sanitizeColName(name) {
    let s = name.normalize('NFD').replace(/[̀-ͯ]/g, '');
    s = s.replace(/[^A-Za-z0-9_]/g, '_').replace(/^[0-9]/, 'c$&').replace(/_+/g, '_').replace(/^_|_$/g, '');
    if (RESERVED_COL_NAMES.has(s.toLowerCase())) s = s + '_col';
    // Prefixe gristHelper_ reserve par Grist
    if (s.toLowerCase().startsWith('gristhelper_')) s = 'col_' + s;
    return s || 'col';
  }

  // Tri topologique : parents (references) avant enfants (referencants).
  function topoSortByRefs(layers) {
    // Map : une table nommee 'constructor' ne doit pas s'y confondre avec Object.prototype.
    // La derniere couche de meme nom l'emporte, comme avec l'ancien objet simple.
    const byName = new Map();
    for (const l of layers) byName.set(l.name, l);
    const visited = new Set(), visiting = new Set(), result = [];
    function visit(l) {
      if (!l || visited.has(l.name) || visiting.has(l.name)) return;
      visiting.add(l.name);
      for (const f of l.fields) {
        if (f._refTargetTable && byName.has(f._refTargetTable)) visit(byName.get(f._refTargetTable));
      }
      visiting.delete(l.name);
      visited.add(l.name);
      result.push(l);
    }
    for (const l of layers) visit(l);
    return result;
  }

  // Pour chaque parent, quels champs doivent etre indexes (valeur vers rowId).
  function buildRefLookupNeeds(layers) {
    const needs = {};
    for (const l of layers) {
      for (const f of l.fields) {
        if (f._refTargetTable && f._refTargetField) {
          const set = ownGet(needs, f._refTargetTable) || setOwn(needs, f._refTargetTable, new Set());
          set.add(f._refTargetField);
        }
      }
    }
    return needs;
  }

  // "Ref:Old" / "RefList:Old" vers "Ref:New" si la table parent a ete renommee.
  function resolveRefType(gType, refTargetTable, tableNameRemap) {
    if (!refTargetTable) return gType;
    const actual = ownGet(tableNameRemap, refTargetTable) || refTargetTable;
    if (gType.startsWith('RefList:')) return 'RefList:' + actual;
    return 'Ref:' + actual;
  }

  // ---- Fonctions dependant de Q2GGeometry ----

  function makeGeometryDependent(geometryProvider) {
    // Resolution paresseuse a chaque appel : tolere un chargement tardif du module.
    function geo(name) {
      const g = geometryProvider();
      if (!g || typeof g[name] !== 'function') {
        throw new Error('Q2GSchema : Q2GGeometry.' + name + ' manquant (charger q2g-geometry.js avant, ou create({ geometry })).');
      }
      return g[name];
    }

    function flattenGeoJsonFeatures(features, fields, geomType) {
      const rows = [];
      const flattenCoords2D = geo('flattenCoords2D');
      const getPointCoords = geo('getPointCoords');
      const computeCentroid = geo('computeCentroid');

      for (const feat of features) {
        const props = feat.properties || {};
        const geom = feat.geometry;
        const row = {};

        // Priorite : _rawKey (cle brute), puis label (compat ancien), puis name.
        for (const f of fields) {
          const k = f._rawKey || f.label;
          if (k && _hasOwn.call(props, k)) {
            row[f.name] = props[k];
          } else if (_hasOwn.call(props, f.name)) {
            row[f.name] = props[f.name];
          } else {
            row[f.name] = null;
          }
        }

        if (geom) {
          if (geomType === 'Point') {
            const coords = getPointCoords(geom);
            row['latitude'] = coords ? coords[1] : null;
            row['longitude'] = coords ? coords[0] : null;
          } else {
            try {
              // Coordonnees arrondies a 5 decimales (~1 m) pour reduire le JSON
              row['geometry_json'] = JSON.stringify(
                flattenCoords2D(geom),
                (k, v) => typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100000) / 100000 : v
              );
            } catch (e) { row['geometry_json'] = null; }
            const centroid = computeCentroid(geom);
            row['centroid_lat'] = centroid ? centroid[1] : null;
            row['centroid_lon'] = centroid ? centroid[0] : null;
          }
        }
        row._localId = rows.length + 1;
        rows.push(row);
      }
      return rows;
    }

    function buildLayerFromGeojson(name, geojson) {
      const features = geojson.features || [];
      const geomType = detectGeomTypeFromFeatures(features);

      // Sans prototype : une propriete nommee 'constructor' ou '__proto__' est une colonne
      // comme une autre (Object.values garde le meme ordre que pour un objet simple).
      const fieldMap = Object.create(null);
      for (const f of features.slice(0, 200)) {
        const props = f.properties || {};
        for (const [k, v] of Object.entries(props)) {
          if (!fieldMap[k]) {
            // _rawKey : cle d'acces dans properties (peut differer du label
            // apres enrichissement par alias QGIS / gpkg_data_columns).
            fieldMap[k] = { name: sanitizeColName(k), _rawKey: k, label: k,
                            qType: inferType(v), gType: jsTypeToGrist(v) };
          }
        }
      }

      const fields = Object.values(fieldMap);

      if (geomType === 'Point') {
        fields.push({ name: 'latitude', label: 'Latitude', qType: 'double', gType: 'Numeric' });
        fields.push({ name: 'longitude', label: 'Longitude', qType: 'double', gType: 'Numeric' });
      } else {
        fields.push({ name: 'geometry_json', label: 'GeoJSON', qType: 'string', gType: 'Text' });
        fields.push({ name: 'centroid_lat', label: 'Centroid Lat', qType: 'double', gType: 'Numeric' });
        fields.push({ name: 'centroid_lon', label: 'Centroid Lon', qType: 'double', gType: 'Numeric' });
      }

      return {
        name: sanitizeTableName(name),
        displayName: name,
        geomType,
        fields,
        features: flattenGeoJsonFeatures(features, fields, geomType),
        featureCount: features.length,
        hasData: features.length > 0,
        datasource: '(GeoJSON)'
      };
    }

    return { buildLayerFromGeojson, flattenGeoJsonFeatures };
  }

  const PURE = {
    detectGeomTypeFromFeatures,
    rowStoreKey,
    inferType,
    jsTypeToGrist,
    sanitizeTableName,
    sanitizeColName,
    topoSortByRefs,
    buildRefLookupNeeds,
    resolveRefType,
    RESERVED_COL_NAMES,
    ownGet,
    setOwn,
    _resetRowSeq,
  };

  /**
   * Fabrique une instance liee a un module geometrie injecte.
   * @param {{geometry?: object}} [deps] - geometry : objet Q2GGeometry
   */
  function create(deps) {
    const injected = deps && deps.geometry;
    return Object.assign({}, PURE, makeGeometryDependent(() => resolveGeometry(injected)), { create });
  }

  return create();
});

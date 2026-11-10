/**
 * Construction Scene Manifest V0.2 depuis les couches importées qgis2grist.
 */
(function (root, factory) {
  const qml = typeof require === 'function'
    ? require('./qml-to-declarative.js')
    : (root.Q2G || {});
  const lod = typeof require === 'function'
    ? require('./scene-lod.js')
    : (root.Q2GSceneLod || {});
  const ctrl = typeof require === 'function'
    ? require('./controls-from-layer.js')
    : (root.Q2GControls || {});

  const api = factory(qml, lod, ctrl);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Q2G = root.Q2G || {};
    Object.assign(root.Q2G, api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (qml, lod, ctrl) {
  'use strict';

  const MANIFEST_VERSION = lod.MANIFEST_LOD_VERSION || '0.2.1';
  const DEFAULT_CLASSIFICATION = 'internal';

  /**
   * geometry_type Scene Manifest depuis geomType qgis2grist.
   */
  function geometryType(geomType) {
    const g = (geomType || 'Polygon').toLowerCase();
    if (g === 'point') return 'point';
    if (g === 'line') return 'line';
    return 'polygon';
  }

  /** Colonnes géométriques conventionnelles pour un geomType donné. */
  function defaultGeometryCols(geomType) {
    return geometryType(geomType) === 'point'
      ? { lat: 'latitude', lon: 'longitude' }
      : { geojson: 'geometry_json', lat: 'centroid_lat', lon: 'centroid_lon' };
  }

  /**
   * Déclare les colIds géométriques réels quand ils s'écartent de la
   * convention — cas d'une source portant déjà un champ homonyme, que Grist
   * suffixe ('latitude' → 'latitude2'). Omis si tout est conventionnel, pour
   * ne pas alourdir le manifest du cas nominal.
   *
   * Extension additive à V0.2.1 (à valider avec l'offre de service) : un
   * lecteur qui l'ignore retombe sur la convention, comme aujourd'hui.
   */
  function geometryFieldsFor(layer) {
    const actual = layer._geometryCols;
    if (!actual) return null;
    const def = defaultGeometryCols(layer.geomType);
    const differs = Object.keys(def).some((k) => actual[k] && actual[k] !== def[k]);
    return differs ? { ...def, ...actual } : null;
  }

  /**
   * Construit un Scene Manifest V0.2 complet.
   * @param {Record<string, object>} importedLayerData - tableName → layer
   * @param {object|null} meta - meta BigQgisMCP / import
   * @param {string} fileName
   * @param {string[]} [palette] - couleurs fallback par couche
   */
  function buildSceneManifest(importedLayerData, meta, fileName, palette) {
    const colors = palette || ['#3e5de7', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    let idx = 0;

    const layers = Object.entries(importedLayerData).map(([tableName, layer]) => {
      const fallback = layer._color || layer.color || colors[idx++ % colors.length];
      const declarative = qml.qmlStyleToDeclarative(layer.style, { fallbackColor: fallback });
      const featureCount = layer.featureCount ?? layer.features?.length ?? 0;
      const layerLod = layer._lod || (lod.inferLayerLod ? lod.inferLayerLod(layer, featureCount) : null);
      const controls = ctrl.inferLayerControls
        ? ctrl.inferLayerControls(layer, meta, tableName, declarative)
        : [];

      const geometryFields = geometryFieldsFor(layer);
      const source = { type: 'grist', table: tableName };
      if (geometryFields) source.geometry_fields = geometryFields;

      return {
        id: tableName,
        name: layer.displayName || tableName,
        source,
        geometry_type: geometryType(layer.geomType),
        visibility: layerLod?.visibility || null,
        fetch: layerLod?.fetch || { mode: 'full' },
        limits: layerLod?.limits || null,
        profile: layerLod?.profile || 'A',
        style: {
          declarative,
          qml_source: null,
        },
        controls,
      };
    });

    const {
      sources, provenance, source_info, classification, imported_at,
      ...restMeta
    } = meta || {};

    return {
      version: MANIFEST_VERSION,
      classification: classification || DEFAULT_CLASSIFICATION,
      title: meta?.title || fileName || 'Import QGIS',
      subtitle: meta?.subtitle || null,
      layers,
      meta: {
        imported_at: imported_at || new Date().toISOString(),
        source_file: fileName || '',
        widget: 'qgis2grist-v2',
        classification: classification || DEFAULT_CLASSIFICATION,
        sources: sources || [],
        provenance: provenance || [],
        source_info: source_info || null,
        ...restMeta,
      },
    };
  }

  /** JSON canonique stable (clés triées) pour hash optionnel. */
  function canonicalStringify(obj) {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return '[' + obj.map(canonicalStringify).join(',') + ']';
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}';
  }

  /** SHA256 hex du manifest (navigateur ou Node 18+). */
  async function hashSceneManifest(manifest) {
    const text = canonicalStringify(manifest);
    if (typeof crypto !== 'undefined' && crypto.subtle?.digest) {
      const buf = new TextEncoder().encode(text);
      const hash = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return null;
  }

  return {
    MANIFEST_VERSION,
    DEFAULT_CLASSIFICATION,
    geometryType,
    defaultGeometryCols,
    geometryFieldsFor,
    buildSceneManifest,
    canonicalStringify,
    hashSceneManifest,
  };
});

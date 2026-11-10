/**
 * Doublons connus entre modules : ce test fige leur equivalence, pour que l'integrateur puisse
 * faire deleguer les anciens fichiers au module partage sans changer de sortie.
 *   - flattenCoords2D : lib/maplibre-bridge.js = lib/q2g-geometry.js
 *   - noms des colonnes geometriques : scene-manifest, geom-reconcile, scene-lod, q2g-schema, q2g-import
 *
 * node --test projects/qgis2grist/tests/q2g-doublons.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Geometry = require('../lib/q2g-geometry.js');
const Bridge = require('../lib/maplibre-bridge.js');
const SceneManifest = require('../lib/scene-manifest.js');
const GeomReconcile = require('../lib/geom-reconcile.js');
const SceneLod = require('../lib/scene-lod.js');
const Schema = require('../lib/q2g-schema.js');
const Import = require('../lib/q2g-import.js');

const GEOMS = [
  null, undefined, {}, { type: 'Point' },
  { type: 'Point', coordinates: [1, 2] },
  { type: 'Point', coordinates: [1, 2, 3] },
  { type: 'LineString', coordinates: [[1, 2, 3], [4, 5, 6, 7]] },
  { type: 'Polygon', coordinates: [[[1, 2, 3], [4, 5, 6], [7, 8, 9], [1, 2, 3]]] },
  { type: 'MultiPolygon', coordinates: [[[[1, 2, 3], [4, 5, 6], [7, 8, 9], [1, 2, 3]]], [[[0, 0], [1, 1], [0, 1], [0, 0]]]] },
  { type: 'MultiPoint', coordinates: [] },
];

describe('flattenCoords2D (maplibre-bridge = q2g-geometry)', () => {
  it('meme sortie sur tous les types, y compris vides', () => {
    for (const g of GEOMS) {
      assert.deepEqual(Bridge.flattenCoords2D(g), Geometry.flattenCoords2D(g), JSON.stringify(g));
    }
  });
  it('retire bien Z et M', () => {
    assert.deepEqual(Geometry.flattenCoords2D(GEOMS[6]).coordinates, [[1, 2], [4, 5]]);
  });
});

describe('noms des colonnes geometriques (une seule convention)', () => {
  const POINT = ['latitude', 'longitude'];
  const SURFACE = ['geometry_json', 'centroid_lat', 'centroid_lon'];

  it('scene-manifest, geom-reconcile et scene-lod parlent des memes cinq colonnes', () => {
    const toutes = [...POINT, ...SURFACE].sort();
    assert.deepEqual([...GeomReconcile.GEOM_COLS].sort(), toutes);
    const sansGeom = SceneLod.stripGeometryFromRow(Object.fromEntries([...toutes, 'autre'].map((k) => [k, 1])));
    assert.deepEqual(Object.keys(sansGeom), ['autre']);
    assert.deepEqual(Object.values(SceneManifest.defaultGeometryCols('Point')).sort(), [...POINT].sort());
    assert.deepEqual(Object.values(SceneManifest.defaultGeometryCols('Polygon')).sort(), [...SURFACE].sort());
    assert.deepEqual(GeomReconcile.geometryFieldsForType('Point').map((f) => f.name), POINT);
    assert.deepEqual(GeomReconcile.geometryFieldsForType('Polygon').map((f) => f.name), SURFACE);
  });

  it('q2g-schema cree ces colonnes et q2g-import les memorise dans _geometryCols', async () => {
    const pt = Schema.buildLayerFromGeojson('P', { features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: { a: 1 } }] });
    const poly = Schema.buildLayerFromGeojson('Z', { features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { a: 1 } }] });
    assert.deepEqual(pt.fields.filter((f) => POINT.includes(f.name)).map((f) => f.name), POINT);
    assert.deepEqual(poly.fields.filter((f) => SURFACE.includes(f.name)).map((f) => f.name), SURFACE);

    const api = {
      async listTables() { return []; },
      async applyUserActions(l) { return { retValues: l.map((a) => (a[0] === 'AddTable' ? { table_id: a[1], columns: a[2].map((c) => c.id) } : [1])) }; },
      async fetchTable() { return { id: [] }; },
    };
    const silent = { log() {}, warn() {}, error() {} };
    for (const l of [pt, poly]) { l._lod = { mode: 'inline' }; l._color = '#000000'; }
    await Import.importLayers([pt, poly], { docApi: api, schema: Schema, sceneLod: SceneLod, logger: silent });
    assert.deepEqual(pt._geometryCols, SceneManifest.defaultGeometryCols('Point'));
    assert.deepEqual(poly._geometryCols, SceneManifest.defaultGeometryCols('Polygon'));
    assert.deepEqual(Object.keys(poly._geometryCols), ['geojson', 'lat', 'lon']);
  });
});

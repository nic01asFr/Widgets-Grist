const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Scene = require('../lib/scene-manifest.js');

describe('geometry_fields — collision de noms de colonnes', () => {
  const baseLayer = {
    displayName: 'Sites',
    fields: [],
    style: { type: 'singleSymbol', color: '#111111' },
    _color: '#111111',
    featureCount: 10,
  };

  it('omis quand les colonnes suivent la convention', () => {
    const manifest = Scene.buildSceneManifest({
      Sites: { ...baseLayer, geomType: 'Point', _geometryCols: { lat: 'latitude', lon: 'longitude' } },
    }, {}, 'test.gpkg');
    assert.equal(manifest.layers[0].source.geometry_fields, undefined);
  });

  it('omis quand la couche ne porte pas _geometryCols (import ancien)', () => {
    const manifest = Scene.buildSceneManifest({
      Sites: { ...baseLayer, geomType: 'Point' },
    }, {}, 'test.gpkg');
    assert.equal(manifest.layers[0].source.geometry_fields, undefined);
  });

  it('déclaré quand Grist a suffixé la colonne (latitude → latitude2)', () => {
    const manifest = Scene.buildSceneManifest({
      Sites: { ...baseLayer, geomType: 'Point', _geometryCols: { lat: 'latitude2', lon: 'longitude2' } },
    }, {}, 'test.gpkg');
    assert.deepEqual(manifest.layers[0].source.geometry_fields, {
      lat: 'latitude2',
      lon: 'longitude2',
    });
  });

  it('polygone — complète les clés non renommées', () => {
    const manifest = Scene.buildSceneManifest({
      Bati: {
        ...baseLayer,
        geomType: 'Polygon',
        _geometryCols: { geojson: 'geometry_json', lat: 'centroid_lat2', lon: 'centroid_lon' },
      },
    }, {}, 'test.gpkg');
    assert.deepEqual(manifest.layers[0].source.geometry_fields, {
      geojson: 'geometry_json',
      lat: 'centroid_lat2',
      lon: 'centroid_lon',
    });
  });

  it('source.type/table restent intacts', () => {
    const manifest = Scene.buildSceneManifest({
      Sites: { ...baseLayer, geomType: 'Point', _geometryCols: { lat: 'latitude2', lon: 'longitude2' } },
    }, {}, 'test.gpkg');
    assert.equal(manifest.layers[0].source.type, 'grist');
    assert.equal(manifest.layers[0].source.table, 'Sites');
  });
});

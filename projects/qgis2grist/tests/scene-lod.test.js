const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const LOD = require('../lib/scene-lod.js');

describe('inferLayerLod', () => {
  it('Profil A — petit volume', () => {
    const lod = LOD.inferLayerLod({ geomType: 'Polygon', displayName: 'POI' }, 1000);
    assert.equal(lod.profile, 'A');
    assert.equal(lod.fetch.mode, 'full');
  });

  it('Profil B — viewport au-delà de 50k', () => {
    const lod = LOD.inferLayerLod({ geomType: 'Line', displayName: 'Voirie' }, 120000);
    assert.equal(lod.profile, 'B');
    assert.equal(lod.fetch.mode, 'viewport');
    assert.equal(lod.visibility.minZoom, 9);
  });

  it('Profil C — tile au-delà de 500k', () => {
    const lod = LOD.inferLayerLod({ geomType: 'Polygon', displayName: 'Bâtiments' }, 600000);
    assert.equal(lod.profile, 'C');
    assert.equal(lod.fetch.mode, 'tile');
  });

  it('grille Profil A — aucune contrainte de zoom', () => {
    const lod = LOD.inferLayerLod({ geomType: 'Polygon', displayName: 'grille_ligurie_200m' }, 40000);
    assert.equal(lod.profile, 'A');
    assert.equal(lod.visibility.minZoom, null);
    assert.equal(lod.visibility.maxZoom, null);
  });

  it('grille Profil B — plancher minZoom 11, jamais de maxZoom', () => {
    const lod = LOD.inferLayerLod({ geomType: 'Polygon', displayName: 'grille_ligurie_200m' }, 120000);
    assert.equal(lod.profile, 'B');
    assert.equal(lod.visibility.minZoom, LOD.GRID_MIN_ZOOM);
    assert.equal(lod.visibility.maxZoom, null);
  });
});
describe('buildSceneManifest LOD', () => {
  it('inclut visibility/fetch/profile V0.2.1', () => {
    const Scene = require('../lib/scene-manifest.js');
    const manifest = Scene.buildSceneManifest({
      gros: {
        displayName: 'Voirie',
        geomType: 'Line',
        featureCount: 120000,
        fields: [],
        style: { type: 'singleSymbol', color: '#111111' },
        _color: '#111111',
      },
    }, {}, 'test.gpkg');
    assert.equal(manifest.version, '0.2.1');
    assert.equal(manifest.layers[0].profile, 'B');
    assert.equal(manifest.layers[0].fetch.mode, 'viewport');
    assert.equal(manifest.layers[0].visibility.minZoom, 9);
  });
});

describe('Profil C — import sans géométrie', () => {
  const layer = {
    geomType: 'Polygon',
    featureCount: 600000,
    fields: [
      { name: 'fid', gType: 'Int' },
      { name: 'geometry_json', gType: 'Text' },
      { name: 'centroid_lat', gType: 'Numeric' },
      { name: 'centroid_lon', gType: 'Numeric' },
      { name: 'label', gType: 'Text' },
    ],
  };

  it('fieldsForGristImport exclut la géométrie', () => {
    const fields = LOD.fieldsForGristImport(layer);
    assert.deepEqual(fields.map(f => f.name), ['fid', 'label']);
  });

  it('stripGeometryFromRow retire les colonnes spatiales', () => {
    const row = LOD.stripGeometryFromRow({
      fid: 1,
      label: 'A',
      geometry_json: '{}',
      centroid_lat: 48,
      centroid_lon: 2,
    });
    assert.equal(row.label, 'A');
    assert.equal(row.geometry_json, undefined);
    assert.equal(row.centroid_lat, undefined);
  });

  it('formatProfileCMapToast liste les couches', () => {
    const msg = LOD.formatProfileCMapToast(['Bati', 'Voirie']);
    assert.match(msg, /Profil C/);
    assert.match(msg, /Bati/);
  });
});

describe('garde-fou taille fichier', () => {
  it('refuse binaire >500 Mo', () => {
    assert.equal(LOD.shouldRejectFileSize(LOD.FILE_MAX_BYTES + 1, 'gpkg'), true);
    assert.equal(LOD.shouldRejectFileSize(LOD.FILE_MAX_BYTES, 'gpkg'), false);
  });

  it('autorise .qgs volumineux (texte)', () => {
    assert.equal(LOD.shouldRejectFileSize(LOD.FILE_MAX_BYTES + 1, 'qgs'), false);
  });

  it('message utilisateur mentionne 500 Mo', () => {
    const msg = LOD.formatFileSizeGuardMessage(600 * 1024 * 1024);
    assert.match(msg, /500 Mo/);
    assert.match(msg, /Profil C/);
  });
});

describe('filterRowsForDisplay', () => {
  const layer = { geomType: 'Point' };
  const rows = [
    { id: 1, longitude: 2, latitude: 48 },
    { id: 2, longitude: 8, latitude: 43 },
  ];
  const bounds = { west: 1, east: 3, south: 47, north: 49 };
  const lod = { fetch: { mode: 'viewport' }, limits: { maxFeaturesInView: 10 } };

  it('filtre par bbox', () => {
    const out = LOD.filterRowsForDisplay(rows, layer, bounds, lod);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 1);
  });

  it('mode full — pas de filtre', () => {
    const out = LOD.filterRowsForDisplay(rows, layer, bounds, { fetch: { mode: 'full' } });
    assert.equal(out.length, 2);
  });
});

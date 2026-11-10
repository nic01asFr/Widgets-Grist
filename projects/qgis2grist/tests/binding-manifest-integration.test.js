/**
 * Intégration qgis2grist → Scene Manifest avec controls[].
 * Valide le pipeline parse HTML → buildSceneManifest → controls déduits.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseQgisRemoteMcpLayersData } = require('../lib/parse-remote-mcp.js');
const Scene = require('../lib/scene-manifest.js');
const Ctrl = require('../lib/controls-from-layer.js');

const FIX = path.join(__dirname, 'fixtures');

function miniBuildLayer(name, geojson) {
  const features = geojson.features || [];
  const geomType = features[0]?.geometry?.type?.includes('Polygon') ? 'Polygon'
    : features[0]?.geometry?.type?.includes('Line') ? 'Line' : 'Point';
  return {
    name: name.replace(/\W+/g, '_').toLowerCase(),
    displayName: name,
    geomType,
    fields: [],
    features,
    featureCount: features.length,
    hasData: features.length > 0,
  };
}

function parseRemoteHtml(file) {
  const html = fs.readFileSync(path.join(FIX, file), 'utf8');
  return parseQgisRemoteMcpLayersData(html, { buildLayerFromGeojson: miniBuildLayer });
}

function layersToImportedData(layers) {
  const out = {};
  for (const layer of layers) out[layer.name] = layer;
  return out;
}

describe('binding manifest — marseille webmap', () => {
  it('gradué hauteur + catégorisé voirie → controls[] dans manifest', () => {
    const layers = parseRemoteHtml('qgis2grist_marseille4e_webmap.html');
    assert.ok(layers?.length >= 4);
    const manifest = Scene.buildSceneManifest(layersToImportedData(layers), null, 'marseille.html');

    const bat = manifest.layers.find((l) => /batiment/i.test(l.name));
    assert.ok(bat, 'couche bâtiments');
    assert.equal(bat.style.declarative.kind, 'graduated');
    assert.equal(bat.style.declarative.field, 'hauteur');
    assert.equal(bat.controls.length, 1);
    assert.equal(bat.controls[0].type, 'range');
    assert.equal(bat.controls[0].field, 'hauteur');
    assert.equal(bat.controls[0].active, false);
    assert.ok(bat.controls[0].max > bat.controls[0].min);

    const voi = manifest.layers.find((l) => /voirie/i.test(l.name));
    assert.ok(voi);
    assert.equal(voi.style.declarative.kind, 'categorized');
    assert.equal(voi.controls[0].type, 'select');
    assert.equal(voi.controls[0].field, 'sens_de_circulation');
    assert.ok(voi.controls[0].values.length >= 2);
  });

  it('fragment golden JSON — stable pour tests Atlas', () => {
    const goldenPath = path.join(FIX, 'golden', 'scene-manifest-marseille-controls.json');
    assert.ok(fs.existsSync(goldenPath), 'fixture golden manquante');
    const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
    assert.equal(golden.version, '0.2.1');
    assert.ok(golden.layers.some((l) => l.controls?.length));
    const pollenLike = golden.layers.find((l) => l.id === 'Pollen_Consumption');
    assert.equal(pollenLike.controls[0].field, 'percentage');
    assert.equal(pollenLike.controls[0].type, 'range');
  });
});

describe('binding manifest — flood BigQgisMCP meta', () => {
  it('simulation control inactive par défaut', () => {
    const layer = {
      displayName: 'zones_inondables',
      geomType: 'Polygon',
      fields: [{ name: 'ht_min', gType: 'Numeric' }, { name: 'ht_max', gType: 'Numeric' }],
      style: {
        type: 'graduatedSymbol',
        field: 'ht_max',
        categories: [{ lower: 0, upper: 2, color: '#00f' }, { lower: 2, upper: 5, color: '#f00' }],
      },
    };
    const meta = {
      interactiveMap: 'flood',
      sliderMin: 0,
      sliderMax: 5,
      sliderTitle: 'Niveau eau',
      inferredStyles: { floodStyle: { type: 'graduatedSymbol', field: 'ht_max', categories: [] } },
    };
    const Q2G = require('../lib/qml-to-declarative.js');
    const decl = Q2G.qmlStyleToDeclarative(layer.style);
    const controls = Ctrl.inferLayerControls(layer, meta, 'flood_zones', decl);

    const sim = controls.find((c) => c.mode === 'simulation');
    assert.ok(sim, 'control simulation attendu');
    assert.equal(sim.active, false);
    assert.equal(sim.max, 5);

    const manifest = Scene.buildSceneManifest({ flood_zones: layer }, meta, 'flood.html');
    const ml = manifest.layers[0];
    assert.ok(ml.controls.some((c) => c.mode === 'simulation'));
    assert.ok(ml.controls.some((c) => c.type === 'range' && !c.mode));
  });
});

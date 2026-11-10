/**
 * Validation parseur sur fixtures QGIS (export_web_map, user webmap, etc.)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseQgisRemoteMcpLayersData, hasInteractiveBigQgisUi } = require('../lib/parse-remote-mcp.js');

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

describe('parseQgisRemoteMcpLayersData', () => {
  it('webmap utilisateur — noms + voirie catégorisée', () => {
    const layers = parseRemoteHtml('webmap_marseille4e_user.html');
    assert.ok(layers);
    assert.equal(layers.length, 2);
    assert.match(layers[0].displayName, /Limite/i);
    assert.match(layers[1].displayName, /Voirie/i);
    assert.equal(layers[1].style.type, 'categorizedSymbol');
    assert.ok(layers[1].style.categories.length >= 3);
    assert.equal(layers[1].style.field, 'sens_de_circulation');
  });

  it('fixture QGIS multi-couches — 4 layers', () => {
    const layers = parseRemoteHtml('qgis2grist_marseille4e_webmap.html');
    assert.ok(layers);
    assert.equal(layers.length, 4);
    const names = layers.map(l => l.displayName);
    assert.ok(names.some(n => /Limite/i.test(n)));
    assert.ok(names.some(n => /Voirie/i.test(n)));
    assert.ok(names.some(n => /Batiment/i.test(n)));
    assert.ok(names.some(n => /POI/i.test(n)));

    const bat = layers.find(l => /Batiment/i.test(l.displayName));
    assert.equal(bat.style.type, 'graduatedSymbol');
    assert.equal(bat.style.field, 'hauteur');
    assert.ok(bat.style.categories.length >= 4);

    const voi = layers.find(l => /Voirie/i.test(l.displayName));
    assert.equal(voi.style.type, 'categorizedSymbol');
    assert.equal(voi.style.field, 'sens_de_circulation');
  });

  it('hasInteractiveBigQgisUi — provenance seule ≠ flood UI', () => {
    assert.equal(hasInteractiveBigQgisUi({ sources: [{ label: 'test' }] }), false);
    assert.equal(hasInteractiveBigQgisUi({ colorScaleFns: { floodColor: {} }, sliderMax: 5 }), true);
  });
});

describe('fixtures présents', () => {
  const expected = [
    'qgis2grist_marseille4e_webmap.html',
    'qgis2grist_marseille4e_qfield.zip',
    'qgis2grist_marseille4e.qgs',
    'qgis2grist_marseille4e_voirie.gpkg',
    'qgis2grist_marseille4e.grist',
    'qgis2grist_nimes_flood.html',
    'webmap_marseille4e_user.html',
    'demo_points.gpkg',
    'profile_b_points.gpkg',
    'gam_communes.zip',
  ];
  for (const f of expected) {
    it(f, () => {
      assert.ok(fs.existsSync(path.join(FIX, f)), 'manquant : ' + f);
    });
  }

  it('qgs standalone — 4 couches vecteur dans le XML', () => {
    const xml = fs.readFileSync(path.join(FIX, 'qgis2grist_marseille4e.qgs'), 'utf8');
    const vectorLayers = (xml.match(/<maplayer[^>]*type="vector"/g) || []).length;
    assert.equal(vectorLayers, 4);
    assert.match(xml, /renderer-v2 type="graduatedSymbol"/);
    assert.match(xml, /renderer-v2 type="categorizedSymbol"/);
  });
});

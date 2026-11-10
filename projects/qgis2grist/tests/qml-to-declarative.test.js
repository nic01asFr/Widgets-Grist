const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Q2G = require('../lib/qml-to-declarative.js');
const Scene = require('../lib/scene-manifest.js');

describe('normalizeHex', () => {
  it('accepte #RRGGBB', () => {
    assert.equal(Q2G.normalizeHex('#3e5de7'), '#3e5de7');
  });
  it('expand #RGB', () => {
    assert.equal(Q2G.normalizeHex('#abc'), '#aabbcc');
  });
  it('fallback si invalide', () => {
    assert.equal(Q2G.normalizeHex(null, '#ff0000'), '#ff0000');
  });
});

describe('qmlStyleToDeclarative', () => {
  it('singleSymbol', () => {
    const d = Q2G.qmlStyleToDeclarative({ type: 'singleSymbol', color: '#112233' });
    assert.equal(d.kind, 'single');
    assert.equal(d.color, '#112233');
  });

  it('categorizedSymbol conserve value brute + label (Atlas matche les deux)', () => {
    const d = Q2G.qmlStyleToDeclarative({
      type: 'categorizedSymbol',
      field: 'beekeeper',
      categories: [
        { value: '1', label: 'Stephen Hawking', color: '#111111' },
        { value: '2', label: 'Rita Levi Montalcini', color: '#222222' },
      ],
    });
    assert.equal(d.stops[0].value, '1');
    assert.equal(d.stops[0].label, 'Stephen Hawking');
    assert.equal(d.stops[1].value, '2');
  });

  it('categorizedSymbol', () => {
    const d = Q2G.qmlStyleToDeclarative({
      type: 'categorizedSymbol',
      field: 'type_bati',
      categories: [
        { value: 'A', label: 'Type A', color: '#111111' },
        { value: 'B', label: 'Type B', color: '#222222' },
      ],
    });
    assert.equal(d.kind, 'categorized');
    assert.equal(d.field, 'type_bati');
    assert.equal(d.stops.length, 2);
    assert.equal(d.stops[0].color, '#111111');
  });

  it('graduatedSymbol', () => {
    const d = Q2G.qmlStyleToDeclarative({
      type: 'graduatedSymbol',
      field: 'depth',
      categories: [{ lower: 0, upper: 1, label: '0-1', color: '#aaaaaa' }],
    });
    assert.equal(d.kind, 'graduated');
    assert.equal(d.stops[0].lower, 0);
    assert.equal(d.method, 'equal');
  });

  it('null → single fallback', () => {
    const d = Q2G.qmlStyleToDeclarative(null, { fallbackColor: '#010203' });
    assert.equal(d.kind, 'single');
    assert.equal(d.color, '#010203');
  });

  it('ruleRenderer avec categories → categorized', () => {
    const d = Q2G.qmlStyleToDeclarative({
      type: 'ruleRenderer',
      field: 'type',
      categories: [{ value: 'A', label: 'Type A', color: '#111111' }],
    });
    assert.equal(d.kind, 'categorized');
    assert.equal(d.stops.length, 1);
  });
});

describe('buildSceneManifest', () => {
  it('produit version 0.2.1 avec layers', () => {
    const manifest = Scene.buildSceneManifest({
      batiments: {
        displayName: 'Bâtiments',
        geomType: 'Polygon',
        style: { type: 'singleSymbol', color: '#ff0000' },
        _color: '#ff0000',
        fields: [],
      },
    }, { title: 'Test flood' }, 'demo.gpkg');

    assert.equal(manifest.version, '0.2.1');
    assert.equal(manifest.classification, 'internal');
    assert.equal(manifest.layers.length, 1);
    assert.equal(manifest.layers[0].source.table, 'batiments');
    assert.equal(manifest.layers[0].style.declarative.kind, 'single');
    assert.equal(manifest.meta.source_file, 'demo.gpkg');
  });
});

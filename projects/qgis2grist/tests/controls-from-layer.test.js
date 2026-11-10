const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Ctrl = require('../lib/controls-from-layer.js');
const Q2G = require('../lib/qml-to-declarative.js');
const Scene = require('../lib/scene-manifest.js');

describe('controls-from-layer', () => {
  it('graduated → range control (bees Pollen)', () => {
    const layer = {
      displayName: 'Pollen',
      geomType: 'Point',
      fields: [{ name: 'percentage', _rawKey: 'Percentage', label: 'Percentage', gType: 'Int' }],
      style: {
        type: 'graduatedSymbol',
        field: 'percentage',
        categories: [
          { lower: 0, upper: 25, color: '#0000ff' },
          { lower: 25, upper: 100, color: '#ff0000' },
        ],
      },
    };
    const decl = Q2G.qmlStyleToDeclarative(layer.style);
    const controls = Ctrl.inferLayerControls(layer, null, 'Pollen_Consumption', decl);
    assert.equal(controls.length, 1);
    assert.equal(controls[0].type, 'range');
    assert.equal(controls[0].field, 'percentage');
    assert.equal(controls[0].min, 0);
    assert.equal(controls[0].max, 100);
    assert.equal(controls[0].active, false);
  });

  it('categorized → select control', () => {
    const layer = {
      geomType: 'Point',
      fields: [{ name: 'bee_species', label: 'Espèce', gType: 'Choice' }],
      style: {
        type: 'categorizedSymbol',
        field: 'bee_species',
        categories: [
          { value: 'A', label: 'Abeille A', color: '#111' },
          { value: 'B', label: 'Abeille B', color: '#222' },
        ],
      },
    };
    const decl = Q2G.qmlStyleToDeclarative(layer.style);
    const controls = Ctrl.inferLayerControls(layer, null, 'Apiary', decl);
    assert.equal(controls[0].type, 'select');
    assert.deepEqual(controls[0].values, ['A', 'B']);
  });

  it('BigQgisMCP flood → simulation range', () => {
    const layer = {
      displayName: 'zones_inondables',
      geomType: 'Polygon',
      fields: [{ name: 'ht_min', gType: 'Numeric' }],
      style: { type: 'singleSymbol', color: '#3388ff' },
    };
    const meta = {
      interactiveMap: 'flood',
      sliderMin: 0,
      sliderMax: 5,
      sliderTitle: 'Hauteur eau simulée',
      inferredStyles: {
        floodStyle: { type: 'graduatedSymbol', field: 'ht_max', categories: [] },
      },
    };
    const decl = Q2G.qmlStyleToDeclarative(layer.style);
    const controls = Ctrl.inferLayerControls(layer, meta, 'flood_zones', decl);
    assert.ok(controls.some((c) => c.mode === 'simulation'));
    const sim = controls.find((c) => c.mode === 'simulation');
    assert.equal(sim.field, 'ht_min');
    assert.equal(sim.max, 5);
    assert.equal(sim.active, false);
  });

  it('champ Date → time control si pas de meta interactive', () => {
    const layer = {
      geomType: 'Point',
      fields: [{ name: 'obs_date', gType: 'Date', label: 'Date obs' }],
      style: { type: 'singleSymbol', color: '#000' },
    };
    const decl = Q2G.qmlStyleToDeclarative(layer.style);
    const controls = Ctrl.inferLayerControls(layer, null, 'Obs', decl);
    assert.equal(controls[0].type, 'time');
    assert.equal(controls[0].field, 'obs_date');
  });

  it('widget Range QGIS → range control (Bee Pollen)', () => {
    const layer = {
      geomType: 'Polygon',
      fields: [{ name: 'percentage', gType: 'Int', _rangeMin: 0, _rangeMax: 100 }],
      style: { type: 'singleSymbol', color: '#aaa' },
    };
    const decl = Q2G.qmlStyleToDeclarative(layer.style);
    const controls = Ctrl.inferLayerControls(layer, null, 'Pollen_Consumption', decl);
    assert.equal(controls.length, 1);
    assert.equal(controls[0].field, 'percentage');
    assert.equal(controls[0].max, 100);
  });
});

describe('buildSceneManifest controls', () => {
  it('inclut controls[] sur les layers', () => {
    const manifest = Scene.buildSceneManifest({
      Pollen_Consumption: {
        displayName: 'Pollen',
        geomType: 'Point',
        fields: [{ name: 'percentage', gType: 'Int' }],
        style: {
          type: 'graduatedSymbol',
          field: 'percentage',
          categories: [{ lower: 0, upper: 100, color: '#aaa' }],
        },
      },
    }, null, 'bees.zip');

    assert.equal(manifest.layers[0].controls.length, 1);
    assert.equal(manifest.layers[0].controls[0].field, 'percentage');
  });
});

describe('restauration : bornes des widgets Range', () => {
  const champsConfig = () => [
    { name: 'clear_height', label: 'Clear height', gType: 'Int', widgetOptions: null },
    { name: 'remark', label: 'Remarks', gType: 'Text', widgetOptions: null },
  ];
  const sauves = [
    { field: 'clear_height', type: 'range', min: 0, max: 500, dataMin: 0, dataMax: 500, active: false },
    { field: 'last_modification', type: 'time', active: false },
  ];

  it('sans bornes remises, la config restauree perd le controle de plage', () => {
    const layer = { geomType: 'Line', fields: champsConfig(), style: { type: 'ruleRenderer', rules: [] } };
    const ctl = Ctrl.inferLayerControls(layer, null, 'Reaches', null);
    assert.equal(ctl.filter((c) => c.type === 'range').length, 0);
  });

  it('hydrateRangeBounds redonne les memes controles qu\'a l\'import', () => {
    const fields = champsConfig();
    Ctrl.hydrateRangeBounds(fields, sauves);
    assert.equal(fields[0]._rangeMin, 0);
    assert.equal(fields[0]._rangeMax, 500);
    assert.equal(fields[1]._rangeMin, undefined);
    const layer = { geomType: 'Line', fields, style: { type: 'ruleRenderer', rules: [] } };
    const ctl = Ctrl.inferLayerControls(layer, null, 'Reaches', null);
    const plages = ctl.filter((c) => c.type === 'range');
    assert.equal(plages.length, 1);
    assert.equal(plages[0].field, 'clear_height');
    assert.equal(plages[0].min, 0);
    assert.equal(plages[0].max, 500);
  });

  it('ne remplace pas une borne deja connue et ignore les plages de simulation', () => {
    const fields = [{ name: 'a', _rangeMin: 1, _rangeMax: 2 }, { name: 'b' }];
    Ctrl.hydrateRangeBounds(fields, [
      { field: 'a', type: 'range', min: 10, max: 20 },
      { field: 'b', type: 'range', mode: 'simulation', min: 0, max: 5 },
    ]);
    assert.equal(fields[0]._rangeMin, 1);
    assert.equal(fields[1]._rangeMin, undefined);
  });
});

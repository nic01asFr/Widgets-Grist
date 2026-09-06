/**
 * Tests binding Atlas ↔ Scene Manifest (style + contrôles + récit).
 * node --test projects/Atlas/tests/manifest-binding.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  declarativeFromAtlasLayer,
  layerPrefsPayload,
  applyLayerPrefsBinding,
  applyManifestControlsToLayer,
  syncLayerDeclarative,
} from '../lib/manifest-binding.js';
import {
  applyControlDeclarativesToLayer,
  controlDeclarativesFromAtlasLayer,
  buildControlPredicate,
} from '../lib/controls.js';
import { captureStoryState, storyToManifestFragment } from '../lib/story.js';
import { applyDeclarativeToLayer } from '../lib/declarative-style.js';

const sampleLayer = () => ({
  color: '#336699',
  geometryType: 'Point',
  source: 'qgis2grist',
  sourceTable: 'Pollen_Consumption',
  _fields: [{ name: 'percentage', _rawKey: 'Percentage', gType: 'Int' }],
  style: {
    mode: 'mapbox',
    symbolization: {
      color: {
        mode: 'graduated',
        field: 'percentage',
        method: 'linear',
        colorRamp: 'Viridis',
        inputRange: [0, 100],
        categories: [],
        defaultColor: '#999',
      },
      size: { mode: 'single', value: 8 },
      model: { mode: 'single', categories: [] },
      label: { enabled: false, field: null },
    },
  },
  geojson: {
    features: [
      { properties: { percentage: 10 } },
      { properties: { percentage: 90 } },
    ],
  },
  controls: [{
    field: 'percentage',
    type: 'range',
    active: true,
    min: 0,
    max: 50,
    dataMin: 0,
    dataMax: 100,
  }],
  _declarative: {
    kind: 'graduated',
    field: 'percentage',
    method: 'linear',
    stops: [{ lower: 0, upper: 50, color: '#0000ff' }, { lower: 50, upper: 100, color: '#ff0000' }],
  },
});

describe('manifest-binding', () => {
  it('declarativeFromAtlasLayer graduated round-trip', () => {
    const layer = sampleLayer();
    const decl = declarativeFromAtlasLayer(layer);
    assert.equal(decl.kind, 'graduated');
    assert.equal(decl.field, 'percentage');
    assert.equal(decl.stops.length, 2);
  });

  it('layerPrefsPayload inclut style + controls + declarative', () => {
    const payload = layerPrefsPayload(sampleLayer());
    assert.ok(payload.symbolization);
    assert.equal(payload.controls.length, 1);
    assert.equal(payload.declarative.kind, 'graduated');
  });

  it('applyLayerPrefsBinding restaure symbo et contrôles', () => {
    const layer = {
      color: '#111',
      geometryType: 'Point',
      source: 'qgis2grist',
      sourceTable: 'Apiary',
      style: { mode: 'mapbox' },
      geojson: { features: [{ properties: { beekeeper: 'A' } }, { properties: { beekeeper: 'B' } }] },
    };
    applyDeclarativeToLayer(layer, { kind: 'single', color: '#111111' });
    applyLayerPrefsBinding(layer, {
      prefRowId: 1,
      visible: true,
      style: {
        declarative: { kind: 'categorized', field: 'beekeeper', stops: [{ value: 'A', color: '#f00' }] },
        controls: [{ field: 'beekeeper', type: 'select', values: ['A'], active: true }],
      },
    });
    assert.equal(layer.style.symbolization.color.mode, 'categorized');
    assert.equal(layer.controls.length, 1);
    assert.equal(layer.controls[0].active, true);
  });

  it('applyLayerPrefsBinding — visible seule (sans StyleJSON)', () => {
    const layer = {
      color: '#111',
      source: 'qgis2grist',
      sourceTable: 'Fields',
      visible: false,
      style: { mode: 'mapbox' },
      geojson: { features: [] },
    };
    const ok = applyLayerPrefsBinding(layer, {
      prefRowId: 42,
      visible: true,
      style: null,
    });
    assert.equal(ok, true);
    assert.equal(layer.visible, true);
    assert.equal(layer._prefRowId, 42);
  });

  it('applyManifestControlsToLayer depuis manifest layer', () => {
    const layer = sampleLayer();
    layer.controls = [];
    applyManifestControlsToLayer(layer, {
      controls: [{ field: 'percentage', type: 'range', min: 0, max: 80, label: 'Pollen %' }],
    });
    assert.equal(layer.controls.length, 1);
    assert.equal(layer.controls[0].label, 'Pollen %');
  });

  it('applyManifestControlsToLayer — fragment golden qgis2grist', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const goldenPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../qgis2grist/tests/fixtures/golden/scene-manifest-marseille-controls.json'
    );
    const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
    const ml = golden.layers.find((l) => l.id === 'Pollen_Consumption');

    const layer = {
      color: '#336699',
      geometryType: 'Point',
      source: 'qgis2grist',
      sourceTable: 'Pollen_Consumption',
      _fields: [{ name: 'percentage', _rawKey: 'Percentage', gType: 'Int' }],
      style: { mode: 'mapbox' },
      geojson: {
        features: [
          { properties: { percentage: 10 } },
          { properties: { percentage: 90 } },
        ],
      },
      controls: [],
    };
    applyDeclarativeToLayer(layer, ml.style.declarative);
    applyManifestControlsToLayer(layer, ml);
    assert.equal(layer.controls.length, 1);
    assert.equal(layer.controls[0].type, 'range');
    assert.equal(layer.controls[0].field, 'percentage');
    assert.equal(layer.controls[0].active, false);
    assert.equal(layer.controls[0].max, 100);

    layer.controls[0].active = true;
    layer.controls[0].min = 0;
    layer.controls[0].max = 50;
    const pred = buildControlPredicate(layer);
    assert.equal(pred(layer.geojson.features[0]), true);
    assert.equal(pred(layer.geojson.features[1]), false);
  });

  it('applyManifestControlsToLayer — mode simulation préservé', () => {
    const layer = {
      _fields: [{ name: 'ht_min', gType: 'Numeric' }],
      geojson: { features: [{ properties: { ht_min: 1 } }] },
      controls: [],
    };
    applyManifestControlsToLayer(layer, {
      controls: [{
        field: 'ht_min',
        type: 'range',
        mode: 'simulation',
        min: 0,
        max: 5,
        active: false,
      }],
    });
    assert.equal(layer.controls[0].mode, 'simulation');
    const decls = controlDeclarativesFromAtlasLayer(layer);
    assert.equal(decls[0].mode, 'simulation');
  });

  it('syncLayerDeclarative met à jour _declarative', () => {
    const layer = sampleLayer();
    layer._declarative = null;
    syncLayerDeclarative(layer);
    assert.equal(layer._declarative.kind, 'graduated');
  });
});

describe('controls binding', () => {
  it('controlDeclarativesFromAtlasLayer', () => {
    const layer = sampleLayer();
    layer.controls[0].variant = 'range_min';
    const decls = controlDeclarativesFromAtlasLayer(layer);
    assert.equal(decls[0].field, 'percentage');
    assert.equal(decls[0].type, 'range');
    assert.equal(decls[0].variant, 'range_min');
  });

  it('applyControlDeclarativesToLayer avec _rawKey', () => {
    const layer = {
      _fields: [{ name: 'percentage', _rawKey: 'Percentage', gType: 'Int' }],
      geojson: { features: [{ properties: { Percentage: 5 } }, { properties: { Percentage: 95 } }] },
      controls: [],
    };
    applyControlDeclarativesToLayer(layer, [{ field: 'Percentage', type: 'range', variant: 'range_max', min: 0, max: 50, active: true }]);
    assert.equal(layer.controls[0].field, 'percentage');
    assert.equal(layer.controls[0].variant, 'range_max');
    const pred = buildControlPredicate(layer);
    assert.equal(pred(layer.geojson.features[1]), false);
  });

  it('buildControlPredicate supporte range_min', () => {
    const layer = {
      _fields: [{ name: 'percentage', _rawKey: 'Percentage', gType: 'Int' }],
      geojson: { features: [{ properties: { Percentage: 5 } }, { properties: { Percentage: 95 } }] },
      controls: [{ field: 'percentage', type: 'range', variant: 'range_min', min: 50, max: 100, active: true }],
    };
    const pred = buildControlPredicate(layer);
    assert.equal(pred(layer.geojson.features[0]), false);
    assert.equal(pred(layer.geojson.features[1]), true);
  });
});

describe('story binding', () => {
  it('captureStoryState inclut symbolisation et declarative', () => {
    const state = captureStoryState(null, {
      settings: { projection: 'globe', timeOfDay: 720, date: new Date('2026-07-01') },
      layers: [sampleLayer()],
    });
    assert.equal(state.layers[0].symbolization.color.mode, 'graduated');
    assert.equal(state.layers[0].declarative.kind, 'graduated');
    assert.equal(state.layers[0].controls.length, 1);
  });

  it('storyToManifestFragment', () => {
    const frag = storyToManifestFragment([{
      title: 'Intro',
      text: 'Vue générale',
      state: { layers: [{ name: 'Apiary', visible: true }] },
    }]);
    assert.equal(frag.steps.length, 1);
    assert.equal(frag.version, '0.2.1');
  });
});

describe('reglages de formulaire — un choix de scene, pas de table', () => {
  it('une couche sans reglage n’ecrit rien', () => {
    assert.equal(layerPrefsPayload({ name: 'Bâti' }).formulaire, null);
    assert.equal(layerPrefsPayload({ name: 'Bâti', formulaire: {} }).formulaire, null);
  });

  it('le choix et l’exposition font l’aller-retour', () => {
    const source = { name: 'Bâti', formulaire: { id: 'bati-terrain', expose: true } };
    const payload = layerPrefsPayload(source);
    assert.deepEqual(payload.formulaire, { id: 'bati-terrain', expose: true });

    const relu = { name: 'Bâti' };
    applyLayerPrefsBinding(relu, { style: payload });
    assert.deepEqual(relu.formulaire, { id: 'bati-terrain', expose: true });
  });

  it('exposer sans choisir reste un reglage valable', () => {
    // La scene publie « le » formulaire de la table, quel qu'il soit : on n'a
    // pas a figer un identifiant pour cela.
    const payload = layerPrefsPayload({ formulaire: { expose: true } });
    assert.deepEqual(payload.formulaire, { id: null, expose: true });
  });

  it('une valeur douteuse n’ouvre rien a un lecteur', () => {
    const relu = { name: 'Bâti' };
    applyLayerPrefsBinding(relu, { style: { formulaire: { id: 'x', expose: 'oui' } } });
    assert.deepEqual(relu.formulaire, { id: 'x', expose: false });
  });

  it('des prefs anciennes, sans le champ, laissent la couche intacte', () => {
    const relu = { name: 'Bâti', formulaire: { id: 'a', expose: true } };
    applyLayerPrefsBinding(relu, { style: { mode: 'mapbox' } });
    assert.deepEqual(relu.formulaire, { id: 'a', expose: true });
  });
});

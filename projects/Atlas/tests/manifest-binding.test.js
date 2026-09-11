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

  it('la fiche choisie et les exposes font l’aller-retour', () => {
    const source = { name: 'Bâti', formulaire: { fiche: 'bati-terrain', exposes: ['bati-terrain', 'visite-v2'] } };
    const payload = layerPrefsPayload(source);
    assert.deepEqual(payload.formulaire, { fiche: 'bati-terrain', exposes: ['bati-terrain', 'visite-v2'] });

    const relu = { name: 'Bâti' };
    applyLayerPrefsBinding(relu, { style: payload });
    assert.deepEqual(relu.formulaire, { fiche: 'bati-terrain', exposes: ['bati-terrain', 'visite-v2'] });
  });

  it('exposer sans choisir de fiche reste un reglage valable', () => {
    // La scene publie un formulaire lie sans rien changer a la fiche.
    const payload = layerPrefsPayload({ formulaire: { exposes: ['visite-v2'] } });
    assert.deepEqual(payload.formulaire, { fiche: null, exposes: ['visite-v2'] });
  });

  it('une liste vide s’enregistre — elle dit « rien n’est expose »', () => {
    // La confondre avec l'absence de liste reactiverait l'ancien booleen sur
    // une couche qu'on vient justement de vider.
    const payload = layerPrefsPayload({ formulaire: { exposes: [] } });
    assert.deepEqual(payload.formulaire, { fiche: null, exposes: [] });
  });

  it('l’ancien booleen est recopie tant que personne n’a touche la liste', () => {
    // Le supprimer ici desexposerait en silence une scene qu'on n'a fait
    // qu'ouvrir.
    const payload = layerPrefsPayload({ formulaire: { id: 'x', expose: true } });
    assert.deepEqual(payload.formulaire, { fiche: 'x', expose: true });

    const relu = { name: 'Bâti' };
    applyLayerPrefsBinding(relu, { style: payload });
    assert.deepEqual(relu.formulaire, { fiche: 'x', expose: true });
  });

  it('et il disparait des que la liste prend le relais', () => {
    const payload = layerPrefsPayload({ formulaire: { id: 'x', expose: true, exposes: ['x'] } });
    assert.deepEqual(payload.formulaire, { fiche: 'x', exposes: ['x'] });
  });

  it('une valeur douteuse n’ouvre rien a un lecteur', () => {
    const relu = { name: 'Bâti' };
    applyLayerPrefsBinding(relu, { style: { formulaire: { fiche: 'x', expose: 'oui' } } });
    assert.deepEqual(relu.formulaire, { fiche: 'x' });

    const abime = { name: 'Bâti' };
    applyLayerPrefsBinding(abime, { style: { formulaire: { exposes: ['a', 3, null] } } });
    assert.deepEqual(abime.formulaire, { fiche: null, exposes: ['a'] });
  });

  it('des prefs anciennes, sans le champ, laissent la couche intacte', () => {
    const relu = { name: 'Bâti', formulaire: { fiche: 'a', exposes: ['a'] } };
    applyLayerPrefsBinding(relu, { style: { mode: 'mapbox' } });
    assert.deepEqual(relu.formulaire, { fiche: 'a', exposes: ['a'] });
  });

  it('les masques font l’aller-retour, par formulaire', () => {
    const source = { formulaire: { fiche: 'a', exposes: ['a'], masques: { a: ['nom'], b: ['x', 'y'] } } };
    const payload = layerPrefsPayload(source);
    assert.deepEqual(payload.formulaire.masques, { a: ['nom'], b: ['x', 'y'] });

    const relu = { name: 'Bâti' };
    applyLayerPrefsBinding(relu, { style: payload });
    assert.deepEqual(relu.formulaire.masques, { a: ['nom'], b: ['x', 'y'] });
  });

  it('cadrer sans rien exposer reste un reglage valable', () => {
    // Resserrer la fiche d'edition ne dit rien de ce qu'on propose au terrain.
    const payload = layerPrefsPayload({ formulaire: { masques: { a: ['nom'] } } });
    assert.deepEqual(payload.formulaire, { fiche: null, masques: { a: ['nom'] } });
  });

  it('un objet sans entree n’est pas ecrit', () => {
    assert.equal(layerPrefsPayload({ formulaire: { masques: {} } }).formulaire, null);
  });

  it('une entree vide est une decision, et s’ecrit', () => {
    // « Tout reaffiche dans a » : sans elle, les colonnes d'Atlas se
    // remasqueraient au rechargement (masquesParDefaut).
    const p = layerPrefsPayload({ formulaire: { masques: { a: [] } } });
    assert.deepEqual(p.formulaire, { fiche: null, masques: { a: [] } });
    const relu = { name: 'Bâti' };
    applyLayerPrefsBinding(relu, { style: p });
    assert.deepEqual(relu.formulaire, { fiche: null, masques: { a: [] } });
  });

  it('une valeur douteuse ne RETIRE rien', () => {
    // Symetrique de la garde sur `exposes`, et plus grave : un enregistrement
    // abime qui masque fait disparaitre une donnee de l'ecran sans le dire.
    for (const masques of ['nom', 42, ['nom'], { a: 'nom' }, { a: [7, null] }]) {
      const relu = { name: 'Bâti' };
      applyLayerPrefsBinding(relu, { style: { formulaire: { fiche: 'a', masques } } });
      assert.deepEqual(relu.formulaire, { fiche: 'a' }, JSON.stringify(masques));
    }
    const partiel = { name: 'Bâti' };
    applyLayerPrefsBinding(partiel, { style: { formulaire: { masques: { a: ['nom', 7, ''] } } } });
    assert.deepEqual(partiel.formulaire, { fiche: null, masques: { a: ['nom'] } });
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectGeometryColumn, tableToGeoJSON, isLinkedTableLayer } from '../lib/geo-tables.js';
import {
  controlFieldType,
  buildControlPredicate,
  filteredGeoJSON,
  filteredUniqueValues,
  applyControlDeclarativesToLayer,
  applyStoryControlsToLayer,
  captureSelectControlValues,
  isSelectValueChecked,
  repairSelectControlFromManifest,
  shouldCaptureControl,
  sanitizeBrokenSelectFilters,
} from '../lib/controls.js';
import { captureStoryState, normalizeStoryRows } from '../lib/story.js';

describe('geo-tables', () => {
  it('detectGeometryColumn lat/lng', () => {
    const col = detectGeometryColumn({ id: [1], latitude: [43.6], longitude: [1.44] });
    assert.equal(col.lat, 'latitude');
    assert.equal(col.lng, 'longitude');
  });

  it('tableToGeoJSON geometry_json', () => {
    const gj = tableToGeoJSON({
      id: [1],
      geometry_json: ['{"type":"Point","coordinates":[1,43]}'],
      name: ['A'],
    }, 'geometry_json');
    assert.equal(gj.features.length, 1);
    assert.equal(gj.features[0].properties._row_id, 1);
  });

  it('isLinkedTableLayer qgis2grist', () => {
    assert.equal(isLinkedTableLayer({ source: 'qgis2grist', sourceTable: 'Apiary' }), true);
    assert.equal(isLinkedTableLayer({ source: 'import' }), false);
  });
});

describe('controls', () => {
  it('controlFieldType range', () => {
    const layer = {
      geojson: {
        features: [{ properties: { x: 1 } }, { properties: { x: 2 } }],
      },
    };
    assert.equal(controlFieldType(layer, 'x'), 'range');
  });

  it('buildControlPredicate filters', () => {
    const layer = {
      geojson: {
        features: [
          { properties: { v: 5 } },
          { properties: { v: 15 } },
        ],
      },
      controls: [{ field: 'v', type: 'range', active: true, min: 0, max: 10 }],
    };
    const pred = buildControlPredicate(layer);
    assert.equal(pred(layer.geojson.features[0]), true);
    assert.equal(pred(layer.geojson.features[1]), false);
  });

  it('range — une entité sans la donnée passe le filtre par défaut', () => {
    const layer = {
      controls: [{ field: 'v', type: 'range', active: true, min: 1, max: 10 }],
    };
    const pred = buildControlPredicate(layer);
    assert.equal(pred({ properties: {} }), true, 'valeur absente : tolérée');
    assert.equal(pred({ properties: { v: '' } }), true, 'valeur vide : tolérée');
    assert.equal(pred({ properties: { v: 'n/a' } }), true, 'non numérique : toléré');
  });

  it('range requireValue — une entité sans la donnée est écartée', () => {
    const layer = {
      controls: [{ field: 'v', type: 'range', active: true, min: 1, max: 10, requireValue: true }],
    };
    const pred = buildControlPredicate(layer);
    assert.equal(pred({ properties: {} }), false);
    assert.equal(pred({ properties: { v: '' } }), false);
    assert.equal(pred({ properties: { v: 'n/a' } }), false);
    assert.equal(pred({ properties: { v: 5 } }), true, 'valeur dans la plage : conservée');
    assert.equal(pred({ properties: { v: 50 } }), false, 'hors plage : écartée');
  });

  it('requireValue n\'interrompt pas l\'évaluation des autres filtres', () => {
    const layer = {
      controls: [
        { field: 'a', type: 'range', active: true, min: 0, max: 100 },
        { field: 'b', type: 'range', active: true, min: 0, max: 10 },
      ],
    };
    const pred = buildControlPredicate(layer);
    // `a` absent (toléré) mais `b` hors plage : la feature doit être écartée.
    assert.equal(pred({ properties: { b: 50 } }), false);
  });

  it('select actif sans valeur cochée → aucune feature', () => {
    const layer = {
      geojson: {
        features: [
          { properties: { plant_species: 'Grass' } },
          { properties: { plant_species: 'Colza' } },
        ],
      },
      controls: [{ field: 'plant_species', type: 'select', active: true, values: [] }],
    };
    const pred = buildControlPredicate(layer);
    assert.equal(pred(layer.geojson.features[0]), false);
    assert.equal(pred(layer.geojson.features[1]), false);
  });

  it('select actif — filtre insensible à la casse (Grass / grass)', () => {
    const layer = {
      geojson: {
        features: [
          { properties: { plant_species: 'Grass' } },
          { properties: { plant_species: 'Colza' } },
        ],
      },
      controls: [{ field: 'plant_species', type: 'select', active: true, values: ['grass'] }],
    };
    const pred = buildControlPredicate(layer);
    assert.equal(pred(layer.geojson.features[0]), true);
    assert.equal(pred(layer.geojson.features[1]), false);
  });

  it('import manifest — options ≠ sélection (pas de filtre implicite)', () => {
    const layer = {
      geojson: {
        features: [
          { properties: { plant_species: 'Grass' } },
          { properties: { plant_species: 'Colza' } },
        ],
      },
      controls: [],
    };
    applyControlDeclarativesToLayer(layer, [{
      field: 'plant_species',
      type: 'select',
      values: ['colza', 'grass', 'lavender'],
      active: true,
    }], { activateDefaults: true });
    const c = layer.controls[0];
    assert.deepEqual(c.options, ['colza', 'grass', 'lavender']);
    assert.equal(c.values, undefined);
    const pred = buildControlPredicate(layer);
    assert.equal(pred(layer.geojson.features[0]), true);
    assert.equal(pred(layer.geojson.features[1]), true);
  });

  it('lecture récit — bee_amount étape >1000', () => {
    const features = [
      { properties: { bee_amount: '> 10000' } },
      { properties: { bee_amount: '1000 - 10000' } },
      { properties: { bee_amount: '< 1000' } },
    ];
    const layer = {
      id: 'layer-scene-Apiary',
      sourceTable: 'Apiary',
      geojson: { type: 'FeatureCollection', features },
      controls: [{
        field: 'bee_amount',
        type: 'select',
        active: true,
        options: ['< 1000', '> 10000', '1000 - 10000'],
      }],
    };
    applyStoryControlsToLayer(layer, [{
      field: 'bee_amount',
      type: 'select',
      values: ['> 10000', '1000 - 10000'],
    }]);
    assert.equal(filteredGeoJSON(layer).features.length, 2);
  });

  it('filteredUniqueValues — comptes après filtre', () => {
    const layer = {
      geojson: {
        features: [
          { properties: { bee_amount: '> 10000', bee_species: 'A' } },
          { properties: { bee_amount: '1000 - 10000', bee_species: 'A' } },
          { properties: { bee_amount: '< 1000', bee_species: 'B' } },
        ],
      },
      controls: [{
        field: 'bee_amount',
        type: 'select',
        active: true,
        values: ['> 10000', '1000 - 10000'],
        _selectionTouched: true,
      }],
    };
    const vals = filteredUniqueValues(layer, 'bee_species');
    assert.equal(vals.length, 1);
    assert.equal(vals[0].value, 'A');
    assert.equal(vals[0].count, 2);
  });

  it('sanitizeBrokenSelectFilters — select actif vide → désactivé', () => {
    const layer = {
      geojson: { features: [{ properties: { x: 'a' } }] },
      controls: [{ field: 'x', type: 'select', active: true, values: [], _selectionTouched: true }],
    };
    sanitizeBrokenSelectFilters(layer);
    assert.equal(layer.controls[0].active, false);
    assert.equal(filteredGeoJSON(layer).features.length, 1);
  });

  it('capture récit — sélection partielle sans _selectionTouched', () => {
    const layer = {
      id: 'a', name: 'Apiary', visible: true, style: {},
      geojson: {
        features: [
          { properties: { bee_amount: '> 10000' } },
          { properties: { bee_amount: '1000 - 10000' } },
          { properties: { bee_amount: '< 1000' } },
        ],
      },
      controls: [{
        field: 'bee_amount',
        type: 'select',
        active: true,
        values: ['> 10000', '1000 - 10000'],
      }],
    };
    assert.equal(shouldCaptureControl(layer, layer.controls[0]), true);
    const snap = captureStoryState(null, { settings: { projection: 'globe', timeOfDay: 0, date: new Date() }, layers: [layer] });
    assert.deepEqual(snap.layers[0].controls[0].values, ['> 10000', '1000 - 10000']);
  });

  it('capture récit — ignore contrôle manifest non touché', () => {
    const layer = {
      id: 'f', name: 'Fields', visible: true, style: {},
      geojson: { features: [{ properties: { plant_species: 'Grass' } }] },
      controls: [{
        field: 'plant_species',
        type: 'select',
        active: true,
        options: ['colza', 'grass'],
      }],
    };
    const snap = captureStoryState(null, { settings: { projection: 'globe', timeOfDay: 0, date: new Date() }, layers: [layer] });
    assert.equal(snap.layers[0].controls.length, 0);
    assert.equal(shouldCaptureControl(layer, layer.controls[0]), false);
  });

  it('UI cochée vs filtre — grass manifest / Grass feature', () => {
    const c = { type: 'select', active: true, values: ['colza', 'grass'], options: ['colza', 'grass'] };
    assert.equal(isSelectValueChecked(c, 'Grass'), true);
    assert.equal(isSelectValueChecked(c, 'Colza'), true);
    assert.equal(isSelectValueChecked(c, 'Lavender'), false);
    assert.equal(isSelectValueChecked({ ...c, values: [] }, 'Grass'), false);
  });

  it('capture récit — sélection vide enregistrée', () => {
    const layer = {
      id: 'f', name: 'Fields', visible: true, style: {},
      geojson: {
        features: [{ properties: { plant_species: 'Grass' } }],
      },
      controls: [{ field: 'plant_species', type: 'select', active: true, values: [], _selectionTouched: true }],
    };
    const snap = captureStoryState(null, { settings: { projection: 'globe', timeOfDay: 0, date: new Date() }, layers: [layer] });
    assert.deepEqual(snap.layers[0].controls[0].values, []);
    assert.equal(filteredGeoJSON(layer).features.length, 0);
  });

  it('capture récit — seulement Grass', () => {
    const layer = {
      id: 'f', name: 'Fields', visible: true, style: {},
      geojson: {
        features: [
          { properties: { plant_species: 'Grass' } },
          { properties: { plant_species: 'Colza' } },
        ],
      },
      controls: [{ field: 'plant_species', type: 'select', active: true, values: ['Grass'], _selectionTouched: true }],
    };
    const snap = captureStoryState(null, { settings: { projection: 'globe', timeOfDay: 0, date: new Date() }, layers: [layer] });
    assert.deepEqual(snap.layers[0].controls[0].values, ['Grass']);
    assert.equal(filteredGeoJSON(layer).features.length, 1);
  });
});

describe('story', () => {
  it('captureStoryState layers snapshot', () => {
    const state = captureStoryState(null, {
      settings: { projection: 'globe', timeOfDay: 600, date: new Date('2026-06-15') },
      layers: [{ id: 'a', name: 'L', visible: true, controls: [] }],
    });
    assert.equal(state.projection, 'globe');
    assert.equal(state.layers.length, 1);
  });

  it('captureStoryState retient fond et ambiance', () => {
    const state = captureStoryState(null, {
      settings: {
        projection: 'mercator',
        timeOfDay: 1185,
        date: new Date('2026-08-27'),
        terrain3D: false,
        labels: false,
        shadows: true,
        sky: true,
        basemap: 'ortho-ign',
        buildings3D: false,
      },
      layers: [],
    });
    assert.equal(state.basemap, 'ortho-ign');
    assert.equal(state.buildings3D, false);
    assert.equal(state.shadows, true);
    assert.equal(state.labels, false);
    assert.equal(state.timeOfDay, 1185);
  });

  it('captureStoryState retient le rendu surfacique', () => {
    const state = captureStoryState(null, {
      settings: { projection: 'globe', timeOfDay: 600, date: new Date('2026-06-15') },
      layers: [
        { id: 'a', name: 'Bâti', visible: true, controls: [], style: { mode: 'mapbox', polygonMode: 'extruded' } },
        { id: 'b', name: 'Grille', visible: true, controls: [], style: { mode: 'mapbox' } },
      ],
    });
    assert.equal(state.layers[0].polygonMode, 'extruded');
    // Sans rendu déclaré, la clé reste absente : l'étape n'impose rien.
    assert.equal('polygonMode' in state.layers[1], false);
  });

  it('normalizeStoryRows déduplique par Step', () => {
    const rows = normalizeStoryRows([
      { id: 1, step: 1, title: 'A1', text: '', state: {} },
      { id: 3, step: 1, title: 'A2', text: '', state: {} },
      { id: 2, step: 2, title: 'B1', text: '', state: {} },
      { id: 4, step: 2, title: 'B2', text: '', state: {} },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].title, 'A2');
    assert.equal(rows[1].title, 'B2');
  });
});

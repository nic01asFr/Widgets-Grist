/**
 * L'identifiant de modèle dans le schéma Atlas : il doit traverser, intact, chaque endroit où il
 * s'écrit — préférences de couche (`Atlas_LayerPrefs`), manifeste de scène, colonne
 * `atlas_3d_json` d'une entité — qu'il désigne un modèle low-poly ou un `objet:<type>`.
 *
 * node --test projects/Atlas/tests/modele-id-schema.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { layerPrefsPayload, applyLayerPrefsBinding } from '../lib/manifest-binding.js';
import { lignePrefs, featureToRowUpdate } from '../lib/grist-sync.js';
import { loadSceneManifestLayers } from '../lib/scene-loader.js';

const couche = (modelId, extra = {}) => ({
  id: 'l1', name: 'Luminaires', geometryType: 'Point', sourceTable: 'Luminaires',
  style: { mode: 'library', library: { modelId }, common: { scale: 1 } }, ...extra,
});

describe('préférences de couche : le modèle choisi est enregistré', () => {
  it('un identifiant low-poly', () => {
    assert.deepEqual(layerPrefsPayload(couche('streetlamp')).library, { modelId: 'streetlamp' });
  });

  it('un identifiant d’objet réaliste', () => {
    assert.deepEqual(layerPrefsPayload(couche('objet:applique_facade')).library, { modelId: 'objet:applique_facade' });
  });

  it('rien d’écrit sans modèle, ou avec un identifiant mal formé', () => {
    assert.equal(layerPrefsPayload({ style: { mode: 'mapbox' } }).library, null);
    assert.equal(layerPrefsPayload(couche('')).library, null);
    assert.equal(layerPrefsPayload(couche('objet:')).library, null);
    assert.equal(layerPrefsPayload(couche('a:b')).library, null);
  });

  it('il voyage dans la ligne Atlas_LayerPrefs et en revient', () => {
    const ligne = lignePrefs(couche('objet:mat_crosse'));
    const relu = JSON.parse(ligne.StyleJSON);
    assert.deepEqual(relu.library, { modelId: 'objet:mat_crosse' });
    const l = couche('streetlamp');
    applyLayerPrefsBinding(l, { style: relu, prefRowId: 3, visible: true });
    assert.equal(l.style.library.modelId, 'objet:mat_crosse', 'le choix de l’utilisateur prime sur le manifeste');
    assert.equal(l.style.mode, 'library');
  });

  it('un identifiant illisible n’écrase pas le modèle de la couche', () => {
    for (const mauvais of ['', 'objet:', 'a:b', 42, null, {}]) {
      const l = couche('streetlamp');
      applyLayerPrefsBinding(l, { style: { library: { modelId: mauvais } } });
      assert.equal(l.style.library.modelId, 'streetlamp', `refusé : ${JSON.stringify(mauvais)}`);
    }
  });

  it('un enregistrement d’avant, sans modèle, ne change rien', () => {
    const l = couche('streetlamp');
    applyLayerPrefsBinding(l, { style: { mode: 'library', polygonMode: null } });
    assert.equal(l.style.library.modelId, 'streetlamp');
  });

  it('un objet inconnu du catalogue est conservé : le catalogue peut arriver après', () => {
    const l = couche('streetlamp');
    applyLayerPrefsBinding(l, { style: { library: { modelId: 'objet:type_futur' } } });
    assert.equal(l.style.library.modelId, 'objet:type_futur');
  });
});

describe('manifeste de scène : l’identifiant passe tel quel', () => {
  const manifest = (style) => ({
    layers: [{
      id: 'lum', name: 'Luminaires', geometry_type: 'Point',
      geojson: { type: 'FeatureCollection', features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [5.4, 43.3] }, properties: { genre: 'facade' } },
      ] },
      style,
    }],
  });

  it('au niveau de la couche', async () => {
    const { layers } = await loadSceneManifestLayers(null, manifest({ mode: 'library', library: { modelId: 'objet:applique_facade' } }), null);
    assert.equal(layers[0].style.mode, 'library');
    assert.equal(layers[0].style.library.modelId, 'objet:applique_facade');
  });

  it('par catégorie, avec un identifiant low-poly et un objet dans la même couche', async () => {
    const { layers } = await loadSceneManifestLayers(null, manifest({
      mode: 'library', library: { modelId: 'streetlamp' },
      model: {
        field: 'genre',
        categories: [
          { value: 'facade', modelId: 'objet:applique_facade' },
          { value: 'voirie', modelId: 'streetlamp' },
          { value: 'sans', modelId: '' },
        ],
        defaultModelId: 'objet:mat_crosse',
      },
    }), null);
    const m = layers[0].style.model;
    assert.equal(m.mode, 'categorized');
    assert.deepEqual(m.categories, [
      { value: 'facade', modelId: 'objet:applique_facade' },
      { value: 'voirie', modelId: 'streetlamp' },
    ]);
    assert.equal(m.defaultModelId, 'objet:mat_crosse');
  });
});

describe('colonne atlas_3d_json : le modèle d’un objet', () => {
  const feature = (modelId) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [5.4, 43.3] },
    properties: { _row_id: 9, _scale: 1, _modelId: modelId },
  });
  const l = { ...couche('streetlamp'), _fields: [], _gristColumns: [] };

  it('un objet réaliste posé à la main sur un objet s’écrit comme un modèle low-poly', () => {
    assert.equal(JSON.parse(featureToRowUpdate(feature('objet:encastre_sol'), l).update.atlas_3d_json).modelId, 'objet:encastre_sol');
    assert.equal(JSON.parse(featureToRowUpdate(feature('lantern'), l).update.atlas_3d_json).modelId, 'lantern');
  });
});

/**
 * Tests Atlas v7 — le placement 3D ne concerne que les couches à modèles.
 * node --test projects/Atlas/tests/model-layer.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isModelLayer, objectInspectorTabs } from '../lib/model-layer.js';
import { featureToRowUpdate } from '../lib/grist-sync.js';

const couche = (mode, geometryType) => ({ style: { mode }, geometryType });

describe('isModelLayer', () => {
  it('vrai pour un point en mode bibliothèque ou modèle importé', () => {
    assert.equal(isModelLayer(couche('library', 'Point')), true);
    assert.equal(isModelLayer(couche('custom', 'MultiPoint')), true);
  });

  it('faux pour un point rendu en cercle 2D', () => {
    assert.equal(isModelLayer(couche('mapbox', 'Point')), false);
  });

  it('faux pour une surface, même en mode modèle', () => {
    // La condition « point » manque à deux des trois copies de la règle dans
    // app_v7.js : placement() lit coordinates comme [lng, lat].
    assert.equal(isModelLayer(couche('library', 'Polygon')), false);
    assert.equal(isModelLayer(couche('custom', 'MultiPolygon')), false);
    assert.equal(isModelLayer(couche('library', 'LineString')), false);
  });

  it('faux sur une couche incomplète', () => {
    assert.equal(isModelLayer(null), false);
    assert.equal(isModelLayer({}), false);
    assert.equal(isModelLayer({ geometryType: 'Point' }), false);
  });
});

describe('objectInspectorTabs', () => {
  const modele = couche('library', 'Point');
  const surface = couche('mapbox', 'Polygon');

  it('objet 3D seul — attributs puis placement', () => {
    assert.deepEqual(objectInspectorTabs({ layer: modele, multi: false }),
      ['Attributs', 'Placement 3D']);
  });

  it('objet 3D en sélection multiple — placement seul', () => {
    assert.deepEqual(objectInspectorTabs({ layer: modele, multi: true }), ['Placement 3D']);
  });

  it('objet courant — attributs seuls, jamais de placement 3D', () => {
    assert.deepEqual(objectInspectorTabs({ layer: surface, multi: false }), ['Attributs']);
  });

  it('revue — les attributs reviennent, ils portent sur l’objet courant', () => {
    // Parcourir une couche objet par objet EST une selection multiple, mais avec
    // un curseur. La regle « pas d'edition d'attributs en masse » tient : on
    // modifie celui sur lequel on est, et le corps doit le dire.
    assert.deepEqual(objectInspectorTabs({ layer: surface, multi: true, revue: true }),
      ['Attributs']);
    assert.deepEqual(objectInspectorTabs({ layer: modele, multi: true, revue: true }),
      ['Attributs', 'Placement 3D']);
  });

  it('sélection multiple non 3D — aucun onglet', () => {
    // Cas atteignable : le corps de l'inspecteur doit alors afficher un état vide
    // au lieu de retomber sur les curseurs relatifs.
    assert.deepEqual(objectInspectorTabs({ layer: surface, multi: true }), []);
  });
});

describe('écriture du placement 3D', () => {
  const feature = (props) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [9.1, 39.2] },
    properties: { _row_id: 7, _scale: 2, _rotationZ: 90, ...props },
  });

  it('sérialisé pour une couche à modèles', () => {
    const l = { ...couche('library', 'Point'), _fields: [], _gristColumns: [] };
    const { update } = featureToRowUpdate(feature(), l);
    assert.ok(update.atlas_3d_json, 'la couche 3D doit porter son placement');
    assert.equal(JSON.parse(update.atlas_3d_json).scale, 2);
  });

  it('jamais sérialisé pour une couche qui n\'est pas rendue en modèles', () => {
    // Surcharges héritées ou couche ayant changé de mode : on ne salit pas la
    // table. Ici rien d'autre n'est à écrire, donc il ne reste aucune mise à jour.
    const l = { ...couche('mapbox', 'Polygon'), _fields: [], _gristColumns: [] };
    assert.equal(featureToRowUpdate(feature(), l), null);
  });

  it('les attributs restent enregistrés sur une couche non 3D', () => {
    const l = { ...couche('mapbox', 'Polygon'), _fields: [{ name: 'nom' }], _gristColumns: [] };
    const { update } = featureToRowUpdate(feature({ nom: 'Quartier bas' }), l);
    assert.equal(update.nom, 'Quartier bas');
    assert.equal(update.atlas_3d_json, undefined);
  });
});

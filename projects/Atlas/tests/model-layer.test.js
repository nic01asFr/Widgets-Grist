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

  /** Ce que `formulairesPourCouche` rend : le principal, puis les liés. */
  const principal = { id: 'derive:Batiments', titre: 'Attributs', derive: true, surLaCouche: true };
  const visite = { id: 'visite-v2', titre: 'Visite', derive: false, surLaCouche: false };
  const desordre = { id: 'derive:Desordres', titre: 'Désordre constaté', derive: true, surLaCouche: false };
  const cles = (r) => r.map((o) => o.cle);
  const libelles = (r) => r.map((o) => o.libelle);

  it('un onglet par formulaire, le principal nommé « Attributs »', () => {
    // Le tenir a part en aurait fait une exception, alors qu'il fait la meme
    // chose que les autres : rendre un FormDef.
    const r = objectInspectorTabs({ layer: surface, formulaires: [principal, visite, desordre] });
    assert.deepEqual(libelles(r), ['Attributs', 'Visite', 'Désordre constaté']);
    assert.deepEqual(cles(r), ['derive:Batiments', 'visite-v2', 'derive:Desordres']);
  });

  it('l’ordre ne varie pas — le premier onglet fait toujours la même chose', () => {
    const r = objectInspectorTabs({ layer: surface, formulaires: [principal, visite] });
    assert.equal(r[0].libelle, 'Attributs');
    assert.equal(r[0].formulaire, principal);
  });

  it('objet 3D — le placement vient après les formulaires', () => {
    const r = objectInspectorTabs({ layer: modele, formulaires: [principal] });
    assert.deepEqual(libelles(r), ['Attributs', 'Placement 3D']);
    assert.equal(r[1].formulaire, null, 'le placement n’est pas un formulaire');
  });

  it('objet 3D en sélection multiple — placement seul', () => {
    // On ne remplit pas un formulaire sur douze objets a la fois.
    assert.deepEqual(libelles(objectInspectorTabs({ layer: modele, formulaires: [principal], multi: true })),
      ['Placement 3D']);
  });

  it('revue — les formulaires reviennent, ils portent sur l’objet courant', () => {
    // Parcourir une couche objet par objet EST une selection multiple, mais avec
    // un curseur. La regle « pas d'edition en masse » tient : on modifie celui
    // sur lequel on est, et le corps doit le dire.
    assert.deepEqual(libelles(objectInspectorTabs({ layer: surface, formulaires: [principal, visite], multi: true, revue: true })),
      ['Attributs', 'Visite']);
    assert.deepEqual(libelles(objectInspectorTabs({ layer: modele, formulaires: [principal], multi: true, revue: true })),
      ['Attributs', 'Placement 3D']);
  });

  it('aucun formulaire — aucun onglet, et le corps devra le dire', () => {
    // Cas atteignable : une couche sans table, ou dont rien n'est expose en
    // terrain. Le corps affiche alors un etat vide au lieu de retomber sur les
    // curseurs relatifs.
    assert.deepEqual(objectInspectorTabs({ layer: surface, formulaires: [] }), []);
    assert.deepEqual(objectInspectorTabs({ layer: surface }), []);
    assert.deepEqual(objectInspectorTabs({ layer: surface, formulaires: [principal], multi: true }), []);
  });

  it('un formulaire sans identifiant n’a pas d’onglet', () => {
    // Sans cle stable, l'onglet actif ne survivrait pas au rendu suivant.
    assert.deepEqual(objectInspectorTabs({ layer: surface, formulaires: [{ titre: 'X', surLaCouche: true }] }), []);
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

/**
 * Les réglages des objets du catalogue : ce qui s'enregistre, et ce qui revient.
 *
 * node --test projects/Atlas/tests/parametres-persistance.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lireCatalogue } from '../lib/catalogue-objets.js';
import { descripteursDuType, proprietesEffectives } from '../lib/parametres-objet.js';
import { layerPrefsPayload, applyLayerPrefsBinding } from '../lib/manifest-binding.js';
import { lignePrefs, featureToRowUpdate, applyAtlas3dFromRows } from '../lib/grist-sync.js';

const CAT = lireCatalogue(
  JSON.parse(readFileSync(new URL('../objets/catalog.json', import.meta.url), 'utf8')),
  'https://exemple.test/objets/catalog.json',
);
const mat = descripteursDuType(CAT.types.find((t) => t.id === 'mat_crosse'));

const couche = (parametres) => ({
  id: 'l1', name: 'Luminaires', geometryType: 'Point', sourceTable: 'Luminaires', style: { mode: 'library', library: { modelId: 'objet:mat_crosse' } },
  parametres,
});

// ---------------------------------------------------------------------------
// Ce qui atteint les calculs
// ---------------------------------------------------------------------------

test('un reglage explicite atteint les calculs, meme pour ce qui ne sert qu a l affichage', () => {
  const reglage = { valeurs: { mat_crosse: { statut: 'decommissioned', allumageSoir: '-15CS', comportement: 'toujours' } } };
  const { props } = proprietesEffectives({}, mat, { couche: reglage, typeId: 'mat_crosse' });
  assert.equal(props.statut, 'decommissioned');
  assert.equal(props.allumageSoir, '-15CS');
  assert.equal(props.comportement, 'toujours');
});

test('un simple defaut n atteint pas les calculs quand le parametre ne l a pas demande', () => {
  const { props } = proprietesEffectives({}, mat, { typeId: 'mat_crosse' });
  assert.equal(props.allumageSoir, undefined);
  assert.equal(props.statut, undefined);
  assert.equal(props.puissance, 38, 'la puissance, elle, l a demande');
});

// ---------------------------------------------------------------------------
// Atlas_LayerPrefs
// ---------------------------------------------------------------------------

test('les reglages de la couche voyagent dans Atlas_LayerPrefs et en reviennent', () => {
  const reglages = { valeurs: { mat_crosse: { puissance: 70 }, '*': { temperatureCouleur: 2700 } }, liaisons: { hauteurFeu: 'height' } };
  const ligne = lignePrefs(couche(reglages));
  const relu = JSON.parse(ligne.StyleJSON);
  assert.deepEqual(relu.parametres, reglages);

  const l = couche(undefined);
  applyLayerPrefsBinding(l, { style: relu, prefRowId: 1, visible: true });
  assert.deepEqual(l.parametres, reglages);
});

test('une couche sans reglage n ecrit rien', () => {
  assert.equal(layerPrefsPayload(couche(undefined)).parametres, null);
  assert.equal(layerPrefsPayload(couche({ valeurs: {}, liaisons: {} })).parametres, null);
});

test('un enregistrement abime ne regle rien et ne leve pas', () => {
  for (const abime of ['x', 12, [], { valeurs: 'x' }, { valeurs: { a: 1 }, liaisons: [1] }]) {
    const l = couche(undefined);
    applyLayerPrefsBinding(l, { style: { parametres: abime }, prefRowId: 1, visible: true });
    assert.equal(l.parametres, undefined, JSON.stringify(abime));
  }
});

test('un enregistrement d avant, sans parametres, laisse ceux de la couche', () => {
  const l = couche({ valeurs: { '*': { puissance: 50 } }, liaisons: {} });
  applyLayerPrefsBinding(l, { style: { mode: 'library' }, prefRowId: 1, visible: true });
  assert.deepEqual(l.parametres, { valeurs: { '*': { puissance: 50 } }, liaisons: {} });
});

// ---------------------------------------------------------------------------
// atlas_3d_json : les reglages d'un objet
// ---------------------------------------------------------------------------

const objet = (props) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [5.4, 43.3] }, properties: { _row_id: 4, ...props } });
const coucheTable = () => ({ ...couche(undefined), _fields: [], _gristColumns: [] });

test('les reglages d un objet s ecrivent avec son placement, jamais comme colonnes', () => {
  const { update } = featureToRowUpdate(objet({ _scale: 1, _params: { puissance: 20, statut: 'functional', x: {} } }), coucheTable());
  const o = JSON.parse(update.atlas_3d_json);
  assert.deepEqual(o.params, { puissance: 20, statut: 'functional' });
  assert.equal(update._params, undefined);
  assert.equal(update.puissance, undefined, 'la table de l equipe n est pas touchee');
});

test('sans reglage d objet, rien n est ajoute au placement', () => {
  const { update } = featureToRowUpdate(objet({ _scale: 2 }), coucheTable());
  assert.equal(JSON.parse(update.atlas_3d_json).params, undefined);
});

test('les reglages d un objet reviennent de la table sous le nom _params', () => {
  const geojson = { features: [objet({})] };
  applyAtlas3dFromRows([{ id: 4, atlas_3d_json: JSON.stringify({ scale: 1.5, params: { hauteurFeu: 8 } }) }], geojson);
  assert.deepEqual(geojson.features[0].properties._params, { hauteurFeu: 8 });
  assert.equal(geojson.features[0].properties._scale, 1.5);
});

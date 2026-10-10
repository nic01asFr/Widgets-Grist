/**
 * Itinéraire orienté : les sens de circulation d'OpenStreetMap (`oneway`, `junction`, `highway`) sont respectés comme ceux de la BD TOPO.
 * L'import OSM d'Atlas garde toutes les étiquettes de l'élément dans les propriétés de l'entité (`osmToGeoJSON`).
 *
 * node --test projects/Atlas/tests/itineraire-sens-osm.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { construireReseau, cheminEntre, sensOsm } from '../lib/itineraire.js';

const tron = (props, ...coords) => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } });
const A = [5.000, 43.000], B = [5.0123, 43.000], C = [5.0123, 43.009], D = [5.000, 43.009];
const carre = (propsAB) => [tron(propsAB, A, B), tron({ highway: 'residential' }, B, C), tron({ highway: 'residential' }, C, D), tron({ highway: 'residential' }, D, A)];

test('sensOsm : oneway explicite, jonctions et autoroutes implicites, le reste à double sens', () => {
  for (const v of ['yes', 'true', '1', 'YES', ' yes ']) assert.equal(sensOsm({ oneway: v }), 'direct', v);
  for (const v of ['-1', 'reverse']) assert.equal(sensOsm({ oneway: v }), 'inverse', v);
  for (const v of ['no', 'false', '0']) assert.equal(sensOsm({ oneway: v }), 'double', v);
  assert.equal(sensOsm({ junction: 'roundabout' }), 'direct');
  assert.equal(sensOsm({ junction: 'circular' }), 'direct');
  assert.equal(sensOsm({ highway: 'motorway' }), 'direct');
  assert.equal(sensOsm({ highway: 'motorway_link' }), 'direct');
  assert.equal(sensOsm({ highway: 'residential' }), 'double');
  for (const v of [undefined, null, {}, { oneway: 'n importe quoi' }, { oneway: 42 }]) assert.equal(sensOsm(v), 'double', JSON.stringify(v));
});

test('oneway=no l\'emporte sur l\'implicite (jonction, autoroute)', () => {
  assert.equal(sensOsm({ oneway: 'no', junction: 'roundabout' }), 'double');
  assert.equal(sensOsm({ oneway: 'no', highway: 'motorway' }), 'double');
});

test('un réseau OSM sans sens à signaler n\'est pas orienté, et se comporte comme avant', () => {
  const r = construireReseau(carre({ highway: 'residential' }));
  assert.equal(r.oriente, false);
});

test('oneway=yes : de A vers B directement, de B vers A par le détour', () => {
  const r = construireReseau(carre({ highway: 'residential', oneway: 'yes' }));
  assert.equal(r.oriente, true);
  const aller = cheminEntre(r, A, B), retour = cheminEntre(r, B, A);
  assert.ok(aller.ok && retour.ok);
  assert.ok(aller.longueurM < 1200, 'le tronçon direct');
  assert.ok(retour.longueurM > 2000, 'le détour par le reste du carré');
});

test('oneway=-1 : le sens est inversé', () => {
  const r = construireReseau(carre({ highway: 'residential', oneway: '-1' }));
  const aller = cheminEntre(r, A, B), retour = cheminEntre(r, B, A);
  assert.ok(retour.longueurM < 1200 && aller.longueurM > 2000);
});

test('la BD TOPO l\'emporte quand les deux sont présentes ; une valeur BD TOPO vide laisse OSM décider', () => {
  const bdtopo = construireReseau(carre({ sens_de_circulation: 'Double sens', oneway: 'yes' }));
  assert.equal(bdtopo.oriente, false, 'la BD TOPO dit double sens');
  const vide = construireReseau(carre({ sens_de_circulation: '', oneway: 'yes' }));
  assert.equal(vide.oriente, true, 'colonne vide : OSM décide');
});

test('une entité sans propriétés ne plante pas', () => {
  assert.doesNotThrow(() => construireReseau([{ type: 'Feature', geometry: { type: 'LineString', coordinates: [A, B] } }]));
});

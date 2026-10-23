// L'état initial d'un contrôle se déclare dans le manifeste (`active: true` + `values`, `min`/`max` ou `texte`) : il s'applique au montage, sans `setFilter`.
// Mesuré aussi en navigateur le 21/10/2026 (carte nue, 5 entités : 2 retenues, légende suivant le filtre).
// node --test tests/bi-controles-etat-initial.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { carteSimulee } from './aide-carte-bi.js';

const feat = (id, nature, h, x) => ({ type: 'Feature', id, properties: { nature, hauteur: h }, geometry: { type: 'Point', coordinates: [5.30 + x * 0.01, 43.30] } });
const donnees = () => ({ bati: [feat(1, 'Industriel', 10, 0), feat(2, 'Religieux', 20, 1), feat(3, 'Industriel', 30, 2), feat(4, 'Sportif', 40, 3), feat(5, 'Industriel', 50, 4)] });
const manifeste = (controls) => ({ layers: [{ id: 'bati', name: 'Bati', geometry_type: 'point', cle: 'cle',
  style: { declarative: { kind: 'categorized', field: 'nature', stops: [{ value: 'Industriel', color: '#aa3300' }, { value: 'Religieux', color: '#3366aa' }, { value: 'Sportif', color: '#00aa44' }] } },
  controls }] });
const ids = (rt) => rt.api.getRows('bati').lignes.map((l) => l.id);

test('select et range déclarés actifs : appliqués au montage, la légende suit', async () => {
  const rt = attacher(carteSimulee());
  const retour = await rt.api.setScene(manifeste([
    { id: 'c_nature', type: 'select', field: 'nature', active: true, values: ['Industriel', 'Religieux'] },
    { id: 'c_haut', type: 'range', field: 'hauteur', active: true, min: 15, max: 45 },
  ]), donnees());
  assert.equal(retour.bati, 5, 'setScene rend le total des entités, pas le nombre retenu');
  assert.deepEqual(ids(rt), [2, 3]);
  assert.deepEqual(rt.api.getLegend('bati').classes.map((c) => c.libelle + ':' + c.compte), ['Industriel:1', 'Religieux:1', 'Sportif:0']);
  assert.deepEqual(await rt.api.setFilter('c_nature', null), { layer: 'bati', compte: 3, total: 5 });
  assert.deepEqual(ids(rt), [2, 3, 4]);
  assert.deepEqual(await rt.api.setFilter('c_haut', null), { layer: 'bati', compte: 5, total: 5 });
});

test('un contrôle sans `active` n\'est pas appliqué ; text déclaré actif l\'est ; renvoyer la scène rejoue l\'état déclaré', async () => {
  const rt = attacher(carteSimulee());
  await rt.api.setScene(manifeste([{ id: 'c_nature', type: 'select', field: 'nature', values: ['Sportif'] }]), donnees());
  assert.equal(ids(rt).length, 5, 'proposé, pas appliqué');
  await rt.api.setScene(manifeste([{ id: 'c_texte', type: 'text', field: 'nature', active: true, texte: 'relig' }]), donnees());
  assert.deepEqual(ids(rt), [2]);
  await rt.api.setFilter('c_texte', null); assert.equal(ids(rt).length, 5);
  await rt.api.setScene(manifeste([{ id: 'c_texte', type: 'text', field: 'nature', active: true, texte: 'relig' }]), donnees());
  assert.deepEqual(ids(rt), [2], 'un renvoi de scène remet l\'état déclaré dans le manifeste, pas celui d\'avant');
});

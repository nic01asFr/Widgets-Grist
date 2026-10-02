/**
 * L'historique d'apparence : instantanés exacts, pile annuler / rétablir.
 *
 * node --test projects/Atlas/tests/historique-apparence.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { capturerApparence, restaurerApparence, memeApparence, Historique, PAS_MAX } from '../lib/historique-apparence.js';

const couche = () => ({
  id: 'l1', name: 'Ouvrages', color: '#336699', visible: true, geometryType: 'Point', sourceTable: 'Ouvrages',
  style: { mode: 'mapbox', symbolization: { color: { mode: 'single', value: '#336699' }, size: { mode: 'single', value: 8 } }, polygonMode: 'flat', library: { modelId: 'banc', autre: 1 } },
  controls: [{ field: 'Etat', type: 'select', active: true, values: ['A', 'B'] }],
  _rank: 3,
});

test('capturer : une signature stable, indépendante de l’identité des objets', () => {
  const a = capturerApparence(couche());
  const b = capturerApparence(couche());
  assert.equal(a.sig, b.sig);
  assert.ok(memeApparence(a, b));
  assert.equal(memeApparence(a, null), false);
});

test('la signature change quand l’apparence change — et seulement alors', () => {
  const l = couche();
  const avant = capturerApparence(l);
  l.name = 'Autre nom'; l.geojson = { features: [1, 2, 3] };   // ni le nom ni les entités ne sont de l’apparence
  assert.ok(memeApparence(avant, capturerApparence(l)));
  l.style.symbolization.color.value = '#ff0000';
  assert.equal(memeApparence(avant, capturerApparence(l)), false);
  const l2 = couche(); l2.visible = false;
  assert.equal(memeApparence(avant, capturerApparence(l2)), false, 'la visibilité en fait partie');
  const l3 = couche(); l3.controls[0].active = false;
  assert.equal(memeApparence(avant, capturerApparence(l3)), false, 'les contrôles aussi');
});

test('restaurer : l’état d’avant revient à l’identique, y compris ce que les préférences ne sauraient superposer', () => {
  const l = couche();
  const avant = capturerApparence(l);
  l.style.symbolization.color = { mode: 'categorized', field: 'Etat', categories: [{ value: 'A', color: '#0f0' }] };
  delete l.style.polygonMode;
  l.style.library.modelId = 'lampadaire';
  l.controls.push({ field: 'Hauteur', type: 'range' });
  l._rank = 9; l.visible = false;
  restaurerApparence(l, avant);
  assert.deepEqual(l.style.symbolization.color, { mode: 'single', value: '#336699' });
  assert.equal(l.style.polygonMode, 'flat', 'une clé retirée revient');
  assert.equal(l.style.library.modelId, 'banc');
  assert.equal(l.controls.length, 1, 'le contrôle ajouté disparaît');
  assert.equal(l._rank, 3);
  assert.equal(l.visible, true);
  assert.ok(memeApparence(avant, capturerApparence(l)));
});

test('restaurer : une copie, pas un partage — modifier la couche ensuite ne défait pas l’instantané', () => {
  const l = couche();
  const snap = capturerApparence(l);
  restaurerApparence(l, snap);
  l.style.symbolization.size.value = 99;
  l.controls[0].values.push('C');
  const encore = capturerApparence(couche());
  assert.ok(memeApparence(snap, encore), 'l’instantané est resté ce qu’il était');
  restaurerApparence(l, snap);
  assert.equal(l.style.symbolization.size.value, 8);
  assert.deepEqual(l.controls[0].values, ['A', 'B']);
});

test('restaurer : une clé absente de l’instantané est retirée de la couche', () => {
  const l = couche(); delete l._rank; delete l.controls;
  const snap = capturerApparence(l);
  l._rank = 5; l.controls = [{ field: 'X' }];
  restaurerApparence(l, snap);
  assert.equal('_rank' in l, false);
  assert.equal('controls' in l, false);
  assert.equal(restaurerApparence(null, snap), null, 'sans couche, rien');
  assert.equal(restaurerApparence(couche(), null).id, 'l1', 'sans instantané, rien');
});

test('la pile : annuler, rétablir, un nouveau pas vide le rétablissement', () => {
  const h = new Historique();
  const s = (n) => ({ sig: String(n), visible: true, etat: {} });
  assert.equal(h.peutAnnuler(), false);
  assert.equal(h.annuler(), null);
  assert.equal(h.enregistrer('a', s(1), s(2)), true);
  assert.equal(h.enregistrer('a', s(2), s(3)), true);
  assert.equal(h.enregistrer('b', s(1), s(1)), false, 'rien n’a changé : rien à retenir');
  assert.equal(h.enregistrer('', s(1), s(2)), false, 'sans couche, rien');
  assert.equal(h.prochaineAnnulation(), 'a');
  const p = h.annuler();
  assert.equal(p.apres.sig, '3');
  assert.equal(h.peutRetablir(), true);
  assert.equal(h.prochainRetablissement(), 'a');
  assert.equal(h.retablir().apres.sig, '3');
  assert.equal(h.peutRetablir(), false);
  h.annuler();
  h.enregistrer('b', s(1), s(5));
  assert.equal(h.peutRetablir(), false, 'un nouveau pas défait le « rétablir »');
  assert.equal(h.taille, 2);
});

test('la pile est bornée, s’oublie d’une couche retirée, se vide', () => {
  const h = new Historique(3);
  const s = (n) => ({ sig: String(n), visible: true, etat: {} });
  for (let i = 0; i < 5; i++) h.enregistrer('a', s(i), s(i + 1));
  assert.equal(h.taille, 3);
  assert.equal(h.annuler().avant.sig, '4', 'les plus anciens sont partis');
  h.enregistrer('b', s(0), s(1));
  h.oublier('a');
  assert.equal(h.taille, 1);
  assert.equal(h.peutRetablir(), false);
  h.vider();
  assert.equal(h.peutAnnuler(), false);
  assert.ok(PAS_MAX >= 20);
});

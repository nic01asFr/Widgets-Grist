/**
 * Échéance : ce qui est à faire et ce qui est en retard.
 *
 * node --test projects/Atlas/tests/echeance.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { configEcheance, classeEcheance, compterEcheances, expressionCouronne, phraseEcheances, COULEURS_ECHEANCE } from '../lib/echeance.js';

const cfg = { field: 'delai', bientot: 1 };

test('sans champ désigné, pas d\'échéance', () => {
  assert.equal(configEcheance(undefined), null);
  assert.equal(configEcheance({ echeance: {} }), null);
  assert.deepEqual(configEcheance({ echeance: { field: 'delai' } }), { field: 'delai', bientot: 1 });
  assert.deepEqual(configEcheance({ echeance: { field: 'delai', bientot: 3 } }), { field: 'delai', bientot: 3 });
  assert.equal(configEcheance({ echeance: { field: 'delai', bientot: -2 } }).bientot, 1);
});

test('classes : négatif en retard, de zéro au seuil à faire, au-delà à jour', () => {
  assert.equal(classeEcheance(-6, cfg), 'retard');
  assert.equal(classeEcheance(-0.5, cfg), 'retard');
  assert.equal(classeEcheance(0, cfg), 'bientot');
  assert.equal(classeEcheance(1, cfg), 'bientot');
  assert.equal(classeEcheance(2, cfg), 'ajour');
  assert.equal(classeEcheance(5, cfg), 'ajour');
});

test('une valeur vide ou illisible n\'est pas zéro : « sans délai »', () => {
  for (const v of [null, undefined, '', 'abc', NaN]) assert.equal(classeEcheance(v, cfg), 'inconnu');
  assert.equal(classeEcheance('3,5', cfg), 'ajour');
  assert.equal(classeEcheance('-2', cfg), 'retard');
  assert.equal(classeEcheance(3, null), 'inconnu');
});

test('comptes d\'une couche', () => {
  const f = (d) => ({ properties: { delai: d } });
  const c = compterEcheances([f(-6), f(-1), f(0), f(1), f(5), f(5), f(null)], cfg);
  assert.deepEqual(c, { retard: 2, bientot: 2, ajour: 2, inconnu: 1 });
  assert.equal(phraseEcheances(c), '2 en retard · 2 à faire');
  assert.equal(phraseEcheances({ retard: 0, bientot: 0, ajour: 4, inconnu: 0 }), '');
});

test('l\'expression de la couronne suit les mêmes seuils, et reste transparente sinon', () => {
  const e = expressionCouronne(cfg);
  assert.equal(e[0], 'case');
  assert.deepEqual(e[1], ['<', ['to-number', ['get', 'delai'], 1e9], 0]);
  assert.equal(e[2], COULEURS_ECHEANCE.retard);
  assert.deepEqual(e[3], ['<=', ['to-number', ['get', 'delai'], 1e9], 1]);
  assert.equal(e[4], COULEURS_ECHEANCE.bientot);
  assert.equal(e[5], 'rgba(0,0,0,0)');
  assert.equal(expressionCouronne(null), 'rgba(0,0,0,0)');
});

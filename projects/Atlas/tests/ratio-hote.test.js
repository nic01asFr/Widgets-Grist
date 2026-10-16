/**
 * Plafond du ratio de pixels demandé par l'hôte : lecture sûre du paramètre `ratio`, bornes, et passage par l'attribut `ratio-max` de `<atlas-bi>`.
 * node --test projects/Atlas/tests/ratio-hote.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ratioMaxDemande, plafondLePlusStrict, RATIO_MIN, RATIO_MAX } from '../lib/ratio-hote.js';
import { urlComposant } from '../lib/bi/atlas-bi-element.js';

test('absent, vide ou illisible : aucun plafond (le ratio de l\'appareil s\'applique)', () => {
  for (const q of ['', '?bi=1', '?ratio=', '?ratio=abc', '?ratio=0', '?ratio=-2', '?ratio=NaN', '?ratio=Infinity', null, undefined]) {
    assert.equal(ratioMaxDemande(q), null, String(q));
  }
});

test('un plafond lisible est gardé, borné à 1..4, virgule décimale acceptée', () => {
  assert.equal(ratioMaxDemande('?ratio=2'), 2);
  assert.equal(ratioMaxDemande('ratio=1.5'), 1.5);
  assert.equal(ratioMaxDemande('?ratio=1,5'), 1.5);
  assert.equal(ratioMaxDemande('?ratio=0.5'), RATIO_MIN);
  assert.equal(ratioMaxDemande('?ratio=9'), RATIO_MAX);
  assert.equal(ratioMaxDemande(new URLSearchParams('ratio=3')), 3);
});

test('le plus strict de deux plafonds ; null = pas de plafond', () => {
  assert.equal(plafondLePlusStrict(null, null), null);
  assert.equal(plafondLePlusStrict(2, null), 2);
  assert.equal(plafondLePlusStrict(null, 1.5), 1.5);
  assert.equal(plafondLePlusStrict(2, 1), 1);
  assert.equal(plafondLePlusStrict(1, 2), 1);
});

test('<atlas-bi ratio-max> : ajouté à l\'adresse sans écraser un `ratio` déjà présent', () => {
  assert.equal(urlComposant('https://a.test/atlas/', 'https://h.test', undefined, '2').searchParams.get('ratio'), '2');
  assert.equal(urlComposant('https://a.test/atlas/?ratio=1', 'https://h.test', undefined, '2').searchParams.get('ratio'), '1');
  assert.equal(urlComposant('https://a.test/atlas/', 'https://h.test', undefined, null).searchParams.has('ratio'), false);
});

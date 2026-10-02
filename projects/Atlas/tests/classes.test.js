/**
 * Des classes par seuils : classes bornées à la main, hautes inclusives, couleurs vides.
 *
 * node --test projects/Atlas/tests/classes.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  seuilsPropres, stopsDepuisSeuils, seuilsDeStops, classeDe, comptesParClasse, libelleClasse,
  inverserCouleurs, seuilsAutomatiques, stopsPourCarte, TRANSPARENT,
} from '../lib/classes.js';

test('seuils : triés, sans doublon, sans valeur illisible', () => {
  assert.deepEqual(seuilsPropres([5, 1, 'x', 5, null, 3, NaN]), [1, 3, 5]);
});

test('des seuils font des classes bornées : ouverte en bas, ouverte en haut', () => {
  const s = stopsDepuisSeuils([-1, 1], ['#d64545', '#f0b429', '']);
  assert.equal(s.length, 3);
  assert.deepEqual([s[0].lower, s[0].upper], [undefined, -1]);
  assert.deepEqual([s[1].lower, s[1].upper], [-1, 1]);
  assert.deepEqual([s[2].lower, s[2].upper], [1, undefined]);
  assert.equal(s[2].color, '');
});

test('des couleurs en moins sont complétées, en trop ignorées', () => {
  assert.equal(stopsDepuisSeuils([0, 10], ['#111']).length, 3);
  assert.equal(stopsDepuisSeuils([0], ['#111', '#222', '#333']).length, 2);
  assert.equal(stopsDepuisSeuils([], []).length, 1);
});

test('aller-retour : les seuils et les couleurs se retrouvent', () => {
  const s = stopsDepuisSeuils([2, 8], ['#a', '#b', '#c']);
  assert.deepEqual(seuilsDeStops(s), { seuils: [2, 8], couleurs: ['#a', '#b', '#c'] });
});

test('classes hautes inclusives : une valeur sur le seuil reste dans la classe du dessous', () => {
  const s = stopsDepuisSeuils([-1, 1], ['r', 'o', 'v']);
  assert.equal(classeDe(-6, s), 0);
  assert.equal(classeDe(-1, s), 0);
  assert.equal(classeDe(-0.5, s), 1);
  assert.equal(classeDe(0, s), 1);
  assert.equal(classeDe(1, s), 1);
  assert.equal(classeDe(1.01, s), 2);
  assert.equal(classeDe(500, s), 2);
});

test('une valeur vide ou illisible n\'a pas de classe : ce n\'est pas zéro', () => {
  const s = stopsDepuisSeuils([0], ['a', 'b']);
  for (const v of [null, undefined, '', 'abc', NaN]) assert.equal(classeDe(v, s), -1);
  assert.equal(classeDe('2,5', s), 1);
});

test('comptes par classe, avec les objets sans valeur', () => {
  const s = stopsDepuisSeuils([-1, 1], ['r', 'o', 'v']);
  const f = (d) => ({ properties: { delai: d } });
  const r = comptesParClasse([f(-6), f(-1), f(0), f(1), f(5), f(null)], 'delai', s);
  assert.deepEqual(r, { comptes: [2, 2, 1], sansValeur: 1 });
});

test('libellés des classes', () => {
  const s = stopsDepuisSeuils([-1, 1], ['r', 'o', 'v']);
  assert.deepEqual([0, 1, 2].map((i) => libelleClasse(s, i)), ['jusqu’à -1', 'de -1 à 1', 'au-delà de 1']);
  assert.equal(libelleClasse(stopsDepuisSeuils([0.5], ['a', 'b']), 0), 'jusqu’à 0,5');
});

test('inverser les couleurs ne touche pas aux seuils', () => {
  const s = inverserCouleurs(stopsDepuisSeuils([2, 8], ['#a', '#b', '#c']));
  assert.deepEqual(seuilsDeStops(s), { seuils: [2, 8], couleurs: ['#c', '#b', '#a'] });
});

test('découpage automatique : des seuils ronds entre le minimum et le maximum', () => {
  assert.deepEqual(seuilsAutomatiques(0, 90, 3), [30, 60]);
  assert.deepEqual(seuilsAutomatiques(5, 5, 3), [5]);
  assert.deepEqual(seuilsAutomatiques(NaN, 5, 3), []);
  const s = seuilsAutomatiques(-6, 5, 3);
  assert.equal(s.length, 2);
  assert.ok(s[0] > -6 && s[1] < 5 && s[0] < s[1]);
});

test('pour la carte : une couleur vide est transparente', () => {
  const s = stopsPourCarte(stopsDepuisSeuils([0], ['#d64545', '']));
  assert.equal(s[0].color, '#d64545');
  assert.equal(s[1].color, TRANSPARENT);
});

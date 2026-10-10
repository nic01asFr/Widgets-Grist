// Jetons de conception à points (`etat.ok`, `carte.fond`) : admis par la charte comme ils l'étaient par le thème 0.3.
// node --test tests/charte-jetons-points.test.js   (aucun accès réseau, aucune dépendance)
import test from 'node:test';
import assert from 'node:assert/strict';
import { assainir } from '../lib/charte/schema.js';
import { resoudreJeton, jetonsDe } from '../lib/charte/resolution.js';

test('un nom de jeton à points est admis et se résout', () => {
  const { charte, ignore } = assainir({ version: 'atlas-charte/0.1', jetons: { 'etat.ok': '#1e6b3e', 'carte.fond': '#f4f7fc', 'ord-1': '#ef7757' } });
  assert.deepEqual(ignore.filter((i) => i.code === 'nom-invalide'), []);
  const jetons = jetonsDe(charte);
  assert.equal(resoudreJeton('jeton:etat.ok', jetons), '#1e6b3e');
  assert.equal(resoudreJeton('jeton:carte.fond', jetons), '#f4f7fc');
  assert.equal(resoudreJeton('jeton:ord-1', jetons), '#ef7757');
});
test('les noms dangereux ou mal formés restent refusés', () => {
  const { charte, ignore } = assainir({ version: 'atlas-charte/0.1', jetons: { '__proto__': '#000000', constructor: '#000000', '.cache': '#000000', '-x': '#000000', 'a b': '#000000', 'a/b': '#000000', ['x'.repeat(41)]: '#000000' } });
  assert.ok(ignore.filter((i) => i.code === 'nom-invalide').length >= 6);
  assert.deepEqual(Object.keys(jetonsDe(charte)).filter((k) => !['principal', 'secondaire', 'encre', 'fond', 'succes', 'alerte', 'erreur', 'information'].includes(k)), []);
  assert.equal(Object.getPrototypeOf(charte.jetons || {}) === Object.prototype || charte.jetons === undefined, true);
});
test('une référence mal formée ou inconnue donne le repli, jamais du texte', () => {
  const jetons = { 'etat.ok': '#1e6b3e' };
  assert.equal(resoudreJeton('jeton:etat.inconnu', jetons), '#808080');
  assert.equal(resoudreJeton('jeton:.etat', jetons), '#808080');
  assert.equal(resoudreJeton('jeton:__proto__', jetons), '#808080');
  assert.equal(resoudreJeton('jeton:etat ok', jetons), '#808080');
  assert.equal(resoudreJeton('#112233', jetons), '#112233');
});

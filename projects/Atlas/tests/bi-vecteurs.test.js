// Vecteurs de conformité du pont BI : générés en exécutant le pont, jamais écrits à la main.
// node --test tests/bi-vecteurs.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { construireVecteurs, VERSION_VECTEURS } from '../tools/generer-vecteurs-bi.mjs';
import { CAPACITES, VERSION } from '../lib/bi/pont.js';

test('vecteurs : version_vecteurs entier, versions du contrat et capacites', () => {
  const v = construireVecteurs();
  assert.ok(Number.isInteger(v.version_vecteurs) && v.version_vecteurs === VERSION_VECTEURS && v.version_vecteurs >= 1);
  assert.equal(v.version_contrat, VERSION);
  assert.deepEqual(v.capacites, [...CAPACITES]);
  assert.ok(Object.keys(v.capacite_de_commande).every((c) => v.commandes.includes(c)));
});

test('vecteurs : ready avec paquet null ET avec paquet lu, resultat capacite_absente', () => {
  const v = construireVecteurs(); const parNom = (re) => v.sortantes.find((x) => re.test(x.nom));
  const nul = parNom(/paquet null/).message; assert.equal(nul.type, 'ready'); assert.equal(nul.charge.runtime, true); assert.equal(nul.charge.paquet, null); assert.deepEqual(nul.charge.capacites, [...CAPACITES]);
  const lu = parNom(/paquet lu/).message; assert.deepEqual(lu.charge.capacites, ['points', 'socle']); assert.deepEqual(Object.keys(lu.charge.paquet), ['version_paquet', 'edition_admin_express', 'recensement']);
  const r = parNom(/capacite_absente/).message;
  assert.equal(r.ok, false); assert.equal(r.code, 'capacite_absente'); assert.equal(r.capacite, 'temps'); assert.match(r.erreur, /^capacite_absente : /);
});

test('vecteurs : chaque verdict entrant est celui du pont (aucune valeur ecrite a la main)', () => {
  const v = construireVecteurs();
  assert.equal(v.entrantes.find((e) => /origine non declaree/.test(e.nom)).attendu.code, 'origine');
  assert.equal(v.entrantes.find((e) => /ping valide/.test(e.nom)).attendu.accepte, true);
});

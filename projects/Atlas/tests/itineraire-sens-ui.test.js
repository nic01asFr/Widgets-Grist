/**
 * Branchement dans l'application : la case « Respecter les sens de circulation » et le recalcul orienté.
 * `app_v7.js` est un module du navigateur qu'on ne charge pas ici : on vérifie le texte du source, site par site.
 *
 * node --test projects/Atlas/tests/itineraire-sens-ui.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = fs.readFileSync(path.join(RACINE, 'app_v7.js'), 'utf8');
const compte = (motif) => APP.split(motif).length - 1;

test('la case n\'est proposée que si le réseau porte des sens, sinon un message dit que le tracé vaut à pied', () => {
  assert.equal(compte('s.reseau.oriente'), 1);
  assert.equal(compte('onchange="A.itineraireSens(this.checked)"'), 1);
  assert.equal(compte('Respecter les sens de circulation'), 1);
  assert.equal(compte('ne porte pas de sens de circulation : le tracé vaut à pied'), 1);
});

test('le réseau d\'un itinéraire démarre en respectant les sens, et le recalcul transmet le choix', () => {
  assert.equal(compte('calcul: null, respecterSens: true }'), 1);
  assert.equal(compte('calculerItineraire(s.reseau, s.points, { oriente: s.respecterSens !== false })'), 1);
});

test('A.itineraireSens enregistre le choix et recalcule le tracé', () => {
  const i = APP.indexOf('itineraireSens(oui) {');
  assert.ok(i > 0);
  const corps = APP.slice(i, APP.indexOf('},', i));
  assert.match(corps, /s\.respecterSens = !!oui/);
  assert.match(corps, /recalculerItineraire\(\)/);
});

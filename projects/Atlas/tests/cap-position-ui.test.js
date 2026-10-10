/**
 * Branchement dans l'application de la flèche de cap : posée par le gestionnaire de position, retirée à l'erreur.
 * `app_v7.js` est un module du navigateur qu'on ne charge pas ici : on vérifie le texte du source, site par site.
 *
 * node --test projects/Atlas/tests/cap-position-ui.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = fs.readFileSync(path.join(RACINE, 'app_v7.js'), 'utf8');
const compte = (motif) => APP.split(motif).length - 1;

test('la flèche de cap : posée par le gestionnaire de position, retirée à l\'erreur, jamais sans cap fiable', () => {
  assert.equal(compte("import { capUtilisable } from './lib/cap-position.js"), 1);
  assert.equal(compte('poserCapPosition(p.coords);'), 1);
  const iErr = APP.indexOf("_geoloc.on('error'");
  assert.match(APP.slice(iErr, iErr + 200), /retirerCapPosition\(\)/);
  const i = APP.indexOf('function poserCapPosition(coords) {');
  assert.match(APP.slice(i, i + 200), /capUtilisable\(coords\)/);
  assert.match(APP.slice(i, i + 300), /cap === null \|\| !map\) \{ retirerCapPosition\(\); return; \}/);
  assert.match(APP, /pointer-events:none/, 'la flèche ne capte pas les clics de la carte');
});

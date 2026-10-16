/**
 * La promotion d'Atlas ne réécrit pas le moteur de formulaires embarqué (figé à la version publiée) : seule l'option
 * `--maj-moteur-formulaires` le met à jour. Avant, chaque promotion recopiait la version de développement et il fallait la défaire à la main.
 * node --test projects/Atlas/tests/promotion-moteur-fige.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const promo = fs.readFileSync(path.join(RACINE, 'scripts', 'promote-atlas.js'), 'utf8');

test('la promotion garde le moteur embarqué tel quel, sauf --maj-moteur-formulaires', () => {
  assert.match(promo, /process\.argv\.includes\('--maj-moteur-formulaires'\)/);
  assert.match(promo, /if \(!MAJ_MOTEUR && fs\.existsSync\(to\)\) \{ moteurGarde\+\+; continue; \}/);
});

test('le moteur embarqué existe dans la publication (les sept fichiers de la liste nommée)', () => {
  const liste = [...promo.matchAll(/'((?:shared|runtime)\/[\w.-]+\.js)'/g)].map((m) => m[1]);
  assert.equal(liste.length, 7);
  for (const rel of liste) assert.ok(fs.existsSync(path.join(RACINE, 'published', 'atlas', 'vendor', 'grist_forms', rel)), rel);
});

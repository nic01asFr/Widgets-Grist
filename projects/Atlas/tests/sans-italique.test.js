/**
 * L'interface d'Atlas n'a plus d'italique : titres de panneau, légende, valeurs mixtes, catégories vides, contour, étiquette de formulaire.
 * node --test projects/Atlas/tests/sans-italique.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const lire = (f) => fs.readFileSync(path.join(ICI, '..', f), 'utf8');

test('index_v7.html, app_v7.js et le style des formulaires ne demandent aucun italique', () => {
  for (const f of ['index_v7.html', 'app_v7.js', 'lib/formulaire-atlas.css']) assert.ok(!/italic/.test(lire(f)), f + ' ne doit pas contenir « italic »');
});

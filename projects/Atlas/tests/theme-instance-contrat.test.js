/**
 * Le contrat unique « thème de l'instance Grist -> ThemeDef » (kit/jetons/themedef, arbitré avec Form Builder et appkit, 01/11/2026) : la fonction pure est vendorisée TELLE QUELLE
 * (`lib/charte/theme-instance-contrat.js`, copie mécanique, empreinte vérifiée) et les 32 vecteurs du kit sont rejoués dessus. Atlas en tire la couleur d'action, le fond, le texte et la pile
 * de l'instance (`lib/charte/theme-instance.js`).
 * node --test projects/Atlas/tests/theme-instance-contrat.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { themeInstance } from '../lib/charte/theme-instance-contrat.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ICI, f))).digest('hex');
const V = JSON.parse(fs.readFileSync(path.join(ICI, 'fixtures', 'themedef-instance.vecteurs.json'), 'utf8'));

test('copie mécanique : la fonction et les vecteurs ont les empreintes du kit (un changement se refait avec le kit, jamais à la main)', () => {
  assert.equal(sha('../lib/charte/theme-instance-contrat.js'), 'c61f40f6b86f34757243dac21dbba577d8c501de7917835f397f56f86a6f006b');
  assert.equal(sha('fixtures/themedef-instance.vecteurs.json'), 'e1015449321044ea9adf20439b75627ea730435a073f8f7a4112a9f4cdff5733');
  assert.equal(V.cas.length, 32);
});

test('les 32 vecteurs du contrat donnent exactement la sortie attendue', () => {
  for (const c of V.cas) {
    const r = themeInstance(c.entree);
    for (const [cle, attendu] of Object.entries(c.attendu)) assert.deepEqual(r[cle], attendu, c.id + ' : ' + cle);
  }
});

test('les entrées réelles : GristLight donne #007548 (primary-dim), numerique.gouv garde son action telle quelle', () => {
  const light = V.cas.find((c) => c.id === 'v1-clair-mesure');
  assert.equal(themeInstance(light.entree).themedef.graines.principal, '#007548');
  const dinum = V.cas.find((c) => /^v3/.test(c.id));
  assert.equal(themeInstance(dinum.entree).themedef.graines.principal, '#3e5de7');
});

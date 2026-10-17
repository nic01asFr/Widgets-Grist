/**
 * La page de démonstration du canevas (demos/hote-canevas/index.html) : ce qu'elle montre doit tenir avec le code qu'elle illustre. Sa scène passe le contrôle
 * de production d'une scène venue d'une page hôte, ses événements existent, ses imports et son cadre existent.
 * node --test projects/Atlas/tests/demo-canevas.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifierSceneHote, estSceneAtlas } from '../lib/bi/canevas.js';
import { VERSIONS_LUES, deballerScene, verifierFormeScene, adresseAdmise } from '../lib/scene-externe.js';
import { EVENEMENTS } from '../lib/bi/pont.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DEMO = path.join(ICI, '..', 'demos', 'hote-canevas');
const html = fs.readFileSync(path.join(DEMO, 'index.html'), 'utf8');
const OUTILS = { VERSIONS_LUES, deballerScene, verifierFormeScene, adresseAdmise };

test('la page ouvre le canevas : élément <atlas-bi> en profil complet vers l\'application, imports et pages présents', () => {
  assert.match(html, /<atlas-bi id="carte" profil="complet" src="\.\.\/\.\.\/index\.html"><\/atlas-bi>/);
  assert.match(html, /import '\.\.\/\.\.\/lib\/bi\/atlas-bi-element\.js';/);
  assert.ok(fs.existsSync(path.join(DEMO, '..', '..', 'lib', 'bi', 'atlas-bi-element.js')));
  assert.ok(fs.existsSync(path.join(DEMO, '..', '..', 'index_v7.html')), 'l\'application que le cadre ouvre (promue sous le nom index.html)');
});

test('la scène de la page est une scène Atlas que le contrôle de production accepte, sans adresse à servir', () => {
  const m = /const points = [\s\S]*?\n\};\n/.exec(html); assert.ok(m, 'bloc points + SCENE introuvable');
  const contexte = {}; vm.runInNewContext(m[0] + '\nglobalThis.SCENE = SCENE;', contexte);
  const scene = contexte.SCENE;
  assert.equal(estSceneAtlas(scene, OUTILS), true); const r = verifierSceneHote(scene, OUTILS);
  assert.deepEqual(r.ecarts, []); assert.equal(r.scene.externe, true);
  assert.equal(scene.layers[0].geojson.features.length, 24); assert.ok(scene.layers[0].geojson.features.every((f) => f.id && f.properties.nom));
});

test('les événements écoutés par la page existent dans le contrat, et la couche de dalles est celle que le canevas reconnaît', () => {
  for (const e of [...html.matchAll(/addEventListener\('atlas-bi-([a-z]+)'/g)].map((x) => x[1])) assert.ok(e === 'pret' || e === 'erreur' || EVENEMENTS.includes(e), 'événement inconnu : ' + e);
  assert.match(html, /type: 'dalles3d', dalles3d: \{ grille \}/);
  assert.match(html, /atlas-bi-pret', \(e\) => \{[^\n]*e\.detail\.version[^\n]*e\.detail\.canevas/, 'atlas-bi-pret porte les informations du composant directement dans detail (pas dans detail.charge)');
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(html.replace(/https:\/\/[^'"\s)]*grille3d\.json/g, '')), 'aucune adresse en dur vers un service tiers');
});

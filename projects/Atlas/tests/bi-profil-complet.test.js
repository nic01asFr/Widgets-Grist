/**
 * Le profil « complet » du composant : le canevas d'Atlas (l'application avec son interface, sa 3D et ses modèles) AVEC le pont des commandes et des événements.
 * `?bi=1&profil=complet`, ou `<atlas-bi profil="complet" src=".../index.html">`. Sans ce paramètre, `?bi=1` reste le composant nu (page maigre).
 * Les règles de la page (redirection, classe mode-bi, voile), de `lib/bi/voile.js` et de l'application doivent rester égales : ce test les garde.
 * node --test projects/Atlas/tests/bi-profil-complet.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { voileDemande } from '../lib/bi/voile.js';
import { biDemande } from '../lib/bi/liaison.js';

const lire = (rel) => fs.readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
const app = lire('app_v7.js'), html = lire('index_v7.html');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

const REDIRECTION = scripts.find((s) => s.includes('index_bi.html'));
const CLASSES = scripts.find((s) => s.includes("classList.add('mode-bi')"));

function redirige(search) {
  const appels = []; vm.runInNewContext(REDIRECTION, { URLSearchParams, location: { search, hash: '', replace: (u) => appels.push(u) } }); return appels.length > 0;
}
function classes(search) {
  const posees = new Set(); vm.runInNewContext(CLASSES, { URLSearchParams, location: { search }, document: { body: { classList: { add: (c) => posees.add(c) }, setAttribute() {} } } }); return posees;
}

test('profil complet : la page ne redirige PAS vers la page maigre, garde l interface (pas de mode-bi) mais pose le voile du premier rendu', () => {
  assert.equal(redirige('?bi=1&hote=https%3A%2F%2Fh.test'), true, 'le composant nu redirige (inchangé)');
  assert.equal(redirige('?bi=1&profil=complet&hote=https%3A%2F%2Fh.test'), false);
  assert.deepEqual([...classes('?bi=1')].sort(), ['mode-bi', 'voile-bi']);
  assert.deepEqual([...classes('?bi=1&profil=complet')], ['voile-bi'], 'interface montee, voilee jusqu a la scene de l hote');
  assert.deepEqual([...classes('?bi=1&profil=complet&voile=0')], [], 'voile=0 le retire');
  assert.deepEqual([...classes('?profil=complet')], [], 'sans bi=1 : rien non plus');
  assert.equal(redirige('?bi=1&profil=autre'), true, 'un autre profil est le composant nu');
});

test('le voile de lib/bi/voile.js suit la même règle que la page', () => {
  assert.equal(voileDemande('?bi=1'), true); assert.equal(voileDemande('?bi=1&profil=complet'), true);
  assert.equal(voileDemande('?bi=1&profil=complet&voile=0'), false, 'voile=0 le retire aussi en profil complet');
  assert.equal(voileDemande('?bi=1&profil=autre'), true);
});

test('l\'application : PROFIL_COMPLET n\'existe qu\'avec bi=1 ; le composant nu masque l\'interface, le profil complet la garde et la 3D du catalogue aussi', () => {
  const profil = /const PROFIL_COMPLET = MODE_BI && \/(.+?)\/\.test\(location\.search\);/.exec(app);
  assert.ok(profil, 'PROFIL_COMPLET introuvable');
  assert.equal(new RegExp(profil[1]).test('?bi=1&profil=complet'), true); assert.equal(new RegExp(profil[1]).test('?profil=completx'), false);
  assert.ok(/const MODE_BI_NU = MODE_BI && !PROFIL_COMPLET;/.test(app));
  const demarrer = /async function demarrerBi\(\) \{([\s\S]*?)\n\}\n/.exec(app)[1];
  assert.match(demarrer, /if \(!PROFIL_COMPLET\) \{[\s\S]*classList\.add\('mode-bi'\)[\s\S]*defaultPitch = 0[\s\S]*projection: 'mercator'/, 'seuls le composant nu masque l\'interface et passe à plat');
  assert.match(app, /parseNavbarParam\([^)]*\) && !MODE_BI_NU;/, 'la barre du haut suit ?navbar= en profil complet');
  assert.match(app, /if \(!MODE_BI_NU\) probeLocalModels\(\);/, 'le catalogue de modèles est chargé en profil complet');
  assert.match(demarrer, /import\('\.\/lib\/bi\/montage\.js\?v=/, 'le pont s\'attache dans les deux profils');
});

test('un chargement avec bi=1 reste du composant (biDemande) quel que soit le profil : le pont et la liste blanche d\'hôtes sont les mêmes', () => {
  for (const s of ['?bi=1', '?bi=1&profil=complet', '?profil=complet&bi=true']) assert.equal(biDemande(s), true, s);
  assert.equal(biDemande('?profil=complet'), false);
});

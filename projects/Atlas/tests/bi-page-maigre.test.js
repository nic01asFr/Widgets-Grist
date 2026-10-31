/**
 * La page maigre du composant BI (index_bi.html, publiée sous le nom bi.html) : `?bi=1` ne charge plus l'application.
 *
 * Mesure d'origine (16/10/2026) : `index.html?bi=1` = 146 requêtes et ~4,9 Mo non compressés, dont ~70 % d'application inutile à une carte BI
 * (app.js 0,98 Mo, 86 modules 0,94 Mo, three.js 1,5 Mo). Garde : la page ne tire que MapLibre et la fermeture de `lib/bi/entree.js`, qui ne doit
 * contenir AUCUN module de l'application ; la page de l'application y mène par une redirection qui garde tous les paramètres.
 * node --test projects/Atlas/tests/bi-page-maigre.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const ATLAS = path.join(ICI, '..');
const lire = (rel) => fs.readFileSync(path.join(ATLAS, rel), 'utf8');
const APP = lire('index_v7.html'), BI = lire('index_bi.html');
const scripts = (html) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

/** Les modules atteints depuis `entree` par des imports relatifs (statiques ou dynamiques). */
function fermeture(entree) {
  const vus = new Set(), pile = [entree];
  while (pile.length) {
    const f = pile.pop(); if (vus.has(f)) continue; vus.add(f);
    for (const m of lire(f).matchAll(/(?:from\s*|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"?]+)(?:\?[^'"]*)?['"]/g)) {
      const cible = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]));
      if (fs.existsSync(path.join(ATLAS, cible))) pile.push(cible);
    }
  }
  return [...vus].sort();
}

test('la page de l\'application mène à la page maigre avec TOUS les paramètres, sauf avec une scène externe', () => {
  const redirection = scripts(APP).find((s) => s.includes('index_bi.html'));
  assert.ok(redirection, 'script de redirection introuvable');
  assert.ok(APP.indexOf(redirection) < APP.indexOf('prevenir'), 'avant le garde d\'amorçage et tous les chargements');
  const essai = (search, hash = '') => {
    const appels = [];
    vm.runInNewContext(redirection, { URLSearchParams, location: { search, hash, replace: (u) => appels.push(u) } });
    return appels;
  };
  assert.deepEqual(essai('?bi=1&navbar=false&mode=view&hote=https%3A%2F%2Fhote.test'), ['./index_bi.html?bi=1&navbar=false&mode=view&hote=https%3A%2F%2Fhote.test']);
  assert.deepEqual(essai('?bi=true&voile=0', '#x'), ['./index_bi.html?bi=true&voile=0#x']);
  assert.deepEqual(essai('?bi=1&scene=https%3A%2F%2Fx.test%2Fs.json'), [], 'une scène externe reste dans l\'application');
  for (const s of ['', '?bi=0', '?bi=', '?abi=1', '?bi=11', '?navbar=false']) assert.deepEqual(essai(s), [], 'rien pour « ' + s + ' »');
});

test('le garde d\'amorçage est le même dans les deux pages (hors le test de ?bi=1, inutile dans la page maigre)', () => {
  const garde = (html) => scripts(html).find((s) => s.includes('prevenir') && s.includes('bi-voile'));
  const normaliser = (s) => s.replace(/var biv = sp\.get\('bi'\); if \(biv !== '1' && biv !== 'true'\) return;/, '').replace(/\/\* cette page est TOUJOURS[^*]*\*\//, '').replace(/\s+/g, ' ');
  assert.ok(garde(APP) && garde(BI));
  assert.equal(normaliser(garde(BI)), normaliser(garde(APP)));
});

test('la page maigre ne charge ni l\'application, ni three.js, ni les formulaires, ni l\'API de Grist', () => {
  for (const interdit of ['app_v7', 'app.js', 'three.module', 'importmap', 'grist_forms', 'grist-plugin-api', 'fonts.googleapis', 'formulaire-atlas', 'suncalc']) assert.ok(!BI.includes(interdit), interdit);
  const modules = [...BI.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  assert.equal(modules.length, 1); assert.match(modules[0][1], /from '\.\/lib\/bi\/entree\.js\?v=\d+[a-z]*'/);
  assert.ok(BI.length < 12000, 'une page de quelques Ko : ' + BI.length);
  assert.ok(/<body class="mode-bi">/.test(BI) && /id="bi-voile"/.test(BI) && /id="map"/.test(BI));
});

test('la page maigre garde la règle du voile de la page de l\'application (?voile=0 le retire)', () => {
  const code = scripts(BI).find((s) => s.includes('voile-bi'));
  for (const [search, attendu] of [['', true], ['?bi=1', true], ['?voile=0', false], ['?voile=false', false], ['?voile=non', false], ['?voile=1', true]]) {
    const classes = new Set();
    vm.runInNewContext(code, { URLSearchParams, location: { search }, document: { body: { classList: { add: (c) => classes.add(c) }, setAttribute() {} } } });
    assert.equal(classes.has('voile-bi'), attendu, search);
  }
});

test('la fermeture de entree.js ne contient AUCUN module de l\'application', () => {
  const f = fermeture('lib/bi/entree.js');
  const permis = ['lib/acces-carte.js', 'lib/attribution.js', 'lib/controls.js', 'lib/declarative-style.js', 'lib/fonds-base.js', 'lib/html.js', 'lib/ratio-hote.js', 'lib/soleil.js', 'lib/terrain-base.js'];   // soleil.js et terrain-base.js : modules purs sans dépendance, chargés À LA DEMANDE par `environnement.js` (relief, soleil), jamais par la page seule
  const hors = f.filter((x) => !/^lib\/(bi|charte)\//.test(x));
  assert.deepEqual(hors, permis, 'un module de plus dans la fermeture est une dépendance de plus pour tous les hôtes : à justifier ici');
  assert.ok(!f.includes('app_v7.js'));
  // 51 depuis le contrat 0.4 : lib/bi/batiments.js (commande getBuildings), importé À LA DEMANDE : il n'est téléchargé que si l'hôte appelle la commande
  assert.ok(f.length >= 38 && f.length <= 51, 'taille de la fermeture : ' + f.length);
});

test('la page maigre est promue (bi.html) sous le même numéro de version que l\'application', () => {
  const pub = path.join(ATLAS, '..', '..', 'published', 'atlas');
  const v = JSON.parse(fs.readFileSync(path.join(pub, 'package.json'), 'utf8')).version;
  const bi = fs.readFileSync(path.join(pub, 'bi.html'), 'utf8'), app = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
  assert.match(bi, new RegExp('lib/bi/entree\\.js\\?v=' + v.replace(/\./g, '\\.')));
  assert.ok(app.includes("location.replace('./bi.html'") && !app.includes("location.replace('./index_bi.html'"), 'la redirection publiée vise bi.html');
  assert.ok(!/unpkg\.com|jsdelivr|googleapis/.test(bi), 'aucune dépendance externe');
  assert.ok(bi.includes('./vendor/maplibre-gl/maplibre-gl.js'));
});

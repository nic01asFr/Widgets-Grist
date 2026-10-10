// Le mode composant ne doit pas montrer l'interface d'Atlas avant que le script principal ne l'ait masquee.
//
// Constat navigateur (10/10/2026, serveur local, cache chaud) : la page est affichee des le HTML, `body.mode-bi` n'est pose qu'une fois
// `app_v7.js` (plus de 800 Ko) charge et execute ; pendant 300 a 900 ms, l'iframe de l'hote montre la barre, le rail, la legende et la boussole
// d'Atlas, puis tout disparait. Sur un reseau lent, la duree croit d'autant.
//
// Correctif : un petit script en ligne, place avant le premier element visible, pose la classe d'apres l'adresse. Il doit rester egal a
// `biDemande` (lib/bi/liaison.js) : `?bi=1` ou `?bi=true`, parametre isole.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { biDemande } from '../lib/bi/liaison.js';

const html = fs.readFileSync(new URL('../index_v7.html', import.meta.url), 'utf8');
const SCRIPT = /<body>\s*(?:<!--[\s\S]*?-->\s*)?<script>([\s\S]*?)<\/script>/;

test('index_v7.html : un script en ligne pose body.mode-bi avant le premier element visible', () => {
  const m = SCRIPT.exec(html);
  assert.ok(m, 'le premier element du corps est un script en ligne');
  assert.ok(html.indexOf(m[0]) < html.indexOf('<div class="app">'), 'avant la mise en page');
  assert.match(m[1], /mode-bi/);
});
test('ce script pose la classe exactement quand biDemande le dit', () => {
  const code = SCRIPT.exec(html)[1];
  for (const search of ['?bi=1', '?bi=true', '?navbar=false&bi=1&mode=view', '', '?bi=0', '?bi=', '?bi=11', '?abi=1', '?bi=true&x=1', '?xbi=1', '?bi=TRUE', '?BI=1', '?bi=0&bi=1', '?bi=1&bi=0']) {
    const classes = new Set();
    const contexte = { URLSearchParams, location: { search }, document: { body: { classList: { add: (c) => classes.add(c) } } } };
    vm.runInNewContext(code, contexte);
    assert.equal(classes.has('mode-bi'), biDemande(search), 'recherche « ' + search + ' »');
  }
});
test('le script en ligne ne plante jamais (document absent, adresse illisible)', () => {
  const code = SCRIPT.exec(html)[1];
  assert.doesNotThrow(() => vm.runInNewContext(code, { URLSearchParams, location: undefined, document: undefined }));
});

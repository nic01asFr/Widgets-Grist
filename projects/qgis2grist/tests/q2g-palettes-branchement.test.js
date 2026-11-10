'use strict';
// Garde de branchement : index_v2.html n'a plus aucune palette de couleurs en dur ; tout passe par Q2GPalettes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index_v2.html'), 'utf8');
const P = require('../lib/q2g-palettes.js');

test('index_v2.html : plus de liste de couleurs de couche en dur, une seule source (Q2GPalettes)', () => {
  assert.doesNotMatch(html, /LAYER_COLORS/);
  assert.doesNotMatch(html, /const PALETTE = \[/);
  assert.doesNotMatch(html, /\['#3e5de7'\s*,\s*'#10b981'/);
  assert.match(html, /Q2GPalettes\.create\(/);
  assert.match(html, /lib\/q2g-palettes\.js/);
});

test('index_v2.html : la charte du theme alimente les palettes, le style QML reste prioritaire', () => {
  assert.match(html, /Pal\.definirCharte\(/);
  // la palette n'intervient que comme repli apres la couleur propre de la couche
  const usages = html.match(/layer\.color \|\| couleurCouche\(/g) || [];
  assert.ok(usages.length >= 3, 'couleur propre de la couche d abord : ' + usages.length);
  assert.match(html, /copy\.color \|\| couleurCouche\(/);
  // la palette est passee en parametre au manifeste : le repli en dur de scene-manifest.js ne sert plus
  assert.match(html, /palette: paletteCouches\(\)/);
  assert.match(html, /fileName,\s+paletteCouches\(\)/);
});

test('sans theme : couleurCouche rend exactement la liste d origine (meme rendu qu avant)', () => {
  const origine = ['#3e5de7', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6', '#f97316'];
  const pal = P.create({});
  assert.deepEqual(pal.palette('qualitative', 7), origine);
  for (let i = 0; i < 15; i++) assert.equal(pal.couleurCyclique(i, 7), origine[i % 7]);
});

test('les tons d etat ne dependent pas de la palette de donnees', () => {
  const a = P.create({});
  const b = P.create({});
  b.definirCharte({ graines: { principal: '#0b6e4f', secondaire: '#f4a259', encre: '#1f1b14', fond: '#fdfaf3' } });
  const ta = a.tonsEtat('#ffffff');
  const tb = b.tonsEtat('#ffffff');
  for (const k of ['ok', 'attention', 'alerte', 'info', 'neutre']) assert.equal(ta[k].couleur, tb[k].couleur, k);
  assert.notDeepEqual(a.palette('qualitative', 7), b.palette('qualitative', 7));
});

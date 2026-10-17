/**
 * `base=aucune` : la carte est créée sans fond de plan, donc sans aucun appel à un service tiers au démarrage (retour d'appkit sur la 1.21.1 : un fond
 * uni demandé APRÈS la création laissait passer le style de base, ses tuiles et ses polices, environ 1 Mo). Opt-in : sans le paramètre, rien ne change.
 * node --test projects/Atlas/tests/bi-base-aucune.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { creerCarteNue } from '../lib/bi/carte-nue.js';
import { creerFond } from '../lib/bi/fond.js';
import { STYLE_BASE_URL, STYLE_AUCUN_FOND } from '../lib/fonds-base.js';
import { carteSimulee } from './aide-carte-bi.js';

function creer(search) {
  let options = null; const ecouteurs = {};
  class Carte { constructor(o) { options = o; } on(t, f) { (ecouteurs[t] = ecouteurs[t] || []).push(f); } hasImage() { return false; } addImage() {} setStyle() { throw new Error('setStyle ne doit pas être appelé'); } setProjection() {} }
  const fenetre = { location: { search }, devicePixelRatio: 1, navigator: { onLine: true }, dispatchEvent: () => true };
  const carte = creerCarteNue({ maplibregl: { Map: Carte }, fenetre });
  return { carte, options, ecouteurs };
}

test('le style « aucun fond » : un aplat, aucune source, un calque `background` que le fond uni sait repeindre', () => {
  assert.deepEqual(STYLE_AUCUN_FOND.sources, {}); assert.equal(STYLE_AUCUN_FOND.layers.length, 1);
  assert.equal(STYLE_AUCUN_FOND.layers[0].id, 'background'); assert.equal(STYLE_AUCUN_FOND.layers[0].type, 'background');
  assert.ok(!JSON.stringify(STYLE_AUCUN_FOND).includes('openfreemap'), 'aucun service de fond de plan');
});

test('carte nue : base=aucune crée la carte avec le style sans fond ; sans le paramètre, le style de base', () => {
  const sans = creer('?bi=1&base=aucune');
  assert.deepEqual(sans.options.style, STYLE_AUCUN_FOND); assert.equal(sans.carte.__atlasSansBase, true);
  const avec = creer('?bi=1'); assert.equal(avec.options.style, STYLE_BASE_URL); assert.equal(avec.carte.__atlasSansBase, undefined);
  for (const autre of ['?bi=1&base=atlas', '?bi=1&base=', '?bi=1&base=AUCUNE']) assert.equal(creer(autre).options.style, STYLE_BASE_URL, autre);
});

test('carte nue : une erreur de réseau ne remplace pas le style sans fond (rien à remplacer)', () => {
  const b = creer('?bi=1&base=aucune');
  for (const f of b.ecouteurs.error || []) f({ error: { message: 'Failed to fetch', status: 0 } });   // setStyle lèverait : il ne doit pas être appelé
});

test('fond : sur une carte sans fond de plan, uni, plan-ign et photo restent possibles ; atlas, voile et plan sont refusés, et le disent', async () => {
  const carte = carteSimulee(); carte.getStyle = () => ({ layers: [{ id: 'background', type: 'background' }], glyphs: '' }); carte.setGlyphs = () => {};
  carte.__atlasSansBase = true;
  const fond = creerFond(carte, { fetchStyle: async () => ({ version: 8, sources: {}, layers: [] }) });
  for (const m of ['atlas', 'voile', 'plan']) await assert.rejects(fond.appliquer(m, {}), /base=aucune/, m);
  assert.equal((await fond.appliquer('uni', {})).mode, 'uni');
  assert.equal((await fond.appliquer('photo', {})).mode, 'photo');
});

test('fond : sur une carte ordinaire, atlas et plan restent acceptés (aucun changement)', async () => {
  const carte = carteSimulee(); carte.getStyle = () => ({ layers: [{ id: 'background', type: 'background' }], glyphs: '' });
  const fond = creerFond(carte, {});
  assert.equal((await fond.appliquer('atlas', {})).mode, 'atlas');
  assert.equal((await fond.appliquer('uni', {})).mode, 'uni');
});

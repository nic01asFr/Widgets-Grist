/**
 * La carte nue du composant BI (lib/bi/carte-nue.js) : même démarrage que l'application (style, locale, repli hors réseau, ratio, vue par défaut), sans
 * l'application. MapLibre est simulé.
 * node --test projects/Atlas/tests/bi-carte-nue.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { creerCarteNue, VUE_PAR_DEFAUT } from '../lib/bi/carte-nue.js';
import { STYLE_BASE_URL, STYLE_HORS_RESEAU, LOCALE_CARTE } from '../lib/fonds-base.js';
import { EVENEMENT_CARTE_PRETE } from '../lib/acces-carte.js';

function banc({ search = '', enLigne = true, dpr = 2 } = {}) {
  const ecouteurs = {}, images = new Set(), appels = { setStyle: [], setProjection: [], addImage: [] };
  let options = null;
  class Carte {
    constructor(o) { options = o; }
    on(t, f) { (ecouteurs[t] = ecouteurs[t] || []).push(f); }
    hasImage(id) { return images.has(id); }
    addImage(id, img) { images.add(id); appels.addImage.push([id, img]); }
    setStyle(s) { appels.setStyle.push(s); }
    setProjection(p) { appels.setProjection.push(p); }
  }
  const evts = [];
  const fenetre = { location: { search }, devicePixelRatio: dpr, navigator: { onLine: enLigne }, dispatchEvent: (e) => { evts.push(e.type); return true; }, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } } };
  const carte = creerCarteNue({ maplibregl: { Map: Carte }, fenetre });
  const emettre = (t, e) => (ecouteurs[t] || []).forEach((f) => f(e));
  return { carte, options, appels, fenetre, evts, emettre, images };
}

test('même démarrage que l\'application : style de base, locale française, vue d\'ouverture à plat, antialias', () => {
  const b = banc();
  assert.equal(b.options.style, STYLE_BASE_URL); assert.deepEqual(b.options.locale, LOCALE_CARTE);   // deepEqual : le module est importé sous deux jetons de version (instances distinctes) assert.equal(b.options.container, 'map');
  assert.deepEqual([b.options.center, b.options.zoom, b.options.pitch, b.options.bearing], [VUE_PAR_DEFAUT.center, 16, 0, -18]);
  assert.equal(b.options.antialias, true); assert.equal(b.options.maxPitch, 80);
  assert.equal(b.options.pixelRatio, undefined, 'sans ?ratio=, le ratio de l\'appareil s\'applique');
  assert.equal(VUE_PAR_DEFAUT.center[0], 5.374); assert.ok(Object.isFrozen(VUE_PAR_DEFAUT));
});

test('exposée à l\'adresse officielle ; « carte prête » signalé une fois, au chargement du style', () => {
  const b = banc();
  assert.equal(b.fenetre.__atlasCarte, b.carte); assert.equal(b.fenetre.__atlasMap, b.carte); assert.equal(b.fenetre.__atlasCartePrete, false);
  b.emettre('load'); b.emettre('load');
  assert.equal(b.fenetre.__atlasCartePrete, true); assert.deepEqual(b.evts, [EVENEMENT_CARTE_PRETE]);
});

test('?ratio= plafonne le ratio de pixels, sans jamais l\'augmenter', () => {
  assert.equal(banc({ search: '?bi=1&ratio=1', dpr: 3 }).options.pixelRatio, 1);
  assert.equal(banc({ search: '?ratio=2', dpr: 3 }).options.pixelRatio, 2);
  assert.equal(banc({ search: '?ratio=2', dpr: 1 }).options.pixelRatio, 1, 'un appareil à ratio 1 reste à 1');
  assert.equal(banc({ search: '?ratio=abc' }).options.pixelRatio, undefined);
});

test('appareil hors réseau : le fond de repli dès la création', () => {
  assert.deepEqual(banc({ enLigne: false }).options.style, STYLE_HORS_RESEAU);
});

test('style de base illisible avant le chargement : bascule sur l\'aplat, une seule fois ; une tuile manquante ne bascule pas ; plus rien après « load »', () => {
  const b = banc();
  b.emettre('error', { error: { message: 'x', status: 404, url: STYLE_BASE_URL } }); b.emettre('error', { error: { message: 'Failed to fetch' } });
  assert.deepEqual(b.appels.setStyle, [STYLE_HORS_RESEAU], 'une seule bascule');
  const c = banc(); c.emettre('error', { error: { message: 'x', status: 404 }, tile: {} }); assert.deepEqual(c.appels.setStyle, []);
  const d = banc(); d.emettre('load'); d.emettre('error', { error: { message: 'Failed to fetch' } }); assert.deepEqual(d.appels.setStyle, [], 'une fois la carte chargée, une erreur n\'est plus un repli');
});

test('projection plane à chaque style ; une icône manquante devient une image vide, une seule fois', () => {
  const b = banc();
  b.emettre('style.load'); b.emettre('style.load');
  assert.deepEqual(b.appels.setProjection, [{ type: 'mercator' }, { type: 'mercator' }]);
  b.emettre('styleimagemissing', { id: 'ferry_terminal' }); b.emettre('styleimagemissing', { id: 'ferry_terminal' }); b.emettre('styleimagemissing', {});
  assert.equal(b.appels.addImage.length, 1); assert.deepEqual(b.appels.addImage[0][1], { width: 1, height: 1, data: new Uint8Array(4) });
});

test('MapLibre absent : une erreur claire, pas un plantage obscur', () => {
  assert.throws(() => creerCarteNue({ maplibregl: undefined, fenetre: {} }), /MapLibre GL JS n'est pas chargé/);
});

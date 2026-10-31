/**
 * Contrat 0.4 : `getCamera` (la vue courante pour aligner une 3D de l'hôte) et le flux `mouvement`, sur abonnement (`watchCamera`).
 * node --test projects/Atlas/tests/bi-camera-0-4.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { COMMANDES, COMMANDES_0_4, CAPACITE_DE_COMMANDE, validerCommande } from '../lib/bi/pont.js';
import { EVENEMENTS_AJOUTES } from '../lib/bi/evenements-ext.js';
import { carteSimulee } from './aide-carte-bi.js';

/** Une horloge et des minuteries que le test fait avancer : aucune attente réelle. */
function horlogeFausse() {
  const h = { t: 0, prevus: [] };
  h.maintenant = () => h.t;
  h.setTimeout = (f, ms) => { const m = { f, a: h.t + ms, vivant: true }; h.prevus.push(m); return m; };
  h.clearTimeout = (m) => { if (m) m.vivant = false; };
  h.avancer = (ms) => { h.t += ms; for (const m of [...h.prevus]) if (m.vivant && m.a <= h.t) { m.vivant = false; m.f(); } };
  h.enAttente = () => h.prevus.filter((m) => m.vivant).length;
  return h;
}
/** Une carte simulée qui dit sa taille, son emprise et ses marges. */
function carteCamera(extra = {}) {
  const m = carteSimulee();
  m.getBounds = () => ({ getWest: () => 1.1, getSouth: () => 45.5, getEast: () => 3.7, getNorth: () => 47.7 });
  m.getPadding = () => ({ top: 10, right: 20, bottom: 30, left: 40 });
  m.getContainer = () => ({ clientWidth: 800, clientHeight: 600 });
  Object.assign(m, extra);
  return m;
}
const monter = () => {
  const h = horlogeFausse(); const carte = carteCamera(); const rt = attacher(carte, { horloge: h }); const vus = [];
  rt.brancherEmetteur((type, charge, origine) => { if (type === 'mouvement') vus.push({ ...charge, _origine: origine }); });
  return { h, carte, rt, vus };
};

test('contrat : getCamera et watchCamera sont des commandes 0.4 de la capacité socle ; mouvement est un événement ajouté', () => {
  for (const c of ['getCamera', 'watchCamera']) { assert.ok(c in COMMANDES); assert.ok(COMMANDES_0_4.includes(c)); assert.equal(CAPACITE_DE_COMMANDE[c], 'socle'); }
  assert.ok(EVENEMENTS_AJOUTES.includes('mouvement'));
  const ctx = { origine: 'https://hote.test', autorisees: ['https://hote.test'] };
  assert.equal(validerCommande({ source: 'hote-bi', version: '0.3', id: 'a', cmd: 'getCamera', args: [] }, ctx).code, 'version', 'refusée à un hôte resté en 0.3');
  assert.equal(validerCommande({ source: 'hote-bi', version: '0.4', id: 'a', cmd: 'getCamera', args: [] }, ctx).ok, true);
  assert.equal(validerCommande({ source: 'hote-bi', version: '0.4', id: 'a', cmd: 'watchCamera', args: ['x'] }, ctx).code, 'argument', 'un objet est attendu');
});

test('getCamera : la vue, la taille du cadre, les marges de projection et les mètres par pixel', async () => {
  const { rt, h } = monter(); h.t = 1234.56;
  const c = await rt.api.getCamera();
  assert.deepEqual(c.center, [2.4, 46.6]); assert.equal(c.zoom, 5); assert.equal(c.pitch, 0); assert.equal(c.bearing, 0);
  assert.deepEqual(c.bounds, [1.1, 45.5, 3.7, 47.7]);
  assert.deepEqual(c.taille, { w: 800, h: 600, connu: true });
  assert.deepEqual(c.padding, { top: 10, right: 20, bottom: 30, left: 40 });
  assert.equal(c.mode, 'libre'); assert.equal(c.t, 1234.6);
  assert.ok(Number.isFinite(c.ratioPixels) && c.ratioPixels > 0);
  const attendu = (40075016.686 * Math.cos((46.6 * Math.PI) / 180)) / (512 * 2 ** 5);
  assert.ok(Math.abs(c.metresParPixel - attendu) < 1e-3, 'mètres par pixel à la latitude du centre');
});

test('getCamera : à l\'équateur, au zoom 0, un pixel fait 78271,517 m (tuiles de 512 px)', async () => {
  const carte = carteCamera({ getCenter: () => ({ lng: 0, lat: 0 }), getZoom: () => 0 });
  const c = await attacher(carte, { horloge: horlogeFausse() }).api.getCamera();
  assert.ok(Math.abs(c.metresParPixel - 78271.517) < 1e-3, String(c.metresParPixel));
});

test('getCamera : une carte qui ne dit rien (simulée nue) rend des champs sûrs, sans exception', async () => {
  const c = await attacher(carteSimulee(), { horloge: horlogeFausse() }).api.getCamera();
  assert.deepEqual(c.padding, { top: 0, right: 0, bottom: 0, left: 0 }); assert.equal(c.taille.connu, false); assert.ok(!('bounds' in c));
});

test('watchCamera : sans abonnement, aucun message continu (opt-in)', () => {
  const { carte, vus } = monter();
  carte.emit('movestart', {}); carte.emit('move', {}); carte.emit('moveend', {});
  assert.equal(vus.length, 0);
});

test('watchCamera : abonné, debut puis en_cours cadencés, et fin TOUJOURS envoyé ; jamais plus d\'un message en attente', async () => {
  const { carte, rt, vus, h } = monter();
  assert.deepEqual(await rt.api.watchCamera({ intervalleMs: 50 }), { actif: true, intervalleMs: 50 });
  carte.emit('movestart', {});
  assert.deepEqual(vus.map((v) => v.phase), ['debut']);
  for (let i = 0; i < 20; i++) { h.t += 2; carte.emit('move', {}); }   // 20 images en 40 ms : sous l'intervalle
  assert.equal(h.enAttente(), 1, 'un seul message en attente, pas vingt');
  assert.deepEqual(vus.map((v) => v.phase), ['debut']);
  h.avancer(20);                                                       // l'intervalle est atteint : l'état COURANT part, une fois
  assert.deepEqual(vus.map((v) => v.phase), ['debut', 'en_cours']);
  h.t += 3; carte.emit('move', {}); assert.equal(h.enAttente(), 1);
  carte.emit('moveend', {});                                           // la fin annule l'attente et part tout de suite
  assert.equal(h.enAttente(), 0); assert.equal(vus.at(-1).phase, 'fin'); assert.equal(vus.length, 3);
  carte.emit('moveend', {}); assert.equal(vus.at(-1).phase, 'fin');
});

test('mouvement : porte la vue de getCamera, et reste petit (moins de 600 octets)', async () => {
  const { carte, rt, vus } = monter(); await rt.api.watchCamera();
  carte.emit('movestart', {});
  const m = vus[0]; const { phase, _origine, ...vue } = m;
  assert.deepEqual(Object.keys(vue).sort(), Object.keys(await rt.api.getCamera()).sort());
  assert.ok(JSON.stringify(m).length < 600, String(JSON.stringify(m).length));
});

test('mouvement : origine utilisateur pour un geste, api pour un déplacement demandé par la page', async () => {
  const { carte, rt, vus } = monter(); await rt.api.watchCamera();
  carte.emit('movestart', {}); carte.emit('moveend', {}); assert.equal(vus.at(-1)._origine, 'utilisateur');
  await rt.api.flyTo({ center: [5, 43], zoom: 8 });
  carte.emit('movestart', {}); carte.emit('moveend', {}); assert.equal(vus.at(-1)._origine, 'api');
});

test('watchCamera : intervalle hors bornes ou mal typé refusé, actif:false coupe le flux, un second abonnement remplace le premier', async () => {
  const { carte, rt, vus, h } = monter();
  for (const mauvais of [5, 15, 1001, 2000, NaN, Infinity, '50', null]) await assert.rejects(async () => rt.api.watchCamera({ intervalleMs: mauvais }), /intervalleMs hors bornes \(16 à 1000\)/, String(mauvais));
  await assert.rejects(async () => rt.api.watchCamera({ actif: 'oui' }), /actif doit être true ou false/);
  assert.deepEqual(await rt.api.watchCamera(), { actif: true, intervalleMs: 33 }, 'défaut : 33 ms');
  assert.deepEqual(await rt.api.watchCamera({ intervalleMs: 16 }), { actif: true, intervalleMs: 16 });
  assert.deepEqual(await rt.api.watchCamera({ intervalleMs: 1000 }), { actif: true, intervalleMs: 1000 });
  await rt.api.watchCamera({ intervalleMs: 100 });
  carte.emit('movestart', {}); carte.emit('move', {}); assert.equal(h.enAttente(), 1);
  await rt.api.watchCamera({ intervalleMs: 200 });   // remplace : l'attente de l'ancien abonnement est annulée
  assert.equal(h.enAttente(), 0);
  const avant = vus.length;
  assert.deepEqual(await rt.api.watchCamera({ actif: false }), { actif: false, intervalleMs: null });
  carte.emit('movestart', {}); carte.emit('move', {}); carte.emit('moveend', {});
  assert.equal(vus.length, avant, 'plus rien après actif:false');
});

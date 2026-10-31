/**
 * Contrat 0.4 : `setViewMode` : la vue plane verrouillée (pour une page qui pose sa propre 3D au-dessus d'une carte vue du dessus).
 * node --test projects/Atlas/tests/bi-vue-plane-0-4.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attacher } from '../lib/bi/bi-runtime.js';
import { COMMANDES, COMMANDES_0_4, CAPACITE_DE_COMMANDE, validerCommande } from '../lib/bi/pont.js';
import { carteSimulee } from './aide-carte-bi.js';

const geste = () => ({ actif: true, enable() { this.actif = true; }, disable() { this.actif = false; } });
const gesteRotation = () => ({ rotation: true, enableRotation() { this.rotation = true; }, disableRotation() { this.rotation = false; } });
/** Une carte simulée qui garde l'inclinaison, le cap, les limites et l'état des gestes. */
function carteGestes({ pitch = 55, bearing = -18 } = {}) {
  const m = carteSimulee();
  Object.assign(m, { _pitch: pitch, _bearing: bearing, _maxPitch: 80, _minPitch: 0, dragRotate: geste(), touchPitch: geste(), touchZoomRotate: gesteRotation(), keyboard: gesteRotation() });
  m.getPitch = () => m._pitch; m.getBearing = () => m._bearing; m.getMaxPitch = () => m._maxPitch; m.getMinPitch = () => m._minPitch;
  m.setMaxPitch = (v) => { m._maxPitch = v; }; m.setMinPitch = (v) => { m._minPitch = v; };
  m.jumpTo = (o) => { if (o.pitch !== undefined) m._pitch = o.pitch; if (o.bearing !== undefined) m._bearing = o.bearing; };
  return m;
}

test('contrat : setViewMode est une commande 0.4 de la capacité socle, refusée à un hôte resté en 0.3', () => {
  assert.ok('setViewMode' in COMMANDES && COMMANDES_0_4.includes('setViewMode')); assert.equal(CAPACITE_DE_COMMANDE.setViewMode, 'socle');
  const ctx = { origine: 'https://hote.test', autorisees: ['https://hote.test'] };
  assert.equal(validerCommande({ source: 'hote-bi', version: '0.3', id: 'a', cmd: 'setViewMode', args: ['plat'] }, ctx).code, 'version');
  assert.equal(validerCommande({ source: 'hote-bi', version: '0.4', id: 'a', cmd: 'setViewMode', args: ['plat'] }, ctx).ok, true);
  assert.equal(validerCommande({ source: 'hote-bi', version: '0.4', id: 'a', cmd: 'setViewMode', args: [3] }, ctx).code, 'argument', 'une chaîne est attendue');
  assert.equal(validerCommande({ source: 'hote-bi', version: '0.4', id: 'a', cmd: 'setViewMode', args: ['plat', 'x'] }, ctx).code, 'argument', 'un objet est attendu');
});

test('plat : inclinaison ramenée à 0 sans animation, limites à 0, inclinaison et rotation coupées ; libre rend tout', async () => {
  const m = carteGestes(); const rt = attacher(m);
  const r = await rt.api.setViewMode('plat', { bearing: 0 });
  assert.deepEqual(r, { mode: 'plat', pitch: 0, bearing: 0, gestesInclinaison: false });
  assert.equal(m._maxPitch, 0); assert.equal(m._minPitch, 0);
  assert.equal(m.touchPitch.actif, false); assert.equal(m.dragRotate.actif, false); assert.equal(m.touchZoomRotate.rotation, false); assert.equal(m.keyboard.rotation, false);
  assert.equal((await rt.api.getCamera()).mode, 'plat');
  const l = await rt.api.setViewMode('libre');
  assert.equal(l.mode, 'libre'); assert.equal(l.gestesInclinaison, true);
  assert.equal(m._maxPitch, 80, 'la limite d\'avant est rendue'); assert.equal(m.touchPitch.actif, true); assert.equal(m.dragRotate.actif, true); assert.equal(m.touchZoomRotate.rotation, true); assert.equal(m.keyboard.rotation, true);
  assert.equal((await rt.api.getCamera()).mode, 'libre');
});

test('plat sans cap demandé : le cap courant est gardé ; avec garderCap:false la rotation reste possible', async () => {
  const m = carteGestes({ bearing: -18 }); const rt = attacher(m);
  assert.equal((await rt.api.setViewMode('plat', { garderCap: false })).bearing, -18);
  assert.equal(m.dragRotate.actif, true); assert.equal(m.touchZoomRotate.rotation, true); assert.equal(m.keyboard.rotation, true); assert.equal(m.touchPitch.actif, false, 'l\'inclinaison reste coupée');
  assert.equal(m._maxPitch, 0);
});

test('plat deux fois puis libre : les limites d\'origine (et non 0) sont rendues', async () => {
  const m = carteGestes(); m._maxPitch = 60; const rt = attacher(m);
  await rt.api.setViewMode('plat'); await rt.api.setViewMode('plat');
  assert.equal(m._maxPitch, 0); await rt.api.setViewMode('libre'); assert.equal(m._maxPitch, 60);
  await rt.api.setViewMode('libre'); assert.equal(m._maxPitch, 60, 'libre sans plat avant ne change rien');
});

test('flyTo en vue plane : une inclinaison demandée est ramenée à 0 ; en vue libre elle passe', async () => {
  const m = carteGestes({ pitch: 0 }); const rt = attacher(m);
  await rt.api.setViewMode('plat'); await rt.api.flyTo({ center: [5, 43], zoom: 12, pitch: 60 });
  assert.equal(m.dernierVol.pitch, 0); assert.deepEqual(m.dernierVol.center, [5, 43]);
  await rt.api.setViewMode('libre'); await rt.api.flyTo({ pitch: 60 });
  assert.equal(m.dernierVol.pitch, 60);
});

test('l\'état dure d\'une scène à l\'autre (comme les marges)', async () => {
  const m = carteGestes(); const rt = attacher(m);
  await rt.api.setViewMode('plat');
  await rt.api.setScene({ layers: [{ id: 'a', name: 'A', geometry_type: 'point' }] }, { a: [] });
  assert.equal(m._maxPitch, 0); assert.equal((await rt.api.getCamera()).mode, 'plat');
});

test('arguments refusés : mode inconnu, cap hors bornes ou illisible, garderCap non booléen', async () => {
  const rt = attacher(carteGestes());
  await assert.rejects(async () => rt.api.setViewMode('oblique'), /mode inconnu : oblique \(plat, libre\)/);
  await assert.rejects(async () => rt.api.setViewMode('x'.repeat(200)), (e) => /^mode inconnu : x{40} \(plat, libre\)$/.test(e.message), 'le texte repris est borné');
  for (const mauvais of [361, -361, NaN, Infinity, '0', null]) await assert.rejects(async () => rt.api.setViewMode('plat', { bearing: mauvais }), /bearing hors bornes \(-360 à 360\)/, String(mauvais));
  await assert.rejects(async () => rt.api.setViewMode('plat', { garderCap: 'oui' }), /garderCap doit être true ou false/);
  assert.equal((await rt.api.getCamera()).mode, 'libre', 'un refus ne change rien');
});

test('une carte sans certains gestes (simulée nue) : plat et libre ne lèvent pas', async () => {
  const m = carteSimulee(); m.jumpTo = () => {}; const rt = attacher(m);
  assert.equal((await rt.api.setViewMode('plat')).mode, 'plat'); assert.equal((await rt.api.setViewMode('libre')).mode, 'libre');
});

test('le recadrage de plat est un déplacement de la page : événement camera d\'origine api', async () => {
  const m = carteGestes(); const rt = attacher(m); const vus = [];
  rt.brancherEmetteur((type, charge, origine) => { if (type === 'camera') vus.push(origine); });
  m.jumpTo = (o) => { if (o.pitch !== undefined) m._pitch = o.pitch; m.emit('moveend', {}); };
  await rt.api.setViewMode('plat');
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(vus, ['api']);
});

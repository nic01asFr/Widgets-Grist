// Composant carte BI : navigation clavier et repli hors ligne sur des couches administratives (carte simulée, jeux embarqués).
// node --test tests/bi-clavier-admin.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { attacher } from '../lib/bi/bi-runtime.js';
import { installerClavier } from '../lib/bi/clavier-runtime.js';

// ---- câblage sur une carte simulée ----
const lireDon = (n) => fs.readFileSync(new URL('../lib/bi/donnees/' + n, import.meta.url), 'utf8');
function carte() {
  const etats = new Map(), calques = [], sources = new Map(), ecouteurs = new Map();
  return { etats, calques, sources, addSource: (i, s) => sources.set(i, { ...s, setData() {} }), getSource: (i) => sources.get(i), removeSource: (i) => sources.delete(i), addLayer: (l) => calques.push(l), getLayer: (i) => calques.find((l) => l.id === i), removeLayer: (i) => { const k = calques.findIndex((l) => l.id === i); if (k >= 0) calques.splice(k, 1); },
    setFilter() {}, setLayoutProperty() {}, getLayoutProperty() {}, setPaintProperty() {}, getPaintProperty() {}, getStyle: () => ({ layers: calques, glyphs: '' }), setFeatureState: ({ id }, e) => etats.set(String(id), { ...(etats.get(String(id)) || {}), ...e }), hasImage: () => false, addImage() {}, removeImage() {},
    on: (t, f) => { if (!ecouteurs.has(t)) ecouteurs.set(t, []); ecouteurs.get(t).push(f); }, emit: (t, e) => (ecouteurs.get(t) || []).forEach((f) => f(e)), once() {}, getCanvas: () => ({ style: {} }), queryRenderedFeatures: () => [], fitBounds(b) { this.cadre = b; }, flyTo() {}, resize() {}, getCenter: () => ({ lng: 0, lat: 0 }), getZoom: () => 5, getPitch: () => 0, getBearing: () => 0, isStyleLoaded: () => true, dragPan: { enable() {}, disable() {} }, setGlyphs() {} };
}
async function monter() {
  const map = carte(); const evts = [];
  const fetch = async (u) => ({ ok: true, status: 200, json: async () => JSON.parse(lireDon('references-population.json')), text: async () => lireDon(String(u).split('/').pop()) });
  const rt = attacher(map, { admin: { fetch, base: '' } }); rt.brancherEmetteur((t, c, o) => evts.push({ type: t, charge: c, origine: o }));
  const conteneur = new EventTarget(); const clav = installerClavier(rt, { conteneur, document: null });
  const touche = (key) => { const e = new Event('keydown'); e.key = key; conteneur.dispatchEvent(e); };
  return { map, rt, evts, clav, touche };
}
test('clavier : parcours des unités dans l\'ordre du classement, annonce, sélection et événements utilisateur', async () => {
  const { rt, evts, clav, touche, map } = await monter();
  await rt.api.addAdminLayer('departement', { id: 'd', source: 'embarque', visuel: { source: 'hote', table: { 13: 50, 69: 80, 75: 20, 31: 'ND' }, niveauTable: 'departement', classes: 3 } });
  touche('n'); assert.match(clav.etat().derniere, /^Rhône, code 69, valeur 80, classe 3 sur 3, rang 1 sur 3\.$/); assert.equal(clav.etat().courante, '69');
  assert.equal(map.etats.get('69').hover, true); touche('n'); assert.equal(clav.etat().courante, '13'); assert.equal(map.etats.get('69').hover, false, 'le focus quitte la précédente');
  touche('Home'); touche('Enter'); const sel = evts.filter((e) => e.type === 'select').at(-1); assert.equal(sel.origine, 'utilisateur'); assert.equal(sel.charge.code, '69'); assert.equal(sel.charge.clavier, true); assert.equal(sel.charge.valeur, 80);
  assert.ok(evts.some((e) => e.type === 'hover' && e.charge.clavier && e.origine === 'utilisateur'));
  touche('p'); assert.match(clav.etat().derniere, /code .*, sans donnée/, 'le précédent du premier est le dernier : une unité sans donnée, en fin de liste');
  touche('Escape'); assert.equal(evts.filter((e) => e.type === 'select').at(-1).charge.layer, null); touche('?'); assert.match(clav.etat().derniere, /Navigation de la carte/);
  const avant = evts.length; touche('x'); touche('N'); assert.ok(evts.length > avant, 'N majuscule accepté'); clav.desinstaller();
});
test('clavier : descendre et remonter d\'un niveau, couche vide, aucun focus', async () => {
  const { rt, clav, touche } = await monter();
  touche('n'); assert.match(clav.etat().derniere, /Aucune couche/); touche('Enter');
  await rt.api.addAdminLayer('region', { id: 'admin-region', source: 'embarque', visuel: { source: 'hote', table: { 93: 1 }, niveauTable: 'region' } });
  touche('Enter'); assert.match(clav.etat().derniere, /Aucun élément en focus/); touche('u'); assert.match(clav.etat().derniere, /Déjà au niveau/);
  touche('n'); assert.equal(clav.etat().courante, '93');
});
test('hors ligne : forcé par l\'hôte, fond uni, jeux embarqués seuls, retour au fond précédent', async () => {
  const { rt, evts, map } = await monter();
  const r = await rt.api.setHorsLigne(true); assert.equal(r.actif, true); assert.ok(evts.some((e) => e.type === 'connexion' && e.charge.etat === 'hors_ligne' && e.charge.cause === 'hote'));
  const d = await rt.api.addAdminLayer('departement', { id: 'd' }); assert.equal(d.source, 'embarque'); assert.equal(d.repli, false);
  await assert.rejects(rt.api.addAdminLayer('commune', { id: 'c', filtre: { departement: '13' } }), /Aucun jeu embarqué/);
  assert.equal((await rt.api.setHorsLigne(true)).actif, true, 'idempotent'); assert.equal((await rt.api.setHorsLigne(false)).actif, false);
  assert.ok(evts.some((e) => e.type === 'connexion' && e.charge.etat === 'en_ligne')); assert.deepEqual((await rt.api.setHorsLigne('auto')), { actif: false, auto: true });
  for (let i = 0; i < 4; i++) map.emit('error', { sourceId: 'x', tile: {}, error: new Error('réseau') });
  await new Promise((r) => setTimeout(r, 20)); assert.ok(evts.some((e) => e.type === 'connexion' && e.charge.cause === 'tuiles' && e.charge.automatique === true && e.origine === 'utilisateur'), 'détection automatique par échecs de tuiles');
});

// Composant carte BI : navigation clavier et repli hors ligne (logique pure, puis câblage sur une carte simulée).
import test from 'node:test';
import assert from 'node:assert/strict';
import { actionPourTouche, pas, phraseUnite, phrasePoint, TOUCHES, AIDE } from '../lib/bi/clavier.js';
import { creerSurveillance, fondPourConnexion, niveauHorsLigne } from '../lib/bi/repli.js';
import { attacher } from '../lib/bi/bi-runtime.js';
import { installerClavier } from '../lib/bi/clavier-runtime.js';

test('clavier : touches reconnues, modificateurs ignorés', () => {
  assert.equal(actionPourTouche({ key: 'n' }), 'suivant'); assert.equal(actionPourTouche({ key: 'N' }), 'suivant'); assert.equal(actionPourTouche({ key: 'Enter' }), 'selectionner'); assert.equal(actionPourTouche({ key: ' ' }), 'selectionner');
  assert.equal(actionPourTouche({ key: 'Escape' }), 'deselectionner'); assert.equal(actionPourTouche({ key: 'n', ctrlKey: true }), null); assert.equal(actionPourTouche({ key: 'ArrowLeft' }), null, 'les flèches restent à MapLibre');
  assert.equal(actionPourTouche({ key: 'a', altKey: false }), null); assert.ok(Object.keys(TOUCHES).length >= 12); assert.match(AIDE, /Échap/);
});
test('clavier : déplacement circulaire, début, fin, sauts, liste vide', () => {
  assert.equal(pas(-1, 5, 'suivant'), 0); assert.equal(pas(4, 5, 'suivant'), 0, 'boucle'); assert.equal(pas(-1, 5, 'precedent'), 4); assert.equal(pas(0, 5, 'precedent'), 4);
  assert.equal(pas(2, 5, 'debut'), 0); assert.equal(pas(2, 5, 'fin'), 4); assert.equal(pas(0, 50, 'saut-avant'), 10); assert.equal(pas(45, 50, 'saut-avant'), 49); assert.equal(pas(3, 50, 'saut-arriere'), 0);
  assert.equal(pas(0, 0, 'suivant'), -1); assert.equal(pas(2, 5, 'inconnue'), 2);
});
test('clavier : phrases annoncées (valeur, classe, rang, sans donnée, petit effectif)', () => {
  assert.equal(phraseUnite({ code: '69', nom: 'Rhône', valeur: 55.5 }, { rang: 12, total: 35, classe: 2, nClasses: 5, unite: 'pour 1 000 hab.', fmt: (v) => String(v).replace('.', ',') }), 'Rhône, code 69, valeur 55,5 pour 1 000 hab., classe 3 sur 5, rang 12 sur 35.');
  assert.equal(phraseUnite({ code: '34', nom: 'Hérault', valeur: null }), 'Hérault, code 34, sans donnée.'); assert.match(phraseUnite({ code: '2A', nom: 'Corse-du-Sud', valeur: 3, petit: true }), /petit effectif/);
  assert.equal(phrasePoint({ nom: 'Bâtiment 4' }, { rang: 4, total: 222 }), 'Bâtiment 4, 4 sur 222.'); assert.equal(phrasePoint({}), 'Élément.');
});
test('repli : la perte de réseau se déclare après une série d\'échecs, un succès l\'efface', () => {
  let t = 0; const s = creerSurveillance({ seuil: 3, fenetreMs: 1000, maintenant: () => t });
  assert.equal(s.echec(), false); t = 100; assert.equal(s.echec(), false); s.succes(); t = 200; assert.equal(s.echec(), false); t = 300; assert.equal(s.echec(), false); t = 400; assert.equal(s.echec(), true);
  t = 5000; assert.equal(s.echec(), false, 'les échecs anciens sortent de la fenêtre'); assert.equal(s.compte(), 1);
});
test('repli : seul le fond uni et les jeux embarqués restent utilisables', () => {
  assert.equal(fondPourConnexion('plan-ign', true), 'uni'); assert.equal(fondPourConnexion('photo', true), 'uni'); assert.equal(fondPourConnexion('plan', false), 'plan'); assert.equal(fondPourConnexion('uni', true), 'uni');
  assert.ok(niveauHorsLigne('departement') && niveauHorsLigne('pays') && !niveauHorsLigne('commune'));
});

// ---- câblage sur une carte simulée ----
function carte() {
  const etats = new Map(), calques = [], sources = new Map(), ecouteurs = new Map();
  return { etats, calques, sources, addSource: (i, s) => sources.set(i, { ...s, setData() {} }), getSource: (i) => sources.get(i), removeSource: (i) => sources.delete(i), addLayer: (l) => calques.push(l), getLayer: (i) => calques.find((l) => l.id === i), removeLayer: (i) => { const k = calques.findIndex((l) => l.id === i); if (k >= 0) calques.splice(k, 1); },
    setFilter() {}, setLayoutProperty() {}, getLayoutProperty() {}, setPaintProperty() {}, getPaintProperty() {}, getStyle: () => ({ layers: calques, glyphs: '' }), setFeatureState: ({ id }, e) => etats.set(String(id), { ...(etats.get(String(id)) || {}), ...e }), hasImage: () => false, addImage() {}, removeImage() {},
    on: (t, f) => { if (!ecouteurs.has(t)) ecouteurs.set(t, []); ecouteurs.get(t).push(f); }, emit: (t, e) => (ecouteurs.get(t) || []).forEach((f) => f(e)), once() {}, getCanvas: () => ({ style: {} }), queryRenderedFeatures: () => [], fitBounds(b) { this.cadre = b; }, flyTo() {}, resize() {}, getCenter: () => ({ lng: 0, lat: 0 }), getZoom: () => 5, getPitch: () => 0, getBearing: () => 0, isStyleLoaded: () => true, dragPan: { enable() {}, disable() {} }, setGlyphs() {} };
}
const pt = (lng, lat, props, id) => ({ type: 'Feature', id, geometry: { type: 'Point', coordinates: [lng, lat] }, properties: props });
async function monter() {
  const map = carte(); const evts = [];
  const rt = attacher(map); rt.brancherEmetteur((t, c, o) => evts.push({ type: t, charge: c, origine: o }));
  const conteneur = new EventTarget(); const clav = installerClavier(rt, { conteneur, document: null });
  const touche = (key) => { const e = new Event('keydown'); e.key = key; conteneur.dispatchEvent(e); };
  return { map, rt, evts, clav, touche };
}
const MANIFESTE = { layers: [{ id: 'sites', name: 'Sites', geometry_type: 'Point', cle: 'ref' }] };
const DONNEES = { sites: [pt(5.1, 43.2, { nom: 'Alpha', ref: 'A' }, 1), pt(5.2, 43.3, { nom: 'Bravo', ref: 'B' }, 2), pt(5.3, 43.4, { nom: 'Charlie', ref: 'C' }, 3)] };

test('clavier : parcours des points d\'une couche, annonce, sélection et événements utilisateur', async () => {
  const { rt, evts, clav, touche, map } = await monter();
  touche('n'); assert.match(clav.etat().derniere, /Aucune couche/);
  await rt.api.setScene(MANIFESTE, DONNEES);
  touche('n'); assert.equal(clav.etat().courante, 1); assert.match(clav.etat().derniere, /^Alpha, 1 sur 3\.$/); assert.equal(map.etats.get('1').highlight, true);
  touche('n'); assert.equal(clav.etat().courante, 2); assert.equal(map.etats.get('1').highlight, false, 'le focus quitte le précédent');
  touche('Enter'); const sel = evts.filter((e) => e.type === 'select').at(-1); assert.equal(sel.origine, 'utilisateur'); assert.equal(sel.charge.featureId, 2); assert.equal(sel.charge.key, 'B'); assert.equal(sel.charge.clavier, true);
  assert.ok(evts.some((e) => e.type === 'hover' && e.charge.clavier && e.origine === 'utilisateur'));
  assert.equal(evts.filter((e) => e.type === 'hover' && e.charge.clavier).at(-1).charge.key, 'B', 'le survol au clavier porte la clé comme la sélection');
  touche('Escape'); assert.equal(evts.filter((e) => e.type === 'select').at(-1).charge.layer, null);
  touche('?'); assert.match(clav.etat().derniere, /Navigation de la carte/);
  const avant = evts.length; touche('x'); touche('N'); assert.ok(evts.length > avant, 'N majuscule accepté'); clav.desinstaller();
  const apres = evts.length; touche('n'); assert.equal(evts.length, apres, 'plus d\'écoute après désinstallation');
});
test('hors ligne : forcé par l\'hôte, retour au fond précédent, détection automatique par les échecs de tuiles', async () => {
  const { rt, evts, map } = await monter();
  const r = await rt.api.setHorsLigne(true); assert.equal(r.actif, true); assert.ok(evts.some((e) => e.type === 'connexion' && e.charge.etat === 'hors_ligne' && e.charge.cause === 'hote'));
  assert.equal((await rt.api.setHorsLigne(true)).actif, true, 'idempotent'); assert.equal((await rt.api.setHorsLigne(false)).actif, false);
  assert.ok(evts.some((e) => e.type === 'connexion' && e.charge.etat === 'en_ligne')); assert.deepEqual((await rt.api.setHorsLigne('auto')), { actif: false, auto: true });
  for (let i = 0; i < 4; i++) map.emit('error', { sourceId: 'x', tile: {}, error: new Error('réseau') });
  await new Promise((r) => setTimeout(r, 20)); assert.ok(evts.some((e) => e.type === 'connexion' && e.charge.cause === 'tuiles' && e.charge.automatique === true && e.origine === 'utilisateur'), 'détection par les tuiles');
});

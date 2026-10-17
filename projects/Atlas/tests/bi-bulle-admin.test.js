// La bulle d'une couche administrative (communes, départements...) : déclarée dans la scène comme celle d'une couche de l'hôte, elle s'ouvre à la sélection
// (clic ou select) et ses boutons reviennent à l'hôte. Retour de referentiels-2874 (17/10/2026) : sur 1.23 elle ne s'ouvrait jamais, sans un mot.
// node --test projects/Atlas/tests/bi-bulle-admin.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { attacher } from '../lib/bi/bi-runtime.js';

const DON = new URL('../lib/bi/donnees/', import.meta.url);
const lireDon = (n) => fs.readFileSync(new URL(n, DON), 'utf8');

// ---- carte simulée : enregistre sources, calques et états ----
function carteSimulee() {
  const sources = new Map(), calques = [], etats = new Map(), ecouteurs = new Map(), images = new Set();
  const m = {
    sources, calques, etats,
    addSource: (id, s) => sources.set(id, { ...s, setData(d) { this.data = d; } }), getSource: (id) => sources.get(id), removeSource: (id) => sources.delete(id),
    addLayer: (l, avant) => { const i = avant ? calques.findIndex((x) => x.id === avant) : -1; if (i >= 0) calques.splice(i, 0, l); else calques.push(l); },
    getLayer: (id) => calques.find((l) => l.id === id), removeLayer: (id) => { const i = calques.findIndex((l) => l.id === id); if (i >= 0) calques.splice(i, 1); },
    setFilter() {}, setLayoutProperty(id, k, v) { const l = calques.find((x) => x.id === id); if (l) { l.layout = { ...(l.layout || {}), [k]: v }; } }, getLayoutProperty: (id, k) => (calques.find((x) => x.id === id)?.layout || {})[k],
    setPaintProperty() {}, getPaintProperty: () => null, getStyle: () => ({ layers: calques, glyphs: '' }),
    setFeatureState: ({ source, id }, e) => etats.set(source + '|' + id, { ...(etats.get(source + '|' + id) || {}), ...e }),
    hasImage: (i) => images.has(i), addImage: (i) => images.add(i), removeImage: (i) => images.delete(i),
    on: (t, f) => { if (!ecouteurs.has(t)) ecouteurs.set(t, []); ecouteurs.get(t).push(f); }, once() {}, off() {},
    getCanvas: () => ({ style: {} }), queryRenderedFeatures: () => [], fitBounds(b) { m.dernierCadre = b; }, flyTo() {}, jumpTo() {}, resize() {}, project: () => ({ x: 0, y: 0 }),
    getCenter: () => ({ lng: 2.4, lat: 46.6 }), getZoom: () => 5, getPitch: () => 0, getBearing: () => 0, isStyleLoaded: () => true, dragPan: { enable() {}, disable() {} }, setGlyphs() {},
  };
  return m;
}
// ---- service simulé : WFS (régions, départements issus des jeux embarqués ; 6 communes) + fichiers embarqués ----
function serviceSimule({ panne = false } = {}) {
  const appels = []; const dep = JSON.parse(lireDon('departements-leger.json')), reg = JSON.parse(lireDon('regions-leger.json'));
  const carre = (x, y) => ({ type: 'Polygon', coordinates: [[[x, y], [x + 0.1, y], [x + 0.1, y + 0.1], [x, y + 0.1], [x, y]]] });
  const f = async (url) => {
    appels.push(String(url));
    if (/references-population\.json/.test(url)) return { ok: true, status: 200, json: async () => JSON.parse(lireDon('references-population.json')), text: async () => lireDon('references-population.json') };
    if (/^https:\/\/data\.geopf\.fr\/wfs/.test(url)) {
      if (panne) throw new TypeError('Failed to fetch');
      const u = new URL(url), couche = u.searchParams.get('TYPENAMES').split(':')[1], cql = decodeURIComponent(u.searchParams.get('CQL_FILTER') || '');
      let features = [];
      if (couche === 'region') features = reg.features.map((x) => ({ type: 'Feature', properties: { code_insee: x.properties.code, nom_officiel: x.properties.nom }, geometry: x.geometry }));
      else if (couche === 'departement') features = dep.features.filter((x) => { const m = /code_insee_de_la_region='(\w+)'/.exec(cql); return !m || x.properties.region === m[1]; }).map((x) => ({ type: 'Feature', properties: { code_insee: x.properties.code, nom_officiel: x.properties.nom, code_insee_de_la_region: x.properties.region }, geometry: x.geometry }));
      else if (couche === 'commune') { const d = /='(\w+)'/.exec(cql)?.[1] || '13'; features = Array.from({ length: 6 }, (_, i) => ({ type: 'Feature', properties: { code_insee: d + String(i + 1).padStart(3, '0'), nom_officiel: 'Commune ' + (i + 1), population: (i + 1) * 1000, superficie_cadastrale: 1000, code_insee_du_departement: d, code_insee_de_la_region: '93' }, geometry: carre(5 + i * 0.12, 43.2) })); }
      return { ok: true, status: 200, text: async () => JSON.stringify({ type: 'FeatureCollection', features, numberMatched: features.length, numberReturned: features.length }) };
    }
    const nom = String(url).split('/').pop(); return { ok: true, status: 200, text: async () => lireDon(nom) };
  };
  f.appels = appels; return f;
}

class N { constructor(t) { this.tag = t; this.enfants = []; this.attrs = {}; this.style = { setProperty() {} }; this.className = ''; this._t = ''; this.parentNode = null; }
  appendChild(c) { this.enfants.push(c); return c; } setAttribute(k, v) { this.attrs[k] = v; } addEventListener() {} getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0 }; } querySelector() { return null; }
  set textContent(v) { this._t = String(v); this.enfants = []; } get textContent() { return this._t + this.enfants.map((e) => e.textContent).join(''); } }
function doc() { const ids = new Map(), head = new N('head'); const a = head.appendChild.bind(head); head.appendChild = (n) => { if (n.id) ids.set(n.id, n); return a(n); }; return { head, createElement: (t) => new N(t), getElementById: (i) => ids.get(i) || null }; }
function popup() { const p = { ouvert: false, contenu: null, element: new N('div'), setLngLat() { return p; }, setDOMContent(c) { p.contenu = c; return p; }, addTo() { p.ouvert = true; return p; }, remove() { p.ouvert = false; return p; }, isOpen: () => p.ouvert, getElement: () => p.element }; return p; }
async function monter(bulle) {
  const map = carteSimulee(), fetch = serviceSimule(), evts = [], p = popup();
  const rt = attacher(map, { admin: { fetch, base: '' }, document: doc(), creerPopup: () => p });
  rt.brancherEmetteur((type, charge, origine) => evts.push({ type, charge, origine }));
  const r = await rt.api.setScene({ layers: [{ id: 'communes', name: 'Communes', geometry_type: 'polygon', admin: { niveau: 'commune', filtre: { departement: '13' } }, ...(bulle ? { bulle } : {}) }] }, {});
  return { rt, p, evts, r };
}

test('une couche administrative déclarée avec une bulle l\'ouvre à la sélection : titre, champs, bouton ; le clic du bouton revient à l\'hôte avec la clé', async () => {
  const { rt, p, evts, r } = await monter({ titre: '{nom}', champs: [{ champ: 'code', libelle: 'Code INSEE' }], actions: [{ id: 'choisir', libelle: 'Choisir cette commune' }] });
  assert.equal(r._avertissements, undefined); assert.equal(r._erreurs, undefined);
  rt.api.select('13001');
  assert.equal(p.ouvert, true, 'la bulle est ouverte'); assert.match(p.contenu.textContent, /Code INSEE13001/); assert.match(p.contenu.textContent, /Choisir cette commune/);
  assert.ok(evts.some((e) => e.type === 'bulle' && e.charge.etat === 'ouverte' && e.charge.layer === 'communes' && e.charge.featureId === '13001'));
  rt.api.select(null); assert.equal(p.ouvert, false); assert.ok(evts.some((e) => e.type === 'bulle' && e.charge.etat === 'fermee'));
});

test('sans bulle déclarée rien ne s\'ouvre ; une bulle invalide est écartée ET dite, la couche se monte quand même', async () => {
  const sans = await monter(null); sans.rt.api.select('13001'); assert.equal(sans.p.ouvert, false);
  const ko = await monter({ titre: 3, surprise: 1 }); assert.match(ko.r._avertissements.communes.join(' | '), /surprise/); assert.equal(ko.r.communes, 6);
});

test('l\'identifiant d\'une unité administrative est son code en TEXTE : select(13001) en entier est refusé avec un message qui le dit', async () => {
  const { rt } = await monter(null);
  assert.equal(rt.api.select('13001'), '13001'); assert.throws(() => rt.api.select(13001), /entité inconnue : 13001/);
});

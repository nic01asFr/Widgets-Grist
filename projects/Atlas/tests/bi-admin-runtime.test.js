// Runtime BI + couches administratives, sur une carte SIMULÉE (aucun navigateur, aucun réseau).
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
const pt = (lng, lat, v, id) => ({ type: 'Feature', id, geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { v, type: id % 2 ? 'A' : 'B' } });
async function preparer(opts = {}) {
  const map = carteSimulee(), fetch = serviceSimule(opts), evts = [];
  const rt = attacher(map, { admin: { fetch, base: '' } });
  rt.brancherEmetteur((type, charge, origine) => evts.push({ type, charge, origine }));
  return { map, rt, api: rt.api, fetch, evts };
}
// Marseille, Aix, Lyon, Paris, Nice
const POINTS = [pt(5.37, 43.3, 10, 1), pt(5.4, 43.28, 20, 2), pt(5.45, 43.53, 30, 3), pt(4.84, 45.76, 40, 4), pt(2.35, 48.86, 50, 5), pt(2.36, 48.87, null, 6), pt(7.26, 43.7, 5, 7)];

test('runtime : couche régions, états posés par code, événement layer, enrichissement population', async () => {
  const { api, map, evts } = await preparer(); const r = await api.addAdminLayer('region', { id: 'r', cadrer: true, visuel: { source: 'hote', table: { 93: 10, 11: 40, 84: 25, 94: 'ND' }, niveauTable: 'region', classes: 3 } });
  assert.equal(r.n, 18); assert.equal(r.source, 'ign-wfs'); assert.equal(r.repli, false); assert.ok(r.octets > 1000); assert.match(r.attribution, /IGN/);
  assert.ok(evts.some((e) => e.type === 'layer' && e.charge.layer === 'r'));
  const src = [...map.sources.keys()].find((k) => k.endsWith('src-r')); assert.equal(map.sources.get(src).promoteId, 'code');
  assert.equal(map.etats.get(src + '|93').sans, false); assert.ok(map.etats.get(src + '|93').couleur); assert.equal(map.etats.get(src + '|94').sans, true, 'ND : sans donnée'); assert.equal(map.etats.get(src + '|01').sans, true, 'absent : sans donnée');
  const lg = api.getLegend('r'); assert.equal(lg.type, 'choroplethe'); assert.equal(lg.renseignees, 3); assert.equal(lg.sansValeur, 15); assert.equal(lg.sansDonnee.compte, 15); assert.equal(lg.classes.reduce((s, c) => s + c.compte, 0), 3);
  assert.equal(lg.lignes.at(-1).classe, 'Sans donnée'); assert.match(lg.resume, /3 unité\(s\) renseignée\(s\) sur 18/); assert.deepEqual(map.dernierCadre.length, 2);
  const rows = api.getRows('r', { limite: 3 }); assert.deepEqual(rows.lignes.map((l) => l.code), ['11', '84', '93']); assert.equal(rows.total, 18);
  assert.ok(map.calques.some((l) => l.paint && l.paint['fill-pattern']), 'couche de hachures présente');
});
test('attribution : la source de la couche porte la mention IGN et INSEE (Natural Earth pour les pays), pour le contrôle d attribution de la carte', async () => {
  const { api, map } = await preparer();
  await api.addAdminLayer('region', { id: 'r', source: 'embarque' });
  const src = map.sources.get([...map.sources.keys()].find((k) => k.endsWith('src-r')));
  assert.match(src.attribution, /IGN/); assert.match(src.attribution, /INSEE/); assert.match(src.attribution, /Licence Ouverte/);
  await api.addAdminLayer('pays', { id: 'p', source: 'embarque' });
  assert.match(map.sources.get([...map.sources.keys()].find((k) => k.endsWith('src-p'))).attribution, /Natural Earth/);
  assert.equal(api.getLegend('r').source.attribution.includes('IGN'), true, 'la légende la porte aussi, pour l hôte');
});
test('runtime : jointure d\'un tableau hôte au niveau fin, remontée partielle = sans donnée', async () => {
  const { api } = await preparer(); const t = { 13: 5, '84': 7, '04': 3, '05': 1, '06': 2, '83': 4, '99': 1 }; // 6 départements de PACA : 13, 84, 04, 05, 06, 83
  await api.addAdminLayer('departement', { id: 'd', visuel: { source: 'hote', table: t, niveauTable: 'departement' } });
  const l = api.getLegend('d'); assert.equal(l.diag.jointure.joints, 6); assert.deepEqual(l.diag.jointure.orphelins, ['99']); assert.equal(l.sansValeur, 95);
  const x = await preparer(); const t2 = { 13: 5, '84': 7, '04': 3, '05': 1, '06': 2 }; // 83 manque : PACA incomplète
  await x.api.addAdminLayer('region', { id: 'r', visuel: { source: 'hote', table: t2, niveauTable: 'departement' } });
  const lr = x.api.getRows('r').lignes; const paca = lr.find((r) => r.code === '93'); assert.equal(paca.valeur, null, 'total partiel refusé');
  x.api.setStatistique('r', { couvertureMin: 0.5 }); assert.equal(x.api.getRows('r').lignes.find((r) => r.code === '93').valeur, 18, 'seuil de couverture abaissé par l\'hôte');
});
test('runtime : agrégat de points, rapport à la population, petits effectifs, filtre de la couche de points', async () => {
  const { api, map } = await preparer();
  await api.setScene({ version: '0.3', layers: [{ id: 'p', name: 'Points', geometry_type: 'point', controls: [{ id: 'type', field: 'type', type: 'select' }] }] }, { p: POINTS });
  await api.addAdminLayer('departement', { id: 'd', visuel: { source: 'agregat', couche: 'p', metrique: 'n', seuilPetit: 2, classes: 3 } });
  let rows = api.getRows('d').lignes; const v = (c) => rows.find((r) => r.code === c).valeur;
  assert.equal(v('13'), 3); assert.equal(v('69'), 1); assert.equal(v('75'), 2); assert.equal(v('06'), 1); assert.equal(v('34'), null, 'aucun point : sans donnée, pas zéro');
  assert.equal(rows.find((r) => r.code === '69').petit, true); assert.equal(rows.find((r) => r.code === '13').petit, false);
  assert.equal(api.getLegend('d').diag.pip.horsZone, 0);
  api.setStatistique('d', { zeroSiVide: true }); rows = api.getRows('d').lignes; assert.equal(v('34'), 0, 'zeroSiVide : zéro réel déclaré par l\'hôte');
  api.setStatistique('d', { zeroSiVide: false, metrique: 'moyenne', champ: 'v' }); rows = api.getRows('d').lignes; assert.equal(v('75'), 50, 'la valeur absente n\'est pas comptée comme 0'); assert.equal(v('13'), 20);
  api.setStatistique('d', { metrique: 'somme', rapport: { base: 'population', facteur: 1000 } }); rows = api.getRows('d').lignes; assert.ok(Math.abs(v('13') - 60 / 2087658 * 1000) < 1e-9);
  assert.throws(() => api.setStatistique('d', { metrique: 'moyenne' }), /effectif ou une somme/); assert.equal(api.getLegend('d').unite.replace(/\s/g, ' '), 'pour 1 000 hab.', 'l\'état précédent est conservé après un refus');
  // le filtre de la couche de points se répercute sur le choroplèthe
  api.setStatistique('d', { metrique: 'n', rapport: null }); api.setFilter('type', ['A']); rows = api.getRows('d').lignes; assert.equal(v('13'), 2, 'points de type A seulement (ids 1 et 3)'); assert.equal(v('75'), 1);
  api.setFilter('type', null); rows = api.getRows('d').lignes; assert.equal(v('13'), 3);
});
test('runtime : filtre par unité ; le choroplèthe ne se vide pas de sa propre sélection', async () => {
  const { api, evts } = await preparer();
  await api.setScene({ version: '0.3', layers: [{ id: 'p', name: 'Points', geometry_type: 'point' }] }, { p: POINTS });
  await api.addAdminLayer('departement', { id: 'd', visuel: { source: 'agregat', couche: 'p', metrique: 'n' } });
  const avant = api.getLegend('d').renseignees; const r = api.setUnitFilter('p', 'd', '13'); assert.equal(r.compte, 3); assert.equal(r.total, 7);
  assert.equal(api.getLegend('d').renseignees, avant, 'auto-exclusion'); assert.equal(api.getRows('p').lignes.length, 3);
  assert.ok(evts.some((e) => e.type === 'filter' && e.charge.unite === '13' && e.origine === 'api'));
  assert.equal(api.setUnitFilter('p', 'd', null).compte, 7); assert.throws(() => api.setUnitFilter('p', 'd', 'XX'), /inconnue/);
});
test('runtime : style du choroplèthe (classes, méthode, palette, sans donnée) et refus explicites', async () => {
  const { api } = await preparer(); await api.addAdminLayer('region', { id: 'r', visuel: { source: 'hote', table: { 93: 1, 11: 5, 84: 20, 76: 40, 28: 90 }, niveauTable: 'region', classes: 3 } });
  assert.equal(api.getLegend('r').classes.length, 3); assert.equal(api.setChoropleth('r', { classes: 4, methode: 'egaux' }).classes, 4);
  assert.equal(api.getLegend('r').methode, 'egaux'); assert.equal(api.getLegend('r').classes.length, 4);
  api.setChoropleth('r', { methode: 'manuelle', bornes: [10, 50] }); assert.deepEqual(api.getLegend('r').seuils, [10, 50]);
  api.setChoropleth('r', { valeurSansDonnee: 'gris' }); assert.equal(api.getLegend('r').sansDonnee.traitement, 'gris');
  assert.throws(() => api.setChoropleth('r', { methode: 'jenks' }), /méthode inconnue/); assert.throws(() => api.setChoropleth('r', { palette: 'arcenciel' }), /palette inconnue/); assert.throws(() => api.setChoropleth('r', { valeurSansDonnee: 'zero' }), /inconnue/);
  assert.throws(() => api.setChoropleth('nulle', {}), /inconnue/);
  api.setChoropleth('r', { palette: 'divergente', centre: 20, valeurSansDonnee: 'hachure' }); assert.equal(api.getLegend('r').centre, 20);
  api.setTheme({ sequentielle: ['#ffffff', '#000000'] }); assert.ok(api.getLegend('r').classes.length >= 2);
});
test('runtime : forage région -> département -> commune, remontée, fil d\'Ariane et événements', async () => {
  const { api, evts } = await preparer();
  await api.addAdminLayer('region', { id: 'admin-region', visuel: { source: 'hote', table: { 93: 10 }, niveauTable: 'region' } });
  const d = await api.drillDown('admin-region', '93'); assert.equal(d.layer, 'admin-departement'); assert.equal(d.n, 6); assert.deepEqual(d.fil, [{ niveau: 'region', code: '93' }]);
  assert.equal(api.ping().couches.includes('admin-departement'), true);
  const c = await api.drillDown('admin-departement', '13'); assert.equal(c.layer, 'admin-commune'); assert.equal(c.n, 6); assert.equal(c.fil.length, 2);
  const h = api.drillUp(); assert.equal(h.layer, 'admin-departement'); assert.equal(h.fil.length, 1); assert.equal(api.ping().couches.includes('admin-commune'), false, 'couche enfant retirée');
  const hh = api.drillUp(); assert.equal(hh.layer, 'admin-region'); assert.equal(api.drillUp(), null, 'rien à remonter');
  assert.deepEqual(evts.filter((e) => e.type === 'drill').map((e) => e.charge.sens), ['bas', 'bas', 'haut', 'haut']);
  assert.equal(api.getRows('admin-region').lignes.find((l) => l.code === '93').valeur, 10, 'la couche parent est restée intacte');
  await api.addAdminLayer('commune', { id: 'cc', filtre: { departement: '13' } }); await assert.rejects(api.drillDown('cc', '13001'), /pas de niveau inférieur/); await assert.rejects(api.drillDown('admin-region', 'XX'), /inconnue/);
});
test('runtime : service indisponible -> repli embarqué explicite (départements), erreur claire (communes), événement error', async () => {
  const { api, evts } = await preparer({ panne: true });
  const r = await api.addAdminLayer('departement', { id: 'd' }); assert.equal(r.repli, true); assert.equal(r.simplifie, true); assert.match(r.cause, /injoignable/); assert.equal(r.n, 101);
  await assert.rejects(api.addAdminLayer('commune', { id: 'c', filtre: { departement: '13' } }), /injoignable.*Aucun jeu embarqué/s);
  const e = evts.find((x) => x.type === 'error'); assert.ok(e && /injoignable/.test(e.charge.message)); assert.equal(api.ping().couches.includes('c'), false);
  const p = await api.addAdminLayer('pays', { id: 'p' }); assert.equal(p.n, 177); assert.equal(p.source, 'embarque');
});
test('runtime : arrondissements de Paris, Lyon, Marseille à la place de la commune, jamais les deux', async () => {
  const map = carteSimulee(); const base = serviceSimule(); const carre = (x) => ({ type: 'Polygon', coordinates: [[[x, 43], [x + 0.1, 43], [x + 0.1, 43.1], [x, 43.1], [x, 43]]] });
  const f = async (url) => {
    if (/geopf/.test(url)) { const u = new URL(url), couche = u.searchParams.get('TYPENAMES').split(':')[1], cql = decodeURIComponent(u.searchParams.get('CQL_FILTER') || '');
      const feats = couche === 'commune' ? [{ type: 'Feature', properties: { code_insee: '13055', nom_officiel: 'Marseille', population: 886040, code_insee_du_departement: '13' }, geometry: carre(5) }, { type: 'Feature', properties: { code_insee: '13001', nom_officiel: 'Aix', population: 1, code_insee_du_departement: '13' }, geometry: carre(6) }]
        : couche === 'arrondissement_municipal' ? Array.from({ length: 16 }, (_, i) => ({ type: 'Feature', properties: { code_insee: String(13201 + i), nom_officiel: 'Marseille ' + (i + 1), population: 1000, code_insee_de_la_commune_de_rattach: '13055' }, geometry: carre(5 + i * 0.001) })) : [];
      if (couche === 'arrondissement_municipal') assert.match(cql, /13055/);
      return { ok: true, status: 200, text: async () => JSON.stringify({ type: 'FeatureCollection', features: feats, numberMatched: feats.length }) }; }
    return base(url);
  };
  const rt = attacher(map, { admin: { fetch: f, base: '' } }); rt.brancherEmetteur(() => {});
  const r = await rt.api.addAdminLayer('commune', { id: 'c', arrondissements: 'detailles', filtre: { departement: '13' } }); assert.equal(r.n, 17);
  const codes = rt.api.getRows('c').lignes.map((l) => l.code); assert.ok(!codes.includes('13055') && codes.includes('13201') && codes.includes('13001'));
  const brut = await rt.api.addAdminLayer('commune', { id: 'c2', filtre: { departement: '13' } }); assert.equal(brut.n, 2);
});
test("runtime : lot d'ordres, écart de version et couches de la 0.2 inchangées", async () => {
  const { api } = await preparer();
  const r = await api.batch([{ cmd: 'addAdminLayer', args: ['region', { id: 'r', visuel: { source: 'hote', table: { 93: 1 }, niveauTable: 'region' } }] }, { cmd: 'setChoropleth', args: ['r', { classes: 2 }] }, { cmd: 'getLegend', args: ['r'] }]);
  assert.deepEqual([r.ok, r.ko], [3, 0]); assert.equal(r.resultats[2].valeur.classes.length, 1); // une seule valeur : une seule classe
  const e = await api.batch([{ cmd: 'setChoropleth', args: ['inconnue', {}] }, { cmd: 'ping' }]); assert.deepEqual([e.ok, e.ko, e.nonExecutes], [0, 1, 1]);
  assert.deepEqual(Object.keys(api.ping()), ['version', 'couches', 'capacites', 'paquet']); assert.equal(api.ping().version, '0.3');
});

/**
 * Maquettes en dalles 3D, partie pure (lib/dalles3d-geo.js) : lecture du manifeste de grille de la Fabrique (pix2hdr-atlas-grille3d/0.1), adresses calculées,
 * pose d'une dalle sur la carte (convergence, échelle, altitude), choix du niveau, cache. Les valeurs sont celles de la dalle témoin livrée le 17/10/2026.
 * node --test projects/Atlas/tests/dalles3d-geo.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lireGrille, urlGabarit, urlDisponibilite, lireDisponibilite, lireAncrage, mercator, metreEnMercator, matriceDalle, produit4, inverse4, appliquer4,
  niveauPourDistance, niveauAffiche, distanceM, creerCacheLRU, SCHEMA_GRILLE,
} from '../lib/dalles3d-geo.js';

const URL_GRILLE = 'https://fabrique.example/api/fabrique/atlas/grille3d.json';
const GRILLE = {
  schema: SCHEMA_GRILLE, version: '0.1+fcce167c25cc', crs: 'EPSG:2154', territoire: 'FXX', pas_m: 200,
  gabarits: { glb: 'dalles3d/FXX_L93_200_E{E}_N{N}/{niveau}.glb', ancrage: 'dalles3d/FXX_L93_200_E{E}_N{N}/ancrage.json', disponibilite: 'dalles3d/disponibilite.json' },
  niveaux: [
    { niveau: 'D3', refine: 'REPLACE', distance_max_m: 6000, erreur_geometrique_m: 1.44, produit: true },
    { niveau: 'D2', refine: 'REPLACE', distance_max_m: 1500, erreur_geometrique_m: 4.91, produit: true },
    { niveau: 'D1', refine: 'ADD', distance_max_m: 400, erreur_geometrique_m: null, produit: false },
  ],
  attribution: 'Dalles L93 : Fabrique world2pix ; IGN (Licence Ouverte 2.0)',
};
const ANCRAGE = { identifiant: 'FXX_L93_200_E0894400_N6248000', ancrage: { origine_l93: [894500, 6247900], origine_wgs84: [5.396094822683652, 43.303702735297065], altitude_origine_m: 50.87, convergence_deg: -1.7386, facteur_echelle: 1.000591 }, boite: { min: [-149.3016, -8.586, -103.7851], max: [118.5314, 40.9531, 118.6636] } };
const DISPO = { version: '0.1+fcce167c25cc', n: 1, dalles: [{ E: '0894400', N: '6248000', identifiant: 'FXX_L93_200_E0894400_N6248000', id: 447231240, statut: 'livree', niveaux: [{ niveau: 'D2', empreinte: '819ce53b406ee597', octets: 1504340 }, { niveau: 'D3', empreinte: '3fce54f8c493eac5', octets: 414724 }], empreinte_ancrage: '67f513cd91b7af7e' }] };

test('lireGrille : le manifeste de la Fabrique est lu ; les niveaux vont du plus fin au plus grossier', () => {
  const g = lireGrille(GRILLE, URL_GRILLE);
  assert.equal(g.pas, 200); assert.equal(g.version, '0.1+fcce167c25cc'); assert.deepEqual(g.niveaux.map((n) => n.niveau), ['D1', 'D2', 'D3']);
  assert.deepEqual(g.niveaux.map((n) => [n.refine, n.produit]), [['ADD', false], ['REPLACE', true], ['REPLACE', true]]);
  assert.equal(g.niveaux[2].distanceMax, 6000); assert.equal(g.niveaux[0].erreur, null); assert.match(g.mention, /IGN/);
});

test('lireGrille : un manifeste illisible est refusé en clair, jamais à moitié monté', () => {
  const ko = (modif, motif) => assert.throws(() => lireGrille(modif(structuredClone(GRILLE)), URL_GRILLE), motif);
  ko((g) => { g.schema = 'autre/1'; return g; }, /schéma/); ko((g) => { g.crs = 'EPSG:3857'; return g; }, /Lambert 93/);
  ko((g) => { g.pas_m = 2; return g; }, /pas_m/); ko((g) => { delete g.gabarits.glb; return g; }, /gabarit « glb »/);
  ko((g) => { g.gabarits.glb = 'x/{E}/{N}.glb'; return g; }, /\{niveau\}/); ko((g) => { g.niveaux = [{ niveau: 'D1', refine: 'ADD', produit: true }]; return g; }, /aucun niveau produit/);
  assert.throws(() => lireGrille(null, URL_GRILLE), /objet JSON/); assert.throws(() => lireGrille([], URL_GRILLE), /objet JSON/);
  assert.throws(() => lireGrille(GRILLE, 'http://distant.example/grille3d.json'), /https requis/);
  assert.throws(() => lireGrille(GRILLE, './grille3d.json'), /absolue/);
  assert.doesNotThrow(() => lireGrille(GRILLE, 'http://127.0.0.1:8096/api/fabrique/atlas/grille3d.json'));
});

test('urlGabarit : adresse relative au manifeste, jamais hors de son origine, valeurs bornées', () => {
  assert.equal(urlGabarit(GRILLE.gabarits.glb, { E: '0894400', N: '6248000', niveau: 'D3' }, URL_GRILLE), 'https://fabrique.example/api/fabrique/atlas/dalles3d/FXX_L93_200_E0894400_N6248000/D3.glb');
  assert.throws(() => urlGabarit('https://evil.example/{E}/{N}/{niveau}.glb', { E: '1', N: '2', niveau: 'D3' }, URL_GRILLE), /hors de l.origine/);
  assert.throws(() => urlGabarit('//evil.example/{E}.glb', { E: '1' }, URL_GRILLE), /hors de l.origine/);
  assert.throws(() => urlGabarit(GRILLE.gabarits.glb, { E: '../../x', N: '2', niveau: 'D3' }, URL_GRILLE), /inattendue/);
  assert.throws(() => urlGabarit(GRILLE.gabarits.glb, { E: '1', N: '2', niveau: 'D3?x=1' }, URL_GRILLE), /inattendue/);
  const g = lireGrille(GRILLE, URL_GRILLE);
  assert.equal(urlDisponibilite(g, [5.38, 43.29, 5.4, 43.31]), 'https://fabrique.example/api/fabrique/atlas/dalles3d/disponibilite.json?bbox=5.38000%2C43.29000%2C5.40000%2C43.31000');
  assert.equal(urlDisponibilite(g, null), 'https://fabrique.example/api/fabrique/atlas/dalles3d/disponibilite.json');
});

test('lireDisponibilite : les dalles livrées, avec leurs niveaux et leurs empreintes ; le reste est écarté', () => {
  const d = lireDisponibilite(DISPO);
  assert.equal(d.version, '0.1+fcce167c25cc'); assert.equal(d.dalles.length, 1);
  assert.deepEqual(d.dalles[0].niveaux.map((n) => n.niveau), ['D2', 'D3']); assert.equal(d.dalles[0].niveaux[0].empreinte, '819ce53b406ee597'); assert.equal(d.dalles[0].empreinteAncrage, '67f513cd91b7af7e');
  const sale = { dalles: [{ E: '12', N: '6248000', identifiant: 'x', niveaux: [] }, { E: '0894400', N: '6248000', identifiant: 'y', statut: 'en_cours', niveaux: [{ niveau: 'D3', empreinte: 'a', octets: 1 }] }, { E: '0894400', N: '6248000', identifiant: 'z', niveaux: [{ niveau: 'D9', empreinte: 'a', octets: 1 }, { niveau: 'D3', empreinte: 'b', octets: 1e12 }] }] };
  assert.deepEqual(lireDisponibilite(sale).dalles, [], 'E mal formé, dalle non livrée, niveau inconnu, GLB trop lourd : tout est écarté');
  assert.throws(() => lireDisponibilite({}), /liste de dalles/);
});

test('lireAncrage : lu et borné', () => {
  const a = lireAncrage(ANCRAGE);
  assert.deepEqual(a.origine, [5.396094822683652, 43.303702735297065]); assert.equal(a.altitudeOrigine, 50.87); assert.equal(a.convergenceDeg, -1.7386); assert.equal(a.facteurEchelle, 1.000591);
  assert.deepEqual(a.boite.max, [118.5314, 40.9531, 118.6636]);
  const ko = (modif, motif) => assert.throws(() => lireAncrage(modif(structuredClone(ANCRAGE))), motif);
  ko((x) => { delete x.ancrage.origine_wgs84; return x; }, /origine_wgs84/); ko((x) => { x.ancrage.origine_wgs84 = [500, 43]; return x; }, /hors bornes/);
  ko((x) => { x.ancrage.facteur_echelle = 2; return x; }, /facteur_echelle/); ko((x) => { x.ancrage.convergence_deg = 45; return x; }, /convergence/); ko((x) => { x.ancrage.altitude_origine_m = 'x'; return x; }, /altitude/);
  assert.equal(lireAncrage({ ...ANCRAGE, boite: { min: [1], max: [2] } }).boite, null, 'une boîte mal formée est ignorée, pas fatale');
});

test('Mercator : le point de la dalle témoin et la taille du mètre', () => {
  const [x, y] = mercator(5.396094822683652, 43.303702735297065);
  assert.ok(Math.abs(x - 0.514989152) < 1e-8, String(x)); assert.ok(Math.abs(y - 0.36629292) < 1e-7, String(y));
  const s = metreEnMercator(43.303702735297065);
  assert.ok(Math.abs(s * 1e8 - 3.43275) < 0.0001, 'environ 3,43e-8 unités Mercator par mètre à 43°N : ' + s);
  assert.ok(Math.abs(metreEnMercator(0) * 2 * Math.PI * 6371008.8 - 1) < 1e-12, 'à l\'équateur, le mètre est 1 / circonférence');
});

test('matriceDalle : l\'origine, l\'est et le nord de grille, la verticale et l\'altitude', () => {
  const a = lireAncrage(ANCRAGE), s = metreEnMercator(a.origine[1]), [x0, y0] = mercator(...a.origine);
  const m = matriceDalle(a, 50.87);
  const o = appliquer4(m, [0, 0, 0]);
  assert.ok(Math.abs(o[0] - x0) < 1e-15 && Math.abs(o[1] - y0) < 1e-15, 'le centre de la dalle est sur son origine'); assert.ok(Math.abs(o[2] - 50.87 * s) < 1e-15);
  const k = a.facteurEchelle, d = 1.7386 * Math.PI / 180;
  const est = appliquer4(m, [100, 0, 0]);   // 100 m de grille vers l'est de grille
  assert.ok(Math.abs(Math.hypot(est[0] - o[0], est[1] - o[1]) - (100 / k) * s) < 1e-14, 'la longueur est divisée par le facteur d\'échelle');
  assert.ok(est[0] > o[0], 'vers l\'est'); assert.ok(est[1] > o[1], 'et un peu vers le sud (Y croît vers le sud) : l\'est de grille est tourné de +1,74° dans le sens horaire');
  assert.ok(Math.abs((est[1] - o[1]) / (est[0] - o[0]) - Math.tan(d)) < 1e-9, 'l\'angle vaut la convergence');
  const nord = appliquer4(m, [0, 0, -100]);   // nord de grille : z = −nord
  assert.ok(nord[1] < o[1], 'vers le nord (Y décroît)'); assert.ok(nord[0] > o[0], 'et un peu vers l\'est : le nord de grille est à 1,74° à l\'EST du nord géographique');
  assert.ok(Math.abs((nord[0] - o[0]) / (o[1] - nord[1]) - Math.tan(d)) < 1e-9);
  const haut = appliquer4(m, [0, 10, 0]); assert.ok(Math.abs(haut[2] - o[2] - 10 * s) < 1e-15, 'la verticale n\'est pas touchée par le facteur d\'échelle'); assert.equal(haut[0], o[0]);
  assert.ok(Math.abs(appliquer4(matriceDalle(a, 0), [0, 0, 0])[2]) < 1e-18, 'altitude de base nulle : le plan y = 0 est au sol');
});

test('produit4, inverse4, appliquer4 : cohérents entre eux, en double précision', () => {
  const a = lireAncrage(ANCRAGE), m = matriceDalle(a, 12.5), inv = inverse4(m);
  const id = produit4(m, inv);
  for (let i = 0; i < 16; i++) assert.ok(Math.abs(id[i] - (i % 5 === 0 ? 1 : 0)) < 1e-9, 'm × m⁻¹ = identité (' + i + ' : ' + id[i] + ')');
  const p = [37, 5, -120], q = appliquer4(inv, appliquer4(m, p)); for (let i = 0; i < 3; i++) assert.ok(Math.abs(q[i] - p[i]) < 1e-6);
  assert.equal(inverse4(new Array(16).fill(0)), null);
  const autre = matriceDalle({ ...a, origine: [5.4, 43.31] }, 0), rel = produit4(inv, autre);   // l'autre dalle vue depuis celle-ci : une translation de quelques km en mètres
  const t = appliquer4(rel, [0, 0, 0]); assert.ok(Math.abs(t[0]) < 1e4 && Math.abs(t[2]) < 1e4 && Math.abs(t[0]) > 100, 'des mètres, pas des unités Mercator : ' + t);
});

test('niveauPourDistance et niveauAffiche : le plus fin dans sa portée ; jamais de trou tant qu\'un niveau est chargé', () => {
  const g = lireGrille(GRILLE, URL_GRILLE);
  assert.equal(niveauPourDistance(g.niveaux, ['D2', 'D3'], 800), 'D2'); assert.equal(niveauPourDistance(g.niveaux, ['D2', 'D3'], 1500), 'D2');
  assert.equal(niveauPourDistance(g.niveaux, ['D2', 'D3'], 3000), 'D3'); assert.equal(niveauPourDistance(g.niveaux, ['D2', 'D3'], 7000), null, 'au-delà de la portée : rien');
  assert.equal(niveauPourDistance(g.niveaux, ['D3'], 100), 'D3', 'un niveau absent de la dalle ne se demande pas'); assert.equal(niveauPourDistance(g.niveaux, ['D1', 'D2'], 100), 'D2', 'D1 n\'est pas produit');
  assert.equal(niveauAffiche('D2', ['D2', 'D3']), 'D2'); assert.equal(niveauAffiche('D2', ['D3']), 'D3', 'le grossier reste tant que le fin n\'est pas prêt');
  assert.equal(niveauAffiche('D3', ['D2']), 'D2', 'à défaut, un niveau plus fin'); assert.equal(niveauAffiche('D2', []), null); assert.equal(niveauAffiche(null, ['D2']), null);
});

test('distanceM : mètres entre deux points Mercator', () => {
  const lat = 43.3, s = metreEnMercator(lat); assert.ok(Math.abs(distanceM([0.5, 0.4, 0], [0.5 + 100 * s, 0.4, 0], lat) - 100) < 1e-6);
  assert.ok(Math.abs(distanceM([0.5, 0.4, 0], [0.5, 0.4, 30 * s], lat) - 30) < 1e-6);
});

test('creerCacheLRU : le moins récemment utilisé part le premier, dans la limite du budget ; le retrait est signalé', () => {
  const sortis = []; const c = creerCacheLRU(100, (k) => sortis.push(k));
  c.set('a', 1, 40); c.set('b', 2, 40); assert.equal(c.get('a'), 1); c.set('c', 3, 40);
  assert.deepEqual(sortis, ['b'], 'b est le moins récent (a vient d\'être relu)'); assert.deepEqual(c.cles(), ['a', 'c']); assert.equal(c.octets, 80);
  c.set('gros', 4, 500); assert.ok(c.has('gros'), 'un seul élément trop gros reste : on ne le retire pas sous les yeux de qui vient de l\'ajouter'); assert.equal(c.taille, 1);
  c.delete('gros'); assert.equal(c.octets, 0); assert.equal(c.get('absent'), undefined);
});

test("point de controle de la Fabrique (17/10/2026) : le toit le plus haut et deux coins de la dalle temoin tombent a moins de 50 cm des coordonnees L93 -> WGS84 de reference", () => {
  const a = { origine: [5.396094822683652, 43.303702735297065], convergenceDeg: -1.7386, facteurEchelle: 1.000591 };
  const m = matriceDalle(a, 50.87), s = metreEnMercator(a.origine[1]);
  const enGeo = (loc) => { const [X, Y, Z] = appliquer4(m, loc); const n = Math.PI - 2 * Math.PI * Y; return { lng: X * 360 - 180, lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), alt: Z / s }; };
  const ecartM = (p, lng, lat) => Math.hypot((p.lng - lng) * 111320 * Math.cos(lat * Math.PI / 180), (p.lat - lat) * 110540);
  const toit = enGeo([-83.15, 29.49, -11.47]);
  assert.ok(ecartM(toit, 5.3950754, 43.3038286) < 0.5, 'toit : ' + ecartM(toit, 5.3950754, 43.3038286)); assert.ok(Math.abs(toit.alt - 80.36) < 0.01, 'altitude IGN69 80,36 m : ' + toit.alt);
  assert.ok(ecartM(enGeo([-100, 0, -100]), 5.3949010, 43.3046292) < 0.5, 'coin nord-ouest'); assert.ok(ecartM(enGeo([100, 0, 100]), 5.3972886, 43.3027763) < 0.5, 'coin sud-est');
});

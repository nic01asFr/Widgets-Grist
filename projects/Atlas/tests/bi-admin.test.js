// Composant carte BI : couches administratives (aucun accès réseau).
// node --test tests/bi-admin*.test.js tests/bi-choroplethe.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normaliserCode, departementDeCommune, regionDeDepartement, parents, ancetre, communeDeArrondissement, estCommunePLM, COMMUNES_PLM,
  lireValeur, joindre, aireGeodesiqueKm2, creerIndex, agregerPoints, metrique, rapporter, baseDe, signalerPetits, remonter, enfantsAttendus, fusionnerArrondissements, arrondissementsVersCommune,
} from '../lib/bi/admin.js';
import { REGIONS, DEPARTEMENTS } from '../lib/bi/admin-referentiel.js';
import { urlWfs, normaliser, enrichir, chargerCouche, chargerEmbarque, chargerAvecRepli, ErreurSource } from '../lib/bi/admin-sources.js';

const lire = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'));
const carre = (code, x0, y0, x1, y1, props = {}) => ({ type: 'Feature', properties: { code, ...props }, geometry: { type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] } });
const pt = (lng, lat, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lng, lat] } });

// ---- codes et hiérarchie ----
test('codes : les zéros de tête perdus par un tableur sont rétablis, la Corse reste en 2A/2B', () => {
  assert.equal(normaliserCode('departement', 1).code, '01'); assert.equal(normaliserCode('departement', '2a').code, '2A'); assert.equal(normaliserCode('departement', 971).code, '971');
  assert.equal(normaliserCode('commune', 1001).code, '01001'); assert.equal(normaliserCode('commune', '2a004').code, '2A004'); assert.equal(normaliserCode('commune', "'13055").code, '13055'); assert.equal(normaliserCode('commune', '13055.0').code, '13055');
  assert.equal(normaliserCode('region', 1).code, '01'); assert.equal(normaliserCode('epci', 200054807).code, '200054807'); assert.equal(normaliserCode('epci', 12345678).code, '012345678');
  assert.equal(normaliserCode('pays', 'fra').code, 'FRA');
  for (const [n, v] of [['commune', ''], ['commune', null], ['commune', 'abc'], ['departement', 'xx'], ['pays', 'FR'], ['commune', 123456], ['commune', 12.5]]) assert.equal(normaliserCode(n, v).ok, false, n + ' ' + v);
});
test('hiérarchie : commune -> département -> région, y compris Corse et outre-mer', () => {
  assert.equal(departementDeCommune('13055'), '13'); assert.equal(departementDeCommune('2A004'), '2A'); assert.equal(departementDeCommune('2B033'), '2B');
  assert.equal(departementDeCommune('97101'), '971'); assert.equal(departementDeCommune('97611'), '976'); assert.equal(departementDeCommune('20004'), null, 'ancien code Corse : ambigu');
  assert.equal(regionDeDepartement('13'), '93'); assert.equal(regionDeDepartement('2A'), '94'); assert.equal(regionDeDepartement('2B'), '94'); assert.equal(regionDeDepartement('971'), '01'); assert.equal(regionDeDepartement('976'), '06'); assert.equal(regionDeDepartement('75'), '11');
  assert.deepEqual(parents('commune', '2A004'), { pays: 'FRA', commune: '2A004', departement: '2A', region: '94' });
  assert.equal(ancetre('commune', '97411', 'region'), '04'); assert.equal(ancetre('departement', '13', 'departement'), '13'); assert.equal(ancetre('commune', '13055', 'pays'), 'FRA');
});
test('hiérarchie : arrondissements municipaux de Paris, Lyon et Marseille', () => {
  assert.equal(communeDeArrondissement('75108'), '75056'); assert.equal(communeDeArrondissement('69383'), '69123'); assert.equal(communeDeArrondissement('13216'), '13055'); assert.equal(communeDeArrondissement('13055'), null);
  assert.equal(COMMUNES_PLM['75056'].arrondissements.length, 20); assert.equal(COMMUNES_PLM['69123'].arrondissements.length, 9); assert.equal(COMMUNES_PLM['13055'].arrondissements.length, 16);
  assert.ok(estCommunePLM('13055') && !estCommunePLM('13001'));
  assert.deepEqual(parents('arrondissement', '13203'), { pays: 'FRA', arrondissement: '13203', commune: '13055', departement: '13', region: '93' });
});
test('référentiel : 18 régions, 101 départements, chaque département rattaché à une région connue', () => {
  assert.equal(Object.keys(REGIONS).length, 18); assert.equal(Object.keys(DEPARTEMENTS).length, 101);
  for (const [c, d] of Object.entries(DEPARTEMENTS)) assert.ok(REGIONS[d.region], 'région inconnue pour ' + c);
  assert.ok('2A' in DEPARTEMENTS && '2B' in DEPARTEMENTS && '976' in DEPARTEMENTS && !('20' in DEPARTEMENTS));
});

// ---- valeurs ----
test('valeurs : aucune valeur manquante n\'est lue comme zéro', () => {
  for (const v of [null, undefined, '', ' ', 'NA', 'n/a', 'nd', 's', 'c', 'abc', NaN, Infinity, true, {}, []]) assert.equal(lireValeur(v), null, String(v));
  assert.equal(lireValeur(0), 0); assert.equal(lireValeur('0'), 0); assert.equal(lireValeur('1 234,5'), 1234.5); assert.equal(lireValeur('12 %'), 12); assert.equal(lireValeur('-3,2'), -3.2);
});

// ---- jointure ----
test('jointure : tableau {code: valeur}, zéros de tête, absents sans donnée, orphelins et invalides signalés', () => {
  const unites = [carre('01001', 0, 0, 1, 1), carre('01002', 1, 0, 2, 1), carre('2A004', 2, 0, 3, 1), carre('13055', 3, 0, 4, 1)];
  const { valeurs, rapport } = joindre(unites, { 1001: 5, '01002': 0, '2a004': 'NA', '99999': 7, 'zz': 3 }, { niveau: 'commune' });
  assert.equal(valeurs.get('01001'), 5); assert.equal(valeurs.get('01002'), 0, 'le zéro réel reste un zéro'); assert.equal(valeurs.get('2A004'), null, 'NA -> sans donnée'); assert.equal(valeurs.get('13055'), null, 'absent -> sans donnée, pas zéro');
  assert.equal(rapport.joints, 2); assert.equal(rapport.sansDonnee, 2); assert.deepEqual(rapport.orphelins, ['99999']); assert.deepEqual(rapport.invalides, ['zz']);
});
test('jointure : lignes {code, valeur}, Map, doublons, valeurs illisibles', () => {
  const unites = [carre('13', 0, 0, 1, 1), carre('84', 1, 0, 2, 1)]; unites.forEach((u) => { u.properties.code = u.properties.code; });
  const deps = [carre('13', 0, 0, 1, 1), carre('84', 1, 0, 2, 1)];
  const a = joindre(deps, [{ dep: 13, v: 10 }, { dep: '13', v: 99 }, { dep: 84, v: 'beaucoup' }], { niveau: 'departement', cle: 'dep', champ: 'v' });
  assert.equal(a.valeurs.get('13'), 10, 'premier retenu'); assert.deepEqual(a.rapport.doublons, ['13']); assert.deepEqual(a.rapport.nonNumeriques, ['84']); assert.equal(a.valeurs.get('84'), null);
  const b = joindre(deps, [{ dep: 13, v: 10 }, { dep: '13', v: 99 }], { niveau: 'departement', cle: 'dep', champ: 'v', doublons: 'somme' }); assert.equal(b.valeurs.get('13'), 109);
  const c = joindre(deps, new Map([['13', 4]]), { niveau: 'departement' }); assert.equal(c.valeurs.get('13'), 4); assert.equal(c.valeurs.get('84'), null);
  const d = joindre(deps, { 13: { taux: 3.5 } }, { niveau: 'departement', champ: 'taux' }); assert.equal(d.valeurs.get('13'), 3.5);
});

// ---- géométrie ----
test('aire géodésique : 1° x 1° à l\'équateur ≈ 12 364 km², trous retranchés', () => {
  const a = aireGeodesiqueKm2(carre('x', 0, 0, 1, 1).geometry); assert.ok(Math.abs(a - 12364) < 40, String(a));
  const troue = { type: 'Polygon', coordinates: [carre('x', 0, 0, 2, 2).geometry.coordinates[0], [[0.5, 0.5], [0.5, 1.5], [1.5, 1.5], [1.5, 0.5], [0.5, 0.5]]] };
  assert.ok(aireGeodesiqueKm2(troue) < aireGeodesiqueKm2(carre('x', 0, 0, 2, 2).geometry) * 0.8); assert.equal(aireGeodesiqueKm2(null), null);
});
test('index : point dans polygone, trous, multipolygones, hors zone', () => {
  const troue = { type: 'Feature', properties: { code: 'T' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [1, 3], [3, 3], [3, 1], [1, 1]]] } };
  const multi = { type: 'Feature', properties: { code: 'M' }, geometry: { type: 'MultiPolygon', coordinates: [[[[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]], [[[20, 20], [21, 20], [21, 21], [20, 21], [20, 20]]]] } };
  const ix = creerIndex([troue, multi]);
  assert.equal(ix.trouver(0.5, 0.5).code, 'T'); assert.equal(ix.trouver(2, 2).code, null, 'dans le trou'); assert.equal(ix.trouver(10.5, 10.5).code, 'M'); assert.equal(ix.trouver(20.5, 20.5).code, 'M'); assert.equal(ix.trouver(15, 15).code, null); assert.equal(ix.nUnites, 2);
});
test('index : frontières communes, chevauchement déterministe et tolérance aux interstices', () => {
  const a = carre('A', 0, 0, 1, 1), b = carre('B', 1, 0, 2, 1);
  const ix = creerIndex([b, a]);
  const r1 = ix.trouver(1, 0.5); assert.ok(r1.code === 'A' || r1.code === 'B'); assert.equal(r1.ambigu, false, 'une arête partagée n\'est comptée qu\'une fois');
  const chev = creerIndex([carre('A', 0, 0, 2, 1), carre('B', 1, 0, 3, 1)]);
  const rc = chev.trouver(1.5, 0.5); assert.equal(rc.code, 'A', 'le plus petit code gagne'); assert.equal(rc.ambigu, true);
  const trou = creerIndex([carre('A', 0, 0, 1, 1), carre('B', 1.0002, 0, 2, 1)]); // interstice de ~22 m
  assert.equal(trou.trouver(1.0001, 0.5).code, null); const r = trou.trouver(1.0001, 0.5, 100); assert.ok(r.proche && (r.code === 'A' || r.code === 'B'));
  assert.equal(trou.trouver(1.5, 5, 100).code, null);
});
test('index : villes connues dans les départements embarqués, outre-mer et Corse compris', () => {
  const ix = creerIndex(lire('../lib/bi/donnees/departements-leger.json').features);
  const att = { 'Marseille': [5.37, 43.30, '13'], 'Paris': [2.35, 48.86, '75'], 'Ajaccio': [8.74, 41.92, '2A'], 'Bastia': [9.45, 42.70, '2B'], 'Cayenne': [-52.33, 4.94, '973'], 'Saint-Denis (974)': [55.45, -20.88, '974'], 'Mamoudzou': [45.23, -12.78, '976'], 'Lille': [3.06, 50.63, '59'], 'Pointe-à-Pitre': [-61.53, 16.24, '971'], 'Fort-de-France': [-61.07, 14.60, '972'] };
  for (const [v, [x, y, c]] of Object.entries(att)) assert.equal(ix.trouver(x, y, 3000).code, c, v);
  const pays = creerIndex(lire('../lib/bi/donnees/pays-leger.json').features);
  assert.equal(pays.trouver(2.35, 48.86).code, 'FRA'); assert.equal(pays.trouver(13.4, 52.5).code, 'DEU'); assert.equal(pays.trouver(-30, 30).code, null, 'océan');
});

// ---- agrégation ----
test('agrégation : effectif, somme, moyenne, médiane, min, max, catégories ; les valeurs illisibles ne sont pas des zéros', () => {
  const ix = creerIndex([carre('A', 0, 0, 1, 1), carre('B', 1, 0, 2, 1), carre('C', 2, 0, 3, 1)]);
  const pts = [pt(0.2, 0.2, { v: 10, k: 'x' }), pt(0.4, 0.4, { v: 30, k: 'y' }), pt(0.6, 0.6, { v: 20, k: 'x' }), pt(0.7, 0.7, { v: 'n/a', k: 'x' }), pt(1.5, 0.5, { v: 'n/a', k: 'y' }), pt(9, 9, { v: 1 }), { geometry: null }, pt(NaN, 1)];
  const { unites, stats } = agregerPoints(pts, ix, { champ: 'v', categorie: 'k' });
  const A = unites.get('A'); assert.deepEqual([A.n, A.nVal, A.somme, A.moyenne, A.mediane, A.min, A.max], [4, 3, 60, 20, 20, 10, 30]); assert.deepEqual(A.categories, { x: 3, y: 1 });
  const B = unites.get('B'); assert.equal(B.n, 1); assert.equal(B.nVal, 0); assert.equal(B.moyenne, null); assert.equal(B.somme, null); assert.equal(B.mediane, null);
  assert.equal(unites.has('C'), false, 'aucun point : l\'unité n\'est pas inventée');
  assert.equal(stats.points, 8); assert.equal(stats.affectes, 5); assert.equal(stats.horsZone, 1); assert.equal(stats.invalides, 2);
  assert.equal(metrique(A, 'n'), 4); assert.equal(metrique(A, 'mediane'), 20); assert.equal(metrique(A, 'n:x'), 3); assert.equal(metrique(A, 'part:x'), 75); assert.equal(metrique(B, 'moyenne'), null); assert.equal(metrique(null, 'n'), null);
  assert.throws(() => metrique(A, 'inconnue'));
});
test('agrégation : médiane paire, valeurs négatives, points en doublon à une frontière', () => {
  const ix = creerIndex([carre('A', 0, 0, 1, 1), carre('B', 1, 0, 2, 1)]);
  const { unites } = agregerPoints([pt(0.5, 0.5, { v: -4 }), pt(0.6, 0.5, { v: 8 }), pt(0.7, 0.5, { v: 2 }), pt(0.8, 0.5, { v: 6 }), pt(1, 0.5, { v: 1 }), pt(1, 0.5, { v: 1 })], ix, { champ: 'v' });
  assert.equal(unites.get('A').mediane, 4); assert.equal(unites.get('A').min, -4);
  let total = 0; for (const u of unites.values()) total += u.n; assert.equal(total, 6, 'aucun point perdu ni compté deux fois');
});
test('agrégation : 5 000 points sur 400 cellules, affectation exacte', () => {
  const U = []; for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) U.push(carre(String(i * 20 + j).padStart(3, '0'), i, j, i + 1, j + 1));
  const ix = creerIndex(U); let s = 7; const r = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const pts = Array.from({ length: 5000 }, () => pt(r() * 20, r() * 20)); const { unites, stats } = agregerPoints(pts, ix);
  assert.equal(stats.affectes, 5000); let t = 0; for (const [c, u] of unites) { t += u.n; } assert.equal(t, 5000);
  for (const p of pts.slice(0, 200)) { const [x, y] = p.geometry.coordinates; assert.equal(ix.trouver(x, y).code, String(Math.floor(x) * 20 + Math.floor(y)).padStart(3, '0')); }
});

// ---- indicateurs rapportés, petits effectifs, remontée ----
test('rapporter : taux pour 1 000 habitants, base absente ou nulle -> null (jamais Infinity)', () => {
  assert.equal(rapporter(50, 10000, 1000), 5); assert.equal(rapporter(0, 10000, 1000), 0, 'zéro réel');
  for (const [v, b] of [[5, 0], [5, null], [5, undefined], [5, -1], [null, 10], [NaN, 10], [undefined, 10]]) assert.equal(rapporter(v, b, 1000), null, v + '/' + b);
  assert.equal(baseDe({ population: 0 }, 'population'), null); assert.equal(baseDe({ population: '1 200' }, 'population'), 1200); assert.equal(baseDe({ surface_km2: 25 }, 'surface'), 25); assert.equal(baseDe({}, 'surface'), null);
});
test('petits effectifs : unités sous le seuil signalées, seuil nul = aucun signalement', () => {
  const s = signalerPetits(new Map([['a', 3], ['b', 30], ['c', null], ['d', 9]]), 10); assert.deepEqual([...s].sort(), ['a', 'd']); assert.equal(signalerPetits(new Map([['a', 1]]), 0).size, 0);
});
test('remontée : somme, taux jamais moyennés, couverture des unités manquantes', () => {
  const l = new Map([['13055', { num: 100, den: 1000 }], ['13001', { num: 30, den: 100 }], ['13002', { num: null, den: 50 }], ['84001', { num: 5, den: 500 }], ['75056', { num: 1, den: 2 }]]);
  const somme = remonter(new Map([...l].map(([k, v]) => [k, { num: v.num }])), { source: 'commune', cible: 'departement', mode: 'somme' });
  assert.equal(somme.get('13').valeur, 130); assert.equal(somme.get('13').nManquants, 1); assert.ok(Math.abs(somme.get('13').couverture - 2 / 3) < 1e-9); assert.equal(somme.get('84').valeur, 5);
  const taux = remonter(l, { source: 'commune', cible: 'departement', mode: 'rapport', facteur: 1000 });
  assert.equal(taux.get('13').valeur, (130 / 1100) * 1000, 'rapport des sommes, pas moyenne des taux'); assert.notEqual(taux.get('13').valeur, (100 + 300) / 2);
  const reg = remonter(l, { source: 'commune', cible: 'region', mode: 'somme' }); assert.equal(reg.get('93').valeur, 135, 'Vaucluse (84) est en PACA'); assert.equal(reg.get('11').valeur, 1);
  const vide = remonter(new Map([['13001', { num: null }]]), { source: 'commune', cible: 'departement' }); assert.equal(vide.get('13').valeur, null, 'tout manquant -> null, pas 0');
});
test('arrondissements : aucune double comptabilisation Paris / Lyon / Marseille', () => {
  const communes = [carre('75056', 0, 0, 2, 2), carre('13055', 5, 0, 7, 2), carre('13001', 8, 0, 9, 1)];
  const arr = COMMUNES_PLM['13055'].arrondissements.map((c, i) => carre(c, 5 + i * 0.1, 0, 5.1 + i * 0.1, 1));
  const fusion = fusionnerArrondissements(communes, arr);
  assert.ok(!fusion.some((f) => f.properties.code === '13055'), 'Marseille remplacée'); assert.ok(fusion.some((f) => f.properties.code === '75056'), 'Paris conservée : arrondissements non fournis');
  assert.equal(fusion.filter((f) => f.properties.commune === '13055').length, 16); assert.equal(fusion.length, 1 + 1 + 16);
  const v = arrondissementsVersCommune(new Map([['13201', 5], ['13202', null], ['13001', 2]])); assert.equal(v.get('13055'), 5); assert.equal(v.get('13001'), 2);
  const seul = arrondissementsVersCommune(new Map([['13201', null]])); assert.equal(seul.get('13055'), null);
});

// ---- sources ----
test('sources : URL WFS, filtre CQL, pagination et normalisation (fetch simulé)', async () => {
  const u = urlWfs('commune', { filtre: { departement: '2A' }, debut: 5000, nombre: 5000 }); assert.match(u, /TYPENAMES=ADMINEXPRESS-COG-CARTO-PE\.LATEST%3Acommune/); assert.match(u, /STARTINDEX=5000/); assert.match(decodeURIComponent(u), /CQL_FILTER=code_insee_du_departement='2A'/); assert.match(u, /srsName=EPSG%3A4326/);
  assert.match(urlWfs('region', { hits: true }), /resultType=hits/); assert.throws(() => urlWfs('pays'), /niveau/);
  const brut = (i) => ({ type: 'Feature', properties: { code_insee: String(10000 + i), nom_officiel: 'C' + i, population: i * 10, superficie_cadastrale: 250, code_insee_du_departement: '10', code_insee_de_la_region: '44', codes_siren_des_epci: '200000001', statut: 'Commune simple', date_du_recensement: '2023-01-01Z' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } });
  const appels = []; const f = async (url) => { appels.push(url); const d = Number(new URL(url).searchParams.get('STARTINDEX')), n = Number(new URL(url).searchParams.get('COUNT')); const feats = Array.from({ length: 12 }, (_, i) => brut(i)).slice(d, d + n); return { ok: true, status: 200, text: async () => JSON.stringify({ type: 'FeatureCollection', features: feats, numberMatched: 12, numberReturned: feats.length }) }; };
  const prog = []; const r = await chargerCouche('commune', { fetch: f, pageTaille: 5, parallele: 2, surProgres: (p) => prog.push(p.pages) });
  assert.equal(appels.length, 3); assert.equal(r.features.length, 12); assert.equal(r.meta.nRequetes, 3); assert.equal(r.meta.partiel, false); assert.ok(r.meta.octets > 0);
  const p = r.features[3].properties; assert.deepEqual([p.code, p.nom, p.population, p.surface_km2, p.departement, p.region, p.epci, p.niveau, p.annee_population], ['10003', 'C3', 30, 2.5, '10', '44', '200000001', 'commune', '2023']);
  assert.equal(new Set(r.features.map((x) => x.properties.code)).size, 12);
});
test('sources : panne du service -> erreur explicite ; repli sur le jeu embarqué pour régions et départements', async () => {
  const panne = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(chargerCouche('commune', { fetch: panne }), (e) => e instanceof ErreurSource && e.code === 'reseau' && /injoignable/.test(e.message));
  await assert.rejects(chargerCouche('region', { fetch: async () => ({ ok: false, status: 503, text: async () => '' }) }), (e) => e.code === 'http' && /503/.test(e.message));
  await assert.rejects(chargerCouche('region', { fetch: async () => ({ ok: true, status: 200, text: async () => '<html>' }) }), (e) => e.code === 'format');
  const racine = new URL('../lib/bi/donnees/', import.meta.url);
  const f = async (url) => { if (/data\.geopf\.fr/.test(url)) throw new TypeError('Failed to fetch'); return { ok: true, status: 200, text: async () => fs.readFileSync(new URL(url, racine), 'utf8') }; };
  const refs = lire('../lib/bi/donnees/references-population.json');
  const r = await chargerAvecRepli('departement', { fetch: f, base: '', refs }); assert.equal(r.meta.repli, true); assert.match(r.meta.cause, /injoignable/); assert.equal(r.features.length, 101); assert.equal(r.meta.source, 'embarque'); assert.ok(r.meta.simplifie);
  const d13 = r.features.find((x) => x.properties.code === '13').properties; assert.equal(d13.population, 2087658); assert.ok(d13.surface_km2 > 5000);
  await assert.rejects(chargerAvecRepli('commune', { fetch: f }), (e) => e.code === 'reseau', 'pas de jeu embarqué pour les communes : l\'erreur remonte');
  await assert.rejects(chargerEmbarque('commune', { fetch: f }), (e) => e.code === 'embarque');
  const pays = await chargerAvecRepli('pays', { fetch: f, base: '' }); assert.equal(pays.features.length, 177); assert.match(pays.meta.attribution, /Natural Earth/);
});
test('sources : surface géodésique ajoutée quand elle manque, valeur existante respectée', () => {
  const f = [{ type: 'Feature', properties: { code: 'x' }, geometry: carre('x', 0, 0, 1, 1).geometry }, { type: 'Feature', properties: { code: 'y', surface_km2: 5 }, geometry: carre('y', 0, 0, 1, 1).geometry }];
  enrichir('region', f, null); assert.ok(Math.abs(f[0].properties.surface_km2 - 12364) < 40); assert.equal(f[1].properties.surface_km2, 5);
  assert.equal(normaliser('region', { properties: { code_insee: '93', nom_officiel: 'PACA' }, geometry: null }).properties.niveau, 'region');
});

test("agrégation : l'affectation point par point est restituée (filtrer les points d'une unité)", () => {
  const ix = creerIndex([carre('A', 0, 0, 1, 1), carre('B', 1, 0, 2, 1)]);
  const r = agregerPoints([pt(0.5, 0.5), pt(1.5, 0.5), pt(9, 9), { geometry: null }, pt(0.2, 0.2)], ix, { affectation: true });
  assert.deepEqual(r.codes, ['A', 'B', null, null, 'A']); assert.equal(agregerPoints([pt(0.5, 0.5)], ix).codes, undefined);
});
test('remontée : les lignes ABSENTES du tableau comptent comme manquantes (enfants attendus)', () => {
  const att = enfantsAttendus('departement', 'region'); assert.equal(att.get('93'), 6); assert.equal(att.get('94'), 2); assert.equal(att.get('11'), 8);
  assert.equal(enfantsAttendus('departement', 'pays').get('FRA'), 101); assert.equal(enfantsAttendus('region', 'pays').get('FRA'), 18); assert.equal(enfantsAttendus('commune', 'departement'), null);
  const refs = { departement: { '13': { communes: 119 } } }; assert.equal(enfantsAttendus('commune', 'departement', refs).get('13'), 119);
  const l = new Map([['13', { num: 5 }], ['84', { num: 7 }], ['04', { num: 3 }], ['05', { num: 1 }], ['06', { num: 2 }]]); // 83 absent
  const sans = remonter(l, { source: 'departement', cible: 'region' }); assert.equal(sans.get('93').couverture, 1, 'sans la liste des attendus, rien ne manque');
  const avec = remonter(l, { source: 'departement', cible: 'region', attendus: att }); assert.ok(Math.abs(avec.get('93').couverture - 5 / 6) < 1e-9); assert.equal(avec.get('93').nManquants, 1); assert.equal(avec.get('93').valeur, 18);
});

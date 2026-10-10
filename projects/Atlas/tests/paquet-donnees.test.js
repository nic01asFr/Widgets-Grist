// Paquet hors ligne, artefact `donnees` : construction du dossier et vérification indépendante (aucun accès réseau).
// node --test tests/paquet-donnees.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  arrondirGeometrie, reduireEntite, construireFichierDepartement, empreinte, departementsParDefaut, construirePaquet, ErreurPaquet,
} from '../tools/construire-paquet.mjs';
import { verifierPaquet } from '../tools/verifier-paquet.mjs';
import { normaliser } from '../lib/bi/admin-sources.js';
import { VERSION as VERSION_CONTRAT } from '../lib/bi/pont.js';
import { VERSION_CHARTE } from '../lib/charte/schema.js';

const carre = (x, y, t = 0.01) => [[[x, y], [x + t, y], [x + t, y + t], [x, y + t], [x, y]]];
const brute = (code, nom, pop, dep, geom, extra = {}) => ({
  type: 'Feature',
  properties: { code_insee: code, nom_officiel: nom, population: pop, superficie_cadastrale: 1234, code_insee_du_departement: dep, code_insee_de_la_region: '27', codes_siren_des_epci: '200000000', statut: 'Commune simple', date_du_recensement: '2023-01-01', ...extra },
  geometry: geom || { type: 'Polygon', coordinates: carre(6.123456789, 47.987654321) },
});

/** Faux service WFS : répond par pages selon STARTINDEX / COUNT, à partir de jeux par couche et par département. */
function fauxService(jeux) {
  const appels = [];
  const f = async (url) => {
    const u = new URL(url); appels.push(u.search);
    const couche = u.searchParams.get('TYPENAMES').split(':')[1];
    const cql = u.searchParams.get('CQL_FILTER') || '';
    const m = /='([^']+)'/.exec(cql); const cle = couche + (m ? ':' + m[1] : '');
    if (!(cle in jeux)) return { ok: false, status: 404, text: async () => '' };
    const tout = jeux[cle]; const debut = Number(u.searchParams.get('STARTINDEX') || 0); const n = Number(u.searchParams.get('COUNT') || 5000);
    const corps = JSON.stringify({ type: 'FeatureCollection', numberMatched: tout.length, features: tout.slice(debut, debut + n) });
    return { ok: true, status: 200, text: async () => corps };
  };
  f.appels = appels;
  return f;
}

const dossierTemp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'paquet-'));

test('arrondirGeometrie : 4 décimales, points consécutifs identiques supprimés, anneaux refermés', () => {
  const g = { type: 'Polygon', coordinates: [[[6.12341, 47.98761], [6.123449, 47.98761], [6.12351, 47.98862], [6.12341, 47.98862], [6.12341, 47.98761]]] };
  const r = arrondirGeometrie(g, 4);
  assert.deepEqual(r.coordinates[0][0], [6.1234, 47.9876]);
  assert.equal(r.coordinates[0].length, 5 - 1 + 0, 'le point doublé après arrondi est retiré');
  assert.deepEqual(r.coordinates[0][0], r.coordinates[0][r.coordinates[0].length - 1]);
});

test('arrondirGeometrie : un polygone qui s\'effondre à 4 décimales garde une précision supérieure', () => {
  const g = { type: 'Polygon', coordinates: carre(55.000001, -21.000001, 0.00002) };
  const r = arrondirGeometrie(g, 4);
  assert.ok(r && r.coordinates[0].length >= 4);
  assert.ok(r.coordinates[0].some(([x]) => String(x).split('.')[1]?.length > 4), 'repli sur plus de décimales');
});

test('arrondirGeometrie : MultiPolygon, trous conservés, anneau trop petit supprimé', () => {
  const g = { type: 'MultiPolygon', coordinates: [[carre(2, 48, 1)[0], carre(2.4, 48.4, 0.2)[0]], [carre(10, 10, 0.00001)[0]]] };
  const r = arrondirGeometrie(g, 4);
  assert.equal(r.type, 'MultiPolygon');
  assert.equal(r.coordinates[0].length, 2, 'le trou reste');
});

test('reduireEntite : code INSEE, nom, population, niveau, et rien d\'autre', () => {
  const e = reduireEntite('commune', normaliser('commune', brute('70001', 'Abelcourt', 123, '70')));
  assert.deepEqual(Object.keys(e.properties).sort(), ['code', 'niveau', 'nom', 'population']);
  assert.equal(e.properties.code, '70001'); assert.equal(e.properties.niveau, 'commune'); assert.equal(e.properties.population, 123);
  assert.ok(e.geometry.coordinates[0].every(([x, y]) => Number(x.toFixed(4)) === x && Number(y.toFixed(4)) === y));
});

test('reduireEntite : une commune sans population reste présente avec population null', () => {
  const e = reduireEntite('commune', normaliser('commune', brute('70002', 'Sans', null, '70')));
  assert.equal(e.properties.population, null);
});

test('departementsParDefaut : France entière, 2A/2B et 971 à 976, pas de 20', () => {
  const d = departementsParDefaut();
  assert.equal(d.length, 101);
  for (const c of ['01', '2A', '2B', '95', '971', '972', '973', '974', '976']) assert.ok(d.includes(c), c);
  assert.ok(!d.includes('20'));
  assert.deepEqual([...d], [...d].sort());
});

test('empreinte : sha384 en base64, comme une valeur d\'attribut integrity', () => {
  const octets = Buffer.from('atlas');
  assert.equal(empreinte(octets), 'sha384-' + crypto.createHash('sha384').update(octets).digest('base64'));
});

test('construireFichierDepartement : pagination, filtre de communes, arrondissements Paris', async () => {
  const communes = Array.from({ length: 7 }, (_, i) => brute('7000' + (i + 1), 'C' + i, 10 + i, '70', { type: 'Polygon', coordinates: carre(6 + i / 10, 47) }));
  const f = fauxService({ 'commune:70': communes });
  const r = await construireFichierDepartement('70', { fetch: f, pageTaille: 3, produit: 'pe', edition: '2026' });
  assert.equal(r.fichier.features.length, 7);
  assert.equal(f.appels.length, 3, 'trois pages de trois, trois et un');
  assert.equal(r.fichier.meta.departement, '70');
  assert.equal(r.fichier.meta.recensement, '2023');
  const filtre = await construireFichierDepartement('70', { fetch: fauxService({ 'commune:70': communes }), communes: ['70002', '70005'] });
  assert.deepEqual(filtre.fichier.features.map((x) => x.properties.code), ['70002', '70005']);
});

test('construireFichierDepartement : Paris ajoute ses vingt arrondissements, rattachés par la commune 75056', async () => {
  const arr = Array.from({ length: 3 }, (_, i) => brute('7510' + (i + 1), 'Paris ' + (i + 1), 5000, '75', null, { code_insee_de_la_commune_de_rattach: '75056' }));
  const lyon = [brute('69381', 'Lyon 1er', 100, '69', null, { code_insee_de_la_commune_de_rattach: '69123' })];
  const f = fauxService({ 'commune:75': [brute('75056', 'Paris', 15000, '75')], arrondissement_municipal: [...arr, ...lyon] });
  const r = await construireFichierDepartement('75', { fetch: f, arrondissements: await (async () => { const { chargerCouche } = await import('../lib/bi/admin-sources.js'); return (await chargerCouche('arrondissement', { fetch: f })).features; })() });
  const niveaux = r.fichier.features.map((x) => x.properties.niveau);
  assert.equal(niveaux.filter((n) => n === 'arrondissement').length, 3, 'seuls ceux de Paris');
  assert.ok(!r.fichier.features.some((x) => x.properties.code === '69381'));
  const a = r.fichier.features.find((x) => x.properties.code === '75101');
  assert.equal(a.properties.commune, '75056');
});

test('construireFichierDepartement : codes spéciaux 2A et 971 passent tels quels dans le filtre', async () => {
  const f = fauxService({ 'commune:2A': [brute('2A004', 'Ajaccio', 70000, '2A')], 'commune:971': [brute('97101', 'Les Abymes', 50000, '971')] });
  const a = await construireFichierDepartement('2A', { fetch: f });
  const g = await construireFichierDepartement('971', { fetch: f });
  assert.equal(a.fichier.features[0].properties.code, '2A004');
  assert.equal(g.fichier.features[0].properties.code, '97101');
  assert.ok(f.appels.some((s) => s.includes("code_insee_du_departement%3D%272A%27")));
});

test('construireFichierDepartement : un département vide est une erreur nommée, pas un fichier vide', async () => {
  await assert.rejects(
    () => construireFichierDepartement('70', { fetch: fauxService({ 'commune:70': [] }) }),
    (e) => e instanceof ErreurPaquet && e.code === 'vide' && /70/.test(e.message),
  );
});

test('construirePaquet : dossier complet, manifeste exact, chemins relatifs, licences et cache', async () => {
  const sortie = dossierTemp();
  const f = fauxService({
    'commune:70': [brute('70001', 'Abelcourt', 123, '70'), brute('70002', 'Autre', 45, '70')],
    'commune:2A': [brute('2A004', 'Ajaccio', 70000, '2A')],
    arrondissement_municipal: [],
  });
  const maintenant = () => new Date('2026-10-10T12:00:00Z');
  const m = await construirePaquet({ sortie, departements: ['2A', '70'], fetch: f, maintenant, edition: '2026', versionPaquet: '1.0.0' });
  assert.equal(m.version_paquet, '1.0.0');
  assert.equal(m.version_contrat, VERSION_CONTRAT);
  assert.equal(m.version_charte, VERSION_CHARTE.split('/')[1]);
  assert.equal(m.edition_admin_express, '2026');
  assert.equal(m.recensement, '2023');
  assert.equal(m.construit_le, '2026-10-10T12:00:00.000Z');
  assert.deepEqual(m.territoires.departements, ['2A', '70']);
  assert.equal(m.territoires.communes, 3);
  const chemins = m.fichiers.map((x) => x.chemin);
  for (const c of ['donnees/pays-leger.json', 'donnees/regions-leger.json', 'donnees/departements-leger.json', 'donnees/references-population.json', 'donnees/communes/2A.json', 'donnees/communes/70.json']) assert.ok(chemins.includes(c), c);
  for (const x of m.fichiers) {
    assert.ok(!x.chemin.startsWith('/') && !x.chemin.includes('..') && !x.chemin.includes('\\') && !/^[A-Za-z]:/.test(x.chemin), x.chemin);
    const octets = fs.readFileSync(path.join(sortie, ...x.chemin.split('/')));
    assert.equal(octets.length, x.taille); assert.equal(empreinte(octets), x.integrite);
    assert.ok(['france', 'departement'].includes(x.portee));
    if (x.portee === 'departement') assert.match(x.departement, /^(\d{2,3}|2[AB])$/); else assert.equal(x.departement, undefined);
  }
  assert.match(fs.readFileSync(path.join(sortie, 'LICENCES.txt'), 'utf8'), /Licence Ouverte[\s\S]*IGN[\s\S]*INSEE[\s\S]*Natural Earth/);
  const cache = fs.readFileSync(path.join(sortie, 'cache.txt'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  assert.deepEqual(cache.sort(), chemins.slice().sort());
  const socle = fs.readFileSync(path.join(sortie, 'cache-socle.txt'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  assert.deepEqual(socle.sort(), m.fichiers.filter((x) => x.portee === 'france').map((x) => x.chemin).sort());
  assert.ok(socle.length >= 5 && !socle.some((c) => c.includes('communes/')), 'socle et licences, aucun département');
  assert.ok(fs.existsSync(path.join(sortie, 'manifeste.json')));
  const v = verifierPaquet(sortie); assert.deepEqual(v.erreurs, []); assert.equal(v.fichiers, chemins.length);
});

test('construirePaquet : deux constructions donnent les mêmes fichiers octet pour octet', async () => {
  const jeux = () => fauxService({ 'commune:70': [brute('70001', 'A', 1, '70')], arrondissement_municipal: [] });
  const a = dossierTemp(), b = dossierTemp();
  const maintenant = () => new Date('2026-10-10T12:00:00Z');
  await construirePaquet({ sortie: a, departements: ['70'], fetch: jeux(), maintenant });
  await construirePaquet({ sortie: b, departements: ['70'], fetch: jeux(), maintenant });
  for (const c of ['manifeste.json', 'cache.txt', 'LICENCES.txt', 'donnees/communes/70.json']) assert.ok(fs.readFileSync(path.join(a, c)).equals(fs.readFileSync(path.join(b, c))), c);
});

test('construirePaquet : refuse un code de département inconnu et ne laisse aucun dossier à moitié écrit', async () => {
  const sortie = path.join(dossierTemp(), 'atlas-bi-paquet');
  await assert.rejects(() => construirePaquet({ sortie, departements: ['70', '99'], fetch: fauxService({}) }), (e) => e instanceof ErreurPaquet && e.code === 'departement');
  assert.ok(!fs.existsSync(sortie));
});

test('construirePaquet : une panne du service en cours de route ne publie pas de manifeste', async () => {
  const sortie = path.join(dossierTemp(), 'atlas-bi-paquet');
  const f = fauxService({ 'commune:70': [brute('70001', 'A', 1, '70')], arrondissement_municipal: [] }); // 2A absent : 404
  await assert.rejects(() => construirePaquet({ sortie, departements: ['70', '2A'], fetch: f }));
  assert.ok(!fs.existsSync(path.join(sortie, 'manifeste.json')));
});

test('construirePaquet : refuse d\'écrire dans un dossier non vide qui n\'est pas un paquet', async () => {
  const sortie = dossierTemp(); fs.writeFileSync(path.join(sortie, 'autre.txt'), 'x');
  await assert.rejects(() => construirePaquet({ sortie, departements: ['70'], fetch: fauxService({}) }), (e) => e instanceof ErreurPaquet && e.code === 'sortie');
  assert.ok(fs.existsSync(path.join(sortie, 'autre.txt')));
});

test('verifierPaquet : détecte une copie tronquée, un fichier altéré, un fichier absent et un chemin dangereux', async () => {
  const sortie = dossierTemp();
  await construirePaquet({ sortie, departements: ['70'], fetch: fauxService({ 'commune:70': [brute('70001', 'A', 1, '70')], arrondissement_municipal: [] }) });
  const cible = path.join(sortie, 'donnees', 'communes', '70.json');
  const original = fs.readFileSync(cible);
  fs.writeFileSync(cible, original.subarray(0, original.length - 5));
  let v = verifierPaquet(sortie); assert.ok(v.erreurs.some((e) => /taille/.test(e) && /communes\/70\.json/.test(e)), v.erreurs.join('|'));
  const alteree = Buffer.from(original); alteree[20] = alteree[20] ^ 1; fs.writeFileSync(cible, alteree);
  v = verifierPaquet(sortie); assert.ok(v.erreurs.some((e) => /empreinte/.test(e)));
  fs.rmSync(cible); v = verifierPaquet(sortie); assert.ok(v.erreurs.some((e) => /absent/.test(e)));
  fs.writeFileSync(cible, original);
  const man = JSON.parse(fs.readFileSync(path.join(sortie, 'manifeste.json'), 'utf8'));
  man.fichiers.push({ chemin: '../hors.json', taille: 1, integrite: 'sha384-x', portee: 'france' });
  fs.writeFileSync(path.join(sortie, 'manifeste.json'), JSON.stringify(man));
  v = verifierPaquet(sortie); assert.ok(v.erreurs.some((e) => /chemin/.test(e)));
});

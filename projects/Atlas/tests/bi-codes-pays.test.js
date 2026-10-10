// Chaque unite d'un choroplethe porte un code UNIQUE : la jointure, la legende, le tableau et l'etat de rendu (feature-state, `promoteId: code`)
// en dependent. Le jeu de pays embarque (Natural Earth 110 m) en comptait trois sous le meme code « -99 » (Natural Earth le met pour les entites
// sans code ISO officiel : Kosovo, Somaliland, Chypre du Nord) : la legende annoncait 175 unites pour 177 lignes de tableau, et leur etat de rendu se melangeait.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const DON = new URL('../lib/bi/donnees/', import.meta.url);
const OUTIL = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'generer-donnees-bi.mjs');

test('pays-leger.json : un code par pays, aucun code factice', () => {
  const fc = JSON.parse(fs.readFileSync(new URL('pays-leger.json', DON), 'utf8'));
  const codes = fc.features.map((f) => f.properties.code);
  const doublons = [...new Set(codes.filter((c, i) => codes.indexOf(c) !== i))];
  assert.deepEqual(doublons, [], 'codes en double : ' + doublons.join(', '));
  assert.deepEqual(codes.filter((c) => !/^[A-Z]{3}$/.test(c)), [], 'tout code est alpha-3 majuscule');
  const par = Object.fromEntries(fc.features.map((f) => [f.properties.nom_en, f.properties.code]));
  assert.equal(par.Kosovo, 'XKX'); assert.equal(par.Somaliland, 'SOL'); assert.equal(par['N. Cyprus'], 'CYN');
});

const carre = (x) => ({ type: 'Polygon', coordinates: [[[x, 0], [x + 2, 0], [x + 2, 2], [x, 2], [x, 0]]] });
const fc = (features) => JSON.stringify({ type: 'FeatureCollection', features });
function generer(pays) {
  const racine = mkdtempSync(join(tmpdir(), 'atlas-gen-pays-'));
  mkdirSync(join(racine, 'communes'), { recursive: true });
  writeFileSync(join(racine, 'region.json'), fc([{ type: 'Feature', properties: { code_insee: '11', nom_officiel: 'A' }, geometry: carre(0) }]));
  writeFileSync(join(racine, 'departement.json'), fc([{ type: 'Feature', properties: { code_insee: '75', nom_officiel: 'P', code_insee_de_la_region: '11' }, geometry: carre(0) }]));
  writeFileSync(join(racine, 'pays.geojson'), fc(pays.map(([iso, nom, x, adm]) => ({ type: 'Feature', properties: { ISO_A3_EH: iso, ADM0_A3: adm, NAME_FR: nom, NAME: nom, POP_EST: 1, CONTINENT: 'Europe' }, geometry: carre(x) }))));
  writeFileSync(join(racine, 'communes', 'pe_commune_0.json'), fc([{ type: 'Feature', properties: { code_insee: '75056', code_insee_du_departement: '75', code_insee_de_la_region: '11', code_siren_epci: '200054781', population: 1, superficie_cadastrale: 1, date_du_recensement: '2022-01-01Z' }, geometry: carre(0) }]));
  const sortie = join(racine, 'sortie');
  const r = spawnSync(process.execPath, [OUTIL, join(racine, 'region.json'), join(racine, 'departement.json'), join(racine, 'pays.geojson'), sortie, join(racine, 'communes')], { encoding: 'utf8' });
  const codes = r.status === 0 ? JSON.parse(readFileSync(join(sortie, 'donnees/pays-leger.json'), 'utf8')).features.map((f) => f.properties.code) : null;
  rmSync(racine, { recursive: true, force: true });
  return { statut: r.status, erreur: r.stderr, codes };
}
test('generer-donnees-bi : les entites sans code ISO (« -99 ») recoivent un code propre et distinct', () => {
  const r = generer([['FRA', 'France', 0, 'FRA'], ['-99', 'Kosovo', 3, 'KOS'], ['-99', 'Somaliland', 6, 'SOL'], ['-99', 'N. Cyprus', 9, 'CYN']]);
  assert.equal(r.statut, 0, r.erreur);
  assert.deepEqual(r.codes.slice().sort(), ['CYN', 'FRA', 'SOL', 'XKX']);
});
test('generer-donnees-bi : une entite sans code et inconnue du generateur le fait echouer, plutot que d\'emettre un doublon', () => {
  const r = generer([['FRA', 'France', 0, 'FRA'], ['-99', 'Terra Nova', 3, '-99']]);
  assert.notEqual(r.statut, 0);
  assert.match(r.erreur, /code de pays|-99|Terra Nova/);
});

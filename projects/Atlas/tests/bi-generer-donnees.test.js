/**
 * Le generateur des jeux embarques (`tools/generer-donnees-bi.mjs`) est deterministe : le WFS ne garantit pas l'ordre
 * des entites entre deux appels, une regeneration ne doit changer que ce qui change dans les donnees. Il dit aussi quelle
 * date de recensement porte la population, au lieu de l'affirmer.
 * node --test tests/bi-generer-donnees.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const OUTIL = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'generer-donnees-bi.mjs');

const carre = (x, y) => ({ type: 'Polygon', coordinates: [[[x, y], [x + 2, y], [x + 2, y + 2], [x, y + 2], [x, y]]] });
const regions = [['11', 'A', 0], ['24', 'B', 3], ['93', 'C', 6]];
const departements = [['75', 'P', '11', 0], ['13', 'Q', '93', 6], ['18', 'R', '24', 3], ['2A', 'S', '94', 9]];
const pays = [['FRA', 'France', 0], ['BEL', 'Belgique', 4], ['ESP', 'Espagne', 8]];

const fc = (features) => JSON.stringify({ type: 'FeatureCollection', features });
function entrees(dossier, inverser) {
  const ordre = (l) => (inverser ? [...l].reverse() : l);
  mkdirSync(join(dossier, 'communes'), { recursive: true });
  writeFileSync(join(dossier, 'region.json'), fc(ordre(regions).map(([c, n, x]) => ({ type: 'Feature', properties: { code_insee: c, nom_officiel: n }, geometry: carre(x, 0) }))));
  writeFileSync(join(dossier, 'departement.json'), fc(ordre(departements).map(([c, n, r, x]) => ({ type: 'Feature', properties: { code_insee: c, nom_officiel: n, code_insee_de_la_region: r }, geometry: carre(x, 0) }))));
  writeFileSync(join(dossier, 'pays.geojson'), fc(ordre(pays).map(([c, n, x]) => ({ type: 'Feature', properties: { ISO_A3_EH: c, NAME_FR: n, NAME: n, POP_EST: 1, CONTINENT: 'Europe' }, geometry: carre(x, 20) }))));
  const communes = ordre([
    ['75056', '75', '11', '200054781', 2000000, 10500, '2022-01-01Z'], ['13055', '13', '93', '200054807', 870000, 24000, '2022-01-01Z'],
    ['18033', '18', '24', '241800507', 60000, 7000, '2021-01-01Z'], ['2A004', '2A', '94', '242000446', 60000, 9000, '2022-01-01Z'],
  ]);
  writeFileSync(join(dossier, 'communes', 'pe_commune_0.json'), fc(communes.map(([c, d, r, e, pop, ha, date]) => ({ type: 'Feature', properties: { code_insee: c, code_insee_du_departement: d, code_insee_de_la_region: r, codes_siren_des_epci: e, population: pop, superficie_cadastrale: ha, date_du_recensement: date }, geometry: null }))));
}

function generer(inverser) {
  const racine = mkdtempSync(join(tmpdir(), 'atlas-gen-bi-'));
  entrees(racine, inverser);
  const sortie = join(racine, 'sortie');
  const r = spawnSync(process.execPath, [OUTIL, join(racine, 'region.json'), join(racine, 'departement.json'), join(racine, 'pays.geojson'), sortie, join(racine, 'communes')], { encoding: 'utf8' });
  const lire = (f) => readFileSync(join(sortie, f), 'utf8');
  const sorties = r.status === 0 ? Object.fromEntries(['donnees/regions-leger.json', 'donnees/departements-leger.json', 'donnees/pays-leger.json', 'donnees/references-population.json', 'admin-referentiel.js'].map((f) => [f, lire(f)])) : null;
  rmSync(racine, { recursive: true, force: true });
  return { statut: r.status, erreur: r.stderr, sorties };
}

test('generer-donnees-bi : le meme contenu, livre dans un autre ordre, donne des fichiers identiques', () => {
  const a = generer(false), b = generer(true);
  assert.equal(a.statut, 0, a.erreur); assert.equal(b.statut, 0, b.erreur);
  for (const f of Object.keys(a.sorties)) assert.equal(a.sorties[f], b.sorties[f], f + ' depend de l\'ordre du service');
});

test('generer-donnees-bi : la date de recensement vient des donnees, et l\'en-tete du referentiel nomme le bon outil', () => {
  const { sorties } = generer(false);
  const ref = JSON.parse(sorties['donnees/references-population.json']);
  assert.deepEqual(ref.meta.recensements, { '2021-01-01Z': 1, '2022-01-01Z': 3 });
  assert.match(ref.meta.source, /recensement 2022-01-01 \(date majoritaire/);
  assert.doesNotMatch(ref.meta.source, /2023-01-01/);
  assert.match(sorties['admin-referentiel.js'], /GENERE par tools\/generer-donnees-bi\.mjs/);
});

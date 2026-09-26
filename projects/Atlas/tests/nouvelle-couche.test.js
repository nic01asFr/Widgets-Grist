import test from 'node:test';
import assert from 'node:assert/strict';
import {
  idTableDepuisNom, planNouvelleCouche, colonnesNouvelleCouche, colonneGeometrieNouvelleCouche,
  actionsNouvelleCouche, lireCreation, natureRefus, messageRefus,
} from '../lib/nouvelle-couche.js';
import { ligneInventaire, lignePrefs, ATLAS_PREFS_SCHEMA } from '../lib/grist-sync.js';
import { tableToGeoJSON } from '../lib/geo-tables.js';

test('le nom de table suit le nom saisi, accents translittérés, capitale en tête', () => {
  assert.equal(idTableDepuisNom('Arbres remarquables'), 'Arbres_remarquables');
  assert.equal(idTableDepuisNom('éclairage public'), 'Eclairage_public');
  assert.equal(idTableDepuisNom('  cœur d’îlot  '), 'Coeur_d_ilot');
  assert.equal(idTableDepuisNom('2026 relevés'), 'Couche_2026_releves');
  assert.equal(idTableDepuisNom('!!!'), '');
  assert.ok(idTableDepuisNom('x'.repeat(200)).length <= 60);
});

test('pas de préfixe Atlas_, et jamais une table d’Atlas', () => {
  assert.equal(planNouvelleCouche({ nom: 'Story', type: 'Point' }).tableId, 'Story');
  assert.equal(planNouvelleCouche({ nom: 'Maquette Layers', type: 'Point' }).tableId, 'Couche_Maquette_Layers');
  assert.equal(planNouvelleCouche({ nom: 'Atlas LayerPrefs', type: 'Point' }).tableId, 'Couche_Atlas_LayerPrefs');
  assert.equal(planNouvelleCouche({ nom: 'SceneManifest', type: 'Point' }).tableId, 'Couche_SceneManifest');
});

test('une collision propose un suffixe avant d’écrire, casse ignorée', () => {
  const p = planNouvelleCouche({ nom: 'arbres', type: 'Point', tables: ['Arbres', 'Arbres_2'] });
  assert.deepEqual(p, { ok: true, tableId: 'Arbres_3', renomme: true });
  assert.equal(planNouvelleCouche({ nom: 'Arbres', type: 'Point', tables: ['Voirie'] }).renomme, false);
});

test('nom vide, type inconnu : refus nommé', () => {
  assert.equal(planNouvelleCouche({ nom: '  ', type: 'Point' }).ok, false);
  assert.equal(planNouvelleCouche({ nom: '???', type: 'Point' }).ok, false);
  assert.match(planNouvelleCouche({ nom: 'A', type: 'MultiPolygon' }).erreur, /point, ligne ou surface/);
});

test('colonnes de départ : nom et géométrie, plates et typées', () => {
  assert.deepEqual(colonnesNouvelleCouche('Point').map((c) => [c.id, c.type]),
    [['nom', 'Text'], ['latitude', 'Numeric'], ['longitude', 'Numeric']]);
  assert.deepEqual(colonnesNouvelleCouche('Polygon').map((c) => [c.id, c.type]),
    [['nom', 'Text'], ['geometry_json', 'Text']]);
  for (const t of ['Point', 'LineString', 'Polygon']) {
    for (const c of colonnesNouvelleCouche(t)) {
      assert.equal(c.fields, undefined);
      assert.ok(c.label);
    }
  }
  assert.deepEqual(colonneGeometrieNouvelleCouche('Point'), { lat: 'latitude', lng: 'longitude' });
  assert.equal(colonneGeometrieNouvelleCouche('LineString'), 'geometry_json');
});

const couche = (type, tableId) => ({
  name: 'Arbres', color: '#2E7D32', visible: true, geometryType: type, kind: 'table',
  sourceTable: tableId, geometryColumn: colonneGeometrieNouvelleCouche(type), source: 'grist-table',
  style: { mode: 'mapbox' }, controls: [],
});
const schemas = { maquette: [{ id: 'Name', type: 'Text', label: 'Nom' }], prefs: ATLAS_PREFS_SCHEMA };

test('une seule transaction : tables d’Atlas si absentes, table, inventaire, apparence', () => {
  const l = couche('Point', 'Arbres');
  const { actions, indices } = actionsNouvelleCouche({
    tableId: 'Arbres', type: 'Point', tables: [], inventaire: ligneInventaire(l), prefs: lignePrefs(l, 0), schemas,
  });
  assert.deepEqual(actions.map((a) => [a[0], a[1]]), [
    ['AddTable', 'Maquette_Layers'], ['AddTable', 'Atlas_LayerPrefs'], ['AddTable', 'Arbres'],
    ['AddRecord', 'Maquette_Layers'], ['AddRecord', 'Atlas_LayerPrefs'],
  ]);
  assert.deepEqual(indices, { table: 2, inventaire: 3, prefs: 4 });
  // L'inventaire porte le type et la liaison : c'est lui qui fait remonter une table vide.
  const inv = actions[3][3];
  assert.equal(inv.GeomType, 'Point');
  assert.deepEqual(JSON.parse(inv.StyleJSON)._binding,
    { kind: 'table', sourceTable: 'Arbres', geometryColumn: { lat: 'latitude', lng: 'longitude' } });
  assert.equal(inv.GeoJSON, '{}');
  assert.equal(actions[4][3].source_table, 'Arbres');

  const suite = actionsNouvelleCouche({
    tableId: 'Voirie', type: 'LineString', tables: ['Maquette_Layers', 'Atlas_LayerPrefs'],
    inventaire: {}, prefs: {}, schemas,
  });
  assert.equal(suite.actions.length, 3);
  assert.deepEqual(suite.indices, { table: 0, inventaire: 1, prefs: 2 });
});

test('la réponse de Grist donne le nom réel, l’inventaire et l’apparence', () => {
  // Forme mesurée en Grist réel (POST /apply, 26/09/2026).
  const ret = [null, null, { id: 5, table_id: 'Arbres_2', columns: ['nom'], views: [{ id: 6, sections: [14] }] }, 7, 3];
  assert.deepEqual(lireCreation(ret, { table: 2, inventaire: 3, prefs: 4 }, 'Arbres'),
    { tableId: 'Arbres_2', gristId: 7, prefRowId: 3, renommee: true });
  assert.deepEqual(lireCreation(undefined, { table: 0, inventaire: 1, prefs: 2 }, 'Arbres'),
    { tableId: 'Arbres', gristId: null, prefRowId: null, renommee: false });
});

test('une couche créée se relit vide, sans erreur, avec sa colonne de géométrie', () => {
  const vide = { id: [], manualSort: [], nom: [], latitude: [], longitude: [] };
  assert.deepEqual(tableToGeoJSON(vide, colonneGeometrieNouvelleCouche('Point')).features, []);
  const surf = { id: [], nom: [], geometry_json: [] };
  assert.deepEqual(tableToGeoJSON(surf, colonneGeometrieNouvelleCouche('Polygon')).features, []);
});

test('les refus se disent selon leur nature, libellés réels de Grist', () => {
  assert.equal(natureRefus(new Error('Blocked by table create access rules')), 'droits');
  assert.equal(natureRefus('[Sandbox] KeyError \'colonne_absente\''), 'schema');
  assert.equal(natureRefus('Blocked by schema access rules'), 'structure');
  assert.equal(natureRefus('Réseau coupé'), 'autre');
  assert.match(messageRefus('Blocked by schema access rules'), /pas y créer de table/);
  assert.match(messageRefus('Réseau coupé'), /Réseau coupé/);
});

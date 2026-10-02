import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TABLES_ATLAS, estTableAtlas, nomDeTableLibre,
} from '../lib/atlas-tables.js';
import { GEO_SKIP_TABLES } from '../lib/geo-tables.js';

test('une table d’Atlas se reconnaît, casse ignorée, comme Grist', () => {
  assert.ok(estTableAtlas('Atlas_Story'));
  assert.ok(estTableAtlas('atlas_layerprefs'));
  assert.ok(estTableAtlas('Maquette_Layers'));
  assert.ok(estTableAtlas('Atlas_Propositions'), 'un nom gardé d’avance compte déjà');
  assert.ok(!estTableAtlas('Atlas_Pont_du_moulin'), 'la table de données d’une couche n’est pas une table d’Atlas');
  assert.ok(!estTableAtlas('Visites'));
  assert.ok(!estTableAtlas(''));
});

test('aucune table d’Atlas n’est proposée comme couche', () => {
  for (const t of TABLES_ATLAS) assert.ok(GEO_SKIP_TABLES.has(t), t);
});

test('une couche importée ne prend jamais le nom d’une table d’Atlas', () => {
  assert.equal(nomDeTableLibre('Atlas_Pont_du_moulin', ['Visites']), 'Atlas_Pont_du_moulin');
  assert.equal(nomDeTableLibre('Atlas_Propositions', []), 'Atlas_Propositions_donnees');
  assert.equal(nomDeTableLibre('atlas_story', []), 'atlas_story_donnees');
  assert.equal(nomDeTableLibre('Atlas_Scenes', ['Atlas_Scenes_donnees']), 'Atlas_Scenes_donnees_2');
  assert.equal(nomDeTableLibre('Atlas_Digues', ['atlas_digues']), 'Atlas_Digues_2', 'une table existante, casse ignorée');
});

test('le scan écarte une table d’Atlas quelle que soit sa casse', async () => {
  const { geoTablesDepuisSchema } = await import('../lib/geo-tables.js');
  const col = (colId, type = 'Text') => ({ colId, type, label: colId, isFormula: false, widgetOptions: '' });
  const schema = {
    Atlas_story: [col('geometry_json')],
    Atlas_Layerprefs: [col('geometry')],
    Digues: [col('geometry_json')],
  };
  const noms = geoTablesDepuisSchema(schema).map((t) => t.table || t.name || t.tableId);
  assert.deepEqual(noms, ['Digues']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { typeColonneDepuisValeurs } from '../lib/schema-grist.js';
import { ATLAS_PREFS_SCHEMA } from '../lib/grist-sync.js';
import { SCENE_PREFS_SCHEMA } from '../lib/scene-prefs.js';
import { STORY_SCHEMA } from '../lib/story.js';

// Mesuré en Grist réel le 26/09/2026 : `AddTable` ignore la forme
// `{ id, fields: { type, label } }` — colonnes en Text, libellé = identifiant,
// nombres rangés en texte. Seule la forme plate `{ id, type, label }` s'applique.
test('les tables d’Atlas se créent avec des colonnes plates, typées et libellées', () => {
  for (const [nom, schema] of Object.entries({ ATLAS_PREFS_SCHEMA, SCENE_PREFS_SCHEMA, STORY_SCHEMA })) {
    for (const c of schema) {
      assert.equal(c.fields, undefined, `${nom}.${c.id} : forme { fields } ignorée par Grist`);
      assert.ok(c.type, `${nom}.${c.id} sans type`);
      assert.ok(c.label, `${nom}.${c.id} sans libellé`);
    }
  }
  assert.equal(ATLAS_PREFS_SCHEMA.find((c) => c.id === 'Visible').type, 'Bool');
  assert.equal(STORY_SCHEMA.find((c) => c.id === 'Step').type, 'Int');
});

test('une chaîne qui ressemble à un nombre reste du texte : le zéro de tête est gardé', () => {
  assert.equal(typeColonneDepuisValeurs(['01004', '13055']), 'Text');
  assert.equal(typeColonneDepuisValeurs(['12.5']), 'Text');
  assert.equal(typeColonneDepuisValeurs([1, 2, null, '']), 'Int');
  assert.equal(typeColonneDepuisValeurs([1, 2.5]), 'Numeric');
  assert.equal(typeColonneDepuisValeurs([true, false, null]), 'Bool');
  assert.equal(typeColonneDepuisValeurs([true, 1]), 'Text');
  assert.equal(typeColonneDepuisValeurs([1, 'a']), 'Text');
  assert.equal(typeColonneDepuisValeurs([NaN]), 'Text');
  assert.equal(typeColonneDepuisValeurs([null, '']), 'Text');
  assert.equal(typeColonneDepuisValeurs([]), 'Text');
});

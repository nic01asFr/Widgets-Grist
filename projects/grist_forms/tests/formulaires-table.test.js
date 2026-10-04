const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../shared/formulaires-table.js');
const fixture = require('./fixtures/formdef-minimal.json');

it('serializes Def JSON', () => {
  const fields = F.rowFromFormDef(fixture, { version: 1, statut: 'brouillon' });
  assert.equal(fields.FormId, 'demo-contact');
  assert.equal(fields.TableCible, 'Contacts');
  assert.equal(JSON.parse(fields.Def).id, 'demo-contact');
  assert.equal(fields.Version, 1);
});

it('plans AddTable for Formulaires', () => {
  const actions = F.planCreateFormulairesTable();
  assert.equal(actions.length, 1);
  assert.equal(actions[0][0], 'AddTable');
  assert.equal(actions[0][1], 'Formulaires');
  const cols = actions[0][2];
  assert.ok(Array.isArray(cols));
  const ids = cols.map((c) => c.id);
  assert.deepEqual(ids, [
    'Nom', 'FormId', 'Titre', 'TableCible', 'Version', 'Def',
    'Statut', 'PublishedSectionRef', 'UpdatedAt'
  ]);
});

it('strips builder-only marks from the stored Def', () => {
  const def = {
    manifest_version: '1.0.0', id: 'f', title: 'F', tableId: 'T', composeMode: 'bind', choices: {},
    _brouillon: true,
    sections: [{ id: 's1', label: 'E1', _ouvert: true, fields: [{ colId: 'Nom', label: 'Nom', type: 'Text', widget: 'text', _colIdLocked: true }] }]
  };
  const row = F.rowFromFormDef(def, {});
  const stored = JSON.parse(row.Def);
  assert.equal(stored._brouillon, undefined);
  assert.equal(stored.sections[0]._ouvert, undefined);
  assert.equal(stored.sections[0].fields[0]._colIdLocked, undefined);
  assert.equal(stored.sections[0].fields[0].colId, 'Nom');
  // La définition d'origine n'est pas touchée : l'écran continue de s'en servir.
  assert.equal(def.sections[0].fields[0]._colIdLocked, true);
});

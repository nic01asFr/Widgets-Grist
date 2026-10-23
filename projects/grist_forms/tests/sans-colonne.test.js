'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const Engine = require('../runtime/engine.js');

test('une question sans colonne n\'empeche pas d\'ecrire les autres', () => {
  const def = { sections: [{ title: 'S', fields: [
    { colId: 'Nom', label: 'Nom', type: 'Text', widget: 'text' },
    { colId: '', label: 'Prenom', type: 'Text', widget: 'text' },
  ] }] };
  const out = Engine.collectSubmitData(def, { Nom: 'DUPONT', '': 'Jean' }, {}, { creation: true });
  assert.strictEqual(out.Nom, 'DUPONT');
  assert.ok(!('' in out));
});

test('une colonne creee automatiquement est une colonne de donnees, pas une colonne vide', () => {
  const { planEnsureSchema } = require('../shared/ensure-schema.js');
  const def = { tableId: 'T', composeMode: 'ensureSchema', choices: {}, sections: [{ fields: [
    { colId: 'Prenom', label: 'Prenom', type: 'Text', widget: 'text' },
  ] }] };
  const plan = planEnsureSchema(def, [{ id: 'Nom', type: 'Text' }], { tableExists: true });
  assert.ok(plan.ok);
  const ajout = plan.actions.find(a => a[0] === 'AddColumn');
  assert.ok(ajout, JSON.stringify(plan.actions));
  assert.strictEqual(ajout[3].isFormula, false);
});

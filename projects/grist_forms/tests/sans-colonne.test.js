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

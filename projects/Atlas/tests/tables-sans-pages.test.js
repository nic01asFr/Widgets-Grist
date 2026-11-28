import test from 'node:test';
import assert from 'node:assert/strict';
import { pagesDeTablesCreees, actionRetirerPages } from '../lib/tables-sans-pages.js';

const retourTable = (id, vues) => ({ id, table_id: 'T', columns: [], views: vues });

test('les pages créées avec une table sont retrouvées dans la réponse de Grist', () => {
  const actions = [['AddTable', 'Maquette_Layers', []], ['AddTable', 'Atlas_LayerPrefs', []]];
  const resultat = { retValues: [retourTable(4, [{ id: 3, sections: [10] }]), retourTable(5, [{ id: 4, sections: [12] }])] };
  assert.deepEqual(pagesDeTablesCreees(actions, resultat), [3, 4]);
});

test('seules les actions AddTable comptent, la réponse est lue à leur rang', () => {
  const actions = [['AddRecord', 'T', null, {}], ['AddTable', 'Nouvelle', []], ['UpdateRecord', 'T', 1, {}]];
  const resultat = { retValues: [{ views: [{ id: 99 }] }, retourTable(6, [{ id: 7 }]), null] };
  assert.deepEqual(pagesDeTablesCreees(actions, resultat), [7]);
});

test('une réponse sans pages, absente ou d’un autre client ne donne rien à retirer', () => {
  const actions = [['AddTable', 'T', []]];
  assert.deepEqual(pagesDeTablesCreees(actions, null), []);
  assert.deepEqual(pagesDeTablesCreees(actions, undefined), []);
  assert.deepEqual(pagesDeTablesCreees(actions, { retValues: [] }), []);
  assert.deepEqual(pagesDeTablesCreees(actions, { retValues: [retourTable(1, [])] }), []);
  assert.deepEqual(pagesDeTablesCreees(actions, { retValues: [{ table_id: 'T' }] }), [], 'scène locale : views vide ou absent');
  assert.deepEqual(pagesDeTablesCreees(null, { retValues: [] }), []);
});

test('un identifiant illisible ou répété est écarté', () => {
  const actions = [['AddTable', 'T', []]];
  const resultat = { retValues: [retourTable(1, [{ id: 3 }, { id: 3 }, { id: 'x' }, { id: 0 }, null, { id: 5 }])] };
  assert.deepEqual(pagesDeTablesCreees(actions, resultat), [3, 5]);
});

test('retirer les pages vise les vues et jamais les tables', () => {
  assert.deepEqual(actionRetirerPages([3, 4]), ['BulkRemoveRecord', '_grist_Views', [3, 4]]);
  assert.equal(actionRetirerPages([]), null);
  assert.equal(actionRetirerPages(null), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { lireFormulairesDuDocument, formulairesVides } from '../lib/formulaires-document.js';

/** Un `docApi` en colonnes, comme celui de Grist. */
function faussDocApi({ tables = {}, listeTables = Object.keys(tables), echec = {} } = {}) {
  const appels = [];
  return {
    appels,
    async listTables() {
      appels.push('listTables');
      if (echec.listTables) throw new Error('coupure');
      return listeTables;
    },
    async fetchTable(nom) {
      appels.push('fetchTable:' + nom);
      if (echec[nom]) throw new Error('refus ' + nom);
      if (!(nom in tables)) throw new Error('KeyError ' + nom);
      return tables[nom];
    },
  };
}

const META = {
  _grist_Tables: { id: [1], tableId: ['Batiments'] },
  _grist_Tables_column: { id: [10], parentId: [1], colId: ['nom'], type: ['Text'], label: ['Nom'] },
  _grist_Views: { id: [], name: [] },
  _grist_Views_section: { id: [5], parentKey: ['form'], tableRef: [1] },
  _grist_Views_section_field: { id: [], parentId: [] },
};
const FORMULAIRE = { id: [7], Def: [JSON.stringify({ id: 'fiche', tableId: 'Batiments', sections: [] })], Statut: ['publie'] };

test('hors document : rien n est lu, rien n est demande au moteur', async () => {
  let moteur = 0;
  const lu = await lireFormulairesDuDocument({ docApi: null, assurerMoteur: async () => { moteur++; return true; } });
  assert.deepEqual(lu, formulairesVides());
  assert.equal(moteur, 0);
});

test('un document avec une table Formulaires : elle est lue, le moteur est demande', async () => {
  const docApi = faussDocApi({ tables: { ...META, Formulaires: FORMULAIRE } });
  let moteur = 0;
  const lu = await lireFormulairesDuDocument({
    docApi,
    assurerMoteur: async () => { moteur++; return true; },
    portee: { FormDefFromGristForm: { formulairesGrist: (meta) => [{ formId: 'natif', sections: meta.sections.id }] } },
  });
  assert.equal(moteur, 1);
  assert.equal(lu.formulairesTable, true);
  assert.equal(lu.formulaires.length, 1);
  assert.deepEqual(lu.formulairesGrist, [{ formId: 'natif', sections: [5] }]);
  assert.deepEqual(Object.keys(lu.schema), ['Batiments']);
});

test('sans table Formulaires : formulairesTable reste faux, pas d erreur', async () => {
  const docApi = faussDocApi({ tables: META });
  const lu = await lireFormulairesDuDocument({ docApi, assurerMoteur: async () => true, portee: {} });
  assert.equal(lu.formulairesTable, false);
  assert.deepEqual(lu.formulaires, []);
  assert.ok(!docApi.appels.includes('fetchTable:Formulaires'));
});

test('moteur indisponible : le schema et la table Formulaires sont lus, pas les formulaires natifs', async () => {
  const docApi = faussDocApi({ tables: { ...META, Formulaires: FORMULAIRE } });
  const lu = await lireFormulairesDuDocument({
    docApi,
    assurerMoteur: async () => false,
    portee: { FormDefFromGristForm: { formulairesGrist: () => { throw new Error('ne doit pas etre appele'); } } },
  });
  assert.deepEqual(lu.formulairesGrist, []);
  assert.equal(lu.formulaires.length, 1);
  assert.deepEqual(Object.keys(lu.schema), ['Batiments']);
});

test('moteur charge mais derivation en echec : avertissement, le reste est lu', async () => {
  const docApi = faussDocApi({ tables: { ...META, Formulaires: FORMULAIRE } });
  const avertis = [];
  const lu = await lireFormulairesDuDocument({
    docApi,
    assurerMoteur: async () => true,
    portee: { FormDefFromGristForm: { formulairesGrist: () => { throw new Error('def illisible'); } } },
    avertir: (...a) => avertis.push(a.join(' ')),
  });
  assert.deepEqual(lu.formulairesGrist, []);
  assert.equal(lu.formulaires.length, 1);
  assert.match(avertis[0], /formulaires Grist def illisible/);
});

test('lecture de Formulaires en echec : avertissement, formulairesTable deja vrai, schema garde', async () => {
  const docApi = faussDocApi({ tables: { ...META, Formulaires: FORMULAIRE }, echec: { Formulaires: true } });
  const avertis = [];
  const lu = await lireFormulairesDuDocument({ docApi, assurerMoteur: async () => true, portee: {}, avertir: (...a) => avertis.push(a.join(' ')) });
  assert.equal(lu.formulairesTable, true);
  assert.deepEqual(lu.formulaires, []);
  assert.match(avertis[0], /chargement refus Formulaires/);
  assert.deepEqual(Object.keys(lu.schema), ['Batiments']);
});

test('document sans metadonnees lisibles : pas de schema, pas de moteur demande, mais Formulaires est tentee', async () => {
  const docApi = faussDocApi({ tables: { Formulaires: FORMULAIRE }, listeTables: ['Formulaires'] });
  let moteur = 0;
  const lu = await lireFormulairesDuDocument({ docApi, assurerMoteur: async () => { moteur++; return true; }, portee: {} });
  assert.deepEqual(lu.schema, {});
  assert.equal(moteur, 0);
  assert.equal(lu.formulaires.length, 1);
});

test('listTables en echec : on rend ce qui a ete lu avant', async () => {
  const docApi = faussDocApi({ tables: META, echec: { listTables: true } });
  const avertis = [];
  const lu = await lireFormulairesDuDocument({ docApi, assurerMoteur: async () => true, portee: {}, avertir: (...a) => avertis.push(a.join(' ')) });
  assert.equal(lu.formulairesTable, false);
  assert.match(avertis[0], /chargement coupure/);
});

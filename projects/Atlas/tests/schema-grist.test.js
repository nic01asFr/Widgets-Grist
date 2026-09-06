import test from 'node:test';
import assert from 'node:assert/strict';
import {
  schemaDepuisMeta,
  chargerSchema,
  colonnesDe,
  tablesReferencant,
  estTableSysteme,
} from '../lib/schema-grist.js';

/** Les deux tables de métadonnées, sous la forme colonnaire de `fetchTable`. */
function meta(tablesEtColonnes) {
  const tables = Object.keys(tablesEtColonnes);
  const t = { id: tables.map((_, i) => i + 1), tableId: tables };
  const c = { id: [], parentId: [], colId: [], type: [], label: [], isFormula: [], widgetOptions: [] };
  tables.forEach((nom, i) => {
    for (const col of tablesEtColonnes[nom]) {
      c.id.push(c.id.length + 1);
      c.parentId.push(i + 1);
      c.colId.push(col.colId);
      c.type.push(col.type ?? 'Text');
      c.label.push(col.label ?? '');
      c.isFormula.push(col.isFormula ?? false);
      c.widgetOptions.push(col.widgetOptions ?? '');
    }
  });
  return [t, c];
}

const DOC = {
  Batiments_locaux: [{ colId: 'geometry_json' }, { colId: 'nom' }, { colId: 'hauteur', type: 'Numeric' }],
  Visites: [
    { colId: 'batiment', type: 'Ref:Batiments_locaux' },
    { colId: 'etat', type: 'Choice' },
    { colId: 'agent', type: 'Ref:Agents' },
  ],
  Desordres: [{ colId: 'bati', type: 'Ref:Batiments_locaux' }, { colId: 'gravite', type: 'Int' }],
  Agents: [{ colId: 'nom' }],
  _grist_Views: [{ colId: 'name' }],
};

/* ---------- la lecture ---------- */

test('le schema garde les types, que le scan geo jetait', () => {
  const schema = schemaDepuisMeta(...meta(DOC));
  const cols = colonnesDe(schema, 'Visites');
  assert.deepEqual(cols.map((c) => c.colId), ['batiment', 'etat', 'agent']);
  assert.equal(cols[0].type, 'Ref:Batiments_locaux');
  assert.equal(cols[1].type, 'Choice');
});

test('une colonne sans type vaut Text — jamais une erreur', () => {
  // Un document ancien, ou un faux docApi de test, peut ne rien porter.
  const [t, c] = meta({ T: [{ colId: 'a' }] });
  delete c.type;
  const schema = schemaDepuisMeta(t, c);
  assert.equal(colonnesDe(schema, 'T')[0].type, 'Text');
});

test('des metadonnees vides ou absentes rendent un schema vide', () => {
  assert.deepEqual(schemaDepuisMeta(null, null), {});
  assert.deepEqual(schemaDepuisMeta({}, {}), {});
  assert.deepEqual(colonnesDe(null, 'T'), []);
  assert.deepEqual(colonnesDe({}, 'Inconnue'), []);
});

test('une colonne orpheline — table inconnue — est ignoree', () => {
  const [t, c] = meta({ T: [{ colId: 'a' }] });
  c.parentId[0] = 99;
  assert.deepEqual(schemaDepuisMeta(t, c), {});
});

test('chargerSchema ne touche QUE les metadonnees', async () => {
  // Une regression ici couterait la totalite du document a chaque ouverture.
  const demandes = [];
  const [t, c] = meta(DOC);
  const docApi = {
    fetchTable: (nom) => {
      demandes.push(nom);
      return Promise.resolve(nom === '_grist_Tables' ? t : c);
    },
  };
  const schema = await chargerSchema(docApi);
  assert.deepEqual(demandes.sort(), ['_grist_Tables', '_grist_Tables_column']);
  assert.ok(schema.Visites);
});

test('un document qui refuse ses metadonnees n’est pas une erreur d’Atlas', () => {
  return chargerSchema({ fetchTable: () => Promise.reject(new Error('Blocked by table read access rules')) })
    .then((s) => assert.deepEqual(s, {}));
});

/* ---------- les tables qui referencent ---------- */

test('trouve les tables liees, et par quelle colonne', () => {
  const schema = schemaDepuisMeta(...meta(DOC));
  assert.deepEqual(tablesReferencant(schema, 'Batiments_locaux'), [
    { table: 'Visites', via: 'batiment' },
    { table: 'Desordres', via: 'bati' },
  ]);
});

test('une table sans rien qui la reference n’en a pas', () => {
  const schema = schemaDepuisMeta(...meta(DOC));
  assert.deepEqual(tablesReferencant(schema, 'Desordres'), []);
  assert.deepEqual(tablesReferencant(schema, 'Inconnue'), []);
  assert.deepEqual(tablesReferencant(null, 'T'), []);
  assert.deepEqual(tablesReferencant({}, null), []);
});

test('RefList ne compte pas — ce n’est pas le meme geste', () => {
  // Une liste dirait qu'un releve porte sur plusieurs objets a la fois ; y
  // injecter l'objet clique demanderait de l'ajouter a une liste existante.
  const schema = schemaDepuisMeta(...meta({
    Batiments: [{ colId: 'nom' }],
    Tournees: [{ colId: 'batiments', type: 'RefList:Batiments' }],
  }));
  assert.deepEqual(tablesReferencant(schema, 'Batiments'), []);
});

test('une auto-reference decrit une hierarchie, pas un releve', () => {
  const schema = schemaDepuisMeta(...meta({
    Entites: [{ colId: 'parent', type: 'Ref:Entites' }],
  }));
  assert.deepEqual(tablesReferencant(schema, 'Entites'), []);
});

test('une reference calculee ne se remplit pas, donc ne compte pas', () => {
  const schema = schemaDepuisMeta(...meta({
    Batiments: [{ colId: 'nom' }],
    Vues: [{ colId: 'bati', type: 'Ref:Batiments', isFormula: true }],
  }));
  assert.deepEqual(tablesReferencant(schema, 'Batiments'), []);
});

test('les tables systeme ne referencent rien', () => {
  const schema = schemaDepuisMeta(...meta({
    Batiments: [{ colId: 'nom' }],
    _grist_Attachments: [{ colId: 'bati', type: 'Ref:Batiments' }],
    GristHidden_widget: [{ colId: 'bati', type: 'Ref:Batiments' }],
  }));
  assert.deepEqual(tablesReferencant(schema, 'Batiments'), []);
  assert.equal(estTableSysteme('_grist_Views'), true);
  assert.equal(estTableSysteme('GristHidden_x'), true);
  assert.equal(estTableSysteme('Visites'), false);
  assert.equal(estTableSysteme(''), true);
});

test('deux references vers la meme table : on retient la premiere', () => {
  // L'appelant l'affiche — « rattache par batiment_avant ». Choisir en silence
  // serait le mode de panne habituel de ce depot.
  const schema = schemaDepuisMeta(...meta({
    Batiments: [{ colId: 'nom' }],
    Comparaisons: [
      { colId: 'batiment_avant', type: 'Ref:Batiments' },
      { colId: 'batiment_apres', type: 'Ref:Batiments' },
    ],
  }));
  assert.deepEqual(tablesReferencant(schema, 'Batiments'), [
    { table: 'Comparaisons', via: 'batiment_avant' },
  ]);
});

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../shared/liens-table.js');

describe('tablesLiees — reconnaître avant de créer', () => {
  const schema = {
    Ouvrages: [{ colId: 'Nom', type: 'Text' }],
    Visites: [{ colId: 'Objet', type: 'Ref:Ouvrages' }, { colId: 'Date', type: 'Date' }],
    Photos: [{ colId: 'Ouvrage', type: 'Ref:Ouvrages' }],
    Autres: [{ colId: 'Lien', type: 'Ref:Communes' }],
    Calculee: [{ colId: 'Objet', type: 'Ref:Ouvrages', isFormula: true }],
    _grist_Tables: [{ colId: 'Objet', type: 'Ref:Ouvrages' }],
  };

  it('trouve les tables qui rattachent leurs lignes, avec leur colonne', () => {
    const liees = L.tablesLiees(schema, 'Ouvrages');
    assert.deepEqual(liees, [{ table: 'Visites', via: 'Objet' }, { table: 'Photos', via: 'Ouvrage' }]);
  });

  it('écarte une colonne à formule : elle calcule un lien, elle ne le porte pas', () => {
    const liees = L.tablesLiees(schema, 'Ouvrages');
    assert.equal(liees.some((x) => x.table === 'Calculee'), false);
  });

  it('écarte les tables de Grist', () => {
    assert.equal(L.tablesLiees(schema, 'Ouvrages').some((x) => x.table.startsWith('_grist')), false);
  });

  it('rend une liste vide plutôt qu une erreur quand on ne sait rien', () => {
    assert.deepEqual(L.tablesLiees(null, 'Ouvrages'), []);
    assert.deepEqual(L.tablesLiees(schema, ''), []);
  });
});

describe('planTableLiee — la table et son garde-fou dans le même lot', () => {
  const champs = [{ id: 'Etat', type: 'Choice', label: 'État', widgetOptions: '{"choices":["Bon","Mauvais"]}' }];

  it('pose la colonne de rattachement en premier, puis les champs', () => {
    const p = L.planTableLiee({ nom: 'Visites de nuit', tableParent: 'Ouvrages', libelleParent: 'Ouvrage', champs });
    assert.equal(p.ok, true);
    assert.equal(p.tableId, 'Visites_de_nuit');
    assert.equal(p.via, 'Objet');
    assert.deepEqual(p.colonnes[0], { id: 'Objet', type: 'Ref:Ouvrages', label: 'Ouvrage' });
    assert.equal(p.colonnes[1].id, 'Etat');
  });

  it('crée la colonne inverse avec la table : le lot est atomique', () => {
    const p = L.planTableLiee({ nom: 'Visites', tableParent: 'Ouvrages', champs });
    assert.deepEqual(p.actions.map((a) => a[0]), ['AddTable', 'AddReverseColumn']);
    assert.deepEqual(p.actions[1], ['AddReverseColumn', 'Visites', 'Objet']);
  });

  it('sait s en passer si on le demande', () => {
    const p = L.planTableLiee({ nom: 'Visites', tableParent: 'Ouvrages', champs, colonneInverse: false });
    assert.deepEqual(p.actions.map((a) => a[0]), ['AddTable']);
  });

  it('ne prend pas un nom de table déjà pris', () => {
    const p = L.planTableLiee({ nom: 'Visites', tableParent: 'Ouvrages', champs, tables: ['Visites', 'Visites_2'] });
    assert.equal(p.tableId, 'Visites_3');
  });

  it('refuse un champ qui prendrait le nom du rattachement', () => {
    const p = L.planTableLiee({ nom: 'Visites', tableParent: 'Ouvrages', champs: [{ id: 'Objet', type: 'Text' }] });
    assert.equal(p.ok, false);
    assert.match(p.erreur, /Objet/);
  });

  it('refuse sans nom, sans parent, sans champ, et sur un identifiant impossible', () => {
    assert.equal(L.planTableLiee({ tableParent: 'Ouvrages', champs }).ok, false);
    assert.equal(L.planTableLiee({ nom: 'V', champs }).ok, false);
    assert.equal(L.planTableLiee({ nom: 'V', tableParent: 'Ouvrages', champs: [] }).ok, false);
    assert.equal(L.planTableLiee({ nom: 'V', tableParent: '2Mauvais', champs }).ok, false);
    assert.equal(L.planTableLiee({ nom: 'V', tableParent: 'Ouvrages', champs: [{ id: '2x', type: 'Text' }] }).ok, false);
  });
});

describe('planLignesLiees — une seule écriture, jamais d orphelin', () => {
  const base = { tableId: 'Visites', via: 'Objet', parentId: 7 };

  it('groupe les lignes en une action et pose le rattachement', () => {
    const p = L.planLignesLiees({ ...base, lignes: [{ Etat: 'Bon' }, { Etat: 'Mauvais', Note: 'fissure' }] });
    assert.equal(p.ok, true);
    assert.equal(p.actions.length, 1);
    const [verbe, table, ids, colonnes] = p.actions[0];
    assert.equal(verbe, 'BulkAddRecord');
    assert.equal(table, 'Visites');
    assert.deepEqual(ids, [null, null]);
    assert.deepEqual(colonnes.Objet, [7, 7]);
    assert.deepEqual(colonnes.Etat, ['Bon', 'Mauvais']);
    // Une colonne absente d une ligne vaut vide, pas « rien » : sinon Grist
    // écrirait 0 dans une colonne numérique.
    assert.deepEqual(colonnes.Note, [null, 'fissure']);
  });

  it('refuse sans ligne parente : Grist accepterait 0, et personne ne les retrouverait', () => {
    const p = L.planLignesLiees({ ...base, parentId: 0, lignes: [{ Etat: 'Bon' }] });
    assert.equal(p.ok, false);
    assert.match(p.erreur, /rattacher/);
    assert.equal(L.planLignesLiees({ ...base, parentId: null, lignes: [{}] }).ok, false);
  });

  it('ignore un rattachement qu une ligne porterait elle-même', () => {
    const p = L.planLignesLiees({ ...base, lignes: [{ Objet: 999, Etat: 'Bon' }] });
    assert.deepEqual(p.actions[0][3].Objet, [7]);
  });

  it('n écrit rien quand il n y a rien à écrire', () => {
    assert.deepEqual(L.planLignesLiees({ ...base, lignes: [] }).actions, []);
  });
});

describe('messageRefus — dire ce que Grist a refusé', () => {
  // Formes relevées en posant de vraies règles d'accès (04/10/2026).
  it('distingue le refus d ajouter et le refus de corriger', () => {
    assert.match(L.messageRefus(new Error('Blocked by table create access rules')), /ajouter une ligne/);
    assert.match(L.messageRefus(new Error('Blocked by table update access rules')), /corriger cette ligne/);
    assert.match(L.messageRefus(new Error('Blocked by column read access rules')), /règle d’accès/);
  });

  it('nomme une colonne de rattachement qui n est pas une référence', () => {
    assert.match(L.messageRefus(new Error('[Sandbox] ValueError reverse column can only be added to a reference column')), /référence vers la table parente/);
  });

  it('nomme la ligne parente disparue', () => {
    const m = L.messageRefus(new Error("[Sandbox] AssertionError docactions.[Bulk]UpdateRecord for non-existent record #999"));
    assert.match(m, /n’existe plus/);
  });

  it('nomme un document qui n a pas ce qu on attendait', () => {
    assert.match(L.messageRefus(new Error("[Sandbox] KeyError 'ColonneAbsente'")), /Rechargez/);
  });

  it('garde le message brut quand il ne sait pas', () => {
    assert.match(L.messageRefus(new Error('boum')), /boum/);
  });
});

describe('nomDeTableLibre', () => {
  it('translittère, met une capitale, et évite les collisions sans tenir compte de la casse', () => {
    assert.equal(L.nomDeTableLibre('Relevés d’été', []), 'Releves_d_ete');
    assert.equal(L.nomDeTableLibre('visites', ['VISITES']), 'Visites_2');
  });

  it('ne commence pas par un chiffre et rend vide si rien n est utilisable', () => {
    assert.equal(L.nomDeTableLibre('2026 visites', []), 'T_2026_visites');
    assert.equal(L.nomDeTableLibre('«»', []), '');
  });
});

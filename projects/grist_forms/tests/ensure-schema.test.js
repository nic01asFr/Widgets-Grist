const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  planEnsureSchema,
  columnsFromFormDef,
  bindingIsComplete,
  fieldToGristType,
  planVisibleColUpdates
} = require('../shared/ensure-schema.js');

it('plans AddColumn for missing', () => {
  const def = {
    tableId: 'Contacts',
    sections: [{ fields: [{ colId: 'Nom', type: 'Text' }, { colId: 'Age', type: 'Int' }] }]
  };
  const plan = planEnsureSchema(def, [{ id: 'Nom', type: 'Text' }]);
  assert.equal(plan.ok, true);
  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0][0], 'AddColumn');
  assert.equal(plan.actions[0][1], 'Contacts');
  assert.equal(plan.actions[0][2], 'Age');
});

it('plans Attachments column', () => {
  const def = {
    tableId: 'Demandes',
    sections: [{ fields: [{ colId: 'Piece', type: 'Attachments', label: 'PJ' }] }]
  };
  const plan = planEnsureSchema(def, [], { tableExists: false });
  assert.equal(plan.ok, true);
  assert.equal(plan.actions[0][0], 'AddTable');
  const cols = plan.actions[0][2];
  assert.equal(cols[0].type, 'Attachments');
  assert.equal(fieldToGristType({ type: 'Attachments' }), 'Attachments');
});

it('errors on incompatible type', () => {
  const def = {
    tableId: 'Contacts',
    sections: [{ fields: [{ colId: 'Nom', type: 'Int' }] }]
  };
  const plan = planEnsureSchema(def, [{ id: 'Nom', type: 'Text' }]);
  assert.equal(plan.ok, false);
  assert.ok(plan.errors[0].includes('Nom'));
});

it('rejects invalid table / column identifiers', () => {
  const def = {
    tableId: 'Mes Réponses!',
    sections: [{ fields: [{ colId: 'Nom', type: 'Text' }] }]
  };
  const plan = planEnsureSchema(def, [], { tableExists: false });
  assert.equal(plan.ok, false);
  assert.ok(plan.errors.some(e => /identifiant invalide/i.test(e)));
});

it('bindingIsComplete rejects Ref without refTable', () => {
  const def = {
    tableId: 'Demandes',
    sections: [{ fields: [{ colId: 'Region', type: 'Ref' }] }]
  };
  const b = bindingIsComplete(def);
  assert.equal(b.ok, false);
  assert.ok(b.errors.some(e => e.includes('refTable')));
});
it('fieldToGristType reads options.refTable', () => {
  assert.equal(
    fieldToGristType({ type: 'Ref', options: { refTable: 'Regions' } }),
    'Ref:Regions'
  );
});

it('plans AddTable when table missing (form → données)', () => {
  const def = {
    tableId: 'NouvellesDemandes',
    choices: { Statut: ['ouvert', 'clos'] },
    sections: [{
      fields: [
        { colId: 'Titre', type: 'Text', label: 'Titre' },
        { colId: 'Statut', type: 'Choice' },
        { colId: 'Region', type: 'Ref', refTable: 'Regions' }
      ]
    }]
  };
  const plan = planEnsureSchema(def, [], { tableExists: false });
  assert.equal(plan.ok, true);
  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0][0], 'AddTable');
  assert.equal(plan.actions[0][1], 'NouvellesDemandes');
  const cols = plan.actions[0][2];
  assert.equal(cols.length, 3);
  assert.equal(cols[1].type, 'Choice');
  assert.ok(cols[1].widgetOptions.includes('ouvert'));
  assert.equal(cols[2].type, 'Ref:Regions');
});

it('round-trip: columnsFromFormDef puis ensureSchema = no-op', () => {
  const def = {
    tableId: 'Contacts',
    choices: { Role: ['admin', 'user'] },
    sections: [{
      fields: [
        { colId: 'Nom', type: 'Text' },
        { colId: 'Role', type: 'Choice' },
        { colId: 'Org', type: 'Ref', options: { refTable: 'Orgs' } }
      ]
    }]
  };
  assert.equal(bindingIsComplete(def).ok, true);
  const projected = columnsFromFormDef(def);
  const existing = projected.map(c => ({ id: c.id, type: c.type }));
  const plan = planEnsureSchema(def, existing, { tableExists: true });
  assert.equal(plan.ok, true);
  assert.equal(plan.actions.length, 0);
});

it('planVisibleColUpdates maps Nom → colRef id', () => {
  const def = {
    tableId: 'Demandes',
    sections: [{
      fields: [{
        colId: 'Region',
        type: 'Ref',
        options: { refTable: 'Regions', visibleCol: 'Nom' }
      }]
    }]
  };
  const tables = [
    { id: 1, tableId: 'Regions' },
    { id: 2, tableId: 'Demandes' }
  ];
  const columns = [
    { id: 10, parentId: 1, colId: 'Nom', visibleCol: 0 },
    { id: 20, parentId: 2, colId: 'Region', visibleCol: 0 }
  ];
  const plan = planVisibleColUpdates(def, tables, columns);
  assert.equal(plan.ok, true);
  assert.equal(plan.actions.length, 1);
  assert.deepEqual(plan.actions[0], [
    'UpdateRecord', '_grist_Tables_column', 20, { visibleCol: 10 }
  ]);
});

/*
 * Les saisies qui rangent leur réponse ailleurs que sous leur colId.
 *
 * Un classement n'écrit que dans la colonne de chacun de ses rangs ; une
 * réponse « Autre » écrit sa précision dans une colonne à part. La projection
 * créait pourtant UNE colonne par champ, celle du colId : le formulaire créé
 * automatiquement ne pouvait pas enregistrer ce que le moteur écrit.
 */
describe('colonnes annexes projetées', () => {
  const classement = {
    colId: 'Priorites', label: 'Vos priorités', type: 'Choice', widget: 'classement', kind: 'classement',
    options: { choices: ['Arbres', 'Bancs', 'Jeux'], colonnes: { rangs: ['Rang1', 'Rang2', 'Rang3'] } }
  };

  it('un classement crée la colonne de chaque rang, et pas celle de son colId', () => {
    const def = { tableId: 'T', sections: [{ fields: [classement] }] };
    const ids = columnsFromFormDef(def).map((c) => c.id);
    assert.deepEqual(ids, ['Rang1', 'Rang2', 'Rang3']);
  });

  it('chaque rang propose les mêmes choix que la question', () => {
    const def = { tableId: 'T', sections: [{ fields: [classement] }] };
    const rang = columnsFromFormDef(def)[1];
    assert.equal(rang.type, 'Choice');
    assert.deepEqual(JSON.parse(rang.widgetOptions).choices, ['Arbres', 'Bancs', 'Jeux']);
    assert.match(rang.label, /2e place/);
  });

  it('« Autre » ajoute sa colonne de précision, en texte', () => {
    const def = {
      tableId: 'T',
      sections: [{ fields: [{
        colId: 'Mode', label: 'Mode', type: 'Choice', widget: 'radio', kind: 'choix_autre',
        options: { choices: ['Vélo', 'Autre'], colonnes: { autre: 'Mode_Autre' } }
      }] }]
    };
    const cols = columnsFromFormDef(def);
    assert.deepEqual(cols.map((c) => c.id), ['Mode', 'Mode_Autre']);
    assert.equal(cols[1].type, 'Text');
  });

  it('une réponse rangée dans une autre colonne (`valeur`) crée celle-là', () => {
    const def = {
      tableId: 'T',
      sections: [{ fields: [{
        colId: 'Question', label: 'Q', type: 'Text', options: { colonnes: { valeur: 'Reponse' } }
      }] }]
    };
    assert.deepEqual(columnsFromFormDef(def).map((c) => c.id), ['Reponse']);
  });

  it('une même colonne nommée deux fois n’est créée qu’une fois', () => {
    const def = {
      tableId: 'T',
      sections: [{ fields: [
        { colId: 'A', type: 'Choice', kind: 'choix_autre', options: { choices: ['x', 'Autre'], colonnes: { autre: 'Precision' } } },
        { colId: 'B', type: 'Choice', kind: 'choix_autre', options: { choices: ['y', 'Autre'], colonnes: { autre: 'Precision' } } }
      ] }]
    };
    assert.deepEqual(columnsFromFormDef(def).map((c) => c.id), ['A', 'Precision', 'B']);
  });

  it('le plan n’ajoute que ce qui manque à une table existante', () => {
    const def = { tableId: 'T', sections: [{ fields: [classement] }] };
    const plan = planEnsureSchema(def, [{ id: 'Rang1', type: 'Choice' }]);
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.actions.map((a) => a[2]), ['Rang2', 'Rang3']);
  });

  it('un classement sans colonnes de rang n’est pas un binding complet', () => {
    const sans = JSON.parse(JSON.stringify(classement));
    delete sans.options.colonnes;
    const r = bindingIsComplete({ tableId: 'T', sections: [{ fields: [sans] }] });
    assert.equal(r.ok, false);
    assert.match(r.errors.join(' '), /rang/);
  });

  it('un nom de colonne de rang invalide est refusé', () => {
    const mauvais = JSON.parse(JSON.stringify(classement));
    mauvais.options.colonnes.rangs = ['Rang 1', 'Rang2', 'Rang3'];
    const r = bindingIsComplete({ tableId: 'T', sections: [{ fields: [mauvais] }] });
    assert.equal(r.ok, false);
    assert.match(r.errors.join(' '), /Rang 1/);
  });

  it('un nom de colonne de précision invalide est refusé', () => {
    const r = bindingIsComplete({
      tableId: 'T',
      sections: [{ fields: [{
        colId: 'M', type: 'Choice', kind: 'choix_autre',
        options: { choices: ['a', 'Autre'], colonnes: { autre: 'bad name' } }
      }] }]
    });
    assert.equal(r.ok, false);
    assert.match(r.errors.join(' '), /bad name/);
  });
});

describe('colonnes annexes d’un référentiel', () => {
  const adresse = {
    colId: 'Adresse', label: 'Adresse du désordre', type: 'Text', widget: 'text', kind: 'referentiel',
    options: {
      referentiel: { source: 'ban' },
      colonnes: { annexes: { codePostal: 'CP', insee: 'INSEE', latitude: 'Lat', longitude: 'Lon' } }
    }
  };

  it('crée la colonne du texte, puis chaque annexe désignée', () => {
    const def = { tableId: 'T', sections: [{ fields: [adresse] }] };
    assert.deepEqual(columnsFromFormDef(def).map((c) => c.id), ['Adresse', 'CP', 'INSEE', 'Lat', 'Lon']);
  });

  it('donne à chaque sens son type : un code est du texte, une coordonnée un nombre', () => {
    const def = { tableId: 'T', sections: [{ fields: [adresse] }] };
    const parId = {};
    columnsFromFormDef(def).forEach((c) => { parId[c.id] = c.type; });
    assert.equal(parId.Adresse, 'Text');
    assert.equal(parId.CP, 'Text');
    assert.equal(parId.INSEE, 'Text', 'un zéro de tête est une information');
    assert.equal(parId.Lat, 'Numeric');
    assert.equal(parId.Lon, 'Numeric');
  });

  it('nomme chaque annexe par son sens et par la question', () => {
    const def = { tableId: 'T', sections: [{ fields: [adresse] }] };
    const cp = columnsFromFormDef(def).find((c) => c.id === 'CP');
    assert.match(cp.label, /Code postal/);
    assert.match(cp.label, /Adresse du désordre/);
  });

  it('ne crée aucune annexe qu’on n’a pas désignée', () => {
    const f = JSON.parse(JSON.stringify(adresse));
    f.options.colonnes.annexes = { codePostal: 'CP' };
    assert.deepEqual(columnsFromFormDef({ tableId: 'T', sections: [{ fields: [f] }] }).map((c) => c.id),
      ['Adresse', 'CP']);
  });

  it('le plan n’ajoute que ce qui manque à une table existante', () => {
    const def = { tableId: 'T', sections: [{ fields: [adresse] }] };
    const plan = planEnsureSchema(def, [{ id: 'Adresse', type: 'Text' }, { id: 'CP', type: 'Text' }]);
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.actions.map((a) => a[2]), ['INSEE', 'Lat', 'Lon']);
  });

  it('refuse une annexe qui existe déjà avec un autre type', () => {
    const def = { tableId: 'T', sections: [{ fields: [adresse] }] };
    const plan = planEnsureSchema(def, [{ id: 'Lat', type: 'Text' }]);
    assert.equal(plan.ok, false);
    assert.match(plan.errors.join(' '), /Lat/);
  });

  it('refuse un sens que la source ne sait pas donner', () => {
    const f = JSON.parse(JSON.stringify(adresse));
    f.options.colonnes.annexes = { codePostal: 'CP', altitude: 'Alt' };
    const r = bindingIsComplete({ tableId: 'T', sections: [{ fields: [f] }] });
    assert.equal(r.ok, false);
    assert.match(r.errors.join(' '), /altitude/);
    assert.match(r.errors.join(' '), /codePostal/, 'dit ce que la source sait donner');
  });

  it('refuse un nom de colonne que Grist refuserait', () => {
    const f = JSON.parse(JSON.stringify(adresse));
    f.options.colonnes.annexes.codePostal = 'Code postal';
    const r = bindingIsComplete({ tableId: 'T', sections: [{ fields: [f] }] });
    assert.equal(r.ok, false);
    assert.match(r.errors.join(' '), /Code postal/);
  });

  it('une source inconnue ne crée aucune annexe, sans faire échouer le reste', () => {
    const f = JSON.parse(JSON.stringify(adresse));
    f.options.referentiel.source = 'bdtopo';
    const def = { tableId: 'T', sections: [{ fields: [f] }] };
    assert.deepEqual(columnsFromFormDef(def).map((c) => c.id), ['Adresse']);
    assert.equal(bindingIsComplete(def).ok, true, 'on ne juge pas ce qu’on ne connaît pas');
  });
});

describe('la colonne « Place » suit les limites', () => {
  const defAvec = (max) => ({
    tableId: 'Inscriptions',
    choices: { Creneau: ['10h', '14h'] },
    limites: { placeCol: 'Place', unique: { colId: 'Courriel' }, parChoix: [{ colId: 'Creneau', max: { '10h': max, '14h': max } }] },
    sections: [{ fields: [
      { colId: 'Courriel', type: 'Text' },
      { colId: 'Creneau', type: 'Choice' }
    ] }]
  });
  const colonnesDe = (def, place) => columnsFromFormDef(def)
    .filter(c => !c.isFormula)
    .map(c => ({ id: c.id, type: c.type }))
    .concat(place);
  const formuleDe = (def) => columnsFromFormDef(def).find(c => c.id === 'Place').formula;

  it('crée la colonne la première fois', () => {
    const def = defAvec(10);
    const plan = planEnsureSchema(def, colonnesDe(def, []), { tableExists: true });
    const ajout = plan.actions.find(a => a[0] === 'AddColumn' && a[2] === 'Place');
    assert.ok(ajout, 'Place doit être créée');
  });

  it('ne fait rien quand les limites n’ont pas changé', () => {
    const def = defAvec(10);
    const existantes = colonnesDe(def, [{ id: 'Place', type: 'Text', isFormula: true, formula: formuleDe(def) }]);
    const plan = planEnsureSchema(def, existantes, { tableExists: true });
    assert.equal(plan.actions.length, 0);
  });

  it('remplace la formule quand un maximum change (sinon il restait sans effet)', () => {
    const ancienne = formuleDe(defAvec(10));
    const def = defAvec(20);
    const existantes = colonnesDe(def, [{ id: 'Place', type: 'Text', isFormula: true, formula: ancienne }]);
    const plan = planEnsureSchema(def, existantes, { tableExists: true });
    assert.equal(plan.ok, true);
    assert.equal(plan.actions.length, 1);
    const [type, table, col, def2] = plan.actions[0];
    assert.equal(type, 'ModifyColumn');
    assert.equal(table, 'Inscriptions');
    assert.equal(col, 'Place');
    assert.equal(def2.isFormula, true);
    assert.match(def2.formula, /'10h': 20/);
  });

  it('laisse intacte une formule retouchée à la main (plus de marque)', () => {
    const def = defAvec(20);
    const existantes = colonnesDe(def, [{ id: 'Place', type: 'Text', isFormula: true, formula: 'return "Confirmé"' }]);
    const plan = planEnsureSchema(def, existantes, { tableExists: true });
    assert.equal(plan.actions.length, 0);
  });
});

it('une colonne DateTime avec fuseau (DateTime:Europe/Paris) est compatible avec une question DateTime', () => {
  const def = { tableId: 'T', sections: [{ fields: [{ colId: 'Quand', type: 'DateTime' }] }] };
  const plan = planEnsureSchema(def, [{ id: 'Quand', type: 'DateTime:Europe/Paris' }]);
  assert.equal(plan.ok, true, plan.errors.join(' '));
  assert.equal(plan.actions.length, 0);
});

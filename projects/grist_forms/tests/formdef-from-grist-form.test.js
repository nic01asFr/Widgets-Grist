const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../shared/formdef-from-grist-form.js');

/** Des lignes `{id, ...}` en table colonnaire, comme `fetchTable` la rend. */
function colonnaire(lignes) {
  const cles = [...new Set(lignes.flatMap((l) => Object.keys(l)))];
  const out = {};
  for (const k of cles) out[k] = lignes.map((l) => (l[k] === undefined ? null : l[k]));
  return out;
}

// Forme relevée dans un document réel (01/10/2026) : un formulaire de visite
// sur une table liée aux ouvrages. Noms reformulés.
function meta({ publie = true, champsSurcharges = {} } = {}) {
  const tables = [{ id: 1, tableId: 'Ouvrages' }, { id: 2, tableId: 'Visites' }, { id: 3, tableId: 'Agents' }];
  const colonnes = [
    { id: 10, parentId: 2, colId: 'Ouvrage', type: 'Ref:Ouvrages', label: 'Ouvrage', isFormula: false,
      widgetOptions: JSON.stringify({ question: 'Nom de l’ouvrage', formRequired: true }) },
    { id: 11, parentId: 2, colId: 'Date_visite', type: 'Date', label: 'Date_visite', isFormula: false,
      widgetOptions: JSON.stringify({ question: 'Date de la visite', formRequired: true }) },
    { id: 12, parentId: 2, colId: 'Inspecteurs', type: 'RefList:Agents', label: 'Inspecteurs', isFormula: false,
      widgetOptions: JSON.stringify({ question: 'Inspecteur(s)', formRequired: true, formOptionsSortOrder: 'ascending' }) },
    { id: 13, parentId: 2, colId: 'Constat', type: 'Text', label: 'Constat', isFormula: false,
      widgetOptions: JSON.stringify({ formRequired: true, formTextFormat: 'multiline' }), description: 'Ce qui a changé depuis la dernière visite' },
    { id: 14, parentId: 2, colId: 'Photo1', type: 'Attachments', label: 'Photo1', isFormula: false,
      widgetOptions: JSON.stringify({ question: 'Photo1\nPhotos légères de préférence (1920x1080)' }) },
    { id: 15, parentId: 2, colId: 'Etat', type: 'Ref:Etats', label: 'Etat', isFormula: false,
      widgetOptions: JSON.stringify({ formRequired: true, formSelectFormat: 'radio' }) },
    { id: 16, parentId: 2, colId: 'Delai', type: 'Numeric', label: 'Delai', isFormula: true, widgetOptions: '' },
  ];
  const champs = [10, 11, 12, 13, 14, 15, 16].map((c, i) => ({
    id: 100 + i, parentId: 29, colRef: c, parentPos: i, widgetOptions: champsSurcharges[c] || '',
  }));
  const mise = {
    type: 'Layout',
    children: [
      { type: 'Paragraph', text: '# **Ajout d’une visite**' },
      { type: 'Paragraph', text: 'Une visite par passage.' },
      { type: 'Section', children: [
        // L'ordre de la mise en page, pas celui de `parentPos`.
        { type: 'Field', leaf: 101 }, { type: 'Field', leaf: 102 }, { type: 'Field', leaf: 100 },
        { type: 'Field', leaf: 103 }, { type: 'Field', leaf: 105 }, { type: 'Field', leaf: 104 },
        { type: 'Field', leaf: 106 },
      ] },
      { type: 'Submit' },
    ],
  };
  return {
    tables: colonnaire(tables),
    colonnes: colonnaire(colonnes),
    vues: colonnaire([{ id: 10, name: '📋Formulaire visites' }]),
    sections: colonnaire([
      { id: 29, parentId: 10, parentKey: 'form', tableRef: 2, title: '', layoutSpec: JSON.stringify(mise),
        shareOptions: JSON.stringify(publie ? { form: true, publish: true } : {}) },
      { id: 30, parentId: 10, parentKey: 'record', tableRef: 2, title: '', layoutSpec: '' },
    ]),
    champs: colonnaire(champs),
  };
}

describe('formulairesGrist — un formulaire natif relu en FormDef', () => {
  it('ne retient que les sections de formulaire, une par formulaire', () => {
    const fs = G.formulairesGrist(meta());
    assert.equal(fs.length, 1);
    assert.equal(fs[0].formId, 'grist-form:29');
    assert.equal(fs[0].tableCible, 'Visites');
    assert.equal(fs[0].def.tableId, 'Visites');
    assert.ok(G.estFormulaireGrist(fs[0].formId));
  });

  it('reprend le titre et la description des paragraphes, sans Markdown', () => {
    const [f] = G.formulairesGrist(meta());
    assert.equal(f.titre, 'Ajout d’une visite');
    assert.equal(f.def.title, 'Ajout d’une visite');
    assert.equal(f.def.description, 'Une visite par passage.');
  });

  it('garde l’ordre de la mise en page et écarte les colonnes calculées', () => {
    const [f] = G.formulairesGrist(meta());
    assert.deepEqual(f.def.sections[0].fields.map((c) => c.colId),
      ['Date_visite', 'Inspecteurs', 'Ouvrage', 'Constat', 'Etat', 'Photo1']);
  });

  it('reprend libellés, obligatoires, aides et présentation', () => {
    const [f] = G.formulairesGrist(meta());
    const c = Object.fromEntries(f.def.sections[0].fields.map((x) => [x.colId, x]));
    assert.equal(c.Date_visite.label, 'Date de la visite');
    assert.equal(c.Date_visite.required, true);
    assert.equal(c.Photo1.label, 'Photo1');
    assert.equal(c.Photo1.description, 'Photos légères de préférence (1920x1080)', 'la suite de la question devient l’aide');
    assert.equal(c.Photo1.required, false);
    assert.equal(c.Constat.label, 'Constat', 'sans question, le libellé de la colonne');
    assert.equal(c.Constat.description, 'Ce qui a changé depuis la dernière visite');
    assert.equal(c.Constat.widget, 'textarea');
    assert.equal(c.Etat.widget, 'radio');
    assert.equal(c.Inspecteurs.widget, 'multiselect');
    assert.equal(c.Inspecteurs.options.sortOrder, 'ascending');
    assert.equal(c.Inspecteurs.options.refTable, 'Agents');
  });

  it('les réglages propres au champ l’emportent sur ceux de la colonne', () => {
    const [f] = G.formulairesGrist(meta({ champsSurcharges: { 13: JSON.stringify({ formRequired: false, question: 'Observations' }) } }));
    const constat = f.def.sections[0].fields.find((x) => x.colId === 'Constat');
    assert.equal(constat.label, 'Observations');
    assert.equal(constat.required, false);
  });

  it('un formulaire natif est prêt à servir, partagé publiquement ou non', () => {
    assert.equal(G.formulairesGrist(meta())[0].statut, 'publie');
    assert.equal(G.formulairesGrist(meta())[0].partage, true);
    assert.equal(G.formulairesGrist(meta({ publie: false }))[0].statut, 'publie');
    assert.equal(G.formulairesGrist(meta({ publie: false }))[0].partage, false);
    assert.equal(G.formulairesGrist(meta())[0].source, 'grist');
  });

  it('des métadonnées absentes ou abîmées ne rendent rien, sans erreur', () => {
    assert.deepEqual(G.formulairesGrist(null), []);
    const m = meta();
    m.sections.layoutSpec = ['{pas du json'];
    m.sections.parentKey = ['form'];
    assert.deepEqual(G.formulairesGrist(m), [], 'une mise en page illisible ne donne pas de formulaire vide');
  });
});

describe('formulairesGrist — cas relevés par la relecture du 02/10/2026', () => {
  function formulaire({ layout, colonnes, champs, vues = [{ id: 10, name: '📋Formulaire' }] }) {
    return G.formulairesGrist({
      tables: colonnaire([{ id: 1, tableId: 'Visites' }]),
      colonnes: colonnaire(colonnes),
      vues: colonnaire(vues),
      sections: colonnaire([{ id: 5, parentId: 10, parentKey: 'form', tableRef: 1, title: '', layoutSpec: JSON.stringify(layout), shareOptions: '' }]),
      champs: colonnaire(champs),
    })[0];
  }

  it('la colonne affichée d’une référence est un nom, pas un numéro de ligne', () => {
    const f = formulaire({
      layout: { type: 'Layout', children: [{ type: 'Section', children: [{ type: 'Field', leaf: 100 }] }] },
      colonnes: [
        { id: 21, parentId: 1, colId: 'Libelle', type: 'Text', label: 'Libelle', isFormula: false, widgetOptions: '', visibleCol: 0 },
        { id: 22, parentId: 1, colId: 'Agent', type: 'Ref:Agents', label: 'Agent', isFormula: false, widgetOptions: '', visibleCol: 21 },
      ],
      champs: [{ id: 100, parentId: 5, colRef: 22, parentPos: 0, widgetOptions: '', visibleCol: 0 }],
    });
    assert.equal(f.def.sections[0].fields[0].options.visibleCol, 'Libelle');
  });

  it('un paragraphe posé dans la section avant ses questions reste le titre et la description', () => {
    const f = formulaire({
      layout: { type: 'Layout', children: [{ type: 'Section', children: [
        { type: 'Paragraph', text: '# **Visite d’un ouvrage**' },
        { type: 'Paragraph', text: 'Une visite par passage.' },
        { type: 'Field', leaf: 100 },
      ] }] },
      colonnes: [{ id: 21, parentId: 1, colId: 'Constat', type: 'Text', label: 'Constat', isFormula: false, widgetOptions: '' }],
      champs: [{ id: 100, parentId: 5, colRef: 21, parentPos: 0, widgetOptions: '' }],
    });
    assert.equal(f.titre, 'Visite d’un ouvrage');
    assert.equal(f.def.description, 'Une visite par passage.');
  });

  it('les soulignés d’un identifiant restent, l’emphase s’en va', () => {
    assert.equal(G.texteSimple('# Fiche_visite des _ouvrages_ de la **digue**'), 'Fiche_visite des ouvrages de la digue');
    assert.equal(G.texteSimple('Ouvrages_2 et _gras_2'), 'Ouvrages_2 et _gras_2');
  });
});

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../shared/formdef-from-table.js');

/** Une colonne telle que `_grist_Tables_column` la donne. */
function col(colId, type, extra) {
  return Object.assign({ colId, type, isFormula: false }, extra || {});
}

describe('formDefDepuisColonnes — un brouillon, pas un enregistrement', () => {
  it('déduit un champ par colonne saisissable', () => {
    const def = F.formDefDepuisColonnes({
      tableId: 'Visites',
      colonnes: [col('etat', 'Choice'), col('visite', 'Date'), col('note', 'Text')],
    });
    assert.equal(def.tableId, 'Visites');
    assert.equal(def.composeMode, 'bind');
    assert.deepEqual(def.sections[0].fields.map((f) => f.colId), ['etat', 'visite', 'note']);
    assert.deepEqual(def.sections[0].fields.map((f) => f.widget), ['select', 'date', 'text']);
  });

  it('ne décide d’aucun widget lui-même : il demande à types.js', () => {
    // La règle type → widget existe UNE fois. Un second site aurait garanti
    // deux comportements pour une seule intention.
    const Types = require('../shared/types.js');
    for (const t of ['Text', 'Int', 'Numeric', 'Bool', 'Date', 'DateTime', 'Choice', 'ChoiceList', 'Attachments']) {
      const def = F.formDefDepuisColonnes({ tableId: 'T', colonnes: [col('c', t)] });
      assert.equal(def.sections[0].fields[0].widget, Types.defaultWidget(t), t);
    }
  });

  it('écarte les colonnes calculées — elles se lisent, elles ne se remplissent pas', () => {
    // Les offrir ferait saisir une valeur que Grist écraserait aussitôt.
    const def = F.formDefDepuisColonnes({
      tableId: 'Visites',
      colonnes: [col('etat', 'Choice'), col('age', 'Int', { isFormula: true })],
    });
    assert.deepEqual(def.sections[0].fields.map((f) => f.colId), ['etat']);
  });

  it('écarte ce que Grist tient pour lui, et ce que l’appelant sait hors-sujet', () => {
    const def = F.formDefDepuisColonnes({
      tableId: 'Batiments',
      colonnes: [col('id', 'Int'), col('manualSort', 'PositionNumber'), col('geometry_json', 'Text'), col('nom', 'Text')],
      ignorer: ['geometry_json'],
    });
    assert.deepEqual(def.sections[0].fields.map((f) => f.colId), ['nom']);
  });

  it('reprend les choix déclarés dans widgetOptions', () => {
    const def = F.formDefDepuisColonnes({
      tableId: 'Visites',
      colonnes: [col('etat', 'Choice', { widgetOptions: JSON.stringify({ choices: ['Neuf', 'Bon'] }) })],
    });
    assert.deepEqual(def.sections[0].fields[0].options.choices, ['Neuf', 'Bon']);
  });

  it('un widgetOptions illisible ne coûte que ses choix', () => {
    // Mieux vaut un champ libre qu'une liste vide où rien ne se choisit.
    const def = F.formDefDepuisColonnes({
      tableId: 'Visites',
      colonnes: [col('etat', 'Choice', { widgetOptions: '{ pas du JSON' })],
    });
    assert.equal(def.sections[0].fields[0].options, undefined);
  });

  it('un libellé absent se déduit du colId, sans le laisser tel quel', () => {
    const def = F.formDefDepuisColonnes({
      tableId: 'Visites',
      colonnes: [col('date_de_visite', 'Date'), col('etat', 'Choice', { label: 'État constaté' })],
    });
    assert.deepEqual(def.sections[0].fields.map((f) => f.label), ['Date de visite', 'État constaté']);
  });

  it('une référence porte la table qu’elle vise', () => {
    const def = F.formDefDepuisColonnes({
      tableId: 'Visites',
      colonnes: [col('batiment', 'Ref:Batiments_locaux')],
    });
    assert.equal(def.sections[0].fields[0].options.refTable, 'Batiments_locaux');
  });

  it('une table sans colonne saisissable ne donne pas de formulaire vide', () => {
    assert.equal(F.formDefDepuisColonnes({ tableId: 'T', colonnes: [col('id', 'Int')] }), null);
    assert.equal(F.formDefDepuisColonnes({ tableId: 'T', colonnes: [] }), null);
    assert.equal(F.formDefDepuisColonnes({ tableId: 'T' }), null);
    assert.equal(F.formDefDepuisColonnes({}), null);
    assert.equal(F.formDefDepuisColonnes(), null);
  });
});

describe('l’identifiant d’un dérivé', () => {
  it('se reconstruit sans rien lire', () => {
    // Un dérivé n'a pas de ligne, donc pas d'identifiant de base — or le choix
    // de la fiche et l'exposition s'y accrochent.
    assert.equal(F.idDerive('Visites'), 'derive:Visites');
    assert.equal(F.formDefDepuisColonnes({ tableId: 'Visites', colonnes: [col('a', 'Text')] }).id, 'derive:Visites');
  });

  it('se distingue d’un identifiant enregistré', () => {
    assert.equal(F.estDerive('derive:Visites'), true);
    assert.equal(F.estDerive('visites-terrain'), false);
    assert.equal(F.estDerive(null), false);
    assert.equal(F.tableDuDerive('derive:Visites'), 'Visites');
    assert.equal(F.tableDuDerive('visites-terrain'), null);
  });
});

describe('tableReferencee', () => {
  it('lit la table visée par Ref et RefList', () => {
    assert.equal(F.tableReferencee('Ref:Batiments'), 'Batiments');
    assert.equal(F.tableReferencee('RefList:Agents'), 'Agents');
  });

  it('et rend null pour tout le reste', () => {
    for (const t of ['Text', 'Int', 'Ref', 'Reference:X', '', null, undefined]) {
      assert.equal(F.tableReferencee(t), null, String(t));
    }
  });
});

describe('le libellé — et pourquoi celui de Grist ne suffit pas', () => {
  it('Grist remplit label avec le colId : on ne peut pas s’y fier', () => {
    // Le prendre tel quel affichait « nom » et « hauteur » en minuscules, à
    // côté d'« État » que quelqu'un avait nommé.
    assert.equal(F.libelleDeLaColonne({ colId: 'nom', label: 'nom' }), 'Nom');
    assert.equal(F.libelleDeLaColonne({ colId: 'date_de_visite', label: 'date_de_visite' }), 'Date de visite');
  });

  it('mais un vrai libellé est respecté tel quel', () => {
    assert.equal(F.libelleDeLaColonne({ colId: 'etat', label: 'État constaté' }), 'État constaté');
    assert.equal(F.libelleDeLaColonne({ colId: 'etat', label: 'état' }), 'état', 'même en minuscule s’il est différent');
  });

  it('et sans libellé du tout, le colId se relit', () => {
    assert.equal(F.libelleDeLaColonne({ colId: 'hauteur_m' }), 'Hauteur m');
    assert.equal(F.libelleDeLaColonne({ colId: 'etat', label: '' }), 'Etat');
  });

  it('le champ dérivé en hérite', () => {
    const def = F.formDefDepuisColonnes({
      tableId: 'Batiments',
      colonnes: [
        { colId: 'nom', type: 'Text', label: 'nom' },
        { colId: 'etat', type: 'Choice', label: 'État' },
      ],
    });
    assert.deepEqual(def.sections[0].fields.map((f) => f.label), ['Nom', 'État']);
  });
});

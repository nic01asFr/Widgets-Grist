/*
 * saisies-enquete.test.js — les quatre saisies que l'enquête du 4ᵉ demandait.
 *
 * Elles ne sont pas des variantes d'affichage : chacune range sa réponse
 * ailleurs que dans la colonne qui porte son nom. C'est ce que ces tests
 * fixent — le rendu suit, l'écriture commande.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Engine = require('../runtime/engine.js');

const def = { manifest_version: '1.0.0', id: 'f', tableId: 'Reponses', composeMode: 'bind', choices: {}, sections: [] };

/** Un FormDef d'une étape, pour collecter ce qu'une réponse écrirait. */
function formulaire(champs) {
  return Object.assign({}, def, { sections: [{ label: 'Étape', fields: champs }] });
}

describe('« Autre : … » — le texte libre a sa colonne', () => {
  const champ = {
    colId: 'C7_MoinsSatisfaction', label: 'Sources d’insatisfaction',
    type: 'ChoiceList', widget: 'multiselect', kind: 'choix_autre',
    options: {
      choices: ['Bruit', 'Propreté', 'Autre'],
      colonnes: { valeur: 'C7_MoinsSatisfaction', autre: 'C7_Autre' },
      valeurAutre: 'Autre',
    },
  };

  it('le champ de précision est caché tant qu’on n’a pas choisi « Autre »', () => {
    const html = Engine.renderFieldHtml(champ, { C7_MoinsSatisfaction: ['Bruit'] }, null, def);
    assert.ok(html.includes('fr-autre--repliee'), 'replié');
    assert.ok(html.includes('name="C7_Autre"'), 'mais présent dans la page');
  });

  it('il s’ouvre dès que « Autre » est coché', () => {
    const html = Engine.renderFieldHtml(champ, { C7_MoinsSatisfaction: ['Bruit', 'Autre'] }, null, def);
    assert.ok(!html.includes('fr-autre--repliee'));
  });

  it('la liste reçoit « Autre », et le texte va dans C7_Autre', () => {
    const out = Engine.collectSubmitData(formulaire([champ]), {
      C7_MoinsSatisfaction: ['Bruit', 'Autre'],
      C7_Autre: 'Les trottoirs encombrés',
    }, {}, { creation: true });
    assert.deepEqual(out.C7_MoinsSatisfaction, ['L', 'Bruit', 'Autre']);
    assert.equal(out.C7_Autre, 'Les trottoirs encombrés');
  });

  it('sans « Autre » coché, la précision ne part pas — même si elle a été tapée puis dé-cochée', () => {
    const out = Engine.collectSubmitData(formulaire([champ]), {
      C7_MoinsSatisfaction: ['Bruit'],
      C7_Autre: 'un texte oublié là',
    }, {}, { creation: true });
    assert.equal(out.C7_Autre, null);
  });
});

describe('cases plafonnées — « jusqu’à 5 propositions »', () => {
  const champ = {
    colId: 'D1', label: 'Améliorations prioritaires', type: 'ChoiceList', widget: 'multiselect',
    options: { choices: ['A', 'B', 'C'], maxSelected: 2 },
  };

  it('le plafond est annoncé avant de cocher, pas refusé après', () => {
    const html = Engine.renderFieldHtml(champ, {}, null, def);
    assert.ok(html.includes('data-max="2"'));
    assert.ok(html.includes('0 sur 2 maximum'));
  });

  it('le compteur dit où l’on en est', () => {
    const html = Engine.renderFieldHtml(champ, { D1: ['A', 'B'] }, null, def);
    assert.ok(html.includes('2 sur 2 maximum'));
  });
});

describe('classement — les rangs vont chacun dans leur colonne', () => {
  const champ = {
    colId: 'E_Lieux_prioritaires', label: 'Vos trois lieux prioritaires',
    type: 'Choice', widget: 'classement', kind: 'classement',
    options: {
      choices: ['Sébastopol', 'Audran', 'Longchamp', 'Blancarde', 'Autre'],
      colonnes: { rangs: ['E1_Prio1', 'E2_Prio2', 'E3_Prio3'], autre: 'E4_Autre' },
      rangs: 3, valeurAutre: 'Autre',
    },
  };

  it('montre l’ordre, et dit lesquels seront retenus', () => {
    const html = Engine.renderFieldHtml(champ, {}, null, def);
    assert.ok(html.includes('data-rangs="3"'));
    assert.ok(html.includes('Les 3 premiers seront retenus'));
    assert.ok(html.includes('fr-classement__item--hors'), 'au-delà du 3ᵉ, c’est hors classement');
  });

  it('les trois premiers partent dans E1, E2, E3 — et la question n’écrit pas sous son nom', () => {
    const out = Engine.collectSubmitData(formulaire([champ]), {
      E_Lieux_prioritaires: ['Longchamp', 'Sébastopol', 'Audran', 'Blancarde'],
    }, {}, { creation: true });
    assert.equal(out.E1_Prio1, 'Longchamp');
    assert.equal(out.E2_Prio2, 'Sébastopol');
    assert.equal(out.E3_Prio3, 'Audran');
    assert.ok(!('E_Lieux_prioritaires' in out), 'cette colonne n’existe pas dans la table');
  });

  it('deux lieux classés ne font pas apparaître un troisième choix', () => {
    const out = Engine.collectSubmitData(formulaire([champ]), {
      E_Lieux_prioritaires: ['Longchamp', 'Sébastopol'],
    }, {}, { creation: true });
    assert.equal(out.E3_Prio3, null);
  });
});

describe('géométrie — un point relevé sur place', () => {
  const champ = {
    colId: 'G_Geometries', label: 'Les endroits concernés', type: 'Text', widget: 'geo', kind: 'geometrie',
    options: { geometrie: 'MultiPoint', colonnes: { geometrie: 'G_Geometries' }, saisies: ['carte'] },
  };

  it('offre de relever la position, et laisse écrire à la main', () => {
    const html = Engine.renderFieldHtml(champ, {}, null, def);
    assert.ok(html.includes('Utiliser ma position'));
    assert.ok(html.includes('type="text"'), 'la saisie à la main reste possible');
    assert.ok(html.includes('POINT(5.37 43.29)'), 'le format attendu est montré');
  });

  it('écrit le WKT tel quel dans la colonne texte', () => {
    const out = Engine.collectSubmitData(formulaire([champ]), {
      G_Geometries: 'POINT(5.3998 43.3012)',
    }, {}, { creation: true });
    assert.equal(out.G_Geometries, 'POINT(5.3998 43.3012)');
  });
});

describe('une question cachée ne laisse rien derrière elle', () => {
  it('ses colonnes de rang et sa précision sont vidées', () => {
    const champ = {
      colId: 'E', label: 'Lieux', type: 'Choice', widget: 'classement', kind: 'classement',
      condition: { field: 'Concerne', operator: '==', value: true },
      options: { choices: ['A', 'B'], colonnes: { rangs: ['E1', 'E2'], autre: 'E_Autre' }, rangs: 2 },
    };
    const out = Engine.collectSubmitData(formulaire([champ]), {
      Concerne: false, E: ['A'], E_Autre: 'resté là',
    }, {}, { creation: true });
    assert.equal(out.E1, null);
    assert.equal(out.E2, null);
    assert.equal(out.E_Autre, null);
  });
});

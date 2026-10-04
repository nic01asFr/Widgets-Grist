/*
 * synthese.test.js — la table relue par le FormDef.
 *
 * Une échelle écrit « 4 » dans une colonne d'entiers ; un classement est éclaté
 * en trois colonnes ; « Autre » vit ailleurs que sa liste. Seule la définition
 * sait ce que tout cela veut dire.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const S = require('../shared/synthese.js');

const def = {
  manifest_version: '1.0.0', id: 'enq', title: 'Enquête', tableId: 'R', composeMode: 'bind',
  choices: {},
  echelles: { accord: { min: 1, max: 5, libelles: ['Pas du tout', 'Tout à fait'] } },
  meta: { durationCol: 'Duree' },
  sections: [{
    id: 's1', label: 'Les espaces publics',
    fields: [
      { colId: 'Agreable', label: 'Agréables', type: 'Int', widget: 'echelle',
        options: { echelle: 'accord', polarite: 'satisfaction' } },
      { colId: 'Places', label: 'Ajouter des places', type: 'Int', widget: 'echelle',
        options: { echelle: 'accord', polarite: 'besoin' } },
      { colId: 'Prio', label: 'Vos priorités', type: 'Choice', widget: 'classement', kind: 'classement',
        options: { colonnes: { rangs: ['P1', 'P2', 'P3'] } } },
      { colId: 'Amel', label: 'Améliorations', type: 'ChoiceList', widget: 'multiselect',
        options: { colonnes: { autre: 'Amel_Autre' } } },
      { colId: 'Remarque', label: 'Remarques', type: 'Text', widget: 'textarea' },
      { colId: 'Lieu', label: 'Un lieu', type: 'Text', widget: 'geo', kind: 'geometrie' },
    ],
  }],
};

const lignes = [
  { Agreable: 5, Places: 2, P1: 'Sébastopol', P2: 'Audran', P3: 'Blancarde',
    Amel: ['L', 'Bancs', 'Arbres'], Amel_Autre: '', Remarque: 'Trop de voitures.',
    Lieu: 'POINT (5.4 43.3)', Duree: 300 },
  { Agreable: 3, Places: 5, P1: 'Audran', P2: 'Sébastopol', P3: null,
    Amel: ['L', 'Arbres'], Amel_Autre: 'Des fontaines', Remarque: '', Lieu: '', Duree: 600 },
  { Agreable: 1, Places: 5, P1: 'Sébastopol', P2: null, P3: null,
    Amel: ['L', 'Arbres', 'Bancs'], Amel_Autre: '', Remarque: 'Rien à signaler.',
    Lieu: 'POINT (5.41 43.31)', Duree: 420 },
];

describe('ce qu’une échelle dit', () => {
  it('compte les répondants, la moyenne et les deux crans hauts', () => {
    const st = S.statsEchelle(lignes, 'Agreable', 1, 5);
    assert.equal(st.n, 3);
    assert.equal(st.moyenne, 3, '(5 + 3 + 1) / 3');
    assert.equal(st.haut, 1 / 3, 'seul le 5 est « haut »');
    assert.equal(st.bas, 1 / 3, 'seul le 1 est « bas »');
  });

  it('ignore ce qui n’est pas une réponse', () => {
    const st = S.statsEchelle([{ A: 3 }, { A: null }, { A: '' }, { A: 9 }], 'A', 1, 5);
    assert.equal(st.n, 1, 'hors bornes et vides écartés');
  });

  it('« haut » ne dévore jamais la moitié d’une échelle courte', () => {
    assert.equal(S.seuilHaut(1, 5), 4, 'deux crans sur cinq');
    assert.equal(S.seuilHaut(1, 10), 9);
    assert.equal(S.seuilHaut(1, 3), 3, 'un seul cran sur trois');
  });
});

describe('un classement se ramène à un score', () => {
  it('pondère les rangs de façon décroissante', () => {
    const sc = S.scoresClassement(lignes, def.sections[0].fields[2]);
    assert.deepEqual(sc[0], { option: 'Sébastopol', points: 3 + 2 + 3, premier: 2, citations: 3 });
    assert.deepEqual(sc[1], { option: 'Audran', points: 2 + 3, premier: 1, citations: 2 });
    assert.deepEqual(sc[2], { option: 'Blancarde', points: 1, premier: 0, citations: 1 });
  });
});

describe('les listes', () => {
  it('comptent les citations, « L » de Grist retiré', () => {
    const f = S.frequences(lignes, 'Amel');
    assert.deepEqual(f, [{ valeur: 'Arbres', n: 3 }, { valeur: 'Bancs', n: 2 }]);
  });
});

describe('la synthèse entière', () => {
  const s = S.construire(def, lignes);

  it('dit combien ont répondu, et en combien de temps', () => {
    assert.equal(s.reponses, 3);
    assert.equal(s.duree.mediane, 420);
    assert.equal(s.duree.n, 3);
  });

  it('range les échelles selon ce que « haut » veut dire', () => {
    assert.equal(s.ressort.besoins[0].colId, 'Places');
    assert.equal(s.ressort.satisfactions[0].colId, 'Agreable');
    assert.ok(s.ressort.besoins[0].haut > s.ressort.satisfactions[0].haut,
      'le besoin ressort plus fort que la satisfaction');
  });

  it('ramène « Autre » à la liste à laquelle il appartient', () => {
    const liste = s.listes.find((l) => l.colId === 'Amel');
    assert.deepEqual(liste.autres, ['Des fontaines']);
  });

  it('garde les verbatims non vides, et les lieux renseignés', () => {
    assert.deepEqual(s.verbatims[0].textes, ['Trop de voitures.', 'Rien à signaler.']);
    assert.equal(s.lieux[0].wkts.length, 2);
  });

  it('suit les sections du formulaire, pas l’ordre des colonnes', () => {
    assert.equal(s.sections.length, 1);
    assert.equal(s.sections[0].label, 'Les espaces publics');
  });

  it('ne rend rien d’absurde sur une table vide', () => {
    const vide = S.construire(def, []);
    assert.equal(vide.reponses, 0);
    assert.equal(vide.duree.mediane, null);
    assert.deepEqual(vide.ressort.besoins.map((m) => m.colId), [], 'rien à faire ressortir');
  });
});

describe('les lignes de Grist', () => {
  it('se remettent à l’endroit depuis le colonnaire', () => {
    const l = S.enLignes({ id: [1, 2], A: ['x', 'y'] });
    assert.deepEqual(l, [{ id: 1, A: 'x' }, { id: 2, A: 'y' }]);
  });

  it('acceptent d’arriver déjà en lignes', () => {
    const deja = [{ A: 'x' }, { A: 'y' }];
    assert.equal(S.enLignes(deja), deja, 'rendues telles quelles');
  });

  it('un colonnaire vide ne donne aucune ligne', () => {
    assert.deepEqual(S.enLignes({}), []);
    assert.deepEqual(S.enLignes(null), []);
  });
});

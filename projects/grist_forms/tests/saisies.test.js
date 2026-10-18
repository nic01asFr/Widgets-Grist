'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Saisies = require('../shared/saisies.js');

// 18 octobre 2026, 14 h 05, heure locale (new Date avec composantes locales).
const MAINTENANT = new Date(2026, 9, 18, 14, 5, 0);

describe('Saisies — valeur de départ', () => {
  const champ = (type, widget, depart) => ({ colId: 'Q', type, widget, options: { depart } });

  it('aujourd’hui : la date de la personne, au format du champ date', () => {
    assert.equal(Saisies.valeurDepart(champ('Date', 'date', { source: 'aujourdhui' }), { now: MAINTENANT }), '2026-10-18');
  });

  it('la date ne recule pas à minuit : elle est locale, pas UTC', () => {
    const minuit = new Date(2026, 9, 18, 0, 10, 0);
    assert.equal(Saisies.valeurDepart(champ('Date', 'date', { source: 'aujourdhui' }), { now: minuit }), '2026-10-18');
  });

  it('maintenant : date et heure, ou l’heure seule', () => {
    assert.equal(Saisies.valeurDepart(champ('DateTime', 'datetime', { source: 'maintenant' }), { now: MAINTENANT }), '2026-10-18T14:05');
    assert.equal(Saisies.valeurDepart(champ('Text', 'heure', { source: 'maintenant' }), { now: MAINTENANT }), '14:05');
  });

  it('moi : le courriel quand l’hôte le connaît, rien sinon', () => {
    const f = champ('Text', 'text', { source: 'moi' });
    assert.equal(Saisies.valeurDepart(f, { now: MAINTENANT, email: 'a@exemple.fr' }), 'a@exemple.fr');
    assert.equal(Saisies.valeurDepart(f, { now: MAINTENANT }), undefined);
    assert.equal(Saisies.departTardif(f), true, 'le courriel arrive après le montage');
  });

  it('dernière saisie : ce que l’hôte a gardé', () => {
    const f = champ('Text', 'text', { source: 'derniere' });
    assert.equal(Saisies.valeurDepart(f, { derniere: () => 'Zone Nord' }), 'Zone Nord');
    assert.equal(Saisies.valeurDepart(f, {}), undefined);
  });

  it('valeur fixe', () => {
    assert.equal(Saisies.valeurDepart(champ('Text', 'text', { source: 'valeur', valeur: 'Amiens' }), {}), 'Amiens');
    assert.equal(Saisies.valeurDepart(champ('Int', 'number', { source: 'valeur', valeur: 3 }), {}), 3);
  });

  it('une source qui ne convient pas au type n’offre rien', () => {
    assert.equal(Saisies.valeurDepart(champ('Int', 'number', { source: 'aujourdhui' }), { now: MAINTENANT }), undefined);
    assert.equal(Saisies.valeurDepart(champ('Bool', 'checkbox', { source: 'moi' }), { email: 'a@b.fr' }), undefined);
  });

  it('une source inconnue ou absente n’offre rien', () => {
    assert.equal(Saisies.valeurDepart(champ('Date', 'date', { source: 'demain' }), { now: MAINTENANT }), undefined);
    assert.equal(Saisies.valeurDepart({ colId: 'Q', type: 'Date', options: {} }, { now: MAINTENANT }), undefined);
  });
});

describe('Saisies — bornes', () => {
  const nb = (min, max) => ({ colId: 'N', type: 'Int', options: { min, max } });

  it('hors bornes : un message qui dit lesquelles', () => {
    assert.match(Saisies.validerBornes(nb(1, 5), 9), /entre 1 et 5/);
    assert.match(Saisies.validerBornes(nb(1, 5), 0), /entre 1 et 5/);
    assert.match(Saisies.validerBornes(nb(1, undefined), 0), /au moins 1/);
    assert.match(Saisies.validerBornes(nb(undefined, 5), 6), /au plus 5/);
  });

  it('dans les bornes, vide, ou sans bornes : rien à dire', () => {
    assert.equal(Saisies.validerBornes(nb(1, 5), 3), '');
    assert.equal(Saisies.validerBornes(nb(1, 5), 1), '');
    assert.equal(Saisies.validerBornes(nb(1, 5), 5), '');
    assert.equal(Saisies.validerBornes(nb(1, 5), ''), '', 'vide n’est pas hors bornes');
    assert.equal(Saisies.validerBornes(nb(1, 5), null), '');
    assert.equal(Saisies.validerBornes({ colId: 'N', type: 'Int', options: {} }, 999), '');
  });

  it('des bornes de dates, dont « aujourd’hui »', () => {
    const f = { colId: 'D', type: 'Date', options: { min: 'aujourdhui', max: '2026-12-31' } };
    assert.match(Saisies.validerBornes(f, '2026-10-17', MAINTENANT), /précéder le 18\/10\/2026/);
    assert.match(Saisies.validerBornes(f, '2027-01-01', MAINTENANT), /dépasser le 31\/12\/2026/);
    assert.equal(Saisies.validerBornes(f, '2026-10-18', MAINTENANT), '');
    assert.equal(Saisies.validerBornes(f, '2026-12-31', MAINTENANT), '');
  });

  it('une borne illisible est ignorée', () => {
    assert.equal(Saisies.validerBornes({ colId: 'D', type: 'Date', options: { min: 'hier' } }, '2020-01-01', MAINTENANT), '');
    assert.equal(Saisies.validerBornes({ colId: 'N', type: 'Int', options: { min: 'abc' } }, 3), '');
  });
});

describe('Saisies — ordre entre deux questions', () => {
  const fin = { colId: 'Fin', type: 'Date', options: { apres: 'Debut' } };

  it('une fin qui précède son début est refusée, en le disant', () => {
    assert.match(Saisies.validerApres(fin, '2026-10-01', '2026-10-05', 'Début'), /ne peut pas précéder « Début »/);
  });

  it('une fin égale ou postérieure passe', () => {
    assert.equal(Saisies.validerApres(fin, '2026-10-05', '2026-10-05', 'Début'), '');
    assert.equal(Saisies.validerApres(fin, '2026-10-09', '2026-10-05', 'Début'), '');
  });

  it('une des deux valeurs vide ne contredit rien', () => {
    assert.equal(Saisies.validerApres(fin, '', '2026-10-05'), '');
    assert.equal(Saisies.validerApres(fin, '2026-10-01', ''), '');
    assert.equal(Saisies.validerApres(fin, '2026-10-01', null), '');
  });

  it('se compare aussi pour des heures et des nombres', () => {
    const heure = { colId: 'F', type: 'Text', widget: 'heure', options: { apres: 'D' } };
    assert.match(Saisies.validerApres(heure, '08:00', '09:30'), /précéder/);
    assert.equal(Saisies.validerApres(heure, '10:00', '09:30'), '');
    const n = { colId: 'F', type: 'Int', options: { apres: 'D' } };
    assert.match(Saisies.validerApres(n, 2, 10), /précéder/, 'les nombres se comparent comme des nombres, pas comme du texte');
    assert.equal(Saisies.validerApres(n, 10, 2), '');
  });

  it('un nom de question invalide n’est pas une contrainte', () => {
    assert.equal(Saisies.apresDe({ options: { apres: 'a b!' } }), null);
    assert.equal(Saisies.validerApres({ type: 'Date', options: { apres: 'a b!' } }, '2020-01-01', '2021-01-01'), '');
  });
});

describe('Saisies — heure seule', () => {
  it('HH:MM de 00:00 à 23:59', () => {
    ['00:00', '09:05', '12:30', '23:59'].forEach((h) => assert.equal(Saisies.heureValide(h), true, h));
    ['24:00', '9:05', '12:60', '1230', 'midi', '', null].forEach((h) => assert.equal(Saisies.heureValide(h), false, String(h)));
  });
  it('se convertit en minutes', () => {
    assert.equal(Saisies.minutesDe('01:30'), 90);
    assert.equal(Saisies.minutesDe('xx'), null);
  });
});

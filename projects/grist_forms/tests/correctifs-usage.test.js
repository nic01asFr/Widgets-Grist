'use strict';

/*
 * Trois finitions d'usage : le courriel de la personne connectee, la precision d'un releve GPS,
 * et une taille de texte qui ne descend jamais sous 14 px.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../runtime/engine.js');

const base = (extra) => Object.assign({
  id: 'x', title: 'X', tableId: 'T',
  sections: [{ label: 'S', fields: [
    { colId: 'Lieu', label: 'Lieu', type: 'Text', widget: 'geo', options: { precisionCol: 'Precision' } },
    { colId: 'A', label: 'A', type: 'Text', widget: 'text' }
  ] }]
}, extra);

describe('meta.emailCol — le courriel de la personne connue de l\'hote', () => {
  const def = base({ meta: { emailCol: 'Courriel' } });

  it('s\'ecrit a la creation, en minuscules, quand l\'hote connait la personne', () => {
    const out = Engine.collectSubmitData(def, { A: 'x' }, {}, { creation: true, email: '  Alice@Exemple.FR ' });
    assert.equal(out.Courriel, 'alice@exemple.fr');
  });

  it('ne s\'ecrit pas sans identite : la colonne reste vide, rien n\'est devine', () => {
    const out = Engine.collectSubmitData(def, { A: 'x' }, {}, { creation: true, email: '' });
    assert.ok(!('Courriel' in out));
    assert.ok(!('Courriel' in Engine.collectSubmitData(def, { A: 'x' }, {}, { creation: true })));
  });

  it('ne s\'ecrit pas en modification : on ne remplace pas l\'auteur d\'origine', () => {
    const out = Engine.collectSubmitData(def, { A: 'x' }, {}, { creation: false, email: 'alice@exemple.fr' });
    assert.ok(!('Courriel' in out));
  });

  it('sans meta.emailCol, aucun courriel n\'est ecrit', () => {
    const out = Engine.collectSubmitData(base({}), { A: 'x' }, {}, { creation: true, email: 'alice@exemple.fr' });
    assert.ok(!Object.values(out).includes('alice@exemple.fr'));
  });
});

describe('options.precisionCol — la precision d\'un point releve au GPS', () => {
  const wkt = 'POINT (5.4 43.3)';

  it('ecrit la precision en metres quand le point est celui que le GPS a donne', () => {
    const out = Engine.collectSubmitData(base({}), { Lieu: wkt, __precision_Lieu: { wkt, m: 12 } }, {}, { creation: true });
    assert.equal(out.Precision, 12);
  });

  it('la laisse vide quand le point a ete deplace ou tape ensuite', () => {
    const out = Engine.collectSubmitData(base({}), { Lieu: 'POINT (5.5 43.4)', __precision_Lieu: { wkt, m: 12 } }, {}, { creation: true });
    assert.equal(out.Precision, null);
  });

  it('la laisse vide sans releve GPS (carte, adresse)', () => {
    const out = Engine.collectSubmitData(base({}), { Lieu: wkt }, {}, { creation: true });
    assert.equal(out.Precision, null);
  });

  it('sans l\'option, aucune colonne de precision n\'est ecrite', () => {
    const def = base({});
    delete def.sections[0].fields[0].options;
    const out = Engine.collectSubmitData(def, { Lieu: wkt, __precision_Lieu: { wkt, m: 12 } }, {}, { creation: true });
    assert.ok(!('Precision' in out));
  });
});

describe('Taille de texte — jamais sous 14 px', () => {
  const CSS = fs.readFileSync(path.join(__dirname, '..', 'shared', 'dsfr-like.css'), 'utf8');

  it('aucune taille de la feuille n\'est inferieure a 0,875 rem', () => {
    const trop = [];
    CSS.replace(/font-size:\s*([0-9.]+)(rem|px|em)/g, (m, n, u) => {
      const px = u === 'px' ? Number(n) : Number(n) * 16;
      if (px < 14) trop.push(m);
      return m;
    });
    assert.deepEqual(trop, []);
  });

  it('<small>, dont le navigateur reduit le texte de 17 %, est remonte au minimum', () => {
    assert.match(CSS, /^small \{ font-size: 0\.875rem; \}/m);
  });
});

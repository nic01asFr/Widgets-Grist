'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Prefill = require('../shared/prefill.js');

const def = {
  sections: [{
    fields: [
      { colId: 'Objet', type: 'Ref:Lampadaires', options: { prefill: { param: 'objet', verrouille: true, libelleParam: 'objet_nom' } } },
      { colId: 'Nature', type: 'Choice', options: { choices: ['Panne', 'Casse'], prefill: { param: 'nature' } } },
      { colId: 'Gravite', type: 'Int', options: { prefill: { param: 'gravite' } } },
      { colId: 'Lieu', type: 'Text', options: { prefill: { param: 'lieu' } } },
      { colId: 'Libre', type: 'Text' }
    ]
  }]
};

describe('Prefill — lire l’adresse de la page', () => {
  it('reprend ce que le formulaire déclare, converti vers le type de la question', () => {
    const r = Prefill.lire(def, '?objet=123&nature=Panne&gravite=4&lieu=Place%20du%20March%C3%A9');
    assert.equal(r.values.Objet, 123);
    assert.equal(r.values.Nature, 'Panne');
    assert.equal(r.values.Gravite, 4);
    assert.equal(r.values.Lieu, 'Place du Marché');
  });

  it('ne remplit jamais une question qui ne l’a pas demandé', () => {
    const r = Prefill.lire(def, '?Libre=intrus&libre=intrus&colId=Libre');
    assert.deepEqual(r.values, {});
  });

  it('accepte l’adresse avec ou sans le point d’interrogation, et sans paramètre', () => {
    assert.equal(Prefill.lire(def, 'objet=7').values.Objet, 7);
    assert.deepEqual(Prefill.lire(def, '').values, {});
    assert.deepEqual(Prefill.lire(def, undefined).values, {});
  });

  it('dit quelles questions sont verrouillées, et le libellé à montrer', () => {
    const r = Prefill.lire(def, '?objet=123&objet_nom=Lampadaire%2012');
    assert.deepEqual(r.verrouilles, ['Objet']);
    assert.equal(r.libelles.Objet, 'Lampadaire 12');
    assert.deepEqual(Prefill.lire(def, '?nature=Casse').verrouilles, []);
  });

  it('refuse une valeur du mauvais type et le dit, sans rien remplir', () => {
    const r = Prefill.lire(def, '?objet=abc&gravite=trois&nature=Inconnue');
    assert.deepEqual(r.values, {});
    assert.deepEqual(r.ignores.map((i) => i.colId).sort(), ['Gravite', 'Nature', 'Objet']);
    assert.match(r.ignores.find((i) => i.colId === 'Nature').raison, /liste/);
  });

  it('une référence est un entier strictement positif', () => {
    assert.equal(Prefill.lire(def, '?objet=0').values.Objet, undefined);
    assert.equal(Prefill.lire(def, '?objet=-5').values.Objet, undefined);
    assert.equal(Prefill.lire(def, '?objet=12.5').values.Objet, undefined);
    assert.equal(Prefill.lire(def, '?objet=99999999999').values.Objet, undefined, 'plus de dix chiffres');
  });

  it('retire les caractères de commande et borne la longueur', () => {
    const long = 'x'.repeat(500);
    const r = Prefill.lire(def, '?lieu=' + encodeURIComponent('a\u0000b\u001fc ') + '&gravite=1');
    assert.equal(r.values.Lieu, 'abc');
    assert.equal(Prefill.lire(def, '?lieu=' + long).values.Lieu.length, 200);
  });

  it('une valeur vide ne remplit pas', () => {
    assert.deepEqual(Prefill.lire(def, '?objet=&lieu=%20').values, {});
  });

  it('un nom de paramètre invalide dans la définition est ignoré et signalé', () => {
    const d = { sections: [{ fields: [{ colId: 'A', type: 'Text', options: { prefill: { param: 'Bad Name!' } } }] }] };
    const r = Prefill.lire(d, '?x=1');
    assert.deepEqual(r.values, {});
    assert.equal(r.ignores.length, 1);
  });

  it('Bool et Numeric', () => {
    const d = { sections: [{ fields: [
      { colId: 'B', type: 'Bool', options: { prefill: { param: 'b' } } },
      { colId: 'N', type: 'Numeric', options: { prefill: { param: 'n' } } }
    ] }] };
    const r = Prefill.lire(d, '?b=oui&n=2,5');
    assert.equal(r.values.B, true);
    assert.equal(r.values.N, 2.5);
  });

  it('liste les paramètres déclarés, pour documenter ou construire un lien', () => {
    const p = Prefill.parametresDeclares(def);
    assert.deepEqual(p.map((x) => x.param), ['objet', 'nature', 'gravite', 'lieu']);
    assert.equal(p[0].verrouille, true);
  });
});

describe('Prefill — dans le moteur', () => {
  const Engine = require('../runtime/engine.js');
  const { createRoot } = require('./helpers/fake-dom.js');

  const formulaire = () => ({
    id: 'gmao', title: 'Signaler', tableId: 'Signalements',
    sections: [{ label: 'Le défaut', fields: [
      { colId: 'Objet', label: 'Objet concerné', type: 'Ref:Lampadaires', widget: 'text',
        options: { prefill: { param: 'objet', verrouille: true, libelleParam: 'objet_nom' } } },
      { colId: 'Nature', label: 'Nature', type: 'Choice', widget: 'select', required: true, options: { choices: ['Panne', 'Casse'] } }
    ] }]
  });

  it('une question verrouillée se lit sans se saisir, et sa valeur part avec la réponse', async () => {
    const root = createRoot();
    const lu = Prefill.lire(formulaire(), '?objet=123&objet_nom=Lampadaire%2012');
    let envoye = null;
    Engine.mount(root, formulaire(), {
      values: lu.values, verrouilles: lu.verrouilles, libelles: lu.libelles, skipProbe: true,
      submit: (data) => { envoye = data; return Promise.resolve({ ok: true }); }
    });
    assert.equal(root.querySelector('[name="Objet"]'), null, 'pas de zone de saisie pour l’objet');
    assert.match(root.innerHTML || JSON.stringify(root.children), /Lampadaire 12/, 'le libellé est montré');
    root.querySelector('[name="Nature"]').value = 'Panne';
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await new Promise((r) => setTimeout(r, 5));
    assert.ok(envoye, 'le formulaire est parti');
    assert.equal(envoye.Objet, 123, 'l’objet désigné est dans la ligne');
    assert.equal(envoye.Nature, 'Panne');
  });

  it('sans verrou, la question reste une saisie ordinaire, préremplie', () => {
    const def = formulaire();
    def.sections[0].fields[0].options.prefill.verrouille = false;
    const root = createRoot();
    const lu = Prefill.lire(def, '?objet=5');
    Engine.mount(root, def, { values: lu.values, verrouilles: lu.verrouilles, skipProbe: true, submit: () => Promise.resolve() });
    assert.ok(root.querySelector('[name="Objet"]'), 'la zone existe');
  });
});

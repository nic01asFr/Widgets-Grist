'use strict';

/*
 * La confiance d'une personne qui répond tient à peu de choses : sa réponse part une fois, et si elle ne part
 * pas, elle le sait et ne perd rien. Chaque cas ci-dessous est un geste réel de la revue du 31/10/2026.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Engine = require('../runtime/engine.js');
const { createRoot } = require('./helpers/fake-dom.js');

const flush = () => new Promise((resolve) => setTimeout(() => setImmediate(resolve), 2));

const formDef = {
  id: 'f', title: 'F', tableId: 'T', choices: {},
  sections: [{ id: 's1', label: 'S', gate: null, fields: [
    { colId: 'Nom', label: 'Nom', type: 'Text', widget: 'text', required: true }
  ] }]
};

describe('Typographie française à l\'affichage', () => {
  const NB = String.fromCharCode(160);
  const LAQ = String.fromCharCode(171);
  const RAQ = String.fromCharCode(187);

  it('colle ? ! : ; à leur mot : un « ? » ne tombe jamais seul en début de ligne', () => {
    assert.equal(Engine.typographie('Comment jugez-vous la place ?'), 'Comment jugez-vous la place' + NB + '?');
    assert.equal(Engine.typographie('Attention : complet ; merci !'), 'Attention' + NB + ': complet' + NB + '; merci' + NB + '!');
  });

  it('colle l\'intérieur des guillemets français', () => {
    assert.equal(Engine.typographie(LAQ + ' Atelier ' + RAQ), LAQ + NB + 'Atelier' + NB + RAQ);
  });

  it('ne touche ni un texte déjà correct ni l\'absence d\'espace (adresse, heure)', () => {
    const ok = 'Rendez-vous à 14h30, sur https://exemple.fr/a?b=1';
    assert.equal(Engine.typographie(ok), ok);
    assert.equal(Engine.typographie('Déjà' + NB + '?'), 'Déjà' + NB + '?');
  });
});

describe('Oui / Non et conditions', () => {
  const def = {
    id: 'f', title: 'F', tableId: 'T', choices: {},
    sections: [{ id: 's', label: 'S', gate: null, fields: [
      { colId: 'Velo', label: 'Vélo', type: 'Bool', widget: 'ouinon', required: false },
      { colId: 'Marque', label: 'Marque', type: 'Text', widget: 'text', required: false,
        condition: { field: 'Velo', operator: '==', value: true } }
    ] }]
  };

  it('une question conditionnée par « Oui » apparaît quand on répond Oui, disparaît sur Non, et part avec un booléen', async () => {
    let envoye = null;
    const root = createRoot();
    Engine.mount(root, def, { submit: (d) => { envoye = d; return Promise.resolve([[1]]); } });
    await flush();
    assert.ok(!root.querySelector('[name="Marque"]'), 'cachée tant qu\'on n\'a rien répondu');
    const oui = root.querySelector('[name="Velo"][value="true"]');
    oui.checked = true; oui.dispatchEvent('change');
    await flush();
    assert.ok(root.querySelector('[name="Marque"]'), 'visible après « Oui »');
    root.querySelector('[name="Marque"]').value = 'Peugeot';
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush(); await flush();
    assert.deepEqual(envoye, { Velo: true, Marque: 'Peugeot' });
  });
});

describe('Fiabilité de l\'envoi', () => {
  it('deux clics sur « Envoyer » n\'envoient qu\'une réponse', async () => {
    let appels = 0;
    const root = createRoot();
    Engine.mount(root, formDef, { submit: () => { appels++; return new Promise((r) => setTimeout(() => r([[1]]), 20)); } });
    await flush();
    root.querySelector('[name="Nom"]').value = 'Alice';
    const bouton = root.querySelector('[data-action="submit"]');
    bouton.dispatchEvent('click');
    bouton.dispatchEvent('click');   // le même nœud : un doigt qui rebondit, ou Entrée puis clic
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(appels, 1);
  });

  it('un échec d\'envoi le dit, garde la saisie et laisse réessayer', async () => {
    let mode = 'echec';
    let appels = 0;
    const root = createRoot();
    Engine.mount(root, formDef, { submit: () => { appels++; return mode === 'echec' ? Promise.reject(new Error('Réseau indisponible')) : Promise.resolve([[1]]); } });
    await flush();
    root.querySelector('[name="Nom"]').value = 'Alice';
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush(); await flush();
    assert.match(root.innerHTML, /Réseau indisponible/);
    assert.match(root.innerHTML, /value="Alice"/, 'la saisie est gardée');
    assert.ok(!/data-action="submit"[^>]*disabled/.test(root.innerHTML), 'le bouton est de nouveau utilisable');
    mode = 'ok';
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush(); await flush();
    assert.equal(appels, 2);
    assert.match(root.innerHTML, /fr-form__success/);
  });
});

describe('Une ligne écrite n\'est jamais annoncée comme un échec', () => {
  const GristBridge = require('../shared/grist-bridge.js');

  it('table illisible après l\'ajout (règles « ajout seul ») : l\'ajout réussit quand même, avec l\'identifiant', async () => {
    global.window = { grist: { docApi: {
      fetchTable: async () => { throw new Error('Blocked by table read access rules'); },
      applyUserActions: async () => ({ retValues: [[7]] })
    } } };
    try {
      const rows = await GristBridge.addRow('T', { Nom: 'Alice' });
      assert.deepEqual(rows, []);
      assert.equal(rows.idCree, 7);
    } finally { delete global.window; }
  });

  it('un échec réseau se lit en français et dit que les réponses sont gardées', async () => {
    const root = createRoot();
    Engine.mount(root, formDef, { submit: () => Promise.reject(new Error('Failed to fetch')) });
    await flush();
    root.querySelector('[name="Nom"]').value = 'Alice';
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush(); await flush();
    assert.ok(!/Failed to fetch/.test(root.innerHTML));
    assert.match(root.innerHTML, /vos réponses sont gardées/);
  });
});

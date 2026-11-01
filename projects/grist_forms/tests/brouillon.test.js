'use strict';

/*
 * Le brouillon : ce qu'on a commence a repondre survit a un rechargement de la page, dans l'onglet seulement.
 * Un stockage factice remplace sessionStorage ; rien n'est ecrit si l'hote ne le demande pas.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Engine = require('../runtime/engine.js');
const { createRoot } = require('./helpers/fake-dom.js');

const flush = () => new Promise((resolve) => setTimeout(() => setImmediate(resolve), 5));

function stockage() {
  const m = new Map();
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }
  };
}

const def = (extra) => Object.assign({
  id: 'inscription', title: 'Inscription', tableId: 'T', choices: {},
  sections: [
    { id: 's1', label: 'Vous', gate: null, fields: [
      { colId: 'Nom', label: 'Nom', type: 'Text', widget: 'text', required: false }
    ] },
    { id: 's2', label: 'Suite', gate: null, fields: [
      { colId: 'Mot', label: 'Mot', type: 'Text', widget: 'text', required: false }
    ] }
  ]
}, extra || {});

const sans = { submit: () => Promise.resolve([[1]]) };

describe('valeursDeBrouillon : ce qui se garde', () => {
  it('du texte, des nombres, des booleens et des listes simples ; rien d\'interne ni de lourd', () => {
    const out = Engine.valeursDeBrouillon({
      A: 'x', B: 3, C: true, D: null, E: ['a', 'b'],
      F__lieuChoisi: 'interne', G: { fichier: 1 }, H: [{ nom: 'f.png' }],
      I: 'z'.repeat(30000), J: NaN
    });
    assert.deepEqual(out, { A: 'x', B: 3, C: true, D: null, E: ['a', 'b'] });
  });
});

describe('Brouillon : garde, propose, efface', () => {
  it('sans demande de l\'hote, rien n\'est ecrit', async () => {
    const st = stockage();
    const root = createRoot();
    Engine.mount(root, def(), sans);
    await flush();
    root.querySelector('[name="Nom"]').value = 'Alice';
    root.querySelector('[name="Nom"]').dispatchEvent('change');
    await flush();
    assert.equal(st.m.size, 0);
    assert.ok(!/fr-brouillon/.test(root.innerHTML));
  });

  it('ce qu\'on quitte est garde, avec l\'etape', async () => {
    const st = stockage();
    const root = createRoot();
    Engine.mount(root, def(), Object.assign({ brouillon: st }, sans));
    await flush();
    root.querySelector('[name="Nom"]').value = 'Alice';
    root.querySelector('[name="Nom"]').dispatchEvent('change');
    await flush();
    assert.equal(st.m.size, 1);
    const b = JSON.parse([...st.m.values()][0]);
    assert.equal(b.valeurs.Nom, 'Alice');
    assert.equal(b.etape, 0);
  });

  it('au rechargement, la reprise est proposee puis rend les reponses et l\'etape', async () => {
    const st = stockage();
    const a = createRoot();
    const m1 = Engine.mount(a, def(), Object.assign({ brouillon: st }, sans));
    await flush();
    a.querySelector('[name="Nom"]').value = 'Alice';
    a.querySelector('[name="Nom"]').dispatchEvent('change');
    await flush();
    a.querySelector('[data-action="next"]').dispatchEvent('click');
    await flush();
    m1.demonter();

    const b = createRoot();
    Engine.mount(b, def(), Object.assign({ brouillon: st }, sans));
    await flush();
    assert.match(b.innerHTML, /Vous aviez commencé à répondre/);
    assert.match(b.innerHTML, /data-action="reprendre-brouillon"/);
    b.querySelector('[data-action="reprendre-brouillon"]').dispatchEvent('click');
    await flush();
    assert.ok(!/fr-brouillon/.test(b.innerHTML), 'la proposition disparait');
    assert.ok(/name="Mot"/.test(b.innerHTML), 'on revient a l\'etape 2');
    b.querySelector('[data-action="prev"]').dispatchEvent('click');
    await flush();
    assert.ok(/value="Alice"/.test(b.innerHTML), 'la reponse est rendue');
  });

  it('« Recommencer a zero » efface et ne propose plus', async () => {
    const st = stockage();
    st.setItem(Engine.cleBrouillon(def()), JSON.stringify({ valeurs: { Nom: 'Alice' }, etape: 0, date: Date.now() }));
    const root = createRoot();
    Engine.mount(root, def(), Object.assign({ brouillon: st }, sans));
    await flush();
    root.querySelector('[data-action="oublier-brouillon"]').dispatchEvent('click');
    await flush();
    assert.equal(st.m.size, 0);
    assert.ok(!/fr-brouillon/.test(root.innerHTML));
    assert.ok(!/value="Alice"/.test(root.innerHTML));
  });

  it('tant que la proposition attend, ce qu\'on tape ne l\'ecrase pas', async () => {
    const st = stockage();
    const cle = Engine.cleBrouillon(def());
    st.setItem(cle, JSON.stringify({ valeurs: { Nom: 'Alice' }, etape: 0, date: Date.now() }));
    const root = createRoot();
    Engine.mount(root, def(), Object.assign({ brouillon: st }, sans));
    await flush();
    root.querySelector('[name="Nom"]').value = 'Bob';
    root.querySelector('[name="Nom"]').dispatchEvent('change');
    await flush();
    assert.equal(JSON.parse(st.m.get(cle)).valeurs.Nom, 'Alice');
  });

  it('un brouillon trop ancien ou illisible est ignore', async () => {
    const st = stockage();
    const cle = Engine.cleBrouillon(def());
    st.setItem(cle, JSON.stringify({ valeurs: { Nom: 'Alice' }, etape: 0, date: Date.now() - 13 * 3600 * 1000 }));
    const a = createRoot();
    Engine.mount(a, def(), Object.assign({ brouillon: st }, sans));
    await flush();
    assert.ok(!/fr-brouillon/.test(a.innerHTML));
    st.setItem(cle, '{pas du json');
    const b = createRoot();
    Engine.mount(b, def(), Object.assign({ brouillon: st }, sans));
    await flush();
    assert.ok(!/fr-brouillon/.test(b.innerHTML));
  });

  it('l\'envoi reussi efface le brouillon', async () => {
    const st = stockage();
    const root = createRoot();
    Engine.mount(root, def({ sections: [def().sections[0]] }), Object.assign({ brouillon: st }, sans));
    await flush();
    root.querySelector('[name="Nom"]').value = 'Alice';
    root.querySelector('[name="Nom"]').dispatchEvent('change');
    await flush();
    assert.equal(st.m.size, 1);
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush(); await flush();
    assert.match(root.innerHTML, /fr-form__success/);
    assert.equal(st.m.size, 0);
  });

  it('en modification d\'une ligne, aucun brouillon', async () => {
    const st = stockage();
    const root = createRoot();
    Engine.mount(root, def(), Object.assign({ brouillon: st, editRowId: 3 }, sans));
    await flush();
    root.querySelector('[name="Nom"]').value = 'Alice';
    root.querySelector('[name="Nom"]').dispatchEvent('change');
    await flush();
    assert.equal(st.m.size, 0);
  });

  it('une question verrouillee par l\'adresse n\'est pas reprise du brouillon', async () => {
    const st = stockage();
    st.setItem(Engine.cleBrouillon(def()), JSON.stringify({ valeurs: { Nom: 'Pirate', Mot: 'ok' }, etape: 0, date: Date.now() }));
    const root = createRoot();
    Engine.mount(root, def(), Object.assign({ brouillon: st, values: { Nom: 'Officiel' }, verrouilles: ['Nom'] }, sans));
    await flush();
    root.querySelector('[data-action="reprendre-brouillon"]').dispatchEvent('click');
    await flush();
    assert.ok(!/Pirate/.test(root.innerHTML));
  });
});

describe('Brouillon : les hotes qui publient le demandent', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  it('le runtime publie et la page externe passent brouillon: true', () => {
    const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.match(lire('shared/publish.js'), /brouillon: true/);
    assert.match(lire('shared/externe.js'), /brouillon: true/);
  });
});

'use strict';

/*
 * Revue du 31/10/2026 : ce qu'un lecteur d'écran et un clavier trouvent dans le rendu, et ce qu'un réglage mal
 * saisi ne doit jamais faire écrire dans la page.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Engine = require('../runtime/engine.js');
const { createRoot } = require('./helpers/fake-dom.js');

const flush = () => new Promise((resolve) => setTimeout(() => setImmediate(resolve), 2));

describe('Matrice d\'échelles : un groupe nommé par ligne', () => {
  const def = {
    id: 'f', title: 'F', tableId: 'T', choices: {},
    echelles: { e: { min: 1, max: 5, libelles: ['Pas du tout d\'accord', 'Tout à fait d\'accord'] } },
    matrices: { m: { titre: 'Comment jugez-vous la place ?' } },
    sections: [{ id: 's', label: 'S', gate: null, fields: [
      { colId: 'A', label: 'La place est agréable', type: 'Int', widget: 'echelle', required: true, options: { echelle: 'e', matrice: 'm' } },
      { colId: 'B', label: 'On y trouve de l\'ombre', type: 'Int', widget: 'echelle', required: true, options: { echelle: 'e', matrice: 'm' } }
    ] }]
  };

  it('chaque ligne est un groupe nommé par son affirmation et décrit par les ancres de l\'échelle', async () => {
    const root = createRoot();
    Engine.mount(root, def, { submit: () => Promise.resolve([[1]]) });
    await flush();
    const html = root.innerHTML;
    assert.equal((html.match(/role="radiogroup"/g) || []).length, 2, 'un groupe par ligne');
    assert.match(html, /aria-labelledby="field-A-intitule"/);
    assert.match(html, /id="field-A-intitule"/);
    assert.match(html, /aria-describedby="ancres-m"/);
    assert.match(html, /id="ancres-m"/);
  });

  it('une ligne en erreur est signalée sur le groupe et reliée à son message', async () => {
    const root = createRoot();
    Engine.mount(root, def, { submit: () => Promise.resolve([[1]]) });
    await flush();
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush();
    assert.match(root.innerHTML, /role="radiogroup"[^>]*aria-describedby="ancres-m [^"]+"[^>]*aria-invalid="true"/);
  });
});

describe('Un réglage mal saisi n\'écrit rien dans la page', () => {
  const avec = (options, widget, type) => ({
    id: 'f', title: 'F', tableId: 'T', choices: { C: ['a', 'b', 'c'] },
    sections: [{ id: 's', label: 'S', gate: null, fields: [
      { colId: 'Q', label: 'Q', type: type || 'Attachments', widget: widget || 'file', options: options }
    ] }]
  });

  it('maxFiles : un texte n\'est jamais écrit tel quel', async () => {
    const root = createRoot();
    Engine.mount(root, avec({ maxFiles: '<img src=x onerror=alert(1)>' }), { submit: () => Promise.resolve([[1]]) });
    await flush();
    assert.ok(!/<img src=x/.test(root.innerHTML));
    assert.match(root.innerHTML, /Jusqu.{1,3}à 5 fichier/);
  });

  it('maxSelected : un texte n\'entre pas dans data-max', async () => {
    const root = createRoot();
    Engine.mount(root, avec({ maxSelected: '3" onclick="alert(1)' }, 'checkbox-list', 'ChoiceList'), { submit: () => Promise.resolve([[1]]) });
    await flush();
    assert.ok(!/onclick="alert/.test(root.innerHTML));
  });

  it('une échelle démesurée est plafonnée', () => {
    const e = Engine.echelleDe ? Engine.echelleDe({ echelles: { x: { min: 1, max: 1000000000 } } }, { options: { echelle: 'x' } }) : null;
    if (e) assert.ok(e.max - e.min <= 50);
  });
});

describe('Audit UX du 31/10/2026 : textes et progression', () => {
  const NB = String.fromCharCode(160);

  it('une seule étape : ni « Étape 1 sur 1 » ni « 100 % » avant d\'avoir répondu', async () => {
    const root = createRoot();
    Engine.mount(root, {
      id: 'f', title: 'F', tableId: 'T', choices: {},
      sections: [{ id: 's', label: 'Vos coordonnées', gate: null, fields: [{ colId: 'N', label: 'Nom', type: 'Text', widget: 'text', required: false }] }]
    }, { submit: () => Promise.resolve([[1]]) });
    await flush();
    assert.ok(!/Étape 1 sur 1/.test(root.innerHTML));
    assert.ok(!/100 %/.test(root.innerHTML));
    assert.match(root.innerHTML, /Vos coordonnées/, 'le titre de l\'étape reste');
  });

  it('plusieurs étapes : la progression est là', async () => {
    const root = createRoot();
    Engine.mount(root, {
      id: 'f', title: 'F', tableId: 'T', choices: {},
      sections: [
        { id: 's1', label: 'Un', gate: null, fields: [{ colId: 'N', label: 'Nom', type: 'Text', widget: 'text', required: false }] },
        { id: 's2', label: 'Deux', gate: null, fields: [{ colId: 'M', label: 'Mail', type: 'Text', widget: 'text', required: false }] }
      ]
    }, { submit: () => Promise.resolve([[1]]) });
    await flush();
    assert.match(root.innerHTML, /Étape 1 sur 2/);
  });

  it('la durée s\'accorde : « 1 minute », « 8 minutes »', () => {
    const un = Engine.renderAccueilHtml({ id: 'f', title: 'F', accueil: { dureeMinutes: 1 } });
    const huit = Engine.renderAccueilHtml({ id: 'f', title: 'F', accueil: { dureeMinutes: 8 } });
    assert.match(un, /Environ 1 minute\./);
    assert.ok(!/1 minutes/.test(un));
    assert.match(huit, /Environ 8 minutes\./);
  });
});

describe('Ecran de fin : une confirmation qui se lit et qui propose la suite', () => {
  const def = {
    id: 'f', title: 'Releve', tableId: 'T', choices: {}, successMessage: 'Merci pour votre aide !',
    sections: [{ id: 's', label: 'S', gate: null, fields: [{ colId: 'N', label: 'Nom', type: 'Text', widget: 'text', required: false }] }]
  };

  it('un titre dit que la reponse est enregistree, le message de l\'auteur vient dessous', () => {
    const html = Engine.renderSuccessHtml(def, {});
    assert.match(html, /<h2[^>]*>Votre r\u00e9ponse est enregistr\u00e9e<\/h2>/);
    assert.ok(html.includes('Merci pour votre aide !'));
    assert.ok(!/data-action="recommencer"/.test(html), 'pas de bouton sans demande');
  });

  it('sans message de l\'auteur, une phrase simple', () => {
    const html = Engine.renderSuccessHtml(Object.assign({}, def, { successMessage: '' }), {});
    assert.ok(html.includes('Merci, votre r\u00e9ponse a bien \u00e9t\u00e9 envoy\u00e9e.'));
  });

  it('la date de reception se dit en toutes lettres', () => {
    const html = Engine.renderSuccessHtml(def, { quand: new Date(2026, 9, 31, 14, 5) });
    assert.ok(html.includes('Re\u00e7ue le 31 octobre 2026 \u00e0 14 h 05.'));
    const premier = Engine.renderSuccessHtml(def, { quand: new Date(2026, 10, 1, 9, 30) });
    assert.ok(premier.includes('1er novembre 2026 \u00e0 9 h 30'));
  });

  it('une reponse en file est dite gardee sur l\'appareil, pas enregistree', () => {
    const html = Engine.renderSuccessHtml(def, { enfile: true, quand: new Date(2026, 9, 31, 14, 5) });
    assert.ok(html.includes('Votre r\u00e9ponse est gard\u00e9e sur cet appareil'));
    assert.ok(!html.includes('Votre r\u00e9ponse est enregistr\u00e9e<'));
    assert.ok(html.includes('Remplie le 31 octobre'));
  });

  it('« Remplir une autre reponse » remet un formulaire neuf, vide', async () => {
    const root = createRoot();
    Engine.mount(root, def, { submit: () => Promise.resolve([[1]]) });
    await flush();
    root.querySelector('[name="N"]').value = 'Alice';
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush(); await flush();
    assert.match(root.innerHTML, /data-action="recommencer"/);
    root.querySelector('[data-action="recommencer"]').dispatchEvent('click');
    await flush();
    const champ = root.querySelector('[name="N"]');
    assert.ok(champ, 'le formulaire est revenu');
    assert.ok(!/value="Alice"/.test(root.innerHTML), 'rien de la reponse precedente');
  });

  it('pas de seconde reponse quand une seule est permise, ni en modification', async () => {
    const unique = Object.assign({}, def, { limites: { unique: ['N'] } });
    const root = createRoot();
    Engine.mount(root, unique, { submit: () => Promise.resolve([[1]]) });
    await flush();
    root.querySelector('[name="N"]').value = 'Alice';
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush(); await flush();
    assert.ok(!/data-action="recommencer"/.test(root.innerHTML));
    const modif = createRoot();
    Engine.mount(modif, def, { editRowId: 4, submit: () => Promise.resolve([[4]]) });
    await flush();
    modif.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush(); await flush();
    assert.ok(!/data-action="recommencer"/.test(modif.innerHTML));
  });
});

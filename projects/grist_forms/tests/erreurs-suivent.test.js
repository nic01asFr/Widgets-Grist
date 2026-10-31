'use strict';

/*
 * Une erreur affichée suit ce que la personne en fait. Constaté en Grist réel (24/10/2026) : après un premier
 * « Suivant » refusé, « Ce champ est obligatoire » restait sous un champ rempli, et le récapitulatif aussi,
 * jusqu'au clic suivant. Un message périmé fait douter de ce qu'on vient de taper.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../runtime/engine.js');
const { createRoot } = require('./helpers/fake-dom.js');

const flush = () => new Promise((resolve) => setTimeout(() => setImmediate(resolve), 2));

const formDef = {
  id: 'f', title: 'F', tableId: 'T', choices: {},
  sections: [{ id: 's1', label: 'S', gate: null, fields: [
    { colId: 'Nom', label: 'Nom', type: 'Text', widget: 'text', required: true },
    { colId: 'Courriel', label: 'Courriel', type: 'Text', widget: 'text', required: true, options: { validation: { format: 'courriel' } } },
    { colId: 'Note', label: 'Note', type: 'Text', widget: 'text', required: true }
  ] }]
};

const monter = async () => {
  const root = createRoot();
  Engine.mount(root, formDef, { submit: () => Promise.resolve({ ok: true }) });
  await flush();
  return root;
};
const saisir = async (root, nom, valeur) => {
  const champ = root.querySelector('[name="' + nom + '"]');
  champ.value = valeur;
  champ.dispatchEvent('change');
  await flush();
};

describe('Les erreurs affichées suivent les corrections', () => {
  it('un champ corrigé perd son message, les autres gardent le leur', async () => {
    const root = await monter();
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush();
    assert.match(root.innerHTML, /3 questions sont à corriger/);
    await saisir(root, 'Nom', 'Dupont');
    assert.ok(!/data-error-for="Nom"/.test(root.innerHTML), 'Nom est rempli : plus de message');
    assert.match(root.innerHTML, /data-error-for="Courriel"/);
    assert.match(root.innerHTML, /data-error-for="Note"/);
    assert.match(root.innerHTML, /2 questions sont à corriger/, 'le récapitulatif se met à jour');
  });

  it('le message dit ce qui est faux maintenant : « obligatoire » devient « pas un courriel »', async () => {
    const root = await monter();
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush();
    await saisir(root, 'Courriel', 'pas-un-courriel');
    assert.match(root.innerHTML, /Ce n.est pas une adresse de courriel/);
    assert.ok(!/data-error-for="Courriel"[^>]*>Ce champ est obligatoire/.test(root.innerHTML), 'plus « obligatoire » sous un champ rempli');
  });

  it('tout corrigé : plus de récapitulatif', async () => {
    const root = await monter();
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush();
    await saisir(root, 'Nom', 'Dupont');
    await saisir(root, 'Courriel', 'a@b.fr');
    await saisir(root, 'Note', 'ok');
    assert.ok(!/à corriger/.test(root.innerHTML));
    assert.ok(!/data-error-for/.test(root.innerHTML));
  });

  it('on n\'accuse pas un champ qu\'on n\'a pas encore demandé : rien avant le premier « Envoyer »', async () => {
    const root = await monter();
    await saisir(root, 'Nom', '');
    assert.ok(!/data-error-for/.test(root.innerHTML));
    assert.ok(!/à corriger/.test(root.innerHTML));
  });
});

describe('Le bandeau d\'actions (feuille de style)', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'shared', 'dsfr-like.css'), 'utf8');
  /** Le contenu de la première règle dont le sélecteur est exactement `sel`. */
  const regle = (sel) => {
    const d = css.indexOf(sel + ' {');
    if (d === -1) return '';
    return css.slice(css.indexOf('{', d) + 1, css.indexOf('}', d));
  };

  it('est opaque sur toute sa largeur : le texte de la question suivante ne se lit pas entre les boutons', () => {
    const r = regle('.fr-form__actions');
    assert.match(r, /background:\s*var\(--kit-fond/);
    assert.ok(!/linear-gradient/.test(r), 'pas de dégradé transparent dans la barre elle-même');
  });

  it('a son fondu au-dessus de lui, qui ne capte aucun clic', () => {
    const r = regle('.fr-form__actions::before');
    assert.match(r, /bottom:\s*100%/);
    assert.match(r, /pointer-events:\s*none/);
  });

  it('laisse de la marge au défilement : un champ atteint au clavier ne passe pas dessous', () => {
    assert.match(css, /scroll-padding-bottom:\s*6rem/);
    assert.match(css, /scroll-margin-bottom:\s*6rem/);
  });
});

describe('Le focus d\'une carte de choix', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'shared', 'dsfr-like.css'), 'utf8');
  it('un seul anneau, dans la carte : il n\'est pas rogné sur les bords et le rond natif n\'en ajoute pas un second', () => {
    assert.match(css, /\.fr-form \.fr-radio-group:focus-within[^{]*\{[^}]*outline-offset:\s*-2px/);
    assert.match(css, /\.fr-radio-group input:focus-visible[^{]*\{\s*outline:\s*none/);
  });
});

describe('Obligatoire : des espaces ne sont pas une réponse', () => {
  it('« Nom » obligatoire refuse « ␣␣␣ »', async () => {
    const root = createRoot();
    let envoyes = 0;
    Engine.mount(root, formDef, { submit: () => { envoyes++; return Promise.resolve([[1]]); } });
    await flush();
    await saisir(root, 'Nom', '   ');
    await saisir(root, 'Courriel', 'a@b.fr');
    await saisir(root, 'Note', 'ok');
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush(); await flush();
    assert.equal(envoyes, 0);
    assert.match(root.innerHTML, /data-error-for="Nom"/);
  });
});

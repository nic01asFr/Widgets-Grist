'use strict';

/*
 * Finition : clavier du téléphone, erreurs lisibles par les technologies d'assistance.
 * Les contrastes du mode sombre se mesurent dans un navigateur (docs/ECRANS.md, AUDIT-UX.md).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Saisies = require('../shared/saisies.js');
const Formats = require('../shared/formats.js');
const Engine = require('../runtime/engine.js');
const { createRoot } = require('./helpers/fake-dom.js');

const def = (champs) => ({ id: 'essai', title: 'Essai', tableId: 'T', sections: [{ label: 'S', fields: champs }] });

describe('Clavier du téléphone — la règle', () => {
  it('un format dit son clavier : courriel, téléphone, code postal', () => {
    assert.deepEqual(Saisies.clavierDe({ type: 'Text' }, 'courriel'), { inputmode: 'email', autocomplete: 'email' });
    assert.deepEqual(Saisies.clavierDe({ type: 'Text' }, 'telephone'), { inputmode: 'tel', autocomplete: 'tel' });
    assert.deepEqual(Saisies.clavierDe({ type: 'Text' }, 'codePostal'), { inputmode: 'numeric', autocomplete: 'postal-code' });
  });

  it('un nombre entier ouvre le pavé numérique, un décimal le pavé à virgule', () => {
    assert.equal(Saisies.clavierDe({ type: 'Int' }, null).inputmode, 'numeric');
    assert.equal(Saisies.clavierDe({ type: 'Numeric' }, null).inputmode, 'decimal');
  });

  it('un nombre qui peut être négatif garde le clavier complet : le pavé n\'a pas toujours le signe moins', () => {
    assert.deepEqual(Saisies.clavierDe({ type: 'Numeric', options: { min: -10 } }, null), {});
    assert.equal(Saisies.clavierDe({ type: 'Int', options: { min: 0 } }, null).inputmode, 'numeric');
  });

  it('un texte ordinaire n\'impose rien', () => {
    assert.deepEqual(Saisies.clavierDe({ type: 'Text' }, null), {});
  });

  it('la question peut dire son clavier, et sa parole l\'emporte', () => {
    const c = Saisies.clavierDe({ type: 'Text', options: { clavier: { inputmode: 'url', autocomplete: 'url' } } }, 'courriel');
    assert.deepEqual(c, { inputmode: 'url', autocomplete: 'url' });
  });

  it('un clavier inconnu ou piégé est ignoré : il finit dans un attribut HTML', () => {
    const c = Saisies.clavierDe({ type: 'Text', options: { clavier: { inputmode: 'x" onfocus="alert(1)', autocomplete: 'a" onfocus="b' } } }, null);
    assert.deepEqual(c, {});
    assert.equal(Saisies.attributsClavier({ type: 'Text', options: { clavier: { inputmode: '"><script>' } } }, null), '');
  });
});

describe('Clavier du téléphone — dans le moteur', () => {
  const texte = (extra) => Object.assign({ colId: 'C', label: 'Courriel', type: 'Text', widget: 'text' }, extra);

  it('une question au format courriel ouvre le clavier du courriel, sans changer de type', () => {
    const html = Engine.renderFieldHtml(texte({ options: { validation: { format: 'courriel' } } }), {}, null, def([]));
    assert.match(html, /type="text"/);
    assert.match(html, /inputmode="email"/);
    assert.match(html, /autocomplete="email"/);
  });

  it('un nombre décimal ouvre le pavé à virgule', () => {
    const html = Engine.renderFieldHtml({ colId: 'N', label: 'N', type: 'Numeric', widget: 'number' }, {}, null, def([]));
    assert.match(html, /type="number"/);
    assert.match(html, /inputmode="decimal"/);
  });

  it('un paragraphe n\'a pas de clavier imposé', () => {
    const html = Engine.renderFieldHtml(texte({ widget: 'textarea' }), {}, null, def([]));
    assert.ok(!/inputmode/.test(html));
  });

  it('un texte sans format n\'a ni inputmode ni autocomplete', () => {
    const html = Engine.renderFieldHtml(texte(), {}, null, def([]));
    assert.ok(!/inputmode|autocomplete/.test(html));
  });
});

describe('Erreurs — lisibles par les technologies d\'assistance', () => {
  function monter(champs) {
    const root = createRoot();
    Engine.mount(root, def(champs), { skipProbe: true, submit: () => Promise.resolve({ ok: true }) });
    return root;
  }
  async function envoyer(root) {
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await new Promise((r) => setTimeout(r, 10));
  }

  it('une question en défaut est marquée invalide et reliée à son message', async () => {
    const root = monter([{ colId: 'Nom', label: 'Nom', type: 'Text', widget: 'text', required: true }]);
    await envoyer(root);
    const html = root.innerHTML;
    assert.match(html, /<input[^>]*aria-invalid="true"[^>]*aria-describedby="erreur-Nom"/);
    assert.match(html, /<p class="fr-error-text" id="erreur-Nom"/);
  });

  it('un groupe de choix porte l\'erreur sur son fieldset', async () => {
    const root = monter([{ colId: 'Lien', label: 'Lien', type: 'Choice', widget: 'radio', required: true, options: { choices: ['a', 'b'] } }]);
    await envoyer(root);
    assert.match(root.innerHTML, /<fieldset[^>]*aria-invalid="true"[^>]*aria-describedby="erreur-Lien"/);
  });

  it('un résumé annoncé liste les questions à corriger, avec un lien chacune', async () => {
    const root = monter([
      { colId: 'A', label: 'Première', type: 'Text', widget: 'text', required: true },
      { colId: 'B', label: 'Seconde', type: 'Text', widget: 'text', required: true }
    ]);
    await envoyer(root);
    const html = root.innerHTML;
    assert.match(html, /id="resume-erreurs"[^>]*role="alert"/);
    assert.match(html, /2 questions sont à corriger/);
    assert.match(html, /data-aller-a="A"[^>]*>Première</);
    assert.match(html, /data-aller-a="B"[^>]*>Seconde</);
  });

  it('une seule erreur se dit au singulier', async () => {
    const root = monter([
      { colId: 'A', label: 'Première', type: 'Text', widget: 'text', required: true },
      { colId: 'B', label: 'Seconde', type: 'Text', widget: 'text' }
    ]);
    await envoyer(root);
    assert.match(root.innerHTML, /Une question est à corriger/);
  });

  it('une question valide n\'est ni marquée ni résumée', async () => {
    const root = monter([{ colId: 'Nom', label: 'Nom', type: 'Text', widget: 'text' }]);
    await envoyer(root);
    assert.ok(!/aria-invalid|resume-erreurs/.test(root.innerHTML));
  });

  it('le nom d\'une colonne piégé ne sort pas de l\'attribut', async () => {
    const root = monter([{ colId: 'X', label: '<b>gras</b> & "guillemets"', type: 'Text', widget: 'text', required: true }]);
    await envoyer(root);
    const resume = /id="resume-erreurs"[\s\S]*?<\/div>/.exec(root.innerHTML)[0];
    assert.ok(!resume.includes('<b>'), resume);
  });
});

describe('Mode sombre — les couleurs de texte sont des variables', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'shared', 'dsfr-like.css'), 'utf8');

  it('le rouge d\'erreur, le texte des boutons et le fond des boutons secondaires se redéfinissent en sombre', () => {
    ['--error:', '--erreur-fond:', '--bouton-texte:', '--bouton-secondaire-fond:'].forEach((v) => {
      const n = css.split(v).length - 1;
      assert.ok(n >= 2, v + ' défini en sombre pour Grist et pour le système (' + n + ')');
    });
  });

  it('le texte d\'erreur sombre passe 4,5:1 sur le fond sombre du formulaire', () => {
    const lum = (hex) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    const erreur = /--error: (#[0-9a-f]{6});/.exec(css.slice(css.indexOf('Mode sombre : le texte')))[1];
    ['#1a1d1b', '#222624'].forEach((fond) => assert.ok(ratio(erreur, fond) >= 4.5, erreur + ' sur ' + fond + ' = ' + ratio(erreur, fond).toFixed(2)));
    const bouton = /--bouton-texte: (#[0-9a-f]{6});/.exec(css)[1];
    assert.ok(ratio(bouton, '#9aa2ff') >= 4.5, 'texte de bouton ' + ratio(bouton, '#9aa2ff').toFixed(2));
  });
});

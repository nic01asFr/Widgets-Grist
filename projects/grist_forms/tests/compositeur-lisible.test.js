'use strict';

/*
 * Le compositeur parle a des auteurs, pas a des developpeurs : ce que le panneau dit, et ce que le canevas suit.
 * Revue du 31/10/2026 (audit UX independant).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BUILDER = fs.readFileSync(path.join(__dirname, '..', 'builder.html'), 'utf8');

describe('Compositeur : un vocabulaire d\'auteur', () => {
  it('les controles de saisie se disent en francais, pas par leur identifiant', () => {
    assert.match(BUILDER, /const WIDGET_LABELS = \{/);
    assert.match(BUILDER, /esc\(WIDGET_LABELS\[w\] \|\| w\)/);
    assert.ok(!/>\$\{w\}<\/option>/.test(BUILDER), 'plus d\'identifiant brut dans la liste');
  });

  it('les conditions parlent de « reponse a regarder » et de « comparaison »', () => {
    assert.ok(BUILDER.includes("hintLabel('Réponse à regarder'"));
    assert.ok(BUILDER.includes("hintLabel('Comparaison'"));
    assert.ok(!BUILDER.includes("hintLabel('Opérateur'"));
    assert.ok(!BUILDER.includes("hintLabel('Source'"));
    assert.ok(BUILDER.includes('Une seule suffit'));
  });

  it('« Mettre en ligne » ne parle plus de bundle ni ne renvoie a un fichier du depot', () => {
    const brut = BUILDER.slice(BUILDER.indexOf('function renderPublishStep'), BUILDER.indexOf('function etatAcces'));
    // Les commentaires du code ne sont pas lus par l'auteur : seul le texte rendu compte.
    const etape = brut.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    assert.ok(!/bundle/i.test(etape));
    assert.ok(!/docs\/EXPOSITION\.md/.test(etape));
    assert.match(etape, /class="carte-publication"/);
    assert.equal((etape.match(/class="carte-publication"/g) || []).length, 3, 'trois cartes');
  });
});

describe('Compositeur : le canevas suit la frappe', () => {
  it('les options, le libelle et les reglages de champ redessinent le canevas', () => {
    assert.match(BUILDER, /function rafraichirCanevas\(\)/);
    for (const nom of ['onFieldInput', 'onFieldOption', 'onFieldChoices']) {
      const debut = BUILDER.indexOf('function ' + nom + '(');
      assert.ok(debut > 0, nom);
      const corps = BUILDER.slice(debut, BUILDER.indexOf('\n}', debut) + 2);
      assert.ok(corps.includes('rafraichirCanevas()'), nom + ' doit rafraichir le canevas');
    }
  });

  it('jamais pendant qu\'on tape dans le canevas lui-meme', () => {
    const debut = BUILDER.indexOf('function rafraichirCanevas()');
    const corps = BUILDER.slice(debut, BUILDER.indexOf('\n}', debut));
    assert.ok(corps.includes('canevas.contains(document.activeElement)'));
  });
});

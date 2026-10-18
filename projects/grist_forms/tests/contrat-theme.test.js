'use strict';

/*
 * Le contrat de thème, de bout en bout : la liste du module, le document, la feuille de style.
 * Les trois disent les mêmes vingt-six variables ; la personne passe avant le thème.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Theme = require('../shared/theme.js');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'shared', 'dsfr-like.css'), 'utf8').replace(/\r\n/g, '\n');
const DOC = fs.readFileSync(path.join(__dirname, '..', 'docs', 'THEME-KIT.md'), 'utf8');

function documentees() {
  const noms = new Set();
  DOC.split('\n').filter((l) => /^\|\s*`--kit-/.test(l)).forEach((l) => {
    (l.split('|')[1].match(/--kit-[a-z0-9-]+/g) || []).forEach((v) => noms.add(v));
  });
  return noms;
}

describe('Contrat de thème — une seule liste', () => {
  const attendues = new Set(Theme.CLES.map((c) => '--kit-' + c));

  it('le document décrit exactement les variables que le module accepte', () => {
    const d = documentees();
    assert.deepEqual([...attendues].filter((v) => !d.has(v)), [], 'acceptées mais non décrites');
    assert.deepEqual([...d].filter((v) => !attendues.has(v)), [], 'décrites mais refusées par le module');
    assert.equal(d.size, 26);
  });

  it('la feuille n\'emploie aucune variable que le module refuserait', () => {
    const utilisees = new Set((CSS.match(/var\(--kit-[a-z0-9-]+/g) || []).map((s) => s.slice(4)));
    assert.deepEqual([...utilisees].filter((v) => !attendues.has(v)), []);
  });

  it('les variables retirées du premier contrat ne sont plus employées', () => {
    assert.ok(!/--kit-accent-survol|--kit-accent-actif/.test(CSS));
    assert.ok(!/--kit-accent-survol|--kit-accent-actif/.test(DOC.replace(/`--kit-accent-survol` et `--kit-accent-actif` du premier contrat n'existent plus/, '')));
  });
});

describe('Contrat de thème — la famille d\'action et le bord de champ', () => {
  it('le bouton principal prend la famille d\'action, du fond au pressé', () => {
    const regle = (re) => (re.exec(CSS) || [])[0] || '';
    const base = regle(/\n\.fr-btn \{[^}]*\}/);
    assert.match(base, /background: var\(--kit-action, /);
    assert.match(base, /border: 1px solid var\(--kit-action, /);
    assert.match(base, /color: var\(--kit-action-texte, /);
    assert.match(CSS, /\.fr-btn:hover \{[^}]*--kit-action-survol/);
    assert.match(CSS, /\.fr-btn:active \{[^}]*--kit-action-actif/);
  });

  it('le survol et le fond du bouton viennent de la même famille : jamais un fond d\'identité sous un survol d\'action', () => {
    const base = (/\n\.fr-btn \{[^}]*\}/.exec(CSS) || [''])[0];
    assert.ok(!/--kit-accent/.test(base), 'le bouton principal ne lit pas l\'accent');
  });

  it('un champ prend son bord propre, qui retombe sur le bord décoratif puis sur le rendu d\'origine', () => {
    assert.match(CSS, /border: 1px solid var\(--kit-bord-champ, var\(--kit-bord, var\(--grey-900\)\)\);/);
  });
});

describe('Contrat de thème — la personne passe avant le thème', () => {
  it('contraste forcé : couleurs système, et ce que la couleur disait est gardé par un contour ou un remplissage', () => {
    const m = /@media \(forced-colors: active\) \{([\s\S]*?)\n\}/.exec(CSS);
    assert.ok(m, 'bloc forced-colors');
    const b = m[1];
    assert.match(b, /ButtonText/);
    assert.match(b, /FieldText/);
    assert.match(b, /:focus-visible \{ outline: 3px solid Highlight/);
    assert.match(b, /fr-radio-rich:has\(input:checked\)/, 'le choix coché se distingue');
    assert.match(b, /fr-lieu__onglet\[aria-pressed="true"\] \{ background: Highlight/, 'l\'onglet actif se distingue');
    assert.match(b, /fr-progression__piste span \{ background: Highlight/, 'la progression se voit');
    assert.match(b, /fr-champ--erreur \{ border-left: 4px solid CanvasText/, 'une erreur n\'est pas qu\'une couleur');
  });

  it('contraste renforcé : bords à 2 px de la couleur du texte, focus plus épais', () => {
    const m = /@media \(prefers-contrast: more\) \{([\s\S]*?)\n\}/.exec(CSS);
    assert.ok(m, 'bloc prefers-contrast');
    assert.match(m[1], /border-width: 2px; border-color: currentColor/);
    assert.match(m[1], /outline-width: 3px/);
  });

  it('aucune de ces règles n\'emploie une couleur littérale : ce sont des couleurs système', () => {
    const blocs = ['forced-colors: active', 'prefers-contrast: more'].map((q) => new RegExp('@media \\(' + q + '\\) \\{([\\s\\S]*?)\\n\\}').exec(CSS)[1]).join('\n');
    assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(blocs));
  });
});

'use strict';

/**
 * Le lecteur de thème de Grist a besoin de DEUX copies du kit (le contrat de l'instance et la dérivation) : sans elles, il ne pose aucun thème de Grist, sans rien dire.
 * Ces tests gardent que le compositeur les charge et les embarque avec un formulaire publié, dans l'ordre, et que le paquet fonctionne vraiment dans une page sans Node.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RACINE = path.join(__dirname, '..');
const BUILDER = fs.readFileSync(path.join(RACINE, 'builder.html'), 'utf8');
const lire = (f) => fs.readFileSync(path.join(RACINE, 'shared', f), 'utf8');

describe('Thème de Grist : les copies du kit accompagnent le lecteur', () => {
  it('le compositeur charge le contrat et la dérivation AVANT le lecteur', () => {
    const i = BUILDER.indexOf('<script src="shared/theme-instance.js"></script>');
    const d = BUILDER.indexOf('<script src="shared/derivation-valeurs.js"></script>');
    const t = BUILDER.indexOf('<script src="shared/themedef.js"></script>');
    assert.ok(i > -1 && d > i && t > d);
  });

  it('un formulaire publié embarque le paquet complet, jamais le lecteur seul', () => {
    assert.equal((BUILDER.match(/fetchScriptSource\('shared\/themedef\.js'\)/g) || []).length, 1, 'seul le paquet lit le fichier du lecteur');
    assert.equal((BUILDER.match(/fetchThemeDefBundle\(\)/g) || []).length, 3, 'définition + les deux endroits d\'empaquetage');
    const f = BUILDER.slice(BUILDER.indexOf('function fetchThemeDefBundle()'));
    assert.ok(f.indexOf("shared/theme-instance.js") < f.indexOf("shared/derivation-valeurs.js") && f.indexOf("shared/derivation-valeurs.js") < f.indexOf("shared/themedef.js"));
  });

  it('le paquet, évalué dans une page sans Node, pose un thème de Grist lisible', () => {
    const fenetre = { };
    fenetre.self = fenetre;
    const contexte = vm.createContext(Object.assign(fenetre, { console }));
    // Dans une page : dans l'ordre theme.js (dépendance), puis le paquet. `this` / `self` est la fenêtre ; `process` n'existe pas.
    vm.runInContext([lire('theme.js'), lire('theme-instance.js'), lire('derivation-valeurs.js'), lire('themedef.js')].join('\n'), contexte);
    assert.ok(fenetre.FormThemeInstance && fenetre.FormThemeDerivation && fenetre.FormThemeDef);
    const t = fenetre.FormThemeDef.themeHote({
      apparence: 'clair', nom: 'GristLight', couleurs: {},
      vars: { 'control-primary-bg': '#16b378', 'primary-muted': '#009058', 'primary-dim': '#007548', 'page-bg': '#f7f7f7', text: '#262633' }
    });
    assert.ok(t, 'un thème de Grist est posé');
    assert.equal(t.vars['--kit-accent'], '#007548');
  });

  it('sans les copies du kit, le lecteur ne pose rien (il ne se rabat jamais sur une dérivation maison)', () => {
    const fenetre = {};
    fenetre.self = fenetre;
    const contexte = vm.createContext(Object.assign(fenetre, { console }));
    vm.runInContext([lire('theme.js'), lire('themedef.js')].join('\n'), contexte);
    assert.equal(fenetre.FormThemeDef.themeHote({ apparence: 'clair', couleurs: { fond: '#3e5de7' } }), null);
  });
});

'use strict';

/*
 * Contrat `kit-theme/0.1` : ce qu'un hôte a le droit de poser comme thème.
 * Un thème est une donnée non fiable : liste fermée de 26 variables, valeurs d'une syntaxe sûre.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Theme = require('../shared/theme.js');
const Engine = require('../runtime/engine.js');
const { createRoot } = require('./helpers/fake-dom.js');

describe('Thème — la liste fermée', () => {
  it('vingt-six variables, sans doublon', () => {
    assert.equal(Theme.CLES.length, 26);
    assert.equal(new Set(Theme.CLES).size, 26);
  });

  it('une variable se nomme nue ou avec son préfixe ; tout autre nom est refusé', () => {
    assert.equal(Theme.nomDe('accent'), 'accent');
    assert.equal(Theme.nomDe('--kit-accent'), 'accent');
    assert.equal(Theme.nomDe('action-survol'), 'action-survol');
    ['--kit-inconnu', '--accent', '--c-identite-profonde', 'inconnu', '', 'accent-survol', 'accent-actif', '__proto__', 'constructor', 'toString']
      .forEach((n) => assert.equal(Theme.nomDe(n), null, n));
  });

  it('les deux variables de survol de l\'ancien contrat sont retirées : l\'action a son propre survol', () => {
    assert.ok(!Theme.CLES.includes('accent-survol'));
    assert.ok(!Theme.CLES.includes('accent-actif'));
    ['action', 'action-texte', 'action-survol', 'action-actif', 'bord-champ'].forEach((k) => assert.ok(Theme.CLES.includes(k), k));
  });
});

describe('Thème — les valeurs', () => {
  it('accepte les couleurs en syntaxe connue et les références sans repli', () => {
    ['#fff', '#FFFFFF', '#ffff', '#ffffff80', 'rgb(0, 0, 0)', 'rgba(0,0,0,0.35)', 'hsl(210 50% 40%)', 'rgb(0 0 0 / 50%)',
      'var(--c-identite-profonde)', 'var(--accent)', 'var(--_x-1)']
      .forEach((v) => assert.equal(Theme.valeurSure(v), true, v));
  });

  it('refuse ce qui n\'est pas une couleur sûre : adresses, expressions, replis, listes, noms de couleur', () => {
    ['url(https://x)', 'url(x)', 'var(--x, red)', 'var(--x, url(a))', 'var(--x,)', 'calc(1px)', 'color-mix(in srgb, red, blue)',
      'red', 'transparent', 'expression(alert(1))', 'javascript:alert(1)', '#12', '#ggg', '#fff;color:red', '#fff}', '#fff !important',
      '<b>', 'rgb(0,0,0);background:url(x)', 'var(--x', 'var(x)', 'var(--)', '', '   ', 12, true, null, undefined, {}, []]
      .forEach((v) => assert.equal(Theme.valeurSure(v), false, JSON.stringify(v)));
  });

  it('une valeur de plus de 48 caractères est refusée avant toute analyse', () => {
    assert.equal(Theme.valeurSure('#' + 'a'.repeat(47)), false);
    assert.equal(Theme.valeurSure('var(--' + 'a'.repeat(64) + ')'), false);
    assert.equal(Theme.valeurSure('var(--' + 'a'.repeat(40) + ')'), true);
  });
});

describe('Thème — le jugement', () => {
  it('retient les variables valides sous leur nom complet, nues ou préfixées', () => {
    const r = Theme.valider({ accent: '#7a4b00', '--kit-fond': '#fff8ee', 'action-texte': 'var(--c-fond-surface)' });
    assert.deepEqual(r.applique, { '--kit-accent': '#7a4b00', '--kit-fond': '#fff8ee', '--kit-action-texte': 'var(--c-fond-surface)' });
    assert.deepEqual(r.ignore, []);
    assert.equal(r.version, 'kit-theme/0.1');
  });

  it('écarte et dit : clé inconnue, valeur invalide, valeur trop longue', () => {
    const r = Theme.valider({ accent: 'url(x)', fond: '#fff', inconnue: '#000', texte: '#' + 'a'.repeat(60) });
    assert.deepEqual(Object.keys(r.applique), ['--kit-fond']);
    const codes = r.ignore.map((i) => i.cle + ':' + i.code).sort();
    assert.deepEqual(codes, ['accent:valeur-invalide', 'inconnue:cle-inconnue', 'texte:valeur-trop-longue']);
  });

  it('une valeur absente, vide ou nulle n\'est ni retenue ni dite', () => {
    const r = Theme.valider({ accent: '', fond: null, texte: undefined });
    assert.deepEqual(r.applique, {});
    assert.deepEqual(r.ignore, []);
  });

  it('une même variable nommée deux fois : la première gagne, la seconde est dite', () => {
    const r = Theme.valider({ accent: '#111111', '--kit-accent': '#222222' });
    assert.equal(r.applique['--kit-accent'], '#111111');
    assert.deepEqual(r.ignore.map((i) => i.code), ['doublon']);
  });

  it('dit que le contraste n\'est pas vérifié dès qu\'une valeur est posée, et seulement alors', () => {
    assert.deepEqual(Theme.valider({ accent: '#000' }).avertissements.map((a) => a.code), ['non-verifie']);
    assert.deepEqual(Theme.valider({ accent: 'url(x)' }).avertissements, []);
    assert.deepEqual(Theme.valider({}).avertissements, []);
    assert.deepEqual(Theme.valider(null).avertissements, []);
  });

  it('ce qui n\'est pas un objet est écarté avec un avertissement, sans lever d\'erreur', () => {
    ['texte', 12, [], [1, 2]].forEach((t) => {
      const r = Theme.valider(t);
      assert.deepEqual(r.applique, {});
      assert.deepEqual(r.avertissements.map((a) => a.code), ['theme-invalide']);
    });
  });

  it('une clé « __proto__ » venue d\'un JSON ne pollue rien et reste une clé inconnue', () => {
    const r = Theme.valider(JSON.parse('{"__proto__": "#fff", "constructor": "#000", "accent": "#123456"}'));
    assert.deepEqual(Object.keys(r.applique), ['--kit-accent']);
    assert.deepEqual(r.ignore.map((i) => i.code).sort(), ['cle-inconnue', 'cle-inconnue']);
    assert.equal({}.polluee, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'accent'), false);
  });

  it('un thème démesuré est borné : 200 clés examinées au plus, le reste est dit', () => {
    const gros = {};
    for (let i = 0; i < 500; i++) gros['x' + i] = '#fff';
    gros.accent = '#fff';
    const r = Theme.valider(gros);
    assert.ok(r.ignore.some((i) => i.code === 'trop-de-cles'));
    assert.ok(r.ignore.length <= 201);
  });

  it('le jugement ne contient que des chaînes : aucune valeur ne sort telle qu\'elle est entrée si elle est piégée', () => {
    const r = Theme.valider({ accent: '"><script>alert(1)</script>' });
    assert.deepEqual(r.applique, {});
    assert.ok(r.ignore[0].valeur.length <= 24);
  });
});

describe('Thème — dans monter', () => {
  const formdef = () => ({ id: 'x', title: 'X', tableId: 'T', sections: [{ label: 'S', fields: [{ colId: 'A', label: 'A', type: 'Text', widget: 'text' }] }] });
  const client = () => ({
    lireTable: () => Promise.resolve({ id: [], A: [] }),
    appliquer: () => Promise.resolve([])
  });

  it('ne pose que ce que le contrat autorise, et rend le jugement', () => {
    const root = createRoot();
    const m = Engine.monter(root, formdef(), {
      client: client(),
      theme: { accent: '#7a4b00', fond: 'url(https://x)', '--autre': '#000', texte: 'var(--c-texte-corps)' }
    });
    assert.equal(root.style.getPropertyValue('--kit-accent'), '#7a4b00');
    assert.equal(root.style.getPropertyValue('--kit-texte'), 'var(--c-texte-corps)');
    assert.equal(root.style.getPropertyValue('--kit-fond'), '', 'url() refusé');
    assert.equal(root.style.getPropertyValue('--autre'), '', 'une variable hors contrat n\'est pas posée');
    assert.deepEqual(Object.keys(m.theme.applique).sort(), ['--kit-accent', '--kit-texte']);
    assert.deepEqual(m.theme.ignore.map((i) => i.code).sort(), ['cle-inconnue', 'valeur-invalide']);
    m.demonter();
    assert.equal(root.style.getPropertyValue('--kit-accent'), '', 'retiré au démontage');
  });

  it('sans thème, le jugement est vide et le conteneur n\'est pas touché', () => {
    const root = createRoot();
    const m = Engine.monter(root, formdef(), { client: client() });
    assert.deepEqual(m.theme.applique, {});
    assert.deepEqual(root.style.props, {});
    m.demonter();
  });

  it('une valeur de la liste blanche en rgb() ou hsl() est posée', () => {
    const root = createRoot();
    const m = Engine.monter(root, formdef(), { client: client(), theme: { ombre: 'rgba(0, 0, 0, 0.35)', focus: 'hsl(210 80% 40%)' } });
    assert.equal(root.style.getPropertyValue('--kit-ombre'), 'rgba(0, 0, 0, 0.35)');
    assert.equal(root.style.getPropertyValue('--kit-focus'), 'hsl(210 80% 40%)');
    m.demonter();
  });
});

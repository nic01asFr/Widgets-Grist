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

describe('Compositeur : l\'apparence d\'un formulaire', () => {
  it('trois choix, un thème déposé ou collé, des phrases pour chaque défaut', () => {
    assert.match(BUILDER, /function renderApparence\(def\)/);
    for (const mode of ['document', 'formulaire', 'aucune']) assert.ok(BUILDER.includes("choix('" + mode + "'"), mode);
    for (const geste of ['onApparenceMode', 'onApparenceTexte', 'onApparenceFichier']) {
      assert.ok(BUILDER.includes('function ' + geste + '('), geste);
      assert.match(BUILDER, new RegExp('window\\.App = \\{[\\s\\S]*' + geste));
    }
    for (const code of ['trop-gros', 'json', 'version', 'principal', 'explicite-incomplet', 'exigence']) assert.ok(BUILDER.includes("'" + code + "':"), code);
  });

  it('un thème illisible n\'entre jamais dans le formulaire, et l\'aperçu suit le choix', () => {
    const corps = BUILDER.slice(BUILDER.indexOf('function onApparenceTexte('), BUILDER.indexOf('function onApparenceFichier('));
    assert.ok(corps.indexOf('if (!lu.ok)') < corps.indexOf('def.apparence ='), 'le défaut est traité avant d\'écrire dans le formulaire');
    assert.match(BUILDER, /function themeDuFormulaire\(\)/);
    assert.ok(BUILDER.includes("T.apparenceDe(S.currentDef)"));
  });

  it('un thème pas encore donné attend, sans message d\'erreur', () => {
    assert.match(BUILDER, /ap\.attente \?/);
    assert.ok(BUILDER.includes('Rien n’est encore donné'));
  });

  it('la page autonome fige le thème du document, jamais une adresse', () => {
    const gen = BUILDER.slice(BUILDER.indexOf('async function externeGenerer()'));
    assert.match(gen, /S\.themeDocument\.themedef/);
    assert.ok(!/themedef[^\n]*https?:/i.test(gen.slice(0, gen.indexOf('x.nom ='))));
  });
});

describe('Compositeur : l\'outil lui-même prend le thème', () => {
  const style = BUILDER.slice(BUILDER.indexOf('<style'), BUILDER.indexOf('</style>'));

  it('le thème du document est suivi par défaut, un essai le remplace, la personne passe avant', () => {
    const corps = BUILDER.slice(BUILDER.indexOf('function habillerOutil()'), BUILDER.indexOf('function outilSuit('));
    assert.ok(corps.indexOf('T.personneImpose()') < corps.indexOf('T.appliquer('), 'la préférence de la personne est testée avant de poser quoi que ce soit');
    assert.ok(corps.indexOf('o.essai') < corps.indexOf('o.suit'), 'un thème essayé prime sur celui du document');
    assert.ok(corps.includes('T.retirer('), 'le thème d\'avant est retiré');
  });

  it('il ne s\'écrit jamais dans le document : seul le choix « suivre » est retenu, dans le navigateur', () => {
    const corps = BUILDER.slice(BUILDER.indexOf('function etatOutil()'), BUILDER.indexOf('function habillerOutil()'));
    assert.ok(corps.includes('localStorage'));
    const gestes = BUILDER.slice(BUILDER.indexOf('function outilSuit('), BUILDER.indexOf('function outilHtml()'));
    assert.ok(!/docApi|applyUserActions|BulkAddRecord/.test(gestes));
  });

  it('un thème essayé est lu comme une donnée non fiable (16 Ko, version, graines)', () => {
    const corps = BUILDER.slice(BUILDER.indexOf('function outilEssayer('), BUILDER.indexOf('function outilHtml()'));
    assert.ok(corps.includes('16384'));
    assert.ok(corps.indexOf('lireThemeDef') < corps.indexOf('.essai = lu.themedef'));
  });

  it('les gestes sont dans le menu et dans App', () => {
    assert.match(BUILDER, /window\.App = \{[\s\S]*outilSuit, outilEssayer/);
    assert.ok(BUILDER.includes('outilHtml() +'));
  });

  it('les couleurs de l\'outil passent par le kit d\'abord, la valeur DSFR d\'origine en repli', () => {
    assert.ok(!/var\(--(?!kit-)[a-z0-9-]+, var\(--kit-/.test(style), 'une variable DSFR ne doit pas passer avant le thème');
    assert.ok((style.match(/var\(--kit-[a-z0-9-]+, /g) || []).length > 200);
    assert.ok(/var\(--kit-action, var\(--blue-france, #000091\)\)/.test(style));
  });

  it('aucun défaut --kit-* n\'est posé par l\'outil : sans thème, l\'apparence d\'origine est intacte', () => {
    assert.ok(!/--kit-[a-z-]+\s*:/.test(style));
  });
});

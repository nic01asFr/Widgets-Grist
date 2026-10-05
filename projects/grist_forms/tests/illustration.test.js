/*
 * illustration.test.js — ce qui se montre avant qu'on réponde.
 *
 * Une question ne se comprend pas toujours avec des mots : « classez ces cinq
 * lieux » suppose qu'on sache où ils sont. L'illustration n'est pas une
 * décoration, c'est une partie de la question — et elle peut être une image,
 * une carte, ou une page entière (une vue Grist, un tableau de bord, un autre
 * widget).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Engine = require('../runtime/engine.js');

const def = { manifest_version: '1.0.0', id: 'f', tableId: 'T', composeMode: 'bind', choices: {}, sections: [] };

/** Une question quelconque, que l'on illustre. */
function question(illustration) {
  return {
    colId: 'Q', label: 'Que préférez-vous ?', type: 'Choice', widget: 'select',
    options: { choices: ['A', 'B'], illustration },
  };
}

describe('illustration — une image', () => {
  it('se place avant la saisie, avec sa description et sa légende', () => {
    const html = Engine.renderFieldHtml(question({
      type: 'image', url: 'https://exemple.fr/plan.png', alt: 'Plan du quartier', legende: 'Le secteur étudié',
    }), {}, null, def);
    assert.ok(html.indexOf('<figure') < html.indexOf('<select'), 'avant la question');
    assert.ok(html.includes('alt="Plan du quartier"'));
    assert.ok(html.includes('Le secteur étudié'));
  });

  it('accepte une image déposée (data:) et refuse le reste', () => {
    const data = 'data:image/png;base64,iVBORw0KGgo=';
    assert.ok(Engine.renderFieldHtml(question({ type: 'image', url: data, alt: 'x' }), {}, null, def).includes(data));
    const douteux = Engine.renderFieldHtml(question({ type: 'image', url: 'javascript:alert(1)', alt: 'x' }), {}, null, def);
    assert.ok(!douteux.includes('javascript:'), 'aucune adresse exécutable');
  });
});

describe('illustration — une page intégrée', () => {
  it('intègre un autre widget, isolé dans un bac à sable', () => {
    const html = Engine.renderFieldHtml(question({
      type: 'inclusion', url: 'https://nic01asfr.github.io/Widgets-Grist/artefactory/',
      titre: 'Artefactory', hauteur: 420,
    }), {}, null, def);
    assert.ok(html.includes('<iframe'));
    assert.ok(html.includes('artefactory'));
    assert.ok(html.includes('title="Artefactory"'), 'ce que lira un lecteur d’écran');
    assert.ok(html.includes('height:420px'));
    assert.ok(html.includes('sandbox="allow-scripts'), 'isolée');
    assert.ok(!html.includes('allow-same-origin'), 'ni origine ni cookies partagés');
    assert.ok(html.includes('loading="lazy"'), 'pas chargée tant qu’on ne la voit pas');
  });

  it('refuse une page qui n’est pas en https, et le dit', () => {
    const html = Engine.renderFieldHtml(question({ type: 'inclusion', url: 'http://exemple.fr/' }), {}, null, def);
    assert.ok(!html.includes('<iframe'));
    assert.ok(html.includes('https'), 'la raison est donnée à qui compose');
  });

  it('une adresse vide ne laisse rien', () => {
    const html = Engine.renderFieldHtml(question({ type: 'inclusion', url: '' }), {}, null, def);
    assert.ok(!html.includes('<iframe'));
    assert.ok(!html.includes('fr-illustration'));
  });
});

describe('illustration — une carte qui situe', () => {
  it('porte son cadrage et ses repères, et n’attend aucune réponse', () => {
    const html = Engine.renderFieldHtml(question({
      type: 'carte', centre: [5.4, 43.3], zoom: 14, fond: 'plan',
      reperes: [{ option: 'A', etiquette: 'A', lon: 5.4, lat: 43.3 }],
    }), {}, null, def);
    assert.ok(html.includes('data-carte-illustre="Q"'));
    assert.ok(html.includes('fr-carte--montre'), 'elle montre, elle ne saisit pas');
    assert.ok(html.includes('&quot;etiquette&quot;:&quot;A&quot;') || html.includes('etiquette'));
    assert.ok(!html.includes('name="Q"></div>'), 'aucun champ caché pour la carte');
  });
});

describe('illustration — toute question peut en porter une', () => {
  it('une échelle comme une liste', () => {
    const echelle = {
      colId: 'E', label: 'Êtes-vous d’accord ?', type: 'Int', widget: 'echelle', kind: 'echelle',
      options: { echelle: 'accord', illustration: { type: 'image', url: 'https://exemple.fr/a.png', alt: 'a' } },
    };
    const avecEchelles = Object.assign({}, def, { echelles: { accord: { min: 1, max: 5, libelles: ['Non', 'Oui'] } } });
    const html = Engine.renderFieldHtml(echelle, {}, null, avecEchelles);
    assert.ok(html.includes('<figure'));
    assert.ok(html.includes('fr-echelle'));
  });
});

describe('un repère de carte désigne une proposition', () => {
  const avecCarte = {
    colId: 'Prio', label: 'Classez', type: 'Choice', widget: 'classement', kind: 'classement',
    options: {
      choices: ['Les arbres', 'Les bancs'], rangs: 2,
      colonnes: { rangs: ['R1', 'R2'] },
      illustration: { type: 'carte', reperes: [
        { option: 'Les arbres', etiquette: 'A', lon: 2.7, lat: 48 },
        { option: 'Les bancs', etiquette: 'B', lon: 2.71, lat: 48.01 },
      ] },
    },
  };

  it('la lettre de la carte se retrouve dans la question', () => {
    const html = Engine.renderFieldHtml(avecCarte, {}, null, def);
    assert.ok(html.includes('fr-repere-lie'), 'la pastille existe');
    assert.ok(/>A<\/span> Les arbres/.test(html), 'A va aux arbres');
    assert.ok(/>B<\/span> Les bancs/.test(html), 'B va aux bancs');
  });

  it('chaque ligne se laisse retrouver par son option', () => {
    const html = Engine.renderFieldHtml(avecCarte, {}, null, def);
    assert.ok(html.includes('data-option="Les arbres"'));
  });

  it('sans repère nommé, rien n’est ajouté', () => {
    const sans = JSON.parse(JSON.stringify(avecCarte));
    sans.options.illustration.reperes = [{ etiquette: 'A', lon: 2.7, lat: 48 }];
    const html = Engine.renderFieldHtml(sans, {}, null, def);
    assert.ok(!html.includes('fr-repere-lie'), 'un repère anonyme ne décore rien');
  });

  it('une liste de choix porte aussi les repères', () => {
    const liste = {
      colId: 'L', label: 'Lequel ?', type: 'Choice', widget: 'radio',
      options: {
        choices: ['Le parc', 'La gare'],
        illustration: { type: 'carte', reperes: [{ option: 'La gare', etiquette: 'B', lon: 2, lat: 48 }] },
      },
    };
    const html = Engine.renderFieldHtml(liste, {}, null, def);
    assert.ok(/>B<\/span> La gare/.test(html));
    assert.ok(!/>.<\/span> Le parc/.test(html), 'une option sans repère reste nue');
  });
});

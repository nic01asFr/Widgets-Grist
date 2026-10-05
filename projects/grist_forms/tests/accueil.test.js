/*
 * accueil.test.js — un questionnaire ne commence pas par sa première question.
 *
 * Il commence par ce qui permet de décider d'y répondre : qui le publie,
 * pourquoi, pour combien de temps, et ce qu'il advient des réponses.
 * L'enquête écrite à la main consacrait un écran entier à cela.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Engine = require('../runtime/engine.js');

const base = {
  manifest_version: '1.0.0', id: 'f', title: 'Espaces publics du 4ᵉ',
  tableId: 'T', composeMode: 'bind', choices: {},
  sections: [{ id: 's1', label: 'Vous', fields: [{ colId: 'A', label: 'Âge', type: 'Text' }] }],
};

const avecAccueil = Object.assign({}, base, {
  branding: { organisation: 'Service d’études', organisationDetail: 'Commune d’Exemple' },
  accueil: {
    titre: 'Votre avis sur les espaces publics du quartier',
    texte: 'Une étude sur les quartiers **Gare** et **Parc**.',
    dureeMinutes: 8,
    dureeTexte: 'Le questionnaire s’adapte à vos réponses.',
    encarts: [{ ton: 'discret', titre: 'Anonymat & données (RGPD).', texte: 'Ce questionnaire est **anonyme**.' }],
  },
});

describe('le bandeau', () => {
  it('dit qui demande et sur quoi', () => {
    const html = Engine.renderBandeauHtml(avecAccueil);
    assert.ok(html.includes('Service d’études'));
    assert.ok(html.includes('Commune d’Exemple'));
    assert.ok(html.includes('Espaces publics du 4ᵉ'));
  });

  it('ne s’affiche pas quand il n’a rien à dire', () => {
    assert.equal(Engine.renderBandeauHtml({ manifest_version: '1.0.0' }), '');
  });
});

describe('la page d’accueil', () => {
  it('porte son titre, son texte, sa durée et ses mentions', () => {
    const html = Engine.renderAccueilHtml(avecAccueil);
    assert.ok(html.includes('Votre avis sur les espaces publics'));
    assert.ok(html.includes('<strong>Gare</strong>'), 'le gras se lit');
    assert.ok(html.includes('Environ 8 minutes'));
    assert.ok(html.includes('fr-encart--attention'), 'la durée se voit');
    assert.ok(html.includes('Anonymat'));
    assert.ok(html.includes('fr-encart--discret'), 'les mentions se lisent si on les cherche');
    assert.ok(html.includes('data-action="commencer"'));
  });

  it('n’ouvre pas le HTML à qui compose', () => {
    const html = Engine.renderAccueilHtml(Object.assign({}, base, {
      accueil: { titre: 'T', texte: 'Bonjour <img src=x onerror=alert(1)> **gras**' },
    }));
    assert.ok(!html.includes('<img'), 'échappé');
    assert.ok(html.includes('<strong>gras</strong>'), 'le gras, lui, passe');
  });

  it('se reconnaît, ou non', () => {
    assert.equal(Engine.aUnAccueil(avecAccueil), true);
    assert.equal(Engine.aUnAccueil(base), false);
    assert.equal(Engine.aUnAccueil(Object.assign({}, base, { accueil: {} })), false);
  });

  it('reprend le titre et la description du formulaire quand on n’a rien dit d’autre', () => {
    const html = Engine.renderAccueilHtml(Object.assign({}, base, {
      description: 'Une étude de voirie.', accueil: { dureeMinutes: 3 },
    }));
    assert.ok(html.includes('Espaces publics du 4ᵉ'));
    assert.ok(html.includes('Une étude de voirie.'));
  });
});

describe('l’horodatage et la durée', () => {
  const def = Object.assign({}, base, { meta: { timestampCol: 'Horodatage', durationCol: 'DureeSecondes' } });

  it('se remplissent seuls, en secondes', () => {
    const il_y_a_90s = Date.now() - 90000;
    const out = Engine.collectSubmitData(def, { A: 'x' }, {}, { creation: true, demarreA: il_y_a_90s });
    assert.ok(Math.abs(out.Horodatage - Math.round(Date.now() / 1000)) <= 2);
    assert.ok(out.DureeSecondes >= 89 && out.DureeSecondes <= 92, 'durée mesurée : ' + out.DureeSecondes);
  });

  it('ne compte rien si le chrono n’est pas parti', () => {
    const out = Engine.collectSubmitData(def, { A: 'x' }, {}, { creation: true, demarreA: 0 });
    assert.equal('DureeSecondes' in out, false);
  });

  it('ne ré-horodate pas une modification', () => {
    const out = Engine.collectSubmitData(def, { A: 'x' }, {}, { creation: false, demarreA: Date.now() });
    assert.equal('Horodatage' in out, false);
  });
});

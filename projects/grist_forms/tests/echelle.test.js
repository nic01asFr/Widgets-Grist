const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../runtime/engine.js');
const { createRoot } = require('./helpers/fake-dom.js');

const def = {
  manifest_version: '1.0.0',
  id: 'essai-echelle',
  title: 'Essai',
  tableId: 'Reponses',
  composeMode: 'bind',
  echelles: {
    accord: { min: 1, max: 5, libelles: ['Pas du tout d’accord', 'Tout à fait d’accord'], nonConcerne: true },
    priorite: { min: 1, max: 5, libelles: ['Surtout pas', 'En priorité'], nonConcerne: false },
    large: { min: 0, max: 10 },
  },
  sections: [{
    id: 's1', label: 'Perception', fields: [
      { colId: 'Agreable', label: 'Les espaces sont agréables', type: 'Int', widget: 'echelle',
        kind: 'echelle', options: { echelle: 'accord', matrice: 'perception' } },
      { colId: 'Entretenu', label: 'Ils sont bien entretenus', type: 'Int', widget: 'echelle',
        kind: 'echelle', options: { echelle: 'accord', matrice: 'perception' } },
      { colId: 'Voiture', label: 'Prioriser la voiture', type: 'Int', widget: 'echelle',
        kind: 'echelle', options: { echelle: 'priorite' } },
      { colId: 'Note', label: 'Une remarque', type: 'Text', widget: 'text' },
    ],
  }],
  choices: {},
};

describe('échelle — ce que la personne voit', () => {
  const champ = def.sections[0].fields[2];

  it('rend un cran par valeur, et pas un de plus', () => {
    const html = Engine.renderFieldHtml(champ, {}, null, def);
    assert.equal((html.match(/type="radio"/g) || []).length, 5);
    assert.ok(html.includes('data-widget="echelle"'));
  });

  it('écrit ce que valent les extrémités', () => {
    const html = Engine.renderFieldHtml(champ, {}, null, def);
    assert.ok(html.includes('1 · Surtout pas'));
    assert.ok(html.includes('En priorité · 5'));
  });

  it('n’offre « Non concerné » que si l’échelle le prévoit', () => {
    assert.ok(!Engine.renderFieldHtml(champ, {}, null, def).includes('Non concerné'));
    assert.ok(Engine.renderFieldHtml(def.sections[0].fields[0], {}, null, def).includes('Non concerné'));
  });

  it('coche la valeur déjà donnée, « Non concerné » compris', () => {
    const avecNote = Engine.renderFieldHtml(champ, { Voiture: 4 }, null, def);
    assert.match(avecNote, /value="4"[^>]*checked/);
    const avecNsp = Engine.renderFieldHtml(def.sections[0].fields[0], { Agreable: 'NSP' }, null, def);
    assert.match(avecNsp, /value="NSP"[^>]*checked/);
  });

  it('suit les bornes déclarées, pas un 1–5 imposé', () => {
    const large = { colId: 'X', label: 'X', type: 'Int', widget: 'echelle', kind: 'echelle', options: { echelle: 'large' } };
    const html = Engine.renderFieldHtml(large, {}, null, def);
    assert.equal((html.match(/type="radio"/g) || []).length, 11);
  });

  it('sans échelle déclarée, retombe sur 1 à 5 plutôt que de ne rien rendre', () => {
    const orpheline = { colId: 'Y', label: 'Y', type: 'Int', widget: 'echelle', kind: 'echelle', options: {} };
    assert.equal(Engine.echelleDe(def, orpheline).max, 5);
    assert.equal((Engine.renderFieldHtml(orpheline, {}, null, def).match(/type="radio"/g) || []).length, 5);
  });
});

describe('matrice — une mise en page, pas un type', () => {
  it('groupe les échelles qui se suivent et partagent leur matrice', () => {
    const groupes = Engine.grouperParMatrice(def.sections[0].fields);
    assert.deepEqual(groupes.map((g) => (g.matrice || '—') + ':' + g.fields.length),
      ['perception:2', '—:1', '—:1']);
  });

  it('ne groupe pas deux matrices différentes qui se suivent', () => {
    const groupes = Engine.grouperParMatrice([
      { colId: 'A', options: { matrice: 'un' } },
      { colId: 'B', options: { matrice: 'deux' } },
      { colId: 'C', options: { matrice: 'deux' } },
    ]);
    assert.deepEqual(groupes.map((g) => g.matrice + ':' + g.fields.length), ['un:1', 'deux:2']);
  });

  it('n’annonce l’échelle qu’une fois pour toute la matrice', () => {
    const root = createRoot();
    Engine.mount(root, def, {});
    const html = root.innerHTML;
    assert.equal((html.match(/Tout à fait d’accord/g) || []).length, 1, 'une seule fois pour les deux lignes');
    assert.ok(html.includes('data-matrice="perception"'));
    assert.ok(html.includes('Les espaces sont agréables') && html.includes('Ils sont bien entretenus'));
  });
});

describe('échelle — ce qui part dans Grist', () => {
  const contexte = {};

  it('écrit le nombre, pas la chaîne', () => {
    const data = Engine.collectSubmitData(def, { Voiture: '4' }, contexte, { creation: true });
    assert.equal(data.Voiture, 4);
  });

  it('« Non concerné » s’écrit vide — un entier ne sait pas porter ce sens', () => {
    const data = Engine.collectSubmitData(def, { Agreable: 'NSP' }, contexte, { creation: true });
    assert.equal(data.Agreable, null);
  });

  it('une question sans réponse s’écrit vide, jamais omise', () => {
    // Mesuré en Grist réel : une colonne Int omise vaut 0, et AVERAGE compte les zéros.
    const data = Engine.collectSubmitData(def, {}, contexte, { creation: true });
    assert.equal('Agreable' in data, true);
    assert.equal(data.Agreable, null);
  });

  it('une question masquée s’écrit vide à la création', () => {
    const avecCondition = JSON.parse(JSON.stringify(def));
    avecCondition.sections[0].fields[0].condition = { field: 'Note', operator: '==', value: 'oui' };
    const data = Engine.collectSubmitData(avecCondition, { Note: 'non' }, contexte, { creation: true });
    assert.equal(data.Agreable, null);
  });

  it('mais pas à la correction : on ne vide pas ce qu’on ne montre pas', () => {
    const avecCondition = JSON.parse(JSON.stringify(def));
    avecCondition.sections[0].fields[0].condition = { field: 'Note', operator: '==', value: 'oui' };
    const data = Engine.collectSubmitData(avecCondition, { Note: 'non' }, contexte, {});
    assert.equal('Agreable' in data, false);
  });

  it('ne vide pas un texte masqué, qui ne souffre pas du zéro', () => {
    const avecCondition = JSON.parse(JSON.stringify(def));
    avecCondition.sections[0].fields[3].condition = { field: 'Voiture', operator: '==', value: 5 };
    const data = Engine.collectSubmitData(avecCondition, { Voiture: 1 }, contexte, { creation: true });
    assert.equal('Note' in data, false);
  });
});

describe('échelle — la saisie', () => {
  it('lit le cran coché à la soumission', async () => {
    const root = createRoot();
    const ecrit = [];
    Engine.mount(root, def, { submit: (d) => { ecrit.push(d); return Promise.resolve(); } });
    const cran = root.querySelector('input[name="Voiture"][value="3"]');
    assert.ok(cran, 'le cran 3 existe');
    cran.checked = true;
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(ecrit.length, 1);
    assert.equal(ecrit[0].Voiture, 3);
  });
});

describe('oui / non — deux boutons, pas une case', () => {
  it('pose la question au lieu de l’affirmer', () => {
    const f = { colId: 'B3_Velo', label: 'Possédez-vous un vélo ?', type: 'Bool', widget: 'ouinon' };
    const html = Engine.renderFieldHtml(f, {}, null, def);
    assert.ok(html.includes('type="radio"'), 'deux boutons');
    assert.ok(!html.includes('type="checkbox"'), 'plus de case à cocher');
    assert.ok(html.includes('>Oui<') && html.includes('>Non<'));
  });

  it('se relit : la réponse cochée revient quand on repasse', () => {
    const f = { colId: 'B3_Velo', label: 'Vélo ?', type: 'Bool', widget: 'ouinon' };
    const html = Engine.renderFieldHtml(f, { B3_Velo: false }, null, def);
    assert.ok(/value="false"[^>]*checked/.test(html), '« Non » reste coché');
    assert.ok(!/value="true"[^>]*checked/.test(html));
  });

  it('les libellés se disent autrement quand la question l’appelle', () => {
    const f = { colId: 'X', label: 'Vous êtes ?', type: 'Bool', widget: 'ouinon',
      options: { libelleOui: 'Plutôt d’accord', libelleNon: 'Plutôt pas' } };
    const html = Engine.renderFieldHtml(f, {}, null, def);
    assert.ok(html.includes('Plutôt d’accord') && html.includes('Plutôt pas'));
  });
});

describe('dégradation — un widget inconnu retombe sur le type', () => {
  it('une saisie que ce moteur ne connaît pas reste remplissable', () => {
    // Une copie figée du formulaire, embarquée ailleurs, peut demander une
    // saisie écrite après elle : la question doit rester posable.
    const f = { colId: 'X', label: 'Dessinez votre trajet', type: 'Text', widget: 'curseur_3d' };
    const html = Engine.renderFieldHtml(f, {}, null, def);
    assert.ok(html.includes('type="text"'), 'le type Grist commande');
    assert.ok(html.includes('Dessinez votre trajet'));
  });

  it('un oui/non inconnu retomberait sur la case du type Bool', () => {
    const f = { colId: 'B', label: 'Vélo ?', type: 'Bool', widget: 'bascule_inedite' };
    const html = Engine.renderFieldHtml(f, {}, null, def);
    assert.ok(html.includes('type="checkbox"'));
  });
});

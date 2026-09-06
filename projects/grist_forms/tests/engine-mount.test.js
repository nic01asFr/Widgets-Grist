const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../runtime/engine.js');
const { createRoot } = require('./helpers/fake-dom.js');

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('Engine.renderFieldHtml — échappement XSS', () => {
  it('escapes label html', () => {
    const html = Engine.renderFieldHtml({
      colId: 'N', label: '<img src=x onerror=alert(1)>', type: 'Text', widget: 'text', required: false
    }, {});
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('&lt;img') || html.includes('&lt;'));
  });

  it('escapes value html for text widget', () => {
    const html = Engine.renderFieldHtml(
      { colId: 'N', label: 'Nom', type: 'Text', widget: 'text', required: false },
      { N: '"><script>alert(1)</script>' }
    );
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});

describe('Engine.renderFieldHtml — widgets v1', () => {
  it('text: fr-input, value posé', () => {
    const html = Engine.renderFieldHtml({ colId: 'Nom', label: 'Nom', type: 'Text', widget: 'text', required: true }, { Nom: 'Dupont' });
    assert.ok(html.includes('fr-input'));
    assert.ok(html.includes('value="Dupont"'));
    assert.ok(html.includes('required'));
  });

  it('text: placeholder depuis options.placeholder', () => {
    const html = Engine.renderFieldHtml({
      colId: 'Email', label: 'Email', type: 'Text', widget: 'text',
      options: { placeholder: 'ex. jean@exemple.fr' }
    }, {});
    assert.ok(html.includes('placeholder="ex. jean@exemple.fr"'));
  });

  it('textarea: placeholder depuis options.placeholder', () => {
    const html = Engine.renderFieldHtml({
      colId: 'Msg', label: 'Message', type: 'Text', widget: 'textarea',
      options: { placeholder: 'Votre message…' }
    }, {});
    assert.ok(html.includes('<textarea'));
    assert.ok(html.includes('placeholder="Votre message…"'));
  });

  it('textarea: fr-input, contenu échappé en texte de node', () => {
    const html = Engine.renderFieldHtml({ colId: 'Notes', label: 'Notes', type: 'Text', widget: 'textarea' }, { Notes: 'a & b' });
    assert.ok(html.includes('<textarea'));
    assert.ok(html.includes('a &amp; b'));
  });

  it('number: fr-input type number', () => {
    const html = Engine.renderFieldHtml({ colId: 'Age', label: 'Âge', type: 'Int', widget: 'number' }, { Age: 42 });
    assert.ok(html.includes('type="number"'));
    assert.ok(html.includes('value="42"'));
  });

  it('checkbox: fr-checkbox-group, checked quand true', () => {
    const html = Engine.renderFieldHtml({ colId: 'Ok', label: 'OK', type: 'Bool', widget: 'checkbox' }, { Ok: true });
    assert.ok(html.includes('fr-checkbox-group'));
    assert.ok(html.includes('checked'));
  });

  it('date / datetime: type input adapté', () => {
    const d = Engine.renderFieldHtml({ colId: 'D', label: 'Date', type: 'Date', widget: 'date' }, { D: '2026-07-26' });
    assert.ok(d.includes('type="date"'));
    const dt = Engine.renderFieldHtml({ colId: 'DT', label: 'DateHeure', type: 'DateTime', widget: 'datetime' }, {});
    assert.ok(dt.includes('type="datetime-local"'));
  });

  it('select: options depuis optionsList, selected sur la valeur courante', () => {
    const html = Engine.renderFieldHtml(
      { colId: 'Ville', label: 'Ville', type: 'Choice', widget: 'select', required: true },
      { Ville: 'Lyon' },
      ['Paris', 'Lyon']
    );
    assert.ok(html.includes('fr-select'));
    assert.ok(html.includes('<option value="Lyon" selected>Lyon</option>'));
  });

  it('radio: un fr-radio-group par option, checked sur la bonne valeur', () => {
    const html = Engine.renderFieldHtml(
      { colId: 'Sexe', label: 'Sexe', type: 'Choice', widget: 'radio' },
      { Sexe: 'F' },
      [{ value: 'H', label: 'Homme' }, { value: 'F', label: 'Femme' }]
    );
    assert.equal((html.match(/fr-radio-group/g) || []).length, 2);
    assert.ok(/value="F"[^>]*checked/.test(html));
  });

  it('multiselect: checkboxes multiples, checked pour les valeurs du tableau', () => {
    const html = Engine.renderFieldHtml(
      { colId: 'Langues', label: 'Langues', type: 'ChoiceList', widget: 'multiselect' },
      { Langues: ['fr', 'en'] },
      ['fr', 'en', 'es']
    );
    assert.equal((html.match(/fr-checkbox-group/g) || []).length, 3);
    assert.ok(/value="fr"[^>]*checked/.test(html));
    assert.ok(!/value="es"[^>]*checked/.test(html));
  });

  it('likert: 5 options radio 1..5', () => {
    const html = Engine.renderFieldHtml({ colId: 'Satisf', label: 'Satisfaction', type: 'Int', widget: 'likert' }, { Satisf: 3 });
    assert.equal((html.match(/type="radio"/g) || []).length, 5);
    assert.ok(/value="3"[^>]*checked/.test(html));
  });

  it('file: input type file + hint maxFiles', () => {
    const html = Engine.renderFieldHtml({
      colId: 'Piece', label: 'Pièce', type: 'Attachments', widget: 'file', required: true,
      options: { maxFiles: 3 }
    }, {});
    assert.ok(html.includes('type="file"'));
    assert.ok(html.includes('multiple'));
    assert.ok(html.includes('Jusqu\'à 3'));
  });
});

describe('Engine.mount — navigation, validation, submit', () => {
  function buildFormDef() {
    return {
      manifest_version: '1.0.0',
      id: 'demo-contact',
      title: 'Contact',
      description: 'Bienvenue',
      branding: {
        logoUrl: 'https://example.com/logo.png',
        logoAlt: 'Logo',
        successImageUrl: 'https://example.com/merci.png',
        successImageAlt: 'Merci'
      },
      tableId: 'Contacts',
      composeMode: 'bind',
      successMessage: 'Merci !',
      sections: [
        {
          id: 's1', label: 'Identité', gate: null,
          fields: [
            { colId: 'Nom', label: 'Nom', type: 'Text', widget: 'text', required: true },
            { colId: 'Notes', label: 'Notes', type: 'Text', widget: 'textarea', required: false }
          ]
        },
        {
          id: 's2', label: 'Préférences', gate: null,
          fields: [
            { colId: 'Ville', label: 'Ville', type: 'Choice', widget: 'select', required: true, options: { choices: ['Paris', 'Lyon'] } }
          ]
        }
      ],
      choices: {}
    };
  }

  it('exists as a function on exports', () => {
    assert.equal(typeof Engine.mount, 'function');
  });

  it('multi-step: bloque le required puis avance, puis soumet via bridge.submit', async () => {
    const root = createRoot();
    let submittedData = null;
    const bridge = { submit: (data) => { submittedData = data; return Promise.resolve({ ok: true }); } };

    Engine.mount(root, buildFormDef(), bridge);

    assert.ok(root.innerHTML.includes('Nom'));
    assert.ok(root.innerHTML.includes('Suivant'));
    assert.ok(!root.innerHTML.includes('Précédent'));
    assert.ok(root.innerHTML.includes('Étape 1 sur 2'));
    assert.ok(root.innerHTML.includes('Contact'), 'titre du formulaire sur la 1re étape');
    assert.ok(root.innerHTML.includes('fr-form__header'));
    assert.ok(root.innerHTML.includes('Bienvenue'), 'description sur la 1re étape');
    assert.ok(root.innerHTML.includes('fr-form__brand--logo'), 'logo sur la 1re étape');
    assert.ok(root.innerHTML.includes('logo.png'));

    root.querySelector('[data-action="next"]').dispatchEvent('click');
    assert.ok(root.innerHTML.includes('obligatoire'), 'doit bloquer le passage sans le champ requis');
    assert.ok(root.innerHTML.includes('Étape 1 sur 2'), 'reste sur l\'étape 1');

    root.querySelector('[name="Nom"]').value = 'Dupont';
    root.querySelector('[data-action="next"]').dispatchEvent('click');
    assert.ok(root.innerHTML.includes('Étape 2 sur 2'), 'avance à l\'étape 2 une fois le requis rempli');
    assert.ok(root.innerHTML.includes('Ville'));
    assert.ok(!root.innerHTML.includes('fr-form__header'), 'pas de titre formulaire hors 1re étape');
    assert.ok(root.innerHTML.includes('Envoyer'));
    assert.ok(root.innerHTML.includes('Précédent'));

    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    assert.ok(root.innerHTML.includes('obligatoire'), 'bloque la soumission sans le select requis');

    root.querySelector('[name="Ville"]').value = 'Lyon';
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush();
    await flush();

    assert.deepEqual(submittedData, { Nom: 'Dupont', Notes: null, Ville: 'Lyon' });
    assert.ok(root.innerHTML.includes('Merci'), 'affiche le message de succès après submit');
    assert.ok(root.innerHTML.includes('fr-form__brand--success'), 'image de fin après submit');
    assert.ok(root.innerHTML.includes('merci.png'));
  });

  it('bridge.values preremplit toutes les etapes, pas seulement la premiere', () => {
    // Un consommateur qui EDITE (Atlas, la fiche d'entite) avait tente
    // d'amorcer le DOM apres le montage. Cela ne tient pas : un formulaire
    // multi-etapes ne rend que l'etape courante, et les champs des suivantes
    // n'existent pas encore. Vu a l'ecran — le choix « Bon » restait decoche a
    // l'etape 2, alors que la ligne le portait.
    const root = createRoot();
    Engine.mount(root, buildFormDef(), { values: { Nom: 'Dupont', Ville: 'Lyon' } });

    assert.equal(root.querySelector('[name="Nom"]').value, 'Dupont');
    root.querySelector('[data-action="next"]').dispatchEvent('click');
    assert.ok(root.innerHTML.includes('Étape 2 sur 2'), 'le requis de l etape 1 etait deja rempli');
    // Le <select> arrive avec son option marquee — c'est ce que le DOM amorce
    // apres coup ne pouvait pas faire, l'etape n'etant pas encore rendue.
    assert.ok(root.innerHTML.includes('value="Lyon" selected'), 'l etape 2 arrive prete');
  });

  it('sans bridge.values, rien ne change — le chemin reste celui de la creation', () => {
    const root = createRoot();
    Engine.mount(root, buildFormDef(), {});
    assert.equal(root.querySelector('[name="Nom"]').value, '');
  });

  it('une valeur que le formulaire ne declare pas n entre pas', async () => {
    // `collectSubmitData` emet tout ce qu'il connait : laisser passer une
    // colonne etrangere la ferait ecrire dans la table sans que le formulaire
    // l ait jamais montree.
    const root = createRoot();
    let envoye = null;
    Engine.mount(root, buildFormDef(), {
      submit: (d) => { envoye = d; return Promise.resolve({ ok: true }); },
      values: { Nom: 'Dupont', Ville: 'Lyon', ColonneEtrangere: 'a ne pas ecrire' },
    });
    root.querySelector('[data-action="next"]').dispatchEvent('click');
    // Le faux DOM ne modelise pas l'option selectionnee d'un <select> : on pose
    // la valeur comme le fait le test voisin, l'objet de celui-ci etant
    // ailleurs.
    root.querySelector('[name="Ville"]').value = 'Lyon';
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush();
    await flush();
    assert.ok(envoye, 'la soumission a eu lieu');
    assert.equal(Object.prototype.hasOwnProperty.call(envoye, 'ColonneEtrangere'), false);
  });

  it('retombe sur applyUserActions BulkAddRecord quand bridge est un GristBridge natif (addRow)', async () => {
    const root = createRoot();
    let calledTable = null;
    let calledFields = null;
    const bridge = {
      addRow: (table, fields) => { calledTable = table; calledFields = fields; return Promise.resolve([{ id: 1 }]); }
    };
    const formDef = {
      tableId: 'Contacts', successMessage: 'OK',
      sections: [{ id: 's1', label: 'S1', gate: null, fields: [{ colId: 'Nom', label: 'Nom', type: 'Text', widget: 'text', required: true }] }],
      choices: {}
    };
    Engine.mount(root, formDef, bridge);
    root.querySelector('[name="Nom"]').value = 'Martin';
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush();
    await flush();

    assert.equal(calledTable, 'Contacts');
    assert.deepEqual(calledFields, { Nom: 'Martin' });
    assert.ok(root.innerHTML.includes('OK'));
  });

  it('cascade Ref : filtre les options enfant selon le parent (ids string/number)', async () => {
    const root = createRoot();
    const formDef = {
      tableId: 'Demandes', successMessage: 'OK',
      sections: [{
        id: 's1', label: 'Lieu', gate: null,
        fields: [
          {
            colId: 'Region', label: 'Région', type: 'Ref', widget: 'select', required: true,
            options: { refTable: 'Regions', visibleCol: 'Nom' }
          },
          {
            colId: 'Ville', label: 'Ville', type: 'Ref', widget: 'select', required: true,
            options: { refTable: 'Villes', visibleCol: 'Nom' },
            cascade: { parentField: 'Region', parentRefCol: 'Region' }
          }
        ]
      }],
      choices: {}
    };
    const bridge = {
      refRecords: {
        Regions: { id: [1, 2], Nom: ['Bretagne', 'PACA'] },
        Villes: {
          id: [10, 20, 30],
          Nom: ['Rennes', 'Marseille', 'Paris'],
          Region: [1, 2, 1]
        }
      },
      submit: () => Promise.resolve({ ok: true })
    };

    Engine.mount(root, formDef, bridge);
    await flush();

    // Sans région : pas d'options Ville (parent vide)
    assert.ok(!root.innerHTML.includes('value="10"'), 'pas Rennes sans parent');

    const regionSelect = root.querySelector('[name="Region"]');
    regionSelect.value = '1';
    regionSelect.dispatchEvent('change');
    await flush();

    assert.ok(root.innerHTML.includes('value="10"'), 'Rennes (région 1)');
    assert.ok(root.innerHTML.includes('value="30"'), 'Paris (région 1)');
    assert.ok(!root.innerHTML.includes('value="20"'), 'Marseille filtrée (région 2)');
  });

  it('filtre dynamique cas C : Ref parent → lit Groupe → filtre Contacts', async () => {
    const root = createRoot();
    const formDef = {
      tableId: 'Demandes', successMessage: 'OK',
      sections: [{
        id: 's1', label: 'Contacts', gate: null,
        fields: [
          {
            colId: 'Contact', label: 'Contact', type: 'Ref', widget: 'select', required: true,
            options: { refTable: 'Contacts', visibleCol: 'Nom' }
          },
          {
            colId: 'Autre', label: 'Autre', type: 'Ref', widget: 'select', required: true,
            options: { refTable: 'Contacts', visibleCol: 'Email' },
            dynamicFilter: {
              parentField: 'Contact',
              filterColumn: 'Groupe',
              parentResolve: 'refRow',
              parentValueColumn: 'Groupe'
            }
          }
        ]
      }],
      choices: {}
    };
    const bridge = {
      refRecords: {
        Contacts: {
          id: [1, 2, 3],
          Nom: ['Alice', 'Bob', 'Carol'],
          Email: ['a@x', 'b@x', 'c@x'],
          Groupe: ['Agents', 'Public', 'Agents']
        }
      },
      submit: () => Promise.resolve({ ok: true })
    };

    Engine.mount(root, formDef, bridge);
    await flush();

    assert.ok(!root.innerHTML.includes('value="1"') || root.innerHTML.includes('name="Contact"'),
      'Contact parent visible');
    // Sans parent choisi : Autre n'a pas d'options Agents
    const html0 = root.innerHTML;
    // Les options Autre sont vides (pas a@x / c@x comme options filtrées utiles)
    // Après sélection Contact=1 (Alice/Agents) → Autre propose 1 et 3
    const contactSelect = root.querySelector('[name="Contact"]');
    contactSelect.value = '1';
    contactSelect.dispatchEvent('change');
    await flush();

    const html = root.innerHTML;
    // Autre select doit contenir Alice(1) et Carol(3) — labels Email
    const autre = root.querySelector('[name="Autre"]');
    assert.ok(autre, 'select Autre présent');
    const opts = [...autre.querySelectorAll('option')].map(o => o.getAttribute('value')).filter(v => v);
    assert.deepEqual(opts.sort(), ['1', '3']);
    assert.ok(!opts.includes('2'), 'Bob (Public) exclu');
  });
});

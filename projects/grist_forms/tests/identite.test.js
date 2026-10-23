'use strict';

/*
 * Qui répond : nom, prénom, courriel. Des types qui contrôlent et mettent en forme, au choix un seul
 * champ ou un groupe de champs, avec le même verdict en JavaScript et en Python (la colonne de
 * conformité refait le contrôle côté Grist).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const Formats = require('../shared/formats.js');
const Saisies = require('../shared/saisies.js');
const Ux = require('../shared/ux.js');
const Engine = require('../runtime/engine.js');
const { createRoot } = require('./helpers/fake-dom.js');

describe('Nom — MAJUSCULES, lettres seulement', () => {
  it('met en forme et refuse ce qui n\'est pas un nom', () => {
    assert.equal(Formats.normalise('nom', '  de la  Fontaine '), 'DE LA FONTAINE');
    assert.equal(Formats.normalise('nom', 'dupont'), 'DUPONT');
    assert.equal(Formats.normalise('nom', 'o’brien'), 'O’BRIEN');
    assert.equal(Formats.normalise('nom', 'Müller-Åkesson'), 'MÜLLER-ÅKESSON');
    ['Dupont', 'de la Fontaine', 'O\'Brien', 'Müller-Åkesson', 'Saint-Jean', 'St. Jean'].forEach((v) => assert.equal(Formats.valide('nom', v), true, v));
    ['Dupont2', '-Dupont', '\'Dupont', 'Du--pont', 'Du pont@x', '123', 'Jean_Pierre', 'a'.repeat(61)].forEach((v) => assert.equal(Formats.valide('nom', v), false, v));
  });
});

describe('Prénom — une initiale après chaque espace, tiret ou apostrophe', () => {
  it('met en forme', () => {
    assert.equal(Formats.normalise('prenom', 'jean-pierre'), 'Jean-Pierre');
    assert.equal(Formats.normalise('prenom', 'MARIE CLAIRE'), 'Marie Claire');
    assert.equal(Formats.normalise('prenom', 'd\'artagnan'), 'D\'Artagnan');
    assert.equal(Formats.normalise('prenom', 'zoé'), 'Zoé');
    assert.equal(Formats.normalise('prenom', '  anne   sophie '), 'Anne Sophie');
  });
  it('refuse chiffres et symboles', () => {
    assert.equal(Formats.valide('prenom', 'Jean-Pierre'), true);
    assert.equal(Formats.valide('prenom', 'Jean3'), false);
    assert.equal(Formats.valide('prenom', 'Jean/Pierre'), false);
  });
});

describe('Nom et prénom en un seul champ', () => {
  it('exige deux mots et garde les particules en minuscules', () => {
    assert.equal(Formats.normalise('nomComplet', 'jean de la fontaine'), 'Jean de la Fontaine');
    assert.equal(Formats.normalise('nomComplet', 'marie-claire DUPONT'), 'Marie-Claire Dupont');
    assert.equal(Formats.valide('nomComplet', 'Marie Dupont'), true);
    assert.equal(Formats.valide('nomComplet', 'Marie'), false, 'un seul mot');
    assert.equal(Formats.valide('nomComplet', 'Marie D4pont'), false);
  });
});

describe('Courriel — adresse valide, forme enregistrée en minuscules', () => {
  it('normalise et contrôle', () => {
    assert.equal(Formats.normalise('courriel', '  Alice@Exemple.FR '), 'alice@exemple.fr');
    assert.equal(Formats.valide('courriel', 'alice@exemple.fr'), true);
    assert.equal(Formats.valide('courriel', 'alice@exemple'), false);
    assert.equal(Formats.valide('courriel', 'alice exemple.fr'), false);
  });
  it('corrige à la saisie : nom, prénom et courriel, pas l\'IBAN', () => {
    ['nom', 'prenom', 'nomComplet', 'courriel'].forEach((id) => assert.equal(Formats.corrige(id), true, id));
    assert.equal(Formats.corrige('iban'), false);
    assert.equal(Formats.corrige('inconnu'), false);
  });
});

function pythonDisponible() {
  return spawnSync('python', ['-I', '-c', 'print(1)'], { encoding: 'utf8' }).status === 0;
}

function verdictsPython(id, echantillons) {
  const source = [
    'import json, sys',
    Formats.definitionsPython([id]),
    'valeurs = json.loads(sys.stdin.read())',
    'print(json.dumps([bool(fmt_' + id + '(v)) for v in valeurs]))'
  ].join('\n');
  // ASCII échappé : sous Windows, Python lit l'entrée standard en cp1252 et abîmerait « ’ » ou « é ».
  const entree = JSON.stringify(echantillons).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  const r = spawnSync('python', ['-I', '-c', source], { input: entree, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('Python a échoué : ' + r.stderr);
  return JSON.parse(r.stdout);
}

describe('Nom, prénom : le Python donne le verdict du JavaScript', { skip: !pythonDisponible() && 'Python indisponible' }, () => {
  const ECHANTILLONS = [
    'Dupont', 'de la Fontaine', 'O\'Brien', 'O’Brien', 'Müller-Åkesson', 'Saint-Jean', 'St. Jean', 'Zoé', 'zoé', 'Marie Dupont',
    'Marie', 'Dupont2', '-Dupont', '\'Dupont', 'Du--pont', 'Du\'\'pont', 'Du’’pont', 'Du pont@x', '123', 'Jean_Pierre', 'a'.repeat(60), 'a'.repeat(61),
    '', ' ', '  Jean   Pierre  ', 'Jean\tPierre', 'élodie', 'Ñandú López', 'Д ж', '李 明', 'Jean-', 'Jean '
  ];
  ['nom', 'prenom', 'nomComplet'].forEach((id) => {
    it(id, () => {
      const py = verdictsPython(id, ECHANTILLONS);
      ECHANTILLONS.forEach((v, i) => {
        assert.equal(py[i], Formats.FORMATS[id].valider(v), id + ' : « ' + v + ' » — JavaScript ' + Formats.FORMATS[id].valider(v) + ', Python ' + py[i]);
      });
    });
  });
});

describe('Clavier du téléphone pour un nom', () => {
  it('propose la majuscule qu\'il faut et l\'autocomplétion du navigateur', () => {
    assert.equal(Saisies.attributsClavier({ type: 'Text' }, 'nom'), ' inputmode="text" autocomplete="family-name" autocapitalize="characters"');
    assert.equal(Saisies.attributsClavier({ type: 'Text' }, 'prenom'), ' inputmode="text" autocomplete="given-name" autocapitalize="words"');
    assert.equal(Saisies.attributsClavier({ type: 'Text' }, 'nomComplet'), ' inputmode="text" autocomplete="name" autocapitalize="words"');
    assert.equal(Saisies.attributsClavier({ type: 'Text' }, 'courriel'), ' inputmode="email" autocomplete="email"');
  });
  it('une question peut dire sa propre majuscule, et une valeur hors liste est ignorée', () => {
    assert.match(Saisies.attributsClavier({ type: 'Text', options: { clavier: { autocapitalize: 'sentences' } } }, null), /autocapitalize="sentences"/);
    assert.ok(!/autocapitalize/.test(Saisies.attributsClavier({ type: 'Text', options: { clavier: { autocapitalize: '"><x' } } }, null)));
  });
});

describe('Le moteur corrige la forme dès qu\'on quitte le champ', () => {
  const def = () => ({
    id: 'inscription', title: 'Inscription', tableId: 'Inscriptions',
    sections: [{ label: 'Vous', fields: [
      { colId: 'Nom', label: 'Nom', type: 'Text', widget: 'text', options: { validation: { format: 'nom' } } },
      { colId: 'Prenom', label: 'Prénom', type: 'Text', widget: 'text', options: { validation: { format: 'prenom' } } },
      { colId: 'Courriel', label: 'Courriel', type: 'Text', widget: 'text', required: true, options: { validation: { format: 'courriel' } } },
      { colId: 'Libre', label: 'Libre', type: 'Text', widget: 'text' }
    ] }]
  });

  it('montre « DUPONT », « Jean-Pierre », « alice@exemple.fr » à la sortie du champ', () => {
    const root = createRoot();
    Engine.mount(root, def(), { skipProbe: true, submit: () => Promise.resolve({}) });
    const saisir = (nom, valeur) => { const c = root.querySelector('[name="' + nom + '"]'); c.value = valeur; c.dispatchEvent('change'); return c; };
    assert.equal(saisir('Nom', ' dupont ').value, 'DUPONT');
    assert.equal(saisir('Prenom', 'jean-pierre').value, 'Jean-Pierre');
    assert.equal(saisir('Courriel', ' Alice@Exemple.FR').value, 'alice@exemple.fr');
    assert.equal(saisir('Libre', ' tel quel ').value, ' tel quel ', 'un champ sans format n\'est pas touché');
  });

  it('refuse un courriel invalide et un nom avec un chiffre à l\'envoi, sans rien écrire', async () => {
    const root = createRoot();
    let envoye = null;
    Engine.mount(root, def(), { skipProbe: true, submit: (d) => { envoye = d; return Promise.resolve({}); } });
    root.querySelector('[name="Nom"]').value = 'Dupont2';
    root.querySelector('[name="Courriel"]').value = 'pas-un-courriel';
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(envoye, null);
  });

  it('écrit la forme normalisée', async () => {
    const root = createRoot();
    let envoye = null;
    Engine.mount(root, def(), { skipProbe: true, submit: (d) => { envoye = d; return Promise.resolve({}); } });
    root.querySelector('[name="Nom"]').value = 'dupont';
    root.querySelector('[name="Prenom"]').value = 'marie claire';
    root.querySelector('[name="Courriel"]').value = 'Marie@Exemple.fr';
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual([envoye.Nom, envoye.Prenom, envoye.Courriel], ['DUPONT', 'Marie Claire', 'marie@exemple.fr']);
  });
});

describe('Le trio d\'identité du compositeur', () => {
  it('pose Nom, Prénom, Courriel obligatoires, avec leur type', () => {
    const champs = Ux.identiteChamps([], [], false);
    assert.deepEqual(champs.map((c) => [c.label, c.options.validation.format, c.required]),
      [['Nom', 'nom', true], ['Prénom', 'prenom', true], ['Courriel', 'courriel', true]]);
  });
  it('ne refait pas ce qui existe, et reconnaît une colonne sous un autre nom', () => {
    const champs = Ux.identiteChamps([{ colId: 'Nom', label: 'Nom' }], [{ colId: 'E_mail', label: 'Adresse e-mail', type: 'Text' }], true);
    assert.deepEqual(champs.map((c) => [c.label, c.colId]), [['Prénom', ''], ['Courriel', 'E_mail']]);
  });
  it('les types du compositeur posent le format', () => {
    const f = { colId: 'x', label: 'x', options: {} };
    Ux.applyTypeKey(f, 'prenom');
    assert.equal(f.options.validation.format, 'prenom');
    const g = { colId: 'y', label: 'y', options: { validation: { format: 'iban' } } };
    Ux.applyTypeKey(g, 'nom');
    assert.equal(g.options.validation.format, 'iban', 'un format déjà choisi n\'est pas écrasé');
  });
});

describe('Un groupe de questions : un bloc sous une légende', () => {
  const champ = (colId, label, groupe, extra) => Object.assign({
    colId, label, type: 'Text', widget: 'text', options: groupe ? { groupe } : {}
  }, extra || {});
  const def = (champs, groupes) => ({
    id: 'inscription', title: 'Inscription', tableId: 'Inscriptions', groupes,
    sections: [{ label: 'Vous', fields: champs }]
  });

  it('range les questions qui se suivent sous une légende, en grille à deux colonnes', () => {
    const root = createRoot();
    Engine.mount(root, def(
      [champ('Atelier', 'Atelier'), champ('Nom', 'Nom', 'identite'), champ('Prenom', 'Prénom', 'identite'), champ('Note', 'Note')],
      { identite: { titre: 'Qui êtes-vous ?', consigne: 'Pour vous recontacter.', colonnes: 2 } }
    ), { skipProbe: true, submit: () => Promise.resolve({}) });
    const html = root.innerHTML;
    assert.match(html, /<fieldset class="fr-fieldset fr-groupe fr-groupe--2" data-groupe="identite">/);
    assert.match(html, /<legend class="fr-fieldset__legend fr-groupe__titre">Qui êtes-vous \?<\/legend>/);
    assert.match(html, /Pour vous recontacter\./);
    const iAtelier = html.indexOf('name="Atelier"'), iNom = html.indexOf('name="Nom"'), iPrenom = html.indexOf('name="Prenom"'), iNote = html.indexOf('name="Note"');
    assert.ok(iAtelier < html.indexOf('data-groupe="identite"'), 'la question hors groupe reste avant');
    assert.ok(iNom > html.indexOf('data-groupe="identite"') && iPrenom > iNom, 'nom puis prénom dans le groupe');
    assert.ok(iNote > html.indexOf('</fieldset>'), 'la question suivante est hors du groupe');
  });

  it('un groupe sans disposition empile ses questions, sans légende si elle manque', () => {
    const root = createRoot();
    Engine.mount(root, def([champ('Nom', 'Nom', 'g'), champ('Prenom', 'Prénom', 'g')], { g: {} }), { skipProbe: true, submit: () => Promise.resolve({}) });
    assert.ok(!/fr-groupe--2/.test(root.innerHTML));
    assert.ok(!/fr-groupe__titre/.test(root.innerHTML));
    assert.match(root.innerHTML, /data-groupe="g"/);
  });

  it('deux groupes distincts à la suite restent deux blocs', () => {
    const root = createRoot();
    Engine.mount(root, def([champ('A', 'A', 'un'), champ('B', 'B', 'deux')], { un: { titre: 'Un' }, deux: { titre: 'Deux' } }), { skipProbe: true, submit: () => Promise.resolve({}) });
    assert.equal((root.innerHTML.match(/<fieldset class="fr-fieldset fr-groupe/g) || []).length, 2);
  });

  it('un groupe ne change rien à ce qui est écrit : chaque question garde sa colonne', async () => {
    const root = createRoot();
    let envoye = null;
    Engine.mount(root, def([champ('Nom', 'Nom', 'identite', { options: { groupe: 'identite', validation: { format: 'nom' } } }), champ('Prenom', 'Prénom', 'identite')],
      { identite: { titre: 'Qui ?' } }), { skipProbe: true, submit: (d) => { envoye = d; return Promise.resolve({}); } });
    root.querySelector('[name="Nom"]').value = 'dupont';
    root.querySelector('[name="Prenom"]').value = 'Marie';
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual([envoye.Nom, envoye.Prenom], ['DUPONT', 'Marie']);
  });

  it('la légende est échappée', () => {
    const root = createRoot();
    Engine.mount(root, def([champ('A', 'A', 'g')], { g: { titre: '<img src=x onerror=alert(1)>' } }), { skipProbe: true, submit: () => Promise.resolve({}) });
    assert.ok(!/<img/.test(root.innerHTML));
    assert.match(root.innerHTML, /&lt;img/);
  });
});

describe('Un nom se corrige, il ne se refuse pas', () => {
  const def = (mode) => ({
    id: 'inscription', title: 'Inscription', tableId: 'Inscriptions',
    sections: [{ label: 'Vous', fields: [
      { colId: 'Nom', label: 'Nom complet', type: 'Text', widget: 'text', required: true, options: { validation: mode ? { format: 'nomComplet', mode } : { format: 'nomComplet' } } }
    ] }]
  });
  const envoyer = async (d, valeur) => {
    const root = createRoot();
    let envoye = null;
    Engine.mount(root, d, { skipProbe: true, submit: (x) => { envoye = x; return Promise.resolve({}); } });
    root.querySelector('[name="Nom"]').value = valeur;
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await new Promise((r) => setTimeout(r, 5));
    return envoye;
  };

  it('en mode « corriger », un seul mot ou un chiffre n\'empêche pas l\'envoi, la forme est remise en ordre', async () => {
    assert.deepEqual(await envoyer(def('corriger'), 'madonna'), { Nom: 'Madonna' });
    assert.equal((await envoyer(def('corriger'), 'jean dupont 2')).Nom, 'Jean Dupont 2');
  });

  it('sans mode (formulaire existant) ou en mode « verifier », le refus reste', async () => {
    assert.equal(await envoyer(def(), 'Madonna'), null);
    assert.equal(await envoyer(def('verifier'), 'Madonna'), null);
  });

  it('ne refuse que les noms : un courriel ne peut pas se contenter de corriger', () => {
    assert.equal(Formats.formatControle({ options: { validation: { format: 'courriel', mode: 'corriger' } } }), 'courriel');
    assert.equal(Formats.formatControle({ options: { validation: { format: 'nomComplet', mode: 'corriger' } } }), null);
    assert.equal(Formats.peutCorrigerSeulement('nom'), true);
    assert.equal(Formats.peutCorrigerSeulement('iban'), false);
  });

  it('ne casse pas ce qui est déjà bien écrit', () => {
    assert.equal(Formats.normalise('nomComplet', 'Jean McDonald'), 'Jean McDonald');
    assert.equal(Formats.normalise('prenom', 'd\'Artagnan'), 'd\'Artagnan');
    assert.equal(Formats.normalise('nomComplet', 'marie Dupont'), 'Marie Dupont');
    assert.equal(Formats.normalise('nomComplet', 'JEAN DE LA FONTAINE'), 'Jean de la Fontaine');
  });

  it('les nouveaux types de nom partent en mode « corriger »', () => {
    ['nom', 'prenom', 'nomcomplet'].forEach((k) => {
      const t = Ux.FIELD_TYPES ? Ux.FIELD_TYPES.find((x) => x.key === k) : null;
      if (t) assert.equal(t.options.validation.mode, 'corriger', k);
    });
    Ux.identiteChamps([], [], false).filter((c) => c.options.validation.format !== 'courriel')
      .forEach((c) => assert.equal(c.options.validation.mode, 'corriger'));
  });
});

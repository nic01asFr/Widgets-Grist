/*
 * saisies-mobiles.js — ce qu'un FormDef peut dire des saisies mobiles, et ce qu'il ne dira jamais. Le schéma
 * `formdef-1.0` ne change pas : ces règles sont posées en contrôle de contrat.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Mobiles = require('../shared/saisies-mobiles.js');
const Valider = require('../shared/valider-schema.js');

function formdef(champs, extra) {
  return Object.assign({
    manifest_version: '1.0.0', id: 'essai', title: 'Essai', tableId: 'T', composeMode: 'bind',
    sections: [{ id: 's', label: 'S', fields: champs }], choices: {}
  }, extra || {});
}
function ecartsDe(champs, extra) { return Mobiles.validerSaisiesMobiles(formdef(champs, extra)).ecarts.join(' | '); }

describe('un FormDef avec des saisies mobiles reste un FormDef formdef-1.0', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'runtime', 'formdef.schema.json'), 'utf8'));
  const sample = formdef([
    { colId: 'constat', label: 'Constat dicté', type: 'Text', widget: 'voix', options: { capacite: 'micro', extraction: { consigne: 'Relève le lieu et l\'urgence.', champs: ['lieu', 'urgence'] } } },
    { colId: 'lieu', label: 'Lieu', type: 'Text', widget: 'text' },
    { colId: 'urgence', label: 'Urgence', type: 'Choice', widget: 'radio', options: { choices: ['1', '2', '3'], libelles: { 1: 'Faible', 2: 'Moyenne', 3: 'Forte' } } },
    { colId: 'enregistrement', label: 'Enregistrement', type: 'Attachments', widget: 'audio' },
    { colId: 'code', label: 'Code lu', type: 'Text', widget: 'scan' },
    { colId: 'vue', label: 'Photos', type: 'Attachments', widget: 'photo' },
    { colId: 'pos', label: 'Position', type: 'Text', widget: 'geo', options: { capacite: 'position' } }
  ]);
  it('valide contre le schéma formdef-1.0 SANS que le schéma change', () => {
    // Un FormDef avec voix, audio, scan, photo, capacite, extraction et libelles est conforme tel quel.
    assert.deepEqual(Valider.valider(sample, schema, schema), []);
    // Le schéma ne change que par sa DESCRIPTION de `widget`, qui liste les quatre saisies ; sa structure est celle de
    // la branche principale. Aucune propriété n'est ajoutée : `widget` et `options` accueillent déjà tout.
    assert.equal(schema.definitions.field.additionalProperties, false);
    assert.match(schema.definitions.field.properties.widget.description, /photo, audio, voix, scan/);
    // `widget` est un texte libre : un widget inconnu d'un moteur ancien retombe sur celui du type Grist.
    assert.equal(schema.definitions.field.properties.widget.type, 'string');
    // `options` accepte toute clé : capacite, extraction et libelles n'ont pas besoin du schéma.
    assert.equal(schema.definitions.field.properties.options.additionalProperties, true);
  });
  it('le FormDef d\'exemple est conforme aux règles des saisies mobiles', () => {
    assert.deepEqual(Mobiles.validerSaisiesMobiles(sample), { conforme: true, ecarts: [] });
  });
  it('un FormDef sans saisie mobile est conforme : opt-in seulement', () => {
    const enquete = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'enquete-4e.formdef.json'), 'utf8'));
    assert.deepEqual(Mobiles.validerSaisiesMobiles(enquete), { conforme: true, ecarts: [] });
    const minimal = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'formdef-minimal.json'), 'utf8'));
    assert.equal(Mobiles.validerSaisiesMobiles(minimal).conforme, true);
  });
  it('le brouillon de fiche de tâche reste conforme', () => {
    const fiche = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'fiche-tache-brouillon.formdef.json'), 'utf8'));
    assert.equal(Mobiles.validerSaisiesMobiles(fiche).conforme, true);
  });
  it('un FormDef absent ou mal formé ne fait pas lever', () => {
    assert.doesNotThrow(() => Mobiles.validerSaisiesMobiles(undefined));
    assert.doesNotThrow(() => Mobiles.validerSaisiesMobiles({ sections: 'x' }));
    assert.doesNotThrow(() => Mobiles.validerSaisiesMobiles({ sections: [null, { fields: [null, 3] }] }));
  });
});

describe('le type Grist d\'un widget mobile', () => {
  it('voix et scan écrivent du texte, audio et photo des pièces jointes', () => {
    assert.deepEqual(Mobiles.TYPE_DU_WIDGET, { voix: 'Text', audio: 'Attachments', scan: 'Text', photo: 'Attachments' });
  });
  it('lu dans la table du noyau, la seule : pas de seconde copie', () => {
    const Noyau = require('../shared/noyau-saisies.js');
    Object.keys(Noyau.TABLE_GESTES).forEach((w) => {
      const type = Noyau.TABLE_GESTES[w].type;
      if (type) assert.equal(Mobiles.TYPE_DU_WIDGET[w], type, w);
      else assert.equal(w in Mobiles.TYPE_DU_WIDGET, false, w + ' n\'a pas de type fixe');
    });
    assert.deepEqual(Mobiles.CAPACITES, Array.from(Noyau.CAPACITES));
  });
  it('geo n\'impose aucun type : la position peut s\'écrire dans plusieurs colonnes', () => {
    assert.equal(ecartsDe([{ colId: 'p', label: 'P', type: 'Text', widget: 'geo' }]), '');
    assert.equal(ecartsDe([{ colId: 'p', label: 'P', type: 'Numeric', widget: 'geo' }]), '');
  });
  it('un widget sur le mauvais type est signalé', () => {
    assert.match(ecartsDe([{ colId: 'a', label: 'A', type: 'Int', widget: 'voix' }]), /« voix » écrit une colonne Text, pas Int/);
    assert.match(ecartsDe([{ colId: 'a', label: 'A', type: 'Text', widget: 'photo' }]), /« photo » écrit une colonne Attachments, pas Text/);
    assert.match(ecartsDe([{ colId: 'a', label: 'A', type: 'Text', widget: 'audio' }]), /« audio » écrit une colonne Attachments/);
  });
  it('un widget sans type est signalé, sans lever', () => {
    assert.match(ecartsDe([{ colId: 'a', label: 'A', widget: 'scan' }]), /sans type/);
  });
});

describe('options.capacite', () => {
  it('une capacité du vocabulaire est permise', () => {
    Mobiles.CAPACITES.forEach((c) => assert.equal(ecartsDe([{ colId: 'a', label: 'A', type: 'Text', widget: 'geo', options: { capacite: c } }]), '', c));
  });
  it('une capacité inconnue est signalée', () => {
    assert.match(ecartsDe([{ colId: 'a', label: 'A', type: 'Text', widget: 'voix', options: { capacite: 'telepathie' } }]), /capacite : « telepathie » inconnue/);
  });
});

describe('options.extraction', () => {
  const voix = (ex) => [{ colId: 'v', label: 'V', type: 'Text', widget: 'voix', options: { extraction: ex } }, { colId: 'lieu', label: 'L', type: 'Text', widget: 'text' }];

  it('réservée au widget voix', () => {
    assert.match(ecartsDe([{ colId: 'a', label: 'A', type: 'Text', widget: 'text', options: { extraction: { consigne: 'x' } } }]), /réservée au widget « voix »/);
  });
  it('les champs visés existent dans le formulaire', () => {
    assert.equal(ecartsDe(voix({ consigne: 'Relève le lieu.', champs: ['lieu'] })), '');
    assert.match(ecartsDe(voix({ consigne: 'Relève.', champs: ['inexistant'] })), /« inexistant » n'est pas un champ du formulaire/);
  });
  it('la consigne est un texte non vide', () => {
    assert.match(ecartsDe(voix({ consigne: '' })), /consigne : texte non vide/);
    assert.match(ecartsDe(voix({ consigne: 12 })), /consigne : texte non vide/);
  });
  it('champs : une liste de colId', () => {
    assert.match(ecartsDe(voix({ champs: 'lieu' })), /champs : une liste/);
    assert.match(ecartsDe(voix({ champs: [3] })), /champs\[0\] : colId texte/);
  });
  it('propriété inconnue signalée', () => {
    assert.match(ecartsDe(voix({ consigne: 'x', ton: 'sec' })), /ton : propriété inconnue/);
  });
  it('la consigne dit quoi chercher, pas où l\'envoyer : ni adresse, ni jeton', () => {
    assert.match(ecartsDe(voix({ consigne: 'Envoie à https://llm.exemple.test/v1 le texte' })), /ni adresse, ni jeton/);
    assert.match(ecartsDe(voix({ consigne: 'Utilise Bearer abcdef123456' })), /ni adresse, ni jeton/);
    assert.match(ecartsDe(voix({ consigne: 'api_key: abcdef123456' })), /ni adresse, ni jeton/);
    assert.match(ecartsDe(voix({ consigne: 'jeton AbCdEfGhIjKlMnOpQrStUvWxYz0123456789' })), /ni adresse, ni jeton/);
  });
  it('une consigne ordinaire, même longue, passe', () => {
    assert.equal(ecartsDe(voix({ consigne: 'Relève le lieu, la nature du désordre et l\'urgence à partir du texte dicté. Réponds en français.' })), '');
  });
  it('def.extraction : la consigne par défaut du formulaire est contrôlée de même', () => {
    const base = [{ colId: 'lieu', label: 'L', type: 'Text', widget: 'text' }];
    assert.equal(ecartsDe(base, { extraction: { consigne: 'Tu relèves une visite d\'ouvrage.' } }), '');
    assert.match(ecartsDe(base, { extraction: { consigne: 'vers https://x.example/api' } }), /ni adresse, ni jeton/);
    assert.match(ecartsDe(base, { extraction: { champs: ['nope'] } }), /« nope » n'est pas un champ/);
  });
});

describe('options.libelles', () => {
  const choix = (lib) => [{ colId: 'p', label: 'P', type: 'Choice', widget: 'radio', options: { choices: ['1', '2'], libelles: lib } }];

  it('un dictionnaire valeur -> libellé', () => {
    assert.equal(ecartsDe(choix({ 1: 'Critique', 2: 'Haute' })), '');
  });
  it('un objet est attendu', () => {
    assert.match(ecartsDe(choix(['Critique'])), /libelles : un objet/);
    assert.match(ecartsDe(choix('Critique')), /libelles : un objet/);
  });
  it('un libellé vide ou non texte est signalé', () => {
    assert.match(ecartsDe(choix({ 1: '' })), /libelles\.1 : libellé texte non vide/);
    assert.match(ecartsDe(choix({ 1: 7 })), /libelles\.1 : libellé texte non vide/);
  });
  it('une valeur de choix nommée « modele » ou « url » est une donnée, pas un secret', () => {
    assert.equal(ecartsDe(choix({ modele: 'Modèle', url: 'Adresse web', cle: 'Clé' })), '');
  });
});

describe('AUCUN SECRET dans un FormDef', () => {
  const interdites = ['cle', 'apiKey', 'api_key', 'token', 'jeton', 'secret', 'password', 'authorization', 'url', 'adresse', 'endpoint',
    'baseUrl', 'modele', 'model', 'instance', 'docId', 'documentId'];

  interdites.forEach((nom) => {
    it('« ' + nom + ' » est refusée dans les options d\'un champ', () => {
      const e = ecartsDe([{ colId: 'a', label: 'A', type: 'Text', widget: 'voix', options: { [nom]: 'valeur' } }]);
      assert.match(e, new RegExp('options\\.' + nom));
      assert.match(e, /ne porte ni clé, ni jeton, ni adresse, ni nom de modèle/);
    });
  });
  it('refusée à n\'importe quelle profondeur d\'options', () => {
    assert.match(ecartsDe([{ colId: 'a', label: 'A', type: 'Text', widget: 'voix', options: { extraction: { consigne: 'x', reglages: { apiKey: 'z' } } } }]), /reglages\.apiKey/);
  });
  it('refusée dans def.extraction', () => {
    assert.match(ecartsDe([{ colId: 'a', label: 'A', type: 'Text', widget: 'text' }], { extraction: { consigne: 'x', modele: 'gpt' } }), /extraction\.modele/);
  });
  it('un FormDef publié existant n\'en porte aucune : l\'enquête de référence et la fiche de tâche', () => {
    ['enquete-4e.formdef.json', 'fiche-tache-brouillon.formdef.json', 'formdef-minimal.json'].forEach((nom) => {
      const f = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', nom), 'utf8'));
      assert.equal(Mobiles.validerSaisiesMobiles(f).conforme, true, nom);
    });
  });
  it('le détecteur de secret ne s\'emballe pas sur un texte ordinaire', () => {
    ['', 'Relève le lieu', 'Le 12 mars à 14 h 30, route nationale 7', 'http est un protocole', 'a:b'].forEach((t) => assert.equal(Mobiles.porteUnSecret(t), false, t));
    assert.equal(Mobiles.porteUnSecret(undefined), false);
  });
});

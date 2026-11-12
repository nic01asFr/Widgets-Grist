'use strict';

/*
 * Le compositeur et les saisies mobiles : la palette, ce que chaque saisie demande à l'hôte et par quoi elle est
 * remplacée, et l'éditeur de la lecture d'un texte (consigne, champs visés). Les fonctions sont extraites de
 * builder.html et exécutées sans navigateur, comme pour les limites.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Ux = require('../shared/ux.js');
const Noyau = require('../shared/noyau-saisies.js');
const Mobiles = require('../shared/saisies-mobiles.js');
const Valider = require('../shared/valider-schema.js');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'runtime', 'formdef.schema.json'), 'utf8'));
const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'builder.html'), 'utf8');

function extraireFonction(nom) {
  const debut = SOURCE.indexOf('function ' + nom + '(');
  assert.ok(debut > 0, nom);
  let profondeur = 0, i = SOURCE.indexOf('{', debut);
  for (; i < SOURCE.length; i++) {
    if (SOURCE[i] === '{') profondeur++;
    if (SOURCE[i] === '}') { profondeur--; if (profondeur === 0) break; }
  }
  return SOURCE.slice(debut, i + 1);
}
function extraireConstante(nom) {
  const debut = SOURCE.indexOf('const ' + nom + ' = ');
  assert.ok(debut > 0, nom);
  const fin = SOURCE.indexOf('\n};', debut);
  return SOURCE.slice(debut, fin + 3);
}

function banc(def) {
  const S = { currentDef: def };
  const appels = { rendus: 0, modifies: 0 };
  const code = [extraireConstante('BESOINS_SAISIES_MOBILES'), ...['esc', 'hintIcon', 'renderBesoinsHote', 'onExtraction', 'onExtractionChamp'].map(extraireFonction)].join('\n');
  const f = new Function('S', 'marquerModifie', 'renderBuilder', 'window', code + '; return { renderBesoinsHote, onExtraction, onExtractionChamp, esc };');
  const api = f(S, () => { appels.modifies++; }, () => { appels.rendus++; }, { SaisiesMobiles: Mobiles });
  return Object.assign({ S, appels }, api);
}

const VOIX = () => ({ colId: 'constat', label: 'Constat', type: 'Text', widget: 'voix' });
const def = (champs) => ({ manifest_version: '1.0.0', id: 'x', title: 'X', tableId: 'T', composeMode: 'ensureSchema', choices: {}, sections: [{ id: 's', label: 'S', fields: champs || [VOIX(), { colId: 'lieu', label: 'Lieu', type: 'Text', widget: 'text' }, { colId: 'urgence', label: 'Urgence', type: 'Choice', widget: 'select', options: { choices: ['1', '2'] } }] }] });

describe('la palette propose les quatre saisies mobiles', () => {
  const tous = Ux.SIMPLE_TYPES.concat(Ux.ADVANCED_TYPES);
  const par = Object.fromEntries(tous.map((t) => [t.key, t]));
  it('photo, audio, voix, scan figurent parmi les types qu\'on peut choisir', () => {
    ['photo', 'audio', 'voix', 'scan'].forEach((k) => assert.ok(par[k], k));
  });
  it('chacune écrit le type Grist de la table du noyau, la seule', () => {
    ['photo', 'audio', 'voix', 'scan'].forEach((k) => {
      assert.equal(par[k].widget, k);
      assert.equal(par[k].type, Noyau.TABLE_GESTES[k].type, k);
    });
  });
  it('les libellés sont dits en français, sans identifiant technique', () => {
    ['photo', 'audio', 'voix', 'scan'].forEach((k) => {
      assert.ok(par[k].label.length > 8, k);
      assert.ok(!/widget|Attachments|Text/.test(par[k].label), par[k].label);
    });
  });
  it('les clés de la palette restent uniques', () => {
    const cles = tous.map((t) => t.key);
    assert.equal(new Set(cles).size, cles.length);
  });
  it('choisir photo ou audio pose le type pièce jointe et le bon widget', () => {
    const photo = Ux.applyTypeKey({ colId: 'Q', type: 'Text', widget: 'text' }, 'photo');
    assert.deepEqual([photo.type, photo.widget], ['Attachments', 'photo']);
    const audio = Ux.applyTypeKey({ colId: 'Q', type: 'Text', widget: 'text' }, 'audio');
    assert.deepEqual([audio.type, audio.widget], ['Attachments', 'audio']);
  });
  it('une photo ne se lit pas comme un fichier : le widget la distingue', () => {
    assert.equal(Ux.fieldTypeKey({ colId: 'Q', type: 'Attachments', widget: 'photo' }), 'photo');
    assert.equal(Ux.fieldTypeKey({ colId: 'Q', type: 'Attachments', widget: 'audio' }), 'audio');
  });
  it('un fichier ordinaire reste un fichier, avec ou sans widget', () => {
    assert.equal(Ux.fieldTypeKey({ colId: 'Q', type: 'Attachments', widget: 'file' }), 'file');
    assert.equal(Ux.fieldTypeKey({ colId: 'Q', type: 'Attachments' }), 'file');
  });
  it('un dessin et une signature sont toujours reconnus', () => {
    assert.equal(Ux.fieldTypeKey({ colId: 'Q', type: 'Attachments', widget: 'dessin' }), 'dessin');
    assert.equal(Ux.fieldTypeKey({ colId: 'Q', type: 'Attachments', widget: 'dessin', options: { dessin: { usage: 'signature' } } }), 'signature');
  });
  it('voix et scan se reconnaissent par leur widget, un texte ordinaire reste un texte', () => {
    assert.equal(Ux.fieldTypeKey({ colId: 'Q', type: 'Text', widget: 'voix' }), 'voix');
    assert.equal(Ux.fieldTypeKey({ colId: 'Q', type: 'Text', widget: 'scan' }), 'scan');
    assert.equal(Ux.fieldTypeKey({ colId: 'Q', type: 'Text', widget: 'text' }), 'text');
  });
  it('un aller-retour : choisir un type puis le relire rend la même clé', () => {
    ['photo', 'audio', 'voix', 'scan'].forEach((k) => assert.equal(Ux.fieldTypeKey(Ux.applyTypeKey({ colId: 'Q' }, k)), k));
  });
  it('quitter une photo pour un fichier retire bien le widget photo', () => {
    const f = Ux.applyTypeKey({ colId: 'Q' }, 'photo');
    Ux.applyTypeKey(f, 'file');
    assert.equal(f.widget, 'file');
  });
});

describe('le compositeur connaît ces widgets', () => {
  it('les widgets proposés par type pour une colonne existante', () => {
    const m = /const WIDGETS_BY_TYPE = \{([\s\S]*?)\};/.exec(SOURCE)[1];
    assert.match(m, /Text: \[[^\]]*'voix'[^\]]*'scan'[^\]]*\]/);
    assert.match(m, /Attachments: \[[^\]]*'photo'[^\]]*'audio'[^\]]*\]/);
  });
  it('chaque widget a son libellé d\'auteur', () => {
    const m = /const WIDGET_LABELS = \{([\s\S]*?)\};/.exec(SOURCE)[1];
    ['photo', 'audio', 'voix', 'scan'].forEach((k) => assert.match(m, new RegExp(k + ': \'')));
  });
  it('une pièce jointe ne reçoit ni valeur de départ ni préremplissage par l\'adresse', () => {
    assert.match(SOURCE, /\['file', 'photo', 'audio', 'geo', 'dessin', 'classement'\]\.indexOf\(f\.widget\) === -1/);
    assert.match(SOURCE, /\['file', 'photo', 'audio', 'geo', 'dessin'\]\.indexOf\(f\.widget\) === -1/);
  });
  it('le noyau et les règles des saisies mobiles sont chargés AVANT le compositeur, le noyau d\'abord', () => {
    const i = SOURCE.indexOf('shared/noyau-saisies.js');
    const j = SOURCE.indexOf('shared/saisies-mobiles.js');
    assert.ok(i > 0 && j > i, 'le noyau avant les règles qui en dépendent');
    assert.ok(j < SOURCE.indexOf('function renderBesoinsHote('), 'chargés avant le code qui s\'en sert');
  });
  it('les deux gestionnaires de la lecture sont exposés à la page', () => {
    assert.match(SOURCE, /window\.App = \{[\s\S]*onExtraction, onExtractionChamp/);
  });
  it('le tableau des besoins couvre exactement les quatre saisies mobiles de la table du noyau', () => {
    const b = banc(def());
    const code = extraireConstante('BESOINS_SAISIES_MOBILES');
    const cles = Array.from(code.matchAll(/^\s{2}(\w+): \{ besoin:/gm)).map((m) => m[1]).sort();
    assert.deepEqual(cles, ['audio', 'photo', 'scan', 'voix']);
    assert.ok(b);
  });
});

describe('ce qu\'une saisie demande à l\'hôte, et par quoi elle est remplacée', () => {
  const d = def();
  const b = banc(d);
  const rendu = (champ) => b.renderBesoinsHote(d, 0, champ, 0);

  it('chaque saisie mobile le dit : ce qu\'elle demande, et le repli', () => {
    [['photo', /l’appareil photo/, /fichier d’images/], ['audio', /le micro/, /fichier sonore/], ['scan', /lecteur de codes/, /taper le code/], ['voix', /le micro.*service de transcription/, /écrit ou colle/]].forEach(([w, besoin, repli]) => {
      const html = rendu({ colId: 'q', label: 'Q', widget: w });
      assert.match(html, besoin, w);
      assert.match(html, repli, w);
      assert.match(html, /elle peut toujours répondre/, w);
      assert.match(html, new RegExp('data-besoin-hote="' + w + '"'));
    });
  });
  it('le micro est dit inaccessible dans un widget Grist, pour la voix et l\'audio seulement', () => {
    assert.match(rendu({ colId: 'q', label: 'Q', widget: 'voix' }), /Dans un widget Grist, le micro n’est pas accessible/);
    assert.match(rendu({ colId: 'q', label: 'Q', widget: 'audio' }), /Dans un widget Grist, le micro n’est pas accessible/);
    assert.doesNotMatch(rendu({ colId: 'q', label: 'Q', widget: 'photo' }), /widget Grist/);
    assert.doesNotMatch(rendu({ colId: 'q', label: 'Q', widget: 'scan' }), /widget Grist/);
  });
  it('rien pour une question ordinaire, un fichier, un lieu', () => {
    ['text', 'textarea', 'file', 'geo', 'dessin', 'select'].forEach((w) => assert.equal(rendu({ colId: 'q', label: 'Q', widget: w }), '', w));
    assert.equal(rendu({ colId: 'q', label: 'Q' }), '');
  });
  it('seule la dictée porte l\'éditeur de la lecture d\'un texte', () => {
    assert.match(rendu(d.sections[0].fields[0]), /Lecture du texte/);
    ['photo', 'audio', 'scan'].forEach((w) => assert.doesNotMatch(rendu({ colId: 'q', label: 'Q', widget: w }), /Lecture du texte/, w));
  });
  it('la dictée liste les AUTRES questions, pas elle-même', () => {
    const html = rendu(d.sections[0].fields[0]);
    assert.match(html, /Lieu/);
    assert.match(html, /Urgence/);
    assert.doesNotMatch(html, /for="ex-h-0-0-\d+">Constat/);
  });
  it('les champs déjà visés sont cochés, les autres non', () => {
    const d2 = def(); d2.sections[0].fields[0].options = { extraction: { consigne: 'x', champs: ['urgence'] } };
    const html = banc(d2).renderBesoinsHote(d2, 0, d2.sections[0].fields[0], 0);
    assert.match(html, /<input type="checkbox" id="ex-h-0-0-1" checked/);
    assert.doesNotMatch(html, /<input type="checkbox" id="ex-h-0-0-0" checked/);
  });
  it('la consigne se montre, échappée', () => {
    const d2 = def(); d2.sections[0].fields[0].options = { extraction: { consigne: 'Relève <b>le lieu</b>' } };
    const html = banc(d2).renderBesoinsHote(d2, 0, d2.sections[0].fields[0], 0);
    assert.ok(!html.includes('<b>'));
    assert.match(html, /Relève &lt;b&gt;le lieu&lt;\/b&gt;/);
  });
  it('un libellé de question qui prétend être du code est échappé', () => {
    const d2 = def([VOIX(), { colId: 'a', label: '<img src=x onerror=alert(1)>', type: 'Text', widget: 'text' }]);
    const html = banc(d2).renderBesoinsHote(d2, 0, d2.sections[0].fields[0], 0);
    assert.ok(!html.includes('<img'));
  });
  it('une consigne qui porte une adresse ou un jeton est signalée', () => {
    ['Envoie à https://llm.exemple.test/v1', 'Bearer abcdef123456', 'api_key: abcdef123456'].forEach((consigne) => {
      const d2 = def(); d2.sections[0].fields[0].options = { extraction: { consigne } };
      const html = banc(d2).renderBesoinsHote(d2, 0, d2.sections[0].fields[0], 0);
      assert.match(html, /dit quoi chercher, pas où l’envoyer/, consigne);
    });
  });
  it('une consigne ordinaire n\'est pas signalée', () => {
    const d2 = def(); d2.sections[0].fields[0].options = { extraction: { consigne: 'Relève le lieu et l’urgence.' } };
    assert.doesNotMatch(banc(d2).renderBesoinsHote(d2, 0, d2.sections[0].fields[0], 0), /dit quoi chercher, pas où/);
  });
  it('seul, sans autre question : on le dit', () => {
    const d2 = def([VOIX()]);
    assert.match(banc(d2).renderBesoinsHote(d2, 0, d2.sections[0].fields[0], 0), /Ajoutez d’autres questions/);
  });
  it('la lecture dit que le texte part vers le service de l\'hôte, avec son nom', () => {
    assert.match(rendu(d.sections[0].fields[0]), /part vers le service que l’hôte a choisi.*nom du service/);
  });
});

describe('écrire la lecture d\'un texte dans le FormDef', () => {
  it('la consigne s\'écrit rognée', () => {
    const d = def(); const b = banc(d);
    b.onExtraction(0, 0, 'consigne', '  Relève le lieu.  ');
    assert.equal(d.sections[0].fields[0].options.extraction.consigne, 'Relève le lieu.');
    assert.equal(b.appels.modifies, 1);
    assert.equal(b.appels.rendus, 1);
  });
  it('vider la consigne retire le bloc quand rien d\'autre n\'y est', () => {
    const d = def(); const b = banc(d);
    b.onExtraction(0, 0, 'consigne', 'x');
    b.onExtraction(0, 0, 'consigne', '   ');
    assert.equal(d.sections[0].fields[0].options.extraction, undefined);
  });
  it('vider la consigne garde les champs visés', () => {
    const d = def(); const b = banc(d);
    b.onExtraction(0, 0, 'consigne', 'x');
    b.onExtractionChamp(0, 0, 'lieu', true);
    b.onExtraction(0, 0, 'consigne', '');
    assert.deepEqual(d.sections[0].fields[0].options.extraction, { champs: ['lieu'] });
  });
  it('cocher ajoute le champ, décocher le retire, sans toucher aux autres', () => {
    const d = def(); const b = banc(d);
    b.onExtractionChamp(0, 0, 'lieu', true);
    b.onExtractionChamp(0, 0, 'urgence', true);
    assert.deepEqual(d.sections[0].fields[0].options.extraction.champs, ['lieu', 'urgence']);
    b.onExtractionChamp(0, 0, 'lieu', false);
    assert.deepEqual(d.sections[0].fields[0].options.extraction.champs, ['urgence']);
  });
  it('cocher deux fois ne double pas', () => {
    const d = def(); const b = banc(d);
    b.onExtractionChamp(0, 0, 'lieu', true);
    b.onExtractionChamp(0, 0, 'lieu', true);
    assert.deepEqual(d.sections[0].fields[0].options.extraction.champs, ['lieu']);
  });
  it('décocher le dernier retire la liste, et le bloc s\'il est vide', () => {
    const d = def(); const b = banc(d);
    b.onExtractionChamp(0, 0, 'lieu', true);
    b.onExtractionChamp(0, 0, 'lieu', false);
    assert.equal(d.sections[0].fields[0].options.extraction, undefined);
  });
  it('les autres options de la question ne sont pas touchées', () => {
    const d = def(); d.sections[0].fields[0].options = { placeholder: 'Dictez ici' };
    const b = banc(d);
    b.onExtraction(0, 0, 'consigne', 'x');
    assert.equal(d.sections[0].fields[0].options.placeholder, 'Dictez ici');
  });
  it('un champ sans options est préparé sans lever', () => {
    const d = def(); delete d.sections[0].fields[0].options;
    assert.doesNotThrow(() => banc(d).onExtractionChamp(0, 0, 'lieu', true));
  });
  it('ce que le compositeur écrit est accepté par le schéma ET par les règles des saisies mobiles', () => {
    const d = def(); const b = banc(d);
    b.onExtraction(0, 0, 'consigne', 'Relève le lieu et l’urgence.');
    b.onExtractionChamp(0, 0, 'lieu', true);
    b.onExtractionChamp(0, 0, 'urgence', true);
    assert.deepEqual(Valider.valider(d, SCHEMA, SCHEMA), []);
    assert.deepEqual(Mobiles.validerSaisiesMobiles(d), { conforme: true, ecarts: [] });
  });
  it('un champ visé retiré du formulaire ensuite est signalé par les règles, pas ignoré', () => {
    const d = def(); const b = banc(d);
    b.onExtraction(0, 0, 'consigne', 'x');
    b.onExtractionChamp(0, 0, 'lieu', true);
    d.sections[0].fields.splice(1, 1);
    assert.match(Mobiles.validerSaisiesMobiles(d).ecarts.join(' | '), /« lieu » n'est pas un champ du formulaire/);
  });
});

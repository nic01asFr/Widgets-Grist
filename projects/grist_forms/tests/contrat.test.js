'use strict';

/*
 * Le contrat d'une saisie : ce que le compositeur produit, ce que le moteur rend
 * et ce que le schéma déclare doivent dire la même chose.
 *
 * Aujourd'hui la liste des saisies est recopiée à cinq endroits (compositeur,
 * moteur, projection de colonnes, mode externe, schéma). Ces essais ne les
 * réunissent pas — ils interdisent qu'elles divergent en silence.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../runtime/engine.js');
const Ux = require('../shared/ux.js');
const Ensure = require('../shared/ensure-schema.js');
const { valider } = require('../../../scripts/valider-schema.js');

const SCHEMA = JSON.parse(fs.readFileSync(path.join(__dirname, '../runtime/formdef.schema.json'), 'utf8'));
const CHAMP = SCHEMA.definitions.field.properties;
const OPTIONS_DECLAREES = Object.keys(CHAMP.options.properties);

function enveloppe(champs) {
  return {
    manifest_version: '1.0.0', id: 'essai', title: 'Essai', tableId: 'Essais', composeMode: 'ensureSchema',
    choices: {}, sections: [{ id: 'a', label: 'A', fields: champs }]
  };
}

describe('Contrat — ce que propose le compositeur est valide', () => {
  const types = Ux.SIMPLE_TYPES.concat(Ux.ADVANCED_TYPES);

  types.forEach((t) => {
    it('« ' + t.label + ' » (' + t.key + ') donne un champ conforme au schéma', () => {
      const champ = { colId: 'Q', label: 'Question' };
      Ux.applyTypeKey(champ, t.key);
      champ.options = {};
      if (champ.type === 'Ref' || champ.type === 'RefList') champ.options.refTable = 'Autre';
      if (champ.type === 'Choice' || champ.type === 'ChoiceList') champ.options.choices = ['a', 'b'];
      const ecarts = valider(enveloppe([champ]), SCHEMA, SCHEMA);
      assert.deepEqual(ecarts, [], JSON.stringify(champ) + ' → ' + ecarts.join(' ; '));
    });

    it('« ' + t.label + ' » est reconnue par fieldTypeKey', () => {
      const champ = { colId: 'Q', label: 'Question' };
      Ux.applyTypeKey(champ, t.key);
      assert.equal(Ux.fieldTypeKey(champ), t.key);
    });

    it('« ' + t.label + ' » s’affiche : son widget est rendu par le moteur', () => {
      const champ = { colId: 'Q', label: 'Question' };
      Ux.applyTypeKey(champ, t.key);
      assert.ok(Engine.WIDGETS.indexOf(champ.widget) !== -1, 'le moteur ne rend pas « ' + champ.widget + ' »');
    });
  });
});

describe('Contrat — le schéma dit tout ce que le moteur rend et lit', () => {
  it('liste chaque widget que le moteur rend', () => {
    const doc = CHAMP.widget.description;
    const manquants = Engine.WIDGETS.filter((w) => !new RegExp('\\b' + w + '\\b').test(doc));
    assert.deepEqual(manquants, [], 'widgets rendus mais non documentés dans le schéma');
  });

  it('liste chaque kind que le moteur connaît', () => {
    const doc = CHAMP.kind.description;
    const manquants = Engine.KINDS.filter((k) => !new RegExp('\\b' + k + '\\b').test(doc));
    assert.deepEqual(manquants, [], 'kinds connus mais non documentés dans le schéma');
  });

  it('déclare toutes les options que les cas de démonstration emploient', () => {
    const dossier = path.join(__dirname, '../demo/cas');
    const inconnues = [];
    fs.readdirSync(dossier).filter((f) => f.endsWith('.json')).forEach((f) => {
      const def = JSON.parse(fs.readFileSync(path.join(dossier, f), 'utf8'));
      (def.sections || []).forEach((s) => (s.fields || []).forEach((fld) => {
        Object.keys(fld.options || {}).forEach((k) => {
          if (OPTIONS_DECLAREES.indexOf(k) === -1) inconnues.push(f + ' · ' + fld.colId + ' · ' + k);
        });
      }));
    });
    assert.deepEqual(inconnues, [], 'options employées mais non déclarées');
  });

  it('chaque cas de démonstration est conforme au schéma', () => {
    const dossier = path.join(__dirname, '../demo/cas');
    fs.readdirSync(dossier).filter((f) => f.endsWith('.json')).forEach((f) => {
      const def = JSON.parse(fs.readFileSync(path.join(dossier, f), 'utf8'));
      const ecarts = valider(def, SCHEMA, SCHEMA);
      assert.deepEqual(ecarts, [], f + ' : ' + ecarts.join(' ; '));
    });
  });
});

describe('Contrat — la table cible d’une référence', () => {
  const cible = (champ) => Ensure.fieldToGristType(champ);

  it('se lit dans options.refTable, la voie canonique', () => {
    assert.equal(cible({ type: 'Ref', options: { refTable: 'Lampadaires' } }), 'Ref:Lampadaires');
    assert.equal(cible({ type: 'RefList', options: { refTable: 'Agents' } }), 'RefList:Agents');
  });

  it('se lit aussi dans le suffixe du type, que le schéma décrit comme valide', () => {
    assert.equal(cible({ type: 'Ref:Lampadaires' }), 'Ref:Lampadaires');
    assert.equal(cible({ type: 'RefList:Agents' }), 'RefList:Agents');
  });

  it('se lit encore dans l’ancien refTable du champ', () => {
    assert.equal(cible({ type: 'Ref', refTable: 'Lampadaires' }), 'Ref:Lampadaires');
  });

  it('la voie canonique l’emporte sur les autres', () => {
    assert.equal(cible({ type: 'Ref:Ancien', refTable: 'Vieux', options: { refTable: 'Nouveau' } }), 'Ref:Nouveau');
  });

  it('une référence sans table n’est pas complète, et le dit', () => {
    const r = Ensure.bindingIsComplete(enveloppe([{ colId: 'R', label: 'R', type: 'Ref', widget: 'select' }]));
    assert.equal(r.ok, false);
    assert.match(r.errors.join(' '), /refTable manquant/);
    const ok = Ensure.bindingIsComplete(enveloppe([{ colId: 'R', label: 'R', type: 'Ref:Autre', widget: 'select' }]));
    assert.equal(ok.ok, true, 'le suffixe suffit désormais : ' + ok.errors.join(' '));
  });
});

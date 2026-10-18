/*
 * demo-cas.test.js — les formulaires de démonstration sont de vrais FormDef.
 *
 * Une démonstration qui ne ressemble pas à ce que le moteur lit ment sur le
 * produit : trois des conditions écrites dans les cas publiés portaient la clé
 * `visibleIf`, que le moteur ignore (il lit `condition`). Les questions
 * s'affichaient donc toujours, sans qu'aucune erreur ne le dise — et la page
 * qui vante les conditions ne les montrait pas.
 *
 * Deux garde-fous : toute clé d'un cas doit exister dans le schéma (les objets
 * y sont fermés), et chaque condition doit agir.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../runtime/engine.js');

const SCHEMA = JSON.parse(fs.readFileSync(path.join(__dirname, '../runtime/formdef.schema.json'), 'utf8'));
const DOSSIER = path.join(__dirname, '../demo/cas');
const CAS = fs.readdirSync(DOSSIER).filter((f) => f.endsWith('.json')).sort();

function charger(fichier) {
  return JSON.parse(fs.readFileSync(path.join(DOSSIER, fichier), 'utf8'));
}

/** Les clés qu'un objet n'a pas le droit de porter, d'après les propriétés du schéma. */
function clesInconnues(objet, proprietes) {
  return Object.keys(objet).filter((k) => !Object.prototype.hasOwnProperty.call(proprietes, k));
}

/** Toutes les conditions d'un cas, avec l'endroit où elles sont posées. */
function conditionsDe(def) {
  const out = [];
  (def.sections || []).forEach((s) => {
    if (s.condition) out.push({ ou: 'étape « ' + s.label + ' »', condition: s.condition });
    (s.fields || []).forEach((f) => {
      if (f.condition) out.push({ ou: 'question « ' + f.colId + ' »', condition: f.condition, champ: f, etape: s });
    });
  });
  return out;
}

describe('les cas de démonstration respectent le schéma', () => {
  assert.ok(CAS.length >= 4, 'au moins les quatre cas publiés');

  CAS.forEach((fichier) => {
    it(fichier + ' : aucune clé inconnue, à aucun niveau', () => {
      const def = charger(fichier);
      const fautes = [];

      clesInconnues(def, SCHEMA.properties).forEach((k) => fautes.push('racine : ' + k));
      (def.sections || []).forEach((s) => {
        clesInconnues(s, SCHEMA.definitions.section.properties)
          .forEach((k) => fautes.push('étape « ' + s.label + ' » : ' + k));
        (s.fields || []).forEach((f) => {
          clesInconnues(f, SCHEMA.definitions.field.properties)
            .forEach((k) => fautes.push('question « ' + f.colId + ' » : ' + k));
        });
      });
      conditionsDe(def).forEach((c) => {
        clesInconnues(c.condition, SCHEMA.definitions.condition.properties)
          .forEach((k) => fautes.push(c.ou + ', condition : ' + k));
      });

      assert.deepEqual(fautes, [], 'le moteur ignore ces clés en silence');
    });

    it(fichier + ' : une condition lit un champ qui existe', () => {
      const def = charger(fichier);
      const colIds = new Set();
      (def.sections || []).forEach((s) => (s.fields || []).forEach((f) => colIds.add(f.colId)));
      conditionsDe(def).forEach((c) => {
        const cible = c.condition.field;
        if (cible) assert.ok(colIds.has(cible), c.ou + ' lit « ' + cible + ' », qui n’existe pas');
      });
    });
  });
});

describe('les conditions des démonstrations agissent vraiment', () => {
  it('« Précisez » n’apparaît que pour « Autre » (relevé de terrain)', () => {
    const def = charger('terrain.json');
    const precision = def.sections.flatMap((s) => s.fields).find((f) => f.colId === 'NaturePrecision');
    assert.ok(precision.condition, 'la question porte une condition');
    assert.equal(Engine.isFieldVisible(precision, { Nature: 'Banc' }, {}), false);
    assert.equal(Engine.isFieldVisible(precision, { Nature: 'Autre' }, {}), true);
  });

  it('« Fréquence » disparaît pour qui ne vient jamais (consultation)', () => {
    const def = charger('consultation.json');
    const frequence = def.sections.flatMap((s) => s.fields).find((f) => f.colId === 'Frequence');
    assert.ok(frequence.condition, 'la question porte une condition');
    assert.equal(Engine.isFieldVisible(frequence, { Lien: 'J’y habite' }, {}), true);
    assert.equal(Engine.isFieldVisible(frequence, { Lien: 'Je n’y viens jamais' }, {}), false);
  });
});

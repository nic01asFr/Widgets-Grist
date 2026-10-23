'use strict';

/*
 * Le réglage des limites dans le compositeur : ce que les champs écrivent dans le FormDef est accepté
 * tel quel par le module des limites. Les fonctions du compositeur sont extraites de builder.html et
 * exécutées sur un FormDef, sans navigateur.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const L = require('../shared/limites.js');
const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'builder.html'), 'utf8');

function extraire(nom) {
  const debut = SOURCE.indexOf('function ' + nom + '(');
  assert.ok(debut > 0, nom);
  let profondeur = 0, i = SOURCE.indexOf('{', debut);
  for (; i < SOURCE.length; i++) {
    if (SOURCE[i] === '{') profondeur++;
    if (SOURCE[i] === '}') { profondeur--; if (profondeur === 0) break; }
  }
  return SOURCE.slice(debut, i + 1);
}

function banc(def) {
  const S = { currentDef: def };
  const appels = { rendus: 0 };
  const code = ['estReference', 'majAlerteLimites', 'onLimite', 'onLimiteChoix'].map(extraire).join('\n');
  const f = new Function('S', 'marquerModifie', 'renderBuilder', code + '; return { onLimite, onLimiteChoix };');
  const api = f(S, () => {}, () => { appels.rendus++; });
  return Object.assign({ S, appels }, api);
}

const def = () => ({
  tableId: 'Inscriptions',
  sections: [{ fields: [
    { colId: 'Atelier', label: 'Atelier', type: 'Choice', widget: 'select' },
    { colId: 'Salle', label: 'Salle', type: 'Ref:Salles', widget: 'select', options: { refTable: 'Salles' } }
  ] }]
});

describe('Compositeur — limites générales', () => {
  it('écrit total, fenêtre, colonne Place et messages, et le module les accepte', () => {
    const d = def(); const b = banc(d);
    b.onLimite('total', '30');
    b.onLimite('ouvertDu', '2026-11-01');
    b.onLimite('jusquau', '2026-11-30');
    b.onLimite('placeCol', 'Place');
    b.onLimite('msg:complet', 'Complet, merci.');
    assert.deepEqual(d.limites, { total: 30, ouvertDu: '2026-11-01', jusquau: '2026-11-30', placeCol: 'Place', messages: { complet: 'Complet, merci.' } });
    assert.deepEqual(L.normaliser(d.limites).erreurs, []);
  });

  it('vider un champ retire la limite, et la dernière retirée supprime tout le bloc', () => {
    const d = def(); const b = banc(d);
    b.onLimite('total', '5'); b.onLimite('msg:ferme', 'Fermé'); b.onLimite('total', ''); b.onLimite('msg:ferme', '');
    assert.equal(d.limites, undefined);
  });

  it('un total qui n\'est pas un entier d\'au moins 1 n\'est pas écrit', () => {
    const d = def(); const b = banc(d);
    b.onLimite('total', '0'); b.onLimite('total', 'abc'); b.onLimite('total', '-3');
    assert.equal(d.limites, undefined);
    b.onLimite('total', '7.9');
    assert.equal(d.limites.total, 7);
  });

  it('les lignes qui ne comptent pas : la colonne puis les valeurs', () => {
    const d = def(); const b = banc(d);
    b.onLimite('saufCol', 'Statut');
    b.onLimite('saufValeurs', 'Annulé, Refusé ,, ');
    assert.deepEqual(d.limites.sauf, { colId: 'Statut', valeurs: ['Annulé', 'Refusé'] });
    b.onLimite('saufCol', '');
    assert.equal(d.limites, undefined);
  });
});

describe('Compositeur — places par choix', () => {
  it('une question à choix : des places par choix, vides = illimité', () => {
    const d = def(); const b = banc(d);
    b.onLimiteChoix(-1, 'ajouter', 'Atelier');
    b.onLimiteChoix(0, 'maxChoix', '12', 'Cuisine');
    b.onLimiteChoix(0, 'maxChoix', '8', 'Jardin');
    b.onLimiteChoix(0, 'maxChoix', '', 'Jardin');
    assert.deepEqual(d.limites.parChoix, [{ colId: 'Atelier', max: { Cuisine: 12 } }]);
    assert.deepEqual(L.normaliser(d.limites).erreurs, []);
  });

  it('le même nombre pour tous les choix', () => {
    const d = def(); const b = banc(d);
    b.onLimiteChoix(-1, 'ajouter', 'Atelier');
    b.onLimiteChoix(0, 'maxCommun', '10');
    assert.equal(d.limites.parChoix[0].max, 10);
  });

  it('une référence porte ses places dans une colonne de la table liée', () => {
    const d = def(); const b = banc(d);
    b.onLimiteChoix(-1, 'ajouter', 'Salle');
    assert.deepEqual(d.limites.parChoix[0], { colId: 'Salle', capaciteCol: '' });
    b.onLimiteChoix(0, 'capaciteCol', 'Capacite');
    assert.deepEqual(d.limites.parChoix[0], { colId: 'Salle', capaciteCol: 'Capacite' });
    assert.deepEqual(L.normaliser(d.limites).erreurs, []);
  });

  it('une limite ajoutée mais pas réglée est dite par le module, jamais ignorée en silence', () => {
    const d = def(); const b = banc(d);
    b.onLimiteChoix(-1, 'ajouter', 'Atelier');
    assert.ok(L.normaliser(d.limites).erreurs.some((e) => /dites le maximum/.test(e)));
  });

  it('retirer une limite supprime le bloc quand c\'était la dernière', () => {
    const d = def(); const b = banc(d);
    b.onLimiteChoix(-1, 'ajouter', 'Atelier');
    b.onLimiteChoix(0, 'retirer');
    assert.equal(d.limites, undefined);
  });

  it('un choix dont le nom porte des apostrophes ou des guillemets est écrit tel quel', () => {
    const d = def(); const b = banc(d);
    b.onLimiteChoix(-1, 'ajouter', 'Atelier');
    b.onLimiteChoix(0, 'maxChoix', '4', 'L\'atelier « du chef »');
    assert.deepEqual(d.limites.parChoix[0].max, { 'L\'atelier « du chef »': 4 });
  });
});

describe('Compositeur — le bloc est dans l\'accueil et son export est branché', () => {
  it('rendu et gestionnaires sont déclarés', () => {
    assert.match(SOURCE, /\$\{renderLimites\(def\)\}/);
    assert.match(SOURCE, /onLimite, onLimiteChoix,/);
    assert.match(SOURCE, /<script src="shared\/limites\.js"><\/script>/);
  });
  it('le choix est lu depuis l\'attribut, pas recomposé dans le gestionnaire (aucune injection par un libellé)', () => {
    assert.match(SOURCE, /data-choix="\$\{esc\(c\)\}" oninput="App\.onLimiteChoix\(\$\{i\}, 'maxChoix', this\.value, this\.getAttribute\('data-choix'\)\)"/);
  });
});

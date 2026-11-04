'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { contenuSkill, verifierSkill } = require('./generer-skill.js');

const fiche = {
  contrat: 'fiche-capacites-0.1', widget: 'demo', version: '1.0.0',
  presentation: { titre: 'Démo', resume: 'Un widget de démonstration.' },
  verbes: { presenter: ['demo_capacites'], traiter: ['demo_synthese'] },
  non_couverts: ['editer'],
  limites: ['Lecture seule.'],
  interfaces: { skill: true, cli: true, mcp: false, webmcp: true, vitrine: true },
};
const commandes = { commandes: [
  { nom: 'demo_capacites', description: 'Présente.', entree: { type: 'object' }, nature: 'pure', ecrit: 'rien' },
  { nom: 'demo_synthese', description: 'Synthétise.', entree: { type: 'object', required: ['lignes'] }, nature: 'pure', ecrit: 'rien' },
] };

describe('generer-skill', () => {
  const texte = contenuSkill({ fiche, commandes });
  it('cite chaque commande et les verbes non couverts', () => {
    assert.match(texte, /`demo_capacites`/);
    assert.match(texte, /`demo_synthese`/);
    assert.match(texte, /Verbes sans commande : editer/);
  });
  it('dit les interfaces non disponibles au lieu de les taire', () => {
    assert.match(texte, /serveur MCP : non disponible/);
  });
  it('porte les interdits communs, dont le refus serveur non promis', () => {
    assert.match(texte, /Ne jamais promettre un refus côté serveur/);
  });
  it('un skill à jour concorde', () => {
    assert.deepEqual(verifierSkill(texte, { fiche, commandes }), []);
  });
  it('un skill périmé est refusé', () => {
    assert.ok(verifierSkill(texte.replace('`demo_synthese`', '`demo_autre`'), { fiche, commandes }).length >= 2);
  });
  it('est déterministe', () => {
    assert.equal(contenuSkill({ fiche, commandes }), texte);
  });
});

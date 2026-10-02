import test from 'node:test';
import assert from 'node:assert/strict';
import { detailEtat, resumerEtats, libelleEtat } from '../lib/eclairage-rendu.js';

const allume = { allume: true, facteurFlux: 1, facteurPuissance: 1, temperatureCouleur: 3000, plages: [], hypotheses: [], raison: 'allumé' };
const abaisse = { ...allume, facteurPuissance: 0.5, plages: ['Abaissement'], raison: 'allumé, Abaissement' };
const eteint = (raison) => ({ allume: false, facteurFlux: 0, facteurPuissance: 0, temperatureCouleur: 3000, plages: [], hypotheses: [], raison });

test('un etat allume ne repete pas « allume » comme raison', () => {
  const d = detailEtat(allume);
  assert.equal(d.libelle, 'allumé');
  assert.equal(d.raison, null);
  assert.equal(d.allume, true);
  assert.equal(d.abaisse, false);
  assert.equal(d.temperatureCouleur, 3000);
});

test('un etat eteint dit pourquoi', () => {
  const d = detailEtat(eteint('statut out_of_service'));
  assert.equal(d.libelle, 'éteint');
  assert.equal(d.raison, 'statut out_of_service');
  assert.equal(d.allume, false);
});

test('un etat abaisse le dit, avec sa plage', () => {
  const d = detailEtat(abaisse);
  assert.equal(d.libelle, 'abaissé à 50 %');
  assert.equal(d.abaisse, true);
  assert.equal(d.raison, 'allumé, Abaissement');
});

test('les hypotheses voyagent jusqu a la fiche', () => {
  const d = detailEtat({ ...allume, hypotheses: ['allumage au coucher du soleil (profil sans heure d’allumage)'] });
  assert.deepEqual(d.hypotheses, ['allumage au coucher du soleil (profil sans heure d’allumage)']);
});

test('pas d etat : rien a dire', () => {
  assert.equal(detailEtat(null), null);
  assert.equal(detailEtat(undefined), null);
  assert.equal(detailEtat('x'), null);
  assert.equal(libelleEtat(null), 'éteint');
});

test('le bilan d une couche compte allumes, abaisses, eteints et classe les raisons', () => {
  const etats = new Map([
    ['mats:0', allume], ['mats:1', eteint('statut out_of_service')], ['mats:2', eteint('hors de la période de validité du matériel')],
    ['mats:3', abaisse], ['mats:4', eteint('statut out_of_service')], ['autre:0', allume],
  ]);
  const b = resumerEtats(etats, 'mats');
  assert.deepEqual({ t: b.total, a: b.allumes, b: b.abaisses, e: b.eteints }, { t: 5, a: 1, b: 1, e: 3 });
  assert.deepEqual(b.raisons, [
    { raison: 'statut out_of_service', n: 2 },
    { raison: 'hors de la période de validité du matériel', n: 1 },
  ]);
});

test('le bilan ne confond pas deux couches dont les identifiants se prefixent', () => {
  const etats = new Map([['mats:0', allume], ['mats2:0', eteint('x')]]);
  assert.equal(resumerEtats(etats, 'mats').total, 1);
  assert.equal(resumerEtats(etats, 'mats2').total, 1);
});

test('un bilan sans etat est vide, sans erreur', () => {
  assert.deepEqual(resumerEtats(new Map(), 'x'), { total: 0, allumes: 0, abaisses: 0, eteints: 0, raisons: [] });
  assert.equal(resumerEtats(null, 'x').total, 0);
});

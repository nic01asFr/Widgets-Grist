/**
 * « Moi » comme valeur de départ : la personne connectée, retrouvée par son courriel.
 *
 * node --test projects/Atlas/tests/moi-formulaire.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEPARTS, LIBELLES_DEPART, departsPossibles, departsValides, valeursDeDepart, moiDansTable } from '../lib/fiche-formulaire.js';

const champ = (colId, type) => ({ colId, type, label: colId });
const def = (...champs) => ({ sections: [{ fields: champs }] });

test('« moi » est un départ connu, avec son libellé', () => {
  assert.ok(DEPARTS.includes('moi'));
  assert.match(LIBELLES_DEPART.moi, /connectée/);
  assert.deepEqual(departsValides({ f1: { Inspecteur: 'moi', X: 'nimporte' } }), { f1: { Inspecteur: 'moi' } });
});

test('« moi » n\'est proposé que quand on sait qui est connecté', () => {
  const c = champ('Inspecteur', 'RefList:Agents');
  assert.equal(departsPossibles(c, { lie: true }).includes('moi'), false);
  assert.equal(departsPossibles(c, { lie: true, moi: true }).includes('moi'), true);
  assert.deepEqual(departsPossibles(champ('Photo', 'Attachments'), { moi: true }), ['vide']);
});

test('moiDansTable : la ligne dont le courriel est le mien, sans tenir compte de la casse ni des espaces', () => {
  const colonnes = [{ colId: 'Agent' }, { colId: 'Email' }];
  const lignes = [{ id: 1, Agent: 'A', Email: 'a@exemple.org' }, { id: 2, Agent: 'B', Email: '  Camille.Martin@Exemple.org ' }];
  assert.equal(moiDansTable(colonnes, lignes, 'camille.martin@exemple.org'), 2);
  assert.equal(moiDansTable(colonnes, lignes, 'inconnu@exemple.org'), null);
  assert.equal(moiDansTable(colonnes, lignes, ''), null);
  assert.equal(moiDansTable([{ colId: 'Agent' }], lignes, 'a@exemple.org'), null, 'pas de colonne de courriel');
  assert.equal(moiDansTable([{ colId: 'Courriel_pro' }], [{ id: 7, Courriel_pro: 'x@y.fr' }], 'x@y.fr'), 7);
});

test('valeursDeDepart : « moi » prend la valeur que le résolveur donne, une liste pour une RefList', () => {
  const d = def(champ('Inspecteurs', 'RefList:Agents'), champ('Auteur', 'Ref:Agents'));
  const r = valeursDeDepart(d, { Inspecteurs: 'moi', Auteur: 'moi' }, { moi: (c) => (c.colId === 'Inspecteurs' ? ['L', 2] : 2) });
  assert.deepEqual(r.valeurs.Inspecteurs, ['2']);
  assert.equal(r.valeurs.Auteur, '2');
  assert.deepEqual(r.preremplis.map((p) => p.depart), ['moi', 'moi']);
});

test('valeursDeDepart : sans identité, « moi » ne préremplit rien — jamais la valeur de quelqu\'un d\'autre', () => {
  const d = def(champ('Inspecteurs', 'RefList:Agents'));
  assert.deepEqual(valeursDeDepart(d, { Inspecteurs: 'moi' }, {}).valeurs, {});
  assert.deepEqual(valeursDeDepart(d, { Inspecteurs: 'moi' }, { moi: () => undefined }).valeurs, {});
});

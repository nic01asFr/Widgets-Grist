// Registre des palettes : alias des anciens noms (mêmes couleurs qu'aujourd'hui), palettes personnalisées par valeur, avertissements connus.
// node --test tests/charte-registre.test.js   (aucun accès réseau, aucune dépendance)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { creerRegistre, tableHeritage, infosHeritage, DEFAUTS } from '../lib/charte/registre.js';
import { PALETTES_HERITAGE, INFOS_HERITAGE } from '../lib/charte/heritage.js';
import { CHARTE_ATLAS } from '../lib/charte/defauts.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(ICI, '..', 'app_v7.js'), 'utf8');

/** Lit un littéral d'objet `const NOM = { ... };` dans la source d'app_v7.js (code du dépôt, évalué tel quel) : le test compare à ce que l'éditeur de style emploie. */
function litteral(nom) {
  const debut = SOURCE.indexOf('const ' + nom + ' = {'); assert.ok(debut >= 0, nom + ' introuvable dans app_v7.js');
  const fin = SOURCE.indexOf('\n};', debut); const corps = SOURCE.slice(SOURCE.indexOf('{', debut), fin + 2);
  return new Function('return ' + corps)();
}

// ---------------------------------------------------------------------------------------------------------------- alias des anciennes palettes
test('alias : les huit noms historiques donnent EXACTEMENT les couleurs de COLOR_PALETTES d\'app_v7.js (lecture de la source)', () => {
  const source = litteral('COLOR_PALETTES'), reg = creerRegistre();
  assert.deepEqual(Object.keys(source), Object.keys(PALETTES_HERITAGE));
  for (const [nom, couleurs] of Object.entries(source)) {
    assert.deepEqual(reg.couleurs(nom), couleurs, nom); assert.deepEqual([...PALETTES_HERITAGE[nom]], couleurs, 'données du registre : ' + nom);
    assert.ok(reg.obtenir(nom), nom); assert.ok(reg.obtenir(nom).alias.includes(nom));
  }
  assert.deepEqual(tableHeritage(reg), source);
});

test('alias : les types et noms affichés sont ceux de PALETTE_INFO d\'app_v7.js', () => {
  const source = litteral('PALETTE_INFO'); assert.deepEqual(infosHeritage(), source); assert.deepEqual(Object.keys(INFOS_HERITAGE), Object.keys(source));
  const reg = creerRegistre(); for (const [nom, i] of Object.entries(source)) assert.equal(reg.obtenir(nom).type, i.type, nom);
});

test('alias : Viridis est la séquentielle continue d\'Atlas (même palette, deux noms)', () => {
  const reg = creerRegistre(); assert.equal(reg.obtenir('Viridis'), reg.obtenir(DEFAUTS.continue)); assert.deepEqual(reg.couleurs('Viridis'), [...CHARTE_ATLAS.donnees.sequentielles.continue]);
  assert.equal(reg.obtenir('Viridis').origine, 'atlas');
});

test('défauts : les nouveaux défauts sont les palettes de la charte « atlas », les noms historiques gardent leurs couleurs', () => {
  const reg = creerRegistre(); const d = CHARTE_ATLAS.donnees;
  assert.deepEqual(reg.couleurs(reg.defaut('qualitative').id), d.qualitative); assert.deepEqual(reg.couleurs(reg.defaut('sequential').id), d.sequentielles.principale);
  assert.deepEqual(reg.couleurs(reg.defaut('divergent').id), d.divergente); assert.deepEqual(reg.couleurs(reg.defaut('continue').id), d.sequentielles.continue);
  assert.notDeepEqual(reg.couleurs('Tableau10'), reg.couleurs(DEFAUTS.qualitative), 'le nouveau défaut qualitatif n\'est plus Tableau 10');
  assert.equal(reg.obtenir('Tableau10').origine, 'heritage');
});

test('repli : une palette inconnue donne le repli demandé, ou undefined ; un identifiant non texte aussi', () => {
  const reg = creerRegistre();
  assert.equal(reg.obtenir('inconnue'), undefined); assert.deepEqual(reg.couleurs('inconnue', 'Viridis'), reg.couleurs('Viridis')); assert.equal(reg.couleurs('inconnue'), undefined);
  for (const v of [null, undefined, 12, {}, [], '__proto__', 'constructor', 'toString']) assert.equal(reg.obtenir(v), undefined, String(v));
});

// ---------------------------------------------------------------------------------------------------------------- contenu des entrées
test('entrées : id, nom, type, couleurs, usages, avertissements connus, alias ; figées ; couleurs hexadécimales', () => {
  const reg = creerRegistre(), liste = reg.lister();
  assert.ok(liste.length >= 14); assert.equal(new Set(liste.map((p) => p.id)).size, liste.length);
  for (const p of liste) {
    for (const k of ['id', 'nom', 'type', 'couleurs', 'usages', 'avertissements', 'alias', 'origine']) assert.ok(k in p, p.id + ' ' + k);
    assert.ok(['qualitative', 'sequential', 'divergent'].includes(p.type)); assert.ok(Object.isFrozen(p) && Object.isFrozen(p.couleurs));
    for (const c of p.couleurs) assert.match(c, /^#[0-9a-fA-F]{6}$/);
    for (const a of p.avertissements) { for (const k of ['code', 'niveau', 'chemin', 'valeur', 'mesure', 'conseil']) assert.ok(k in a, p.id + ' ' + a.code + ' ' + k); }
  }
  assert.deepEqual(reg.lister({ type: 'divergent' }).map((p) => p.id).sort(), ['atlas-divergente', 'contraste-eleve-divergente', 'heritage-rdylgn']);
  assert.throws(() => { 'use strict'; reg.obtenir('Viridis').couleurs.push('#000000'); });
});

test('avertissements connus : rouge-vert signalé chiffré, palettes d\'Atlas sans avertissement d\'attention', () => {
  const reg = creerRegistre(), rg = reg.obtenir('RdYlGn');
  const confondue = rg.avertissements.find((a) => a.code === 'divergente-confondue'); assert.ok(confondue); assert.ok(confondue.mesure.pire < 10); assert.match(confondue.conseil, /bleu et orange/);
  assert.ok(rg.avertissements.some((a) => a.code === 'ecart-classes-voisines'));
  assert.ok(reg.obtenir('Tableau10').avertissements.some((a) => a.code === 'ecart-qualitative'));
  for (const id of ['atlas-qualitative', 'atlas-sequentielle', 'atlas-continue', 'atlas-divergente', 'contraste-eleve-qualitative', 'contraste-eleve-sequentielle', 'contraste-eleve-divergente'])
    assert.deepEqual(reg.obtenir(id).avertissements.filter((a) => a.niveau === 'attention'), [], id);
});

// ---------------------------------------------------------------------------------------------------------------- palettes personnalisées
test('personnalisées : enregistrement validé, normalisé, avertissements mesurés, aucune interférence entre registres', () => {
  const reg = creerRegistre(), autre = creerRegistre();
  const r = reg.enregistrer({ id: 'equipe-seq', nom: 'Équipe', type: 'sequential', couleurs: ['#FFF', 'rgb(40, 80, 160)'], usages: ['mesure'] });
  assert.equal(r.ok, true); assert.deepEqual([...r.palette.couleurs], ['#ffffff', '#2850a0']); assert.equal(r.palette.origine, 'personnalisee'); assert.ok(Array.isArray(r.palette.avertissements));
  assert.equal(reg.obtenir('equipe-seq'), r.palette); assert.equal(autre.obtenir('equipe-seq'), undefined);
});

test('personnalisées : refus d\'un identifiant ou d\'un alias déjà pris, d\'un type ou d\'une couleur invalide ; enregistrer deux fois la même est sans effet', () => {
  const reg = creerRegistre(); const ok = { id: 'perso', type: 'qualitative', couleurs: ['#111111', '#eeeeee'] };
  assert.equal(reg.enregistrer(ok).ok, true); assert.equal(reg.enregistrer(ok).inchangee, true); assert.equal(reg.lister({ origine: 'personnalisee' }).length, 1);
  assert.equal(reg.enregistrer({ ...ok, couleurs: ['#111111', '#dddddd'] }).ok, false, 'même id, couleurs différentes');
  for (const id of ['atlas-qualitative', 'heritage-set2', 'Viridis', 'Tableau10']) { const e = reg.enregistrer({ ...ok, id }); assert.equal(e.ok, false, id); assert.equal(e.erreurs[0].code, 'id-pris'); }
  for (const mauvais of [{ ...ok, id: 'x y' }, { ...ok, id: '../x' }, { ...ok, id: '__proto__' }, { ...ok, type: 'autre' }, { ...ok, id: 'b', couleurs: ['#111', 'url(x)'] }, { ...ok, id: 'c', couleurs: ['#111'] }, null, 'texte', [], { id: 'd' }]) assert.equal(reg.enregistrer(mauvais).ok, false, JSON.stringify(mauvais));
  assert.equal(reg.lister({ origine: 'personnalisee' }).length, 1);
});

test('personnalisées : plafond de 32 palettes, suppression des seules personnalisées', () => {
  const reg = creerRegistre();
  for (let i = 0; i < 32; i++) assert.equal(reg.enregistrer({ id: 'p' + i, type: 'qualitative', couleurs: ['#111111', '#eeeeee'] }).ok, true);
  assert.equal(reg.enregistrer({ id: 'p32', type: 'qualitative', couleurs: ['#111111', '#eeeeee'] }).erreurs[0].code, 'trop-de-palettes');
  assert.equal(reg.supprimer('p3'), true); assert.equal(reg.obtenir('p3'), undefined); assert.equal(reg.supprimer('atlas-qualitative'), false); assert.equal(reg.supprimer('inconnue'), false); assert.ok(reg.obtenir('atlas-qualitative'));
});

test('par valeur : exporter rend les couleurs (pas des références), importer les réenregistre après validation, aller-retour stable', () => {
  const reg = creerRegistre(); reg.enregistrer({ id: 'a', nom: 'A', type: 'sequential', couleurs: ['#f5eefa', '#3d1a55'], usages: ['mesure'] }); reg.enregistrer({ id: 'b', type: 'qualitative', couleurs: ['#111111', '#eeeeee'] });
  const sortie = reg.exporter(); assert.equal(sortie.length, 2); assert.deepEqual(sortie[0], { id: 'a', nom: 'A', type: 'sequential', couleurs: ['#f5eefa', '#3d1a55'], usages: ['mesure'] });
  assert.ok(sortie.every((p) => Array.isArray(p.couleurs) && p.couleurs.every((c) => /^#[0-9a-f]{6}$/.test(c))), 'des couleurs, pas des références');
  const projet = JSON.parse(JSON.stringify(sortie)), neuf = creerRegistre();
  assert.deepEqual(neuf.importer(projet), { importees: 2, refusees: [] }); assert.deepEqual(neuf.exporter(), sortie);
  assert.deepEqual(neuf.importer(projet), { importees: 2, refusees: [] }, 'idempotent');
});

test('par valeur : importer écarte ce qui est invalide ou en collision, sans interrompre le reste', () => {
  const reg = creerRegistre(), r = reg.importer([{ id: 'bon', type: 'sequential', couleurs: ['#fff', '#000'] }, { id: 'Viridis', type: 'sequential', couleurs: ['#fff', '#000'] }, { id: 'mauvais', type: 'sequential', couleurs: ['#fff', 'x'] }, 'texte', null]);
  assert.equal(r.importees, 1); assert.deepEqual(r.refusees.map((x) => x.rang), [1, 2, 3, 4]); assert.deepEqual(reg.importer('pas une liste'), { importees: 0, refusees: [] });
  assert.equal(creerRegistre().importer(Array.from({ length: 100 }, (_, i) => ({ id: 'q' + i, type: 'qualitative', couleurs: ['#111', '#eee'] }))).importees, 32, 'au plus 32 palettes lues');
});

test('résolution d\'une référence : un nom (registre) ou une palette par valeur, jamais enregistrée par l\'appel', () => {
  const reg = creerRegistre();
  assert.equal(reg.resoudre('Viridis'), reg.obtenir('Viridis'));
  const v = reg.resoudre({ couleurs: ['#FFF', '#000'], type: 'sequential' }); assert.deepEqual(v.couleurs, ['#ffffff', '#000000']); assert.equal(v.origine, 'valeur'); assert.equal(reg.obtenir('valeur'), undefined);
  assert.equal(reg.resoudre({ couleurs: ['#fff', 'url(x)'] }), undefined); assert.equal(reg.resoudre(null), undefined); assert.equal(reg.resoudre(12), undefined);
});

// Composant carte BI : couches administratives (aucun accès réseau).
// node --test tests/bi-admin*.test.js tests/bi-choroplethe.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculerClasses, couleursClasses, libelleClasse, modeleChoroplethe, lignesChoroplethe, resumeChoroplethe, lignesClassement, formaterNombre, motifHachure, classesTropClaires } from '../lib/bi/choroplethe.js';
import { contraste } from '../lib/bi/echelles.js';
import { creerPont, validerCommande, commande, executerBatch, validerArguments, COMMANDES, COMMANDES_0_3, VERSION, EVENEMENTS, BATCH_MAX } from '../lib/bi/pont.js';

const THEME = { sequentielle: ['#C6BFD8', '#8F88B0', '#6F6694', '#26312B'], divergente: ['#A8421F', '#F4F7FC', '#1E6B3E'] };
const vals = (o) => new Map(Object.entries(o));

test('classes : quantiles, intervalles égaux, bornes manuelles, valeurs distinctes insuffisantes', () => {
  const v = Array.from({ length: 101 }, (_, i) => i);
  assert.deepEqual(calculerClasses(v, { methode: 'quantiles', classes: 4 }).seuils, [25, 50, 75]); assert.deepEqual(calculerClasses(v, { methode: 'egaux', classes: 4 }).seuils, [25, 50, 75]);
  const m = calculerClasses(v, { methode: 'manuelle', bornes: [50, 10, 10, 'x'] }); assert.deepEqual(m.seuils, [10, 50]); assert.equal(m.classesEffectives, 3);
  const peu = calculerClasses([1, 1, 1, 2], { methode: 'quantiles', classes: 5 }); assert.ok(peu.classesEffectives < 5 && /insuffisantes/.test(peu.avertissement));
  assert.throws(() => calculerClasses(v, { methode: 'jenks' }), /méthode inconnue/); assert.deepEqual(calculerClasses([], { classes: 5 }).seuils, []);
  assert.ok(calculerClasses(v, { methode: 'manuelle' }).avertissement);
});
test('couleurs : séquentielle du clair au sombre ; divergente selon la position par rapport au centre', () => {
  const s = couleursClasses('sequentielle', [10, 20, 30], [], THEME); assert.equal(s.length, 4); assert.equal(s[0], '#c6bfd8'); assert.equal(s[3], '#26312b');
  const d = couleursClasses('divergente', [-5, 0, 5], [-10, -2, 3, 10], THEME, 0); assert.equal(d.length, 4);
  assert.notEqual(d[0], d[3]); const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); assert.ok(rgb(d[0])[0] > rgb(d[0])[1] && rgb(d[3])[1] > rgb(d[3])[0], 'bas = tirant sur le rouge-brun, haut = tirant sur le vert');
  const un = couleursClasses('divergente', [0], [-1, 1], THEME, 0); assert.equal(un.length, 2);
});
test('libellés et formats : intervalles hauts inclusifs, nombres à la française', () => {
  assert.equal(libelleClasse(0, [10, 20]), '≤ 10'); assert.equal(libelleClasse(1, [10, 20]), '10 – 20'); assert.equal(libelleClasse(2, [10, 20]), '> 20'); assert.equal(libelleClasse(0, []), 'Toutes les valeurs');
  assert.equal(formaterNombre(1234.5, 1).replace(/\s/g, ' '), '1 234,5'); assert.equal(formaterNombre(null), '–'); assert.equal(formaterNombre(0.256), '0,26');
});
test('modèle : les unités sans donnée ne sont PAS dans la classe la plus basse', () => {
  const m = modeleChoroplethe(vals({ a: 0, b: 5, c: 10, d: 20, e: null, f: undefined, g: NaN }), { classes: 3, theme: THEME });
  assert.equal(m.total, 7); assert.equal(m.renseignees, 4); assert.equal(m.sansValeur, 3); assert.equal(m.sansDonnee.compte, 3); assert.equal(m.sansDonnee.hachure, true);
  assert.equal(m.classes.reduce((s, c) => s + c.compte, 0), 4, 'seules les valeurs présentes sont classées');
  assert.equal(m.parUnite.get('e').classe, -1); assert.equal(m.parUnite.get('e').couleur, null); assert.equal(m.parUnite.get('a').classe, 0, 'le zéro réel est bien dans la première classe');
  assert.notEqual(m.parUnite.get('a').couleur, m.sansDonnee.couleur);
});
test('modèle : petits effectifs comptés par classe et au total ; légende, tableau, résumé cohérents', () => {
  const m = modeleChoroplethe(vals({ a: 1, b: 2, c: 3, d: 40, e: null }), { classes: 2, theme: THEME, petits: new Set(['a', 'd', 'e']), unite: 'pour 1 000 hab.', titre: 'Essai' });
  assert.equal(m.petitsEffectifs, 2, 'e est sans donnée : non compté'); const L = lignesChoroplethe(m);
  assert.equal(L.length, m.classes.length + 1); assert.equal(L.reduce((s, l) => s + l.compte, 0), 5); assert.equal(L.at(-1).classe, 'Sans donnée'); assert.equal(L.reduce((s, l) => s + l.part, 0).toFixed(0), '100');
  const t = resumeChoroplethe(m); assert.match(t, /4 unité\(s\) renseignée\(s\) sur 5/); assert.match(t, /1 sans donnée/); assert.match(t, /2 à petit effectif/); assert.match(t, /pour 1 000 hab\./);
});
test('modèle divergent : centre explicite, classes de part et d\'autre', () => {
  const m = modeleChoroplethe(vals({ a: -8, b: -2, c: 1, d: 9 }), { classes: 4, palette: 'divergente', centre: 0, theme: THEME, methode: 'egaux' });
  assert.equal(m.centre, 0); assert.ok(m.parUnite.get('a').couleur !== m.parUnite.get('d').couleur);
});
test('classement : tri par valeur / nom / code, rang stable, sans donnée toujours en fin de liste', () => {
  const unites = [['11', 'Zeta', 5], ['22', 'Alpha', 50], ['33', 'Béta', null], ['44', 'Gamma', 50]].map(([code, nom, v]) => ({ properties: { code, nom, population: 1000 } , v }));
  const m = modeleChoroplethe(new Map(unites.map((u) => [u.properties.code, u.v])), { classes: 2, theme: THEME });
  const l = lignesClassement(unites, m); assert.deepEqual(l.map((x) => x.code), ['22', '44', '11', '33']); assert.deepEqual(l.map((x) => x.rang), [1, 1, 3, null]);
  const asc = lignesClassement(unites, m, { ordre: 'asc' }); assert.deepEqual(asc.map((x) => x.code), ['11', '22', '44', '33']);
  const nom = lignesClassement(unites, m, { tri: 'nom', ordre: 'asc' }); assert.deepEqual(nom.map((x) => x.nom), ['Alpha', 'Gamma', 'Zeta', 'Béta'], 'sans donnée en dernier même au tri par nom');
});
test('hachure : motif RGBA 8x8 diagonal, deux pixels sur huit par ligne', () => {
  const p = motifHachure('#336699', 8, 2); assert.equal(p.width, 8); assert.equal(p.data.length, 8 * 8 * 4);
  let opaques = 0; for (let i = 3; i < p.data.length; i += 4) if (p.data[i] > 0) opaques++; assert.equal(opaques, 16); assert.deepEqual([p.data[0], p.data[1], p.data[2]], [0x33, 0x66, 0x99]);
});
test('contraste : une classe claire proche du fond est signalée', () => {
  const m = modeleChoroplethe(vals({ a: 1, b: 100 }), { classes: 2, theme: { sequentielle: ['#f6f8fc', '#26312b'] } });
  assert.deepEqual(classesTropClaires(m, '#f4f7fc'), ['0']); assert.deepEqual(classesTropClaires(m, '#000000'), []);
});

// ---- contrat 0.3 : pont, rétrocompatibilité, lot d'ordres ----
test('contrat 0.3 : commandes ajoutées, événements, rétrocompatibilité 0.2', () => {
  assert.equal(VERSION, '0.3'); for (const c of COMMANDES_0_3) assert.ok(c in COMMANDES, c); assert.ok(Object.keys(COMMANDES).length >= 28);
  for (const e of ['layer', 'progress', 'drill', 'statistique']) assert.ok(EVENEMENTS.includes(e), e);
  const ctx = { origine: 'https://hote.test', autorisees: ['https://hote.test'] };
  assert.equal(validerCommande({ ...commande('ping', [], 'a'), version: '0.2' }, ctx).ok, true, 'un hôte 0.2 reste servi');
  assert.equal(validerCommande({ ...commande('setFilter', ['f', null], 'a'), version: '0.2' }, ctx).ok, true);
  assert.equal(validerCommande({ ...commande('drillUp', [], 'a'), version: '0.2' }, ctx).code, 'version', 'une commande 0.3 exige la version 0.3');
  assert.equal(validerCommande(commande('drillUp', [], 'a'), ctx).ok, true);
  assert.equal(validerCommande(commande('setChoropleth', ['admin-region'], 'a'), ctx).code, 'argument');
  assert.equal(validerCommande(commande('addAdminLayer', ['region', { source: 'ign' }], 'a'), ctx).ok, true);
  assert.equal(validerCommande(commande('drillDown', ['admin-region', 93], 'a'), ctx).code, 'argument', 'le code d\'unité est une chaîne');
  assert.equal(validerCommande(commande('getRows', ['admin-region', { tri: 'nom' }], 'a'), ctx).ok, true);
  assert.equal(validerCommande({ ...commande('ping', [], 'a'), version: '0.4' }, ctx).code, 'version');
});
test('batch : exécution ordonnée, arrêt à la première erreur, validation de chaque ordre, plafond', async () => {
  const trace = []; const api = { ping: () => 'pong', select: (id) => { trace.push(id); return id; }, flyTo: () => { throw new Error('carte absente'); }, batch: () => 1 };
  const r = await executerBatch(api, [{ cmd: 'select', args: [1] }, { cmd: 'ping' }, { cmd: 'select', args: [2] }]);
  assert.deepEqual([r.ok, r.ko, r.nonExecutes], [3, 0, 0]); assert.deepEqual(trace, [1, 2]); assert.equal(r.resultats[1].valeur, 'pong');
  trace.length = 0; const e = await executerBatch(api, [{ cmd: 'select', args: [1] }, { cmd: 'flyTo', args: [{}] }, { cmd: 'select', args: [3] }]);
  assert.deepEqual([e.ok, e.ko, e.nonExecutes], [1, 1, 1]); assert.equal(e.resultats[1].erreur, 'carte absente'); assert.equal(e.resultats[2].nonExecute, true); assert.deepEqual(trace, [1], 'l\'ordre suivant n\'est pas exécuté');
  const c = await executerBatch(api, [{ cmd: 'flyTo', args: [{}] }, { cmd: 'select', args: [4] }], { arret: 'continuer' }); assert.deepEqual([c.ok, c.ko], [1, 1]);
  const bad = await executerBatch(api, [{ cmd: 'exec' }, { cmd: 'batch', args: [[]] }, { cmd: 'select', args: [] }, 'x', { cmd: 'select', args: [1, 2] }], { arret: 'continuer' });
  assert.equal(bad.ko, 5); assert.match(bad.resultats[0].erreur, /inconnue/); assert.match(bad.resultats[1].erreur, /imbrique/); assert.match(bad.resultats[2].erreur, /manquant/);
  await assert.rejects(executerBatch(api, new Array(BATCH_MAX + 1).fill({ cmd: 'ping' })), /au plus/); await assert.rejects(executerBatch(api, 'x'), /liste/);
  assert.equal(validerArguments('select', [1]), null);
});
test('batch par le pont : un seul résultat, les événements du lot sont marqués api', async () => {
  const sortie = []; const api = { select: (id) => { pont.emettre('select', { featureId: id }); return id; }, batch: (o, op) => executerBatch(api, o, op) };
  const pont = creerPont({ api, envoyer: (m) => sortie.push(m), autorisees: ['https://hote.test'] });
  await pont.recevoir(commande('batch', [[{ cmd: 'select', args: [1] }, { cmd: 'select', args: [2] }]], 'b'), 'https://hote.test');
  const res = sortie.filter((m) => m.type === 'resultat'); const ev = sortie.filter((m) => m.type === 'select');
  assert.equal(res.length, 1, 'un seul accusé pour le lot'); assert.equal(res[0].valeur.ok, 2); assert.equal(ev.length, 2); assert.ok(ev.every((m) => m.origine === 'api'));
});

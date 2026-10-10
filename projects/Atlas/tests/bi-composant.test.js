// Composant carte BI : agrégats, échelles, légende, pont, lecture du temps.
// node --test tests/bi-composant.test.js   (aucun accès réseau)
import test from 'node:test';
import assert from 'node:assert/strict';
import { agreger, versMercator, depuisMercator, aireMaille } from '../lib/bi/agregats.js';
import { contraste, niveauContraste, rampe, echantillonner, seuilsQuantiles, seuilsEgaux, classeDe, stopsGradues, divergente, melanger } from '../lib/bi/echelles.js';
import { modeleLegende, lignesLegende, resumeTexte, libelleBorne } from '../lib/bi/legende.js';
import { creerPont, validerCommande, commande, versionsCompatibles, VERSION, COMMANDES } from '../lib/bi/pont.js';
import { creerLecture, valeursDuDomaine, fenetre } from '../lib/bi/lecture-temps.js';
import { comptesParClasse } from '../lib/classes.js';
import { buildControlPredicate } from '../lib/controls.js';
import { expressionCouleurDeclarative } from '../lib/declarative-style.js';

const pt = (lng, lat, props = {}, id) => ({ type: 'Feature', id, properties: props, geometry: { type: 'Point', coordinates: [lng, lat] } });
const nuage = (n, seed = 1) => { let s = seed; const r = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; return Array.from({ length: n }, (_, i) => pt(5.2 + r() * 0.4, 43.2 + r() * 0.2, { v: Math.round(r() * 100), cat: ['A', 'B', 'C'][i % 3] }, i + 1)); };

// ---- agrégats ----
test('agrégats : le nombre de points est conservé (carré et hexagone)', () => {
  const f = nuage(2000);
  for (const forme of ['carre', 'hexagone']) { const g = agreger(f, { taille: 400, forme }); assert.equal(g.features.reduce((s, x) => s + x.properties.n, 0), 2000, forme); }
});
test('agrégats : somme, moyenne, min et max d\'un champ', () => {
  const f = [pt(5, 43, { v: 10 }), pt(5.00001, 43.00001, { v: 30 }), pt(5.00002, 43.00001, { v: 'x' })];
  const g = agreger(f, { taille: 1000, champ: 'v' }); assert.equal(g.features.length, 1);
  const p = g.features[0].properties; assert.deepEqual([p.n, p.somme, p.moyenne, p.min, p.max], [3, 40, 20, 10, 30]);
});
test('agrégats : un point est dans le polygone de sa maille', () => {
  const dansPoly = (pt_, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt_[1]) !== (yj > pt_[1]) && pt_[0] < ((xj - xi) * (pt_[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
  for (const forme of ['carre', 'hexagone']) { const f = nuage(300, 7); const g = agreger(f, { taille: 800, forme, garderIds: true });
    const parId = new Map(f.map((x) => [x.id, x.geometry.coordinates])); let ok = 0;
    for (const m of g.features) for (const id of m.properties.ids) { assert.ok(dansPoly(parId.get(id), m.geometry.coordinates[0]), forme + ' id ' + id); ok++; }
    assert.equal(ok, 300); }
});
test('agrégats : la maille mesure la taille demandée en mètres (correction de latitude)', () => {
  const dist = (a, b) => { const R = 6371008.8, d = Math.PI / 180, dl = (b[0] - a[0]) * d, dp = (b[1] - a[1]) * d, h = Math.sin(dp / 2) ** 2 + Math.cos(a[1] * d) * Math.cos(b[1] * d) * Math.sin(dl / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  for (const lat of [0, 43, 60]) { const g = agreger([pt(5, lat), pt(5.0001, lat + 0.0001)], { taille: 500, forme: 'carre' }); const r = g.features[0].geometry.coordinates[0];
    const cote = dist(r[0], r[1]); assert.ok(Math.abs(cote - 500) / 500 < 0.02, 'lat ' + lat + ' : ' + cote.toFixed(1)); }
});
test('agrégats : l\'aller-retour Mercator est exact et les entrées vides sont tolérées', () => {
  const [x, y] = versMercator(5.4, 43.3); const [lng, lat] = depuisMercator(x, y); assert.ok(Math.abs(lng - 5.4) < 1e-9 && Math.abs(lat - 43.3) < 1e-9);
  assert.equal(agreger([], {}).features.length, 0); assert.equal(agreger([{ geometry: null }], {}).features.length, 0);
  assert.ok(aireMaille(100, 'hexagone') > aireMaille(100, 'carre') * 2.5);
});

// ---- échelles ----
test('échelles : contraste WCAG connu et niveaux', () => {
  assert.ok(Math.abs(contraste('#000000', '#ffffff') - 21) < 1e-6);
  assert.ok(Math.abs(contraste('#777777', '#ffffff') - 4.48) < 0.05);
  assert.equal(niveauContraste(21), 'AAA'); assert.equal(niveauContraste(4.6), 'AA'); assert.equal(niveauContraste(2, true), 'insuffisant'); assert.equal(contraste('#zzz', '#fff'), null);
});
test('échelles : rampe continue, échantillons et divergente', () => {
  const r = rampe(['#000000', '#ffffff']); assert.equal(r(0), '#000000'); assert.equal(r(1), '#ffffff'); assert.equal(r(0.5), '#808080'); assert.equal(r(-3), '#000000'); assert.equal(r(NaN), '#000000');
  assert.deepEqual(echantillonner(['#000000', '#ffffff'], 3), ['#000000', '#808080', '#ffffff']);
  const d = divergente('#ff0000', '#ffffff', '#0000ff'); assert.equal(d(0), '#ffffff'); assert.equal(d(-1), '#ff0000'); assert.equal(d(1), '#0000ff'); assert.equal(melanger('#000000', '#ffffff', 0.5), '#808080');
});
test('échelles : quantiles, intervalles égaux, classes hautes inclusives', () => {
  const v = Array.from({ length: 101 }, (_, i) => i);
  assert.deepEqual(seuilsQuantiles(v, 4), [25, 50, 75]); assert.deepEqual(seuilsEgaux(v, 4), [25, 50, 75]);
  assert.deepEqual(seuilsQuantiles([5, 5, 5, 5], 3), [5]); assert.deepEqual(seuilsEgaux([5, 5], 3), []);
  assert.equal(classeDe(25, [25, 50]), 0); assert.equal(classeDe(25.01, [25, 50]), 1); assert.equal(classeDe(NaN, [25]), -1);
  const st = stopsGradues([10, 20], ['#111111', '#222222', '#333333']); assert.deepEqual(st.map((s) => [s.lower, s.upper]), [[undefined, 10], [10, 20], [20, undefined]]);
});

// ---- légende ----
test('légende : les comptes graduées égalent ceux d\'Atlas (classes.js) et la somme est le total', () => {
  const f = nuage(500, 3); const stops = stopsGradues([25, 50, 75], ['#a', '#b', '#c', '#d']).map((s) => ({ ...s }));
  const m = modeleLegende({ kind: 'graduated', field: 'v', stops }, f);
  assert.equal(m.classes.reduce((s, c) => s + c.compte, 0) + 0, 500);
  const atlas = comptesParClasse(f, 'v', stops); const nôtres = m.classes.map((c) => c.compte);
  assert.deepEqual(nôtres.slice(0, stops.length), Array.from(atlas.comptes ?? atlas).slice(0, stops.length));
});
test('légende : catégories, valeurs sans classe, lignes et résumé texte', () => {
  const f = [pt(0, 0, { c: 'A' }), pt(0, 0, { c: 'a' }), pt(0, 0, { c: 'B' }), pt(0, 0, {}), pt(0, 0, { c: 'Z' })];
  const m = modeleLegende({ kind: 'categorized', field: 'c', stops: [{ value: 'A', color: '#1' }, { value: 'B', color: '#2' }] }, f);
  assert.deepEqual(m.classes.map((c) => [c.libelle, c.compte]), [['A', 2], ['B', 1], ['(sans valeur)', 2]]);
  assert.equal(lignesLegende(m)[0].part, 40); assert.match(resumeTexte(m, 'Famille'), /Famille — 5 éléments \(A : 2 ; B : 1 ; \(sans valeur\) : 2\)\./);
  assert.equal(libelleBorne(null, 5), '≤ 5'); assert.equal(libelleBorne(5, null), '> 5'); assert.equal(libelleBorne(1, 2), '1 – 2');
});

// ---- Atlas réutilisé : filtres et expression de couleur ----
test('réutilisation : le prédicat de contrôles d\'Atlas filtre une couche BI', () => {
  const layer = { geojson: { type: 'FeatureCollection', features: nuage(300, 5) }, controls: [{ id: 'c1', field: 'cat', type: 'select', active: true, values: ['A', 'B'] }, { id: 'c2', field: 'v', type: 'range', active: true, min: 20, max: 60 }] };
  const pred = buildControlPredicate(layer); const n = layer.geojson.features.filter(pred).length;
  const attendu = layer.geojson.features.filter((f) => ['A', 'B'].includes(f.properties.cat) && f.properties.v >= 20 && f.properties.v <= 60).length;
  assert.equal(n, attendu); assert.ok(n > 0);
});
test('réutilisation : l\'expression de couleur d\'Atlas est construite pour catégories et classes', () => {
  assert.equal(expressionCouleurDeclarative({ kind: 'single', color: '#123456' }), '#123456');
  assert.equal(expressionCouleurDeclarative({ kind: 'categorized', field: 'c', stops: [{ value: 'A', color: '#1' }] }, '#999')[0], 'match');
  assert.equal(expressionCouleurDeclarative({ kind: 'graduated', field: 'v', stops: stopsGradues([10], ['#1', '#2']) }, '#999')[0], 'let');
});

// ---- pont ----
const hote = (cmd, args, id = 'x') => commande(cmd, args, id);
test('pont : validation de forme, source, origine, version, commande et arguments', () => {
  const ctx = { origine: 'https://hote.test', autorisees: ['https://hote.test'] };
  assert.equal(validerCommande(hote('ping', []), ctx).ok, true);
  assert.equal(validerCommande(null, ctx).code, 'forme');
  assert.equal(validerCommande({ source: 'autre' }, ctx).ignorer, true);
  assert.equal(validerCommande(hote('ping', []), { origine: 'https://pirate.test', autorisees: ['https://hote.test'] }).code, 'origine');
  assert.equal(validerCommande(hote('ping', []), { origine: 'https://pirate.test', autorisees: ['*'] }).code, 'origine', "le joker n'existe plus");
  assert.equal(validerCommande(hote('ping', []), { origine: '*', autorisees: ['*'] }).code, 'origine');
  assert.equal(validerCommande(hote('ping', []), { origine: 'null', autorisees: ['null'] }).code, 'origine', 'origine opaque refusée');
  assert.equal(validerCommande(hote('ping', []), { origine: '', autorisees: [''] }).code, 'origine');
  assert.equal(validerCommande(hote('ping', []), { origine: 'https://hote.test', autorisees: [] }).code, 'origine', 'liste vide : tout est refusé');
  assert.equal(validerCommande({ ...hote('ping', []), version: '0.1' }, ctx).code, 'version');
  assert.equal(validerCommande(hote('exec', []), ctx).code, 'commande');
  assert.equal(validerCommande(hote('setLayerVisibility', ['a']), ctx).code, 'argument');
  assert.equal(validerCommande(hote('setLayerVisibility', ['a', 'oui']), ctx).code, 'argument');
  assert.equal(validerCommande(hote('ping', [1]), ctx).code, 'argument');
  assert.equal(validerCommande(hote('select', [null]), ctx).ok, true);
  assert.ok(versionsCompatibles('0.3') && !versionsCompatibles('0.2') && !versionsCompatibles('0.4') && !versionsCompatibles('1.2') && !versionsCompatibles(undefined));
});
test('pont : résultat, erreur d\'API, rejet sans exécution et anti-boucle (origine api)', async () => {
  const sortie = []; let appels = 0;
  const api = { ping: () => 'pong', select: (id) => { appels++; pont.emettre('select', { featureId: id }); return id; }, flyTo: () => { throw new Error('carte absente'); } };
  const pont = creerPont({ api, envoyer: (m) => sortie.push(m), autorisees: ['https://o.test'] });
  const o = 'https://o.test';
  await pont.recevoir(hote('ping', [], 'a'), o); assert.deepEqual([sortie[0].ok, sortie[0].valeur, sortie[0].id], [true, 'pong', 'a']);
  sortie.length = 0; await pont.recevoir(hote('select', [7], 'b'), o);
  assert.equal(sortie[0].type, 'select'); assert.equal(sortie[0].origine, 'api'); assert.equal(sortie[1].valeur, 7);
  sortie.length = 0; pont.emettre('select', { featureId: 8 }); assert.equal(sortie[0].origine, 'utilisateur');
  sortie.length = 0; await pont.recevoir(hote('flyTo', [{}], 'c'), o); assert.deepEqual([sortie[0].ok, sortie[0].erreur], [false, 'carte absente']);
  sortie.length = 0; await pont.recevoir({ ...hote('select', [1], 'd'), version: '9.9' }, o); assert.equal(sortie[0].ok, false); assert.equal(appels, 1, 'aucune exécution sur une version incompatible');
  assert.ok(Object.keys(COMMANDES).length >= 14 && VERSION === '0.3');
});

// ---- lecture temporelle ----
test('lecture temporelle : domaine, fenêtres, boucle et arrêt', () => {
  assert.deepEqual(valeursDuDomaine(2019, 2024, 1), [2019, 2020, 2021, 2022, 2023, 2024]); assert.deepEqual(valeursDuDomaine(0, 10, 4), [0, 4, 8, 10]); assert.deepEqual(valeursDuDomaine(5, 1, 1), []);
  assert.deepEqual(fenetre({ mode: 'instant', t: 2021, min: 2019 }), { min: 2021, max: 2021 }); assert.deepEqual(fenetre({ mode: 'cumul', t: 2021, min: 2019 }), { min: 2019, max: 2021 }); assert.deepEqual(fenetre({ mode: 'glissante', t: 2021, min: 2019, largeur: 2 }), { min: 2019, max: 2021 });
  const l = creerLecture({ min: 2019, max: 2021, pas: 1, parSeconde: 2, boucle: true }); assert.equal(l.avancer(1000), null); l.demarrer();
  assert.equal(l.avancer(250), null); assert.equal(l.avancer(250), 2020); assert.equal(l.avancer(1000), 2019, 'deux pas depuis 2020 : on boucle sur 2019');
  const m = creerLecture({ min: 1, max: 3, boucle: false, parSeconde: 10 }); m.demarrer(); assert.equal(m.avancer(1000), 3); assert.equal(m.enCours(), false);
  assert.equal(m.poser(2), 2);
});

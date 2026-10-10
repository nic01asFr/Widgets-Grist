// node --test essais-trafic/tests/*.test.js   (aucun acces reseau)
// Giratoire en systeme OUVERT (des vehicules entrent par les extremites des branches, sortent par les autres) :
// mecanique du banc, cedez-le-passage roulant, ilot separateur, et NON-REGRESSION de la capacite contre un modele de reference.
const test = require('node:test'), assert = require('node:assert/strict');
const T = require('../lib/trafic/trafic.js'), S = require('./aide-trafic-reseau.js');
const moy = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const G = T.construire(S.giratoire(), S.centre, {});
const pas = (sim, s) => { while (sim.t < s) sim.pas(); return sim; };

// Ordres de grandeur d'un modele de reference de capacite de giratoire (methode de Siegloch), calcules par girabase-oracle.py pour un
// giratoire a 4 branches de rayon 8 m, entrees de 3,5 m : delai moyen d'attente a l'entree, en secondes. Aucune ligne de ce modele n'est reprise ici.
const REF = { 216: 0.5, 432: 2.4 }; // 700 veh/h/entree : proche de la saturation (delai 5 a 17 s selon la branche, deux branches saturees)

// retard = duree de traversee du banc - duree a vide (meme mouvement, tres faible demande) ; attente = temps passe a l'arret
function mesure(vh, graines = [1, 2, 3], duree = 1200) {
  const libre = new Map(), ds = [];
  for (const g of [1, 2]) { const s = pas(T.creer(G, { graine: g, ouvert: { debit: 40 } }), 3600); ds.push(...s.stats.durees); }
  for (const x of ds) { const k = x.orig + '>' + x.dest; (libre.get(k) || libre.set(k, []).get(k)).push(x.d); }
  const l0 = new Map([...libre].map(([k, v]) => [k, moy(v)]));
  const ret = [], arr = []; let contacts = 0, crees = 0, sortis = 0, forces = 0;
  for (const g of graines) { const s = pas(T.creer(G, { graine: g, ouvert: { debit: vh } }), duree); contacts += s.stats.contacts.size; crees += s.stats.crees; sortis += s.stats.sortis; forces += s.stats.forces;
    for (const x of s.stats.durees) { const l = l0.get(x.orig + '>' + x.dest); if (l !== undefined) { ret.push(x.d - l); arr.push(x.attente); } } }
  return { retard: moy(ret), arretes: arr.filter((x) => x > 0.4).length / Math.max(1, arr.length), attente: moy(arr), contacts, crees, sortis, forces };
}

test('systeme ouvert : les vehicules entrent et sortent par les impasses, rien ne se perd, la graine fixe l\'etat', () => {
  const sim = pas(T.creer(G, { graine: 5, ouvert: { debit: 300 } }), 600);
  assert.equal(sim.sources.length, 4, 'une source par branche');
  assert.ok(sim.stats.crees > 100 && sim.stats.sortis > 80);
  assert.equal(sim.stats.crees - sim.stats.sortis, sim.agents.length, 'crees - sortis = presents');
  assert.ok(sim.stats.durees.every((x) => x.d > 20 && x.d < 200 && x.orig !== x.dest));
  assert.equal(sim.stats.sautsPos, 0);
  const trace = (g) => JSON.stringify(pas(T.creer(G, { graine: g, ouvert: { debit: 300 } }), 120).agents.map((a) => sim.position(a).length));
  assert.equal(trace(7), trace(7));
  const id0 = sim.sources[0].id, un = pas(T.creer(G, { graine: 5, ouvert: { debit: { [id0]: 600 } } }), 300);
  assert.ok(un.stats.durees.length > 0 && un.stats.durees.every((x) => x.orig === id0), 'un debit par branche');
});

test('ilot separateur : l\'entree d\'une branche et la sortie sur cette meme branche ne se croisent pas', () => {
  const sim = T.creer(G, { graine: 1, ouvert: { debit: 100 } }), cl = G.carrefours.find((x) => x.ring);
  const inverse = (e, f) => e.de === f.vers && e.vers === f.de; let verifies = 0;
  for (const ei of cl.entrees) {
    const sortieX = cl.sorties.find((s) => inverse(ei, s)), autre = cl.sorties.find((s) => s !== sortieX && !inverse(ei, s)); // sortie sur la branche de ei / une autre sortie
    for (const fi of cl.entrees) { if (fi === ei) continue;
      const entree = sim.mvt(ei, autre, 0, 0), sortie = sim.mvt(fi, sortieX, 0, 0); if (!entree || !sortie) continue;
      const cf = sim.conflit(entree, sortie); assert.ok(!cf || cf.type !== 'croisement', 'entree par ' + ei.id + ' et sortie sur la meme branche : ' + (cf && cf.type)); verifies++; } }
  assert.ok(verifies >= 6, 'paires verifiees : ' + verifies);
});

test('cedez-le-passage roulant : a faible demande, la plupart des vehicules ne s\'arretent pas', () => {
  const m = mesure(216);
  assert.ok(m.arretes < 0.4, 'part des vehicules arretes a l\'entree : ' + (m.arretes * 100).toFixed(0) + ' %');
  assert.ok(m.arretes > 0, 'quelques-uns s\'arretent quand il n\'y a pas de creneau');
  assert.ok(m.attente < 2, 'attente moyenne a l\'arret ' + m.attente.toFixed(2) + ' s');
});

test('calibrage de la capacite (non-regression, tolerances larges) : retards proches de ceux d\'un modele de reference, sans contacts en plus', () => {
  const m216 = mesure(216), m432 = mesure(432), m700 = mesure(700);
  // l'ancien moteur donnait 3,7 a 6,2 s a 216 veh/h/entree et 6,6 a 10,8 s a 432, avec des contacts a 700 ; la reference donne 0,5 s et 2,4 s
  assert.ok(m216.retard > 0 && m216.retard < 3.0, 'retard a 216 : ' + m216.retard.toFixed(2) + ' s (reference ' + REF[216] + ' s)');
  assert.ok(m432.retard > 1 && m432.retard < 9, 'retard a 432 : ' + m432.retard.toFixed(2) + ' s (reference ' + REF[432] + ' s)');
  assert.ok(m216.retard < m432.retard && m432.retard < m700.retard, 'le retard croit avec la demande : ' + [m216, m432, m700].map((x) => x.retard.toFixed(1)).join(' < '));
  assert.ok(m700.retard > 6 && m700.retard < 45, 'a 700 veh/h/entree le giratoire approche de la saturation : ' + m700.retard.toFixed(1) + ' s');
  for (const m of [m216, m432]) assert.ok(m.sortis / m.crees > 0.96, 'toute la demande est ecoulee en dessous de la saturation');
  assert.ok(m216.contacts <= 3, 'contacts a 216 : ' + m216.contacts);
  assert.ok(m432.contacts <= 25, 'contacts a 432 : ' + m432.contacts);
  assert.ok(m700.contacts <= 100, 'contacts a 700 : ' + m700.contacts);
  assert.ok(m216.forces + m432.forces <= 25, 'arbitrages forces ' + (m216.forces + m432.forces));
});

test('le giratoire sature au-dela de la capacite : la file s\'allonge plutot que les contacts', () => {
  const m900 = mesure(900, [1, 2], 900);
  assert.ok(m900.retard > 20, 'retard a 900 : ' + m900.retard.toFixed(1) + ' s');
  assert.ok(m900.contacts <= 150, 'contacts a 900 : ' + m900.contacts);
});

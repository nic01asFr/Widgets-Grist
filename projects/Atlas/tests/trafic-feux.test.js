// node --test essais-trafic/tests/*.test.js   (aucun acces reseau)
// Feux tricolores a durees fixes : HYPOTHESE de simulation (la BD TOPO n'en porte pas). Phases, cycle, couleurs, comportement des vehicules.
const test = require('node:test'), assert = require('node:assert/strict');
const F = require('../lib/trafic/feux.js'), T = require('../lib/trafic/trafic.js'), C = require('../lib/trafic/carrefour.js'), S = require('./aide-trafic-reseau.js');
const grille = () => T.construire(S.grille({ nv: 2 }), S.centre, {});
const pas = (sim, s, f) => { while (sim.t < s) { sim.pas(); if (f) f(sim); } return sim; };

test('phases : coloriage glouton des approches incompatibles', () => {
  // quatre approches : 0 et 2 (face a face) sont compatibles, 1 et 3 aussi, deux a deux les autres se croisent
  const incompat = (a, b) => (a % 2) !== (b % 2);
  assert.deepEqual(F.phases([0, 1, 2, 3], incompat), [[0, 2], [1, 3]]);
  assert.deepEqual(F.phases([0, 1, 2, 3], () => false), [[0, 1, 2, 3]], 'rien ne se croise : un seul groupe');
  assert.deepEqual(F.phases([0, 1, 2], () => true), [[0], [1], [2]], 'tout se croise : une phase par approche');
  assert.deepEqual(F.phases([2, 0, 3, 1], incompat, (a, b) => a - b), [[0, 2], [1, 3]], 'l\'ordre est celui qu\'on demande');
});

test('plan a durees fixes : cycle, couleurs, inter-vert, periodicite', () => {
  const pl = F.plan([[0, 2], [1, 3]], { vert: 20, jaune: 3, toutRouge: 2, decalage: 'zero' });
  assert.equal(pl.cycle, 50);
  const col = (a, t) => F.couleur(pl, a, t);
  assert.deepEqual([0, 2, 1, 3].map((a) => col(a, 10)), ['vert', 'vert', 'rouge', 'rouge']);
  assert.deepEqual([0, 1].map((a) => col(a, 21)), ['jaune', 'rouge']);
  assert.deepEqual([0, 1, 2, 3].map((a) => col(a, 24)), ['rouge', 'rouge', 'rouge', 'rouge'], 'tout rouge entre deux phases');
  assert.deepEqual([0, 1].map((a) => col(a, 30)), ['rouge', 'vert']);
  assert.equal(col(0, 60), col(0, 10), 'periodique');
  assert.equal(F.etat(pl, 21).etat, 'jaune'); assert.equal(F.etat(pl, 24).etat, 'toutRouge'); assert.ok(Math.abs(F.etat(pl, 10).reste - 10) < 1e-9);
  assert.equal(col(99, 0), 'vert', 'une approche sans feu est toujours verte');
  assert.ok(Math.abs(F.rougeDepuis(pl, 0, 24) - 1) < 1e-9, 'rouge depuis 1 s');
});

test('plan : durees de vert par phase, jaune et tout rouge parametrables, decalage tire dans le cycle', () => {
  const pl = F.plan([[0], [1], [2]], { vert: [10, 25], jaune: 4, toutRouge: 1, decalage: 'zero' });
  assert.deepEqual(pl.seq.map((s) => s.vert), [10, 25, 25], 'la derniere valeur est reprise');
  assert.equal(pl.cycle, (10 + 25 + 25) + 3 * (4 + 1));
  const f = F.plan([[0], [1]], { vert: (i) => 10 + 10 * i, decalage: 'aleatoire' }, C.mulberry32(5));
  assert.equal(f.seq[1].vert, 20); assert.ok(f.decalage >= 0 && f.decalage < f.cycle);
  assert.equal(F.plan([[0], [1]], { decalage: 7 }).decalage, 7);
  assert.equal(F.DEFAUTS.jaune, 3); assert.equal(F.DEFAUTS.toutRouge, 2);
});

test('heuristique : croisement a 4 branches dont deux importantes ; ni giratoire, ni carrefour a 3 branches', () => {
  const G = grille(), h = F.heuristique(G);
  assert.equal(h.length, 1, JSON.stringify(h)); assert.equal(h[0].branches, 4); assert.equal(h[0].importantes, 4);
  const centre = G.carrefours.find((cl) => cl.noeuds.some((n) => Math.hypot(n.pt[0], n.pt[1]) < 1)); assert.equal(h[0].id, centre.id);
  assert.equal(F.heuristique(G, { brMin: 5 }).length, 0);
  assert.equal(F.heuristique(G, { nImp: 5 }).length, 0);
  assert.equal(F.heuristique(T.construire(S.reseau(), S.centre, {})).length, 0, 'le giratoire n\'est jamais equipe');
});

test('equipement : liste de carrefours, points, heuristique ; aucun feu par defaut', () => {
  const G = grille(), centre = F.heuristique(G)[0].id;
  assert.equal(T.creer(G, { N: 4 }).feux.size, 0);
  assert.deepEqual([...T.creer(G, { N: 4, feux: { ids: [centre] } }).feux.keys()], [centre]);
  assert.deepEqual([...T.creer(G, { N: 4, feux: { points: [S.centre] } }).feux.keys()], [centre], 'le point designe le carrefour le plus proche');
  assert.equal(T.creer(G, { N: 4, feux: { points: [[S.centre[0] + 0.01, S.centre[1]]] } }).feux.size, 0, 'trop loin : aucun carrefour');
  assert.deepEqual([...T.creer(G, { N: 4, feux: { auto: true } }).feux.keys()], [centre]);
});

test('phases deduites de la matrice de conflits : opposees ensemble, aucun croisement hors virage a gauche', () => {
  const G = grille(), sim = T.creer(G, { N: 4, feux: { auto: true } }), [id, pl] = [...sim.feux][0], cl = G.carrefours[id];
  assert.equal(pl.phases.length, 2, 'un croisement a 4 branches : deux phases');
  const cap = (e) => { const p = e.pts, a = p[p.length - 2], b = p[p.length - 1]; return Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI; };
  for (const ph of pl.phases) { assert.equal(ph.length, 2); assert.ok(Math.abs(Math.abs(C.norm180(cap(G.aretes[ph[0]]) - cap(G.aretes[ph[1]]))) - 180) < 5, 'approches face a face'); }
  const mouv = (ei) => cl.sorties.filter((eo) => eo.vers !== ei.de).flatMap((eo) => sim.mvt(ei, eo, 0, 0) ? [sim.mvt(ei, eo, 0, 0)] : []);
  let verifies = 0;
  for (const ph of pl.phases) for (const x of ph) for (const y of ph) { if (x === y) continue; for (const mx of mouv(G.aretes[x])) for (const my of mouv(G.aretes[y])) {
    const cf = sim.conflit(mx, my); if (cf && cf.type === 'croisement') { assert.ok(mx.signe < -30 || my.signe < -30, 'un croisement dans une phase ne peut etre qu\'un virage a gauche'); verifies++; } } }
  assert.ok(verifies > 0, 'les virages a gauche croisent le sens oppose : cession (priorite) comme sans feu');
  // entre deux phases, au moins un croisement : sinon les deux phases n\'en feraient qu\'une
  const [p0, p1] = pl.phases; let croise = false;
  for (const x of p0) for (const y of p1) for (const mx of mouv(G.aretes[x])) for (const my of mouv(G.aretes[y])) { const cf = sim.conflit(mx, my); if (cf && !(mx.signe < -30 || my.signe < -30)) croise = true; }
  assert.ok(croise);
});

test('comportement : on s\'arrete au rouge, une file se forme, personne ne franchit apres le tout-rouge', () => {
  const G = grille(), sim = T.creer(G, { graine: 3, N: 70, feux: { auto: true } }), [id, pl] = [...sim.feux][0], cl = G.carrefours[id];
  let files = 0, entrees = 0; const dedans = new Set();
  pas(sim, 600, (s) => {
    for (const a of s.agents) if (a.mode === 'noeud' && a.mv.cl === cl) { const k = a.id + ':' + a.mv.ei.id + ':' + Math.floor(s.t / 40); if (!dedans.has(k)) { dedans.add(k); entrees++; } }
    const arretes = s.agents.filter((a) => a.mode === 'edge' && a.mv && a.mv.cl === cl && a.v < 0.3 && a.mv.sEntree - a.s < 10 && F.couleur(pl, a.mv.ei.id, s.t) === 'rouge');
    if (arretes.length >= 2) files++; });
  assert.ok(files > 20, 'pas de file au rouge : ' + files);
  assert.ok(entrees > 30, 'le carrefour ecoule du trafic : ' + entrees);
  assert.ok(sim.stats.bruleRouge <= 2, 'brule-feu (entree dans le carrefour apres la fin du tout-rouge) : ' + sim.stats.bruleRouge);
  assert.equal(sim.stats.sautsPos, 0);
});

test('feux : le debit d\'une approche suit sa duree de vert', () => {
  const G = grille(), centre = F.heuristique(G)[0].id;
  const passages = (vert) => { const sim = T.creer(G, { graine: 5, N: 90, feux: { ids: [centre], vert, decalage: 'zero' } }), pl = sim.feux.get(centre), cl = G.carrefours[centre], vus = [new Set(), new Set()];
    pas(sim, 900, (s) => { for (const a of s.agents) if (a.mode === 'noeud' && a.mv.cl === cl) vus[pl.parApproche.get(a.mv.ei.id)].add(a.id + ':' + a.mv.ei.id); }); return vus.map((v) => v.size); };
  const [a, b] = passages([12, 40]);
  assert.ok(b > a, 'la phase 1 (vert 40 s) fait passer plus de vehicules que la phase 0 (vert 12 s) : ' + a + ' / ' + b);
});

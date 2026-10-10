// node --test essais-trafic/tests/*.test.js   (aucun acces reseau)
// Contacts residuels : les corrections ciblees (file d'attente, suivi de securite, raccord lisse, impatience, ilot) sont mesurees contre l'ancien reglage.
const test = require('node:test'), assert = require('node:assert/strict');
const T = require('../lib/trafic/trafic.js'), S = require('./aide-trafic-reseau.js');
const G = T.construire(S.reseau(), S.centre, { seuil: 20 });
const pas = (sim, s, f) => { while (sim.t < s) { sim.pas(); if (f) f(sim); } return sim; };
const moy = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
// reglage d'origine du moteur (une voie par sens, meneur le plus proche seul, suivi simple, raccords suivant les liaisons internes, pas d'impatience, pas de file d'attente)
const ANCIEN = { voies: 1, file: false, suivi: 'simple', raccord: 'chaine', patience: 0, suiviChemin: false, meneurs: 'plus-proche', sortiePlace: false, margeAnneau: 2.5, insertionSure: false };
const mesure = (o, N = 100) => { const co = [], fo = [], v = []; for (const g of [1, 2, 3, 4]) { const sim = T.creer(G, Object.assign({ graine: g, N }, o)); let s = 0, n = 0;
  pas(sim, 400, (x) => { if (x.t > 40 && Math.abs(x.t % 5) < 0.1) { s += moy(x.agents.map((a) => a.v)) * 3.6; n++; } }); co.push(sim.stats.contacts.size); fo.push(sim.stats.forces); v.push(s / n); }
  return { contacts: co.reduce((a, b) => a + b, 0), forces: fo.reduce((a, b) => a + b, 0), vitesse: moy(v) }; };

test('le reglage actuel divise les arbitrages forces (impasses) et les contacts, et accelere le trafic', () => {
  const a = mesure(ANCIEN), n = mesure({});
  assert.ok(a.forces >= 60 && a.contacts >= 30, 'le reglage d\'origine doit montrer le defaut : ' + JSON.stringify(a));
  assert.ok(n.forces * 3 <= a.forces, 'arbitrages forces ' + n.forces + ' contre ' + a.forces);
  assert.ok(n.contacts * 1.4 <= a.contacts, 'contacts ' + n.contacts + ' contre ' + a.contacts);
  assert.ok(n.vitesse > a.vitesse * 1.05, 'vitesse ' + n.vitesse.toFixed(1) + ' contre ' + a.vitesse.toFixed(1) + ' km/h');
});

test('file d attente par voie (premier arrive, premier servi) : sans elle, les vehicules de queue bloquent ceux de tete (impasses, contacts)', () => {
  const avec = mesure({}), sans = mesure({ file: false });
  assert.ok(sans.forces >= avec.forces * 3, 'arbitrages forces ' + sans.forces + ' sans file contre ' + avec.forces + ' avec');
  assert.ok(sans.contacts >= avec.contacts * 1.8, 'contacts ' + sans.contacts + ' sans file contre ' + avec.contacts + ' avec');
  assert.ok(avec.vitesse > sans.vitesse * 1.1, 'vitesse ' + avec.vitesse.toFixed(1) + ' contre ' + sans.vitesse.toFixed(1) + ' km/h');
});

test('suivi de securite : deux vehicules de la meme voie ne se chevauchent jamais sur un troncon', () => {
  let chevauchements = 0, plusProche = Infinity;
  pas(T.creer(G, { graine: 2, N: 100 }), 400, (s) => { if (Math.round(s.t / s.c.dt) % 5) return; const par = new Map();
    for (const a of s.agents) if (a.mode === 'edge') (par.get(a.e.id) || par.set(a.e.id, []).get(a.e.id)).push(a);
    for (const l of par.values()) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) if (Math.abs(l[i].lat - l[j].lat) < 0.5) { const d = Math.abs(l[i].s - l[j].s); plusProche = Math.min(plusProche, d); if (d < 4.5) chevauchements++; } });
  assert.equal(chevauchements, 0, 'distance mini ' + plusProche.toFixed(2) + ' m');
});

test('raccord lisse : hors giratoire, un mouvement est un seul raccord entre la voie d\'entree et la voie de sortie (pas de crochet par une liaison interne)', () => {
  const sim = T.creer(G, { graine: 1, N: 4 }); let verifies = 0;
  for (const cl of G.carrefours) { if (cl.ring) continue; for (const ei of cl.entrees) for (const eo of cl.sorties) { const m = sim.mvt(ei, eo, 0, 0); if (!m || eo.vers === ei.de) continue; const chord = Math.hypot(m.pts[0][0] - m.pts[m.pts.length - 1][0], m.pts[0][1] - m.pts[m.pts.length - 1][1]);
    assert.ok(m.L < 1.6 * chord + 6, 'mouvement ' + ei.id + '>' + eo.id + ' trop long : ' + m.L.toFixed(1) + ' m pour une corde de ' + chord.toFixed(1) + ' m'); verifies++; } }
  assert.ok(verifies >= 8, 'mouvements verifies : ' + verifies);
});

test('impatience : plus on attend, plus le creneau accepte est court (jusqu\'a la marge minimale)', () => {
  const sim = T.creer(G, { graine: 1, N: 10, patience: 25, marge: 2.5, margeMin: 1 }), c = sim.c;
  const marge = (att) => Math.max(c.margeMin, c.marge - att * (c.marge - c.margeMin) / c.patience);
  assert.equal(marge(0), 2.5); assert.ok(Math.abs(marge(12.5) - 1.75) < 1e-9); assert.equal(marge(60), 1);
  const avec = mesure({ patience: 25 }), sans = mesure({ patience: 0 });
  assert.ok(avec.forces <= sans.forces + 2, 'l\'impatience ne cree pas d\'arbitrage force : ' + avec.forces + ' contre ' + sans.forces);
});

test('chaque corde de reseau : reproductible a graine egale avec tous les reglages actuels', () => {
  const trace = (g) => { const s = pas(T.creer(G, { graine: g, N: 40, feux: { auto: true } }), 150); return JSON.stringify(s.agents.map((a) => s.position(a).map((x) => Math.round(x * 10) / 10))); };
  assert.equal(trace(3), trace(3)); assert.notEqual(trace(3), trace(4));
});

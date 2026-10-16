// node --test essais-trafic/tests/*.test.js   (aucun acces reseau)
// Contacts residuels : les corrections ciblees (file d'attente, suivi de securite, raccord lisse, impatience, ilot) sont mesurees contre l'ancien reglage.
const test = require('node:test'), assert = require('node:assert/strict');
const { T, G, pas, moy, ANCIEN, mesure } = require('./aide-trafic-contacts.js');

test('le reglage actuel divise les arbitrages forces (impasses) et les contacts, et accelere le trafic', () => {
  const a = mesure(ANCIEN), n = mesure({});
  assert.ok(a.forces >= 60 && a.contacts >= 30, 'le reglage d\'origine doit montrer le defaut : ' + JSON.stringify(a));
  assert.ok(n.forces * 3 <= a.forces, 'arbitrages forces ' + n.forces + ' contre ' + a.forces);
  assert.ok(n.contacts * 1.4 <= a.contacts, 'contacts ' + n.contacts + ' contre ' + a.contacts);
  assert.ok(n.vitesse > a.vitesse * 1.05, 'vitesse ' + n.vitesse.toFixed(1) + ' contre ' + a.vitesse.toFixed(1) + ' km/h');
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


test('chaque corde de reseau : reproductible a graine egale avec tous les reglages actuels', () => {
  const trace = (g) => { const s = pas(T.creer(G, { graine: g, N: 40, feux: { auto: true } }), 150); return JSON.stringify(s.agents.map((a) => s.position(a).map((x) => Math.round(x * 10) / 10))); };
  assert.equal(trace(3), trace(3)); assert.notEqual(trace(3), trace(4));
});

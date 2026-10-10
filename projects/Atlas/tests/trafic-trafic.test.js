// node --test essais-trafic/tests/*.test.js   (aucun acces reseau)
const test = require('node:test'), assert = require('node:assert/strict');
const T = require('../lib/trafic/trafic.js'), C = require('../lib/trafic/carrefour.js'), { reseau, centre } = require('./aide-trafic-reseau.js');
const construire = () => T.construire(reseau(), centre, { seuil: 20 });
const pas = (sim, s) => { while (sim.t < s) sim.pas(); return sim; };

test('le reseau synthetique se simplifie et se compose', () => {
  const G = construire();
  assert.ok(G.resume.aretes <= G.resume.aretesBrutes, 'la simplification ne cree pas d\'aretes');
  assert.ok(G.resume.anneaux >= 1, 'un anneau est detecte');
  assert.ok(G.resume.composes >= 1, 'un carrefour compose (anneau ou troncon court)');
  assert.ok(G.externes.every((e) => e.L >= 20 || e.ring === false || !e.interne));
});

test('la connexite par classe donne une composante non vide', () => {
  const sim = T.creer(construire(), { graine: 1, N: 10 });
  assert.ok(sim.composantes.vl.taille > 10, 'composante VL : ' + sim.composantes.vl.taille);
});

test('aucune apparition, aucune disparition, aucun saut de position', () => {
  const sim = T.creer(construire(), { graine: 3, N: 30 });
  const n0 = sim.agents.length; pas(sim, 300);
  assert.equal(sim.agents.length, n0);
  assert.equal(sim.stats.sautsPos, 0);
});

test('l\'etat est reproductible a partir de la graine', () => {
  const trace = (g) => { const s = pas(T.creer(construire(), { graine: g, N: 25 }), 120); return JSON.stringify(s.agents.map((a) => s.position(a).map((x) => Math.round(x * 10) / 10))); };
  assert.equal(trace(5), trace(5));
  assert.notEqual(trace(5), trace(6));
});

test('regle globale : un troncon interdit aux poids lourds est evite', () => {
  const G = construire(); const interdits = G.externes.filter((e) => e.importance === 4).slice(0, 3).flatMap((e) => e.cl);
  const sim = pas(T.creer(G, { graine: 2, N: 40, partPL: 0.5, regs: [{ type: 'accesInterdit', cleabs: interdits, vehicules: true }] }), 300);
  const pl = sim.agents.filter((a) => a.pl);
  assert.ok(pl.length > 0);
  assert.equal(pl.filter((a) => a.e.cl.some((x) => interdits.includes(x))).length, 0, 'aucun PL sur un troncon interdit');
});

test('regle globale : une limitation de vitesse baisse la vitesse moyenne', () => {
  const G = construire(); const v = (regs) => { const s = pas(T.creer(G, { graine: 4, N: 40, regs }), 240); const l = s.agents.filter((a) => a.mode === 'edge'); return l.reduce((t, a) => t + a.v, 0) / l.length; };
  const lim = G.externes.flatMap((e) => e.cl);
  assert.ok(v([{ type: 'speedLimit', cleabs: lim, vmax: 3 }]) < v([]) * 0.8);
});

test('les zones de conflit sont symetriques et les croisements detectes', () => {
  const G = construire(); const sim = T.creer(G, { graine: 1, N: 5 });
  let verifies = 0;
  for (const cl of G.carrefours) for (const ei of cl.entrees) for (const eo of cl.sorties) for (const fi of cl.entrees) for (const fo of cl.sorties) {
    const a = sim.mvt(ei, eo), b = sim.mvt(fi, fo); if (!a || !b || a === b) continue; const x = sim.conflit(a, b), y = sim.conflit(b, a);
    assert.equal(!!x, !!y); if (x) { assert.equal(x.type === 'croisement', y.type === 'croisement'); verifies++; } }
  assert.ok(verifies > 0);
});

test('le giratoire donne priorite a l\'anneau : peu de contacts par vehicule-heure', () => {
  const G = construire(); const sim = pas(T.creer(G, { graine: 7, N: 30 }), 600);
  const vh = 30 * 600 / 3600; assert.ok(sim.stats.contacts.size / vh < 3, 'contacts/vehicule-heure = ' + (sim.stats.contacts.size / vh).toFixed(2));
});

test('geometrie : conflits relies a des abscisses, pas de NaN', () => {
  const G = construire(); const sim = T.creer(G, { graine: 1, N: 5 });
  for (const cl of G.carrefours) for (const ei of cl.entrees) for (const eo of cl.sorties) { const m = sim.mvt(ei, eo); if (!m) continue; assert.ok(Number.isFinite(m.L) && m.L > 0); assert.ok(m.pts.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))); }
});

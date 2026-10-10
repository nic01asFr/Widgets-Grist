// node --test essais-trafic/tests/*.test.js   (aucun acces reseau)
// Plusieurs voies par sens : nombre de voies, geometrie, choix de voie selon le virage, changements de voie, capacite aux lignes d'arret.
const test = require('node:test'), assert = require('node:assert/strict');
const T = require('../lib/trafic/trafic.js'), S = require('./aide-trafic-reseau.js');
const grille = () => T.construire(S.grille({ nv: 4 }), S.centre, {});
const pas = (sim, s, f) => { while (sim.t < s) { sim.pas(); if (f) f(sim); } return sim; };
const moy = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

test('voies par sens : double sens = ceil(nv / 2), sens unique = nv, decalage lateral des voies', () => {
  const route = (nv, sens) => S.troncon([[0, 0], [100, 0]], { nombre_de_voies: nv, largeur_de_chaussee: nv * 3, importance: '3', sens_de_circulation: sens });
  const nl = (nv, sens) => T.graphe([route(nv, sens)], S.centre).aretes.map((e) => e.nl);
  assert.deepEqual(nl(1, 'Double sens'), [1, 1]);
  assert.deepEqual(nl(2, 'Double sens'), [1, 1]);
  assert.deepEqual(nl(3, 'Double sens'), [2, 2], '3 voies en double sens : 2 par sens (arrondi vers le haut)');
  assert.deepEqual(nl(4, 'Double sens'), [2, 2]);
  assert.deepEqual(nl(2, 'Sens direct'), [2], 'sens unique : toutes les voies vont dans le sens');
  assert.deepEqual(nl(3, 'Sens inverse'), [3]);
  const [e2] = T.graphe([route(4, 'Double sens')], S.centre).aretes;
  assert.deepEqual(e2.offs, [1.5, 4.5], 'double sens : les voies partent de l\'axe, a droite du sens de marche');
  const [e1] = T.graphe([route(3, 'Sens direct')], S.centre).aretes;
  assert.deepEqual(e1.offs, [-3, 0, 3], 'sens unique : voies centrees sur l\'axe');
});

test('une voie sans nombre_de_voies exploitable garde une voie par sens', () => {
  const f = S.troncon([[0, 0], [100, 0]], { nombre_de_voies: null, importance: '3' });
  assert.deepEqual(T.graphe([f], S.centre).aretes.map((e) => e.nl), [1, 1]);
});

test('geometrie : deux voies voisines sont a une largeur de voie l\'une de l\'autre, meme cap, la voie 1 est a droite', () => {
  const G = grille(), sim = T.creer(G, { graine: 1, N: 4 });
  const e = G.externes.find((x) => x.nl === 2 && Math.abs(x.L - 120) < 1); assert.ok(e, 'un troncon droit a deux voies');
  for (const s of [20, 60, 100]) {
    const p0 = sim.lanePt(e, s, 0), p1 = sim.lanePt(e, s, 1), h = p0[2] * Math.PI / 180;
    const droite = (p1[0] - p0[0]) * Math.cos(h) - (p1[1] - p0[1]) * Math.sin(h); // composante a droite du sens de marche
    assert.ok(Math.abs(droite - 3) < 0.05, 'ecart lateral ' + droite.toFixed(2));
    assert.ok(Math.abs(p0[2] - p1[2]) < 0.5, 'meme cap');
  }
});

test('choix de voie : virage a gauche = voie de gauche, virage a droite = voie de droite ; la voie de sortie suit', () => {
  const sim = pas(T.creer(grille(), { graine: 2, N: 120 }), 200);
  let verifies = { gauche: 0, droite: 0, tout: 0 };
  pas(sim, 400, (s) => { for (const a of s.agents) {
    if (!a.mv || a.e.nl < 2 || a.mode !== 'edge') continue; const m = a.mv, nlo = m.eo.nl;
    if (m.signe < -35) { assert.equal(m.li, 0, 'gauche -> voie 0'); assert.equal(m.lo, 0); verifies.gauche++; }
    else if (m.signe > 35) { assert.equal(m.li, a.e.nl - 1, 'droite -> voie de droite'); assert.equal(m.lo, nlo - 1); verifies.droite++; }
    else verifies.tout++; } });
  assert.ok(verifies.gauche > 0 && verifies.droite > 0 && verifies.tout > 0, JSON.stringify(verifies));
});

test('les deux voies servent, les changements de voie ont lieu, aucun saut de position (courbes comprises)', () => {
  const sim = pas(T.creer(grille(), { graine: 3, N: 150 }), 400);
  const voies = [0, 0]; sim.agents.forEach((a) => { if (a.mode === 'edge' && a.e.nl === 2) voies[a.lane]++; });
  assert.ok(voies[0] > 20 && voies[1] > 20, 'repartition des voies ' + voies);
  assert.ok(sim.stats.changVoie > 100, 'changements de voie ' + sim.stats.changVoie);
  assert.equal(sim.stats.sautsPos, 0);
  assert.ok(sim.agents.every((a) => Math.abs(a.lat - a.lane) <= 1 && a.lat >= 0 && a.lat <= (a.mode === 'edge' ? a.e.nl - 1 : 1)), 'coordonnee de voie bornee');
});

test('voies: 1 rend le comportement d\'une seule voie par sens (aucun changement de voie)', () => {
  const sim = pas(T.creer(grille(), { graine: 3, N: 150, voies: 1 }), 300);
  assert.equal(sim.stats.changVoie, 0);
  assert.ok(sim.agents.every((a) => a.lane === 0 && a.lat === 0));
});

test('capacite aux lignes d\'arret : des vehicules s\'arretent et repartent cote a cote, la voie unique n\'en fait rien', () => {
  const cotes = (voies) => { let n = 0; const sim = pas(T.creer(grille(), { graine: 4, N: 200, voies }), 300, (s) => {
    const st = s.agents.filter((a) => a.mode === 'edge' && a.v < 0.3 && a.mv && a.mv.sEntree - a.s < 12);
    for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) if (st[i].e === st[j].e && st[i].lane !== st[j].lane && Math.abs(st[i].s - st[j].s) < 3) n++; }); return n; };
  assert.ok(cotes('auto') > 50, 'paires cote a cote ' + cotes('auto'));
  assert.equal(cotes(1), 0);
});

test('mesure : deux voies par sens ecoulent mieux que la voie unique a densite elevee, sans surcroit de contacts', () => {
  const mesure = (voies) => { const v = [], co = []; for (const g of [1, 2, 3]) { const sim = T.creer(grille(), { graine: g, N: 150, voies }); let s = 0, n = 0;
    pas(sim, 400, (x) => { if (x.t > 40 && Math.abs(x.t % 5) < 0.1) { s += moy(x.agents.map((a) => a.v)) * 3.6; n++; } }); v.push(s / n); co.push(sim.stats.contacts.size); } return { v: moy(v), co: co.reduce((x, y) => x + y, 0) }; };
  const un = mesure(1), deux = mesure('auto');
  assert.ok(deux.v > un.v * 1.15, 'vitesse moyenne ' + deux.v.toFixed(1) + ' contre ' + un.v.toFixed(1) + ' km/h');
  assert.ok(deux.co <= un.co * 1.6 + 10, 'contacts ' + deux.co + ' contre ' + un.co);
});

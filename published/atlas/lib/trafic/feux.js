// feux.js - feux tricolores a durees fixes, pour le moteur trafic.js.
//
// HYPOTHESE DE SIMULATION, PAS UNE DONNEE. La BD TOPO ne decrit ni les feux, ni leurs plans, ni leurs phases, ni leurs durees :
// ce module choisit des carrefours (liste donnee, ou heuristique geometrique), en deduit des phases SANS CONFLIT a partir des
// zones de conflit des mouvements, et applique un cycle fixe (vert / jaune / tout rouge) paramétrable. Un resultat de simulation
// obtenu avec ces feux decrit un reseau SUPPOSE signalise, il ne prouve rien sur le reseau reel.
//
// Module pur (aucune dependance) : les decisions geometriques (quels mouvements se genent) sont fournies par l'appelant.
(function (root) {
  'use strict';

  const DEFAUTS = { vert: 20, jaune: 3, toutRouge: 2, decalage: 'aleatoire', brMin: 4, impMax: 3, nImp: 2 };

  // ---- choix des carrefours (heuristique) ----
  // branches d'un carrefour : routes distinctes, une route a double sens ne compte qu'une fois (voisin au bout du troncon).
  // Retourne [{ id, branches, importantes }] pour les carrefours qui remplissent : au moins `brMin` branches, dont au moins
  // `nImp` d'importance <= `impMax`. Les giratoires ne sont jamais equipes.
  function branches(cl) {
    const voisins = new Map(); // voisin -> importance la plus forte (valeur la plus petite)
    const note = (e, autre) => { const v = autre.cluster ? autre.cluster.id : autre.id; voisins.set(v, Math.min(voisins.get(v) ?? 99, e.importance)); };
    for (const e of cl.entrees) note(e, e.de);
    for (const e of cl.sorties) note(e, e.vers);
    return voisins;
  }
  function heuristique(G, opts) {
    const o = Object.assign({}, DEFAUTS, opts || {}), res = [];
    for (const cl of G.carrefours) {
      if (cl.ring || !cl.entrees.length || !cl.sorties.length) continue;
      const b = branches(cl), importantes = [...b.values()].filter((i) => i <= o.impMax).length;
      if (b.size >= o.brMin && importantes >= o.nImp) res.push({ id: cl.id, branches: b.size, importantes });
    }
    return res;
  }
  // carrefour le plus proche d'un point projete [x, y] (m), a moins de `rayon` m d'un de ses noeuds
  function plusProche(G, pt, rayon) {
    let best = null, dm = rayon ?? 30;
    for (const cl of G.carrefours) { if (!cl.entrees.length) continue; for (const n of cl.noeuds) { const d = Math.hypot(n.pt[0] - pt[0], n.pt[1] - pt[1]); if (d < dm) { dm = d; best = cl; } } }
    return best;
  }

  // ---- phases ----
  // approches : liste d'identifiants (troncons d'entree) ; incompatibles(a, b) : vrai si deux approches ne peuvent pas avoir le vert ensemble.
  // Coloriage glouton, approches rangees par `ordre` (les plus importantes d'abord). Retourne un tableau de phases (listes d'approches).
  function phases(approches, incompatibles, ordre) {
    const liste = approches.slice(); if (ordre) liste.sort(ordre);
    const res = [];
    for (const a of liste) {
      let place = false;
      for (const ph of res) if (ph.every((b) => !incompatibles(a, b))) { ph.push(a); place = true; break; }
      if (!place) res.push([a]);
    }
    return res;
  }

  // ---- plan a durees fixes ----
  // opts.vert : nombre, tableau (une valeur par phase) ou fonction (indice, nbPhases) -> secondes
  // opts.decalage : 'aleatoire' (tire dans le cycle avec `rng`), 'zero', un nombre de secondes ou une fonction (cycle) -> secondes
  function plan(phs, opts, rng) {
    const o = Object.assign({}, DEFAUTS, opts || {}), n = phs.length;
    const vert = (i) => Math.max(1, typeof o.vert === 'function' ? o.vert(i, n) : Array.isArray(o.vert) ? (o.vert[i] ?? o.vert[o.vert.length - 1]) : o.vert);
    const seq = []; let t = 0;
    for (let i = 0; i < n; i++) { const g = vert(i); seq.push({ phase: i, debut: t, vert: g, jaune: o.jaune, toutRouge: o.toutRouge, fin: t + g + o.jaune + o.toutRouge }); t += g + o.jaune + o.toutRouge; }
    const cycle = t;
    const dec = o.decalage === 'zero' ? 0 : typeof o.decalage === 'number' ? o.decalage : typeof o.decalage === 'function' ? o.decalage(cycle) : (rng ? rng() : 0) * cycle;
    const parApproche = new Map(); phs.forEach((ph, i) => ph.forEach((a) => parApproche.set(a, i)));
    return { phases: phs, seq, cycle, decalage: dec, parApproche, params: { vert: o.vert, jaune: o.jaune, toutRouge: o.toutRouge } };
  }
  // etat global a l'instant t : { phase, etat: 'vert'|'jaune'|'toutRouge', reste }
  function etat(pl, t) {
    const tt = (((t + pl.decalage) % pl.cycle) + pl.cycle) % pl.cycle;
    for (const s of pl.seq) {
      if (tt < s.debut + s.vert) return { phase: s.phase, etat: 'vert', reste: s.debut + s.vert - tt };
      if (tt < s.debut + s.vert + s.jaune) return { phase: s.phase, etat: 'jaune', reste: s.debut + s.vert + s.jaune - tt };
      if (tt < s.fin) return { phase: s.phase, etat: 'toutRouge', reste: s.fin - tt };
    }
    return { phase: 0, etat: 'toutRouge', reste: 0 };
  }
  // couleur vue par une approche : 'vert' | 'jaune' | 'rouge' (une approche absente du plan est toujours verte : pas de feu)
  function couleur(pl, approche, t) {
    const i = pl.parApproche.get(approche); if (i === undefined) return 'vert';
    const s = etat(pl, t); if (s.phase !== i) return 'rouge';
    return s.etat === 'vert' ? 'vert' : s.etat === 'jaune' ? 'jaune' : 'rouge';
  }

  // secondes ecoulees depuis que le feu de l'approche est passe au rouge (0 s au moment ou le jaune se termine ; n'a de sens que si couleur(...) vaut 'rouge')
  function rougeDepuis(pl, approche, t) {
    const i = pl.parApproche.get(approche); if (i === undefined) return 0;
    const s = pl.seq[i], tt = (((t + pl.decalage) % pl.cycle) + pl.cycle) % pl.cycle;
    return (((tt - (s.debut + s.vert + s.jaune)) % pl.cycle) + pl.cycle) % pl.cycle;
  }
  const api = { DEFAUTS, branches, heuristique, plusProche, phases, plan, etat, couleur, rougeDepuis };
  if (typeof module !== 'undefined') module.exports = api; else root.Feux = api;
})(typeof window !== 'undefined' ? window : globalThis);

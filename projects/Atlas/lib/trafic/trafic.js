// trafic.js - trafic par COMPORTEMENT sur un reseau de troncons (BD TOPO ou equivalent), carrefours composes.
//
//  RESEAU      troncons -> graphe oriente (sens, voies par sens, niveaux) -> noeuds de simple passage fondus
//              -> carrefours COMPOSES : les troncons courts, les boucles courtes et les anneaux de giratoire deviennent des chemins INTERNES
//  INDIVIDUEL  un vehicule = (troncon, voie, abscisse, vitesse). A l'approche d'un carrefour il CHOISIT sa sortie et sa voie ; sa trajectoire
//              n'existe qu'au troncon courant et dans le carrefour en cours. File d'attente par voie, suivi de securite, priorite,
//              acceptation de creneau (plus courte quand on attend), cession a l'anneau d'un giratoire.
//  VOIES       nombre_de_voies BD TOPO -> voies par sens (double sens : ceil(nv / 2), sens unique : nv) ; voie d'entree selon le virage,
//              changement de voie obligatoire (virage) ou opportuniste (leader lent), decalage lateral continu, arret et depart cote a cote.
//  FEUX        HYPOTHESE de simulation (la BD TOPO n'en porte pas) : plans a durees fixes sur des carrefours designes ou choisis par heuristique ;
//              phases sans conflit calculees depuis la matrice de conflits (voir feux.js).
//  GLOBAL      regles (acces par classe, vitesse, periodes), tendance de virage, equilibrage de charge, circuit ferme
//              par classe de vehicule (aucune apparition/disparition), etat reproductible a partir d'une graine.
//  OUVERT      banc d'essai d'un carrefour ou d'un giratoire isole : arrivees poissonniennes aux extremites en impasse, sorties par les autres.
//
// Reglages de creer(G, cfg) utiles : voies (1 = une voie par sens), feux ({ auto, ids, points, vert, jaune, toutRouge, decalage }), ouvert ({ debit }),
// marge, patience, margeAnneau, ilot ; interrupteurs de comparaison (chacun remet le comportement d'origine) : file, suivi ('simple'), suiviChemin,
// meneurs ('plus-proche'), sortiePlace, raccord ('chaine'), insertionSure.
(function (root) {
  'use strict';
  const C = typeof require !== 'undefined' ? require('./carrefour.js') : root.Carrefour;
  const R = typeof require !== 'undefined' ? require('./reseau.js') : root.Reseau;
  const F = typeof require !== 'undefined' ? require('./feux.js') : root.Feux;
  const { lignes, cle, decaler } = R.aides;
  const D2R = Math.PI / 180, M = 111320;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const norm180 = C.norm180;

  // ------------------------------------------------------------------ graphe
  function graphe(features, centre) {
    const k = Math.cos(centre[1] * D2R), proj = (p) => [(p[0] - centre[0]) * M * k, (p[1] - centre[1]) * M];
    const noeuds = new Map(), aretes = [];
    const noeud = (p) => { const c = cle(p); if (!noeuds.has(c)) noeuds.set(c, { id: noeuds.size, pt: proj(p), in: [], out: [] }); return noeuds.get(c); };
    for (const f of features.filter(R.routier)) {
      const l0 = lignes(f)[0]; if (!l0 || l0.length < 2) continue;
      const p = f.properties, pts = [];
      for (const q of l0.map((z) => proj([z[0], z[1]]))) { const l = pts[pts.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.05) pts.push(q); }
      const a = noeud(l0[0]), b = noeud(l0[l0.length - 1]); if (pts.length < 2 || a === b) continue;
      const nv = Math.max(1, Number(p.nombre_de_voies) || 1), lw = clamp((Number(p.largeur_de_chaussee) || 0) / nv || 3, 2.75, 3.5);
      const sens = p.sens_de_circulation === 'Sens direct' ? 'direct' : p.sens_de_circulation === 'Sens inverse' ? 'inverse' : 'double';
      // voies PAR SENS : double sens = ceil(nv / 2), sens unique = nv. Decalage lateral (m, a droite du sens de la ligne) de chaque voie :
      // double sens, les voies partent de l'axe ; sens unique, elles sont centrees sur l'axe.
      const nl = clamp(sens === 'double' ? Math.ceil(nv / 2) : nv, 1, 5);
      const offs = Array.from({ length: nl }, (_, k) => (sens === 'double' ? lw * (k + 0.5) : lw * (k - (nl - 1) / 2)));
      const base = { niveau: String(p.position_par_rapport_au_sol ?? '0'), cl: [p.cleabs], nom: p.nom_collaboratif_gauche || '', importance: Number(p.importance) || 6, nv, nl, lw, offs, ring: p.nature === 'Rond-point',
        vmoy: Number(p.vitesse_moyenne_vl) || null, vmax: Math.max(5.6, Number(p.vitesse_moyenne_vl) > 0 ? Number(p.vitesse_moyenne_vl) / 3.6 : 8.3), off: sens === 'double' ? Math.max(nv, 2) * lw / 4 : 0 };
      const ajoute = (pp, de, vers) => { aretes.push(Object.assign({ de, vers, pts: pp }, base)); };
      if (sens !== 'inverse') ajoute(pts, a, b);
      if (sens !== 'direct') ajoute(pts.slice().reverse(), b, a);
    }
    const G = { noeuds: [...noeuds.values()], aretes, centre, proj };
    reindexer(G); return G;
  }
  function reindexer(G) {
    G.noeuds.forEach((n) => { n.in = []; n.out = []; });
    G.aretes.forEach((e, i) => { e.id = i; e.cum = C.cumul(e.pts); e.L = e.cum[e.cum.length - 1]; e.voie = decaler(e.pts, e.off); e.vcum = C.cumul(e.voie);
      e.de.out.push(e); e.vers.in.push(e); });
  }
  // fusion des noeuds de simple passage (deux troncons bout a bout, meme niveau)
  function simplifier(G) {
    const peutFondre = (e, f) => e.niveau === f.niveau && e.ring === f.ring && e.nv === f.nv && e.nl === f.nl;
    const fondre = (e, f) => Object.assign({}, e, { vers: f.vers, pts: e.pts.concat(f.pts.slice(1)), cl: e.cl.concat(f.cl), vmax: Math.min(e.vmax, f.vmax), importance: Math.min(e.importance, f.importance), nom: e.nom || f.nom });
    let change = true;
    while (change) {
      change = false;
      for (const n of G.noeuds) {
        const ent = G.aretes.filter((e) => e.vers === n), sor = G.aretes.filter((e) => e.de === n);
        let paires = null;
        if (ent.length === 1 && sor.length === 1 && ent[0].de !== sor[0].vers) paires = [[ent[0], sor[0]]];
        else if (ent.length === 2 && sor.length === 2) {
          const [e1, e2] = ent, f1 = sor.find((f) => f.vers !== e1.de), f2 = sor.find((f) => f.vers === e1.de);
          if (f1 && f2 && e1.de !== e2.de && f1.vers === e2.de && f2.vers === e1.de) paires = [[e1, f1], [e2, f2]];
        }
        if (!paires || !paires.every(([e, f]) => peutFondre(e, f))) continue;
        for (const [e, f] of paires) { G.aretes.splice(G.aretes.indexOf(e), 1); G.aretes.splice(G.aretes.indexOf(f), 1); G.aretes.push(fondre(e, f)); }
        change = true; break;
      }
    }
    const utilises = new Set(); G.aretes.forEach((e) => { utilises.add(e.de); utilises.add(e.vers); });
    G.noeuds = G.noeuds.filter((n) => utilises.has(n)); G.noeuds.forEach((n, i) => { n.id = i; });
    reindexer(G); return G;
  }
  // carrefours composes : union des noeuds relies par un troncon interne (court ou anneau)
  function composer(G, seuil, boucle) {
    const s = seuil ?? 20, c3 = boucle ?? 3, pere = new Map(G.noeuds.map((n) => [n, n]));
    const racine = (n) => { while (pere.get(n) !== n) { pere.set(n, pere.get(pere.get(n))); n = pere.get(n); } return n; };
    const interne = (e) => e.ring || e.L < s;
    G.aretes.forEach((e) => { e.interne = interne(e); if (e.interne) pere.set(racine(e.de), racine(e.vers)); });
    // boucle courte : un troncon dont les deux extremites sont deja dans le meme carrefour (bretelle, contre-allee) ne tient pas deux lignes d'arret et une sortie
    if (c3 > 0) G.aretes.forEach((e) => { if (!e.interne && e.L < c3 * s && racine(e.de) === racine(e.vers)) e.interne = true; });
    const groupes = new Map(); G.noeuds.forEach((n) => { const r = racine(n); if (!groupes.has(r)) groupes.set(r, []); groupes.get(r).push(n); });
    G.carrefours = [...groupes.values()].map((ns, i) => { const cl = { id: i, noeuds: ns, ring: false, interne: [], entrees: [], sorties: [], chemins: new Map() }; ns.forEach((n) => { n.cluster = cl; }); return cl; });
    for (const e of G.aretes) { if (e.interne) { e.de.cluster.interne.push(e); if (e.ring) e.de.cluster.ring = true; } else { e.vers.cluster.entrees.push(e); e.de.cluster.sorties.push(e); } }
    G.externes = G.aretes.filter((e) => !e.interne);
    return G;
  }
  function cheminInterne(cl, a, b) { // plus court chemin interne (aretes internes orientees) de a a b
    if (a === b) return [];
    const key = a.id + '>' + b.id; if (cl.chemins.has(key)) return cl.chemins.get(key);
    const dist = new Map([[a, 0]]), prev = new Map(), fait = new Set(); const file = [[0, a]];
    while (file.length) { file.sort((x, y) => x[0] - y[0]); const [d, n] = file.shift(); if (fait.has(n)) continue; fait.add(n); if (n === b) break;
      for (const e of n.out) if (e.interne && e.vers.cluster === cl) { const c = d + e.L; if (c < (dist.get(e.vers) ?? Infinity)) { dist.set(e.vers, c); prev.set(e.vers, e); file.push([c, e.vers]); } } }
    let res = null; if (prev.has(b)) { res = []; let n = b; while (n !== a) { const e = prev.get(n); res.unshift(e); n = e.de; } }
    cl.chemins.set(key, res); return res;
  }

  // ------------------------------------------------------------------ simulation
  function creer(G, cfg) {
    const c = Object.assign({ graine: 1, N: 100, dt: 0.2, len: 4.5, regs: [], partPL: 0.1, marge: 2.5, vue: 70, equilibrage: 1.0, classes: ['vl', 'pl'], filet: false, voies: 'auto', suiviChemin: true, meneurs: 'tous', sortiePlace: true, file: true, suivi: 'gipps', raccord: 'lisse', ilot: 3.5, patience: 25, margeMin: 1.0, margeAnneau: 1.25, demarrage: 1.5, ouvert: null, feux: null }, cfg || {});
    const multi = c.voies !== 1; // plusieurs voies par sens (nl de chaque troncon) ; voies: 1 = une seule voie par sens, comportement d'origine
    const rng = C.mulberry32(c.graine * 7919 + 13);
    const sim = { t: 0, agents: [], nid: 1, G, c, stats: { freins: 0, sautsPos: 0, contacts: new Set(), forces: 0, attente: 0, choix: 0, demitours: 0, bloquesClasse: 0, changVoie: 0, crees: 0, refuses: 0, sortis: 0, durees: [], bruleRouge: 0, entreesFeux: 0 } };
    const actif = (r) => (r.validite ? (r.validite.test ? r.validite.test(sim.t) : sim.t >= r.validite.debut && sim.t < r.validite.fin) : true);
    const touche = (r, e) => r.cleabs.some((x) => e.cl.includes(x));
    const vlim = (e) => { let v = e.vmax; for (const r of c.regs) if (r.type === 'speedLimit' && actif(r) && touche(r, e)) v = r.vmax; return v; };
    const accesOk = (e, pl) => !c.regs.some((r) => r.type === 'accesInterdit' && actif(r) && touche(r, e) && (!r.vehicules || pl));
    sim.vlim = vlim;
    const rB = (ei, eo) => Math.min(7, 0.35 * ei.L, 0.35 * eo.L);
    const nlOf = (e) => (multi ? e.nl : 1);
    // point de la voie `lat` (coordonnee de voie continue : 0 = voie de gauche, nl - 1 = voie de droite) a l'abscisse s
    const lanePt = (e, s, lat) => {
      s = clamp(s, 0, e.L);
      if (!multi) return C.pointA(e.voie, e.vcum, s * e.vcum[e.vcum.length - 1] / e.L);
      // decalage lateral PONCTUEL par rapport a l'axe, avec une normale lissee sur +-3 m : trajectoire continue dans les courbes (sans pointe de mitre ni glissement)
      const P = e.pts, cum = e.cum, W = 3, s0 = Math.max(0, s - W), s1 = Math.min(e.L, s + W);
      let i = 1; while (i < cum.length - 1 && cum[i] < s0) i++;
      let nx = 0, ny = 0; for (let j = i; j < cum.length; j++) { const lo = Math.max(cum[j - 1], s0), hi = Math.min(cum[j], s1); if (hi > lo) { const dx = P[j][0] - P[j - 1][0], dy = P[j][1] - P[j - 1][1], l = Math.hypot(dx, dy) || 1; nx += (dy / l) * (hi - lo); ny += (-dx / l) * (hi - lo); } if (cum[j] >= s1) break; }
      const ln = Math.hypot(nx, ny) || 1; nx /= ln; ny /= ln;
      let k = 1; while (k < cum.length - 1 && cum[k] < s) k++;
      const t = (s - cum[k - 1]) / (cum[k] - cum[k - 1] || 1e-9), ax = P[k - 1][0] + (P[k][0] - P[k - 1][0]) * t, ay = P[k - 1][1] + (P[k][1] - P[k - 1][1]) * t;
      lat = clamp(lat || 0, 0, e.nl - 1); const k0 = Math.floor(lat), k1 = Math.min(e.nl - 1, k0 + 1), off = e.offs[k0] + (e.offs[k1] - e.offs[k0]) * (lat - k0);
      return [ax + nx * off, ay + ny * off, (Math.atan2(-ny, nx) / D2R + 360) % 360];
    };
    // voies d'entree compatibles avec un virage (angle signe : negatif = a gauche) et voies de sortie correspondantes
    const aGauche = (sg) => sg < -35 || Math.abs(sg) > 150;
    const voiesEntree = (nl, sg) => { if (nl === 1) return [0]; if (aGauche(sg)) return [0]; if (sg > 35) return [nl - 1]; return Array.from({ length: nl }, (_, k) => k); };
    const voiesSortie = (li, nli, nlo, sg) => { if (nlo === 1) return [0]; if (aGauche(sg)) return [0]; if (sg > 35) return [nlo - 1];
      if (nli === 1) return Array.from({ length: nlo }, (_, k) => k); return [clamp(Math.round(li * (nlo - 1) / (nli - 1)), 0, nlo - 1)]; };
    const ARRET = c.len / 2 + 1;
    const mvCache = new Map();
    function mvt(ei, eo, li, lo) {
      li = li || 0; lo = lo || 0;
      const k = ei.id + '.' + li + '>' + eo.id + '.' + lo; if (mvCache.has(k)) return mvCache.get(k);
      const cl = ei.vers.cluster; let m = null;
      if (eo.de.cluster === cl) {
        const chemin = cheminInterne(cl, ei.vers, eo.de);
        if (chemin) {
          const r = rB(ei, eo), P0 = lanePt(ei, ei.L - r, li), P3 = lanePt(eo, r, lo); let brut;
          // liaison interne : suivie telle quelle dans un giratoire ; ailleurs (tronçons courts, carrefour decale) un seul raccord lisse entre la voie d'entree et la voie de sortie
          if (!chemin.length || (c.raccord === 'lisse' && !chemin.some((e) => e.ring))) {
            const d0 = C.vec(P0[2]), d3 = C.vec(P3[2]), kk = Math.hypot(P3[0] - P0[0], P3[1] - P0[1]) * 0.4; brut = [];
            for (let i = 0; i <= 14; i++) { const t = i / 14, u = 1 - t; brut.push([u*u*u*P0[0] + 3*u*u*t*(P0[0] + d0[0]*kk) + 3*u*t*t*(P3[0] - d3[0]*kk) + t*t*t*P3[0], u*u*u*P0[1] + 3*u*u*t*(P0[1] + d0[1]*kk) + 3*u*t*t*(P3[1] - d3[1]*kk) + t*t*t*P3[1]]); }
          } else {
            brut = [[P0[0], P0[1]]];
            const rg = nlOf(ei) - 1 - li; // rang depuis la voie de droite : la voie exterieure reste exterieure sur les liaisons internes
            // giratoire : l'entree rejoint l'anneau un peu apres le noeud, la sortie le quitte un peu avant (ilot separateur) : l'entree et la sortie d'une meme branche ne se frolent plus
            const ring = chemin.some((e) => e.ring), il = ring ? c.ilot : 0;
            chemin.forEach((e, ie) => { const lv = Math.max(0, nlOf(e) - 1 - Math.min(rg, nlOf(e) - 1)), d0 = ie === 0 ? Math.min(il, 0.3 * e.L) : 0, d1 = ie === chemin.length - 1 ? e.L - Math.min(il, 0.3 * e.L) : e.L;
              for (let s = d0; s < d1; s += 2.5) { const q = lanePt(e, s, lv); brut.push([q[0], q[1]]); } if (ie === chemin.length - 1) { const q = lanePt(e, d1, lv); brut.push([q[0], q[1]]); } });
            brut.push([P3[0], P3[1]]);
            for (let it = 0; it < 2; it++) { const n = [brut[0]]; for (let i = 0; i < brut.length - 1; i++) { const a = brut[i], b = brut[i + 1]; n.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); } n.push(brut[brut.length - 1]); brut = n; }
          }
          const cb = C.cumul(brut), Lg = cb[cb.length - 1], pts = []; for (let s = 0; s <= Lg + 1e-6; s += 0.5) pts.push(C.pointA(brut, cb, s));
          const cum = C.cumul(pts), signe = norm180(P3[2] - P0[2]);
          m = { key: k, li, lo, cl, ei, eo, r, pts, cum, L: Lg, signe, ang: Math.abs(signe), sEntree: ei.L - r, chemin, ring: cl.ring && chemin.some((e) => e.ring), rang: (cl.ring ? 1 : ei.importance) + (signe < -30 ? 0.5 : 0),
            vv: (cl.ring && chemin.some((e) => e.ring)) ? 5.5 : (Math.abs(signe) < 25 ? Infinity : clamp(7 - Math.abs(signe) / 25, 3.5, 7)) };
        }
      }
      mvCache.set(k, m); return m;
    }
    // mouvements au niveau de la voie : (voie d'entree, voie de sortie) compatibles avec le virage ; ordre monotone, donc sans croisement
    const varCache = new Map();
    function variantes(ei, eo) {
      const k = ei.id + '>' + eo.id; if (varCache.has(k)) return varCache.get(k);
      const m0 = mvt(ei, eo, 0, 0), out = [];
      if (m0) for (const li of voiesEntree(nlOf(ei), m0.signe)) for (const lo of voiesSortie(li, nlOf(ei), nlOf(eo), m0.signe)) { const m = mvt(ei, eo, li, lo); if (m) out.push(m); }
      varCache.set(k, out); return out;
    }
    const zoneCache = new Map(), zpts = new Map();
    function ptsZ(m) { // points [x, y, s] ; s = distance depuis l'entree du carrefour (negatif sur la voie d'approche)
      const k = m.key; if (zpts.has(k)) return zpts.get(k); const l = [];
      for (let q = 12; q >= 1; q -= 1) { const p = lanePt(m.ei, m.ei.L - m.r - q, m.li); l.push([p[0], p[1], -q]); }
      m.pts.forEach((p, i) => { if (i % 2 === 0) l.push([p[0], p[1], m.cum[i]]); });
      for (let q = 1; q <= 12; q += 1) { const p = lanePt(m.eo, m.r + q, m.lo); l.push([p[0], p[1], m.L + q]); }
      zpts.set(k, l); return l;
    }
    function conflit(a, b) { // zones de conflit de a (za) et de b (zb), type, cession ; null si aucun
      // meme approche : meme voie = divergence (pas de conflit) ; voies voisines = conflit seulement si les trajectoires se rejoignent (meme voie de sortie, liaison interne etroite)
      if (a.ei === b.ei && a.li === b.li) return null; const k = a.key + '|' + b.key; if (zoneCache.has(k)) return zoneCache.get(k);
      const pa = ptsZ(a), pb = ptsZ(b), seuilD = a.ei === b.ei ? 2.4 : 2.6; let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const p of pa) for (const q of pb) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < seuilD) { a0 = Math.min(a0, p[2]); a1 = Math.max(a1, p[2]); b0 = Math.min(b0, q[2]); b1 = Math.max(b1, q[2]); }
      let res = null;
      if (a0 !== Infinity) {
        const ha = C.pointA(a.pts, a.cum, clamp((a0 + a1) / 2, 0, a.L))[2], hb = C.pointA(b.pts, b.cum, clamp((b0 + b1) / 2, 0, b.L))[2];
        const type = a.eo === b.eo ? 'convergence' : (Math.abs(norm180(ha - hb)) < 45 ? 'fusion' : 'croisement');
        // fusion / convergence : seul le point de jonction est un conflit ; au-dela, les deux vehicules se suivent (suivi geometrique)
        const court = type !== 'croisement';
        const post = a.cl.ring && c.postAnneau !== undefined ? c.postAnneau : c.len + 3; // longueur de la zone apres le point de jonction (un giratoire se partage plus serre qu'un carrefour)
        res = { type, za: court ? [a0 - 1, a0 + post] : [a0 - 1, a1 + 1], zb: court ? [b0 - 1, b0 + post] : [b0 - 1, b1 + 1], cede: undefined, zaTotal: [a0, a1], zbTotal: [b0, b1] };
        if (a.cl.ring && (type === 'fusion' || type === 'convergence')) { if (a0 < b0 - 2) res.cede = true; else if (b0 < a0 - 2) res.cede = false; }
      }
      zoneCache.set(k, res); return res;
    }
    sim.mvt = mvt; sim.conflit = conflit; sim.lanePt = lanePt;

    // ---- connexite par classe : circuit ferme (composante fortement connexe des troncons externes) ----
    const classeEdges = {};
    function composante(pl) {
      const ext = G.externes.filter((e) => accesOk(e, pl)); const idx = new Map(), low = new Map(), pile = [], sur = new Set(); let t = 0; const comps = [];
      const succ = (e) => { const out = []; for (const eo of e.vers.cluster.sorties) { if (!accesOk(eo, pl)) continue; if (eo.de.cluster !== e.vers.cluster) continue; if (eo.vers === e.de && eo.de.cluster.entrees.length + eo.de.cluster.sorties.length > 2 && e.vers.cluster.sorties.length > 1) continue; if (mvt(e, eo)) out.push(eo); } return out; };
      const cache = new Map(); const S = (e) => { if (!cache.has(e)) cache.set(e, succ(e)); return cache.get(e); };
      const visite = (e0) => { const st = [[e0, 0]]; idx.set(e0, t); low.set(e0, t); t++; pile.push(e0); sur.add(e0);
        while (st.length) { const [e, i] = st[st.length - 1], sc = S(e);
          if (i < sc.length) { st[st.length - 1][1]++; const f = sc[i]; if (!idx.has(f)) { idx.set(f, t); low.set(f, t); t++; pile.push(f); sur.add(f); st.push([f, 0]); } else if (sur.has(f)) low.set(e, Math.min(low.get(e), idx.get(f))); }
          else { st.pop(); if (st.length) { const p = st[st.length - 1][0]; low.set(p, Math.min(low.get(p), low.get(e))); } if (low.get(e) === idx.get(e)) { const comp = []; let x; do { x = pile.pop(); sur.delete(x); comp.push(x); } while (x !== e); comps.push(comp); } } } };
      for (const e of ext) if (!idx.has(e)) visite(e);
      comps.sort((a, b) => b.length - a.length); return { set: new Set(comps[0] || []), nbComposantes: comps.length, taille: (comps[0] || []).length };
    }
    sim.composantes = { vl: composante(false), pl: composante(true) };
        // ---- systeme OUVERT (banc d'essai d'un carrefour isole) : des vehicules entrent par les extremites en impasse, sortent par les autres ----
    // ouvert : { debit: veh/h par entree (nombre) ou { id_troncon | cleabs: veh/h }, uniforme: true (sortie tiree au hasard, sans tendance) }
    const ouvert = c.ouvert ? Object.assign({ debit: 200, uniforme: true }, c.ouvert) : null;
    const bord = new Set(ouvert ? G.noeuds.filter((n) => new Set([...n.in.map((e) => e.de), ...n.out.map((e) => e.vers)]).size === 1) : []);
    const dans = (e, pl) => (ouvert ? true : sim.composantes[pl ? 'pl' : 'vl'].set.has(e));
    const sources = ouvert ? G.externes.filter((e) => bord.has(e.de)) : [];
    const rngO = C.mulberry32(c.graine * 104729 + 17);
    const debitDe = (e) => (typeof ouvert.debit === 'number' ? ouvert.debit : (ouvert.debit[e.id] ?? ouvert.debit[e.cl[0]] ?? 0));
    sim.sources = sources; const attenteEntree = new Map();

    function choisir(a, voieImposee) {
      const e = a.e, cl = e.vers.cluster;
      let cand = cl.sorties.filter((x) => accesOk(x, a.pl) && dans(x, a.pl) && x.de.cluster === cl && !(x.vers === e.de && cl.sorties.length > 1) && mvt(e, x));
      if (!cand.length) { cand = cl.sorties.filter((x) => dans(x, a.pl) && mvt(e, x)); if (cand.length) sim.stats.demitours++; }
      if (!cand.length) { cand = cl.sorties.filter((x) => mvt(e, x)); sim.stats.bloquesClasse++; }
      const nli = nlOf(e), lanesOk = (x) => voiesEntree(nli, mvt(e, x).signe);
      if (voieImposee !== undefined) { const sub = cand.filter((x) => lanesOk(x).includes(voieImposee)); if (sub.length) cand = sub; }
      // global : on vise une densite CIBLE par troncon (plus elevee sur les voies importantes) ; on regarde aussi un cran plus loin
      const w = cand.map((x) => { const m = mvt(e, x); const tendance = (m.ang < 25 ? 3 : m.ang < 100 ? 1 : 0.35) * (m.ring ? 1.3 : 1);
        const suites = x.vers.cluster.sorties.filter((y) => y.de.cluster === x.vers.cluster && dans(y, a.pl) && y.vers !== x.de); const sl = suites.length ? suites.reduce((t, y) => t + ratio(y), 0) / suites.length : 0;
        const q = ratio(x) + 0.5 * sl; let wt = tendance / (1 + c.equilibrage * q * q);
        if (nli > 1 && !lanesOk(x).includes(a.lane)) wt *= 0.3; // un changement de voie sera necessaire : moins probable
        return ouvert && ouvert.uniforme ? (nli > 1 && !lanesOk(x).includes(a.lane) ? 0.3 : 1) : wt; });
      let r = rng() * w.reduce((s, z) => s + z, 0), k = 0; for (; k < w.length - 1; k++) { r -= w[k]; if (r <= 0) break; }
      const x = cand[k]; let li = 0, lo = 0;
      if (multi) {
        const m0 = mvt(e, x), ok = lanesOk(x); li = ok.includes(a.lane) ? a.lane : ok.reduce((b, v) => (Math.abs(v - a.lane) < Math.abs(b - a.lane) ? v : b), ok[0]);
        const los = voiesSortie(li, nli, nlOf(x), m0.signe);
        if (los.length === 1) lo = los[0]; else { // une seule voie d'entree vers plusieurs voies de sortie : la moins chargee
          const occ = los.map((v) => sim.agents.filter((b) => b.e === x && b.mode === 'edge' && Math.abs(b.lat - v) < 0.7 && b.s < 80).length); const mn = Math.min(...occ), meil = los.filter((v, i) => occ[i] === mn); lo = meil[meil.length > 1 ? Math.floor(rng() * meil.length) : 0]; }
      }
      a.mv = mvt(e, x, li, lo); a.autorise = false; a.arrT = null; a.attVoie = 0; sim.stats.choix++;
    }
    sim.compte = new Map();
    const poids = (e) => (e.importance <= 3 ? 1.6 : e.importance === 4 ? 1.0 : 0.6) * (1 + 0.7 * (nlOf(e) - 1)); // une artere a deux voies porte plus de vehicules
    const moyPoids = G.externes.reduce((t, e) => t + poids(e) * e.L, 0) / G.externes.reduce((t, e) => t + e.L, 0);
    const dMoy = (ouvert ? 100 : c.N) / Math.max(0.001, G.externes.reduce((t, e) => t + e.L, 0) / 1000);
    const cible = (e) => Math.max(0.6, dMoy * poids(e) / moyPoids * e.L / 1000); // nombre de vehicules attendu sur le troncon
    const ratio = (e) => ((sim.compte.get(e.id) || 0)) / cible(e);
    const posA = (a) => (a.mode === 'noeud' ? C.pointA(a.mv.pts, a.mv.cum, a.cc) : lanePt(a.e, a.s, a.lat));
    sim.position = posA;

    // ---- etat initial reproductible ----
    const pool = (pl) => G.externes.filter((e) => dans(e, pl) && e.L > 45);
    for (let i = 0; !ouvert && i < c.N * 4 && sim.agents.length < c.N; i++) {
      const pl = rng() < c.partPL, P = pool(pl); if (!P.length) continue;
      const tot = P.reduce((s, e) => s + e.L * poids(e), 0); let r = rng() * tot, e = P[0]; for (const x of P) { r -= x.L * poids(x); if (r <= 0) { e = x; break; } }
      const s = 15 + rng() * (e.L - 40), lane = nlOf(e) > 1 ? Math.floor(rng() * nlOf(e)) : 0; if (sim.agents.some((a) => a.e === e && a.lane === lane && Math.abs(a.s - s) < 12)) continue;
      sim.agents.push({ id: sim.nid++, e, s, v: 4, mode: 'edge', mv: null, cc: 0, pl, autorise: false, arrT: null, attente: 0, p: null, lane, lat: lane, tVoie: -99, attVoie: 0, gap: Infinity, vL: 0 });
    }

    // vitesse que le mouvement impose dans le carrefour, et temps estime pour atteindre une abscisse du carrefour
    const vMouv = (m) => Math.min(vlim(m.ei), m.vv, vlim(m.eo));
    function tempsJusqua(dEntree, z, v0, m) { // dEntree : distance a l'entree du carrefour (>= 0 sur le troncon) ; z : abscisse visee dans le carrefour
      const vm = Math.max(1.5, vMouv(m)), dTot = Math.max(0, dEntree + z);
      const vApp = Math.max(1.5, (Math.max(v0, 0.5) + Math.min(Math.max(v0, 1), vm)) / 2);
      const dA = Math.min(dEntree, dTot); return (v0 < 1 ? c.demarrage : 0) + dA / vApp + Math.max(0, dTot - dA) / vm;
    }
    // la ligne d'arret recule si la voie d'approche croise la trajectoire d'un autre mouvement (zone de conflit avant l'entree)
    const zMinCache = new Map();
    function arretDe(m) {
      const k = m.key; if (zMinCache.has(k)) return zMinCache.get(k);
      let zmin = 0; for (const ei of m.cl.entrees) for (const eo of m.cl.sorties) { if (ei === m.ei) continue; for (const o of variantes(ei, eo)) { const cf = conflit(m, o); if (cf && cf.za[0] < zmin) zmin = cf.za[0]; } }
      const v = Math.min(-ARRET, zmin - c.len / 2 - 1); zMinCache.set(k, v); return v; // abscisse d'arret relative a l'entree du carrefour (negative)
    }
    // ---- feux tricolores : HYPOTHESE de simulation (la BD TOPO n'en porte pas), voir feux.js ----
    // c.feux = { auto, ids, points, rayon, vert, jaune, toutRouge, decalage, brMin, impMax, nImp } : carrefours equipes par liste (ids, points) et/ou par heuristique (auto).
    // Les phases sont calculees depuis la matrice de conflits : deux approches partagent le vert si aucun de leurs mouvements ne se croise ou ne se rejoint, a l'exception des
    // mouvements a gauche (cedent au sens inverse, comme sans feu). Au rouge on s'arrete a la ligne ; au jaune on passe si l'on ne peut plus s'arreter.
    const feux = new Map(); // id du carrefour -> plan
    function equiperFeux() {
      const o = c.feux; if (!o) return; const ids = new Set(o.ids || []);
      for (const p of o.points || []) { const cl = F.plusProche(G, G.proj(p), o.rayon); if (cl) ids.add(cl.id); }
      if (o.auto) F.heuristique(G, o).forEach((x) => ids.add(x.id));
      for (const id of ids) {
        const cl = G.carrefours[id]; if (!cl || cl.ring) continue;
        const mouv = []; for (const ei of cl.entrees) for (const eo of cl.sorties) { if (eo.vers === ei.de && cl.sorties.length > 1) continue; for (const m of variantes(ei, eo)) mouv.push(m); }
        const appr = [...new Set(mouv.map((m) => m.ei))].sort((x, y) => x.importance - y.importance || x.id - y.id); if (appr.length < 2) continue;
        const gauche = (m) => m.signe < -30 || Math.abs(m.signe) > 150, parAppr = new Map(appr.map((e) => [e.id, mouv.filter((m) => m.ei === e)]));
        const incompat = (x, y) => parAppr.get(x).some((mx) => parAppr.get(y).some((my) => { const cf = conflit(mx, my); return cf && !gauche(mx) && !gauche(my); }));
        const phs = F.phases(appr.map((e) => e.id), incompat); if (phs.length < 2) continue;
        feux.set(id, F.plan(phs, o, C.mulberry32(c.graine * 31337 + id)));
      }
    }
    equiperFeux();
    const couleurDe = (ei) => { const pl = feux.get(ei.vers.cluster.id); return pl ? F.couleur(pl, ei.id, sim.t) : 'vert'; };
    sim.feux = feux; sim.couleurFeu = couleurDe;
    let parEdge = new Map(); // vehicules sur troncon, par troncon (reconstruit a chaque pas)
    // la voie de sortie est encombree : un vehicule lent ou arrete juste apres l'entree de CETTE voie
    // la voie de sortie est encombree : on n'entre pas dans le carrefour si la file de sortie ne peut pas accueillir le vehicule
    // (et ceux deja autorises vers la meme voie) : ne pas bloquer le carrefour. `reg` : vehicules du carrefour.
    function sortieEncombree(a, reg) {
      const m = a.mv, lane = parEdge.get(m.eo.id) || [];
      if (!c.sortiePlace) return lane.some((b) => b !== a && Math.abs(b.lat - m.lo) < 0.9 && b.s < m.r + 2 * c.len + 6 && b.v < 2.5);
      let queue = Infinity; for (const b of lane) if (b !== a && Math.abs(b.lat - m.lo) < 0.9 && b.v < 2.5 && b.s < queue) queue = b.s; // queue de file : le vehicule lent le plus proche de l'entree
      let avant = 0; for (const b of reg || []) if (b !== a && b.mv && b.mv.eo === m.eo && b.mv.lo === m.lo && (b.mode === 'noeud' || b.autorise) && (a.tAut === undefined || (b.tAut ?? -1) < a.tAut)) avant++;
      if (queue === Infinity) return false;
      return queue - c.len - m.r < (avant + 1) * (c.len + 2);
    }
    // ---- voies : un vehicule peut-il se placer sur la voie k (aucun vehicule trop pres devant ou derriere, dans cette voie ou en train d'y entrer) ?
    function voieLibre(a, k) {
      for (const b of parEdge.get(a.e.id) || []) { if (b === a || Math.min(Math.abs(b.lat - k), Math.abs(b.lane - k)) > 0.75) continue;
        const ds = b.s - a.s, dev = c.len + 3 + Math.max(0, a.v - b.v) * 1.2, der = c.len + 3 + Math.max(0, b.v - a.v) * 1.6; if (ds > -der && ds < dev) return false;
        // ni le vehicule qui s'insere, ni celui qui le suit ne doivent etre obliges de freiner fort : le meneur peut etre en train de s'arreter (file), le suiveur arriver vite
        if (c.suivi !== 'simple' && c.insertionSure !== false) { if (ds > 0 ? vSure(ds - c.len, b.v) < a.v - 1 : vSure(-ds - c.len, a.v) < b.v - 1) return false; } }
      return true;
    }
    function ecartVoie(a, k) { // distance libre devant a dans la voie k
      let g = a.e.L - a.s; for (const b of parEdge.get(a.e.id) || []) { if (b === a || b.s <= a.s || Math.min(Math.abs(b.lat - k), Math.abs(b.lane - k)) > 0.75) continue; g = Math.min(g, b.s - a.s - c.len); } return g;
    }
    // changement de voie : obligatoire (le mouvement choisi part d'une autre voie), sinon opportuniste (leader lent, voie plus libre) ; une voie a la fois
    function gererVoie(a) {
      if (Math.abs(a.lat - a.lane) > 0.05) return; // un changement est en cours
      const nl = a.e.nl; let cible = a.lane;
      if (a.mv) { if (a.mv.li !== a.lane && sim.t - a.tVoie > 1) cible = a.lane + Math.sign(a.mv.li - a.lane); }
      else if (sim.t - a.tVoie > 5 && a.e.L - a.s > c.vue + 20) {
        if (a.gap < 18 && a.vL < 0.75 * vlim(a.e)) { for (const k of [a.lane - 1, a.lane + 1]) if (k >= 0 && k < nl && ecartVoie(a, k) > a.gap + 8 && voieLibre(a, k)) { cible = k; break; } }
        else if (a.gap > 35 && a.lane < nl - 1 && sim.t - a.tVoie > 12 && ecartVoie(a, a.lane + 1) > 35 && voieLibre(a, a.lane + 1)) cible = a.lane + 1; // serrer a droite quand la voie est libre
      }
      if (cible !== a.lane && voieLibre(a, cible)) { a.lane = cible; a.tVoie = sim.t; sim.stats.changVoie++; }
    }
    function peutPasser(a, reg) {
      const ma = a.mv;
      if (sortieEncombree(a, reg)) { a.motif = 'sortie'; return false; } // ne pas bloquer le carrefour
      const dA = Math.max(0, ma.sEntree - a.s);
      // l'impatience raccourcit la marge : un conducteur qui attend depuis longtemps accepte un creneau plus court
      const marge = c.patience > 0 && a.arrT !== null ? Math.max(c.margeMin, c.marge - (sim.t - a.arrT) * (c.marge - c.margeMin) / c.patience) : c.marge;
      for (const b of reg) { if (b === a || !b.mv) continue; const cf = conflit(ma, b.mv); if (!cf) continue;
        const engage = b.mode === 'noeud' || b.autorise, pb = b.mode === 'noeud' ? b.cc : b.s - b.mv.sEntree;
        if (!engage) { if (feux.size && couleurDe(b.mv.ei) === 'rouge') continue; // b attend le vert : il ne passera pas avant a
          if (c.file && b.devant && !b.devant.autorise) continue; // b est coince derriere un vehicule qui n'a pas encore la main : il ne passera pas avant lui
          if (cf.cede !== undefined) continue; // anneau : seul celui qui est deja engage est prioritaire
          const prio = b.mv.rang < ma.rang || (b.mv.rang === ma.rang && (b.arrT ?? 1e9) < (a.arrT ?? 1e9)); if (!prio || -pb > 45) continue; }
        else if (pb - c.len / 2 > cf.zb[1] + 0.5) continue; // b a degage la zone
        let tb0, tb1;
        if (b.mode === 'noeud') { const vb = Math.max(b.v, 2); tb0 = Math.max(0, cf.zb[0] - c.len / 2 - pb) / vb; tb1 = Math.max(0, cf.zb[1] + c.len / 2 - pb) / vb; }
        else { const dB = Math.max(0, -pb); tb0 = tempsJusqua(dB, cf.zb[0] - c.len / 2, b.v, b.mv); tb1 = tempsJusqua(dB, cf.zb[1] + c.len / 2, b.v, b.mv); }
        const ta0 = tempsJusqua(dA, cf.za[0] - c.len / 2, a.v, ma), ta1 = tempsJusqua(dA, cf.za[1] + c.len / 2, a.v, ma);
        const mg = cf.cede !== undefined && c.margeAnneau !== undefined ? Math.min(marge, c.margeAnneau) : marge; // entree d'un giratoire : creneau plus serre que dans un carrefour ordinaire
        if (ta0 < tb1 + mg && tb0 < ta1 + mg) { a.bloqueur = b; a.motif = 'conflit'; return false; }
      }
      return true;
    }
    // dans une courbe, une voie exterieure est plus longue que l'axe : l'abscisse s (sur l'axe) avance moins vite que le vehicule (le deplacement reel est v * dt)
    function avanceArc(a, d) {
      const e = a.e, p0 = lanePt(e, a.s, a.lat); let ds = d;
      for (let i = 0; i < 3; i++) { const p1 = lanePt(e, a.s + ds, a.lat), dist = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); if (dist < 1e-6 || Math.abs(dist - d) < 0.02) break; ds = clamp(ds * d / dist, 0.4 * d, 2.5 * d); }
      return ds;
    }
    // vitesse maximale a laquelle un suiveur (freinage b, reaction tau) peut encore s'arreter derriere un meneur qui peut freiner plus fort (bL) ; nulle si l'ecart est deja insuffisant
    const SUIVI = { b: 3, bL: 4, tau: 0.3, s0: 2 };
    const vSure = (gap, vL) => { const arg = SUIVI.b * SUIVI.b * SUIVI.tau * SUIVI.tau + vL * vL * SUIVI.b / SUIVI.bL + 2 * SUIVI.b * (gap - SUIVI.s0); return arg < 0 ? 0 : SUIVI.b * SUIVI.tau + Math.sqrt(arg); };
    sim.pas = function () {
      const dt = c.dt, st = sim.stats;
      sim.compte = new Map(); const reg = new Map(), grille = new Map(), K = (x, y) => ((x / 25) | 0) + ':' + ((y / 25) | 0);
      for (const e of sources) { const lam = debitDe(e) / 3600 * dt; if (lam > 0 && rngO() < lam) attenteEntree.set(e.id, (attenteEntree.get(e.id) || 0) + 1); // arrivees poissonniennes a l'extremite de chaque branche d'entree
        if (!attenteEntree.get(e.id)) continue;
        const lane = nlOf(e) > 1 ? Math.floor(rngO() * nlOf(e)) : 0;
        if (sim.agents.some((b) => b.e === e && b.mode === 'edge' && b.lane === lane && b.s < 12)) { st.refuses++; continue; } // pas de place a l'entree : l'arrivee attend (file virtuelle), la demande n'est pas perdue
        attenteEntree.set(e.id, attenteEntree.get(e.id) - 1);
        sim.agents.push({ id: sim.nid++, e, s: 0, v: Math.min(vlim(e), 8.3), mode: 'edge', mv: null, cc: 0, pl: rngO() < c.partPL, autorise: false, arrT: null, attente: 0, p: null, lane, lat: lane, tVoie: -99, attVoie: 0, gap: Infinity, vL: 0, t0: sim.t, orig: e.id }); st.crees++; }
      parEdge = new Map(); for (const a of sim.agents) if (a.mode === 'edge') (parEdge.get(a.e.id) || parEdge.set(a.e.id, []).get(a.e.id)).push(a);
      // file d'attente : chaque vehicule connait celui qui le precede dans sa voie (premier arrive, premier servi : on ne passe pas devant lui)
      for (const l of parEdge.values()) for (const a of l) { let t = null; for (const b of l) if (b !== a && b.s > a.s && Math.abs(b.lat - a.lat) < 0.8 && (!t || b.s < t.s)) t = b; a.devant = t; }
      for (const a of sim.agents) { sim.compte.set(a.e.id, (sim.compte.get(a.e.id) || 0) + 1); a.p = posA(a); const kk = K(a.p[0], a.p[1]); (grille.get(kk) || grille.set(kk, []).get(kk)).push(a);
        if (a.mv) (reg.get(a.mv.cl.id) || reg.set(a.mv.cl.id, []).get(a.mv.cl.id)).push(a); }
      const voisins = (a) => { const o = []; const gx = (a.p[0] / 25) | 0, gy = (a.p[1] / 25) | 0; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = grille.get((gx + i) + ':' + (gy + j)); if (l) o.push(...l); } return o; };
      for (const a of sim.agents) {
        let vt = vlim(a.e);
        if (a.mode === 'edge') {
          if (!a.mv && a.e.L - a.s < c.vue + 7 && !bord.has(a.e.vers)) { choisir(a); (reg.get(a.mv.cl.id) || reg.set(a.mv.cl.id, []).get(a.mv.cl.id)).push(a); }
          if (multi && a.e.nl > 1) gererVoie(a);
          if (a.mv) {
            const arret = a.mv.sEntree + arretDe(a.mv), dB = arret - a.s; vt = Math.min(vt, Math.sqrt(Math.min(a.mv.vv, vlim(a.mv.eo)) ** 2 + 2 * 2.5 * Math.max(0, dB)));
            const aligne = !multi || (a.lane === a.mv.li && Math.abs(a.lat - a.mv.li) < 0.02);
            if (!aligne && dB < 30) { a.attVoie += dt; if (a.attVoie > 12 && a.e.nl > 1) choisir(a, a.lane); } // voie de gauche/droite introuvable : on se contente d'un mouvement faisable depuis la voie actuelle
            // feux : au rouge on s'arrete, au jaune seul celui qui ne peut plus s'arreter confortablement passe ; une autorisation donnee trop tot est retiree si l'on peut encore s'arreter
            const coul = feux.size ? couleurDe(a.mv.ei) : 'vert'; let feuOk = true;
            if (coul !== 'vert') {
              const arretOk = dB - a.v * a.v / (coul === 'jaune' ? 6 : 7) > (coul === 'jaune' ? 1.0 : -0.3);
              if (a.autorise) { if (arretOk) { a.autorise = false; a.arrT = sim.t; } } else { feuOk = coul === 'jaune' && !arretOk; if (!feuOk) a.arrT = sim.t; } // l'attente au feu ne compte pas dans le delai d'arbitrage force
            }
            if (a.autorise && a.v < 1 && dB > -0.5 && sortieEncombree(a, reg.get(a.mv.cl.id))) { a.autorise = false; a.arrT = sim.t; } // la sortie s'est remplie : on retire l'autorisation
            if (!a.autorise && dB < 30) { if (a.arrT === null) a.arrT = sim.t; const suit = c.file && a.devant && !a.devant.autorise, ok = feuOk && aligne && !suit && peutPasser(a, reg.get(a.mv.cl.id) || []); if (!aligne) a.motif = 'voie'; else if (suit) a.motif = 'file'; if (ok || (feuOk && aligne && !(c.file && a.devant && !a.devant.autorise) && sim.t - a.arrT > 45)) { if (!ok) st.forces++; a.autorise = true; a.tAut = sim.t; } else vt = Math.min(vt, Math.sqrt(2 * 2.5 * Math.max(0, dB - 1))); }
          }
        } else vt = Math.min(vt, a.mv.vv, vlim(a.mv.eo));
        const hr = a.p[2] * D2R, fx = Math.sin(hr), fy = Math.cos(hr); let gap = Infinity, vL = 0;
        const lim = (g, v) => (c.suivi === 'simple' ? Math.sqrt(Math.max(0, 2 * 2.5 * (g - 2)) + v * v) : vSure(g, v)); // distance de securite (Gipps) : le meneur peut freiner plus fort que le suiveur ; un ecart trop court s'elargit
        const retient = (g, b) => { if (c.meneurs === 'plus-proche') { if (g < gap) { gap = g; vL = b.v; } } else { vt = Math.min(vt, lim(g, b.v)); if (g < gap) { gap = g; vL = b.v; } } }; // tous les meneurs contraignent : l'arret d'un vehicule lointain compte meme si un plus proche roule
        for (const b of voisins(a)) { if (b === a || b.e.niveau !== a.e.niveau) continue; const dx = b.p[0] - a.p[0], dy = b.p[1] - a.p[1], al = dx * fx + dy * fy, la = Math.abs(dx * fy - dy * fx);
          const geo = al > 0 && al < 40 && la < 2.2 && Math.abs(norm180(b.p[2] - a.p[2])) < 40;
          if (geo) retient(al - c.len, b);
          if (c.suiviChemin && (!geo || c.meneurs !== 'plus-proche')) { // suivi le long du chemin (meme troncon et meme voie, meme mouvement) : tient dans les virages serres ou le cap des deux vehicules differe de plus de 40 degres
            let g = null;
            if (a.mode === 'edge') { if (b.mode === 'edge' && b.e === a.e && b.s > a.s && Math.abs(b.lat - a.lat) < 0.8) g = b.s - a.s - c.len; else if (b.mode === 'noeud' && a.mv && b.mv === a.mv) g = a.mv.sEntree - a.s + b.cc - c.len; }
            else if (b.mode === 'noeud') { if (b.mv === a.mv && b.cc > a.cc) g = b.cc - a.cc - c.len; } else if (b.e === a.mv.eo && Math.abs(b.lat - a.mv.lo) < 0.8) g = a.mv.L - a.cc + b.s - a.mv.r - c.len;
            if (g !== null && g < 40) retient(g, b); } }
        if (c.meneurs === 'plus-proche' && gap < Infinity) vt = Math.min(vt, lim(gap, vL));
        a.gap = gap; a.vL = vL;
        // filet de securite : deux vehicules sur des caps qui se croisent et qui se rapprochent -> celui de moindre priorite s'arrete
        if (c.filet) for (const b of voisins(a)) { if (b === a || b.e.niveau !== a.e.niveau || Math.abs(norm180(b.p[2] - a.p[2])) < 30) continue;
          const rx = b.p[0] - a.p[0], ry = b.p[1] - a.p[1]; if (rx * fx + ry * fy < -1.5) continue; const hb = b.p[2] * D2R;
          const vx = Math.sin(hb) * b.v - fx * a.v, vy = Math.cos(hb) * b.v - fy * a.v, v2 = vx * vx + vy * vy; if (v2 < 0.05) continue;
          const tca = clamp(-(rx * vx + ry * vy) / v2, 0, 3.5), dmin = Math.hypot(rx + vx * tca, ry + vy * tca); // approche minimale prevue dans les 3,5 s
          if (dmin < 3.4 && (tca > 0 || Math.hypot(rx, ry) < 3.4)) { const ra = a.mv ? a.mv.rang : 0, rb = b.mv ? b.mv.rang : 0; if (ra > rb || (ra === rb && a.id > b.id)) { vt = 0; st.freins++; } } }
        a.v = clamp(a.v + clamp(vt - a.v, -4.5 * dt, 2 * dt), 0, 30); if (a.v < 0.3) { a.attente += dt; st.attente += dt; }
      }
      for (const a of sim.agents) {
        const avant = a.p, d = a.v * dt;
        if (multi && a.mode === 'edge' && a.lat !== a.lane) a.lat += clamp(a.lane - a.lat, -0.5 * dt, 0.5 * dt); // changement de voie : environ 2 s par voie
        if (a.mode === 'edge') { const s0 = a.s; a.s += multi && d > 0 ? avanceArc(a, d) : d;
          if (a.mv && !a.autorise && a.s > a.mv.sEntree + arretDe(a.mv) + 0.1) { a.s = Math.max(s0, a.mv.sEntree + arretDe(a.mv)); a.v = 0; }
          if (a.mv && a.s >= a.mv.sEntree) { a.cc = a.s - a.mv.sEntree; a.mode = 'noeud'; if (feux.size && feux.has(a.mv.cl.id)) st.entreesFeux++; if (feux.size && couleurDe(a.mv.ei) === 'rouge' && F.rougeDepuis(feux.get(a.mv.cl.id), a.mv.ei.id, sim.t) > feux.get(a.mv.cl.id).params.toutRouge + 0.5) st.bruleRouge++; } // franchissement apres la fin du tout-rouge : le seul vrai brule-feu
          else if (!a.mv && a.s >= a.e.L - 0.5 && !bord.has(a.e.vers)) { choisir(a); a.mode = 'noeud'; a.cc = 0; a.autorise = true; } }
        else { a.cc += d; if (a.cc >= a.mv.L) { const r = a.cc - a.mv.L; a.e = a.mv.eo; a.s = a.mv.r + r; a.lane = a.lat = a.mv.lo; a.tVoie = sim.t; a.mode = 'edge'; a.mv = null; a.autorise = false; a.arrT = null; } }
        const nv = posA(a); if (Math.hypot(nv[0] - avant[0], nv[1] - avant[1]) > d + 1.0) st.sautsPos++;
      }
      for (const [, l] of grille) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) { const a = l[i], b = l[j];
        if (a.e.niveau === b.e.niveau && Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]) < 2.0 && Math.abs(norm180(a.p[2] - b.p[2])) > 30) { const cle = Math.min(a.id, b.id) + '-' + Math.max(a.id, b.id); if (c.diag && !st.contacts.has(cle)) c.diag(a, b, sim); st.contacts.add(cle); } }
      if (ouvert) sim.agents = sim.agents.filter((a) => { if (a.mode === 'edge' && bord.has(a.e.vers) && a.s >= a.e.L - 0.5) { st.sortis++; st.durees.push({ orig: a.orig, dest: a.e.id, d: sim.t - a.t0, attente: a.attente }); return false; } return true; });
      sim.t += dt;
    };
    return sim;
  }

  function construire(features, centre, opts) {
    const o = Object.assign({ seuil: 20 }, opts || {});
    const G = graphe(features, centre); const n0 = G.aretes.length; simplifier(G); composer(G, o.seuil, o.boucle);
    G.resume = { aretesBrutes: n0, aretes: G.aretes.length, externes: G.externes.length, internes: G.aretes.length - G.externes.length, carrefours: G.carrefours.filter((x) => x.entrees.length + x.sorties.length > 0).length,
      composes: G.carrefours.filter((x) => x.noeuds.length > 1).length, anneaux: G.carrefours.filter((x) => x.ring).length, kmVoie: G.aretes.reduce((s, e) => s + e.L, 0) / 1000 };
    return G;
  }
  const api = { graphe, simplifier, composer, construire, creer, cheminInterne, Feux: F };
  if (typeof module !== 'undefined') module.exports = api; else root.Trafic = api;
})(typeof window !== 'undefined' ? window : globalThis);

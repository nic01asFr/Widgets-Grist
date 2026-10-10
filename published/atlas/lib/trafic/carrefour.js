// carrefour.js - modele de noeud de reseau routier (essai, indépendant d'Atlas)
// Repere local en metres : x vers l'est, y vers le nord. Cap = azimut en degres, sens horaire depuis le nord.
(function (root) {
  'use strict';
  const D2R = Math.PI / 180;
  const norm180 = (a) => ((a + 180) % 360 + 360) % 360 - 180;
  const vec = (b) => [Math.sin(b * D2R), Math.cos(b * D2R)];
  const mulberry32 = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // ---- geometrie ----
  function bezier(p0, p1, p2, p3, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, q = 1 - t;
      out.push([
        q * q * q * p0[0] + 3 * q * q * t * p1[0] + 3 * q * t * t * p2[0] + t * t * t * p3[0],
        q * q * q * p0[1] + 3 * q * q * t * p1[1] + 3 * q * t * t * p2[1] + t * t * t * p3[1]]);
    }
    return out;
  }
  function cumul(pts) {
    const c = [0];
    for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return c;
  }
  // point a l'abscisse s sur une polyligne (avec cumul) -> [x, y, cap]
  function pointA(pts, cum, s) {
    if (pts.length < 2) return [pts[0][0], pts[0][1], 0]; // trajectoire de longueur nulle (tronçons confondus) : un point, sans cap
    const L = cum[cum.length - 1];
    s = clamp(s, 0, L);
    let k = 1;
    while (k < cum.length - 1 && cum[k] < s) k++;
    const seg = cum[k] - cum[k - 1] || 1e-9;
    const f = (s - cum[k - 1]) / seg;
    const a = pts[k - 1], b = pts[k];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, (Math.atan2(b[0] - a[0], b[1] - a[1]) / D2R + 360) % 360];
  }

  // ---- construction du noeud : branches -> mouvements -> matrices ----
  // arms : [{ bearing, cls: 'majeure'|'mineure', sens: 'both'|'in'|'out', nom }]
  function construire(arms, opts) {
    const o = Object.assign({ R: 14, w: 3, APP: 80, OUT: 60, seuil: 2.5 }, opts || {});
    const A = arms.map((a, i) => Object.assign({ sens: 'both', cls: 'mineure' }, a, { i, u: vec(a.bearing) }));
    const mvts = [];
    for (const ai of A) {
      if (ai.sens === 'out') continue;
      for (const aj of A) {
        if (aj === ai || aj.sens === 'in') continue;
        const delta = norm180(aj.bearing - (ai.bearing + 180));
        const ab = Math.abs(delta);
        const type = ab < 30 ? 'droit' : ab < 150 ? (delta > 0 ? 'droite' : 'gauche') : 'demi-tour';
        const din = [-ai.u[0], -ai.u[1]];
        const E = [ai.u[0] * o.R - ai.u[1] * o.w, ai.u[1] * o.R + ai.u[0] * o.w];
        const X = [aj.u[0] * o.R + aj.u[1] * o.w, aj.u[1] * o.R - aj.u[0] * o.w];
        const k = Math.hypot(X[0] - E[0], X[1] - E[1]) * 0.4;
        const brut = bezier(E, [E[0] + din[0] * k, E[1] + din[1] * k], [X[0] - aj.u[0] * k, X[1] - aj.u[1] * k], X, 60);
        const cb = cumul(brut), L = cb[cb.length - 1];
        const pts = [];
        for (let s = 0; s <= L + 1e-6; s += 0.5) pts.push(pointA(brut, cb, s));
        const cum = cumul(pts);
        let rang = ai.cls === 'majeure' ? 2 : 1;
        if (type === 'gauche' && ai.cls === 'majeure') rang = 1.5;
        const offIn = [-ai.u[1] * o.w, ai.u[0] * o.w], offOut = [aj.u[1] * o.w, -aj.u[0] * o.w];
        const appPts = [], outPts = [];
        for (let d = o.APP; d >= 0; d -= 2) appPts.push([ai.u[0] * (o.R + d) + offIn[0], ai.u[1] * (o.R + d) + offIn[1]]);
        for (let d = 0; d <= o.OUT; d += 2) outPts.push([aj.u[0] * (o.R + d) + offOut[0], aj.u[1] * (o.R + d) + offOut[1]]);
        mvts.push(assembler({ idx: mvts.length, de: ai.i, vers: aj.i, type, base: type !== 'demi-tour', pts, cum, L, rang,
          vnode: type === 'droit' ? 11 : 6 }, appPts, outPts));
      }
    }
    return { o, arms: A, mvts, conf: conflits(mvts, o.seuil) };
  }

  // assemble approche + trajectoire interne + sortie en une route continue (abscisse s ; entree du noeud a s = app)
  function assembler(m, appPts, outPts) {
    const pts = appPts.slice(0, -1).map((p) => [p[0], p[1]]).concat(m.pts.map((p) => [p[0], p[1]]), outPts.slice(1).map((p) => [p[0], p[1]]));
    const cum = cumul(pts);
    m.app = cumul(appPts)[appPts.length - 1];
    m.out = cumul(outPts)[outPts.length - 1];
    m.rte = { pts, cum };
    return m;
  }

  // matrice de conflits : zones d'occupation (abscisses sur la trajectoire interne de chaque mouvement)
  function conflits(mvts, seuil, giratoire) {
    const o = { seuil };
    const n = mvts.length;
    const conf = Array.from({ length: n }, () => Array(n).fill(null));
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const ma = mvts[a], mb = mvts[b];
      if (ma.de === mb.de) continue; // meme origine : divergence, pas de conflit
      let za0 = Infinity, za1 = -Infinity, zb0 = Infinity, zb1 = -Infinity;
      for (let i = 0; i < ma.pts.length; i += 1) for (let j = 0; j < mb.pts.length; j += 1) {
        if (Math.hypot(ma.pts[i][0] - mb.pts[j][0], ma.pts[i][1] - mb.pts[j][1]) < o.seuil) {
          const sa = ma.cum[i], sb = mb.cum[j];
          if (sa < za0) za0 = sa; if (sa > za1) za1 = sa;
          if (sb < zb0) zb0 = sb; if (sb > zb1) zb1 = sb;
        }
      }
      if (za0 === Infinity) continue;
      const ha = pointA(ma.pts, ma.cum, (za0 + za1) / 2)[2], hb = pointA(mb.pts, mb.cum, (zb0 + zb1) / 2)[2];
      const memeSens = Math.abs(norm180(ha - hb)) < 45;
      const type = ma.vers === mb.vers ? 'convergence' : (memeSens ? 'fusion' : 'croisement');
      conf[a][b] = { type, z: [Math.max(0, za0 - 1), za1 + 1], zAutre: [Math.max(0, zb0 - 1), zb1 + 1] };
      conf[b][a] = { type, z: [Math.max(0, zb0 - 1), zb1 + 1], zAutre: [Math.max(0, za0 - 1), za1 + 1] };
      // giratoire : celui qui rejoint l'anneau (zone qui commence tot sur sa trajectoire) cede a celui qui y est deja
      if (giratoire && (type === 'fusion' || type === 'convergence')) {
        if (za0 < zb0 - 2) { conf[a][b].cede = true; conf[b][a].cede = false; }
        else if (zb0 < za0 - 2) { conf[b][a].cede = true; conf[a][b].cede = false; }
      }
    }
    return conf;
  }

  // ---- reglementation (forme proche de TrafficRegulation de DATEX II : objet + lieu + validite) ----
  // { id, type: 'turnProhibition'|'speedLimit', de, vers, branche, vmax, validite: { debut, fin } }
  const actif = (r, t) => (r.validite.test ? r.validite.test(t) : t >= r.validite.debut && t < r.validite.fin);
  // acces interdit sur une branche pour un vehicule (poids lourd), selon les arretes actifs
  function accesInterdit(regs, t, arm, pl) {
    return regs.some((r) => r.type === 'accesInterdit' && r.branche === arm && actif(r, t) && (!r.vehicules || pl));
  }
  function matriceA(noeud, regs, t) {
    return noeud.mvts.map((m) => m.base && !regs.some((r) => r.type === 'turnProhibition' && actif(r, t) && r.de === m.de && r.vers === m.vers));
  }
  // un arrete de limitation actif remplace la vitesse moyenne BD TOPO (qui n'est pas une limite reglementaire)
  function vitesseMax(noeud, regs, t, arm) {
    const lim = regs.filter((r) => r.type === 'speedLimit' && actif(r, t) && r.branche === arm).map((r) => r.vmax);
    if (lim.length) return Math.min(...lim);
    return (noeud.arms[arm] && noeud.arms[arm].vmax) || 13.9;
  }

  // ---- simulation ----
  function tAtteint(d, v0, vmax, acc) {
    if (d <= 0) return 0;
    if (v0 >= vmax) return d / v0;
    const dAcc = (vmax * vmax - v0 * v0) / (2 * acc);
    if (d <= dAcc) return (-v0 + Math.sqrt(v0 * v0 + 2 * acc * d)) / acc;
    return (vmax - v0) / acc + (d - dAcc) / vmax;
  }

  function creerSim(noeud, cfg) {
    const c = Object.assign({ graine: 1, debit: null, regs: [], regles: true, dt: 0.1, len: 4.5, decision: 45, marge: 3,
      bconf: 2.5, bmax: 4.5, amax: 2.0, vEng: 10, partPL: 0.1 }, cfg || {});
    const { o, arms, mvts, conf } = noeud;
    const rng = mulberry32(c.graine);
    const debit = c.debit || arms.map((a) => (a.sens === 'out' ? 0 : a.cls === 'majeure' ? 0.22 : 0.08));
    const sim = { t: 0, agents: [], nextId: 1, c, noeud,
      stats: { cree: 0, sortis: 0, parMvt: mvts.map(() => 0), entrees: [], reroutes: 0, bloques: 0, gardeLigne: 0,
        collisions: new Set(), attente: arms.map(() => ({ somme: 0, n: 0, max: 0 })), fileMax: arms.map(() => 0), freinsUrgence: 0, plRefuses: 0, presContacts: new Set(), dureesMv: mvts.map(() => []), durees: arms.map(() => []), chevauchFile: new Set() } };
    const route = (a) => mvts[a.mv].app + mvts[a.mv].L + mvts[a.mv].out;

    function choisirMvt(arm, t, pl) {
      const mat = matriceA(noeud, c.regs, t);
      if (pl && accesInterdit(c.regs, t, arm, pl)) return -1;
      const cand = mvts.filter((m) => m.de === arm && mat[m.idx] && !(pl && accesInterdit(c.regs, t, m.vers, pl)));
      if (!cand.length) return -1;
      const poids = cand.map((m) => (m.type === 'droit' ? 0.6 : 0.2));
      let r = rng() * poids.reduce((x, y) => x + y, 0);
      for (let i = 0; i < cand.length; i++) { r -= poids[i]; if (r <= 0) return cand[i].idx; }
      return cand[cand.length - 1].idx;
    }

    sim.position = (a) => { const m = mvts[a.mv]; return pointA(m.rte.pts, m.rte.cum, a.s); };

    // faut-il ceder a b ? (rang, puis ordre d'arrivee)
    function doitCeder(a, b) {
      const cfx = conf[a.mv][b.mv];
      if (cfx && cfx.cede !== undefined) return cfx.cede;
      const ra = mvts[a.mv].rang, rb = mvts[b.mv].rang;
      if (rb > ra) return true;
      if (rb < ra) return false;
      return b.tArr < a.tArr || (b.tArr === a.tArr && b.id < a.id);
    }

    // vehicule juste devant sur la meme branche, encore en approche (null si a est en tete)
    function devantApproche(a) {
      const de = mvts[a.mv].de;
      let best = null;
      for (const b of sim.agents) {
        if (b === a || mvts[b.mv].de !== de || b.s <= a.s || b.s >= mvts[b.mv].app) continue;
        if (!best || b.s < best.s) best = b;
      }
      return best;
    }

    function peutEntrer(a) {
      const ma = mvts[a.mv];
      const vn = ma.vnode;
      const tDep = a.v < 1 ? 1.5 : 0;
      for (const b of sim.agents) {
        if (b === a) continue;
        const cf = conf[a.mv][b.mv];
        if (!cf) continue;
        const mb = mvts[b.mv];
        const dsB = mb.app + cf.zAutre[0] - b.s;
        const deB = mb.app + cf.zAutre[1] + c.len - b.s;
        if (deB <= 0) continue; // b a deja degage la zone
        const enNoeud = b.s >= mb.app - 0.1;
        const engage = b.granted || enNoeud;
        if (!engage) {
          if (cf.cede !== undefined) continue; // anneau : seul celui qui est deja engage est prioritaire, pas celui qui attend aussi
          if (!doitCeder(a, b)) continue; // b cede a a : il attendra
          const dev = devantApproche(b);
          if (dev && !dev.granted) continue; // b est coince derriere un vehicule qui n'a pas la main
          if (b.s < mb.app - c.decision - 25) continue; // hors horizon
        }
        const vb = enNoeud ? Math.max(b.v, 2) : engage ? Math.max(b.v, c.vEng) : Math.max(b.v, 8);
        const bIn = Math.max(dsB, 0) / vb, bOut = Math.max(deB, 0) / vb;
        const dsA = ma.app + cf.z[0] - a.s, deA = ma.app + cf.z[1] + c.len - a.s;
        const aIn = tDep + tAtteint(dsA, a.v, vn, c.amax), aOut = tDep + tAtteint(deA, a.v, vn, c.amax);
        if (aIn < bOut + c.marge && bIn < aOut + c.marge) return false;
      }
      return true;
    }

    function ecart(a) { // distance libre jusqu'au vehicule de devant (ou Infinity), vitesse du meneur
      let best = Infinity, vL = 0;
      const ma = mvts[a.mv];
      if (a.s >= ma.app - 1 && a._p) { // dans le noeud ou la sortie : meneur geometrique (meme cap, meme couloir)
        const hr = a._p[2] * Math.PI / 180, fx = Math.sin(hr), fy = Math.cos(hr);
        for (const b of sim.agents) {
          if (b === a || !b._p || b.s < mvts[b.mv].app - 1) continue;
          const dx = b._p[0] - a._p[0], dy = b._p[1] - a._p[1];
          const along = dx * fx + dy * fy, lat = Math.abs(dx * fy - dy * fx);
          if (along > 0 && along < 40 && lat < 2.2 && Math.abs(norm180(b._p[2] - a._p[2])) < 40) {
            const gap = along - c.len;
            if (gap < best) { best = gap; vL = b.v; }
          }
        }
      }
      for (const b of sim.agents) {
        if (b === a) continue;
        let gap = null;
        if (b.mv === a.mv && b.s > a.s) gap = b.s - a.s - c.len;
        else if (b.mv !== a.mv && ma.de === mvts[b.mv].de && a.s < ma.app && b.s > a.s && b.s < mvts[b.mv].app + 10) gap = b.s - a.s - c.len;
        else if (b.mv !== a.mv && ma.vers === mvts[b.mv].vers && a.s > ma.app + ma.L && b.s > mvts[b.mv].app + mvts[b.mv].L) {
          const ea = a.s - ma.app - ma.L, eb = b.s - mvts[b.mv].app - mvts[b.mv].L;
          if (eb > ea) gap = eb - ea - c.len;
        }
        if (gap !== null && gap < best) { best = gap; vL = b.v; }
      }
      return { gap: best, vL };
    }

    sim.pas = function () {
      const dt = c.dt, t = sim.t;
      const stats = sim.stats;
      // apparitions
      arms.forEach((arm, i) => {
        if (debit[i] <= 0) return;
        if (rng() < debit[i] * dt) {
          const pl = rng() < c.partPL;
          const mv = choisirMvt(i, t, pl);
          if (mv < 0) { if (pl) stats.plRefuses++; else stats.bloques++; return; }
          const proche = sim.agents.some((b) => mvts[b.mv].de === i && b.s < 30);
          if (proche) return;
          sim.agents.push({ id: sim.nextId++, mv, s: 0, v: vitesseMax(noeud, c.regs, t, i) * 0.9, granted: !c.regles, arretee: false, pl, t0: t,
            tArr: Infinity, attente: 0, tEntree: null });
          stats.cree++;
        }
      });
      // regles : nouvelle matrice (reroutage de ceux qui n'ont pas encore engage)
      const mat = matriceA(noeud, c.regs, t);
      for (const a of sim.agents) {
        if (a.s < mvts[a.mv].app - 0.1 && !a.granted && !mat[a.mv]) {
          const alt = choisirMvt(mvts[a.mv].de, t, a.pl);
          if (alt >= 0) { a.mv = alt; stats.reroutes++; } else stats.bloques++;
        }
      }
      for (const a of sim.agents) a._p = sim.position(a);
      // commandes
      for (const a of sim.agents) {
        const m = mvts[a.mv];
        const dStop = m.app - a.s;
        const ctrl = arms[m.de];
        const vlim = vitesseMax(noeud, c.regs, t, m.de);
        let vt = a.s > m.app + m.L ? vitesseMax(noeud, c.regs, t, m.vers) : vlim;
        const e = ecart(a);
        if (e.gap < Infinity) vt = Math.min(vt, Math.sqrt(Math.max(0, 2 * c.bconf * (e.gap - 2)) + e.vL * e.vL));
        if (dStop > 0) {
          if (a.tArr === Infinity && dStop < c.decision) a.tArr = t;
          if (!a.granted && dStop < c.decision) {
            if (ctrl.cls === 'mineure' && !a.arretee && dStop < 4 && a.v < 0.3) a.arretee = true;
            const pret = ctrl.cls !== 'mineure' || a.arretee || ctrl.controle === 'cedez';
            const dev = devantApproche(a);
            if (pret && c.regles && !(dev && !dev.granted) && peutEntrer(a)) a.granted = true;
          }
          if (a.granted) vt = Math.min(vt, Math.sqrt(m.vnode * m.vnode + 2 * c.bconf * Math.max(dStop, 0)));
          else vt = Math.min(vt, Math.sqrt(2 * c.bconf * Math.max(dStop - 1, 0)));
        } else if (a.s <= m.app + m.L) vt = Math.min(vt, m.vnode);
        a.v = clamp(a.v + clamp(vt - a.v, -c.bmax * dt, c.amax * dt), 0, 40);
        const sAvant = a.s;
        a.s += a.v * dt;
        if (sAvant < m.app && a.s >= m.app) a.tEntree = t;
        if (!a.granted && c.regles && a.s > m.app - 0.5) { a.s = m.app - 0.5; a.v = 0; stats.gardeLigne++; }
        if (a.v < 0.5 && dStop > 0) { a.attente += dt; }
      }
      // mesures de securite (centres), avant retrait
      const proches = sim.agents.filter((a) => a.s > mvts[a.mv].app - 8 && a.s < mvts[a.mv].app + mvts[a.mv].L + 8);
      for (let i = 0; i < proches.length; i++) for (let j = i + 1; j < proches.length; j++) {
        const a = proches[i], b = proches[j];
        if (a.mv === b.mv) continue;
        const pa = sim.position(a), pb = sim.position(b);
        const dd = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
        const cle = Math.min(a.id, b.id) + '-' + Math.max(a.id, b.id);
        if (conf[a.mv][b.mv]) { if (dd < (o.seuilContact || 2.0)) stats.collisions.add(cle); if (dd < o.seuil) stats.presContacts.add(cle); }
        else if (mvts[a.mv].de === mvts[b.mv].de && a.s < mvts[a.mv].app && b.s < mvts[b.mv].app && dd < 3) stats.chevauchFile.add(cle);
      }
      // files d'attente
      arms.forEach((arm, i) => {
        const n = sim.agents.filter((a) => mvts[a.mv].de === i && a.s < mvts[a.mv].app && a.v < 0.5).length;
        if (n > stats.fileMax[i]) stats.fileMax[i] = n;
      });
      // retrait
      const reste = [];
      for (const a of sim.agents) {
        if (a.s >= route(a)) {
          const m = mvts[a.mv];
          stats.sortis++; stats.parMvt[a.mv]++; stats.durees[m.de].push(t - a.t0); stats.dureesMv[a.mv].push(t - a.t0);
          const w = stats.attente[m.de]; w.somme += a.attente; w.n++; if (a.attente > w.max) w.max = a.attente;
          if (a.tEntree !== null) stats.entrees.push({ t: a.tEntree, mv: a.mv, de: m.de, vers: m.vers });
        } else reste.push(a);
      }
      sim.agents = reste;
      sim.t += dt;
    };
    return sim;
  }

  const api = { construire, conflits, assembler, accesInterdit, creerSim, matriceA, vitesseMax, pointA, cumul, norm180, vec, mulberry32 };
  if (typeof module !== 'undefined') module.exports = api; else root.Carrefour = api;
})(typeof window !== 'undefined' ? window : globalThis);

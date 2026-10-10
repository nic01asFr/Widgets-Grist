// reseau.js - construit un noeud simulable (branches, voies, mouvements, trajectoires, conflits) depuis des troncons BD TOPO.
// Entrees : GeoJSON WGS84 de BDTOPO_V3:troncon_de_route (+ optionnel non_communication). Aucune geometrie n'est inventee :
// la voie suivie par un vehicule est la ligne du troncon decalee de sa demi-chaussee ; la trajectoire interne joint
// la voie d'entree a la voie de sortie avec les tangentes reelles de ces deux voies.
(function (root) {
  'use strict';
  const C = typeof require !== 'undefined' ? require('./carrefour.js') : root.Carrefour;
  const D2R = Math.PI / 180, M = 111320;
  const norm180 = C.norm180;
  const cle = (p) => p[0].toFixed(7) + ':' + p[1].toFixed(7);
  const NATURES_EXCLUES = new Set(['Sentier', 'Escalier', 'Piste cyclable']);

  const lignes = (f) => {
    const g = f.geometry;
    if (!g) return [];
    return g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
  };
  const routier = (f) => {
    const p = f.properties || {};
    return !NATURES_EXCLUES.has(p.nature) && p.acces_vehicule_leger !== 'Physiquement impossible' && p.etat_de_l_objet !== 'Projet';
  };

  // noeuds = extremites partagees par au moins `min` troncons routiers
  function noeuds(features, min) {
    const m = new Map();
    for (const f of features.filter(routier)) {
      for (const ln of lignes(f)) {
        if (ln.length < 2) continue;
        for (const [pt, ext] of [[ln[0], 'debut'], [ln[ln.length - 1], 'fin']]) {
          const k = cle(pt);
          if (!m.has(k)) m.set(k, { pt: [pt[0], pt[1]], troncons: [] });
          m.get(k).troncons.push({ f, ext });
        }
      }
    }
    return [...m.values()].filter((n) => new Set(n.troncons.map((t) => t.f.properties.cleabs)).size >= (min || 3));
  }

  // ---- geometrie de voie ----
  function decaler(pts, off) { // off > 0 : a droite du sens de la polyligne
    if (!off) return pts.map((p) => [p[0], p[1]]);
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const seg = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l]; };
      let n;
      if (i === 0) n = seg(pts[0], pts[1]);
      else if (i === pts.length - 1) n = seg(pts[i - 1], pts[i]);
      else {
        const a = seg(pts[i - 1], pts[i]), b = seg(pts[i], pts[i + 1]);
        let sx = a[0] + b[0], sy = a[1] + b[1]; const l = Math.hypot(sx, sy) || 1; sx /= l; sy /= l;
        const cos = Math.max(0.5, sx * a[0] + sy * a[1]); // limite l'allongement aux angles vifs
        n = [sx / cos, sy / cos];
      }
      out.push([pts[i][0] + n[0] * off, pts[i][1] + n[1] * off]);
    }
    return out;
  }
  // extrait la partie de la polyligne entre les distances d0 et d1 depuis son debut, re-echantillonnee tous les `pas` m
  function extraire(pts, d0, d1, pas) {
    const cum = C.cumul(pts), L = cum[cum.length - 1];
    d1 = Math.min(d1, L);
    const out = [];
    if (d1 - d0 < 1) return out;
    for (let d = d0; d < d1; d += pas) out.push(C.pointA(pts, cum, d).slice(0, 2));
    out.push(C.pointA(pts, cum, d1).slice(0, 2));
    return out;
  }
  const cap = (a, b) => (Math.atan2(b[0] - a[0], b[1] - a[1]) / D2R + 360) % 360;

  // ---- construction ----
  // opts : { APP: 80, OUT: 60, non_communication: [{ entree, sortie }] (cleabs de troncons) }
  function construire(features, centre, opts) {
    const o = Object.assign({ APP: 80, OUT: 60, seuil: 2.5, pas: 2 }, opts || {});
    const k = Math.cos(centre[1] * D2R);
    const proj = (p) => [(p[0] - centre[0]) * M * k, (p[1] - centre[1]) * M];
    const inv = (x, y) => [centre[0] + x / (M * k), centre[1] + y / M];
    const ns = noeuds(features, 2);
    const noeud = ns.sort((a, b) => Math.hypot(a.pt[0] - centre[0], a.pt[1] - centre[1]) - Math.hypot(b.pt[0] - centre[0], b.pt[1] - centre[1]))[0];
    if (!noeud) return null;
    const dejaVu = new Set();
    const arms = [];
    for (const t of noeud.troncons) {
      const p = t.f.properties;
      if (dejaVu.has(p.cleabs + t.ext)) continue; dejaVu.add(p.cleabs + t.ext);
      let ln = lignes(t.f)[0].map(proj);
      if (t.ext === 'fin') ln = ln.slice().reverse(); // on veut toujours : du noeud vers l'exterieur
      const sensBd = p.sens_de_circulation;
      let sens = 'both';
      if (sensBd === 'Sens direct') sens = t.ext === 'debut' ? 'out' : 'in';
      else if (sensBd === 'Sens inverse') sens = t.ext === 'debut' ? 'in' : 'out';
      const nv = Math.max(1, Number(p.nombre_de_voies) || 1);
      const lw = Math.min(3.5, Math.max(2.75, (Number(p.largeur_de_chaussee) || 0) / nv || 3));
      const demi = Math.max(Number(p.largeur_de_chaussee) || 0, nv * lw) / 2;
      const off = sens === 'both' ? Math.max(nv, 2) * lw / 4 : 0; // axe equivalent de la demi-chaussee
      const importance = Number(p.importance) || 6;
      arms.push({ i: arms.length, cleabs: p.cleabs, nom: p.nom_collaboratif_gauche || p.nom_voie_ban_gauche || p.cleabs.slice(-6), sens, nv, lw, demi, off,
        importance, vmax: (Number(p.vitesse_moyenne_vl) > 0 ? Number(p.vitesse_moyenne_vl) / 3.6 : 13.9), axe: ln, nature: p.nature });
    }
    const imin = Math.min(...arms.map((a) => a.importance));
    for (const a of arms) a.cls = a.importance === imin ? 'majeure' : 'mineure';
    // cap de chaque branche (sur les 10 premiers metres de l'axe), puis retrait de la ligne d'arret :
    // assez loin pour que les voies des branches voisines soient separees (branches en Y : angle faible -> retrait plus grand)
    for (const a of arms) {
      const q = extraire(a.axe, 0, 10, 2);
      a.bearing = q.length > 1 ? cap(q[0], q[q.length - 1]) : 0;
      a.u = C.vec(a.bearing);
    }
    for (const a of arms) {
      let R = 4;
      for (const b of arms) {
        if (b === a) continue;
        const th = Math.abs(norm180(a.bearing - b.bearing)) * D2R;
        const dem = a.demi + b.demi + 1;
        R = Math.max(R, th < 1e-3 ? 25 : dem / (2 * Math.sin(Math.min(th, Math.PI - 0.01) / 2) * (th > Math.PI / 2 ? 1 : 1)));
      }
      a.R = Math.min(30, Math.max(4, R));
    }
    // voies : sortante (dans le sens de l'axe, a droite) et entrante (a gauche de l'axe)
    for (const a of arms) {
      const d0 = a.R, d1 = a.R + o.APP > 0 ? a.R + Math.max(o.APP, o.OUT) : a.R;
      const droite = decaler(a.axe, a.off), gauche = decaler(a.axe, -a.off);
      a.longueur = C.cumul(a.axe)[a.axe.length - 1];
      a.voieEntrante = extraire(gauche, d0, a.R + o.APP, o.pas).reverse(); // du lointain vers la ligne d'arret
      a.voieSortante = extraire(droite, d0, a.R + o.OUT, o.pas);
    }
    const nc = (opts && opts.non_communication) || [];
    const mvts = [];
    for (const ai of arms) {
      if (ai.sens === 'out' || ai.voieEntrante.length < 2) continue;
      for (const aj of arms) {
        if (aj === ai || aj.sens === 'in' || aj.voieSortante.length < 2) continue;
        const E = ai.voieEntrante[ai.voieEntrante.length - 1], Em = ai.voieEntrante[ai.voieEntrante.length - 2];
        const X = aj.voieSortante[0], Xn = aj.voieSortante[1];
        const hIn = cap(Em, E), hOut = cap(X, Xn);
        const delta = norm180(hOut - hIn), ab = Math.abs(delta);
        const type = ab < 30 ? 'droit' : ab < 150 ? (delta > 0 ? 'droite' : 'gauche') : 'demi-tour';
        const din = C.vec(hIn), dout = C.vec(hOut);
        const kk = Math.hypot(X[0] - E[0], X[1] - E[1]) * 0.4;
        const n = 40, brut = [];
        for (let s = 0; s <= n; s++) {
          const t = s / n, q = 1 - t;
          const P1 = [E[0] + din[0] * kk, E[1] + din[1] * kk], P2 = [X[0] - dout[0] * kk, X[1] - dout[1] * kk];
          brut.push([q * q * q * E[0] + 3 * q * q * t * P1[0] + 3 * q * t * t * P2[0] + t * t * t * X[0],
            q * q * q * E[1] + 3 * q * q * t * P1[1] + 3 * q * t * t * P2[1] + t * t * t * X[1]]);
        }
        const cb = C.cumul(brut), L = cb[cb.length - 1], pts = [];
        for (let s = 0; s <= L + 1e-6; s += 0.5) pts.push(C.pointA(brut, cb, s));
        const cum = C.cumul(pts);
        const interdit = nc.some((r) => r.entree === ai.cleabs && r.sortie === aj.cleabs);
        let rang = ai.cls === 'majeure' ? 2 : 1;
        if (type === 'gauche' && ai.cls === 'majeure') rang = 1.5;
        mvts.push(C.assembler({ idx: mvts.length, de: ai.i, vers: aj.i, type, base: type !== 'demi-tour' && !interdit, interdit, pts, cum, L, rang,
          vnode: type === 'droit' ? Math.min(11, ai.vmax) : Math.min(6, ai.vmax) }, ai.voieEntrante, aj.voieSortante));
      }
    }
    return { o, arms, mvts, conf: C.conflits(mvts, o.seuil), centre, inv, proj, source: 'BDTOPO_V3:troncon_de_route' };
  }

  // arrete exprime avec des cleabs -> indices de branches
  function resoudre(noeud, regs) {
    const idx = (c) => noeud.arms.findIndex((a) => a.cleabs === c);
    return regs.map((r) => Object.assign({}, r, { de: r.de !== undefined ? idx(r.de) : undefined, vers: r.vers !== undefined ? idx(r.vers) : undefined, branche: r.branche !== undefined ? idx(r.branche) : undefined }));
  }

  async function charger(bbox, fetchFn) { // bbox = [lonMin, latMin, lonMax, latMax]
    const f = fetchFn || fetch;
    const u = (type) => 'https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=BDTOPO_V3:' + type +
      '&OUTPUTFORMAT=application/json&COUNT=2000&SRSNAME=EPSG:4326&BBOX=' + bbox.join(',') + ',EPSG:4326';
    const [tr, nc] = await Promise.all([f(u('troncon_de_route')).then((r) => r.json()), f(u('non_communication')).then((r) => r.json())]);
    return { troncons: tr.features, nonCommunication: nc.features.map((x) => ({ entree: x.properties.lien_vers_troncon_entree, sortie: String(x.properties.liens_vers_troncon_sortie || '').split(',')[0], pt: x.geometry.coordinates })) };
  }

  const api = { noeuds, construire, resoudre, charger, routier, aides: { lignes, cle, extraire, decaler, cap } };
  if (typeof module !== 'undefined') module.exports = api; else root.Reseau = api;
})(typeof window !== 'undefined' ? window : globalThis);

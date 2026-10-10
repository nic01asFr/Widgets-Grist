/**
 * Tracer une ligne SUR LE RÉSEAU : la caler sur les tronçons d'un graphe (`graphe-routier.js`), ou trouver le plus
 * court chemin entre deux points.
 *
 * Une ligne dessinée ou publiée (un itinéraire approximatif, une trace GPS, la géométrie d'un objet linéaire) ne dit
 * pas quels tronçons elle emprunte. Les relier par un tampon de quelques mètres retient les tronçons de carrefour
 * voisins et perd les portions de long tronçon ; ce module répond autrement : il cherche le chemin du réseau qui suit
 * le mieux la ligne.
 *
 *   caler(G, ligne, opts)             calage (« map-matching ») : modèle de Markov caché, algorithme de Viterbi.
 *                                     Candidats à moins de `rayon` m ; coût = écart de position + écart de cap +
 *                                     continuité (distance par la route comparée à la distance sur la ligne).
 *   plusCourtChemin(G, A, B, opts)    Dijkstra entre deux positions, borné aux tronçons du numéro ou du nom connu ;
 *                                     `orientee: true` honore les sens uniques.
 *   calerPuisLisser(G, ligne, opts)   extrémités du calage, puis Dijkstra pondéré par l'écart à la ligne.
 *   tracer(G, geometrie, methode)     applique une méthode à une géométrie GeoJSON (plusieurs lignes : une par une)
 *                                     et rend les tronçons parcourus avec leurs abscisses.
 *
 * Un « troncon » du résultat = `{ cleabs, s0, s1, L, parcouru, part }` : portion parcourue d'un tronçon, en mètres
 * depuis le début de sa numérisation. C'est ce qu'il faut pour exprimer un tracé comme une suite de repères
 * linéaires (tronçon + abscisse de début et de fin), et non comme une liste de tronçons entiers.
 *
 * ## Mesuré (09/10/2026) et non mesuré
 *
 * Mesuré, sur des tronçons réels de la BD TOPO et des lignes dégradées de façon contrôlée (`tools/mesurer-calage.mjs`,
 * chiffres dans `docs/DONNEES-IGN.md`) : F1 en longueur de 0,99 après un bruit de 6 m ou un décalage latéral de 12 m,
 * mais 0,83 pour une ligne décimée à 6 sommets sur des routes sinueuses (elle sort du rayon de 30 m). Le portage
 * depuis le prototype est identique sur 270 tracés réels. Le prototype avait été mesuré sur 50 lignes publiées par un
 * tiers (non versées ici) : 50 tracées contre 44 pour un tampon de 8 m, tronçons de moins de 15 m 11 % au lieu de
 * 19 %, écart de Hausdorff médian à la ligne 5,0 m au lieu de 11,7 m.
 *
 * **Non mesuré : l'exactitude.** Il n'existe pas de vérité terrain. Ces mesures disent la fidélité du tracé à la
 * ligne donnée et la forme du résultat, pas qu'il emprunte les bons tronçons. Rien n'est calibré : le calage rend
 * toujours un chemin plausible, y compris faux (voir les limites ci-dessous), et ne produit pas de confiance.
 *
 * ## Limites connues (testées)
 *
 * - Si la route manque dans le graphe et qu'une chaussée voisine à moins de `rayon` (30 m) la double, le calage
 *   bascule sur la voisine sans rupture ni avertissement. Seul l'écart médian (`mesures-trace.js`) ou l'accord avec
 *   un numéro ou un nom connu (`ref`) peut le trahir.
 * - Une ligne à plus de `rayon` de tout tronçon n'est pas tracée : l'échec est déclaré, rien n'est inventé.
 * - Les sens uniques ne sont honorés que sur demande (`orientee: true`) : la ligne doit alors être ORDONNÉE dans le sens
 *   de la marche (un tracé dessiné ou une trace dans le mauvais ordre serait faussé). Un état calé à contre-sens d'un
 *   sens unique coûte `penaliteContreSens` (40, soit bien plus que 30 m d'écart) ; `Infinity` l'interdit. Le nombre
 *   d'observations calées à contre-sens est rendu (`contreSens`) : s'il n'est pas nul, soit le réseau ne permet pas le
 *   trajet dans ce sens, soit la ligne est à l'envers. Sans l'option, comportement inchangé (graphe non orienté).
 *   Les interdictions de mouvement ne sont pas prises en compte.
 * - Le plus court chemin est un plus court chemin : il ne sait pas qu'on préférerait un autre.
 * - Le repère local est équirectangulaire : prévu pour des couloirs de quelques dizaines de kilomètres.
 */

import { cumul, pointA, projLigne, cap as capDe, ecartCap, echantillonner, distPtLignes, lignesDe, dist } from './geo.js';
import { normaliserNom, sensAutorises } from './graphe-routier.js';
import { annoter } from './confiance.js';

export const DEFAUTS = Object.freeze({
  rayon: 30, // m : distance maximale d'un candidat à la ligne
  pas: 10, // m : pas d'échantillonnage de la ligne
  maxCandidats: 8, // par observation
  sigmaD: 8, // m : écart-type de position (coût d'émission)
  sigmaCap: 40, // deg : écart-type de cap (angle entre la ligne et le sens de parcours du tronçon)
  beta: 10, // m : tolérance sur |distance par la route - distance sur la ligne|
  penaliteNom: 3, // coût ajouté à un tronçon qui contredit le nom ou le numéro connu
  penaliteDemiTour: 12,
  penaliteContreSens: 40, // coût ajouté à une observation calée à contre-sens d'un sens unique (option `orientee`) ; Infinity = interdit
  elagage: 10, // m : un tronçon d'extrémité parcouru sur moins que cela est écarté (faux positif de carrefour)
});

// ---------------------------------------------------------------------------------------------- plus courts chemins

/** Tas binaire minimal pour Dijkstra : éléments `[priorité, valeur]`. */
class Tas {
  constructor() { this.t = []; }
  get taille() { return this.t.length; }
  pousser(x) {
    const t = this.t;
    t.push(x);
    let i = t.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (t[p][0] <= t[i][0]) break;
      [t[p], t[i]] = [t[i], t[p]];
      i = p;
    }
  }
  tirer() {
    const t = this.t;
    const haut = t[0];
    const dernier = t.pop();
    if (t.length) {
      t[0] = dernier;
      let i = 0;
      for (;;) {
        const g = 2 * i + 1;
        const d = g + 1;
        let m = i;
        if (g < t.length && t[g][0] < t[m][0]) m = g;
        if (d < t.length && t[d][0] < t[m][0]) m = d;
        if (m === i) break;
        [t[m], t[i]] = [t[i], t[m]];
        i = m;
      }
    }
    return haut;
  }
}

/** Coût par défaut : la longueur, dans les deux sens. */
const coutLongueur = (e) => e.L;

/** Coût qui interdit de remonter un sens unique. */
const coutOriente = (e, sens) => {
  const s = sensAutorises(e);
  return (sens > 0 ? s.direct : s.inverse) ? e.L : Infinity;
};

/**
 * Dijkstra depuis un nœud, jusqu'à `limite` mètres de coût si elle est donnée. Le résultat est mis en cache dans le
 * graphe, sous `cleCout` et le nœud de départ ; un résultat borné ne sert qu'aux demandes qui ne vont pas plus loin.
 * `cout(arete, sens)` : sens +1 en allant de `a` vers `b`, -1 dans l'autre sens ; `Infinity` interdit le passage.
 */
function ligneDist(Gr, src, cout, cleCout, limite = Infinity) {
  const ck = `${cleCout}#${src}`;
  const connu = Gr.cache.get(ck);
  if (connu && connu.limite >= limite) return connu;
  const n = Gr.noeuds.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prevE = new Int32Array(n).fill(-1);
  const prevN = new Int32Array(n).fill(-1);
  const fait = new Uint8Array(n);
  dist[src] = 0;
  const tas = new Tas();
  tas.pousser([0, src]);
  while (tas.taille) {
    const [d, u] = tas.tirer();
    if (fait[u]) continue;
    fait[u] = 1;
    for (const ei of Gr.noeuds[u].inc) {
      const e = Gr.aretes[ei];
      const sens = e.a === u ? 1 : -1;
      const w = cout(e, sens);
      if (!(w < Infinity)) continue;
      const v = e.a === u ? e.b : e.a;
      const nd = d + w;
      if (nd > limite) continue;
      if (nd < dist[v]) { dist[v] = nd; prevE[v] = ei; prevN[v] = u; tas.pousser([nd, v]); }
    }
  }
  const ligne = { dist, prevE, prevN, limite };
  Gr.cache.set(ck, ligne);
  return ligne;
}

/** Les identifiants d'arêtes du chemin de la source au nœud `dst`. */
function cheminNoeuds(ligne, dst) {
  const out = [];
  let v = dst;
  while (ligne.prevE[v] >= 0) { out.push(ligne.prevE[v]); v = ligne.prevN[v]; }
  return out.reverse();
}

// ---------------------------------------------------------------------------------------------- préférence de route

/**
 * Concordance d'une arête avec ce qu'on sait de la route : `{ nom?, numero? }` -> fonction `arete` -> `'ok'` |
 * `'ko'` | `'inconnu'`. Le numéro prime sur le nom ; un tronçon sans nom n'est ni confirmé ni contredit par un nom.
 */
export function concordance(ref) {
  const nom = ref && ref.nom ? normaliserNom(ref.nom) : null;
  const num = ref && ref.numero ? String(ref.numero).replace(/\s/g, '') : null;
  return (e) => {
    if (num) return e.nums.has(num) ? 'ok' : 'ko';
    if (nom) {
      if (!e.noms.size) return 'inconnu';
      for (const t of e.noms) if (t.includes(nom) || nom.includes(t)) return 'ok';
      return 'ko';
    }
    return 'inconnu';
  };
}

// ---------------------------------------------------------------------------------------------- candidats

/** Les arêtes à moins de `rayon` d'un point (en mètres), les plus proches d'abord. */
export function candidats(Gr, p, o) {
  const out = [];
  for (const e of Gr.aretes) {
    if (p[0] < e.bb[0] - o.rayon || p[0] > e.bb[2] + o.rayon || p[1] < e.bb[1] - o.rayon || p[1] > e.bb[3] + o.rayon) continue;
    const r = projLigne(p, e.pts, e.cum);
    if (r.d <= o.rayon) out.push({ e: e.id, s: r.s, d: r.d, cap: r.cap });
  }
  return out.sort((x, y) => x.d - y.d).slice(0, o.maxCandidats);
}

// ---------------------------------------------------------------------------------------------- (a) calage HMM

function observations(ln, pas) {
  const cum = cumul(ln);
  const L = cum[cum.length - 1];
  const n = Math.max(1, Math.round(L / pas));
  const obs = [];
  for (let k = 0; k <= n; k++) {
    const s = (L * k) / n;
    const p = pointA(ln, cum, s);
    const a = pointA(ln, cum, Math.max(0, s - pas * 1.2));
    const b = pointA(ln, cum, Math.min(L, s + pas * 1.2));
    obs.push({ s, p, cap: a[0] === b[0] && a[1] === b[1] ? null : capDe(a, b) });
  }
  return { obs, L };
}
const capSens = (c, dir) => (dir > 0 ? c : (c + 180) % 360);

const lse = (xs) => {
  let m = -Infinity;
  for (const x of xs) if (x > m) m = x;
  if (m === -Infinity) return -Infinity;
  let s = 0;
  for (const x of xs) s += Math.exp(x - m);
  return m + Math.log(s);
};

/**
 * Probabilités a posteriori de chaque état (algorithme avant-arrière, mêmes coûts que Viterbi lus comme des
 * log-vraisemblances négatives). Pose `post` sur chaque état : la probabilité que l'observation soit sur cette arête,
 * dans ce sens, sachant TOUTE la ligne. C'est une probabilité DU MODÈLE, pas une probabilité d'être exact : voir
 * `confiance.js` pour la calibration.
 */
function posterieurs(couches, trans, debutChaine) {
  const T = couches.length;
  const alpha = new Array(T);
  const beta = new Array(T);
  for (let t = 0; t < T; t++) {
    alpha[t] = couches[t].map((s, j) => {
      if (debutChaine[t]) return -s.cout;
      const xs = [];
      for (let i = 0; i < alpha[t - 1].length; i++) if (trans[t][j][i] < Infinity) xs.push(alpha[t - 1][i] - trans[t][j][i]);
      return -s.cout + lse(xs);
    });
  }
  beta[T - 1] = couches[T - 1].map(() => 0);
  for (let t = T - 2; t >= 0; t--) {
    beta[t] = couches[t].map((_, i) => {
      if (debutChaine[t + 1]) return 0;
      const xs = [];
      for (let j = 0; j < couches[t + 1].length; j++) if (trans[t + 1][j][i] < Infinity) xs.push(-trans[t + 1][j][i] - couches[t + 1][j].cout + beta[t + 1][j]);
      return lse(xs);
    });
  }
  for (let t = 0; t < T; t++) {
    const lp = couches[t].map((_, i) => alpha[t][i] + beta[t][i]);
    const z = lse(lp);
    couches[t].forEach((s, i) => { s.post = z === -Infinity ? 1 / lp.length : Math.exp(lp[i] - z); });
  }
}

/**
 * Cale une ligne (en mètres, dans le repère du graphe) sur le réseau.
 * @returns {{ok: boolean, raison?: string, passages: object[], ruptures: number, nbObs: number, perdus: number,
 *   couvertureObs: number, L: number, premier?: object, dernier?: object, couloir?: Set<number>}}
 *   `passages` : `{ arete, lo, hi, s0, s1 }`, dans l'ordre du parcours ; `ruptures` : nombre de fois où plus aucune
 *   transition n'était possible (réseau coupé) et où le calage a repris plus loin.
 */
export function caler(Gr, lignePts, opts) {
  const o = { ...DEFAUTS, ...(opts || {}) };
  const conc = concordance(o.ref);
  const { obs, L } = observations(lignePts, o.pas);
  const orientee = !!(o.orientee ?? o.oriente);
  const coutRoute = orientee ? coutOriente : coutLongueur;
  const cleRoute = orientee ? 'O' : 'L';
  const couches = [];
  for (const ob of obs) {
    const etats = [];
    for (const c of candidats(Gr, ob.p, o)) {
      for (const dir of [1, -1]) {
        let cout = 0.5 * (c.d / o.sigmaD) ** 2;
        let contre = false;
        if (orientee) {
          const autorise = sensAutorises(Gr.aretes[c.e]);
          contre = !(dir > 0 ? autorise.direct : autorise.inverse);
          if (contre) {
            if (!(o.penaliteContreSens < Infinity)) continue; // interdit : l'état n'existe pas
            cout += o.penaliteContreSens;
          }
        }
        if (ob.cap !== null) cout += 0.5 * (ecartCap(ob.cap, capSens(c.cap, dir)) / o.sigmaCap) ** 2;
        if (conc(Gr.aretes[c.e]) === 'ko') cout += o.penaliteNom;
        etats.push({ e: c.e, s: c.s, d: c.d, dir, cout, ob, contre });
      }
    }
    if (etats.length) couches.push(etats);
  }
  if (!couches.length) return { ok: false, raison: 'aucun_candidat', passages: [], ruptures: 0, contreSens: 0, couvertureObs: 0, nbObs: obs.length, perdus: obs.length, L };
  const perdus = obs.length - couches.length;

  // Distance par la route entre deux états (orientée), bornée : au-delà de `limite`, la transition est de toute façon refusée.
  const routeDist = (x, y, limite) => {
    const e1 = Gr.aretes[x.e];
    const e2 = Gr.aretes[y.e];
    if (x.e === y.e && x.dir === y.dir) {
      const dl = (y.s - x.s) * x.dir;
      return dl >= -3 ? { r: Math.max(0, dl), noeuds: null } : { r: Infinity };
    }
    const sortie = x.dir > 0 ? e1.b : e1.a;
    const reste = x.dir > 0 ? e1.L - x.s : x.s;
    const entree = y.dir > 0 ? e2.a : e2.b;
    const avant = y.dir > 0 ? y.s : e2.L - y.s;
    const ligne = ligneDist(Gr, sortie, coutRoute, cleRoute, Math.max(0, limite - reste - avant));
    const dn = ligne.dist[entree];
    if (!(dn < Infinity)) return { r: Infinity };
    return { r: reste + dn + avant, noeuds: [sortie, entree], demiTour: x.e === y.e && x.dir !== y.dir };
  };
  const borne = (delta) => 3 * delta + 60;

  // Viterbi par chaînes : rupture quand plus aucune transition n'est finie
  const chaines = [];
  let prec = couches[0].map((s) => ({ s, c: s.cout, back: -1 }));
  const histo = [prec];
  let ruptures = 0;
  let dernierObs = couches[0][0].ob;
  // pour les postérieurs (option `confiance`) : coûts de transition de chaque pas et début de chaque chaîne
  const trans = o.confiance ? [null] : null;
  const debutChaine = o.confiance ? [true] : null;
  for (let t = 1; t < couches.length; t++) {
    const ob = couches[t][0].ob;
    const delta = Math.max(0.1, ob.s - dernierObs.s);
    const lignesTrans = trans ? [] : null;
    const cur = couches[t].map((s) => {
      let best = Infinity;
      let bi = -1;
      const ligneTr = trans ? new Float64Array(prec.length).fill(Infinity) : null;
      prec.forEach((q, i) => {
        const rd = routeDist(q.s, s, borne(delta));
        if (!(rd.r < Infinity) || rd.r > borne(delta)) return;
        const tr = Math.abs(rd.r - delta) / o.beta + (rd.demiTour ? o.penaliteDemiTour : 0);
        if (ligneTr) ligneTr[i] = tr;
        const v = q.c + tr;
        if (v < best) { best = v; bi = i; }
      });
      if (lignesTrans) lignesTrans.push(ligneTr);
      return { s, c: best < Infinity ? best + s.cout : Infinity, back: bi };
    });
    if (trans) { trans.push(lignesTrans); debutChaine.push(false); }
    if (cur.every((x) => x.c === Infinity)) {
      if (debutChaine) debutChaine[t] = true;
      ruptures++;
      chaines.push(histo.slice());
      histo.length = 0;
      prec = couches[t].map((s) => ({ s, c: s.cout, back: -1 }));
      histo.push(prec);
    } else {
      histo.push(cur);
      prec = cur;
    }
    dernierObs = ob;
  }
  chaines.push(histo.slice());
  if (trans) posterieurs(couches, trans, debutChaine);

  const suites = chaines.map((h) => {
    let bi = 0;
    let best = Infinity;
    h[h.length - 1].forEach((q, i) => { if (q.c < best) { best = q.c; bi = i; } });
    const seq = [];
    for (let t = h.length - 1; t >= 0; t--) { const q = h[t][bi]; seq.push(q.s); bi = q.back; }
    return seq.reverse();
  });

  // Passages : fusion des états consécutifs, tronçons intermédiaires par plus court chemin
  const passages = [];
  const pousse = (e, s0, s1) => {
    const E = Gr.aretes[e];
    const c0 = Math.max(0, Math.min(E.L, s0));
    const c1 = Math.max(0, Math.min(E.L, s1));
    const lo = Math.min(c0, c1);
    const hi = Math.max(c0, c1);
    const dernier = passages[passages.length - 1];
    if (dernier && dernier.arete === e) {
      dernier.lo = Math.min(dernier.lo, lo);
      dernier.hi = Math.max(dernier.hi, hi);
      dernier.s1 = c1;
    } else passages.push({ arete: e, lo, hi, s0: c0, s1: c1 });
  };
  for (const seq of suites) {
    let prev = null;
    for (const st of seq) {
      if (!prev) { pousse(st.e, st.s, st.s); prev = st; continue; }
      const delta = Math.max(0.1, st.ob.s - prev.ob.s);
      const rd = routeDist(prev, st, borne(delta));
      if (prev.e === st.e && prev.dir === st.dir) pousse(st.e, prev.s, st.s);
      else if (rd.noeuds) {
        const E1 = Gr.aretes[prev.e];
        const E2 = Gr.aretes[st.e];
        pousse(prev.e, prev.s, prev.dir > 0 ? E1.L : 0);
        const ligne = ligneDist(Gr, rd.noeuds[0], coutRoute, cleRoute, borne(delta));
        for (const ei of cheminNoeuds(ligne, rd.noeuds[1])) pousse(ei, 0, Gr.aretes[ei].L);
        pousse(st.e, st.dir > 0 ? 0 : E2.L, st.s);
      } else pousse(st.e, st.s, st.s);
      prev = st;
    }
  }
  const derniereSuite = suites[suites.length - 1];
  const contreSens = suites.reduce((n, seq) => n + seq.filter((st) => st.contre).length, 0);
  return {
    ok: true, passages, ruptures, contreSens, nbObs: obs.length, perdus, couvertureObs: couches.length / obs.length, L,
    premier: suites[0][0], dernier: derniereSuite[derniereSuite.length - 1], couloir: new Set(couches.flat().map((s) => s.e)),
    ...(trans ? { diagnostic: { couches, suites } } : {}),
  };
}

// ---------------------------------------------------------------------------------------------- (b) plus court chemin

/** Les positions du réseau les plus proches d'un point (en mètres), avec une pénalité pour celles qui contredisent le nom ou le numéro. */
function accrocher(Gr, p, o, k) {
  const conc = concordance(o.ref);
  return candidats(Gr, p, { ...o, maxCandidats: 12 })
    .map((c) => ({ ...c, score: c.d + (conc(Gr.aretes[c.e]) === 'ko' ? 15 : 0) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, k || 4);
}

/**
 * Plus court chemin entre deux positions `{e, s}` d'arêtes : Dijkstra avec les décalages initial et final.
 * `cout(arete, sens)`, `cleCout` : clé de cache du coût (doit désigner le coût, pas l'appel).
 */
export function entrePositions(Gr, pa, pb, cout, cleCout) {
  const ea = Gr.aretes[pa.e];
  const eb = Gr.aretes[pb.e];
  let meilleur = null;
  const part = (E, d, sens) => (d === 0 ? 0 : (cout(E, sens) / E.L) * d);
  if (pa.e === pb.e) {
    const sens = pb.s >= pa.s ? 1 : -1;
    if (cout(ea, sens) < Infinity) meilleur = { cout: part(ea, Math.abs(pb.s - pa.s), sens), segs: [{ e: pa.e, s0: pa.s, s1: pb.s }] };
  }
  // on part vers le nœud `a` (sens -1) ou `b` (sens +1) ; on arrive depuis `a` (sens +1) ou `b` (sens -1)
  const departs = [[ea.a, pa.s, 0, -1], [ea.b, ea.L - pa.s, ea.L, 1]];
  const arrivees = [[eb.a, pb.s, 0, 1], [eb.b, eb.L - pb.s, eb.L, -1]];
  for (const [na, da, sa, sensD] of departs) {
    const ligne = ligneDist(Gr, na, cout, cleCout);
    for (const [nb, db, sb, sensA] of arrivees) {
      const dn = ligne.dist[nb];
      if (!(dn < Infinity)) continue;
      const total = part(ea, da, sensD) + dn + part(eb, db, sensA);
      if (!(total < Infinity)) continue;
      if (!meilleur || total < meilleur.cout) {
        const segs = [{ e: pa.e, s0: pa.s, s1: sa }];
        for (const ei of cheminNoeuds(ligne, nb)) segs.push({ e: ei, s0: null, s1: null });
        segs.push({ e: pb.e, s0: sb, s1: pb.s });
        meilleur = { cout: total, segs, ordre: [na, nb] };
      }
    }
  }
  if (!meilleur) return null;
  if (meilleur.ordre) {
    let cur = meilleur.ordre[0];
    for (let i = 1; i < meilleur.segs.length - 1; i++) {
      const E = Gr.aretes[meilleur.segs[i].e];
      const direct = E.a === cur;
      meilleur.segs[i].s0 = direct ? 0 : E.L;
      meilleur.segs[i].s1 = direct ? E.L : 0;
      cur = direct ? E.b : E.a;
    }
  }
  return meilleur;
}

function versPassages(segs) {
  const out = [];
  for (const sg of segs) {
    const lo = Math.min(sg.s0, sg.s1);
    const hi = Math.max(sg.s0, sg.s1);
    const dernier = out[out.length - 1];
    if (dernier && dernier.arete === sg.e) {
      dernier.lo = Math.min(dernier.lo, lo);
      dernier.hi = Math.max(dernier.hi, hi);
      dernier.s1 = sg.s1;
    } else out.push({ arete: sg.e, lo, hi, s0: sg.s0, s1: sg.s1 });
  }
  return out;
}

/**
 * Plus court chemin entre deux points (en mètres, repère du graphe). Les points s'accrochent aux tronçons à moins de
 * `rayon` ; plusieurs accroches sont essayées. Avec `ref` (numéro ou nom), le chemin est d'abord cherché sur les seuls
 * tronçons concordants ; s'il n'en existe aucun, un repli est signalé (`repli: 'hors_nom_numero'`) et les autres
 * tronçons coûtent le quadruple.
 * @param {{orientee?: boolean, oriente?: boolean, ref?: {nom?: string, numero?: string}}} [opts] `orientee` (alias `oriente`) : ne pas remonter un sens unique
 * @returns {{ok: boolean, raison?: string, passages: object[], repli?: string|null, ecartA?: number, ecartB?: number, cout?: number}}
 */
export function plusCourtChemin(Gr, A, B, opts) {
  const o = { ...DEFAUTS, ...(opts || {}) };
  const conc = concordance(o.ref);
  const contraint = !!(o.ref && (o.ref.nom || o.ref.numero));
  const ancA = accrocher(Gr, A, o, 4);
  const ancB = accrocher(Gr, B, o, 4);
  if (!ancA.length || !ancB.length) return { ok: false, raison: 'extremite_hors_reseau', passages: [] };
  const orientee = !!(o.orientee ?? o.oriente);
  const base = orientee ? coutOriente : coutLongueur;
  const essaie = (cout, cleCout) => {
    let best = null;
    for (const a of ancA) {
      for (const b of ancB) {
        const r = entrePositions(Gr, a, b, cout, cleCout);
        if (!r || !(r.cout < Infinity)) continue;
        const t = r.cout + (a.d + b.d);
        if (!best || t < best.t) best = { t, r, a, b };
      }
    }
    return best;
  };
  const cle = `${orientee ? 'o' : 'n'}${JSON.stringify(o.ref || {})}`;
  const strict = (e, sens) => (contraint && conc(e) === 'ko' ? Infinity : base(e, sens));
  const souple = (e, sens) => (contraint && conc(e) === 'ko' ? 4 * base(e, sens) : base(e, sens));
  let repli = null;
  let best = contraint ? essaie(strict, `strict${cle}`) : null;
  if (!best) {
    if (contraint) repli = 'hors_nom_numero';
    best = essaie(souple, `souple${cle}`);
  }
  if (!best) return { ok: false, raison: 'extremites_non_connectees', passages: [] };
  return { ok: true, passages: versPassages(best.r.segs), repli, ecartA: best.a.d, ecartB: best.b.d, cout: best.r.cout };
}

// ---------------------------------------------------------------------------------------------- (c) calage puis lissage

let compteurLissage = 0;

/**
 * Extrémités fournies par le calage (plus robustes qu'un accrochage brut aux carrefours), puis Dijkstra dans le couloir
 * des candidats avec un coût `longueur × (1 + (écart moyen à la ligne / sigma)²)` : les raccourcis hors de la ligne
 * coûtent cher, les éperons aussi.
 */
export function calerPuisLisser(Gr, lignePts, opts) {
  const o = { ...DEFAUTS, ...(opts || {}) };
  const h = caler(Gr, lignePts, o);
  if (!h.ok) return { methode: 'hmm+pcc', ...h };
  const conc = concordance(o.ref);
  const ecarts = new Map();
  for (const ei of h.couloir) {
    const pts = echantillonner(Gr.aretes[ei].pts, 5);
    ecarts.set(ei, pts.reduce((t, p) => t + Math.min(distPtLignes(p, [lignePts]), 4 * o.rayon), 0) / pts.length);
  }
  const orientee = !!(o.orientee ?? o.oriente);
  const cout = (e, sens) => {
    if (!ecarts.has(e.id)) return Infinity;
    if (orientee && !(coutOriente(e, sens) < Infinity)) return Infinity;
    return e.L * (1 + (ecarts.get(e.id) / o.sigmaD) ** 2) * (conc(e) === 'ko' ? 3 : 1);
  };
  const cleCout = `lisse${++compteurLissage}`;
  const r = entrePositions(Gr, { e: h.premier.e, s: h.premier.s }, { e: h.dernier.e, s: h.dernier.s }, cout, cleCout);
  for (const k of [...Gr.cache.keys()]) if (k.startsWith(`${cleCout}#`)) Gr.cache.delete(k);
  if (!r) return { methode: 'hmm+pcc', repli: 'hmm_seul', ...h };
  return { ok: true, methode: 'hmm+pcc', passages: versPassages(r.segs), ruptures: h.ruptures, contreSens: 0, couvertureObs: h.couvertureObs, L: h.L, nbObs: h.nbObs, diagnostic: h.diagnostic };
}

// ---------------------------------------------------------------------------------------------- pipeline

/** Écarte les tronçons d'extrémité parcourus sur moins de `seuil` m (sans jamais vider le tracé). */
export function elaguer(passages, seuil) {
  const p = passages.slice();
  const long = (x) => x.hi - x.lo;
  while (p.length > 1 && long(p[0]) < seuil) p.shift();
  while (p.length > 1 && long(p[p.length - 1]) < seuil) p.pop();
  return p;
}

/** Géométrie (mètres) d'un passage, dans le sens du parcours (`de` peut être supérieur à `vers`). */
export function sousLigne(E, de, vers) {
  const lo = Math.min(de, vers);
  const hi = Math.max(de, vers);
  const pts = [pointA(E.pts, E.cum, lo)];
  for (let i = 0; i < E.pts.length; i++) if (E.cum[i] > lo + 1e-6 && E.cum[i] < hi - 1e-6) pts.push(E.pts[i]);
  pts.push(pointA(E.pts, E.cum, hi));
  return de <= vers ? pts : pts.reverse();
}

/** Regroupe les passages par tronçon : `{ cleabs, arete, L, s0, s1, parcouru, part, repassages }`. */
export function agreger(Gr, passages) {
  const m = new Map();
  for (const p of passages) {
    const E = Gr.aretes[p.arete];
    const x = m.get(E.cleabs);
    if (x) { x.lo = Math.min(x.lo, p.lo); x.hi = Math.max(x.hi, p.hi); x.repassages++; }
    else m.set(E.cleabs, { cleabs: E.cleabs, arete: p.arete, L: E.L, lo: p.lo, hi: p.hi, repassages: 0 });
  }
  return [...m.values()].map((x) => ({
    cleabs: x.cleabs, arete: x.arete, L: x.L, s0: x.lo, s1: x.hi, parcouru: x.hi - x.lo, part: x.L ? (x.hi - x.lo) / x.L : 0, repassages: x.repassages,
  }));
}

/** Nombre de composantes connexes d'un ensemble d'arêtes (celles qui se touchent par un nœud). */
export function composantes(Gr, ids) {
  const liste = [...new Set(ids)];
  const pere = new Map(liste.map((i) => [i, i]));
  const racine = (x) => { while (pere.get(x) !== x) { pere.set(x, pere.get(pere.get(x))); x = pere.get(x); } return x; };
  const parNoeud = new Map();
  for (const i of liste) {
    for (const n of [Gr.aretes[i].a, Gr.aretes[i].b]) {
      if (!parNoeud.has(n)) parNoeud.set(n, []);
      parNoeud.get(n).push(i);
    }
  }
  for (const l of parNoeud.values()) for (let k = 1; k < l.length; k++) pere.set(racine(l[k]), racine(l[0]));
  return new Set(liste.map(racine)).size;
}

export const METHODES = Object.freeze(['hmm', 'pcc-ligne', 'hmm+pcc', 'pcc-ext']);

/**
 * Applique une méthode à une géométrie GeoJSON WGS84 (`MultiLineString` : une ligne après l'autre).
 *
 * @param {object} Gr graphe de `construireGraphe`
 * @param {object} geometrie `LineString` / `MultiLineString` / `GeometryCollection`
 * @param {'hmm'|'pcc-ligne'|'hmm+pcc'|'pcc-ext'} methode
 *   `hmm` : calage ; `pcc-ligne` : plus court chemin entre les extrémités de chaque ligne ; `hmm+pcc` : calage puis
 *   lissage ; `pcc-ext` : plus court chemin entre les deux positions `opts.extremites` (deux repères connus, par
 *   exemple), la géométrie n'étant alors pas lue
 * @param {object} [opts] `DEFAUTS`, plus `ref: {nom?, numero?}`, `extremites: [[lng, lat], [lng, lat]]`, `orientee`
 *   (la ligne est ordonnée dans le sens de la marche : un sens unique ne se remonte pas, ou à `penaliteContreSens`)
 * `opts.confiance` (vrai par défaut pour `hmm` et `hmm+pcc`) : chaque tronçon reçoit `caracteristiques` et, si un modèle est
 * calibré (`confiance-modele.js`), `confiance: { score, classe }` ; `resultat.confiance` résume le tracé.
 * @returns {{methode: string, ok: boolean, echecs: number, raisons: string[], nbLignes: number, ruptures: number,
 *   repli: string|null, troncons: object[], passages: object[], geometrieM: number[][][], geometrie: object|null,
 *   composantes: number, couvertureObs: number}}
 */
export function tracer(Gr, geometrie, methode, opts) {
  if (!METHODES.includes(methode)) throw new Error(`méthode inconnue : ${methode}`);
  const o = { ...DEFAUTS, ...(opts || {}) };
  if (!Gr || !Gr.repere) {
    return { methode, ok: false, echecs: 1, raisons: ['graphe_vide'], nbLignes: 0, ruptures: 0, repli: null, troncons: [], passages: [], geometrieM: [], geometrie: null, composantes: 0, couvertureObs: 0 };
  }
  if (methode === 'pcc-ext' && !(Array.isArray(o.extremites) && o.extremites.length === 2)) {
    throw new Error('pcc-ext demande opts.extremites : [[lng, lat], [lng, lat]]');
  }
  const lignes = lignesDe(geometrie).map((l) => l.map(Gr.repere.vers)).filter((l) => l.length >= 2);
  const raisons = [];
  let passages = [];
  let echecs = 0;
  let ruptures = 0;
  let contreSens = 0;
  let obsTot = 0;
  let obsOk = 0;
  let repli = null;
  const parLigne = [];
  const diagnostics = [];
  o.confiance = o.confiance !== false && (methode === 'hmm' || methode === 'hmm+pcc');
  const unites = methode === 'pcc-ext' ? [null] : lignes;
  for (const ln of unites) {
    let r;
    if (methode === 'hmm') r = caler(Gr, ln, o);
    else if (methode === 'hmm+pcc') r = calerPuisLisser(Gr, ln, o);
    else if (methode === 'pcc-ligne') r = plusCourtChemin(Gr, ln[0], ln[ln.length - 1], o);
    else r = plusCourtChemin(Gr, Gr.repere.vers(o.extremites[0]), Gr.repere.vers(o.extremites[1]), o);
    if (!r.ok) { echecs++; raisons.push(r.raison); parLigne.push({ ok: false, raison: r.raison }); continue; }
    if (r.repli) repli = r.repli;
    ruptures += r.ruptures || 0;
    contreSens += r.contreSens || 0;
    if (r.diagnostic) diagnostics.push(r.diagnostic);
    if (r.nbObs) { obsTot += r.nbObs; obsOk += r.nbObs * (r.couvertureObs || 0); }
    const ps = elaguer(r.passages, Math.max(o.elagage, 0.5)); // une extrémité parcourue sur moins de 0,5 m n'est jamais un tronçon
    parLigne.push({ ok: true, passages: ps });
    passages = passages.concat(ps);
  }
  const troncons = agreger(Gr, passages);
  const geo = parLigne.filter((x) => x.ok).map((x) => {
    const pts = [];
    for (const p of x.passages) {
      for (const q of sousLigne(Gr.aretes[p.arete], p.s0, p.s1)) {
        const l = pts[pts.length - 1];
        if (!l || dist(l, q) > 0.01) pts.push(q);
      }
    }
    return pts;
  });
  const resultat = {
    methode, ok: troncons.length > 0 && echecs < unites.length, echecs, raisons, nbLignes: unites.length, ruptures, contreSens, repli, troncons, passages,
    geometrieM: geo,
    geometrie: geo.length ? { type: 'MultiLineString', coordinates: geo.map((l) => l.map((p) => Gr.repere.depuis(p[0], p[1]))) } : null,
    composantes: composantes(Gr, passages.map((p) => p.arete)),
    couvertureObs: obsTot ? obsOk / obsTot : 0,
    confiance: null,
  };
  if (o.confiance && diagnostics.length) resultat.confiance = annoter(Gr, resultat, diagnostics);
  return resultat;
}

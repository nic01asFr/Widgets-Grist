/**
 * Ombre portée sur les façades éclairées par les luminaires (E7) : ce qui se calcule sans three.js.
 *
 * `facades-eclairees.js` recopie les murs des bâtiments proches d'une source de lumière pour que three.js les éclaire. Une lampe éclaire alors un mur
 * même quand un autre bâtiment est entre elle et lui : la lumière « traverse » les immeubles. Ici, chaque mur est découpé en cellules (pas horizontal,
 * bandes verticales), et une cellule n'est gardée que si UNE source la voit : le segment source -> cellule ne traverse aucun mur de bâtiment à la
 * hauteur du rayon (les toits ne bloquent que les rayons qui passent dessous : un mur plus haut que l'obstacle reste éclairé au-dessus de lui).
 *
 * Choix assumés, à relire avant de s'en servir comme d'une mesure :
 *  - par cellule, pas par pixel : l'arête d'une ombre a la précision de la cellule (2,5 m x 3 m par défaut) ;
 *  - les bâtiments dont la hauteur est inconnue ne projettent aucune ombre (on n'invente pas de hauteur) ;
 *  - seuls les bâtiments FOURNIS font obstacle (les arbres et le mobilier ne sont pas pris en compte) ;
 *  - une cellule dont la normale ne regarde pas la source est écartée : un éclairage de Lambert ne l'aurait pas éclairée non plus.
 */

/** Pas horizontal des cellules, en mètres. */
export const PAS_M = 2.5;
/** Hauteur des bandes verticales, en mètres. */
export const BANDE_M = 3;
/** Le rayon s'arrête avant le point visé (le mur lui-même, ses voisins au coin) : fraction de la longueur. */
const MARGE = 0.004;

/**
 * Les arêtes des bâtiments, rangées en grille pour que la requête ne rende que les voisines d'un segment.
 * @param {{ id?: any, anneaux: {x:number,z:number}[][], base: number, haut: number }[]} batiments  la sortie de `batimentsProches`
 * @param {number} [taille]  côté d'une case de la grille, en mètres
 * @returns {{ aretes: object[], candidates: (x0:number,z0:number,x1:number,z1:number) => object[] }}
 */
export function indexerAretes(batiments, taille = 12) {
  const aretes = []; const cases = new Map(); const parSommet = new Map();
  const cle = (i, j) => `${i},${j}`;
  for (const b of batiments || []) {
    for (const a of b.anneaux || []) {
      const n = a.length; if (n < 2) continue;
      for (let i = 0; i < n; i++) {
        const p = a[i], q = a[(i + 1) % n];
        if (p === q || (p.x === q.x && p.z === q.z)) continue;
        const e = { p, q, base: b.base, haut: b.haut };
        aretes.push(e); parSommet.set(p, e);
        const i0 = Math.floor(Math.min(p.x, q.x) / taille), i1 = Math.floor(Math.max(p.x, q.x) / taille);
        const j0 = Math.floor(Math.min(p.z, q.z) / taille), j1 = Math.floor(Math.max(p.z, q.z) / taille);
        for (let ci = i0; ci <= i1; ci++) for (let cj = j0; cj <= j1; cj++) { const k = cle(ci, cj); let l = cases.get(k); if (!l) cases.set(k, l = []); l.push(e); }
      }
    }
  }
  const candidates = (x0, z0, x1, z1) => {
    const vues = new Set(); const sortie = [];
    const i0 = Math.floor(Math.min(x0, x1) / taille), i1 = Math.floor(Math.max(x0, x1) / taille);
    const j0 = Math.floor(Math.min(z0, z1) / taille), j1 = Math.floor(Math.max(z0, z1) / taille);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const e of cases.get(cle(i, j)) || []) if (!vues.has(e)) { vues.add(e); sortie.push(e); }
    return sortie;
  };
  /** L'arête qui part de `p` et arrive en `q` (les mêmes objets que dans `anneaux`), ou `undefined`. */
  const arete = (p, q) => { const e = parSommet.get(p); return e && e.q === q ? e : undefined; };
  return { aretes, candidates, arete };
}

/**
 * Le rayon de `source` {x, z, y} à `cible` {x, z, y} est-il coupé par un mur ? Seuls comptent les murs que le rayon croise dans le plan ET dont la
 * tranche de hauteur [base, haut] contient la hauteur du rayon à cet endroit.
 * @param {{x:number,z:number,y:number}} source
 * @param {{x:number,z:number,y:number}} cible
 * @param {{ candidates: Function }} index  retour de `indexerAretes`
 * @param {object[]} [exclure]  arêtes à ignorer (le mur visé lui-même)
 */
export function rayonCoupe(source, cible, index, exclure = []) {
  const rx = cible.x - source.x, rz = cible.z - source.z;
  const denomMin = 1e-12;
  for (const e of index.candidates(source.x, source.z, cible.x, cible.z)) {
    if (exclure.includes(e)) continue;
    const sx = e.q.x - e.p.x, sz = e.q.z - e.p.z;
    const denom = rx * sz - rz * sx;
    if (Math.abs(denom) < denomMin) continue;
    const ax = e.p.x - source.x, az = e.p.z - source.z;
    const t = (ax * sz - az * sx) / denom;
    const u = (ax * rz - az * rx) / denom;
    if (t <= MARGE || t >= 1 - MARGE || u < 0 || u > 1) continue;
    const y = source.y + (cible.y - source.y) * t;
    if (y >= e.base && y <= e.haut) return true;
  }
  return false;
}

/**
 * Découpe un mur [p, q] (de `base` à `haut`, au-dessus du sol) en cellules et garde celles qu'une source éclaire.
 * Un mur entièrement éclairé reste UN rectangle (quatre coins et centre visibles) : l'ombre n'alourdit que les murs qui en portent.
 *
 * @param {{x:number,z:number}} p
 * @param {{x:number,z:number}} q
 * @param {number} base  hauteur du pied du mur
 * @param {number} haut  hauteur du haut du mur
 * @param {{x:number,z:number}} normale  normale extérieure (unitaire, horizontale)
 * @param {{ sources: {x:number,z:number}[], hauteurFeu: number, rayon: number, index: object, pas?: number, bande?: number }} ctx
 * @returns {{ t0: number, t1: number, y0: number, y1: number }[]}  rectangles éclairés : t le long du mur (0 en p, 1 en q), y hauteurs absolues
 */
export function cellulesEclairees(p, q, base, haut, normale, ctx) {
  const { sources, hauteurFeu, rayon, index, pas = PAS_M, bande = BANDE_M } = ctx;
  const dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz);
  const propre = index.arete ? index.arete(p, q) : undefined;
  const exclure = propre ? [propre] : [];
  const r2 = rayon * rayon;
  const eclaire = (t, y) => {
    // le point visé est décollé du mur vers l'extérieur, pour ne pas buter sur le mur lui-même
    const cible = { x: p.x + dx * t + normale.x * 0.15, z: p.z + dz * t + normale.z * 0.15, y };
    for (const s of sources) {
      const vx = s.x - cible.x, vz = s.z - cible.z;
      if (vx * vx + vz * vz > r2) continue;
      if (vx * normale.x + vz * normale.z <= 0) continue;               // le mur tourne le dos à cette source
      if (!rayonCoupe({ x: s.x, z: s.z, y: hauteurFeu }, cible, index, exclure)) return true;
    }
    return false;
  };
  const tousVus = [0, 0.5, 1].every((t) => [base, (base + haut) / 2, haut].every((y) => eclaire(t, y)));
  if (tousVus) return [{ t0: 0, t1: 1, y0: base, y1: haut }];
  const nt = Math.max(1, Math.ceil(L / pas)), ny = Math.max(1, Math.ceil((haut - base) / bande));
  const sortie = [];
  // bande par bande, de gauche à droite : les cellules contiguës d'une même bande se fusionnent
  for (let j = 0; j < ny; j++) {
    const y0 = base + ((haut - base) * j) / ny, y1 = base + ((haut - base) * (j + 1)) / ny;
    for (let i = 0; i < nt; i++) {
      const t0 = i / nt, t1 = (i + 1) / nt;
      if (!eclaire((t0 + t1) / 2, (y0 + y1) / 2)) continue;
      // une cellule contiguë, de la même bande, prolonge la précédente : moins de triangles pour la même lumière
      const derniere = sortie[sortie.length - 1];
      if (derniere && derniere.y0 === y0 && derniere.y1 === y1 && Math.abs(derniere.t1 - t0) < 1e-9) derniere.t1 = t1;
      else sortie.push({ t0, t1, y0, y1 });
    }
  }
  return sortie;
}

/**
 * Un modèle de dégradation réaliste d'une ligne (en mètres, dans un repère local) pour éprouver le calage.
 *
 * Une ligne réelle (trace GPS, itinéraire dessiné, géométrie d'un objet d'un autre référentiel) n'est pas la route
 * parfaite plus un bruit blanc. Le modèle assemble cinq défauts, tirés ensemble :
 *
 *   - un **bruit de position gaussien corrélé** le long de la ligne (processus AR(1) : deux points voisins se trompent
 *     dans le même sens), d'écart-type `sigma` (3 à 15 m) et de longueur de corrélation `correlation` (30 à 80 m) ;
 *   - un **décalage systématique** de `decalage` m dans une direction fixe (référentiel mal calé) ;
 *   - une **dérive** : un décalage latéral qui croît linéairement jusqu'à `derive` m à la fin de la ligne ;
 *   - un **lissage de coins** : moyenne glissante sur `lissage` m (une ligne dessinée coupe les virages) ;
 *   - une **décimation** : un sommet tous les `espacement` m seulement (ligne simplifiée), extrémités gardées.
 *
 * Tout est reproductible (graine). `tirage(r)` choisit les paramètres d'une dégradation ; `degrader` l'applique ;
 * `ecartMoyen` mesure l'écart réel obtenu, qui sert de niveau de sévérité.
 */

import { echantillonner, cumul, pointA, longueur, distPtLignes } from '../lib/reseau/geo.js';

const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

/** Tire les paramètres d'une dégradation avec le générateur `r` (`() => [0,1[`). */
export function tirage(r) {
  const choix = (liste) => liste[Math.floor(r() * liste.length)];
  return {
    sigma: 3 + r() * 12, // m
    correlation: 30 + r() * 50, // m
    decalage: r() < 0.6 ? r() * 10 : 0, // m
    derive: r() < 0.4 ? r() * 15 : 0, // m
    lissage: choix([0, 0, 20, 40]), // m
    espacement: choix([0, 25, 60, 150, 400]), // m, 0 = pas de décimation
  };
}

/**
 * Applique une dégradation à une ligne [[x, y], …].
 * @param {number[][]} ln
 * @param {ReturnType<typeof tirage>} p
 * @param {() => number} r
 */
export function degrader(ln, p, r) {
  const pas = 5;
  let pts = echantillonner(ln, pas);
  const n = pts.length;
  // bruit AR(1) corrélé
  const rho = Math.exp(-pas / Math.max(1, p.correlation));
  const inno = Math.sqrt(1 - rho * rho) * p.sigma;
  let nx = gauss(r) * p.sigma;
  let ny = gauss(r) * p.sigma;
  const angle = r() * 2 * Math.PI;
  const signe = r() < 0.5 ? -1 : 1;
  pts = pts.map((q, k) => {
    if (k > 0) { nx = rho * nx + inno * gauss(r); ny = rho * ny + inno * gauss(r); }
    const a = pts[Math.max(0, k - 1)];
    const b = pts[Math.min(n - 1, k + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const normale = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
    const dv = signe * p.derive * (k / Math.max(1, n - 1));
    return [
      q[0] + nx + p.decalage * Math.cos(angle) + dv * normale[0],
      q[1] + ny + p.decalage * Math.sin(angle) + dv * normale[1],
    ];
  });
  // lissage de coins : moyenne glissante sur `lissage` m, extrémités fixées
  if (p.lissage > 0) {
    const w = Math.max(1, Math.round(p.lissage / pas / 2));
    const lisse = pts.map((q, k) => {
      if (k === 0 || k === n - 1) return q;
      const h = Math.min(w, k, n - 1 - k);
      let sx = 0;
      let sy = 0;
      for (let j = k - h; j <= k + h; j++) { sx += pts[j][0]; sy += pts[j][1]; }
      return [sx / (2 * h + 1), sy / (2 * h + 1)];
    });
    pts = lisse;
  }
  // décimation
  if (p.espacement > 0) {
    const cum = cumul(pts);
    const L = cum[cum.length - 1];
    const k = Math.max(1, Math.round(L / p.espacement));
    pts = Array.from({ length: k + 1 }, (_, i) => pointA(pts, cum, (L * i) / k));
  }
  return pts;
}

/** Écart moyen (m) entre la ligne dégradée et la ligne d'origine : le niveau de sévérité réel. */
export function ecartMoyen(degradee, origine) {
  const echantillon = echantillonner(degradee, 10);
  let s = 0;
  for (const p of echantillon) s += distPtLignes(p, [origine]);
  return s / echantillon.length;
}

export { longueur };

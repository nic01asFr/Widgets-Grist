/**
 * Mesurer un tracé sur le réseau (`calage.js`) : sa fidélité à la ligne donnée et la forme du résultat.
 *
 * **Ce que ces mesures ne disent pas :** si le tracé emprunte les BONS tronçons. Il n'existe pas de vérité terrain pour
 * ce rapprochement ; une ligne et un tracé peuvent s'accorder à 3 m en suivant la mauvaise chaussée. Les mesures
 * servent à comparer des méthodes entre elles, à repérer les tracés douteux (rappel faible, tronçons courts,
 * rupture) et à vérifier une régression, pas à certifier un résultat.
 *
 * Toutes les distances sont en mètres, dans le repère du graphe.
 */

import { echantillonner, distPtLignes, longueur, hausdorff, frechet } from './geo.js';

/** Un tronçon entier de moins de ce nombre de mètres est probablement un tronçon de carrefour. */
export const SEUIL_COURT = 15;
/** « À moins de 15 m » : tolérance du rappel et de la précision géométriques. */
export const SEUIL_PROCHE = 15;

/** Part des points de `A` (lignes échantillonnées tous les `pas` m) à moins de `seuil` de `B`. */
export function partProche(A, B, seuil, pas = 5) {
  let n = 0;
  let ok = 0;
  for (const ln of A) {
    for (const p of echantillonner(ln, pas)) {
      n++;
      if (distPtLignes(p, B) <= seuil) ok++;
    }
  }
  return n ? ok / n : null;
}

/** Médiane, 90e centile, maximum et moyenne d'une liste de nombres (les valeurs absentes sont ignorées). */
export function statistiques(valeurs) {
  const s = valeurs.filter((x) => x !== null && x !== undefined && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!s.length) return { n: 0 };
  const q = (x) => s[Math.min(s.length - 1, Math.floor(x * s.length))];
  return { n: s.length, mediane: q(0.5), p90: q(0.9), max: s[s.length - 1], moyenne: s.reduce((a, b) => a + b, 0) / s.length };
}

/**
 * Les mesures d'un résultat de `tracer` par rapport à la ligne donnée.
 * @param {{troncons: object[], geometrieM: number[][][], ok: boolean, composantes?: number}} resultat
 * @param {number[][][]} refM la ligne donnée, en mètres dans le repère du graphe
 */
export function metriques(resultat, refM) {
  const t = resultat.troncons || [];
  const Lref = refM.reduce((a, l) => a + longueur(l), 0);
  const Ltrace = t.reduce((a, x) => a + x.parcouru, 0);
  const geo = resultat.geometrieM || [];
  const m = {
    nbTroncons: t.length,
    nbCourtsEntiers: t.filter((x) => x.L < SEUIL_COURT).length,
    nbCourtsParcourus: t.filter((x) => x.parcouru < SEUIL_COURT).length,
    longueurTraceM: Ltrace,
    longueurLigneM: Lref,
    ratioLongueur: Lref ? Ltrace / Lref : null,
    composantes: resultat.composantes ?? null,
    nbLignes: refM.length,
    rappel15m: geo.length ? partProche(refM, geo, SEUIL_PROCHE) : 0, // part de la ligne couverte par le tracé
    precision15m: geo.length ? partProche(geo, refM, SEUIL_PROCHE) : null, // part du tracé qui reste sur la ligne
    hausdorffM: geo.length ? hausdorff(geo, refM, 5) : null,
    frechetM: null,
    partPartiels: t.length ? t.filter((x) => x.part < 0.95).length / t.length : 0,
  };
  if (geo.length === 1 && refM.length === 1) m.frechetM = frechet(geo[0], refM[0], 10);
  m.echec = !resultat.ok || m.rappel15m < 0.7;
  return m;
}

/**
 * F1 pondéré par la longueur entre deux jeux de portions de tronçons `{ cleabs, s0, s1 }`. Une portion juste sur un
 * long tronçon compte plus qu'un petit tronçon entier ; un tronçon entier là où seule une moitié est vraie est
 * pénalisé en précision.
 */
export function f1Troncons(verite, essai) {
  let inter = 0;
  let lt = 0;
  let le = 0;
  for (const t of verite) lt += t.s1 - t.s0;
  for (const e of essai) le += e.s1 - e.s0;
  const v = new Map(verite.map((t) => [t.cleabs, t]));
  for (const e of essai) {
    const t = v.get(e.cleabs);
    if (t) inter += Math.max(0, Math.min(t.s1, e.s1) - Math.max(t.s0, e.s0));
  }
  const precision = le ? inter / le : 0;
  const rappel = lt ? inter / lt : 0;
  return { precision, rappel, f1: precision + rappel ? (2 * precision * rappel) / (precision + rappel) : 0 };
}

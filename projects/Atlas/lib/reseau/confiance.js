/**
 * Confiance d'un tracé calé : pour chaque tronçon retenu, la probabilité estimée qu'il appartienne à la bonne
 * séquence, et une classe `haute` / `moyenne` / `faible`.
 *
 * ## D'où vient le chiffre
 *
 * Le calage (`calage.js`, option `confiance`) calcule, par l'algorithme avant-arrière, la **probabilité a posteriori**
 * de chaque candidat à chaque observation, sachant toute la ligne. Pour chaque tronçon retenu on en tire douze
 * caractéristiques (`CARACTERISTIQUES`) : probabilité a posteriori moyenne et espérée, marge sur la meilleure
 * alternative, distance moyenne à la ligne, nombre de voisines à moins de 30 m, longueur et part parcourue du tronçon,
 * continuité avec les tronçons voisins du tracé, couverture et ruptures de l'ensemble. Une régression logistique,
 * **apprise sur un jeu de départements et évaluée sur d'autres** (`tools/calibrer-confiance.mjs`), les transforme en
 * probabilité ; les seuils des classes sont fixés sur le jeu d'apprentissage.
 *
 * ## Ce que le chiffre veut dire, et ce qu'il ne dit pas
 *
 * Il est calibré **contre une vérité de routage** (la sortie d'un moteur d'itinéraire sur la BD TOPO), pas contre un
 * relevé terrain : « parmi les tronçons notés 0,9, environ 90 % se retrouvent dans la séquence du moteur de routage »,
 * pour des lignes dégradées par le modèle de `tools/degradations-trace.mjs`. Sur des lignes d'une autre nature (trace
 * GPS en tunnel, géométrie d'un autre référentiel très décalé, tronçon absent de la BD TOPO), la calibration peut ne
 * pas tenir. Les chiffres mesurés (erreur de calibration, précision par classe, jeu de test) sont dans
 * `docs/DONNEES-IGN.md`. Pas de confiance pour `pcc-ligne` (il ne regarde pas la ligne) : `null`.
 */

import { MODELE_CONFIANCE } from './confiance-modele.js';

export const CARACTERISTIQUES = Object.freeze([
  'postMoy', 'espObs', 'nChoisi', 'dMoy', 'voisines', 'marge', 'longueur', 'part', 'parcouru', 'continuite', 'couverture', 'ruptures',
]);

/** Ordre et normalisation fixes du vecteur d'entrée du modèle. */
export function vecteur(car) {
  return [
    car.postMoy,
    Math.log1p(car.espObs),
    Math.log1p(car.nChoisi),
    car.dMoy / 30,
    car.voisines / 5,
    car.marge / 10,
    Math.log(Math.max(1, car.longueur)) / 6,
    car.part,
    Math.log1p(car.parcouru) / 6,
    car.continuite,
    car.couverture,
    Math.log1p(car.ruptures),
  ];
}

const bornes = (x, a, b) => Math.max(a, Math.min(b, x));

/**
 * Les caractéristiques d'un tronçon retenu.
 * @param {object} Gr graphe
 * @param {{couches: object[][], suites: object[][]}[]} diagnostics ceux de `caler` (un par ligne), états portant `post`
 * @param {{arete: number, L: number, part: number, parcouru: number}} t tronçon de `agreger`
 * @param {{continuite: number, couverture: number, ruptures: number}} trace
 */
export function caracteristiques(Gr, diagnostics, t, trace) {
  let somme = 0;
  let nCand = 0;
  let sommeD = 0;
  let sommeVois = 0;
  let sommeMarge = 0;
  let nChoisi = 0;
  for (const diag of diagnostics) {
    const choisis = new Set(diag.suites.flat());
    for (const couche of diag.couches) {
      const siens = couche.filter((s) => s.e === t.arete);
      if (!siens.length) continue;
      nCand++;
      somme += siens.reduce((a, s) => a + (s.post || 0), 0);
      sommeD += Math.min(...siens.map((s) => s.d));
      const autres = couche.filter((s) => s.e !== t.arete);
      sommeVois += new Set(autres.map((s) => s.e)).size;
      const mien = Math.min(...siens.map((s) => s.cout));
      sommeMarge += autres.length ? bornes(Math.min(...autres.map((s) => s.cout)) - mien, -10, 10) : 10;
      if (siens.some((s) => choisis.has(s))) nChoisi++;
    }
  }
  return {
    postMoy: nCand ? somme / nCand : 0,
    espObs: somme,
    nChoisi,
    dMoy: nCand ? sommeD / nCand : 30,
    voisines: nCand ? sommeVois / nCand : 0,
    marge: nCand ? sommeMarge / nCand : -10,
    longueur: t.L,
    part: t.part,
    parcouru: t.parcouru,
    continuite: trace.continuite,
    couverture: trace.couverture,
    ruptures: trace.ruptures,
  };
}

/** Continuité de chaque tronçon avec ses voisins dans l'ordre du tracé : 1 si tous touchent le suivant ou le précédent par un nœud. */
export function continuites(Gr, passages) {
  const suite = [];
  for (const p of passages) if (!suite.length || suite[suite.length - 1] !== p.arete) suite.push(p.arete);
  const touche = (a, b) => {
    const A = Gr.aretes[a];
    const B = Gr.aretes[b];
    return A.a === B.a || A.a === B.b || A.b === B.a || A.b === B.b;
  };
  const out = new Map();
  suite.forEach((a, i) => {
    const voisins = [suite[i - 1], suite[i + 1]].filter((x) => x !== undefined);
    const v = voisins.length ? voisins.filter((b) => touche(a, b)).length / voisins.length : 1;
    out.set(a, Math.min(out.get(a) ?? 1, v));
  });
  return out;
}

const sigmoide = (z) => 1 / (1 + Math.exp(-z));

/** Probabilité estimée (0-1) qu'un tronçon soit juste, d'après le modèle calibré ; `null` si aucun modèle. */
export function scorer(car, modele = MODELE_CONFIANCE) {
  if (!modele) return null;
  const x = vecteur(car);
  let z = modele.intercept;
  for (let i = 0; i < x.length; i++) z += (modele.poids[i] * (x[i] - modele.moyenne[i])) / modele.ecartType[i];
  const brut = sigmoide(z);
  if (!modele.isotonique) return brut;
  // régression isotone (par paliers) apprise sur le jeu d'apprentissage
  const { x: xs, y: ys } = modele.isotonique;
  if (brut <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (brut <= xs[i]) return ys[i - 1] + ((ys[i] - ys[i - 1]) * (brut - xs[i - 1])) / Math.max(1e-12, xs[i] - xs[i - 1]);
  return ys[ys.length - 1];
}

/** La classe d'un score : `haute` à partir du seuil haut, `faible` sous le seuil bas, `moyenne` entre les deux. */
export function classer(score, modele = MODELE_CONFIANCE) {
  if (score === null || score === undefined || !modele) return null;
  if (score >= modele.seuils.haute) return 'haute';
  if (score < modele.seuils.moyenne) return 'faible';
  return 'moyenne';
}

/**
 * Annote les tronçons d'un résultat de `tracer` avec leurs caractéristiques, leur score et leur classe, et rend la
 * confiance du tracé entier (moyenne des scores pondérée par la longueur parcourue, minimum, répartition par classe).
 */
export function annoter(Gr, resultat, diagnostics, modele = MODELE_CONFIANCE) {
  const cont = continuites(Gr, resultat.passages);
  const trace = { couverture: resultat.couvertureObs, ruptures: resultat.ruptures };
  for (const t of resultat.troncons) {
    t.caracteristiques = caracteristiques(Gr, diagnostics, t, { ...trace, continuite: cont.get(t.arete) ?? 1 });
    const score = scorer(t.caracteristiques, modele);
    t.confiance = score === null ? null : { score, classe: classer(score, modele) };
  }
  if (!modele || !resultat.troncons.length) return null;
  const total = resultat.troncons.reduce((a, t) => a + t.parcouru, 0) || 1;
  const parClasse = { haute: 0, moyenne: 0, faible: 0 };
  for (const t of resultat.troncons) parClasse[t.confiance.classe] += t.parcouru / total;
  return {
    score: resultat.troncons.reduce((a, t) => a + t.confiance.score * t.parcouru, 0) / total,
    minimum: Math.min(...resultat.troncons.map((t) => t.confiance.score)),
    parClasse,
    modele: modele.version,
  };
}

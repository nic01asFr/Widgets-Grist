/**
 * Dérivation : ce que l'hôte ne donne pas est calculé depuis ses « graines » (principal, secondaire, encre, fond), de façon déterministe.
 * Mêmes graines, mêmes valeurs : chaque hexadécimal produit se retrouve par le calcul (test de référence).
 *
 * Règles (toutes sur un fond clair ou sombre : le sens des rampes suit la direction « du fond vers l'encre ») :
 *  - séquentielle : la graine principale, éclaircie vers le fond à 12 % au départ et assombrie vers l'encre à 55 % à l'arrivée, puis
 *    9 couleurs régulièrement espacées en clarté perceptuelle L* le long d'un chemin dans Lab ;
 *  - divergente : une teinte de chaque côté d'un neutre (le fond mélangé à 7 % d'encre), chaque côté régulièrement espacé en L*, les deux
 *    extrêmes à la MÊME clarté (même poids visuel) ;
 *  - qualitative : principal, secondaire, puis des candidates qui restent distinctes (CIEDE2000 >= 10, pire cas sur la vision normale et
 *    les trois daltonismes) de tout ce qui précède et qui se détachent du fond (2:1 au moins) ;
 *  - plan de fond : la couleur principale mélangée au fond à intensités FIXES (une couleur et des intensités, jamais un arc-en-ciel) ;
 *  - sans donnée, sélection, survol, contour, halo : de l'encre et du fond.
 * Module pur : aucune palette n'est écrite ici, les candidates de la qualitative sont fournies par l'appelant.
 */
import { melanger, clarte, interpolerLab, deltaE2000, simulerDaltonisme, TYPES_DALTONISME, contraste } from './couleurs.js';

export const VERSION = '1.0.0';

/** Intensités du plan : part de la couleur principale dans chaque jeton (le fond fournit le reste). */
export const INTENSITES_PLAN = Object.freeze({ vert: 0.07, bati: 0.13, eau: 0.30, filet: 0.38, limite: 0.60 });
/** Part de végétation colorée : quand la charte fixe une couleur de végétation, elle se mélange au fond à cette intensité. */
export const INTENSITE_VEGETATION = 0.2;
/** Écart CIEDE2000 minimal, au pire des quatre visions, entre deux couleurs qualitatives. */
export const ECART_QUALITATIVE = 10;
/** Contraste minimal d'une candidate qualitative contre le fond : en dessous, la catégorie disparaît (le noir sur un fond sombre, le jaune pâle sur du blanc). */
export const CONTRASTE_QUALITATIVE = 2;

const sens = (fond, encre) => Math.sign(clarte(encre) - clarte(fond));

// ---------------------------------------------------------------------------------------------------------------- plan de fond
/**
 * Plan MONOCHROME : une couleur principale et des intensités. Chaque jeton est la couleur principale mélangée au fond dans une proportion
 * fixe : plus l'élément est structurant, plus il est intense. Le texte ne prend jamais la couleur principale (un orange ou un violet clair
 * ne se lit pas) : il garde l'encre.
 */
export function planMonochrome(principal, { fond = '#FFFFFF', encre = '#222222', intensites = {} } = {}) {
  const k = { ...INTENSITES_PLAN, ...intensites };
  const m = (t) => melanger(fond, principal, t);
  return { fond, vert: m(k.vert), bati: m(k.bati), eau: m(k.eau), route: fond, filet: m(k.filet), limite: m(k.limite), halo: fond, texte: encre, texte2: melanger(fond, encre, 0.82), info: principal === encre ? encre : melanger(principal, encre, 0.5) };
}

/**
 * Plan d'une charte : monochrome depuis `principal`, puis la végétation colorée si la charte en fixe une, puis les jetons explicites.
 * @param {{principal:string, fond:string, encre:string, intensites?:object, vegetation?:string, plan?:object}} o
 */
export function planDepuis({ principal, fond, encre, intensites = {}, vegetation, plan = {} }) {
  const p = planMonochrome(principal, { fond, encre, intensites });
  if (vegetation && vegetation !== 'monochrome') p.vert = melanger(fond, vegetation, INTENSITE_VEGETATION);
  return { ...p, ...plan };
}

// ---------------------------------------------------------------------------------------------------------------- chemin dans Lab
/**
 * n couleurs prises sur le chemin Lab défini par `ancres` (L* strictement monotone, croissant ou décroissant), de la première ancre à la
 * dernière, espacées de façon égale en L*. Les extrémités sont exactement les ancres de départ et d'arrivée, sauf si `LFin` arrête le
 * chemin à une clarté donnée.
 */
export function cheminLab(ancres, n, { LFin } = {}) {
  if (!Array.isArray(ancres) || ancres.length < 2) throw new Error('au moins deux ancres');
  const Ls = ancres.map(clarte), s = Math.sign(Ls[Ls.length - 1] - Ls[0]);
  if (!s) throw new Error('les ancres ont la même clarté : ' + ancres[0] + ' -> ' + ancres[ancres.length - 1]);
  for (let i = 1; i < Ls.length; i++) if (!((Ls[i] - Ls[i - 1]) * s > 0)) throw new Error('les ancres doivent être strictement monotones en clarté (L*) : ' + ancres[i - 1] + ' -> ' + ancres[i]);
  const L0 = Ls[0], L1 = LFin ?? Ls[Ls.length - 1];
  const L = (t) => clarte(interpolerLab(ancres, t));
  const sortie = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) { sortie.push(ancres[0].toLowerCase()); continue; }
    if (i === n - 1 && LFin === undefined) { sortie.push(ancres[ancres.length - 1].toLowerCase()); continue; }
    const cible = L0 + ((L1 - L0) * i) / (n - 1);
    let lo = 0, hi = 1;
    for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if ((L(m) - cible) * s < 0) lo = m; else hi = m; }
    sortie.push(interpolerLab(ancres, (lo + hi) / 2));
  }
  return sortie;
}

/** Garde les ancres dans l'ordre tant que la clarté progresse dans le sens voulu ; écarte celles qui reviennent en arrière. */
function ancresMonotones(candidates, s) {
  const gardees = [candidates[0]];
  for (const c of candidates.slice(1)) if ((clarte(c) - clarte(gardees[gardees.length - 1])) * s > 0.5) gardees.push(c);
  return gardees;
}

// ---------------------------------------------------------------------------------------------------------------- séquentielle
/**
 * Rampe séquentielle à `n` couleurs depuis une graine : du ton le plus proche du fond (valeur faible) au plus affirmé (valeur forte).
 * @returns {string[]|null} null si les graines ne permettent pas une rampe (graine confondue avec le fond ou avec l'encre)
 */
export function sequentielleDepuis({ principal, fond, encre }, n = 9) {
  const s = sens(fond, encre); if (!s) return null;
  const ancres = ancresMonotones([melanger(fond, principal, 0.12), principal, melanger(principal, encre, 0.55)], s);
  return ancres.length < 2 ? null : cheminLab(ancres, n);
}

// ---------------------------------------------------------------------------------------------------------------- divergente
/** Le neutre d'une divergente : le fond légèrement chargé d'encre. */
export const neutreDepuis = ({ fond, encre }) => melanger(fond, encre, 0.07);

/**
 * Divergente de 2k + 1 couleurs, du pôle `bas` au pôle `haut` en passant par le neutre. Chaque côté est régulièrement espacé en L* du neutre
 * jusqu'à la clarté de l'extrême le plus affirmé : les deux extrêmes ont le même poids visuel. Le côté le plus pâle est prolongé vers l'encre
 * pour y parvenir.
 * @returns {string[]|null} null si un pôle n'est pas plus affirmé que le neutre
 */
export function divergenteEntre(bas, haut, { fond, encre }, k = 3) {
  const s = sens(fond, encre), neutre = neutreDepuis({ fond, encre }); if (!s) return null;
  const pole = [bas, haut];
  if (pole.some((c) => !((clarte(c) - clarte(neutre)) * s > 0))) return null;
  const Lcommun = s < 0 ? Math.min(...pole.map(clarte)) : Math.max(...pole.map(clarte));
  const cote = (couleur) => {
    let ancres = [neutre, couleur];
    if ((clarte(couleur) - Lcommun) * s < 0) {
      let t = 0.3, ext = melanger(couleur, encre, t);
      while ((clarte(ext) - Lcommun) * s < 0 && t < 0.95) { t += 0.05; ext = melanger(couleur, encre, t); }
      ancres = [neutre, couleur, ext];
    }
    return cheminLab(ancres, k + 1, { LFin: Lcommun }).slice(1);
  };
  return [...cote(bas).reverse(), neutre, ...cote(haut)];
}

// ---------------------------------------------------------------------------------------------------------------- qualitative
/** Écart CIEDE2000 entre deux couleurs au pire de la vision normale et des trois daltonismes. */
export function ecartPireCas(a, b) {
  let pire = deltaE2000(a, b);
  for (const t of TYPES_DALTONISME) pire = Math.min(pire, deltaE2000(simulerDaltonisme(a, t), simulerDaltonisme(b, t)));
  return pire;
}

/**
 * Qualitative de `n` couleurs : les graines (principal puis secondaire), complétées par des candidates qui s'en distinguent assez et qui se
 * détachent du fond (`CONTRASTE_QUALITATIVE`).
 * @param {{principal?:string, secondaire?:string, fond?:string}} graines
 * @param {string[]} candidates  couleurs proposées, dans l'ordre de préférence
 */
export function qualitativeDepuis({ principal, secondaire, fond }, candidates, n = 8) {
  const choisies = [principal, secondaire].filter(Boolean);
  for (const c of candidates) {
    if (choisies.length >= n) break;
    if (fond && contraste(c, fond) < CONTRASTE_QUALITATIVE) continue;
    if (choisies.every((x) => ecartPireCas(c, x) >= ECART_QUALITATIVE)) choisies.push(c);
  }
  return choisies;
}

// ---------------------------------------------------------------------------------------------------------------- traits et sans donnée
/** Gris « sans donnée » : l'encre mélangée au fond, juste assez pour atteindre 3,2:1 contre lui (jamais la couleur d'une classe). */
export function sansDonneeDepuis({ fond, encre }, cible = 3.2) {
  for (let t = 0.3; t <= 1.0001; t += 0.01) { const c = melanger(fond, encre, t); if (contraste(c, fond) >= cible) return c; }
  return encre;
}

/** Trait de sélection (encre), halo (fond), survol (encre atténuée), contour de classe (fond). */
export function traitsDepuis({ fond, encre }) {
  return { selection: encre, halo: fond, survol: melanger(fond, encre, 0.75), contour: fond };
}

// ---------------------------------------------------------------------------------------------------------------- ensemble
/**
 * Toute la partie « données » d'une charte, depuis les graines. Les éléments qui ne peuvent pas être calculés (graine dégénérée) sont absents.
 * @param {{principal:string, secondaire:string, encre:string, fond:string}} g
 * @param {{candidates?:string[], nSequentielle?:number, kDivergente?:number, nQualitative?:number}} o
 */
export function deriverDonnees(g, { candidates = [], nSequentielle = 9, kDivergente = 3, nQualitative = 8 } = {}) {
  const sortie = {};
  const seq = sequentielleDepuis(g, nSequentielle); if (seq) sortie.sequentielles = { principale: seq };
  const div = divergenteEntre(g.principal, g.secondaire, g, kDivergente); if (div) sortie.divergente = div;
  sortie.qualitative = qualitativeDepuis(g, candidates, nQualitative);
  sortie.sansDonnee = sansDonneeDepuis(g);
  Object.assign(sortie, traitsDepuis(g));
  return sortie;
}

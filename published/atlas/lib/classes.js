/**
 * Des classes par seuils : couper un champ numérique en tranches, et donner une couleur à chacune.
 *
 * Brique générale de la symbolisation — elle sert la **couleur** d'une couche (couleur graduée en classes bornées à la main
 * plutôt que répartie d'office) et son **contour** (le contour peut suivre un champ, indépendamment du remplissage). Un délai
 * avant la prochaine visite en est un emploi, parmi d'autres : une profondeur, un âge, une pente, un effectif.
 *
 * Les classes suivent la règle déjà tenue par la graduation d'Atlas, celle de QGIS : **hautes inclusives**. Une classe
 * `]a, b]` prend les valeurs plus grandes que `a` et jusqu'à `b` inclus ; la première n'a pas de borne basse, la dernière pas de
 * borne haute. Avec les seuils `[-1, 1]` : la première classe prend tout ce qui est ≤ -1, la deuxième de -1 (exclu) à 1
 * (inclus), la troisième ce qui dépasse 1.
 *
 * Une couleur vide (`''`) veut dire « aucune » : pas de contour, pour cette classe.
 *
 * Module pur : seuils, couleurs, classes, comptes.
 */

export const VERSION = '1.0.0';

export const COULEURS_PAR_DEFAUT = Object.freeze(['#4caf7a', '#f0b429', '#d64545']);

/** Les seuils d'un jeu de classes : nombres finis, triés, sans doublon. */
export function seuilsPropres(seuils) {
  return [...new Set((seuils || []).filter((v) => v !== null && v !== '').map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
}

/**
 * Les classes (au format des classes bornées d'Atlas) d'une liste de seuils et de couleurs.
 * `couleurs` a un élément de plus que `seuils` ; s'il en manque, on complète par la dernière.
 */
export function stopsDepuisSeuils(seuils, couleurs) {
  const s = seuilsPropres(seuils);
  const c = Array.isArray(couleurs) ? [...couleurs] : [];
  while (c.length < s.length + 1) c.push(c.length ? c[c.length - 1] : COULEURS_PAR_DEFAUT[c.length % COULEURS_PAR_DEFAUT.length]);
  return c.slice(0, s.length + 1).map((color, i) => {
    const stop = { color: color ?? '', opacity: 1 };
    if (i > 0) stop.lower = s[i - 1];
    if (i < s.length) stop.upper = s[i];
    return stop;
  });
}

const trier = (stops) => [...(stops || [])].sort((a, b) => Number(a.lower ?? -Infinity) - Number(b.lower ?? -Infinity));

/** L'inverse : les seuils et les couleurs d'une liste de classes. */
export function seuilsDeStops(stops) {
  const tries = trier(stops);
  const seuils = tries.slice(0, -1).map((s) => Number(s.upper)).filter(Number.isFinite);
  return { seuils, couleurs: tries.map((s) => s.color ?? '') };
}

/** Le numéro de la classe d'une valeur, ou -1 si elle n'en a pas (vide, texte). */
export function classeDe(valeur, stops) {
  if (valeur === null || valeur === undefined || valeur === '') return -1;
  const n = typeof valeur === 'number' ? valeur : Number(String(valeur).replace(',', '.'));
  if (!Number.isFinite(n)) return -1;
  return trier(stops).findIndex((s) => n <= Number(s.upper ?? Infinity));
}

/** Les comptes par classe, dans l'ordre des classes, plus les objets sans valeur. */
export function comptesParClasse(features, cle, stops) {
  const comptes = new Array((stops || []).length).fill(0);
  let sansValeur = 0;
  for (const f of features || []) {
    const i = classeDe(f?.properties?.[cle], stops);
    if (i < 0) sansValeur++; else comptes[i]++;
  }
  return { comptes, sansValeur };
}

const nombre = (v) => String(+Number(v).toFixed(4)).replace('.', ',');
const present = (v) => v !== undefined && v !== null && Number.isFinite(Number(v));

/** Le libellé d'une classe : « jusqu'à -1 », « de -1 à 1 », « au-delà de 1 ». */
export function libelleClasse(stops, i) {
  const s = trier(stops)[i];
  if (!s) return '';
  const aBas = present(s.lower);
  const aHaut = present(s.upper);
  if (!aBas && aHaut) return `jusqu’à ${nombre(s.upper)}`;
  if (aBas && aHaut) return `de ${nombre(s.lower)} à ${nombre(s.upper)}`;
  if (aBas) return `au-delà de ${nombre(s.lower)}`;
  return 'tout';
}

/** Les couleurs, dans l'ordre inverse. */
export function inverserCouleurs(stops) {
  const { seuils, couleurs } = seuilsDeStops(stops);
  return stopsDepuisSeuils(seuils, [...couleurs].reverse());
}

/** Un découpage de départ : `n` classes, des seuils ronds entre le minimum et le maximum. */
export function seuilsAutomatiques(min, max, n = 3) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || n < 2) return [];
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (lo === hi) return [lo];
  const pas = (hi - lo) / n;
  const ordre = Math.pow(10, Math.floor(Math.log10(pas)));
  const arrondi = (v) => Math.round(v / ordre) * ordre;
  return seuilsPropres(Array.from({ length: n - 1 }, (_, i) => +arrondi(lo + pas * (i + 1)).toFixed(6)));
}

/** La couleur d'une classe pour MapLibre : vide, c'est transparent. */
export const TRANSPARENT = 'rgba(0,0,0,0)';

/** Des classes prêtes pour la carte : les couleurs vides deviennent transparentes. */
export function stopsPourCarte(stops) {
  return (stops || []).map((s) => ({ ...s, color: s.color ? s.color : TRANSPARENT }));
}

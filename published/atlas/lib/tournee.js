/**
 * La tournée d'un contexte : une ligne de travail et l'ordre qu'elle donne aux ouvrages.
 *
 * Une tournée n'est pas un périmètre. Les ouvrages qu'elle parcourt sont ceux que **le contexte laisse voir** (couches visibles,
 * filtres actifs) ; la ligne apporte leur **ordre** — la position de chacun, projetée sur elle — et la **distance** depuis le
 * départ. Un ouvrage éloigné de la ligne passe en fin de liste avec son écart, il n'est pas écarté.
 *
 * Rien ici ne touche la carte, Grist ni le DOM. Le dessin de la ligne, la liste du panneau et le pas de ◀ ▶ restent l'affaire
 * de l'application.
 */
import { projeter, longueurMetres } from './trajet.js?v=1.12.0';

export const VERSION = '1.0.0';

/** Une tournée valide : une ligne d'au moins deux points distincts. */
export function tourneeValide(trace) {
  const c = trace?.coordinates;
  if (!Array.isArray(c) || c.length < 2) return false;
  const ok = c.filter((p) => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])));
  if (ok.length < 2) return false;
  return ok.some((p) => Number(p[0]) !== Number(ok[0][0]) || Number(p[1]) !== Number(ok[0][1]));
}

/**
 * Les objets dans l'ordre de la ligne.
 *
 * Chaque objet porte `point: [lng, lat]` ; il revient avec `abscisse` (0 à 1), `metres` (depuis le départ) et `ecartM` (distance
 * à la ligne). Ceux qui n'ont pas de position valide sont laissés de côté. À la même place, l'ordre de réception est gardé ; un objet
 * éloigné de plus de `lointainM` passe après tous ceux que la ligne longe, du moins éloigné au plus éloigné.
 *
 * @param {number[][]} coords  la ligne
 * @param {Array<{point: number[]}>} objets
 * @param {number} [lointainM]  au-delà, un objet est « hors ligne » et se range en fin de liste
 */
export function ordonnerLeLong(coords, objets, lointainM = 250) {
  if (!Array.isArray(coords) || coords.length < 2) return [];
  const total = longueurMetres(coords);
  const sortie = [];
  (objets || []).forEach((o, i) => {
    if (!Array.isArray(o?.point) || !Number.isFinite(Number(o.point[0])) || !Number.isFinite(Number(o.point[1]))) return;
    const p = projeter(coords, o.point);
    if (!Number.isFinite(p.distanceMetres)) return;
    sortie.push({ ...o, abscisse: p.abscisse, metres: Math.round(p.abscisse * total), ecartM: p.distanceMetres, _ordre: i });
  });
  const loin = (o) => o.ecartM > lointainM;
  sortie.sort((a, b) => {
    if (loin(a) !== loin(b)) return loin(a) ? 1 : -1;
    if (loin(a)) return a.ecartM - b.ecartM || a._ordre - b._ordre;
    return a.abscisse - b.abscisse || a._ordre - b._ordre;
  });
  return sortie.map(({ _ordre, ...o }) => o);
}

/** Le rang (à partir de 1) et le nombre d'objets de la liste ordonnée ; `rang` vaut 0 si l'objet n'y est pas. */
export function rangDansTournee(ordre, cle) {
  const total = (ordre || []).length;
  const i = (ordre || []).findIndex((o) => o.cle === cle);
  return { rang: i + 1, total };
}

/**
 * La clé de l'objet suivant (`dir` = 1) ou précédent (`dir` = -1) dans l'ordre, en bouclant. Depuis un objet qui n'y figure
 * pas (masqué par un filtre, hors tournée), on prend le premier en avançant, le dernier en reculant. `null` si la liste est vide.
 */
export function voisinDansTournee(ordre, cle, dir) {
  const n = (ordre || []).length;
  if (!n) return null;
  const i = ordre.findIndex((o) => o.cle === cle);
  if (i < 0) return (dir < 0 ? ordre[n - 1] : ordre[0]).cle;
  return ordre[(((i + (dir < 0 ? -1 : 1)) % n) + n) % n].cle;
}

/** « 850 m » sous le kilomètre, « 3,2 km » au-delà. */
export function direLongueur(metres) {
  const m = Number(metres);
  if (!Number.isFinite(m) || m < 0) return '';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

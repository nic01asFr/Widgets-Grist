/**
 * Un volume ne se pose bien sur le relief qu'à l'échelle d'un bâtiment.
 *
 * ## Ce que MapLibre fait vraiment d'une extrusion sur relief
 *
 * Le vertex shader de `fill-extrusion` (MapLibre 5.6.1) ajoute à **tous** les sommets de
 * l'entité la même altitude : celle du MNT au **centroïde** de l'entité
 * (`get_elevation(a_centroid)`), base enterrée de 10 m quand elle vaut 0. Une entité est donc
 * un bloc **rigide**, posé à une seule altitude, et non une forme qui épouse la pente
 * sommet par sommet — ce que ce dépôt affirmait jusqu'ici.
 *
 * Deux conséquences, que l'on voit à l'écran :
 *
 * - **Une grande surface se pose mal.** Sur une pente de 20 %, un bloc de 500 m d'emprise
 *   a 50 m de différence entre ses bords et son centre : il flotte d'un côté, il s'enfonce de
 *   l'autre, et sa paroi, censée faire 12 m, en montre 40 là où le sol est plus bas.
 * - **Elle bouge quand on déplace la carte.** Le centroïde est celui du fragment de tuile :
 *   une grande entité est découpée par les tuiles, chaque morceau prend l'altitude de son
 *   propre centroïde (des marches aux joints), et ces morceaux changent quand le niveau de
 *   zoom ou la résolution du MNT change.
 *
 * Un bâtiment (quelques dizaines de mètres) est dans les deux cas à peu près juste : l'erreur
 * est proportionnelle à l'emprise.
 *
 * ## Ce qu'on en fait
 *
 * Sur relief actif, une entité plus vaste que `SEUIL_VOLUME_M` n'est plus extrudée : elle est
 * **posée à plat**. MapLibre drape les surfaces à plat sur le MNT pixel par pixel, donc elle
 * épouse le relief exactement, sans flotter ni bouger. Les autres restent en volume. Sans
 * relief, rien ne change : à plat, un bloc rigide est exact.
 *
 * Ce module ne touche ni au DOM, ni à MapLibre.
 */

/** Emprise (diagonale, en mètres) au-delà de laquelle un volume ne suit plus le relief. */
export const SEUIL_VOLUME_M = 250;

/** Propriété portée par chaque entité surfacique : la diagonale de son emprise, en mètres. */
export const PROP_TAILLE = '_taille_m';

const M_PAR_DEGRE_LAT = 110574;
const M_PAR_DEGRE_LNG_EQUATEUR = 111320;

function parcourir(coords, f) {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === 'number') { f(coords); return; }
  for (const c of coords) parcourir(c, f);
}

/**
 * La diagonale de l'emprise d'une géométrie surfacique, en mètres.
 *
 * @param {{type?: string, coordinates?: unknown}|null|undefined} geometrie
 * @returns {number|null} `null` si ce n'est pas une surface, ou sans coordonnée lisible
 */
export function tailleEmpriseM(geometrie) {
  if (!geometrie || (geometrie.type !== 'Polygon' && geometrie.type !== 'MultiPolygon')) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  parcourir(geometrie.coordinates, (p) => {
    const x = p[0], y = p[1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  });
  if (!Number.isFinite(minX)) return null;
  const latMilieu = (minY + maxY) / 2;
  const dx = (maxX - minX) * M_PAR_DEGRE_LNG_EQUATEUR * Math.cos((latMilieu * Math.PI) / 180);
  const dy = (maxY - minY) * M_PAR_DEGRE_LAT;
  return Math.hypot(dx, dy);
}

// Une géométrie remplacée (forme modifiée) est un autre objet : la taille se recalcule.
const _tailles = new WeakMap();

/**
 * Pose `_taille_m` sur chaque entité surfacique et dit combien dépassent le seuil.
 * Le calcul est mémorisé par géométrie : relire une table de 100 000 bâtiments ne reparcourt
 * pas leurs sommets.
 *
 * @param {Array<{geometry?: object, properties?: object}>} entites
 * @param {number} [seuil]
 * @returns {{ total: number, vastes: number }}
 */
export function marquerTailles(entites, seuil = SEUIL_VOLUME_M) {
  let total = 0, vastes = 0;
  for (const f of entites || []) {
    const g = f?.geometry;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
    let t = _tailles.get(g);
    if (t === undefined) { t = tailleEmpriseM(g); _tailles.set(g, t); }
    if (t == null) continue;
    if (!f.properties) f.properties = {};
    f.properties[PROP_TAILLE] = Math.round(t);
    total++;
    if (t > seuil) vastes++;
  }
  return { total, vastes };
}

/** Filtre MapLibre : les entités qu'on peut extruder. Une entité sans taille connue reste un volume. */
export function filtreVolume(seuil = SEUIL_VOLUME_M) {
  return ['<=', ['coalesce', ['get', PROP_TAILLE], 0], seuil];
}

/** Filtre MapLibre : les entités trop vastes, à poser à plat. */
export function filtreVaste(seuil = SEUIL_VOLUME_M) {
  return ['>', ['coalesce', ['get', PROP_TAILLE], 0], seuil];
}

/** Cette entité est-elle trop vaste pour un volume ? */
export function estTropVaste(entite, seuil = SEUIL_VOLUME_M) {
  const t = entite?.properties?.[PROP_TAILLE];
  return Number.isFinite(t) && t > seuil;
}

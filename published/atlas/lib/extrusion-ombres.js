/**
 * Les volumes qui projettent l'ombre du bati extrude.
 *
 * MapLibre ne projette pas d'ombre depuis une `fill-extrusion` : sans ce pont,
 * seuls les modeles importes portent une ombre. `app_v7.js` collecte donc les
 * emprises extrudees proches de la vue, et ce module en fait des volumes three.js
 * INVISIBLES (ils n'ecrivent ni couleur ni profondeur) qui castent sur le meme
 * plan d'ombre que les GLB.
 *
 * Sorti d'`app_v7.js` : la geometrie ne depend ni de l'etat de la carte ni de
 * three.js importe — `THREE` est un argument. Le module peut donc se tester sans
 * navigateur et se charger avec le moteur 3D, a la demande (`lib/three-differe.js`).
 *
 * Les coordonnees entrantes sont en lng/lat ; `versLocal(lng, lat)` rend des metres
 * locaux `{x: est, y: nord}`. Le plan de la forme est donc XY = est/nord, et
 * l'extrusion monte en +Z ; l'appelant retourne la geometrie (Y haut, Z = -nord).
 */

/** Nombre maximal de points d'un anneau exterieur, puis d'un trou. */
export const POINTS_ANNEAU = 28;
export const POINTS_TROU = 20;

/**
 * Allege un anneau : retire le point de fermeture, puis ne garde qu'un point sur
 * `pas` — le dernier point reste, pour que la forme ne s'ouvre pas.
 *
 * @param {number[][]} ring
 * @param {number} [maxPts]
 * @returns {number[][]}
 */
export function simplifierAnneau(ring, maxPts = POINTS_ANNEAU) {
  if (!ring?.length) return [];
  const ferme = ring.length > 1
    && ring[0][0] === ring[ring.length - 1][0]
    && ring[0][1] === ring[ring.length - 1][1];
  const ouvert = ferme ? ring.slice(0, -1) : ring.slice();
  if (ouvert.length <= maxPts) return ouvert;
  const pas = Math.ceil(ouvert.length / maxPts);
  const out = [];
  for (let i = 0; i < ouvert.length; i += pas) out.push(ouvert[i]);
  const dernier = ouvert[ouvert.length - 1];
  if (out[out.length - 1] !== dernier) out.push(dernier);
  return out;
}

/**
 * Le polygone d'une entite dont l'anneau exterieur est le plus grand (aire
 * signee en degres : seul l'ordre importe), avec ses trous. `null` s'il n'y en a pas.
 *
 * @returns {number[][][]|null} `[exterieur, ...trous]`
 */
export function plusGrandPolygone(feature) {
  const g = feature?.geometry;
  if (!g) return null;
  const polys = g.type === 'Polygon' ? [g.coordinates]
    : g.type === 'MultiPolygon' ? g.coordinates
      : null;
  if (!polys?.length) return null;
  let meilleur = null;
  let aireMax = -1;
  for (const poly of polys) {
    const ext = poly?.[0];
    if (!ext || ext.length < 3) continue;
    let a = 0;
    for (let i = 0; i < ext.length - 1; i++) a += ext[i][0] * ext[i + 1][1] - ext[i + 1][0] * ext[i][1];
    a = Math.abs(a);
    if (a > aireMax) { aireMax = a; meilleur = poly; }
  }
  return meilleur;
}

/**
 * Emprise GeoJSON -> `ExtrudeGeometry` en metres locaux.
 *
 * @param {object} THREE  la bibliotheque (injectee)
 * @param {object} feature
 * @param {number} hauteurM
 * @param {(lng: number, lat: number) => {x: number, y: number}} versLocal
 * @returns {object|null} la geometrie, ou `null` (forme absente, trop pauvre, ou echec three)
 */
export function extruderEntite(THREE, feature, hauteurM, versLocal, avertir = (...a) => console.warn(...a)) {
  if (!feature?.geometry || !(hauteurM > 0)) return null;
  const poly = plusGrandPolygone(feature);
  if (!poly) return null;
  const anneau = simplifierAnneau(poly[0]);
  if (anneau.length < 3) return null;
  const tracer = (chemin, points) => {
    points.forEach((pt, i) => {
      const lm = versLocal(pt[0], pt[1]);
      if (i === 0) chemin.moveTo(lm.x, lm.y);
      else chemin.lineTo(lm.x, lm.y);
    });
    chemin.closePath();
  };
  const forme = new THREE.Shape();
  tracer(forme, anneau);
  // Les trous (cours interieures) : un caster plein ombrerait la cour.
  for (let h = 1; h < poly.length; h++) {
    const trou = simplifierAnneau(poly[h], POINTS_TROU);
    if (trou.length < 3) continue;
    const chemin = new THREE.Path();
    tracer(chemin, trou);
    forme.holes.push(chemin);
  }
  try {
    return new THREE.ExtrudeGeometry(forme, { depth: hauteurM, bevelEnabled: false, curveSegments: 1 });
  } catch (e) {
    avertir('[Atlas] extrusion ombre', e.message);
    return null;
  }
}

/**
 * Tous les casters d'une collecte, fusionnes en UN seul `Mesh` (un appel de rendu).
 *
 * Le materiau n'ecrit ni couleur ni profondeur : le volume n'existe que pour la
 * shadow map. Les AABB alignees sur les axes, essayees d'abord, depassaient ou
 * decalaient du bati : on garde l'emprise exacte.
 *
 * @param {{THREE: object, mergeGeometries: Function}} bib
 * @param {{feature: object, height?: number}[]} items
 * @param {(lng: number, lat: number) => {x: number, y: number}} versLocal
 * @returns {object|null} le `Mesh`, ou `null` si aucune emprise n'a donne de volume
 */
export function creerCasters({ THREE, mergeGeometries }, items, versLocal) {
  const geoms = [];
  for (const it of items || []) {
    const geom = extruderEntite(THREE, it.feature, Math.max(it.height || 8, 2), versLocal);
    if (!geom) continue;
    // Forme XY = est/nord, +Z = hauteur -> Y haut, Z = -nord.
    geom.rotateX(-Math.PI / 2);
    geoms.push(geom);
  }
  if (!geoms.length) return null;
  const fusion = geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
  if (geoms.length > 1) geoms.forEach((g) => g.dispose?.());
  if (!fusion) return null;
  const materiau = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
    shadowSide: THREE.DoubleSide,
    colorWrite: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(fusion, materiau);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  return mesh;
}

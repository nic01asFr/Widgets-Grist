/**
 * Façades éclairées par les luminaires — ce qui se calcule sans three.js
 * (point P4 de la vérification du 24/09/2026, passe « réalisme et
 * performance »).
 *
 * Le bâti MapLibre (fill-extrusion, du fond ou d'une couche Atlas) ne reçoit
 * pas la lumière de three.js. Le prototype du 24/09/2026 recopiait **tous**
 * les volumes (1 243 bâtiments, 12 508 triangles) avec un matériau qui ne voit
 * que les spots : −23 % d'images/s, et seulement pour les couches Atlas. Ici,
 * la copie est **bornée** :
 *
 * - seulement les **murs** (pas les toits : une lampe de rue ne les éclaire
 *   pas), décalés de 10 cm vers l'extérieur (au ras du mur, le test de
 *   profondeur les masque — mesuré alors : 2 602 px à 0 cm, 8 008 à +10 cm) ;
 * - seulement les bâtiments à moins de `rayon` d'une source à vraie lumière
 *   (≈ 3 × hauteur de feu) ;
 * - hauteurs lues **comme MapLibre les lit** : `render_height` /
 *   `render_min_height` des tuiles vectorielles du fond (OpenMapTiles), ou la
 *   hauteur de la couche Atlas, avec le plancher de MapLibre (≥ 0,5 m ici,
 *   pas de 12 m inventés pour un bâtiment sans hauteur).
 */

export const VERSION = '0.1.0';

/** Décalage des murs recopiés vers l'extérieur, en mètres. */
export const DECALAGE_M = 0.1;

/**
 * Hauteur et base d'un bâtiment, lues comme le style Liberty/OpenMapTiles les
 * donne à MapLibre (`fill-extrusion-height: render_height`,
 * `fill-extrusion-base: render_min_height`). Sans hauteur lisible : `null`
 * (pas de mur inventé).
 * @param {object} props
 * @returns {{ base: number, haut: number } | null}
 */
export function hauteursBatiment(props) {
  const n = (v) => {
    const x = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(x) ? x : null;
  };
  const haut = n(props?.render_height) ?? n(props?.height) ?? n(props?.hauteur);
  if (haut == null) return null;
  const base = Math.max(0, n(props?.render_min_height) ?? n(props?.min_height) ?? 0);
  const h = Math.max(haut, 0.5);
  if (!(h > base)) return null;
  return { base, haut: h };
}

/**
 * Les anneaux extérieurs d'une géométrie GeoJSON (Polygon, MultiPolygon), en
 * [lng, lat]. Les trous ne portent pas de façade visible de la rue.
 */
export function anneauxExterieurs(geometrie) {
  if (!geometrie) return [];
  if (geometrie.type === 'Polygon') return geometrie.coordinates?.[0] ? [geometrie.coordinates[0]] : [];
  if (geometrie.type === 'MultiPolygon') return (geometrie.coordinates || []).map((p) => p?.[0]).filter(Boolean);
  return [];
}

/**
 * Les bâtiments dont un mur est à moins de `rayon` mètres (à plat) d'une
 * des `sources` (repère local : x est, z sud). `versLocal(lng, lat)` → {x, z}.
 * Dédoublonnés par identifiant (une même entité revient dans plusieurs tuiles).
 * @param {{ id?: any, geometry: object, properties: object }[]} batiments
 * @param {{ x: number, z: number }[]} sources
 * @param {number} rayon
 * @param {(lng: number, lat: number) => { x: number, z: number }} versLocal
 * @returns {{ id: any, anneaux: {x:number,z:number}[][], base: number, haut: number }[]}
 */
export function batimentsProches(batiments, sources, rayon, versLocal) {
  const out = [];
  if (!sources?.length) return out;
  const vus = new Set();
  const r2 = rayon * rayon;
  for (const f of batiments || []) {
    const h = hauteursBatiment(f?.properties);
    if (!h) continue;
    const anneaux = anneauxExterieurs(f.geometry).map((a) => a.map(([lng, lat]) => versLocal(lng, lat)));
    if (!anneaux.length) continue;
    const cle = f.id != null ? `id:${f.id}` : `g:${anneaux[0][0].x.toFixed(1)},${anneaux[0][0].z.toFixed(1)}:${h.haut}`;
    if (vus.has(cle)) continue;
    let proche = false;
    for (const a of anneaux) {
      for (let i = 0; i < a.length && !proche; i++) {
        const p = a[i];
        const q = a[(i + 1) % a.length];
        for (const s of sources) {
          if (distance2Segment(s, p, q) <= r2) { proche = true; break; }
        }
      }
      if (proche) break;
    }
    if (!proche) continue;
    vus.add(cle);
    out.push({ id: f.id ?? cle, anneaux, ...h });
  }
  return out;
}

/**
 * Les murs de ces bâtiments en triangles : positions et normales (sortantes,
 * horizontales), décalés de `decalage` vers l'extérieur. Le sens de l'anneau
 * (aire signée) dit où est l'extérieur. `sol(x, z)` : cote du pied (0 à plat).
 * `pres` : ne garder que les murs dont l'arête passe à moins de `rayon` d'une
 * des `sources` — un îlot fusionné du fond peut compter des milliers d'arêtes
 * (mesuré au Jarret : un seul bâtiment « proche », 32 000 arêtes).
 * @param {{ sources: {x:number,z:number}[], rayon: number }} [pres]
 * @returns {{ positions: Float32Array, normales: Float32Array, triangles: number }}
 */
export function geometrieMurs(batiments, decalage = DECALAGE_M, sol = () => 0, pres = null) {
  const r2 = pres ? pres.rayon * pres.rayon : 0;
  const assezPres = (p, q) => {
    if (!pres) return true;
    for (const s of pres.sources) if (distance2Segment(s, p, q) <= r2) return true;
    return false;
  };
  const pos = [];
  const nor = [];
  for (const b of batiments) {
    for (const a of b.anneaux) {
      const n = a.length;
      if (n < 3) continue;
      // Aire signée dans le plan (x, z) ; z = sud, donc repère indirect vu du
      // dessus : on n'en garde que le signe pour orienter les normales.
      let aire = 0;
      for (let i = 0; i < n; i++) {
        const p = a[i];
        const q = a[(i + 1) % n];
        aire += p.x * q.z - q.x * p.z;
      }
      const sens = aire >= 0 ? 1 : -1;
      for (let i = 0; i < n; i++) {
        const p = a[i];
        const q = a[(i + 1) % n];
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        const l = Math.hypot(dx, dz);
        if (l < 0.05 || !assezPres(p, q)) continue;
        // Normale extérieure : perpendiculaire à l'arête, du côté opposé à
        // l'intérieur (qui est à gauche pour une aire positive dans ce repère).
        const nx = (-dz / l) * -sens;
        const nz = (dx / l) * -sens;
        const ox = nx * decalage;
        const oz = nz * decalage;
        const s0 = sol(p.x, p.z);
        const s1 = sol(q.x, q.z);
        const p0 = [p.x + ox, s0 + b.base, p.z + oz];
        const p1 = [q.x + ox, s1 + b.base, q.z + oz];
        const p2 = [q.x + ox, s1 + b.haut, q.z + oz];
        const p3 = [p.x + ox, s0 + b.haut, p.z + oz];
        for (const v of [p0, p1, p2, p0, p2, p3]) { pos.push(v[0], v[1], v[2]); nor.push(nx, 0, nz); }
      }
    }
  }
  return { positions: new Float32Array(pos), normales: new Float32Array(nor), triangles: pos.length / 9 };
}

/** Carré de la distance (plan x, z) du point `s` au segment [p, q]. */
export function distance2Segment(s, p, q) {
  const dx = q.x - p.x;
  const dz = q.z - p.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((s.x - p.x) * dx + (s.z - p.z) * dz) / l2)) : 0;
  const x = p.x + t * dx - s.x;
  const z = p.z + t * dz - s.z;
  return x * x + z * z;
}

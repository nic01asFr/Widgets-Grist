/**
 * Le relief de l'export 3D (`exportScene3D`, option `relief`) : une fonction d'altitude lue dans les tuiles « terrarium » (AWS Terrain Tiles, sans clé), INDÉPENDANTE du relief affiché
 * à l'écran (qui peut être éteint, exagéré ou d'une autre source). Aucun accès au réseau ici : la lecture d'une tuile est passée en paramètre (`lire`), ce qui rend le module testable.
 */
export const RELIEF_EXAGERATION_DEFAUT = 1;
export const RELIEF_ZOOM_MAX = 14;       // la résolution native de terrarium (environ 7 à 10 m au sol sous nos latitudes)
export const RELIEF_TUILES_MAX = 16;     // au plus 16 tuiles lues : au-delà, le zoom baisse (emprise vaste)
export const RELIEF_COTE_MAX = 220;      // sommets par côté de la grille du terrain
export const RELIEF_PAS_MIN = 1;
export const RELIEF_PAS_MAX = 500;
export const RELIEF_EXAGERATION_MIN = 0.5;
export const RELIEF_EXAGERATION_MAX = 5;
export const RELIEF_ATTRIBUTION = Object.freeze({ source: 'Relief : Mapzen / AWS Terrain Tiles', url: 'https://registry.opendata.aws/terrain-tiles/' });
export const URL_TUILE_TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const fini = (v) => typeof v === 'number' && Number.isFinite(v);
const LAT_MAX = 85.0511287798;

/**
 * L'option `relief` : absente ou `false` : pas de relief (sol et objets à plat). `true` : relief réel. Objet : `{ exageration?: 0,5 à 5 (1 par défaut), pas?: 1 à 500 mètres }`
 * (`pas` : la maille de la grille du terrain ; par défaut, calculée pour tenir en 160 mailles environ sur le grand côté, sans descendre sous 4 m).
 * @returns {{ exageration: number, pas: number|null }|null}
 */
export function normaliserRelief(r) {
  if (r === undefined || r === null || r === false) return null;
  const o = r === true ? {} : r;
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('exportScene3D : relief doit être vrai ou un objet ({ exageration, pas })');
  for (const k of Object.keys(o)) if (!['exageration', 'pas'].includes(k)) throw new Error('exportScene3D : relief.' + k + ' inconnu (exageration, pas)');
  const exageration = o.exageration === undefined ? RELIEF_EXAGERATION_DEFAUT : o.exageration;
  if (!fini(exageration) || exageration < RELIEF_EXAGERATION_MIN || exageration > RELIEF_EXAGERATION_MAX) throw new Error('exportScene3D : relief.exageration hors bornes (' + RELIEF_EXAGERATION_MIN + ' à ' + RELIEF_EXAGERATION_MAX + ')');
  const pas = o.pas === undefined ? null : o.pas;
  if (pas !== null && (!fini(pas) || pas < RELIEF_PAS_MIN || pas > RELIEF_PAS_MAX)) throw new Error('exportScene3D : relief.pas hors bornes (' + RELIEF_PAS_MIN + ' à ' + RELIEF_PAS_MAX + ' mètres)');
  return { exageration, pas };
}

/** Une altitude (mètres) depuis un pixel terrarium. */
export const decoderTerrarium = (r, g, b) => r * 256 + g + b / 256 - 32768;

/** La coordonnée de tuile (fractionnaire) d'un point au zoom `z`. */
export function coordTuile(lng, lat, z) {
  const n = 2 ** z, phi = (Math.max(-LAT_MAX, Math.min(LAT_MAX, lat)) * Math.PI) / 180;
  return { x: ((lng + 180) / 360) * n, y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n };
}

/** Le zoom (14 au plus) et le bloc de tuiles qui couvrent une emprise, sans dépasser `RELIEF_TUILES_MAX` tuiles. */
export function zoomEtTuiles(bbox) {
  for (let z = RELIEF_ZOOM_MAX; z >= 0; z--) {
    const a = coordTuile(bbox[0], bbox[3], z), b = coordTuile(bbox[2], bbox[1], z);
    const n = 2 ** z, x0 = Math.max(0, Math.floor(a.x)), x1 = Math.min(n - 1, Math.floor(b.x)), y0 = Math.max(0, Math.floor(a.y)), y1 = Math.min(n - 1, Math.floor(b.y));
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= RELIEF_TUILES_MAX) return { z, x0, x1, y0, y1 };
  }
  return { z: 0, x0: 0, x1: 0, y0: 0, y1: 0 };
}

/**
 * Lit les tuiles de l'emprise et rend la fonction d'altitude (mètres au-dessus du niveau de la mer, interpolation bilinéaire au centre des pixels).
 * @param {number[]} bbox  [ouest, sud, est, nord]
 * @param {(z:number, x:number, y:number) => Promise<{ data: Uint8ClampedArray, width: number, height: number }>} lire  la tuile décodée en RGBA
 * @returns {Promise<{ altitude: (lng:number, lat:number) => number, zoom: number, tuiles: number, min: number, max: number }>}
 */
export async function chargerRelief(bbox, lire) {
  const { z, x0, x1, y0, y1 } = zoomEtTuiles(bbox);
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1;
  const lectures = [];
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) lectures.push(lire(z, tx, ty).then((img) => ({ tx, ty, img })));
  const images = await Promise.all(lectures);
  const T = images[0].img.width, W = nx * T, H = ny * T;
  const alt = new Float32Array(W * H);
  let min = Infinity, max = -Infinity;
  for (const { tx, ty, img } of images) {
    if (img.width !== T || img.height !== T) throw new Error('relief : tuiles de tailles différentes');
    const d = img.data;
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
      const k = 4 * (j * T + i), h = decoderTerrarium(d[k], d[k + 1], d[k + 2]);
      alt[((ty - y0) * T + j) * W + (tx - x0) * T + i] = h;
      if (h < min) min = h; if (h > max) max = h;
    }
  }
  const altitude = (lng, lat) => {
    const c = coordTuile(lng, lat, z);
    const fx = Math.max(0, Math.min(W - 1, (c.x - x0) * T - 0.5)), fy = Math.max(0, Math.min(H - 1, (c.y - y0) * T - 0.5));
    const i = Math.min(W - 2, Math.floor(fx)), j = Math.min(H - 2, Math.floor(fy)), u = fx - i, v = fy - j;
    const a = alt[j * W + i], b = alt[j * W + i + 1], c2 = alt[(j + 1) * W + i], d2 = alt[(j + 1) * W + i + 1];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c2 * (1 - u) * v + d2 * u * v;
  };
  return { altitude, zoom: z, tuiles: images.length, min, max };
}

/** Marge (mètres) autour d'une emprise, en degrés : l'emprise du terrain d'un sol à marge. */
export function elargir(bbox, marge) {
  if (!(marge > 0)) return [...bbox];
  const lat = (bbox[1] + bbox[3]) / 2, dLat = marge / 111320, dLng = marge / (111320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return [bbox[0] - dLng, bbox[1] - dLat, bbox[2] + dLng, bbox[3] + dLat];
}

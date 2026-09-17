/**
 * Les arbres autour de la cascade, relevés dans le LiDAR HD de l'IGN.
 *
 * Le relevé photogrammétrique de la cascade était posé sur une carte vide : pas
 * de sol à sa mesure, pas de végétation, alors que la cascade est sous une
 * canopée de 7 à 25 m (mesuré). Plutôt qu'un décor inventé, on lit la
 * végétation réelle :
 *
 *   hauteur de sursol = MNS − MNT  (grilles LiDAR HD à 0,5 m, WMS-R Géoplateforme)
 *
 * Un arbre est un **sommet local** de cette hauteur : plus haut que tout ce qui
 * l'entoure dans un rayon proportionnel à sa taille. Chaque sommet devient un
 * point portant sa hauteur mesurée ; Atlas y pose le modèle « feuillu » du
 * catalogue à l'échelle `hauteur / 5,9 m` (hauteur du modèle).
 *
 * Ce que le script écarte, parce que le sursol n'y est pas de la végétation :
 * le bâti OSM (un toit est un sommet), et les abords de l'autoroute et des voies
 * ferrées (un viaduc est un sommet de 20 m au-dessus du vallon).
 *
 * Ce que le résultat n'est pas : un inventaire. L'essence est inconnue, deux
 * houppiers jointifs peuvent ne donner qu'un sommet, et un arbre sous un plus
 * grand peut manquer. La couche le dit dans sa fiche.
 *
 * Aucune dépendance : le WMS-R sert aussi du `image/x-bil;bits=32` (float32
 * petit-boutiste, lignes du nord au sud — vérifié contre le GeoTIFF), et la
 * conversion Lambert-93 → WGS84 est l'algorithme publié par l'IGN.
 *
 *   node build-arbres-lidar.mjs   → arbres-lidar.geojson
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lire = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, n), 'utf8'));

/* ------------------------------------------------ Lambert-93 <-> WGS84 (IGN) */

const L93 = { n: 0.7256077650532670, c: 11754255.426096, xs: 700000, ys: 12655612.049876, lon0: 3 * Math.PI / 180, e: 0.0818191910428158 };

function versL93(lon, lat) {
  const { n, c, xs, ys, lon0, e } = L93;
  const phi = lat * Math.PI / 180;
  const L = Math.log(Math.tan(Math.PI / 4 + phi / 2) * ((1 - e * Math.sin(phi)) / (1 + e * Math.sin(phi))) ** (e / 2));
  const r = c * Math.exp(-n * L);
  const g = n * (lon * Math.PI / 180 - lon0);
  return [xs + r * Math.sin(g), ys - r * Math.cos(g)];
}

function depuisL93(x, y) {
  const { n, c, xs, ys, lon0, e } = L93;
  const dx = x - xs;
  const dy = y - ys;
  const r = Math.hypot(dx, dy);
  const g = Math.atan(dx / -dy);
  const lon = lon0 + g / n;
  const Liso = -Math.log(r / c) / n;
  let phi = 2 * Math.atan(Math.exp(Liso)) - Math.PI / 2;
  for (let i = 0; i < 12; i++) {
    phi = 2 * Math.atan(((1 + e * Math.sin(phi)) / (1 - e * Math.sin(phi))) ** (e / 2) * Math.exp(Liso)) - Math.PI / 2;
  }
  return [lon * 180 / Math.PI, phi * 180 / Math.PI];
}

/* ----------------------------------------------------------------- emprise */

const { cascade } = lire('_bbox.json');
/** Demi-côté de l'emprise, en mètres : le vallon boisé autour de la cascade. */
const DEMI = 180;
const PAS = 0.5;
const [cx, cy] = versL93(cascade[0], cascade[1]).map((v) => Math.round(v * 2) / 2);
const [x0, y0, x1, y1] = [cx - DEMI, cy - DEMI, cx + DEMI, cy + DEMI];
const W = Math.round((x1 - x0) / PAS);
const H = Math.round((y1 - y0) / PAS);

async function grille(couche) {
  const url = 'https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap'
    + `&LAYERS=IGNF_LIDAR-HD_${couche}_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93`
    + '&FORMAT=image/x-bil;bits=32&STYLES=&CRS=EPSG:2154'
    + `&BBOX=${x0},${y0},${x1},${y1}&WIDTH=${W}&HEIGHT=${H}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${couche} : HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length !== W * H * 4) throw new Error(`${couche} : ${buf.length} octets, ${W * H * 4} attendus`);
  const out = new Float32Array(W * H);
  for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
}

/* ------------------------------------------------------------ exclusions -- */

/** Coordonnées locales en mètres (Lambert-93), pour les tests géométriques. */
const enL93 = (ring) => ring.map(([lon, lat]) => versL93(lon, lat));

function dansAnneau(px, py, ring) {
  let dedans = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

function distSegment(px, py, [ax, ay], [bx, by]) {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

const dansEmprise = (pts) => pts.some(([x, y]) => x > x0 - 50 && x < x1 + 50 && y > y0 - 50 && y < y1 + 50);

const toits = [];
for (const f of lire('bati.geojson').features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const p of polys) {
    const ext = enL93(p[0]);
    if (dansEmprise(ext)) toits.push(ext);
  }
}

/** Largeur écartée de part et d'autre de l'axe, en mètres. */
const LARGEUR = { Autoroute: 18, 'Voie principale': 7 };
const axes = [];
const ajouterAxes = (fc, largeur) => {
  for (const f of fc.features) {
    const w = largeur(f);
    if (!w) continue;
    const lignes = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const l of lignes) {
      const pts = enL93(l);
      if (dansEmprise(pts)) axes.push({ pts, w });
    }
  }
};
ajouterAxes(lire('voirie.geojson'), (f) => LARGEUR[f.properties.rang] || 0);
ajouterAxes(lire('rail.geojson'), () => 9);

/**
 * Le volume du relevé de la cascade : 6,5 m de rayon mesuré dans la scène, plus
 * une marge. Un sommet y tomberait DANS le modèle, et le masquerait entièrement
 * — ce qui est arrivé à la première extraction.
 */
const RAYON_RELEVE = 8;

function surInfrastructure(x, y) {
  if (Math.hypot(x - cx, y - cy) < RAYON_RELEVE) return true;
  for (const t of toits) if (dansAnneau(x, y, t)) return true;
  for (const { pts, w } of axes) {
    for (let i = 1; i < pts.length; i++) if (distSegment(x, y, pts[i - 1], pts[i]) < w) return true;
  }
  return false;
}

/* --------------------------------------------------------------- sommets -- */

const [mnt, mns] = await Promise.all([grille('MNT'), grille('MNS')]);
const sursol = new Float32Array(W * H);
for (let i = 0; i < sursol.length; i++) {
  const h = mns[i] - mnt[i];
  sursol[i] = Number.isFinite(h) && mnt[i] > -100 && mns[i] > -100 ? h : 0;
}

/** Lissage 3×3 : le MNS à 0,5 m est bruité, un houppier donnerait plusieurs sommets. */
const lisse = new Float32Array(W * H);
for (let j = 1; j < H - 1; j++) {
  for (let i = 1; i < W - 1; i++) {
    let s = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) s += sursol[(j + dj) * W + i + di];
    lisse[j * W + i] = s / 9;
  }
}

const HAUTEUR_MIN = 4;
const HAUTEUR_MAX = 32;
const HAUTEUR_MODELE = 5.9; // catalog.json, tree_deciduous.heightMeters

const arbres = [];
for (let j = 8; j < H - 8; j++) {
  for (let i = 8; i < W - 8; i++) {
    const h = lisse[j * W + i];
    if (h < HAUTEUR_MIN || h > HAUTEUR_MAX) continue;
    // Rayon de houppier grossièrement proportionnel à la hauteur : un arbre de
    // 20 m ne porte pas deux sommets à 2 m l'un de l'autre.
    const rayonPx = Math.round(Math.min(4, Math.max(1.5, h * 0.18)) / PAS);
    let sommet = true;
    for (let dj = -rayonPx; dj <= rayonPx && sommet; dj++) {
      for (let di = -rayonPx; di <= rayonPx; di++) {
        if ((di || dj) && di * di + dj * dj <= rayonPx * rayonPx) {
          const v = lisse[(j + dj) * W + i + di];
          // Égalité départagée par l'ordre de parcours : un plateau ne donne qu'un sommet.
          if (v > h || (v === h && (dj < 0 || (dj === 0 && di < 0)))) { sommet = false; break; }
        }
      }
    }
    if (!sommet) continue;
    const x = x0 + (i + 0.5) * PAS;
    const y = y1 - (j + 0.5) * PAS;
    if (surInfrastructure(x, y)) continue;
    arbres.push({ x, y, h });
  }
}

/** Rotation stable d'une extraction à l'autre : dérivée de la position, pas du hasard. */
const rotation = (x, y) => Math.round((Math.abs(Math.sin(x * 12.9898 + y * 78.233)) * 43758.5453) % 360);

const features = arbres.map(({ x, y, h }) => {
  const [lon, lat] = depuisL93(x, y);
  const hauteur = Math.round(h * 10) / 10;
  return {
    type: 'Feature',
    properties: {
      type: 'Arbre (LiDAR)',
      hauteur_m: hauteur,
      source: 'LiDAR HD IGN — sommet local du MNH (MNS − MNT)',
      _modelId: 'tree_deciduous',
      _scale: Math.round((hauteur / HAUTEUR_MODELE) * 100) / 100,
      _rotationZ: rotation(x, y),
    },
    geometry: { type: 'Point', coordinates: [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7] },
  };
});

fs.writeFileSync(path.join(__dirname, 'arbres-lidar.geojson'), JSON.stringify({ type: 'FeatureCollection', features }));

const hauteurs = features.map((f) => f.properties.hauteur_m).sort((a, b) => a - b);
console.log(JSON.stringify({
  emprise_m: `${DEMI * 2} × ${DEMI * 2}`,
  grille: `${W} × ${H} à ${PAS} m`,
  toitsEcartes: toits.length,
  axesEcartes: axes.length,
  arbres: features.length,
  hauteur: hauteurs.length ? { min: hauteurs[0], mediane: hauteurs[hauteurs.length >> 1], max: hauteurs[hauteurs.length - 1] } : null,
  sortie: 'arbres-lidar.geojson',
}, null, 2));

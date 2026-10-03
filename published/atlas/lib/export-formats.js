/**
 * Sortir des données d'Atlas dans les formats que les autres outils lisent.
 *
 * Module pur : des couches (`{ name, geojson }`) en entrée, du texte en sortie. Le navigateur, lui, fabrique le fichier et
 * le propose au téléchargement.
 *
 * Quatre formats d'échange, choisis pour ce que l'on en fait :
 * - **GeoJSON** : la référence ; QGIS, Grist (qgis2grist), la plupart des outils web ;
 * - **CSV** : le tableur ; les attributs, et la géométrie en WKT dans une colonne (Grist, QGIS et Excel la relisent) ;
 * - **KML** : Google Earth, QGIS, les applications de carte grand public ;
 * - **GPX** : les GPS et les applications de randonnée — points d'intérêt et traces seulement (un polygone n'y a pas de sens).
 *
 * Aucun ne porte le style : c'est le rôle du projet Atlas (`.json`), qui recharge couches et réglages.
 */
import { ecrireWkt } from './wkt.js';

export const VERSION = '1.0.0';

/** Un nom de fichier sûr : lettres, chiffres, tirets. */
export function nomDeFichier(base, extension) {
  const propre = String(base || 'atlas').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'atlas';
  return `${propre}.${extension}`;
}

const entites = (couche) => (couche?.geojson?.features || []).filter((f) => f?.geometry);

/** Les propriétés qui parlent à une personne : ni colonnes internes (`_…`), ni objets imbriqués illisibles. */
function proprietesLisibles(props) {
  const out = {};
  for (const [k, v] of Object.entries(props || {})) {
    if (k.startsWith('_') || v === undefined || v === null) continue;
    out[k] = typeof v === 'object' ? JSON.stringify(v) : v;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* GeoJSON                                                             */
/* ------------------------------------------------------------------ */

/** Un seul GeoJSON ; chaque entité garde la couche d'origine dans `layer`, sans quoi les couches se confondent. */
export function versGeoJSON(couches) {
  const features = [];
  for (const c of couches || []) {
    for (const f of entites(c)) {
      features.push({
        type: 'Feature',
        geometry: f.geometry,
        properties: { ...(f.properties || {}), ...((couches.length > 1 && !(f.properties || {}).layer) ? { layer: c.name } : {}) },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

const cellule = (v) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Un CSV : une ligne par entité, les propriétés en colonnes, la géométrie en WKT (`geometrie`), la couche en tête quand
 * on en exporte plusieurs. Séparateur `,` (RFC 4180) ; l'appelant ajoute le BOM que demande Excel pour les accents.
 */
export function versCsv(couches) {
  const lignes = [];
  const cles = [];
  const vu = new Set();
  const plusieurs = (couches || []).length > 1;
  for (const c of couches || []) {
    for (const f of entites(c)) {
      const p = proprietesLisibles(f.properties);
      for (const k of Object.keys(p)) if (!vu.has(k)) { vu.add(k); cles.push(k); }
      lignes.push({ couche: c.name, p, wkt: ecrireWkt(f.geometry) || '' });
    }
  }
  const entete = [...(plusieurs ? ['couche'] : []), ...cles, 'geometrie'];
  const corps = lignes.map((l) => [...(plusieurs ? [l.couche] : []), ...cles.map((k) => l.p[k]), l.wkt].map(cellule).join(','));
  return [entete.map(cellule).join(','), ...corps].join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------------ */
/* XML (KML, GPX)                                                      */
/* ------------------------------------------------------------------ */

const xml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

const CLES_NOM = ['name', 'nom', 'Nom', 'NOM', 'title', 'titre', 'label', 'libelle'];
/** Le nom d'une entité, d'après les champs que l'on nomme d'ordinaire ainsi ; sinon vide. */
export function nomEntite(props) {
  for (const k of CLES_NOM) if (props?.[k] !== undefined && props[k] !== null && String(props[k]).trim()) return String(props[k]).trim();
  return '';
}

const coord = (p) => (p.length > 2 && Number.isFinite(p[2]) ? `${p[0]},${p[1]},${p[2]}` : `${p[0]},${p[1]}`);
const coords = (ligne) => ligne.map(coord).join(' ');

function geometrieKml(g) {
  if (!g?.type) return '';
  const c = g.coordinates;
  const polygone = (rings) => `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coords(rings[0])}</coordinates></LinearRing></outerBoundaryIs>${
    rings.slice(1).map((r) => `<innerBoundaryIs><LinearRing><coordinates>${coords(r)}</coordinates></LinearRing></innerBoundaryIs>`).join('')}</Polygon>`;
  switch (g.type) {
    case 'Point': return `<Point><coordinates>${coord(c)}</coordinates></Point>`;
    case 'LineString': return `<LineString><coordinates>${coords(c)}</coordinates></LineString>`;
    case 'Polygon': return polygone(c);
    case 'MultiPoint': return `<MultiGeometry>${c.map((p) => `<Point><coordinates>${coord(p)}</coordinates></Point>`).join('')}</MultiGeometry>`;
    case 'MultiLineString': return `<MultiGeometry>${c.map((l) => `<LineString><coordinates>${coords(l)}</coordinates></LineString>`).join('')}</MultiGeometry>`;
    case 'MultiPolygon': return `<MultiGeometry>${c.map(polygone).join('')}</MultiGeometry>`;
    default: return '';
  }
}

/** Un KML : un dossier par couche, un repère par entité, les attributs en données étendues. */
export function versKml(couches, nom = 'Atlas') {
  const dossiers = (couches || []).map((c) => {
    const reperes = entites(c).map((f, i) => {
      const p = proprietesLisibles(f.properties);
      const donnees = Object.entries(p).map(([k, v]) => `<Data name="${xml(k)}"><value>${xml(v)}</value></Data>`).join('');
      return `<Placemark><name>${xml(nomEntite(f.properties) || `${c.name} ${i + 1}`)}</name>${donnees ? `<ExtendedData>${donnees}</ExtendedData>` : ''}${geometrieKml(f.geometry)}</Placemark>`;
    }).join('');
    return `<Folder><name>${xml(c.name)}</name>${reperes}</Folder>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(nom)}</name>${dossiers}</Document></kml>\n`;
}

/**
 * Un GPX : les points deviennent des points de passage (`wpt`), les lignes des traces (`trk`). Un polygone n'a pas de
 * sens pour un GPS : il est écarté, et compté dans `ignorees` pour que l'appelant le dise.
 *
 * @returns {{ xml: string, ignorees: number, retenues: number }}
 */
export function versGpx(couches, nom = 'Atlas') {
  let ignorees = 0;
  let retenues = 0;
  const morceaux = [];
  const wpt = (p, f, c, i) => {
    const titre = nomEntite(f.properties) || `${c.name} ${i + 1}`;
    const desc = Object.entries(proprietesLisibles(f.properties)).slice(0, 12).map(([k, v]) => `${k} : ${v}`).join(' ; ');
    return `<wpt lat="${p[1]}" lon="${p[0]}">${p.length > 2 && Number.isFinite(p[2]) ? `<ele>${p[2]}</ele>` : ''}<name>${xml(titre)}</name>${desc ? `<desc>${xml(desc)}</desc>` : ''}</wpt>`;
  };
  const trkpt = (p) => `<trkpt lat="${p[1]}" lon="${p[0]}">${p.length > 2 && Number.isFinite(p[2]) ? `<ele>${p[2]}</ele>` : ''}</trkpt>`;
  for (const c of couches || []) {
    entites(c).forEach((f, i) => {
      const g = f.geometry;
      if (g.type === 'Point') { morceaux.push(wpt(g.coordinates, f, c, i)); retenues++; }
      else if (g.type === 'MultiPoint') { g.coordinates.forEach((p) => morceaux.push(wpt(p, f, c, i))); retenues++; }
      else if (g.type === 'LineString' || g.type === 'MultiLineString') {
        const segments = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
        const titre = nomEntite(f.properties) || `${c.name} ${i + 1}`;
        morceaux.push(`<trk><name>${xml(titre)}</name>${segments.map((s) => `<trkseg>${s.map(trkpt).join('')}</trkseg>`).join('')}</trk>`);
        retenues++;
      } else ignorees++;
    });
  }
  // Les points d'abord, les traces ensuite : l'ordre que le format demande.
  const points = morceaux.filter((m) => m.startsWith('<wpt'));
  const traces = morceaux.filter((m) => m.startsWith('<trk'));
  const texte = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Atlas" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${xml(nom)}</name></metadata>${points.join('')}${traces.join('')}</gpx>\n`;
  return { xml: texte, ignorees, retenues };
}

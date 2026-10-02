/**
 * Ouvrir ce que les autres outils produisent : GPX, KML, CSV.
 *
 * Le pendant de `lib/export-formats.js`. Module pur : du texte en entrée, des couches GeoJSON en sortie, aucune dépendance au
 * navigateur — un petit lecteur XML suffit à ces deux formats, et se vérifie sans DOM.
 *
 * - **GPX** : les points de passage (`wpt`) font une couche, les traces et itinéraires (`trk`, `rte`) une autre.
 * - **KML** : un dossier devient une couche ; une couche d'Atlas n'ayant qu'un genre de géométrie, un dossier qui mêle points,
 *   lignes et surfaces est scindé par genre.
 * - **CSV** : une colonne de géométrie en WKT (`geometrie`, `wkt`, `geom`…), sinon deux colonnes de coordonnées (`lat` /
 *   `lon`, virgule décimale admise). Sans l'une ni l'autre, le fichier n'a rien à montrer sur une carte : on le dit.
 *
 * Tout est en WGS 84 (longitude, latitude) : c'est ce que ces formats portent. Un CSV en Lambert 93 s'y reconnaît à ses
 * coordonnées hors d'une plage de degrés, et est refusé plutôt que posé au milieu de l'océan.
 */
import { lireWkt } from './wkt.js';

export const VERSION = '1.0.0';

/* ------------------------------------------------------------------ */
/* Un petit lecteur XML                                                */
/* ------------------------------------------------------------------ */

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decoder = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') {
    const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  }
  return ENTITES[e.toLowerCase()] ?? m;
});
const sansPrefixe = (nom) => nom.replace(/^[^:]+:/, '');

/**
 * XML → arbre `{ nom, attrs, enfants, texte }` (noms sans préfixe d'espace de noms). `null` si le texte n'est pas un XML
 * équilibré : un fichier tronqué ne donne pas une moitié de carte sans rien dire.
 */
export function analyserXml(source) {
  const s = String(source || '').replace(/^﻿/, '');
  const racine = { nom: '#racine', attrs: {}, enfants: [], texte: '' };
  const pile = [racine];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/\s*([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(s))) {
    const courant = pile[pile.length - 1];
    if (m[1] !== undefined) courant.texte += m[1];
    else if (m[2] !== undefined) {
      if (pile.length < 2 || sansPrefixe(m[2]) !== courant.nom) return null;
      pile.pop();
    } else if (m[3] !== undefined) {
      const attrs = {};
      for (const a of m[4].matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[sansPrefixe(a[1])] = decoder(a[3] ?? a[4]);
      const el = { nom: sansPrefixe(m[3]), attrs, enfants: [], texte: '' };
      courant.enfants.push(el);
      if (!m[5]) pile.push(el);
    } else if (m[6] !== undefined) courant.texte += decoder(m[6]);
  }
  return pile.length === 1 ? racine : null;
}

const enfants = (el, nom) => (el?.enfants || []).filter((e) => e.nom === nom);
const premier = (el, nom) => enfants(el, nom)[0] || null;
const texte = (el) => (el ? el.texte.trim() : '');
function descendants(el, nom, out = []) {
  for (const e of el?.enfants || []) { if (e.nom === nom) out.push(e); descendants(e, nom, out); }
  return out;
}

const nombre = (v) => {
  const s = String(v ?? '').trim();
  if (s === '') return null;   // une absence n'est pas zéro : sans cela, une trace sans altitude serait posée à 0 m
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const dansLesDegres = (lng, lat) => lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;

/* ------------------------------------------------------------------ */
/* GPX                                                                 */
/* ------------------------------------------------------------------ */

function positionGpx(el) {
  const lat = nombre(el.attrs.lat);
  const lng = nombre(el.attrs.lon);
  if (lat === null || lng === null || !dansLesDegres(lng, lat)) return null;
  const ele = nombre(texte(premier(el, 'ele')));
  return ele === null ? [lng, lat] : [lng, lat, ele];
}

function proprietesGpx(el, extra = {}) {
  const p = { ...extra };
  for (const k of ['name', 'desc', 'cmt', 'src', 'type', 'time', 'sym']) {
    const v = texte(premier(el, k));
    if (v) p[k === 'name' ? 'name' : k] = v;
  }
  const ele = nombre(texte(premier(el, 'ele')));
  if (ele !== null && el.nom === 'wpt') p.ele = ele;
  return p;
}

/**
 * @returns {{ couches: Array<{nom: string, geojson: object}>, ignorees: number }}
 *   `ignorees` : positions illisibles ou hors des degrés, écartées
 */
export function lireGpx(source, nom = 'GPX') {
  const arbre = analyserXml(source);
  const gpx = arbre && premier(arbre, 'gpx');
  if (!gpx) throw new Error('Ce fichier n’est pas un GPX lisible.');
  let ignorees = 0;
  const points = [];
  for (const w of enfants(gpx, 'wpt')) {
    const pos = positionGpx(w);
    if (!pos) { ignorees++; continue; }
    points.push({ type: 'Feature', geometry: { type: 'Point', coordinates: pos }, properties: proprietesGpx(w) });
  }
  const traces = [];
  const ligne = (els) => els.map(positionGpx).filter((p) => { if (!p) ignorees++; return !!p; });
  for (const t of enfants(gpx, 'trk')) {
    const segments = enfants(t, 'trkseg').map((sg) => ligne(enfants(sg, 'trkpt'))).filter((l) => l.length >= 2);
    if (!segments.length) continue;
    const geometry = segments.length === 1 ? { type: 'LineString', coordinates: segments[0] } : { type: 'MultiLineString', coordinates: segments };
    traces.push({ type: 'Feature', geometry, properties: proprietesGpx(t, { genre: 'trace' }) });
  }
  for (const rt of enfants(gpx, 'rte')) {
    const l = ligne(enfants(rt, 'rtept'));
    if (l.length >= 2) traces.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: l }, properties: proprietesGpx(rt, { genre: 'itinéraire' }) });
  }
  const couches = [];
  if (points.length) couches.push({ nom: traces.length ? `${nom} — points` : nom, geojson: { type: 'FeatureCollection', features: points } });
  if (traces.length) couches.push({ nom: points.length ? `${nom} — traces` : nom, geojson: { type: 'FeatureCollection', features: traces } });
  return { couches, ignorees };
}

/* ------------------------------------------------------------------ */
/* KML                                                                 */
/* ------------------------------------------------------------------ */

function listeCoordonnees(el) {
  return texte(el).split(/\s+/).filter(Boolean).map((t) => {
    const [x, y, z] = t.split(',').map(nombre);
    if (x === null || y === null || x === undefined || y === undefined || !dansLesDegres(x, y)) return null;
    return z === null || z === undefined ? [x, y] : [x, y, z];
  });
}
const valides = (liste) => liste.every((p) => p !== null);

function polygoneKml(el) {
  const ext = premier(premier(el, 'outerBoundaryIs'), 'LinearRing');
  const anneaux = [];
  const c0 = ext && listeCoordonnees(premier(ext, 'coordinates'));
  if (!c0 || !valides(c0) || c0.length < 4) return null;
  anneaux.push(c0);
  for (const i of enfants(el, 'innerBoundaryIs')) {
    const c = listeCoordonnees(premier(premier(i, 'LinearRing'), 'coordinates'));
    if (c && valides(c) && c.length >= 4) anneaux.push(c);
  }
  return anneaux;
}

/** Les géométries d'un repère KML, en GeoJSON simples (un `MultiGeometry` en donne plusieurs). */
function geometriesKml(el, out = []) {
  for (const e of el.enfants) {
    if (e.nom === 'Point') {
      const c = listeCoordonnees(premier(e, 'coordinates'));
      if (c?.[0]) out.push({ type: 'Point', coordinates: c[0] });
    } else if (e.nom === 'LineString') {
      const c = listeCoordonnees(premier(e, 'coordinates'));
      if (c && valides(c) && c.length >= 2) out.push({ type: 'LineString', coordinates: c });
    } else if (e.nom === 'Polygon') {
      const p = polygoneKml(e);
      if (p) out.push({ type: 'Polygon', coordinates: p });
    } else if (e.nom === 'MultiGeometry') geometriesKml(e, out);
  }
  return out;
}

/** Plusieurs géométries d'un même genre se regroupent en `Multi…` ; un mélange reste en entités séparées. */
function reunir(geoms) {
  if (geoms.length === 1) return [geoms[0]];
  const genres = new Set(geoms.map((g) => g.type));
  if (genres.size !== 1) return geoms;
  const type = [...genres][0];
  return [{ type: `Multi${type}`, coordinates: geoms.map((g) => g.coordinates) }];
}

function proprietesKml(el) {
  const p = {};
  const nom = texte(premier(el, 'name'));
  if (nom) p.name = nom;
  const desc = texte(premier(el, 'description'));
  if (desc) p.description = desc;
  const ext = premier(el, 'ExtendedData');
  for (const d of descendants(ext || { enfants: [] }, 'Data')) p[d.attrs.name || 'donnee'] = texte(premier(d, 'value'));
  for (const d of descendants(ext || { enfants: [] }, 'SimpleData')) p[d.attrs.name || 'donnee'] = texte(d);
  return p;
}

const FAMILLES = { Point: 'points', MultiPoint: 'points', LineString: 'lignes', MultiLineString: 'lignes', Polygon: 'surfaces', MultiPolygon: 'surfaces' };

/** @returns {{ couches: Array<{nom: string, geojson: object}>, ignorees: number }} */
export function lireKml(source, nom = 'KML') {
  const arbre = analyserXml(source);
  const kml = arbre && premier(arbre, 'kml');
  if (!kml) throw new Error('Ce fichier n’est pas un KML lisible.');
  let ignorees = 0;
  const groupes = [];   // { nom, features }
  const reperes = (conteneur, titre) => {
    const features = [];
    for (const e of conteneur.enfants) {
      if (e.nom === 'Placemark') {
        const geoms = reunir(geometriesKml(e));
        if (!geoms.length) { ignorees++; continue; }
        const props = proprietesKml(e);
        for (const g of geoms) features.push({ type: 'Feature', geometry: g, properties: { ...props } });
      } else if (e.nom === 'Folder' || e.nom === 'Document') {
        reperes(e, texte(premier(e, 'name')) || titre);
      }
    }
    if (features.length) groupes.push({ nom: titre, features });
  };
  const racine = premier(kml, 'Document') || kml;
  reperes(racine, texte(premier(racine, 'name')) || nom);

  const couches = [];
  for (const g of groupes) {
    const parFamille = new Map();
    for (const f of g.features) {
      const k = FAMILLES[f.geometry.type] || 'autres';
      (parFamille.get(k) || parFamille.set(k, []).get(k)).push(f);
    }
    for (const [famille, features] of parFamille) {
      couches.push({ nom: parFamille.size > 1 ? `${g.nom} — ${famille}` : g.nom, geojson: { type: 'FeatureCollection', features } });
    }
  }
  return { couches, ignorees };
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

/** Le séparateur : celui qui revient le plus sur la première ligne, hors guillemets. */
export function detecterSeparateur(texteCsv) {
  const premiereLigne = String(texteCsv || '').replace(/^﻿/, '').split(/\r?\n/)[0] || '';
  const sans = premiereLigne.replace(/"[^"]*"/g, '');
  const comptes = [',', ';', '\t'].map((s) => [s, sans.split(s).length - 1]);
  comptes.sort((a, b) => b[1] - a[1]);
  return comptes[0][1] > 0 ? comptes[0][0] : ',';
}

/** RFC 4180 : guillemets doublés, séparateurs et sauts de ligne dans les cellules entre guillemets. */
export function analyserCsv(texteCsv, separateur = detecterSeparateur(texteCsv)) {
  const s = String(texteCsv || '').replace(/^﻿/, '');
  const lignes = [];
  let ligne = [];
  let cellule = '';
  let guillemets = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (guillemets) {
      if (c === '"') { if (s[i + 1] === '"') { cellule += '"'; i++; } else guillemets = false; }
      else cellule += c;
    } else if (c === '"') guillemets = true;
    else if (c === separateur) { ligne.push(cellule); cellule = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      ligne.push(cellule); cellule = '';
      if (ligne.some((x) => x !== '')) lignes.push(ligne);
      ligne = [];
    } else cellule += c;
  }
  ligne.push(cellule);
  if (ligne.some((x) => x !== '')) lignes.push(ligne);
  return lignes;
}

const NOMS_GEOMETRIE = ['geometrie', 'geometry', 'wkt', 'geom', 'the_geom', 'shape', 'wkt_geom'];
const NOMS_LAT = ['lat', 'latitude', 'y', 'lat_wgs84', 'latitude_wgs84'];
const NOMS_LON = ['lon', 'lng', 'long', 'longitude', 'x', 'lon_wgs84', 'longitude_wgs84'];

const normaliserNom = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * Un CSV en entités GeoJSON.
 *
 * @returns {{ couches: Array<{nom: string, geojson: object}>, colonnes: 'wkt'|'lonlat', ignorees: number }}
 * @throws {Error} sans colonne de géométrie ni de coordonnées, ou avec des coordonnées qui ne sont pas des degrés
 */
export function lireCsv(source, nom = 'CSV') {
  const lignes = analyserCsv(source);
  if (lignes.length < 2) throw new Error('Ce CSV n’a pas de ligne de données.');
  const entete = lignes[0].map((c) => c.trim());
  const noms = entete.map(normaliserNom);
  const iWkt = noms.findIndex((n) => NOMS_GEOMETRIE.includes(n));
  const iLat = noms.findIndex((n) => NOMS_LAT.includes(n));
  const iLon = noms.findIndex((n) => NOMS_LON.includes(n));
  if (iWkt < 0 && (iLat < 0 || iLon < 0)) {
    throw new Error('Ce CSV n’a ni colonne de géométrie (geometrie, wkt…) ni colonnes de coordonnées (lat et lon) : rien à placer sur la carte.');
  }
  const corps = lignes.slice(1);
  // Une colonne dont toutes les valeurs sont des nombres en est une : on la rend telle quelle.
  const numerique = entete.map((_, c) => {
    const vals = corps.map((l) => (l[c] ?? '').trim()).filter((v) => v !== '');
    return vals.length > 0 && vals.every((v) => /^-?\d+(\.\d+)?$/.test(v));
  });
  let ignorees = 0;
  const features = [];
  for (const l of corps) {
    let geometry = null;
    if (iWkt >= 0) geometry = lireWkt((l[iWkt] || '').trim());
    else {
      const lat = nombre(l[iLat] ?? '');
      const lng = nombre(l[iLon] ?? '');
      if (lat !== null && lng !== null && (l[iLat] || '').trim() !== '' && (l[iLon] || '').trim() !== '') {
        if (!dansLesDegres(lng, lat)) throw new Error('Les coordonnées de ce CSV ne sont pas en degrés (WGS 84) : un CSV en Lambert 93 ou en UTM doit être converti avant.');
        geometry = { type: 'Point', coordinates: [lng, lat] };
      }
    }
    if (!geometry) { ignorees++; continue; }
    const properties = {};
    entete.forEach((h, c) => {
      if (c === iWkt || !h) return;
      const v = (l[c] ?? '').trim();
      if (v === '') return;
      properties[h] = numerique[c] ? Number(v) : v;
    });
    features.push({ type: 'Feature', geometry, properties });
  }
  if (!features.length) throw new Error('Aucune ligne de ce CSV n’a de géométrie ou de coordonnées lisibles.');
  return { couches: [{ nom, geojson: { type: 'FeatureCollection', features } }], colonnes: iWkt >= 0 ? 'wkt' : 'lonlat', ignorees };
}

/* ------------------------------------------------------------------ */
/* Reconnaître un fichier                                              */
/* ------------------------------------------------------------------ */

/**
 * Ce que le nom et le début du contenu disent d'un fichier : `'gpx'`, `'kml'`, `'csv'`, ou `null` (un JSON : à reconnaître par
 * `natureJson`).
 */
export function natureFichier(nomFichier, contenu) {
  const ext = (String(nomFichier || '').match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
  const debut = String(contenu || '').replace(/^﻿/, '').slice(0, 2000);
  if (ext === 'gpx' || /<gpx[\s>]/i.test(debut)) return 'gpx';
  if (ext === 'kml' || /<kml[\s>]/i.test(debut)) return 'kml';
  if (['csv', 'tsv', 'txt'].includes(ext) && !/^\s*[{[]/.test(debut)) return 'csv';
  return null;
}

/**
 * Lit un fichier GPX, KML ou CSV en couches.
 * @returns {{ nature: string, couches: Array<{nom: string, geojson: object}>, ignorees: number }}
 */
export function lireFichier(nomFichier, contenu) {
  const nature = natureFichier(nomFichier, contenu);
  const base = String(nomFichier || 'import').replace(/\.[^.]+$/, '') || 'import';
  if (nature === 'gpx') return { nature, ...lireGpx(contenu, base) };
  if (nature === 'kml') return { nature, ...lireKml(contenu, base) };
  if (nature === 'csv') { const r = lireCsv(contenu, base); return { nature, couches: r.couches, ignorees: r.ignorees }; }
  throw new Error('Format non reconnu.');
}

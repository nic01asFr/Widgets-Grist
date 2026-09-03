/**
 * Cascade des Aygalades — construit les couches OSM et le Scene Manifest 0.2.2.
 *
 * Le site dit quelque chose qu'une carte sait montrer : un vallon de bastides
 * devenu zone industrielle, enjambé par l'autoroute et le faisceau ferroviaire,
 * où un ruisseau largement busé refait surface le temps d'une cascade. C'est le
 * fil du récit, et c'est pour cela que les couches sont découpées ainsi plutôt
 * qu'en « bâti / voirie / points » indifférenciés.
 *
 * Le modèle 3D de la cascade est de M.Dailly, sous CC BY 4.0 — voir CREDITS.md.
 * L'attribution est aussi inscrite dans le GLB (`asset.copyright`), pour qu'elle
 * survive au fichier sorti de son dossier.
 */
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Le nœud OSM de la cascade : node/789366740, waterway=waterfall. */
const CASCADE = [5.3632144, 43.3531876];
const BBOX = '43.3480,5.3560,43.3590,5.3710';

const QUERY = `[out:json][timeout:180];
(
  way["building"](${BBOX});
  relation["building"](${BBOX});
  way["waterway"~"river|stream|canal|ditch"](${BBOX});
  node["waterway"="waterfall"](${BBOX});
  way["highway"~"motorway|motorway_link|trunk|primary|secondary|tertiary|residential"](${BBOX});
  way["railway"~"rail|light_rail"](${BBOX});
  way["landuse"~"industrial|railway|commercial"](${BBOX});
  way["leisure"~"park|garden|nature_reserve"](${BBOX});
  node["historic"](${BBOX});
  way["historic"](${BBOX});
);
out body geom;`;

function postOverpass(body) {
  return new Promise((resolve, reject) => {
    const data = 'data=' + encodeURIComponent(body);
    const req = https.request({
      hostname: 'overpass-api.de',
      path: '/api/interpreter',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'Atlas-demo-builder/1.0 (Widgets-Grist)',
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) {
          reject(new Error('HTTP ' + res.statusCode + ' ' + raw.slice(0, 240)));
          return;
        }
        try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/** Hauteur déclarée, sinon déduite des niveaux, sinon rien — jamais inventée. */
function parseHeight(tags) {
  const h = tags.height || tags['building:height'];
  if (h) {
    const m = String(h).replace(',', '.').match(/([0-9.]+)/);
    if (m) return Math.max(3, Math.min(200, parseFloat(m[1])));
  }
  const lv = tags['building:levels'] || tags.levels;
  if (lv) {
    const n = parseFloat(String(lv).replace(',', '.'));
    if (Number.isFinite(n)) return Math.max(3, Math.min(200, n * 3.2));
  }
  return null;
}

function ferme(coords) {
  return coords.length > 3
    && coords[0][0] === coords.at(-1)[0]
    && coords[0][1] === coords.at(-1)[1];
}

function centre(coords) {
  return [coords.reduce((s, c) => s + c[0], 0) / coords.length,
          coords.reduce((s, c) => s + c[1], 0) / coords.length];
}

const data = await postOverpass(QUERY);

const bati = [];
const eau = [];
const voirie = [];
const rail = [];
const emprises = [];
const memoire = [];

for (const el of data.elements || []) {
  const t = el.tags || {};
  const coords = el.geometry ? el.geometry.map((p) => [p.lon, p.lat]) : null;
  const pt = el.type === 'node' && el.lat != null ? [el.lon, el.lat] : null;
  const base = { osm_id: `${el.type}/${el.id}`, name: t.name || t['name:fr'] || null, source: 'OpenStreetMap' };

  if (t.building && coords && ferme(coords)) {
    const h = parseHeight(t);
    bati.push({
      type: 'Feature',
      properties: {
        ...base,
        building: t.building,
        height_m: h != null ? h : 9,
        height_source: h != null ? 'osm' : 'defaut',
        levels: t['building:levels'] || null,
      },
      geometry: { type: 'Polygon', coordinates: [coords] },
    });
    continue;
  }

  if (t.waterway === 'waterfall' && pt) {
    eau.push({
      type: 'Feature',
      properties: { ...base, waterway: 'waterfall', nature: 'Cascade', couvert: 'à ciel ouvert' },
      geometry: { type: 'Point', coordinates: pt },
    });
    continue;
  }

  if (t.waterway && coords && coords.length > 1) {
    eau.push({
      type: 'Feature',
      properties: {
        ...base,
        waterway: t.waterway,
        nature: t.waterway === 'canal' ? 'Canal' : 'Ruisseau',
        // Un cours d'eau busé n'est pas absent : il est invisible. La distinction
        // est le sujet même du site, elle doit donc être portée par la donnée.
        couvert: (t.tunnel || t.covered) ? 'busé' : 'à ciel ouvert',
      },
      geometry: { type: 'LineString', coordinates: coords },
    });
    continue;
  }

  if (t.railway && coords && coords.length > 1) {
    rail.push({
      type: 'Feature',
      properties: { ...base, railway: t.railway },
      geometry: { type: 'LineString', coordinates: coords },
    });
    continue;
  }

  if (t.highway && coords && coords.length > 1) {
    const auto = t.highway === 'motorway' || t.highway === 'motorway_link';
    voirie.push({
      type: 'Feature',
      properties: {
        ...base,
        highway: t.highway,
        rang: auto ? 'Autoroute' : (t.highway === 'residential' ? 'Desserte' : 'Voie principale'),
      },
      geometry: { type: 'LineString', coordinates: coords },
    });
    continue;
  }

  if ((t.landuse || t.leisure) && coords && ferme(coords)) {
    const activite = t.landuse === 'industrial' || t.landuse === 'commercial';
    emprises.push({
      type: 'Feature',
      properties: {
        ...base,
        usage: activite ? 'Activité' : (t.landuse === 'railway' ? 'Ferroviaire' : 'Espace vert'),
        detail: t.landuse || t.leisure,
      },
      geometry: { type: 'Polygon', coordinates: [coords] },
    });
    continue;
  }

  if (t.historic) {
    const g = pt ? { type: 'Point', coordinates: pt }
      : (coords && ferme(coords) ? { type: 'Point', coordinates: centre(coords) } : null);
    if (g) memoire.push({ type: 'Feature', properties: { ...base, historic: t.historic }, geometry: g });
  }
}

function bboxOf(features) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const f of features) {
    const pts = f.geometry.type === 'Point' ? [f.geometry.coordinates]
      : f.geometry.type === 'LineString' ? f.geometry.coordinates
      : f.geometry.coordinates[0];
    for (const [x, y] of pts) {
      a = Math.min(a, x); b = Math.min(b, y);
      c = Math.max(c, x); d = Math.max(d, y);
    }
  }
  return [a, b, c, d];
}

const ecrire = (nom, features) => {
  fs.writeFileSync(path.join(__dirname, nom), JSON.stringify({ type: 'FeatureCollection', features }));
};

ecrire('bati.geojson', bati);
ecrire('eau.geojson', eau);
ecrire('voirie.geojson', voirie);
ecrire('rail.geojson', rail);
ecrire('emprises.geojson', emprises);
ecrire('memoire.geojson', memoire);

const bbox = bboxOf([...bati, ...eau, ...voirie, ...rail, ...emprises, ...memoire]);
fs.writeFileSync(path.join(__dirname, '_bbox.json'), JSON.stringify({ bbox, cascade: CASCADE }, null, 2));

console.log(JSON.stringify({
  bati: bati.length,
  batiAvecHauteurOsm: bati.filter((f) => f.properties.height_source === 'osm').length,
  eau: eau.length,
  eauBusee: eau.filter((f) => f.properties.couvert === 'busé').length,
  voirie: voirie.length,
  rail: rail.length,
  emprises: emprises.length,
  memoire: memoire.length,
  bbox,
}, null, 2));

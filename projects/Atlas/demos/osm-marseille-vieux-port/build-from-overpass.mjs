/**
 * Extrait bâti / voirie / landmarks OSM (Overpass) autour du Vieux-Port
 * et écrit GeoJSON + Scene Manifest 0.2.2 + récit.
 */
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BBOX = '43.2925,5.3605,43.2995,5.3745';

const QUERY = `[out:json][timeout:90];
(
  way["building"](${BBOX});
  relation["building"](${BBOX});
  way["highway"~"primary|secondary|tertiary|residential|pedestrian|footway|service"](${BBOX});
  node["tourism"~"museum|attraction|viewpoint"](${BBOX});
  node["historic"](${BBOX});
  node["amenity"="ferry_terminal"](${BBOX});
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
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function parseHeight(tags) {
  if (!tags) return null;
  const h = tags.height || tags['building:height'];
  if (h) {
    const m = String(h).replace(',', '.').match(/([0-9.]+)/);
    if (m) return Math.max(3, Math.min(200, parseFloat(m[1])));
  }
  const levels = tags['building:levels'] || tags.levels;
  if (levels) {
    const n = parseFloat(String(levels).replace(',', '.'));
    if (Number.isFinite(n)) return Math.max(3, Math.min(200, n * 3.2));
  }
  return null;
}

function elToFeature(el) {
  const tags = el.tags || {};
  let geometry = null;
  if (el.type === 'node' && el.lat != null) {
    geometry = { type: 'Point', coordinates: [el.lon, el.lat] };
  } else if (el.geometry) {
    const coords = el.geometry.map((p) => [p.lon, p.lat]);
    if (coords.length < 2) return null;
    const closed = coords.length > 3
      && coords[0][0] === coords.at(-1)[0]
      && coords[0][1] === coords.at(-1)[1];
    if (tags.building) {
      if (!closed) return null;
      geometry = { type: 'Polygon', coordinates: [coords] };
    } else if (tags.highway) {
      geometry = { type: 'LineString', coordinates: coords };
    }
  }
  if (!geometry) return null;
  const explicit = parseHeight(tags);
  return {
    type: 'Feature',
    properties: {
      osm_id: `${el.type}/${el.id}`,
      name: tags.name || tags['name:fr'] || null,
      building: tags.building || null,
      highway: tags.highway || null,
      tourism: tags.tourism || null,
      historic: tags.historic || null,
      amenity: tags.amenity || null,
      height_m: explicit != null ? explicit : (tags.building ? 10 : null),
      height_source: explicit != null ? 'osm' : (tags.building ? 'default' : null),
      levels: tags['building:levels'] || null,
      source: 'OpenStreetMap',
    },
    geometry,
  };
}

function bboxOf(features) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of features) {
    const ring = f.geometry.type === 'Point'
      ? [f.geometry.coordinates]
      : f.geometry.type === 'LineString'
        ? f.geometry.coordinates
        : f.geometry.coordinates[0];
    for (const [x, y] of ring) {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  return [minX, minY, maxX, maxY];
}

/**
 * `timeOfDay` se compte en MINUTES depuis minuit, pas en heures
 * (app_v7.js:186). Ecrire 14 pour « 14 h » donne 00:14 : la scene s'ouvre
 * de nuit, et rien ne le signale sinon une ambiance sombre qu'on met sur le
 * compte du fond de carte.
 */
function layerState(id, name, visible, polygonMode) {
  // `symbolization: null` et `declarative: null` sont REFUSES par le schema
  // 0.2.2 : il attend un objet, ou rien. Une cle absente et une cle a null se
  // ressemblent a la lecture, le validateur les separe — c'etait 24 ecarts.
  return {
    id,
    name,
    sourceTable: null,
    visible,
    controls: [],
    ...(polygonMode ? { polygonMode } : {}),
    controlDeclaratives: [],
  };
}

const data = await postOverpass(QUERY);
const buildings = [];
const roads = [];
const landmarks = [];
for (const el of data.elements || []) {
  const f = elToFeature(el);
  if (!f) continue;
  if (f.geometry.type === 'Polygon' && f.properties.building) buildings.push(f);
  else if (f.geometry.type === 'LineString') roads.push(f);
  else if (f.geometry.type === 'Point') landmarks.push(f);
}

fs.writeFileSync(path.join(__dirname, 'buildings.geojson'), JSON.stringify({ type: 'FeatureCollection', features: buildings }));
fs.writeFileSync(path.join(__dirname, 'roads.geojson'), JSON.stringify({ type: 'FeatureCollection', features: roads }));
fs.writeFileSync(path.join(__dirname, 'landmarks.geojson'), JSON.stringify({ type: 'FeatureCollection', features: landmarks }));

const all = [...buildings, ...roads, ...landmarks];
const bbox = bboxOf(all);
const center = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
const withOsmH = buildings.filter((f) => f.properties.height_source === 'osm').length;

const LID = {
  batiments: 'osm-bati-3d',
  voirie: 'osm-voirie',
  lieux: 'osm-landmarks',
};

const story = {
  version: '0.2.1',
  steps: [
    {
      id: 'step-1',
      title: 'Le Vieux-Port vu du ciel',
      description: 'Emprise OSM autour du Vieux-Port de Marseille. Le bâti est extrudé depuis les tags height / building:levels (sinon 10 m).',
      state: {
        camera: { center, zoom: 15.2, pitch: 0, bearing: 0 },
        projection: 'mercator',
        timeOfDay: 840,
        terrain3D: false,
        layers: [
          layerState(LID.batiments, 'Bâtiments OSM 3D', true, 'extruded'),
          layerState(LID.voirie, 'Voirie OSM', true),
          layerState(LID.lieux, 'Lieux remarquables', false),
        ],
      },
    },
    {
      id: 'step-2',
      title: 'Plongée dans le tissu urbain',
      description: 'Perspective oblique : volumes issus d’OpenStreetMap. Attribution ODbL — © contributeurs OpenStreetMap.',
      state: {
        camera: { center: [5.3695, 43.2958], zoom: 16.4, pitch: 58, bearing: -28 },
        projection: 'mercator',
        timeOfDay: 1020,
        terrain3D: false,
        layers: [
          layerState(LID.batiments, 'Bâtiments OSM 3D', true, 'extruded'),
          layerState(LID.voirie, 'Voirie OSM', true),
          layerState(LID.lieux, 'Lieux remarquables', false),
        ],
      },
    },
    {
      id: 'step-3',
      title: 'Repères et quai',
      description: 'Musées, sites historiques et embarcadères tagués dans OSM — points d’ancrage du récit.',
      state: {
        camera: { center: [5.3648, 43.2962], zoom: 16.8, pitch: 52, bearing: 42 },
        projection: 'mercator',
        timeOfDay: 600,
        terrain3D: false,
        layers: [
          layerState(LID.batiments, 'Bâtiments OSM 3D', true, 'extruded'),
          layerState(LID.voirie, 'Voirie OSM', true),
          layerState(LID.lieux, 'Lieux remarquables', true),
        ],
      },
    },
    {
      id: 'step-4',
      title: 'Morphologie au crépuscule',
      description: `${buildings.length} bâtiments · ${withOsmH} avec hauteur OSM explicite · ${roads.length} tronçons · ${landmarks.length} lieux.`,
      state: {
        camera: { center: [5.3702, 43.2949], zoom: 15.8, pitch: 62, bearing: 110 },
        projection: 'mercator',
        timeOfDay: 1140,
        terrain3D: false,
        layers: [
          layerState(LID.batiments, 'Bâtiments OSM 3D', true, 'extruded'),
          layerState(LID.voirie, 'Voirie OSM', false),
          layerState(LID.lieux, 'Lieux remarquables', true),
        ],
      },
    },
  ],
};

const scene = {
  version: '0.2.2',
  manifest_version: 'V0.2',
  title: 'Marseille — Vieux-Port (OSM 3D)',
  project_name: 'Marseille Vieux-Port OSM 3D',
  provenance: {
    producer: 'atlas-demo/overpass',
    attribution: '© OpenStreetMap contributors (ODbL)',
    extracted_at: new Date().toISOString(),
    bbox: BBOX,
  },
  layers: [
    {
      id: LID.batiments,
      name: 'Bâtiments OSM 3D',
      order: 0,
      geometry_type: 'polygon',
      visible: true,
      visibility: { defaultVisible: true },
      height_field: 'height_m',
      style: {
        polygonMode: 'extruded',
        declarative: { kind: 'single', color: '#c4a574', opacity: 0.92 },
      },
      source: { type: 'geojson', classe: 'externe' },
      geojson: './buildings.geojson',
      bbox,
      featureCount: buildings.length,
      crs: 'EPSG:4326',
      fields: [
        { name: 'name', gType: 'Text' },
        { name: 'building', gType: 'Text' },
        { name: 'height_m', gType: 'Numeric' },
        { name: 'height_source', gType: 'Text' },
        { name: 'levels', gType: 'Text' },
      ],
    },
    {
      id: LID.voirie,
      name: 'Voirie OSM',
      order: 1,
      geometry_type: 'line',
      visible: true,
      visibility: { defaultVisible: true },
      style: {
        declarative: { kind: 'single', color: '#5c6570', opacity: 0.85 },
      },
      source: { type: 'geojson', classe: 'externe' },
      geojson: './roads.geojson',
      bbox,
      featureCount: roads.length,
      crs: 'EPSG:4326',
    },
    {
      id: LID.lieux,
      name: 'Lieux remarquables',
      order: 2,
      geometry_type: 'point',
      visible: false,
      visibility: { defaultVisible: false },
      style: {
        declarative: { kind: 'single', color: '#c44536', opacity: 1 },
      },
      source: { type: 'geojson', classe: 'externe' },
      geojson: './landmarks.geojson',
      bbox,
      featureCount: landmarks.length,
      crs: 'EPSG:4326',
    },
  ],
  story,
  camera: story.steps[1].state.camera,
};

fs.writeFileSync(path.join(__dirname, 'scene.json'), JSON.stringify(scene, null, 2));

console.log(JSON.stringify({
  buildings: buildings.length,
  withOsmHeight: withOsmH,
  roads: roads.length,
  landmarks: landmarks.length,
  bbox,
  scene: path.join(__dirname, 'scene.json'),
}, null, 2));

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

/**
 * Les serveurs Overpass sont publics, gratuits et souvent satures.
 *
 * Le 504 n'est pas un cas rare a traiter par un message d'erreur : il est arrive
 * a chaque instance essayee, en quelques minutes, sur une requete qui passait
 * l'heure d'avant. Un script d'extraction qui abandonne au premier refus oblige
 * a relancer a la main jusqu'a ce que ca tombe bien — donc on bascule.
 */
const MIROIRS = ['overpass-api.de', 'overpass.kumi.systems', 'overpass.private.coffee'];

function unEssai(hote, body) {
  return new Promise((resolve) => {
    const data = 'data=' + encodeURIComponent(body);
    const req = https.request({
      hostname: hote,
      path: '/api/interpreter',
      method: 'POST',
      timeout: 180000,
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
          resolve({ ok: false, pourquoi: `HTTP ${res.statusCode}` });
          return;
        }
        try { resolve({ ok: true, json: JSON.parse(raw) }); }
        catch (e) { resolve({ ok: false, pourquoi: 'reponse illisible : ' + e.message }); }
      });
    });
    req.on('error', (e) => resolve({ ok: false, pourquoi: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, pourquoi: 'delai depasse' }); });
    req.write(data);
    req.end();
  });
}

async function postOverpass(body) {
  const echecs = [];
  for (const hote of MIROIRS) {
    const r = await unEssai(hote, body);
    if (r.ok) {
      if (echecs.length) console.error(`  (${hote} a repondu apres ${echecs.length} refus)`);
      return r.json;
    }
    echecs.push(`${hote} : ${r.pourquoi}`);
  }
  // Nommer TOUS les refus : un seul nom ferait chercher la panne au mauvais
  // endroit — « 504 » d'un miroir ne dit pas que les trois sont satures.
  throw new Error('aucun serveur Overpass ne repond — ' + echecs.join(' | '));
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

/**
 * Le mobilier fait l'objet d'une requete SEPAREE.
 *
 * Tout demander d'un coup fait tomber Overpass en 504 — mesure faite : la
 * requete jointe echoue sur overpass-api.de comme sur le miroir kumi, la
 * requete scindee passe. Et le mobilier a sa propre emprise, plus serree : ces
 * objets ne se lisent qu'a grande echelle.
 */
const BBOX_MOBILIER = '43.3495,5.3580,43.3580,5.3690';
const QUERY_MOBILIER = `[out:json][timeout:90];
(
  node["natural"="tree"](${BBOX_MOBILIER});
  node["highway"="street_lamp"](${BBOX_MOBILIER});
  node["amenity"="bench"](${BBOX_MOBILIER});
  node["highway"="bus_stop"](${BBOX_MOBILIER});
);
out body;`;

/**
 * Le modele 3D d'un objet de mobilier, choisi d'apres son tag OSM.
 *
 * `_modelId` est lu PAR ENTITE (`app_v7.js`, `modelPlacement`) avant tout repli
 * sur `style.library.modelId` de la couche. Une seule couche peut donc porter
 * quatre modeles differents — c'est ce qui permet de montrer le catalogue sans
 * eclater le mobilier en quatre couches qui diraient la meme chose.
 */
function modeleDe(tags) {
  if (tags.natural === 'tree') return { modelId: 'tree_deciduous', type: 'Arbre' };
  if (tags.highway === 'street_lamp') return { modelId: 'streetlamp', type: 'Lampadaire' };
  if (tags.amenity === 'bench') return { modelId: 'bench', type: 'Banc' };
  if (tags.highway === 'bus_stop') return { modelId: 'bus_shelter', type: 'Arret de bus' };
  return null;
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

const mobilier = [];
try {
  const dataMob = await postOverpass(QUERY_MOBILIER);
  for (const el of dataMob.elements || []) {
    if (el.type !== 'node' || el.lat == null) continue;
    const t = el.tags || {};
    const m = modeleDe(t);
    if (!m) continue;
    mobilier.push({
      type: 'Feature',
      properties: {
        osm_id: `node/${el.id}`,
        name: t.name || null,
        type: m.type,
        // Lu par entite : c'est lui qui choisit le modele du catalogue.
        _modelId: m.modelId,
        source: 'OpenStreetMap',
      },
      geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
    });
  }
} catch (e) {
  // Le mobilier est un complement : son absence ne doit pas emporter le bati,
  // l'eau et la voirie qu'on vient d'obtenir. On le dit, et on continue.
  console.error('  mobilier non recupere — ' + e.message);
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
ecrire('mobilier.geojson', mobilier);

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
  mobilier: mobilier.length,
  mobilierParType: mobilier.reduce((a, f) => { a[f.properties.type] = (a[f.properties.type] || 0) + 1; return a; }, {}),
  bbox,
}, null, 2));

// ============================================================
// Atlas v7 — Maquette 3D Territoriale (MapLibre + three.js)
// Interop qgis2grist : lecture Scene Manifest V0.2 + tables source.
// Fork propre depuis app_v6.js — v6 reste inchangée.
// ============================================================

import { urlSceneDepuisParam, chargerSceneExterne } from './lib/scene-externe.js?v=1.5.4';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  detectDocMode,
  loadLatestSceneManifest,
  loadQgisWidgetConfig,
  loadSceneManifestLayers,
  materializeDeferredLayer,
  boundsFromVisibleLayers,
} from './lib/scene-loader.js?v=1.5.4';
import { boundsFromGeoJSON } from './lib/grist-rows.js?v=1.5.4';
import { pointFallbackZoom, centroidCollection, featureCentroid } from './lib/point-fallback.js?v=1.5.4';
import { isModelLayer, objectInspectorTabs } from './lib/model-layer.js?v=1.5.4';
import {
  moveSequence, displayOrder, moveLayerInStack, insertionIndex, sortByRank,
  dropIndex, reorderByDrop,
} from './lib/layer-order.js?v=1.5.4';
import { edgeScrollStep } from './lib/edge-scroll.js?v=1.5.4';
import { basemapLayerIds } from './lib/basemap-layers.js?v=1.5.4';
import {
  applyTerrainBase, clearTerrainBase, extrusionExpressions, needsTerrainBase, pointsSondes,
  paliersDemDifferents, altitudeOrigineStable, ecartAuSol,
} from './lib/terrain-base.js?v=1.5.4';
import {
  loadLayerPrefs,
  applyLayerPrefs,
  saveLayerPref,
  parseGristBool,
  saveFeaturesToSource,
  startScenePolling,
  refreshLayerFromTable,
} from './lib/grist-sync.js?v=1.5.4';
import {
  syncColorCategoriesFromFeatures,
  applyCategoryColorsToFeatures,
  syncFeatureColorsFromSymbolization,
  expressionCouleurDeclarative,
  applyDeclarativeToLayer,
  normalizePropertyValue,
  parsePropertyNumber,
  resolveFeaturePropertyKey,
  graduatedStops,
  recolorStops,
} from './lib/declarative-style.js?v=1.5.4';
import {
  scanGeoTables,
  detectGeometryColumn,
  tableToGeoJSON,
  isLinkedTableLayer,
} from './lib/geo-tables.js?v=1.5.4';
import {
  layerFieldNames,
  controlFieldType,
  controlUniqueValues,
  controlBounds,
  buildControlPredicate,
  filteredGeoJSON,
  expressionFiltreControles,
  filteredUniqueValues,
  fmtControlValue,
  isSelectValueChecked,
  normalizeSelectValuesForLayer,
  repairSelectControlFromManifest,
  applyStoryControlsToLayer,
  sanitizeBrokenSelectFilters,
} from './lib/controls.js?v=1.5.4';
import {
  captureStoryState,
  saveStoryToGrist,
  loadStoryFromGrist,
  storyToManifestFragment,
} from './lib/story.js?v=1.5.4';
import {
  syncLayerDeclarative,
  declarativeFromAtlasLayer,
} from './lib/manifest-binding.js?v=1.5.4';
import {
  cameraStorageKey as viewportCameraKey,
  shouldAutoFitInitialBounds,
} from './lib/viewport.js?v=1.5.4';
import {
  parseAtlasMode,
  resolveAccess,
  decodeAccessToken,
  initialsFrom,
  canWrite,
  shouldEnableLight3d,
  parseNo3dParam,
  probeCanWriteDoc,
} from './lib/view-mode.js?v=1.5.4';
import {
  createDefaultViewerControls,
  getViewerControl,
  setViewerExposed as setViewerExposedFn,
} from './lib/viewer-controls.js?v=1.5.4';
import {
  loadScenePrefs,
  saveScenePrefs,
} from './lib/scene-prefs.js?v=1.5.4';

const $ = (id) => document.getElementById(id);
const deg2rad = (d) => (d * Math.PI) / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ============================================================
// CONFIG / STATE
// ============================================================
// Fonds : OpenFreeMap (vecteur, bâtiments 3D) + IGN Géoplateforme (raster FR)
const IGN = {
    plan:  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    ortho: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    // MNT LIDAR HD (GeoTIFF Float32) — décodé en TerrainRGB via le protocole ignmnt://
    mnt:   'ignmnt://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93&STYLES=&FORMAT=image/geotiff&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=512&HEIGHT=512',
};
function ignRasterStyle(tiles) {
    return { version: 8, glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: { 'ign': { type: 'raster', tiles: [tiles], tileSize: 256, attribution: '© IGN / Géoplateforme' } },
        layers: [{ id: 'ign-base', type: 'raster', source: 'ign' }] };
}
const BASEMAPS = {
    liberty:  { url: 'https://tiles.openfreemap.org/styles/liberty',  label: 'Liberty 3D', icon: '✨' },
    bright:   { url: 'https://tiles.openfreemap.org/styles/bright',   label: 'Plan',       icon: '🗺️' },
    positron: { url: 'https://tiles.openfreemap.org/styles/positron', label: 'Clair',      icon: '⬜' },
    'plan-ign':  { style: () => ignRasterStyle(IGN.plan),  label: 'Plan IGN',  icon: '🇫🇷' },
    'ortho-ign': { style: () => ignRasterStyle(IGN.ortho), label: 'Ortho IGN', icon: '🛰️' },
};

// Sources de relief (DEM) : terrarium mondial (sans clé) ou LIDAR HD IGN (France)
const TERRAIN_SOURCES = {
    terrarium: { label: 'Mondial (terrarium)', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 14, attribution: 'Terrain: Mapzen / AWS' },
    ign:       { label: 'LIDAR HD IGN (FR)', tiles: [IGN.mnt], encoding: 'mapbox', tileSize: 512, maxzoom: 16, attribution: '© IGN LIDAR HD' },
};

const CONFIG = {
    defaultCenter: [5.3740, 43.2951], // Marseille (Vieux-Port)
    defaultZoom: 16,
    defaultPitch: 55,
    defaultBearing: -18,
    grist: { ready: false },
    /**
     * La scène chargée par `?scene=`, ou null.
     *
     * Sa seule présence coupe l'accès au document : c'est la règle, et elle
     * n'a qu'un endroit (cf. docs/CADRAGE-SCENE-EXTERNE-ET-DECOUPLAGE.md §A).
     */
    sceneExterne: null,
    /** 'scene-manifest' | 'maquette' | null */
    docMode: null,
    // Un cycle recharge et reconvertit chaque table visible : à 5 s, une scène
    // d'analyse saturait l'onglet. 30 s suffisent au travail collaboratif, et le
    // rafraîchissement manuel par couche reste disponible.
    pollIntervalMs: 30000,
    /** Mode lecture (pas d'écriture Grist) — URL ?mode=view ou droits insuffisants */
    viewMode: false,
    /** Réduit / coupe Models3D (mobile lent ou ?no3d=1) */
    light3d: false,
};

const STATE = {
    projectName: '',
    location: { name: 'Vieux-Port · Marseille', lat: 43.2951, lng: 5.3740 },
    layers: [],
    story: [],
    viewerControls: createDefaultViewerControls(),
    selectedLayer: null,
    currentModule: null,
    selection: { mode: false, layerId: null, features: [], multiIndex: 0 },
    settings: {
        basemap: 'liberty',
        projection: 'globe',     // 'globe' (façon Google Earth, → mercator en zoom) | 'mercator'
        modelSet: 'colored',     // jeu de modèles 3D : 'colored' | 'mono'
        buildings3D: true,
        terrain3D: false,
        terrainSource: 'terrarium',
        terrainExaggeration: 1.2,
        labels: true,
        sky: true,
        timeOfDay: 870,          // minutes (14:30)
        date: new Date(2026, 5, 15, 14, 30, 0),
        shadows: true,
    },
};

let map = null;
/**
 * Le style de base est-il posé ? Vrai dès `load`, faux le temps d'un
 * changement de fond. Sert de prérequis au montage des couches — voir
 * `mapStyleUsable()`.
 */
let _styleUsable = false;
let dirty = false;
let _scenePollTimer = null;
let _syncPaused = false;
/** @type {object|null} */
let _widgetConfig = null;
/** @type {object|null} */
let _sceneManifest = null;
let _inspObjTab = null; // résolu à l'ouverture selon les onglets disponibles
let _geoTables = [];
let _linkChoices = [];
let _storyIdx = 0;
let _storyPresenting = false;
let _openDockPill = null;
let _sunArcDragging = false;
let _preStorySnapshot = null;
let _preStoryOrder = null;
let _preStorySettings = null;
let _persistStoryTimer = null;
let _cameraSaveTimer = null;
let _initialViewportApplied = false;

function cameraStorageKey() {
    return viewportCameraKey(STATE.projectName, CONFIG.docMode);
}

function computeLayersBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let any = false;
    for (const layer of STATE.layers) {
        const b = boundsFromGeoJSON(layer.geojson);
        if (!b) continue;
        minX = Math.min(minX, b[0][0]); minY = Math.min(minY, b[0][1]);
        maxX = Math.max(maxX, b[1][0]); maxY = Math.max(maxY, b[1][1]);
        any = true;
    }
    return any ? [[minX, minY], [maxX, maxY]] : null;
}

function markDirty() {
    if (CONFIG.viewMode) return;
    dirty = true;
    _syncPaused = true;
    $('app-header').classList.add('dirty');
}

// ============================================================
// PALETTES
// ============================================================
const COLOR_PALETTES = {
    Tableau10: ['#4e79a7','#f28e2c','#e15759','#76b7b2','#59a14f','#edc949','#af7aa1','#ff9da7','#9c755f','#bab0ab'],
    Set2: ['#66c2a5','#fc8d62','#8da0cb','#e78ac3','#a6d854','#ffd92f','#e5c494','#b3b3b3'],
    Verts: ['#E8F0D0','#B9D183','#7AB04A','#4A8331','#1E5219'],
    Bleus: ['#DEEBF7','#9ECAE1','#4292C6','#08519C','#08306B'],
    Oranges: ['#FFEDDA','#FDAE6B','#F16913','#A63603','#7F2704'],
    Viridis: ['#440154','#3e4a89','#26828e','#35b779','#6ece58','#b5de2b','#fde725'],
    YlOrRd: ['#ffffcc','#ffeda0','#fed976','#feb24c','#fc4e2a','#e31a1c','#800026'],
    RdYlGn: ['#d73027','#fdae61','#fee08b','#d9ef8b','#66bd63','#1a9850'],
};
const PALETTE_INFO = {
    Tableau10: { type: 'qualitative', name: 'Tableau 10' },
    Set2: { type: 'qualitative', name: 'Set 2' },
    Verts: { type: 'sequential', name: 'Verts' },
    Bleus: { type: 'sequential', name: 'Bleus' },
    Oranges: { type: 'sequential', name: 'Oranges' },
    Viridis: { type: 'sequential', name: 'Viridis' },
    YlOrRd: { type: 'sequential', name: 'Jaune-Rouge' },
    RdYlGn: { type: 'divergent', name: 'Rouge-Vert' },
};

// ============================================================
// BIBLIOTHÈQUE DE MODÈLES 3D
// ============================================================
// Catalogue 3D genere dans le repo (scripts/generate-models.js) et publie SOUS
// LE WIDGET, `published/atlas/models/`, depuis qu'il y a ete co-localise.
// Servi via GitHub Pages. Deux sets de style : 'colored' | 'mono'. Modeles en metres (scale 1).
//
// Le defaut a longtemps pointe vers `/Widgets-Grist/models/`, reste du temps ou
// le catalogue vivait a la racine — un chemin qui renvoie 404 depuis le
// deplacement. En ligne, la sonde `./models/` rattrapait l'erreur puisque le
// widget est servi depuis `/atlas/` ; hors de ce cas, aucun modele ne chargeait.
const MODEL_LIBRARY = {
    baseRoot: 'https://nic01asfr.github.io/Widgets-Grist/atlas/models/',
    set: 'colored',
    get baseUrl() { return this.baseRoot + this.set + '/'; },
    categories: {
        lighting: { icon: '💡', name: 'Éclairage', models: [
            { id: 'streetlamp', name: 'Lampadaire', icon: '🏮', file: 'Streetlamp.glb', scale: 1 },
            { id: 'streetlamp_double', name: 'Lampadaire double', icon: '🏮', file: 'StreetlampDouble.glb', scale: 1 },
            { id: 'lantern', name: 'Lanterne', icon: '🏮', file: 'Lantern.glb', scale: 1 },
            { id: 'lampball', name: 'Lampe boule', icon: '💡', file: 'Lampball.glb', scale: 1 },
            { id: 'wall_light', name: 'Applique', icon: '🔆', file: 'WallLight.glb', scale: 1 },
            { id: 'projector', name: 'Projecteur', icon: '🔦', file: 'Projector.glb', scale: 1 },
        ]},
        furniture: { icon: '🪑', name: 'Mobilier urbain', models: [
            { id: 'bench', name: 'Banc', icon: '🪑', file: 'Bench.glb', scale: 1 },
            { id: 'bench_simple', name: 'Banc simple', icon: '🪑', file: 'BenchSimple.glb', scale: 1 },
            { id: 'picnic_table', name: 'Table pique-nique', icon: '🪵', file: 'PicnicTable.glb', scale: 1 },
            { id: 'trashcan', name: 'Poubelle', icon: '🗑️', file: 'Trashcan.glb', scale: 1 },
            { id: 'bus_shelter', name: 'Abri bus', icon: '🚏', file: 'BusShelter.glb', scale: 1 },
            { id: 'bike_rack', name: 'Arceau vélo', icon: '🚲', file: 'BikeRack.glb', scale: 1 },
            { id: 'planter', name: 'Jardinière', icon: '🪴', file: 'Planter.glb', scale: 1 },
            { id: 'fountain', name: 'Fontaine', icon: '⛲', file: 'Fountain.glb', scale: 1 },
            { id: 'ev_charger', name: 'Borne recharge', icon: '⚡', file: 'EvCharger.glb', scale: 1 },
        ]},
        vegetation: { icon: '🌳', name: 'Végétation', models: [
            { id: 'tree_deciduous', name: 'Arbre feuillu', icon: '🌳', file: 'TreeDeciduous.glb', scale: 1 },
            { id: 'tree_conifer', name: 'Conifère', icon: '🌲', file: 'TreeConifer.glb', scale: 1 },
            { id: 'tree_palm', name: 'Palmier', icon: '🌴', file: 'TreePalm.glb', scale: 1 },
            { id: 'bush', name: 'Buisson', icon: '🌿', file: 'Bush.glb', scale: 1 },
            { id: 'hedge', name: 'Haie', icon: '🌳', file: 'Hedge.glb', scale: 1 },
            { id: 'flowerbed', name: 'Parterre fleuri', icon: '🌷', file: 'Flowerbed.glb', scale: 1 },
        ]},
        signalization: { icon: '🚦', name: 'Signalisation', models: [
            { id: 'traffic_light', name: 'Feu tricolore', icon: '🚦', file: 'TrafficLight.glb', scale: 1 },
            { id: 'stop_sign', name: 'Panneau stop', icon: '🛑', file: 'StopSign.glb', scale: 1 },
            { id: 'directional_sign', name: 'Panneau directionnel', icon: '🪧', file: 'DirectionalSign.glb', scale: 1 },
            { id: 'bollard', name: 'Potelet', icon: '🔶', file: 'Bollard.glb', scale: 1 },
            { id: 'barrier', name: 'Barrière', icon: '🚧', file: 'Barrier.glb', scale: 1 },
        ]},
        infrastructure: { icon: '🚧', name: 'Infrastructure', models: [
            { id: 'guardrail', name: 'Glissière', icon: '🚧', file: 'Guardrail.glb', scale: 1 },
            { id: 'stone_bollard', name: 'Borne béton', icon: '🪨', file: 'StoneBollard.glb', scale: 1 },
            { id: 'pole', name: 'Poteau', icon: '🔲', file: 'Pole.glb', scale: 1 },
            { id: 'fire_hydrant', name: 'Borne incendie', icon: '🧯', file: 'FireHydrant.glb', scale: 1 },
            { id: 'manhole', name: 'Regard', icon: '⚫', file: 'Manhole.glb', scale: 1 },
        ]},
        vehicles: { icon: '🚗', name: 'Véhicules', models: [
            { id: 'car', name: 'Voiture', icon: '🚗', file: 'Car.glb', scale: 1 },
            { id: 'van', name: 'Camionnette', icon: '🚐', file: 'Van.glb', scale: 1 },
            { id: 'bus', name: 'Bus', icon: '🚌', file: 'Bus.glb', scale: 1 },
            { id: 'bicycle', name: 'Vélo', icon: '🚲', file: 'Bicycle.glb', scale: 1 },
            { id: 'scooter', name: 'Trottinette', icon: '🛴', file: 'Scooter.glb', scale: 1 },
            { id: 'pedestrian', name: 'Piéton', icon: '🚶', file: 'Pedestrian.glb', scale: 1 },
        ]},
    },
};
// URL des modèles : override explicite (?models= / localStorage) sinon défaut
// GitHub Pages. probeLocalModels() (appelé à l'init) teste des chemins locaux et
// bascule dessus s'ils répondent — utile en dev avant déploiement gh-pages.
let MODEL_BASE_EXPLICIT = false;
(function () {
    try {
        // Application installee : le catalogue est embarque dans le paquet, et
        // c'est le seul chemin valable — aucun CDN n'est joignable hors reseau.
        if (typeof window !== 'undefined' && window.__ATLAS_MODELES__) {
            MODEL_LIBRARY.baseRoot = String(window.__ATLAS_MODELES__).replace(/\/+$/, '') + '/';
            MODEL_BASE_EXPLICIT = true;
            return;
        }
        const qp = new URLSearchParams(location.search).get('models');
        if (qp) { MODEL_LIBRARY.baseRoot = qp.replace(/\/+$/, '') + '/'; MODEL_BASE_EXPLICIT = true; return; }
        const ls = localStorage.getItem('atlas_model_base');
        if (ls) { MODEL_LIBRARY.baseRoot = ls.replace(/\/+$/, '') + '/'; MODEL_BASE_EXPLICIT = true; }
    } catch (e) {}
})();
async function probeLocalModels() {
    if (MODEL_BASE_EXPLICIT) return;
    const cands = [];
    try {
        // Depuis `projects/Atlas/`, avec la racine du repo servie : c'est le seul
        // chemin qui permet d'essayer les modeles 3D en developpement local.
        cands.push(new URL('../../published/atlas/models/', location.href).href);
        cands.push(new URL('./models/', location.href).href);   // modeles a cote du widget (cas publie)
        cands.push(new URL('../models/', location.href).href);
        cands.push(new URL('../../published/models/', location.href).href); // ancien emplacement
    } catch (e) { return; }
    for (const base of cands) {
        try {
            const r = await fetch(base + 'catalog.json', { cache: 'no-store' });
            if (r.ok && base !== MODEL_LIBRARY.baseRoot) {
                MODEL_LIBRARY.baseRoot = base;
                Models3D.gltfCache.clear(); Models3D.protoCache.clear(); Models3D.scheduleBuild();
                console.log('🧩 Atlas — modèles 3D servis localement :', base);
                return;
            }
        } catch (e) {}
    }
    console.log('🧩 Atlas — base modèles (défaut) :', MODEL_LIBRARY.baseUrl, '— aucun chemin local trouvé. Sers la racine du repo, ou règle la source dans le module Modèles.');
}
function allModels() {
    const out = [];
    for (const [catId, cat] of Object.entries(MODEL_LIBRARY.categories))
        for (const m of cat.models) out.push({ ...m, category: catId, url: MODEL_LIBRARY.baseUrl + m.file });
    return out;
}
function findModel(id) { return allModels().find((m) => m.id === id) || null; }

// ============================================================
// OSM PRESETS
// ============================================================
const OSM_PRESETS = {
    lighting:        { name: 'Éclairage', icon: '🏮', category: 'lighting', model: 'streetlamp', query: 'node["highway"="street_lamp"]' },
    trees:           { name: 'Arbres', icon: '🌳', category: 'vegetation', model: 'tree_deciduous', query: 'node["natural"="tree"]' },
    benches:         { name: 'Bancs', icon: '🪑', category: 'furniture', model: 'bench', query: 'node["amenity"="bench"]' },
    waste:           { name: 'Poubelles', icon: '🗑️', category: 'furniture', model: 'trashcan', query: 'node["amenity"="waste_basket"]' },
    traffic_signals: { name: 'Feux', icon: '🚦', category: 'signalization', model: 'traffic_light', query: 'node["highway"="traffic_signals"]' },
    bus_stops:       { name: 'Arrêts bus', icon: '🚏', category: 'furniture', model: 'bus_shelter', query: 'node["highway"="bus_stop"]' },
    bicycle_parking: { name: 'Vélos', icon: '🚲', category: 'furniture', model: 'bike_rack', query: 'node["amenity"="bicycle_parking"]' },
    bollards:        { name: 'Bornes', icon: '🔶', category: 'infrastructure', model: 'bollard', query: 'node["barrier"="bollard"]' },
    roads:           { name: 'Voirie', icon: '🛤️', geomType: 'LineString', query: 'way["highway"~"primary|secondary|tertiary|residential|unclassified"]' },
    buildings:       { name: 'Bâtiments', icon: '🏢', geomType: 'Polygon', query: 'way["building"]' },
};

// ============================================================
// SYMBOLISATION — helpers (expressions compatibles MapLibre)
// ============================================================
function getUniqueValues(layer, field, max = 100) {
    const propKey = resolveFeaturePropertyKey(layer, field);
    const counts = new Map();
    (layer.geojson?.features || []).forEach((f) => {
        const key = normalizePropertyValue(f.properties?.[propKey]);
        if (!key) return;
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count).slice(0, max);
}
function getNumericRange(layer, field) {
    const propKey = resolveFeaturePropertyKey(layer, field);
    let min = Infinity, max = -Infinity, count = 0;
    (layer.geojson?.features || []).forEach((f) => {
        const v = parsePropertyNumber(f.properties?.[propKey]);
        if (!Number.isFinite(v)) return;
        min = Math.min(min, v); max = Math.max(max, v); count++;
    });
    if (!count) return { min: 0, max: 100, count: 0 };
    return { min, max, count };
}
/**
 * Types Grist qui portent un nombre.
 *
 * `gType` vient du manifeste (`fields[].gType`) : c'est ce que la colonne EST,
 * pas ce que ses valeurs ont l'air d'etre. Il fait donc autorite sur l'echantillon
 * — et il repond meme quand il n'y a aucune entite a echantillonner.
 */
const G_TYPES_NUMERIQUES = new Set(['Numeric', 'Int', 'Integer', 'Any']);

function detectFieldType(layer, field) {
    const declare = (layer?._fields || []).find((f) => f.name === field || f.label === field);
    if (declare?.gType && declare.gType !== 'Any') {
        return G_TYPES_NUMERIQUES.has(declare.gType) ? 'numeric' : 'text';
    }
    const propKey = resolveFeaturePropertyKey(layer, field);
    let num = 0, total = 0;
    (layer.geojson?.features || []).slice(0, 200).forEach((f) => {
        const v = f.properties?.[propKey];
        if (v == null) return; total++;
        if (Number.isFinite(parsePropertyNumber(v))) num++;
    });
    if (!total) {
        // Aucune entite ici. « text » serait un verdict, alors qu'on n'a rien
        // regarde — et il ferait disparaitre le champ des choix d'une
        // symbologie graduee. Le style declaratif, lui, dit sur quel champ il
        // gradue : c'est une mesure, donc un nombre.
        const decl = layer?._declarative;
        if (decl?.kind === 'graduated' && (decl.field === field)) return 'numeric';
        const ctl = (layer?.controls || []).find((c) => c.field === field);
        if (ctl && (ctl.type === 'range' || ctl.type === 'time')) return 'numeric';
        return 'text';
    }
    return num / total > 0.7 ? 'numeric' : 'text';
}

/** Palette séquentielle pour gradué → _fill_color. */
function sequentialPaletteForSym(sym, layer) {
    // Un style déclaratif énonce ses propres couleurs de classes : les ignorer
    // au profit d'une rampe nommée effacerait la symbologie voulue par le récit
    // ou par le manifest.
    const stops = layer?._declarative?.stops;
    if (stops?.length) {
        const hex = stops.map((s) => s.color).filter(Boolean);
        if (hex.length) return hex;
    }
    const name = sym.colorRamp || sym.palette || 'Viridis';
    return COLOR_PALETTES[name] || COLOR_PALETTES.Viridis;
}

/** Sync GeoJSON + retourne expression paint couleur (qgis2grist lit _fill_color). */
function layerPaintColor(layer) {
    // `_fill_color` porte la couleur calculée par le style déclaratif ou par la
    // symbolisation. Le critère est sa présence, pas l'origine de la couche :
    // une table Grist stylée par un récit doit se peindre comme un import.
    if (layer.source === 'qgis2grist' || layer._declarative) {
        const sym = initSymbolization(layer).color;
        const fb = sym.value || sym.defaultColor || layer.color || '#808080';
        // `_fill_color` garde la priorité : c'est ce qu'écrit la symbolisation
        // choisie dans l'interface, et l'utilisateur prime sur le manifest.
        // Derrière, l'expression déclarative plutôt qu'une couleur unique — sans
        // elle, une couche dont on ne détient pas les entités (URL, tuiles)
        // n'aurait aucun `_fill_color` et se peindrait d'un seul ton, sans que
        // rien ne le signale.
        const declaratif = expressionCouleurDeclarative(
            layer._declarative, fb, layer._fields || null
        );
        return ['coalesce', ['get', '_fill_color'], declaratif || fb];
    }
    return colorExpression(layer, layer.color);
}

/**
 * Opacité de peinture d'une couche.
 * Une opacité fixée par l'utilisateur l'emporte ; sinon on suit l'opacité
 * portée par l'entité (issue des stops du style déclaratif), et à défaut le
 * défaut de la géométrie.
 */
function layerPaintOpacity(layer) {
    const sym = initSymbolization(layer);
    if (Number.isFinite(sym.opacity)) return sym.opacity;
    return ['coalesce', ['get', '_fill_opacity'], defaultLayerOpacity(layer)];
}

/** Persiste les prefs d'une couche qgis2grist (no-op hors Grist / mode lecture). */
function saveLayerPrefIfSynced(layer) {
    if (layer?.source !== 'qgis2grist' || !CONFIG.grist.ready) return;
    saveLayerPref(grist.docApi, layer, { viewMode: CONFIG.viewMode }).catch(() => {});
}

/** Contour d'une surface : largeur, couleur (suit le remplissage ou fixe). */
function layerStrokePaint(layer) {
    const st = initSymbolization(layer).stroke || {};
    return {
        width: st.enabled === false ? 0 : (Number.isFinite(st.width) ? st.width : 1.5),
        color: st.mode === 'fixed' ? (st.color || layer.color) : layerPaintColor(layer),
    };
}

/**
 * Filtrer une couche qu'Atlas ne détient pas.
 *
 * Impossible de retrancher des entités qu'on n'a pas : on décrit à MapLibre ce
 * qu'il doit garder. L'habillage suit le remplissage — contour, étiquettes,
 * zone de clic, repli en points —, sinon on verrait le contour d'un bâtiment
 * que le filtre vient d'écarter, et on pourrait encore cliquer dessus.
 */
function appliquerFiltreDistant(layer) {
    if (!map || !layer?._distant) return;
    const expr = expressionFiltreControles(layer);
    for (const sfx of ['', '-outline', '-label', '-hit', '-pts']) {
        const id = layer.id + sfx;
        if (!map.getLayer(id)) continue;
        // `null` retire le filtre : c'est le bon geste quand plus rien n'est actif.
        try { map.setFilter(id, expr); }
        catch (e) { console.warn('[Atlas] filtre non appliqué sur', id, '—', e.message); }
    }
}

function syncLayerSourceData(layer) {
    // Une couche distante n'a pas de données à remplacer ici : MapLibre les
    // tient. Son filtrage passe par une expression, pas par un retranchement.
    if (layer._raster) return;   // pas d'entites : rien a filtrer ni a remplacer
    if (layer._distant) { appliquerFiltreDistant(layer); return; }
    if (!map?.getSource(layer.id)) return;
    const data = sourceData(layer);
    map.getSource(layer.id).setData(data);
    // Les centres suivent le même filtrage que les surfaces.
    const pts = map.getSource(pointFallbackId(layer));
    if (pts) pts.setData(centroidCollection(data));
}
function getLayerFields(layer) {
    if (layer._fields?.length) {
        return layer._fields.map((f) => ({
            id: f.name,
            label: f.label || f.name,
            type: detectFieldType(layer, f.name),
        }));
    }
    const keys = new Set();
    (layer.geojson?.features || []).slice(0, 200).forEach((f) => {
        if (f.properties) Object.keys(f.properties).forEach((k) => { if (!k.startsWith('_')) keys.add(k); });
    });
    if (!keys.size) {
        // Pas d'entites a inspecter : la scene nomme quand meme les champs
        // dont elle se sert — celui de la symbologie, ceux des controles. Une
        // liste vide laisserait l'inspecteur proposer « — Champ — » et rien
        // d'autre, donc rendrait la couche insymbolisable.
        const decl = layer?._declarative;
        if (decl?.field) keys.add(decl.field);
        for (const c of (layer?.controls || [])) if (c?.field) keys.add(c.field);
    }
    return Array.from(keys).sort().map((k) => ({ id: k, type: detectFieldType(layer, k) }));
}
function paletteColor(name, i, total) {
    const p = COLOR_PALETTES[name] || COLOR_PALETTES.Tableau10;
    if (PALETTE_INFO[name]?.type === 'qualitative') return p[i % p.length];
    // sequential/divergent: spread across palette
    const idx = total <= 1 ? 0 : Math.round((i / (total - 1)) * (p.length - 1));
    return p[clamp(idx, 0, p.length - 1)];
}
function fieldExpr(field) {
  return ['to-string', ['coalesce', ['at', 0, ['get', field]], ['get', field]]];
}
function buildColorMatch(field, categories, def) {
    const expr = ['match', fieldExpr(field)];
    const seen = new Set();
    categories.forEach((c) => { const k = String(c.value); if (!seen.has(k)) { seen.add(k); expr.push(k, c.color); } });
    expr.push(def || '#999999');
    return expr;
}
function transformedValueExpr(field, method) {
    if (method === 'log') return ['ln', ['+', ['to-number', ['get', field]], 1]];
    if (method === 'sqrt') return ['sqrt', ['to-number', ['get', field]]];
    return ['to-number', ['get', field]];
}
function transformedBounds(range, method) {
    if (method === 'log') return [Math.log(range[0] + 1), Math.log(range[1] + 1)];
    if (method === 'sqrt') return [Math.sqrt(range[0]), Math.sqrt(range[1])];
    return [range[0], range[1]];
}
function buildColorGraduated(field, range, palette, method) {
    const p = COLOR_PALETTES[palette] || COLOR_PALETTES.Viridis;
    const [inMin, inMax] = transformedBounds(range, method);
    const expr = ['interpolate', ['linear'], transformedValueExpr(field, method)];
    const step = (inMax - inMin) / (p.length - 1) || 1;
    p.forEach((c, i) => expr.push(inMin + step * i, c));
    return expr;
}
function buildNumGraduated(field, range, outRange, method) {
    const [inMin, inMax] = transformedBounds(range, method);
    return ['interpolate', ['linear'], transformedValueExpr(field, method), inMin, outRange[0], inMax, outRange[1]];
}
function interpolateValue(value, range, outRange, method) {
    let v = parseFloat(value); if (isNaN(v)) return outRange[0];
    let [inMin, inMax] = transformedBounds(range, method);
    if (method === 'log') v = Math.log(v + 1); else if (method === 'sqrt') v = Math.sqrt(v);
    const r = clamp((v - inMin) / ((inMax - inMin) || 1), 0, 1);
    return outRange[0] + r * (outRange[1] - outRange[0]);
}

/**
 * Opacité de rendu par défaut, selon la géométrie et le mode surfacique.
 *
 * **Un volume est opaque, et ce n'est pas un goût.** `fill-extrusion-opacity`
 * sous 1 fait basculer MapLibre en rendu transparent : il cesse d'écrire la
 * profondeur, et l'occlusion est perdue. Chaque bloc laisse alors voir sa face
 * arrière au travers de sa face avant — un double contour sur chaque objet —,
 * les recouvrements s'assombrissent par accumulation d'alpha, et deux couches
 * extrudées se traversent au lieu de se masquer. Sur une grille d'analyse dense,
 * le relief de l'information disparaît dans une bouillie.
 *
 * Le basculement est **binaire** : mesuré à 0,999, 0,99 et 0,95, l'artefact est
 * déjà là — seule son intensité suit l'opacité. Il n'y a donc pas de « presque
 * opaque » utilisable, et le défaut d'un volume ne peut être que 1.
 *
 * À plat, c'est l'inverse : la semi-transparence laisse lire le fond de carte
 * sous la donnée, et MapLibre drape sans problème de profondeur. D'où 0,55.
 *
 * Une opacité explicitement choisie reste respectée — on peut vouloir voir au
 * travers, en connaissance de cause.
 */
function defaultLayerOpacity(layer) {
    const g = layer.geometryType;
    if (g === 'Point' || g === 'MultiPoint') return 0.92;
    if (g === 'Polygon' || g === 'MultiPolygon') {
        return layer.style?.polygonMode === 'flat' ? 0.55 : 1;
    }
    return 0.9;
}

function initSymbolization(layer) {
    if (!layer.style) layer.style = {};
    if (!layer.style.symbolization) {
        layer.style.symbolization = {
            color: { mode: 'single', field: null, value: layer.color, palette: 'Tableau10', colorRamp: 'Viridis', categories: [], defaultColor: '#999999', method: 'linear' },
            size: { mode: 'single', field: null, value: layer.geometryType === 'Point' ? 8 : (layer.geometryType === 'Polygon' ? 12 : 4), outputRange: [4, 24], method: 'linear' },
            model: { mode: 'single', field: null, categories: [], defaultModelId: null },
            label: { enabled: false, field: null },
        };
    }
    const sym = layer.style.symbolization;
    // Réglages d'apparence introduits après coup : complétés ici pour que les
    // couches déjà enregistrées dans Atlas_LayerPrefs les reçoivent aussi.
    // `opacity: null` = suivre le défaut de la géométrie (ou l'opacité du style
    // déclaratif) ; une valeur numérique = choix explicite de l'utilisateur.
    if (!('opacity' in sym)) sym.opacity = null;
    if (!sym.stroke) {
        sym.stroke = { enabled: true, mode: 'follow', color: null, width: 1.5 };
    }
    if (!sym.extrusion) sym.extrusion = { base: 0 };
    // Comme `stroke` et `extrusion` : cree s'il manque, pas seulement complete.
    // Une couche enregistree avant l'arrivee des etiquettes — ou restauree
    // depuis une etape de recit anterieure, `applyStoryLayerMeta` remplacant
    // toute la symbolisation — arrivait sans `label`, et l'onglet Etiquette
    // lisait alors `undefined.enabled`.
    if (!sym.label) sym.label = { enabled: false, field: null };
    if (sym.label.size == null) sym.label.size = 12;
    if (!sym.label.color) sym.label.color = '#2D2820';
    return sym;
}

// ============================================================
// AMBIANCE — soleil + lune (jour/crépuscule/nuit), inspiré EclExt
// ============================================================
function _lerp(a, b, t) { return a + (b - a) * clamp(t, 0, 1); }
function _lerpHex(c1, c2, t) {
    t = clamp(t, 0, 1);
    return '#' + [0, 1, 2].map((i) => Math.round(c1[i] + (c2[i] - c1[i]) * t).toString(16).padStart(2, '0')).join('');
}
function computeMoon(date, lat, lng) {
    if (typeof SunCalc === 'undefined') return null;
    try {
        const pos = SunCalc.getMoonPosition(date, lat, lng);
        const illum = SunCalc.getMoonIllumination(date);
        const altDeg = pos.altitude * 180 / Math.PI;
        const azDeg = ((pos.azimuth * 180 / Math.PI) + 180) % 360;
        let altFactor = altDeg > 0 ? Math.sin(altDeg * Math.PI / 180) * (altDeg < 20 ? altDeg / 20 : 1) : 0;
        const distFactor = Math.pow(384400 / (pos.distance || 384400), 2);
        const moonIntensity = Math.min(1, illum.fraction * altFactor * distFactor / 0.4);
        return { altDeg, azDeg, fraction: illum.fraction, phase: illum.phase, isUp: altDeg > 0, moonIntensity };
    } catch (e) { return null; }
}
// Renvoie les paramètres d'ambiance pour une altitude solaire donnée
function computeAmbient(altDeg, moon) {
    const DAY = [255, 255, 255], GOLD = [255, 210, 140], TWIL = [120, 110, 150], NIGHT = [16, 22, 52];
    let sunColor, sunIntensity, ambientColor, ambientIntensity, mapColor, mapIntensity, sky, horizon;
    if (altDeg > 8) { sunColor = '#ffffff'; sunIntensity = 2.0; ambientColor = '#f3ecd9'; ambientIntensity = 1.0; mapColor = '#ffffff'; mapIntensity = 0.55; sky = '#aacbe8'; horizon = '#f3ecd9'; }
    else if (altDeg > 0) { const t = altDeg / 8; sunColor = _lerpHex(GOLD, DAY, t); sunIntensity = _lerp(1.2, 2.0, t); ambientColor = _lerpHex(GOLD, [243, 236, 217], t); ambientIntensity = _lerp(0.8, 1.0, t); mapColor = _lerpHex(GOLD, DAY, t); mapIntensity = _lerp(0.4, 0.55, t); sky = _lerpHex([230, 150, 90], [170, 203, 232], t); horizon = '#f0c89a'; }
    else if (altDeg > -6) { const t = (altDeg + 6) / 6; sunColor = _lerpHex(TWIL, GOLD, t); sunIntensity = _lerp(0.4, 1.2, t); ambientColor = _lerpHex([60, 60, 95], GOLD, t); ambientIntensity = _lerp(0.45, 0.8, t); mapColor = _lerpHex([90, 90, 130], GOLD, t); mapIntensity = _lerp(0.3, 0.4, t); sky = _lerpHex([60, 55, 90], [230, 150, 90], t); horizon = _lerpHex([70, 60, 95], [240, 200, 154], t); }
    else { const t = clamp((altDeg + 18) / 12, 0, 1); sunColor = '#1a2030'; sunIntensity = _lerp(0.06, 0.4, t); ambientColor = _lerpHex(NIGHT, [60, 60, 95], t); ambientIntensity = _lerp(0.22, 0.45, t); mapColor = _lerpHex([20, 28, 60], [90, 90, 130], t); mapIntensity = _lerp(0.16, 0.3, t); sky = _lerpHex([8, 11, 28], [60, 55, 90], t); horizon = _lerpHex([14, 18, 42], [70, 60, 95], t); }
    let hemiIntensity = clamp(0.2 + (altDeg + 6) / 40, 0.12, 0.55);
    // Apport lunaire la nuit
    if (moon && altDeg < -2 && moon.isUp && moon.moonIntensity > 0.05) {
        const mi = moon.moonIntensity;
        ambientIntensity += mi * 0.22; mapIntensity += mi * 0.12; hemiIntensity += mi * 0.15;
        ambientColor = _lerpHex([parseInt(ambientColor.slice(1, 3), 16), parseInt(ambientColor.slice(3, 5), 16), parseInt(ambientColor.slice(5, 7), 16)], [120, 140, 190], Math.min(0.5, mi * 0.5));
    }
    return { sunColor, sunIntensity, ambientColor, ambientIntensity, hemiIntensity, mapColor, mapIntensity, sky, horizon };
}

// ============================================================
// PROTOCOLE ignmnt:// — décodage MNT IGN (GeoTIFF Float32 → TerrainRGB)
// dans un pool de Web Workers (hors thread principal). Pool créé à la
// première utilisation (évite le coût si le relief IGN n'est pas activé).
// ============================================================
let _ignDemPool = null;
function ignDemPool() {
    if (_ignDemPool) return _ignDemPool;
    const src = `
        self.importScripts('https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js');
        self.onmessage = async (e) => {
            const { id, buffer } = e.data;
            try {
                const tiff = await GeoTIFF.fromArrayBuffer(buffer);
                const image = await tiff.getImage();
                const rasters = await image.readRasters();
                const w = image.getWidth(), h = image.getHeight(), elev = rasters[0];
                const rgba = new Uint8ClampedArray(w*h*4);
                for (let i=0;i<elev.length;i++){ let v=elev[i]; if(!isFinite(v)||v<-500||v>9000)v=0; const enc=Math.round((v+10000)/0.1); rgba[i*4]=(enc>>16)&255; rgba[i*4+1]=(enc>>8)&255; rgba[i*4+2]=enc&255; rgba[i*4+3]=255; }
                const c = new OffscreenCanvas(w,h); c.getContext('2d').putImageData(new ImageData(rgba,w,h),0,0);
                const b = await c.convertToBlob({type:'image/png'}); const out = new Uint8Array(await b.arrayBuffer());
                self.postMessage({ id, ok:true, data: out }, [out.buffer]);
            } catch(err) { self.postMessage({ id, ok:false, error: String(err && err.message || err) }); }
        };`;
    const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
    const N = Math.min(3, navigator.hardwareConcurrency || 2);
    const workers = []; const pending = new Map(); let seq = 0, rr = 0;
    for (let i = 0; i < N; i++) {
        const w = new Worker(url);
        w.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); e.data.ok ? p.resolve(e.data.data) : p.reject(new Error(e.data.error)); };
        workers.push(w);
    }
    _ignDemPool = { decode(buf) { return new Promise((res, rej) => { const id = ++seq; pending.set(id, { resolve: res, reject: rej }); workers[rr++ % N].postMessage({ id, buffer: buf }, [buf]); }); } };
    return _ignDemPool;
}
let _flatDem = null;
async function flatDemTile() {
    if (_flatDem) return _flatDem;
    const size = 256, rgba = new Uint8ClampedArray(size * size * 4), e0 = Math.round(10000 / 0.1);
    for (let i = 0; i < size * size; i++) { rgba[i * 4] = (e0 >> 16) & 255; rgba[i * 4 + 1] = (e0 >> 8) & 255; rgba[i * 4 + 2] = e0 & 255; rgba[i * 4 + 3] = 255; }
    const c = new OffscreenCanvas(size, size); c.getContext('2d').putImageData(new ImageData(rgba, size, size), 0, 0);
    _flatDem = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
    return _flatDem;
}
(function registerIGNTerrain() {
    if (typeof maplibregl === 'undefined' || typeof OffscreenCanvas === 'undefined') return;
    maplibregl.addProtocol('ignmnt', async (params, abort) => {
        const url = 'https://' + params.url.replace('ignmnt://', '');
        try {
            const r = await fetch(url, { signal: abort.signal, headers: { 'Accept': 'image/tiff, image/geotiff' } });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const buf = await r.arrayBuffer();
            const hd = new Uint8Array(buf, 0, 4);
            const isTiff = (hd[0] === 0x49 && hd[1] === 0x49) || (hd[0] === 0x4D && hd[1] === 0x4D);
            if (!isTiff || buf.byteLength < 100) throw new Error('not tiff');
            return { data: await ignDemPool().decode(buf) };
        } catch (e) { if (abort.signal.aborted) throw e; return { data: await flatDemTile() }; }
    });
})();

// ============================================================
// MODÈLES 3D — custom layer three.js, rendu InstancedMesh
// (moteur inspiré d'EclExt : origine locale, instancing, fast-path
//  d'édition, culling viewport, placement sur le relief)
// ============================================================
const MAX_3D_INSTANCES = 20000;       // plafond élevé grâce à l'instancing
const MODEL3D_ZOOM_GATE = 11;          // sous ce zoom on cache la 3D si beaucoup d'objets
/** Zoom auquel MapLibre a fini de passer du globe au plan (mesure : 0 px d'ecart des z12). */
const GLOBE_MERCATOR_ZOOM = 12;
const MODEL3D_GATE_COUNT = 4000;
const SHADOW_FEATURE_CAP = 1500;       // ombres portées réelles seulement sous ce nombre d'objets visibles
const EXTRUSION_SHADOW_CAP = 650;      // casters d'ombre pour bâti extrudé MapLibre (hors GLB)

/** Ecart d'altitude a l'origine au-dela duquel la scene 3D est recalculee, en metres. */
const DERIVE_ORIGINE_M = 0.5;

/** Palier de zoom du dernier echantillonnage du relief, et son minuteur. */
let _palierDemCale = null;
let _recalageTimer = null;
/** Regroupe l'arrivee des tuiles MNT : elles tombent par dizaines, un seul recalage suffit. */
let _tuilesDemTimer = null;

const Models3D = {
    layerId: 'three-models-3d',
    scene: null, camera: null, renderer: null,
    gltfCache: new Map(),   // url -> Promise<THREE.Group|null>
    protoCache: new Map(),  // url -> [{geometry, material, mat}] | null
    groups: new Map(),      // url -> { meshes:[{im, protoMat}], items:[{layerId, idx, lng, lat}] }
    slotIndex: new Map(),   // `${layerId}:${idx}` -> { url, slot }
    extrusionShadows: [],   // Mesh[] — casters invisibles pour bâti fill-extrusion
    origin: null, originMC: null, originScale: 1, originElev: 0,
    elevCache: new Map(),
    sunDir: new THREE.Vector3(0.4, 0.7, 0.4).normalize(),
    dirLight: null, ambLight: null, hemiLight: null, groundShadow: null, _shadowFeasible: false,
    _buildTimer: null, _cullTimer: null, _driftTimer: null, _lastOriginElev: undefined,
    _wCanvas: 0, _hCanvas: 0,   // derniere taille de canvas appliquee au renderer
    _m4Origin: new THREE.Matrix4(), _m4VP: new THREE.Matrix4(),
    _mRotX: new THREE.Matrix4().makeRotationX(Math.PI / 2),
    _vScale: new THREE.Vector3(), _obj: new THREE.Object3D(), _m4: new THREE.Matrix4(),

    scheduleBuild() { clearTimeout(this._buildTimer); this._buildTimer = setTimeout(() => this.build(), 60); },
    forceBuild() { clearTimeout(this._buildTimer); this._buildTimer = null; this.build(); }, // rebuild immédiat (changement de modèle)
    // alias rétro-compat (anciens appels)
    rebuildScene() { this.build(); },
    scheduleRebuild() { this.scheduleBuild(); },

    /**
     * Centre lumière + taille du frustum d'ombre sur l'emprise **écran** visible.
     * Un ortho fixe (±400 m) créait une pastille / triangle net au pan — moche.
     */
    syncShadowRig() {
        if (!this.dirLight?.shadow || !map || !this.origin) return;
        const c = map.getCenter();
        const lmC = this.localMeters(c.lng, c.lat);
        const cx = lmC.x, cz = -lmC.y;

        // Coins + bords du canvas → lng/lat → mètres locaux (gère le pitch mieux que getBounds seul).
        const canvas = map.getCanvas();
        const w = canvas?.clientWidth || 800, h = canvas?.clientHeight || 600;
        const screenPts = [
            [0, 0], [w, 0], [0, h], [w, h],
            [w / 2, 0], [w / 2, h], [0, h / 2], [w, h / 2],
        ];
        let maxR = 0;
        for (const [sx, sy] of screenPts) {
            let ll;
            try { ll = map.unproject([sx, sy]); } catch (_) { continue; }
            if (!ll || !Number.isFinite(ll.lng)) continue;
            const lm = this.localMeters(ll.lng, ll.lat);
            maxR = Math.max(maxR, Math.hypot(lm.x - cx, (-lm.y) - cz));
        }
        // Repli : emprise géographique si unproject échoue (globe extrême).
        if (!(maxR > 10)) {
            const b = map.getBounds();
            for (const p of [
                this.localMeters(b.getWest(), b.getSouth()),
                this.localMeters(b.getWest(), b.getNorth()),
                this.localMeters(b.getEast(), b.getSouth()),
                this.localMeters(b.getEast(), b.getNorth()),
            ]) {
                maxR = Math.max(maxR, Math.hypot(p.x - cx, (-p.y) - cz));
            }
        }

        let half = Math.max(maxR * 1.3, 320);
        half = Math.min(half, 2200);

        const sh = this.dirLight.shadow;
        const cam = sh.camera;
        cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
        cam.near = 1;
        cam.far = Math.max(half * 4.5, 1400);
        cam.updateProjectionMatrix();

        const side = half > 800 ? 4096 : 2048;
        if (sh.mapSize.x !== side) {
            sh.mapSize.set(side, side);
            if (sh.map) { sh.map.dispose(); sh.map = null; }
        }

        const dist = Math.max(half * 1.5, 400);
        this.dirLight.target.position.set(cx, 0, cz);
        this.dirLight.position.set(
            cx + this.sunDir.x * dist,
            Math.max(this.sunDir.y * dist, dist * 0.4),
            cz + this.sunDir.z * dist,
        );
        this.dirLight.target.updateMatrixWorld();
        cam.updateMatrixWorld?.();
        if (this.groundShadow) this.groundShadow.position.set(cx, 0.02, cz);
    },

    makeLayer() {
        const self = this;
        return {
            id: self.layerId, type: 'custom', renderingMode: '3d',
            onAdd(m, gl) {
                self.camera = new THREE.Camera();
                self.scene = new THREE.Scene();
                self.ambLight = new THREE.AmbientLight(0xffffff, 1.0);
                self.dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
                self.dirLight.position.copy(self.sunDir).multiplyScalar(100);
                self.hemiLight = new THREE.HemisphereLight(0xbcd4e8, 0x55492f, 0.45);
                self.scene.add(self.ambLight, self.dirLight, self.hemiLight);
                self.renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
                self.renderer.autoClear = false;
                // Ombres portées (shadow maps) — actives seulement hors terrain 3D
                // (avec terrain MapLibre rend dans un FBO offscreen incompatible).
                try {
                    self.renderer.shadowMap.enabled = true;
                    self.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                    self.dirLight.castShadow = true;
                    const sh = self.dirLight.shadow;
                    sh.mapSize.set(2048, 2048);
                    sh.camera.near = 1; sh.camera.far = 2500;
                    // Frustum initial ; recalé chaque frame sur l'emprise visible (cf. syncShadowRig).
                    sh.camera.left = -600; sh.camera.right = 600; sh.camera.top = 600; sh.camera.bottom = -600;
                    sh.camera.updateProjectionMatrix();
                    sh.bias = -0.0008; sh.normalBias = 0.35;
                    self.scene.add(self.dirLight.target);
                    const g = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.ShadowMaterial({ opacity: 0.32 }));
                    g.rotation.x = -Math.PI / 2; g.position.y = 0.02; g.receiveShadow = true; g.frustumCulled = false;
                    self.groundShadow = g; self.scene.add(g);
                } catch (e) { console.warn('shadow setup', e.message); }
                self.build();
            },
            render(gl, matrix) {
                if (!self.renderer || !self.origin) {
                    self._skipReason = !self.renderer ? 'no-renderer' : 'no-origin';
                    return;
                }
                // MapLibre 5 : objet CustomRenderMethodInput.
                // Exemple officiel three.js : defaultProjectionData.mainMatrix
                // (modelViewProjectionMatrix en premier projetait hors écran).
                let arr = null;
                if (matrix) {
                    if (Array.isArray(matrix) || ArrayBuffer.isView(matrix)) arr = matrix;
                    else {
                        arr = matrix.defaultProjectionData?.mainMatrix
                            || matrix.modelViewProjectionMatrix
                            || matrix.mainMatrix
                            || matrix.matrix
                            || null;
                    }
                }
                if (!arr || !(arr.length >= 16 || arr.byteLength >= 64)) {
                    self._skipReason = 'no-matrix';
                    self._matrixHint = matrix == null ? 'null'
                        : (ArrayBuffer.isView(matrix) ? 'view'
                            : (typeof matrix === 'object' ? Object.keys(matrix).slice(0, 12).join(',') : typeof matrix));
                    return;
                }
                self._skipReason = null;
                self._renderFrames = (self._renderFrames || 0) + 1;
                // L'altitude qui translate la scene DOIT etre celle qui a servi a
                // calculer la position verticale des instances (`placement`). La
                // sonder ici a chaque frame les desynchronisait : `originElev` ne
                // se rafraichit qu'apres coup, et entre-temps la scene glissait.
                const elev = STATE.settings.terrain3D ? self.originElev : 0;
                // Sonde de derive, hors du chemin de rendu : elle ne fait que
                // declencher un recalcul ou placement et rendu repartent ensemble.
                if (STATE.settings.terrain3D) {
                    const sondee = map.queryTerrainElevation(self.origin);
                    if (Number.isFinite(sondee) && Math.abs(sondee - elev) > DERIVE_ORIGINE_M) {
                        clearTimeout(self._driftTimer);
                        self._driftTimer = setTimeout(() => self.recomputeAll(), 200);
                    }
                }
                const mc = maplibregl.MercatorCoordinate.fromLngLat(self.origin, elev);
                const s = mc.meterInMercatorCoordinateUnits();
                self._vScale.set(s, -s, s);
                self._m4Origin.makeTranslation(mc.x, mc.y, mc.z).scale(self._vScale).multiply(self._mRotX);
                // Ombres : seulement hors terrain, sous le plafond d'objets, et zoomé.
                const wantShadow = STATE.settings.shadows && !STATE.settings.terrain3D && self._shadowFeasible && self.sunDir.y > 0.05 && map.getZoom() >= 14;
                if (self.renderer.shadowMap.enabled !== wantShadow) self.renderer.shadowMap.enabled = wantShadow;
                self.dirLight.castShadow = wantShadow;
                if (self.groundShadow) self.groundShadow.visible = wantShadow;
                if (wantShadow) {
                    // Frustum = emprise visible (pas un carré fixe de 400 m) :
                    // sinon une « pastille » d'ombre suit le centre et coupe net.
                    self.syncShadowRig();
                    // Soleil bas → ombres très longues = tache noire moche : adoucir.
                    if (self.groundShadow?.material) {
                        const al = Math.max(0, Math.min(1, self.sunDir.y));
                        self.groundShadow.material.opacity = 0.16 + al * 0.2;
                    }
                } else {
                    self.dirLight.position.copy(self.sunDir).multiplyScalar(300);
                }
                self._m4VP.fromArray(arr).multiply(self._m4Origin);
                self.camera.projectionMatrix.copy(self._m4VP);
                self.renderer.resetState();
                // Ne PAS vider le depth buffer ici, et ne pas repasser la couche
                // en `renderingMode: '2d'`.
                //
                // Les deux avaient ete introduits ensemble contre un symptome :
                // un GLB masque sur fond raster. Mesure sur la demo Vieille-
                // Charite, etape « La matiere » (GLB seul, ortho IGN, aucune
                // couche extrudee) : sans eux le modele est **net et porte son
                // ombre** ; avec eux il perd son auto-occlusion — les faces
                // arriere se peignent par-dessus les faces avant, ce qui se lit
                // comme des normales inversees — et son ombre disparait.
                //
                // Le cas ou ils aidaient est autre : une couche extrudee de la
                // scene occupe le meme volume que le GLB (l'emprise cadastrale
                // du monument, presente dans le bati). Les faire passer devant
                // masquait cette superposition au lieu de la resoudre, et le
                // prix se payait partout ailleurs. La correction appartient a la
                // scene : ne pas montrer deux representations du meme batiment.
                // three.js releve la taille du canvas A SA CREATION et ne la
                // revoit jamais : le canvas etant celui de MapLibre, toute
                // largeur qui change ensuite — l'ouverture d'un panneau, la
                // fermeture de l'inspecteur — laisse le renderer sur son
                // ancien viewport. Les objets sont alors dessines a la mauvaise
                // echelle ET decales, ce qui se lit comme un glissement pendant
                // la navigation. D'ou le symptome : les modeles ne bougent que
                // lorsqu'un des panneaux est ouvert.
                const cv = map.getCanvas();
                if (self._wCanvas !== cv.width || self._hCanvas !== cv.height) {
                    self.renderer.setViewport(0, 0, cv.width, cv.height);
                    self._wCanvas = cv.width; self._hCanvas = cv.height;
                }
                self.renderer.render(self.scene, self.camera);
            },
            onRemove() { self.disposeInstances(); self.renderer?.dispose?.(); self.renderer = null; self.scene = null; },
        };
    },

    async ensureGLTF(url) {
        if (!this.gltfCache.has(url)) {
            const loader = new GLTFLoader();
            this.gltfCache.set(url, loader.loadAsync(url).then((g) => g.scene).catch((e) => { console.warn('GLTF load failed', url, e.message); return null; }));
        }
        return this.gltfCache.get(url);
    },
    /** Matériaux GLB : opaques, faces doubles (échelle Y négative mercator). */
    fixGltfMaterial(m) {
        const c = m.clone();
        c.side = THREE.DoubleSide;
        // Photogrammétrie / Sketchfab : éviter le « fantôme » (alpha / depth).
        c.transparent = false;
        c.opacity = 1;
        c.depthWrite = true;
        c.depthTest = true;
        c.alphaTest = 0;
        if (c.map) { c.map.colorSpace = THREE.SRGBColorSpace; c.map.needsUpdate = true; }
        c.needsUpdate = true;
        return c;
    },
    // prototypes = liste de sous-mailles {geometry, material, mat(local)} pour l'instancing
    async ensureProto(url) {
        if (this.protoCache.has(url)) return this.protoCache.get(url);
        const scene = await this.ensureGLTF(url);
        if (!scene) { this.protoCache.set(url, null); return null; }
        scene.updateMatrixWorld(true);
        const parts = [];
        scene.traverse((o) => {
            if (!o.isMesh || !o.geometry) return;
            const material = Array.isArray(o.material)
                ? o.material.map((m) => this.fixGltfMaterial(m))
                : this.fixGltfMaterial(o.material);
            parts.push({ geometry: o.geometry, material, mat: o.matrixWorld.clone() });
        });
        const v = parts.length ? parts : null;
        this.protoCache.set(url, v); return v;
    },
    /** Clone de scène pour 1 monument (hors InstancedMesh — textures plus fiables). */
    async ensureMonumentRoot(url) {
        const scene = await this.ensureGLTF(url);
        if (!scene) return null;
        const root = scene.clone(true);
        root.traverse((o) => {
            if (!o.isMesh) return;
            o.castShadow = true;
            o.receiveShadow = true;
            o.frustumCulled = false;
            if (Array.isArray(o.material)) o.material = o.material.map((m) => this.fixGltfMaterial(m));
            else if (o.material) o.material = this.fixGltfMaterial(o.material);
        });
        root.matrixAutoUpdate = false;
        return root;
    },

    /**
     * Altitude de l'origine de la scene, conservee si la tuile a disparu.
     *
     * L'origine est un objet fixe, vite hors champ : le repli `|| 0` la ramenait
     * au niveau de la mer et faisait sauter toute la scene.
     */
    readOriginElev() {
        if (!STATE.settings.terrain3D || !map) return 0;
        return altitudeOrigineStable(map.queryTerrainElevation(this.origin), this.originElev);
    },
    setOrigin(lng, lat) { this.origin = [lng, lat]; this.originMC = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 0); this.originScale = this.originMC.meterInMercatorCoordinateUnits(); },
    localMeters(lng, lat) { const mc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 0), s = this.originScale; return { x: (mc.x - this.originMC.x) / s, y: -(mc.y - this.originMC.y) / s }; },
    /**
     * Altitude du sol, ou `null` si la tuile MNT n'est pas encore chargee.
     * La distinction compte : `0` est une altitude valide en bord de mer, et
     * la confondre avec « pas de donnee » collerait les entites au niveau zero
     * sans jamais les relever.
     */
    elevRaw(lng, lat) {
        if (!STATE.settings.terrain3D || !map) return null;
        const k = ((lng * 1e4) | 0) + ',' + ((lat * 1e4) | 0);
        if (this.elevCache.has(k)) return this.elevCache.get(k);
        const v = map.queryTerrainElevation([lng, lat]);
        if (!Number.isFinite(v)) return null; // pas de cache : la tuile viendra
        if (this.elevCache.size > 8000) this.elevCache.clear();
        this.elevCache.set(k, v); return v;
    },
    // matrice de placement (espace local mètres, Y up) pour une feature
    placement(layer, feature) {
        const p = resolveFeatureProps(feature, layer);
        const [lng, lat] = feature.geometry.coordinates;
        const lm = this.localMeters(lng, lat);
        // Altitude relative a l'origine de la scene. Quand la tuile MNT manque,
        // l'entite se cale SUR l'origine (ecart nul) et non au niveau de la mer :
        // `readOriginElev` conservant la derniere altitude connue de l'origine,
        // un repli a zero ici enfoncait tous les objets de cette altitude — sur
        // un relief a 200 m, la scene entiere disparaissait sous le sol.
        const eOff = ecartAuSol(this.elevRaw(lng, lat), this.originElev);
        const o = this._obj;
        o.position.set(lm.x + (p.offsetX || 0), eOff + (p.offsetZ || 0), -lm.y - (p.offsetY || 0));
        const sc = p.scale || 1; o.scale.set(sc, sc, sc);
        o.rotation.set(deg2rad(p.rotationX || 0), deg2rad(p.rotationZ || 0), deg2rad(p.rotationY || 0), 'YXZ');
        o.updateMatrix();
        return o.matrix;
    },

    // collecte des features 3D dans l'emprise (culling viewport)
    collect() {
        const out = [];
        if (!map) return out;
        const b = map.getBounds(), buf = 0.004;
        for (const layer of STATE.layers) {
            if (layer.visible === false) continue;
            if (layer.geometryType !== 'Point' && layer.geometryType !== 'MultiPoint') continue;
            if (layer.style?.mode !== 'library' && layer.style?.mode !== 'custom') continue;
            const defUrl = getLayerModelUrl(layer);
            const sym = layer.style.symbolization || {};
            const categorized = sym.model?.mode === 'categorized' && sym.model.field;
            if (!defUrl && !categorized) continue;
            const feats = (filteredGeoJSON(layer)?.features || []);
            for (let idx = 0; idx < feats.length; idx++) {
                const f = feats[idx];
                const srcIdx = f.properties?._idx;
                if (srcIdx == null) continue;
                if (f.geometry?.type !== 'Point') continue;
                const [lng, lat] = f.geometry.coordinates;
                if (lng < b.getWest() - buf || lng > b.getEast() + buf || lat < b.getSouth() - buf || lat > b.getNorth() + buf) continue;
                let url = defUrl;
                if (categorized || f.properties?._modelId) { const mm = findModel(resolveFeatureProps(f, layer).modelId); if (mm) url = mm.url; }
                if (!url) continue;
                out.push({ layerId: layer.id, idx: srcIdx, lng, lat, url });
                if (out.length >= MAX_3D_INSTANCES) return out;
            }
        }
        return out;
    },

    /**
     * Bâti Atlas extrudé (MapLibre fill-extrusion) → volumes three.js invisibles
     * qui castent sur le même plan d'ombre que les GLB.
     * MapLibre ne projette pas d'ombres sur le fill-extrusion : sans ce pont,
     * seuls les modèles importés portent une ombre.
     */
    collectExtrusionsForShadow() {
        const out = [];
        if (!map || !STATE.settings.shadows || STATE.settings.terrain3D) return out;
        if (map.getZoom() < 14) return out;
        const b = map.getBounds(), buf = 0.004; // marge large : éviter le « trou » d'ombre au pan
        const cCenter = map.getCenter();
        const scored = [];
        for (const layer of STATE.layers) {
            if (layer.visible === false) continue;
            const gt = layer.geometryType;
            if (gt !== 'Polygon' && gt !== 'MultiPolygon') continue;
            if (layer.style?.polygonMode === 'flat') continue;
            const feats = featuresForExtrusionShadow(layer);
            for (let i = 0; i < feats.length; i++) {
                const f = feats[i];
                const c = featureCentroidLngLat(f);
                if (!c) continue;
                const [lng, lat] = c;
                if (lng < b.getWest() - buf || lng > b.getEast() + buf || lat < b.getSouth() - buf || lat > b.getNorth() + buf) continue;
                const h = featureExtrusionHeightM(f, layer);
                if (!(h > 0.5)) continue;
                // Distance en mètres approx. (pas en degrés) pour prioriser le bâti vraiment proche.
                const dx = (lng - cCenter.lng) * 85000;
                const dy = (lat - cCenter.lat) * 111000;
                const d2 = dx * dx + dy * dy;
                scored.push({ layer, feature: f, lng, lat, height: h, d2 });
            }
        }
        scored.sort((a, b2) => a.d2 - b2.d2);
        return scored.slice(0, EXTRUSION_SHADOW_CAP);
    },

    disposeExtrusionShadows() {
        if (!this.extrusionShadows?.length) { this.extrusionShadows = []; return; }
        for (const mesh of this.extrusionShadows) {
            this.scene?.remove(mesh);
            mesh.geometry?.dispose?.();
            if (mesh.material) {
                if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose?.());
                else mesh.material.dispose?.();
            }
        }
        this.extrusionShadows = [];
    },

    buildExtrusionShadowMeshes(items) {
        if (!this.scene || !this.origin || !items?.length) return;
        // Empreintes exactes fusionnées en un seul Mesh (même matériau que les
        // ombres GLB). Les AABB axis-alignées dépassaient / décalaieent du bâti.
        const mat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 1,
            metalness: 0,
            side: THREE.DoubleSide,
            shadowSide: THREE.DoubleSide,
            colorWrite: false,
            depthWrite: false,
        });
        const toLocal = (lng, lat) => this.localMeters(lng, lat);
        const geoms = [];
        for (const it of items) {
            const geom = extrudeFeatureToGeometry(it.feature, Math.max(it.height || 8, 2), toLocal);
            if (!geom) continue;
            // Shape XY = est/nord, +Z = hauteur → Y-up / Z=-nord
            geom.rotateX(-Math.PI / 2);
            geoms.push(geom);
        }
        if (!geoms.length) return;
        const merged = geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
        if (!merged) {
            geoms.forEach((g) => g.dispose?.());
            return;
        }
        if (geoms.length > 1) geoms.forEach((g) => g.dispose?.());
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        this.extrusionShadows.push(mesh);
    },

    async build() {
        if (this._disabled || CONFIG.light3d) { map?.triggerRepaint(); return; }
        if (!this.scene || !map) return;
        const token = (this._buildToken = (this._buildToken || 0) + 1);
        this.disposeInstances();
        this.disposeExtrusionShadows();
        // GeoJSON distant : charger le FC complet (querySourceFeatures est tuilé / incomplet).
        //
        // Mais seulement si une ombre peut en sortir. `collectExtrusionsForShadow`
        // écarte ensuite les mêmes cas — ombres coupées, relief actif, zoom trop
        // large, couche à plat — et se retrouvait donc à ne rien faire d'entités
        // qu'on venait de retélécharger. Mesuré sur une scène à plat : neuf
        // requêtes vers une couche qui ne produira jamais de caster.
        //
        // Les conditions sont celles du consommateur, et elles doivent le rester :
        // les dissocier ramènerait le téléchargement inutile sans que rien ne le
        // signale.
        const ombresPossibles = !!STATE.settings.shadows
            && !STATE.settings.terrain3D
            && map.getZoom() >= 14;
        if (ombresPossibles) {
            await Promise.all(
                STATE.layers
                    .filter((l) => l.visible !== false
                        && (l.geometryType === 'Polygon' || l.geometryType === 'MultiPolygon')
                        && l.style?.polygonMode !== 'flat')
                    .map((l) => ensureShadowFeatures(l)),
            );
        }
        if (!this.scene || token !== this._buildToken) return;
        const all = this.collect();
        const extrusions = this.collectExtrusionsForShadow();
        const z = map.getZoom();
        // Ombres : GLB sous plafond, ou bâti extrudé à proximité (même si aucun GLB).
        this._shadowFeasible = (all.length > 0 && all.length <= SHADOW_FEATURE_CAP) || extrusions.length > 0;
        if (z < GLOBE_MERCATOR_ZOOM && (STATE.settings.projection || 'globe') === 'globe') { map.triggerRepaint(); return; }

        if (!this.origin) {
            if (all[0]) this.setOrigin(all[0].lng, all[0].lat);
            else if (extrusions[0]) this.setOrigin(extrusions[0].lng, extrusions[0].lat);
            else {
                const c = map.getCenter();
                this.setOrigin(c.lng, c.lat);
            }
        }
        this.originElev = this.readOriginElev();

        const skipGltf = (z < MODEL3D_ZOOM_GATE && all.length > MODEL3D_GATE_COUNT) || all.length === 0;
        if (!skipGltf) {
            const byUrl = new Map();
            for (const it of all) { if (!byUrl.has(it.url)) byUrl.set(it.url, []); byUrl.get(it.url).push(it); }
            const urls = [...byUrl.keys()];
            if (!this.scene || token !== this._buildToken) return;

            this.slotIndex.clear();
            for (const url of urls) {
                const items = byUrl.get(url);
                // 1 exemplaire (monument GLB) : Group cloné — InstancedMesh abîme souvent
                // les textures photogrammétriques (chapelle « fantôme »).
                if (items.length === 1) {
                    const root = await this.ensureMonumentRoot(url);
                    if (!this.scene || token !== this._buildToken) return;
                    if (!root) continue;
                    const it = items[0];
                    const layer = STATE.layers.find((l) => l.id === it.layerId);
                    const feature = layer?.geojson?.features?.[it.idx];
                    if (!feature) continue;
                    const place = this.placement(layer, feature);
                    root.matrix.copy(place);
                    root.updateMatrixWorld(true);
                    this.scene.add(root);
                    this.slotIndex.set(it.layerId + ':' + it.idx, { url, slot: 0, monument: true });
                    this.groups.set(url, { meshes: [], roots: [root], items });
                    continue;
                }
                const proto = await this.ensureProto(url);
                if (!this.scene || token !== this._buildToken) return;
                if (!proto) continue;
                const meshes = proto.map((part) => {
                    const im = new THREE.InstancedMesh(part.geometry, part.material, items.length);
                    im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true;
                    return { im, protoMat: part.mat };
                });
                items.forEach((it, slot) => {
                    const layer = STATE.layers.find((l) => l.id === it.layerId);
                    const feature = layer?.geojson?.features?.[it.idx];
                    if (!feature) return;
                    const place = this.placement(layer, feature);
                    meshes.forEach(({ im, protoMat }) => { this._m4.multiplyMatrices(place, protoMat); im.setMatrixAt(slot, this._m4); });
                    this.slotIndex.set(it.layerId + ':' + it.idx, { url, slot });
                });
                meshes.forEach(({ im }) => { im.instanceMatrix.needsUpdate = true; this.scene.add(im); });
                this.groups.set(url, { meshes, roots: [], items });
            }
        }

        if (token !== this._buildToken) return;
        if (extrusions.length) this.buildExtrusionShadowMeshes(extrusions);
        map.triggerRepaint();
    },

    // recompute TOUTES les matrices (sans regrouper) — relief chargé / exagération
    recomputeAll() {
        if (!this.origin || !map || !this.scene) return;
        this.elevCache.clear();
        this.originElev = this.readOriginElev();
        for (const [, g] of this.groups) {
            if (g.roots?.length) {
                g.items.forEach((it, i) => {
                    const layer = STATE.layers.find((l) => l.id === it.layerId);
                    const feature = layer?.geojson?.features?.[it.idx];
                    if (!feature || !g.roots[i]) return;
                    g.roots[i].matrix.copy(this.placement(layer, feature));
                    g.roots[i].updateMatrixWorld(true);
                });
                continue;
            }
            g.items.forEach((it, slot) => {
                const layer = STATE.layers.find((l) => l.id === it.layerId);
                const feature = layer?.geojson?.features?.[it.idx];
                if (!feature) return;
                const place = this.placement(layer, feature);
                g.meshes.forEach(({ im, protoMat }) => { this._m4.multiplyMatrices(place, protoMat); im.setMatrixAt(slot, this._m4); });
            });
            g.meshes.forEach(({ im }) => { im.instanceMatrix.needsUpdate = true; });
        }
        map.triggerRepaint();
    },

    // FAST PATH — met à jour les matrices des features éditées sans rebuild
    updateEdited(layerId, indices) {
        if (!this.origin || !this.scene) { this.scheduleBuild(); return; }
        const layer = STATE.layers.find((l) => l.id === layerId); if (!layer) return;
        let touched = false, missing = false;
        for (const idx of indices) {
            const ref = this.slotIndex.get(layerId + ':' + idx);
            if (!ref) { missing = true; continue; }
            const g = this.groups.get(ref.url); if (!g) continue;
            const feature = layer.geojson.features[idx]; if (!feature) continue;
            const place = this.placement(layer, feature);
            if (ref.monument && g.roots?.[ref.slot]) {
                g.roots[ref.slot].matrix.copy(place);
                g.roots[ref.slot].updateMatrixWorld(true);
                touched = true;
                continue;
            }
            g.meshes.forEach(({ im, protoMat }) => { this._m4.multiplyMatrices(place, protoMat); im.setMatrixAt(ref.slot, this._m4); im.instanceMatrix.needsUpdate = true; });
            touched = true;
        }
        if (touched) map.triggerRepaint();
        if (missing) this.scheduleBuild();
    },

    cull() { clearTimeout(this._cullTimer); this._cullTimer = setTimeout(() => this.build(), 200); },

    disposeInstances() {
        this.disposeExtrusionShadows();
        if (!this.scene) { this.groups.clear(); this.slotIndex.clear(); return; }
        for (const [, g] of this.groups) {
            (g.meshes || []).forEach(({ im }) => { this.scene.remove(im); im.dispose?.(); });
            (g.roots || []).forEach((r) => { this.scene.remove(r); });
        }
        this.groups.clear(); this.slotIndex.clear();
    },

    setSun(azimuthDeg, altitudeDeg, moon) {
        const az = deg2rad(azimuthDeg), al = deg2rad(Math.max(-0.1, altitudeDeg));
        // espace scène local : X=est, Y=haut, Z=-nord
        this.sunDir.set(Math.sin(az) * Math.cos(al), Math.sin(al), -Math.cos(az) * Math.cos(al)).normalize();
        if (!this.dirLight) return;
        const amb = computeAmbient(altitudeDeg, moon);
        this.dirLight.color.set(amb.sunColor); this.dirLight.intensity = amb.sunIntensity * (STATE.settings.shadows ? 1.0 : 0.7);
        this.ambLight.color.set(amb.ambientColor); this.ambLight.intensity = amb.ambientIntensity;
        if (this.hemiLight) this.hemiLight.intensity = amb.hemiIntensity;
        map && map.triggerRepaint();
    },
};

/**
 * Entités pour ombres d'extrusion : en mémoire si Atlas les détient, sinon
 * via la source MapLibre (couches `geojson: url` distantes).
 * Préfère `_data` complet de la source GeoJSON à `querySourceFeatures`
 * (index tuilé incomplet → bâti proche souvent absent).
 */
function featuresForExtrusionShadow(layer) {
    const gj = filteredGeoJSON(layer);
    if (gj && typeof gj === 'object' && Array.isArray(gj.features)) return gj.features;
    if (layer._shadowFeatCache?.length) return layer._shadowFeatCache;
    const src = map?.getSource?.(layer.id);
    // GeoJSONSource MapLibre : `_data` = FeatureCollection entière après fetch.
    const raw = src?._data ?? src?._options?.data;
    if (raw && typeof raw === 'object' && Array.isArray(raw.features)) {
        layer._shadowFeatCache = raw.features;
        return raw.features;
    }
    if (!src) return [];
    try {
        const feats = map.querySourceFeatures(layer.id) || [];
        const seen = new Set();
        const out = [];
        for (const f of feats) {
            const id = f.id ?? f.properties?._idx ?? f.properties?._osmId
                ?? JSON.stringify(f.geometry?.coordinates?.[0]?.[0]);
            if (seen.has(id)) continue;
            seen.add(id);
            out.push(f);
        }
        return out;
    } catch (_) {
        return [];
    }
}

/** Précharge le GeoJSON distant pour les ombres bâti (une fois par couche). */
async function ensureShadowFeatures(layer) {
    if (layer._shadowFeatCache?.length) return layer._shadowFeatCache;
    const local = filteredGeoJSON(layer);
    if (local && typeof local === 'object' && Array.isArray(local.features)) {
        layer._shadowFeatCache = local.features;
        return layer._shadowFeatCache;
    }
    const fromSrc = featuresForExtrusionShadow(layer);
    if (fromSrc.length > 100) { // _data déjà peuplé
        layer._shadowFeatCache = fromSrc;
        return fromSrc;
    }
    const url = typeof layer.geojson === 'string' ? layer.geojson : null;
    if (!url) return fromSrc;
    try {
        const r = await fetch(url);
        if (!r.ok) return fromSrc;
        const gj = await r.json();
        layer._shadowFeatCache = gj.features || [];
        return layer._shadowFeatCache;
    } catch (_) {
        return fromSrc;
    }
}

/** Centroïde lng/lat grossier d'une feature polygone (ombres bâti). */
function featureCentroidLngLat(feature) {
    const g = feature?.geometry;
    if (!g) return null;
    if (g.type === 'Point') return g.coordinates;
    let ring = null;
    if (g.type === 'Polygon') ring = g.coordinates?.[0];
    else if (g.type === 'MultiPolygon') ring = g.coordinates?.[0]?.[0];
    if (!ring?.length) return null;
    let x = 0, y = 0, n = 0;
    for (const p of ring) {
        if (p?.[0] == null) continue;
        x += p[0]; y += p[1]; n++;
    }
    return n ? [x / n, y / n] : null;
}

function featureExtrusionHeightM(feature, layer) {
    const p = feature?.properties || {};
    if (layer?.heightField != null && p[layer.heightField] != null && p[layer.heightField] !== '') {
        const h = Number(p[layer.heightField]);
        if (Number.isFinite(h) && h > 0) return Math.min(h, 120);
    }
    for (const k of ['height_m', 'height', 'building:levels']) {
        if (p[k] == null || p[k] === '') continue;
        let h = Number(p[k]);
        if (k === 'building:levels' && Number.isFinite(h)) h *= 3.2;
        if (Number.isFinite(h) && h > 0) return Math.min(h, 120);
    }
    const sym = layer?.style?.symbolization?.size;
    const v = Number(sym?.value);
    return Number.isFinite(v) && v > 0 ? v : 12;
}

function simplifyRingLngLat(ring, maxPts = 28) {
    if (!ring?.length) return [];
    // drop closing duplicate
    const open = ring.length > 1
        && ring[0][0] === ring[ring.length - 1][0]
        && ring[0][1] === ring[ring.length - 1][1]
        ? ring.slice(0, -1)
        : ring.slice();
    if (open.length <= maxPts) return open;
    const step = Math.ceil(open.length / maxPts);
    const out = [];
    for (let i = 0; i < open.length; i += step) out.push(open[i]);
    const last = open[open.length - 1];
    if (out[out.length - 1] !== last) out.push(last);
    return out;
}

/** Emprise approx. en mètres locaux (bbox) pour caster d'ombre bâti. */
function featureFootprintMeters(feature, toLocal) {
    const g = feature?.geometry;
    let ring = null;
    if (g?.type === 'Polygon') ring = g.coordinates?.[0];
    else if (g?.type === 'MultiPolygon') ring = g.coordinates?.[0]?.[0];
    if (!ring?.length) return { w: 8, d: 8 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pt of ring) {
        if (pt?.[0] == null) continue;
        const lm = toLocal(pt[0], pt[1]);
        if (lm.x < minX) minX = lm.x;
        if (lm.x > maxX) maxX = lm.x;
        if (lm.y < minY) minY = lm.y;
        if (lm.y > maxY) maxY = lm.y;
    }
    if (!Number.isFinite(minX)) return { w: 8, d: 8 };
    return { w: Math.min(maxX - minX, 80), d: Math.min(maxY - minY, 80) };
}

/**
 * Emprise GeoJSON → ExtrudeGeometry en mètres locaux (plan XY = est/nord).
 * `toLocal(lng,lat) -> {x,y}` avec y = nord.
 * Conservé pour debug / raffinement futur (casters footprint exact).
 */
function extrudeFeatureToGeometry(feature, heightM, toLocal) {
    const g = feature?.geometry;
    if (!g || !(heightM > 0)) return null;
    const polys = g.type === 'Polygon' ? [g.coordinates]
        : g.type === 'MultiPolygon' ? g.coordinates
            : null;
    if (!polys?.length) return null;
    // Plus grand anneau extérieur
    let best = null, bestArea = -1;
    for (const poly of polys) {
        const outer = poly?.[0];
        if (!outer || outer.length < 3) continue;
        let a = 0;
        for (let i = 0; i < outer.length - 1; i++) {
            a += outer[i][0] * outer[i + 1][1] - outer[i + 1][0] * outer[i][1];
        }
        a = Math.abs(a);
        if (a > bestArea) { bestArea = a; best = poly; }
    }
    if (!best) return null;
    const ring = simplifyRingLngLat(best[0]);
    if (ring.length < 3) return null;
    const shape = new THREE.Shape();
    ring.forEach((pt, i) => {
        const lm = toLocal(pt[0], pt[1]);
        if (i === 0) shape.moveTo(lm.x, lm.y);
        else shape.lineTo(lm.x, lm.y);
    });
    shape.closePath();
    // Trous (cours intérieures) — utile pour l'écrin Vieille Charité
    for (let h = 1; h < best.length; h++) {
        const holeRing = simplifyRingLngLat(best[h], 20);
        if (holeRing.length < 3) continue;
        const hole = new THREE.Path();
        holeRing.forEach((pt, i) => {
            const lm = toLocal(pt[0], pt[1]);
            if (i === 0) hole.moveTo(lm.x, lm.y);
            else hole.lineTo(lm.x, lm.y);
        });
        hole.closePath();
        shape.holes.push(hole);
    }
    try {
        return new THREE.ExtrudeGeometry(shape, {
            depth: heightM,
            bevelEnabled: false,
            curveSegments: 1,
        });
    } catch (e) {
        console.warn('[Atlas] extrusion ombre', e.message);
        return null;
    }
}

function getLayerModelUrl(layer) {
    const s = layer.style;
    if (!s) return null;
    if (s.mode === 'custom' && s.custom?.url) return s.custom.url;
    if (s.mode === 'library' && s.library?.modelId) { const m = findModel(s.library.modelId); return m?.url || null; }
    return null;
}
function resolveFeatureProps(feature, layer) {
    const p = feature.properties || {};
    const c = layer.style?.common || {};
    const sym = layer.style?.symbolization || {};
    const baseModel = layer.style?.library?.modelId ? findModel(layer.style.library.modelId) : null;
    const num = (vals, d) => { for (const v of vals) { if (v != null && v !== '') { const n = Number(v); if (!isNaN(n)) return n; } } return d; };

    let symScale = null;
    if (sym.size?.mode === 'graduated' && sym.size.field && (layer.style?.mode === 'library' || layer.style?.mode === 'custom')) {
        const r = getNumericRange(layer, sym.size.field);
        symScale = interpolateValue(p[sym.size.field], [r.min, r.max], sym.size.outputRange || [0.5, 3], sym.size.method);
    }
    let modelId = p._modelId ?? null;
    if (!modelId && sym.model?.mode === 'categorized' && sym.model.field) {
        const cat = sym.model.categories?.find((c2) => String(c2.value) === String(p[sym.model.field]));
        modelId = cat?.modelId ?? sym.model.defaultModelId ?? null;
    }
    if (!modelId) modelId = layer.style?.library?.modelId ?? null;

    return {
        scale: num([p._scale, symScale, c.scale, baseModel?.scale], 1),
        rotationX: num([p._rotationX, c.rotationX], 0),
        rotationY: num([p._rotationY, c.rotationY], 0),
        rotationZ: num([p._rotationZ, c.rotationZ], 0),
        offsetX: num([p._offsetX, c.offsetX], 0),
        offsetY: num([p._offsetY, c.offsetY], 0),
        offsetZ: num([p._offsetZ, c.offsetZ], 0),
        modelId,
    };
}

// ============================================================
// MAP (MapLibre)
// ============================================================
function initMap() {
    const _bm = BASEMAPS[STATE.settings.basemap] || BASEMAPS.liberty;
    map = new maplibregl.Map({
        container: 'map',
        style: _bm.style ? _bm.style() : _bm.url,
        center: [STATE.location.lng, STATE.location.lat],
        zoom: CONFIG.defaultZoom,
        pitch: CONFIG.defaultPitch,
        bearing: CONFIG.defaultBearing,
        antialias: true,
        maxPitch: 80,
    });
    // Accès debug (couche custom / matrices MapLibre 5).
    try { window.__atlasMap = map; window.__Models3D = Models3D; } catch (_) {}

    map.on('load', onStyleReady);

    map.on('move', updateHUD);
    map.on('pitchend', () => {
        if (_openDockPill === 'view3d') renderDockSlotHost();
    });
    map.on('rotate', () => {
        $('compass-svg').style.transform = `rotate(${map.getBearing()}deg)`;
    });
    // Re-instancie les modeles dans l'emprise. Le cache d'altitude, lui, n'est
    // PAS invalide ici : il l'etait a chaque `moveend`, si bien qu'un simple
    // panoramique faisait re-sonder tous les objets — ceux dont la tuile DEM
    // n'etait pas revenue retombaient a zero et la scene sautait. Les altitudes
    // ne sont rejouees qu'au changement de palier de zoom (`recalerSiPalierDem`),
    // seul moment ou la resolution du MNT change vraiment.
    // Les tuiles du MNT arrivent apres coup, et a une resolution qui depend du
    // zoom : sur un meme point, `queryTerrainElevation` a rendu 1029,79 m a
    // z16,8 et 1034,14 m a z18,3 — 4,35 m d'ecart pour la seule finesse du
    // maillage. Les objets poses sur le releve precedent se retrouvent alors
    // au-dessus ou sous le sol, ce qui, en vue oblique, se lit comme un
    // glissement lateral. On rejoue donc le calage quand le relief lui-meme
    // change, pas seulement quand le zoom franchit un palier.
    map.on('data', (e) => {
        if (!STATE.settings.terrain3D) return;
        if (e.sourceId !== 'terrain-dem' || e.sourceDataType !== 'content') return;
        clearTimeout(_tuilesDemTimer);
        // Le cache d'altitude n'a pas à être purgé ici : `recalerRelief` appelle
        // `Models3D.recomputeAll()`, qui le vide en entrée. Vérifié — l'origine
        // est toujours posée (à défaut de modèle, sur le centre de la carte) et
        // la scène three.js est créée inconditionnellement, donc la garde de
        // `recomputeAll` est franchie et la purge a bien lieu.
        _tuilesDemTimer = setTimeout(() => recalerRelief(0), 600);
    });

    map.on('moveend', () => {
        recalerSiPalierDem();
        Models3D.cull();
        clearTimeout(_cameraSaveTimer);
        _cameraSaveTimer = setTimeout(saveMapCamera, 400);
    });
    // Pendant le pan avec ombres : recaler les casters avant le moveend,
    // sinon l'emprise ombrée reste celle de l'arrêt précédent.
    map.on('move', () => {
        if (!STATE.settings.shadows || STATE.settings.terrain3D) return;
        clearTimeout(Models3D._shadowMoveTimer);
        Models3D._shadowMoveTimer = setTimeout(() => Models3D.cull(), 140);
    });

    try {
        map.addControl(new maplibregl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true,
            showAccuracyCircle: true,
        }), 'bottom-right');
    } catch (e) { console.warn('[Atlas] geolocate', e.message); }

    setupInteraction();
}

function applyProjection() {
    if (!map || typeof map.setProjection !== 'function') return; // MapLibre < v5
    try { map.setProjection({ type: STATE.settings.projection || 'globe' }); } catch (e) {}
}

function onStyleReady() {
    // Le style de base est en place : les couches peuvent être montées, même
    // si des sources sont encore en cours de chargement.
    _styleUsable = true;
    // Projection (globe façon Google Earth, bascule auto vers mercator en zoom)
    applyProjection();
    // 3D buildings come with the Liberty style (fill-extrusion). Toggle visibility.
    applyBuildingVisibility();
    applyLabelsVisibility();

    // Terrain (source DEM choisie : terrarium mondial ou LIDAR HD IGN)
    addTerrainSource();
    applyTerrain();
    applySky();

    // Re-add the three.js custom layer (au-dessus du fond raster / ortho).
    if (!map.getLayer(Models3D.layerId)) map.addLayer(Models3D.makeLayer());
    try {
        // Remonter en tête de pile après un setStyle (sinon l'ortho IGN
        // peut rester peinte au-dessus et masquer entièrement le GLB).
        const layers = map.getStyle()?.layers || [];
        const top = layers.length ? layers[layers.length - 1].id : null;
        if (top && top !== Models3D.layerId && map.getLayer(Models3D.layerId)) {
            map.moveLayer(Models3D.layerId);
        }
    } catch (_) { /* style encore incomplet */ }

    // Reapply all data layers après idle (style + tuiles prêts à peindre)
    scheduleMapLayersSync(() => {
        if (STATE.layers.length && !_initialViewportApplied) {
            applyInitialViewport(computeLayersBounds());
        }
        // Remount après settle caméra (évite couches fantômes post-globe)
        if (STATE.layers.length) {
            map.once('idle', () => {
                syncAllLayersToMap();
                updateLegend();
            });
        }
    });

    updateLighting();
    updateHUD();
}

function saveMapCamera() {
    if (!map || _storyPresenting || !_initialViewportApplied) return;
    try {
        const c = map.getCenter();
        sessionStorage.setItem(cameraStorageKey(), JSON.stringify({
            lng: c.lng,
            lat: c.lat,
            zoom: map.getZoom(),
            pitch: map.getPitch(),
            bearing: map.getBearing(),
        }));
    } catch (_) { /* quota / mode privé */ }
}

function restoreMapCamera() {
    if (!map) return false;
    try {
        const raw = sessionStorage.getItem(cameraStorageKey());
        if (!raw) return false;
        const cam = JSON.parse(raw);
        if (typeof cam.lng !== 'number' || typeof cam.lat !== 'number') return false;
        map.jumpTo({
            center: [cam.lng, cam.lat],
            zoom: cam.zoom ?? CONFIG.defaultZoom,
            pitch: cam.pitch ?? CONFIG.defaultPitch,
            bearing: cam.bearing ?? CONFIG.defaultBearing,
        });
        return true;
    } catch (_) {
        return false;
    }
}

/** fitBounds initial si pas de caméra session valide près des données. */
function shouldAutoFitBounds(bounds) {
    return shouldAutoFitInitialBounds(bounds, cameraStorageKey());
}

function applyInitialViewport(bounds) {
    if (_initialViewportApplied || !map) return;
    const b = bounds || computeLayersBounds();
    if (b && shouldAutoFitBounds(b)) {
        map.fitBounds(b, { padding: 60, maxZoom: 16, duration: 800 });
        _initialViewportApplied = true;
        console.log('[Atlas v7] fitBounds initial', b);
        return;
    }
    if (restoreMapCamera()) {
        _initialViewportApplied = true;
        console.log('[Atlas v7] caméra session restaurée');
    } else if (b) {
        map.fitBounds(b, { padding: 60, maxZoom: 16, duration: 800 });
        _initialViewportApplied = true;
        console.log('[Atlas v7] fitBounds (caméra session stale ignorée)', b);
    }
}

/** Applique une visibilité aux couches du fond d'un type donné. */
function setBasemapLayersVisibility(type, vis) {
    for (const id of basemapLayerIds(map.getStyle().layers, type)) {
        try { map.setLayoutProperty(id, 'visibility', vis); } catch (e) { /* couche retirée */ }
    }
}

/**
 * Bâti en volume du **fond de carte**. Ne touche pas aux couches de données :
 * une couche Atlas surfacique rendue en volume est elle aussi une
 * `fill-extrusion`, mais sa visibilité appartient au panneau Couches.
 */
function applyBuildingVisibility() {
    const vis = STATE.settings.buildings3D ? 'visible' : 'none';
    setBasemapLayersVisibility('fill-extrusion', vis);
}

/** Libellés du fond (rues, villes) — pas les étiquettes des couches Atlas. */
function applyLabelsVisibility() {
    if (!map?.getStyle()?.layers) return;
    const vis = STATE.settings.labels ? 'visible' : 'none';
    setBasemapLayersVisibility('symbol', vis);
}
function addTerrainSource() {
    const cfg = TERRAIN_SOURCES[STATE.settings.terrainSource] || TERRAIN_SOURCES.terrarium;
    if (!map.getSource('terrain-dem')) {
        try {
            map.addSource('terrain-dem', { type: 'raster-dem', tiles: cfg.tiles, encoding: cfg.encoding, tileSize: cfg.tileSize, maxzoom: cfg.maxzoom, attribution: cfg.attribution });
        } catch (e) { /* ignore */ }
    }
}
function applyTerrain() {
    if (!map.getSource('terrain-dem')) return;
    if (STATE.settings.terrain3D) map.setTerrain({ source: 'terrain-dem', exaggeration: STATE.settings.terrainExaggeration });
    else map.setTerrain(null);
}
function setTerrainSource(src) {
    STATE.settings.terrainSource = src;
    if (!map) return;
    try { map.setTerrain(null); } catch (e) {}
    if (map.getSource('terrain-dem')) { try { map.removeSource('terrain-dem'); } catch (e) {} }
    addTerrainSource();
    if (STATE.settings.terrain3D) applyTerrain();
    recalerRelief(); // le MNT doit d'abord se charger
}
function applySky() {
    if (typeof map.setSky !== 'function') return;
    if (STATE.settings.sky) {
        map.setSky({ 'sky-color': '#bcd4e8', 'horizon-color': '#f3ecd9', 'fog-color': '#f3ecd9', 'fog-ground-blend': 0.4, 'horizon-fog-blend': 0.6, 'sky-horizon-blend': 0.6 });
    } else { try { map.setSky(null); } catch (e) {} }
}

function updateHUD() {
    if (!map) return;
    const c = map.getCenter();
    $('hud-coords').textContent = `${c.lat.toFixed(4)}°N · ${c.lng.toFixed(4)}°E`;
    $('hud-zoom').textContent = `zoom ${map.getZoom().toFixed(1)}`;
    $('hud-pitch').textContent = `pitch ${Math.round(map.getPitch())}°`;
}

// ============================================================
// ÉCLAIRAGE SOLAIRE (SunCalc → MapLibre light + three.js)
// ============================================================
function sunPosition() {
    const min = STATE.settings.timeOfDay;
    const d = new Date(STATE.settings.date);
    d.setHours(Math.floor(min / 60), min % 60, 0, 0);
    const c = map ? map.getCenter() : { lat: STATE.location.lat, lng: STATE.location.lng };
    let azimuth = 180, altitude = 45;
    if (typeof SunCalc !== 'undefined') {
        try {
            const s = SunCalc.getPosition(d, c.lat, c.lng);
            azimuth = ((s.azimuth * 180 / Math.PI) + 180) % 360;
            altitude = s.altitude * 180 / Math.PI;
        } catch (e) {}
    }
    return { azimuth, altitude, date: d };
}
function updateLighting() {
    if (!map) return;
    const { azimuth, altitude, date } = sunPosition();
    const c = map.getCenter();
    const moon = computeMoon(date, c.lat, c.lng);
    const amb = computeAmbient(altitude, moon);
    const polar = clamp(90 - altitude, 5, 88);
    try { map.setLight({ anchor: 'map', position: [1.2, azimuth, polar], color: amb.mapColor, intensity: amb.mapIntensity }); } catch (e) {}
    if (STATE.settings.sky && typeof map.setSky === 'function') {
        // atmosphere-blend : halo atmosphérique du globe en vue large, estompé en zoom
        try { map.setSky({ 'sky-color': amb.sky, 'horizon-color': amb.horizon, 'fog-color': amb.horizon, 'fog-ground-blend': 0.4, 'horizon-fog-blend': 0.6, 'sky-horizon-blend': 0.7, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 6, 1, 9, 0] }); } catch (e) {}
    }
    Models3D.setSun(azimuth, altitude, moon);
    // Teinte nocturne de la scène (le fond vecteur ne s'assombrit pas seul) — atténuée par la lune
    // Seuil large (alt < 12°) pour que crépuscule / aube se lisent aussi en récit.
    const tint = clamp((12 - altitude) / 28, 0, 0.68) * (moon && moon.isUp ? (1 - moon.moonIntensity * 0.35) : 1);
    const nt = $('night-tint');
    if (nt) nt.style.background = tint <= 0.02 ? 'transparent' : `rgba(16,24,58,${tint.toFixed(3)})`;
    updateSunStrip();
}

function updateSunStrip() {
    const { azimuth, altitude, date } = sunPosition();
    const min = STATE.settings.timeOfDay;
    const h = Math.floor(min / 60), m = min % 60;
    const tEl = $('sun-time'), dEl = $('sun-date'), aEl = $('sun-alt');
    if (tEl) tEl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if (dEl) dEl.textContent = date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    if (aEl) aEl.textContent = `${altitude.toFixed(0)}°`;
    // dot le long de l'arc 06h..20h (courbe basse, contenu dans 168×34)
    const r = clamp((min - 360) / (1200 - 360), 0, 1);
    const dot = $('sun-dot');
    if (!dot) return;
    const x0 = 8, xSpan = 152, yBase = 24, yAmp = 14, rDot = 6;
    const cy = yBase - Math.sin(r * Math.PI) * yAmp;
    dot.style.left = `${x0 + r * xSpan}px`;
    dot.style.top = `${cy - rDot}px`;
    const prog = $('sun-arc-prog');
    if (prog) prog.setAttribute('stroke-dasharray', `${r * 210}, 1000`);
}

// ============================================================
// COUCHES — ajout sur la carte / styles
// ============================================================
function indexFeatures(layer) {
    (layer.geojson?.features || []).forEach((f, i) => {
        if (!f.properties) f.properties = {};
        f.properties._idx = i;
    });
}
function sourceData(layer) { return filteredGeoJSON(layer); }

/** Id de la source/couche de repli en points (cf. lib/point-fallback.js). */
function pointFallbackId(layer) { return layer.id + '-pts'; }

/**
 * Applique a une specification de couche MapLibre les bornes de zoom voulues.
 *
 * Deux sources se combinent, et la plus restrictive gagne : le seuil calcule du
 * repli en points (qui ne vaut que si Atlas detient les entites) et les bornes
 * que le manifeste declare. Prendre le maximum des deux minimums evite qu'une
 * couche remonte au-dessus de l'echelle ou son producteur la dit lisible.
 */
function poserBornesZoom(spec, layer, zFallback = null) {
    const z = layer?._zoom || {};
    const mins = [zFallback, z.minzoom].filter((v) => Number.isFinite(v));
    if (mins.length) spec.minzoom = Math.max(...mins);
    if (Number.isFinite(z.maxzoom)) spec.maxzoom = z.maxzoom;
    return spec;
}

function removeLayerGfx(layer) {
    if (!map) return;
    ['', '-outline', '-label', '-hit', '-pts'].forEach((sfx) => {
        const id = layer.id + sfx;
        if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource(layer.id)) map.removeSource(layer.id);
    if (map.getSource(pointFallbackId(layer))) map.removeSource(pointFallbackId(layer));
}

/**
 * Monte une couche de tuiles matricielles.
 *
 * Rien ne transite par Atlas : MapLibre va chercher les images au gabarit
 * d'adresse. D'ou l'absence de source GeoJSON, de symbologie et de controles —
 * un fond de plan n'a ni champ a graduer ni objet a inspecter.
 */
function addRasterLayerToMap(layer) {
    removeLayerGfx(layer);
    if (map.getSource(layer.id)) map.removeSource(layer.id);
    map.addSource(layer.id, {
        type: 'raster',
        tiles: layer._tiles,
        tileSize: layer._tileSize || 256,
        // Sans borne haute, un service qui ne sert pas au-dela d'un niveau
        // renvoie des erreurs en boucle et la carte n'atteint jamais `idle` :
        // tout ce qui attend cet etat reste suspendu.
        maxzoom: layer._zoom?.maxzoom ?? 19,
        ...(layer._attribution ? { attribution: layer._attribution } : {}),
    });
    map.addLayer(poserBornesZoom({
        id: layer.id, type: 'raster', source: layer.id,
        paint: { 'raster-opacity': Number.isFinite(layer.opacity) ? layer.opacity : 1 },
    }, layer));
    return true;
}

function addLayerToMap(layer) {
    if (!mapStyleUsable()) return false;
    if (layer._raster) {
        try { return addRasterLayerToMap(layer); }
        catch (e) { console.warn('[Atlas] tuiles non montées —', layer.name, e.message); return false; }
    }
    try {
        indexFeatures(layer);
        removeLayerGfx(layer);
        // qgis2grist : polygones à plat (évite fill-extrusion masqué / confondu avec le bâti OSM)
        if (layer.source === 'qgis2grist' && (layer.geometryType === 'Polygon' || layer.geometryType === 'MultiPolygon')) {
            layer.style = layer.style || { mode: 'mapbox' };
            if (layer.style.polygonMode == null) layer.style.polygonMode = 'flat';
        }
        const data = sourceData(layer);
        const nFeats = data?.features?.length || 0;
        map.addSource(layer.id, { type: 'geojson', data: data || { type: 'FeatureCollection', features: [] } });
        // Surfaces menues : source de centres pour le rendu en petite échelle.
        const isFlatPolygon = (layer.geometryType === 'Polygon' || layer.geometryType === 'MultiPolygon')
            && layer.style?.polygonMode === 'flat';
        layer._pointFallbackZoom = isFlatPolygon ? pointFallbackZoom(layer.geojson) : null;
        // Nombre d'entités au moment de l'évaluation : une couche différée est
        // vide au montage, il faudra refaire le calcul quand elle se peuplera.
        layer._pointFallbackAt = layer.geojson?.features?.length || 0;
        if (layer._pointFallbackZoom != null) {
            map.addSource(pointFallbackId(layer), { type: 'geojson', data: centroidCollection(data) });
        }
        initSymbolization(layer);
        applyLayerStyle(layer);
        if (layer.visible === false) applyMapLayerVisibility(layer, false);
        else applyMapLayerVisibility(layer, true);
        if (!map.getLayer(layer.id)) {
            console.warn('[Atlas] addLayerToMap : pas de layer MapLibre pour', layer.name, '(features:', nFeats, ')');
            return false;
        }
        // La couche vient d'être empilée au sommet : remettre la pile d'aplomb.
        applyLayerOrder();
        return true;
    } catch (e) {
        console.error('[Atlas] addLayerToMap échoué:', layer.name, e);
        return false;
    }
}

function applyLayerStyle(layer) {
    if (!map || !map.getSource(layer.id)) return;
    // Un fond de tuiles n'a pas d'entites a peindre : sa seule apparence est
    // son opacite. Le faire passer par la symbologie vectorielle chercherait
    // des champs qui n'existent pas.
    if (layer._raster) {
        if (map.getLayer(layer.id)) {
            map.setPaintProperty(layer.id, 'raster-opacity',
                Number.isFinite(layer.opacity) ? layer.opacity : 1);
        }
        updateLegend();
        return;
    }
    if (layer.source === 'qgis2grist') {
        const sym = initSymbolization(layer).color;
        syncFeatureColorsFromSymbolization(layer, sequentialPaletteForSym(sym, layer));
        syncLayerSourceData(layer);
    }
    const g = layer.geometryType;
    if (g === 'Point' || g === 'MultiPoint') applyPointStyle(layer);
    else if (g === 'LineString' || g === 'MultiLineString') applyLineStyle(layer);
    else applyPolygonStyle(layer);
    updateLegend();
}

function colorExpression(layer, fallback) {
    const sym = initSymbolization(layer).color;
    if (sym.mode === 'categorized' && sym.field) {
        syncColorCategoriesFromFeatures(layer);
        const cats = sym.categories.length ? sym.categories
            : getUniqueValues(layer, sym.field).map((v, i) => ({ value: v.value, color: paletteColor(sym.palette, i, 99), count: v.count }));
        sym.categories = cats;
        return buildColorMatch(sym.field, cats, sym.defaultColor || sym.value || fallback || layer.color);
    }
    if (sym.mode === 'graduated' && sym.field) {
        const r = getNumericRange(layer, sym.field);
        if (r.count) return buildColorGraduated(sym.field, [r.min, r.max], sym.colorRamp || sym.palette, sym.method);
    }
    return sym.value || fallback || layer.color;
}

function applyPointStyle(layer) {
    const s = layer.style;
    ['', '-hit', '-label'].forEach((sfx) => { if (map.getLayer(layer.id + sfx)) map.removeLayer(layer.id + sfx); });
    const sym = initSymbolization(layer);

    if (s.mode === 'library' || s.mode === 'custom') {
        // 3D rendu par three.js ; petit cercle de hit discret pour clic/sélection,
        // qui s'estompe quand on zoome (là où la 3D prend le relais).
        map.addLayer({ id: layer.id, type: 'circle', source: layer.id, paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2, 15, 3, 19, 4.5],
            'circle-color': layer.color,
            'circle-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.12, 16, 0.06, 18, 0.02],
            'circle-stroke-width': 0,
        }});
        Models3D.scheduleBuild();
    } else {
        // native circle
        let radius = sym.size.value || 8;
        if (sym.size.mode === 'graduated' && sym.size.field) {
            const r = getNumericRange(layer, sym.size.field);
            if (r.count) radius = buildNumGraduated(sym.size.field, [r.min, r.max], sym.size.outputRange, sym.size.method);
        }
        const stroke = layerStrokePaint(layer);
        map.addLayer({ id: layer.id, type: 'circle', source: layer.id, paint: {
            'circle-radius': radius,
            'circle-color': layerPaintColor(layer),
            'circle-stroke-width': stroke.width,
            'circle-stroke-color': initSymbolization(layer).stroke?.mode === 'fixed'
                ? stroke.color : '#ffffff',
            'circle-opacity': layerPaintOpacity(layer),
        }});
    }
    addLabelLayer(layer);
}

function applyLineStyle(layer) {
    if (map.getLayer(layer.id)) map.removeLayer(layer.id);
    const sym = initSymbolization(layer);
    let width = sym.size.value || 4;
    if (sym.size.mode === 'graduated' && sym.size.field) {
        const r = getNumericRange(layer, sym.size.field);
        if (r.count) width = buildNumGraduated(sym.size.field, [r.min, r.max], sym.size.outputRange, sym.size.method);
    }
    map.addLayer({ id: layer.id, type: 'line', source: layer.id,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': layerPaintColor(layer), 'line-width': width, 'line-opacity': layerPaintOpacity(layer) } });
    addLabelLayer(layer);
}

/**
 * Pose les entites d'une couche sur le relief.
 *
 * L'echantillonnage passe par `Models3D.elevRaw` — le meme que celui qui place
 * les modeles 3D, cache compris. Un lampadaire et le bati sous lui reposent
 * ainsi a la meme altitude par construction, quelle que soit l'exageration.
 */
/**
 * L'altitude unique d'une couche distante, sondee au centre de son emprise.
 *
 * Faute d'entites, on ne peut pas poser chaque objet sur le sol qui lui revient.
 * Le centre de la `bbox` declaree donne un ordre de grandeur juste : sur une
 * emprise urbaine il vaut mieux que zero de plusieurs dizaines de metres, et
 * c'est ce qui separe « la couche est mal calee » de « la couche a disparu ».
 *
 * @returns {number|null} null si le MNT n'a pas encore repondu — auquel cas on
 *   ne pose rien plutot que de figer une altitude fausse ; `recalerRelief`
 *   repassera quand les tuiles seront la.
 */
function solConstantDeCouche(layer) {
    const b = layer?._bboxDeclaree;
    if (!b) return null;
    const lng = (b[0][0] + b[1][0]) / 2;
    const lat = (b[0][1] + b[1][1]) / 2;
    const z = Models3D.elevRaw(lng, lat);
    return Number.isFinite(z) ? z : null;
}

function poserCoucheSurTerrain(layer) {
    // Rien a poser entite par entite : on retient une altitude de couche, lue
    // par `extrusionExpressions`.
    if (layer._distant) {
        layer._solConstant = solConstantDeCouche(layer);
        return 0;
    }
    const t0 = performance.now();
    const n = applyTerrainBase(layer.geojson, (lng, lat) => Models3D.elevRaw(lng, lat), pointsSondes);
    if (!n) return 0;
    syncLayerSourceData(layer);
    const ms = Math.round(performance.now() - t0);
    if (ms > 500) console.warn(`[Atlas terrain] ${layer.name} : ${n} entites posees en ${ms} ms`);
    return n;
}

/**
 * Rejoue les deux echantillonnages du relief quand la resolution du MNT change.
 *
 * Modeles 3D et surfaces en volume lisent le meme cache d'altitude : les
 * recaler separement les ferait diverger — un lampadaire flotterait au-dessus
 * du batiment qui le porte. Ils repartent donc ensemble, et seulement au
 * franchissement d'un palier entier de zoom.
 */
function recalerSiPalierDem() {
    if (!map || !STATE.settings.terrain3D) return;
    const z = map.getZoom();
    if (!paliersDemDifferents(_palierDemCale, z)) return;
    _palierDemCale = z;
    Models3D.elevCache.clear();
    clearTimeout(_recalageTimer);
    // Le MNT du nouveau palier doit d'abord arriver : sonder trop tot ne
    // rendrait que l'ancienne resolution, et on aurait paye le calcul pour rien.
    recalerRelief(350);
}

/**
 * Recale modeles 3D et surfaces en volume sur le relief, apres un delai.
 *
 * Les deux lisent le meme cache d'altitude : les recaler separement les ferait
 * diverger. Ce point d'entree unique remplace les quatre paires d'appels
 * dispersees, qui pouvaient s'entrelacer — un changement d'exageration suivi
 * d'un changement de source rejouait deux calages concurrents sur des donnees
 * differentes.
 *
 * Le delai laisse le MNT arriver : sonder trop tot ne rend que l'ancienne
 * resolution, et le calcul est paye pour rien.
 */
function recalerRelief(delai = 250) {
    clearTimeout(_recalageTimer);
    _recalageTimer = setTimeout(() => {
        if (map) _palierDemCale = map.getZoom();
        Models3D.recomputeAll();
        refreshTerrainBases();
    }, delai);
}

/**
 * Rejoue le calage sur le relief pour toutes les couches concernees.
 *
 * A appeler quand le relief change d'etat, de source ou d'exageration, et quand
 * ses tuiles arrivent : `queryTerrainElevation` ne repond qu'une fois le MNT
 * charge, donc le premier passage laisse souvent des entites non posees.
 */
function refreshTerrainBases() {
    if (!map || !mapStyleUsable()) return;
    const actif = !!STATE.settings.terrain3D;
    let touchees = 0;
    for (const l of STATE.layers) {
        const surfaciqueVolume = (l.geometryType === 'Polygon' || l.geometryType === 'MultiPolygon')
            && l.style?.polygonMode !== 'flat';
        if (!surfaciqueVolume) continue;
        if (!actif && clearTerrainBase(l.geojson)) {
            // Relief coupe : sans nettoyage les entites resteraient en
            // levitation au-dessus d'une carte redevenue plate.
            syncLayerSourceData(l);
            touchees++;
        }
        // Un seul passage : `applyLayerStyle` -> `applyPolygonStyle` pose les
        // entites quand le relief est actif, et choisit les expressions selon
        // son etat. Poser ici en plus doublait le cout — mesure a 2,3 s sur la
        // grille de 42 182 mailles au lieu de 1,1 s.
        if (map.getLayer(l.id)) { applyLayerStyle(l); touchees++; }
    }
    if (touchees) applyLayerOrder(); // applyLayerStyle remonte les couches au sommet
}

function applyPolygonStyle(layer) {
    ['', '-outline'].forEach((sfx) => { if (map.getLayer(layer.id + sfx)) map.removeLayer(layer.id + sfx); });
    const s = layer.style; const sym = initSymbolization(layer);
    const extrude = s.polygonMode !== 'flat';
    if (extrude) {
        let height = sym.size.value || 12;
        if (sym.size.mode === 'graduated' && sym.size.field) {
            const r = getNumericRange(layer, sym.size.field);
            if (r.count) height = buildNumGraduated(sym.size.field, [r.min, r.max], sym.size.outputRange, sym.size.method);
        } else if (layer.heightField) height = ['to-number', ['get', layer.heightField]];
        const base = Number.isFinite(sym.extrusion?.base) ? sym.extrusion.base : 0;
        // Sur relief, l'extrusion se compte depuis le niveau de la mer : sans
        // decalage, une maille de 12 m posee sur une colline de 50 m est
        // enfouie. On pose donc chaque entite sur le sol.
        const surTerrain = needsTerrainBase(layer, !!STATE.settings.terrain3D);
        if (surTerrain) poserCoucheSurTerrain(layer);
        const ext = extrusionExpressions(base, height, surTerrain, layer._solConstant);
        map.addLayer(poserBornesZoom({ id: layer.id, type: 'fill-extrusion', source: layer.id, paint: {
            'fill-extrusion-color': layerPaintColor(layer),
            'fill-extrusion-height': ext.height,
            'fill-extrusion-base': ext.base,
            // 1 par défaut, comme `defaultLayerOpacity` : sous 1, MapLibre perd
            // l'écriture de profondeur et les volumes cessent de s'occulter.
            'fill-extrusion-opacity': Number.isFinite(sym.opacity) ? sym.opacity : 1,
        } }, layer));
    } else {
        const stroke = layerStrokePaint(layer);
        // Repli en points sous le seuil : les surfaces y seraient sous-pixel.
        const zFallback = layer._pointFallbackZoom;
        const fill = { id: layer.id, type: 'fill', source: layer.id, paint: {
            'fill-color': layerPaintColor(layer), 'fill-opacity': layerPaintOpacity(layer) } };
        poserBornesZoom(fill, layer, zFallback);
        map.addLayer(fill);
        if (stroke.width > 0) {
            const outline = { id: layer.id + '-outline', type: 'line', source: layer.id, paint: {
                'line-color': stroke.color, 'line-width': stroke.width } };
            poserBornesZoom(outline, layer, zFallback);
            map.addLayer(outline);
        }
        if (zFallback != null && map.getSource(pointFallbackId(layer))) {
            map.addLayer({ id: pointFallbackId(layer), type: 'circle', source: pointFallbackId(layer),
                maxzoom: zFallback,
                paint: {
                    // Au moins MIN_FEATURE_PX à l'écran : en deçà, le repli
                    // reproduirait l'invisibilité qu'il est censé corriger.
                    'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.2, 10, 4],
                    'circle-color': layerPaintColor(layer),
                    'circle-opacity': layerPaintOpacity(layer),
                    'circle-stroke-width': 0,
                } });
        }
    }
    addLabelLayer(layer);
}

function addLabelLayer(layer) {
    if (map.getLayer(layer.id + '-label')) map.removeLayer(layer.id + '-label');
    const sym = layer.style?.symbolization?.label;
    if (!sym?.enabled || !sym.field) return;
    const size = Number.isFinite(sym.size) ? sym.size : 12;
    map.addLayer({ id: layer.id + '-label', type: 'symbol', source: layer.id,
        layout: { 'text-field': ['to-string', ['get', sym.field]], 'text-size': size, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-font': ['Noto Sans Regular'] },
        paint: { 'text-color': sym.color || '#2D2820', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 } });
}

function prepareLayerFilters(layer) {
    (layer.controls || []).forEach((c) => repairSelectControlFromManifest(layer, c));
    sanitizeBrokenSelectFilters(layer);
    layer._filterPredicate = buildControlPredicate(layer);
}

/** Aligne une couche MapLibre sur layer.visible + filtres (source de vérité = STATE.layers). */
/**
 * Le style est-il en état d'accueillir des sources et des couches ?
 *
 * `map.isStyleLoaded()` répond « le style **et toutes ses sources** sont
 * chargés » — un état que le montage d'une couche volumineuse fait retomber à
 * faux le temps d'indexer sa source. L'utiliser comme prérequis pour *ajouter*
 * une couche, dans une boucle qui ajoute des couches, revient à se couper
 * l'herbe sous le pied : tout ce qui suit la première couche lourde est
 * abandonné, et la reprogrammation rejoue le même ordre — donc le même abandon.
 *
 * Le prérequis réel de `addSource`/`addLayer` est que le style soit *défini*,
 * ce que MapLibre garantit dès l'événement `load` et jusqu'au prochain
 * `setStyle`. C'est ce que suit ce drapeau.
 */
function mapStyleUsable() {
    if (!map) return false;
    return _styleUsable || map.isStyleLoaded();
}

function syncLayerToMapState(layer) {
    if (!map) return;
    if (!mapStyleUsable()) {
        scheduleMapLayersSync();
        return;
    }
    try {
        prepareLayerFilters(layer);
        const wantVisible = layer.visible !== false;
        const hasSource = !!map.getSource(layer.id);
        const hasLayer = !!map.getLayer(layer.id);

        if (!wantVisible) {
            if (hasLayer) applyMapLayerVisibility(layer, false);
            else if (!hasSource) { /* rien à faire */ }
            else applyMapLayerVisibility(layer, false);
            return;
        }

        // Visible dans le panneau → doit être peint. Si source/layer absents ou incomplets : remount.
        if (!hasSource || !hasLayer) {
            addLayerToMap(layer);
            return;
        }

        // Couche différée qui vient de se peupler : le seuil de repli en points
        // avait été calculé sur un GeoJSON vide, il faut remonter la couche
        // pour créer la source de centres.
        const nFeats = layer.geojson?.features?.length || 0;
        if (layer._pointFallbackZoom == null && nFeats > (layer._pointFallbackAt || 0)
            && (layer.geometryType === 'Polygon' || layer.geometryType === 'MultiPolygon')) {
            // Le mode de rendu n'est pas encore fixé au premier montage d'une
            // couche différée : c'est addLayerToMap qui tranche. Remonter dès
            // qu'une surface se peuple, sans présumer du mode.
            addLayerToMap(layer);
            return;
        }

        syncLayerSourceData(layer);
        applyMapLayerVisibility(layer, true);
        // Remount style paint (catégorisé / flat) si le layer existe déjà
        applyLayerStyle(layer);
        applyMapLayerVisibility(layer, true);
    } catch (e) {
        console.error('[Atlas] syncLayerToMapState:', layer?.name, e);
    }
}

/**
 * Réconcilie panneau (STATE.visible) ↔ MapLibre.
 * Sens de vérité : STATE.layers[].visible (yeux du panneau).
 * Si œil ouvert mais pas de layer MapLibre → remount forcé.
 */
function reconcilePanelVisibilityToMap() {
    if (!mapStyleUsable()) return { ok: 0, fixed: 0, missing: [] };
    let ok = 0;
    let fixed = 0;
    const missing = [];
    for (const layer of STATE.layers) {
        const want = layer.visible !== false;
        const onMap = !!map.getLayer(layer.id);
        if (!want) {
            if (onMap) applyMapLayerVisibility(layer, false);
            continue;
        }
        if (onMap) {
            applyMapLayerVisibility(layer, true);
            ok++;
            continue;
        }
        missing.push(layer.name);
        if (addLayerToMap(layer)) fixed++;
        else console.warn('[Atlas] impossible de peindre', layer.name, '— visible dans le panneau');
    }
    if (missing.length) {
        console.warn('[Atlas] réconciliation : visibles panneau absents carte →', missing.join(', '), '| fixés:', fixed);
    }
    return { ok, fixed, missing };
}

/**
 * Glisser-déposer de l'ordre des couches — souris, doigt et stylet.
 *
 * Pointer Events plutôt que mouse + touch en double : un seul code pour tous
 * les pointeurs, et `setPointerCapture` garde le geste même si le doigt sort
 * de la poignée. `touch-action: none` sur la poignée est indispensable, sinon
 * le navigateur interprète le mouvement comme un défilement et vole le geste.
 *
 * Le glissement ne démarre qu'au-delà d'un seuil : un simple appui reste un
 * appui, et n'empêche pas de sélectionner la couche.
 */
const DRAG_SEUIL_PX = 4;
/** Appui long tactile : durée avant bascule, et tremblement toléré. */
const LONG_PRESS_MS = 450;
const LONG_PRESS_TOLERANCE_PX = 8;

/**
 * Capture du pointeur, sans faire échouer le geste si elle est refusée.
 *
 * `setPointerCapture` lève quand le pointeur n'est plus actif — relâchement
 * arrivé entre l'événement et son traitement. L'exception interromprait alors
 * le gestionnaire avant même d'avoir armé le glissement.
 */
function capturePointer(el, pointerId) {
    try { el?.setPointerCapture?.(pointerId); } catch (_) { /* pointeur déjà parti */ }
}

function wireLayerReorder(root) {
    if (!root || CONFIG.viewMode) return;
    const lignes = () => Array.from(root.querySelectorAll('.layer-item'));

    root.querySelectorAll('.layer-grip').forEach((grip) => {
        grip.addEventListener('pointerdown', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const id = grip.dataset.layer;
            const depart = lignes().findIndex((el) => el.dataset.layer === id);
            if (depart < 0) return;

            const y0 = ev.clientY;
            let actif = false;
            let cible = depart;
            let yCourant = y0;
            let boucle = 0;
            const ligne = lignes()[depart];
            const repere = document.createElement('div');
            repere.className = 'layer-drop-line';

            // Position de dépôt + repère visuel, recalculés depuis la dernière
            // ordonnée connue : le défilement automatique déplace les lignes
            // sous un pointeur immobile.
            const majCible = () => {
                const rects = lignes().map((el) => el.getBoundingClientRect());
                cible = dropIndex(rects, yCourant);
                // Repère d'insertion : sans lui, on lâche à l'aveugle.
                const ref = lignes()[cible];
                if (ref) ref.parentNode.insertBefore(repere, ref);
                else root.querySelector('.layer-list')?.appendChild(repere);
            };

            // Au doigt, aucune molette ne vient défiler pendant le glissement :
            // sans cela, une couche ne pourrait pas sortir de la portion visible.
            const defiler = () => {
                if (!actif) return;
                const pas = edgeScrollStep(root.getBoundingClientRect(), yCourant);
                if (pas) { root.scrollTop += pas; majCible(); }
                boucle = requestAnimationFrame(defiler);
            };

            const bouger = (e) => {
                yCourant = e.clientY;
                if (!actif) {
                    if (Math.abs(e.clientY - y0) < DRAG_SEUIL_PX) return;
                    actif = true;
                    ligne.classList.add('dragging');
                    boucle = requestAnimationFrame(defiler);
                }
                majCible();
            };

            const finir = () => {
                cancelAnimationFrame(boucle);
                grip.releasePointerCapture?.(ev.pointerId);
                grip.removeEventListener('pointermove', bouger);
                grip.removeEventListener('pointerup', finir);
                grip.removeEventListener('pointercancel', finir);
                repere.remove();
                ligne.classList.remove('dragging');
                if (!actif) return;
                const avant = STATE.layers.map((l) => l.id).join('|');
                STATE.layers = reorderByDrop(STATE.layers, depart, cible);
                if (STATE.layers.map((l) => l.id).join('|') === avant) return;
                applyLayerOrder();
                updateLegend();
                refreshLayersPanelIfOpen();
                // Tous les rangs : un rang partiel se relit mal (cf. sortByRank).
                STATE.layers.forEach((l, k) => { l._rank = k; saveLayerPrefIfSynced(l); });
            };

            capturePointer(grip, ev.pointerId);
            grip.addEventListener('pointermove', bouger);
            grip.addEventListener('pointerup', finir);
            grip.addEventListener('pointercancel', finir);
        });

        // Équivalent clavier — même geste, sans pointeur.
        grip.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            const id = grip.dataset.layer;
            A.moveLayerRank(id, e.key === 'ArrowUp' ? 'up' : 'down', e);
            // Le panneau est reconstruit : rendre le focus à la même poignée.
            setTimeout(() => {
                root.querySelector(`.layer-grip[data-layer="${id}"]`)?.focus();
            }, 0);
        });
    });
}

function refreshLayersPanelIfOpen() {
    if (STATE.currentModule === 'couches' || STATE.currentModule === 'symbo') {
        renderLayersPanel(STATE.currentModule);
    }
}

/** Resynchronise toutes les couches (rechargement, prefs Grist, sortie récit). */
/**
 * Rétablit l'ordre d'affichage sur la carte.
 *
 * À appeler après tout (re)montage : MapLibre ajoute au sommet, donc une couche
 * remontée passerait devant les autres. Sans cela, l'ordre dépend de
 * l'historique des clics et non de `STATE.layers`.
 */
function applyLayerOrder() {
    if (!mapStyleUsable()) return;
    for (const id of moveSequence(STATE.layers, (i) => !!map.getLayer(i))) {
        try { map.moveLayer(id); } catch (_) { /* couche retirée entre-temps */ }
    }
    // Les GLB (custom layer three.js) doivent rester AU-DESSUS du bâti MapLibre
    // et du fond ortho — sinon on ne voit que le raster / les extrusions.
    try {
        if (map.getLayer(Models3D.layerId)) map.moveLayer(Models3D.layerId);
    } catch (_) { /* ignore */ }
}

function syncAllLayersToMap() {
    if (!mapStyleUsable()) return;
    STATE.layers.forEach(syncLayerToMapState);
    applyLayerOrder();
    reconcilePanelVisibilityToMap();
    Models3D.rebuildScene();
    updateLegend();
    refreshLayersPanelIfOpen();
}

/** Attend que MapLibre soit prêt à peindre avant de monter les sources GeoJSON. */
let _mapSyncTimer = null;
/**
 * Les rappels à jouer quand le style redevient utilisable — **une file, pas un
 * slot**.
 *
 * Deux appelants peuvent attendre en même temps : `onStyleReady` qui cadre
 * depuis les entités locales, et `mountLoadedLayers` qui cadre depuis ce que le
 * manifeste déclare. Avec une variable unique, le second effaçait le premier
 * sans rien dire. Dans un document Grist l'ordre était favorable — l'ouverture
 * du document est lente, le style a le temps d'être prêt — et le défaut ne se
 * voyait pas ; une scène chargée par URL arrive avant le style, et c'est le
 * cadrage du manifeste qui se perdait. La carte s'ouvrait alors sur la position
 * par défaut, ce qui ressemble à un choix.
 */
let _mapSyncAfter = [];
function scheduleMapLayersSync(afterSync) {
    if (!map) return;
    if (typeof afterSync === 'function') _mapSyncAfter.push(afterSync);
    const run = () => {
        clearTimeout(_mapSyncTimer);
        syncAllLayersToMap();
        const files = _mapSyncAfter;
        _mapSyncAfter = [];
        // Un rappel qui lève ne doit pas emporter les suivants : ils viennent
        // d'appelants sans rapport entre eux.
        for (const cb of files) {
            try { cb(); } catch (e) { console.warn('[Atlas] rappel de montage :', e); }
        }
        // 2e passe : premier idle parfois trop tôt (style OSM / globe / pitch)
        _mapSyncTimer = setTimeout(() => {
            if (!mapStyleUsable()) return;
            syncAllLayersToMap();
            updateLegend();
        }, 500);
    };
    if (!mapStyleUsable()) {
        // `load` ne survient qu'une fois : y revenir après le démarrage — ou
        // après un changement de fond — poserait un rappel qui ne partirait
        // jamais. `idle` revient à chaque stabilisation.
        map.once('idle', run);
        return;
    }
    if (typeof map.loaded === 'function' && map.loaded()) {
        // Micro-delay : laisse setProjection / setSky / custom layer se stabiliser
        requestAnimationFrame(() => requestAnimationFrame(run));
        return;
    }
    map.once('idle', run);
}

function applyMapLayerVisibility(layer, visible) {
    if (!map) return;
    const vis = visible ? 'visible' : 'none';
    // Tous les habillages de la couche, sinon ils survivent au masquage : `-pts`
    // laisserait le repli en points à l'écran, `-hit` garderait la zone de clic
    // active sur une couche invisible.
    ['', '-outline', '-label', '-hit', '-pts'].forEach((sfx) => {
        const lid = layer.id + sfx;
        if (map.getLayer(lid)) map.setLayoutProperty(lid, 'visibility', vis);
    });
    Models3D.scheduleBuild();
}

/**
 * Suite d'un chargement différé « froid » : la couche vient de recevoir ses
 * lignes, il faut la monter sur la carte et rafraîchir la légende.
 */
const DEFERRED_OPTS = {
    onReady: (l) => {
        if (!mapStyleUsable()) return;
        syncLayerToMapState(l);
        updateLegend();
    },
};

function setLayerVisibility(layer, visible) {
    layer.visible = visible;
    // Une couche lourde chargée en différé n'a pas encore de GeoJSON : la rendre
    // visible sans la matérialiser afficherait du vide. Vaut pour toutes les
    // origines — pastille, récit, prefs.
    // Une couche différée « froide » n'a pas encore ses lignes : la conversion
    // rend la main tout de suite et la couche se peint à l'arrivée des données.
    if (visible && layer._deferredLoad) materializeDeferredLayer(layer, DEFERRED_OPTS);
    applyMapLayerVisibility(layer, visible);
}

/** Remonte toutes les couches visibles (après récit ou bascule visibilité). */
function remountAllLayers() {
    syncAllLayersToMap();
}

function capturePreStorySnapshot() {
    _preStorySnapshot = STATE.layers.map((l) => ({
        id: l.id,
        visible: l.visible !== false,
        controls: JSON.parse(JSON.stringify(l.controls || [])),
        // Le récit écrase aussi la symbolisation : sans elle dans le snapshot,
        // l'utilisateur récupère la scène habillée par la dernière étape.
        declarative: l._declarative ? JSON.parse(JSON.stringify(l._declarative)) : null,
        symbolization: l.style?.symbolization
            ? JSON.parse(JSON.stringify(l.style.symbolization))
            : null,
        // Une étape peut basculer la couche en volume : sans mémoriser le rendu
        // d'origine, la scène resterait extrudée après la présentation.
        polygonMode: l.style?.polygonMode || null,
    }));
    // Une étape peut imposer son ordre de superposition : il faut pouvoir
    // rendre à l'utilisateur celui qu'il avait réglé.
    _preStoryOrder = STATE.layers.map((l) => l.id);
    // Ambiance / fond : le récit les écrase aussi — à restituer en sortant.
    _preStorySettings = {
        timeOfDay: STATE.settings.timeOfDay,
        date: STATE.settings.date instanceof Date
            ? STATE.settings.date.toISOString()
            : STATE.settings.date,
        labels: STATE.settings.labels,
        shadows: STATE.settings.shadows,
        sky: STATE.settings.sky,
        basemap: STATE.settings.basemap,
        buildings3D: STATE.settings.buildings3D,
        terrain3D: STATE.settings.terrain3D,
        projection: STATE.settings.projection,
    };
}

function restorePreStorySnapshot() {
    if (!_preStorySnapshot) return;
    for (const snap of _preStorySnapshot) {
        const l = STATE.layers.find((x) => x.id === snap.id);
        if (!l) continue;
        setLayerVisibility(l, snap.visible);
        l.controls = JSON.parse(JSON.stringify(snap.controls));
        delete l._filterPredicate;
        if (snap.polygonMode && l.style) l.style.polygonMode = snap.polygonMode;
        if (snap.symbolization) {
            if (!l.style) l.style = { mode: 'mapbox' };
            l.style.symbolization = JSON.parse(JSON.stringify(snap.symbolization));
        }
        if (snap.declarative) {
            l._declarative = JSON.parse(JSON.stringify(snap.declarative));
            applyDeclarativeToLayer(l, l._declarative);
        }
    }
    if (_preStoryOrder) {
        STATE.layers = sortByRank(STATE.layers,
            Object.fromEntries(_preStoryOrder.map((id, i) => [id, i])));
        _preStoryOrder = null;
    }
    _preStorySnapshot = null;
    if (_preStorySettings) {
        const prevBm = STATE.settings.basemap;
        const wantBm = _preStorySettings.basemap;
        const switching = !!(wantBm && BASEMAPS[wantBm] && wantBm !== prevBm);
        applyStoryEnvironment(_preStorySettings, {
            allowBasemapSwitch: true,
            onBasemapReady: () => {
                remountAllLayers();
                updateLegend();
            },
        });
        _preStorySettings = null;
        return switching;
    }
    return false;
}

/**
 * Applique l'ambiance d'une étape (ou du snapshot pré-récit).
 * Le fond (`basemap`) contourne le filtre `exposed` / allowed de la lecture :
 * rejouer une capture n'est pas une action utilisateur sur le dock.
 */
function applyStoryEnvironment(s, opts = {}) {
    if (!s) return;
    if (s.projection && s.projection !== STATE.settings.projection) {
        STATE.settings.projection = s.projection;
        applyProjection();
    }
    if (s.terrain3D != null && s.terrain3D !== STATE.settings.terrain3D) {
        STATE.settings.terrain3D = !!s.terrain3D;
        applyTerrain();
        recalerRelief();
    }
    if (typeof s.buildings3D === 'boolean') {
        STATE.settings.buildings3D = s.buildings3D;
        applyBuildingVisibility();
    }
    if (s.timeOfDay != null) STATE.settings.timeOfDay = Number(s.timeOfDay);
    if (s.date) STATE.settings.date = new Date(s.date);
    if (typeof s.labels === 'boolean') {
        STATE.settings.labels = s.labels;
        applyLabelsVisibility();
    }
    if (typeof s.shadows === 'boolean') STATE.settings.shadows = s.shadows;
    if (typeof s.sky === 'boolean') {
        STATE.settings.sky = s.sky;
        applySky();
    }
    updateLighting();
    map?.triggerRepaint?.();

    const want = s.basemap;
    if (!opts.allowBasemapSwitch || !want || !BASEMAPS[want] || !map) return;
    if (want === STATE.settings.basemap) return;
    STATE.settings.basemap = want;
    _styleUsable = false;
    const b = BASEMAPS[want];
    map.setStyle(b.style ? b.style() : b.url);
    map.once('idle', () => {
        onStyleReady();
        applyLabelsVisibility();
        updateLighting();
        map.triggerRepaint?.();
        opts.onBasemapReady?.();
    });
}

function applyControls(layer, opts = {}) {
    layer._filterPredicate = buildControlPredicate(layer);
    syncLayerSourceData(layer);
    Models3D.scheduleBuild();
    if (!opts.skipLegend) updateLegend();
    if (CONFIG.viewMode) refreshViewerControlsHud();
}

async function persistStory(immediate = false) {
    if (!CONFIG.grist.ready || CONFIG.viewMode) return;
    clearTimeout(_persistStoryTimer);
    const save = async () => {
        try {
            await saveStoryToGrist(grist.docApi, STATE.story, { viewMode: CONFIG.viewMode });
        } catch (e) {
            console.warn('[Atlas story] save', e.message);
            enterViewModeOnWriteFail(e);
            // « Etape capturee » s'affiche des le clic, avant meme que
            // l'enregistrement ne parte. Sans ce signal, un echec restait
            // invisible et l'utilisateur croyait son recit conserve.
            showToast('Récit non enregistré — ' + e.message, 'error');
        }
    };
    if (immediate) return save();
    return new Promise((resolve) => {
        _persistStoryTimer = setTimeout(async () => {
            await save();
            resolve();
        }, 400);
    });
}

/**
 * Le nombre d'entités d'une couche — **`null` quand on ne le sait pas**.
 *
 * `|| 0` rendait zéro dans deux situations que rien ne distinguait ensuite :
 * une couche réellement vide, et une couche dont Atlas ne détient pas les
 * entités. Or zéro est un nombre parfaitement plausible : « 0 obj. » se lit
 * comme un renseignement, pas comme une ignorance, et on cherche alors pourquoi
 * la donnée est vide au lieu de comprendre qu'elle est ailleurs.
 */
function layerVisibleCount(layer) {
    const n = filteredGeoJSON(layer)?.features?.length;
    if (Number.isFinite(n) && n > 0) return n;
    // Rien en local : soit la couche est distante et le manifeste sait peut-être
    // compter à sa place, soit elle est vraiment vide et zéro est la réponse.
    if (layer?._distant) return Number.isFinite(layer._nFeaturesDeclare) ? layer._nFeaturesDeclare : null;
    return Number.isFinite(n) ? n : 0;
}

/**
 * Le compte tel qu'il s'affiche.
 *
 * Un compte déclaré par le manifeste et non vérifié s'annonce comme tel — le
 * « ≈ » dit qu'on rapporte au lieu de constater. Un compte inconnu ne s'affiche
 * pas du tout : mieux vaut un blanc qu'un chiffre faux.
 */
function formatLayerCount(layer) {
    const n = layerVisibleCount(layer);
    if (n == null) return '—';
    const approx = layer?._distant && !filteredGeoJSON(layer)?.features?.length;
    return (approx ? '≈' : '') + n;
}

/**
 * Couche visée par une étape de récit.
 *
 * La table source prime sur le nom : deux couches distinctes peuvent porter le
 * même libellé (« Grille d'analyse 200 m » sur deux imports différents), et
 * piloter la mauvaise appliquerait des styles et des filtres à des données qui
 * ne sont pas celles de l'étape. Le nom ne sert que de repli, pour les récits
 * enregistrés avant que sourceTable ne soit systématiquement capturé.
 */
function findStoryLayer(ls) {
    if (!ls) return null;
    return (ls.sourceTable && STATE.layers.find((x) => x.sourceTable === ls.sourceTable))
        || STATE.layers.find((x) => x.id === ls.id)
        || STATE.layers.find((x) => x.name === ls.name)
        || null;
}

function cloneStoryState(s) {
    return s ? JSON.parse(JSON.stringify(s)) : null;
}

/** Symbo + visibilité + contrôles (sans remontage carte). */
function applyStoryLayerMeta(l, ls) {
    // Rendu surfacique : porté par le style, pas par la symbolisation. Une étape
    // qui le cite peut donc montrer un bâti en volume puis le remettre à plat.
    // Posé avant l'affichage : le repli en points ne vise que les surfaces à
    // plat, il doit connaître le mode au moment où la couche se monte.
    if (ls.polygonMode) {
        if (!l.style) l.style = { mode: 'mapbox' };
        l.style.polygonMode = ls.polygonMode;
    }
    setLayerVisibility(l, ls.visible);
    if (ls.symbolization) {
        if (!l.style) l.style = { mode: 'mapbox' };
        l.style.symbolization = ls.symbolization;
        if (ls.declarative) {
            l._declarative = ls.declarative;
        } else {
            syncLayerDeclarative(l);
        }
        syncFeatureColorsFromSymbolization(l, sequentialPaletteForSym(l.style.symbolization.color, l));
    } else if (ls.declarative) {
        l._declarative = ls.declarative;
        applyDeclarativeToLayer(l, ls.declarative);
    }
    l.controls = l.controls || [];
    applyStoryControlsToLayer(l, ls.controls || []);
    delete l._filterPredicate;
}

/** Remonte la couche sur la carte (comme après refresh) — évite la surcouche setData. */
function syncStoryLayerToMap(l) {
    syncLayerToMapState(l);
}

function reapplyStoryFilters(state) {
    if (!state?.layers?.length) return;
    state.layers.forEach((ls) => {
        const l = findStoryLayer(ls);
        if (!l) return;
        applyStoryControlsToLayer(l, ls.controls || []);
        syncStoryLayerToMap(l);
    });
    Models3D.rebuildScene();
    updateLegend();
    // Le dock doit suivre : une étape désactive tout contrôle qu'elle ne cite
    // pas (`applyStoryControlsToLayer`), et sans ce rafraîchissement les
    // pastilles rendues avant l'étape restaient à l'écran, devenues inertes —
    // au clic, la pastille était introuvable dans la liste et le panneau
    // s'ouvrait vide. Une pastille qui ne fait rien est pire qu'une pastille
    // absente : on la croit cassée, alors que la scène l'a éteinte.
    refreshControlsDock();
}

function applyStoryState(s) {
    if (!s || !map) return;
    _storyPresenting = true;

    // L'ordre de superposition fait partie de l'étape : il est déjà enregistré
    // dans la position des couches (captureStoryState les liste dans l'ordre de
    // STATE.layers), y compris dans les récits antérieurs à cette lecture.
    if ((s.layers || []).length) {
        const rangs = {};
        s.layers.forEach((ls, i) => {
            const l = findStoryLayer(ls);
            if (l) rangs[l.sourceTable || l.id] = i;
        });
        STATE.layers = sortByRank(STATE.layers, rangs);
    }

    const cited = new Set();
    (s.layers || []).forEach((ls) => {
        const l = findStoryLayer(ls);
        if (!l) return;
        cited.add(l);
        applyStoryLayerMeta(l, ls);
    });
    // Une étape décrit l'état complet de la scène : une couche qu'elle ne cite
    // pas doit être masquée, sinon elle traverse le récit dans l'état où
    // l'utilisateur l'avait laissée. captureStoryState() enregistre toujours
    // toutes les couches — seuls les récits écrits à la main sont partiels.
    // L'état d'origine est rétabli en sortie via restorePreStorySnapshot().
    if ((s.layers || []).length) {
        STATE.layers.forEach((l) => {
            if (!cited.has(l) && l.visible !== false) setLayerVisibility(l, false);
        });
    }
    (s.layers || []).forEach((ls) => {
        const l = findStoryLayer(ls);
        if (!l) return;
        syncStoryLayerToMap(l);
    });
    // Le tri ci-dessus ne touche que `STATE.layers` ; la pile MapLibre, elle, ne
    // bouge que si une couche est remontée — ce qui n'arrive pas d'une étape à
    // l'autre quand toutes sont déjà en place. Sans cet appel, le panneau
    // affiche l'ordre de l'étape et la carte peint l'ordre précédent.
    applyLayerOrder();
    Models3D.rebuildScene();
    updateLegend();
    // Le dock suit l'étape, au même titre que la légende : celle-ci vient
    // d'être reconstruite parce que les couches ont changé, et les contrôles
    // ont changé aussi — une étape désactive tout filtre qu'elle ne cite pas.
    refreshControlsDock();

    const wantBasemap = s.basemap && BASEMAPS[s.basemap] ? s.basemap : null;
    const basemapChanging = !!(wantBasemap && wantBasemap !== STATE.settings.basemap);

    const finishCamera = () => {
        if (!_storyPresenting || !s.camera || !map) return;
        const snap = cloneStoryState(s);
        const reapply = () => {
            if (!_storyPresenting) return;
            applyStoryEnvironment(snap, { allowBasemapSwitch: false });
            reapplyStoryFilters(snap);
            map.triggerRepaint?.();
        };
        map.once('moveend', reapply);
        map.flyTo({
            center: s.camera.center,
            zoom: s.camera.zoom,
            pitch: s.camera.pitch,
            bearing: s.camera.bearing,
            duration: 1500,
        });
    };

    applyStoryEnvironment(s, {
        allowBasemapSwitch: true,
        onBasemapReady: () => {
            // Après setStyle, re-synchroniser les couches de l'étape puis voler.
            (s.layers || []).forEach((ls) => {
                const l = findStoryLayer(ls);
                if (!l) return;
                applyStoryLayerMeta(l, ls);
                syncStoryLayerToMap(l);
            });
            applyLayerOrder();
            Models3D.rebuildScene();
            updateLegend();
            finishCamera();
        },
    });

    if (!basemapChanging) finishCamera();
}

// ============================================================
// MODULES — chrome contextuel
// ============================================================
const MODULE_TITLES = {
    lieu: 'Lieu', couches: 'Couches', controles: 'Contrôles', recit: 'Récit',
    soleil: 'Soleil', vues: 'Vue & rendu', reglages: 'Catalogue 3D',
};

const VIEW_AUTHOR_MODULES = new Set(['lieu', 'soleil', 'vues', 'controles', 'reglages', 'couches']);

function openModule(name) {
    if (CONFIG.viewMode && name === 'recit') {
        if (!(STATE.story?.length)) {
            showToast('Aucun récit publié', 'info');
            return;
        }
        A.storyPlay(0);
        return;
    }
    if (CONFIG.viewMode && VIEW_AUTHOR_MODULES.has(name)) {
        showToast('Mode lecture — utilisez la légende pour cibler', 'info');
        return;
    }
    STATE.currentModule = name;
    document.querySelectorAll('.rail-item').forEach((b) => b.classList.toggle('active', b.dataset.module === name));
    $('module-title').textContent = (MODULE_TITLES[name] || name).replace(/^[^ ]+ /, (m) => m);
    $('module-panel').classList.add('open');
    $('module-foot').style.display = 'none';
    if (document.body.classList.contains('mobile-layout')) {
        // L'onglet suit le module, d'ou qu'il vienne — palette de commandes,
        // feuille « Plus », clic sur une couche. Sans cela, retoucher l'onglet
        // ne refermait pas : la barre ignorait ce qui etait ouvert.
        document.querySelectorAll('#mobile-nav [data-mobile-tab]').forEach((b) => {
            b.classList.toggle('active', b.dataset.mobileTab === name);
        });
        // A mi-hauteur : la carte reste visible sous le panneau, c'est elle le
        // sujet. Une feuille deja deployee garde la hauteur qu'on lui a donnee.
        installerFeuilleMobile().then(() => {
            if (feuillePosition === 'fermee') poserFeuille('demi');
        });
    }

    if (name === 'lieu') renderLieu();
    // Le scan des tables géo ne sert qu'à la liste « à afficher » de ce
    // panneau : il est fait ici, pas au chargement de la scène.
    else if (name === 'couches') { renderLayersPanel(name); refreshGeoTables(); }
    else if (name === 'symbo') renderLayersPanel(name);
    else if (name === 'controles') renderControles();
    else if (name === 'recit') renderRecit();
    else if (name === 'reglages') renderModelsPanel();
    else if (name === 'soleil') renderSoleil();
    else if (name === 'vues') renderVues();

    renderInspector();
}
/**
 * Annonce la scene qu'on ouvre, avant meme d'avoir ses donnees.
 *
 * Le chargement prend quelques secondes ; pendant ce temps l'en-tete affichait
 * « Nouveau projet » et la legende « Aucune couche visible », sur une carte
 * vide posee a l'ancrage par defaut. Tout disait que l'ouverture avait echoue,
 * alors qu'elle etait en cours.
 */
function annoncerOuverture(nom) {
    const t = document.getElementById('project-name');
    if (t && nom) t.textContent = nom;
    const l = document.getElementById('legend');
    const corps = document.getElementById('legend-body');
    if (corps && !corps.textContent.trim()) corps.textContent = 'Chargement…';
    if (l) l.dataset.ouverture = '1';
}
if (typeof window !== 'undefined') window.__atlasAnnoncerOuverture = annoncerOuverture;

function closeModulePanel() {
    if (Feuille) poserFeuille('fermee');
    $('module-panel').classList.remove('open');
    document.querySelectorAll('.rail-item').forEach((b) => b.classList.remove('active'));
    STATE.currentModule = null;
    renderInspector();
}

// ---- Lieu ----
let searchTimer = null;
let locationPickMode = false;
function renderLieu() {
    $('module-title').textContent = 'Lieu';
    const L = STATE.location;
    $('module-body').innerHTML = `
        <div class="section loc-identite">
            <div class="section-title">Nom du projet</div>
            <input class="input" id="proj-name" placeholder="Ma maquette…" value="${STATE.projectName}" onchange="A.setProjectName(this.value)">
        </div>
        <div class="loc-badge">
            <span class="ic">${icTrait(IC.epingle)}</span>
            <div>
                <div class="nm">${L.name || 'Non défini'}</div>
                <div class="co">${(L.lat ?? 0).toFixed(5)}°N · ${(L.lng ?? 0).toFixed(5)}°E</div>
            </div>
            <button class="loc-change" onclick="A.recenter()">Recentrer</button>
        </div>
        <div class="section">
            <div class="section-title">Rechercher un lieu</div>
            <input class="input" id="loc-search" placeholder="Adresse, ville, monument…" oninput="A.searchLocation(this.value)">
            <div class="search-results" id="loc-results"></div>
        </div>
        <div class="section">
            <button class="btn btn-soft btn-full" onclick="A.useGeolocation()">${icTrait(IC.epingle)} Ma position actuelle</button>
            <button class="btn btn-soft btn-full" style="margin-top:8px" onclick="A.pickOnMap()">${icTrait(IC.carte)} Pointer sur la carte</button>
        </div>
        <div class="section">
            <div class="section-title">Coordonnées manuelles</div>
            <div class="dual">
                <div><label class="input-label">Latitude</label><input class="input" id="loc-lat" type="number" step="0.0001" value="${(L.lat ?? '').toString()}"></div>
                <div><label class="input-label">Longitude</label><input class="input" id="loc-lng" type="number" step="0.0001" value="${(L.lng ?? '').toString()}"></div>
            </div>
            <button class="btn btn-soft btn-full" style="margin-top:10px" onclick="A.applyManualCoords()">Aller</button>
        </div>
`;
}

// ---- Couches ----
/**
 * Métadonnées d'une table candidate. Le scan ne lit que les noms de colonnes :
 * annoncer « 0 obj. » serait faux — mieux vaut ne rien annoncer que du faux.
 */
function geoTableMeta(g) {
    const bits = [];
    if (Number.isFinite(g.count)) bits.push(`<span>${g.count} obj.</span>`);
    bits.push(`<span class="badge3d">${g.geomType || 'géo'}</span>`);
    return bits.join('');
}

async function refreshGeoTables() {
    if (!CONFIG.grist.ready) { _geoTables = []; return; }
    try { _geoTables = await scanGeoTables(grist.docApi); } catch (e) { _geoTables = []; }
    if (STATE.currentModule === 'couches') renderLayersPanel('couches');
}

function availableTablesSection() {
    if (!CONFIG.grist.ready) return '';
    const linked = new Set(STATE.layers.filter((l) => l.sourceTable).map((l) => l.sourceTable));
    const avail = _geoTables.filter((g) => !linked.has(g.table));
    if (!avail.length) return '';
    return `<div class="section"><div class="section-title">Tables géo du document · à afficher</div><div class="layer-list">${avail.map((g) => `
        <div class="layer-item" onclick="A.showGeoTable('${String(g.table).replace(/'/g, "\\'")}')">
            <span class="layer-vis" title="Afficher comme couche">＋</span>
            <div class="layer-info"><div class="layer-name">${g.table}</div><div class="layer-meta">${geoTableMeta(g)}</div></div>
            <button class="layer-act" title="Afficher">${icTrait(IC.oeil)}</button>
        </div>`).join('')}</div></div>`;
}

    const actions = () => `
        <div class="section layer-actions">
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-primary" style="flex:1" onclick="A.openOSM()">${icTrait(IC.globe)} OSM</button>
                <button class="btn btn-soft" style="flex:1" onclick="document.getElementById('file-input').click()">${icTrait(IC.fichier)} Fichier</button>
                ${CONFIG.grist.ready ? `<button class="btn btn-soft" style="flex:1" onclick="A.openLinkTable()">${icTrait(IC.lien)} Table</button>` : ''}
            </div>
        </div>`;

function renderLayersPanel(mode) {
    if (CONFIG.viewMode) {
        renderLayersPanelLecture();
        return;
    }
    $('module-title').textContent = 'Couches';
    const body = $('module-body');
    if (STATE.layers.length === 0) {
        body.innerHTML = `
            <div class="empty"><div class="ic">${icTrait(IC.dossier, 40)}</div><div class="t">Aucune couche affichée</div><div class="h">Affiche une table ci-dessous, ou importe</div></div>
            ${availableTablesSection()}
            <div class="section"><div class="drop" id="drop" onclick="document.getElementById('file-input').click()"><div class="ic">${icTrait(IC.fichier, 40)}</div><div class="t">Glissez un GeoJSON</div><div class="h">.geojson / .json</div></div></div>
            ${actions()}`;
        wireDrop();
        return;
    }
    const allVis = STATE.layers.every((l) => l.visible !== false);
    body.innerHTML = `
        <div class="section" style="margin-top:0">
            <div style="display:flex;gap:8px">
                <button class="btn ${allVis ? 'btn-dark' : 'btn-soft'}" style="flex:1" onclick="A.toggleAllLayers(true)">${icTrait(IC.oeil)} Tout</button>
                <button class="btn ${!STATE.layers.some((l) => l.visible !== false) ? 'btn-dark' : 'btn-soft'}" style="flex:1" onclick="A.toggleAllLayers(false)">Masquer</button>
            </div>
        </div>
        <div class="layer-list">
            ${displayOrder(STATE.layers).map((l) => {
                const is3D = l.style?.mode === 'library' || l.style?.mode === 'custom';
                const visible = l.visible !== false;
                const linked = isLinkedTableLayer(l);
                const sel = STATE.selectedLayer === l.id;
                // Réordonnancement sur la seule couche sélectionnée : la ligne
                // porte déjà cinq commandes. Désactivés aux bornes plutôt que
                // masqués — la ligne garderait sinon une largeur changeante.
                // Poignée dédiée : la ligne entière porte déjà la sélection, un
                // glissement sur elle se battrait avec le clic.
                // Poignée focalisable : le glissement seul exclurait la
                // navigation au clavier (Tab pour l'atteindre, ↑/↓ pour déplacer).
                const poignee = CONFIG.viewMode ? ''
                    : `<span class="layer-grip" data-layer="${l.id}" tabindex="0" role="button"
                        aria-label="Réordonner ${l.name} — glisser, ou flèches haut et bas"
                        title="Glisser pour réordonner (ou ↑ ↓ au clavier)">⠿</span>`;
                return `<div class="layer-item ${sel ? 'active' : ''}" data-layer="${l.id}" onclick="A.selectLayer('${l.id}')">
                    ${poignee}
                    <span class="layer-vis ${visible ? 'on' : ''}" onclick="A.toggleLayer('${l.id}', event)">${icTrait(visible ? IC.oeil : IC.oeilBarre)}</span>
                    <span class="layer-swatch" style="background:${l.color}"></span>
                    <div class="layer-info">
                        <div class="layer-name">${l.name}</div>
                        <div class="layer-meta"><span>${formatLayerCount(l)} obj.</span>${is3D ? '<span class="badge3d">3D</span>' : ''}${linked ? '<span class="badge-saved">⛓ table</span>' : (l.gristId ? '<span class="badge-saved">Grist</span>' : '')}</div>
                    </div>
                    ${linked ? `<button class="layer-act" onclick="A.refreshLayer('${l.id}', event)" title="Rafraîchir depuis la table">${icTrait(IC.rafraichir)}</button>` : ''}
                    <button class="layer-act" onclick="A.zoomLayer('${l.id}', event)" title="Zoomer sur la couche">${icTrait(IC.cible)}</button>
                    <button class="layer-del" onclick="A.deleteLayer('${l.id}', event)" title="Supprimer">${icTrait(IC.corbeille)}</button>
                </div>`;
            }).join('')}
        </div>
        ${availableTablesSection()}
        ${actions()}`;
    wireLayerReorder(body);
}

/** Liste couches en lecture : légende + zoom, sans paramétrage. */
function renderLayersPanelLecture() {
    $('module-title').textContent = 'Légende';
    const body = $('module-body');
    // Même sens de lecture que le panneau d'édition : le dessus en premier.
    const visible = displayOrder(STATE.layers).filter((l) => l.visible !== false);
    if (!visible.length) {
        body.innerHTML = `<div class="empty"><div class="ic">${icTrait(IC.carte, 40)}</div><div class="t">Scène vide</div><div class="h">Aucune couche visible (configuration éditeur)</div></div>`;
        return;
    }
    body.innerHTML = `
        <div class="hint">Affichage tel que configuré par l’éditeur.</div>
        <div class="layer-list">${visible.map((l) => {
            const is3D = l.style?.mode === 'library' || l.style?.mode === 'custom';
            return `<div class="layer-item">
                <span class="layer-swatch" style="background:${l.color}"></span>
                <div class="layer-info">
                    <div class="layer-name">${l.name}</div>
                    <div class="layer-meta"><span>${formatLayerCount(l)} obj.</span>${is3D ? '<span class="badge3d">3D</span>' : ''}</div>
                </div>
                <button class="layer-act" onclick="A.zoomLayer('${l.id}', event)" title="Zoomer">${icTrait(IC.cible)}</button>
            </div>`;
        }).join('')}</div>`;
}

/**
 * Icones du dock, au trait.
 *
 * C'etaient des emoji, faute d'un glyphe Unicode present partout — un `▦`
 * s'affichait vide sur les polices systeme courantes. Mais l'emoji ne resout
 * rien : sur Android il sort en Noto couleur, a une taille que la page ne
 * controle pas, et pique des pastilles bariolees dans une interface qui n'en a
 * aucune. Un trace inline ne depend d'aucune police et suit la couleur du texte.
 */
function icTrait(d, taille = 19) {
    // L'epaisseur se reduit quand l'icone grandit, sinon une illustration d'etat
    // vide parait grossiere a cote d'un bouton de 19 px.
    const trait = taille > 32 ? 1.3 : 1.7;
    return `<svg class="ic-trait" width="${taille}" height="${taille}" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="${trait}" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">${d}</svg>`;
}

/**
 * Le vocabulaire d'icones des panneaux.
 *
 * Un seul endroit ou les tracer : la meme corbeille doit etre la meme partout,
 * et une icone qui change de dessin d'un panneau a l'autre se lit comme deux
 * actions differentes.
 */
const IC = {
    oeil:      '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    oeilBarre: '<path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a18 18 0 0 1-3.1 3.9M6.6 6.7A17.9 17.9 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 4.2-.9"/><path d="M3 3l18 18"/>',
    cible:     '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
    corbeille: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7"/><path d="M10 11v6m4-6v6"/>',
    rafraichir:'<path d="M20 11a8 8 0 1 0-2.3 6.2"/><path d="M20 5v6h-6"/>',
    lien:      '<path d="M10 13a5 5 0 0 0 7.1.1l2.9-2.9a5 5 0 0 0-7.1-7.1L11 4.9"/><path d="M14 11a5 5 0 0 0-7.1-.1L4 13.8a5 5 0 0 0 7.1 7.1l1.8-1.8"/>',
    fichier:   '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    dossier:   '<path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H3z"/>',
    globe:     '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15 0 18M12 3C9.5 5.7 9.5 18 12 21"/>',
    carte:     '<path d="m9 3-6 3v15l6-3 6 3 6-3V3l-6 3z"/><path d="M9 3v15m6-12v15"/>',
    epingle:   '<path d="M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12z"/><circle cx="12" cy="10" r="2.6"/>',
    loupe:     '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/>',
    soleil:    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
    recit:     '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M9 7h7M9 11h5"/>',
    controles: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    reglages:  '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    camera:    '<path d="M3 7h3l2-3h8l2 3h3v13H3z"/><circle cx="12" cy="13" r="3.2"/>',
    palette:   '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1-.8-1.5-.8-2.4 0-.9.7-1.5 1.6-1.5H16a5 5 0 0 0 5-5c0-4-4-7.5-9-7.5z"/><circle cx="7.5" cy="11" r="1.1" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1.1" fill="currentColor"/><circle cx="15" cy="8.5" r="1.1" fill="currentColor"/>',
    cube:      '<path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/>',
    enregistrer:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    exporter:  '<path d="M12 3v13M7 8l5-5 5 5M5 21h14"/>',
    piste:     '<path d="M4 20V7a3 3 0 0 1 6 0v10a3 3 0 0 0 6 0V4"/><path d="M17 7h4M17 4h4"/>',
    pieton:    '<circle cx="12" cy="4" r="2"/><path d="M12 7v6m0 0-3 8m3-8 3 8M8 10l4-2 4 2"/>',
};



function controlTypeIcon(type) {
    // Les filtres gardent leurs emoji : ils nomment une donnee, pas une commande
    // de la carte, et l'utilisateur les repere mieux ainsi dans une rangee de
    // pastilles. Le sujet est le choix de l'auteur de la scene, pas la charte.
    if (type === 'time') return '🕑';
    if (type === 'range') return '📊';
    return '🏷️';
}

function controlTypeLabel(type) {
    if (type === 'time') return 'time';
    if (type === 'range') return 'range';
    return 'select';
}

function controlVariantOptions(type) {
    if (type === 'time') {
        return [
            { value: 'time_lte', label: 'Date ≤', hint: 'Cumulatif : tout ce qui est antérieur ou égal à la date choisie. Idéal pour une chronologie « jusqu’à ».' },
            { value: 'time_between', label: 'Date de/à', hint: 'Fenêtre temporelle stricte entre deux dates. Idéal pour comparer une période précise.' },
        ];
    }
    if (type === 'range') {
        return [
            { value: 'range_between', label: 'Plage min/max', hint: 'Intervalle numérique complet (de … à …). Le plus polyvalent.' },
            { value: 'range_max', label: 'Maximum', hint: 'Seuil haut uniquement (≤ valeur). Utile pour « en dessous de ».' },
            { value: 'range_min', label: 'Minimum', hint: 'Seuil bas uniquement (≥ valeur). Utile pour « au-dessus de ».' },
        ];
    }
    return [
        { value: 'select_multi', label: 'Checklist', hint: 'Plusieurs catégories en parallèle. Filtre cumulatif (OU logique).' },
        { value: 'select_single', label: 'Choix unique', hint: 'Une seule catégorie à la fois. Lecture plus simple sur mobile.' },
    ];
}

function defaultControlVariant(type) {
    if (type === 'time') return 'time_lte';
    if (type === 'range') return 'range_between';
    return 'select_multi';
}

function ensureControlVariant(c, type) {
    const options = new Set(controlVariantOptions(type || c.type).map((x) => x.value));
    if (!options.has(c.variant)) c.variant = defaultControlVariant(type || c.type);
}

function controlVariantHint(type, variant) {
    const opt = controlVariantOptions(type).find((x) => x.value === variant);
    return opt?.hint || '';
}

function controlVariantDockLabel(c) {
    const v = c.variant || defaultControlVariant(c.type);
    const map = {
        time_lte: 'Jusqu’à',
        time_between: 'Période',
        range_between: 'Plage',
        range_max: 'Max',
        range_min: 'Min',
        select_multi: 'Filtres',
        select_single: 'Choix',
    };
    return map[v] || dockControlTypeTag(c.type);
}

function dockControlTypeTag(type) {
    if (type === 'time') return 'Temps';
    if (type === 'range') return 'Plage';
    return 'Catégories';
}

function dockPillId(layer, field) {
    return `data:${layer.id}:${field}`;
}

/** Pastilles dock : env (édition = toujours ; lecture = exposed) + données actives. */
function listDockPills() {
    const pills = [];
    const vcs = STATE.viewerControls || createDefaultViewerControls();

    // L'interrupteur gouverne la pastille, en edition comme en lecture.
    //
    // Il ne le faisait qu'en lecture : en edition les trois pastilles
    // d'environnement s'affichaient quoi qu'il arrive, et le panneau annoncait
    // « desactive » pendant que la carte montrait le contraire. Un reglage qui
    // ne fait rien de visible est pire qu'un reglage absent — on doute de ce
    // qu'on vient de faire.
    //
    // L'auteur ne perd aucun acces : le soleil, la vue et les fonds gardent
    // leur module dans le rail lateral. La pastille dit ce que le LECTEUR
    // verra ; c'est bien ce que le libelle promet sous chaque interrupteur.
    if (getViewerControl(vcs, 'sun')?.exposed) {
        pills.push({ id: 'sun', kind: 'sun', icon: '☀', label: 'Soleil' });
    }
    // Icônes du dock : s'en tenir aux emoji, avec leur sélecteur de variante
    // (U+FE0F). Un glyphe symbolique rare — ici `▦` U+25A6 — n'existe pas dans
    // les polices système courantes, et un emoji sans sélecteur bascule en
    // rendu texte : dans les deux cas la pastille s'affiche vide, sans erreur.
    if (getViewerControl(vcs, 'view3d')?.exposed) {
        pills.push({ id: 'view3d', kind: 'env', icon: '🏙️', label: '2D / 3D' });
    }
    if (getViewerControl(vcs, 'basemap')?.exposed) {
        pills.push({ id: 'basemap', kind: 'env', icon: '🗺️', label: 'Fonds' });
    }
    for (const { layer, c } of collectPublishedControls()) {
        pills.push({
            id: dockPillId(layer, c.field),
            kind: 'data',
            icon: controlTypeIcon(c.type),
            label: (c.label || c.field).trim() || c.field,
            layer,
            control: c,
        });
    }
    return pills;
}

function basemapChoicesForDock() {
    const vc = getViewerControl(STATE.viewerControls, 'basemap');
    if (!CONFIG.viewMode) return Object.keys(BASEMAPS);
    const allowed = vc?.config?.allowed || [];
    if (!allowed.length) return Object.keys(BASEMAPS);
    return allowed.filter((k) => BASEMAPS[k]);
}

function renderSunDockSlotHtml() {
    const vc = getViewerControl(STATE.viewerControls, 'sun');
    const shadowsOn = vc?.config?.shadows !== false && STATE.settings.shadows;
    return `<div class="dock-slot-sun" id="sun-strip">
        <div class="seg-inline">
            <span class="date" id="sun-date">—</span>
            <span class="time" id="sun-time">12:00</span>
        </div>
        <div class="sun-arc" id="sun-arc">
            <svg width="168" height="34" viewBox="0 0 168 34" aria-hidden="true">
                <path d="M8 24 Q 84 10, 160 24" stroke="#C9C0A8" stroke-width="1.2" fill="none" stroke-dasharray="2 3" />
                <path id="sun-arc-prog" d="M8 24 Q 84 10, 160 24" stroke="#E8A234" stroke-width="1.8" fill="none" stroke-dasharray="0, 1000" />
            </svg>
            <div class="sun-dot" id="sun-dot"></div>
            <span class="hlbl" style="left:2px">06h</span>
            <span class="hlbl" style="right:2px">20h</span>
        </div>
        <div class="seg-inline">
            <span class="alt-lbl">Hauteur</span>
            <span class="alt-v" id="sun-alt">—</span>
        </div>
        <div class="vsep"></div>
        <button type="button" class="shadow-toggle ${shadowsOn ? 'on' : ''}" id="shadow-toggle">
            <svg class="ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2m10-10h-2M4 12H2"/></svg>
            <span>Ombres</span>
        </button>
    </div>`;
}

function renderView3dDockSlotHtml() {
    const pitch = map?.getPitch() || 0;
    const is3d = pitch > 10;
    return `<div class="dock-slot-view3d">
        <div class="dock-seg">
            <button type="button" class="dock-seg-btn ${!is3d ? 'active' : ''}" onclick="A.setView3d(false)">2D</button>
            <button type="button" class="dock-seg-btn ${is3d ? 'active' : ''}" onclick="A.setView3d(true)">3D</button>
        </div>
    </div>`;
}

function renderBasemapDockSlotHtml() {
    const keys = basemapChoicesForDock();
    const cur = STATE.settings.basemap;
    return `<div class="dock-slot-basemap">
        <div class="dock-chips">${keys.map((k) => {
            const b = BASEMAPS[k];
            const esc = String(k).replace(/'/g, "\\'");
            const lbl = String(b.label).replace(/"/g, '&quot;');
            return `<button type="button" class="dock-chip ${cur === k ? 'active' : ''}" onclick="A.setBasemap('${esc}')" title="${lbl}">${b.icon}<span>${b.label}</span></button>`;
        }).join('')}</div>
    </div>`;
}

function renderDockSlotHost() {
    const slotHost = $('dock-slot-host');
    const panel = $('dock-panel');
    if (!slotHost || !_openDockPill) return;
    const pill = listDockPills().find((p) => p.id === _openDockPill);
    if (!pill) {
        slotHost.innerHTML = '';
        return;
    }
    panel?.classList.toggle('dock-panel-tall', pill.kind === 'data');
    if (pill.id === 'sun') {
        slotHost.innerHTML = renderSunDockSlotHtml();
        updateSunStrip();
    } else if (pill.id === 'view3d') {
        slotHost.innerHTML = renderView3dDockSlotHtml();
    } else if (pill.id === 'basemap') {
        slotHost.innerHTML = renderBasemapDockSlotHtml();
    } else if (pill.kind === 'data') {
        const t = controlVariantDockLabel(pill.control);
        const label = (pill.label || '').replace(/</g, '&lt;');
        slotHost.innerHTML = `<div class="dock-slot-data">
            <div class="dock-slot-head">
                <span class="dock-slot-title">${label}</span>
                <span class="dock-slot-tag">${t}</span>
            </div>
            <div class="dock-slot-body">${renderControlBody(pill.layer, pill.control)}</div>
        </div>`;
    }
}

/** Dock pastilles — FABs + une capsule ouverte (env + données actives). */
function refreshControlsDock() {
    const dock = $('map-controls-dock');
    const fabsHost = $('dock-fabs');
    const slotHost = $('dock-slot-host');
    if (!dock || !fabsHost) return;

    const pills = listDockPills();
    const hasPills = pills.length > 0;
    dock.classList.toggle('has-pills', hasPills);
    if (!hasPills) {
        fabsHost.innerHTML = '';
        if (slotHost) slotHost.innerHTML = '';
        _openDockPill = null;
        return;
    }

    if (_openDockPill && !pills.some((p) => p.id === _openDockPill)) {
        _openDockPill = null;
        dock.classList.add('collapsed');
    }

    // Sans pastille ouverte, le seul état cohérent est « replié ».
    //
    // Le CSS lie les deux moitiés du dock : `.collapsed` montre les pastilles et
    // cache le panneau, son absence fait l'inverse. Or `wireMapControlsDock` part
    // sur `collapsed = false` quand rien n'est mémorisé — le cas de toute
    // première ouverture. Le panneau, lui, ne se remplit que s'il y a une
    // pastille ouverte. Les deux moitiés se retrouvaient donc vides en même
    // temps : les pastilles rendues mais masquées par
    // `:not(.collapsed) .dock-fabs { display: none }`, le panneau affiché mais
    // sans contenu.
    //
    // À l'écran : un rectangle nu de 61 px portant le seul bouton « Replier »,
    // et des contrôles inatteignables. Le défaut est resté invisible tant
    // qu'aucune scène ne déclarait de contrôle **actif** — `listDockPills` ne
    // retenant que ceux-là, `hasPills` était faux et la fonction sortait avant
    // d'en arriver ici.
    if (!_openDockPill) dock.classList.add('collapsed');

    fabsHost.innerHTML = pills.map((p) => {
        const lbl = String(p.label).replace(/"/g, '&quot;');
        const pid = String(p.id).replace(/"/g, '&quot;');
        const isOpen = _openDockPill === p.id && !dock.classList.contains('collapsed');
        const ic = p.id === 'sun'
            ? '<span class="sun-dot" aria-hidden="true"></span>'
            : `<span class="dock-fab-ic" aria-hidden="true">${p.icon}</span>`;
        return `<button type="button" class="dock-fab ${isOpen ? 'active' : ''}" data-pill="${pid}" title="${lbl}" aria-label="${lbl}">${ic}</button>`;
    }).join('');

    fabsHost.querySelectorAll('[data-pill]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.pill;
            if (_openDockPill === id && !dock.classList.contains('collapsed')) {
                dock.classList.add('collapsed');
            } else {
                _openDockPill = id;
                dock.classList.remove('collapsed');
                renderDockSlotHost();
            }
        });
    });

    if (!dock.classList.contains('collapsed') && _openDockPill) {
        renderDockSlotHost();
    } else if (slotHost) {
        slotHost.innerHTML = '';
        $('dock-panel')?.classList.remove('dock-panel-tall');
    }
}

async function syncScenePrefsFromGrist() {
    if (!CONFIG.grist.ready) return;
    const prefs = await loadScenePrefs(grist.docApi);
    STATE.viewerControls = prefs.viewerControls || createDefaultViewerControls();

    // Les réglages retenus la fois d'avant priment sur les défauts du code :
    // qui a choisi un fond veut le retrouver, pas repartir de « liberty ». Ils
    // ne priment pas sur une étape de récit, qui décrit un état voulu par
    // l'auteur et s'applique après.
    const s = prefs.settings;
    if (!s || !Object.keys(s).length) return;

    // Ceux que `applyStoryEnvironment` ne connaît pas, posés d'abord pour que
    // l'application du relief les voie.
    if (Number.isFinite(s.terrainExaggeration)) STATE.settings.terrainExaggeration = s.terrainExaggeration;
    if (s.terrainSource) STATE.settings.terrainSource = s.terrainSource;
    if (s.modelSet) { STATE.settings.modelSet = s.modelSet; MODEL_LIBRARY.set = s.modelSet; }

    // Le reste passe par le chemin du récit, qui **applique** au lieu de se
    // contenter d'affecter : un `Object.assign` sur `STATE.settings` changerait
    // la valeur sans toucher la carte — le fond mémorisé serait lu, écrit dans
    // l'état, et la carte garderait le style déjà chargé. `setStyle` détruit
    // les couches montées ; `applyStoryEnvironment` les remonte, via
    // `onStyleReady`.
    applyStoryEnvironment(s, { allowBasemapSwitch: true });
}

/**
 * Enregistre les réglages de scène, une fois le calme revenu.
 *
 * Le débounce n'est pas un confort : l'arc solaire émet un réglage par pixel
 * parcouru, et le curseur d'exagération autant. Écrire à chaque émission
 * enverrait des dizaines d'actions à Grist pour un seul geste.
 */
let _persistPrefsTimer = null;
function persistScenePrefsDifferee(delai = 600) {
    clearTimeout(_persistPrefsTimer);
    _persistPrefsTimer = setTimeout(() => { persistScenePrefs(); }, delai);
}

async function persistScenePrefs() {
    if (!CONFIG.grist.ready || CONFIG.viewMode) return;
    if (!assertCanWrite('enregistrer les réglages de scène')) return;
    try {
        await saveScenePrefs(grist.docApi, {
            viewerControls: STATE.viewerControls,
            settings: STATE.settings,
        }, { viewMode: false });
    } catch (e) {
        console.warn('[Atlas] saveScenePrefs', e.message);
    }
}

function renderEnvControlsSection() {
    const list = STATE.viewerControls || createDefaultViewerControls();
    const esc = (s) => String(s).replace(/'/g, "\\'");
    return list.map((vc) => {
        const on = !!vc.exposed;
        let sub = '';
        if (vc.id === 'sun' && on) {
            const sh = vc.config?.shadows !== false;
            sub = `<label class="cat-row" style="margin-top:6px;cursor:pointer">
                <input type="checkbox" ${sh ? 'checked' : ''} onchange="A.setViewerShadows(this.checked)">
                <span class="cat-value">Ombres portées</span></label>`;
        }
        if (vc.id === 'basemap' && on) {
            const allowed = new Set(vc.config?.allowed || []);
            sub = `<div class="option-cards grid2" style="margin-top:8px">${Object.entries(BASEMAPS).map(([k, b]) => `
                <div class="option-card ${allowed.has(k) ? 'active' : ''}" onclick="A.toggleViewerBasemapAllowed('${esc(k)}')">
                    <div class="oc-icon">${b.icon}</div><div class="oc-label">${b.label}</div>
                </div>`).join('')}</div>
                <div class="hint" style="margin-top:6px">2–3 fonds max pour le dock lecture.</div>`;
        }
        return `<div class="section">
            <div class="toggle-row">
                <span class="tlabel">${vc.label}</span>
                <div class="toggle ${on ? 'on' : ''}" onclick="A.setViewerExposed('${vc.id}', ${!on})" role="switch" tabindex="0" aria-checked="${on}" aria-label="Exposer ${vc.label || vc.id} en lecture" title="Visible en lecture"></div>
            </div>
            <div style="font-size:10.5px;color:var(--muted);margin-top:-4px">Visible en lecture · pastille carte</div>
            ${sub}
        </div>`;
    }).join('');
}

function renderDataControlRow(layer, field, type, c) {
    const esc = (s) => String(s).replace(/'/g, "\\'");
    const icon = controlTypeIcon(type);
    const sim = c.mode === 'simulation' ? ' <span class="hint" style="display:inline;padding:2px 6px;margin:0">simulation</span>' : '';
    const labelVal = (c.label || field).replace(/"/g, '&quot;');
    const active = !!c.active;
    ensureControlVariant(c, type);
    const variants = controlVariantOptions(type);
    const variantHint = controlVariantHint(type, c.variant);
    return `<div class="section">
        <div class="toggle-row">
            <span class="tlabel">${icon} <input class="input" style="display:inline;width:auto;min-width:120px;padding:2px 6px;font-size:12px;font-weight:600"
                value="${labelVal}" onchange="A.setControlLabel('${layer.id}','${esc(field)}',this.value)" placeholder="${field}">
                <span style="font-weight:400;color:var(--muted);font-size:10.5px"> · ${controlTypeLabel(type)}</span>${sim}</span>
            <div class="toggle ${active ? 'on' : ''}" onclick="A.toggleControl('${layer.id}','${esc(field)}','${type}')" role="switch" tabindex="0" aria-checked="${active}" aria-label="Publier le contrôle ${esc(field)}" title="Afficher en lecture"></div>
        </div>
        <div class="control-variant-row">
            <label class="control-variant-label" for="ctl-var-${esc(layer.id)}-${esc(field)}">Type de contrôle</label>
            <select id="ctl-var-${esc(layer.id)}-${esc(field)}" class="input control-variant-select" onchange="A.setControlVariant('${layer.id}','${esc(field)}',this.value)">
                ${variants.map((v) => `<option value="${v.value}" ${c.variant === v.value ? 'selected' : ''}>${v.label}</option>`).join('')}
            </select>
        </div>
        <p class="control-variant-hint">${variantHint.replace(/</g, '&lt;')}</p>
        ${active ? renderControlBody(layer, c) : ''}
    </div>`;
}

function renderControlBody(layer, c) {
    const esc = (s) => String(s).replace(/'/g, "\\'");
    ensureControlVariant(c, c.type);
    if (c.type === 'select') {
        const vals = controlUniqueValues(layer, c.field, 30);
        // Un filtre sans choix ressemble à un filtre déjà appliqué : on croit
        // que tout est décoché, alors qu'on n'a rien à cocher. Le dire évite de
        // chercher pourquoi la carte ne réagit pas.
        if (!vals.length) {
            return `<div class="range-info" style="margin-top:6px;opacity:.75">`
                 + `Aucune valeur connue pour « ${escapeHtml(c.field)} »`
                 + (layer._distant ? ` — la couche est distante et le manifeste n’en déclare pas.` : `.`)
                 + `</div>`;
        }
        const inputType = c.variant === 'select_single' ? 'radio' : 'checkbox';
        const nameAttr = `ctl-${layer.id}-${c.field}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        return `<div class="cats" style="margin-top:6px">${vals.map((v) => `<label class="cat-row" style="cursor:pointer"><input type="${inputType}" name="${nameAttr}" ${isSelectValueChecked(c, v.value) ? 'checked' : ''} onchange="A.toggleControlValue('${layer.id}','${esc(c.field)}','${esc(v.value)}')"><span class="cat-value" title="${v.value}">${v.value}</span><span class="cat-count">${v.count == null ? '' : v.count}</span></label>`).join('')}</div>`;
    }
    const step = c.type === 'time' ? Math.max(86400000, Math.round((c.dataMax - c.dataMin) / 200)) : ((c.dataMax - c.dataMin) / 200 || 1);
    if (c.type === 'time') {
        if (c.variant === 'time_between') {
            return `<div class="range-info" style="margin-top:6px"><strong id="ctl-${c.field}-lo">${fmtControlValue(c, c.min)}</strong> → <strong id="ctl-${c.field}-hi">${fmtControlValue(c, c.max)}</strong></div>
                <input type="range" class="rng" min="${c.dataMin}" max="${c.dataMax}" step="${step}" value="${c.min}" oninput="A.setControlBound('${layer.id}','${esc(c.field)}','min', this.value)">
                <input type="range" class="rng acc" min="${c.dataMin}" max="${c.dataMax}" step="${step}" value="${c.max}" oninput="A.setControlBound('${layer.id}','${esc(c.field)}','max', this.value)">
                <button class="btn btn-soft btn-full" style="margin-top:6px" onclick="A.playTime('${layer.id}','${esc(c.field)}')">▶ Animer dans le temps</button>`;
        }
        return `<div class="range-info" style="margin-top:6px">≤ <strong id="ctl-${c.field}-v">${fmtControlValue(c, c.max)}</strong></div>
            <input type="range" class="rng acc" min="${c.dataMin}" max="${c.dataMax}" step="${step}" value="${c.max}" oninput="A.setControlMax('${layer.id}','${esc(c.field)}', this.value)">
            <button class="btn btn-soft btn-full" style="margin-top:6px" onclick="A.playTime('${layer.id}','${esc(c.field)}')">▶ Animer dans le temps</button>`;
    }
    if (c.variant === 'range_max') {
        return `<div class="range-info" style="margin-top:6px">≤ <strong id="ctl-${c.field}-v">${fmtControlValue(c, c.max)}</strong></div>
            <input type="range" class="rng acc" min="${c.dataMin}" max="${c.dataMax}" step="${step}" value="${c.max}" oninput="A.setControlMax('${layer.id}','${esc(c.field)}', this.value)">`;
    }
    if (c.variant === 'range_min') {
        return `<div class="range-info" style="margin-top:6px">≥ <strong id="ctl-${c.field}-v">${fmtControlValue(c, c.min)}</strong></div>
            <input type="range" class="rng" min="${c.dataMin}" max="${c.dataMax}" step="${step}" value="${c.min}" oninput="A.setControlMin('${layer.id}','${esc(c.field)}', this.value)">`;
    }
    return `<div class="range-info" style="margin-top:6px"><strong id="ctl-${c.field}-lo">${fmtControlValue(c, c.min)}</strong> → <strong id="ctl-${c.field}-hi">${fmtControlValue(c, c.max)}</strong></div>
        <input type="range" class="rng" min="${c.dataMin}" max="${c.dataMax}" step="${step}" value="${c.min}" oninput="A.setControlBound('${layer.id}','${esc(c.field)}','min', this.value)">
        <input type="range" class="rng acc" min="${c.dataMin}" max="${c.dataMax}" step="${step}" value="${c.max}" oninput="A.setControlBound('${layer.id}','${esc(c.field)}','max', this.value)">`;
}

function renderControlVariantMatrix() {
    return `<details class="control-variant-matrix">
        <summary>Guide des types de contrôle</summary>
        <div class="control-variant-matrix-body">
            <div class="cvm-group"><span class="cvm-k">Date</span>
                <span><strong>Date ≤</strong> — cumul jusqu’à une date</span>
                <span><strong>Date de/à</strong> — fenêtre stricte</span>
            </div>
            <div class="cvm-group"><span class="cvm-k">Nombre</span>
                <span><strong>Plage</strong> — intervalle min/max</span>
                <span><strong>Max / Min</strong> — seuil unique</span>
            </div>
            <div class="cvm-group"><span class="cvm-k">Catégorie</span>
                <span><strong>Checklist</strong> — plusieurs valeurs</span>
                <span><strong>Choix unique</strong> — une seule valeur</span>
            </div>
        </div>
    </details>`;
}

function renderControles() {
    if (CONFIG.viewMode) {
        showToast('Utilisez les contrôles sur la carte', 'info');
        closeModulePanel();
        return;
    }
    $('module-title').textContent = 'Contrôles';
    const body = $('module-body');
    const layer = STATE.layers.find((l) => l.id === STATE.selectedLayer) || STATE.layers[0];

    let html = `<div class="hint">Outils de mise en scène — activez les contrôles pour les publier en pastille sur la carte (visible en lecture). Puis capturez une étape de récit.</div>`;

    html += `<div class="section"><div class="section-title">Environnement</div>${renderEnvControlsSection()}</div>`;

    if (!layer) {
        body.innerHTML = html + `<div class="empty" style="margin-top:12px"><div class="ic">${icTrait(IC.controles, 40)}</div><div class="t">Aucune couche</div><div class="h">Importez ou liez des données</div></div>`;
        return;
    }

    layer.controls = layer.controls || [];
    const fields = layerFieldNames(layer).map((f) => ({ field: f, type: controlFieldType(layer, f) })).filter((x) => x.type);

    html += `<div class="section"><div class="section-title">Données</div>`;
    html += renderControlVariantMatrix();
    html += STATE.layers.length > 1
        ? `<select class="input" style="margin-bottom:8px" onchange="A.controlLayer(this.value)">${STATE.layers.map((l) => `<option value="${l.id}" ${l.id === layer.id ? 'selected' : ''}>${l.name}</option>`).join('')}</select>`
        : `<div class="hint" style="margin-bottom:8px">Couche <strong>${layer.name}</strong></div>`;

    if (!fields.length) {
        body.innerHTML = html + `<div class="hint">Aucun champ filtrable (date, nombre ou catégorie).</div></div>`;
        return;
    }

    const activeFields = [];
    const availFields = [];
    for (const { field, type } of fields) {
        const c = layer.controls.find((x) => x.field === field) || { field, type, active: false };
        if (c.active) activeFields.push({ field, type, c });
        else availFields.push({ field, type, c });
    }

    if (activeFields.length) {
        html += `<div class="section-title" style="margin-top:8px">Actifs</div>`;
        html += activeFields.map(({ field, type, c }) => renderDataControlRow(layer, field, type, c)).join('');
    }
    if (availFields.length) {
        html += `<div class="section-title" style="margin-top:${activeFields.length ? '12px' : '8px'}">Disponibles</div>`;
        html += availFields.map(({ field, type, c }) => renderDataControlRow(layer, field, type, c)).join('');
    }
    html += '</div>';
    body.innerHTML = html;
}

function renderRecit() {
    $('module-title').textContent = 'Récit';
    const body = $('module-body');
    const steps = STATE.story || [];
    if (CONFIG.viewMode) {
        if (!steps.length) {
            body.innerHTML = `<div class="empty"><div class="ic">${icTrait(IC.recit, 40)}</div><div class="t">Pas de récit</div><div class="h">L’éditeur n’a pas publié d’étapes</div></div>`;
            return;
        }
        body.innerHTML = `
            <div class="hint">Parcours publié — lecture seule.</div>
            <div class="section"><button class="btn btn-dark btn-full" onclick="A.storyPlay(0)">▶ Lancer le récit</button></div>
            <div class="layer-list">${steps.map((s, i) => `
                <div class="layer-item" onclick="A.storyPlay(${i})" style="cursor:pointer">
                    <span class="layer-vis on">▶</span>
                    <div class="layer-info">
                        <div class="layer-name">${(s.title || ('Étape ' + (i + 1))).replace(/</g, '&lt;')}</div>
                        <div class="layer-meta">${(s.text || '').slice(0, 80).replace(/</g, '&lt;')}${ (s.text || '').length > 80 ? '…' : ''}</div>
                    </div>
                </div>`).join('')}</div>`;
        return;
    }
    let html = `<div class="hint">Capture des <strong>étapes</strong> (caméra + couches + filtres + heure) et rejoue-les en présentation.</div>
        <div class="section" style="display:flex;gap:8px">
            <button class="btn btn-primary" style="flex:2" onclick="A.storyCapture()">${icTrait(IC.camera)} Capturer l'étape</button>
            ${steps.length ? `<button class="btn btn-dark" style="flex:1" onclick="A.storyPlay(0)">▶ Lecture</button>` : ''}
        </div>`;
    if (!steps.length) {
        body.innerHTML = html + `<div class="empty"><div class="ic">${icTrait(IC.recit, 40)}</div><div class="t">Aucune étape</div><div class="h">Cadre la vue puis « Capturer »</div></div>`;
        return;
    }
    html += `<div class="layer-list">${steps.map((s, i) => `
        <div class="layer-item">
            <span class="layer-vis on" onclick="A.storyPlay(${i})" title="Aller à l'étape">▶</span>
            <div class="layer-info" style="flex:1">
                <input class="input" style="font-weight:600;padding:4px 6px" value="${(s.title || '').replace(/"/g, '&quot;')}" onchange="A.storySet(${i},'title',this.value)" placeholder="Titre étape ${i + 1}">
                <textarea class="input" style="margin-top:4px;min-height:38px;font-size:12px" onchange="A.storySet(${i},'text',this.value)" placeholder="Texte…">${s.text || ''}</textarea>
            </div>
            <div style="display:flex;flex-direction:column;gap:2px">
                <button class="layer-act" onclick="A.storyMove(${i},-1)" title="Monter">▲</button>
                <button class="layer-act" onclick="A.storyRecapture(${i})" title="Re-capturer la vue">${icTrait(IC.camera)}</button>
                <button class="layer-act" onclick="A.storyMove(${i},1)" title="Descendre">▼</button>
            </div>
            <button class="layer-del" onclick="A.storyDelete(${i})" title="Supprimer">${icTrait(IC.corbeille)}</button>
        </div>`).join('')}</div>`;
    body.innerHTML = html;
}

/**
 * Le moment d'une étape, tel qu'il s'affiche sous son titre.
 *
 * **L'étape peut le nommer elle-même** (`ambiance`), et c'est alors ce nom qui
 * s'affiche. Aucun découpage horaire ne peut être juste partout : 7 h est l'aube
 * en décembre et le plein jour en juin, et la latitude déplace encore les
 * bornes. Surtout, l'auteur d'un récit veut souvent dire autre chose que l'heure
 * — « avant l'ouverture », « à la sortie des classes ».
 *
 * Le découpage ci-dessous n'est qu'un **repli**, pour les étapes qui ne disent
 * rien. Il reste approximatif, et il est écrit pour ne jamais être grossièrement
 * faux : le tour de minuit appartient à la nuit, pas à l'aube.
 */
function storyAmbianceLabel(state) {
    const min = Number(state?.timeOfDay);
    const bits = [];
    const dit = typeof state?.ambiance === 'string' ? state.ambiance.trim() : '';
    if (Number.isFinite(min)) {
        const h = Math.floor(min / 60), m = min % 60;
        const clock = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        let phase;
        if (dit) phase = dit;
        else if (min < 300) phase = 'Nuit';          // 00:00–04:59
        else if (min < 480) phase = 'Aube';          // 05:00–07:59
        else if (min < 660) phase = 'Matin';
        else if (min < 960) phase = 'Midi';
        else if (min < 1140) phase = 'Après-midi';
        else if (min < 1260) phase = 'Crépuscule';
        else phase = 'Nuit';                          // 21:00–23:59
        bits.push(phase, clock);
    } else if (dit) {
        // Une étape peut nommer son moment sans fixer d'heure — « avant
        // l'ouverture » n'a pas d'horloge. Ce qu'elle dit doit s'afficher quand
        // même, sinon déclarer une ambiance n'aurait d'effet que par accident.
        bits.push(dit);
    }
    if (state?.basemap && BASEMAPS[state.basemap]) bits.push(BASEMAPS[state.basemap].label);
    if (state?.shadows === false) bits.push('sans ombres');
    else if (state?.shadows === true) bits.push('ombres');
    if (state?.labels === true) bits.push('toponymes');
    return bits.join(' · ');
}

function renderStoryPresentation() {
    const ov = document.getElementById('story-present');
    if (!ov) return;
    const s = STATE.story[_storyIdx];
    const n = STATE.story.length;
    if (!s) return;
    const ambiance = storyAmbianceLabel(s.state);
    ov.innerHTML = `<div style="display:flex;align-items:center;gap:10px">
        <button class="btn btn-soft" onclick="A.storyStep(-1)" ${_storyIdx === 0 ? 'disabled' : ''}>◀</button>
        <div style="flex:1;text-align:center"><div style="font-weight:600;font-size:15px">${s.title || ('Étape ' + (_storyIdx + 1))}</div><div style="font-size:10px;color:#6b6256;letter-spacing:.05em">${_storyIdx + 1} / ${n}${ambiance ? ' · ' + ambiance : ''}</div></div>
        <button class="btn btn-soft" onclick="A.storyStep(1)" ${_storyIdx === n - 1 ? 'disabled' : ''}>▶</button>
        <button class="btn btn-soft" onclick="A.storyExit()" title="Quitter">✕</button>
    </div>${s.text ? `<div style="margin-top:8px;font-size:13px;line-height:1.45">${s.text}</div>` : ''}`;
}

function enterStoryPresentation(i) {
    if (!STATE.story.length) { showToast('Aucune étape à jouer', 'warning'); return; }
    capturePreStorySnapshot();
    _storyPresenting = true;
    document.body.classList.add('story-presenting');
    refreshControlsDock();
    _storyIdx = Math.max(0, Math.min(i || 0, STATE.story.length - 1));
    let ov = document.getElementById('story-present');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'story-present';
        ov.style.cssText = 'position:absolute;left:50%;bottom:24px;transform:translateX(-50%);z-index:1000;background:rgba(244,239,227,0.96);color:#1F1B14;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.25);max-width:520px;width:88%;padding:12px 16px;font-family:\'Hanken Grotesk\',sans-serif';
        (document.getElementById('map-frame') || document.body).appendChild(ov);
    }
    renderStoryPresentation();
    applyStoryState(cloneStoryState(STATE.story[_storyIdx].state));
}

// ---- Modèles 3D ----
// Module Modèles = gestion du CATALOGUE pour l'app (jeu, source, galerie).
function renderModelsPanel() {
    $('module-title').textContent = 'Catalogue 3D';
    const nModels = allModels().length;
    const layer = STATE.layers.find((l) => l.id === STATE.selectedLayer);
    const isPoint = layer && (layer.geometryType === 'Point' || layer.geometryType === 'MultiPoint');
    const banner = isPoint
        ? `<div class="hint" style="border-left-color:var(--accent)">Couche sélectionnée : <strong>${layer.name}</strong>.<button class="btn btn-primary btn-full" style="margin-top:8px" onclick="A.openLayerModel('${layer.id}')">→ Choisir le modèle de cette couche</button></div>`
        : `<div class="hint">Réglages du catalogue, valables pour toute l'app. Pour <strong>affecter un modèle à une couche</strong> : sélectionne une couche de points (module Couches) → onglet <strong>Modèle 3D</strong> de l'inspecteur.</div>`;
    $('module-body').innerHTML = banner + `
        <div class="section">
            <div class="section-title">Jeu de modèles</div>
            <div class="seg">
                <button class="${MODEL_LIBRARY.set === 'colored' ? 'active' : ''}" onclick="A.setModelSet('colored')">🎨 Coloré</button>
                <button class="${MODEL_LIBRARY.set === 'mono' ? 'active' : ''}" onclick="A.setModelSet('mono')">⬜ Maquette</button>
            </div>
        </div>
        <div class="section">
            <div class="section-title">Source des modèles (GLB)</div>
            <div class="range-info" id="model-src-info" style="word-break:break-all">${MODEL_LIBRARY.baseUrl}</div>
            <input class="input" id="model-src-input" style="margin-top:6px;font-family:var(--mono);font-size:11px" value="${MODEL_LIBRARY.baseRoot}" placeholder="https://…/models/">
            <div style="display:flex;gap:6px;margin-top:6px">
                <button class="btn btn-soft" style="flex:1" onclick="A.testModelBase()">Tester</button>
                <button class="btn btn-primary" style="flex:1" onclick="A.setModelBase(document.getElementById('model-src-input').value)">Appliquer</button>
            </div>
            <div class="hint" style="margin-top:6px">Doit contenir <code>colored/</code>, <code>mono/</code> et <code>catalog.json</code>. En local : sers la racine du repo et ouvre <code>/projects/Atlas/index.html</code>.</div>
        </div>
        <div class="section">
            <div class="section-title">Catalogue · ${nModels} modèles</div>
            ${Object.entries(MODEL_LIBRARY.categories).map(([k, c]) => `
                <div style="margin:10px 0 4px;font-size:10.5px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em">${c.icon} ${c.name} <span style="color:var(--muted-light)">· ${c.models.length}</span></div>
                <div class="model-grid">${c.models.map((m) => `<div class="model-card" title="${m.name}" style="cursor:default"><div class="mi">${m.icon}</div><div class="mn">${m.name}</div></div>`).join('')}</div>
            `).join('')}
        </div>`;
}

// ---- Soleil / Ambiance ----
function renderSoleil() {
    $('module-title').textContent = 'Soleil';
    const min = STATE.settings.timeOfDay;
    const d = STATE.settings.date;
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const { azimuth, altitude } = sunPosition();
    const cardinal = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(azimuth / 45) % 8];
    $('module-body').innerHTML = `
        <div class="section">
            <div class="section-title">Moment de la journée</div>
            <div class="option-cards grid2">
                <div class="option-card" onclick="A.timePreset('dawn')"><div class="oc-icon" style="color:#D98C3F">${icTrait('<path d="M3 18h18M6 18a6 6 0 0 1 12 0"/><path d="M12 5v2M5.6 8.6l1.4 1.4m11.4-1.4-1.4 1.4"/><path d="M2 21h20"/>', 26)}</div><div class="oc-label">Aube</div></div>
                <div class="option-card" onclick="A.timePreset('day')"><div class="oc-icon" style="color:#E0A526">${icTrait(IC.soleil, 26)}</div><div class="oc-label">Midi</div></div>
                <div class="option-card" onclick="A.timePreset('dusk')"><div class="oc-icon" style="color:#B4593A">${icTrait('<path d="M3 18h18M8 18a4 4 0 0 1 8 0"/><path d="M12 21v-1"/><path d="M2 14h4m12 0h4"/>', 26)}</div><div class="oc-label">Soir</div></div>
                <div class="option-card" onclick="A.timePreset('night')"><div class="oc-icon" style="color:#5B6B8C">${icTrait('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>', 26)}</div><div class="oc-label">Nuit</div></div>
            </div>
        </div>
        <div class="section">
            <div class="slider-head"><span class="lbl">Heure</span><span class="val">${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}</span></div>
            <input type="range" class="rng acc" min="0" max="1439" step="5" value="${min}" oninput="A.setTime(this.value)">
        </div>
        <div class="section">
            <div class="section-title">Date</div>
            <input class="input" type="date" value="${dateStr}" onchange="A.setSunDate(this.value)">
        </div>
        <div class="section">
            <div class="range-info">Soleil : <strong>${azimuth.toFixed(0)}° ${cardinal}</strong> · Hauteur <strong>${altitude.toFixed(1)}°</strong></div>
        </div>
        <div class="section">
            <div class="toggle-row"><span class="tlabel">Ombres portées</span><div class="toggle ${STATE.settings.shadows ? 'on' : ''}" onclick="A.toggleSetting('shadows')" role="switch" tabindex="0" aria-checked="${!!STATE.settings.shadows}" aria-label="Ombres portées"></div></div>
            <div class="hint" style="margin-top:8px">Vraies ombres des modèles 3D (direction = position solaire SunCalc), au zoom rue, ${STATE.settings.terrain3D ? '<strong>désactivées car le relief 3D est actif</strong>' : 'jusqu’à 1500 objets visibles'}. Le bâti n’a pas d’ombre (limite MapLibre).</div>
        </div>`;
}

// ---- Vue & rendu ----
function renderVues() {
    $('module-title').textContent = 'Vue & rendu';
    const s = STATE.settings;
    $('module-body').innerHTML = `
        <div class="section">
            <div class="section-title">Points de vue</div>
            <div class="option-cards">
                <div class="option-card" onclick="A.viewPreset('top')"><div class="oc-icon">⬇️</div><div class="oc-label">Dessus</div></div>
                <div class="option-card" onclick="A.viewPreset('3d')"><div class="oc-icon">🎯</div><div class="oc-label">3D</div></div>
                <div class="option-card" onclick="A.viewPreset('street')"><div class="oc-icon">🚶</div><div class="oc-label">Piéton</div></div>
            </div>
        </div>
        <div class="section">
            <div class="slider-head"><span class="lbl">Inclinaison</span><span class="val" id="v-pitch">${Math.round(map?.getPitch() || 55)}°</span></div>
            <input type="range" class="rng" min="0" max="80" step="1" value="${Math.round(map?.getPitch() || 55)}" oninput="A.setPitch(this.value)">
            <div class="slider-head" style="margin-top:12px"><span class="lbl">Rotation</span><span class="val" id="v-bearing">${Math.round(map?.getBearing() || 0)}°</span></div>
            <input type="range" class="rng" min="-180" max="180" step="1" value="${Math.round(map?.getBearing() || 0)}" oninput="A.setBearing(this.value)">
        </div>
        <div class="section">
            <div class="section-title">Projection</div>
            <div class="seg">
                <button class="${s.projection === 'globe' ? 'active' : ''}" onclick="A.setProjection('globe')">🌍 Globe</button>
                <button class="${s.projection === 'mercator' ? 'active' : ''}" onclick="A.setProjection('mercator')">🗺️ Plan</button>
            </div>
            <div class="hint" style="margin-top:8px">Le globe (façon Google Earth) bascule automatiquement en plan une fois zoomé sur la zone.</div>
        </div>
        <div class="section">
            <div class="section-title">Fond de carte</div>
            <div class="option-cards grid2">
                ${Object.entries(BASEMAPS).map(([k, b]) => `<div class="option-card ${s.basemap === k ? 'active' : ''}" onclick="A.setBasemap('${k}')"><div class="oc-icon">${b.icon}</div><div class="oc-label">${b.label}</div></div>`).join('')}
            </div>
        </div>
        <div class="section">
            <div class="section-title">Rendu 3D</div>
            <div class="toggle-row"><span class="tlabel">🏢 Bâti du fond de carte</span><div class="toggle ${s.buildings3D ? 'on' : ''}" onclick="A.toggleSetting('buildings3D')" role="switch" tabindex="0" aria-checked="${!!s.buildings3D}" aria-label="Bâti du fond de carte"></div></div>
            <div class="toggle-row"><span class="tlabel">⛰️ Terrain 3D</span><div class="toggle ${s.terrain3D ? 'on' : ''}" onclick="A.toggleSetting('terrain3D')" role="switch" tabindex="0" aria-checked="${!!s.terrain3D}" aria-label="Terrain 3D"></div></div>
            <label class="input-label" style="margin-top:6px">Source du relief</label>
            <select class="input" onchange="A.setTerrainSource(this.value)">
                ${Object.entries(TERRAIN_SOURCES).map(([k, t]) => `<option value="${k}" ${s.terrainSource === k ? 'selected' : ''}>${t.label}</option>`).join('')}
            </select>
            <div class="slider-head" style="margin-top:8px"><span class="lbl">Exagération relief</span><span class="val" id="v-exag">${s.terrainExaggeration}×</span></div>
            <input type="range" class="rng" min="1" max="3" step="0.1" value="${s.terrainExaggeration}" oninput="A.setExag(this.value)">
            <div class="toggle-row"><span class="tlabel">🏷️ Libellés du fond</span><div class="toggle ${s.labels ? 'on' : ''}" onclick="A.toggleSetting('labels')" role="switch" tabindex="0" aria-checked="${!!s.labels}" aria-label="Libellés du fond"></div></div>
            <div class="toggle-row"><span class="tlabel">🌫️ Ciel / atmosphère</span><div class="toggle ${s.sky ? 'on' : ''}" onclick="A.toggleSetting('sky')" role="switch" tabindex="0" aria-checked="${!!s.sky}" aria-label="Ciel et atmosphère"></div></div>
        </div>
        <button class="btn btn-soft btn-full" onclick="A.resetView()">🔄 Réinitialiser la vue</button>`;
}

// ============================================================
// LEGEND
// ============================================================
function escLegend(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function legendCategoryColor(sym, value, index, total) {
    const cat = sym.categories?.find((x) => String(x.value) === String(value));
    return cat?.color || paletteColor(sym.palette || 'Tableau10', index, total);
}

/** Focus légende (ciblage lecture) — session only. */
let _legendFocus = null; // { layerId, field?, value? }

function isLegendFocused(layerId, field, value) {
    if (!_legendFocus || _legendFocus.layerId !== layerId) return false;
    if (field == null) return !_legendFocus.field;
    return _legendFocus.field === field && String(_legendFocus.value) === String(value);
}

function buildLayerLegendHtml(layer) {
    const sym = initSymbolization(layer).color;
    const total = formatLayerCount(layer);
    const lid = escLegend(layer.id);
    const clickable = CONFIG.viewMode ? ' legend-clickable' : '';

    if (sym.mode === 'categorized' && sym.field) {
        syncColorCategoriesFromFeatures(layer);
        const vals = filteredUniqueValues(layer, sym.field, 30);
        const fieldEsc = escLegend(sym.field);
        if (!vals.length) {
            // `total` et non zéro : sur une couche dont Atlas ne détient pas les
            // entités, aucune classe n'est mesurable, mais le manifeste sait
            // combien il y en a. Écrire « 0 » ici annonçait une couche vide
            // sous une carte qui la peignait — le compte est le seul endroit
            // où le lecteur va chercher pourquoi il ne voit rien.
            return `<div class="legend-group"><div class="legend-row${clickable}" data-legend="layer" data-layer-id="${lid}"><span class="swatch" style="background:${layer.color}"></span><span class="nm">${escLegend(layer.name)}</span><span class="ct">${total}</span></div></div>`;
        }
        const catRows = vals.map((v, i) => {
            const col = legendCategoryColor(sym, v.value, i, vals.length);
            const focused = isLegendFocused(layer.id, sym.field, v.value) ? ' legend-focused' : '';
            // Un compte inconnu (classe déclarée, entités absentes) s'affiche
            // « — », jamais « null » ni « 0 ».
            const ct = v.count == null ? '—' : v.count;
            return `<div class="legend-row legend-sub${clickable}${focused}" data-legend="cat" data-layer-id="${lid}" data-field="${fieldEsc}" data-value="${escLegend(v.value)}"><span class="swatch" style="background:${col}"></span><span class="nm" title="${escLegend(v.value)}">${escLegend(v.value)}</span><span class="ct">${ct}</span></div>`;
        }).join('');
        const headFocus = isLegendFocused(layer.id, null, null) ? ' legend-focused' : '';
        return `<div class="legend-group"><div class="legend-row legend-head-row${clickable}${headFocus}" data-legend="layer" data-layer-id="${lid}"><span class="nm legend-layer-name">${escLegend(layer.name)}</span><span class="ct">${total}</span></div>${catRows}</div>`;
    }

    if (sym.mode === 'graduated' && sym.field) {
        // Les couleurs du style déclaratif priment sur la rampe nommée — c'est
        // déjà la règle pour peindre la carte (cf. applyLayerStyle). La légende
        // s'en écartait : elle annonçait un dégradé Viridis sous une carte
        // verte. Une légende qui ne décrit pas la carte est pire qu'aucune.
        const stopsDecl = (layer._declarative?.kind === 'graduated' ? layer._declarative.stops : null) || [];
        const ramp = stopsDecl.length
            ? stopsDecl.map((st) => st.color).filter(Boolean)
            : (COLOR_PALETTES[sym.colorRamp || sym.palette || 'Viridis'] || COLOR_PALETTES.Viridis);
        const grad = `linear-gradient(90deg, ${ramp.join(', ')})`;
        const focused = isLegendFocused(layer.id, null, null) ? ' legend-focused' : '';
        return `<div class="legend-group"><div class="legend-row${clickable}${focused}" data-legend="layer" data-layer-id="${lid}"><span class="swatch legend-grad" style="background:${grad}"></span><span class="nm">${escLegend(layer.name)}</span><span class="ct">${total}</span></div></div>`;
    }

    const swatch = sym.mode === 'single' ? (sym.value || layer.color) : layer.color;
    const focused = isLegendFocused(layer.id, null, null) ? ' legend-focused' : '';
    return `<div class="legend-group"><div class="legend-row${clickable}${focused}" data-legend="layer" data-layer-id="${lid}"><span class="swatch" style="background:${swatch}"></span><span class="nm">${escLegend(layer.name)}</span><span class="ct">${total}</span></div></div>`;
}

function updateLegend() {
    const body = $('legend-body');
    // La légende énumère dans le même sens que les panneaux : dessus d'abord.
    const vis = displayOrder(STATE.layers).filter((l) => l.visible !== false);
    if (vis.length === 0) { body.innerHTML = '<div class="legend-empty">Aucune couche visible</div>'; return; }
    const html = vis.map(buildLayerLegendHtml).join('');
    body.innerHTML = html || '<div class="legend-empty">Aucun objet visible</div>';
}

function fitToFeatures(features) {
    if (!map || !features?.length) return false;
    const bounds = new maplibregl.LngLatBounds();
    let any = false;
    features.forEach((f) => {
        const g = f.geometry; if (!g) return;
        const coords = g.type === 'Point' ? [g.coordinates] : g.coordinates.flat(g.type.includes('Multi') ? 2 : 1);
        coords.forEach((c) => { if (Array.isArray(c) && typeof c[0] === 'number') { bounds.extend(c); any = true; } });
    });
    if (!any) return false;
    map.fitBounds(bounds, { padding: 80, maxZoom: 18, duration: 800 });
    return true;
}

function featuresMatchingCategory(layer, field, value) {
    const propKey = resolveFeaturePropertyKey(layer, field);
    const want = String(value).toLowerCase();
    return (layer.geojson?.features || []).filter((f) => {
        const key = normalizePropertyValue(f.properties?.[propKey]);
        return key && String(key).toLowerCase() === want;
    });
}

/** Clic légende (lecture) : zoom couche ou catégorie. */
function onLegendClick(e) {
    if (!CONFIG.viewMode) return;
    const row = e.target.closest('[data-legend]');
    if (!row) return;
    const layerId = row.dataset.layerId;
    const layer = STATE.layers.find((l) => l.id === layerId);
    if (!layer) return;
    const action = row.dataset.legend;

    if (action === 'layer') {
        _legendFocus = { layerId };
        fitToLayer(layer);
        updateLegend();
        showToast(`Ciblage « ${layer.name} »`, 'info');
        return;
    }
    if (action === 'cat') {
        const field = row.dataset.field;
        const value = row.dataset.value;
        if (_legendFocus?.layerId === layerId && _legendFocus.field === field && String(_legendFocus.value) === String(value)) {
            _legendFocus = null;
            fitToLayer(layer);
            updateLegend();
            showToast('Ciblage retiré', 'info');
            return;
        }
        _legendFocus = { layerId, field, value };
        const feats = featuresMatchingCategory(layer, field, value);
        if (!fitToFeatures(feats)) fitToLayer(layer);
        updateLegend();
        showToast(`Ciblage « ${value} »`, 'info');
    }
}

function wireLegendClicks() {
    const body = $('legend-body');
    if (!body || body._legendWired) return;
    body._legendWired = true;
    body.addEventListener('click', onLegendClick);
}

// ============================================================
// INSPECTOR — symbologie ou objet sélectionné
// ============================================================
let inspectorUserClosed = false;

function resizeMapSoon() {
    requestAnimationFrame(() => {
        try { map?.resize(); } catch (e) {}
        setTimeout(() => { try { map?.resize(); } catch (e) {} }, 180);
    });
}

function openInspectorPanel() {
    const insp = $('inspector');
    if (!insp || inspectorUserClosed) return;
    insp.classList.add('open');
    resizeMapSoon();
}

function closeInspectorPanel() {
    const insp = $('inspector');
    if (!insp) return;
    insp.classList.remove('open');
    resizeMapSoon();
}

function closeInspectorByUser() {
    inspectorUserClosed = true;
    closeInspectorPanel();
}

try { localStorage.removeItem('atlas_inspector_collapsed'); } catch (e) {}

function renderInspector() {
    if (STATE.selection.mode && STATE.selection.features.length > 0) {
        inspectorUserClosed = false;
        renderObjectInspector();
        openInspectorPanel();
        return;
    }
    if (inspectorUserClosed) { closeInspectorPanel(); return; }
    // Lecture : pas d’inspecteur de symbolisation (paramétrage éditeur)
    if (CONFIG.viewMode) { closeInspectorPanel(); return; }
    if ((STATE.currentModule === 'symbo' || STATE.currentModule === 'couches') && STATE.selectedLayer) {
        const layer = STATE.layers.find((l) => l.id === STATE.selectedLayer);
        if (layer) { renderSymbologyInspector(layer); openInspectorPanel(); return; }
    }
    closeInspectorPanel();
}

let inspSymTab = 'Couleur';
function renderSymbologyInspector(layer) {
    const sym = initSymbolization(layer);
    const isPoint = layer.geometryType === 'Point' || layer.geometryType === 'MultiPoint';
    const tabs = ['Couleur', 'Taille'];
    if (isPoint) tabs.push('Modèle 3D');
    tabs.push('Étiquette');
    if (!tabs.includes(inspSymTab)) inspSymTab = 'Couleur';

    // Chip du modèle 3D lié à la couche (toujours visible dans l'inspecteur)
    const is3D = isPoint && (layer.style?.mode === 'library' || layer.style?.mode === 'custom');
    let modelChip = '';
    if (is3D) {
        const mm = sym.model || {};
        let label, icon = '📦';
        if (mm.mode === 'categorized' && mm.field) { label = `par champ « ${mm.field} »`; }
        else if (layer.style?.mode === 'custom' && layer.style.custom?.filename) { label = layer.style.custom.filename; }
        else { const m = findModel(layer.style?.library?.modelId); icon = m?.icon || '📦'; label = m ? m.name : 'aucun modèle'; }
        modelChip = `<div style="margin-top:8px;display:flex;align-items:center;gap:8px">
            <span style="display:inline-flex;align-items:center;gap:6px;background:var(--accent-soft);border:1px solid rgba(196,69,54,0.2);border-radius:8px;padding:4px 10px;font-size:12px;color:var(--ink)"><span style="font-size:15px">${icon}</span>${label}</span>
            <button onclick="A.openLayerModel('${layer.id}')" style="background:transparent;border:none;color:var(--accent);font-size:12px;font-weight:600;cursor:pointer">changer</button>
        </div>`;
    }
    $('insp-head').innerHTML = `
        <div class="insp-eyebrow"><span class="layer-swatch" style="background:${layer.color}"></span>Symboliser${is3D ? ' · <span style="color:var(--accent2)">3D</span>' : ''}</div>
        <div class="insp-title">${layer.name}</div>
        <div class="insp-sub">${formatLayerCount(layer)} objets · ${layer.geometryType}</div>
        ${modelChip}
        ${isPoint ? `<button class="btn btn-soft btn-full" style="margin-top:8px" onclick="A.editLayerObjects('${layer.id}')">✏️ Éditer les objets un par un</button>` : ''}`;
    $('insp-tabs').innerHTML = tabs.map((t) => `<button class="insp-tab ${inspSymTab === t ? 'active' : ''}" onclick="A.setSymTab('${t}')">${t}</button>`).join('');

    const body = $('insp-body');
    if (inspSymTab === 'Couleur') body.innerHTML = symColorPanel(layer, sym);
    else if (inspSymTab === 'Taille') body.innerHTML = symSizePanel(layer, sym);
    else if (inspSymTab === 'Modèle 3D') body.innerHTML = symModelPanel(layer, sym);
    else body.innerHTML = symLabelPanel(layer, sym);

    $('insp-foot').innerHTML = `
        <button class="btn btn-soft" style="flex:1" onclick="A.resetSymbology('${layer.id}')">Réinitialiser</button>
        <button class="btn btn-primary" style="flex:2" onclick="A.saveLayer('${layer.id}')">Enregistrer</button>`;
}

function fieldSelect(layer, param, current, type) {
    const fields = getLayerFields(layer).filter((f) => !type || f.type === type);
    return `<select class="input" onchange="A.setSymField('${layer.id}','${param}', this.value)">
        <option value="">— Champ —</option>
        ${fields.map((f) => `<option value="${f.id}" ${current === f.id ? 'selected' : ''}>${f.id} (${f.type === 'numeric' ? '123' : 'abc'})</option>`).join('')}
    </select>`;
}
function modeSeg(layer, param, mode, modes) {
    const lbl = { single: 'Fixe', categorized: 'Catégorisé', graduated: 'Gradué' };
    return `<div class="seg">${modes.map((m) => `<button class="${mode === m ? 'active' : ''}" onclick="A.setSymMode('${layer.id}','${param}','${m}')">${lbl[m]}</button>`).join('')}</div>`;
}
function methodChips(layer, param, method) {
    return `<div class="chips" style="margin-top:8px">${[['linear', 'Linéaire'], ['log', 'Log'], ['sqrt', '√']].map(([id, l]) => `<button class="chip ${method === id ? 'active' : ''}" onclick="A.setSymMethod('${layer.id}','${param}','${id}')">${l}</button>`).join('')}</div>`;
}
function paletteList(layer, param, current, type) {
    const items = Object.entries(PALETTE_INFO).filter(([, i]) => type === 'all' || i.type === type);
    return `<div class="palette-list" style="margin-top:8px">${items.map(([id, info]) => `
        <div class="palette-item ${current === id ? 'active' : ''}" onclick="A.setSymPalette('${layer.id}','${param}','${id}')">
            <div class="palette-strip">${(COLOR_PALETTES[id] || []).map((c) => `<span style="background:${c}"></span>`).join('')}</div>
            <span class="pname">${info.name}</span>
        </div>`).join('')}</div>`;
}

function symColorPanel(layer, sym) {
    const c = sym.color;
    let inner = '';
    if (c.mode === 'single') {
        inner = `<div class="section"><div class="section-title">Couleur</div>
            <div style="display:flex;gap:8px;align-items:center">
                <input type="color" value="${c.value || layer.color}" style="width:40px;height:34px;border:none;cursor:pointer" onchange="A.setSymColorValue('${layer.id}', this.value)">
                <input class="input" style="flex:1;font-family:var(--mono)" value="${c.value || layer.color}" onchange="A.setSymColorValue('${layer.id}', this.value)">
            </div></div>`;
    } else if (c.mode === 'categorized') {
        inner = `<div class="section"><div class="section-title">Champ source</div>${fieldSelect(layer, 'color', c.field, null)}</div>
            ${c.field ? `<div class="section"><div class="section-title">Palette</div>${paletteList(layer, 'color', c.palette, 'qualitative')}</div>
            <div class="section"><div class="section-title">Catégories</div>${categoriesPreview(layer, c)}</div>` : ''}`;
    } else {
        inner = `<div class="section"><div class="section-title">Champ source</div>${fieldSelect(layer, 'color', c.field, 'numeric')}
            ${c.field ? rangeInfo(layer, c.field) : ''}</div>
            ${c.field ? `<div class="section"><div class="section-title">Palette</div>${paletteList(layer, 'color', c.colorRamp || c.palette, 'sequential')}${methodChips(layer, 'color', c.method)}</div>` : ''}`;
    }
    return `<div class="section"><div class="section-title">Mode</div>${modeSeg(layer, 'color', c.mode, ['single', 'categorized', 'graduated'])}</div>${inner}`;
}
function categoriesPreview(layer, c) {
    const vals = getUniqueValues(layer, c.field, 100);
    if (!vals.length) return '<div class="range-info">Aucune valeur</div>';
    if (!c.categories.length) syncColorCategoriesFromFeatures(layer);
    return `<div class="cats">${vals.slice(0, 30).map((v, i) => {
        const cat = c.categories.find((x) => String(x.value) === String(v.value));
        const col = cat?.color || paletteColor(c.palette, i, vals.length);
        return `<div class="cat-row"><span class="cat-swatch" style="background:${col}" onclick="A.pickCatColor('${layer.id}','${String(v.value).replace(/'/g, "\\'")}', this)"></span><span class="cat-value" title="${v.value}">${v.value}</span><span class="cat-count">${v.count}</span></div>`;
    }).join('')}${vals.length > 30 ? `<div class="range-info" style="margin-top:6px">+ ${vals.length - 30} autres</div>` : ''}</div>`;
}
/** Bornes qu'un contrôle du manifeste déclare pour un champ, s'il y en a un. */
function bornesDeclarees(layer, field) {
    const c = (layer?.controls || []).find((x) => x.field === field);
    const lo = Number.isFinite(c?.dataMin) ? c.dataMin : c?.min;
    const hi = Number.isFinite(c?.dataMax) ? c.dataMax : c?.max;
    return (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) ? { min: lo, max: hi } : null;
}

function rangeInfo(layer, field) {
    const r = getNumericRange(layer, field);
    if (!r.count) {
        // « Pas de valeurs numériques » est un constat, et il est faux ici : on
        // n'a rien pu regarder. Le manifeste, lui, declare peut-etre les bornes
        // observees a la production — c'est ce qui permet de graduer une couche
        // qu'on ne detient pas.
        const b = bornesDeclarees(layer, field);
        if (b) {
            return `<div class="range-info" style="margin-top:6px">Valeurs déclarées : `
                 + `<strong>${b.min}</strong> → <strong>${b.max}</strong></div>`;
        }
        if (layer?._distant) {
            return '<div class="range-info">Valeurs inconnues — la couche est distante '
                 + 'et le manifeste ne déclare pas de bornes pour ce champ.</div>';
        }
        return '<div class="range-info">⚠️ Pas de valeurs numériques</div>';
    }
    return `<div class="range-info" style="margin-top:6px">Valeurs : <strong>${r.min.toFixed(1)}</strong> → <strong>${r.max.toFixed(1)}</strong> (${r.count} obj.)</div>`;
}

/** Réglages d'apparence communs : opacité de couche et contour. */
function symAppearancePanel(layer, sym) {
    const isPolygon = layer.geometryType === 'Polygon' || layer.geometryType === 'MultiPolygon';
    const isPoint = layer.geometryType === 'Point' || layer.geometryType === 'MultiPoint';
    const is3D = isPoint && (layer.style?.mode === 'library' || layer.style?.mode === 'custom');
    const auto = !Number.isFinite(sym.opacity);
    const opVal = auto ? defaultLayerOpacity(layer) : sym.opacity;

    const opacity = `<div class="section">
        <div class="slider-head"><span class="lbl">Opacité</span><span class="val" id="op-val">${Math.round(opVal * 100)} %${auto ? ' (auto)' : ''}</span></div>
        <input type="range" class="rng acc" min="0" max="1" step="0.05" value="${opVal}" oninput="A.setSymOpacity('${layer.id}', this.value)">
        ${auto
            ? '<div class="hint">Suit l’opacité du style ; bouge le curseur pour la fixer.</div>'
            : `<button class="btn btn-soft btn-full" style="margin-top:6px" onclick="A.setSymOpacity('${layer.id}','auto')">↺ Revenir à l’automatique</button>`}
    </div>`;

    // Le contour n'a de sens que sur une surface à plat ou un point : une
    // extrusion n'en porte pas, et un modèle 3D est rendu par three.js.
    const flat = layer.style?.polygonMode === 'flat';
    if (is3D || (isPolygon && !flat)) return opacity;

    const st = sym.stroke || {};
    const mode = st.enabled === false ? 'none' : (st.mode === 'fixed' ? 'fixed' : 'follow');
    const stroke = `<div class="section"><div class="section-title">Contour</div>
        <div class="seg">
            <button class="${mode === 'none' ? 'active' : ''}" onclick="A.setStrokeMode('${layer.id}','none')">Aucun</button>
            <button class="${mode === 'follow' ? 'active' : ''}" onclick="A.setStrokeMode('${layer.id}','follow')">Suit le remplissage</button>
            <button class="${mode === 'fixed' ? 'active' : ''}" onclick="A.setStrokeMode('${layer.id}','fixed')">Couleur fixe</button>
        </div>
        ${mode === 'none' ? '' : `
        <div class="slider-head" style="margin-top:8px"><span class="lbl">Épaisseur</span><span class="val">${st.width ?? 1.5} px</span></div>
        <input type="range" class="rng acc" min="0.5" max="8" step="0.5" value="${st.width ?? 1.5}" oninput="A.setStrokeWidth('${layer.id}', this.value)">
        ${mode === 'fixed' ? `<div style="margin-top:8px"><label class="input-label">Couleur du contour</label>
            <input class="input" type="color" value="${st.color || layer.color}" onchange="A.setStrokeColor('${layer.id}', this.value)"></div>` : ''}`}
    </div>`;
    return opacity + stroke;
}

function symSizePanel(layer, sym) {
    const s = sym.size;
    const isPoint = layer.geometryType === 'Point' || layer.geometryType === 'MultiPoint';
    const isPolygon = layer.geometryType === 'Polygon' || layer.geometryType === 'MultiPolygon';
    const is3D = isPoint && (layer.style?.mode === 'library' || layer.style?.mode === 'custom');
    const unit = is3D ? '×' : (layer.geometryType === 'Polygon' ? 'm' : 'px');
    const title = is3D ? 'Échelle' : (layer.geometryType === 'Polygon' ? 'Hauteur extrusion' : layer.geometryType === 'Point' ? 'Rayon' : 'Épaisseur');

    // Surfaces : à plat ou en volume. À plat, la hauteur d'extrusion n'a aucun
    // effet — on masque le réglage plutôt que de l'afficher inopérant.
    const flat = layer.style?.polygonMode === 'flat';
    const volume = isPolygon ? `<div class="section"><div class="section-title">Rendu des surfaces</div>
        <div class="seg">
            <button class="${flat ? 'active' : ''}" onclick="A.setPolygonMode('${layer.id}','flat')">▭ À plat</button>
            <button class="${!flat ? 'active' : ''}" onclick="A.setPolygonMode('${layer.id}','extruded')">◨ En volume</button>
        </div></div>` : '';
    if (isPolygon && flat) {
        return volume + symAppearancePanel(layer, sym);
    }

    const base = Number.isFinite(sym.extrusion?.base) ? sym.extrusion.base : 0;
    const basePanel = (isPolygon && !flat) ? `<div class="section">
        <div class="slider-head"><span class="lbl">Base (socle)</span><span class="val">${base} m</span></div>
        <input type="range" class="rng acc" min="0" max="100" step="1" value="${base}" oninput="A.setExtrusionBase('${layer.id}', this.value)">
    </div>` : '';

    let inner = '';
    if (s.mode === 'single') {
        inner = `<div class="section"><div class="slider-head"><span class="lbl">${title}</span><span class="val" id="sz-val">${s.value} ${unit}</span></div>
            <input type="range" class="rng acc" min="${is3D ? 0.1 : 1}" max="${is3D ? 5 : layer.geometryType === 'Polygon' ? 150 : 30}" step="${is3D ? 0.1 : 0.5}" value="${s.value}" oninput="A.setSymSizeValue('${layer.id}', this.value)"></div>`;
    } else {
        inner = `<div class="section"><div class="section-title">Champ source</div>${fieldSelect(layer, 'size', s.field, 'numeric')}${s.field ? rangeInfo(layer, s.field) : ''}</div>
            ${s.field ? `<div class="section"><div class="section-title">Méthode</div>${methodChips(layer, 'size', s.method)}</div>
            <div class="section"><div class="section-title">Plage de sortie (${unit})</div><div class="dual">
                <div><label class="input-label">Min</label><input class="input" type="number" step="0.1" value="${s.outputRange[0]}" onchange="A.setSymOutput('${layer.id}','size',0,this.value)"></div>
                <div><label class="input-label">Max</label><input class="input" type="number" step="0.1" value="${s.outputRange[1]}" onchange="A.setSymOutput('${layer.id}','size',1,this.value)"></div>
            </div></div>` : ''}`;
    }
    return volume
        + `<div class="section"><div class="section-title">Mode</div>${modeSeg(layer, 'size', s.mode, ['single', 'graduated'])}</div>`
        + inner + basePanel + symAppearancePanel(layer, sym);
}

function symModelPanel(layer, sym) {
    const m = sym.model;
    const is3D = layer.style?.mode === 'library' || layer.style?.mode === 'custom';
    // Représentation de la couche : cercle 2D (Mapbox) ou modèle 3D
    const repr = `<div class="section"><div class="section-title">Représentation</div>
        <div class="seg">
            <button class="${!is3D ? 'active' : ''}" onclick="A.setRepresentation('${layer.id}','mapbox')">⬤ Cercle 2D</button>
            <button class="${is3D ? 'active' : ''}" onclick="A.setRepresentation('${layer.id}','library')">📦 Modèle 3D</button>
        </div></div>`;
    if (!is3D) return repr + `<div class="hint">Couche en cercles 2D (couleur/taille dans les onglets dédiés). Passe en « Modèle 3D » pour choisir un objet du catalogue.</div>`;

    const catRaw = layer._modelCat || 'lighting';
    const cat = MODEL_LIBRARY.categories[catRaw] ? catRaw : 'lighting';
    if (cat !== catRaw) layer._modelCat = cat;
    const grid = MODEL_LIBRARY.categories[cat].models;
    const selId = layer.style?.library?.modelId;
    const models = allModels();
    let inner;
    if (m.mode === 'single') {
        inner = `<div class="section"><div class="section-title">Catégorie</div>
            <select class="input" onchange="A.setModelCat('${layer.id}', this.value)">${Object.entries(MODEL_LIBRARY.categories).map(([k, c]) => `<option value="${k}" ${cat === k ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}</select></div>
            <div class="section"><div class="section-title">Modèle de la couche</div>
            <div class="model-grid">${grid.map((mm) => `<div class="model-card ${selId === mm.id ? 'active' : ''}" onclick="A.pickModel('${layer.id}','${mm.id}')"><div class="mi">${mm.icon}</div><div class="mn">${mm.name}</div></div>`).join('')}</div></div>`;
    } else {
        inner = `<div class="section"><div class="section-title">Champ source</div>${fieldSelect(layer, 'model', m.field, 'text')}</div>
            ${m.field ? `<div class="section"><div class="section-title">Modèle par valeur</div><div class="cats">${getUniqueValues(layer, m.field, 20).map((v) => {
                const c2 = m.categories.find((c) => String(c.value) === String(v.value));
                return `<div class="cat-row"><span class="cat-icon">${findModel(c2?.modelId)?.icon || '❓'}</span><span class="cat-value" title="${v.value}">${v.value}</span>
                    <select class="cat-select" onchange="A.setModelCategory('${layer.id}','${String(v.value).replace(/'/g, "\\'")}', this.value)"><option value="">—</option>${models.map((mm) => `<option value="${mm.id}" ${c2?.modelId === mm.id ? 'selected' : ''}>${mm.icon} ${mm.name}</option>`).join('')}</select>
                    <span class="cat-count">${v.count}</span></div>`;
            }).join('')}</div></div>
            <div class="section"><div class="section-title">Modèle par défaut</div><select class="input" onchange="A.setDefaultModel('${layer.id}', this.value)"><option value="">— Aucun —</option>${models.map((mm) => `<option value="${mm.id}" ${m.defaultModelId === mm.id ? 'selected' : ''}>${mm.icon} ${mm.name}</option>`).join('')}</select></div>` : ''}`;
    }
    return repr
        + `<div class="section"><div class="section-title">Affectation</div>${modeSeg(layer, 'model', m.mode, ['single', 'categorized'])}</div>`
        + inner + commonTransform(layer);
}
function commonTransform(layer) {
    const c = layer.style.common = layer.style.common || { scale: 1, rotationX: 0, rotationY: 0, rotationZ: 0, offsetX: 0, offsetY: 0, offsetZ: 0 };
    return `<div class="section"><div class="section-title">Transform couche</div>
        <div class="slider-head"><span class="lbl">Échelle</span><span class="val" id="ct-scale">${c.scale}×</span></div>
        <input type="range" class="rng acc" min="0.1" max="5" step="0.1" value="${c.scale}" oninput="A.setCommon('${layer.id}','scale',this.value,'ct-scale','×')">
        <div class="slider-head" style="margin-top:12px"><span class="lbl">Rotation Z (azimut)</span><span class="val" id="ct-rz">${c.rotationZ}°</span></div>
        <input type="range" class="rng acc" min="0" max="360" step="5" value="${c.rotationZ}" oninput="A.setCommon('${layer.id}','rotationZ',this.value,'ct-rz','°')">
        <div class="slider-head" style="margin-top:12px"><span class="lbl">Altitude (Z)</span><span class="val" id="ct-oz">${c.offsetZ}m</span></div>
        <input type="range" class="rng acc" min="0" max="30" step="0.5" value="${c.offsetZ}" oninput="A.setCommon('${layer.id}','offsetZ',this.value,'ct-oz','m')">
    </div>`;
}
function symLabelPanel(layer, sym) {
    const l = sym.label;
    return `<div class="section"><div class="toggle-row"><span class="tlabel">Afficher les étiquettes</span><div class="toggle ${l.enabled ? 'on' : ''}" onclick="A.toggleLabel('${layer.id}')" role="switch" tabindex="0" aria-checked="${!!l.enabled}" aria-label="Afficher les étiquettes"></div></div></div>
        ${l.enabled ? `<div class="section"><div class="section-title">Champ texte</div>${fieldSelect(layer, 'label', l.field, null)}</div>
        <div class="section">
            <div class="slider-head"><span class="lbl">Taille du texte</span><span class="val">${l.size ?? 12} px</span></div>
            <input type="range" class="rng acc" min="6" max="28" step="1" value="${l.size ?? 12}" oninput="A.setLabelSize('${layer.id}', this.value)">
            <div style="margin-top:8px"><label class="input-label">Couleur du texte</label>
                <input class="input" type="color" value="${l.color || '#2D2820'}" onchange="A.setLabelColor('${layer.id}', this.value)"></div>
        </div>` : ''}`;
}

// ---- Object inspector (selection) ----
function renderAttrFields(layer, props, opts = {}) {
    const readOnly = !!opts.readOnly;
    const fields = getLayerFields(layer).filter((f) => !['geometry_json', 'latitude', 'longitude', 'fill_color', 'atlas_3d_json'].includes(f.id));
    if (!fields.length) return '<div class="hint">Aucun attribut.</div>';
    return fields.map((f) => {
        const val = props[f.id] ?? '';
        const esc = String(val).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        const inputType = f.type === 'numeric' ? 'number' : 'text';
        if (readOnly) {
            return `<div class="section" style="margin-bottom:8px">
                <label class="input-label">${f.label || f.id}</label>
                <div class="input" style="opacity:.85;background:var(--surface-muted)">${esc || '—'}</div>
            </div>`;
        }
        return `<div class="section" style="margin-bottom:8px">
            <label class="input-label">${f.label || f.id}</label>
            <input class="input" type="${inputType}" value="${esc}"
                onchange="A.setFeatureAttr('${layer.id}', '${f.id.replace(/'/g, "\\'")}', this.value)">
        </div>`;
    }).join('');
}

function renderObjectInspector() {
    const layer = STATE.layers.find((l) => l.id === STATE.selection.layerId);
    if (!layer) return;
    const count = STATE.selection.features.length;
    const multi = count > 1;
    const idx = STATE.selection.features[multi ? STATE.selection.multiIndex : 0];
    const f = layer.geojson.features[idx];
    const props = f?.properties || {};
    const label = props.name || props._label || props._osmId || `Objet #${idx + 1}`;
    const r = resolveFeatureProps(f, layer);
    const isQgis = layer.source === 'qgis2grist';
    const view = !!CONFIG.viewMode;
    const is3D = isModelLayer(layer);
    const tabs = objectInspectorTabs({ layer, multi });
    if (!_inspObjTab || !tabs.includes(_inspObjTab)) _inspObjTab = tabs[0] || null;

    $('insp-head').innerHTML = `
        <div class="insp-eyebrow"><span class="layer-swatch" style="background:${layer.color}"></span>${count > 1 ? `${count} objets` : layer.name}</div>
        <div class="insp-title">${count > 1 ? 'Sélection multiple' : label}</div>
        <div class="insp-sub">${count > 1 ? `${layer.name}` : `${layer.geometryType}${isQgis ? ' · Grist' : ''}${view ? ' · lecture' : ''}`}</div>`;
    $('insp-tabs').innerHTML = tabs.map((t) =>
        `<button class="insp-tab ${_inspObjTab === t ? 'active' : ''}" onclick="A.setInspObjTab('${t}')">${t}</button>`
    ).join('');

    const slider = (id, lbl, val, min, max, step, unit, mixed) => `
        <div class="slider-row">
            <div class="slider-head"><span class="lbl">${lbl}</span><span class="val ${mixed ? 'mixed' : ''}" id="${id}-v">${mixed ? '— mixte —' : val + unit}</span></div>
            <input type="range" class="rng acc" id="${id}" min="${min}" max="${max}" step="${step}" value="${mixed ? (min + max) / 2 : val}" oninput="A.editFeature('${id}', this.value)">
        </div>`;

    const geoReadOnly = () => `
        <div class="hint" style="margin-bottom:10px">Mode lecture — géométrie 3D non modifiable.</div>
        <div class="section" style="margin-bottom:8px"><label class="input-label">Échelle</label><div class="input" style="background:var(--surface-muted)">${r.scale}×</div></div>
        <div class="section" style="margin-bottom:8px"><label class="input-label">Rotation Z</label><div class="input" style="background:var(--surface-muted)">${r.rotationZ}°</div></div>
        <div class="section" style="margin-bottom:8px"><label class="input-label">Rotation X</label><div class="input" style="background:var(--surface-muted)">${r.rotationX}°</div></div>
        <div class="section" style="margin-bottom:8px"><label class="input-label">Altitude</label><div class="input" style="background:var(--surface-muted)">${r.offsetZ}m</div></div>
        <div class="section" style="margin-bottom:8px"><label class="input-label">Décalage X / Y</label><div class="input" style="background:var(--surface-muted)">${r.offsetX}m · ${r.offsetY}m</div></div>`;

    // Le corps suit l'onglet actif. Une cascade parallèle laisserait passer les
    // réglages 3D là où l'onglet a justement été retiré (objet non qgis2grist,
    // sélection multiple, mode lecture).
    if (_inspObjTab === 'Attributs') {
        const readOnly = view || !isQgis;
        const entete = readOnly
            ? (isQgis ? '' : '<div class="hint" style="margin-bottom:10px">Attributs de la couche — lecture seule (source hors table Grist).</div>')
            : `<div class="hint" style="margin-bottom:10px">Modifications enregistrées dans <strong>${layer.sourceTable}</strong>.</div>`;
        $('insp-body').innerHTML = entete + renderAttrFields(layer, props, { readOnly });
    } else if (_inspObjTab === 'Placement 3D') {
        if (view) {
            $('insp-body').innerHTML = multi
                ? `<div class="hint">Mode lecture — sélection de ${count} objets (pas d’édition).</div>`
                : geoReadOnly();
        } else if (!multi) {
            $('insp-body').innerHTML =
                slider('f-scale', '📏 Échelle', r.scale, 0.1, 5, 0.05, '×') +
                slider('f-rotationZ', '🔄 Rotation Z (azimut)', r.rotationZ, 0, 360, 5, '°') +
                slider('f-rotationX', '↕️ Rotation X', r.rotationX, -90, 90, 5, '°') +
                slider('f-offsetZ', '⬆️ Altitude', r.offsetZ, 0, 20, 0.5, 'm') +
                slider('f-offsetX', '↔️ Décalage X', r.offsetX, -100, 100, 0.5, 'm') +
                slider('f-offsetY', '↕️ Décalage Y', r.offsetY, -100, 100, 0.5, 'm');
        } else {
            $('insp-body').innerHTML = `<div class="hint">Modifications relatives appliquées aux ${count} objets.</div>` +
                slider('m-scale', '📏 Échelle (×)', 1, 0.1, 5, 0.05, '×') +
                slider('m-rotationZ', '🔄 Rotation Z (+/-)', 0, -180, 180, 5, '°') +
                slider('m-offsetZ', '⬆️ Altitude (+/-)', 0, -5, 10, 0.5, 'm') +
                slider('m-offsetX', '↔️ Décalage X (+/-)', 0, -50, 50, 0.5, 'm') +
                slider('m-offsetY', '↕️ Décalage Y (+/-)', 0, -50, 50, 0.5, 'm');
        }
    } else {
        // Aucun onglet : sélection multiple sur des objets sans réglage commun.
        $('insp-body').innerHTML = `<div class="hint">${count} objets sélectionnés — aucun réglage groupé pour ce type d’objet.</div>`;
    }

    if (view) {
        $('insp-foot').innerHTML = `<div class="hint" style="margin:0;flex:1">Mode lecture — consultation seule</div>`;
    } else if (!tabs.length) {
        $('insp-foot').innerHTML = '';
    } else {
        // « Reset » ne rétablit que les surcharges de placement 3D ; « Enregistrer »
        // persiste aussi les attributs, il reste donc dans tous les cas.
        const reset = is3D
            ? `<button class="btn btn-soft" style="flex:1" onclick="A.resetSelected()">🔄 Reset</button>`
            : '';
        $('insp-foot').innerHTML = reset
            + `<button class="btn btn-dark" style="flex:2" onclick="A.applySelected()">Enregistrer · ${count} objet${count > 1 ? 's' : ''}</button>`;
    }
}

// ============================================================
// INTERACTION (clic, hover, sélection, box-select)
// ============================================================
function hitLayerIds() {
    return STATE.layers.filter((l) => map.getLayer(l.id)).map((l) => l.id);
}
function setupInteraction() {
    let boxStart = null, boxEl = null, boxing = false, boxJustEnded = false;

    map.on('mousemove', (e) => {
        if (boxing || boxJustEnded || locationPickMode) return;
        const ids = hitLayerIds();
        const feats = ids.length ? map.queryRenderedFeatures(e.point, { layers: ids }) : [];
        map.getCanvas().style.cursor = feats.length ? (STATE.selection.mode ? 'crosshair' : 'pointer') : (STATE.selection.mode ? 'crosshair' : '');
    });

    map.on('click', (e) => {
        if (boxing || boxJustEnded) return;
        if (locationPickMode) { onLocationPick(e); return; }
        const ids = hitLayerIds();
        const feats = ids.length ? map.queryRenderedFeatures(e.point, { layers: ids }) : [];
        if (!feats.length) {
            if (CONFIG.viewMode) closeViewPopup();
            return;
        }
        const f = feats[0];
        const layer = STATE.layers.find((l) => l.id === f.layer.id);
        if (!layer) return;
        const idx = f.properties?._idx ?? 0;

        // Lecture : popup attributs (pas d’inspecteur édition)
        if (CONFIG.viewMode) {
            showViewFeaturePopup(layer, idx, e.lngLat, f);
            return;
        }

        // Une couche distante n'a pas de ligne a editer : ni table Grist
        // derriere, ni feature source a modifier. Entrer en mode selection
        // ouvrirait un inspecteur d'edition sur un objet qu'on ne peut pas
        // enregistrer — et « Enregistrer » qui echoue est pire que son absence.
        // On montre la fiche, en consultation, comme en lecture.
        if (layer._distant) {
            showViewFeaturePopup(layer, idx, e.lngLat, f);
            return;
        }

        if (STATE.selection.mode && STATE.selection.layerId === layer.id) {
            if (e.originalEvent.shiftKey) toggleSelect(idx); else STATE.selection.features = [idx];
            afterSelectionChange();
        } else {
            enterSelectionMode(layer.id, idx);
        }
    });

    // Sélection rectangulaire — Maj + glisser à la souris, appui long au doigt.
    //
    // Le doigt n'a pas de touche Maj, et un simple glissement doit rester le
    // déplacement de la carte : on attend donc une pression immobile avant de
    // prendre la main. C'est le geste habituel pour « saisir » sur mobile.
    const cc = map.getCanvasContainer();
    let boxLast = null, longPress = 0, armeDepuis = null;

    const annulerAppuiLong = () => {
        clearTimeout(longPress);
        longPress = 0;
        armeDepuis = null;
    };

    const demarrerBox = (x, y, pointerId) => {
        map.dragPan.disable();
        boxing = true;
        boxStart = { x, y };
        boxLast = { x, y };
        boxEl = document.createElement('div');
        boxEl.className = 'selection-box';
        document.body.appendChild(boxEl);
        capturePointer(cc, pointerId);
    };

    cc.addEventListener('pointerdown', (e) => {
        if (CONFIG.viewMode || !STATE.selection.mode) return;
        if (!e.isPrimary) { annulerAppuiLong(); return; } // deux doigts = zoom

        if (e.pointerType === 'mouse') {
            if (!e.shiftKey) return;
            demarrerBox(e.clientX, e.clientY, e.pointerId);
            e.preventDefault();
            return;
        }

        armeDepuis = { x: e.clientX, y: e.clientY, id: e.pointerId };
        longPress = setTimeout(() => {
            if (!armeDepuis) return;
            demarrerBox(armeDepuis.x, armeDepuis.y, armeDepuis.id);
            annulerAppuiLong();
            // Le rectangle naissant est invisible : sans retour, rien ne dit que
            // le geste a basculé du déplacement vers la sélection.
            try { navigator.vibrate?.(15); } catch (_) { /* non supporté */ }
            showToast('Sélection rectangulaire — glissez', 'info');
        }, LONG_PRESS_MS);
    });

    cc.addEventListener('pointermove', (e) => {
        if (armeDepuis) {
            // Le doigt part en promenade : c'est un déplacement de carte.
            const d = Math.hypot(e.clientX - armeDepuis.x, e.clientY - armeDepuis.y);
            if (d > LONG_PRESS_TOLERANCE_PX) annulerAppuiLong();
            return;
        }
        if (!boxing || !boxEl) return;
        boxLast = { x: e.clientX, y: e.clientY };
        const x0 = Math.min(boxStart.x, e.clientX), y0 = Math.min(boxStart.y, e.clientY);
        boxEl.style.left = x0 + 'px'; boxEl.style.top = y0 + 'px';
        boxEl.style.width = Math.abs(e.clientX - boxStart.x) + 'px';
        boxEl.style.height = Math.abs(e.clientY - boxStart.y) + 'px';
    });

    // La fin lit la dernière position connue : `pointercancel` n'en porte pas.
    const endBox = () => {
        annulerAppuiLong();
        if (!boxing) return;
        // Fermer tout de suite : la capture livre le `pointerup` à `cc`, d'où il
        // remonte jusqu'à `window` — sans garde, la sélection serait rejouée.
        boxing = false;
        map.dragPan.enable();
        const rect = map.getContainer().getBoundingClientRect();
        const fin = boxLast || boxStart;
        const a = [Math.min(boxStart.x, fin.x) - rect.left, Math.min(boxStart.y, fin.y) - rect.top];
        const b = [Math.max(boxStart.x, fin.x) - rect.left, Math.max(boxStart.y, fin.y) - rect.top];
        if (boxEl) { boxEl.remove(); boxEl = null; }
        if (b[0] - a[0] > 4 && b[1] - a[1] > 4) selectInBox(a, b);
        // Le `click` de fin de geste arrive après : le laisser passer viderait
        // la sélection qu'on vient tout juste de faire.
        boxJustEnded = true;
        setTimeout(() => { boxJustEnded = false; }, 60);
    };
    cc.addEventListener('pointerup', endBox);
    cc.addEventListener('pointercancel', endBox);
    // Filet : un relâchement hors carte (fenêtre, iframe voisine) doit rendre
    // la main au déplacement plutôt que de laisser la carte figée.
    window.addEventListener('pointerup', endBox);
}

let _viewPopup = null;

function closeViewPopup() {
    if (_viewPopup) {
        try { _viewPopup.remove(); } catch (_) {}
        _viewPopup = null;
    }
}

function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatPopupValue(v) {
    if (v == null || v === '') return '';
    if (Array.isArray(v)) {
        return v.map(formatPopupValue).filter(Boolean).join(', ');
    }
    if (typeof v === 'object') {
        if (v.name != null) return String(v.name);
        if (v.label != null) return String(v.label);
        try { return JSON.stringify(v); } catch (_) { return String(v); }
    }
    return String(v);
}

/** HTML popup lecture : template manifest si présent, sinon attributs métier. */
function buildViewPopupHtml(layer, feature, idx) {
    const props = feature?.properties || {};
    const ml = layer._manifestLayer || {};
    const template = ml.popup_template || ml.popup?.template || layer.popupTemplate || layer.popup_template;
    const title = formatPopupValue(props.name || props._label || props.label)
        || layer.name || `Objet #${(idx ?? 0) + 1}`;

    // Le gabarit est du HTML posé tel quel — c'est voulu, et sans danger quand
    // il vient d'une table du document : l'y mettre demandait déjà le droit
    // d'écrire. Venu d'une adresse, il s'exécuterait dans une iframe qui tient
    // les droits de la personne sur son document. En scène externe, le gabarit
    // est donc rendu **comme du texte** : sa mise en forme est perdue, ses
    // valeurs restent.
    if (typeof template === 'string' && template.trim() && CONFIG.sceneExterne) {
        const texte = template.replace(/\{([^}]+)\}/g,
            (_, key) => formatPopupValue(props[key.trim()]) ?? '');
        return `<div class="atlas-popup"><div class="atlas-popup-title">${escapeHtml(title)}</div>`
             + `<div class="atlas-popup-row">${escapeHtml(texte)}</div></div>`;
    }
    if (typeof template === 'string' && template.trim()) {
        let html = template;
        html = html.replace(/\{([^}]+)\}/g, (_, key) => escapeHtml(formatPopupValue(props[key.trim()])));
        return `<div class="atlas-popup"><div class="atlas-popup-title">${escapeHtml(title)}</div>${html}</div>`;
    }

    const skip = new Set(['_idx', '_row_id', '_fill_color', '_visible', '_fill_opacity', '_line_opacity',
        '_scale', '_rotationX', '_rotationY', '_rotationZ', '_offsetX', '_offsetY', '_offsetZ', '_modelId']);
    const fields = (layer._fields || []).filter((f) => f.name && !skip.has(f.name));
    const rows = [];
    if (fields.length) {
        for (const f of fields.slice(0, 12)) {
            const key = f.name;
            const val = formatPopupValue(props[key] ?? props[f._rawKey] ?? props[f.rawKey]);
            if (!val) continue;
            rows.push([f.label || f.name, val]);
        }
    } else {
        for (const [k, v] of Object.entries(props)) {
            if (skip.has(k) || k.startsWith('_')) continue;
            const val = formatPopupValue(v);
            if (!val) continue;
            rows.push([k, val]);
            if (rows.length >= 12) break;
        }
    }
    if (!rows.length) {
        return `<div class="atlas-popup"><div class="atlas-popup-title">${escapeHtml(title)}</div><div class="atlas-popup-empty">Pas d’attributs</div></div>`;
    }
    const body = rows.map(([k, v]) =>
        `<div class="atlas-popup-row"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(v)}</span></div>`
    ).join('');
    return `<div class="atlas-popup"><div class="atlas-popup-title">${escapeHtml(title)}</div>${body}</div>`;
}

/**
 * La fiche d'un objet, au clic.
 *
 * `featureRendue` est celle que MapLibre vient de designer. Sur une couche
 * locale on lui prefere la feature source, qui porte la geometrie entiere —
 * MapLibre, lui, rend des geometries decoupees par tuile. Sur une couche
 * distante il n'y a pas de source : la feature rendue **est** tout ce qu'on
 * aura, et elle porte les attributs, qui sont ce que la fiche montre.
 */
function showViewFeaturePopup(layer, idx, lngLat, featureRendue = null) {
    if (!map || typeof maplibregl === 'undefined') return;
    const feature = layer.geojson?.features?.[idx] || featureRendue;
    if (!feature) return;
    closeViewPopup();
    let coords = lngLat;
    if (!coords && feature.geometry?.type === 'Point') {
        const [lng, lat] = feature.geometry.coordinates;
        coords = { lng, lat };
    } else if (!coords && feature.geometry) {
        try {
            const b = boundsFromGeoJSON({ type: 'FeatureCollection', features: [feature] });
            if (b) coords = { lng: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2 };
        } catch (_) {}
    }
    if (!coords) return;
    _viewPopup = new maplibregl.Popup({
        maxWidth: '300px',
        closeButton: true,
        closeOnClick: true,
        className: 'atlas-view-popup',
    })
        .setLngLat(coords)
        .setHTML(buildViewPopupHtml(layer, feature, idx))
        .addTo(map);
}

function selectInBox(a, b) {
    const layer = STATE.layers.find((l) => l.id === STATE.selection.layerId);
    if (!layer) return;
    const sw = map.unproject(a), ne = map.unproject(b);
    const minLng = Math.min(sw.lng, ne.lng), maxLng = Math.max(sw.lng, ne.lng);
    const minLat = Math.min(sw.lat, ne.lat), maxLat = Math.max(sw.lat, ne.lat);
    const set = new Set(STATE.selection.features);
    (layer.geojson.features || []).forEach((f, idx) => {
        if (f.geometry?.type !== 'Point') return;
        const [lng, lat] = f.geometry.coordinates;
        if (lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat) set.add(idx);
    });
    STATE.selection.features = [...set];
    afterSelectionChange();
}

async function onLocationPick(e) {
    locationPickMode = false;
    map.getCanvas().style.cursor = '';
    const { lng, lat } = e.lngLat;
    STATE.location = { ...STATE.location, lat, lng, name: `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E` };
    if (STATE.currentModule === 'lieu') renderLieu();
    markDirty();
    showToast('Lieu défini', 'success');
    try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=16&lat=${lat}&lon=${lng}&accept-language=fr`, { headers: { Accept: 'application/json' } });
        const d = await r.json();
        if (d?.display_name) { STATE.location.name = d.display_name.split(',').slice(0, 2).join(',').trim(); if (STATE.currentModule === 'lieu') renderLieu(); }
    } catch (e2) {}
}
function enterSelectionMode(layerId, idx) {
    if (CONFIG.viewMode) {
        const layer = STATE.layers.find((l) => l.id === layerId);
        if (layer && idx != null) showViewFeaturePopup(layer, idx);
        return;
    }
    STATE.selection.mode = true;
    STATE.selection.layerId = layerId;
    STATE.selection.features = idx != null ? [idx] : [];
    STATE.selection.multiIndex = 0;
    $('map-frame').classList.add('select-mode');
    $('selection-bar').classList.add('open');
    const layer = STATE.layers.find((l) => l.id === layerId);
    showToast(`Mode sélection : ${layer?.name || ''}`, 'info');
    afterSelectionChange();
    if (idx != null) flyToFeature(layer, idx);
}
function exitSelectionMode() {
    const layer = STATE.layers.find((l) => l.id === STATE.selection.layerId);
    if (layer) { saveLayerToGrist(layer, true); }
    STATE.selection = { mode: false, layerId: null, features: [], multiIndex: 0 };
    $('map-frame').classList.remove('select-mode');
    $('selection-bar').classList.remove('open');
    clearHighlight();
    renderInspector();
}
function toggleSelect(idx) {
    const i = STATE.selection.features.indexOf(idx);
    if (i === -1) STATE.selection.features.push(idx); else STATE.selection.features.splice(i, 1);
}
function afterSelectionChange() {
    const n = STATE.selection.features.length;
    $('sel-label').innerHTML = `<strong>${n} objet${n > 1 ? 's' : ''}</strong> sélectionné${n > 1 ? 's' : ''}`;
    if (STATE.selection.multiIndex >= n) STATE.selection.multiIndex = 0;
    $('sel-pos').textContent = n > 1 ? `${STATE.selection.multiIndex + 1} / ${n}` : `${n} / ${n}`;
    multiBaseValues = null;
    updateHighlight();
    renderInspector();
}

function updateHighlight() {
    const layer = STATE.layers.find((l) => l.id === STATE.selection.layerId);
    if (!layer) return;
    const data = { type: 'FeatureCollection', features: STATE.selection.features.map((i) => layer.geojson.features[i]).filter(Boolean) };
    if (!map.getSource('sel-hl')) {
        map.addSource('sel-hl', { type: 'geojson', data });
        map.addLayer({ id: 'sel-hl-ring', type: 'circle', source: 'sel-hl', paint: { 'circle-radius': 16, 'circle-color': 'rgba(196,69,54,0.08)', 'circle-stroke-color': '#C44536', 'circle-stroke-width': 3 } });
    } else map.getSource('sel-hl').setData(data);
}
function clearHighlight() {
    if (map.getLayer('sel-hl-ring')) map.removeLayer('sel-hl-ring');
    if (map.getSource('sel-hl')) map.removeSource('sel-hl');
}
function flyToFeature(layer, idx) {
    const f = layer?.geojson?.features?.[idx];
    if (f?.geometry?.type === 'Point') map.flyTo({ center: f.geometry.coordinates, zoom: Math.max(map.getZoom(), 17), duration: 600 });
}

// Feature editing
let multiBaseValues = null;
function setFeatureOverride(layer, idx, param, value) {
    const f = layer.geojson.features[idx]; if (!f) return;
    if (!f.properties) f.properties = {};
    f.properties['_' + param] = value;
}
function clearFeatureOverrides(layer, idx) {
    const p = layer.geojson.features[idx]?.properties; if (!p) return;
    ['_scale', '_rotationX', '_rotationY', '_rotationZ', '_offsetX', '_offsetY', '_offsetZ', '_modelId'].forEach((k) => delete p[k]);
}

// ============================================================
// IMPORT — OSM (Overpass) & fichier
// ============================================================
function openOSM() {
    $('module-title').textContent = 'Import OSM';
    const b = map.getBounds();
    $('module-body').innerHTML = `
        <div class="hint">Zone importée = emprise visible. Zoomez pour réduire.</div>
        <div class="range-info" style="margin-bottom:12px">${b.getSouth().toFixed(4)}, ${b.getWest().toFixed(4)} → ${b.getNorth().toFixed(4)}, ${b.getEast().toFixed(4)}</div>
        <div class="section"><div class="section-title">Objets prédéfinis</div>
            <div class="model-grid">${Object.entries(OSM_PRESETS).map(([k, p]) => `<div class="model-card" onclick="A.runOSM('${k}')"><div class="mi">${p.icon}</div><div class="mn">${p.name}</div></div>`).join('')}</div>
        </div>
        <div class="section"><button class="btn btn-soft btn-full" onclick="A.openModule('couches')">← Retour</button></div>`;
}
async function runOSM(key) {
    const preset = OSM_PRESETS[key]; if (!preset) return;
    showLoading('Interrogation OpenStreetMap…');
    try {
        const b = map.getBounds();
        const bbox = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
        const q = `[out:json][timeout:30];(${preset.query}(${bbox}););out body geom;`;
        const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const geojson = osmToGeoJSON(data.elements || []);
        if (!geojson.features.length) { hideLoading(); showToast('Aucun résultat', 'warning'); return; }
        const geomType = preset.geomType || geojson.features[0].geometry.type;
        const layer = makeLayer(preset.name, geomType, geojson, preset.category, preset.model);
        finalizeNewLayer(layer);
        hideLoading();
        showToast(`${geojson.features.length} objets importés`, 'success');
    } catch (e) { hideLoading(); showToast('Erreur OSM : ' + e.message, 'error'); }
}
function osmToGeoJSON(elements) {
    const features = [];
    for (const el of elements) {
        let geometry = null;
        if (el.type === 'node' && el.lat != null) geometry = { type: 'Point', coordinates: [el.lon, el.lat] };
        else if (el.type === 'way' && el.geometry) {
            const coords = el.geometry.map((p) => [p.lon, p.lat]);
            const closed = coords.length > 3 && coords[0][0] === coords.at(-1)[0] && coords[0][1] === coords.at(-1)[1];
            geometry = (closed && (el.tags?.building || el.tags?.area === 'yes' || el.tags?.landuse)) ? { type: 'Polygon', coordinates: [coords] } : { type: 'LineString', coordinates: coords };
        }
        if (geometry) features.push({ type: 'Feature', geometry, properties: { _osmId: `${el.type}/${el.id}`, ...el.tags } });
    }
    return { type: 'FeatureCollection', features };
}

function makeLayer(name, geomType, geojson, category, modelId) {
    const color = randomColor();
    const is3DPoint = (geomType === 'Point' || geomType === 'MultiPoint') && modelId;
    const layer = {
        id: 'layer-' + Date.now() + '-' + Math.floor(Math.random() * 1e4),
        name, color, visible: true, geometryType: geomType,
        source: 'import', geojson,
        _modelCat: category || 'furniture',
        style: {
            mode: is3DPoint ? 'library' : 'mapbox',
            library: { modelId: modelId ? findModel(modelId)?.id : null },
            custom: {},
            common: { scale: modelId ? (findModel(modelId)?.scale || 1) : 1, rotationX: 0, rotationY: 0, rotationZ: 0, offsetX: 0, offsetY: 0, offsetZ: 0 },
        },
    };
    initSymbolization(layer);
    return layer;
}
function finalizeNewLayer(layer) {
    // Empiler au sommet mettrait un bâti importé après un réseau par-dessus lui.
    // On insère sous les géométries plus fines : surfaces, puis lignes, puis points.
    STATE.layers.splice(insertionIndex(STATE.layers, layer.geometryType), 0, layer);
    addLayerToMap(layer);
    updateRailBadge();
    fitToLayer(layer);
    markDirty();
    if (STATE.currentModule === 'couches' || STATE.currentModule === 'symbo') renderLayersPanel(STATE.currentModule);
    else openModule('couches');
    saveLayerToGrist(layer, true);
}
/**
 * Cadrer sur une couche — depuis ses entités, ou depuis ce qu'elle déclare.
 *
 * Une couche distante n'a pas ses entités ici : MapLibre les a, Atlas non. Son
 * emprise vient alors du manifeste (`bbox`), qui est justement là pour ça.
 *
 * @returns {boolean} vrai si le cadrage a eu lieu.
 */
function fitToLayer(layer) {
    const bounds = new maplibregl.LngLatBounds();
    let any = false;
    (layer.geojson.features || []).forEach((f) => {
        const g = f.geometry; if (!g) return;
        const coords = g.type === 'Point' ? [g.coordinates] : g.coordinates.flat(g.type.includes('Multi') ? 2 : 1);
        coords.forEach((c) => { if (Array.isArray(c) && typeof c[0] === 'number') { bounds.extend(c); any = true; } });
    });
    if (any) {
        map.fitBounds(bounds, { padding: 80, maxZoom: 18, duration: 800 });
        return true;
    }
    if (layer._bboxDeclaree) {
        map.fitBounds(layer._bboxDeclaree, { padding: 80, maxZoom: 18, duration: 800 });
        return true;
    }
    return false;
}

function wireDrop() {
    const dz = $('drop'); if (!dz) return;
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
    dz.ondragleave = () => dz.classList.remove('over');
    dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); };
}
async function processFile(file) {
    showLoading('Lecture du fichier…');
    try {
        const text = await file.text();
        const geojson = JSON.parse(text);
        const features = geojson.features || [geojson];
        const geomType = features[0]?.geometry?.type || 'Point';
        const layer = makeLayer(file.name.replace(/\.[^.]+$/, ''), geomType, { type: 'FeatureCollection', features }, null, null);
        finalizeNewLayer(layer);
        hideLoading();
        showToast(`${features.length} éléments importés`, 'success');
    } catch (e) { hideLoading(); showToast('Erreur : ' + e.message, 'error'); }
}

async function reloadGenericTableLayer(layer, force) {
    if (!CONFIG.grist.ready || layer.kind !== 'table' || !layer.sourceTable || !map) return 0;
    if (dirty && !force) return -1;
    const cols = await grist.docApi.fetchTable(layer.sourceTable);
    const gc = layer.geometryColumn || detectGeometryColumn(cols);
    layer.geojson = tableToGeoJSON(cols, gc);
    indexFeatures(layer);
    applyControls(layer);
    if (map.getSource(layer.id)) syncLayerSourceData(layer);
    else addLayerToMap(layer);
    Models3D.scheduleBuild();
    return layer.geojson.features.length;
}

async function linkTableFromGrist(tableId, geomCol, data) {
    if (!CONFIG.grist.ready) { showToast('Grist requis', 'warning'); return; }
    if (STATE.layers.some((l) => l.sourceTable === tableId)) {
        showToast(`« ${tableId} » est déjà affichée`, 'info');
        return;
    }
    showLoading('Lecture de la table…');
    try {
        const cols = data || await grist.docApi.fetchTable(tableId);
        const gc = geomCol || detectGeometryColumn(cols);
        if (!gc) { hideLoading(); showToast('Aucune colonne géométrie', 'error'); return; }
        const fc = tableToGeoJSON(cols, gc);
        if (!fc.features.length) { hideLoading(); showToast('Table sans géométrie exploitable', 'warning'); return; }
        const layer = makeLayer(tableId, fc.features[0].geometry.type, fc, null, null);
        layer.kind = 'table';
        layer.sourceTable = tableId;
        layer.geometryColumn = gc;
        layer.source = 'grist-table';
        layer.controls = [];
        await finalizeNewLayer(layer);
        hideLoading();
        showToast(`« ${tableId} » liée · ${fc.features.length} objets`, 'success');
    } catch (e) {
        hideLoading();
        showToast('Erreur : ' + e.message, 'error');
    }
}

// ============================================================
// GRIST (persistance — optionnelle, mode standalone OK)
// ============================================================
const TABLE_SCHEMAS = {
    Maquette_Layers: [
        { id: 'Name', fields: { label: 'Nom', type: 'Text' } },
        { id: 'Color', fields: { label: 'Couleur', type: 'Text' } },
        { id: 'Visible', fields: { label: 'Visible', type: 'Bool' } },
        { id: 'GeomType', fields: { label: 'Type', type: 'Text' } },
        { id: 'StyleJSON', fields: { label: 'Style (JSON)', type: 'Text' } },
        { id: 'GeoJSON', fields: { label: 'GeoJSON', type: 'Text' } },
    ],
};
async function syncStoryFromGrist() {
    if (!CONFIG.grist.ready) return;
    STATE.story = await loadStoryFromGrist(grist.docApi);
    refreshStoryNavChrome();
    if (CONFIG.viewMode) return;
    try {
        const rec = await grist.docApi.fetchTable('Atlas_Story');
        if ((rec.id?.length || 0) > STATE.story.length) {
            await saveStoryToGrist(grist.docApi, STATE.story, { viewMode: CONFIG.viewMode });
        }
    } catch (_) { /* table absente */ }
}

function assertCanWrite(actionLabel) {
    if (canWrite(CONFIG.viewMode)) return true;
    showToast('Mode lecture — ' + actionLabel + ' indisponible', 'warning');
    return false;
}

function enterViewModeOnWriteFail(err) {
    if (CONFIG.viewMode) return;
    CONFIG.viewMode = true;
    applyViewModeChrome();
    const msg = err?.message || String(err || '');
    showToast('Écriture refusée — passage en lecture' + (msg ? ` (${msg})` : ''), 'warning');
}

/**
 * Badge de droits — dit ce qui est vrai, pas une identité inventée.
 *
 * Le jeton d'accès Grist ne livre qu'un `userId` : sans annuaire dans le
 * document, on ne peut afficher ni nom ni initiales. L'information utile et
 * disponible, c'est le droit dont on dispose sur ce document.
 */
function updateUserBadge() {
    const el = $('user-badge');
    if (!el) return;
    const lecture = !!CONFIG.viewMode;
    const droit = lecture ? 'Lecture seule — édition indisponible' : 'Édition autorisée';
    const u = CONFIG.grist.user;
    el.classList.toggle('ro', lecture);
    if (u?.initiales) {
        // Identité résolue : on la montre, le droit passe en infobulle.
        el.textContent = u.initiales;
        el.title = `${u.name || u.email} — ${droit}`;
    } else {
        // Rien de résolu : afficher le droit, jamais une identité inventée.
        el.textContent = lecture ? '👁' : '✎';
        el.title = droit + (CONFIG.grist.userId ? ` · utilisateur ${CONFIG.grist.userId}` : '');
    }
}

/**
 * Renseigne l'identité affichée par le badge.
 *
 * Point d'entrée unique pour une future source de noms — un annuaire dans le
 * document, à la manière de TaskFlow. L'API Grist ne convient pas : mesuré le
 * 2026-08-05, `GET {baseUrl}/access` répond **403** avec un jeton de document
 * (authentifié mais hors périmètre — la gestion du partage n'en fait pas
 * partie). Voir docs/CADRAGE-IDENTITE-ACL.md §A.
 *
 * @param {{name?: string, email?: string}|null} u
 */
function setUserIdentity(u) {
    CONFIG.grist.user = u ? { ...u, initiales: initialsFrom(u.name, u.email) } : null;
    updateUserBadge();
}

/**
 * Point d'entree du recit en lecture.
 *
 * Les modules d'auteur etant retires, un recit publie n'avait plus aucun moyen
 * d'etre lance : le rail disparait et la barre du haut n'offrait que des
 * actions d'edition. Le bouton prend leur place, et seulement s'il y a
 * quelque chose a lire.
 */
function refreshStoryButton() {
    const b = $('btn-story');
    if (b) b.classList.toggle('has-story', !!(STATE.story?.length));
}

function applyViewModeChrome() {
    document.body.classList.toggle('view-mode', !!CONFIG.viewMode);
    refreshStoryButton();
    const badge = $('view-mode-badge');
    if (badge) badge.hidden = !CONFIG.viewMode;
    updateUserBadge();
    refreshViewerControlsHud();
    refreshStoryNavChrome();
    refreshControlsDock();
    if (CONFIG.viewMode) {
        // Lecture = carte + FAB récit ; jamais panneau atelier (même Récit) au boot
        closeModulePanel();
        closeInspectorPanel();
    }
}

/** Récit en lecture : FAB seulement (pas de rail / panneau latéral). */
function refreshStoryNavChrome() {
    refreshStoryButton();
    const hasStory = (STATE.story?.length || 0) > 0;
    document.body.classList.toggle('view-has-story', !!(CONFIG.viewMode && hasStory));
    const railRecit = document.querySelector('.rail-item[data-module="recit"]');
    if (railRecit) {
        if (CONFIG.viewMode) railRecit.hidden = true;
        else railRecit.hidden = false;
    }
    const fab = $('viewer-story-fab');
    if (fab) fab.hidden = !(CONFIG.viewMode && hasStory);
    if (CONFIG.viewMode && STATE.currentModule === 'recit') closeModulePanel();
}

/** Contrôles canvas publiés (active) — interaction lecteur, pas config éditeur. */
function collectPublishedControls() {
    const out = [];
    for (const layer of STATE.layers) {
        for (const c of (layer.controls || [])) {
            if (c.active) out.push({ layer, c });
        }
    }
    return out;
}

/** HUD rect lecture — désactivé (dock pastilles, spec D12). T6 : pastilles données sur le dock. */
function refreshViewerControlsHud() {
    const el = $('viewer-controls');
    if (!el) return;
    el.classList.remove('has-controls', 'collapsed');
    el.innerHTML = '';
}

/* ------------------------------------------------------------------ */
/* La feuille mobile                                                    */
/* ------------------------------------------------------------------ */

let Feuille = null;              // charge a la demande : le bureau n'en a pas besoin
let feuillePosition = 'fermee';  // 'fermee' | 'demi' | 'pleine'

async function chargerFeuille() {
    if (!Feuille) Feuille = await import('./lib/feuille-mobile.js?v=1.5.4');
    return Feuille;
}

/**
 * Pose la feuille a une position.
 *
 * La fraction pilote une translation, pas une hauteur : le contenu ne se
 * redispose pas a chaque geste, et le glissement reste franc meme sur une
 * longue liste de couches.
 */
function poserFeuille(nom, anime = true) {
    const p = $('module-panel');
    if (!p || !Feuille) return;
    feuillePosition = nom;
    p.classList.toggle('feuille-glisse', !anime);
    p.style.setProperty('--feuille-frac', String(Feuille.ANCRAGES[nom] ?? 0));
    if (nom === 'fermee') {
        document.querySelectorAll('#mobile-nav [data-mobile-tab]').forEach((b) => b.classList.remove('active'));
    }
}

/**
 * Le glissement, qui remplace l'ancien onglet « Carte ».
 *
 * On n'allait pas « a la carte » : elle est dessous, en permanence. On ecarte
 * ce qui la masque — et pendant l'edition d'un recit, c'etait le seul moyen de
 * cadrer la vue, sauf que le bouton se trouvait sous la feuille a ecarter.
 */
async function installerFeuilleMobile() {
    const p = $('module-panel');
    if (!p) return;
    const F = await chargerFeuille();
    if (p.dataset.feuille) return;
    p.dataset.feuille = '1';

    if (!p.querySelector('.feuille-poignee')) {
        const poignee = document.createElement('div');
        poignee.className = 'feuille-poignee';
        poignee.setAttribute('aria-hidden', 'true');
        p.prepend(poignee);
    }

    const corps = () => p.querySelector('#module-body');
    let geste = null;

    p.addEventListener('pointerdown', (e) => {
        if (!document.body.classList.contains('mobile-layout')) return;
        geste = {
            y0: e.clientY, t0: e.timeStamp, y: e.clientY, t: e.timeStamp,
            depart: feuillePosition,
            surPoignee: !!e.target.closest('.feuille-poignee, .module-head'),
            defilement: corps()?.scrollTop ?? 0,
            pris: false, id: e.pointerId,
        };
    });

    p.addEventListener('pointermove', (e) => {
        if (!geste || e.pointerId !== geste.id) return;
        const dy = e.clientY - geste.y0;
        if (!geste.pris) {
            if (Math.abs(dy) < 6) return;    // laisser passer les taps
            if (!F.gestePourLaFeuille({
                surPoignee: geste.surPoignee, defilement: geste.defilement, versLeBas: dy > 0,
            })) { geste = null; return; }
            geste.pris = true;
            p.classList.add('feuille-glisse');
        }
        geste.y = e.clientY;
        geste.t = e.timeStamp;
        p.style.setProperty('--feuille-frac',
            String(F.fractionPendantGeste(geste.depart, dy, window.innerHeight)));
        e.preventDefault();
    }, { passive: false });

    const finir = (e) => {
        if (!geste || (e && e.pointerId !== geste.id)) return;
        const g = geste; geste = null;
        p.classList.remove('feuille-glisse');
        if (!g.pris) return;
        const dt = Math.max(0.016, (g.t - g.t0) / 1000);
        const vitesse = -((g.y - g.y0) / window.innerHeight) / dt;   // positif = vers le haut
        poserFeuille(F.ancrageApresGeste({
            depart: g.depart,
            fraction: F.fractionPendantGeste(g.depart, g.y - g.y0, window.innerHeight),
            vitesse,
        }));
    };
    p.addEventListener('pointerup', finir);
    p.addEventListener('pointercancel', finir);
}

function updateMobileLayout() {
    const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches;
    document.body.classList.toggle('mobile-layout', narrow);
    CONFIG.light3d = shouldEnableLight3d({
        viewMode: CONFIG.viewMode,
        no3dParam: parseNo3dParam(typeof location !== 'undefined' ? location.search : ''),
        isNarrow: narrow,
        hardwareConcurrency: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 8,
    });
    if (CONFIG.light3d && typeof Models3D !== 'undefined') {
        Models3D._disabled = true;
    }
}

/**
 * La marque « Atlas » ouvre le menu principal — dans l'application seulement.
 *
 * Le widget n'a rien au-dessus de sa scene : la marque y reste inerte, et le
 * chevron ne s'affiche pas. C'est aussi le point ou viendront s'accrocher les
 * modules a venir, sans toucher a la carte.
 */
async function cablerMenuPrincipal() {
    const marque = document.querySelector('.brand');
    if (!marque) return;
    let hote;
    try { hote = await import('./lib/hote-ui.js?v=1.5.4'); } catch (_) { return; }
    let caps;
    try {
        const dc = await import('./lib/data-client.js?v=1.5.4');
        caps = dc.capacites();
    } catch (_) { return; }
    // Widget : rien au-dessus de la scene. Navigateur sans compte : le menu
    // n'aurait rien a offrir — ni liste de scenes, ni connexion possible. Une
    // marque actionnable qui ouvre un menu vide vaut moins que pas de bouton.
    if (caps.mode === 'grist' || !caps.decouverte) return;

    marque.classList.add('brand-menu');
    marque.setAttribute('role', 'button');
    marque.setAttribute('tabindex', '0');
    marque.setAttribute('aria-label', 'Menu principal');
    const ouvrir = () => hote.ouvrirMenuPrincipal({
        scene: { nom: STATE.projectName || 'Scène en cours' },
        modifie: dirty,
    });
    marque.addEventListener('click', ouvrir);
    marque.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(); }
    });
}

/** La feuille des modules que la barre du bas ne peut pas porter. */
function ouvrirFeuilleModules() {
    const f = $('mobile-plus');
    if (!f) return;
    f.hidden = false;
    const fermer = () => {
        f.hidden = true;
        // L'onglet « Plus » ne reste pas actif : il ouvre, il ne selectionne pas.
        document.querySelectorAll('#mobile-nav [data-mobile-tab]').forEach((b) => {
            b.classList.toggle('active', b.dataset.mobileTab === STATE.currentModule);
        });
    };
    f.querySelector('.mp-fond').onclick = fermer;
    f.querySelectorAll('[data-module-plus]').forEach((b) => {
        b.onclick = () => { fermer(); openModule(b.dataset.modulePlus); };
    });
    // Enregistrer, charger, exporter : dans l'en-tete sur un ecran large, nulle
    // part sur un telephone. On pouvait donc tout modifier sans jamais rien
    // enregistrer — le pire endroit ou manquer un bouton.
    const actions = {
        enregistrer: () => saveProject(),
        charger: () => $('file-input')?.click(),
        exporter: () => exportProject(),
    };
    f.querySelectorAll('[data-action-plus]').forEach((b) => {
        b.onclick = () => { fermer(); actions[b.dataset.actionPlus]?.(); };
    });
}

function wireMobileNav() {
    document.querySelectorAll('#mobile-nav [data-mobile-tab]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const tab = btn.dataset.mobileTab;
            // Toucher l'onglet deja ouvert referme la feuille : c'est ce qui
            // remplace l'ancien onglet « Carte », sous le doigt plutot qu'a
            // l'autre bout de la barre — et sous la feuille qu'il fallait ecarter.
            const F = await chargerFeuille();
            const actif = document.querySelector('#mobile-nav [data-mobile-tab].active')?.dataset.mobileTab;
            if (tab !== 'plus' && F.ancrageApresOnglet({
                ongletActif: actif, onglet: tab, position: feuillePosition,
            }) === 'fermee') {
                closeModulePanel();
                A.closeInspector?.();
                return;
            }
            document.querySelectorAll('#mobile-nav [data-mobile-tab]').forEach((b) => {
                b.classList.toggle('active', b === btn);
            });
            if (tab === 'couches') {
                if (CONFIG.viewMode) return;
                openModule('couches');
            } else if (tab === 'plus') {
                // Lieu, Soleil, Vue et Reglages n'ont pas d'onglet : le rail qui
                // les portait est masque sur telephone. Sans cette feuille, ils
                // sont simplement inatteignables — dont la source du catalogue 3D,
                // qui n'a aucun autre acces.
                ouvrirFeuilleModules();
            } else if (tab === 'controles') {
                // Filtrer sur le terrain est l'usage premier : c'est ce qui
                // permet de ne garder a l'ecran que les objets qu'on va voir.
                // En lecture, les controles exposes vivent dans le dock ; le
                // module d'auteur, lui, reste ferme.
                if (CONFIG.viewMode) {
                    showToast('Utilisez les pastilles de la carte pour filtrer', 'info');
                    return;
                }
                openModule('controles');
            } else if (tab === 'recit') {
                if (CONFIG.viewMode && !(STATE.story?.length)) {
                    showToast('Aucun récit publié', 'info');
                    return;
                }
                openModule('recit');
            }
        });
    });
}

async function initGrist() {
    // Une scène venue d'une adresse n'est pas de confiance : n'importe qui peut
    // fabriquer l'URL et la faire ouvrir, alors qu'une scène lue dans le
    // document a forcément été posée par quelqu'un qui pouvait y écrire.
    // Atlas ne lui donne donc pas le document — `grist.ready()` n'est jamais
    // appelé, `docApi` n'existe pas, et rien ne s'écrit nulle part.
    if (CONFIG.sceneExterne) {
        console.info('[Atlas] scène externe — le document n’est pas ouvert');
        return;
    }
    if (typeof grist === 'undefined') { console.log('Grist indisponible — mode standalone'); return; }
    const search = typeof location !== 'undefined' ? location.search : '';
    // Les droits transmis par Grist font autorité ; ?mode= ne peut que restreindre.
    const acc = resolveAccess({ search });
    try {
        grist.ready({ requiredAccess: acc.requiredAccess });
        CONFIG.grist.ready = true;
        CONFIG.viewMode = acc.viewMode;
        // Sonde uniquement quand Grist n'a rien transmis (ouverture hors Grist,
        // version ancienne) : sinon on croit ce que le document annonce.
        if (acc.needsProbe) {
            const writable = await probeCanWriteDoc(grist.docApi);
            if (!writable) {
                CONFIG.viewMode = true;
                console.info('[Atlas] Accès sans écriture — mode lecture');
            }
        } else if (CONFIG.viewMode) {
            console.info('[Atlas] Mode lecture —', acc.reason);
        }
        // Identité : le jeton livre l'userId — suffisant pour marquer l'auteur
        // d'une préférence ou d'un récit. Le nom, lui, n'est pas accessible par
        // l'API (cf. setUserIdentity et docs/CADRAGE-IDENTITE-ACL.md §A).
        try {
            const tok = await grist.docApi.getAccessToken({ readOnly: true });
            CONFIG.grist.userId = decodeAccessToken(tok?.token)?.userId ?? null;
        } catch (e) {
            CONFIG.grist.userId = null;
        }
        applyViewModeChrome();
        CONFIG.docMode = await detectDocMode(grist.docApi);
        if (CONFIG.docMode === 'scene-manifest') {
            await loadFromSceneManifest();
            startSceneManifestPolling();
        } else {
            await initGristTables();
            await loadLayersFromGrist();
        }
        await syncStoryFromGrist();
        await syncScenePrefsFromGrist();
        refreshControlsDock();
        if (CONFIG.viewMode) {
            showToast('Mode lecture — consultation seule', 'warning');
        }
    } catch (e) {
        console.warn('Grist init:', e.message);
        if (!intent.viewModeForced && intent.preferFull) {
            try {
                grist.ready({ requiredAccess: 'read table' });
                CONFIG.grist.ready = true;
                CONFIG.viewMode = true;
                applyViewModeChrome();
                CONFIG.docMode = await detectDocMode(grist.docApi);
                if (CONFIG.docMode === 'scene-manifest') {
                    await loadFromSceneManifest();
                    startSceneManifestPolling();
                } else {
                    await loadLayersFromGrist();
                }
                await syncStoryFromGrist();
                showToast('Accès limité — mode lecture', 'warning');
            } catch (e2) {
                console.warn('Grist init lecture:', e2.message);
            }
        }
    }
}
async function initGristTables() {
    if (CONFIG.viewMode) return;
    if (!assertCanWrite('créer les tables maquette')) return;
    const tables = await grist.docApi.listTables();
    if (!tables.includes('Maquette_Layers')) {
        try {
            await grist.docApi.applyUserActions([['AddTable', 'Maquette_Layers', TABLE_SCHEMAS.Maquette_Layers]]);
        } catch (e) {
            enterViewModeOnWriteFail(e);
        }
    }
}

/** Monte les couches sur la carte (après chargement Grist). */
function mountLoadedLayers(bounds) {
    updateRailBadge();
    if (!map) return;
    // Le cadrage se pose **tout de suite**, hors de la file d'attente du style.
    // `fitBounds` n'a besoin que de la carte, pas de ses tuiles ; et surtout,
    // celui qui monte les couches connaît les bornes du manifeste, alors que le
    // rappel d'`onStyleReady` ne sait que les calculer depuis les entités
    // locales — qu'une couche distante n'a pas. Les laisser tous deux dans la
    // file les mettrait en concurrence : le premier servi poserait
    // `_initialViewportApplied` et l'autre n'aurait plus la main.
    applyInitialViewport(bounds || computeLayersBounds());
    scheduleMapLayersSync(() => {
        const remount = () => {
            if (!mapStyleUsable()) return;
            syncAllLayersToMap();
            const r = reconcilePanelVisibilityToMap();
            if (r.fixed) updateLegend();
            if (CONFIG.viewMode) refreshViewerControlsHud();
        };
        map.once('moveend', remount);
        map.once('idle', remount);
        setTimeout(remount, 700);
        setTimeout(remount, 1500);
    });
    if (CONFIG.viewMode) {
        applyViewModeChrome();
        refreshViewerControlsHud();
    }
}

/** Doc qgis2grist : Scene Manifest + tables métier. */
async function loadFromSceneManifest() {
    try {
        const manifest = await loadLatestSceneManifest(grist.docApi);
        if (!manifest) {
            showToast('SceneManifest vide — fallback maquette', 'warning');
            await initGristTables();
            await loadLayersFromGrist();
            return;
        }
        _sceneManifest = manifest;
        _widgetConfig = await loadQgisWidgetConfig(grist.docApi);
        const prefs = await loadLayerPrefs(grist.docApi);
        const { layers, projectName, bounds: rawBounds, echecs } = await loadSceneManifestLayers(
            grist.docApi, manifest, _widgetConfig
        );
        // Une scene amputee doit le dire. Elle s'affichait jusqu'ici comme une
        // scene complete : rien ne distinguait une couche en echec d'une couche
        // qu'on avait choisi de ne pas mettre.
        signalerCouchesManquantes(echecs);
        for (const layer of layers) {
            applyLayerPrefs(layer, prefs);
            if (layer.visible !== false && layer._deferredLoad) {
                materializeDeferredLayer(layer, DEFERRED_OPTS);
            }
        }
        STATE.layers.push(...layers);
        // Rangs enregistrés : les prefs priment sur l'ordre du manifest, comme
        // pour le reste du style. Sans rang, l'ordre du manifest est conservé.
        STATE.layers = sortByRank(STATE.layers, Object.fromEntries(
            STATE.layers.filter((l) => Number.isFinite(l._rank)).map((l) => [l.sourceTable || l.id, l._rank])
        ));
        layers.forEach((layer) => {
            (layer.controls || []).forEach((c) => repairSelectControlFromManifest(layer, c));
            sanitizeBrokenSelectFilters(layer);
            prepareLayerFilters(layer);
        });
        if (projectName) {
            STATE.projectName = projectName;
            const el = $('project-name');
            if (el) el.textContent = projectName;
        }
        const bounds = boundsFromVisibleLayers(layers) || rawBounds;
        mountLoadedLayers(bounds);
        const visCount = layers.filter((l) => l.visible !== false).length;
        const hiddenBasemap = layers.filter((l) => l.visible === false);
        if (hiddenBasemap.length) {
            showToast(
                `${visCount} couche(s) · ${hiddenBasemap.length} contexte masquée(s) (buildings…) — « Tout » pour tout voir`,
                'warning'
            );
        } else {
            showToast(`qgis2grist · ${layers.length} couche(s) · ${visCount} visible(s)`, 'success');
        }
        console.log('[Atlas v7] Scene Manifest', manifest.version, layers.length, 'couches');
    } catch (e) {
        console.warn('loadFromSceneManifest:', e);
        showToast('Scene Manifest : ' + e.message, 'error');
    }
}

/**
 * Monter une scène venue d'une adresse.
 *
 * Le jumeau de `loadFromSceneManifest`, moins tout ce qui touche au document :
 * ni préférences, ni récit enregistré, ni sondage. La différence tient au
 * premier argument passé au chargeur — `null` au lieu de `docApi` —, et c'est
 * cette absence qui fait tomber les couches `source.table` dans les échecs
 * déclarés, avec le message qui envoie les publier.
 */
async function monterSceneExterne(manifest) {
    try {
        const { layers, projectName, bounds: rawBounds, echecs } =
            await loadSceneManifestLayers(null, manifest, null);
        signalerCouchesManquantes(echecs);

        STATE.layers.push(...layers);
        // Pas de préférences enregistrées ici : l'ordre est celui que le
        // manifeste déclare, et il n'y a rien d'autre pour le contredire.
        STATE.layers = sortByRank(STATE.layers, Object.fromEntries(
            STATE.layers.filter((l) => Number.isFinite(l._rank)).map((l) => [l.sourceTable || l.id, l._rank])
        ));
        layers.forEach((layer) => {
            (layer.controls || []).forEach((c) => repairSelectControlFromManifest(layer, c));
            sanitizeBrokenSelectFilters(layer);
            prepareLayerFilters(layer);
        });
        if (projectName) {
            STATE.projectName = projectName;
            const el = $('project-name');
            if (el) el.textContent = projectName;
        }

        // Ambiance déclarée dans le manifeste portable (labels, soleil…).
        // Le fond (basemap) est appliqué après le premier idle — un setStyle
        // pendant le montage faisait planter `getStyle().layers`.
        const ms = manifest.settings;
        let wantBasemap = null;
        if (ms && typeof ms === 'object') {
            if (ms.basemap && BASEMAPS[ms.basemap]) wantBasemap = ms.basemap;
            if (typeof ms.labels === 'boolean') STATE.settings.labels = ms.labels;
            if (typeof ms.shadows === 'boolean') STATE.settings.shadows = ms.shadows;
            if (typeof ms.sky === 'boolean') STATE.settings.sky = ms.sky;
            if (Number.isFinite(ms.timeOfDay)) STATE.settings.timeOfDay = ms.timeOfDay;
            if (typeof ms.terrain3D === 'boolean') STATE.settings.terrain3D = ms.terrain3D;
        }

        mountLoadedLayers(boundsFromVisibleLayers(layers) || rawBounds);
        applyLabelsVisibility();
        updateLighting();
        if (wantBasemap && map) {
            map.once('idle', () => {
                try {
                    A.setBasemap?.(wantBasemap);
                    // Après setStyle, re-couper les labels si demandé.
                    map.once('idle', () => applyLabelsVisibility());
                } catch (_) { /* ignore */ }
            });
        }

        if (!layers.length) {
            showToast('Scène chargée, mais aucune couche affichable', 'warning');
        } else {
            showToast(`Scène externe · ${layers.length} couche(s)`, 'success');
        }

        // Récit embarqué dans le Scene Manifest (story.steps) — pas de table Grist.
        const steps = manifest.story?.steps;
        if (Array.isArray(steps) && steps.length) {
            STATE.story = steps.map((s) => ({
                title: s.title || '',
                text: s.description || s.text || '',
                state: s.state || {},
            }));
            refreshStoryNavChrome();
            // Lancer après le premier idle carte (caméra + couches montées).
            setTimeout(() => {
                try { A.storyPlay?.(0); } catch (e) { console.warn('[Atlas] récit externe', e); }
            }, 800);
        }

        // Pas de validation contre le schéma ici, et c'est délibéré : elle
        // écrirait dans la console de qui *regarde* la scène, alors que le
        // besoin est chez qui l'*écrit*. Celui-là dispose déjà de l'outil —
        // `node scripts/valider-schema.js <schema> <scene>` — et du schéma
        // publié à une adresse stable. Les échecs par couche, eux, sont
        // déclarés ci-dessus : c'est ce qui manquait vraiment.
    } catch (e) {
        console.warn('monterSceneExterne:', e);
        showToast('Scène externe : ' + e.message, 'error');
    }
}

function startSceneManifestPolling() {
    if (_scenePollTimer) clearInterval(_scenePollTimer);
    _scenePollTimer = startScenePolling({
        docApi: grist.docApi,
        getLayers: () => STATE.layers,
        getWidgetConfig: () => _widgetConfig,
        getManifest: () => _sceneManifest,
        intervalMs: CONFIG.pollIntervalMs,
        isPaused: () => _syncPaused || dirty || _storyPresenting,
        onLayerUpdated(layer) {
            if (!mapStyleUsable()) return;
            syncFeatureColorsFromSymbolization(layer, sequentialPaletteForSym(initSymbolization(layer).color, layer));
            if (_storyPresenting && STATE.story[_storyIdx]?.state) {
                const stepLayer = STATE.story[_storyIdx].state.layers?.find(
                    (x) => x.sourceTable === layer.sourceTable || x.id === layer.id || x.name === layer.name
                );
                if (stepLayer) {
                    applyStoryControlsToLayer(layer, stepLayer.controls || []);
                    syncStoryLayerToMap(layer);
                }
            } else {
                applyControls(layer);
                if (map.getSource(layer.id)) syncLayerSourceData(layer);
            }
            Models3D.scheduleBuild();
            updateLegend();
        },
    });
}
async function loadLayersFromGrist() {
    try {
        const rec = await grist.docApi.fetchTable('Maquette_Layers');
        const ids = rec.id || [];
        for (let i = 0; i < ids.length; i++) {
            let geojson, style;
            try { geojson = JSON.parse(rec.GeoJSON[i]); } catch (e) { continue; }
            try { style = JSON.parse(rec.StyleJSON[i]); } catch (e) { style = { mode: 'mapbox' }; }
            const ctrls = style?._controls;
            if (style) delete style._controls;
            const binding = style?._binding;
            if (style) delete style._binding;
            const layer = {
                id: 'layer-grist-' + ids[i], gristId: ids[i],
                name: rec.Name?.[i] || 'Sans nom', color: rec.Color?.[i] || '#C44536',
                visible: parseGristBool(rec.Visible?.[i], true), geometryType: rec.GeomType?.[i] || 'Point',
                source: 'grist', geojson, style, _modelCat: 'furniture',
                controls: ctrls || [],
            };
            if (binding?.kind === 'table') {
                layer.kind = 'table';
                layer.sourceTable = binding.sourceTable;
                layer.geometryColumn = binding.geometryColumn;
            }
            initSymbolization(layer);
            if (layer.controls?.length) applyControls(layer);
            STATE.layers.push(layer);
        }
        mountLoadedLayers(computeLayersBounds());
    } catch (e) { console.warn('loadLayers:', e.message); }
}
/** Vrai une fois `Maquette_Layers` connue presente, pour ne pas relister a chaque enregistrement. */
let _maquetteTablePrete = false;

/**
 * Garantit l'existence de `Maquette_Layers` avant d'y ecrire.
 *
 * `initGristTables` ne tourne QUE sur les documents en mode maquette : en mode
 * Scene Manifest, la scene vient du manifeste et la table n'est jamais creee.
 * Enregistrer une couche qui n'est pas issue de qgis2grist tentait donc un
 * `AddRecord` sur une table absente, et Grist repondait
 * « [Sandbox] KeyError 'Maquette_Layers' » — l'enregistrement echouait sans
 * qu'aucune retouche de l'utilisateur ne soit conservee.
 *
 * La table est creee A LA DEMANDE, au moment ou l'on enregistre vraiment : un
 * document qui n'enregistre aucune couche garde une empreinte nulle.
 */
async function ensureMaquetteLayersTable() {
    if (_maquetteTablePrete) return;
    const tables = await grist.docApi.listTables();
    if (!tables.includes('Maquette_Layers')) {
        await grist.docApi.applyUserActions([['AddTable', 'Maquette_Layers', TABLE_SCHEMAS.Maquette_Layers]]);
    }
    _maquetteTablePrete = true;
}

async function saveLayerToGrist(layer, silent) {
    if (!CONFIG.grist.ready) return;
    if (!assertCanWrite('enregistrer les préférences')) return;
    if (layer.source === 'qgis2grist') {
        try {
            await saveLayerPref(grist.docApi, layer, { viewMode: CONFIG.viewMode });
            if (!silent) showToast(`Préférences Atlas · ${layer.name}`, 'success');
            dirty = false;
            $('app-header')?.classList.remove('dirty');
        } catch (e) {
            enterViewModeOnWriteFail(e);
            if (!silent) showToast('Grist : ' + e.message, 'error');
        }
        return;
    }
    try {
        await ensureMaquetteLayersTable();
        const styleOut = { ...(layer.style || {}) };
        if (layer.controls?.length) styleOut._controls = layer.controls;
        if (layer.kind === 'table') {
            styleOut._binding = { kind: 'table', sourceTable: layer.sourceTable, geometryColumn: layer.geometryColumn };
        }
        const data = {
            Name: layer.name, Color: layer.color, Visible: layer.visible !== false,
            GeomType: layer.geometryType, StyleJSON: JSON.stringify(styleOut),
            GeoJSON: JSON.stringify(layer.geojson || {}),
        };
        if (layer.gristId) await grist.docApi.applyUserActions([['UpdateRecord', 'Maquette_Layers', layer.gristId, data]]);
        else { const r = await grist.docApi.applyUserActions([['AddRecord', 'Maquette_Layers', null, data]]); layer.gristId = r.retValues[0]; }
        if (!silent) showToast('Couche enregistrée dans Grist', 'success');
    } catch (e) { if (!silent) showToast('Grist : ' + e.message, 'error'); }
}

// ============================================================
// PROJECT SAVE / LOAD (JSON) + autosave
// ============================================================
function buildProject() {
    return {
        version: '2.2-atlas-binding',
        savedAt: new Date().toISOString(),
        projectName: STATE.projectName,
        location: STATE.location,
        story: STATE.story,
        storyManifest: storyToManifestFragment(STATE.story),
        settings: { ...STATE.settings, date: STATE.settings.date.toISOString() },
        layers: STATE.layers.map((l) => ({
            id: l.id, name: l.name, color: l.color, visible: l.visible,
            geometryType: l.geometryType, source: l.source, geojson: l.geojson,
            style: l.style, _modelCat: l._modelCat, kind: l.kind,
            sourceTable: l.sourceTable, geometryColumn: l.geometryColumn,
            controls: l.controls,
            declarative: declarativeFromAtlasLayer(l),
        })),
    };
}
function saveProject() {
    const json = JSON.stringify(buildProject(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `atlas_${(STATE.projectName || STATE.location.name || 'projet').replace(/[^a-z0-9]/gi, '_')}.json`; a.click();
    URL.revokeObjectURL(url);
    try { localStorage.setItem('atlas_autosave', json); } catch (e) {}
    showToast('Projet enregistré', 'success');
}
async function restoreProject(p) {
    STATE.layers.forEach((l) => removeLayerGfx(l));
    STATE.layers = [];
    if (p.projectName) { STATE.projectName = p.projectName; $('project-name').textContent = p.projectName; }
    if (p.location?.lat) { STATE.location = p.location; map.jumpTo({ center: [p.location.lng, p.location.lat] }); }
    if (p.settings) { Object.assign(STATE.settings, p.settings); STATE.settings.date = new Date(p.settings.date || Date.now()); MODEL_LIBRARY.set = STATE.settings.modelSet || 'colored'; }
    STATE.story = p.story || [];
    refreshStoryNavChrome();
    (p.layers || []).forEach((ld) => {
        const layer = { ...ld, visible: ld.visible !== false, controls: ld.controls || [] };
        initSymbolization(layer);
        STATE.layers.push(layer);
        addLayerToMap(layer);
        if (layer.controls?.length) applyControls(layer);
    });
    updateRailBadge(); Models3D.rebuildScene(); applyTerrain(); applyBuildingVisibility(); updateLighting();
    if (!CONFIG.viewMode) openModule('couches');
    else updateLegend();
    showToast(`Projet chargé · ${p.layers?.length || 0} couches`, 'success');
}
function loadProject() {
    const inp = $('project-input');
    inp.onchange = async (e) => { const file = e.target.files[0]; if (!file) return; try { await restoreProject(JSON.parse(await file.text())); } catch (err) { showToast('Erreur : ' + err.message, 'error'); } inp.value = ''; };
    inp.click();
}
function exportProject() {
    if (!STATE.layers.length) { showToast('Aucune couche à exporter', 'warning'); return; }
    // Une couche distante — ou de tuiles — n'a rien à exporter : ses entités
    // sont ailleurs. Un fichier vide est un export **réussi** jusqu'à ce qu'on
    // l'ouvre ; mieux vaut ne rien produire et dire pourquoi.
    const exportables = STATE.layers.filter((l) => l.geojson?.features?.length);
    const absentes = STATE.layers.filter((l) => !l.geojson?.features?.length);
    if (!exportables.length) {
        showToast(absentes.some((l) => l._distant)
            ? 'Rien à exporter : Atlas ne détient pas ces couches, seulement leurs adresses'
            : 'Rien à exporter : aucune couche ne porte d’entités', 'warning');
        return;
    }
    const combined = { type: 'FeatureCollection', features: exportables.flatMap((l) => l.geojson.features) };
    const blob = new Blob([JSON.stringify(combined, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'atlas_export.geojson'; a.click(); URL.revokeObjectURL(url);
    // Un export partiel qui se tait ressemble à un export complet.
    showToast(absentes.length
        ? `Export GeoJSON — ${exportables.length} couche(s) ; ${absentes.length} non détenue(s), absente(s) du fichier`
        : 'Export GeoJSON', absentes.length ? 'warning' : 'success');
}

// ============================================================
// GEOCODING (Nominatim — libre, sans clé)
// ============================================================
function searchLocation(q) {
    clearTimeout(searchTimer);
    const box = $('loc-results');
    if (q.length < 3) { box.classList.remove('open'); return; }
    searchTimer = setTimeout(async () => {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=fr&q=${encodeURIComponent(q)}`, { headers: { 'Accept': 'application/json' } });
            const data = await res.json();
            box.innerHTML = data.map((d) => `<div class="sr-item" onclick="A.pickSearch('${d.display_name.replace(/'/g, "\\'")}', ${d.lat}, ${d.lon})"><div class="sr-title">${(d.display_name || '').split(',')[0]}</div><div class="sr-sub">${d.display_name}</div></div>`).join('');
            box.classList.toggle('open', data.length > 0);
        } catch (e) { box.classList.remove('open'); }
    }, 350);
}

// ============================================================
// COMMAND PALETTE
// ============================================================
let cmdItems = [], cmdSel = 0;
function openCmd() {
    $('cmd-overlay').classList.add('open');
    $('cmd-input').value = ''; $('cmd-input').focus();
    buildCmdItems('');
}
function closeCmd() { $('cmd-overlay').classList.remove('open'); }
function buildCmdItems(q) {
    let base = [
        { label: 'Lieu', kind: 'module', run: () => openModule('lieu'), ic: icTrait(IC.epingle) },
        { label: 'Couches', kind: 'module', run: () => openModule('couches'), ic: icTrait(IC.dossier) },
        { label: 'Contrôles', kind: 'module', run: () => openModule('controles'), ic: icTrait(IC.controles) },
        { label: 'Récit', kind: 'module', run: () => openModule('recit'), ic: icTrait(IC.recit) },
        { label: 'Catalogue 3D / Réglages', kind: 'module', run: () => openModule('reglages'), ic: icTrait(IC.reglages) },
        { label: 'Soleil', kind: 'module', run: () => openModule('soleil'), ic: icTrait(IC.soleil) },
        { label: 'Vue & rendu', kind: 'module', run: () => openModule('vues'), ic: icTrait(IC.cube) },
        { label: 'Importer depuis OSM', kind: 'action', run: () => { openModule('couches'); openOSM(); }, ic: icTrait(IC.globe) },
        { label: 'Importer un fichier', kind: 'action', run: () => $('file-input').click(), ic: icTrait(IC.fichier) },
        { label: 'Enregistrer le projet', kind: 'action', run: saveProject, ic: icTrait(IC.enregistrer) },
        { label: 'Exporter en GeoJSON', kind: 'action', run: exportProject, ic: icTrait(IC.exporter) },
        { label: 'Réinitialiser la vue', kind: 'action', run: () => A.resetView(), ic: icTrait(IC.rafraichir) },
    ];
    if (CONFIG.viewMode) {
        const hasStory = (STATE.story?.length || 0) > 0;
        base = [
            ...(hasStory ? [
                { label: 'Lancer le récit', kind: 'action', run: () => A.storyPlay(0), ic: icTrait(IC.recit) },
                { label: 'Récit', kind: 'module', run: () => openModule('recit'), ic: icTrait(IC.recit) },
            ] : []),
            { label: 'Exporter en GeoJSON', kind: 'action', run: exportProject, ic: icTrait(IC.exporter) },
            { label: 'Réinitialiser la vue', kind: 'action', run: () => A.resetView(), ic: icTrait(IC.rafraichir) },
        ];
        STATE.layers.filter((l) => l.visible !== false).forEach((l) => base.push({
            label: `Cibler « ${l.name} »`,
            kind: 'couche',
            run: () => { _legendFocus = { layerId: l.id }; fitToLayer(l); updateLegend(); },
            ic: icTrait(IC.cube),
        }));
    } else {
        STATE.layers.forEach((l) => base.push({ label: l.name, kind: 'couche', run: () => { A.selectLayer(l.id); }, ic: '▢' }));
    }
    const ql = q.toLowerCase();
    cmdItems = base.filter((i) => i.label.toLowerCase().includes(ql));
    cmdSel = 0; renderCmd();
}
function renderCmd() {
    $('cmd-list').innerHTML = cmdItems.map((i, k) => `<div class="cmd-item ${k === cmdSel ? 'sel' : ''}" data-k="${k}"><span class="cmd-ic">${i.ic}</span><span>${i.label}</span><span class="cmd-kind">${i.kind}</span></div>`).join('') || '<div class="cmd-item">Aucun résultat</div>';
    $('cmd-list').querySelectorAll('.cmd-item[data-k]').forEach((el) => el.onclick = () => runCmd(+el.dataset.k));
}
function runCmd(k) { const it = cmdItems[k]; closeCmd(); if (it) it.run(); }

// ============================================================
// UTILS
// ============================================================
function randomColor() { const c = ['#C44536', '#2E4E54', '#5B7A4F', '#E8A234', '#8E5A37', '#6E5A40', '#4292C6', '#af7aa1']; return c[Math.floor(Math.random() * c.length)]; }
function showLoading(t) { $('loading-text').textContent = t || 'Chargement…'; $('loading').classList.add('show'); }
function hideLoading() { $('loading').classList.remove('show'); }
function showToast(msg, type = 'success') {
    const ic = { success: '✅', warning: '⚠️', error: '❌', info: 'ℹ️' };
    const el = document.createElement('div'); el.className = 'toast ' + type;
    el.innerHTML = `<span>${ic[type] || ''}</span><span>${msg}</span>`;
    $('toasts').appendChild(el); setTimeout(() => el.remove(), 4000);
}
function updateRailBadge() {
    const b = $('rail-couches-badge'); const n = STATE.layers.length;
    b.style.display = n ? 'block' : 'none'; b.textContent = n;
}

// ============================================================
// GLOBAL HANDLER NAMESPACE (inline onclick → A.xxx)
// ============================================================
const A = {
    openModule, exitSelectionMode,

    // Lieu
    recenter() { if (map) map.flyTo({ center: [STATE.location.lng, STATE.location.lat], zoom: 16, pitch: 55, duration: 1200 }); },
    searchLocation,
    pickSearch(name, lat, lng) {
        STATE.location = { ...STATE.location, name, lat: +lat, lng: +lng };
        $('loc-results').classList.remove('open');
        $('project-name').textContent = STATE.projectName || name.split(',')[0];
        map.flyTo({ center: [+lng, +lat], zoom: 16, duration: 1200 });
        markDirty(); renderLieu();
    },
    pickOnMap() {
        locationPickMode = true;
        if (map) map.getCanvas().style.cursor = 'crosshair';
        showToast('Cliquez sur la carte pour définir le lieu (Échap pour annuler)', 'info');
    },
    useGeolocation() {
        if (!navigator.geolocation) { showToast('Géolocalisation non supportée', 'error'); return; }
        showLoading('Localisation…');
        navigator.geolocation.getCurrentPosition((pos) => {
            hideLoading();
            STATE.location = { ...STATE.location, name: 'Ma position', lat: pos.coords.latitude, lng: pos.coords.longitude };
            map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16, duration: 1200 });
            renderLieu(); showToast('Position détectée', 'success');
        }, () => { hideLoading(); showToast('Géolocalisation refusée', 'warning'); }, { timeout: 10000 });
    },
    applyManualCoords() {
        const lat = parseFloat($('loc-lat').value), lng = parseFloat($('loc-lng').value);
        if (isNaN(lat) || isNaN(lng)) { showToast('Coordonnées invalides', 'warning'); return; }
        STATE.location = { ...STATE.location, lat, lng, name: `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E` };
        map.flyTo({ center: [lng, lat], zoom: 16, duration: 1000 }); renderLieu();
    },
    setProjectName(v) { STATE.projectName = v; $('project-name').textContent = v || 'Nouveau projet'; markDirty(); },

    // Couches
    openOSM, runOSM,
    selectLayer(id) {
        if (CONFIG.viewMode) {
            A.zoomLayer(id);
            return;
        }
        inspectorUserClosed = false;
        STATE.selectedLayer = id;
        const layer = STATE.layers.find((l) => l.id === id);
        if (layer) layer._modelCat = layer._modelCat || 'furniture';
        if (STATE.currentModule !== 'couches') openModule('couches');
        else { renderLayersPanel('couches'); renderInspector(); }
    },
    openLinkTable: async function openLinkTable() {
        if (!CONFIG.grist.ready) { showToast('Disponible seulement dans Grist', 'warning'); return; }
        showLoading('Recherche des tables géo…');
        _linkChoices = await scanGeoTables(grist.docApi);
        hideLoading();
        const body = $('module-body');
        const back = `<div class="section"><button class="btn btn-soft btn-full" onclick="A.openModule('couches')">← Retour</button></div>`;
        if (!_linkChoices.length) {
            body.innerHTML = `<div class="empty"><div class="ic">${icTrait(IC.loupe, 40)}</div><div class="t">Aucune table géo trouvée</div><div class="h">Importez d'abord via QGIS → Grist</div></div>${back}`;
            return;
        }
        const already = new Set(STATE.layers.filter((l) => l.sourceTable).map((l) => l.sourceTable));
        body.innerHTML = `<div class="section-title">Tables géo détectées</div><div class="layer-list">${_linkChoices.map((g, i) => `
            <div class="layer-item" onclick="A.linkTableChoice(${i})">
                <div class="layer-info"><div class="layer-name">${g.table}${already.has(g.table) ? ' ✓' : ''}</div>
                <div class="layer-meta">${geoTableMeta(g)}</div></div>
                <button class="layer-act" title="Lier comme couche">${icTrait(IC.lien)}</button>
            </div>`).join('')}</div>${back}`;
    },
    linkTableChoice(i) { const g = _linkChoices[i]; if (g) linkTableFromGrist(g.table, g.geometryColumn, g._data); },
    showGeoTable(t) {
        const g = _geoTables.find((x) => x.table === t);
        if (g) linkTableFromGrist(g.table, g.geometryColumn, g._data);
        else linkTableFromGrist(t);
    },
    async refreshLayer(id, e) {
        if (e) e.stopPropagation();
        const l = STATE.layers.find((x) => x.id === id);
        if (!l || !isLinkedTableLayer(l)) return;
        showLoading('Rafraîchissement…');
        try {
            let n;
            if (l.source === 'qgis2grist') {
                const ml = (_sceneManifest?.layers || []).find((x) => (x.source?.table || x.id) === l.sourceTable);
                await refreshLayerFromTable(grist.docApi, l, _widgetConfig, ml);
                syncFeatureColorsFromSymbolization(l);
                applyControls(l);
                syncLayerSourceData(l);
                Models3D.scheduleBuild();
                n = l.geojson?.features?.length || 0;
            } else {
                n = await reloadGenericTableLayer(l, true);
            }
            hideLoading();
            showToast(`Rafraîchie · ${n} objets`, 'success');
            if (STATE.currentModule === 'couches') renderLayersPanel('couches');
        } catch (e2) {
            hideLoading();
            showToast('Erreur : ' + e2.message, 'error');
        }
    },
    controlLayer(id) { STATE.selectedLayer = id; renderControles(); },
    setViewerExposed(id, on) {
        if (!assertCanWrite('modifier les contrôles scène')) return;
        setViewerExposedFn(STATE.viewerControls, id, !!on);
        persistScenePrefs();
        refreshControlsDock();
        if (STATE.currentModule === 'controles') renderControles();
    },
    setViewerShadows(on) {
        if (!assertCanWrite('modifier les contrôles scène')) return;
        const vc = getViewerControl(STATE.viewerControls, 'sun');
        if (!vc) return;
        vc.config = { ...vc.config, shadows: !!on };
        if (STATE.settings) STATE.settings.shadows = !!on;
        updateLighting();
        persistScenePrefs();
        if (STATE.currentModule === 'controles') renderControles();
    },
    toggleViewerBasemapAllowed(key) {
        if (!assertCanWrite('modifier les contrôles scène')) return;
        const vc = getViewerControl(STATE.viewerControls, 'basemap');
        if (!vc) return;
        const allowed = [...(vc.config?.allowed || [])];
        const i = allowed.indexOf(key);
        if (i >= 0) allowed.splice(i, 1);
        else {
            if (allowed.length >= 3) {
                showToast('Maximum 3 fonds autorisés', 'warning');
                return;
            }
            allowed.push(key);
        }
        vc.config = { ...vc.config, allowed };
        persistScenePrefs();
        refreshControlsDock();
        if (STATE.currentModule === 'controles') renderControles();
    },
    setControlLabel(layerId, field, label) {
        if (CONFIG.viewMode) return;
        const l = STATE.layers.find((x) => x.id === layerId);
        if (!l) return;
        const c = (l.controls || []).find((x) => x.field === field);
        if (!c) return;
        c.label = String(label || field).trim() || field;
        markDirty();
        if (l.source === 'qgis2grist' && CONFIG.grist.ready) {
            saveLayerPref(grist.docApi, l, { viewMode: CONFIG.viewMode }).catch(() => {});
        }
    },
    toggleControl(id, field, type) {
        if (CONFIG.viewMode) {
            showToast('Mode lecture — activation des contrôles réservée à l’éditeur', 'warning');
            return;
        }
        const l = STATE.layers.find((x) => x.id === id);
        if (!l) return;
        l.controls = l.controls || [];
        let c = l.controls.find((x) => x.field === field);
        if (!c) {
            c = { field, type };
            Object.assign(c, controlBounds(l, type, field));
            c.variant = defaultControlVariant(type);
            if (type !== 'select') { c.min = c.dataMin; c.max = c.dataMax; }
            l.controls.push(c);
        }
        ensureControlVariant(c, type);
        c.active = !c.active;
        if (c.active && c.type === 'select' && !c._selectionTouched && !Array.isArray(c.values)) {
            c.values = controlUniqueValues(l, c.field, 40).map((v) => v.value);
        }
        applyControls(l);
        renderControles();
        refreshControlsDock();
        markDirty();
        if (l.source === 'qgis2grist' && CONFIG.grist.ready) {
            saveLayerPref(grist.docApi, l, { viewMode: CONFIG.viewMode }).catch(() => {});
        }
    },
    setControlBound(id, field, which, v) {
        const l = STATE.layers.find((x) => x.id === id);
        if (!l) return;
        const c = (l.controls || []).find((x) => x.field === field);
        if (!c) return;
        c[which] = +v;
        if (c.min > c.max) { if (which === 'min') c.max = c.min; else c.min = c.max; }
        const el = $(`ctl-${field}-${which === 'min' ? 'lo' : 'hi'}`);
        if (el) el.textContent = fmtControlValue(c, c[which]);
        clearTimeout(this._ctlT);
        this._ctlT = setTimeout(() => applyControls(l), 80);
        markDirty();
    },
    setControlMin(id, field, v) {
        const l = STATE.layers.find((x) => x.id === id);
        if (!l) return;
        const c = (l.controls || []).find((x) => x.field === field);
        if (!c) return;
        c.min = +v;
        const el = $(`ctl-${field}-v`);
        if (el) el.textContent = fmtControlValue(c, c.min);
        clearTimeout(this._ctlT);
        this._ctlT = setTimeout(() => applyControls(l), 80);
        markDirty();
    },
    setControlMax(id, field, v) {
        const l = STATE.layers.find((x) => x.id === id);
        if (!l) return;
        const c = (l.controls || []).find((x) => x.field === field);
        if (!c) return;
        c.max = +v;
        const el = $(`ctl-${field}-v`);
        if (el) el.textContent = fmtControlValue(c, c.max);
        clearTimeout(this._ctlT);
        this._ctlT = setTimeout(() => applyControls(l), 80);
        markDirty();
    },
    setControlVariant(id, field, variant) {
        if (CONFIG.viewMode) return;
        const l = STATE.layers.find((x) => x.id === id);
        if (!l) return;
        const c = (l.controls || []).find((x) => x.field === field);
        if (!c) return;
        c.variant = variant;
        ensureControlVariant(c, c.type);
        if (c.type === 'select' && c.variant === 'select_single' && Array.isArray(c.values) && c.values.length > 1) {
            c.values = [c.values[0]];
            c._selectionTouched = true;
        }
        applyControls(l);
        renderControles();
        refreshControlsDock();
        markDirty();
        if (l.source === 'qgis2grist' && CONFIG.grist.ready) {
            saveLayerPref(grist.docApi, l, { viewMode: CONFIG.viewMode }).catch(() => {});
        }
    },
    toggleControlValue(id, field, value) {
        const l = STATE.layers.find((x) => x.id === id);
        if (!l) return;
        const c = (l.controls || []).find((x) => x.field === field);
        if (!c) return;
        c.values = c.values || [];
        ensureControlVariant(c, c.type);
        const norm = String(value).toLowerCase();
        const i = c.values.findIndex((v) => String(v).toLowerCase() === norm);
        if (c.variant === 'select_single') {
            if (i >= 0) c.values = [];
            else c.values = [value];
        } else {
            if (i >= 0) c.values.splice(i, 1);
            else c.values.push(value);
        }
        c._selectionTouched = true;
        applyControls(l);
        markDirty();
        if (l.source === 'qgis2grist' && CONFIG.grist.ready) {
            saveLayerPref(grist.docApi, l, { viewMode: CONFIG.viewMode }).catch(() => {});
        }
    },
    playTime(id, field) {
        const l = STATE.layers.find((x) => x.id === id);
        if (!l) return;
        const c = (l.controls || []).find((x) => x.field === field);
        if (!c || c.type !== 'time') return;
        ensureControlVariant(c, c.type);
        if (this._playT) { clearInterval(this._playT); this._playT = null; return; }
        if (c.variant === 'time_between') {
            c.min = c.dataMin;
            c.max = c.dataMin;
        } else {
            c.max = c.dataMin;
        }
        const steps = 60;
        const inc = (c.dataMax - c.dataMin) / steps;
        this._playT = setInterval(() => {
            if (c.variant === 'time_between') {
                const span = Math.max(inc * 6, (c.dataMax - c.dataMin) * 0.08);
                c.max += inc;
                c.min = Math.max(c.dataMin, c.max - span);
            } else {
                c.max += inc;
            }
            if (c.max >= c.dataMax) { c.max = c.dataMax; clearInterval(this._playT); this._playT = null; }
            applyControls(l);
            const vEl = $(`ctl-${field}-v`);
            if (vEl) vEl.textContent = fmtControlValue(c, c.max);
            const loEl = $(`ctl-${field}-lo`);
            const hiEl = $(`ctl-${field}-hi`);
            if (loEl) loEl.textContent = fmtControlValue(c, c.min);
            if (hiEl) hiEl.textContent = fmtControlValue(c, c.max);
        }, 66);
    },
    storyCapture() {
        if (!assertCanWrite('capturer le récit')) return;
        STATE.story.push({
            title: 'Étape ' + (STATE.story.length + 1),
            text: '',
            state: captureStoryState(map, STATE),
        });
        markDirty();
        persistStory(true);
        renderRecit();
        showToast('Étape capturée', 'success');
    },
    storyRecapture(i) {
        if (!assertCanWrite('re-capturer le récit')) return;
        if (STATE.story[i]) {
            STATE.story[i].state = captureStoryState(map, STATE);
            markDirty();
            persistStory(true);
            showToast('Vue mise à jour', 'success');
        }
    },
    storySet(i, k, v) {
        if (!assertCanWrite('modifier le récit')) return;
        if (STATE.story[i]) { STATE.story[i][k] = v; markDirty(); persistStory(); }
    },
    storyMove(i, d) {
        if (!assertCanWrite('réordonner le récit')) return;
        const j = i + d;
        if (j < 0 || j >= STATE.story.length) return;
        [STATE.story[i], STATE.story[j]] = [STATE.story[j], STATE.story[i]];
        markDirty();
        persistStory();
        renderRecit();
    },
    storyDelete(i) {
        if (!assertCanWrite('supprimer une étape')) return;
        STATE.story.splice(i, 1);
        markDirty();
        persistStory();
        renderRecit();
    },
    storyPlay(i) { enterStoryPresentation(i); },
    storyStep(d) {
        _storyIdx = Math.max(0, Math.min(_storyIdx + d, STATE.story.length - 1));
        renderStoryPresentation();
        applyStoryState(cloneStoryState(STATE.story[_storyIdx].state));
    },
    storyExit() {
        _storyPresenting = false;
        document.body.classList.remove('story-presenting');
        const ov = document.getElementById('story-present');
        if (ov) ov.remove();
        // Rend la scène telle qu'elle était avant la présentation : visibilité,
        // filtres, symbolisation et ambiance. Sans cela on sort du récit sur
        // l'état de la dernière étape.
        const basemapSwitching = restorePreStorySnapshot();
        if (!basemapSwitching) {
            remountAllLayers();
            updateLegend();
        }
        refreshControlsDock();
        if (STATE.currentModule === 'couches' || STATE.currentModule === 'symbo') {
            renderLayersPanel(STATE.currentModule);
        }
    },
    /**
     * Déplace une couche d'un cran dans la pile.
     * `direction` est visuelle : 'up' = passer au-dessus.
     */
    moveLayerRank(id, direction, e) {
        e?.stopPropagation?.();
        if (CONFIG.viewMode) {
            showToast('Mode lecture — ordre figé par l’éditeur', 'warning');
            return;
        }
        const avant = STATE.layers.map((l) => l.id).join('|');
        STATE.layers = moveLayerInStack(STATE.layers, id, direction);
        if (STATE.layers.map((l) => l.id).join('|') === avant) return; // borne
        applyLayerOrder();
        updateLegend();
        refreshLayersPanelIfOpen();
        // Enregistrer TOUS les rangs, pas seulement les deux couches échangées :
        // un rang partiel se relit mal, les couches sans rang étant reléguées
        // après celles qui en ont — donc au-dessus, ce qui inverserait la scène.
        STATE.layers.forEach((l, k) => {
            l._rank = k;
            saveLayerPrefIfSynced(l);
        });
    },

    toggleLayer(id, e) {
        if (CONFIG.viewMode) {
            e?.stopPropagation?.();
            showToast('Mode lecture — visibilité figée par l’éditeur', 'warning');
            return;
        }
        e.stopPropagation();
        const l = STATE.layers.find((x) => x.id === id);
        if (!l) return;
        l.visible = l.visible === false ? true : false;
        if (l.visible && l._deferredLoad) {
            showToast('Chargement bâtiments…', 'warning');
            materializeDeferredLayer(l, DEFERRED_OPTS);
            if (map?.getSource(l.id)) syncLayerSourceData(l);
            else if (typeof addLayerToMap === 'function') addLayerToMap(l);
        }
        syncLayerToMapState(l);
        updateLegend();
        if (l.source === 'qgis2grist' && CONFIG.grist.ready) {
            saveLayerPref(grist.docApi, l, { viewMode: CONFIG.viewMode }).catch(() => {});
        }
        renderLayersPanel(STATE.currentModule);
    },
    toggleAllLayers(v) {
        if (CONFIG.viewMode) {
            showToast('Mode lecture — visibilité figée par l’éditeur', 'warning');
            return;
        }
        STATE.layers.forEach((l) => {
            l.visible = v;
            if (v && l._deferredLoad) materializeDeferredLayer(l, DEFERRED_OPTS);
        });
        syncAllLayersToMap();
        updateLegend();
        if (CONFIG.grist.ready) {
            STATE.layers.filter((l) => l.source === 'qgis2grist').forEach((l) => {
                saveLayerPref(grist.docApi, l, { viewMode: CONFIG.viewMode }).catch(() => {});
            });
        }
        renderLayersPanel(STATE.currentModule);
    },
    zoomLayer(id, e) {
        if (e) e.stopPropagation();
        const l = STATE.layers.find((x) => x.id === id);
        // « Couche vide » était dit d'une couche distante, qui ne l'est pas :
        // ses entités sont ailleurs, pas absentes. Le message envoyait chercher
        // une donnée manquante au lieu d'une emprise non déclarée. On ne décide
        // qu'après avoir essayé — `fitToLayer` sait aussi cadrer sur la `bbox`
        // du manifeste.
        if (!l) return;
        if (!l.geojson?.features?.length && !l._distant) {
            showToast('Couche vide', 'warning');
            return;
        }
        if (l.visible === false) {
            l.visible = true;
            syncLayerToMapState(l);
        }
        // Annoncer un zoom qui n'a pas eu lieu serait pire que se taire : on
        // chercherait ce qui empêche de voir la couche là où elle n'est pas.
        if (fitToLayer(l)) {
            showToast(`Zoom sur « ${l.name} »`, 'info');
        } else {
            showToast(`« ${l.name} » : pas d'emprise connue — le manifeste ne déclare pas de bbox`,
                'warning');
        }
    },
    deleteLayer(id, e) {
        e.stopPropagation();
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        if (!confirm(`Supprimer la couche « ${l.name} » ?`)) return;
        removeLayerGfx(l);
        if (CONFIG.grist.ready && l.gristId) grist.docApi.applyUserActions([['RemoveRecord', 'Maquette_Layers', l.gristId]]).catch(() => {});
        STATE.layers = STATE.layers.filter((x) => x.id !== id);
        if (STATE.selectedLayer === id) STATE.selectedLayer = null;
        updateRailBadge(); Models3D.rebuildScene(); renderLayersPanel(STATE.currentModule); renderInspector(); updateLegend();
        showToast('Couche supprimée', 'success');
    },
    saveLayer(id) { const l = STATE.layers.find((x) => x.id === id); if (l) saveLayerToGrist(l); markDirty(); },

    // Modèles
    setModelCat(id, cat) { const l = STATE.layers.find((x) => x.id === id); if (l) { l._modelCat = cat; renderInspector(); } },
    // Représentation de la couche : 'mapbox' (cercle 2D) ou 'library' (modèle 3D)
    setRepresentation(id, mode) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        l.style.mode = mode;
        if (mode === 'library' && !l.style.library?.modelId) {
            // Une couche peut porter une categorie que la bibliotheque ne connait
            // pas — `scene-loader` pose « landmark » pour une couche a modele
            // venue d'un manifeste. Sans ce repli, `.models[0]` leve sur undefined
            // et l'interface tombe au clic. La meme garde existe deja cote
            // inspecteur (`symModelPanel`) : elle manquait ici seulement.
            const catRaw = l._modelCat || 'lighting';
            const cat = MODEL_LIBRARY.categories[catRaw] ? catRaw : 'lighting';
            if (cat !== catRaw) l._modelCat = cat;
            const first = MODEL_LIBRARY.categories[cat].models[0];
            l.style.library = { modelId: first.id };
            l.style.common = { ...(l.style.common || {}), scale: first.scale || 1 };
        }
        applyPointStyle(l); Models3D.forceBuild(); renderInspector(); markDirty();
    },
    openLayerModel(id) { STATE.selectedLayer = id; inspSymTab = 'Modèle 3D'; openModule('couches'); },
    editLayerObjects(id) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        enterSelectionMode(id);
        // L'astuce du geste dépend du matériel : l'annoncer au doigt évite de
        // chercher une touche Maj qui n'existe pas.
        const zone = matchMedia?.('(pointer: coarse)')?.matches ? 'Appui long = zone' : 'Maj+glisser = zone';
        showToast(`Cliquez un objet à éditer · ${zone} · ✓ Tout = toute la couche`, 'info');
    },
    setModelSet(set) {
        MODEL_LIBRARY.set = set; STATE.settings.modelSet = set;
        Models3D.gltfCache.clear(); Models3D.protoCache.clear(); // recharger les GLB du nouveau set
        Models3D.forceBuild(); renderModelsPanel(); markDirty();
    },
    setModelBase(url) {
        url = (url || '').trim().replace(/\/+$/, '') + '/';
        MODEL_LIBRARY.baseRoot = url; MODEL_BASE_EXPLICIT = true;
        try { localStorage.setItem('atlas_model_base', url); } catch (e) {}
        Models3D.gltfCache.clear(); Models3D.protoCache.clear(); Models3D.forceBuild();
        renderModelsPanel(); showToast('Source modèles définie', 'success');
    },
    async testModelBase() {
        const base = ((document.getElementById('model-src-input')?.value || MODEL_LIBRARY.baseRoot).trim().replace(/\/+$/, '')) + '/';
        const el = document.getElementById('model-src-info');
        if (el) { el.textContent = '… test ' + base; el.style.color = 'var(--muted)'; }
        try {
            const r = await fetch(base + 'catalog.json', { cache: 'no-store' });
            if (r.ok) { const c = await r.json(); if (el) { el.textContent = `✅ OK — ${c.models?.length || 0} modèles · ${base}`; el.style.color = 'var(--green)'; } }
            else if (el) { el.textContent = `❌ HTTP ${r.status} · ${base}`; el.style.color = 'var(--accent)'; }
        } catch (e) { if (el) { el.textContent = `❌ ${e.message} · ${base}`; el.style.color = 'var(--accent)'; } }
    },
    pickModel(id, modelId) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        l.style.mode = 'library'; l.style.library = { modelId };
        // remplace réellement : repasse en modèle unique et purge le mode catégorisé
        // + les overrides _modelId par objet (sinon d'anciens modèles « restent »)
        const sym = initSymbolization(l);
        sym.model.mode = 'single'; sym.model.field = null; sym.model.categories = []; sym.model.defaultModelId = null;
        (l.geojson?.features || []).forEach((f) => { if (f.properties) delete f.properties._modelId; });
        const m = findModel(modelId);
        l.style.common = { ...(l.style.common || {}), scale: m?.scale || 1, rotationX: 0, rotationY: 0, rotationZ: 0, offsetX: 0, offsetY: 0, offsetZ: 0 };
        applyLayerStyle(l); Models3D.forceBuild(); renderInspector(); markDirty();
        showToast(`Modèle « ${m?.name} » appliqué`, 'success');
    },

    // Soleil
    timePreset(p) {
        const c = map.getCenter();
        let min = 720;
        if (typeof SunCalc !== 'undefined') {
            try {
                const t = SunCalc.getTimes(STATE.settings.date, c.lat, c.lng);
                const mm = (d) => d && !isNaN(d.getTime()) ? d.getHours() * 60 + d.getMinutes() : 720;
                if (p === 'dawn') min = mm(t.sunrise);
                else if (p === 'day') min = mm(t.solarNoon);
                else if (p === 'dusk') min = mm(t.sunset);
                else min = (mm(t.sunset) + 90) % 1440;
            } catch (e) {}
        } else min = { dawn: 390, day: 750, dusk: 1110, night: 1380 }[p];
        STATE.settings.timeOfDay = min; updateLighting(); renderSoleil();
    },
    setTime(v) { STATE.settings.timeOfDay = +v; updateLighting(); const h = Math.floor(v / 60), m = v % 60; const el = document.querySelector('#module-body .val'); if (el && STATE.currentModule === 'soleil') el.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; persistScenePrefsDifferee(); },
    setSunDate(v) { STATE.settings.date = new Date(v + 'T12:00:00'); updateLighting(); renderSoleil(); },
    toggleSetting(key) {
        STATE.settings[key] = !STATE.settings[key];
        if (key === 'buildings3D') applyBuildingVisibility();
        else if (key === 'terrain3D') { applyTerrain(); _palierDemCale = null; recalerRelief(); }
        else if (key === 'labels') applyLabelsVisibility();
        else if (key === 'sky') applySky();
        else if (key === 'shadows') {
            updateLighting();
            Models3D.scheduleBuild();
            $('shadow-toggle')?.classList.toggle('on', STATE.settings.shadows);
        }
        if (STATE.currentModule === 'vues') renderVues(); else if (STATE.currentModule === 'soleil') renderSoleil();
        persistScenePrefsDifferee();
    },

    // Vue
    viewPreset(p) {
        const presets = { top: { pitch: 0, bearing: 0, zoom: 17 }, '3d': { pitch: 55, bearing: -18, zoom: 16 }, street: { pitch: 78, bearing: 0, zoom: 18 } };
        map.easeTo({ ...presets[p], duration: 1000 });
    },
    setPitch(v) { map.setPitch(+v); $('v-pitch').textContent = Math.round(v) + '°'; },
    setBearing(v) { map.setBearing(+v); $('v-bearing').textContent = Math.round(v) + '°'; },
    setExag(v) { STATE.settings.terrainExaggeration = +v; $('v-exag').textContent = v + '×'; if (STATE.settings.terrain3D) { applyTerrain(); recalerRelief(200); } persistScenePrefsDifferee(); },
    setBasemap(k) {
        if (CONFIG.viewMode) {
            const allowed = basemapChoicesForDock();
            if (!allowed.includes(k)) {
                showToast('Fond non autorisé en lecture', 'warning');
                return;
            }
        }
        STATE.settings.basemap = k; renderVues();
        const b = BASEMAPS[k];
        _styleUsable = false; // le style est remplacé : plus rien à monter d'ici là
        map.setStyle(b.style ? b.style() : b.url);
        map.once('idle', onStyleReady);
        refreshControlsDock();
        // Le fond est le réglage qu'on remarque le plus en revenant sur un
        // document : le retrouver au défaut donne l'impression que rien n'a
        // été gardé, même quand tout le reste l'a été.
        persistScenePrefsDifferee(200);
    },
    setView3d(on) {
        if (!map) return;
        map.easeTo({ pitch: on ? 55 : 0, duration: 600 });
    },
    setTerrainSource(src) { setTerrainSource(src); renderVues(); },
    setProjection(p) { STATE.settings.projection = p; applyProjection(); renderVues(); },
    resetView() { map.easeTo({ center: [STATE.location.lng, STATE.location.lat], zoom: 16, pitch: 55, bearing: -18, duration: 1000 }); },
    debugShowExtrusionCasters(on = true) {
        for (const mesh of Models3D.extrusionShadows || []) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach((m) => {
                if (!m) return;
                m.colorWrite = !!on;
                if (on) {
                    m.color?.set?.(0xff00ff);
                    m.emissive?.set?.(0xaa00aa);
                    m.opacity = 0.4;
                    m.transparent = true;
                    m.depthTest = false;
                } else {
                    m.color?.set?.(0x111111);
                    m.emissive?.set?.(0x000000);
                    m.opacity = 1;
                    m.transparent = false;
                    m.depthTest = true;
                }
                m.needsUpdate = true;
            });
            mesh.visible = true;
            mesh.frustumCulled = false;
        }
        map?.triggerRepaint?.();
        return { n: Models3D.extrusionShadows?.length || 0, isIM: !!Models3D.extrusionShadows?.[0]?.isInstancedMesh };
    },

    /**
     * Protocole navigateur : isole le bâti (sans GLB), ombres on/off.
     * Usage : await A.validateBatiShadows()
     */
    async validateBatiShadows() {
        if (!map || !Models3D.scene) return { ok: false, err: 'map/scene absents' };
        const bati = STATE.layers.find((l) => /bati/i.test(l.id) || /bati/i.test(l.name));
        if (!bati) return { ok: false, err: 'pas de couche bâti' };

        // Figé lecture : on force quand même pour le test runtime
        bati.visible = true;
        bati.style = bati.style || {};
        bati.style.polygonMode = 'extruded';
        STATE.settings.shadows = true;
        STATE.settings.terrain3D = false;

        // Masquer tous les GLB (instances three.js)
        for (const [, g] of Models3D.groups || []) {
            (g.meshes || []).forEach(({ im }) => { if (im) im.visible = false; });
            (g.roots || []).forEach((r) => { if (r) r.visible = false; });
        }
        // Masquer les autres couches MapLibre sauf bâti (visibilité source)
        for (const l of STATE.layers) {
            if (l === bati) continue;
            try { applyMapLayerVisibility(l, false); } catch (_) {}
        }
        try { applyMapLayerVisibility(bati, true); applyLayerStyle(bati); } catch (_) {}

        // Vue rue dense près Charité, sans plonger dans le GLB
        map.jumpTo({
            center: [5.3682, 43.3008],
            zoom: 17.4,
            pitch: 58,
            bearing: -35,
        });
        await new Promise((r) => setTimeout(r, 200));
        Models3D.forceBuild();
        await new Promise((r) => setTimeout(r, 1200));
        // GLB peut revenir au rebuild — re-masquer
        for (const [, g] of Models3D.groups || []) {
            (g.meshes || []).forEach(({ im }) => { if (im) im.visible = false; });
            (g.roots || []).forEach((r) => { if (r) r.visible = false; });
        }
        map.triggerRepaint();
        await new Promise((r) => setTimeout(r, 400));

        const withShadows = Models3D.extrusionShadows?.length || 0;
        const candidates = Models3D.collectExtrusionsForShadow?.()?.length || 0;

        // Phase A : ombres ON, casters invisibles
        this.debugShowExtrusionCasters(false);
        STATE.settings.shadows = true;
        if (Models3D.renderer) Models3D.renderer.shadowMap.enabled = true;
        map.triggerRepaint();
        await new Promise((r) => setTimeout(r, 500));

        // Phase B data (l’appelant fait les screenshots entre les appels)
        return {
            ok: true,
            phase: 'shadows-on',
            withShadows,
            candidates,
            gltfHidden: [...(Models3D.groups?.values?.() || [])].every((g) =>
                (g.meshes || []).every(({ im }) => im && im.visible === false)),
            shadows: STATE.settings.shadows,
            zoom: map.getZoom(),
            center: map.getCenter()?.toArray?.(),
        };
    },

    async validateBatiShadowsOff() {
        STATE.settings.shadows = false;
        if (Models3D.renderer) Models3D.renderer.shadowMap.enabled = false;
        if (Models3D.groundShadow) Models3D.groundShadow.visible = false;
        map?.triggerRepaint?.();
        await new Promise((r) => setTimeout(r, 500));
        return { phase: 'shadows-off', shadows: false };
    },

    async validateBatiShadowsCastersVisible() {
        STATE.settings.shadows = true;
        if (Models3D.renderer) Models3D.renderer.shadowMap.enabled = true;
        if (Models3D.groundShadow) Models3D.groundShadow.visible = true;
        const r = this.debugShowExtrusionCasters(true);
        await new Promise((r2) => setTimeout(r2, 400));
        return { phase: 'casters-visible', ...r };
    },
    debugModels3D() {
        const extrusions = Models3D.collectExtrusionsForShadow?.() || [];
        const bati = STATE.layers.find((l) => /bati/i.test(l.id) || /bati/i.test(l.name));
        let queryN = null, queryErr = null, geoType = bati ? typeof bati.geojson : null;
        let queryNear80 = 0, querySample = [];
        if (bati && map) {
            try {
                const feats = map.querySourceFeatures(bati.id) || [];
                queryN = feats.length;
                for (const f of feats) {
                    const c = featureCentroidLngLat(f);
                    if (!c) continue;
                    const lm = Models3D.localMeters(c[0], c[1]);
                    const d = Math.hypot(lm.x, lm.y);
                    if (d < 80) queryNear80++;
                    if (querySample.length < 5) {
                        querySample.push({
                            d: Math.round(d),
                            h: featureExtrusionHeightM(f, bati),
                            t: f.geometry?.type,
                        });
                    }
                }
                // also sample by sorting all
                const scored = [];
                for (const f of feats) {
                    const c = featureCentroidLngLat(f);
                    if (!c) continue;
                    const lm = Models3D.localMeters(c[0], c[1]);
                    scored.push(Math.hypot(lm.x, lm.y));
                }
                scored.sort((a, b) => a - b);
                querySample = { nearest5: scored.slice(0, 5).map((d) => Math.round(d)), near80: queryNear80, n: queryN };
            } catch (e) { queryErr = e.message; }
        }
        return {
            shadowFeasible: Models3D._shadowFeasible,
            extrusionMeshes: Models3D.extrusionShadows?.length || 0,
            extrusionInstances: Models3D.extrusionShadows?.reduce((n, m) => n + (m.count || 0), 0) || 0,
            firstMatrix: (() => {
                const im = Models3D.extrusionShadows?.[0];
                if (!im?.instanceMatrix) return null;
                const m = new THREE.Matrix4();
                im.getMatrixAt(0, m);
                return Array.from(m.elements);
            })(),
            matColorWrite: Models3D.extrusionShadows?.[0]?.material?.colorWrite,
            matEmissive: Models3D.extrusionShadows?.[0]?.material?.emissive?.getHexString?.(),
            extrusionCandidates: extrusions.length,
            near80: extrusions.filter((e) => {
                const lm = Models3D.localMeters(e.lng, e.lat);
                return Math.hypot(lm.x, lm.y) < 80;
            }).length,
            nearestM: extrusions[0] ? Math.hypot(
                Models3D.localMeters(extrusions[0].lng, extrusions[0].lat).x,
                Models3D.localMeters(extrusions[0].lng, extrusions[0].lat).y,
            ) : null,
            querySample,
            shadows: STATE.settings.shadows,
            terrain3D: STATE.settings.terrain3D,
            zoom: map?.getZoom?.(),
            bati: bati ? {
                id: bati.id,
                geoType,
                poly: bati.style?.polygonMode,
                geomType: bati.geometryType,
                queryErr,
                hasSource: !!map?.getSource?.(bati.id),
            } : null,
        };
    },

    // Symbology
    setSymTab(t) { inspSymTab = t; renderInspector(); },
    setSymMode(id, param, mode) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const sym = initSymbolization(l); sym[param].mode = mode;
        if (param === 'color' && mode === 'single' && !sym.color.value) sym.color.value = l.color;
        if (mode === 'graduated' && sym[param].field) { const r = getNumericRange(l, sym[param].field); if (r.count) sym[param].inputRange = [r.min, r.max]; }
        if (mode === 'categorized' && sym[param].field) regenCategories(l, param);
        syncLayerDeclarative(l); applyLayerStyle(l); renderInspector();
    },
    setSymField(id, param, field) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const sym = initSymbolization(l); sym[param].field = field || null;
        if (field && param === 'color' && sym.color.mode === 'categorized') regenCategories(l, 'color');
        if (field && param === 'model' && sym.model.mode === 'categorized') sym.model.categories = [];
        syncLayerDeclarative(l); applyLayerStyle(l); renderInspector();
    },
    setSymMethod(id, param, method) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const sym = initSymbolization(l);
        sym[param].method = method;
        // La repartition est justement ce que la methode change. Des bornes
        // figees rendaient le reglage sans effet : Log et Racine affichaient la
        // meme carte que Lineaire.
        if (param === 'color' && sym.color.mode === 'graduated' && sym.color.field) {
            const r = getNumericRange(l, sym.color.field);
            const pal = COLOR_PALETTES[sym.color.colorRamp || sym.color.palette] || [];
            if (r.count && pal.length) {
                l._declarative = {
                    ...(l._declarative || {}),
                    kind: 'graduated',
                    field: l._declarative?.field || sym.color.field,
                    method,
                    stops: graduatedStops(r.min, r.max, pal, method),
                };
            }
        }
        syncLayerDeclarative(l); applyLayerStyle(l); renderInspector();
    },
    setSymPalette(id, param, palette) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const sym = initSymbolization(l); sym[param].palette = palette; if (param === 'color') sym.color.colorRamp = palette;
        if (sym[param].categories) regenCategories(l, param);
        // Le rendu gradue lit la couleur des classes du declaratif, pas la
        // rampe nommee : sans recoloriage, le choix de palette n'atteignait
        // jamais la carte — la legende passait au bleu, les mailles restaient
        // vertes. Les bornes, elles, portent le decoupage de la donnee et
        // doivent survivre au changement de couleurs.
        if (param === 'color' && l._declarative?.stops?.length) {
            l._declarative = {
                ...l._declarative,
                stops: recolorStops(l._declarative.stops, COLOR_PALETTES[palette] || []),
            };
        }
        syncLayerDeclarative(l); applyLayerStyle(l); renderInspector();
    },
    setSymColorValue(id, v) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const sym = initSymbolization(l);
        sym.color.value = v;
        sym.color.mode = 'single';
        l.color = v;
        syncLayerDeclarative(l); applyLayerStyle(l); renderInspector(); updateLegend();
    },
    setSymSizeValue(id, v) { const l = STATE.layers.find((x) => x.id === id); if (!l) return; initSymbolization(l).size.value = +v; const el = $('sz-val'); if (el) el.textContent = v + (l.geometryType === 'Polygon' ? ' m' : (l.style?.mode === 'library' ? ' ×' : ' px')); applyLayerStyle(l); },
    setSymOutput(id, param, i, v) { const l = STATE.layers.find((x) => x.id === id); if (!l) return; initSymbolization(l)[param].outputRange[i] = +v; applyLayerStyle(l); },

    /** Surfaces à plat ou extrudées. Remonter en volume réactive la hauteur. */
    setPolygonMode(id, mode) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        l.style = l.style || { mode: 'mapbox' };
        l.style.polygonMode = mode === 'flat' ? 'flat' : 'extruded';
        applyLayerStyle(l);
        Models3D.scheduleBuild();
        renderInspector(); markDirty(); saveLayerPrefIfSynced(l);
    },
    /** Opacité de couche ; 'auto' rend la main au style déclaratif. */
    setSymOpacity(id, v) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const sym = initSymbolization(l);
        sym.opacity = v === 'auto' ? null : clamp(+v, 0, 1);
        const el = $('op-val');
        if (el && v !== 'auto') el.textContent = Math.round(+v * 100) + ' %';
        applyLayerStyle(l);
        if (v === 'auto') renderInspector();
        markDirty(); saveLayerPrefIfSynced(l);
    },
    setStrokeMode(id, mode) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const st = initSymbolization(l).stroke;
        st.enabled = mode !== 'none';
        if (mode !== 'none') st.mode = mode;
        if (mode === 'fixed' && !st.color) st.color = l.color;
        applyLayerStyle(l); renderInspector(); markDirty(); saveLayerPrefIfSynced(l);
    },
    setStrokeWidth(id, v) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        initSymbolization(l).stroke.width = clamp(+v, 0, 20);
        applyLayerStyle(l); markDirty(); saveLayerPrefIfSynced(l);
    },
    setStrokeColor(id, v) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const st = initSymbolization(l).stroke;
        st.color = v; st.mode = 'fixed'; st.enabled = true;
        applyLayerStyle(l); markDirty(); saveLayerPrefIfSynced(l);
    },
    setExtrusionBase(id, v) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        initSymbolization(l).extrusion.base = Math.max(0, +v || 0);
        applyLayerStyle(l); renderInspector(); markDirty(); saveLayerPrefIfSynced(l);
    },
    setLabelSize(id, v) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        initSymbolization(l).label.size = clamp(+v, 6, 40);
        applyLayerStyle(l); markDirty(); saveLayerPrefIfSynced(l);
    },
    setLabelColor(id, v) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        initSymbolization(l).label.color = v;
        applyLayerStyle(l); markDirty(); saveLayerPrefIfSynced(l);
    },
    pickCatColor(id, value, el) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const cat = l.style.symbolization.color.categories.find((c) => String(c.value) === String(value)); if (!cat) return;
        const inp = document.createElement('input'); inp.type = 'color'; inp.value = cat.color; inp.style.position = 'fixed'; inp.style.opacity = '0';
        document.body.appendChild(inp);
        inp.oninput = () => {
            cat.color = inp.value; el.style.background = inp.value;
            applyCategoryColorsToFeatures(l);
            syncLayerSourceData(l);
            applyLayerStyle(l);
        };
        inp.onchange = () => inp.remove();
        inp.click();
    },
    setModelCategory(id, value, modelId) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        const sym = initSymbolization(l); let cat = sym.model.categories.find((c) => String(c.value) === String(value));
        if (!cat) { cat = { value }; sym.model.categories.push(cat); }
        cat.modelId = modelId || null; applyLayerStyle(l); Models3D.forceBuild(); renderInspector();
    },
    setDefaultModel(id, modelId) { const l = STATE.layers.find((x) => x.id === id); if (!l) return; initSymbolization(l).model.defaultModelId = modelId || null; applyLayerStyle(l); Models3D.forceBuild(); },
    setCommon(id, param, v, elId, unit) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        l.style.common = l.style.common || {}; l.style.common[param] = +v;
        const el = $(elId); if (el) el.textContent = v + (unit || '');
        Models3D.updateEdited(id, (l.geojson?.features || []).map((_, i) => i));
    },
    toggleLabel(id) { const l = STATE.layers.find((x) => x.id === id); if (!l) return; const lab = initSymbolization(l).label; lab.enabled = !lab.enabled; applyLayerStyle(l); renderInspector(); },
    resetSymbology(id) {
        const l = STATE.layers.find((x) => x.id === id); if (!l) return;
        delete l.style.symbolization; initSymbolization(l); applyLayerStyle(l); renderInspector(); showToast('Symbologie réinitialisée', 'success');
    },

    // Selection editing
    selPrev() { nav(-1); }, selNext() { nav(1); },
    selAll() {
        const l = STATE.layers.find((x) => x.id === STATE.selection.layerId); if (!l) return;
        STATE.selection.features = l.geojson.features.map((_, i) => i); afterSelectionChange();
    },
    selClear() { STATE.selection.features = []; afterSelectionChange(); },
    editFeature(sliderId, value) {
        if (!assertCanWrite('éditer les objets 3D')) return;
        const layer = STATE.layers.find((l) => l.id === STATE.selection.layerId); if (!layer) return;
        const v = parseFloat(value); const el = $(sliderId + '-v');
        const param = sliderId.split('-')[1];
        const multi = sliderId.startsWith('m-');
        const unit = param === 'scale' ? '×' : param.startsWith('offset') ? 'm' : '°';
        if (el) el.textContent = (multi && v >= 0 && param !== 'scale' ? '+' : '') + (param === 'scale' ? v.toFixed(2) : v) + unit;
        if (!multi) {
            const idx = STATE.selection.features[0];
            setFeatureOverride(layer, idx, param, v);
        } else {
            if (!multiBaseValues) {
                multiBaseValues = {};
                STATE.selection.features.forEach((i) => { multiBaseValues[i] = resolveFeatureProps(layer.geojson.features[i], layer); });
            }
            STATE.selection.features.forEach((i) => {
                const base = multiBaseValues[i] || {};
                if (param === 'scale') setFeatureOverride(layer, i, 'scale', (base.scale || 1) * v);
                else if (param === 'rotationZ') setFeatureOverride(layer, i, 'rotationZ', ((base.rotationZ || 0) + v + 360) % 360);
                else setFeatureOverride(layer, i, param, (base[param] || 0) + v);
            });
        }
        Models3D.updateEdited(layer.id, multi ? STATE.selection.features : [STATE.selection.features[0]]);
    },
    resetSelected() {
        if (!assertCanWrite('réinitialiser les objets')) return;
        const l = STATE.layers.find((x) => x.id === STATE.selection.layerId); if (!l) return;
        STATE.selection.features.forEach((i) => clearFeatureOverrides(l, i));
        multiBaseValues = null; Models3D.updateEdited(l.id, STATE.selection.features); renderInspector(); showToast('Réinitialisé', 'success');
    },
    applySelected() {
        const l = STATE.layers.find((x) => x.id === STATE.selection.layerId);
        multiBaseValues = null;
        if (!l) return;
        if (l.source === 'qgis2grist' && CONFIG.grist.ready) {
            if (!assertCanWrite('enregistrer les objets')) return;
            saveFeaturesToSource(grist.docApi, l, STATE.selection.features)
                .then((n) => {
                    dirty = false;
                    _syncPaused = false;
                    $('app-header')?.classList.remove('dirty');
                    showToast(`${n} enregistrement(s) · ${l.sourceTable}`, 'success');
                })
                .catch((e) => {
                    enterViewModeOnWriteFail(e);
                    showToast('Grist : ' + e.message, 'error');
                });
            return;
        }
        markDirty();
        saveLayerToGrist(l, true);
        showToast(`${STATE.selection.features.length} objet(s) enregistré(s)`, 'success');
    },
    setInspObjTab(tab) { _inspObjTab = tab; renderObjectInspector(); },
    closeInspector() { closeInspectorByUser(); },
    setFeatureAttr(layerId, field, value) {
        if (!assertCanWrite('modifier les attributs')) return;
        const l = STATE.layers.find((x) => x.id === layerId);
        if (!l) return;
        const idx = STATE.selection.features[0];
        const f = l.geojson?.features?.[idx];
        if (!f) return;
        if (!f.properties) f.properties = {};
        const fld = getLayerFields(l).find((x) => x.id === field);
        f.properties[field] = fld?.type === 'numeric' ? (value === '' ? null : parseFloat(value)) : value;
        markDirty();
    },

    // Project
    saveProject, loadProject, restoreProject, exportProject,
};
function regenCategories(layer, param) {
    const sym = layer.style.symbolization[param];
    const vals = getUniqueValues(layer, sym.field, 100);
    if (param === 'color') {
        sym.categories = vals.map((v, i) => ({ value: v.value, color: paletteColor(sym.palette, i, vals.length), count: v.count }));
        if (layer.source === 'qgis2grist') {
            applyCategoryColorsToFeatures(layer);
            syncLayerSourceData(layer);
        }
    }
}
function nav(dir) {
    const layer = STATE.layers.find((l) => l.id === STATE.selection.layerId); if (!layer) return;
    const n = STATE.selection.features.length;
    if (n > 1) {
        STATE.selection.multiIndex = (STATE.selection.multiIndex + dir + n) % n;
        flyToFeature(layer, STATE.selection.features[STATE.selection.multiIndex]);
        $('sel-pos').textContent = `${STATE.selection.multiIndex + 1} / ${n}`;
        renderObjectInspector();
    } else {
        const total = layer.geojson.features.length;
        const cur = STATE.selection.features[0] ?? 0;
        const next = (cur + dir + total) % total;
        STATE.selection.features = [next];
        flyToFeature(layer, next); afterSelectionChange();
    }
}
window.A = A;
// Debug runtime (à retirer) : inspection Models3D depuis le navigateur
window.__Models3D = Models3D;

// ============================================================
// EVENT WIRING
// ============================================================
function wireMapControlsDock() {
    const dock = $('map-controls-dock');
    if (!dock) return;
    const KEY = 'atlas_map_controls_collapsed';
    const apply = (collapsed) => {
        dock.classList.toggle('collapsed', !!collapsed);
        try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch (e) {}
        if (!collapsed && _openDockPill) renderDockSlotHost();
    };
    let collapsed = false;
    try { collapsed = localStorage.getItem(KEY) === '1'; } catch (e) {}
    apply(collapsed);
    $('dock-collapse')?.addEventListener('click', () => apply(true));

    const host = $('dock-slot-host');
    if (host && !host._dockWired) {
        host._dockWired = true;
        host.addEventListener('click', (e) => {
            if (e.target.closest('#shadow-toggle')) A.toggleSetting('shadows');
        });
        const arcSet = (clientX, arc) => {
            const rect = arc.getBoundingClientRect();
            const r = clamp((clientX - rect.left - 8) / 152, 0, 1);
            STATE.settings.timeOfDay = Math.round(360 + r * 840);
            updateLighting();
            if (STATE.currentModule === 'soleil') renderSoleil();
            // Le débounce absorbe le geste : un glissement d'arc émet une
            // valeur par pixel parcouru, on n'écrit qu'à l'arrêt.
            persistScenePrefsDifferee();
        };
        // Pointer Events : un seul jeu d'écouteurs pour souris, doigt et stylet.
        // La capture est prise sur l'hôte, pas sur l'arc : `renderDockSlotHost`
        // peut reconstruire l'arc en cours de geste, ce qui perdrait la capture.
        host.addEventListener('pointerdown', (e) => {
            const arc = e.target.closest('.sun-arc');
            if (!arc) return;
            _sunArcDragging = true;
            capturePointer(host, e.pointerId);
            arcSet(e.clientX, arc);
            e.preventDefault();
        });
        host.addEventListener('pointermove', (e) => {
            if (!_sunArcDragging) return;
            const arc = host.querySelector('.sun-arc');
            if (arc) arcSet(e.clientX, arc);
        });
        const finArc = () => { _sunArcDragging = false; };
        host.addEventListener('pointerup', finArc);
        host.addEventListener('pointercancel', finArc);
    }
}

function wireEvents() {
    updateMobileLayout();
    wireMobileNav();
    wireLegendClicks();
    // Les bascules sont des `div` : `tabindex` les rend atteignables, mais
    // seul un vrai bouton réagit à Espace et Entrée. On le fait ici, une fois
    // pour toutes, plutôt que sur chaque bascule.
    document.addEventListener('keydown', (e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        const bascule = e.target?.closest?.('[role="switch"]');
        if (!bascule) return;
        e.preventDefault();
        bascule.click();
    });
    $('viewer-story-fab')?.addEventListener('click', () => {
        if ((STATE.story?.length || 0) > 0) A.storyPlay(0);
    });
    if (typeof window !== 'undefined' && window.matchMedia) {
        window.matchMedia('(max-width: 720px)').addEventListener('change', () => updateMobileLayout());
    }
    document.querySelectorAll('.rail-item[data-module]').forEach((b) => {
        b.addEventListener('click', () => {
            const m = b.dataset.module;
            if (STATE.currentModule === m) closeModulePanel(); else openModule(m);
        });
    });
    $('btn-save').addEventListener('click', saveProject);
    $('btn-load').addEventListener('click', loadProject);
    $('btn-export').addEventListener('click', exportProject);
    $('btn-story').addEventListener('click', () => A.storyPlay(0));
    cablerMenuPrincipal();
    $('cmdk-trigger').addEventListener('click', openCmd);
    $('compass').addEventListener('click', () => map.easeTo({ bearing: 0, duration: 600 }));

    $('file-input').addEventListener('change', (e) => { if (e.target.files[0]) processFile(e.target.files[0]); e.target.value = ''; });

    // legend collapse
    $('legend-head').addEventListener('click', () => $('legend').classList.toggle('collapsed'));
    // Sur un telephone, la legende depliee mangeait le quart de l'ecran et
    // masquait ce qu'elle decrit. Elle s'ouvre d'un doigt quand on en a besoin.
    if (document.body.classList.contains('mobile-layout')) $('legend')?.classList.add('collapsed');

    // selection bar
    $('sel-prev').addEventListener('click', () => A.selPrev());
    $('sel-next').addEventListener('click', () => A.selNext());
    $('sel-all').addEventListener('click', () => A.selAll());
    $('sel-clear').addEventListener('click', () => A.selClear());
    $('sel-exit').addEventListener('click', exitSelectionMode);

    // dock contrôles (repli style boussole)
    wireMapControlsDock();
    refreshControlsDock();

    // fermeture inspecteur (pas de pastille carte)
    $('insp-close-btn')?.addEventListener('click', () => A.closeInspector());

    // command palette keyboard
    $('cmd-input').addEventListener('input', (e) => buildCmdItems(e.target.value));
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmd(); return; }
        const open = $('cmd-overlay').classList.contains('open');
        if (open) {
            if (e.key === 'Escape') closeCmd();
            else if (e.key === 'ArrowDown') { cmdSel = Math.min(cmdSel + 1, cmdItems.length - 1); renderCmd(); e.preventDefault(); }
            else if (e.key === 'ArrowUp') { cmdSel = Math.max(cmdSel - 1, 0); renderCmd(); e.preventDefault(); }
            else if (e.key === 'Enter') runCmd(cmdSel);
            return;
        }
        if (e.key === 'Escape') {
            if (locationPickMode) { locationPickMode = false; if (map) map.getCanvas().style.cursor = ''; showToast('Annulé', 'info'); }
            else if (STATE.selection.mode) exitSelectionMode();
            else if (STATE.currentModule) closeModulePanel();
        }
    });
    $('cmd-overlay').addEventListener('click', (e) => { if (e.target.id === 'cmd-overlay') closeCmd(); });
}

// ============================================================
// INIT
// ============================================================
async function init() {
    // Mode URL avant premier paint chrome
    const bootMode = parseAtlasMode(typeof location !== 'undefined' ? location.search : '');
    if (bootMode === 'view') {
        CONFIG.viewMode = true;
        applyViewModeChrome();
    }
    updateMobileLayout();
    wireEvents();
    initMap();
    probeLocalModels();
    await initGrist();
    if (CONFIG.sceneExterne) await monterSceneExterne(CONFIG.sceneExterne);
    applyViewModeChrome();
    updateMobileLayout();
    // Autosave : standalone uniquement — pas en doc Grist (Scene Manifest charge déjà les couches)
    try {
        const auto = localStorage.getItem('atlas_autosave');
        if (auto && !CONFIG.grist.ready && STATE.layers.length === 0) {
            const p = JSON.parse(auto);
            if (p.layers?.length && confirm(`Restaurer la sauvegarde locale (${p.layers.length} couches) ?`)) {
                restoreProject(p);
            }
        }
    } catch (e) {}
    setInterval(() => {
        if (CONFIG.grist.ready || !STATE.layers.length) return;
        try { localStorage.setItem('atlas_autosave', JSON.stringify(buildProject())); } catch (e) {}
    }, 120000);
    updateLegend();
    updateSunStrip();
}

/**
 * Demarrage — deux chemins, un seul point d'entree.
 *
 * Dans un document Grist, rien ne change : `init()` part comme avant. Ouvert
 * seul — application installee ou simple onglet — Atlas ne sait ni ou se
 * connecter ni quelle scene montrer : l'accueil le demande, puis rend la main.
 *
 * L'accueil est charge A LA DEMANDE. En widget, ce `import()` n'a jamais lieu :
 * ni le module d'accueil ni ses dependances ne sont telecharges, et le chemin
 * eprouve reste rigoureusement inchange.
 */
async function demarrer() {
    // La scène externe se décide avant tout le reste : elle change le régime
    // d'Atlas, pas seulement ce qu'il affiche. Ni accueil (il n'y a rien à
    // demander, la scène est nommée) ni document (elle n'est pas de confiance).
    const { url: urlScene, refus } = urlSceneDepuisParam(
        typeof location !== 'undefined' ? location.search : '');
    if (refus) {
        // Un refus muet enverrait chercher un bug d'Atlas là où il y a une
        // adresse mal formée. Il s'affiche, et la page s'ouvre quand même.
        console.warn('[Atlas]', refus);
        setTimeout(() => showToast(refus, 'error'), 0);
    }
    if (urlScene) {
        const { manifest, echec } = await chargerSceneExterne(urlScene);
        if (echec) {
            console.error('[Atlas] scène externe :', echec);
            // Rendre la main plutôt que laisser une page morte : Atlas s'ouvre
            // vide, mais il dit pourquoi — et il reste utilisable.
            setTimeout(() => showToast(echec, 'error'), 0);
        } else {
            CONFIG.sceneExterne = manifest;
            CONFIG.viewMode = true;   // rien à écrire : il n'y a pas de document
            return init();
        }
    }
    try {
        const { capacites } = await import('./lib/data-client.js?v=1.5.4');
        if (capacites().mode === 'grist') return init();
        const { accueillir } = await import('./lib/hote-ui.js?v=1.5.4');
        const pret = await accueillir();
        if (!pret) return;          // l'accueil garde l'ecran : rien a demarrer
    } catch (e) {
        // Un accueil defaillant ne doit pas empecher Atlas de s'ouvrir : hors
        // Grist il n'aura pas de donnees, mais il le dira mieux qu'une page morte.
        console.error('[Atlas] accueil :', e);
    }
    return init();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
else demarrer();

/**
 * Dire ce qui n'a pas pu être chargé.
 *
 * Le silence était le vrai défaut : une couche en échec disparaissait comme une
 * couche volontairement absente, et seul un `console.warn` en gardait trace —
 * c'est-à-dire personne, sur le terrain comme ailleurs. On préfère un message
 * qui nomme la couche et l'origine attendue : c'est ce qui permet de distinguer
 * « je ne sais pas lire cette origine » de « cette table n'existe pas ».
 */
function signalerCouchesManquantes(echecs) {
    if (!echecs || !echecs.length) return;
    for (const e of echecs) console.warn('[Atlas] couche non chargée —', e.nom, '·', e.origine, '·', e.raison);

    const n = echecs.length;
    const titre = n === 1
        ? `Couche non chargée : ${echecs[0].nom}`
        : `${n} couches non chargées`;
    // Le détail au-delà de deux noms encombrerait plus qu'il n'informerait ; la
    // console porte la liste complète.
    const detail = echecs.slice(0, 2).map((e) => `${e.nom} (${e.origine})`).join(' · ')
        + (n > 2 ? ` … et ${n - 2} autre${n - 2 > 1 ? 's' : ''}` : '');
    showToast(`${titre} — ${detail}`, 'warning');
}

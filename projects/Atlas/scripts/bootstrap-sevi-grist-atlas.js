/**
 * Bootstrap Atlas pour doc SEVI (gc-22fb54) — sans QGIS.
 * Génère les payloads Grist ; appliqués via grist_apply MCP.
 *
 * Usage : node projects/Atlas/scripts/bootstrap-sevi-grist-atlas.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(__dirname, '../tests/fixtures');
const manifest = JSON.parse(fs.readFileSync(path.join(FIX, 'scene-manifest-sevi-grist.json'), 'utf8'));

const GRID = 'Grille_sardaigne_200m_selinf10m';
const BLD = 'Ctr_dbtopo_v_f010105';
const SITES = 'PERIMETRES_GEO';

const SITE_COORDS = {
  1: { latitude: 41.5, longitude: 8.5 },
  2: { latitude: 41.8, longitude: 8.6 },
  3: { latitude: 43.6, longitude: 7.32 },
  4: { latitude: 44.32, longitude: 9.33 },
  5: { latitude: 44.39, longitude: 8.85 },
  6: { latitude: 44.41, longitude: 8.93 },
  7: { latitude: 44.39, longitude: 8.97 },
  8: { latitude: 44.05, longitude: 8.22 },
  9: { latitude: 39.22, longitude: 9.11 },
  10: { latitude: 39.21, longitude: 9.15 },
};

function layerStyleJSON(tableId) {
  const ml = manifest.layers.find((l) => l.id === tableId);
  if (!ml) return '{}';
  return JSON.stringify({
    mode: 'mapbox',
    declarative: ml.style.declarative,
    controls: ml.controls.map((c) => ({
      field: c.field,
      type: c.type,
      variant: c.variant,
      label: c.label,
      active: !!c.active,
      min: c.min,
      max: c.max,
      dataMin: c.dataMin,
      dataMax: c.dataMax,
      selection: c.type === 'select' ? [...(c.values || [])] : undefined,
    })),
  });
}

function layerVisible(tableId) {
  const ml = manifest.layers.find((l) => l.id === tableId);
  return ml?.visibility?.defaultVisible !== false;
}

const viewerControls = [
  { id: 'sun', type: 'sun', label: 'Soleil & date', exposed: false, config: { shadows: true } },
  { id: 'view3d', type: 'view3d', label: 'Vue 2D / 3D', exposed: true, config: {} },
  { id: 'basemap', type: 'basemap', label: 'Fonds de plan', exposed: true, config: { allowed: ['positron', 'ortho-ign', 'dark'] } },
];

function storyLayer(sourceTable, visible, controls = []) {
  const ml = manifest.layers.find((l) => l.source.table === sourceTable);
  return {
    sourceTable,
    name: ml?.name || sourceTable,
    visible,
    controls,
    declarative: ml?.style?.declarative || null,
  };
}

const story = [
  {
    title: 'Contexte INTERREG Méditerranée',
    text: 'Projet CRESO / OSIRISC : évaluation du risque côtier sur plusieurs sites pilotes (Sardaigne, Corse, Ligurie, PACA).',
    state: {
      camera: { center: [8.5, 41.5], zoom: 5.8, pitch: 0, bearing: 0 },
      terrain3D: false,
      layers: [
        storyLayer(GRID, true),
        storyLayer(BLD, false),
        storyLayer(SITES, true, [{ field: 'Case_study', type: 'select', values: ['INTERREG'] }]),
      ],
    },
  },
  {
    title: 'Zone d\'étude — Sardaigne',
    text: 'Grille d\'analyse 200 m (scénario montée de niveau marin +10 m) : support spatial pour les indicateurs SEVI.',
    state: {
      camera: { center: [8.64, 38.87], zoom: 10.5, pitch: 0, bearing: 0 },
      terrain3D: false,
      layers: [
        storyLayer(GRID, true, [{ field: 'lg_route_m', type: 'range', min: 0, max: 5000 }]),
        storyLayer(BLD, false),
        storyLayer(SITES, true, [{ field: 'Case_study', type: 'select', values: ['Cagliari 1'] }]),
      ],
    },
  },
  {
    title: 'Réseaux et linéaires côtiers',
    text: 'Longueur routière et portuaire par cellule — proxy des enjeux « Réseaux » (SEVI_R).',
    state: {
      camera: { center: [8.64, 38.87], zoom: 12.5, pitch: 25, bearing: -15 },
      terrain3D: true,
      layers: [
        storyLayer(GRID, true, [
          { field: 'lg_route_m', type: 'range', min: 200, max: 5000 },
          { field: 'lg_porti_m', type: 'range', min: 0, max: 3000 },
        ]),
        storyLayer(BLD, false),
        storyLayer(SITES, false),
      ],
    },
  },
  {
    title: 'Enjeu bâtimentaire (BD TOPO)',
    text: 'Typologie des bâtiments (matériaux, implantation) — critères SEVI_B. Données BD TOPO sur site ligurien.',
    state: {
      camera: { center: [9.84, 44.17], zoom: 15, pitch: 45, bearing: 20 },
      terrain3D: true,
      layers: [
        storyLayer(GRID, false),
        storyLayer(BLD, true, [{ field: 'def_tipo', type: 'select', values: ['Campestre', 'Carrareccia, carreggiabile (strada a fondo naturale)'] }]),
        storyLayer(SITES, true, [{ field: 'Case_study', type: 'select', values: ['Chiavari'] }]),
      ],
    },
  },
  {
    title: 'Densité bâtie sur la grille',
    text: 'Nombre de bâtiments par cellule 200 m — indicateur agrégé pour la vulnérabilité des enjeux.',
    state: {
      camera: { center: [8.64, 38.87], zoom: 13, pitch: 35, bearing: 0 },
      terrain3D: true,
      layers: [
        storyLayer(GRID, true, [{ field: 'nb_bat', type: 'range', min: 1, max: 50 }]),
        storyLayer(BLD, false),
        storyLayer(SITES, false),
      ],
    },
  },
  {
    title: 'Hébergement et tourisme côtier',
    text: 'Résidences et hébergements sur la grille — enjeux saisonniers et habitats légers (SEVI_A).',
    state: {
      camera: { center: [8.66, 38.88], zoom: 12.8, pitch: 30, bearing: 10 },
      terrain3D: false,
      layers: [
        storyLayer(GRID, true, [
          { field: 'nb_residence', type: 'range', min: 1, max: 30 },
          { field: 'nb_bat', type: 'range', min: 0, max: 50 },
        ]),
        storyLayer(BLD, false),
        storyLayer(SITES, false),
      ],
    },
  },
  {
    title: 'Synthèse locale — Cagliari',
    text: 'Vue combinée grille + sites : lecture intégrée aléa / susceptibilité / vulnérabilité socio-économique.',
    state: {
      camera: { center: [9.11, 39.22], zoom: 11.5, pitch: 40, bearing: -25 },
      terrain3D: true,
      layers: [
        storyLayer(GRID, true, [
          { field: 'lg_route_m', type: 'range', min: 0, max: 5000 },
          { field: 'nb_bat', type: 'range', min: 0, max: 50 },
        ]),
        storyLayer(BLD, false),
        storyLayer(SITES, true, [{ field: 'Case_study', type: 'select', values: ['Cagliari 1', 'Cagliari 2'] }]),
      ],
    },
  },
  {
    title: 'Comparaison multi-sites INTERREG',
    text: 'Navigation entre les études de cas : Ajaccio, Nice, Ligurie, Sardaigne — même méthodologie CRESO.',
    state: {
      camera: { center: [8.8, 41.2], zoom: 6.2, pitch: 0, bearing: 0 },
      terrain3D: false,
      layers: [
        storyLayer(GRID, true),
        storyLayer(BLD, false),
        storyLayer(SITES, true, [{
          field: 'Case_study',
          type: 'select',
          values: ['INTERREG', 'Ajaccio', 'Nice', 'Cagliari 1', 'Chiavari', 'Genova Voltri', 'Albenga'],
        }]),
      ],
    },
  },
];

function qgisWidgetConfig() {
  const layers = manifest.layers.map((ml) => {
    const table = ml.source.table;
    const fields = {
      [GRID]: [
        { name: 'nom', label: 'Nom', gType: 'Text' },
        { name: 'nb_bat', label: 'Nombre de bâtiments', gType: 'Numeric' },
        { name: 'nb_residence', label: 'Résidences', gType: 'Numeric' },
        { name: 'lg_route_m', label: 'Longueur routière (m)', gType: 'Numeric' },
        { name: 'lg_porti_m', label: 'Linéaire portuaire (m)', gType: 'Numeric' },
        { name: 'geometry_json', label: 'GeoJSON', gType: 'Text' },
      ],
      [BLD]: [
        { name: 'def_tipo', label: 'Type', gType: 'Text' },
        { name: 'def_sede', label: 'Implantation', gType: 'Text' },
        { name: 'def_livello', label: 'Niveau', gType: 'Text' },
        { name: 'geometry_json', label: 'GeoJSON', gType: 'Text' },
      ],
      [SITES]: [
        { name: 'Case_study', label: 'Site d\'étude', gType: 'Text' },
        { name: 'REGION', label: 'Région', gType: 'Text' },
        { name: 'latitude', label: 'Latitude', gType: 'Numeric' },
        { name: 'longitude', label: 'Longitude', gType: 'Numeric' },
      ],
    };
    return {
      tableName: table,
      displayName: ml.name,
      geomType: ml.geometry_type === 'point' ? 'Point' : 'Polygon',
      featureCount: table === GRID ? 42182 : table === BLD ? 52165 : 10,
      fields: fields[table] || [],
      color: ml.style?.declarative?.stops?.[0]?.color || '#3e5de7',
      style: { declarative: ml.style.declarative },
    };
  });

  return {
    version: 3,
    meta: {
      classification: 'interne',
      imported_at: new Date().toISOString(),
      source_file: 'bootstrap-atlas-sevi',
      title: manifest.title,
    },
    scene_manifest: manifest,
    layers,
    terrain: { version: 1, primaryTableId: null, forms: [] },
    published: { via: 'atlas-bootstrap', doc: 'gc-22fb54' },
  };
}

export function buildBootstrapActions() {
  const now = Math.floor(Date.now() / 1000);
  const actions = [
    ['AddTable', 'SceneManifest', [
      { id: 'manifest_json', type: 'Text', label: 'Scene Manifest JSON' },
      { id: 'scene_hash', type: 'Text', label: 'Hash' },
      { id: 'source_file', type: 'Text', label: 'Source' },
      { id: 'created_at', type: 'DateTime', label: 'Créé le' },
    ]],
    ['AddTable', 'Atlas_LayerPrefs', [
      { id: 'source_table', type: 'Text', label: 'Table source' },
      { id: 'StyleJSON', type: 'Text', label: 'Style Atlas (JSON)' },
      { id: 'Visible', type: 'Bool', label: 'Visible' },
      { id: 'UpdatedAt', type: 'DateTime', label: 'Mis à jour' },
    ]],
    ['AddTable', 'Atlas_ScenePrefs', [
      { id: 'ViewerJSON', type: 'Text', label: 'Contrôles environnement (JSON)' },
    ]],
    ['AddTable', 'Atlas_Story', [
      { id: 'Step', type: 'Int', label: 'Étape' },
      { id: 'Title', type: 'Text', label: 'Titre' },
      { id: 'Description', type: 'Text', label: 'Texte' },
      { id: 'StateJSON', type: 'Text', label: 'État (JSON)' },
    ]],
    ['AddColumn', SITES, 'latitude', { type: 'Numeric', label: 'Latitude' }],
    ['AddColumn', SITES, 'longitude', { type: 'Numeric', label: 'Longitude' }],
  ];

  for (const [id, coords] of Object.entries(SITE_COORDS)) {
    actions.push(['UpdateRecord', SITES, Number(id), coords]);
  }

  actions.push(['BulkAddRecord', 'SceneManifest', [null], {
    manifest_json: [JSON.stringify(manifest)],
    scene_hash: ['bootstrap-sevi-v1'],
    source_file: ['bootstrap-atlas-sevi'],
    created_at: [now],
  }]);

  actions.push(['BulkAddRecord', 'Atlas_LayerPrefs', [null, null, null], {
    source_table: [GRID, BLD, SITES],
    StyleJSON: [layerStyleJSON(GRID), layerStyleJSON(BLD), layerStyleJSON(SITES)],
    Visible: [layerVisible(GRID), layerVisible(BLD), layerVisible(SITES)],
    UpdatedAt: [now, now, now],
  }]);

  actions.push(['AddRecord', 'Atlas_ScenePrefs', null, {
    ViewerJSON: JSON.stringify(viewerControls),
  }]);

  actions.push(['BulkAddRecord', 'Atlas_Story', story.map(() => null), {
    Step: story.map((_, i) => i + 1),
    Title: story.map((s) => s.title),
    Description: story.map((s) => s.text),
    StateJSON: story.map((s) => JSON.stringify(s.state)),
  }]);

  actions.push(['AddRecord', 'QgisWidgets', null, {
    widget_name: 'CRESO SEVI INTERREG',
    source_file: 'bootstrap-atlas-sevi',
    config_json: JSON.stringify(qgisWidgetConfig()),
    created_at: now,
  }]);

  return actions;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const actions = buildBootstrapActions();
  const out = path.join(FIX, 'bootstrap-sevi-grist-actions.json');
  fs.writeFileSync(out, JSON.stringify(actions));
  console.log('✓', actions.length, 'actions →', out);
}

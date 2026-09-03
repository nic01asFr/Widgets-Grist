/**
 * Récit / storymaps — étapes caméra + état scène, persistance Atlas_Story.
 * Binding : caméra, visibilité, contrôles, symbolisation (interop interactive_map).
 */
import { declarativeFromAtlasLayer } from './manifest-binding.js?v=1.4.1';
import {
  captureSelectControlValues,
  controlDeclarativesFromAtlasLayer,
  markStoryCaptureControls,
  shouldCaptureControl,
} from './controls.js?v=1.4.1';

export const STORY_SCHEMA = [
  { id: 'Step', fields: { label: 'Étape', type: 'Int' } },
  { id: 'Title', fields: { label: 'Titre', type: 'Text' } },
  { id: 'Description', fields: { label: 'Texte', type: 'Text' } },
  { id: 'StateJSON', fields: { label: 'État (JSON)', type: 'Text' } },
];

export const ATLAS_STORY_TABLE = 'Atlas_Story';

let _storySaveChain = Promise.resolve();

function cloneJson(obj) {
  if (!obj) return null;
  return JSON.parse(JSON.stringify(obj));
}

/** Snapshot état scène pour une étape Récit. */
export function captureStoryState(map, state) {
  markStoryCaptureControls(state.layers);
  return {
    camera: map ? {
      center: map.getCenter().toArray(),
      zoom: +map.getZoom().toFixed(2),
      pitch: +map.getPitch().toFixed(1),
      bearing: +map.getBearing().toFixed(1),
    } : null,
    projection: state.settings.projection,
    timeOfDay: state.settings.timeOfDay,
    date: state.settings.date instanceof Date ? state.settings.date.toISOString() : state.settings.date,
    terrain3D: state.settings.terrain3D,
    labels: state.settings.labels,
    shadows: state.settings.shadows,
    sky: state.settings.sky,
    basemap: state.settings.basemap,
    buildings3D: state.settings.buildings3D,
    layers: (state.layers || []).map((l) => ({
      id: l.id,
      name: l.name,
      sourceTable: l.sourceTable || null,
      visible: l.visible !== false,
      controls: (l.controls || []).filter((c) => shouldCaptureControl(l, c)).map((c) => ({
        field: c.field,
        type: c.type,
        min: c.min,
        max: c.max,
        // Conservé pour qu'une re-capture ne perde pas l'exigence de valeur.
        ...(c.requireValue ? { requireValue: true } : {}),
        values: c.type === 'select'
          ? captureSelectControlValues(l, c)
          : c.values,
      })),
      symbolization: cloneJson(l.style?.symbolization),
      // Le rendu surfacique (à plat / en volume) vit hors symbolization : sans
      // lui, une étape ne saurait pas montrer la morphologie d'un bâti.
      ...(l.style?.polygonMode ? { polygonMode: l.style.polygonMode } : {}),
      declarative: declarativeFromAtlasLayer(l),
      controlDeclaratives: controlDeclarativesFromAtlasLayer(l).filter((c) => c.active),
    })),
  };
}

/** Export Récit → fragment Scene Manifest (story.steps). */
export function storyToManifestFragment(story) {
  if (!story?.length) return null;
  return {
    version: '0.2.1',
    steps: story.map((s, i) => ({
      id: `step-${i + 1}`,
      title: s.title || `Étape ${i + 1}`,
      description: s.text || '',
      state: s.state || {},
    })),
  };
}

export async function ensureStoryTable(docApi, opts = {}) {
  if (opts.viewMode) return;
  const tables = await docApi.listTables();
  if (!tables.includes(ATLAS_STORY_TABLE)) {
    await docApi.applyUserActions([['AddTable', ATLAS_STORY_TABLE, STORY_SCHEMA]]);
  }
}

export async function saveStoryToGrist(docApi, story, opts = {}) {
  if (!docApi || opts.viewMode) return;
  const travail = _storySaveChain.then(async () => {
    await ensureStoryTable(docApi, opts);
    const rec = await docApi.fetchTable(ATLAS_STORY_TABLE);
    const ids = rec.id || [];

    // Effacement et reecriture dans UN SEUL `applyUserActions` : Grist applique
    // la liste comme un tout. En deux appels, le premier etait deja commis
    // quand le second echouait — un refus d'ACL ou une coupure reseau au
    // mauvais moment effacait le recit au lieu de le mettre a jour.
    const actions = [];
    if (ids.length) actions.push(['BulkRemoveRecord', ATLAS_STORY_TABLE, ids]);
    if (story?.length) {
      actions.push(['BulkAddRecord', ATLAS_STORY_TABLE, story.map(() => null), {
        Step: story.map((_, i) => i + 1),
        Title: story.map((s) => s.title || ''),
        Description: story.map((s) => s.text || ''),
        StateJSON: story.map((s) => JSON.stringify(s.state || {})),
      }]);
    }
    if (actions.length) await docApi.applyUserActions(actions);
  });

  // La chaine ne doit jamais rester en echec, sinon plus aucune sauvegarde
  // ulterieure ne partirait. L'erreur, elle, remonte a l'appelant : il la
  // signale et bascule en lecture si les droits manquent. L'avaler ici laissait
  // croire a un enregistrement qui n'avait pas eu lieu.
  _storySaveChain = travail.catch(() => {});
  return travail;
}

/** Déduplique par numéro d'étape (garde la ligne la plus récente). */
export function normalizeStoryRows(rows) {
  const byStep = new Map();
  for (const row of rows) {
    const step = Number(row.step) || 0;
    if (!step) continue;
    const prev = byStep.get(step);
    if (!prev || (row.id ?? 0) >= (prev.id ?? 0)) byStep.set(step, row);
  }
  return Array.from(byStep.values()).sort((a, b) => a.step - b.step);
}

export async function loadStoryFromGrist(docApi) {
  if (!docApi) return [];
  try {
    const tables = await docApi.listTables();
    if (!tables.includes(ATLAS_STORY_TABLE)) return [];
    const rec = await docApi.fetchTable(ATLAS_STORY_TABLE);
    const n = (rec.id || []).length;
    const rows = [];
    for (let i = 0; i < n; i++) {
      let state = {};
      try { state = JSON.parse(rec.StateJSON?.[i] || '{}'); } catch (_) { state = {}; }
      rows.push({
        id: rec.id?.[i] ?? i,
        step: Number(rec.Step?.[i]) || (i + 1),
        title: rec.Title?.[i] || '',
        text: rec.Description?.[i] || '',
        state,
      });
    }
    return normalizeStoryRows(rows).map((r) => ({
      title: r.title,
      text: r.text,
      state: r.state,
    }));
  } catch (e) {
    console.warn('[Atlas story] load', e.message);
    return [];
  }
}

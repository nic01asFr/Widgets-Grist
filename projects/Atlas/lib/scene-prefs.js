/**
 * Persistance prefs scène Atlas — contrôles environnement (ViewerJSON).
 */
import {
  createDefaultViewerControls,
  parseViewerControls,
  serializeViewerControls,
} from './viewer-controls.js?v=20260730m';
import { expositionDepuisJSON, expositionAEnregistrer, expositionVide } from './exposition.js?v=20261002f';

export const ATLAS_SCENE_PREFS_TABLE = 'Atlas_ScenePrefs';

export const SCENE_PREFS_SCHEMA = [
  { id: 'ViewerJSON', label: 'Contrôles environnement (JSON)', type: 'Text' },
  { id: 'SettingsJSON', label: 'Réglages de scène (JSON)', type: 'Text' },
  // Les choix de l'auteur sur l'exposition (par où la scène s'ouvre) : lib/exposition.js.
  { id: 'ExpositionJSON', label: 'Exposition (JSON)', type: 'Text' },
  // La vignette de la scène dans la liste des projets : une URL de données (JPEG), choisie par l'auteur.
  { id: 'Miniature', label: 'Miniature (image)', type: 'Text' },
];

/**
 * Les réglages de scène qu'on garde d'une visite à l'autre.
 *
 * Une **liste blanche**, pas `{...STATE.settings}` : cet objet porte aussi une
 * `date` (un objet Date, qui ne survit pas au JSON tel quel) et des valeurs
 * dérivées qu'on ne veut pas figer. Écrire tout reviendrait à réimporter demain
 * des clés dont le sens aura changé.
 *
 * `date` est volontairement absente : elle se recalcule depuis `timeOfDay`, et
 * une scène rouverte l'an prochain doit montrer la lumière de l'heure choisie,
 * pas celle d'un jour de l'an dernier.
 *
 * C'est le défaut, pas une interdiction : une date **épinglée**
 * (`dateEpinglee`, 'AAAA-MM-JJ', horloge de scène, décision 3 du contrat
 * commun) est retenue, parce que quelqu'un a dit vouloir ce jour-là — une
 * nuit d'hiver pour un relevé de décembre. Non épinglée, elle vaut `null` et
 * ne s'écrit pas. Le fuseau de la scène (`fuseau`, IANA) voyage aussi.
 */
export const REGLAGES_MEMORISES = [
  'basemap', 'projection', 'modelSet',
  'buildings3D', 'terrain3D', 'terrainSource', 'terrainExaggeration',
  'labels', 'sky', 'timeOfDay', 'shadows',
  'fuseau', 'dateEpinglee',
];

let _prefRowId = null;

/** Ne retient que les réglages de la liste blanche, et seulement s'ils sont définis. */
export function reglagesAEnregistrer(settings) {
  const out = {};
  for (const k of REGLAGES_MEMORISES) {
    const v = settings?.[k];
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

/**
 * Les réglages relus, filtrés par la même liste blanche.
 *
 * Le filtre au **retour** compte autant qu'à l'écriture : une préférence
 * enregistrée par une version ultérieure ne doit pas entrer par la porte de
 * derrière dans un Atlas qui ne sait pas la traiter.
 */
export function reglagesDepuisJSON(brut) {
  let obj;
  try { obj = JSON.parse(String(brut || '{}')); } catch (_) { return {}; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  return reglagesAEnregistrer(obj);
}

/** @param {import('./viewer-controls.js?v=20260730m').ViewerControl[]} list */
export function prefsPayloadFromViewerControls(list) {
  return { ViewerJSON: JSON.stringify(serializeViewerControls(list)) };
}

/** @param {Record<string, unknown[]>} rec @param {number} i */
export function viewerControlsFromPrefsRow(rec, i) {
  try {
    const raw = JSON.parse(String(rec.ViewerJSON?.[i] || '[]'));
    return parseViewerControls(raw);
  } catch (_) {
    return createDefaultViewerControls();
  }
}

export async function ensureScenePrefsTable(docApi, opts = {}) {
  if (!docApi || opts.viewMode) return;
  const tables = await docApi.listTables();
  if (!tables.includes(ATLAS_SCENE_PREFS_TABLE)) {
    await docApi.applyUserActions([['AddTable', ATLAS_SCENE_PREFS_TABLE, SCENE_PREFS_SCHEMA]]);
    return;
  }
  // La table peut dater d'une version qui ne connaissait que `ViewerJSON` : ces
  // documents existent deja. Sans cette colonne, l'ecriture des reglages
  // echouerait sur un « KeyError » — et comme `persistScenePrefs` avale ses
  // erreurs dans un `console.warn`, le fond choisi ne serait simplement jamais
  // retenu, sans que rien ne le dise.
  try {
    const rec = await docApi.fetchTable(ATLAS_SCENE_PREFS_TABLE);
    for (const col of SCENE_PREFS_SCHEMA.filter((c) => c.id !== 'ViewerJSON')) {
      if (!(col.id in rec)) {
        await docApi.applyUserActions([['AddColumn', ATLAS_SCENE_PREFS_TABLE, col.id,
          { label: col.label, type: col.type }]]);
      }
    }
  } catch (e) {
    console.warn('[Atlas scene-prefs] colonne SettingsJSON', e.message);
  }
}

const vide = () => ({ viewerControls: createDefaultViewerControls(), settings: {}, exposition: expositionVide(), miniature: '' });

/** @returns {Promise<{ viewerControls: import('./viewer-controls.js?v=20260730m').ViewerControl[], settings: object }>} */
export async function loadScenePrefs(docApi) {
  if (!docApi) return vide();
  try {
    const tables = await docApi.listTables();
    if (!tables.includes(ATLAS_SCENE_PREFS_TABLE)) {
      _prefRowId = null;
      return vide();
    }
    const rec = await docApi.fetchTable(ATLAS_SCENE_PREFS_TABLE);
    const ids = rec.id || [];
    if (!ids.length) {
      _prefRowId = null;
      return vide();
    }
    _prefRowId = ids[0];
    return {
      viewerControls: viewerControlsFromPrefsRow(rec, 0),
      settings: reglagesDepuisJSON(rec.SettingsJSON?.[0]),
      exposition: expositionDepuisJSON(rec.ExpositionJSON?.[0]),
      miniature: typeof rec.Miniature?.[0] === 'string' ? rec.Miniature[0] : '',
    };
  } catch (e) {
    console.warn('[Atlas scene-prefs] load', e.message);
    return vide();
  }
}

/** @param {{ viewerControls: import('./viewer-controls.js?v=20260730m').ViewerControl[], settings?: object }} prefs */
export async function saveScenePrefs(docApi, prefs, opts = {}) {
  if (!docApi || opts.viewMode) return;
  await ensureScenePrefsTable(docApi, opts);
  const data = {
    ...prefsPayloadFromViewerControls(prefs.viewerControls || createDefaultViewerControls()),
    // Toujours écrit, même vide : une ligne dont la colonne reste nulle se
    // relit comme « aucune préférence », ce qui est exact — mais laisser la
    // clé absente ferait dépendre le résultat de l'ordre des enregistrements.
    SettingsJSON: JSON.stringify(reglagesAEnregistrer(prefs.settings || {})),
    // Écrite seulement quand on la donne : un appelant qui ne la connaît pas ne l'efface pas.
    ...(prefs.exposition ? { ExpositionJSON: JSON.stringify(expositionAEnregistrer(prefs.exposition)) } : {}),
    // Idem : la miniature ne s'efface que si on la donne vide.
    ...(typeof prefs.miniature === 'string' ? { Miniature: prefs.miniature } : {}),
  };
  if (_prefRowId != null) {
    await docApi.applyUserActions([['UpdateRecord', ATLAS_SCENE_PREFS_TABLE, _prefRowId, data]]);
  } else {
    const r = await docApi.applyUserActions([['AddRecord', ATLAS_SCENE_PREFS_TABLE, null, data]]);
    _prefRowId = r.retValues?.[0] ?? null;
  }
}

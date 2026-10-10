/**
 * Récit / storymaps — étapes caméra + état scène, persistance Atlas_Story.
 * Binding : caméra, visibilité, contrôles, symbolisation (interop interactive_map).
 */
import { declarativeFromAtlasLayer } from './manifest-binding.js?v=1.16.2';
import {
  captureSelectControlValues,
  controlDeclarativesFromAtlasLayer,
  markStoryCaptureControls,
  shouldCaptureControl,
} from './controls.js?v=1.16.2';
import {
  assurerCles,
  baseDepuisLignes,
  lireLignesRecit,
  planifierEcritureRecit,
} from './recit-cles.js?v=1.16.2';

export { assurerCles } from './recit-cles.js?v=1.16.2';

export const STORY_SCHEMA = [
  // La clé stable de l'étape (lib/recit-cles.js) : on la désigne par elle, jamais par son rang.
  { id: 'Cle', label: 'Clé', type: 'Text' },
  { id: 'Step', label: 'Étape', type: 'Int' },
  { id: 'Title', label: 'Titre', type: 'Text' },
  { id: 'Description', label: 'Texte', type: 'Text' },
  { id: 'StateJSON', label: 'État (JSON)', type: 'Text' },
];

export const ATLAS_STORY_TABLE = 'Atlas_Story';

let _storySaveChain = Promise.resolve();

/**
 * Ce que le document contenait à notre dernière lecture ou écriture (`cle -> signature`).
 * C'est le « point de départ » de la comparaison à trois : on n'écrit que ce que nous
 * avons changé depuis, et on ne retire que ce que nous avions. `null` tant qu'aucune
 * lecture n'a eu lieu : rien ne se retire alors.
 */
let _baseRecit = null;

/** À appeler quand on change de document : l'ancienne base ne vaut plus rien. */
export function reinitialiserBaseRecit() { _baseRecit = null; }

/** Les lignes de `Atlas_Story`, sous la forme que lit `lib/recit-cles.js`. */
function lignesDepuisTable(rec) {
  const n = (rec?.id || []).length;
  const lignes = [];
  for (let i = 0; i < n; i++) {
    lignes.push({
      id: rec.id[i],
      cle: rec.Cle?.[i] || '',
      step: Number(rec.Step?.[i]) || (i + 1),
      title: rec.Title?.[i] || '',
      text: rec.Description?.[i] || '',
      stateJson: rec.StateJSON?.[i] || '{}',
    });
  }
  return lignes;
}

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
      // La carte sur laquelle la vue est composée : rejouée sur un écran plus petit, elle recule du rapport des deux (`zoomPourEcran`).
      ecran: (() => { const c = map.getContainer?.(); return c && c.clientWidth > 0 && c.clientHeight > 0 ? { largeur: c.clientWidth, hauteur: c.clientHeight } : undefined; })(),
    } : null,
    projection: state.settings.projection,
    timeOfDay: state.settings.timeOfDay,
    date: state.settings.date instanceof Date ? state.settings.date.toISOString() : state.settings.date,
    terrain3D: state.settings.terrain3D,
    // Le relief d'une étape, c'est aussi sa source et son exagération : une
    // vue rapprochée demande le MNT LiDAR HD à 1×, un survol peut vouloir le
    // relief mondial accentué. Sans elles, l'étape héritait du dernier réglage.
    terrainSource: state.settings.terrainSource,
    terrainExaggeration: state.settings.terrainExaggeration,
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
        // La forme du contrôle fait partie de l'étape : sans elle, une étape
        // « maximum » se rejouait en plage, un « contient » perdait son texte,
        // et une date Grist (en secondes) se relisait en millisecondes.
        ...(c.variant ? { variant: c.variant } : {}),
        ...(c.unite ? { unite: c.unite } : {}),
        ...(c.type === 'text' ? { texte: c.texte || '' } : {}),
        values: c.type === 'select'
          ? captureSelectControlValues(l, c)
          : c.values,
      })),
      symbolization: cloneJson(l.style?.symbolization),
      // Le rendu surfacique (à plat / en volume) vit hors symbolization : sans
      // lui, une étape ne saurait pas montrer la morphologie d'un bâti.
      //
      // Toujours écrit, même vide : une étape captée à plat doit REMETTRE à plat
      // ce qu'une étape précédente a mis en volume. Sans la clé, elle « n'imposait
      // rien » et héritait du rendu de l'étape d'avant (relevé à l'audit du
      // 01/10/2026). Une étape enregistrée avant ce changement n'a pas la clé :
      // elle continue de ne rien imposer.
      polygonMode: l.style?.polygonMode || null,
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
      id: s.cle || `step-${i + 1}`,
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

/**
 * Enregistre le récit, par clé.
 *
 * La table ne s'efface plus : chaque étape est ajoutée, mise à jour ou retirée selon
 * ce que NOUS avons changé depuis la dernière lecture (voir `lib/recit-cles.js`). Deux
 * éditeurs qui travaillent sur des étapes différentes ne se perdent plus. Le tout
 * part dans UN SEUL `applyUserActions` : Grist l'applique comme un tout, un refus ne
 * laisse pas un récit à moitié écrit.
 */
export async function saveStoryToGrist(docApi, story, opts = {}) {
  if (!docApi || opts.viewMode) return;
  const travail = _storySaveChain.then(async () => {
    await ensureStoryTable(docApi, opts);
    assurerCles(story);
    const rec = await docApi.fetchTable(ATLAS_STORY_TABLE);
    const lignes = lignesDepuisTable(rec);
    const plan = (colonneCle) => planifierEcritureRecit({ locales: story || [], lignes, base: _baseRecit, colonneCle });
    // Une table sans ligne ne dit pas si elle a la colonne (selon l'accès, la lecture
    // ne rend que les colonnes des lignes présentes) : on suppose qu'elle l'a, et on
    // ne l'ajoute qu'au vu d'un refus qui n'est pas un refus de droits.
    const colonneConnue = lignes.length ? Array.isArray(rec?.Cle) : true;
    let ecriture = plan(colonneConnue);
    try {
      if (ecriture.actions.length) await docApi.applyUserActions(ecriture.actions);
    } catch (e) {
      if (colonneConnue && !lignes.length && /column|Cle/i.test(String(e?.message || '')) && !/rules|access|denied|403/i.test(String(e?.message || ''))) {
        ecriture = plan(false);
        await docApi.applyUserActions(ecriture.actions);
      } else throw e;
    }
    // La base ne bouge qu'après un enregistrement réussi : après un échec, la même
    // comparaison se refera au prochain essai.
    _baseRecit = ecriture.base;
  });

  // La chaine ne doit jamais rester en echec, sinon plus aucune sauvegarde
  // ulterieure ne partirait. L'erreur, elle, remonte a l'appelant : il la
  // signale et bascule en lecture si les droits manquent. L'avaler ici laissait
  // croire a un enregistrement qui n'avait pas eu lieu.
  _storySaveChain = travail.catch(() => {});
  return travail;
}

/**
 * Charge le récit, et dit s'il faut le réécrire pour le mettre en ordre.
 *
 * Une ligne sans clé reçoit `h-<rang>` (déterministe : deux lecteurs donnent la même
 * clé à la même ligne) ; deux lignes qui portent la même clé n'en font qu'une, la plus
 * récente. `aReecrire` dit que le document n'est pas encore dans cet état — l'appelant
 * qui peut écrire le réécrit alors, ce qui pose les clés et retire les reliquats.
 *
 * > **Pourquoi lire et dire ensemble.** L'appelant relisait la table une seconde fois
 * > pour compter les lignes, sans vérifier qu'elle existe : `[Sandbox] KeyError
 * > 'Atlas_Story'` à chaque chargement d'un document sans récit.
 */
export async function chargerRecitGrist(docApi) {
  if (!docApi) return { recit: [], lignesBrutes: 0, aReecrire: false };
  _baseRecit = null;
  try {
    const tables = await docApi.listTables();
    if (!tables.includes(ATLAS_STORY_TABLE)) {
      _baseRecit = new Map();
      return { recit: [], lignesBrutes: 0, aReecrire: false };
    }
    const lignes = lignesDepuisTable(await docApi.fetchTable(ATLAS_STORY_TABLE));
    const lues = lireLignesRecit(lignes);
    _baseRecit = baseDepuisLignes(lignes);
    return {
      recit: lues.lignes.map((l) => {
        let state = {};
        try { state = JSON.parse(l.stateJson || '{}'); } catch (_) { state = {}; }
        return { cle: l.cle, title: l.title, text: l.text, state };
      }),
      lignesBrutes: lignes.length,
      aReecrire: lues.doublons.length > 0 || lues.sansCle > 0,
    };
  } catch (e) {
    console.warn('[Atlas story] load', e.message);
    return { recit: [], lignesBrutes: 0, aReecrire: false };
  }
}

/** Le recit seul — forme historique, conservee pour les appelants qui s'en contentent. */
export async function loadStoryFromGrist(docApi) {
  return (await chargerRecitGrist(docApi)).recit;
}

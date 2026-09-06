/**
 * Binding Atlas ↔ Scene Manifest V0.2 (StyleDeclarative + ControlDeclarative + prefs).
 * Aligné sur le contrat d’offre de service / interop interactive_map.
 */
import {
  applyDeclarativeToLayer,
  resolveGristFieldName,
} from './declarative-style.js?v=20260729b';
import {
  applyControlDeclarativesToLayer,
  applyControlsFromPrefs,
  controlDeclarativesFromAtlasLayer,
  controlsPrefsPayload,
} from './controls.js?v=20260729m';
import { parseGristBool } from './grist-bool.js';

/** StyleDeclarative ← symbolisation Atlas courante. */
export function declarativeFromAtlasLayer(layer) {
  const sym = layer.style?.symbolization?.color;
  const fb = layer.color || '#808080';
  if (!sym) return { kind: 'single', color: fb, opacity: 1 };

  if (sym.mode === 'single') {
    return { kind: 'single', color: sym.value || fb, opacity: 1 };
  }

  if (sym.mode === 'categorized' && sym.field) {
    const field = resolveGristFieldName(layer._fields, sym.field) || sym.field;
    const stops = (sym.categories || []).map((c) => ({
      value: c.value,
      label: String(c.value ?? ''),
      color: c.color || fb,
      opacity: 1,
    }));
    return { kind: 'categorized', field, stops };
  }

  if (sym.mode === 'graduated' && sym.field) {
    const field = resolveGristFieldName(layer._fields, sym.field) || sym.field;
    const prev = layer._declarative;
    if (prev?.kind === 'graduated' && prev.field === field && prev.stops?.length) {
      return {
        kind: 'graduated',
        field,
        method: sym.method || prev.method || 'linear',
        stops: prev.stops,
      };
    }
    const lo = sym.inputRange?.[0] ?? 0;
    const hi = sym.inputRange?.[1] ?? (lo + 1);
    const span = hi - lo || 1;
    const colors = ['#ffffcc', '#a1dab4', '#41b6c4', '#2c7fb8', '#253494'];
    const stops = colors.map((color, i) => ({
      lower: lo + (span * i) / colors.length,
      upper: lo + (span * (i + 1)) / colors.length,
      color,
      opacity: 1,
    }));
    return { kind: 'graduated', field, method: sym.method || 'linear', stops };
  }

  return { kind: 'single', color: fb, opacity: 1 };
}

/**
 * Reporte les réglages d'apparence d'une symbolisation enregistrée sur la
 * couche, sans toucher aux couleurs (pilotées par le style déclaratif).
 */
export function mergeAppearancePrefs(layer, symbolization) {
  if (!symbolization) return;
  layer.style = layer.style || { mode: 'mapbox' };
  const sym = layer.style.symbolization = layer.style.symbolization || {};
  if ('opacity' in symbolization) sym.opacity = symbolization.opacity;
  if (symbolization.stroke) sym.stroke = { ...symbolization.stroke };
  if (symbolization.extrusion) sym.extrusion = { ...symbolization.extrusion };
  if (symbolization.label) {
    sym.label = { ...(sym.label || {}), ...symbolization.label };
  }
  if (symbolization.size) sym.size = { ...(sym.size || {}), ...symbolization.size };
}

/** Payload prefs Grist (StyleJSON structuré). */
export function layerPrefsPayload(layer) {
  return {
    mode: layer.style?.mode || 'mapbox',
    // Rendu surfacique (à plat / en volume) : réglage d'apparence à part
    // entière, il doit survivre au rechargement comme le reste du style.
    polygonMode: layer.style?.polygonMode || null,
    // Rang de superposition. Sans lui, un ordre réglé se perdrait au
    // rechargement — le réglage ne servirait qu'à la session en cours.
    rank: Number.isFinite(layer._rank) ? layer._rank : null,
    symbolization: layer.style?.symbolization || null,
    controls: controlsPrefsPayload(layer),
    // Quel formulaire sert cette couche, et si la scene l'offre hors edition.
    // Le formulaire est defini UNE fois, dans la table `Formulaires`, pour une
    // table cible ; mais l'exposer est un choix de scene — on peut vouloir
    // publier le releve du mobilier ici et pas ailleurs, alors que la table est
    // la meme. Le reglage voyage donc avec la couche, comme les controles.
    formulaire: formulairePrefsPayload(layer),
    declarative: declarativeFromAtlasLayer(layer),
  };
}

/** `null` quand il n'y a rien a dire : une couche sans reglage n'ecrit rien. */
function formulairePrefsPayload(layer) {
  const id = layer?.formulaire?.id || null;
  const expose = layer?.formulaire?.expose === true;
  if (!id && !expose) return null;
  return { id, expose };
}

/**
 * Applique prefs Atlas (priorité utilisateur sur manifest import).
 * Visibilité appliquée dès qu'une ligne prefs existe (même sans StyleJSON).
 * @returns {boolean} true si des prefs ont été appliquées
 */
export function applyLayerPrefsBinding(layer, prefs) {
  if (!prefs) return false;
  let applied = false;

  if (prefs.style) {
    const payload = prefs.style;

    if (payload.declarative) {
      layer._declarative = payload.declarative;
      applyDeclarativeToLayer(layer, payload.declarative);
      // Le déclaratif porte les couleurs ; les réglages d'apparence
      // (opacité, contour, base d'extrusion, étiquette) vivent dans la
      // symbolisation et doivent être restaurés en plus, pas à la place.
      mergeAppearancePrefs(layer, payload.symbolization);
    } else if (payload.symbolization) {
      layer.style = { ...layer.style, mode: payload.mode || 'mapbox', symbolization: payload.symbolization };
    }

    if (payload.polygonMode) {
      layer.style = { ...layer.style, polygonMode: payload.polygonMode };
    }

    // Le tri effectif revient à l'appelant, qui voit toutes les couches.
    if (Number.isFinite(payload.rank)) layer._rank = payload.rank;

    // `expose` doit valoir vrai, pas seulement etre present : une valeur
    // heritee d'un enregistrement ancien ne doit pas ouvrir un formulaire a un
    // lecteur sans que personne l'ait decide.
    if (payload.formulaire) {
      layer.formulaire = {
        id: payload.formulaire.id || null,
        expose: payload.formulaire.expose === true,
      };
    }

    if (payload.controls?.length) {
      applyControlsFromPrefs(layer, payload.controls);
    } else if (Array.isArray(payload._controls)) {
      applyControlsFromPrefs(layer, payload._controls);
    }
    applied = true;
  }

  if (prefs.prefRowId != null) {
    layer.visible = parseGristBool(prefs.visible, true);
    layer._prefRowId = prefs.prefRowId;
    applied = true;
  }

  return applied;
}

/** Applique controls[] d'une entrée Scene Manifest layer. */
export function applyManifestControlsToLayer(layer, manifestLayer) {
  const controls = manifestLayer?.controls;
  if (!controls?.length) return;
  applyControlDeclarativesToLayer(layer, controls, { activateDefaults: false });
}

/** Met à jour _declarative couche après édition symbo (round-trip). */
export function syncLayerDeclarative(layer) {
  layer._declarative = declarativeFromAtlasLayer(layer);
}

export { controlDeclarativesFromAtlasLayer, applyControlDeclarativesToLayer };

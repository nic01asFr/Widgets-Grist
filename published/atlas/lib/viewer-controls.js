/**
 * Contrôles environnement / widget — scene.viewerControls
 * Spec : docs/superpowers/specs/2026-07-30-atlas-controls-system-design.md
 */

const CATALOG_IDS = ['sun', 'view3d', 'basemap'];

/** @returns {import('./viewer-controls.js?v=1.14.2').ViewerControl[]} */
export function createDefaultViewerControls() {
  return [
    { id: 'sun', type: 'sun', label: 'Soleil & date', exposed: false, config: { shadows: true } },
    { id: 'view3d', type: 'view3d', label: 'Vue 2D / 3D', exposed: false, config: {} },
    { id: 'basemap', type: 'basemap', label: 'Fonds de plan', exposed: false, config: { allowed: [] } },
  ];
}

/** @param {import('./viewer-controls.js?v=1.14.2').ViewerControl[]|null|undefined} list @param {string} id */
export function getViewerControl(list, id) {
  return (list || []).find((c) => c.id === id);
}

/** Alias produit « visible en lecture » → champ `exposed` en JSON. */
function readExposed(decl) {
  if (decl?.exposed != null) return !!decl.exposed;
  if (decl?.visible != null) return !!decl.visible;
  return null;
}

/** @param {import('./viewer-controls.js?v=1.14.2').ViewerControl[]} list @param {string} id @param {boolean} exposed */
export function setViewerExposed(list, id, exposed) {
  const c = getViewerControl(list, id);
  if (c) c.exposed = !!exposed;
  return list;
}

/** Contrôles env visibles en lecture. */
export function listExposedViewerControls(list) {
  return (list || []).filter((c) => c.exposed);
}

/** @param {import('./viewer-controls.js?v=1.14.2').ViewerControl[]} list */
export function serializeViewerControls(list) {
  return (list || []).map((c) => ({
    id: c.id,
    type: c.type,
    label: c.label,
    exposed: !!c.exposed,
    config: c.config ? { ...c.config } : {},
  }));
}

/** @param {unknown} raw */
export function parseViewerControls(raw) {
  const base = createDefaultViewerControls();
  if (!Array.isArray(raw)) return base;
  for (const decl of raw) {
    if (!decl || typeof decl !== 'object') continue;
    const c = base.find((x) => x.id === decl.id);
    if (!c) continue;
    const exp = readExposed(decl);
    if (exp != null) c.exposed = exp;
    if (decl.label) c.label = String(decl.label);
    if (decl.config && typeof decl.config === 'object') {
      c.config = { ...c.config, ...decl.config };
    }
  }
  return base;
}

function layerIds(state) {
  return new Set((state?.layers || []).map((l) => l.id || l.name).filter(Boolean));
}

function timeOfDayOf(state) {
  if (state?.timeOfDay != null) return state.timeOfDay;
  return state?.settings?.timeOfDay;
}

/** Heuristique V+ — profil transition entre deux états récit. */
export function suggestTransitionProfile(stateA, stateB) {
  const idsA = layerIds(stateA);
  const idsB = layerIds(stateB);
  let same = idsA.size === idsB.size;
  if (same) {
    for (const id of idsA) {
      if (!idsB.has(id)) same = false;
    }
  }
  if (!same) return 'cut';

  const ca = stateA?.camera || {};
  const cb = stateB?.camera || {};
  const camDelta = Math.abs((ca.zoom || 0) - (cb.zoom || 0)) > 0.3
    || Math.abs((ca.pitch || 0) - (cb.pitch || 0)) > 5
    || Math.abs((ca.bearing || 0) - (cb.bearing || 0)) > 5;

  const ctrlTouch = (stateA?.layers || []).some((l) => {
    const key = l.id || l.name;
    const o = (stateB?.layers || []).find((x) => (x.id || x.name) === key);
    return JSON.stringify(l.controls || []) !== JSON.stringify(o?.controls || []);
  });

  if (ctrlTouch && camDelta) return 'morph';
  if (camDelta || timeOfDayOf(stateA) !== timeOfDayOf(stateB)) return 'ease';
  return 'cut';
}

export { CATALOG_IDS };

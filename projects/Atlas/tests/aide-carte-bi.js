// Aides des tests du composant carte BI : carte MapLibre simulée et réseau de fenêtres en mémoire (aucun navigateur).

/** Carte simulée : enregistre sources, calques et états ; émet à la demande (`emit`). */
export function carteSimulee() {
  const sources = new Map(), calques = [], etats = new Map(), ecouteurs = new Map(), images = new Set();
  const m = {
    sources, calques, etats,
    addSource: (id, s) => sources.set(id, { ...s, setData(d) { this.data = d; } }), getSource: (id) => sources.get(id), removeSource: (id) => sources.delete(id),
    addLayer: (l, avant) => { const i = avant ? calques.findIndex((x) => x.id === avant) : -1; if (i >= 0) calques.splice(i, 0, l); else calques.push(l); },
    getLayer: (id) => calques.find((l) => l.id === id), removeLayer: (id) => { const i = calques.findIndex((l) => l.id === id); if (i >= 0) calques.splice(i, 1); },
    setFilter() {}, setLayoutProperty(id, k, v) { const l = calques.find((x) => x.id === id); if (l) l.layout = { ...(l.layout || {}), [k]: v }; }, getLayoutProperty: (id, k) => (calques.find((x) => x.id === id)?.layout || {})[k],
    setPaintProperty() {}, getPaintProperty: () => null, getStyle: () => ({ layers: calques, glyphs: '' }),
    setFeatureState: ({ source, id }, e) => etats.set(source + '|' + id, { ...(etats.get(source + '|' + id) || {}), ...e }),
    hasImage: (i) => images.has(i), addImage: (i) => images.add(i), removeImage: (i) => images.delete(i),
    on: (t, f) => { if (!ecouteurs.has(t)) ecouteurs.set(t, []); ecouteurs.get(t).push(f); }, emit: (t, e) => (ecouteurs.get(t) || []).forEach((f) => f(e)), once() {}, off() {},
    getCanvas: () => ({ style: {} }), getCanvasContainer: () => new EventTarget(), queryRenderedFeatures: () => [],
    fitBounds(b) { m.dernierCadre = b; }, flyTo() {}, jumpTo() {}, resize() {}, project: () => ({ x: 0, y: 0 }),
    getCenter: () => ({ lng: 2.4, lat: 46.6 }), getZoom: () => 5, getPitch: () => 0, getBearing: () => 0, isStyleLoaded: () => true, dragPan: { enable() {}, disable() {} }, setGlyphs() {},
  };
  return m;
}

export const point = (lng, lat, props, id) => ({ type: 'Feature', id, geometry: { type: 'Point', coordinates: [lng, lat] }, properties: props });
export const MANIFESTE = { layers: [{ id: 'sites', name: 'Sites', geometry_type: 'Point', cle: 'ref', controls: [{ id: 'f-type', field: 'type', type: 'select' }] }] };
export const DONNEES = { sites: [point(5.1, 43.2, { nom: 'Alpha', ref: 'A', type: 'x' }, 1), point(5.2, 43.3, { nom: 'Bravo', ref: 'B', type: 'y' }, 2), point(5.3, 43.4, { nom: 'Charlie', ref: 'C', type: 'x' }, 3)] };

/**
 * Deux fenêtres reliées en mémoire, avec la sémantique de `postMessage` : le message n'est livré que si `targetOrigin`
 * correspond à l'origine de la fenêtre destinataire (ou vaut '*', consigné dans `joker`), de façon asynchrone, avec `origin`
 * (celle de l'émetteur) et `source` (la fenêtre émettrice, telle que le destinataire la voit).
 *
 * @returns {{hote:object, atlas:object, atlasVuDeLHote:object, hoteVuDeAtlas:object, journal:object[], joker:object[]}}
 *   `hote`/`atlas` : fenêtres (addEventListener) ; `atlasVuDeLHote` : ce que l'hôte tient pour `iframe.contentWindow` ;
 *   `hoteVuDeAtlas` : ce qu'Atlas tient pour `window.parent`
 */
export function reseau({ origineHote = 'https://hote.test', origineAtlas = 'https://atlas.test' } = {}) {
  const journal = [], joker = [];
  const fenetre = (origine) => { const l = new Set(); return { origine, addEventListener: (t, f) => t === 'message' && l.add(f), removeEventListener: (t, f) => l.delete(f), ecouteurs: l, location: { search: '' } }; };
  const hote = fenetre(origineHote), atlas = fenetre(origineAtlas);
  const envoi = (de, vers, vuePar) => ({ postMessage(msg, targetOrigin) {
    journal.push({ de: de.origine, vers: vers.origine, targetOrigin, msg });
    if (targetOrigin === '*') joker.push({ de: de.origine, msg });
    if (targetOrigin !== '*' && targetOrigin !== vers.origine) return;
    const copie = JSON.parse(JSON.stringify(msg));
    queueMicrotask(() => { for (const f of [...vers.ecouteurs]) f({ data: copie, origin: de.origine, source: vuePar }); });
  } });
  const atlasVuDeLHote = {}, hoteVuDeAtlas = {};
  Object.assign(atlasVuDeLHote, envoi(hote, atlas, hoteVuDeAtlas));
  Object.assign(hoteVuDeAtlas, envoi(atlas, hote, atlasVuDeLHote));
  atlas.parent = hoteVuDeAtlas;
  return { hote, atlas, atlasVuDeLHote, hoteVuDeAtlas, journal, joker };
}

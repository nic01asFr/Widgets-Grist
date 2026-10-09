/**
 * Fond de plan de la carte BI : bascule entre le fond d'Atlas, un plan en aplats, la photographie aérienne et un fond uni.
 * Reçoit l'objet `map` (MapLibre) ; mémorise ce qu'il change pour tout rétablir.
 */
import { planOMT, deriverStyleIGN, PLAN_DEFAUT, FONDS } from './fond-plan.js';

export const URL_STYLE_IGN = 'https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/standard.json';
export const URL_ORTHO = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
const HORS_FOND = /^(bi-|layer-|atlas-|fond-)/;

export function creerFond(map, { fetchStyle = (u) => fetch(u).then((r) => r.json()) } = {}) {
  let mode = 'atlas', styleIGN = null, glyphsOrigine = null; const memoire = new Map(); let ajouts = { couches: [], sources: [] };
  const estBase = (l) => !HORS_FOND.test(l.id) && (l.type === 'background' || l.source === 'openmaptiles' || l.source === 'ne2_shaded');
  const base = () => map.getStyle().layers.filter(estBase);
  const ancre = () => { const l = map.getStyle().layers.find((x) => !estBase(x) && !x.id.startsWith('fond-')); return l ? l.id : undefined; };

  function retablir() {
    for (const id of ajouts.couches) if (map.getLayer(id)) map.removeLayer(id);
    for (const id of ajouts.sources) if (map.getSource(id)) map.removeSource(id);
    ajouts = { couches: [], sources: [] };
    for (const [id, m] of memoire) { if (!map.getLayer(id)) continue; map.setLayoutProperty(id, 'visibility', m.visibility); for (const [k, v] of Object.entries(m.paint)) { try { map.setPaintProperty(id, k, v); } catch (e) { /* propriété sans objet */ } } }
    memoire.clear(); if (glyphsOrigine) { try { map.setGlyphs(glyphsOrigine); } catch (e) { /* ancien MapLibre */ } glyphsOrigine = null; }
  }
  function retenir(l, props) { if (memoire.has(l.id)) return; const paint = {}; for (const k of props) paint[k] = map.getPaintProperty(l.id, k); memoire.set(l.id, { visibility: map.getLayoutProperty(l.id, 'visibility') || 'visible', paint }); }
  function peindre(l, p) { retenir(l, Object.keys(p.paint)); map.setLayoutProperty(l.id, 'visibility', p.visibility); for (const [k, v] of Object.entries(p.paint)) { try { map.setPaintProperty(l.id, k, v); } catch (e) { /* propriété non applicable à ce type */ } } }
  function masquerBase(sauf = () => false) { for (const l of base()) { if (sauf(l)) continue; retenir(l, []); map.setLayoutProperty(l.id, 'visibility', 'none'); } }

  return {
    get mode() { return mode; }, FONDS,
    async appliquer(m, jetons = {}) {
      const J = { ...PLAN_DEFAUT, ...jetons }; if (!FONDS[m]) throw new Error('fond inconnu : ' + m);
      retablir(); mode = m;
      if (m === 'atlas' || m === 'voile') return { mode: m };
      if (m === 'uni') { masquerBase((l) => l.type === 'background' && l.id === 'background'); const bg = base().find((l) => l.type === 'background'); if (bg) peindre(bg, { visibility: 'visible', paint: { 'background-color': J.fond } }); return { mode: m }; }
      if (m === 'plan') {
        const couches = base().map((l) => ({ ...l, sl: l['source-layer'] })); const plan = planOMT(couches, J); const parId = new Map(plan.map((p) => [p.id, p]));
        for (const l of base()) { const p = parId.get(l.id) || { visibility: 'none', paint: {} }; peindre(l, p); }
        return { mode: m, couches: plan.filter((p) => p.visibility === 'visible').length };
      }
      if (m === 'plan-ign') {
        if (!styleIGN) styleIGN = await fetchStyle(URL_STYLE_IGN);
        const derive = deriverStyleIGN(styleIGN, J); const avant = ancre();
        masquerBase((l) => l.type === 'background' && l.id === 'background'); const bg = base().find((l) => l.type === 'background'); if (bg) peindre(bg, { visibility: 'visible', paint: { 'background-color': J.fond } });
        for (const [id, s] of Object.entries(derive.sources)) { map.addSource(id, s); ajouts.sources.push(id); }
        glyphsOrigine = map.getStyle().glyphs; try { map.setGlyphs(derive.glyphs); } catch (e) { /* ancien MapLibre */ }
        for (const c of derive.layers) { map.addLayer(c, avant); ajouts.couches.push(c.id); }
        return { mode: m, couches: derive.layers.length };
      }
      if (m === 'photo') {
        masquerBase(); map.addSource('fond-photo', { type: 'raster', tiles: [URL_ORTHO], tileSize: 256, maxzoom: 19, attribution: '© IGN – Géoplateforme' }); ajouts.sources.push('fond-photo');
        map.addLayer({ id: 'fond-photo', type: 'raster', source: 'fond-photo' }, ancre()); ajouts.couches.push('fond-photo'); return { mode: m };
      }
      return { mode: m };
    },
    retablir() { retablir(); mode = 'atlas'; },
  };
}

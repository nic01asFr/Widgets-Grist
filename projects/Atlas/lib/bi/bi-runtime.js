/**
 * Runtime BI : des couches de dataviz posées sur une carte MapLibre (celle d'Atlas), pilotées par une application hôte.
 *
 * Aucune dépendance à l'intérieur d'app_v7.js : le runtime reçoit l'objet `map`. Il réutilise les modules purs d'Atlas
 * (contrôles/filtres, expressions de couleur) pour que « filtrer » et « classer » veuillent dire la même chose ici et dans Atlas.
 *
 * API (contrat 0.3) : setScene, setLayerVisibility, setFilter, setTime, play, pause, select, highlight, flyTo, fitTo,
 * setTheme, setVisual, updateFeature, setEdition, setFond, getLegend, getRows, resize ;
 * couches administratives (admin-runtime.js) : addAdminLayer, removeLayer, setChoropleth, setStatistique, drillDown, drillUp, setDrillAuto, setUnitFilter.
 */
import { expressionFiltreControles, buildControlPredicate } from '../controls.js?v=20261002a';
import { expressionCouleurDeclarative } from '../declarative-style.js?v=20261001a';
import { agreger } from './agregats.js';
import { rampe, seuilsQuantiles, classeDe } from './echelles.js';
import { modeleLegende, lignesLegende } from './legende.js';
import { executerBatch } from './pont.js';
import { creerFond } from './fond.js';
import { planMonochrome } from './fond-plan.js';
import { ajouterIcones } from './icones-etats.js';
import { creerLecture, valeursDuDomaine } from './lecture-temps.js';
import { creerAdmin } from './admin-runtime.js';
import { creerSurveillance, fondPourConnexion } from './repli.js';

export const VERSION = '0.3';
const PREF = 'bi-';
const THEME_DEFAUT = Object.freeze({
  jetons: {}, categories: ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7'],
  sequentielle: ['#f7fbff', '#9ecae1', '#3182bd', '#08306b'], divergente: ['#b2182b', '#f7f7f7', '#2166ac'],
  selection: '#111111', survol: '#ffffff', contour: '#ffffff', lavis: null, texte: '#1f1f1f', police: 'system-ui, sans-serif',
});
const nombre = (v) => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const copie = (o) => JSON.parse(JSON.stringify(o));

export function attacher(map, opts = {}) {
  let theme = { ...THEME_DEFAUT, ...(opts.theme || {}) };
  const couches = new Map();         // id -> couche
  let selection = null, survol = null, emetteur = () => {}, camApi = false;
  const ecouteurs = new Map();       // type -> Set(cb)
  const fond = creerFond(map); let modeFond = 'atlas';
  const emettre = (type, charge, origine) => { try { emetteur(type, charge, origine); } catch (e) { /* le transport ne doit pas casser la carte */ } for (const cb of ecouteurs.get(type) || []) cb(charge); };

  // ---------- jetons ----------
  const resoudre = (c) => { if (typeof c !== 'string') return c; const m = /^jeton:(.+)$/.exec(c); return m ? (theme.jetons[m[1]] || '#808080') : c; };
  function declaratifResolu(decl) {
    if (!decl) return null; const d = copie(decl);
    if (d.color) d.color = resoudre(d.color);
    for (const s of d.stops || []) s.color = resoudre(s.color);
    return d;
  }

  // ---------- couche ----------
  function creerCouche(def, features) {
    features.forEach((f, i) => { if (f.id === undefined || f.id === null) f.id = i + 1; });
    const c = { id: def.id, def, features, parId: new Map(features.map((f) => [f.id, f])), visible: true, controles: (def.controls || []).map((x) => ({ ...x, active: !!x.active })), ids: [], visuel: { type: 'cercles', ...(def.visuel || {}) }, vue: features };
    c.layerLike = { id: def.id, geojson: { type: 'FeatureCollection', features }, controls: c.controles };
    return c;
  }
  const idSrc = (c) => PREF + 'src-' + c.id, idAgg = (c) => PREF + 'agg-' + c.id;
  const geom = (c) => { const g = String(c.def.geometry_type || '').toLowerCase(); return g.startsWith('poly') ? 'polygon' : g.startsWith('line') ? 'line' : 'point'; };
  const ajouterCalque = (c, spec, avant) => { map.addLayer(spec, avant && map.getLayer(avant) ? avant : undefined); c.ids.push(spec.id); };

  function monter(c) {
    const decl = declaratifResolu(c.def.style?.declarative) || { kind: 'single', color: theme.categories[0] };
    const couleur = expressionCouleurDeclarative(decl, '#9a9a9a') || '#9a9a9a';
    map.addSource(idSrc(c), { type: 'geojson', data: { type: 'FeatureCollection', features: c.features }, ...(c.admin ? { promoteId: 'code', tolerance: 0.6, ...(c.admin.meta && c.admin.meta.attribution ? { attribution: c.admin.meta.attribution } : {}) } : {}) });
    const v = c.visuel, g = geom(c), sel = ['boolean', ['feature-state', 'selected'], false], hl = ['boolean', ['feature-state', 'highlight'], false];
    if (g === 'polygon' && v.type === 'choroplethe') {
      const avant = [...couches.values()].filter((k) => !k.admin).map((k) => k.ids[0]).find((id) => id && map.getLayer(id));
      admin.monter(c, avant);
    } else if (g === 'point' && v.type === 'heat') {
      const poids = v.poids ? ['interpolate', ['linear'], ['to-number', ['get', v.poids], 0], 0, 0, v.poidsMax || 1, 1] : 1, rampeC = rampe(theme.sequentielle);
      ajouterCalque(c, { id: PREF + 'heat-' + c.id, type: 'heatmap', source: idSrc(c), paint: { 'heatmap-weight': poids, 'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 15, 1.6], 'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 8 * (v.rayon || 1), 16, 38 * (v.rayon || 1)],
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.15, rampeC(0.25), 0.4, rampeC(0.5), 0.7, rampeC(0.8), 1, rampeC(1)], 'heatmap-opacity': v.opacite ?? 0.85 } });
      if (v.points) ajouterCalque(c, { id: PREF + 'pts-' + c.id, type: 'circle', source: idSrc(c), minzoom: v.points, paint: { 'circle-radius': 4, 'circle-color': couleur, 'circle-stroke-width': ['case', sel, 3, 1], 'circle-stroke-color': ['case', sel, theme.selection, theme.contour] } });
    } else if (g === 'point' && (v.type === 'hex' || v.type === 'grille')) {
      map.addSource(idAgg(c), { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      const ext = !!v.extrusion;
      ajouterCalque(c, ext ? { id: PREF + 'agg-' + c.id, type: 'fill-extrusion', source: idAgg(c), paint: { 'fill-extrusion-color': ['coalesce', ['get', '_couleur'], '#cccccc'], 'fill-extrusion-height': ['*', ['coalesce', ['get', '_h'], 0], v.hauteurMax || 400], 'fill-extrusion-opacity': 0.88 } }
        : { id: PREF + 'agg-' + c.id, type: 'fill', source: idAgg(c), paint: { 'fill-color': ['coalesce', ['get', '_couleur'], '#cccccc'], 'fill-opacity': v.opacite ?? 0.8, 'fill-outline-color': theme.contour } });
    } else if (g === 'point' && v.type === 'etats') {
      const ids = ajouterIcones(map, v.etats || {}, { resoudre: (cc) => resoudre(cc) }); const cles = Object.keys(ids);
      const icone = cles.length ? ['match', ['get', v.champEtat || 'etat'], ...cles.flatMap((k) => [k, ids[k]]), ids[cles[0]]] : '';
      const police = theme.policeSymboles || (map.getLayer('label_city') && map.getLayoutProperty('label_city', 'text-font')) || ['Noto Sans Regular'];
      ajouterCalque(c, { id: PREF + 'anneau-' + c.id, type: 'circle', source: idSrc(c), paint: { 'circle-radius': ['case', sel, 24, 0], 'circle-color': 'rgba(255,255,255,0.75)', 'circle-stroke-width': ['case', sel, 3, 0], 'circle-stroke-color': theme.selection } });
      ajouterCalque(c, { id: PREF + 'pts-' + c.id, type: 'symbol', source: idSrc(c), layout: { 'icon-image': icone, 'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.55, 14, 0.9, 17, 1.1], 'icon-allow-overlap': true, 'text-field': v.texte ? ['to-string', ['coalesce', ['get', v.texte], '–']] : '', 'text-font': police, 'text-size': 12, 'text-allow-overlap': true, 'text-offset': [0, 0.1] }, paint: { 'text-color': '#000000', 'text-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0, 12, 1] } });
    } else if (g === 'point') {
      const rayon = v.type === 'proportionnel' && v.champ ? ['interpolate', ['linear'], ['to-number', ['get', v.champ], 0], v.min ?? 0, v.rMin ?? 4, v.max ?? 100, v.rMax ?? 22] : (v.rayon ?? 6);
      ajouterCalque(c, { id: PREF + 'pts-' + c.id, type: 'circle', source: idSrc(c), paint: { 'circle-radius': ['case', hl, ['+', rayon, 3], rayon], 'circle-color': couleur, 'circle-opacity': 0.9, 'circle-stroke-width': ['case', sel, 3, hl ? 2 : 1], 'circle-stroke-color': ['case', sel, theme.selection, theme.contour] } });
    } else if (g === 'polygon') {
      ajouterCalque(c, { id: PREF + 'fill-' + c.id, type: 'fill', source: idSrc(c), paint: { 'fill-color': couleur, 'fill-opacity': ['case', sel, 0.95, 0.72] } });
      ajouterCalque(c, { id: PREF + 'line-' + c.id, type: 'line', source: idSrc(c), paint: { 'line-color': ['case', sel, theme.selection, theme.contour], 'line-width': ['case', sel, 3, 1] } });
    } else {
      ajouterCalque(c, { id: PREF + 'line-' + c.id, type: 'line', source: idSrc(c), paint: { 'line-color': couleur, 'line-width': ['case', sel, 6, 3] } });
    }
    appliquerVue(c);
  }
  function demonter(c) { for (const id of c.ids) if (map.getLayer(id)) map.removeLayer(id); c.ids = []; for (const s of [idSrc(c), idAgg(c)]) if (map.getSource(s)) map.removeSource(s); }

  // le lavis : un voile uni sur le fond de carte (sous les couches BI), pour que la donnée prime sur le fond
  function poserLavis() {
    if (map.getLayer(PREF + 'lavis')) map.removeLayer(PREF + 'lavis');
    if (!theme.lavis || modeFond !== 'voile') return; // le voile n'a de sens que sur le fond d'Atlas : un plan en aplats est déjà pâle
    const premier = [...couches.values()].map((c) => c.ids[0]).find((id) => id && map.getLayer(id));
    map.addLayer({ id: PREF + 'lavis', type: 'background', paint: { 'background-color': theme.lavis.couleur, 'background-opacity': theme.lavis.opacite ?? 0.6 } }, premier);
  }
  // ---------- filtres et temps ----------
  function controlesActifs(c) { return c.controles.filter((x) => x.active); }
  function appliquerVue(c) {
    const pred = buildControlPredicate(c.layerLike);
    c.vue = pred ? c.features.filter(pred) : c.features;
    const expr = expressionFiltreControles(c.layerLike);
    for (const id of c.ids) { const spec = map.getLayer(id); if (spec && spec.type !== 'fill-extrusion' && !id.startsWith(PREF + 'agg-')) map.setFilter(id, expr || null); }
    if (c.visuel.type === 'hex' || c.visuel.type === 'grille') recalculerAgregats(c);
    admin.surVueChangee(c.id);
  }
  function recalculerAgregats(c) {
    const v = c.visuel, forme = v.type === 'hex' ? 'hexagone' : 'carre';
    const gj = agreger(c.vue, { taille: v.taille || 600, champ: v.champ || null, forme });
    const metrique = (p) => (v.metrique === 'moyenne' ? p.moyenne : v.metrique === 'somme' ? p.somme : p.n);
    const vals = gj.features.map((f) => metrique(f.properties)).filter(Number.isFinite), seuils = seuilsQuantiles(vals, 5), rp = rampe(theme.sequentielle), max = Math.max(1, ...vals);
    for (const f of gj.features) { const m = metrique(f.properties), k = classeDe(m, seuils); f.properties._couleur = rp(seuils.length ? (k + 1) / (seuils.length + 1) : 0.6); f.properties._h = Number.isFinite(m) ? m / max : 0; f.properties._m = m; }
    c.agg = { ...gj.stats, seuils, metrique: v.metrique || 'n' };
    const src = map.getSource(idAgg(c)); if (src) src.setData(gj);
  }
  const controle = (id) => { for (const c of couches.values()) { const x = c.controles.find((k) => k.id === id); if (x) return { c, x }; } return null; };
  function majFiltre(controlId, valeur) {
    const t = controle(controlId); if (!t) throw new Error('contrôle inconnu : ' + controlId);
    const { c, x } = t;
    if (valeur === null) { x.active = false; delete x.values; delete x.min; delete x.max; x.texte = ''; }
    else if (x.type === 'select') { x.active = true; x.values = Array.isArray(valeur) ? valeur.map(String) : [String(valeur)]; }
    else if (x.type === 'range' || x.type === 'time') { x.active = true; x.min = valeur.min ?? undefined; x.max = valeur.max ?? undefined; x.variant = x.min !== undefined && x.max !== undefined ? 'range_between' : x.min !== undefined ? 'range_min' : 'range_max'; }
    else if (x.type === 'text') { x.active = true; x.texte = String(valeur); }
    appliquerVue(c);
    return { layer: c.id, compte: c.vue.length, total: c.features.length };
  }
  // le temps : un contrôle `range` interne par couche portant un champ temporel
  const temps = { champ: null, min: null, max: null, valeur: null, mode: 'instant', lecture: null, raf: null, dernier: 0, largeur: 1 };
  function configurerTemps(m) {
    const t = m.temps || null; if (!t) return;
    temps.champ = t.champ; temps.mode = t.mode || 'instant'; temps.largeur = t.largeur || 1;
    const vals = []; for (const c of couches.values()) if (c.def.temps !== false) for (const f of c.features) { const n = nombre(f.properties?.[t.champ]); if (Number.isFinite(n)) vals.push(n); }
    if (vals.length) { temps.min = Math.min(...vals); temps.max = Math.max(...vals); temps.valeur = t.valeur ?? temps.max; }
    temps.pas = t.pas || 1;
  }
  function poserTemps(v) {
    if (!temps.champ) throw new Error('aucun champ temporel déclaré (manifest.temps.champ)');
    const t = typeof v === 'number' ? v : (v.max ?? v.min); temps.valeur = t;
    const f = temps.mode === 'cumul' ? { min: temps.min, max: t } : temps.mode === 'glissante' ? { min: t - temps.largeur + 1, max: t } : { min: t, max: t };
    for (const c of couches.values()) {
      if (c.def.temps === false) continue;
      let x = c.controles.find((k) => k.id === '__temps'); if (!x) { x = { id: '__temps', field: temps.champ, type: 'range', active: true, entier: true }; c.controles.push(x); }
      x.active = true; x.min = f.min; x.max = f.max; x.variant = 'range_between'; x.requireValue = true; appliquerVue(c);
    }
    return { valeur: t, fenetre: f };
  }
  function boucleLecture(ts) {
    if (!temps.lecture || !temps.lecture.enCours()) { temps.raf = null; return; }
    const dt = ts - (temps.dernier || ts); temps.dernier = ts; const nv = temps.lecture.avancer(dt);
    if (nv !== null) { poserTemps(nv); emettre('time', { valeur: nv, lecture: true }, 'utilisateur'); }
    temps.raf = requestAnimationFrame(boucleLecture);
  }

  // ---------- sélection, survol, caméra ----------
  const calquesInteractifs = () => [...couches.values()].filter((c) => c.visible).flatMap((c) => c.ids.filter((id) => !id.includes('heat-') && !id.includes('agg-')).map((id) => ({ id, c })));
  function etat(c, id, patch) { if (c.visuel.type === 'hex' || c.visuel.type === 'grille' || c.visuel.type === 'heat') { if (!map.getSource(idSrc(c))) return; } map.setFeatureState({ source: idSrc(c), id }, patch); }
  function poserSelection(c, id) {
    if (selection) etat(selection.c, selection.id, { selected: false });
    selection = c && id !== null ? { c, id } : null;
    if (selection) etat(c, id, { selected: true });
  }
  const cle = (c, f) => (c.def.cle ? f.properties?.[c.def.cle] : undefined);
  function surClic(e) {
    const hit = calquesInteractifs(); if (!hit.length) return;
    const fs = map.queryRenderedFeatures(e.point, { layers: hit.map((h) => h.id).filter((id) => map.getLayer(id)) });
    if (opts.edition && opts.edition.actif && !fs.length) { emettre('edit', { op: 'add', layer: opts.edition.couche, geometry: { type: 'Point', coordinates: [e.lngLat.lng, e.lngLat.lat] } }, 'utilisateur'); return; }
    if (!fs.length) { if (selection) { poserSelection(null, null); emettre('select', { layer: null, featureId: null }, 'utilisateur'); } return; }
    const f = fs[0], c = [...couches.values()].find((k) => f.layer.id.endsWith(k.id) && f.source === idSrc(k)); if (!c) return;
    poserSelection(c, f.id); emettre('select', { layer: c.id, featureId: f.id, key: c.admin ? f.id : cle(c, f), ...(c.admin ? admin.infosUnite(c, f.id) : {}) }, 'utilisateur');
  }
  let rafSurvol = 0;
  function surSurvol(e) {
    if (rafSurvol) return; rafSurvol = requestAnimationFrame(() => { rafSurvol = 0;
      const hit = calquesInteractifs().map((h) => h.id).filter((id) => map.getLayer(id)); if (!hit.length) return;
      const fs = map.queryRenderedFeatures(e.point, { layers: hit }); map.getCanvas().style.cursor = fs.length ? 'pointer' : '';
      const f = fs[0], k = f ? f.id : null; if ((survol && survol.id) === k) return;
      if (survol && survol.admin) { try { map.setFeatureState({ source: survol.source, id: survol.id }, { hover: false }); } catch (e) { /* source retirée */ } }
      const c = f && [...couches.values()].find((q) => f.source === idSrc(q));
      survol = f ? { layer: f.layer.id, id: f.id, admin: !!(c && c.admin), source: f.source } : null;
      if (survol && survol.admin) map.setFeatureState({ source: survol.source, id: survol.id }, { hover: true });
      emettre('hover', { layer: c ? c.id : null, featureId: k, ...(c && c.admin ? admin.infosUnite(c, k) : {}) }, 'utilisateur'); });
  }
  let tmCam = 0;
  function surFinMouvement() { clearTimeout(tmCam); tmCam = setTimeout(() => { const ce = map.getCenter(); emettre('camera', { center: [ce.lng, ce.lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() }, camApi ? 'api' : 'utilisateur'); camApi = false; }, 120); }
  map.on('click', surClic); map.on('mousemove', surSurvol); map.on('moveend', surFinMouvement);

  // ---------- édition (déplacement d'un point ; l'hôte persiste) ----------
  let glisse = null;
  map.on('mousedown', (e) => { if (!(opts.edition && opts.edition.actif) || !selection) return; const c = selection.c; if (c.id !== opts.edition.couche) return;
    const fs = map.queryRenderedFeatures(e.point, { layers: c.ids.filter((id) => map.getLayer(id)) }); if (fs.length && fs[0].id === selection.id) { glisse = { c, id: selection.id }; map.dragPan.disable(); map.getCanvas().style.cursor = 'grabbing'; } });
  map.on('mousemove', (e) => { if (!glisse) return; const f = glisse.c.parId.get(glisse.id); f.geometry.coordinates = [e.lngLat.lng, e.lngLat.lat]; map.getSource(idSrc(glisse.c)).setData({ type: 'FeatureCollection', features: glisse.c.features }); });
  map.on('mouseup', (e) => { if (!glisse) return; const { c, id } = glisse; glisse = null; map.dragPan.enable(); map.getCanvas().style.cursor = ''; const f = c.parId.get(id);
    emettre('edit', { op: 'move', layer: c.id, featureId: id, geometry: { type: 'Point', coordinates: f.geometry.coordinates.slice() } }, 'utilisateur'); if (c.visuel.type === 'hex' || c.visuel.type === 'grille') recalculerAgregats(c); });

  // ---------- couches administratives ----------
  const retirer = (id) => { const c = couches.get(id); if (!c) return; if (selection && selection.c === c) selection = null; demonter(c); couches.delete(id); };
  const ajouter = (def, features, init) => { const c = creerCouche(def, features); if (init) init(c); couches.set(def.id, c); monter(c); poserLavis(); return c; };
  const admin = creerAdmin({ map, couches, PREF, config: opts.admin || {}, horsLigne: () => horsLigne.actif, getTheme: () => theme, resoudre, emettre, retirer, ajouter, api: () => api, ajouterCalque, idSrc, demonter, monter,
    vueSans: (c, ids) => { if (!c.controles.some((x) => x.active && ids.includes(x.id))) return c.vue; const pred = buildControlPredicate({ id: c.id, geojson: c.layerLike.geojson, controls: c.controles.filter((x) => !ids.includes(x.id)) }); return pred ? c.features.filter(pred) : c.features; },
    reappliquerVisibilite: (c) => { if (!c.visible) for (const l of c.ids) map.setLayoutProperty(l, 'visibility', 'none'); }, poserSelection, getSelection: () => selection, majFiltre, camApi: () => { camApi = true; } });

  // ---------- repli hors ligne ----------
  const horsLigne = { actif: false, auto: true, fondAvant: null, cause: null }; const surveillance = creerSurveillance();
  async function basculerHorsLigne(actif, cause, automatique) {
    if (actif === horsLigne.actif) return { actif, auto: horsLigne.auto };
    if (actif) { horsLigne.fondAvant = modeFond; horsLigne.cause = cause; horsLigne.actif = true; try { await api.setFond(fondPourConnexion(modeFond, true), theme.plan || {}); } catch (e) { /* le repli ne doit jamais casser la carte */ } }
    else { horsLigne.actif = false; try { await api.setFond(horsLigne.fondAvant || 'atlas', theme.plan || {}); } catch (e) { /* idem */ } horsLigne.fondAvant = null; }
    emettre('connexion', { etat: actif ? 'hors_ligne' : 'en_ligne', cause, automatique: !!automatique, fond: modeFond }, automatique ? 'utilisateur' : 'api');
    return { actif, auto: horsLigne.auto };
  }
  map.on('error', (ev) => { if (!horsLigne.auto || horsLigne.actif || !ev || !ev.sourceId || !ev.tile) return; if (surveillance.echec()) basculerHorsLigne(true, 'tuiles', true); });
  map.on('data', (ev) => { if (ev && ev.tile && ev.sourceId) surveillance.succes(); });
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('offline', () => { if (horsLigne.auto) basculerHorsLigne(true, 'navigateur', true); });
    window.addEventListener('online', () => { if (horsLigne.auto && horsLigne.actif && horsLigne.cause !== 'hote') basculerHorsLigne(false, 'navigateur', true); });
  }

  // ---------- API ----------
  const api = {
    ping: () => ({ version: VERSION, couches: [...couches.keys()] }),
    async setScene(manifest, donnees = {}) {
      for (const c of couches.values()) demonter(c); couches.clear(); selection = null; admin.pile.length = 0; const erreurs = {};
      for (const def of manifest.layers || []) {
        if (def.admin) { // couche administrative : chargée par le runtime (ou fournie par l'hôte dans `donnees`)
          try { await admin.api.addAdminLayer(def.admin.niveau, { id: def.id, nom: def.name, visuel: def.visuel, filtre: def.admin.filtre, source: def.admin.source, produit: def.admin.produit, cadrer: def.admin.cadrer, donnees: donnees[def.id], controls: def.controls, visible: def.visible }); }
          catch (e) { erreurs[def.id] = String(e && e.message || e); }
          continue;
        }
        const c = creerCouche(def, donnees[def.id] || def.geojson?.features || []); couches.set(def.id, c); monter(c);
      }
      configurerTemps(manifest); poserLavis();
      const compte = Object.fromEntries([...couches].map(([id, c]) => [id, c.features.length]));
      emettre('ready', { layers: compte, temps: temps.champ ? { champ: temps.champ, min: temps.min, max: temps.max, valeur: temps.valeur } : null, ...(Object.keys(erreurs).length ? { erreurs } : {}) }, 'api'); return erreurs && Object.keys(erreurs).length ? { ...compte, _erreurs: erreurs } : compte;
    },
    setLayerVisibility(id, visible) { const c = couches.get(id); if (!c) throw new Error('couche inconnue : ' + id); c.visible = !!visible; for (const l of c.ids) map.setLayoutProperty(l, 'visibility', visible ? 'visible' : 'none'); return visible; },
    setFilter(controlId, valeur) { const r = majFiltre(controlId, valeur); emettre('filter', { controlId, value: valeur, ...r }, 'api'); return r; },
    setTime(v) { const r = poserTemps(v); emettre('time', { valeur: r.valeur, lecture: false }, 'api'); return r; },
    play(o = {}) { if (!temps.champ) throw new Error('aucun champ temporel'); const vals = valeursDuDomaine(temps.min, temps.max, temps.pas);
      temps.lecture = creerLecture({ min: temps.min, max: temps.max, pas: temps.pas, parSeconde: o.parSeconde || 1, boucle: o.boucle !== false, valeur: temps.valeur }); temps.lecture.demarrer(); temps.dernier = 0; temps.raf = requestAnimationFrame(boucleLecture); return { valeurs: vals.length }; },
    pause() { if (temps.lecture) temps.lecture.arreter(); return true; },
    select(id) { if (id === null) { poserSelection(null, null); return null; } for (const c of couches.values()) if (c.parId.has(id)) { poserSelection(c, id); return id; } throw new Error('entité inconnue : ' + id); },
    highlight(ids) { for (const c of couches.values()) for (const f of c.features) if (c.ids.length && (c.visuel.type === 'cercles' || c.visuel.type === 'proportionnel')) etat(c, f.id, { highlight: ids.includes(f.id) }); return ids.length; },
    flyTo(cam) { camApi = true; map.flyTo({ duration: 600, ...cam }); return true; },
    fitTo(arg) { const feats = typeof arg === 'string' ? (couches.get(arg)?.vue || []) : [...couches.values()].flatMap((c) => (Array.isArray(arg) ? c.features.filter((f) => arg.includes(f.id)) : c.vue));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; const vu = (p) => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; };
      const col = (g) => { if (!g) return; const t = g.type; if (t === 'Point') vu(g.coordinates); else if (t === 'MultiPoint' || t === 'LineString') g.coordinates.forEach(vu); else if (t === 'Polygon' || t === 'MultiLineString') g.coordinates.forEach((r) => r.forEach(vu)); else if (t === 'MultiPolygon') g.coordinates.forEach((p) => p.forEach((r) => r.forEach(vu))); };
      for (const f of feats) col(f.geometry);
      if (x0 === Infinity) return false; camApi = true; map.fitBounds([[x0, y0], [x1, y1]], { padding: 60, duration: 600, maxZoom: 16 }); return true; },
    setTheme(t) { theme = { ...theme, ...t, jetons: { ...theme.jetons, ...(t.jetons || {}) } }; const sauve = selection; for (const c of couches.values()) { if (c.admin) { c.admin.sale = true; c.admin.modele = null; } demonter(c); monter(c); if (!c.visible) for (const l of c.ids) map.setLayoutProperty(l, 'visibility', 'none'); } poserLavis(); selection = null; if (sauve) poserSelection(sauve.c, sauve.id); for (const c of couches.values()) if (c.admin) admin.assurer(c); return true; },
    setVisual(id, v) { const c = couches.get(id); if (!c) throw new Error('couche inconnue : ' + id); const { style, ...vis } = v; if (style) c.def.style = style; demonter(c); c.visuel = { ...c.visuel, ...vis }; monter(c); if (!c.visible) api.setLayerVisibility(id, false); return c.visuel; },
    updateFeature(layer, id, patch) { const c = couches.get(layer); const f = c && c.parId.get(id); if (!f) throw new Error('entité inconnue : ' + layer + '/' + id); if (patch.geometry) f.geometry = patch.geometry; if (patch.properties) f.properties = { ...f.properties, ...patch.properties }; map.getSource(idSrc(c)).setData({ type: 'FeatureCollection', features: c.features }); appliquerVue(c); return true; },
    setEdition(layer, actif) { opts.edition = { couche: layer, actif }; return actif; },
    getLegend(layer) { const c = layer ? couches.get(layer) : [...couches.values()][0]; if (!c) throw new Error('couche inconnue'); if (c.admin) return admin.legende(c); const m = modeleLegende(declaratifResolu(c.def.style?.declarative), c.vue, { cle: c.def.name }); const et = c.visuel.etats; if (et) for (const cl of m.classes) { const e = et[cl.cle]; if (e) cl.forme = e.forme; } return { layer: c.id, titre: c.def.name, ...m, agregat: c.agg || null }; },
    getRows(layer, o = {}) { const c = layer ? couches.get(layer) : [...couches.values()][0]; if (!c) throw new Error('couche inconnue'); if (c.admin) return admin.lignes(c, o); return { layer: c.id, lignes: c.vue.map((f) => ({ id: f.id, ...f.properties })), legende: lignesLegende(api.getLegend(c.id)) }; },
    resize() { map.resize(); return true; },
    ...admin.api,
    /** Repli hors ligne : true (forcé), false (retour au fond précédent), 'auto' (détection : événement navigateur et échecs de tuiles). */
    async setHorsLigne(v) {
      if (v === 'auto') { horsLigne.auto = true; return { actif: horsLigne.actif, auto: true }; }
      return basculerHorsLigne(!!v, 'hote', false);
    },
    batch: (ordres, o) => executerBatch(api, ordres, o),
    async setFond(mode, jetons = {}) { const { principal, fondUni, ...autres } = jetons; const J = principal ? { ...planMonochrome(principal, fondUni ? { fond: fondUni } : {}), ...autres } : { ...(theme.plan || {}), ...autres }; const r = await fond.appliquer(mode, J); modeFond = mode; theme = { ...theme, policeSymboles: mode === 'plan-ign' ? ['Source Sans Pro Bold'] : null }; for (const c of couches.values()) if (c.visuel.type === 'etats') { const sel = selection; demonter(c); monter(c); if (sel && sel.c === c) poserSelection(c, sel.id); } if (mode === 'voile' && !theme.lavis) theme = { ...theme, lavis: { couleur: (theme.plan || {}).fond || '#F7F7F7', opacite: 0.62 } }; poserLavis(); return r; },
  };
  const interne = { emettre, poserSelection, infos: (c, id) => admin.infosUnite(c, id) };
  return { api, _interne: interne, on: (t, cb) => { if (!ecouteurs.has(t)) ecouteurs.set(t, new Set()); ecouteurs.get(t).add(cb); }, off: (t, cb) => ecouteurs.get(t)?.delete(cb), brancherEmetteur: (fn) => { emetteur = fn; }, _couches: couches, _map: map };
}

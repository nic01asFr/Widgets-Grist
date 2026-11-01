/**
 * Runtime BI : des couches de dataviz posées sur une carte MapLibre (celle d'Atlas), pilotées par une application hôte.
 *
 * Aucune dépendance à l'intérieur d'app_v7.js : le runtime reçoit l'objet `map`. Il réutilise les modules purs d'Atlas
 * (contrôles/filtres, expressions de couleur) pour que « filtrer » et « classer » veuillent dire la même chose ici et dans Atlas.
 *
 * API (contrat 0.3) : setScene, setLayerVisibility, setFilter, setTime, play, pause, select, highlight, flyTo, fitTo,
 * setTheme, getTheme, setVisual, updateFeature, setEdition, setFond, getLegend, getRows, resize ;
 * couches administratives (admin-runtime.js) : addAdminLayer, removeLayer, setChoropleth, setStatistique, drillDown, drillUp, setDrillAuto, setUnitFilter.
 */
import { attributionSure, attributionTexte } from '../attribution.js?v=1.38.0';
import { expressionFiltreControles, buildControlPredicate } from '../controls.js?v=1.38.0';
import { diagnostiquerCouche } from './diagnostic-donnees.js';
import { expressionCouleurDeclarative } from '../declarative-style.js?v=1.38.0';
import { agreger } from './agregats.js';
import { rampe, seuilsQuantiles, classeDe, estPale } from './echelles.js';
import { modeleLegende, lignesLegende, legendeEtats } from './legende.js';
import { executerBatch, garderApi, normaliserCapacites, ErreurCapacite, VERSION as VERSION_PONT } from './pont.js';
import { creerFond } from './fond.js';
import { ajouterIcones, couleurTexteEtats, TIRET_MARQUEUR, tailleTexte } from './icones-etats.js';
import { opaciteDeclaree, contourPolygone, etiquetteDeclaree, extrusionDeclaree, curseurDeclare, traceLigneDeclare, CURSEURS } from './style-polygone.js';
const CURSEURS_ADMIS = CURSEURS.join(', ');
import { creerLecture, valeursDuDomaine } from './lecture-temps.js';
import { creerAdmin } from './admin-runtime.js';
import { creerSurveillance, diagnosticEchec, estEchecDeTuile, fondPourConnexion } from './repli.js';
import { creerGestionnaire, preferencesDepuisFenetre } from './theme-charte.js';
import { resoudreJeton, avertissementIgnore } from '../charte/resolution.js';
import { assainirJetonsFond } from '../charte/schema.js';
import { planDepuis } from '../charte/derivation.js';
import { verifierPlan } from '../charte/verification.js';
import { variablesInterface, appliquerVariables } from '../charte/interface.js';
import { creerBulle, normaliserBulle } from './bulle.js';
import { normaliserLignes, mettreAJour as mettreAJourLigne } from './tables.js';
import { normaliserMarges, avecConfort, limiterPadding } from './marges.js';

export const VERSION = VERSION_PONT;   // une seule version du contrat : celle du pont
const PREF = 'bi-';
const nombre = (v) => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const copie = (o) => JSON.parse(JSON.stringify(o));
/**
 * Une attribution est du TEXTE : MapLibre l'écrit dans le DOM avec `innerHTML` et son assainissement laisse passer `<iframe srcdoc>`
 * (script exécuté dans l'origine d'Atlas, mesuré le 10/10/2026 avec maplibre-gl 5.6.1). Ce qui vient de l'hôte ou des données est
 * donc échappé : il s'affiche tel quel, il ne s'interprète jamais.
 */
export { attributionTexte };

export function attacher(map, opts = {}) {
  // briques présentes dans ce chargement (voir CAPACITES dans pont.js) ; `paquet` : manifeste de données hors ligne lu, ou null
  const capacites = normaliserCapacites(opts.capacites); const paquet = opts.paquet || null;
  // le thème est la charte résolue (lib/charte/) : défauts d'Atlas, charte de l'hôte, préférence de la personne
  const themes = creerGestionnaire({ theme: opts.theme || null, preferences: opts.preferences !== undefined ? opts.preferences : preferencesDepuisFenetre() });
  let theme = themes.theme;
  const couches = new Map();         // id -> couche
  let selection = null, survol = null, emetteur = () => {}, camApi = false, attributionScene = null;   // `manifest.attribution` de la scène en cours (mention de l'hôte, du texte et des liens sûrs)
  const ecouteurs = new Map();       // type -> Set(cb)
  const fond = creerFond(map); let modeFond = 'atlas', dernierFond = null;   // `dernierFond` : le fond demandé par l'hôte et ses jetons, rejoué quand la charte change (le fond uni et le plan en dépendent)
  let generation = 0;                // change à chaque thème posé : invalide les thèmes de couche déjà calculés
  let marges = null;                 // zone utile : ce que l'hôte a posé sur les côtés de la carte (lib/bi/marges.js), persistant
  // Les marges sont passées en `padding` à CHAQUE déplacement (flyTo, fitBounds), jamais par `map.setPadding` : mesuré en navigateur le 16/10/2026 (MapLibre 5.6.1), `setPadding`
  // combiné à un `padding` de `fitBounds` compte la marge deux fois (une marge de 300 px retirait ~600 px : « Map cannot fit within canvas », la carte restait blanche).
  const poserMarges = (m) => { marges = normaliserMarges(m); if (uiEtat.zone) uiEtat.zone.ajuster(marges); return marges; };
  /** La taille du cadre de la carte, en pixels ; `connu` faux si la carte ne la dit pas (carte simulée). */
  const tailleCadre = () => { const c = typeof map.getContainer === 'function' ? map.getContainer() : null; return c && Number.isFinite(c.clientWidth) ? { w: c.clientWidth, h: c.clientHeight, connu: true } : { w: 0, h: 0, connu: false }; };
  // l’interface optionnelle déclarée par la scène (`manifest.interface` : légende, curseur de temps), modules chargés À LA DEMANDE (lib/bi/ui/)
  const uiEtat = { zone: null, legende: null, temps: null, minuterie: 0 };
  let bulleCtl = null, dernierClic = null;   // la bulle d'objet déclarée par l'hôte (lib/bi/bulle.js) ; `dernierClic` : le point cliqué, pour ancrer la bulle d'une ligne ou d'une surface
  // thème d'exécution = charte résolue + ce qui dépend du fond choisi (police des symboles du Plan IGN, voile)
  const poserTheme = () => {
    generation++; theme = { ...themes.theme, policeSymboles: modeFond === 'plan-ign' ? ['Source Sans Pro Bold'] : null };
    if (modeFond === 'voile' && !theme.lavis) theme.lavis = { couleur: theme.plan.fond || '#F7F7F7', opacite: 0.62 };
    if (bulleCtl) bulleCtl.actualiser();   // l'interface suit la charte
    if (uiEtat.zone) uiEtat.zone.actualiser();
  };
  poserTheme();
  // Thème d'une couche : celui du composant, ou — si la couche porte sa surcharge (`style.charte`, niveau « couche » de la résolution) — le sien.
  const themeDe = (c) => {
    const surcharge = c.def.style && c.def.style.charte; if (!surcharge || typeof surcharge !== 'object') return theme;
    if (!c.themeCouche || c.themeCouche.generation !== generation || c.themeCouche.surcharge !== surcharge) c.themeCouche = { generation, surcharge, theme: { ...themes.pourCouche(surcharge), policeSymboles: theme.policeSymboles } };
    return c.themeCouche.theme;
  };
  const emettre = (type, charge, origine) => { try { emetteur(type, charge, origine); } catch (e) { /* le transport ne doit pas casser la carte */ } for (const cb of ecouteurs.get(type) || []) cb(charge); };
  // La bulle d'un objet, déclarée par couche (`bulle` du manifeste) : ouverte par la sélection, fermée avec elle ; ses boutons reviennent à l'hôte (événement `action`).
  const tables = new Map();   // id -> lignes : les tables liées de la scène (couches `type: "table"`), montrées par la bulle d’un objet
  bulleCtl = creerBulle({
    tables: () => tables, map, document: opts.document !== undefined ? opts.document : globalThis.document, emettre,
    creerPopup: opts.creerPopup || (() => new globalThis.maplibregl.Popup({ closeButton: false, closeOnClick: false, closeOnMove: false, maxWidth: '320px', offset: 14, className: 'atlas-bi-bulle-popup', focusAfterOpen: false })),
    variables: () => variablesInterface(themes.charte), appliquer: appliquerVariables, marges: () => marges,
    quandFermee: () => { if (selection) { poserSelection(null, null); emettre('select', { layer: null, featureId: null }, 'utilisateur'); } },
  });

  // ---------- jetons ----------
  const resoudre = (c, T = theme) => resoudreJeton(c, T.jetons);
  function declaratifResolu(decl, T = theme) {
    if (!decl) return null; const d = copie(decl);
    if (d.color) d.color = resoudre(d.color, T);
    // Une classe sans couleur prend la suivante de la palette qualitative de la charte (un manifeste inféré n'écrit aucune couleur).
    const palette = Array.isArray(T.categories) && T.categories.length ? T.categories : null;
    (d.stops || []).forEach((s, i) => { s.color = s.color ? resoudre(s.color, T) : (palette ? palette[i % palette.length] : undefined); });
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
    const T = themeDe(c);
    const decl = declaratifResolu(c.def.style?.declarative, T) || { kind: 'single', color: T.categories[0] };
    const couleur = expressionCouleurDeclarative(decl, '#9a9a9a') || '#9a9a9a';
    // Contour des marques : celui de la charte, SAUF sur une couleur pâle (qui ne se détache pas du fond, vue à l'opacité de la couche) où l'encre tranche,
    // comme l'annonce l'avertissement `contraste-classe-fond`. Même structure d'expression que la couleur : une couleur de contour par classe.
    const contourMarque = (opacite) => {
      const seuil = (T.exigences && T.exigences.contrasteMinimal) || 3, pour = (col) => (estPale(col, T.fondCarte, { opacite, seuil }) ? T.selection : T.contour);
      const d2 = copie(decl); if (d2.color) d2.color = pour(d2.color); for (const st of d2.stops || []) st.color = pour(st.color);
      return expressionCouleurDeclarative(d2, T.contour) || T.contour;
    };
    map.addSource(idSrc(c), { type: 'geojson', data: { type: 'FeatureCollection', features: c.features }, ...(c.admin ? { promoteId: 'code', tolerance: 0.6, ...(c.admin.meta && c.admin.meta.attribution ? { attribution: attributionSure(c.admin.meta.attribution) } : {}) } : (attributionScene && attributionSure(attributionScene) ? { attribution: attributionSure(attributionScene) } : {})) });
    const v = c.visuel, g = geom(c), sel = ['boolean', ['feature-state', 'selected'], false], hl = ['boolean', ['feature-state', 'highlight'], false];
    if (g === 'polygon' && v.type === 'choroplethe') {
      const avant = [...couches.values()].filter((k) => !k.admin).map((k) => k.ids[0]).find((id) => id && map.getLayer(id));
      admin.monter(c, avant);
    } else if (g === 'point' && v.type === 'heat') {
      const poids = v.poids ? ['interpolate', ['linear'], ['to-number', ['get', v.poids], 0], 0, 0, v.poidsMax || 1, 1] : 1, rampeC = rampe(T.sequentielle);
      ajouterCalque(c, { id: PREF + 'heat-' + c.id, type: 'heatmap', source: idSrc(c), paint: { 'heatmap-weight': poids, 'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 15, 1.6], 'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 8 * (v.rayon || 1), 16, 38 * (v.rayon || 1)],
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.15, rampeC(0.25), 0.4, rampeC(0.5), 0.7, rampeC(0.8), 1, rampeC(1)], 'heatmap-opacity': v.opacite ?? 0.85 } });
      if (v.points) ajouterCalque(c, { id: PREF + 'pts-' + c.id, type: 'circle', source: idSrc(c), minzoom: v.points, paint: { 'circle-radius': 4, 'circle-color': couleur, 'circle-stroke-width': ['case', sel, 3, 1], 'circle-stroke-color': ['case', sel, T.selection, contourMarque(1)] } });
    } else if (g === 'point' && (v.type === 'hex' || v.type === 'grille')) {
      map.addSource(idAgg(c), { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      const ext = !!v.extrusion;
      ajouterCalque(c, ext ? { id: PREF + 'agg-' + c.id, type: 'fill-extrusion', source: idAgg(c), paint: { 'fill-extrusion-color': ['coalesce', ['get', '_couleur'], '#cccccc'], 'fill-extrusion-height': ['*', ['coalesce', ['get', '_h'], 0], v.hauteurMax || 400], 'fill-extrusion-opacity': 0.88 } }
        : { id: PREF + 'agg-' + c.id, type: 'fill', source: idAgg(c), paint: { 'fill-color': ['coalesce', ['get', '_couleur'], '#cccccc'], 'fill-opacity': v.opacite ?? 0.8, 'fill-outline-color': T.contour } });
    } else if (g === 'point' && v.type === 'etats') {
      c.avertVisuel = [];   // ce que le visuel a refusé (couleur illisible, jeton inconnu), dit à l'hôte par `setScene`
      const ids = ajouterIcones(map, v.etats || {}, { resoudre: (cc) => resoudre(cc, T), contourDefaut: T.marqueurs && T.marqueurs.contour, jetons: T.jetons, noter: (m) => c.avertVisuel.push(m) }); const cles = Object.keys(ids);
      const icone = cles.length ? ['match', ['get', v.champEtat || 'etat'], ...cles.flatMap((k) => [k, ids[k]]), ids[cles[0]]] : '';
      const police = T.policeSymboles || (map.getLayer('label_city') && map.getLayoutProperty('label_city', 'text-font')) || ['Noto Sans Regular'];
      ajouterCalque(c, { id: PREF + 'anneau-' + c.id, type: 'circle', source: idSrc(c), paint: { 'circle-radius': ['case', sel, 24, 0], 'circle-color': 'rgba(255,255,255,0.75)', 'circle-stroke-width': ['case', sel, 3, 0], 'circle-stroke-color': T.selection } });
      ajouterCalque(c, { id: PREF + 'pts-' + c.id, type: 'symbol', source: idSrc(c), layout: { 'icon-image': icone, 'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.55, 14, 0.9, 17, 1.1], 'icon-allow-overlap': true, 'text-field': v.texte ? ['to-string', ['coalesce', ['get', v.texte], TIRET_MARQUEUR]] : '', 'text-font': police, 'text-size': tailleTexte(v.texte, v.texteTaille, T.tailles.etiquette), 'text-allow-overlap': true, 'text-offset': [0, 0.1] }, paint: { 'text-color': couleurTexteEtats(v.champEtat, v.etats, (cc) => resoudre(cc, T), '#000000'), 'text-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0, 12, 1] } });
    } else if (g === 'point') {
      const rayon = v.type === 'proportionnel' && v.champ ? ['interpolate', ['linear'], ['to-number', ['get', v.champ], 0], v.min ?? 0, v.rMin ?? 4, v.max ?? 100, v.rMax ?? 22] : (v.rayon ?? 6);
      ajouterCalque(c, { id: PREF + 'pts-' + c.id, type: 'circle', source: idSrc(c), paint: { 'circle-radius': ['case', hl, ['+', rayon, 3], rayon], 'circle-color': couleur, 'circle-opacity': 0.9, 'circle-stroke-width': ['case', sel, 3, hl ? 2 : 1], 'circle-stroke-color': ['case', sel, T.selection, contourMarque(0.9)] } });
      const etp = etiquetteDeclaree(v.etiquette);   // l'étiquette d'un point : son texte, sous la marque, posé dans une couche À PART (une police en erreur n'emporte pas les marques)
      if (etp) {
        const policeEp = T.policeSymboles || (map.getLayer('label_city') && map.getLayoutProperty('label_city', 'text-font')) || ['Noto Sans Regular'];
        ajouterCalque(c, { id: PREF + 'etiq-' + c.id, type: 'symbol', source: idSrc(c), minzoom: Number.isFinite(Number(v.etiquette.zoomMin)) ? Math.min(22, Math.max(0, Number(v.etiquette.zoomMin))) : 0,
          layout: { 'text-field': ['to-string', ['coalesce', ['get', etp.champ], '']], 'text-size': etp.taille, 'text-font': policeEp, 'text-anchor': 'top', 'text-offset': [0, 0.9], 'text-optional': true },
          paint: { 'text-color': T.selection || '#111111', 'text-halo-color': T.halo || '#ffffff', 'text-halo-width': 1.4 } });
      }
    } else if (g === 'polygon') {
      // Réglages de l'hôte, facultatifs (lib/bi/style-polygone.js) : opacité du remplissage, contour (couleur, largeur, tirets). Sans eux : le rendu d'avant.
      const opacite = opaciteDeclaree(decl), ct = contourPolygone(v.contour, (cc) => resoudre(cc, T));
      const vol = extrusionDeclaree(v.extrusion);   // le volume : la surface s'élève de la valeur d'une propriété (en mètres) ; le contour reste posé au sol
      if (vol) {
        const hauteur = ['min', vol.max, ['*', vol.facteur, ['max', 0, ['to-number', ['get', vol.champ], 0]]]];
        ajouterCalque(c, { id: PREF + 'fill-' + c.id, type: 'fill-extrusion', source: idSrc(c), paint: { 'fill-extrusion-color': couleur, 'fill-extrusion-height': hauteur, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': opacite !== null ? opacite : 1 } });
      } else {
        ajouterCalque(c, { id: PREF + 'fill-' + c.id, type: 'fill', source: idSrc(c), paint: { 'fill-color': couleur, 'fill-opacity': opacite !== null ? opacite : ['case', sel, 0.95, hl, 0.88, 0.72] } });
      }
      ajouterCalque(c, { id: PREF + 'line-' + c.id, type: 'line', source: idSrc(c), paint: {
        'line-color': ['case', sel, T.selection, hl, T.selection, ct && ct.couleur ? ct.couleur : contourMarque(0.72)],   // surligné (`highlight`) : le contour de la sélection, un peu moins épais
        'line-width': ['case', sel, Math.max(3, (ct ? ct.largeur : 1) + 2), hl, Math.max(2, (ct ? ct.largeur : 1) + 1), ct ? ct.largeur : 1],
        ...(ct && ct.tirets ? { 'line-dasharray': ct.tirets } : {}),
        // sous un volume, le contour posé au sol traverserait les faces (une couche de lignes n'est pas masquée par une extrusion) : il n'apparaît qu'à la sélection
        ...(vol ? { 'line-opacity': ['case', sel, 1, hl, 1, 0] } : {}) } });
      const et = etiquetteDeclaree(v.etiquette);   // l’étiquette permanente (« 6/25 ») : un texte par surface, jamais masqué par une collision
      if (et) {
        const policeEt = T.policeSymboles || (map.getLayer('label_city') && map.getLayoutProperty('label_city', 'text-font')) || ['Noto Sans Regular'];
        ajouterCalque(c, { id: PREF + 'etiq-' + c.id, type: 'symbol', source: idSrc(c), layout: { 'text-field': ['to-string', ['coalesce', ['get', et.champ], '']], 'text-size': et.taille, 'text-font': policeEt, 'text-allow-overlap': true, 'text-ignore-placement': true },
          paint: { 'text-color': T.selection || '#111111', 'text-halo-color': T.halo || '#ffffff', 'text-halo-width': 1.4 } });
      }
    } else {
      // Le tracé des lignes est celui que l'hôte déclare (`visuel.largeur`, `visuel.opacite`) ; sans réglage, 3 px comme avant.
      const tr = traceLigneDeclare(v); const base = typeof tr.largeur === 'number' ? tr.largeur : ['interpolate', ['linear'], ['to-number', ['get', tr.largeur.champ], tr.largeur.min], tr.largeur.min, tr.largeur.lMin, tr.largeur.max, tr.largeur.lMax];
      ajouterCalque(c, { id: PREF + 'line-' + c.id, type: 'line', source: idSrc(c), layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': couleur, 'line-width': ['case', sel, ['+', base, 3], hl, ['+', base, 2], base], ...(tr.opacite !== null ? { 'line-opacity': tr.opacite } : {}), ...(tr.tirets ? { 'line-dasharray': tr.tirets } : {}) } });
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
  function appliquerVue(c) {
    const pred = buildControlPredicate(c.layerLike);
    c.vue = pred ? c.features.filter(pred) : c.features;
    const expr = expressionFiltreControles(c.layerLike);
    for (const id of c.ids) { const spec = map.getLayer(id); if (spec && !id.startsWith(PREF + 'agg-')) map.setFilter(id, expr || null); }
    if (c.visuel.type === 'hex' || c.visuel.type === 'grille') recalculerAgregats(c);
    planifierUi();
    admin.surVueChangee(c.id);
  }
  function recalculerAgregats(c) {
    const v = c.visuel, forme = v.type === 'hex' ? 'hexagone' : 'carre';
    const gj = agreger(c.vue, { taille: v.taille || 600, champ: v.champ || null, forme });
    const metrique = (p) => (v.metrique === 'moyenne' ? p.moyenne : v.metrique === 'somme' ? p.somme : p.n);
    const vals = gj.features.map((f) => metrique(f.properties)).filter(Number.isFinite), seuils = seuilsQuantiles(vals, 5), rp = rampe(themeDe(c).sequentielle), max = Math.max(1, ...vals);
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
    else if (x.type === 'text') { x.active = true; x.texte = String(valeur !== null && typeof valeur === 'object' ? (valeur.texte ?? '') : valeur); }   // { texte } (forme du contrat de l'hôte) ou chaîne
    appliquerVue(c);
    return { layer: c.id, compte: c.vue.length, total: c.features.length };
  }
  // le temps : un contrôle `range` interne par couche portant un champ temporel
  const temps = { champ: null, min: null, max: null, valeur: null, mode: 'instant', lecture: null, raf: null, dernier: 0, largeur: 1 };
  function configurerTemps(m) {
    // La dimension temporelle appartient à la scène : en poser une autre l'arrête (lecture, champ, bornes), qu'elle en ait une ou non. Sinon la lecture
    // continuait, le champ de l'ancienne scène filtrait la nouvelle et `setTime` y était accepté.
    if (temps.lecture) temps.lecture.arreter();
    Object.assign(temps, { champ: null, min: null, max: null, valeur: null, mode: 'instant', lecture: null, dernier: 0, largeur: 1, pas: 1 });
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
    planifierUi();
    return { valeur: t, fenetre: f };
  }
  // ---------- interface optionnelle ----------
  const etatTemps = () => ({ champ: temps.champ, min: temps.min, max: temps.max, valeur: temps.valeur, pas: temps.pas || 1, enLecture: !!(temps.lecture && temps.lecture.enCours()) });
  function legendesVisibles() {
    const sortie = [];
    for (const c of couches.values()) {
      if (c.visible === false || c.admin) continue;
      try { sortie.push({ layer: c.id, titre: c.def.name || c.id, ...api.getLegend(c.id) }); } catch (e) { /* une couche sans légende n’en montre pas */ }
    }
    return sortie;
  }
  /** Redessine les modules d’interface (légende, temps) après un changement de vue, de visibilité, de temps ou de thème : regroupé, jamais à chaque appel. */
  function planifierUi() {
    if (!uiEtat.zone) return;
    clearTimeout(uiEtat.minuterie);
    uiEtat.minuterie = setTimeout(() => { try { if (uiEtat.legende) uiEtat.legende.rafraichir(); if (uiEtat.temps) uiEtat.temps.rafraichir(); } catch (e) { /* l’interface ne casse pas la carte */ } }, 30);
  }
  function detruireUi() {
    clearTimeout(uiEtat.minuterie);
    for (const k of ['legende', 'temps', 'zone']) { const m = uiEtat[k]; if (m && m.detruire) { try { m.detruire(); } catch (e) { /* déjà retiré */ } } uiEtat[k] = null; }
  }
  /** Monte les modules que la scène déclare (`interface: { legende, temps }`), à la demande ; ce qui est invalide est écarté ET dit. */
  async function configurerUi(decl, avertissements) {
    detruireUi();
    if (decl === undefined || decl === null) return;
    const dit = (m) => { avertissements._interface = [...(avertissements._interface || []), m]; };
    if (typeof decl !== 'object' || Array.isArray(decl)) { dit('interface : un objet est attendu, ignorée'); return; }
    const voulus = [];
    for (const [k, v] of Object.entries(decl)) {
      if (k !== 'legende' && k !== 'temps') { dit('interface : module « ' + String(k).slice(0, 30) + ' » inconnu (legende, temps), ignoré'); continue; }
      if (v === false || v === undefined || v === null) continue;
      if (v !== true && (typeof v !== 'object' || Array.isArray(v))) { dit('interface.' + k + ' : true ou un objet d’options attendu, ignoré'); continue; }
      voulus.push(k);
    }
    if (!voulus.length) return;
    const conteneur = typeof map.getContainer === 'function' ? map.getContainer() : null;
    const doc = opts.document !== undefined ? opts.document : globalThis.document;
    if (!conteneur || !doc) { dit('interface : la carte n’a pas de conteneur, ignorée'); return; }
    const options = (k) => (decl[k] && typeof decl[k] === 'object' ? decl[k] : {});
    try {
      const { creerZone } = await import('./ui/zone.js');
      uiEtat.zone = creerZone({ document: doc, conteneur, variables: () => variablesInterface(themes.charte), appliquer: appliquerVariables }); uiEtat.zone.ajuster(marges);
      if (voulus.includes('legende')) {
        const { creerLegende } = await import('./ui/legende.js'); const o = options('legende');
        uiEtat.legende = creerLegende({ document: doc, zone: uiEtat.zone, fournir: legendesVisibles, position: o.position, repliee: typeof o.repliee === 'boolean' ? o.repliee : undefined, cible: o.cible === true,
          surClasse: (layer, cle, libelle, active) => emettre('classe', { layer, cle, libelle, active }, 'utilisateur') });
      }
      if (voulus.includes('temps')) {
        const { creerTemps } = await import('./ui/temps.js'); const o = options('temps');
        uiEtat.temps = creerTemps({ document: doc, zone: uiEtat.zone, etat: etatTemps, position: o.position,
          poser: (v) => { poserTemps(v); emettre('time', { valeur: v, lecture: false }, 'utilisateur'); },
          lire: () => api.play(), pauser: () => api.pause() });
      }
    } catch (e) { dit('interface : ' + String((e && e.message) || e)); detruireUi(); return; }
    planifierUi();
  }
  function boucleLecture(ts) {
    if (!temps.lecture || !temps.lecture.enCours()) { temps.raf = null; return; }
    const dt = ts - (temps.dernier || ts); temps.dernier = ts; const nv = temps.lecture.avancer(dt);
    if (nv !== null) { poserTemps(nv); emettre('time', { valeur: nv, lecture: true }, 'utilisateur'); }
    temps.raf = requestAnimationFrame(boucleLecture);
  }

  // ---------- sélection, survol, caméra ----------
  const calquesInteractifs = () => [...couches.values()].filter((c) => c.visible && c.def.interactive !== false).flatMap((c) => c.ids.filter((id) => !id.includes('heat-') && !id.includes('agg-')).map((id) => ({ id, c })));
  function etat(c, id, patch) { if (c.visuel.type === 'hex' || c.visuel.type === 'grille' || c.visuel.type === 'heat') { if (!map.getSource(idSrc(c))) return; } map.setFeatureState({ source: idSrc(c), id }, patch); }
  function poserSelection(c, id) {
    if (selection) etat(selection.c, selection.id, { selected: false });
    selection = c && id !== null ? { c, id } : null;
    if (selection) etat(c, id, { selected: true });
    if (selection && selection.c.bulle) bulleCtl.ouvrir(selection.c, selection.c.parId.get(selection.id), dernierClic); else bulleCtl.fermer();
  }
  const cle = (c, f) => (c.def.cle ? f.properties?.[c.def.cle] : undefined);
  /** Un clic qui ne touche aucune entité : sa position pour l'hôte (`clic`, contrat 0.4). Coordonnées finies, bornées et arrondies ; jamais d'exception. */
  function emettreClic(e) {
    const p = e && e.lngLat, pt = e && e.point;
    const lng = p ? Number(p.lng) : NaN, lat = p ? Number(p.lat) : NaN;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    const r = (v, n) => Math.round(v * 10 ** n) / 10 ** n, pixel = (v) => (Number.isFinite(v) ? r(v, 1) : null);
    const z = Number(map.getZoom());
    emettre('clic', { lng: r(((lng + 180) % 360 + 360) % 360 - 180, 7), lat: r(Math.max(-90, Math.min(90, lat)), 7), x: pixel(pt && pt.x), y: pixel(pt && pt.y), zoom: Number.isFinite(z) ? r(z, 3) : null }, 'utilisateur');
  }
  function surClic(e) {
    const hit = calquesInteractifs();
    const fs = hit.length ? map.queryRenderedFeatures(e.point, { layers: hit.map((h) => h.id).filter((id) => map.getLayer(id)) }) : [];
    if (hit.length && opts.edition && opts.edition.actif && !fs.length) { emettre('edit', { op: 'add', layer: opts.edition.couche, geometry: { type: 'Point', coordinates: [e.lngLat.lng, e.lngLat.lat] } }, 'utilisateur'); return; }
    // ni entité ni édition : l'hôte reçoit la position du clic, après la désélection éventuelle (une sélection ne se perd pas sans le dire)
    if (!fs.length) { if (hit.length && selection) { poserSelection(null, null); emettre('select', { layer: null, featureId: null }, 'utilisateur'); } emettreClic(e); return; }
    const f = fs[0], c = [...couches.values()].find((k) => f.layer.id.endsWith(k.id) && f.source === idSrc(k)); if (!c) return;
    dernierClic = e.lngLat; poserSelection(c, f.id); dernierClic = null; emettre('select', { layer: c.id, featureId: f.id, key: c.admin ? f.id : cle(c, f), ...(c.admin ? admin.infosUnite(c, f.id) : {}) }, 'utilisateur');
  }
  let rafSurvol = 0, curseurScene = null;   // `curseurScene` : le curseur demandé par la scène (`manifest.curseur`), hors survol d’un objet
  let etatEnvironnement = null;   // ce que `manifest.environnement` a posé (lib/bi/environnement.js, chargé à la demande), pour le défaire à la scène suivante
  function surSurvol(e) {
    if (rafSurvol) return; rafSurvol = requestAnimationFrame(() => { rafSurvol = 0;
      const hit = calquesInteractifs().map((h) => h.id).filter((id) => map.getLayer(id)); if (!hit.length) return;
      const fs = map.queryRenderedFeatures(e.point, { layers: hit }); map.getCanvas().style.cursor = fs.length ? 'pointer' : (curseurScene || '');
      const f = fs[0], k = f ? f.id : null; if ((survol && survol.id) === k) return;
      if (survol && survol.admin) { try { map.setFeatureState({ source: survol.source, id: survol.id }, { hover: false }); } catch (e) { /* source retirée */ } }
      const c = f && [...couches.values()].find((q) => f.source === idSrc(q));
      survol = f ? { layer: f.layer.id, id: f.id, admin: !!(c && c.admin), source: f.source } : null;
      if (survol && survol.admin) map.setFeatureState({ source: survol.source, id: survol.id }, { hover: true });
      emettre('hover', { layer: c ? c.id : null, featureId: k, ...(c ? { key: c.admin ? k : cle(c, f) } : {}), ...(c && c.admin ? admin.infosUnite(c, k) : {}) }, 'utilisateur'); });
  }
  // Le pointeur quitte la carte (l'iframe) : seul `mousemove` était écouté, l'hôte gardait donc le dernier survol. Même charge que « plus rien sous le pointeur ».
  function surSortie() {
    if (rafSurvol) { if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafSurvol); rafSurvol = 0; }
    if (!survol) return;
    if (survol.admin) { try { map.setFeatureState({ source: survol.source, id: survol.id }, { hover: false }); } catch (e) { /* source retirée */ } }
    survol = null; try { map.getCanvas().style.cursor = ''; } catch (e) { /* carte retirée */ }
    emettre('hover', { layer: null, featureId: null }, 'utilisateur');
  }
  let tmCam = 0;
  function surFinMouvement() { clearTimeout(tmCam); tmCam = setTimeout(() => { const ce = map.getCenter(); const b = typeof map.getBounds === 'function' ? map.getBounds() : null; emettre('camera', { center: [ce.lng, ce.lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), ...(b && typeof b.getWest === 'function' ? { bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] } : {}) }, camApi ? 'api' : 'utilisateur'); camApi = false; }, 120); }
  map.on('click', surClic); map.on('mousemove', surSurvol); map.on('moveend', surFinMouvement);
  // ---- la vue de la caméra (contrat 0.4) : `getCamera`, et le flux `mouvement` sur abonnement (`watchCamera`) ----
  let modeVue = 'libre', limitesAvant = null;   // `limitesAvant` : les limites d'inclinaison d'avant `plat`, rendues par `libre`
  const horloge = opts.horloge || {};
  const maintenant = horloge.maintenant || (() => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()));
  const planifier = horloge.setTimeout || ((f, ms) => setTimeout(f, ms)), annuler = horloge.clearTimeout || ((h) => clearTimeout(h));
  let limiteurFeatures = null;    // idem pour getFeatures
  let limiteurBatiments = null;   // au plus APPELS_PAR_SECONDE lectures de bâtiments par seconde ; créé au premier appel, avec le module chargé à la demande
  const arrondi = (v, n) => (Number.isFinite(v) ? Math.round(v * 10 ** n) / 10 ** n : null);
  /** L'état complet de la vue : de quoi poser une 3D alignée. `padding` décale le point de projection du centre ; `metresParPixel` suppose des tuiles de 512 px (MapLibre). */
  function etatCamera() {
    const ce = map.getCenter(), b = typeof map.getBounds === 'function' ? map.getBounds() : null;
    const pad = typeof map.getPadding === 'function' ? map.getPadding() : null, taille = tailleCadre();
    const zoom = map.getZoom(), lat = ce.lat;
    const ratio = typeof map.getPixelRatio === 'function' ? map.getPixelRatio() : (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
    return {
      center: [arrondi(ce.lng, 7), arrondi(ce.lat, 7)], zoom: arrondi(zoom, 5), pitch: arrondi(map.getPitch(), 3), bearing: arrondi(map.getBearing(), 3),
      ...(b && typeof b.getWest === 'function' ? { bounds: [arrondi(b.getWest(), 6), arrondi(b.getSouth(), 6), arrondi(b.getEast(), 6), arrondi(b.getNorth(), 6)] } : {}),
      taille, ratioPixels: arrondi(ratio, 3),
      padding: { top: Number(pad && pad.top) || 0, right: Number(pad && pad.right) || 0, bottom: Number(pad && pad.bottom) || 0, left: Number(pad && pad.left) || 0 },
      metresParPixel: arrondi((40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom), 4),
      mode: modeVue, t: arrondi(maintenant(), 1),
    };
  }
  let flux = null;   // { intervalleMs, dernier, minuterie } : un seul abonnement par composant
  const emettreMouvement = (phase) => { if (!flux) return; flux.dernier = maintenant(); emettre('mouvement', { ...etatCamera(), phase }, camApi ? 'api' : 'utilisateur'); };
  const arreterFlux = () => { if (flux && flux.minuterie) annuler(flux.minuterie); flux = null; };
  map.on('movestart', () => { if (flux) emettreMouvement('debut'); });
  // coalescence : jamais plus d'un message en attente, et on envoie l'état COURANT, pas l'historique des images
  map.on('move', () => {
    if (!flux || flux.minuterie) return;
    const reste = flux.intervalleMs - (maintenant() - flux.dernier);
    if (reste <= 0) emettreMouvement('en_cours');
    else flux.minuterie = planifier(() => { if (!flux) return; flux.minuterie = 0; emettreMouvement('en_cours'); }, reste);
  });
  map.on('moveend', () => { if (!flux) return; if (flux.minuterie) { annuler(flux.minuterie); flux.minuterie = 0; } emettreMouvement('fin'); });
  if (typeof globalThis.addEventListener === 'function') globalThis.addEventListener('pagehide', arreterFlux);
  const conteneurCarte = typeof map.getCanvasContainer === 'function' ? map.getCanvasContainer() : null;
  if (conteneurCarte && conteneurCarte.addEventListener) conteneurCarte.addEventListener('mouseleave', surSortie);

  // ---------- édition (déplacement d'un point ; l'hôte persiste) ----------
  let glisse = null;
  map.on('mousedown', (e) => { if (!(opts.edition && opts.edition.actif) || !selection) return; const c = selection.c; if (c.id !== opts.edition.couche) return;
    const fs = map.queryRenderedFeatures(e.point, { layers: c.ids.filter((id) => map.getLayer(id)) }); if (fs.length && fs[0].id === selection.id) { glisse = { c, id: selection.id }; map.dragPan.disable(); map.getCanvas().style.cursor = 'grabbing'; } });
  map.on('mousemove', (e) => { if (!glisse) return; const f = glisse.c.parId.get(glisse.id); f.geometry.coordinates = [e.lngLat.lng, e.lngLat.lat]; map.getSource(idSrc(glisse.c)).setData({ type: 'FeatureCollection', features: glisse.c.features }); });
  map.on('mouseup', (e) => { if (!glisse) return; const { c, id } = glisse; glisse = null; map.dragPan.enable(); map.getCanvas().style.cursor = ''; const f = c.parId.get(id);
    emettre('edit', { op: 'move', layer: c.id, featureId: id, geometry: { type: 'Point', coordinates: f.geometry.coordinates.slice() } }, 'utilisateur'); if (c.visuel.type === 'hex' || c.visuel.type === 'grille') recalculerAgregats(c); });

  // ---------- couches administratives ----------
  const retirer = (id) => { const c = couches.get(id); if (!c) return; if (selection && selection.c === c) selection = null; demonter(c); couches.delete(id); };
  let avertAjout = [];   // ce que la déclaration de bulle d’une couche ajoutée par le runtime (administrative) a eu d’invalide : lu par setScene, qui le dit
  const ajouter = (def, features, init) => {
    const c = creerCouche(def, features); if (init) init(c);
    const nb = normaliserBulle(def.bulle); c.bulle = nb.bulle; avertAjout = nb.avertissements;   // une couche administrative a, elle aussi, sa bulle déclarée
    couches.set(def.id, c); monter(c); poserLavis(); return c;
  };
  const admin = creerAdmin({ map, couches, PREF, config: opts.admin || {}, horsLigne: () => horsLigne.actif, getTheme: () => theme, resoudre, emettre, retirer, ajouter, api: () => api, ajouterCalque, idSrc, demonter, monter,
    vueSans: (c, ids) => { if (!c.controles.some((x) => x.active && ids.includes(x.id))) return c.vue; const pred = buildControlPredicate({ id: c.id, geojson: c.layerLike.geojson, controls: c.controles.filter((x) => !ids.includes(x.id)) }); return pred ? c.features.filter(pred) : c.features; },
    reappliquerVisibilite: (c) => { if (!c.visible) for (const l of c.ids) map.setLayoutProperty(l, 'visibility', 'none'); }, poserSelection, getSelection: () => selection, majFiltre, camApi: () => { camApi = true; } });

  // ---------- repli hors ligne ----------
  const horsLigne = { actif: false, auto: true, fondAvant: null, cause: null }; const surveillance = creerSurveillance();
  async function basculerHorsLigne(actif, cause, automatique, diagnostic) {
    if (actif === horsLigne.actif) return { actif, auto: horsLigne.auto };
    if (actif) { horsLigne.fondAvant = modeFond; horsLigne.cause = cause; horsLigne.actif = true; try { await api.setFond(fondPourConnexion(modeFond, true), theme.plan || {}); } catch (e) { /* le repli ne doit jamais casser la carte */ } }
    else { horsLigne.actif = false; try { await api.setFond(horsLigne.fondAvant || 'atlas', theme.plan || {}); } catch (e) { /* idem */ } horsLigne.fondAvant = null; }
    emettre('connexion', { etat: actif ? 'hors_ligne' : 'en_ligne', cause, automatique: !!automatique, fond: modeFond, ...(diagnostic ? { diagnostic } : {}) }, automatique ? 'utilisateur' : 'api');
    return { actif, auto: horsLigne.auto };
  }
  map.on('error', (ev) => { if (!horsLigne.auto || horsLigne.actif || !estEchecDeTuile(ev)) return; if (surveillance.echec()) basculerHorsLigne(true, 'tuiles', true, diagnosticEchec(ev, surveillance.compte())); });
  map.on('data', (ev) => { if (ev && ev.tile && ev.sourceId) surveillance.succes(); });
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('offline', () => { if (horsLigne.auto) basculerHorsLigne(true, 'navigateur', true); });
    window.addEventListener('online', () => { if (horsLigne.auto && horsLigne.actif && horsLigne.cause !== 'hote') basculerHorsLigne(false, 'navigateur', true); });
  }

  // ---------- thème : tout redessiner avec la charte résolue ----------
  function remonterTheme() {
    poserTheme();
    const sauve = selection;
    for (const c of couches.values()) {
      if (c.admin) { c.admin.sale = true; c.admin.modele = null; }
      demonter(c); monter(c);
      if (!c.visible) for (const l of c.ids) map.setLayoutProperty(l, 'visibility', 'none');
    }
    poserLavis(); selection = null; if (sauve) poserSelection(sauve.c, sauve.id);
    for (const c of couches.values()) if (c.admin) admin.assurer(c);
  }
  // la personne change sa préférence de contraste pendant la session : la charte est résolue de nouveau, l'hôte est prévenu (événement `theme`)
  if (opts.preferences === undefined && typeof window !== 'undefined' && window.matchMedia) {
    try {
      const mq = window.matchMedia('(prefers-contrast: more)');
      const surChangement = (e) => { themes.definirPreferences({ contrasteEleve: !!e.matches }); remonterTheme(); emettre('theme', themes.lire(), 'utilisateur'); };
      if (mq.addEventListener) mq.addEventListener('change', surChangement);
    } catch (e) { /* pas de requête média : la préférence lue au démarrage reste */ }
  }

  // ---------- API ----------
  const api = {
    ping: () => ({ version: VERSION, couches: [...couches.keys()], capacites: [...capacites], paquet }),
    async setScene(manifest, donnees = {}) {
      // `fusion: true` : seules les couches listées sont remplacées (ajoutées si nouvelles) ; les autres, leur visuel, le temps et l’interface restent : mettre à jour UNE couche
      // (une grille qui suit la vue, des cases sélectionnées) sans rejouer la scène
      const fusion = manifest.fusion === true;
      if (!fusion) bulleCtl.fermer();   // une fusion ne ferme la bulle que si l’objet ouvert est dans une couche remplacée
      if (fusion) { for (const def of manifest.layers || []) { if (!def) continue; const e = couches.get(def.id); if (e) { if (selection && selection.c === e) { selection = null; bulleCtl.fermer(); } demonter(e); couches.delete(def.id); } tables.delete(def.id); } }
      else { for (const c of couches.values()) demonter(c); couches.clear(); tables.clear(); selection = null; admin.pile.length = 0; }
      const erreurs = {}, avertissements = {};
      if (manifest.curseur !== undefined || !fusion) {
        curseurScene = curseurDeclare(manifest.curseur);
        if (manifest.curseur !== undefined && manifest.curseur !== null && curseurScene === null) avertissements._scene = [...(avertissements._scene || []), 'curseur : « ' + String(manifest.curseur).slice(0, 20) + ' » inconnu (' + CURSEURS_ADMIS + '), ignoré'];
        try { map.getCanvas().style.cursor = curseurScene || ''; } catch (e) { /* carte sans canevas */ }
      }
      if (manifest.marges !== undefined) { try { poserMarges(manifest.marges); } catch (e) { avertissements._scene = [String(e.message || e)]; } }
      if (!fusion || manifest.attribution !== undefined) attributionScene = typeof manifest.attribution === 'string' && manifest.attribution.trim() ? manifest.attribution : null;
      // la charte du manifeste de scène (niveau « hôte ») : assainie comme toute charte, ajoutée à ce que l'hôte a déjà donné
      if (manifest.charte && typeof manifest.charte === 'object') { const retourTheme = themes.appliquer(manifest.charte); poserTheme(); emettre('theme', retourTheme, 'api'); }
      // l'environnement déclaré (relief, bâti en volume, ciel, soleil) : brique chargée à la demande, jamais pour une scène qui n'en déclare pas et n'a rien à défaire
      if (manifest.environnement !== undefined || (!fusion && etatEnvironnement)) {
        try {
          const env = await import('./environnement.js?v=1.38.0');
          if (etatEnvironnement && (!fusion || manifest.environnement !== undefined)) { env.reinitialiserEnvironnement(map, etatEnvironnement); etatEnvironnement = null; }
          const r = env.appliquerEnvironnement(map, env.environnementDeclare(manifest.environnement), { theme });
          etatEnvironnement = Object.values(r.etat).some(Boolean) ? r.etat : null;
          if (r.avertissements.length) avertissements._environnement = r.avertissements;
        } catch (e) { avertissements._environnement = ['environnement : ' + String((e && e.message) || e).slice(0, 120)]; }
      }
      for (const def of manifest.layers || []) {
        if (def && def.type === 'table') {   // une table liée : des lignes sans géométrie, fournies par l’hôte (`donnees.<id>`), jamais montées sur la carte
          const r = normaliserLignes(donnees[def.id] !== undefined ? donnees[def.id] : def.lignes);
          tables.set(def.id, r.lignes); if (r.avertissements.length) avertissements[def.id] = r.avertissements;
          continue;
        }
        // Une maquette en dalles 3D n'existe que dans le canevas complet (three.js, `profil="complet"`) et dans une scène Atlas (`version`) : la carte nue la ferait
        // passer pour une couche sans entité, `0` sans un mot. Elle est refusée seule, avec ce qu'il faut changer.
        if (def && def.type === 'dalles3d') { erreurs[def.id] = 'capacite_absente : la couche « ' + def.id + ' » (dalles 3D) demande le profil complet (`profil="complet"`) et une scène Atlas (`version: "0.2.2"`) ; la carte nue ne la monte pas'; continue; }
        const brique = def.admin ? 'territoires' : 'points';   // une couche dont la brique manque est refusée seule : les autres se montent
        if (!capacites.includes(brique)) { erreurs[def.id] = new ErreurCapacite(brique, 'la couche « ' + def.id + ' »').message; continue; }
        if (def.admin) { // couche administrative : chargée par le runtime (ou fournie par l'hôte dans `donnees`)
          try { avertAjout = []; await admin.api.addAdminLayer(def.admin.niveau, { id: def.id, nom: def.name, visuel: def.visuel, filtre: def.admin.filtre, source: def.admin.source, produit: def.admin.produit, arrondissements: def.admin.arrondissements, cadrer: def.admin.cadrer, donnees: donnees[def.id], controls: def.controls, visible: def.visible, bulle: def.bulle });
            if (avertAjout.length) avertissements[def.id] = [...(avertissements[def.id] || []), ...avertAjout]; }
          catch (e) { erreurs[def.id] = String(e && e.message || e); }
          continue;
        }
        // un choroplèthe se peint sur des unités administratives : sans `admin` il n'a pas de jointure, la couche est refusée seule et lisiblement
        if (def.visuel && def.visuel.type === 'choroplethe') { erreurs[def.id] = 'choroplethe : la couche « ' + def.id + ' » doit déclarer `admin` (un choroplèthe se peint sur des unités administratives)'; continue; }
        const source = donnees[def.id] || def.geojson?.features || [];
        const diag = diagnostiquerCouche(def, source);   // une erreur de forme se dit en clair, avant le montage
        if (diag.erreur) { erreurs[def.id] = diag.erreur; continue; }
        if (diag.avertissements.length) avertissements[def.id] = diag.avertissements;
        try {
          const c = creerCouche(def, source);
          const nb = normaliserBulle(def.bulle); c.bulle = nb.bulle;   // la bulle déclarée ; ce qui n'est pas valide est écarté et dit
          if (nb.avertissements.length) avertissements[def.id] = [...(avertissements[def.id] || []), ...nb.avertissements];
          couches.set(def.id, c); monter(c);
          if (c.avertVisuel && c.avertVisuel.length) avertissements[def.id] = [...(avertissements[def.id] || []), ...c.avertVisuel];
        }
        catch (e) { const c = couches.get(def.id); if (c) { try { demonter(c); } catch (_) { /* déjà démontée */ } couches.delete(def.id); } erreurs[def.id] = String((e && e.message) || e); }
      }
      if (!fusion || manifest.temps !== undefined) configurerTemps(manifest);
      poserLavis();
      if (!fusion || manifest.interface !== undefined) await configurerUi(manifest.interface, avertissements);
      const compte = { ...Object.fromEntries([...couches].map(([id, c]) => [id, c.features.length])), ...Object.fromEntries([...tables].map(([id, l]) => [id, l.length])) };
      emettre('ready', { layers: compte, temps: temps.champ ? { champ: temps.champ, min: temps.min, max: temps.max, valeur: temps.valeur } : null, ...(Object.keys(erreurs).length ? { erreurs } : {}), ...(Object.keys(avertissements).length ? { avertissements } : {}) }, 'api');
      return { ...compte, ...(Object.keys(erreurs).length ? { _erreurs: erreurs } : {}), ...(Object.keys(avertissements).length ? { _avertissements: avertissements } : {}) };
    },
    setLayerVisibility(id, visible) { const c = couches.get(id); if (!c) throw new Error('couche inconnue : ' + id); c.visible = !!visible; planifierUi(); for (const l of c.ids) map.setLayoutProperty(l, 'visibility', visible ? 'visible' : 'none'); return visible; },
    setFilter(controlId, valeur) { const r = majFiltre(controlId, valeur); emettre('filter', { controlId, value: valeur, ...r }, 'api'); return r; },
    setTime(v) { const r = poserTemps(v); emettre('time', { valeur: r.valeur, lecture: false }, 'api'); return r; },
    play(o = {}) { if (!temps.champ) throw new Error('aucun champ temporel'); const vals = valeursDuDomaine(temps.min, temps.max, temps.pas);
      temps.lecture = creerLecture({ min: temps.min, max: temps.max, pas: temps.pas, parSeconde: o.parSeconde || 1, boucle: o.boucle !== false, valeur: temps.valeur }); temps.lecture.demarrer(); temps.dernier = 0; temps.raf = requestAnimationFrame(boucleLecture); return { valeurs: vals.length }; },
    pause() { if (temps.lecture) temps.lecture.arreter(); return true; },
    select(id) { if (id === null) { poserSelection(null, null); return null; } for (const c of couches.values()) if (c.parId.has(id)) { poserSelection(c, id); return id; } throw new Error('entité inconnue : ' + id); },
    highlight(ids) { for (const c of couches.values()) for (const f of c.features) if (c.ids.length && (c.visuel.type === 'cercles' || c.visuel.type === 'proportionnel')) etat(c, f.id, { highlight: ids.includes(f.id) }); return ids.length; },
    flyTo(cam) {
      // `marges` : zone utile persistante (voir lib/bi/marges.js) ; seule, elle ne déplace rien
      const { marges: m, ...reste } = cam; if (m !== undefined) poserMarges(m);
      if (modeVue === 'plat' && reste.pitch) reste.pitch = 0;   // la vue plane ne s'incline pas, même sur demande de la page
      if (m !== undefined && !Object.keys(reste).length) return true;
      const t = tailleCadre();
      camApi = true; map.flyTo({ duration: 600, ...(marges ? { padding: limiterPadding(marges, t.w, t.h) } : {}), ...reste }); return true;
    },
    fitTo(arg) { const feats = typeof arg === 'string' ? (couches.get(arg)?.vue || []) : [...couches.values()].flatMap((c) => (Array.isArray(arg) ? c.features.filter((f) => arg.includes(f.id)) : c.vue));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; const vu = (p) => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; };
      const col = (g) => { if (!g) return; const t = g.type; if (t === 'Point') vu(g.coordinates); else if (t === 'MultiPoint' || t === 'LineString') g.coordinates.forEach(vu); else if (t === 'Polygon' || t === 'MultiLineString') g.coordinates.forEach((r) => r.forEach(vu)); else if (t === 'MultiPolygon') g.coordinates.forEach((p) => p.forEach((r) => r.forEach(vu))); };
      for (const f of feats) col(f.geometry);
      if (x0 === Infinity) return false;
      const t = tailleCadre();
      // cadre masqué ou pas encore dimensionné (0 px) : MapLibre ne peut rien cadrer ; on rejoue le cadrage à la première mise à la taille au lieu de l'abandonner en silence
      if (t.connu && (t.w === 0 || t.h === 0)) { if (typeof map.once === 'function') map.once('resize', () => { try { api.fitTo(arg); } catch (e) { /* carte retirée entre-temps */ } }); return false; }
      camApi = true; map.fitBounds([[x0, y0], [x1, y1]], { padding: limiterPadding(marges ? avecConfort(marges, 60) : 60, t.w, t.h), duration: 600, maxZoom: 16 }); return true; },
    /**
     * Applique une charte (docs/CONTRAT-CHARTE-ATLAS.md) ou un thème du contrat 0.3 ; s'ajoute à ce que l'hôte a déjà donné, sauf `{ remplacer: true }`.
     * Renvoie { version, entree, applique, derive, ignore, avertissements, a11y } et émet l'événement `theme`.
     */
    setTheme(t, options = {}) {
      const retour = themes.appliquer(t, { remplacer: !!(options && options.remplacer) });
      remonterTheme();
      // un fond uni ou un plan monochrome est calculé depuis la charte : il la suit (sinon il restait blanc après un passage au thème sombre)
      if (dernierFond && (dernierFond.mode === 'uni' || dernierFond.mode === 'plan')) api.setFond(dernierFond.mode, dernierFond.jetons).catch(() => { /* le fond précédent reste */ });
      emettre('theme', retour, 'api');
      return retour;
    },
    /** La charte résolue, ce que l'hôte a donné, ce qui a été dérivé ou écarté, les avertissements chiffrés et l'état d'accessibilité. */
    getTheme() { return themes.lire(); },
    /** La vue courante pour aligner une 3D de l'hôte (contrat 0.4). */
    getCamera() { return etatCamera(); },
    /**
     * La vue plane, verrouillée (contrat 0.4) : pour une page qui pose sa propre 3D au-dessus d'une carte vue du dessus. `plat` ramène l'inclinaison à 0
     * (sans animation), coupe l'inclinaison par les gestes et, sauf `garderCap: false`, la rotation ; `libre` rend ce que `plat` a retiré. L'état dure d'une scène à l'autre.
     */
    setViewMode(mode, o = {}) {
      if (mode !== 'plat' && mode !== 'libre') throw new Error('mode inconnu : ' + String(mode).slice(0, 40) + ' (plat, libre)');
      const options = o && typeof o === 'object' ? o : {};
      const garderCap = options.garderCap === undefined ? true : options.garderCap;
      if (typeof garderCap !== 'boolean') throw new Error('setViewMode : garderCap doit être true ou false');
      const cap = options.bearing;
      if (cap !== undefined && (typeof cap !== 'number' || !Number.isFinite(cap) || cap < -360 || cap > 360)) throw new Error('setViewMode : bearing hors bornes (-360 à 360)');
      const gestes = (nom, f) => { try { const g = map[nom]; if (g && typeof g[f] === 'function') g[f](); } catch (_) { /* un geste que cette carte n'a pas */ } };
      if (mode === 'plat') {
        if (!limitesAvant) limitesAvant = { max: typeof map.getMaxPitch === 'function' ? map.getMaxPitch() : 80, min: typeof map.getMinPitch === 'function' ? map.getMinPitch() : 0 };
        camApi = true; map.jumpTo({ pitch: 0, ...(cap !== undefined ? { bearing: cap } : {}) });
        if (typeof map.setMinPitch === 'function') map.setMinPitch(0);
        if (typeof map.setMaxPitch === 'function') map.setMaxPitch(0);
        gestes('touchPitch', 'disable');
        if (garderCap) { gestes('dragRotate', 'disable'); gestes('touchZoomRotate', 'disableRotation'); gestes('keyboard', 'disableRotation'); }
        else { gestes('dragRotate', 'enable'); gestes('touchZoomRotate', 'enableRotation'); gestes('keyboard', 'enableRotation'); }
        modeVue = 'plat';
      } else {
        if (limitesAvant) { if (typeof map.setMaxPitch === 'function') map.setMaxPitch(limitesAvant.max); if (typeof map.setMinPitch === 'function') map.setMinPitch(limitesAvant.min); limitesAvant = null; }
        gestes('touchPitch', 'enable'); gestes('dragRotate', 'enable'); gestes('touchZoomRotate', 'enableRotation'); gestes('keyboard', 'enableRotation');
        modeVue = 'libre';
      }
      return { mode: modeVue, pitch: arrondi(map.getPitch(), 3), bearing: arrondi(map.getBearing(), 3), gestesInclinaison: modeVue === 'libre' };
    },
    /**
     * Les bâtiments visibles du fond (contrat 0.4), pour une page qui pose sa propre 3D : GeoJSON avec `hauteur` et `base` en mètres, lus dans les tuiles déjà chargées
     * (aucun appel réseau). Voir lib/bi/batiments.js pour les fragments aux joints de tuiles et les plafonds.
     */
    async getBuildings(o) {
      // brique chargée À LA DEMANDE : la page maigre n'embarque pas un module que la plupart des hôtes n'appellent jamais
      const B = await import('./batiments.js?v=1.38.0');
      const { normaliserOptionsBatiments, batimentsDeEntites, creerLimiteur, ZOOM_MINIMAL: ZOOM_MINIMAL_BATIMENTS, APPELS_PAR_SECONDE, ATTRIBUTION: ATTRIBUTION_BATIMENTS } = B, intersectionBatiments = B.intersection;
      const opt = normaliserOptionsBatiments(o);
      if (!limiteurBatiments) limiteurBatiments = creerLimiteur(maintenant);
      if (!limiteurBatiments()) throw new Error('getBuildings : trop_frequent (' + APPELS_PAR_SECONDE + ' appels par seconde au plus)');
      if (typeof map.getSource !== 'function' || !map.getSource('openmaptiles') || typeof map.querySourceFeatures !== 'function') throw new Error("batiments : ce fond n'a pas de bâti (source absente)");
      const zoom = map.getZoom(), b = typeof map.getBounds === 'function' ? map.getBounds() : null;
      const vue = b && typeof b.getWest === 'function' ? [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] : [-180, -90, 180, 90];
      const utile = opt.bbox ? intersectionBatiments(opt.bbox, vue) : vue;
      const base = { type: 'FeatureCollection', zoom: arrondi(zoom, 3), source: 'openmaptiles', attribution: attributionSure(ATTRIBUTION_BATIMENTS) };
      if (!utile) return { ...base, features: [], total: 0, tronque: false, bounds: opt.bbox, avertissements: ["emprise : la bbox demandée ne touche pas la vue"] };
      if (zoom < ZOOM_MINIMAL_BATIMENTS) return { ...base, features: [], total: 0, tronque: false, bounds: utile, avertissements: ["zoom-trop-faible : le bâti n'est lu qu'à partir du zoom " + ZOOM_MINIMAL_BATIMENTS + ' (zoom actuel ' + arrondi(zoom, 1) + ')'] };
      const r = batimentsDeEntites(map.querySourceFeatures('openmaptiles', { sourceLayer: 'building' }), { bbox: utile, limite: opt.limite, hauteurMin: opt.hauteurMin });
      return { ...base, features: r.features, total: r.total, tronque: r.tronque, bounds: utile.map((v) => arrondi(v, 6)), avertissements: r.avertissements };
    },
    /**
     * Les géométries d'une couche (contrat 0.5), pour une page qui les redessine ou les extrude : GeoJSON borné, avec ce qu'il faut pour redessiner à l'identique
     * (visuel, style, légende). Voir lib/bi/features.js pour les plafonds. Une couche de table (sans géométrie) ou une couche administrative est refusée.
     */
    async getFeatures(layer, o) {
      const F = await import('./features.js?v=1.38.0');
      const opt = F.normaliserOptionsFeatures(o);
      if (!limiteurFeatures) limiteurFeatures = F.creerLimiteur(maintenant);
      if (!limiteurFeatures()) throw new Error('getFeatures : trop_frequent (' + F.APPELS_PAR_SECONDE + ' appels par seconde au plus)');
      if (tables.has(layer)) throw new Error('getFeatures : ' + layer + ' est une table (sans géométrie)');
      const c = couches.get(layer);
      if (!c) throw new Error('couche inconnue : ' + layer);
      if (c.admin) throw new Error('getFeatures : ' + layer + " est une couche administrative (non lue par cette commande)");
      const r = F.featuresDeEntites(c.features, opt);
      let legende = null; try { legende = api.getLegend(c.id); } catch (e) { /* une couche sans légende n'en rend pas */ }
      const clone = (v) => { try { return v === undefined ? null : JSON.parse(JSON.stringify(v)); } catch (e) { return null; } };
      return { type: 'FeatureCollection', layer: c.id, nom: c.def.name || c.id, geometrie: geom(c), features: r.features, total: r.total, tronque: r.tronque, bounds: opt.bbox, visuel: clone(c.visuel), style: clone(c.def.style), legende: clone(legende), visible: c.visible, avertissements: r.avertissements };
    },
    /** Abonne l'hôte au flux `mouvement` ; un seul abonnement, remplacé par le suivant ; `actif: false` l'arrête. */
    watchCamera(o = {}) {
      const actif = o.actif === undefined ? true : o.actif;
      if (typeof actif !== 'boolean') throw new Error('watchCamera : actif doit être true ou false');
      if (!actif) { arreterFlux(); return { actif: false, intervalleMs: null }; }
      const ms = o.intervalleMs === undefined ? 33 : o.intervalleMs;
      if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 16 || ms > 1000) throw new Error('watchCamera : intervalleMs hors bornes (16 à 1000)');
      arreterFlux(); flux = { intervalleMs: Math.round(ms), dernier: -Infinity, minuterie: 0 };
      return { actif: true, intervalleMs: flux.intervalleMs };
    },
    setVisual(id, v) { const c = couches.get(id); if (!c) throw new Error('couche inconnue : ' + id); const { style, ...vis } = v; if (style) c.def.style = style; demonter(c); c.visuel = { ...c.visuel, ...vis }; monter(c); if (!c.visible) api.setLayerVisibility(id, false); return c.visuel; },
    updateFeature(layer, id, patch) {
      if (tables.has(layer)) { const { cree } = mettreAJourLigne(tables.get(layer), id, patch); bulleCtl.rafraichir(); return cree ? 'cree' : true; }   // une table liée : la ligne est corrigée, ou créée si l’identifiant est nouveau
      const c = couches.get(layer); const f = c && c.parId.get(id); if (!f) throw new Error('entité inconnue : ' + layer + '/' + id); if (patch.geometry) f.geometry = patch.geometry; if (patch.properties) f.properties = { ...f.properties, ...patch.properties }; map.getSource(idSrc(c)).setData({ type: 'FeatureCollection', features: c.features }); appliquerVue(c); return true; },
    setEdition(layer, actif) { opts.edition = { couche: layer, actif }; return actif; },
    getLegend(layer) { const c = layer ? couches.get(layer) : [...couches.values()][0]; if (!c) throw new Error('couche inconnue'); if (c.admin) return admin.legende(c);
      if (c.visuel.type === 'etats' && c.visuel.etats) { const T = themeDe(c); return { layer: c.id, titre: c.def.name, ...legendeEtats(c.visuel, c.vue, (cc) => resoudre(cc, T)), agregat: c.agg || null }; } const m = modeleLegende(declaratifResolu(c.def.style?.declarative, themeDe(c)), c.vue, { cle: c.def.name }); const et = c.visuel.etats; if (et) for (const cl of m.classes) { const e = et[cl.cle]; if (e) cl.forme = e.forme; } return { layer: c.id, titre: c.def.name, ...m, agregat: c.agg || null }; },
    getRows(layer, o = {}) { if (layer && tables.has(layer)) return { layer, lignes: tables.get(layer).map((l) => ({ ...l })) }; const c = layer ? couches.get(layer) : [...couches.values()][0]; if (!c) throw new Error('couche inconnue'); if (c.admin) return admin.lignes(c, o); return { layer: c.id, lignes: c.vue.map((f) => ({ id: f.id, ...f.properties })), legende: lignesLegende(api.getLegend(c.id)) }; },
    resize() { map.resize(); return true; },
    ...admin.api,
    /** Repli hors ligne : true (forcé), false (retour au fond précédent), 'auto' (détection : événement navigateur et échecs de tuiles). */
    async setHorsLigne(v) {
      if (v === 'auto') {
        horsLigne.auto = true;
        // « auto » rend la main à la détection : un hors ligne FORCÉ par l'hôte ne reste pas vrai, sauf si le navigateur est réellement hors réseau.
        if (horsLigne.actif && horsLigne.cause === 'hote' && !(typeof navigator !== 'undefined' && navigator.onLine === false)) return basculerHorsLigne(false, 'hote', true);
        return { actif: horsLigne.actif, auto: true };
      }
      return basculerHorsLigne(!!v, 'hote', false);
    },
    batch: (ordres, o) => executerBatch(apiGardee, ordres, o),
    /**
     * Fond de plan. `jetons` : `principal` (couleur principale du plan monochrome), `fondUni` (son fond) et les jetons du plan ; une couleur invalide est
     * ignorée et signalée. Renvoie { mode, …, ignore, avertissements } : les champs ajoutés ne gênent pas l'hôte qui lit seulement `mode`.
     */
    async setFond(mode, jetons = {}) {
      const { jetons: j, ignore } = assainirJetonsFond(jetons), { principal, fondUni, ...autres } = j, charte = themes.charte;
      const plan = principal ? planDepuis({ principal, fond: fondUni || charte.graines.fond, encre: charte.graines.encre, intensites: charte.fond.intensites, vegetation: charte.fond.vegetation }) : (theme.plan || {});
      const J = { ...plan, ...autres };
      const r = await fond.appliquer(mode, J);
      modeFond = mode; dernierFond = { mode, jetons }; poserTheme();
      for (const c of couches.values()) if (c.visuel.type === 'etats') { const sel = selection; demonter(c); monter(c); if (sel && sel.c === c) poserSelection(c, sel.id); }
      poserLavis();
      const mesure = verifierPlan({ ...theme.plan, ...J }, charte.exigences, 'jetons');
      return { ...r, ignore, avertissements: [...ignore.map(avertissementIgnore), ...mesure.avertissements] };
    },
  };
  const interne = { emettre, poserSelection, infos: (c, id) => admin.infosUnite(c, id) };
  const apiGardee = garderApi(api, capacites);
  return { api: apiGardee, capacites, paquet, _interne: interne, on: (t, cb) => { if (!ecouteurs.has(t)) ecouteurs.set(t, new Set()); ecouteurs.get(t).add(cb); }, off: (t, cb) => ecouteurs.get(t)?.delete(cb), brancherEmetteur: (fn) => { emetteur = fn; }, _couches: couches, _map: map };
}

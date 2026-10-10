/**
 * Couches administratives et choroplèthe dans le runtime BI (contrat 0.3).
 *
 * Ce module ne connaît pas le DOM : il reçoit un contexte du runtime (carte MapLibre, registre des couches, thème, émetteur
 * d'événements, fonctions internes de montage). Il ajoute au runtime :
 *  addAdminLayer, setChoropleth, setStatistique, drillDown, drillUp, setDrillAuto, setUnitFilter, removeLayer ;
 *  et les rendus de getLegend / getRows pour une couche choroplèthe.
 *
 * Rendu : une source GeoJSON par niveau (promoteId « code »), la couleur de chaque unité est posée par feature-state
 * (pas de reconstruction de la source quand la statistique change). Les unités sans donnée portent l'état « sans » : motif
 * hachuré (ou gris, ou masquées) ; les petits effectifs portent l'état « petit » : contour en tirets.
 */
import { attributionSure, attributionTexte } from '../attribution.js?v=1.16.5';
import { chargerAvecRepli, ErreurSource, ATTRIBUTION_IGN } from './admin-sources.js';
import { enfantsAttendus, creerIndex, agregerPoints, metrique, joindre, remonter, rapporter, baseDe, signalerPetits, normaliserCode, lireValeur, ancetre, estCommunePLM, fusionnerArrondissements } from './admin.js';
import { luminance, estPale } from './echelles.js';
import { modeleChoroplethe, lignesChoroplethe, lignesClassement, resumeChoroplethe, motifHachure, classesTropClaires } from './choroplethe.js';

const IMG_HACHURE = 'bi-hachure';
/** Opacité des aplats du choroplèthe (calque `fill`) : c'est elle qui décide si une classe se détache du fond, la charte la juge donc sur la couleur vue. */
export const OPACITE_REMPLISSAGE = 0.88;
export const ORDRE_NIVEAUX = Object.freeze(['pays', 'region', 'departement', 'commune']);
const enfantDe = (n) => ORDRE_NIVEAUX[ORDRE_NIVEAUX.indexOf(n) + 1] || null;
const tick = () => (typeof performance !== 'undefined' ? performance : Date).now();

export function creerAdmin(ctx) {
  const { map, couches, PREF, config = {} } = ctx;
  const pile = [];                        // fil d'Ariane du forage : { parent: idCoucheParent, code, niveau, enfant: idCoucheEnfant }
  const cache = new Map();                // clé niveau|filtre -> { features, meta }
  const auto = { actif: false, seuils: { departement: 5.5, commune: 8.5 }, bloque: false, timer: 0 };
  let refsPromise = null, sansRecalcul = 0; // sansRecalcul : filtre par unité en cours, les agrégats ne changent pas

  const th = () => ctx.getTheme();
  const base = () => config.base || new URL('./donnees/', import.meta.url).href;
  const fetchFn = () => config.fetch || globalThis.fetch.bind(globalThis);
  const chargerRefs = () => refsPromise || (refsPromise = fetchFn()(base() + 'references-population.json').then((r) => (r.ok ? r.json() : null)).catch(() => null));

  // ------------------------------------------------------------------ chargement
  async function chargerNiveau(niveau, o = {}) {
    const filtre = o.filtre && Object.keys(o.filtre).length ? o.filtre : null;
    const cle = niveau + '|' + (o.source || 'auto') + '|' + JSON.stringify(filtre) + '|' + (o.arrondissements || '') + '|' + (o.produit || '');
    if (o.donnees) { const feats = o.donnees.map((f) => ({ ...f, properties: { ...f.properties, niveau } })); return { features: feats, meta: { source: 'hote', niveau, nRequetes: 0, octets: 0, ms: 0, total: feats.length, attribution: attributionSure(attributionTexte(o.attribution)) || '' } }; }
    if (cache.has(cle)) { const r = cache.get(cle); return { features: r.features.map((f) => ({ ...f, properties: { ...f.properties } })), meta: { ...r.meta, cache: true } }; }
    const refs = await chargerRefs();
    const opts = { fetch: fetchFn(), base: base(), refs, produit: o.produit || config.produit || 'pe', filtre, timeoutMs: o.timeoutMs || config.timeoutMs || 30000, surProgres: (p) => ctx.emettre('progress', { niveau, ...p }, 'api') };
    let r;
    if (!o.source && ctx.horsLigne && ctx.horsLigne()) o = { ...o, source: 'embarque' }; // hors ligne : jeux embarqués seulement
    if (o.source === 'embarque') { const { chargerEmbarque } = await import('./admin-sources.js'); r = await chargerEmbarque(niveau, opts); }
    else if (o.source === 'ign') { const { chargerCouche } = await import('./admin-sources.js'); r = await chargerCouche(niveau, opts); }
    else r = await chargerAvecRepli(niveau, opts);
    if (niveau === 'commune' && o.arrondissements === 'detailles') { // Paris, Lyon, Marseille : arrondissements municipaux à la place de la commune (jamais les deux)
      const plm = r.features.filter((f) => estCommunePLM(f.properties.code)).map((f) => f.properties.code); const arr = [];
      for (const cm of plm) arr.push(...(await chargerAvecRepli('arrondissement', { ...opts, filtre: { commune: cm } })).features);
      if (arr.length) { r = { features: fusionnerArrondissements(r.features, arr), meta: { ...r.meta, arrondissements: plm } }; }
    }
    cache.set(cle, r);
    return { features: r.features.map((f) => ({ ...f, properties: { ...f.properties } })), meta: r.meta };
  }

  // ------------------------------------------------------------------ couche
  function enregistrer(def, features, meta, refs = null) {
    for (const f of features) f.id = f.properties.code;
    if (couches.has(def.id)) ctx.retirer(def.id);
    return ctx.ajouter(def, features, (c) => { c.admin = { niveau: def.admin.niveau, meta, valeurs: new Map(), effectifs: new Map(), modele: null, sale: true, refs, index: null, diag: null, affectation: null, parent: def.admin.parent || null, etatPose: new Map() }; });
  }

  async function addAdminLayer(niveau, o = {}) {
    if (!ORDRE_NIVEAUX.includes(niveau) && niveau !== 'epci' && niveau !== 'arrondissement') throw new Error('niveau inconnu : ' + niveau);
    const t0 = tick(); let r;
    try { r = await chargerNiveau(niveau, o); }
    catch (e) {
      const msg = e instanceof ErreurSource ? e.message : 'Chargement impossible : ' + (e && e.message);
      ctx.emettre('error', { code: e && e.code || 'chargement', message: msg, niveau }, 'api'); throw new Error(msg);
    }
    const id = o.id || 'admin-' + niveau;
    const visuel = { type: 'choroplethe', niveau, source: 'hote', methode: 'quantiles', classes: 5, palette: 'sequentielle', valeurSansDonnee: 'hachure', ...(o.visuel || {}) };
    verifierSpec(visuel);
    const def = { id, name: o.nom || { pays: 'Pays', region: 'Régions', departement: 'Départements', commune: 'Communes', epci: 'EPCI', arrondissement: 'Arrondissements' }[niveau], geometry_type: 'polygon', cle: 'code', admin: { niveau, parent: o.parent || null }, visuel, style: { declarative: { kind: 'single', color: 'jeton:contour' } }, controls: o.controls || [] };
    const c = enregistrer(def, r.features, r.meta, await chargerRefs());
    if (o.visible === false) ctx.api().setLayerVisibility(id, false);
    if (visuel.source === 'agregat' || visuel.table || visuel.donnees) assurer(c, true);
    const resume = { layer: id, niveau, n: r.features.length, source: r.meta.source, repli: !!r.meta.repli, cause: r.meta.cause || null, cache: !!r.meta.cache, ms: Math.round(tick() - t0), octets: r.meta.octets, nRequetes: r.meta.nRequetes, attribution: attributionSure(r.meta.attribution) || ATTRIBUTION_IGN, simplifie: !!r.meta.simplifie, millesime: r.meta.millesime || null };
    ctx.emettre('layer', resume, 'api');
    if (o.cadrer !== false) cadrer(c);
    return resume;
  }

  /** Boîte englobante d'un ensemble d'entités ; si elle dépasse 60 degrés (outre-mer), on se limite à la métropole. Aucune décomposition en arguments (jeux de 850 000 sommets). */
  function boite(feats, metropole = false) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const vue = (p) => { const x = p[0], y = p[1]; if (metropole && !(x > -6 && x < 10 && y > 41 && y < 52)) return; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    const parcours = (g) => { if (!g) return; const t = g.type; if (t === 'Point') vue(g.coordinates); else if (t === 'MultiPoint' || t === 'LineString') g.coordinates.forEach(vue); else if (t === 'Polygon' || t === 'MultiLineString') g.coordinates.forEach((r) => r.forEach(vue)); else if (t === 'MultiPolygon') g.coordinates.forEach((p) => p.forEach((r) => r.forEach(vue))); };
    for (const f of feats) parcours(f.geometry);
    return x0 === Infinity ? null : [[x0, y0], [x1, y1]];
  }
  function cadrer(c) {
    let b = boite(c.vue || c.features); if (!b) return false;
    if (b[1][0] - b[0][0] > 60) b = boite(c.vue || c.features, true) || b;
    ctx.camApi(); map.fitBounds(b, { padding: 40, duration: 500, maxZoom: 14 }); return true;
  }

  // ------------------------------------------------------------------ statistique
  const EXTENSIVE = (nom) => nom === 'n' || nom === 'somme' || String(nom).startsWith('n:');
  /** Un rapport (taux) n'a de sens que pour une grandeur additive : jamais « moyenne par habitant ». */
  function verifierSpec(v) {
    if (v.rapport && v.source === 'agregat' && !EXTENSIVE(v.metrique || 'n')) throw new Error("Un rapport à la population ou à la surface n'a de sens que pour un effectif ou une somme : la mesure « " + v.metrique + " » est refusée.");
    if (v.rapport && !['population', 'surface'].includes(v.rapport.base)) throw new Error('rapport.base doit valoir population ou surface');
  }
  function estUnitesAdmin(c) { return !!(c && c.admin); }
  function indexDe(c) { if (!c.admin.index) c.admin.index = creerIndex(c.features); return c.admin.index; }

  /** Calcule valeurs et effectifs de chaque unité selon c.visuel. */
  function calculer(c) {
    const v = c.visuel, A = c.admin, niveau = A.niveau; const valeurs = new Map(), effectifs = new Map(); const diag = { source: v.source };
    const rap = v.rapport || null; const baseUnite = (f) => (rap ? baseDe(f.properties, rap.base) : null); const facteur = rap ? (rap.facteur ?? 1) : 1;
    if (v.source === 'agregat') {
      const pc = couches.get(v.couche);
      if (!pc) { diag.erreur = 'couche de points inconnue : ' + v.couche; for (const f of c.features) valeurs.set(f.properties.code, null); A.valeurs = valeurs; A.effectifs = effectifs; A.diag = diag; return; }
      const ptsVue = ctx.vueSans(pc, ['__unite']); // auto-exclusion : le filtre par unité ne doit pas vider le choroplèthe qui l'a produit
      const r = agregerPoints(ptsVue, indexDe(c), { champ: v.champ || null, categorie: v.categorie || null, tolerance: v.tolerance ?? 0, affectation: true });
      A.affectation = { couche: pc.id, points: ptsVue, codes: r.codes }; diag.pip = r.stats;
      const nom = v.metrique || 'n'; const zeroOk = !!v.zeroSiVide && (nom === 'n' || nom === 'somme' || nom.startsWith('n:'));
      for (const f of c.features) {
        const code = f.properties.code; const u = r.unites.get(code);
        let val = u ? metrique(u, nom) : (zeroOk ? 0 : null);
        if (rap) val = rapporter(val, baseUnite(f), facteur);
        valeurs.set(code, val); effectifs.set(code, u ? u.n : 0);
      }
    } else {
      // source « hote » : un tableau {code: valeur} (ou lignes), au niveau de la couche ou à un niveau plus fin remonté par la hiérarchie
      const niveauTable = v.niveauTable || niveau; const champ = v.champTable || 'valeur', cle = v.cleTable || 'code';
      if (niveauTable === niveau) {
        const j = joindre(c.features, v.table || {}, { niveau, cle, champ, doublons: v.doublons || 'premier' });
        const idx = new Map(c.features.map((f) => [f.properties.code, f]));
        for (const [code, val] of j.valeurs) valeurs.set(code, rap ? rapporter(val, baseUnite(idx.get(code)), facteur) : val);
        diag.jointure = j.rapport;
        if (v.effectifs) for (const f of c.features) { const e = lireValeur(v.effectifs[f.properties.code]); effectifs.set(f.properties.code, e); }
      } else {
        const lignes = new Map(); const lignesBrutes = Array.isArray(v.table) ? v.table.map((r) => [r?.[cle], r?.[champ], v.champDen ? r?.[v.champDen] : undefined]) : Object.entries(v.table || {}).map(([k, x]) => [k, x, undefined]);
        let invalides = 0;
        for (const [k, x, d] of lignesBrutes) { const nrm = normaliserCode(niveauTable, k); if (!nrm.ok) { invalides++; continue; } const val = lireValeur(x); const den = d === undefined ? undefined : lireValeur(d); lignes.set(nrm.code, { num: val, den }); }
        const mode = v.champDen ? 'rapport' : 'somme';
        const rem = remonter(lignes, { source: niveauTable, cible: niveau, mode, facteur: v.champDen ? (v.facteurDen ?? 1) : 1, attendus: enfantsAttendus(niveauTable, niveau, A.refs) });
        const idx = new Map(c.features.map((f) => [f.properties.code, f]));
        for (const f of c.features) {
          const code = f.properties.code; const r = rem.get(code);
          let val = r && r.valeur !== null && (r.couverture >= (v.couvertureMin ?? 0.999)) ? r.valeur : null;  // une somme partielle n'est pas un total
          if (rap && val !== null) val = rapporter(val, baseUnite(idx.get(code)), facteur);
          valeurs.set(code, val); effectifs.set(code, r ? r.nSource - r.nManquants : 0);
        }
        diag.remontee = { de: niveauTable, vers: niveau, invalides, partielles: [...rem.values()].filter((r) => r.couverture < 1).length };
      }
    }
    A.valeurs = valeurs; A.effectifs = effectifs; A.diag = diag;
  }

  function modeleDe(c) {
    const v = c.visuel, A = c.admin;
    let petits = new Set();
    if (v.seuilPetit > 0) {
      if (v.source === 'agregat') petits = signalerPetits(A.effectifs, v.seuilPetit);
      else if (v.rapport) { const idx = new Map(c.features.map((f) => [f.properties.code, f])); petits = signalerPetits(new Map([...A.valeurs.keys()].map((k) => [k, baseDe(idx.get(k)?.properties, v.rapport.base)])), v.seuilPetit); } // l'effectif est la base (habitants ou km2)
      else petits = signalerPetits(A.effectifs, v.seuilPetit);
    }
    const unite = v.unite || (v.rapport ? (v.rapport.base === 'population' ? 'pour ' + (v.rapport.facteur === 1 ? '1 habitant' : (v.rapport.facteur || 1).toLocaleString('fr-FR') + ' hab.') : 'pour ' + (v.rapport.facteur || 1).toLocaleString('fr-FR') + ' km²') : '');
    const theme = th();
    return modeleChoroplethe(A.valeurs, { methode: v.methode, classes: v.classes, bornes: v.bornes, palette: v.palette, centre: v.centre, theme: { ...theme, fond: v.fond || theme.fondCarte || null }, petits, unite, titre: v.titre || c.def.name, couleurSansDonnee: ctx.resoudre(v.couleurSansDonnee || theme.sansDonnee || '#8a8f94') });
  }

  /** Recalcule si nécessaire (valeurs périmées) puis pose les états de rendu. */
  function assurer(c, force = false) {
    const A = c.admin; if (!A) return;
    if (A.sale || force) { calculer(c); A.sale = false; A.modele = modeleDe(c); poserEtats(c); }
    return A.modele;
  }
  function rendre(c) { const A = c.admin; A.modele = modeleDe(c); poserEtats(c); }

  function poserEtats(c) {
    const A = c.admin, m = A.modele; if (!m || !map.getSource(ctx.idSrc(c))) return;
    const src = ctx.idSrc(c); let n = 0;
    // « pâle » : la couleur VUE (à l'opacité de remplissage) ne se détache pas du fond d'au moins le contraste minimal de la charte (3:1)
    const fondCarte = th().fondCarte, seuil = (th().exigences && th().exigences.contrasteMinimal) || 3;
    for (const [code, u] of m.parUnite) {
      const nouveau = { couleur: u.couleur || null, sans: u.classe < 0, petit: !!u.petit, sombre: u.couleur ? (luminance(u.couleur) ?? 1) < 0.12 : false, pale: !!u.couleur && estPale(u.couleur, fondCarte, { opacite: OPACITE_REMPLISSAGE, seuil }) }; const ancien = A.etatPose.get(code);
      if (ancien && ancien.couleur === nouveau.couleur && ancien.sans === nouveau.sans && ancien.petit === nouveau.petit && ancien.pale === nouveau.pale) continue;
      map.setFeatureState({ source: src, id: code }, nouveau); A.etatPose.set(code, nouveau); n++;
    }
    A.derniersEtats = n;
  }

  /** Marque périmés les choroplèthes qui agrègent la couche de points donnée (appelé quand ses filtres changent). */
  function surVueChangee(idCouche) {
    if (sansRecalcul > 0) return;
    let touche = false;
    for (const c of couches.values()) if (c.admin && c.visuel.source === 'agregat' && c.visuel.couche === idCouche) { c.admin.sale = true; touche = true; }
    if (touche && !auto.planifie) { auto.planifie = true; (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : (f) => setTimeout(f, 0))(() => { auto.planifie = false; for (const c of couches.values()) if (c.admin && c.admin.sale) { assurer(c); ctx.emettre('statistique', resume(c), 'api'); } }); }
  }

  function resume(c) {
    const m = c.admin.modele; if (!m) return { layer: c.id };
    return { layer: c.id, niveau: c.admin.niveau, renseignees: m.renseignees, sansDonnee: m.sansValeur, petitsEffectifs: m.petitsEffectifs, classes: m.classesEffectives, methode: m.methode, avertissement: m.avertissement || null, diag: c.admin.diag, texte: resumeChoroplethe(m) };
  }

  // ------------------------------------------------------------------ montage des calques
  function monter(c, avant) {
    const th_ = th(), v = c.visuel, src = ctx.idSrc(c);
    const sel = ['boolean', ['feature-state', 'selected'], false], hov = ['boolean', ['feature-state', 'hover'], false], sans = ['boolean', ['feature-state', 'sans'], false], petit = ['boolean', ['feature-state', 'petit'], false];
    const gris = v.valeurSansDonnee === 'gris', masque = v.valeurSansDonnee === 'masque';
    const couleurSans = ctx.resoudre(v.couleurSansDonnee || th_.sansDonnee || '#8a8f94');
    const ajouter = (spec) => ctx.ajouterCalque(c, spec, avant);
    // MapLibre n'accepte `['zoom']` qu'en entrée d'un `interpolate` ou d'un `step` DE TÊTE : le choix sélection / survol se fait donc dans chaque palier
    // (un `case` au-dessus de l'interpolation faisait refuser le calque, sans bruit : le contour des unités n'existait pas).
    const largeurContour = (sel_, hov_) => ['interpolate', ['linear'], ['zoom'], ...[[3, 0.4], [8, 0.9], [12, 1.5]].flat().map((x, i) => (i % 2 ? ['case', sel_, 3.5, hov_, 2.2, x] : x))];
    ajouter({ id: PREF + 'fill-' + c.id, type: 'fill', source: src, paint: { 'fill-color': ['coalesce', ['feature-state', 'couleur'], gris ? couleurSans : 'rgba(0,0,0,0)'], 'fill-opacity': masque ? ['case', sans, 0, sel, 1, hov, 0.95, 0.88] : ['case', sel, 1, hov, 0.95, 0.88] } });
    if (!gris && !masque) {
      const motif = motifHachure(couleurSans, 8, 2, 0.85);
      try { if (map.hasImage(IMG_HACHURE)) map.removeImage(IMG_HACHURE); map.addImage(IMG_HACHURE, motif, { pixelRatio: 1 }); } catch (e) { /* image déjà posée */ }
      ajouter({ id: PREF + 'hach-' + c.id, type: 'fill', source: src, paint: { 'fill-pattern': IMG_HACHURE, 'fill-opacity': ['case', sans, 1, 0] } });
    }
    // Les classes PÂLES (qui se confondent avec le fond) n'ont pas de bord visible : un trait de l'encre de la charte (clair sur un fond sombre) les cerne, comme
    // l'annonce l'avertissement `contraste-classe-fond`. Sous le halo et le trait de sélection.
    ajouter({ id: PREF + 'pale-' + c.id, type: 'line', source: src, paint: { 'line-color': ctx.resoudre(th_.selection || '#111111'), 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 8, 0.9, 12, 1.5], 'line-opacity': ['case', ['boolean', ['feature-state', 'pale'], false], 0.85, 0] } });
    ajouter({ id: PREF + 'petit-' + c.id, type: 'line', source: src, paint: { 'line-color': ctx.resoudre(th_.selection || '#111111'), 'line-width': 1.6, 'line-dasharray': [2, 2], 'line-opacity': ['case', petit, 0.9, 0] } });
    // halo clair sous le trait de sélection : le trait sombre seul est invisible sur la classe la plus sombre (contraste 1:1)
    ajouter({ id: PREF + 'halo-' + c.id, type: 'line', source: src, paint: { 'line-color': ctx.resoudre(th_.halo || '#ffffff'), 'line-width': ['case', sel, 8, hov, 5, 0], 'line-opacity': 0.95 } });
    ajouter({ id: PREF + 'line-' + c.id, type: 'line', source: src, paint: { 'line-color': ['case', sel, ctx.resoudre(th_.selection || '#111111'), ['boolean', ['feature-state', 'sombre'], false], ctx.resoudre(th_.halo || '#ffffff'), ctx.resoudre(th_.contour || '#ffffff')], 'line-width': largeurContour(sel, hov) } });
    c.admin.etatPose = new Map(); // les états de rendu sont perdus avec la source : à reposer
    if (c.admin.modele) poserEtats(c);
  }

  // ------------------------------------------------------------------ commandes
  const couche = (id) => { const c = couches.get(id); if (!c) throw new Error('couche inconnue : ' + id); if (!c.admin) throw new Error('la couche « ' + id + ' » n\'est pas une couche administrative'); return c; };
  const remonterCouche = (c) => { const sel = ctx.getSelection(); ctx.demonter(c); ctx.monter(c); ctx.reappliquerVisibilite(c); if (sel && sel.c === c) ctx.poserSelection(c, sel.id); };

  /** Descend dans une unité : charge le niveau inférieur restreint à cette unité, masque le parent, empile le fil. */
  async function descendre(id, code, o = {}) {
    const c = couche(id); const niveau = c.admin.niveau, enfant = enfantDe(niveau); if (!enfant) throw new Error('pas de niveau inférieur à « ' + niveau + ' »');
    if (!c.parId.has(code)) throw new Error('unité inconnue dans ' + id + ' : ' + code);
    const filtre = enfant === 'region' ? null : enfant === 'departement' ? { region: code } : { departement: code };
    auto.bloque = true; map.once('moveend', () => setTimeout(() => { auto.bloque = false; }, 500));
    ctx.api().setLayerVisibility(id, false);
    const base_ = c.visuel; const visuel = {}; for (const k of [...CLES_STAT, ...CLES_STYLE]) if (base_[k] !== undefined) visuel[k] = base_[k];
    let res;
    try { res = await addAdminLayer(enfant, { id: o.id || 'admin-' + enfant, filtre, visuel, parent: code, produit: o.produit, source: o.source, arrondissements: o.arrondissements, cadrer: o.cadrer }); }
    catch (e) { ctx.api().setLayerVisibility(id, true); auto.bloque = false; throw e; }
    pile.push({ parent: id, code, niveau, enfant: res.layer });
    const fil = pile.map((p) => ({ niveau: p.niveau, code: p.code }));
    ctx.emettre('drill', { sens: 'bas', niveau: enfant, parent: code, layer: res.layer, fil }, o.origine || 'api');
    return { ...res, fil };
  }
  /** Remonte d'un niveau : retire la couche enfant, réaffiche le parent. */
  function monterNiveau(o = {}) {
    const p = pile.pop(); if (!p) return null;
    auto.bloque = true; map.once('moveend', () => setTimeout(() => { auto.bloque = false; }, 500));
    if (couches.has(p.enfant)) ctx.retirer(p.enfant);
    const parent = couches.get(p.parent); if (parent) { ctx.api().setLayerVisibility(p.parent, true); if (o.cadrer !== false) cadrer(parent); }
    const fil = pile.map((q) => ({ niveau: q.niveau, code: q.code }));
    ctx.emettre('drill', { sens: 'haut', niveau: p.niveau, parent: p.code, layer: p.parent, fil }, o.origine || 'api'); return { layer: p.parent, niveau: p.niveau, fil };
  }

  const CLES_STYLE = ['methode', 'classes', 'bornes', 'palette', 'centre', 'valeurSansDonnee', 'couleurSansDonnee', 'unite', 'titre', 'seuilPetit', 'fond'];
  const CLES_STAT = ['source', 'couche', 'champ', 'metrique', 'categorie', 'rapport', 'zeroSiVide', 'tolerance', 'table', 'niveauTable', 'cleTable', 'champTable', 'champDen', 'facteurDen', 'doublons', 'effectifs', 'couvertureMin'];
  const api = {
    addAdminLayer,
    removeLayer(id) { const c = couches.get(id); if (!c) throw new Error('couche inconnue : ' + id); ctx.retirer(id); for (let i = pile.length - 1; i >= 0; i--) if (pile[i].parent === id || pile[i].enfant === id) pile.splice(i, 1); return true; },
    /** Change le style du choroplèthe (classes, méthode, palette, traitement du sans-donnée) sans recalculer les valeurs. */
    setChoropleth(id, o) {
      const c = couche(id); const v = c.visuel; const avantSans = v.valeurSansDonnee + '|' + v.couleurSansDonnee;
      if (o.methode && !['quantiles', 'egaux', 'manuelle'].includes(o.methode)) throw new Error('méthode inconnue : ' + o.methode);
      if (o.palette && !['sequentielle', 'divergente'].includes(o.palette)) throw new Error('palette inconnue : ' + o.palette);
      if (o.valeurSansDonnee && !['hachure', 'gris', 'masque'].includes(o.valeurSansDonnee)) throw new Error('valeurSansDonnee inconnue : ' + o.valeurSansDonnee);
      for (const k of CLES_STYLE) if (o[k] !== undefined) v[k] = o[k];
      if (c.admin.sale) assurer(c, true);
      else if (avantSans !== v.valeurSansDonnee + '|' + v.couleurSansDonnee) { c.admin.modele = modeleDe(c); remonterCouche(c); }
      else rendre(c);
      return resume(c);
    },
    /** Définit la statistique : agrégat des points d'une couche, ou tableau fourni par l'hôte (avec jointure par code). */
    setStatistique(id, o) {
      const c = couche(id); const v = c.visuel;
      if (o.source && !['agregat', 'hote'].includes(o.source)) throw new Error('source de statistique inconnue : ' + o.source);
      if (o.source === 'agregat' && !(o.couche || v.couche)) throw new Error('setStatistique : « couche » (points à agréger) requise');
      const essai = { ...v }; for (const k of [...CLES_STAT, ...CLES_STYLE]) if (o[k] !== undefined) essai[k] = o[k];
      if (o.rapport === null) delete essai.rapport;
      verifierSpec(essai); Object.keys(v).forEach((k) => delete v[k]); Object.assign(v, essai);
      assurer(c, true); const r = resume(c); ctx.emettre('statistique', r, 'api'); return r;
    },
    drillDown: (id, code, o) => descendre(id, code, o),
    drillUp: (o) => monterNiveau(o),
    /** Forage selon le zoom : { actif, seuils:{departement, commune} }. Le niveau affiché suit le zoom. */
    setDrillAuto(o = true) {
      const cfg = typeof o === 'boolean' ? { actif: o } : o; auto.actif = cfg.actif !== false; if (cfg.seuils) auto.seuils = { ...auto.seuils, ...cfg.seuils };
      return { actif: auto.actif, seuils: auto.seuils };
    },
    /** Restreint une couche de points aux points situés dans une unité (code), ou retire la restriction (null). */
    setUnitFilter(idPoints, idAdmin, code) {
      const pc = couches.get(idPoints); if (!pc) throw new Error('couche inconnue : ' + idPoints); const c = couche(idAdmin);
      const champ = '_u_' + c.admin.niveau, ctlId = '__unite';
      let x = pc.controles.find((k) => k.id === ctlId);
      if (!x) { x = { id: ctlId, field: champ, type: 'select', active: false }; pc.controles.push(x); }
      x.field = champ;
      if (code === null) { sansRecalcul++; try { const r0 = ctx.majFiltre(ctlId, null); ctx.emettre('filter', { controlId: ctlId, value: null, ...r0, unite: null }, 'api'); return r0; } finally { sansRecalcul--; } }
      if (!c.parId.has(code)) throw new Error('unité inconnue : ' + code);
      const index = indexDe(c); // les points portent le code de leur unité (champ interne), calculé une fois par couche
      if (pc._uniteNiveau !== c.admin.niveau + '|' + c.id || pc._uniteN !== pc.features.length) {
        for (const f of pc.features) { const g = f.geometry; f.properties = f.properties || {}; f.properties[champ] = g && g.type === 'Point' ? (index.trouver(g.coordinates[0], g.coordinates[1], c.visuel.tolerance || 0).code || '') : ''; }
        pc._uniteNiveau = c.admin.niveau + '|' + c.id; pc._uniteN = pc.features.length;
      }
      sansRecalcul++; try { const r = ctx.majFiltre(ctlId, [code]); ctx.emettre('filter', { controlId: ctlId, value: [code], ...r, unite: code }, 'api'); return r; } finally { sansRecalcul--; }
    },
  };

  // ------------------------------------------------------------------ lecture : légende, tableau
  function legende(c) {
    const m = assurer(c); const A = c.admin;
    return { layer: c.id, titre: m.titre, type: 'choroplethe', niveau: A.niveau, unite: m.unite, methode: m.methode, palette: m.palette, centre: m.centre, seuils: m.seuils, min: m.min, max: m.max, total: m.total, renseignees: m.renseignees, sansValeur: m.sansValeur, petitsEffectifs: m.petitsEffectifs, seuilPetit: c.visuel.seuilPetit || null,
      classes: m.classes.map((k) => ({ ...k })), sansDonnee: { ...m.sansDonnee, traitement: c.visuel.valeurSansDonnee || 'hachure' }, classesDemandees: m.classesDemandees, classesEffectives: m.classesEffectives, avertissement: m.avertissement || null,
      classesTropClaires: th().fondCarte ? classesTropClaires(m, th().fondCarte) : [], diag: A.diag, source: A.meta ? { type: A.meta.source, repli: !!A.meta.repli, simplifie: !!A.meta.simplifie, millesime: A.meta.millesime || null, attribution: attributionSure(A.meta.attribution) || '' } : null, lignes: lignesChoroplethe(m), resume: resumeChoroplethe(m) };
  }
  function lignes(c, o = {}) {
    const m = assurer(c); const v = c.visuel;
    const rows = lignesClassement(c.vue, m, { tri: o.tri || 'valeur', ordre: o.ordre || 'desc', rapportBase: v.rapport ? (p) => baseDe(p, v.rapport.base) : null });
    const limite = o.limite > 0 ? o.limite : rows.length;
    return { layer: c.id, niveau: c.admin.niveau, unite: m.unite, lignes: rows.slice(0, limite), total: rows.length, legende: lignesChoroplethe(m) };
  }
  function infosUnite(c, id) {
    const m = c.admin.modele; const f = c.parId.get(id); if (!f) return {};
    const u = m && m.parUnite.get(id);
    return { code: id, nom: f.properties.nom, niveau: c.admin.niveau, valeur: u ? u.valeur : null, classe: u ? u.classe : null, petit: u ? !!u.petit : false, population: f.properties.population ?? null, sansDonnee: u ? u.classe < 0 : true };
  }

  // forage selon le zoom : au retour de mouvement, aller au niveau voulu
  function niveauVoulu(z) { return z >= auto.seuils.commune ? 'commune' : z >= auto.seuils.departement ? 'departement' : 'region'; }
  async function surMouvement() {
    if (!auto.actif || auto.bloque || !pile.length && !visibleAdmin()) return;
    auto.bloque = true;
    try {
      for (let garde = 0; garde < 3; garde++) {
        const cour = visibleAdmin(); if (!cour) break; const actuel = ORDRE_NIVEAUX.indexOf(cour.admin.niveau); let voulu = ORDRE_NIVEAUX.indexOf(niveauVoulu(map.getZoom())); if (voulu < actuel && ORDRE_NIVEAUX.indexOf(niveauVoulu(map.getZoom() + 0.3)) >= actuel) voulu = actuel; // hystérésis : pas de va-et-vient au ras du seuil
        if (voulu > actuel) {
          const ce = map.getCenter(); const code = indexDe(cour).trouver(ce.lng, ce.lat, 2000).code; if (code === null) break; // unité sous le centre de la vue (sans attendre le rendu)
          auto.bloque = false; await descendre(cour.id, code, { origine: 'utilisateur', cadrer: false }); auto.bloque = true;
        } else if (voulu < actuel && pile.length) { monterNiveau({ origine: 'utilisateur', cadrer: false }); } else break;
      }
    } catch (e) { ctx.emettre('error', { code: 'forage', message: String(e && e.message || e) }, 'api'); }
    finally { setTimeout(() => { auto.bloque = false; }, 600); }
  }
  const visibleAdmin = () => { const ouv = [...couches.values()].filter((c) => c.admin && c.visible); return ouv.length ? ouv[ouv.length - 1] : null; };
  map.on('moveend', () => { clearTimeout(auto.timer); auto.timer = setTimeout(surMouvement, 350); });

  return { api, monter, legende, lignes, infosUnite, surVueChangee, assurer, estUnitesAdmin, pile, cache, chargerNiveau, _auto: auto };
}

/**
 * Vérification d'une charte et de ses palettes : contrastes WCAG, écarts CIEDE2000 entre classes voisines au pire des quatre visions,
 * ordre des clartés, nombre de classes conseillé, texte lisible sur une classe. Module pur.
 *
 * Chaque constat est un AVERTISSEMENT chiffré, jamais un refus : la charte reste utilisable.
 *   { code, niveau, chemin, valeur, mesure, conseil }
 *  - `niveau` : « attention » (un défaut de lisibilité qu'une couche ne peut pas corriger seule) ou « info » (un fait de la palette
 *    que l'affichage compense : un contour, une forme, une étiquette) ;
 *  - `mesure` : les nombres, pour qu'on puisse les vérifier ;
 *  - `conseil` : ce qu'il faut faire (« contour sombre requis », « réduire à 5 classes »).
 *
 * Seuils (règles de pouce de cartographie, pas des normes ; ceux de l'hôte se règlent dans `exigences`) :
 *  - aplat ou trait contre son fond : 3:1 (WCAG 2.1, critère 1.4.11) ; texte : 4,5:1 (critère 1.4.3) ;
 *  - classes voisines (CIEDE2000, pire cas sur vision normale, protanopie, deutéranopie, tritanopie) : >= 10 « net », >= `ecartMinimal` (6) « admis ».
 */
import { contraste, deltaE2000, simulerDaltonisme, TYPES_DALTONISME, clarte, luminance, echantillonner } from './couleurs.js';

export const VERSION = '1.0.0';
export const SEUILS = Object.freeze({ graphique: 3, texte: 4.5, deltaNet: 10, deltaAdmis: 6, miroir: 10, classesEvaluees: 5 });
export const EXIGENCES_DEFAUT = Object.freeze({ contrasteMinimal: SEUILS.graphique, contrasteTexte: SEUILS.texte, ecartMinimal: SEUILS.deltaAdmis, classesMax: 5 });

const arr = (x, d = 2) => (x === null || x === undefined ? x : Math.round(x * 10 ** d) / 10 ** d);
const VISIONS = Object.freeze([['normale', (c) => c], ...TYPES_DALTONISME.map((t) => [t, (c) => simulerDaltonisme(c, t)])]);
const liste = (xs) => xs.join(', ');
const lire = (ex) => ({ ...EXIGENCES_DEFAUT, ...(ex || {}) });

/** Construit un avertissement. */
export function avertissement(code, niveau, chemin, valeur, mesure, conseil) { return { code, niveau, chemin, valeur, mesure, conseil }; }

// ---------------------------------------------------------------------------------------------------------------- mesures sur un jeu de classes
/** Écart CIEDE2000 minimal entre deux classes voisines, par vision, et au pire. */
export function ecartsVoisins(classes) {
  const parVision = {};
  for (const [nom, f] of VISIONS) { const c = classes.map(f); parVision[nom] = c.length < 2 ? null : Math.min(...c.slice(0, -1).map((x, i) => deltaE2000(x, c[i + 1]))); }
  const valeurs = Object.values(parVision).filter((v) => v !== null);
  const pire = valeurs.length ? Math.min(...valeurs) : null;
  const vision = pire === null ? null : Object.keys(parVision).find((k) => parVision[k] === pire);
  return { parVision: Object.fromEntries(Object.entries(parVision).map(([k, v]) => [k, arr(v, 1)])), pire: arr(pire, 1), vision, niveau: pire === null ? null : pire >= SEUILS.deltaNet ? 'net' : pire >= SEUILS.deltaAdmis ? 'admis' : 'deconseille' };
}

/** Écart minimal entre TOUTES les paires d'un préfixe de k couleurs (qualitative), par vision, et au pire. */
export function ecartsTousPairs(couleurs, k) {
  let pire = Infinity, ou = null, vision = null;
  for (const [nom, f] of VISIONS) {
    const c = couleurs.slice(0, k).map(f);
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) { const d = deltaE2000(c[i], c[j]); if (d < pire) { pire = d; ou = [i + 1, j + 1]; vision = nom; } }
  }
  return { pire: arr(pire, 1), paire: ou, vision };
}

/** Plus grand n (de nMin à nMax) pour lequel `classesPourN(n)` atteint le seuil au pire cas ; null si aucun. */
export function nMaxMesure(classesPourN, seuil, nMin = 3, nMax = 9) {
  let ok = null;
  for (let n = nMin; n <= nMax; n++) { const e = ecartsVoisins(classesPourN(n)); if (e.pire >= seuil) ok = n; }
  return ok;
}

/** Les clartés restent-elles strictement monotones (dans un sens ou l'autre) pour chaque vision et en niveaux de gris ? */
export function ordreClartes(classes) {
  const mono = (xs) => { const s = Math.sign(xs[xs.length - 1] - xs[0]); return s !== 0 && xs.every((x, i) => i === 0 || (x - xs[i - 1]) * s > 0); };
  const sortie = {};
  for (const [nom, f] of VISIONS) sortie[nom] = mono(classes.map((c) => clarte(f(c))));
  sortie.gris = mono(classes.map((c) => luminance(c)));
  const cassees = Object.keys(sortie).filter((k) => !sortie[k]);
  return { ...sortie, cassees };
}

/** Contour d'un aplat : le plus contrasté des deux candidats (l'encre et le fond de la charte) ; `nature` dit s'il est sombre ou clair. */
export function contourPour(couleur, a, b) {
  const ra = contraste(a, couleur), rb = contraste(b, couleur), hex = ra >= rb ? a : b;
  return { hex, nature: clarte(hex) < 50 ? 'sombre' : 'clair', rapport: arr(Math.max(ra, rb)) };
}

const nomRang = (rangs) => (rangs.length > 1 ? 'classes ' : 'classe ') + liste(rangs);
const laRang = (rangs) => (rangs.length > 1 ? 'les ' : 'la ') + nomRang(rangs);

// ---------------------------------------------------------------------------------------------------------------- une palette
/**
 * Vérifie une palette seule.
 * @param {{type:'qualitative'|'sequential'|'divergent', couleurs:string[]}} palette
 * @param {{fond:string, encre:string, exigences?:object, chemin?:string}} ctx
 * @returns {{avertissements:object[], mesures:object}}
 */
export function verifierPalette(palette, ctx) {
  const { fond, encre } = ctx, ex = lire(ctx.exigences), chemin = ctx.chemin || 'palette';
  const av = [], mesures = {};
  const cs = palette.couleurs.map((c) => c.toLowerCase());

  // Les classes réellement affichées : n couleurs prises sur la rampe (séquentielle) ; la palette telle quelle (qualitative, divergente).
  const classes = (n) => (palette.type === 'sequential' ? echantillonner(cs, n) : cs.slice(0, n));
  const nEval = palette.type === 'sequential' ? Math.min(SEUILS.classesEvaluees, ex.classesMax) : cs.length;
  const aff = classes(nEval);

  // 1. ordre des clartés
  if (palette.type !== 'qualitative') {
    const moitie = palette.type === 'divergent' ? [cs.slice(0, Math.ceil(cs.length / 2)), cs.slice(Math.floor(cs.length / 2))] : [cs];
    const cassees = new Set(); for (const m of moitie) for (const k of ordreClartes(m).cassees) cassees.add(k);
    mesures.ordre = { cassees: [...cassees] };
    if (cassees.size) av.push(avertissement('ordre-clartes', 'attention', chemin, cs.join(' '), { visions: [...cassees] }, "Les clartés ne vont pas dans un seul sens pour " + liste([...cassees]) + " : choisir une rampe dont la clarté (L*) varie sans retour en arrière."));
  }

  // 2. écart entre classes voisines et nombre de classes
  if (palette.type === 'sequential') {
    const net = nMaxMesure((n) => classes(n), SEUILS.deltaNet, 3, 9), admis = nMaxMesure((n) => classes(n), ex.ecartMinimal, 3, 9);
    const aClasses = ecartsVoisins(classes(ex.classesMax));
    mesures.classes = { nMaxNet: net, nMaxAdmis: admis, classesMax: ex.classesMax, pireAClassesMax: aClasses.pire, visionPire: aClasses.vision };
    if (admis === null) av.push(avertissement('ecart-classes-voisines', 'attention', chemin, cs.join(' '), { pire: ecartsVoisins(classes(3)).pire, seuil: ex.ecartMinimal, classes: 3 }, 'Même à 3 classes, deux classes voisines se confondent : écarter les extrémités de la rampe.'));
    else if (ex.classesMax > admis) av.push(avertissement('nombre-classes', 'attention', chemin, ex.classesMax, { classesMax: ex.classesMax, pire: aClasses.pire, vision: aClasses.vision, seuil: ex.ecartMinimal, nMaxAdmis: admis, nMaxNet: net }, 'Réduire à ' + admis + ' classes' + (net && net < admis ? ' (' + net + ' pour des classes nettes)' : '') + " : au-delà, deux classes voisines se confondent pour une personne daltonienne."));
  } else if (palette.type === 'divergent') {
    const e = ecartsVoisins(cs); mesures.classes = { n: cs.length, pire: e.pire, vision: e.vision };
    if (e.pire < ex.ecartMinimal) av.push(avertissement('ecart-classes-voisines', 'attention', chemin, cs.join(' '), { pire: e.pire, vision: e.vision, seuil: ex.ecartMinimal, classes: cs.length }, 'Réduire le nombre de classes ou écarter les couleurs : deux classes voisines se confondent en ' + e.vision + '.'));
    // paires miroir : l'opposé d'une classe ne doit jamais lui ressembler (rouge-vert)
    const n = cs.length, paires = Math.floor(n / 2); let pire = Infinity, vision = null, ou = null;
    for (const [nom, f] of VISIONS) for (let i = 0; i < paires; i++) { const d = deltaE2000(f(cs[i]), f(cs[n - 1 - i])); if (d < pire) { pire = d; vision = nom; ou = [i + 1, n - i]; } }
    mesures.miroir = { pire: arr(pire, 1), vision, classes: ou };
    if (pire < SEUILS.miroir) av.push(avertissement('divergente-confondue', 'attention', chemin, cs.join(' '), { pire: arr(pire, 1), vision, classes: ou, seuil: SEUILS.miroir }, 'Les deux pôles se confondent en ' + vision + " : opposer une teinte chaude et une teinte froide (bleu et orange), jamais rouge et vert."));
  } else {
    const k = cs.length; let kNet = 1, kAdmis = 1;
    for (let m = 2; m <= k; m++) { const r = ecartsTousPairs(cs, m); if (r.pire >= SEUILS.deltaNet) kNet = m; if (r.pire >= ex.ecartMinimal) kAdmis = m; }
    const plein = ecartsTousPairs(cs, k);
    mesures.classes = { n: k, kMaxNet: kNet, kMaxAdmis: kAdmis, pire: plein.pire, vision: plein.vision, paire: plein.paire };
    if (kAdmis < k) av.push(avertissement('ecart-qualitative', k > ex.classesMax && kAdmis >= ex.classesMax ? 'info' : 'attention', chemin, k, { pire: plein.pire, vision: plein.vision, paire: plein.paire, seuil: ex.ecartMinimal, kMaxAdmis: kAdmis, kMaxNet: kNet }, 'Limiter à ' + kAdmis + ' catégories, ou les distinguer aussi par une forme ou une étiquette (deux couleurs se confondent en ' + plein.vision + ').'));
  }

  // 3. contraste d'une classe sur le fond, et texte lisible sur chaque classe
  const pales = [], rapports = [];
  aff.forEach((c, i) => { const r = contraste(c, fond); rapports.push(arr(r)); if (r < ex.contrasteMinimal) pales.push(i + 1); });
  mesures.contrasteFond = rapports;
  if (palette.type === 'divergent') { const milieu = cs.length % 2 ? (cs.length + 1) / 2 : null; const idx = pales.indexOf(milieu); if (idx >= 0) pales.splice(idx, 1); }
  if (pales.length) {
    const sombre = contourPour(aff[pales[0] - 1], encre, fond);
    av.push(avertissement('contraste-classe-fond', 'info', chemin, nomRang(pales), { rapports: Object.fromEntries(pales.map((r) => [r, rapports[r - 1]])), seuil: ex.contrasteMinimal, classesEvaluees: aff.length, contour: sombre.nature }, 'Contour ' + sombre.nature + ' requis sur ' + laRang(pales) + ' (moins de ' + ex.contrasteMinimal + ':1 contre le fond) ; ce contour atteint ' + sombre.rapport + ':1 contre la classe.'));
  }
  // un libellé sur une classe : 4,5:1 au plus (le noir ou le blanc atteignent toujours 4,58:1, rien de plus n'est exigible d'une classe de ton moyen)
  const seuilEtiquette = Math.min(ex.contrasteTexte, SEUILS.texte);
  const illisibles = []; aff.forEach((c, i) => { const r = Math.max(contraste(encre, c), contraste(fond, c)); if (r < seuilEtiquette) illisibles.push([i + 1, arr(r)]); });
  mesures.texteIllisible = illisibles.map((x) => x[0]);
  if (illisibles.length) av.push(avertissement('texte-illisible-classe', 'info', chemin, nomRang(illisibles.map((x) => x[0])), { rapports: Object.fromEntries(illisibles), seuil: seuilEtiquette }, "Ni l'encre ni le fond ne se lisent sur " + laRang(illisibles.map((x) => x[0])) + " : poser l'étiquette sur un halo, ou en noir ou en blanc."));
  return { avertissements: av, mesures };
}

/**
 * Vérifie les jetons d'un plan de fond : les limites doivent se voir (info), les noms de lieux se lire (attention).
 * @param {object} plan  jetons du plan (au moins `fond`, `limite`, `texte`)
 */
export function verifierPlan(plan, exigences, chemin = 'fond.plan') {
  const ex = lire(exigences), av = [];
  const rLimite = contraste(plan.limite, plan.fond), rTexte = contraste(plan.texte, plan.fond);
  if (rLimite < ex.contrasteMinimal) av.push(avertissement('contraste-plan', 'info', chemin + '.limite', plan.limite, { rapport: arr(rLimite), seuil: ex.contrasteMinimal }, 'Les limites du plan sont discrètes (' + arr(rLimite) + ':1) : relever l\'intensité « limite » du fond si elles doivent se lire.'));
  if (rTexte < ex.contrasteTexte) av.push(avertissement('contraste-texte', 'attention', chemin + '.texte', plan.texte, { rapport: arr(rTexte), seuil: ex.contrasteTexte, fond: plan.fond }, 'Les noms de lieux du plan doivent atteindre ' + ex.contrasteTexte + ':1.'));
  return { avertissements: av, mesures: { limite: arr(rLimite), texte: arr(rTexte) } };
}

// ---------------------------------------------------------------------------------------------------------------- une charte complète
/**
 * Vérifie une charte RÉSOLUE (toutes les sections présentes, voir resolution.js).
 * @returns {{avertissements:object[], mesures:object, a11y:object}}
 */
export function verifierCharte(charte) {
  const ex = lire(charte.exigences), g = charte.graines, d = charte.donnees, fondRef = charte.fond.plan.fond;
  const av = [], mesures = { palettes: {} };

  const rTexte = contraste(g.encre, g.fond); mesures.encreSurFond = arr(rTexte);
  if (rTexte < ex.contrasteTexte) av.push(avertissement('contraste-texte', 'attention', 'graines.encre', g.encre, { rapport: arr(rTexte), seuil: ex.contrasteTexte, fond: g.fond }, "Assombrir l'encre ou éclaircir le fond : le texte doit atteindre " + ex.contrasteTexte + ':1.'));

  for (const e of ['succes', 'alerte', 'erreur', 'information']) {
    const r = contraste(g[e], g.fond);
    if (r < ex.contrasteTexte) av.push(avertissement('contraste-etat', 'attention', 'graines.' + e, g[e], { rapport: arr(r), seuil: ex.contrasteTexte, fond: g.fond }, 'Assombrir cette couleur d\'état : un texte ou une icône d\'état doit atteindre ' + ex.contrasteTexte + ':1.'));
  }
  for (const [chemin, couleur] of [['donnees.selection', d.selection], ['donnees.sansDonnee', d.sansDonnee], ['marqueurs.contour', charte.marqueurs.contour]]) {
    const r = contraste(couleur, fondRef);
    if (r < ex.contrasteMinimal) av.push(avertissement('contraste-trait', 'attention', chemin, couleur, { rapport: arr(r), seuil: ex.contrasteMinimal, fond: fondRef }, 'Assombrir ce trait : un trait ou un aplat doit atteindre ' + ex.contrasteMinimal + ':1 contre le fond.'));
  }
  const vp = verifierPlan(charte.fond.plan, ex); av.push(...vp.avertissements); mesures.limitePlan = vp.mesures.limite;

  // marqueurs : deux états de même forme et de couleurs qui se confondent
  const etats = ['succes', 'alerte', 'erreur', 'information'], confondus = [];
  for (let i = 0; i < etats.length; i++) for (let j = i + 1; j < etats.length; j++) {
    const a = etats[i], b = etats[j]; let pire = Infinity, vision = null;
    for (const [nom, f] of VISIONS) { const e = deltaE2000(f(g[a]), f(g[b])); if (e < pire) { pire = e; vision = nom; } }
    const memeForme = charte.marqueurs.formes[a] === charte.marqueurs.formes[b];
    if (pire < ex.ecartMinimal && memeForme) confondus.push({ etats: [a, b], pire: arr(pire, 1), vision });
  }
  mesures.marqueursConfondus = confondus;
  for (const c of confondus) av.push(avertissement('marqueurs-confondus', 'attention', 'marqueurs.formes', c.etats.join(' / '), { pire: c.pire, vision: c.vision, seuil: ex.ecartMinimal }, 'Donner une forme différente à ces deux états : leurs couleurs se confondent en ' + c.vision + '.'));

  const palettes = [
    ...Object.entries(d.sequentielles).map(([nom, couleurs]) => ({ chemin: 'donnees.sequentielles.' + nom, type: 'sequential', couleurs })),
    { chemin: 'donnees.divergente', type: 'divergent', couleurs: d.divergente },
    { chemin: 'donnees.qualitative', type: 'qualitative', couleurs: d.qualitative },
  ];
  for (const p of palettes) {
    const r = verifierPalette(p, { fond: fondRef, encre: g.encre, exigences: ex, chemin: p.chemin });
    av.push(...r.avertissements); mesures.palettes[p.chemin] = r.mesures;
  }

  const pires = {};
  for (const [chemin, m] of Object.entries(mesures.palettes)) if (m.classes) pires[chemin] = m.classes.pireAClassesMax ?? m.classes.pire ?? null;
  const a11y = {
    encreSurFond: mesures.encreSurFond, exigences: ex,
    ecartPireCas: pires,
    attention: av.filter((x) => x.niveau === 'attention').length, info: av.filter((x) => x.niveau === 'info').length,
  };
  return { avertissements: av, mesures, a11y };
}

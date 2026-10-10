/**
 * Schéma de la charte graphique d'Atlas : version, limites, listes sûres, assainissement et validation. Module pur.
 *
 * Une charte vient presque toujours de l'extérieur (application hôte, manifeste de scène, projet partagé) : c'est une entrée NON FIABLE.
 * Elle est donc reconstruite champ par champ à partir d'une table de règles, jamais copiée :
 *  - seules les clés connues survivent ; les autres sont ignorées (`cle-inconnue`) ;
 *  - une couleur doit être `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()` ou `hsl()` (voir `analyserCouleur`), jamais `url()`, `var()`, `expression`
 *    ni HTML ; les rampes et les graines sont OPAQUES (la translucidité d'une couche est son `opacite`) ;
 *  - toute liste, tout dictionnaire et toute chaîne est borné (voir `LIMITES`) ;
 *  - une valeur invalide est IGNORÉE et signalée (`{ chemin, code, valeur }`) ; le reste de la charte reste utilisable ;
 *  - les noms libres (jetons, rampes) sont limités à `[A-Za-z0-9_-]` et ne peuvent pas être `__proto__`, `constructor` ni `prototype`.
 * La sortie ne contient que des chaînes, des nombres et des objets simples : elle se sérialise sans perte.
 *
 * Le schéma JSON équivalent est `charte.schema.json` (testé contre les exemples et contre ce module).
 */
import { analyserCouleur, normaliserCouleur } from './couleurs.js';

export const VERSION_CHARTE = 'atlas-charte/0.1';
export const NOMMEES = Object.freeze(['atlas', 'contraste-eleve']);
export const ETATS = Object.freeze(['succes', 'alerte', 'erreur', 'information']);
export const FORMES = Object.freeze(['cercle', 'carre', 'losange', 'triangle']);
export const MODES_FOND = Object.freeze(['atlas', 'voile', 'plan', 'plan-ign', 'photo', 'uni']);
export const TYPES_PALETTE = Object.freeze(['qualitative', 'sequential', 'divergent']);
export const JETONS_PLAN = Object.freeze(['fond', 'vert', 'eau', 'bati', 'route', 'filet', 'texte', 'texte2', 'halo', 'limite', 'info']);
export const INTENSITES_PLAN = Object.freeze(['vert', 'bati', 'eau', 'filet', 'limite']);
export const GRAINES = Object.freeze(['principal', 'secondaire', 'encre', 'fond', ...ETATS]);

/** Familles de police : une liste SÛRE de piles système. Aucune police distante, aucune pile libre. */
export const FAMILLES_POLICE = Object.freeze({
  systeme: 'system-ui, sans-serif',
  sans: 'Arial, Helvetica, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, Consolas, "Courier New", monospace',
  lisible: 'Verdana, Tahoma, sans-serif',
});

export const LIMITES = Object.freeze({
  nom: 60, valeurAffichee: 80, nomLibre: 40, jetons: 64, sequentielles: 16, couleursParListe: 24, divergente: 25, palettes: 32, usages: 8, usage: 60,
  // taille d'un message `setTheme` : borne sur l'ARBRE reçu, avant tout traitement (voir `verifierTaille`)
  noeuds: 4000, profondeur: 10, chaine: 2048, liste: 1000, cles: 200,
});

const NOM_LIBRE = /^[A-Za-z0-9_-]{1,40}$/;
const RESERVES = new Set(['__proto__', 'constructor', 'prototype']);
const ID_PALETTE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const nomValide = (n) => NOM_LIBRE.test(n) && !RESERVES.has(n);

/** Une valeur reçue, abrégée et sans caractère de contrôle, pour un compte rendu : jamais la valeur brute. */
export function valeurAffichee(v) {
  if (typeof v === 'string') return v.slice(0, LIMITES.valeurAffichee).replace(/[\u0000-\u001f\u007f-\u009f]/g, '?');
  if (v === null || v === undefined || typeof v === 'number' || typeof v === 'boolean') return String(v);
  return Array.isArray(v) ? '[liste de ' + v.length + ']' : '[objet]';
}

/**
 * Borne la taille de l'arbre reçu, sans le sérialiser (un graphe circulaire ne le fait pas échouer). Renvoie un message d'erreur ou null.
 * Les graphes issus de `postMessage` peuvent contenir des cycles : la profondeur est donc bornée explicitement.
 */
export function verifierTaille(valeur, l = LIMITES) {
  let noeuds = 0; const pile = [[valeur, 0]];
  while (pile.length) {
    const [v, d] = pile.pop();
    if (++noeuds > l.noeuds) return 'charte trop volumineuse (plus de ' + l.noeuds + ' éléments)';
    if (typeof v === 'string') { if (v.length > l.chaine) return 'chaîne trop longue (' + l.chaine + ' caractères au plus)'; continue; }
    if (v === null || typeof v !== 'object') continue;
    if (d >= l.profondeur) return 'charte trop profonde (' + l.profondeur + ' niveaux au plus)';
    if (Array.isArray(v)) { if (v.length > l.liste) return 'liste trop longue (' + l.liste + ' éléments au plus)'; for (const x of v) pile.push([x, d + 1]); continue; }
    const cles = Object.keys(v); if (cles.length > l.cles) return 'objet trop large (' + l.cles + ' clés au plus)';
    for (const k of cles) pile.push([v[k], d + 1]);
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------- règles
/**
 * Contexte d'un assainissement : accumule les valeurs ignorées. `ignorer` renvoie toujours `undefined`, ce qui permet `return ctx.ignorer(...)`.
 */
function contexte() {
  const ignore = [];
  return { ignore, ignorer(chemin, code, valeur) { ignore.push({ chemin, code, valeur: valeurAffichee(valeur) }); return undefined; } };
}

const regles = {
  couleur(v, ch, c) { const a = analyserCouleur(v); if (!a) return c.ignorer(ch, 'couleur-invalide', v); if (a.alpha < 1) return c.ignorer(ch, 'alpha-non-admis', v); return a.hex; },
  couleurAlpha(v, ch, c) { const n = normaliserCouleur(v); return n === null ? c.ignorer(ch, 'couleur-invalide', v) : n; },
  texte(v, ch, c, r) { if (typeof v !== 'string') return c.ignorer(ch, 'type', v); const s = v.trim().replace(/[\u0000-\u001f\u007f-\u009f<>]/g, ''); return s ? s.slice(0, r.max) : c.ignorer(ch, 'vide', v); },
  nombre(v, ch, c, r) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return c.ignorer(ch, 'type', v);
    if (v < r.min || v > r.max) return c.ignorer(ch, 'hors-bornes', v);
    if (r.entier && !Number.isInteger(v)) return c.ignorer(ch, 'entier-attendu', v);
    return v;
  },
  enum(v, ch, c, r) { return typeof v === 'string' && r.valeurs.includes(v) ? v : c.ignorer(ch, 'valeur-inconnue', v); },
  nomLibre(v, ch, c) { return typeof v === 'string' && nomValide(v) ? v : c.ignorer(ch, 'nom-invalide', v); },
  version(v, ch, c) { return typeof v === 'string' && /^atlas-charte\/\d{1,3}\.\d{1,3}$/.test(v) ? v : c.ignorer(ch, 'version-invalide', v); },
  vegetation(v, ch, c) { return v === 'monochrome' ? v : regles.couleur(v, ch, c); },
  /** Liste de couleurs OPAQUES : une seule couleur invalide, ou une taille hors bornes, fait ignorer la liste entière (le nombre de classes serait faussé). */
  liste(v, ch, c, r) {
    if (!Array.isArray(v)) return c.ignorer(ch, 'type', v);
    if (v.length < r.min || v.length > r.max) return c.ignorer(ch, 'taille', v);
    const sortie = [];
    for (let i = 0; i < v.length; i++) { const x = regles.couleur(v[i], ch + '[' + i + ']', c); if (x === undefined) return undefined; sortie.push(x); }
    return sortie;
  },
  objet(v, ch, c, r) {
    if (!estObjet(v)) return c.ignorer(ch, 'type', v);
    const sortie = {};
    for (const k of Object.keys(v)) {
      const regle = Object.prototype.hasOwnProperty.call(r.cles, k) ? r.cles[k] : null; const chemin = ch ? ch + '.' + k : k;
      if (!regle) { c.ignorer(chemin, 'cle-inconnue', k); continue; }
      const x = appliquer(regle, v[k], chemin, c); if (x !== undefined) sortie[k] = x;
    }
    return Object.keys(sortie).length ? sortie : undefined;
  },
  dict(v, ch, c, r) {
    if (!estObjet(v)) return c.ignorer(ch, 'type', v);
    const cles = Object.keys(v); if (cles.length > r.max) return c.ignorer(ch, 'taille', '[objet de ' + cles.length + ' clés]');
    const sortie = {};
    for (const k of cles) {
      const chemin = ch + '.' + k; if (!nomValide(k)) { c.ignorer(chemin, 'nom-invalide', k); continue; }
      const x = appliquer(r.valeur, v[k], chemin, c); if (x !== undefined) sortie[k] = x;
    }
    return Object.keys(sortie).length ? sortie : undefined;
  },
  palettes(v, ch, c) {
    if (!Array.isArray(v)) return c.ignorer(ch, 'type', v);
    if (v.length > LIMITES.palettes) return c.ignorer(ch, 'taille', v);
    const sortie = [], vus = new Set();
    for (let i = 0; i < v.length; i++) {
      const p = assainirPalette(v[i], ch + '[' + i + ']', c);
      if (!p) continue; if (vus.has(p.id)) { c.ignorer(ch + '[' + i + '].id', 'doublon', p.id); continue; }
      vus.add(p.id); sortie.push(p);
    }
    return sortie.length ? sortie : undefined;
  },
};
function appliquer(regle, v, chemin, c) { return regles[regle.t](v, chemin, c, regle); }

const R = {
  couleur: { t: 'couleur' }, couleurAlpha: { t: 'couleurAlpha' },
  liste: (min, max) => ({ t: 'liste', min, max }),
  nombre: (min, max, entier = false) => ({ t: 'nombre', min, max, entier }),
};
const cles = (o) => ({ t: 'objet', cles: o });
const parCle = (noms, regle) => Object.fromEntries(noms.map((n) => [n, regle]));

/** Table des règles de la charte : le seul endroit qui dit ce qu'une charte peut contenir. */
export const REGLES = Object.freeze({
  t: 'objet', cles: {
    version: { t: 'version' },
    nom: { t: 'texte', max: LIMITES.nom },
    base: { t: 'enum', valeurs: NOMMEES },
    graines: cles(parCle(GRAINES, R.couleur)),
    jetons: { t: 'dict', max: LIMITES.jetons, valeur: R.couleurAlpha },
    donnees: cles({
      sequentielles: { t: 'dict', max: LIMITES.sequentielles, valeur: R.liste(2, LIMITES.couleursParListe) },
      sequentielleDefaut: { t: 'nomLibre' },
      divergente: R.liste(3, LIMITES.divergente),
      qualitative: R.liste(2, LIMITES.couleursParListe),
      sansDonnee: R.couleur, selection: R.couleur, halo: R.couleur, survol: R.couleurAlpha, contour: R.couleurAlpha,
    }),
    fond: cles({
      mode: { t: 'enum', valeurs: MODES_FOND },
      principal: R.couleur,
      intensites: cles(parCle(INTENSITES_PLAN, R.nombre(0, 1))),
      vegetation: { t: 'vegetation' },
      lavis: cles({ couleur: R.couleur, opacite: R.nombre(0, 1) }),
      plan: cles(parCle(JETONS_PLAN, R.couleur)),
    }),
    marqueurs: cles({ formes: cles(parCle(ETATS, { t: 'enum', valeurs: FORMES })), contour: R.couleur }),
    texte: cles({ famille: { t: 'enum', valeurs: Object.keys(FAMILLES_POLICE) }, tailles: cles({ legende: R.nombre(8, 32), etiquette: R.nombre(8, 32) }) }),
    exigences: cles({ contrasteMinimal: R.nombre(1, 21), contrasteTexte: R.nombre(1, 21), ecartMinimal: R.nombre(0, 60), classesMax: R.nombre(2, 12, true) }),
    palettes: { t: 'palettes' },
  },
});

/**
 * Une palette PAR VALEUR : `{ id, nom, type, couleurs, usages? }`. Une palette personnalisée n'est jamais stockée par simple référence :
 * un projet ou un manifeste qui la cite en emporte les couleurs.
 * @returns {object|undefined} la palette assainie, ou undefined (la cause est dans `c.ignore`)
 */
export function assainirPalette(brut, chemin = 'palette', c = contexte()) {
  if (!estObjet(brut)) return c.ignorer(chemin, 'type', brut);
  const id = typeof brut.id === 'string' && ID_PALETTE.test(brut.id) && !RESERVES.has(brut.id) ? brut.id : c.ignorer(chemin + '.id', 'id-invalide', brut.id);
  const type = regles.enum(brut.type, chemin + '.type', c, { valeurs: TYPES_PALETTE });
  const min = type === 'divergent' ? 3 : 2, max = type === 'divergent' ? LIMITES.divergente : LIMITES.couleursParListe;
  const couleurs = regles.liste(brut.couleurs, chemin + '.couleurs', c, { min, max });
  if (id === undefined || type === undefined || couleurs === undefined) return undefined;
  const sortie = { id, nom: brut.nom === undefined ? id : (regles.texte(brut.nom, chemin + '.nom', c, { max: LIMITES.nom }) || id), type, couleurs };
  if (brut.usages !== undefined) {
    if (!Array.isArray(brut.usages) || brut.usages.length > LIMITES.usages) c.ignorer(chemin + '.usages', 'taille', brut.usages);
    else { const u = brut.usages.map((x, i) => regles.texte(x, chemin + '.usages[' + i + ']', c, { max: LIMITES.usage })).filter((x) => x !== undefined); if (u.length) sortie.usages = u; }
  }
  return sortie;
}

/**
 * Assainit une charte reçue.
 * @param {*} brut  n'importe quoi : seule une charte plausible (objet simple) est lue
 * @returns {{charte: object, ignore: {chemin:string, code:string, valeur:string}[]}}
 *   `charte` ne contient que des valeurs valides et normalisées (couleurs en minuscules) ; `ignore` liste ce qui a été écarté et pourquoi.
 */
export function assainir(brut) {
  const c = contexte();
  const e = verifierTaille(brut); if (e) { c.ignorer('', 'taille', e); return { charte: {}, ignore: c.ignore }; }
  if (!estObjet(brut)) { c.ignorer('', 'type', brut); return { charte: {}, ignore: c.ignore }; }
  const charte = regles.objet(brut, '', c, REGLES) || {};
  return { charte, ignore: c.ignore };
}

/** Vrai si la valeur est une charte telle que ce module l'accepte, sans rien écarter. */
export function valider(brut) { const { charte, ignore } = assainir(brut); return { ok: ignore.length === 0, erreurs: ignore, charte }; }

/** La version d'une charte est lisible par ce module : même majeure et même mineure. */
export function versionCompatible(version) { return version === undefined || version === VERSION_CHARTE; }

/**
 * Jetons de fond passés à `setFond(mode, jetons)` : `principal` et `fondUni` (couleurs), plus les jetons du plan (`JETONS_PLAN`).
 * Ce qui n'est pas une couleur admise est ignoré et signalé ; une clé inconnue aussi.
 */
export function assainirJetonsFond(brut) {
  const c = contexte(); const sortie = {};
  if (brut === undefined || brut === null) return { jetons: sortie, ignore: c.ignore };
  const e = verifierTaille(brut); if (e) { c.ignorer('', 'taille', e); return { jetons: sortie, ignore: c.ignore }; }
  if (!estObjet(brut)) { c.ignorer('', 'type', brut); return { jetons: sortie, ignore: c.ignore }; }
  for (const k of Object.keys(brut)) {
    if (k === 'principal' || k === 'fondUni' || JETONS_PLAN.includes(k)) { const x = regles.couleur(brut[k], k, c); if (x !== undefined) sortie[k] = x; }
    else c.ignorer(k, 'cle-inconnue', k);
  }
  return { jetons: sortie, ignore: c.ignore };
}

/** Pile de police pour une famille de la liste sûre (repli : système). */
export const pilePolice = (famille) => FAMILLES_POLICE[famille] || FAMILLES_POLICE.systeme;

/** Chemins des feuilles d'une charte (« graines.principal », « donnees.sequentielles.nom », « jetons.nom »), sans la version : ce qu'un niveau a fourni. */
export function cheminsDe(charte) {
  const sortie = [];
  const aller = (v, ch) => { if (estObjet(v)) { for (const k of Object.keys(v)) aller(v[k], ch ? ch + '.' + k : k); } else if (ch) sortie.push(ch); };
  aller(charte, '');
  return sortie.filter((x) => x !== 'version');
}

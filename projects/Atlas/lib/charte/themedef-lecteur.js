/**
 * Le lecteur de ThemeDef 1.0 d'Atlas : lit la table `Theme_document`, choisit la ligne active et résout le document pour un mode, SANS recompiler.
 * Module pur : ni DOM, ni réseau, ni lecture de table (l'hôte donne le contenu).
 *
 * Règle de référence : docs/THEMEDEF-SPEC.md §5 de Form Builder (arbitrage du 01/11/2026), « un même document donne le même résultat dans tous les widgets ». Les
 * 142 vecteurs de lecture du kit (`tests/fixtures/themedef-lecteur.vecteurs.json`) sont le contrat, rejoués par `tests/themedef-lecteur-vecteurs.test.js` avec la liste
 * EXACTE des écarts voulus. Le noyau (formes, 22 paires, seuils, mesure, refus) suit le lecteur de Form Builder ; ce qui reste propre à Atlas : sans valeurs résolues, ce
 * sont les graines du document qui sont données à la charte (Atlas calcule le reste), et la traduction vers la charte (`depuis-kit.js`).
 *
 * Un document est une donnée NON FIABLE : taille en octets, profondeur, clés interdites, valeurs écrites dans une syntaxe connue (jamais `url()`, `calc()`, `var()` avec repli).
 */
export const VERSION = '1.0.0';
export const VERSION_THEMEDEF = 'themedef-1.0';
export const TABLE = 'Theme_document';
export const TAILLE_MAX = 16384;
export const PROFONDEUR_MAX = 6;
export const LIGNES_MAX = 50;
const CLE_LIGNE = /^[a-z][a-z0-9-]{0,39}$/;
const HEX6 = /^#[0-9a-fA-F]{6}$/;

/** Les 26 variables du contrat `kit-theme/0.1`, sans le préfixe `--kit-`. */
export const CLES = Object.freeze(['fond', 'surface', 'surface-2', 'texte', 'texte-2', 'bord', 'bord-champ', 'accent', 'accent-texte', 'accent-fond',
  'action', 'action-texte', 'action-survol', 'action-actif', 'focus', 'ok', 'ok-fond', 'attention', 'attention-fond', 'attention-filet',
  'alerte', 'alerte-fond', 'info', 'info-fond', 'papier', 'ombre']);

const propre = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const objetSimple = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function lire(doc, chemin) {
  let c = doc;
  for (const k of chemin) { if (!c || typeof c !== 'object' || !propre(c, k)) return undefined; c = c[k]; }
  return c;
}
const octets = (t) => { try { return new TextEncoder().encode(t).length; } catch (e) { return t.length; } };

// ── Les valeurs admises (contrat kit-theme/0.1) ─────────────────────────────

const LONGUEUR_VALEUR_MAX = 48;
const MOTIF_VALEUR = new RegExp('^(?:#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})'
  + '|(?:rgb|rgba|hsl|hsla)\\(\\s*[0-9.%]{1,8}(?:\\s*[ ,/]\\s*[0-9.%]{1,8}){2,3}\\s*\\)'
  + '|var\\(--[A-Za-z_][A-Za-z0-9_-]{0,63}\\))$');

/** Une valeur admise : couleur en syntaxe connue, ou `var(--nom)` sans repli. */
export function valeurSure(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  return !!s && s.length <= LONGUEUR_VALEUR_MAX && MOTIF_VALEUR.test(s);
}

/** Le nom court d'une variable du contrat (`accent` ou `--kit-accent`), ou null. */
export function nomDe(cle) {
  let k = String(cle);
  if (k.indexOf('--kit-') === 0) k = k.slice(6);
  return CLES.includes(k) ? k : null;
}

/**
 * Juge un objet { variable: valeur } : ce qui est retenu, sous les noms courts. Une valeur avec des espaces autour est refusée (l'étage A les écrit sans) ; une clé inconnue, une valeur vide
 * ou illisible est écartée ; la première de deux écritures d'une même variable l'emporte.
 */
export function juger(vars) {
  const sortie = {};
  if (!objetSimple(vars)) return sortie;
  for (const cle of Object.keys(vars).slice(0, 200)) {
    const brut = vars[cle], nom = nomDe(cle);
    if (!nom || brut === null || brut === undefined || brut === '') continue;
    if (typeof brut === 'string' && brut !== brut.trim()) continue;
    if (!valeurSure(brut) || propre(sortie, nom)) continue;
    sortie[nom] = String(brut).trim();
  }
  return sortie;
}

// ── Lire un document ────────────────────────────────────────────────────────

/** Forme d'un document : chaque valeur compte un niveau (feuilles comprises), six au plus ; `__proto__`, `constructor`, `prototype` refusés où qu'ils soient. */
function defautDeForme(v, niveau) {
  if (niveau > PROFONDEUR_MAX) return 'profondeur';
  if (v === null || typeof v !== 'object') return null;
  for (const k of Object.keys(v)) {
    if (!Array.isArray(v) && (k === '__proto__' || k === 'constructor' || k === 'prototype')) return 'cle-interdite';
    const d = defautDeForme(v[k], niveau + 1);
    if (d) return d;
  }
  return null;
}

/**
 * Un ThemeDef lu comme une donnée non fiable. Refus (le document n'applique rien) : `trop-gros` (16 Ko en octets), `json`, `type`, `profondeur`, `cle-interdite`, `version`, `section`
 * (graines, modes, surcharges ou exigences qui n'est pas un objet), `principal` (absent ou pas #RRGGBB), `sombre` (hors liste), `explicite-incomplet` (sombre explicite sans ses 26 valeurs),
 * `exigence` (un seuil plus lâche que 4,5 ou 3).
 * @returns {{ok: boolean, themedef?: object, erreur?: string}}
 */
export function lireThemeDef(contenu) {
  let td = contenu;
  if (typeof contenu === 'string') {
    if (octets(contenu) > TAILLE_MAX) return { ok: false, erreur: 'trop-gros' };
    try { td = JSON.parse(contenu); } catch (e) { return { ok: false, erreur: 'json' }; }
  }
  if (!td || typeof td !== 'object' || Array.isArray(td)) return { ok: false, erreur: 'type' };
  let texte;
  try { texte = JSON.stringify(td); } catch (e) { return { ok: false, erreur: 'json' }; }
  if (octets(texte) > TAILLE_MAX) return { ok: false, erreur: 'trop-gros' };
  const defaut = defautDeForme(td, 1);
  if (defaut) return { ok: false, erreur: defaut };
  if (td.version !== VERSION_THEMEDEF) return { ok: false, erreur: 'version' };
  for (const s of ['graines', 'modes', 'surcharges', 'exigences']) if (propre(td, s) && !objetSimple(td[s])) return { ok: false, erreur: 'section' };
  const principal = lire(td, ['graines', 'principal']);
  if (typeof principal !== 'string' || !HEX6.test(principal)) return { ok: false, erreur: 'principal' };
  const jeux = td.surcharges || {};
  for (const m of ['clair', 'sombre']) if (propre(jeux, m) && !objetSimple(jeux[m])) return { ok: false, erreur: 'section' };
  const sombre = lire(td, ['modes', 'sombre']);
  if (sombre !== undefined && !['aucun', 'derive', 'explicite'].includes(sombre)) return { ok: false, erreur: 'sombre' };
  if (sombre === 'explicite') {
    const s = lire(td, ['surcharges', 'sombre']);
    if (!(objetSimple(s) && Object.keys(juger(s)).length === CLES.length)) return { ok: false, erreur: 'explicite-incomplet' };
  }
  const ex = td.exigences || {};
  if (propre(ex, 'contrasteTexte') && !(typeof ex.contrasteTexte === 'number' && ex.contrasteTexte >= 4.5)) return { ok: false, erreur: 'exigence' };
  if (propre(ex, 'contrasteComposant') && !(typeof ex.contrasteComposant === 'number' && ex.contrasteComposant >= 3)) return { ok: false, erreur: 'exigence' };
  return { ok: true, themedef: td };
}

/** La table en colonnes (`fetchTable`) ou déjà en lignes, rendue en lignes. Une colonne qui n'est pas un tableau est ignorée ; la table a la longueur de la plus longue des colonnes lues. */
export function lignesDeTable(contenu) {
  if (Array.isArray(contenu)) return contenu.filter((l) => l && typeof l === 'object').slice(0, LIGNES_MAX + 1);
  if (!objetSimple(contenu)) return [];
  const noms = Object.keys(contenu).filter((k) => Array.isArray(contenu[k]) && !k.startsWith('_') && !k.startsWith('manual'));
  let n = 0;
  for (const k of ['id', 'cle', 'themedef', 'actif']) if (Array.isArray(contenu[k]) && contenu[k].length > n) n = contenu[k].length;
  return Array.from({ length: Math.min(n, LIGNES_MAX + 1) }, (_, i) => Object.fromEntries(noms.map((k) => [k, contenu[k][i]])));
}

/** La ligne active : au plus UNE, `actif` strictement vrai, clé conforme. Plusieurs : rien n'est appliqué et `plusieurs-actifs` est dit. Aucune : rien, sans bruit. */
export function choisirActif(lignes) {
  const toutes = Array.isArray(lignes) ? lignes : [];
  const avertissements = [];
  if (toutes.length > LIGNES_MAX) avertissements.push({ code: 'lignes-ignorees', nombre: toutes.length - LIGNES_MAX });
  const actifs = toutes.slice(0, LIGNES_MAX).filter((l) => l && l.actif === true && typeof l.cle === 'string' && CLE_LIGNE.test(l.cle));
  if (actifs.length > 1) { avertissements.push({ code: 'plusieurs-actifs', nombre: actifs.length }); return { ligne: null, avertissements }; }
  return { ligne: actifs[0] || null, avertissements };
}

// ── Mesurer ─────────────────────────────────────────────────────────────────

/** Les 22 paires que le kit mesure sur un `resolu` : [premier plan, arrière-plan]. `bord` est décoratif : dans aucune paire. */
export const PAIRES = Object.freeze([
  ['texte', 'fond'], ['texte', 'surface'], ['texte-2', 'fond'], ['texte-2', 'surface'], ['accent', 'fond'], ['accent', 'surface'],
  ['accent-texte', 'accent'], ['action-texte', 'action'], ['action-texte', 'action-survol'], ['action-texte', 'action-actif'],
  ['bord-champ', 'surface'], ['focus', 'fond'], ['focus', 'surface'],
  ['ok', 'ok-fond'], ['ok', 'surface'], ['attention', 'attention-fond'], ['attention', 'surface'],
  ['alerte', 'alerte-fond'], ['alerte', 'surface'], ['info', 'info-fond'], ['info', 'surface'],
  ['attention-filet', 'surface'],
]);
const PREMIERS_PLANS_COMPOSANT = ['bord-champ', 'focus', 'attention-filet'];

/** Les seuils d'un document : ses exigences renforcent chaque famille (4,5 texte, 3 composants), jamais elles ne la relâchent. */
export function seuilsDe(td) {
  const e = objetSimple(lire(td, ['exigences'])) ? td.exigences : {};
  return {
    texte: typeof e.contrasteTexte === 'number' && e.contrasteTexte > 4.5 ? e.contrasteTexte : 4.5,
    composant: typeof e.contrasteComposant === 'number' && e.contrasteComposant > 3 ? e.contrasteComposant : 3,
  };
}

const MOTIF_HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const MOTIF_FONCTION = /^(rgb|hsl)\(\s*([^)]*?)\s*\)$/;
const MOTIF_NOMBRE = /^[0-9]+(?:\.[0-9]+)?%?$/;
function depuisHsl(h, sat, lum) {
  const a = sat * Math.min(lum, 1 - lum), k = (n) => (n + h / 30) % 12;
  return [0, 8, 4].map((n) => Math.round((lum - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))) * 255));
}

/** [r, g, b] d'une couleur OPAQUE, comme le lecteur du kit la mesure (#RGB, #RRGGBB, rgb() ou hsl() à trois nombres) ; null pour le reste : une valeur qu'on ne sait pas mesurer ne fait jamais échouer une paire. */
export function rvb(valeur) {
  if (typeof valeur !== 'string') return null;
  const h = MOTIF_HEX.exec(valeur);
  if (h) {
    const six = h[1].length === 3 ? h[1].split('').map((c) => c + c).join('') : h[1];
    return [0, 2, 4].map((i) => parseInt(six.slice(i, i + 2), 16));
  }
  const f = MOTIF_FONCTION.exec(valeur);
  if (!f) return null;
  const t = f[2].split(/[\s,]+/);
  if (t.length !== 3 || !t.every((x) => MOTIF_NOMBRE.test(x))) return null;
  const n = t.map(parseFloat);
  if (f[1] === 'rgb') return t.map((x, i) => Math.min(255, Math.round(x.endsWith('%') ? n[i] * 2.55 : n[i])));
  return depuisHsl(n[0], Math.min(1, n[1] / 100), Math.min(1, n[2] / 100));
}

export function contrasteRvb(a, b) {
  const lum = (c) => { const l = c.map((v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Mesure les 22 paires sur des valeurs courtes. Rend les paires qui échouent, avec la mesure TRONQUÉE à deux décimales. */
export function mesurerPaires(valeurs, seuils) {
  const echecs = [];
  for (const [p, q] of PAIRES) {
    const a = rvb(valeurs[p]), b = rvb(valeurs[q]);
    if (!a || !b) continue;
    const seuil = PREMIERS_PLANS_COMPOSANT.includes(p) ? seuils.composant : seuils.texte;
    const c = contrasteRvb(a, b);
    if (c < seuil) echecs.push({ paire: p + '-sur-' + q, mesure: Math.floor(c * 100) / 100, seuil });
  }
  return echecs;
}

// ── Résoudre ────────────────────────────────────────────────────────────────

/**
 * Un ThemeDef résolu pour un mode, SANS recompiler : les valeurs mesurées de `resolu` s'appliquent quand elles y sont (sans être crues : `verifie: false`).
 * Un `resolu` doit être COMPLET (les 26 valeurs, toutes lisibles) et tenir les 22 paires, avant ET après les surcharges du mode ; sinon le thème est refusé EN ENTIER (jamais d'application
 * partielle, jamais de retour sur les graines : un document incohérent n'est pas réparé en silence). Une surcharge refusée est ignorée sans effacer la valeur qu'elle visait.
 * Sans `resolu` (ou en sombre « explicite », où les surcharges font la base), `source` vaut `graines` et `vars` reste vide : Atlas donne alors les graines du document à sa charte.
 * @returns {{mode: 'clair'|'sombre', source: 'resolu'|'graines', vars: Object<string,string>, surcharges: Object<string,string>, refus: {code: string, echecs: object[], chemin: string}|null}}
 */
export function resoudre(td, mode) {
  const dispo = lire(td, ['modes', 'sombre']) === 'aucun' ? ['clair'] : ['clair', 'sombre'];
  const m = mode === 'sombre' && dispo.includes('sombre') ? 'sombre' : 'clair';
  const explicite = m === 'sombre' && lire(td, ['modes', 'sombre']) === 'explicite';
  const mesure = explicite ? null : lire(td, ['resolu', 'modes', m, 'valeurs']);
  const chemin = '/resolu/modes/' + m + '/valeurs';
  const seuils = seuilsDe(td);
  const refus = (code, echecs) => ({ mode: m, source: 'resolu', vars: {}, surcharges: {}, refus: { code, echecs: echecs || [], chemin } });
  const sur = lire(td, ['surcharges', m]);
  // les surcharges du mode, sous-ensemble des 26 clés ; une valeur refusée est ignorée
  const surcharges = {};
  if (objetSimple(sur)) for (const k of Object.keys(sur)) { const nom = nomDe(k); if (nom && Object.keys(juger({ [nom]: sur[k] })).length === 1) surcharges[nom] = sur[k]; }
  if (objetSimple(mesure)) {
    const brut = { ...mesure };
    if (Object.keys(juger({ ...brut })).length < CLES.length) return refus('resolu-incomplet');
    const avant = mesurerPaires(brut, seuils);
    if (avant.length) return refus('contraste-insuffisant', avant);
    const final = juger({ ...brut, ...surcharges });
    const apres = mesurerPaires(final, seuils);
    if (apres.length) return refus('contraste-insuffisant', apres);
    return { mode: m, source: 'resolu', vars: final, surcharges, refus: null };
  }
  return { mode: m, source: 'graines', vars: {}, surcharges, refus: null };
}

/**
 * La lecture complète d'une table : colonnes ou lignes -> ligne active -> document -> résolution. `raison` : `applique`, `aucun-actif`, `plusieurs-actifs`, `version-inconnue` (colonne `version`
 * de la ligne), `invalide` (le document est refusé, `avertissements[0].detail` dit pourquoi), `sans-mode-sombre`, `contraste-insuffisant`, `resolu-incomplet`.
 * @returns {{ applique: boolean, raison: string, ligne: string|null, mode: string|null, source: string|null, vars: Object<string,string>, themedef: object|null, avertissements: object[] }}
 */
export function lireTable(contenu, { mode = 'clair' } = {}) {
  const sortie = (raison, extra = {}) => ({ applique: false, raison, ligne: null, mode: null, source: null, vars: {}, themedef: null, avertissements: [], ...extra });
  const choix = choisirActif(lignesDeTable(contenu));
  if (!choix.ligne) return sortie(choix.avertissements.some((a) => a.code === 'plusieurs-actifs') ? 'plusieurs-actifs' : 'aucun-actif', { avertissements: choix.avertissements });
  const ligne = String(choix.ligne.cle);
  const vc = choix.ligne.version;
  if (vc !== undefined && vc !== null && vc !== '' && vc !== VERSION_THEMEDEF) return sortie('version-inconnue', { ligne, avertissements: [{ code: 'version-inconnue', chemin: '/ligne/version' }] });
  const lu = lireThemeDef(choix.ligne.themedef);
  if (!lu.ok) return sortie('invalide', { ligne, avertissements: [{ code: 'themedef-invalide', detail: lu.erreur }] });
  const voulu = mode === 'sombre' ? 'sombre' : 'clair';
  if (voulu === 'sombre' && lire(lu.themedef, ['modes', 'sombre']) === 'aucun') return sortie('sans-mode-sombre', { ligne, themedef: lu.themedef });
  const r = resoudre(lu.themedef, voulu);
  if (r.refus) {
    const avertissements = r.refus.echecs.length ? r.refus.echecs.map((e) => ({ code: r.refus.code, chemin: r.refus.chemin, paire: e.paire, mesure: e.mesure, seuil: e.seuil })) : [{ code: r.refus.code, chemin: r.refus.chemin }];
    return sortie(r.refus.code, { ligne, mode: r.mode, source: r.source, avertissements, themedef: lu.themedef });
  }
  return { applique: true, raison: 'applique', ligne, mode: r.mode, source: r.source, vars: r.vars, surcharges: r.surcharges, themedef: lu.themedef, avertissements: choix.avertissements };
}

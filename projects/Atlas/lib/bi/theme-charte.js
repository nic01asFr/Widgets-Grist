/**
 * Thème du composant BI = la charte résolue (lib/charte/). Module pur : aucun accès à la carte.
 *
 * Le gestionnaire garde la charte de l'HÔTE accumulée (chaque `setTheme` s'ajoute aux précédents, comme avant), la résout avec les défauts
 * d'Atlas, la préférence d'accessibilité de la personne et les surcharges de couche, et fabrique le THÈME D'EXÉCUTION que le runtime lit
 * (`jetons`, `categories`, `sequentielle`, `divergente`, `selection`, `contour`, `plan`… : les clés du contrat 0.3, donc inchangées pour le reste
 * du composant).
 *
 * Deux formes d'entrée sont acceptées par `appliquer` : une charte (`version: 'atlas-charte/0.1'`, voir docs/CONTRAT-CHARTE-ATLAS.md) et un
 * thème du contrat 0.3, converti par `depuisThemeAncien`.
 */
import { resoudre, jetonsDe, fusionner, avertissementIgnore } from '../charte/resolution.js';
import { assainir, pilePolice, cheminsDe, VERSION_CHARTE } from '../charte/schema.js';
import { estCharte, depuisThemeAncien } from '../charte/compat.js';

export const VERSION = '1.0.0';

const copie = (o) => JSON.parse(JSON.stringify(o));

/** Le thème d'exécution lu par le runtime, depuis une charte RÉSOLUE. */
export function themeRuntime(charte) {
  const d = charte.donnees, p = charte.fond.plan;
  return {
    jetons: jetonsDe(charte),
    categories: [...d.qualitative],
    sequentielle: [...d.sequentielles[d.sequentielleDefaut]],
    sequentielles: copie(d.sequentielles),
    divergente: [...d.divergente],
    selection: d.selection, survol: d.survol, contour: d.contour, halo: d.halo, sansDonnee: d.sansDonnee,
    lavis: charte.fond.lavis ? { couleur: charte.fond.lavis.couleur, opacite: charte.fond.lavis.opacite } : null,
    plan: { ...p }, fondCarte: p.fond,
    texte: charte.graines.encre, police: pilePolice(charte.texte.famille), tailles: { ...charte.texte.tailles },
    marqueurs: copie(charte.marqueurs), exigences: { ...charte.exigences }, fondSouhaite: charte.fond.mode,
    policeSymboles: null,
  };
}

/** La préférence de contraste élevé de la personne, lue dans le navigateur (`prefers-contrast: more`) ; false hors navigateur. */
export function preferencesDepuisFenetre(fenetre = globalThis.window) {
  try { return { contrasteEleve: !!(fenetre && fenetre.matchMedia && fenetre.matchMedia('(prefers-contrast: more)').matches) }; } catch (e) { return { contrasteEleve: false }; }
}

/** Entrée de `setTheme` -> { charte (assainie), ignore, entree }. */
export function normaliserEntree(entree) {
  if (estCharte(entree)) { const r = assainir(entree); return { charte: r.charte, ignore: r.ignore, entree: 'charte' }; }
  if (entree !== null && typeof entree === 'object' && !Array.isArray(entree)) {
    const a = depuisThemeAncien(entree), r = assainir(a.charte);
    return { charte: r.charte, ignore: [...a.ignore, ...r.ignore], entree: 'theme-0.3' };
  }
  const r = assainir(entree); return { charte: r.charte, ignore: r.ignore, entree: 'inconnue' };
}

/**
 * Gestionnaire de thème d'un composant.
 * @param {{theme?:object, preferences?:{contrasteEleve?:boolean}}} [o]  `theme` : charte ou thème 0.3 initial
 */
export function creerGestionnaire({ theme = null, preferences = {} } = {}) {
  let hote = {}, prefs = { contrasteEleve: !!preferences.contrasteEleve }, courant = null, dernierIgnore = [];
  const calculer = () => { const r = resoudre({ hote, preferences: prefs }); courant = { ...r, theme: themeRuntime(r.charte) }; return courant; };

  const g = {
    /** Le thème d'exécution courant. */
    get theme() { return courant.theme; },
    get charte() { return courant.charte; },
    get preferences() { return { ...prefs }; },
    /**
     * Applique une charte ou un thème 0.3 : s'ajoute à ce que l'hôte a déjà donné, sauf `remplacer`.
     * @returns {{version:string, entree:string, applique:string[], derive:string[], ignore:object[], avertissements:object[], a11y:object}}
     */
    appliquer(entree, { remplacer = false } = {}) {
      const n = normaliserEntree(entree);
      hote = remplacer ? n.charte : fusionner(hote, n.charte); dernierIgnore = n.ignore;
      const r = calculer();
      return {
        version: VERSION_CHARTE, entree: n.entree, applique: cheminsDe(n.charte).filter((c) => r.applique.includes(c)), derive: r.derive, ignore: n.ignore,
        avertissements: [...n.ignore.map(avertissementIgnore), ...r.avertissements], a11y: r.a11y,
      };
    },
    /** Change la préférence de la personne et recalcule. */
    definirPreferences(p) { prefs = { ...prefs, contrasteEleve: !!(p && p.contrasteEleve) }; return calculer(); },
    /** Ce que `getTheme` renvoie : la charte résolue, ce que l'hôte a donné, et les constats. */
    lire() {
      return { version: VERSION_CHARTE, charte: copie(courant.charte), hote: copie(hote), applique: courant.applique, derive: courant.derive, ignore: dernierIgnore, avertissements: [...dernierIgnore.map(avertissementIgnore), ...courant.avertissements], a11y: courant.a11y };
    },
    /** Thème d'exécution d'une couche qui porte sa propre surcharge (`style.charte`), sans mesures. */
    pourCouche(surcharge) { const r = resoudre({ hote, couche: normaliserEntree(surcharge).charte, preferences: prefs, verifier: false }); return themeRuntime(r.charte); },
  };
  if (theme) g.appliquer(theme); else calculer();
  return g;
}

/**
 * Résolution : de quelques niveaux de charte à UNE charte complète, vérifiée. Module pur.
 *
 * Quatre niveaux, du plus faible au plus fort :
 *   1. les défauts d'Atlas (charte « atlas ») ;
 *   2. une charte nommée embarquée (« atlas », « contraste-eleve »), choisie par `base` ;
 *   3. la charte de l'hôte (setTheme, configuration de page, manifeste de scène) ;
 *   4. les surcharges de couche (style déclaratif d'une couche) ;
 * puis la PRÉFÉRENCE d'accessibilité de la personne (contraste élevé), qui l'emporte sur les niveaux 3 et 4 pour le contraste et le
 * daltonisme — et le dit dans le retour (`a11y.preference`).
 *
 * Ce que l'hôte ne donne pas est DÉRIVÉ de ses graines (derivation.js) quand il en a donné de pertinentes, sinon hérité du niveau 2.
 * Exemple : une charte qui ne fixe que `graines.principal` reçoit une séquentielle, une qualitative et un plan calculés depuis cette
 * graine ; sa divergente n'est calculée que si elle donne aussi `graines.secondaire` (sinon la bleu-orange d'Atlas, vérifiée, reste).
 */
import { CHARTES_NOMMEES, CHARTE_PAR_DEFAUT, CHARTE_CONTRASTE_ELEVE, QUALITATIVE_ATLAS } from './defauts.js';
import { assainir, cheminsDe, versionCompatible, GRAINES } from './schema.js';
import { sequentielleDepuis, divergenteEntre, qualitativeDepuis, sansDonneeDepuis, traitsDepuis, planDepuis } from './derivation.js';
import { verifierCharte, avertissement } from './verification.js';

export const VERSION = '1.0.0';

const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const copie = (v) => JSON.parse(JSON.stringify(v));

/** Fusion profonde : les objets se fusionnent clé à clé, tout le reste (listes, valeurs) est remplacé. Ne modifie aucun argument. */
export function fusionner(base, ajout) {
  if (!estObjet(base) || !estObjet(ajout)) return ajout === undefined ? copie(base) : copie(ajout);
  const sortie = copie(base);
  for (const k of Object.keys(ajout)) sortie[k] = estObjet(ajout[k]) && estObjet(sortie[k]) ? fusionner(sortie[k], ajout[k]) : copie(ajout[k]);
  return sortie;
}

// ---------------------------------------------------------------------------------------------------------------- jetons
const JETON = /^jeton:([A-Za-z0-9_-]{1,40})$/;
/** Jetons d'une charte : les graines (`jeton:principal`, `jeton:fond`, `jeton:succes`…) puis les jetons propres de la charte. */
export function jetonsDe(charte) {
  const g = charte.graines || {}, sortie = {};
  for (const n of GRAINES) if (g[n]) sortie[n] = g[n];
  for (const [k, v] of Object.entries(charte.jetons || {})) sortie[k] = v;
  return sortie;
}
/** « jeton:<nom> » -> la couleur du jeton ; une autre valeur est rendue telle quelle ; un jeton inconnu donne `repli`. */
export function resoudreJeton(valeur, jetons, repli = '#808080') {
  if (typeof valeur !== 'string') return valeur;
  const m = JETON.exec(valeur); if (!m) return valeur;
  return Object.prototype.hasOwnProperty.call(jetons, m[1]) ? jetons[m[1]] : repli;
}

// ---------------------------------------------------------------------------------------------------------------- préférence : contraste élevé
/** Ce que la préférence « contraste élevé » reprend à la charte nommée « contraste-eleve », quelle que soit la charte de l'hôte. */
export const CHEMINS_CONTRASTE_ELEVE = Object.freeze([
  'graines.encre', 'graines.fond', 'graines.succes', 'graines.alerte', 'graines.erreur', 'graines.information',
  'donnees', 'marqueurs.contour', 'exigences', 'fond.principal', 'fond.intensites', 'texte.tailles',
]);
const lire = (o, chemin) => chemin.split('.').reduce((x, k) => (x === undefined || x === null ? undefined : x[k]), o);
const ecrire = (o, chemin, valeur) => { const ks = chemin.split('.'); let x = o; for (const k of ks.slice(0, -1)) { if (!estObjet(x[k])) x[k] = {}; x = x[k]; } x[ks[ks.length - 1]] = copie(valeur); };

// ---------------------------------------------------------------------------------------------------------------- conseils sur ce qui a été ignoré
const CONSEIL_IGNORE = {
  'couleur-invalide': 'Écrire la couleur en #rgb, #rrggbb, #rrggbbaa, rgb() ou hsl() ; url(), var(), noms de couleur et HTML ne sont pas admis.',
  'alpha-non-admis': 'Cette couleur doit être opaque : la translucidité se règle par l\'opacité de la couche.',
  'cle-inconnue': 'Clé inconnue de la charte : ignorée.',
  type: 'Type de valeur inattendu : ignoré.', taille: 'Taille hors limites : ignoré.', 'hors-bornes': 'Nombre hors bornes : ignoré.', 'entier-attendu': 'Un entier est attendu.',
  'valeur-inconnue': 'Valeur hors de la liste admise : ignorée.', 'nom-invalide': 'Nom limité à lettres, chiffres, tiret et tiret bas (40 caractères au plus).',
};
const enAvertissement = (i) => avertissement(i.code === 'cle-inconnue' ? 'cle-inconnue' : 'valeur-ignoree', i.code === 'cle-inconnue' ? 'info' : 'attention', i.chemin, i.valeur, i.code === 'cle-inconnue' ? null : { raison: i.code }, CONSEIL_IGNORE[i.code] || 'Valeur invalide : ignorée.');

// ---------------------------------------------------------------------------------------------------------------- résolution
/**
 * Résout une charte complète.
 * @param {{hote?:object, couche?:object, preferences?:{contrasteEleve?:boolean}, verifier?:boolean}} o
 *   `hote` et `couche` sont des chartes PARTIELLES, brutes (elles sont assainies ici) ; `verifier:false` saute les mesures (surcharges de couche).
 * @returns {{charte:object, applique:string[], derive:string[], ignore:object[], avertissements:object[], mesures:object|null, a11y:object}}
 *   `charte` : complète, toutes couleurs en `#rrggbb`, plan calculé ; `applique` : les chemins fournis par l'hôte (et la couche) ;
 *   `derive` : les chemins calculés depuis ses graines ; `ignore` : ce qui a été écarté ; `avertissements` : ignorés, puis mesurés.
 */
export function resoudre({ hote = null, couche = null, preferences = {}, verifier = true } = {}) {
  const ignore = [], pre = [];
  const lireNiveau = (brut) => {
    if (brut === null || brut === undefined) return {};
    const { charte, ignore: ig } = assainir(brut); ignore.push(...ig);
    if (!versionCompatible(charte.version)) { pre.push(avertissement('version-inconnue', 'attention', 'version', charte.version, { lue: charte.version }, 'Cette version de charte n\'est pas lue (attendu atlas-charte/0.1) : le niveau est ignoré.')); return {}; }
    return charte;
  };
  const h = fusionner(lireNiveau(hote), lireNiveau(couche));
  const nommee = h.base && CHARTES_NOMMEES[h.base] ? h.base : CHARTE_PAR_DEFAUT;
  const base = CHARTES_NOMMEES[nommee];
  const fourni = cheminsDe(h);
  const donne = (chemin) => fourni.some((f) => f === chemin || f.startsWith(chemin + '.'));
  const graineDonnee = (...noms) => noms.some((n) => donne('graines.' + n));

  const c = fusionner(base, h); c.version = base.version;
  if (!h.nom) c.nom = base.nom;
  const g = c.graines, derive = []; if (!c.jetons) c.jetons = {};

  // --- dérivation depuis les graines de l'hôte
  const poser = (chemin, valeur, bloc) => { if (valeur === null || valeur === undefined) { pre.push(avertissement('derivation-impossible', 'attention', chemin, null, null, 'Graines trop proches du fond ou de l\'encre pour calculer ' + chemin + ' : valeur de la charte ' + nommee + ' conservée.')); return; } ecrire(c, chemin, valeur); derive.push(bloc || chemin); };
  if (!donne('donnees.sequentielles.principale') && graineDonnee('principal', 'fond', 'encre')) poser('donnees.sequentielles.principale', sequentielleDepuis(g, 9));
  if (!donne('donnees.divergente') && donne('graines.principal') && donne('graines.secondaire')) poser('donnees.divergente', divergenteEntre(g.principal, g.secondaire, g, 3));
  if (!donne('donnees.qualitative') && graineDonnee('principal', 'secondaire')) poser('donnees.qualitative', qualitativeDepuis(g, QUALITATIVE_ATLAS, 8));
  if (graineDonnee('fond', 'encre')) {
    const traits = { sansDonnee: sansDonneeDepuis(g), ...traitsDepuis(g) };
    for (const k of Object.keys(traits)) if (!donne('donnees.' + k)) poser('donnees.' + k, traits[k]);
    if (!donne('marqueurs.contour')) poser('marqueurs.contour', g.encre);
  }
  if (!donne('fond.principal') && graineDonnee('principal')) poser('fond.principal', g.principal);

  // --- préférence de la personne : contraste élevé
  const pref = { contrasteEleve: !!(preferences && preferences.contrasteEleve), appliquee: false, remplace: [] };
  if (pref.contrasteEleve) {
    if (nommee === 'contraste-eleve') pref.raison = 'charte-deja-contrastee';
    else {
      for (const chemin of CHEMINS_CONTRASTE_ELEVE) { const v = lire(CHARTE_CONTRASTE_ELEVE, chemin); if (v !== undefined) { ecrire(c, chemin, v); pref.remplace.push(chemin); } }
      pref.appliquee = true;
      pre.push(avertissement('preference-contraste-elevee', 'info', 'preferences.contrasteEleve', true, { remplace: pref.remplace.length }, 'La préférence de contraste élevé de la personne l\'emporte sur la charte de l\'hôte pour les couleurs de données, d\'encre, de fond et d\'état.'));
    }
  }
  const apresPref = (chemin) => pref.appliquee && CHEMINS_CONTRASTE_ELEVE.some((p) => chemin === p || chemin.startsWith(p + '.'));

  // --- plan de fond : toujours calculé depuis (principal du plan, fond, encre, intensités, végétation), jetons explicites par-dessus
  const planExplicite = pref.appliquee ? {} : (h.fond && h.fond.plan) || {};
  c.fond.plan = planDepuis({ principal: c.fond.principal, fond: c.graines.fond, encre: c.graines.encre, intensites: c.fond.intensites, vegetation: c.fond.vegetation, plan: planExplicite });
  if ((donne('fond') || graineDonnee('principal', 'fond', 'encre') || pref.appliquee) && !derive.includes('fond.plan')) derive.push('fond.plan');

  // --- cohérence : la rampe par défaut existe
  if (!c.donnees.sequentielles[c.donnees.sequentielleDefaut]) {
    pre.push(avertissement('palette-defaut-absente', 'attention', 'donnees.sequentielleDefaut', c.donnees.sequentielleDefaut, { rampes: Object.keys(c.donnees.sequentielles) }, 'La rampe par défaut n\'existe pas : la première rampe est utilisée.'));
    c.donnees.sequentielleDefaut = Object.keys(c.donnees.sequentielles)[0];
  }

  const applique = fourni.filter((f) => !apresPref(f));
  const deriveFinal = derive.filter((d) => !apresPref(d) || d === 'fond.plan');
  const mesure = verifier ? verifierCharte(c) : null;
  const avertissements = [...ignore.map(enAvertissement), ...pre, ...(mesure ? mesure.avertissements : [])];
  return {
    charte: c, applique, derive: deriveFinal, ignore, avertissements, mesures: mesure ? mesure.mesures : null,
    a11y: { preference: pref, ...(mesure ? mesure.a11y : {}) },
  };
}

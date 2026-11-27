/**
 * Le moteur de formulaire de `grist_forms`, charge A LA DEMANDE.
 *
 * ## Avant
 *
 * `index_v7.html` chargeait sept scripts classiques (`types`, `attachments`,
 * `session-context`, `formulaires-table`, `formdef-from-table`,
 * `formdef-from-grist-form`, `runtime/engine`) dans `<head>` : 166 Ko, huit
 * requetes, et sept scripts qui BLOQUENT l'analyse de la page — pour tous les
 * modes, y compris ceux qui n'ecrivent rien (page seule, `?scene=`).
 *
 * ## Maintenant
 *
 * Le moteur ne sert qu'a la fiche d'entite et au module Formulaires, c'est-a-dire
 * dans un document Grist ouvert. `app_v7.js` le demande (`assurerMoteurFormulaire`)
 * quand il lit les formulaires du document, et avant tout geste qui en depend ;
 * la page autonome et `?scene=` ne le chargent jamais. Les scripts
 * restent des scripts classiques — ils exposent des globales (`window.FormEngine`,
 * `window.FormTypes`...) que `lib/fiche-formulaire.js` interroge en synchrone
 * (`moteurDisponible`) ; la fiche de repli (champs devines) reste le comportement
 * quand le moteur n'est pas la, comme avant.
 *
 * ## Ou est le dossier
 *
 * `index_v7.html` le dit dans `<meta name="atlas-moteur-formulaire">` : `../grist_forms/`
 * sur le serveur de developpement, `./vendor/grist_forms/` dans `published/atlas/`
 * (`scripts/promote-atlas.js` reecrit la page ET copie les sept fichiers par la liste
 * nommee `VENDOR`, dont `tests/moteur-formulaire.test.js` verifie l'egalite avec
 * `FICHIERS_MOTEUR`).
 */
import { unSeulChargement, chargerScriptsEnOrdre, chargerFeuille } from './chargement-paresseux.js';

/** Les sept scripts, DANS L'ORDRE : chacun lit ce que les precedents ont pose. */
export const FICHIERS_MOTEUR = Object.freeze([
  'shared/types.js',
  'shared/attachments.js',
  'shared/session-context.js',
  'shared/formulaires-table.js',
  'shared/formdef-from-table.js',
  'shared/formdef-from-grist-form.js',
  'runtime/engine.js',
]);

export const NOM_META = 'atlas-moteur-formulaire';

/**
 * La peau du moteur : `lib/formulaire-atlas.css`, a cote de ce module. Elle habille les
 * classes `fr-*` du moteur et le module Formulaires (`.fm-*`), qui n'existent tous deux
 * que dans un document Grist : elle se charge avec le moteur, plus en <head>, ou elle
 * bloquait l'affichage de toutes les pages.
 */
export const URL_FEUILLE = new URL('./formulaire-atlas.css?v=1.46.0', import.meta.url).href;

/** Le moteur est-il deja la ? Meme critere que `moteurDisponible()` de `fiche-formulaire.js`. */
export function moteurPresent(portee = globalThis) {
  return !!(portee && portee.FormEngine && portee.FormTypes);
}

/** Le dossier du moteur, tel que la page le declare ; `null` s'il ne le declare pas. */
export function baseDuMoteur(doc = globalThis.document) {
  const meta = doc?.querySelector?.(`meta[name="${NOM_META}"]`);
  const contenu = meta?.getAttribute?.('content');
  return contenu ? contenu : null;
}

/** Les adresses absolues des sept scripts, depuis le dossier declare. */
export function adressesDuMoteur(base, racine) {
  const dossier = new URL(base.endsWith('/') ? base : base + '/', racine);
  return FICHIERS_MOTEUR.map((f) => new URL(f, dossier).href);
}

/**
 * Fabrique le chargeur. Rend `assurer()` : une promesse de booleen, jamais rejetee.
 *
 *  - `true`  : le moteur est la (deja present, ou charge maintenant) ;
 *  - `false` : adresse non declaree ou fichier introuvable — l'appelant retombe
 *    sur la fiche de repli, comme une page servie sans les sept scripts.
 *
 * Un echec n'est pas memorise : l'appel suivant retente.
 */
export function creerChargeurMoteur({
  document: doc = globalThis.document,
  portee = globalThis,
  charger = chargerScriptsEnOrdre,
  chargerStyle = chargerFeuille,
  urlFeuille = URL_FEUILLE,
  avertir = (...a) => console.warn(...a),
} = {}) {
  const unSeul = unSeulChargement(async () => {
    if (moteurPresent(portee)) return;
    const base = baseDuMoteur(doc);
    if (!base) throw new Error(`<meta name="${NOM_META}"> absente de la page`);
    // La feuille se charge EN PARALLELE des scripts, et sa perte n'est pas fatale :
    // une fiche sans peau reste utilisable, un moteur sans scripts ne l'est pas.
    const feuille = chargerStyle(urlFeuille, { document: doc })
      .catch((e) => avertir('[Atlas] feuille du formulaire :', e.message));
    await charger(adressesDuMoteur(base, doc.baseURI), { document: doc });
    await feuille;
    if (!moteurPresent(portee)) throw new Error('les scripts sont charges mais FormEngine reste absent');
  });
  return async function assurer() {
    try {
      await unSeul();
      return true;
    } catch (e) {
      avertir('[Atlas] moteur de formulaire indisponible :', e.message);
      return false;
    }
  };
}

/** Le chargeur de la page. */
export const assurerMoteurFormulaire = creerChargeurMoteur();

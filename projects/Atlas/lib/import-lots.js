/**
 * Importer par pages : les briques que toute source d'import volumineuse partage.
 *
 * ## Pourquoi un module commun
 *
 * L'import OpenStreetMap, l'import d'un fichier et l'import d'une source de données ouvertes (IGN) répondent aux mêmes
 * questions : combien d'objets, est-ce raisonnable, où en est-on, peut-on arrêter, que faire de ce qui est refusé. Les
 * écrire dans chaque source donnerait trois seuils, trois barres de progression et trois façons de compter les refus.
 * Ce module n'en connaît aucune : il reçoit les pages (un itérable asynchrone) et une fonction qui juge chaque objet.
 *
 * Il reprend les idées de l'étude `essais-import/` (budget, estimation, suivi d'avancement, annulation, reprise,
 * rapport des lignes refusées) sans en importer le dossier, et sans la partie « écrire dans Grist » : ici la
 * destination est la mémoire de la page, la couche. Rien d'autre ne dépend du réseau ou du DOM ; l'horloge est
 * injectable, si bien que les tests n'attendent jamais.
 *
 * ## Les seuils
 *
 * - **au-dessus de 5 000 objets** : on prévient (la carte et le panneau Couches s'alourdissent, l'import dure) ;
 * - **au-dessus de 50 000 objets** : on refuse, en disant de zoomer. C'est le seuil au-delà duquel une table Grist cesse
 *   d'être un bon porteur de géométrie (`essais-import/RECOMMANDATION.md`) ; au-delà de 100 000, il faudrait des tuiles.
 */

/** Les seuils d'un import en mémoire. */
export const SEUILS_IMPORT = Object.freeze({ avertir: 5000, refuser: 50000 });

/**
 * Que faire d'un nombre d'objets annoncé ?
 *
 * @param {number|null} n le nombre annoncé par la source (décompte)
 * @param {{seuils?: {avertir: number, refuser: number}}} [o]
 * @returns {{niveau: 'inconnu'|'vide'|'ok'|'avertir'|'refuser', n: number|null, message: string}}
 */
export function evaluerVolume(n, { seuils = SEUILS_IMPORT } = {}) {
  if (!Number.isFinite(n) || n < 0) return { niveau: 'inconnu', n: null, message: 'Le nombre d’objets n’est pas connu.' };
  const nb = (x) => x.toLocaleString('fr-FR').replace(/ | /g, ' ');
  if (n === 0) return { niveau: 'vide', n, message: 'Aucun objet dans cette emprise.' };
  if (n > seuils.refuser) {
    return {
      niveau: 'refuser', n,
      message: `${nb(n)} objets : c’est trop (au plus ${nb(seuils.refuser)}). Zoomez pour réduire la zone importée.`,
    };
  }
  if (n > seuils.avertir) {
    return {
      niveau: 'avertir', n,
      message: `${nb(n)} objets : l’import sera long et la carte plus lourde. Zoomer réduit la zone.`,
    };
  }
  return { niveau: 'ok', n, message: `${nb(n)} objet${n > 1 ? 's' : ''}.` };
}

/**
 * Suivi d'avancement : pourcentage, débit lissé (moyenne mobile exponentielle sur les objets par seconde) et reste
 * estimé. L'horloge est injectée (`maintenant()` en ms).
 *
 * @param {{total?: number|null, maintenant?: () => number, lissage?: number}} [o]
 */
export function creerSuivi({ total = null, maintenant = () => Date.now(), lissage = 0.3 } = {}) {
  const t0 = maintenant();
  let dernier = t0;
  let fait = 0;
  let debit = null;
  return {
    /** Note `objets` reçus depuis le dernier appel. */
    tick(objets) {
      const t = maintenant();
      const dt = (t - dernier) / 1000;
      if (dt > 0 && objets > 0) {
        const instantane = objets / dt;
        debit = debit == null ? instantane : debit + lissage * (instantane - debit);
      }
      dernier = t;
      fait += objets;
    },
    etat() {
      const ecouleS = (maintenant() - t0) / 1000;
      const pct = total ? Math.min(100, (fait / total) * 100) : null;
      const resteS = total && debit ? Math.max(0, (total - fait) / debit) : null;
      return { fait, total, pct, debit, ecouleS, resteS };
    },
  };
}

/** « 2 min 30 s », « 45 s », « moins de 5 s » : une durée dite à la personne qui attend. */
export function formaterDuree(s) {
  if (s == null || !Number.isFinite(s)) return 'estimation en cours';
  if (s < 5) return 'moins de 5 s';
  if (s < 60) return `${Math.round(s / 5) * 5} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  if (m < 60) return r ? `${m} min ${r} s` : `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Au plus combien d'exemples de rang on garde par motif de refus. */
const EXEMPLES_MAX = 5;

/**
 * Le rapport des objets que l'import n'a pas gardés : par motif, avec le nombre et quelques rangs pour retrouver
 * l'objet dans la source. Les doublons sont comptés à part : ce n'est pas une erreur de la source, c'est une page
 * relue après une reprise.
 */
export function creerRapport() {
  const parCode = new Map();
  let refuses = 0;
  let doublons = 0;
  return {
    refuser(rang, code, message) {
      refuses++;
      if (!parCode.has(code)) parCode.set(code, { code, message, n: 0, exemples: [] });
      const m = parCode.get(code);
      m.n++;
      if (m.exemples.length < EXEMPLES_MAX) m.exemples.push(rang);
    },
    doublon() { doublons++; },
    resume() {
      return { refuses, doublons, motifs: [...parCode.values()].sort((a, b) => b.n - a.n).map((m) => ({ ...m, exemples: [...m.exemples] })) };
    },
  };
}

/** L'état d'un import, à repasser à `importerParPages` pour le reprendre là où il s'est arrêté. */
export function nouvelEtatImport() {
  return { acceptees: [], curseur: 0, vus: new Set(), rapport: creerRapport() };
}

/**
 * Consomme les pages d'une source, juge chaque objet et rend ce qui est gardé.
 *
 * - **Progression** : `onProgression` est appelé après chaque page.
 * - **Annulation** : `signal.aborted` est regardé après chaque page, et une source qui s'interrompt d'elle-même sur
 *   une erreur de code `annule` (le client WFS le fait quand son `fetch` est coupé) donne le même résultat. On rend
 *   alors `statut: 'annule'`, avec tout ce qui a déjà été lu.
 * - **Reprise** : `etat.curseur` est le rang du prochain objet à lire. Pour reprendre, on demande à la source les
 *   pages à partir de ce rang et on repasse le MÊME `etat` : les objets déjà gardés restent, et un objet vu deux fois
 *   (une page relue) est compté en doublon au lieu d'être gardé deux fois.
 * - **Erreur** : une page qui échoue n'efface rien. On rend `statut: 'erreur'` et l'erreur, l'état reste reprenable.
 *
 * @param {object} o
 * @param {AsyncIterable<{features: object[], debut?: number}>} o.pages
 * @param {(entite: object, rang: number) => ({entite: object}|{refus: {code: string, message: string}})} o.traiter
 * @param {(entite: object) => (string|number|null|undefined)} [o.cle] identifiant stable, pour retirer les doublons
 * @param {AbortSignal|{aborted: boolean}} [o.signal]
 * @param {(p: object) => void} [o.onProgression]
 * @param {number|null} [o.total] le nombre annoncé, pour le pourcentage
 * @param {number} [o.plafond] au-delà de ce nombre d'objets lus, la source est déclarée hors de contrôle
 * @param {() => number} [o.maintenant]
 * @param {ReturnType<typeof nouvelEtatImport>} [o.etat]
 * @returns {Promise<{statut: 'termine'|'annule'|'erreur', etat: object, acceptees: object[], rapport: object, erreur: Error|null, dureeMs: number}>}
 */
export async function importerParPages({ pages, traiter, cle, signal, onProgression, total = null, plafond = Infinity, maintenant = () => Date.now(), etat = nouvelEtatImport() }) {
  const t0 = maintenant();
  const suivi = creerSuivi({ total, maintenant });
  if (etat.curseur) suivi.tick(0);
  let statut = 'termine';
  let erreur = null;
  const resultat = () => ({
    statut, etat, acceptees: etat.acceptees, rapport: etat.rapport.resume(), erreur, dureeMs: maintenant() - t0,
  });
  try {
    if (signal?.aborted) { statut = 'annule'; return resultat(); }
    for await (const page of pages) {
      let lus = 0;
      for (const entite of page.features) {
        const rang = etat.curseur + lus;
        lus++;
        const k = cle ? cle(entite) : undefined;
        if (k !== undefined && k !== null && etat.vus.has(k)) { etat.rapport.doublon(); continue; }
        const r = traiter(entite, rang);
        if (r && r.refus) { etat.rapport.refuser(rang, r.refus.code, r.refus.message); continue; }
        if (k !== undefined && k !== null) etat.vus.add(k);
        etat.acceptees.push(r.entite);
      }
      etat.curseur += lus;
      suivi.tick(lus);
      if (onProgression) onProgression({ ...suivi.etat(), refuses: etat.rapport.resume().refuses, gardes: etat.acceptees.length });
      if (etat.curseur > plafond) {
        const e = new Error(`La source a renvoyé plus d’objets (${etat.curseur}) que le plafond de ${plafond} : import interrompu.`);
        e.code = 'trop_d_objets';
        throw e;
      }
      if (signal?.aborted) { statut = 'annule'; return resultat(); }
    }
  } catch (e) {
    if (e?.code === 'annule' || signal?.aborted) statut = 'annule';
    else { statut = 'erreur'; erreur = e; }
  }
  return resultat();
}

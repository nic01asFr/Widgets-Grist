/**
 * Le retour d'Android (touche, ou geste de balayage depuis le bord) : fermer ce qui est ouvert, jamais quitter par surprise.
 *
 * Sans cela, Capacitor ferme l'application des que la WebView n'a plus d'historique : un menu, une fiche ou
 * un panneau ouvert ne se fermait pas, l'agent perdait sa vue de carte. Mesure sur telephone : le retour,
 * menu de posture ouvert, sortait d'Atlas.
 *
 * Le module est PUR (aucun acces au DOM, ni a l'historique, ni a l'horloge : tout est injecte), pour que
 * la pile se verifie sans navigateur. Le branchement par l'History API est dans `app_v7.js`, et ne vaut que
 * dans l'application native : jamais dans un navigateur, ni dans Grist.
 *
 * Principe : l'application garde UN SEUL etat d'historique « sentinelle » au-dessus de sa page. Un retour la
 * consomme (evenement `popstate`), Atlas ferme la couche du dessus puis la repose. Rien ne s'accumule : la
 * sentinelle n'est posee que si elle n'existe plus.
 */

export const VERSION = '1.0.0';

/** Delai pendant lequel un second retour, apres l'avertissement, quitte vraiment. */
export const DELAI_QUITTER_MS = 2000;

/** L'application tourne-t-elle dans son enveloppe native (Capacitor), et non dans un navigateur ou dans Grist ? */
export function estApplicationNative(portee = globalThis) {
  const cap = portee?.Capacitor;
  if (!cap) return false;
  if (typeof cap.isNativePlatform === 'function') return !!cap.isNativePlatform();
  return !!cap.isNative;
}

/**
 * Que faire d'un retour ?
 *
 * @param {object} e
 * @param {{id: string, ouvert: boolean}[]} e.fermables les couches fermables, de la plus haute a la plus basse
 * @param {number} e.maintenant l'heure, en ms
 * @param {number|null} [e.avertiA] l'heure du dernier avertissement « appuyez encore pour quitter »
 * @param {number} [e.delai]
 * @returns {{type: 'fermer', id: string} | {type: 'avertir'} | {type: 'quitter'}}
 */
export function decider({ fermables = [], maintenant, avertiA = null, delai = DELAI_QUITTER_MS } = {}) {
  const haut = fermables.find((f) => f && f.ouvert);
  if (haut) return { type: 'fermer', id: haut.id };
  if (avertiA != null && maintenant - avertiA <= delai) return { type: 'quitter' };
  return { type: 'avertir' };
}

/**
 * Une saisie a-t-elle quelque chose a perdre ? Une saisie vide (consigne seule, rien de pose, rien de tape) se
 * ferme sans question, comme « Abandonner » ; des qu'un point est place, une forme commencee ou un champ rempli,
 * on demande d'abord.
 */
export function saisieAvecContenu({ geometrie = false, formeEnCours = false, valeurs = [] } = {}) {
  if (geometrie || formeEnCours) return true;
  return valeurs.some((v) => (typeof v === 'string' ? v.trim() !== '' : !!v));
}

/**
 * Le gestionnaire d'etat du retour.
 *
 * @param {object} o
 * @param {() => {id: string, ouvert: boolean}[]} o.fermables ce qui est ouvert, du dessus au dessous
 * @param {(id: string) => boolean | Promise<boolean>} o.fermer ferme la couche ; faux si on a refuse (saisie)
 * @param {() => void} o.avertir dit « Appuyez encore pour quitter »
 * @param {() => void} o.pousserSentinelle pose l'etat d'historique sentinelle
 * @param {() => void} [o.quitter] quitte, quand l'enveloppe sait le faire sans un nouvel appui
 * @param {() => number} [o.maintenant]
 * @param {(f: () => void, ms: number) => unknown} [o.planifier]
 * @param {number} [o.delai]
 */
export function creerRetour({
  fermables, fermer, avertir, pousserSentinelle, quitter = () => {},
  maintenant = () => Date.now(), planifier = (f, ms) => setTimeout(f, ms), delai = DELAI_QUITTER_MS,
}) {
  let sentinelle = false;
  let avertiA = null;

  /** Pose la sentinelle si, et seulement si, elle n'y est plus : c'est ce qui empeche l'accumulation. */
  function armer() {
    if (sentinelle) return false;
    pousserSentinelle();
    sentinelle = true;
    return true;
  }

  /** A appeler sur `popstate` : la sentinelle vient d'etre consommee. */
  async function surRetour() {
    sentinelle = false;
    const decision = decider({
      fermables: fermables().map((f) => ({ id: f.id, ouvert: !!f.ouvert })), maintenant: maintenant(), avertiA, delai,
    });
    if (decision.type === 'fermer') {
      avertiA = null;
      try { await fermer(decision.id); } finally { armer(); }
      return decision;
    }
    if (decision.type === 'avertir') {
      avertiA = maintenant();
      avertir();
      // Pas de sentinelle tout de suite : le prochain retour, dans le delai, n'a plus d'historique a
      // consommer et quitte l'application par le chemin natif. Passe le delai, on se remet en garde.
      planifier(() => { avertiA = null; armer(); }, delai);
      return decision;
    }
    avertiA = null;
    quitter();
    return decision;
  }

  return { armer, surRetour, get sentinelle() { return sentinelle; } };
}

/**
 * Navigation au clavier de la carte : logique pure (touches, ordre de parcours, phrases annoncées aux lecteurs d'écran).
 *
 * La carte est un canevas : sans cela, un utilisateur au clavier peut déplacer la vue (flèches, + et -, gérés par MapLibre)
 * mais ne peut ni atteindre une unité ou un point, ni la sélectionner. Le câblage au DOM est dans clavier-runtime.js.
 *
 * Touches (la carte doit avoir le focus ; Tab y entre, Tab en sort) :
 *   n / p            unité ou élément suivant / précédent        Début / Fin   premier / dernier
 *   Page suiv. / préc.   dix pas en avant / en arrière
 *   Entrée ou Espace sélectionne l'élément courant (événement select)
 *   Échap            désélectionne                                f   cadre la vue sur l'élément courant
 *   d / u            descend dans l'unité courante / remonte d'un niveau (couches administratives)
 *   ?                annonce l'aide
 */
export const VERSION = '1.0.0';

export const TOUCHES = Object.freeze({ n: 'suivant', p: 'precedent', Home: 'debut', End: 'fin', PageDown: 'saut-avant', PageUp: 'saut-arriere', Enter: 'selectionner', ' ': 'selectionner', Escape: 'deselectionner', f: 'cadrer', d: 'descendre', u: 'remonter', '?': 'aide' });
export const AIDE = 'Navigation de la carte : n et p pour passer à l\'élément suivant ou précédent, Début et Fin pour le premier et le dernier, Entrée pour sélectionner, Échap pour désélectionner, f pour cadrer, d et u pour descendre ou remonter d\'un niveau, flèches pour déplacer la vue, plus et moins pour zoomer.';

/** Action associée à un événement clavier ; null s'il ne s'agit pas d'une touche de navigation (ou si un modificateur est enfoncé). */
export function actionPourTouche(evt) {
  if (!evt || evt.ctrlKey || evt.altKey || evt.metaKey) return null;
  const k = evt.key; return TOUCHES[k] || TOUCHES[String(k).toLowerCase()] || null;
}

/** Nouvel indice après une action de déplacement ; -1 si la liste est vide. L'indice courant -1 signifie « aucun focus ». */
export function pas(index, n, action) {
  if (!(n > 0)) return -1;
  switch (action) {
    case 'suivant': return index < 0 ? 0 : (index + 1) % n;
    case 'precedent': return index < 0 ? n - 1 : (index - 1 + n) % n;
    case 'debut': return 0;
    case 'fin': return n - 1;
    case 'saut-avant': return Math.min(n - 1, (index < 0 ? 0 : index) + 10);
    case 'saut-arriere': return Math.max(0, (index < 0 ? n : index) - 10);
    default: return index;
  }
}

/** Codes dans l'ordre de parcours : celui du classement (valeur décroissante, sans donnée en fin) pour une couche administrative. */
export function ordreUnites(lignes) { return (lignes || []).map((l) => l.code); }

/** Phrase annoncée pour une unité administrative. */
export function phraseUnite(l, { rang = null, total = null, classe = null, nClasses = null, unite = '', fmt = (v) => String(v) } = {}) {
  const nom = l.nom || l.code; const parts = [nom + ', code ' + l.code];
  if (l.valeur === null || l.valeur === undefined) parts.push('sans donnée');
  else { parts.push('valeur ' + fmt(l.valeur) + (unite ? ' ' + unite : '')); if (classe !== null && classe >= 0 && nClasses) parts.push('classe ' + (classe + 1) + ' sur ' + nClasses); if (rang) parts.push('rang ' + rang + (total ? ' sur ' + total : '')); if (l.petit) parts.push('petit effectif, valeur fragile'); }
  return parts.join(', ') + '.';
}
/** Phrase annoncée pour un élément ponctuel. */
export function phrasePoint(props = {}, { rang = null, total = null, champs = ['nom', 'name', 'title', 'id'] } = {}) {
  const nom = champs.map((c) => props[c]).find((v) => v !== undefined && v !== null && v !== '') ?? 'Élément';
  return String(nom) + (rang && total ? ', ' + rang + ' sur ' + total : '') + '.';
}

/**
 * Les choix de l'auteur sur la manière d'exposer la scène.
 *
 * Une scène a une posture de départ pour qui la consulte, et ce que l'hébergement, les
 * droits et le lien permettent (`CARTE-DES-EXPOSITIONS.md`) ne dit rien de **par où l'on
 * entre**. C'est à l'auteur de le dire : une storymap s'ouvre sur son récit, un secteur de
 * terrain sur son contexte, une carte de consultation sur la carte.
 *
 * Le bloc vit avec la scène (`Atlas_ScenePrefs.ExpositionJSON`), pas avec l'appareil :
 * c'est un choix d'auteur, partagé par tous ceux qui ouvrent la scène. Il est conçu pour
 * porter ensuite d'autres choix d'exposition (un plafond de posture posé par l'auteur) ;
 * seule l'ouverture existe aujourd'hui.
 *
 * Ce module ne touche ni au DOM, ni à Grist.
 */
import { contexteDeCle } from './contextes.js?v=20261003c';
import { normaliserCadrage } from './cadrage.js?v=20261002f';

/** Par où la scène s'ouvre pour qui ne l'édite pas. */
export const OUVERTURES = Object.freeze(['carte', 'recit', 'contexte']);

export function expositionVide() {
  return { ouverture: { mode: 'carte' } };
}

/**
 * Un bloc d'exposition sûr, quoi qu'on lui donne : jamais d'exception, jamais de mode
 * inconnu (une valeur écrite par une version ultérieure ne doit pas entrer telle quelle).
 */
export function normaliserExposition(brut) {
  const out = expositionVide();
  const o = brut && typeof brut === 'object' && !Array.isArray(brut) ? brut.ouverture : null;
  if (o && typeof o === 'object' && OUVERTURES.includes(o.mode)) {
    out.ouverture.mode = o.mode;
    if (o.mode === 'contexte' && typeof o.cle === 'string' && o.cle) out.ouverture.cle = o.cle;
    // Un contexte sans clé ne désigne rien : on le tient pour la carte.
    if (o.mode === 'contexte' && !out.ouverture.cle) out.ouverture.mode = 'carte';
  }
  // Où la carte s'ouvre (lib/cadrage.js) : présent seulement quand l'auteur a choisi.
  const cadrage = brut && typeof brut === 'object' && !Array.isArray(brut) ? normaliserCadrage(brut.cadrage) : null;
  if (cadrage) out.cadrage = cadrage;
  return out;
}

export function expositionDepuisJSON(texte) {
  try { return normaliserExposition(JSON.parse(String(texte || '{}'))); } catch (_) { return expositionVide(); }
}

/** Ce qu'on écrit : le bloc normalisé. */
export function expositionAEnregistrer(exposition) {
  return normaliserExposition(exposition);
}

/**
 * Par où la scène s'ouvre, ici et maintenant.
 *
 * Ce que l'auteur a réglé ne s'applique qu'à qui ne prépare pas : celui qui édite arrive sur
 * la carte, qu'il règle, et non sur la présentation. Et un réglage que la scène ne peut plus
 * tenir (un récit sans étape, un contexte qu'on n'a plus proposé) retombe sur la carte plutôt
 * que sur une présentation vide.
 *
 * @param {object} o
 * @param {object} o.exposition
 * @param {Array}  o.story      le récit (étapes avec `cle`, `state.usage`)
 * @param {'preparer'|'exploiter'|'lecture'} o.posture
 * @returns {{ mode: 'carte' } | { mode: 'recit' } | { mode: 'contexte', cle: string, index: number }}
 */
export function ouvertureEffective({ exposition, story, posture } = {}) {
  if (posture === 'preparer') return { mode: 'carte' };
  const o = normaliserExposition(exposition).ouverture;
  if (o.mode === 'recit') return (story || []).length ? { mode: 'recit' } : { mode: 'carte' };
  if (o.mode === 'contexte') {
    const ctx = contexteDeCle(story, o.cle);
    return ctx ? { mode: 'contexte', cle: ctx.cle, index: ctx.index } : { mode: 'carte' };
  }
  return { mode: 'carte' };
}

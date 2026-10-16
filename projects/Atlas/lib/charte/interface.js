/**
 * L'interface d'un composant Atlas prend les couleurs de l'HÔTE : la charte résolue est l'unique source, `variablesInterface` en tire les variables CSS
 * (`--atlas-*`) que les éléments d'interface du composant (bulle, boutons d'action, légende, contrôles) utilisent. Une charte d'organisation donnée par
 * `setTheme` change donc la carte ET son interface, sans feuille de style à écrire.
 *
 * Seules des couleurs `#rrggbb` de la charte et une pile de polices de la liste admise (`pilePolice`) y entrent : rien venant de l'hôte n'est écrit tel
 * quel dans une feuille de style. Module pur : aucune dépendance au DOM.
 */
import { melanger, encreSur, contraste } from './couleurs.js';
import { pilePolice } from './schema.js';

/** Les variables CSS de l'interface, dérivées de la charte résolue (`resoudre(...).charte`). */
export function variablesInterface(charte) {
  const g = charte.graines, d = charte.donnees || {};
  const tailles = (charte.texte && charte.texte.tailles) || {};
  const fond = g.fond, encre = g.encre, accent = g.principal;
  const lisible = (c) => (contraste(c, fond) >= 3 ? c : encre);   // un accent trop pâle ne sert pas à écrire sur le fond : l'encre le remplace
  return {
    '--atlas-fond': fond,
    '--atlas-encre': encre,
    '--atlas-discret': melanger(fond, encre, 0.62),      // texte secondaire : l'encre, adoucie vers le fond
    '--atlas-bord': melanger(fond, encre, 0.2),
    '--atlas-survol': d.survol || melanger(fond, encre, 0.08),
    '--atlas-accent': accent,
    '--atlas-accent-lisible': lisible(accent),
    '--atlas-sur-accent': encreSur(accent).hex,
    '--atlas-selection': d.selection || encre,
    '--atlas-erreur': g.erreur,
    '--atlas-police': pilePolice(charte.texte && charte.texte.famille),
    '--atlas-taille-texte': (tailles.legende || 13) + 'px',
    '--atlas-taille-petit': (tailles.etiquette || 12) + 'px',
  };
}

/** Écrit les variables sur un élément (`style.setProperty`) ; rend les noms posés. */
export function appliquerVariables(element, variables) {
  const noms = [];
  for (const [nom, valeur] of Object.entries(variables || {})) {
    if (!/^--atlas-[a-z-]+$/.test(nom) || typeof valeur !== 'string') continue;
    element.style.setProperty(nom, valeur); noms.push(nom);
  }
  return noms;
}

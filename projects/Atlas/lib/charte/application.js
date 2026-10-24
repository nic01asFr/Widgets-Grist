/**
 * L'identité de l'hôte sur l'APPLICATION COMPLÈTE d'Atlas (profil `complet` du composant) : la même charte qui habille la carte nue et l'interface du composant
 * (`interface.js`) donne ses couleurs et sa police à l'interface de l'application (rail, panneaux, boutons), pour qu'un même thème de document ne laisse voir
 * aucune différence entre les trois présentations. Module pur : aucune dépendance au DOM.
 *
 * Seul ce que l'HÔTE a donné est repris : une charte qui ne fixe que `graines.principal` change l'accent et rien d'autre ; sans charte de l'hôte, l'application garde
 * ses jetons (papier, terre cuite). Les variables viennent des graines, jamais d'une valeur libre : seules des couleurs `#rrggbb` de la charte résolue et une pile
 * de la liste admise entrent dans la feuille.
 *
 * Limite assumée : l'interface de l'application n'a qu'une palette CLAIRE (elle annonce `color-scheme: light`, voir `index_v7.html`). Une charte à fond SOMBRE
 * ne retourne donc ni les surfaces ni l'encre (elles deviendraient illisibles) ; un accent trop pâle sur le fond de l'application, ou une encre peu contrastée, ne sont
 * pas repris non plus. La couleur secondaire et la police le sont. Chaque refus est dit dans `notes` (`fond-sombre-non-suivi`, `encre-non-suivie`,
 * `accent-peu-lisible-non-suivi`).
 *
 * @param {{ charte: object, hote?: object }} lecture  ce que rend `getTheme` : la charte résolue et la charte de l'hôte
 * @returns {{ variables: Record<string, string>, notes: string[] }}
 */
import { melanger, luminance, contraste } from './couleurs.js';
import { pilePolice } from './schema.js';

export const VERSION = '1.0.0';
/** Les seules variables que ce module écrit : les jetons de l'application (`index_v7.html`). */
export const VARIABLES = Object.freeze(['--bg', '--surface', '--surface-muted', '--ink', '--text', '--muted', '--muted-light', '--hairline', '--hairline-strong', '--accent', '--accent-soft', '--accent2', '--sans', '--serif']);
const FOND_PAR_DEFAUT = '#F4EFE3';
const HEX = /^#[0-9a-f]{6}$/i;

export function variablesApplication(lecture) {
  const variables = {}, notes = [];
  const charte = lecture && lecture.charte, hote = (lecture && lecture.hote) || {};
  if (!charte || !charte.graines) return { variables, notes };
  const donne = hote.graines || {}, g = charte.graines;
  const a = (k) => typeof donne[k] === 'string' && HEX.test(g[k]);   // donnée par l'hôte ET lisible dans la charte résolue

  let fond = FOND_PAR_DEFAUT, fondSombre = false;
  if (a('fond')) {
    if ((luminance(g.fond) || 0) >= 0.5) {
      fond = g.fond;
      variables['--bg'] = fond;
      variables['--surface'] = melanger(fond, '#ffffff', 0.6);
      variables['--surface-muted'] = melanger(fond, HEX.test(g.encre) ? g.encre : '#000000', 0.04);
      const encre = HEX.test(g.encre) ? g.encre : '#1f1b14';
      variables['--hairline'] = melanger(fond, encre, 0.14);
      variables['--hairline-strong'] = melanger(fond, encre, 0.28);
    } else { fondSombre = true; notes.push('fond-sombre-non-suivi'); }
  }
  // l'encre d'une charte à fond sombre est CLAIRE : sur les surfaces claires de l'application elle serait illisible ; une encre peu contrastée sur le fond de l'application l'est aussi
  if (a('encre')) {
    if (fondSombre || (contraste(g.encre, fond) || 0) < 4.5) notes.push('encre-non-suivie');
    else {
      variables['--ink'] = g.encre;
      variables['--text'] = melanger(g.encre, fond, 0.12);
      variables['--muted'] = melanger(fond, g.encre, 0.62);
      variables['--muted-light'] = melanger(fond, g.encre, 0.4);
    }
  }
  // l'accent sert de couleur de texte et de fond de bouton : trop pâle sur le fond de l'application, il ne se lirait pas
  if (a('principal')) {
    if ((contraste(g.principal, fond) || 0) < 3) notes.push('accent-peu-lisible-non-suivi');
    else { variables['--accent'] = g.principal; variables['--accent-soft'] = melanger(fond, g.principal, 0.14); }
  }
  if (a('secondaire')) variables['--accent2'] = g.secondaire;
  if (hote.texte && typeof hote.texte.famille === 'string' && charte.texte && charte.texte.famille) {
    const pile = pilePolice(charte.texte.famille);
    variables['--sans'] = pile; variables['--serif'] = pile;
  }
  return { variables, notes };
}

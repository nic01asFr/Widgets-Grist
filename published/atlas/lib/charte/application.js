/**
 * L'identité de l'hôte sur l'APPLICATION COMPLÈTE d'Atlas (profil `complet` du composant) : la même charte qui habille la carte nue et l'interface du composant
 * (`interface.js`) donne ses couleurs et sa police à l'interface de l'application (rail, panneaux, boutons), pour qu'un même thème de document ne laisse voir
 * aucune différence entre les trois présentations. Module pur : aucune dépendance au DOM.
 *
 * Seul ce que l'HÔTE a donné est repris : une charte qui ne fixe que `graines.principal` change l'accent et rien d'autre ; sans charte de l'hôte, l'application garde
 * ses jetons (papier, terre cuite). Les variables viennent des graines, jamais d'une valeur libre : seules des couleurs `#rrggbb` de la charte résolue et une pile
 * de la liste admise entrent dans la feuille.
 *
 * Mode sombre : une charte à fond SOMBRE retourne l'interface (fond, surfaces, encre, filets), et `--mode-application` vaut `sombre` (la page y accroche `color-scheme: dark`
 * et ses règles). Ses surfaces sont tirées de SON fond (légèrement éclaircies), son encre est la sienne si elle se lit à 4,5:1, sinon un blanc cassé. Un accent trop sombre pour
 * son fond, ou en clair trop pâle, n'est pas repris ; une encre peu contrastée non plus. La couleur secondaire et la police le sont. Chaque refus est dit dans `notes`
 * (`encre-non-suivie`, `accent-peu-lisible-non-suivi`).
 *
 * @param {{ charte: object, hote?: object }} lecture  ce que rend `getTheme` : la charte résolue et la charte de l'hôte
 * @returns {{ variables: Record<string, string>, notes: string[] }}
 */
import { melanger, luminance, contraste } from './couleurs.js';
import { pilePolice } from './schema.js';

export const VERSION = '1.0.0';
/** Les seules variables que ce module écrit : les jetons de l'application (`index_v7.html`). */
export const VARIABLES = Object.freeze(['--mode-application', '--bg', '--surface', '--surface-muted', '--ink', '--text', '--muted', '--muted-light', '--hairline', '--hairline-strong', '--accent', '--accent-soft', '--accent2', '--sans', '--serif']);
const FOND_PAR_DEFAUT = '#F4EFE3';
const HEX = /^#[0-9a-f]{6}$/i;

export function variablesApplication(lecture) {
  const variables = {}, notes = [];
  const charte = lecture && lecture.charte, hote = (lecture && lecture.hote) || {};
  if (!charte || !charte.graines) return { variables, notes };
  const donne = hote.graines || {}, g = charte.graines;
  const a = (k) => typeof donne[k] === 'string' && HEX.test(g[k]);   // donnée par l'hôte ET lisible dans la charte résolue

  let fond = FOND_PAR_DEFAUT, fondSombre = false;
  const encreDonnee = a('encre') ? g.encre : null;
  if (a('fond')) {
    fondSombre = (luminance(g.fond) || 0) < 0.5;
    fond = g.fond;
    variables['--bg'] = fond;
    if (fondSombre) {
      variables['--mode-application'] = 'sombre';
      variables['--surface'] = melanger(fond, '#ffffff', 0.07);
      variables['--surface-muted'] = melanger(fond, '#ffffff', 0.035);
    } else {
      variables['--surface'] = melanger(fond, '#ffffff', 0.6);
      variables['--surface-muted'] = melanger(fond, HEX.test(g.encre) ? g.encre : '#000000', 0.04);
    }
    const encreFiletsRef = encreDonnee && (contraste(encreDonnee, fond) || 0) >= 4.5 ? encreDonnee : (fondSombre ? '#ececf1' : '#1f1b14');
    variables['--hairline'] = melanger(fond, encreFiletsRef, fondSombre ? 0.2 : 0.14);
    variables['--hairline-strong'] = melanger(fond, encreFiletsRef, fondSombre ? 0.36 : 0.28);
  }
  // l'encre : celle du thème si elle se lit sur le fond (4,5:1) ; sur un fond sombre, à défaut, un blanc cassé (l'encre d'origine, sombre, y serait illisible)
  const encreLisible = encreDonnee && (contraste(encreDonnee, fond) || 0) >= 4.5;
  if (encreDonnee && !encreLisible) notes.push('encre-non-suivie');
  if (encreLisible || fondSombre) {
    let ink = encreLisible ? encreDonnee : '#ececf1';
    // l'encre se lit aussi sur la surface des cartes et panneaux que l'application pose (plus claire que le fond en sombre) : sinon renforcée vers le blanc (fond sombre) ou le noir
    const surface = variables['--surface'], base = ink;
    if (surface) { let t = 0; while ((contraste(ink, surface) || 0) < 4.5 && t < 1) { t = Math.round((t + 0.05) * 100) / 100; ink = melanger(base, fondSombre ? '#ffffff' : '#000000', t); } if (ink !== base) notes.push('encre-redressee'); }
    variables['--ink'] = ink;
    variables['--text'] = melanger(ink, fond, 0.12);
    // le texte secondaire (aides, notes) se lit sur le fond comme le texte : 4,5:1, en renforçant la part d'encre tant qu'il le faut
    let part = 0.62, muted = melanger(fond, ink, part);
    while ((contraste(muted, fond) || 0) < 4.5 && part < 0.95) { part += 0.03; muted = melanger(fond, ink, part); }
    variables['--muted'] = muted;
    variables['--muted-light'] = melanger(fond, ink, 0.4);
  }
  // l'accent sert de couleur de texte et de fond de bouton : trop pâle sur le fond de l'application, il ne se lirait pas
  if (a('principal')) {
    if ((contraste(g.principal, fond) || 0) < 3) notes.push('accent-peu-lisible-non-suivi');
    else {
      // sert de texte et de fond de bouton sur le fond ET sur les surfaces (cartes, panneaux) que l'application pose : 4,5:1 sur chacun, sinon redressé vers le blanc (fond sombre) ou le noir, sans changer de teinte
      const surfaces = [fond, variables['--surface'] || '#FFFFFF'], tient = (c) => surfaces.every((x) => (contraste(c, x) || 0) >= 4.5);
      let accent = g.principal, t = 0;
      while (!tient(accent) && t < 1) { t = Math.round((t + 0.05) * 100) / 100; accent = melanger(g.principal, fondSombre ? '#ffffff' : '#000000', t); }
      if (accent !== g.principal) notes.push('accent-redresse');
      variables['--accent'] = accent; variables['--accent-soft'] = melanger(fond, accent, 0.14);
    }
  }
  // la couleur secondaire sert aussi de TEXTE (aides, notes) : en sombre, celle du thème s'il se lit (4,5:1), sinon un ton d'encre ; l'accent2 d'origine (un vert sombre) y serait illisible
  if (fondSombre) {
    const ink = variables['--ink'] || '#ececf1';
    variables['--accent2'] = a('secondaire') && (contraste(g.secondaire, fond) || 0) >= 4.5 ? g.secondaire : melanger(fond, ink, 0.78);
  } else if (a('secondaire')) variables['--accent2'] = g.secondaire;
  if (hote.texte && typeof hote.texte.famille === 'string' && charte.texte && charte.texte.famille) {
    const pile = pilePolice(charte.texte.famille);
    variables['--sans'] = pile; variables['--serif'] = pile;
  }
  return { variables, notes };
}

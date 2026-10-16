/**
 * La carte hérite du style de la page qui l'embarque : `<atlas-bi charte="herite">`.
 *
 * L'iframe d'Atlas ne peut pas lire les styles de la page hôte (autre origine) ; l'élément `<atlas-bi>`, lui, s'exécute DANS la page hôte et peut les lire.
 * Ce module lit ce que la page dit d'elle-même et en fait une charte ordinaire (`atlas-charte/0.1`) que le composant résout, mesure et applique comme
 * toute charte donnée par `setTheme` : contrastes vérifiés, avertissements chiffrés, interface (bulle) aux mêmes couleurs.
 *
 * Ce qui est lu, dans cet ordre, et JAMAIS deviné au-delà :
 *  1. des variables CSS d'Atlas posées par l'hôte sur la balise ou un parent (la convention, la plus sûre) :
 *     `--atlas-principal`, `--atlas-secondaire`, `--atlas-fond`, `--atlas-encre`, `--atlas-police` (`systeme`, `sans`, `serif`, `mono` ou `lisible`) ;
 *  2. pour la couleur principale seulement, les variables usuelles des systèmes de design (`--primary`, `--color-primary`, `--accent`, `--bs-primary`,
 *     `--md-sys-color-primary`, `--background-action-high-blue-france`…) puis la propriété `accent-color` ;
 *  3. pour l'encre : la couleur de texte calculée de la balise ; pour le fond : le premier fond opaque en remontant les ancêtres ; pour la police : la
 *     famille calculée, ramenée à la famille admise la plus proche (les polices de la page ne sont pas chargeables dans l'iframe : la charte n'admet que sa liste).
 * Sans couleur principale trouvée, celle d'Atlas reste : on ne prend pas la couleur d'un lien au hasard pour une couleur de marque.
 *
 * Tout ce qui est lu est dit dans `notes` ; ce qui est illisible est écarté et dit dans `ignore`.
 */
import { analyserCouleur, aplatir, luminance } from '../charte/couleurs.js';
import { VERSION_CHARTE, FAMILLES_POLICE } from '../charte/schema.js';

/** Variables CSS cherchées, par rôle. Le préfixe `--atlas-` d'abord : c'est la convention ; le reste n'est qu'un repli pour la couleur principale. */
export const VARIABLES = Object.freeze({
  principal: ['--atlas-principal', '--primary', '--color-primary', '--accent', '--accent-color', '--bs-primary', '--brand', '--md-sys-color-primary', '--background-action-high-blue-france'],
  secondaire: ['--atlas-secondaire'],
  fond: ['--atlas-fond'],
  encre: ['--atlas-encre'],
  police: ['--atlas-police'],
});

const MONO = /\b(mono|monospace|consolas|courier|menlo|monaco|fira code|jetbrains mono|source code)\b/i;
const SERIF = /\b(serif|georgia|times|garamond|palatino|cambria|merriweather|newsreader|playfair|lora|baskerville)\b/i;
const SANS_EXPLICITE = /\b(sans-serif|arial|helvetica|verdana|tahoma|trebuchet|roboto|inter|open sans|segoe|marianne|lato|montserrat|noto sans|hanken)\b/i;
const LISIBLE = /\b(atkinson|opendyslexic|lexend|hyperlegible)\b/i;

/** Une pile `font-family` ramenée à une famille admise par la charte : { famille, cle } ; `cle` dit pourquoi. */
export function familleDepuisPile(pile) {
  const p = String(pile || '').slice(0, 300);
  if (!p.trim()) return { famille: 'systeme', cle: 'vide' };
  const premiere = p.split(',')[0].trim();
  if (LISIBLE.test(premiere)) return { famille: 'lisible', cle: 'lisible' };
  if (MONO.test(premiere)) return { famille: 'mono', cle: 'mono' };
  if (SERIF.test(premiere) && !/sans-serif/i.test(premiere)) return { famille: 'serif', cle: 'serif' };
  if (SANS_EXPLICITE.test(premiere)) return { famille: 'sans', cle: 'sans' };
  // première famille inconnue (police maison) : le générique qui la suit dans la pile dit ce qu'elle est
  if (/\bmonospace\b/i.test(p)) return { famille: 'mono', cle: 'generique' };
  if (/(^|,)\s*serif\s*(,|$)/i.test(p)) return { famille: 'serif', cle: 'generique' };
  if (/\bsans-serif\b/i.test(p)) return { famille: 'sans', cle: 'generique' };
  return { famille: 'systeme', cle: 'inconnue' };
}

/** « rgb(…) », « rgba(…) », « #hex », « hsl(…) » -> { hex, alpha } ; null si ce n'est pas une couleur admise. */
const lireCouleur = (v) => (typeof v === 'string' ? analyserCouleur(v.trim()) : null);

/**
 * Lit le style de la page autour de `element`.
 * @param {Element} element  la balise `<atlas-bi>` (ou le conteneur de la carte)
 * @param {{ fenetre?: Window, resoudre?: (valeur: string) => string|null }} [o]
 *   `resoudre` ramène une valeur CSS quelconque (nom de couleur, `color-mix`…) à un `rgb(…)` ; par défaut, une sonde cachée du document.
 * @returns {{ graines: object, famille: string|null, sombre: boolean, notes: string[], ignore: string[] }}
 */
export function lireStyleHote(element, { fenetre = globalThis.window, resoudre } = {}) {
  const notes = [], ignore = [], graines = {};
  if (!element || !fenetre || typeof fenetre.getComputedStyle !== 'function') return { graines, famille: null, sombre: false, notes, ignore: ['aucun style lisible : la page n\'est pas accessible'] };
  const style = fenetre.getComputedStyle(element);
  const sonde = resoudre || ((valeur) => {
    const doc = element.ownerDocument; if (!doc || !doc.body) return null;
    const s = doc.createElement('span'); s.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;color:' + String(valeur).replace(/[;{}]/g, '');
    doc.body.appendChild(s); const c = fenetre.getComputedStyle(s).color; s.remove(); return c;
  });
  const variable = (nom) => { try { return String(style.getPropertyValue(nom) || '').trim(); } catch (_) { return ''; } };
  /** Une valeur CSS -> couleur opaque lisible, ou null (et dite dans `ignore`). */
  const couleur = (brut, ou) => {
    let c = lireCouleur(brut);
    if (!c) { let r = null; try { r = sonde(brut); } catch (_) { /* sonde indisponible */ } c = lireCouleur(r); }
    if (!c) { ignore.push(`${ou} : « ${String(brut).slice(0, 40)} » n'est pas une couleur lisible`); return null; }
    return c;
  };
  const poser = (role, ou, c, fondDessous = '#ffffff') => { if (!c) return false; graines[role] = c.alpha < 1 ? aplatir(c.hex + Math.round(c.alpha * 255).toString(16).padStart(2, '0'), fondDessous) : c.hex; notes.push(`${role} : ${graines[role]} (${ou})`); return true; };

  // 1. et 2. les variables CSS : la convention d'abord, puis les systèmes de design pour la couleur principale
  for (const role of ['principal', 'secondaire', 'fond', 'encre']) {
    for (const nom of VARIABLES[role]) { const v = variable(nom); if (v && poser(role, nom, couleur(v, nom))) break; }
  }
  if (!graines.principal) {
    const accent = style.accentColor;
    if (accent && accent !== 'auto') poser('principal', 'accent-color', couleur(accent, 'accent-color'));
  }
  // 3. l'encre et le fond calculés
  if (!graines.encre) poser('encre', 'couleur du texte de la balise', couleur(style.color, 'color'));
  if (!graines.fond) {
    let el = element, trouve = false;
    for (let i = 0; el && i < 40; i++, el = el.parentElement) {
      const c = lireCouleur(fenetre.getComputedStyle(el).backgroundColor);
      if (c && c.alpha >= 0.5) { poser('fond', i === 0 ? 'fond de la balise' : 'fond d\'un ancêtre', c); trouve = true; break; }
    }
    if (!trouve) { graines.fond = '#ffffff'; notes.push('fond : #ffffff (aucun fond opaque trouvé : blanc par défaut)'); }
  }
  // la police : la variable explicite, sinon la famille calculée
  let famille = null;
  const police = variable(VARIABLES.police[0]);
  if (police) { if (Object.prototype.hasOwnProperty.call(FAMILLES_POLICE, police)) { famille = police; notes.push(`police : ${famille} (${VARIABLES.police[0]})`); } else ignore.push(`${VARIABLES.police[0]} : « ${police.slice(0, 30)} » n'est pas une famille admise (${Object.keys(FAMILLES_POLICE).join(', ')})`); }
  if (!famille) { const f = familleDepuisPile(style.fontFamily); famille = f.famille; notes.push(`police : ${famille} (famille « ${String(style.fontFamily || '').split(',')[0].trim().slice(0, 30)} » ramenée à la liste admise, ${f.cle})`); }
  const lf = graines.fond ? luminance(graines.fond) : null;
  return { graines, famille, sombre: lf !== null && lf < 0.18, notes, ignore };
}

/** Une charte ordinaire (`atlas-charte/0.1`) depuis ce qui a été lu : seulement ce qui a été trouvé, le reste vient des défauts d'Atlas. */
export function charteDepuisStyle(lu) {
  const charte = { version: VERSION_CHARTE, nom: 'Hérité de la page', graines: { ...lu.graines } };
  if (lu.famille) charte.texte = { famille: lu.famille };
  return charte;
}

/** Tout en un pour un hôte sans l'élément : `client.appeler('setTheme', charteHerite(document.querySelector('#carte')), { remplacer: true })`. */
export function charteHerite(element, options) {
  return charteDepuisStyle(lireStyleHote(element, options));
}

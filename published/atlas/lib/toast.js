/**
 * Le message éphémère (« toast ») : du texte, jamais du HTML.
 *
 * Les messages d'Atlas citent souvent un nom — « Couche non chargée : <nom> »,
 * « Ciblage « <nom> » », « Scène externe : <erreur> ». Ce nom vient du document
 * ou, pour une scène ouverte par `?scene=`, de quelqu'un qui n'a aucun droit sur
 * le document. Écrit avec `innerHTML`, un nom comme `<img src=x onerror=…>`
 * exécutait un script dans l'origine d'Atlas (constaté le 10/10/2026 : une couche
 * qui ne se charge pas suffit). Le message est donc posé par `textContent`.
 */

/** Les dessins des icônes : des tracés FIXES (jamais un texte venu du document), posés par le DOM, pas par `innerHTML`. */
const TRACES = Object.freeze({
  success: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-3.5 9.3 2.4 2.4 4.6-5',
  warning: 'M12 3 2 20h20zM12 10v4m0 3.2v.3',
  error: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9l6 6m0-6-6 6',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5m0-8.3v.3',
});
/** Repli sans DOM vectoriel (anciens documents simulés) : le signe, en texte. */
const SIGNES = Object.freeze({ success: '✓', warning: '!', error: '✕', info: 'i' });
const NS_SVG = 'http://www.w3.org/2000/svg';

function creerIcone(doc, type) {
  if (typeof doc.createElementNS !== 'function') { const t = doc.createElement('span'); t.textContent = SIGNES[type]; return t; }
  const svg = doc.createElementNS(NS_SVG, 'svg');
  for (const [k, v] of Object.entries({ class: 'toast-ic', width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
  const trace = doc.createElementNS(NS_SVG, 'path');
  trace.setAttribute('d', TRACES[type]);
  svg.append(trace);
  return svg;
}

/**
 * L'élément du message, prêt à être inséré.
 *
 * @param {Document} doc le document qui crée l'élément
 * @param {unknown} message le texte à montrer, tel quel
 * @param {string} [type] success | warning | error | info
 * @returns {HTMLElement}
 */
export function creerToast(doc, message, type = 'success') {
  const connu = Object.hasOwn(TRACES, type) ? type : 'info';
  const el = doc.createElement('div');
  el.className = `toast ${connu}`;
  const icone = creerIcone(doc, connu);
  const texte = doc.createElement('span');
  texte.textContent = String(message ?? '');
  el.append(icone, texte);
  return el;
}

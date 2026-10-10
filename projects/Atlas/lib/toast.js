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

const ICONES = Object.freeze({ success: '✅', warning: '⚠️', error: '❌', info: 'ℹ️' });

/**
 * L'élément du message, prêt à être inséré.
 *
 * @param {Document} doc le document qui crée l'élément
 * @param {unknown} message le texte à montrer, tel quel
 * @param {string} [type] success | warning | error | info
 * @returns {HTMLElement}
 */
export function creerToast(doc, message, type = 'success') {
  const connu = Object.hasOwn(ICONES, type) ? type : 'info';
  const el = doc.createElement('div');
  el.className = `toast ${connu}`;
  const icone = doc.createElement('span');
  icone.textContent = ICONES[connu];
  const texte = doc.createElement('span');
  texte.textContent = String(message ?? '');
  el.append(icone, texte);
  return el;
}

/**
 * Pose une feuille de style dans le document, une seule fois par identifiant.
 *
 * Les éléments d'interface du composant (zone, légende, curseur de temps, bulle) apportent leur feuille à l'exécution. Posée par un élément `<style>` avec
 * son texte, elle est un style EN LIGNE : une politique de sécurité de contenu `style-src 'self'` la refuse, et l'hôte doit alors ouvrir `'unsafe-inline'`
 * ou recalculer une empreinte par feuille à chaque version. Posée par une feuille CONSTRUITE (`new CSSStyleSheet()` puis `replaceSync`, ajoutée à
 * `document.adoptedStyleSheets`), elle passe par le modèle objet de CSS, que `style-src` ne contrôle pas : mesuré dans Chrome, aucune violation sous
 * `style-src 'self'`. Même cascade qu'un `<style>` ajouté en fin de `<head>` (les feuilles adoptées viennent après celles du document).
 *
 * Repli sur l'élément `<style>` quand le navigateur ne sait pas construire de feuille (Safari avant 16.4, document de test) ou que le texte est refusé :
 * l'interface s'affiche toujours, seule la politique de l'hôte pourrait alors la restreindre.
 */

/** Les identifiants déjà posés, par document : une feuille adoptée n'a pas d'élément que `getElementById` retrouverait. */
const posees = new WeakMap();

/**
 * @param {Document} doc
 * @param {string} id     identifiant stable de la feuille (sert aussi d'`id` à l'élément du repli)
 * @param {string} texte  le CSS
 * @returns {boolean}     vrai si la feuille vient d'être posée, faux si elle l'était déjà ou si le document n'a pas de quoi la recevoir
 */
export function poserFeuille(doc, id, texte) {
  if (!doc) return false;
  let ids = posees.get(doc);
  if (!ids) { ids = new Set(); posees.set(doc, ids); }
  if (ids.has(id) || (typeof doc.getElementById === 'function' && doc.getElementById(id))) return false;
  const Feuille = doc.defaultView && doc.defaultView.CSSStyleSheet;
  if (Feuille && 'adoptedStyleSheets' in doc && Feuille.prototype && typeof Feuille.prototype.replaceSync === 'function') {
    try {
      const feuille = new Feuille();
      feuille.replaceSync(texte);
      doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, feuille];
      ids.add(id);
      return true;
    } catch (_) { /* feuille refusée : repli sur l'élément */ }
  }
  if (!doc.head) return false;
  const s = doc.createElement('style'); s.id = id; s.textContent = texte; doc.head.appendChild(s);
  ids.add(id);
  return true;
}

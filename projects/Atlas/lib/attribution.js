/**
 * L'attribution d'une source de carte : du texte, des liens, rien d'autre.
 *
 * MapLibre écrit l'attribution d'une source avec `innerHTML`. Son propre
 * assainissement retire `onerror=` et `javascript:` mais laisse passer
 * `<iframe srcdoc>`, `<form action>`, `<base href>`, `<link rel=stylesheet>`,
 * `<meta http-equiv=refresh>`, `<object>`, `<embed>` et `<a style>`. Or
 * l'attribution d'une couche de tuiles vient d'une scène (`?scene=`), c'est-à-dire
 * de quelqu'un qui n'a aucun droit sur le document : un `<iframe srcdoc>` y
 * exécute un script dans l'origine d'Atlas, qui lit la clé d'API gardée sur
 * l'appareil (audit du 09/10/2026, défaut D1).
 *
 * Les fonds de plan légitimes mettent pourtant des liens dans leur attribution
 * (« © <a href="…">OpenStreetMap</a> »). On les garde : une liste blanche
 * réduite aux liens `http(s)` et à la mise en forme minimale, reconstruite
 * balise par balise (`lib/html.js`), avec `rel="noopener noreferrer"` et
 * `target="_blank"`. Tout le reste est écrit comme du texte.
 *
 * **Règle** : toute chaîne passée à MapLibre dans `attribution` passe par
 * `attributionSure`. `tests/attribution.test.js` balaie les sources et échoue
 * sinon.
 */

import { assainirTexte } from './html.js?v=20261010a';

/** Au-delà, ce n'est plus une mention de source : on coupe avant d'analyser. */
export const ATTRIBUTION_MAX = 500;

/** Les seules balises d'une attribution : le lien et un peu de mise en forme. */
const BALISES_ATTRIBUTION = Object.freeze(['a', 'b', 'strong', 'i', 'em']);

/**
 * L'attribution, réduite à ce qu'on peut sans danger donner à `innerHTML`.
 *
 * Idempotente : une attribution déjà assainie ressort inchangée, on peut donc
 * l'appliquer au chargement de la couche puis à la pose de la source.
 *
 * @param {unknown} valeur ce que la scène ou le manifeste déclare
 * @returns {string|null} du HTML sûr, ou null s'il n'y a rien à afficher
 */
/**
 * Une attribution fournie par l'hote avec ses donnees est du TEXTE : tout caractere actif est echappe, la taille est bornee
 * (300 caracteres). Elle s'affiche telle quelle et ne s'interprete jamais. Le resultat passe ensuite par `attributionSure`.
 */
export const attributionTexte = (a) => String(a ?? '').slice(0, 300).replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));

export function attributionSure(valeur) {
  if (valeur == null || typeof valeur === 'object') return null;
  const brut = String(valeur).slice(0, ATTRIBUTION_MAX).trim();
  if (!brut) return null;
  const sure = assainirTexte(brut, { balises: BALISES_ATTRIBUTION }).trim();
  return sure || null;
}

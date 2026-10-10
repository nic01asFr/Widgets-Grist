/**
 * Réécriture de la page d'Atlas pour les dépendances embarquées (`vendor-externe.json`) : module PUR, en CommonJS pour que le script de
 * promotion (CommonJS) comme l'outil et les tests (modules ES) l'utilisent.
 *
 * La page source garde les adresses des CDN (le serveur de développement les sert) ; la promotion les remplace par des chemins relatifs
 * vers `vendor/`, où `tools/vendoriser-web.mjs` a déposé les fichiers aux versions figées. Après réécriture, plus aucune adresse
 * `unpkg.com`, `cdn.jsdelivr.net`, `fonts.googleapis.com` ni `fonts.gstatic.com` ne doit rester dans la page : une dépendance ajoutée à
 * la page sans règle dans le manifeste fait échouer la promotion, au lieu de partir chercher un CDN sans le dire.
 */
'use strict';

const CDN = /https:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)[^"'\s)<>]*/g;
const LIEN_POLICES = /<link\b[^>]*href="https:\/\/fonts\.googleapis\.com\/css2[^"]*"[^>]*>/;
const PRECONNECT_POLICES = /[ \t]*<link\b[^>]*rel="preconnect"[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com"[^>]*>\s*\n?/g;
const PRECONNECT_POLICES_BIS = /[ \t]*<link\b[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com"[^>]*rel="preconnect"[^>]*>\s*\n?/g;

/** Les adresses de CDN qui apparaissent dans un texte (page ou code), sans doublon. */
function referencesExternes(texte) {
  return [...new Set(String(texte).match(CDN) || [])];
}

/**
 * Remplace, dans la page, les adresses des CDN par les chemins embarqués.
 * @param {string} html
 * @param {{ reecritures: Array<{de?:string, deDebut?:string, vers:string}> }} manifeste
 * @param {{ dossier?: string }} [o]  dossier relatif de vendor dans la page (par défaut `./vendor/`)
 * @returns {string}
 */
function reecrireHtml(html, manifeste, { dossier = './vendor/' } = {}) {
  let sortie = String(html);
  for (const r of manifeste.reecritures || []) {
    const motif = r.de || r.deDebut;
    if (!motif || typeof r.vers !== 'string') throw new Error('règle de réécriture invalide : ' + JSON.stringify(r));
    sortie = sortie.split(motif).join(r.vers);
  }
  // Polices : la feuille de Google devient la feuille locale ; les préconnexions deviennent sans objet.
  sortie = sortie.replace(PRECONNECT_POLICES, '').replace(PRECONNECT_POLICES_BIS, '');
  sortie = sortie.replace(LIEN_POLICES, `<link href="${dossier}polices/polices.css" rel="stylesheet" />`);
  // La page dit où sont les dépendances embarquées (le worker de lecture des MNT en a besoin : il part d'un Blob).
  if (!sortie.includes('__ATLAS_VENDOR__')) sortie = sortie.replace(/<\/head>/, `    <script>window.__ATLAS_VENDOR__ = "${dossier}";</script>\n</head>`);
  return sortie;
}

/** Les références qui resteraient vers un CDN après réécriture (le fichier du plugin Grist, qui appartient à Grist, n'est pas un CDN de cette liste). */
function resteExterne(html) {
  return referencesExternes(html);
}

module.exports = { referencesExternes, reecrireHtml, resteExterne, CDN };

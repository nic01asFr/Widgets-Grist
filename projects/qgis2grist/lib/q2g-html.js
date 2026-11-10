/**
 * Q2GHtml - echappement HTML pour qgis2grist.
 *
 * Module pur (aucun DOM). Les valeurs affichees dans l'ancienne carte, la previsualisation et la legende viennent
 * de lignes Grist ou de noms lus dans le fichier QGIS : ce sont des donnees NON FIABLES, jamais du HTML.
 * Chaque valeur inseree dans un gabarit (innerHTML, setHTML) passe par `echapper`.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Q2GHtml = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ECHAPPEMENTS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

  /**
   * Le texte d'une valeur, sans aucun caractere interpretable en HTML (contenu d'element ET valeur d'attribut).
   * null et undefined donnent une chaine vide ; un objet est ecrit en JSON ; le rendu d'un texte ordinaire est inchange.
   * @param {*} valeur
   * @returns {string}
   */
  function echapper(valeur) {
    if (valeur === null || valeur === undefined) return '';
    let t;
    if (typeof valeur === 'string') t = valeur;
    else if (typeof valeur === 'object') { try { t = JSON.stringify(valeur); } catch (_) { t = String(valeur); } }
    else t = String(valeur);
    return t.replace(/[&<>"'`]/g, (c) => ECHAPPEMENTS[c]);
  }

  const COULEUR_SURE = /^(?:#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla)\(\s*[0-9.%]{1,8}(?:\s*[ ,/]\s*[0-9.%]{1,8}){2,3}\s*\)|[a-zA-Z]{3,20})$/;

  /**
   * Une couleur destinee a un attribut `style` : hexadecimale, rgb()/hsl() a nombres simples ou nom de couleur ;
   * toute autre forme (point-virgule, parenthese ouverte, url()...) est remplacee par `repli`.
   * @param {*} couleur
   * @param {string} [repli]
   * @returns {string}
   */
  function couleurSure(couleur, repli) {
    const t = typeof couleur === 'string' ? couleur.trim() : '';
    return COULEUR_SURE.test(t) ? t : (repli === undefined ? '#808080' : repli);
  }

  return { echapper, couleurSure };
});

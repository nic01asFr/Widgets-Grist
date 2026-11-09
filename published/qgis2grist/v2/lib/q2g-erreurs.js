/**
 * Q2GErreurs - messages d'erreur de lecture de fichier en francais pour qgis2grist.
 *
 * Module pur (aucun DOM) : traduit les messages techniques de JSZip et de SQLite (sql.js), qui
 * arrivent en anglais et sans explication, en une phrase que la personne peut utiliser.
 * Le detail technique est conserve entre parentheses pour le diagnostic.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Q2GErreurs = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RE_ZIP = /end of central directory|is this a zip file|corrupted zip|invalid or unsupported zip|zip file/i;
  const RE_SQLITE = /no such table|file is not a database|malformed|not a database|unable to open database|disk image/i;

  /**
   * @param {Error|string} err
   * @param {string} [nomFichier]  nom du fichier lu (l'extension oriente le message)
   * @returns {string}
   */
  function messageLecture(err, nomFichier) {
    const brut = (err && err.message) || String(err || '');
    const ext = String(nomFichier || '').split('.').pop().toLowerCase();
    const detail = ' (détail : ' + brut + ')';
    if (RE_ZIP.test(brut) && (ext === 'zip' || ext === 'qgz' || !ext)) {
      return 'Archive illisible : le fichier n\'est pas un ' + (ext === 'qgz' ? 'projet QGIS .qgz' : 'ZIP') + ' valide (corrompu, tronqué ou d\'un autre format). Réexportez-le depuis QGIS ou qgis2web.' + detail;
    }
    if (RE_SQLITE.test(brut) && (ext === 'gpkg' || ext === 'qgz' || ext === 'zip')) {
      return 'GeoPackage illisible : le fichier est vide, corrompu ou n\'est pas un GeoPackage (.gpkg) valide. Réexportez la couche depuis QGIS (Exporter > Sous un autre nom > GeoPackage).' + detail;
    }
    return brut;
  }

  return { messageLecture };
});

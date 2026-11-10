/**
 * Q2GColor - conversions de couleurs partagees par qgis2grist.
 *
 * Module pur : aucun acces au DOM ni a window, aucune dependance.
 *
 * Il regroupe quatre fonctions de couleur qui existaient en plusieurs exemplaires,
 * a l'identique de chaque original (les comportements different sur les cas limites :
 * les unifier changerait des sorties, ce qui n'est pas fait ici) :
 *
 *   rgbaCssToHex(str)          index_v2.html (et index.html v1) : "rgba(R,G,B,A)" ou "#..." CSS
 *                              -> "#rrggbb" ; "#abc" reste "#abc" (coupe a 7 caracteres) ; sinon null
 *   normalizeHex(c, fallback)  lib/qml-to-declarative.js : "#rrggbb" strict (3 chiffres etendus,
 *                              rgb()/rgba() convertis) ; sinon fallback (defaut '#808080')
 *   normalizeHexLoose(c)       lib/parse-remote-mcp.js : "#..." coupe a 7 et mis en minuscules,
 *                              autre texte inchange, vide -> '#888888'
 *   rgbaStringToHex(s)         lib/qml-style-parser.js : "r,g,b,a" (format QGIS) -> "#rrggbb" ou null
 *
 * Les anciens fichiers ne sont pas modifies : pour retirer les doublons, l'integrateur peut
 * faire deleguer chacun a la fonction de meme nom d'ici (le test tests/q2g-color.test.js fige
 * l'equivalence).
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Q2GColor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // rgba(R,G,B,A) CSS -> "#rrggbb"
  function rgbaCssToHex(str) {
    if (!str) return null;
    if (str.startsWith('#')) return str.slice(0, 7).toLowerCase();
    const m = str.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (!m) return null;
    return '#' + [m[1], m[2], m[3]].map(v => Math.round(+v).toString(16).padStart(2, '0')).join('');
  }

  /** Normalise une couleur en #RRGGBB (6 chiffres, sans alpha). */
  function normalizeHex(color, fallback) {
    const fb = fallback || '#808080';
    if (!color || typeof color !== 'string') return fb;
    const c = color.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(c)) {
      return ('#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]).toLowerCase();
    }
    const rgba = c.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgba) {
      const hex = [rgba[1], rgba[2], rgba[3]]
        .map(v => Math.min(255, parseInt(v, 10)).toString(16).padStart(2, '0'))
        .join('');
      return '#' + hex;
    }
    return fb;
  }

  function normalizeHexLoose(color) {
    if (!color) return '#888888';
    if (color.startsWith('#')) return color.slice(0, 7).toLowerCase();
    return color;
  }

  function rgbaStringToHex(rgba) {
    if (!rgba) return null;
    const parts = String(rgba).split(',').map(s => parseInt(s.trim(), 10));
    if (parts.length < 3 || isNaN(parts[0])) return null;
    return '#' + parts.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('');
  }

  return { rgbaCssToHex, normalizeHex, normalizeHexLoose, rgbaStringToHex };
});

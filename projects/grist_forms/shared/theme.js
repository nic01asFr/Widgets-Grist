/*
 * theme.js — ce qu'un hôte a le droit de poser comme thème sur un formulaire.
 *
 * Contrat `kit-theme/0.1` : une LISTE FERMÉE de 26 variables `--kit-*` et des
 * valeurs bornées. Le module ne rend rien et ne connaît ni le DOM ni Grist : il
 * juge un objet de thème et dit ce qu'il retient, ce qu'il écarte, et pourquoi.
 *
 * > **Un thème arrive d'ailleurs : c'est une donnée, pas du code.** Il vient d'un
 * > hôte, d'une table du document, d'un fichier. Chaque valeur finit dans un
 * > attribut de style : `url()`, `expression`, `calc()`, un `;` ou une accolade
 * > y sont des vecteurs d'injection. On accepte donc une couleur écrite dans une
 * > syntaxe connue, ou une référence `var(--nom)` SANS valeur de repli (un
 * > `var(--x, url(…))` cache une adresse dans son repli) ; le reste est écarté
 * > et dit, jamais corrigé.
 *
 * Le formulaire ne calcule pas le contraste : il ne le vérifie pas. Il le dit
 * (`non-verifie`) ; les valeurs mesurées viennent du générateur du kit.
 *
 * Même esprit que la charte d'Atlas (`atlas-charte/0.1`) : liste blanche, tailles
 * bornées, valeur invalide ignorée et signalée, retour `{ applique, ignore,
 * avertissements }`.
 */
(function (root, factory) {
  'use strict';
  var asNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  if (asNode && typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.FormTheme = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 'kit-theme/0.1';

  /** Les 26 variables du contrat, sans le préfixe `--kit-`. */
  var CLES = [
    'fond', 'surface', 'surface-2', 'texte', 'texte-2', 'bord', 'bord-champ',
    'accent', 'accent-texte', 'accent-fond',
    'action', 'action-texte', 'action-survol', 'action-actif',
    'focus',
    'ok', 'ok-fond', 'attention', 'attention-fond', 'attention-filet', 'alerte', 'alerte-fond', 'info', 'info-fond',
    'papier', 'ombre'
  ];

  var PREFIXE = '--kit-';
  var LONGUEUR_MAX = 48;
  var CLES_MAX = 200;

  // Écrites sans quantificateur illimité ni alternance imbriquée ; la longueur est bornée AVANT.
  // Les motifs sont des CHAÎNES : le schéma publié (`kit-theme-0.1`) reprend le même motif, et un test les compare.
  var MOTIF_HEX = '#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})';
  var MOTIF_FONCTION = '(?:rgb|rgba|hsl|hsla)\\(\\s*[0-9.%]{1,8}(?:\\s*[ ,/]\\s*[0-9.%]{1,8}){2,3}\\s*\\)';
  var MOTIF_REFERENCE = 'var\\(--[A-Za-z_][A-Za-z0-9_-]{0,63}\\)';
  var MOTIF = '^(?:' + MOTIF_HEX + '|' + MOTIF_FONCTION + '|' + MOTIF_REFERENCE + ')$';
  var VALEUR = new RegExp(MOTIF);

  function propre(o, cle) { return Object.prototype.hasOwnProperty.call(o, cle); }

  /** Le nom d'une variable du contrat (`accent` ou `--kit-accent`), ou null. */
  function nomDe(cle) {
    var k = String(cle);
    if (k.indexOf(PREFIXE) === 0) k = k.slice(PREFIXE.length);
    return CLES.indexOf(k) === -1 ? null : k;
  }

  /** Une valeur admise : couleur en syntaxe connue ou `var(--nom)` sans repli. */
  function valeurSure(v) {
    if (typeof v !== 'string') return false;
    var s = v.trim();
    if (!s || s.length > LONGUEUR_MAX) return false;
    return VALEUR.test(s);
  }

  /**
   * Juge un thème.
   *
   * @param {object} theme  { accent: '#…', '--kit-texte': 'var(--c-texte-corps)', … }
   * @returns {{ version: string, applique: Object<string,string>, ignore: Array, avertissements: Array }}
   *   `applique` : nom CSS complet -> valeur retenue (à poser telle quelle) ;
   *   `ignore` : { cle, code, valeur } (`cle-inconnue`, `valeur-invalide`, `valeur-trop-longue`, `doublon`, `trop-de-cles`) ;
   *   `avertissements` : { code, cle?, conseil } (`theme-invalide`, `non-verifie`).
   */
  function valider(theme) {
    var rapport = { version: VERSION, applique: {}, ignore: [], avertissements: [] };
    if (theme === null || theme === undefined) return rapport;
    if (typeof theme !== 'object' || Array.isArray(theme)) {
      rapport.avertissements.push({ code: 'theme-invalide', conseil: 'Le thème est un objet { variable: valeur }.' });
      return rapport;
    }
    var cles = Object.keys(theme);
    if (cles.length > CLES_MAX) {
      rapport.ignore.push({ cle: '', code: 'trop-de-cles', valeur: String(cles.length) });
      cles = cles.slice(0, CLES_MAX);
    }
    cles.forEach(function (cle) {
      var nom = nomDe(cle);
      var brut = propre(theme, cle) ? theme[cle] : undefined;
      if (brut === null || brut === undefined || brut === '') return;
      var texte = typeof brut === 'string' ? brut : String(brut);
      if (!nom) {
        rapport.ignore.push({ cle: String(cle).slice(0, 40), code: 'cle-inconnue', valeur: texte.slice(0, 24) });
        return;
      }
      if (texte.length > LONGUEUR_MAX) {
        rapport.ignore.push({ cle: nom, code: 'valeur-trop-longue', valeur: texte.slice(0, 24) });
        return;
      }
      if (!valeurSure(brut)) {
        rapport.ignore.push({ cle: nom, code: 'valeur-invalide', valeur: texte.slice(0, 24) });
        return;
      }
      var complet = PREFIXE + nom;
      if (propre(rapport.applique, complet)) {
        // `accent` et `--kit-accent` dans le même objet : on garde le premier, on dit le second.
        rapport.ignore.push({ cle: nom, code: 'doublon', valeur: texte.slice(0, 24) });
        return;
      }
      rapport.applique[complet] = texte.trim();
    });
    if (Object.keys(rapport.applique).length) {
      rapport.avertissements.push({
        code: 'non-verifie',
        conseil: 'Le formulaire ne calcule pas le contraste : utilisez des valeurs mesurées (générées par le kit de thèmes).'
      });
    }
    return rapport;
  }

  return {
    VERSION: VERSION,
    CLES: CLES,
    PREFIXE: PREFIXE,
    LONGUEUR_MAX: LONGUEUR_MAX,
    MOTIF: MOTIF,
    nomDe: nomDe,
    valeurSure: valeurSure,
    valider: valider
  };
}));

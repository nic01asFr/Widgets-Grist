/* Licence MIT — validation des saisies mobiles d'un FormDef. */
/*
 * saisies-mobiles.js — ce qu'un FormDef peut dire des saisies mobiles, et ce qu'il ne dira jamais.
 *
 * Le schéma `formdef-1.0` ne change pas : `widget` est un texte libre dont un widget inconnu retombe sur celui du type
 * Grist, et `options` accepte toute clé. Ces règles sont donc posées ici, en contrôle de contrat, sans rien casser :
 *
 *   widgets   voix (Text), audio (Attachments), scan (Text), photo (Attachments) ; `geo` pour la position
 *   options   capacite, extraction { consigne, champs }, libelles { valeur: libellé }
 *   jamais    clé d'API, jeton, adresse, nom de modèle, identifiant de document : l'hôte les porte, pas le FormDef
 *
 * Sans dépendance : Node et navigateur (`window.SaisiesMobiles`).
 */
(function (root, factory) {
  'use strict';
  var asNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  if (asNode && typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.SaisiesMobiles = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CAPACITES = ['camera', 'micro', 'position', 'orientation', 'scanner'];

  /** Le type Grist que chaque widget mobile écrit : un widget qui ne l'écrit pas se dégrade mal. */
  var TYPE_DU_WIDGET = { voix: 'Text', audio: 'Attachments', scan: 'Text', photo: 'Attachments' };

  var CLES_INTERDITES = /^(cle|clé|apikey|api[_-]?key|token|jeton|secret|password|motdepasse|mot[_-]?de[_-]?passe|authorization|bearer|url|uri|adresse|endpoint|baseurl|base[_-]?url|modele|model|instance|docid|doc[_-]?id|documentid|document[_-]?id)$/i;

  function estObjet(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function contient(l, v) { return l.indexOf(v) !== -1; }

  function typeBase(t) { return String(t || '').split(':')[0]; }

  /** Un texte qui porte une adresse, un jeton ou une longue chaîne opaque : pas un texte qu'on publie. */
  function porteUnSecret(texte) {
    if (typeof texte !== 'string') return false;
    return /\b[a-z][a-z0-9+.-]*:\/\/\S+/i.test(texte)
      || /\bBearer\s+\S+/i.test(texte)
      || /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*\S+/i.test(texte)
      || /\b[A-Za-z0-9_-]{32,}\b/.test(texte);
  }

  function clesInterditesDans(valeur, chemin, vues) {
    var trouvees = [];
    if (!valeur || typeof valeur !== 'object' || contient(vues, valeur)) return trouvees;
    vues.push(valeur);
    Object.keys(valeur).forEach(function (k) {
      var c = chemin + '.' + k;
      if (!Array.isArray(valeur) && CLES_INTERDITES.test(k)) trouvees.push(c);
      trouvees = trouvees.concat(clesInterditesDans(valeur[k], c, vues));
    });
    return trouvees;
  }

  function validerExtraction(ex, ou, colIds, ecarts, souple) {
    if (!estObjet(ex)) { ecarts.push(ou + ' : un objet est attendu'); return; }
    if (ex.consigne !== undefined) {
      if (typeof ex.consigne !== 'string' || !ex.consigne.trim()) ecarts.push(ou + '.consigne : texte non vide attendu');
      else if (porteUnSecret(ex.consigne)) ecarts.push(ou + '.consigne : la consigne dit quoi chercher, pas où l\'envoyer : ni adresse, ni jeton');
    }
    if (ex.champs !== undefined) {
      if (!Array.isArray(ex.champs)) ecarts.push(ou + '.champs : une liste de colId est attendue');
      else ex.champs.forEach(function (c, i) {
        if (typeof c !== 'string') ecarts.push(ou + '.champs[' + i + '] : colId texte attendu');
        else if (!souple && !contient(colIds, c)) ecarts.push(ou + '.champs[' + i + '] : « ' + c + ' » n\'est pas un champ du formulaire');
      });
    }
    Object.keys(ex).forEach(function (k) {
      if (k !== 'consigne' && k !== 'champs' && !CLES_INTERDITES.test(k)) ecarts.push(ou + '.' + k + ' : propriété inconnue (consigne, champs)');
    });
  }

  /**
   * Contrôle les saisies mobiles d'un FormDef.
   * @param {object} formdef
   * @returns {{conforme:boolean, ecarts:string[]}}
   */
  function validerSaisiesMobiles(formdef) {
    var ecarts = [];
    var f = estObjet(formdef) ? formdef : {};
    var sections = Array.isArray(f.sections) ? f.sections : [];
    var colIds = [];
    sections.forEach(function (s) { (s && Array.isArray(s.fields) ? s.fields : []).forEach(function (c) { if (c && c.colId) colIds.push(c.colId); }); });

    if (f.extraction !== undefined) validerExtraction(f.extraction, 'extraction', colIds, ecarts, false);

    sections.forEach(function (s, si) {
      (s && Array.isArray(s.fields) ? s.fields : []).forEach(function (c, ci) {
        if (!estObjet(c)) return;
        var ou = 'sections[' + si + '].fields[' + ci + '] (' + (c.colId || '?') + ')';
        var options = estObjet(c.options) ? c.options : {};

        if (contient(Object.keys(TYPE_DU_WIDGET), c.widget) && typeBase(c.type) !== TYPE_DU_WIDGET[c.widget]) {
          ecarts.push(ou + ' : le widget « ' + c.widget + ' » écrit une colonne ' + TYPE_DU_WIDGET[c.widget] + ', pas ' + (c.type || 'sans type'));
        }
        if (options.capacite !== undefined && !contient(CAPACITES, options.capacite)) {
          ecarts.push(ou + '.options.capacite : « ' + options.capacite + ' » inconnue (' + CAPACITES.join(', ') + ')');
        }
        if (options.extraction !== undefined) {
          if (c.widget !== 'voix') ecarts.push(ou + '.options.extraction : réservée au widget « voix »');
          validerExtraction(options.extraction, ou + '.options.extraction', colIds, ecarts, false);
        }
        if (options.libelles !== undefined) {
          if (!estObjet(options.libelles)) ecarts.push(ou + '.options.libelles : un objet { valeur: libellé } est attendu');
          else Object.keys(options.libelles).forEach(function (v) {
            if (typeof options.libelles[v] !== 'string' || !options.libelles[v].trim()) ecarts.push(ou + '.options.libelles.' + v + ' : libellé texte non vide attendu');
          });
        }
        // La règle qui compte le plus : aucun secret dans les options d'un champ.
        // `libelles` est exclu de l'analyse : ses clés sont des valeurs de choix, donc des données (« modele », « url »
        // peuvent être de vraies valeurs), pas des noms de propriété.
        var sansLibelles = {};
        Object.keys(options).forEach(function (k) { if (k !== 'libelles') sansLibelles[k] = options[k]; });
        clesInterditesDans(sansLibelles, ou + '.options', []).forEach(function (chemin) {
          ecarts.push(chemin + ' : un FormDef ne porte ni clé, ni jeton, ni adresse, ni nom de modèle');
        });
      });
    });

    if (f.extraction !== undefined) {
      clesInterditesDans(f.extraction, 'extraction', []).forEach(function (chemin) {
        ecarts.push(chemin + ' : un FormDef ne porte ni clé, ni jeton, ni adresse, ni nom de modèle');
      });
    }
    return { conforme: ecarts.length === 0, ecarts: ecarts };
  }

  return { CAPACITES: CAPACITES, TYPE_DU_WIDGET: TYPE_DU_WIDGET, validerSaisiesMobiles: validerSaisiesMobiles, porteUnSecret: porteUnSecret };
}));

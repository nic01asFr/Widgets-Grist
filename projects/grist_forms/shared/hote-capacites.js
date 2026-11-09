/* Licence MIT — contrat d'hôte hote-capacites-0.1. */
/*
 * hote-capacites.js — le contrat que tout hôte de FormDef honore pour offrir micro, caméra, position, scan.
 *
 * Aujourd'hui chaque hôte (page dans Grist, page hors Grist, application) fait ses propres hypothèses. Un contrat
 * unique permet à un futur hôte de se raccorder sans toucher au moteur. Spec : `docs/CADRAGE-ENTREES-MOBILES.md` §5.
 *
 *   FormEngine.monter(el, formdef, { client, hote })
 *
 * Absent = rien : un hôte qui ne passe pas `hote` n'a aucune capacité, tout retombe sur le repli.
 *
 * **Aucun secret dans ce contrat.** Ni clé, ni jeton, ni adresse, ni nom de modèle : ce que la personne a saisi dans
 * les réglages reste chez l'hôte, qui l'a déjà branché dans la fonction `appeler` de chaque service.
 *
 * Sans dépendance : Node et navigateur (`window.HoteCapacites`).
 */
(function (root, factory) {
  'use strict';
  var asNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  if (asNode && typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.HoteCapacites = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CONTRAT = 'hote-capacites-0.1';
  var CAPACITES = ['camera', 'micro', 'position', 'orientation', 'scanner'];
  var SERVICES = ['transcrire', 'extraire'];
  var SORTANTS = ['local', 'tiers'];
  var LIMITES = ['audioSecondes', 'audioOctets', 'photoOctets'];

  /**
   * Noms de clés qu'un contrat public ne porte jamais : clé, jeton, adresse, nom de modèle, identifiant de
   * document. Le FormDef est publié, copié, vendoré, lu par des agents ; l'hôte l'est aussi par ses journaux.
   */
  var CLES_INTERDITES = /^(cle|clé|apikey|api[_-]?key|token|jeton|secret|password|motdepasse|mot[_-]?de[_-]?passe|authorization|bearer|url|uri|adresse|endpoint|baseurl|base[_-]?url|modele|model|instance|docid|doc[_-]?id|documentid|document[_-]?id)$/i;

  function estObjet(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function contient(l, v) { return l.indexOf(v) !== -1; }

  /** Les clés interdites trouvées dans un objet, à n'importe quelle profondeur. Rend les chemins. */
  function clesInterditesDans(valeur, chemin, vues) {
    var trouvees = [];
    vues = vues || [];
    if (!valeur || typeof valeur !== 'object' || contient(vues, valeur)) return trouvees;
    vues.push(valeur);
    var ks = Array.isArray(valeur) ? valeur.map(function (_, i) { return String(i); }) : Object.keys(valeur);
    ks.forEach(function (k) {
      var chemin2 = chemin ? chemin + '.' + k : k;
      if (!Array.isArray(valeur) && CLES_INTERDITES.test(k)) trouvees.push(chemin2);
      trouvees = trouvees.concat(clesInterditesDans(valeur[k], chemin2, vues));
    });
    return trouvees;
  }

  /**
   * Contrôle un objet `hote` contre le contrat.
   * @param {*} hote
   * @returns {{conforme:boolean, ecarts:string[]}} un hôte absent (`undefined`, `null`) est conforme : absent = rien
   */
  function validerHote(hote) {
    var ecarts = [];
    if (hote === undefined || hote === null) return { conforme: true, ecarts: ecarts };
    if (!estObjet(hote)) return { conforme: false, ecarts: ['hote : un objet est attendu'] };

    if (hote.contrat !== CONTRAT) ecarts.push('hote.contrat : « ' + CONTRAT + ' » attendu');
    if (hote.nom !== undefined && typeof hote.nom !== 'string') ecarts.push('hote.nom : texte attendu');

    if (hote.capacites !== undefined) {
      if (!estObjet(hote.capacites)) ecarts.push('hote.capacites : un objet est attendu');
      else Object.keys(hote.capacites).forEach(function (k) {
        if (!contient(CAPACITES, k)) ecarts.push('hote.capacites.' + k + ' : capacité inconnue (' + CAPACITES.join(', ') + ')');
        else if (typeof hote.capacites[k] !== 'boolean') ecarts.push('hote.capacites.' + k + ' : vrai ou faux attendu');
      });
    }

    if (hote.services !== undefined) {
      if (!estObjet(hote.services)) ecarts.push('hote.services : un objet est attendu');
      else Object.keys(hote.services).forEach(function (nom) {
        var s = hote.services[nom];
        var ou = 'hote.services.' + nom;
        if (!contient(SERVICES, nom)) { ecarts.push(ou + ' : service inconnu (' + SERVICES.join(', ') + ')'); return; }
        if (!estObjet(s)) { ecarts.push(ou + ' : un objet est attendu'); return; }
        if (typeof s.appeler !== 'function') ecarts.push(ou + '.appeler : une fonction est attendue');
        if (s.sortant !== undefined && !contient(SORTANTS, s.sortant)) ecarts.push(ou + '.sortant : « local » ou « tiers » attendu');
        if (s.nom !== undefined && typeof s.nom !== 'string') ecarts.push(ou + '.nom : texte attendu (nom d\'hôte du service)');
      });
    }

    if (hote.limites !== undefined) {
      if (!estObjet(hote.limites)) ecarts.push('hote.limites : un objet est attendu');
      else Object.keys(hote.limites).forEach(function (k) {
        if (!contient(LIMITES, k)) ecarts.push('hote.limites.' + k + ' : limite inconnue (' + LIMITES.join(', ') + ')');
        else if (typeof hote.limites[k] !== 'number' || !isFinite(hote.limites[k]) || hote.limites[k] <= 0) ecarts.push('hote.limites.' + k + ' : nombre positif attendu');
      });
    }

    Object.keys(hote).forEach(function (k) {
      if (!contient(['contrat', 'nom', 'capacites', 'services', 'limites'], k) && !CLES_INTERDITES.test(k)) ecarts.push('hote.' + k + ' : propriété inconnue du contrat');
    });

    // Aucun secret, où qu'il soit dans l'objet : c'est la règle qui compte le plus.
    clesInterditesDans(hote, 'hote', []).forEach(function (chemin) {
      ecarts.push(chemin + ' : un contrat d\'hôte ne porte ni clé, ni jeton, ni adresse, ni nom de modèle');
    });

    return { conforme: ecarts.length === 0, ecarts: ecarts };
  }

  /**
   * La part sérialisable d'un hôte : ce qu'on peut journaliser, publier ou donner à un agent. Les fonctions
   * `appeler` disparaissent, les clés interdites aussi ; il reste de quoi savoir ce que l'hôte déclare.
   */
  function declaration(hote) {
    if (!estObjet(hote)) return null;
    var d = { contrat: hote.contrat };
    if (typeof hote.nom === 'string') d.nom = hote.nom;
    if (estObjet(hote.capacites)) {
      d.capacites = {};
      Object.keys(hote.capacites).forEach(function (k) { if (contient(CAPACITES, k) && typeof hote.capacites[k] === 'boolean') d.capacites[k] = hote.capacites[k]; });
    }
    if (estObjet(hote.services)) {
      d.services = {};
      Object.keys(hote.services).forEach(function (nom) {
        var s = hote.services[nom];
        if (!contient(SERVICES, nom) || !estObjet(s)) return;
        d.services[nom] = { sortant: contient(SORTANTS, s.sortant) ? s.sortant : 'tiers' };
        if (typeof s.nom === 'string') d.services[nom].nom = s.nom;
      });
    }
    if (estObjet(hote.limites)) {
      d.limites = {};
      Object.keys(hote.limites).forEach(function (k) { if (contient(LIMITES, k) && typeof hote.limites[k] === 'number') d.limites[k] = hote.limites[k]; });
    }
    return d;
  }

  return {
    CONTRAT: CONTRAT, CAPACITES: CAPACITES, SERVICES: SERVICES, SORTANTS: SORTANTS, LIMITES: LIMITES,
    validerHote: validerHote,
    declaration: declaration,
    clesInterditesDans: clesInterditesDans
  };
}));

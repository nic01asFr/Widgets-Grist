/*
 * activation-geste.js — le geste « appliquer ce thème au document » : tout ce qui se décide AVANT de toucher au document.
 *
 * Ce module ne touche à rien : il prépare et il juge. L'écriture (créer la table, appliquer le lot) est faite par la page, après la
 * confirmation d'une personne. La bascule elle-même vient de `shared/activation.js` (copie de `lotActivation` du kit) : ici on ne
 * réécrit jamais « désactiver l'ancien, activer le nouveau ».
 *
 * Règles tenues (docs/CADRAGE-THEME-GRIST-ET-ACTIVATION.md, B1 à B8) :
 *   - un thème que le validateur refuse n'ouvre AUCUNE action, et on n'offre même pas de créer la table pour lui ;
 *   - la table n'est JAMAIS créée en passant : `etat: 'table-a-creer'` demande une confirmation qui le dit ;
 *   - un seul lot d'actions, jamais de suppression de ligne ; le retrait met `actif` à faux ;
 *   - ce qu'on va remplacer est dit avant, et ce que les lecteurs verront est relu après.
 */
(function (root, factory) {
  'use strict';
  var asNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  if (asNode && typeof module === 'object' && module.exports) {
    module.exports = factory(require('./activation.js'), require('./themedef.js'));
  } else {
    root.FormActivationGeste = factory(root.FormThemeDefActivation, root.FormThemeDef);
  }
}(typeof self !== 'undefined' ? self : this, function (Activation, ThemeDef) {
  'use strict';

  var TABLE = 'Theme_document';

  /** Les colonnes de `Theme_document`, telles que la spécification (§3) les déclare. `maj` est en SECONDES Unix. */
  var COLONNES = [
    { id: 'cle', type: 'Text', label: 'Clé' },
    { id: 'themedef', type: 'Text', label: 'ThemeDef' },
    { id: 'actif', type: 'Bool', label: 'Actif' },
    { id: 'maj', type: 'Numeric', label: 'Mise à jour' },
    { id: 'version', type: 'Text', label: 'Version' },
    { id: 'hash', type: 'Text', label: 'Empreinte' }
  ];

  var CLE = /^[a-z][a-z0-9-]{0,39}$/;

  /** Une clé de ligne valide tirée d'un nom : minuscules, sans accent, tirets ; jamais vide, jamais plus de 40 caractères. */
  function cleDe(texte) {
    var s = String(texte == null ? '' : texte);
    var t = s.normalize ? s.normalize('NFD') : s;
    t = t.replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!t) t = 'theme';
    if (!/^[a-z]/.test(t)) t = 'ds-' + t;
    t = t.slice(0, 40).replace(/-+$/, '');
    return CLE.test(t) ? t : 'theme';
  }

  function nomDe(themedef) {
    if (!themedef || typeof themedef !== 'object') return '';
    return typeof themedef.nom === 'string' ? themedef.nom.slice(0, 80) : '';
  }

  /** Le nom d'un thème lu dans la colonne `themedef` d'une ligne (texte JSON), ou `''`. */
  function nomDeLigne(ligne) {
    try { return nomDe(JSON.parse(ligne.themedef)); } catch (e) { return ''; }
  }

  function resume(ligne) { return { id: ligne.id, cle: ligne.cle, nom: nomDeLigne(ligne) }; }

  var PHRASES_ECARTS = {
    'cle-inconnue': 'une clé que le format ne connaît pas est écartée',
    'resolu-ignore': 'les valeurs « résolues » ne sont pas crues : chaque lecteur les recalcule',
    'police-non-listee': 'une police hors liste est écartée',
    'etat-ignore': 'une couleur d\'état donnée comme graine est écartée'
  };

  function phrasesEcarts(ignore) {
    return (ignore || []).map(function (i) { return (PHRASES_ECARTS[i.code] || ('« ' + i.code + ' » est écarté')) + ' (' + i.chemin + ')'; });
  }

  /**
   * Prépare l'activation d'un thème. Ne touche à rien.
   *
   * @param {{themedef:object, cle?:string, lignes:(Array|null), maintenant:number}} e
   *   `lignes` : les lignes de `Theme_document` avec leur `id`, ou `null` quand la table n'existe pas
   * @returns {{etat:'pret'|'table-a-creer'|'refus', cle:string, nom:string, miseAJour:boolean, remplace:Array, actions:Array,
   *   phrases:string[], avertissements:string[], ecarts:string[]}}
   *   `phrases` : pourquoi c'est refusé ; `remplace` : les thèmes actifs que le lot va désactiver ; `miseAJour` : la clé existe déjà
   */
  function preparer(e) {
    var cle = typeof e.cle === 'string' && e.cle ? e.cle : cleDe(nomDe(e.themedef));
    var lignes = Array.isArray(e.lignes) ? e.lignes : null;
    var opts = { maintenant: e.maintenant, hash: Activation.hashSha256 };
    // Table absente : on juge le thème sur une table vide, pour ne jamais proposer de créer une table pour un thème qui sera refusé.
    var r = Activation.lotActivation(lignes === null ? [] : lignes, { cle: cle, themedef: e.themedef }, opts);
    var base = {
      cle: cle, nom: nomDe(e.themedef),
      miseAJour: !!(lignes && lignes.some(function (l) { return l && l.cle === cle; })),
      remplace: (lignes || []).filter(function (l) { return l && l.actif === true && l.cle !== cle; }).map(resume),
      actions: [],
      phrases: [], avertissements: r.avertissements.map(function (a) { return a.message; }), ecarts: phrasesEcarts(r.ignore)
    };
    if (!r.ok) {
      base.etat = 'refus';
      base.phrases = r.erreurs.map(function (x) { return x.message; });
      return base;
    }
    base.etat = lignes === null ? 'table-a-creer' : 'pret';
    base.actions = r.actions;
    return base;
  }

  /**
   * Le retrait : `actif` à faux sur les lignes actives, dans un seul lot, sans rien supprimer.
   * @returns {{actions:Array, retire:Array}}
   */
  function retrait(lignes) {
    var actives = (Array.isArray(lignes) ? lignes : []).filter(function (l) { return l && l.actif === true && Number.isInteger(l.id) && l.id > 0; });
    return { actions: actives.map(function (l) { return ['UpdateRecord', TABLE, l.id, { actif: false }]; }), retire: actives.map(resume) };
  }

  /**
   * Ce que les lecteurs verront dans la table telle qu'elle est MAINTENANT : la même règle de lecture que tous (une seule ligne active,
   * un document lisible). C'est la relecture qui dit la vérité, pas la réponse d'écriture.
   * @returns {{raison:string, cle:(string|null), nom:string}} `raison` : `applique`, `aucun-actif`, `plusieurs-actifs`, `invalide`
   */
  function relire(lignes) {
    var choix = ThemeDef.choisirActif(lignes);
    if (!choix.ligne) {
      var plusieurs = choix.avertissements.some(function (a) { return a.code === 'plusieurs-actifs'; });
      return { raison: plusieurs ? 'plusieurs-actifs' : 'aucun-actif', cle: null, nom: '' };
    }
    var lu = ThemeDef.lireThemeDef(choix.ligne.themedef);
    if (!lu.ok) return { raison: 'invalide', cle: choix.ligne.cle, nom: '' };
    // Ce que les lecteurs en feront, dans chaque mode : un thème que la table porte mais qu'un lecteur refuse (contraste insuffisant, valeurs mesurées
    // incomplètes, version inconnue) n'est PAS « appliqué ».
    var nom = nomDe(lu.themedef);
    var modes = ['clair', 'sombre'];
    for (var i = 0; i < modes.length; i++) {
      var r = ThemeDef.lireLignes(lignes, { mode: modes[i] });
      if (!r.theme && ['contraste-insuffisant', 'resolu-incomplet', 'version-inconnue'].indexOf(r.raison) !== -1) {
        return { raison: r.raison, cle: choix.ligne.cle, nom: nom, mode: modes[i], avertissements: r.avertissements };
      }
    }
    return { raison: 'applique', cle: choix.ligne.cle, nom: nom };
  }

  return { TABLE: TABLE, COLONNES: COLONNES, cleDe: cleDe, nomDe: nomDe, preparer: preparer, retrait: retrait, relire: relire };
}));

/*
 * theme-visiteur.js — le thème qu'une personne choisit HORS de Grist, et qu'elle garde sur son appareil.
 *
 * Cadrage : docs/CADRAGE-THEME-VISITEUR.md. En deux phrases : dans Grist, le thème est celui du document (table `Theme_document`) et ce
 * module ne sert à rien ; sur le site public (vitrines, démonstrations), il garde UN ThemeDef dans le stockage du navigateur, que les pages
 * de démonstration lisent quand elles l'ont demandé (`?vitrine=1`) et qu'elles ne sont pas dans Grist.
 *
 * > **Un widget en production ne lit jamais cette clé.** Elle est partagée par toute l'origine : tout ce qu'on y met passerait d'un
 * > document à l'autre, d'un widget à l'autre. Les tests transverses (tests/theme-visiteur-transverse.test.js) gardent qui a le droit
 * > de la lire ; ce fichier ne doit entrer dans aucun bundle publié.
 *
 * Le thème est une DONNÉE NON FIABLE : à chaque lecture il repasse par `FormThemeDef.lireThemeDef` (16 Ko, version, #RRGGBB strict,
 * jamais de CSS). Une erreur de stockage ne casse rien : on garde le thème en mémoire, et `persiste: false` le dit.
 */
(function (root, factory) {
  'use strict';
  var asNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  if (asNode && typeof module === 'object' && module.exports) {
    module.exports = factory(require('./themedef.js'));
  } else {
    root.FormThemeVisiteur = factory(root.FormThemeDef);
  }
}(typeof self !== 'undefined' ? self : this, function (ThemeDef) {
  'use strict';

  /** La clé unique, préfixée par le nom du dépôt : l'origine est partagée avec tout le reste. */
  var CLE = 'widgets-grist:theme-visiteur';
  var VERSION = 1;
  var TAILLE_MAX = 16384;

  /** Ce qui reste en mémoire quand le stockage refuse (ou n'existe pas) : le temps de la page seulement. */
  var memoire = null;
  /** Vrai quand la dernière écriture n'a pas atteint le stockage : seule la mémoire détient alors le thème. */
  var memoireSeule = false;

  function stockageDe(opts) {
    if (opts && Object.prototype.hasOwnProperty.call(opts, 'stockage')) return opts.stockage;
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
  }

  // Ce que le visiteur peut garder : les clés du ThemeDef 1.0, et rien d'autre. Surtout PAS `resolu` : le lecteur en applique les valeurs sans les mesurer,
  // et un `resolu` fabriqué (texte blanc sur fond blanc) donnerait une page illisible. Un thème du visiteur se recalcule toujours depuis ses graines.
  var CLES_RACINE = ['version', 'nom', 'graines', 'police', 'modes', 'surcharges', 'exigences'];
  var CLES_GRAINES = ['principal', 'secondaire', 'encre', 'fond'];

  function soigner(td) {
    var net = {};
    CLES_RACINE.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(td, k)) net[k] = td[k]; });
    if (net.graines && typeof net.graines === 'object' && !Array.isArray(net.graines)) {
      var g = {};
      CLES_GRAINES.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(net.graines, k)) g[k] = net.graines[k]; });
      net.graines = g;
    }
    return net;
  }

  /** Juge un ThemeDef : accepté, nettoyé des clés que le format ne connaît pas, ou refusé avec la raison de `lireThemeDef`. */
  function valider(themedef) {
    var texte;
    try { texte = typeof themedef === 'string' ? themedef : JSON.stringify(themedef); } catch (e) { return { ok: false, erreur: 'type' }; }
    if (typeof texte !== 'string') return { ok: false, erreur: 'type' };
    var lu = ThemeDef.lireThemeDef(texte);
    return lu.ok ? { ok: true, themedef: soigner(lu.themedef) } : { ok: false, erreur: lu.erreur };
  }

  /**
   * Garde ce thème pour le visiteur. Un thème refusé n'écrit RIEN et n'efface pas le précédent.
   * @returns {{ok:boolean, persiste?:boolean, erreur?:string}} `persiste` : faux quand seul le temps de la page est couvert
   */
  function ecrire(themedef, opts) {
    opts = opts || {};
    var v = valider(themedef);
    if (!v.ok) return { ok: false, erreur: v.erreur };
    var maintenant = typeof opts.maintenant === 'number' ? opts.maintenant : Date.now();
    // Les six variables de la vitrine, DÉJÀ calculées pour chaque mode : une page de vitrine les applique sans embarquer le lecteur de thème. C'est un cache : la page
    // qui le lit le revalide (couleurs strictes, lisibilité), elle ne le croit pas.
    var contenu = { v: VERSION, themedef: v.themedef, maj: Math.floor(maintenant / 1000), vitrine: vitrineDe(v.themedef) };
    memoire = contenu;
    var s = stockageDe(opts);
    memoireSeule = true;
    if (!s) return { ok: true, persiste: false };
    try { s.setItem(CLE, JSON.stringify(contenu)); memoireSeule = false; return { ok: true, persiste: true }; } catch (e) { return { ok: true, persiste: false }; }
  }

  /** Ce que la clé contient, relu et revalidé : `{ themedef, maj, source }`, ou `null` (absent, illisible, d'une autre version). */
  function lire(opts) {
    var d = diagnostic(opts);
    return d.themedef ? { themedef: d.themedef, maj: d.maj, source: d.source } : null;
  }

  /** Comme `lire`, mais dit pourquoi : `etat` vaut `ok`, `memoire`, `absent`, `illisible`, `version` ou `theme-refuse`. */
  function diagnostic(opts) {
    var s = stockageDe(opts);
    var brut = null;
    if (s) { try { brut = s.getItem(CLE); } catch (e) { brut = null; } }
    if (brut === null || brut === undefined) {
      if (memoire && memoireSeule) {
        var m = valider(memoire.themedef);
        if (m.ok) return { etat: 'memoire', themedef: m.themedef, maj: memoire.maj, source: 'memoire' };
      }
      return { etat: 'absent', themedef: null };
    }
    if (typeof brut !== 'string' || brut.length > TAILLE_MAX + 512) return { etat: 'illisible', themedef: null };
    var c;
    try { c = JSON.parse(brut); } catch (e) { return { etat: 'illisible', themedef: null }; }
    if (!c || typeof c !== 'object' || Array.isArray(c)) return { etat: 'illisible', themedef: null };
    if (c.v !== VERSION) return { etat: 'version', themedef: null };
    var v = valider(c.themedef);
    if (!v.ok) return { etat: 'theme-refuse', erreur: v.erreur, themedef: null };
    return { etat: 'ok', themedef: v.themedef, maj: typeof c.maj === 'number' ? c.maj : 0, source: 'stockage' };
  }

  /** Oublie le thème du visiteur : le stockage et la mémoire. Jamais d'erreur. */
  function effacer(opts) {
    memoire = null;
    memoireSeule = false;
    var s = stockageDe(opts);
    if (!s) return;
    try { s.removeItem(CLE); } catch (e) { /* rien à faire */ }
  }

  /** Pour les tests : oublie seulement la mémoire de la page. */
  function oublierMemoire() { memoire = null; memoireSeule = false; }

  /**
   * L'étage « visiteur » a-t-il le droit de s'appliquer dans cette page ? Seulement si la page l'a demandé (`?vitrine=1`) ET si elle n'est PAS
   * dans Grist (`access=` / `readonly=` dans l'adresse d'un widget Grist ; `data-grist-widget` posé par `grist-plugin-api.js`).
   */
  function actif(fenetre) {
    try {
      if (!fenetre || !fenetre.location) return false;
      var params = new URLSearchParams(fenetre.location.search || '');
      if (params.get('vitrine') !== '1') return false;
      if (params.has('access') || params.has('readonly')) return false;
      var racine = fenetre.document && fenetre.document.documentElement;
      if (racine && typeof racine.hasAttribute === 'function' && racine.hasAttribute('data-grist-widget')) return false;
      return true;
    } catch (e) { return false; }
  }

  // Les sept variables d'une page de vitrine, tirées des variables `--kit-*` du thème. `--accent` est l'ACTION du ThemeDef (la couleur principale que la personne a
  // choisie), pas son `accent` (dérivé de la couleur secondaire). La vitrine s'en sert comme couleur de texte (liens, rubriques) ET comme fond de bouton : on la redresse
  // à 4,5:1 sur le papier et la surface (voir `varsVitrine`). `--sur-accent` est le texte de ces boutons : la feuille de la vitrine l'écrivait en blanc, en dur, illisible
  // sur un accent clair en sombre.
  var PONT_VITRINE = {
    '--papier': '--kit-fond',
    '--surface': '--kit-surface',
    '--encre': '--kit-texte',
    '--plume': '--kit-texte-2',
    '--filet': '--kit-bord',
    '--accent': '--kit-accent',
    '--sur-accent': '--kit-accent-texte'
  };
  var HEX = /^#[0-9a-f]{6}$/;

  /**
   * Les six variables d'une page de vitrine pour ce thème et ce mode (`clair` ou `sombre`), ou `null` si le thème n'est pas lisible.
   * Les valeurs sont celles que le lecteur de thème rend (déjà redressées si le texte ou l'action était illisible) : jamais une couleur brute.
   */
  function varsVitrine(themedef, mode) {
    var v = valider(themedef);
    if (!v.ok) return null;
    var r = ThemeDef.resoudre(v.themedef, mode === 'sombre' ? 'sombre' : 'clair');
    var sortie = {};
    var noms = Object.keys(PONT_VITRINE);
    for (var i = 0; i < noms.length; i++) {
      var valeur = r.vars[PONT_VITRINE[noms[i]]];
      if (typeof valeur !== 'string' || !HEX.test(valeur)) return null;
      sortie[noms[i]] = valeur;
    }
    // Une page de vitrine se LIT : le texte courant (`--plume`, utilisé partout) et l'accent (texte ET fond de bouton) tiennent 4,5:1 sur le papier et sur la
    // surface. On redresse ce qui peut l'être (vers le noir sur un papier clair, vers le blanc sur un papier sombre), puis on recalcule le texte du bouton.
    var papier = sortie['--papier']; var surface = sortie['--surface'];
    var papierClair = ThemeDef.contraste(papier, '#ffffff') < ThemeDef.contraste(papier, '#000000');
    var vers = papierClair ? '#000000' : '#ffffff';
    ['--plume', '--accent'].forEach(function (nom) {
      sortie[nom] = ThemeDef.redresser(ThemeDef.redresser(sortie[nom], papier, 4.5, vers), surface, 4.5, vers);
    });
    sortie['--sur-accent'] = ThemeDef.meilleurTexte(sortie['--accent']);
    // Ce qui ne peut pas être redressé (surcharges hostiles) fait refuser le thème : la page garde sa peau.
    if (!(ThemeDef.contraste(sortie['--encre'], papier) >= 4.5)) return null;
    if (!(ThemeDef.contraste(sortie['--plume'], papier) >= 4.5)) return null;
    if (!(ThemeDef.contraste(sortie['--accent'], papier) >= 4.5) || !(ThemeDef.contraste(sortie['--accent'], surface) >= 4.5)) return null;
    if (!(ThemeDef.contraste(sortie['--sur-accent'], sortie['--accent']) >= 4.5)) return null;
    return sortie;
  }

  /** Les sept variables pour chaque mode : `{ clair, sombre }`, chacun un jeu complet ou `null` (thème illisible pour ce mode, ou sombre « aucun »). */
  function vitrineDe(themedef) {
    var modes = themedef && themedef.modes;
    var sansSombre = modes && typeof modes === 'object' && modes.sombre === 'aucun';
    return { clair: varsVitrine(themedef, 'clair'), sombre: sansSombre ? null : varsVitrine(themedef, 'sombre') };
  }

  function slug(texte) {
    var s = String(texte || '').normalize ? String(texte || '').normalize('NFD') : String(texte || '');
    s = s.replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
    return s || 'theme';
  }

  /** Le thème en fichier à télécharger : le texte est relu par n'importe quel lecteur ThemeDef 1.0. */
  function exporter(themedef) {
    var v = valider(themedef);
    if (!v.ok) return null;
    return { nom: slug(v.themedef.nom) + '.themedef.json', texte: JSON.stringify(v.themedef, null, 2) + '\n' };
  }

  return {
    CLE: CLE,
    VERSION: VERSION,
    TAILLE_MAX: TAILLE_MAX,
    PONT_VITRINE: PONT_VITRINE,
    valider: valider,
    ecrire: ecrire,
    lire: lire,
    diagnostic: diagnostic,
    effacer: effacer,
    actif: actif,
    varsVitrine: varsVitrine,
    vitrineDe: vitrineDe,
    exporter: exporter,
    oublierMemoire: oublierMemoire
  };
}));

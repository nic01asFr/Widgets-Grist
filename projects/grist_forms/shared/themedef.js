/*
 * themedef.js — lire le thème d'un document Grist (ThemeDef 1.0) et en habiller un widget.
 *
 * Le moteur de formulaire ne lit jamais un ThemeDef (docs/THEMEDEF-SPEC.md, §1) : c'est l'HÔTE qui le lit, le résout, puis pose
 * les variables `--kit-*` (étage A, `kit-theme/0.1`). Ce module est cet hôte-là, pour tout widget de Form Builder :
 *
 *   1. LIRE  la table `Theme_document` du document, selon la règle de lecture du §3 (la même que celle d'Atlas) ;
 *   2. RÉSOUDRE le ThemeDef de la ligne active, pour un mode : les valeurs mesurées du `resolu` quand il y en a (appliquées sans
 *      être crues), sinon dérivées des graines (un aperçu, voir `deriver`) ; les surcharges viennent après ;
 *   3. POSER  les variables sur la page (jamais écrire : ce module ne crée ni ne modifie aucune table).
 *
 * > **Un lecteur ne croit jamais ce qu'il lit.** La table est une donnée non fiable : taille, version, profondeur, clés
 * > interdites et valeurs sont vérifiées à CHAQUE lecture. Un document invalide n'applique rien et dit pourquoi ; une table
 * > absente, vide, ou sans ligne active ne dit rien du tout (le rendu d'origine reste). La personne passe avant le thème :
 * > sous `forced-colors` ou `prefers-contrast: more`, rien n'est posé.
 */
(function (root, factory) {
  'use strict';
  var asNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  if (asNode && typeof module === 'object' && module.exports) {
    module.exports = factory(require('./theme.js'), require('./theme-instance.js'), require('./derivation-valeurs.js'));
  } else if (typeof define === 'function' && define.amd) {
    define(['./theme', './theme-instance', './derivation-valeurs'], factory);
  } else {
    root.FormThemeDef = factory(root.FormTheme, root.FormThemeInstance, root.FormThemeDerivation);
  }
}(typeof self !== 'undefined' ? self : this, function (Theme, Instance, Derivation) {
  'use strict';

  var VERSION = 'themedef-1.0';
  var TABLE = 'Theme_document';
  var TAILLE_MAX = 16384;
  var PROFONDEUR_MAX = 6;
  var LIGNES_MAX = 50;
  var ATTENTE_HOTE = 400;
  var CLE_LIGNE = /^[a-z][a-z0-9-]{0,39}$/;
  var HEX = /^#[0-9a-fA-F]{6}$/;
  var CLES = ['fond', 'surface', 'surface-2', 'texte', 'texte-2', 'bord', 'bord-champ', 'accent', 'accent-texte', 'accent-fond',
    'action', 'action-texte', 'action-survol', 'action-actif', 'focus', 'ok', 'ok-fond', 'attention', 'attention-fond', 'attention-filet',
    'alerte', 'alerte-fond', 'info', 'info-fond', 'papier', 'ombre'];

  function propre(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function lire(doc, chemin) {
    var c = doc;
    for (var i = 0; i < chemin.length; i++) {
      if (!c || typeof c !== 'object' || !propre(c, chemin[i])) return undefined;
      c = c[chemin[i]];
    }
    return c;
  }

  // ── Couleurs ────────────────────────────────────────────────────────────────

  function rgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hexDe(c) {
    return '#' + c.map(function (v) { var s = Math.max(0, Math.min(255, Math.round(v))).toString(16); return s.length < 2 ? '0' + s : s; }).join('');
  }
  function couleurSure(v) { return typeof v === 'string' && HEX.test(v.trim()) ? v.trim().toLowerCase() : ''; }
  /** `t` de b dans a : 0 donne a, 1 donne b. */
  function melanger(a, b, t) {
    var x = rgb(a); var y = rgb(b);
    return hexDe([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
  }
  function luminance(h) {
    var c = rgb(h);
    function lin(v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  }
  /** Le contraste WCAG de deux couleurs #RRGGBB, ou `null` si l'une n'en est pas une. */
  function contraste(a, b) {
    if (!couleurSure(a) || !couleurSure(b)) return null;
    var x = luminance(a); var y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function rapport(a, b) { return contraste(a, b) || 1; }
  /** Rapproche `couleur` de `vers` (noir ou blanc) jusqu'à `seuil`:1 sur `fond`. */
  function redresser(couleur, fond, seuil, vers) {
    var c = couleur;
    for (var i = 0; i < 24 && rapport(c, fond) < seuil; i++) c = melanger(c, vers, 0.12);
    return c;
  }
  function meilleurTexte(sur) { return rapport('#ffffff', sur) >= rapport('#161616', sur) ? '#ffffff' : '#161616'; }
  function clair(h) { return rapport(h, '#ffffff') < rapport(h, '#000000'); }

  var ETATS = { ok: ['succes', '#18753c'], attention: ['attention', '#b34000'], alerte: ['erreur', '#ce0500'], info: ['information', '#0063cb'] };

  /**
   * Les 26 variables d'un thème, tirées de graines — un APERÇU.
   *
   * Le compilateur du kit reste seul juge d'un thème ; ceci en donne une lecture assez fidèle pour habiller un widget avec les
   * couleurs choisies. Les couleurs choisies sont gardées ; seul ce qui rendrait le texte, le bouton ou un titre illisible
   * (sous 3:1) est redressé — et dit dans `remarques`.
   *
   * @param {object} e `{ principal, secondaire, encre, fond, etats, sombre, sombreCouleurs }`
   * @param {string} mode `clair` ou `sombre`
   * @returns {{vars:Object<string,string>, remarques:string[]}} `vars` : nom court (`action`) → valeur (#rrggbb, ou rgba pour `ombre`)
   */
  function deriver(e, mode) {
    e = e || {};
    var sombre = mode === 'sombre';
    var explicite = e.sombre === 'explicite';
    var s = e.sombreCouleurs || {};
    var remarques = [];

    var principal = couleurSure(e.principal) || '#3d4f63';
    var secondaire = couleurSure(e.secondaire);
    var encre = couleurSure(e.encre);
    var fond = couleurSure(e.fond);
    if (sombre) {
      if (explicite) {
        principal = couleurSure(s.principal) || principal;
        encre = couleurSure(s.encre) || '#f6f6f6';
        fond = couleurSure(s.fond) || '#161616';
      } else {
        encre = '#f6f6f6';
        fond = '#161616';
      }
    } else {
      fond = fond || '#f6f6f6';
    }
    var surface = sombre ? melanger(fond, '#ffffff', 0.06) : (clair(fond) ? '#ffffff' : melanger(fond, '#ffffff', 0.08));
    // Le sens du redressement suit la teinte du fond (un fond noir en mode clair existe) : vers le noir sur du clair, vers le blanc sur du sombre.
    var vers = clair(surface) ? '#000000' : '#ffffff';
    var sur = meilleurTexte(surface);
    var texte = encre || sur;
    if (rapport(texte, surface) < 3) {
      remarques.push('Le texte est trop proche du fond (' + (Math.round(rapport(texte, surface) * 100) / 100) + ':1) : l’aperçu le redresse pour rester lisible.');
      texte = sur;
    }
    var texte2 = melanger(texte, surface, 0.3);
    if (rapport(texte2, surface) < 4.5) texte2 = texte;

    var action = principal;
    if (sombre && !explicite) action = redresser(principal, surface, 4.5, '#ffffff');
    if (rapport(action, surface) < 3) {
      remarques.push('La couleur principale est trop proche du fond pour un bouton : l’aperçu l’assombrit (ou l’éclaircit) pour rester visible.');
      action = redresser(action, surface, 3, vers);
    }
    var accent = secondaire || action;
    if (rapport(accent, surface) < 3) {
      remarques.push('La couleur secondaire est trop proche du fond pour des titres : l’aperçu la fonce pour rester lisible.');
      accent = redresser(accent, surface, 3, vers);
    }
    var vars = {
      'fond': fond, 'surface': surface, 'surface-2': melanger(fond, texte, 0.06),
      'texte': texte, 'texte-2': texte2,
      'bord': melanger(surface, texte, 0.2), 'bord-champ': redresser(melanger(surface, texte, 0.3), surface, 3, texte),
      'accent': accent, 'accent-texte': meilleurTexte(accent), 'accent-fond': melanger(surface, accent, 0.12),
      'action': action, 'action-texte': meilleurTexte(action),
      'action-survol': melanger(action, vers, 0.14), 'action-actif': melanger(action, vers, 0.26),
      'focus': rapport(action, surface) >= 3 ? action : texte,
      'papier': '#ffffff', 'ombre': 'rgba(0, 0, 0, 0.25)'
    };
    var etats = e.etats || {};
    Object.keys(ETATS).forEach(function (cle) {
      var base = couleurSure(etats[ETATS[cle][0]]) || ETATS[cle][1];
      if (rapport(base, surface) < 4.5) base = redresser(base, surface, 4.5, vers);
      vars[cle] = base;
      vars[cle + '-fond'] = melanger(surface, base, sombre ? 0.2 : 0.12);
    });
    vars['attention-filet'] = vars.attention;
    return { vars: vars, remarques: remarques };
  }

  // ── Lire la table ───────────────────────────────────────────────────────────

  /** La taille en octets UTF-8, pas en caractères : « é » en pèse deux. */
  function octets(texte) {
    try { return new TextEncoder().encode(texte).length; } catch (e) { return texte.length; }
  }

  /**
   * La forme d'un document : le niveau 1 est la racine, et CHAQUE valeur compte un niveau, feuilles comprises (comme Atlas) ; un
   * document qui passe le sixième niveau est refusé. Une clé `__proto__`, `constructor` ou `prototype` aussi, où qu'elle soit.
   *
   * @returns {string|null} `profondeur`, `cle-interdite`, ou rien
   */
  function defautDeForme(v, niveau) {
    if (niveau > PROFONDEUR_MAX) return 'profondeur';
    if (v === null || typeof v !== 'object') return null;
    var cles = Object.keys(v);
    for (var i = 0; i < cles.length; i++) {
      if (!Array.isArray(v) && (cles[i] === '__proto__' || cles[i] === 'constructor' || cles[i] === 'prototype')) return 'cle-interdite';
      var d = defautDeForme(v[cles[i]], niveau + 1);
      if (d) return d;
    }
    return null;
  }

  function objetSimple(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  /**
   * Un ThemeDef lu comme une donnée non fiable.
   *
   * @param {string|object} contenu le texte JSON de la colonne `themedef`, ou l'objet déjà lu
   * Refus (le document n'applique rien) : `trop-gros` (16 Ko en octets), `json`, `type`, `profondeur`, `cle-interdite`, `version`, `section`
   * (graines, modes, surcharges ou exigences qui n'est pas un objet), `principal` (absent ou pas #RRGGBB), `sombre` (hors liste),
   * `explicite-incomplet` (mode sombre explicite sans ses 26 valeurs), `exigence` (un seuil plus lâche que 4,5 ou 3). Le reste (clé
   * inconnue, surcharge refusée, police hors liste, graine facultative mal écrite, `resolu`) s'écarte sans refuser le document.
   *
   * @returns {{ok:boolean, themedef?:object, erreur?:string}}
   */
  function lireThemeDef(contenu) {
    var td = contenu;
    if (typeof contenu === 'string') {
      if (octets(contenu) > TAILLE_MAX) return { ok: false, erreur: 'trop-gros' };
      try { td = JSON.parse(contenu); } catch (e) { return { ok: false, erreur: 'json' }; }
    }
    if (!td || typeof td !== 'object' || Array.isArray(td)) return { ok: false, erreur: 'type' };
    var texte;
    try { texte = JSON.stringify(td); } catch (e2) { return { ok: false, erreur: 'json' }; }
    if (octets(texte) > TAILLE_MAX) return { ok: false, erreur: 'trop-gros' };
    var defaut = defautDeForme(td, 1);
    if (defaut) return { ok: false, erreur: defaut };
    if (td.version !== VERSION) return { ok: false, erreur: 'version' };
    var sections = ['graines', 'modes', 'surcharges', 'exigences'];
    for (var i = 0; i < sections.length; i++) {
      if (propre(td, sections[i]) && !objetSimple(td[sections[i]])) return { ok: false, erreur: 'section' };
    }
    var principal = lire(td, ['graines', 'principal']);
    if (typeof principal !== 'string' || !HEX.test(principal)) return { ok: false, erreur: 'principal' };
    // Les deux jeux de surcharges, quand ils sont dits, sont des objets (un tableau, ou `null`, est refusé).
    var jeux = td.surcharges || {};
    var modesJeux = ['clair', 'sombre'];
    for (var j = 0; j < modesJeux.length; j++) {
      if (propre(jeux, modesJeux[j]) && !objetSimple(jeux[modesJeux[j]])) return { ok: false, erreur: 'section' };
    }
    var sombre = lire(td, ['modes', 'sombre']);
    if (sombre !== undefined && ['aucun', 'derive', 'explicite'].indexOf(sombre) === -1) return { ok: false, erreur: 'sombre' };
    if (sombre === 'explicite') {
      var s = lire(td, ['surcharges', 'sombre']);
      // Complet : les 26 valeurs, chacune admise (une valeur refusée manque autant qu'une valeur absente).
      var complet = objetSimple(s) && Object.keys(juger(s)).length === CLES.length;
      if (!complet) return { ok: false, erreur: 'explicite-incomplet' };
    }
    var ex = td.exigences || {};
    if (propre(ex, 'contrasteTexte') && !(typeof ex.contrasteTexte === 'number' && ex.contrasteTexte >= 4.5)) return { ok: false, erreur: 'exigence' };
    if (propre(ex, 'contrasteComposant') && !(typeof ex.contrasteComposant === 'number' && ex.contrasteComposant >= 3)) return { ok: false, erreur: 'exigence' };
    return { ok: true, themedef: td };
  }

  /** La table en colonnes (`fetchTable`) → des lignes. */
  function lignesDeTable(colonnes) {
    if (!colonnes || typeof colonnes !== 'object' || Array.isArray(colonnes)) return [];
    // Une colonne qui n'est pas un tableau (un texte, un nombre) est ignorée ; la table a la longueur de la plus longue des colonnes qu'on lit.
    var noms = Object.keys(colonnes).filter(function (k) { return Array.isArray(colonnes[k]); });
    var n = 0;
    ['id', 'cle', 'themedef', 'actif'].forEach(function (k) { if (Array.isArray(colonnes[k]) && colonnes[k].length > n) n = colonnes[k].length; });
    var out = [];
    for (var i = 0; i < n && i < LIGNES_MAX; i++) {
      var l = {};
      noms.forEach(function (k) { l[k] = colonnes[k][i]; });
      out.push(l);
    }
    return out;
  }

  /**
   * La ligne active : au plus UNE, `actif` strictement vrai, clé conforme. Plusieurs lignes actives : rien n'est appliqué et
   * l'avertissement `plusieurs-actifs` est émis. Aucune : rien, sans bruit.
   *
   * @returns {{ligne:object|null, avertissements:Array}}
   */
  function choisirActif(lignes) {
    var toutes = Array.isArray(lignes) ? lignes : [];
    var avertissements = [];
    // Au-delà de cinquante lignes, les suivantes ne sont pas examinées, et on le dit.
    if (toutes.length > LIGNES_MAX) avertissements.push({ code: 'lignes-ignorees', nombre: toutes.length - LIGNES_MAX });
    var actifs = toutes.slice(0, LIGNES_MAX).filter(function (l) {
      return l && l.actif === true && typeof l.cle === 'string' && CLE_LIGNE.test(l.cle);
    });
    if (actifs.length > 1) {
      avertissements.push({ code: 'plusieurs-actifs', nombre: actifs.length, conseil: 'Plusieurs thèmes sont actifs dans ce document : aucun n’est appliqué.' });
      return { ligne: null, avertissements: avertissements };
    }
    return { ligne: actifs[0] || null, avertissements: avertissements };
  }

  // ── Résoudre et poser ───────────────────────────────────────────────────────

  function juger(vars) {
    // Une valeur de l'étage A s'écrit sans espace autour (le juge du moteur, lui, les retirait) : « #fff » avec un espace est refusée.
    var nets = {};
    Object.keys(vars).forEach(function (k) { if (typeof vars[k] !== 'string' || vars[k] === vars[k].trim()) nets[k] = vars[k]; });
    vars = nets;
    if (Theme && typeof Theme.valider === 'function') return Theme.valider(vars).applique;
    var out = {};
    Object.keys(vars).forEach(function (k) {
      var nom = k.indexOf('--kit-') === 0 ? k.slice(6) : k;
      if (CLES.indexOf(nom) !== -1 && couleurSure(vars[k])) out['--kit-' + nom] = couleurSure(vars[k]);
    });
    return out;
  }

  /** Les modes qu'un ThemeDef propose : le clair, et le sombre sauf s'il dit « aucun ». */
  function modesDe(td) {
    return lire(td, ['modes', 'sombre']) === 'aucun' ? ['clair'] : ['clair', 'sombre'];
  }

  /**
   * Un ThemeDef résolu pour un mode.
   *
   * Les valeurs mesurées de `resolu` s'appliquent quand elles y sont (sans être crues : le résultat reste `verifie: false`) ;
   * sinon les graines en donnent un aperçu. Les surcharges du mode, un sous-ensemble des 26 clés, passent en dernier.
   *
   * @returns {{mode:string, source:'resolu'|'graines', vars:Object<string,string>, remarques:string[], verifie:false}} `vars` : `--kit-*` → valeur
   */
  /**
   * Les 22 paires que le kit mesure sur un `resolu` (docs/THEMEDEF-SPEC.md §5, arbitrage du 01/11/2026) : [premier plan, arrière-plan].
   * Le seuil se choisit selon le PREMIER PLAN : `bord-champ`, `focus` et `attention-filet` prennent le seuil des composants (3:1), toutes
   * les autres paires celui du texte (4,5:1). `bord` est décoratif : dans aucune paire. Un test compare cette liste à celle du kit.
   */
  var PAIRES = [
    ['texte', 'fond'], ['texte', 'surface'], ['texte-2', 'fond'], ['texte-2', 'surface'], ['accent', 'fond'], ['accent', 'surface'],
    ['accent-texte', 'accent'], ['action-texte', 'action'], ['action-texte', 'action-survol'], ['action-texte', 'action-actif'],
    ['bord-champ', 'surface'], ['focus', 'fond'], ['focus', 'surface'],
    ['ok', 'ok-fond'], ['ok', 'surface'], ['attention', 'attention-fond'], ['attention', 'surface'],
    ['alerte', 'alerte-fond'], ['alerte', 'surface'], ['info', 'info-fond'], ['info', 'surface'],
    ['attention-filet', 'surface']
  ];
  var PREMIERS_PLANS_COMPOSANT = ['bord-champ', 'focus', 'attention-filet'];

  /** Les seuils d'un document : ses exigences renforcent chaque famille, jamais elles ne la relâchent. */
  function seuilsDe(td) {
    var e = lire(td, ['exigences']);
    e = e && typeof e === 'object' && !Array.isArray(e) ? e : {};
    return {
      texte: typeof e.contrasteTexte === 'number' && e.contrasteTexte > 4.5 ? e.contrasteTexte : 4.5,
      composant: typeof e.contrasteComposant === 'number' && e.contrasteComposant > 3 ? e.contrasteComposant : 3
    };
  }

  var MOTIF_HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  var MOTIF_FONCTION = /^(rgb|hsl)\(\s*([^)]*?)\s*\)$/;
  var MOTIF_NOMBRE = /^[0-9]+(?:\.[0-9]+)?%?$/;

  function depuisHsl(h, sat, lum) {
    var a = sat * Math.min(lum, 1 - lum);
    function k(n) { return (n + h / 30) % 12; }
    return [0, 8, 4].map(function (n) { return Math.round((lum - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))) * 255); });
  }

  /**
   * [r, g, b] (0 à 255) d'une couleur OPAQUE, comme le lecteur du kit la mesure : #RGB, #RRGGBB, rgb() ou hsl() à trois nombres (pourcentages admis,
   * saturation et clarté écrêtées à 100 %, canaux entiers) ; `null` pour le reste (var(), transparence, 4 ou 8 chiffres) : une valeur qu'on ne sait pas
   * mesurer ne fait jamais échouer une paire.
   */
  function rvb(valeur) {
    if (typeof valeur !== 'string') return null;
    var h = MOTIF_HEX.exec(valeur);
    if (h) {
      var six = h[1].length === 3 ? h[1].split('').map(function (c) { return c + c; }).join('') : h[1];
      return [0, 2, 4].map(function (i) { return parseInt(six.slice(i, i + 2), 16); });
    }
    var f = MOTIF_FONCTION.exec(valeur);
    if (!f) return null;
    var t = f[2].split(/[\s,]+/);
    if (t.length !== 3 || !t.every(function (x) { return MOTIF_NOMBRE.test(x); })) return null;
    var n = t.map(parseFloat);
    if (f[1] === 'rgb') return t.map(function (x, i) { return Math.min(255, Math.round(x.charAt(x.length - 1) === '%' ? n[i] * 2.55 : n[i])); });
    return depuisHsl(n[0], Math.min(1, n[1] / 100), Math.min(1, n[2] / 100));
  }

  function contrasteRvb(a, b) {
    function lum(c) {
      var l = c.map(function (v) { var x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
      return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
    }
    var la = lum(a); var lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  /** Mesure les 22 paires sur des valeurs courtes (`texte`, `fond`…). Rend les paires qui échouent, avec la mesure TRONQUÉE à deux décimales. */
  function mesurerPaires(valeurs, seuils) {
    var echecs = [];
    PAIRES.forEach(function (p) {
      var a = rvb(valeurs[p[0]]); var b = rvb(valeurs[p[1]]);
      if (!a || !b) return;
      var seuil = PREMIERS_PLANS_COMPOSANT.indexOf(p[0]) !== -1 ? seuils.composant : seuils.texte;
      var c = contrasteRvb(a, b);
      if (c < seuil) echecs.push({ paire: p[0] + '-sur-' + p[1], mesure: Math.floor(c * 100) / 100, seuil: seuil });
    });
    return echecs;
  }

  function refuse(code, echecs, chemin) { return { code: code, echecs: echecs || [], chemin: chemin }; }

  function resoudre(td, mode) {
    var dispo = modesDe(td);
    var m = mode === 'sombre' && dispo.indexOf('sombre') !== -1 ? 'sombre' : 'clair';
    var remarques = [];
    var source = 'graines';
    var brut;
    // En sombre « explicite », les surcharges font la base et le resolu n'est pas consulté.
    var explicite = m === 'sombre' && lire(td, ['modes', 'sombre']) === 'explicite';
    var mesure = explicite ? null : lire(td, ['resolu', 'modes', m, 'valeurs']);
    var chemin = '/resolu/modes/' + m + '/valeurs';
    var seuils = seuilsDe(td);
    if (mesure && typeof mesure === 'object' && !Array.isArray(mesure)) {
      brut = {};
      Object.keys(mesure).forEach(function (k) { brut[k] = mesure[k]; });
      source = 'resolu';
      // Un resolu ne fait pas foi : il doit être COMPLET (les 26 valeurs, toutes lisibles) et tenir les 22 paires. Sinon le thème est refusé en entier :
      // jamais d'application partielle, jamais de retour sur les graines (un document incohérent n'est pas réparé en silence).
      var lisibles = Object.keys(juger(Object.assign({}, brut))).length;
      if (lisibles < CLES.length) return { mode: m, source: source, vars: {}, remarques: [], verifie: false, refus: refuse('resolu-incomplet', [], chemin) };
      var avant = mesurerPaires(brut, seuils);
      if (avant.length) return { mode: m, source: source, vars: {}, remarques: [], verifie: false, refus: refuse('contraste-insuffisant', avant, chemin) };
    } else {
      var g = td.graines || {};
      if (Derivation && !explicite) {
        // La dérivation du KIT (copie mécanique) : exactement les valeurs du compilateur, et ses portes d'interface. Un thème qu'elle refuse est refusé en entier.
        var k = Derivation.deriverValeurs({ principal: g.principal, secondaire: g.secondaire, encre: g.encre, fond: g.fond, mode: m });
        if (!k.ok) {
          var portes = (k.echecs || []).map(function (e) { return { paire: e.porte || e.code, mesure: e.mesure, seuil: e.seuil }; });
          return { mode: m, source: source, vars: {}, remarques: [], verifie: false, refus: refuse('contraste-insuffisant', portes, '/graines') };
        }
        brut = {};
        Object.keys(k.valeurs).forEach(function (cle) { brut[cle] = String(k.valeurs[cle]).toLowerCase(); });
        remarques = [];
      } else {
        // Sans la copie du kit, ou pour un sombre « explicite » (que la copie ne connaît pas) : la dérivation d'origine, un aperçu non mesuré.
        var d = deriver({ principal: g.principal, secondaire: g.secondaire, encre: g.encre, fond: g.fond, sombre: lire(td, ['modes', 'sombre']) }, m);
        brut = d.vars;
        remarques = d.remarques;
      }
    }
    var sur = lire(td, ['surcharges', m]);
    if (sur && typeof sur === 'object' && !Array.isArray(sur)) {
      // Une surcharge dont la valeur est refusée est IGNORÉE : elle n'efface pas la valeur que le thème avait déjà.
      Object.keys(sur).forEach(function (k) {
        var nom = k.indexOf('--kit-') === 0 ? k.slice(6) : k;
        if (CLES.indexOf(nom) === -1) return;
        var essai = {}; essai[nom] = sur[k];
        if (Object.keys(juger(essai)).length === 1) brut[nom] = sur[k];
      });
    }
    var final = juger(brut);
    if (source === 'resolu') {
      // Le résultat APRÈS surcharges est mesuré aussi : une surcharge qui casse une paire fait refuser le thème.
      var apres = mesurerPaires(depuisVarsKit(final), seuils);
      if (apres.length) return { mode: m, source: source, vars: {}, remarques: [], verifie: false, refus: refuse('contraste-insuffisant', apres, chemin) };
    }
    return { mode: m, source: source, vars: final, remarques: remarques, verifie: false, refus: null };
  }

  /** Les variables `--kit-*` jugées, sous leurs noms courts. */
  function depuisVarsKit(vars) {
    var o = {};
    Object.keys(vars).forEach(function (k) { o[k.indexOf('--kit-') === 0 ? k.slice(6) : k] = vars[k]; });
    return o;
  }

  /** Ce que la page d'origine lit sous d'autres noms : on les accorde au thème, pour que tout suive. */
  var ALIAS = { '--kit-fond': '--fond-page', '--kit-surface': '--fond-carte', '--kit-texte': '--encre', '--kit-texte-2': '--encre-douce', '--kit-bord': '--bord' };

  /** Pose les variables sur un élément (la racine du document, ou un conteneur). Rend les noms posés, pour les retirer. */
  function appliquer(racine, vars) {
    var noms = [];
    if (!racine || !racine.style || typeof racine.style.setProperty !== 'function') return noms;
    Object.keys(vars || {}).forEach(function (k) {
      racine.style.setProperty(k, vars[k]);
      noms.push(k);
      if (ALIAS[k]) { racine.style.setProperty(ALIAS[k], vars[k]); noms.push(ALIAS[k]); }
    });
    return noms;
  }

  function retirer(racine, noms) {
    if (!racine || !racine.style || typeof racine.style.removeProperty !== 'function') return;
    (noms || []).forEach(function (n) { racine.style.removeProperty(n); });
  }

  function mediaVrai(requete) {
    try { return typeof matchMedia === 'function' && matchMedia(requete).matches; } catch (e) { return false; }
  }

  /** Le mode que la personne demande à son système. */
  function modeSysteme() { return mediaVrai('(prefers-color-scheme: dark)') ? 'sombre' : 'clair'; }

  /** La personne passe avant le thème : contraste forcé ou renforcé. */
  function personneImpose() { return mediaVrai('(forced-colors: active)') || mediaVrai('(prefers-contrast: more)'); }

  // ── Le thème de Grist (l'étage « hôte ») ────────────────────────────────────

  /**
   * Quand une page de widget charge `grist-plugin-api.js`, Grist lui pousse le thème de la personne : l'attribut `data-grist-appearance`
   * (`light` ou `dark`) et `data-grist-theme` sur <html>, et une feuille `#grist-theme` qui déclare `--grist-theme-<nom>`. Sur une instance
   * qui a son propre `custom.css` (celle de la DINUM, en palette La Suite), ces variables portent SA palette. Mesuré par le kit en Grist réel
   * (appkit, lot T5) ; ce lecteur en reprend la lecture et les portes, sans dépendre d'appkit.
   *
   * On ne reprend que le MODE et la couleur d'ACTION (fond des boutons principaux) : le reste du thème est dérivé de cette couleur par `deriver`,
   * avec ses garde-fous de lisibilité. Jamais une couleur dont on n'est pas sûr (voir `lireCouleur`).
   */
  var VARIABLES_HOTE = { fond: 'control-primary-bg', texte: 'control-primary-fg', survol: 'control-primary-hover-bg' };
  var ACTION_ORIGINE = '#000091';
  var NOMS_COULEURS = { white: '#ffffff', black: '#000000' };

  /**
   * Une couleur lue de l'hôte vers `#rrggbb` (minuscules), ou `''` : hexadécimal court ou long, `rgb()` / `rgba()` OPAQUES, `white`, `black`.
   * Une couleur transparente ou d'une forme inconnue est refusée : on ne devine pas ce qui se trouve dessous.
   */
  function lireCouleur(brut) {
    if (typeof brut !== 'string') return '';
    var t = brut.trim().toLowerCase();
    if (propre(NOMS_COULEURS, t)) return NOMS_COULEURS[t];
    if (/^#[0-9a-f]{6}$/.test(t)) return t;
    if (/^#[0-9a-f]{3}$/.test(t)) return '#' + t[1] + t[1] + t[2] + t[2] + t[3] + t[3];
    var m = /^rgba?\(\s*(\d{1,3})\s*[ ,]\s*(\d{1,3})\s*[ ,]\s*(\d{1,3})\s*(?:[,/]\s*([0-9.]+%?)\s*)?\)$/.exec(t);
    if (!m) return '';
    var c = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (c.some(function (x) { return x > 255; })) return '';
    if (m[4] !== undefined) {
      var a = m[4].charAt(m[4].length - 1) === '%' ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
      if (!(a >= 1)) return '';
    }
    return hexDe(c);
  }

  /** L'apparence annoncée par l'hôte (`light`, `dark`) vers le mode du kit, `null` quand elle est absente ou inconnue. */
  function lireApparenceHote(brut) {
    var t = typeof brut === 'string' ? brut.trim().toLowerCase() : '';
    return t === 'dark' ? 'sombre' : t === 'light' ? 'clair' : null;
  }

  /** Une variable de l'hôte résolue en couleur : la valeur déclarée, sinon (`var()`, `color-mix()`…) lue telle que le navigateur la calcule. */
  function couleurHote(doc, fenetre, nom) {
    var racine = doc.documentElement;
    var cs = fenetre.getComputedStyle ? fenetre.getComputedStyle(racine) : null;
    var brut = cs ? String(cs.getPropertyValue('--grist-theme-' + nom) || '').trim() : '';
    if (!brut) return '';
    var direct = lireCouleur(brut);
    if (direct) return direct;
    try {
      var sonde = doc.createElement('span');
      sonde.style.color = 'var(--grist-theme-' + nom + ')';
      sonde.style.display = 'none';
      racine.appendChild(sonde);
      var calcule = fenetre.getComputedStyle(sonde).color;
      racine.removeChild(sonde);
      return lireCouleur(calcule);
    } catch (e) { return ''; }
  }

  /**
   * Ce que Grist annonce à ce widget, ou `null` hors de Grist (aucun attribut, aucune variable).
   * @param {{doc?:Document, fenetre?:Window}} [opts]
   * @returns {{apparence:string|null, nom:string|null, couleurs:{fond:string, texte:string, survol:string}}|null}
   */
  function lireHote(opts) {
    opts = opts || {};
    var fenetre = opts.fenetre || (typeof window !== 'undefined' ? window : null);
    var doc = opts.doc || (typeof document !== 'undefined' ? document : null);
    if (!fenetre || !doc || !doc.documentElement) return null;
    var h = doc.documentElement;
    var apparence = lireApparenceHote(h.getAttribute('data-grist-appearance'));
    var couleurs = {};
    Object.keys(VARIABLES_HOTE).forEach(function (role) { couleurs[role] = couleurHote(doc, fenetre, VARIABLES_HOTE[role]); });
    var nomBrut = h.getAttribute('data-grist-theme');
    var nom = typeof nomBrut === 'string' && nomBrut.trim() ? nomBrut.trim().slice(0, 60) : null;
    // Les variables que lit le contrat de l'instance (docs/THEMEDEF-INSTANCE-GRIST.md) : les couleurs, résolues par le navigateur, et la pile de polices brute.
    var vars = {};
    if (Instance && Instance.CLES_INSTANCE) {
      Instance.CLES_INSTANCE.forEach(function (cle) {
        if (cle === 'font-family') {
          var cs = fenetre.getComputedStyle ? fenetre.getComputedStyle(h) : null;
          var brute = cs ? String(cs.getPropertyValue('--grist-theme-font-family') || '').trim() : '';
          if (brute) vars[cle] = brute;
        } else {
          var c = couleurHote(doc, fenetre, cle);
          if (c) vars[cle] = c;
        }
      });
    }
    if (!apparence && !couleurs.fond && !couleurs.texte && !couleurs.survol && !Object.keys(vars).length) return null;
    return { apparence: apparence, nom: nom, couleurs: couleurs, vars: vars };
  }

  /**
   * Le thème qu'on peut tirer de ce que Grist annonce (docs/THEMEDEF-INSTANCE-GRIST.md, décisions D-A et D-B de l'auteur) :
   *
   *   1. le CONTRAT du kit (`shared/theme-instance.js`, copie) transforme les variables de Grist en graines : mode, couleur d'action (première candidate à 4,5:1, sinon
   *      redressée), et, en clair, fond et texte de l'instance ;
   *   2. la DÉRIVATION du kit (`shared/derivation-valeurs.js`, copie) en tire les 26 valeurs, exactement celles du compilateur ;
   *   3. les 22 paires de lisibilité sont MESURÉES sur ce résultat. Une paire qui échoue : on retombe sur l'action seule, puis sur l'origine. Jamais d'application à moitié ;
   *   4. en sombre, fond et texte de l'instance sont des graines du mode clair : ils ne se superposent aux valeurs dérivées que si les paires tiennent encore (politique du widget,
   *      écart E7 de THEMEDEF-ALIGNEMENT.md), sinon l'action seule est gardée et on le dit.
   *
   * La POLICE de l'instance n'est pas reprise : aucune des 26 variables du kit n'est une police. La pile est rendue (`pile`) pour un widget qui saurait la poser.
   * Un hôte clair sans couleur reprenable ne change rien (l'origine est déjà claire) : `null`. Un hôte sombre sans couleur d'action donne le thème sombre de l'apparence
   * d'origine (son action bleue), jamais une couleur inventée. Sans les deux copies du kit, aucun thème de l'hôte n'est posé.
   *
   * @param {object|null} hote la sortie de `lireHote`
   * @param {{mode?:string}} [opts] `mode` : conservé pour compatibilité ; l'apparence que l'hôte annonce prime, et le contrat refuse une apparence absente
   * @returns {{vars:Object<string,string>, mode:string, nom:string, remarques:string[], action:string, repris:{fond:boolean, texte:boolean}, pile:string|null}|null}
   */
  function themeHote(hote, opts) {
    if (!hote || typeof hote !== 'object' || !Instance || !Derivation) return null;
    var mode = hote.apparence === 'sombre' || hote.apparence === 'clair' ? hote.apparence : null;
    if (!mode) return null;
    var hvars = hote.vars && typeof hote.vars === 'object' ? Object.assign({}, hote.vars) : {};
    // Une lecture à l'ancienne forme (la seule couleur des boutons dans `couleurs.fond`) reste lisible : c'est `control-primary-bg`.
    if (!hvars['control-primary-bg'] && hote.couleurs && hote.couleurs.fond) hvars['control-primary-bg'] = hote.couleurs.fond;
    var r = Instance.themeInstance({ apparence: mode, vars: hvars });
    if (r.refus) return null;
    var remarques = [];
    var action = r.themedef ? r.themedef.graines.principal : '';
    var principal = action;
    if (!principal) {
      if (mode !== 'sombre') return null;
      principal = ACTION_ORIGINE;
    }
    (r.notes || []).forEach(function (n) {
      if (n.code === 'action-redressee') remarques.push('La couleur des boutons de Grist ne se détachait pas assez du fond (4,5:1 demandés) : elle est ajustée pour rester lisible.');
      else if (n.code === 'texte-redresse') remarques.push('Le texte de Grist ne se détachait pas assez du fond (4,5:1 demandés) : il est ajusté pour rester lisible.');
    });
    var seuils = seuilsDe({});
    function deriveEtMesure(graines) {
      var d = Derivation.deriverValeurs(Object.assign({}, graines, { mode: mode }));
      if (!d || !d.ok) return null;
      var val = {};
      Object.keys(d.valeurs).forEach(function (k) { val[k] = String(d.valeurs[k]).toLowerCase(); });
      return mesurerPaires(val, seuils).length ? null : val;
    }
    var graines = { principal: principal };
    var repris = { fond: false, texte: false };
    var valeurs = null;
    if (mode === 'clair' && r.themedef) {
      if (r.themedef.graines.fond) graines.fond = r.themedef.graines.fond;
      if (r.themedef.graines.encre) graines.encre = r.themedef.graines.encre;
      valeurs = deriveEtMesure(graines);
      if (valeurs) { repris.fond = !!graines.fond; repris.texte = !!graines.encre; }
      else if (graines.fond || graines.encre) {
        remarques.push("Le fond et le texte de Grist n'ont pas pu être repris tout en gardant le formulaire lisible : seule la couleur des boutons est reprise.");
        graines = { principal: principal };
      }
    }
    if (!valeurs) valeurs = deriveEtMesure(graines);
    if (!valeurs) return null;
    if (mode === 'sombre' && (r.fond || r.texte)) {
      var essai = Object.assign({}, valeurs);
      if (r.fond) essai.fond = r.fond;
      if (r.texte) essai.texte = r.texte;
      if (mesurerPaires(essai, seuils).length === 0) { valeurs = essai; repris.fond = !!r.fond; repris.texte = !!r.texte; }
      else remarques.push('Le fond et le texte de Grist ne tiennent pas la lisibilité avec les couleurs du formulaire : seuls le mode sombre et la couleur des boutons sont repris.');
    }
    return { vars: juger(valeurs), mode: mode, nom: hote.nom || 'Grist', remarques: remarques, action: action || '', repris: repris, pile: r.pile || null };
  }

  function signatureHote(opts) { try { return JSON.stringify(lireHote(opts)); } catch (e) { return 'null'; } }

  /**
   * Appelle `rappel` quand ce que Grist annonce CHANGE (le thème se change à chaud, dans le même document). On compare les lectures : poser
   * nos propres variables sur <html> ne rappelle donc jamais personne. Rend la fonction qui arrête l'écoute.
   */
  function suivreHote(rappel, opts) {
    opts = opts || {};
    var fenetre = opts.fenetre || (typeof window !== 'undefined' ? window : null);
    var doc = opts.doc || (typeof document !== 'undefined' ? document : null);
    if (!fenetre || !doc || typeof fenetre.MutationObserver !== 'function' || !doc.documentElement) return function () {};
    var derniere = signatureHote(opts);
    var o = new fenetre.MutationObserver(function () {
      var s = signatureHote(opts);
      if (s === derniere) return;
      derniere = s;
      rappel();
    });
    o.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-grist-appearance', 'data-grist-theme', 'style'] });
    if (doc.head) o.observe(doc.head, { childList: true, subtree: true, characterData: true });
    return function () { o.disconnect(); };
  }

  /** La lecture de l'hôte, quand elle est déjà là, sinon au plus `ms` millisecondes d'attente (Grist l'envoie après `grist.ready`). `null` s'il n'en vient pas. */
  function attendreHote(opts, ms) {
    var d = lireHote(opts);
    if (d || !(ms > 0)) return Promise.resolve(d);
    return new Promise(function (resolu) {
      var fini = false;
      var arret = function () {};
      function fin(valeur) { if (fini) return; fini = true; arret(); resolu(valeur); }
      arret = suivreHote(function () { fin(lireHote(opts)); }, opts);
      setTimeout(function () { fin(lireHote(opts)); }, ms);
    });
  }

  function vide(raison) { return { theme: null, raison: raison, avertissements: [], ligne: null }; }

  /**
   * L'apparence qu'un formulaire demande : `{ mode, themedef }` dans le FormDef (`apparence`).
   *
   *   - `document` (défaut) : le thème actif du document, quand il en porte un ;
   *   - `formulaire` : le ThemeDef 1.0 donné en entrée avec le formulaire (déposé ou collé dans le compositeur) ;
   *   - `grist` : le thème actif du document, sinon celui de Grist (mode et couleur d'action de la personne), sinon l'origine ;
   *   - `aucune` : l'apparence d'origine, quoi que dise le document.
   *
   * Un thème de formulaire illisible ne casse rien : le formulaire retombe sur le document, et `erreur` dit pourquoi. Un thème PAS ENCORE
   * donné (on vient de choisir « un thème pour ce formulaire ») n'est pas une erreur : `attente` le dit, et le formulaire suit le document.
   *
   * @returns {{mode:string, themedef:object|null, erreur:string|null, attente?:boolean}}
   */
  function apparenceDe(def) {
    var a = def && typeof def === 'object' ? def.apparence : null;
    if (!objetSimple(a)) return { mode: 'document', themedef: null, erreur: null };
    var mode = ['document', 'grist', 'formulaire', 'aucune'].indexOf(a.mode) !== -1 ? a.mode : 'document';
    if (mode !== 'formulaire') return { mode: mode, themedef: null, erreur: null };
    if (a.themedef === undefined || a.themedef === null) return { mode: 'document', themedef: null, erreur: null, attente: true };
    var lu = lireThemeDef(a.themedef);
    if (!lu.ok) return { mode: 'document', themedef: null, erreur: lu.erreur };
    return { mode: 'formulaire', themedef: lu.themedef, erreur: null };
  }

  /** Le thème donné en entrée avec un formulaire, résolu pour un mode ; `null` quand le formulaire n'en porte pas. */
  function themeFormulaire(def, mode) {
    var ap = apparenceDe(def);
    if (ap.mode !== 'formulaire') return null;
    var modeVoulu = mode || modeSysteme();
    if (modeVoulu === 'sombre' && lire(ap.themedef, ['modes', 'sombre']) === 'aucun') return { theme: null, raison: 'sans-mode-sombre', avertissements: [], ligne: null };
    var r = resoudre(ap.themedef, modeVoulu);
    if (r.refus) return { theme: null, raison: r.refus.code, avertissements: r.refus.echecs.map(function (e) { return { code: r.refus.code, chemin: r.refus.chemin, paire: e.paire, mesure: e.mesure, seuil: e.seuil }; }), ligne: null };
    return {
      theme: r.vars, raison: 'formulaire', mode: r.mode, source: r.source, nom: typeof ap.themedef.nom === 'string' ? ap.themedef.nom.slice(0, 80) : '',
      ligne: null, remarques: r.remarques, verifie: false, themedef: ap.themedef,
      avertissements: [{ code: 'non-verifie', conseil: 'Le thème est appliqué tel que lu : seul le compilateur du kit en mesure les contrastes.' }]
    };
  }

  function traiter(lignes, opts) {
    var choix = choisirActif(lignes);
    if (!choix.ligne) return { theme: null, raison: choix.avertissements.some(function (a) { return a.code === 'plusieurs-actifs'; }) ? 'plusieurs-actifs' : 'aucun-actif', avertissements: choix.avertissements, ligne: null };
    // La colonne `version` de la ligne : vide ou absente est tolérée (la version du document fait foi), toute autre valeur que la nôtre est refusée.
    var vc = choix.ligne.version;
    if (vc !== undefined && vc !== null && vc !== '' && vc !== VERSION) {
      return { theme: null, raison: 'version-inconnue', avertissements: [{ code: 'version-inconnue', chemin: '/ligne/version' }], ligne: choix.ligne.cle };
    }
    var lu = lireThemeDef(choix.ligne.themedef);
    if (!lu.ok) return { theme: null, raison: 'invalide', avertissements: [{ code: 'themedef-invalide', detail: lu.erreur }], ligne: choix.ligne.cle };
    var modeDemande = opts.mode || modeSysteme();
    // Un thème qui ne fournit pas de sombre (`modes.sombre: 'aucun'`) n'applique rien en sombre : l'hôte garde son rendu, sans bruit.
    if (modeDemande === 'sombre' && lire(lu.themedef, ['modes', 'sombre']) === 'aucun') return { theme: null, raison: 'sans-mode-sombre', avertissements: [], ligne: choix.ligne.cle };
    var r = resoudre(lu.themedef, modeDemande);
    if (r.refus) {
      return {
        theme: null, raison: r.refus.code, ligne: choix.ligne.cle, source: r.source,
        avertissements: r.refus.echecs.length
          ? r.refus.echecs.map(function (e) { return { code: r.refus.code, chemin: r.refus.chemin, paire: e.paire, mesure: e.mesure, seuil: e.seuil }; })
          : [{ code: r.refus.code, chemin: r.refus.chemin }]
      };
    }
    return {
      theme: r.vars, raison: 'applique', mode: r.mode, source: r.source, nom: typeof lu.themedef.nom === 'string' ? lu.themedef.nom.slice(0, 80) : '',
      ligne: choix.ligne.cle, remarques: r.remarques, verifie: false, themedef: lu.themedef,
      avertissements: [{ code: 'non-verifie', conseil: 'Le thème est appliqué tel que lu : seul le compilateur du kit en mesure les contrastes.' }]
    };
  }

  /**
   * Lit le thème actif du document, SANS RIEN ÉCRIRE : la table n'est lue que si le document la porte.
   *
   * @param {{listTables:function, fetchTable:function}} api l'API de document de Grist (`grist.docApi`)
   * @param {{mode?:string, def?:object}} [opts] `mode` : `clair` ou `sombre` (le système par défaut) ; `def` : le FormDef, dont l'`apparence`
   *   peut donner son propre thème (sans lire le document) ou n'en vouloir aucun
   * @returns {Promise<{theme:Object|null, raison:string, avertissements:Array, ligne:string|null}>} `raison` : `applique`, `aucun-actif`,
   *   `plusieurs-actifs`, `invalide`, `table-absente`, `preference-personne`, `pas-de-document`, `lecture-impossible`
   */
  function charger(api, opts) {
    opts = opts || {};
    if (personneImpose()) return Promise.resolve(vide('preference-personne'));
    var ap = apparenceDe(opts.def);
    if (ap.mode === 'aucune') return Promise.resolve(vide('apparence-aucune'));
    if (ap.mode === 'formulaire') return Promise.resolve(themeFormulaire(opts.def, opts.mode));
    if (!api || typeof api.listTables !== 'function' || typeof api.fetchTable !== 'function') return Promise.resolve(vide('pas-de-document'));
    // Le thème de Grist ne prend le relais que là où le document n'a RIEN dit : un document qui dit quelque chose d'illisible, ou
    // de contradictoire (plusieurs actifs), n'applique rien, et l'hôte ne le remplace pas.
    var REPLI_HOTE = ['aucun-actif', 'table-absente', 'lecture-impossible'];
    function repli(r) {
      if (ap.mode !== 'grist' || r.theme || REPLI_HOTE.indexOf(r.raison) === -1) return r;
      return attendreHote(opts.lecteurHote, opts.attenteHote === undefined ? ATTENTE_HOTE : opts.attenteHote).then(function (hote) {
        var t = themeHote(hote, { mode: opts.mode });
        if (!t) return r;
        return {
          theme: t.vars, raison: 'hote', mode: t.mode, nom: t.nom, ligne: null, remarques: t.remarques, verifie: false, hote: true,
          avertissements: [{ code: 'non-verifie', conseil: 'Le thème de Grist est repris tel que Grist l\'annonce : le mode et la couleur des boutons, rendus lisibles.' }]
        };
      });
    }
    return Promise.resolve(api.listTables()).then(function (tables) {
      var noms = (tables || []).map(function (t) { return typeof t === 'string' ? t : (t && t.id); });
      if (noms.indexOf(TABLE) === -1) return vide('table-absente');
      return Promise.resolve(api.fetchTable(TABLE)).then(function (colonnes) { return traiter(lignesDeTable(colonnes), opts); });
    }).then(null, function () { return vide('lecture-impossible'); }).then(repli);
  }

  /**
   * Lit puis POSE le thème sur `racine` (le geste complet d'un formulaire publié). Dans le mode `grist`, suit aussi le thème de Grist à chaud :
   * la promesse rend le résultat de `charger`, avec `arreter()` pour couper le suivi.
   */
  function habiller(racine, api, opts) {
    opts = opts || {};
    var noms = [];
    function poser(r) { retirer(racine, noms); noms = r && r.theme ? appliquer(racine, r.theme) : []; return r; }
    return charger(api, opts).then(function (r) {
      poser(r);
      if (api && apparenceDe(opts.def).mode === 'grist' && !personneImpose()) {
        var suivi = Object.assign({}, opts, { attenteHote: 0 });
        r.arreter = suivreHote(function () { charger(api, suivi).then(poser); }, opts.lecteurHote);
      } else {
        r.arreter = function () {};
      }
      return r;
    });
  }

  return {
    VERSION: VERSION,
    TABLE: TABLE,
    CLES: CLES,
    contraste: contraste,
    redresser: redresser,
    meilleurTexte: meilleurTexte,
    deriver: deriver,
    lireThemeDef: lireThemeDef,
    apparenceDe: apparenceDe,
    themeFormulaire: themeFormulaire,
    lignesDeTable: lignesDeTable,
    choisirActif: choisirActif,
    modesDe: modesDe,
    resoudre: resoudre,
    PAIRES: PAIRES,
    seuilsDe: seuilsDe,
    mesurerPaires: mesurerPaires,
    appliquer: appliquer,
    retirer: retirer,
    modeSysteme: modeSysteme,
    personneImpose: personneImpose,
    charger: charger,
    lireLignes: traiter,
    habiller: habiller,
    lireCouleur: lireCouleur,
    lireHote: lireHote,
    themeHote: themeHote,
    suivreHote: suivreHote,
    attendreHote: attendreHote,
    VARIABLES_HOTE: VARIABLES_HOTE
  };
}));

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
    module.exports = factory(require('./theme.js'));
  } else if (typeof define === 'function' && define.amd) {
    define(['./theme'], factory);
  } else {
    root.FormThemeDef = factory(root.FormTheme);
  }
}(typeof self !== 'undefined' ? self : this, function (Theme) {
  'use strict';

  var VERSION = 'themedef-1.0';
  var TABLE = 'Theme_document';
  var TAILLE_MAX = 16384;
  var PROFONDEUR_MAX = 6;
  var LIGNES_MAX = 50;
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
    var n = colonnes && colonnes.id ? colonnes.id.length : 0;
    var out = [];
    for (var i = 0; i < n && i < LIGNES_MAX; i++) {
      var l = {};
      Object.keys(colonnes).forEach(function (k) { l[k] = colonnes[k][i]; });
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
  function resoudre(td, mode) {
    var dispo = modesDe(td);
    var m = mode === 'sombre' && dispo.indexOf('sombre') !== -1 ? 'sombre' : 'clair';
    var remarques = [];
    var source = 'graines';
    var brut;
    var mesure = lire(td, ['resolu', 'modes', m, 'valeurs']);
    if (mesure && typeof mesure === 'object' && !Array.isArray(mesure)) {
      brut = {};
      Object.keys(mesure).forEach(function (k) { brut[k] = mesure[k]; });
      source = 'resolu';
    } else {
      var g = td.graines || {};
      var d = deriver({ principal: g.principal, secondaire: g.secondaire, encre: g.encre, fond: g.fond, sombre: lire(td, ['modes', 'sombre']) }, m);
      brut = d.vars;
      remarques = d.remarques;
    }
    var sur = lire(td, ['surcharges', m]);
    if (sur && typeof sur === 'object' && !Array.isArray(sur)) {
      Object.keys(sur).forEach(function (k) { if (CLES.indexOf(k.indexOf('--kit-') === 0 ? k.slice(6) : k) !== -1) brut[k.indexOf('--kit-') === 0 ? k.slice(6) : k] = sur[k]; });
    }
    return { mode: m, source: source, vars: juger(brut), remarques: remarques, verifie: false };
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

  function vide(raison) { return { theme: null, raison: raison, avertissements: [], ligne: null }; }

  /**
   * L'apparence qu'un formulaire demande : `{ mode, themedef }` dans le FormDef (`apparence`).
   *
   *   - `document` (défaut) : le thème actif du document, quand il en porte un ;
   *   - `formulaire` : le ThemeDef 1.0 donné en entrée avec le formulaire (déposé ou collé dans le compositeur) ;
   *   - `aucune` : l'apparence d'origine, quoi que dise le document.
   *
   * Un thème de formulaire illisible ne casse rien : le formulaire retombe sur le document, et `erreur` dit pourquoi.
   *
   * @returns {{mode:string, themedef:object|null, erreur:string|null}}
   */
  function apparenceDe(def) {
    var a = def && typeof def === 'object' ? def.apparence : null;
    if (!objetSimple(a)) return { mode: 'document', themedef: null, erreur: null };
    var mode = ['document', 'formulaire', 'aucune'].indexOf(a.mode) !== -1 ? a.mode : 'document';
    if (mode !== 'formulaire') return { mode: mode, themedef: null, erreur: null };
    var lu = lireThemeDef(a.themedef);
    if (!lu.ok) return { mode: 'document', themedef: null, erreur: lu.erreur };
    return { mode: 'formulaire', themedef: lu.themedef, erreur: null };
  }

  /** Le thème donné en entrée avec un formulaire, résolu pour un mode ; `null` quand le formulaire n'en porte pas. */
  function themeFormulaire(def, mode) {
    var ap = apparenceDe(def);
    if (ap.mode !== 'formulaire') return null;
    var r = resoudre(ap.themedef, mode || modeSysteme());
    return {
      theme: r.vars, raison: 'formulaire', mode: r.mode, source: r.source, nom: typeof ap.themedef.nom === 'string' ? ap.themedef.nom.slice(0, 80) : '',
      ligne: null, remarques: r.remarques, verifie: false, themedef: ap.themedef,
      avertissements: [{ code: 'non-verifie', conseil: 'Le thème est appliqué tel que lu : seul le compilateur du kit en mesure les contrastes.' }]
    };
  }

  function traiter(lignes, opts) {
    var choix = choisirActif(lignes);
    if (!choix.ligne) return { theme: null, raison: choix.avertissements.some(function (a) { return a.code === 'plusieurs-actifs'; }) ? 'plusieurs-actifs' : 'aucun-actif', avertissements: choix.avertissements, ligne: null };
    var lu = lireThemeDef(choix.ligne.themedef);
    if (!lu.ok) return { theme: null, raison: 'invalide', avertissements: [{ code: 'themedef-invalide', detail: lu.erreur }], ligne: choix.ligne.cle };
    var r = resoudre(lu.themedef, opts.mode || modeSysteme());
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
    return Promise.resolve(api.listTables()).then(function (tables) {
      var noms = (tables || []).map(function (t) { return typeof t === 'string' ? t : (t && t.id); });
      if (noms.indexOf(TABLE) === -1) return vide('table-absente');
      return Promise.resolve(api.fetchTable(TABLE)).then(function (colonnes) { return traiter(lignesDeTable(colonnes), opts); });
    }).then(null, function () { return vide('lecture-impossible'); });
  }

  return {
    VERSION: VERSION,
    TABLE: TABLE,
    CLES: CLES,
    contraste: contraste,
    deriver: deriver,
    lireThemeDef: lireThemeDef,
    apparenceDe: apparenceDe,
    themeFormulaire: themeFormulaire,
    lignesDeTable: lignesDeTable,
    choisirActif: choisirActif,
    modesDe: modesDe,
    resoudre: resoudre,
    appliquer: appliquer,
    retirer: retirer,
    modeSysteme: modeSysteme,
    personneImpose: personneImpose,
    charger: charger
  };
}));

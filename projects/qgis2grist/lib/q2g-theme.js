/**
 * Q2GTheme : suivi du ThemeDef 1.0 du document par le widget qgis2grist.
 *
 * Module sans acces direct au DOM, a Grist ni au reseau : tout ce qui vient de l'exterieur est INJECTE
 * (create(deps)). Il LIT la table `Theme_document` et ne l'ecrit JAMAIS : aucune creation de table, aucune
 * action utilisateur, aucun appel autre que listTables et fetchTable.
 *
 * Ce que le module fournit, a partir d'une seule lecture :
 *   1. l'interface du widget : variables `--kit-*` (26 valeurs du ThemeDef resolu) et leurs alias vers les
 *      variables propres au widget (--bg, --primary...), en passant par FormThemeDef (injecte) ;
 *   2. la charte `atlas-charte/0.1` a donner a `client.setTheme(charte, { remplacer: true })` d'Atlas ;
 *   3. le suivi a chaud : relecture quand la table, le mode clair/sombre ou la preference de contraste
 *      de la personne changent (abonnement injecte), sans notifier quand rien n'a change.
 *
 * Regle de lecture (la meme que Form Builder et Atlas, projects/grist_forms/docs/THEMEDEF-SPEC.md) :
 *   - table absente ou vide, aucune ligne active : AUCUN theme, sans bruit ;
 *   - plusieurs lignes actives : rien n'est applique, `plusieurs-actifs` est dit ;
 *   - le contenu est une donnee NON FIABLE : 50 lignes au plus, 16 Ko par theme (octets), profondeur 6,
 *     cles `__proto__` / `constructor` / `prototype` refusees, valeurs de couleur bornees. Ces controles
 *     sont ceux de FormThemeDef.lireThemeDef ; ce module en ajoute un en amont (reduireTable) pour ne
 *     transmettre au lecteur d'Atlas ni plus de 50 lignes ni le contenu des lignes inactives ;
 *   - la preference de contraste de la personne (prefers-contrast: more, forced-colors: active) PASSE
 *     AVANT le theme : rien n'est lu, rien n'est pose, aucune charte n'est produite.
 *
 * Charte pour Atlas : deux voies, la premiere l'emporte.
 *   (a) delegation : `atlasThemeDuDocument` (injection) est la fonction `themeDuDocument` du module
 *       lib/charte/theme-document.js d'Atlas, chargee a l'execution depuis l'Atlas publie ; elle est
 *       seule juge de la charte (resolu, etats, police, refus de contraste). Un refus d'Atlas est respecte,
 *       il n'est pas contourne.
 *   (b) conversion minimale : seulement si la fonction n'est pas fournie, ou si elle leve une erreur
 *       ou rend une forme inexploitable. Limitee aux graines principal, secondaire, encre, fond (et a la
 *       famille de police de la liste sure) ; Atlas calcule le reste (rampes, etats, halo, plan).
 *
 * Ordre de priorite : (a) ligne active de Theme_document ; sinon (b) le theme de l'INSTANCE Grist, lu comme un
 * ThemeDef par le contrat de FormThemeDef (lireHote / themeHote / suivreHote, variables --grist-theme-* que Grist
 * fournit au widget) ; sinon (c) rendu d'origine. Le repli (b) joue aussi quand le document dit quelque chose de
 * refuse (invalide, contraste, plusieurs actifs...), comme dans Form Builder : le refus est dit, jamais applique a moitie.
 *
 * Fond de la carte : tout theme applique (document OU instance) donne `fond = { mode: 'plan', jetons: { principal } }` ;
 * sans theme, `fond` est null et l'appelant revient au fond d'origine (`envoyerApparence`).
 *
 * Dependances injectees (create(deps)) :
 *   formThemeDef          objet FormThemeDef (projects/grist_forms/shared/themedef.js) : lignesDeTable, lireLignes,
 *                         et pour le repli instance : themeHote, attendreHote, suivreHote
 *   lireHote              async function (attenteMs) -> hote|null ; defaut : formThemeDef.attendreHote
 *   suivreHote            function (rappel) -> arret ; defaut : formThemeDef.suivreHote
 *   atlasThemeDuDocument  function (contenu, { mode }) -> { charte, ligne, raison, ... } (voir ci-dessus)
 *   matchMedia            function (requete) -> { matches, addEventListener? } ; defaut : le global
 *   alias                 correspondance --kit-* -> variables du widget (defaut : ALIAS_WIDGET)
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Q2GTheme = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const TABLE = 'Theme_document';
  const VERSION_CHARTE = 'atlas-charte/0.1';
  const NOM_CHARTE = 'Theme du document';
  const LIGNES_MAX = 50;
  const TAILLE_MAX = 16384;
  const CHARTE_TAILLE_MAX = 16384;
  const CLE_LIGNE = /^[a-z][a-z0-9-]{0,39}$/;
  const HEX6 = /^#[0-9a-fA-F]{6}$/;
  // Liste sure des familles de police d'Atlas (schema.js, FAMILLES_POLICE) : un mot-cle, jamais une pile.
  const FAMILLES_POLICE = ['systeme', 'sans', 'serif', 'mono', 'lisible'];
  const REQUETE_SOMBRE = '(prefers-color-scheme: dark)';
  const REQUETES_PERSONNE = ['(prefers-contrast: more)', '(forced-colors: active)'];

  // Variable du kit (nom court) -> variables du widget qui la reprennent. `--orange` designe le rouge dans
  // index_v2.html (nom herite) : il suit l'etat `alerte` du kit (rouge), pas `attention`.
  const ALIAS_WIDGET = Object.freeze({
    'fond': ['--bg'],
    'surface': ['--surface'],
    'surface-2': ['--surface2'],
    'bord': ['--surface3', '--border'],
    'action': ['--primary'],
    'action-survol': ['--primary-dark'],
    'texte': ['--text'],
    'texte-2': ['--text-muted', '--text-dim'],
    'ok': ['--green'],
    'attention': ['--yellow'],
    'alerte': ['--orange'],
  });

  // Valeur de variable CSS acceptee en sortie : couleur hex, rgb()/hsl() a nombres simples, ou var(--nom) sans repli.
  const VALEUR_SURE = /^(?:#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(?:rgb|rgba|hsl|hsla)\(\s*[0-9.%]{1,8}(?:\s*[ ,/]\s*[0-9.%]{1,8}){2,3}\s*\)|var\(--[A-Za-z_][A-Za-z0-9_-]{0,63}\))$/;
  const NOM_VARIABLE = /^--[a-z][a-z0-9-]{0,47}$/;

  // ---- Fonctions pures ----

  function estObjet(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function propre(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function normaliserMode(m) { return m === 'sombre' || m === 'clair' ? m : null; }

  function mediaVrai(matchMedia, requete) {
    try { return typeof matchMedia === 'function' && !!matchMedia(requete).matches; } catch (_) { return false; }
  }

  /** La personne demande un contraste renforce ou des couleurs forcees : le theme du document s'efface devant elle. */
  function personneImpose(matchMedia) {
    return REQUETES_PERSONNE.some((q) => mediaVrai(matchMedia, q));
  }

  /** Le mode d'apparence demande au systeme. */
  function modeSysteme(matchMedia) { return mediaVrai(matchMedia, REQUETE_SOMBRE) ? 'sombre' : 'clair'; }

  /**
   * Reduit le contenu de `fetchTable('Theme_document')` (colonnes) au strict necessaire, AVANT toute lecture :
   * 50 lignes au plus, colonnes id / cle / actif / version / themedef seulement, `actif` strictement booleen,
   * `themedef` conserve pour les seules lignes actives (le reste est vide : une ligne inactive n'est jamais lue).
   * Un texte de theme de plus de 16 384 caracteres est remplace par un texte trop long pour que le lecteur le
   * refuse en `trop-gros` sans qu'on copie l'original.
   *
   * @param {object} colonnes contenu colonaire de fetchTable
   * @returns {{table: object, total: number}|null} `total` : nombre de lignes de la table avant coupe ; null si le contenu n'est pas une table
   */
  function reduireTable(colonnes) {
    if (!estObjet(colonnes)) return null;
    const tab = (k) => (Array.isArray(colonnes[k]) ? colonnes[k] : null);
    let total = 0;
    ['id', 'cle', 'themedef', 'actif'].forEach((k) => { const a = tab(k); if (a && a.length > total) total = a.length; });
    const n = Math.min(total, LIGNES_MAX);
    const avecVersion = !!tab('version');
    const t = { id: [], cle: [], actif: [], themedef: [] };
    if (avecVersion) t.version = [];
    for (let i = 0; i < n; i++) {
      const brutCle = tab('cle') ? tab('cle')[i] : undefined;
      const cle = typeof brutCle === 'string' && brutCle.length <= 64 ? brutCle : '';
      const actif = tab('actif') ? tab('actif')[i] === true : false;
      const lisible = actif && CLE_LIGNE.test(cle);
      let td = '';
      if (lisible && tab('themedef')) {
        td = tab('themedef')[i];
        if (typeof td === 'string' && td.length > TAILLE_MAX) td = ' '.repeat(TAILLE_MAX + 1);
        if (td === undefined) td = '';
      }
      t.id.push(tab('id') && typeof tab('id')[i] === 'number' ? tab('id')[i] : i + 1);
      t.cle.push(cle);
      t.actif.push(actif);
      t.themedef.push(td);
      if (avecVersion) {
        const v = tab('version')[i];
        t.version.push(typeof v === 'string' ? v.slice(0, 64) : (v === undefined || v === null ? null : '?'));
      }
    }
    return { table: t, total };
  }

  /** Une couleur #RRGGBB stricte en minuscules, sinon ''. */
  function hexStrict(v) { return typeof v === 'string' && HEX6.test(v.trim()) ? v.trim().toLowerCase() : ''; }

  function nomDeCharte(nom) {
    const t = typeof nom === 'string' ? nom.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 60) : '';
    return t || NOM_CHARTE;
  }

  /**
   * Conversion MINIMALE ThemeDef -> charte atlas-charte/0.1, limitee aux graines (voie b).
   * Donnees d'entree : le resultat deja valide par FormThemeDef.lireLignes (`themedef` relu, `theme` resolu).
   *   - valeurs `resolu` (ou sombre explicite) : accent -> principal, fond -> fond, texte -> encre ;
   *   - sinon : les graines du document, principal / secondaire / encre / fond, en #RRGGBB strict.
   * Les etats ne sont jamais convertis (les graines d'etat sont ignorees par la specification). Rien n'est
   * recopie tel quel : chaque couleur est relue en #RRGGBB, une valeur illisible est ecartee et dite.
   *
   * @param {{theme:Object|null, themedef?:object, source?:string}} lu resultat de FormThemeDef.lireLignes
   * @param {'clair'|'sombre'} mode
   * @returns {{charte: object|null, ignore: {chemin:string, code:string}[]}}
   */
  function charteMinimale(lu, mode) {
    const ignore = [];
    if (!lu || !lu.theme || !estObjet(lu.themedef)) return { charte: null, ignore };
    const td = lu.themedef;
    const sombreExplicite = mode === 'sombre' && estObjet(td.modes) && td.modes.sombre === 'explicite';
    const graines = {};
    if (lu.source === 'resolu' || sombreExplicite) {
      const v = lu.theme;
      const lire = (cle, graine) => {
        const h = hexStrict(v['--kit-' + cle]);
        if (h) graines[graine] = h; else ignore.push({ chemin: 'valeurs.' + cle, code: 'couleur-non-reprise' });
      };
      lire('accent', 'principal'); lire('fond', 'fond'); lire('texte', 'encre');
    } else {
      const g = estObjet(td.graines) ? td.graines : {};
      ['principal', 'secondaire', 'encre', 'fond'].forEach((cle) => {
        if (!propre(g, cle)) return;
        const h = hexStrict(g[cle]);
        if (h) graines[cle] = h; else ignore.push({ chemin: 'graines.' + cle, code: 'couleur-invalide' });
      });
    }
    if (!Object.keys(graines).length) return { charte: null, ignore };
    const charte = { version: VERSION_CHARTE, nom: nomDeCharte(td.nom), graines };
    const police = td.police !== undefined ? td.police : (estObjet(td.resolu) ? td.resolu.police : undefined);
    if (typeof police === 'string' && FAMILLES_POLICE.indexOf(police) !== -1) charte.texte = { famille: police };
    else if (police !== undefined) ignore.push({ chemin: 'police', code: 'police-non-listee' });
    return { charte, ignore };
  }

  /** Une charte rendue par le module d'Atlas est-elle exploitable (objet, taille bornee) ? */
  function charteExploitable(charte) {
    if (!estObjet(charte)) return false;
    try { return JSON.stringify(charte).length <= CHARTE_TAILLE_MAX; } catch (_) { return false; }
  }

  function hexVersRgba(hex, alpha) {
    const h = hexStrict(hex);
    if (!h) return '';
    const n = parseInt(h.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  /**
   * Les variables CSS a poser sur la racine du widget : les `--kit-*` du theme, puis leurs alias vers les
   * variables propres au widget, plus `--primary-dim` et `--primary-glow` derives de l'action. Chaque valeur
   * est re-verifiee (couleur simple ou var() sans repli) : une valeur douteuse est omise.
   *
   * @param {Object<string,string>|null} vars `--kit-*` -> valeur
   * @param {Object<string,string[]>} [alias] nom court du kit -> variables du widget ; defaut ALIAS_WIDGET
   * @returns {Object<string,string>}
   */
  function variablesInterface(vars, alias) {
    const sortie = {};
    if (!estObjet(vars)) return sortie;
    const table = estObjet(alias) ? alias : ALIAS_WIDGET;
    Object.keys(vars).forEach((nom) => {
      if (nom.indexOf('--kit-') !== 0 || !NOM_VARIABLE.test(nom)) return;
      const valeur = vars[nom];
      if (typeof valeur !== 'string' || !VALEUR_SURE.test(valeur)) return;
      sortie[nom] = valeur;
      const court = nom.slice(6);
      if (propre(table, court) && Array.isArray(table[court])) {
        table[court].forEach((cible) => { if (typeof cible === 'string' && NOM_VARIABLE.test(cible)) sortie[cible] = valeur; });
      }
    });
    if (table === ALIAS_WIDGET || propre(table, 'action')) {
      const dim = hexVersRgba(vars['--kit-action'], 0.08);
      const glow = hexVersRgba(vars['--kit-action'], 0.18);
      if (dim) sortie['--primary-dim'] = dim;
      if (glow) sortie['--primary-glow'] = glow;
    }
    return sortie;
  }

  /** Pose les variables sur un element (la racine du document). Rend les noms poses, pour les retirer. */
  function poserVariables(racine, variables) {
    const noms = [];
    if (!racine || !racine.style || typeof racine.style.setProperty !== 'function') return noms;
    Object.keys(variables || {}).forEach((k) => { racine.style.setProperty(k, variables[k]); noms.push(k); });
    return noms;
  }

  function retirerVariables(racine, noms) {
    if (!racine || !racine.style || typeof racine.style.removeProperty !== 'function') return;
    (noms || []).forEach((n) => racine.style.removeProperty(n));
  }

  /**
   * Abonnement par sondage pour `suivre` : la table Theme_document n'emet aucun evenement dans l'API de widget,
   * on la relit donc a intervalle regulier, sauf onglet masque. Tout est injecte (testable sans horloge).
   *
   * @param {{periodeMs?:number, setInterval:function, clearInterval:function, estVisible?:function}} o
   * @returns {function(function):function} `abonner(rappel)` -> `desabonner()`
   */
  function abonnementParSondage(o) {
    const opts = o || {};
    const periode = opts.periodeMs > 0 ? opts.periodeMs : 15000;
    return function abonner(rappel) {
      if (typeof opts.setInterval !== 'function') return function () {};
      const id = opts.setInterval(() => {
        if (typeof opts.estVisible === 'function' && !opts.estVisible()) return;
        rappel();
      }, periode);
      return function desabonner() { if (typeof opts.clearInterval === 'function') opts.clearInterval(id); };
    };
  }

  /**
   * La charte pour Atlas tiree du theme de l'INSTANCE (sortie de FormThemeDef.themeHote). Graines :
   *   - principal : la couleur d'action que l'instance donne (`action`, deja redressee pour la lisibilite) ;
   *   - fond, encre : celles de l'instance quand l'interface les a reprises (`repris`) ; en mode sombre, a defaut, le fond
   *     et le texte sombres du kit (pour qu'Atlas suive le mode de Grist comme l'interface du widget) ;
   *   - secondaire : jamais, l'instance ne la donne pas (Atlas la derive).
   * Rien n'est recopie tel quel : chaque couleur est relue en #RRGGBB strict. null quand aucune graine n'est exploitable.
   */
  function charteDepuisInstance(t) {
    if (!t || !estObjet(t.vars)) return null;
    const v = t.vars;
    const graines = {};
    const principal = hexStrict(t.action);
    if (principal) graines.principal = principal;
    const repris = estObjet(t.repris) ? t.repris : {};
    if (repris.fond) { const h = hexStrict(v['--kit-fond']); if (h) graines.fond = h; }
    if (repris.texte) { const h = hexStrict(v['--kit-texte']); if (h) graines.encre = h; }
    if (t.mode === 'sombre') {
      if (!graines.fond) { const h = hexStrict(v['--kit-fond']); if (h) graines.fond = h; }
      if (!graines.encre) { const h = hexStrict(v['--kit-texte']); if (h) graines.encre = h; }
    }
    if (!Object.keys(graines).length) return null;
    return { version: VERSION_CHARTE, nom: nomDeCharte('Instance Grist' + (typeof t.nom === 'string' && t.nom && t.nom !== 'Grist' ? ' (' + t.nom.slice(0, 30) + ')' : '')), graines };
  }

  /**
   * Le fond de la carte Atlas qui suit un theme applique : plan en aplats calcule par Atlas depuis la couleur principale
   * de la charte. null quand il n'y a pas de charte ou pas de graine principale (le fond d'origine reste alors).
   */
  function fondDeCharte(charte) {
    const p = charte && estObjet(charte.graines) ? hexStrict(charte.graines.principal) : '';
    return p ? { mode: 'plan', jetons: { principal: p } } : null;
  }

  /**
   * Envoie a Atlas ce qui a CHANGE entre `demande` ({ charte, fond }) et `envoye` (retour precedent, null au debut).
   * Ordre : setTheme d'abord (Atlas rejoue alors son dernier fond), puis le fond. Sans theme : rien n'est envoye au
   * depart (rendu d'origine) ; si un theme disparait, la charte par defaut revient (`{}` avec remplacer) et le fond
   * repasse a `atlas` (le fond d'origine). Un envoi refuse n'est pas memorise : il sera retente au changement suivant.
   *
   * @param {{appliquerTheme:function, definirFond:function}} hote hote du composant (Q2GAtlasHost.creerHote)
   * @param {{charte:object|null, fond:{mode:string, jetons:object}|null}} demande
   * @param {{charte:string|null, fond:string|null}|null} envoye
   * @param {function} [surErreur]
   * @returns {Promise<{charte:string|null, fond:string|null}>} nouvel etat a repasser au prochain appel
   */
  async function envoyerApparence(hote, demande, envoye, surErreur) {
    const dem = demande || {};
    const etat = { charte: envoye && envoye.charte !== undefined ? envoye.charte : null, fond: envoye && envoye.fond !== undefined ? envoye.fond : null };
    if (!hote) return etat;
    const cleCharte = dem.charte ? JSON.stringify(dem.charte) : null;
    const cleFond = dem.fond ? JSON.stringify(dem.fond) : null;
    const signaler = (e) => { if (typeof surErreur === 'function') { try { surErreur(e); } catch (_) { /* rien */ } } };
    if (cleCharte !== etat.charte) {
      try { await hote.appliquerTheme(dem.charte || {}, { remplacer: true }); etat.charte = cleCharte; } catch (e) { signaler(e); }
    }
    if (cleFond !== etat.fond) {
      try {
        if (dem.fond) await hote.definirFond(dem.fond.mode, dem.fond.jetons);
        else await hote.definirFond('atlas');
        etat.fond = cleFond;
      } catch (e) { signaler(e); }
    }
    return etat;
  }

  // ---- Instance a dependances injectees ----

  function create(deps) {
    const d = deps || {};
    const ft = d.formThemeDef && typeof d.formThemeDef.lireLignes === 'function' && typeof d.formThemeDef.lignesDeTable === 'function'
      ? d.formThemeDef : null;
    const delegue = typeof d.atlasThemeDuDocument === 'function' ? d.atlasThemeDuDocument : null;
    const alias = estObjet(d.alias) ? d.alias : ALIAS_WIDGET;
    const matchMediaDefaut = d.matchMedia !== undefined ? d.matchMedia
      : (root && typeof root.matchMedia === 'function' ? root.matchMedia.bind(root) : null);

    function vide(raison, mode, signature) {
      return {
        raison, raisonCharte: null, ligne: null, mode: mode || null, nom: '', vars: null, charte: null, origineCharte: null,
        origine: null, fond: null, documentRefuse: null, documentIllisible: false,
        avertissements: [], remarques: [], verifie: false, signature: signature || (raison + '|' + (mode || '')),
      };
    }

    /**
     * Le theme que dit un contenu de table deja lu. Synchrone, sans acces a Grist.
     * @param {object} colonnes contenu colonaire de fetchTable('Theme_document')
     * @param {{mode?:'clair'|'sombre'}} [opts] defaut : `clair`
     * @returns {object} voir `lire`
     */
    function depuisTable(colonnes, opts) {
      const mode = normaliserMode(opts && opts.mode) || 'clair';
      const reduit = reduireTable(colonnes);
      if (!reduit) return vide('aucun-actif', mode);
      const signature = 'table|' + mode + '|' + JSON.stringify(reduit.table);
      const out = vide('aucun-actif', mode, signature);
      if (reduit.total > LIGNES_MAX) out.avertissements.push({ code: 'lignes-ignorees', nombre: reduit.total - LIGNES_MAX });
      if (!ft && !delegue) { out.raison = 'lecteur-absent'; return out; }

      // 1. Interface : FormThemeDef lit, resout, juge (taille, version, profondeur, contraste).
      let lu = null;
      if (ft) {
        try { lu = ft.lireLignes(ft.lignesDeTable(reduit.table), { mode }); } catch (_) { lu = null; }
        if (!lu) { out.raison = 'lecture-impossible'; return out; }
        out.raison = lu.raison;
        out.ligne = lu.ligne || null;
        out.vars = lu.theme || null;
        out.nom = lu.nom || '';
        out.remarques = Array.isArray(lu.remarques) ? lu.remarques.slice() : [];
        (lu.avertissements || []).forEach((a) => out.avertissements.push(a));
        if (lu.theme) out.mode = lu.mode || mode;
      }

      // 2. Charte pour Atlas : delegation, sinon conversion minimale. Quand FormThemeDef est la et refuse le theme
      // (ou n'en trouve pas), AUCUNE charte n'est produite : un meme document n'est pas applique a moitie (interface
      // refusee, carte habillee), et le lecteur d'Atlas, plus tolerant sur les graines, ne contredit pas le kit.
      let charteFaite = false;
      if (ft && !(lu && lu.theme)) return out;
      if (delegue) {
        let r = null;
        try { r = delegue(reduit.table, { mode }); } catch (_) { r = null; }
        if (estObjet(r) && 'charte' in r) {
          charteFaite = true;
          out.raisonCharte = typeof r.raison === 'string' ? r.raison : null;
          if (r.charte) {
            if (charteExploitable(r.charte)) { out.charte = r.charte; out.origineCharte = 'atlas'; }
            else out.avertissements.push({ code: 'charte-inexploitable' });
          }
          if (!ft) {
            out.raison = out.raisonCharte || 'aucun-actif';
            out.ligne = typeof r.ligne === 'string' ? r.ligne : null;
            out.mode = out.charte ? (r.mode || mode) : null;
            out.nom = out.charte ? nomDeCharte(out.charte.nom) : '';
            if (Array.isArray(r.avertissements)) r.avertissements.forEach((a) => { if (a && typeof a.code === 'string') out.avertissements.push({ code: a.code }); });
          }
        } else {
          out.avertissements.push({ code: 'atlas-indisponible' });
        }
      }
      if (!charteFaite && ft && lu && lu.theme) {
        const m = charteMinimale(lu, mode);
        if (m.charte) { out.charte = m.charte; out.origineCharte = 'minimale'; out.raisonCharte = 'applique'; }
      }
      if (out.vars || out.charte) { out.origine = 'document'; out.fond = fondDeCharte(out.charte); }
      return out;
    }

    /**
     * Le theme de l'INSTANCE Grist, a partir de ce que Grist annonce au widget (sortie de FormThemeDef.lireHote).
     * Synchrone, sans acces a Grist. Rend le meme enregistrement que `depuisTable` (origine 'instance', raison 'hote'),
     * ou null quand l'instance ne donne rien d'exploitable (hote absent, apparence inconnue, lisibilite non tenue).
     *
     * @param {object|null} hote sortie de FormThemeDef.lireHote
     * @returns {object|null}
     */
    function depuisHote(hote) {
      if (!hote || !ft || typeof ft.themeHote !== 'function') return null;
      let t = null;
      try { t = ft.themeHote(hote, {}); } catch (_) { t = null; }
      if (!t || !estObjet(t.vars)) return null;
      const mode = normaliserMode(t.mode) || 'clair';
      const charte = charteDepuisInstance(t);
      const out = vide('hote', mode, 'hote|' + mode + '|' + JSON.stringify(t.vars) + '|' + JSON.stringify(charte));
      out.vars = t.vars;
      out.nom = typeof t.nom === 'string' ? t.nom.slice(0, 80) : 'Grist';
      out.remarques = Array.isArray(t.remarques) ? t.remarques.slice() : [];
      out.charte = charte;
      out.origineCharte = charte ? 'instance' : null;
      out.raisonCharte = charte ? 'applique' : null;
      out.origine = 'instance';
      out.fond = fondDeCharte(charte);
      return out;
    }

    /** Le repli vers l'instance joue quand le document n'a rien dit, ou a dit quelque chose de refuse. */
    const REPLI_HOTE = ['aucun-actif', 'table-absente', 'lecture-impossible'];
    const REPLI_APRES_REFUS = ['invalide', 'version-inconnue', 'contraste-insuffisant', 'resolu-incomplet', 'plusieurs-actifs'];

    async function lireInstance(o, base) {
      const lire = typeof d.lireHote === 'function' ? d.lireHote
        : (ft && typeof ft.attendreHote === 'function' ? (ms) => ft.attendreHote(undefined, ms) : null);
      if (!lire) return base;
      let hote = null;
      try { hote = await lire(o.attenteHote > 0 ? o.attenteHote : 0); } catch (_) { hote = null; }
      const inst = depuisHote(hote);
      if (!inst) return base;
      if (REPLI_APRES_REFUS.indexOf(base.raison) !== -1) {
        inst.documentRefuse = base.raison;
        inst.avertissements.push({ code: 'document-refuse', raison: base.raison });
      }
      if (base.raison === 'lecture-impossible') inst.documentIllisible = true;
      return inst;
    }

    /**
     * Lit le theme du document. Ne rejette jamais.
     *
     * @param {{listTables:function, fetchTable:function}} api l'API de document de Grist (`grist.docApi`)
     * @param {{mode?:'clair'|'sombre', matchMedia?:function}} [opts] `mode` : defaut, celui du systeme
     * @returns {Promise<{
     *   raison:string, raisonCharte:string|null, ligne:string|null, mode:string|null, nom:string,
     *   vars:Object<string,string>|null, charte:object|null, origineCharte:'atlas'|'minimale'|null,
     *   avertissements:Array, remarques:string[], verifie:false, signature:string}>}
     *   `raison` : applique, aucun-actif, plusieurs-actifs, invalide, version-inconnue, contraste-insuffisant,
     *   resolu-incomplet, sans-mode-sombre, table-absente, preference-personne, pas-de-document,
     *   lecture-impossible, lecteur-absent. Seul `applique` porte des `vars` et une `charte` (avec FormThemeDef) ;
     *   si Atlas, une fois delegue, refuse la charte que le kit accepte, `vars` existe et `charte` est null
     *   (`raisonCharte` dit pourquoi). Sans FormThemeDef, seule la charte d'Atlas est rendue.
     */
    async function lireDocument(api, opts) {
      const o = opts || {};
      const mm = o.matchMedia !== undefined ? o.matchMedia : matchMediaDefaut;
      const mode = normaliserMode(o.mode) || modeSysteme(mm);
      if (personneImpose(mm)) return vide('preference-personne', mode, 'preference-personne|' + mode);
      if (!api || typeof api.listTables !== 'function' || typeof api.fetchTable !== 'function') return vide('pas-de-document', mode);
      let colonnes;
      try {
        const tables = await api.listTables();
        const noms = (Array.isArray(tables) ? tables : []).map((t) => (typeof t === 'string' ? t : (t && t.id)));
        if (noms.indexOf(TABLE) === -1) return vide('table-absente', mode);
        colonnes = await api.fetchTable(TABLE);
      } catch (_) {
        return vide('lecture-impossible', mode);
      }
      return depuisTable(colonnes, { mode });
    }

    /**
     * `lireDocument` suivi du repli instance : document > instance > aucun. Ne rejette jamais.
     * `opts.attenteHote` : attente maximale (ms) de ce que Grist annonce, quand rien n'est encore la.
     */
    async function lire(api, opts) {
      const o = opts || {};
      const r = await lireDocument(api, o);
      if (r.origine || r.raison === 'preference-personne' || r.raison === 'pas-de-document' || r.raison === 'lecteur-absent') return r;
      if (REPLI_HOTE.indexOf(r.raison) === -1 && REPLI_APRES_REFUS.indexOf(r.raison) === -1) return r;
      return lireInstance(o, r);
    }

    /**
     * Lit puis suit a chaud. Relit sur : signal de `abonner`, changement de mode clair/sombre, changement de la
     * preference de contraste, ou appel de `rafraichir()`. `surChangement(resultat)` n'est appele que si le
     * resultat DIFFERE du precedent (signature) ; une lecture impossible apres une premiere lecture reussie est
     * ignoree (on garde le theme en place plutot que de le retirer sur une panne reseau). Les lectures ne se
     * chevauchent pas : une demande pendant une lecture en provoque une seule relecture.
     *
     * @param {object} api l'API de document de Grist
     * @param {{mode?:string, abonner?:function(function):function, surChangement?:function, surErreur?:function,
     *   matchMedia?:function, suivreMedia?:boolean}} [opts]
     * @returns {{pret:Promise<object>, rafraichir:function():Promise<object>, dernier:function():object|null, arreter:function():void}}
     */
    function suivre(api, opts) {
      const o = opts || {};
      let actif = true;
      let enCours = null;
      let premiere = true;
      let relance = false;
      let signature = null;
      let dernier = null;
      const desabonner = [];

      function signaler(r) {
        if (typeof o.surChangement !== 'function') return;
        try { o.surChangement(r); } catch (e) { if (typeof o.surErreur === 'function') { try { o.surErreur(e); } catch (_) { /* rien */ } } }
      }

      function lancer() {
        if (!actif) return Promise.resolve(dernier);
        if (enCours) { relance = true; return enCours; }
        enCours = (async () => {
          try {
            do {
              relance = false;
              const r = await lire(api, premiere ? o : Object.assign({}, o, { attenteHote: 0 }));
              premiere = false;
              if (!actif) break;
              if ((r.raison === 'lecture-impossible' || r.documentIllisible) && signature !== null) continue;
              dernier = r;
              if (r.signature !== signature) { signature = r.signature; signaler(r); }
            } while (relance && actif);
          } finally {
            enCours = null;
          }
          return dernier;
        })();
        return enCours;
      }

      if (typeof o.abonner === 'function') {
        try {
          const arret = o.abonner(() => { lancer(); });
          if (typeof arret === 'function') desabonner.push(arret);
        } catch (_) { /* un abonnement defaillant ne casse pas la lecture initiale */ }
      }
      // ce que Grist annonce a l'instance change a chaud (mode clair/sombre, palette) : relecture
      const suivreHote = typeof d.suivreHote === 'function' ? d.suivreHote
        : (ft && typeof ft.suivreHote === 'function' ? (rappel) => ft.suivreHote(rappel) : null);
      if (o.suivreInstance !== false && suivreHote) {
        try {
          const arret = suivreHote(() => { lancer(); });
          if (typeof arret === 'function') desabonner.push(arret);
        } catch (_) { /* un suivi defaillant ne casse pas la lecture initiale */ }
      }
      const mm = o.matchMedia !== undefined ? o.matchMedia : matchMediaDefaut;
      if (o.suivreMedia !== false && typeof mm === 'function') {
        [REQUETE_SOMBRE].concat(REQUETES_PERSONNE).forEach((q) => {
          try {
            const liste = mm(q);
            if (liste && typeof liste.addEventListener === 'function') {
              const sur = () => { lancer(); };
              liste.addEventListener('change', sur);
              desabonner.push(() => { if (typeof liste.removeEventListener === 'function') liste.removeEventListener('change', sur); });
            }
          } catch (_) { /* media indisponible : pas de suivi de ce signal */ }
        });
      }

      const pret = lancer();
      return {
        pret,
        rafraichir: lancer,
        dernier: () => dernier,
        arreter: () => {
          actif = false;
          desabonner.splice(0).forEach((f) => { try { f(); } catch (_) { /* rien */ } });
        },
      };
    }

    /**
     * Le geste complet : lit, pose les variables d'interface sur `racine`, signale la charte a Atlas, suit a chaud.
     * Le widget ne cree ni n'ecrit jamais Theme_document.
     *
     * @param {Element} racine l'element qui porte les variables (document.documentElement)
     * @param {object} api l'API de document de Grist
     * @param {{surFond?:function({mode:string,jetons:object}|null, object):void, surCharte?:function(object|null, object):void, surChangement?:function, abonner?:function,
     *   mode?:string, matchMedia?:function}} [opts]
     *   `surCharte(charte, resultat)` : appelee quand la charte CHANGE (premier theme, changement, retour a
     *   aucun theme avec `charte` null) ; ce n'est pas appelee au demarrage quand il n'y a aucun theme. L'appelant
     *   y fait `client.setTheme(charte, { remplacer: true })`, ou revient a la charte par defaut quand `charte` est null.
     * @returns {{pret:Promise<object>, rafraichir:function, dernier:function, arreter:function(opts?:{retirer?:boolean}):void}}
     */
    function habiller(racine, api, opts) {
      const o = opts || {};
      let noms = [];
      let derniereCharte = null;
      let dernierFond = null;
      const suivi = suivre(api, Object.assign({}, o, {
        surChangement: (r) => {
          retirerVariables(racine, noms);
          noms = r.vars ? poserVariables(racine, variablesInterface(r.vars, alias)) : [];
          const cs = r.charte ? JSON.stringify(r.charte) : null;
          if (cs !== derniereCharte) {
            derniereCharte = cs;
            if (typeof o.surCharte === 'function') {
              try { o.surCharte(r.charte, r); } catch (e) { if (typeof o.surErreur === 'function') { try { o.surErreur(e); } catch (_) { /* rien */ } } }
            }
          }
          const fs = r.fond ? JSON.stringify(r.fond) : null;
          if (fs !== dernierFond) {
            dernierFond = fs;
            if (typeof o.surFond === 'function') {
              try { o.surFond(r.fond, r); } catch (e) { if (typeof o.surErreur === 'function') { try { o.surErreur(e); } catch (_) { /* rien */ } } }
            }
          }
          if (typeof o.surChangement === 'function') {
            try { o.surChangement(r); } catch (_) { /* rien */ }
          }
        },
      }));
      return Object.assign({}, suivi, {
        arreter: (a) => {
          suivi.arreter();
          if (a && a.retirer) { retirerVariables(racine, noms); noms = []; }
        },
      });
    }

    return { lire, depuisTable, depuisHote, suivre, habiller, variablesInterface: (v) => variablesInterface(v, alias) };
  }

  return {
    VERSION, TABLE, VERSION_CHARTE, ALIAS_WIDGET, LIGNES_MAX, FAMILLES_POLICE,
    create,
    reduireTable, charteMinimale, variablesInterface, poserVariables, retirerVariables,
    personneImpose, modeSysteme, abonnementParSondage,
    charteDepuisInstance, fondDeCharte, envoyerApparence,
  };
});

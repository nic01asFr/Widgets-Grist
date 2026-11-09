/**
 * Q2GPalettes : palettes de couleurs par defaut de qgis2grist, issues de la charte du theme actif (niveau A).
 *
 * Module pur : aucun acces au DOM, a Grist, au reseau ni a l'horloge. Meme entree, meme sortie.
 *
 * Regles de decision (Nicolas, 09/11/2026) :
 *   - le STYLE QML d'un projet QGIS prime TOUJOURS : ce module ne fournit que des couleurs par defaut, pour
 *     les couches sans style, les categories sans couleur et les propositions de choix de couleur. L'appelant
 *     ne l'interroge jamais pour une entite qui porte deja sa couleur ;
 *   - le contrat ThemeDef n'est pas modifie : les palettes sont DERIVEES des graines (principal, secondaire,
 *     encre, fond) de la charte `atlas-charte/0.1` que q2g-theme.js envoie a Atlas ; si cette charte porte deja
 *     une section `donnees` (listes #RRGGBB), elle est reprise telle quelle ;
 *   - les TONS D'ETAT (ok, attention, alerte, info, neutre) sont separes des palettes de donnees : ils ne
 *     sont jamais calcules depuis elles, et une palette de donnees ne depend jamais d'eux.
 *
 * Ordre de resolution de la source :
 *   1. charte du theme actif (document, sinon instance : c'est q2g-theme.js qui choisit et appelle definirCharte) ;
 *   2. sinon REPLI D'ORIGINE : la liste historique PALETTE_ORIGINE (comportement d'avant, aucune regression).
 *
 * Derivation (injectee) :
 *   `deriver` a la signature de `deriverDonnees(graines, options)` de projects/Atlas/lib/charte/derivation.js
 *   (options : candidates, nSequentielle, kDivergente, nQualitative ; retour : { sequentielles: { principale },
 *   divergente, qualitative, sansDonnee }). Le widget la charge depuis l'Atlas publie, comme theme-document.js,
 *   et passe aussi `candidates` (QUALITATIVE_ATLAS de defauts.js). Sans fonction fournie, ou si elle leve une
 *   erreur ou rend une forme inexploitable, le REPLI LOCAL (deriverLocal, meme signature) prend le relais :
 *   minimal et deterministe (teintes tournees depuis la graine principale, ecart de teinte d'au moins 30 degres
 *   entre categories, contraste d'au moins 3:1 sur le fond, rampes par melange).
 *   Les graines manquantes sont completees comme le fait Atlas (secondaire #2e4e54, encre #1f1b14, fond #ffffff) ;
 *   la divergente n'est calculee que si la charte donne une graine secondaire, sinon la bleu-orange d'Atlas reste.
 *
 * Bornes : n est un entier de 1 a 24 (24 = couleursParListe du schema d'Atlas) ; toute autre valeur rend [] ou est
 * ramenee a 24. Le nombre de couleurs rendu ne depasse jamais n (la qualitative peut en rendre moins si la
 * derivation n'en fournit pas davantage). Au-dela de 7 categories distinctes (MAX_DISTINCTES), couleurPour regroupe
 * le reste en `autres` (couleur neutre).
 *
 * API : create(deps) -> { definirCharte, definirDeriveur, palette, couleurPour, couleurCyclique, couleurAutres,
 *       regroupement, tonsEtat, source, etat } ; le module exporte aussi les memes fonctions sur une instance
 *       partagee (Q2GPalettes.palette(...)) et les constantes PALETTE_ORIGINE, TONS_ETAT_DEFAUT, MAX_DISTINCTES, N_MAX.
 *
 * Dependances injectees (create(deps)) :
 *   deriver     function (graines, options) -> donnees  (voir ci-dessus) ; defaut : deriverLocal
 *   candidates  string[]  couleurs candidates de la qualitative (QUALITATIVE_ATLAS) ; defaut : celles d'Atlas copiees ici
 *   charte      charte initiale (defaut : aucune, repli d'origine)
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Q2GPalettes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '1.0.0';

  /** La liste historique de qgis2grist (LAYER_COLORS d'index_v2.html) : bleu, vert, ambre, rouge, violet, bleu clair, orange. */
  const PALETTE_ORIGINE = Object.freeze(['#3e5de7', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6', '#f97316']);
  /** Couleur neutre de `autres` sans theme (la valeur de repli '#808080' deja utilisee par q2g-color / qml-to-declarative). */
  const AUTRES_ORIGINE = '#808080';
  const MAX_DISTINCTES = 7;
  const N_MAX = 24;
  const N_QUALITATIVE_DERIVEE = 8;
  const N_QUALITATIVE_LOCALE = 12;

  /** Okabe et Ito dans l'ordre d'Atlas (defauts.js, QUALITATIVE_ATLAS) : copie, sert si aucune liste n'est injectee. */
  const CANDIDATES_ATLAS = Object.freeze(['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#56b4e9', '#d55e00', '#f0e442', '#000000']);
  /** Graines par defaut d'Atlas (CHARTE_ATLAS) : completent une charte qui n'en donne pas certaines. */
  const GRAINES_DEFAUT = Object.freeze({ secondaire: '#2e4e54', encre: '#1f1b14', fond: '#ffffff' });
  /** Divergente bleu-orange d'Atlas (jamais rouge-vert), gardee quand la charte ne donne pas de secondaire. */
  const DIVERGENTE_ATLAS = Object.freeze(['#b15104', '#e17b3c', '#f0b594', '#efefef', '#b2c4db', '#7199c7', '#0072b2']);
  /** Graines de la palette d'origine pour les rampes (la couleur d'action de l'interface, le fond et l'encre d'origine). */
  const GRAINES_ORIGINE = Object.freeze({ principal: '#3e5de7', secondaire: '#f59e0b', encre: '#1e293b', fond: '#ffffff' });

  const THEME_ORIGINE = Object.freeze({ graines: GRAINES_ORIGINE, secondaireDonnee: false, donnees: Object.freeze({}), etats: Object.freeze({}) });

  const ECART_TEINTE_MIN = 30;
  const CONTRASTE_APLAT = 3;
  const CONTRASTE_ETAT = 4.5;
  const ANGLE_OR = 137.50776405;
  const CLARTES = [0.46, 0.36, 0.52, 0.42];

  /**
   * Tons d'etat : separes des palettes de donnees. Valeurs d'Atlas (tous a plus de 4,5:1 sur blanc). La couleur ne porte
   * jamais seule l'etat : `forme` et `libelle` sont a afficher avec elle.
   */
  const TONS_ETAT_DEFAUT = Object.freeze({
    ok: Object.freeze({ couleur: '#1e6b3e', forme: 'cercle', libelle: 'Valide' }),
    attention: Object.freeze({ couleur: '#8a5a00', forme: 'triangle', libelle: 'Attention' }),
    alerte: Object.freeze({ couleur: '#b3261e', forme: 'losange', libelle: 'Alerte' }),
    info: Object.freeze({ couleur: '#1f5f99', forme: 'carre', libelle: 'Information' }),
    neutre: Object.freeze({ couleur: '#5f6368', forme: 'tiret', libelle: 'Neutre' }),
  });
  // Graine d'etat de la charte (atlas-charte/0.1) -> ton d'etat
  const GRAINE_ETAT = Object.freeze({ succes: 'ok', alerte: 'attention', erreur: 'alerte', information: 'info' });

  // ---- Couleurs : fonctions pures ----

  function estObjet(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  /** "#rgb" ou "#rrggbb" strict -> [r, g, b] ; null sinon (pas d'alpha, pas de nom de couleur). */
  function hexVersRgb(h) {
    if (typeof h !== 'string') return null;
    let s = h.trim();
    if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) return null;
    s = s.slice(1);
    if (s.length === 3) s = s.split('').map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  }
  function rgbVersHex(rgb) {
    return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  /** "#RRGGBB" en minuscules, ou chaine vide si la valeur n'est pas une couleur stricte. */
  function hexStrict(h) { const r = hexVersRgb(h); return r ? rgbVersHex(r) : ''; }

  function melanger(a, b, t) {
    const A = hexVersRgb(a), B = hexVersRgb(b);
    if (!A || !B) return a;
    return rgbVersHex(A.map((v, i) => v + (B[i] - v) * t));
  }

  function luminance(hex) {
    const c = hexVersRgb(hex);
    if (!c) return 0;
    const [r, g, b] = c.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  /** Rapport de contraste WCAG entre deux couleurs (1 a 21). */
  function contraste(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  /** [r, g, b] -> [teinte 0..360, saturation 0..1, clarte 0..1] */
  function rgbVersHsl(rgb) {
    const [r, g, b] = rgb.map((v) => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
    if (d === 0) return [0, 0, l];
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d) + (g < b ? 6 : 0);
    else if (max === g) h = ((b - r) / d) + 2;
    else h = ((r - g) / d) + 4;
    return [h * 60, s, l];
  }
  function hslVersHex(h, s, l) {
    const hh = ((h % 360) + 360) % 360 / 360;
    if (s === 0) return rgbVersHex([l * 255, l * 255, l * 255]);
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => {
      let x = t; if (x < 0) x += 1; if (x > 1) x -= 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    return rgbVersHex([f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255]);
  }
  /** Ecart de teinte (0..180 degres) entre deux couleurs ; null si l'une est achromatique (la teinte n'a pas de sens). */
  function ecartTeinte(a, b) {
    const A = rgbVersHsl(hexVersRgb(a)), B = rgbVersHsl(hexVersRgb(b));
    if (A[1] < 0.12 || B[1] < 0.12) return null;
    const d = Math.abs(A[0] - B[0]) % 360;
    return d > 180 ? 360 - d : d;
  }

  /**
   * Assombrit (fond clair) ou eclaircit (fond sombre) une couleur, a teinte et saturation constantes, jusqu'au
   * contraste `min` contre le fond. Rend la couleur atteinte (la meilleure possible si le seuil est hors de portee).
   */
  function ajusterContraste(hex, fond, min) {
    const rgb = hexVersRgb(hex);
    if (!rgb) return hex;
    if (contraste(hex, fond) >= min) return rgbVersHex(rgb);
    const sens = luminance(fond) > 0.179 ? -1 : 1;
    const [h, s, l0] = rgbVersHsl(rgb);
    let l = l0, courant = rgbVersHex(rgb);
    for (let i = 0; i < 60 && contraste(courant, fond) < min; i++) {
      l = Math.max(0, Math.min(1, l + sens * 0.02));
      courant = hslVersHex(h, s, l);
      if (l === 0 || l === 1) break;
    }
    return courant;
  }

  /** n couleurs prises regulierement sur une suite d'ancres, par melange lineaire (les extremites sont les ancres). */
  function echantillonner(ancres, n) {
    const liste = ancres.filter((c) => hexVersRgb(c));
    if (!liste.length) return [];
    if (n === 1) return [hexStrict(liste[Math.floor((liste.length - 1) / 2)])];
    return Array.from({ length: n }, (_, i) => {
      const x = (liste.length === 1 ? 0 : (i / (n - 1)) * (liste.length - 1));
      const j = Math.min(liste.length - 2, Math.floor(x));
      return liste.length === 1 ? hexStrict(liste[0]) : melanger(liste[j], liste[j + 1], x - j);
    });
  }

  // ---- Repli local de la derivation (meme signature que deriverDonnees d'Atlas) ----

  /** Neutre d'une divergente : le fond legerement charge d'encre (meme regle qu'Atlas : 7 %). */
  function neutreDepuis(g) { return melanger(g.fond, g.encre, 0.07); }

  /** Gris "sans donnee" : l'encre melangee au fond, juste assez pour atteindre 3,2:1 contre lui. */
  function sansDonneeLocale(g) {
    for (let t = 0.3; t <= 1.0001; t += 0.01) {
      const c = melanger(g.fond, g.encre, t);
      if (contraste(c, g.fond) >= 3.2) return c;
    }
    return g.encre;
  }

  function sequentielleLocale(g, n) {
    return echantillonner([melanger(g.fond, g.principal, 0.12), g.principal, melanger(g.principal, g.encre, 0.55)], n);
  }

  /**
   * Divergente de 2k + 1 couleurs : du pole principal au pole secondaire par le neutre. Si le pole haut est confondu avec
   * le pole bas (meme teinte a moins de 30 degres), il est pris a 180 degres de la teinte principale.
   */
  function divergenteLocale(g, k) {
    const neutre = neutreDepuis(g);
    let haut = g.secondaire;
    const e = ecartTeinte(g.principal, haut);
    if (e !== null && e < ECART_TEINTE_MIN) {
      const hp = rgbVersHsl(hexVersRgb(g.principal));
      haut = hslVersHex(hp[0] + 180, Math.max(0.5, hp[1]), 0.45);
    }
    const cote = (pole) => Array.from({ length: k }, (_, i) => melanger(neutre, pole, (i + 1) / k));
    return cote(g.principal).reverse().concat([neutre], cote(haut));
  }

  /**
   * Qualitative locale : la couleur principale, la secondaire quand elle s'en distingue, puis des teintes tournees de
   * l'angle d'or depuis la teinte principale (la suite reste bien repartie et STABLE : les k premieres sont les memes quel
   * que soit n). Une candidate trop proche en teinte (moins de 30 degres) d'une couleur deja prise est ecartee ; chacune
   * est assombrie (fond clair) ou eclaircie (fond sombre) jusqu'a 3:1 contre le fond.
   */
  function qualitativeLocale(g, n) {
    const choisies = [], teintes = [];
    const ajouter = (hex, nominale) => {
      const rgb = hexVersRgb(hex); if (!rgb) return;
      const chroma = rgbVersHsl(rgb)[1] >= 0.12;
      const t = nominale !== undefined ? nominale : rgbVersHsl(rgb)[0];
      if (chroma && teintes.some((u) => { const d = Math.abs(u - t) % 360; return (d > 180 ? 360 - d : d) < ECART_TEINTE_MIN; })) return;
      const c = ajusterContraste(hex, g.fond, CONTRASTE_APLAT);
      if (choisies.indexOf(c) !== -1) return;
      choisies.push(c);
      if (chroma) teintes.push(t);
    };
    ajouter(g.principal);
    ajouter(g.secondaire);
    const hp = rgbVersHsl(hexVersRgb(g.principal));
    const h0 = hp[1] >= 0.12 ? hp[0] : 210;
    for (let i = 1; i < 80 && choisies.length < Math.min(n, N_QUALITATIVE_LOCALE); i++) {
      const h = (h0 + i * ANGLE_OR) % 360;
      ajouter(hslVersHex(h, 0.62, CLARTES[i % CLARTES.length]), h);
    }
    return choisies.slice(0, n);
  }

  /**
   * Repli local : meme forme de retour qu'Atlas (deriverDonnees). Graines completes exigees (principal, secondaire, encre, fond).
   * @returns {{sequentielles:{principale:string[]}, divergente:string[], qualitative:string[], sansDonnee:string}}
   */
  function deriverLocal(g, options) {
    const o = options || {};
    const nSeq = Math.max(2, Math.min(N_MAX, o.nSequentielle || 9));
    const k = Math.max(1, Math.min(11, o.kDivergente || 3));
    const nQ = Math.max(2, Math.min(N_MAX, o.nQualitative || N_QUALITATIVE_DERIVEE));
    return {
      sequentielles: { principale: sequentielleLocale(g, nSeq) },
      divergente: divergenteLocale(g, k),
      qualitative: qualitativeLocale(g, nQ),
      sansDonnee: sansDonneeLocale(g),
    };
  }

  // ---- Validation des formes venues de l'exterieur ----

  function listeHex(v, min, max) {
    if (!Array.isArray(v) || v.length < min || v.length > max) return null;
    const out = v.map(hexStrict);
    return out.every(Boolean) ? out : null;
  }

  function entierBorne(n) {
    const x = typeof n === 'number' ? n : (typeof n === 'string' && n.trim() !== '' ? Number(n) : NaN);
    if (!Number.isFinite(x)) return 0;
    const e = Math.floor(x);
    return e < 1 ? 0 : Math.min(e, N_MAX);
  }

  function normaliserType(type) {
    if (type === 'qualitative') return 'qualitative';
    if (type === 'sequentielle' || type === 'sequential') return 'sequentielle';
    if (type === 'divergente' || type === 'divergent') return 'divergente';
    return null;
  }

  // ---- Instance ----

  function create(deps) {
    const d = deps || {};
    let deriveur = typeof d.deriver === 'function' ? d.deriver : null;
    let candidates = listeHex(d.candidates, 1, 64) || CANDIDATES_ATLAS.slice();
    let theme = null;      // { graines, secondaireDonnee, donnees, etats, base } ou null (repli d'origine)
    let cache = new Map();
    let repliLocal = false; // la derivation injectee a ete ecartee au moins une fois

    function reinitialiser() { cache = new Map(); repliLocal = false; if (theme) theme.base = null; }

    /** Lit une charte atlas-charte/0.1 : graines en #RRGGBB strict, donnees explicites, graines d'etat. null si inexploitable. */
    function lireCharte(charte) {
      if (!estObjet(charte) || !estObjet(charte.graines)) return null;
      const gr = charte.graines;
      const principal = hexStrict(gr.principal);
      if (!principal) return null;
      const secondaire = hexStrict(gr.secondaire);
      const graines = {
        principal,
        secondaire: secondaire || GRAINES_DEFAUT.secondaire,
        encre: hexStrict(gr.encre) || GRAINES_DEFAUT.encre,
        fond: hexStrict(gr.fond) || GRAINES_DEFAUT.fond,
      };
      const etats = {};
      Object.keys(GRAINE_ETAT).forEach((cle) => { const h = hexStrict(gr[cle]); if (h) etats[GRAINE_ETAT[cle]] = h; });
      const donnees = {};
      if (estObjet(charte.donnees)) {
        const dn = charte.donnees;
        const q = listeHex(dn.qualitative, 2, N_MAX); if (q) donnees.qualitative = q;
        const dv = listeHex(dn.divergente, 3, N_MAX + 1); if (dv) donnees.divergente = dv;
        if (estObjet(dn.sequentielles)) {
          const noms = Object.keys(dn.sequentielles).filter((k) => k !== '__proto__' && k !== 'constructor' && k !== 'prototype');
          const choix = typeof dn.sequentielleDefaut === 'string' && noms.indexOf(dn.sequentielleDefaut) !== -1 ? dn.sequentielleDefaut : noms[0];
          const s = choix ? listeHex(dn.sequentielles[choix], 2, N_MAX) : null; if (s) donnees.sequentielle = s;
        }
      }
      return { graines, secondaireDonnee: !!secondaire, donnees, etats };
    }

    /** Une derivation : l'injectee d'abord, le repli local si elle echoue ou rend une forme inexploitable. */
    function deriver(graines, options) {
      if (deriveur) {
        try {
          const r = deriveur(Object.assign({}, graines), Object.assign({ candidates: candidates.slice() }, options));
          if (estObjet(r)) return r;
        } catch (_) { /* repli local */ }
        repliLocal = true;
      }
      return deriverLocal(graines, options);
    }

    /** Derivation de base du theme (qualitative et gris neutre), calculee une fois par charte. */
    function base(th) {
      if (!th.base) th.base = deriver(th.graines, { nQualitative: N_QUALITATIVE_DERIVEE });
      return th.base;
    }

    function qualitativeComplete(th) {
      const g = th.graines;
      let liste = th.donnees.qualitative || listeHex(base(th).qualitative, 1, N_MAX);
      if (!liste) { liste = qualitativeLocale(g, N_QUALITATIVE_DERIVEE); if (deriveur) repliLocal = true; }
      // Garantie : au moins MAX_DISTINCTES categories distinctes (la derivation filtre par contraste et par ecart).
      if (liste.length < MAX_DISTINCTES) {
        liste = liste.slice();
        qualitativeLocale(g, N_QUALITATIVE_LOCALE).forEach((c) => {
          if (liste.length >= MAX_DISTINCTES || liste.indexOf(c) !== -1) return;
          const proche = liste.some((x) => { const e = ecartTeinte(x, c); return e !== null && e < ECART_TEINTE_MIN; });
          if (!proche) liste.push(c);
        });
      }
      return liste;
    }

    function sequentielle(th, n) {
      const g = th.graines, m = Math.max(2, n);
      let liste;
      if (th.donnees.sequentielle) liste = m === th.donnees.sequentielle.length ? th.donnees.sequentielle.slice() : echantillonner(th.donnees.sequentielle, m);
      else {
        const r = deriver(g, { nSequentielle: m });
        const s = r.sequentielles && listeHex(r.sequentielles.principale, 2, N_MAX);
        liste = s && s.length === m ? s : sequentielleLocale(g, m);
        if (deriveur && liste !== s) repliLocal = true;
      }
      return n === 1 ? [liste[Math.floor((liste.length - 1) / 2)]] : liste;
    }

    function divergente(th, n) {
      const g = th.graines;
      if (n === 1) return [neutreDepuis(g)];
      const k = n >= 3 ? Math.floor((n - 1) / 2) : 1;
      let liste = th.donnees.divergente || null;
      if (liste) {
        if (liste.length !== 2 * k + 1) liste = echantillonner(liste, 2 * k + 1);
      } else if (!th.secondaireDonnee) {
        liste = echantillonner(DIVERGENTE_ATLAS, 2 * k + 1);
      } else {
        const r = deriver(g, { kDivergente: k });
        liste = listeHex(r.divergente, 3, N_MAX + 1);
        if (!liste || liste.length !== 2 * k + 1) { liste = divergenteLocale(g, k); if (deriveur) repliLocal = true; }
      }
      return n === 2 ? [liste[0], liste[liste.length - 1]] : liste;
    }

    function calculer(type, n) {
      if (type === 'qualitative') return theme ? qualitativeComplete(theme).slice(0, n) : PALETTE_ORIGINE.slice(0, n);
      const th = theme || THEME_ORIGINE;
      return type === 'sequentielle' ? sequentielle(th, n) : divergente(th, n);
    }

    const api = {
      /**
       * Pose la charte du theme actif (celle que q2g-theme.js envoie a Atlas) ; null ou charte inexploitable : retour au
       * repli d'origine. Rend true quand une charte est retenue.
       */
      definirCharte(charte) {
        theme = lireCharte(charte);
        reinitialiser();
        return !!theme;
      },

      /** Remplace la derivation injectee (et, si fournie, la liste des candidates de la qualitative). */
      definirDeriveur(fonction, listeCandidates) {
        deriveur = typeof fonction === 'function' ? fonction : null;
        const c = listeHex(listeCandidates, 1, 64);
        if (c) candidates = c;
        reinitialiser();
      },

      /**
       * La palette par defaut.
       * @param {'qualitative'|'sequentielle'|'divergente'} type
       * @param {number} n  nombre de couleurs voulu, 1 a 24
       * @returns {string[]} #rrggbb, jamais plus de n ; [] si le type ou n sont invalides
       */
      palette(type, n) {
        const t = normaliserType(type), m = entierBorne(n);
        if (!t || !m) return [];
        const cle = t + '|' + m;
        if (!cache.has(cle)) cache.set(cle, Object.freeze(calculer(t, m)));
        return cache.get(cle).slice();
      },

      /**
       * La couleur de la categorie `index` parmi `n` categories : les MAX_DISTINCTES premieres ont leur couleur, le reste est
       * regroupe en `autres` (couleur neutre). Un index invalide rend aussi la couleur de `autres`.
       */
      couleurPour(index, n) {
        const total = Number.isFinite(n) ? Math.floor(n) : 0;
        const i = Number.isInteger(index) ? index : -1;
        if (i < 0 || total < 1 || i >= Math.min(total, MAX_DISTINCTES)) return api.couleurAutres();
        const liste = api.palette('qualitative', Math.min(total, MAX_DISTINCTES));
        return i < liste.length ? liste[i] : api.couleurAutres();
      },

      /**
       * Couleur d'une couche par rang, en cycle sur les `taille` premieres couleurs de la qualitative (defaut 7). Sans theme,
       * cycler sur 7, 6 ou 5 rend exactement LAYER_COLORS, PALETTE ou les listes de scene-manifest.js / terrain-app.js.
       */
      couleurCyclique(index, taille) {
        const t = Math.max(1, Math.min(MAX_DISTINCTES, Number.isInteger(taille) ? taille : MAX_DISTINCTES));
        const liste = api.palette('qualitative', t);
        const i = Number.isInteger(index) && index >= 0 ? index : 0;
        return liste[i % liste.length];
      },

      /** Couleur neutre de la categorie `autres` : jamais une couleur de la palette. */
      couleurAutres() {
        if (!theme) return AUTRES_ORIGINE;
        return hexStrict(base(theme).sansDonnee) || sansDonneeLocale(theme.graines);
      },

      /** Combien de categories distinctes et combien regroupees en `autres` pour `n` categories. */
      regroupement(n) {
        const total = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
        return { distinctes: Math.min(total, MAX_DISTINCTES), autres: Math.max(0, total - MAX_DISTINCTES) };
      },

      /**
       * Les tons d'etat { ok, attention, alerte, info, neutre } : { couleur, forme, libelle }. Jamais derives de la palette
       * de donnees. Valeurs d'Atlas, remplacees par les graines d'etat de la charte quand elle en donne (succes, alerte,
       * erreur, information), puis ramenees a 4,5:1 contre le fond (`fond` en argument, sinon celui de la charte, sinon blanc).
       */
      tonsEtat(fond) {
        const f = hexStrict(fond) || (theme && theme.graines.fond) || GRAINES_DEFAUT.fond;
        const sortie = {};
        Object.keys(TONS_ETAT_DEFAUT).forEach((cle) => {
          const base = TONS_ETAT_DEFAUT[cle];
          const voulue = (theme && theme.etats[cle]) || base.couleur;
          sortie[cle] = { couleur: ajusterContraste(voulue, f, CONTRASTE_ETAT), forme: base.forme, libelle: base.libelle };
        });
        return sortie;
      },

      /** 'theme' quand une charte est retenue, 'origine' sinon. */
      source() { return theme ? 'theme' : 'origine'; },

      /** Etat lisible pour le diagnostic : source, derivation en service (injectee, locale, ou locale par repli). */
      etat() {
        return { source: api.source(), derivation: !deriveur ? 'locale' : (repliLocal ? 'locale-par-repli' : 'injectee') };
      },
    };
    if (d.charte) api.definirCharte(d.charte);
    return api;
  }

  const partagee = create();
  return Object.assign({}, partagee, {
    VERSION, create, deriverLocal,
    PALETTE_ORIGINE, TONS_ETAT_DEFAUT, MAX_DISTINCTES, N_MAX,
    // Fonctions de couleur pures, exposees pour les tests et pour un controle de lisibilite par l'appelant
    contraste, ecartTeinte,
  });
});

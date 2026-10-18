/*
 * saisies.js — ce que règlent les options d'une saisie, sans écran.
 *
 *   - la valeur de DÉPART d'une question (aujourd'hui, maintenant, moi, la
 *     dernière saisie, une valeur fixe) ;
 *   - les BORNES d'un nombre ou d'une date ;
 *   - l'ORDRE entre deux questions (une fin qui ne précède pas son début) ;
 *   - l'HEURE seule, que Grist ne sait pas ranger autrement qu'en texte.
 *
 * > **Une valeur de départ n'est pas une valeur reçue.** Elle ne vaut que pour une
 * > question qu'aucune autre source n'a remplie : ni l'adresse de la page, ni la
 * > ligne qu'on modifie. Elle se montre, la personne la change, et rien ne dit
 * > dans la table qu'elle venait de là.
 *
 * Le module reçoit l'heure (`now`) : les essais ne dépendent pas de l'horloge.
 */
(function (root, factory) {
  'use strict';
  var asNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  if (asNode && typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.FormSaisies = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var SOURCES_DEPART = ['aujourdhui', 'maintenant', 'moi', 'derniere', 'valeur'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /** `AAAA-MM-JJ` à l'heure de la personne (pas en UTC : à minuit, la date ne doit pas reculer). */
  function dateLocale(now) {
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  }
  function heureLocale(now) { return pad(now.getHours()) + ':' + pad(now.getMinutes()); }

  function typeDe(field) {
    var t = String((field && field.type) || 'Text');
    return t.split(':')[0];
  }

  /** La source de départ déclarée par une question, ou null. */
  function departDe(field) {
    var d = field && field.options && field.options.depart;
    if (!d || typeof d !== 'object' || SOURCES_DEPART.indexOf(d.source) === -1) return null;
    return d;
  }

  /**
   * Ce qu'une question montre au départ.
   *
   * @param {object} field
   * @param {{ now: Date, email?: string, derniere?: function }} ctx
   * @returns {*} la valeur, ou undefined quand la source n'a rien à offrir
   */
  function valeurDepart(field, ctx) {
    var d = departDe(field);
    if (!d) return undefined;
    ctx = ctx || {};
    var now = ctx.now || new Date();
    var t = typeDe(field);
    var w = field.widget;
    switch (d.source) {
      case 'aujourdhui':
        if (t === 'Date') return dateLocale(now);
        if (t === 'DateTime') return dateLocale(now) + 'T00:00';
        return undefined;
      case 'maintenant':
        if (w === 'heure') return heureLocale(now);
        if (t === 'DateTime') return dateLocale(now) + 'T' + heureLocale(now);
        if (t === 'Date') return dateLocale(now);
        return undefined;
      case 'moi':
        // Le courriel de la personne connectée, quand l'hôte le sait ; sinon rien.
        return t === 'Text' && ctx.email ? String(ctx.email) : undefined;
      case 'derniere':
        return typeof ctx.derniere === 'function' ? ctx.derniere(field) : undefined;
      case 'valeur':
        return d.valeur === undefined ? undefined : d.valeur;
      default:
        return undefined;
    }
  }

  /** Les sources qui dépendent de ce que l'hôte apprend après coup (le courriel). */
  function departTardif(field) {
    var d = departDe(field);
    return !!d && d.source === 'moi';
  }

  // ── bornes ──

  function nombreOuNull(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Les bornes d'une question : nombres pour un nombre ; pour une date, une date
   * `AAAA-MM-JJ` ou le mot `aujourdhui`.
   */
  function bornesDe(field, now) {
    var o = (field && field.options) || {};
    var t = typeDe(field);
    if (t === 'Date' || t === 'DateTime') {
      var resolve = function (b) {
        if (b === 'aujourdhui') return dateLocale(now || new Date());
        return typeof b === 'string' && /^\d{4}-\d{2}-\d{2}/.test(b) ? b.slice(0, 10) : null;
      };
      return { min: resolve(o.min), max: resolve(o.max) };
    }
    return { min: nombreOuNull(o.min), max: nombreOuNull(o.max) };
  }

  function frDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : iso;
  }

  /** Message si la valeur sort des bornes, sinon ''. Une valeur vide n'est pas hors bornes. */
  function validerBornes(field, valeur, now) {
    if (valeur === null || valeur === undefined || valeur === '') return '';
    var b = bornesDe(field, now);
    if (b.min === null && b.max === null) return '';
    var t = typeDe(field);
    if (t === 'Date' || t === 'DateTime') {
      var jour = String(valeur).slice(0, 10);
      if (b.min !== null && jour < b.min) return 'La date ne peut pas précéder le ' + frDate(b.min) + '.';
      if (b.max !== null && jour > b.max) return 'La date ne peut pas dépasser le ' + frDate(b.max) + '.';
      return '';
    }
    var n = Number(valeur);
    if (!Number.isFinite(n)) return '';
    if (b.min !== null && b.max !== null && (n < b.min || n > b.max)) return 'La valeur doit être comprise entre ' + b.min + ' et ' + b.max + '.';
    if (b.min !== null && n < b.min) return 'La valeur doit être au moins ' + b.min + '.';
    if (b.max !== null && n > b.max) return 'La valeur doit être au plus ' + b.max + '.';
    return '';
  }

  // ── ordre entre deux questions ──

  /** La question dont celle-ci ne doit pas précéder la valeur (`options.apres`), ou null. */
  function apresDe(field) {
    var a = field && field.options && field.options.apres;
    return typeof a === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(a) ? a : null;
  }

  /**
   * Message si la valeur précède celle de la question qu'elle doit suivre.
   * Dates `AAAA-MM-JJ…`, heures `HH:MM` et nombres se comparent chacun à leur manière ;
   * une des deux valeurs vide ne contredit rien.
   */
  function validerApres(field, valeur, valeurAutre, libelleAutre) {
    if (!apresDe(field)) return '';
    if (valeur === null || valeur === undefined || valeur === '') return '';
    if (valeurAutre === null || valeurAutre === undefined || valeurAutre === '') return '';
    var t = typeDe(field);
    var trop;
    if (t === 'Int' || t === 'Numeric') trop = Number(valeur) < Number(valeurAutre);
    else trop = String(valeur) < String(valeurAutre);
    return trop ? 'Cette valeur ne peut pas précéder « ' + (libelleAutre || apresDe(field)) + ' ».' : '';
  }

  // ── heure seule ──

  /** `HH:MM`, de 00:00 à 23:59. Grist n'a pas de type heure : elle se range en texte. */
  function heureValide(v) {
    return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(String(v === null || v === undefined ? '' : v).trim());
  }

  function minutesDe(hhmm) {
    if (!heureValide(hhmm)) return null;
    var p = String(hhmm).trim().split(':');
    return Number(p[0]) * 60 + Number(p[1]);
  }

  // ── étiquettes libres ──

  var ETIQUETTE_LONGUEUR = 40;
  var ETIQUETTES_MAX = 20;

  /** Une étiquette : une ligne, sans caractères de commande, bornée. */
  function normaliserEtiquette(texte, longueur) {
    var s = String(texte === null || texte === undefined ? '' : texte)
      .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    return s.slice(0, longueur || ETIQUETTE_LONGUEUR);
  }

  /**
   * Ajouter une étiquette à la liste, sans doublon (la casse ne distingue pas),
   * dans la limite du plafond. Une étiquette vide ou refusée rend la liste telle quelle.
   */
  function ajouterEtiquette(liste, texte, opts) {
    opts = opts || {};
    var base = Array.isArray(liste) ? liste.map(String) : [];
    var e = normaliserEtiquette(texte, opts.longueur);
    if (!e) return base;
    var bas = e.toLowerCase();
    if (base.some(function (x) { return x.toLowerCase() === bas; })) return base;
    var plafond = Number(opts.max) > 0 ? Number(opts.max) : ETIQUETTES_MAX;
    if (base.length >= plafond) return base;
    base.push(e);
    return base;
  }

  function retirerEtiquette(liste, texte) {
    return (Array.isArray(liste) ? liste : []).map(String).filter(function (x) { return x !== String(texte); });
  }

  // ── couleurs ──

  /** Une couleur d'une question : `#rgb` ou `#rrggbb`, rien d'autre (elle finit dans un attribut de style). */
  function couleurValide(c) {
    return typeof c === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c);
  }

  // ── clavier du téléphone ──

  var INPUTMODES = ['none', 'text', 'decimal', 'numeric', 'tel', 'search', 'email', 'url'];
  var CLAVIER_DU_FORMAT = {
    courriel: { inputmode: 'email', autocomplete: 'email' },
    telephone: { inputmode: 'tel', autocomplete: 'tel' },
    codePostal: { inputmode: 'numeric', autocomplete: 'postal-code' },
    siren: { inputmode: 'numeric' },
    siret: { inputmode: 'numeric' }
  };

  /**
   * Le clavier qu'un téléphone doit ouvrir, et ce que le navigateur peut remplir.
   *
   * > **Un champ de courriel qui ouvre le clavier de texte fait perdre le @.**
   * > Le clavier se déduit du format demandé et du type de la colonne ; une
   * > question peut le dire elle-même (`options.clavier`). Le type du champ ne
   * > change pas : seul le clavier change, la saisie reste un texte.
   *
   * @param {object} field
   * @param {string|null} format le format de la question, s'il y en a un
   * @returns {{ inputmode?: string, autocomplete?: string }}
   */
  function clavierDe(field, format) {
    var o = (field && field.options) || {};
    var voulu = o.clavier && typeof o.clavier === 'object' ? o.clavier : {};
    var out = {};
    var t = typeDe(field);
    var base = (format && CLAVIER_DU_FORMAT[format]) || null;
    if (!base && (t === 'Int' || t === 'Numeric')) {
      // Un nombre négatif a besoin du signe moins : le clavier numérique d'un téléphone n'en a pas toujours.
      var min = nombreOuNull(o.min);
      if (min === null || min >= 0) base = { inputmode: t === 'Int' ? 'numeric' : 'decimal' };
    }
    if (base) { if (base.inputmode) out.inputmode = base.inputmode; if (base.autocomplete) out.autocomplete = base.autocomplete; }
    if (typeof voulu.inputmode === 'string' && INPUTMODES.indexOf(voulu.inputmode) !== -1) out.inputmode = voulu.inputmode;
    if (typeof voulu.autocomplete === 'string' && /^[a-z0-9-]{1,40}( [a-z0-9-]{1,40}){0,2}$/.test(voulu.autocomplete)) out.autocomplete = voulu.autocomplete;
    return out;
  }

  /** Les attributs HTML correspondants, déjà échappés (la liste blanche ne laisse rien passer d'autre). */
  function attributsClavier(field, format) {
    var c = clavierDe(field, format);
    return (c.inputmode ? ' inputmode="' + c.inputmode + '"' : '') + (c.autocomplete ? ' autocomplete="' + c.autocomplete + '"' : '');
  }

  // ── lieu : la carte, une adresse, ou les deux ──

  var MODES_LIEU = ['carte', 'adresse', 'les-deux'];

  /**
   * Comment une question de lieu se renseigne.
   *
   * > **Un lieu se dit de deux façons, et personne n'a la même à la main.** On
   * > touche la carte quand on est sur place ou qu'on sait où regarder ; on tape
   * > une adresse quand on la connaît et qu'on n'est pas devant la carte. Les
   * > deux écrivent le même point.
   *
   * Seul un point s'obtient par une adresse : une ligne ou une surface reste à la
   * carte. Sans le service d'adresses, la carte seule : une question ne promet
   * pas ce qu'elle ne sait pas tenir. Sans réglage, rien ne change.
   *
   * @param {object} field
   * @param {boolean} adresseDisponible le service d'adresses est-il là
   * @returns {'carte'|'adresse'|'les-deux'}
   */
  function modeLieu(field, adresseDisponible) {
    var o = (field && field.options) || {};
    if ((o.geometrie || 'Point') !== 'Point') return 'carte';
    if (!adresseDisponible) return 'carte';
    return MODES_LIEU.indexOf(o.saisieLieu) !== -1 ? o.saisieLieu : 'carte';
  }

  /**
   * Le lieu qu'une adresse choisie désigne : le point, au format de la colonne,
   * et le libellé à montrer. Une adresse sans coordonnées valides ne désigne rien.
   *
   * Les coordonnées sont des degrés ; `Number(null)` vaut 0, que l'on prendrait
   * pour un lieu au large du golfe de Guinée : on écarte l'absence avant de convertir.
   */
  function lieuDepuisSuggestion(s) {
    if (!s || s.longitude === null || s.longitude === undefined || s.latitude === null || s.latitude === undefined) return null;
    var lon = Number(s.longitude);
    var lat = Number(s.latitude);
    if (!isFinite(lon) || !isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
    var libelle = String(s.libelle === null || s.libelle === undefined ? '' : s.libelle)
      .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    return { wkt: 'POINT(' + lon + ' ' + lat + ')', longitude: lon, latitude: lat, libelle: libelle };
  }

  return {
    VERSION: VERSION,
    MODES_LIEU: MODES_LIEU,
    modeLieu: modeLieu,
    lieuDepuisSuggestion: lieuDepuisSuggestion,
    INPUTMODES: INPUTMODES,
    clavierDe: clavierDe,
    attributsClavier: attributsClavier,
    ETIQUETTE_LONGUEUR: ETIQUETTE_LONGUEUR,
    ETIQUETTES_MAX: ETIQUETTES_MAX,
    normaliserEtiquette: normaliserEtiquette,
    ajouterEtiquette: ajouterEtiquette,
    retirerEtiquette: retirerEtiquette,
    couleurValide: couleurValide,
    SOURCES_DEPART: SOURCES_DEPART,
    dateLocale: dateLocale,
    heureLocale: heureLocale,
    departDe: departDe,
    valeurDepart: valeurDepart,
    departTardif: departTardif,
    bornesDe: bornesDe,
    validerBornes: validerBornes,
    apresDe: apresDe,
    validerApres: validerApres,
    heureValide: heureValide,
    minutesDe: minutesDe
  };
}));

/*
 * formats.js — les formats qu'on contrôle sans rien demander à personne.
 *
 * IBAN, SIREN, SIRET, code postal, code INSEE, courriel, téléphone, nom, prénom : un calcul
 * ou un motif, jamais un appel réseau. Une valeur qui part ne quitte donc pas
 * la page, ce qui compte pour un IBAN.
 *
 * > **Une règle, deux exécutions.** Le navigateur contrôle pour guider la
 * > personne ; mais le serveur d'un formulaire natif accepte tout ce qu'on lui
 * > envoie. La colonne de conformité de la table doit donc refaire le même
 * > contrôle côté Grist. Chaque format porte les deux : `valider` (JavaScript)
 * > et `python` (la même règle en Python, collée telle quelle dans une formule).
 * > Les essais exécutent les deux sur les mêmes valeurs et exigent le même
 * > verdict — c'est ce qui empêche l'une de dériver de l'autre.
 *
 * Un format inconnu n'est pas une erreur : il ne contrôle rien. Un moteur plus
 * ancien que le formulaire ne bloque donc personne.
 */
(function (root, factory) {
  'use strict';
  var asNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  if (asNode && typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.FormFormats = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  // Longueur d'un IBAN par pays (les pays courants ; pour les autres, on ne
  // contrôle que la clé et une longueur plausible).
  var LONGUEURS_IBAN = {
    AD: 24, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20,
    ES: 24, FI: 18, FR: 27, GB: 22, GR: 27, HR: 21, HU: 28, IE: 22, IS: 26, IT: 27,
    LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25,
    RO: 24, SE: 24, SI: 19, SK: 24, SM: 27
  };

  function sansSeparateurs(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[\s.\-]/g, '');
  }

  // ── IBAN : clé modulo 97 ──
  function normaliserIban(v) { return sansSeparateurs(v).toUpperCase(); }
  function validerIban(v) {
    var s = normaliserIban(v);
    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(s)) return false;
    var n = LONGUEURS_IBAN[s.slice(0, 2)];
    if (n && s.length !== n) return false;
    var r = s.slice(4) + s.slice(0, 4);
    var reste = 0;
    for (var i = 0; i < r.length; i++) {
      var morceau = String(parseInt(r.charAt(i), 36));
      for (var j = 0; j < morceau.length; j++) reste = (reste * 10 + Number(morceau.charAt(j))) % 97;
    }
    return reste === 1;
  }

  // ── SIREN / SIRET : clé de Luhn ──
  function luhn(chiffres) {
    var somme = 0;
    for (var i = 0; i < chiffres.length; i++) {
      var d = Number(chiffres.charAt(chiffres.length - 1 - i));
      if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
      somme += d;
    }
    return somme % 10 === 0;
  }
  function normaliserChiffres(v) { return sansSeparateurs(v); }
  function validerSiren(v) {
    var s = normaliserChiffres(v);
    return /^[0-9]{9}$/.test(s) && luhn(s);
  }
  function validerSiret(v) {
    var s = normaliserChiffres(v);
    if (!/^[0-9]{14}$/.test(s)) return false;
    // Les établissements de La Poste (SIREN 356 000 000) ne suivent pas Luhn :
    // la somme de leurs chiffres est un multiple de 5.
    if (s.slice(0, 9) === '356000000') {
      var t = 0;
      for (var i = 0; i < 14; i++) t += Number(s.charAt(i));
      return t % 5 === 0;
    }
    return luhn(s);
  }

  // ── Motifs simples ──
  function normaliserTexte(v) { return String(v === null || v === undefined ? '' : v).trim(); }
  function validerCodePostal(v) {
    var s = sansSeparateurs(v);
    return /^[0-9]{5}$/.test(s) && Number(s) >= 1000 && Number(s) <= 98999;
  }
  function validerInsee(v) {
    return /^([0-9]{2}|2A|2B)[0-9]{3}$/.test(normaliserTexte(v).toUpperCase());
  }
  function validerCourriel(v) {
    var s = normaliserTexte(v);
    return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
  }
  function normaliserTelephone(v) {
    var s = String(v === null || v === undefined ? '' : v).replace(/[\s.\-()]/g, '');
    if (s.indexOf('+33') === 0) s = '0' + s.slice(3);
    else if (s.indexOf('0033') === 0) s = '0' + s.slice(4);
    return s;
  }
  function validerHeure(v) {
    return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(normaliserTexte(v));
  }
  function validerTelephone(v) {
    return /^0[1-9][0-9]{8}$/.test(normaliserTelephone(v));
  }

  // ── nom, prénom : des lettres, et la forme qu'on enregistre ──
  //
  // > **Un nom n'est pas du texte libre.** « jean-pierre DUPONT » et « Dupont » sont une même
  // > personne écrite de trois façons ; le tri, le publipostage et les doublons s'en ressentent.
  // > Le nom s'écrit en MAJUSCULES (l'usage administratif), le prénom prend une initiale après
  // > chaque espace, tiret ou apostrophe. « Nom et prénom » dans un seul champ garde les
  // > particules en minuscules (de, du, la). La forme corrigée se montre à la saisie.
  //
  // Valable : des lettres (accentuées comprises), espaces, tirets, apostrophes, point ; 60
  // signes au plus ; commence par une lettre ; pas de chiffre ni de symbole.
  function nfc(v) {
    var s = String(v === null || v === undefined ? '' : v);
    return s.normalize ? s.normalize('NFC') : s;
  }
  function espacesPropres(v) { return nfc(v).replace(/\s+/g, ' ').trim(); }
  var PARTICULES = ['de', 'du', 'des', 'la', 'le', 'les', 'd', 'l', 'van', 'von', 'der', 'den', 'di', 'da', 'del', 'dos', 'ter', 'ten'];
  function validerPartieNom(v) {
    var s = espacesPropres(v);
    if (!s || s.length > 60 || !/^\p{L}/u.test(s)) return false;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (!/\p{L}/u.test(c) && " '’.-".indexOf(c) === -1) return false;
    }
    return !/(--|''|’’)/.test(s);
  }
  function majusculesInitiales(s) {
    return s.toLocaleLowerCase('fr').replace(/(^|[ \-'’.])(\p{L})/gu, function (m, avant, lettre) {
      return avant + lettre.toLocaleUpperCase('fr');
    });
  }
  function normaliserNom(v) { return espacesPropres(v).toLocaleUpperCase('fr'); }
  function normaliserPrenom(v) { return majusculesInitiales(espacesPropres(v)); }
  function normaliserNomComplet(v) {
    return majusculesInitiales(espacesPropres(v)).split(' ').map(function (mot, i) {
      return i > 0 && PARTICULES.indexOf(mot.toLowerCase()) !== -1 ? mot.toLowerCase() : mot;
    }).join(' ');
  }
  function validerNomComplet(v) {
    return validerPartieNom(v) && espacesPropres(v).split(' ').length >= 2;
  }
  function normaliserCourriel(v) { return normaliserTexte(v).toLowerCase(); }

  /*
   * Le même contrôle en Python, pour la colonne de conformité. Chaque entrée est
   * le corps d'une fonction `fmt_<id>(v)` qui rend un booléen ; `import re` est
   * dans le corps, une formule Grist pouvant importer un module.
   */
  var PY_SANS_SEP = "s = re.sub(r'[\\s.\\-]', '', '' if v is None else str(v))";

  /** La règle des noms en Python (`mots` : nombre de mots au moins) : même verdict que `validerPartieNom`. */
  function pythonNom(id, mots) {
    return [
      'def fmt_' + id + '(v):',
      '  import re, unicodedata',
      "  s = re.sub(r'\\s+', ' ', unicodedata.normalize('NFC', '' if v is None else str(v))).strip()",
      '  if not s or len(s) > 60 or not s[0].isalpha():',
      '    return False',
      '  for c in s:',
      "    if not (c.isalpha() or c in \" '\\u2019.-\"):",
      '      return False',
      "  if re.search(\"(--|''|\\u2019\\u2019)\", s):",
      '    return False',
      "  return len(s.split(' ')) >= " + mots
    ].join('\n');
  }
  var PYTHON = {
    iban: [
      'def fmt_iban(v):',
      '  import re',
      '  ' + PY_SANS_SEP + '.upper()',
      "  if not re.match(r'^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$', s):",
      '    return False',
      '  longueurs = ' + JSON.stringify(LONGUEURS_IBAN).replace(/"/g, "'"),
      '  n = longueurs.get(s[:2])',
      '  if n and len(s) != n:',
      '    return False',
      '  r = s[4:] + s[:4]',
      "  return int(''.join(str(int(c, 36)) for c in r)) % 97 == 1"
    ].join('\n'),
    siren: [
      'def fmt_siren(v):',
      '  import re',
      '  ' + PY_SANS_SEP,
      "  if not re.match(r'^[0-9]{9}$', s):",
      '    return False',
      '  somme = 0',
      '  for i, c in enumerate(reversed(s)):',
      '    d = int(c)',
      '    if i % 2 == 1:',
      '      d = d * 2',
      '      if d > 9:',
      '        d = d - 9',
      '    somme = somme + d',
      '  return somme % 10 == 0'
    ].join('\n'),
    siret: [
      'def fmt_siret(v):',
      '  import re',
      '  ' + PY_SANS_SEP,
      "  if not re.match(r'^[0-9]{14}$', s):",
      '    return False',
      "  if s[:9] == '356000000':",
      '    return sum(int(c) for c in s) % 5 == 0',
      '  somme = 0',
      '  for i, c in enumerate(reversed(s)):',
      '    d = int(c)',
      '    if i % 2 == 1:',
      '      d = d * 2',
      '      if d > 9:',
      '        d = d - 9',
      '    somme = somme + d',
      '  return somme % 10 == 0'
    ].join('\n'),
    codePostal: [
      'def fmt_codePostal(v):',
      '  import re',
      '  ' + PY_SANS_SEP,
      "  return bool(re.match(r'^[0-9]{5}$', s)) and 1000 <= int(s) <= 98999"
    ].join('\n'),
    insee: [
      'def fmt_insee(v):',
      '  import re',
      "  s = ('' if v is None else str(v)).strip().upper()",
      "  return bool(re.match(r'^([0-9]{2}|2A|2B)[0-9]{3}$', s))"
    ].join('\n'),
    heure: [
      'def fmt_heure(v):',
      '  import re',
      "  s = ('' if v is None else str(v)).strip()",
      "  return bool(re.match(r'^([01][0-9]|2[0-3]):[0-5][0-9]$', s))"
    ].join('\n'),
    nom: pythonNom('nom', 1),
    prenom: pythonNom('prenom', 1),
    nomComplet: pythonNom('nomComplet', 2),
    courriel: [
      'def fmt_courriel(v):',
      '  import re',
      "  s = ('' if v is None else str(v)).strip()",
      "  return len(s) <= 254 and bool(re.match(r'^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$', s))"
    ].join('\n'),
    telephone: [
      'def fmt_telephone(v):',
      '  import re',
      "  s = re.sub(r'[\\s.\\-()]', '', '' if v is None else str(v))",
      "  if s.startswith('+33'):",
      "    s = '0' + s[3:]",
      "  elif s.startswith('0033'):",
      "    s = '0' + s[4:]",
      "  return bool(re.match(r'^0[1-9][0-9]{8}$', s))"
    ].join('\n')
  };

  var FORMATS = {
    iban: { id: 'iban', libelle: 'IBAN', message: 'Ce n’est pas un IBAN valide.', normaliser: normaliserIban, valider: validerIban, python: PYTHON.iban },
    siren: { id: 'siren', libelle: 'SIREN', message: 'Ce n’est pas un SIREN valide (9 chiffres).', normaliser: normaliserChiffres, valider: validerSiren, python: PYTHON.siren },
    siret: { id: 'siret', libelle: 'SIRET', message: 'Ce n’est pas un SIRET valide (14 chiffres).', normaliser: normaliserChiffres, valider: validerSiret, python: PYTHON.siret },
    codePostal: { id: 'codePostal', libelle: 'Code postal', message: 'Ce n’est pas un code postal (5 chiffres).', normaliser: normaliserChiffres, valider: validerCodePostal, python: PYTHON.codePostal },
    insee: { id: 'insee', libelle: 'Code INSEE de commune', message: 'Ce n’est pas un code INSEE de commune.', normaliser: function (v) { return normaliserTexte(v).toUpperCase(); }, valider: validerInsee, python: PYTHON.insee },
    heure: { id: 'heure', libelle: 'Heure (HH:MM)', message: 'Ce n’est pas une heure (HH:MM).', normaliser: normaliserTexte, valider: validerHeure, python: PYTHON.heure },
    courriel: { id: 'courriel', libelle: 'Courriel', message: 'Ce n’est pas une adresse de courriel.', normaliser: normaliserCourriel, valider: validerCourriel, python: PYTHON.courriel, corrige: true },
    nom: { id: 'nom', libelle: 'Nom de famille', message: 'Un nom ne contient que des lettres, des espaces, des tirets ou des apostrophes.', normaliser: normaliserNom, valider: validerPartieNom, python: PYTHON.nom, corrige: true },
    prenom: { id: 'prenom', libelle: 'Prénom', message: 'Un prénom ne contient que des lettres, des espaces, des tirets ou des apostrophes.', normaliser: normaliserPrenom, valider: validerPartieNom, python: PYTHON.prenom, corrige: true },
    nomComplet: { id: 'nomComplet', libelle: 'Nom et prénom (un champ)', message: 'Écrivez le prénom et le nom, en lettres (par exemple « Marie Dupont »).', normaliser: normaliserNomComplet, valider: validerNomComplet, python: PYTHON.nomComplet, corrige: true },
    telephone: { id: 'telephone', libelle: 'Téléphone (France)', message: 'Ce n’est pas un numéro de téléphone français.', normaliser: normaliserTelephone, valider: validerTelephone, python: PYTHON.telephone }
  };

  function connu(id) { return Object.prototype.hasOwnProperty.call(FORMATS, id); }
  function formatDe(id) { return connu(id) ? FORMATS[id] : null; }

  /** Une valeur vide ne se contrôle pas : l'obligation est une autre règle. */
  function vide(v) { return v === null || v === undefined || String(v).trim() === ''; }

  /** Verdict pour une valeur ; un format inconnu laisse tout passer. */
  function valide(id, valeur) {
    var f = formatDe(id);
    if (!f || vide(valeur)) return true;
    return f.valider(valeur);
  }

  function normalise(id, valeur) {
    var f = formatDe(id);
    if (!f || vide(valeur)) return valeur;
    return f.normaliser(valeur);
  }

  /** La forme corrigée se montre dès la saisie (nom, prénom, courriel) : la personne voit ce qui sera enregistré. */
  function corrige(id) {
    var f = formatDe(id);
    return !!(f && f.corrige);
  }

  function message(id) {
    var f = formatDe(id);
    return f ? f.message : '';
  }

  /** Le format qu'une question demande, ou null. */
  function formatDeChamp(field) {
    var v = field && field.options && field.options.validation;
    if (v && typeof v.format === 'string' && connu(v.format)) return v.format;
    // Une question d'heure range du texte « HH:MM » : le format va de soi.
    return field && field.widget === 'heure' ? 'heure' : null;
  }

  /**
   * Le Python à coller en tête d'une formule, pour les formats utilisés, sans
   * doublon, et l'appel de contrôle d'une colonne.
   */
  function definitionsPython(ids) {
    var vus = {};
    var blocs = [];
    ids.forEach(function (id) {
      if (connu(id) && !vus[id]) { vus[id] = true; blocs.push(FORMATS[id].python); }
    });
    return blocs.join('\n');
  }

  /** `fmt_iban($Iban)` ; une colonne vide n'est pas un format faux. */
  function appelPython(id, expression) {
    return '(not ' + expression + ' or fmt_' + id + '(' + expression + '))';
  }

  return {
    VERSION: VERSION,
    FORMATS: FORMATS,
    LONGUEURS_IBAN: LONGUEURS_IBAN,
    connu: connu,
    valide: valide,
    normalise: normalise,
    corrige: corrige,
    message: message,
    formatDeChamp: formatDeChamp,
    definitionsPython: definitionsPython,
    appelPython: appelPython
  };
}));

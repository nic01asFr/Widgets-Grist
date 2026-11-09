/* Licence MIT — noyau commun de saisies mobiles. */
/* Fichier GÉNÉRÉ depuis noyau-saisies.js : ne pas éditer. Régénérer avec `node projects/grist_forms/outils/generer-noyau-esm.js`. */
const noyau = (function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 1. Le vocabulaire fermé.
   * ------------------------------------------------------------------ */

  var CAPACITES = Object.freeze(['camera', 'micro', 'position', 'orientation', 'scanner']);
  var SERVICES = Object.freeze(['transcrire', 'extraire']);
  /** Sept genres, ceux du kit d'appkit. `annulee` n'est pas un échec : une demande devenue inutile. */
  var GENRES = Object.freeze(['reseau', 'droits', 'limite', 'forme', 'delai', 'vide', 'annulee']);
  var GESTES = Object.freeze(['voix', 'audio', 'scan', 'photo', 'position']);
  var ETATS_SUGGESTION = Object.freeze(['propose', 'acceptee', 'modifiee', 'refusee']);

  /** Ceux que l'on réessaie. `droits` et `forme` jamais : un droit retiré ne se contourne pas. */
  var REESSAYABLES = Object.freeze(['reseau', 'delai', 'limite', 'vide']);

  /**
   * Politique de réessai. Les valeurs sont celles du kit, qui les a mesurées (réponses vides aléatoires
   * passées au réessai espacé) : 4 essais au total, le premier compris, sans doublement. Une attente
   * demandée par le service est vécue jusqu'à `plafondAttenteS` ; au-delà on ne bloque pas la personne.
   */
  var POLITIQUE_DEFAUT = Object.freeze({
    essais: 4,
    attentes: Object.freeze([500, 1500, 4000]),
    plafondAttenteS: 30
  });

  function contient(liste, v) { return liste.indexOf(v) !== -1; }
  function estObjet(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function estVide(v) {
    return v === null || v === undefined || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0);
  }
  function majuscule(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  /* ------------------------------------------------------------------ *
   * 2. Résoudre une saisie : directe, ou repli.
   * ------------------------------------------------------------------ */

  var GESTE_DU_WIDGET = { voix: 'voix', audio: 'audio', scan: 'scan', photo: 'photo', geo: 'position' };
  var CAPACITE_DU_GESTE = { voix: 'micro', audio: 'micro', scan: 'scanner', photo: 'camera', position: 'position' };
  var REPLI_DU_GESTE = { voix: 'textarea', audio: 'file', scan: 'text', photo: 'file', position: 'geo' };

  /**
   * Ce que le champ demande, et ce que l'hôte lui donne.
   *
   * @param {object} champ  champ du FormDef (`widget`, `options.capacite`)
   * @param {object} [hote] objet `hote` du contrat `hote-capacites-0.1`
   * @param {string[]} [refus] capacités refusées à l'exécution par la personne
   * @returns {{geste:?string, mode:string, capacite:?string, widgetRepli:?string, raison:?string, transcription:boolean}}
   *   `mode` : `direct` ou `repli`. `raison` : `aucun-geste`, `hote-absent`, `capacite-absente`, `capacite-refusee`.
   */
  function resoudreSaisie(champ, hote, refus) {
    var f = estObjet(champ) ? champ : {};
    var options = estObjet(f.options) ? f.options : {};
    var geste = GESTE_DU_WIDGET[f.widget] || null;
    // Une capacité nommée dans les options, mais inconnue, est ignorée : jamais une erreur.
    var declaree = typeof options.capacite === 'string' && contient(CAPACITES, options.capacite) ? options.capacite : null;

    if (!geste && !declaree) {
      return { geste: null, mode: 'direct', capacite: null, widgetRepli: null, raison: 'aucun-geste', transcription: false };
    }
    var capacite = declaree || CAPACITE_DU_GESTE[geste];
    var repli = geste ? REPLI_DU_GESTE[geste] : null;

    var capacites = estObjet(hote) && estObjet(hote.capacites) ? hote.capacites : null;
    if (!capacites) {
      return { geste: geste, mode: 'repli', capacite: capacite, widgetRepli: repli, raison: 'hote-absent', transcription: false };
    }
    if (capacites[capacite] !== true) {
      return { geste: geste, mode: 'repli', capacite: capacite, widgetRepli: repli, raison: 'capacite-absente', transcription: false };
    }
    if (Array.isArray(refus) && contient(refus, capacite)) {
      return { geste: geste, mode: 'repli', capacite: capacite, widgetRepli: repli, raison: 'capacite-refusee', transcription: false };
    }
    var services = estObjet(hote.services) ? hote.services : {};
    var transcription = geste === 'voix' && estObjet(services.transcrire) && typeof services.transcrire.appeler === 'function';
    return { geste: geste, mode: 'direct', capacite: capacite, widgetRepli: repli, raison: null, transcription: transcription };
  }

  /* ------------------------------------------------------------------ *
   * 3. Les genres d'échec : statut, phrase, assainissement.
   * ------------------------------------------------------------------ */

  /**
   * Le genre d'une erreur d'après le statut HTTP. Rend `null` pour un statut de réussite (2xx) : un
   * `vide` n'est jamais déduit du statut ni du corps, c'est le transport qui le marque.
   */
  function genreDepuisStatut(statut) {
    var n = (typeof statut === 'number') ? statut : (typeof statut === 'string' && statut.trim() !== '' ? Number(statut) : NaN);
    if (!isFinite(n)) return 'reseau';
    if (n >= 200 && n < 300) return null;
    if (n === 401 || n === 403) return 'droits';
    if (n === 429) return 'limite';
    if (n === 408 || n === 504) return 'delai';
    if (n >= 500) return 'reseau';
    // 1xx, 3xx et tout autre 4xx : la requête n'a pas pu aboutir telle quelle.
    return 'forme';
  }

  function reessayable(genre) { return contient(REESSAYABLES, genre); }

  /**
   * La phrase courante d'un genre, la même dans les deux rendus.
   * @param {string} genre
   * @param {{sujet?:string, objet?:string}} [o] `sujet` : ce que fait le service (« le service de lecture ») ;
   *   `objet` : ce qu'il n'a pas pu traiter (« ce document »).
   */
  function phrase(genre, o) {
    o = o || {};
    var sujet = typeof o.sujet === 'string' && o.sujet.trim() ? o.sujet.trim() : 'le service';
    var objet = typeof o.objet === 'string' && o.objet.trim() ? o.objet.trim() : 'cette demande';
    var S = majuscule(sujet);
    switch (genre) {
      case 'reseau': return S + ' ne répond pas. Réessayez dans un instant.';
      case 'droits': return S + " refuse l'accès. Vérifiez vos droits ou prévenez l'administrateur.";
      case 'limite': return S + ' reçoit trop de demandes. Réessayez dans un instant.';
      case 'delai': return S + ' a mis trop de temps à répondre. Réessayez dans un instant.';
      case 'vide': return "Rien n'a été reconnu. Essayez plus nettement ou saisissez la valeur à la main.";
      case 'annulee': return 'La demande a été annulée.';
      default: return S + " n'a pas pu traiter " + objet + '. Essayez autrement.';
    }
  }

  var MASQUE = '[masqué]';
  var MASQUE_ADRESSE = '[adresse masquée]';

  function echapper(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /** Le nom d'hôte d'une adresse, sans chemin ni port ni identifiants ; `null` s'il n'y en a pas. */
  function nomDHote(adresse) {
    if (typeof adresse !== 'string') return null;
    var m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^\/@\s]*@)?([^\/:?#\s]+)/i.exec(adresse.trim());
    return m && m[1] ? m[1] : null;
  }

  /**
   * Un message sans clé, sans jeton, sans adresse. Deux gardes : les secrets connus de l'appelant (la
   * clé et l'adresse que la personne a saisies) sont retirés à l'identique ; les motifs d'URL, de jeton
   * et de longue chaîne opaque le sont dans tous les cas.
   *
   * @param {*} message
   * @param {string[]} [secrets]
   */
  function assainirMessage(message, secrets) {
    var s = (message === null || message === undefined) ? '' : String(message);
    var vus = [];
    (Array.isArray(secrets) ? secrets : []).forEach(function (secret) {
      if (typeof secret !== 'string' || secret.length < 3) return;
      vus.push(secret);
      // Une adresse est aussi retirée par son nom d'hôte seul, qui suffit à la désigner.
      var hote = nomDHote(secret);
      if (hote && hote.length >= 3 && /[.:]|localhost/i.test(hote)) vus.push(hote);
      try { var enc = encodeURIComponent(secret); if (enc !== secret) vus.push(enc); } catch (e) { /* chaîne non encodable : ignorée */ }
    });
    // Les plus longs d'abord : une adresse entière avant son nom d'hôte.
    vus.sort(function (a, b) { return b.length - a.length; }).forEach(function (secret) {
      s = s.split(secret).join(MASQUE);
    });
    s = s.replace(/\bBearer\s+[A-Za-z0-9._~+\/=-]+/gi, 'Bearer ' + MASQUE);
    s = s.replace(/\b(api[_-]?key|x-api-key|authorization|token|secret|password|mot de passe)(\s*[:=]\s*)(\S+)/gi, '$1$2' + MASQUE);
    s = s.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)\]]+/gi, MASQUE_ADRESSE);
    s = s.replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, MASQUE_ADRESSE);
    s = s.replace(/\blocalhost(?::\d+)?\b/gi, MASQUE_ADRESSE);
    s = s.replace(/\b[A-Za-z0-9_-]{24,}\b/g, MASQUE);
    return s;
  }

  /**
   * L'avertissement à montrer avant d'envoyer quoi que ce soit : rien si le service reste sur l'appareil.
   * Sinon (`tiers` ou indication absente), les données quittent l'appareil, et on nomme le service —
   * son nom d'hôte seulement, jamais l'adresse entière ni la clé.
   */
  function avertissementSortant(service) {
    var s = estObjet(service) ? service : {};
    if (s.sortant === 'local') return null;
    var nom = nomDHote(s.nom);
    return {
      cle: 'donnees-quittent-appareil',
      service: nom,
      phrase: 'Ce que vous avez enregistré sera envoyé à ' + (nom || 'un service tiers') + ', hors de cet appareil.'
    };
  }

  /* ------------------------------------------------------------------ *
   * 4. Appeler un service : typé, réessayable, annulable.
   * ------------------------------------------------------------------ */

  function nombreFini(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  /** Une erreur typée, le message assaini, rien d'autre que ce que le contrat promet. */
  function fabriquerErreur(genre, brut, o) {
    var g = contient(GENRES, genre) ? genre : 'forme';
    var texte = '';
    if (typeof brut === 'string') texte = brut;
    else if (brut && typeof brut.message === 'string') texte = brut.message;
    var message = assainirMessage(texte, o.secrets).trim();
    var e = { genre: g, message: message || phrase(g, { sujet: o.sujet, objet: o.objet }) };
    var statut = brut && estObjet(brut) ? nombreFini(brut.statut) : null;
    if (statut !== null) e.statut = statut;
    var apres = brut && estObjet(brut) ? nombreFini(brut.reessayerApres) : null;
    if (apres !== null && apres >= 0) e.reessayerApres = apres;
    return e;
  }

  /**
   * Un seul appel, normalisé : `{ ok: true, valeur }` ou `{ ok: false, erreur }`. Trois formes de retour
   * sont acceptées d'un service : celle du contrat (`{ ok, … }`), celle du transport du kit
   * (`{ statut, valeurs?, anomalies?, vide?, reessayerApres? }`) et la valeur brute ; une exception est
   * un `reseau`, sauf `AbortError` ou signal levé (`annulee`).
   */
  async function unAppel(service, entree, signal, o) {
    var res;
    try {
      res = await service.appeler(entree, { signal: signal });
    } catch (err) {
      if ((err && err.name === 'AbortError') || (signal && signal.aborted)) return { ok: false, erreur: fabriquerErreur('annulee', null, o) };
      var statutErr = err && estObjet(err) ? nombreFini(err.statut) : null;
      var genreErr = err && typeof err.genre === 'string' && contient(GENRES, err.genre)
        ? err.genre
        : (statutErr !== null ? (genreDepuisStatut(statutErr) || 'reseau') : 'reseau');
      return { ok: false, erreur: fabriquerErreur(genreErr, err, o) };
    }
    if (estObjet(res) && estObjet(res.erreur) && typeof res.erreur.genre === 'string') {
      return { ok: false, erreur: fabriquerErreur(res.erreur.genre, res.erreur, o) };
    }
    if (estObjet(res) && res.ok === false) return { ok: false, erreur: fabriquerErreur('forme', res.erreur || null, o) };
    if (estObjet(res) && res.ok === true) return { ok: true, valeur: res.valeur };
    if (estObjet(res) && Object.prototype.hasOwnProperty.call(res, 'statut')) {
      var genre = genreDepuisStatut(res.statut);
      if (genre) return { ok: false, erreur: fabriquerErreur(genre, res, o) };
      // Réussite : `vide` est marqué par le transport, jamais déduit du corps.
      if (res.vide === true) return { ok: false, erreur: fabriquerErreur('vide', res, o) };
      return { ok: true, valeur: res };
    }
    if (res === null || res === undefined) return { ok: false, erreur: fabriquerErreur('forme', null, o) };
    return { ok: true, valeur: res };
  }

  /**
   * Appeler un service du contrat, avec réessai, annulation et message assaini.
   *
   * @param {{appeler:function, sortant?:string, nom?:string}} service
   * @param {*} entree
   * @param {object} [options]
   * @param {AbortSignal} [options.signal]
   * @param {function(number, AbortSignal):Promise} [options.attendre] attente injectée ; sans elle, un seul essai
   * @param {object} [options.politique] surcharge de `POLITIQUE_DEFAUT`
   * @param {string[]} [options.secrets] clé et adresse saisies par la personne, retirées de tout message
   * @param {string} [options.sujet] @param {string} [options.objet] pour les phrases
   * @returns {Promise<{ok:true, valeur:*, tentatives:number}|{ok:false, erreur:{genre:string, message:string, statut?:number, reessayerApres?:number}, tentatives:number}>}
   */
  async function appelerService(service, entree, options) {
    var o = options || {};
    var politique = {
      essais: (o.politique && o.politique.essais) || POLITIQUE_DEFAUT.essais,
      attentes: (o.politique && o.politique.attentes) || POLITIQUE_DEFAUT.attentes,
      plafondAttenteS: (o.politique && o.politique.plafondAttenteS) || POLITIQUE_DEFAUT.plafondAttenteS
    };
    var signal = o.signal;
    var contexte = { secrets: o.secrets, sujet: o.sujet, objet: o.objet };

    if (!estObjet(service) || typeof service.appeler !== 'function') {
      return { ok: false, erreur: fabriquerErreur('forme', 'service absent', contexte), tentatives: 0 };
    }
    var tentatives = 0;
    for (;;) {
      if (signal && signal.aborted) return { ok: false, erreur: fabriquerErreur('annulee', null, contexte), tentatives: tentatives };
      tentatives++;
      var r = await unAppel(service, entree, signal, contexte);
      if (r.ok) return { ok: true, valeur: r.valeur, tentatives: tentatives };

      var erreur = r.erreur;
      var encore = reessayable(erreur.genre) && tentatives < politique.essais && typeof o.attendre === 'function';
      if (!encore) return { ok: false, erreur: erreur, tentatives: tentatives };

      var delai = politique.attentes[Math.min(tentatives - 1, politique.attentes.length - 1)];
      if (typeof erreur.reessayerApres === 'number') {
        // Le service demande une attente : on la vit jusqu'au plafond, jamais au-delà. Au-delà, la personne
        // n'est pas bloquée : on rend l'erreur avec le délai conseillé.
        if (erreur.reessayerApres > politique.plafondAttenteS) return { ok: false, erreur: erreur, tentatives: tentatives };
        delai = erreur.reessayerApres * 1000;
      }
      try {
        await o.attendre(delai, signal);
      } catch (e) {
        return { ok: false, erreur: fabriquerErreur('annulee', null, contexte), tentatives: tentatives };
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * 5. Vérifier ce qu'un service propose.
   *
   * Pas de troisième normaliseur : le moteur de lecture documentaire a déjà `normaliser(resultats,
   * champs)`. Ici on traduit les champs du FormDef vers sa déclaration et on lui délègue, injecté par
   * l'appelant. On dépend du contrat (signature, forme d'anomalie), pas du chemin du fichier.
   * ------------------------------------------------------------------ */

  var TYPE_DECLARE = { Text: 'texte', Int: 'entier', Numeric: 'reel', Bool: 'booleen', Date: 'date', Choice: 'choix' };

  /**
   * @param {object} valeurs  ce que `extraire` a rendu, par `colId`
   * @param {Array<{colId:string, type:string, options?:{choices?:string[]}}>} champsVises
   * @param {function(object, object[]):{valeurs:object, anomalies:object[]}} normaliser  le normaliseur injecté
   * @returns {{valeurs:object, anomalies:object[]}} `null` n'est pas `[]` : un champ non lu vaut `null`
   */
  function verifierValeurs(valeurs, champsVises, normaliser) {
    if (typeof normaliser !== 'function') throw new TypeError('verifierValeurs : normaliser (injecté) est requis');
    var brut = estObjet(valeurs) ? valeurs : {};
    var champs = Array.isArray(champsVises) ? champsVises : [];
    var declaration = [];
    var anomalies = [];
    var sortie = {};
    var vises = {};

    champs.forEach(function (c) {
      if (!estObjet(c) || !c.colId) return;
      vises[c.colId] = true;
      var type = TYPE_DECLARE[c.type];
      if (!type) {
        // Rien n'est écarté en silence : le type n'est pas vérifiable, on le dit, valeur brute à l'appui.
        sortie[c.colId] = null;
        var a = { champ: c.colId, quoi: 'type non pris en charge', grave: true };
        if (!estVide(brut[c.colId])) a.brut = brut[c.colId];
        anomalies.push(a);
        return;
      }
      var d = { nom: c.colId, type: type };
      if (type === 'choix') d.choix = estObjet(c.options) && Array.isArray(c.options.choices) ? c.options.choices : [];
      declaration.push(d);
    });

    var r = normaliser(brut, declaration) || { valeurs: {}, anomalies: [] };
    Object.keys(r.valeurs || {}).forEach(function (k) { sortie[k] = r.valeurs[k]; });
    (r.anomalies || []).forEach(function (a) { anomalies.push(a); });

    Object.keys(brut).forEach(function (k) {
      if (vises[k]) return;
      anomalies.push({ champ: k, quoi: 'champ non visé', brut: brut[k], grave: false });
    });
    return { valeurs: sortie, anomalies: anomalies };
  }

  /* ------------------------------------------------------------------ *
   * 6. L'état d'une suggestion.
   *
   * `propose` → `acceptee` | `modifiee` | `refusee`, décision finale. Une extraction ne fait que proposer :
   * elle n'écrit jamais, et ne remplace jamais une valeur décidée ou saisie.
   * ------------------------------------------------------------------ */

  /**
   * Une proposition pour un champ, ou `null` si le service n'a rien lu (`null`/absent : le champ reste à saisir).
   * `ecrase` vaut vrai quand le champ a déjà une valeur : le rendu doit le montrer.
   */
  function proposer(colId, valeurProposee, valeurActuelle) {
    if (valeurProposee === null || valeurProposee === undefined) return null;
    return { colId: colId, etat: 'propose', proposee: valeurProposee, actuelle: valeurActuelle === undefined ? null : valeurActuelle, ecrase: !estVide(valeurActuelle) };
  }

  /**
   * @param {object} suggestion
   * @param {{type:'accepter'|'modifier'|'refuser', valeur?:*}} decision
   * @returns {{suggestion:object, ecrire:?{colId:string, valeur:*}, ignoree:boolean}}
   *   `ecrire` est ce que l'hôte doit écrire, `null` sinon ; le noyau n'écrit rien lui-même.
   */
  function appliquerDecision(suggestion, decision) {
    if (!estObjet(suggestion) || suggestion.etat !== 'propose' || !estObjet(decision)) {
      return { suggestion: suggestion, ecrire: null, ignoree: true };
    }
    var base = { colId: suggestion.colId, proposee: suggestion.proposee, actuelle: suggestion.actuelle, ecrase: suggestion.ecrase };
    function finale(etat, ecrire) {
      var s = Object.assign({}, base, { etat: etat });
      return { suggestion: s, ecrire: ecrire, ignoree: false };
    }
    if (decision.type === 'accepter') return finale('acceptee', { colId: suggestion.colId, valeur: suggestion.proposee });
    if (decision.type === 'modifier') {
      // Corriger en vidant revient à refuser : rien n'est écrit.
      if (estVide(decision.valeur)) return finale('refusee', null);
      return finale('modifiee', { colId: suggestion.colId, valeur: decision.valeur });
    }
    if (decision.type === 'refuser') return finale('refusee', null);
    return { suggestion: suggestion, ecrire: null, ignoree: true };
  }

  /* ------------------------------------------------------------------ *
   * 7. Les limites d'une pièce.
   * ------------------------------------------------------------------ */

  function enMo(octets) { return Math.round(octets / 104857.6) / 10; }

  /**
   * @param {{type:'audio'|'photo', octets?:number, secondes?:number}} piece
   * @param {{audioSecondes?:number, audioOctets?:number, photoOctets?:number}} [limites] celles du contrat d'hôte
   * @returns {{ok:true}|{ok:false, erreur:{genre:'forme', message:string}}}
   */
  function controlerLimites(piece, limites) {
    var p = estObjet(piece) ? piece : {};
    var l = estObjet(limites) ? limites : {};
    function refus(message) { return { ok: false, erreur: { genre: 'forme', message: message } }; }

    if (p.type === 'audio') {
      if (typeof l.audioSecondes === 'number' && typeof p.secondes === 'number' && p.secondes > l.audioSecondes) {
        return refus("L'enregistrement dépasse la durée permise (" + l.audioSecondes + ' s).');
      }
      if (typeof l.audioOctets === 'number' && typeof p.octets === 'number' && p.octets > l.audioOctets) {
        return refus("L'enregistrement dépasse la taille permise (" + enMo(l.audioOctets) + ' Mo).');
      }
    } else if (p.type === 'photo') {
      if (typeof l.photoOctets === 'number' && typeof p.octets === 'number' && p.octets > l.photoOctets) {
        return refus('La photo dépasse la taille permise (' + enMo(l.photoOctets) + ' Mo).');
      }
    }
    return { ok: true };
  }

  return {
    CAPACITES: CAPACITES, SERVICES: SERVICES, GENRES: GENRES, GESTES: GESTES, ETATS_SUGGESTION: ETATS_SUGGESTION,
    POLITIQUE_DEFAUT: POLITIQUE_DEFAUT,
    resoudreSaisie: resoudreSaisie,
    genreDepuisStatut: genreDepuisStatut,
    reessayable: reessayable,
    phrase: phrase,
    assainirMessage: assainirMessage,
    nomDHote: nomDHote,
    avertissementSortant: avertissementSortant,
    appelerService: appelerService,
    verifierValeurs: verifierValeurs,
    proposer: proposer,
    appliquerDecision: appliquerDecision,
    controlerLimites: controlerLimites
  };
}());

export const {
  CAPACITES,
  SERVICES,
  GENRES,
  GESTES,
  ETATS_SUGGESTION,
  POLITIQUE_DEFAUT,
  resoudreSaisie,
  genreDepuisStatut,
  reessayable,
  phrase,
  assainirMessage,
  nomDHote,
  avertissementSortant,
  appelerService,
  verifierValeurs,
  proposer,
  appliquerDecision,
  controlerLimites
} = noyau;

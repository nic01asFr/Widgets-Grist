/*
 * limites.js — jusqu'où un formulaire accepte de réponses.
 *
 * Un atelier de 12 places, une consultation ouverte du 1er au 30 novembre, 200 réponses au plus :
 * des limites que la personne qui compose pose, et que le formulaire annonce avant qu'on y réponde.
 *
 * > **Un formulaire ne sait pas refuser seul.** Grist accepte toute ligne que la page envoie, et deux
 * > personnes qui valident la dernière place en même temps la prennent toutes les deux. Les limites
 * > se tiennent donc à deux endroits. Le formulaire LIT ce qui est déjà pris et ferme ce qui est
 * > plein (le geste ordinaire, qui évite presque tous les refus). La table, elle, TRANCHE : une
 * > formule range les réponses par ordre d'arrivée et marque « Confirmé » ou « Liste d'attente » —
 * > c'est elle qui fait foi quand deux envois se croisent (`formulePlace`).
 *
 * Ce module ne rend rien et ne connaît ni le DOM ni Grist : il juge des nombres.
 *
 * FormDef.limites (tout est facultatif) :
 *   total        nombre maximal de réponses
 *   ouvertDu     date ou date-heure ISO ; jusquau : idem (une date seule vaut jusqu'à la fin de ce jour)
 *   parChoix[]   { colId, max } : max est un nombre (le même pour tous les choix), un objet
 *                { choix: n } ou absent si `capaciteCol` dit la capacité dans la table liée
 *   sauf         { colId, valeurs[] } : les lignes qui ne comptent pas (annulée, refusée…)
 *   messages     { complet, ferme, pasOuvert, choixComplet, retenue, attente, doublon }
 *                (retenue / attente / doublon : ce qu'on dit à la personne une fois sa réponse envoyée, d'après `placeCol`)
 */
(function (root, factory) {
  'use strict';
  var asNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  if (asNode && typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.FormLimites = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var MESSAGE_MAX = 240;

  var MESSAGES = {
    complet: 'Le nombre maximum de réponses est atteint.',
    ferme: 'Ce formulaire est fermé.',
    pasOuvert: 'Ce formulaire n’est pas encore ouvert.',
    choixComplet: '« {choix} » est complet. Choisissez-en un autre.',
    // Après l'envoi, d'après la colonne « Place » de la ligne qu'on vient d'ajouter.
    retenue: 'Votre réponse est retenue.',
    attente: 'C’est complet : votre réponse est sur liste d’attente.',
    doublon: 'Une réponse existe déjà pour cette personne : la première est conservée.'
  };

  function propre(o, cle) { return Object.prototype.hasOwnProperty.call(o, cle); }
  function entierPositif(n) { return typeof n === 'number' && isFinite(n) && n >= 1 && Math.floor(n) === n; }
  function texte(v, max) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }

  /**
   * Une date ISO, ou null. Une date seule (`2026-11-30`) vaut le début du jour, ou sa fin pour
   * `jusquau` : « jusqu'au 30 » inclut le 30. Le fuseau est celui de l'appareil quand rien n'est dit.
   */
  function dateDe(v, finDeJour) {
    if (typeof v !== 'string') return null;
    var s = v.trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    var d;
    if (m) {
      d = finDeJour ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999) : new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0);
      if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return null;
      return d;
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return null;
    d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * Juge les limites d'un formulaire.
   *
   * @returns {{ limites: object|null, erreurs: string[], avertissements: string[] }}
   *   `limites` : la forme retenue (sinon null s'il n'y a rien à tenir) ; `erreurs` : ce qui est faux
   *   et qu'on écarte ; jamais corrigé en silence.
   */
  function normaliser(brut) {
    var out = { limites: null, erreurs: [], avertissements: [] };
    if (brut === null || brut === undefined) return out;
    if (typeof brut !== 'object' || Array.isArray(brut)) { out.erreurs.push('Les limites sont un objet.'); return out; }
    var l = {};

    if (propre(brut, 'total') && brut.total !== null) {
      if (entierPositif(brut.total)) l.total = brut.total;
      else out.erreurs.push('Le nombre maximal de réponses est un entier d’au moins 1.');
    }

    var debut = null, fin = null;
    if (brut.ouvertDu !== undefined && brut.ouvertDu !== null && brut.ouvertDu !== '') {
      debut = dateDe(brut.ouvertDu, false);
      if (!debut) out.erreurs.push('La date d’ouverture n’est pas une date (AAAA-MM-JJ ou AAAA-MM-JJTHH:MM).');
      else l.ouvertDu = String(brut.ouvertDu).trim();
    }
    if (brut.jusquau !== undefined && brut.jusquau !== null && brut.jusquau !== '') {
      fin = dateDe(brut.jusquau, true);
      if (!fin) out.erreurs.push('La date de fermeture n’est pas une date (AAAA-MM-JJ ou AAAA-MM-JJTHH:MM).');
      else l.jusquau = String(brut.jusquau).trim();
    }
    if (debut && fin && fin.getTime() < debut.getTime()) {
      out.erreurs.push('Le formulaire se fermerait avant de s’ouvrir.');
      delete l.ouvertDu; delete l.jusquau;
    }

    if (brut.parChoix !== undefined && brut.parChoix !== null) {
      if (!Array.isArray(brut.parChoix)) {
        out.erreurs.push('Les limites par choix sont une liste.');
      } else {
        l.parChoix = [];
        var vus = {};
        brut.parChoix.forEach(function (p, i) {
          var ou = 'Limite par choix n° ' + (i + 1);
          if (!p || typeof p !== 'object' || typeof p.colId !== 'string' || !p.colId) { out.erreurs.push(ou + ' : la question visée manque.'); return; }
          if (vus[p.colId]) { out.erreurs.push(ou + ' : « ' + p.colId + ' » a déjà sa limite.'); return; }
          var e = { colId: p.colId };
          var ok = false;
          if (entierPositif(p.max)) { e.max = p.max; ok = true; }
          else if (p.max && typeof p.max === 'object' && !Array.isArray(p.max)) {
            e.max = {};
            Object.keys(p.max).forEach(function (k) {
              if (entierPositif(p.max[k])) { e.max[k] = p.max[k]; ok = true; }
              else out.erreurs.push(ou + ' : la capacité de « ' + k + ' » est un entier d’au moins 1.');
            });
          } else if (p.max !== undefined && p.max !== null) {
            out.erreurs.push(ou + ' : le maximum est un nombre ou une liste { choix : nombre }.');
          }
          if (typeof p.capaciteCol === 'string' && p.capaciteCol) { e.capaciteCol = p.capaciteCol; ok = true; }
          if (!ok) { out.erreurs.push(ou + ' : dites le maximum (`max`) ou la colonne qui le porte (`capaciteCol`).'); return; }
          vus[p.colId] = true;
          l.parChoix.push(e);
        });
        if (!l.parChoix.length) delete l.parChoix;
      }
    }

    if (brut.sauf !== undefined && brut.sauf !== null) {
      var s = brut.sauf;
      if (s && typeof s === 'object' && typeof s.colId === 'string' && s.colId && Array.isArray(s.valeurs) && s.valeurs.length) {
        l.sauf = { colId: s.colId, valeurs: s.valeurs.map(String) };
      } else {
        out.erreurs.push('« Ne comptent pas » dit la colonne et les valeurs qui écartent une ligne.');
      }
    }

    if (typeof brut.placeCol === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(brut.placeCol)) l.placeCol = brut.placeCol;

    if (brut.unique !== undefined && brut.unique !== null && brut.unique !== '') {
      var u = typeof brut.unique === 'string' ? brut.unique : (brut.unique && brut.unique.colId);
      if (typeof u === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(u)) l.unique = { colId: u };
      else out.erreurs.push('« Une seule réponse par personne » dit la colonne qui reconnaît la personne (son courriel, par exemple).');
    }

    if (brut.messages && typeof brut.messages === 'object') {
      l.messages = {};
      Object.keys(MESSAGES).forEach(function (k) {
        var t = texte(brut.messages[k], MESSAGE_MAX);
        if (t) l.messages[k] = t;
      });
      if (!Object.keys(l.messages).length) delete l.messages;
    }

    if (Object.keys(l).length) out.limites = l;
    return out;
  }

  // ── lire les lignes déjà reçues ──

  /** Des lignes, qu'on reçoive un tableau d'objets ou des colonnes (`{ id: [...], Col: [...] }`). */
  function lignesDe(donnees) {
    if (!donnees) return [];
    if (Array.isArray(donnees)) return donnees;
    if (typeof donnees !== 'object') return [];
    var cles = Object.keys(donnees);
    var n = Array.isArray(donnees.id) ? donnees.id.length : (cles.length && Array.isArray(donnees[cles[0]]) ? donnees[cles[0]].length : 0);
    var lignes = [];
    for (var i = 0; i < n; i++) {
      var l = {};
      cles.forEach(function (c) { if (Array.isArray(donnees[c])) l[c] = donnees[c][i]; });
      lignes.push(l);
    }
    return lignes;
  }

  /** Les choix d'une cellule : un texte, un nombre (référence), ou une liste (le « L » de tête de Grist est ôté). */
  function choixDe(cellule) {
    if (cellule === null || cellule === undefined || cellule === '') return [];
    if (Array.isArray(cellule)) {
      var l = cellule.slice();
      if (l[0] === 'L') l.shift();
      return l.filter(function (v) { return v !== null && v !== undefined && v !== ''; }).map(String);
    }
    if (typeof cellule === 'object') return [];
    return [String(cellule)];
  }

  /**
   * Une ligne compte-t-elle pour le plafond ? Pas si elle est écartée (`sauf`), ni si la table l'a déjà
   * rangée hors des places : liste d'attente, doublon. La colonne « Place » ne dit rien d'une personne,
   * elle peut donc rester lisible quand tout le reste est caché.
   */
  var HORS_PLACES = ["Liste d'attente", 'Doublon', 'Écartée'];

  /**
   * Ce que dit la colonne « Place » d'une ligne, en phrase pour la personne qui vient d'envoyer.
   *
   * Les valeurs de la table (`Confirmé`, `Liste d'attente`, `Doublon`) sont un code stable que le moteur
   * lit ; seules les phrases se règlent (`messages.retenue`, `attente`, `doublon`). Une valeur qu'on ne
   * connaît pas (`Écartée`, vide, autre chose) ne donne rien : mieux vaut se taire que dire faux.
   *
   * @param {object} limites forme retenue par `normaliser`
   * @param {*} valeurPlace contenu de la colonne `placeCol` de la ligne
   * @returns {{code:string, message:string}|null}
   */
  function statut(limites, valeurPlace) {
    var codes = { 'Confirmé': 'retenue', "Liste d'attente": 'attente', 'Doublon': 'doublon' };
    var v = String(valeurPlace == null ? '' : valeurPlace);
    if (!Object.prototype.hasOwnProperty.call(codes, v)) return null;
    var code = codes[v];
    var m = (limites && limites.messages && limites.messages[code]) || MESSAGES[code];
    return { code: code, message: m };
  }
  function compte(ligne, limites) {
    if (limites.placeCol && HORS_PLACES.indexOf(String(ligne[limites.placeCol])) !== -1) return false;
    var s = limites.sauf;
    if (!s) return true;
    return choixDe(ligne[s.colId]).every(function (v) { return s.valeurs.indexOf(v) === -1; });
  }

  function capaciteDe(entree, capacites, valeur) {
    var k = String(valeur);
    if (entree.max && typeof entree.max === 'object' && propre(entree.max, k)) return entree.max[k];
    if (typeof entree.max === 'number') return entree.max;
    var c = capacites && capacites[entree.colId];
    if (c && propre(c, k) && entierPositif(Number(c[k]))) return Number(c[k]);
    return null;
  }

  /**
   * Où en est le formulaire : ouvert ou non, combien de places prises, lesquelles sont pleines.
   *
   * @param {object} limites forme retenue par `normaliser`
   * @param {Array|object} donnees les lignes déjà reçues
   * @param {Date} maintenant
   * @param {object} [capacites] { colId: { choix: capacité } } lues dans la table liée (`capaciteCol`)
   */
  function etat(limites, donnees, maintenant, capacites) {
    var e = { configure: !!limites, ouvert: true, raison: null, message: '', total: null, comptes: {}, config: limites || null, capacites: capacites || {} };
    if (!limites) return e;
    var msg = function (k) { return (limites.messages && limites.messages[k]) || MESSAGES[k]; };
    var quand = maintenant instanceof Date ? maintenant : new Date();

    var debut = limites.ouvertDu ? dateDe(limites.ouvertDu, false) : null;
    var fin = limites.jusquau ? dateDe(limites.jusquau, true) : null;
    if (debut && quand.getTime() < debut.getTime()) { e.ouvert = false; e.raison = 'pas-ouvert'; e.message = msg('pasOuvert'); }
    else if (fin && quand.getTime() > fin.getTime()) { e.ouvert = false; e.raison = 'ferme'; e.message = msg('ferme'); }

    var lignes = lignesDe(donnees).filter(function (l) { return compte(l, limites); });
    if (limites.total) {
      var pris = lignes.length;
      e.total = { max: limites.total, pris: pris, restant: Math.max(0, limites.total - pris), complet: pris >= limites.total };
      if (e.ouvert && e.total.complet) { e.ouvert = false; e.raison = 'complet'; e.message = msg('complet'); }
    }
    (limites.parChoix || []).forEach(function (p) {
      var c = {};
      lignes.forEach(function (l) { choixDe(l[p.colId]).forEach(function (v) { c[v] = (c[v] || 0) + 1; }); });
      e.comptes[p.colId] = c;
    });
    return e;
  }

  /** Les places d'un choix : `{ max, pris, restant, complet }`, ou null si ce choix n'a pas de limite. */
  function place(e, colId, valeur) {
    if (!e || !e.config || !e.config.parChoix) return null;
    var entree = e.config.parChoix.filter(function (p) { return p.colId === colId; })[0];
    if (!entree) return null;
    var max = capaciteDe(entree, e.capacites, valeur);
    if (max === null) return null;
    var pris = (e.comptes[colId] && e.comptes[colId][String(valeur)]) || 0;
    return { max: max, pris: pris, restant: Math.max(0, max - pris), complet: pris >= max };
  }

  /**
   * Ce que dit l'état à qui s'apprête à envoyer. Un formulaire fermé, plein, ou un choix plein
   * refuse l'envoi et dit pourquoi, avec la même phrase que l'écran.
   *
   * @param {object} valeurs ce que la personne a rempli : { colId: valeur ou liste }
   * @returns {{ ok: boolean, motifs: Array<{ code: string, colId?: string, valeur?: string, message: string }> }}
   */
  function verifierEnvoi(e, valeurs) {
    var motifs = [];
    if (e && e.configure && !e.ouvert) motifs.push({ code: e.raison, message: e.message });
    if (e && e.configure && e.config.parChoix) {
      var msg = (e.config.messages && e.config.messages.choixComplet) || MESSAGES.choixComplet;
      e.config.parChoix.forEach(function (p) {
        choixDe(valeurs && valeurs[p.colId]).forEach(function (v) {
          var pl = place(e, p.colId, v);
          if (pl && pl.complet) motifs.push({ code: 'choix-complet', colId: p.colId, valeur: v, message: msg.replace('{choix}', v) });
        });
      });
    }
    return { ok: motifs.length === 0, motifs: motifs };
  }

  /** Les colonnes qu'il faut pouvoir lire pour compter : celles des limites par choix et celle de `sauf`. */
  function colonnesComptees(limites) {
    var cols = [];
    if (!limites) return cols;
    (limites.parChoix || []).forEach(function (p) { if (cols.indexOf(p.colId) === -1) cols.push(p.colId); });
    if (limites.sauf && cols.indexOf(limites.sauf.colId) === -1) cols.push(limites.sauf.colId);
    if (limites.placeCol && cols.indexOf(limites.placeCol) === -1) cols.push(limites.placeCol);
    return cols;
  }

  // ── la formule qui tranche, côté Grist ──

  function ident(s) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s); }
  function litteralPython(s) { return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }

  /**
   * La formule de la colonne « Place » : `Confirmé` ou `Liste d'attente`, selon l'ordre d'arrivée.
   *
   * > **Une personne en liste d'attente ne prend la place de personne.** Le rang brut (« tu es la 13e »)
   * > ferait compter les attentes dans le total. La formule rejoue donc l'attribution dans l'ordre
   * > d'arrivée, jusqu'à la ligne courante : chacune est confirmée s'il reste de la place au total ET dans
   * > son choix. Grist interdit qu'une ligne lise la même colonne d'une autre ligne (référence
   * > circulaire) : la simulation se refait dans chaque ligne, sans la lire.
   *
   * C'est elle qui fait foi quand deux envois se croisent : elle ne dépend pas de la page qui les a envoyés.
   * Les limites par choix valent pour une colonne à UNE valeur (choix, texte, référence) ; une liste de
   * choix multiples n'est pas tenue par la formule (le formulaire, lui, la tient).
   *
   * @param {object} limites forme retenue
   * @param {string} tableId la table des réponses
   * @returns {string|null} null si rien n'est à trancher
   */
  function formulePlace(limites, tableId) {
    if (!limites || !ident(String(tableId))) return null;
    var pc = (limites.parChoix || []).filter(function (p) { return ident(p.colId); });
    var unique = limites.unique && ident(limites.unique.colId) ? limites.unique : null;
    if (!limites.total && !pc.length && !unique) return null;
    var sauf = limites.sauf && ident(limites.sauf.colId) ? limites.sauf : null;
    var enSauf = function (v) { return v + ' in (' + sauf.valeurs.map(litteralPython).join(', ') + ',)'; };
    var capacite = function (p) {
      if (p.max && typeof p.max === 'object') {
        var paires = Object.keys(p.max).map(function (v) { return litteralPython(v) + ': ' + p.max[v]; }).join(', ');
        return '{' + paires + '}.get(str(r.' + p.colId + '), None)';
      }
      if (typeof p.max === 'number') return String(p.max);
      return 'r.' + p.colId + '.' + p.capaciteCol;
    };
    var L = [];
    L.push('# Généré par Form Builder : l\'ordre d\'arrivée tranche, la liste d\'attente ne prend la place de personne.');
    if (sauf) L.push('if ' + enSauf('$' + sauf.colId) + ':', '  return "Écartée"');
    L.push('confirmes = 0', 'pris = {}');
    if (unique) L.push('vus = set()');
    L.push('for r in sorted([x for x in ' + tableId + '.all if x.id <= $id], key=lambda x: x.id):');
    if (sauf) L.push('  if ' + enSauf('r.' + sauf.colId) + ':', '    continue');
    if (unique) {
      // La première réponse d'une personne est la seule retenue : les suivantes ne prennent la place de personne.
      L.push('  qui = str(r.' + unique.colId + ' or "").strip().lower()');
      L.push('  if qui and qui in vus:', '    if r.id == $id:', '      return "Doublon"', '    continue');
      L.push('  if qui:', '    vus.add(qui)');
    }
    L.push('  place = True');
    if (limites.total) L.push('  if confirmes >= ' + limites.total + ':', '    place = False');
    pc.forEach(function (p) {
      L.push('  cap = ' + capacite(p));
      L.push('  cle = (' + litteralPython(p.colId) + ', r.' + p.colId + ' if not hasattr(r.' + p.colId + ', "id") else r.' + p.colId + '.id)');
      L.push('  if r.' + p.colId + ' and cap and pris.get(cle, 0) >= cap:', '    place = False');
    });
    L.push('  if place:', '    confirmes = confirmes + 1');
    pc.forEach(function (p) {
      L.push('    cle = (' + litteralPython(p.colId) + ', r.' + p.colId + ' if not hasattr(r.' + p.colId + ', "id") else r.' + p.colId + '.id)');
      L.push('    pris[cle] = pris.get(cle, 0) + 1');
    });
    L.push('  if r.id == $id:', '    return "Confirmé" if place else "Liste d\'attente"');
    L.push('return "Liste d\'attente"');
    return L.join('\n');
  }

  return {
    VERSION: VERSION,
    MESSAGES: MESSAGES,
    normaliser: normaliser,
    etat: etat,
    place: place,
    statut: statut,
    verifierEnvoi: verifierEnvoi,
    colonnesComptees: colonnesComptees,
    formulePlace: formulePlace,
    lignesDe: lignesDe,
    choixDe: choixDe
  };
}));

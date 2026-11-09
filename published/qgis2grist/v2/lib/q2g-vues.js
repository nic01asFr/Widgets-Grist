/**
 * Q2GVues - vues enregistrees de la carte (couches visibles, filtres actifs, cadrage, fond, selection).
 *
 * Module pur (aucun DOM, aucun acces direct a Grist : le docApi est injecte). Memes conventions de
 * stockage qu'Atlas : table `Atlas_ScenePrefs` (lib/scene-prefs.js d'Atlas, lue seulement), une ligne par
 * scene, colonnes JSON. Les vues sont rangees sous la cle `vues_q2g` du bloc JSON d'une colonne DEDIEE
 * (`VuesQ2G`, `COLONNE_DEDIEE`) de la ligne : Atlas reecrit `ExpositionJSON` normalise a chaque enregistrement
 * et perdrait une cle inconnue (lib/exposition.js, lib/scene-prefs.js d'Atlas). `creer({ colonne: 'ExpositionJSON' })`
 * reste possible si Atlas preserve un jour les cles inconnues.
 *
 * Regles de stockage :
 * - si la table existe, on n'ecrit QUE la cle `vues_q2g` du bloc JSON de la colonne choisie, apres relecture de la ligne ;
 *   les autres cles du bloc sont reecrites telles quelles ;
 * - si la table n'existe pas, on la cree avec exactement les colonnes qu'Atlas declare, puis on y ecrit ;
 * - jamais de table a part ;
 * - un bloc existant mais illisible (JSON invalide) n'est jamais ecrase en silence : refus (`bloc_illisible`),
 *   sauf si l'appelant demande explicitement `ecraserIllisible: true`.
 *
 * Donnees non fiables : le contenu du bloc peut venir d'un autre outil ou d'une version ulterieure.
 * Tout est assaini a la lecture comme a l'ecriture (liste blanche de champs, plafonds de taille et de
 * nombre, cles interdites, noms nettoyes). Une vue invalide est ignoree sans casser les autres.
 *
 * Limite connue : Grist n'offre pas d'ecriture conditionnelle. La relecture juste avant l'ecriture reduit
 * la fenetre de concurrence sans la fermer (voir `modifier`).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Q2GVues = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---------------------------------------------------------------- constantes (alignees sur Atlas)

  const TABLE = 'Atlas_ScenePrefs';

  /** Copie du schema declare par Atlas (lib/scene-prefs.js, SCENE_PREFS_SCHEMA). Un test la compare a la source. */
  const SCHEMA_ATLAS = Object.freeze([
    Object.freeze({ id: 'ViewerJSON', label: 'Contrôles environnement (JSON)', type: 'Text' }),
    Object.freeze({ id: 'SettingsJSON', label: 'Réglages de scène (JSON)', type: 'Text' }),
    Object.freeze({ id: 'ExpositionJSON', label: 'Exposition (JSON)', type: 'Text' }),
    Object.freeze({ id: 'Miniature', label: 'Miniature (image)', type: 'Text' }),
  ]);

  const COLONNE_DEFAUT = 'ExpositionJSON';
  /**
   * Colonne recommandee : Atlas reecrit `ExpositionJSON` normalise (lib/exposition.js : les cles inconnues sont perdues)
   * a chaque enregistrement des preferences ; une colonne a part de la meme table survit (Atlas n'ecrit que les siennes).
   */
  const COLONNE_DEDIEE = 'VuesQ2G';
  const CLE_DEFAUT = 'vues_q2g';
  const VERSION_BLOC = 1;

  const MAX_VUES = 20;
  const MAX_NOM = 60;
  const MAX_ETAT_OCTETS = 16 * 1024;     // un etat de vue, une fois serialise
  const MAX_BRUT_OCTETS = 1024 * 1024;   // le contenu entier de la cellule, avant analyse
  const MAX_COUCHES = 200;
  const MAX_ID_COUCHE = 120;
  const MAX_SELECTION = 200;
  const MAX_FILTRES_CLES = 50;
  const MAX_FILTRES_PROFONDEUR = 4;
  const MAX_TABLEAU = 200;
  const MAX_CHAINE = 500;
  const MAX_FOND = 120;
  const TENTATIVES = 4;

  const CLES_INTERDITES = Object.freeze(['__proto__', 'constructor', 'prototype']);

  const aussiInterdit = (s) => CLES_INTERDITES.includes(String(s).toLowerCase());

  // ---------------------------------------------------------------- erreurs

  function erreur(code, message) {
    const e = new Error(message || code);
    e.code = code;
    return e;
  }

  // ---------------------------------------------------------------- assainissement

  const fini = (v) => typeof v === 'number' && Number.isFinite(v);
  const estObjet = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  /** Caracteres de controle et de direction/invisibles retires d'un texte affichable. */
  // eslint-disable-next-line no-control-regex
  const RE_INVISIBLES = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

  /** Coupe a n points de code (sans couper une paire de substitution). */
  function couper(s, n) {
    const pts = Array.from(s);
    return pts.length > n ? pts.slice(0, n).join('') : s;
  }

  /**
   * Nom de vue assaini : texte, invisibles retires, espaces ramenes a un seul, borne a MAX_NOM.
   * @returns {string|null} null si le resultat est vide, non textuel ou interdit
   */
  function nettoyerNom(nom) {
    if (typeof nom !== 'string') return null;
    const n = couper(nom.replace(RE_INVISIBLES, ' ').replace(/\s+/g, ' ').trim(), MAX_NOM).trim();
    if (!n || aussiInterdit(n)) return null;
    return n;
  }

  const cleNom = (nom) => nom.toLowerCase();

  function nettoyerChaine(s, max) {
    return couper(s.replace(RE_INVISIBLES, ' '), max);
  }

  /** Une valeur JSON sure : bornes de profondeur, de taille, cles interdites retirees. undefined si rien de sur. */
  function nettoyerValeur(v, profondeur) {
    if (v === null) return null;
    if (typeof v === 'string') return nettoyerChaine(v, MAX_CHAINE);
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    if (profondeur >= MAX_FILTRES_PROFONDEUR) return undefined;
    if (Array.isArray(v)) {
      const out = [];
      for (const x of v.slice(0, MAX_TABLEAU)) {
        const y = nettoyerValeur(x, profondeur + 1);
        if (y !== undefined) out.push(y);
      }
      return out;
    }
    if (estObjet(v)) {
      const out = {};
      let n = 0;
      for (const k of Object.keys(v)) {
        if (aussiInterdit(k)) continue;
        if (n >= MAX_FILTRES_CLES) break;
        const y = nettoyerValeur(v[k], profondeur + 1);
        if (y === undefined) continue;
        out[couper(k.replace(RE_INVISIBLES, ' '), MAX_ID_COUCHE)] = y;
        n++;
      }
      return out;
    }
    return undefined;
  }

  function nettoyerCouches(liste) {
    if (!Array.isArray(liste)) return null;
    const vus = new Set();
    const out = [];
    for (const x of liste) {
      if (typeof x !== 'string') continue;
      const id = couper(x.replace(RE_INVISIBLES, ' ').trim(), MAX_ID_COUCHE);
      if (!id || aussiInterdit(id) || vus.has(id)) continue;
      vus.add(id);
      out.push(id);
      if (out.length >= MAX_COUCHES) break;
    }
    return out;
  }

  /** Cadrage : camera `{lng, lat, zoom, pitch, bearing}` (meme forme que la vue figee d'Atlas) ou `{bornes}`. */
  function nettoyerCadrage(c) {
    if (!estObjet(c)) return null;
    if (Array.isArray(c.bornes)) {
      const b = c.bornes;
      if (b.length !== 2 || !Array.isArray(b[0]) || !Array.isArray(b[1])) return null;
      const [[ox, oy], [ex, ey]] = b;
      if (![ox, oy, ex, ey].every(fini)) return null;
      if (Math.abs(ox) > 360 || Math.abs(ex) > 360 || Math.abs(oy) > 90 || Math.abs(ey) > 90) return null;
      return { bornes: [[ox, oy], [ex, ey]] };
    }
    if (!fini(c.lng) || !fini(c.lat) || !fini(c.zoom)) return null;
    if (Math.abs(c.lng) > 360 || Math.abs(c.lat) > 90 || c.zoom < 0 || c.zoom > 24) return null;
    const pitch = fini(c.pitch) && c.pitch >= 0 && c.pitch <= 85 ? c.pitch : 0;
    const bearing = fini(c.bearing) && Math.abs(c.bearing) <= 360 ? c.bearing : 0;
    return { lng: c.lng, lat: c.lat, zoom: c.zoom, pitch, bearing };
  }

  /** Selection : liste de `{couche, id}` ; un scalaire seul devient `{id}`. */
  function nettoyerSelection(liste) {
    if (!Array.isArray(liste)) return null;
    const out = [];
    for (const x of liste) {
      let couche;
      let id;
      if (estObjet(x)) { couche = x.couche; id = x.id; } else { id = x; }
      const idOk = fini(id) ? id : (typeof id === 'string' && id ? nettoyerChaine(id, MAX_ID_COUCHE) : undefined);
      if (idOk === undefined || idOk === '') continue;
      const e = { id: idOk };
      if (typeof couche === 'string' && couche) {
        const c = couper(couche.replace(RE_INVISIBLES, ' ').trim(), MAX_ID_COUCHE);
        if (c && !aussiInterdit(c)) e.couche = c;
      }
      out.push(e);
      if (out.length >= MAX_SELECTION) break;
    }
    return out;
  }

  /**
   * Etat d'une vue assaini (liste blanche : couches, filtres, cadrage, fond, selection).
   * @returns {object|null} null si ce n'est pas un objet
   */
  function nettoyerEtat(etat) {
    if (!estObjet(etat)) return null;
    const out = {};
    const couches = nettoyerCouches(etat.couches);
    if (couches) out.couches = couches;
    if (estObjet(etat.filtres)) {
      const f = nettoyerValeur(etat.filtres, 0);
      if (estObjet(f)) out.filtres = f;
    }
    const cadrage = nettoyerCadrage(etat.cadrage);
    if (cadrage) out.cadrage = cadrage;
    if (typeof etat.fond === 'string') {
      const fond = couper(etat.fond.replace(RE_INVISIBLES, ' ').trim(), MAX_FOND);
      if (fond) out.fond = fond;
    }
    const selection = nettoyerSelection(etat.selection);
    if (selection) out.selection = selection;
    return out;
  }

  const taille = (o) => JSON.stringify(o).length;

  /** Date ISO courte, sinon chaine vide. */
  function nettoyerDate(d) {
    return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]{5,12}Z?$/.test(d) && d.length <= 40 ? d : '';
  }

  /** Une vue lue du bloc : `{nom, etat, maj}` ou null si elle est invalide ou trop grosse. */
  function nettoyerVue(brut) {
    if (!estObjet(brut)) return null;
    const nom = nettoyerNom(brut.nom);
    if (!nom) return null;
    const etat = nettoyerEtat(brut.etat);
    if (!etat || taille(etat) > MAX_ETAT_OCTETS) return null;
    return { nom, etat, maj: nettoyerDate(brut.maj) };
  }

  // ---------------------------------------------------------------- bloc JSON de la cellule

  /**
   * Analyse la cellule brute.
   * @returns {{ statut: 'vide'|'ok'|'illisible', objet: object }}
   *   `objet` : le bloc parse (a conserver tel quel pour les autres cles), `{}` si vide ou illisible.
   */
  function analyserCellule(brut) {
    if (brut === null || brut === undefined || brut === '') return { statut: 'vide', objet: {} };
    if (typeof brut !== 'string' || brut.length > MAX_BRUT_OCTETS) return { statut: 'illisible', objet: {} };
    if (!brut.trim()) return { statut: 'vide', objet: {} };
    let o;
    try { o = JSON.parse(brut); } catch (_) { return { statut: 'illisible', objet: {} }; }
    if (!estObjet(o)) return { statut: 'illisible', objet: {} };
    return { statut: 'ok', objet: o };
  }

  /** Les vues valides du bloc : doublons (casse ignoree) et surplus au-dela du plafond ecartes. */
  function extraireVues(objet, cle, max) {
    if (!estObjet(objet) || !Object.prototype.hasOwnProperty.call(objet, cle)) return [];
    const bloc = objet[cle];
    if (!estObjet(bloc) || !Array.isArray(bloc.vues)) return [];
    const vus = new Set();
    const out = [];
    for (const v of bloc.vues) {
      const vue = nettoyerVue(v);
      if (!vue) continue;
      const k = cleNom(vue.nom);
      if (vus.has(k)) continue;
      vus.add(k);
      out.push(vue);
      if (out.length >= max) break;
    }
    return out;
  }

  // ---------------------------------------------------------------- instance

  /**
   * @param {object} opts
   * @param {{listTables: function(): Promise<string[]>, fetchTable: function(string): Promise<object>,
   *          applyUserActions: function(Array): Promise<object>}} opts.docApi  injecte
   * @param {string} [opts.colonne]   colonne JSON qui porte le bloc (defaut `ExpositionJSON`)
   * @param {string} [opts.cle]       cle des vues dans le bloc (defaut `vues_q2g`)
   * @param {number} [opts.maxVues]   plafond (defaut 20, jamais au-dela)
   * @param {boolean} [opts.lectureSeule]  refuse toute ecriture
   * @param {boolean} [opts.ecraserIllisible]  autorise a remplacer un bloc qui n'est pas du JSON valide
   * @param {function(): string} [opts.maintenant]  horodatage ISO (injectable pour les tests)
   */
  function creer(opts) {
    const o = opts || {};
    const docApi = o.docApi;
    const colonne = typeof o.colonne === 'string' && o.colonne ? o.colonne : COLONNE_DEFAUT;
    const cle = typeof o.cle === 'string' && o.cle && !aussiInterdit(o.cle) ? o.cle : CLE_DEFAUT;
    const maxVues = Number.isInteger(o.maxVues) && o.maxVues > 0 ? Math.min(o.maxVues, MAX_VUES) : MAX_VUES;
    const maintenant = typeof o.maintenant === 'function' ? o.maintenant : () => new Date().toISOString();
    const autoriserEcrasement = o.ecraserIllisible === true;

    function exigerDocApi() {
      if (!docApi || typeof docApi.listTables !== 'function' || typeof docApi.fetchTable !== 'function'
        || typeof docApi.applyUserActions !== 'function') {
        throw erreur('docapi_absent', 'docApi indisponible');
      }
    }

    /** Lit la cellule du bloc : table, colonne, ligne de la scene (la premiere, comme Atlas) et contenu brut. */
    async function lireLigne() {
      const tables = await docApi.listTables();
      const tableExiste = Array.isArray(tables) && tables.includes(TABLE);
      if (!tableExiste) return { tableExiste: false, colonneExiste: false, ligneId: null, brut: null };
      const rec = await docApi.fetchTable(TABLE);
      const ids = (rec && rec.id) || [];
      const colonneExiste = !!rec && colonne in rec;
      if (!colonneExiste || !ids.length) return { tableExiste: true, colonneExiste, ligneId: ids.length ? ids[0] : null, brut: null };
      const v = rec[colonne] ? rec[colonne][0] : null;
      return { tableExiste: true, colonneExiste: true, ligneId: ids[0], brut: v === undefined ? null : v };
    }

    function lignesEgales(a, b) {
      return a.tableExiste === b.tableExiste && a.colonneExiste === b.colonneExiste
        && a.ligneId === b.ligneId && a.brut === b.brut;
    }

    /** Les vues telles que stockees, sans rien ecrire. */
    async function lister() {
      exigerDocApi();
      const ligne = await lireLigne();
      const { objet } = analyserCellule(ligne.brut);
      return extraireVues(objet, cle, maxVues).map((v) => ({ nom: v.nom, maj: v.maj, etat: v.etat }));
    }

    /**
     * Une ecriture : relit, calcule, RELIT juste avant d'ecrire et ne pose que si la cellule n'a pas bougé
     * entre-temps (sinon on recommence a partir de la nouvelle valeur). Les operations d'une meme instance
     * sont mises en file pour ne pas se croiser. Un autre auteur qui ecrirait entre la derniere relecture et
     * l'ecriture reste possible : Grist n'a pas d'ecriture conditionnelle.
     *
     * @param {function(Array): {vues: Array, resultat: *}|null} mutateur  null : rien a ecrire
     */
    let file = Promise.resolve();
    function modifier(mutateur) {
      const tache = async () => {
        exigerDocApi();
        if (o.lectureSeule) throw erreur('lecture_seule', 'ecriture refusee : mode lecture seule');
        for (let essai = 0; essai < TENTATIVES; essai++) {
          const ligne = await lireLigne();
          const analyse = analyserCellule(ligne.brut);
          if (analyse.statut === 'illisible' && !autoriserEcrasement) {
            throw erreur('bloc_illisible', `le bloc ${colonne} n'est pas un JSON valide : rien n'est ecrit`);
          }
          const sortie = mutateur(extraireVues(analyse.objet, cle, maxVues));
          if (!sortie) return undefined;
          // On modifie l'objet lu : les autres cles du bloc repartent telles quelles.
          const bloc = analyse.objet;
          if (sortie.vues.length) {
            bloc[cle] = { version: VERSION_BLOC, vues: sortie.vues };
          } else if (Object.prototype.hasOwnProperty.call(bloc, cle)) {
            delete bloc[cle];
          }
          const texte = JSON.stringify(bloc);
          if (texte.length > MAX_BRUT_OCTETS) throw erreur('bloc_trop_gros', 'le bloc depasserait la taille maximale');

          const verif = await lireLigne();
          if (!lignesEgales(ligne, verif)) continue; // quelqu'un a ecrit entre-temps : on repart de sa valeur

          const actions = [];
          if (!ligne.tableExiste) {
            actions.push(['AddTable', TABLE, SCHEMA_ATLAS.map((c) => ({ id: c.id, label: c.label, type: c.type }))]);
            // Colonne dediee (hors schema d'Atlas) : ajoutee juste apres la creation de la table.
            if (!SCHEMA_ATLAS.some((c) => c.id === colonne)) {
              actions.push(['AddColumn', TABLE, colonne, { label: colonne, type: 'Text' }]);
            }
          } else if (!ligne.colonneExiste) {
            const def = SCHEMA_ATLAS.find((c) => c.id === colonne);
            actions.push(['AddColumn', TABLE, colonne, { label: def ? def.label : colonne, type: 'Text' }]);
          }
          if (ligne.ligneId === null || !ligne.tableExiste) {
            actions.push(['AddRecord', TABLE, null, { [colonne]: texte }]);
          } else {
            actions.push(['UpdateRecord', TABLE, ligne.ligneId, { [colonne]: texte }]);
          }
          try {
            await docApi.applyUserActions(actions);
          } catch (e) {
            // Creation concurrente de la table par un autre outil : on repart de l'etat reel.
            if (!ligne.tableExiste) {
              const apres = await lireLigne();
              if (apres.tableExiste) continue;
            }
            throw e;
          }
          return sortie.resultat;
        }
        throw erreur('conflit', 'la ligne de preferences change sans cesse : reessayer');
      };
      const suite = file.then(tache, tache);
      file = suite.catch(() => {});
      return suite;
    }

    /** Enregistre (ou remplace) la vue `nom`. @returns {Promise<{nom: string, maj: string, etat: object}>} */
    function enregistrer(nom, etat) {
      const n = nettoyerNom(nom);
      if (!n) return Promise.reject(erreur('nom_invalide', 'nom de vue invalide'));
      const e = nettoyerEtat(etat);
      if (!e) return Promise.reject(erreur('etat_invalide', 'etat de vue invalide'));
      if (taille(e) > MAX_ETAT_OCTETS) return Promise.reject(erreur('etat_trop_gros', 'etat de vue trop volumineux'));
      return modifier((vues) => {
        const k = cleNom(n);
        const i = vues.findIndex((v) => cleNom(v.nom) === k);
        if (i < 0 && vues.length >= maxVues) throw erreur('plafond_vues', `au plus ${maxVues} vues enregistrees`);
        const vue = { nom: n, etat: e, maj: nettoyerDate(maintenant()) };
        const liste = vues.slice();
        if (i >= 0) liste[i] = vue; else liste.push(vue);
        return { vues: liste, resultat: { nom: vue.nom, maj: vue.maj, etat: e } };
      });
    }

    /** L'etat de la vue `nom` (copie), ou null si elle n'existe pas. Ne cree jamais rien. */
    async function appliquer(nom) {
      const n = nettoyerNom(nom);
      if (!n) return null;
      const k = cleNom(n);
      const v = (await lister()).find((x) => cleNom(x.nom) === k);
      return v ? JSON.parse(JSON.stringify(v.etat)) : null;
    }

    /** Renomme une vue. @returns {Promise<boolean>} false si `ancien` n'existe pas */
    function renommer(ancien, nouveau) {
      const a = nettoyerNom(ancien);
      const n = nettoyerNom(nouveau);
      if (!a) return Promise.resolve(false);
      if (!n) return Promise.reject(erreur('nom_invalide', 'nom de vue invalide'));
      return modifier((vues) => {
        const ka = cleNom(a);
        const kn = cleNom(n);
        const i = vues.findIndex((v) => cleNom(v.nom) === ka);
        if (i < 0) return null;
        if (kn !== ka && vues.some((v) => cleNom(v.nom) === kn)) throw erreur('nom_existe', 'une vue porte deja ce nom');
        const liste = vues.slice();
        liste[i] = { nom: n, etat: vues[i].etat, maj: nettoyerDate(maintenant()) };
        return { vues: liste, resultat: true };
      }).then((r) => r === true);
    }

    /** Supprime une vue. @returns {Promise<boolean>} false si elle n'existait pas (rien n'est ecrit) */
    function supprimer(nom) {
      const n = nettoyerNom(nom);
      if (!n) return Promise.resolve(false);
      return modifier((vues) => {
        const k = cleNom(n);
        const liste = vues.filter((v) => cleNom(v.nom) !== k);
        if (liste.length === vues.length) return null;
        return { vues: liste, resultat: true };
      }).then((r) => r === true);
    }

    return { lister, enregistrer, appliquer, renommer, supprimer };
  }

  return {
    creer,
    nettoyerNom,
    nettoyerEtat,
    analyserCellule,
    extraireVues,
    TABLE,
    SCHEMA_ATLAS,
    COLONNE_DEFAUT,
    COLONNE_DEDIEE,
    CLE_DEFAUT,
    CLES_INTERDITES,
    LIMITES: Object.freeze({
      MAX_VUES, MAX_NOM, MAX_ETAT_OCTETS, MAX_BRUT_OCTETS, MAX_COUCHES, MAX_SELECTION, MAX_FILTRES_CLES,
    }),
  };
});

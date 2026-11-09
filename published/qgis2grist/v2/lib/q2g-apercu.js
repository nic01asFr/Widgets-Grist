/**
 * Q2GApercu : aide a l'apercu d'import (regroupement, recherche, estimations). Module pur : aucun DOM, aucun
 * acces a Grist ; il ne decide JAMAIS de ce qui est importe (la selection reste portee par les cases `inc-<idx>`
 * de la page), il aide seulement la personne a choisir.
 *
 *  - classer(couche)        'tables' (sans geometrie) ou 'cartes' (cartographique)
 *  - grouper(couches)       [{ cle, titre, indices }] : « Cartographiques » puis « Tables », indices d'origine conserves
 *  - correspond(couche, q)  recherche insensible a la casse et aux accents, sur le nom, le libelle et les champs
 *  - estimerOctets(couche)  taille estimee de la charge utile envoyee a Grist (echantillon de lignes)
 *  - estimerDuree(octets, nCouches)  secondes, d'apres les mesures du 09/11/2026 (voir CLAUDE.md)
 *  - formaterTaille / formaterDuree  texte lisible
 *  - resume(couches)        { n, entites, octets, secondes, texte }
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Q2GApercu = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Debit mesure d'un appel applyUserActions (Mo/s) et surcout fixe par couche et par lot (s). */
  const DEBIT_OCTETS_PAR_S = 1.5e6;
  const SURCOUT_COUCHE_S = 0.5;
  const SURCOUT_LOT_S = 0.04;
  const LOT_OCTETS = 700 * 1024;
  const ECHANTILLON = 40;
  const SURCOUT_LIGNE_OCTETS = 24;

  const TITRES = Object.freeze({ cartes: 'Cartographiques', tables: 'Tables' });

  function estSansGeometrie(couche) {
    const g = String((couche && couche.geomType) || '').toLowerCase().replace(/\s+/g, '');
    return g === 'none' || g === 'nogeometry';
  }

  function classer(couche) {
    return estSansGeometrie(couche) ? 'tables' : 'cartes';
  }

  /** @returns {Array<{cle:string, titre:string, indices:number[]}>} les groupes non vides, indices dans l'ordre d'origine */
  function grouper(couches) {
    const liste = Array.isArray(couches) ? couches : [];
    const groupes = { cartes: [], tables: [] };
    liste.forEach((c, i) => groupes[classer(c)].push(i));
    return ['cartes', 'tables']
      .filter((cle) => groupes[cle].length)
      .map((cle) => ({ cle, titre: TITRES[cle], indices: groupes[cle] }));
  }

  function normaliser(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  /** Une requete vide retient tout ; sinon tous les mots (separes par des espaces) doivent se retrouver. */
  function correspond(couche, requete) {
    const mots = normaliser(requete).split(/\s+/).filter(Boolean);
    if (!mots.length) return true;
    const champs = Array.isArray(couche && couche.fields) ? couche.fields.map((f) => (f && (f.label || f.name)) || '') : [];
    const meule = normaliser([couche && couche.displayName, couche && couche.name].concat(champs).join(' | '));
    return mots.every((m) => meule.includes(m));
  }

  const cache = typeof WeakMap === 'function' ? new WeakMap() : null;

  /** Taille estimee (octets) de la charge utile d'une couche : lignes serialisees en JSON, mesurees sur un echantillon. */
  function estimerOctets(couche) {
    if (cache && couche && typeof couche === 'object' && cache.has(couche)) return cache.get(couche);
    const v = mesurer(couche);
    if (cache && couche && typeof couche === 'object') cache.set(couche, v);
    return v;
  }

  function mesurer(couche) {
    const lignes = couche && Array.isArray(couche.features) ? couche.features : [];
    const n = Number.isFinite(couche && couche.featureCount) ? couche.featureCount : lignes.length;
    if (!lignes.length || n <= 0) return 0;
    const pas = Math.max(1, Math.floor(lignes.length / ECHANTILLON));
    let somme = 0;
    let vus = 0;
    for (let i = 0; i < lignes.length && vus < ECHANTILLON; i += pas) {
      let t = 0;
      try { t = JSON.stringify(lignes[i]).length; } catch (_) { t = 0; }
      somme += t + SURCOUT_LIGNE_OCTETS;
      vus++;
    }
    return Math.round((somme / vus) * n);
  }

  /** Duree annoncee en secondes : debit mesure, surcout par couche et par lot. Indicative. */
  function estimerDuree(octets, nCouches) {
    const o = Number.isFinite(octets) && octets > 0 ? octets : 0;
    const c = Number.isFinite(nCouches) && nCouches > 0 ? nCouches : 0;
    return c * SURCOUT_COUCHE_S + o / DEBIT_OCTETS_PAR_S + Math.ceil(o / LOT_OCTETS) * SURCOUT_LOT_S;
  }

  function nombre(x, decimales) {
    try { return x.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }); } catch (_) { return x.toFixed(decimales); }
  }

  function formaterTaille(octets) {
    const o = Number.isFinite(octets) && octets > 0 ? octets : 0;
    if (o < 1024) return o + ' o';
    if (o < 1024 * 1024) return nombre(o / 1024, 0) + ' Ko';
    return nombre(o / (1024 * 1024), o < 10 * 1024 * 1024 ? 1 : 0) + ' Mo';
  }

  function formaterDuree(secondes) {
    const s = Number.isFinite(secondes) && secondes > 0 ? secondes : 0;
    if (s < 2) return 'moins de 2 s';
    if (s < 60) return 'environ ' + Math.round(s) + ' s';
    const min = Math.floor(s / 60);
    const reste = Math.round(s - min * 60);
    return 'environ ' + min + ' min' + (reste ? ' ' + reste + ' s' : '');
  }

  /** Resume d'une selection de couches (la liste deja filtree par l'appelant sur les cases cochees). */
  function resume(couches) {
    const liste = Array.isArray(couches) ? couches : [];
    const entites = liste.reduce((s, c) => s + (Number.isFinite(c && c.featureCount) ? c.featureCount : 0), 0);
    const octets = liste.reduce((s, c) => s + estimerOctets(c), 0);
    const secondes = estimerDuree(octets, liste.length);
    const texte = liste.length
      ? liste.length + (liste.length > 1 ? ' couches' : ' couche') + ' · ' + nombre(entites, 0) + (entites > 1 ? ' entités' : ' entité')
        + ' · ~' + formaterTaille(octets) + ' · durée ' + formaterDuree(secondes)
      : 'Aucune couche sélectionnée';
    return { n: liste.length, entites, octets, secondes, texte };
  }

  return {
    classer, grouper, correspond, normaliser,
    estimerOctets, estimerDuree, formaterTaille, formaterDuree, resume,
    TITRES, DEBIT_OCTETS_PAR_S, SURCOUT_COUCHE_S, ECHANTILLON,
  };
});

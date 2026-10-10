/**
 * Travailler sans réseau : un client qui se souvient, et qui n'oublie rien d'écrit.
 *
 * Dans l'application, Atlas parle à Grist par un client REST (`ClientRest`). Ce module l'enveloppe :
 *
 * - **lire** : chaque table lue est gardée sur l'appareil (un instantané daté). Sans réseau, c'est
 *   l'instantané qui répond, et la scène s'ouvre quand même ;
 * - **écrire** : une écriture que le réseau refuse de porter ne se perd pas, elle entre dans une
 *   **file d'attente** locale. Elle apparaît tout de suite dans les lectures (avec un identifiant
 *   provisoire négatif) et part toute seule au retour du réseau, **dans l'ordre**, une entrée après l'autre ;
 * - **photos** : une photo prise hors réseau est gardée avec son fichier ; son identifiant provisoire est
 *   remplacé par le vrai au moment de l'envoi.
 *
 * Ce que ce module ne fait PAS, et dit :
 * - il ne résout pas les conflits : les visites sont des ajouts, et la file ne porte que des gestes
 *   d'écriture simples. Une ligne modifiée ailleurs entre-temps est écrasée par la modification locale ;
 * - il ne déduplique pas à l'envoi par une colonne du document : il tient un journal local. Une entrée dont
 *   l'envoi a été interrompu (application fermée en plein envoi) devient « incertaine » : on ne la renvoie
 *   pas d'office, on la montre — la renvoyer pourrait créer une visite en double.
 *
 * Le module est pur : le stockage, le réseau et le client sont des entrées, ce qui le rend vérifiable sans
 * navigateur.
 */

import { estTableAtlas } from './atlas-tables.js?v=1.14.0';

export const VERSION = '1.0.0';

export const ETATS = Object.freeze({
  EN_ATTENTE: 'en_attente',
  EN_COURS: 'en_cours',
  INCERTAINE: 'incertaine',
  REFUSEE: 'refusee',
});

const MAGASINS = ['cache', 'file', 'pj', 'divers'];

/* ------------------------------------------------------------------ */
/* Stockage                                                            */
/* ------------------------------------------------------------------ */

/** Un stockage en mémoire : pour les essais, et de repli quand l'appareil refuse IndexedDB. */
export class StockageMemoire {
  constructor() { this._m = new Map(MAGASINS.map((n) => [n, new Map()])); }
  async get(magasin, cle) { return this._m.get(magasin).get(String(cle)); }
  async put(magasin, cle, valeur) { this._m.get(magasin).set(String(cle), valeur); }
  async delete(magasin, cle) { this._m.get(magasin).delete(String(cle)); }
  async list(magasin) { return [...this._m.get(magasin).values()]; }
}

/** IndexedDB : le seul stockage de l'appareil qui tienne des fichiers et des tables entières. */
export class StockageIndexedDB {
  constructor({ nom = 'atlas-hors-ligne', indexedDB = globalThis.indexedDB } = {}) {
    this._nom = nom;
    this._idb = indexedDB;
    this._ouverte = null;
  }

  _ouvrir() {
    if (this._ouverte) return this._ouverte;
    this._ouverte = new Promise((resolve, reject) => {
      if (!this._idb) { reject(new Error('IndexedDB indisponible')); return; }
      const req = this._idb.open(this._nom, 1);
      req.onupgradeneeded = () => {
        for (const n of MAGASINS) if (!req.result.objectStoreNames.contains(n)) req.result.createObjectStore(n);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB : ouverture impossible'));
    });
    return this._ouverte;
  }

  async _tx(magasin, mode, fn) {
    const db = await this._ouvrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(magasin, mode);
      const res = fn(tx.objectStore(magasin));
      tx.oncomplete = () => resolve(res && 'result' in res ? res.result : undefined);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB : transaction en échec'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB : transaction annulée'));
    });
  }

  get(magasin, cle) { return this._tx(magasin, 'readonly', (s) => s.get(String(cle))); }
  put(magasin, cle, valeur) { return this._tx(magasin, 'readwrite', (s) => { s.put(valeur, String(cle)); }); }
  delete(magasin, cle) { return this._tx(magasin, 'readwrite', (s) => { s.delete(String(cle)); }); }
  list(magasin) { return this._tx(magasin, 'readonly', (s) => s.getAll()); }
}

/** Le meilleur stockage disponible : IndexedDB, sinon la mémoire (rien ne survivra au rechargement). */
export function stockageParDefaut(portee = globalThis, nom) {
  try {
    if (portee.indexedDB) return { stockage: new StockageIndexedDB({ nom, indexedDB: portee.indexedDB }), durable: true };
  } catch (_) { /* repli ci-dessous */ }
  return { stockage: new StockageMemoire(), durable: false };
}

/* ------------------------------------------------------------------ */
/* Erreurs et lecture de la file                                       */
/* ------------------------------------------------------------------ */

/**
 * Une erreur de réseau (injoignable, coupé, expiré) — par opposition à un refus du serveur.
 * Les refus portent un statut (« HTTP 403 — … ») : ils ne sont jamais traités comme une coupure,
 * sinon un refus de droits resterait en attente indéfiniment.
 */
export function estErreurReseau(e) {
  if (!e) return false;
  const msg = String(e.message || e);
  if (/^HTTP \d{3}/.test(msg) || /Pièce jointe \d+ — HTTP/.test(msg)) return false;
  if (e.name === 'TypeError') return true;
  if (e.name === 'AbortError') return true;
  return /failed to fetch|network|réseau|reseau|timeout|timed out|unable to resolve|unknownhost|econn|enotfound|offline|connection|load failed|connect/i.test(msg);
}

/* ------------------------------------------------------------------ */
/* Préparer une scène pour le terrain                                  */
/* ------------------------------------------------------------------ */

/** Les tables de métadonnées qu'Atlas lit à l'ouverture (schéma, formulaires natifs) : sans elles, la scène s'ouvre nue. */
export const TABLES_META = Object.freeze(['_grist_Tables', '_grist_Tables_column', '_grist_Views', '_grist_Views_section', '_grist_Views_section_field']);

/** Au-delà, on s'arrête de garder des photos : un téléphone n'est pas un entrepôt. */
export const PLAFOND_PHOTOS_OCTETS = 150 * 1024 * 1024;

/** Les colonnes de pièces jointes de chaque table, d'après les métadonnées lues (`Attachments`). */
export function colonnesPiecesJointes(tables, colonnes) {
  const nom = {};
  (tables?.id || []).forEach((id, i) => { nom[id] = tables.tableId?.[i]; });
  const out = {};
  (colonnes?.id || []).forEach((_, i) => {
    if (colonnes.type?.[i] !== 'Attachments') return;
    const table = nom[colonnes.parentId?.[i]];
    const col = colonnes.colId?.[i];
    if (table && col) (out[table] = out[table] || []).push(col);
  });
  return out;
}

/** Les identifiants de pièces jointes d'une table colonnaire : une cellule `Attachments` est `['L', id, id…]`. */
export function idsPiecesJointes(donnees, colIds) {
  const ids = new Set();
  for (const c of colIds || []) {
    for (const v of donnees?.[c] || []) {
      if (Array.isArray(v) && v[0] === 'L') for (const id of v.slice(1)) if (Number.isInteger(id) && id > 0) ids.add(id);
    }
  }
  return [...ids];
}

/**
 * Les identifiants provisoires sont négatifs, et loin de zéro : aucun identifiant Grist ne l'est, et une
 * valeur négative ordinaire d'une colonne numérique (un délai de -6 mois) ne risque pas de leur ressembler.
 */
export const BASE_PROVISOIRE = -1000000000;
const estProvisoire = (v) => Number.isInteger(v) && v <= BASE_PROVISOIRE;

/**
 * Applique des entrées de la file à une table lue (format colonnaire `{id: [], col: []}`), pour que
 * l'écriture locale se voie tout de suite. Ne touche pas à l'objet reçu.
 */
export function appliquerFileSurTable(donnees, table, entrees) {
  const out = {};
  for (const k of Object.keys(donnees || { id: [] })) out[k] = [...donnees[k]];
  if (!out.id) out.id = [];
  const poser = (id, champs) => {
    const i = out.id.indexOf(id);
    if (i < 0) return;
    for (const [c, v] of Object.entries(champs || {})) {
      if (!out[c]) out[c] = out.id.map(() => null);
      out[c][i] = v;
    }
  };
  const ajouter = (id, champs) => {
    out.id.push(id);
    for (const c of Object.keys(out)) if (c !== 'id') out[c].push(null);
    for (const [c, v] of Object.entries(champs || {})) {
      if (!out[c]) out[c] = out.id.map(() => null);
      out[c][out.id.length - 1] = v;
    }
  };
  for (const e of entrees || []) {
    if (e.etat === ETATS.REFUSEE) continue;
    (e.actions || []).forEach((a, k) => {
      if (a[1] !== table) return;
      const prov = e.provisoires?.[k];
      if (a[0] === 'AddRecord') ajouter(Array.isArray(prov) ? prov[0] : prov, a[3]);
      else if (a[0] === 'BulkAddRecord') {
        const ids = Array.isArray(prov) ? prov : [];
        const cols = Object.keys(a[3] || {});
        (a[2] || []).forEach((_, j) => ajouter(ids[j], Object.fromEntries(cols.map((c) => [c, a[3][c][j]]))));
      } else if (a[0] === 'UpdateRecord') poser(a[2], a[3]);
      else if (a[0] === 'BulkUpdateRecord') {
        const cols = Object.keys(a[3] || {});
        (a[2] || []).forEach((id, j) => poser(id, Object.fromEntries(cols.map((c) => [c, a[3][c][j]]))));
      } else if (a[0] === 'RemoveRecord') {
        const i = out.id.indexOf(a[2]);
        if (i >= 0) for (const c of Object.keys(out)) out[c].splice(i, 1);
      } else if (a[0] === 'BulkRemoveRecord') {
        for (const id of a[2] || []) {
          const i = out.id.indexOf(id);
          if (i >= 0) for (const c of Object.keys(out)) out[c].splice(i, 1);
        }
      }
    });
  }
  return out;
}

/** Remplace partout (dans une copie) les identifiants provisoires connus par les vrais. */
export function substituerIds(valeur, correspondance) {
  if (Array.isArray(valeur)) return valeur.map((v) => substituerIds(v, correspondance));
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, substituerIds(v, correspondance)]));
  }
  if (estProvisoire(valeur) && Object.prototype.hasOwnProperty.call(correspondance, valeur)) return correspondance[valeur];
  return valeur;
}

/** Les identifiants provisoires encore présents dans des actions : ils n'ont pas de réalité côté Grist. */
export function provisoiresRestants(valeur, acc = new Set()) {
  if (Array.isArray(valeur)) valeur.forEach((v) => provisoiresRestants(v, acc));
  else if (valeur && typeof valeur === 'object') Object.values(valeur).forEach((v) => provisoiresRestants(v, acc));
  else if (estProvisoire(valeur)) acc.add(valeur);
  return acc;
}

/** Une action écrit-elle dans une table de l'utilisateur ? Les actions de structure ne se mettent pas en file. */
export function estEcritureSimple(action) {
  return Array.isArray(action) && /^(Add|Update|Remove|BulkAdd|BulkUpdate|BulkRemove)Record$/.test(action[0]);
}

/* ------------------------------------------------------------------ */
/* Le client                                                           */
/* ------------------------------------------------------------------ */

/** Un détecteur de réseau minimal : ce que dit l'appareil, corrigé par ce qu'on constate. */
export function reseauDeLAppareil(portee = globalThis) {
  const abonnes = new Set();
  let enLigne = portee.navigator ? portee.navigator.onLine !== false : true;
  const dire = () => abonnes.forEach((f) => { try { f(enLigne); } catch (_) { /* un abonné ne casse pas les autres */ } });
  if (portee.addEventListener) {
    portee.addEventListener('online', () => { enLigne = true; dire(); });
    portee.addEventListener('offline', () => { enLigne = false; dire(); });
  }
  return {
    enLigne: () => enLigne,
    poser: (v) => { if (v !== enLigne) { enLigne = !!v; dire(); } },
    abonner: (f) => { abonnes.add(f); return () => abonnes.delete(f); },
  };
}

export class ClientHorsLigne {
  /**
   * @param {object} client  un ClientRest (listTables, fetchTable, applyUserActions, televerserPieceJointe…)
   * @param {object} o  `{ stockage, reseau, maintenant, aleatoire, intervalleMs, durable }`
   */
  constructor(client, o = {}) {
    if (!client) throw new Error('ClientHorsLigne : client requis');
    this._c = client;
    this._s = o.stockage || new StockageMemoire();
    this._reseau = o.reseau || reseauDeLAppareil(null || {});
    this._maintenant = o.maintenant || (() => Date.now());
    this._intervalleMs = o.intervalleMs ?? 30000;
    this.durable = o.durable !== false;
    this.mode = client.mode;
    this.baseUrl = client.baseUrl;
    this.docId = client.docId;
    this.jeton = client.jeton;
    this._abonnes = new Set();
    this._envoi = null;
    this._file = [];            // reflet mémoire de la file (trié)
    this._prochainProvisoire = BASE_PROVISOIRE;
    this._correspondance = {};  // provisoire → réel, pour les entrées suivantes
    this._dernierEchec = 0;
    this._horsLigne = false;    // constaté par un échec, pas seulement annoncé par l'appareil
    this._derniereSynchro = null;
    this._minuteur = null;
    this._pret = this._charger();
    this._reseau.abonner?.((en) => { if (en) { this._horsLigne = false; this.envoyer(); } this._emettre(); });
  }

  /* ----- état ----- */

  async _charger() {
    const entrees = (await this._s.list('file')).filter((e) => e.doc === this._cle());
    entrees.sort((a, b) => a.ordre - b.ordre);
    for (const e of entrees) {
      // Un envoi interrompu : on ne sait pas s'il est arrivé. On le montre, on ne le renvoie pas.
      if (e.etat === ETATS.EN_COURS) { e.etat = ETATS.INCERTAINE; await this._s.put('file', e.id, e); }
    }
    this._file = entrees;
    const divers = (await this._s.get('divers', 'etat:' + this._cle())) || {};
    this._prochainProvisoire = divers.prochainProvisoire || BASE_PROVISOIRE;
    this._correspondance = divers.correspondance || {};
    this._derniereSynchro = divers.derniereSynchro || null;
    this._emettre();
    if (this._file.some((e) => e.etat === ETATS.EN_ATTENTE)) this._armer();
  }

  _cle() { return `${this.baseUrl || ''}|${this.docId || ''}`; }

  async _sauverDivers() {
    await this._s.put('divers', 'etat:' + this._cle(), {
      prochainProvisoire: this._prochainProvisoire, correspondance: this._correspondance,
      derniereSynchro: this._derniereSynchro,
    });
  }

  /** Ce que l'interface montre : réseau, file, dernière synchronisation. */
  etat() {
    const compte = (e) => this._file.filter((x) => x.etat === e).length;
    return {
      enLigne: this._reseau.enLigne() && !this._horsLigne,
      enAttente: compte(ETATS.EN_ATTENTE) + compte(ETATS.EN_COURS),
      incertaines: compte(ETATS.INCERTAINE),
      refusees: compte(ETATS.REFUSEE),
      envoiEnCours: !!this._envoi,
      derniereSynchro: this._derniereSynchro,
      durable: this.durable,
    };
  }

  /** Les entrées de la file, pour les montrer (jamais les fichiers eux-mêmes). */
  entrees() {
    return this._file.map((e) => ({
      id: e.id, etat: e.etat, date: e.date, raison: e.raison || null,
      resume: resumer(e.actions), pieceJointe: !!(e.pj && e.pj.length),
    }));
  }

  abonner(f) { this._abonnes.add(f); return () => this._abonnes.delete(f); }
  _emettre() { const e = this.etat(); this._abonnes.forEach((f) => { try { f(e); } catch (_) { /* idem */ } }); }

  /* ----- lecture ----- */

  async _lu(cle, lecture) {
    await this._pret;
    const k = `${this._cle()}|${cle}`;
    const surFile = () => this._file.filter((e) => e.etat !== ETATS.REFUSEE);
    try {
      // Réseau annoncé coupé, ou échec tout récent : on sert l'appareil sans attendre un nouvel échec (une relecture
      // périodique ne doit pas empiler des délais d'attente).
      const recent = this._horsLigne && this._maintenant() - this._dernierEchec < 15000;
      if ((this._reseau.enLigne() === false || recent) && await this._s.get('cache', k)) throw Object.assign(new Error('hors ligne'), { name: 'TypeError' });
      const donnees = await lecture();
      this._constaterReseau(true);
      await this._s.put('cache', k, { donnees, date: this._maintenant() }).catch(() => {});
      return { donnees, date: this._maintenant(), cache: false, file: surFile() };
    } catch (e) {
      if (!estErreurReseau(e)) throw e;
      this._constaterReseau(false);
      const garde = await this._s.get('cache', k);
      if (!garde) throw e;
      return { donnees: garde.donnees, date: garde.date, cache: true, file: surFile() };
    }
  }

  /** Qui est connecté — gardé sur l'appareil : sans réseau, la personne reste la même. */
  async profil() {
    if (typeof this._c.profil !== 'function') return null;
    const r = await this._lu('profil', () => this._c.profil());
    return r.donnees;
  }

  async listTables() {
    const r = await this._lu('tables', () => this._c.listTables());
    this._memoriserAge('tables', r);
    return r.donnees;
  }

  async fetchTable(table) {
    const r = await this._lu('table:' + table, () => this._c.fetchTable(table));
    this._memoriserAge(table, r);
    // Une table de métadonnées ne reçoit jamais d'écriture locale.
    return String(table).startsWith('_grist_') ? r.donnees : appliquerFileSurTable(r.donnees, table, r.file);
  }

  _memoriserAge(nom, r) {
    this._ages = this._ages || {};
    this._ages[nom] = { date: r.date, cache: r.cache };
    if (r.cache) this._emettre();
  }

  /** Les tables servies depuis l'appareil, avec leur âge : de quoi dire « données du 02/10 à 09 h 14 ». */
  instantanes() {
    return Object.entries(this._ages || {}).filter(([, v]) => v.cache).map(([nom, v]) => ({ table: nom, date: v.date }));
  }

  _constaterReseau(ok) {
    if (ok && this._horsLigne) { this._horsLigne = false; this._emettre(); }
    if (!ok) this._dernierEchec = this._maintenant();
    if (!ok && !this._horsLigne) { this._horsLigne = true; this._reseau.poser?.(false); this._armer(); this._emettre(); }
  }

  /* ----- préparer pour le terrain ----- */

  /** Lit au réseau — jamais depuis l'appareil — et garde : on prépare pour plus tard, on ne reprend pas ce qu'on avait. */
  async _lireEtGarder(cle, lecture) {
    const donnees = await lecture();
    this._constaterReseau(true);
    await this._s.put('cache', `${this._cle()}|${cle}`, { donnees, date: this._maintenant() });
    return donnees;
  }

  /**
   * Rend la scène disponible sans réseau : toutes ses tables, les métadonnées qu'Atlas lit à l'ouverture, et les photos
   * qu'elles référencent (dans la limite de `plafondPhotosOctets`).
   *
   * Lit tout au réseau, d'où un échec net quand il manque : on ne laisse pas croire qu'une scène est prête quand elle ne
   * l'est pas. Un échec sur une table seule (illisible, refusée) n'arrête pas la préparation : elle est comptée, et dite.
   *
   * @param {object} [o]
   * @param {(e: {phase: string, fait: number, total: number, nom?: string}) => void} [o.onProgres]
   * @param {boolean} [o.photos=true]
   * @returns {Promise<object>} l'état de préparation (voir `etatHorsLigne`)
   */
  async preparerHorsLigne({ onProgres = () => {}, photos = true, plafondPhotosOctets = PLAFOND_PHOTOS_OCTETS } = {}) {
    await this._pret;
    const dire = (e) => { try { onProgres(e); } catch (_) { /* un affichage qui échoue n'arrête pas la lecture */ } };
    let liste;
    try { liste = await this._lireEtGarder('tables', () => this._c.listTables()); }
    catch (e) {
      if (estErreurReseau(e)) { this._constaterReseau(false); throw new Error('Pas de réseau : la scène ne peut pas être préparée maintenant.'); }
      throw e;
    }
    const utilisateur = liste.filter((t) => !String(t).startsWith('_grist_'));
    const aLire = [...TABLES_META.map((n) => ({ nom: n, meta: true })), ...utilisateur.map((n) => ({ nom: n, meta: false }))];
    const lues = {};
    const tables = [];
    const echecs = [];
    let fait = 0;
    for (const { nom, meta } of aLire) {
      dire({ phase: 'tables', fait, total: aLire.length, nom });
      try {
        const d = await this._lireEtGarder('table:' + nom, () => this._c.fetchTable(nom));
        lues[nom] = d;
        tables.push({ nom, lignes: (d?.id || []).length, octets: JSON.stringify(d || {}).length, meta });
      } catch (e) {
        // Une table de métadonnées absente n'est pas une panne ; une table de l'utilisateur manquante, si.
        if (!meta) echecs.push({ nom, raison: String(e?.message || e) });
        if (estErreurReseau(e) && !meta) { this._constaterReseau(false); }
      }
      fait++;
    }
    dire({ phase: 'tables', fait, total: aLire.length });

    const pj = { n: 0, octets: 0, ids: [], ignorees: 0 };
    if (photos && typeof this._c.pieceJointe === 'function') {
      const colonnes = colonnesPiecesJointes(lues._grist_Tables, lues._grist_Tables_column);
      const ids = new Set();
      for (const [table, cols] of Object.entries(colonnes)) for (const id of idsPiecesJointes(lues[table], cols)) ids.add(id);
      const tous = [...ids];
      let i = 0;
      for (const id of tous) {
        dire({ phase: 'photos', fait: i, total: tous.length });
        i++;
        if (pj.octets >= plafondPhotosOctets) { pj.ignorees++; continue; }
        try {
          const blob = await this._c.pieceJointe(id);
          await this._s.put('divers', `pjreel:${this._cle()}|${id}`, { blob, taille: blob?.size || 0 });
          pj.n++; pj.octets += blob?.size || 0; pj.ids.push(id);
        } catch (e) {
          pj.ignorees++;
          if (estErreurReseau(e)) { this._constaterReseau(false); break; }
        }
      }
      dire({ phase: 'photos', fait: tous.length, total: tous.length });
    }

    const etat = {
      version: 1, doc: this._cle(), date: this._maintenant(), tables, photos: pj, echecs,
      octets: tables.reduce((s, x) => s + x.octets, 0) + pj.octets,
    };
    await this._s.put('divers', 'pret:' + this._cle(), etat);
    this._emettre();
    return etat;
  }

  /** Ce qui est gardé pour cette scène, ou `null` : date, tables (lignes, taille), photos, échecs. */
  async etatHorsLigne() {
    await this._pret;
    return (await this._s.get('divers', 'pret:' + this._cle())) || null;
  }

  /** Libère ce que `preparerHorsLigne` a gardé : tables et photos. La file d'écriture, elle, n'est jamais touchée. */
  async libererHorsLigne() {
    await this._pret;
    const etat = await this.etatHorsLigne();
    if (!etat) return false;
    const k = this._cle();
    for (const t of etat.tables || []) await this._s.delete('cache', `${k}|table:${t.nom}`);
    await this._s.delete('cache', `${k}|tables`);
    for (const id of etat.photos?.ids || []) await this._s.delete('divers', `pjreel:${k}|${id}`);
    await this._s.delete('divers', 'pret:' + k);
    this._emettre();
    return true;
  }

  /* ----- écriture ----- */

  async applyUserActions(actions) {
    await this._pret;
    const aMettreEnFile = this._file.some((e) => e.etat === ETATS.EN_ATTENTE || e.etat === ETATS.EN_COURS);
    const direct = this._reseau.enLigne() && !this._horsLigne && !aMettreEnFile;
    if (direct) {
      try {
        const r = await this._c.applyUserActions(actions);
        this._constaterReseau(true);
        return r;
      } catch (e) {
        if (!estErreurReseau(e)) throw e;
        this._constaterReseau(false);
      }
    }
    // Les réglages d'Atlas (préférences de couche, récit, formulaires) ne sont pas des relevés : écrits sans réseau, ils
    // seraient faits d'une copie périmée. Ils échouent comme avant, et Atlas les réécrit au retour du réseau.
    if ((actions || []).some((a) => estTableAtlas(a[1]))) {
      throw Object.assign(new TypeError('Hors réseau : les réglages d\'Atlas s\'écrivent au retour du réseau.'), { horsReseau: true });
    }
    if (!(actions || []).every(estEcritureSimple)) {
      // Créer une table ou une colonne sans réseau : on ne le promet pas, on le dit.
      throw Object.assign(new TypeError('Hors réseau : cette modification de structure du document attend le retour du réseau.'), { horsReseau: true });
    }
    return this._mettreEnFile(actions);
  }

  async _mettreEnFile(actions, pj = []) {
    const provisoires = [];
    const retValues = actions.map((a, k) => {
      if (a[0] === 'AddRecord') { const id = this._prochainProvisoire--; provisoires[k] = id; return id; }
      if (a[0] === 'BulkAddRecord') {
        const ids = (a[2] || []).map(() => this._prochainProvisoire--);
        provisoires[k] = ids;
        return ids;
      }
      return null;
    });
    const entree = {
      id: `${this._maintenant()}-${BASE_PROVISOIRE - this._prochainProvisoire}`,
      doc: this._cle(),
      ordre: (this._file.reduce((m, e) => Math.max(m, e.ordre), 0)) + 1,
      date: this._maintenant(),
      etat: ETATS.EN_ATTENTE,
      actions: JSON.parse(JSON.stringify(actions)),
      provisoires,
      pj,
    };
    // AddRecord dont la ligne est donnée : les actions portent déjà l'identifiant `null` ; on garde le provisoire à côté.
    await this._s.put('file', entree.id, entree);
    this._file.push(entree);
    await this._sauverDivers();
    this._emettre();
    this._armer();
    // Une tentative immédiate : si c'était une coupure brève, la file se vide sans attendre.
    if (this._reseau.enLigne() && !this._horsLigne) this.envoyer();
    return { retValues, _enAttente: true };
  }

  async televerserPieceJointe(fichier) {
    await this._pret;
    const enAttente = this._file.some((e) => e.etat === ETATS.EN_ATTENTE);
    if (this._reseau.enLigne() && !this._horsLigne && !enAttente) {
      try {
        const id = await this._c.televerserPieceJointe(fichier);
        this._constaterReseau(true);
        return id;
      } catch (e) {
        if (!estErreurReseau(e)) throw e;
        this._constaterReseau(false);
      }
    }
    const id = this._prochainProvisoire--;
    await this._s.put('pj', String(id), { id, doc: this._cle(), fichier, nom: fichier?.name || 'photo', reel: null });
    await this._sauverDivers();
    return id;
  }

  async urlPieceJointe(id) {
    if (estProvisoire(id)) {
      const p = await this._s.get('pj', String(id));
      if (p?.fichier) return URL.createObjectURL(p.fichier);
      if (p?.reel != null) return this._c.urlPieceJointe(p.reel);
      throw new Error(`Pièce jointe provisoire ${id} introuvable`);
    }
    // Une photo gardée pour le terrain se sert de l'appareil : sans réseau, elle s'affiche quand même.
    const gardee = await this._s.get('divers', `pjreel:${this._cle()}|${id}`);
    if (gardee?.blob) return URL.createObjectURL(gardee.blob);
    return this._c.urlPieceJointe(id);
  }

  /* ----- envoi ----- */

  _armer() {
    if (this._minuteur || !this._intervalleMs) return;
    this._minuteur = setInterval(() => {
      if (!this._file.some((e) => e.etat === ETATS.EN_ATTENTE)) { clearInterval(this._minuteur); this._minuteur = null; return; }
      this.envoyer();
    }, this._intervalleMs);
    this._minuteur.unref?.();
  }

  /** Envoie la file, dans l'ordre. Un seul envoi à la fois ; s'arrête au premier échec de réseau. */
  envoyer() {
    if (this._envoi) return this._envoi;
    this._envoi = (async () => {
      await this._pret;
      this._emettre();
      try {
        for (const e of [...this._file]) {
          if (e.etat !== ETATS.EN_ATTENTE) continue;
          const fini = await this._envoyerEntree(e);
          if (fini === 'reseau') break;
        }
      } finally {
        this._envoi = null;
        this._emettre();
      }
    })();
    return this._envoi;
  }

  async _envoyerEntree(e) {
    // 1. Les pièces jointes d'abord : leurs vrais identifiants vont dans la ligne.
    let actions = substituerIds(e.actions, this._correspondance);
    const orphelines = [...provisoiresRestants(actions)];
    for (const id of orphelines) {
      const p = await this._s.get('pj', String(id));
      if (!p) continue;
      if (p.reel == null) {
        try {
          p.reel = await this._c.televerserPieceJointe(p.fichier);
          await this._s.put('pj', String(id), { ...p, reel: p.reel });
        } catch (err) {
          if (estErreurReseau(err)) { this._constaterReseau(false); return 'reseau'; }
          return this._refuser(e, err);
        }
      }
      this._correspondance[id] = p.reel;
    }
    actions = substituerIds(e.actions, this._correspondance);
    const reste = provisoiresRestants(actions);
    if (reste.size) {
      return this._refuser(e, new Error('Cette écriture dépend d\'une ligne créée hors réseau qui n\'a pas pu être envoyée.'));
    }
    // 2. L'envoi. L'état « en cours » est écrit AVANT : si l'application est fermée ici, l'entrée sera « incertaine ».
    e.etat = ETATS.EN_COURS;
    await this._s.put('file', e.id, e);
    this._emettre();
    let r;
    try {
      r = await this._c.applyUserActions(actions);
    } catch (err) {
      if (estErreurReseau(err)) {
        e.etat = ETATS.EN_ATTENTE;
        await this._s.put('file', e.id, e);
        this._constaterReseau(false);
        return 'reseau';
      }
      return this._refuser(e, err);
    }
    // 3. Les identifiants réels des lignes créées remplacent les provisoires dans la suite de la file.
    const retours = Array.isArray(r) ? r : (r?.retValues || []);
    (e.provisoires || []).forEach((prov, k) => {
      if (prov == null) return;
      const reel = retours[k];
      if (Array.isArray(prov)) prov.forEach((p, j) => { if (Array.isArray(reel) && reel[j] != null) this._correspondance[p] = reel[j]; });
      else if (reel != null) this._correspondance[prov] = reel;
    });
    this._file = this._file.filter((x) => x.id !== e.id);
    await this._s.delete('file', e.id);
    this._derniereSynchro = this._maintenant();
    await this._sauverDivers();
    this._constaterReseau(true);
    this._emettre();
    return 'ok';
  }

  async _refuser(e, err) {
    e.etat = ETATS.REFUSEE;
    e.raison = String(err?.message || err).slice(0, 240);
    await this._s.put('file', e.id, e);
    this._emettre();
    return 'refusee';
  }

  /* ----- gestes de la personne ----- */

  /** Renvoyer une entrée refusée ou incertaine. */
  async reessayer(id) {
    const e = this._file.find((x) => x.id === id);
    if (!e || e.etat === ETATS.EN_COURS || e.etat === ETATS.EN_ATTENTE) return false;
    e.etat = ETATS.EN_ATTENTE; e.raison = null;
    await this._s.put('file', e.id, e);
    this._emettre();
    this.envoyer();
    return true;
  }

  /** Renoncer à une entrée : elle disparaît de la file, et des lectures. */
  async abandonner(id) {
    const e = this._file.find((x) => x.id === id);
    if (!e || e.etat === ETATS.EN_COURS) return false;
    this._file = this._file.filter((x) => x.id !== id);
    await this._s.delete('file', id);
    this._emettre();
    return true;
  }
}

/** Une ligne lisible pour une entrée : « 1 ajout dans Table_visites ». */
export function resumer(actions) {
  const noms = { AddRecord: 'ajout', BulkAddRecord: 'ajout', UpdateRecord: 'modification', BulkUpdateRecord: 'modification', RemoveRecord: 'suppression', BulkRemoveRecord: 'suppression' };
  const compte = new Map();
  for (const a of actions || []) {
    const nom = noms[a[0]] || a[0];
    const n = /^Bulk/.test(a[0]) ? (a[2] || []).length : 1;
    const cle = nom + '|' + a[1];
    compte.set(cle, (compte.get(cle) || 0) + n);
  }
  return [...compte.entries()].map(([k, n]) => {
    const [nom, table] = k.split('|');
    return n + ' ' + nom + (n > 1 ? 's' : '') + ' dans ' + table;
  }).join(', ');
}

/**
 * Les scènes préparées pour le terrain sur cet appareil : `Map` de l'identifiant du document vers son état de préparation.
 * Sert la liste des scènes, qui n'a pas de client par scène.
 */
export async function scenesPreparees(stockage, baseUrl) {
  const out = new Map();
  try {
    const prefixe = `${baseUrl || ''}|`;
    for (const v of await stockage.list('divers')) {
      if (v && v.version && typeof v.doc === 'string' && v.doc.startsWith(prefixe) && Array.isArray(v.tables)) {
        out.set(v.doc.slice(prefixe.length), v);
      }
    }
  } catch (_) { /* un appareil sans stockage ne prépare rien : la liste reste sans mention */ }
  return out;
}

/**
 * Habille un client REST pour l'application : stockage durable si l'appareil en offre un, réseau de l'appareil.
 * Rend le client lui-même si le mode n'est pas autonome (dans un widget, Grist tient ses propres garanties).
 */
export function habillerHorsLigne(client, { portee = globalThis, stockage = null, reseau = null, ...o } = {}) {
  if (!client || client.mode !== 'rest') return client;
  const choix = stockage ? { stockage, durable: true } : stockageParDefaut(portee);
  return new ClientHorsLigne(client, {
    stockage: choix.stockage, durable: choix.durable, reseau: reseau || reseauDeLAppareil(portee), ...o,
  });
}

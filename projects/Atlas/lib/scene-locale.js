/**
 * Une scène sur l'appareil : un document Grist en petit, qui n'a pas de document distant derrière.
 *
 * Atlas parle à Grist par six points d'entrée (`lib/grist-adapter.js`) : lister les tables, lire une table, appliquer des
 * actions, lire et verser une pièce jointe. Une scène locale les offre sur des données gardées dans l'appareil — de quoi
 * créer une scène de zéro sans réseau, puis l'envoyer dans un document Grist quand on en a un (`lib/creer-document.js`).
 *
 * Deux couches, comme `lib/hors-ligne.js` :
 * - un **moteur pur** (`creerScene`, `appliquerActions`, `tableColonnaire`, `metaTables`, `metaColonnes`) qui interprète les
 *   actions qu'Atlas émet : `AddTable`, `AddColumn`, `RemoveColumn`, `AddRecord`, `BulkAddRecord`, `UpdateRecord`,
 *   `BulkUpdateRecord`, `RemoveRecord`, `BulkRemoveRecord` ; tout autre est refusé **en le disant**, jamais ignoré — une
 *   scène qui perdrait un geste en silence serait pire qu'une scène qui le refuse ;
 * - un **client** (`ClientLocal`) qui garde l'état dans un stockage (`StockageIndexedDB` ou `StockageMemoire`).
 *
 * Ce qu'une scène locale ne sait pas : les colonnes à formule (rien ne les calcule), les vues Grist (les tables de
 * métadonnées des vues sont vides), les règles d'accès. Pour une scène neuve, rien de cela n'existe ; c'est la limite
 * d'un document qu'on n'a pas encore ouvert dans Grist.
 */

export const VERSION = '1.0.0';

export const PREFIXE_LOCAL = 'local:';

/** L'identifiant de document d'une scène locale, et son contraire. */
export const idDocumentLocal = (id) => `${PREFIXE_LOCAL}${id}`;
export const estIdLocal = (docId) => String(docId || '').startsWith(PREFIXE_LOCAL);
export const idDepuisDocument = (docId) => String(docId || '').slice(PREFIXE_LOCAL.length);

/* ------------------------------------------------------------------ */
/* Le moteur                                                           */
/* ------------------------------------------------------------------ */

/** Une scène vide. `tables[nom] = { cols: [{ id, type, label, widgetOptions, visibleCol }], ids: [], data: { col: [] } }`. */
export function creerScene({ id, nom, maintenant = Date.now() } = {}) {
  return { version: 1, id, nom: nom || 'Scène locale', creeLe: maintenant, modifieLe: maintenant, tables: {}, pj: {}, prochainePj: 1 };
}

/** Grist range sa structure dans `_grist_Tables` ; Atlas la lit à l'ouverture. Les identifiants de ligne suivent l'ordre de création. */
export function metaTables(scene) {
  const noms = Object.keys(scene.tables);
  return { id: noms.map((_, i) => i + 1), tableId: [...noms] };
}

export function metaColonnes(scene) {
  const noms = Object.keys(scene.tables);
  const out = { id: [], parentId: [], colId: [], type: [], label: [], isFormula: [], widgetOptions: [], visibleCol: [], formula: [] };
  let n = 1;
  noms.forEach((nom, i) => {
    out.id.push(n++); out.parentId.push(i + 1); out.colId.push('id'); out.type.push('Id'); out.label.push('id');
    out.isFormula.push(false); out.widgetOptions.push(''); out.visibleCol.push(0); out.formula.push('');
    for (const c of scene.tables[nom].cols) {
      out.id.push(n++); out.parentId.push(i + 1); out.colId.push(c.id); out.type.push(c.type || 'Text');
      out.label.push(c.label || c.id); out.isFormula.push(false);
      out.widgetOptions.push(typeof c.widgetOptions === 'string' ? c.widgetOptions : (c.widgetOptions ? JSON.stringify(c.widgetOptions) : ''));
      out.visibleCol.push(0); out.formula.push('');
    }
  });
  return out;
}

/** Une table au format colonnaire de l'API plugin : `{ id: [], col: [] }`. Copie : l'appelant ne touche pas à l'état. */
export function tableColonnaire(scene, nom) {
  const t = scene.tables[nom];
  if (!t) throw new Error(`Table introuvable : ${nom}`);
  const out = { id: [...t.ids] };
  for (const c of t.cols) out[c.id] = [...(t.data[c.id] || [])];
  return out;
}

const ids = (t) => t.ids;
const valeurParDefaut = () => null;

function table(scene, nom) {
  const t = scene.tables[nom];
  if (!t) throw new Error(`Table introuvable : ${nom}`);
  return t;
}

/** Un identifiant de table libre : Grist en pose un autre quand le nom est pris, le client local fait de même. */
function nomLibre(scene, voulu) {
  const pris = new Set(Object.keys(scene.tables).map((n) => n.toLowerCase()));
  const base = String(voulu || 'Table1').replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1');
  if (!pris.has(base.toLowerCase())) return base;
  let i = 2;
  while (pris.has(`${base}${i}`.toLowerCase())) i++;
  return `${base}${i}`;
}

function ajouterColonne(t, def) {
  if (!def?.id) throw new Error('Colonne sans identifiant');
  if (t.cols.some((c) => c.id === def.id)) throw new Error(`Colonne déjà présente : ${def.id}`);
  if (def.isFormula || def.formula) throw new Error(`Colonne à formule non prise en charge sur l’appareil : ${def.id}`);
  t.cols.push({
    id: def.id, type: def.type || 'Text', label: def.label || def.id,
    widgetOptions: def.widgetOptions ?? '', visibleCol: def.visibleCol ?? 0,
  });
  t.data[def.id] = t.ids.map(valeurParDefaut);
}

function ajouterLigne(t, id, champs) {
  const rang = id ?? (t.ids.length ? Math.max(...t.ids) + 1 : 1);
  if (t.ids.includes(rang)) throw new Error(`Identifiant de ligne déjà pris : ${rang}`);
  t.ids.push(rang);
  for (const c of t.cols) t.data[c.id].push(valeurParDefaut());
  const i = t.ids.length - 1;
  for (const [col, v] of Object.entries(champs || {})) {
    if (!t.data[col]) throw new Error(`Colonne introuvable : ${col}`);
    t.data[col][i] = v;
  }
  return rang;
}

function poser(t, id, champs) {
  const i = t.ids.indexOf(id);
  if (i < 0) throw new Error(`Ligne introuvable : ${id}`);
  for (const [col, v] of Object.entries(champs || {})) {
    if (!t.data[col]) throw new Error(`Colonne introuvable : ${col}`);
    t.data[col][i] = v;
  }
}

function retirer(t, id) {
  const i = t.ids.indexOf(id);
  if (i < 0) return;
  t.ids.splice(i, 1);
  for (const c of t.cols) t.data[c.id].splice(i, 1);
}

/**
 * Applique des actions à la scène (modifiée en place) et rend ce que Grist rendrait : un identifiant pour
 * `AddRecord`, la liste des identifiants pour `BulkAddRecord`, `{ table_id, id, columns, views }` pour `AddTable`.
 *
 * L'ensemble est **atomique** : une action en échec défait les précédentes du même lot, comme Grist le fait d'un
 * `/apply`. Sans quoi une table à moitié créée resterait dans la scène.
 *
 * @returns {{ retValues: any[], tablesTouchees: Set<string> }}
 * @throws {Error} action inconnue ou refusée — la scène est alors inchangée
 */
export function appliquerActions(scene, actions) {
  const copie = JSON.parse(JSON.stringify({ tables: scene.tables, pj: scene.pj, prochainePj: scene.prochainePj }));
  const retValues = [];
  const touchees = new Set();
  try {
    for (const a of actions || []) {
      const [type, nom] = a;
      touchees.add(nom);
      if (type === 'AddTable') {
        const reel = nomLibre(scene, nom);
        scene.tables[reel] = { cols: [], ids: [], data: {} };
        for (const def of (Array.isArray(a[2]) ? a[2] : [])) {
          if (def?.id === 'id') continue;
          ajouterColonne(scene.tables[reel], def);
        }
        touchees.add(reel);
        retValues.push({ table_id: reel, id: Object.keys(scene.tables).length, columns: scene.tables[reel].cols.map((c) => c.id), views: [] });
      } else if (type === 'AddColumn') {
        ajouterColonne(table(scene, nom), { ...(a[3] || {}), id: a[2] });
        retValues.push({ colRef: table(scene, nom).cols.length });
      } else if (type === 'RemoveColumn') {
        const t = table(scene, nom);
        if (!t.cols.some((c) => c.id === a[2])) throw new Error(`Colonne introuvable : ${a[2]}`);
        t.cols = t.cols.filter((c) => c.id !== a[2]);
        delete t.data[a[2]];
        retValues.push(null);
      } else if (type === 'AddRecord') {
        retValues.push(ajouterLigne(table(scene, nom), a[2], a[3]));
      } else if (type === 'BulkAddRecord') {
        const t = table(scene, nom);
        const cols = Object.keys(a[3] || {});
        const demandes = Array.isArray(a[2]) ? a[2] : [];
        const n = demandes.length || Math.max(0, ...cols.map((c) => (a[3][c] || []).length));
        const posees = [];
        for (let j = 0; j < n; j++) posees.push(ajouterLigne(t, demandes[j] ?? null, Object.fromEntries(cols.map((c) => [c, a[3][c][j]]))));
        retValues.push(posees);
      } else if (type === 'UpdateRecord') {
        poser(table(scene, nom), a[2], a[3]);
        retValues.push(null);
      } else if (type === 'BulkUpdateRecord') {
        const t = table(scene, nom);
        const cols = Object.keys(a[3] || {});
        (a[2] || []).forEach((id, j) => poser(t, id, Object.fromEntries(cols.map((c) => [c, a[3][c][j]]))));
        retValues.push(null);
      } else if (type === 'RemoveRecord') {
        retirer(table(scene, nom), a[2]);
        retValues.push(null);
      } else if (type === 'BulkRemoveRecord') {
        const t = table(scene, nom);
        for (const id of a[2] || []) retirer(t, id);
        retValues.push(null);
      } else {
        throw new Error(`Action non prise en charge sur l’appareil : ${type}`);
      }
    }
  } catch (e) {
    scene.tables = copie.tables; scene.pj = copie.pj; scene.prochainePj = copie.prochainePj;
    throw e;
  }
  return { retValues, tablesTouchees: touchees };
}

/** Les colonnes de type `Ref:X` ou `RefList:X`, par table : de quoi ordonner un envoi. */
export function colonnesReference(scene) {
  const out = [];
  for (const [nom, t] of Object.entries(scene.tables)) {
    for (const c of t.cols) {
      const m = /^(Ref|RefList):(.+)$/.exec(c.type || '');
      if (m) out.push({ table: nom, col: c.id, type: c.type, cible: m[2] });
    }
  }
  return out;
}

/** Le contenu d'une scène en chiffres, pour le dire avant de l'envoyer. */
export function resumerScene(scene) {
  const tables = Object.entries(scene.tables).map(([nom, t]) => ({ nom, lignes: t.ids.length }));
  return {
    tables,
    lignes: tables.reduce((s, t) => s + t.lignes, 0),
    photos: Object.keys(scene.pj || {}).length,
  };
}

/* ------------------------------------------------------------------ */
/* Le client                                                           */
/* ------------------------------------------------------------------ */

const CLE_SCENE = (id) => `locale:${id}`;
const CLE_PJ = (id, n) => `locale:${id}|pj:${n}`;
const CLE_ENVOI = (id) => `locale-envoi:${id}`;

/**
 * Le client d'une scène locale : la forme de `ClientRest`, sur l'état d'une scène gardé dans un stockage.
 * `etat()` existe pour que la pastille de la barre dise « scène locale, à envoyer » — il n'y a pas de file d'écriture.
 */
export class ClientLocal {
  /** @param {{ stockage: object, scene: object, profil?: object|null }} o */
  constructor({ stockage, scene, profil = null }) {
    if (!stockage || !scene) throw new Error('ClientLocal : stockage et scène requis');
    this._s = stockage;
    this.scene = scene;
    this._profil = profil;
    this.mode = 'local';
    this.baseUrl = 'local';
    this.docId = idDocumentLocal(scene.id);
    this.jeton = '';
    this.local = true;
    this._abonnes = new Set();
  }

  async init() { return this; }

  async listTables() { return Object.keys(this.scene.tables); }

  async fetchTable(nom) {
    if (nom === '_grist_Tables') return metaTables(this.scene);
    if (nom === '_grist_Tables_column') return metaColonnes(this.scene);
    if (String(nom).startsWith('_grist_')) return { id: [] };
    return tableColonnaire(this.scene, nom);
  }

  async applyUserActions(actions) {
    const { retValues } = appliquerActions(this.scene, actions);
    this.scene.modifieLe = Date.now();
    await this._s.put('divers', CLE_SCENE(this.scene.id), this.scene);
    this._emettre();
    return { retValues };
  }

  async profil() { return this._profil; }

  /** Une photo prise sur l'appareil : gardée en blob, identifiée comme le serait une pièce jointe de Grist (un entier). */
  async televerserPieceJointe(fichier) {
    if (!fichier) throw new Error('Aucun fichier à envoyer');
    const n = this.scene.prochainePj++;
    await this._s.put('divers', CLE_PJ(this.scene.id, n), { blob: fichier, nom: fichier?.name || 'photo', taille: fichier?.size || 0 });
    this.scene.pj[n] = { nom: fichier?.name || 'photo', taille: fichier?.size || 0 };
    await this._s.put('divers', CLE_SCENE(this.scene.id), this.scene);
    this._emettre();
    return n;
  }

  async urlPieceJointe(id) {
    const p = await this._s.get('divers', CLE_PJ(this.scene.id, id));
    if (!p?.blob) throw new Error(`Pièce jointe ${id} introuvable sur l’appareil`);
    return URL.createObjectURL(p.blob);
  }

  /** Les pièces jointes avec leur fichier, pour l'envoi. */
  async piecesJointes() {
    const out = [];
    for (const n of Object.keys(this.scene.pj)) {
      const p = await this._s.get('divers', CLE_PJ(this.scene.id, n));
      if (p?.blob) out.push({ id: Number(n), blob: p.blob, nom: p.nom });
    }
    return out;
  }

  /** La pastille de la barre : une scène locale n'a ni file, ni réseau à attendre, mais quelque chose à envoyer. */
  etat() {
    return {
      enLigne: true, enAttente: 0, incertaines: 0, refusees: 0, envoiEnCours: false,
      derniereSynchro: null, durable: true, local: true, nomScene: this.scene.nom,
    };
  }

  entrees() { return []; }
  instantanes() { return []; }
  async envoyer() { /* l'envoi se décide dans « Envoyer vers Grist » */ }
  abonner(f) { this._abonnes.add(f); return () => this._abonnes.delete(f); }
  _emettre() { const e = this.etat(); this._abonnes.forEach((f) => { try { f(e); } catch (_) { /* un affichage qui échoue n'arrête rien */ } }); }
}

/* ------------------------------------------------------------------ */
/* Le registre des scènes locales                                      */
/* ------------------------------------------------------------------ */

export function identifiantNeuf(aleatoire = Math.random, maintenant = Date.now) {
  return `${maintenant().toString(36)}${Math.floor(aleatoire() * 36 ** 4).toString(36).padStart(4, '0')}`;
}

/** Crée une scène locale vide et la garde. */
export async function creerSceneLocale(stockage, { nom, aleatoire, maintenant } = {}) {
  const t = (maintenant || Date.now)();
  const scene = creerScene({ id: identifiantNeuf(aleatoire, maintenant), nom, maintenant: t });
  await stockage.put('divers', CLE_SCENE(scene.id), scene);
  return scene;
}

export async function lireSceneLocale(stockage, id) {
  return (await stockage.get('divers', CLE_SCENE(id))) || null;
}

/** Les scènes locales de l'appareil, les plus récemment modifiées d'abord. */
export async function scenesLocales(stockage) {
  try {
    const toutes = (await stockage.list('divers')).filter((v) => v && v.version && v.tables && typeof v.id === 'string' && v.creeLe && !v.blob);
    return toutes.sort((a, b) => (b.modifieLe || 0) - (a.modifieLe || 0));
  } catch (_) { return []; }
}

/** Supprime une scène locale, ses pièces jointes et le journal de son envoi. */
export async function supprimerSceneLocale(stockage, id) {
  const s = await lireSceneLocale(stockage, id);
  for (const n of Object.keys(s?.pj || {})) await stockage.delete('divers', CLE_PJ(id, n));
  await stockage.delete('divers', CLE_ENVOI(id));
  await stockage.delete('divers', CLE_SCENE(id));
}

export const cleEnvoi = CLE_ENVOI;

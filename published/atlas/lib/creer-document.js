/**
 * Créer un document Grist depuis Atlas, et y verser une scène.
 *
 * Deux gestes, un seul chemin :
 * - **« Nouvelle scène » dans Grist** : on bâtit une scène vide (`scene-locale.js`, avec la table de préférences d'Atlas) et on
 *   l'envoie ;
 * - **« Envoyer vers Grist »** : on envoie la scène qu'on a faite sur l'appareil, éventuellement sans réseau.
 *
 * L'envoi est un **plan d'étapes** exécuté avec un **journal** :
 *
 *     document → photos → tables → données (par table, par lots)
 *
 * Chaque étape est rejouable. Le journal (identifiant du document créé, photos déjà versées, tables déjà créées) se garde au
 * fur et à mesure : un réseau qui tombe à mi-chemin ne laisse ni document doublé ni table à moitié remplie, la reprise
 * repart de là où l'on s'est arrêté. Les lignes sont versées **avec leurs identifiants** : les références entre tables
 * restent vraies sans rien traduire. Les tables sont d'abord créées sans leurs colonnes de référence, qui s'ajoutent ensuite
 * une fois toutes les tables en place — l'ordre de création ne compte donc plus.
 *
 * Module sans navigateur : le réseau, le stockage du journal et l'avancement sont des entrées.
 */
import {
  creerScene, appliquerActions, colonnesReference,
} from './scene-locale.js?v=1.16.5';
import { SCENE_PREFS_SCHEMA, ATLAS_SCENE_PREFS_TABLE } from './scene-prefs.js?v=1.16.5';

export const VERSION = '1.0.0';

/** Au-delà, on considère que la réponse ne viendra pas. */
export const DELAI_MS = 30000;

/** Lignes versées par appel : assez pour aller vite, assez peu pour qu'un échec ne perde pas tout un lot. */
export const LOT_LIGNES = 500;

const base = (u) => String(u || '').replace(/\/+$/, '');
const entetes = (jeton, extra = {}) => ({ 'Content-Type': 'application/json', ...(jeton ? { Authorization: 'Bearer ' + jeton } : {}), ...extra });

/** Un appel borné par l'horloge : sur l'application, le client natif ignore `AbortController`. */
async function appeler(url, { methode = 'GET', jeton, corps, fetchFn, delai = DELAI_MS } = {}) {
  const f = fetchFn || ((...a) => globalThis.fetch(...a));
  let minuteur;
  const horloge = new Promise((_, rejeter) => { minuteur = setTimeout(() => rejeter(new Error(`Pas de réponse en ${Math.round(delai / 1000)} s`)), delai); });
  try {
    const r = await Promise.race([f(url, { method: methode, headers: entetes(jeton), ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}) }), horloge]);
    if (!r.ok) {
      const texte = await r.text().catch(() => '');
      throw new Error(`HTTP ${r.status}${texte ? ' — ' + texte.slice(0, 160) : ''}`);
    }
    return await r.json();
  } finally { clearTimeout(minuteur); }
}

/* ------------------------------------------------------------------ */
/* Où créer                                                            */
/* ------------------------------------------------------------------ */

/**
 * Les espaces où l'on peut créer un document : ceux sur lesquels on est propriétaire ou éditeur (`access`).
 *
 * @param {Array<{id: number, name: string}>} organisations
 * @param {Object<string, Array<{id: number, name: string, access?: string}>>} espacesParOrg  clé : identifiant d'organisation
 * @returns {Array<{id: number, nom: string, org: string, acces: string}>}
 */
export function espacesEditables(organisations, espacesParOrg) {
  const out = [];
  for (const o of organisations || []) {
    for (const e of espacesParOrg?.[o.id] || []) {
      if (e && (e.access === 'owners' || e.access === 'editors')) out.push({ id: e.id, nom: e.name || 'Espace', org: o.name || '', acces: e.access });
    }
  }
  return out;
}

/** Interroge le compte : les organisations, puis leurs espaces. Rend `[]` quand rien n'est accessible, lève sur un réseau muet. */
export async function listerEspacesEditables(baseUrl, jeton, { fetchFn, delai } = {}) {
  const b = base(baseUrl);
  const orgs = await appeler(`${b}/api/orgs`, { jeton, fetchFn, delai });
  const parOrg = {};
  for (const o of orgs) {
    try { parOrg[o.id] = await appeler(`${b}/api/orgs/${o.id}/workspaces`, { jeton, fetchFn, delai }); }
    catch (_) { parOrg[o.id] = []; }
  }
  return espacesEditables(orgs, parOrg);
}

/** Le nom proposé : daté, pour que deux scènes neuves ne se confondent pas dans la liste. */
export function nomParDefaut(date = new Date()) {
  const j = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `Scène Atlas — ${j}`;
}

/** Crée un document vide dans un espace ; rend son identifiant. */
export async function creerDocument({ baseUrl, jeton, espaceId, nom, fetchFn, delai }) {
  const id = await appeler(`${base(baseUrl)}/api/workspaces/${encodeURIComponent(espaceId)}/docs`, {
    methode: 'POST', jeton, corps: { name: nom }, fetchFn, delai,
  });
  if (typeof id !== 'string' || !id) throw new Error('Grist n’a pas rendu l’identifiant du document créé.');
  return id;
}

/* ------------------------------------------------------------------ */
/* Une scène neuve                                                     */
/* ------------------------------------------------------------------ */

/**
 * Une scène vide, prête pour Atlas : la table de préférences de scène, qui suffit à la faire reconnaître dans la liste
 * (`TABLES_SIGNATURE` de `decouverte.js`). Les autres tables d'Atlas se créent à la demande, comme dans tout document.
 */
export function sceneNeuve({ id = 'neuve', nom = 'Scène Atlas', maintenant } = {}) {
  const scene = creerScene({ id, nom, maintenant });
  appliquerActions(scene, [['AddTable', ATLAS_SCENE_PREFS_TABLE, SCENE_PREFS_SCHEMA.map((c) => ({ ...c }))]]);
  return scene;
}

/** Les tables dont une seule suffit à faire reconnaître une scène dans la liste (`decouverte.js`). */
const SIGNATURE = ['Atlas_LayerPrefs', 'Atlas_Story', 'SceneManifest', 'Atlas_ScenePrefs'];

/**
 * Une scène que la liste reconnaîtra une fois envoyée : si aucune table de signature n'y est (une scène locale où l'on n'a
 * encore rien réglé), la table de préférences de scène s'y ajoute. Rend une copie, jamais la scène elle-même.
 */
export function assurerReconnaissable(scene) {
  const copie = JSON.parse(JSON.stringify(scene));
  if (!SIGNATURE.some((n) => copie.tables[n])) {
    appliquerActions(copie, [['AddTable', ATLAS_SCENE_PREFS_TABLE, SCENE_PREFS_SCHEMA.map((c) => ({ ...c }))]]);
  }
  return copie;
}

/* ------------------------------------------------------------------ */
/* Le plan                                                             */
/* ------------------------------------------------------------------ */

const sansRef = (type) => !/^(Ref|RefList):/.test(type || '');

/** Les actions qui créent les tables : colonnes ordinaires d'abord, colonnes de référence une fois toutes les tables là. */
export function actionsTables(scene, { dejaCreees = [] } = {}) {
  const deja = new Set(dejaCreees);
  const nouvelles = Object.keys(scene.tables).filter((n) => !deja.has(n));
  const actions = nouvelles.map((nom) => ['AddTable', nom, scene.tables[nom].cols.filter((c) => sansRef(c.type)).map((c) => defColonne(c))]);
  for (const r of colonnesReference(scene)) {
    if (deja.has(r.table)) continue;
    const c = scene.tables[r.table].cols.find((x) => x.id === r.col);
    actions.push(['AddColumn', r.table, r.col, defColonne(c, false)]);
  }
  return actions;
}

function defColonne(c, avecId = true) {
  const d = { type: c.type || 'Text', label: c.label || c.id };
  if (c.widgetOptions) d.widgetOptions = typeof c.widgetOptions === 'string' ? c.widgetOptions : JSON.stringify(c.widgetOptions);
  // `visibleCol` désigne une colonne par son numéro de ligne dans le document d'origine : il ne voudrait rien dire dans le nouveau.
  return avecId ? { id: c.id, ...d } : d;
}

/** Les cellules `Attachments` d'une table : leurs identifiants locaux deviennent ceux que Grist a donnés. */
function traduireCellule(valeur, type, pjMap) {
  if (type !== 'Attachments' || !Array.isArray(valeur) || valeur[0] !== 'L') return valeur;
  const ids = valeur.slice(1).map((id) => pjMap[id]).filter((id) => Number.isInteger(id));
  return ids.length ? ['L', ...ids] : null;
}

/** Les lots d'actions qui versent les lignes d'une table, à partir de la `depart`-ième (ordre des identifiants). */
export function lotsDeLignes(scene, nom, { pjMap = {}, depart = 0, taille = LOT_LIGNES } = {}) {
  const t = scene.tables[nom];
  const ordre = t.ids.map((id, i) => [id, i]).sort((a, b) => a[0] - b[0]).slice(depart);
  const lots = [];
  for (let i = 0; i < ordre.length; i += taille) {
    const part = ordre.slice(i, i + taille);
    const donnees = {};
    for (const c of t.cols) donnees[c.id] = part.map(([, k]) => traduireCellule(t.data[c.id][k], c.type, pjMap));
    lots.push(['BulkAddRecord', nom, part.map(([id]) => id), donnees]);
  }
  return lots;
}

/** Le plan, en clair : de quoi dire ce qui va se passer avant de le faire, et suivre l'avancement. */
export function planEnvoi(sceneBrute) {
  const scene = assurerReconnaissable(sceneBrute);
  const etapes = [{ id: 'document', libelle: 'Créer le document' }];
  const photos = Object.keys(scene.pj || {}).length;
  if (photos) etapes.push({ id: 'photos', libelle: `Verser ${photos} photo${photos > 1 ? 's' : ''}`, total: photos });
  etapes.push({ id: 'tables', libelle: 'Créer les tables', total: Object.keys(scene.tables).length });
  for (const [nom, t] of Object.entries(scene.tables)) {
    if (t.ids.length) etapes.push({ id: `donnees:${nom}`, libelle: `Verser « ${nom} »`, table: nom, total: t.ids.length });
  }
  return etapes;
}

/* ------------------------------------------------------------------ */
/* L'exécution                                                         */
/* ------------------------------------------------------------------ */

/** Le journal d'un envoi : ce qui est déjà fait, pour reprendre. */
export function journalVide() {
  return { docId: null, nomDocument: null, espaceId: null, photos: {}, tablesCreees: [], termine: false };
}

async function compterLignes({ baseUrl, jeton, docId, table, fetchFn, delai }) {
  const q = encodeURIComponent(`select count(*) as n from "${String(table).replace(/"/g, '')}"`);
  const r = await appeler(`${base(baseUrl)}/api/docs/${docId}/sql?q=${q}`, { jeton, fetchFn, delai });
  const n = r?.records?.[0]?.fields?.n;
  return Number.isInteger(n) ? n : 0;
}

/**
 * Verse une scène dans un document Grist neuf.
 *
 * @param {object} o
 * @param {object} o.scene                 la scène à envoyer
 * @param {() => Promise<Array<{id:number, blob:Blob, nom:string}>>} [o.piecesJointes]  les photos de la scène
 * @param {string} o.baseUrl
 * @param {string} o.jeton
 * @param {number|string} o.espaceId       où créer le document (ignoré à la reprise : le document existe)
 * @param {string} [o.nom]                 le nom du document
 * @param {Function} [o.fetchFn]
 * @param {number} [o.tailleLot]           lignes par appel (`LOT_LIGNES` par défaut)
 * @param {object} [o.journal]             un journal de reprise (`journalVide()` sinon)
 * @param {(j: object) => Promise<void>|void} [o.ecrireJournal]  appelé à chaque étape faite
 * @param {(e: {phase: string, fait: number, total: number, etape?: string}) => void} [o.onEtape]
 * @param {(o: {baseUrl:string, docId:string, jeton:string, fetch?:Function}) => Promise<object>} o.creerClient  un client REST
 * @returns {Promise<{ docId: string, journal: object }>}
 */
export async function envoyerScene({
  scene: sceneBrute, piecesJointes = async () => [], baseUrl, jeton, espaceId, nom, fetchFn,
  journal = journalVide(), ecrireJournal = () => {}, onEtape = () => {}, creerClient, delai, tailleLot = LOT_LIGNES,
}) {
  const scene = assurerReconnaissable(sceneBrute);
  const dire = (e) => { try { onEtape(e); } catch (_) { /* un affichage qui échoue n'arrête pas l'envoi */ } };
  const garder = async () => { await ecrireJournal(journal); };

  // 1. Le document. À la reprise, il existe : on ne le recrée jamais.
  if (!journal.docId) {
    dire({ phase: 'document', fait: 0, total: 1 });
    journal.nomDocument = nom || scene.nom;
    journal.espaceId = espaceId;
    journal.docId = await creerDocument({ baseUrl, jeton, espaceId, nom: journal.nomDocument, fetchFn, delai });
    await garder();
  }
  dire({ phase: 'document', fait: 1, total: 1 });
  const client = await creerClient({ baseUrl, docId: journal.docId, jeton, fetch: fetchFn });

  // 2. Les photos : versées d'abord, parce que les lignes y renvoient.
  const photos = await piecesJointes();
  let faites = 0;
  for (const p of photos) {
    dire({ phase: 'photos', fait: faites, total: photos.length });
    if (journal.photos[p.id] == null) {
      const rendu = await client.televerserPieceJointe(p.blob);
      const reel = Array.isArray(rendu) ? rendu[0] : rendu;
      if (!Number.isInteger(reel)) throw new Error(`Grist n’a pas rendu d’identifiant pour la photo ${p.nom || p.id}.`);
      journal.photos[p.id] = reel;
      await garder();
    }
    faites++;
  }
  if (photos.length) dire({ phase: 'photos', fait: photos.length, total: photos.length });

  // 3. Les tables : seulement celles qui manquent (une reprise ne recrée rien).
  dire({ phase: 'tables', fait: 0, total: Object.keys(scene.tables).length });
  const presentes = new Set(await client.listTables());
  const deja = [...new Set([...journal.tablesCreees, ...Object.keys(scene.tables).filter((n) => presentes.has(n))])];
  const actions = actionsTables(scene, { dejaCreees: deja });
  if (actions.length) {
    await client.applyUserActions(actions);
    journal.tablesCreees = Object.keys(scene.tables);
    await garder();
  }
  dire({ phase: 'tables', fait: Object.keys(scene.tables).length, total: Object.keys(scene.tables).length });

  // 4. Les données : table par table, lot par lot, en reprenant après ce qui est déjà arrivé.
  for (const [table, t] of Object.entries(scene.tables)) {
    if (!t.ids.length) continue;
    const depart = await compterLignes({ baseUrl, jeton, docId: journal.docId, table, fetchFn, delai });
    const lots = lotsDeLignes(scene, table, { pjMap: journal.photos, depart, taille: tailleLot });
    let fait = depart;
    dire({ phase: 'donnees', etape: table, fait, total: t.ids.length });
    for (const lot of lots) {
      await client.applyUserActions([lot]);
      fait += lot[2].length;
      dire({ phase: 'donnees', etape: table, fait, total: t.ids.length });
    }
  }

  journal.termine = true;
  await garder();
  return { docId: journal.docId, journal };
}

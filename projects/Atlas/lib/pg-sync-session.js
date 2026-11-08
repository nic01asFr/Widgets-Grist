/**
 * La synchronisation, côté lectures et écritures : lire les trois états, enregistrer une copie, appliquer un plan.
 *
 * Tout ce qui touche le monde est injecté : `docApi` (l'API de document de Grist) et les clients de la passerelle. Ce module se
 * teste donc avec de faux sites (`tests/pg-sync-session.test.js`) ; la décision, elle, est dans `pg-sync.js`.
 *
 * ## Ce qui est écrit, et où
 *  - **dans Grist** : la table de la copie (lignes tirées de PostgreSQL), et deux tables d'Atlas, `Atlas_PgSyncCopies` (la
 *    configuration de chaque copie) et `Atlas_PgSync` (ce qu'on avait vu à la dernière synchronisation) ;
 *  - **dans PostgreSQL** : uniquement par `pg_gateway_ecrire`, avec le jeton d'écriture de la personne, `atomique: false`
 *    (les opérations valides passent, les conflits sont rendus), chaque ligne avec la version que la comparaison a lue.
 *
 * Les jetons ne sont jamais ici : ce sont des clients déjà construits qui les portent, en mémoire de la page.
 *
 * Une liaison lue dans un document est une DONNÉE : `lireCopies` valide chaque configuration (champs texte, adresse https) avant
 * qu'on s'en serve, et rien n'est contacté avant qu'on demande « Comparer ».
 */

import {
  TABLE_SYNC, COLONNES_SYNC, cleCanon, cleDeLigneGrist, hachageGrist, valeursPourPg, calculerEcarts, planifier,
} from './pg-sync.js?v=20261109a';
import { convertir, centre } from './pg-import.js?v=20261109a';
import { adresseAdmisePg } from './pg-acces.js?v=20261109a';

export const TABLE_COPIES = 'Atlas_PgSyncCopies';
const COLONNES_COPIES = Object.freeze([
  Object.freeze({ id: 'table_grist', type: 'Text', label: 'table_grist' }),
  Object.freeze({ id: 'config', type: 'Text', label: 'config' }),
]);
export const LIMITE_LECTURE = 10000;
const ACTIONS_PAR_LOT = 200;

export class ErreurSync extends Error {
  constructor(message, code = 'sync') {
    super(message);
    this.name = 'ErreurSync';
    this.code = code;
  }
}

/** Les lignes d'une table lue par `fetchTable` (colonnes) en tableau d'objets, avec `id`. */
export function lignesDe(colonnes) {
  const ids = colonnes && colonnes.id ? colonnes.id : [];
  return ids.map((id, i) => {
    const l = { id };
    for (const k of Object.keys(colonnes)) if (k !== 'id') l[k] = colonnes[k][i];
    return l;
  });
}

async function garantirTables(docApi) {
  const presentes = await docApi.listTables();
  const actions = [];
  if (!presentes.includes(TABLE_SYNC)) actions.push(['AddTable', TABLE_SYNC, COLONNES_SYNC.map((c) => ({ ...c }))]);
  if (!presentes.includes(TABLE_COPIES)) actions.push(['AddTable', TABLE_COPIES, COLONNES_COPIES.map((c) => ({ ...c }))]);
  if (actions.length) await docApi.applyUserActions(actions);
}

async function appliquerParLots(docApi, actions) {
  for (let i = 0; i < actions.length; i += ACTIONS_PAR_LOT) await docApi.applyUserActions(actions.slice(i, i + ACTIONS_PAR_LOT));
}

const texte = (v) => typeof v === 'string' && v.trim() !== '';

/** Une configuration lue d'un document : refusée si elle n'a pas la forme d'une copie ou pointe vers une adresse non admise. */
export function configValide(c) {
  if (!c || typeof c !== 'object' || c.genre !== 'copie') return false;
  if (![c.url, c.connexion, c.schema, c.table, c.tableGrist].every(texte)) return false;
  if (adresseAdmisePg(c.url) !== null) return false;
  const col = (x) => x && texte(x.pg) && texte(x.grist) && texte(x.type);
  if (!Array.isArray(c.cles) || !c.cles.length || !c.cles.every(col)) return false;
  if (!Array.isArray(c.colonnes) || !c.colonnes.every(col)) return false;
  const g = c.geometrie;
  if (g && !(texte(g.pg) && (g.mode === 'point' ? texte(g.lat) && texte(g.lng) : g.mode === 'json' && texte(g.grist)))) return false;
  return typeof c.suppression === 'string';
}

/** Les copies synchronisables du document (rien n'est contacté). */
export async function lireCopies(docApi) {
  const tables = await docApi.listTables();
  if (!tables.includes(TABLE_COPIES)) return [];
  const sortie = [];
  for (const r of lignesDe(await docApi.fetchTable(TABLE_COPIES))) {
    let config = null;
    try { config = JSON.parse(r.config); } catch { /* ligne illisible : ignorée plus bas */ }
    if (!configValide(config) || !tables.includes(config.tableGrist)) continue;
    sortie.push({ rowId: r.id, tableGrist: config.tableGrist, config });
  }
  return sortie;
}

/**
 * Enregistre une copie qui vient d'être importée : sa configuration, et le « vu » de chaque ligne (version PostgreSQL lue à
 * l'import, hachage de la ligne telle que Grist la contient MAINTENANT).
 */
export async function enregistrerCopie({ docApi, copie, tableId }) {
  await garantirTables(docApi);
  const config = { ...copie.config, tableGrist: tableId };
  const versions = new Map(copie.versions.map((v) => [cleCanon(v.cle), v.version]));
  const actions = [['AddRecord', TABLE_COPIES, null, { table_grist: tableId, config: JSON.stringify(config) }]];
  const lignes = lignesDe(await docApi.fetchTable(tableId));
  const colonnes = { table_grist: [], cle_pg: [], ligne_grist: [], version_pg_vue: [], hachage_grist_vu: [] };
  for (const l of lignes) {
    const cle = cleDeLigneGrist(config, l);
    const version = cle && versions.get(cleCanon(cle));
    if (version === undefined || version === null) continue;
    colonnes.table_grist.push(tableId);
    colonnes.cle_pg.push(JSON.stringify(cle));
    colonnes.ligne_grist.push(l.id);
    colonnes.version_pg_vue.push(String(version));
    colonnes.hachage_grist_vu.push(hachageGrist(config, l));
  }
  if (colonnes.cle_pg.length) actions.push(['BulkAddRecord', TABLE_SYNC, new Array(colonnes.cle_pg.length).fill(null), colonnes]);
  await docApi.applyUserActions(actions);
  return { config, lignes: colonnes.cle_pg.length };
}

/** Oublier une copie : sa configuration et son « vu ». La table Grist, elle, n'est pas touchée. */
export async function detacherCopie({ docApi, copie }) {
  const actions = [['RemoveRecord', TABLE_COPIES, copie.rowId]];
  const tables = await docApi.listTables();
  if (tables.includes(TABLE_SYNC)) {
    const ids = lignesDe(await docApi.fetchTable(TABLE_SYNC)).filter((r) => r.table_grist === copie.tableGrist).map((r) => r.id);
    if (ids.length) actions.push(['BulkRemoveRecord', TABLE_SYNC, ids]);
  }
  await docApi.applyUserActions(actions);
}

/** Les trois états d'une copie. Lecture seule, des deux côtés. */
export async function lireEtats({ docApi, config, client }) {
  const grist = lignesDe(await docApi.fetchTable(config.tableGrist));
  const gristLignes = grist.map((l) => ({ ligne: l.id, cle: cleDeLigneGrist(config, l), hachage: hachageGrist(config, l), valeurs: l }));

  const tables = await docApi.listTables();
  const snapshots = [];
  const snapshotsParCle = new Map();
  if (tables.includes(TABLE_SYNC)) {
    for (const s of lignesDe(await docApi.fetchTable(TABLE_SYNC))) {
      if (s.table_grist !== config.tableGrist) continue;
      let cle = null;
      try { cle = JSON.parse(s.cle_pg); } catch { continue; }
      const snap = { rowId: s.id, cle, ligne: s.ligne_grist, version: s.version_pg_vue, hachage: s.hachage_grist_vu };
      snapshots.push(snap);
      snapshotsParCle.set(cleCanon(cle), snap);
    }
  }

  const lecture = await client.commande('pg_gateway_lire', { connexion: config.connexion, schema: config.schema, table: config.table, limite: LIMITE_LECTURE });
  if (lecture.tronque) {
    throw new ErreurSync(`La table PostgreSQL dépasse ${LIMITE_LECTURE} lignes : une comparaison complète est impossible.`, 'table_trop_grande');
  }
  const pgLignes = lecture.lignes.map((l) => ({ cle: l.cle, version: l.version, actif: l.actif, valeurs: l.valeurs }));
  return { gristLignes, pgLignes, snapshots, snapshotsParCle };
}

/** Lire puis comparer. Rien n'est écrit. */
export async function comparer({ docApi, config, client }) {
  const etats = await lireEtats({ docApi, config, client });
  const ecarts = calculerEcarts(config, etats);
  return { etats, ecarts };
}

/** La ligne PostgreSQL (clé, valeurs) vue comme les colonnes de la table Grist. */
export function valeursPgVersGrist(config, p) {
  const v = {};
  for (const c of config.cles) v[c.grist] = p.cle[c.pg];
  for (const c of config.colonnes) v[c.grist] = convertir(p.valeurs[c.pg] ?? null, c.type);
  const g = config.geometrie;
  if (g) {
    const geo = p.valeurs[g.pg] ?? null;
    if (g.mode === 'point') {
      const ok = geo && geo.type === 'Point' && Array.isArray(geo.coordinates);
      v[g.lat] = ok ? geo.coordinates[1] : null;
      v[g.lng] = ok ? geo.coordinates[0] : null;
    } else {
      v[g.grist] = geo ? JSON.stringify(geo) : null;
      const c = geo ? centre(geo) : null;
      v[g.lat] = c ? c.lat : null;
      v[g.lng] = c ? c.lon : null;
    }
  }
  return v;
}

function aleatoire() {
  const c = globalThis.crypto;
  return c && c.randomUUID ? c.randomUUID() : `sync-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Applique un plan (`planifier`). Chaque côté ne reçoit que ce qui le concerne ; ce qui échoue est rapporté, jamais avalé.
 *
 * @returns {Promise<{poussees:{ok:number,conflits:number,refus:number}, tirees:{inserees:number,modifiees:number,supprimees:number}, ignores:number, echecs:object[], interrompu:string|null}>}
 */
export async function appliquer({ docApi, config, clientEcriture, plan, etats, ecarts, lotMax = 500, idempotence = aleatoire }) {
  if (!plan.pret) throw new ErreurSync('Des conflits attendent un choix : rien n\'est appliqué.', 'conflits_sans_choix');
  const rapport = { poussees: { ok: 0, conflits: 0, refus: 0 }, tirees: { inserees: 0, modifiees: 0, supprimees: 0 }, ignores: plan.ignores.length, echecs: [], interrompu: null };
  const ligneParId = new Map(etats.gristLignes.map((g) => [g.ligne, g.valeurs]));
  const pgParCle = new Map(etats.pgLignes.map((p) => [cleCanon(p.cle), p]));
  const vus = new Map(); // cleCanon -> { cle, version } : ce qu'on enregistre comme « vu »
  const aOublier = new Set(ecarts.nettoyage);
  const clesAReporter = []; // clés générées par PostgreSQL, à écrire dans les lignes Grist nouvelles

  // --- 1. Grist -> PostgreSQL
  const construire = (item) => {
    const valeurs = item.ligne != null ? valeursPourPg(config, ligneParId.get(item.ligne) || {}) : {};
    if (item.action === 'inserer') return { op: 'inserer', ...(item.cle ? { cle: item.cle } : {}), valeurs };
    if (item.action === 'modifier') return { op: 'modifier', cle: item.cle, valeurs, version_attendue: item.version_attendue };
    if (item.action === 'reactiver_puis_modifier') return { op: 'reactiver', cle: item.cle, version_attendue: item.version_attendue };
    return { op: item.action, cle: item.cle, version_attendue: item.version_attendue }; // desactiver, supprimer
  };
  const envoyer = async (entrees) => {
    const sorties = [];
    for (let i = 0; i < entrees.length; i += lotMax) {
      const lot = entrees.slice(i, i + lotMax);
      let reponse;
      try {
        reponse = await clientEcriture.commande('pg_gateway_ecrire', {
          connexion: config.connexion, schema: config.schema, table: config.table,
          operations: lot.map((e) => e.op), atomique: false, cle_idempotence: idempotence(),
        });
      } catch (e) {
        rapport.interrompu = (e && e.message) || String(e);
        return sorties;
      }
      lot.forEach((e, j) => sorties.push({ entree: e, res: reponse.resultats[j] }));
    }
    return sorties;
  };
  const traiter = (entree, res) => {
    const { item } = entree;
    if (res && res.statut === 'ok') {
      rapport.poussees.ok++;
      if (item.action === 'desactiver' || item.action === 'supprimer') { aOublier.add(item.cleCanon); return true; }
      vus.set(cleCanon(res.cle), { cle: res.cle, version: res.version });
      if (item.action === 'inserer' && !item.cle) clesAReporter.push({ ligne: item.ligne, cle: res.cle });
      return true;
    }
    if (res && res.statut === 'conflit') rapport.poussees.conflits++; else rapport.poussees.refus++;
    rapport.echecs.push({ sens: 'pousser', action: item.action, cle: item.cle, ligne: item.ligne, statut: res ? res.statut : 'inconnu', code: res && res.code, message: res && res.message });
    return false;
  };

  const premiers = plan.push.map((item) => ({ item, op: construire(item) }));
  const sorties = await envoyer(premiers);
  const secondes = [];
  for (const { entree, res } of sorties) {
    if (entree.item.action === 'reactiver_puis_modifier') {
      if (res && res.statut === 'ok') {
        secondes.push({ item: entree.item, op: { op: 'modifier', cle: entree.item.cle, valeurs: valeursPourPg(config, ligneParId.get(entree.item.ligne) || {}), version_attendue: res.version } });
      } else traiter(entree, res);
    } else traiter(entree, res);
  }
  if (secondes.length && !rapport.interrompu) for (const { entree, res } of await envoyer(secondes)) traiter(entree, res);

  // --- 2. PostgreSQL -> Grist
  const actions = [];
  for (const item of plan.pull) {
    const p = pgParCle.get(item.cleCanon);
    if (item.action === 'supprimer') { actions.push(['RemoveRecord', config.tableGrist, item.ligne]); aOublier.add(item.cleCanon); rapport.tirees.supprimees++; continue; }
    if (!p) { rapport.echecs.push({ sens: 'tirer', action: item.action, cle: item.cle, statut: 'introuvable', message: 'La ligne PostgreSQL a disparu depuis la comparaison.' }); continue; }
    const valeurs = valeursPgVersGrist(config, p);
    if (item.action === 'inserer') { actions.push(['AddRecord', config.tableGrist, null, valeurs]); rapport.tirees.inserees++; } else { actions.push(['UpdateRecord', config.tableGrist, item.ligne, valeurs]); rapport.tirees.modifiees++; }
    vus.set(item.cleCanon, { cle: p.cle, version: p.version });
  }
  for (const { ligne, cle } of clesAReporter) {
    const maj = {};
    for (const c of config.cles) maj[c.grist] = cle[c.pg];
    actions.push(['UpdateRecord', config.tableGrist, ligne, maj]);
  }
  if (actions.length) await appliquerParLots(docApi, actions);

  // --- 3. le « vu » : on relit Grist tel qu'il est maintenant, c'est ce hachage que la prochaine comparaison comparera
  const apres = lignesDe(await docApi.fetchTable(config.tableGrist));
  const parCle = new Map();
  for (const l of apres) { const c = cleDeLigneGrist(config, l); if (c) parCle.set(cleCanon(c), l); }
  const memoire = [];
  for (const [k, v] of vus) {
    const l = parCle.get(k);
    if (!l) continue;
    const existant = etats.snapshotsParCle.get(k);
    const valeurs = { table_grist: config.tableGrist, cle_pg: JSON.stringify(v.cle), ligne_grist: l.id, version_pg_vue: String(v.version), hachage_grist_vu: hachageGrist(config, l) };
    memoire.push(existant ? ['UpdateRecord', TABLE_SYNC, existant.rowId, valeurs] : ['AddRecord', TABLE_SYNC, null, valeurs]);
    aOublier.delete(k);
  }
  for (const k of aOublier) {
    const s = etats.snapshotsParCle.get(k);
    if (s) memoire.push(['RemoveRecord', TABLE_SYNC, s.rowId]);
  }
  if (memoire.length) await appliquerParLots(docApi, memoire);
  return rapport;
}

/**
 * Simuler la poussée vers PostgreSQL : MÊMES opérations, MÊMES contrôles (versions, contraintes), puis la passerelle annule
 * tout (`mode: "simuler"`). Rien n'est conservé, ni dans PostgreSQL, ni dans le journal, ni dans Grist.
 *
 * @returns {Promise<{ok:number, conflits:number, refus:number, echecs:object[], interrompu:string|null}>}
 */
export async function simulerPoussee({ config, clientEcriture, plan, etats, lotMax = 500 }) {
  const ligneParId = new Map(etats.gristLignes.map((g) => [g.ligne, g.valeurs]));
  const sortie = { ok: 0, conflits: 0, refus: 0, echecs: [], interrompu: null };
  const entrees = plan.push.map((item) => {
    const valeurs = item.ligne != null ? valeursPourPg(config, ligneParId.get(item.ligne) || {}) : {};
    if (item.action === 'inserer') return { item, op: { op: 'inserer', ...(item.cle ? { cle: item.cle } : {}), valeurs } };
    if (item.action === 'modifier') return { item, op: { op: 'modifier', cle: item.cle, valeurs, version_attendue: item.version_attendue } };
    if (item.action === 'reactiver_puis_modifier') return { item, op: { op: 'reactiver', cle: item.cle, version_attendue: item.version_attendue } };
    return { item, op: { op: item.action, cle: item.cle, version_attendue: item.version_attendue } };
  });
  for (let i = 0; i < entrees.length; i += lotMax) {
    const lot = entrees.slice(i, i + lotMax);
    let reponse;
    try {
      reponse = await clientEcriture.commande('pg_gateway_ecrire', {
        connexion: config.connexion, schema: config.schema, table: config.table,
        operations: lot.map((e) => e.op), atomique: false, mode: 'simuler',
      });
    } catch (e) {
      sortie.interrompu = (e && e.message) || String(e);
      break;
    }
    lot.forEach((e, j) => {
      const res = reponse.resultats[j];
      if (res && res.statut === 'ok') sortie.ok++;
      else {
        if (res && res.statut === 'conflit') sortie.conflits++; else sortie.refus++;
        sortie.echecs.push({ action: e.item.action, cle: e.item.cle, statut: res ? res.statut : 'inconnu', code: res && res.code, message: res && res.message });
      }
    });
  }
  return sortie;
}

export { planifier };

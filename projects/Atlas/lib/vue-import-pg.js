/**
 * Le panneau « Import PostgreSQL » : choisir une table de la passerelle, voir ce que la zone visible en contient, l'importer
 * dans une table Grist (que l'onglet Couches affiche aussitôt).
 *
 * CHARGÉ À LA DEMANDE (`import()` dynamique, au clic sur le bouton « PG ») : tant que personne ne l'ouvre, il ne coûte rien.
 * Il ne décide de rien d'autre que ce qu'il montre : le réseau est dans `pg-passerelle.js`, le plan d'import dans
 * `pg-import.js`, l'écriture dans Grist est faite par l'application (`hote.importer`), qui est la seule à toucher au document.
 *
 * Le jeton de la passerelle est demandé ICI, dans une boîte à part, et gardé en mémoire de la page (`pg-acces.js`) : il n'est
 * ni dans le stockage du navigateur ni dans le document. Seule l'ADRESSE de la passerelle est mémorisée (`localStorage`, avec
 * repli silencieux si le navigateur le refuse).
 *
 * Les fonctions `html*` sont pures : elles rendent du texte HTML à partir d'un état, et échappent tout ce qui vient des données.
 *
 * L'import « en direct » (couche relue à chaque déplacement de la vue) n'est pas dans cette première version.
 */

import { echapper } from './html.js?v=20261010a';
import { mettreAPlat } from './vue-import.js?v=20260911a';
import { creerAccesPg } from './pg-acces.js?v=20261108a';
import { creerClientPg, bboxDepuisBornes, texteErreur } from './pg-passerelle.js?v=20261108a';
import { planImportPg } from './pg-import.js?v=20261108a';

const CLE_URL = 'atlas.pg.url';
const nombre = (n) => Number(n).toLocaleString('fr-FR').replace(/ | /g, ' ');

/** Les tables géographiques d'abord : c'est ce qu'on vient chercher. */
export function listerTables(schema, filtre = '') {
  const f = String(filtre || '').trim().toLowerCase();
  const sortie = [];
  for (const sc of (schema && schema.schemas) || []) {
    for (const t of sc.tables) {
      if (f && !`${sc.nom}.${t.nom}`.toLowerCase().includes(f)) continue;
      sortie.push({ schema: sc.nom, table: t.nom, geo: (t.geometries || []).length > 0, lignes: t.lignes_estimees, commentaire: t.commentaire });
    }
  }
  return sortie.sort((a, b) => (b.geo - a.geo) || `${a.schema}.${a.table}`.localeCompare(`${b.schema}.${b.table}`));
}

/** La liste des tables, en boutons (le clavier y accède). */
export function htmlTables(tables, choisie) {
  if (!tables.length) return '<div class="hint">Aucune table à afficher.</div>';
  return `<div class="model-grid pg-tables">${tables.map((t) => {
    const actif = choisie && choisie.schema === t.schema && choisie.table === t.table;
    const titre = [t.geo ? 'géographique' : 'sans géométrie', t.lignes != null ? `~${nombre(t.lignes)} lignes` : null, t.commentaire].filter(Boolean).join(' — ');
    return `<button type="button" class="model-card${actif ? ' active' : ''}" data-table="${echapper(t.schema)}.${echapper(t.table)}"
      aria-pressed="${actif ? 'true' : 'false'}" title="${echapper(titre)}" ${t.geo ? '' : 'disabled'}>
      <div class="mn">${echapper(t.table)}</div><div class="range-info">${echapper(t.schema)}${t.geo ? '' : ' · sans géométrie'}</div></button>`;
  }).join('')}</div>`;
}

/** Le bas du panneau : l'état de l'aperçu, ses avertissements, le bouton d'import. */
export function htmlApercu(etat) {
  if (!etat.table) return '<div class="hint">Choisissez une table géographique : la zone visible de la carte sera lue.</div>';
  const t = `<strong>${echapper(etat.table.schema)}.${echapper(etat.table.table)}</strong>`;
  if (etat.phase === 'lecture') return `<div class="range-info" role="status" aria-live="polite">${t} : lecture de la zone visible…</div>`;
  if (etat.phase === 'erreur') {
    return `<div class="ign-alerte ign-refus" role="alert">${echapper(etat.erreur)}</div>
      <button type="button" class="btn btn-soft btn-full" data-act="relire">Réessayer</button>`;
  }
  if (etat.phase === 'import') return `<div class="range-info" role="status" aria-live="polite">${t} : import en cours… ${echapper(etat.avancement || '')}</div>`;
  if (etat.phase === 'termine') {
    return `<div class="range-info" role="status"><strong>${nombre(etat.resultat.nb)} entité${etat.resultat.nb > 1 ? 's' : ''} importée${etat.resultat.nb > 1 ? 's' : ''}</strong>
      dans la table « ${echapper(etat.resultat.tableId)} ».</div>`;
  }
  const c = etat.couche;
  const n = c ? c.nb_entites : 0;
  const avert = [...((c && c.avertissements) || [])].map((a) => `<div class="ign-alerte" role="alert">${echapper(a)}</div>`).join('');
  const plan = etat.plan;
  const refus = plan && !plan.ok ? `<div class="ign-alerte ign-refus" role="alert">${echapper(plan.erreur)}</div>` : '';
  const bloque = !plan || !plan.ok || etat.lectureSeule;
  const lecture = etat.lectureSeule
    ? '<div class="ign-alerte" role="alert">Ce document est ouvert en lecture seule : l’import dans Grist est désactivé.</div>' : '';
  return `<div class="range-info" role="status" aria-live="polite">${t} : <strong>${nombre(n)}</strong> entité${n > 1 ? 's' : ''} dans la zone visible.</div>
    ${avert}${refus}${lecture}
    <label class="range-info" for="pg-nom">Nom de la couche</label>
    <input id="pg-nom" type="text" value="${echapper(etat.nom || '')}" style="width:100%;margin-bottom:8px">
    <button type="button" class="btn btn-primary btn-full" data-act="importer" ${bloque ? 'disabled' : ''}>Importer dans Grist</button>`;
}

/** La boîte de saisie du jeton, rendue dans `document`. Rend le jeton, ou null si annulée. */
export function demanderJeton(doc, { origine, refuse }) {
  return new Promise((resolve) => {
    const fond = doc.createElement('div');
    fond.setAttribute('role', 'dialog');
    fond.setAttribute('aria-modal', 'true');
    fond.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)';
    const boite = doc.createElement('div');
    boite.style.cssText = 'background:var(--bg,#fff);color:var(--text,#222);padding:16px;border-radius:8px;max-width:340px;width:90%';
    const titre = doc.createElement('strong'); titre.textContent = 'Passerelle PostgreSQL';
    const texte = doc.createElement('div');
    texte.textContent = (refuse ? 'Jeton refusé. ' : '') + `La passerelle ${origine} demande un jeton.`;
    const champ = doc.createElement('input'); champ.type = 'password'; champ.autocomplete = 'off'; champ.style.cssText = 'width:100%;margin:8px 0';
    champ.setAttribute('aria-label', 'Jeton de la passerelle');
    const note = doc.createElement('div'); note.textContent = 'Gardé dans cette page seulement, jamais enregistré.'; note.style.cssText = 'font-size:11.5px;opacity:.7;margin-bottom:8px';
    const barre = doc.createElement('div'); barre.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
    const annuler = doc.createElement('button'); annuler.type = 'button'; annuler.className = 'btn btn-soft'; annuler.textContent = 'Annuler';
    const valider = doc.createElement('button'); valider.type = 'button'; valider.className = 'btn'; valider.textContent = 'Valider';
    barre.append(annuler, valider);
    boite.append(titre, texte, champ, note, barre);
    fond.append(boite);
    const fermer = (v) => { doc.removeEventListener('keydown', touche, true); fond.remove(); resolve(v); };
    const touche = (e) => { if (e.key === 'Escape') { e.preventDefault(); fermer(null); } };
    doc.addEventListener('keydown', touche, true);
    annuler.addEventListener('click', () => fermer(null));
    const envoyer = () => { if (champ.value.trim()) fermer(champ.value); else champ.focus(); };
    valider.addEventListener('click', envoyer);
    champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); envoyer(); } });
    doc.body.append(fond);
    champ.focus();
  });
}

function lireUrl() { try { return globalThis.localStorage.getItem(CLE_URL) || ''; } catch { return ''; } }
function ecrireUrl(u) { try { globalThis.localStorage.setItem(CLE_URL, u); } catch { /* navigation privée : on ne retient pas */ } }

let nettoyageCourant = null;
// Le jeton survit à la fermeture du panneau, pas à celle de la page.
let accesPartage = null;

/**
 * @param {object} hote
 * @param {object} hote.carte  la carte MapLibre
 * @param {HTMLElement} hote.corps  le corps du module
 * @param {(titre:string, sous:string)=>void} hote.titre
 * @param {(texte:string, genre:string)=>void} hote.annoncer
 * @param {()=>void} hote.retour
 * @param {()=>boolean} hote.lectureSeule  le document est-il en lecture seule ?
 * @param {()=>Promise<string[]>} hote.tables  les tables du document
 * @param {(plan:object)=>Promise<{nb:number, tableId:string}>} hote.importer  crée la table, écrit les lots, monte la couche
 */
export async function ouvrirImportPg(hote) {
  if (nettoyageCourant) nettoyageCourant();
  const doc = hote.corps.ownerDocument;
  if (!accesPartage) accesPartage = creerAccesPg({ demander: (q) => demanderJeton(doc, q) });
  const acces = accesPartage;

  const etat = { url: lireUrl(), connexions: [], connexion: '', schema: null, filtre: '', table: null, couche: null, plan: null, nom: '', phase: 'repos', erreur: '', lectureSeule: !!hote.lectureSeule() };
  let client = null;
  let racine = null;
  const vivant = () => !!racine && racine.isConnected && hote.corps.contains(racine);

  function monter() {
    hote.titre('Import PostgreSQL', 'Zone importée = emprise visible, vue à plat. Zoomez pour réduire.');
    hote.corps.innerHTML = `<div id="pg-racine">
      <div class="section"><label class="range-info" for="pg-url">Adresse de la passerelle</label>
        <input id="pg-url" type="url" value="${echapper(etat.url)}" placeholder="https://pg-gateway.exemple.fr" style="width:100%;margin-bottom:6px">
        <button type="button" class="btn btn-soft btn-full" data-act="connecter">Se connecter</button></div>
      <div id="pg-etat" class="range-info" role="status"></div>
      <div id="pg-liste"></div>
      <div id="pg-detail" aria-live="polite"></div>
      <div class="section"><button type="button" class="btn btn-soft btn-full" data-act="retour">← Retour</button></div>
    </div>`;
    racine = hote.corps.querySelector('#pg-racine');
    racine.addEventListener('click', surClic);
    racine.addEventListener('input', (e) => {
      if (e.target.id === 'pg-nom') { etat.nom = e.target.value; recalculerPlan(); majBouton(); }
      if (e.target.id === 'pg-filtre') { etat.filtre = e.target.value; dessinerListe(); }
    });
  }

  const dire = (t) => { const e = racine && racine.querySelector('#pg-etat'); if (e) e.textContent = t; };
  function dessinerListe() {
    const zone = racine && racine.querySelector('#pg-liste');
    if (!zone) return;
    const tables = listerTables(etat.schema, etat.filtre);
    zone.innerHTML = etat.schema
      ? `<div class="section"><select id="pg-connexion" aria-label="Connexion">${etat.connexions.map((c) => `<option value="${echapper(c.alias)}"${c.alias === etat.connexion ? ' selected' : ''}>${echapper(c.libelle || c.alias)}</option>`).join('')}</select>
        <input id="pg-filtre" type="search" value="${echapper(etat.filtre)}" placeholder="Filtrer les tables" aria-label="Filtrer les tables" style="width:100%;margin:6px 0">
        ${htmlTables(tables, etat.table)}</div>` : '';
    const sel = zone.querySelector('#pg-connexion');
    if (sel) sel.addEventListener('change', async (e) => { etat.connexion = e.target.value; etat.table = null; etat.couche = null; await chargerSchema(); });
  }
  function dessinerDetail() {
    const zone = racine && racine.querySelector('#pg-detail');
    if (zone) zone.innerHTML = htmlApercu(etat);
  }
  function majBouton() {
    const b = racine && racine.querySelector('[data-act="importer"]');
    if (b) b.disabled = !etat.plan || !etat.plan.ok || etat.lectureSeule;
  }
  function recalculerPlan() {
    etat.plan = etat.couche ? planImportPg({ couche: etat.couche, nom: etat.nom || (etat.table && etat.table.table) || '', tables: etat.tablesGrist || [] }) : null;
  }

  async function surErreur(e, phase = 'erreur') {
    etat.phase = phase;
    etat.erreur = texteErreur(e);
    if (vivant()) dessinerDetail();
  }

  async function connecter() {
    const saisie = racine.querySelector('#pg-url').value.trim();
    etat.url = saisie;
    ecrireUrl(saisie);
    client = creerClientPg({ url: saisie, acces });
    dire('Connexion…');
    try {
      const info = await client.connexions();
      etat.connexions = info.connexions;
      if (!info.connexions.length) { dire('Aucune connexion déclarée sur la passerelle.'); return; }
      etat.connexion = etat.connexion && info.connexions.some((c) => c.alias === etat.connexion) ? etat.connexion : info.connexions[0].alias;
      (info.avertissements || []).forEach((a) => hote.annoncer(a, 'warning'));
      await chargerSchema();
    } catch (e) { dire(`Non connecté : ${texteErreur(e)}`); }
  }

  async function chargerSchema() {
    dire(`Lecture du schéma de « ${etat.connexion} »…`);
    try {
      etat.schema = await client.schema(etat.connexion, true);
      dire(`${etat.schema.libelle} — ${etat.schema.nb_tables} table(s)${etat.schema.postgis ? ` — PostGIS ${etat.schema.postgis}` : ''}`);
      (etat.schema.avertissements || []).forEach((a) => hote.annoncer(a, 'warning'));
      dessinerListe();
      dessinerDetail();
    } catch (e) { dire(`Schéma illisible : ${texteErreur(e)}`); }
  }

  async function lire() {
    if (!etat.table) return;
    etat.phase = 'lecture';
    dessinerDetail();
    try {
      await mettreAPlat(hote.carte);
      etat.tablesGrist = await hote.tables();
      etat.couche = await client.couche({
        connexion: etat.connexion, schema: etat.table.schema, table: etat.table.table,
        bbox: bboxDepuisBornes(hote.carte.getBounds()),
      });
      etat.nom = etat.nom && etat.table ? etat.nom : etat.table.table;
      recalculerPlan();
      etat.phase = 'pret';
      if (vivant()) dessinerDetail();
    } catch (e) { await surErreur(e); }
  }

  async function importer() {
    if (!etat.plan || !etat.plan.ok || etat.lectureSeule) return;
    etat.phase = 'import';
    dessinerDetail();
    try {
      const r = await hote.importer(etat.plan);
      etat.resultat = r;
      etat.phase = 'termine';
      hote.annoncer(`${nombre(r.nb)} entités importées (PostgreSQL)`, 'success');
      if (vivant()) dessinerDetail();
    } catch (e) {
      // L'application a déjà dit ce qui existe et ce qui manque (table créée, lignes écrites) : on garde le détail visible.
      await surErreur(e);
      hote.annoncer(texteErreur(e), 'error');
    }
  }

  function surClic(e) {
    const bt = e.target.closest('[data-table]');
    if (bt && racine.contains(bt)) {
      const [schema, ...reste] = bt.dataset.table.split('.');
      etat.table = { schema, table: reste.join('.') };
      etat.nom = etat.table.table;
      dessinerListe();
      lire();
      return;
    }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;
    if (a === 'connecter') connecter();
    else if (a === 'relire') lire();
    else if (a === 'importer') importer();
    else if (a === 'retour') hote.retour();
  }

  monter();
  if (etat.url) connecter();
  nettoyageCourant = () => { racine = null; };
  return { etat, connecter, lire, importer };
}

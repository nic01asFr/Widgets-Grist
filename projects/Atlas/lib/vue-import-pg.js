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
 * L'import « en direct » (couche relue à chaque déplacement de la vue, `pg-direct.js`) est une couche de SESSION : rien n'est écrit
 * dans le document, elle disparaît au rechargement de la page.
 */

import { echapper } from './html.js?v=20261010a';
import { mettreAPlat } from './vue-import.js?v=20260911a';
import { creerAccesPg } from './pg-acces.js?v=20261109a';
import { creerClientPg, bboxDepuisBornes, texteErreur } from './pg-passerelle.js?v=20261109a';
import { planImportPg } from './pg-import.js?v=20261109a';
import { creerCoucheDirecte, libelleEtat } from './pg-direct.js?v=20261109a';
import { ouvrirEdition } from './vue-edition-pg.js?v=20261109d';
import { origineLisible } from './pg-liaisons.js?v=20261109a';
import { planCopie } from './pg-sync-copie.js?v=20261109a';
import { lireCopies, detacherCopie } from './pg-sync-session.js?v=20261109a';
import { htmlCopies, ouvrirSynchro } from './vue-sync-pg.js?v=20261109b';

const CLE_URL = 'atlas.pg.url';
const STYLE_ALERTE = 'margin:8px 0;padding:8px 10px;font-size:12.5px;line-height:1.4;border-left:3px solid #d9a21b;background:rgba(217,162,27,.12);border-radius:4px';
const STYLE_REFUS = 'margin:8px 0;padding:8px 10px;font-size:12.5px;line-height:1.4;border-left:3px solid #c0392b;background:rgba(192,57,43,.1);border-radius:4px';
const nombre = (n) => Number(n).toLocaleString('fr-FR').replace(/ | /g, ' ');

/** Les vues et tables que PostGIS publie lui-même : jamais ce qu'on vient chercher. */
const TABLES_SYSTEME = new Set(['geometry_columns', 'geography_columns', 'spatial_ref_sys', 'raster_columns', 'raster_overviews']);

/** Les tables géographiques d'abord : c'est ce qu'on vient chercher. */
export function listerTables(schema, filtre = '', modifiables = null) {
  const f = String(filtre || '').trim().toLowerCase();
  const sortie = [];
  for (const sc of (schema && schema.schemas) || []) {
    for (const t of sc.tables) {
      if (TABLES_SYSTEME.has(t.nom) && !(t.geometries || []).length) continue;
      if (f && !`${sc.nom}.${t.nom}`.toLowerCase().includes(f)) continue;
      sortie.push({ schema: sc.nom, table: t.nom, geo: (t.geometries || []).length > 0, modifiable: !!modifiables && modifiables.has(`${sc.nom}.${t.nom}`), lignes: t.lignes_estimees, commentaire: t.commentaire });
    }
  }
  return sortie.sort((a, b) => (b.geo - a.geo) || `${a.schema}.${a.table}`.localeCompare(`${b.schema}.${b.table}`));
}

/** La liste des tables, en boutons (le clavier y accède). */
export function htmlTables(tables, choisie) {
  if (!tables.length) return '<div class="hint">Aucune table à afficher.</div>';
  return `<div class="model-grid pg-tables" style="grid-template-columns:repeat(auto-fill,minmax(110px,1fr))">${tables.map((t) => {
    const actif = choisie && choisie.schema === t.schema && choisie.table === t.table;
    const titre = [t.geo ? 'géographique' : 'sans géométrie', t.modifiable ? 'modifiable' : null, t.lignes != null ? `~${nombre(t.lignes)} lignes` : null, t.commentaire].filter(Boolean).join(' — ');
    return `<button type="button" class="model-card${actif ? ' active' : ''}" data-table="${echapper(t.schema)}.${echapper(t.table)}"
      aria-pressed="${actif ? 'true' : 'false'}" title="${echapper(titre)}" ${t.geo || t.modifiable ? '' : 'disabled'}>
      <div class="mn">${echapper(t.table)}</div><div class="range-info">${echapper(t.schema)}${t.geo ? '' : ' · sans géométrie'}${t.modifiable ? ' · modifiable' : ''}</div></button>`;
  }).join('')}</div>`;
}

/** Le bas du panneau : l'état de l'aperçu, ses avertissements, le bouton d'import. */
export function htmlApercu(etat) {
  if (!etat.table) return '<div class="hint">Choisissez une table géographique : la zone visible de la carte sera lue.</div>';
  const t = `<strong>${echapper(etat.table.schema)}.${echapper(etat.table.table)}</strong>`;
  if (etat.phase === 'lecture') return `<div class="range-info" role="status" aria-live="polite">${t} : lecture de la zone visible…</div>`;
  if (etat.phase === 'erreur') {
    return `<div style="${STYLE_REFUS}" role="alert">${echapper(etat.erreur)}</div>
      <button type="button" class="btn btn-soft btn-full" data-act="relire">Réessayer</button>`;
  }
  if (etat.phase === 'import') return `<div class="range-info" role="status" aria-live="polite">${t} : import en cours… ${echapper(etat.avancement || '')}</div>`;
  if (etat.phase === 'termine') {
    return `<div class="range-info" role="status"><strong>${nombre(etat.resultat.nb)} entité${etat.resultat.nb > 1 ? 's' : ''} importée${etat.resultat.nb > 1 ? 's' : ''}</strong>
      dans la table « ${echapper(etat.resultat.tableId)} ».</div>`;
  }
  const syncBloc = etat.modifiable ? `<div class="section" style="margin-top:12px"><div class="range-info"><strong>Copie synchronisable</strong> : toute la table, que la passerelle déclare modifiable. Elle se compare ensuite avec PostgreSQL.</div>
    <button type="button" class="btn btn-soft btn-full" data-act="importer-sync" ${etat.lectureSeule || etat.sansDocument ? 'disabled' : ''}>Importer pour synchroniser</button></div>` : '';
  if (!etat.couche && etat.phase === 'pret') {
    const lecture0 = etat.lectureSeule ? `<div style="${STYLE_ALERTE}" role="alert">Ce document est ouvert en lecture seule : l’import dans Grist est désactivé.</div>` : '';
    return `<div class="range-info" role="status">${t} : table sans géométrie, elle ne se place pas sur la carte.</div>${lecture0}${syncBloc}`;
  }
  const c = etat.couche;
  const n = c ? c.nb_entites : 0;
  const sansDoublon = (a) => !(c && c.tronque && /^Résultat tronqué/.test(a));
  const avert = [...((c && c.avertissements) || [])].filter(sansDoublon).map((a) => `<div style="${STYLE_ALERTE}" role="alert">${echapper(a)}</div>`).join('');
  const plan = etat.plan;
  const refus = plan && !plan.ok ? `<div style="${STYLE_REFUS}" role="alert">${echapper(plan.erreur)}</div>` : '';
  const bloque = !plan || !plan.ok || etat.lectureSeule || etat.sansDocument;
  const lecture = etat.lectureSeule
    ? `<div style="${STYLE_ALERTE}" role="alert">Ce document est ouvert en lecture seule : l’import dans Grist est désactivé.</div>` : '';
  const horsDoc = etat.sansDocument
    ? `<div style="${STYLE_ALERTE}" role="alert">Atlas n’est pas ouvert dans un document Grist : aperçu seulement, l’import est désactivé.</div>` : '';
  return `<div class="range-info" role="status" aria-live="polite">${t} : <strong>${nombre(n)}</strong> entité${n > 1 ? 's' : ''} dans la zone visible.</div>
    ${avert}${refus}${lecture}${horsDoc}
    <label class="range-info" for="pg-nom">Nom de la couche</label>
    <input id="pg-nom" type="text" value="${echapper(etat.nom || '')}" style="width:100%;margin-bottom:8px">
    <button type="button" class="btn btn-primary btn-full" data-act="importer" ${bloque ? 'disabled' : ''}>Importer dans Grist</button>
    <button type="button" class="btn btn-soft btn-full" data-act="direct" style="margin-top:6px" title="La zone visible est relue à chaque déplacement de la carte ; rien n'est écrit dans le document.">Lier en direct (session)</button>
    ${etat.peutEnregistrer ? '<button type="button" class="btn btn-soft btn-full" data-act="direct-enregistre" style="margin-top:6px" title="Comme ci-dessus, et la liaison (adresse, table ; jamais le jeton) est enregistrée dans le document.">Lier et enregistrer dans le document</button>' : ''}
    ${syncBloc}`;
}

const COULEURS_DIRECT = ['#d62728', '#1f77b4', '#2ca02c', '#9467bd', '#ff7f0e', '#17becf'];

/**
 * Les couches en direct : celles de la session, et les liaisons enregistrées dans le document (actives ou « à activer »).
 * L'origine de la passerelle est toujours montrée : une liaison lue dans un document est une donnée, on ne l'active qu'en
 * sachant vers où le jeton partira.
 */
export function htmlDirectes(liste) {
  if (!liste.length) return '';
  const bouton = (attr, id, texte, aria, primaire) => `<button type="button" class="btn ${primaire ? '' : 'btn-soft'}" ${attr}="${echapper(id)}" aria-label="${echapper(aria)}">${texte}</button>`;
  return `<div class="section" style="margin-top:12px"><div class="range-info"><strong>Couches en direct</strong></div>${liste.map((d) => {
    const active = d.active !== false;
    const boutons = [
      active ? bouton('data-modifier', d.id, 'Modifier', `Modifier les entités de ${d.libelle} dans PostgreSQL`, false) : '',
      active ? bouton('data-retirer', d.id, 'Retirer', `Retirer ${d.libelle} de la carte`, false) : bouton('data-activer', d.id, 'Activer', `Activer ${d.libelle}`, true),
      d.enregistree ? bouton('data-supprimer', d.id, 'Supprimer', `Supprimer l’enregistrement de ${d.libelle}`, false) : '',
    ].join('');
    const portee = d.enregistree ? 'enregistrée dans le document' : 'cette session seulement';
    return `
    <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;margin:8px 0">
      <span style="font-size:12.5px"><span style="display:inline-block;width:10px;height:10px;background:${echapper(d.couleur || '#888')};border-radius:2px;margin-right:6px"></span>${echapper(d.libelle)}<br>
        <span class="range-info">${echapper(d.etat)} · ${echapper(portee)}${d.origine ? ` · ${echapper(d.origine)}` : ''}</span></span>
      <span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${boutons}</span>
    </div>`;
  }).join('')}</div>`;
}

/** La boîte de saisie du jeton, rendue dans `document`. Rend le jeton, ou null si annulée. */
export function demanderJeton(doc, { origine, refuse, ecriture = false }) {
  return new Promise((resolve) => {
    const fond = doc.createElement('div');
    fond.setAttribute('role', 'dialog');
    fond.setAttribute('aria-modal', 'true');
    fond.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)';
    const boite = doc.createElement('div');
    boite.style.cssText = 'background:var(--bg,#fff);color:var(--text,#222);padding:16px;border-radius:8px;max-width:340px;width:90%';
    const titre = doc.createElement('strong'); titre.textContent = ecriture ? 'Écriture dans PostgreSQL' : 'Passerelle PostgreSQL';
    const texte = doc.createElement('div');
    texte.textContent = (refuse ? 'Jeton refusé. ' : '') + (ecriture
      ? `La passerelle ${origine} demande votre jeton d’ÉCRITURE : celui qui vous identifie, c’est votre nom que le journal de la base inscrira.`
      : `La passerelle ${origine} demande un jeton.`);
    const champ = doc.createElement('input'); champ.type = 'password'; champ.autocomplete = 'off'; champ.style.cssText = 'width:100%;margin:8px 0';
    champ.setAttribute('aria-label', ecriture ? 'Jeton d’écriture' : 'Jeton de la passerelle');
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
// Les couches directes survivent à la fermeture du panneau (pas à celle de la page).
const directes = new Map(); // id -> { couche, couleur, libelle, etat }
// Le jeton survit à la fermeture du panneau, pas à celle de la page.
let accesPartage = null;
let accesEcriturePartage = null;

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
  if (!accesEcriturePartage) accesEcriturePartage = creerAccesPg({ demander: (q) => demanderJeton(doc, { ...q, ecriture: true }) });
  const acces = accesPartage;

  const etat = { url: lireUrl(), connexions: [], connexion: '', schema: null, filtre: '', table: null, couche: null, plan: null, nom: '', phase: 'repos', erreur: '', lectureSeule: !!hote.lectureSeule(), peutEnregistrer: false, modifiables: null, modifiable: null, copies: [] };
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
      <div id="pg-directes"></div>
      <div id="pg-copies"></div>
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
    const tables = listerTables(etat.schema, etat.filtre, etat.modifiables);
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
  function dessinerCopies() {
    const zone = racine && racine.querySelector('#pg-copies');
    if (zone) zone.innerHTML = htmlCopies(etat.copies);
  }
  async function chargerCopies() {
    // Rien n'est contacté : on lit seulement la configuration que le document garde (Atlas_PgSyncCopies).
    try { etat.copies = hote.docApi ? await lireCopies(hote.docApi()) : []; } catch { etat.copies = []; }
    dessinerCopies();
  }
  function ouvrirCopie(rowId) {
    const copie = etat.copies.find((c) => String(c.rowId) === String(rowId));
    if (!copie) return;
    ouvrirSynchro({
      hote, copie, accesEcriture: accesEcriturePartage, detacher: detacherCopie,
      // La lecture n'a besoin que du jeton de lecture, pour l'origine de CETTE copie (affichée dans la boîte de saisie).
      clientLecture: creerClientPg({ url: copie.config.url, acces }),
      retour: () => ouvrirImportPg(hote),
    });
  }
  function liste() {
    const items = [...directes.entries()].map(([id, d]) => ({ id, libelle: d.libelle, couleur: d.couleur, etat: d.etat, active: true, enregistree: d.gristId != null, origine: d.url ? origineLisible(d.url) : '' }));
    for (const l of (hote.liaisons ? hote.liaisons() : [])) {
      if ([...directes.values()].some((d) => d.gristId === l.gristId)) continue;
      items.push({ id: `liaison-${l.gristId}`, libelle: `${l.schema}.${l.table}`, couleur: l.color || '#d62728', etat: 'à activer', active: false, enregistree: true, origine: origineLisible(l.url) });
    }
    return items;
  }
  function dessinerDirectes() {
    const zone = racine && racine.querySelector('#pg-directes');
    if (zone) zone.innerHTML = htmlDirectes(liste());
  }
  function demarrerDirecte({ clientDirect, url, connexion, schema, table, couleur, gristId = null }) {
    const id = `${connexion}-${schema}-${table}`.replace(/[^A-Za-z0-9_-]/g, '_');
    if (directes.has(id)) { hote.annoncer('Cette table est déjà liée en direct.', 'warning'); return null; }
    const entree = { couleur, url, gristId, client: clientDirect, libelle: `${schema}.${table}`, etat: 'lecture de la zone visible…', couche: null };
    entree.couche = creerCoucheDirecte({
      carte: hote.carte, client: clientDirect, id, couleur, params: { connexion, schema, table },
      surEtat: (e) => { entree.etat = libelleEtat(e); if (e.phase === 'ok' && e.tronque) hote.annoncer(`${entree.libelle} : résultat tronqué, zoomez.`, 'warning'); dessinerDirectes(); },
    });
    directes.set(id, entree);
    dessinerDirectes();
    entree.couche.demarrer();
    return { id, entree };
  }
  async function lier({ enregistrer = false } = {}) {
    if (!etat.table || !client) return;
    const couleur = COULEURS_DIRECT[directes.size % COULEURS_DIRECT.length];
    const lancee = demarrerDirecte({ clientDirect: client, url: etat.url, connexion: etat.connexion, schema: etat.table.schema, table: etat.table.table, couleur });
    if (!lancee || !enregistrer) return;
    try {
      lancee.entree.gristId = await hote.enregistrerLiaison({
        url: etat.url, connexion: etat.connexion, schema: etat.table.schema, table: etat.table.table, couleur, libelle: lancee.entree.libelle,
      });
      hote.annoncer(`Liaison « ${lancee.entree.libelle} » enregistrée dans le document (sans le jeton).`, 'success');
    } catch (e) {
      // La couche reste affichée pour la session : on dit que l'enregistrement, lui, a échoué.
      hote.annoncer(`Liaison non enregistrée : ${(e && e.message) || e}`, 'error');
    }
    dessinerDirectes();
  }
  function activer(idListe) {
    const l = (hote.liaisons ? hote.liaisons() : []).find((x) => `liaison-${x.gristId}` === idListe);
    if (!l) return;
    // Le jeton n'est demandé qu'ici, pour l'origine de CETTE liaison, qui est affichée dans la boîte de saisie.
    demarrerDirecte({
      clientDirect: creerClientPg({ url: l.url, acces }), url: l.url, connexion: l.connexion, schema: l.schema, table: l.table,
      couleur: l.color || COULEURS_DIRECT[0], gristId: l.gristId,
    });
  }
  // « Modifier » : la table doit être DÉCLARÉE modifiable par la passerelle ; sinon on le dit, on n'ouvre rien.
  async function modifierDirecte(id) {
    const d = directes.get(id);
    if (!d) return;
    const p = d.couche.params;
    try {
      const m = await d.client.commande('pg_gateway_tables_modifiables', { connexion: p.connexion });
      const decl = (m.tables || []).find((t) => t.schema === p.schema && t.table === p.table);
      if (!decl) { hote.annoncer(`« ${d.libelle} » n’est pas déclarée modifiable par la passerelle : elle reste en lecture seule.`, 'warning'); return; }
      const meta = await d.client.commande('pg_gateway_table', { connexion: p.connexion, schema: p.schema, table: p.table });
      const colGeo = (meta.colonnes || []).find((c) => c.nom === decl.geometrie);
      const brut = colGeo && colGeo.geometrie && colGeo.geometrie.type ? String(colGeo.geometrie.type) : '';
      const typeGeometrie = /^point$/i.test(brut) ? 'Point' : (brut ? 'Autre' : null);
      ouvrirEdition({
        hote, entree: { couche: d.couche, libelle: d.libelle, url: d.url, params: p }, decl, meta,
        clientLecture: d.client, accesEcriture: accesEcriturePartage, typeGeometrie, retour: () => ouvrirImportPg(hote),
      });
    } catch (e) {
      hote.annoncer(`Modification indisponible : ${texteErreur(e)}`, 'error');
    }
  }
  function retirer(id) {
    const d = directes.get(id);
    if (!d) return;
    d.couche.arreter();
    directes.delete(id);
    dessinerDirectes(); // une liaison enregistrée reste dans la liste, « à activer »
  }
  async function supprimer(idListe) {
    const d = directes.get(idListe);
    const gristId = d ? d.gristId : Number(String(idListe).replace('liaison-', ''));
    const libelle = d ? d.libelle : ((hote.liaisons ? hote.liaisons() : []).find((x) => x.gristId === gristId) || {}).table;
    if (!Number.isFinite(gristId) || !hote.supprimerLiaison) return;
    if (!window.confirm(`Supprimer la liaison « ${libelle || gristId} » du document ?\n\nLa table PostgreSQL n'est pas touchée.`)) return;
    try {
      await hote.supprimerLiaison(gristId);
      if (d) { d.couche.arreter(); directes.delete(idListe); }
      hote.annoncer('Liaison supprimée du document.', 'success');
    } catch (e) {
      hote.annoncer(`Suppression impossible : ${(e && e.message) || e}`, 'error');
    }
    dessinerDirectes();
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
      etat.limiteMax = Number.isInteger(info.limite_max) && info.limite_max > 0 ? info.limite_max : null;
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
      try {
        const m = await client.commande('pg_gateway_tables_modifiables', { connexion: etat.connexion });
        etat.modifiables = new Map(m.tables.map((t) => [`${t.schema}.${t.table}`, t]));
      } catch { etat.modifiables = null; } // écriture non configurée sur cette connexion : pas de copie synchronisable
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
      try {
        etat.tablesGrist = await hote.tables();
        etat.sansDocument = false;
      } catch {
        // Hors d'un document Grist : l'aperçu reste possible, l'import non (il écrit dans le document).
        etat.tablesGrist = [];
        etat.sansDocument = true;
      }
      etat.couche = await client.couche({
        connexion: etat.connexion, schema: etat.table.schema, table: etat.table.table,
        bbox: bboxDepuisBornes(hote.carte.getBounds()),
        ...(etat.limiteMax ? { limite: etat.limiteMax } : {}),
      });
      etat.nom = etat.nom && etat.table ? etat.nom : etat.table.table;
      recalculerPlan();
      etat.peutEnregistrer = !etat.lectureSeule && !etat.sansDocument && typeof hote.enregistrerLiaison === 'function';
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

  async function importerSync() {
    if (!etat.table || !etat.modifiable || etat.lectureSeule || etat.sansDocument || !hote.importerCopie) return;
    etat.phase = 'import';
    etat.avancement = 'lecture de la table entière…';
    dessinerDetail();
    try {
      const t = etat.table;
      const cible = { connexion: etat.connexion, schema: t.schema, table: t.table };
      const lecture = await client.commande('pg_gateway_lire', { ...cible, limite: etat.limiteMax || 10000 });
      const meta = await client.commande('pg_gateway_table', cible);
      const plan = planCopie({ lecture, table: meta, decl: etat.modifiable, url: etat.url, connexion: etat.connexion, nom: etat.nom || t.table, tables: await hote.tables() });
      if (!plan.ok) throw new Error(plan.erreur);
      etat.avancement = `${nombre(plan.nbLignes)} lignes…`;
      dessinerDetail();
      const r = await hote.importerCopie(plan);
      etat.resultat = r;
      etat.phase = 'termine';
      hote.annoncer(`${nombre(r.nb)} lignes copiées : la synchronisation est possible depuis « Copies synchronisables ».`, 'success');
      await chargerCopies();
      if (vivant()) dessinerDetail();
    } catch (e) {
      await surErreur(e);
      hote.annoncer(texteErreur(e), 'error');
    }
  }

  function surClic(e) {
    const sy = e.target.closest('[data-sync]');
    if (sy && racine.contains(sy)) { ouvrirCopie(sy.dataset.sync); return; }
    const bt = e.target.closest('[data-table]');
    if (bt && racine.contains(bt)) {
      const [schema, ...reste] = bt.dataset.table.split('.');
      etat.table = { schema, table: reste.join('.') };
      etat.nom = etat.table.table;
      etat.modifiable = etat.modifiables ? (etat.modifiables.get(`${schema}.${etat.table.table}`) || null) : null;
      const info = listerTables(etat.schema, '', etat.modifiables).find((t) => t.schema === schema && t.table === etat.table.table);
      dessinerListe();
      if (info && !info.geo) { etat.couche = null; etat.plan = null; etat.phase = 'pret'; dessinerDetail(); return; }
      lire();
      return;
    }
    const mod = e.target.closest('[data-modifier]');
    if (mod && racine.contains(mod)) { modifierDirecte(mod.dataset.modifier); return; }
    const ret = e.target.closest('[data-retirer]');
    if (ret && racine.contains(ret)) { retirer(ret.dataset.retirer); return; }
    const act2 = e.target.closest('[data-activer]');
    if (act2 && racine.contains(act2)) { activer(act2.dataset.activer); return; }
    const sup = e.target.closest('[data-supprimer]');
    if (sup && racine.contains(sup)) { supprimer(sup.dataset.supprimer); return; }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;
    if (a === 'connecter') connecter();
    else if (a === 'relire') lire();
    else if (a === 'importer') importer();
    else if (a === 'importer-sync') importerSync();
    else if (a === 'direct') lier();
    else if (a === 'direct-enregistre') lier({ enregistrer: true });
    else if (a === 'retour') hote.retour();
  }

  monter();
  dessinerDirectes();
  chargerCopies();
  // Connexion À LA DEMANDE : ouvrir le panneau ne contacte pas la passerelle (et ne demande donc pas le jeton). On peut ainsi
  // activer, retirer ou supprimer une liaison enregistrée sans se connecter.
  dire(etat.url ? 'Cliquez sur « Se connecter » pour lire le catalogue de la passerelle.' : '');
  nettoyageCourant = () => { racine = null; };
  return { etat, connecter, lire, importer };
}

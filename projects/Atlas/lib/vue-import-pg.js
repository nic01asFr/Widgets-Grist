/**
 * Le panneau « Base PostgreSQL » : se connecter à une passerelle, poser ses tables sur la carte (en direct), les copier dans une
 * table Grist (que l'onglet Couches affiche aussitôt) ou les synchroniser.
 *
 * CHARGÉ À LA DEMANDE (`import()` dynamique, au clic sur le bouton « PG ») : tant que personne ne l'ouvre, il ne coûte rien.
 * Il ne décide de rien d'autre que ce qu'il montre : le réseau est dans `pg-passerelle.js`, le plan d'import dans
 * `pg-import.js`, l'écriture dans Grist est faite par l'application (`hote.importer`), qui est la seule à toucher au document.
 *
 * Le jeton de la passerelle est demandé ICI, dans une boîte à part, et gardé en mémoire de la page (`pg-acces.js`) : il n'est
 * ni dans le stockage du navigateur ni dans le document. Seule l'ADRESSE de la passerelle est mémorisée (`localStorage`, avec
 * repli silencieux si le navigateur le refuse).
 *
 * Si la passerelle annonce l'identité Grist (`GET /v1/identite`), aucun jeton n'est saisi : le widget présente le jeton d'accès que
 * Grist lui donne (`pg-acces-grist.js`), après une confirmation par passerelle et par ouverture de la page. Le choix se fait au
 * premier refus (401) d'une passerelle ; une passerelle sans ce mode garde la boîte de saisie.
 *
 * Les fonctions `html*` sont pures : elles rendent du texte HTML à partir d'un état, et échappent tout ce qui vient des données.
 *
 * L'import « en direct » (couche relue à chaque déplacement de la vue, `pg-direct.js`) est une couche de SESSION : rien n'est écrit
 * dans le document, elle disparaît au rechargement de la page.
 */

import { echapper } from './html.js?v=20261010a';
import { mettreAPlat } from './vue-import.js?v=20260911a';
import { creerAccesPg } from './pg-acces.js?v=20261109a';
import { creerAccesGrist, creerAccesAuto, memoriserConfirmation } from './pg-acces-grist.js?v=20261122b';
import { bboxDepuisBornes, texteErreur } from './pg-passerelle.js?v=20261122b';
import { creerClientAuto, typeGristDe } from './pg-postgrest.js?v=20261128b';
import { lireAdresseDocument, demarrage, adresseAEnregistrer } from './pg-adresse.js?v=20261128a';
import { lireCouches, repartir, listeAEnregistrer } from './pg-memoire-couches.js?v=20261128a';
import { planImportPg } from './pg-import.js?v=20261109a';
import { creerCoucheDirecte, libelleEtat, empriseEntites } from './pg-direct.js?v=20261128c';
import { creerCoucheTuiles, modeDe } from './pg-tuiles.js?v=20261128c';
import { cleApparence, typeDepuisCatalogue, champsDepuisColonnes } from './pg-couche-atlas.js?v=20261128b';
import { ouvrirEdition } from './vue-edition-pg.js?v=20261122b';
import { origineLisible } from './pg-liaisons.js?v=20261109a';
import { planCopie } from './pg-sync-copie.js?v=20261109f';
import { lireTout } from './pg-lecture.js?v=20261109a';
import { lireCopies, detacherCopie } from './pg-sync-session.js?v=20261109f';
import { htmlCopies, ouvrirSynchro } from './vue-sync-pg.js?v=20261122c';
import {
  listerTables, htmlBase, htmlDirectes, htmlManquantes, htmlBlocTables, htmlTables, htmlFicheConnexion, htmlFicheTable, htmlApercu, nombre,
} from './vue-pg-rendu.js?v=20261128e';

// Le rendu pur vit dans `vue-pg-rendu.js` ; ces noms restent exportés d'ici pour qui les importait.
export { listerTables, htmlTables, htmlApercu, htmlDirectes };

const CLE_URL = 'atlas.pg.url';

/** L'identifiant d'une couche directe : une table d'une connexion, jamais deux fois sur la carte. */
const idDirecte = (connexion, schema, table) => `${connexion}-${schema}-${table}`.replace(/[^A-Za-z0-9_-]/g, '_');

const COULEURS_DIRECT = ['#d62728', '#1f77b4', '#2ca02c', '#9467bd', '#ff7f0e', '#17becf'];

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

/**
 * La boîte de confirmation de l'identité Grist, rendue dans `document`. Rend `true` seulement si la personne autorise.
 * Une fois par passerelle et par ouverture de la page : sans cette question, une adresse de passerelle modifiée par quelqu'un
 * recevrait en silence le jeton d'accès du document.
 */
export function confirmerIdentite(doc, { origine }) {
  return new Promise((resolve) => {
    const fond = doc.createElement('div');
    fond.setAttribute('role', 'dialog');
    fond.setAttribute('aria-modal', 'true');
    fond.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)';
    const boite = doc.createElement('div');
    boite.style.cssText = 'background:var(--bg,#fff);color:var(--text,#222);padding:16px;border-radius:8px;max-width:340px;width:90%';
    const titre = doc.createElement('strong'); titre.textContent = 'Identité Grist';
    const texte = doc.createElement('div'); texte.style.cssText = 'margin:8px 0';
    texte.textContent = `Envoyer votre identité Grist à ${origine} ? La passerelle la fera valider par Grist et lira vos droits dans l’annuaire du document. Aucun jeton à saisir.`;
    const note = doc.createElement('div'); note.textContent = 'Valable pour cette page seulement, rien n’est enregistré.'; note.style.cssText = 'font-size:11.5px;opacity:.7;margin-bottom:8px';
    const barre = doc.createElement('div'); barre.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
    const refuser = doc.createElement('button'); refuser.type = 'button'; refuser.className = 'btn btn-soft'; refuser.textContent = 'Refuser';
    const autoriser = doc.createElement('button'); autoriser.type = 'button'; autoriser.className = 'btn'; autoriser.textContent = 'Autoriser';
    barre.append(refuser, autoriser);
    boite.append(titre, texte, note, barre);
    fond.append(boite);
    const fermer = (v) => { doc.removeEventListener('keydown', touche, true); fond.remove(); resolve(v); };
    const touche = (e) => { if (e.key === 'Escape') { e.preventDefault(); fermer(false); } };
    doc.addEventListener('keydown', touche, true);
    refuser.addEventListener('click', () => fermer(false));
    autoriser.addEventListener('click', () => fermer(true));
    doc.body.append(fond);
    refuser.focus(); // le refus est le choix par défaut : une touche Entrée distraite n'envoie rien
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
// L'hôte courant : le jeton Grist est demandé à CE document, à chaque demande (la page garde les accès, pas l'hôte).
let hoteCourant = null;

/** Montrer ou masquer une couche en direct : les lectures s'arrêtent avec elle ; une vraie couche d'Atlas change aussi de visibilité. */
function poserVisibilite(d, visible) {
  if (visible) { d.visible = true; d.etat = 'lecture de la zone visible…'; if (d.rendu) d.rendu.visible(true); d.couche.demarrer(); } else {
    d.couche.arreter(); d.visible = false; d.etat = 'masquée'; if (d.rendu) d.rendu.visible(false);
  }
  persister();
}

// La mémoire des couches affichées : la liste est gardée dans le document (`pg-memoire-couches.js`) pour que les couches reviennent à la réouverture.
// Tant que la liste du document n'a pas été lue et remise (`prete`), rien n'est écrit : on n'écrase jamais ce qu'on n'a pas lu.
const memoireCouches = { prete: false, restauree: false, ailleurs: [], manquantes: [], file: Promise.resolve() };
/** Écrire la liste des tables affichées (une écriture à la fois, dans l'ordre). Les liaisons gardées ont leur propre ligne : elles n'en font pas partie. */
function persister() {
  const hote = hoteCourant;
  if (!hote || !memoireCouches.prete || typeof hote.memoriserCouches !== 'function' || hote.lectureSeule()) return;
  const posees = [...directes.values()].filter((d) => d.gristId == null && d.url && d.couche && d.couche.params).map((d) => ({
    url: d.url, connexion: d.couche.params.connexion, schema: d.couche.params.schema, table: d.couche.params.table, couleur: d.couleur, visible: d.visible !== false,
  }));
  const valeur = listeAEnregistrer({ posees, manquantes: memoireCouches.manquantes, ailleurs: memoireCouches.ailleurs });
  memoireCouches.file = memoireCouches.file.then(() => hote.memoriserCouches(valeur)).catch((e) => {
    hote.annoncer(`Les couches PostgreSQL affichées n’ont pas pu être mémorisées dans ce document (${(e && e.message) || e}) : elles ne reviendront pas à la réouverture.`, 'warning');
  });
}

/** Le panneau Couches se redessine quand la liste des couches PostgreSQL change (sans toucher au panneau PostgreSQL, ni à une saisie en cours). */
const noterChangement = () => { if (hoteCourant && typeof hoteCourant.rafraichirCouches === 'function') hoteCourant.rafraichirCouches(); };

/**
 * Les couches PostgreSQL posées sur la carte, pour le panneau Couches. Valable panneau PostgreSQL fermé : les couches directes survivent à sa fermeture.
 * @returns {{id:string, libelle:string, couleur:string, visible:boolean, etat:string, enregistree:boolean, origine:string}[]}
 */
export function listerCouchesPg() {
  // Une vraie couche d'Atlas est déjà dans la liste commune des couches : cette section ne montre que les autres (tuiles).
  return [...directes.entries()].filter(([, d]) => !d.rendu).map(([id, d]) => ({
    id, libelle: d.libelle, couleur: d.couleur, visible: d.visible, etat: d.visible ? d.etat : 'masquée', enregistree: d.gristId != null, origine: d.url ? origineLisible(d.url) : '', mode: d.mode || 'geojson',
  }));
}
/** L'œil d'une couche PostgreSQL du panneau Couches : montrer ou masquer. */
export function basculerCouchePg(id) {
  const d = directes.get(id);
  if (!d) return false;
  poserVisibilite(d, !d.visible);
  noterChangement();
  return true;
}
/**
 * Atlas vient de montrer ou masquer une couche de sa liste commune (l'œil, « Tout masquer ») : si elle vient d'ici, ses lectures suivent
 * (arrêt si masquée) et la visibilité est mémorisée dans le document. Sans effet si la couche n'est pas d'ici ou si l'état est déjà le bon.
 */
export function visibiliteChangeeParAtlas(layerId, visible) {
  for (const d of directes.values()) {
    if (d.rendu && d.rendu.layer && d.rendu.layer.id === layerId) {
      if ((d.visible !== false) !== (visible !== false)) poserVisibilite(d, visible !== false);
      return true;
    }
  }
  return false;
}
/** Atlas vient de supprimer une couche qui venait d'ici : ses lectures s'arrêtent (la couche est déjà retirée de la carte par Atlas). */
export function retirerCoucheParAtlas(layerId) {
  for (const [id, d] of directes) {
    if (d.rendu && d.rendu.layer && d.rendu.layer.id === layerId) {
      d.couche.arreter();
      directes.delete(id);
      persister();
      noterChangement();
      return true;
    }
  }
  return false;
}
/** Cadrer la carte sur ce qui est chargé de la couche (rien de chargé : on le dit, la couche n'est pas devinée). */
export function zoomCouchePg(id) {
  const d = directes.get(id);
  if (!d || !hoteCourant || !hoteCourant.carte) return false;
  const e = empriseEntites(d.couche.entites());
  if (!e) {
    // Une couche en tuiles ne charge rien hors de son zoom : on revient à la dernière vue où elle montrait quelque chose.
    const v = typeof d.couche.derniereVue === 'function' ? d.couche.derniereVue() : null;
    if (v && typeof hoteCourant.carte.easeTo === 'function') { hoteCourant.carte.easeTo({ center: v.centre, zoom: v.zoom }); return true; }
  }
  if (!e) { hoteCourant.annoncer(`« ${d.libelle} » : aucune entité chargée à cadrer. Déplacez ou zoomez la carte sur la zone.`, 'warning'); return false; }
  hoteCourant.carte.fitBounds([[e[0], e[1]], [e[2], e[3]]], { padding: 60, maxZoom: 17 });
  return true;
}
/** Retirer de la carte une couche non gardée (une couche gardée s'oublie depuis le panneau PostgreSQL, avec sa confirmation). */
export function retirerCouchePg(id) {
  const d = directes.get(id);
  if (!d || d.gristId != null) return false;
  d.couche.arreter();
  if (d.rendu) d.rendu.retirer();
  directes.delete(id);
  persister();
  noterChangement();
  return true;
}

/**
 * Le jeton d'accès que Grist donne au widget pour ce document. `readOnly` : lecture seule (la passerelle refuse d'écrire avec).
 * @returns {Promise<{token:string, ttlMsecs?:number}>}
 */
function jetonGrist(readOnly) {
  const api = hoteCourant && hoteCourant.docApi ? hoteCourant.docApi() : null;
  if (!api || typeof api.getAccessToken !== 'function') return Promise.reject(new Error('ce widget n’est pas ouvert dans un document Grist'));
  return api.getAccessToken({ readOnly });
}

/**
 * Un accès à une passerelle : l'identité Grist si la passerelle l'annonce, sinon le jeton saisi.
 * @param {Document} doc
 * @param {boolean} ecriture  jeton d'écriture (Grist : pas en lecture seule ; saisie : boîte « jeton d'ÉCRITURE »)
 * @param {(q:{origine:string})=>Promise<boolean>} confirmer  partagé entre lecture et écriture : une seule question par passerelle
 * @param {boolean} dansGrist  l'hôte sait donner un jeton Grist
 */
function creerAccesPage(doc, ecriture, confirmer, dansGrist) {
  const jeton = creerAccesPg({ demander: (q) => demanderJeton(doc, ecriture ? { ...q, ecriture: true } : q) });
  const grist = dansGrist ? creerAccesGrist({
    jeton: () => jetonGrist(!ecriture),
    confirmer,
    signaler: (t) => { if (hoteCourant && hoteCourant.annoncer) hoteCourant.annoncer(t, 'error'); },
  }) : null;
  return creerAccesAuto({ jeton, grist });
}

/**
 * Ce que le mode tuiles demande au client : l'adresse de PostgREST et le jeton (lu de façon synchrone par la carte). Résolu à la demande : le client de la
 * page est celui d'une adresse qui peut être une passerelle `/v1/`, qui ne sert pas de tuiles (erreur dite, pas de repli silencieux).
 */
function clientDeTuiles(clientDirect) {
  let reel = null;
  return {
    /** Le vrai client PostgREST (colonnes, statistiques) : jamais une passerelle. */
    async client() {
      if (!reel) reel = typeof clientDirect.fournisseurTuiles === 'function' ? await clientDirect.fournisseurTuiles() : null;
      if (!reel) throw new Error('Cette adresse n’est pas un échangeur : elle ne sert pas de tuiles.');
      return reel;
    },
    async tuiles() {
      reel = typeof clientDirect.fournisseurTuiles === 'function' ? await clientDirect.fournisseurTuiles() : null;
      if (!reel) throw new Error('Cette adresse n’est pas un échangeur : elle ne sert pas de tuiles.');
      return reel.tuiles();
    },
    jetonCourant: () => (reel ? reel.jetonCourant() : null),
    garantirJeton: () => (reel ? reel.garantirJeton() : Promise.resolve(null)),
    renouveler: () => (reel ? reel.renouveler() : Promise.resolve(null)),
  };
}

/**
 * Le panneau « Base PostgreSQL ».
 *
 * À GAUCHE (le module) : l'état de la connexion, « Sur la carte » (les tables posées en direct, avec leur œil et leur menu),
 * « Tables de la base », « Copies synchronisées ». À DROITE (l'inspecteur, `hote.fiche`) : la fiche de connexion, puis la fiche de
 * la table choisie (afficher, copier, synchroniser). Sans `hote.fiche` (autre hôte), la fiche se pose sous la liste.
 *
 * @param {object} hote
 * @param {object} hote.carte  la carte MapLibre
 * @param {HTMLElement} hote.corps  le corps du module
 * @param {(titre:string, sous:string)=>void} hote.titre
 * @param {(texte:string, genre:string)=>void} hote.annoncer
 * @param {()=>void} hote.retour
 * @param {()=>boolean} hote.lectureSeule  le document est-il en lecture seule ?
 * @param {()=>Promise<string[]>} hote.tables  les tables du document
 * @param {(plan:object)=>Promise<{nb:number, tableId:string}>} hote.importer  crée la table, écrit les lots, monte la couche
 * @param {{poser:Function, retirer:Function}} [hote.fiche]  l'inspecteur (fiche de droite)
 * @param {Function} [hote.menu]  `(ancre, titre, items, choisir)` : le menu d'actions d'une ligne
 * @param {(nom:string, taille?:number)=>string} [hote.icone]
 */
export async function ouvrirImportPg(hote) {
  if (nettoyageCourant) nettoyageCourant();
  const doc = hote.corps.ownerDocument;
  hoteCourant = hote;
  if (!accesPartage || !accesEcriturePartage) {
    const confirmer = memoriserConfirmation((q) => confirmerIdentite(doc, q));
    const dansGrist = typeof hote.docApi === 'function';
    if (!accesPartage) accesPartage = creerAccesPage(doc, false, confirmer, dansGrist);
    if (!accesEcriturePartage) accesEcriturePartage = creerAccesPage(doc, true, confirmer, dansGrist);
  }
  const acces = accesPartage;
  const icone = (nom, taille) => (hote.icone ? hote.icone(nom, taille) : '');

  // L'adresse du DOCUMENT (options du widget) décide et connecte tout seul ; celle qu'a retenue ce navigateur préremplit le champ seulement.
  let options = null;
  if (typeof hote.options === 'function') {
    try { options = await hote.options(); } catch (e) { hote.annoncer(`PostgreSQL : l'adresse enregistrée dans ce document n'a pas pu être lue (${(e && e.message) || e}).`, 'warning'); }
  }
  const adresseDoc = lireAdresseDocument(options);
  const depart = demarrage({ adresseDocument: adresseDoc.url, adresseNavigateur: lireUrl() });
  const etat = {
    url: depart.url, adresseDocument: adresseDoc.url, connexions: [], connexion: '', schema: null, filtre: '', table: null, couche: null, plan: null, nom: '',
    phase: 'repos', erreur: '', lectureSeule: !!hote.lectureSeule(), peutEnregistrer: false, modifiables: null, modifiable: null, copies: [],
    connecte: false, enCours: false, erreurConnexion: '', modeAcces: null,
    // Adresse du document : la fiche de connexion n'apparaît que si quelque chose ne va pas (ou sur « Réglages »). Sinon : champ à remplir.
    fiche: depart.connexionAuto ? null : 'connexion',
  };
  if (adresseDoc.refus) hote.annoncer(`PostgreSQL : ${adresseDoc.refus}.`, 'warning');
  let client = null;
  let racine = null;
  const vivant = () => !!racine && racine.isConnected && hote.corps.contains(racine);
  const zone = (id) => (racine ? racine.querySelector(id) : null);

  function monter() {
    hote.titre('Base PostgreSQL', 'Tables de votre base PostgreSQL : les afficher sur la carte, les copier dans le document, les synchroniser.');
    hote.corps.innerHTML = `<div id="pg-racine">
      <div id="pg-base"></div>
      <div id="pg-etat" class="range-info" role="status" aria-live="polite"></div>
      <div id="pg-directes"></div>
      <div id="pg-liste"></div>
      <div id="pg-copies"></div>
      <div id="pg-fiche"></div>
      <div class="section"><button type="button" class="btn btn-soft btn-full" data-act="retour">← Retour aux couches</button></div>
    </div>`;
    racine = hote.corps.querySelector('#pg-racine');
    racine.addEventListener('click', surClic);
    racine.addEventListener('input', surSaisie);
    racine.addEventListener('keydown', surTouche);
  }

  const dire = (t) => { const e = zone('#pg-etat'); if (e) e.textContent = t; };
  const libelleConnexion = () => { const c = etat.connexions.find((x) => x.alias === etat.connexion); return c ? (c.libelle || c.alias) : ''; };

  // --- GAUCHE
  function dessinerBase() {
    const z = zone('#pg-base');
    if (z) z.innerHTML = htmlBase({ connecte: etat.connecte, enCours: etat.enCours, url: etat.url, libelle: libelleConnexion(), nbTables: etat.schema ? listerTables(etat.schema, '', etat.modifiables).length : 0 });
  }
  const tablesVisibles = () => listerTables(etat.schema, etat.filtre, etat.modifiables);
  function dessinerLignesTables() {
    const z = zone('#pg-lignes');
    if (z) z.innerHTML = htmlTables(tablesVisibles(), etat.table);
  }
  function dessinerListe() {
    const z = zone('#pg-liste');
    if (!z) return;
    z.innerHTML = etat.schema ? htmlBlocTables({ tables: tablesVisibles(), choisie: etat.table, filtre: etat.filtre, total: listerTables(etat.schema, '', etat.modifiables).length }) : '';
  }
  function dessinerCopies() {
    const z = zone('#pg-copies');
    if (z) z.innerHTML = htmlCopies(etat.copies);
  }
  async function chargerCopies() {
    // Rien n'est contacté : on lit seulement la configuration que le document garde (Atlas_PgSyncCopies).
    try { etat.copies = hote.docApi ? await lireCopies(hote.docApi()) : []; } catch { etat.copies = []; }
    dessinerCopies();
  }
  function liste() {
    const items = [...directes.entries()].map(([id, d]) => ({
      id, libelle: d.libelle, couleur: d.couleur, etat: d.visible ? d.etat : 'masquée', visible: d.visible, enregistree: d.gristId != null, origine: d.url ? origineLisible(d.url) : '',
    }));
    for (const l of (hote.liaisons ? hote.liaisons() : [])) {
      if ([...directes.values()].some((d) => d.gristId === l.gristId)) continue;
      items.push({ id: `liaison-${l.gristId}`, libelle: `${l.schema}.${l.table}`, couleur: l.color || '#d62728', etat: 'à afficher', visible: false, enregistree: true, origine: origineLisible(l.url) });
    }
    return items;
  }
  /** Retirer de la liste du document une table mémorisée mais introuvable (la table PostgreSQL n'est pas touchée). */
  function oublierManquante(nom) {
    memoireCouches.manquantes = memoireCouches.manquantes.filter((m) => `${m.schema}.${m.table}` !== nom);
    persister();
    dessinerDirectes();
    hote.annoncer(`${nom} retirée de la liste des couches PostgreSQL de ce document.`, 'success');
  }
  function dessinerDirectes() {
    const z = zone('#pg-directes');
    if (z) z.innerHTML = htmlDirectes(liste(), { icone }) + htmlManquantes(memoireCouches.manquantes);
    noterChangement();
  }

  // --- DROITE
  const infoTable = () => (etat.table ? listerTables(etat.schema, '', etat.modifiables).find((t) => t.schema === etat.table.schema && t.table === etat.table.table) || null : null);
  function contenuFiche() {
    if (etat.fiche === 'table' && etat.table) return htmlFicheTable({ ...etat, surCarte: surCarte(etat.table) }, infoTable());
    return htmlFicheConnexion({
      url: etat.url, connecte: etat.connecte, enCours: etat.enCours, erreur: etat.erreurConnexion, modeAcces: etat.modeAcces,
      connexions: etat.connexions, connexion: etat.connexion,
    });
  }
  /** Redessine la fiche (à droite ; sous la liste sans inspecteur). Les champs gardent leur état dans `etat` : rien ne se perd. */
  function poserFiche() {
    if (!vivant()) return;
    if (etat.fiche === null) { // adresse du document, tout va bien : rien à régler, rien à montrer à droite
      if (hote.fiche) hote.fiche.retirer(); else { const z0 = zone('#pg-fiche'); if (z0) z0.innerHTML = ''; }
      return;
    }
    const f = contenuFiche();
    if (hote.fiche) { hote.fiche.poser({ tete: f.tete, corps: f.corps, surClic, surSaisie, surTouche }); return; }
    const z = zone('#pg-fiche');
    if (z) z.innerHTML = `<div class="section">${f.tete}${f.corps}</div>`;
  }
  // La fiche ne se redessine qu'à un changement d'état (jamais en tapant : le curseur resterait).
  function majFiche() { if (vivant()) poserFiche(); }

  // --- COUCHES EN DIRECT
  /**
   * Les champs et les statistiques d'une grosse table : ce que la symbologie (champs, bornes, catégories) demande à des entités qu'on ne charge pas. Un contrat SQL sans
   * `stats` ou une panne n'empêche pas la couche : elle reste affichée, sans classes, et on le dit.
   */
  async function decrireTuiles(entree, adaptateur, schema, table) {
    const reel = await adaptateur.client();
    const cols = await reel.colonnes(schema, table);
    const champs = champsDepuisColonnes(cols, typeGristDe);
    entree.rendu.surChamps(champs);
    if (!(etat.capacites || []).includes('stats')) {
      hote.annoncer(`${entree.libelle} : le contrat SQL installé ne calcule pas de statistiques (atlas.stats) : pas de classes ni de catégories. Rejouer sql/002_contrat.sql.`, 'warning');
      return;
    }
    try {
      entree.rendu.surStats(await reel.stats(schema, table, champs.map((c) => c.name).slice(0, 40)));
    } catch (e) {
      hote.annoncer(`${entree.libelle} : statistiques indisponibles, pas de classes ni de catégories (${texteErreur(e)}).`, 'warning');
    }
  }
  function demarrerDirecte({ clientDirect, url, connexion, schema, table, couleur, gristId = null }) {
    const id = idDirecte(connexion, schema, table);
    if (directes.has(id)) { hote.annoncer('Cette table est déjà sur la carte.', 'warning'); return null; }
    const entree = { couleur, url, gristId, client: clientDirect, libelle: `${schema}.${table}`, etat: 'lecture de la zone visible…', couche: null, visible: true };
    const surEtat = (e) => {
      if (entree.visible) entree.etat = libelleEtat(e);
      if (e.phase === 'ok' && e.tronque) hote.annoncer(`${entree.libelle} : résultat tronqué, zoomez.`, 'warning');
      if (e.phase === 'erreur' && e.erreur) hote.annoncer(`${entree.libelle} : ${e.erreur}`, 'error');
      dessinerDirectes();
    };
    // Le mode suit la TAILLE de la table : une grande table (contrat à jour, PostGIS 3.1 ou plus) se lit en tuiles PBF, les autres en GeoJSON.
    const info = etat.schema ? listerTables(etat.schema, '', etat.modifiables).find((x) => x.schema === schema && x.table === table) : null;
    const mode = modeDe({ lignesEstimees: info ? info.lignes : null, capacites: etat.capacites || [] });
    if (mode === 'tuiles') {
      const adaptateur = clientDeTuiles(clientDirect);
      // Une grosse table est AUSSI une vraie couche d'Atlas (liste, ordre, légende, style enregistré) : les statistiques de la base remplacent les entités qu'on ne charge pas.
      if (typeof hote.creerCoucheAtlasTuiles === 'function') {
        const brute = ((etat.schema && etat.schema.schemas) || []).find((x) => x.nom === schema);
        const tableBrute = brute ? brute.tables.find((x) => x.nom === table) : null;
        entree.rendu = hote.creerCoucheAtlasTuiles({
          id, libelle: entree.libelle, couleur, geometrie: typeDepuisCatalogue(tableBrute ? tableBrute.geometries : null),
          cle: cleApparence({ url, connexion, schema, table }), url, connexion, schema, table, lignesEstimees: info.lignes, champs: [],
        });
      }
      entree.couche = creerCoucheTuiles({
        carte: hote.carte, client: adaptateur, id, couleur, params: { connexion, schema, table }, lignesEstimees: info.lignes, surEtat, rendu: entree.rendu || null,
      });
      entree.decrire = () => decrireTuiles(entree, adaptateur, schema, table);
    } else {
      // Une table modeste est une VRAIE couche d'Atlas (symbologie, fiche, ordre, légende) alimentée par ces lectures ; sans hôte capable, le module dessine lui-même.
      if (typeof hote.creerCoucheAtlas === 'function') {
        const brute = ((etat.schema && etat.schema.schemas) || []).find((x) => x.nom === schema);
        const tableBrute = brute ? brute.tables.find((x) => x.nom === table) : null;
        entree.rendu = hote.creerCoucheAtlas({
          id, libelle: entree.libelle, couleur, geometrie: typeDepuisCatalogue(tableBrute ? tableBrute.geometries : null),
          cle: cleApparence({ url, connexion, schema, table }), url, connexion, schema, table,
        });
      }
      entree.couche = creerCoucheDirecte({ carte: hote.carte, client: clientDirect, id, couleur, params: { connexion, schema, table }, surEtat, rendu: entree.rendu || null });
    }
    entree.mode = mode;
    directes.set(id, entree);
    persister();
    dessinerDirectes();
    Promise.resolve(entree.couche.demarrer()).then(() => (entree.decrire && entree.rendu ? entree.decrire() : null)).catch((e) => {
      entree.etat = texteErreur(e);
      hote.annoncer(`${entree.libelle} : ${texteErreur(e)}`, 'error');
      dessinerDirectes();
    });
    return { id, entree };
  }
  async function garder(id) {
    const d = directes.get(id);
    if (!d || d.gristId != null || typeof hote.enregistrerLiaison !== 'function') return;
    const p = d.couche.params;
    try {
      d.gristId = await hote.enregistrerLiaison({ url: d.url, connexion: p.connexion, schema: p.schema, table: p.table, couleur: d.couleur, libelle: d.libelle });
      hote.annoncer(`« ${d.libelle} » gardée dans le document (sans identité ni jeton).`, 'success');
    } catch (e) {
      // La couche reste affichée pour la session : on dit que l'enregistrement, lui, a échoué.
      hote.annoncer(`Liaison non enregistrée : ${(e && e.message) || e}`, 'error');
    }
    dessinerDirectes();
  }
  async function lier({ enregistrer = false } = {}) {
    if (!etat.table || !client) return;
    const couleur = COULEURS_DIRECT[directes.size % COULEURS_DIRECT.length];
    const lancee = demarrerDirecte({ clientDirect: client, url: etat.url, connexion: etat.connexion, schema: etat.table.schema, table: etat.table.table, couleur });
    if (!lancee) return;
    hote.annoncer(`« ${lancee.entree.libelle} » affichée sur la carte.`, 'success');
    if (enregistrer) await garder(lancee.id);
  }
  function activer(idListe) {
    const l = (hote.liaisons ? hote.liaisons() : []).find((x) => `liaison-${x.gristId}` === idListe);
    if (!l) return;
    // L'identité (ou le jeton) n'est demandée qu'ici, pour l'origine de CETTE liaison, qui est affichée dans la ligne.
    demarrerDirecte({
      clientDirect: creerClientAuto({ url: l.url, acces }), url: l.url, connexion: l.connexion, schema: l.schema, table: l.table,
      couleur: l.color || COULEURS_DIRECT[0], gristId: l.gristId,
    });
  }
  /** L'œil d'une ligne : montrer ou masquer, comme une couche. Une liaison gardée mais pas encore posée s'active. */
  function basculer(id) {
    if (String(id).startsWith('liaison-')) { activer(id); return; }
    const d = directes.get(id);
    if (!d) return;
    poserVisibilite(d, !d.visible);
    dessinerDirectes();
  }
  // « Modifier les données » : la table doit être DÉCLARÉE modifiable par la passerelle ; sinon on le dit, on n'ouvre rien.
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
      if (hote.fiche) hote.fiche.retirer(); // l'édition occupe le panneau de gauche ; la fiche revient à son retour
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
    if (d.rendu) d.rendu.retirer();
    directes.delete(id);
    persister();
    dessinerDirectes(); // une liaison gardée reste dans la liste, « à afficher »
  }
  async function oublier(idListe) {
    const d = directes.get(idListe);
    const gristId = d ? d.gristId : Number(String(idListe).replace('liaison-', ''));
    const libelle = d ? d.libelle : ((hote.liaisons ? hote.liaisons() : []).find((x) => x.gristId === gristId) || {}).table;
    if (!Number.isFinite(gristId) || !hote.supprimerLiaison) return;
    if (!window.confirm(`Oublier la liaison « ${libelle || gristId} » ?\n\nElle disparaît du document. La table PostgreSQL n'est pas touchée.`)) return;
    try {
      await hote.supprimerLiaison(gristId);
      if (d) { d.couche.arreter(); if (d.rendu) d.rendu.retirer(); directes.delete(idListe); }
      hote.annoncer('Liaison oubliée.', 'success');
    } catch (e) {
      hote.annoncer(`Impossible d’oublier la liaison : ${(e && e.message) || e}`, 'error');
    }
    dessinerDirectes();
  }
  function menuLigne(id, ancre) {
    if (!hote.menu) return;
    const d = directes.get(id);
    const items = [];
    if (d && d.visible) items.push({ id: 'modifier', nom: 'Modifier les données', ic: 'crayon' });
    if (d && d.gristId == null && typeof hote.enregistrerLiaison === 'function' && !etat.lectureSeule) items.push({ id: 'garder', nom: 'Garder dans le document', ic: 'lien' });
    if (d && d.gristId == null) items.push({ id: 'retirer', nom: 'Retirer de la liste', ic: 'corbeille', danger: true });
    if (!d || d.gristId != null) items.push({ id: 'oublier', nom: 'Oublier cette liaison', ic: 'corbeille', danger: true });
    hote.menu(ancre, `Actions pour ${d ? d.libelle : id}`, items, (act) => {
      if (act === 'modifier') modifierDirecte(id);
      else if (act === 'garder') garder(id);
      else if (act === 'retirer') retirer(id);
      else if (act === 'oublier') oublier(id);
    });
  }
  function ouvrirCopie(rowId) {
    const copie = etat.copies.find((c) => String(c.rowId) === String(rowId));
    if (!copie) return;
    if (hote.fiche) hote.fiche.retirer(); // la synchronisation occupe le panneau de gauche
    ouvrirSynchro({
      hote, copie, accesEcriture: accesEcriturePartage, detacher: detacherCopie,
      // La lecture n'a besoin que de l'accès en lecture, pour l'origine de CETTE copie (affichée dans la ligne).
      clientLecture: creerClientAuto({ url: copie.config.url, acces }),
      retour: () => ouvrirImportPg(hote),
    });
  }

  // --- TABLE CHOISIE
  function majBouton() {
    const b = hote.corps.ownerDocument.querySelector('[data-act="importer"]');
    if (b) b.disabled = !etat.plan || !etat.plan.ok || etat.lectureSeule || etat.sansDocument;
  }
  function recalculerPlan() {
    etat.plan = etat.couche ? planImportPg({ couche: etat.couche, nom: etat.nom || (etat.table && etat.table.table) || '', tables: etat.tablesGrist || [] }) : null;
  }
  async function surErreur(e, phase = 'erreur') {
    etat.phase = phase;
    etat.erreur = texteErreur(e);
    majFiche();
  }

  /** `automatique` : à l'ouverture, avec l'adresse du document. La fiche de connexion ne s'ouvre alors que si la connexion échoue. */
  async function connecter({ automatique = false } = {}) {
    const champ = hote.corps.ownerDocument.getElementById('pg-url');
    const saisie = (champ ? champ.value : etat.url).trim();
    etat.url = saisie;
    ecrireUrl(saisie);
    client = creerClientAuto({ url: saisie, acces });
    etat.enCours = true; etat.connecte = false; etat.erreurConnexion = ''; etat.fiche = automatique ? null : 'connexion';
    dessinerBase(); poserFiche();
    dire('Connexion…');
    try {
      const info = await client.connexions();
      etat.connexions = info.connexions;
      etat.limiteMax = Number.isInteger(info.limite_max) && info.limite_max > 0 ? info.limite_max : null;
      etat.capacites = Array.isArray(info.capacites) ? info.capacites : [];
      (info.avertissements || []).forEach((a) => hote.annoncer(a, 'warning'));
      etat.modeAcces = acces.mode ? acces.mode(saisie) : null;
      if (!info.connexions.length) {
        etat.enCours = false;
        etat.erreurConnexion = 'Aucune base de données n’est déclarée sur cette passerelle.';
        etat.fiche = 'connexion'; // quelque chose ne va pas : l'adresse et l'erreur redeviennent visibles
        dire('');
        dessinerBase(); poserFiche();
        return;
      }
      etat.connexion = etat.connexion && info.connexions.some((c) => c.alias === etat.connexion) ? etat.connexion : info.connexions[0].alias;
      etat.connecte = true;
      etat.enCours = false;
      await chargerSchema();
      if (etat.schema) {
        await memoriserAdresse(saisie); // une adresse dont on ne sait pas lire les tables n'est pas retenue pour tout le document
        await restaurerCouches();
      }
    } catch (e) {
      etat.enCours = false;
      etat.erreurConnexion = `Non connecté : ${texteErreur(e)}`;
      etat.fiche = 'connexion';
      dire('');
      dessinerBase(); poserFiche();
    }
  }

  /**
   * Remettre sur la carte les tables que le document se rappelle (`pgCouches`) : seulement celles de CETTE adresse et de CETTE connexion, une seule fois par page,
   * et seulement après la confirmation d'identité (on est ici une fois connecté). Une table introuvable reste dans la liste, et le dit.
   */
  async function restaurerCouches() {
    if (memoireCouches.restauree || !etat.schema) return;
    if (typeof hote.couchesDocument !== 'function') { memoireCouches.prete = false; return; }
    let brut;
    try { brut = await hote.couchesDocument(); } catch (e) {
      hote.annoncer(`PostgreSQL : les couches mémorisées dans ce document n’ont pas pu être lues (${(e && e.message) || e}).`, 'warning');
      return;
    }
    const lue = lireCouches(brut);
    memoireCouches.restauree = true;
    if (lue.refus) { hote.annoncer(`PostgreSQL : ${lue.refus}. Elle n’est pas écrasée : corrigez ou supprimez cette ligne.`, 'warning'); return; }
    if (lue.ignorees) hote.annoncer(`PostgreSQL : ${lue.ignorees} entrée(s) incomplète(s) ignorée(s) dans la liste des couches de ce document.`, 'warning');
    const { ici, ailleurs } = repartir(lue.couches, { url: etat.url, connexion: etat.connexion });
    memoireCouches.ailleurs = ailleurs;
    memoireCouches.manquantes = [];
    const tables = listerTables(etat.schema, '', etat.modifiables);
    let remises = 0;
    for (const e of ici) {
      if (!tables.some((x) => x.schema === e.schema && x.table === e.table)) { memoireCouches.manquantes.push(e); continue; }
      const lancee = demarrerDirecte({
        clientDirect: client, url: etat.url, connexion: e.connexion, schema: e.schema, table: e.table, couleur: e.couleur || COULEURS_DIRECT[directes.size % COULEURS_DIRECT.length],
      });
      if (!lancee) continue;
      if (!e.visible) poserVisibilite(lancee.entree, false);
      remises++;
    }
    memoireCouches.prete = true;
    if (memoireCouches.manquantes.length) {
      const noms = memoireCouches.manquantes.map((m) => `${m.schema}.${m.table}`).join(', ');
      hote.annoncer(`PostgreSQL : ${noms} — introuvable ou non accessible pour vous. Elle reste dans la liste de ce document.`, 'warning');
    }
    if (remises) hote.annoncer(`${remises} couche${remises > 1 ? 's' : ''} PostgreSQL remise${remises > 1 ? 's' : ''} sur la carte (mémorisée${remises > 1 ? 's' : ''} dans ce document).`, 'success');
    dessinerDirectes();
    if (hote.restauration && vivant()) hote.retour();
  }

  /** Une adresse qui vient de servir est gardée dans le document (si la personne peut y écrire) : elle n'est plus à saisir, pour personne. */
  async function memoriserAdresse(saisie) {
    const url = adresseAEnregistrer({ saisie, adresseDocument: etat.adresseDocument, peutEcrire: !etat.lectureSeule && typeof hote.memoriserAdresse === 'function' });
    if (!url) return;
    try {
      await hote.memoriserAdresse(url);
      etat.adresseDocument = url;
      hote.annoncer('Adresse enregistrée dans ce document (table Atlas_Config) : elle n’est plus à saisir.', 'success');
    } catch (e) {
      hote.annoncer(`Adresse non enregistrée dans le document : ${(e && e.message) || e}`, 'warning');
    }
  }

  async function chargerSchema() {
    dire(`Lecture des tables de « ${libelleConnexion() || etat.connexion} »…`);
    try {
      etat.schema = await client.schema(etat.connexion, true);
      dire('');
      (etat.schema.avertissements || []).forEach((a) => hote.annoncer(a, 'warning'));
      try {
        const m = await client.commande('pg_gateway_tables_modifiables', { connexion: etat.connexion });
        etat.modifiables = new Map(m.tables.map((t) => [`${t.schema}.${t.table}`, t]));
      } catch { etat.modifiables = null; } // écriture non configurée sur cette connexion : pas de copie synchronisable
      dessinerBase();
      dessinerListe();
      poserFiche();
    } catch (e) {
      etat.erreurConnexion = `Tables illisibles : ${texteErreur(e)}`;
      etat.fiche = 'connexion';
      dire('');
      dessinerBase(); poserFiche();
    }
  }

  async function lire() {
    if (!etat.table) return;
    etat.phase = 'lecture';
    majFiche();
    try {
      await mettreAPlat(hote.carte);
      try {
        etat.tablesGrist = await hote.tables();
        etat.sansDocument = false;
      } catch {
        // Hors d'un document Grist : l'aperçu reste possible, la copie non (elle écrit dans le document).
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
      majFiche();
    } catch (e) { await surErreur(e); }
  }

  async function importer() {
    if (!etat.plan || !etat.plan.ok || etat.lectureSeule) return;
    etat.phase = 'import';
    majFiche();
    try {
      const r = await hote.importer(etat.plan);
      etat.resultat = r;
      etat.phase = 'termine';
      hote.annoncer(`${nombre(r.nb)} entités copiées dans le document`, 'success');
      majFiche();
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
    majFiche();
    try {
      const t = etat.table;
      const cible = { connexion: etat.connexion, schema: t.schema, table: t.table };
      const lecture = await lireTout(client, cible, { page: etat.limiteMax || 10000 });
      const meta = await client.commande('pg_gateway_table', cible);
      const plan = planCopie({ lecture, table: meta, decl: etat.modifiable, url: etat.url, connexion: etat.connexion, nom: etat.nom || t.table, tables: await hote.tables() });
      if (!plan.ok) throw new Error(plan.erreur);
      etat.avancement = `${nombre(plan.nbLignes)} lignes…`;
      majFiche();
      const r = await hote.importerCopie(plan);
      etat.resultat = r;
      etat.phase = 'termine';
      hote.annoncer(`${nombre(r.nb)} lignes copiées : la synchronisation est possible depuis « Copies synchronisées ».`, 'success');
      await chargerCopies();
      majFiche();
    } catch (e) {
      await surErreur(e);
      hote.annoncer(texteErreur(e), 'error');
    }
  }

  function choisirTable(nomComplet) {
    const [schema, ...reste] = nomComplet.split('.');
    etat.table = { schema, table: reste.join('.') };
    etat.nom = etat.table.table;
    etat.modifiable = etat.modifiables ? (etat.modifiables.get(`${schema}.${etat.table.table}`) || null) : null;
    etat.fiche = 'table';
    etat.couche = null; etat.plan = null; etat.resultat = null;
    const info = infoTable();
    dessinerLignesTables();
    if (info && !info.geo) { etat.phase = 'pret'; majFiche(); return; }
    // Choisir une table géographique la POSE SUR LA CARTE : c'est une couche, comme celles des autres sources. La fiche garde le reste (copier, synchroniser).
    if (!surCarte(etat.table)) lier();
    lire();
  }
  /** Cette table est-elle déjà une couche de la carte ? */
  function surCarte(t) { return !!t && directes.has(idDirecte(etat.connexion, t.schema, t.table)); }

  // --- ÉVÉNEMENTS (ils arrivent de la liste, à gauche, et de la fiche, à droite)
  function surClic(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    const sy = t.closest('[data-sync]');
    if (sy) { ouvrirCopie(sy.dataset.sync); return; }
    const bt = t.closest('[data-table]');
    if (bt) { choisirTable(bt.dataset.table); return; }
    const oeil = t.closest('[data-pg-bascule]');
    if (oeil) { basculer(oeil.dataset.pgBascule); return; }
    const men = t.closest('[data-pg-menu]');
    if (men) { menuLigne(men.dataset.pgMenu, men); return; }
    const oubli = t.closest('[data-pg-oublier]');
    if (oubli) { oublierManquante(oubli.dataset.pgOublier); return; }
    const act = t.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;
    if (a === 'connecter') connecter();
    else if (a === 'reglages') { etat.fiche = 'connexion'; poserFiche(); }
    else if (a === 'relire') lire();
    else if (a === 'importer') importer();
    else if (a === 'importer-sync') importerSync();
    else if (a === 'direct') lier();
    else if (a === 'direct-enregistre') lier({ enregistrer: true });
    else if (a === 'retour') hote.retour();
  }
  function surSaisie(e) {
    const t = e.target;
    if (!t || !t.id) return;
    if (t.id === 'pg-nom') { etat.nom = t.value; recalculerPlan(); majBouton(); }
    else if (t.id === 'pg-filtre') { etat.filtre = t.value; dessinerLignesTables(); }
    else if (t.id === 'pg-url') { etat.url = t.value; }
    else if (t.id === 'pg-connexion') { etat.connexion = t.value; etat.table = null; etat.couche = null; etat.fiche = 'connexion'; chargerSchema(); }
  }
  function surTouche(e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'pg-url') { e.preventDefault(); connecter(); }
  }

  monter();
  dessinerBase();
  dessinerDirectes();
  chargerCopies();
  poserFiche();
  // Sans adresse enregistrée dans le document : connexion À LA DEMANDE. Ouvrir le panneau ne contacte pas la passerelle (et n'envoie donc rien) :
  // on peut afficher, masquer ou oublier une liaison gardée sans se connecter. Avec une adresse du document : voir plus bas.
  nettoyageCourant = () => { racine = null; };
  // L'adresse enregistrée dans le DOCUMENT connecte tout seul : une seule question à la personne (la confirmation qui nomme l'adresse, « Refuser » par défaut).
  // Rien n'est envoyé avant : la sonde de l'échangeur ne porte aucune identité.
  if (depart.connexionAuto) connecter({ automatique: true });
  return { etat, connecter, lire, importer };
}

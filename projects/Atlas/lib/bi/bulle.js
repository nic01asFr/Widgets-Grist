/**
 * La bulle d'un objet, DÉCLARÉE par l'hôte dans le manifeste de la couche, et ses actions, qui reviennent à l'hôte.
 *
 *   layers: [{ id: 'sites', …, bulle: {
 *     titre: 'nom' | 'Site {nom} ({commune})',      // une propriété, ou un modèle ; à défaut, le nom de la couche
 *     champs: [{ champ: 'commune', libelle: 'Commune', format: 'texte' | 'nombre' | 'date' | 'pourcent' }],   // 4 au plus
 *     actions: [{ id: 'ouvrir-fiche', libelle: 'Ouvrir la fiche', style: 'principale' | 'secondaire' }],   // 3 au plus
 *     ouverture: 'clic' | 'aucune',                    // défaut 'clic' ; 'aucune' : la carte n'ouvre jamais la bulle
 *     liste: { table: 'cotations', cle: 'batiment', valeur: 'ref',      // l’historique : les lignes de la table liée `cotations` (couche `type: "table"`)
 *              tri: 'date', ordre: 'desc', max: 5, titre: 'Cotations',  // dont `batiment` = la propriété `ref` de l’objet ; `valeur` : par défaut la clé de la couche
 *              champs: [{ champ: 'date', libelle: 'Date', format: 'date' }, { champ: 'note', libelle: 'Note' }] }   // 4 champs au plus, 10 lignes au plus
 *   } }]
 *
 * Ce que fait le composant : il AFFICHE (texte seulement) et il RENVOIE. Au clic d'un bouton il émet `action { layer, featureId, key, actionId }` ; il
 * n'ouvre, n'écrit ni ne navigue rien lui-même : l'hôte route. La bulle s'ouvre quand un objet est sélectionné (clic dans la carte, ou `select(id)` de
 * l'hôte) et se ferme quand la sélection s'efface (`select(null)`, clic dans le vide, bouton ou Échap). Événement `bulle { etat, layer, featureId }`.
 *
 * Sécurité : aucun HTML venant de l'hôte ou des données n'est interprété (tout passe par `textContent`) ; pas d'image ni de lien dans cette version ;
 * longueurs bornées ; un champ ou une action invalide est écarté ET signalé (`avertissements`), jamais corrigé en silence. Les couleurs viennent de la
 * charte (variables `--atlas-*`, voir `lib/charte/interface.js`).
 *
 * Module sans dépendance : le DOM et la fabrique de bulle de carte (MapLibre `Popup`) sont injectés.
 */

import { decalageDansZone } from './marges.js';
import { lignesLiees, MAX_AFFICHE } from './tables.js';

export const CHAMPS_MAX = 4;
export const ACTIONS_MAX = 3;
export const LONGUEUR_LIBELLE = 80;
export const LONGUEUR_VALEUR = 200;
export const LONGUEUR_ID_ACTION = 40;

const FORMATS = ['texte', 'nombre', 'date', 'pourcent'];
const STYLES = ['principale', 'secondaire'];
const OUVERTURES = ['clic', 'aucune'];
const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const coupe = (s, n) => { const t = String(s); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

/**
 * Valide la déclaration d'une bulle.
 * @returns {{ bulle: object|null, avertissements: string[] }}  `bulle` est null quand rien n'est déclaré ou que la déclaration n'est pas un objet
 */
export function normaliserBulle(brut) {
  const avertissements = [];
  if (brut === undefined || brut === null) return { bulle: null, avertissements };
  if (!estObjet(brut)) return { bulle: null, avertissements: ['bulle : un objet est attendu ; la couche n\'a pas de bulle'] };
  const connus = ['titre', 'champs', 'actions', 'ouverture', 'liste'];
  for (const k of Object.keys(brut)) if (!connus.includes(k)) avertissements.push(`bulle : propriété « ${coupe(k, 30)} » inconnue, ignorée`);
  const bulle = { titre: typeof brut.titre === 'string' && brut.titre.trim() ? coupe(brut.titre.trim(), 160) : null, champs: [], actions: [], ouverture: 'clic' };
  if (brut.titre !== undefined && bulle.titre === null) avertissements.push('bulle.titre : une chaîne est attendue, ignoré');
  if (brut.ouverture !== undefined) {
    if (OUVERTURES.includes(brut.ouverture)) bulle.ouverture = brut.ouverture;
    else avertissements.push(`bulle.ouverture : « ${coupe(brut.ouverture, 20)} » inconnue (${OUVERTURES.join(', ')}), « clic » gardé`);
  }
  if (brut.champs !== undefined) {
    if (!Array.isArray(brut.champs)) avertissements.push('bulle.champs : une liste est attendue, ignorée');
    else {
      brut.champs.forEach((c, i) => {
        if (!estObjet(c) || typeof c.champ !== 'string' || !c.champ) { avertissements.push(`bulle.champs[${i}] : { champ: « nom de propriété » } attendu, ignoré`); return; }
        if (bulle.champs.length >= CHAMPS_MAX) { if (bulle.champs.length === CHAMPS_MAX) avertissements.push(`bulle.champs : ${CHAMPS_MAX} au plus, les suivants sont ignorés`); bulle.champs.push(null); return; }
        let format = 'texte';
        if (c.format !== undefined) { if (FORMATS.includes(c.format)) format = c.format; else avertissements.push(`bulle.champs[${i}].format : « ${coupe(c.format, 20)} » inconnu (${FORMATS.join(', ')}), « texte » gardé`); }
        bulle.champs.push({ champ: c.champ, libelle: typeof c.libelle === 'string' && c.libelle.trim() ? coupe(c.libelle.trim(), LONGUEUR_LIBELLE) : c.champ, format });
      });
      bulle.champs = bulle.champs.filter(Boolean);
    }
  }
  if (brut.actions !== undefined) {
    if (!Array.isArray(brut.actions)) avertissements.push('bulle.actions : une liste est attendue, ignorée');
    else {
      const ids = new Set(); let depassement = false;
      brut.actions.forEach((a, i) => {
        if (!estObjet(a) || typeof a.id !== 'string' || !a.id.trim() || typeof a.libelle !== 'string' || !a.libelle.trim()) { avertissements.push(`bulle.actions[${i}] : { id, libelle } attendus (chaînes non vides), ignorée`); return; }
        const id = a.id.trim();
        if (id.length > LONGUEUR_ID_ACTION || !/^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/.test(id)) { avertissements.push(`bulle.actions[${i}].id : lettres, chiffres, _ . : - et ${LONGUEUR_ID_ACTION} caractères au plus, ignorée`); return; }
        if (ids.has(id)) { avertissements.push(`bulle.actions[${i}] : identifiant « ${id} » en double, ignorée`); return; }
        if (bulle.actions.length >= ACTIONS_MAX) { if (!depassement) avertissements.push(`bulle.actions : ${ACTIONS_MAX} au plus, les suivantes sont ignorées`); depassement = true; return; }
        let style = bulle.actions.length === 0 ? 'principale' : 'secondaire';
        if (a.style !== undefined) { if (STYLES.includes(a.style)) style = a.style; else avertissements.push(`bulle.actions[${i}].style : « ${coupe(a.style, 20)} » inconnu (${STYLES.join(', ')}), valeur par défaut gardée`); }
        ids.add(id); bulle.actions.push({ id, libelle: coupe(a.libelle.trim(), LONGUEUR_LIBELLE), style });
      });
    }
  }
  if (brut.liste !== undefined) { const l = normaliserListe(brut.liste, avertissements); if (l) bulle.liste = l; }
  return { bulle, avertissements };
}

/** La déclaration de l’historique d’une bulle (voir l’en-tête) ; `null` et un avertissement quand elle n’est pas utilisable. */
function normaliserListe(brut, avertissements) {
  if (!estObjet(brut)) { avertissements.push('bulle.liste : un objet est attendu, ignorée'); return null; }
  const motif = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,39}$/;
  for (const k of Object.keys(brut)) if (!['table', 'cle', 'valeur', 'champs', 'tri', 'ordre', 'max', 'titre'].includes(k)) avertissements.push(`bulle.liste : propriété « ${coupe(k, 30)} » inconnue, ignorée`);
  if (typeof brut.table !== 'string' || !motif.test(brut.table)) { avertissements.push('bulle.liste.table : l’identifiant de la table liée est attendu (une couche de type « table »), liste ignorée'); return null; }
  if (typeof brut.cle !== 'string' || !brut.cle) { avertissements.push('bulle.liste.cle : le champ de la table qui porte la clé est attendu, liste ignorée'); return null; }
  const champs = [];
  if (Array.isArray(brut.champs)) {
    brut.champs.forEach((c, i) => {
      if (!estObjet(c) || typeof c.champ !== 'string' || !c.champ) { avertissements.push(`bulle.liste.champs[${i}] : { champ: « nom » } attendu, ignoré`); return; }
      if (champs.length >= CHAMPS_MAX) { if (champs.length === CHAMPS_MAX) avertissements.push(`bulle.liste.champs : ${CHAMPS_MAX} au plus, les suivants sont ignorés`); champs.push(null); return; }
      const format = FORMATS.includes(c.format) ? c.format : 'texte';
      champs.push({ champ: c.champ, libelle: typeof c.libelle === 'string' && c.libelle.trim() ? coupe(c.libelle.trim(), LONGUEUR_LIBELLE) : c.champ, format });
    });
  }
  const gardes = champs.filter(Boolean);
  if (!gardes.length) { avertissements.push('bulle.liste.champs : au moins un champ est attendu, liste ignorée'); return null; }
  const max = Number.isFinite(brut.max) ? Math.min(Math.max(1, Math.floor(brut.max)), MAX_AFFICHE) : 5;
  if (brut.max !== undefined && max !== brut.max) avertissements.push(`bulle.liste.max : entre 1 et ${MAX_AFFICHE}, ramené à ${max}`);
  let ordre = 'desc';
  if (brut.ordre !== undefined) { if (brut.ordre === 'asc' || brut.ordre === 'desc') ordre = brut.ordre; else avertissements.push('bulle.liste.ordre : « asc » ou « desc » attendu, « desc » gardé'); }
  return {
    table: brut.table, cle: brut.cle, valeur: typeof brut.valeur === 'string' && brut.valeur ? brut.valeur : null,
    champs: gardes, tri: typeof brut.tri === 'string' && brut.tri ? brut.tri : null, ordre, max,
    titre: typeof brut.titre === 'string' && brut.titre.trim() ? coupe(brut.titre.trim(), LONGUEUR_LIBELLE) : 'Historique',
  };
}

/** Une valeur lisible selon son format ; `''` quand il n'y a rien à montrer. */
export function formater(valeur, format = 'texte') {
  if (valeur === undefined || valeur === null || valeur === '') return '';
  if (typeof valeur === 'object') return '';
  if (format === 'nombre' || format === 'pourcent') {
    const n = typeof valeur === 'number' ? valeur : Number(String(valeur).replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(n)) return coupe(valeur, LONGUEUR_VALEUR);
    if (format === 'pourcent') return nombreFr(n * 100) + ' %';
    return nombreFr(n);
  }
  if (format === 'date') {
    const t = typeof valeur === 'number' ? (Math.abs(valeur) < 1e11 ? valeur * 1000 : valeur) : Date.parse(String(valeur));   // secondes (Grist) ou millisecondes
    const d = new Date(t);
    if (!Number.isFinite(d.getTime())) return coupe(valeur, LONGUEUR_VALEUR);
    return d.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
  }
  return coupe(valeur, LONGUEUR_VALEUR);
}
function nombreFr(n) { return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n); }

const MODELE = /\{([^{}]{1,60})\}/g;

/** Le contenu à afficher (tout en texte) pour un objet. */
export function contenuBulle(bulle, proprietes, nomCouche = '', tables = null, cleCouche = null) {
  const p = estObjet(proprietes) ? proprietes : {};
  const texte = (k) => formater(p[k], 'texte');
  let titre = '';
  if (bulle.titre) titre = bulle.titre.includes('{') ? bulle.titre.replace(MODELE, (_, k) => texte(k.trim())).replace(/\s+/g, ' ').trim() : texte(bulle.titre);
  if (!titre) titre = String(nomCouche || '');
  const lignes = [];
  for (const c of bulle.champs) { const v = formater(p[c.champ], c.format); if (v) lignes.push({ libelle: c.libelle, valeur: v }); }
  let liste = null;
  if (bulle.liste) {   // l’historique : les lignes de la table liée dont la clé vaut la propriété de l’objet
    const l = bulle.liste, lignesTable = tables && (tables instanceof Map ? tables.get(l.table) : tables[l.table]);
    if (Array.isArray(lignesTable)) {
      const trouvees = lignesLiees(lignesTable, { cle: l.cle, valeur: p[l.valeur || cleCouche], tri: l.tri, ordre: l.ordre, max: l.max });
      liste = { titre: l.titre, entetes: l.champs.map((c) => c.libelle), lignes: trouvees.lignes.map((r) => l.champs.map((c) => formater(r[c.champ], c.format))), total: trouvees.total };
    }
  }
  return { titre: coupe(titre, 160), lignes, actions: bulle.actions.map((a) => ({ ...a })), ...(liste ? { liste } : {}) };
}

/** Le point où ancrer la bulle d'une géométrie : le point lui-même, ou le centre de l'emprise. */
export function pointAncrage(geometrie) {
  if (!estObjet(geometrie)) return null;
  if (geometrie.type === 'Point' && Array.isArray(geometrie.coordinates) && geometrie.coordinates.length >= 2) return [geometrie.coordinates[0], geometrie.coordinates[1]];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const parcourir = (a) => { if (!Array.isArray(a)) return; if (typeof a[0] === 'number' && typeof a[1] === 'number') { x0 = Math.min(x0, a[0]); x1 = Math.max(x1, a[0]); y0 = Math.min(y0, a[1]); y1 = Math.max(y1, a[1]); return; } for (const x of a) parcourir(x); };
  parcourir(geometrie.coordinates);
  return x0 === Infinity ? null : [(x0 + x1) / 2, (y0 + y1) / 2];
}

/** Préfixe `atlas-bi-bulle` : l'application a déjà ses propres `.atlas-bulle*` (lib/bulle-objet.js), chargées dans la même page. */
const STYLE_ID = 'atlas-bi-bulle-style';
/** Feuille de style de la bulle : tout en variables `--atlas-*` (la charte de l'hôte), rien de figé. */
export const FEUILLE = `
.atlas-bi-bulle-popup { z-index: 5; }
.atlas-bi-bulle-popup .maplibregl-popup-content { padding: 0; background: var(--atlas-fond, #fff); color: var(--atlas-encre, #1f1b14); border: 1px solid var(--atlas-bord, #d8d6d2); border-radius: 10px; box-shadow: 0 6px 22px rgba(0, 0, 0, .18); font-family: var(--atlas-police, system-ui, sans-serif); font-size: var(--atlas-taille-texte, 13px); line-height: 1.35; min-width: 190px; max-width: 320px; }
.atlas-bi-bulle-popup .maplibregl-popup-tip { display: none; }
.atlas-bi-bulle { padding: 10px 12px 12px; }
.atlas-bi-bulle-tete { display: flex; align-items: flex-start; gap: 8px; }
.atlas-bi-bulle-titre { flex: 1; font-weight: 600; font-size: calc(var(--atlas-taille-texte, 13px) + 1px); overflow-wrap: anywhere; }
.atlas-bi-bulle-fermer { flex: none; border: 0; background: transparent; color: var(--atlas-discret, #6b6760); font: inherit; font-size: 18px; line-height: 1; padding: 0 2px; cursor: pointer; border-radius: 4px; }
.atlas-bi-bulle-fermer:hover { background: var(--atlas-survol, #efede9); }
.atlas-bi-bulle-champs { margin: 8px 0 0; display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; }
.atlas-bi-bulle-champs dt { color: var(--atlas-discret, #6b6760); font-size: var(--atlas-taille-petit, 12px); }
.atlas-bi-bulle-champs dd { margin: 0; overflow-wrap: anywhere; }
.atlas-bi-bulle-liste { margin-top: 10px; }
.atlas-bi-bulle-liste-titre { font-weight: 600; font-size: var(--atlas-taille-petit, 12px); color: var(--atlas-discret, #6b6760); margin-bottom: 3px; }
.atlas-bi-bulle-liste table { border-collapse: collapse; width: 100%; font-size: var(--atlas-taille-petit, 12px); }
.atlas-bi-bulle-liste th { text-align: left; font-weight: 500; color: var(--atlas-discret, #6b6760); padding: 1px 8px 2px 0; border-bottom: 1px solid var(--atlas-bord, #d8d6d2); }
.atlas-bi-bulle-liste td { padding: 2px 8px 2px 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.atlas-bi-bulle-liste-vide, .atlas-bi-bulle-liste-reste { color: var(--atlas-discret, #6b6760); font-size: var(--atlas-taille-petit, 12px); margin-top: 3px; }
.atlas-bi-bulle-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.atlas-bi-bulle-action { font: inherit; font-weight: 600; padding: 5px 10px; border-radius: 6px; cursor: pointer; border: 1px solid var(--atlas-accent-lisible, #c44536); background: transparent; color: var(--atlas-accent-lisible, #c44536); }
.atlas-bi-bulle-action.principale { background: var(--atlas-accent, #c44536); color: var(--atlas-sur-accent, #fff); }
.atlas-bi-bulle-action:hover { filter: brightness(.94); }
.atlas-bi-bulle button:focus-visible { outline: 2px solid var(--atlas-selection, #1f1b14); outline-offset: 2px; }
@media (prefers-reduced-motion: no-preference) { .atlas-bi-bulle-popup { animation: atlas-bi-bulle-entree .12s ease-out; } }
/* l'entrée n'anime QUE l'opacité : MapLibre positionne la bulle par transform sur ce même élément, une animation de transform la ramenait à l'origine de la carte le temps de l'animation */
@keyframes atlas-bi-bulle-entree { from { opacity: 0; } to { opacity: 1; } }
`;

/**
 * Le contrôleur de la bulle d'une carte.
 * @param {{ map: object, document?: Document, creerPopup: () => object, emettre: Function, variables: () => Record<string,string>, appliquer?: Function, quandFermee?: Function }} o
 *   `creerPopup()` rend un objet de type MapLibre `Popup` (`setLngLat`, `setDOMContent`, `addTo`, `remove`, `getElement`, `isOpen`) ;
 *   `variables()` rend les variables CSS de la charte ; `appliquer(element, variables)` les écrit ; `marges()` rend les marges de l'hôte (zone utile) ;
 *   `quandFermee()` est appelée quand la PERSONNE ferme la bulle.
 */
export function creerBulle({ map, document: doc = globalThis.document, creerPopup, emettre, variables, appliquer, marges = () => null, quandFermee = () => {}, tables = () => null }) {
  let popup = null, courante = null, contenuRacine = null, derniere = null;
  const ecrire = (el) => { if (!el || !appliquer) return; try { appliquer(el, variables()); } catch (_) { /* variables illisibles : les valeurs de repli de la feuille s'appliquent */ } };
  function feuille() {
    if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
    const s = doc.createElement('style'); s.id = STYLE_ID; s.textContent = FEUILLE; doc.head.appendChild(s);
  }
  function construire(contenu, c, f) {
    const racine = doc.createElement('div'); racine.className = 'atlas-bi-bulle'; racine.setAttribute('role', 'dialog'); racine.setAttribute('aria-label', contenu.titre || 'Objet');
    const tete = doc.createElement('div'); tete.className = 'atlas-bi-bulle-tete';
    const t = doc.createElement('div'); t.className = 'atlas-bi-bulle-titre'; t.textContent = contenu.titre; tete.appendChild(t);
    const x = doc.createElement('button'); x.type = 'button'; x.className = 'atlas-bi-bulle-fermer'; x.setAttribute('aria-label', 'Fermer'); x.textContent = '×';
    x.addEventListener('click', () => { fermer(); quandFermee(); }); tete.appendChild(x); racine.appendChild(tete);
    if (contenu.lignes.length) {
      const dl = doc.createElement('dl'); dl.className = 'atlas-bi-bulle-champs';
      for (const l of contenu.lignes) { const dt = doc.createElement('dt'); dt.textContent = l.libelle; const dd = doc.createElement('dd'); dd.textContent = l.valeur; dl.appendChild(dt); dl.appendChild(dd); }
      racine.appendChild(dl);
    }
    if (contenu.liste) {
      const sec = doc.createElement('div'); sec.className = 'atlas-bi-bulle-liste';
      const tt = doc.createElement('div'); tt.className = 'atlas-bi-bulle-liste-titre'; tt.textContent = contenu.liste.titre; sec.appendChild(tt);
      if (!contenu.liste.lignes.length) { const v = doc.createElement('div'); v.className = 'atlas-bi-bulle-liste-vide'; v.textContent = 'Aucune ligne'; sec.appendChild(v); }
      else {
        const tab = doc.createElement('table'); const th = doc.createElement('thead'), tr0 = doc.createElement('tr');
        for (const e of contenu.liste.entetes) { const c = doc.createElement('th'); c.scope = 'col'; c.textContent = e; tr0.appendChild(c); }
        th.appendChild(tr0); tab.appendChild(th);
        const tb = doc.createElement('tbody');
        for (const ligne of contenu.liste.lignes) { const tr = doc.createElement('tr'); for (const v of ligne) { const td = doc.createElement('td'); td.textContent = v; tr.appendChild(td); } tb.appendChild(tr); }
        tab.appendChild(tb); sec.appendChild(tab);
        const reste = contenu.liste.total - contenu.liste.lignes.length;
        if (reste > 0) { const r = doc.createElement('div'); r.className = 'atlas-bi-bulle-liste-reste'; r.textContent = '+ ' + reste + (reste > 1 ? ' autres lignes' : ' autre ligne'); sec.appendChild(r); }
      }
      racine.appendChild(sec);
    }
    if (contenu.actions.length) {
      const bloc = doc.createElement('div'); bloc.className = 'atlas-bi-bulle-actions';
      for (const a of contenu.actions) {
        const b = doc.createElement('button'); b.type = 'button'; b.className = 'atlas-bi-bulle-action ' + a.style; b.textContent = a.libelle;
        b.addEventListener('click', () => emettre('action', { layer: c.id, featureId: f.id, key: c.def.cle ? (f.properties || {})[c.def.cle] : undefined, actionId: a.id }, 'utilisateur'));
        bloc.appendChild(b);
      }
      racine.appendChild(bloc);
    }
    racine.addEventListener('keydown', (e) => { if (e.key === 'Escape') { fermer(); quandFermee(); } });
    return racine;
  }
  /** Ouvre la bulle de l'entité `f` de la couche `c` (qui doit porter `c.bulle`). `lngLat` : le point cliqué, pour une ligne ou une surface. */
  function ouvrir(c, f, lngLat = null) {
    if (!c || !c.bulle || !f || c.bulle.ouverture === 'aucune' || !doc || typeof creerPopup !== 'function') { fermer(); return false; }
    const ancre = f.geometry && f.geometry.type === 'Point' ? pointAncrage(f.geometry) : (lngLat ? [lngLat.lng, lngLat.lat] : pointAncrage(f.geometry));
    if (!ancre) { fermer(); return false; }
    feuille();
    const ancienne = courante;
    const contenu = contenuBulle(c.bulle, f.properties, c.def.name || c.id, tables(), c.def.cle);
    contenuRacine = construire(contenu, c, f); derniere = { c, f };
    if (!popup) popup = creerPopup();
    popup.setLngLat(ancre).setDOMContent(contenuRacine);
    if (!popup.isOpen || !popup.isOpen()) popup.addTo(map);
    ecrire(popup.getElement && popup.getElement());
    courante = { layer: c.id, featureId: f.id };
    planifierAjustement();
    const autre = !ancienne || ancienne.layer !== courante.layer || ancienne.featureId !== courante.featureId;
    if (autre && ancienne) emettre('bulle', { etat: 'fermee', ...ancienne }, 'utilisateur');   // des paires ouverte/fermee, même quand la bulle passe d'un objet à l'autre
    if (autre) emettre('bulle', { etat: 'ouverte', ...courante }, 'utilisateur');
    return true;
  }
  /** Les lignes d’une table liée ont changé : le contenu de la bulle ouverte est refait, sur place (aucun événement : c’est la même bulle). */
  function rafraichir() {
    if (!popup || !courante || !derniere) return false;
    const { c, f } = derniere;
    contenuRacine = construire(contenuBulle(c.bulle, f.properties, c.def.name || c.id, tables(), c.def.cle), c, f);
    popup.setDOMContent(contenuRacine); ecrire(popup.getElement && popup.getElement()); planifierAjustement(); return true;
  }
  function fermer() {
    if (!courante) { if (popup && popup.isOpen && popup.isOpen()) popup.remove(); return false; }
    const c = courante; courante = null; contenuRacine = null;
    if (popup) popup.remove();
    emettre('bulle', { etat: 'fermee', ...c }, 'utilisateur');
    return true;
  }
  /**
   * La bulle reste dans la zone utile (la carte moins les marges de l'hôte) : sans cela, elle s'ouvrait sous le panneau de l'hôte quand l'objet est près de son bord.
   * Un simple décalage visuel du contenu (le positionnement de MapLibre n'est pas touché) ; recalculé quand la carte s'arrête de bouger.
   */
  function ajuster() {
    const el = popup && courante && popup.getElement && popup.getElement(); const contenu = el && el.querySelector && el.querySelector('.maplibregl-popup-content');
    const conteneur = map && map.getContainer && map.getContainer();
    if (!contenu || !conteneur || !contenu.getBoundingClientRect) return;
    contenu.style.transform = '';
    const r = contenu.getBoundingClientRect(), c = conteneur.getBoundingClientRect();
    const { dx, dy } = decalageDansZone({ left: r.left - c.left, right: r.right - c.left, top: r.top - c.top, bottom: r.bottom - c.top }, { largeur: c.width, hauteur: c.height }, marges());
    if (dx || dy) contenu.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  // MapLibre place la bulle au rendu suivant : mesurée tout de suite, elle est encore à l'origine du conteneur (constaté en navigateur). On recalcule donc après la mise en page.
  function planifierAjustement() {
    ajuster();
    const raf = (doc && doc.defaultView && doc.defaultView.requestAnimationFrame) || (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);
    if (raf) raf(() => raf(ajuster));
    setTimeout(ajuster, 120);
  }
  if (map && typeof map.on === 'function') map.on('moveend', ajuster);

  /** La charte a changé : les variables sont réécrites sur la bulle ouverte. */
  function actualiser() { if (popup && courante) ecrire(popup.getElement && popup.getElement()); }
  return { ouvrir, fermer, rafraichir, actualiser, ajuster, ouverte: () => (courante ? { ...courante } : null) };
}

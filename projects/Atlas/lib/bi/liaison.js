/**
 * Liaison du composant carte BI avec la page hôte : lecture des paramètres d'URL, liste blanche d'origines, pont
 * `postMessage`, montage du runtime sur la carte d'Atlas.
 *
 * SÉCURITÉ. Le composant ne parle qu'aux origines déclarées :
 *  - une origine est déclarée par `?hote=<origine>` (répétable) ou par la configuration de la page (voir `lireHotes`) ;
 *  - AUCUN joker : `*` est refusé, une origine doit être `http(s)://hôte[:port]` exacte, sans chemin ;
 *  - tant qu'aucune origine n'est déclarée, le composant n'accepte rien et n'envoie rien : l'origine du parent n'est pas
 *    présumée de confiance ;
 *  - les messages (`ready`, résultats, événements) ne sont émis qu'avec une `targetOrigin` précise, jamais `*` : un autre
 *    site qui aurait embarqué la page ne reçoit rien ;
 *  - quand la configuration déclare des hôtes, `?hote=` est ignoré (liste fermée par l'hébergeur).
 */
import { attacher } from './bi-runtime.js';
import { installerClavier } from './clavier-runtime.js';
import { creerPont, VERSION, VERSIONS_ACCEPTEES } from './pont.js';

/** Vrai quand l'URL demande le mode composant : `?bi=1` (ou `true`). */
export function biDemande(search = '') {
  const v = new URLSearchParams(String(search || '').replace(/^\?/, '')).get('bi');
  return v === '1' || v === 'true';
}

/** « https://hote.example:8443/ » -> « https://hote.example:8443 » ; null si l'entrée n'est pas une origine http(s) exacte. */
export function normaliserOrigine(brut) {
  if (typeof brut !== 'string') return null;
  const s = brut.trim();
  if (!s || s.includes('*')) return null;
  let u; try { u = new URL(s); } catch (e) { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password || u.search || u.hash || (u.pathname && u.pathname !== '/')) return null;
  return u.origin;
}

/**
 * Origines d'hôte autorisées.
 * @param {string} search  location.search
 * @param {{hotes?:string[]}|null} [config]  configuration de la page (`window.ATLAS_BI` ou `<meta name="atlas-bi-hotes">`),
 *   qui, si elle déclare au moins une origine valide, fait seule autorité
 * @returns {{hotes:string[], source:'configuration'|'url'|'aucune', rejetees:string[]}}
 */
export function lireHotes(search = '', config = null) {
  const rejetees = [];
  const trier = (liste) => { const ok = []; for (const b of liste) { const o = normaliserOrigine(b); if (o) { if (!ok.includes(o)) ok.push(o); } else rejetees.push(String(b)); } return ok; };
  const deConfig = trier(Array.isArray(config && config.hotes) ? config.hotes : []);
  if (deConfig.length) return { hotes: deConfig, source: 'configuration', rejetees };
  const deUrl = trier(new URLSearchParams(String(search || '').replace(/^\?/, '')).getAll('hote'));
  return { hotes: deUrl, source: deUrl.length ? 'url' : 'aucune', rejetees };
}

/**
 * Configuration posée par la page : `window.ATLAS_BI.hotes` ou `<meta name="atlas-bi-hotes" content="https://a.example https://b.example">`, et
 * `window.ATLAS_BI.charte` (une charte graphique, voir docs/CONTRAT-CHARTE-ATLAS.md). La page de configuration est celle de l'hébergeur d'Atlas, la même
 * qui fait autorité sur la liste d'origines du pont : la charte y est lue de la même façon, puis assainie comme toute charte. Elle ne se charge JAMAIS
 * par adresse.
 */
export function configurationPage(fenetre = globalThis.window, doc = globalThis.document) {
  const hotes = [];
  if (fenetre && fenetre.ATLAS_BI && Array.isArray(fenetre.ATLAS_BI.hotes)) hotes.push(...fenetre.ATLAS_BI.hotes);
  const meta = doc && doc.querySelector && doc.querySelector('meta[name="atlas-bi-hotes"]');
  if (meta && meta.content) hotes.push(...meta.content.split(/[\s,]+/).filter(Boolean));
  const charte = fenetre && fenetre.ATLAS_BI && fenetre.ATLAS_BI.charte && typeof fenetre.ATLAS_BI.charte === 'object' ? fenetre.ATLAS_BI.charte : null;
  return { hotes, charte };
}

/**
 * Relie le runtime à la page hôte par `postMessage`.
 * @param {object} rt  retour de `attacher`
 * @param {{cible:{postMessage:Function}, fenetre:{addEventListener:Function, removeEventListener?:Function}, autorisees:string[], journal?:Console}} o
 *   `cible` : la fenêtre parente (seule source écoutée) ; `fenetre` : la fenêtre du composant
 */
export function installerPont(rt, { cible, fenetre, autorisees = [], journal = null } = {}) {
  const liste = [...new Set(autorisees.map(normaliserOrigine).filter(Boolean))];
  let origineHote = null; const refus = { n: 0, dernier: null };
  const envoyer = (m) => { for (const o of (origineHote ? [origineHote] : liste)) { try { cible.postMessage(m, o); } catch (e) { /* hôte absent */ } } };
  const pont = creerPont({ api: rt.api, envoyer, autorisees: liste, surRefus: (r) => { refus.n++; refus.dernier = r; if (journal && journal.warn && refus.n <= 3) journal.warn('[Atlas BI] message refusé : ' + r.erreur + " (déclarer l'hôte avec ?hote=<origine>)"); } });
  rt.brancherEmetteur((type, charge, origine) => pont.emettre(type, charge, origine));
  const ecouteur = (e) => {
    if (!e || e.source !== cible) return;           // seul le parent est écouté
    if (liste.includes(e.origin)) origineHote = e.origin;   // les réponses suivent l'origine qui vient de parler
    // une charge hostile ne doit pas laisser de promesse rejetée non gérée : le pont répond ou se tait, il ne plante pas
    Promise.resolve().then(() => pont.recevoir(e.data, e.origin)).catch((err) => { if (journal && journal.warn) journal.warn('[Atlas BI] message ignoré : ' + (err && err.message)); });
  };
  fenetre.addEventListener('message', ecouteur);
  return {
    pont, hotes: liste, refus,
    /** Annonce le composant prêt aux seules origines déclarées (rien n'est envoyé si la liste est vide). */
    annoncer: (charge = {}) => pont.emettre('ready', { runtime: true, version: VERSION, versions: [...VERSIONS_ACCEPTEES], ...charge }, 'api'),
    desinstaller: () => { if (fenetre.removeEventListener) fenetre.removeEventListener('message', ecouteur); rt.brancherEmetteur(() => {}); },
  };
}

/**
 * Monte le composant : attache le runtime à la carte d'Atlas, installe le clavier et le pont, annonce `ready`.
 * Appelée par `app_v7.js` quand `?bi=1` est présent (import dynamique de ce module : rien n'est chargé sans ce paramètre).
 * @param {{carte:object, fenetre:Window, document?:Document, search?:string, journal?:Console}} o
 */
export function monter({ carte, fenetre, document: doc = fenetre.document, search = fenetre.location.search, journal = console }) {
  const config = configurationPage(fenetre, doc);
  const { hotes, source, rejetees } = lireHotes(search, config);
  for (const r of rejetees) journal.warn('[Atlas BI] origine d\'hôte refusée (http(s)://hôte[:port] exact attendu, pas de joker) : ' + r);
  if (!hotes.length) journal.warn('[Atlas BI] aucun hôte déclaré : le composant ne répondra à personne. Ajouter ?hote=<origine de la page hôte>.');
  const rt = attacher(carte, config.charte ? { theme: config.charte } : {});   // la charte de la page, puis celles de l'hôte par `setTheme`
  const liaison = installerPont(rt, { cible: fenetre.parent, fenetre, autorisees: hotes, journal });
  fenetre.__bi = rt;
  const clavier = installerClavier(rt, { conteneur: carte.getCanvasContainer(), document: doc });
  fenetre.__clavier = clavier;
  liaison.annoncer({ hotes: source });
  return { rt, liaison, clavier, hotes, source };
}

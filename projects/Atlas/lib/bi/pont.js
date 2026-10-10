/**
 * Pont hôte <-> composant carte : enveloppes, validation, anti-boucle. Module pur (le transport est injecté).
 *
 * Deux sens :
 *  - l'hôte envoie des COMMANDES  { source:'hote-bi',   version, id, cmd, args }
 *  - le composant renvoie des RÉSULTATS { source:'atlas-bi', version, type:'resultat', id, ok, valeur|erreur }
 *    et des ÉVÉNEMENTS                  { source:'atlas-bi', version, type, charge, origine }
 * `origine` d'un événement vaut 'utilisateur' (geste dans la carte) ou 'api' (effet d'une commande de l'hôte) : l'hôte
 * ignore les 'api' qu'il a lui-même provoqués, ce qui supprime les boucles.
 */
import { verifierTaille } from '../charte/schema.js';

export const VERSION = '0.3';
/** Versions d'hôte acceptées : la 0.3 n'ajoute que des commandes et des événements, une 0.2 reste servie pour ses 19 commandes. */
export const VERSIONS_ACCEPTEES = Object.freeze(['0.2', '0.3']);
export const SOURCE_RUNTIME = 'atlas-bi';
export const SOURCE_HOTE = 'hote-bi';

/** Commandes connues : nom -> arguments (type, obligatoire). Types : string, number, boolean, object, array, any. */
export const COMMANDES = Object.freeze({
  ping: [],
  setScene: [['object', true], ['object', false]],
  setLayerVisibility: [['string', true], ['boolean', true]],
  setFilter: [['string', true], ['any', true]],
  setTime: [['any', true]],
  play: [['object', false]],
  pause: [],
  select: [['any', true]],
  highlight: [['array', true]],
  flyTo: [['object', true]],
  fitTo: [['any', false]],
  setTheme: [['object', true], ['object', false]],
  setVisual: [['string', true], ['object', true]],
  updateFeature: [['string', true], ['any', true], ['object', true]],
  setEdition: [['string', true], ['boolean', true]],
  setFond: [['string', true], ['object', false]],
  getLegend: [['string', false]],
  getRows: [['string', false], ['object', false]],
  resize: [],
  // --- contrat 0.3 : couches administratives et lot d'ordres ---
  addAdminLayer: [['string', true], ['object', false]],
  removeLayer: [['string', true]],
  setChoropleth: [['string', true], ['object', true]],
  setStatistique: [['string', true], ['object', true]],
  drillDown: [['string', true], ['string', true], ['object', false]],
  drillUp: [],
  setDrillAuto: [['any', false]],
  setUnitFilter: [['string', true], ['string', true], ['any', true]],
  batch: [['array', true], ['object', false]],
  setHorsLigne: [['any', true]],
  getTheme: [],
});
/** Commandes ajoutées par la 0.3 (une commande 0.3 envoyée avec la version 0.2 est refusée). */
export const COMMANDES_0_3 = Object.freeze(['addAdminLayer', 'removeLayer', 'setChoropleth', 'setStatistique', 'drillDown', 'drillUp', 'setDrillAuto', 'setUnitFilter', 'batch', 'setHorsLigne', 'getTheme']);
export const BATCH_MAX = 100;

/**
 * Capacités d'un chargement du composant (extension additive du contrat 0.3). Une capacité est une brique d'usage ; un chargement
 * peut n'en contenir que certaines. `ready` les annonce (`capacites`, triées), une commande qui relève d'une brique absente répond
 * `capacite_absente`. Les autres briques d'Atlas (reseau, 3d, terrain, donnees-ouvertes) n'ont aucune commande dans ce contrat : elles
 * ne sont pas annoncées, le nom reste réservé.
 */
export const CAPACITES = Object.freeze(['edition', 'points', 'socle', 'temps', 'territoires']);
/** Brique dont dépend chaque commande. `socle` : ce qui vaut pour toute scène (carte, thème, fond, cadrage, couches, filtres, sélection). */
export const CAPACITE_DE_COMMANDE = Object.freeze({
  ping: 'socle', setScene: 'socle', setLayerVisibility: 'socle', setFilter: 'socle', select: 'socle', highlight: 'socle', flyTo: 'socle', fitTo: 'socle',
  setTheme: 'socle', setFond: 'socle', getTheme: 'socle', getLegend: 'socle', getRows: 'socle', resize: 'socle', setHorsLigne: 'socle', batch: 'socle',
  setVisual: 'points',
  setTime: 'temps', play: 'temps', pause: 'temps',
  setEdition: 'edition', updateFeature: 'edition',
  addAdminLayer: 'territoires', removeLayer: 'territoires', setChoropleth: 'territoires', setStatistique: 'territoires', drillDown: 'territoires', drillUp: 'territoires', setDrillAuto: 'territoires', setUnitFilter: 'territoires',
});

/** Erreur d'une commande ou d'un type de couche dont la brique n'est pas dans ce chargement. */
export class ErreurCapacite extends Error {
  constructor(capacite, cible) {
    super('capacite_absente : ' + cible + ' demande la capacité « ' + capacite + ' », absente de ce chargement du composant');
    this.name = 'ErreurCapacite'; this.code = 'capacite_absente'; this.capacite = capacite;
  }
}

/** Liste de capacités valide : sous-ensemble de `CAPACITES`, sans doublon, trié. Une valeur absente donne toutes les capacités ; un nom inconnu lève. */
export function normaliserCapacites(liste) {
  if (liste === undefined || liste === null) return [...CAPACITES];
  if (!Array.isArray(liste)) throw new Error('capacites : tableau attendu');
  for (const c of liste) if (!CAPACITES.includes(c)) throw new Error('capacite inconnue : ' + String(c).slice(0, 40));
  return [...new Set(liste)].sort();
}

/**
 * Enveloppe une API : une fonction dont la brique est absente lève `ErreurCapacite` AVANT de s'exécuter. Les noms hors `CAPACITE_DE_COMMANDE` passent tels quels.
 * @param {object} api
 * @param {string[]} capacites  liste normalisée
 */
export function garderApi(api, capacites) {
  const presentes = new Set(capacites); const garde = {};
  for (const nom of Object.keys(api)) {
    const cap = CAPACITE_DE_COMMANDE[nom];
    garde[nom] = typeof api[nom] === 'function' && cap && !presentes.has(cap)
      ? () => { throw new ErreurCapacite(cap, nom); }
      : api[nom];
  }
  return garde;
}

/** Une commande du contrat, en propriété PROPRE : `constructor`, `__proto__`, `toString`... hérités d'Object.prototype ne sont pas des commandes. */
export const estCommande = (c) => typeof c === 'string' && Object.prototype.hasOwnProperty.call(COMMANDES, c);

export const EVENEMENTS = Object.freeze(['ready', 'error', 'select', 'hover', 'filter', 'camera', 'time', 'legend', 'edit', 'layer', 'progress', 'drill', 'statistique', 'connexion', 'theme']);

/** Les versions sont compatibles si majeure et mineure sont égales (0.x : toute évolution de mineure peut casser). */
export function versionsCompatibles(a, b = VERSION) {
  const p = (v) => (typeof v === 'string' ? v : '').split('.').map((x) => Number(x)); const [a1, a2] = p(a), [b1, b2] = p(b);
  return Number.isFinite(a1) && Number.isFinite(a2) && a1 === b1 && a2 === b2;
}

const typeDe = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
function typeOk(attendu, v) { if (attendu === 'any') return true; return typeDe(v) === attendu; }

/** Valide les arguments d'une commande ; renvoie un message d'erreur ou null. */
export function validerArguments(cmd, args) {
  const schema = COMMANDES[cmd];
  for (let i = 0; i < schema.length; i++) {
    const [type, oblig] = schema[i];
    if (args[i] === undefined) { if (oblig) return cmd + ' : argument ' + (i + 1) + ' manquant'; continue; }
    if (!typeOk(type, args[i])) return cmd + ' : argument ' + (i + 1) + ' attendu ' + type + ', reçu ' + typeDe(args[i]);
  }
  if (args.length > schema.length) return cmd + " : trop d'arguments";
  // une charte ou des jetons de fond viennent de l'extérieur : leur taille est bornée avant tout traitement (voir `verifierTaille`)
  const taille = cmd === 'setTheme' ? verifierTaille(args[0]) : cmd === 'setFond' && args[1] !== undefined ? verifierTaille(args[1]) : null;
  if (taille) return cmd + ' : ' + taille;
  return null;
}

/**
 * Exécute un lot d'ordres [{ cmd, args }] dans l'ordre, côté composant : un seul aller-retour au lieu de n.
 * Chaque ordre est validé comme une commande isolée ; `batch` ne s'imbrique pas ; 100 ordres au plus.
 * @param {object} api  objet de fonctions
 * @param {object[]} ordres
 * @param {{arret?:'erreur'|'continuer'}} o  arret : « erreur » (défaut) interrompt au premier échec, les suivants sont « non exécuté »
 * @returns {Promise<{ok:number, ko:number, nonExecutes:number, resultats:object[]}>}
 */
export async function executerBatch(api, ordres, o = {}) {
  const arret = o.arret || 'erreur';
  if (!Array.isArray(ordres)) throw new Error("batch : liste d'ordres attendue");
  if (ordres.length > BATCH_MAX) throw new Error('batch : ' + BATCH_MAX + ' ordres au plus (reçu ' + ordres.length + ')');
  const resultats = []; let ok = 0, ko = 0, stop = false;
  for (let i = 0; i < ordres.length; i++) {
    const ordre = ordres[i];
    if (stop) { resultats.push({ i, ok: false, nonExecute: true }); continue; }
    let err = null, errCapacite = null;
    if (!ordre || typeof ordre !== 'object' || typeof ordre.cmd !== 'string') err = 'ordre ' + i + ' : forme invalide';
    else if (ordre.cmd === 'batch') err = 'ordre ' + i + " : batch ne s'imbrique pas";
    else if (!estCommande(ordre.cmd) || typeof api[ordre.cmd] !== 'function') err = 'ordre ' + i + ' : commande inconnue : ' + ordre.cmd;
    else err = validerArguments(ordre.cmd, Array.isArray(ordre.args) ? ordre.args : []);
    if (!err) {
      try { const valeur = await api[ordre.cmd](...(ordre.args || [])); resultats.push({ i, cmd: ordre.cmd, ok: true, valeur: valeur === undefined ? null : valeur }); ok++; continue; }
      catch (e) { err = e && e.message ? e.message : String(e); if (e instanceof ErreurCapacite) errCapacite = e; }
    }
    resultats.push({ i, cmd: ordre && ordre.cmd, ok: false, erreur: err, ...(errCapacite ? { code: 'capacite_absente', capacite: errCapacite.capacite } : {}) }); ko++; if (arret === 'erreur') stop = true;
  }
  return { ok, ko, nonExecutes: resultats.filter((r) => r.nonExecute).length, resultats };
}

/**
 * Valide un message reçu côté composant.
 * @param {*} msg
 * @param {{origine?:string, autorisees?:string[]}} ctx  autorisees : liste d'origines EXACTES (« https://hote.example »).
 *   Aucun joker : `'*'` ne correspond à rien, une origine vide ou absente est refusée, une liste vide refuse tout.
 */
export function validerCommande(msg, { origine = '', autorisees = [] } = {}) {
  if (!msg || typeof msg !== 'object') return { ok: false, code: 'forme', erreur: 'message non objet' };
  if (msg.source !== SOURCE_HOTE) return { ok: false, code: 'source', erreur: 'source inconnue', ignorer: true };
  const ok = typeof origine === 'string' && origine !== '' && origine !== '*' && origine !== 'null' && autorisees.includes(origine);
  if (!ok) return { ok: false, code: 'origine', erreur: 'origine non autorisée : ' + origine };
  if (!VERSIONS_ACCEPTEES.some((v) => versionsCompatibles(msg.version, v))) return { ok: false, code: 'version', erreur: 'version ' + (typeof msg.version === 'string' ? msg.version.slice(0, 32) : typeof msg.version) + ' incompatible avec ' + VERSION };
  if (!estCommande(msg.cmd)) return { ok: false, code: 'commande', erreur: 'commande inconnue : ' + (typeof msg.cmd === 'string' ? msg.cmd.slice(0, 64) : typeof msg.cmd) };
  if (msg.version !== VERSION && COMMANDES_0_3.includes(msg.cmd)) return { ok: false, code: 'version', erreur: msg.cmd + ' demande la version ' + VERSION + ' (reçu ' + msg.version + ')' };
  const args = Array.isArray(msg.args) ? msg.args : [];
  const e = validerArguments(msg.cmd, args); if (e) return { ok: false, code: 'argument', erreur: e };
  return { ok: true, id: msg.id, cmd: msg.cmd, args };
}

export function evenement(type, charge = {}, origine = 'utilisateur') { return { source: SOURCE_RUNTIME, version: VERSION, type, charge, origine }; }
export function resultat(id, ok, valeurOuErreur, extra = null) { return ok ? { source: SOURCE_RUNTIME, version: VERSION, type: 'resultat', id, ok: true, valeur: valeurOuErreur } : { source: SOURCE_RUNTIME, version: VERSION, type: 'resultat', id, ok: false, erreur: String(valeurOuErreur), ...(extra || {}) }; }
export function commande(cmd, args = [], id = null) { return { source: SOURCE_HOTE, version: VERSION, id: id ?? Math.random().toString(36).slice(2, 10), cmd, args }; }

/**
 * Le pont : relie une API (objet de fonctions) à un transport injecté.
 * @param {{api:object, envoyer:(msg:object)=>void, autorisees:string[], surRefus?:(refus:{code:string, origine:string, erreur:string})=>void}} o
 *   `surRefus` est appelé quand un message d'une origine non autorisée est écarté : il reste SANS réponse (rien ne revient
 *   à l'émetteur), le refus ne se lit qu'ici (diagnostic).
 * @returns {{recevoir:(msg:object, origine:string)=>Promise<object|null>, emettre:(type:string, charge?:object, origine?:string)=>void, enCours:()=>boolean}}
 */
export function creerPont({ api, envoyer, autorisees = [], surRefus = () => {} }) {
  let depuisApi = 0; // > 0 pendant l'exécution d'une commande : les événements produits sont marqués 'api'
  return {
    async recevoir(msg, origine) {
      const v = validerCommande(msg, { origine, autorisees });
      if (v.ignorer) return null;
      if (v.code === 'origine') { try { surRefus({ code: v.code, origine: origine, erreur: v.erreur }); } catch (e) { /* diagnostic */ } return null; }
      if (!v.ok) { envoyer(resultat(msg && msg.id, false, v.code + ' : ' + v.erreur)); return null; }
      depuisApi++;
      try { const valeur = await api[v.cmd](...v.args); const r = resultat(v.id, true, valeur === undefined ? null : valeur); envoyer(r); return r; }
      catch (e) { const r = resultat(v.id, false, e && e.message ? e.message : e, e instanceof ErreurCapacite ? { code: e.code, capacite: e.capacite } : null); envoyer(r); return r; }
      finally { depuisApi--; }
    },
    emettre(type, charge = {}, origine) { envoyer(evenement(type, charge, origine ?? (depuisApi > 0 ? 'api' : 'utilisateur'))); },
    enCours: () => depuisApi > 0,
  };
}

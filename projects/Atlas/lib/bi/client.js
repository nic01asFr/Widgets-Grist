/**
 * Client JavaScript du composant carte BI, pour l'application HÔTE (la page qui embarque Atlas dans une iframe).
 *
 * Module sans dépendance au DOM dans son cœur (`creerClient`) : le transport est injecté. `transportFenetre` en fournit un
 * pour une iframe. Ce fichier est autonome côté hôte : il n'importe que `pont.js` (noms des commandes et versions).
 *
 *     const cadre = document.querySelector('iframe');
 *     const client = creerClient({ transport: transportFenetre({ fenetre: window, cadre, origineComposant: 'https://atlas.example' }) });
 *     await client.connecter();
 *     await client.setScene(manifeste, donnees);
 *     client.on('select', (charge) => ...);          // gestes de l'utilisateur dans la carte
 *
 * Garanties :
 *  - chaque commande renvoie une promesse, résolue par l'accusé du composant, rejetée par son erreur ou à l'expiration du
 *    délai maximal (`delai`, défaut 10 s) ;
 *  - les messages d'une origine ou d'une fenêtre inattendue sont écartés (`transportFenetre`), jamais traités ;
 *  - les commandes partent avec une `targetOrigin` précise, jamais `*` ;
 *  - la version du contrat se négocie (0.3, puis 0.2) ; une commande absente de la version retenue est refusée côté hôte ;
 *  - anti-boucle : les événements se filtrent par leur champ `origine` (voir `on`).
 */
import { COMMANDES, COMMANDES_0_3, VERSIONS_ACCEPTEES, SOURCE_RUNTIME, SOURCE_HOTE, versionsCompatibles, estCommande } from './pont.js';

/** Versions que ce client sait parler, de la plus récente à la plus ancienne. */
export const VERSIONS_CLIENT = Object.freeze([...VERSIONS_ACCEPTEES].reverse());

/** Erreur d'une commande. `code` : delai, deconnecte, version, origine, forme, commande, argument, api. */
export class ErreurBi extends Error {
  constructor(code, message, details) { super(message); this.name = 'ErreurBi'; this.code = code; if (details !== undefined) this.details = details; }
}

const CODES_PONT = ['forme', 'source', 'origine', 'version', 'commande', 'argument'];
/** « version : 0.9 incompatible » -> { code:'version', message:'0.9 incompatible' } ; toute autre erreur est celle de l'API (code 'api'). */
export function analyserErreur(texte) {
  const m = /^(\w+) : ([\s\S]*)$/.exec(String(texte));
  return m && CODES_PONT.includes(m[1]) ? { code: m[1], message: m[2] } : { code: 'api', message: String(texte) };
}

/** Plus haute version commune au client et au composant, ou null. */
export function negocierVersion(versionsClient, versionsComposant) {
  for (const v of versionsClient) if ((versionsComposant || []).some((w) => versionsCompatibles(v, w))) return v;
  return null;
}

/** Vrai si `o` est exactement l'origine qu'un navigateur fournit dans `event.origin` (schéma http(s), minuscules, sans chemin ni port par défaut). */
function origineCanonique(o) {
  if (typeof o !== 'string' || !/^https?:\/\//.test(o)) return false;
  try { return new URL(o).origin === o; } catch { return false; }
}

/**
 * Transport pour une iframe : écoute `fenetre`, n'accepte que les messages dont la source est la fenêtre de l'iframe ET
 * dont l'origine est exactement `origineComposant`, et n'envoie qu'à cette origine.
 * @param {{fenetre:Window, cadre:{contentWindow:Window}, origineComposant:string, surRejet?:(raison:string, e:object)=>void}} o
 */
export function transportFenetre({ fenetre, cadre, origineComposant, surRejet = () => {} }) {
  if (!origineCanonique(origineComposant)) throw new ErreurBi('origine', 'origineComposant exacte requise : une origine http(s) sans chemin, en minuscules, ni joker ni « null » (par exemple « https://atlas.example »)');
  return {
    envoyer(msg) { const w = cadre.contentWindow; if (!w) throw new ErreurBi('deconnecte', "l'iframe n'est pas chargée"); w.postMessage(msg, origineComposant); },
    ecouter(rappel) {
      const f = (e) => {
        if (e.source !== cadre.contentWindow) return surRejet('source', e);
        if (e.origin !== origineComposant) return surRejet('origine', e);
        rappel(e.data);
      };
      fenetre.addEventListener('message', f);
      return () => fenetre.removeEventListener('message', f);
    },
  };
}

let compteur = 0;
const nouvelId = () => 'h' + (++compteur).toString(36) + Math.random().toString(36).slice(2, 7);

/**
 * @param {{transport:{envoyer:(msg:object)=>void, ecouter:(rappel:(msg:object)=>void)=>(()=>void)}, delai?:number, delaiConnexion?:number,
 *   intervalle?:number, versions?:string[], minuterie?:{setTimeout:Function, clearTimeout:Function, setInterval:Function, clearInterval:Function}}} o
 *   delai : délai maximal d'une commande (ms) ; delaiConnexion : attente du composant à la connexion ; intervalle : relance du ping
 */
export function creerClient({ transport, delai = 10000, delaiConnexion = 8000, intervalle = 250, versions = VERSIONS_CLIENT, minuterie = globalThis } = {}) {
  const attente = new Map();           // id -> { resolve, reject, minuteur, cmd }
  const ecouteurs = new Map();         // type -> Set({ cb, origine })
  let desinscrire = null, connecte = false, version = null, composant = null, signalPret = null;

  const livrer = (type, charge, meta) => {
    for (const e of ecouteurs.get(type) || []) {
      if (e.origine !== 'tout' && e.origine !== meta.origine) continue;     // anti-boucle : défaut = gestes de l'utilisateur
      try { e.cb(charge, meta); } catch (err) { /* un écouteur ne casse pas le client */ }
    }
  };
  function recevoir(msg) {
    if (!msg || typeof msg !== 'object' || msg.source !== SOURCE_RUNTIME) return;
    if (msg.type === 'resultat') {
      const a = attente.get(msg.id); if (!a) return;
      attente.delete(msg.id); minuterie.clearTimeout(a.minuteur);
      if (msg.ok) a.resolve(msg.valeur);
      else { const { code, message } = analyserErreur(msg.erreur); a.reject(new ErreurBi(code, message, { cmd: a.cmd })); }
      return;
    }
    if (msg.type === 'ready' && msg.charge && msg.charge.runtime === true && signalPret) signalPret(msg.charge);
    livrer(msg.type, msg.charge, { origine: msg.origine, version: msg.version, type: msg.type });
  }
  function demarrerEcoute() { if (!desinscrire) desinscrire = transport.ecouter(recevoir); }

  function envoyerCommande(cmd, args, v, d = delai, ids = null) {
    return new Promise((resolve, reject) => {
      const id = nouvelId(); if (ids) ids.add(id);
      // Le rejet est différé d'un tour : si le fil de l'hôte a été bloqué plus longtemps que le délai, le résultat déjà arrivé et
      // la minuterie échue sont prêts en même temps, et la minuterie passerait la première (faux « délai » sur une commande réussie).
      const minuteur = minuterie.setTimeout(() => {
        minuterie.setTimeout(() => { if (!attente.has(id)) return; attente.delete(id); reject(new ErreurBi('delai', cmd + ' : pas de réponse du composant après ' + d + ' ms', { cmd })); }, 0);
      }, d);
      attente.set(id, { resolve, reject, minuteur, cmd });
      try { transport.envoyer({ source: SOURCE_HOTE, version: v, id, cmd, args }); }
      catch (e) { attente.delete(id); minuterie.clearTimeout(minuteur); reject(e instanceof ErreurBi ? e : new ErreurBi('deconnecte', String((e && e.message) || e), { cmd })); }
    });
  }

  const client = {
    get connecte() { return connecte; },
    get version() { return version; },
    get composant() { return composant; },

    /**
     * Établit la liaison : relance un `ping` jusqu'à l'annonce `ready` ou à une réponse, puis négocie la version.
     * Rejette avec `delai` si le composant ne répond pas (cause usuelle : l'origine de l'hôte n'est pas déclarée au composant
     * par `?hote=`), ou avec `version` s'il ne parle aucune version du client.
     */
    connecter() {
      if (connecte) return Promise.resolve({ version, ...composant });
      demarrerEcoute();
      return new Promise((resolve, reject) => {
        let fini = false; let essai = 0; let timer = null, chien = null; const sondes = new Set();
        const terminer = (err) => {
          if (fini) return; fini = true; signalPret = null; minuterie.clearInterval(timer); minuterie.clearTimeout(chien);
          for (const id of sondes) { const a = attente.get(id); if (a) { minuterie.clearTimeout(a.minuteur); attente.delete(id); } }   // les sondes sans réponse ne doivent rien laisser en attente
          if (err) return reject(err);
          connecte = true; resolve({ version, ...composant });
        };
        const adopter = (charge) => {
          composant = charge || {};
          const v = composant.versions ? negocierVersion(versions, composant.versions) : (composant.version ? negocierVersion(versions, [composant.version]) : versions[0]);
          if (!v) return terminer(new ErreurBi('version', 'aucune version commune : composant ' + JSON.stringify(composant.versions || composant.version) + ', client ' + JSON.stringify(versions)));
          version = v; terminer(null);
        };
        signalPret = adopter;
        const sonde = () => {
          const v = versions[Math.min(essai, versions.length - 1)];
          envoyerCommande('ping', [], v, Math.min(delai, intervalle * 4), sondes).then(
            (r) => { if (!fini) { composant = { ...(composant || {}), ...(r || {}) }; version = v; terminer(null); } },
            (e) => { if (e.code === 'version') essai++; /* sinon : nouvel essai au prochain tour */ });
        };
        chien = minuterie.setTimeout(() => terminer(new ErreurBi('delai', 'le composant ne répond pas après ' + delaiConnexion + " ms : vérifier l'URL, et que l'origine de cet hôte est déclarée au composant (?hote=<origine>)")), delaiConnexion);
        timer = minuterie.setInterval(sonde, intervalle); sonde();
      });
    },

    /** Envoie une commande ; promesse de sa valeur. Avant `connecter()`, la version la plus récente du client est utilisée. */
    appeler(cmd, ...args) {
      if (!estCommande(cmd)) return Promise.reject(new ErreurBi('commande', 'commande inconnue : ' + cmd, { cmd }));
      const v = version || versions[0];
      if (COMMANDES_0_3.includes(cmd) && v !== '0.3') return Promise.reject(new ErreurBi('version', cmd + ' demande la version 0.3 (négociée : ' + v + ')', { cmd }));
      if (!desinscrire) return Promise.reject(new ErreurBi('deconnecte', 'client déconnecté ou non connecté : appeler connecter()', { cmd }));
      return envoyerCommande(cmd, args, v);
    },

    /**
     * Écoute un événement du composant (`ready`, `select`, `hover`, `filter`, `camera`, `time`, `legend`, `edit`, `layer`, `drill`…).
     * `origine` filtre : 'utilisateur' (défaut : gestes dans la carte), 'api' (effets de vos propres commandes) ou 'tout'.
     * Le filtre par défaut évite la boucle « l'hôte pose un filtre -> le composant le signale -> l'hôte le repose ».
     * @returns {()=>void} désinscription
     */
    on(type, cb, { origine = 'utilisateur' } = {}) {
      if (!ecouteurs.has(type)) ecouteurs.set(type, new Set());
      const e = { cb, origine }; ecouteurs.get(type).add(e); demarrerEcoute();
      return () => ecouteurs.get(type)?.delete(e);
    },
    off(type, cb) { for (const e of [...(ecouteurs.get(type) || [])]) if (e.cb === cb) ecouteurs.get(type).delete(e); },

    /** Coupe la liaison : écoute retirée, commandes en attente rejetées (`deconnecte`). */
    deconnecter() {
      if (desinscrire) { desinscrire(); desinscrire = null; }
      for (const [id, a] of attente) { minuterie.clearTimeout(a.minuteur); a.reject(new ErreurBi('deconnecte', a.cmd + ' : client déconnecté', { cmd: a.cmd })); attente.delete(id); }
      ecouteurs.clear(); connecte = false; version = null; signalPret = null;
    },
    enAttente: () => attente.size,
  };
  for (const cmd of Object.keys(COMMANDES)) client[cmd] = (...args) => client.appeler(cmd, ...args);
  return client;
}

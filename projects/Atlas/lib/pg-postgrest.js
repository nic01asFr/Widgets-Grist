/**
 * Le client PostgREST d'Atlas : le MÊME interface que `pg-passerelle.js` (`commande(nom, corps)`, `connexions`, `schema`, `couche`),
 * pour que les écrans (panneau « Base PostgreSQL », couches en direct, édition, synchronisation) ne changent pas.
 *
 * ## Les deux serveurs
 *  - l'ÉCHANGEUR (`services/pg-echangeur`) : Atlas lui présente l'identité Grist (`Authorization: Grist <jeton du document>`,
 *    voir `pg-acces-grist.js`) et il rend un jeton court, signé, qui porte le rôle (lecteur ou éditeur) et l'adresse de la personne ;
 *  - POSTGREST, devant la base : il reçoit ce jeton (`Authorization: Bearer`) et la base décide (GRANT, sécurité par ligne).
 * Atlas ne connaît qu'UNE adresse, celle de l'échangeur : `GET /v1/echangeur` annonce où est PostgREST.
 *
 * ## Règles
 *  - les jetons de l'échangeur ne vivent qu'en mémoire de cette instance (jamais stockage du navigateur, adresse, document) ;
 *  - un jeton d'écriture n'est demandé que pour une écriture ; la lecture se contente d'un jeton de lecture ;
 *  - le jeton ne part que vers une adresse admise (https, ou localhost) ;
 *  - un 401 de PostgREST (jeton expiré) renouvelle le jeton et rejoue UNE fois ;
 *  - toute erreur dit son côté : la demande, la base, PostgREST/l'échangeur (serveur), Grist.
 *
 * Module pur : `fetch`, l'accès (`entetes`, `apres401`) et l'horloge sont injectés ; il se teste sous Node.
 */

import { ErreurPasserelle, creerClientPg } from './pg-passerelle.js?v=20261122b';
import { adresseAdmisePg } from './pg-acces.js?v=20261109a';

export const VERSION = '1.0.0';
/** La version du contrat SQL (`/rpc/contrat`) que ce client sait lire. */
export const CONTRAT_SUPPORTE = 1;
/** PostgREST sert UNE base : son alias de connexion, pour les écrans qui en attendent un. */
export const ALIAS = 'base';
export const SCHEMA_CONTRAT = 'atlas';
export const MARGE_JETON_MS = 30000;
export const DELAI_SONDE_MS = 5000;
export const MONDE = Object.freeze([-180, -90, 180, 90]);

const origineDe = (url) => { try { return new URL(String(url)).origin; } catch { return null; } };
const nettoyer = (url) => String(url || '').replace(/\/+$/, '');

/** Le type Grist proposé pour un type PostgreSQL (celui de `format_type`), comme le fait la passerelle. */
export function typeGristDe(typeFormate) {
  const t = String(typeFormate || '').toLowerCase().trim();
  if (!t || t.endsWith('[]') || t.startsWith('geometry') || t.startsWith('geography')) return 'Text';
  if (/^(smallint|integer|bigint)$/.test(t)) return 'Int';
  if (/^(real|double precision|numeric|money)/.test(t)) return 'Numeric';
  if (t === 'boolean') return 'Bool';
  if (t === 'date') return 'Date';
  if (/^timestamp/.test(t)) return 'DateTime';
  return 'Text';
}

/** « geometry(Point,4326) » -> { type: 'Point', srid: 4326 } ; « geometry » -> { type: null, srid: 0 }. */
export function sousTypeGeometrie(typeFormate) {
  const m = /^(?:geometry|geography)\s*(?:\(\s*([A-Za-z]+?)(?:Z|M|ZM)?\s*(?:,\s*(\d+))?\s*\))?$/i.exec(String(typeFormate || '').trim());
  if (!m) return { type: null, srid: 0 };
  return { type: m[1] || null, srid: m[2] ? Number(m[2]) : 0 };
}

/**
 * Une erreur de l'échangeur ou de PostgREST, dite avec son côté.
 *  - échangeur : `{ erreur: { code, message, cote } }` (cote : requete, serveur, grist) ;
 *  - PostgREST : `{ code, message, details, hint }` ; un code de cinq caractères est une erreur de la BASE (SQLSTATE), `PGRST1xx` une
 *    demande mal formée, `PGRST301/302/303` un jeton refusé, le reste un défaut de PostgREST.
 */
export function erreurDepuisReponse(statut, corps) {
  if (corps && corps.erreur && typeof corps.erreur === 'object') {
    const e = corps.erreur;
    return new ErreurPasserelle(e.message || `L’échangeur a répondu HTTP ${statut}.`, { code: e.code || 'http_' + statut, cote: e.cote || 'serveur', statut });
  }
  if (corps && typeof corps === 'object' && typeof corps.message === 'string') {
    const code = typeof corps.code === 'string' ? corps.code : 'http_' + statut;
    let cote = 'serveur';
    if (/^PGRST30[123]$/.test(code) || statut === 401) cote = 'serveur';
    else if (/^PGRST1\d\d$/.test(code)) cote = 'requete';
    else if (code === '22023') cote = 'requete'; // « zone invalide », « table sans géométrie » : la demande
    else if (/^[0-9A-Z]{5}$/.test(code) && !code.startsWith('PGRST')) cote = 'base';
    else if (/^PGRST/.test(code) && statut < 500) cote = 'serveur';
    const suite = [corps.details, corps.hint].filter((x) => typeof x === 'string' && x.trim()).join(' — ');
    return new ErreurPasserelle(suite ? `${corps.message} (${suite})` : corps.message, { code, cote, statut });
  }
  return new ErreurPasserelle(`PostgREST a répondu HTTP ${statut}.`, { code: 'http_' + statut, cote: 'serveur', statut });
}

/**
 * Cette adresse est-elle celle d'un échangeur ? (`GET /v1/echangeur`, sans jeton.)
 * @returns {Promise<object|false|null>} l'annonce de l'échangeur ; `false` : ce n'en est pas un ; `null` : indéterminé (réseau)
 */
export async function sonderEchangeur(url, fetchImpl = (...a) => fetch(...a)) {
  const base = nettoyer(url);
  if (!origineDe(base)) return null;
  try {
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(DELAI_SONDE_MS) : undefined;
    const rep = await fetchImpl(base + '/v1/echangeur', { credentials: 'omit', ...(signal ? { signal } : {}) });
    if (!rep.ok) return false;
    const d = await rep.json();
    return d && d.echangeur === true ? d : false;
  } catch { return null; }
}

/**
 * Le client d'un échangeur et de son PostgREST.
 * @param {object} o
 * @param {string} o.url  l'adresse de l'échangeur
 * @param {{entetes:(url:string)=>object, apres401:(url:string, avaitEntete:boolean)=>Promise<boolean>}} o.acces  l'identité Grist
 * @param {{postgrest?:string|null}} [o.annonce]  la réponse de `GET /v1/echangeur`
 * @param {typeof fetch} [o.fetchImpl]
 * @param {() => number} [o.maintenant]
 */
export function creerClientPostgrest({ url, acces, annonce = null, fetchImpl = (...a) => fetch(...a), maintenant = Date.now }) {
  const echangeur = nettoyer(url);
  const jetons = new Map();   // niveau ('lecture' | 'ecriture') -> { valeur, expire }
  const enCours = new Map();  // niveau -> promesse de l'échange en cours
  const memo = new Map();     // cache de lecture du catalogue : contrat, tables, colonnes
  let postgrest = annonce && annonce.postgrest ? nettoyer(annonce.postgrest) : null;

  async function reseau(adresse, options, qui) {
    try { return await fetchImpl(adresse, { credentials: 'omit', ...options }); } catch {
      throw new ErreurPasserelle(
        qui === 'echangeur'
          ? 'Échangeur injoignable : réseau, adresse erronée, ou origine de ce document absente de ECHANGEUR_CORS_ORIGINES.'
          : 'PostgREST injoignable : réseau, adresse erronée, ou origine de ce document refusée par PostgREST (server-cors-allowed-origins).',
        { code: 'injoignable', cote: 'serveur' });
    }
  }

  async function lireCorps(rep) {
    const texte = await rep.text();
    if (!texte.trim()) return null;
    try { return JSON.parse(texte); } catch {
      throw new ErreurPasserelle(`Réponse illisible (HTTP ${rep.status}).`, { code: 'illisible', cote: 'serveur', statut: rep.status });
    }
  }

  /** L'adresse de PostgREST : annoncée par l'échangeur, jamais devinée ; elle ne reçoit un jeton qu'en https (ou localhost). */
  async function adressePg() {
    if (postgrest) return postgrest;
    const a = await sonderEchangeur(echangeur, fetchImpl);
    if (!a || !a.postgrest) {
      throw new ErreurPasserelle('L’échangeur n’annonce pas l’adresse de PostgREST (ECHANGEUR_POSTGREST_URL est vide sur l’échangeur).', { code: 'postgrest_inconnu', cote: 'serveur' });
    }
    postgrest = nettoyer(a.postgrest);
    return postgrest;
  }

  async function echanger(niveau) {
    const adresse = echangeur + '/v1/jeton';
    const ecriture = niveau === 'ecriture';
    for (let essai = 0; ; essai++) {
      const entetes = acces.entetes(adresse);
      const rep = await reseau(adresse, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...entetes },
        body: JSON.stringify(ecriture ? { ecriture: true } : {}),
      }, 'echangeur');
      if (rep.status === 401 && essai === 0 && await acces.apres401(adresse, 'Authorization' in entetes)) continue;
      const corps = await lireCorps(rep);
      if (!rep.ok) throw erreurDepuisReponse(rep.status, corps);
      if (!corps || typeof corps.access_token !== 'string' || !corps.access_token) {
        throw new ErreurPasserelle('L’échangeur n’a pas rendu de jeton.', { code: 'jeton_absent', cote: 'serveur', statut: rep.status });
      }
      const duree = Number.isFinite(corps.expires_in) && corps.expires_in > 0 ? corps.expires_in * 1000 : 60000;
      jetons.set(niveau, { valeur: corps.access_token, expire: maintenant() + Math.max(0, duree - MARGE_JETON_MS) });
      return corps.access_token;
    }
  }

  async function jeton(niveau) {
    const j = jetons.get(niveau);
    if (j && maintenant() < j.expire) return j.valeur;
    if (enCours.has(niveau)) return enCours.get(niveau);
    const p = echanger(niveau);
    enCours.set(niveau, p);
    try { return await p; } finally { enCours.delete(niveau); }
  }

  /**
   * Un appel à PostgREST avec un jeton de l'échangeur.
   * @returns {Promise<{statut:number, donnees:any, entetes:Headers}>}
   */
  async function appeler(methode, chemin, { niveau = 'lecture', corps, entetes = {}, profil = null } = {}) {
    const racine = await adressePg();
    const refus = adresseAdmisePg(racine);
    if (refus) throw new ErreurPasserelle(`Adresse de PostgREST refusée (${refus}).`, { code: 'adresse_refusee', cote: 'requete' });
    for (let essai = 0; ; essai++) {
      const valeur = await jeton(niveau);
      const prof = profil
        ? { [methode === 'GET' || methode === 'HEAD' ? 'Accept-Profile' : 'Content-Profile']: profil }
        : {};
      const rep = await reseau(racine + chemin, {
        method: methode,
        headers: {
          Accept: 'application/json', Authorization: 'Bearer ' + valeur, ...prof, ...entetes,
          ...(corps !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
      }, 'postgrest');
      if (rep.status === 401 && essai === 0) { jetons.delete(niveau); continue; } // jeton expiré ou clé renouvelée : un nouveau, une fois
      const donnees = await lireCorps(rep);
      if (!rep.ok) throw erreurDepuisReponse(rep.status, donnees);
      return { statut: rep.status, donnees, entetes: rep.headers };
    }
  }

  const rpcLire = async (nom, parametres = {}) => {
    const q = new URLSearchParams(parametres).toString();
    return (await appeler('GET', `/rpc/${nom}${q ? '?' + q : ''}`, { profil: SCHEMA_CONTRAT })).donnees;
  };
  const rpcEcrire = async (nom, corps) => (await appeler('POST', `/rpc/${nom}`, { corps, profil: SCHEMA_CONTRAT })).donnees;

  async function memoriser(cle, fabriquer, rafraichir = false) {
    if (!rafraichir && memo.has(cle)) return memo.get(cle);
    const valeur = await fabriquer();
    memo.set(cle, valeur);
    return valeur;
  }

  /** Le contrat SQL installé : sa version et ses capacités. Une version plus récente que celle qu'on sait lire est refusée, dite. */
  async function contrat(rafraichir = false) {
    return memoriser('contrat', async () => {
      const c = await rpcLire('contrat');
      if (!c || !Number.isInteger(c.contrat)) throw new ErreurPasserelle('Le contrat SQL d’Atlas est illisible (« /rpc/contrat »).', { code: 'contrat_illisible', cote: 'base' });
      if (c.contrat > CONTRAT_SUPPORTE) {
        throw new ErreurPasserelle(`Le contrat SQL installé est de version ${c.contrat} ; cet Atlas sait lire la version ${CONTRAT_SUPPORTE} : mettez Atlas à jour.`, { code: 'contrat_trop_recent', cote: 'base' });
      }
      if (!(c.capacites || []).includes('zone')) {
        throw new ErreurPasserelle('Le contrat SQL installé ne sait pas servir une zone : réinstallez services/pg-postgrest/sql.', { code: 'contrat_incomplet', cote: 'base' });
      }
      return c;
    }, rafraichir);
  }

  const tables = (rafraichir = false) => memoriser('tables', () => rpcLire('tables'), rafraichir);
  const colonnesDe = (schema, table, rafraichir = false) =>
    memoriser(`colonnes:${schema}.${table}`, () => rpcLire('colonnes', { schema_nom: schema, table_nom: table }), rafraichir);

  const ordreColonnes = (lignes) => (lignes || []).map((c) => {
    const col = {
      nom: c.nom, type: c.type, type_grist: typeGristDe(c.type), nullable: !c.obligatoire, cle_primaire: !!c.cle, commentaire: null,
    };
    if (c.geometrie) col.geometrie = { type: sousTypeGeometrie(c.type).type, srid: c.srid ?? sousTypeGeometrie(c.type).srid };
    return col;
  });

  const commandes = {
    async pg_gateway_connexions() {
      const c = await contrat(true);
      const libelle = `PostgreSQL ${String(c.postgresql || '').split(' ')[0]} · PostGIS ${c.postgis || '?'}`.trim();
      return {
        connexions: [{ alias: ALIAS, libelle }],
        limite_max: Number.isInteger(c.limite_max) ? c.limite_max : null,
        avertissements: [],
        contrat: c.contrat,
        postgresql: c.postgresql,
        postgis: c.postgis,
      };
    },

    async pg_gateway_schema({ rafraichir = false } = {}) {
      const c = await contrat();
      const lignes = await tables(rafraichir);
      const parSchema = new Map();
      const avertissements = [];
      for (const t of lignes) {
        if (!parSchema.has(t.schema_nom)) parSchema.set(t.schema_nom, { nom: t.schema_nom, tables: [], non_lisibles: 0 });
        const geometries = (t.geometries || []).map((g) => ({ colonne: g.colonne, type: g.type, srid: g.srid, dimensions: g.dimensions }));
        for (const g of geometries) {
          if (!g.srid) avertissements.push(`« ${t.schema_nom}.${t.table_nom} » : la colonne « ${g.colonne} » n’a pas de système de coordonnées déclaré : l’afficher par zone est impossible.`);
        }
        parSchema.get(t.schema_nom).tables.push({
          nom: t.table_nom, genre: t.nature, lignes_estimees: t.lignes_estimees ?? null, commentaire: null, nb_colonnes: null, geometries,
          cle: t.cle || [], securite_par_ligne: !!t.securite_par_ligne,
        });
      }
      return {
        connexion: ALIAS, libelle: `PostgreSQL · PostGIS ${c.postgis || '?'}`, postgis: c.postgis || null,
        schemas: [...parSchema.values()], nb_tables: lignes.length, avertissements,
      };
    },

    async pg_gateway_table({ schema, table }) {
      const [cols, liste] = await Promise.all([colonnesDe(schema, table, true), tables().catch(() => [])]);
      const ligne = (liste || []).find((t) => t.schema_nom === schema && t.table_nom === table);
      return {
        connexion: ALIAS, schema, table, genre: ligne ? ligne.nature : null, commentaire: null,
        lignes_estimees: ligne ? ligne.lignes_estimees ?? null : null, colonnes: ordreColonnes(cols),
      };
    },

    /** Une table en FeatureCollection : par zone (`bbox`), ou tout le monde sans `bbox`. PostgREST ne pagine pas une zone : `decalage` est refusé, dit. */
    async pg_gateway_couche({ schema, table, bbox, limite, decalage }) {
      if (decalage) {
        throw new ErreurPasserelle('La lecture par pages d’une couche n’existe pas avec PostgREST : demandez une zone plus petite ou relevez la limite.', { code: 'decalage_non_pris_en_charge', cote: 'requete' });
      }
      const zone = Array.isArray(bbox) && bbox.length === 4 ? bbox : MONDE;
      const demande = Number.isInteger(limite) && limite > 0 ? limite : undefined;
      const [fc, cols] = await Promise.all([
        rpcEcrire('entites_zone', {
          schema_nom: schema, table_nom: table, ouest: zone[0], sud: zone[1], est: zone[2], nord: zone[3],
          ...(demande ? { limite: demande } : {}),
        }),
        colonnesDe(schema, table),
      ]);
      const colGeo = (cols || []).find((c) => c.geometrie);
      const geometrique = fc.geometrie || (colGeo && colGeo.nom) || null;
      const entites = Array.isArray(fc.features) ? fc.features : [];
      const tronque = fc.truncated === true;
      const avertissements = [];
      if (tronque) avertissements.push(`Résultat tronqué à ${fc.limite} entités : réduisez l’emprise ou relevez la limite.`);
      return {
        type: 'FeatureCollection', features: entites, connexion: ALIAS, schema, table, colonne_geometrie: geometrique,
        colonnes: (cols || []).filter((c) => !c.geometrie).map((c) => ({ nom: c.nom, type_pg: c.type, type_grist: typeGristDe(c.type) })),
        nb_entites: entites.length, tronque, limite: fc.limite ?? demande ?? null, decalage: 0, suivant: null, avertissements,
      };
    },
  };

  async function commande(nom, corps = {}) {
    const f = commandes[nom];
    if (!f) {
      throw new ErreurPasserelle(`La commande « ${nom} » n’existe pas avec PostgREST.`, { code: 'commande_inconnue', cote: 'requete' });
    }
    return f(corps || {});
  }

  return {
    mode: 'postgrest',
    commande,
    connexions: () => commande('pg_gateway_connexions'),
    schema: (connexion, rafraichir = false) => commande('pg_gateway_schema', { connexion, ...(rafraichir ? { rafraichir: true } : {}) }),
    couche: (e) => commande('pg_gateway_couche', e),
    /** Pour les tests et le diagnostic : ce que l'échangeur a annoncé. */
    adressePostgrest: adressePg,
    /** Oublier les jetons et le catalogue (changement de personne, d'adresse). */
    oublier() { jetons.clear(); memo.clear(); },
  };
}

/**
 * Le client d'une adresse : celui de l'échangeur si l'adresse en est un, sinon celui d'une passerelle `/v1/`.
 * Le choix se fait à la PREMIÈRE commande (la sonde `GET /v1/echangeur` n'envoie aucun jeton) et se garde ; une sonde sans réponse
 * (réseau) n'est pas retenue : la commande suivante la refait.
 * @param {object} o  mêmes paramètres que `creerClientPg` ; `fetchImpl` sert aussi à la sonde
 */
export function creerClientAuto({ url, acces, fetchImpl = (...a) => fetch(...a), maintenant = Date.now }) {
  let choisi = null;
  let enSonde = null;

  async function client() {
    if (choisi) return choisi;
    if (!enSonde) enSonde = sonderEchangeur(url, fetchImpl);
    let annonce;
    try { annonce = await enSonde; } finally { enSonde = null; }
    if (annonce === null) {
      // Indéterminé (réseau, délai, CORS) : on n'enregistre pas ce choix, la commande suivante refera la sonde.
      throw new ErreurPasserelle(
        'Adresse injoignable : réseau, adresse erronée, ou origine de ce document refusée par CORS (échangeur ou passerelle).',
        { code: 'injoignable', cote: 'serveur' });
    }
    choisi = annonce ? creerClientPostgrest({ url, acces, annonce, fetchImpl, maintenant }) : creerClientPg({ url, acces, fetchImpl });
    return choisi;
  }

  const commande = async (nom, corps = {}) => (await client()).commande(nom, corps);
  return {
    commande,
    connexions: async () => (await client()).connexions(),
    schema: async (connexion, rafraichir = false) => (await client()).schema(connexion, rafraichir),
    couche: async (e) => (await client()).couche(e),
    /** `'postgrest'`, `'passerelle'`, ou `null` tant qu'aucune commande n'a été envoyée. */
    mode: () => (choisi ? (choisi.mode === 'postgrest' ? 'postgrest' : 'passerelle') : null),
  };
}

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

/** Ce qu'une table doit porter pour être modifiable depuis Atlas (convention de nommage, sans table de déclaration) : voir `declarationModifiable`. */
export const COLONNE_VERSION = 'version';
export const COLONNE_ETAT = 'actif';
/** Une opération = une requête : le lot est borné pour qu'une écriture ne dure pas des minutes. */
export const LOT_MAX = 200;
const IDENTIFIANT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENTIERS = /^(smallint|integer|bigint)$/;

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
 * Les valeurs d'une écriture, à la forme que PostgREST attend : les dates arrivent d'Atlas en secondes (convention de lecture de Grist, à l'envers)
 * et partent en ISO ; le reste passe tel quel (une géométrie est un objet GeoJSON WGS84, PostGIS la convertit).
 */
export function valeurPourPg(valeur, typeFormate) {
  if (valeur === null || valeur === undefined) return null;
  const t = String(typeFormate || '').toLowerCase();
  if (typeof valeur === 'number' && Number.isFinite(valeur)) {
    if (t === 'date') return new Date(valeur * 1000).toISOString().slice(0, 10);
    if (t.startsWith('timestamp')) return new Date(valeur * 1000).toISOString();
  }
  return valeur;
}

/**
 * Une table est-elle modifiable depuis Atlas ? Oui si l'éditeur peut y écrire, qu'elle a une clé primaire ET une colonne entière « version »
 * (sans elle, aucun conflit ne serait détecté : Atlas n'écrase jamais). Une colonne booléenne « actif » donne les opérations désactiver et
 * réactiver ; sans elle, le droit de suppression donne « supprimer ».
 * @param {object} ligne  une ligne de `/rpc/tables_editeur`
 * @param {object[]} colonnes  `/rpc/colonnes`
 * @returns {{decl: object|null, raison: string|null}}
 */
export function declarationModifiable(ligne, colonnes) {
  const nom = `${ligne.schema_nom}.${ligne.table_nom}`;
  if (!ligne.insertion && !ligne.modification) return { decl: null, raison: null }; // lecture seule : rien à dire
  if (ligne.nature !== 'table') return { decl: null, raison: `${nom} : une vue ne se modifie pas depuis Atlas.` };
  if (!(ligne.cle || []).length) return { decl: null, raison: `${nom} : sans clé primaire, ses lignes ne peuvent pas être désignées.` };
  const version = (colonnes || []).find((c) => c.nom === COLONNE_VERSION && ENTIERS.test(String(c.type)));
  if (!version) {
    return { decl: null, raison: `${nom} : sans colonne entière « ${COLONNE_VERSION} », Atlas ne peut pas détecter un conflit et ne la propose pas en modification (atlas.poser_trigger_version).` };
  }
  const etat = (colonnes || []).find((c) => c.nom === COLONNE_ETAT && String(c.type) === 'boolean');
  const geometrie = (colonnes || []).find((c) => c.geometrie);
  const colonnesEcrivables = (colonnes || [])
    .filter((c) => c.ecrivable && !ligne.cle.includes(c.nom) && c.nom !== COLONNE_VERSION && !(etat && c.nom === COLONNE_ETAT))
    .map((c) => c.nom);
  const operations = [];
  if (ligne.insertion) operations.push('inserer');
  if (ligne.modification) operations.push('modifier');
  if (etat && ligne.modification) operations.push('desactiver', 'reactiver');
  if (!etat && ligne.suppression) operations.push('supprimer');
  return {
    raison: null,
    decl: {
      schema: ligne.schema_nom, table: ligne.table_nom, cle: [...ligne.cle], colonnes: colonnesEcrivables,
      geometrie: geometrie ? geometrie.nom : null, version: COLONNE_VERSION,
      suppression: etat ? `etat:${COLONNE_ETAT}` : (ligne.suppression ? 'reelle' : 'interdite'), operations,
      srid_geometrie: geometrie ? geometrie.srid ?? null : null,
    },
  };
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
    if (code === 'PGRST106') {
      return new ErreurPasserelle(`${corps.message} — le schéma de la table doit figurer dans pgrst.db_schemas (ALTER ROLE atlas_authenticator SET pgrst.db_schemas = 'atlas, <schéma>' puis NOTIFY pgrst, 'reload config').`,
        { code, cote: 'serveur', statut });
    }
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

  const tablesEditeur = (rafraichir = false) => memoriser('tables_editeur', () => rpcLire('tables_editeur'), rafraichir);

  /** Les tables modifiables et ce qui en écarte d'autres : `{ declarations, raisons }`. Gardé jusqu'à `rafraichir`. */
  async function modifiables(rafraichir = false) {
    return memoriser('modifiables', async () => {
      const lignes = await tablesEditeur(rafraichir);
      const candidates = lignes.filter((t) => t.insertion || t.modification);
      const colonnes = await Promise.all(candidates.map((t) => colonnesDe(t.schema_nom, t.table_nom, rafraichir)));
      const declarations = [];
      const raisons = [];
      candidates.forEach((t, i) => {
        const r = declarationModifiable(t, colonnes[i]);
        if (r.decl) declarations.push(r.decl);
        else if (r.raison) raisons.push(r.raison);
      });
      return { declarations, raisons };
    }, rafraichir);
  }

  async function declaration(schema, table) {
    const { declarations } = await modifiables();
    const d = declarations.find((x) => x.schema === schema && x.table === table);
    if (!d) {
      throw new ErreurPasserelle(`« ${schema}.${table} » n’est pas modifiable depuis Atlas (droits d’écriture de l’éditeur, clé primaire et colonne « ${COLONNE_VERSION} » entière requis).`,
        { code: 'table_non_modifiable', cote: 'requete', statut: 403 });
    }
    return d;
  }

  const cleDe = (decl, ligne) => Object.fromEntries(decl.cle.map((c) => [c, ligne[c] ?? null]));
  const valeursDe = (decl, ligne) => Object.fromEntries(decl.colonnes.map((c) => [c, ligne[c] ?? null]));
  const ligneAtlas = (decl, ligne) => ({
    cle: cleDe(decl, ligne), valeurs: valeursDe(decl, ligne), version: ligne[decl.version] ?? null,
    ...(decl.suppression.startsWith('etat:') ? { actif: ligne[decl.suppression.slice(5)] !== false } : {}),
  });

  /** Les lignes d'une table, par clés ou par pages, avec leur version : la base reprojette les géométries (WGS84). */
  async function lignesDe(decl, { cles, limite, decalage, niveau = 'lecture' } = {}) {
    const corps = { schema_nom: decl.schema, table_nom: decl.table };
    if (Array.isArray(cles)) corps.cles = cles;
    if (Number.isInteger(limite) && limite > 0) corps.limite = limite;
    if (Number.isInteger(decalage) && decalage >= 0) corps.decalage = decalage;
    return (await appeler('POST', '/rpc/lignes', { niveau, corps, profil: SCHEMA_CONTRAT })).donnees;
  }

  /** Le filtre PostgREST qui désigne UNE ligne à la version lue : `id=eq.3&version=eq.5`. */
  function filtreLigne(decl, cle, version) {
    const q = new URLSearchParams();
    for (const c of decl.cle) {
      if (!cle || cle[c] === undefined || cle[c] === null) {
        throw new ErreurPasserelle(`La clé « ${c} » manque : la ligne ne peut pas être désignée.`, { code: 'cle_incomplete', cote: 'requete' });
      }
      if (!IDENTIFIANT.test(c)) throw new ErreurPasserelle(`La colonne de clé « ${c} » a un nom que Atlas ne sait pas envoyer.`, { code: 'colonne_non_prise_en_charge', cote: 'requete' });
      q.append(c, 'eq.' + String(cle[c]));
    }
    q.append(decl.version, 'eq.' + String(version));
    q.append('select', [...decl.cle, decl.version].join(','));
    return q.toString();
  }

  const resultat = (index, operation, statut, plus = {}) => ({ index, operation, statut, ...plus });

  /** Une écriture qui n'a touché AUCUNE ligne : conflit, ligne disparue, ou refus de la base — jamais confondus. */
  async function expliquerAbsence(decl, index, operation, cle, versionAttendue) {
    const lu = (await lignesDe(decl, { cles: [cle], niveau: 'ecriture' })).lignes || [];
    if (!lu.length) {
      return resultat(index, operation, 'introuvable', {
        code: 'ligne_introuvable', cote: 'base', cle,
        message: 'La ligne n’existe plus, ou la base ne vous la montre pas (sécurité par ligne).',
      });
    }
    const actuelle = ligneAtlas(decl, lu[0]);
    if (String(actuelle.version) !== String(versionAttendue)) {
      return resultat(index, operation, 'conflit', {
        code: 'version_changee', cote: 'base', cle, message: 'La ligne a changé depuis votre lecture : rien n’a été écrit.',
        version_actuelle: actuelle.version, valeurs_actuelles: actuelle.valeurs,
      });
    }
    return resultat(index, operation, 'refuse', {
      code: 'ligne_non_modifiee', cote: 'base', cle,
      message: 'La base n’a modifié aucune ligne : un droit ou la sécurité par ligne refuse cette écriture.',
    });
  }

  /** Une erreur de la BASE devient le résultat de CETTE opération ; une panne du serveur interrompt tout. */
  const refusDeLaBase = (index, operation, e, cle) => {
    if (!e || e.cote !== 'base') throw e;
    return resultat(index, operation, 'refuse', { code: e.code, cote: 'base', message: e.message, ...(cle ? { cle } : {}) });
  };

  const operationFermee = (decl, nom, index) => resultat(index, nom || '?', 'refuse', {
    code: 'operation_non_ouverte', cote: 'requete', message: `L’opération « ${nom} » n’est pas ouverte sur ${decl.schema}.${decl.table}.`,
  });

  async function appliquerOperation(decl, op, index, colonnesTable) {
    const nom = op && op.op;
    if (!decl.operations.includes(nom)) return operationFermee(decl, nom, index);
    const types = new Map(colonnesTable.map((c) => [c.nom, c.type]));
    const envoi = (valeurs) => {
      const sortie = {};
      for (const [c, v] of Object.entries(valeurs || {})) {
        if (!decl.colonnes.includes(c) && !decl.cle.includes(c)) {
          throw Object.assign(new Error(`La colonne « ${c} » n’est pas modifiable sur ${decl.schema}.${decl.table}.`), { refus: 'colonne_non_ouverte' });
        }
        if (!IDENTIFIANT.test(c)) throw Object.assign(new Error(`La colonne « ${c} » a un nom que Atlas ne sait pas envoyer.`), { refus: 'colonne_non_prise_en_charge' });
        sortie[c] = valeurPourPg(v, types.get(c));
      }
      return sortie;
    };
    try {
      if (nom === 'inserer') {
        const corps = envoi({ ...(op.cle || {}), ...(op.valeurs || {}) });
        const q = new URLSearchParams({ select: [...decl.cle, decl.version].join(',') }).toString();
        const rep = await appeler('POST', `/${encodeURIComponent(decl.table)}?${q}`, { niveau: 'ecriture', corps, profil: decl.schema, entetes: { Prefer: 'return=representation' } });
        const ligne = Array.isArray(rep.donnees) ? rep.donnees[0] : null;
        if (!ligne) return resultat(index, nom, 'erreur', { code: 'aucune_ligne_rendue', cote: 'serveur', message: 'PostgREST n’a pas rendu la ligne insérée.' });
        return resultat(index, nom, 'ok', { cle: cleDe(decl, ligne), version: ligne[decl.version] ?? null });
      }
      if (op.version_attendue === undefined || op.version_attendue === null) {
        return resultat(index, nom, 'refuse', { code: 'version_attendue_absente', cote: 'requete', message: 'La version lue est obligatoire : Atlas n’écrase jamais une ligne sans l’avoir lue.' });
      }
      const cle = op.cle || {};
      const filtre = filtreLigne(decl, cle, op.version_attendue);
      const adresse = `/${encodeURIComponent(decl.table)}?${filtre}`;
      let rep;
      if (nom === 'supprimer') {
        rep = await appeler('DELETE', adresse, { niveau: 'ecriture', profil: decl.schema, entetes: { Prefer: 'return=representation' } });
      } else {
        const corps = nom === 'modifier' ? envoi(op.valeurs) : { [decl.suppression.slice(5)]: nom === 'reactiver' }; // desactiver : actif = faux
        if (nom === 'modifier' && !Object.keys(corps).length) {
          return resultat(index, nom, 'refuse', { code: 'aucune_valeur', cote: 'requete', cle, message: 'Aucune valeur à modifier.' });
        }
        rep = await appeler('PATCH', adresse, { niveau: 'ecriture', corps, profil: decl.schema, entetes: { Prefer: 'return=representation' } });
      }
      const touchees = Array.isArray(rep.donnees) ? rep.donnees : [];
      if (!touchees.length) return await expliquerAbsence(decl, index, nom, cle, op.version_attendue);
      return resultat(index, nom, 'ok', { cle: cleDe(decl, touchees[0]), version: touchees[0][decl.version] ?? null });
    } catch (e) {
      if (e && e.refus) return resultat(index, nom || '?', 'refuse', { code: e.refus, cote: 'requete', message: e.message });
      // Une demande que le client refuse lui-même (clé incomplète, nom de colonne inenvoyable) : le refus de CETTE opération, pas la fin du lot.
      if (e && e.name === 'ErreurPasserelle' && e.cote === 'requete' && !e.statut) return resultat(index, nom || '?', 'refuse', { code: e.code, cote: 'requete', message: e.message });
      return refusDeLaBase(index, nom || '?', e, op && op.cle);
    }
  }

  /** Simuler : on LIT (existence et version), on n'écrit rien. Les contraintes et les droits d'écriture ne sont pas éprouvés : dit. */
  async function simulerOperation(decl, op, index) {
    const nom = op && op.op;
    if (!decl.operations.includes(nom)) return operationFermee(decl, nom, index);
    if (nom === 'inserer') return resultat(index, nom, 'ok', { message: 'Non éprouvé : une simulation ne vérifie pas les contraintes de la base.' });
    if (op.version_attendue === undefined || op.version_attendue === null) {
      return resultat(index, nom, 'refuse', { code: 'version_attendue_absente', cote: 'requete', message: 'La version lue est obligatoire.' });
    }
    const cle = op.cle || {};
    const r = await expliquerAbsence(decl, index, nom, cle, op.version_attendue);
    if (r.statut === 'refuse' && r.code === 'ligne_non_modifiee') {
      return resultat(index, nom, 'ok', { cle, message: 'Ligne présente à la version lue ; une simulation ne vérifie ni les droits d’écriture ni les contraintes.' });
    }
    return r;
  }

  const commandes = {
    async pg_gateway_tables_modifiables() {
      const { declarations, raisons } = await modifiables(true);
      return { connexion: ALIAS, tables: declarations, lot_max: LOT_MAX, avertissements: raisons };
    },

    async pg_gateway_lire({ schema, table, cles, limite, decalage }) {
      const decl = await declaration(schema, table);
      const r = await lignesDe(decl, { cles, limite, decalage });
      const lignes = (r.lignes || []).map((l) => ligneAtlas(decl, l));
      const tronque = r.truncated === true;
      const debut = Number.isInteger(r.decalage) ? r.decalage : 0;
      return {
        connexion: ALIAS, schema, table, lignes, nb_lignes: lignes.length, tronque, decalage: debut,
        suivant: tronque ? debut + (Number.isInteger(r.limite) ? r.limite : lignes.length) : null, avertissements: [],
      };
    },

    /**
     * Écrire, une requête par opération (PATCH, POST, DELETE sur la table), chacune à la version lue. Pas de lot atomique de plusieurs
     * opérations (`atomique: false`, ou une seule opération), pas de clé d'idempotence : dit, jamais ignoré en silence.
     */
    async pg_gateway_ecrire({ schema, table, operations, mode = 'appliquer', atomique = true, cle_idempotence: cleIdempotence }) {
      if (!Array.isArray(operations) || !operations.length) {
        throw new ErreurPasserelle('Aucune opération à écrire.', { code: 'operations_absentes', cote: 'requete' });
      }
      if (operations.length > LOT_MAX) {
        throw new ErreurPasserelle(`Trop d’opérations dans un lot (${operations.length}, au plus ${LOT_MAX}).`, { code: 'lot_trop_grand', cote: 'requete' });
      }
      if (atomique !== false && operations.length > 1) {
        throw new ErreurPasserelle('Un lot de plusieurs opérations ne peut pas être atomique avec PostgREST : demandez-le opération par opération (atomique: false).',
          { code: 'atomique_non_pris_en_charge', cote: 'requete' });
      }
      const decl = await declaration(schema, table);
      const colonnesTable = await colonnesDe(schema, table);
      const simuler = mode === 'simuler';
      const resultats = [];
      for (let i = 0; i < operations.length; i++) {
        resultats.push(simuler ? await simulerOperation(decl, operations[i], i) : await appliquerOperation(decl, operations[i], i, colonnesTable));
      }
      const ok = resultats.filter((r) => r.statut === 'ok').length;
      const conflits = resultats.filter((r) => r.statut === 'conflit').length;
      const avertissements = [];
      if (simuler) avertissements.push('Simulation partielle : les versions et l’existence des lignes sont vérifiées, pas les droits d’écriture ni les contraintes de la base.');
      if (cleIdempotence) avertissements.push('La clé d’idempotence n’existe pas avec PostgREST : rejouer ce lot le réapplique (une modification déjà faite ressortira en conflit).');
      return {
        connexion: ALIAS, schema, table, mode: simuler ? 'simuler' : 'appliquer', atomique: atomique !== false, ok, conflits,
        refus: resultats.length - ok - conflits, resultats, rejoue: false, applique: !simuler && ok > 0, avertissements,
      };
    },

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

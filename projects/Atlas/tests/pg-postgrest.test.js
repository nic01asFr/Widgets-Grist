import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  creerClientPostgrest, creerClientAuto, sonderEchangeur, erreurDepuisReponse, typeGristDe, sousTypeGeometrie,
  CONTRAT_SUPPORTE, MARGE_JETON_MS, MONDE,
} from '../lib/pg-postgrest.js';
import { creerAccesGrist, sonderIdentite } from '../lib/pg-acces-grist.js';
import { texteErreur } from '../lib/pg-passerelle.js';

const ECH = 'https://echangeur.exemple.fr';
const PG = 'https://pg.exemple.fr/rest';

const json = (corps, statut = 200) => new Response(corps === undefined ? '' : JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });

/**
 * Un échangeur et un PostgREST de poche. Tout appel est noté ; les réponses se règlent par `reglages`.
 * Un jeton émis est « jetonN » ; PostgREST n'accepte que ceux qu'il connaît (et pas ceux qu'on a fait expirer).
 */
function monde(reglages = {}) {
  const m = {
    appels: [], emis: [], expires: new Set(), horloge: 1_000_000,
    contrat: { contrat: 1, postgresql: '16.4 (Debian)', postgis: '3.4.2', limite_max: 10000, capacites: ['tables', 'colonnes', 'zone', 'ecriture-directe'] },
    tables: [
      { schema_nom: 'metier', table_nom: 'batiment', nature: 'table', geometries: [{ colonne: 'geom', type: 'Polygon', srid: 4326, dimensions: 2 }], cle: ['id'], lignes_estimees: 120, lecture: true, insertion: false, modification: false, suppression: false, securite_par_ligne: true },
      { schema_nom: 'metier', table_nom: 'journal', nature: 'table', geometries: [], cle: ['id'], lignes_estimees: 5, lecture: true, insertion: false, modification: false, suppression: false, securite_par_ligne: false },
    ],
    colonnes: {
      'metier.batiment': [
        { rang: 1, nom: 'id', type: 'integer', obligatoire: true, cle: true, geometrie: false, srid: null, ecrivable: true },
        { rang: 2, nom: 'nom', type: 'text', obligatoire: false, cle: false, geometrie: false, srid: null, ecrivable: true },
        { rang: 3, nom: 'hauteur', type: 'numeric(6,2)', obligatoire: false, cle: false, geometrie: false, srid: null, ecrivable: true },
        { rang: 4, nom: 'geom', type: 'geometry(Polygon,4326)', obligatoire: false, cle: false, geometrie: true, srid: 4326, ecrivable: true },
      ],
    },
    zone: { type: 'FeatureCollection', geometrie: 'geom', limite: 1000, truncated: false, features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: { id: 1 } }] },
    annonce: { echangeur: true, version: '0.1.0', postgrest: PG },
    ...reglages,
  };
  m.fetch = async (url, options = {}) => {
    const u = new URL(url);
    const methode = options.method || 'GET';
    const entetes = Object.fromEntries(Object.entries(options.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const corps = options.body ? JSON.parse(options.body) : undefined;
    m.appels.push({ url, methode, entetes, corps, credentials: options.credentials });
    if (m.reseau && m.reseau(url)) throw new TypeError('Failed to fetch');
    if (u.origin === new URL(ECH).origin) {
      if (u.pathname === '/v1/echangeur') return m.annonce ? json(m.annonce) : json({ detail: 'Not Found' }, 404);
      if (u.pathname === '/v1/identite') return json({ detail: 'Not Found' }, 404);
      if (u.pathname === '/v1/jeton') {
        if (m.refusEchange) return json({ erreur: m.refusEchange }, m.refusEchange.statut || 403);
        if (!String(entetes.authorization || '').startsWith('Grist ')) return json({ erreur: { code: 'jeton_grist_absent', message: 'En-tête attendu', cote: 'requete' } }, 401);
        const ecriture = !!(corps && corps.ecriture);
        const valeur = `jeton${m.emis.length + 1}${ecriture ? 'e' : 'l'}`;
        m.emis.push({ valeur, ecriture });
        return json({ access_token: valeur, token_type: 'Bearer', expires_in: m.dureeJeton ?? 600, role: ecriture ? 'atlas_editeur' : 'atlas_lecteur', email: 'alice@exemple.fr' });
      }
    }
    if (u.origin === new URL(PG).origin) {
      const chemin = u.pathname.slice(new URL(PG).pathname.length);
      const porteur = String(entetes.authorization || '').replace(/^Bearer /, '');
      if (!m.emis.some((e) => e.valeur === porteur) || m.expires.has(porteur)) {
        return json({ code: 'PGRST303', message: 'JWT expired' }, 401);
      }
      if (m.erreurPg) return json(m.erreurPg.corps, m.erreurPg.statut);
      if (chemin === '/rpc/contrat') return json(m.contrat);
      if (chemin === '/rpc/tables') return json(m.tables);
      if (chemin === '/rpc/colonnes') {
        const c = m.colonnes[`${u.searchParams.get('schema_nom')}.${u.searchParams.get('table_nom')}`];
        return c ? json(c) : json({ code: '42P01', message: 'table inconnue ou non lisible' }, 404);
      }
      if (chemin === '/rpc/entites_zone') return json(typeof m.zone === 'function' ? m.zone(corps) : m.zone);
    }
    return json({ detail: 'Not Found' }, 404);
  };
  return m;
}

/** Un accès Grist qui a déjà confirmé, avec les jetons Grist numérotés. */
function acces({ ttlMsecs = 900000 } = {}) {
  let n = 0;
  const a = creerAccesGrist({ jeton: async () => ({ token: `grist-${++n}`, ttlMsecs }), confirmer: async () => true });
  a.nbJetonsGrist = () => n;
  return a;
}

const client = (m, options = {}) => creerClientPostgrest({ url: ECH, acces: options.acces || acces(), annonce: m.annonce, fetchImpl: m.fetch, maintenant: () => m.horloge, ...options });
const appelsPg = (m) => m.appels.filter((a) => a.url.startsWith(PG));
const appelsEch = (m) => m.appels.filter((a) => a.url.startsWith(ECH));

describe('pg-postgrest — types et classement des erreurs', () => {
  it('le type Grist suit la passerelle : entiers, nombres, booléen, dates, le reste en texte', () => {
    assert.equal(typeGristDe('integer'), 'Int');
    assert.equal(typeGristDe('bigint'), 'Int');
    assert.equal(typeGristDe('numeric(6,2)'), 'Numeric');
    assert.equal(typeGristDe('double precision'), 'Numeric');
    assert.equal(typeGristDe('boolean'), 'Bool');
    assert.equal(typeGristDe('date'), 'Date');
    assert.equal(typeGristDe('timestamp with time zone'), 'DateTime');
    assert.equal(typeGristDe('integer[]'), 'Text');
    assert.equal(typeGristDe('geometry(Point,4326)'), 'Text');
    assert.equal(typeGristDe('character varying(50)'), 'Text');
    assert.equal(typeGristDe(null), 'Text');
  });

  it('le sous-type géométrique et le SRID se lisent dans le type', () => {
    assert.deepEqual(sousTypeGeometrie('geometry(Polygon,4326)'), { type: 'Polygon', srid: 4326 });
    assert.deepEqual(sousTypeGeometrie('geometry(PointZ,2154)'), { type: 'Point', srid: 2154 });
    assert.deepEqual(sousTypeGeometrie('geometry'), { type: null, srid: 0 });
    assert.deepEqual(sousTypeGeometrie('text'), { type: null, srid: 0 });
  });

  it('une erreur dit son côté : la base, la demande, PostgREST, Grist', () => {
    const e = (statut, corps) => erreurDepuisReponse(statut, corps);
    assert.equal(e(403, { code: '42501', message: 'permission denied for table batiment' }).cote, 'base');
    assert.equal(e(404, { code: '42P01', message: 'table inconnue' }).cote, 'base');
    assert.equal(e(409, { code: '23505', message: 'duplicate key' }).cote, 'base');
    assert.equal(e(400, { code: '22023', message: 'zone invalide' }).cote, 'requete');
    assert.equal(e(400, { code: 'PGRST100', message: 'parse error' }).cote, 'requete');
    assert.equal(e(401, { code: 'PGRST301', message: 'No suitable key' }).cote, 'serveur');
    assert.equal(e(503, { code: 'PGRST000', message: 'connexion' }).cote, 'serveur');
    assert.equal(e(500, undefined).cote, 'serveur');
    assert.equal(e(403, { erreur: { code: 'ecriture_refusee', message: 'pas d’écriture', cote: 'requete' } }).code, 'ecriture_refusee');
    assert.equal(e(502, { erreur: { code: 'grist_injoignable', message: 'Grist ne répond pas', cote: 'grist' } }).cote, 'grist');
    assert.match(texteErreur(e(502, { erreur: { code: 'x', message: 'Grist ne répond pas', cote: 'grist' } })), /côté Grist/);
  });

  it('l’indice et le détail de PostgREST accompagnent le message', () => {
    const err = erreurDepuisReponse(400, { code: '22023', message: 'colonne sans SRID', details: null, hint: 'ALTER TABLE ...' });
    assert.match(err.message, /colonne sans SRID/);
    assert.match(err.message, /ALTER TABLE/);
  });
});

describe('pg-postgrest — la sonde de l’échangeur', () => {
  it('un échangeur s’annonce ; autre chose (404) n’en est pas un ; une panne réseau reste indéterminée', async () => {
    const m = monde();
    assert.equal((await sonderEchangeur(ECH, m.fetch)).postgrest, PG);
    assert.equal(await sonderEchangeur(ECH, monde({ annonce: null }).fetch), false);
    const mort = monde({ reseau: () => true });
    assert.equal(await sonderEchangeur(ECH, mort.fetch), null);
    assert.equal(await sonderEchangeur('pas une adresse', m.fetch), null);
  });

  it('la sonde d’identité reconnaît un échangeur : l’identité Grist, sans jeton à saisir', async () => {
    const m = monde();
    assert.equal(await sonderIdentite(ECH, m.fetch), true);
    assert.equal(await sonderIdentite(ECH, monde({ annonce: null }).fetch), false, 'ni passerelle de ce mode, ni échangeur');
  });

  it('le client automatique prend l’échangeur si l’adresse en est un, la passerelle sinon, et garde son choix', async () => {
    const m = monde();
    const a = creerClientAuto({ url: ECH, acces: acces(), fetchImpl: m.fetch, maintenant: () => m.horloge });
    assert.equal(a.mode(), null, 'rien n’est choisi avant la première commande');
    const info = await a.connexions();
    assert.equal(info.connexions[0].alias, 'base');
    assert.equal(a.mode(), 'postgrest');
    const sondes = m.appels.filter((x) => x.url.endsWith('/v1/echangeur')).length;
    await a.schema('base');
    assert.equal(m.appels.filter((x) => x.url.endsWith('/v1/echangeur')).length, sondes, 'une seule sonde');

    // Une passerelle `/v1/` : la sonde répond 404, l'appel part vers la commande de la passerelle.
    const vus = [];
    const passerelle = async (url, o = {}) => {
      vus.push(url);
      if (url.endsWith('/v1/echangeur')) return json({ detail: 'Not Found' }, 404);
      return json({ connexions: [{ alias: 'demo' }], limite_max: 5000, avertissements: [] });
    };
    const b = creerClientAuto({ url: 'https://pg.exemple.fr', acces: { entetes: () => ({}), apres401: async () => false }, fetchImpl: passerelle });
    assert.equal((await b.connexions()).connexions[0].alias, 'demo');
    assert.equal(b.mode(), 'passerelle');
    assert.ok(vus.some((u) => u.endsWith('/v1/pg_gateway_connexions')));
  });

  it('une sonde sans réponse n’est pas retenue : la commande suivante la refait', async () => {
    const m = monde({ reseau: () => true });
    const a = creerClientAuto({ url: ECH, acces: acces(), fetchImpl: m.fetch, maintenant: () => m.horloge });
    await assert.rejects(a.connexions(), (e) => e.name === 'ErreurPasserelle' && e.code === 'injoignable' && e.cote === 'serveur');
    assert.equal(a.mode(), null);
    m.reseau = null;
    assert.equal((await a.connexions()).connexions[0].alias, 'base');
    assert.equal(a.mode(), 'postgrest');
  });
});

describe('pg-postgrest — les jetons de l’échangeur', () => {
  it('rien n’est envoyé sans identité ; au premier 401 l’identité Grist part vers l’échangeur SEUL, le jeton émis vers PostgREST SEUL', async () => {
    const m = monde();
    const c = client(m);
    await c.connexions();
    const ech = appelsEch(m).filter((a) => a.url.endsWith('/v1/jeton'));
    assert.equal(ech.length, 2, 'un premier essai sans identité (401), puis le rejeu avec elle');
    assert.equal(ech[0].entetes.authorization, undefined);
    assert.equal(ech[1].entetes.authorization, 'Grist grist-1');
    for (const a of appelsPg(m)) {
      assert.match(a.entetes.authorization, /^Bearer jeton1l$/);
      assert.ok(!/grist/i.test(a.entetes.authorization), 'jamais l’identité Grist vers PostgREST');
    }
    for (const a of m.appels) assert.equal(a.credentials, 'omit', 'jamais de cookies');
  });

  it('un jeton de lecture sert tant qu’il est valable ; un seul échange pour des appels simultanés', async () => {
    const m = monde();
    const c = client(m);
    await Promise.all([c.connexions(), c.schema('base'), c.schema('base')]);
    assert.equal(m.emis.length, 1);
    await c.schema('base', true);
    assert.equal(m.emis.length, 1);
  });

  it('un jeton proche de son expiration est renouvelé avant de servir', async () => {
    const m = monde({ dureeJeton: 120 });
    const c = client(m);
    await c.connexions();
    m.horloge += 120_000 - MARGE_JETON_MS - 1;
    await c.schema('base', true);
    assert.equal(m.emis.length, 1);
    m.horloge += 2;
    await c.schema('base', true);
    assert.equal(m.emis.length, 2, 'dans la marge : un nouveau jeton');
    assert.equal(appelsPg(m).at(-1).entetes.authorization, 'Bearer jeton2l');
  });

  it('PostgREST refuse un jeton expiré (401) : un nouveau est demandé et la requête rejouée UNE fois', async () => {
    const m = monde();
    const c = client(m);
    await c.connexions();
    m.expires.add('jeton1l');
    const t = await c.schema('base', true);
    assert.equal(t.nb_tables, 2);
    assert.equal(m.emis.length, 2);
    // Toujours refusé : une seule reprise, puis l'erreur est dite.
    const m2 = monde();
    const normal = m2.fetch;
    m2.fetch = async (url, o) => (url.startsWith(PG) ? json({ code: 'PGRST301', message: 'No suitable key or wrong key type' }, 401) : normal(url, o));
    const c2 = creerClientPostgrest({ url: ECH, acces: acces(), annonce: m2.annonce, fetchImpl: m2.fetch, maintenant: () => m2.horloge });
    await assert.rejects(c2.connexions(), (e) => e.statut === 401 && e.cote === 'serveur' && e.code === 'PGRST301');
    assert.equal(m2.emis.length, 2, 'un jeton, puis un seul renouvellement');
  });

  it('le jeton d’écriture n’est demandé que pour une écriture, et distinct de celui de lecture', async () => {
    const m = monde();
    const c = client(m);
    await c.connexions();
    assert.deepEqual(m.emis.map((e) => e.ecriture), [false]);
    assert.deepEqual(appelsEch(m).filter((a) => a.url.endsWith('/v1/jeton')).map((a) => a.corps).at(-1), {});
  });

  it('les refus de l’échangeur sont dits avec leur côté (demande, Grist)', async () => {
    const m = monde({ refusEchange: { code: 'lecture_refusee', message: 'L’annuaire de ce document ne vous accorde pas la lecture.', cote: 'requete', statut: 403 } });
    await assert.rejects(client(m).connexions(), (e) => e.code === 'lecture_refusee' && e.cote === 'requete' && /annuaire/.test(texteErreur(e)));
    const g = monde({ refusEchange: { code: 'grist_injoignable', message: 'Grist ne répond pas.', cote: 'grist', statut: 502 } });
    await assert.rejects(client(g).connexions(), (e) => e.cote === 'grist' && /côté Grist/.test(texteErreur(e)));
  });

  it('un jeton de l’échangeur ne part pas vers une adresse non sûre (http hors machine locale)', async () => {
    const m = monde({ annonce: { echangeur: true, postgrest: 'http://pg.exemple.fr' } });
    const c = client(m);
    await assert.rejects(c.connexions(), (e) => e.code === 'adresse_refusee' && e.cote === 'requete');
    assert.equal(m.appels.filter((a) => a.url.startsWith('http://pg.exemple.fr')).length, 0, 'pas une seule requête vers cette adresse');
    assert.equal(m.emis.length, 0, 'pas même un jeton demandé');
  });

  it('un échangeur sans adresse de PostgREST le dit, et dit comment le régler', async () => {
    const m = monde({ annonce: { echangeur: true, postgrest: null } });
    const c = creerClientPostgrest({ url: ECH, acces: acces(), annonce: m.annonce, fetchImpl: m.fetch, maintenant: () => m.horloge });
    await assert.rejects(c.connexions(), (e) => e.code === 'postgrest_inconnu' && /ECHANGEUR_POSTGREST_URL/.test(e.message));
  });

  it('une panne réseau dit de quel serveur elle vient', async () => {
    const e1 = monde({ reseau: (u) => u.startsWith(ECH + '/v1/jeton') });
    await assert.rejects(client(e1).connexions(), (e) => e.code === 'injoignable' && /Échangeur injoignable/.test(e.message) && /ECHANGEUR_CORS_ORIGINES/.test(e.message));
    const e2 = monde({ reseau: (u) => u.startsWith(PG) });
    await assert.rejects(client(e2).connexions(), (e) => /PostgREST injoignable/.test(e.message) && /server-cors-allowed-origins/.test(e.message));
  });

  it('l’identité Grist refusée par la personne n’envoie rien et le dit', async () => {
    const m = monde();
    const dits = [];
    const refus = creerAccesGrist({ jeton: async () => ({ token: 'x' }), confirmer: async () => false, signaler: (t) => dits.push(t) });
    await assert.rejects(creerClientPostgrest({ url: ECH, acces: refus, annonce: m.annonce, fetchImpl: m.fetch, maintenant: () => m.horloge }).connexions(), (e) => e.statut === 401);
    assert.equal(m.emis.length, 0);
    assert.match(dits[0], /refusé/);
  });
});

describe('pg-postgrest — le contrat et le catalogue', () => {
  it('connexions : une base, avec ses versions et son plafond ; le contrat se lit dans le schéma « atlas »', async () => {
    const m = monde();
    const info = await client(m).connexions();
    assert.deepEqual(info.connexions, [{ alias: 'base', libelle: 'PostgreSQL 16.4 · PostGIS 3.4.2' }]);
    assert.equal(info.limite_max, 10000);
    const a = appelsPg(m).find((x) => x.url.endsWith('/rpc/contrat'));
    assert.equal(a.methode, 'GET');
    assert.equal(a.entetes['accept-profile'], 'atlas');
  });

  it('un contrat plus récent que celui qu’Atlas sait lire est refusé, dit', async () => {
    const m = monde();
    m.contrat = { ...m.contrat, contrat: CONTRAT_SUPPORTE + 1 };
    await assert.rejects(client(m).connexions(), (e) => e.code === 'contrat_trop_recent' && e.cote === 'base' && /mettez Atlas à jour/.test(e.message));
  });

  it('un contrat sans la capacité « zone », ou illisible, est refusé, dit', async () => {
    const m = monde();
    m.contrat = { ...m.contrat, capacites: ['tables'] };
    await assert.rejects(client(m).connexions(), (e) => e.code === 'contrat_incomplet');
    const n = monde();
    n.contrat = { postgresql: '16' };
    await assert.rejects(client(n).connexions(), (e) => e.code === 'contrat_illisible');
  });

  it('un contrat non installé (fonction absente) dit son origine : PostgREST ne trouve pas la fonction', async () => {
    const m = monde({ erreurPg: { statut: 404, corps: { code: 'PGRST202', message: 'Could not find the function atlas.contrat() in the schema cache', hint: null } } });
    await assert.rejects(client(m).connexions(), (e) => e.code === 'PGRST202' && /Could not find the function/.test(e.message));
  });

  it('schema : les tables lisibles, rangées par schéma, avec leurs géométries ; une colonne sans SRID est signalée', async () => {
    const m = monde();
    m.tables.push({ schema_nom: 'metier', table_nom: 'ancien', nature: 'table', geometries: [{ colonne: 'g', type: null, srid: 0, dimensions: 2 }], cle: [], lignes_estimees: null, lecture: true });
    const s = await client(m).schema('base');
    assert.equal(s.connexion, 'base');
    assert.equal(s.schemas.length, 1);
    assert.equal(s.schemas[0].nom, 'metier');
    assert.deepEqual(s.schemas[0].tables.map((t) => t.nom), ['batiment', 'journal', 'ancien']);
    const bat = s.schemas[0].tables[0];
    assert.deepEqual(bat.geometries, [{ colonne: 'geom', type: 'Polygon', srid: 4326, dimensions: 2 }]);
    assert.equal(bat.lignes_estimees, 120);
    assert.equal(s.nb_tables, 3);
    assert.equal(s.avertissements.length, 1);
    assert.match(s.avertissements[0], /metier\.ancien.*« g ».*système de coordonnées/);
  });

  it('schema : le catalogue est gardé, `rafraichir` le relit', async () => {
    const m = monde();
    const c = client(m);
    await c.schema('base');
    await c.schema('base');
    assert.equal(appelsPg(m).filter((a) => a.url.endsWith('/rpc/tables')).length, 1);
    await c.schema('base', true);
    assert.equal(appelsPg(m).filter((a) => a.url.endsWith('/rpc/tables')).length, 2);
  });

  it('table : les colonnes avec leur type Grist, leur clé et leur géométrie', async () => {
    const m = monde();
    const t = await client(m).commande('pg_gateway_table', { connexion: 'base', schema: 'metier', table: 'batiment' });
    assert.equal(t.lignes_estimees, 120);
    assert.deepEqual(t.colonnes.map((c) => [c.nom, c.type_grist, c.cle_primaire]), [['id', 'Int', true], ['nom', 'Text', false], ['hauteur', 'Numeric', false], ['geom', 'Text', false]]);
    assert.deepEqual(t.colonnes[3].geometrie, { type: 'Polygon', srid: 4326 });
    assert.equal(t.colonnes[0].geometrie, undefined);
    const appel = appelsPg(m).find((x) => x.url.includes('/rpc/colonnes'));
    assert.equal(new URL(appel.url).searchParams.get('schema_nom'), 'metier');
    assert.equal(new URL(appel.url).searchParams.get('table_nom'), 'batiment');
  });

  it('table : une table inconnue ou non lisible dit son côté (base)', async () => {
    const m = monde();
    await assert.rejects(client(m).commande('pg_gateway_table', { connexion: 'base', schema: 'metier', table: 'fantome' }), (e) => e.code === '42P01' && e.cote === 'base' && e.statut === 404);
  });
});

describe('pg-postgrest — une table en FeatureCollection (zone)', () => {
  it('la zone visible part en POST dans le schéma « atlas » ; la réponse a la forme de la passerelle', async () => {
    const m = monde();
    const fc = await client(m).couche({ connexion: 'base', schema: 'metier', table: 'batiment', bbox: [5.39, 43.29, 5.43, 43.33], limite: 2000 });
    const a = appelsPg(m).find((x) => x.url.endsWith('/rpc/entites_zone'));
    assert.equal(a.methode, 'POST');
    assert.equal(a.entetes['content-profile'], 'atlas');
    assert.deepEqual(a.corps, { schema_nom: 'metier', table_nom: 'batiment', ouest: 5.39, sud: 43.29, est: 5.43, nord: 43.33, limite: 2000 });
    assert.equal(fc.type, 'FeatureCollection');
    assert.equal(fc.features.length, 1);
    assert.equal(fc.nb_entites, 1);
    assert.equal(fc.tronque, false);
    assert.equal(fc.colonne_geometrie, 'geom');
    assert.deepEqual(fc.colonnes.map((c) => c.nom), ['id', 'nom', 'hauteur'], 'sans la colonne géométrique');
    assert.deepEqual(fc.colonnes.map((c) => c.type_grist), ['Int', 'Text', 'Numeric']);
    assert.deepEqual(fc.avertissements, []);
  });

  it('sans zone, c’est tout le monde ; sans limite, la base décide', async () => {
    const m = monde();
    await client(m).couche({ connexion: 'base', schema: 'metier', table: 'batiment' });
    const a = appelsPg(m).find((x) => x.url.endsWith('/rpc/entites_zone'));
    assert.deepEqual([a.corps.ouest, a.corps.sud, a.corps.est, a.corps.nord], [...MONDE]);
    assert.equal('limite' in a.corps, false);
  });

  it('un résultat tronqué le dit : `tronque`, la limite, et un avertissement — jamais une coupure silencieuse', async () => {
    const m = monde();
    m.zone = { type: 'FeatureCollection', geometrie: 'geom', limite: 10000, truncated: true, features: new Array(3).fill({ type: 'Feature', geometry: null, properties: {} }) };
    const fc = await client(m).couche({ connexion: 'base', schema: 'metier', table: 'batiment', limite: 99999 });
    assert.equal(fc.tronque, true);
    assert.equal(fc.limite, 10000);
    assert.match(fc.avertissements[0], /tronqué à 10000/);
  });

  it('la lecture par pages n’existe pas : elle est refusée, dite, jamais ignorée', async () => {
    const m = monde();
    await assert.rejects(client(m).couche({ connexion: 'base', schema: 'metier', table: 'batiment', decalage: 500 }), (e) => e.code === 'decalage_non_pris_en_charge' && e.cote === 'requete');
    assert.equal(appelsPg(m).length, 0, 'rien n’est demandé à PostgREST');
  });

  it('une zone invalide ou une colonne sans SRID : l’erreur de la base arrive avec son remède', async () => {
    const m = monde();
    const normal = m.fetch;
    m.fetch = async (url, o) => (url.endsWith('/rpc/entites_zone')
      ? json({ code: '22023', message: 'zone impossible : colonne sans système de coordonnées', details: null, hint: 'ALTER TABLE ... ALTER COLUMN ... TYPE geometry(<Type>, <SRID>)' }, 400)
      : normal(url, o));
    const c = creerClientPostgrest({ url: ECH, acces: acces(), annonce: m.annonce, fetchImpl: m.fetch, maintenant: () => m.horloge });
    await assert.rejects(c.couche({ connexion: 'base', schema: 'metier', table: 'batiment', bbox: [0, 0, 1, 1] }),
      (e) => e.cote === 'requete' && /ALTER TABLE/.test(e.message) && /côté votre demande/.test(texteErreur(e)));
  });

  it('une commande qu’on ne sait pas traduire est refusée, dite', async () => {
    await assert.rejects(client(monde()).commande('pg_gateway_inconnue', {}), (e) => e.code === 'commande_inconnue');
  });
});

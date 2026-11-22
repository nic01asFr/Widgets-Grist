import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { creerClientPostgrest, declarationModifiable, valeurPourPg, LOT_MAX } from '../lib/pg-postgrest.js';
import { creerAccesGrist } from '../lib/pg-acces-grist.js';
import { texteErreur } from '../lib/pg-passerelle.js';

const ECH = 'https://echangeur.exemple.fr';
const PG = 'https://pg.exemple.fr';

const json = (corps, statut = 200) => new Response(corps === undefined ? '' : JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });

const COLONNES = [
  { nom: 'id', type: 'integer', obligatoire: true, cle: true, geometrie: false, srid: null, ecrivable: true },
  { nom: 'nom', type: 'text', obligatoire: false, cle: false, geometrie: false, srid: null, ecrivable: true },
  { nom: 'construit', type: 'date', obligatoire: false, cle: false, geometrie: false, srid: null, ecrivable: true },
  { nom: 'releve', type: 'timestamp with time zone', obligatoire: false, cle: false, geometrie: false, srid: null, ecrivable: true },
  { nom: 'proprietaire', type: 'text', obligatoire: true, cle: false, geometrie: false, srid: null, ecrivable: true },
  { nom: 'actif', type: 'boolean', obligatoire: true, cle: false, geometrie: false, srid: null, ecrivable: true },
  { nom: 'version', type: 'integer', obligatoire: true, cle: false, geometrie: false, srid: null, ecrivable: true },
  { nom: 'geom', type: 'geometry(Polygon,4326)', obligatoire: false, cle: false, geometrie: true, srid: 4326, ecrivable: true },
  { nom: 'calcul', type: 'integer', obligatoire: false, cle: false, geometrie: false, srid: null, ecrivable: false },
];
const sans = (...noms) => COLONNES.filter((c) => !noms.includes(c.nom));

const ligneTable = (table, surcharge = {}) => ({
  schema_nom: 'metier', table_nom: table, nature: 'table', geometries: [], cle: ['id'], lignes_estimees: 3,
  lecture: true, insertion: true, modification: true, suppression: false, securite_par_ligne: true, ...surcharge,
});

/**
 * Un échangeur et un PostgREST de poche avec UNE table (metier.batiment) en mémoire : clé id, colonne version, colonne actif, sécurité par ligne
 * (l'éditeur ne voit et n'écrit que ses lignes). Tout appel est noté.
 */
function monde(reglages = {}) {
  const m = {
    appels: [], emis: [],
    rows: [
      { id: 1, nom: 'Mairie', construit: '1950-03-01', releve: null, proprietaire: 'alice@exemple.fr', actif: true, version: 1, geom: { type: 'Polygon', coordinates: [] }, calcul: 5 },
      { id: 2, nom: 'Ecole', construit: '1972-09-01', releve: null, proprietaire: 'alice@exemple.fr', actif: true, version: 4, geom: null, calcul: 6 },
      { id: 3, nom: 'Entrepot', construit: null, releve: null, proprietaire: 'bob@exemple.fr', actif: true, version: 1, geom: null, calcul: 7 },
    ],
    tablesEditeur: [
      ligneTable('batiment', { suppression: false }),
      ligneTable('journal', { suppression: true }),         // pas de colonne « actif » : suppression réelle
      ligneTable('sans_version'),                             // écrivable mais sans version : écartée, dite
      ligneTable('carte', { nature: 'vue' }),                  // une vue : écartée, dite
      ligneTable('lecture_seule', { insertion: false, modification: false }), // pas d'écriture : rien à dire
      ligneTable('sans_cle', { cle: [] }),
    ],
    colonnes: {
      'metier.batiment': COLONNES, 'metier.journal': sans('actif', 'geom', 'releve', 'construit', 'proprietaire', 'calcul'),
      'metier.sans_version': sans('version'), 'metier.carte': COLONNES, 'metier.lecture_seule': COLONNES, 'metier.sans_cle': COLONNES,
    },
    panneJeton: null,
    ...reglages,
  };
  const visibles = () => m.rows.filter((r) => r.proprietaire === 'alice@exemple.fr');
  const filtres = (u) => {
    const f = {};
    for (const [k, v] of u.searchParams) if (v.startsWith('eq.')) f[k] = v.slice(3);
    return f;
  };
  const correspond = (r, f) => Object.entries(f).every(([k, v]) => String(r[k]) === v);
  const colonnesRendues = (u) => (u.searchParams.get('select') || '*').split(',');
  const rendre = (r, u) => Object.fromEntries(colonnesRendues(u).map((c) => [c, r[c]]));

  m.fetch = async (url, options = {}) => {
    const u = new URL(url);
    const methode = options.method || 'GET';
    const entetes = Object.fromEntries(Object.entries(options.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const corps = options.body ? JSON.parse(options.body) : undefined;
    m.appels.push({ url, methode, entetes, corps });
    if (u.origin === new URL(ECH).origin) {
      if (u.pathname === '/v1/jeton') {
        if (!String(entetes.authorization || '').startsWith('Grist ')) return json({ erreur: { code: 'jeton_grist_absent', message: 'attendu', cote: 'requete' } }, 401);
        const ecriture = !!(corps && corps.ecriture);
        const valeur = `jeton${m.emis.length + 1}${ecriture ? 'e' : 'l'}`;
        m.emis.push({ valeur, ecriture });
        return json({ access_token: valeur, expires_in: 600, role: ecriture ? 'atlas_editeur' : 'atlas_lecteur', email: 'alice@exemple.fr' });
      }
      return json({ detail: 'Not Found' }, 404);
    }
    const porteur = String(entetes.authorization || '').replace(/^Bearer /, '');
    const jeton = m.emis.find((e) => e.valeur === porteur);
    if (!jeton) return json({ code: 'PGRST303', message: 'JWT expired' }, 401);
    const chemin = u.pathname;
    if (chemin === '/rpc/tables_editeur') return json(m.tablesEditeur);
    if (chemin === '/rpc/colonnes') {
      const c = m.colonnes[`${u.searchParams.get('schema_nom')}.${u.searchParams.get('table_nom')}`];
      return c ? json(c) : json({ code: '42P01', message: 'table inconnue' }, 404);
    }
    if (chemin === '/rpc/lignes') {
      let lignes = visibles();
      if (Array.isArray(corps.cles)) lignes = lignes.filter((r) => corps.cles.some((c) => correspond(r, Object.fromEntries(Object.entries(c).map(([k, v]) => [k, String(v)])))));
      const limite = corps.limite || 1000;
      const debut = corps.decalage || 0;
      const page = lignes.slice(debut, debut + limite);
      return json({ limite, decalage: debut, truncated: lignes.length > debut + limite, lignes: page });
    }
    if (chemin === '/batiment' || chemin === '/journal') {
      if (m.erreurEcriture) return json(m.erreurEcriture.corps, m.erreurEcriture.statut);
      if (!jeton.ecriture) return json({ code: '42501', message: 'permission denied for table batiment' }, 403);
      if (entetes['content-profile'] !== 'metier') return json({ code: 'PGRST106', message: 'The schema must be one of the following: atlas' }, 406);
      if (methode === 'POST') {
        const nouvelle = { id: Math.max(...m.rows.map((r) => r.id)) + 1, actif: true, version: 1, ...corps };
        if (nouvelle.proprietaire !== 'alice@exemple.fr') return json({ code: '42501', message: 'new row violates row-level security policy for table "batiment"' }, 403);
        m.rows.push(nouvelle);
        return json([rendre(nouvelle, u)], 201);
      }
      const f = filtres(u);
      const touchees = visibles().filter((r) => correspond(r, f));
      if (methode === 'PATCH') {
        touchees.forEach((r) => { Object.assign(r, corps); r.version += 1; });
        return json(touchees.map((r) => rendre(r, u)));
      }
      if (methode === 'DELETE') {
        m.rows = m.rows.filter((r) => !touchees.includes(r));
        return json(touchees.map((r) => rendre(r, u)));
      }
    }
    return json({ detail: 'Not Found' }, 404);
  };
  return m;
}

const acces = () => creerAccesGrist({ jeton: async () => ({ token: 'grist-1', ttlMsecs: 900000 }), confirmer: async () => true });
const client = (m) => creerClientPostgrest({ url: ECH, acces: acces(), annonce: { postgrest: PG }, fetchImpl: m.fetch });
const C = { connexion: 'base', schema: 'metier', table: 'batiment' };
const ecritures = (m) => m.appels.filter((a) => ['PATCH', 'POST', 'DELETE'].includes(a.methode) && !a.url.includes('/rpc/') && a.url.startsWith(PG));

describe('pg-postgrest — conventions d’écriture (fonctions pures)', () => {
  it('les dates arrivent en secondes et partent en ISO ; le reste passe tel quel', () => {
    assert.equal(valeurPourPg(0, 'date'), '1970-01-01');
    assert.equal(valeurPourPg(86400 * 365, 'date'), '1971-01-01');
    assert.equal(valeurPourPg(1_700_000_000, 'timestamp with time zone'), '2023-11-14T22:13:20.000Z');
    assert.equal(valeurPourPg('2020-05-01', 'date'), '2020-05-01', 'déjà en ISO : inchangé');
    assert.equal(valeurPourPg(12.5, 'numeric(6,2)'), 12.5);
    assert.equal(valeurPourPg(null, 'date'), null);
    assert.equal(valeurPourPg(undefined, 'text'), null);
    const g = { type: 'Point', coordinates: [1, 2] };
    assert.equal(valeurPourPg(g, 'geometry(Point,4326)'), g);
  });

  it('une table est modifiable avec droit d’écrire, clé primaire et colonne entière « version »', () => {
    const { decl } = declarationModifiable(ligneTable('batiment'), COLONNES);
    assert.deepEqual(decl.cle, ['id']);
    assert.equal(decl.version, 'version');
    assert.equal(decl.geometrie, 'geom');
    assert.equal(decl.suppression, 'etat:actif');
    assert.deepEqual(decl.operations, ['inserer', 'modifier', 'desactiver', 'reactiver']);
    assert.deepEqual(decl.colonnes, ['nom', 'construit', 'releve', 'proprietaire', 'geom'], 'ni la clé, ni la version, ni l’état, ni une colonne calculée');
  });

  it('sans colonne « actif », le droit de suppression ouvre « supprimer » ; sans ce droit, rien', () => {
    const avec = declarationModifiable(ligneTable('journal', { suppression: true }), sans('actif')).decl;
    assert.equal(avec.suppression, 'reelle');
    assert.deepEqual(avec.operations, ['inserer', 'modifier', 'supprimer']);
    const sansDroit = declarationModifiable(ligneTable('journal'), sans('actif')).decl;
    assert.equal(sansDroit.suppression, 'interdite');
    assert.deepEqual(sansDroit.operations, ['inserer', 'modifier']);
  });

  it('chaque écart est dit : sans version, vue, sans clé, version de texte ; une table en lecture seule n’en dit rien', () => {
    assert.match(declarationModifiable(ligneTable('t'), sans('version')).raison, /sans colonne entière « version ».*conflit/);
    assert.match(declarationModifiable(ligneTable('t', { nature: 'vue' }), COLONNES).raison, /vue/);
    assert.match(declarationModifiable(ligneTable('t', { cle: [] }), COLONNES).raison, /sans clé primaire/);
    const texte = COLONNES.map((c) => (c.nom === 'version' ? { ...c, type: 'text' } : c));
    assert.match(declarationModifiable(ligneTable('t'), texte).raison, /version/);
    assert.deepEqual(declarationModifiable(ligneTable('t', { insertion: false, modification: false }), COLONNES), { decl: null, raison: null });
  });
});

describe('pg-postgrest — tables modifiables et lecture des lignes', () => {
  it('les tables modifiables sont celles de l’éditeur, lues AVEC UN JETON DE LECTURE ; les écarts sont dits', async () => {
    const m = monde();
    const r = await client(m).commande('pg_gateway_tables_modifiables', { connexion: 'base' });
    assert.deepEqual(r.tables.map((t) => t.table).sort(), ['batiment', 'journal']);
    assert.equal(r.lot_max, LOT_MAX);
    assert.equal(r.avertissements.length, 3, 'sans version, vue, sans clé');
    assert.deepEqual(m.emis.map((e) => e.ecriture), [false], 'aucun jeton d’écriture pour le savoir');
  });

  it('lire : la clé, les valeurs déclarées, la version et l’état ; ni la version ni l’état parmi les valeurs', async () => {
    const m = monde();
    const r = await client(m).commande('pg_gateway_lire', C);
    assert.equal(r.nb_lignes, 2, 'la sécurité par ligne : pas l’entrepôt de Bob');
    assert.deepEqual(r.lignes[0].cle, { id: 1 });
    assert.equal(r.lignes[0].version, 1);
    assert.equal(r.lignes[0].actif, true);
    assert.deepEqual(Object.keys(r.lignes[0].valeurs), ['nom', 'construit', 'releve', 'proprietaire', 'geom']);
    assert.equal(r.lignes[0].valeurs.construit, '1950-03-01');
    assert.equal(r.tronque, false);
    assert.equal(r.suivant, null);
    const rpc = m.appels.find((a) => a.url.endsWith('/rpc/lignes'));
    assert.equal(rpc.entetes['content-profile'], 'atlas');
    assert.deepEqual(rpc.corps, { schema_nom: 'metier', table_nom: 'batiment' });
  });

  it('lire par pages : `suivant` est le décalage de la page suivante, jamais deviné', async () => {
    const m = monde();
    const c = client(m);
    const p1 = await c.commande('pg_gateway_lire', { ...C, limite: 1 });
    assert.equal(p1.tronque, true);
    assert.equal(p1.suivant, 1);
    const p2 = await c.commande('pg_gateway_lire', { ...C, limite: 1, decalage: p1.suivant });
    assert.equal(p2.lignes[0].cle.id, 2);
    assert.equal(p2.tronque, false);
    assert.equal(p2.suivant, null);
  });

  it('lire par clés', async () => {
    const m = monde();
    const r = await client(m).commande('pg_gateway_lire', { ...C, cles: [{ id: 2 }] });
    assert.deepEqual(r.lignes.map((l) => l.valeurs.nom), ['Ecole']);
    assert.equal(r.lignes[0].version, 4);
  });

  it('lire une table qui n’est pas modifiable est refusé, dit', async () => {
    await assert.rejects(client(monde()).commande('pg_gateway_lire', { ...C, table: 'sans_version' }), (e) => e.code === 'table_non_modifiable' && e.cote === 'requete');
  });
});

describe('pg-postgrest — écrire', () => {
  const ligne1 = { cle: { id: 1 }, version_attendue: 1 };

  it('modifier : un PATCH à la version lue, avec le jeton d’ÉCRITURE ; la nouvelle version revient', async () => {
    const m = monde();
    const r = await client(m).commande('pg_gateway_ecrire', { ...C, operations: [{ op: 'modifier', ...ligne1, valeurs: { nom: 'Mairie 2', construit: 86400 } }] });
    const a = ecritures(m)[0];
    assert.equal(a.methode, 'PATCH');
    const u = new URL(a.url);
    assert.equal(u.pathname, '/batiment');
    assert.equal(u.searchParams.get('id'), 'eq.1');
    assert.equal(u.searchParams.get('version'), 'eq.1');
    assert.equal(a.entetes['content-profile'], 'metier');
    assert.equal(a.entetes.prefer, 'return=representation');
    assert.deepEqual(a.corps, { nom: 'Mairie 2', construit: '1970-01-02' });
    assert.match(a.entetes.authorization, /^Bearer jeton\d+e$/, 'le jeton d’écriture (suffixe e)');
    assert.deepEqual([r.ok, r.conflits, r.refus, r.applique, r.mode], [1, 0, 0, true, 'appliquer']);
    assert.deepEqual(r.resultats[0], { index: 0, operation: 'modifier', statut: 'ok', cle: { id: 1 }, version: 2 });
    assert.equal(m.rows[0].nom, 'Mairie 2');
  });

  it('un conflit : la ligne a changé depuis la lecture, rien n’est écrit, la valeur actuelle revient', async () => {
    const m = monde();
    const c = client(m);
    await c.commande('pg_gateway_ecrire', { ...C, operations: [{ op: 'modifier', ...ligne1, valeurs: { nom: 'Premier' } }] });
    const r = await c.commande('pg_gateway_ecrire', { ...C, operations: [{ op: 'modifier', ...ligne1, valeurs: { nom: 'Second' } }] });
    assert.deepEqual([r.ok, r.conflits, r.refus, r.applique], [0, 1, 0, false]);
    const x = r.resultats[0];
    assert.equal(x.statut, 'conflit');
    assert.equal(x.version_actuelle, 2);
    assert.equal(x.valeurs_actuelles.nom, 'Premier');
    assert.equal(m.rows[0].nom, 'Premier', 'le second n’a rien écrasé');
  });

  it('la ligne d’un autre (ou disparue) ressort « introuvable », jamais « réussie » : un PATCH vide n’est pas un succès', async () => {
    const m = monde();
    const r = await client(m).commande('pg_gateway_ecrire', { ...C, operations: [{ op: 'modifier', cle: { id: 3 }, version_attendue: 1, valeurs: { nom: 'Pirate' } }] });
    assert.equal(r.ok, 0);
    assert.equal(r.resultats[0].statut, 'introuvable');
    assert.equal(r.resultats[0].cote, 'base');
    assert.equal(m.rows[2].nom, 'Entrepot');
  });

  it('une ligne visible à la bonne version que la base n’a pas modifiée : refus de la base, dit', async () => {
    const m = monde();
    const normal = m.fetch;
    m.fetch = async (url, o) => (o && o.method === 'PATCH' ? json([]) : normal(url, o)); // une politique d'UPDATE qui refuse en silence
    const r = await creerClientPostgrest({ url: ECH, acces: acces(), annonce: { postgrest: PG }, fetchImpl: m.fetch })
      .commande('pg_gateway_ecrire', { ...C, operations: [{ op: 'modifier', ...ligne1, valeurs: { nom: 'X' } }] });
    assert.equal(r.resultats[0].statut, 'refuse');
    assert.equal(r.resultats[0].code, 'ligne_non_modifiee');
    assert.equal(r.refus, 1);
  });

  it('inserer : un POST, la clé et la version attribuées par la base reviennent', async () => {
    const m = monde();
    const r = await client(m).commande('pg_gateway_ecrire', { ...C, operations: [{ op: 'inserer', valeurs: { nom: 'Nouveau', proprietaire: 'alice@exemple.fr' } }] });
    assert.deepEqual(r.resultats[0], { index: 0, operation: 'inserer', statut: 'ok', cle: { id: 4 }, version: 1 });
    assert.equal(ecritures(m)[0].methode, 'POST');
  });

  it('la sécurité par ligne refuse une insertion pour un autre : refus de la base, par opération, avec son code', async () => {
    const m = monde();
    const r = await client(m).commande('pg_gateway_ecrire', { ...C, operations: [{ op: 'inserer', valeurs: { nom: 'Chez bob', proprietaire: 'bob@exemple.fr' } }] });
    assert.equal(r.ok, 0);
    assert.deepEqual([r.resultats[0].statut, r.resultats[0].code, r.resultats[0].cote], ['refuse', '42501', 'base']);
    assert.match(r.resultats[0].message, /row-level security/);
  });

  it('désactiver et réactiver passent par la colonne « actif » ; « supprimer » n’est pas ouvert quand elle existe', async () => {
    const m = monde();
    const c = client(m);
    const d = await c.commande('pg_gateway_ecrire', { ...C, operations: [{ op: 'desactiver', ...ligne1 }] });
    assert.deepEqual(ecritures(m)[0].corps, { actif: false });
    assert.equal(d.resultats[0].statut, 'ok');
    const r = await c.commande('pg_gateway_ecrire', { ...C, operations: [{ op: 'reactiver', cle: { id: 1 }, version_attendue: 2 }] });
    assert.deepEqual(ecritures(m)[1].corps, { actif: true });
    assert.equal(r.resultats[0].statut, 'ok');
    const s = await c.commande('pg_gateway_ecrire', { ...C, operations: [{ op: 'supprimer', cle: { id: 1 }, version_attendue: 3 }] });
    assert.deepEqual([s.resultats[0].statut, s.resultats[0].code], ['refuse', 'operation_non_ouverte']);
    assert.equal(ecritures(m).length, 2, 'rien n’est envoyé pour une opération fermée');
  });

  it('supprimer (table sans « actif ») : un DELETE à la version lue', async () => {
    const m = monde();
    const r = await client(m).commande('pg_gateway_ecrire', { ...C, table: 'journal', operations: [{ op: 'supprimer', ...ligne1 }] });
    assert.equal(r.ok, 1);
    const a = ecritures(m)[0];
    assert.equal(a.methode, 'DELETE');
    assert.equal(new URL(a.url).pathname, '/journal');
    assert.equal(new URL(a.url).searchParams.get('version'), 'eq.1');
  });

  it('une version attendue absente, une colonne inconnue ou une clé incomplète sont refusées AVANT toute requête', async () => {
    const m = monde();
    const c = client(m);
    const r = await c.commande('pg_gateway_ecrire', { ...C, atomique: false, operations: [
      { op: 'modifier', cle: { id: 1 }, valeurs: { nom: 'x' } },
      { op: 'modifier', ...ligne1, valeurs: { colonne_fantome: 1 } },
      { op: 'modifier', ...ligne1, valeurs: { calcul: 9 } },
      { op: 'modifier', cle: {}, version_attendue: 1, valeurs: { nom: 'x' } },
      { op: 'modifier', ...ligne1, valeurs: {} },
      { op: 'detruire', ...ligne1 },
    ] });
    assert.deepEqual(r.resultats.map((x) => x.code), ['version_attendue_absente', 'colonne_non_ouverte', 'colonne_non_ouverte', 'cle_incomplete', 'aucune_valeur', 'operation_non_ouverte']);
    assert.equal(r.refus, 6);
    assert.equal(ecritures(m).length, 0);
  });

  it('un lot de plusieurs opérations ne se dit pas atomique ; opération par opération, dans l’ordre, chacune à sa version', async () => {
    const m = monde();
    const c = client(m);
    const operations = [
      { op: 'modifier', cle: { id: 1 }, version_attendue: 1, valeurs: { nom: 'A' } },
      { op: 'modifier', cle: { id: 2 }, version_attendue: 99, valeurs: { nom: 'B' } },
      { op: 'modifier', cle: { id: 2 }, version_attendue: 4, valeurs: { nom: 'C' } },
    ];
    await assert.rejects(c.commande('pg_gateway_ecrire', { ...C, operations }), (e) => e.code === 'atomique_non_pris_en_charge' && e.cote === 'requete');
    assert.equal(ecritures(m).length, 0);
    const r = await c.commande('pg_gateway_ecrire', { ...C, operations, atomique: false });
    assert.deepEqual(r.resultats.map((x) => x.statut), ['ok', 'conflit', 'ok']);
    assert.deepEqual([r.ok, r.conflits, r.refus, r.atomique], [2, 1, 0, false]);
    assert.deepEqual(r.resultats.map((x) => x.index), [0, 1, 2]);
  });

  it('un lot trop grand, ou vide, est refusé', async () => {
    const c = client(monde());
    const op = { op: 'modifier', ...ligne1, valeurs: { nom: 'x' } };
    await assert.rejects(c.commande('pg_gateway_ecrire', { ...C, atomique: false, operations: new Array(LOT_MAX + 1).fill(op) }), (e) => e.code === 'lot_trop_grand');
    await assert.rejects(c.commande('pg_gateway_ecrire', { ...C, operations: [] }), (e) => e.code === 'operations_absentes');
  });

  it('simuler : on lit, on n’écrit rien ; conflits et lignes disparues sont vus, les contraintes ne le sont pas et on le dit', async () => {
    const m = monde();
    const r = await client(m).commande('pg_gateway_ecrire', { ...C, mode: 'simuler', atomique: false, operations: [
      { op: 'modifier', ...ligne1, valeurs: { nom: 'A' } },
      { op: 'modifier', cle: { id: 2 }, version_attendue: 1, valeurs: { nom: 'B' } },
      { op: 'modifier', cle: { id: 3 }, version_attendue: 1, valeurs: { nom: 'C' } },
      { op: 'inserer', valeurs: { nom: 'D' } },
    ] });
    assert.deepEqual(r.resultats.map((x) => x.statut), ['ok', 'conflit', 'introuvable', 'ok']);
    assert.equal(r.applique, false);
    assert.equal(r.mode, 'simuler');
    assert.match(r.avertissements[0], /Simulation partielle/);
    assert.equal(ecritures(m).length, 0, 'aucune écriture, pas même en essai');
    assert.equal(m.rows[0].nom, 'Mairie');
  });

  it('une clé d’idempotence n’existe pas : la dire, jamais l’ignorer en silence', async () => {
    const r = await client(monde()).commande('pg_gateway_ecrire', { ...C, cle_idempotence: 'abc', operations: [{ op: 'modifier', ...ligne1, valeurs: { nom: 'x' } }] });
    assert.ok(r.avertissements.some((a) => /idempotence/.test(a)));
    assert.equal(r.rejoue, false);
  });

  it('un jeton de lecture sert à lire ; l’écriture en demande un autre, une seule fois', async () => {
    const m = monde();
    const c = client(m);
    await c.commande('pg_gateway_lire', C);
    await c.commande('pg_gateway_ecrire', { ...C, operations: [{ op: 'modifier', ...ligne1, valeurs: { nom: 'x' } }] });
    await c.commande('pg_gateway_ecrire', { ...C, operations: [{ op: 'modifier', cle: { id: 2 }, version_attendue: 4, valeurs: { nom: 'y' } }] });
    assert.deepEqual(m.emis.map((e) => e.ecriture), [false, true]);
  });

  it('une panne du serveur n’est pas un « refus » d’une ligne : elle interrompt et se dit', async () => {
    const m = monde({ erreurEcriture: { statut: 503, corps: { code: 'PGRST000', message: 'Could not connect to the database' } } });
    await assert.rejects(client(m).commande('pg_gateway_ecrire', { ...C, operations: [{ op: 'modifier', ...ligne1, valeurs: { nom: 'x' } }] }),
      (e) => e.cote === 'serveur' && e.statut === 503 && /côté la passerelle/.test(texteErreur(e)));
  });

  it('un schéma que PostgREST n’expose pas dit comment le régler', async () => {
    const m = monde();
    m.tablesEditeur[0] = ligneTable('batiment', { schema_nom: 'autre' });
    m.colonnes['autre.batiment'] = COLONNES;
    const normal = m.fetch;
    m.fetch = async (url, o) => (url.startsWith(PG + '/batiment') ? json({ code: 'PGRST106', message: 'The schema must be one of the following: atlas' }, 406) : normal(url, o));
    const c = creerClientPostgrest({ url: ECH, acces: acces(), annonce: { postgrest: PG }, fetchImpl: m.fetch });
    await assert.rejects(c.commande('pg_gateway_ecrire', { connexion: 'base', schema: 'autre', table: 'batiment', operations: [{ op: 'modifier', ...ligne1, valeurs: { nom: 'x' } }] }),
      (e) => e.code === 'PGRST106' && e.cote === 'serveur' && /pgrst\.db_schemas/.test(e.message));
  });

  it('les clés et les valeurs sont encodées dans l’adresse : jamais d’injection de filtre', async () => {
    const m = monde();
    await client(m).commande('pg_gateway_ecrire', { ...C, operations: [{ op: 'modifier', cle: { id: '1&version=gt.0' }, version_attendue: '1&x=1', valeurs: { nom: 'x' } }] });
    const u = new URL(ecritures(m)[0].url);
    assert.equal(u.searchParams.get('id'), 'eq.1&version=gt.0');
    assert.equal(u.searchParams.get('version'), 'eq.1&x=1');
    assert.equal(u.searchParams.get('x'), null);
  });
});

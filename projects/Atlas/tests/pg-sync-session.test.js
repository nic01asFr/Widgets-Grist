import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planCopie } from '../lib/pg-sync-copie.js';
import {
  enregistrerCopie, lireCopies, detacherCopie, comparer, appliquer, planifier, valeursPgVersGrist, lignesDe, configValide,
  ErreurSync, TABLE_COPIES, simulerPoussee,
} from '../lib/pg-sync-session.js';
import { TABLE_SYNC, cleCanon } from '../lib/pg-sync.js';

/** Un faux document Grist : tables, colonnes, lignes, et les actions que le code emploie. */
function fauxGrist() {
  const tables = new Map();
  const journal = [];
  const creer = (nom, defs) => tables.set(nom, { cols: defs.map((d) => d.id), lignes: [], suivant: 1 });
  const ajouter = (t, valeurs) => { const l = { id: t.suivant++ }; for (const c of t.cols) l[c] = valeurs[c] ?? null; t.lignes.push(l); return l.id; };
  return {
    tables, journal,
    listTables: async () => [...tables.keys()],
    fetchTable: async (nom) => {
      const t = tables.get(nom);
      if (!t) throw new Error('table inconnue ' + nom);
      const sortie = { id: t.lignes.map((l) => l.id) };
      for (const c of t.cols) sortie[c] = t.lignes.map((l) => l[c]);
      return sortie;
    },
    applyUserActions: async (actions) => {
      const retours = [];
      for (const a of actions) {
        journal.push(a[0] + ' ' + a[1]);
        if (a[0] === 'AddTable') { creer(a[1], a[2]); retours.push({ table_id: a[1] }); continue; }
        const t = tables.get(a[1]);
        if (!t) throw new Error('table inconnue ' + a[1]);
        if (a[0] === 'AddRecord') retours.push(ajouter(t, a[3]));
        else if (a[0] === 'UpdateRecord') { Object.assign(t.lignes.find((l) => l.id === a[2]), a[3]); retours.push(null); }
        else if (a[0] === 'RemoveRecord') { t.lignes = t.lignes.filter((l) => l.id !== a[2]); retours.push(null); }
        else if (a[0] === 'BulkAddRecord') {
          const n = a[2].length;
          for (let i = 0; i < n; i++) ajouter(t, Object.fromEntries(Object.entries(a[3]).map(([k, v]) => [k, v[i]])));
          retours.push(null);
        } else if (a[0] === 'BulkRemoveRecord') { t.lignes = t.lignes.filter((l) => !a[2].includes(l.id)); retours.push(null); }
        else throw new Error('action inconnue ' + a[0]);
      }
      return { retValues: retours };
    },
    // aides de test : modifier « à la main » comme le ferait une personne dans Grist
    ligne: (nom, id) => tables.get(nom).lignes.find((l) => l.id === id),
    modifier(nom, id, valeurs) { Object.assign(this.ligne(nom, id), valeurs); },
    ajouter: (nom, valeurs) => ajouter(tables.get(nom), valeurs),
    supprimer(nom, id) { tables.get(nom).lignes = tables.get(nom).lignes.filter((l) => l.id !== id); },
  };
}

/** Une fausse passerelle qui imite la vraie : versions entières, conflit si la version lue est périmée, désactivation logique. */
class FauxPg {
  constructor() { this.lignes = new Map(); this.suivant = 1; this.appels = []; this.panne = false; this.tronque = false; }
  ajouter(valeurs, id = null) {
    const i = id ?? this.suivant;
    this.suivant = Math.max(this.suivant, i + 1);
    this.lignes.set(i, { id: i, type: null, cout: null, date_intervention: null, geom: null, version: 1, actif: true, ...valeurs });
    return i;
  }
  bouger(id, valeurs) { const l = this.lignes.get(id); Object.assign(l, valeurs); l.version++; }
  async commande(nom, corps) {
    this.appels.push({ nom, corps });
    if (nom === 'pg_gateway_lire') {
      const lignes = [...this.lignes.values()].sort((a, b) => a.id - b.id).map((l) => ({
        cle: { id: l.id }, valeurs: { type: l.type, cout: l.cout, date_intervention: l.date_intervention, geom: l.geom }, version: l.version, actif: l.actif,
      }));
      return { lignes, nb_lignes: lignes.length, tronque: this.tronque };
    }
    if (nom !== 'pg_gateway_ecrire') throw new Error('commande inconnue ' + nom);
    if (this.panne) throw new Error('Passerelle injoignable');
    const sauvegarde = corps.mode === 'simuler' ? JSON.parse(JSON.stringify([...this.lignes.entries()])) : null;
    const suivantAvant = this.suivant;
    const resultats = corps.operations.map((op, index) => {
      const base = { index, operation: op.op };
      if (op.op === 'inserer') {
        const id = op.cle ? op.cle.id : this.suivant;
        if (this.lignes.has(id)) return { ...base, statut: 'conflit', code: 'cle_existante' };
        this.ajouter(op.valeurs, id);
        return { ...base, statut: 'ok', cle: { id }, version: 1 };
      }
      const l = this.lignes.get(op.cle.id);
      if (!l) return { ...base, statut: 'introuvable', code: 'ligne_introuvable' };
      if (String(l.version) !== String(op.version_attendue)) {
        return { ...base, statut: 'conflit', code: 'version_perimee', version_actuelle: l.version };
      }
      if (op.op === 'supprimer') { this.lignes.delete(l.id); return { ...base, statut: 'ok', cle: { id: l.id }, version: null }; }
      if (op.op === 'modifier') Object.assign(l, op.valeurs);
      if (op.op === 'desactiver') l.actif = false;
      if (op.op === 'reactiver') l.actif = true;
      l.version++;
      return { ...base, statut: 'ok', cle: { id: l.id }, version: l.version };
    });
    if (sauvegarde) { this.lignes = new Map(sauvegarde); this.suivant = suivantAvant; } // simuler : tout est annulé
    return { resultats, ok: resultats.filter((r) => r.statut === 'ok').length, applique: !sauvegarde };
  }
}

const DECL = { schema: 'public', table: 'interventions', cle: ['id'], colonnes: ['type', 'cout', 'date_intervention', 'geom'], geometrie: 'geom', version: 'version', suppression: 'etat:actif' };
const TABLE_PG = { colonnes: [
  { nom: 'id', type_grist: 'Int' }, { nom: 'type', type_grist: 'Text' }, { nom: 'cout', type_grist: 'Numeric' },
  { nom: 'date_intervention', type_grist: 'Date' }, { nom: 'geom', type_grist: 'Text' },
] };
const pt = (x, y) => ({ type: 'Point', coordinates: [x, y] });

/** Une copie fraîchement importée : 3 interventions, comme le fait le panneau (plan, table, lignes, « vu »). */
async function monterCopie(decl = DECL) {
  const pg = new FauxPg();
  pg.ajouter({ type: 'a', cout: 10, date_intervention: '2026-01-08', geom: pt(3.7, 43.4) });
  pg.ajouter({ type: 'b', cout: 20, date_intervention: '2026-01-15', geom: pt(3.71, 43.41) });
  pg.ajouter({ type: 'c', cout: null, date_intervention: '2026-01-22', geom: pt(3.72, 43.42) });
  const grist = fauxGrist();
  const lecture = await pg.commande('pg_gateway_lire', {});
  const plan = planCopie({ lecture, table: TABLE_PG, decl, url: 'https://pg.exemple.fr/', connexion: 'metier', nom: 'Interventions', tables: [] });
  assert.equal(plan.ok, true, plan.erreur);
  await grist.applyUserActions([['AddTable', plan.tableId, plan.colonnes.map(({ id, type, label }) => ({ id, type, label }))]]);
  for (const [d, f] of plan.lots) {
    const cols = {};
    for (const [id, vals] of Object.entries(plan.valeurs)) cols[id] = vals.slice(d, f);
    await grist.applyUserActions([['BulkAddRecord', plan.tableId, new Array(f - d).fill(null), cols]]);
  }
  const { config } = await enregistrerCopie({ docApi: grist, copie: plan.copie, tableId: plan.tableId });
  return { pg, grist, plan, config };
}

const sync = async ({ grist, pg, config }, choix = {}, options = {}) => {
  const { etats, ecarts } = await comparer({ docApi: grist, config, client: pg });
  const plan = planifier(config, ecarts, choix);
  const rapport = plan.pret ? await appliquer({ docApi: grist, config, clientEcriture: pg, plan, etats, ecarts, ...options }) : null;
  return { etats, ecarts, plan, rapport };
};
const toutIdentique = async (c) => {
  const { ecarts } = await comparer({ docApi: c.grist, config: c.config, client: c.pg });
  return { identiques: ecarts.identiques, ecarts: ecarts.aPousser.length + ecarts.aTirer.length + ecarts.conflits.length + ecarts.nettoyage.length };
};

describe('la copie synchronisable : création', () => {
  it('le plan : table, colonnes (clé, valeurs, point), configuration, versions ; la table Grist reçoit les lignes', async () => {
    const c = await monterCopie();
    assert.equal(c.plan.geometrie, 'Point');
    // « id » est réservé par Grist : la clé PostgreSQL s'appelle pg_id côté Grist, et la configuration le sait
    assert.deepEqual(c.plan.colonnes.map((x) => x.id), ['pg_id', 'type', 'cout', 'date_intervention', 'latitude', 'longitude']);
    assert.deepEqual(c.config.cles, [{ pg: 'id', grist: 'pg_id', type: 'Int' }]);
    assert.deepEqual(c.config.geometrie, { pg: 'geom', mode: 'point', lat: 'latitude', lng: 'longitude' });
    assert.equal(c.config.tableGrist, 'Interventions');
    assert.equal(c.config.url, 'https://pg.exemple.fr', 'barre finale retirée, jamais de jeton');
    assert.equal(c.grist.tables.get('Interventions').lignes.length, 3);
    assert.equal(c.grist.ligne('Interventions', 1).date_intervention, Date.UTC(2026, 0, 8) / 1000, 'dates en secondes Grist');
    assert.equal(c.grist.ligne('Interventions', 3).cout, null, 'une absence reste une absence');
    assert.equal(c.grist.ligne('Interventions', 1).latitude, 43.4);
  });

  it('« vu » enregistré pour chaque ligne, configuration dans Atlas_PgSyncCopies, et rien de secret dedans', async () => {
    const c = await monterCopie();
    assert.deepEqual([...c.grist.tables.keys()].sort(), ['Atlas_PgSync', 'Atlas_PgSyncCopies', 'Interventions']);
    assert.equal(c.grist.tables.get(TABLE_SYNC).lignes.length, 3);
    assert.equal(c.grist.tables.get(TABLE_SYNC).lignes[0].version_pg_vue, '1');
    assert.equal(c.grist.tables.get(TABLE_COPIES).lignes.length, 1);
    const brut = JSON.stringify([...c.grist.tables.values()].map((t) => t.lignes));
    assert.doesNotMatch(brut, /jeton|token|bearer|authorization/i);
  });

  it('juste après l’import, tout est identique', async () => {
    const c = await monterCopie();
    assert.deepEqual(await toutIdentique(c), { identiques: 3, ecarts: 0 });
  });

  it('une table trop grande (tronquée) ou vide ne se copie pas, en le disant', async () => {
    const pg = new FauxPg();
    pg.ajouter({ type: 'a' });
    const lecture = await pg.commande('pg_gateway_lire', {});
    assert.match(planCopie({ lecture: { ...lecture, tronque: true }, table: TABLE_PG, decl: DECL, url: 'https://x.fr', connexion: 'm', nom: 'T' }).erreur, /trop grande/);
    assert.match(planCopie({ lecture: { lignes: [], tronque: false }, table: TABLE_PG, decl: DECL, url: 'https://x.fr', connexion: 'm', nom: 'T' }).erreur, /aucune ligne active/);
  });

  it('une ligne désactivée dans PostgreSQL n’est pas copiée', async () => {
    const pg = new FauxPg();
    pg.ajouter({ type: 'a', geom: pt(1, 2) });
    pg.ajouter({ type: 'b', geom: pt(1, 2), actif: false });
    const lecture = await pg.commande('pg_gateway_lire', {});
    const plan = planCopie({ lecture, table: TABLE_PG, decl: DECL, url: 'https://x.fr', connexion: 'm', nom: 'T' });
    assert.equal(plan.nbLignes, 1);
  });

  it('une table sans géométrie est une simple table, jamais une couche', async () => {
    const pg = new FauxPg();
    pg.ajouter({ type: 'a' });
    const lecture = await pg.commande('pg_gateway_lire', {});
    const decl = { ...DECL, colonnes: ['type', 'cout'], geometrie: null };
    const plan = planCopie({ lecture, table: TABLE_PG, decl, url: 'https://x.fr', connexion: 'm', nom: 'Notes' });
    assert.equal(plan.ok, true);
    assert.equal(plan.geometrie, null);
    assert.equal(plan.geometryColumn, null);
    assert.equal(plan.copie.config.geometrie, null);
    assert.deepEqual(plan.colonnes.map((x) => x.id), ['pg_id', 'type', 'cout']);
    assert.deepEqual(plan.lots, [[0, 1]]);
  });
});

describe('synchroniser : le scénario complet converge', () => {
  it('modifications, ajouts et suppression des deux côtés, puis une seconde comparaison ne trouve plus rien', async () => {
    const c = await monterCopie();
    // côté Grist : modifier la ligne 1, ajouter une ligne sans clé, supprimer la ligne 3
    c.grist.modifier('Interventions', 1, { type: 'A (corrigé)' });
    c.grist.ajouter('Interventions', { pg_id: 0, type: 'nouvelle', cout: 5, date_intervention: Date.UTC(2026, 1, 1) / 1000, latitude: 43.5, longitude: 3.8 });
    c.grist.supprimer('Interventions', 3);
    // côté PostgreSQL : modifier la ligne 2, ajouter la ligne 10
    c.pg.bouger(2, { cout: 21 });
    c.pg.ajouter({ type: 'venue de PostgreSQL', cout: 7, date_intervention: '2026-02-02', geom: pt(3.9, 43.6) }, 10);

    const { ecarts, plan, rapport } = await sync(c);
    assert.deepEqual([ecarts.aPousser.map((x) => x.action), ecarts.aTirer.map((x) => x.action), ecarts.conflits.length],
      [['inserer', 'modifier', 'desactiver'], ['modifier', 'inserer'], 0]);
    assert.equal(plan.pret, true);
    assert.deepEqual(rapport.poussees, { ok: 3, conflits: 0, refus: 0 });
    assert.deepEqual(rapport.tirees, { inserees: 1, modifiees: 1, supprimees: 0 });
    assert.equal(rapport.interrompu, null);

    // PostgreSQL a reçu : modification, insertion avec clé générée, désactivation (la ligne reste)
    assert.equal(c.pg.lignes.get(1).type, 'A (corrigé)');
    assert.equal(c.pg.lignes.get(3).actif, false, 'désactivée, pas supprimée');
    const nouvelle = [...c.pg.lignes.values()].find((l) => l.type === 'nouvelle');
    assert.ok(nouvelle && nouvelle.id === 11, 'clé générée par PostgreSQL');
    assert.deepEqual(nouvelle.geom, { type: 'Point', coordinates: [3.8, 43.5] }, 'point reconstruit en GeoJSON (lng, lat)');
    // Grist a reçu : la modification de la ligne 2, la ligne 10, et la clé de la ligne nouvelle
    assert.equal(c.grist.ligne('Interventions', 2).cout, 21);
    const lignesGrist = c.grist.tables.get('Interventions').lignes;
    const dix = lignesGrist.find((l) => l.pg_id === 10);
    assert.equal(dix.type, 'venue de PostgreSQL');
    assert.equal(dix.date_intervention, Date.UTC(2026, 1, 2) / 1000);
    assert.equal(lignesGrist.find((l) => l.type === 'nouvelle').pg_id, 11, 'la clé générée par PostgreSQL revient dans la ligne Grist');

    // CONVERGENCE : une nouvelle comparaison ne trouve plus aucun écart
    assert.deepEqual(await toutIdentique(c), { identiques: 4, ecarts: 0 });
  });

  it('la clé générée par PostgreSQL revient dans la ligne Grist qui n’en avait pas', async () => {
    const c = await monterCopie();
    c.grist.ajouter('Interventions', { pg_id: 0, type: 'sans clé' });
    await sync(c);
    const l = c.grist.tables.get('Interventions').lignes.find((x) => x.type === 'sans clé');
    assert.equal(l.pg_id, 4);
    assert.equal((c.pg.lignes.get(4) || {}).type, 'sans clé');
  });

  it('rejouer une synchronisation déjà faite ne change rien (aucune écriture)', async () => {
    const c = await monterCopie();
    c.grist.modifier('Interventions', 1, { type: 'x' });
    await sync(c);
    const avant = JSON.stringify([...c.pg.lignes.values()]);
    const nbAppels = c.pg.appels.filter((a) => a.nom === 'pg_gateway_ecrire').length;
    const { rapport } = await sync(c);
    assert.deepEqual(rapport.poussees, { ok: 0, conflits: 0, refus: 0 });
    assert.equal(c.pg.appels.filter((a) => a.nom === 'pg_gateway_ecrire').length, nbAppels, 'aucun appel d’écriture');
    assert.equal(JSON.stringify([...c.pg.lignes.values()]), avant);
  });

  it('une ligne désactivée dans PostgreSQL disparaît de Grist, et la copie converge', async () => {
    const c = await monterCopie();
    c.pg.bouger(2, { actif: false });
    const { rapport } = await sync(c);
    assert.equal(rapport.tirees.supprimees, 1);
    assert.equal(c.grist.tables.get('Interventions').lignes.length, 2);
    assert.deepEqual(await toutIdentique(c), { identiques: 2, ecarts: 0 });
  });

  it('table qui autorise la suppression réelle : l’opération envoyée est « supprimer »', async () => {
    const c = await monterCopie({ ...DECL, suppression: 'reelle' });
    c.grist.supprimer('Interventions', 2);
    await sync(c);
    assert.equal(c.pg.lignes.has(2), false);
    const envoi = c.pg.appels.filter((a) => a.nom === 'pg_gateway_ecrire').flatMap((a) => a.corps.operations);
    assert.deepEqual(envoi.map((o) => o.op), ['supprimer']);
    assert.deepEqual(await toutIdentique(c), { identiques: 2, ecarts: 0 });
  });

  it('les écritures partent avec la version lue, en lots non atomiques, chacun avec sa clé d’idempotence', async () => {
    const c = await monterCopie();
    for (let i = 0; i < 5; i++) c.grist.ajouter('Interventions', { pg_id: 0, type: 'n' + i });
    c.grist.modifier('Interventions', 1, { type: 'zz' });
    const { rapport } = await sync(c, {}, { lotMax: 2 });
    assert.equal(rapport.poussees.ok, 6);
    const appels = c.pg.appels.filter((a) => a.nom === 'pg_gateway_ecrire');
    assert.equal(appels.length, 3, '6 opérations en lots de 2');
    assert.ok(appels.every((a) => a.corps.atomique === false && a.corps.operations.length <= 2));
    assert.equal(new Set(appels.map((a) => a.corps.cle_idempotence)).size, 3);
    const modif = appels.flatMap((a) => a.corps.operations).find((o) => o.op === 'modifier');
    assert.deepEqual([modif.cle, modif.version_attendue], [{ id: 1 }, 1], 'la version que la comparaison a lue');
    assert.deepEqual(await toutIdentique(c), { identiques: 8, ecarts: 0 }); // 3 d'origine + 5 nouvelles
  });
});

describe('synchroniser : les conflits ne se résolvent jamais tout seuls', () => {
  const conflit = async () => {
    const c = await monterCopie();
    c.grist.modifier('Interventions', 1, { type: 'version Grist', cout: 111 });
    c.pg.bouger(1, { type: 'version PostgreSQL', cout: 222 });
    return c;
  };

  it('sans choix : aucun plan, aucune écriture, d’aucun côté', async () => {
    const c = await conflit();
    const { ecarts, plan, rapport } = await sync(c);
    assert.equal(ecarts.conflits.length, 1);
    assert.equal(plan.pret, false);
    assert.equal(rapport, null);
    assert.equal(c.pg.appels.filter((a) => a.nom === 'pg_gateway_ecrire').length, 0);
    assert.equal(c.pg.lignes.get(1).type, 'version PostgreSQL');
    assert.equal(c.grist.ligne('Interventions', 1).type, 'version Grist');
    const { etats, ecarts: e2 } = await comparer({ docApi: c.grist, config: c.config, client: c.pg });
    await assert.rejects(appliquer({ docApi: c.grist, config: c.config, clientEcriture: c.pg, plan, etats, ecarts: e2 }), (e) => e instanceof ErreurSync && e.code === 'conflits_sans_choix');
  });

  it('« Grist gagne » : PostgreSQL prend la valeur de Grist, avec la version lue, puis tout converge', async () => {
    const c = await conflit();
    const { ecarts } = await comparer({ docApi: c.grist, config: c.config, client: c.pg });
    const { rapport } = await sync(c, { [ecarts.conflits[0].id]: 'grist' });
    assert.equal(rapport.poussees.ok, 1);
    assert.deepEqual([c.pg.lignes.get(1).type, c.pg.lignes.get(1).cout], ['version Grist', 111]);
    assert.deepEqual(await toutIdentique(c), { identiques: 3, ecarts: 0 });
  });

  it('« PostgreSQL gagne » : Grist prend la valeur de PostgreSQL, puis tout converge', async () => {
    const c = await conflit();
    const { ecarts } = await comparer({ docApi: c.grist, config: c.config, client: c.pg });
    const { rapport } = await sync(c, { [ecarts.conflits[0].id]: 'pg' });
    assert.equal(rapport.tirees.modifiees, 1);
    assert.deepEqual([c.grist.ligne('Interventions', 1).type, c.grist.ligne('Interventions', 1).cout], ['version PostgreSQL', 222]);
    assert.equal(c.pg.appels.filter((a) => a.nom === 'pg_gateway_ecrire').length, 0, 'rien n\'est écrit dans PostgreSQL');
    assert.deepEqual(await toutIdentique(c), { identiques: 3, ecarts: 0 });
  });

  it('« ignorer » : rien ne bouge, le conflit reste à la prochaine comparaison', async () => {
    const c = await conflit();
    const { ecarts } = await comparer({ docApi: c.grist, config: c.config, client: c.pg });
    const { rapport } = await sync(c, { [ecarts.conflits[0].id]: 'ignorer' });
    assert.equal(rapport.ignores, 1);
    const { ecarts: apres } = await comparer({ docApi: c.grist, config: c.config, client: c.pg });
    assert.equal(apres.conflits.length, 1);
    assert.equal(c.pg.lignes.get(1).type, 'version PostgreSQL');
  });

  it('supprimée dans Grist mais modifiée dans PostgreSQL : « PostgreSQL gagne » ramène la ligne', async () => {
    const c = await monterCopie();
    c.grist.supprimer('Interventions', 2);
    c.pg.bouger(2, { cout: 99 });
    const { ecarts } = await comparer({ docApi: c.grist, config: c.config, client: c.pg });
    assert.equal(ecarts.conflits[0].nature, 'supprime_grist_modifie_pg');
    await sync(c, { [ecarts.conflits[0].id]: 'pg' });
    assert.equal(c.grist.tables.get('Interventions').lignes.find((l) => l.cout === 99).type, 'b');
    assert.deepEqual(await toutIdentique(c), { identiques: 3, ecarts: 0 });
  });

  it('modifiée dans Grist mais désactivée dans PostgreSQL : « Grist gagne » la réactive puis la met à jour', async () => {
    const c = await monterCopie();
    c.grist.modifier('Interventions', 2, { type: 'ressuscitée' });
    c.pg.bouger(2, { actif: false });
    const { ecarts } = await comparer({ docApi: c.grist, config: c.config, client: c.pg });
    assert.equal(ecarts.conflits[0].nature, 'modifie_grist_supprime_pg');
    const { rapport } = await sync(c, { [ecarts.conflits[0].id]: 'grist' });
    assert.equal(rapport.poussees.ok, 1);
    assert.deepEqual([c.pg.lignes.get(2).actif, c.pg.lignes.get(2).type], [true, 'ressuscitée']);
    assert.deepEqual(c.pg.appels.filter((a) => a.nom === 'pg_gateway_ecrire').flatMap((a) => a.corps.operations).map((o) => o.op), ['reactiver', 'modifier']);
    assert.deepEqual(await toutIdentique(c), { identiques: 3, ecarts: 0 });
  });
});

describe('synchroniser : quand le monde bouge ou casse pendant l’application', () => {
  it('PostgreSQL change ENTRE la comparaison et l’application : conflit rapporté, rien écrasé, « vu » intact', async () => {
    const c = await monterCopie();
    c.grist.modifier('Interventions', 1, { type: 'ma modification' });
    const { etats, ecarts } = await comparer({ docApi: c.grist, config: c.config, client: c.pg });
    c.pg.bouger(1, { type: 'modification concurrente' }); // quelqu'un d'autre écrit avant nous
    const plan = planifier(c.config, ecarts, {});
    const rapport = await appliquer({ docApi: c.grist, config: c.config, clientEcriture: c.pg, plan, etats, ecarts });
    assert.deepEqual(rapport.poussees, { ok: 0, conflits: 1, refus: 0 });
    assert.equal(rapport.echecs[0].statut, 'conflit');
    assert.equal(c.pg.lignes.get(1).type, 'modification concurrente', 'la modification concurrente n\'est pas écrasée');
    const { ecarts: suite } = await comparer({ docApi: c.grist, config: c.config, client: c.pg });
    assert.equal(suite.conflits[0].nature, 'modifie_des_deux_cotes', 'à la prochaine comparaison, c\'est un vrai conflit');
  });

  it('la passerelle tombe pendant la poussée : on le dit, on n\'invente pas de « vu », et PostgreSQL → Grist continue', async () => {
    const c = await monterCopie();
    c.grist.modifier('Interventions', 1, { type: 'à pousser' });
    c.pg.bouger(2, { cout: 77 }); // à tirer
    c.pg.panne = true;
    const { rapport } = await sync(c);
    assert.equal(rapport.interrompu, 'Passerelle injoignable');
    assert.equal(rapport.poussees.ok, 0);
    assert.equal(c.grist.ligne('Interventions', 2).cout, 77, 'la partie « tirer » n\'a pas besoin de l\'écriture');
    c.pg.panne = false;
    const { rapport: reprise } = await sync(c);
    assert.equal(reprise.poussees.ok, 1, 'la poussée reprend là où elle s\'était arrêtée');
    assert.deepEqual(await toutIdentique(c), { identiques: 3, ecarts: 0 });
  });

  it('une table PostgreSQL trop grande pour être comparée en entier est refusée', async () => {
    const c = await monterCopie();
    c.pg.tronque = true;
    await assert.rejects(comparer({ docApi: c.grist, config: c.config, client: c.pg }), (e) => e.code === 'table_trop_grande');
  });

  it('un refus de PostgreSQL (contrainte) est rapporté avec sa cause et ne fabrique pas de « vu »', async () => {
    const c = await monterCopie();
    c.grist.ajouter('Interventions', { pg_id: 0, type: 'refusée' });
    const origine = c.pg.commande.bind(c.pg);
    c.pg.commande = async (nom, corps) => {
      const r = await origine(nom, corps);
      if (nom === 'pg_gateway_ecrire') r.resultats = r.resultats.map((x) => ({ index: x.index, statut: 'refuse', code: 'valeur_manquante', message: 'colonne obligatoire' }));
      return r;
    };
    const { rapport } = await sync(c);
    assert.deepEqual(rapport.poussees, { ok: 0, conflits: 0, refus: 1 });
    assert.deepEqual([rapport.echecs[0].code, rapport.echecs[0].message], ['valeur_manquante', 'colonne obligatoire']);
    assert.equal(c.grist.tables.get(TABLE_SYNC).lignes.length, 3, 'aucun « vu » pour la ligne refusée');
  });
});

describe('simuler la poussée', () => {
  it('mêmes contrôles que l’application, rien n’est conservé ni dans PostgreSQL ni dans Grist', async () => {
    const c = await monterCopie();
    c.grist.modifier('Interventions', 1, { type: 'simulé' });
    c.grist.ajouter('Interventions', { pg_id: 0, type: 'nouvelle simulée' });
    c.grist.supprimer('Interventions', 3);
    const { etats, ecarts } = await comparer({ docApi: c.grist, config: c.config, client: c.pg });
    const plan = planifier(c.config, ecarts, {});
    const avant = JSON.stringify([...c.pg.lignes.entries()]);
    const r = await simulerPoussee({ config: c.config, clientEcriture: c.pg, plan, etats });
    assert.deepEqual([r.ok, r.conflits, r.refus, r.interrompu], [3, 0, 0, null]);
    assert.equal(JSON.stringify([...c.pg.lignes.entries()]), avant, 'PostgreSQL inchangé');
    assert.ok(c.pg.appels.filter((a) => a.nom === 'pg_gateway_ecrire').every((a) => a.corps.mode === 'simuler'));
    assert.deepEqual(await toutIdentique({ ...c }).then((x) => x.ecarts), 3, 'Grist et le « vu » inchangés : les mêmes écarts');
  });

  it('la simulation révèle un conflit que l’application aurait rencontré', async () => {
    const c = await monterCopie();
    c.grist.modifier('Interventions', 1, { type: 'ma modification' });
    const { etats, ecarts } = await comparer({ docApi: c.grist, config: c.config, client: c.pg });
    c.pg.bouger(1, { type: 'concurrente' });
    const r = await simulerPoussee({ config: c.config, clientEcriture: c.pg, plan: planifier(c.config, ecarts, {}), etats });
    assert.deepEqual([r.ok, r.conflits], [0, 1]);
    assert.equal(r.echecs[0].code, 'version_perimee');
  });

  it('la passerelle injoignable est dite, pas avalée', async () => {
    const c = await monterCopie();
    c.grist.modifier('Interventions', 1, { type: 'x' });
    const { etats, ecarts } = await comparer({ docApi: c.grist, config: c.config, client: c.pg });
    c.pg.panne = true;
    const r = await simulerPoussee({ config: c.config, clientEcriture: c.pg, plan: planifier(c.config, ecarts, {}), etats });
    assert.equal(r.interrompu, 'Passerelle injoignable');
  });
});

describe('lire les copies d’un document : des données, pas des instructions', () => {
  it('rend les copies valides, rien n\'est contacté', async () => {
    const c = await monterCopie();
    const copies = await lireCopies(c.grist);
    assert.equal(copies.length, 1);
    assert.equal(copies[0].tableGrist, 'Interventions');
    assert.equal(copies[0].config.url, 'https://pg.exemple.fr');
    assert.equal(c.pg.appels.filter((a) => a.nom !== 'pg_gateway_lire').length, 0);
    assert.equal(c.pg.appels.length, 1, 'seule la lecture de l\'import');
  });

  it('un document sans copies : liste vide', async () => {
    assert.deepEqual(await lireCopies(fauxGrist()), []);
  });

  it('une configuration douteuse est ignorée : adresse http, champ manquant, table absente, JSON illisible', async () => {
    const c = await monterCopie();
    const bonne = c.config;
    const mauvaises = [
      { ...bonne, url: 'http://pirate.exemple.fr' },
      { ...bonne, connexion: '' },
      { ...bonne, cles: [] },
      { ...bonne, genre: 'autre' },
      { ...bonne, tableGrist: 'TableQuiNExistePas' },
      { ...bonne, geometrie: { pg: 'g', mode: 'inconnu' } },
    ];
    for (const m of mauvaises) c.grist.ajouter(TABLE_COPIES, { table_grist: 'x', config: JSON.stringify(m) });
    c.grist.ajouter(TABLE_COPIES, { table_grist: 'x', config: '{pas du json' });
    assert.equal((await lireCopies(c.grist)).length, 1);
    assert.equal(configValide(bonne), true);
    assert.equal(configValide(null), false);
    assert.equal(configValide({ ...bonne, url: 'ftp://x' }), false);
  });

  it('détacher une copie oublie sa configuration et son « vu », pas sa table', async () => {
    const c = await monterCopie();
    const [copie] = await lireCopies(c.grist);
    await detacherCopie({ docApi: c.grist, copie });
    assert.equal((await lireCopies(c.grist)).length, 0);
    assert.equal(c.grist.tables.get(TABLE_SYNC).lignes.length, 0);
    assert.equal(c.grist.tables.get('Interventions').lignes.length, 3);
  });
});

describe('conversions PostgreSQL → Grist', () => {
  it('valeursPgVersGrist : types Grist, géométrie, absences', () => {
    const config = { cles: [{ pg: 'id', grist: 'id', type: 'Int' }], colonnes: [{ pg: 'd', grist: 'd', type: 'Date' }, { pg: 'n', grist: 'n', type: 'Numeric' }, { pg: 'o', grist: 'o', type: 'Bool' }],
      geometrie: { pg: 'g', mode: 'json', grist: 'geometry_json', lat: 'centroid_lat', lng: 'centroid_lon' } };
    const v = valeursPgVersGrist(config, { cle: { id: 3 }, valeurs: { d: '2026-01-08', n: null, o: true, g: { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 4], [0, 4], [0, 0]]] } } });
    assert.equal(v.id, 3);
    assert.equal(v.d, Date.UTC(2026, 0, 8) / 1000);
    assert.equal(v.n, null);
    assert.equal(v.o, true);
    assert.deepEqual([v.centroid_lon, v.centroid_lat], [1, 2]);
    assert.equal(JSON.parse(v.geometry_json).type, 'Polygon');
    const sans = valeursPgVersGrist(config, { cle: { id: 4 }, valeurs: { d: null, n: 1, o: false, g: null } });
    assert.deepEqual([sans.geometry_json, sans.centroid_lat], [null, null]);
  });

  it('lignesDe : colonnes de fetchTable → lignes', () => {
    assert.deepEqual(lignesDe({ id: [1, 2], a: ['x', 'y'] }), [{ id: 1, a: 'x' }, { id: 2, a: 'y' }]);
    assert.deepEqual(lignesDe({}), []);
    assert.equal(cleCanon({ id: 1 }), '{"id":"1"}');
  });
});

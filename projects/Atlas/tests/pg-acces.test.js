import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { creerAccesPg, adresseAdmisePg, DELAI_REFUS_MS } from '../lib/pg-acces.js';
import { creerClientPg, ErreurPasserelle, texteErreur, bboxDepuisBornes } from '../lib/pg-passerelle.js';

const URL_PG = 'https://pg.exemple.fr';

describe('pg-acces — le jeton reste en mémoire', () => {
  it('n’admet que https ou localhost', () => {
    assert.equal(adresseAdmisePg('https://pg.exemple.fr/v1'), null);
    assert.equal(adresseAdmisePg('http://localhost:8000'), null);
    assert.match(adresseAdmisePg('http://pg.exemple.fr'), /https/);
    assert.match(adresseAdmisePg('pas une adresse'), /illisible/);
  });

  it('aucun en-tête tant qu’on n’a pas de jeton, puis Bearer vers cette origine seule', async () => {
    const acces = creerAccesPg({ demander: async () => 'secret' });
    assert.deepEqual(acces.entetes(URL_PG + '/v1/x'), {});
    assert.equal(await acces.apres401(URL_PG + '/v1/x', false), true);
    assert.deepEqual(acces.entetes(URL_PG + '/v1/y'), { Authorization: 'Bearer secret' });
    assert.deepEqual(acces.entetes('https://autre.exemple.fr/v1/x'), {}, 'jamais vers une autre origine');
  });

  it('un jeton refusé est oublié et la personne est invitée à le ressaisir', async () => {
    const questions = [];
    const acces = creerAccesPg({ demander: async (q) => { questions.push(q.refuse); return questions.length === 1 ? 'faux' : 'bon'; } });
    await acces.apres401(URL_PG, false);
    assert.equal(await acces.apres401(URL_PG, true), true);
    assert.deepEqual(questions, [false, true]);
    assert.deepEqual(acces.entetes(URL_PG), { Authorization: 'Bearer bon' });
  });

  it('plusieurs 401 simultanés ne posent qu’une question', async () => {
    let n = 0;
    const acces = creerAccesPg({ demander: async () => { n++; await new Promise((r) => setTimeout(r, 5)); return 'j'; } });
    const res = await Promise.all([acces.apres401(URL_PG), acces.apres401(URL_PG), acces.apres401(URL_PG)]);
    assert.deepEqual(res, [true, true, true]);
    assert.equal(n, 1);
  });

  it('une saisie annulée n’est pas redemandée tout de suite', async () => {
    let t = 0;
    let n = 0;
    const acces = creerAccesPg({ demander: async () => { n++; return null; }, maintenant: () => t });
    assert.equal(await acces.apres401(URL_PG), false);
    assert.equal(await acces.apres401(URL_PG), false);
    assert.equal(n, 1);
    t = DELAI_REFUS_MS + 1;
    await acces.apres401(URL_PG);
    assert.equal(n, 2);
  });

  it('refuse d’envoyer un jeton vers une adresse http', async () => {
    const acces = creerAccesPg({ demander: async () => { throw new Error('ne doit pas être demandé'); } });
    assert.equal(await acces.apres401('http://pg.exemple.fr/v1'), false);
    assert.deepEqual(acces.entetes('http://pg.exemple.fr/v1'), {});
  });
});

/** Un faux fetch scénarisé : rend la réponse suivante et garde les requêtes vues. */
function fauxFetch(reponses) {
  const vues = [];
  const f = async (url, init) => {
    vues.push({ url, init });
    const r = reponses.shift();
    if (r instanceof Error) throw r;
    return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => { if (r.illisible) throw new Error('x'); return r.corps; } };
  };
  f.vues = vues;
  return f;
}

describe('pg-passerelle — le client', () => {
  it('rejoue UNE fois après un 401 avec le jeton saisi', async () => {
    const acces = creerAccesPg({ demander: async () => 'jt' });
    const f = fauxFetch([{ status: 401, corps: { erreur: { code: 'jeton_refuse', message: 'non', cote: 'requete' } } }, { status: 200, corps: { connexions: [] } }]);
    const client = creerClientPg({ url: URL_PG + '/', acces, fetchImpl: f });
    assert.deepEqual(await client.connexions(), { connexions: [] });
    assert.equal(f.vues.length, 2);
    assert.equal(f.vues[0].init.headers.Authorization, undefined);
    assert.equal(f.vues[1].init.headers.Authorization, 'Bearer jt');
    assert.equal(f.vues[0].url, URL_PG + '/v1/pg_gateway_connexions');
    assert.equal(f.vues[1].init.credentials, 'omit');
  });

  it('un second 401 devient une erreur, dite avec son côté', async () => {
    const acces = creerAccesPg({ demander: async () => 'jt' });
    const e401 = { status: 401, corps: { erreur: { code: 'jeton_refuse', message: 'Jeton absent ou invalide', cote: 'requete' } } };
    const client = creerClientPg({ url: URL_PG, acces, fetchImpl: fauxFetch([e401, e401]) });
    await assert.rejects(client.connexions(), (e) => e instanceof ErreurPasserelle && e.code === 'jeton_refuse' && e.statut === 401);
  });

  it('une panne réseau cite le réseau ET CORS (indiscernables du navigateur)', async () => {
    const acces = creerAccesPg({ demander: async () => 'j' });
    const client = creerClientPg({ url: URL_PG, acces, fetchImpl: fauxFetch([new TypeError('Failed to fetch')]) });
    await assert.rejects(client.connexions(), (e) => /CORS_ORIGINES/.test(e.message) && /réseau/.test(e.message) && e.cote === 'serveur');
  });

  it('une erreur de la base garde son code et son côté', async () => {
    const acces = creerAccesPg({ demander: async () => 'j' });
    const f = fauxFetch([{ status: 403, corps: { erreur: { code: 'droits_insuffisants', message: 'Pas le droit', cote: 'base' } } }]);
    const client = creerClientPg({ url: URL_PG, acces, fetchImpl: f });
    await assert.rejects(client.schema('demo'), (e) => {
      assert.equal(texteErreur(e), 'Pas le droit (côté la base de données)');
      return e.code === 'droits_insuffisants';
    });
  });

  it('une réponse qui n’est pas du JSON est dite illisible, avec son statut', async () => {
    const acces = creerAccesPg({ demander: async () => 'j' });
    const client = creerClientPg({ url: URL_PG, acces, fetchImpl: fauxFetch([{ status: 502, illisible: true }]) });
    await assert.rejects(client.connexions(), (e) => e.code === 'illisible' && e.statut === 502);
  });

  it('sans adresse, on le dit au lieu d’appeler', async () => {
    const client = creerClientPg({ url: '', acces: creerAccesPg({ demander: async () => 'j' }), fetchImpl: fauxFetch([]) });
    await assert.rejects(client.connexions(), (e) => e.code === 'url_absente');
  });

  it('bboxDepuisBornes borne au monde et arrondit', () => {
    const b = { getWest: () => -190, getEast: () => 3.123456789, getSouth: () => -91, getNorth: () => 43.5 };
    assert.deepEqual(bboxDepuisBornes(b), [-180, -90, 3.123457, 43.5]);
  });
});

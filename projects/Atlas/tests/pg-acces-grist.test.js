import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { creerAccesGrist, creerAccesAuto, memoriserConfirmation, sonderIdentite, DELAI_REFUS_MS, MARGE_MS } from '../lib/pg-acces-grist.js';
import { creerAccesPg } from '../lib/pg-acces.js';
import { creerClientPg, texteErreur } from '../lib/pg-passerelle.js';

const URL_PG = 'https://pg.exemple.fr';

/** Un « getAccessToken » de Grist : des jetons numérotés, comptés. */
function fauxJeton({ ttlMsecs = 900000, echec = null } = {}) {
  const f = async () => {
    f.appels++;
    if (echec) throw new Error(echec);
    return { token: 'jwt-' + f.appels, ttlMsecs, baseUrl: 'https://grist.exemple.fr/api/docs/d' };
  };
  f.appels = 0;
  return f;
}

describe('pg-acces-grist — l’identité Grist, en mémoire et confirmée', () => {
  it('rien n’est envoyé avant le premier 401, puis « Authorization: Grist » vers cette origine seule', async () => {
    const jeton = fauxJeton();
    const acces = creerAccesGrist({ jeton, confirmer: async () => true });
    assert.deepEqual(acces.entetes(URL_PG + '/v1/x'), {});
    assert.equal(await acces.apres401(URL_PG + '/v1/x', false), true);
    assert.deepEqual(acces.entetes(URL_PG + '/v1/y'), { Authorization: 'Grist jwt-1' });
    assert.deepEqual(acces.entetes('https://autre.exemple.fr/v1/x'), {}, 'jamais vers une autre origine');
  });

  it('sans confirmation, aucun jeton Grist n’est demandé ni envoyé, et le refus est signalé', async () => {
    const jeton = fauxJeton();
    const signales = [];
    const acces = creerAccesGrist({ jeton, confirmer: async () => false, signaler: (t) => signales.push(t) });
    assert.equal(await acces.apres401(URL_PG, false), false);
    assert.equal(jeton.appels, 0, 'le jeton Grist n’a pas même été demandé');
    assert.deepEqual(acces.entetes(URL_PG), {});
    assert.match(signales[0], /refusé/);
    assert.match(signales[0], /pg\.exemple\.fr/);
  });

  it('une confirmation refusée n’est pas redemandée avant le délai', async () => {
    let t = 0;
    let questions = 0;
    const acces = creerAccesGrist({ jeton: fauxJeton(), confirmer: async () => { questions++; return false; }, maintenant: () => t });
    await acces.apres401(URL_PG, false);
    t += DELAI_REFUS_MS - 1;
    assert.equal(await acces.apres401(URL_PG, false), false);
    assert.equal(questions, 1);
    t += 2;
    await acces.apres401(URL_PG, false);
    assert.equal(questions, 2);
  });

  it('n’admet ni une adresse http distante ni une adresse illisible : pas de jeton, pas de question', async () => {
    const jeton = fauxJeton();
    let questions = 0;
    const acces = creerAccesGrist({ jeton, confirmer: async () => { questions++; return true; } });
    assert.equal(await acces.apres401('http://pg.exemple.fr/v1', false), false);
    assert.equal(await acces.apres401('pas une adresse', false), false);
    assert.equal(questions, 0);
    assert.equal(jeton.appels, 0);
    assert.equal(await acces.apres401('http://localhost:8000/v1', false), true, 'localhost est admis');
  });

  it('un jeton périmé n’est pas envoyé : on le redemande après l’expiration moins la marge', async () => {
    let t = 1000;
    const jeton = fauxJeton({ ttlMsecs: 900000 });
    const acces = creerAccesGrist({ jeton, confirmer: async () => true, maintenant: () => t });
    await acces.apres401(URL_PG, false);
    t += 900000 - MARGE_MS - 1;
    assert.deepEqual(acces.entetes(URL_PG), { Authorization: 'Grist jwt-1' });
    t += 2;
    assert.deepEqual(acces.entetes(URL_PG), {}, 'dans la marge d’expiration : plus d’en-tête');
    assert.equal(await acces.apres401(URL_PG, false), true);
    assert.deepEqual(acces.entetes(URL_PG), { Authorization: 'Grist jwt-2' });
  });

  it('un jeton refusé par la passerelle (401 avec en-tête) est remplacé par un nouveau', async () => {
    const jeton = fauxJeton();
    const acces = creerAccesGrist({ jeton, confirmer: async () => true });
    await acces.apres401(URL_PG, false);
    assert.equal(await acces.apres401(URL_PG, true), true);
    assert.deepEqual(acces.entetes(URL_PG), { Authorization: 'Grist jwt-2' });
  });

  it('un jeton refusé est oublié même si le suivant ne vient pas : on ne renvoie jamais un jeton refusé', async () => {
    let echec = false;
    const acces = creerAccesGrist({ jeton: async () => { if (echec) throw new Error('Grist injoignable'); return { token: 'jwt-1', ttlMsecs: 900000 }; }, confirmer: async () => true, signaler: () => {} });
    await acces.apres401(URL_PG, false);
    echec = true;
    assert.equal(await acces.apres401(URL_PG, true), false);
    assert.deepEqual(acces.entetes(URL_PG), {});
  });

  it('plusieurs 401 simultanés ne demandent qu’un jeton et ne posent qu’une question', async () => {
    let questions = 0;
    const jeton = fauxJeton();
    const acces = creerAccesGrist({ jeton, confirmer: async () => { questions++; await new Promise((r) => setTimeout(r, 5)); return true; } });
    const res = await Promise.all([acces.apres401(URL_PG), acces.apres401(URL_PG), acces.apres401(URL_PG)]);
    assert.deepEqual(res, [true, true, true]);
    assert.equal(questions, 1);
    assert.equal(jeton.appels, 1);
  });

  it('un jeton que Grist refuse de donner est signalé, jamais avalé', async () => {
    const signales = [];
    const acces = creerAccesGrist({ jeton: fauxJeton({ echec: 'accès refusé' }), confirmer: async () => true, signaler: (t) => signales.push(t) });
    assert.equal(await acces.apres401(URL_PG, false), false);
    assert.equal(signales.length, 1);
    assert.match(signales[0], /accès refusé/);
    assert.match(signales[0], /côté Grist/);
    assert.deepEqual(acces.entetes(URL_PG), {});
  });

  it('une réponse de Grist sans jeton est signalée', async () => {
    const signales = [];
    const acces = creerAccesGrist({ jeton: async () => ({}), confirmer: async () => true, signaler: (t) => signales.push(t) });
    assert.equal(await acces.apres401(URL_PG, false), false);
    assert.match(signales[0], /pas rendu de jeton/);
  });

  it('une durée de vie absente ou absurde retombe sur la valeur par défaut, jamais sur « éternel »', async () => {
    let t = 0;
    const acces = creerAccesGrist({ jeton: async () => ({ token: 'j', ttlMsecs: 'beaucoup' }), confirmer: async () => true, maintenant: () => t });
    await acces.apres401(URL_PG, false);
    assert.deepEqual(acces.entetes(URL_PG), { Authorization: 'Grist j' });
    t += 24 * 3600 * 1000;
    assert.deepEqual(acces.entetes(URL_PG), {});
  });
});

describe('pg-acces-grist — la confirmation est partagée', () => {
  it('une seule question par origine, lecture et écriture confondues', async () => {
    let questions = 0;
    const confirmer = memoriserConfirmation(async () => { questions++; return true; });
    const lecture = creerAccesGrist({ jeton: fauxJeton(), confirmer });
    const ecriture = creerAccesGrist({ jeton: fauxJeton(), confirmer });
    await lecture.apres401(URL_PG, false);
    await ecriture.apres401(URL_PG, false);
    assert.equal(questions, 1);
  });

  it('un refus n’est pas retenu comme un accord : la question peut être reposée', async () => {
    const reponses = [false, true];
    let questions = 0;
    const confirmer = memoriserConfirmation(async () => { questions++; return reponses.shift(); });
    assert.equal(await confirmer({ origine: URL_PG }), false);
    assert.equal(await confirmer({ origine: URL_PG }), true);
    assert.equal(await confirmer({ origine: URL_PG }), true);
    assert.equal(questions, 2);
  });

  it('une confirmation qui plante vaut un refus', async () => {
    const confirmer = memoriserConfirmation(async () => { throw new Error('boîte fermée'); });
    assert.equal(await confirmer({ origine: URL_PG }), false);
  });

  it('seul « true » vaut accord (une valeur truthy quelconque n’autorise pas l’envoi)', async () => {
    const confirmer = memoriserConfirmation(async () => 'oui');
    assert.equal(await confirmer({ origine: URL_PG }), false);
  });
});

describe('pg-acces-grist — la sonde', () => {
  const rep = (statut, corps) => async () => ({ ok: statut >= 200 && statut < 300, status: statut, json: async () => corps });

  it('lit « grist: true » sur /v1/identite, sans identifiants, à la racine de l’origine', async () => {
    let appel;
    const r = await sonderIdentite(URL_PG + '/prefixe/v1', async (u, o) => { appel = { u, o }; return { ok: true, status: 200, json: async () => ({ grist: true }) }; });
    assert.equal(r, true);
    assert.equal(appel.u, URL_PG + '/v1/identite');
    assert.equal(appel.o.credentials, 'omit');
    assert.equal(appel.o.headers, undefined, 'aucun en-tête : aucun jeton ne part avec la sonde');
  });

  it('grist: false, ou une passerelle d’avant ce mode (404) : non', async () => {
    assert.equal(await sonderIdentite(URL_PG, rep(200, { grist: false })), false);
    assert.equal(await sonderIdentite(URL_PG, rep(404, {})), false);
  });

  it('réseau en panne, erreur serveur, réponse illisible : indéterminé (null), pas « non »', async () => {
    assert.equal(await sonderIdentite(URL_PG, async () => { throw new Error('réseau'); }), null);
    assert.equal(await sonderIdentite(URL_PG, rep(500, {})), null);
    assert.equal(await sonderIdentite(URL_PG, async () => ({ ok: true, status: 200, json: async () => { throw new Error('x'); } })), null);
    assert.equal(await sonderIdentite('pas une adresse', rep(200, { grist: true })), null);
  });

  it('une valeur truthy qui n’est pas « true » ne compte pas', async () => {
    assert.equal(await sonderIdentite(URL_PG, rep(200, { grist: 'oui' })), false);
  });
});

describe('pg-acces-grist — le choix entre identité Grist et jeton saisi', () => {
  function monter({ sonde, grist = true, saisie = 'bearer-secret' }) {
    const questions = [];
    const jeton = creerAccesPg({ demander: async (q) => { questions.push(q); return saisie; } });
    const gr = grist ? creerAccesGrist({ jeton: fauxJeton(), confirmer: async () => true }) : null;
    const sondes = [];
    const auto = creerAccesAuto({ jeton, grist: gr, sonder: async (u) => { sondes.push(u); return typeof sonde === 'function' ? sonde() : sonde; } });
    return { auto, questions, sondes };
  }

  it('passerelle en mode Grist : jeton Grist, aucune boîte de saisie', async () => {
    const { auto, questions } = monter({ sonde: true });
    assert.deepEqual(auto.entetes(URL_PG + '/v1/x'), {});
    assert.equal(await auto.apres401(URL_PG + '/v1/x', false), true);
    assert.deepEqual(auto.entetes(URL_PG + '/v1/x'), { Authorization: 'Grist jwt-1' });
    assert.equal(auto.mode(URL_PG), 'grist');
    assert.deepEqual(questions, [], 'la personne n’a eu aucun jeton à saisir');
  });

  it('passerelle sans ce mode : le jeton saisi, comme avant', async () => {
    const { auto, questions } = monter({ sonde: false });
    assert.equal(await auto.apres401(URL_PG, false), true);
    assert.deepEqual(auto.entetes(URL_PG), { Authorization: 'Bearer bearer-secret' });
    assert.equal(auto.mode(URL_PG), 'jeton');
    assert.equal(questions.length, 1);
  });

  it('hors d’un document Grist (pas d’accès Grist) : jamais de sonde, le jeton saisi', async () => {
    const { auto, sondes } = monter({ sonde: true, grist: false });
    assert.equal(await auto.apres401(URL_PG, false), true);
    assert.deepEqual(auto.entetes(URL_PG), { Authorization: 'Bearer bearer-secret' });
    assert.deepEqual(sondes, []);
  });

  it('sonde indéterminée : le jeton saisi cette fois, et le choix n’est pas figé', async () => {
    let reponse = null;
    const { auto, sondes } = monter({ sonde: () => reponse });
    assert.equal(await auto.apres401(URL_PG, false), true);
    assert.equal(auto.mode(URL_PG), null);
    reponse = true;
    await auto.apres401(URL_PG, true);
    assert.equal(sondes.length, 2, 'la sonde est refaite');
    assert.equal(auto.mode(URL_PG), 'grist');
  });

  it('le choix est mémorisé : une seule sonde par origine, même sous plusieurs 401 simultanés', async () => {
    const { auto, sondes } = monter({ sonde: async () => { await new Promise((r) => setTimeout(r, 5)); return true; } });
    await Promise.all([auto.apres401(URL_PG), auto.apres401(URL_PG), auto.apres401(URL_PG)]);
    await auto.apres401(URL_PG, true);
    assert.equal(sondes.length, 1);
  });

  it('chaque passerelle a son mode : l’une en Grist, l’autre en jeton', async () => {
    const autre = 'https://autre.exemple.fr';
    const { auto } = monter({ sonde: () => true });
    const jeton = creerAccesPg({ demander: async () => 'j' });
    const mixte = creerAccesAuto({
      jeton, grist: creerAccesGrist({ jeton: fauxJeton(), confirmer: async () => true }),
      sonder: async (u) => u.startsWith(autre) ? false : true,
    });
    await mixte.apres401(URL_PG, false);
    await mixte.apres401(autre, false);
    assert.equal(mixte.mode(URL_PG), 'grist');
    assert.equal(mixte.mode(autre), 'jeton');
    assert.match(mixte.entetes(URL_PG).Authorization, /^Grist /);
    assert.match(mixte.entetes(autre).Authorization, /^Bearer /);
    assert.ok(auto);
  });

  it('adresse http distante : ni sonde, ni jeton, quel que soit le mode', async () => {
    const { auto, sondes } = monter({ sonde: true });
    assert.equal(await auto.apres401('http://pg.exemple.fr', false), false);
    assert.deepEqual(sondes, []);
  });
});

describe('pg-acces-grist — de bout en bout avec le client de la passerelle', () => {
  /** Une passerelle simulée : 401 sans jeton valide ; accepte « Grist jwt-N » pour N >= `valideDepuis`. */
  function fauxServeur({ valideDepuis = 1, grist = true } = {}) {
    const vus = [];
    const f = async (adresse, opts) => {
      const seuil = f.valideDepuis;
      const auth = (opts.headers || {}).Authorization;
      vus.push({ adresse, auth });
      if (adresse.endsWith('/v1/identite')) return { ok: true, status: 200, json: async () => ({ grist }) };
      const m = /^Grist jwt-(\d+)$/.exec(auth || '');
      if (!m || Number(m[1]) < seuil) {
        return { ok: false, status: 401, json: async () => ({ erreur: { code: m ? 'jeton_grist_refuse' : 'jeton_requis', message: 'jeton refusé', cote: 'requete' } }) };
      }
      return { ok: true, status: 200, json: async () => ({ connexions: [{ alias: 'a' }] }) };
    };
    f.vus = vus;
    f.valideDepuis = valideDepuis;
    return f;
  }

  function client({ fetchImpl, confirmer = async () => true, jeton = fauxJeton(), signales = [] } = {}) {
    const grist = creerAccesGrist({ jeton, confirmer, signaler: (t) => signales.push(t) });
    const acces = creerAccesAuto({
      jeton: creerAccesPg({ demander: async () => { throw new Error('la boîte de jeton ne doit pas s’ouvrir'); } }),
      grist,
      sonder: (u) => sonderIdentite(u, fetchImpl),
    });
    return creerClientPg({ url: URL_PG, acces, fetchImpl });
  }

  it('la première commande réussit sans saisie : 401, sonde, jeton Grist, rejeu', async () => {
    const fetchImpl = fauxServeur();
    const c = client({ fetchImpl });
    const r = await c.connexions();
    assert.deepEqual(r.connexions, [{ alias: 'a' }]);
    assert.deepEqual(fetchImpl.vus.map((v) => v.auth || null), [null, null, 'Grist jwt-1']);
    assert.ok(fetchImpl.vus[1].adresse.endsWith('/v1/identite'), 'la sonde ne porte aucun jeton');
    await c.connexions();
    assert.equal(fetchImpl.vus.at(-1).auth, 'Grist jwt-1', 'le jeton est gardé : pas de nouvelle demande');
    assert.equal(fetchImpl.vus.length, 4);
  });

  it('un jeton gardé que la passerelle refuse ensuite (expiré côté serveur) est remplacé, puis la commande réussit', async () => {
    const fetchImpl = fauxServeur({ valideDepuis: 1 });
    const jeton = fauxJeton();
    const c = client({ fetchImpl, jeton });
    await c.connexions();
    fetchImpl.valideDepuis = 2; // Grist a fait expirer le jeton 1
    const r = await c.connexions();
    assert.deepEqual(r.connexions, [{ alias: 'a' }]);
    assert.equal(jeton.appels, 2, 'un seul nouveau jeton demandé');
    assert.deepEqual(fetchImpl.vus.slice(-2).map((v) => v.auth), ['Grist jwt-1', 'Grist jwt-2']);
  });

  it('si le deuxième jeton est refusé aussi, l’erreur dit le côté et la cause (une seule reprise)', async () => {
    const fetchImpl = fauxServeur({ valideDepuis: 99 });
    const c = client({ fetchImpl });
    await assert.rejects(() => c.connexions(), (e) => {
      assert.equal(e.statut, 401);
      assert.match(texteErreur(e), /jeton refusé \(côté votre demande\)/);
      return true;
    });
    const nonSonde = fetchImpl.vus.filter((v) => !v.adresse.endsWith('/identite'));
    assert.equal(nonSonde.length, 2, 'une requête et une seule reprise, pas de boucle');
  });

  it('confirmation refusée : aucun jeton Grist ne part, la commande échoue en 401 et le refus est signalé', async () => {
    const fetchImpl = fauxServeur();
    const signales = [];
    const jeton = fauxJeton();
    const c = client({ fetchImpl, confirmer: async () => false, signales, jeton });
    await assert.rejects(() => c.connexions(), (e) => e.statut === 401);
    assert.equal(jeton.appels, 0);
    assert.ok(fetchImpl.vus.every((v) => !v.auth), 'aucune requête ne porte de jeton');
    assert.match(signales[0], /refusé/);
  });
});

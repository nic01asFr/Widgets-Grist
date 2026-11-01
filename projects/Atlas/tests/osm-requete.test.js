import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { identiteAtlas, enTetesOsm, messageRefusOsm, requeteOsm, PAGE_ATLAS } from '../lib/osm-requete.js';

describe('enTetesOsm — se présenter à OpenStreetMap', () => {
  it('l’application nomme Atlas et dit où le trouver', () => {
    const h = enTetesOsm({ application: true, version: 'e9571dd · 2026-09-26' });
    assert.equal(h['User-Agent'], `Atlas/e9571dd (+${PAGE_ATLAS})`);
  });

  it('le navigateur n’en pose aucun : son Referer suffit, et l’en-tête y serait refusé', () => {
    assert.deepEqual(enTetesOsm({ application: false, version: 'x' }), {});
  });

  it('garde les en-têtes de la requête', () => {
    const h = enTetesOsm({ application: true, base: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    assert.equal(h['Content-Type'], 'application/x-www-form-urlencoded');
    assert.ok(h['User-Agent'].startsWith('Atlas/'));
  });

  it('reste un en-tête HTTP valide, quelle que soit la version', () => {
    for (const v of ['', null, undefined, 'é·ü', '  1.9.0  ', 'source']) {
      const ua = identiteAtlas(v);
      assert.match(ua, /^[\x20-\x7e]+$/, JSON.stringify(v));
      assert.match(ua, /^Atlas\/\S+ \(\+https:/);
    }
    assert.equal(identiteAtlas('é·ü'), `Atlas/app (+${PAGE_ATLAS})`);
  });
});

describe('messageRefusOsm — un refus dit sa cause', () => {
  it('406 et 403 : le service n’a pas su qui appelait', () => {
    assert.match(messageRefusOsm(406), /pas présenté/);
    assert.match(messageRefusOsm(403), /pas présenté/);
  });
  it('429 et 504 se règlent en attendant', () => {
    assert.match(messageRefusOsm(429), /réessayez/);
    assert.match(messageRefusOsm(504), /surchargé/);
  });
  it('le reste garde son code', () => {
    assert.equal(messageRefusOsm(500), 'HTTP 500');
  });
});

it('avecReprises : un refus passager (502, 503, 504, 429) est repris, une réponse bonne ou un autre refus est rendu tel quel', async () => {
  const { avecReprises, messageRefusOsm } = await import('../lib/osm-requete.js');
  const attentes = [];
  const attendre = async (ms) => { attentes.push(ms); };
  let n = 0;
  const reprises = [];
  const r = await avecReprises(async () => { n++; return n < 3 ? { ok: false, status: 502 } : { ok: true, status: 200 }; }, { attendre, surReprise: (k, s) => reprises.push([k, s]) });
  assert.equal(r.status, 200); assert.equal(n, 3); assert.deepEqual(attentes, [1500, 3000]); assert.deepEqual(reprises, [[1, 502], [2, 502]]);
  n = 0; const r2 = await avecReprises(async () => { n++; return { ok: false, status: 406 }; }, { attendre });
  assert.equal(r2.status, 406); assert.equal(n, 1, 'un 406 ne se règle pas en attendant');
  n = 0; const r3 = await avecReprises(async () => { n++; return { ok: false, status: 502 }; }, { attendre, essais: 2 });
  assert.equal(r3.status, 502); assert.equal(n, 2);
  n = 0; const r4 = await avecReprises(async () => { n++; if (n === 1) throw new Error('réseau'); return { ok: true, status: 200 }; }, { attendre });
  assert.equal(r4.status, 200);
  await assert.rejects(() => avecReprises(async () => { throw new Error('hors ligne'); }, { attendre }), /hors ligne/);
  assert.match(messageRefusOsm(502), /surchargé ou indisponible \(502\)/);
});

describe('requeteOsm — le moteur web prend le relais d’un client natif refusé', () => {
  it('l’application présente aussi le Referer d’Atlas', () => {
    assert.equal(enTetesOsm({ application: true, version: '1.42.1' }).Referer, PAGE_ATLAS);
    assert.equal(enTetesOsm({ application: false }).Referer, undefined);
  });
  it('406 ou 403 : la requête repart par le repli, sans les en-têtes qu’un navigateur refuse', async () => {
    const appels = [];
    const natif = async (u, i) => { appels.push(['natif', i.headers]); return { ok: false, status: 406 }; };
    const repli = async (u, i) => { appels.push(['repli', i.headers]); return { ok: true, status: 200 }; };
    const r = await requeteOsm('https://x', { headers: { 'User-Agent': 'Atlas/1', Referer: 'https://p/', Accept: 'application/json' } }, { fetch: natif, repli });
    assert.equal(r.status, 200);
    assert.deepEqual(appels.map((a) => a[0]), ['natif', 'repli']);
    assert.deepEqual(appels[1][1], { Accept: 'application/json' });
  });
  it('une réponse bonne, un autre refus, ou aucun repli : la réponse est rendue telle quelle', async () => {
    let n = 0;
    const repli = async () => { n++; return { ok: true, status: 200 }; };
    for (const status of [200, 404, 502]) assert.equal((await requeteOsm('u', {}, { fetch: async () => ({ ok: status === 200, status }), repli })).status, status);
    assert.equal(n, 0);
    assert.equal((await requeteOsm('u', {}, { fetch: async () => ({ ok: false, status: 406 }), repli: null })).status, 406);
  });
});

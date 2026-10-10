import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ErreurWfs, urlHits, compterHits, lirePages, lireCouche } from '../lib/reseau/wfs-bdtopo.js';

const lire = (nom) => readFileSync(fileURLToPath(new URL(`./fixtures/import-ign/${nom}`, import.meta.url)), 'utf8');
const EMPRISE = [5.37, 43.293, 5.38, 43.3];
const sansAttente = { attendre: async () => {}, pauseMs: 0 };

const reponse = (status, texte, entetes = {}) => ({ ok: status < 400, status, text: async () => texte, headers: { get: (k) => entetes[k.toLowerCase()] ?? null } });

/** Un WFS simulé qui sert `total` objets numérotés par pages, comme le service (COUNT, STARTINDEX, numberMatched). */
function faux(total, { avant = null } = {}) {
  const appels = [];
  const f = async (adresse, opts) => {
    appels.push(adresse);
    if (avant) { const r = await avant(appels.length, adresse, opts); if (r) return r; }
    const q = new URL(adresse).searchParams;
    const debut = Number(q.get('STARTINDEX') || 0);
    const count = Number(q.get('COUNT'));
    const features = [];
    for (let i = debut; i < Math.min(total, debut + count); i++) features.push({ type: 'Feature', id: `x.${i}`, properties: { cleabs: `K${i}` }, geometry: null });
    return reponse(200, JSON.stringify({ type: 'FeatureCollection', features, numberMatched: total, numberReturned: features.length }));
  };
  f.appels = appels;
  return f;
}

describe('wfs-bdtopo — le décompte resultType=hits', () => {
  it('l’adresse porte RESULTTYPE=hits, la couche et l’emprise en BBOX, pas de CQL ni de tri', () => {
    const u = new URL(urlHits({ couche: 'BDTOPO_V3:batiment', emprise: EMPRISE }));
    assert.equal(u.searchParams.get('RESULTTYPE'), 'hits');
    assert.equal(u.searchParams.get('TYPENAMES'), 'BDTOPO_V3:batiment');
    assert.equal(u.searchParams.get('BBOX'), '5.37,43.293,5.38,43.3,EPSG:4326');
    assert.equal(u.searchParams.get('CQL_FILTER'), null);
    assert.equal(u.searchParams.get('COUNT'), null);
  });

  it('sans emprise : refus (le décompte d’une couche entière est lent)', () => {
    assert.throws(() => urlHits({ couche: 'x' }), { code: 'emprise_invalide' });
    assert.throws(() => urlHits({ emprise: EMPRISE }), { code: 'parametre_invalide' });
    assert.throws(() => urlHits({ couche: 'x', emprise: [0, 40, 3, 41] }), { code: 'emprise_trop_grande' });
  });

  it('lit numberMatched dans la réponse XML réelle', async () => {
    const f = async () => reponse(200, lire('hits-batiment.xml'));
    assert.equal(await compterHits('BDTOPO_V3:batiment', EMPRISE, { fetch: f }), 2178);
  });

  it('une exception OGC (XML) devient une erreur exception_ogc avec le texte du service', async () => {
    const f = async () => reponse(400, lire('exception-couche-inconnue.xml'));
    await assert.rejects(compterHits('BDTOPO_V3:nexistepas', EMPRISE, { fetch: f }), (e) => e instanceof ErreurWfs && e.code === 'exception_ogc' && /unknown/.test(e.message));
  });

  it('une réponse sans numberMatched est illisible, pas zéro', async () => {
    const f = async () => reponse(200, '<wfs:FeatureCollection/>');
    await assert.rejects(compterHits('x', EMPRISE, { fetch: f }), { code: 'reponse_illisible' });
  });

  it('reprend sur un 503 puis réussit', async () => {
    let n = 0;
    const f = async () => (++n === 1 ? reponse(503, 'indisponible') : reponse(200, lire('hits-batiment.xml')));
    assert.equal(await compterHits('x', EMPRISE, { fetch: f, ...sansAttente }), 2178);
    assert.equal(n, 2);
  });
});

describe('wfs-bdtopo — lirePages', () => {
  it('rend les pages une à une, dans l’ordre, jusqu’à numberMatched', async () => {
    const f = faux(250);
    const rangs = [];
    for await (const p of lirePages('BDTOPO_V3:x', EMPRISE, { taille: 100, fetch: f, ...sansAttente })) rangs.push([p.debut, p.features.length, p.numberMatched]);
    assert.deepEqual(rangs, [[0, 100, 250], [100, 100, 250], [200, 50, 250]]);
    assert.equal(f.appels.length, 3);
    for (const a of f.appels) assert.equal(new URL(a).searchParams.get('SORTBY'), 'cleabs');
  });

  it('reprend à un rang donné (reprise après interruption)', async () => {
    const f = faux(250);
    const vus = [];
    for await (const p of lirePages('x', EMPRISE, { taille: 100, debut: 200, fetch: f, ...sansAttente })) vus.push(...p.features.map((e) => e.properties.cleabs));
    assert.equal(vus.length, 50);
    assert.equal(vus[0], 'K200');
    assert.equal(new URL(f.appels[0]).searchParams.get('STARTINDEX'), '200');
  });

  it('une zone vide ne rend aucune page', async () => {
    const f = faux(0);
    const pages = [];
    for await (const p of lirePages('x', EMPRISE, { fetch: f, ...sansAttente })) pages.push(p);
    assert.deepEqual(pages, []);
  });

  it('refuse une emprise absente ou trop grande avant toute requête', async () => {
    const f = faux(10);
    await assert.rejects(lirePages('x', null, { fetch: f }).next(), { code: 'emprise_invalide' });
    await assert.rejects(lirePages('x', [0, 40, 0.8, 40.1], { coteMax: 0.5, fetch: f }).next(), { code: 'emprise_trop_grande' });
    assert.equal(f.appels.length, 0);
  });

  it('une page qui expire est redemandée avec la moitié des objets, et le rang suit ce qui a été reçu', async () => {
    const f = faux(300, {
      avant: async (n, adresse, opts) => {
        const count = Number(new URL(adresse).searchParams.get('COUNT'));
        if (count > 100) {
          // la requête ne répond pas : elle se termine quand le délai l'interrompt
          return new Promise((_, rejet) => opts.signal.addEventListener('abort', () => rejet(Object.assign(new Error('abandon'), { name: 'AbortError' }))));
        }
        return null;
      },
    });
    const tailles = [];
    for await (const p of lirePages('x', EMPRISE, { taille: 400, delaiMs: 20, fetch: f, ...sansAttente })) tailles.push([p.debut, p.features.length, p.taille]);
    // 400 -> 200 -> 100 : la première page qui répond a 100 objets, puis les suivantes aussi
    assert.deepEqual(tailles, [[0, 100, 100], [100, 100, 100], [200, 100, 100]]);
  });

  it('au plancher, un délai dépassé est une erreur « delai » et non une boucle infinie', async () => {
    const f = faux(10, { avant: async (n, a, opts) => new Promise((_, rejet) => opts.signal.addEventListener('abort', () => rejet(Object.assign(new Error('abandon'), { name: 'AbortError' })))) });
    await assert.rejects(lirePages('x', EMPRISE, { taille: 100, tailleMin: 100, delaiMs: 10, fetch: f }).next(), { code: 'delai' });
    assert.equal(f.appels.length, 1);
  });

  it('annulée par un signal : erreur « annule », pas « delai » ni « reseau »', async () => {
    const ctl = new AbortController();
    const f = faux(10, { avant: async (n, a, opts) => new Promise((_, rejet) => { opts.signal.addEventListener('abort', () => rejet(Object.assign(new Error('abandon'), { name: 'AbortError' }))); setTimeout(() => ctl.abort(), 5); }) });
    await assert.rejects(lirePages('x', EMPRISE, { fetch: f, signal: ctl.signal, delaiMs: 5000 }).next(), { code: 'annule' });
  });

  it('une erreur de requête (400) n’est pas rejouée', async () => {
    const f = async () => reponse(400, '<ows:ExceptionReport><ows:ExceptionText>mauvais</ows:ExceptionText></ows:ExceptionReport>');
    await assert.rejects(lirePages('x', EMPRISE, { fetch: f }).next(), { code: 'exception_ogc' });
  });

  it('une réponse qui n’est pas une collection est refusée', async () => {
    const f = async () => reponse(200, JSON.stringify({ type: 'Autre' }));
    await assert.rejects(lirePages('x', EMPRISE, { fetch: f }).next(), { code: 'reponse_illisible' });
  });
});

describe('wfs-bdtopo — les lectures existantes ne changent pas', () => {
  it('lireCouche lit toujours tout, sans délai imposé', async () => {
    const f = faux(120);
    const r = await lireCouche('x', EMPRISE, { taille: 50, fetch: f, ...sansAttente });
    assert.equal(r.features.length, 120);
    assert.equal(r.pages, 3);
  });
});

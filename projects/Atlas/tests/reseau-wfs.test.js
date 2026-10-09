import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  URL_WFS, COUCHES, ErreurWfs, validerEmprise, empriseDeLignes, urlGetFeature, lireCouche, lireTroncons, compter,
  dedoublonner, echantillonner, garderProprietes,
} from '../lib/reseau/wfs-bdtopo.js';

const reels = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/reseau/troncons-reels-p02.json', import.meta.url)), 'utf8')).features;
const EMPRISE = [2.73, 44.39, 2.75, 44.41];

/** Un WFS simulé : sert `features` par pages, à l'image du service (numberMatched, STARTINDEX, COUNT), et note les adresses. */
function faux(features, { parPage = Infinity, sansNumberMatched = false } = {}) {
  const appels = [];
  const f = async (adresse) => {
    appels.push(adresse);
    const q = new URL(adresse).searchParams;
    const debut = Number(q.get('STARTINDEX') || 0);
    const count = Math.min(Number(q.get('COUNT')), parPage);
    const page = features.slice(debut, debut + count);
    const corps = { type: 'FeatureCollection', features: page, numberReturned: page.length };
    if (!sansNumberMatched) { corps.numberMatched = features.length; corps.totalFeatures = features.length; }
    return { ok: true, status: 200, text: async () => JSON.stringify(corps), headers: { get: () => null } };
  };
  f.appels = appels;
  return f;
}
const reponse = (status, texte, entetes = {}) => async () => ({ ok: status < 400, status, text: async () => texte, headers: { get: (k) => entetes[k.toLowerCase()] ?? null } });
const sansAttente = { attendre: async () => {}, pauseMs: 0 };

describe('reseau/wfs-bdtopo — l’adresse d’une page', () => {
  it('emprise par BBOX en lon,lat,lon,lat,EPSG:4326 ; jamais de CQL ; toujours un tri', () => {
    const u = new URL(urlGetFeature({ couche: COUCHES.troncons, emprise: EMPRISE, count: 500, debut: 1000 }));
    assert.equal(`${u.origin}${u.pathname}`, URL_WFS);
    assert.equal(u.searchParams.get('BBOX'), '2.73,44.39,2.75,44.41,EPSG:4326');
    assert.equal(u.searchParams.get('SORTBY'), 'cleabs');
    assert.equal(u.searchParams.get('STARTINDEX'), '1000');
    assert.equal(u.searchParams.get('COUNT'), '500');
    assert.equal(u.searchParams.get('TYPENAMES'), 'BDTOPO_V3:troncon_de_route');
    assert.equal(u.searchParams.get('SRSNAME'), 'EPSG:4326');
    assert.equal(u.searchParams.get('CQL_FILTER'), null);
  });

  it('refuse un tri vide : la pagination sans tri n’est pas fiable', () => {
    assert.throws(() => urlGetFeature({ couche: 'x', emprise: EMPRISE, tri: '' }), (e) => e.code === 'parametre_invalide' && /tri/i.test(e.message));
  });

  it('refuse une taille de page ou un début invalides', () => {
    assert.throws(() => urlGetFeature({ couche: 'x', count: 0 }), { code: 'parametre_invalide' });
    assert.throws(() => urlGetFeature({ couche: 'x', count: 5001 }), { code: 'parametre_invalide' });
    assert.throws(() => urlGetFeature({ couche: 'x', debut: -1 }), { code: 'parametre_invalide' });
    assert.throws(() => urlGetFeature({ emprise: EMPRISE }), { code: 'parametre_invalide' });
  });
});

describe('reseau/wfs-bdtopo — l’emprise', () => {
  it('refuse ce qui n’est pas lon,lat,lon,lat dans l’ordre', () => {
    for (const mauvaise of [null, [1, 2, 3], [2.7, 44.4, 2.6, 44.5], [2.7, 44.4, 2.8, 44.4], [5, 100, 6, 101], [NaN, 1, 2, 3], ['a', 1, 2, 3]]) {
      assert.throws(() => validerEmprise(mauvaise), { code: 'emprise_invalide' }, JSON.stringify(mauvaise));
    }
  });
  it('refuse une emprise de plus d’un degré de côté', () => {
    assert.throws(() => validerEmprise([0, 40, 3, 41]), { code: 'emprise_trop_grande' });
    assert.deepEqual(validerEmprise([0, 40, 1, 41]), [0, 40, 1, 41]);
  });
  it('empriseDeLignes : le couloir autour d’une ligne, en mètres', () => {
    const e = empriseDeLignes([[3.0, 46.5], [3.0, 46.51]], 100);
    assert.ok(e[1] < 46.5 && e[3] > 46.51);
    assert.ok(Math.abs((46.5 - e[1]) * 111320 - 100) < 1);
    assert.ok(e[0] < 3.0 && e[2] > 3.0);
    assert.ok(Math.abs((3.0 - e[0]) * 111320 * Math.cos(46.505 * Math.PI / 180) - 100) < 1);
    assert.deepEqual(empriseDeLignes([[[3, 46], [3.1, 46]], [[3, 47], [3, 47.1]]], 0), [3, 46, 3.1, 47.1]);
    assert.throws(() => empriseDeLignes([]), { code: 'emprise_invalide' });
  });
});

describe('reseau/wfs-bdtopo — lecture paginée', () => {
  it('lit toutes les pages, dans l’ordre, avec le tri et sans doublon', async () => {
    const f = faux(reels, { parPage: 4 });
    const r = await lireTroncons(EMPRISE, { fetch: f, taille: 4, ...sansAttente });
    assert.equal(r.features.length, reels.length);
    assert.equal(r.pages, 3);
    assert.equal(r.numberMatched, reels.length);
    assert.equal(r.tronque, false);
    assert.deepEqual(r.features.map((x) => x.id), reels.map((x) => x.id));
    assert.deepEqual(f.appels.map((a) => new URL(a).searchParams.get('STARTINDEX')), ['0', '4', '8']);
    assert.ok(f.appels.every((a) => new URL(a).searchParams.get('SORTBY') === 'cleabs'));
  });

  it('un service qui rend moins que demandé ne fait pas croire à la dernière page', async () => {
    // 10 objets, 3 demandés par page mais le service n'en rend que 2 : on continue jusqu'à numberMatched
    const f = faux(reels, { parPage: 2 });
    const r = await lireTroncons(EMPRISE, { fetch: f, taille: 3, ...sansAttente });
    assert.equal(r.features.length, reels.length);
  });

  it('sans numberMatched, s’arrête sur une page incomplète', async () => {
    const f = faux(reels, { sansNumberMatched: true });
    const r = await lireTroncons(EMPRISE, { fetch: f, taille: 6, ...sansAttente });
    assert.equal(r.features.length, reels.length);
    assert.equal(r.numberMatched, null);
  });

  it('une pagination qui répète un objet ne le compte qu’une fois', () => {
    assert.equal(dedoublonner([reels[0], reels[1], reels[0]]).length, 2);
  });

  it('plafond : trop d’objets est une erreur franche, ou un résultat partiel signalé', async () => {
    await assert.rejects(lireTroncons(EMPRISE, { fetch: faux(reels), max: 5, ...sansAttente }), (e) => e.code === 'trop_d_objets' && e.numberMatched === reels.length);
    const f = faux(reels, { parPage: 4 });
    const r = await lireTroncons(EMPRISE, { fetch: f, max: 5, taille: 4, tronquer: true, ...sansAttente });
    assert.equal(r.features.length, 5);
    assert.equal(r.tronque, true);
    assert.equal(f.appels.length, 2);
  });

  it('filtre CÔTÉ CLIENT (objet ou fonction), puis échantillon reproductible', async () => {
    const f = faux(reels);
    const d537 = await lireTroncons(EMPRISE, { fetch: f, filtre: { cpx_numero: 'D537' }, ...sansAttente });
    assert.ok(d537.features.length >= 3 && d537.features.every((x) => x.properties.cpx_numero === 'D537'));
    assert.equal(d537.lus, reels.length, 'le filtre n’est pas envoyé au service');
    assert.ok(f.appels.every((a) => !a.includes('CQL')));
    const deux = await lireTroncons(EMPRISE, { fetch: f, filtre: (x) => x.properties.cpx_numero === 'D34', ...sansAttente });
    assert.equal(deux.features.length, 2);
    const e1 = await lireTroncons(EMPRISE, { fetch: f, echantillon: 4, ...sansAttente });
    const e2 = await lireTroncons(EMPRISE, { fetch: f, echantillon: 4, ...sansAttente });
    assert.equal(e1.features.length, 4);
    assert.deepEqual(e1.features.map((x) => x.id), e2.features.map((x) => x.id));
  });

  it('échantillonner garde l’ordre ; refuse une taille invalide', () => {
    assert.deepEqual(echantillonner([1, 2, 3], 5), [1, 2, 3]);
    assert.deepEqual(echantillonner([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 5), [0, 2, 4, 6, 8]);
    assert.throws(() => echantillonner([1], 0), { code: 'parametre_invalide' });
  });

  it('compter : une page d’un objet suffit', async () => {
    const f = faux(reels);
    assert.equal(await compter(COUCHES.troncons, EMPRISE, { fetch: f }), reels.length);
    assert.equal(new URL(f.appels[0]).searchParams.get('COUNT'), '1');
    await assert.rejects(compter(COUCHES.troncons, EMPRISE, { fetch: faux(reels, { sansNumberMatched: true }) }), { code: 'reponse_illisible' });
  });

  it('garderProprietes : réduit les attributs, sans toucher aux géométries', () => {
    const [g] = garderProprietes(reels.slice(0, 1), ['cleabs', 'nature']);
    assert.deepEqual(Object.keys(g.properties), ['cleabs', 'nature']);
    assert.deepEqual(g.geometry, reels[0].geometry);
  });
});

describe('reseau/wfs-bdtopo — les erreurs sont explicites', () => {
  const XML = `<?xml version="1.0"?><ows:ExceptionReport><ows:Exception exceptionCode="InvalidParameterValue" locator="typeName">
    <ows:ExceptionText>Feature type BDTOPO_V3:nexistepas unknown</ows:ExceptionText></ows:Exception></ows:ExceptionReport>`;

  it('un ExceptionReport XML devient exception_ogc, avec le texte du service', async () => {
    await assert.rejects(lireCouche('BDTOPO_V3:nexistepas', EMPRISE, { fetch: reponse(400, XML), ...sansAttente }),
      (e) => e instanceof ErreurWfs && e.code === 'exception_ogc' && e.status === 400 && /nexistepas unknown/.test(e.message));
  });

  it('une réponse qui n’est ni XML ni JSON est illisible ; un JSON qui n’est pas une collection aussi', async () => {
    await assert.rejects(lireTroncons(EMPRISE, { fetch: reponse(200, 'pas du json'), ...sansAttente }), { code: 'reponse_illisible' });
    await assert.rejects(lireTroncons(EMPRISE, { fetch: reponse(200, '{"a":1}'), ...sansAttente }), { code: 'reponse_illisible' });
  });

  it('réseau coupé : trois essais, puis code reseau', async () => {
    let n = 0;
    const f = async () => { n++; throw new TypeError('fetch failed'); };
    const attentes = [];
    await assert.rejects(lireTroncons(EMPRISE, { fetch: f, attendre: async (ms) => { attentes.push(ms); }, pauseMs: 0 }), { code: 'reseau' });
    assert.equal(n, 3);
    assert.deepEqual(attentes, [1000, 2000]);
  });

  it('429 : reprend après l’attente demandée par le service, puis réussit', async () => {
    let n = 0;
    const ok = faux(reels);
    const f = async (a) => (n++ === 0 ? reponse(429, 'trop', { 'retry-after': '2' })() : ok(a));
    const attentes = [];
    const r = await lireTroncons(EMPRISE, { fetch: f, attendre: async (ms) => { attentes.push(ms); }, pauseMs: 0 });
    assert.equal(r.features.length, reels.length);
    assert.deepEqual(attentes, [2000]);
  });

  it('503 répété : code http avec le statut ; 404 JSON : pas de reprise', async () => {
    await assert.rejects(lireTroncons(EMPRISE, { fetch: reponse(503, 'indisponible'), ...sansAttente }), (e) => e.code === 'http' && e.status === 503);
    let n = 0;
    await assert.rejects(lireTroncons(EMPRISE, { fetch: async () => { n++; return reponse(404, '{"error":"x"}')(); }, ...sansAttente }), (e) => e.code === 'http' && e.status === 404);
    assert.equal(n, 1);
  });

  it('annulation : le signal arrête la lecture', async () => {
    const c = new AbortController();
    c.abort();
    await assert.rejects(lireTroncons(EMPRISE, { fetch: faux(reels), signal: c.signal, ...sansAttente }), { code: 'annule' });
  });

  it('une emprise invalide est refusée avant tout appel', async () => {
    let n = 0;
    await assert.rejects(lireTroncons([1, 2, 3, 4, 5], { fetch: async () => { n++; } }), { code: 'emprise_invalide' });
    assert.equal(n, 0);
  });
});

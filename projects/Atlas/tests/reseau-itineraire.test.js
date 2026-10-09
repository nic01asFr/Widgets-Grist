import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  urlItineraire, lireReponse, creerClientItineraire, tronconsDuGraphe, ErreurItineraire, RESSOURCES, POINTS_DE_PASSAGE_MAX,
} from '../lib/reseau/itineraire-geoplateforme.js';
import { construireGraphe } from '../lib/reseau/graphe-routier.js';
import { tracer } from '../lib/reseau/calage.js';
import { f1Troncons } from '../lib/reseau/mesures-trace.js';

// Réponses réelles du service, figées le 09/10/2026 (voir _origine dans le fichier)
const F = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/reseau/itineraire-reponses.json', import.meta.url)), 'utf8'));
const R40 = F.plus_court_pgr.json; // 1 097,6 m, bdtopo-pgr, étapes avec cleabs
const DEP40 = [2.832480, 46.323773];
const ARR40 = [2.844625, 46.328244];
const HORS = F.hors_reseau_servi_par_valhalla.json; // départ demandé en mer, accroché ~27 km plus loin

/** Un fetch simulé qui rend les réponses de `file`, dans l'ordre, et note les appels. */
function faux(file) {
  const appels = [];
  const f = async (adresse, init) => {
    appels.push({ adresse, init });
    const r = file.shift();
    if (r instanceof Error) throw r;
    return {
      ok: r.http < 400,
      status: r.http,
      text: async () => (typeof r.json === 'string' ? r.json : JSON.stringify(r.json)),
      headers: { get: (k) => r.entetes?.[k.toLowerCase()] ?? null },
    };
  };
  f.appels = appels;
  return f;
}
const ok = (json) => ({ http: 200, json });
const horloge = () => { let t = 1_000_000; return { maintenant: () => t, avancer: (ms) => { t += ms; } }; };
const sansAttente = () => { const a = []; return { attendre: async (ms) => { a.push(ms); }, attentes: a }; };

describe('reseau/itineraire-geoplateforme — la requête', () => {
  it('bdtopo-pgr avec les attributs : getSteps, waysAttributes, points de passage en lon,lat|lon,lat', () => {
    const u = new URL(urlItineraire({ depart: DEP40, arrivee: ARR40, passages: [[2.835, 46.325], [2.84, 46.326]] }));
    assert.equal(`${u.origin}${u.pathname}`, 'https://data.geopf.fr/navigation/itineraire');
    assert.equal(u.searchParams.get('resource'), 'bdtopo-pgr');
    assert.equal(u.searchParams.get('start'), '2.832480,46.323773');
    assert.equal(u.searchParams.get('end'), '2.844625,46.328244');
    assert.equal(u.searchParams.get('getSteps'), 'true');
    assert.equal(u.searchParams.get('waysAttributes'), 'cleabs|cpx_numero|nom_1_gauche|sens_de_circulation');
    assert.equal(u.searchParams.get('intermediates'), '2.835000,46.325000|2.840000,46.326000');
    assert.equal(u.searchParams.get('optimization'), 'shortest');
    assert.equal(u.searchParams.get('profile'), 'car');
  });

  it('sans attributs : pas de getSteps ; le service n’a pas de clé à fournir', () => {
    const adresse = urlItineraire({ depart: DEP40, arrivee: ARR40, ressource: RESSOURCES.valhalla, attributs: null });
    assert.match(adresse, /getSteps=false/);
    assert.ok(!/waysAttributes|key=|apikey/i.test(adresse));
  });

  it('refuse avant tout appel : 16 points de passage, position invalide, profil ou optimisation inconnus', () => {
    const seize = Array.from({ length: POINTS_DE_PASSAGE_MAX + 1 }, (_, i) => [2.83 + i * 0.0001, 46.32]);
    assert.throws(() => urlItineraire({ depart: DEP40, arrivee: ARR40, passages: seize }), { code: 'trop_de_points_de_passage' });
    assert.doesNotThrow(() => urlItineraire({ depart: DEP40, arrivee: ARR40, passages: seize.slice(0, 15) }));
    assert.throws(() => urlItineraire({ depart: [46.3], arrivee: ARR40 }), { code: 'parametre_invalide' });
    assert.throws(() => urlItineraire({ depart: [200, 46], arrivee: ARR40 }), { code: 'parametre_invalide' });
    assert.throws(() => urlItineraire({ depart: DEP40, arrivee: null }), { code: 'parametre_invalide' });
    assert.throws(() => urlItineraire({ depart: DEP40, arrivee: ARR40, profil: 'velo' }), { code: 'parametre_invalide' });
    assert.throws(() => urlItineraire({ depart: DEP40, arrivee: ARR40, optimisation: 'plusbeau' }), { code: 'parametre_invalide' });
  });
});

describe('reseau/itineraire-geoplateforme — lire une réponse réelle', () => {
  it('distance, durée, tronçons dans l’ordre (sans doublon consécutif), ressource, version', () => {
    const r = lireReponse(R40, { depart: DEP40, arrivee: ARR40 });
    assert.equal(r.distanceM, 1097.6);
    assert.equal(r.ressourceRepondante, 'bdtopo-pgr');
    assert.equal(r.cleabsDisponibles, true);
    assert.ok(r.version);
    assert.ok(r.troncons.length >= 2 && r.troncons.every((c) => /^TRONROUT/.test(c)));
    assert.equal(r.etapes.length >= r.troncons.length, true);
    assert.deepEqual(r.avertissements, []);
    assert.ok(r.depart.ecartM < 10 && r.arrivee.ecartM < 10, `accrochage ${r.depart.ecartM} / ${r.arrivee.ecartM}`);
  });

  it('avec points de passage : la réponse reste lisible', () => {
    const j = F.avec_passages_pgr.json;
    const r = lireReponse(j, { depart: [5.236531, 43.528024], arrivee: [5.221267, 43.527643] });
    assert.ok(r.distanceM > 1000);
    assert.equal(r.cleabsDisponibles, true);
  });

  it('une réponse qui n’a pas la forme attendue est refusée', () => {
    for (const mauvais of [null, {}, { geometry: { type: 'Point', coordinates: [0, 0] }, distance: 1 }, { geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }]) {
      assert.throws(() => lireReponse(mauvais, { depart: [0, 0], arrivee: [1, 1] }), { code: 'reponse_illisible' });
    }
    assert.throws(() => lireReponse({ geometry: { type: 'LineString', coordinates: [] }, distance: 0 }, { depart: [0, 0], arrivee: [1, 1] }), { code: 'aucun_chemin' });
  });
});

describe('reseau/itineraire-geoplateforme — point hors réseau', () => {
  it('un départ en mer, accroché ~27 km plus loin avec un HTTP 200, est refusé', () => {
    assert.throws(
      () => lireReponse(HORS, { depart: [5.2, 43.0], arrivee: [2.720308, 44.399921] }),
      (e) => e instanceof ErreurItineraire && e.code === 'point_hors_reseau' && e.ecartDepartM > 20000 && e.ecartDepartM < 35000 && e.ecartArriveeM < 10 && /le départ/.test(e.message),
    );
  });

  it('le seuil est un réglage : à l’infini, le résultat passe mais la ressource répondante est signalée', () => {
    const r = lireReponse(HORS, { depart: [5.2, 43.0], arrivee: [2.720308, 44.399921], ecartMaxM: Infinity, ressource: RESSOURCES.pgr });
    assert.equal(r.ressourceRepondante, 'bdtopo-valhalla');
    assert.equal(r.cleabsDisponibles, false);
    assert.ok(r.avertissements.some((a) => /ressource répondante bdtopo-valhalla/.test(a)));
  });

  it('un point à 3 m d’un tronçon n’est pas « hors réseau » ; à 500 m exactement, c’est la limite', () => {
    const r = lireReponse(R40, { depart: DEP40, arrivee: ARR40, ecartMaxM: 50 });
    assert.ok(r.depart.ecartM <= 50);
    assert.throws(() => lireReponse(R40, { depart: [DEP40[0] + 0.01, DEP40[1]], arrivee: ARR40 }), { code: 'point_hors_reseau' });
  });
});

describe('reseau/itineraire-geoplateforme — le client', () => {
  it('un appel : l’adresse demandée, aucun en-tête de clé, le résultat normalisé', async () => {
    const f = faux([ok(R40)]);
    const c = creerClientItineraire({ fetch: f, attendre: async () => {} });
    const r = await c.itineraire({ depart: DEP40, arrivee: ARR40 });
    assert.equal(f.appels.length, 1);
    assert.match(f.appels[0].adresse, /resource=bdtopo-pgr/);
    assert.deepEqual(f.appels[0].init.headers, { Accept: 'application/json' });
    assert.equal(r.repli, null);
    assert.equal(r.distanceM, 1097.6);
    assert.equal(c.compteur.appels, 1);
  });

  it('quota : deux appels de suite sont espacés d’au moins 1 s', async () => {
    const h = horloge();
    const a = sansAttente();
    const c = creerClientItineraire({ fetch: faux([ok(R40), ok(R40)]), maintenant: h.maintenant, attendre: a.attendre });
    await c.itineraire({ depart: DEP40, arrivee: ARR40 });
    h.avancer(300);
    await c.itineraire({ depart: DEP40, arrivee: ARR40 });
    assert.deepEqual(a.attentes, [700]);
    h.avancer(5000);
    const f = faux([ok(R40)]);
    const c2 = creerClientItineraire({ fetch: f, maintenant: h.maintenant, attendre: a.attendre });
    await c2.itineraire({ depart: DEP40, arrivee: ARR40 });
    assert.deepEqual(a.attentes, [700], 'le premier appel d’un client n’attend pas');
  });

  it('429 : attend le Retry-After du service, puis reprend', async () => {
    const a = sansAttente();
    const f = faux([{ http: 429, json: 'trop', entetes: { 'retry-after': '3' } }, ok(R40)]);
    const c = creerClientItineraire({ fetch: f, attendre: a.attendre, intervalleMs: 0 });
    const r = await c.itineraire({ depart: DEP40, arrivee: ARR40 });
    assert.equal(r.distanceM, 1097.6);
    assert.ok(a.attentes.includes(3000));
    assert.equal(c.compteur.reprises, 1);
  });

  it('429 persistant : erreur quota, pas de boucle', async () => {
    const f = faux([{ http: 429, json: 'x' }, { http: 429, json: 'x' }]);
    const c = creerClientItineraire({ fetch: f, attendre: async () => {}, intervalleMs: 0 });
    await assert.rejects(c.itineraire({ depart: DEP40, arrivee: ARR40 }), { code: 'quota' });
    assert.equal(f.appels.length, 2);
  });

  it('plafond d’appels : une boucle ne vide pas le quota', async () => {
    const c = creerClientItineraire({ fetch: faux([ok(R40), ok(R40), ok(R40)]), attendre: async () => {}, intervalleMs: 0, maxAppels: 2 });
    await c.itineraire({ depart: DEP40, arrivee: ARR40 });
    await c.itineraire({ depart: DEP40, arrivee: ARR40 });
    await assert.rejects(c.itineraire({ depart: DEP40, arrivee: ARR40 }), { code: 'budget_epuise' });
  });

  it('aucun chemin (404) et requête refusée (400) sont des réponses, pas des pannes : pas de repli', async () => {
    const f = faux([{ http: 404, json: F.erreurs.aucun_chemin.json }]);
    const c = creerClientItineraire({ fetch: f, attendre: async () => {}, intervalleMs: 0 });
    await assert.rejects(c.itineraire({ depart: DEP40, arrivee: ARR40 }), (e) => e.code === 'aucun_chemin' && /No path found/.test(e.message));
    assert.equal(f.appels.length, 1);
    const f2 = faux([{ http: 400, json: F.erreurs.trop_de_points_de_passage.json }]);
    const c2 = creerClientItineraire({ fetch: f2, attendre: async () => {}, intervalleMs: 0 });
    await assert.rejects(c2.itineraire({ depart: DEP40, arrivee: ARR40 }), (e) => e.code === 'requete_refusee' && e.status === 400 && /max is 15/.test(e.message));
    assert.equal(f2.appels.length, 1);
  });

  it('repli de ressource : bdtopo-pgr en panne (500), une seule reprise sur bdtopo-valhalla, signalée, sans cleabs', async () => {
    const valhalla = { ...R40, resource: 'bdtopo-valhalla', portions: R40.portions.map((p) => ({ ...p, steps: [] })) }; // reconstitué : même trajet sans étapes
    const f = faux([{ http: 500, json: 'boom' }, { http: 500, json: 'boom' }, ok(valhalla)]);
    const c = creerClientItineraire({ fetch: f, attendre: async () => {}, intervalleMs: 0 });
    const r = await c.itineraire({ depart: DEP40, arrivee: ARR40 });
    assert.equal(r.repli, 'ressource');
    assert.equal(r.cleabsDisponibles, false);
    assert.deepEqual(r.troncons, []);
    assert.match(f.appels[2].adresse, /resource=bdtopo-valhalla/);
    assert.ok(!/waysAttributes/.test(f.appels[2].adresse));
    assert.ok(r.avertissements.some((a) => /repli/.test(a)));
    assert.equal(c.compteur.replis, 1);
  });

  it('repli aussi quand pgr refuse les attributs (400 waysAttributes)', async () => {
    const valhalla = { ...R40, resource: 'bdtopo-valhalla', portions: [] };
    const f = faux([{ http: 400, json: { error: { message: " Parameter 'waysAttributes' is invalid" } } }, ok(valhalla)]);
    const c = creerClientItineraire({ fetch: f, attendre: async () => {}, intervalleMs: 0 });
    const r = await c.itineraire({ depart: DEP40, arrivee: ARR40 });
    assert.equal(r.repli, 'ressource');
  });

  it('sans cleabs demandés : bdtopo-valhalla d’emblée, pas de repli ni d’avertissement de cleabs', async () => {
    const f = faux([ok({ ...R40, resource: 'bdtopo-valhalla', portions: [] })]);
    const r = await creerClientItineraire({ fetch: f, attendre: async () => {} }).itineraire({ depart: DEP40, arrivee: ARR40, cleabs: false });
    assert.match(f.appels[0].adresse, /resource=bdtopo-valhalla/);
    assert.equal(r.repli, null);
    assert.deepEqual(r.avertissements, []);
  });

  it('le point hors réseau est refusé aussi par le client', async () => {
    const c = creerClientItineraire({ fetch: faux([ok(HORS)]), attendre: async () => {} });
    await assert.rejects(c.itineraire({ depart: [5.2, 43.0], arrivee: [2.720308, 44.399921] }), { code: 'point_hors_reseau' });
  });

  it('réseau coupé : erreur reseau après deux essais ; annulation : annule', async () => {
    const c = creerClientItineraire({ fetch: faux([new TypeError('fetch failed'), new TypeError('fetch failed')]), attendre: async () => {}, intervalleMs: 0 });
    await assert.rejects(c.itineraire({ depart: DEP40, arrivee: ARR40, cleabs: false }), { code: 'reseau' });
    const ctrl = new AbortController();
    ctrl.abort();
    const c2 = creerClientItineraire({ fetch: faux([ok(R40)]), attendre: async () => {} });
    await assert.rejects(c2.itineraire({ depart: DEP40, arrivee: ARR40, signal: ctrl.signal }), { code: 'annule' });
  });

  it('un corps qui n’est pas du JSON avec un HTTP 200 est illisible', async () => {
    const c = creerClientItineraire({ fetch: faux([{ http: 200, json: '<html>' }]), attendre: async () => {} });
    await assert.rejects(c.itineraire({ depart: DEP40, arrivee: ARR40 }), { code: 'reponse_illisible' });
  });
});

describe('reseau/itineraire-geoplateforme — contrôle croisé avec le graphe local', () => {
  // Le graphe est construit des étapes de la réponse elle-même : le service et le calage doivent s'accorder.
  // Deux des huit étapes de cette réponse n'ont qu'UNE position (un bout de tronçon coupé au point d'accroche) :
  // le graphe ne peut pas les construire, et c'est exactement ce que `inconnus` doit dire.
  const etapes = R40.portions.flatMap((p) => p.steps);
  const features = etapes.filter((s) => s.geometry.coordinates.length >= 2).map((s) => ({
    type: 'Feature',
    properties: { cleabs: s.attributes.cleabs, nature: 'Route à 1 chaussée', sens_de_circulation: s.attributes.sens_de_circulation },
    geometry: s.geometry,
  }));
  const g = construireGraphe(features);
  const r = lireReponse(R40, { depart: DEP40, arrivee: ARR40 });

  it('tronconsDuGraphe : les tronçons cités connus du graphe, et ceux qu’il ne connaît pas', () => {
    assert.equal(r.troncons.length, 8);
    const t = tronconsDuGraphe(r, g);
    assert.equal(t.connus.length, 6);
    assert.equal(t.inconnus.length, 2);
    assert.ok(t.inconnus.every((c) => etapes.find((s) => s.attributes.cleabs === c).geometry.coordinates.length === 1));
    for (const k of t.connus) assert.ok(k.s1 > 0 && k.s0 === 0);
  });

  it('le calage de la géométrie du service retrouve les mêmes tronçons (F1 en longueur ≥ 0,95 sur ceux que le graphe connaît)', () => {
    const calage = tracer(g, r.geometrie, 'hmm+pcc');
    assert.ok(calage.ok);
    const connus = tronconsDuGraphe(r, g).connus;
    const score = f1Troncons(connus, calage.troncons.map((t) => ({ cleabs: t.cleabs, s0: 0, s1: t.L })));
    assert.ok(score.f1 >= 0.95, `F1 ${score.f1}`);
  });
});

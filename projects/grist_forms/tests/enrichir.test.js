'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Enrichir = require('../shared/enrichir.js');

// Réponses réelles, mesurées le 18/10/2026, réduites à ce qui sert.
const REPONSES = {
  'data.geopf.fr/geocodage/reverse': { features: [{ properties: { label: '8 Boulevard du Port 80000 Amiens', postcode: '80000' } }] },
  'geo.api.gouv.fr/communes': [{ nom: 'Amiens', code: '80021', codesPostaux: ['80000', '80080', '80090'], departement: { code: '80', nom: 'Somme' } }],
  'rnb-api.beta.gouv.fr': { results: [{ rnb_id: '4SSWRT622MDN', distance: 0.19 }] },
  'data.geopf.fr/altimetrie': { elevations: [{ lon: 2.29, lat: 49.89, z: 26.6 }] },
  'georisques.gouv.fr': { data: [{ risques_detail: [{ libelle_risque_long: 'Inondation' }, { libelle_risque_long: 'Mouvement de terrain' }] }] }
};

function faux(options) {
  options = options || {};
  const appels = [];
  const f = (url) => {
    appels.push(url);
    if (options.refuse && options.refuse.some((m) => url.indexOf(m) !== -1)) return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
    if (options.tombe && options.tombe.some((m) => url.indexOf(m) !== -1)) return Promise.reject(new Error('réseau'));
    if (options.vide && options.vide.some((m) => url.indexOf(m) !== -1)) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(options.videReponse || {}) });
    const cle = Object.keys(REPONSES).find((m) => url.indexOf(m) !== -1);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(cle ? REPONSES[cle] : {}) });
  };
  f.appels = appels;
  return f;
}

const POINT = { lon: 2.290084, lat: 49.897442 };

describe('Enrichir — lire un point', () => {
  it('lit POINT(lon lat), avec ou sans espace, avec un SRID', () => {
    assert.deepEqual(Enrichir.pointDe('POINT(2.29 49.89)'), { lon: 2.29, lat: 49.89 });
    assert.deepEqual(Enrichir.pointDe('POINT (2.29 49.89)'), { lon: 2.29, lat: 49.89 });
    assert.deepEqual(Enrichir.pointDe('SRID=4326;POINT(2.29 49.89)'), { lon: 2.29, lat: 49.89 });
    assert.deepEqual(Enrichir.pointDe('POINT Z (2.29 49.89 20)'), { lon: 2.29, lat: 49.89 });
    assert.deepEqual(Enrichir.pointDe('POINT(-1.5 43.2)'), { lon: -1.5, lat: 43.2 });
  });

  it('refuse ce qui n’est pas un point en degrés', () => {
    assert.equal(Enrichir.pointDe('LINESTRING(0 0, 1 1)'), null);
    assert.equal(Enrichir.pointDe('MULTIPOINT((1 1),(2 2))'), null);
    assert.equal(Enrichir.pointDe('POINT(200 10)'), null, 'longitude hors bornes');
    assert.equal(Enrichir.pointDe('POINT(2 95)'), null, 'latitude hors bornes');
    assert.equal(Enrichir.pointDe('POINT(abc def)'), null);
    assert.equal(Enrichir.pointDe(''), null);
    assert.equal(Enrichir.pointDe(null), null);
  });
});

describe('Enrichir — quels services pour quels sens', () => {
  it('un seul appel par service, quel que soit le nombre de sens qu’il remplit', () => {
    const cols = { insee: 'CodeInsee', commune: 'Commune', codePostal: 'CP', departement: 'Dept' };
    assert.deepEqual(Enrichir.servicesPour(cols), ['commune']);
  });

  it('l’adresse vient de la Géoplateforme, la commune de l’API Géo — pas l’inverse', () => {
    assert.deepEqual(Enrichir.servicesPour({ adresse: 'A', insee: 'I' }).sort(), ['adresse', 'commune']);
  });

  it('latitude et longitude viennent du point lui-même : aucun appel', () => {
    assert.deepEqual(Enrichir.servicesPour({ latitude: 'Lat', longitude: 'Lon' }), []);
  });

  it('les types des sens : du texte pour les codes, un nombre pour l’altitude', () => {
    assert.equal(Enrichir.typeDuSens('insee'), 'Text');
    assert.equal(Enrichir.typeDuSens('altitude'), 'Numeric');
    assert.equal(Enrichir.typeDuSens('latitude'), 'Numeric');
    assert.equal(Enrichir.typeDuSens('inconnu'), null);
  });

  it('les colonnes d’une question : seuls les sens connus, avec une colonne', () => {
    const f = { options: { enrichir: { colonnes: { insee: 'CodeInsee', inconnu: 'X', adresse: '' } } } };
    assert.deepEqual(Enrichir.colonnesDe(f), { insee: 'CodeInsee' });
    assert.deepEqual(Enrichir.colonnesDe({}), {});
  });

  it('dit ce qui part et vers qui, et rien quand rien ne part', () => {
    assert.match(Enrichir.mention({ adresse: 'A', insee: 'I' }), /position choisie est envoyée à .* et .*/);
    assert.equal(Enrichir.mention({ latitude: 'Lat' }), '');
  });

  it('nomme une seule fois un opérateur qui fournit deux services', () => {
    const m = Enrichir.mention({ adresse: 'A', altitude: 'Alt', insee: 'I' });
    assert.equal((m.match(/Géoplateforme/g) || []).length, 1, m);
  });
});

describe('Enrichir — remplir les colonnes d’un point', () => {
  it('remplit chaque colonne demandée, depuis les bons services', async () => {
    const f = faux();
    const cols = { adresse: 'Adresse', insee: 'CodeInsee', codePostal: 'CP', batiment: 'RnbId', altitude: 'Alt', latitude: 'Lat', longitude: 'Lon' };
    const r = await Enrichir.enrichir(POINT, cols, { fetch: f });
    assert.deepEqual(r.valeurs, {
      Adresse: '8 Boulevard du Port 80000 Amiens', CodeInsee: '80021', CP: '80000', RnbId: '4SSWRT622MDN', Alt: 26.6,
      Lat: 49.897442, Lon: 2.290084
    });
    assert.deepEqual(r.echecs, []);
    assert.equal(f.appels.length, 4, 'adresse, commune, bâtiment, altitude : un appel chacun');
  });

  it('respecte l’ordre propre à chaque service', async () => {
    const f = faux();
    await Enrichir.enrichir(POINT, { adresse: 'A', batiment: 'B', risques: 'R' }, { fetch: f });
    assert.ok(f.appels.some((u) => u.includes('geocodage/reverse?lon=2.290084&lat=49.897442')), 'lon puis lat');
    assert.ok(f.appels.some((u) => u.includes('point=49.897442,2.290084')), 'RNB : lat puis lon');
    assert.ok(f.appels.some((u) => u.includes('latlon=2.290084,49.897442')), 'Géorisques : lon puis lat');
  });

  it('un service qui échoue laisse ses colonnes à null et n’empêche pas les autres', async () => {
    const f = faux({ tombe: ['rnb-api'], refuse: ['geo.api.gouv.fr'] });
    const r = await Enrichir.enrichir(POINT, { adresse: 'Adresse', insee: 'CodeInsee', batiment: 'RnbId' }, { fetch: f });
    assert.equal(r.valeurs.Adresse, '8 Boulevard du Port 80000 Amiens');
    assert.strictEqual(r.valeurs.CodeInsee, null, 'jamais 0 ni « undefined »');
    assert.strictEqual(r.valeurs.RnbId, null);
    assert.deepEqual(r.echecs.sort(), ['batiment', 'commune']);
  });

  it('aucun résultat n’est pas une panne : colonnes à null, service dit « vide »', async () => {
    const f = faux({ vide: ['rnb-api'], videReponse: { results: [] } });
    const r = await Enrichir.enrichir(POINT, { batiment: 'RnbId' }, { fetch: f });
    assert.strictEqual(r.valeurs.RnbId, null);
    assert.deepEqual(r.vides, ['batiment']);
    assert.deepEqual(r.echecs, []);
  });

  it('une altitude « pas de donnée » n’est pas une altitude', async () => {
    const f = faux({ vide: ['altimetrie'], videReponse: { elevations: [{ z: -99999 }] } });
    const r = await Enrichir.enrichir(POINT, { altitude: 'Alt' }, { fetch: f });
    assert.strictEqual(r.valeurs.Alt, null);
  });

  it('un service qui ne répond pas est coupé au délai et ne suspend pas la saisie', async () => {
    const lent = () => new Promise(() => {});
    const t0 = Date.now();
    const r = await Enrichir.enrichir(POINT, { insee: 'CodeInsee', latitude: 'Lat' }, { fetch: lent, delaiMs: 40 });
    assert.ok(Date.now() - t0 < 1000);
    assert.strictEqual(r.valeurs.CodeInsee, null);
    assert.equal(r.valeurs.Lat, 49.897442, 'la latitude vient du point, pas du service');
    assert.deepEqual(r.echecs, ['commune']);
  });

  it('sans service à appeler, ne fait aucun appel', async () => {
    const f = faux();
    const r = await Enrichir.enrichir(POINT, { latitude: 'Lat', longitude: 'Lon' }, { fetch: f });
    assert.equal(f.appels.length, 0);
    assert.deepEqual(r.valeurs, { Lat: 49.897442, Lon: 2.290084 });
  });

  it('les risques sont mis bout à bout', async () => {
    const r = await Enrichir.enrichir(POINT, { risques: 'Risques' }, { fetch: faux() });
    assert.equal(r.valeurs.Risques, 'Inondation ; Mouvement de terrain');
  });
});

describe('Enrichir — ce qu’on dit à la personne', () => {
  it('dit le lieu repéré, ou que rien n’a pu être complété', async () => {
    const cols = { adresse: 'Adresse', insee: 'CodeInsee' };
    const bon = await Enrichir.enrichir(POINT, cols, { fetch: faux() });
    assert.match(Enrichir.phrase(bon, cols), /Lieu repéré : 8 Boulevard du Port/);
    const panne = await Enrichir.enrichir(POINT, cols, { fetch: faux({ tombe: ['geopf', 'geo.api'] }) });
    assert.match(Enrichir.phrase(panne, cols), /n’ont pas pu être complétées; ?|conservée/);
    assert.match(Enrichir.phrase(panne, cols), /position est conservée/);
  });
});

describe('Enrichir — dans le moteur', () => {
  const Engine = require('../runtime/engine.js');
  const { createRoot } = require('./helpers/fake-dom.js');

  const lieu = () => ({
    colId: 'Lieu', label: 'Où ?', type: 'Text', widget: 'geo', kind: 'geometrie', required: true,
    options: { geometrie: 'Point', carte: false,
      enrichir: { colonnes: { adresse: 'Adresse', insee: 'CodeInsee', altitude: 'Alt', latitude: 'Lat', longitude: 'Lon' } } }
  });
  const formulaire = () => ({ id: 'l', title: 'Lieu', tableId: 'T', sections: [{ label: 'S', fields: [lieu()] }] });

  it('enrichirChamp ne fait rien pour une question qui n’enrichit pas, ou un WKT qui n’est pas un point', () => {
    assert.equal(Engine.enrichirChamp({ colId: 'X', options: {} }, 'POINT(1 1)'), null);
    assert.equal(Engine.enrichirChamp(lieu(), 'LINESTRING(0 0, 1 1)'), null);
  });

  it('enrichirChamp rend une valeur pour CHAQUE colonne désignée, et une phrase', async () => {
    const r = await Engine.enrichirChamp(lieu(), 'POINT(2.290084 49.897442)', { fetch: faux() });
    assert.deepEqual(Object.keys(r.valeurs).sort(), ['Adresse', 'Alt', 'CodeInsee', 'Lat', 'Lon']);
    assert.equal(r.valeurs.CodeInsee, '80021');
    assert.match(r.phrase, /Lieu repéré/);
  });

  it('une saisie de lieu complète les colonnes, et elles partent avec la réponse', async () => {
    const root = createRoot();
    let envoye = null;
    Engine.mount(root, formulaire(), { skipProbe: true, fetch: faux(), submit: (d) => { envoye = d; return Promise.resolve({ ok: true }); } });
    const champ = root.querySelector('[name="Lieu"]');
    champ.value = 'POINT(2.290084 49.897442)';
    champ.dispatchEvent('change');
    await new Promise((r) => setTimeout(r, 30));
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(envoye, 'le formulaire est parti');
    assert.equal(envoye.CodeInsee, '80021');
    assert.equal(envoye.Adresse, '8 Boulevard du Port 80000 Amiens');
    assert.equal(envoye.Lat, 49.897442);
    assert.equal(envoye.Alt, 26.6);
  });

  it('un service en panne laisse ses colonnes vides, jamais à 0, et le lieu part quand même', async () => {
    const root = createRoot();
    let envoye = null;
    Engine.mount(root, formulaire(), { skipProbe: true, fetch: faux({ tombe: ['geo', 'altimetrie'] }), submit: (d) => { envoye = d; return Promise.resolve({ ok: true }); } });
    const champ = root.querySelector('[name="Lieu"]');
    champ.value = 'POINT(2.29 49.89)';
    champ.dispatchEvent('change');
    await new Promise((r) => setTimeout(r, 30));
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(envoye);
    assert.strictEqual(envoye.CodeInsee, null);
    assert.strictEqual(envoye.Alt, null);
    assert.equal(envoye.Lieu, 'POINT(2.29 49.89)');
  });
});

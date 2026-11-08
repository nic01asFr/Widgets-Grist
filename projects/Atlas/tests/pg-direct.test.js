import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { creerCoucheDirecte, couchesDirectes, identifiantsDirects, libelleEtat, DELAI_ANTIREBOND_MS, LIMITE_DIRECT } from '../lib/pg-direct.js';
import { ErreurPasserelle } from '../lib/pg-passerelle.js';
import { htmlDirectes, htmlApercu } from '../lib/vue-import-pg.js';

/** Une carte MapLibre factice : sources, couches, écouteurs et dernières données. */
function fausseCarte() {
  const sources = new Map();
  const couches = new Map();
  const ecouteurs = new Map();
  const carte = {
    sources, couches, ecouteurs,
    getBounds: () => ({ getWest: () => 3.69, getEast: () => 3.70, getSouth: () => 43.40, getNorth: () => 43.41 }),
    getSource: (id) => sources.get(id),
    addSource: (id, def) => { sources.set(id, { def, data: def.data, setData(d) { this.data = d; } }); },
    removeSource: (id) => sources.delete(id),
    getLayer: (id) => couches.get(id),
    addLayer: (c) => { couches.set(c.id, c); },
    removeLayer: (id) => couches.delete(id),
    on: (nom, f) => { ecouteurs.set(nom, [...(ecouteurs.get(nom) || []), f]); },
    off: (nom, f) => { ecouteurs.set(nom, (ecouteurs.get(nom) || []).filter((x) => x !== f)); },
    emettre: (nom) => (ecouteurs.get(nom) || []).forEach((f) => f()),
  };
  return carte;
}

function fauxMinuteur() {
  const taches = new Map();
  let n = 0;
  return {
    taches,
    set: (f, ms) => { taches.set(++n, { f, ms }); return n; },
    clear: (t) => { taches.delete(t); },
    declencher() { const t = [...taches.entries()]; taches.clear(); t.forEach(([, v]) => v.f()); },
  };
}

const fc = (n, plus = {}) => ({ type: 'FeatureCollection', features: Array.from({ length: n }, (_, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [3.69, 43.4] }, properties: { i } })), nb_entites: n, tronque: false, avertissements: [], ...plus });

/** Un client factice dont chaque réponse est pilotée par le test. */
function fauxClient() {
  const appels = [];
  const attentes = [];
  return {
    appels,
    couche: (e) => { appels.push(e); return new Promise((resolve, reject) => attentes.push({ resolve, reject })); },
    repondre(i, valeur) { attentes[i].resolve(valeur); },
    echouer(i, e) { attentes[i].reject(e); },
  };
}

const params = { connexion: 'demo', schema: 'bati', table: 'batiment' };
const tick = () => new Promise((r) => setImmediate(r));

describe('pg-direct — la couche en direct', () => {
  it('identifiants et couches MapLibre : surfaces, lignes, points', () => {
    const ids = identifiantsDirects('x');
    assert.deepEqual(Object.values(ids), ['pg-direct-x', 'pg-direct-x-surface', 'pg-direct-x-ligne', 'pg-direct-x-point']);
    const c = couchesDirectes('x', '#123456');
    assert.deepEqual(c.map((l) => l.type), ['fill', 'line', 'circle']);
    assert.ok(c.every((l) => l.source === 'pg-direct-x'));
  });

  it('démarre : source vide posée, zone visible lue avec la limite et sans jamais passer le jeton', async () => {
    const carte = fausseCarte();
    const client = fauxClient();
    const etats = [];
    const d = creerCoucheDirecte({ carte, client, params, id: 'a', surEtat: (e) => etats.push(e.phase) });
    const lecture = d.demarrer();
    assert.ok(carte.getSource('pg-direct-a'), 'la source existe avant la réponse');
    assert.equal(carte.couches.size, 3);
    assert.deepEqual(client.appels[0], { ...params, bbox: [3.69, 43.4, 3.7, 43.41], limite: LIMITE_DIRECT });
    assert.equal(JSON.stringify(client.appels[0]).match(/jeton|Bearer|Authorization/i), null);
    client.repondre(0, fc(3));
    await lecture;
    assert.equal(carte.getSource('pg-direct-a').data.features.length, 3);
    assert.deepEqual(etats, ['lecture', 'ok']);
    assert.equal(d.etat.nb, 3);
  });

  it('un déplacement relit après l’anti-rebond, et plusieurs déplacements ne font qu’une lecture', async () => {
    const carte = fausseCarte();
    const client = fauxClient();
    const minuteur = fauxMinuteur();
    const d = creerCoucheDirecte({ carte, client, params, id: 'a', minuteur });
    const p = d.demarrer();
    client.repondre(0, fc(1));
    await p;
    carte.emettre('moveend'); carte.emettre('moveend'); carte.emettre('moveend');
    assert.equal(minuteur.taches.size, 1, 'un seul minuteur en attente');
    assert.equal([...minuteur.taches.values()][0].ms, DELAI_ANTIREBOND_MS);
    minuteur.declencher();
    assert.equal(client.appels.length, 2);
  });

  it('une réponse dépassée par une plus récente est ignorée', async () => {
    const carte = fausseCarte();
    const client = fauxClient();
    const d = creerCoucheDirecte({ carte, client, params, id: 'a' });
    const premiere = d.demarrer();
    const seconde = d.relire();
    client.repondre(1, fc(5)); // la plus récente répond d'abord
    await seconde;
    client.repondre(0, fc(2)); // l'ancienne arrive après : ignorée
    await premiere;
    assert.equal(carte.getSource('pg-direct-a').data.features.length, 5);
    assert.equal(d.etat.nb, 5);
  });

  it('un résultat tronqué reste affiché et se dit', async () => {
    const carte = fausseCarte();
    const client = fauxClient();
    const d = creerCoucheDirecte({ carte, client, params, id: 'a' });
    const p = d.demarrer();
    client.repondre(0, fc(5000, { tronque: true }));
    await p;
    assert.equal(d.etat.tronque, true);
    assert.equal(carte.getSource('pg-direct-a').data.features.length, 5000);
    assert.match(libelleEtat(d.etat), /tronqué : zoomez/);
  });

  it('une erreur garde les données déjà affichées et se dit avec son côté', async () => {
    const carte = fausseCarte();
    const client = fauxClient();
    const d = creerCoucheDirecte({ carte, client, params, id: 'a' });
    const p = d.demarrer();
    client.repondre(0, fc(2));
    await p;
    const q = d.relire();
    client.echouer(1, new ErreurPasserelle('La base ne répond pas', { code: 'x', cote: 'base' }));
    await q;
    assert.equal(d.etat.phase, 'erreur');
    assert.match(d.etat.erreur, /La base ne répond pas \(côté la base de données\)/);
    assert.equal(carte.getSource('pg-direct-a').data.features.length, 2, 'la carte n’est pas effacée');
  });

  it('arrêter retire couches, source et écouteurs, et ignore une réponse en vol', async () => {
    const carte = fausseCarte();
    const client = fauxClient();
    const minuteur = fauxMinuteur();
    const d = creerCoucheDirecte({ carte, client, params, id: 'a', minuteur });
    const p = d.demarrer();
    carte.emettre('moveend');
    d.arreter();
    assert.equal(carte.couches.size, 0);
    assert.equal(carte.sources.size, 0);
    assert.equal(minuteur.taches.size, 0);
    assert.equal(carte.ecouteurs.get('moveend').length, 0);
    assert.equal(carte.ecouteurs.get('style.load').length, 0);
    client.repondre(0, fc(9));
    await p;
    await tick();
    assert.equal(carte.sources.size, 0, 'la réponse tardive ne ressuscite pas la couche');
  });

  it('un changement de fond de plan repose la couche et relit', async () => {
    const carte = fausseCarte();
    const client = fauxClient();
    const d = creerCoucheDirecte({ carte, client, params, id: 'a' });
    const p = d.demarrer();
    client.repondre(0, fc(1));
    await p;
    carte.sources.clear(); carte.couches.clear(); // setStyle les a emportées
    carte.emettre('style.load');
    assert.ok(carte.getSource('pg-direct-a'));
    assert.equal(carte.couches.size, 3);
    assert.equal(client.appels.length, 2);
  });
});

describe('vue — les couches directes', () => {
  it('liste vide : rien ; sinon état et bouton Retirer, tout échappé', () => {
    assert.equal(htmlDirectes([]), '');
    const h = htmlDirectes([{ id: 'a', couleur: '#d62728', libelle: 'bati.<b>', etat: '12 entités' }]);
    assert.match(h, /data-retirer="a"/);
    assert.match(h, /cette session seulement/);
    assert.doesNotMatch(h, /<b>/);
  });

  it('le bouton « Lier en direct » est proposé avec l’aperçu, sans dépendre du document', () => {
    const h = htmlApercu({ table: { schema: 'a', table: 'b' }, phase: 'pret', couche: { nb_entites: 1, avertissements: [] }, plan: { ok: false, erreur: 'x' }, sansDocument: true, lectureSeule: true, nom: 'B' });
    assert.match(h, /data-act="direct"[^>]*>Lier en direct/);
    assert.doesNotMatch(h, /data-act="direct"[^>]*disabled/);
  });
});

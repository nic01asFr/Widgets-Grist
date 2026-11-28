import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  modeDe, zoomMinimal, gabaritTuiles, entetesTuile, registreTransformation, identifiantsTuiles, creerCoucheTuiles,
  SEUIL_TUILES, TYPE_MEDIA_TUILE, RENOUVELLEMENT_MS, ZOOM_MAX,
} from '../lib/pg-tuiles.js';
import { libelleEtat } from '../lib/pg-direct.js';

const RACINE = 'https://pg.exemple.fr/rest';

/** Une carte de poche : sources, couches, écouteurs, transformation de requêtes, zoom et entités affichées réglables. */
function fausseCarte() {
  const c = {
    sources: new Map(), couches: new Map(), ecouteurs: new Map(), transformation: null, zoom: 14, rendu: [], tuilesReglees: [],
    setTransformRequest(f) { c.transformation = f; },
    addSource(id, def) { c.sources.set(id, { ...def, setTiles(t) { c.tuilesReglees.push(t); } }); },
    getSource: (id) => c.sources.get(id) || null,
    removeSource: (id) => c.sources.delete(id),
    addLayer(def) { c.couches.set(def.id, def); },
    getLayer: (id) => c.couches.get(id) || null,
    removeLayer: (id) => c.couches.delete(id),
    getZoom: () => c.zoom,
    on(ev, f) { if (!c.ecouteurs.has(ev)) c.ecouteurs.set(ev, new Set()); c.ecouteurs.get(ev).add(f); },
    off(ev, f) { if (c.ecouteurs.has(ev)) c.ecouteurs.get(ev).delete(f); },
    emettre(ev, arg) { for (const f of [...(c.ecouteurs.get(ev) || [])]) f(arg); },
    queryRenderedFeatures: () => c.rendu,
    querySourceFeatures: () => c.rendu,
  };
  return c;
}

function faussClient({ jeton = 'jeton1', echec = null } = {}) {
  const k = { jeton, appelsTuiles: 0, garanties: 0, renouvelements: 0 };
  k.tuiles = async () => { k.appelsTuiles++; if (echec) throw new Error(echec); return { racine: RACINE }; };
  k.jetonCourant = () => k.jeton;
  k.garantirJeton = async () => { k.garanties++; return k.jeton; };
  k.renouveler = async () => { k.renouvelements++; k.jeton = 'jeton' + (k.renouvelements + 1); return k.jeton; };
  return k;
}

const faussMinuteur = () => {
  const m = { actifs: new Map(), n: 0 };
  m.set = (f, ms) => { const id = ++m.n; m.actifs.set(id, { f, ms }); return id; };
  m.clear = (id) => m.actifs.delete(id);
  return m;
};

describe('pg-tuiles — le mode, le zoom minimal, l’adresse', () => {
  it('le mode suit la taille de la table, et seulement si le contrat sait servir des tuiles', () => {
    assert.equal(modeDe({ lignesEstimees: 500000, capacites: ['zone', 'tuiles'] }), 'tuiles');
    assert.equal(modeDe({ lignesEstimees: SEUIL_TUILES + 1, capacites: ['tuiles'] }), 'tuiles');
    assert.equal(modeDe({ lignesEstimees: SEUIL_TUILES, capacites: ['tuiles'] }), 'geojson', 'à la limite : GeoJSON');
    assert.equal(modeDe({ lignesEstimees: 500000, capacites: ['zone'] }), 'geojson', 'contrat sans tuiles (PostGIS 3.0, ancien SQL)');
    assert.equal(modeDe({ lignesEstimees: null, capacites: ['tuiles'] }), 'geojson', 'taille inconnue : GeoJSON');
    assert.equal(modeDe({ lignesEstimees: 0, capacites: ['tuiles'] }), 'geojson');
    assert.equal(modeDe({}), 'geojson');
    assert.equal(modeDe(), 'geojson');
  });

  it('plus la table est grande, plus il faut s’approcher', () => {
    assert.equal(zoomMinimal(30000), 9);
    assert.equal(zoomMinimal(50000), 9);
    assert.equal(zoomMinimal(150000), 11);
    assert.equal(zoomMinimal(500000), 12);
    assert.equal(zoomMinimal(5_000_000), 13);
    assert.equal(zoomMinimal(null), 10);
    assert.equal(zoomMinimal(-1), 10);
    assert.ok(zoomMinimal(10) <= zoomMinimal(10_000_000), 'monotone');
  });

  it('le gabarit porte {z}/{x}/{y} tels quels ; table, schéma et colonnes sont encodés', () => {
    const g = gabaritTuiles(RACINE + '/', { schema: 'mon schéma', table: 'a&b=c', colonnes: ['nom', 'categorie'] });
    assert.ok(g.startsWith(RACINE + '/rpc/tuile?'), 'sans double barre');
    assert.ok(g.endsWith('&z={z}&x={x}&y={y}'));
    assert.match(g, /schema_nom=mon%20sch%C3%A9ma/);
    assert.match(g, /table_nom=a%26b%3Dc/);
    assert.match(g, /colonnes=%7Bnom%2Ccategorie%7D/);
    assert.ok(!/a&b=c/.test(g), 'un nom hostile ne crée pas de paramètre');
    assert.doesNotMatch(gabaritTuiles(RACINE, { schema: 's', table: 't' }), /colonnes=/, 'sans colonnes : tous les attributs');
  });

  it('les en-têtes d’une tuile : le jeton, le type de média, le schéma du contrat', () => {
    assert.deepEqual(entetesTuile('abc'), { Authorization: 'Bearer abc', Accept: TYPE_MEDIA_TUILE, 'Accept-Profile': 'atlas' });
    assert.equal(entetesTuile(null).Authorization, undefined, 'sans jeton : pas d’en-tête d’autorisation');
  });

  it('les identifiants MapLibre ont la forme de ceux d’une couche directe (l’édition les attend)', () => {
    assert.deepEqual(Object.keys(identifiantsTuiles('x')), ['source', 'surface', 'ligne', 'point']);
  });

  it('le message d’état du mode tuiles passe tel quel', () => {
    assert.equal(libelleEtat({ phase: 'ok', nb: 3, message: 'zoomez (niveau 12 au moins)' }), 'zoomez (niveau 12 au moins)');
    assert.equal(libelleEtat({ phase: 'ok', nb: 2, tronque: false }), '2 entités', 'sans message : comme avant');
  });
});

describe('pg-tuiles — la transformation des requêtes : le jeton ne part que vers PostgREST', () => {
  it('une tuile de PostgREST reçoit ses en-têtes ; tout le reste, rien', () => {
    const carte = fausseCarte();
    const enregistrer = registreTransformation(carte);
    enregistrer(`${RACINE}/rpc/tuile`, () => entetesTuile('secret'));
    const url = `${RACINE}/rpc/tuile?schema_nom=a&table_nom=b&z=1&x=0&y=0`;
    assert.equal(carte.transformation(url, 'Tile').headers.Authorization, 'Bearer secret');
    assert.deepEqual(carte.transformation('https://autre.exemple.fr/rpc/tuile?z=1', 'Tile'), { url: 'https://autre.exemple.fr/rpc/tuile?z=1' }, 'jamais vers une autre origine');
    assert.deepEqual(carte.transformation('https://tile.openstreetmap.org/1/0/0.png', 'Tile'), { url: 'https://tile.openstreetmap.org/1/0/0.png' });
    assert.deepEqual(carte.transformation(url, 'Source'), { url }, 'seulement les tuiles, pas une source JSON');
    assert.deepEqual(carte.transformation(`${RACINE}/rpc/contrat`, 'Tile'), { url: `${RACINE}/rpc/contrat` }, 'seule la route de tuiles');
  });

  it('une transformation unique est posée sur la carte, partagée ; se désinscrire retire la route', () => {
    const carte = fausseCarte();
    let poses = 0;
    const origine = carte.setTransformRequest;
    carte.setTransformRequest = (f) => { poses++; origine(f); };
    const a = registreTransformation(carte)('https://a.exemple.fr/rpc/tuile', () => ({ Authorization: 'A' }));
    const b = registreTransformation(carte)('https://b.exemple.fr/rpc/tuile', () => ({ Authorization: 'B' }));
    assert.equal(poses, 1, 'posée une seule fois');
    assert.equal(carte.transformation('https://a.exemple.fr/rpc/tuile?z=1', 'Tile').headers.Authorization, 'A');
    assert.equal(carte.transformation('https://b.exemple.fr/rpc/tuile?z=1', 'Tile').headers.Authorization, 'B');
    a();
    assert.deepEqual(carte.transformation('https://a.exemple.fr/rpc/tuile?z=1', 'Tile'), { url: 'https://a.exemple.fr/rpc/tuile?z=1' });
    assert.equal(carte.transformation('https://b.exemple.fr/rpc/tuile?z=1', 'Tile').headers.Authorization, 'B');
    b();
  });
});

describe('pg-tuiles — la couche', () => {
  const params = { connexion: 'base', schema: 'metier', table: 'gros' };
  const fabrique = (o = {}) => {
    const carte = fausseCarte(); const client = faussClient(o.client); const minuteur = faussMinuteur(); const etats = [];
    const couche = creerCoucheTuiles({ carte, client, params, id: 'g', lignesEstimees: 500000, minuteur, surEtat: (e) => etats.push(e), ...o.reglages });
    return { carte, client, minuteur, etats, couche };
  };

  it('démarrer pose une source vectorielle et trois couches, bornées au zoom minimal de la table', async () => {
    const { carte, couche, client } = fabrique();
    await couche.demarrer();
    const src = carte.getSource('pg-tuiles-g');
    assert.equal(src.type, 'vector');
    assert.equal(src.tiles.length, 1);
    assert.ok(src.tiles[0].startsWith(`${RACINE}/rpc/tuile?schema_nom=metier&table_nom=gros`));
    assert.equal(src.maxzoom, ZOOM_MAX);
    const ids = couche.ids;
    for (const k of ['surface', 'ligne', 'point']) {
      const l = carte.getLayer(ids[k]);
      assert.equal(l.source, ids.source);
      assert.equal(l['source-layer'], 'gros', 'la couche de la tuile porte le nom de la table');
      assert.equal(l.minzoom, 12, '500 000 lignes : à partir du zoom 12');
    }
    assert.equal(carte.getLayer(ids.surface).type, 'fill');
    assert.equal(carte.getLayer(ids.ligne).type, 'line');
    assert.equal(carte.getLayer(ids.point).type, 'circle');
    assert.equal(client.appelsTuiles, 1);
    assert.equal(couche.mode, 'tuiles');
  });

  it('le jeton part avec les tuiles de CETTE adresse, et seulement elles', async () => {
    const { carte, couche } = fabrique();
    await couche.demarrer();
    const url = carte.getSource('pg-tuiles-g').tiles[0].replace('{z}', '12').replace('{x}', '1').replace('{y}', '2');
    assert.equal(carte.transformation(url, 'Tile').headers.Authorization, 'Bearer jeton1');
    assert.equal(carte.transformation('https://autre.exemple.fr/x', 'Tile').headers, undefined);
  });

  it('en dessous du zoom minimal la couche dit « zoomez » ; au-dessus elle compte ce qui est affiché', async () => {
    const { carte, couche, etats } = fabrique();
    carte.zoom = 8;
    await couche.demarrer();
    let e = etats.at(-1);
    assert.equal(e.nb, 0);
    assert.match(libelleEtat(e), /zoomez \(niveau 12 au moins\).*500[\s  ]000 lignes/);
    carte.zoom = 13;
    carte.rendu = [{ properties: { id: 1 } }, { properties: { id: 1 } }, { properties: { id: 2 } }, { properties: {} }];
    carte.emettre('moveend');
    e = etats.at(-1);
    assert.equal(e.nb, 3, 'une entité coupée entre deux tuiles n’est comptée qu’une fois ; une sans clé compte pour une');
    assert.match(libelleEtat(e), /3 entités affichées \(tuiles\)/);
  });

  it('un minuteur renouvelle le jeton avant son expiration', async () => {
    const { minuteur, couche, client } = fabrique();
    await couche.demarrer();
    assert.equal(minuteur.actifs.size, 1);
    const [{ f, ms }] = [...minuteur.actifs.values()];
    assert.equal(ms, RENOUVELLEMENT_MS);
    f();
    assert.equal(client.garanties, 1);
  });

  it('un 401 d’une tuile renouvelle le jeton et relit la source ; un autre statut est dit', async () => {
    const { carte, couche, client, etats } = fabrique();
    await couche.demarrer();
    carte.emettre('error', { sourceId: 'pg-tuiles-g', error: { status: 401 } });
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(client.renouvelements, 1);
    assert.equal(carte.tuilesReglees.length, 1, 'les tuiles sont relues');
    carte.emettre('error', { sourceId: 'pg-tuiles-g', error: { status: 503 } });
    assert.equal(etats.at(-1).phase, 'erreur');
    assert.match(etats.at(-1).erreur, /503/);
    const avant = client.renouvelements;
    carte.emettre('error', { sourceId: 'autre-source', error: { status: 401 } });
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(client.renouvelements, avant, 'l’erreur d’une autre source ne la concerne pas');
    carte.emettre('error', { sourceId: 'pg-tuiles-g', error: { status: 404 } });
    assert.equal(etats.at(-1).phase, 'erreur', 'une tuile 404 n’est pas une erreur nouvelle : l’état reste celui d’avant');
  });

  it('arrêter retire tout : couches, source, écouteurs, minuteur, route du jeton', async () => {
    const { carte, couche, minuteur } = fabrique();
    await couche.demarrer();
    const url = carte.getSource('pg-tuiles-g').tiles[0].replace('{z}', '1').replace('{x}', '0').replace('{y}', '0');
    couche.arreter();
    assert.equal(carte.couches.size, 0);
    assert.equal(carte.sources.size, 0);
    assert.equal(minuteur.actifs.size, 0);
    assert.equal([...carte.ecouteurs.values()].reduce((n, s) => n + s.size, 0), 0);
    assert.deepEqual(carte.transformation(url, 'Tile'), { url }, 'plus aucun jeton ne part');
  });

  it('un échec (pas un échangeur, jeton refusé) est dit et relancé, sans rien poser sur la carte', async () => {
    const { carte, couche, etats } = fabrique({ client: { echec: 'Cette adresse n’est pas un échangeur' } });
    await assert.rejects(couche.demarrer(), /pas un échangeur/);
    assert.equal(etats.at(-1).phase, 'erreur');
    assert.equal(carte.couches.size, 0);
    assert.equal(carte.sources.size, 0);
  });

  it('démarrer deux fois ne pose rien deux fois', async () => {
    const { carte, couche, client } = fabrique();
    await couche.demarrer();
    await couche.demarrer();
    assert.equal(client.appelsTuiles, 1);
    assert.equal(carte.sources.size, 1);
    assert.equal(carte.couches.size, 3);
  });

  it('les entités déjà chargées servent à cadrer la couche', async () => {
    const { carte, couche } = fabrique();
    await couche.demarrer();
    carte.rendu = [{ type: 'Feature', geometry: { type: 'Point', coordinates: [5, 43] }, properties: {} }];
    assert.equal(couche.entites().length, 1);
  });

  it('la couche se souvient de la dernière vue où elle montrait des entités', async () => {
    const { carte, couche } = fabrique();
    carte.getCenter = () => ({ lng: 5.4, lat: 43.3 });
    carte.zoom = 8;
    await couche.demarrer();
    assert.equal(couche.derniereVue(), null, 'rien d’affiché en dessous du zoom minimal : pas de vue à retenir');
    carte.zoom = 13;
    carte.rendu = [{ properties: { id: 1 } }];
    carte.emettre('moveend');
    assert.deepEqual(couche.derniereVue(), { centre: { lng: 5.4, lat: 43.3 }, zoom: 13 });
    carte.zoom = 6;
    carte.emettre('moveend');
    assert.equal(couche.derniereVue().zoom, 13, 'elle garde la dernière vue utile');
  });

  it('les colonnes demandées allègent les tuiles', async () => {
    const { carte, couche } = fabrique({ reglages: { colonnes: ['id', 'nom'] } });
    await couche.demarrer();
    assert.match(carte.getSource('pg-tuiles-g').tiles[0], /colonnes=%7Bid%2Cnom%7D/);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleApparence, typeDepuisCatalogue, typeDominant, identifiantsCoucheAtlas } from '../lib/pg-couche-atlas.js';
import { creerCoucheDirecte } from '../lib/pg-direct.js';

const f = (type, coordinates = [0, 0]) => ({ type: 'Feature', geometry: { type, coordinates }, properties: {} });

describe('pg-couche-atlas — la clé d’apparence', () => {
  it('l’ORIGINE de l’adresse, la connexion et la table : stable quand le chemin ou la barre finale changent', () => {
    const a = cleApparence({ url: 'https://atlas-pg.exemple.fr', connexion: 'base', schema: 'metier', table: 'zones' });
    assert.equal(a, 'pg:https://atlas-pg.exemple.fr:base:metier.zones');
    assert.equal(cleApparence({ url: 'https://atlas-pg.exemple.fr/rest/', connexion: 'base', schema: 'metier', table: 'zones' }), a);
    assert.equal(cleApparence({ url: 'https://atlas-pg.exemple.fr:443/x?y=1#z', connexion: 'base', schema: 'metier', table: 'zones' }), a);
  });

  it('deux tables, deux connexions, deux adresses : trois clés différentes', () => {
    const base = { url: 'https://a.exemple.fr', connexion: 'base', schema: 'metier', table: 'zones' };
    const cles = new Set([cleApparence(base), cleApparence({ ...base, table: 'routes' }), cleApparence({ ...base, connexion: 'autre' }), cleApparence({ ...base, url: 'https://b.exemple.fr' }), cleApparence({ ...base, schema: 'public' })]);
    assert.equal(cles.size, 5);
  });

  it('une adresse illisible donne tout de même une clé stable, jamais d’exception', () => {
    assert.equal(cleApparence({ url: 'pas une adresse', connexion: 'b', schema: 's', table: 't' }), 'pg:pas une adresse:b:s.t');
    assert.equal(cleApparence({ url: undefined, connexion: 'b', schema: 's', table: 't' }), 'pg::b:s.t');
  });

  it('la clé ne contient jamais d’identité ni de jeton : seule l’origine y figure', () => {
    const cle = cleApparence({ url: 'https://u:motdepasse@pg.exemple.fr/x?jeton=secret', connexion: 'b', schema: 's', table: 't' });
    assert.doesNotMatch(cle, /motdepasse|secret|jeton/);
  });
});

describe('pg-couche-atlas — le type de géométrie', () => {
  it('le catalogue dit le type : « PointZ » devient « Point » ; un type inconnu ou absent, null', () => {
    assert.equal(typeDepuisCatalogue([{ colonne: 'geom', type: 'Polygon' }]), 'Polygon');
    assert.equal(typeDepuisCatalogue([{ colonne: 'geom', type: 'PointZ' }]), 'Point');
    assert.equal(typeDepuisCatalogue([{ colonne: 'geom', type: 'MultiLineStringZM' }]), 'MultiLineString');
    assert.equal(typeDepuisCatalogue([{ colonne: 'geom', type: null }]), null, 'colonne « geometry » sans type');
    assert.equal(typeDepuisCatalogue([{ colonne: 'geom', type: 'Curve' }]), null);
    assert.equal(typeDepuisCatalogue([]), null);
    assert.equal(typeDepuisCatalogue(undefined), null);
  });

  it('les entités disent le type dominant ; une table mixte suit la famille la plus fréquente', () => {
    assert.equal(typeDominant([f('Point'), f('Point'), f('Polygon')]), 'Point');
    assert.equal(typeDominant([f('Polygon'), f('MultiPolygon'), f('MultiPolygon'), f('Point')]), 'MultiPolygon', 'dans la famille, le type exact le plus fréquent');
    assert.equal(typeDominant([f('LineString'), f('MultiLineString'), f('Point')]), 'LineString');
  });

  it('rien à lire : le type par défaut, jamais un type inventé', () => {
    assert.equal(typeDominant([], 'Point'), 'Point');
    assert.equal(typeDominant(undefined), 'Polygon');
    assert.equal(typeDominant([{ type: 'Feature', geometry: null }, { type: 'Feature' }, f('GeometryCollection')], 'LineString'), 'LineString');
  });

  it('les identifiants MapLibre passent tous par la couche principale', () => {
    assert.deepEqual(identifiantsCoucheAtlas('pg-x'), { source: 'pg-x', surface: 'pg-x', ligne: 'pg-x', point: 'pg-x' });
  });
});

describe('pg-direct — le rendu délégué à l’hôte', () => {
  function carte() {
    const c = { sources: [], couches: [], ecouteurs: new Map() };
    c.getBounds = () => ({ getWest: () => 5, getEast: () => 6, getSouth: () => 43, getNorth: () => 44 });
    c.on = (e, fn) => { c.ecouteurs.set(e, fn); };
    c.off = (e) => { c.ecouteurs.delete(e); };
    c.getSource = (id) => (c.sources.find((x) => x[0] === id) ? { setData() {} } : null);
    c.getLayer = (id) => (c.couches.find((x) => x[0].id === id) ? {} : null);
    c.addSource = (...a) => c.sources.push(a); c.addLayer = (...a) => c.couches.push(a);
    c.removeSource = () => { c.retire = true; }; c.removeLayer = () => { c.retire = true; };
    return c;
  }
  const entites = [f('Point', [5.4, 43.3])];
  const client = { couche: async () => ({ features: entites, nb_entites: 1, tronque: false }) };

  it('les entités vont à l’hôte ; le module ne pose ni source ni couche sur la carte', async () => {
    const c = carte(); const recu = [];
    const rendu = { ids: identifiantsCoucheAtlas('pg-x'), surDonnees: (e, meta) => recu.push([e, meta]) };
    const couche = creerCoucheDirecte({ carte: c, client, params: { connexion: 'b', schema: 's', table: 't' }, id: 'x', rendu });
    await couche.demarrer();
    assert.equal(recu.length, 1);
    assert.equal(recu[0][0], entites);
    assert.equal(recu[0][1].tronque, false);
    assert.equal(c.sources.length, 0);
    assert.equal(c.couches.length, 0);
    assert.deepEqual(couche.ids, rendu.ids, 'les identifiants sont ceux de la couche de l’hôte (l’édition les lit)');
  });

  it('arrêter ne retire rien de la carte : la couche est celle de l’hôte', async () => {
    const c = carte();
    const couche = creerCoucheDirecte({ carte: c, client, params: { connexion: 'b', schema: 's', table: 't' }, id: 'x', rendu: { ids: identifiantsCoucheAtlas('pg-x'), surDonnees() {} } });
    await couche.demarrer();
    couche.arreter();
    assert.equal(c.retire, undefined);
    assert.equal(c.ecouteurs.size, 0, 'mais ses écouteurs de déplacement sont retirés');
  });

  it('sans hôte, le comportement d’avant est inchangé : le module dessine lui-même', async () => {
    const c = carte();
    const couche = creerCoucheDirecte({ carte: c, client, params: { connexion: 'b', schema: 's', table: 't' }, id: 'x' });
    await couche.demarrer();
    assert.equal(c.sources.length, 1);
    assert.equal(c.couches.length, 3);
  });
});

describe('garde-fous du branchement dans l’application', () => {
  const app = readFileSync(new URL('../app_v7.js', import.meta.url), 'utf8');
  const debut = app.indexOf('function creerRenduCoucheAtlas');
  const corps = app.slice(debut, app.indexOf('\nfunction renderLayersPanelLecture', debut));

  it('la couche PostgreSQL ne s’écrit jamais comme une couche qu’Atlas détient : elle porte une clé d’apparence', () => {
    assert.ok(debut > 0);
    assert.match(corps, /layer\.manifestLayerId = cle/, 'clé d’apparence : l’aiguillage de saveLayerToGrist range son style dans Atlas_LayerPrefs, sans géométrie');
    assert.doesNotMatch(corps, /saveLayerToGrist|Maquette_Layers|AddRecord|applyUserActions/, 'aucune écriture de couche ni d’entités dans ce chemin');
  });

  it('elle est lue seule, à plat, et déclarée comme venant de PostgreSQL', () => {
    assert.match(corps, /layer\.source = 'postgresql'/);
    assert.match(corps, /polygonMode = 'flat'/);
    assert.match(corps, /_pgLive/);
  });

  it('supprimer la couche dans Atlas arrête ses lectures', () => {
    assert.match(app, /if \(l\._pgLive && STATE\.pgVue\) STATE\.pgVue\.retirerCoucheParAtlas\(l\.id\)/);
  });

  it('l’aiguillage des enregistrements range bien une telle couche dans les préférences', async () => {
    const { clePrefsCouche, ligneInventaireRequise } = await import('../lib/grist-sync.js');
    const couche = { id: 'pg-x', manifestLayerId: 'pg:https://a.exemple.fr:base:metier.zones', _pgLive: {}, source: 'postgresql' };
    assert.equal(clePrefsCouche(couche), 'pg:https://a.exemple.fr:base:metier.zones');
    assert.equal(ligneInventaireRequise(couche), false, 'pas de ligne d’inventaire (donc rien dans Maquette_Layers)');
  });
});

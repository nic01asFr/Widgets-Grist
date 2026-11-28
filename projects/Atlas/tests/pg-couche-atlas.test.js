import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  cleApparence, typeDepuisCatalogue, typeDominant, identifiantsCoucheAtlas, valeursDepuisStats, bornesDepuisStats, champsDepuisColonnes,
} from '../lib/pg-couche-atlas.js';
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

  it('le projet (fichier téléchargé, copie locale du navigateur) ne contient jamais les entités d’une couche PostgreSQL', () => {
    const debutProjet = app.indexOf('function buildProject');
    const projet = app.slice(debutProjet, app.indexOf('\nfunction saveProject', debutProjet));
    assert.ok(debutProjet > 0);
    assert.match(projet, /STATE\.layers\.filter\(\(l\) => !l\._pgLive\)/, 'les couches PostgreSQL sont écartées avant la sérialisation');
  });

  it('l’édition locale est verrouillée : clic, bouton Éditer, revue objet par objet, entrée en mode sélection', () => {
    assert.match(app, /if \(layer\._distant \|\| layer\._pgLive\) \{\s+ouvrirObjet\(layer, idx, \{ lngLat: e\.lngLat, feature: f \}\);/, 'le clic ouvre la bulle de consultation');
    const bouton = app.slice(app.indexOf('function boutonRevueObjets'), app.indexOf('function boutonRevueObjets') + 400);
    assert.match(bouton, /if \(layer\._pgLive\) return '';/, 'pas de bouton « Éditer » ni « Saisir »');
    const revue = app.slice(app.indexOf('    editLayerObjects(id) {'), app.indexOf('    editLayerObjects(id) {') + 400);
    assert.match(revue, /if \(l\._pgLive\) \{ showToast\(/, 'la revue objet par objet est refusée, dite');
    const selection = app.slice(app.indexOf('function enterSelectionMode'), app.indexOf('function enterSelectionMode') + 2500);
    assert.match(selection, /if \(coucheCliquee\?\._pgLive\) \{\s+if \(idx != null\) ouvrirObjet\(coucheCliquee, idx, \{\}\);/, 'tout chemin vers la sélection (recherche, rectangle) ouvre la consultation');
    assert.ok(selection.indexOf('_pgLive') < selection.indexOf('STATE.selection.mode = true'), 'le verrou précède l’entrée en mode sélection');
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

describe('pg-couche-atlas — les statistiques de la base à la place des entités', () => {
  it('les valeurs distinctes : au format de la symbologie, la plus fréquente d’abord, en texte', () => {
    const stat = { valeurs_completes: true, valeurs: [{ valeur: '5', n: 55771 }, { valeur: '7', n: 55662 }, { valeur: '0', n: 28072 }] };
    assert.deepEqual(valeursDepuisStats(stat), [{ value: '5', count: 55771 }, { value: '7', count: 55662 }, { value: '0', count: 28072 }]);
    assert.equal(valeursDepuisStats(stat, 2).length, 2, 'le plafond de la symbologie est respecté');
  });

  it('jamais une liste coupée présentée comme complète : trop de valeurs distinctes, rien', () => {
    assert.equal(valeursDepuisStats({ valeurs_completes: false, distinctes: 99327 }), null);
    assert.equal(valeursDepuisStats({ valeurs: [{ valeur: 'a', n: 1 }] }), null, 'sans la garantie « complètes », on ne s’en sert pas');
    assert.equal(valeursDepuisStats(undefined), null);
    assert.equal(valeursDepuisStats(null), null);
  });

  it('les bornes numériques et le nombre de valeurs non nulles', () => {
    assert.deepEqual(bornesDepuisStats({ min: 0.01, max: 1000, nuls: 10 }, 500000), { min: 0.01, max: 1000, count: 499990 });
    assert.deepEqual(bornesDepuisStats({ min: '8', max: '12.5', nuls: 0 }, 2), { min: 8, max: 12.5, count: 2 }, 'des nombres écrits en texte sont lus');
  });

  it('pas de bornes quand il n’y en a pas : texte, table vide, valeur non finie', () => {
    assert.equal(bornesDepuisStats({ nuls: 0, distinctes: 3 }, 10), null, 'un champ texte n’a ni min ni max');
    assert.equal(bornesDepuisStats({ min: null, max: null, nuls: 0 }, 0), null, 'table vide');
    assert.equal(bornesDepuisStats({ min: 'abc', max: 'xyz' }, 10), null);
    assert.equal(bornesDepuisStats(undefined, 10), null);
  });

  it('une borne à zéro est une borne (pas une absence)', () => {
    assert.deepEqual(bornesDepuisStats({ min: 0, max: 9, nuls: 0 }, 5), { min: 0, max: 9, count: 5 });
  });

  it('les champs d’une symbologie : tout sauf la géométrie, avec le type Grist qui fait autorité', () => {
    const colonnes = [{ nom: 'id', type: 'integer' }, { nom: 'nom', type: 'text' }, { nom: 'geom', type: 'geometry(Point,4326)', geometrie: true }, { nom: 'valeur', type: 'numeric(8,2)' }];
    const typeGrist = (t) => (/^(integer|numeric)/.test(t) ? 'Numeric' : 'Text');
    assert.deepEqual(champsDepuisColonnes(colonnes, typeGrist), [
      { name: 'id', label: 'id', gType: 'Numeric' }, { name: 'nom', label: 'nom', gType: 'Text' }, { name: 'valeur', label: 'valeur', gType: 'Numeric' },
    ]);
    assert.deepEqual(champsDepuisColonnes(undefined, typeGrist), []);
  });
});

describe('garde-fous du branchement d’une grosse table dans l’application', () => {
  const app = readFileSync(new URL('../app_v7.js', import.meta.url), 'utf8');
  const debut = app.indexOf('function creerRenduTuilesAtlas');
  const corps = app.slice(debut, app.indexOf('\nfunction renderLayersPanelLecture', debut));

  it('une couche en tuiles est une couche DISTANTE (Atlas ne détient pas ses entités) portant une clé d’apparence, sans écriture', () => {
    assert.ok(debut > 0);
    assert.match(corps, /layer\._distant = true/);
    assert.match(corps, /layer\.manifestLayerId = cle/);
    assert.match(corps, /layer\._pgLive = /);
    assert.doesNotMatch(corps, /saveLayerToGrist|Maquette_Layers|AddRecord|applyUserActions/);
  });

  it('elle s’ajoute à la carte comme source VECTORIELLE, et seules les couches de style dont la source est une couche en tuiles reçoivent le nom de la couche de tuile', () => {
    assert.match(app, /if \(layer\._tuilesPg\) return addTuilesPgToMap\(layer\)/);
    assert.match(app, /type: 'vector', tiles: \[layer\._tuilesPg\.gabarit\]/);
    const enveloppe = app.slice(app.indexOf('function installerSourceLayerPg'), app.indexOf('function addTuilesPgToMap'));
    assert.match(enveloppe, /STATE\.layers\.find\(\(l\) => l\._tuilesPg && l\.id === spec\.source\)/, 'une spécification sans cette source passe inchangée');
    assert.match(enveloppe, /if \(!c\) return ajouter\(spec, avant\)/);
    assert.match(enveloppe, /'source-layer': c\._tuilesPg\.table/);
  });

  it('les classes et les catégories viennent des statistiques de la base', () => {
    assert.match(app, /valeursDepuisStats\(layer\?\._stats\?\.\[field\], max\)/);
    assert.match(app, /bornesDepuisStats\(layer\?\._stats\?\.\[field\], layer\?\._statsTotal\)/);
  });
});

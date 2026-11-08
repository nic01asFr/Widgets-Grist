import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  identifiantColonne, typeDeCouche, centre, convertir, planImportPg, colonnesDuLot, messageImportPartiel, TAILLE_LOT_GEOMETRIE,
} from '../lib/pg-import.js';
import { listerTables, htmlTables, htmlApercu } from '../lib/vue-import-pg.js';

const point = (x, y) => ({ type: 'Point', coordinates: [x, y] });
const surface = (x, y) => ({ type: 'Polygon', coordinates: [[[x, y], [x + 2, y], [x + 2, y + 4], [x, y + 4], [x, y]]] });
const fc = (features, plus = {}) => ({ type: 'FeatureCollection', features, nb_entites: features.length, tronque: false, limite: 1000, avertissements: [], ...plus });
const entite = (geometry, properties) => ({ type: 'Feature', geometry, properties });

describe('pg-import — les noms', () => {
  it('translittère, évite id, gristHelper_ et les doublons (casse ignorée)', () => {
    const pris = new Set();
    assert.equal(identifiantColonne('Coût (€)', pris), 'Cout');
    assert.equal(identifiantColonne('id', pris), 'pg_id');
    assert.equal(identifiantColonne('2024', pris), 'c_2024');
    assert.equal(identifiantColonne('COUT', pris), 'COUT_2');
    assert.equal(identifiantColonne('gristHelper_x', pris), 'pg_gristHelper_x');
    assert.equal(identifiantColonne('', pris), 'colonne');
  });
});

describe('pg-import — la géométrie', () => {
  it('déduit le type de couche et refuse les types mêlés', () => {
    assert.equal(typeDeCouche([entite(point(1, 2), {}), entite({ type: 'MultiPoint', coordinates: [[1, 2]] }, {})]).type, 'Point');
    assert.equal(typeDeCouche([entite(surface(0, 0), {})]).type, 'Polygon');
    const m = typeDeCouche([entite(point(1, 2), {}), entite(surface(0, 0), {})]);
    assert.equal(m.mixte, true);
    assert.deepEqual(m.compte, { Point: 1, Polygon: 1 });
    assert.equal(typeDeCouche([entite(null, {})]).type, null);
  });

  it('centre : le point lui-même, ou le centre de l’emprise', () => {
    assert.deepEqual(centre(point(3.7, 43.4)), { lon: 3.7, lat: 43.4 });
    assert.deepEqual(centre(surface(10, 20)), { lon: 11, lat: 22 });
    assert.equal(centre(null), null);
  });
});

describe('pg-import — les valeurs', () => {
  it('une absence reste null, jamais 0 ni vide', () => {
    for (const t of ['Int', 'Numeric', 'Text', 'Date', 'DateTime', 'Bool']) {
      assert.equal(convertir(null, t), null, t);
      assert.equal(convertir(undefined, t), null, t);
    }
    assert.equal(convertir(0, 'Numeric'), 0);
    assert.equal(convertir('', 'Text'), '');
  });

  it('dates en secondes, nombres hors précision gardés en texte, objets en JSON', () => {
    assert.equal(convertir('2026-01-08', 'Date'), Date.UTC(2026, 0, 8) / 1000);
    assert.equal(convertir('2026-01-08T10:00:00Z', 'DateTime'), Date.UTC(2026, 0, 8, 10) / 1000);
    assert.equal(convertir('2026-13-45', 'Date'), '2026-13-45', 'une date illisible reste lisible, pas null');
    assert.equal(convertir('9007199254740993', 'Int'), '9007199254740993');
    assert.equal(convertir({ a: 1 }, 'Text'), '{"a":1}');
  });
});

describe('pg-import — le plan', () => {
  const points = fc(
    [entite(point(3.7, 43.4), { cout: 12.5, jour: '2026-01-08', note: null }), entite(point(3.8, 43.5), { cout: null, jour: '2026-01-15', note: 'x' })],
    { colonnes: [{ nom: 'cout', type_grist: 'Numeric' }, { nom: 'jour', type_grist: 'Date' }, { nom: 'note', type_grist: 'Text' }] },
  );

  it('points : latitude/longitude, pas de geometry_json, null conservé', () => {
    const p = planImportPg({ couche: points, nom: 'Interventions', tables: [] });
    assert.equal(p.ok, true);
    assert.equal(p.geometrie, 'Point');
    assert.deepEqual(p.colonnes.map((c) => c.id), ['cout', 'jour', 'note', 'latitude', 'longitude']);
    assert.deepEqual(p.geometryColumn, { lat: 'latitude', lng: 'longitude' });
    assert.deepEqual(p.valeurs.cout, [12.5, null]);
    assert.deepEqual(p.valeurs.latitude, [43.4, 43.5]);
    assert.equal(p.tableId, 'Interventions');
  });

  it('surfaces : geometry_json (texte) + centroid_lat/centroid_lon', () => {
    const c = fc([entite(surface(3, 43), { nom: 'A' })], { colonnes: [{ nom: 'nom', type_grist: 'Text' }] });
    const p = planImportPg({ couche: c, nom: 'Communes', tables: [] });
    assert.deepEqual(p.colonnes.map((x) => x.id), ['nom', 'geometry_json', 'centroid_lat', 'centroid_lon']);
    assert.equal(p.geometryColumn, 'geometry_json');
    assert.equal(JSON.parse(p.valeurs.geometry_json[0]).type, 'Polygon');
    assert.deepEqual([p.valeurs.centroid_lon[0], p.valeurs.centroid_lat[0]], [4, 45]);
  });

  it('un attribut nommé comme une colonne de l’import ne l’écrase pas', () => {
    const c = fc([entite(point(1, 2), { latitude: 99, id: 7 })], { colonnes: [{ nom: 'latitude', type_grist: 'Numeric' }, { nom: 'id', type_grist: 'Int' }] });
    const p = planImportPg({ couche: c, nom: 'T', tables: [] });
    assert.deepEqual(p.colonnes.map((x) => x.id), ['latitude_2', 'pg_id', 'latitude', 'longitude']);
    assert.deepEqual(p.valeurs.latitude, [2]);
    assert.deepEqual(p.valeurs.latitude_2, [99]);
  });

  it('une colonne entièrement nulle garde le type de la passerelle', () => {
    const c = fc([entite(point(1, 2), { cout: null })], { colonnes: [{ nom: 'cout', type_grist: 'Numeric' }] });
    const p = planImportPg({ couche: c, nom: 'T', tables: [] });
    assert.equal(p.colonnes[0].type, 'Numeric');
    assert.deepEqual(p.valeurs.cout, [null]);
  });

  it('lots de 100 avec géométrie, sur toutes les lignes', () => {
    const grosse = fc(Array.from({ length: 250 }, (_, i) => entite(point(i / 100, 43), { n: i })));
    const p = planImportPg({ couche: grosse, nom: 'Gros', tables: [] });
    assert.equal(TAILLE_LOT_GEOMETRIE, 100);
    assert.deepEqual(p.lots, [[0, 100], [100, 200], [200, 250]]);
    const dernier = colonnesDuLot(p, p.lots[2]);
    assert.equal(dernier.n.length, 50);
    assert.equal(dernier.latitude.length, 50);
  });

  it('refuse, en le disant : vide, tronqué, types mêlés, sans géométrie, sans nom', () => {
    assert.match(planImportPg({ couche: fc([]), nom: 'T' }).erreur, /Aucune entité/);
    assert.match(planImportPg({ couche: fc([entite(point(1, 2), {})], { tronque: true, limite: 10000 }), nom: 'T' }).erreur, /tronqué à 10000.*Zoomez/);
    assert.match(planImportPg({ couche: fc([entite(point(1, 2), {}), entite(surface(0, 0), {})]), nom: 'T' }).erreur, /mêlés.*1 Point, 1 Polygon/);
    assert.match(planImportPg({ couche: fc([entite(null, {})]), nom: 'T' }).erreur, /géométrie/);
    assert.match(planImportPg({ couche: fc([entite(point(1, 2), {})]), nom: '   ' }).erreur, /nom/i);
  });

  it('le nom de table ne prend ni une table d’Atlas ni une table existante', () => {
    const c = fc([entite(point(1, 2), {})]);
    assert.equal(planImportPg({ couche: c, nom: 'SceneManifest', tables: [] }).tableId, 'Couche_SceneManifest');
    assert.equal(planImportPg({ couche: c, nom: 'Maquette Layers', tables: [] }).tableId, 'Couche_Maquette_Layers');
    assert.equal(planImportPg({ couche: c, nom: 'Arbres', tables: ['arbres'] }).tableId, 'Arbres_2');
  });

  it('répète les avertissements de la passerelle (sans SRID…)', () => {
    const c = fc([entite(point(1, 2), {})], { avertissements: ['1 géométrie(s) sans SRID'] });
    assert.deepEqual(planImportPg({ couche: c, nom: 'T' }).avertissements, ['1 géométrie(s) sans SRID']);
  });

  it('le message d’import partiel dit la table, le compte, le lot et la cause', () => {
    assert.equal(
      messageImportPartiel({ table: 'Pg', importees: 100, total: 250, lot: 2, cause: 'timeout' }),
      'Table « Pg » créée, 100 ligne(s) sur 250 importée(s), échec au lot 2 : timeout',
    );
  });
});

describe('vue-import-pg — le rendu', () => {
  const schema = {
    schemas: [
      { nom: 'bati', tables: [{ nom: 'batiment', lignes_estimees: 27000, commentaire: 'Bâtiments <BD TOPO>', geometries: [{ colonne: 'geom' }] }] },
      { nom: 'interne', tables: [{ nom: 'note', geometries: [] }] },
    ],
  };

  it('les tables géographiques d’abord, filtrables', () => {
    assert.deepEqual(listerTables(schema).map((t) => t.table), ['batiment', 'note']);
    assert.deepEqual(listerTables(schema, 'NOT').map((t) => t.table), ['note']);
  });

  it('masque les tables que PostGIS publie lui-même, sauf si elles portent une géométrie', () => {
    const avecSysteme = { schemas: [{ nom: 'public', tables: [
      { nom: 'spatial_ref_sys', geometries: [] }, { nom: 'geometry_columns', geometries: [] }, { nom: 'geography_columns', geometries: [] },
      { nom: 'spatial_ref_sys', geometries: [{ colonne: 'g' }] }, { nom: 'mes_points', geometries: [{ colonne: 'g' }] },
    ] }] };
    assert.deepEqual(listerTables(avecSysteme).map((t) => t.table), ['mes_points', 'spatial_ref_sys']);
  });

  it('échappe ce qui vient de la base, désactive une table sans géométrie', () => {
    const h = htmlTables(listerTables(schema), null);
    assert.doesNotMatch(h, /<BD TOPO>/);
    assert.match(h, /&lt;BD TOPO&gt;/);
    assert.match(h, /data-table="interne\.note"[^>]*disabled/);
  });

  it('l’aperçu : bouton d’import désactivé quand le plan est refusé ou le document en lecture seule', () => {
    const base = { table: { schema: 'bati', table: 'batiment' }, phase: 'pret', couche: { nb_entites: 3, avertissements: ['3 sans SRID'] }, nom: 'B' };
    const ok = htmlApercu({ ...base, plan: { ok: true } });
    assert.doesNotMatch(ok, /data-act="importer" disabled/);
    assert.match(ok, /3 sans SRID/);
    assert.match(htmlApercu({ ...base, plan: { ok: false, erreur: 'Zoomez' } }), /Zoomez[\s\S]*data-act="importer" disabled/);
    const ro = htmlApercu({ ...base, plan: { ok: true }, lectureSeule: true });
    assert.match(ro, /lecture seule/);
    assert.match(ro, /data-act="importer" disabled/);
  });

  it('hors d’un document Grist : aperçu seulement, import désactivé, et on le dit', () => {
    const h = htmlApercu({ table: { schema: 'a', table: 'b' }, phase: 'pret', couche: { nb_entites: 2, avertissements: [] }, plan: { ok: true }, nom: 'B', sansDocument: true });
    assert.match(h, /pas ouvert dans un document Grist/);
    assert.match(h, /data-act="importer" disabled/);
  });

  it('aucun gabarit non interpolé dans le HTML rendu, et la troncature n’est dite qu’une fois', () => {
    const base = { table: { schema: 'a', table: 'b' }, phase: 'pret', nom: 'B', lectureSeule: true, sansDocument: true };
    const tronque = htmlApercu({ ...base, couche: { nb_entites: 1000, tronque: true, avertissements: ['Résultat tronqué à 1000 entités : réduisez l’emprise.'] }, plan: { ok: false, erreur: 'Le résultat est tronqué à 1000 entités : Zoomez.' } });
    assert.doesNotMatch(tronque, /\$\{/);
    assert.equal((tronque.match(/tronqué/g) || []).length, 1);
    assert.doesNotMatch(htmlApercu({ ...base, couche: { nb_entites: 1, avertissements: [] }, plan: { ok: true } }), /\$\{/);
  });

  it('une erreur est montrée telle quelle, échappée', () => {
    const h = htmlApercu({ table: { schema: 'a', table: 'b' }, phase: 'erreur', erreur: '<script>x</script> (côté la base)' });
    assert.doesNotMatch(h, /<script>/);
    assert.match(h, /côté la base/);
  });
});

describe('le jeton n’est écrit nulle part', () => {
  const lire = (f) => readFileSync(fileURLToPath(new URL(`../lib/${f}`, import.meta.url)), 'utf8');
  const sources = ['pg-acces.js', 'pg-passerelle.js', 'pg-import.js', 'pg-direct.js', 'pg-liaisons.js', 'pg-edition.js', 'vue-edition-pg.js', 'vue-import-pg.js'].map((f) => [f, lire(f)]);

  it('ni stockage du navigateur (hors l’adresse), ni document Grist, ni adresse', () => {
    for (const [f, s] of sources) {
      assert.doesNotMatch(s, /sessionStorage|indexedDB|document\.cookie/, f);
      assert.doesNotMatch(s, /applyUserActions|setOption/, f);
      // `docApi` n'est qu'un accès en lecture aux copies (lireCopies) : seule la vue le reçoit de l'application, aucun autre module.
      if (f !== 'vue-import-pg.js') assert.doesNotMatch(s, /docApi/, f);
      assert.doesNotMatch(s, /[?&]jeton=|[?&]token=/i, f);
    }
    const vue = lire('vue-import-pg.js');
    assert.equal((vue.match(/localStorage\.setItem\(([^,]+),/g) || []).length, 1);
    assert.match(vue, /localStorage\.setItem\(CLE_URL, u\)/);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  garderDemAuRechargement, tuileSansQuatreEnfants, optionsSourceGeojson, SOURCE_GEOJSON_MAXZOOM,
  evenementMntArrive, cleAltitude,
} from '../lib/terrain-base.js';

/**
 * Source `raster-dem` factice qui reproduit MapLibre 5.6.1 : une tuile qui
 * a déjà un `actor` et qu'on recharge (`state = 'reloading'`) retélécharge son
 * image mais ne repasse jamais à `loaded` — la condition
 * `!tile.actor || tile.state === 'expired'` l'écarte.
 */
function sourceMapLibre561() {
  const appels = [];
  return {
    appels,
    async loadTile(tile) {
      appels.push(tile.id);
      if (!tile.actor || tile.state === 'expired') {
        tile.actor = {};
        tile.dem = { nouvelle: true };
        tile.state = 'loaded';
      }
    },
  };
}

describe('terrain — tuiles MNT rechargées (MapLibre 5.6.1)', () => {
  it('sans correction, une tuile rechargée reste « reloading » (le défaut)', async () => {
    const src = sourceMapLibre561();
    const tuile = { id: 't', actor: {}, dem: { ancienne: true }, state: 'reloading' };
    await src.loadTile(tuile);
    assert.equal(tuile.state, 'reloading');
  });

  it('une tuile rechargée qui a déjà son MNT repasse à « loaded » sans nouvelle requête', async () => {
    const src = sourceMapLibre561();
    garderDemAuRechargement(src);
    const dem = { ancienne: true };
    const tuile = { id: 't', actor: {}, dem, state: 'reloading' };
    await src.loadTile(tuile);
    assert.equal(tuile.state, 'loaded');
    assert.equal(tuile.dem, dem);
    assert.equal(tuile.needsTerrainPrepare, true);
    assert.deepEqual(src.appels, []);
  });

  it('une tuile neuve ou expirée passe par le chargement normal', async () => {
    const src = sourceMapLibre561();
    garderDemAuRechargement(src);
    const neuve = { id: 'n', state: 'loading' };
    const expiree = { id: 'e', actor: {}, dem: {}, state: 'expired' };
    await src.loadTile(neuve);
    await src.loadTile(expiree);
    assert.deepEqual(src.appels, ['n', 'e']);
    assert.equal(neuve.state, 'loaded');
    assert.equal(expiree.state, 'loaded');
  });

  it('une tuile « reloading » sans MNT (jamais décodée) se charge normalement', async () => {
    const src = sourceMapLibre561();
    garderDemAuRechargement(src);
    const tuile = { id: 'r', state: 'reloading' };
    await src.loadTile(tuile);
    assert.deepEqual(src.appels, ['r']);
    assert.equal(tuile.state, 'loaded');
  });

  it('poser la correction deux fois ne l’empile pas', async () => {
    const src = sourceMapLibre561();
    const f1 = garderDemAuRechargement(src).loadTile;
    const f2 = garderDemAuRechargement(src).loadTile;
    assert.equal(f1, f2);
  });

  it('une source absente ne lève pas', () => {
    assert.equal(garderDemAuRechargement(null), null);
    assert.equal(garderDemAuRechargement(undefined), null);
  });
});

describe('terrain — pyramide des sources GeoJSON (MapLibre 5.6.1)', () => {
  it('le défaut : tuile idéale au maxzoom et couverture un cran dessous', () => {
    // Démo des Aygalades, étape 6 : maxzoom 18 (défaut MapLibre), couverture
    // 17, tuiles proches de la caméra en 18 → `children[1].key` lève.
    assert.equal(tuileSansQuatreEnfants(17, 18, 18), true);
  });

  it('avec le maxzoom d’Atlas, aucune combinaison ne lève sous z20', () => {
    for (let couverture = 0; couverture <= 20; couverture++) {
      // Sur relief et en vue inclinée, les tuiles proches montent d'un cran.
      for (let tuile = couverture; tuile <= couverture + 1; tuile++) {
        assert.equal(tuileSansQuatreEnfants(couverture, tuile, SOURCE_GEOJSON_MAXZOOM), false, `${couverture}/${tuile}`);
      }
    }
  });

  it('les options de source portent ce maxzoom', () => {
    const data = { type: 'FeatureCollection', features: [] };
    assert.deepEqual(optionsSourceGeojson(data), { type: 'geojson', data, maxzoom: SOURCE_GEOJSON_MAXZOOM });
    assert.equal(SOURCE_GEOJSON_MAXZOOM, 22);
  });
});

describe('terrain — recalage des modèles à l’arrivée du MNT', () => {
  it('une tuile MNT arrivée déclenche le recalage (MapLibre ne pose pas sourceDataType)', () => {
    // Ce que MapLibre 5.6.1 émet vraiment à l'arrivée d'une tuile raster-dem
    // (mesuré : `undefined/source/tile`, jamais `content`).
    assert.equal(evenementMntArrive({ sourceId: 'terrain-dem', dataType: 'source', tile: {} }), true);
  });

  it('un changement de données de la source compte aussi', () => {
    assert.equal(evenementMntArrive({ sourceId: 'terrain-dem', dataType: 'source', sourceDataType: 'content' }), true);
  });

  it('les autres sources et les métadonnées ne comptent pas', () => {
    assert.equal(evenementMntArrive({ sourceId: 'ign', dataType: 'source', tile: {} }), false);
    assert.equal(evenementMntArrive({ sourceId: 'terrain-dem', dataType: 'source', sourceDataType: 'metadata' }), false);
    assert.equal(evenementMntArrive(null), false);
  });
});

describe('terrain — clé du cache d’altitude', () => {
  it('deux objets à 5 m l’un de l’autre n’ont pas la même altitude en cache', () => {
    // 1e-4° en longitude ≈ 8 m à Marseille : l'ancienne clé les confondait,
    // et le second objet prenait l'altitude du premier (jusqu'à 1,45 m
    // d'écart mesuré sur le mobilier des Aygalades).
    const a = cleAltitude(5.362655, 43.354877);
    const b = cleAltitude(5.362655 + 0.00006, 43.354877);
    assert.notEqual(a, b);
  });

  it('le même point donne la même clé', () => {
    assert.equal(cleAltitude(5.3605, 43.3525), cleAltitude(5.3605, 43.3525));
  });
});

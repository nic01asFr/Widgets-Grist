/**
 * Regrouper les objets d'une couche : configuration, options de source, couleur du rond.
 *
 * node --test projects/Atlas/tests/grappes.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configGrappes, grappable, grappesActives, optionsGrappes, couleurGrappe, pireDisponible,
  rangsDeLaCouche, zoomFormes, FILTRE_GRAPPE, FILTRE_ISOLE, GRAPPES_DEFAUT,
} from '../lib/grappes.js';

const symEtats = () => ({
  color: {
    mode: 'categorized', field: 'Etat', value: '#999',
    categories: [
      { value: 'A_Bon', color: '#90EE90' }, { value: 'B_Moyen', color: '#FFFF00' },
      { value: 'C_Mauvais', color: '#ffa500' }, { value: 'D_Critique', color: '#FF0000' },
    ],
    reference: { rangs: { A_Bon: 0, B_Moyen: 1, C_Mauvais: 2, D_Critique: 3 } },
  },
});

test('une couche sans réglage ne se regroupe pas', () => {
  assert.deepEqual(configGrappes(undefined), { ...GRAPPES_DEFAUT });
  assert.equal(grappesActives({ geometryType: 'Point', style: {} }), false);
});

test('la configuration est complétée et bornée', () => {
  const c = configGrappes({ cluster: { enabled: true, rayon: 9999, zoomMax: -5, couleur: 'nimporte' } });
  assert.deepEqual(c, { enabled: true, rayon: 150, zoomMax: 3, couleur: 'couche' });
  assert.equal(configGrappes({ cluster: { enabled: true, rayon: 'abc' } }).rayon, 50);
});

test('grappable : points natifs, lignes et surfaces oui ; modèles 3D, fonds de tuiles et couches distantes non', () => {
  assert.equal(grappable({ geometryType: 'Point', style: { mode: 'mapbox' } }), true);
  assert.equal(grappable({ geometryType: 'Point', style: { mode: 'library' } }), false);
  assert.equal(grappable({ geometryType: 'MultiPoint', style: { mode: 'custom' } }), false);
  assert.equal(grappable({ geometryType: 'LineString' }), true);
  assert.equal(grappable({ geometryType: 'MultiPolygon' }), true);
  assert.equal(grappable({ geometryType: 'Point', _distant: true }), false);
  assert.equal(grappable({ geometryType: 'Polygon', _raster: true }), false);
  assert.equal(grappable({ geometryType: 'GeometryCollection' }), false);
  assert.equal(grappable(null), false);
});

test('grappesActives : il faut la demande ET la possibilité', () => {
  const l = { geometryType: 'Point', style: { mode: 'mapbox', symbolization: { cluster: { enabled: true } } } };
  assert.equal(grappesActives(l), true);
  l.style.mode = 'library';
  assert.equal(grappesActives(l), false);
});

test('options de source : rayon et zoom maximal', () => {
  const o = optionsGrappes(configGrappes({ cluster: { enabled: true, rayon: 60, zoomMax: 13 } }), {});
  assert.equal(o.cluster, true);
  assert.equal(o.clusterRadius, 60);
  assert.equal(o.clusterMaxZoom, 13);
  assert.equal(o.clusterProperties, undefined);
});

test('« le plus grave » : une propriété agrégée par le maximum du rang', () => {
  const sym = symEtats();
  const o = optionsGrappes(configGrappes({ cluster: { enabled: true, couleur: 'pire' } }), sym);
  assert.equal(o.clusterProperties.pire[0], 'max');
  assert.deepEqual(o.clusterProperties.pire[1].slice(0, 2), ['match', ['to-string', ['get', 'Etat']]]);
});

test('« le plus grave » sans rang de gravité : retombe sur la couleur de la couche, sans agrégat', () => {
  const sym = { color: { mode: 'categorized', field: 'Etat', categories: [] } };
  assert.equal(pireDisponible(sym), false);
  const cfg = configGrappes({ cluster: { enabled: true, couleur: 'pire' } });
  assert.equal(optionsGrappes(cfg, sym).clusterProperties, undefined);
  assert.equal(couleurGrappe(cfg, sym, '#2D2820'), '#2D2820');
});

test('couleur du rond : celle de la couche quand elle est unique, sinon neutre', () => {
  const cfg = configGrappes({ cluster: { enabled: true } });
  assert.equal(couleurGrappe(cfg, { color: { mode: 'single', value: '#C44536' } }), '#C44536');
  assert.equal(couleurGrappe(cfg, symEtats(), '#2D2820'), '#2D2820');
});

test('couleur du rond « le plus grave » : une expression qui suit le rang', () => {
  const cfg = configGrappes({ cluster: { enabled: true, couleur: 'pire' } });
  const e = couleurGrappe(cfg, symEtats(), '#2D2820');
  assert.deepEqual(e, ['match', ['get', 'pire'], 0, '#90EE90', 1, '#FFFF00', 2, '#ffa500', 3, '#FF0000', '#2D2820']);
  assert.equal(pireDisponible(symEtats()), true);
  assert.ok(rangsDeLaCouche(symEtats()));
});

test('un rang partagé par deux catégories garde la première couleur : MapLibre refuse un doublon', () => {
  const sym = symEtats();
  sym.color.reference.rangs.N_A = 0;
  sym.color.categories.push({ value: 'N_A', color: '#999999' });
  const e = couleurGrappe(configGrappes({ cluster: { enabled: true, couleur: 'pire' } }), sym);
  const rangs = e.filter((x, i) => i >= 2 && i % 2 === 0 && typeof x === 'number');
  assert.equal(new Set(rangs).size, rangs.length);
});

test('les filtres isolent les regroupements des objets', () => {
  assert.deepEqual(FILTRE_GRAPPE, ['has', 'point_count']);
  assert.deepEqual(FILTRE_ISOLE, ['!', ['has', 'point_count']]);
});

test('lignes et surfaces : la forme remplace les centres un cran au-dessus du zoom de regroupement', () => {
  assert.equal(zoomFormes(configGrappes({ cluster: { enabled: true, zoomMax: 12 } })), 13);
});

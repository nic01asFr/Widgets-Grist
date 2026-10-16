/**
 * Les données passées à `setScene` sont vérifiées avant le montage (lib/bi/diagnostic-donnees.js) : une erreur de forme se dit en clair.
 * node --test projects/Atlas/tests/bi-diagnostic-donnees.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnostiquerCouche } from '../lib/bi/diagnostic-donnees.js';
import { attacher } from '../lib/bi/bi-runtime.js';
import { carteSimulee, MANIFESTE, DONNEES } from './aide-carte-bi.js';

const pt = (id, x, y) => ({ type: 'Feature', id, properties: { nom: 'p' + id }, geometry: { type: 'Point', coordinates: [x, y] } });

test('diagnostic : des données conformes ne donnent ni erreur ni avertissement', () => {
  assert.deepEqual(diagnostiquerCouche({ id: 'a' }, [pt(1, 5, 43), pt(2, 5.1, 43.1)]), { erreur: null, avertissements: [] });
  assert.deepEqual(diagnostiquerCouche({ id: 'a' }, undefined), { erreur: null, avertissements: [] }, 'aucune donnée : couche vide, comme avant');
  assert.deepEqual(diagnostiquerCouche({ id: 'a' }, []), { erreur: null, avertissements: [] });
});

test('diagnostic : une FeatureCollection à la place du tableau est refusée avec le geste de correction', () => {
  const r = diagnostiquerCouche({ id: 'sites' }, { type: 'FeatureCollection', features: [pt(1, 5, 43)] });
  assert.match(r.erreur, /donnees\["sites"\] doit être un TABLEAU de Features/);
  assert.match(r.erreur, /collection\.features/);
});

test('diagnostic : une valeur qui n\'est pas un tableau ni une collection est refusée', () => {
  assert.match(diagnostiquerCouche({ id: 'a' }, 'oups').erreur, /reçu : string/);
  assert.match(diagnostiquerCouche({ id: 'a' }, { x: 1 }).erreur, /reçu : object/);
});

test('diagnostic : un élément qui n\'est pas une Feature refuse la couche', () => {
  assert.match(diagnostiquerCouche({ id: 'a' }, [pt(1, 5, 43), 'x', null]).erreur, /2 élément\(s\) qui ne sont pas des Features/);
});

test('diagnostic : coordonnées hors plage, géométrie absente et identifiants en double sont signalés, sans refuser la couche', () => {
  const r = diagnostiquerCouche({ id: 'a' }, [pt(1, 5, 43), pt(2, 43, 200), pt(3, -250, 10), { type: 'Feature', id: 4, properties: {}, geometry: null }, pt(1, 5.2, 43.1)]);
  assert.equal(r.erreur, null);
  assert.equal(r.avertissements.length, 3);
  assert.match(r.avertissements.join(' | '), /1 entité\(s\) sans géométrie lisible/);
  assert.match(r.avertissements.join(' | '), /2 entité\(s\) avec des coordonnées hors plage.*entité 2 : \[43, 200\] ; entité 3 : \[-250, 10\]/);
  assert.match(r.avertissements.join(' | '), /1 identifiant\(s\) en double/);
});

test('diagnostic : une entité sans id n\'est PAS un avertissement (le contrat les numérote)', () => {
  const sansId = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [5, 43] } };
  assert.deepEqual(diagnostiquerCouche({ id: 'a' }, [sansId, { ...sansId }]), { erreur: null, avertissements: [] });
});

test('diagnostic : les polygones et lignes sont lus sur toutes leurs positions', () => {
  const poly = { type: 'Feature', id: 1, properties: {}, geometry: { type: 'Polygon', coordinates: [[[5, 43], [5.1, 43], [5.1, 95], [5, 43]]] } };
  const r = diagnostiquerCouche({ id: 'z' }, [poly]);
  assert.match(r.avertissements[0], /1 entité\(s\) avec des coordonnées hors plage/);
});

test('setScene : une FeatureCollection refuse la couche seule, lisiblement ; les autres couches se montent', async () => {
  const rt = attacher(carteSimulee());
  const manifeste = { layers: [...MANIFESTE.layers, { id: 'autre', name: 'Autre', geometry_type: 'Point' }] };
  const r = await rt.api.setScene(manifeste, { ...DONNEES, autre: { type: 'FeatureCollection', features: [pt(1, 5, 43)] } });
  assert.equal(r.sites, 3);
  assert.match(r._erreurs.autre, /TABLEAU de Features/);
  assert.deepEqual(rt.api.ping().couches, ['sites']);
});

test('setScene : les avertissements arrivent dans le résultat (_avertissements) et dans l\'événement ready', async () => {
  const rt = attacher(carteSimulee());
  const evenements = [];
  rt.surEvenement && rt.surEvenement((e) => evenements.push(e));
  const r = await rt.api.setScene({ layers: [{ id: 'p', name: 'P', geometry_type: 'Point' }] }, { p: [pt(1, 5, 43), pt(2, 5, 999)] });
  assert.equal(r.p, 2, 'la couche se monte quand même');
  assert.match(r._avertissements.p[0], /coordonnées hors plage/);
  assert.equal(r._erreurs, undefined);
});

test('setScene : des données conformes ne portent ni _avertissements ni _erreurs (résultat inchangé)', async () => {
  const rt = attacher(carteSimulee());
  const r = await rt.api.setScene(MANIFESTE, DONNEES);
  assert.equal(r._avertissements, undefined);
  assert.equal(r._erreurs, undefined);
});

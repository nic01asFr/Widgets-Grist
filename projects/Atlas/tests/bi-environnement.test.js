// L'environnement de la carte nue (`manifest.environnement`) : déclaration lue et bornée, lumière du soleil, pose sur la carte, retour en arrière à la scène suivante.
// node --test tests/bi-environnement.test.js   (aucun accès réseau, aucune dépendance)
import test from 'node:test';
import assert from 'node:assert/strict';
import { environnementDeclare, lumiereSolaire, appliquerEnvironnement, reinitialiserEnvironnement, ID_SOURCE_RELIEF, ID_BATI, EXAGERATION_DEFAUT } from '../lib/bi/environnement.js?v=20261025a';
import { attacher } from '../lib/bi/bi-runtime.js';
import { carteSimulee } from './aide-carte-bi.js';

/** La carte simulée, avec ce que l'environnement touche : relief, ciel, lumière, sources du fond. */
function carte({ fondEnVolume = false, sansBati = false } = {}) {
  const m = carteSimulee(); const appels = [];
  if (!sansBati) m.sources.set('openmaptiles', { type: 'vector' });
  if (fondEnVolume) m.calques.push({ id: 'building-3d', type: 'fill-extrusion', source: 'openmaptiles' });
  m.setTerrain = (t) => appels.push(['terrain', t]); m.setSky = (s) => appels.push(['ciel', s]); m.setLight = (l) => appels.push(['lumiere', l]);
  m.getCenter = () => ({ lng: 5.37, lat: 43.3 });
  const addSource = m.addSource; m.addSource = (id, s) => { appels.push(['source+', id]); return addSource(id, s); };
  const removeSource = m.removeSource; m.removeSource = (id) => { appels.push(['source-', id]); return removeSource(id); };
  m.appels = appels;
  return m;
}
const MARSEILLE_ETE = Date.parse('2026-06-21T13:35:00+02:00'), NUIT = Date.parse('2026-06-21T01:00:00+02:00');

test('environnementDeclare : rien, formes valides, bornes, clés inconnues et valeurs invalides ignorées et dites', () => {
  assert.deepEqual(environnementDeclare(undefined), { relief: null, bati3d: false, ciel: false, soleil: null, ignores: [] });
  assert.deepEqual(environnementDeclare({ relief: true, bati3d: true, ciel: true, soleil: { instant: '2026-06-21T17:30:00+02:00' } }),
    { relief: { exageration: EXAGERATION_DEFAUT }, bati3d: true, ciel: true, soleil: { instantMs: Date.parse('2026-06-21T17:30:00+02:00'), maintenant: false }, ignores: [] });
  assert.equal(environnementDeclare({ soleil: { maintenant: true } }).soleil.maintenant, true);
  assert.equal(environnementDeclare({ relief: { exageration: 99 } }).relief.exageration, 3);
  assert.equal(environnementDeclare({ relief: { exageration: 0 } }).relief.exageration, 0.5);
  const sale = environnementDeclare({ relief: { source: 'ign', exageration: 'beaucoup' }, ciel: 'oui', bati3d: 1, soleil: { instant: 'demain' }, brume: true });
  assert.deepEqual(sale.ignores.map((i) => i.code).sort(), ['cle-inconnue', 'instant-illisible', 'source-non-offerte', 'type', 'type', 'type']);
  assert.equal(sale.soleil, null); assert.equal(sale.relief.exageration, EXAGERATION_DEFAUT);
  for (const mauvais of [true, 12, 'x', []]) assert.equal(environnementDeclare(mauvais).ignores[0].code, 'type');
  assert.equal(environnementDeclare({ relief: false, soleil: false }).relief, null);
});

test('lumiereSolaire : plein été à Marseille, midi : soleil haut, au sud, lumière franche ; la nuit : bas, froide et faible', () => {
  const jour = lumiereSolaire(43.3, 5.37, MARSEILLE_ETE);
  assert.ok(jour.hauteur > 65 && jour.hauteur < 72, 'hauteur ' + jour.hauteur);
  assert.ok(jour.azimut > 150 && jour.azimut < 210, 'azimut ' + jour.azimut);
  assert.equal(jour.intensite, 0.55); assert.equal(jour.couleur, '#fff7e8'); assert.deepEqual(jour.position.slice(0, 1), [1.2]);
  assert.ok(jour.position[2] >= 5 && jour.position[2] <= 88);
  const nuit = lumiereSolaire(43.3, 5.37, NUIT);
  assert.ok(nuit.hauteur < -6); assert.equal(nuit.intensite, 0.18); assert.equal(nuit.couleur, '#7f8fbf');
  const bas = lumiereSolaire(43.3, 5.37, Date.parse('2026-06-21T07:00:00+02:00'));
  assert.ok(bas.hauteur > 0 && bas.hauteur < 20 && bas.intensite > 0.35 && bas.intensite < 0.55, 'lever : ' + bas.hauteur);
});

test('appliquerEnvironnement : relief, bâti, ciel et soleil posés ; ce qui a été posé est rendu pour le défaire', () => {
  const m = carte(); m.addLayer({ id: 'bi-fill-x', type: 'fill', source: 's' });
  const env = environnementDeclare({ relief: { exageration: 2 }, bati3d: true, ciel: true, soleil: { instant: MARSEILLE_ETE } });
  const r = appliquerEnvironnement(m, env, { theme: { plan: { bati: '#e6e6e6' } } });
  assert.deepEqual(r.etat, { relief: true, bati3d: true, ciel: true, soleil: true }); assert.deepEqual(r.avertissements, []);
  assert.ok(m.sources.has(ID_SOURCE_RELIEF)); assert.equal(m.sources.get(ID_SOURCE_RELIEF).encoding, 'terrarium'); assert.match(m.sources.get(ID_SOURCE_RELIEF).tiles[0], /^https:\/\//);
  assert.deepEqual(m.appels.find((a) => a[0] === 'terrain')[1], { source: ID_SOURCE_RELIEF, exaggeration: 2 });
  const bati = m.getLayer(ID_BATI);
  assert.equal(bati.type, 'fill-extrusion'); assert.equal(bati.source, 'openmaptiles'); assert.equal(bati.paint['fill-extrusion-color'], '#e6e6e6'); assert.equal(bati.paint['fill-extrusion-opacity'], 1);
  assert.ok(m.calques.findIndex((l) => l.id === ID_BATI) < m.calques.findIndex((l) => l.id === 'bi-fill-x'), 'le bâti passe SOUS les couches de l\'hôte');
  const lumiere = m.appels.find((a) => a[0] === 'lumiere')[1];
  assert.equal(lumiere.anchor, 'map'); assert.equal(lumiere.intensity, 0.55);
  assert.ok(m.appels.some((a) => a[0] === 'ciel' && a[1]['sky-color']));
  reinitialiserEnvironnement(m, r.etat);
  assert.equal(m.getLayer(ID_BATI), undefined); assert.equal(m.sources.has(ID_SOURCE_RELIEF), false);
  assert.deepEqual(m.appels.filter((a) => a[0] === 'terrain').pop(), ['terrain', null]); assert.deepEqual(m.appels.filter((a) => a[0] === 'ciel').pop(), ['ciel', null]);
  assert.equal(m.appels.filter((a) => a[0] === 'lumiere').pop()[1].anchor, 'viewport', 'la lumière retrouve celle de MapLibre');
});

test('le bâti en volume n\'est pas ajouté quand le fond en montre déjà, ni quand le fond n\'a pas de bâti : c\'est dit', () => {
  const deja = carte({ fondEnVolume: true }); const r1 = appliquerEnvironnement(deja, environnementDeclare({ bati3d: true }));
  assert.equal(r1.etat.bati3d, false); assert.match(r1.avertissements[0], /déjà le bâti en volume/); assert.equal(deja.getLayer(ID_BATI), undefined);
  const sans = carte({ sansBati: true }); const r2 = appliquerEnvironnement(sans, environnementDeclare({ bati3d: true }));
  assert.equal(r2.etat.bati3d, false); assert.match(r2.avertissements[0], /pas de bâti/);
});

test('une carte qui refuse un réglage ne casse rien : l\'avertissement le dit, les autres réglages passent', () => {
  const m = carte(); m.setTerrain = () => { throw new Error('terrain refusé'); }; delete m.setSky;
  const r = appliquerEnvironnement(m, environnementDeclare({ relief: true, ciel: true, soleil: { maintenant: true } }), { maintenant: () => MARSEILLE_ETE });
  assert.deepEqual(r.etat, { relief: false, bati3d: false, ciel: false, soleil: true });
  assert.ok(r.avertissements.some((a) => /relief : terrain refusé/.test(a))); assert.ok(r.avertissements.some((a) => /pas de ciel/.test(a)));
});

test('setScene : l\'environnement du manifeste est posé, rejoué, défait à la scène suivante, et ne coûte rien à une scène qui n\'en déclare pas', async () => {
  const m = carte(); const rt = attacher(m);
  const donnees = { a: [{ type: 'Feature', id: 1, properties: {}, geometry: { type: 'Point', coordinates: [5.37, 43.3] } }] };
  const scene = (environnement) => ({ layers: [{ id: 'a', name: 'a', geometry_type: 'point' }], ...(environnement === undefined ? {} : { environnement }) });
  await rt.api.setScene(scene(), donnees);
  assert.deepEqual(m.appels.filter((a) => a[0] !== 'source+' || /env/.test(a[1])), [], 'une scène sans environnement ne touche ni au relief, ni au ciel, ni à la lumière');
  const r = await rt.api.setScene(scene({ relief: true, soleil: { instant: MARSEILLE_ETE }, ciel: 'oui' }), donnees);
  assert.ok(m.sources.has(ID_SOURCE_RELIEF)); assert.ok(m.appels.some((a) => a[0] === 'lumiere'));
  assert.match(r._avertissements._environnement[0], /ciel.*booléen|`ciel` doit être/);
  await rt.api.setScene({ ...scene(), fusion: true }, donnees);
  assert.ok(m.sources.has(ID_SOURCE_RELIEF), 'une fusion sans environnement garde celui d\'avant');
  await rt.api.setScene(scene(), donnees);
  assert.equal(m.sources.has(ID_SOURCE_RELIEF), false, 'une scène complète sans environnement défait celui d\'avant');
  assert.deepEqual(m.appels.filter((a) => a[0] === 'terrain').pop(), ['terrain', null]);
});

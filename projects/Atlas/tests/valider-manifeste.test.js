// Validation d'un manifeste de scène avant setScene : les écarts que setScene laisse passer en silence sont dits ; un manifeste correct ne dit rien.
// node --test tests/valider-manifeste.test.js   (aucun accès réseau, aucune dépendance)
import test from 'node:test';
import assert from 'node:assert/strict';
import { validerManifeste, VERSIONS_MANIFESTE, KINDS } from '../lib/bi/valider-manifeste.js';

const feature = (id, nature, extra = {}) => ({ type: 'Feature', id, properties: { nature, hauteur: 12 + id, ...extra }, geometry: { type: 'Point', coordinates: [5.37, 43.3] } });
const donnees = () => ({ bati: [feature(1, 'Industriel'), feature(2, 'Religieux'), feature(3, 'Industriel')] });
const manifeste = (couche = {}) => ({
  layers: [{
    id: 'bati', name: 'Bâti', geometry_type: 'point', cle: 'cleabs',
    style: { declarative: { kind: 'categorized', field: 'nature', stops: [{ value: 'Industriel', color: '#aa3300' }, { value: 'Religieux', color: '#3366aa' }] } },
    controls: [{ id: 'c_nature', type: 'select', field: 'nature', active: true, values: ['Industriel'] }],
    ...couche,
  }],
});
const codes = (r) => r.ecarts.map((e) => e.code);
const chemins = (r) => r.ecarts.map((e) => e.chemin);

test('un manifeste correct : aucun écart', () => {
  const r = validerManifeste(manifeste(), donnees());
  assert.deepEqual(r.ecarts, []); assert.equal(r.ok, true);
  assert.deepEqual(r.ecarts, validerManifeste(manifeste()).ecarts, 'sans données : seuls les écarts de forme sont cherchés, il n\'y en a pas');
});

test('cas dégradé 1 : clé inconnue au niveau de la couche', () => {
  const r = validerManifeste(manifeste({ coleur: '#000' }), donnees());
  assert.equal(r.ok, false); assert.deepEqual(codes(r), ['cle-inconnue']); assert.equal(r.ecarts[0].chemin, 'layers[0].coleur');
  assert.equal(validerManifeste(manifeste({ coleur: '#000' }), donnees(), { cleInconnue: 'avertissement' }).ok, true, 'tolérée sur demande');
});

test('cas dégradé 2 : champ du style absent des propriétés (avec la liste des propriétés)', () => {
  const m = manifeste(); m.layers[0].style.declarative.field = 'nature_batiment';
  const r = validerManifeste(m, donnees());
  const e = r.ecarts.find((x) => x.code === 'champ-absent-des-donnees');
  assert.ok(e); assert.equal(e.niveau, 'erreur'); assert.equal(e.chemin, 'layers[0].style.declarative.field');
  assert.deepEqual(e.proprietes, ['hauteur', 'nature']); assert.match(e.message, /nature_batiment/);
});

test('cas dégradé 3 : graduated avec breaks/colors au lieu de stops', () => {
  const m = manifeste({ style: { declarative: { kind: 'graduated', field: 'hauteur', breaks: [10, 20], colors: ['#fff', '#000'] } } });
  const r = validerManifeste(m, donnees());
  assert.ok(codes(r).includes('cle-non-lue')); assert.ok(codes(r).includes('stops-absents'));
  assert.equal(r.ecarts.filter((e) => e.code === 'cle-non-lue').length, 2);
  assert.match(r.ecarts.find((e) => e.chemin.endsWith('.breaks')).message, /stops/);
});

test('cas dégradé 4 : kind inconnu', () => {
  const r = validerManifeste(manifeste({ style: { declarative: { kind: 'magique', field: 'nature' } } }), donnees());
  assert.deepEqual(codes(r), ['kind-inconnu']); assert.ok(KINDS.every((k) => !r.ecarts[0].message.includes('« ' + k + ' » inconnu')));
});

test('cas dégradé 5 : palier sans couleur', () => {
  const m = manifeste(); delete m.layers[0].style.declarative.stops[1].color;
  const r = validerManifeste(m, donnees());
  assert.deepEqual(codes(r), ['couleur-absente']); assert.equal(r.ecarts[0].chemin, 'layers[0].style.declarative.stops[1].color');
  const m2 = manifeste(); m2.layers[0].style.declarative.stops[0].color = 'rouge';
  assert.deepEqual(codes(validerManifeste(m2, donnees())), ['couleur-illisible']);
  const m3 = manifeste(); m3.layers[0].style.declarative.stops[0].color = 'jeton:etat.ok';
  assert.deepEqual(validerManifeste(m3, donnees()).ecarts, [], 'un jeton de charte est une couleur');
});

test('cas dégradé 6 : version hors liste (0.2.2 est lue, 9.9.9 non ; sans version : admis)', () => {
  assert.deepEqual(VERSIONS_MANIFESTE, ['0.2.1', '0.2.2']);
  assert.deepEqual(validerManifeste({ ...manifeste(), version: '0.2.2' }, donnees()).ecarts, []);
  const r = validerManifeste({ ...manifeste(), version: '9.9.9' }, donnees());
  assert.deepEqual(codes(r), ['version-hors-liste']); assert.equal(r.ecarts[0].chemin, 'manifeste.version');
});

test('contrôles : id absent ou en double, type inconnu, champ absent des propriétés', () => {
  const m = manifeste({ controls: [{ type: 'select', field: 'nature' }, { id: 'a', type: 'slider', field: 'nature' }, { id: 'a', type: 'range', field: 'hauteur' }, { id: 'b', type: 'select', field: 'absent' }] });
  const r = validerManifeste(m, donnees());
  assert.deepEqual(codes(r).sort(), ['champ-absent-des-donnees', 'controle-id-en-double', 'controle-sans-id', 'controle-type-inconnu']);
  assert.ok(chemins(r).includes('layers[0].controls[3].field'));
});

test('id de couche : texte non vide et unique (getLegend et setFilter l\'exigent)', () => {
  const m = { layers: [{ id: 12, name: 'x' }, { name: 'sans id' }, { id: 'a', name: 'a' }, { id: 'a', name: 'bis' }] };
  assert.deepEqual(codes(validerManifeste(m)), ['id-non-texte', 'id-absent', 'id-en-double']);
});

test('identifiants d\'entités : entiers, uniques sur toute la scène', () => {
  const m = { layers: [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }] };
  const d = { a: [feature(1, 'x'), feature('2', 'x'), feature(3, 'x'), feature(3, 'x')], b: [feature(1, 'y'), feature(4, 'y')] };
  const r = validerManifeste(m, d);
  assert.deepEqual(codes(r).sort(), ['id-en-double', 'id-en-double', 'id-non-entier']);
  const grand = validerManifeste({ layers: [{ id: 'a', name: 'a' }] }, { a: [feature(10_000_000_000, 'x'), feature(2_736_000_000_000_000, 'x')] });
  assert.deepEqual(grand.ecarts, [], 'jusqu\'à 2^53 − 1');
  assert.deepEqual(codes(validerManifeste({ layers: [{ id: 'a', name: 'a' }] }, { a: [feature(1.5, 'x')] })), ['id-non-entier']);
});

test('valeur de palier absente des données : avertissement (la classe afficherait 0), qui ne rend pas le manifeste invalide', () => {
  const m = manifeste(); m.layers[0].style.declarative.stops.push({ value: 'Sportif', color: '#00aa00' });
  const r = validerManifeste(m, donnees());
  assert.equal(r.ok, true); assert.deepEqual(codes(r), ['valeur-absente-des-donnees']); assert.equal(r.ecarts[0].niveau, 'avertissement');
  const sansCasse = manifeste(); sansCasse.layers[0].style.declarative.stops[0].value = 'INDUSTRIEL';
  assert.deepEqual(validerManifeste(sansCasse, donnees()).ecarts, [], 'comparaison sans casse, comme la légende');
});

test('graduated correct ; premier seuil fini : avertissement (couleur et légende divergent sur ce seuil)', () => {
  const stops = [{ lower: null, upper: 20, color: '#eee' }, { lower: 20, upper: null, color: '#333' }];
  const bon = manifeste({ style: { declarative: { kind: 'graduated', field: 'hauteur', method: 'manuel', stops } }, controls: [] });
  assert.deepEqual(validerManifeste(bon, donnees()).ecarts, []);
  const fini = manifeste({ style: { declarative: { kind: 'graduated', field: 'hauteur', stops: [{ lower: 5, upper: 20, color: '#eee' }, { lower: 20, upper: 40, color: '#333' }] } }, controls: [] });
  const r = validerManifeste(fini, donnees());
  assert.equal(r.ok, true); assert.deepEqual(codes(r), ['premier-seuil-fini']);
  const inverse = manifeste({ style: { declarative: { kind: 'graduated', field: 'hauteur', stops: [{ lower: 30, upper: 20, color: '#eee' }] } }, controls: [] });
  assert.deepEqual(codes(validerManifeste(inverse, donnees())).sort(), ['bornes-inversees', 'premier-seuil-fini']);
});

test('couches administratives, tables et visuels : niveau et type vérifiés, pas les propriétés (elles viennent du runtime)', () => {
  const m = { layers: [
    { id: 'dep', name: 'Départements', geometry_type: 'polygon', admin: { niveau: 'departement' }, style: { declarative: { kind: 'single', color: '#999' } } },
    { id: 'zz', name: 'zz', admin: { niveau: 'canton' } },
    { id: 't', name: 't', type: 'table', lignes: [] },
    { id: 'v', name: 'v', visuel: { type: 'spirale' } },
  ] };
  const r = validerManifeste(m, { dep: [], t: [] });
  assert.deepEqual(codes(r).sort(), ['niveau-inconnu', 'visuel-inconnu']);
});

test('forme : manifeste non objet, layers absent, donnees[id] en FeatureCollection', () => {
  assert.deepEqual(codes(validerManifeste(null)), ['type']); assert.deepEqual(codes(validerManifeste({})), ['layers-absent']);
  const r = validerManifeste({ layers: [{ id: 'a', name: 'a' }] }, { a: { type: 'FeatureCollection', features: [] } });
  assert.deepEqual(codes(r), ['donnees-forme']); assert.match(r.ecarts[0].message, /collection\.features/);
});

test('la validation ne modifie rien et reste rapide sur 100 000 entités (échantillonnées)', () => {
  const m = manifeste(); const d = { bati: Array.from({ length: 100_000 }, (_, i) => feature(i + 1, i % 2 ? 'Industriel' : 'Religieux')) };
  const avant = JSON.stringify(m); const t0 = Date.now();
  const r = validerManifeste(m, d);
  assert.equal(JSON.stringify(m), avant); assert.equal(r.ok, true); assert.ok(Date.now() - t0 < 2000, 'moins de 2 s');
});

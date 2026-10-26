// atlas-objets 0.2 côté lecteur : critère `taxon`, `rotation_draw: false`, `requires_atlas`. Les vecteurs sont ceux de la fabrique (pix2hdr, SPEC-ATLAS-OBJETS-0.2,
// commit 90122966), repris tels quels dans tests/fixtures/atlas-objets-0.2/.
// node --test tests/atlas-objets-02.test.js   (aucun accès réseau, aucune dépendance)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lireCatalogue, choisirType, matchApplicable, normaliserTaxon, poidsTaxon, taxonDeLObjet, taxonCorrespond, verifierRequisAtlas, resoudreObjet } from '../lib/catalogue-objets.js';
import { rotation as rotationTiree, cleLatLon } from '../lib/graine.js';
import { VERSION_ATLAS } from '../lib/version-atlas.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const lire = (f) => JSON.parse(readFileSync(join(ICI, 'fixtures/atlas-objets-0.2', f), 'utf8'));
const TAXON = lire('atlas-objets-0.2-vecteurs-taxon.json'), REQUIS = lire('atlas-objets-0.2-vecteurs-requires.json'), ORIENT = lire('atlas-objets-0.2-vecteurs-orientation.json');

test('taxon : la normalisation rend exactement les chaînes des vecteurs, et l\'UTF-8 des valeurs est celui annoncé', () => {
  assert.ok(TAXON.cases.length >= 29);
  for (const c of TAXON.cases) {
    if (typeof c.value === 'string') assert.equal(Buffer.from(c.value, 'utf8').toString('hex'), c.utf8_hex, c.label + ' : octets de la valeur');
    assert.equal(normaliserTaxon(c.value), c.normalized, c.label);
  }
  assert.equal(normaliserTaxon(undefined), ''); assert.equal(normaliserTaxon(12), ''); assert.equal(normaliserTaxon(null), '');
});

test('taxon : chaque taxon testé correspond, ou non, comme dans les vecteurs (mots entiers, jamais un faux préfixe)', () => {
  for (const c of TAXON.cases) {
    for (const [taxon, attendu] of Object.entries(c.matches)) assert.equal(taxonCorrespond({ taxon }, { species: c.value }), attendu, `${c.label} / ${taxon}`);
  }
  assert.equal(taxonCorrespond({ taxon: 'Platanus' }, { species: 'Platanusia' }), false);
  assert.equal(taxonCorrespond({ taxon: '' }, { species: 'Platanus' }), false);
  assert.equal(taxonCorrespond({ taxon: 'Platanus' }, {}), false, 'un objet sans taxon n\'est pas un joker');
});

test('taxon : le champ lu est le premier non vide après normalisation parmi taxon_from', () => {
  for (const f of TAXON.fields) assert.equal(taxonDeLObjet(f.fields, f.taxon_from), f.object_taxon, f.label);
});

test('taxon : le poids dans la spécificité, et la spécificité d\'un match (tags + poids)', () => {
  for (const s of TAXON.specificity) assert.equal(poidsTaxon(s.taxon), s.specificity, JSON.stringify(s.taxon));
  for (const m of TAXON.match_specificity) {
    const sp = Object.keys(m.match.tags || {}).length + (m.match.taxon !== undefined ? poidsTaxon(m.match.taxon) : 0);
    assert.equal(sp, m.specificity, m.label);
  }
});

test('choisirType : à priorité égale, le type d\'essence (deux mots) l\'emporte sur celui de genre ; un taxon absent de l\'objet ne capte rien', () => {
  const types = [
    { id: 'platane', matches: [{ mode: 'instance', tags: { natural: 'tree' }, taxon: 'Platanus' }] },
    { id: 'platane_hispanica', matches: [{ mode: 'instance', tags: { natural: 'tree' }, taxon: 'Platanus x hispanica' }] },
  ];
  const c = { source: 'osm', nom: 'arbres' };
  assert.equal(choisirType(types, c, { natural: 'tree', species: "Platanus × hispanica 'Vallis Clausa'" }, 'point').id, 'platane_hispanica');
  assert.equal(choisirType(types, c, { natural: 'tree', species: 'Platanus orientalis' }, 'point').id, 'platane');
  assert.equal(choisirType(types, c, { natural: 'tree', genus: 'Platanus' }, 'point').id, 'platane', 'genus seul (Longchamp)');
  assert.equal(choisirType(types, c, { natural: 'tree', species: 'Quercus ilex' }, 'point'), null);
  assert.equal(choisirType(types, c, { natural: 'tree' }, 'point'), null, 'sans taxon : le critère est faux, pas un joker');
});

test('exemple de la fabrique : le catalogue du platane choisit le type pour les graphies relevées', () => {
  const cat = lireCatalogue(lire('exemple-catalog-platane-0.2.json'), 'https://x.test/objets/catalog.json', VERSION_ATLAS);
  assert.ok(!cat.refuse, String(cat.refuse)); assert.ok(cat.types.length >= 1);
  const c = { source: 'osm', nom: 'arbres' };
  for (const v of ['Platanus x hispanica', 'Platanus × hispanica \'Vallis Clausa\'', 'Platanus ×acerifolia', 'Platanus hispanica']) {
    const t = choisirType(cat.types, c, { natural: 'tree', species: v }, 'point');
    assert.ok(t && /platan/i.test(t.id), v + ' -> ' + (t && t.id));
  }
});

test('requires_atlas : les vecteurs de la fabrique', () => {
  for (const c of REQUIS.cas) {
    const r = verifierRequisAtlas(c.requires_atlas, c.atlas);
    assert.equal(r.decision, c.decision, JSON.stringify(c));
    assert.equal(r.message === null, c.decision === 'accepte', 'un message dit tout refus et tout avertissement');
  }
  assert.equal(verifierRequisAtlas('1.34.0', null).decision, 'accepte', 'version d\'Atlas inconnue : rien n\'est refusé');
  assert.equal(verifierRequisAtlas(134, '1.33.0').decision, 'accepte_avertissement');
});

test('lireCatalogue : un catalogue trop récent est refusé, avec message, sans types ; sinon utilisé (avertissement si illisible)', () => {
  const bloc = (extra) => ({ parametric: { schema: 'atlas-objets/0.2', catalog_id: 'c', types: [{ id: 't' }], assets: [], ...extra } });
  const refuse = lireCatalogue(bloc({ requires_atlas: '9.0.0' }), 'https://x.test/c.json', '1.34.0');
  assert.match(refuse.refuse, /9\.0\.0/); assert.equal(refuse.types.length, 0);
  assert.equal(lireCatalogue(bloc({ requires_atlas: '1.34.0' }), 'https://x.test/c.json', '1.34.0').types.length, 1);
  assert.equal(lireCatalogue(bloc({}), 'https://x.test/c.json', '1.34.0').types.length, 1);
  const flou = lireCatalogue(bloc({ requires_atlas: 'v1' }), 'https://x.test/c.json', '1.34.0');
  assert.equal(flou.types.length, 1); assert.equal(flou.avertissements.length, 1);
  assert.equal(lireCatalogue(bloc({ requires_atlas: '9.0.0' }), 'https://x.test/c.json').types.length, 1, 'sans version d\'Atlas : lecture comme avant');
});

test('rotation_draw : les vecteurs d\'orientation (le tirage de la graine est celui de la fabrique, et rotation_draw:false le supprime)', () => {
  const cle = 'll:43304350,5394600';
  assert.equal(cleLatLon(43.30435, 5.3946), cle, 'la clé de graine des vecteurs');
  const feature = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [5.3946, 43.30435] } };
  for (const c of ORIENT.cas) {
    const tirage = rotationTiree(cle) * 180 / Math.PI;
    if (c.tirage_rot_deg !== undefined) assert.ok(Math.abs(tirage - c.tirage_rot_deg) < 1e-6, c.label + ' : tirage ' + tirage);
    const type = { id: 'panneau', ...(c.rotation_draw === false ? { rotation_draw: false } : {}), matches: [{ mode: 'instance', tags: { t: 'p' } }] };
    const cat = { types: [type], assets: [], base: '' };
    // l'application passe en `rotationCoucheDeg` la rotation de la couche PLUS le `_rotationZ` de la feature (resolveFeatureProps)
    const r = resoudreObjet(cat, { source: 'any', nom: 'x' }, { ...feature, properties: { t: 'p' } }, { rotationCoucheDeg: (c.couche_rotationZ_deg || 0) + (c.feature_rotationZ_deg || 0) });
    assert.ok(r, c.label);
    assert.ok(Math.abs(r.rotationDeg - c.rotation_finale_deg) < 1e-6, `${c.label} : ${r.rotationDeg} attendu ${c.rotation_finale_deg}`);
  }
});

test('la version d\'Atlas connue de la page est celle du paquet publié', () => {
  const pkg = JSON.parse(readFileSync(join(ICI, '../../../published/atlas/package.json'), 'utf8'));
  assert.equal(VERSION_ATLAS, pkg.version);
});

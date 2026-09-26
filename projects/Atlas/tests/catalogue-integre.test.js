import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { lireCatalogue, resoudreObjet, choisirCatalogue, CATALOGUE_INTEGRE } from '../lib/catalogue-objets.js';

// Le catalogue livre avec Atlas (`objets/`) : les luminaires EclExt d'abord.
const RACINE = new URL('../objets/', import.meta.url);
const JSON_CAT = JSON.parse(readFileSync(new URL('catalog.json', RACINE), 'utf8'));
const CAT = lireCatalogue(JSON_CAT, 'https://exemple.test/atlas/objets/catalog.json');
const COUCHE = { source: 'grist', nom: 'Points_lumineux' };
const point = (props, lon = 5.3950, lat = 43.3040) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: props,
});

test('le catalogue integre se lit au schema atlas-objets/0.1', () => {
  assert.equal(CAT.schema, 'atlas-objets/0.1');
  assert.equal(JSON_CAT.parametric.catalog_id, 'atlas.objets');
  assert.ok(CAT.types.length >= 5 && CAT.assets.length >= 10);
});

test('chaque fichier declare existe, avec ses octets et son empreinte', () => {
  // Un md5 faux ne se voit pas a l'ecran : le modele charge quand meme. Mais
  // le catalogue sert de preuve de provenance, et une copie partielle ou
  // retouchee doit se remarquer ici plutot que dans un rendu.
  for (const a of JSON_CAT.parametric.assets) {
    for (const f of Object.values(a.files)) {
      const u = new URL(f, RACINE);
      assert.ok(existsSync(u), f);
      const octets = readFileSync(u);
      assert.equal(statSync(u).size, a.bytes, `${f} : octets`);
      assert.equal(createHash('md5').update(octets).digest('hex'), a.md5, `${f} : md5`);
    }
  }
});

test('rien d’interne : tout le catalogue s’affiche en contexte public (§3.8)', () => {
  for (const a of JSON_CAT.parametric.assets) assert.equal(a.licence?.usage, 'public', a.files.colored);
});

test('chaque modele porte sa licence : Licence Ouverte 2.0, sans producteur institutionnel', () => {
  for (const a of JSON_CAT.parametric.assets) {
    assert.equal(a.licence?.spdx, 'etalab-2.0', a.files.colored);
    assert.match(a.licence.notice, /nic01asFr/);
  }
});

test('les fiches EclExt trouvent leur modele', () => {
  const cas = [
    [{ structure: 'LANT', support: 'MAT', hauteurFeu: 6.75 }, 'mat_crosse', 'h6'],
    [{ structure: 'LANT', support: 'MAT', hauteurFeu: 4 }, 'mat_crosse', 'h4'],
    [{ structure: 'VASQ', support: 'POT', hauteurFeu: 10 }, 'mat_crosse', 'h10'],
    [{ support: 'MAT' }, 'mat_crosse', 'h6'],
    [{ structure: 'APP', support: 'MUR' }, 'applique_facade', null],
    [{ structure: 'LANT', support: 'CAT' }, 'axial_suspendu', null],
    [{ structure: 'PROJ', support: 'MUR' }, 'projecteur_facade', null],
    [{ structure: 'EN', support: 'SOL' }, 'encastre_sol', null],
  ];
  for (const [props, type, classe] of cas) {
    const r = resoudreObjet(CAT, COUCHE, point(props), { public: true });
    assert.ok(r, JSON.stringify(props));
    assert.equal(r.type.id, type, JSON.stringify(props));
    assert.ok(r.url && r.url.endsWith('.glb'), 'un fichier, meme en contexte public');
    if (classe) assert.equal(r.asset.keys.height_class, classe, JSON.stringify(props));
    assert.equal(r.echelle, 1, 'un luminaire n’est jamais tire en echelle');
  }
});

test('ce qui n’est pas un luminaire n’y trouve rien', () => {
  assert.equal(resoudreObjet(CAT, COUCHE, point({ natural: 'tree' }), {}), null);
  assert.equal(resoudreObjet(CAT, COUCHE, point({ structure: 'LANT' }), {}), null, 'sans support, pas de devinette');
});

test('choisirCatalogue : l’adresse demandee, puis celle du poste, puis le catalogue integre', () => {
  assert.deepEqual(choisirCatalogue({ parametre: 'https://a/cat/', memorise: 'https://b/' }), { url: 'https://a/cat/', origine: 'parametre' });
  assert.deepEqual(choisirCatalogue({ parametre: null, memorise: 'https://b/' }), { url: 'https://b/', origine: 'poste' });
  assert.deepEqual(choisirCatalogue({}), { url: CATALOGUE_INTEGRE, origine: 'integre' });
  assert.deepEqual(choisirCatalogue({ parametre: '  ', memorise: '' }), { url: CATALOGUE_INTEGRE, origine: 'integre' });
});

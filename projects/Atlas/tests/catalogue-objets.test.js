import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  lireCatalogue, matchApplicable, choisirType, lireLongueurOsm, lireMesure, selonSeuils,
  appliquerMesures, choisirFichier, niveauPourDistance, resoudreObjet, uniformsSaison,
  jourDeLAnnee,
} from '../lib/catalogue-objets.js';

const lire = (f) => JSON.parse(readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8'));
// Vecteurs de saison du generateur (gn_lib/objseason.py, md5 95c48613…) et premier
// catalogue conforme (catalogue_platane_v0, md5 3ebdadb1…) : copies telles quelles.
const SAISON = lire('saison-vecteurs.json');
const CAT = lireCatalogue(lire('catalogue-platane-v0.json'), 'https://exemple.test/vegetation/catalog.json');

const OSM = { source: 'osm', nom: 'Arbres' };
const arbre = (props, lon = 5.39456, lat = 43.30465) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: props,
});

test('saison : les 96 vecteurs du generateur, au bit pres', () => {
  assert.equal(SAISON.cases.length, 96);
  for (const c of SAISON.cases) {
    const u = uniformsSaison(c.leaf_type, SAISON.phenologies[c.phen], c.d);
    const ctx = `${c.phen}/${c.leaf_type}/j${c.d}`;
    assert.ok(Object.is(u.uFoliage, c.uFoliage), `${ctx} uFoliage ${u.uFoliage} ≠ ${c.uFoliage}`);
    assert.ok(Object.is(u.uAutumn, c.uAutumn), `${ctx} uAutumn ${u.uAutumn} ≠ ${c.uAutumn}`);
  }
});

test('saison : un type de feuilles inconnu donne l arbre en feuilles, sans erreur', () => {
  assert.deepEqual(uniformsSaison('epineux', SAISON.phenologies.platane, 20), { uFoliage: 1, uAutumn: 0 });
  assert.deepEqual(uniformsSaison('caduc', null, 20), { uFoliage: 1, uAutumn: 0 });
});

test('jour de l annee : 1er janvier = 1, heure d ete sans decalage', () => {
  assert.equal(jourDeLAnnee(new Date(2026, 0, 1)), 1);
  assert.equal(jourDeLAnnee(new Date(2026, 6, 19)), 200);
  assert.equal(jourDeLAnnee(new Date(2026, 6, 19, 12)), 200.5);
  assert.equal(jourDeLAnnee('pas une date'), null);
});

test('le catalogue : le bloc parametrique est lu, les chemins sont relatifs a son URL', () => {
  assert.equal(CAT.schema, 'atlas-objets/0.1');
  assert.equal(CAT.types.length, 1);
  assert.equal(CAT.assets.length, 24);
  assert.equal(CAT.base, 'https://exemple.test/vegetation/');
});

test('un catalogue sans bloc parametrique, ou d un autre schema, est ignore', () => {
  assert.equal(lireCatalogue({ models: [] }, 'x/catalog.json').types.length, 0);
  assert.equal(lireCatalogue({ parametric: { schema: 'autre/1.0', types: [{ id: 'a' }] } }, '').types.length, 0);
  // Un champ inconnu ne fait pas refuser le catalogue (§11).
  const c = lireCatalogue({ parametric: { schema: 'atlas-objets/0.2', inconnu: 1, types: [{ id: 't', futur: true }], assets: [] } }, '');
  assert.equal(c.types.length, 1);
});

test('correspondance : la source vient de la couche, les tags des champs', () => {
  const m = { source: 'osm', geometry: 'point', mode: 'instance', tags: { natural: 'tree', genus: ['Platanus'] } };
  assert.ok(matchApplicable(m, OSM, { natural: 'tree', genus: 'Platanus' }, 'point'));
  assert.ok(!matchApplicable(m, OSM, { natural: 'tree', genus: 'Tilia' }, 'point'));
  assert.ok(!matchApplicable(m, OSM, { natural: 'tree' }, 'point'), 'tag absent de l objet');
  assert.ok(!matchApplicable(m, { source: 'grist', nom: 'Arbres' }, { natural: 'tree', genus: 'Platanus' }, 'point'));
  assert.ok(!matchApplicable(m, OSM, { natural: 'tree', genus: 'platanus' }, 'point'), 'casse exacte');
  assert.ok(!matchApplicable({ ...m, mode: 'scatter' }, OSM, { natural: 'tree', genus: 'Platanus' }, 'point'));
  const tout = { source: 'any', geometry: 'point', mode: 'instance', tags: { genus: 'Platanus' } };
  assert.ok(matchApplicable(tout, { source: 'grist', nom: 'Inventaire' }, { genus: 'Platanus' }, 'point'));
});

test('departage : priorite, puis specificite, puis ordre du catalogue', () => {
  const t = (id, priority, tags) => ({ id, priority, matches: [{ source: 'any', geometry: 'point', mode: 'instance', tags }] });
  const props = { natural: 'tree', genus: 'Platanus' };
  assert.equal(choisirType([t('generique', 0, { natural: 'tree' }), t('platane', 10, { natural: 'tree', genus: 'Platanus' })], OSM, props, 'point').id, 'platane');
  assert.equal(choisirType([t('a', 0, { natural: 'tree' }), t('b', 0, { natural: 'tree', genus: 'Platanus' })], OSM, props, 'point').id, 'b');
  assert.equal(choisirType([t('premier', 0, { natural: 'tree' }), t('second', 0, { genus: 'Platanus' })], OSM, props, 'point').id, 'premier');
  assert.equal(choisirType([t('a', 0, { natural: 'bush' })], OSM, props, 'point'), null);
});

test('longueurs OSM : ce qui est accepte, et ce qui est refuse', () => {
  assert.deepEqual(lireLongueurOsm('12'), { valeur: 12, metres: false });
  assert.deepEqual(lireLongueurOsm('12.5'), { valeur: 12.5, metres: false });
  assert.deepEqual(lireLongueurOsm('12 m'), { valeur: 12, metres: true });
  assert.deepEqual(lireLongueurOsm('12,5 m'), { valeur: 12.5, metres: true });
  assert.deepEqual(lireLongueurOsm(7), { valeur: 7, metres: false });
  for (const refus of ["40'", '12 ft', '10-12', 'grand', '', null, NaN]) assert.equal(lireLongueurOsm(refus), null, String(refus));
});

test('mesures : premier champ lisible, unite, bornes', () => {
  const h = { from: ['height', 'est_height'], unit: 'm', parse: 'osm_length', clamp: [4, 45] };
  assert.equal(lireMesure(h, { height: '18 m' }), 18);
  assert.equal(lireMesure(h, { height: 'haut', est_height: '9' }), 9, 'illisible : champ suivant');
  assert.equal(lireMesure(h, { height: '80' }), 45);
  assert.equal(lireMesure(h, {}), null);
  assert.equal(lireMesure({ from: ['circ'], unit: 'cm', parse: 'osm_length' }, { circ: '150' }), 1.5);
  assert.equal(lireMesure({ from: ['circ'], unit: 'cm', parse: 'osm_length' }, { circ: '1,5 m' }), 1.5, 'le suffixe impose le metre');
});

test('seuils : borne superieure exclue', () => {
  const s = [[0.6, 'young'], [1.8, 'adult'], [null, 'old']];
  assert.equal(selonSeuils(0.59, s), 'young');
  assert.equal(selonSeuils(0.6, s), 'adult');
  assert.equal(selonSeuils(1.8, s), 'old');
});

test('mesures du platane : hauteur, classe d age par la circonference, defaut sinon', () => {
  const type = CAT.types[0];
  assert.deepEqual(appliquerMesures(type, { height: '22', circumference: '2.1' }).cles, { age_class: 'old' });
  assert.equal(appliquerMesures(type, { height: '22' }).hauteur, 22);
  assert.deepEqual(appliquerMesures(type, {}).cles, { age_class: 'adult' });
});

test('fichier : variante voulue, puis variante 0, puis niveau de detail le plus proche', () => {
  const a = CAT.assets;
  assert.equal(choisirFichier(a, 'platanus_orientalis', { age_class: 'old' }, 2, 1).files.colored, 'platanus_orientalis/old_v2_lod1.glb');
  // Pas de LOD0 dans ce catalogue : on descend au LOD1, meme variante.
  assert.equal(choisirFichier(a, 'platanus_orientalis', { age_class: 'young' }, 3, 0).files.colored, 'platanus_orientalis/young_v3_lod1.glb');
  // Variante absente : variante 0.
  assert.equal(choisirFichier(a, 'platanus_orientalis', { age_class: 'adult' }, 9, 2).files.colored, 'platanus_orientalis/adult_v0_lod2.glb');
  assert.equal(choisirFichier(a, 'platanus_orientalis', { age_class: 'centenaire' }, 0, 1), null);
  assert.equal(choisirFichier(a, 'autre', {}, 0, 1), null);
});

test('niveau de detail selon la distance', () => {
  assert.equal(niveauPourDistance([40, 200], 10), 0);
  assert.equal(niveauPourDistance([40, 200], 40), 1);
  assert.equal(niveauPourDistance([40, 200], 500), 2);
  assert.equal(niveauPourDistance(undefined, 500), 0);
});

test('un platane OSM : fichier, echelle mesuree, rotation tiree', () => {
  const r = resoudreObjet(CAT, OSM, arbre({ natural: 'tree', genus: 'Platanus', height: '20 m', circumference: '1.2' }), { lod: 1 });
  assert.equal(r.type.id, 'platanus_orientalis');
  assert.equal(r.asset.keys.age_class, 'adult');
  assert.ok(r.url.startsWith('https://exemple.test/vegetation/platanus_orientalis/adult_v'));
  assert.equal(r.echelle, 20 / r.asset.height_m, 'la hauteur mesuree remplace le tirage');
  assert.equal(r.cle, 'll:43304650,5394560');
  assert.ok(r.rotationDeg >= 0 && r.rotationDeg < 360);
  assert.equal(r.fallback, 'tree_deciduous');
});

test('composition avec les reglages manuels de la couche (§5)', () => {
  const f = arbre({ natural: 'tree', genus: 'Platanus' });
  const seul = resoudreObjet(CAT, OSM, f, {});
  const regle = resoudreObjet(CAT, OSM, f, { echelleCouche: 2, rotationCoucheDeg: 30 });
  assert.ok(seul.echelle >= 0.9 && seul.echelle < 1.1, 'sans mesure : tirage');
  assert.equal(regle.echelle, 2 * seul.echelle);
  assert.equal(regle.rotationDeg, 30 + seul.rotationDeg);
});

test('luminaire : ni tirage d’echelle, classe de hauteur par la hauteur de feu (decision 6)', () => {
  // Reduction du catalogue d'essai pix2hdr.eclairage.essai (24/09/2026).
  const mat = {
    id: 'mat_crosse', family: 'lighting', seed: 'll', variants: 1, scale_draw: false,
    matches: [{ source: 'any', geometry: 'point', mode: 'instance', tags: { support: ['MAT', 'POT'] } }],
    measure: [{ param: 'height_class', from: ['hauteurFeu', 'height'], unit: 'm', parse: 'osm_length', clamp: [3, 14],
      mode: 'select', key: 'height_class', thresholds: [[4.5, 'h4'], [5.5, 'h5'], [7, 'h6'], [9, 'h8'], [11, 'h10'], [null, 'h12']] }],
    defaults: { height_class: 'h6' },
  };
  const asset = (h) => ({ type: 'mat_crosse', keys: { height_class: h, variant: 0, lod: 0 }, files: { colored: `glb/mat_crosse_${h}_v0_lod0.glb` }, height_m: 6.1 });
  const cat = lireCatalogue({ parametric: { schema: 'atlas-objets/0.1', types: [mat], assets: ['h4', 'h6', 'h8'].map(asset) } },
    'https://exemple.test/eclairage/catalog.json');
  const couche = { source: 'fichier', nom: 'Points lumineux' };
  for (let i = 0; i < 20; i++) {
    const r = resoudreObjet(cat, couche, arbre({ structure: 'LANT', support: 'MAT', hauteurFeu: 6.75 }, 5.44 + i * 1e-4, 43.33), { echelleCouche: 1 });
    assert.equal(r.echelle, 1, 'aucun tirage 0,9–1,1 sur un luminaire');
    assert.equal(r.asset.keys.height_class, 'h6');
  }
  assert.equal(resoudreObjet(cat, couche, arbre({ support: 'MAT', hauteurFeu: 8 }), {}).asset.keys.height_class, 'h8');
  assert.equal(resoudreObjet(cat, couche, arbre({ support: 'MAT' }), {}).asset.keys.height_class, 'h6', 'defaut h6');
  // La famille seule suffit, pour un catalogue qui ne porterait pas `scale_draw`.
  const sansCle = lireCatalogue({ parametric: { schema: 'atlas-objets/0.1', types: [{ ...mat, scale_draw: undefined }], assets: [asset('h6')] } }, '');
  assert.equal(resoudreObjet(sansCle, couche, arbre({ support: 'MAT', hauteurFeu: 6 }), {}).echelle, 1);
  // L'echelle de la couche compose toujours (§5).
  assert.equal(resoudreObjet(cat, couche, arbre({ support: 'MAT' }), { echelleCouche: 2 }).echelle, 2);
});

test('meme arbre, meme tirage ; arbre voisin, autre tirage', () => {
  const p = { natural: 'tree', genus: 'Platanus' };
  const a = resoudreObjet(CAT, OSM, arbre(p), {});
  assert.equal(resoudreObjet(CAT, OSM, arbre(p), {}).url, a.url);
  const vus = new Set();
  for (let i = 0; i < 40; i++) vus.add(resoudreObjet(CAT, OSM, arbre(p, 5.39 + i * 1e-4), {}).asset.keys.variant);
  assert.equal(vus.size, 4, 'les 4 variantes apparaissent');
});

test('le niveau de detail suit la distance, avec les seuils du type', () => {
  const f = arbre({ natural: 'tree', genus: 'Platanus' });
  // 20 m : LOD0 voulu, absent du catalogue → LOD1, le plus proche.
  assert.equal(resoudreObjet(CAT, OSM, f, { distanceM: 20 }).asset.keys.lod, 1);
  assert.equal(resoudreObjet(CAT, OSM, f, { distanceM: 120 }).asset.keys.lod, 1);
  assert.equal(resoudreObjet(CAT, OSM, f, { distanceM: 900 }).asset.keys.lod, 2);
  assert.equal(resoudreObjet(CAT, OSM, f, { distanceM: 900, lod: 1 }).asset.keys.lod, 1, 'niveau impose');
});

test('licence interne refusee en contexte public : repli low-poly', () => {
  const f = arbre({ natural: 'tree', genus: 'Platanus' });
  const r = resoudreObjet(CAT, OSM, f, { public: true });
  assert.equal(r.asset, null);
  assert.equal(r.url, null);
  assert.equal(r.fallback, 'tree_deciduous');
  assert.ok(resoudreObjet(CAT, OSM, f, { public: false }).asset);
});

test('un arbre qui ne correspond a rien garde le comportement d Atlas', () => {
  assert.equal(resoudreObjet(CAT, OSM, arbre({ natural: 'tree', genus: 'Tilia' }), {}), null);
  assert.equal(resoudreObjet(CAT, OSM, { geometry: { type: 'Polygon', coordinates: [] }, properties: {} }, {}), null);
});

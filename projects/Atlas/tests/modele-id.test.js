import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PREFIXE_OBJET, idObjet, estIdObjet, typeDeIdObjet, genreDeModele,
  ficheObjet, fichesObjets, ficheDeId, verifierIdModele,
} from '../lib/modele-id.js';
import { lireCatalogue, resoudreObjet } from '../lib/catalogue-objets.js';

// Le catalogue livre avec Atlas : ce que l'interface propose vraiment.
const CAT = lireCatalogue(
  JSON.parse(readFileSync(new URL('../objets/catalog.json', import.meta.url), 'utf8')),
  'https://exemple.test/objets/catalog.json',
);
const point = (props = {}, lon = 5.4, lat = 43.3) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: props,
});

test('un identifiant d objet se forme et se relit', () => {
  assert.equal(PREFIXE_OBJET, 'objet:');
  assert.equal(idObjet('applique_facade'), 'objet:applique_facade');
  assert.equal(typeDeIdObjet('objet:applique_facade'), 'applique_facade');
  assert.equal(estIdObjet('objet:applique_facade'), true);
});

test('un type mal forme ne donne pas d identifiant', () => {
  assert.equal(idObjet(''), null);
  assert.equal(idObjet(null), null);
  assert.equal(idObjet('a b'), null);
  assert.equal(idObjet('a:b'), null);
  assert.equal(estIdObjet('objet:'), false);
  assert.equal(estIdObjet('objet:a b'), false);
  assert.equal(estIdObjet('streetlamp'), false);
  assert.equal(estIdObjet(42), false);
  assert.equal(typeDeIdObjet('streetlamp'), null);
});

test('les identifiants low-poly d avant restent lisibles tels quels', () => {
  assert.equal(genreDeModele('streetlamp'), 'bibliotheque');
  assert.equal(genreDeModele('wind_turbine'), 'bibliotheque');
  assert.equal(estIdObjet('streetlamp'), false);
});

test('la famille d un identifiant : objet, bibliotheque, ou rien', () => {
  assert.equal(genreDeModele('objet:mat_crosse'), 'objet');
  assert.equal(genreDeModele(''), null);
  assert.equal(genreDeModele(null), null);
  assert.equal(genreDeModele(undefined), null);
  assert.equal(genreDeModele('objet:'), null, 'prefixe sans type');
  assert.equal(genreDeModele('autre:chose'), null, 'prefixe inconnu : jamais pris pour du low-poly');
  assert.equal(genreDeModele(7), null);
});

test('le catalogue livre propose ses cinq types, dans son ordre, avec un identifiant chacun', () => {
  const fiches = fichesObjets(CAT);
  assert.deepEqual(fiches.map((f) => f.id), [
    'objet:mat_crosse', 'objet:applique_facade', 'objet:axial_suspendu',
    'objet:projecteur_facade', 'objet:encastre_sol',
  ]);
  const mat = fiches[0];
  assert.equal(mat.nom, 'Mât avec crosse et lanterne');
  assert.equal(mat.famille, 'lighting');
  assert.equal(mat.repli, 'streetlamp');
  assert.equal(mat.variantes, 1);
  assert.equal(mat.fichiers, 6, 'une classe de hauteur par fichier');
  assert.equal(mat.interne, false, 'fichiers publics');
});

test('chaque identifiant du catalogue livre est celui que le schema ecrit', () => {
  for (const f of fichesObjets(CAT)) {
    assert.equal(estIdObjet(f.id), true);
    assert.equal(typeDeIdObjet(f.id), f.typeId);
    assert.equal(ficheDeId(CAT, f.id).nom, f.nom);
  }
});

test('un catalogue absent ou vide ne propose rien et ne leve pas', () => {
  assert.deepEqual(fichesObjets(null), []);
  assert.deepEqual(fichesObjets({ types: [], assets: [] }), []);
  assert.equal(ficheDeId(null, 'objet:mat_crosse'), null);
  assert.equal(ficheDeId(CAT, 'objet:inconnu'), null);
  assert.equal(ficheDeId(CAT, 'streetlamp'), null, 'un identifiant low-poly n est pas une fiche d objet');
});

test('un fichier reserve a l usage interne se dit', () => {
  const type = { id: 't', name: 'T', family: 'lighting' };
  const f = ficheObjet(type, [
    { type: 't', licence: { usage: 'public' } },
    { type: 't', licence: { usage: 'internal' } },
    { type: 'autre', licence: { usage: 'internal' } },
  ]);
  assert.equal(f.fichiers, 2);
  assert.equal(f.interne, true);
  assert.equal(ficheObjet(type, []).interne, false);
});

test('verifier : la forme et l existence sont deux questions', () => {
  assert.deepEqual(verifierIdModele('objet:mat_crosse', { cat: CAT }), { valide: true, genre: 'objet', connu: true });
  assert.deepEqual(verifierIdModele('objet:fantome', { cat: CAT }), { valide: true, genre: 'objet', connu: false });
  assert.deepEqual(verifierIdModele('objet:mat_crosse'), { valide: true, genre: 'objet', connu: null }, 'catalogue pas encore charge');
  assert.deepEqual(verifierIdModele('streetlamp', { bibliotheque: ['streetlamp', 'bench'] }), { valide: true, genre: 'bibliotheque', connu: true });
  assert.deepEqual(verifierIdModele('nulle_part', { bibliotheque: ['streetlamp'] }), { valide: true, genre: 'bibliotheque', connu: false });
  assert.deepEqual(verifierIdModele('a:b'), { valide: false, genre: null, connu: null });
  assert.deepEqual(verifierIdModele(''), { valide: false, genre: null, connu: null });
});

test('un type impose se resout sans passer par la reconnaissance par champs', () => {
  // Aucun champ ne designe un mat : l'auteur l'a choisi a la main.
  const r = resoudreObjet(CAT, { source: 'grist', nom: 'Points' }, point({ nom: 'X' }), { typeId: 'mat_crosse', lod: 0 });
  assert.equal(r.type.id, 'mat_crosse');
  assert.equal(r.asset.keys.height_class, 'h6', 'classe par defaut du type');
  assert.match(r.url, /^https:\/\/exemple\.test\/objets\/glb\/mat_crosse_h6_v0_lod0\.glb$/);
  assert.equal(r.fallback, 'streetlamp');
});

test('un type impose garde les mesures : la hauteur de feu choisit toujours la classe', () => {
  const r = resoudreObjet(CAT, { source: 'grist', nom: 'Points' }, point({ hauteurFeu: 8 }), { typeId: 'mat_crosse', lod: 0 });
  assert.equal(r.asset.keys.height_class, 'h8');
});

test('un luminaire impose n est jamais tire en echelle, l echelle de couche s y applique', () => {
  const r = resoudreObjet(CAT, { source: 'grist', nom: 'Points' }, point({}), { typeId: 'applique_facade', lod: 0, echelleCouche: 2 });
  assert.equal(r.echelle, 2);
});

test('un type impose est la meme chose que le type reconnu, quand les champs concordent', () => {
  const props = { support: 'MAT', structure: 'LANT', hauteurFeu: 5 };
  const auto = resoudreObjet(CAT, { source: 'grist', nom: 'P' }, point(props), { lod: 0 });
  const impose = resoudreObjet(CAT, { source: 'grist', nom: 'P' }, point(props), { typeId: 'mat_crosse', lod: 0 });
  assert.equal(auto.type.id, 'mat_crosse');
  assert.equal(impose.url, auto.url);
  assert.equal(impose.cle, auto.cle);
});

test('un type impose inconnu, ou une geometrie qui n est pas un point, ne resout rien', () => {
  assert.equal(resoudreObjet(CAT, {}, point({}), { typeId: 'fantome' }), null);
  const ligne = { type: 'Feature', geometry: { type: 'LineString', coordinates: [[5, 43], [5.1, 43]] }, properties: {} };
  assert.equal(resoudreObjet(CAT, {}, ligne, { typeId: 'mat_crosse' }), null);
});

// ---------------------------------------------------------------------------
// Les paramètres qui pilotent un luminaire réaliste
// ---------------------------------------------------------------------------
import { estPointLumineux, poseLuminaire } from '../lib/eclairage-rendu.js';

test('un type d eclairage choisi n exige plus structure ni support, mais toujours une grandeur photometrique', () => {
  assert.equal(estPointLumineux({ puissance: 70 }), false, 'sans type choisi : EclExt exige structure et support');
  assert.equal(estPointLumineux({ puissance: 70 }, { impose: true }), true);
  assert.equal(estPointLumineux({ temperatureCouleur: 3000 }, { impose: true }), true);
  assert.equal(estPointLumineux({ nom: 'X' }, { impose: true }), false, 'sans flux ni couleur, rien a emettre');
  assert.equal(estPointLumineux({ puissance: '' }, { impose: true }), false);
  assert.equal(estPointLumineux({ structure: 'LANT', support: 'MAT', puissance: 70 }), true, 'EclExt complet : inchange');
});

test('un type ancre au feu est eleve de hauteurFeu, un type ancre au pied reste au sol', () => {
  const par = (id) => CAT.types.find((t) => t.id === id).lighting;
  assert.equal(poseLuminaire(par('mat_crosse'), { hauteurFeu: 8 }, 0).elevation, 0, 'mat : pied');
  assert.equal(poseLuminaire(par('encastre_sol'), { hauteurFeu: 8 }, 0).elevation, 0, 'encastre : pied');
  assert.equal(poseLuminaire(par('applique_facade'), { hauteurFeu: 3.2 }, 0).elevation, 3.2, 'applique : feu');
  assert.equal(poseLuminaire(par('axial_suspendu'), { hauteurFeu: '6,5' }, 0).elevation, 6.5, 'virgule decimale');
});

test('sans hauteurFeu, un type ancre au feu prend la hauteur par defaut de son bloc lighting', () => {
  const par = (id) => CAT.types.find((t) => t.id === id).lighting;
  assert.equal(poseLuminaire(par('applique_facade'), {}, 0).elevation, 5.5);
  assert.equal(poseLuminaire(par('axial_suspendu'), {}, 0).elevation, 7.25);
  assert.equal(poseLuminaire(par('projecteur_facade'), {}, 0).elevation, 4);
});

test('un champ azimut l emporte sur le tirage, et le dit', () => {
  const l = CAT.types.find((t) => t.id === 'applique_facade').lighting;
  assert.deepEqual(poseLuminaire(l, { azimut: 90 }, 12), { elevation: 5.5, azimutDeg: 90, origineAzimut: 'champ' });
  assert.equal(poseLuminaire(l, {}, 12).origineAzimut, 'tirage_provisoire', 'faute de facade calculee');
  assert.equal(poseLuminaire(CAT.types.find((t) => t.id === 'mat_crosse').lighting, {}, 12).origineAzimut, 'tirage');
});

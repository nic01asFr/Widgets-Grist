/**
 * Itinéraire orienté : les sens de circulation de la BD TOPO (`sens_de_circulation`) sont respectés.
 *
 * « Sens direct » = du premier au dernier point de la géométrie ; « Sens inverse » = l'inverse ; « Double sens » et
 * « Sans objet » n'interdisent rien. Sans aucun sens connu, le réseau se comporte exactement comme avant.
 *
 * node --test projects/Atlas/tests/itineraire-sens.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { construireReseau, cheminEntre, itineraire, sensBdTopo } from '../lib/itineraire.js';

const tron = (sens, ...coords) => ({ type: 'Feature', properties: sens === undefined ? {} : { sens_de_circulation: sens }, geometry: { type: 'LineString', coordinates: coords } });

//   D ---- C
//   |      |
//   A ---> B     (AB est le tronçon dont on fait varier le sens)
const A = [5.000, 43.000], B = [5.0123, 43.000], C = [5.0123, 43.009], D = [5.000, 43.009];
const carre = (sensAB) => [tron(sensAB, A, B), tron('Double sens', B, C), tron('Double sens', C, D), tron('Double sens', D, A)];
const milieuAB = (t) => [A[0] + (B[0] - A[0]) * t, A[1]];

test('sensBdTopo : les valeurs de la BD TOPO, tout le reste n\'interdit rien', () => {
  assert.equal(sensBdTopo('Double sens'), 'double');
  assert.equal(sensBdTopo('Sens direct'), 'direct');
  assert.equal(sensBdTopo('Sens inverse'), 'inverse');
  for (const v of ['Sans objet', '', null, undefined, 'n importe quoi', 42]) assert.equal(sensBdTopo(v), 'double', String(v));
});

test('un réseau sans aucun sens connu n\'est pas orienté, et se comporte comme avant', () => {
  const r = construireReseau([tron(undefined, A, B), tron(undefined, B, C), tron(undefined, C, D), tron(undefined, D, A)]);
  assert.equal(r.oriente, false);
  const court = cheminEntre(r, B, A);
  assert.ok(court.ok); assert.ok(court.longueurM < 1200, 'le tronçon direct, dans le sens que l\'on veut');
});

test('un réseau dont un tronçon porte un sens est orienté ; « Double sens » et « Sans objet » seuls ne l\'orientent pas', () => {
  assert.equal(construireReseau(carre('Sens direct')).oriente, true);
  assert.equal(construireReseau(carre('Double sens')).oriente, false);
  assert.equal(construireReseau(carre('Sans objet')).oriente, false);
});

test('sens direct : de A vers B directement, de B vers A par le détour', () => {
  const r = construireReseau(carre('Sens direct'));
  const aller = cheminEntre(r, A, B);
  const retour = cheminEntre(r, B, A);
  assert.ok(aller.ok && retour.ok);
  assert.ok(aller.longueurM < 1200, 'AB dans son sens : environ 1 km');
  assert.ok(retour.longueurM > 2800, 'BA interdit : B, C, D, A, environ 3 km');
  assert.ok(retour.coordonnees.some((p) => p[0] === C[0] && p[1] === C[1]), 'le détour passe par C');
});

test('sens inverse : le tronçon dessiné de A vers B ne se parcourt que de B vers A', () => {
  const r = construireReseau(carre('Sens inverse'));
  assert.ok(cheminEntre(r, B, A).longueurM < 1200);
  assert.ok(cheminEntre(r, A, B).longueurM > 2800);
});

test('oriente: false ignore les sens, à la demande', () => {
  const r = construireReseau(carre('Sens direct'));
  assert.ok(cheminEntre(r, B, A, { oriente: false }).longueurM < 1200);
  assert.ok(cheminEntre(r, B, A, { oriente: true }).longueurM > 2800);
  assert.ok(cheminEntre(r, B, A).longueurM > 2800, 'orienté par défaut quand le réseau porte des sens');
});

test('départ posé sur un sens unique : on ne part que dans le sens permis', () => {
  const direct = construireReseau(carre('Sens direct'));
  const inverse = construireReseau(carre('Sens inverse'));
  const depart = milieuAB(0.5);
  const versB = cheminEntre(direct, depart, C);      // départ au milieu de AB, arrivée en C : par B, environ 0,5 + 1 km
  const parA = cheminEntre(inverse, depart, C);      // même départ, sens inverse : par A, D puis C, environ 0,5 + 1 + 1,4 km
  assert.ok(versB.ok && parA.ok);
  assert.ok(versB.longueurM < parA.longueurM, 'le sens direct permet de partir vers B');
  assert.ok(versB.coordonnees.some((p) => p[0] === B[0] && p[1] === B[1]));
  assert.ok(parA.coordonnees.some((p) => p[0] === A[0] && p[1] === A[1]));
});

test('même tronçon à contresens : refusé, on contourne ; dans le bon sens : tout droit', () => {
  const r = construireReseau(carre('Sens direct'));
  const loin = milieuAB(0.8), pres = milieuAB(0.2);
  const contresens = cheminEntre(r, loin, pres);   // de 0,8 vers 0,2 : sens inverse interdit
  const bonSens = cheminEntre(r, pres, loin);
  assert.ok(contresens.ok && bonSens.ok);
  assert.ok(bonSens.longueurM < 1000, 'tout droit, environ 0,6 km');
  assert.ok(contresens.longueurM > 3000, 'contournement par B, C, D, A');
});

test('aucun chemin respectant les sens : la raison le dit, et dit qu\'un chemin existe sans eux', () => {
  // A ---> B, rien d'autre : de B vers A, il n'y a que le tronçon interdit.
  const r = construireReseau([tron('Sens direct', A, B)]);
  const f = cheminEntre(r, B, A);
  assert.equal(f.ok, false);
  assert.match(f.raison, /sens de circulation/);
  assert.match(f.raison, /sans les respecter|existe/);
  assert.equal(cheminEntre(r, B, A, { oriente: false }).ok, true);
});

test('réseau réellement coupé : la raison reste celle d\'un réseau coupé', () => {
  const r = construireReseau([tron('Sens direct', A, B), tron('Double sens', [6, 44], [6.01, 44])]);
  const f = cheminEntre(r, A, [6.005, 44], { ecartMaxM: 1e7 });
  assert.equal(f.ok, false);
  assert.doesNotMatch(f.raison, /sens de circulation/);
});

test('deux tronçons raccordés à quelques mètres restent traversables dans les deux sens, malgré un sens unique voisin', () => {
  // AB (sens direct) puis B' à 2 m de B, vers C : le raccord n'est pas un tronçon, il ne porte pas de sens.
  const Bp = [B[0] + 0.00002, B[1]];
  const r = construireReseau([tron('Sens direct', A, B), tron('Double sens', Bp, C)]);
  assert.ok(cheminEntre(r, A, C).ok, 'de A vers C par le raccord');
  assert.equal(cheminEntre(r, C, A).ok, false, 'retour par AB interdit');
  assert.equal(cheminEntre(r, C, A, { oriente: false }).ok, true);
});

test('MultiLineString : le sens de l\'entité vaut pour chacune de ses lignes', () => {
  const multi = { type: 'Feature', properties: { sens_de_circulation: 'Sens direct' }, geometry: { type: 'MultiLineString', coordinates: [[A, B], [D, C]] } };
  const r = construireReseau([multi, tron('Double sens', B, C), tron('Double sens', D, A)]);
  assert.equal(r.oriente, true);
  assert.ok(cheminEntre(r, D, C).longueurM < 1200, 'DC dans son sens');
  // C vers D est interdit, et le détour par B puis A l'est aussi (AB ne se prend que de A vers B) : plus aucun chemin permis.
  const retour = cheminEntre(r, C, D);
  assert.equal(retour.ok, false);
  assert.match(retour.raison, /sens de circulation/);
  assert.ok(cheminEntre(r, C, D, { oriente: false }).ok, 'sans les sens, le chemin existe');
});

test('itineraire par points de passage : les sens valent pour chaque étape, et l\'erreur dit laquelle', () => {
  const r = construireReseau(carre('Sens direct'));
  const ok = itineraire(r, [A, B, C]);
  assert.ok(ok.ok);
  const ko = itineraire(construireReseau([tron('Sens direct', A, B)]), [A, B, A]);
  assert.equal(ko.ok, false);
  assert.match(ko.raison, /Tronçon 2/);
});

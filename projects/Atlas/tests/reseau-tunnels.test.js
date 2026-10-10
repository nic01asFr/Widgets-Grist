/**
 * Les tunnels (BD TOPO : `position_par_rapport_au_sol` = -1) dans les deux constructeurs de réseau d'Atlas :
 *  1. un tunnel SUIT son tracé (sa longueur est celle de sa géométrie, pas celle de la corde entre ses bouts) ;
 *  2. un tunnel SE JOINT aux routes de surface à ses entrées et sorties (les portails), même à quelques mètres près pour un tracé retouché ;
 *  3. un tunnel NE SE RACCORDE PAS aux routes qu'il croise sans partager d'extrémité (il passe dessous).
 *
 * node --test projects/Atlas/tests/tunnels.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { construireGraphe, composantesConnexes } from '../lib/reseau/graphe-routier.js';
import { construireReseau, cheminEntre } from '../lib/itineraire.js';

//  W ---- P1 ~~~~ (tunnel, qui s'incurve au nord) ~~~~ P2 ---- E        (surface : W-P1 et P2-E ; le tunnel passe SOUS la route C)
//                      |
//                      C   (route nord-sud qui coupe le tunnel sans partager d'extrémité)
const W = [5.380, 43.290], P1 = [5.382, 43.290], P2 = [5.386, 43.290], E = [5.388, 43.290];
const COURBE = [5.384, 43.2915];                      // le tunnel monte vers le nord entre ses portails
const CNORD = [5.383, 43.2935], CSUD = [5.383, 43.2885];   // C coupe le tunnel entre P1 et la courbe

const route = (cleabs, ligne, niveau = 0, extra = {}) => ({
  type: 'Feature',
  properties: { cleabs, nature: 'Route à 1 chaussée', position_par_rapport_au_sol: String(niveau), importance: '3', etat_de_l_objet: 'En service', acces_vehicule_leger: 'Libre', ...extra },
  geometry: { type: 'LineString', coordinates: ligne },
});
// `debutEst` : le début de la route de surface côté est, quand il ne tombe pas exactement sur le portail du tunnel (tracé retouché)
const reseau = (debutEst = P2) => [
  route('SURF-OUEST', [W, P1]),
  route('TUNNEL', [P1, COURBE, P2], -1, { nature: 'Route à 2 chaussées' }),
  route('SURF-EST', [debutEst, E]),
  route('CROISE', [CSUD, CNORD]),
];
const metres = (a, b) => { const k = Math.cos((a[1] * Math.PI) / 180); return Math.hypot((b[0] - a[0]) * 111320 * k, (b[1] - a[1]) * 110540); };
const longueurLigne = (l) => l.slice(1).reduce((s, p, i) => s + metres(l[i], p), 0);

test('graphe BD TOPO : le tunnel suit son tracé, se joint aux deux portails et passe sous la route qu\'il croise', () => {
  const g = construireGraphe(reseau());
  const tunnel = g.parCleabs.get('TUNNEL');
  assert.equal(tunnel.niveau, -1, 'le niveau est conservé');
  const corde = metres(P1, P2), tracé = longueurLigne([P1, COURBE, P2]);
  assert.ok(tracé > corde * 1.05, 'le tracé s\'incurve, la corde est plus courte');
  assert.ok(Math.abs(tunnel.L - tracé) < 2, 'la longueur de l\'arête suit le tracé (' + tunnel.L.toFixed(1) + ' m pour ' + tracé.toFixed(1) + ' m)');
  const composantes = composantesConnexes(g);
  assert.equal(composantes.length, 2, 'la route de surface + le tunnel d\'un côté, la route croisée seule de l\'autre');
  assert.equal(composantes[0].length, 3, 'SURF-OUEST, TUNNEL et SURF-EST sont reliés par leurs portails');
  const croisee = g.parCleabs.get('CROISE');
  assert.ok(composantes[1].includes(croisee.id), 'la route croisée n\'est pas raccordée au tunnel : il passe dessous');
});

test('graphe BD TOPO : un portail décalé de plus d\'un centimètre ne se raccorde pas (exactitude voulue du graphe)', () => {
  const g = construireGraphe(reseau([P2[0] + 0.00005, P2[1]]));   // route de surface décalée d'environ 4 m du portail
  const tunnel = g.parCleabs.get('TUNNEL');
  const est = g.parCleabs.get('SURF-EST');
  assert.notEqual(tunnel.b, est.a, 'le graphe exact ne raccorde pas des bouts décalés ; c\'est le travail de lib/itineraire.js (voir ci-dessous)');
});

test('réseau d\'itinéraire : on traverse le tunnel de bout en bout, sur son tracé, sans passer par la route croisée', () => {
  const r = construireReseau(reseau());
  const chemin = cheminEntre(r, W, E);
  assert.ok(chemin.ok, 'un chemin existe de W à E par le tunnel');
  const attendu = longueurLigne([W, P1]) + longueurLigne([P1, COURBE, P2]) + longueurLigne([P2, E]);
  assert.ok(Math.abs(chemin.longueurM - attendu) < 15, 'le chemin suit les tracés : ' + chemin.longueurM.toFixed(0) + ' m pour ' + attendu.toFixed(0) + ' m attendus');
  assert.ok(chemin.longueurM > metres(W, E) * 1.02, 'plus long que la droite : le tunnel s\'incurve');
});

test('réseau d\'itinéraire : un tunnel ne se raccorde pas à la route qu\'il croise', () => {
  const r = construireReseau(reseau());
  assert.equal(cheminEntre(r, CSUD, W).ok, false, 'depuis la route croisée, on ne rejoint ni le tunnel ni la surface');
  assert.equal(cheminEntre(r, CNORD, E).ok, false);
});

test('réseau d\'itinéraire : un portail décalé de quelques mètres se raccorde (tracé retouché)', () => {
  const r = construireReseau(reseau([P2[0] + 0.00002, P2[1]]));   // environ 1,4 m
  assert.ok(cheminEntre(r, W, E).ok, 'le raccord à quelques mètres ferme le portail');
});

test('réseau d\'itinéraire : un tunnel à sens unique se parcourt dans son sens, pas à contresens', () => {
  const sens = (dir) => [route('SURF-OUEST', [W, P1]), route('TUNNEL', [P1, COURBE, P2], -1, { sens_de_circulation: dir }), route('SURF-EST', [P2, E])];
  const direct = construireReseau(sens('Sens direct'));
  assert.ok(cheminEntre(direct, W, E, { oriente: true }).ok, 'dans le sens du tunnel');
  assert.equal(cheminEntre(direct, E, W, { oriente: true }).ok, false, 'à contresens : refusé, aucun détour n\'existe');
  assert.ok(cheminEntre(direct, E, W, { oriente: false }).ok, 'sans respecter les sens : possible');
});

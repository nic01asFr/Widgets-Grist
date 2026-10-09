// Réseau de test pour les modules de lib/reseau/ : en mètres, dans un repère centré sur 3,0 E / 46,5 N, sans réseau.
//
//   y=+20   P  ---------------------------------------- (chaussée voisine, autre nom, sans numéro) ; reliée par C1 et C2
//   y=  0   M1 ---- M2 -- M3 ---------- M4 ---------- M5      (route D1 « Avenue des Tests », nœuds à x=100, 150, 300, 400)
//                          |X1 / X2 : rue transversale x=150 (-100 .. +100)
//                                  S : impasse de 6 m au sud du nœud x=300
import { creerRepere } from '../lib/reseau/geo.js';

export const repere = creerRepere(3.0, 46.5);
export const ll = (p) => repere.depuis(p[0], p[1]);

export function troncon(cleabs, pts, props = {}) {
  return {
    type: 'Feature',
    properties: { cleabs, nature: 'Route à 1 chaussée', importance: '5', sens_de_circulation: 'Double sens', ...props },
    geometry: { type: 'LineString', coordinates: pts.map(ll) },
  };
}

export const D1 = { cpx_numero: 'D1', nom_collaboratif_gauche: 'Avenue des Tests' };

export function reseau() {
  return [
    troncon('M1', [[0, 0], [100, 0]], D1), troncon('M2', [[100, 0], [150, 0]], D1), troncon('M3', [[150, 0], [300, 0]], D1),
    troncon('M4', [[300, 0], [400, 0]], D1), troncon('M5', [[400, 0], [500, 0]], D1),
    troncon('X1', [[150, -100], [150, 0]], { nom_collaboratif_gauche: 'Rue Transversale' }),
    troncon('X2', [[150, 0], [150, 100]], { nom_collaboratif_gauche: 'Rue Transversale' }),
    troncon('S', [[300, 0], [300, -6]], { nom_collaboratif_gauche: 'Impasse Courte' }),
    troncon('P', [[0, 20], [500, 20]], { nom_collaboratif_gauche: 'Rue Voisine' }),
    troncon('C1', [[0, 0], [0, 20]], { nom_collaboratif_gauche: 'Rue Voisine' }),
    troncon('C2', [[500, 0], [500, 20]], { nom_collaboratif_gauche: 'Rue Voisine' }),
  ];
}

/** Une ligne en mètres -> LineString WGS84. */
export const ligne = (pts) => ({ type: 'LineString', coordinates: pts.map(ll) });

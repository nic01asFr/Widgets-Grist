// Reseaux synthetiques au format BD TOPO (troncon_de_route), sans acces reseau.
//  reseau()     grille 3 x 3, un sens unique, un giratoire a 4 branches au centre, un carrefour compose (deux noeuds a 12 m)
//  grille(o)    grille 3 x 3 de rues a double sens, SANS giratoire : le carrefour central est un croisement a 4 branches
//  giratoire(o) un giratoire a 4 branches et ses branches droites qui finissent en impasse (frontieres d'un systeme ouvert)
const centre = [5.0, 43.0];
const M = 111320, k = Math.cos(centre[1] * Math.PI / 180);
const ll = ([x, y]) => [centre[0] + x / (M * k), centre[1] + y / M];
let n = 0;
function troncon(pts, p = {}) {
  n++;
  return { type: 'Feature', properties: Object.assign({ cleabs: 'SYN' + String(n).padStart(4, '0'), nature: 'Route a 1 chaussee', sens_de_circulation: 'Double sens', nombre_de_voies: 2, largeur_de_chaussee: 6,
    importance: '4', vitesse_moyenne_vl: 40, position_par_rapport_au_sol: '0', etat_de_l_objet: 'En service', acces_vehicule_leger: 'Libre', nom_collaboratif_gauche: 'RUE ' + n }, p),
    geometry: { type: 'LineString', coordinates: pts.map(ll) } };
}
function reseau() {
  n = 0; const F = [], P = 120;
  const pt = (i, j) => [(i - 1) * P, (j - 1) * P];
  // grille 3 x 3 : segments entre intersections voisines ; le centre (1,1) est remplace par un giratoire, (2,2) par un carrefour compose
  const R0 = 14, ring = [0, 1, 2, 3].map((q) => [R0 * Math.cos(q * Math.PI / 2), R0 * Math.sin(q * Math.PI / 2)]);
  const anneau = (a, b, mid) => { const pts = [ring[a], mid, ring[b]]; return troncon(pts, { nature: 'Rond-point', sens_de_circulation: 'Sens direct', nombre_de_voies: 1, largeur_de_chaussee: 5, importance: '3' }); };
  // anneau oriente dans le sens antihoraire : (R,0) -> (0,R) -> (-R,0) -> (0,-R)
  const m45 = (a) => [R0 * Math.cos(a), R0 * Math.sin(a)];
  F.push(anneau(0, 1, m45(Math.PI / 4)), anneau(1, 2, m45(3 * Math.PI / 4)), anneau(2, 3, m45(5 * Math.PI / 4)), anneau(3, 0, m45(7 * Math.PI / 4)));
  // branches du giratoire vers les 4 voisins
  F.push(troncon([ring[0], pt(2, 1)]), troncon([ring[1], pt(1, 2)]), troncon([ring[2], pt(0, 1)]), troncon([ring[3], pt(1, 0)]));
  for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) {
    if (i === 1 && j === 1) continue;
    for (const [di, dj] of [[1, 0], [0, 1]]) { const i2 = i + di, j2 = j + dj; if (i2 > 2 || j2 > 2) continue; if ((i === 1 && j === 1) || (i2 === 1 && j2 === 1)) continue;
      const a = pt(i, j), b = pt(i2, j2); const vieux = (i === 0 && j === 0 && di === 1);
      F.push(troncon([a, b], vieux ? { sens_de_circulation: 'Sens direct', importance: '5', nombre_de_voies: 1, largeur_de_chaussee: 3.5 } : { importance: i === 0 || j === 0 ? '3' : '4' })); }
  }
  // carrefour compose en (2,2) : on insere un troncon court de 12 m entre deux noeuds
  const c = pt(2, 2); F.push(troncon([[c[0] - 12, c[1]], c]));
  return F;
}

// grille 3 x 3 sans giratoire : une croix de deux rues (importance 3) au centre et un tour de rues (importance 4) dont les coins sont arrondis (rayon 25 m).
// Le carrefour central est un croisement a 4 branches ; les quatre milieux de cote sont des carrefours a 3 branches ; il n'y a aucun noeud de coin.
// o : { nv (voies des deux sens : 4 = deux par sens), pas (m), vitesse }
function grille(o = {}) {
  n = 0; const { nv = 4, pas = 120, vitesse = 40 } = o, F = [], P = pas, Rc = 25;
  const prop = (importance) => ({ nombre_de_voies: nv, largeur_de_chaussee: nv * 3, vitesse_moyenne_vl: vitesse, importance });
  for (const [x, y] of [[0, -P], [-P, 0], [P, 0], [0, P]]) F.push(troncon([[0, 0], [x, y]], prop('3')));
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const pts = [[0, sy * P], [sx * (P - Rc), sy * P]], c0 = [sx * (P - Rc), sy * (P - Rc)];
    for (let q = 1; q <= 8; q++) { const t = q / 8 * Math.PI / 2; pts.push([c0[0] + sx * Rc * Math.sin(t), c0[1] + sy * Rc * Math.cos(t)]); }
    pts.push([sx * P, 0]); F.push(troncon(pts, prop('4')));
  }
  return F;
}

// giratoire seul a quatre branches (N, E, S, O). o : { R (rayon de l'axe de l'anneau, m), L (longueur des branches), nv, vitesse, entreeSeule (indice de branche sans sortie) }
function giratoire(o = {}) {
  n = 0; const { R = 11, L = 120, nv = 2, vitesse = 50, entreeSeule = null } = o, F = [];
  const ring = [0, 1, 2, 3].map((q) => [R * Math.cos(q * Math.PI / 2), R * Math.sin(q * Math.PI / 2)]);
  const m45 = (a) => [R * Math.cos(a), R * Math.sin(a)];
  const seg = (a, b, mid) => troncon([ring[a], mid, ring[b]], { nature: 'Rond-point', sens_de_circulation: 'Sens direct', nombre_de_voies: 1, largeur_de_chaussee: 4, importance: '3', vitesse_moyenne_vl: 25 });
  F.push(seg(0, 1, m45(Math.PI / 4)), seg(1, 2, m45(3 * Math.PI / 4)), seg(2, 3, m45(5 * Math.PI / 4)), seg(3, 0, m45(7 * Math.PI / 4)));
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  dirs.forEach((d, q) => {
    const bout = [ring[q][0] + d[0] * L, ring[q][1] + d[1] * L];
    const p = { nombre_de_voies: nv, largeur_de_chaussee: nv * 3.25, importance: '3', vitesse_moyenne_vl: vitesse };
    // branche d'entree seule : sens unique vers l'anneau (on trace de l'extremite vers l'anneau, « Sens direct »)
    F.push(q === entreeSeule ? troncon([bout, ring[q]], Object.assign(p, { sens_de_circulation: 'Sens direct' })) : troncon([ring[q], bout], p));
  });
  return F;
}
module.exports = { reseau, centre, grille, giratoire, troncon };

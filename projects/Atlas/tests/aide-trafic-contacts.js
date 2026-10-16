// Aide commune des tests de contacts du trafic (réglage actuel contre l'ancien) : le réseau construit une fois par fichier de test.
// Séparés en trois fichiers pour que l'exécuteur de tests les lance en parallèle (38 s en série, ~15 s au plus long).
const T = require('../lib/trafic/trafic.js'), S = require('./aide-trafic-reseau.js');
const G = T.construire(S.reseau(), S.centre, { seuil: 20 });
const pas = (sim, s, f) => { while (sim.t < s) { sim.pas(); if (f) f(sim); } return sim; };
const moy = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
// reglage d'origine du moteur (une voie par sens, meneur le plus proche seul, suivi simple, raccords suivant les liaisons internes, pas d'impatience, pas de file d'attente)
const ANCIEN = { voies: 1, file: false, suivi: 'simple', raccord: 'chaine', patience: 0, suiviChemin: false, meneurs: 'plus-proche', sortiePlace: false, margeAnneau: 2.5, insertionSure: false };
const mesure = (o, N = 100) => { const co = [], fo = [], v = []; for (const g of [1, 2, 3, 4]) { const sim = T.creer(G, Object.assign({ graine: g, N }, o)); let s = 0, n = 0;
  pas(sim, 400, (x) => { if (x.t > 40 && Math.abs(x.t % 5) < 0.1) { s += moy(x.agents.map((a) => a.v)) * 3.6; n++; } }); co.push(sim.stats.contacts.size); fo.push(sim.stats.forces); v.push(s / n); }
  return { contacts: co.reduce((a, b) => a + b, 0), forces: fo.reduce((a, b) => a + b, 0), vitesse: moy(v) }; };
module.exports = { T, S, G, pas, moy, ANCIEN, mesure };

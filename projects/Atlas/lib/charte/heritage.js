/**
 * Palettes HISTORIQUES d'Atlas : les huit jeux que l'éditeur de style proposait avant la charte. Données seules.
 *
 * Elles restent disponibles, sous leurs noms d'origine et avec leurs couleurs d'origine, pour que les couches existantes ne changent
 * pas de couleur : ce sont des ALIAS dans le registre. Seuls les nouveaux défauts (charte « atlas ») changent.
 * Le test `charte-heritage.test.js` lit `app_v7.js` et vérifie que ces valeurs lui sont identiques, couleur par couleur.
 */
export const VERSION = '1.0.0';

export const PALETTES_HERITAGE = Object.freeze({
  Tableau10: Object.freeze(['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab']),
  Set2: Object.freeze(['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3']),
  Verts: Object.freeze(['#E8F0D0', '#B9D183', '#7AB04A', '#4A8331', '#1E5219']),
  Bleus: Object.freeze(['#DEEBF7', '#9ECAE1', '#4292C6', '#08519C', '#08306B']),
  Oranges: Object.freeze(['#FFEDDA', '#FDAE6B', '#F16913', '#A63603', '#7F2704']),
  Viridis: Object.freeze(['#440154', '#3e4a89', '#26828e', '#35b779', '#6ece58', '#b5de2b', '#fde725']),
  YlOrRd: Object.freeze(['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fc4e2a', '#e31a1c', '#800026']),
  RdYlGn: Object.freeze(['#d73027', '#fdae61', '#fee08b', '#d9ef8b', '#66bd63', '#1a9850']),
});

/** Type et nom affiché de chaque palette historique (mêmes valeurs que `PALETTE_INFO` d'origine). */
export const INFOS_HERITAGE = Object.freeze({
  Tableau10: Object.freeze({ type: 'qualitative', name: 'Tableau 10' }),
  Set2: Object.freeze({ type: 'qualitative', name: 'Set 2' }),
  Verts: Object.freeze({ type: 'sequential', name: 'Verts' }),
  Bleus: Object.freeze({ type: 'sequential', name: 'Bleus' }),
  Oranges: Object.freeze({ type: 'sequential', name: 'Oranges' }),
  Viridis: Object.freeze({ type: 'sequential', name: 'Viridis' }),
  YlOrRd: Object.freeze({ type: 'sequential', name: 'Jaune-Rouge' }),
  RdYlGn: Object.freeze({ type: 'divergent', name: 'Rouge-Vert' }),
});

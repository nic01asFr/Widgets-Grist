/** Démarre le composant carte BI : script module de la page maigre (index_bi.html), en fichier pour la politique `script-src 'self'`. */
import { lancer } from './entree.js?v=20261016a';
lancer().catch((e) => console.error('[Atlas BI]', e));

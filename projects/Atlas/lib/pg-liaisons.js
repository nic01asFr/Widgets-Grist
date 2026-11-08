/**
 * Les liaisons PostgreSQL enregistrées : une table de pg-gateway « en direct », retrouvée au rechargement du document.
 *
 * Une liaison est une ligne de `Maquette_Layers` dont le `StyleJSON` porte `{ _pg: { url, connexion, schema, table } }`. Elle
 * ne contient JAMAIS le jeton (mémoire de la page seulement, `pg-acces.js`) ni d'entités (`GeoJSON` vaut « {} », jamais vide :
 * une ligne sans GeoJSON lisible est ignorée sans message).
 *
 * ## Une liaison lue dans un document est une donnée, pas une instruction
 * Un document partagé peut porter l'adresse d'une passerelle quelconque. Le chargement ne contacte donc RIEN : il met la liaison
 * de côté, le panneau PG la montre avec son adresse, et c'est la personne qui l'active. Le jeton, de son côté, n'est présenté
 * qu'à l'origine pour laquelle on l'a saisi (`pg-acces.js`) : activer la liaison d'une autre passerelle redemande un jeton, en
 * disant laquelle. Une adresse qui n'est pas https (hors localhost) est refusée dès la lecture.
 *
 * Module pur : ni Grist, ni DOM, ni réseau.
 */

import { adresseAdmisePg } from './pg-acces.js?v=20261108a';

export const CLE_LIAISON = '_pg';

const texte = (v) => typeof v === 'string' && v.trim() !== '';

/** La ligne `Maquette_Layers` d'une liaison. */
export function ligneLiaison({ url, connexion, schema, table, couleur = '#d62728', libelle } = {}) {
  return {
    Name: libelle || `${schema}.${table}`,
    Color: couleur,
    Visible: true,
    GeomType: 'Polygon',
    StyleJSON: JSON.stringify({ [CLE_LIAISON]: { url, connexion, schema, table } }),
    GeoJSON: '{}',
  };
}

/**
 * La liaison que porte un `StyleJSON` déjà lu, ou `null` si ce n'en est pas une (ou si elle est inutilisable).
 * @returns {{url:string, connexion:string, schema:string, table:string}|null}
 */
export function lireLiaison(style) {
  const l = style && typeof style === 'object' ? style[CLE_LIAISON] : null;
  if (!l || typeof l !== 'object') return null;
  if (![l.url, l.connexion, l.schema, l.table].every(texte)) return null;
  if (adresseAdmisePg(l.url) !== null) return null;
  return { url: l.url.trim().replace(/\/+$/, ''), connexion: l.connexion, schema: l.schema, table: l.table };
}

/** « passerelle.exemple.fr » : l'origine à montrer, jamais le chemin. */
export function origineLisible(url) {
  try { return new URL(url).host; } catch { return String(url); }
}

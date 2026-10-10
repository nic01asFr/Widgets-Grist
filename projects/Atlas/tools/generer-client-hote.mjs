// Génère `lib/bi/client-hote.js` : le client de l'hôte en UN SEUL FICHIER, sans import, à copier tel quel dans une application.
//
//   node tools/generer-client-hote.mjs            écrit lib/bi/client-hote.js
//
// Le fichier est ASSEMBLÉ, jamais réécrit à la main : le texte de `lib/bi/client.js` est repris tel quel, et son unique import (`./pont.js`) est
// remplacé par ce que le client en utilise réellement, EXPORTÉ aussi pour l'hôte : les tables (COMMANDES, COMMANDES_0_3, VERSIONS_ACCEPTEES, SOURCE_*, VERSION), lues du
// vrai module, et les deux fonctions (`versionsCompatibles`, `estCommande`), reprises par leur texte source. Rien de la charte ni de la validation
// des arguments (côté composant) n'y entre. `tests/client-hote.test.js` vérifie l'égalité avec `pont.js` et la fraîcheur du fichier publié.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as pont from '../lib/bi/pont.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CHEMIN_SOURCE_CLIENT = 'lib/bi/client.js';
export const CHEMIN_SOURCE_PONT = 'lib/bi/pont.js';
export const CHEMIN_SORTIE = 'lib/bi/client-hote.js';

const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8').replace(/\r\n/g, '\n');
/** `toString()` d'une fonction garde les fins de ligne du fichier source : on les ramène à un saut de ligne simple pour que le résultat ne dépende pas du poste. */
const unix = (texte) => String(texte).split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const empreinte = (texte) => crypto.createHash('sha256').update(texte).digest('hex').slice(0, 16);

/** Ce que le client peut demander au pont : tout autre nom fait échouer la génération (le générateur est à compléter). */
const FOURNI = ['COMMANDES', 'COMMANDES_0_3', 'VERSIONS_ACCEPTEES', 'SOURCE_RUNTIME', 'SOURCE_HOTE', 'versionsCompatibles', 'estCommande'];

/** @returns {string} le texte du fichier autonome */
export function construireClientHote() {
  const client = lire(CHEMIN_SOURCE_CLIENT);
  const pontTexte = lire(CHEMIN_SOURCE_PONT);
  const re = /^import \{([^}]*)\} from '\.\/pont\.js';\n/m;
  const m = re.exec(client);
  if (!m) throw new Error("client.js n'importe plus ./pont.js sous la forme attendue : adapter le générateur");
  if (client.split("from './pont.js'").length !== 2) throw new Error('client.js importe ./pont.js plusieurs fois : adapter le générateur');
  if (/^import\s/m.test(client.replace(m[0], ''))) throw new Error("client.js a un autre import que ./pont.js : le fichier ne serait pas autonome");
  const demandes = m[1].split(',').map((x) => x.trim()).filter(Boolean);
  const inconnus = demandes.filter((n) => !FOURNI.includes(n));
  if (inconnus.length) throw new Error('client.js demande au pont : ' + inconnus.join(', ') + ' : à ajouter au générateur');

  const tables = [
    `export const VERSION = ${JSON.stringify(pont.VERSION)};`,
    `export const VERSIONS_ACCEPTEES = Object.freeze(${JSON.stringify(pont.VERSIONS_ACCEPTEES)});`,
    `export const SOURCE_RUNTIME = ${JSON.stringify(pont.SOURCE_RUNTIME)};`,
    `export const SOURCE_HOTE = ${JSON.stringify(pont.SOURCE_HOTE)};`,
    `export const COMMANDES = Object.freeze(${JSON.stringify(pont.COMMANDES)});`,
    `export const COMMANDES_0_3 = Object.freeze(${JSON.stringify(pont.COMMANDES_0_3)});`,
  ].join('\n');
  const fonctions = [
    `/** Majeure et mineure égales (0.x : toute évolution de mineure peut casser). */`,
    'export ' + unix(pont.versionsCompatibles.toString()),
    `/** Une commande du contrat, en propriété PROPRE : \`constructor\`, \`__proto__\`... ne sont pas des commandes. */`,
    `export const estCommande = ${unix(pont.estCommande.toString())};`,
  ].join('\n');

  const entete = `/**
 * Client JavaScript de l'application HÔTE du composant carte d'Atlas, en UN SEUL FICHIER, sans import.
 *
 * Généré par tools/generer-client-hote.mjs depuis ${CHEMIN_SOURCE_CLIENT} (${empreinte(client)}) et ${CHEMIN_SOURCE_PONT} (${empreinte(pontTexte)}).
 * Ne pas modifier à la main : relancer le générateur. Contrat ${pont.VERSION} ; les tables de commandes sont celles du pont (test d'égalité).
 * Usage : voir docs/EXPLOITATION-EXTERNE-BI.md.
 */
`;
  const corps = client.replace(re, () => `// ---- Ce que le client utilise du pont (tables lues du pont, fonctions reprises de ses sources) ----\n${tables}\n${fonctions}\n// ---- Fin ----\n`);
  return entete + '\n' + corps.replace(/^\/\*\*[\s\S]*?\*\/\n/, (b) => b);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sortie = path.join(RACINE, CHEMIN_SORTIE);
  const texte = construireClientHote();
  fs.writeFileSync(sortie, texte);
  console.log(`${CHEMIN_SORTIE} : ${texte.length} octets, ${texte.split('\n').length} lignes`);
}

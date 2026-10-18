/**
 * Thème du kit d'applications -> charte d'Atlas. Module pur : aucun accès à la carte, au réseau ni au DOM.
 *
 * Le kit publie, par paquet et par mode (clair, sombre), un fichier `kit-theme-fichier/0.1` dont le champ `valeurs` porte 26 variables `--kit-*`
 * (voir la spécification ThemeDef, étage A). Atlas n'a besoin que de QUELQUES GRAINES : la charte calcule le reste (rampes de données, états de
 * sélection, plan de fond, contrastes mesurés). Cette traduction n'ajoute donc rien au kit et ne fixe ni halo, ni lavis, ni plan : ils restent
 * calculés par défaut.
 *
 * | Kit (`valeurs`)  | Graine d'Atlas | Remarque                                                                                          |
 * |------------------|----------------|---------------------------------------------------------------------------------------------------|
 * | `accent`         | `principal`    | l'identité (titres, filets, liens) ; `action` est la couleur des boutons, non retenue pour une carte |
 * | `fond`           | `fond`         | la page                                                                                           |
 * | `texte`          | `encre`        |                                                                                                   |
 * | `ok`             | `succes`       |                                                                                                   |
 * | `attention`      | `alerte`       | PIÈGE : l'orange du kit est l'alerte d'Atlas                                                      |
 * | `alerte`         | `erreur`       | PIÈGE : le rouge du kit est l'erreur d'Atlas                                                      |
 * | `info`           | `information`  |                                                                                                   |
 * | (aucune)         | `secondaire`   | le kit n'en a pas : calculée par Atlas                                                            |
 * | `police`         | `texte.famille`| mot-clé de la liste sûre (`systeme|sans|serif|mono|lisible`), jamais une pile ni une adresse        |
 *
 * La traduction se fait PAR MODE : l'appelant donne le fichier du mode en vigueur (clair ou sombre) et rappelle la fonction quand le mode change.
 * L'entrée est NON FIABLE (valeur lue dans une table du document) : rien n'est copié tel quel, une valeur illisible est écartée et DITE.
 * Une enveloppe entière est acceptée, ou son seul champ `valeurs`.
 */
import { analyserCouleur } from './couleurs.js';
import { VERSION_CHARTE, FAMILLES_POLICE } from './schema.js';

export const VERSION = '1.0.0';
export const VERSION_FICHIER = 'kit-theme-fichier/';
export const NOM_CHARTE = 'Thème du document';

/** Variable du kit -> graine d'Atlas. L'ordre est celui de la charte. */
export const CORRESPONDANCE = Object.freeze({
  accent: 'principal', fond: 'fond', texte: 'encre',
  ok: 'succes', attention: 'alerte', alerte: 'erreur', info: 'information',
});

const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * @param {object} entree  l'enveloppe `kit-theme-fichier/0.1` d'un mode, ou son champ `valeurs`
 * @returns {{charte: object|null, notes: string[], ignore: {chemin: string, code: string, valeur: string}[]}}
 *   `charte` : charte PARTIELLE brute (`atlas-charte/0.1`), à donner à `setTheme` ; null si rien n'est lisible.
 */
export function charteDepuisKit(entree) {
  const notes = [], ignore = [];
  const ecarter = (chemin, code, valeur) => ignore.push({ chemin, code, valeur: String(valeur).slice(0, 60) });
  if (!estObjet(entree)) { ecarter('entree', 'type', typeof entree); return { charte: null, notes, ignore }; }

  let valeurs = entree, police;
  if ('valeurs' in entree) {
    if (typeof entree.version === 'string' && !entree.version.startsWith(VERSION_FICHIER)) ecarter('version', 'version-inconnue', entree.version);
    valeurs = entree.valeurs;
    police = entree.police;
    if (entree.mode) notes.push('mode ' + String(entree.mode).slice(0, 12));
  }
  if (!estObjet(valeurs)) { ecarter('valeurs', 'type', typeof valeurs); return { charte: null, notes, ignore }; }

  const graines = {};
  for (const [cle, graine] of Object.entries(CORRESPONDANCE)) {
    if (!(cle in valeurs)) continue;
    const c = analyserCouleur(valeurs[cle]);
    if (!c) { ecarter('valeurs.' + cle, 'couleur-invalide', valeurs[cle]); continue; }
    if (c.alpha < 1) { ecarter('valeurs.' + cle, 'alpha-non-admis', valeurs[cle]); continue; }
    graines[graine] = c.hex;
  }
  if (!Object.keys(graines).length) { notes.push('aucune couleur lisible : le thème du document ne pose rien'); return { charte: null, notes, ignore }; }
  if (!graines.principal) notes.push('pas d\'accent lisible : la couleur principale d\'Atlas reste');

  const charte = { version: VERSION_CHARTE, nom: NOM_CHARTE, graines };
  if (police !== undefined) {
    if (typeof police === 'string' && Object.prototype.hasOwnProperty.call(FAMILLES_POLICE, police)) charte.texte = { famille: police };
    else ecarter('police', 'police-non-listee', police);
  }
  notes.push('secondaire, halo, lavis et plan : calculés par Atlas (hors thème du document)');
  return { charte, notes, ignore };
}

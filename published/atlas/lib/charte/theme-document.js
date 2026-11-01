/**
 * Le thème d'un DOCUMENT Grist : la table `Theme_document` donne l'identité visuelle du document (ThemeDef 1.0), et ce module la fait arriver partout où Atlas s'affiche. Module pur
 * (il reçoit le contenu de la table, il ne lit rien lui-même) : le widget Atlas, une page hôte du composant et un test l'emploient de la même façon.
 *
 *   const theme = themeDuDocument(await grist.docApi.fetchTable('Theme_document'), { mode: 'clair' });
 *   if (theme.charte) carte.setTheme(theme.charte, { remplacer: true });            // carte nue, composant, profil complet
 *   const habillage = habillageApplication(theme);                                   // les jetons de l'interface de l'application complète
 *
 * Règle de lecture (spécification ThemeDef, la même pour tous les lecteurs) : table absente ou vide, aucune ligne active : AUCUN thème, sans bruit ; plusieurs lignes actives : rien n'est
 * appliqué et `plusieurs-actifs` est dit ; le contenu est une donnée non fiable (`depuis-themedef.js`) ; les valeurs résolues du document sont appliquées sans être crues (`verifie: false`).
 * Ce module ne crée JAMAIS la table et n'écrit rien : l'appelant ne l'interroge que si elle existe (`listTables`).
 */
import { choisirThemeDefActif, charteDepuisThemeDef, VERSION_THEMEDEF } from './depuis-themedef.js';
import { assainir } from './schema.js';
import { resoudre } from './resolution.js';
import { variablesApplication } from './application.js';

export const VERSION = '1.0.0';
export const TABLE = 'Theme_document';
const MODES = ['clair', 'sombre'];

/** Le contenu d'une table Grist (`fetchTable`, colonnes) ou déjà en lignes, rendu en lignes. Les colonnes qui commencent par `_` ou `manual` sont ignorées. */
export function lignesDeTable(contenu) {
  if (Array.isArray(contenu)) return contenu.filter((l) => l && typeof l === 'object');
  if (!contenu || typeof contenu !== 'object') return [];
  const noms = Object.keys(contenu).filter((k) => Array.isArray(contenu[k]) && !k.startsWith('_') && !k.startsWith('manual'));
  const n = noms.reduce((m, k) => Math.max(m, contenu[k].length), 0);
  return Array.from({ length: n }, (_, i) => Object.fromEntries(noms.map((k) => [k, contenu[k][i]])));
}

/**
 * Le thème que dit la table, pour un mode d'apparence.
 * @param {object|object[]|null|undefined} contenu  le contenu de `Theme_document` (colonnes de `fetchTable`, ou lignes) ; absent : aucun thème
 * @param {{ mode?: 'clair'|'sombre' }} o
 * @returns {{ charte: object|null, ligne: string|null, mode: string|null, source: 'resolu'|'graines'|null, verifie: false, notes: string[], ignore: object[], avertissements: {code:string}[], raison: string }}
 *   `raison` : `applique`, `aucun-actif`, `plusieurs-actifs`, `version-inconnue` (colonne `version` de la ligne), `invalide`, `sans-mode-sombre`, `contraste-insuffisant`, `resolu-incomplet`
 */
export function themeDuDocument(contenu, { mode = 'clair' } = {}) {
  const vide = (raison, avertissements = [], ignore = [], ligne = null) => ({ charte: null, ligne, mode: null, source: null, verifie: false, notes: [], ignore, avertissements, raison });
  const lignes = lignesDeTable(contenu);
  const { ligne, avertissements } = choisirThemeDefActif(lignes);
  if (!ligne) return vide(avertissements.some((a) => a.code === 'plusieurs-actifs') ? 'plusieurs-actifs' : 'aucun-actif', avertissements);
  // La colonne `version` de la ligne : vide ou absente est tolérée (la version du document fait foi), toute autre valeur que la nôtre est refusée.
  const vc = ligne.version;
  if (vc !== undefined && vc !== null && vc !== '' && vc !== VERSION_THEMEDEF) return vide('version-inconnue', [...avertissements, { code: 'version-inconnue' }], [], String(ligne.cle));
  const r = charteDepuisThemeDef(ligne.themedef, { mode: MODES.includes(mode) ? mode : 'clair' });
  const raison = r.charte ? 'applique' : (r.refus ? r.refus.code : 'invalide');
  const dits = r.refus && r.refus.code !== 'sans-mode-sombre' ? [...avertissements, ...(r.refus.echecs.length ? r.refus.echecs.map((e) => ({ code: r.refus.code, paire: e.paire, mesure: e.mesure, seuil: e.seuil })) : [{ code: r.refus.code }])] : avertissements;
  return { charte: r.charte, ligne: String(ligne.cle), mode: r.mode, source: r.source, verifie: false, notes: r.notes, ignore: r.ignore, avertissements: dits, raison };
}

/**
 * Ce que le thème devient sur l'interface de l'APPLICATION COMPLÈTE : les jetons d'Atlas dérivés des graines que le document a données, et les refus dits (voir `application.js`).
 * @returns {{ variables: Record<string, string>, notes: string[] }}
 */
export function habillageApplication(theme) {
  if (!theme || !theme.charte) return { variables: {}, notes: [] };
  const hote = assainir(theme.charte).charte;
  return variablesApplication({ charte: resoudre({ hote }).charte, hote });
}

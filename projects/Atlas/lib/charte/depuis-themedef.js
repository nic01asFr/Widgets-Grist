/**
 * ThemeDef 1.0 -> charte d'Atlas. Module pur : aucune lecture de table, aucun réseau, aucun DOM.
 *
 * Le ThemeDef (`themedef-1.0`, spécification de Form Builder, étage B) est le document qui vit dans la table `Theme_document` du document Grist.
 * L'hôte lit la table et donne les lignes à ces fonctions, puis passe la charte à `setTheme`. La règle de lecture est la même pour tous les lecteurs :
 *  - table absente ou vide, aucune ligne active : aucun thème, sans bruit ; plusieurs lignes actives : RIEN n'est appliqué et `plusieurs-actifs` est dit ;
 *  - 50 lignes examinées au plus ; le contenu est une donnée NON FIABLE (taille, version, profondeur, clés interdites) ;
 *  - `resolu` n'est jamais cru : Atlas ne sait pas recompiler, il applique donc les valeurs résolues en le DISANT (`verifie: false`), ou, sans `resolu`,
 *    les seules graines du document (principal, secondaire, encre, fond) ; les états des graines sont ignorés, comme le dit la spécification ;
 *  - priorité : la préférence de contraste de la personne l'emporte (gérée par `resoudre`), puis ce thème posé par l'hôte.
 * Halo, lavis et plan de carte ne font pas partie du ThemeDef : Atlas les calcule.
 */
import { analyserCouleur } from './couleurs.js';
import { VERSION_CHARTE, FAMILLES_POLICE } from './schema.js';
import { charteDepuisKit, NOM_CHARTE } from './depuis-kit.js';

export const VERSION = '1.0.0';
export const VERSION_THEMEDEF = 'themedef-1.0';
export const LIMITES_THEMEDEF = Object.freeze({ octets: 16384, profondeur: 6, lignes: 50 });

const CLE_LIGNE = /^[a-z][a-z0-9-]{0,39}$/;
const INTERDITES = new Set(['__proto__', 'constructor', 'prototype']);
const GRAINES_THEMEDEF = Object.freeze({ principal: 'principal', secondaire: 'secondaire', encre: 'encre', fond: 'fond' });
const ETATS_IGNORES = Object.freeze(['ok', 'attention', 'alerte', 'info']);
const MODES = Object.freeze(['clair', 'sombre']);
const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const octets = (t) => new TextEncoder().encode(t).length;

function profondeurOk(v, niveau = 1) {
  if (niveau > LIMITES_THEMEDEF.profondeur) return false;
  if (Array.isArray(v)) return v.every((x) => profondeurOk(x, niveau + 1));
  if (estObjet(v)) return Object.keys(v).every((k) => !INTERDITES.has(k) && profondeurOk(v[k], niveau + 1));
  return true;
}

/** Valide la forme d'un ThemeDef (texte JSON ou objet). @returns {{themedef: object|null, ignore: {chemin: string, code: string, valeur: string}[]}} */
export function lireThemeDef(brut) {
  const ignore = [];
  const refuser = (chemin, code, valeur = '') => { ignore.push({ chemin, code, valeur: String(valeur).slice(0, 30) }); return { themedef: null, ignore }; };
  let doc = brut;
  if (typeof brut === 'string') {
    if (octets(brut) > LIMITES_THEMEDEF.octets) return refuser('themedef', 'taille', brut.length);
    try { doc = JSON.parse(brut); } catch (e) { return refuser('themedef', 'json-illisible'); }
  } else if (estObjet(brut)) {
    let t = Infinity; try { t = octets(JSON.stringify(brut)); } catch (e) { /* cyclique : refusé */ }
    if (t > LIMITES_THEMEDEF.octets) return refuser('themedef', 'taille', t);
  }
  if (!estObjet(doc)) return refuser('themedef', 'type', typeof doc);
  if (doc.version !== VERSION_THEMEDEF) return refuser('version', 'version-inconnue', doc.version);
  if (!profondeurOk(doc)) return refuser('themedef', 'profondeur-ou-cle-interdite');
  if (!estObjet(doc.graines) || typeof doc.graines.principal !== 'string') return refuser('graines.principal', 'absent');
  return { themedef: doc, ignore };
}

/**
 * Parmi les lignes de `Theme_document`, celle qui s'applique. @param {object[]|null|undefined} lignes  `{cle, themedef, actif}`
 * @returns {{ligne: object|null, avertissements: {code: string, nombre?: number}[]}}
 */
export function choisirThemeDefActif(lignes) {
  const avertissements = [];
  if (!Array.isArray(lignes) || !lignes.length) return { ligne: null, avertissements };
  const examinees = lignes.slice(0, LIMITES_THEMEDEF.lignes);
  if (lignes.length > examinees.length) avertissements.push({ code: 'lignes-ignorees', nombre: lignes.length - examinees.length });
  const actives = examinees.filter((l) => estObjet(l) && l.actif === true && typeof l.cle === 'string' && CLE_LIGNE.test(l.cle));
  if (actives.length > 1) { avertissements.push({ code: 'plusieurs-actifs', nombre: actives.length }); return { ligne: null, avertissements }; }
  return { ligne: actives[0] || null, avertissements };
}

/**
 * Un ThemeDef -> charte d'Atlas, pour le mode demandé. `verifie` vaut toujours false : Atlas applique les valeurs résolues sans les recompiler.
 * @param {string|object} brut  le contenu de la colonne `themedef`
 * @param {{mode?: 'clair'|'sombre'}} o
 * @returns {{charte: object|null, notes: string[], ignore: object[], verifie: false, source: 'resolu'|'graines'|null, mode: string|null}}
 */
export function charteDepuisThemeDef(brut, { mode = 'clair' } = {}) {
  const lu = lireThemeDef(brut);
  const rien = (ignore, notes = []) => ({ charte: null, notes, ignore, verifie: false, source: null, mode: null });
  if (!lu.themedef) return rien(lu.ignore);
  const doc = lu.themedef, notes = [], ignore = [...lu.ignore];
  const voulu = MODES.includes(mode) ? mode : 'clair';
  const police = doc.police !== undefined ? doc.police : (estObjet(doc.resolu) ? doc.resolu.police : undefined);
  const nom = typeof doc.nom === 'string' && doc.nom.trim() ? doc.nom.trim().slice(0, 60) : NOM_CHARTE;

  const modes = estObjet(doc.resolu) && estObjet(doc.resolu.modes) ? doc.resolu.modes : null;
  if (modes) {
    let choisi = voulu;
    if (!estObjet(modes[choisi])) {
      const autre = MODES.find((m) => estObjet(modes[m]));
      if (autre) { notes.push('mode ' + voulu + ' absent : valeurs du mode ' + autre); choisi = autre; }
      else ignore.push({ chemin: 'resolu.modes', code: 'vide', valeur: '' });
    }
    if (estObjet(modes[choisi])) {
      const r = charteDepuisKit({ valeurs: modes[choisi].valeurs, police });
      ignore.push(...r.ignore); notes.push(...r.notes, 'valeurs résolues du document, non vérifiées (Atlas ne recompile pas)');
      if (r.charte) return { charte: { ...r.charte, nom }, notes, ignore, verifie: false, source: 'resolu', mode: choisi };
    }
  }
  // sans valeurs résolues : les seules graines du document
  const graines = {};
  for (const [cle, graine] of Object.entries(GRAINES_THEMEDEF)) {
    if (!(cle in doc.graines)) continue;
    const c = analyserCouleur(doc.graines[cle]);
    if (!c || c.alpha < 1) { ignore.push({ chemin: 'graines.' + cle, code: c ? 'alpha-non-admis' : 'couleur-invalide', valeur: String(doc.graines[cle]).slice(0, 30) }); continue; }
    graines[graine] = c.hex;
  }
  for (const etat of ETATS_IGNORES) if (etat in doc.graines) ignore.push({ chemin: 'graines.' + etat, code: 'etat-ignore', valeur: '' });
  if (!Object.keys(graines).length) return rien(ignore, notes);
  const charte = { version: VERSION_CHARTE, nom, graines };
  if (typeof police === 'string' && Object.prototype.hasOwnProperty.call(FAMILLES_POLICE, police)) charte.texte = { famille: police };
  else if (police !== undefined) ignore.push({ chemin: 'police', code: 'police-non-listee', valeur: String(police).slice(0, 30) });
  notes.push('pas de valeurs résolues : graines du document seules, le reste est calculé par Atlas');
  return { charte, notes, ignore, verifie: false, source: 'graines', mode: null };
}

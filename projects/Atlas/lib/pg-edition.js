/**
 * Éditer une entité d'une couche en direct : ce que la fiche de modification saisit, ce qu'elle envoie à `pg_gateway_ecrire`.
 *
 * Module pur (ni DOM, ni réseau, ni Grist). Il ne connaît que la DÉCLARATION d'une table (réponse de
 * `pg_gateway_tables_modifiables`) et ses types Grist (`pg_gateway_table`).
 *
 * ## Les règles
 *  - seules les colonnes déclarées modifiables sont proposées ; la clé et la géométrie ne se modifient pas ici ;
 *  - on n'envoie que ce qui a changé : une colonne laissée telle quelle n'est pas écrasée par une valeur périmée ;
 *  - une saisie illisible est REFUSÉE avec sa raison, jamais convertie en silence (« abc » n'est pas 0) ;
 *  - une absence reste `null` pour un nombre, une date, un booléen ; un texte vidé reste un texte vide ;
 *  - chaque modification porte la version lue (`version_attendue`) : il n'existe pas de « forcer ». Un conflit rend la valeur
 *    actuelle ; la personne relit la ligne et recommence.
 */

export const STATUTS = Object.freeze(['ok', 'conflit', 'introuvable', 'refuse', 'erreur', 'non_applique']);

/** Les colonnes proposées à la saisie, avec leur type Grist et la valeur actuelle. */
export function champsEditables({ decl, table, valeurs = {} }) {
  const types = new Map(((table && table.colonnes) || []).map((c) => [c.nom, c.type_grist]));
  return (decl.colonnes || [])
    .filter((c) => c !== decl.geometrie)
    .map((nom) => ({ nom, type: types.get(nom) || 'Text', valeur: valeurs[nom] === undefined ? null : valeurs[nom] }));
}

/** Une valeur lue de PostgreSQL, telle qu'on la montre dans un champ de saisie. */
export function texteDeValeur(valeur, type) {
  if (valeur === null || valeur === undefined) return '';
  if (type === 'Date' || type === 'DateTime') {
    // la passerelle rend des dates ISO ou des secondes ; on montre toujours une date ISO
    const d = typeof valeur === 'number' ? new Date(valeur * 1000) : new Date(valeur);
    if (Number.isNaN(d.getTime())) return String(valeur);
    return type === 'Date' ? d.toISOString().slice(0, 10) : d.toISOString().slice(0, 19);
  }
  if (typeof valeur === 'object') return JSON.stringify(valeur);
  return String(valeur);
}

/**
 * Lire ce que la personne a tapé, selon le type de la colonne.
 * @returns {{ok:true, valeur:*} | {ok:false, erreur:string}}
 */
export function lireSaisie(type, texte) {
  const t = String(texte == null ? '' : texte).trim();
  if (type === 'Text') return { ok: true, valeur: String(texte == null ? '' : texte) };
  if (t === '') return { ok: true, valeur: null };
  if (type === 'Int') {
    return /^-?\d+$/.test(t) ? { ok: true, valeur: Number(t) } : { ok: false, erreur: 'un nombre entier est attendu' };
  }
  if (type === 'Numeric') {
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) && /^-?\d*[.,]?\d+(e-?\d+)?$/i.test(t) ? { ok: true, valeur: n } : { ok: false, erreur: 'un nombre est attendu' };
  }
  if (type === 'Bool') {
    if (['true', 'vrai', 'oui', '1'].includes(t.toLowerCase())) return { ok: true, valeur: true };
    if (['false', 'faux', 'non', '0'].includes(t.toLowerCase())) return { ok: true, valeur: false };
    return { ok: false, erreur: 'oui ou non est attendu' };
  }
  if (type === 'Date') {
    return /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t + 'T00:00:00Z')) ? { ok: true, valeur: t } : { ok: false, erreur: 'une date AAAA-MM-JJ est attendue' };
  }
  if (type === 'DateTime') {
    return /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?/.test(t) && !Number.isNaN(Date.parse(t.replace(' ', 'T') + (/[zZ]|[+-]\d{2}:?\d{2}$/.test(t) ? '' : 'Z')))
      ? { ok: true, valeur: t.replace(' ', 'T') } : { ok: false, erreur: 'une date et une heure AAAA-MM-JJ HH:MM sont attendues' };
  }
  return { ok: true, valeur: String(texte) }; // type inconnu : texte, la passerelle jugera
}

const egal = (a, b) => (a === b) || (a != null && b != null && typeof a === 'object' && JSON.stringify(a) === JSON.stringify(b));

/**
 * Ce qui a changé entre la ligne lue et la saisie. `saisies` : `{colonne: texte}` ; une colonne absente n'a pas été touchée.
 * @returns {{valeurs: object, erreurs: Object<string,string>}}
 */
export function valeursModifiees(champs, saisies) {
  const valeurs = {};
  const erreurs = {};
  for (const c of champs) {
    if (!(c.nom in saisies)) continue;
    const lu = lireSaisie(c.type, saisies[c.nom]);
    if (!lu.ok) { erreurs[c.nom] = lu.erreur; continue; }
    const avant = c.valeur;
    // « vide » et « absent » sont la même chose pour un champ de saisie (sauf texte : voir lireSaisie)
    const memeAbsence = lu.valeur === null && (avant === null || avant === undefined);
    const memeTexte = c.type !== 'Text' && lu.valeur !== null && texteDeValeur(avant, c.type) === texteDeValeur(lu.valeur, c.type);
    const memeTexteBrut = c.type === 'Text' && ((avant == null ? '' : String(avant)) === lu.valeur);
    if (memeAbsence || memeTexte || memeTexteBrut || egal(avant, lu.valeur)) continue;
    valeurs[c.nom] = lu.valeur;
  }
  return { valeurs, erreurs };
}

/** Les opérations, dans la forme de `pg_gateway_ecrire`. */
export const operationModifier = (cle, version, valeurs) => ({ op: 'modifier', cle, valeurs, version_attendue: version });
export const operationInserer = (valeurs) => ({ op: 'inserer', valeurs });
export const operationEtat = (op, cle, version) => ({ op, cle, version_attendue: version });

/** Un point GeoJSON à partir de la carte (centre de la vue). */
export const pointGeoJSON = (lng, lat) => ({ type: 'Point', coordinates: [Math.round(lng * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7] });

/** Ce que la fiche propose pour cette table : seulement ce que la déclaration ouvre. */
export function droitsFiche(decl) {
  const ops = new Set(decl.operations || []);
  return {
    modifier: ops.has('modifier'),
    inserer: ops.has('inserer'),
    desactiver: ops.has('desactiver'),
    reactiver: ops.has('reactiver'),
    supprimer: ops.has('supprimer'),
  };
}

/** Peut-on poser une nouvelle entité ? Une table sans géométrie, ou à géométrie ponctuelle (posée au centre de la carte). */
export function insertionPossible(decl, typeGeometrie) {
  if (!droitsFiche(decl).inserer) return { ok: false, raison: 'La déclaration n’ouvre pas l’insertion sur cette table.' };
  if (!decl.geometrie) return { ok: true, geometrie: null };
  if (typeGeometrie === 'Point') return { ok: true, geometrie: 'point' };
  return { ok: false, raison: 'Cette table porte des lignes ou des surfaces : leur tracé ne se saisit pas encore ici.' };
}

/**
 * Le résultat d'une écriture d'une seule opération, dit à la personne.
 * @returns {{ok:boolean, statut:string, message:string, conflit?:{version:*, valeurs:object}}}
 */
export function interpreter(reponse) {
  const r = reponse && Array.isArray(reponse.resultats) ? reponse.resultats[0] : null;
  if (!r) return { ok: false, statut: 'erreur', message: 'La passerelle n’a rien répondu pour cette écriture.' };
  if (r.statut === 'ok') return { ok: true, statut: 'ok', message: 'Enregistré dans PostgreSQL.', version: r.version, valeurs: r.valeurs };
  if (r.statut === 'conflit') {
    return {
      ok: false, statut: 'conflit',
      message: 'La ligne a été modifiée par quelqu’un d’autre depuis que vous l’avez ouverte. Rien n’a été écrit : relisez-la, puis refaites votre modification.',
      conflit: { version: r.version_actuelle, valeurs: r.valeurs_actuelles || {} },
    };
  }
  if (r.statut === 'introuvable') return { ok: false, statut: 'introuvable', message: 'La ligne n’existe plus dans PostgreSQL.' };
  const detail = [r.code, r.message].filter(Boolean).join(' : ');
  return { ok: false, statut: r.statut || 'erreur', message: `Écriture refusée${detail ? ` (${detail})` : ''}.` };
}

/** La clé d'une entité de la carte, d'après ses propriétés ; `null` si elle n'y est pas toute. */
export function cleDeFeature(decl, feature) {
  const p = (feature && feature.properties) || {};
  const cle = {};
  for (const c of decl.cle) {
    if (p[c] === undefined || p[c] === null) return null;
    cle[c] = p[c];
  }
  return cle;
}

/**
 * La clé tapée à la main (choisir une entité sans la souris). Chaque colonne de la clé est lue selon son type ; une clé
 * incomplète ou illisible est refusée avec sa raison.
 * @param {object} decl
 * @param {{colonnes?: {nom:string, type_grist:string}[]}} table
 * @param {Object<string,string>} saisies  `{colonne: texte}`
 * @returns {{ok:true, cle:object} | {ok:false, erreur:string}}
 */
export function lireCle(decl, table, saisies) {
  const types = new Map(((table && table.colonnes) || []).map((c) => [c.nom, c.type_grist]));
  const cle = {};
  for (const c of decl.cle) {
    const texte = String((saisies || {})[c] == null ? '' : saisies[c]).trim();
    if (texte === '') return { ok: false, erreur: `la colonne « ${c} » de la clé est à renseigner` };
    const lu = lireSaisie(types.get(c) || 'Text', texte);
    if (!lu.ok) return { ok: false, erreur: `${c} : ${lu.erreur}` };
    cle[c] = lu.valeur;
  }
  return { ok: true, cle };
}

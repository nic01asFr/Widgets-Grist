/**
 * Synchroniser une table Grist avec une table PostgreSQL, par comparaison à trois états.
 *
 * Module PUR : ni Grist, ni réseau, ni DOM. Il compare, il planifie, il ne fait rien. Les lectures et les écritures sont dans
 * `pg-sync-session.js`, qui reçoit leurs dépendances.
 *
 * ## Les trois états
 * Pour chaque clé PostgreSQL :
 *  - **Grist maintenant** : la ligne de la table Grist, avec le hachage de ses valeurs ;
 *  - **PostgreSQL maintenant** : la ligne lue par `pg_gateway_lire`, avec sa version ;
 *  - **vu** : ce que les deux valaient à la dernière synchronisation (`Atlas_PgSync` : version PostgreSQL et hachage Grist vus).
 *
 * On ne compare JAMAIS une valeur Grist à une valeur PostgreSQL (dates en secondes d'un côté, ISO de l'autre, géométries,
 * nombres) : chaque côté est comparé à SON propre « vu ». Un côté a changé quand son état maintenant diffère de son vu.
 *
 * | Grist | PostgreSQL | Résultat |
 * |---|---|---|
 * | ligne sans clé, ou clé inconnue de PostgreSQL | — | **à pousser** (insertion) |
 * | changée | inchangée | **à pousser** (modification) |
 * | inchangée | changée | **à tirer** |
 * | changée | changée | **conflit** |
 * | supprimée | inchangée | **à pousser** (désactivation ou suppression, selon la déclaration de la table) |
 * | inchangée | supprimée ou désactivée | **à tirer** (la ligne Grist disparaît) |
 * | nouvelle (absente de Grist) | — | **à tirer** (insertion dans Grist) |
 *
 * Une absence de référence (« vu » manquant alors que les deux côtés ont la ligne) est un conflit : on ne devine pas.
 * **Aucun conflit n'est résolu sans choix** (`planifier` refuse tant qu'il en reste), et aucun choix n'est « par défaut ».
 */

export const TABLE_SYNC = 'Atlas_PgSync';

/** Les colonnes de `Atlas_PgSync` : la mémoire de ce qu'on avait vu à la dernière synchronisation. */
export const COLONNES_SYNC = Object.freeze([
  Object.freeze({ id: 'table_grist', type: 'Text', label: 'table_grist' }),
  Object.freeze({ id: 'cle_pg', type: 'Text', label: 'cle_pg' }),
  Object.freeze({ id: 'ligne_grist', type: 'Int', label: 'ligne_grist' }),
  Object.freeze({ id: 'version_pg_vue', type: 'Text', label: 'version_pg_vue' }),
  Object.freeze({ id: 'hachage_grist_vu', type: 'Text', label: 'hachage_grist_vu' }),
]);

export const NATURES_CONFLIT = Object.freeze({
  modifie_des_deux_cotes: 'Modifiée dans Grist et dans PostgreSQL',
  modifie_grist_supprime_pg: 'Modifiée dans Grist, supprimée ou désactivée dans PostgreSQL',
  supprime_grist_modifie_pg: 'Supprimée dans Grist, modifiée dans PostgreSQL',
  sans_reference: 'Présente des deux côtés sans référence commune (jamais synchronisée)',
});

/**
 * La clé sous une forme comparable : mêmes colonnes, mêmes valeurs, ordre des colonnes sans importance. Toute valeur est lue
 * comme du texte : PostgreSQL rend un entier hors précision JavaScript en texte, Grist le garde en nombre, et « 12 » doit
 * être la même clé que 12.
 */
export function cleCanon(cle) {
  if (cle == null || typeof cle !== 'object') return null;
  const ordonnee = {};
  for (const k of Object.keys(cle).sort()) ordonnee[k] = cle[k] == null ? null : String(cle[k]);
  return JSON.stringify(ordonnee);
}

/** Une clé est exploitable si toutes ses colonnes sont renseignées. */
export function cleComplete(cle, colonnesCle) {
  return cle != null && colonnesCle.every((c) => cle[c] !== null && cle[c] !== undefined && cle[c] !== '');
}

/**
 * Hachage de détection de changement (cyrb53, 53 bits) : il dit « ça a bougé », il ne protège rien. Deux écritures identiques
 * donnent le même hachage, quel que soit l'ordre des clés d'un objet.
 */
export function hacher(valeur) {
  const texte = JSON.stringify(valeur, (_, v) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texte.length; i++) {
    const c = texte.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/**
 * La configuration d'une copie synchronisable (portée par `style._pg`, `genre: 'copie'`).
 *
 * @typedef {object} ConfigCopie
 * @property {'copie'} genre
 * @property {string} url  adresse de la passerelle (jamais le jeton)
 * @property {string} connexion
 * @property {string} schema
 * @property {string} table
 * @property {string} tableGrist  la table Grist de la copie
 * @property {{pg: string, grist: string, type: string}[]} cles  colonnes de la clé primaire
 * @property {{pg: string, grist: string, type: string}[]} colonnes  colonnes modifiables (hors géométrie)
 * @property {null | {pg: string, mode: 'json', grist: string} | {pg: string, mode: 'point', lat: string, lng: string}} geometrie
 * @property {'interdite'|'reelle'|string} suppression  « etat:<colonne> » : désactivation logique
 * @property {'colonne'|'hachage'} version
 */

/** Les colonnes Grist dont la valeur compte pour détecter un changement (hors clé, hors centroïdes dérivés). */
export function colonnesSuivies(config) {
  const cols = config.colonnes.map((c) => c.grist);
  const g = config.geometrie;
  if (g) cols.push(...(g.mode === 'point' ? [g.lat, g.lng] : [g.grist]));
  return cols;
}

/** Le hachage d'une ligne Grist (valeurs natives de Grist, telles que `fetchTable` les rend). */
export function hachageGrist(config, ligne) {
  return hacher(colonnesSuivies(config).map((c) => (ligne[c] === undefined ? null : ligne[c])));
}

/**
 * La clé PostgreSQL d'une ligne Grist, ou `null` si une colonne de clé n'est pas renseignée (ligne nouvelle).
 *
 * Une cellule vide d'une colonne `Int` ou `Numeric` vaut **0** dans Grist : un 0 en clé est donc lu « pas de clé » (les clés
 * générées par PostgreSQL commencent à 1). Une table dont une vraie clé vaut 0 ne peut pas se synchroniser.
 */
export function cleDeLigneGrist(config, ligne) {
  const cle = {};
  for (const c of config.cles) {
    const v = ligne[c.grist];
    const numerique = c.type === 'Int' || c.type === 'Numeric';
    if (v === null || v === undefined || v === '' || (numerique && v === 0)) return null;
    cle[c.pg] = v;
  }
  return cle;
}

/** Les valeurs d'une ligne Grist, prêtes pour `pg_gateway_ecrire` (valeurs JSON de la convention de lecture, à l'envers). */
export function valeursPourPg(config, ligne) {
  const valeurs = {};
  for (const c of config.colonnes) valeurs[c.pg] = ligne[c.grist] === undefined ? null : ligne[c.grist];
  const g = config.geometrie;
  if (g) {
    if (g.mode === 'point') {
      const lat = ligne[g.lat];
      const lng = ligne[g.lng];
      valeurs[g.pg] = Number.isFinite(lat) && Number.isFinite(lng) ? { type: 'Point', coordinates: [lng, lat] } : null;
    } else {
      const texte = ligne[g.grist];
      valeurs[g.pg] = texte === null || texte === undefined || texte === '' ? null : texte;
    }
  }
  return valeurs;
}

function suppressionPossible(config) {
  return config.suppression === 'reelle' || String(config.suppression).startsWith('etat:');
}

/**
 * La comparaison à trois états.
 *
 * @param {ConfigCopie} config
 * @param {{
 *   gristLignes: {ligne: number, cle: object|null, hachage: string}[],
 *   pgLignes: {cle: object, version: string|number, actif?: boolean}[],
 *   snapshots: {cle: object, ligne?: number, version: string|number, hachage: string}[]
 * }} etats
 */
export function calculerEcarts(config, { gristLignes, pgLignes, snapshots }) {
  const G = new Map();
  const doublons = [];
  const nouvelles = [];
  for (const g of gristLignes) {
    if (!cleComplete(g.cle, config.cles.map((c) => c.pg))) { nouvelles.push(g); continue; }
    const k = cleCanon(g.cle);
    if (G.has(k)) { doublons.push({ cleCanon: k, cle: g.cle, lignes: [G.get(k).ligne, g.ligne] }); continue; }
    G.set(k, g);
  }
  const P = new Map(pgLignes.map((p) => [cleCanon(p.cle), p]));
  const S = new Map(snapshots.map((s) => [cleCanon(s.cle), s]));

  const r = { identiques: 0, aPousser: [], aTirer: [], conflits: [], nettoyage: [], impossibles: [], doublons, nouvelles: nouvelles.length };
  let n = 0;
  const conflit = (nature, k, g, p, s) => r.conflits.push({ id: `c${++n}`, nature, cleCanon: k, cle: (g || p || s).cle, ligne: g ? g.ligne : null, version_pg: p ? p.version : null, pgDesactive: !!p && p.actif === false });

  for (const g of nouvelles) r.aPousser.push({ action: 'inserer', cleCanon: null, cle: null, ligne: g.ligne });

  const cles = new Set([...G.keys(), ...P.keys(), ...S.keys()]);
  for (const k of cles) {
    const g = G.get(k);
    const p = P.get(k);
    const s = S.get(k);
    const pEff = p && p.actif !== false ? p : null; // une ligne désactivée dans PostgreSQL compte comme supprimée
    const gChange = g && s ? g.hachage !== s.hachage : null;
    const pChange = pEff && s ? String(pEff.version) !== String(s.version) : null;

    if (g && pEff) {
      if (!s) { conflit('sans_reference', k, g, p, s); continue; }
      if (!gChange && !pChange) r.identiques++;
      else if (gChange && !pChange) r.aPousser.push({ action: 'modifier', cleCanon: k, cle: g.cle, ligne: g.ligne, version_attendue: pEff.version });
      else if (!gChange && pChange) r.aTirer.push({ action: 'modifier', cleCanon: k, cle: pEff.cle, ligne: g.ligne, version: pEff.version });
      else conflit('modifie_des_deux_cotes', k, g, p, s);
    } else if (g && !pEff) {
      if (!s) {
        if (p) conflit('sans_reference', k, g, p, s); // présente mais désactivée dans PostgreSQL, jamais vue
        else r.aPousser.push({ action: 'inserer', cleCanon: k, cle: g.cle, ligne: g.ligne }); // clé saisie à la main, inconnue de PostgreSQL
      } else if (gChange) conflit('modifie_grist_supprime_pg', k, g, p, s);
      else r.aTirer.push({ action: 'supprimer', cleCanon: k, cle: g.cle, ligne: g.ligne });
    } else if (!g && pEff) {
      if (!s) r.aTirer.push({ action: 'inserer', cleCanon: k, cle: pEff.cle, ligne: null, version: pEff.version });
      else if (pChange) conflit('supprime_grist_modifie_pg', k, g, p, s);
      else if (suppressionPossible(config)) r.aPousser.push({ action: String(config.suppression).startsWith('etat:') ? 'desactiver' : 'supprimer', cleCanon: k, cle: pEff.cle, ligne: s.ligne ?? null, version_attendue: pEff.version });
      else r.impossibles.push({ cleCanon: k, cle: pEff.cle, raison: 'Ligne supprimée dans Grist, mais cette table n\'autorise pas la suppression : elle reste dans PostgreSQL.' });
    } else if (s) {
      r.nettoyage.push(k); // disparue des deux côtés
    }
  }
  return r;
}

export const CHOIX = Object.freeze(['pg', 'grist', 'ignorer']);

/**
 * Le plan d'application, une fois les conflits tranchés. Rend `pret: false` tant qu'un conflit n'a pas de choix (« toujours
 * demander » : il n'y a pas de règle par défaut).
 *
 * @param {ConfigCopie} config
 * @param {ReturnType<typeof calculerEcarts>} ecarts
 * @param {Record<string, 'pg'|'grist'|'ignorer'>} choix  par identifiant de conflit
 */
export function planifier(config, ecarts, choix = {}) {
  const sansChoix = ecarts.conflits.filter((c) => !CHOIX.includes(choix[c.id])).map((c) => c.id);
  const plan = { pret: sansChoix.length === 0 && ecarts.doublons.length === 0, sansChoix, doublons: ecarts.doublons, push: [], pull: [], ignores: [] };
  if (!plan.pret) return plan;

  plan.push.push(...ecarts.aPousser);
  plan.pull.push(...ecarts.aTirer);
  for (const c of ecarts.conflits) {
    const ch = choix[c.id];
    if (ch === 'ignorer') { plan.ignores.push(c); continue; }
    if (ch === 'pg') {
      // PostgreSQL gagne : la ligne Grist prend la valeur de PostgreSQL (ou disparaît s'il l'a supprimée).
      if (c.nature === 'modifie_grist_supprime_pg') plan.pull.push({ action: 'supprimer', cleCanon: c.cleCanon, cle: c.cle, ligne: c.ligne });
      else if (c.nature === 'supprime_grist_modifie_pg') plan.pull.push({ action: 'inserer', cleCanon: c.cleCanon, cle: c.cle, ligne: null, version: c.version_pg });
      else plan.pull.push({ action: 'modifier', cleCanon: c.cleCanon, cle: c.cle, ligne: c.ligne, version: c.version_pg });
    } else {
      // Grist gagne : on écrit dans PostgreSQL, avec la version que la comparaison vient de lire (jamais à l'aveugle).
      if (c.nature === 'supprime_grist_modifie_pg') {
        plan.push.push({ action: String(config.suppression).startsWith('etat:') ? 'desactiver' : 'supprimer', cleCanon: c.cleCanon, cle: c.cle, ligne: null, version_attendue: c.version_pg });
      } else if (c.nature === 'modifie_grist_supprime_pg') {
        plan.push.push(c.pgDesactive
          ? { action: 'reactiver_puis_modifier', cleCanon: c.cleCanon, cle: c.cle, ligne: c.ligne, version_attendue: c.version_pg }
          : { action: 'inserer', cleCanon: c.cleCanon, cle: c.cle, ligne: c.ligne });
      } else {
        plan.push.push({ action: 'modifier', cleCanon: c.cleCanon, cle: c.cle, ligne: c.ligne, version_attendue: c.version_pg });
      }
    }
  }
  return plan;
}

/** Un résumé lisible, pour le panneau et les messages. */
export function resumer(ecarts, plan = null) {
  const compte = (liste, action) => liste.filter((x) => x.action === action).length;
  return {
    identiques: ecarts.identiques,
    aPousser: ecarts.aPousser.length,
    aTirer: ecarts.aTirer.length,
    conflits: ecarts.conflits.length,
    nouvelles: ecarts.nouvelles,
    impossibles: ecarts.impossibles.length,
    insertions: compte(ecarts.aPousser, 'inserer'),
    modifications: compte(ecarts.aPousser, 'modifier'),
    desactivations: compte(ecarts.aPousser, 'desactiver') + compte(ecarts.aPousser, 'supprimer'),
    ...(plan ? { pret: plan.pret, sansChoix: plan.sansChoix.length } : {}),
  };
}

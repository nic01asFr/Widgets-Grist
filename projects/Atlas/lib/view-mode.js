/**
 * Mode lecture Atlas — parse URL + intent d'accès Grist + garde écriture.
 * Spec : docs/superpowers/specs/2026-07-30-atlas-view-mobile-design.md
 */

/**
 * @param {string} [search] location.search (avec ou sans « ? »)
 * @returns {'view'|'edit'|'auto'}
 */
export function parseAtlasMode(search = '') {
  const q = String(search || '').replace(/^\?/, '');
  const params = new URLSearchParams(q);
  const raw = (params.get('mode') || '').trim().toLowerCase();
  if (raw === 'view' || raw === 'lecture' || raw === 'read') return 'view';
  if (raw === 'edit' || raw === 'edition' || raw === 'édition') return 'edit';
  return 'auto';
}

/**
 * Droits transmis par Grist dans l'URL du widget.
 *
 * Grist construit lui-même l'adresse de l'iframe et y place les droits réels de
 * la personne sur le document : `?access=full&readonly=false&…`. C'est la seule
 * source fiable — `?mode=` est écrit par qui ouvre la page.
 *
 * @param {string} [search] location.search
 * @returns {{ readonly: boolean|null, access: string|null }} null = non transmis
 */
export function gristGrantFromSearch(search = '') {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const ro = params.get('readonly');
  const access = (params.get('access') || '').trim().toLowerCase() || null;
  return {
    readonly: ro == null ? null : /^(1|true|yes)$/i.test(ro.trim()),
    access,
  };
}

/**
 * Mode d'ouverture : **les droits Grist font autorité**.
 *
 * `?mode=` ne peut que **restreindre** — un éditeur peut demander à prévisualiser
 * en lecture, personne ne peut s'octroyer l'écriture par l'URL. Quand Grist ne
 * transmet rien (widget ouvert hors Grist, version ancienne), on retombe sur
 * l'intention et la sonde d'écriture.
 *
 * @param {{search?: string, mode?: 'view'|'edit'|'auto'}} opts
 * @returns {{ viewMode: boolean, requiredAccess: 'full'|'read table', needsProbe: boolean, reason: string }}
 */
export function resolveAccess({ search = '', mode } = {}) {
  const wanted = mode || parseAtlasMode(search);
  const grant = gristGrantFromSearch(search);

  // Droits insuffisants côté Grist : lecture, sans discussion ni sonde.
  if (grant.readonly === true || grant.access === 'none' || grant.access === 'read table') {
    return { viewMode: true, requiredAccess: 'read table', needsProbe: false, reason: 'grist-readonly' };
  }
  // L'utilisateur demande la lecture alors qu'il pourrait écrire : on respecte.
  //
  // > **Mais `?mode=` décrit ce qu'on MONTRE, pas ce qu'on PEUT.** Le widget
  // > garde donc le niveau d'accès que le document lui a accordé. Demander
  // > `read table` fermait l'écriture **au widget lui-même**, avant tout examen
  // > des droits de la personne : la sonde échouait alors pour une raison qui
  // > n'avait rien à voir avec elle, et un formulaire publié restait
  // > insaisissable même par un éditeur. C'est le lien de terrain qui en
  // > dépend — lecture à l'écran, saisie possible dans le formulaire.
  //
  // `viewMode` reste vrai : Atlas ne montre aucun outil d'auteur. Les deux
  // réglages sont orthogonaux, et c'est le fond de l'affaire.
  if (wanted === 'view') {
    const accorde = grant.readonly === false && grant.access === 'full' ? 'full' : 'read table';
    return { viewMode: true, requiredAccess: accorde, needsProbe: false, reason: 'mode-view' };
  }
  // Grist annonce l'ecriture — mais `access` decrit le niveau accorde AU WIDGET
  // (le reglage « Niveau d'acces » de la vue), pas les droits de la personne sur
  // le document. Les ACL s'appliquent par-dessus, cote sandbox. Verifie en
  // simulant un lecteur (`aclAsUser_=viewer@example.com`) : l'iframe recoit
  // toujours `access=full&readonly=false`, et Atlas ouvrait donc l'edition a
  // quelqu'un qui n'a pas le droit d'ecrire.
  //
  // On ne peut pas conclure ici : seule la sonde d'ecriture dit vrai. Elle ne
  // force la lecture que sur une erreur ACL franche, donc un editeur n'est
  // jamais bloque a tort.
  if (grant.readonly === false && grant.access === 'full') {
    return { viewMode: false, requiredAccess: 'full', needsProbe: true, reason: 'grist-full-a-sonder' };
  }
  // Rien de transmis : ancien comportement — tenter, puis sonder.
  return { viewMode: false, requiredAccess: 'full', needsProbe: true, reason: 'probe' };
}

/**
 * @param {'view'|'edit'|'auto'} mode
 * @returns {{ viewModeForced: boolean, preferFull: boolean, requiredAccess: 'full'|'read table' }}
 */
export function accessIntentFromMode(mode) {
  if (mode === 'view') {
    return { viewModeForced: true, preferFull: false, requiredAccess: 'read table' };
  }
  if (mode === 'edit') {
    return { viewModeForced: false, preferFull: true, requiredAccess: 'full' };
  }
  return { viewModeForced: false, preferFull: true, requiredAccess: 'full' };
}

/**
 * Charge utile d'un jeton d'accès Grist.
 *
 * Un JWT encode ses segments en **base64url** : `atob` attend du base64
 * standard et échoue dès qu'apparaît un `-` ou un `_`. La conversion n'est pas
 * cosmétique — sans elle, l'identification tombe silencieusement.
 *
 * @param {string} token
 * @returns {object|null}
 */
export function decodeAccessToken(token) {
  const seg = String(token || '').split('.');
  if (seg.length !== 3) return null;
  try {
    const b64 = seg[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')));
  } catch (_) {
    return null;
  }
}

/**
 * Initiales d'affichage. Gère « Quentin Leroy » comme « nicolas.laval »,
 * et retombe sur l'email quand le nom manque.
 *
 * @returns {string|null} une ou deux lettres majuscules
 */
export function initialsFrom(name, email) {
  const source = String(name || '').trim() || String(email || '').split('@')[0] || '';
  const mots = source.split(/[\s._-]+/).filter(Boolean);
  if (!mots.length) return null;
  const lettres = (mots.length >= 2 ? [mots[0], mots[1]] : [mots[0]])
    .map((m) => m[0])
    .join('');
  return lettres.toUpperCase().slice(0, 2) || null;
}

/** @param {boolean} viewMode */
export function canWrite(viewMode) {
  return !viewMode;
}

/**
 * Erreur ACL / viewer Grist (doc public view-only, droits lecture).
 * @param {unknown} err
 */
export function isWriteAclError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  if (!msg) return false;
  // Le libelle que Grist renvoie REELLEMENT quand une regle d'acces bloque une
  // ecriture est « Blocked by table update access rules » (403) — mesure sur le
  // document de test avec `aclAsUser_`. Ni « blocked » ni « access rules »
  // n'etaient dans le motif : la sonde concluait a l'ecriture et Atlas ouvrait
  // l'edition a un lecteur. Les variantes couvrent table / row / column et
  // update / create / remove.
  // `not authorized` / `unauthorized` manquaient aussi, pour les refus AUTH.
  return /view[\s-]?only|read[\s-]?only|cannot modify|not allowed|not authori[sz]ed|unauthori[sz]ed|blocked by|access rules|permission|denied|forbidden|acl|access (is )?denied|insufficient|no write|écriture|lecture seule/.test(msg);
}

const PROBE_ROW_ID = 999999999;
const PROBE_TABLE_PREF = ['Atlas_LayerPrefs', 'Atlas_Story', 'SceneManifest', 'Maquette_Layers'];

/**
 * Table métier pour la sonde (évite `_Grist_*` : UpdateRecord y échoue même pour un admin).
 * @param {{ listTables?: Function }} docApi
 * @returns {Promise<string>}
 */
export async function resolveProbeTableId(docApi) {
  if (docApi && typeof docApi.listTables === 'function') {
    try {
      const tables = await docApi.listTables();
      const list = Array.isArray(tables) ? tables : [];
      const preferred = PROBE_TABLE_PREF.find((t) => list.includes(t));
      if (preferred) return preferred;
      const any = list.find((t) => t && !String(t).startsWith('_'));
      if (any) return any;
    } catch (_) { /* ignore */ }
  }
  return 'SceneManifest';
}

/**
 * Sonde : le compte courant peut-il muter le doc ?
 * `grist.ready({ requiredAccess: 'full' })` ne suffit pas — le widget peut être
 * « Full » au niveau section alors que l’utilisateur public est viewer-only ;
 * et le chemin Scene Manifest ne tente aucune écriture au boot.
 *
 * Politique : forcer lecture seulement sur erreur ACL claire.
 * Autres erreurs (row missing, table inconnue, metadata) → writable
 * (un admin ne doit pas rester bloqué en Lecture).
 *
 * @param {{ applyUserActions?: Function, listTables?: Function }} docApi
 * @returns {Promise<boolean>}
 */
export async function probeCanWriteDoc(docApi) {
  if (!docApi || typeof docApi.applyUserActions !== 'function') return false;
  const tableId = await resolveProbeTableId(docApi);
  try {
    // UpdateRecord sur row inexistante :
    // - ACL viewer → erreur droits → lecture
    // - éditeur → « not found » / invalid row → writable
    await docApi.applyUserActions([['UpdateRecord', tableId, PROBE_ROW_ID, {}]]);
    return true;
  } catch (e) {
    if (isWriteAclError(e)) return false;
    const msg = String(e?.message || e || '').toLowerCase();
    if (/not found|does not exist|no such|invalid|unknown row|row id|missing|no record/.test(msg)) {
      return true;
    }
    if (/metadata|cannot yet|internal table|_grist/.test(msg)) return true;
    if (/unknown table|no such table|table .*not found/.test(msg)) return true;
    // Doute après ready(full) : privilégier édition (admin) — ACL doit matcher isWriteAclError
    return true;
  }
}

/**
 * @param {{ viewMode?: boolean, no3dParam?: boolean, isNarrow?: boolean, hardwareConcurrency?: number }} opts
 */
export function shouldEnableLight3d(opts = {}) {
  if (opts.no3dParam) return true;
  const cores = Number(opts.hardwareConcurrency);
  if (opts.isNarrow && Number.isFinite(cores) && cores > 0 && cores <= 4) return true;
  if (opts.viewMode && opts.isNarrow) return true;
  return false;
}

/**
 * Lit ?no3d=1 depuis search.
 * @param {string} [search]
 */
export function parseNo3dParam(search = '') {
  const q = String(search || '').replace(/^\?/, '');
  const v = new URLSearchParams(q).get('no3d');
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * `?navbar=false` retire la barre du haut.
 *
 * Pour une intégration en cadre — une page qui a déjà son propre titre et sa
 * propre navigation —, la barre d'Atlas fait doublon : elle répète le nom du
 * projet que la page hôte affiche, et ajoute une hauteur qu'on ne récupère pas.
 *
 * > **Le défaut est `true`, et le paramètre ne peut que RETIRER.** Une valeur
 * > absente, vide ou incomprise laisse la barre : se tromper vers le bas
 * > masquerait la recherche, le badge de droits et le bouton « Récit » — seul
 * > point d'entrée d'un récit publié une fois le rail parti — sans que rien ne
 * > dise pourquoi. On ne fait donc disparaître que sur une demande explicite.
 *
 * @param {string} [search] location.search
 * @returns {boolean} vrai quand la barre doit être montrée
 */
export function parseNavbarParam(search = '') {
  const q = String(search || '').replace(/^\?/, '');
  const v = new URLSearchParams(q).get('navbar');
  if (v == null) return true;
  const n = v.trim().toLowerCase();
  return !(n === 'false' || n === '0' || n === 'no' || n === 'non');
}

/**
 * Faut-il une pastille « Récit » sur la carte ?
 *
 * En lecture, le seul point d'entrée d'un récit publié est le bouton de la
 * barre du haut — le rail d'auteur est retiré. `?navbar=false` emporte donc ce
 * bouton, et une fois le récit fermé il n'existait **plus aucun moyen de le
 * rouvrir**. Constaté le 10/09/2026 dans la configuration exacte que la vitrine
 * publique utilise : `?scene=` + `?navbar=false`.
 *
 * La pastille ne paraît que dans ce cas précis. Avec la barre, son bouton
 * existe déjà, et deux boutons pour le même geste en font un de trop ; en
 * édition, le module Récit du rail en tient lieu ; pendant la lecture, la bulle
 * porte déjà la navigation.
 *
 * @param {{barreAbsente?: boolean, lecture?: boolean, nbEtapes?: number, enPresentation?: boolean}} etat
 */
export function pastilleRecitRequise({ barreAbsente, lecture, nbEtapes, enPresentation } = {}) {
  return !!barreAbsente && !!lecture && Number(nbEtapes) > 0 && !enPresentation;
}

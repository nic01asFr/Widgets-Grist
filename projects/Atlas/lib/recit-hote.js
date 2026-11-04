/**
 * Le récit d'Atlas, piloté par la page hôte (commandes `getRecit` et `goToStep`, événement `step`, contrat 0.8) : un guide vivant fait avancer la carte étape par étape et
 * garde, pour chaque étape, la figure qu'elle donne (avec `captureImage`).
 *
 * Module pur : il lit la liste des étapes (`Atlas_Story`) et en tire ce que l'hôte a le droit de voir ; il ne touche ni à la carte ni au document. Le récit n'existe que dans
 * l'application (profil complet) : la carte nue répond `capacite_absente`.
 *
 * Les étapes du récit sont celles qui ne sont pas des CONTEXTES de travail (lib/contextes.js : une étape marquée `usage.contexte` se joue à part, hors séquence). Chaque étape se
 * désigne par sa CLÉ stable (elle survit aux réordonnancements), ou par son rang dans la séquence (0 = la première).
 */
export const VERSION = '1.0.0';

export const TEXTE_MAX = 4000;
export const TITRE_MAX = 200;
export const DELAI_DEFAUT_MS = 15000;
export const DELAI_MAX_MS = 60000;

const fini = (v) => typeof v === 'number' && Number.isFinite(v);
const coupe = (t, n) => (typeof t === 'string' ? (t.length > n ? t.slice(0, n) : t) : '');
const estContexte = (e) => !!(e && e.state && typeof e.state === 'object' && e.state.usage && typeof e.state.usage === 'object' && e.state.usage.contexte === true);

/** La caméra d'une étape telle qu'on la rend à l'hôte (même forme que `getCamera` pour les champs communs), ou null. */
function cameraDe(etat) {
  const c = etat && etat.camera;
  if (!c || !fini(c.lng) || !fini(c.lat)) return null;
  const r = (v, n) => Math.round(v * 10 ** n) / 10 ** n;
  return { center: [r(c.lng, 6), r(c.lat, 6)], zoom: fini(c.zoom) ? r(c.zoom, 2) : null, pitch: fini(c.pitch) ? r(c.pitch, 1) : 0, bearing: fini(c.bearing) ? r(c.bearing, 1) : 0 };
}

/** Les étapes du RÉCIT (hors contextes), avec leur place dans la liste complète de `Atlas_Story`. */
export function etapesDuRecit(story) {
  const sortie = [];
  (Array.isArray(story) ? story : []).forEach((e, indexSource) => { if (e && typeof e === 'object' && !estContexte(e)) sortie.push({ e, indexSource }); });
  return sortie;
}

/**
 * Ce que rend `getRecit`.
 * @param {object[]} story  `STATE.story` : `{ cle?, title, text, state }`
 * @param {{ courant: (number|null), lecture: boolean }} etat  `courant` : l'index dans la LISTE COMPLÈTE de l'étape jouée, ou null
 * @returns {{ lecture:boolean, total:number, courant:(number|null), cle_courante:(string|null), etapes:object[] }}
 */
export function resumerRecit(story, etat = {}) {
  const etapes = etapesDuRecit(story).map(({ e, indexSource }, rang) => ({
    index: rang,
    cle: typeof e.cle === 'string' && e.cle ? e.cle : null,
    titre: coupe(e.title, TITRE_MAX),
    texte: coupe(e.text, TEXTE_MAX),
    camera: cameraDe(e.state),
    couches: Array.isArray(e.state && e.state.layers) ? e.state.layers.filter((l) => l && l.visible !== false).map((l) => String(l.sourceTable || l.id || l.name || '')).filter(Boolean).slice(0, 100) : [],
    _source: indexSource,
  }));
  const jouee = etat.lecture && fini(etat.courant) ? etapes.find((x) => x._source === etat.courant) : null;
  return {
    lecture: !!(etat.lecture && jouee),
    total: etapes.length,
    courant: jouee ? jouee.index : null,
    cle_courante: jouee ? jouee.cle : null,
    etapes: etapes.map(({ _source, ...reste }) => reste),
  };
}

/**
 * L'étape visée par `goToStep`, vérifiée : une clé (texte) ou un rang (entier, 0 = la première étape du récit).
 * @returns {{ index:number, indexSource:number, cle:(string|null), titre:string }}  `index` : rang dans le récit ; `indexSource` : place dans `Atlas_Story`
 */
export function resoudreEtape(story, cible) {
  const liste = etapesDuRecit(story);
  if (!liste.length) throw new Error("goToStep : recit_vide : la scène n'a aucune étape de récit à jouer");
  let rang = -1;
  if (typeof cible === 'string') {
    rang = liste.findIndex(({ e }) => e.cle === cible);
    if (rang < 0) throw new Error('goToStep : etape_inconnue : aucune étape de clé « ' + cible.slice(0, 60) + ' » (getRecit liste les clés)');
  } else if (Number.isInteger(cible)) {
    if (cible < 0 || cible >= liste.length) throw new Error('goToStep : etape_inconnue : le rang ' + cible + ' est hors du récit (0 à ' + (liste.length - 1) + ')');
    rang = cible;
  } else {
    throw new Error('goToStep : etape_invalide : une clé (texte) ou un rang (entier) est attendu');
  }
  const { e, indexSource } = liste[rang];
  return { index: rang, indexSource, cle: typeof e.cle === 'string' && e.cle ? e.cle : null, titre: coupe(e.title, TITRE_MAX) };
}

/** Les options de `goToStep` : `attendre` (rendre la main une fois la carte posée et chargée, vrai par défaut) et `delai` (millisecondes). */
export function normaliserOptionsAller(o) {
  const options = o === undefined ? {} : o;
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error("goToStep : un objet d'options est attendu ({ attendre, delai })");
  for (const k of Object.keys(options)) if (!['attendre', 'delai'].includes(k)) throw new Error('goToStep : option inconnue « ' + String(k).slice(0, 30) + ' » (attendre, delai)');
  const attendre = options.attendre === undefined ? true : options.attendre;
  if (typeof attendre !== 'boolean') throw new Error('goToStep : attendre doit être true ou false');
  const delai = options.delai === undefined ? DELAI_DEFAUT_MS : options.delai;
  if (!Number.isInteger(delai) || delai < 100 || delai > DELAI_MAX_MS) throw new Error('goToStep : delai hors bornes (100 à ' + DELAI_MAX_MS + ' millisecondes)');
  return { attendre, delai };
}

/** La forme de l'événement `step` et du retour de `goToStep` : quelle étape est jouée, ou `index: null` quand la lecture s'arrête. */
export function etatEtape(story, courant, lecture) {
  const r = resumerRecit(story, { courant, lecture });
  const e = r.courant === null ? null : r.etapes[r.courant];
  return { lecture: r.lecture, index: r.courant, cle: r.cle_courante, titre: e ? e.titre : null, total: r.total };
}

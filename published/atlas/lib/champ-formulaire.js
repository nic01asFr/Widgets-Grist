/**
 * Créer un champ, ou un relevé lié, depuis le module Formulaires.
 *
 * Jusqu'ici, « composer » un formulaire voulait dire choisir parmi les colonnes
 * que la table avait déjà. Une couche née dans Atlas n'en a qu'une (`nom`) : il
 * fallait aller dans Grist pour lui en donner d'autres. Ce module fait le geste
 * qui manquait — dire un nom, un type, des choix, et obtenir la colonne.
 *
 * ## Pourquoi presque tout est une opération de schéma
 *
 * Un formulaire **dérivé** se recalcule à chaque ouverture depuis les colonnes
 * (`formDefDepuisColonnes`), et une table qui référence celle de la couche est
 * trouvée toute seule (`tablesReferencant`). Ajouter une colonne suffit donc à
 * ce qu'elle apparaisse dans « Fiche » ; créer une table avec une colonne
 * `Ref:` vers la couche suffit à ce qu'elle apparaisse sous « Ajouter une
 * ligne ». Il n'y a rien à écrire de plus pour ces deux formulaires-là.
 *
 * Il reste deux cas où la définition est figée dans la table `Formulaires` :
 * un formulaire déjà enregistré (il faut y ajouter le champ, `defAvecChamp`),
 * et un relevé neuf qu'on veut proposer hors édition (un dérivé ne peut pas
 * l'être : il faut l'enregistrer, `defPourReleve`).
 *
 * Rien ici ne touche Grist ni le DOM : le module rend des identifiants, des
 * actions et des phrases. `app_v7.js` envoie le paquet et rafraîchit.
 *
 * ## Ce qui est exclu, et pourquoi
 *
 * - **Supprimer ou retyper une colonne** : elle porte des données. Un champ se
 *   masque (module Formulaires), il ne s'efface pas d'ici.
 * - **Colonnes à formule** : une scène sur l'appareil ne sait pas les calculer.
 */
import { planNomDeTable, natureRefus } from './nouvelle-couche.js?v=1.15.0';

export const VERSION = '1.0.0';

/**
 * Les types qu'on propose, dans les mots de la personne qui compose.
 * `choix` : le type demande une liste de valeurs.
 */
export const TYPES_CHAMP = Object.freeze([
  { id: 'texte', libelle: 'Texte', gType: 'Text' },
  { id: 'entier', libelle: 'Nombre entier', gType: 'Int' },
  { id: 'decimal', libelle: 'Nombre décimal', gType: 'Numeric' },
  { id: 'oui_non', libelle: 'Oui / non', gType: 'Bool' },
  { id: 'date', libelle: 'Date', gType: 'Date' },
  // Le fuseau fait partie du type Grist (`DateTime:Europe/Paris`) : celui de la personne qui crée, par défaut. L'instant stocké reste
  // absolu, quel que soit le fuseau dans lequel on l'affiche.
  { id: 'date_heure', libelle: 'Date et heure', gType: 'DateTime', fuseau: true },
  { id: 'choix', libelle: 'Un choix dans une liste', gType: 'Choice', choix: true },
  { id: 'choix_multiple', libelle: 'Plusieurs choix', gType: 'ChoiceList', choix: true },
  { id: 'photos', libelle: 'Photos', gType: 'Attachments' },
]);

export function typeChamp(id) {
  return TYPES_CHAMP.find((t) => t.id === id) || null;
}

/** Les types qui portent une date : leur valeur par défaut est le jour, et ils alimentent la « dernière visite ». */
const TYPES_DATE = new Set(['date', 'date_heure']);
export const estTypeDate = (typeId) => TYPES_DATE.has(typeId);

/**
 * Parmi les champs saisis, celui qui date la ligne : le seul que le formulaire préremplit (aujourd'hui) et que la bulle lit comme
 * « dernière visite ». Même choix que `colonneDate` : un nom qui dit une date (« date », « visite », « passage »…), à défaut le premier.
 *
 * @returns {number} son rang dans la liste, ou -1 s'il n'y a aucun champ de date
 */
export function indexDatePrincipale(champs) {
  const rangs = (champs || []).map((c, i) => (estTypeDate(c?.typeId) ? i : -1)).filter((i) => i >= 0);
  if (!rangs.length) return -1;
  const nommee = rangs.find((i) => /date|r[ée]alis|visite|inspection|passage/i.test(String(champs[i].libelle || '')));
  return nommee ?? rangs[0];
}

/** Le fuseau de cet appareil, pour un type `DateTime` ; `UTC` si on ne le sait pas. */
export function fuseauLocal() {
  try {
    return nettoyerFuseau(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch (_) {
    return 'UTC';
  }
}

/** Un identifiant de fuseau (`Europe/Paris`, `UTC`) ou `UTC` : ce qui entre dans un type de colonne doit rester un identifiant. */
function nettoyerFuseau(f) {
  return /^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+)*$/.test(String(f || '')) ? String(f) : 'UTC';
}

/** Combien de valeurs une liste de choix peut porter, et la longueur de chacune. */
export const CHOIX_MAX = 60;
export const CHOIX_LONGUEUR_MAX = 80;
export const LIBELLE_LONGUEUR_MAX = 80;

/** Colonne que Grist tient pour lui, ou préfixe qu'il réserve à ses colonnes d'aide. */
const COLONNES_RESERVEES = new Set(['id', 'manualsort']);
const PREFIXES_RESERVES = ['_', 'gristhelper_'];
/** Un identifiant de colonne ne peut pas être un mot de Python : les formules de Grist y tournent. */
const MOTS_PYTHON = new Set([
  'false', 'none', 'true', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del',
  'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);

function sansAccents(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[æÆ]/g, 'ae').replace(/[œŒ]/g, 'oe');
}

/** Un libellé comparable : sans accents ni casse, séparateurs ramenés à une espace. */
function comparable(s) {
  return sansAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Le libellé tel qu'on l'enregistre : espaces ramenées à une, longueur bornée. */
export function nettoyerLibelle(libelle) {
  return String(libelle == null ? '' : libelle).replace(/\s+/g, ' ').trim().slice(0, LIBELLE_LONGUEUR_MAX);
}

/**
 * L'identifiant Grist d'une colonne à partir de son libellé : accents translittérés, le reste réduit à des soulignés,
 * première lettre en capitale — la forme des colonnes qu'Atlas crée ailleurs (`Dist_eau_m`). Jamais un nom que Grist
 * réserve ; jamais un nom déjà pris, la casse ne comptant pas.
 *
 * @param {string} libelle
 * @param {string[]} [existants] les identifiants de colonne de la table
 * @returns {string} vide si le libellé ne contient aucune lettre ni chiffre
 */
export function idColonneDepuisLibelle(libelle, existants = []) {
  let v = sansAccents(libelle).replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!v) return '';
  if (/^\d/.test(v)) v = 'Champ_' + v;
  v = v.slice(0, 60).replace(/_+$/, '');
  v = v.charAt(0).toUpperCase() + v.slice(1);
  const bas = v.toLowerCase();
  if (COLONNES_RESERVEES.has(bas) || PREFIXES_RESERVES.some((p) => bas.startsWith(p))) v = 'Champ_' + v;
  if (MOTS_PYTHON.has(v.toLowerCase())) v += '_';
  const pris = new Set(existants.map((c) => String(c).toLowerCase()));
  let id = v;
  for (let i = 2; pris.has(id.toLowerCase()); i++) id = `${v}_${i}`;
  return id;
}

/**
 * Les choix saisis : un par ligne, ou séparés par des points-virgules. La virgule n'en est pas un — « Bon état, à
 * surveiller » est un seul choix.
 *
 * @param {string|string[]} brut
 * @returns {string[]} sans doublon (casse comprise), dans l'ordre saisi
 */
export function lireChoix(brut) {
  const morceaux = Array.isArray(brut) ? brut : String(brut == null ? '' : brut).split(/[\n;]+/);
  const vus = new Set();
  const out = [];
  for (const m of morceaux) {
    const c = String(m == null ? '' : m).replace(/\s+/g, ' ').trim().slice(0, CHOIX_LONGUEUR_MAX);
    if (!c || vus.has(c)) continue;
    vus.add(c);
    out.push(c);
  }
  return out;
}

/**
 * Une colonne prête à écrire, ou la raison pour laquelle elle ne l'est pas.
 *
 * @param {object} p
 * @param {string} p.libelle
 * @param {string} p.typeId   un `id` de `TYPES_CHAMP`
 * @param {string|string[]} [p.choix]
 * @param {Array<{colId: string, label?: string}>} [p.colonnes] celles que la table porte déjà
 * @returns {{ ok: true, colonne: {id: string, type: string, label: string, widgetOptions?: string} }
 *          | { ok: false, erreur: string }}
 */
export function planColonne({ libelle, typeId, choix = [], colonnes = [], fuseau } = {}) {
  const label = nettoyerLibelle(libelle);
  if (!label) return { ok: false, erreur: 'Donnez un nom au champ.' };
  const type = typeChamp(typeId);
  if (!type) return { ok: false, erreur: 'Choisissez le type du champ.' };

  const voulu = comparable(label);
  const doublon = colonnes.find((c) => comparable(c.label) === voulu || comparable(c.colId) === voulu);
  if (doublon) return { ok: false, erreur: `Un champ « ${nettoyerLibelle(doublon.label || doublon.colId)} » existe déjà.` };

  const id = idColonneDepuisLibelle(label, colonnes.map((c) => c.colId));
  if (!id) return { ok: false, erreur: 'Le nom doit contenir au moins une lettre ou un chiffre.' };

  const colonne = { id, type: type.fuseau ? `${type.gType}:${nettoyerFuseau(fuseau ?? fuseauLocal())}` : type.gType, label };
  if (type.choix) {
    const liste = lireChoix(choix);
    if (liste.length < 2) return { ok: false, erreur: 'Donnez au moins deux choix, un par ligne.' };
    if (liste.length > CHOIX_MAX) return { ok: false, erreur: `Au plus ${CHOIX_MAX} choix.` };
    colonne.widgetOptions = JSON.stringify({ choices: liste });
  }
  return { ok: true, colonne };
}

/**
 * Ajouter un champ à une table : une `AddColumn`.
 *
 * @param {object} p
 * @param {string} p.table
 * @returns {{ ok: true, colonne: object, actions: any[][] } | { ok: false, erreur: string }}
 */
export function planAjoutChamp({ table, libelle, typeId, choix, colonnes, requis = false, fuseau } = {}) {
  if (!table) return { ok: false, erreur: 'Aucune table à compléter.' };
  const p = planColonne({ libelle, typeId, choix, colonnes, fuseau });
  if (!p.ok) return p;
  const { id, ...info } = p.colonne;
  // « Obligatoire » ne se range pas dans la colonne : c'est le formulaire qui l'exige (`required` de son champ).
  // `isFormula: false` : sans lui, Grist crée une colonne « vide » (formule vide), que le schéma d'Atlas écarte comme colonne à formule
  // (mesuré en Grist réel le 03/10/2026 : le champ n'apparaissait pas dans la Fiche).
  return { ok: true, colonne: p.colonne, requis: !!requis, actions: [['AddColumn', table, id, { ...info, isFormula: false }]] };
}

/** Les colonnes de départ d'un relevé : la référence à l'objet, puis la date. */
export const COLONNE_OBJET = 'Objet';
export const COLONNE_DATE = 'Date';

/**
 * La géométrie d'une ligne : une table liée à l'objet qui porte une géométrie **est une couche**. Le point suit la convention des
 * couches de points d'Atlas (une paire `latitude` / `longitude`) ; la ligne et la surface s'écrivent en GeoJSON dans `geometry_json`.
 *
 * Les façons de la poser, que le créateur permet et que l'agent choisit parmi :
 * - `carte` : toucher la carte (un point) ou la tracer (une ligne, une surface) ;
 * - `position` : la position de l'appareil (un point seulement) ;
 * - `centre` : le centre de l'objet auquel la ligne se rattache (un point), ou sa forme même (une ligne ou une surface de la même
 *   famille que la sienne).
 */
export const GEOMETRIES = Object.freeze(['Point', 'LineString', 'Polygon']);
export const SOURCES_POINT = Object.freeze(['carte', 'position', 'centre']);
export const SOURCES_PAR_GEOMETRIE = Object.freeze({
  Point: SOURCES_POINT,
  LineString: Object.freeze(['carte', 'centre']),
  Polygon: Object.freeze(['carte', 'centre']),
});
export const LIBELLES_SOURCE = Object.freeze({ carte: 'Sur la carte', position: 'Ma position', centre: 'Au centre de l’objet' });
export const COLONNES_POINT = Object.freeze([
  Object.freeze({ id: 'latitude', type: 'Numeric', label: 'Latitude' }),
  Object.freeze({ id: 'longitude', type: 'Numeric', label: 'Longitude' }),
]);
export const COLONNES_FORME = Object.freeze([Object.freeze({ id: 'geometry_json', type: 'Text', label: 'Géométrie (GeoJSON)' })]);

/** Les colonnes que porte une table dont chaque ligne a cette géométrie. */
export function colonnesDeGeometrie(geometrie) {
  return geometrie === 'Point' ? COLONNES_POINT : COLONNES_FORME;
}

/** Le mot d'une source, selon la forme qu'on pose : on touche la carte pour un point, on la trace pour une ligne. */
export function libelleSource(source, geometrie = 'Point') {
  if (source === 'carte') return geometrie === 'Point' ? LIBELLES_SOURCE.carte : 'Tracer sur la carte';
  if (source === 'centre') return geometrie === 'Point' ? LIBELLES_SOURCE.centre : 'Celle de l’objet';
  return LIBELLES_SOURCE[source] || source;
}

/** Les sources retenues : celles qui existent pour cette géométrie, sans doublon, dans l'ordre où on les propose. */
export function sourcesRetenues(sources, geometrie = 'Point') {
  const voulues = new Set(Array.isArray(sources) ? sources : []);
  return (SOURCES_PAR_GEOMETRIE[geometrie] || []).filter((s) => voulues.has(s));
}

/**
 * Un relevé lié à une couche : une table dont une colonne référence celle de la couche, et les champs demandés.
 *
 * @param {object} p
 * @param {string} p.nom          ce que la personne appelle ce relevé (« Relevé de nuit »)
 * @param {string} p.coucheTable  la table de la couche
 * @param {string} [p.coucheNom]  le nom de la couche, libellé de la référence
 * @param {Array<{libelle: string, typeId: string, choix?: any}>} p.champs
 * @param {boolean} [p.dater=true] ajouter une colonne Date
 * @param {string[]} [p.tables]   les tables du document
 * @param {'Point'|'LineString'|'Polygon'|null} [p.geometrie] une géométrie par ligne : la table est alors aussi une couche
 * @param {string[]} [p.sources]  comment la poser (`SOURCES_PAR_GEOMETRIE`) ; au moins une
 * @param {boolean} [p.complet=true] faux pour valider un champ en cours de saisie, qui n'est pas encore le formulaire entier
 * @returns {{ ok: true, tableId: string, titre: string, via: string, colonnes: object[], actions: any[][] }
 *          | { ok: false, erreur: string }}
 */
export function planReleveLie({ nom, coucheTable, coucheNom = '', champs = [], dater = true, tables = [], geometrie = null, sources = ['carte'], fuseau, complet = true } = {}) {
  const titre = nettoyerLibelle(nom);
  if (!titre) return { ok: false, erreur: 'Donnez un nom au formulaire.' };
  if (!coucheTable) return { ok: false, erreur: 'Aucune couche à relier.' };
  if (!champs.length) return { ok: false, erreur: 'Ajoutez au moins un champ au formulaire.' };
  // La date est un champ comme un autre : un formulaire qui n'aurait qu'elle ne saisirait rien d'autre qu'un jour.
  // Seulement pour le formulaire entier : on peut très bien ajouter une date avant le champ qui lui donne un sens.
  if (complet && !champs.some((c) => !estTypeDate(c.typeId))) return { ok: false, erreur: 'Ajoutez au moins un champ en plus de la date.' };
  if (geometrie != null && !GEOMETRIES.includes(geometrie)) return { ok: false, erreur: 'Choisissez un point, une ligne ou une surface.' };
  const retenues = geometrie ? sourcesRetenues(sources, geometrie) : [];
  if (geometrie && !retenues.length) return { ok: false, erreur: `Choisissez au moins une façon de ${geometrie === 'Point' ? 'poser le point' : 'poser la forme'}.` };
  const t = planNomDeTable(titre, tables);
  if (!t.ok) return t;

  const colonnes = [{ id: COLONNE_OBJET, type: `Ref:${coucheTable}`, label: nettoyerLibelle(coucheNom) || coucheTable }];
  // Les colonnes de géométrie entrent avant les champs : un champ nommé « Latitude » ne doit pas leur prendre l'identifiant.
  if (geometrie) colonnes.push(...colonnesDeGeometrie(geometrie).map((c) => ({ ...c })));
  if (dater) colonnes.push({ id: COLONNE_DATE, type: 'Date', label: 'Date' });

  const requis = [];
  for (const c of champs) {
    const p = planColonne({
      libelle: c.libelle, typeId: c.typeId, choix: c.choix,
      colonnes: colonnes.map((x) => ({ colId: x.id, label: x.label })), fuseau,
    });
    if (!p.ok) return { ok: false, erreur: `${nettoyerLibelle(c.libelle) || 'Champ'} : ${p.erreur}` };
    colonnes.push(p.colonne);
    if (c.requis) requis.push(p.colonne.id);
  }
  return {
    ok: true, tableId: t.tableId, titre, via: COLONNE_OBJET, colonnes, requis,
    geometrie: geometrie || null, sources: retenues, colonnesGeometrie: geometrie ? colonnesDeGeometrie(geometrie).map((c) => c.id) : [],
    actions: [['AddTable', t.tableId, colonnes]],
  };
}

/**
 * Le champ par lequel colorer la couche d'un formulaire à géométrie : un champ à choix, le premier exigé de préférence (c'est
 * celui dont la saisie est sûre), sinon le premier. Rien s'il n'y en a pas. Aucune supposition sur ce que le champ veut dire :
 * l'ordre des choix n'est pas un degré, la palette ne le sous-entend pas.
 *
 * @param {Array<{id:string, type:string, label?:string, widgetOptions?:string}>} colonnes
 * @param {string[]} [requis]
 * @returns {{champ:string, valeurs:string[]}|null}
 */
export function champSymbolisable(colonnes, requis = []) {
  const choix = (colonnes || []).filter((c) => c?.type === 'Choice').map((c) => {
    let valeurs = [];
    try { valeurs = JSON.parse(c.widgetOptions || '{}').choices || []; } catch (e) { /* options illisibles */ }
    return { c, valeurs: valeurs.map(String) };
  }).filter((x) => x.valeurs.length >= 2);
  if (!choix.length) return null;
  const exiges = new Set(requis || []);
  const x = choix.find((y) => exiges.has(y.c.id)) || choix[0];
  return { champ: x.c.id, valeurs: x.valeurs };
}

/** Le champ du formulaire pour une colonne que ce module vient de produire. */
export function champDepuisPlan(colonne, derivation, { requis = false } = {}) {
  if (!derivation?.champDepuisColonne) return null;
  const champ = derivation.champDepuisColonne({
    colId: colonne.id, type: colonne.type, label: colonne.label, widgetOptions: colonne.widgetOptions,
  });
  if (champ && requis) champ.required = true;
  return champ;
}

/**
 * La définition d'un formulaire enregistré, avec un champ de plus (à la fin de sa dernière section).
 * La même définition, telle quelle, si le champ y figure déjà.
 */
export function defAvecChamp(def, champ) {
  if (!def || !champ?.colId) return def;
  const sections = Array.isArray(def.sections) && def.sections.length
    ? def.sections
    : [{ id: 'main', label: def.title || def.tableId || '', fields: [] }];
  if (sections.some((s) => (s.fields || []).some((f) => f.colId === champ.colId))) return def;
  const copie = sections.map((s) => ({ ...s, fields: [...(s.fields || [])] }));
  copie[copie.length - 1].fields.push(champ);
  return { ...def, sections: copie };
}

/**
 * La définition à enregistrer pour un relevé neuf : celle que la dérivation donnerait, sans la référence à l'objet
 * (c'est le clic qui la porte).
 */
export function defPourReleve(plan, derivation, { id } = {}) {
  if (!plan?.ok || !derivation?.formDefDepuisColonnes) return null;
  const def = derivation.formDefDepuisColonnes({
    tableId: plan.tableId,
    colonnes: plan.colonnes.map((c) => ({ colId: c.id, type: c.type, label: c.label, widgetOptions: c.widgetOptions })),
    titre: plan.titre,
    // Ni la référence à l'objet (c'est le clic qui la porte) ni la position (c'est la carte, ou l'appareil) ne se saisissent.
    ignorer: [plan.via, ...(plan.colonnesGeometrie || [])],
  });
  if (!def) return null;
  // Les champs que la personne a marqués obligatoires : le moteur ne réclame que ceux qu'il rend.
  const exige = new Set(plan.requis || []);
  const sections = exige.size
    ? def.sections.map((s) => ({ ...s, fields: s.fields.map((f) => (exige.has(f.colId) ? { ...f, required: true } : f)) }))
    : def.sections;
  return { ...def, sections, id: id || def.id, title: plan.titre };
}

/** Ce qu'on dit avant d'écrire un champ. */
export function phraseAjoutChamp(plan, { table, formulaire } = {}) {
  if (!plan?.ok) return '';
  const c = plan.colonne;
  const type = TYPES_CHAMP.find((t) => t.gType === String(c.type).split(':')[0])?.libelle || c.type;
  return `Colonne « ${c.id} » (${type.toLowerCase()}) ajoutée à la table ${table}${formulaire ? ` et au formulaire « ${formulaire} »` : ''}.`;
}

/** Ce qu'on dit avant de créer un relevé. */
export function phraseReleveLie(plan, { coucheTable, expose } = {}) {
  if (!plan?.ok) return '';
  const date = plan.colonnes.some((c) => c.id === COLONNE_DATE);
  const n = plan.colonnes.length - 1 - (date ? 1 : 0) - (plan.colonnesGeometrie?.length || 0);
  return `Table ${plan.tableId} : une colonne ${plan.via} vers ${coucheTable}${date ? ', la date' : ''} et ${n} champ${n > 1 ? 's' : ''}`
    + `${plan.geometrie ? ` ; ${{ Point: 'un point', LineString: 'un tracé', Polygon: 'une surface' }[plan.geometrie]} par ligne, donc la table est aussi une couche` : ''}`
    + `${expose ? ' ; le formulaire sera proposé sur le terrain' : ''}.`;
}

/**
 * Le message d'un refus de structure. On peut avoir le droit d'écrire des lignes sans celui d'ajouter une colonne.
 */
export function messageRefusChamp(erreur, { releve = false } = {}) {
  const objet = releve ? 'la table du relevé' : 'le champ';
  switch (natureRefus(erreur)) {
    case 'structure': return `Vous pouvez modifier les données de ce document, mais pas sa structure : demandez au propriétaire de créer ${objet}, ou de vous en donner le droit.`;
    case 'droits': return `Grist refuse : vos droits sur ce document ne permettent pas de créer ${objet}.`;
    case 'schema': return 'Grist refuse : le document ne contient pas ce qu’Atlas attendait. Rechargez le widget et réessayez.';
    default: return 'Grist refuse : ' + String(erreur?.message || erreur || 'erreur inconnue');
  }
}

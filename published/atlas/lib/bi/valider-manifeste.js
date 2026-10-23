/**
 * Validation d'un manifeste de scène AVANT `setScene`. Module pur : ni carte, ni DOM, ni réseau, aucune dépendance (importable tel quel par un serveur Node).
 *
 * `setScene` vérifie la forme des données, la bulle, l'interface, le curseur et les marges, mais laisse passer en silence un style déclaratif faux (`kind`
 * inconnu, champ absent des propriétés, `breaks`/`colors` au lieu de `stops`, palier sans couleur, clé inconnue) : la légende tombe alors sur « (sans valeur) »
 * sans qu'aucune erreur ne le dise. Cette fonction dit ces écarts, sans rien corriger ni modifier ses arguments, pour qu'un hôte (ou un agent qui écrit le
 * manifeste) puisse refuser avant d'envoyer. Elle ne change pas le contrat 0.3.
 *
 * Les clés connues viennent du schéma publié du manifeste (`scene-manifest-0.2.2.schema.json`) et de ce que lit le composant (`lib/bi/bi-runtime.js`).
 * Une clé inconnue est une `erreur` par défaut (`options.cleInconnue: 'avertissement'` pour la tolérer).
 *
 * @typedef {{ niveau: 'erreur'|'avertissement', chemin: string, code: string, message: string, [x: string]: any }} Ecart
 */
export const VERSION = '1.0.0';
/** Versions du manifeste lues (`lib/scene-externe.js`). Un manifeste sans `version` est admis (celui d'un hôte du composant n'en porte pas). */
export const VERSIONS_MANIFESTE = Object.freeze(['0.2.1', '0.2.2']);
export const KINDS = Object.freeze(['single', 'categorized', 'graduated']);
export const TYPES_CONTROLE = Object.freeze(['select', 'range', 'time', 'text']);
export const TYPES_VISUEL = Object.freeze(['cercles', 'proportionnel', 'heat', 'grille', 'hex', 'etats', 'choroplethe']);
export const NIVEAUX_ADMIN = Object.freeze(['pays', 'region', 'departement', 'commune', 'epci', 'arrondissement']);

const CLES_RACINE = ['version', 'title', 'subtitle', 'classification', 'meta', 'layers', 'story', 'terrain', 'fusion', 'curseur', 'marges', 'attribution', 'charte', 'interface', 'temps'];
const CLES_COUCHE = ['id', 'name', 'displayName', 'source', 'geometry_type', 'geomType', 'profile', 'color', 'featureCount', 'fetch', 'fields', 'limits', 'visibility', 'style', 'controls',
  'cle', 'visuel', 'temps', 'bulle', 'admin', 'geojson', 'visible', 'type', 'lignes'];
const CLES_STYLE = ['declarative', 'charte'];
const CLES_DECLARATIF = { single: ['kind', 'color', 'opacity'], categorized: ['kind', 'field', 'stops'], graduated: ['kind', 'field', 'method', 'stops'] };
const CLES_PALIER = { categorized: ['value', 'color', 'label', 'opacity'], graduated: ['lower', 'upper', 'color', 'opacity', 'label'] };
const CLES_CONTROLE = ['id', 'field', 'type', 'label', 'active', 'min', 'max', 'values', 'dataMin', 'dataMax', 'mode', 'texte', 'variant', 'requireValue', 'unite'];
/** Clés qu'on croit lues et qui ne le sont pas : le message dit quoi employer à la place. */
const NON_LUES = { breaks: 'utiliser `stops: [{ lower, upper, color }]`', colors: 'la couleur se porte par palier : `stops[].color`', palette: 'la couleur se porte par palier : `stops[].color`' };
const ECHANTILLON_MAX = 5000;
const CLES_AFFICHEES = 25;

const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const texte = (v) => (v === null || v === undefined ? '' : String(v));
/** Même forme de couleur que celles lues par le composant : #rgb, #rrggbb, #rrggbbaa, rgb(), rgba(), hsl(), hsla(), ou jeton de charte. */
const couleurLisible = (c) => typeof c === 'string' && /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\([^)]*\)|hsla?\([^)]*\)|jeton:[A-Za-z0-9_.-]+)$/i.test(c.trim());

/** Les propriétés rencontrées dans les entités d'une couche (échantillon régulier au-delà de ECHANTILLON_MAX), et les valeurs vues par champ demandé. */
function profil(entites, champs) {
  const cles = new Set(), valeurs = new Map(champs.map((c) => [c, new Set()]));
  const pas = Math.max(1, Math.ceil(entites.length / ECHANTILLON_MAX));
  for (let i = 0; i < entites.length; i += pas) {
    const p = estObjet(entites[i]) && estObjet(entites[i].properties) ? entites[i].properties : null;
    if (!p) continue;
    for (const k of Object.keys(p)) cles.add(k);
    for (const c of champs) if (c in p) valeurs.get(c).add(texte(p[c]).toLowerCase());
  }
  return { cles, valeurs, echantillonnees: Math.ceil(entites.length / pas) };
}

/**
 * @param {object} manifeste  le manifeste passé à `setScene`
 * @param {Record<string, any[]>} [donnees]  les entités par id de couche, comme le second argument de `setScene`
 * @param {{ cleInconnue?: 'erreur'|'avertissement' }} [options]
 * @returns {{ ok: boolean, ecarts: Ecart[], erreurs: number, avertissements: number }}
 */
export function validerManifeste(manifeste, donnees, options = {}) {
  const ecarts = [];
  const niveauCle = options.cleInconnue === 'avertissement' ? 'avertissement' : 'erreur';
  const dire = (niveau, chemin, code, message, extra) => { ecarts.push({ niveau, chemin, code, message, ...(extra || {}) }); };
  const cles = (obj, connues, chemin) => {
    for (const k of Object.keys(obj)) {
      if (connues.includes(k)) continue;
      if (NON_LUES[k]) dire('erreur', `${chemin}.${k}`, 'cle-non-lue', `« ${k} » n'est pas lue par le composant : ${NON_LUES[k]}.`);
      else dire(niveauCle, `${chemin}.${k}`, 'cle-inconnue', `clé « ${k} » inconnue à cet endroit : elle serait ignorée sans message.`);
    }
  };
  if (!estObjet(manifeste)) { dire('erreur', 'manifeste', 'type', 'le manifeste doit être un objet'); return resume(ecarts); }
  cles(manifeste, CLES_RACINE, 'manifeste');
  if (manifeste.version !== undefined && !VERSIONS_MANIFESTE.includes(String(manifeste.version))) {
    dire('erreur', 'manifeste.version', 'version-hors-liste', `version « ${texte(manifeste.version).slice(0, 20)} » non lue (lues : ${VERSIONS_MANIFESTE.join(', ')}).`);
  }
  if (!Array.isArray(manifeste.layers)) { dire('erreur', 'manifeste.layers', 'layers-absent', '`layers` doit être un tableau de couches'); return resume(ecarts); }
  const donneesObj = estObjet(donnees) ? donnees : null;
  const idsCouches = new Set(), idsControles = new Set();
  const idsEntites = new Map();   // id d'entité -> id de couche : l'identifiant est unique sur TOUTE la scène (contrat 0.3)

  manifeste.layers.forEach((def, i) => {
    const ch = `layers[${i}]`;
    if (!estObjet(def)) { dire('erreur', ch, 'type', 'une couche doit être un objet'); return; }
    cles(def, CLES_COUCHE, ch);
    if (typeof def.id !== 'string' || !def.id) dire('erreur', `${ch}.id`, def.id === undefined ? 'id-absent' : 'id-non-texte', 'l\'identifiant d\'une couche doit être un texte non vide (getLegend, setVisual et setFilter l\'exigent).');
    else if (idsCouches.has(def.id)) dire('erreur', `${ch}.id`, 'id-en-double', `identifiant de couche « ${def.id} » déjà employé.`);
    else idsCouches.add(def.id);
    if (def.type === 'table' || def.admin) { if (def.admin && estObjet(def.admin) && !NIVEAUX_ADMIN.includes(def.admin.niveau)) dire('erreur', `${ch}.admin.niveau`, 'niveau-inconnu', `niveau administratif « ${texte(def.admin.niveau).slice(0, 20)} » inconnu (${NIVEAUX_ADMIN.join(', ')}).`); }
    if (def.visuel !== undefined) {
      if (!estObjet(def.visuel)) dire('erreur', `${ch}.visuel`, 'type', '`visuel` doit être un objet');
      else if (def.visuel.type !== undefined && !TYPES_VISUEL.includes(def.visuel.type)) dire('erreur', `${ch}.visuel.type`, 'visuel-inconnu', `type de visuel « ${texte(def.visuel.type).slice(0, 20)} » inconnu (${TYPES_VISUEL.join(', ')}).`);
    }

    // les données de la couche : propriétés vues, identifiants
    const brut = donneesObj && typeof def.id === 'string' ? donneesObj[def.id] : undefined;
    const aDonnees = Array.isArray(brut) && !def.admin && def.type !== 'table';
    if (donneesObj && brut !== undefined && !Array.isArray(brut) && !def.admin && def.type !== 'table') {
      dire('erreur', `donnees.${texte(def.id)}`, 'donnees-forme', estObjet(brut) && brut.type === 'FeatureCollection' ? 'donnees[id] doit être un TABLEAU de Features : passer `collection.features`.' : 'donnees[id] doit être un tableau de Features.');
    }
    const champsDemandes = [];
    const decl = estObjet(def.style) ? def.style.declarative : undefined;
    if (def.style !== undefined) { if (!estObjet(def.style)) dire('erreur', `${ch}.style`, 'type', '`style` doit être un objet'); else cles(def.style, CLES_STYLE, `${ch}.style`); }
    if (decl !== undefined) {
      const cd = `${ch}.style.declarative`;
      if (!estObjet(decl)) dire('erreur', cd, 'type', '`style.declarative` doit être un objet');
      else if (!KINDS.includes(decl.kind)) dire('erreur', `${cd}.kind`, 'kind-inconnu', `kind « ${texte(decl.kind).slice(0, 20)} » inconnu (${KINDS.join(', ')}) : la légende resterait vide.`);
      else {
        cles(decl, CLES_DECLARATIF[decl.kind], cd);
        if (decl.kind === 'single') { if (!couleurLisible(decl.color)) dire('erreur', `${cd}.color`, decl.color === undefined ? 'couleur-absente' : 'couleur-illisible', '`color` doit être une couleur lisible (#rrggbb, rgb(), hsl() ou jeton:<nom>).'); }
        else {
          if (typeof decl.field !== 'string' || !decl.field) dire('erreur', `${cd}.field`, 'champ-absent', `\`field\` est requis pour « ${decl.kind} ».`);
          else champsDemandes.push({ champ: decl.field, chemin: `${cd}.field` });
          if (!Array.isArray(decl.stops) || !decl.stops.length) dire('erreur', `${cd}.stops`, 'stops-absents', `\`stops\` (tableau non vide) est requis pour « ${decl.kind} ».`);
          else decl.stops.forEach((s, j) => {
            const cs = `${cd}.stops[${j}]`;
            if (!estObjet(s)) { dire('erreur', cs, 'type', 'un palier doit être un objet'); return; }
            cles(s, CLES_PALIER[decl.kind], cs);
            if (!couleurLisible(s.color)) dire('erreur', `${cs}.color`, s.color === undefined ? 'couleur-absente' : 'couleur-illisible', 'un palier sans couleur lisible reçoit une couleur par défaut inventée.');
            if (decl.kind === 'categorized' && s.value === undefined) dire('erreur', `${cs}.value`, 'valeur-absente', 'un palier catégorisé doit porter `value`.');
            if (decl.kind === 'graduated') {
              if (s.lower !== undefined && s.lower !== null && !Number.isFinite(s.lower)) dire('erreur', `${cs}.lower`, 'borne-illisible', '`lower` doit être un nombre ou null.');
              if (s.upper !== undefined && s.upper !== null && !Number.isFinite(s.upper)) dire('erreur', `${cs}.upper`, 'borne-illisible', '`upper` doit être un nombre ou null.');
              if (Number.isFinite(s.lower) && Number.isFinite(s.upper) && s.lower > s.upper) dire('erreur', cs, 'bornes-inversees', '`lower` dépasse `upper`.');
            }
          });
          if (decl.kind === 'graduated' && Array.isArray(decl.stops) && decl.stops.length && estObjet(decl.stops[0]) && Number.isFinite(decl.stops[0].lower)) {
            dire('avertissement', `${cd}.stops[0].lower`, 'premier-seuil-fini', 'une valeur égale à ce seuil est colorée par le premier palier mais comptée « sans valeur » par la légende (classes en ]lower, upper]) : laisser `lower: null` au premier palier.');
          }
        }
      }
    }
    if (def.controls !== undefined && !Array.isArray(def.controls)) dire('erreur', `${ch}.controls`, 'type', '`controls` doit être un tableau');
    else (def.controls || []).forEach((c, j) => {
      const cc = `${ch}.controls[${j}]`;
      if (!estObjet(c)) { dire('erreur', cc, 'type', 'un contrôle doit être un objet'); return; }
      cles(c, CLES_CONTROLE, cc);
      if (typeof c.id !== 'string' || !c.id) dire('erreur', `${cc}.id`, 'controle-sans-id', '`setFilter` désigne un contrôle par son `id` (texte non vide).');
      else if (idsControles.has(c.id)) dire('erreur', `${cc}.id`, 'controle-id-en-double', `identifiant de contrôle « ${c.id} » déjà employé dans la scène.`);
      else idsControles.add(c.id);
      if (!TYPES_CONTROLE.includes(c.type)) dire('erreur', `${cc}.type`, 'controle-type-inconnu', `type de contrôle « ${texte(c.type).slice(0, 20)} » inconnu (${TYPES_CONTROLE.join(', ')}).`);
      if (typeof c.field !== 'string' || !c.field) dire('erreur', `${cc}.field`, 'champ-absent', '`field` est requis.');
      else champsDemandes.push({ champ: c.field, chemin: `${cc}.field` });
      if (c.active && c.type === 'select' && c.values !== undefined && !Array.isArray(c.values)) dire('erreur', `${cc}.values`, 'type', '`values` doit être une liste pour un contrôle `select`.');
    });

    if (aDonnees) {
      const p = profil(brut, [...new Set(champsDemandes.map((x) => x.champ))]);
      for (const { champ, chemin } of champsDemandes) {
        if (!p.cles.has(champ)) {
          const liste = [...p.cles].sort();
          dire('erreur', chemin, 'champ-absent-des-donnees', `le champ « ${champ} » n'existe dans aucune des ${p.echantillonnees} entités examinées de « ${texte(def.id)} » (propriétés : ${liste.slice(0, CLES_AFFICHEES).join(', ')}${liste.length > CLES_AFFICHEES ? ', …' : ''}).`, { proprietes: liste });
        }
      }
      if (decl && decl.kind === 'categorized' && Array.isArray(decl.stops) && typeof decl.field === 'string' && p.valeurs.has(decl.field)) {
        const vues = p.valeurs.get(decl.field);
        decl.stops.forEach((s, j) => { if (estObjet(s) && s.value !== undefined && p.cles.has(decl.field) && !vues.has(texte(s.value).toLowerCase())) dire('avertissement', `${ch}.style.declarative.stops[${j}].value`, 'valeur-absente-des-donnees', `la valeur « ${texte(s.value).slice(0, 40)} » n'apparaît dans aucune entité : la classe afficherait 0.`); });
      }
      const dejaDit = new Set();
      brut.forEach((f, k) => {
        if (!estObjet(f) || f.id === undefined || f.id === null) return;
        if (typeof f.id !== 'number' || !Number.isSafeInteger(f.id)) { if (!dejaDit.has('type')) { dejaDit.add('type'); dire('erreur', `donnees.${texte(def.id)}[${k}].id`, 'id-non-entier', `l'identifiant d'une entité doit être un entier (reçu : ${typeof f.id} « ${texte(f.id).slice(0, 30)} »).`); } return; }
        const ailleurs = idsEntites.get(f.id);
        if (ailleurs !== undefined) { const cle = 'dbl:' + ailleurs; if (!dejaDit.has(cle)) { dejaDit.add(cle); dire('erreur', `donnees.${texte(def.id)}[${k}].id`, 'id-en-double', `l'identifiant ${f.id} existe déjà (couche « ${ailleurs} ») : il doit être unique sur toute la scène.`); } }
        else idsEntites.set(f.id, texte(def.id));
      });
    }
  });
  return resume(ecarts);
}

function resume(ecarts) {
  const erreurs = ecarts.filter((e) => e.niveau === 'erreur').length;
  return { ok: erreurs === 0, ecarts, erreurs, avertissements: ecarts.length - erreurs };
}

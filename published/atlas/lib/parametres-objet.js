/**
 * Les paramètres d'un objet du catalogue : un schéma, trois niveaux de réglage, une provenance.
 *
 * ## Le problème
 *
 * Un objet réaliste est piloté par des paramètres — pour un luminaire : puissance, température de
 * couleur, hauteur de feu, statut, heures d'allumage ; pour un arbre, plus tard : hauteur, classe
 * d'âge, phénologie. Ils viennent de trois endroits, et rien ne dit lequel l'emporte ni d'où vient
 * la valeur affichée : un champ de l'objet (une colonne Grist, un tag OSM), un réglage posé pour
 * toute la couche, ou une valeur par défaut. Un défaut inventé ne doit jamais passer pour une
 * mesure.
 *
 * ## Le modèle
 *
 * Pour chaque paramètre, la valeur d'un objet se cherche dans cet ordre, du plus précis au plus
 * général, et **dit d'où elle vient** :
 *
 * 1. \`objet\`     un réglage posé sur CET objet dans Atlas (\`_params\`) ;
 * 2. \`champ\`     un champ de l'objet — le champ **lié** au paramètre, à défaut son nom ou un nom
 *                  reconnu (\`height\` pour \`hauteurFeu\`) ;
 * 3. \`couche\`    le réglage de la couche, pour le type de l'objet (ou pour tous) ;
 * 4. \`catalogue\` le défaut que porte le type du catalogue ;
 * 5. \`regle\`     la règle d'Atlas : une hypothèse déclarée, jamais présentée comme une donnée.
 *
 * Les valeurs par défaut sont **virtuelles** : elles ne sont jamais écrites dans la table de
 * l'équipe. Une action explicite, à part, peut les y figer.
 *
 * ## Le schéma
 *
 * Il est porté par le type du catalogue (\`type.parameters\`, prévu pour une évolution du format
 * \`atlas-objets\`). Tant que le catalogue ne le déclare pas, Atlas en porte un **intégré** par
 * famille — ici l'éclairage, d'après le vocabulaire EclExt et les bandes de plausibilité de
 * pix2hdr. Le moteur est le même pour toute famille : une famille de plus est un schéma de plus,
 * pas un écran de plus.
 *
 * Tout ici est pur : ni DOM, ni MapLibre, ni réseau.
 */
import { lireHeureEclext } from './eclairage-profil.js?v=1.13.0';
import { lireLongueurOsm } from './catalogue-objets.js?v=1.13.0';

/** Les origines d'une valeur, de la plus précise à la plus générale. */
export const ORIGINES = Object.freeze(['objet', 'champ', 'couche', 'catalogue', 'regle']);

/** La façon de dire d'où vient une valeur, pour l'interface. */
export function libelleOrigine(origine, champ = null) {
  switch (origine) {
    case 'objet': return 'réglé sur cet objet';
    case 'champ': return champ ? `champ « ${champ} »` : 'champ de l’objet';
    case 'couche': return 'réglage de la couche';
    case 'catalogue': return 'défaut du type';
    case 'regle': return 'règle d’Atlas, à vérifier';
    default: return 'non renseigné';
  }
}

/** Les groupes d'affichage d'un schéma, dans l'ordre. */
export const GROUPES_ECLAIRAGE = Object.freeze([
  { id: 'source', libelle: 'Source lumineuse' },
  { id: 'pose', libelle: 'Pose' },
  { id: 'allumage', libelle: 'Allumage' },
  { id: 'validite', libelle: 'Validité' },
]);

// ---------------------------------------------------------------------------
// Le schéma intégré de l'éclairage
// ---------------------------------------------------------------------------

/** Statuts d'un point lumineux (EclExt 1.1, INSPIRE ConditionOfFacilityValue). */
const CHOIX_STATUT = Object.freeze([
  { value: 'functional', label: 'En service' },
  { value: 'decommissioned', label: 'Hors service' },
  { value: 'dismantled', label: 'Déposé' },
  { value: 'projected', label: 'Projeté' },
  { value: 'underCommissionning', label: 'En attente de mise en service' },
  { value: 'underConstruction', label: 'En construction' },
]);

/** Comportement jour/nuit : un réglage d'Atlas, pas un champ EclExt. */
const CHOIX_COMPORTEMENT = Object.freeze([
  { value: 'soleil', label: 'Selon le soleil' },
  { value: 'toujours', label: 'Toujours allumé' },
  { value: 'jamais', label: 'Toujours éteint' },
]);

/**
 * Bande de hauteur de feu plausible par type du catalogue, en mètres
 * (pix2hdr, \`eclairage.json\`, \`bandes_de_plausibilite.hauteur_de_feu_m\`).
 */
const BANDE_HAUTEUR_FEU = Object.freeze({
  mat_crosse: [3.5, 10],
  applique_facade: [3, 8],
  axial_suspendu: [5.5, 9],
  projecteur_facade: [4, 14],
  encastre_sol: [0, 0],
});

/**
 * Bande de puissance plausible par classe photométrique du premier émetteur, en watts
 * (pix2hdr, \`bandes_de_plausibilite.puissance_luminaire_w\`). La classe \`locale\` (applique) n'a pas de
 * bande propre chez pix2hdr : elle reprend celle de la rue de desserte — hypothèse d'Atlas, dite.
 */
const BANDE_PUISSANCE = Object.freeze({
  desserte: { bande: [15, 60], nom: 'rue de desserte' },
  locale: { bande: [15, 60], nom: 'rue de desserte, faute de bande propre aux appliques' },
  mise_en_lumiere: { bande: [10, 150], nom: 'mise en lumière' },
});

/** Température de couleur plausible (pix2hdr, installations antérieures à 2020 : la bande large). */
const BANDE_TEMPERATURE = Object.freeze([1900, 4500]);

/** Le plafond de l'arrêté du 27 décembre 2018 pour une installation récente. */
const TEMPERATURE_PAR_DEFAUT = 3000;

/**
 * Les descripteurs de l'éclairage, avant spécialisation par type.
 *
 * Un descripteur :
 * - \`id\`, \`libelle\`, \`groupe\`, \`kind\` (\`number\` | \`choice\` | \`text\` | \`heure\` | \`date\`), \`unite\` ;
 * - \`min\`/\`max\` : bornes **dures** (une valeur hors d'elles est refusée à la saisie) ;
 * - \`bande\` : l'usuel (hors d'elle, la valeur est **signalée**, jamais refusée : la donnée est celle de l'équipe) ;
 * - \`alias\` : noms de champ reconnus en plus de l'identifiant ;
 * - \`injecter\` : la valeur résolue est-elle remise aux calculs (état, pose, intensité) ? Faux pour ce
 *   qui ne sert qu'à l'affichage — injecter \`allumageSoir\` ferait disparaître l'hypothèse « allumage au
 *   coucher du soleil » que l'état dit lui-même ;
 * - \`aide\` : une phrase, pour l'utilisateur.
 */
const ECLAIRAGE = Object.freeze([
  {
    id: 'statut', libelle: 'Statut', groupe: 'source', kind: 'choice', choix: CHOIX_STATUT,
    alias: ['statut', 'status'], injecter: false,
    aide: 'Un point hors service reste éteint, quelle que soit l’heure.',
  },
  {
    id: 'puissance', libelle: 'Puissance', groupe: 'source', kind: 'number', unite: 'W',
    min: 0, max: 1000, pas: 1, alias: ['puissance', 'power', 'wattage'], injecter: true,
    aide: 'Puissance nominale du luminaire. Elle donne le flux et donc l’intensité du faisceau.',
  },
  {
    id: 'temperatureCouleur', libelle: 'Température de couleur', groupe: 'source', kind: 'number', unite: 'K',
    min: 1000, max: 10000, pas: 100, bande: BANDE_TEMPERATURE, alias: ['temperatureCouleur', 'temperature_couleur', 'kelvin'],
    injecter: true,
    aide: 'Plus bas, plus chaud. L’arrêté de 2018 plafonne les installations récentes à 3 000 K.',
  },
  {
    id: 'hauteurFeu', libelle: 'Hauteur de feu', groupe: 'pose', kind: 'number', unite: 'm',
    min: 0, max: 50, pas: 0.1, parse: 'longueur', alias: ['hauteurFeu', 'hauteur_feu', 'height', 'hauteur'], injecter: true,
    aide: 'Hauteur de la source au-dessus du sol. Elle choisit la classe d’un mât et élève une applique.',
  },
  {
    id: 'azimut', libelle: 'Orientation', groupe: 'pose', kind: 'number', unite: '°',
    min: 0, max: 360, pas: 5, alias: ['azimut', 'orientation'], injecter: true,
    aide: 'En degrés depuis le nord. Sans valeur, l’orientation est tirée de la position.',
  },
  {
    id: 'comportement', libelle: 'Comportement', groupe: 'allumage', kind: 'choice', choix: CHOIX_COMPORTEMENT,
    alias: ['comportement'], injecter: false, defaut: { valeur: 'soleil', origine: 'regle', explication: 'allumé du coucher au lever du soleil' },
    aide: 'Selon le soleil : allumé la nuit, éteint le jour. Les deux autres forcent l’état.',
  },
  {
    id: 'allumageSoir', libelle: 'Allumage du soir', groupe: 'allumage', kind: 'heure',
    alias: ['allumageSoir'], injecter: false, defaut: { valeur: '+0CS', origine: 'regle', explication: 'au coucher du soleil' },
    aide: 'Format EclExt : 21:30 (heure locale), -15CS (15 min avant le coucher du soleil), -196MN (avant le milieu de nuit).',
  },
  {
    id: 'extinctionMatin', libelle: 'Extinction du matin', groupe: 'allumage', kind: 'heure',
    alias: ['extinctionMatin'], injecter: false, defaut: { valeur: '+0LS', origine: 'regle', explication: 'au lever du soleil' },
    aide: 'Même format : 05:30, +15LS (15 min après le lever du soleil).',
  },
  {
    id: 'valideDe', libelle: 'Valide à partir du', groupe: 'validite', kind: 'date',
    alias: ['valideDe'], injecter: false, aide: 'Avant cette date, le point n’existe pas encore.',
  },
  {
    id: 'valideJusque', libelle: 'Valide jusqu’au', groupe: 'validite', kind: 'date',
    alias: ['valideJusque'], injecter: false, aide: 'Après cette date, le point est éteint.',
  },
]);

/** Les schémas intégrés, par famille du catalogue. */
const SCHEMAS_INTEGRES = Object.freeze({ lighting: ECLAIRAGE });

/** Les groupes d'affichage d'une famille. */
export function groupesDeFamille(famille) {
  return famille === 'lighting' ? GROUPES_ECLAIRAGE : [];
}

// ---------------------------------------------------------------------------
// Du schéma de la famille au descripteur d'un type
// ---------------------------------------------------------------------------

/** La hauteur d'une classe de hauteur du catalogue (« h6 » → 6), ou \`null\`. */
function hauteurDeClasse(classe) {
  const m = /^h(\d+(?:\.\d+)?)$/.exec(String(classe ?? ''));
  return m ? Number(m[1]) : null;
}

/** Le milieu d'une bande, arrondi : la règle qui donne un défaut sans l'inventer. */
function milieu(bande) {
  return Math.round((bande[0] + bande[1]) / 2);
}

/**
 * Le descripteur d'un paramètre, spécialisé pour un type : sa bande usuelle et son défaut.
 *
 * Les défauts viennent, dans l'ordre : de ce que le type dit lui-même (\`catalogue\`), puis d'une
 * règle écrite et expliquée (\`regle\`). Aucune valeur n'est posée sans l'une des deux.
 */
function specialiser(descripteur, type) {
  const d = { ...descripteur };
  const lighting = type?.lighting || null;
  if (descripteur.id === 'hauteurFeu') {
    const bande = BANDE_HAUTEUR_FEU[type?.id];
    if (bande && bande[1] > 0) d.bande = bande;
    const duType = Number.isFinite(lighting?.hauteur_de_feu_par_defaut_m) ? lighting.hauteur_de_feu_par_defaut_m
      : hauteurDeClasse(type?.defaults?.height_class);
    if (duType != null) d.defaut = { valeur: duType, origine: 'catalogue', explication: 'hauteur par défaut du type' };
  } else if (descripteur.id === 'puissance') {
    const regle = BANDE_PUISSANCE[lighting?.emetteurs?.[0]?.classe_photometrique];
    if (regle) {
      d.bande = regle.bande;
      d.defaut = { valeur: milieu(regle.bande), origine: 'regle', explication: `milieu de la bande ${regle.bande[0]}–${regle.bande[1]} W (${regle.nom})` };
    }
  } else if (descripteur.id === 'temperatureCouleur') {
    d.defaut = { valeur: TEMPERATURE_PAR_DEFAUT, origine: 'regle', explication: 'plafond de l’arrêté du 27 décembre 2018' };
  } else if (descripteur.id === 'statut') {
    d.defaut = { valeur: 'functional', origine: 'regle', explication: 'un point est supposé en service' };
  }
  return d;
}

/**
 * Les paramètres d'un type du catalogue, prêts à résoudre et à afficher.
 *
 * Le schéma que le type déclare (\`type.parameters\`) l'emporte sur le schéma intégré de sa famille,
 * paramètre par paramètre : un catalogue plus riche qu'Atlas reste affichable, un catalogue qui n'en
 * dit rien reçoit le schéma de sa famille.
 *
 * @param {{id?: string, family?: string, lighting?: object, defaults?: object, parameters?: object[]}|null|undefined} type
 * @returns {object[]} vide quand aucun schéma ne s'applique
 */
export function descripteursDuType(type) {
  if (!type) return [];
  const base = (SCHEMAS_INTEGRES[type.family] || []).map((d) => specialiser(d, type));
  const declares = Array.isArray(type.parameters) ? type.parameters.map(normaliserParametreDuCatalogue).filter(Boolean) : [];
  if (!declares.length) return base;
  const parId = new Map(base.map((d) => [d.id, d]));
  for (const p of declares) {
    const normal = { alias: [p.id], injecter: true, groupe: 'source', ...p };
    parId.set(p.id, { ...(parId.get(p.id) || {}), ...normal });
  }
  return [...parId.values()];
}

/**
 * Un paramètre tel que le catalogue le déclare (`type.parameters[]`), ramené au descripteur d'Atlas.
 *
 * Le catalogue écrit comme sa spécification — des clés anglaises, en minuscules séparées par `_` :
 * `label`, `group`, `kind`, `unit`, `min`, `max`, `step`, `usual` (la bande usuelle), `choices`
 * (`[{ value, label }]`), `default` (`{ value, origin, explanation }`), `aliases`, `inject`, `help`.
 * Les clés d'Atlas (`libelle`, `groupe`, `unite`…) sont acceptées aussi : un catalogue d'essai écrit
 * à la main n'a pas à traduire. Un paramètre sans `id` ou sans `kind` est écarté, sans erreur.
 *
 * @returns {object|null}
 */
export function normaliserParametreDuCatalogue(p) {
  if (!p || typeof p !== 'object' || !p.id || !p.kind) return null;
  const choisis = (...cles) => cles.map((c) => p[c]).find((v) => v !== undefined);
  const defaut = choisis('default', 'defaut');
  const choix = choisis('choices', 'choix');
  const sortie = {
    id: String(p.id),
    kind: p.kind,
    libelle: choisis('label', 'libelle') ?? String(p.id),
  };
  const groupe = choisis('group', 'groupe'); if (groupe !== undefined) sortie.groupe = groupe;
  const unite = choisis('unit', 'unite'); if (unite !== undefined) sortie.unite = unite;
  const pas = choisis('step', 'pas'); if (pas !== undefined) sortie.pas = pas;
  if (p.min !== undefined) sortie.min = p.min;
  if (p.max !== undefined) sortie.max = p.max;
  const bande = choisis('usual', 'bande'); if (Array.isArray(bande) && bande.length === 2) sortie.bande = bande;
  if (Array.isArray(choix)) sortie.choix = choix.filter((c) => c && c.value !== undefined).map((c) => ({ value: c.value, label: c.label ?? String(c.value) }));
  if (defaut && typeof defaut === 'object') {
    const valeur = defaut.value !== undefined ? defaut.value : defaut.valeur;
    if (valeur !== undefined) {
      sortie.defaut = {
        valeur,
        origine: defaut.origin || defaut.origine || 'catalogue',
        explication: defaut.explanation || defaut.explication || null,
      };
    }
  }
  const alias = choisis('aliases', 'alias'); if (Array.isArray(alias)) sortie.alias = alias.map(String);
  const injecter = choisis('inject', 'injecter'); if (injecter !== undefined) sortie.injecter = !!injecter;
  const aide = choisis('help', 'aide'); if (aide !== undefined) sortie.aide = String(aide);
  if (p.parse !== undefined) sortie.parse = p.parse;
  return sortie;
}

// ---------------------------------------------------------------------------
// Lire et valider une valeur
// ---------------------------------------------------------------------------

const vide = (v) => v == null || (typeof v === 'string' && v.trim() === '') || (typeof v === 'number' && Number.isNaN(v));

/** Une date Grist (secondes) ou ISO, en \`AAAA-MM-JJ\`, ou \`null\`. */
function dateEnTexte(v) {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(v * 1000);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * Lit une valeur brute selon le type du paramètre ; \`undefined\` quand elle n'a pas de sens.
 * Une longueur à la façon d'OSM (« 8 m », « 7,5 ») est acceptée pour un paramètre de longueur.
 */
export function lireValeur(descripteur, brut, { souple = false } = {}) {
  if (vide(brut)) return undefined;
  switch (descripteur.kind) {
    case 'number': {
      if (descripteur.parse === 'longueur') {
        const l = lireLongueurOsm(brut);
        return l && Number.isFinite(l.valeur) ? l.valeur : undefined;
      }
      const n = typeof brut === 'number' ? brut : Number(String(brut).replace(',', '.').trim());
      return Number.isFinite(n) ? n : undefined;
    }
    case 'choice': {
      const s = String(brut).trim();
      // Une donnée de l'équipe peut porter une valeur hors du vocabulaire (« out_of_service ») : lue telle
      // quelle quand `souple`, et signalée. Une saisie, elle, reste strictement dans la liste.
      return souple || (descripteur.choix || []).some((c) => c.value === s) ? s : undefined;
    }
    case 'heure': {
      const s = String(brut).trim();
      return lireHeureEclext(s).ok ? s : undefined;
    }
    case 'date': return dateEnTexte(brut) || undefined;
    default: return String(brut).trim();
  }
}

/**
 * Une valeur saisie dans le formulaire est-elle admissible ? Les bornes **dures** refusent ;
 * la bande usuelle ne refuse pas, elle est signalée à part (\`ecartBande\`).
 *
 * @returns {{ ok: true, valeur: *, ecartBande: string|null } | { ok: false, erreur: string }}
 */
export function validerSaisie(descripteur, brut) {
  const v = lireValeur(descripteur, brut);
  if (v === undefined) {
    if (descripteur.kind === 'heure') return { ok: false, erreur: lireHeureEclext(brut).erreur || 'heure illisible' };
    if (descripteur.kind === 'number') return { ok: false, erreur: 'un nombre est attendu' };
    if (descripteur.kind === 'choice') return { ok: false, erreur: 'valeur hors de la liste' };
    return { ok: false, erreur: 'valeur illisible' };
  }
  if (descripteur.kind === 'number') {
    if (descripteur.min != null && v < descripteur.min) return { ok: false, erreur: `au moins ${descripteur.min}${descripteur.unite ? ' ' + descripteur.unite : ''}` };
    if (descripteur.max != null && v > descripteur.max) return { ok: false, erreur: `au plus ${descripteur.max}${descripteur.unite ? ' ' + descripteur.unite : ''}` };
  }
  return { ok: true, valeur: v, ecartBande: ecartDeBande(descripteur, v) };
}

/** Une phrase quand la valeur sort de l'usuel (sans la refuser), sinon \`null\`. */
export function ecartDeBande(descripteur, valeur) {
  const b = descripteur.bande;
  if (!b || typeof valeur !== 'number') return null;
  if (valeur >= b[0] && valeur <= b[1]) return null;
  return `hors de l’usuel (${b[0]}–${b[1]}${descripteur.unite ? ' ' + descripteur.unite : ''})`;
}

// ---------------------------------------------------------------------------
// La résolution
// ---------------------------------------------------------------------------

/** Le premier champ de l'objet qui porte une valeur lisible : le champ lié, sinon l'identifiant, sinon un alias. */
function champDeObjet(descripteur, props, liaison) {
  if (!props) return null;
  // Un champ explicitement lié ne se double pas d'un alias : le lier est une décision.
  const candidats = liaison ? [liaison] : [descripteur.id, ...(descripteur.alias || [])];
  const nomsPropres = Object.keys(props);
  for (const nom of candidats) {
    let cle = nom in props ? nom : null;
    if (cle == null) {
      const bas = String(nom).toLowerCase();
      cle = nomsPropres.find((k) => k.toLowerCase() === bas) ?? null;
    }
    if (cle == null) continue;
    const v = lireValeur(descripteur, props[cle], { souple: true });
    if (v !== undefined) return { cle, valeur: v };
  }
  return null;
}

/**
 * Le réglage de la couche pour un type : celui du type s'il existe, sinon celui de « tous » (\`*\`).
 * @param {{valeurs?: Object<string, Object<string, *>>}|null|undefined} couche
 */
function reglageDeCouche(couche, typeId, id) {
  const v = couche?.valeurs;
  if (!v) return undefined;
  if (typeId && v[typeId] && id in v[typeId]) return v[typeId][id];
  if (v['*'] && id in v['*']) return v['*'][id];
  return undefined;
}

/**
 * La valeur d'un paramètre pour un objet, **et d'où elle vient**.
 *
 * @param {object} descripteur
 * @param {{props?: object, params?: object, couche?: object, typeId?: string}} contexte
 *   \`props\` : propriétés de l'objet ; \`params\` : ses réglages Atlas (\`_params\`) ;
 *   \`couche\` : \`{ valeurs, liaisons }\` du réglage de couche
 * @returns {{ valeur: *, origine: string, champ: string|null, explication: string|null, ecartBande: string|null }}
 */
export function resoudreParametre(descripteur, { props = null, params = null, couche = null, typeId = null } = {}) {
  const fin = (valeur, origine, champ = null, explication = null) => ({
    valeur, origine, champ, explication, ecartBande: ecartDeBande(descripteur, valeur),
  });
  const horsListe = (v) => (descripteur.kind === 'choice' && !(descripteur.choix || []).some((c) => c.value === v)
    ? 'valeur hors de la liste' : null);

  const surObjet = lireValeur(descripteur, params?.[descripteur.id]);
  if (surObjet !== undefined) return fin(surObjet, 'objet');

  const champ = champDeObjet(descripteur, props, couche?.liaisons?.[descripteur.id] || null);
  if (champ) {
    const r = fin(champ.valeur, 'champ', champ.cle);
    return { ...r, ecartBande: r.ecartBande || horsListe(champ.valeur) };
  }

  const surCouche = lireValeur(descripteur, reglageDeCouche(couche, typeId, descripteur.id));
  if (surCouche !== undefined) return fin(surCouche, 'couche');

  if (descripteur.defaut && descripteur.defaut.valeur !== undefined) {
    return fin(descripteur.defaut.valeur, descripteur.defaut.origine || 'regle', null, descripteur.defaut.explication || null);
  }
  return { valeur: null, origine: 'aucune', champ: null, explication: null, ecartBande: null };
}

/**
 * Tous les paramètres d'un objet.
 *
 * @returns {{ valeurs: Object<string, *>, provenance: Object<string, object> }}
 *   \`valeurs\` ne contient que les paramètres qui ont une valeur.
 */
export function resoudreTout(descripteurs, contexte) {
  const valeurs = {};
  const provenance = {};
  for (const d of descripteurs || []) {
    const r = resoudreParametre(d, contexte);
    provenance[d.id] = r;
    if (r.valeur != null) valeurs[d.id] = r.valeur;
  }
  return { valeurs, provenance };
}

/**
 * Les propriétés de l'objet **telles que les calculs doivent les lire** : celles de l'objet, plus
 * chaque paramètre résolu sous son identifiant canonique (\`puissance\`, \`hauteurFeu\`…). Un champ
 * lié sous un autre nom, un défaut de couche ou du catalogue arrivent ainsi à l'état, à la pose et à
 * l'intensité sans que ces calculs sachent d'où vient la valeur.
 *
 * L'objet d'origine n'est jamais modifié.
 *
 * @returns {{ props: object, provenance: object }}
 */
export function proprietesEffectives(props, descripteurs, contexte) {
  const { valeurs, provenance } = resoudreTout(descripteurs, { ...contexte, props });
  const sortie = { ...(props || {}) };
  for (const d of descripteurs || []) {
    if (valeurs[d.id] === undefined) continue;
    // Un réglage EXPLICITE (objet, champ, couche) atteint toujours les calculs. Un simple défaut n'y
    // entre que si le paramètre l'a demandé : injecter `allumageSoir` par défaut ferait disparaître
    // l'hypothèse « allumage au coucher du soleil » que l'état dit lui-même.
    const explicite = ['objet', 'champ', 'couche'].includes(provenance[d.id].origine);
    if (d.injecter || explicite) sortie[d.id] = valeurs[d.id];
  }
  return { props: sortie, provenance };
}

// ---------------------------------------------------------------------------
// Le comportement jour/nuit
// ---------------------------------------------------------------------------

/**
 * Applique le comportement choisi à l'état que le profil a calculé.
 *
 * - \`soleil\` (défaut) : l'état calculé tel quel ;
 * - \`toujours\` : allumé à pleine puissance, sans considérer l'heure — ni le profil, ni les plages ;
 *   un statut hors service ou une période de validité révolue éteignent quand même : forcer
 *   l'allumage d'un point déposé n'a pas de sens ;
 * - \`jamais\` : éteint.
 *
 * @param {string|null|undefined} comportement
 * @param {object} etat résultat de \`etatPointLumineux\`
 * @param {object} [point] propriétés effectives (pour la température de couleur d'un allumage forcé)
 */
export function appliquerComportement(comportement, etat, point = null) {
  if (comportement === 'jamais') {
    // Un état forcé n'est plus une hypothèse : celles du profil n'ont plus lieu d'être dites.
    return { ...etat, allume: false, facteurFlux: 0, facteurPuissance: 0, plages: [], hypotheses: [], raison: 'réglé : toujours éteint' };
  }
  if (comportement === 'toujours') {
    const horsService = !etat.allume && /^(statut |hors de la période)/.test(String(etat.raison || ''));
    if (horsService) return etat;
    const tc = Number(point?.temperatureCouleur);
    return {
      ...etat, allume: true, facteurFlux: 1, facteurPuissance: 1, plages: [],
      temperatureCouleur: Number.isFinite(tc) ? tc : (etat.temperatureCouleur ?? null),
      hypotheses: [], raison: 'réglé : toujours allumé',
    };
  }
  return etat;
}

// ---------------------------------------------------------------------------
// Ce qui s'enregistre
// ---------------------------------------------------------------------------

const TAILLE_MAX_CLE = 80;
const TAILLE_MAX_TEXTE = 200;

function scalaireSur(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.length <= TAILLE_MAX_TEXTE ? v : undefined;
  return undefined;
}

/**
 * Le réglage d'une couche, nettoyé : seul ce qui a la bonne forme survit. Un enregistrement abîmé
 * ne doit ni lever à la lecture, ni régler un luminaire par accident.
 *
 * Forme : \`{ valeurs: { <typeId | '*'>: { <paramètre>: <valeur> } }, liaisons: { <paramètre>: <champ> } }\`
 *
 * @returns {{valeurs: object, liaisons: object}|null} \`null\` quand il ne reste rien
 */
export function parametresDeCoucheValides(brut) {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null;
  const valeurs = {};
  if (brut.valeurs && typeof brut.valeurs === 'object' && !Array.isArray(brut.valeurs)) {
    for (const [type, reglages] of Object.entries(brut.valeurs)) {
      if (!type || type.length > TAILLE_MAX_CLE || !reglages || typeof reglages !== 'object' || Array.isArray(reglages)) continue;
      const propres = {};
      for (const [id, v] of Object.entries(reglages)) {
        if (!id || id.length > TAILLE_MAX_CLE) continue;
        const s = scalaireSur(v);
        if (s !== undefined && s !== '') propres[id] = s;
      }
      if (Object.keys(propres).length) valeurs[type] = propres;
    }
  }
  const liaisons = {};
  if (brut.liaisons && typeof brut.liaisons === 'object' && !Array.isArray(brut.liaisons)) {
    for (const [id, champ] of Object.entries(brut.liaisons)) {
      if (id && id.length <= TAILLE_MAX_CLE && typeof champ === 'string' && champ.trim() && champ.length <= TAILLE_MAX_CLE) liaisons[id] = champ;
    }
  }
  if (!Object.keys(valeurs).length && !Object.keys(liaisons).length) return null;
  return { valeurs, liaisons };
}

/** Les réglages Atlas d'un objet (\`_params\`), nettoyés : un objet plat de scalaires, ou \`null\`. */
export function parametresDObjetValides(brut) {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null;
  const sortie = {};
  for (const [id, v] of Object.entries(brut)) {
    if (!id || id.length > TAILLE_MAX_CLE) continue;
    const s = scalaireSur(v);
    if (s !== undefined && s !== '') sortie[id] = s;
  }
  return Object.keys(sortie).length ? sortie : null;
}

/**
 * Pose (ou retire, si \`valeur\` est vide) un réglage de couche, sans modifier l'original.
 * @param {object|null} couche
 * @param {string} typeId  un type du catalogue, ou \`'*'\` pour tous
 */
export function avecReglageDeCouche(couche, typeId, id, valeur) {
  const base = parametresDeCoucheValides(couche) || { valeurs: {}, liaisons: {} };
  const valeurs = { ...base.valeurs, [typeId]: { ...(base.valeurs[typeId] || {}) } };
  if (vide(valeur)) delete valeurs[typeId][id]; else valeurs[typeId][id] = valeur;
  if (!Object.keys(valeurs[typeId]).length) delete valeurs[typeId];
  return parametresDeCoucheValides({ valeurs, liaisons: base.liaisons });
}

/** Lie (ou délie, si \`champ\` est vide) un paramètre à un champ de la table, sans modifier l'original. */
export function avecLiaison(couche, id, champ) {
  const base = parametresDeCoucheValides(couche) || { valeurs: {}, liaisons: {} };
  const liaisons = { ...base.liaisons };
  if (vide(champ)) delete liaisons[id]; else liaisons[id] = String(champ);
  return parametresDeCoucheValides({ valeurs: base.valeurs, liaisons });
}

/**
 * Propose le champ de la table qui correspond à un paramètre : par nom (identifiant ou alias,
 * sans tenir compte de la casse) puis par type compatible. \`null\` quand rien ne convient — ne
 * jamais lier au hasard.
 *
 * @param {object} descripteur
 * @param {Array<{name: string, type?: string}>|string[]} champs les champs de la couche
 */
export function champPropose(descripteur, champs) {
  const noms = (champs || []).map((c) => (typeof c === 'string' ? { name: c } : c)).filter((c) => c && c.name);
  const candidats = [descripteur.id, ...(descripteur.alias || [])].map((n) => String(n).toLowerCase());
  for (const c of noms) if (candidats.includes(String(c.name).toLowerCase())) return c.name;
  return null;
}

// ---------------------------------------------------------------------------
// Le bilan sur une couche
// ---------------------------------------------------------------------------

/**
 * D'où viennent les valeurs d'un paramètre sur les objets d'une couche : combien lisent un champ,
 * combien retombent sur la couche, le type ou la règle. C'est ce qui permet au panneau de dire la
 * situation en une phrase (« lu dans le champ « height » sur 12 objets sur 14 ; les 2 autres : règle »).
 *
 * @param {object} descripteur
 * @param {Array<{properties?: object}>} entites
 * @param {{ couche?: object, typeId?: string, typeIdDe?: (entite: object) => string|null,
 *   descripteurDe?: (entite: object) => object|null }} [o]
 *   `typeIdDe` donne le type de chaque entité, `descripteurDe` son descripteur (couche mêlant plusieurs
 *   types : chacun a ses défauts)
 * @returns {{
 *   total: number,
 *   origines: Object<string, number>,
 *   champ: string|null,
 *   champs: string[],
 *   dominante: { valeur: *, origine: string, explication: string|null, n: number } | null,
 *   parDefaut: { valeur: *, origine: string, explication: string|null, n: number } | null,
 *   horsBande: number
 * }}
 */
export function bilanParametre(descripteur, entites, { couche = null, typeId = null, typeIdDe = null, descripteurDe = null } = {}) {
  const origines = { objet: 0, champ: 0, couche: 0, catalogue: 0, regle: 0, aucune: 0 };
  const champs = new Map();
  const valeurs = new Map();
  let total = 0;
  let horsBande = 0;
  for (const f of entites || []) {
    const props = f?.properties || {};
    const d = descripteurDe ? descripteurDe(f) : descripteur;
    if (!d) continue;
    const r = resoudreParametre(d, {
      props, params: props._params, couche, typeId: typeIdDe ? typeIdDe(f) : typeId,
    });
    total++;
    origines[r.origine] = (origines[r.origine] || 0) + 1;
    if (r.champ) champs.set(r.champ, (champs.get(r.champ) || 0) + 1);
    if (r.ecartBande) horsBande++;
    if (r.valeur != null) {
      const cle = `${r.origine}|${r.valeur}`;
      const v = valeurs.get(cle) || { valeur: r.valeur, origine: r.origine, explication: r.explication, n: 0 };
      v.n++;
      valeurs.set(cle, v);
    }
  }
  const champ = [...champs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const tri = (liste) => liste.sort((a, b) => b.n - a.n)[0] ?? null;
  const dominante = tri([...valeurs.values()]);
  const parDefaut = tri([...valeurs.values()].filter((v) => v.origine === 'catalogue' || v.origine === 'regle'));
  const noms = [...champs.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([nom]) => nom);
  return { total, origines, champ, champs: noms, dominante, parDefaut, horsBande };
}

/** Une valeur, dite comme l'utilisateur la lit : « 38 W », « En service », « -15CS ». */
export function formaterValeur(descripteur, valeur) {
  if (valeur == null || valeur === '') return '';
  if (descripteur.kind === 'choice') return (descripteur.choix || []).find((c) => c.value === valeur)?.label || String(valeur);
  const u = descripteur.unite ? ` ${descripteur.unite}` : '';
  return typeof valeur === 'number' ? `${Number(valeur.toFixed(2))}${u}` : String(valeur);
}

/**
 * La situation d'un paramètre sur une couche, en une phrase pour le panneau.
 *
 * @returns {{ texte: string, alerte: boolean }}  `alerte` : des valeurs sortent de l'usuel
 */
export function phraseBilan(descripteur, bilan) {
  if (!bilan || !bilan.total) return { texte: '', alerte: false };
  const t = bilan.total;
  const o = bilan.origines;
  const pl = (n) => (n > 1 ? 's' : '');
  const parties = [];
  if (o.objet) parties.push(`${o.objet} réglé${pl(o.objet)} sur l’objet`);
  if (o.champ) {
    const noms = (bilan.champs && bilan.champs.length ? bilan.champs : [bilan.champ]).map((c) => `« ${c} »`).join(', ');
    parties.push(`lu dans ${noms} (${o.champ} sur ${t})`);
  }
  if (o.couche) parties.push(`réglage de la couche (${o.couche} sur ${t})`);
  const defauts = o.catalogue + o.regle;
  if (defauts && bilan.parDefaut) {
    const v = formaterValeur(descripteur, bilan.parDefaut.valeur);
    const origine = libelleOrigine(bilan.parDefaut.origine);
    parties.push(`${defauts} sur ${t} : ${v} — ${origine}${bilan.parDefaut.explication ? ' : ' + bilan.parDefaut.explication : ''}`);
  }
  if (o.aucune) parties.push(`${o.aucune} sans valeur`);
  if (bilan.horsBande) parties.push(`${bilan.horsBande} hors de l’usuel`);
  return { texte: parties.join(' · '), alerte: bilan.horsBande > 0 };
}

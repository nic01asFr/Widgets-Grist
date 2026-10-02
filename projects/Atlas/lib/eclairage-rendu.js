/**
 * Rendu des points lumineux EclExt — ce qui se calcule sans three.js.
 *
 * `lib/eclairage-profil.js` dit si un luminaire est allumé et à quel flux ;
 * ce module dit **de quelle couleur** et **à quelle intensité** l'afficher, et
 * **lesquels** portent une vraie lumière dans le budget d'un rendu en direct.
 *
 * Décision 7 du contrat commun (24/09/2026) : les émetteurs sont des nœuds
 * `emetteur_<k>` en `KHR_lights_punctual` ; l'`intensity` du fichier n'est
 * **jamais lue** ; les candelas se calculent depuis la fiche EclExt par une
 * formule unique que le contrat écrira. En attendant, celle-ci — **provisoire** :
 *
 *     I (cd) ≈ flux (lm) / Ω,   Ω = 2π (1 − cos θ_ext)
 *
 * c'est-à-dire un flux réparti uniformément dans le cône extérieur. Ni la
 * distribution photométrique (IES), ni la pénombre, ni l'ULR n'y entrent.
 */

export const VERSION = '0.1.0';

/* ------------------------------------------------------------------ *
 * Couleur
 * ------------------------------------------------------------------ */

/**
 * Couleur d'un corps noir en RVB (sRGB, 0 à 1), approximation de Tanner
 * Helland (ajustement des tables de Mitchell Charity, 1 000 K à 40 000 K).
 * Écart à la table de référence : quelques unités sur 255, invisible ici.
 * Une température illisible donne le blanc.
 * @param {number} kelvins
 * @returns {[number, number, number]}
 */
export function kelvinVersRvb(kelvins) {
  const k = Number(kelvins);
  if (!Number.isFinite(k) || k <= 0) return [1, 1, 1];
  const t = Math.min(40000, Math.max(1000, k)) / 100;
  let r;
  let g;
  let b;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  }
  if (t >= 66) b = 255;
  else if (t <= 19) b = 0;
  else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (v) => Math.min(255, Math.max(0, v)) / 255;
  return [c(r), c(g), c(b)];
}

/* ------------------------------------------------------------------ *
 * Flux et intensité
 * ------------------------------------------------------------------ */

/**
 * Efficacité lumineuse type par source EclExt (`typeSource`), en lm/W.
 * LED : 110 lm/W, la règle de pix2hdr (`photometrie.json`). Les autres sont
 * des ordres de grandeur de catalogue, **provisoires**, à remplacer par le
 * vocabulaire publié par pix2hdr (décision 10).
 */
export const EFFICACITE_LM_W = Object.freeze({
  LED: 110, SHP: 100, SBP: 150, IM: 85, VM: 50, FLUO: 70, IND: 70, HAL: 18, INC: 12, XEN: 30,
});

/** Source inconnue (`XX`, vide) : la valeur LED, la plus courante au parc actuel. */
export const EFFICACITE_DEFAUT = 110;

/**
 * Le flux d'un point lumineux, en lumens, et d'où il vient.
 * `fluxLuminaire` d'abord (le flux sortant du luminaire), sinon
 * `puissance × efficacité type` de sa source.
 * @returns {{ flux: number, origine: 'fluxLuminaire'|'puissance' } | { flux: null, origine: null }}
 */
export function fluxDuPoint(point) {
  const fl = Number(point?.fluxLuminaire);
  if (Number.isFinite(fl) && fl > 0) return { flux: fl, origine: 'fluxLuminaire' };
  const p = Number(point?.puissance);
  if (Number.isFinite(p) && p > 0) {
    const src = String(point?.typeSource || '').trim().toUpperCase();
    const eff = EFFICACITE_LM_W[src] ?? EFFICACITE_DEFAUT;
    return { flux: p * eff, origine: 'puissance' };
  }
  return { flux: null, origine: null };
}

/** Angle solide d'un cône de demi-angle `angleRad`, en stéradians. */
export function angleSolideCone(angleRad) {
  const a = Math.min(Math.PI, Math.max(0, Number(angleRad) || 0));
  return 2 * Math.PI * (1 - Math.cos(a));
}

/**
 * Intensité en candelas : le flux réparti uniformément dans le cône extérieur.
 * **Provisoire** (décision 7 : la formule sera écrite au contrat).
 * @param {number} flux lumens
 * @param {number} angleExterieurRad demi-angle du cône extérieur
 */
export function candelas(flux, angleExterieurRad) {
  const f = Number(flux);
  const omega = angleSolideCone(angleExterieurRad);
  if (!Number.isFinite(f) || f <= 0 || omega <= 0) return 0;
  return f / omega;
}

/**
 * Exposition d'affichage : combien vaut un lux à l'écran.
 *
 * three.js (r155 et après) éclaire en unités physiques — un `SpotLight` se
 * règle en candelas, un matériau lambertien renvoie `albédo / π × E`. Sans
 * exposition, 30 lx sous un mât saturent tout au blanc. Ce facteur est un
 * **réglage d'œil**, pas une grandeur : il met une rue éclairée (10 à 30 lx)
 * dans les tons moyens d'une scène de nuit. Il s'applique à l'identique aux
 * vraies lumières et à la nappe calculée, pour qu'elles se raccordent.
 */
export const EXPOSITION_NUIT = 0.12;

/**
 * L'intensité à donner à une lumière three.js pour un point allumé.
 * @param {{ flux: number|null }} f `fluxDuPoint`
 * @param {number} angleExterieurRad
 * @param {{ facteurFlux?: number, facteurPuissance?: number }} etat `etatPointLumineux`
 */
export function intensiteAffichee(f, angleExterieurRad, etat) {
  if (!f?.flux) return 0;
  // Un abaissement de puissance abaisse le flux dans la même proportion :
  // approximation assumée (le rendement d'un pilote varie peu à ces taux).
  const facteur = (etat?.facteurFlux ?? 1) * (etat?.facteurPuissance ?? 1);
  return candelas(f.flux * facteur, angleExterieurRad) * EXPOSITION_NUIT;
}

/* ------------------------------------------------------------------ *
 * Budget : qui porte une vraie lumière
 * ------------------------------------------------------------------ */

/** Budget par défaut (cadrage, obstacle 3) : 4 sources ombrantes, 16 lumières. */
export const BUDGET_DEFAUT = Object.freeze({ ombres: 4, lumieres: 16 });

/**
 * Une source éclaire-t-elle le sol ? Son axe doit descendre (`dir.y < −0,05`,
 * la règle de la nappe calculée) : un projecteur tourné vers le ciel ou vers
 * une façade n'y laisse ni tache ni ombre. Sans axe connu : oui.
 */
export function eclaireLeSol(source) {
  const dy = Number(source?.dir?.y);
  return !Number.isFinite(dy) || dy < -0.05;
}

/**
 * Répartit les sources **allumées** entre trois rangs, par distance à la
 * caméra : les `ombres` plus proches portent ombre, les suivantes jusqu'à
 * `lumieres` éclairent sans ombre, les autres ne montrent que leur lampe
 * émissive et leur tache calculée.
 *
 * Les ombres ne vont qu'aux sources qui **éclairent le sol** (`eclaireLeSol`) :
 * l'ombre d'une source n'est reçue que par le sol et les modèles three.js, et
 * un projecteur tourné vers le ciel n'en projette sur rien de visible — mesuré
 * le 24/09/2026 sur la scène du Jarret, deux des quatre ombres échouaient aux
 * deux projecteurs montants, les plus proches de la caméra. Il reste une
 * lumière (il éclaire un arbre, une façade three.js), sans ombre.
 *
 * Départage à distance égale : l'ordre d'entrée, pour que deux appels sur la
 * même scène donnent la même répartition (pas de lumière qui saute).
 *
 * **Hystérésis** (`precedente`, la répartition de l'appel d'avant) : une
 * source qui portait ombre la garde tant qu'elle reste dans la marge
 * (`MARGE_HYSTERESIS` : rang < budget + 2, et distance ≤ 1,3 × celle de la
 * dernière source retenue sans hystérésis, + 5 m). Sans elle, l'ombre sautait d'un
 * mât à l'autre dès que l'ordre des distances changeait (point P7 de la
 * vérification du 24/09/2026). Même règle pour les vraies lumières.
 *
 * @param {{ id: any, x: number, y: number, z: number, allume: boolean,
 *   dir?: { y: number } }[]} sources
 * @param {{ x: number, y: number, z: number }} camera
 * @param {{ ombres?: number, lumieres?: number }} budget
 * @param {{ ombrees?: any[], eclairantes?: any[] }|null} [precedente]
 * @param {{ rang: number, distance: number, metres?: number }} [marge]
 * @returns {{ ombrees: any[], eclairantes: any[], emissives: any[] }}
 *   `eclairantes` inclut les `ombrees`, **en tête** (toutes sont de vraies
 *   lumières) ; les autres suivent par distance.
 */
export function repartirSources(sources, camera, budget = BUDGET_DEFAUT, precedente = null, marge = MARGE_HYSTERESIS) {
  const nOmbres = Math.max(0, Math.floor(budget?.ombres ?? BUDGET_DEFAUT.ombres));
  const nLumieres = Math.max(nOmbres, Math.floor(budget?.lumieres ?? BUDGET_DEFAUT.lumieres));
  const c = camera || { x: 0, y: 0, z: 0 };
  const tries = (sources || [])
    .map((s, rang) => ({ s, rang, d2: (s.x - c.x) ** 2 + (s.y - c.y) ** 2 + (s.z - c.z) ** 2 }))
    .filter((e) => e.s.allume && Number.isFinite(e.d2))
    .sort((a, b) => (a.d2 - b.d2) || (a.rang - b.rang));
  const ombrees = choisirAvecMarge(tries.filter((e) => eclaireLeSol(e.s)), nOmbres, precedente?.ombrees, marge);
  const dejaPrises = new Set(ombrees);
  const autres = tries.filter((e) => !dejaPrises.has(e.s.id));
  const avant = (precedente?.eclairantes || []).filter((id) => !dejaPrises.has(id));
  const eclairantes = ombrees.concat(choisirAvecMarge(autres, nLumieres - ombrees.length, avant, marge));
  const prises = new Set(eclairantes);
  return {
    ombrees,
    eclairantes,
    emissives: tries.map((e) => e.s.id).filter((id) => !prises.has(id)),
  };
}

/** Marge d'hystérésis de `repartirSources` : rang au-delà du budget, et rapport de distances. */
export const MARGE_HYSTERESIS = Object.freeze({ rang: 2, distance: 1.3, metres: 5 });

/**
 * Les `n` premiers candidats (triés par distance), en gardant d'abord ceux
 * d'avant qui restent dans la marge, dans leur ordre d'avant (même lampe du
 * réservoir, pas de shadow map à refaire).
 */
function choisirAvecMarge(candidats, n, avant, marge) {
  if (n <= 0 || !candidats.length) return [];
  const simples = candidats.slice(0, n);
  if (!avant?.length || !marge) return simples.map((e) => e.s.id);
  const dRef = Math.sqrt(simples[simples.length - 1].d2);
  const rangDe = new Map(candidats.map((e, i) => [e.s.id, i]));
  const gardes = [];
  for (const id of avant) {
    if (gardes.length >= n) break;
    const i = rangDe.get(id);
    if (i == null) continue;
    if (i < n + marge.rang && Math.sqrt(candidats[i].d2) <= dRef * marge.distance + (marge.metres || 0) + 1e-9) gardes.push(id);
  }
  const pris = new Set(gardes);
  for (const e of candidats) {
    if (gardes.length >= n) break;
    if (!pris.has(e.s.id)) { gardes.push(e.s.id); pris.add(e.s.id); }
  }
  return gardes;
}

/* ------------------------------------------------------------------ *
 * Lecture des entités
 * ------------------------------------------------------------------ */

/**
 * Une entité est-elle un point lumineux EclExt ? Les attributs obligatoires
 * qui le distinguent de tout autre point : `structure` et `support`, plus
 * une grandeur photométrique (`temperatureCouleur` ou `puissance`).
 * Avec `impose` (type d'éclairage choisi par l'auteur), la grandeur suffit.
 */
export function estPointLumineux(props, { impose = false } = {}) {
  if (!props || typeof props !== 'object') return false;
  const aTexte = (v) => v != null && String(v).trim() !== '';
  const grandeur = aTexte(props.temperatureCouleur) || aTexte(props.puissance);
  // `structure` et `support` distinguent un luminaire de tout autre point. Quand l'auteur a
  // CHOISI un type d'éclairage pour l'objet (identifiant `objet:<type>`, lib/modele-id.js), c'est
  // lui qui le distingue : il suffit alors d'une grandeur photométrique, sans quoi la lampe
  // n'aurait ni flux ni couleur à émettre.
  return grandeur && (impose || (aTexte(props.structure) && aTexte(props.support)));
}

/**
 * Le profil nocturne et les plages d'un point, lus sur l'entité.
 *
 * EclExt range profils et plages dans leurs propres classes ; une couche
 * d'échange (scène, GeoJSON) les porte à plat sur l'entité : `allumageSoir`,
 * `extinctionMatin`, `plages` (tableau ou JSON de `PlageVariation`),
 * `profilNocturne` (le nom). Sans heure ni plage, `profil` vaut `null` et
 * `etatPointLumineux` applique ses hypothèses, qu'il dit.
 * @returns {{ profil: object|null, plages: object[] }}
 */
export function profilDuPoint(props) {
  let plages = props?.plages;
  if (typeof plages === 'string') {
    try { plages = JSON.parse(plages); } catch (_) { plages = []; }
  }
  if (!Array.isArray(plages)) plages = [];
  const allumageSoir = props?.allumageSoir || null;
  const extinctionMatin = props?.extinctionMatin || null;
  const profil = allumageSoir || extinctionMatin || plages.length
    ? { nomProfil: props?.profilNocturne || null, allumageSoir, extinctionMatin }
    : null;
  return { profil, plages: plages.filter((p) => p && typeof p === 'object') };
}

/**
 * Où et comment poser le modèle d'un luminaire (catalogue d'essai pix2hdr,
 * 24/09/2026, bloc `lighting` du type).
 *
 * - **Hauteur** : `ancrage: 'pied'` (mât, encastré) pose l'origine au sol ;
 *   `ancrage: 'feu'` (applique, axial, projecteur) la pose sur le support **à
 *   la cote du feu** : Atlas l'élève de `hauteurFeu` de la fiche, à défaut de
 *   `hauteur_de_feu_par_defaut_m` du type.
 * - **Azimut** : un champ `azimut` (ou `orientation`), en degrés depuis le
 *   nord, l'emporte toujours. Sans lui, un luminaire ancré au feu (sur une
 *   façade) garde le tirage **faute de mieux**, et le dit : son orientation
 *   devrait venir de la façade la plus proche, pas encore calculée.
 *
 * @param {object|null} lighting bloc `lighting` du type (ou `null` : luminaire de test)
 * @param {object} props attributs de l'entité
 * @param {number} azimutTireDeg azimut de la graine (déjà composé avec la couche)
 * @returns {{ elevation: number, azimutDeg: number, origineAzimut: 'champ'|'tirage'|'tirage_provisoire' }}
 */
export function poseLuminaire(lighting, props, azimutTireDeg) {
  const lireNombre = (v) => {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const auFeu = lighting?.ancrage === 'feu';
  const hFiche = lireNombre(props?.hauteurFeu);
  const hDefaut = lireNombre(lighting?.hauteur_de_feu_par_defaut_m);
  const elevation = auFeu ? (hFiche ?? hDefaut ?? 0) : 0;
  const az = lireNombre(props?.azimut) ?? lireNombre(props?.orientation);
  if (az != null) return { elevation, azimutDeg: ((az % 360) + 360) % 360, origineAzimut: 'champ' };
  return { elevation, azimutDeg: azimutTireDeg || 0, origineAzimut: auFeu ? 'tirage_provisoire' : 'tirage' };
}

/**
 * Le libellé d'un état pour la fiche : allumé, abaissé, éteint.
 * @param {{ allume: boolean, facteurFlux: number, facteurPuissance: number }} etat
 */
export function libelleEtat(etat) {
  if (!etat?.allume) return 'éteint';
  const f = (etat.facteurFlux ?? 1) * (etat.facteurPuissance ?? 1);
  return f < 0.999 ? `abaissé à ${Math.round(f * 100)} %` : 'allumé';
}

/**
 * Les luminaires se dessinent-ils à ce zoom ? En projection globe, sous le
 * zoom où MapLibre passe au plan (12), le calque three.js pose une
 * translation plane sur une sphère : tout y est décalé (CLAUDE.md, « trois
 * causes distinctes de décalage »). Les modèles y sont retirés par
 * `Models3D.build` ; les luminaires, reconstruits ailleurs, restaient — halos
 * et taches mesurés à 312 px de leur place à z3 et à 798 px à z9
 * (24/09/2026). Sous ce seuil, en globe, on ne les dessine pas.
 * @param {string} projection 'globe' | 'mercator'
 * @param {number} zoom
 */
export function luminairesDessinables(projection, zoom, seuilGlobe = 12) {
  if ((projection || 'globe') !== 'globe') return true;
  return Number(zoom) >= seuilGlobe;
}

/**
 * La pente du sol au pied d'un luminaire, dans le repère local de la scène
 * (X = est, Z = sud) : `dy/dx` et `dy/dz`, par différences centrées à ± `pasM`
 * mètres. Sert à incliner la tache de lumière sur un relief (point P3 : sans
 * elle, la tache était un plan à la cote de l'origine, coupée par le terrain
 * près de la caméra et peinte sur les toits au loin).
 *
 * `sonde(lng, lat)` rend l'altitude, ou `null` si la tuile du MNT manque :
 * une pente incalculable vaut 0 (plat), jamais une valeur inventée. Bornée à
 * ± `max` (0,35 = 35 %) : au-delà, c'est un mur ou un artefact du MNT.
 * @returns {{ x: number, z: number }}
 */
export function penteAuPied(sonde, lng, lat, pasM = 3, max = 0.35) {
  const kLat = pasM / 111320;
  const kLng = pasM / (111320 * Math.max(1e-6, Math.cos((lat * Math.PI) / 180)));
  const e = (dLng, dLat) => {
    const v = sonde(lng + dLng, lat + dLat);
    return Number.isFinite(v) ? v : null;
  };
  const est = e(kLng, 0);
  const ouest = e(-kLng, 0);
  const nord = e(0, kLat);
  const sud = e(0, -kLat);
  const borne = (v) => Math.max(-max, Math.min(max, v));
  const x = est != null && ouest != null ? borne((est - ouest) / (2 * pasM)) : 0;
  // Z local = sud : dy/dz = (sud − nord) / 2 pas.
  const z = sud != null && nord != null ? borne((sud - nord) / (2 * pasM)) : 0;
  return { x, z };
}

/**
 * Les luminaires sont-ils accrochés à une autre scène que celle qui est rendue ?
 *
 * Un changement de fond (`setStyle`) fait recréer la scène three.js par le
 * `onAdd` du calque, et MapLibre 5.6.1 n'appelle pas `onRemove` quand il
 * remplace le style : `Eclairage.oublier()` n'était jamais appelé, la racine
 * des luminaires restait dans l'ancienne scène et plus rien ne s'affichait —
 * ni lampes, ni halos, ni taches (Jarret, 24/09/2026 : 95 allumés, 0 visible
 * après `setBasemap`).
 *
 * @param {{ racine: { parent: object | null } } | null} lum
 * @param {object | null} scene la scène que le calque rend
 */
export function luminairesHorsScene(lum, scene) {
  if (!lum || !scene) return false;
  return lum.racine?.parent !== scene;
}

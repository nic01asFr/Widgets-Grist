/**
 * Un graphe routier construit des tronçons de la BD TOPO (`BDTOPO_V3:troncon_de_route`).
 *
 * Une **arête** = un tronçon, avec son identité (`cleabs`) et ses attributs utiles : sens de circulation, nombre de
 * voies, largeur, importance, position par rapport au sol, numéro et noms de route. Un **nœud** = une extrémité de
 * tronçon partagée avec au moins un autre. Les géométries sont converties en mètres dans un repère local
 * (`geo.js`), prêtes pour le calage et le plus court chemin (`calage.js`).
 *
 * Ce module ne simule rien et ne suppose aucun usage : un affichage, un itinéraire, un calage, une analyse de
 * connexité peuvent partir du même graphe.
 *
 * ## Ce qui est volontairement simple, et ce que cela implique
 *
 * - **On ne se connecte qu'aux extrémités.** Deux tronçons qui se croisent sans partager d'extrémité ne sont pas
 *   reliés : c'est ce que la BD TOPO attend (les routes y sont coupées aux carrefours), et c'est ce qui permet à un
 *   pont de passer au-dessus d'une route sans la rejoindre. L'égalité des extrémités est exacte à 1e-7 degré (le
 *   centimètre) ; un export retouché qui décalerait les bouts ne se raccorderait pas. Pour des lignes quelconques
 *   dont les bouts tombent « à peu près » au même point, voir `lib/itineraire.js`, qui raccorde à quelques mètres.
 * - **Le niveau (`position_par_rapport_au_sol`) est conservé, pas interprété** : il sert à l'appelant (afficher un pont,
 *   écarter un tunnel). Il ne coupe pas le graphe.
 * - **Le sens n'est qu'un attribut.** `calage.js` travaille par défaut sur un graphe non orienté (une ligne dessinée
 *   n'a pas toujours de sens) ; `sensAutorises` dit ce qu'une arête permet, et le plus court chemin peut l'honorer
 *   (`oriente: true`).
 * - **Une seule ligne par tronçon.** Une `MultiLineString` n'est lue que par sa première ligne ; le compte des lignes
 *   écartées est dans `graphe.ignores`.
 * - **Le repère local est unique** (centré sur le premier point lu) : valable sur quelques dizaines de kilomètres.
 *
 * Les attributs sont ceux de la BD TOPO V3 (Licence Ouverte 2.0). Les taux de renseignement réels sont dans
 * `docs/DONNEES-IGN.md` : `nombre_de_voies` et `largeur_de_chaussee` manquent sur un cinquième à un quart des
 * tronçons, `importance` et `sens_de_circulation` sont renseignés.
 */

import { creerRepere, lignesDe, cumul, dist } from './geo.js';

/** Natures de tronçon qu'une route carrossable ne comprend pas. */
export const NATURES_EXCLUES = new Set(['Sentier', 'Escalier', 'Piste cyclable']);

/**
 * Un tronçon sur lequel roule un véhicule léger : ni sentier, escalier ou piste cyclable, ni accès « physiquement
 * impossible », ni objet à l'état de projet.
 */
export function estRoutier(feature) {
  const p = feature?.properties || {};
  return !NATURES_EXCLUES.has(p.nature) && p.acces_vehicule_leger !== 'Physiquement impossible' && p.etat_de_l_objet !== 'Projet';
}

/**
 * Un nom de voie ramené à ses mots distinctifs : minuscules, sans accents ni ponctuation, sans les mots de type
 * (rue, avenue, chemin…) ni les articles. Sert à rapprocher « Av. des Tests » de « AVENUE DES TESTS ».
 */
export function normaliserNom(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(rue|r|route|rte|chemin|che|avenue|av|boulevard|bd|impasse|place|de|du|des|la|le|les|d|l)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Le sens de circulation de la BD TOPO, en quatre valeurs : `double`, `direct`, `inverse`, `inconnu`. */
export function sensDe(valeur) {
  if (valeur === 'Double sens') return 'double';
  if (valeur === 'Sens direct') return 'direct';
  if (valeur === 'Sens inverse') return 'inverse';
  return 'inconnu';
}

/**
 * Les sens dans lesquels une arête se parcourt : `direct` = du premier au dernier point de la géométrie, `inverse` =
 * l'inverse. Un sens inconnu (« Sans objet ») n'interdit rien.
 */
export function sensAutorises(arete) {
  return { direct: arete.sens !== 'inverse', inverse: arete.sens !== 'direct' };
}

/**
 * Nombre de voies dans UN sens. La BD TOPO ne porte que le nombre total de voies : sur un double sens on en
 * attribue la moitié (arrondie au-dessus), sur un sens unique toutes. Une heuristique, pas une donnée ; une valeur
 * absente donne 1.
 */
export function voiesParSens(arete) {
  const nv = Math.max(1, Number(arete.nombreDeVoies) || 1);
  return arete.sens === 'direct' || arete.sens === 'inverse' ? nv : Math.max(1, Math.ceil(nv / 2));
}

const cleNoeud = (p) => `${p[0].toFixed(7)}:${p[1].toFixed(7)}`;
const nombreOuNull = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * Construit le graphe d'une liste de tronçons GeoJSON (WGS84).
 *
 * @param {object[]} features entités `LineString` portant les attributs de `troncon_de_route`
 * @param {object} [o]
 * @param {boolean} [o.tous] garder aussi les sentiers, escaliers, pistes cyclables et accès impossibles
 * @param {(f: object) => boolean} [o.filtre] critère supplémentaire
 * @param {number[]} [o.centre] `[lng, lat]` du repère local (par défaut le premier point lu)
 * @returns {{
 *   repere: ({vers: Function, depuis: Function}|null),
 *   noeuds: Array<{id: number, pt: number[], inc: number[]}>,
 *   aretes: Array<object>,
 *   parCleabs: Map<string, object>,
 *   cache: Map<string, object>,
 *   ignores: {nonRoutiers: number, sansGeometrie: number, tropCourts: number, lignesEcartees: number}
 * }}
 *   Chaque arête : `id`, `cleabs`, `pts` (mètres), `cum`, `L` (longueur, m), `a` et `b` (nœuds de début et de fin),
 *   `boucle`, `bb` (emprise en mètres), `noms` (Set de noms normalisés), `nums` (Set de numéros de route), `nature`,
 *   `rond` (rond-point), `sens`, `nombreDeVoies`, `largeur`, `importance`, `niveau`, `vitesseMoyenne` (km/h, une
 *   MOYENNE et non une limite), `props` (attributs d'origine).
 */
export function construireGraphe(features, o = {}) {
  const ignores = { nonRoutiers: 0, sansGeometrie: 0, tropCourts: 0, lignesEcartees: 0 };
  const retenus = [];
  for (const f of features || []) {
    if (!o.tous && !estRoutier(f)) { ignores.nonRoutiers++; continue; }
    if (o.filtre && !o.filtre(f)) { ignores.nonRoutiers++; continue; }
    const lns = lignesDe(f.geometry).filter((l) => Array.isArray(l) && l.length >= 2);
    if (!lns.length) { ignores.sansGeometrie++; continue; }
    ignores.lignesEcartees += lns.length - 1;
    retenus.push({ f, ligne: lns[0] });
  }
  const vide = { repere: null, noeuds: [], aretes: [], parCleabs: new Map(), cache: new Map(), ignores };
  if (!retenus.length) return vide;

  const centre = o.centre || retenus[0].ligne[0];
  const repere = creerRepere(centre[0], centre[1]);
  const noeudsParCle = new Map();
  const noeuds = [];
  const aretes = [];
  const noeud = (p) => {
    const k = cleNoeud(p);
    let n = noeudsParCle.get(k);
    if (!n) {
      n = { id: noeuds.length, pt: repere.vers(p), inc: [] };
      noeudsParCle.set(k, n);
      noeuds.push(n);
    }
    return n;
  };

  for (const { f, ligne } of retenus) {
    const pts = [];
    for (const q of ligne.map((z) => repere.vers(z))) {
      const dernier = pts[pts.length - 1];
      if (!dernier || dist(q, dernier) > 0.02) pts.push(q);
    }
    if (pts.length < 2) { ignores.tropCourts++; continue; }
    const na = noeud(ligne[0]);
    const nb = noeud(ligne[ligne.length - 1]);
    const p = f.properties || {};
    const cum = cumul(pts);
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    const cleabs = String(p.cleabs ?? f.id ?? `arete-${aretes.length}`);
    const arete = {
      id: aretes.length,
      cleabs,
      pts,
      cum,
      L: cum[cum.length - 1],
      a: na.id,
      b: nb.id,
      boucle: na === nb,
      bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      noms: new Set([p.nom_collaboratif_gauche, p.nom_collaboratif_droite, p.nom_voie_ban_gauche, p.cpx_toponyme_route_nommee]
        .filter(Boolean).map(normaliserNom).filter(Boolean)),
      nums: new Set(String(p.cpx_numero || '').split(/[,;/\s]+/).filter(Boolean)),
      nature: p.nature ?? null,
      rond: p.nature === 'Rond-point',
      sens: sensDe(p.sens_de_circulation),
      nombreDeVoies: nombreOuNull(p.nombre_de_voies),
      largeur: nombreOuNull(p.largeur_de_chaussee),
      importance: nombreOuNull(p.importance),
      niveau: nombreOuNull(p.position_par_rapport_au_sol),
      vitesseMoyenne: nombreOuNull(p.vitesse_moyenne_vl),
      props: p,
    };
    aretes.push(arete);
    na.inc.push(arete.id);
    if (nb !== na) nb.inc.push(arete.id);
  }
  if (!aretes.length) return vide;
  return { repere, noeuds, aretes, parCleabs: new Map(aretes.map((e) => [e.cleabs, e])), cache: new Map(), ignores };
}

/**
 * Les composantes connexes du graphe (non orienté) : liste de listes d'identifiants d'arêtes, la plus grande
 * d'abord. Utile pour repérer un réseau coupé (un tronçon manquant, une emprise qui tranche une route).
 */
export function composantesConnexes(graphe) {
  const vu = new Uint8Array(graphe.aretes.length);
  const out = [];
  for (const depart of graphe.aretes) {
    if (vu[depart.id]) continue;
    const comp = [];
    const pile = [depart.id];
    vu[depart.id] = 1;
    while (pile.length) {
      const e = graphe.aretes[pile.pop()];
      comp.push(e.id);
      for (const n of [e.a, e.b]) {
        for (const i of graphe.noeuds[n].inc) if (!vu[i]) { vu[i] = 1; pile.push(i); }
      }
    }
    out.push(comp);
  }
  return out.sort((x, y) => y.length - x.length);
}

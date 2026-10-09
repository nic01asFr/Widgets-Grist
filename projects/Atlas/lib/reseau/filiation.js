/**
 * Filiation de tronçons entre deux états d'un réseau : que sont devenus les tronçons d'avant ?
 *
 * La BD TOPO annonce des identifiants (`cleabs`) « uniques et stables dans le temps ». En pratique, quand un tronçon
 * est découpé, fusionné ou redessiné, tantôt son `cleabs` survit sur un morceau, tantôt il disparaît et un nouveau
 * apparaît. Aucune table de correspondance n'est publiée : le Différentiel BD TOPO donne les objets détruits, créés ou
 * modifiés, mais pas « remplacé par ». Tout ce qui est accroché à un tronçon par son `cleabs` (un repère linéaire, un
 * objet métier, une règle, une annotation) se perd donc silencieusement à chaque édition trimestrielle.
 *
 * Ce module reconstitue la filiation **par recouvrement géométrique**, en s'appuyant sur les `cleabs` conservés :
 *
 *   filiation(anciens, nouveaux, opts) -> { liens, composantes, parNouveau, parAncien, resume, cleabsOrigine }
 *   separerDifferentiel(features, { depuis }) -> { detruits, vivants, crees, modifies }
 *   nouvellesAvecOrigine(nouveaux, resultat) -> [{ cleabs, geometry, cleabs_origine }]
 *
 * `anciens` et `nouveaux` : `[{ cleabs, coordinates: [[lng, lat], …] }]`, ou des `Feature` GeoJSON `LineString`
 * portant `properties.cleabs`.
 *
 * ## Règles
 *
 * 1. Un `cleabs` présent des deux côtés est **conservé** (lien `meme_cleabs`) ; sa géométrie a pu changer.
 * 2. Pour les autres, lien ancien -> nouveau si la longueur du nouveau portée par l'ancien (à `tol` près, caps
 *    concordants à `capMax` près, sens ignoré), ou celle de l'ancien portée par le nouveau, atteint
 *    `recouvrementMin` de la plus courte des deux ET au moins `absMin` mètres. Un `cleabs` conservé dont moins de
 *    90 % de la longueur se retrouve sous son propre `cleabs` est aussi testé contre les seuls `cleabs` nouveaux
 *    (scission qui garde un `cleabs`).
 * 3. Les composantes connexes du graphe de liens donnent le type : `remplacement` (1-1), `scission` (1-n), `fusion`
 *    (n-1), `remaniement` (n-m), `supprime` (n-0), `cree` (0-n).
 *
 * ## Articulation avec une migration d'ancrage
 *
 * Une migration d'ancrage (repère linéaire « tronçon + abscisse » qu'on déplace d'une édition à la suivante) a besoin,
 * pour chaque nouveau tronçon, de la liste des anciens `cleabs` dont il descend : c'est `cleabsOrigine(nouveau)`, et
 * `nouvellesAvecOrigine` produit la liste `{ cleabs, geometry, cleabs_origine }` que consomme une fonction de
 * migration. **Ce module ne contient aucun code d'ancrage** : il ne connaît ni abscisse, ni contrat de repère
 * linéaire ; il dit seulement qui descend de qui. L'ancrage qui l'utilisera est étudié dans une autre branche.
 *
 * ## Ce qui est mesuré, et ce qui ne l'est pas
 *
 * Testé sur des cas synthétiques (scission, fusion, remplacement, suppression, création, croisement, chaussées
 * parallèles), rejoué sur un extrait réel du Différentiel BD TOPO, et **validé sur deux éditions complètes** d'un
 * département (`tools/valider-filiation.mjs`, détail dans `docs/DONNEES-IGN.md` § 6) :
 *
 * - vérité SYNTHÉTIQUE (identités masquées, scissions et fusions fabriquées sur les tronçons conservés) : sur des fenêtres de
 *   test distinctes de celles de réglage, 96 à 99 % des liens vrais retrouvés sans bruit, 83 % avec 4 m de bruit de
 *   numérisation ; les seuils par défaut sont à 1,4 point de F1 de l'optimum, ils sont conservés ;
 * - sur les vrais tronçons détruits, 62 % ont un successeur ; les liens proposés ont la même importance (90 % contre 67 % au
 *   hasard entre voisins), la même nature (86 contre 70 %), le même nom (100 contre 55 %) ;
 * - **aucune table de correspondance officielle n'existe** (cherchée dans le GeoPackage, les attributs et les métadonnées) :
 *   la filiation réelle n'a donc pas de vérité, seulement des indices.
 *
 * On sait aussi que deux chaussées à moins de `tol` m l'une de l'autre sont confondues, que l'ancienne géométrie d'un objet
 * MODIFIÉ n'est dans aucun service (il faut avoir conservé l'état précédent, ou télécharger l'édition précédente), et que
 * 38 % des tronçons détruits n'ont aucun successeur géométrique (dont 32 routes à 1 chaussée sur 49 : suppression, ou
 * remplacement qui ne recoupe pas, on ne sait pas).
 */

import { creerRepere, lignesDe, cumul, pointA, projLigne, cap, ecartCap } from './geo.js';

export const DEFAUTS = Object.freeze({ tol: 5, pas: 2, recouvrementMin: 0.5, absMin: 5, capMax: 35 });

function normaliser(liste) {
  return (liste || [])
    .map((t) => (t.type === 'Feature'
      ? { cleabs: t.properties?.cleabs, coordinates: lignesDe(t.geometry)[0] }
      : { cleabs: t.cleabs, coordinates: t.coordinates || lignesDe(t.geometry)[0] }))
    .filter((t) => t.cleabs !== undefined && t.cleabs !== null && t.coordinates && t.coordinates.length >= 2);
}

function preparer(liste, repere) {
  return liste.map((t) => {
    const pts = t.coordinates.map(repere.vers);
    const cum = cumul(pts);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { cleabs: t.cleabs, pts, cum, L: cum[cum.length - 1], bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], coordinates: t.coordinates };
  });
}

/** Longueur de `a` portée par `b` (à `tol` près, caps concordants, sens ignoré), échantillonnée tous les `pas` m. */
function portee(a, b, o) {
  const n = Math.max(1, Math.ceil(a.L / o.pas));
  let ok = 0;
  for (let k = 0; k <= n; k++) {
    const s = (a.L * k) / n;
    const p = pointA(a.pts, a.cum, s);
    const r = projLigne(p, b.pts, b.cum);
    if (r.d > o.tol) continue;
    const ca = cap(pointA(a.pts, a.cum, Math.max(0, s - 3)), pointA(a.pts, a.cum, Math.min(a.L, s + 3)));
    const e = ecartCap(ca, r.cap);
    if (Math.min(e, 180 - e) <= o.capMax) ok++;
  }
  return (a.L * ok) / (n + 1);
}

const voisines = (a, n, tol) => !(n.bb[0] > a.bb[2] + tol || n.bb[2] < a.bb[0] - tol || n.bb[1] > a.bb[3] + tol || n.bb[3] < a.bb[1] - tol);

/**
 * La filiation entre l'état `anciensBruts` et l'état `nouveauxBruts`.
 * @param {object[]} anciensBruts
 * @param {object[]} nouveauxBruts
 * @param {{tol?: number, pas?: number, recouvrementMin?: number, absMin?: number, capMax?: number}} [opts]
 *   `tol` (m, 5) : écart toléré entre deux géométries ; `pas` (m, 2) : échantillonnage ; `recouvrementMin` (0,5) : part de
 *   la plus courte des deux ; `absMin` (m, 5) : recouvrement minimal absolu ; `capMax` (deg, 35) : écart de cap toléré
 * @returns {{
 *   liens: {de: string, vers: string, type: string, recouvrement_m: number, longueur_ancienne_m: number, longueur_nouvelle_m: number}[],
 *   composantes: {type: string, anciens: string[], nouveaux: string[], cleabs_conserves?: string[]}[],
 *   parNouveau: Record<string, string[]>, parAncien: Record<string, string[]>, resume: Record<string, number>,
 *   cleabsOrigine: (cleabsNouveau: string) => string[]
 * }}
 *   Types de lien : `meme_cleabs`, `recouvrement`, `absorbe_par_cleabs_conserve`.
 */
export function filiation(anciensBruts, nouveauxBruts, opts) {
  const o = { ...DEFAUTS, ...(opts || {}) };
  for (const [k, v] of Object.entries(o)) if (!Number.isFinite(v) || v < 0) throw new Error(`réglage de filiation invalide : ${k} = ${v}`);
  const A0 = normaliser(anciensBruts);
  const N0 = normaliser(nouveauxBruts);
  const premier = A0[0] || N0[0];
  const vide = { liens: [], composantes: [], parNouveau: {}, parAncien: {}, resume: {}, cleabsOrigine: () => [] };
  if (!premier) return vide;
  const repere = creerRepere(premier.coordinates[0][0], premier.coordinates[0][1]);
  const A = preparer(A0, repere);
  const N = preparer(N0, repere);
  const parCleN = new Map(N.map((t) => [t.cleabs, t]));
  const parCleA = new Map(A.map((t) => [t.cleabs, t]));
  const liens = [];

  // (1) cleabs conservés
  for (const a of A) {
    const n = parCleN.get(a.cleabs);
    if (n) {
      liens.push({
        de: a.cleabs, vers: n.cleabs, type: 'meme_cleabs', recouvrement_m: Math.min(portee(a, n, o), portee(n, a, o)),
        longueur_ancienne_m: a.L, longueur_nouvelle_m: n.L,
      });
    }
  }

  // (2) recouvrement pour les autres
  const reste = A.filter((a) => !parCleN.has(a.cleabs));
  const nouveauxLibres = N.filter((n) => !parCleA.has(n.cleabs));
  const conservesAmputes = A.filter((a) => { const n = parCleN.get(a.cleabs); return n && portee(a, n, o) < 0.9 * a.L; });
  const testes = [...reste.map((a) => [a, N]), ...conservesAmputes.map((a) => [a, nouveauxLibres])];
  for (const [a, cibles] of testes) {
    for (const n of cibles) {
      if (n.cleabs === a.cleabs || !voisines(a, n, o.tol)) continue;
      const ov = Math.min(portee(a, n, o), portee(n, a, o));
      const mini = Math.min(a.L, n.L);
      if (ov >= o.absMin && ov >= o.recouvrementMin * mini) {
        liens.push({
          de: a.cleabs, vers: n.cleabs, type: parCleA.has(n.cleabs) ? 'absorbe_par_cleabs_conserve' : 'recouvrement', recouvrement_m: ov,
          longueur_ancienne_m: a.L, longueur_nouvelle_m: n.L,
        });
      }
    }
  }

  // (3) composantes connexes (hors liens meme_cleabs, triviaux) : graphe biparti anciens / nouveaux
  const pere = new Map();
  const racine = (x) => { while (pere.get(x) !== x) { pere.set(x, pere.get(pere.get(x))); x = pere.get(x); } return x; };
  const noeud = (cote, c) => { const k = `${cote}:${c}`; if (!pere.has(k)) pere.set(k, k); return k; };
  const reels = liens.filter((l) => l.type !== 'meme_cleabs');
  for (const l of reels) pere.set(racine(noeud('a', l.de)), racine(noeud('n', l.vers)));
  const avecLien = new Set(reels.map((l) => l.de));
  const groupes = new Map();
  for (const a of A) {
    if (parCleN.has(a.cleabs) && !avecLien.has(a.cleabs)) continue;
    const k = racine(noeud('a', a.cleabs));
    if (!groupes.has(k)) groupes.set(k, { anciens: [], nouveaux: [] });
    groupes.get(k).anciens.push(a.cleabs);
  }
  for (const l of reels) {
    const g = groupes.get(racine(noeud('n', l.vers)));
    if (g && !g.nouveaux.includes(l.vers)) g.nouveaux.push(l.vers);
  }
  const composantes = [...groupes.values()].map((g) => {
    const a = g.anciens.length;
    const n = g.nouveaux.length;
    let type;
    if (n === 0) type = 'supprime';
    else if (a === 1 && n === 1) type = 'remplacement';
    else if (a === 1) type = 'scission';
    else if (n === 1) type = 'fusion';
    else type = 'remaniement';
    return { type, anciens: g.anciens, nouveaux: g.nouveaux, cleabs_conserves: g.anciens.filter((c) => parCleN.has(c)) };
  });
  // nouveaux « créés » : sans aucun prédécesseur (hors cleabs conservés)
  const aUnPredecesseur = new Set(liens.map((l) => l.vers));
  for (const n of nouveauxLibres) {
    if (!aUnPredecesseur.has(n.cleabs)) composantes.push({ type: 'cree', anciens: [], nouveaux: [n.cleabs] });
  }
  const parNouveau = {};
  const parAncien = {};
  for (const l of liens) {
    (parNouveau[l.vers] = parNouveau[l.vers] || []).push(l.de);
    (parAncien[l.de] = parAncien[l.de] || []).push(l.vers);
  }
  const resume = {};
  for (const c of composantes) resume[c.type] = (resume[c.type] || 0) + 1;
  resume.meme_cleabs = liens.filter((l) => l.type === 'meme_cleabs').length;
  return {
    liens, composantes, parNouveau, parAncien, resume,
    /** Les anciens `cleabs`, différents du sien, dont descend ce nouveau tronçon. */
    cleabsOrigine: (cleabsNouveau) => (parNouveau[cleabsNouveau] || []).filter((c) => c !== cleabsNouveau),
  };
}

/**
 * Sépare les objets du Différentiel BD TOPO (`BDTOPO_V3_DIFF:troncon_de_route`, voir `wfs-bdtopo.js`) :
 * `detruits` (`detruit = true`, géométrie de l'ANCIEN état), `vivants` (les autres), et, si `depuis` est donné
 * (date ISO `AAAA-MM-JJ` de l'édition précédente), parmi les vivants, `crees` (`date_creation >= depuis`, nouveau
 * `cleabs`) et `modifies` (créés avant, donc `cleabs` conservé et géométrie nouvelle).
 *
 * L'ancienne géométrie d'un objet modifié n'est pas dans le Différentiel : `filiation(detruits, vivants)` retrouve ce
 * qu'est devenu un tronçon DÉTRUIT, pas ce qu'a changé un tronçon modifié.
 */
export function separerDifferentiel(features, { depuis } = {}) {
  const valides = (features || []).filter((f) => f.geometry && f.geometry.type === 'LineString');
  const detruits = valides.filter((f) => f.properties?.detruit === true || f.properties?.detruit === 'true');
  const vivants = valides.filter((f) => !detruits.includes(f));
  if (!depuis) return { detruits, vivants, crees: [], modifies: [] };
  const crees = vivants.filter((f) => String(f.properties?.date_creation || '') >= depuis);
  const modifies = vivants.filter((f) => String(f.properties?.date_creation || '') < depuis);
  return { detruits, vivants, crees, modifies };
}

/**
 * Les nouveaux tronçons avec leurs origines : `[{ cleabs, geometry, cleabs_origine }]`, le format d'entrée d'une
 * migration d'ancrage.
 * @param {object[]} nouveaux ceux passés à `filiation` (Feature ou `{cleabs, coordinates}`)
 * @param {{cleabsOrigine: Function}} resultat sortie de `filiation`
 */
export function nouvellesAvecOrigine(nouveaux, resultat) {
  return normaliser(nouveaux).map((n) => ({
    cleabs: n.cleabs,
    geometry: { type: 'LineString', coordinates: n.coordinates },
    cleabs_origine: resultat.cleabsOrigine(n.cleabs),
  }));
}

/**
 * La filiation d'un extrait du Différentiel BD TOPO, prête à lire : détruits contre vivants (`separerDifferentiel`),
 * avec, pour chaque composante qui part d'anciens tronçons, ce que sont devenues leurs cibles.
 *
 * Précaution de lecture : dans `composantes`, tout vivant sans prédécesseur est étiqueté `cree`, y compris un tronçon
 * simplement MODIFIÉ (même `cleabs`, nouvelle géométrie) que rien ne relie à un détruit. Le bilan ci-dessous distingue
 * les deux par `date_creation` et `depuis`.
 *
 * @param {object[]} features entités du Différentiel
 * @param {{depuis?: string} & Parameters<typeof filiation>[2]} [o] `depuis` : date ISO de l'édition précédente
 * @returns {ReturnType<typeof filiation> & {detruits: number, avecSuccesseur: number, sansSuccesseur: number,
 *   creesSansPredecesseur: number, bilan: Record<string, number>}}
 *   `bilan` : « type -> nature des cibles », par exemple `remplacement -> modifie_cleabs_conserve`, `supprime`.
 */
export function filiationDifferentiel(features, { depuis, ...opts } = {}) {
  const { detruits, vivants, crees, modifies } = separerDifferentiel(features, { depuis });
  const f = filiation(detruits, vivants, opts);
  const nature = new Map([
    ...crees.map((x) => [x.properties.cleabs, 'cree']),
    ...modifies.map((x) => [x.properties.cleabs, 'modifie_cleabs_conserve']),
  ]);
  const bilan = {};
  for (const c of f.composantes) {
    if (!c.anciens.length) continue;
    const cibles = c.nouveaux.length ? ` -> ${[...new Set(c.nouveaux.map((n) => nature.get(n) || 'vivant'))].sort().join('+')}` : '';
    const cle = c.type + cibles;
    bilan[cle] = (bilan[cle] || 0) + 1;
  }
  const lies = new Set(f.liens.filter((l) => l.type !== 'meme_cleabs').map((l) => l.de));
  return {
    ...f,
    detruits: detruits.length,
    avecSuccesseur: lies.size,
    sansSuccesseur: detruits.length - lies.size,
    creesSansPredecesseur: crees.filter((c) => !f.parNouveau[c.properties.cleabs]).length,
    bilan,
  };
}

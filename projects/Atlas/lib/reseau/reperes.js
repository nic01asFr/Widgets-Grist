/**
 * Les repères routiers (PR, « points de repère ») de la BD TOPO : de « route + PR + abscisse » à une position, et d'une
 * position à « route + PR + abscisse ».
 *
 *   indexerReperes(points, sections)       construit l'index à partir des entités WFS `point_de_repere` et
 *                                          `section_de_points_de_repere` (ou `chargerReperes` qui les lit)
 *   resoudre(idx, { route, pr, abscisse, cote, departement })      -> { lng, lat, … }
 *   intervalle(idx, { route, debut, fin, cote, departement })      -> la ligne entre deux repères
 *   localiser(idx, [lng, lat], { route, rayonM })                  -> { route, pr, abscisse, distance, cote, … }
 *   plusProches(idx, [lng, lat], n, { route })                     -> les n repères les plus proches
 *   lirePR(texte) / formater(…)                                    « D13 PR 17+955 » <-> { route, pr, abscisse }
 *
 * ## Principe
 *
 * Chaque repère porte l'identifiant de la section qui le contient. On le projette sur la ligne de cette section pour
 * obtenir son abscisse curviligne (mètres), on avance de `abscisse` mètres le long de la ligne dans le sens des PR
 * croissants, et la position reste TOUJOURS sur la ligne. Inversement, un point se projette sur la section la plus proche
 * et on lit le dernier repère rencontré dans le sens des PR croissants et la distance depuis lui.
 *
 * ## Ce que la BD TOPO impose (mesuré, voir `docs/DONNEES-IGN.md`)
 *
 * - **L'abscisse est une distance en mètres depuis le PR, pas une fraction de kilomètre.** Les PR ne sont pas espacés de
 *   1 000 m (de 900 à plus de 4 000 m selon les routes) ; une abscisse supérieure à 1 000 est valide.
 * - **Les points de début et de fin de section (`DS`, `FS`) reprennent un numéro de PR sans en être un** : ils sont écartés.
 *   `PR0` est le début de la route, `PRF` le dernier point ; la convention `999+0` désigne la fin de la route.
 * - **Une route peut avoir plusieurs sections** (chaînées si la lacune entre elles est de 30 m au plus ; au-delà, chaque
 *   chaîne est une « composante »), **plusieurs côtés** (`U` unique, `G` gauche et `D` droite pour les chaussées
 *   séparées) et **le même numéro dans plusieurs départements** (« D13 »). La numérotation des PR repart aussi à chaque
 *   département sur une route nationale. D'où `departement` et `pres`, et l'erreur `pr_ambigu` plutôt qu'un choix silencieux.
 * - **Un PR peut manquer** (numéros qui sautent) : erreur `pr_inconnu` avec les voisins disponibles, ou, sur demande
 *   (`interpoler`), une position estimée signalée.
 * - **Une abscisse peut dépasser la section** : on repart du PR d'abscisse cumulée la plus proche (attribut `abscisse`
 *   du repère) ; si la position tombe encore hors des lignes, erreur `abscisse_hors_section`, jamais une extrapolation.
 *
 * ## Ce qui n'est PAS vérifié
 *
 * Que la position calculée soit celle du PR PHYSIQUE posé par le gestionnaire (la borne sur le bord de la route) : la
 * BD TOPO donne la position de chaque PR et la ligne de la section, on interpole entre les deux. Le seul contrôle
 * disponible ici est la cohérence interne (aller-retour, et abscisses publiées contre longueurs de ligne).
 *
 * Module pur ; `chargerReperes` est le seul à lire le réseau (`fetch` injectable).
 */

import { creerRepere, cumul, pointA, projLigne, lignesDe, dist } from './geo.js';
import { COUCHES, lireCouche, empriseDeLignes } from './wfs-bdtopo.js';

/** Types de repère qui sont de vrais PR (les `DS` / `FS` délimitent une section). */
export const TYPES_PR = new Set(['PR', 'PR0', 'PRF']);

/** Codes d'erreur : `route_inconnue`, `cote_ambigu`, `cote_inconnu`, `pr_inconnu`, `pr_ambigu`, `abscisse_hors_section`, `parametre_invalide`. */
export class ErreurReperes extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ErreurReperes';
    this.code = code;
    Object.assign(this, details);
  }
}

const normRoute = (r) => String(r ?? '').replace(/\s+/g, '').toUpperCase();
const suffixe = (id) => { const m = /-(\d+)$/.exec(id || ''); return m ? Number(m[1]) : 0; };
const longueurDe = (c) => c.cum[c.cum.length - 1];

/**
 * Construit l'index des repères.
 * @param {object[]} points entités `point_de_repere` (propriétés `route`, `numero`, `abscisse`, `cote`, `type_de_pr`,
 *   `identifiant_de_section`, `code_insee_du_departement`)
 * @param {object[]} sections entités `section_de_points_de_repere` (`numero_de_route`, `cote`, `identifiant_de_section`, ligne)
 * @param {{ecartMax?: number, rayonProjection?: number}} [o] `ecartMax` : lacune maximale entre deux sections chaînées
 *   (30 m) ; `rayonProjection` : distance maximale d'un repère à la ligne de sa route (50 m)
 */
export function indexerReperes(points, sections, o = {}) {
  const ecartMax = o.ecartMax ?? 30;
  const rayonProjection = o.rayonProjection ?? 50;
  const lignesSections = sections.map((f) => ({ f, ln: lignesDe(f.geometry)[0] })).filter((x) => x.ln && x.ln.length >= 2);
  const idx = { repere: null, voies: new Map(), points: [], rejets: { sansSection: 0, trop_loin: 0, numeroIllisible: 0 }, sectionsLues: lignesSections.length };
  if (!lignesSections.length) return idx;
  const centre = lignesSections[0].ln[0];
  const R = creerRepere(centre[0], centre[1]);
  idx.repere = R;

  const parRoute = new Map();
  for (const s of lignesSections) {
    const p = s.f.properties || {};
    const key = `${normRoute(p.numero_de_route)}|${p.cote || 'U'}`;
    if (!parRoute.has(key)) parRoute.set(key, { route: normRoute(p.numero_de_route), cote: p.cote || 'U', sections: [], points: [] });
    parRoute.get(key).sections.push({ id: p.identifiant_de_section, ln: s.ln.map((q) => R.vers(q)) });
  }
  for (const f of points) {
    const p = f.properties || {};
    const g = f.geometry && f.geometry.type === 'Point' ? f.geometry.coordinates : null;
    if (!g) continue;
    const key = `${normRoute(p.route)}|${p.cote || 'U'}`;
    const voie = parRoute.get(key);
    if (!voie) { idx.rejets.sansSection++; continue; }
    voie.points.push({
      type: p.type_de_pr, numero: p.numero, n: TYPES_PR.has(p.type_de_pr) && /^\d+$/.test(String(p.numero)) ? Number(p.numero) : null,
      ab: p.abscisse === null || p.abscisse === undefined ? null : Number(p.abscisse), section: p.identifiant_de_section, dep: p.code_insee_du_departement || null,
      libelle: p.libelle || null, xy: R.vers(g), lnglat: [g[0], g[1]],
    });
  }

  for (const voie of parRoute.values()) {
    // ordre des sections : abscisse minimale de leurs PR (l'ordre du référentiel), à défaut suffixe de l'identifiant
    const abMin = new Map();
    for (const p of voie.points) if (p.n !== null && p.ab !== null) abMin.set(p.section, Math.min(abMin.has(p.section) ? abMin.get(p.section) : Infinity, p.ab));
    const cle = (s) => (abMin.has(s.id) ? abMin.get(s.id) : Infinity);
    const secs = voie.sections.slice().sort((a, b) => (cle(a) === cle(b) ? 0 : cle(a) < cle(b) ? -1 : 1) || suffixe(a.id) - suffixe(b.id));
    const comps = [];
    for (const s of secs) {
      const cur = comps[comps.length - 1];
      if (cur) {
        const fin = cur.ln[cur.ln.length - 1];
        const d = dist(fin, s.ln[0]);
        if (d <= ecartMax) {
          cur.ln.push(...s.ln.slice(d < 0.01 ? 1 : 0));
          cur.cum = cumul(cur.ln);
          cur.sections.push(s.id);
          continue;
        }
      }
      comps.push({ ln: s.ln.slice(), cum: cumul(s.ln), sections: [s.id], pts: [], bornes: [] });
    }
    // projeter chaque repère sur la composante la plus proche
    for (const p of voie.points) {
      if (p.type !== 'DS' && p.type !== 'FS' && p.n === null) { idx.rejets.numeroIllisible++; continue; }
      let best = null;
      comps.forEach((c, ci) => {
        const pr = projLigne(p.xy, c.ln, c.cum);
        if (pr && (!best || pr.d < best.d)) best = { ci, s: pr.s, d: pr.d };
      });
      if (!best || best.d > rayonProjection) { idx.rejets.trop_loin++; continue; }
      const q = { ...p, ci: best.ci, s: best.s, dProj: best.d };
      if (p.type === 'DS' || p.type === 'FS') comps[best.ci].bornes.push(q);
      else comps[best.ci].pts.push(q);
    }
    for (const c of comps) {
      c.pts.sort((a, b) => a.n - b.n);
      // sens des PR croissants le long de la ligne : corrélation numéro / abscisse curviligne ; sinon points DS / FS ; sinon +1 (signalé)
      let corr = 0;
      for (let i = 1; i < c.pts.length; i++) corr += Math.sign(c.pts[i].s - c.pts[i - 1].s);
      if (c.pts.length >= 2 && corr !== 0) c.sens = corr < 0 ? -1 : 1;
      else {
        const L = longueurDe(c);
        const ds = c.bornes.find((b) => b.type === 'DS');
        const fs = c.bornes.find((b) => b.type === 'FS');
        if (ds && fs && Math.abs(fs.s - ds.s) > 1) c.sens = fs.s > ds.s ? 1 : -1;
        else if (ds) c.sens = ds.s < L / 2 ? 1 : -1;
        else if (fs) c.sens = fs.s > L / 2 ? 1 : -1;
        else { c.sens = 1; c.sensIncertain = true; }
      }
      c.departements = new Set(c.pts.map((p) => p.dep).filter(Boolean));
      c.bb = [Math.min(...c.ln.map((q) => q[0])), Math.min(...c.ln.map((q) => q[1])), Math.max(...c.ln.map((q) => q[0])), Math.max(...c.ln.map((q) => q[1]))];
      for (const p of c.pts) idx.points.push({ route: voie.route, cote: voie.cote, ...p, comp: c });
    }
    if (!idx.voies.has(voie.route)) idx.voies.set(voie.route, new Map());
    idx.voies.get(voie.route).set(voie.cote, { route: voie.route, cote: voie.cote, comps });
  }
  return idx;
}

/** Les routes de l'index, avec leurs côtés, nombre de repères et départements. */
export function routesIndexees(idx) {
  return [...idx.voies.entries()].map(([route, cotes]) => ({
    route,
    cotes: [...cotes.keys()],
    reperes: [...cotes.values()].reduce((a, v) => a + v.comps.reduce((b, c) => b + c.pts.length, 0), 0),
    departements: [...new Set([...cotes.values()].flatMap((v) => v.comps.flatMap((c) => [...c.departements])))].sort(),
  }));
}

function choisirVoie(idx, route, cote) {
  const r = normRoute(route);
  const cotes = idx.voies.get(r);
  if (!cotes) throw new ErreurReperes('route_inconnue', `Aucun repère chargé pour la route ${r}.`, { route: r });
  if (cote) {
    if (!cotes.has(cote)) throw new ErreurReperes('cote_inconnu', `La route ${r} n’a pas de côté ${cote} (côtés : ${[...cotes.keys()].join(', ')}).`, { route: r, cotes: [...cotes.keys()] });
    return cotes.get(cote);
  }
  if (cotes.has('U')) return cotes.get('U');
  if (cotes.size === 1) return [...cotes.values()][0];
  throw new ErreurReperes('cote_ambigu', `La route ${r} a plusieurs côtés (${[...cotes.keys()].join(', ')}) : précisez \`cote\`.`, { route: r, cotes: [...cotes.keys()] });
}

/** Position `{ comp, s, note }` du repère n, décalée de `abscisse` mètres dans le sens des PR croissants. */
function position(voie, { pr, abscisse = 0, departement, pres, interpoler }) {
  const tous = voie.comps.flatMap((c) => c.pts);
  let cands = tous.filter((p) => p.n === pr && (!departement || p.dep === departement));
  let note = null;
  if (!cands.length && pr >= 999) { // convention : 999+0 = fin de la route
    const prf = tous.filter((p) => p.type === 'PRF' && (!departement || p.dep === departement));
    if (prf.length) cands = [prf.sort((a, b) => (b.ab ?? 0) - (a.ab ?? 0))[0]];
    else {
      const c = voie.comps[voie.comps.length - 1];
      return { comp: c, s: c.sens > 0 ? longueurDe(c) : 0, note: 'fin_de_route_sans_PRF' };
    }
    note = 'fin_de_route';
  }
  let estime = false;
  if (!cands.length) {
    const nums = [...new Set(tous.filter((p) => !departement || p.dep === departement).map((p) => p.n))].sort((a, b) => a - b);
    const avant = [...nums].reverse().find((n) => n < pr);
    const apres = nums.find((n) => n > pr);
    if (interpoler && avant !== undefined && apres !== undefined) {
      const pa = tous.find((p) => p.n === avant && (!departement || p.dep === departement));
      const pb = tous.find((p) => p.n === apres && (!departement || p.dep === departement));
      if (pa.comp === pb.comp || pa.ci === pb.ci) {
        const f = (pr - avant) / (apres - avant);
        cands = [{ ...pa, s: pa.s + f * (pb.s - pa.s), ab: pa.ab !== null && pb.ab !== null ? pa.ab + f * (pb.ab - pa.ab) : null }];
        estime = true;
        note = 'pr_interpole';
      }
    }
    if (!cands.length) {
      throw new ErreurReperes('pr_inconnu', `Le PR ${pr} de ${voie.route} (côté ${voie.cote}) n’existe pas dans les repères chargés.`,
        { route: voie.route, pr, avant: avant ?? null, apres: apres ?? null, disponibles: nums.slice(0, 40) });
    }
  }
  let p = cands[0];
  if (cands.length > 1) {
    const distincts = new Set(cands.map((c) => `${c.ci}|${c.dep}`));
    if (distincts.size > 1) {
      if (!pres) {
        throw new ErreurReperes('pr_ambigu', `Le PR ${pr} de ${voie.route} existe en plusieurs endroits (départements ${[...new Set(cands.map((c) => c.dep))].join(', ')}) : précisez \`departement\` ou \`pres\`.`,
          { route: voie.route, pr, departements: [...new Set(cands.map((c) => c.dep))] });
      }
      p = cands.map((c) => ({ c, d: dist(c.xy, pres) })).sort((a, b) => a.d - b.d)[0].c;
    }
  }
  const comp = p.comp ?? voie.comps[p.ci];
  const L = longueurDe(comp);
  let s = p.s + comp.sens * abscisse;
  if (s >= -1 && s <= L + 1) return { comp, s, note, ref: p, estime };
  // hors de la composante : repartir du repère d'abscisse cumulée la plus proche
  if (p.ab !== null) {
    const cible = p.ab + abscisse;
    const avecAb = tous.filter((q) => q.ab !== null && (!departement || q.dep === departement) && q.dep === p.dep).sort((a, b) => a.ab - b.ab);
    const ref = abscisse >= 0 ? [...avecAb].reverse().find((q) => q.ab <= cible) : avecAb.find((q) => q.ab >= cible);
    if (ref && ref !== p) {
      const c2 = voie.comps[ref.ci];
      const s2 = ref.s + c2.sens * (cible - ref.ab);
      if (s2 >= -1 && s2 <= longueurDe(c2) + 1) return { comp: c2, s: s2, note: 'repere_par_abscisse', ref, estime };
    }
  }
  const depassement = s > L ? s - L : -s;
  throw new ErreurReperes('abscisse_hors_section', `L’abscisse ${abscisse} m après le PR ${pr} de ${voie.route} dépasse la section de ${Math.round(depassement)} m.`,
    { route: voie.route, pr, abscisse, depassementM: depassement });
}

const versLngLat = (idx, comp, s) => idx.repere.depuis(...pointA(comp.ln, comp.cum, Math.max(0, Math.min(longueurDe(comp), s))));

/**
 * « Route + PR + abscisse » -> position.
 * @param {object} idx index de `indexerReperes`
 * @param {{route: string, pr: number, abscisse?: number, cote?: string, departement?: string, pres?: number[], interpoler?: boolean}} q
 *   `abscisse` en mètres depuis le PR (négatif : en deçà) ; `departement` : code INSEE (« 90 ») ; `pres` : position
 *   `[lng, lat]` qui départage deux PR de même numéro ; `interpoler` : accepter un PR manquant entre deux PR connus
 * @returns {{lng: number, lat: number, route: string, cote: string, pr: number, abscisse: number, section: string, departement: string|null, note: string|null}}
 * @throws {ErreurReperes}
 */
export function resoudre(idx, { route, pr, abscisse = 0, cote, departement, pres, interpoler = false } = {}) {
  if (!Number.isInteger(pr) || pr < 0 || !Number.isFinite(abscisse)) throw new ErreurReperes('parametre_invalide', 'pr (entier) et abscisse (mètres) sont obligatoires.');
  const voie = choisirVoie(idx, route, cote);
  const presM = pres ? idx.repere.vers(pres) : null;
  const pos = position(voie, { pr, abscisse, departement, pres: presM, interpoler });
  const [lng, lat] = versLngLat(idx, pos.comp, pos.s);
  const section = pos.comp.sections[0];
  return { lng, lat, route: voie.route, cote: voie.cote, pr, abscisse, section, departement: pos.ref?.dep ?? null, note: pos.note, sensIncertain: !!pos.comp.sensIncertain };
}

/**
 * La ligne entre deux repères `{ pr, abscisse }` d'une même route. Les repères de composantes non jointives donnent une
 * `MultiLineString` (un morceau par composante, dans l'ordre).
 * @returns {{geometrie: object, longueurM: number, debut: object, fin: object, notes: string[]}}
 */
export function intervalle(idx, { route, debut, fin, cote, departement, pres, interpoler = false }) {
  const voie = choisirVoie(idx, route, cote);
  const presM = pres ? idx.repere.vers(pres) : null;
  const a = position(voie, { ...debut, departement, pres: presM, interpoler });
  const b = position(voie, { ...fin, departement, pres: presM, interpoler });
  const ia = voie.comps.indexOf(a.comp);
  const ib = voie.comps.indexOf(b.comp);
  const morceaux = [];
  const sous = (c, s0, s1) => {
    const lo = Math.max(0, Math.min(longueurDe(c), Math.min(s0, s1)));
    const hi = Math.max(0, Math.min(longueurDe(c), Math.max(s0, s1)));
    const pts = [pointA(c.ln, c.cum, lo)];
    for (let i = 0; i < c.ln.length; i++) if (c.cum[i] > lo && c.cum[i] < hi) pts.push(c.ln[i]);
    pts.push(pointA(c.ln, c.cum, hi));
    return pts;
  };
  if (ia === ib) morceaux.push(sous(a.comp, a.s, b.s));
  else {
    const [p, q] = ia < ib ? [a, b] : [b, a];
    for (let i = Math.min(ia, ib); i <= Math.max(ia, ib); i++) {
      const c = voie.comps[i];
      morceaux.push(sous(c, i === Math.min(ia, ib) ? p.s : 0, i === Math.max(ia, ib) ? q.s : longueurDe(c)));
    }
  }
  const lignes = morceaux.map((m) => m.map((q) => idx.repere.depuis(q[0], q[1])));
  return {
    geometrie: lignes.length === 1 ? { type: 'LineString', coordinates: lignes[0] } : { type: 'MultiLineString', coordinates: lignes },
    longueurM: morceaux.reduce((t, m) => t + cumul(m)[m.length - 1], 0),
    debut: { lng: versLngLat(idx, a.comp, a.s)[0], lat: versLngLat(idx, a.comp, a.s)[1] },
    fin: { lng: versLngLat(idx, b.comp, b.s)[0], lat: versLngLat(idx, b.comp, b.s)[1] },
    notes: [a.note, b.note, ia !== ib ? 'sections_non_jointives' : null].filter(Boolean),
  };
}

/**
 * Position -> « route + PR + abscisse ».
 * @param {object} idx
 * @param {number[]} point [lng, lat]
 * @param {{route?: string, cote?: string, rayonM?: number, alternativesM?: number}} [o]
 *   `rayonM` : au-delà, rien n'est trouvé (100 m) ; `alternativesM` : écart de distance sous lequel une autre route
 *   (même tronçon portant plusieurs numéros) est rendue en `alternatives` (5 m)
 * @returns {null | {route: string, cote: string, pr: number, abscisse: number, distance: number, section: string, departement: string|null,
 *   libelle: string, lng: number, lat: number, avantLePremierPR: boolean, alternatives: object[]}}
 *   `abscisse` : mètres depuis le PR ; `distance` : mètres du point à la route ; `lng, lat` : le pied sur la route.
 */
export function localiser(idx, point, { route, cote, rayonM = 100, alternativesM = 5 } = {}) {
  if (!idx.repere || !Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null;
  const q = idx.repere.vers(point);
  const trouves = [];
  for (const [nom, cotes] of idx.voies) {
    if (route && nom !== normRoute(route)) continue;
    for (const [c, voie] of cotes) {
      if (cote && c !== cote) continue;
      for (const comp of voie.comps) {
        if (q[0] < comp.bb[0] - rayonM || q[0] > comp.bb[2] + rayonM || q[1] < comp.bb[1] - rayonM || q[1] > comp.bb[3] + rayonM) continue;
        const pr = projLigne(q, comp.ln, comp.cum);
        if (!pr || pr.d > rayonM) continue;
        trouves.push({ voie, comp, s: pr.s, d: pr.d });
      }
    }
  }
  if (!trouves.length) return null;
  trouves.sort((a, b) => a.d - b.d);
  const decrire = ({ voie, comp, s, d }) => {
    const pts = comp.pts;
    let ref = null;
    let abscisse = 0;
    let avant = false;
    // dernier repère rencontré dans le sens des PR croissants
    const derriere = pts.filter((p) => (comp.sens > 0 ? p.s <= s + 0.5 : p.s >= s - 0.5));
    if (derriere.length) {
      ref = derriere.reduce((m, p) => (Math.abs(p.s - s) < Math.abs(m.s - s) ? p : m));
      abscisse = Math.abs(s - ref.s);
    } else if (pts.length) {
      ref = pts.reduce((m, p) => (Math.abs(p.s - s) < Math.abs(m.s - s) ? p : m));
      abscisse = -Math.abs(s - ref.s);
      avant = true;
    }
    const [lng, lat] = versLngLat(idx, comp, s);
    return {
      route: voie.route, cote: voie.cote, pr: ref ? ref.n : null, abscisse: Math.round(abscisse * 10) / 10, distance: Math.round(d * 10) / 10,
      section: comp.sections[0], departement: ref?.dep ?? null, lng, lat, avantLePremierPR: avant,
      libelle: ref ? formater({ route: voie.route, pr: ref.n, abscisse }) : null,
    };
  };
  const meilleur = decrire(trouves[0]);
  meilleur.alternatives = trouves.slice(1).filter((t) => t.d <= trouves[0].d + alternativesM && `${t.voie.route}|${t.voie.cote}` !== `${trouves[0].voie.route}|${trouves[0].voie.cote}`).map(decrire);
  return meilleur;
}

/**
 * Les `n` repères (vrais PR, pas les bornes de section) les plus proches d'un point.
 * @returns {{route: string, cote: string, pr: number, type: string, distance: number, abscisseCumulee: number|null, departement: string|null, lng: number, lat: number, libelle: string}[]}
 */
export function plusProches(idx, point, n = 5, { route, rayonM = Infinity } = {}) {
  if (!idx.repere) return [];
  const q = idx.repere.vers(point);
  return idx.points
    .filter((p) => !route || p.route === normRoute(route))
    .map((p) => ({ p, d: dist(q, p.xy) }))
    .filter((x) => x.d <= rayonM)
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map(({ p, d }) => ({
      route: p.route, cote: p.cote, pr: p.n, type: p.type, distance: Math.round(d * 10) / 10, abscisseCumulee: p.ab, departement: p.dep,
      lng: p.lnglat[0], lat: p.lnglat[1], libelle: formater({ route: p.route, pr: p.n, abscisse: 0 }),
    }));
}

/** « D13 PR 17+955 » à partir de ses éléments (l'abscisse est arrondie au mètre). */
export function formater({ route, pr, abscisse = 0 }, { largeur = 0 } = {}) {
  const a = String(Math.round(Math.abs(abscisse))).padStart(largeur, '0');
  return `${route ? `${route} ` : ''}PR ${pr}${abscisse < 0 ? '-' : '+'}${a}`;
}

/**
 * Lit « D13 PR 17+955 », « PR 17 + 0955 (côté G) », « D 902 du PR 124+0150 » : le premier repère du texte.
 * @returns {{route: string|null, pr: number, abscisse: number, cote: string|null}|null}
 */
export function lirePR(texte) {
  const t = String(texte ?? '');
  const m = /PR\s*(\d+)\s*([+-])\s*(\d+)/i.exec(t);
  if (!m) return null;
  const avant = t.slice(0, m.index);
  const r = /\b([ADN]\s?\d+[A-Z]*)\b(?!.*\b[ADN]\s?\d+[A-Z]*\b)/i.exec(avant);
  const c = /c[oô]t[eé]\s*([UGD])\b/i.exec(t);
  return { route: r ? normRoute(r[1]) : null, pr: Number(m[1]), abscisse: (m[2] === '-' ? -1 : 1) * Number(m[3]), cote: c ? c[1].toUpperCase() : null };
}

/**
 * Lit les repères et les sections d'une emprise par le WFS et construit l'index. Les deux couches se lisent par `BBOX`
 * et la route se filtre côté client. **Marge :** un repère situé hors de l'emprise n'est pas lu, alors que le « dernier
 * repère derrière » un point peut être à plusieurs kilomètres (jusqu'à plus de 4 km mesuré) : élargir l'emprise d'au
 * moins 8 km autour des points à localiser (`chargerAutour`).
 */
export async function chargerReperes(emprise, { route, ...opts } = {}) {
  const filtre = route ? (f) => normRoute(f.properties?.route ?? f.properties?.numero_de_route) === normRoute(route) : undefined;
  const [pts, secs] = await Promise.all([
    lireCouche(COUCHES.pointsDeRepere, emprise, { ...opts, filtre }),
    lireCouche(COUCHES.sectionsDeRepere, emprise, { ...opts, filtre }),
  ]);
  const idx = indexerReperes(pts.features, secs.features);
  idx.lecture = { points: pts.features.length, sections: secs.features.length, tronque: pts.tronque || secs.tronque };
  return idx;
}

/** Charge les repères autour d'un point, dans un rayon de `rayonKm` (8 km par défaut). */
export function chargerAutour(point, { rayonKm = 8, ...opts } = {}) {
  return chargerReperes(empriseDeLignes([point], rayonKm * 1000), opts);
}

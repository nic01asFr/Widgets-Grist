#!/usr/bin/env node
/**
 * Validation de `filiation.js` sur DEUX ÉDITIONS COMPLÈTES de la BD TOPO d'un département.
 *
 *     node tools/valider-filiation.mjs <ancienne.json> <nouvelle.json> [--sortie dossier]
 *
 * Entrées : `troncon_de_route` des deux éditions, extraits par un script de lecture du GeoPackage officiel
 * (`[{ p: { cleabs, nature, … }, c: [[lng, lat], …] }]`). Le dépôt n'en contient qu'un petit extrait de test.
 *
 * (a) Ce qui change entre les éditions : cleabs conservés, détruits, créés, géométries modifiées.
 * (b) VÉRITÉ SYNTHÉTIQUE : sur les tronçons dont le cleabs est conservé, on masque l'identité et on simule des
 *     remplacements, scissions, fusions, suppressions et créations. La vérité est connue par construction. Les seuils de
 *     `filiation.js` sont réglés sur des fenêtres d'APPRENTISSAGE et évalués sur des fenêtres de TEST distinctes
 *     (autres parties du département), à plusieurs niveaux de bruit de numérisation.
 * (c) Sur les VRAIS cleabs détruits : plausibilité des liens proposés (même numéro de route, même nom, même importance,
 *     même nature, même sens, recouvrement), comparée à celle de couples voisins pris au hasard, et part sans successeur.
 *
 * **Limite à garder en tête :** en (b) la vérité est fabriquée à partir des mêmes géométries que celles qu'on apparie ;
 * elle mesure la capacité à retrouver une filiation sans bruit d'identité, pas la qualité sur les remaniements réels, que
 * seule (c) approche, par des indices et non par une vérité.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { filiation } from '../lib/reseau/filiation.js';
import { creerRepere, cumul, pointA, longueur, distPtLignes } from '../lib/reseau/geo.js';
import { rng } from './mesurer-calage.mjs';

const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const cleN = (p) => `${p[0].toFixed(6)}:${p[1].toFixed(6)}`;

/** Compte ce qui change entre deux éditions. */
export function bilan(A, B) {
  const ma = new Map(A.map((x) => [x.p.cleabs, x]));
  const mb = new Map(B.map((x) => [x.p.cleabs, x]));
  let conserves = 0;
  let geoChg = 0;
  let attrChg = 0;
  const deplacements = [];
  for (const [k, a] of ma) {
    const b = mb.get(k);
    if (!b) continue;
    conserves++;
    if (JSON.stringify(a.c) !== JSON.stringify(b.c)) {
      geoChg++;
      const R = creerRepere(a.c[0][0], a.c[0][1]);
      const ligneA = a.c.map(R.vers);
      deplacements.push(Math.max(...b.c.map((q) => distPtLignes(R.vers(q), [ligneA]))));
    }
    if (a.p.date_modification !== b.p.date_modification) attrChg++;
  }
  const detruits = A.filter((x) => !mb.has(x.p.cleabs));
  const crees = B.filter((x) => !ma.has(x.p.cleabs));
  deplacements.sort((x, y) => x - y);
  const q = (f) => deplacements[Math.min(deplacements.length - 1, Math.floor(f * deplacements.length))];
  return {
    anciens: A.length, nouveaux: B.length, conserves, detruits: detruits.length, crees: crees.length, geometrieModifiee: geoChg, dateModificationChangee: attrChg,
    deplacementMax: deplacements.length ? { mediane: q(0.5), p90: q(0.9), p99: q(0.99), max: q(1) } : null,
  };
}

// ------------------------------------------------------------------------------------------------ (b) vérité synthétique

/** Un ensemble de fenêtres carrées d'`ancien` contenant entre `min` et `max` tronçons conservés. */
export function fenetres(conserves, repere, { cote = 2000, min = 250, max = 1600 } = {}) {
  const cases = new Map();
  conserves.forEach((x, i) => {
    const m = repere.vers(x.c[Math.floor(x.c.length / 2)]);
    const k = `${Math.floor(m[0] / cote)}:${Math.floor(m[1] / cote)}`;
    if (!cases.has(k)) cases.set(k, []);
    cases.get(k).push(i);
  });
  return [...cases.entries()].filter(([, l]) => l.length >= min && l.length <= max).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, l]) => ({ cle: k, indices: l }));
}

function couper(ln, f) {
  const cum = cumul(ln);
  const L = cum[cum.length - 1];
  const s = L * f;
  const p = pointA(ln, cum, s);
  const a = [];
  const b = [];
  ln.forEach((q, i) => { if (cum[i] < s - 1e-6) a.push(q); else if (cum[i] > s + 1e-6) b.push(q); });
  return [[...a, p], [p, ...b]];
}

/**
 * Fabrique un cas synthétique d'une fenêtre.
 * @returns {{anciens: object[], nouveaux: object[], verite: Set<string>, types: Map<string, string>}}
 *   `verite` : paires `ancien>nouveau` ; `types` : type vrai de chaque ancien (remplacement, scission, fusion, supprime).
 */
export function fabriquer(conserves, indices, repere, { bruit = 0, graine = 1 } = {}) {
  const r = rng(graine);
  const items = indices.map((i) => ({ i, a: conserves[i].a, b: conserves[i].b, cleabs: conserves[i].a.p.cleabs }));
  const m = (pts) => pts.map(repere.vers);
  const bruite = (pts) => (bruit ? pts.map((q) => [q[0] + bruit * gauss(r), q[1] + bruit * gauss(r)]) : pts);
  const anciens = [];
  const nouveaux = [];
  const verite = new Set();
  const types = new Map();
  // nœuds de degré 2 (côté « nouveau »), pour des fusions plausibles
  const parNoeud = new Map();
  items.forEach((it, k) => {
    for (const q of [it.b.c[0], it.b.c[it.b.c.length - 1]]) {
      const key = cleN(q);
      if (!parNoeud.has(key)) parNoeud.set(key, []);
      parNoeud.get(key).push(k);
    }
  });
  const pris = new Set();
  let n = 0;
  const idNeuf = () => `n${n++}`;
  const fus = [];
  for (const [, ks] of parNoeud) {
    if (ks.length === 2 && ks[0] !== ks[1] && !pris.has(ks[0]) && !pris.has(ks[1]) && r() < 0.5) { fus.push(ks); pris.add(ks[0]); pris.add(ks[1]); }
  }
  items.forEach((it, k) => { if (!fus.some((f) => f.includes(k))) anciens.push({ cleabs: `o${it.i}`, coordinates: it.a.c }); });
  for (const [k1, k2] of fus) {
    anciens.push({ cleabs: `o${items[k1].i}`, coordinates: items[k1].a.c });
    anciens.push({ cleabs: `o${items[k2].i}`, coordinates: items[k2].a.c });
    const p1 = m(items[k1].b.c);
    let p2 = m(items[k2].b.c);
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    let l1 = p1;
    if (d(p1[0], p2[0]) < 0.5 || d(p1[0], p2[p2.length - 1]) < 0.5) l1 = p1.slice().reverse();
    if (d(l1[l1.length - 1], p2[p2.length - 1]) < 0.5) p2 = p2.slice().reverse();
    const id = idNeuf();
    nouveaux.push({ cleabs: id, coordinates: bruite([...l1, ...p2.slice(1)]).map((q) => repere.depuis(q[0], q[1])) });
    for (const kk of [k1, k2]) { verite.add(`o${items[kk].i}>${id}`); types.set(`o${items[kk].i}`, 'fusion'); }
  }
  items.forEach((it, k) => {
    if (fus.some((f) => f.includes(k))) return;
    const u = r();
    const pts = m(it.b.c);
    const L = longueur(pts);
    if (u < 0.05) { types.set(`o${it.i}`, 'supprime'); return; } // supprimé : absent du nouvel état
    if (u < 0.10) { // créé : absent de l'ancien état (on retire l'ancien)
      const idx = anciens.findIndex((x) => x.cleabs === `o${it.i}`);
      if (idx >= 0) anciens.splice(idx, 1);
      nouveaux.push({ cleabs: idNeuf(), coordinates: bruite(pts).map((q) => repere.depuis(q[0], q[1])) });
      return;
    }
    if (u < 0.25 && L >= 30) { // scission
      const [p, q] = couper(pts, 0.3 + 0.4 * r());
      const i1 = idNeuf();
      const i2 = idNeuf();
      nouveaux.push({ cleabs: i1, coordinates: bruite(p).map((z) => repere.depuis(z[0], z[1])) });
      nouveaux.push({ cleabs: i2, coordinates: bruite(q).map((z) => repere.depuis(z[0], z[1])) });
      verite.add(`o${it.i}>${i1}`); verite.add(`o${it.i}>${i2}`);
      types.set(`o${it.i}`, 'scission');
      return;
    }
    const id = idNeuf();
    nouveaux.push({ cleabs: id, coordinates: bruite(pts).map((z) => repere.depuis(z[0], z[1])) });
    verite.add(`o${it.i}>${id}`);
    types.set(`o${it.i}`, 'remplacement');
  });
  return { anciens, nouveaux, verite, types };
}

/** Précision et rappel des liens, et exactitude du type de chaque ancien. */
export function scorer(cas, opts) {
  const f = filiation(cas.anciens, cas.nouveaux, opts);
  const predit = new Set(f.liens.filter((l) => l.type !== 'meme_cleabs').map((l) => `${l.de}>${l.vers}`));
  let ok = 0;
  for (const p of predit) if (cas.verite.has(p)) ok++;
  const precision = predit.size ? ok / predit.size : 1;
  const rappel = cas.verite.size ? ok / cas.verite.size : 1;
  const typeDe = new Map();
  for (const c of f.composantes) for (const a of c.anciens) typeDe.set(a, c.type);
  let t = 0;
  let tOk = 0;
  const confusions = {};
  for (const [a, vrai] of cas.types) {
    t++;
    const pred = typeDe.get(a) || 'rien';
    const cle = `${vrai} -> ${pred}`;
    confusions[cle] = (confusions[cle] || 0) + 1;
    if (pred === vrai) tOk++;
  }
  return { precision, rappel, f1: precision + rappel ? (2 * precision * rappel) / (precision + rappel) : 0, exactitudeType: t ? tOk / t : 1, liens: predit.size, verite: cas.verite.size, confusions };
}

const moy = (v) => v.reduce((a, b) => a + b, 0) / (v.length || 1);

function fusionConfusions(liste) {
  const out = {};
  for (const c of liste) for (const [k, v] of Object.entries(c)) out[k] = (out[k] || 0) + v;
  return out;
}

// ------------------------------------------------------------------------------------------------ (c) cas réels

function norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
const noms = (p) => new Set([p.nom_collaboratif_gauche, p.nom_collaboratif_droite, p.nom_voie_ban_gauche, p.cpx_toponyme_route_nommee].map(norm).filter(Boolean));
const numero = (p) => String(p.cpx_numero ?? '').replace(/\s/g, '');

/** Indices de plausibilité d'une paire (ancien, nouveau) : l'attribut n'est évalué que si les deux côtés le renseignent. */
export function indices(a, b) {
  const out = {};
  const na = numero(a);
  const nb = numero(b);
  if (na && nb) out.memeNumero = na === nb;
  const sa = noms(a);
  const sb = noms(b);
  if (sa.size && sb.size) out.memeNom = [...sa].some((x) => sb.has(x));
  if (a.importance && b.importance) out.memeImportance = a.importance === b.importance;
  if (a.nature && b.nature) out.memeNature = a.nature === b.nature;
  if (a.sens_de_circulation && b.sens_de_circulation) out.memeSens = a.sens_de_circulation === b.sens_de_circulation;
  return out;
}

function resumeIndices(paires) {
  const acc = {};
  for (const ix of paires) for (const [k, v] of Object.entries(ix)) { (acc[k] ||= { n: 0, ok: 0 }).n++; if (v) acc[k].ok++; }
  return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, { n: v.n, part: v.ok / v.n }]));
}

function reel(A, B, opts, r) {
  const ma = new Map(A.map((x) => [x.p.cleabs, x]));
  const mb = new Map(B.map((x) => [x.p.cleabs, x]));
  const detruits = A.filter((x) => !mb.has(x.p.cleabs));
  const f = filiation(A.map((x) => ({ cleabs: x.p.cleabs, coordinates: x.c })), B.map((x) => ({ cleabs: x.p.cleabs, coordinates: x.c })), opts);
  const liensReels = f.liens.filter((l) => l.type !== 'meme_cleabs');
  const dets = new Set(detruits.map((x) => x.p.cleabs));
  const liensDetruits = liensReels.filter((l) => dets.has(l.de));
  const avecSucc = new Set(liensDetruits.map((l) => l.de));
  const types = {};
  for (const c of f.composantes) if (c.anciens.some((a) => dets.has(a))) types[c.type] = (types[c.type] || 0) + 1;
  const plaus = liensDetruits.map((l) => ({ ...indices(ma.get(l.de).p, mb.get(l.vers).p), recouvrement: l.recouvrement_m / Math.min(l.longueur_ancienne_m, l.longueur_nouvelle_m) }));
  // témoin : couples de tronçons conservés voisins (< 15 m) mais DIFFÉRENTS, tirés au hasard (indices attendus sans filiation)
  const conserves = A.filter((x) => mb.has(x.p.cleabs));
  const temoin = [];
  const R = creerRepere(A[0].c[0][0], A[0].c[0][1]);
  const milieux = conserves.map((x) => R.vers(x.c[Math.floor(x.c.length / 2)]));
  const grille = new Map();
  milieux.forEach((m, i) => { const k = `${Math.floor(m[0] / 40)}:${Math.floor(m[1] / 40)}`; if (!grille.has(k)) grille.set(k, []); grille.get(k).push(i); });
  for (let essais = 0; essais < 20000 && temoin.length < 1500; essais++) {
    const i = Math.floor(r() * conserves.length);
    const [cx, cy] = [Math.floor(milieux[i][0] / 40), Math.floor(milieux[i][1] / 40)];
    const voisins = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const j of grille.get(`${cx + dx}:${cy + dy}`) || []) {
      if (j !== i && Math.hypot(milieux[i][0] - milieux[j][0], milieux[i][1] - milieux[j][1]) <= 40) voisins.push(j);
    }
    if (!voisins.length) continue;
    temoin.push(indices(conserves[i].p, conserves[voisins[Math.floor(r() * voisins.length)]].p));
  }
  // sans successeur : natures
  const sans = detruits.filter((x) => !avecSucc.has(x.p.cleabs));
  const natureSans = {};
  for (const x of sans) natureSans[x.p.nature] = (natureSans[x.p.nature] || 0) + 1;
  const natureTous = {};
  for (const x of detruits) natureTous[x.p.nature] = (natureTous[x.p.nature] || 0) + 1;
  // regroupement par date de création : les créés d'une même scission partagent-ils l'horodatage ?
  const horodatage = [];
  for (const c of f.composantes) {
    if (c.type === 'scission' && c.anciens.every((a) => dets.has(a))) horodatage.push(new Set(c.nouveaux.map((n) => mb.get(n).p.date_creation)).size === 1);
  }
  const crees = B.filter((x) => !ma.has(x.p.cleabs));
  const liesN = new Set(liensDetruits.map((l) => l.vers));
  return {
    detruits: detruits.length, avecSuccesseur: avecSucc.size, sansSuccesseur: sans.length, liens: liensDetruits.length, types,
    plausibilite: resumeIndices(plaus), recouvrementMedian: plaus.map((p) => p.recouvrement).sort((a, b) => a - b)[Math.floor(plaus.length / 2)],
    temoin: resumeIndices(temoin), natureSansSuccesseur: natureSans, natureDetruits: natureTous,
    scissionsAvecHorodatageCommun: { n: horodatage.length, partMemeHorodatage: horodatage.length ? horodatage.filter(Boolean).length / horodatage.length : null },
    crees: crees.length, creesAvecPredecesseur: crees.filter((x) => liesN.has(x.p.cleabs)).length,
  };
}

// ------------------------------------------------------------------------------------------------ principal

async function main() {
  const [fa, fb, ...reste] = process.argv.slice(2);
  if (!fa || !fb) { console.error('usage : node tools/valider-filiation.mjs ancienne.json nouvelle.json [--sortie dossier]'); process.exit(2); }
  const A = JSON.parse(readFileSync(fa, 'utf8'));
  const B = JSON.parse(readFileSync(fb, 'utf8'));
  const sortie = reste.includes('--sortie') ? reste[reste.indexOf('--sortie') + 1] : null;
  const rapport = {};
  rapport.bilan = bilan(A, B);
  console.log('(a)', JSON.stringify(rapport.bilan));

  const mb = new Map(B.map((x) => [x.p.cleabs, x]));
  const seulementReel = reste.includes('--seulement-reel');
  const conserves = A.filter((x) => mb.has(x.p.cleabs)).map((a) => ({ a, b: mb.get(a.p.cleabs) }));
  const repere = creerRepere(A[0].c[0][0], A[0].c[0][1]);
  const flat = conserves.map((x) => ({ ...x, c: x.a.c }));
  const fens = seulementReel ? [] : fenetres(flat, repere);
  const apprentissage = fens.filter((_, i) => i % 2 === 0);
  const test = fens.filter((_, i) => i % 2 === 1);
  console.log(`(b) ${fens.length} fenêtres de 2 km (${apprentissage.length} d'apprentissage, ${test.length} de test), ${conserves.length} tronçons conservés`);
  const niveaux = [0, 2, 4];
  const cas = (liste, bruit, graine) => liste.map((f, i) => fabriquer(conserves, f.indices, repere, { bruit, graine: graine + i }));
  const defauts = { tol: 5, recouvrementMin: 0.5, capMax: 35, absMin: 5 };
  let meilleur = { tol: 5, recouvrementMin: 0.5, capMax: 35, absMin: 5 };
  if (!seulementReel) {
  const evalue = (jeux, opts) => {
    const res = jeux.map((c) => scorer(c, opts));
    return { precision: moy(res.map((x) => x.precision)), rappel: moy(res.map((x) => x.rappel)), f1: moy(res.map((x) => x.f1)), exactitudeType: moy(res.map((x) => x.exactitudeType)), confusions: fusionConfusions(res.map((x) => x.confusions)) };
  };
  const jeuxAppr = Object.fromEntries(niveaux.map((b) => [b, cas(apprentissage, b, 100 + b)]));
  const jeuxTest = Object.fromEntries(niveaux.map((b) => [b, cas(test, b, 900 + b)]));
  const f1Moyen = (jeux, opts) => moy(niveaux.map((b) => evalue(jeux[b], opts).f1));
  // réglage coordonnée par coordonnée sur l'apprentissage
  const essais = [];
  for (const tol of [2, 3, 5, 8, 12]) for (const rm of [0.3, 0.5, 0.7]) {
    const o = { ...meilleur, tol, recouvrementMin: rm };
    essais.push({ ...o, f1: f1Moyen(jeuxAppr, o) });
  }
  essais.sort((a, b) => b.f1 - a.f1);
  meilleur = { ...meilleur, tol: essais[0].tol, recouvrementMin: essais[0].recouvrementMin };
  for (const capMax of [20, 35, 50]) essais.push({ ...meilleur, capMax, f1: f1Moyen(jeuxAppr, { ...meilleur, capMax }) });
  meilleur.capMax = essais.filter((e) => e.tol === meilleur.tol && e.recouvrementMin === meilleur.recouvrementMin).sort((a, b) => b.f1 - a.f1)[0].capMax;
  const absEssais = [3, 5, 10].map((absMin) => ({ absMin, f1: f1Moyen(jeuxAppr, { ...meilleur, absMin }) }));
  meilleur.absMin = absEssais.sort((a, b) => b.f1 - a.f1)[0].absMin;
  rapport.reglage = { choisi: meilleur, apprentissage: essais.slice(0, 8).map((e) => ({ ...e, f1: Math.round(e.f1 * 1e4) / 1e4 })) };
  console.log('(b) seuils choisis sur l’apprentissage :', JSON.stringify(meilleur));
  rapport.synthetique = {};
  for (const b of niveaux) {
    rapport.synthetique[b] = { defauts: evalue(jeuxTest[b], defauts), regles: evalue(jeuxTest[b], meilleur), apprentissageRegles: evalue(jeuxAppr[b], meilleur) };
    const d = rapport.synthetique[b].defauts;
    const g = rapport.synthetique[b].regles;
    console.log(`    bruit ${b} m | test, seuils par défaut : précision ${d.precision.toFixed(3)} rappel ${d.rappel.toFixed(3)} F1 ${d.f1.toFixed(3)} type ${d.exactitudeType.toFixed(3)} | seuils réglés : ${g.precision.toFixed(3)} ${g.rappel.toFixed(3)} ${g.f1.toFixed(3)} ${g.exactitudeType.toFixed(3)}`);
  }
  console.log('    confusions de type (test, bruit 2 m, seuils réglés) :', JSON.stringify(rapport.synthetique[2].regles.confusions));
  } else {
    meilleur = { tol: 3, recouvrementMin: 0.3, capMax: 50, absMin: 5 };
  }

  // (c)
  const r = rng(77);
  rapport.reel = { defauts: reel(A, B, defauts, r), regles: reel(A, B, meilleur, rng(77)) };
  for (const [k, v] of Object.entries(rapport.reel)) {
    console.log(`(c) ${k} : ${v.detruits} détruits, ${v.avecSuccesseur} avec successeur, ${v.sansSuccesseur} sans ; types ${JSON.stringify(v.types)}`);
    console.log('    plausibilité des liens :', JSON.stringify(Object.fromEntries(Object.entries(v.plausibilite).map(([a, b]) => [a, `${(100 * b.part).toFixed(0)} % (n=${b.n})`]))));
    console.log('    témoin (voisins au hasard) :', JSON.stringify(Object.fromEntries(Object.entries(v.temoin).map(([a, b]) => [a, `${(100 * b.part).toFixed(0)} % (n=${b.n})`]))));
  }
  if (sortie) {
    mkdirSync(sortie, { recursive: true });
    const f = join(sortie, 'validation-filiation.json');
    const ancien = seulementReel && existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
    writeFileSync(f, JSON.stringify({ ...ancien, ...rapport, ...(seulementReel ? { reglage: ancien.reglage, synthetique: ancien.synthetique } : {}) }, null, 1));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

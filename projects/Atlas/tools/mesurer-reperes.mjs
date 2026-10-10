#!/usr/bin/env node
/**
 * Mesure des repères routiers (`lib/reseau/reperes.js`) sur UN DÉPARTEMENT COMPLET de la BD TOPO.
 *
 *     node tools/mesurer-reperes.mjs <pr.json> <troncons.json> [--sortie dossier]
 *
 *   pr.json        { point_de_repere: [...], section_de_points_de_repere: [...] } (entités GeoJSON WGS84)
 *   troncons.json  [{ p: { cleabs, cpx_numero, cpx_classement_administratif, … }, c: [[lng, lat], …] }]
 *
 * (a) COUVERTURE : parmi les tronçons des routes numérotées (autoroutes, nationales, départementales), quelle part en
 *     longueur a des repères ? Quelles routes n'en ont pas ?
 * (b) ALLER-RETOUR : pour tous les repères, `resoudre` (abscisse 0 et 250 m) puis `localiser` puis `resoudre` ; écart.
 * (c) COHÉRENCE AVEC LES ABSCISSES PUBLIÉES : l'attribut `abscisse` des repères est la distance cumulée publiée
 *     depuis l'origine de la route ; la distance mesurée sur la ligne de la section entre deux repères consécutifs doit
 *     lui ressembler. Ce n'est pas une vérité terrain (les deux viennent du même producteur) mais c'est le seul second
 *     jeu de chiffres indépendant de la géométrie disponible.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexerReperes, resoudre, localiser, routesIndexees } from '../lib/reseau/reperes.js';
import { creerRepere, longueur, distPtLignes } from '../lib/reseau/geo.js';

const quantile = (v, f) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : null; };
const resume = (v) => ({ n: v.length, mediane: quantile(v, 0.5), p90: quantile(v, 0.9), p99: quantile(v, 0.99), max: quantile(v, 1) });

export function mesurer(pr, troncons) {
  const idx = indexerReperes(pr.point_de_repere, pr.section_de_points_de_repere);
  const rapport = { index: { routes: idx.voies.size, reperes: idx.points.length, sections: idx.sectionsLues, rejets: idx.rejets } };
  const R = idx.repere;

  // (a) couverture
  const numeros = (p) => String(p.cpx_numero || '').split(/[,;/\s]+/).filter(Boolean);
  const avecPR = new Set(routesIndexees(idx).filter((r) => r.reperes > 0).map((r) => r.route));
  const classes = {};
  const sansPR = {};
  const sectionsParRoute = new Map();
  for (const s of pr.section_de_points_de_repere) {
    const r = String(s.properties.numero_de_route).replace(/\s/g, '').toUpperCase();
    if (!sectionsParRoute.has(r)) sectionsParRoute.set(r, []);
    sectionsParRoute.get(r).push(s.geometry.coordinates.map((q) => R.vers(q)));
  }
  const rep = R || creerRepere(6.85, 47.63);
  for (const t of troncons) {
    const classe = t.p.cpx_classement_administratif || 'sans numéro';
    const nums = numeros(t.p);
    if (!nums.length) continue;
    const ln = t.c.map((q) => rep.vers(q));
    const L = longueur(ln);
    const o = (classes[classe] ||= { troncons: 0, longueurM: 0, avecRoutePR: 0, longueurAvecRoutePR: 0, surSection: 0, longueurSurSection: 0 });
    o.troncons++;
    o.longueurM += L;
    if (nums.some((n) => avecPR.has(n))) { o.avecRoutePR++; o.longueurAvecRoutePR += L; }
    else for (const n of nums) sansPR[n] = (sansPR[n] || 0) + L;
    // le milieu du tronçon est-il à moins de 30 m d'une section de l'une de ses routes ?
    const milieu = ln[Math.floor(ln.length / 2)];
    if (nums.some((n) => (sectionsParRoute.get(n) || []).some((s) => distPtLignes(milieu, [s]) <= 30))) { o.surSection++; o.longueurSurSection += L; }
  }
  rapport.couverture = {
    parClasse: Object.fromEntries(Object.entries(classes).map(([k, o]) => [k, {
      ...o, longueurKm: Math.round(o.longueurM / 100) / 10, partRoutesAvecPR: o.longueurAvecRoutePR / o.longueurM, partSurUneSection: o.longueurSurSection / o.longueurM,
    }])),
    routesSansPR: Object.entries(sansPR).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, l]) => `${n} (${Math.round(l / 100) / 10} km)`),
    nombreRoutesSansPR: Object.keys(sansPR).length,
  };

  // (b) aller-retour
  const ecarts = [];
  const echecs = { horsSection: 0, perdu: 0, autre: 0 };
  let mauvaisPR = 0;
  let essais0 = 0;
  for (const p of idx.points) {
    for (const off of [0, 250]) {
      let a;
      try { a = resoudre(idx, { route: p.route, pr: p.n, abscisse: off, cote: p.cote, departement: p.dep || undefined, pres: p.lnglat }); } catch (e) { if (e.code === 'abscisse_hors_section') echecs.horsSection++; else echecs.autre++; continue; }
      if (off === 0) essais0++;
      const l = localiser(idx, [a.lng, a.lat], { route: p.route, cote: p.cote, rayonM: 5 });
      if (!l) { echecs.perdu++; continue; }
      let b;
      try { b = resoudre(idx, { route: l.route, pr: l.pr, abscisse: l.abscisse, cote: l.cote, departement: l.departement || undefined, pres: [a.lng, a.lat] }); } catch { echecs.autre++; continue; }
      ecarts.push(Math.hypot(...R.vers([a.lng, a.lat]).map((v, i) => v - R.vers([b.lng, b.lat])[i])));
      if (off === 0 && (l.pr !== p.n || Math.abs(l.abscisse) > 1.5)) mauvaisPR++;
    }
  }
  rapport.allerRetour = { essais: idx.points.length * 2, abouti: ecarts.length, echecs, ecartRetourM: resume(ecarts), memePRaSeroEnviron: 1 - mauvaisPR / Math.max(1, essais0) };

  // (c) abscisses publiées contre longueurs de ligne, entre deux repères consécutifs d'une même composante
  const rapports = [];
  const differences = [];
  for (const cotes of idx.voies.values()) {
    for (const voie of cotes.values()) {
      for (const comp of voie.comps) {
        const ps = comp.pts.filter((p) => p.ab !== null && p.dep).sort((a, b) => a.ab - b.ab);
        for (let i = 1; i < ps.length; i++) {
          if (ps[i].dep !== ps[i - 1].dep) continue;
          const publie = ps[i].ab - ps[i - 1].ab;
          const mesure = Math.abs(ps[i].s - ps[i - 1].s);
          if (publie < 100 || publie > 6000) continue;
          rapports.push(mesure / publie);
          differences.push(Math.abs(mesure - publie));
        }
      }
    }
  }
  rapport.abscissesPubliees = { paires: rapports.length, rapportLigneSurPublie: resume(rapports), differenceM: resume(differences) };
  return rapport;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [fp, ft, ...reste] = process.argv.slice(2);
  const r = mesurer(JSON.parse(readFileSync(fp, 'utf8')), JSON.parse(readFileSync(ft, 'utf8')));
  console.log(JSON.stringify(r, null, 1));
  if (reste.includes('--sortie')) { const d = reste[reste.indexOf('--sortie') + 1]; mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'reperes.json'), JSON.stringify(r, null, 1)); }
}

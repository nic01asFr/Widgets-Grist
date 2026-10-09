// Génère les jeux EMBARQUÉS légers (repli hors ligne) à partir de fichiers téléchargés par l'opérateur :
//   node tools/generer-donnees-bi.mjs <region.json> <departement.json> <pays-110m.geojson> <dossier-sortie : lib/bi> [<dossier des pages pe_commune_N.json>]
// Entrées : ADMIN EXPRESS COG CARTO PE (WFS, EPSG:4326) et Natural Earth 110 m (domaine public).
// Sorties : donnees/regions-leger.json, departements-leger.json, pays-leger.json et admin-referentiel.js (dans le dossier de sortie).
// Simplification Douglas-Peucker par anneau, sommets arrondis ; les anneaux trop petits sont supprimés.
import fs from 'node:fs';
import path from 'node:path';

const [,, fReg, fDep, fPays, sortie, dossierCommunes] = process.argv;
if (!sortie) { console.error('usage : generer-donnees-bi.mjs region.json departement.json pays.geojson dossier-sortie [dossier-pages-communes]'); process.exit(1); }

function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const garde = new Uint8Array(pts.length); garde[0] = garde[pts.length - 1] = 1;
  const pile = [[0, pts.length - 1]];
  while (pile.length) {
    const [a, b] = pile.pop(); let dmax = 0, im = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i]; let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); if (d > dmax) { dmax = d; im = i; }
    }
    if (dmax > tol && im > 0) { garde[im] = 1; pile.push([a, im], [im, b]); }
  }
  return pts.filter((_, i) => garde[i]);
}
const arrondir = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
function aireAnneau(r) { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(s / 2); }
function simplifierGeom(g, tol, dec, aireMin) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; const out = [];
  for (const poly of polys) {
    const anneaux = [];
    for (let k = 0; k < poly.length; k++) {
      if (aireAnneau(poly[k]) < aireMin) { if (k === 0) break; continue; }
      let r = dp(poly[k], tol).map(([x, y]) => [arrondir(x, dec), arrondir(y, dec)]);
      r = r.filter((p, i) => i === 0 || p[0] !== r[i - 1][0] || p[1] !== r[i - 1][1]);
      if (r.length >= 4) anneaux.push(r); else if (k === 0) break;
    }
    if (anneaux.length) out.push(anneaux);
  }
  return out.length === 1 ? { type: 'Polygon', coordinates: out[0] } : { type: 'MultiPolygon', coordinates: out };
}
const lire = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const ecrire = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof o === 'string' ? o : JSON.stringify(o)); return fs.statSync(f).size; };

const reg = lire(fReg), dep = lire(fDep), pays = lire(fPays);
const regions = reg.features.map((f) => ({ type: 'Feature', properties: { code: f.properties.code_insee, nom: f.properties.nom_officiel, niveau: 'region' }, geometry: simplifierGeom(f.geometry, 0.02, 2, 0.0004) }));
const deps = dep.features.map((f) => ({ type: 'Feature', properties: { code: f.properties.code_insee, nom: f.properties.nom_officiel, region: f.properties.code_insee_de_la_region, niveau: 'departement' }, geometry: simplifierGeom(f.geometry, 0.012, 2, 0.0002) }));
const nations = pays.features.map((f) => ({ type: 'Feature', properties: { code: f.properties.ISO_A3_EH, nom: f.properties.NAME_FR || f.properties.NAME, nom_en: f.properties.NAME, population: f.properties.POP_EST, continent: f.properties.CONTINENT, niveau: 'pays' }, geometry: simplifierGeom(f.geometry, 0.15, 1, 0.05) }));
const meta = (source, licence) => ({ source, licence });
const t1 = ecrire(path.join(sortie, 'donnees/regions-leger.json'), { type: 'FeatureCollection', meta: meta('IGN, ADMIN EXPRESS COG CARTO PE, edition 2026, simplifie', 'Licence Ouverte (Etalab) - attribution IGN'), features: regions });
const t2 = ecrire(path.join(sortie, 'donnees/departements-leger.json'), { type: 'FeatureCollection', meta: meta('IGN, ADMIN EXPRESS COG CARTO PE, edition 2026, simplifie', 'Licence Ouverte (Etalab) - attribution IGN'), features: deps });
const t3 = ecrire(path.join(sortie, 'donnees/pays-leger.json'), { type: 'FeatureCollection', meta: meta('Natural Earth 110m admin 0, simplifie', 'Domaine public (naturalearthdata.com/about/terms-of-use)'), features: nations });
const R = {}; for (const f of regions) R[f.properties.code] = f.properties.nom;
const D = {}; for (const f of deps) D[f.properties.code] = { nom: f.properties.nom, region: f.properties.region };
const js = `// GENERE par outils/generer-embarque.mjs : referentiel des regions et departements (COG, edition 2026, IGN ADMIN EXPRESS).
// Ne pas editer a la main. Licence Ouverte (Etalab) - attribution IGN.
export const MILLESIME = '2026';
export const REGIONS = Object.freeze(${JSON.stringify(R, null, 1).replace(/\n\s*/g, ' ')});
export const DEPARTEMENTS = Object.freeze(${JSON.stringify(D, null, 1).replace(/\n\s*/g, ' ')});
`;
const t4 = ecrire(path.join(sortie, 'admin-referentiel.js'), js);
console.log({ regions: t1, departements: t2, pays: t3, referentiel: t4, nRegions: regions.length, nDeps: deps.length, nPays: nations.length });

// Références de population et de surface par niveau, sommées depuis les communes (l'IGN ne fournit la population qu'aux communes).
if (dossierCommunes) {
  const ref = { meta: { source: 'IGN ADMIN EXPRESS COG CARTO PE 2026 : somme des communes (population legale INSEE, recensement du 2023-01-01 ; superficie cadastrale)', licence: 'Licence Ouverte (Etalab) - attribution IGN et INSEE', unites: { population: 'habitants', surface_km2: 'km2 (superficie cadastrale)' } }, region: {}, departement: {}, epci: {} };
  const ajoute = (niv, code, pop, ha) => { if (!code) return; const r = ref[niv][code] || (ref[niv][code] = { population: 0, surface_km2: 0, communes: 0 }); r.population += pop || 0; r.surface_km2 += (ha || 0) / 100; r.communes++; };
  let n = 0;
  for (const f of fs.readdirSync(dossierCommunes).filter((x) => /^pe_commune_\d+\.json$/.test(x))) {
    for (const c of lire(path.join(dossierCommunes, f)).features) { const p = c.properties; n++; ajoute('region', p.code_insee_de_la_region, p.population, p.superficie_cadastrale); ajoute('departement', p.code_insee_du_departement, p.population, p.superficie_cadastrale); ajoute('epci', p.codes_siren_des_epci, p.population, p.superficie_cadastrale); }
  }
  for (const niv of ['region', 'departement', 'epci']) for (const r of Object.values(ref[niv])) r.surface_km2 = Math.round(r.surface_km2 * 10) / 10;
  const t5 = ecrire(path.join(sortie, 'donnees/references-population.json'), ref);
  console.log({ references: t5, communes: n, regions: Object.keys(ref.region).length, departements: Object.keys(ref.departement).length, epci: Object.keys(ref.epci).length });
}

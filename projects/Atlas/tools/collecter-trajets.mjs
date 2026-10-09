#!/usr/bin/env node
/**
 * Collecte de trajets réels calculés par le service d'itinéraire de la Géoplateforme (ressource `bdtopo-pgr`, avec
 * `waysAttributes=cleabs`), et du réseau BD TOPO du couloir de chacun (WFS), pour mesurer le calage.
 *
 *     node tools/collecter-trajets.mjs <dossier-cache> [--par-zone-max N] [--zones dense,peri,rural,echangeur]
 *
 * Chaque réponse est mise en cache (`<cache>/api/<id>.json`, `<cache>/wfs/<id>.json`) : relancer reprend où l'on s'est
 * arrêté et ne redemande rien. Débit : un appel d'itinéraire toutes les 1,1 s au plus (le service annonce 1 requête par
 * seconde dans ses en-têtes), une lecture WFS par trajet avec 200 ms entre deux pages. Lecture seule, sans clé.
 *
 * **Ce que ces trajets sont : la sortie d'un moteur de routage appliqué à la BD TOPO, pas un relevé terrain.** Ils
 * donnent une séquence de `cleabs` indépendante de la méthode de calage, mais ils partagent avec elle la donnée de base
 * (la même BD TOPO) : ils ne disent rien d'un défaut de la BD TOPO, ni de ce qu'un conducteur ou un appareil a réellement
 * parcouru.
 *
 * Les points de départ sont tirés au hasard (graine fixe) dans des disques centrés sur des lieux choisis pour leur variété
 * de contextes : centres urbains denses, périphéries, campagnes sinueuses, abords d'échangeurs et de rocades.
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerClientItineraire } from '../lib/reseau/itineraire-geoplateforme.js';
import { lireTroncons, empriseDeLignes, garderProprietes, PROPRIETES_TRONCON } from '../lib/reseau/wfs-bdtopo.js';
import { rng } from './mesurer-calage.mjs';

// [libellé, département, lng, lat, rayon des départs (km), longueur visée min-max (km)]
export const ZONES = {
  dense: [
    ['Paris', '75', 2.3522, 48.8566, 3, [0.8, 3]], ['Lyon', '69', 4.8357, 45.764, 3, [0.8, 3]], ['Marseille', '13', 5.3698, 43.2965, 3, [0.8, 3]],
    ['Toulouse', '31', 1.4442, 43.6047, 3, [0.8, 3]], ['Lille', '59', 3.0573, 50.6292, 3, [0.8, 3]], ['Bordeaux', '33', -0.5792, 44.8378, 3, [0.8, 3]],
    ['Strasbourg', '67', 7.7521, 48.5734, 3, [0.8, 3]], ['Nantes', '44', -1.5534, 47.2184, 3, [0.8, 3]], ['Nice', '06', 7.262, 43.7102, 3, [0.8, 3]],
    ['Montpellier', '34', 3.8767, 43.6108, 3, [0.8, 3]],
  ],
  peri: [
    ['Velizy', '78', 2.19, 48.78, 4, [1.5, 5]], ['Bron', '69', 4.92, 45.74, 4, [1.5, 5]], ['Aix', '13', 5.447, 43.5297, 4, [1.5, 5]],
    ['Colomiers', '31', 1.32, 43.61, 5, [1.5, 5]], ['Merignac', '33', -0.65, 44.84, 4, [1.5, 5]], ['Villeneuve-d-Ascq', '59', 3.15, 50.62, 4, [1.5, 5]],
    ['Saint-Herblain', '44', -1.65, 47.22, 4, [1.5, 5]], ['Mulhouse', '68', 7.34, 47.75, 4, [1.5, 5]], ['Rennes', '35', -1.68, 48.11, 5, [1.5, 5]],
    ['Dijon', '21', 5.04, 47.32, 5, [1.5, 5]],
  ],
  rural: [
    ['Ardeche', '07', 4.4, 44.75, 15, [1.5, 6]], ['Lozere', '48', 3.5, 44.52, 15, [1.5, 6]], ['Cantal', '15', 2.65, 45.05, 15, [1.5, 6]],
    ['Aveyron', '12', 2.6, 44.3, 15, [1.5, 6]], ['Alpes-de-Haute-Provence', '04', 6.2, 44.1, 15, [1.5, 6]], ['Correze', '19', 1.9, 45.2, 15, [1.5, 6]],
    ['Gers', '32', 0.5, 43.7, 15, [1.5, 6]], ['Jura', '39', 5.8, 46.7, 12, [1.5, 6]], ['Vosges', '88', 6.6, 48.1, 12, [1.5, 6]],
    ['Finistere', '29', -4.0, 48.3, 15, [1.5, 6]], ['Haute-Savoie', '74', 6.5, 46.0, 12, [1.5, 6]], ['Pyrenees-Atlantiques', '64', -0.8, 43.1, 12, [1.5, 6]],
    ['Dordogne', '24', 0.8, 45.0, 15, [1.5, 6]],
  ],
  echangeur: [
    ['Lyon-A7', '69', 4.826, 45.742, 2, [3, 8]], ['Marseille-A7', '13', 5.372, 43.35, 2, [3, 8]], ['Paris-peripherique', '75', 2.359, 48.819, 2, [3, 8]],
    ['Toulouse-rocade', '31', 1.4, 43.64, 2, [3, 8]], ['Bordeaux-rocade', '33', -0.6, 44.86, 2, [3, 8]], ['Lille-A25', '59', 3.05, 50.6, 2, [3, 8]],
    ['Nantes-peripherique', '44', -1.6, 47.25, 2, [3, 8]], ['Grenoble-A480', '38', 5.7, 45.18, 2, [3, 8]], ['Strasbourg-A35', '67', 7.73, 48.56, 2, [3, 8]],
    ['Rennes-rocade', '35', -1.7, 48.13, 2, [3, 8]], ['Nancy', '54', 6.18, 48.69, 2, [3, 8]], ['Metz', '57', 6.17, 49.12, 2, [3, 8]],
  ],
};

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Un point à `km` kilomètres de (lng, lat), dans la direction `cap` (radians, 0 = nord). */
function decale(lng, lat, km, cap) {
  return [lng + (km * Math.sin(cap)) / (111.32 * Math.cos((lat * Math.PI) / 180)), lat + (km * Math.cos(cap)) / 111.32];
}

/** Le plan des trajets à demander : tirage reproductible. */
export function planifier({ parZone = { dense: 8, peri: 6, rural: 7, echangeur: 6 }, familles = Object.keys(ZONES), graine = 20261009 } = {}) {
  const r = rng(graine);
  const plan = [];
  for (const famille of familles) {
    for (const [libelle, dept, lng, lat, rayon, [lmin, lmax]] of ZONES[famille]) {
      for (let k = 0; k < (parZone[famille] ?? 0); k++) {
        const o = decale(lng, lat, Math.sqrt(r()) * rayon, r() * 2 * Math.PI);
        const d = decale(o[0], o[1], lmin + r() * (lmax - lmin), r() * 2 * Math.PI);
        plan.push({
          id: `${famille}-${dept}-${libelle.toLowerCase()}-${k}`, famille, zone: libelle, dept, depart: o.map((x) => Math.round(x * 1e6) / 1e6), arrivee: d.map((x) => Math.round(x * 1e6) / 1e6),
          optimisation: r() < 0.5 ? 'shortest' : 'fastest',
        });
      }
    }
  }
  return plan;
}

async function main() {
  const cache = process.argv[2];
  if (!cache) { console.error('usage : node tools/collecter-trajets.mjs <dossier-cache>'); process.exit(2); }
  mkdirSync(join(cache, 'api'), { recursive: true });
  mkdirSync(join(cache, 'wfs'), { recursive: true });
  const plan = planifier();
  const client = creerClientItineraire({ intervalleMs: 1100, ecartMaxM: 5000, maxAppels: 800 });
  let neufs = 0;
  let rejets = 0;
  for (const t of plan) {
    const fApi = join(cache, 'api', `${t.id}.json`);
    const fWfs = join(cache, 'wfs', `${t.id}.json`);
    if (existsSync(fApi) && (existsSync(fWfs) || JSON.parse(readFileSync(fApi, 'utf8')).rejet)) continue;
    let rep;
    try {
      rep = await client.itineraire({ depart: t.depart, arrivee: t.arrivee, optimisation: t.optimisation });
    } catch (e) {
      writeFileSync(fApi, JSON.stringify({ ...t, rejet: `${e.code}: ${e.message}` }));
      rejets++;
      continue;
    }
    const lng = rep.etapes.flatMap((e) => (e.geometrie ? e.geometrie.coordinates : []));
    if (!rep.cleabsDisponibles || rep.distanceM < 500 || rep.distanceM > 12000 || lng.length < 4) {
      writeFileSync(fApi, JSON.stringify({ ...t, rejet: `hors critères (${Math.round(rep.distanceM)} m, cleabs ${rep.cleabsDisponibles})` }));
      rejets++;
      continue;
    }
    writeFileSync(fApi, JSON.stringify({
      ...t, version: rep.version, distanceM: rep.distanceM, geometrie: rep.geometrie,
      etapes: rep.etapes.map((e) => ({ cleabs: e.cleabs, distanceM: e.distanceM, geometrie: e.geometrie, sens: e.sens, numero: e.numero })),
    }));
    const emprise = empriseDeLignes(rep.geometrie.coordinates, 200);
    try {
      const w = await lireTroncons(emprise, { max: 8000 });
      writeFileSync(fWfs, JSON.stringify(garderProprietes(w.features, PROPRIETES_TRONCON)));
    } catch (e) {
      writeFileSync(fApi, JSON.stringify({ ...t, rejet: `wfs ${e.code}: ${e.message}` }));
      rejets++;
      continue;
    }
    neufs++;
    if (neufs % 10 === 0) console.log(`${neufs} trajets collectés, ${rejets} rejets (${client.compteur.appels} appels)`);
    await pause(100);
  }
  console.log(`terminé : ${neufs} nouveaux trajets, ${rejets} rejets, ${client.compteur.appels} appels d'itinéraire`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

/**
 * Sources des couches administratives : IGN Géoplateforme (WFS ADMIN EXPRESS), jeux embarqués de repli.
 *
 * Module pur : le `fetch` est injecté (testable sans réseau). Aucune clé n'est nécessaire ; les réponses WFS portent
 * `access-control-allow-origin: *` (mesuré). Voir SOURCES-ADMIN.md pour les poids et temps mesurés.
 *
 * Produits IGN (même schéma d'attributs) :
 *  - 'pe'   : ADMINEXPRESS-COG-CARTO-PE.LATEST, « petite échelle » : géométries généralisées, le seul usable en national ;
 *  - 'carto': ADMINEXPRESS-COG-CARTO.LATEST : généralisé « cartographique » mais 15 fois plus lourd en régions/départements ;
 *  - 'cog'  : ADMINEXPRESS-COG.LATEST : géométrie complète, hors de portée d'un client (118 Mo pour 101 départements).
 */
import { attributionSure } from '../attribution.js?v=1.15.0';
import { aireGeodesiqueKm2, lireValeur } from './admin.js';

export const VERSION = '1.0.0';
export const URL_WFS = 'https://data.geopf.fr/wfs/ows';
export const PRODUITS = Object.freeze({ pe: 'ADMINEXPRESS-COG-CARTO-PE.LATEST', carto: 'ADMINEXPRESS-COG-CARTO.LATEST', cog: 'ADMINEXPRESS-COG.LATEST' });
export const COUCHES_IGN = Object.freeze({ region: 'region', departement: 'departement', epci: 'epci', commune: 'commune', arrondissement: 'arrondissement_municipal' });
export const ATTRIBUTION_IGN = 'Contours : IGN ADMIN EXPRESS (Licence Ouverte) ; population : INSEE, populations légales';
export const ATTRIBUTION_NE = 'Pays : Natural Earth (domaine public)';
export const NIVEAUX_EMBARQUES = Object.freeze(['pays', 'region', 'departement']);

export class ErreurSource extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'ErreurSource'; this.code = code; this.details = details; }
}

/**
 * URL d'une page WFS.
 * @param {string} niveau  region | departement | epci | commune | arrondissement
 * @param {{produit?:string, filtre?:object, debut?:number, nombre?:number, hits?:boolean}} o
 *   filtre : { departement } | { region } | { commune } (code) ; combiné en CQL
 */
export function urlWfs(niveau, o = {}) {
  const { produit = 'pe', filtre = null, debut = 0, nombre = 5000, hits = false } = o;
  const couche = COUCHES_IGN[niveau]; if (!couche) throw new ErreurSource('niveau', 'niveau sans couche IGN : ' + niveau);
  const prod = PRODUITS[produit] || produit;
  const p = new URLSearchParams({ SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: prod + ':' + couche });
  if (hits) { p.set('resultType', 'hits'); return URL_WFS + '?' + p; }
  p.set('outputFormat', 'application/json'); p.set('srsName', 'EPSG:4326'); p.set('SORTBY', 'cleabs'); p.set('COUNT', String(nombre)); p.set('STARTINDEX', String(debut));
  const cql = cqlFiltre(niveau, filtre); if (cql) p.set('CQL_FILTER', cql);
  return URL_WFS + '?' + p;
}
const echapper = (s) => String(s).replace(/'/g, "''");
function cqlFiltre(niveau, f) {
  if (!f) return '';
  const c = [];
  if (f.departement) c.push((niveau === 'commune' ? 'code_insee_du_departement' : 'code_insee') + "='" + echapper(f.departement) + "'");
  if (f.region) c.push('code_insee_de_la_region' + "='" + echapper(f.region) + "'");
  if (f.commune) c.push('code_insee_de_la_commune_de_rattach' + "='" + echapper(f.commune) + "'");
  return c.join(' AND ');
}

/** Propriétés IGN -> propriétés normalisées (code, nom, niveau, population, surface_km2, parents). Géométrie conservée. */
export function normaliser(niveau, f) {
  const p = f.properties || {}; const s = (v) => (v === null || v === undefined ? null : String(v));
  let props;
  if (niveau === 'region') props = { code: s(p.code_insee), nom: p.nom_officiel };
  else if (niveau === 'departement') props = { code: s(p.code_insee), nom: p.nom_officiel, region: s(p.code_insee_de_la_region) };
  else if (niveau === 'commune') props = { code: s(p.code_insee), nom: p.nom_officiel, population: lireValeur(p.population), surface_km2: p.superficie_cadastrale != null ? p.superficie_cadastrale / 100 : null, departement: s(p.code_insee_du_departement), region: s(p.code_insee_de_la_region), epci: s(p.codes_siren_des_epci), statut: p.statut ?? null, annee_population: p.date_du_recensement ? String(p.date_du_recensement).slice(0, 4) : null };
  else if (niveau === 'epci') props = { code: s(p.code_siren), nom: p.nom_officiel, nature: p.nature ?? null };
  else if (niveau === 'arrondissement') props = { code: s(p.code_insee), nom: p.nom_officiel, population: lireValeur(p.population), commune: s(p.code_insee_de_la_commune_de_rattach) };
  else throw new ErreurSource('niveau', 'niveau inconnu : ' + niveau);
  return { type: 'Feature', properties: { ...props, niveau }, geometry: f.geometry };
}

/**
 * Complète population et surface (km²) des régions, départements et EPCI avec le référentiel embarqué (somme des communes),
 * et la surface géodésique de ce qui n'en a pas. Ne modifie pas une valeur déjà présente.
 */
export function enrichir(niveau, features, refs = null) {
  const table = refs && refs[niveau];
  for (const f of features) {
    const pr = f.properties; const r = table && table[pr.code];
    if (r) { if (pr.population == null) pr.population = r.population; if (pr.surface_km2 == null) pr.surface_km2 = r.surface_km2; if (pr.nb_communes == null) pr.nb_communes = r.communes; }
    if (pr.surface_km2 == null) { const a = aireGeodesiqueKm2(f.geometry); if (a !== null) pr.surface_km2 = Math.round(a * 10) / 10; }
  }
  return features;
}

const maintenant = () => (typeof performance !== 'undefined' ? performance : Date).now();
async function lirePage(fetchFn, url, { timeoutMs, signal }) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null; let tm;
  if (ctl && timeoutMs) tm = setTimeout(() => ctl.abort(), timeoutMs);
  if (signal && ctl) signal.addEventListener('abort', () => ctl.abort(), { once: true });
  let res;
  try { res = await fetchFn(url, ctl ? { signal: ctl.signal } : undefined); }
  catch (e) { throw new ErreurSource('reseau', (e && e.name === 'AbortError') ? 'Service des contours indisponible (délai dépassé).' : 'Service des contours injoignable (réseau ou blocage).', { cause: String(e && e.message || e), url }); }
  finally { clearTimeout(tm); }
  if (!res.ok) throw new ErreurSource('http', 'Service des contours en erreur (HTTP ' + res.status + ').', { status: res.status, url });
  const texte = await res.text(); let json;
  try { json = JSON.parse(texte); } catch (e) { throw new ErreurSource('format', 'Réponse du service des contours illisible (JSON attendu).', { extrait: texte.slice(0, 120), url }); }
  if (!json || !Array.isArray(json.features)) throw new ErreurSource('format', 'Réponse du service des contours sans entités.', { url });
  return { json, octets: texte.length };
}

/**
 * Charge un niveau complet (ou filtré) depuis le WFS IGN, avec pagination.
 * @param {string} niveau
 * @param {{fetch?:Function, produit?:string, filtre?:object, pageTaille?:number, parallele?:number, timeoutMs?:number, refs?:object,
 *          surProgres?:(p:{pages:number, chargees:number, total:number|null})=>void, signal?:AbortSignal}} o
 * @returns {Promise<{features:object[], meta:object}>}
 */
export async function chargerCouche(niveau, o = {}) {
  const { fetch: f = globalThis.fetch, produit = 'pe', filtre = null, pageTaille = 5000, parallele = 3, timeoutMs = 30000, refs = null, surProgres = () => {}, signal } = o;
  if (!f) throw new ErreurSource('reseau', 'fetch indisponible');
  const t0 = maintenant(); let octets = 0, requetes = 0; const brutes = [];
  const page = async (debut) => { const r = await lirePage(f, urlWfs(niveau, { produit, filtre, debut, nombre: pageTaille }), { timeoutMs, signal }); requetes++; octets += r.octets; return r.json; };
  const j0 = await page(0); brutes.push(...j0.features);
  const total = Number.isFinite(j0.numberMatched) ? j0.numberMatched : Number.isFinite(j0.totalFeatures) ? j0.totalFeatures : null;
  surProgres({ pages: 1, chargees: brutes.length, total });
  if (j0.features.length >= pageTaille && (total === null || total > pageTaille)) {
    const debuts = []; if (total !== null) for (let d = pageTaille; d < total; d += pageTaille) debuts.push(d);
    if (total !== null) {
      const resultats = new Array(debuts.length); let suivant = 0, pages = 1;
      const ouvrier = async () => { while (suivant < debuts.length) { const i = suivant++; resultats[i] = (await page(debuts[i])).features; pages++; surProgres({ pages, chargees: brutes.length + resultats.reduce((s, x) => s + (x ? x.length : 0), 0), total }); } };
      await Promise.all(Array.from({ length: Math.min(parallele, debuts.length) }, ouvrier));
      for (const r of resultats) brutes.push(...r);
    } else { // total inconnu : séquentiel jusqu'à une page incomplète
      let d = pageTaille; for (let n = 0; n < 60; n++) { const j = await page(d); brutes.push(...j.features); surProgres({ pages: n + 2, chargees: brutes.length, total: null }); if (j.features.length < pageTaille) break; d += pageTaille; }
    }
  }
  const features = enrichir(niveau, brutes.map((x) => normaliser(niveau, x)), refs);
  return { features, meta: { source: 'ign-wfs', produit, niveau, filtre, millesime: '2026', attribution: attributionSure(ATTRIBUTION_IGN), nRequetes: requetes, octets, ms: Math.round(maintenant() - t0), total: total ?? features.length, partiel: total !== null && features.length < total } };
}

/** Jeu embarqué léger (régions, départements, pays). `base` : dossier des fichiers (par défaut `lib/bi/donnees/`). */
export async function chargerEmbarque(niveau, o = {}) {
  const { fetch: f = globalThis.fetch, base = '', refs = null, filtre = null } = o;
  if (!NIVEAUX_EMBARQUES.includes(niveau)) throw new ErreurSource('embarque', 'Aucun jeu embarqué pour le niveau « ' + niveau + ' » (régions, départements et pays seulement).');
  const nom = { pays: 'pays-leger.json', region: 'regions-leger.json', departement: 'departements-leger.json' }[niveau];
  const t0 = maintenant(); let res;
  try { res = await f(base + nom); } catch (e) { throw new ErreurSource('reseau', 'Jeu embarqué introuvable : ' + nom, { cause: String(e && e.message || e) }); }
  if (!res.ok) throw new ErreurSource('http', 'Jeu embarqué introuvable : ' + nom + ' (HTTP ' + res.status + ').');
  const texte = await res.text(); const json = JSON.parse(texte);
  let feats = json.features.map((x) => ({ type: 'Feature', properties: { ...x.properties }, geometry: x.geometry }));
  if (filtre && filtre.region) feats = feats.filter((x) => x.properties.region === filtre.region);
  enrichir(niveau, feats, refs);
  return { features: feats, meta: { source: 'embarque', niveau, millesime: niveau === 'pays' ? 'Natural Earth 110m' : '2026', licence: json.meta?.licence, attribution: attributionSure(niveau === 'pays' ? ATTRIBUTION_NE : ATTRIBUTION_IGN), nRequetes: 1, octets: texte.length, ms: Math.round(maintenant() - t0), total: feats.length, simplifie: true } };
}

/**
 * Essaie le service IGN, puis le jeu embarqué (régions, départements) en cas d'indisponibilité.
 * Le repli est explicite : meta.repli = true et meta.cause décrit l'échec. Pour les niveaux sans jeu embarqué, l'erreur remonte.
 */
export async function chargerAvecRepli(niveau, o = {}) {
  if (niveau === 'pays') return chargerEmbarque('pays', o);
  try { return await chargerCouche(niveau, o); }
  catch (e) {
    if (!(e instanceof ErreurSource)) throw e;
    if (!NIVEAUX_EMBARQUES.includes(niveau)) throw new ErreurSource(e.code, e.message + ' Aucun jeu embarqué de repli pour le niveau « ' + niveau + ' » (régions, départements et pays seulement).', e.details);
    const r = await chargerEmbarque(niveau, o); r.meta.repli = true; r.meta.cause = e.message.replace(/[.\s]+$/, ''); return r;
  }
}

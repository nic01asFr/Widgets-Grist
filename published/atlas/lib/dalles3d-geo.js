/**
 * Les maquettes en dalles 3D : la partie pure (sans three.js, sans MapLibre, sans réseau), qui se teste sous Node.
 *
 * Une maquette est servie comme un fond de carte : un petit manifeste de grille (`grille3d.json`), puis un GLB par dalle et par niveau de détail,
 * à une adresse qui se calcule. Ce module sait lire le manifeste, calculer les adresses, choisir le niveau selon la distance et poser une dalle sur
 * la carte : la matrice qui envoie le repère de son GLB vers l'espace Mercator de MapLibre.
 *
 * Contrat de la Fabrique (pix2hdr-atlas-grille3d/0.1) :
 *  - la grille est en Lambert 93 (EPSG:2154), au pas de `pas_m` ; une dalle se nomme `FXX_L93_200_E{E}_N{N}`, (E, N) étant son coin NORD-OUEST ;
 *  - le GLB d'une dalle est en mètres de grille, `x` = est de grille, `y` = haut, `z` = −nord de grille, origine au centre de la dalle ;
 *  - `ancrage.json` donne l'origine (WGS 84), l'altitude d'origine (IGN69), la convergence des méridiens et le facteur d'échelle :
 *    `azimut_grille = azimut_géographique + convergence_deg`, distances de grille = distances réelles × `facteur_echelle` ;
 *  - altitude absolue (IGN69) = `y` + `altitude_origine_m`.
 * La verticale n'est pas touchée par le facteur d'échelle (c'est une altitude réelle) ; si la Fabrique dit autre chose, ce module est le seul endroit à changer.
 *
 * SÉCURITÉ. Le manifeste vient d'une adresse que la page hôte désigne : toute adresse calculée doit avoir l'origine du manifeste (jamais un tiers), être admise
 * (https, ou http sur localhost), et les nombres lus sont bornés.
 */
import { adresseAdmise } from './scene-externe.js?v=1.42.1';

export const SCHEMA_GRILLE = 'pix2hdr-atlas-grille3d/0.1';
/** Un niveau de détail reste sous ce nom ; le plus fin porte le plus petit numéro (D1 fin, D3 grossier). */
export const NIVEAUX_CONNUS = Object.freeze(['D1', 'D2', 'D3']);
export const PLAFOND_DALLES_VUE = 48;
export const PLAFOND_OCTETS_GLB = 96 * 1024 * 1024;
const RAYON_TERRE_M = 6371008.8;   // celui de MapLibre : `meterInMercatorCoordinateUnits` en dépend

const nombreOu = (v, defaut) => (typeof v === 'number' && Number.isFinite(v) ? v : defaut);

/**
 * Lit un manifeste de grille. Lève une erreur claire quand il n'est pas lisible : une maquette illisible ne se monte pas à moitié.
 * @param {any} json
 * @param {string} urlManifeste  adresse absolue du manifeste (les adresses relatives s'y rapportent)
 * @returns {{version:string, pas:number, niveaux:{niveau:string, refine:string, distanceMax:number, erreur:number|null, produit:boolean}[], gabarits:{glb:string, ancrage:string, disponibilite:string}, mention:string, base:string}}   `mention` : le texte de source du manifeste, à passer par `attributionSure` avant la carte
 */
export function lireGrille(json, urlManifeste) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('manifeste de grille : objet JSON attendu');
  if (json.schema !== SCHEMA_GRILLE) throw new Error('manifeste de grille : schéma « ' + String(json.schema).slice(0, 60) + ' » non lu (attendu : ' + SCHEMA_GRILLE + ')');
  if (json.crs !== 'EPSG:2154') throw new Error('manifeste de grille : seule la grille Lambert 93 (EPSG:2154) est lue (reçu : ' + String(json.crs).slice(0, 20) + ')');
  const pas = nombreOu(json.pas_m, 0);
  if (!(pas >= 10 && pas <= 5000)) throw new Error('manifeste de grille : pas_m hors bornes (10 à 5000)');
  const g = json.gabarits || {};
  for (const cle of ['glb', 'ancrage', 'disponibilite']) if (typeof g[cle] !== 'string' || !g[cle]) throw new Error('manifeste de grille : gabarit « ' + cle + ' » manquant');
  if (!/\{E\}/.test(g.glb) || !/\{N\}/.test(g.glb) || !/\{niveau\}/.test(g.glb)) throw new Error('manifeste de grille : le gabarit glb doit porter {E}, {N} et {niveau}');
  if (!/\{E\}/.test(g.ancrage) || !/\{N\}/.test(g.ancrage)) throw new Error('manifeste de grille : le gabarit ancrage doit porter {E} et {N}');
  const refus = adresseAdmise(urlManifeste); if (refus) throw new Error('manifeste de grille : ' + refus);
  const niveaux = (Array.isArray(json.niveaux) ? json.niveaux : []).filter((n) => n && NIVEAUX_CONNUS.includes(n.niveau)).map((n) => ({
    niveau: n.niveau, refine: n.refine === 'ADD' ? 'ADD' : 'REPLACE', distanceMax: nombreOu(n.distance_max_m, 0), erreur: nombreOu(n.erreur_geometrique_m, null), produit: n.produit !== false,
  })).sort((a, b) => a.niveau.localeCompare(b.niveau));
  if (!niveaux.some((n) => n.produit && n.refine === 'REPLACE')) throw new Error('manifeste de grille : aucun niveau produit');
  return { version: String(json.version || ''), pas, niveaux, gabarits: { glb: g.glb, ancrage: g.ancrage, disponibilite: g.disponibilite }, mention: typeof json.attribution === 'string' ? json.attribution : '', base: urlManifeste };
}

/**
 * Adresse calculée à partir d'un gabarit relatif au manifeste. Refusée si elle sort de l'origine du manifeste ou n'est pas admise.
 * @param {string} gabarit  ex. `dalles3d/FXX_L93_200_E{E}_N{N}/{niveau}.glb`
 * @param {{E?:string, N?:string, niveau?:string}} valeurs
 * @param {string} urlManifeste
 */
export function urlGabarit(gabarit, valeurs, urlManifeste) {
  const motif = (v) => /^[0-9A-Za-z_-]{1,16}$/.test(String(v));
  for (const [k, v] of Object.entries(valeurs || {})) if (!motif(v)) throw new Error('valeur « ' + k + ' » inattendue : ' + String(v).slice(0, 20));
  const brut = gabarit.replace('{E}', valeurs.E ?? '').replace('{N}', valeurs.N ?? '').replace('{niveau}', valeurs.niveau ?? '');
  const u = new URL(brut, urlManifeste);
  const base = new URL(urlManifeste);
  if (u.origin !== base.origin) throw new Error('adresse hors de l’origine du manifeste : ' + u.origin);
  const refus = adresseAdmise(u.href); if (refus) throw new Error(refus);
  return u.href;
}

/** `disponibilite.json?bbox=ouest,sud,est,nord` : les dalles livrées dans la fenêtre. */
export function urlDisponibilite(grille, bbox) {
  const u = new URL(urlGabarit(grille.gabarits.disponibilite, {}, grille.base));
  if (bbox) u.searchParams.set('bbox', bbox.map((v) => Number(v).toFixed(5)).join(','));
  return u.href;
}

/**
 * Lit la liste des dalles disponibles.
 * @returns {{version:string, dalles:{E:string, N:string, identifiant:string, niveaux:{niveau:string, empreinte:string, octets:number}[], empreinteAncrage:string}[]}}
 */
export function lireDisponibilite(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.dalles)) throw new Error('disponibilité : liste de dalles attendue');
  const dalles = [];
  for (const d of json.dalles) {
    if (!d || typeof d.identifiant !== 'string' || !/^[0-9]{7}$/.test(String(d.E)) || !/^[0-9]{7}$/.test(String(d.N))) continue;
    if (d.statut && d.statut !== 'livree') continue;
    const niveaux = (Array.isArray(d.niveaux) ? d.niveaux : []).filter((n) => n && NIVEAUX_CONNUS.includes(n.niveau) && typeof n.empreinte === 'string' && n.octets <= PLAFOND_OCTETS_GLB)
      .map((n) => ({ niveau: n.niveau, empreinte: n.empreinte, octets: nombreOu(n.octets, 0) }));
    if (niveaux.length) dalles.push({ E: String(d.E), N: String(d.N), identifiant: d.identifiant, niveaux, empreinteAncrage: String(d.empreinte_ancrage || '') });
  }
  return { version: String(json.version || ''), dalles };
}

/**
 * Lit `ancrage.json` : tout ce qu'il faut pour poser la dalle, bornes comprises.
 * @returns {{identifiant:string, origine:[number,number], altitudeOrigine:number, convergenceDeg:number, facteurEchelle:number, boite:{min:number[], max:number[]}|null}}
 */
export function lireAncrage(json) {
  const a = json && json.ancrage;
  if (!a || !Array.isArray(a.origine_wgs84) || a.origine_wgs84.length < 2) throw new Error('ancrage : origine_wgs84 manquante');
  const [lng, lat] = a.origine_wgs84.map(Number);
  if (!(Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) < 85)) throw new Error('ancrage : origine_wgs84 hors bornes');
  const alt = Number(a.altitude_origine_m), conv = Number(a.convergence_deg), k = Number(a.facteur_echelle);
  if (!Number.isFinite(alt) || Math.abs(alt) > 9000) throw new Error('ancrage : altitude_origine_m illisible');
  if (!Number.isFinite(conv) || Math.abs(conv) > 10) throw new Error('ancrage : convergence_deg hors bornes');
  if (!(k > 0.99 && k < 1.01)) throw new Error('ancrage : facteur_echelle hors bornes (0,99 à 1,01)');
  const b = json.boite;
  const boite = b && Array.isArray(b.min) && Array.isArray(b.max) && b.min.length === 3 && b.max.length === 3 && [...b.min, ...b.max].every(Number.isFinite) ? { min: b.min.map(Number), max: b.max.map(Number) } : null;
  return { identifiant: String(json.identifiant || ''), origine: [lng, lat], altitudeOrigine: alt, convergenceDeg: conv, facteurEchelle: k, boite };
}

/** Coordonnées Mercator (0 à 1) de MapLibre. */
export function mercator(lng, lat) {
  return [(lng + 180) / 360, 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI)];
}
/** Taille d'un mètre en unités Mercator à cette latitude (`MercatorCoordinate.meterInMercatorCoordinateUnits`). */
export function metreEnMercator(lat) { return 1 / (2 * Math.PI * RAYON_TERRE_M * Math.cos((lat * Math.PI) / 180)); }

/**
 * La matrice (16 nombres, colonne par colonne) qui envoie le repère du GLB d'une dalle vers l'espace Mercator.
 * Étapes : repère de grille (E = x, N = −z, haut = y) ; rotation du nord de grille vers le nord géographique (−convergence) et échelle 1/k ;
 * mètres vers unités Mercator, Y vers le sud ; altitude de base ajoutée.
 * @param {{origine:[number,number], convergenceDeg:number, facteurEchelle:number}} ancrage
 * @param {number} altitudeBase  altitude du plan y = 0 de la dalle, en mètres (absolue, ou celle du sol local)
 */
export function matriceDalle(ancrage, altitudeBase) {
  const [lng, lat] = ancrage.origine;
  const [x0, y0] = mercator(lng, lat); const s = metreEnMercator(lat);
  const d = (-ancrage.convergenceDeg * Math.PI) / 180, c = Math.cos(d), sn = Math.sin(d), k = ancrage.facteurEchelle;
  const a = (s * c) / k, b = (s * sn) / k;
  // lignes X, Y, Z ; colonnes gx, gy, gz, 1
  return [
    a, b, 0, 0,          // colonne gx
    0, 0, s, 0,          // colonne gy
    -b, a, 0, 0,         // colonne gz
    x0, y0, s * altitudeBase, 1,
  ];
}

/** Produit de deux matrices 4x4 (colonne par colonne) : `a × b`. */
export function produit4(a, b) {
  const r = new Array(16).fill(0);
  for (let col = 0; col < 4; col++) for (let ligne = 0; ligne < 4; ligne++) { let t = 0; for (let k = 0; k < 4; k++) t += a[k * 4 + ligne] * b[col * 4 + k]; r[col * 4 + ligne] = t; }
  return r;
}
/** Inverse d'une matrice 4x4 (méthode des cofacteurs ; double précision). Renvoie null si elle n'est pas inversible. */
export function inverse4(m) {
  const [m00, m10, m20, m30, m01, m11, m21, m31, m02, m12, m22, m32, m03, m13, m23, m33] = m;
  const b00 = m00 * m11 - m10 * m01, b01 = m00 * m21 - m20 * m01, b02 = m00 * m31 - m30 * m01, b03 = m10 * m21 - m20 * m11, b04 = m10 * m31 - m30 * m11, b05 = m20 * m31 - m30 * m21;
  const b06 = m02 * m13 - m12 * m03, b07 = m02 * m23 - m22 * m03, b08 = m02 * m33 - m32 * m03, b09 = m12 * m23 - m22 * m13, b10 = m12 * m33 - m32 * m13, b11 = m22 * m33 - m32 * m23;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det || !Number.isFinite(det)) return null;
  const i = 1 / det;
  return [
    (m11 * b11 - m21 * b10 + m31 * b09) * i, (m20 * b10 - m10 * b11 - m30 * b09) * i, (m13 * b05 - m23 * b04 + m33 * b03) * i, (m22 * b04 - m12 * b05 - m32 * b03) * i,
    (m21 * b08 - m01 * b11 - m31 * b07) * i, (m00 * b11 - m20 * b08 + m30 * b07) * i, (m23 * b02 - m03 * b05 - m33 * b01) * i, (m02 * b05 - m22 * b02 + m32 * b01) * i,
    (m01 * b10 - m11 * b08 + m31 * b06) * i, (m10 * b08 - m00 * b10 - m30 * b06) * i, (m03 * b04 - m13 * b02 + m33 * b00) * i, (m12 * b02 - m02 * b04 - m32 * b00) * i,
    (m11 * b07 - m01 * b09 - m21 * b06) * i, (m00 * b09 - m10 * b07 + m20 * b06) * i, (m13 * b01 - m03 * b03 - m23 * b00) * i, (m02 * b03 - m12 * b01 + m22 * b00) * i,
  ];
}
/** Applique une matrice 4x4 à un point (x, y, z). */
export function appliquer4(m, [x, y, z]) {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}

/**
 * Le niveau à montrer pour une distance : le plus fin des niveaux PRODUITS et PRÉSENTS dans la dalle dont la portée (`distance_max_m`) couvre la distance.
 * `null` au-delà de la portée du plus grossier : rien à montrer (la dalle est trop loin pour servir).
 * @param {{niveau:string, refine:string, distanceMax:number, produit:boolean}[]} niveauxGrille
 * @param {string[]} presents  niveaux livrés pour cette dalle
 */
export function niveauPourDistance(niveauxGrille, presents, distance) {
  const candidats = niveauxGrille.filter((n) => n.produit && n.refine === 'REPLACE' && presents.includes(n.niveau) && distance <= n.distanceMax);
  return candidats.length ? candidats[0].niveau : null;   // trié du plus fin au plus grossier
}

/**
 * Ce qui doit être visible pour ne jamais laisser de trou : le niveau voulu s'il est chargé, sinon le plus fin des niveaux déjà chargés parmi les plus grossiers.
 * @param {string|null} voulu
 * @param {string[]} charges  niveaux chargés pour cette dalle
 */
export function niveauAffiche(voulu, charges) {
  if (!voulu) return null;
  if (charges.includes(voulu)) return voulu;
  const ordre = NIVEAUX_CONNUS; const i = ordre.indexOf(voulu);
  for (let j = i + 1; j < ordre.length; j++) if (charges.includes(ordre[j])) return ordre[j];   // un niveau plus grossier déjà là vaut mieux qu'un trou
  for (let j = i - 1; j >= 0; j--) if (charges.includes(ordre[j])) return ordre[j];             // à défaut, plus fin
  return null;
}

/** Distance (m) entre deux points Mercator `[x, y, z]` (z en unités Mercator) à la latitude donnée. */
export function distanceM(a, b, lat) { const s = metreEnMercator(lat); return Math.hypot(a[0] - b[0], a[1] - b[1], (a[2] || 0) - (b[2] || 0)) / s; }

/** Cache à budget d'octets : la plus anciennement utilisée part la première. */
export function creerCacheLRU(budgetOctets, surRetrait = () => {}) {
  const m = new Map(); let total = 0;
  return {
    get(cle) { if (!m.has(cle)) return undefined; const v = m.get(cle); m.delete(cle); m.set(cle, v); return v.valeur; },
    has: (cle) => m.has(cle),
    set(cle, valeur, octets) {
      if (m.has(cle)) { total -= m.get(cle).octets; m.delete(cle); }
      m.set(cle, { valeur, octets: octets || 0 }); total += octets || 0;
      for (const [k, v] of m) { if (total <= budgetOctets || m.size <= 1) break; if (k === cle) continue; m.delete(k); total -= v.octets; try { surRetrait(k, v.valeur); } catch (e) { /* le retrait ne casse pas le cache */ } }
    },
    delete(cle) { if (m.has(cle)) { total -= m.get(cle).octets; m.delete(cle); } },
    get taille() { return m.size; }, get octets() { return total; }, cles: () => [...m.keys()],
  };
}

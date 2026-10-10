// Construit l'artefact `donnees` du paquet hors ligne d'Atlas : un DOSSIER ordinaire (sans git ni npm) que l'hôte copie tel quel.
//
//   node tools/construire-paquet.mjs --sortie <dossier> [--departements 70,2A,971 | --communes 70001,19272]
//        [--produit pe|carto] [--edition 2026] [--version-paquet 1.0.0] [--socle <dossier des jeux légers>]
//
// Sans --departements ni --communes : France entière (101 départements du référentiel embarqué).
// Contenu : le socle embarqué (pays, régions, départements, référentiel de population), un fichier de communes par département
// (+ arrondissements municipaux de Paris, Lyon, Marseille), LICENCES.txt, cache.txt, manifeste.json.
// Le manifeste décrit chaque fichier : { chemin, taille, integrite (sha384-<base64>), portee, departement? }.
// Réseau : le seul accès est le WFS IGN (ADMIN EXPRESS), lu par le client d'Atlas (lib/bi/admin-sources.js).
// Une construction qui échoue n'écrit rien : le dossier est monté à côté puis renommé.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chargerCouche, PRODUITS } from '../lib/bi/admin-sources.js';
import { DEPARTEMENTS } from '../lib/bi/admin-referentiel.js';
import { departementDeCommune } from '../lib/bi/admin.js';
import { VERSION as VERSION_CONTRAT } from '../lib/bi/pont.js';
import { VERSION_CHARTE } from '../lib/charte/schema.js';

export const FORMAT_PAQUET = 'atlas-bi-paquet/1';
export const DECIMALES = 4; // ≈ 11 m ; repli à 5 puis 6 pour une entité qui s'effondrerait
const SOCLE = ['pays-leger.json', 'regions-leger.json', 'departements-leger.json', 'references-population.json'];
const DOSSIER_SOCLE = fileURLToPath(new URL('../lib/bi/donnees/', import.meta.url));

export class ErreurPaquet extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'ErreurPaquet'; this.code = code; this.details = details; }
}

/** Empreinte au format de l'attribut HTML `integrity`. */
export function empreinte(octets) { return 'sha384-' + crypto.createHash('sha384').update(octets).digest('base64'); }

/** Codes de département de la France entière, triés. */
export function departementsParDefaut() { return Object.keys(DEPARTEMENTS).sort(); }

const arrondir = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
function arrondirAnneau(anneau, d) {
  const pts = [];
  for (const [x, y] of anneau) {
    const p = [arrondir(x, d), arrondir(y, d)];
    const dernier = pts[pts.length - 1];
    if (!dernier || dernier[0] !== p[0] || dernier[1] !== p[1]) pts.push(p);
  }
  if (pts.length && (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1])) pts.push([...pts[0]]);
  return pts;
}
function arrondirPolygone(poly, d) {
  const anneaux = [];
  for (let k = 0; k < poly.length; k++) {
    const r = arrondirAnneau(poly[k], d);
    if (r.length >= 4) anneaux.push(r); else if (k === 0) return null; // anneau extérieur effondré : tout le polygone
  }
  return anneaux;
}
/** Arrondit une géométrie ; si rien ne survit à `decimales`, retente avec une décimale de plus (jusqu'à 6). */
export function arrondirGeometrie(g, decimales = DECIMALES) {
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return g;
  for (let d = decimales; d <= 6; d++) {
    const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map((p) => arrondirPolygone(p, d)).filter(Boolean);
    if (polys.length) return g.type === 'Polygon' ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
  }
  return g;
}

/** Entité normalisée (chargerCouche) -> entité du paquet : code INSEE, nom, population, niveau (+ commune de rattachement pour un arrondissement). */
export function reduireEntite(niveau, f) {
  const p = f.properties || {};
  const props = { code: p.code, nom: p.nom, population: p.population ?? null, niveau };
  if (niveau === 'arrondissement') props.commune = p.commune ?? null;
  return { type: 'Feature', properties: props, geometry: arrondirGeometrie(f.geometry) };
}

const compter = (valeurs) => { const m = new Map(); for (const v of valeurs) if (v) m.set(v, (m.get(v) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null; };

/**
 * Fichier de communes d'un département.
 * @param {string} dep  code du département (2 chiffres, 2A, 2B, 971…)
 * @param {{fetch:Function, produit?:string, edition?:string, pageTaille?:number, communes?:string[], arrondissements?:object[], signal?:AbortSignal}} o
 *   arrondissements : entités normalisées de la couche arrondissement_municipal (toutes) ; on garde celles dont la commune de rattachement est dans `dep`.
 */
export async function construireFichierDepartement(dep, o = {}) {
  const { fetch: f, produit = 'pe', edition = null, pageTaille = 5000, communes = null, arrondissements = [], signal } = o;
  const { features, meta } = await chargerCouche('commune', { fetch: f, produit, filtre: { departement: dep }, pageTaille, signal });
  const retenu = communes ? new Set(communes) : null;
  let entites = features.filter((x) => !retenu || retenu.has(x.properties.code)).map((x) => reduireEntite('commune', x));
  const arr = arrondissements
    .filter((x) => departementDeCommune(x.properties.commune) === dep && (!retenu || retenu.has(x.properties.commune)))
    .map((x) => reduireEntite('arrondissement', x));
  if (!entites.length && !arr.length) throw new ErreurPaquet('vide', 'Aucune commune reçue pour le département ' + dep + (retenu ? ' parmi les codes demandés.' : ' : le service a répondu sans entité.'), { departement: dep });
  const recensement = compter(features.map((x) => x.properties.annee_population));
  entites = [...entites, ...arr].sort((a, b) => (a.properties.code < b.properties.code ? -1 : a.properties.code > b.properties.code ? 1 : 0));
  return {
    fichier: {
      type: 'FeatureCollection',
      meta: {
        source: 'IGN, ADMIN EXPRESS ' + (PRODUITS[produit] || produit) + (edition ? ', edition ' + edition : ''),
        licence: 'Licence Ouverte 2.0 (Etalab) - attribution IGN et INSEE',
        departement: dep, produit, recensement, decimales: DECIMALES,
      },
      features: entites,
    },
    recensement, communes: entites.filter((x) => x.properties.niveau === 'commune').length, arrondissements: arr.length, octetsService: meta.octets,
  };
}

const TEXTE_LICENCES = `Licences des donnees de ce paquet
=================================

Contours des communes, arrondissements municipaux, departements et regions
  Source : IGN, ADMIN EXPRESS (COG CARTO, petite echelle), diffuse par la Geoplateforme (data.geopf.fr).
  Licence Ouverte 2.0 (Etalab) : https://www.etalab.gouv.fr/licence-ouverte-open-licence/
  Attribution obligatoire : « Contours : IGN ADMIN EXPRESS (Licence Ouverte) ».
  Les contours sont arrondis a 4 decimales (environ 11 m) : ils ne conviennent pas a un usage cadastral.

Populations legales
  Source : INSEE, populations legales, portees par les attributs d'ADMIN EXPRESS (millesime : voir manifeste.json, champ « recensement »).
  Licence Ouverte 2.0 (Etalab).
  Attribution obligatoire : « population : INSEE, populations legales ».

Contours des pays (jeu leger du socle)
  Source : Natural Earth, 1:110m, admin 0 (https://www.naturalearthdata.com/).
  Domaine public : aucune attribution exigee ; elle reste conseillee.

Ce paquet est produit par tools/construire-paquet.mjs d'Atlas. Le manifeste (manifeste.json) donne la taille et l'empreinte SHA-384 de chaque fichier.
Ne modifiez pas les fichiers de donnees : verifiez-les avec tools/verifier-paquet.mjs.
`;

function ecrire(racine, chemin, octets) {
  const cible = path.join(racine, ...chemin.split('/'));
  fs.mkdirSync(path.dirname(cible), { recursive: true });
  fs.writeFileSync(cible, octets);
}
const entree = (chemin, octets, portee, departement) => ({ chemin, taille: octets.length, integrite: empreinte(octets), portee, ...(departement ? { departement } : {}) });

/**
 * Construit le dossier du paquet. Rien n'est laissé à moitié écrit : montage dans un dossier voisin, puis renommage.
 * @param {{sortie:string, fetch:Function, departements?:string[], communes?:string[], produit?:string, edition?:string, versionPaquet?:string,
 *          socle?:string, pageTaille?:number, maintenant?:()=>Date, surProgres?:(e:object)=>void, signal?:AbortSignal}} o
 * @returns {Promise<object>} le manifeste
 */
export async function construirePaquet(o = {}) {
  const { sortie, fetch: f = globalThis.fetch, produit = 'pe', versionPaquet = '1.0.0', socle = DOSSIER_SOCLE, pageTaille = 5000,
    maintenant = () => new Date(), surProgres = () => {}, signal } = o;
  if (!sortie) throw new ErreurPaquet('sortie', 'Dossier de sortie manquant (--sortie).');
  if (!f) throw new ErreurPaquet('reseau', 'fetch indisponible.');
  let { departements, communes } = o;
  if (communes && communes.length) {
    for (const c of communes) if (!departementDeCommune(c)) throw new ErreurPaquet('commune', 'Code INSEE de commune invalide : ' + c, { code: c });
    if (!departements || !departements.length) departements = [...new Set(communes.map(departementDeCommune))];
  }
  departements = [...new Set(departements && departements.length ? departements : departementsParDefaut())].sort();
  for (const d of departements) if (!DEPARTEMENTS[d]) throw new ErreurPaquet('departement', 'Code de departement inconnu : ' + d, { departement: d });

  const racine = path.resolve(sortie);
  if (fs.existsSync(racine)) {
    const contenu = fs.readdirSync(racine);
    if (contenu.length && !contenu.includes('manifeste.json')) throw new ErreurPaquet('sortie', 'Le dossier de sortie existe, n\'est pas vide et n\'est pas un paquet : ' + racine);
  }
  fs.mkdirSync(path.dirname(racine), { recursive: true });
  const montage = racine + '.montage-' + process.pid;
  fs.rmSync(montage, { recursive: true, force: true });
  fs.mkdirSync(montage, { recursive: true });

  try {
    const edition = o.edition ?? editionDuSocle(socle);
    const fichiers = [];
    for (const nom of SOCLE) {
      const octets = fs.readFileSync(path.join(socle, nom));
      ecrire(montage, 'donnees/' + nom, octets); fichiers.push(entree('donnees/' + nom, octets, 'france'));
    }
    const plm = departements.some((d) => ['75', '69', '13'].includes(d));
    const arrondissements = plm ? (await chargerCouche('arrondissement', { fetch: f, produit, pageTaille, signal })).features : [];
    const recensements = []; let nCommunes = 0, nArrondissements = 0;
    for (const dep of departements) {
      const par = communes && communes.length ? communes.filter((c) => departementDeCommune(c) === dep) : null;
      const r = await construireFichierDepartement(dep, { fetch: f, produit, edition, pageTaille, communes: par, arrondissements, signal });
      const octets = Buffer.from(JSON.stringify(r.fichier), 'utf8');
      const chemin = 'donnees/communes/' + dep + '.json';
      ecrire(montage, chemin, octets); fichiers.push(entree(chemin, octets, 'departement', dep));
      recensements.push(r.recensement); nCommunes += r.communes; nArrondissements += r.arrondissements;
      surProgres({ departement: dep, fait: fichiers.length - SOCLE.length, total: departements.length, communes: r.communes, octets: octets.length });
    }
    const licences = Buffer.from(TEXTE_LICENCES, 'utf8');
    ecrire(montage, 'LICENCES.txt', licences); fichiers.push(entree('LICENCES.txt', licences, 'france'));
    fichiers.sort((a, b) => (a.chemin < b.chemin ? -1 : a.chemin > b.chemin ? 1 : 0));

    const manifeste = {
      format: FORMAT_PAQUET,
      version_paquet: versionPaquet,
      version_contrat: VERSION_CONTRAT,
      version_charte: VERSION_CHARTE.split('/')[1],
      edition_admin_express: edition,
      produit_contours: produit,
      recensement: compter(recensements),
      construit_le: maintenant().toISOString(),
      territoires: { departements, communes: nCommunes, arrondissements: nArrondissements },
      fichiers,
    };
    ecrire(montage, 'manifeste.json', Buffer.from(JSON.stringify(manifeste, null, 2) + '\n', 'utf8'));
    const cache = ['# Fichiers a mettre en cache hors ligne (un chemin par ligne, relatif a ce dossier).',
      '# Le socle (portee france) suffit aux niveaux pays, regions, departements ; un fichier communes/<departement>.json par territoire utilise.',
      ...fichiers.map((x) => x.chemin)].join('\n') + '\n';
    ecrire(montage, 'cache.txt', Buffer.from(cache, 'utf8'));
    const cacheSocle = ['# Minimum a mettre en cache pour demarrer hors ligne : le socle (portee france) et les licences.',
      '# Les fichiers communes/<departement>.json se mettent en cache a la demande, selon les territoires utilises.',
      ...fichiers.filter((x) => x.portee === 'france').map((x) => x.chemin)].join('\n') + '\n';
    ecrire(montage, 'cache-socle.txt', Buffer.from(cacheSocle, 'utf8'));

    fs.rmSync(racine, { recursive: true, force: true });
    fs.renameSync(montage, racine);
    return manifeste;
  } catch (e) {
    fs.rmSync(montage, { recursive: true, force: true });
    throw e;
  }
}

function editionDuSocle(socle) {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(socle, 'departements-leger.json'), 'utf8')).meta || {};
    return (/edition (\d{4})/.exec(meta.source || '') || [])[1] || null;
  } catch { return null; }
}

function lireArguments(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]; const v = () => { if (i + 1 >= argv.length) throw new ErreurPaquet('argument', 'Valeur manquante pour ' + a); return argv[++i]; };
    if (a === '--sortie') o.sortie = v();
    else if (a === '--departements') o.departements = v().split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    else if (a === '--communes') o.communes = v().split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    else if (a === '--produit') o.produit = v();
    else if (a === '--edition') o.edition = v();
    else if (a === '--version-paquet') o.versionPaquet = v();
    else if (a === '--socle') o.socle = v();
    else throw new ErreurPaquet('argument', 'Argument inconnu : ' + a);
  }
  return o;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const o = lireArguments(process.argv.slice(2));
    o.surProgres = (e) => console.log(`[${e.fait}/${e.total}] ${e.departement} : ${e.communes} communes, ${(e.octets / 1024).toFixed(0)} Ko`);
    const m = await construirePaquet(o);
    const total = m.fichiers.reduce((s, x) => s + x.taille, 0);
    console.log(`Paquet ${m.version_paquet} : ${m.fichiers.length} fichiers, ${(total / 1048576).toFixed(1)} Mo, ${m.territoires.communes} communes, edition ${m.edition_admin_express}, recensement ${m.recensement}.`);
  } catch (e) {
    console.error((e && e.message) || e); process.exit(1);
  }
}

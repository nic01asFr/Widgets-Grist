/**
 * Configuration déclarative de `<atlas-bi>` : une carte sans code d'orchestration.
 *
 *   <atlas-bi src="…" manifeste="/carte/manifeste.json" charte="/carte/charte.json" fond="plan"></atlas-bi>
 *
 *   <atlas-bi src="…">
 *     <script type="application/json" data-atlas="manifeste">{ "layers": [ … ] }</script>
 *     <script type="application/json" data-atlas="donnees">{ "sites": [ … ] }</script>
 *   </atlas-bi>
 *
 * Sans `manifeste`, des `donnees` suffisent : le manifeste est INFÉRÉ (`lib/bi/inference.js` : géométrie, identifiants, clé métier, couleurs par classe, filtre)
 * et ce qui a été décidé est dit dans `notes`. Un manifeste explicite prime toujours.
 *
 * Ce que l'hôte déclare : `manifeste` (manifeste de scène), `donnees` (`{ idCouche: [Features] }`, facultatif : une couche peut aussi porter
 * `geojson.features`), `charte` (charte graphique), `fond` (`atlas`, `voile`, `uni`, `plan`, `plan-ign`, `photo`). Chacun s'écrit en attribut
 * (adresse d'un fichier JSON) OU en bloc `<script type="application/json" data-atlas="…">` dans l'élément, jamais les deux.
 *
 * Qui lit quoi : les adresses sont lues PAR LA PAGE HÔTE (même origine qu'elle, ou serveur qui autorise la page), puis passées au composant ;
 * Atlas ne charge aucune charte ni donnée par adresse (choix de sécurité n° 5 du contrat de charte, conservé). Seules les adresses http(s) sont
 * acceptées ; la taille lue est bornée ; le contenu n'est jamais interprété comme du HTML (JSON seulement).
 *
 * Cadrage : une scène déclarée est cadrée sur ses entités (`fitTo`) pour qu'on la voie dès le premier affichage ; `cadrage="aucun"` le désactive (l'hôte garde
 * la caméra par défaut ou la pilote lui-même). Une scène qui porte une couche administrative se cadre seule (`addAdminLayer`) : pas de cadrage ajouté.
 *
 * Ordre appliqué à la connexion, puis à chaque changement d'un attribut déclaratif : charte, fond, scène (la charte est posée avant les couches
 * pour que la première image soit à ses couleurs). Les commandes de l'élément restent disponibles pour qui veut piloter à la main.
 *
 * Module sans dépendance vers le DOM : l'élément lui passe ce qu'il sait lire.
 */
import { ErreurBi } from './client.js';

/** Taille maximale lue pour un fichier déclaré (octets) : au-delà, l'hôte a une donnée trop lourde pour un fichier de configuration. */
export const LIMITE_OCTETS = 16 * 1024 * 1024;

/** Les quatre éléments déclaratifs, avec l'attribut qui porte leur adresse. */
export const DECLARATIFS = ['manifeste', 'donnees', 'charte', 'fond', 'cadrage'];
/** Attributs dont le changement reconfigure la carte (sans remonter l'iframe). */
export const ATTRIBUTS_DECLARATIFS = ['manifeste', 'donnees', 'charte', 'fond', 'cadrage'];

const FONDS = ['atlas', 'voile', 'uni', 'plan', 'plan-ign', 'photo'];

/** Le texte JSON d'un bloc `<script type="application/json" data-atlas="nom">` de l'élément, ou null. */
export function blocInline(racine, nom) {
  if (!racine || typeof racine.querySelectorAll !== 'function') return null;
  const trouves = [...racine.querySelectorAll('script')].filter((s) => s.getAttribute('type') === 'application/json' && s.getAttribute('data-atlas') === nom);
  if (!trouves.length) return null;
  if (trouves.length > 1) throw new ErreurBi('commande', `<atlas-bi> : plusieurs blocs data-atlas="${nom}" (un seul est attendu)`);
  return trouves[0].textContent || '';
}

function analyserJson(texte, source) {
  if (texte.length > LIMITE_OCTETS) throw new ErreurBi('commande', `<atlas-bi> : ${source} dépasse ${LIMITE_OCTETS / 1048576} Mo`);
  try { return JSON.parse(texte); }
  catch (e) { throw new ErreurBi('commande', `<atlas-bi> : ${source} n'est pas un JSON valide (${String(e && e.message || e).slice(0, 120)})`); }
}

/** Lit un fichier JSON déclaré par une adresse. `lecteur(url)` rend `{ ok, status, text() }` (le `fetch` de la page). */
export async function lireAdresse(adresse, nom, { base, lecteur }) {
  let u;
  try { u = new URL(adresse, base); } catch (_) { throw new ErreurBi('commande', `<atlas-bi> : l'adresse de ${nom} est illisible`); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new ErreurBi('commande', `<atlas-bi> : l'adresse de ${nom} doit être http(s) (reçu ${u.protocol})`);
  if (typeof lecteur !== 'function') throw new ErreurBi('commande', '<atlas-bi> : aucun moyen de lire ' + nom);
  let rep;
  try { rep = await lecteur(u.href); }
  catch (e) { throw new ErreurBi('commande', `<atlas-bi> : ${nom} (${u.href}) illisible : ${String(e && e.message || e).slice(0, 120)}`); }
  if (!rep || !rep.ok) throw new ErreurBi('commande', `<atlas-bi> : ${nom} (${u.href}) : réponse ${rep ? rep.status : 'vide'}`);
  return analyserJson(await rep.text(), `${nom} (${u.href})`);
}

/**
 * Ce que l'élément déclare, lu et vérifié (rien n'est appliqué ici).
 * @param {{ getAttribute(n: string): string|null, querySelectorAll?: Function }} element
 * @returns {Promise<{ manifeste?: object, donnees?: object, charte?: object, fond?: string }>}
 */
export async function lireConfiguration(element, { base, lecteur }) {
  const config = {};
  for (const nom of ['manifeste', 'donnees', 'charte']) {
    const adresse = element.getAttribute(nom);
    const inline = blocInline(element, nom);
    if (adresse && inline !== null) throw new ErreurBi('commande', `<atlas-bi> : ${nom} est déclaré deux fois (attribut et bloc data-atlas) ; gardez l'un des deux`);
    if (adresse) config[nom] = await lireAdresse(adresse, nom, { base, lecteur });
    else if (inline !== null) config[nom] = analyserJson(inline, `le bloc data-atlas="${nom}"`);
    // `donnees` peut aussi être un tableau de Features (ou une FeatureCollection) ; le manifeste et la charte sont des objets
    const tableauOk = nom === 'donnees' && Array.isArray(config[nom]);
    if (config[nom] !== undefined && !tableauOk && (config[nom] === null || typeof config[nom] !== 'object' || Array.isArray(config[nom]))) {
      throw new ErreurBi('commande', `<atlas-bi> : ${nom} doit être un objet JSON`);
    }
  }
  const fond = element.getAttribute('fond');
  if (fond) {
    if (!FONDS.includes(fond)) throw new ErreurBi('commande', `<atlas-bi> : fond « ${fond} » inconnu (${FONDS.join(', ')})`);
    config.fond = fond;
  }
  const cadrage = element.getAttribute('cadrage');
  if (cadrage) {
    if (cadrage !== 'auto' && cadrage !== 'aucun') throw new ErreurBi('commande', `<atlas-bi> : cadrage « ${cadrage} » inconnu (auto, aucun)`);
    config.cadrage = cadrage;
  }
  if (config.donnees && !config.manifeste) {
    // une ligne : des données seules -> manifeste inféré
    try { const { inferer } = await import('./inference.js'); const r = inferer(config.donnees); config.manifeste = r.manifeste; config.donnees = r.donnees; config.notes = r.notes; }
    catch (e) { throw new ErreurBi('commande', '<atlas-bi> : ' + String(e && e.message || e)); }
  } else if (config.donnees && (Array.isArray(config.donnees) || config.donnees.type === 'FeatureCollection')) {
    // un manifeste explicite à une seule couche et des données sans nom de couche : on les rattache à cette couche
    const couches = Array.isArray(config.manifeste.layers) ? config.manifeste.layers : [];
    if (couches.length !== 1) throw new ErreurBi('commande', '<atlas-bi> : `donnees` est une liste de Features mais le manifeste a ' + couches.length + ' couches : donnez { idCouche: Features }');
    config.donnees = { [couches[0].id]: Array.isArray(config.donnees) ? config.donnees : config.donnees.features };
  }
  return config;
}

/** Rien à faire quand l'élément ne déclare rien : il reste piloté à la main. */
export function estVide(config) { return !config || DECLARATIFS.every((k) => config[k] === undefined); }

/** Faut-il cadrer la scène après sa pose ? Oui par défaut ; non si l'hôte l'a refusé ou si une couche administrative se cadre elle-même. */
export function cadrerApres(config) {
  if (!config.manifeste || config.cadrage === 'aucun') return false;
  return !(Array.isArray(config.manifeste.layers) && config.manifeste.layers.some((l) => l && l.admin));
}

/**
 * Applique la configuration par les commandes du contrat, dans l'ordre : charte, fond, scène.
 * `appeler(commande, ...args)` est celui de l'élément. Une étape qui échoue est nommée dans l'erreur.
 */
export async function appliquerConfiguration(appeler, config) {
  const resultat = {};
  const etape = async (nom, commande, ...args) => {
    try { resultat[nom] = await appeler(commande, ...args); }
    catch (e) {
      const err = e instanceof ErreurBi ? e : new ErreurBi('commande', String(e && e.message || e));
      err.etape = nom;
      throw err;
    }
  };
  if (config.charte) await etape('charte', 'setTheme', config.charte);
  if (config.fond) await etape('fond', 'setFond', config.fond);
  if (config.manifeste) await etape('scene', 'setScene', config.manifeste, config.donnees || {});
  if (config.notes && config.notes.length) resultat.inference = config.notes;
  if (cadrerApres(config)) await etape('cadrage', 'fitTo');
  return resultat;
}

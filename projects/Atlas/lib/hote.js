/**
 * L'hote — ce qu'Atlas fait quand il n'est pas dans un document.
 *
 * Dans Grist, le document fournit tout : les donnees, les droits, l'identite.
 * Ouvert seul, Atlas doit demander ou se connecter, puis quelle scene ouvrir.
 * Ce module tient l'enchainement et l'etat ; le rendu est ailleurs, pour que la
 * logique reste verifiable sans navigateur.
 *
 * Enchainement : connexion -> choix d'une scene -> Atlas.
 * Rien de plus. L'hote n'affiche aucune carte et ne lit aucune couche : il
 * oriente. C'est ce qui lui permettra d'accueillir d'autres modules — la saisie
 * sur formulaire, par exemple — sans etre rouvert.
 */

export const VERSION = '1.1.0';
export const CLE_STOCKAGE = 'atlas_connexion';
export const CLE_SCENES = 'atlas_scenes';

/** Au-dela, la liste memorisee n'est plus presentee comme l'etat du compte. */
export const PEREMPTION_MS = 7 * 24 * 3600 * 1000;

/** Les ecrans possibles, et rien d'autre. */
export const ECRANS = Object.freeze({
  WIDGET: 'widget',          // dans Grist : l'hote ne s'affiche pas
  CONNEXION: 'connexion',    // instance et cle a renseigner
  SCENES: 'scenes',          // choisir parmi les scenes trouvees
  ATLAS: 'atlas',            // la scene est ouverte
  LOCAL: 'local',            // navigateur : pas de compte, mais Atlas reste utilisable
  MENU: 'menu',              // l'accueil de l'application, ouvert depuis la marque
});

/**
 * Quel ecran montrer au demarrage ?
 *
 * Les capacites decident avant la configuration : inutile de demander une cle
 * dans un environnement qui la refusera. C'est le cas du navigateur, ou
 * l'instance rejette l'en-tete `Authorization` au controle prealable.
 */
export function ecranInitial(caps, config) {
  if (caps.mode === 'grist') return ECRANS.WIDGET;
  // Une page de presentation montre le produit ; elle ne demande pas a s'y
  // connecter. Sans cette regle, l'apercu d'une vitrine s'ouvrait sur « vos
  // scenes sont hors de portee ici » — une demonstration qui commence par
  // annoncer ce qu'elle ne fera pas.
  if (caps.vitrine) return ECRANS.WIDGET;
  // Sans decouverte possible, on n'offre pas une connexion qui echouerait — mais
  // on ne barre pas la route : Atlas hors Grist sait deja travailler en local,
  // fichiers et OSM. L'ecran explique, il ne bloque pas.
  if (!caps.decouverte) return ECRANS.LOCAL;
  if (!estConfigComplete(config)) return ECRANS.CONNEXION;
  return config?.docId ? ECRANS.ATLAS : ECRANS.SCENES;
}

/** Une configuration utilisable : une instance et une cle. Le document vient apres. */
export function estConfigComplete(config) {
  return !!(config && String(config.baseUrl || '').trim() && String(config.jeton || '').trim());
}

/**
 * Normalise ce que l'utilisateur a tape.
 *
 * L'adresse est saisie a la main sur un telephone : on tolere l'absence de
 * protocole, les espaces et la barre finale. Une adresse sans schema serait
 * interpretee comme un chemin relatif et echouerait sans rien expliquer.
 */
export function normaliserConfig(brut = {}) {
  let base = String(brut.baseUrl || '').trim();
  if (base && !/^https?:\/\//i.test(base)) base = 'https://' + base;
  base = base.replace(/\/+$/, '');
  return {
    baseUrl: base,
    jeton: String(brut.jeton || '').trim(),
    docId: String(brut.docId || '').trim(),
  };
}

/** Ce qui manque pour se connecter, dit dans les mots de l'utilisateur. */
export function validerConfig(config) {
  const c = normaliserConfig(config);
  if (!c.baseUrl) return { ok: false, message: "Indiquez l'adresse de votre instance Grist." };
  try { new URL(c.baseUrl); } catch (_) {
    return { ok: false, message: "Cette adresse n'est pas valide." };
  }
  if (!c.jeton) return { ok: false, message: 'Collez votre cle API, depuis votre profil Grist.' };
  return { ok: true, config: c };
}

/* ------------------------------------------------------------------ */
/* Memoire de l'appareil                                              */
/* ------------------------------------------------------------------ */

/**
 * La cle est ecrite une fois puis relue a chaque ouverture — c'est tout
 * l'interet. Elle vaut pour le compte entier : l'oublier doit donc etre aussi
 * simple que la donner (cf. `oublier`).
 */
export function lireConfig(stockage) {
  try {
    const brut = stockage?.getItem(CLE_STOCKAGE);
    return brut ? normaliserConfig(JSON.parse(brut)) : null;
  } catch (_) { return null; }
}

/**
 * Rend `false` si rien n'a pu etre ecrit — y compris quand le stockage est
 * absent. L'appel optionnel `stockage?.setItem()` ne leve pas : sans ce test,
 * la fonction annoncait un succes sans avoir rien enregistre, et l'utilisateur
 * aurait cru sa cle memorisee.
 */
export function ecrireConfig(stockage, config) {
  if (!stockage || typeof stockage.setItem !== 'function') return false;
  try {
    stockage.setItem(CLE_STOCKAGE, JSON.stringify(normaliserConfig(config)));
    return true;
  } catch (_) { return false; }
}

export function oublier(stockage) {
  if (!stockage || typeof stockage.removeItem !== 'function') return false;
  try { stockage.removeItem(CLE_STOCKAGE); return true; } catch (_) { return false; }
}

/* ------------------------------------------------------------------ */
/* Presentation d'une scene                                            */
/* ------------------------------------------------------------------ */

/**
 * Fraicheur relative plutot que date ISO : devant une liste de scenes, c'est
 * « la semaine derniere » qui aide a reconnaitre la sienne, pas un horodatage.
 */
export function depuis(iso, maintenant = Date.now()) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.floor((maintenant - t) / 1000));
  if (s < 90) return 'a l’instant';
  const min = Math.floor(s / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j < 31) return `il y a ${j} j`;
  const mo = Math.floor(j / 30);
  if (mo < 12) return `il y a ${mo} mois`;
  const an = Math.floor(mo / 12);
  return `il y a ${an} an${an > 1 ? 's' : ''}`;
}

/** Une taille lisible : « 840 o », « 12 Ko », « 3,2 Mo ». */
export function libelleOctets(n) {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${Math.round(n)} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/**
 * Ce que l'appareil garde d'une scène, en une phrase — ce qu'on veut savoir avant de partir sans réseau : est-elle prête, de
 * quand, de quelle taille, et ce qui n'a pas pu l'être.
 *
 * @param {object|null} e  l'état de préparation (`ClientHorsLigne.etatHorsLigne`)
 */
export function phrasePreparation(e) {
  if (!e) return 'Pas encore : la scène demande le réseau pour s’ouvrir';
  const date = new Date(e.date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const tables = (e.tables || []).filter((t) => !t.meta).length;
  const parts = [`Prête le ${date}`, libelleOctets(e.octets), `${tables} table${tables > 1 ? 's' : ''}`];
  if (e.photos?.n) parts.push(`${e.photos.n} photo${e.photos.n > 1 ? 's' : ''}`);
  if (e.photos?.ignorees) parts.push(`${e.photos.ignorees} photo${e.photos.ignorees > 1 ? 's' : ''} non gardée${e.photos.ignorees > 1 ? 's' : ''}`);
  if (e.echecs?.length) parts.push(`${e.echecs.length} table${e.echecs.length > 1 ? 's' : ''} illisible${e.echecs.length > 1 ? 's' : ''}`);
  return parts.filter(Boolean).join(' · ');
}

/** L'avancement d'une préparation, en une phrase. */
export function phraseProgres(e) {
  if (!e) return '';
  if (e.phase === 'photos') return `Photos ${e.fait} / ${e.total}…`;
  if (e.phase === 'tables') return e.total ? `Tables ${Math.min(e.fait, e.total)} / ${e.total}…` : 'Lecture…';
  return '';
}

/** Ou vit la scene : « Organisation · Espace ». Les deux peuvent manquer. */
export function situer(scene) {
  return [scene?.org, scene?.espace].filter(Boolean).join(' · ');
}

/* ------------------------------------------------------------------ */
/* Changer de scene                                                    */
/* ------------------------------------------------------------------ */

/**
 * Le nom du projet est-il un chemin de retour ?
 *
 * Seulement dans l'application : le widget n'a rien au-dessus de la scene
 * courante, et le navigateur sans compte n'a aucune liste ou revenir.
 */
export function peutChangerDeScene(caps, config) {
  return !!(caps && caps.mode !== 'grist' && caps.decouverte && estConfigComplete(config));
}

/**
 * Quitter la scene courante en gardant l'instance et la cle.
 *
 * On efface le seul `docId` : au rechargement, `ecranInitial` retombe sur la
 * liste sans redemander la connexion. Rendre `false` si rien n'a pu etre ecrit
 * — sinon on rechargerait sur la meme scene, sans que rien ne l'explique.
 */
export function quitterScene(stockage, config) {
  return ecrireConfig(stockage, { ...(config || {}), docId: '' });
}

/**
 * Remplacer l'instance ou la cle, sans rien effacer d'abord.
 *
 * Effacer puis redemander paraissait plus simple. Mais sur un telephone, un
 * doigt qui glisse sur « Instance et cle » suffisait alors a perdre une cle
 * qu'il faut ensuite retrouver dans son profil Grist — et l'ecran de connexion
 * revenait vide, sans meme l'adresse. L'ancienne configuration tient donc
 * jusqu'a ce qu'une nouvelle la remplace.
 *
 * La scene ouverte survit a un changement de cle, pas a un changement
 * d'instance : elle n'existe pas sur l'autre.
 */
export function changerConnexion(stockage, ancienne, nouvelle) {
  const a = normaliserConfig(ancienne || {});
  const n = normaliserConfig(nouvelle || {});
  return ecrireConfig(stockage, { ...n, docId: n.baseUrl === a.baseUrl ? a.docId : '' });
}

/* ------------------------------------------------------------------ */
/* La liste des scenes, retrouvee au retour                            */
/* ------------------------------------------------------------------ */

/**
 * Memoriser les scenes trouvees, pour les revoir des l'ouverture suivante.
 *
 * Sonder tout un compte prend plusieurs secondes : reafficher une page vide a
 * chaque lancement serait une punition pour ceux qui ont beaucoup de documents.
 * La liste est donc conservee, affichee tout de suite, puis rafraichie en fond.
 *
 * On garde le strict necessaire a l'affichage et a l'ouverture — jamais les
 * donnees des scenes, qui n'ont rien a faire ici.
 */
export function memoriserScenes(stockage, scenes, quand = Date.now()) {
  if (!stockage || typeof stockage.setItem !== 'function') return false;
  const propres = (scenes || []).filter((s) => s && s.id).map((s) => ({
    id: s.id, nom: s.nom || '', org: s.org || '', espace: s.espace || '', maj: s.maj || '',
  }));
  try {
    stockage.setItem(CLE_SCENES, JSON.stringify({ quand, scenes: propres }));
    return true;
  } catch (_) { return false; }   // quota plein : l'application marche sans
}

/**
 * Ce qu'on avait trouve la derniere fois, et quand.
 *
 * `quand` n'est pas decoratif : la liste est un souvenir, pas l'etat du compte.
 * Un projet cree depuis n'y figure pas, un projet supprime y figure encore —
 * l'interface doit le dire plutot que de laisser croire au direct.
 */
export function lireScenesMemorisees(stockage, maintenant = Date.now()) {
  try {
    const brut = stockage?.getItem(CLE_SCENES);
    if (!brut) return null;
    const d = JSON.parse(brut);
    const scenes = Array.isArray(d?.scenes) ? d.scenes.filter((s) => s && s.id) : [];
    if (!scenes.length) return null;
    const quand = Number(d.quand) || 0;
    return { scenes, quand, perime: (maintenant - quand) > PEREMPTION_MS };
  } catch (_) { return null; }
}

export function oublierScenes(stockage) {
  if (!stockage || typeof stockage.removeItem !== 'function') return false;
  try { stockage.removeItem(CLE_SCENES); return true; } catch (_) { return false; }
}

/* ------------------------------------------------------------------ */
/* Proposer l'application                                              */
/* ------------------------------------------------------------------ */

/**
 * Ou se telecharge l'application.
 *
 * `releases/latest/download/` suit les publications sans qu'on ait a toucher
 * l'adresse : le lien pose ici vaut pour toutes les versions suivantes.
 */
export const URL_APPLICATION =
  'https://github.com/nic01asfr/Widgets-Grist/releases/latest/download/atlas.apk';

/** Un APK ne s'installe que sur Android — ailleurs, le proposer serait une impasse. */
export function estAndroid(agent) {
  return /android/i.test(String(agent || ''));
}

/**
 * Faut-il proposer l'application, et sous quelle forme ?
 *
 * Elle ne se propose que la ou elle repond a quelque chose : dans un navigateur
 * sans decouverte possible. Dans Grist, ou dans l'application elle-meme, le lien
 * n'aurait aucun sens.
 *
 * Sur le telephone qui lit la page, le telechargement est l'action principale.
 * Sur un ordinateur, l'APK ne s'installe pas : on nomme le lien sans le mettre
 * en avant, puisque la vraie reponse y est d'ouvrir Atlas dans un document.
 */
export function offreApplication(caps, agent) {
  if (!caps || caps.mode === 'grist' || caps.decouverte) {
    return { proposer: false, direct: false, url: URL_APPLICATION };
  }
  return { proposer: true, direct: estAndroid(agent), url: URL_APPLICATION };
}

/**
 * Une image de la carte pour l'hôte (commande `captureImage`, contrat 0.8) : la figure papier d'une carte, dans un état figé et reproductible, sans passer par un export 3D.
 *
 * Module pur : il reçoit le canevas déjà copié et une fabrique de canevas 2D (le navigateur la fournit, les tests la simulent). Ce que la capture contient : ce que dessine le canevas
 * de la carte (fond, couches, étiquettes, modèles 3D du profil complet). Ce qu'elle ne contient PAS : les éléments HTML posés par-dessus (bulle, légende, zone de filtres, marqueurs
 * HTML) ; l'hôte les redessine ou les décrit à côté (`getLegend`, `getCamera`).
 *
 * LIMITE D'ORIGINE : un canevas qui a reçu une image sans autorisation d'origine croisée (CORS) est « souillé », le navigateur refuse alors de le lire. MapLibre charge ses tuiles avec
 * CORS, donc les fonds et les données qui acceptent les requêtes d'origine croisée se capturent ; un fond tiers qui ne les accepte pas s'affiche mal ou ne se capture pas. Le refus porte
 * le code `canvas_illisible`.
 *
 * Les mentions de source des fonds sont DESSINÉES en pied d'image (option `attribution`, vraie par défaut) et rendues à part : une figure imprimée sans sa source est une figure sans licence.
 */
export const VERSION = '1.0.0';

export const FORMATS = Object.freeze({ png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' });
export const LARGEUR_MIN = 64;
export const LARGEUR_MAX = 8192;
export const PIXELS_MAX = 33_000_000;
export const OCTETS_MAX = 12 * 1024 * 1024;
export const APPELS_PAR_SECONDE = 1;
export const DELAI_DEFAUT_MS = 15000;
export const DELAI_MAX_MS = 60000;
export const ATTRIBUTION_MAX = 400;

const fini = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Les options de la commande, vérifiées ; lève une erreur lisible dont le code est le premier mot.
 * @returns {{ format:string, mime:string, qualite:number, largeur:(number|null), attribution:boolean, attendre:boolean, delai:number }}
 */
export function normaliserOptionsCapture(o) {
  const options = o === undefined ? {} : o;
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error("captureImage : un objet d'options est attendu ({ format, qualite, largeur, attribution, attendre, delai })");
  for (const k of Object.keys(options)) if (!['format', 'qualite', 'largeur', 'attribution', 'attendre', 'delai'].includes(k)) throw new Error('captureImage : option inconnue « ' + String(k).slice(0, 30) + ' » (format, qualite, largeur, attribution, attendre, delai)');
  const format = options.format === undefined ? 'png' : options.format;
  if (typeof format !== 'string' || !Object.prototype.hasOwnProperty.call(FORMATS, format)) throw new Error('captureImage : format_invalide : png, jpeg ou webp');
  const qualite = options.qualite === undefined ? 0.92 : options.qualite;
  if (!fini(qualite) || qualite < 0.1 || qualite > 1) throw new Error('captureImage : qualite hors bornes (0,1 à 1)');
  const largeur = options.largeur === undefined ? null : options.largeur;
  if (largeur !== null && (!Number.isInteger(largeur) || largeur < LARGEUR_MIN || largeur > LARGEUR_MAX)) throw new Error('captureImage : largeur hors bornes (' + LARGEUR_MIN + ' à ' + LARGEUR_MAX + ' pixels)');
  for (const k of ['attribution', 'attendre']) if (options[k] !== undefined && typeof options[k] !== 'boolean') throw new Error('captureImage : ' + k + ' doit être true ou false');
  const delai = options.delai === undefined ? DELAI_DEFAUT_MS : options.delai;
  if (!Number.isInteger(delai) || delai < 100 || delai > DELAI_MAX_MS) throw new Error('captureImage : delai hors bornes (100 à ' + DELAI_MAX_MS + ' millisecondes)');
  return { format, mime: FORMATS[format], qualite, largeur, attribution: options.attribution !== false, attendre: options.attendre !== false, delai };
}

/** Une limite d'appels par seconde, sans horloge globale : `creerLimiteur(maintenant)()` rend vrai si l'appel passe. */
export function creerLimiteur(maintenant = () => Date.now(), parSeconde = APPELS_PAR_SECONDE) {
  const instants = [];
  return () => {
    const t = maintenant();
    while (instants.length && t - instants[0] >= 1000) instants.shift();
    if (instants.length >= parSeconde) return false;
    instants.push(t); return true;
  };
}

const ENTITES = Object.freeze({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ', '&copy;': '©' });

/** Le texte brut d'une attribution HTML (balises retirées, entités courantes décodées, espaces resserrés). */
export function texteDAttribution(html) {
  if (typeof html !== 'string') return '';
  return html.slice(0, 2000).replace(/<[^>]*>/g, ' ').replace(/&(?:amp|lt|gt|quot|#39|#x27|nbsp|copy);/g, (e) => ENTITES[e] || e).replace(/\s+/g, ' ').trim();
}

/**
 * Les mentions de source d'un style de carte, sans doublon : celles des sources déclarées (`attribution`), hors source d'altitude (une
 * source de relief n'est pas un fond affiché) et hors sources vides.
 * @param {Record<string, {attribution?:string, type?:string}>} sources  `map.getStyle().sources`
 * @param {string[]} [supplementaires]  mentions ajoutées (par exemple celles de l'hôte)
 */
export function mentionsDeSources(sources, supplementaires = []) {
  const vues = new Set(), sortie = [];
  const ajouter = (t) => { const x = texteDAttribution(t); if (x && !vues.has(x)) { vues.add(x); sortie.push(x); } };
  for (const s of Object.values(sources && typeof sources === 'object' ? sources : {})) if (s && s.type !== 'raster-dem') ajouter(s.attribution);
  for (const t of supplementaires) ajouter(t);
  return sortie;
}

/** Les dimensions de l'image rendue : la largeur demandée sans agrandir la source, le rapport conservé. */
export function dimensionsImage(sw, sh, largeur) {
  if (!Number.isInteger(sw) || !Number.isInteger(sh) || sw < 1 || sh < 1) throw new Error('captureImage : carte_vide : le canevas de la carte est vide (taille nulle)');
  const avertissements = [];
  let w = sw, h = sh;
  if (largeur !== null) {
    if (largeur > sw) avertissements.push('agrandissement-refuse : la carte fait ' + sw + ' pixels de large, une image plus large ne montrerait pas plus de détail ; image rendue à ' + sw + ' pixels');
    else { w = largeur; h = Math.max(1, Math.round((sh * largeur) / sw)); }
  }
  if (w * h > PIXELS_MAX) throw new Error('captureImage : image_trop_grande : ' + w + ' x ' + h + ' pixels (plafond ' + Math.round(PIXELS_MAX / 1e6) + ' millions) ; demander une largeur plus petite');
  return { w, h, avertissements };
}

/**
 * Compose l'image : la source réduite, un fond blanc sous les formats sans transparence, la mention de source en pied.
 * @param {{ width:number, height:number }} source  le canevas de la carte, déjà copié (`drawImage` doit l'accepter)
 * @param {ReturnType<typeof normaliserOptionsCapture>} opt
 * @param {string[]} mentions  les mentions de source (texte brut)
 * @param {(w:number, h:number) => { getContext: (t:string) => object, toDataURL: (mime:string, q:number) => string }} fabrique
 */
export function composerImage(source, opt, mentions, fabrique) {
  const { w, h, avertissements } = dimensionsImage(source.width, source.height, opt.largeur);
  const toile = fabrique(w, h);
  const ctx = toile.getContext('2d');
  if (!ctx) throw new Error("captureImage : canvas_indisponible : impossible de composer l'image (canevas 2D indisponible)");
  if (opt.mime !== 'image/png') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(source, 0, 0, w, h);
  let texte = mentions.join(' | ');
  if (opt.attribution) {
    if (!texte) avertissements.push('attribution-vide : aucune source du fond ne déclare de mention ; à renseigner avant diffusion');
    else {
      if (texte.length > ATTRIBUTION_MAX) { texte = texte.slice(0, ATTRIBUTION_MAX - 1) + '…'; avertissements.push('attribution-tronquee : mentions coupées à ' + ATTRIBUTION_MAX + ' caractères en pied d\'image ; la liste complète est dans `attributions`'); }
      const corps = Math.max(9, Math.min(16, Math.round(w / 90)));
      const haut = Math.round(corps * 1.6);
      ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.fillRect(0, h - haut, w, haut);
      ctx.fillStyle = '#222222'; ctx.font = corps + 'px sans-serif'; ctx.textBaseline = 'middle';
      let ligne = '© ' + texte.replace(/^©\s*/, '');
      if (typeof ctx.measureText === 'function') while (ligne.length > 4 && ctx.measureText(ligne).width > w - 12) ligne = ligne.slice(0, -2).trimEnd() + '…';
      ctx.fillText(ligne, 6, h - haut / 2);
    }
  }
  let url;
  try { url = toile.toDataURL(opt.mime, opt.qualite); } catch (e) {
    throw new Error('captureImage : canvas_illisible : le navigateur refuse de lire la carte (un fond ou une donnée tierce sans autorisation d\'origine croisée) — ' + ((e && e.message) || e), { cause: e });
  }
  if (typeof url !== 'string' || !url.startsWith('data:' + opt.mime)) throw new Error("captureImage : format_indisponible : ce navigateur n'encode pas le format « " + opt.format + ' »');
  const octets = Math.round(((url.length - url.indexOf(',') - 1) * 3) / 4);
  if (octets > OCTETS_MAX) throw new Error('captureImage : image_trop_lourde : ' + Math.round(octets / 1048576) + ' Mo (plafond ' + OCTETS_MAX / 1048576 + ' Mo) ; demander une largeur plus petite ou le format jpeg');
  return { format: opt.format, mime: opt.mime, largeur: w, hauteur: h, octets, image: url, attributions: mentions, avertissements };
}

/**
 * La carte « nue » du composant BI : MapLibre et son fond de plan, rien de l'application.
 *
 * Jusqu'à la 1.20.0, `?bi=1` démarrait l'application COMPLÈTE d'Atlas (interface, 3D, éclairage, import, formulaires : ~4,9 Mo non compressés, 146 requêtes)
 * pour n'en garder que la carte, l'interface étant masquée par une feuille de style. Le runtime du composant (`lib/bi/`) n'a pourtant besoin que de la carte
 * MapLibre : ce module la crée seul, comme l'application le faisait (même style, même fond de repli, mêmes libellés français), et la pose à l'adresse
 * officielle (`window.__atlasCarte`, voir `lib/acces-carte.js`) que `lib/bi/montage.js` attend.
 *
 * Même comportement que l'ancien démarrage : vue par défaut (Vieux-Port de Marseille, à plat, cap −18°), projection plane, plafond du ratio de pixels
 * demandé par l'hôte (`?ratio=`), repli sur un aplat quand le style de base est injoignable, images manquantes du fond rendues vides.
 *
 * Aucune dépendance au DOM de l'application : seuls MapLibre (global ou injecté), `window` et un conteneur sont requis.
 */
import { STYLE_BASE_URL, STYLE_HORS_RESEAU, STYLE_AUCUN_FOND, LOCALE_CARTE } from '../fonds-base.js?v=1.26.0';
// même adresse (avec sa version) que `montage.js` : une seule instance du module, sinon la carte exposée et la carte attendue seraient deux modules distincts
import { exposerCarte, signalerCartePrete, styleDeBaseIllisible } from '../acces-carte.js?v=1.26.0';
import { ratioMaxDemande } from '../ratio-hote.js?v=1.26.0';

/** La vue d'ouverture, celle qu'avait le composant (l'hôte la remplace par `flyTo`, `fitTo` ou une scène). */
export const VUE_PAR_DEFAUT = Object.freeze({ center: [5.3740, 43.2951], zoom: 16, pitch: 0, bearing: -18 });

/**
 * @param {{ maplibregl?: object, container?: string|HTMLElement, fenetre?: Window }} [o]
 * @returns {object} la carte MapLibre, déjà exposée (`window.__atlasCarte`) ; l'événement `atlas:carte-prete` suit quand le style est en place
 */
export function creerCarteNue({ maplibregl = globalThis.maplibregl, container = 'map', fenetre = globalThis.window } = {}) {
  if (!maplibregl || typeof maplibregl.Map !== 'function') throw new Error('MapLibre GL JS n\'est pas chargé : la carte ne peut pas démarrer');
  const recherche = fenetre && fenetre.location ? fenetre.location.search : '';
  const ratio = ratioMaxDemande(recherche);
  const ratioAppareil = (fenetre && fenetre.devicePixelRatio) || 1;
  // L'appareil dit déjà qu'il n'a pas de réseau : inutile d'attendre un style qui ne viendra pas.
  let repli = !!(fenetre && fenetre.navigator && fenetre.navigator.onLine === false), utilisable = false;
  // `?base=aucune` : l'hôte n'affiche que ses données, la carte ne demande aucun fond de plan (ni style, ni tuiles, ni sprites). Seuls les fonds qui
  // ne reposent pas sur le style de base restent possibles (voir `lib/bi/fond.js`).
  const sansBase = new URLSearchParams(String(recherche || '').replace(/^\?/, '')).get('base') === 'aucune';
  const carte = new maplibregl.Map({
    container, locale: LOCALE_CARTE,
    style: sansBase ? STYLE_AUCUN_FOND : (repli ? STYLE_HORS_RESEAU : STYLE_BASE_URL),
    center: [...VUE_PAR_DEFAUT.center], zoom: VUE_PAR_DEFAUT.zoom, pitch: VUE_PAR_DEFAUT.pitch, bearing: VUE_PAR_DEFAUT.bearing,
    antialias: true, maxPitch: 80,
    ...(ratio ? { pixelRatio: Math.min(ratioAppareil, ratio) } : {}),
  });
  if (sansBase) { carte.__atlasSansBase = true; repli = true; }   // pas de style de base à attendre ni à remplacer par un aplat
  try { fenetre.__atlasMap = carte; } catch (_) { /* poignée de mise au point : facultative */ }
  exposerCarte(fenetre, carte);
  // projection plane : les données BI se lisent de dessus (le style Liberty peut en demander une autre)
  carte.on('style.load', () => { try { carte.setProjection({ type: 'mercator' }); } catch (_) { /* version de MapLibre sans projection */ } });
  carte.on('load', () => { utilisable = true; signalerCartePrete(fenetre, carte); });
  // Le style de base illisible (réseau coupé, instance injoignable) : un aplat, et les données s'affichent quand même.
  carte.on('error', (e) => {
    if (repli || utilisable || !styleDeBaseIllisible(e, STYLE_BASE_URL)) return;
    repli = true;
    try { carte.setStyle(STYLE_HORS_RESEAU); } catch (_) { /* la carte reprendra au prochain essai */ }
  });
  // Une icône que le fond de plan réclame sans la fournir devient une image vide : rien à dire pour chacune.
  carte.on('styleimagemissing', (e) => {
    if (e && e.id && !carte.hasImage(e.id)) { try { carte.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) }); } catch (_) { /* style en cours de remplacement */ } }
  });
  return carte;
}

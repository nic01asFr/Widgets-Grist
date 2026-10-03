/**
 * Horloge de la scène — l'instant, le fuseau et le lieu que lisent les
 * comportements (éclairage public aujourd'hui, fenêtres demain).
 *
 * Décision 3 du contrat commun Atlas ↔ pix2hdr (24/09/2026,
 * `docs/etudes-pix2hdr/REPONSE-PIX2HDR-CONTRAT-COMMUN.md` §7) : un bloc
 * `horloge = { instant ISO avec décalage, fuseau IANA, lieu = ancre de scène,
 * date_epinglee }`. `date` et `timeOfDay` restent lus.
 *
 * Deux écarts corrigés par rapport à l'ancien `sunPosition()` :
 *
 * - l'heure était composée dans le fuseau **du navigateur** (`setHours`) : la
 *   même scène ouverte à La Réunion montrait Marseille à 14 h 30 de La
 *   Réunion. Elle l'est maintenant dans le fuseau **de la scène** ;
 * - le lieu des comportements est l'**ancre** de la scène, pas le centre de la
 *   vue : un luminaire ne s'allume pas plus tôt parce qu'on a déplacé la carte.
 *
 * Rien ici ne touche la carte : tout se vérifie en test.
 */
import { instantLocal, heureLocale } from './eclairage-profil.js?v=1.12.0';

export const VERSION = '0.1.0';

/** Fuseau par défaut : les scènes d'Atlas sont françaises de métropole. */
export const FUSEAU_DEFAUT = 'Europe/Paris';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Le fuseau est-il un nom IANA que le moteur sait lire ? */
export function fuseauValide(fuseau) {
  if (typeof fuseau !== 'string' || !fuseau.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: fuseau });
    return true;
  } catch (_) {
    return false;
  }
}

/** Le fuseau de la scène, ou le défaut si celui déclaré est illisible. */
export function fuseauScene(settings) {
  const f = settings?.fuseau;
  return fuseauValide(f) ? f : FUSEAU_DEFAUT;
}

/** Une date 'AAAA-MM-JJ' existante, ou `null`. */
export function dateValide(v) {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return null;
  const [a, m, j] = v.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j ? v : null;
}

/**
 * La date locale de la scène, 'AAAA-MM-JJ'.
 *
 * Une date épinglée l'emporte. Sinon, le jour de `settings.date` **tel que le
 * sélecteur l'a posé** : `setSunDate` crée cet objet à midi du navigateur,
 * donc ses accesseurs locaux rendent le jour choisi, quel que soit le fuseau
 * de la scène.
 */
export function dateLocaleScene(settings) {
  const epinglee = dateValide(settings?.dateEpinglee);
  if (epinglee) return epinglee;
  const d = settings?.date instanceof Date ? settings.date : new Date(settings?.date);
  if (Number.isNaN(d.getTime())) return '2026-06-15';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * L'instant absolu de la scène (millisecondes), composé dans son fuseau.
 * `timeOfDay` est en minutes depuis minuit, heure locale **du site**.
 */
export function instantScene(settings) {
  const min = Number(settings?.timeOfDay);
  const minutes = Number.isFinite(min) ? Math.max(0, Math.min(1439, Math.round(min))) : 720;
  return instantLocal(dateLocaleScene(settings), minutes, fuseauScene(settings));
}

/**
 * Le bloc `horloge` à l'échange (décision 3) : l'instant toujours complet,
 * avec son décalage, pour qu'un lecteur sans fuseau le lise sans erreur.
 */
export function blocHorloge(settings, lieu) {
  const fuseau = fuseauScene(settings);
  const t = instantScene(settings);
  const { date, minutes } = heureLocale(t, fuseau);
  const pad = (n) => String(n).padStart(2, '0');
  // Le décalage de CET instant (heure d'été ou d'hiver), pas celui de minuit.
  const d = Math.round((Date.parse(`${date}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00Z`) - t) / 60000);
  const signe = d < 0 ? '-' : '+';
  const abs = Math.abs(d);
  return {
    instant: `${date}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00${signe}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`,
    fuseau,
    lieu: lieu && Number.isFinite(lieu.lat) && Number.isFinite(lieu.lng) ? [lieu.lng, lieu.lat] : null,
    date_epinglee: !!dateValide(settings?.dateEpinglee),
  };
}

/**
 * Ce qu'une scène déclare de son horloge, prêt à poser dans `STATE.settings`
 * (et `lieu` dans `STATE.location`).
 *
 * Lu : le bloc `horloge` (`instant`, `fuseau`, `lieu` en [lon, lat],
 * `date_epinglee` booléen ou date), puis les clés à plat `fuseau`,
 * `dateEpinglee`, `timeOfDay`. Tout ce qui est illisible est ignoré, jamais
 * une erreur : une scène plus récente qu'Atlas reste ouvrable.
 *
 * @returns {{ fuseau?: string, dateEpinglee?: string, timeOfDay?: number,
 *   lieu?: { lat: number, lng: number } }}
 */
export function horlogeDepuisReglages(ms) {
  const out = {};
  if (!ms || typeof ms !== 'object') return out;
  const h = ms.horloge && typeof ms.horloge === 'object' ? ms.horloge : {};
  const fuseau = fuseauValide(h.fuseau) ? h.fuseau : (fuseauValide(ms.fuseau) ? ms.fuseau : null);
  if (fuseau) out.fuseau = fuseau;
  const f = fuseau || FUSEAU_DEFAUT;

  if (Number.isFinite(ms.timeOfDay)) out.timeOfDay = ms.timeOfDay;
  let dateInstant = null;
  if (typeof h.instant === 'string') {
    const t = Date.parse(h.instant);
    if (Number.isFinite(t)) {
      const { date, minutes } = heureLocale(t, f);
      out.timeOfDay = minutes;
      dateInstant = date;
    }
  }
  const ep = h.date_epinglee;
  if (typeof ep === 'string' && dateValide(ep)) out.dateEpinglee = ep;
  else if (ep === true && dateInstant) out.dateEpinglee = dateInstant;
  else if (dateValide(ms.dateEpinglee)) out.dateEpinglee = ms.dateEpinglee;

  const lieu = Array.isArray(h.lieu) ? h.lieu : null;
  if (lieu && Number.isFinite(lieu[0]) && Number.isFinite(lieu[1])
    && Math.abs(lieu[1]) <= 90 && Math.abs(lieu[0]) <= 180) {
    out.lieu = { lng: lieu[0], lat: lieu[1] };
  }
  return out;
}

/**
 * Un soleil de comportement mémorisé : `coucherLever` coûte quelques centaines
 * d'évaluations NOAA, et l'état de chaque luminaire en demande deux à chaque
 * cran du curseur d'heure. La clé est l'instant de midi et le lieu, arrondi au
 * cent-millième de degré (≈ 1 m, sans effet à la seconde près).
 *
 * @param {(midiMs: number, lat: number, lon: number) => { coucher: number|null, lever: number|null }} soleil
 */
export function soleilMemorise(soleil, taille = 64) {
  const cache = new Map();
  return (midiMs, lat, lon) => {
    const k = `${midiMs}|${Math.round(lat * 1e5)}|${Math.round(lon * 1e5)}`;
    let v = cache.get(k);
    if (!v) {
      v = soleil(midiMs, lat, lon);
      if (cache.size >= taille) cache.delete(cache.keys().next().value);
      cache.set(k, v);
    }
    return v;
  };
}

/**
 * Comportement d'un point lumineux EclExt à un instant de la scène.
 *
 * Géostandard EclExt v1.1 (CNIG) : un point lumineux porte un profil nocturne
 * (allumage, extinction) et des plages de variation (extinction, flux,
 * puissance, température de couleur). Les heures y sont des chaînes relatives
 * à une référence (§3.5) : heure locale (HL), temps universel (TU), milieu de
 * nuit (MN), coucher (CS) et lever (LS) du soleil.
 *
 * Rien ici ne touche la carte ni Grist. Le soleil est **injecté** : Atlas lui
 * passe SunCalc, et une référence NOAA pourra s'y substituer si le contrat
 * commun avec pix2hdr l'exige (docs/PROPOSITION-CONTRAT-COMMUN-OBJETS.md).
 *
 * L'heure locale est celle **du site**, pas du lecteur : une extinction à
 * `01:00HL` tombe à 1 h à Marseille, que la scène soit ouverte à Paris, à La
 * Réunion ou sur un téléphone réglé ailleurs.
 */

export const VERSION = '0.1.0';

const MIN = 60 * 1000;
const JOUR = 24 * 60 * MIN;

/* ------------------------------------------------------------------ *
 * Heures EclExt
 * ------------------------------------------------------------------ */

const REFERENCES = ['HL', 'TU', 'MN', 'CS', 'LS'];

/**
 * Lit une heure au format EclExt.
 *
 * `21:36HL`, `20:36TU` : une heure d'horloge. `-196MN`, `-15CS`, `+15LS` : un
 * décalage en minutes par rapport à une référence solaire. Une chaîne sans
 * référence est en heure locale (référence par défaut du standard).
 *
 * @returns {{ ok: true, reference: string, minutes: number }
 *   | { ok: false, erreur: string }}
 *   `minutes` = minutes depuis minuit pour HL/TU, décalage signé sinon.
 */
export function lireHeureEclext(texte) {
  const s = String(texte ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return { ok: false, erreur: 'heure vide' };
  const m = /^(.*?)(HL|TU|MN|CS|LS)?$/.exec(s);
  const corps = m[1];
  const reference = m[2] || 'HL';
  if (reference === 'HL' || reference === 'TU') {
    const h = /^(\d{1,2}):(\d{2})$/.exec(corps);
    if (!h) return { ok: false, erreur: `« ${texte} » : une heure ${reference} s'écrit hh:mm` };
    const hh = Number(h[1]);
    const mm = Number(h[2]);
    if (hh > 23 || mm > 59) return { ok: false, erreur: `« ${texte} » : heure hors bornes` };
    return { ok: true, reference, minutes: hh * 60 + mm };
  }
  const d = /^([+-]?\d{1,4})$/.exec(corps);
  if (!d) return { ok: false, erreur: `« ${texte} » : un décalage ${reference} s'écrit en minutes signées` };
  return { ok: true, reference, minutes: Number(d[1]) };
}

/* ------------------------------------------------------------------ *
 * Heure locale du site
 * ------------------------------------------------------------------ */

/**
 * Un lecteur `Intl.DateTimeFormat` par fuseau, créé une fois.
 *
 * Le construire coûte cher (les données du fuseau), et l'état d'un luminaire
 * en demande une vingtaine : recréé à chaque appel, il faisait durer
 * `Eclairage.mettreAJourEtats` 59 ms (médiane) pour 95 luminaires — payés à
 * chaque pixel du curseur d'heure (mesuré le 24/09/2026). Le formateur est
 * sans état : le réutiliser rend exactement les mêmes parties.
 */
const FORMATEURS = new Map();
function formateur(fuseau) {
  let f = FORMATEURS.get(fuseau);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: fuseau, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    FORMATEURS.set(fuseau, f);
  }
  return f;
}

function partiesDansFuseau(instantMs, fuseau) {
  const f = formateur(fuseau);
  const p = Object.fromEntries(f.formatToParts(new Date(instantMs)).map((x) => [x.type, x.value]));
  return {
    annee: Number(p.year), mois: Number(p.month), jour: Number(p.day),
    heure: Number(p.hour), minute: Number(p.minute), seconde: Number(p.second),
  };
}

/** Décalage du fuseau à cet instant, en millisecondes (heure locale − UTC). */
export function decalageFuseau(instantMs, fuseau) {
  const p = partiesDansFuseau(instantMs, fuseau);
  const commeUtc = Date.UTC(p.annee, p.mois - 1, p.jour, p.heure, p.minute, p.seconde);
  return commeUtc - Math.floor(instantMs / 1000) * 1000;
}

/**
 * L'instant d'une heure d'horloge dans le fuseau du site.
 *
 * Aux changements d'heure : une heure qui n'existe pas (2 h 30 le dernier
 * dimanche de mars) glisse d'une heure ; une heure qui existe deux fois
 * (2 h 30 fin octobre) prend sa première occurrence, en heure d'été.
 *
 * @param {string} dateLocale 'AAAA-MM-JJ'
 * @param {number} minutes minutes depuis minuit
 * @param {string} fuseau IANA, ex. 'Europe/Paris'
 * @returns {number} instant en millisecondes
 */
export function instantLocal(dateLocale, minutes, fuseau) {
  const [a, mo, j] = String(dateLocale).split('-').map(Number);
  const mur = Date.UTC(a, mo - 1, j) + minutes * MIN;
  // Deux candidats : avec le décalage d'avant et d'après le changement éventuel.
  const d1 = decalageFuseau(mur - 12 * 60 * MIN, fuseau);
  const d2 = decalageFuseau(mur + 12 * 60 * MIN, fuseau);
  const candidats = [...new Set([mur - d1, mur - d2])].sort((x, y) => x - y);
  for (const c of candidats) {
    if (c + decalageFuseau(c, fuseau) === mur) return c;
  }
  // Heure inexistante : on garde le premier candidat, qui tombe après le saut.
  return candidats[candidats.length - 1];
}

/** La date locale 'AAAA-MM-JJ' et les minutes depuis minuit d'un instant, dans le fuseau. */
export function heureLocale(instantMs, fuseau) {
  const p = partiesDansFuseau(instantMs, fuseau);
  const pad = (n) => String(n).padStart(2, '0');
  return { date: `${p.annee}-${pad(p.mois)}-${pad(p.jour)}`, minutes: p.heure * 60 + p.minute };
}

function jourSuivant(dateLocale) {
  const [a, m, j] = dateLocale.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + 1));
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ *
 * La nuit et ses repères
 * ------------------------------------------------------------------ */

/**
 * Les repères d'une nuit, qui commence le soir de `soir` (date locale).
 *
 * `soleil(dateMidiMs, lat, lon)` rend `{ coucher, lever }` en millisecondes
 * pour le jour de cette date (SunCalc.getTimes : `sunset`, `sunrise`, soit
 * coucher et lever apparents, −0,833°, le sens d'EclExt).
 *
 * Milieu de nuit : le standard le nomme sans le définir. Par défaut, le
 * milieu entre le coucher du soir et le lever du lendemain ; `milieuDeNuit`
 * permet d'en substituer une autre définition si le contrat commun en décide.
 */
export function reperesDeNuit(soir, { lat, lon, fuseau, soleil, milieuDeNuit } = {}) {
  const midiSoir = instantLocal(soir, 12 * 60, fuseau);
  const lendemain = jourSuivant(soir);
  const midiLendemain = instantLocal(lendemain, 12 * 60, fuseau);
  const coucher = soleil(midiSoir, lat, lon).coucher;
  const lever = soleil(midiLendemain, lat, lon).lever;
  const mn = typeof milieuDeNuit === 'function'
    ? milieuDeNuit({ coucher, lever, soir, lendemain })
    : coucher + (lever - coucher) / 2;
  return { soir, lendemain, coucher, lever, milieuDeNuit: mn };
}

/**
 * L'instant d'une heure EclExt, dans une nuit donnée.
 *
 * Une heure d'horloge appartient au soir si elle est à midi ou après, au
 * lendemain sinon : `23:30HL` puis `05:30HL` décrivent une seule plage.
 * @returns {number|null} instant, ou `null` si l'heure est illisible
 */
export function resoudreHeure(texte, reperes, fuseau) {
  const h = lireHeureEclext(texte);
  if (!h.ok) return null;
  switch (h.reference) {
    case 'CS': return reperes.coucher + h.minutes * MIN;
    case 'LS': return reperes.lever + h.minutes * MIN;
    case 'MN': return reperes.milieuDeNuit + h.minutes * MIN;
    case 'HL': {
      const jour = h.minutes >= 12 * 60 ? reperes.soir : reperes.lendemain;
      return instantLocal(jour, h.minutes, fuseau);
    }
    case 'TU': {
      const jour = h.minutes >= 12 * 60 ? reperes.soir : reperes.lendemain;
      const [a, m, j] = jour.split('-').map(Number);
      return Date.UTC(a, m - 1, j) + h.minutes * MIN;
    }
    default: return null;
  }
}

/** La nuit à laquelle appartient un instant : celle du soir même après midi, de la veille avant. */
export function nuitDe(instantMs, fuseau) {
  const { date, minutes } = heureLocale(instantMs, fuseau);
  if (minutes >= 12 * 60) return date;
  const [a, m, j] = date.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j - 1)).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ *
 * État d'un point lumineux
 * ------------------------------------------------------------------ */

/** Date EclExt `AAAAMMJJ` (format de base), ou ISO 'AAAA-MM-JJ' → 'AAAA-MM-JJ'. */
function dateEclext(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function valideLe(dateNuit, de, jusque) {
  const d1 = dateEclext(de);
  const d2 = dateEclext(jusque);
  if (d1 && dateNuit < d1) return false;
  if (d2 && dateNuit > d2) return false;
  return true;
}

/**
 * État d'un point lumineux à un instant.
 *
 * @param {object} point attributs EclExt du `PointLumineux` (`statut`,
 *   `temperatureCouleur`, `puissance`, `fluxSource`, `valideDe`, `valideJusque`…)
 * @param {object|null} profil `ProfilNocturne` (`allumageSoir`, `extinctionMatin`)
 * @param {object[]} plages `PlageVariation` du profil
 * @param {number} instantMs
 * @param {{ lat: number, lon: number, fuseau: string, soleil: Function, milieuDeNuit?: Function }} contexte
 * @returns {{
 *   allume: boolean, facteurFlux: number, facteurPuissance: number,
 *   temperatureCouleur: number|null, plages: string[], hypotheses: string[], raison: string
 * }}
 */
export function etatPointLumineux(point, profil, plages, instantMs, contexte) {
  const { fuseau } = contexte;
  const hypotheses = [];
  const tc0 = Number.isFinite(Number(point?.temperatureCouleur)) ? Number(point.temperatureCouleur) : null;
  const eteint = (raison) => ({
    allume: false, facteurFlux: 0, facteurPuissance: 0,
    temperatureCouleur: tc0, plages: [], hypotheses, raison,
  });

  const statut = String(point?.statut || '').trim();
  if (statut && statut !== 'functional') return eteint(`statut ${statut}`);
  const nuit = nuitDe(instantMs, fuseau);
  if (!valideLe(nuit, point?.valideDe, point?.valideJusque)) return eteint('hors de la période de validité du matériel');

  const reperes = reperesDeNuit(nuit, contexte);
  let allumage = profil?.allumageSoir;
  let extinction = profil?.extinctionMatin;
  if (!allumage) { allumage = '+0CS'; hypotheses.push('allumage au coucher du soleil (profil sans heure d’allumage)'); }
  if (!extinction) { extinction = '+0LS'; hypotheses.push('extinction au lever du soleil (profil sans heure d’extinction)'); }
  const tA = resoudreHeure(allumage, reperes, fuseau);
  const tE = resoudreHeure(extinction, reperes, fuseau);
  if (tA == null || tE == null) return eteint('heure du profil illisible');
  if (!(instantMs >= tA && instantMs < tE)) return eteint('hors des heures d’allumage');
  if (!profil && point?.extinctionNuit === true) {
    hypotheses.push('extinction en cœur de nuit déclarée sans profil : ses heures sont inconnues');
  }

  const etat = {
    allume: true, facteurFlux: 1, facteurPuissance: 1,
    temperatureCouleur: tc0, plages: [], hypotheses, raison: 'allumé',
  };
  for (const pl of plages || []) {
    if (!valideLe(nuit, pl?.valideDe, pl?.valideJusque)) continue;
    const t0 = resoudreHeure(pl.heureDebut, reperes, fuseau);
    const t1 = resoudreHeure(pl.heureFin, reperes, fuseau);
    if (t0 == null || t1 == null || !(instantMs >= t0 && instantMs < t1)) continue;
    const g = String(pl.grandeurVariation || '').toUpperCase();
    const pourcent = String(pl.formatVariation || '%').toUpperCase() !== 'VA';
    const v = Number(pl.valeur);
    etat.plages.push(pl.nomPlage || g);
    if (g === 'EX') {
      return { ...eteint(`extinction programmée (${pl.nomPlage || 'EX'})`), plages: etat.plages };
    }
    if (!Number.isFinite(v)) continue;
    if (g === 'F' || g === 'P') {
      const ref = g === 'F' ? Number(point?.fluxSource ?? point?.fluxLuminaire) : Number(point?.puissance);
      let f = null;
      if (pourcent) f = v / 100;
      else if (Number.isFinite(ref) && ref > 0) f = v / ref;
      else hypotheses.push(`variation ${g} en valeur absolue sans valeur de référence : ignorée`);
      if (f != null) {
        f = Math.max(0, Math.min(1, f));
        if (g === 'F') etat.facteurFlux = Math.min(etat.facteurFlux, f);
        else etat.facteurPuissance = Math.min(etat.facteurPuissance, f);
      }
    } else if (g === 'TC') {
      etat.temperatureCouleur = pourcent && tc0 != null ? tc0 * v / 100 : (pourcent ? null : v);
    }
  }
  if (etat.plages.length) etat.raison = `allumé, ${etat.plages.join(', ')}`;
  return etat;
}

export { REFERENCES };

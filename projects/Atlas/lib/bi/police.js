/**
 * La police des étiquettes est-elle joignable ? Une vérification AVANT d'ajouter une couche de texte.
 *
 * Mesuré le 02/11/2026 : quand les fichiers de glyphes d'une couche étiquetée sont inaccessibles (réseau coupé, politique de sécurité de contenu, serveur arrêté, police inconnue
 * du fournisseur), MapLibre ne dessine plus la couche du tout : les points disparaissent avec leurs étiquettes, sans erreur. Retirer les étiquettes après coup ne les ramène pas.
 * La parade est donc de ne pas les demander : on essaie d'abord la première plage de glyphes (0-255) de la police ; si elle ne répond pas, la couche est montée SANS texte et
 * l'hôte en est averti (`_avertissements`, événement `error` code `police`).
 *
 * Module sans dépendance : `chercher` (fetch) est injecté, ce qui le rend testable sans réseau.
 */

/** L'adresse d'une plage de glyphes, comme la demande MapLibre : la pile de polices jointe par des virgules, encodée. `gabarit` : `https://…/{fontstack}/{range}.pbf`. */
export function adresseGlyphes(gabarit, police, plage = '0-255') {
  const pile = Array.isArray(police) ? police : [String(police)];
  return String(gabarit).replace('{fontstack}', encodeURIComponent(pile.join(','))).replace('{range}', plage);
}

/** La plage de glyphes (tranche de 256 caractères) d'un caractère, comme MapLibre les demande ; `null` au-delà du plan multilingue de base, qu'il ne sert pas. */
export const plageDe = (caractere) => { const c = caractere.codePointAt(0); if (c > 0xffff) return null; const d = c - (c % 256); return d + '-' + (d + 255); };

/**
 * Les plages de glyphes qu'exigent les valeurs de ces champs (toujours `0-255`). Une plage absente du fournisseur fait échouer la tuile ENTIÈRE : c'est elle qu'on vérifie, pas
 * seulement la première. @param {Iterable<object>} entites  features GeoJSON ; @param {string[]} champs  les propriétés affichées en texte
 * @returns {{ plages: string[], exemples: Map<string, string> }}  `exemples` : jusqu'à trois caractères par plage, pour le message
 */
export function plagesDesTextes(entites, champs) {
  const plages = new Set(['0-255']), exemples = new Map();
  for (const f of entites || []) {
    const props = (f && f.properties) || {};
    for (const champ of champs) {
      const v = props[champ];
      if (v === undefined || v === null) continue;
      for (const ch of String(v)) {
        const p = plageDe(ch);
        if (!p) continue;
        plages.add(p);
        const e = exemples.get(p) || '';
        if (e.length < 3 && !e.includes(ch)) exemples.set(p, e + ch);
      }
    }
  }
  return { plages: [...plages].sort((a, b) => parseInt(a, 10) - parseInt(b, 10)), exemples };
}

/**
 * @param {{ gabarit: string, police: string[], plages?: string[], chercher?: Function, memo?: Map, delai?: number, minuterie?: object }} o
 *   `plages` : les plages à vérifier (défaut : `0-255`) ; `memo` : adresse -> résultat, seuls les succès sont gardés (une panne se revérifie à la scène suivante, le réseau peut être revenu)
 * @returns {Promise<{ ok: boolean, verifie: boolean, raison?: string, plage?: string }>}  `plage` : la première plage en échec
 *   `ok: true, verifie: false` : rien à vérifier (pas d'adresse de glyphes connue, pas de fetch) ou réseau trop lent pour conclure : on ne retire pas les étiquettes dans le doute
 */
export async function verifierPolice({ gabarit, police, plages = ['0-255'], chercher = globalThis.fetch ? globalThis.fetch.bind(globalThis) : null, memo = null, delai = 8000, minuterie = globalThis } = {}) {
  if (typeof gabarit !== 'string' || !gabarit.includes('{fontstack}') || typeof chercher !== 'function') return { ok: true, verifie: false };
  const resultats = await Promise.all(plages.map((plage) => verifierPlage({ adresse: adresseGlyphes(gabarit, police, plage), chercher, memo, delai, minuterie }).then((r) => ({ ...r, plage }))));
  const echec = resultats.find((r) => !r.ok);
  if (echec) return { ok: false, verifie: true, raison: echec.raison, plage: echec.plage };
  return { ok: true, verifie: resultats.some((r) => r.verifie) };
}

async function verifierPlage({ adresse, chercher, memo, delai, minuterie }) {
  if (memo && memo.has(adresse)) return memo.get(adresse);
  const essai = (async () => {
    const controle = typeof AbortController === 'function' ? new AbortController() : null;
    const arret = controle ? minuterie.setTimeout(() => controle.abort(), delai) : null;
    try {
      const signal = controle ? controle.signal : undefined;
      let r = await chercher(adresse, { method: 'HEAD', signal });
      if (r.status === 405 || r.status === 501) r = await chercher(adresse, { method: 'GET', signal });   // un serveur qui ne sait pas répondre à HEAD
      if (r.ok) return { ok: true, verifie: true };
      return { ok: false, verifie: true, raison: 'HTTP ' + r.status };
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: true, verifie: false, raison: 'délai dépassé' };
      return { ok: false, verifie: true, raison: 'adresse inaccessible : réseau coupé, politique de sécurité de contenu ou serveur arrêté' };
    } finally { if (arret !== null) minuterie.clearTimeout(arret); }
  })();
  if (memo) { memo.set(adresse, essai); essai.then((r) => { if (!r.ok) memo.delete(adresse); }); }
  return essai;
}

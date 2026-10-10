/**
 * Lecture temporelle d'un champ (année, date, nombre) : valeurs successives, vitesse, boucle, mode instantané ou cumulé.
 * Module pur : la boucle d'images (requestAnimationFrame) est injectée par l'appelant, qui passe le temps écoulé.
 */
export const VERSION = '1.0.0';

/** Les valeurs successives d'un domaine à pas constant (bornes comprises, la dernière tombe sur `max`). */
export function valeursDuDomaine(min, max, pas) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(pas > 0) || max < min) return [];
  const v = []; for (let x = min; x < max - 1e-9; x += pas) v.push(x); v.push(max); return v;
}

/**
 * Fenêtre de sélection pour une valeur de temps t.
 *  - 'instant' : seulement t           -> [t, t]
 *  - 'cumul'   : tout jusqu'à t        -> [min, t]
 *  - 'glissante' : les `largeur` dernières unités -> [t - largeur, t]
 */
export function fenetre({ mode = 'instant', t, min, largeur = 1 }) {
  if (mode === 'cumul') return { min, max: t };
  if (mode === 'glissante') return { min: t - largeur, max: t };
  return { min: t, max: t };
}

export function creerLecture({ min, max, pas = 1, parSeconde = 1, boucle = true, valeur = min } = {}) {
  const vals = valeursDuDomaine(min, max, pas);
  let i = Math.max(0, vals.findIndex((x) => x >= valeur)), acc = 0, enCours = false;
  return {
    valeurs: () => vals.slice(),
    valeur: () => vals[i],
    enCours: () => enCours,
    demarrer() { enCours = true; },
    arreter() { enCours = false; },
    poser(v) { const k = vals.findIndex((x) => x >= v); i = k < 0 ? vals.length - 1 : k; acc = 0; return vals[i]; },
    /** Avance de `dtMs` ; renvoie la nouvelle valeur si elle a changé, sinon null. S'arrête en fin de domaine sans boucle. */
    avancer(dtMs) {
      if (!enCours || vals.length < 2) return null;
      acc += (dtMs / 1000) * parSeconde; const n = Math.floor(acc); if (n < 1) return null; acc -= n;
      let j = i + n;
      if (j >= vals.length) { if (boucle) j = j % vals.length; else { j = vals.length - 1; enCours = false; } }
      if (j === i) return null; i = j; return vals[i];
    },
  };
}

/**
 * Premier rendu du composant carte BI : rien de métier ni de charte par défaut n'est montré avant l'hôte.
 *
 * Constat (SURFAC²E, 10/10/2026) : entre l'ouverture du cadre et le premier `setScene` / `setTheme` / `setFond` de l'hôte, on voit le fond et le
 * style de base d'Atlas, puis tout change quand la scène arrive. En `?bi=1` la carte reste donc cachée par un VOILE neutre (« Chargement de la
 * carte… »), posé par la page avant le premier affichage (script en ligne de `index_v7.html`, même règle que `voileDemande`), et levé ici :
 *
 *  1. quand l'hôte a posé sa scène (événement `ready` du runtime) ou sa première couche administrative (`layer`), ET que les réglages initiaux
 *     de l'adresse (`?fond=`, `?theme=`) sont appliqués, puis que la carte est au repos ;
 *  2. au plus tard après `DELAI_VOILE_MS` : un hôte qui n'envoie jamais de scène ne reste pas devant un écran vide.
 *
 * `?voile=0` retire le voile (comportement d'avant). `?fond=` et `?theme=` posent le fond et la charte nommée AVANT le premier rendu visible ;
 * l'hôte les rejoue quand même à l'annonce `ready`. Valeurs inconnues : ignorées, jamais interprétées.
 */
import { CHARTES_NOMMEES } from '../charte/defauts.js';

/** Au-delà, le voile se lève seul : une scène qui n'arrive pas ne doit pas laisser l'écran vide. */
export const DELAI_VOILE_MS = 8000;
/** Après la scène, la carte a au plus ce temps pour se poser avant que le voile ne se lève quand même. */
export const DELAI_REPOS_MS = 1500;
/** Les fonds que `setFond` accepte (voir `lib/bi/fond.js`). */
export const FONDS_INITIAUX = Object.freeze(['atlas', 'voile', 'uni', 'plan', 'plan-ign', 'photo']);

const params = (search) => new URLSearchParams(String(search || '').replace(/^\?/, ''));

/** Vrai sauf `?voile=0` (ou `false`, `non`). Même règle que le script en ligne de la page, gardée par un test. */
export function voileDemande(search = '') {
  const v = params(search).get('voile');
  return !(v === '0' || v === 'false' || v === 'non');
}

/**
 * Le fond et la charte nommée demandés par l'adresse, ou null. Listes fermées : une valeur inconnue est écartée (et signalée), jamais passée
 * telle quelle à l'API.
 * @returns {{ fond: string|null, theme: string|null, ignorees: string[] }}
 */
export function parametresInitiaux(search = '') {
  const p = params(search); const ignorees = [];
  const lire = (nom, permis) => { const v = p.get(nom); if (v == null || v === '') return null; if (permis.includes(v)) return v; ignorees.push(nom + '=' + String(v).slice(0, 40)); return null; };
  return { fond: lire('fond', FONDS_INITIAUX), theme: lire('theme', Object.keys(CHARTES_NOMMEES)), ignorees };
}

/**
 * Le voile : levé une seule fois, à la première des deux conditions.
 * @param {{ document: Document, carte: { once?: Function, loaded?: Function, areTilesLoaded?: Function }, delaiMax?: number, delaiRepos?: number,
 *   planifier?: Function, annuler?: Function }} o
 */
export function creerVoile({ document: doc, carte, delaiMax = DELAI_VOILE_MS, delaiRepos = DELAI_REPOS_MS, planifier = setTimeout, annuler = clearTimeout } = {}) {
  let leve = false, raison = null, minuterie = null;
  const corps = () => (doc && doc.body) || null;
  const retirer = (r) => {
    if (leve) return false;
    leve = true; raison = r; if (minuterie != null) annuler(minuterie);
    const b = corps(); if (b) { b.classList.remove('voile-bi'); if (b.removeAttribute) b.removeAttribute('aria-busy'); }
    return true;
  };
  minuterie = planifier(() => retirer('delai'), delaiMax);
  if (minuterie && minuterie.unref) minuterie.unref();
  /** Attend que la carte se pose (ou le délai de repos), puis lève le voile. */
  function leverApresRepos(r) {
    if (leve) return Promise.resolve(raison);
    return new Promise((fini) => {
      let fait = false;
      const terminer = () => { if (fait) return; fait = true; retirer(r); fini(raison); };
      const pose = carte && typeof carte.loaded === 'function' && carte.loaded() && (typeof carte.areTilesLoaded !== 'function' || carte.areTilesLoaded());
      if (pose || !carte || typeof carte.once !== 'function') { terminer(); return; }
      carte.once('idle', terminer);
      const t = planifier(terminer, delaiRepos); if (t && t.unref) t.unref();
    });
  }
  return { lever: leverApresRepos, estLeve: () => leve, raison: () => raison, retirer };
}

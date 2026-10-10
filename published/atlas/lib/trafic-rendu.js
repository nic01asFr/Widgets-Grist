/**
 * Le RENDU du trafic simulé : ce qu'on montre entre deux pas du moteur.
 *
 * Le moteur avance par pas de 0,2 s ; dessiner ses positions telles quelles fait sauter les véhicules cinq fois par seconde. On garde donc la
 * position du pas précédent et celle du pas courant, et on dessine, à chaque image de la carte, une position entre les deux : le mouvement devient
 * continu sans demander plus de calcul au moteur. L'image montrée a un pas de retard, c'est le prix d'un mouvement sans à-coup.
 *
 * Ce module ne connaît ni la carte ni le moteur : des véhicules en mètres locaux, un temps, et il rend des véhicules en mètres locaux, un cap lissé
 * et une opacité (apparition et disparition en fondu). Il se teste sans navigateur.
 */

/** Durée d'un pas du moteur, en ms (celle de `CADENCE_MS` de `lib/trafic-couche.js`). */
export const DUREE_PAS_MS = 200;
/** Un véhicule qui apparaît monte de 0 à 1 en ce temps ; un véhicule qui disparaît redescend en ce temps. */
export const DUREE_ENTREE_MS = 600;
export const DUREE_SORTIE_MS = 400;
/** Au-delà de ce saut entre deux pas (mètres), le véhicule s'est « téléporté » (demi-tour de tronçon, recalage) : pas d'interpolation, on le pose. */
export const SAUT_MAX_M = 12;

/** En dessous de ce zoom, rien n'est dessiné (le trafic continue de se calculer) ; au-dessus, des points ; à partir de `ZOOM_3D`, des modèles 3D si on en a. */
export const ZOOM_MIN = 13;
export const ZOOM_3D = 16;

/** Ce qu'on dessine à un zoom donné : `aucun`, `points` ou `3d` (seulement si `avec3d`). */
export function niveauDeDetail(zoom, { avec3d = false } = {}) {
  if (!Number.isFinite(zoom) || zoom < ZOOM_MIN) return Number.isFinite(zoom) ? 'aucun' : 'points';
  return avec3d && zoom >= ZOOM_3D ? '3d' : 'points';
}

const borne = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Un angle entre `a` et `b` (degrés, 0 = nord, sens horaire) par le plus court chemin, ramené dans [0, 360). */
export function angleInterpole(a, b, t) {
  let d = ((b - a + 540) % 360) - 180;
  if (!Number.isFinite(d)) d = 0;
  return (((a + d * t) % 360) + 360) % 360;
}

/**
 * L'interpolateur : retient, par identifiant de véhicule, sa position au pas précédent et au pas courant.
 * @param {{ duree?: number, entree?: number, sortie?: number, saut?: number }} [o]
 */
export function creerInterpolateur({ duree = DUREE_PAS_MS, entree = DUREE_ENTREE_MS, sortie = DUREE_SORTIE_MS, saut = SAUT_MAX_M } = {}) {
  const etat = new Map();
  return {
    /**
     * Un nouveau pas du moteur, à l'instant `t` (ms).
     * @param {number} t
     * @param {{ id: number|string, x: number, y: number, cap: number, pl?: boolean }[]} vehicules  positions en mètres locaux
     */
    pousser(t, vehicules) {
      const vus = new Set();
      for (const v of vehicules) {
        vus.add(v.id);
        const e = etat.get(v.id);
        if (!e || e.sortiT != null) {
          // nouveau (ou revenu pendant sa sortie) : posé tel quel, il monte en fondu
          etat.set(v.id, { px: v.x, py: v.y, pc: v.cap, cx: v.x, cy: v.y, cc: v.cap, pl: !!v.pl, tPas: t, vuT: e && e.sortiT != null ? t - entree * (e.o ?? 0) : t, sortiT: null });
          continue;
        }
        const d = Math.hypot(v.x - e.cx, v.y - e.cy);
        if (d > saut) { e.px = v.x; e.py = v.y; e.pc = v.cap; } else { e.px = e.cx; e.py = e.cy; e.pc = e.cc; }
        e.cx = v.x; e.cy = v.y; e.cc = v.cap; e.pl = !!v.pl; e.tPas = t;
      }
      for (const [id, e] of etat) if (!vus.has(id) && e.sortiT == null) e.sortiT = t;
    },

    /** Tous les véhicules connus se mettent à disparaître (arrêt du trafic en douceur). */
    tousSortent(t) { for (const e of etat.values()) if (e.sortiT == null) e.sortiT = t; },

    /**
     * Les véhicules à l'instant `t` : position entre le pas précédent et le pas courant, cap lissé, opacité de fondu.
     * Les véhicules dont la sortie est finie sont oubliés.
     * @returns {{ id: number|string, x: number, y: number, cap: number, pl: boolean, o: number }[]}
     */
    echantillonner(t) {
      const out = [];
      for (const [id, e] of etat) {
        let o = borne((t - e.vuT) / entree, 0, 1);
        if (e.sortiT != null) {
          const s = 1 - (t - e.sortiT) / sortie;
          if (s <= 0) { etat.delete(id); continue; }
          o = Math.min(o, s);
          e.o = o;
        }
        const a = borne((t - e.tPas) / duree, 0, 1);
        out.push({ id, x: e.px + (e.cx - e.px) * a, y: e.py + (e.cy - e.py) * a, cap: angleInterpole(e.pc, e.cc, a), pl: e.pl, o });
      }
      return out;
    },

    get taille() { return etat.size; },
    vider() { etat.clear(); },
  };
}

/**
 * Ne garde que les véhicules dans la boîte visible (mètres locaux), élargie d'une marge : hors champ, on ne les envoie ni à la carte ni au 3D.
 * @param {{ x: number, y: number }[]} vehicules
 * @param {{ x0: number, y0: number, x1: number, y1: number }|null} boite  null : tout garder
 */
export function visibles(vehicules, boite, marge = 40) {
  if (!boite) return vehicules;
  const { x0, y0, x1, y1 } = boite;
  return vehicules.filter((v) => v.x >= x0 - marge && v.x <= x1 + marge && v.y >= y0 - marge && v.y <= y1 + marge);
}

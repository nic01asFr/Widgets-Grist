/**
 * Compatibilité : un thème du contrat 0.3 du composant BI devient une charte PARTIELLE (brute : `assainir` la valide ensuite).
 *
 * Thème 0.3 : { jetons, categories, sequentielle, divergente, selection, survol, contour, sansDonnee, halo, fondCarte, lavis, plan, texte, police }
 * (plus des métadonnées d'hôte : nom, version, statut, source, avertissements, variantes, ignorées sans bruit).
 *
 * La correspondance est conservatrice : ce que le thème fixait, la charte le fixe aux mêmes endroits ; ce qu'il ne disait pas reste à la charte
 * « atlas » ou se dérive de ses graines. `texte` (la couleur du texte) devient `graines.encre`, `police` devient la famille de police de la
 * liste sûre la plus proche (une pile inconnue est écartée et signalée : aucune pile libre n'est admise).
 */
export const VERSION = '1.0.0';

const METADONNEES = new Set(['version', 'statut', 'source', 'avertissements', 'variantes', 'policeSymboles']);
const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const SECTIONS_CHARTE = ['graines', 'donnees', 'marqueurs', 'exigences', 'base', 'palettes', 'fond'];

/** Vrai si l'entrée a la forme d'une charte (version « atlas-charte/… » ou une section de charte) ; faux pour un thème 0.3. */
export function estCharte(entree) {
  if (!estObjet(entree)) return false;
  if (typeof entree.version === 'string' && entree.version.startsWith('atlas-charte/')) return true;
  if (SECTIONS_CHARTE.some((k) => k in entree)) return true;
  return estObjet(entree.texte);
}

/** Pile CSS d'un ancien thème -> famille de la liste sûre ; undefined si aucune ne convient. */
export function familleDepuisPile(pile) {
  if (typeof pile !== 'string') return undefined;
  const p = pile.toLowerCase();
  if (/mono|consolas|courier/.test(p)) return 'mono';
  if (/verdana|tahoma/.test(p)) return 'lisible';
  if (/system-ui|-apple-system|segoe/.test(p)) return 'systeme';
  if (/sans|arial|helvetica/.test(p)) return 'sans';
  if (/serif|georgia|times/.test(p)) return 'serif';
  return undefined;
}

/**
 * @param {object} theme  thème 0.3 (n'importe quel objet : les types sont vérifiés plus tard par `assainir`)
 * @returns {{charte:object, ignore:{chemin:string, code:string, valeur:string}[]}}
 */
export function depuisThemeAncien(theme) {
  const c = {}, ignore = [];
  const donnees = (k, v) => { (c.donnees = c.donnees || {})[k] = v; };
  const fond = (k, v) => { (c.fond = c.fond || {})[k] = v; };
  for (const k of Object.keys(theme)) {
    const v = theme[k];
    switch (k) {
      case 'nom': c.nom = v; break;
      case 'jetons': c.jetons = v; break;
      case 'categories': donnees('qualitative', v); break;
      case 'sequentielle': donnees('sequentielles', { principale: v }); donnees('sequentielleDefaut', 'principale'); break;
      case 'divergente': donnees('divergente', v); break;
      case 'selection': case 'survol': case 'contour': case 'sansDonnee': case 'halo': donnees(k, v); break;
      case 'lavis': fond('lavis', v); break;
      case 'plan': fond('plan', estObjet(v) ? { ...v } : v); break;
      case 'texte': (c.graines = c.graines || {}).encre = v; break;
      case 'police': { const f = familleDepuisPile(v); if (f) (c.texte = c.texte || {}).famille = f; else ignore.push({ chemin: 'police', code: 'police-non-listee', valeur: String(v).slice(0, 80) }); break; }
      case 'fondCarte': break;      // traité après la boucle : il ne remplace jamais `plan.fond`
      default: if (!METADONNEES.has(k)) ignore.push({ chemin: k, code: 'cle-inconnue', valeur: k.slice(0, 80) });
    }
  }
  if ('fondCarte' in theme) { const plan = c.fond && estObjet(c.fond.plan) ? c.fond.plan : null; if (!plan) fond('plan', { fond: theme.fondCarte }); else if (!('fond' in plan)) plan.fond = theme.fondCarte; }
  return { charte: c, ignore };
}

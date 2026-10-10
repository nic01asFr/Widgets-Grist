/**
 * Registre unique des palettes : identifiant, nom, type, couleurs, usages, avertissements connus, alias. Module pur.
 *
 * Contient les palettes de la charte « atlas » (nouveaux défauts), celles de « contraste-eleve », et les huit palettes historiques sous
 * leurs noms d'origine (ALIAS : `Tableau10`, `Set2`, `Verts`, `Bleus`, `Oranges`, `Viridis`, `YlOrRd`, `RdYlGn`), avec les couleurs d'origine,
 * pour que les couches existantes ne changent pas de couleur.
 *
 * Les palettes personnalisées sont stockées PAR VALEUR, jamais par simple référence : `exporter()` rend leurs couleurs pour le projet ou le
 * manifeste de scène, `importer()` les réenregistre après validation. Elles ne peuvent pas prendre l'identifiant ni l'alias d'une palette
 * existante. Un registre est une instance : rien n'est partagé entre deux registres.
 */
import { CHARTE_ATLAS, CHARTE_CONTRASTE_ELEVE } from './defauts.js';
import { PALETTES_HERITAGE, INFOS_HERITAGE } from './heritage.js';
import { assainirPalette, TYPES_PALETTE, LIMITES } from './schema.js';
import { verifierPalette } from './verification.js';

export const VERSION = '1.0.0';
/** Palette par défaut de chaque usage : les nouveaux défauts d'Atlas (charte « atlas »). */
export const DEFAUTS = Object.freeze({ qualitative: 'atlas-qualitative', sequential: 'atlas-sequentielle', continue: 'atlas-continue', divergent: 'atlas-divergente' });

const figee = (a) => Object.freeze([...a]);
const erreur = (chemin, code, valeur) => ({ chemin, code, valeur: String(valeur).slice(0, LIMITES.valeurAffichee) });

function entreesIntegrees() {
  const A = CHARTE_ATLAS.donnees, E = CHARTE_CONTRASTE_ELEVE.donnees;
  const eleve = (id, nom, type, couleurs, usages) => ({ id, nom, type, couleurs, usages, origine: 'contraste-eleve', alias: [] });
  const liste = [
    { id: DEFAUTS.qualitative, nom: 'Atlas — catégories', type: 'qualitative', couleurs: A.qualitative, usages: ['categories', 'etiquettes'], origine: 'atlas', alias: [] },
    { id: DEFAUTS.sequential, nom: 'Atlas — séquentielle', type: 'sequential', couleurs: A.sequentielles.principale, usages: ['mesure', 'choroplethe'], origine: 'atlas', alias: [] },
    { id: DEFAUTS.continue, nom: 'Viridis', type: 'sequential', couleurs: A.sequentielles.continue, usages: ['mesure continue', 'carte de chaleur'], origine: 'atlas', alias: ['Viridis'] },
    { id: DEFAUTS.divergent, nom: 'Atlas — bleu et orange', type: 'divergent', couleurs: A.divergente, usages: ['ecart a une reference'], origine: 'atlas', alias: [] },
    eleve('contraste-eleve-qualitative', 'Contraste élevé — catégories', 'qualitative', E.qualitative, ['categories']),
    eleve('contraste-eleve-sequentielle', 'Contraste élevé — séquentielle', 'sequential', E.sequentielles.principale, ['mesure']),
    eleve('contraste-eleve-divergente', 'Contraste élevé — divergente', 'divergent', E.divergente, ['ecart a une reference']),
  ];
  for (const [nom, couleurs] of Object.entries(PALETTES_HERITAGE)) {
    if (nom === 'Viridis') continue;                       // identique à `atlas-continue` : le nom historique en est l'alias
    liste.push({ id: 'heritage-' + nom.toLowerCase(), nom: INFOS_HERITAGE[nom].name, type: INFOS_HERITAGE[nom].type, couleurs, usages: ['palette historique'], origine: 'heritage', alias: [nom] });
  }
  return liste;
}

/**
 * Crée un registre.
 * @param {{fond?:string, encre?:string, exigences?:object}} [ctx]  fond et encre contre lesquels les avertissements connus sont mesurés
 */
export function creerRegistre({ fond = CHARTE_ATLAS.graines.fond, encre = CHARTE_ATLAS.graines.encre, exigences = CHARTE_ATLAS.exigences } = {}) {
  const parId = new Map(), parAlias = new Map();
  const mesurer = (p) => verifierPalette(p, { fond, encre, exigences, chemin: p.id }).avertissements;
  const inscrire = (p) => {
    const entree = Object.freeze({ id: p.id, nom: p.nom, type: p.type, couleurs: figee(p.couleurs), usages: figee(p.usages || []), avertissements: Object.freeze(mesurer(p)), alias: figee(p.alias || []), origine: p.origine });
    parId.set(entree.id, entree); for (const a of entree.alias) parAlias.set(a, entree.id);
    return entree;
  };
  for (const p of entreesIntegrees()) inscrire(p);

  const registre = {
    /** Une palette par identifiant ou par alias (nom historique) ; undefined si inconnue. */
    obtenir(idOuAlias) { if (typeof idOuAlias !== 'string') return undefined; return parId.get(idOuAlias) || parId.get(parAlias.get(idOuAlias)); },
    /** Les couleurs d'une palette (tableau neuf) ; celles de `repli` si la palette est inconnue. */
    couleurs(idOuAlias, repli) { const p = registre.obtenir(idOuAlias) || (repli !== undefined ? registre.obtenir(repli) : undefined); return p ? [...p.couleurs] : undefined; },
    lister({ type, origine } = {}) { return [...parId.values()].filter((p) => (!type || p.type === type) && (!origine || p.origine === origine)); },
    /** Palette par défaut d'un usage (`qualitative`, `sequential`, `continue`, `divergent`). */
    defaut(usage) { return registre.obtenir(DEFAUTS[usage]); },
    /**
     * Enregistre une palette personnalisée après validation. Renvoie { ok, palette?, erreurs[] }. Refuse un identifiant ou un alias déjà pris.
     * Enregistrer deux fois la MÊME palette (mêmes couleurs) est sans effet : c'est le cas d'un projet rechargé.
     */
    enregistrer(brut) {
      const ctx = { ignore: [], ignorer(chemin, code, valeur) { this.ignore.push(erreur(chemin, code, valeur)); return undefined; } };
      const p = assainirPalette(brut, 'palette', ctx);
      if (!p) return { ok: false, erreurs: ctx.ignore };
      const existante = parId.get(p.id);
      if (existante) {
        if (existante.origine === 'personnalisee' && existante.type === p.type && existante.couleurs.length === p.couleurs.length && existante.couleurs.every((c, i) => c === p.couleurs[i])) return { ok: true, palette: existante, erreurs: [], inchangee: true };
        return { ok: false, erreurs: [erreur('palette.id', 'id-pris', p.id)] };
      }
      if (parAlias.has(p.id)) return { ok: false, erreurs: [erreur('palette.id', 'id-pris', p.id)] };
      if (registre.lister({ origine: 'personnalisee' }).length >= LIMITES.palettes) return { ok: false, erreurs: [erreur('palette', 'trop-de-palettes', LIMITES.palettes)] };
      return { ok: true, palette: inscrire({ ...p, origine: 'personnalisee', alias: [] }), erreurs: [] };
    },
    supprimer(id) { const p = parId.get(id); if (!p || p.origine !== 'personnalisee') return false; parId.delete(id); return true; },
    /** Les palettes personnalisées PAR VALEUR, prêtes à être rangées dans un projet ou dans `palettes` d'un manifeste de scène. */
    exporter() { return registre.lister({ origine: 'personnalisee' }).map((p) => ({ id: p.id, nom: p.nom, type: p.type, couleurs: [...p.couleurs], ...(p.usages.length ? { usages: [...p.usages] } : {}) })); },
    /** Réenregistre des palettes reçues par valeur (projet, manifeste) : chacune est validée. Renvoie { importees, refusees[] }. */
    importer(liste) {
      const refusees = []; let importees = 0;
      for (const [i, p] of (Array.isArray(liste) ? liste : []).slice(0, LIMITES.palettes).entries()) { const r = registre.enregistrer(p); if (r.ok) importees++; else refusees.push({ rang: i, erreurs: r.erreurs }); }
      return { importees, refusees };
    },
    /** Une référence de palette dans un style : un nom (registre) OU une palette par valeur `{ couleurs }`, validée et jamais enregistrée par cet appel. */
    resoudre(ref) {
      if (typeof ref === 'string') return registre.obtenir(ref);
      if (!ref || typeof ref !== 'object') return undefined;
      const ctx = { ignore: [], ignorer() { return undefined; } };
      const p = assainirPalette({ id: 'valeur', type: TYPES_PALETTE.includes(ref.type) ? ref.type : 'sequential', couleurs: ref.couleurs, nom: ref.nom }, 'palette', ctx);
      return p ? { ...p, origine: 'valeur' } : undefined;
    },
  };
  return registre;
}

/** Table `nom historique -> couleurs` : identique à `COLOR_PALETTES` d'origine (mêmes noms, mêmes couleurs, même ordre). */
export function tableHeritage(registre = creerRegistre()) { return Object.fromEntries(Object.keys(PALETTES_HERITAGE).map((nom) => [nom, registre.couleurs(nom)])); }
/** Table `nom historique -> { type, name }` : identique à `PALETTE_INFO` d'origine. */
export function infosHeritage() { return Object.fromEntries(Object.entries(INFOS_HERITAGE).map(([nom, i]) => [nom, { type: i.type, name: i.name }])); }

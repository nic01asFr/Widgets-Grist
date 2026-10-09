/**
 * Choroplèthe : découpe en classes, couleurs, légende, tableau équivalent. Module pur.
 *
 * Principes de lisibilité appliqués ici :
 *  - les unités SANS donnée ne sont jamais rangées dans la classe la plus basse : elles forment une entrée de légende à part
 *    (hachurée ou grisée par le rendu) ;
 *  - les classes sont calculées sur les seules valeurs présentes ;
 *  - la légende donne, pour chaque classe, l'intervalle ET l'effectif (nombre d'unités) ; le tableau équivalent redonne tout ;
 *  - les petits effectifs sont comptés à part (la valeur existe mais elle est fragile).
 */
import { rampe, divergente, seuilsQuantiles, seuilsEgaux, classeDe, contraste, echantillonner, formaterNombre } from './echelles.js';

export { formaterNombre };   // défini dans echelles.js (le clavier s'en sert sans charger le choroplèthe)


export const VERSION = '1.0.0';
export const METHODES = Object.freeze(['quantiles', 'egaux', 'manuelle']);
export const PALETTES = Object.freeze(['sequentielle', 'divergente']);

/**
 * Seuils de classes.
 * @param {number[]} valeurs  valeurs présentes (les null / NaN sont ignorés)
 * @param {{methode?:string, classes?:number, bornes?:number[], centre?:number|null}} o
 * @returns {{seuils:number[], methode:string, classesDemandees:number, classesEffectives:number, avertissement?:string}}
 *   seuils : bornes internes croissantes (n classes -> n-1 seuils), hautes inclusives comme Atlas ;
 *   classesEffectives < demandées quand les valeurs distinctes sont trop peu nombreuses (pas de classes vides trompeuses).
 */
export function calculerClasses(valeurs, o = {}) {
  const { methode = 'quantiles', classes = 5, bornes = null } = o;
  const v = (valeurs || []).filter((x) => typeof x === 'number' && Number.isFinite(x));
  let seuils = [], avertissement;
  if (methode === 'manuelle') {
    seuils = [...new Set((bornes || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
    if (!seuils.length) avertissement = 'bornes manuelles absentes';
  } else if (!METHODES.includes(methode)) throw new Error('méthode inconnue : ' + methode);
  else if (methode === 'egaux') seuils = seuilsEgaux(v, classes);
  else seuils = seuilsQuantiles(v, classes);
  if (methode !== 'manuelle' && v.length && seuils.length + 1 < classes) avertissement = 'valeurs distinctes insuffisantes : ' + (seuils.length + 1) + ' classe(s) au lieu de ' + classes;
  return { seuils, methode, classesDemandees: classes, classesEffectives: seuils.length + 1, ...(avertissement ? { avertissement } : {}) };
}

/**
 * Couleurs des classes à partir du thème.
 * séquentielle : n couleurs régulièrement prises sur theme.sequentielle ;
 * divergente : la couleur dépend de la position du milieu de la classe par rapport au centre (valeur neutre).
 */
export function couleursClasses(palette, seuils, valeurs, theme = {}, centre = 0) {
  const n = seuils.length + 1;
  if (palette === 'divergente') {
    const [bas, neutre, haut] = theme.divergente && theme.divergente.length === 3 ? theme.divergente : ['#b2182b', '#f7f7f7', '#2166ac'];
    const f = divergente(bas, neutre, haut); const v = (valeurs || []).filter(Number.isFinite);
    const min = v.length ? Math.min(...v) : centre - 1, max = v.length ? Math.max(...v) : centre + 1;
    const ampl = Math.max(Math.abs(max - centre), Math.abs(min - centre)) || 1;
    return Array.from({ length: n }, (_, i) => {
      const lo = i === 0 ? min : seuils[i - 1], hi = i === n - 1 ? max : seuils[i]; const milieu = (lo + hi) / 2;
      return f(Math.max(-1, Math.min(1, (milieu - centre) / ampl)));
    });
  }
  const seq = theme.sequentielle && theme.sequentielle.length ? theme.sequentielle : ['#f7fbff', '#9ecae1', '#3182bd', '#08306b'];
  return echantillonner(seq, n);
}

/** Libellé d'une classe : « ≤ 12 », « 12 – 45 », « > 45 » (bornes hautes inclusives). */
export function libelleClasse(i, seuils, fmt = formaterNombre) {
  const n = seuils.length + 1; if (n === 1) return 'Toutes les valeurs';
  if (i === 0) return '≤ ' + fmt(seuils[0]);
  if (i === n - 1) return '> ' + fmt(seuils[n - 2]);
  return fmt(seuils[i - 1]) + ' – ' + fmt(seuils[i]);
}

/**
 * Modèle complet d'un choroplèthe : valeur, classe et couleur de chaque unité, légende, effectifs.
 * @param {Map<string, number|null>} valeurs  valeur par code (null = sans donnée)
 * @param {{methode?:string, classes?:number, bornes?:number[], palette?:string, centre?:number|null, theme?:object,
 *          couleurSansDonnee?:string, petits?:Set<string>, unite?:string, titre?:string, fmt?:Function}} o
 */
export function modeleChoroplethe(valeurs, o = {}) {
  const { palette = 'sequentielle', theme = {}, petits = new Set(), unite = '', titre = '', fmt = formaterNombre, couleurSansDonnee = '#9a9a9a' } = o;
  const presentes = []; let sans = 0;
  for (const v of valeurs.values()) { if (v === null || v === undefined || !Number.isFinite(v)) sans++; else presentes.push(v); }
  const centre = palette === 'divergente' ? (o.centre ?? 0) : null;
  const cl = calculerClasses(presentes, o);
  const couleurs = couleursClasses(palette, cl.seuils, presentes, theme, centre ?? 0);
  const classes = couleurs.map((couleur, i) => ({ cle: String(i), libelle: libelleClasse(i, cl.seuils, fmt), couleur, compte: 0, petits: 0, borne: [i === 0 ? null : cl.seuils[i - 1], i === couleurs.length - 1 ? null : cl.seuils[i]] }));
  const parUnite = new Map();
  for (const [code, v] of valeurs) {
    if (v === null || v === undefined || !Number.isFinite(v)) { parUnite.set(code, { classe: -1, couleur: null, valeur: null, petit: false }); continue; }
    const k = classeDe(v, cl.seuils); classes[k].compte++; const petit = petits.has(code); if (petit) classes[k].petits++;
    parUnite.set(code, { classe: k, couleur: couleurs[k], valeur: v, petit });
  }
  const total = valeurs.size;
  const sansDonnee = { cle: '__sans__', libelle: 'Sans donnée', couleur: couleurSansDonnee, compte: sans, hachure: true };
  const min = presentes.length ? Math.min(...presentes) : null, max = presentes.length ? Math.max(...presentes) : null;
  // un rampe de repère pour la vérification de contraste : on contrôle la distance des classes au fond
  const contrasteFond = theme.fond ? classes.map((c) => ({ cle: c.cle, rapport: contraste(c.couleur, theme.fond) })) : null;
  return {
    type: 'choroplethe', titre, unite, methode: cl.methode, palette, centre, seuils: cl.seuils, min, max, total,
    renseignees: presentes.length, sansValeur: sans, petitsEffectifs: [...petits].filter((c) => { const u = parUnite.get(c); return u && u.classe >= 0; }).length,
    classesDemandees: cl.classesDemandees, classesEffectives: cl.classesEffectives, ...(cl.avertissement ? { avertissement: cl.avertissement } : {}),
    classes, sansDonnee, parUnite, contrasteFond,
  };
}

/** Tableau équivalent de la légende (une ligne par classe, plus « sans donnée »). */
export function lignesChoroplethe(modele) {
  const lignes = modele.classes.map((c) => ({ classe: c.libelle, couleur: c.couleur, compte: c.compte, part: modele.total ? Math.round((1000 * c.compte) / modele.total) / 10 : 0, petits: c.petits }));
  lignes.push({ classe: modele.sansDonnee.libelle, couleur: modele.sansDonnee.couleur, compte: modele.sansDonnee.compte, part: modele.total ? Math.round((1000 * modele.sansDonnee.compte) / modele.total) / 10 : 0, petits: 0 });
  return lignes;
}

/** Texte pour lecteur d'écran. */
export function resumeChoroplethe(modele) {
  const l = modele.classes.filter((c) => c.compte > 0).map((c) => c.libelle + ' : ' + c.compte + ' unité(s)').join(' ; ');
  return (modele.titre ? modele.titre + ' – ' : '') + modele.renseignees + ' unité(s) renseignée(s) sur ' + modele.total + (modele.unite ? ' (' + modele.unite + ')' : '') + (l ? ' ; ' + l : '') + (modele.sansValeur ? ' ; ' + modele.sansValeur + ' sans donnée' : '') + (modele.petitsEffectifs ? ' ; ' + modele.petitsEffectifs + ' à petit effectif (valeur fragile)' : '') + '.';
}

/**
 * Lignes de classement (getRows) : une ligne par unité, triable. Les unités sans donnée sont toujours en fin de liste.
 * @param {object[]} unites  Feature (properties.code, properties.nom)
 */
export function lignesClassement(unites, modele, { tri = 'valeur', ordre = 'desc', rapportBase = null } = {}) {
  const lignes = unites.map((f) => {
    const code = f.properties?.code; const u = modele.parUnite.get(code) || { classe: -1, valeur: null, couleur: null, petit: false };
    return { code, nom: f.properties?.nom ?? code, valeur: u.valeur, classe: u.classe, couleur: u.couleur, petit: u.petit, population: f.properties?.population ?? null, ...(rapportBase ? { base: rapportBase(f.properties) } : {}) };
  });
  // rang par valeur décroissante (ex æquo : même rang), indépendant du tri d'affichage
  const dec = lignes.filter((l) => l.valeur !== null).map((l) => l.valeur).sort((a, b) => b - a);
  const rangDe = (v) => dec.indexOf(v) + 1;
  const sens = ordre === 'asc' ? 1 : -1;
  lignes.sort((a, b) => {
    const na = a.valeur === null, nb = b.valeur === null; if (na !== nb) return na ? 1 : -1;
    if (tri === 'nom') return String(a.nom).localeCompare(String(b.nom), 'fr') * (ordre === 'asc' ? 1 : -1);
    if (tri === 'code') return String(a.code).localeCompare(String(b.code)) * (ordre === 'asc' ? 1 : -1);
    if (na) return String(a.nom).localeCompare(String(b.nom), 'fr');
    return (a.valeur - b.valeur) * sens || String(a.nom).localeCompare(String(b.nom), 'fr');
  });
  return lignes.map((l) => ({ rang: l.valeur === null ? null : rangDe(l.valeur), ...l }));
}

/** Vérifie que la rampe se distingue du fond et du « sans donnée » : renvoie les classes dont le contraste au fond est < 1,3. */
export function classesTropClaires(modele, fond, seuil = 1.3) {
  return modele.classes.filter((c) => c.compte > 0 && (contraste(c.couleur, fond) ?? 99) < seuil).map((c) => c.cle);
}
export { rampe };

/**
 * Motif de hachures diagonales (RGBA, prêt pour map.addImage) pour les unités sans donnée : la forme (hachure) distingue
 * « pas de donnée » de « valeur basse », même pour un lecteur qui ne distingue pas les couleurs.
 */
export function motifHachure(couleur = '#6b7075', taille = 8, epaisseur = 2, opacite = 0.9) {
  const h = String(couleur).replace('#', ''); const hex = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.padEnd(6, '0');
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  const data = new Uint8ClampedArray(taille * taille * 4);
  for (let y = 0; y < taille; y++) for (let x = 0; x < taille; x++) { const on = (x + y) % taille < epaisseur; const i = (y * taille + x) * 4; if (on) { data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = Math.round(255 * opacite); } }
  return { width: taille, height: taille, data };
}

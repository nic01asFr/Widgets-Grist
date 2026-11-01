/* Le thème de l'INSTANCE de l'hôte vu comme un ThemeDef 1.0 (contrat unique, 01/11/2026, règles 4 et 7 arbitrées par Form Builder) : module PUR, sans import, sans DOM, sans `process`, copiable tel quel dans un widget.

   `themeInstance({ apparence, vars })` rend `{ themedef | null, mode, notes[], fond, texte, pile, surface, surfaceDouce, refus? }` :
   - `apparence` : `clair` ou `sombre` (ce que l'hôte annonce) ; `vars` : les variables de thème de l'hôte, par nom SANS préfixe (`control-primary-bg`, `page-bg`, `text`, ...),
     valeurs CSS brutes. La fonction ne lit rien elle-même : l'appelant lui donne ce que l'hôte a donné.
   - `themedef` : un ThemeDef 1.0 réduit à ses graines, avec `source: 'instance'` et `police: 'systeme'`. EN CLAIR : `principal`, puis `fond` et `encre` quand l'hôte les donne. EN SOMBRE : `principal`
     SEULEMENT (`fond` et `encre` sont des graines du mode clair, que le compilateur refuserait) ; le thème passe alors les 22 paires dans les deux modes.
   - `fond`, `texte` et `pile` : rendus à part DANS LES DEUX MODES, champs nommés. `fond` : `page-bg` repris, sinon `null` ; `texte` : le texte repris ou redressé, sinon `null` ; en clair ce sont
     aussi les graines `fond` et `encre` (mêmes valeurs : pas de double vérité). Un widget ne les superpose aux variables résolues que si les paires de lisibilité tiennent et que le mode montré est celui de l'hôte.
   - `notes` : ce qui a été écarté ou redressé, `{ cle, code }` (`valeur-ecartee`, `texte-redresse`, `action-redressee`), rien quand tout va bien.
   - `pile` : la pile de polices reprise (texte sûr) ou `null` ; `surface` : la surface mesurée pour l'action (règle 5), `null` sans thème ; `refus` : `apparence-inconnue` (apparence absente ou inconnue alors que l'hôte a donné des variables) ou
     `action-impossible` (aucune couleur d'action ne peut tenir le contraste, même redressée). Une entrée vide donne `themedef: null`, sans note ni refus.

   Règles (voir `docs/DECISIONS.md`, « Contrat instance Grist ») :
   1. seule une couleur `#rgb` ou `#rrggbb` est reprise (développée et écrite en minuscules) ; tout autre forme est écartée et dite, la graine correspondante est alors dérivée ;
   3. fond : `page-bg` s'il est une couleur reprise, sinon la graine `fond` est omise et le fond MESURÉ est celui du mode (`FONDS_DERIVES`) ;
   4. texte (champ `texte`, graine `encre` en clair) : `text` s'il est repris ET à 4,5:1 sur le fond ET sur la surface douce, sinon redressé vers le noir (fond clair) ou le blanc (fond sombre) sur les deux
      (si même le pôle ne tient pas, le texte est écarté et dit) ;
   5. action (graine `principal`) : la première couleur de `CANDIDATS_ACTION` (ordre figé) qui tient 4,5:1 sur le fond ET sur la surface ; sinon la première candidate reprise est
      REDRESSÉE (mélange vers le noir ou le blanc, par pas de 1 %, jusqu'à tenir) ; refus seulement si le redressement est impossible ;
   6. police : `font-family` n'est reprise que si elle ne contient que des noms de polices ; `pile` est cette valeur nettoyée ;
   La SURFACE DOUCE (`surfaceDouce`) est la variable `surface-douce` rendue par la dérivation du kit : la teinte « pâle » de la graine `principal` retenue (clair : clarté de la principale + 0,04 bornée à 0,95 - 0,975,
   chroma 0,22 fois celle de la principale plafonnée à 0,05 ; sombre : clarté 0,27, chroma 0,3 fois celle de la principale plafonnée à 0,045), calculée en OKLCH ici même (module sans import) et comparée au
   compilateur par `tests/instance-lecteur.test.mjs`.
   La SURFACE est la variable `surface` que la dérivation du kit rend pour le mode et la graine `fond`, indépendante de l'action : en clair le fond lui-même (celui de l'hôte, sinon
   `FONDS_DERIVES.clair`), en sombre la surface sombre du noyau (`SURFACE_SOMBRE`, qui ne dépend pas de la graine `fond`). Chaque vecteur la porte, et `tests/instance-lecteur.test.mjs`
   la compare à la variable rendue par `compilerThemeDef` : une dérivation du kit qui changerait fait échouer ce test. */

export const VERSION_THEMEDEF_INSTANCE = 'themedef-1.0';
/** La couleur d'action, de la plus voulue à la moins voulue : la première qui se lit est prise. */
export const CANDIDATS_ACTION = Object.freeze(['control-primary-bg', 'primary-muted', 'primary-dim', 'accent-text', 'control-fg', 'link', 'primary']);
/** Toutes les variables que la fonction lit (toute autre clé est ignorée). */
export const CLES_INSTANCE = Object.freeze([...CANDIDATS_ACTION, 'page-bg', 'text', 'font-family']);
export const SEUIL_INSTANCE = 4.5;
/** Une couleur `#rrggbb` depuis ses trois canaux : les constantes du contrat sont écrites en canaux (le code du kit n'écrit aucune couleur en dur ; les vecteurs portent les valeurs). */
const hexDe = (canaux) => `#${canaux.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
const NOIR = hexDe([0, 0, 0]);
const BLANC = hexDe([255, 255, 255]);
/** La surface du mode sombre : celle du noyau du kit (variable `surface` rendue pour le sombre, quelle que soit la graine `fond`). */
export const SURFACE_SOMBRE = hexDe([30, 30, 30]);
/** Le fond mesuré quand l'hôte n'en donne pas de reprenable : celui du mode. */
export const FONDS_DERIVES = Object.freeze({ clair: BLANC, sombre: hexDe([22, 22, 22]) });
export const LONGUEUR_PILE = 300;

const objet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX6 = /^#[0-9a-f]{6}$/i;

/** la forme courte devient la forme longue ; une couleur sûre est rendue en `#rrggbb` minuscule, `null` pour tout le reste (nom, une fonction de couleur, `var()`, dégradé, image, transparence). */
export function hexSur(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (HEX6.test(t)) return t.toLowerCase();
  const m = HEX3.exec(t);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toLowerCase() : null;
}

/** La pile de polices si elle ne contient que des noms de polices (lettres, chiffres, espaces, virgules, guillemets, point, tiret) ; les espaces et sauts de ligne sont réduits à un espace. */
export function pileSure(v) {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length <= LONGUEUR_PILE && /^[A-Za-z0-9 ,"'.-]+$/.test(t) ? t : null;
}

const canaux = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const luminance = (h) => {
  const [r, g, b] = canaux(h).map((v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Contraste WCAG 2.x de deux `#rrggbb`. */
export function contrasteInstance(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Le pôle de contraste d'un fond : le noir sur un fond clair, le blanc sur un fond sombre. */
const pole = (fond) => (contrasteInstance(NOIR, fond) >= contrasteInstance(BLANC, fond) ? NOIR : BLANC);
/** La couleur mélangée au pôle, de `pct` pour cent (canaux entiers, arrondis). */
function melange(couleur, vers, pct) {
  const a = canaux(couleur), b = canaux(vers);
  return `#${a.map((c, i) => Math.round(c + (b[i] - c) * pct / 100).toString(16).padStart(2, '0')).join('')}`;
}
/** La couleur redressée vers le pôle du premier fond, par pas de 1 %, jusqu'à tenir 4,5:1 sur tous les fonds ; `null` si même le pôle ne tient pas. */
function redresser(couleur, fonds) {
  const vers = pole(fonds[0]);
  for (let pct = 1; pct <= 100; pct++) {
    const c = melange(couleur, vers, pct);
    if (fonds.every((f) => contrasteInstance(c, f) >= SEUIL_INSTANCE)) return c;
  }
  return null;
}

/* OKLab / OKLCH, copie réduite du calcul du kit (`couleur.mjs`) : seule la surface douce en a besoin */
const lineaire = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gamma = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
function versOklch(h) {
  const [r, g, b] = canaux(h).map((v) => lineaire(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, C: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
}
/** OKLCH vers `#rrggbb` : la chroma baisse (pas de 0,002) jusqu'à rester dans le gamut sRGB. */
function depuisOklch(L, C, h) {
  const t = (h * Math.PI) / 180;
  const rgb = (c) => {
    const a = c * Math.cos(t), b = c * Math.sin(t);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  };
  let v = rgb(0);
  for (let c = C; c >= 0; c -= 0.002) { const w = rgb(c); if (w.every((x) => x >= -0.0005 && x <= 1.0005)) { v = w; break; } }
  return `#${v.map((x) => Math.round(Math.min(1, Math.max(0, gamma(x))) * 255).toString(16).padStart(2, '0')).join('')}`;
}
/** Paramètres de la surface douce (ceux de la dérivation du kit ; le test du lecteur détecte toute dérive). */
const DOUCE = Object.freeze({ decalage: 0.04, clarteMin: 0.95, clarteMax: 0.975, chroma: 0.22, chromaMax: 0.05, recul: 0.02, sombreClarte: 0.27, sombreChroma: 0.3, sombreChromaMax: 0.045 });
/** La surface douce du mode pour une graine `principal` (`#rrggbb` minuscule). */
function surfaceDouce(principal, mode) {
  const c = versOklch(principal);
  if (mode === 'sombre') return depuisOklch(DOUCE.sombreClarte, Math.min(DOUCE.sombreChromaMax, c.C * DOUCE.sombreChroma), c.h);
  let L = Math.min(DOUCE.clarteMax, Math.max(DOUCE.clarteMin, c.L + DOUCE.decalage));
  const C = Math.min(DOUCE.chromaMax, c.C * DOUCE.chroma);
  let pale = depuisOklch(L, C, c.h);
  for (let i = 0; pale === principal && i < 20; i++) { L -= DOUCE.recul; pale = depuisOklch(L, C, c.h); }
  return pale;
}

/**
 * @param {{apparence?: string, vars?: Object<string, string>}|null|undefined} entree
 * @returns {{themedef: object|null, mode: string|null, notes: {cle: string, code: string}[], fond: string|null, texte: string|null, pile: string|null, surface: string|null, surfaceDouce: string|null, refus?: string}}
 */
export function themeInstance(entree) {
  const e = objet(entree) ? entree : {};
  const vars = objet(e.vars) ? e.vars : {};
  const rien = (mode = null, extra = {}) => ({ themedef: null, mode, notes: [], fond: null, texte: null, pile: null, surface: null, surfaceDouce: null, ...extra });
  if ((e.apparence === undefined || e.apparence === null) && Object.keys(vars).length === 0) return rien();
  if (e.apparence !== 'clair' && e.apparence !== 'sombre') return rien(null, { refus: 'apparence-inconnue' });
  const mode = e.apparence;
  const notes = [];
  /* une valeur absente (ou vide) ne dit rien ; une valeur présente que la règle 1 n'admet pas est écartée et dite */
  const presente = (cle) => vars[cle] !== undefined && vars[cle] !== null && !(typeof vars[cle] === 'string' && vars[cle].trim() === '');
  const couleur = (cle) => {
    if (!presente(cle)) return null;
    const h = hexSur(vars[cle]);
    if (!h) notes.push({ cle, code: 'valeur-ecartee' });
    return h;
  };

  const fondRepris = couleur('page-bg');
  const fond = fondRepris ?? FONDS_DERIVES[mode];
  const surface = mode === 'sombre' ? SURFACE_SOMBRE : fond;

  let encre = couleur('text');

  const reprises = [];
  let principal = null;
  for (const cle of CANDIDATS_ACTION) {
    const c = couleur(cle);
    if (!c) continue;
    reprises.push([cle, c]);
    if (contrasteInstance(c, fond) >= SEUIL_INSTANCE && contrasteInstance(c, surface) >= SEUIL_INSTANCE) { principal = c; break; }
  }
  if (principal === null && reprises.length) {
    const [cle, c] = reprises[0];
    principal = redresser(c, [fond, surface]);
    if (principal === null) return rien(mode, { notes, refus: 'action-impossible' });
    notes.push({ cle, code: 'action-redressee' });
  }

  let pile = null;
  if (presente('font-family')) {
    pile = pileSure(vars['font-family']);
    if (pile === null) notes.push({ cle: 'font-family', code: 'valeur-ecartee' });
  }
  if (principal === null) return rien(mode, { notes });

  /* le texte tient 4,5:1 sur le fond ET sur la surface douce (celle de la graine principal retenue), sinon il est redressé sur les deux */
  const douce = surfaceDouce(principal, mode);
  if (encre && !(contrasteInstance(encre, fond) >= SEUIL_INSTANCE && contrasteInstance(encre, douce) >= SEUIL_INSTANCE)) {
    const redresse = redresser(encre, [fond, douce]);
    notes.push({ cle: 'text', code: redresse ? 'texte-redresse' : 'valeur-ecartee' });
    encre = redresse;
  }

  /* en sombre, `fond` et `encre` sont des graines du mode clair : le ThemeDef ne porte que `principal` ; fond, texte et pile sont rendus à part */
  const graines = mode === 'sombre' ? { principal } : { principal, ...(fondRepris ? { fond } : {}), ...(encre ? { encre } : {}) };
  return { themedef: { version: VERSION_THEMEDEF_INSTANCE, graines, police: 'systeme', source: 'instance' }, mode, notes, fond: fondRepris, texte: encre, pile, surface, surfaceDouce: douce };
}

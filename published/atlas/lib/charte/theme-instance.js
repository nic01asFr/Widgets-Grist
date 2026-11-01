/**
 * Le thème de l'INSTANCE Grist, repris par Atlas quand le document n'a pas de thème à lui. Module pur : il reçoit ce que Grist donne à un widget
 * (`grist.onThemeChange` : `{ appearance, name, colors }`, ou les variables CSS `--grist-theme-*` que `grist-plugin-api.js` pose sur la page) et rend un ThemeDef 1.0 réduit
 * à ses graines, que la chaîne ThemeDef d'Atlas (`depuis-themedef.js`, puis `application.js` et ses garde-fous de contraste) sait déjà lire : aucune règle de couleur n'est
 * réécrite ici.
 *
 * Ordre de priorité, du plus fort au plus faible : `Theme_document` (le document) > charte donnée par un hôte > CE thème (l'instance) > le thème d'origine d'Atlas.
 *
 * Clés Grist lues (mesurées sur docs.getgrist.com, GristLight : 497 variables) : l'accent (`control-primary-bg` `#16b378`, puis `primary-muted` `#009058`, `primary-dim`
 * `#007548` : le vert de Grist est trop pâle pour du texte ou un bouton sur son propre fond, 2,5:1, alors que sa variante « muted » tient 4:1 ; on prend la première qui se lit),
 * `page-bg` (fond de page), `text` (texte).
 * Seule une couleur `#rrggbb` (ou `#rgb`, développée) est reprise : un `rgba(...)`, un nom de couleur ou une image (`--grist-theme-bg` en est une) est écarté et dit.
 * La police d'une instance est une pile système : elle devient la police `systeme` de ThemeDef. Un thème sombre ne retourne pas l'interface d'Atlas (claire seulement) :
 * `application.js` le dit (`fond-sombre-non-suivi`, `encre-non-suivie`) et ne garde que ce qui reste lisible.
 */
import { themeInstance, CLES_INSTANCE } from './theme-instance-contrat.js';

export const VERSION = '1.0.0';
export const PREFIXE = '--grist-theme-';
/** Ce qu'on lit, et la graine ThemeDef que cela devient. */
export const CLES = Object.freeze({ principal: 'control-primary-bg', fond: 'page-bg', encre: 'text' });
/** L'accent, du plus voulu au plus sombre : la première couleur qui tient 3:1 sur le fond est prise (seuil d'`application.js`). */
export const CANDIDATS_PRINCIPAL = Object.freeze(['control-primary-bg', 'primary-muted', 'primary-dim', 'accent-text', 'control-fg', 'link', 'primary']);   // les trois derniers : les couleurs de TEXTE de Grist, claires en thème sombre (DINUM : #a2b6ff)
const FOND_DE_REPLI = '#f4efe3';   // le fond de l'application quand le thème n'en donne pas
const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i, HEX6 = /^#[0-9a-f]{6}$/i;

/**
 * La pile de polices de l'instance (`--grist-theme-font-family`), si elle ne contient que des noms de polices : lettres, chiffres, espaces, virgules, guillemets, point, tiret,
 * soulignement, 300 caractères au plus. Rien qui puisse sortir de la déclaration (point-virgule, accolade, `url(`, `;`) : sinon null, et la police système de ThemeDef reste.
 * Les polices d'une instance (Marianne à DINUM) ne sont pas chargées dans l'iframe d'un widget : la pile retombe alors sur ses polices système, comme la page de Grist.
 */
export function pileSure(v) {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t && t.length <= 300 && /^[A-Za-z0-9 ,"'._-]+$/.test(t) ? t : null;
}

/** `#abc` -> `#aabbcc` ; une couleur sûre en `#rrggbb` minuscule, ou null. */
export function hexSur(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (HEX6.test(t)) return t.toLowerCase();
  const m = HEX3.exec(t);
  return m ? ('#' + m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toLowerCase() : null;
}

/** Les couleurs d'un thème Grist : l'objet `colors` de `onThemeChange` (clés sans préfixe), ou une fonction `lireVariable(nom)` pour les variables CSS. */
function lire(source, cle) {
  if (typeof source === 'function') return source(PREFIXE + cle);
  if (source && typeof source === 'object') return source[cle] !== undefined ? source[cle] : source[PREFIXE + cle];
  return undefined;
}

/**
 * La lecture du thème de l'instance est celle du CONTRAT UNIQUE (kit/jetons/themedef, arbitré avec Form Builder et appkit) : `theme-instance-contrat.js`, copie mécanique de la fonction pure du kit,
 * rejouée sur ses vecteurs (`tests/theme-instance-contrat.test.js`). Ce module n'en garde que le branchement d'Atlas : ce que Grist donne (`onThemeChange`, variables CSS) devient l'entrée du
 * contrat, et sa sortie devient les graines de la charte d'Atlas.
 * Politique propre à Atlas (écart connu E7, pas dans le contrat) : Atlas suit le mode de l'hôte et pose lui-même ses surfaces, donc le fond et le texte de l'instance deviennent graines `fond` et
 * `encre` dans les DEUX modes (le contrat ne les met en graines qu'en clair, parce que son compilateur les refuserait en sombre) ; `application.js` garde ses propres garde-fous de lisibilité.
 *
 * @param {{ appearance?: string, name?: string, colors?: object }|null|undefined} theme  ce que rend `grist.onThemeChange`
 * @param {(nom: string) => string} [lireVariable]  lecteur de variables CSS, utilisé pour une couleur absente de `colors`
 * @returns {{ themedef: object|null, sombre: boolean, nom: string|null, pile: string|null, ecartes: {cle: string, code: string}[], refus: string|null }}
 */
export function themeDeLInstance(theme, lireVariable) {
  const rien = (ecartes = [], extra = {}) => ({ themedef: null, sombre: false, nom: null, pile: null, ecartes, refus: null, ...extra });
  if (!theme || typeof theme !== 'object') return rien();
  const vars = {};
  for (const cle of CLES_INSTANCE) {
    let brut = lire(theme.colors, cle);
    if ((brut === undefined || brut === '') && typeof lireVariable === 'function') brut = lireVariable(PREFIXE + cle);
    if (brut !== undefined && brut !== '') vars[cle] = brut;
  }
  const c = themeInstance({ apparence: theme.appearance === 'dark' ? 'sombre' : theme.appearance === 'light' || theme.appearance === undefined ? 'clair' : theme.appearance, vars });
  const sombre = c.mode === 'sombre';
  const ecartes = c.notes.map((n) => ({ cle: n.cle, code: n.code }));
  if (!c.themedef) return rien(ecartes, { sombre, refus: c.refus || null });
  const graines = { ...c.themedef.graines };
  if (c.fond) graines.fond = c.fond;
  if (c.texte) graines.encre = c.texte;
  const nom = typeof theme.name === 'string' && theme.name.trim() ? 'Instance Grist (' + theme.name.trim().slice(0, 30) + ')' : 'Instance Grist';
  return { themedef: { version: 'themedef-1.0', nom, graines, police: 'systeme' }, sombre, nom, pile: c.pile, ecartes, refus: null };
}

/**
 * L'apparence d'ORIGINE d'Atlas : celle de l'instance Grist de la DINUM (« La Suite »), et non plus la palette historique d'Atlas (papier crème, terre cuite).
 * C'est ce qu'Atlas montre quand aucun thème ne vient de l'hôte, du document ou de l'instance : application installée, démo web seule, premier affichage avant
 * la lecture du thème. Ainsi Atlas ressemble aux autres widgets du dépôt et, dans une instance DINUM, ne change plus de couleurs quand le thème de l'instance arrive.
 *
 * Module pur, sans réseau ni DOM. Il ne contient AUCUNE règle de couleur : trois graines ThemeDef, lues par la chaîne d'Atlas (`depuis-themedef.js`, puis
 * `theme-document.js` et ses garde-fous de contraste), exactement comme un thème d'instance ou de document. Les valeurs de `:root` de `index_v7.html` en sont la copie
 * (tests/origine-grist.test.js les compare : une dérive casse le test), pour que la première image soit déjà la bonne, sans attendre un module.
 *
 * Source des graines : relevé réel de l'instance numerique.gouv du 01/11/2026 (projects/grist_forms/docs/THEMEDEF-INSTANCE-GRIST.md, V3 : control-primary-bg #3E5DE7,
 * page-bg #F6F8F9, text #222631), identique à appkit (`themedef-taskflow-dinum.json`). Ce n'est PAS le DSFR : l'étude 19 d'appkit montre que l'instance a sa propre identité.
 * La palette historique reste disponible par `?theme=atlas`.
 */
import { charteDepuisThemeDef } from './depuis-themedef.js';
import { habillageApplication } from './theme-document.js';

export const VERSION = '1.0.0';

/** Le ThemeDef d'origine : trois graines, police système. Le reste (surfaces, filets, textes secondaires, plan de carte, palettes de données) est calculé par Atlas. */
export const THEMEDEF_ORIGINE = Object.freeze({
  version: 'themedef-1.0',
  nom: 'Grist (DINUM)',
  police: 'systeme',
  graines: Object.freeze({ principal: '#3E5DE7', fond: '#F6F8F9', encre: '#222631' }),
});

/**
 * La pile de polices de l'instance. Marianne n'est pas chargée dans l'iframe d'un widget : si l'appareil ne l'a pas, la pile retombe sur ses polices système,
 * comme la page de Grist. Même pile pour le texte et les titres : plus de serif d'origine.
 */
export const PILE_ORIGINE = 'Marianne, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/**
 * La charte d'origine et ses variables CSS, calculées par la chaîne d'Atlas.
 * @returns {{charte: object|null, variables: Record<string,string>}}  `charte` est la forme que prend `_charteDuFond` (fond de carte, palettes de données).
 */
export function origineGrist() {
  const r = charteDepuisThemeDef(THEMEDEF_ORIGINE, { mode: 'clair' });
  if (!r.charte) return { charte: null, variables: {} };
  const { variables } = habillageApplication({ charte: r.charte });
  return { charte: r.charte, variables: { ...variables, '--sans': PILE_ORIGINE, '--serif': PILE_ORIGINE } };
}

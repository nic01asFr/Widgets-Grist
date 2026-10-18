# Thème du formulaire — variables `--kit-*` (contrat `kit-theme/0.1`)

Un formulaire se montre dans des pages qui ne sont pas les siennes : une fiche d'entité, un
écran de gestion, une page autonome, un widget Grist. Ce document dit **comment l'apparence
lui est transmise** : une **liste fermée de 26 variables** `--kit-*`, des valeurs d'une
syntaxe sûre, et un jugement rendu à celui qui les pose.

Le formulaire **ne contient aucune charte** : sans thème, il garde son rendu d'origine ; il n'embarque
ni le nom ni les couleurs d'une organisation. Un FormDef ne porte pas de thème : l'apparence est
celle de l'hôte.

## Sans thème, rien ne change

`shared/dsfr-like.css` n'a plus de couleur ni d'ombre en dur hors de sa zone de définition (les
blocs `:root`). Chacune passe par une variable de thème, **avec la valeur d'avant en repli** :

```css
color: var(--kit-accent, var(--blue-france));   /* accent posé par l'hôte, sinon le bleu d'avant */
background: var(--kit-info-fond, #e8edff);      /* fond posé par l'hôte, sinon le bleu pâle d'avant */
```

Le repli est la variable d'origine (`--blue-france`, `--grey-975`, `--encre`…) quand il y en avait une :
le mode sombre de Grist (`data-grist-theme`) et les surcharges d'un hôte sur ces variables continuent
d'agir. `tests/theme.test.js` lit la feuille : aucune couleur hors d'un `var(--kit-…, repli)`, aucune
variable `--kit-*` définie par la feuille elle-même, et les variables utilisées sont exactement celles
que ce document décrit.

## Poser un thème

```js
const m = FormEngine.monter(conteneur, formdef, {
  client,
  theme: {
    accent: 'var(--c-identite-profonde)',
    'action-texte': 'var(--c-action-texte)',
    'bord-champ': '#767676'
  }
});
m.theme;   // { version: 'kit-theme/0.1', applique: {…}, ignore: [{ cle, code, valeur }], avertissements: […] }
```

`theme` est un objet `{ variable: valeur }`. Une clé s'écrit nue (`accent`) ou complète (`--kit-accent`).
Le conteneur reçoit les variables retenues, retirées au démontage. `shared/theme.js` doit être chargé
(`FormTheme`) : sans lui, **aucun thème n'est posé** et le rapport le dit (`module-absent`).

### Ce qui est accepté, ce qui est écarté

Un thème est une **donnée non fiable** : il vient d'un hôte, d'une table du document, d'un fichier. Chaque
valeur finit dans un attribut de style.

| Accepté | Écarté (et dit) |
|---|---|
| `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` | `url(…)`, `calc(…)`, `color-mix(…)`, `expression(…)` |
| `rgb()`, `rgba()`, `hsl()`, `hsla()` à arguments numériques | un nom de couleur (`red`), `transparent`, un mot-clé |
| `var(--nom)` **sans valeur de repli** | `var(--x, …)` : un repli peut cacher une adresse |
| une valeur de 48 caractères au plus | une valeur plus longue, `;`, `}`, `!important`, HTML |

Une clé hors des 26 est `cle-inconnue` ; une valeur refusée est `valeur-invalide` ou `valeur-trop-longue` ;
la même variable nommée deux fois donne `doublon` (la première gagne) ; au-delà de 200 clés, `trop-de-cles`.
Rien n'est jamais corrigé. Le formulaire **ne calcule pas le contraste** : dès qu'une valeur est posée, le
rapport porte l'avertissement `non-verifie` ; les valeurs mesurées viennent du générateur du kit de thèmes.

### Priorité

1. **La personne** : contraste forcé (`forced-colors`) et préférence de contraste renforcé
   (`prefers-contrast: more`) passent avant tout thème (voir « Ce que la personne demande »).
2. Un thème posé par l'**hôte** (`monter({ theme })`, ou des variables posées sur un ancêtre).
3. À défaut, le rendu d'origine.

Un thème qui vient d'une table du document, d'un fichier ou d'une adresse est lu **par l'hôte**, qui le
passe à `monter` : le moteur ne lit ni table ni adresse.

## Les 26 variables

La colonne « Jeton du kit » dit d'où la valeur est tirée quand le thème est généré par le kit de thèmes
(un fichier par paquet et par mode, portes de contraste vérifiées).

| Variable | Rôle | Repli (valeur d'avant) | Jeton du kit |
|---|---|---|---|
| `--kit-fond` | fond de la page, bas de l'écran | `--fond-page` (`--grey-975`) | `--c-fond-page` |
| `--kit-surface` | cartes, champs, bandeau | `--fond-carte` / `--grey-1000` (`#fff`) | `--c-fond-surface` |
| `--kit-surface-2` | aplats discrets : en-têtes, piste, survols gris | `--grey-975` / `--grey-950` | `--c-fond-surface-douce` |
| `--kit-texte` | texte courant et libellés | `--encre` / `--grey-200` (`#161616`) | `--c-texte-corps` |
| `--kit-texte-2` | consignes, aides, légendes | `--encre-douce` / `--grey-625` (`#666`) | `--c-texte-secondaire` |
| `--kit-bord` | **décoration** : cartes, séparateurs, filets. Jamais le bord d'un champ | `--bord` / `--grey-900` / `--grey-925` | `--c-bord-defaut` |
| `--kit-bord-champ` | **bord d'un champ** (contraste d'au moins 3:1 sur la surface) | `--kit-bord`, sinon `--grey-900` | `--c-bord-champ` |
| `--kit-accent` | **identité** : titres, filets, liens, cases cochées, progression | `--blue-france` (`#000091`) | `--c-identite-profonde` |
| `--kit-accent-texte` | texte et anneaux posés sur un fond d'accent (case cochée, rond d'un rang) | `#fff` | `--c-fond-surface` |
| `--kit-accent-fond` | survol pâle d'une ligne ou d'un bouton secondaire | `#f0f0ff`, `#fafaff` | `--c-identite-pale` |
| `--kit-action` | **bouton principal** : fond et bord | `--blue-france` (`#000091`) | `--c-action` |
| `--kit-action-texte` | texte du bouton principal | `#fff` | `--c-action-texte` |
| `--kit-action-survol` | bouton principal au survol | `--blue-france-hover` (`#1212ff`) | `--c-action-survol` |
| `--kit-action-actif` | bouton principal pressé | `--blue-france-active` (`#2323ff`) | dérivé de l'action par le générateur |
| `--kit-focus` | anneau de focus clavier | `--kit-accent`, sinon `--blue-france` | `--c-focus-anneau` |
| `--kit-ok` / `--kit-ok-fond` | état réussi : texte et filet / aplat | `--success` (`#18753c`) / `#e3fadb` | `--etat-ok-fort` / `--etat-ok-fond` |
| `--kit-attention` / `--kit-attention-fond` | avertissement : **orange** | `--warning` (`#b34000`) / `#ffe9e0` | `--etat-attention-fort` / `--etat-attention-fond` |
| `--kit-attention-filet` | filet de l'encart d'attention de l'accueil | `#ffca00` | `--etat-attention-fort` |
| `--kit-alerte` / `--kit-alerte-fond` | erreur : **rouge**, champ en défaut | `--error` (`#ce0500`) / `#ffe9e9` | `--etat-alerte-fort` / `--etat-alerte-fond` |
| `--kit-info` / `--kit-info-fond` | information | `--info` (`#0063cb`) / `#e8edff` | `--etat-info-fort` / `--etat-info-fond` |
| `--kit-papier` | fond d'un canevas de signature ou de croquis | `#fff` | `--c-fond-surface` en mode clair seulement |
| `--kit-ombre` | ombre du point et des repères de carte | `rgba(0, 0, 0, 0.35)` | constante par mode, pas un jeton du kit |

### Action et identité : deux familles

Le bouton principal prend la **famille d'action** ; les titres, filets, liens et cases cochées prennent
l'**accent**. Les mêler (le fond du bouton tiré de l'identité, son survol tiré de l'action) donnait un texte
illisible au survol : **1,48:1** avec le paquet « Grist » en clair, **1,67:1** avec le paquet « neutre » en
sombre (mesuré sur les sorties compilées du kit, 72 contrôles). Avec la famille d'action entière, aucun
échec. Les variables `--kit-accent-survol` et `--kit-accent-actif` du premier contrat n'existent plus : elles
n'avaient jamais été publiées.

### Vocabulaire des états

`alerte` est **le rouge, l'erreur** ; `attention` est **l'orange, l'avertissement**. Un consommateur dont
les mots sont inverses (son « alerte » est orange) écrit sa correspondance noir sur blanc : son *erreur* est
`--kit-alerte`, son *alerte* est `--kit-attention`.

### Le bord d'un champ

`--kit-bord` (décoratif) fait de 1,36 à 1,71:1 sur la surface pour les paquets mesurés : sous le seuil de 3:1
d'un bord de composant. Le bord d'un champ prend donc `--kit-bord-champ`, qui retombe sur `--kit-bord` quand
l'hôte ne le pose pas (le rendu d'origine est conservé).

## Ce que la personne demande

- **Contraste forcé** (`forced-colors: active`) : le navigateur impose ses couleurs ; la feuille ne lutte pas
  contre, et garde ce que la couleur disait (case choisie, étape en cours, onglet actif, erreur) par un contour
  ou un remplissage système.
- **Préférence de contraste renforcé** (`prefers-contrast: more`) : bords de champs, d'options et de boutons
  secondaires à 2 px de la couleur du texte ; anneau de focus plus épais.

*Non vérifié à l'écran* : l'outil d'essai utilisé n'émule pas ces deux préférences ; les règles sont gardées
par un test de feuille, pas par une capture. Un mode de contraste élevé complet (texte à 7:1) serait un mode
de plus du générateur du kit, hors de cette version.

## Ce qui n'est pas thématisé

Tailles de texte, rayons, cibles tactiles, police : ce ne sont pas des couleurs. Les variables `--texte`,
`--cible`, `--ecart`, `--radius`, `--font` restent celles de la feuille ; le kit a ses propres jetons
(`--fs-*`, `--cible-*`, `--rayon-*`, `--ff-texte`), à brancher quand un besoin sera posé. Le repère de point
de la carte de saisie porte la couleur d'erreur aujourd'hui ; une variable `--kit-repere` distincte est prévue
hors de cette version.

## Mode sombre

Les surcharges sombres de la feuille (`--grey-975`, `--blue-france`… sous `data-grist-theme="dark"` et
`prefers-color-scheme`) restent les replis ; un hôte qui pose `--kit-*` les remplace, mode sombre compris, et
doit donc poser des valeurs adaptées au mode actif. Le texte d'erreur, le texte des boutons et le fond des
boutons secondaires sont redéfinis pour le sombre (aucun contraste insuffisant mesuré avec axe-core).

## Tests

- `tests/theme.test.js` — la feuille : aucune couleur hors repli, variables utilisées = variables décrites ici.
- `tests/theme-validation.test.js` — la liste fermée, les valeurs sûres, le jugement, `monter`.
- `tests/contrat-theme.test.js` — règles de contraste forcé et de contraste renforcé présentes ; famille d'action ;
  bord de champ.

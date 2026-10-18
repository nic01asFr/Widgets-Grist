# Thème du formulaire — variables `--kit-*`

`shared/dsfr-like.css` n'a plus de couleur ni d'ombre en dur hors de sa zone de
définition (les blocs `:root`). Chacune passe par une variable de thème, **avec
la valeur d'avant en repli** :

```css
color: var(--kit-accent, var(--blue-france));   /* accent posé par l'hôte, sinon le bleu d'avant */
background: var(--kit-info-fond, #e8edff);      /* fond posé par l'hôte, sinon le bleu pâle d'avant */
```

**Sans thème, rien ne change.** Le repli est la variable d'origine (`--blue-france`,
`--grey-975`, `--encre`…) quand il y en avait une, donc le mode sombre de Grist
(`data-grist-theme`) et les surcharges qu'un hôte poserait sur ces variables
continuent d'agir. Quand il n'y en avait pas, c'est la couleur littérale.
Vérifié ligne à ligne : remplacer chaque `var(--kit-x, repli)` par son repli
redonne exactement la feuille d'avant (852 lignes, 0 différence).

## Poser un thème

```js
FormEngine.monter(conteneur, formdef, {
  client,
  theme: {
    accent: 'var(--c-identite-profonde)',
    'accent-texte': 'var(--c-fond-surface)',
    // ... ou toute valeur CSS : '#7a4b00'
  }
});
```

`theme` est un objet de variables CSS posées sur le conteneur
(`style.setProperty`) et retirées au démontage. Une clé nue (`accent`) est
préfixée en `--kit-accent` ; une clé qui commence par `--` est prise telle quelle.
Une valeur peut être une référence `var(--c-…)` : elle se résout au conteneur,
donc dans la portée du domaine (`[data-domaine="batiment"]`) du kit.

## Les variables

| Variable | Rôle | Repli (valeur d'avant) | Jeton du kit |
|---|---|---|---|
| `--kit-accent` | fond des boutons, progression, cases cochées ; **aussi** couleur des titres, filets et liens | `--blue-france` (`#000091`) | `--c-identite-profonde` |
| `--kit-accent-texte` | texte et anneaux posés sur l'accent | `#fff` | `--c-fond-surface` |
| `--kit-accent-survol` | bouton au survol | `--blue-france-hover` (`#1212ff`) | `--c-action-survol` |
| `--kit-accent-actif` | bouton pressé | `--blue-france-active` (`#2323ff`) | sans équivalent : dérivé de l'accent |
| `--kit-accent-fond` | survol pâle (bouton secondaire, ligne de tableau) | `#f0f0ff`, `#fafaff` | `--c-identite-pale` |
| `--kit-focus` | anneau de focus clavier | `--kit-accent`, sinon `--blue-france` | `--c-focus-anneau` |
| `--kit-fond` | fond de la page, bas de l'écran | `--fond-page` (`--grey-975`) | `--c-fond-page` |
| `--kit-surface` | cartes, champs, bandeau | `--fond-carte` / `--grey-1000` (`#fff`) | `--c-fond-surface` |
| `--kit-surface-2` | aplats discrets : en-têtes, piste, survols gris | `--grey-975` / `--grey-950` | `--c-fond-surface-douce` |
| `--kit-texte` | texte courant et libellés | `--encre` / `--grey-200` (`#161616`) | `--c-texte-corps` |
| `--kit-texte-2` | consignes, aides, légendes | `--encre-douce` / `--grey-625` (`#666`) | `--c-texte-secondaire` |
| `--kit-bord` | bordures et filets | `--bord` / `--grey-900` / `--grey-925` | `--c-bord-defaut` |
| `--kit-ok` / `--kit-ok-fond` | état réussi : texte et filet / aplat | `--success` (`#18753c`) / `#e3fadb` | `--etat-ok-fort` / `--etat-ok-fond` |
| `--kit-attention` / `--kit-attention-fond` | état d'attention | `--warning` (`#b34000`) / `#ffe9e0`, `--encart-attention` | `--etat-attention-fort` / `--etat-attention-fond` |
| `--kit-attention-filet` | filet de l'encart d'attention de l'accueil | `#ffca00` | `--etat-attention-fort` |
| `--kit-alerte` / `--kit-alerte-fond` | erreur, champ en défaut | `--error` (`#ce0500`) / `#ffe9e9` | `--etat-alerte-fort` / `--etat-alerte-fond` |
| `--kit-info` / `--kit-info-fond` | état informatif | `--info` (`#0063cb`) / `#e8edff` | `--etat-info-fort` / `--etat-info-fond` |
| `--kit-papier` | fond d'un canevas de signature ou de croquis | `#fff` | `--c-fond-surface` en mode clair seulement |
| `--kit-ombre` | ombre du point et des repères de carte | `rgba(0, 0, 0, 0.35)` | sans équivalent |

`--kit-fond` colore le `body` et les éléments qui doivent se fondre dans la
page (barre d'action collée en bas, progression collante). Dans le kit, où le
shell porte le fond, il doit valoir la couleur de fond du shell, faute de quoi
ces éléments se détachent en rectangle.

## Points à trancher avec le kit

1. **Un seul accent pour le fond et pour le texte.** Les boutons s'emplissent de
   l'accent *et* les titres s'écrivent dedans. Avec `--c-identite-principale`
   (jaune du domaine Bâtiment, `#F7D05C`), des titres jaunes sur blanc ne se lisent
   pas ; avec `--c-identite-profonde`, textes et traits tiennent le contraste (c'est
   la raison d'être de cette variante, écart S1 du rapport de thème), et le texte
   blanc des boutons aussi. D'où la correspondance ci-dessus. Pour avoir des
   boutons de la couleur principale du domaine, il faudrait scinder `--kit-accent`
   en fond et en texte : pas fait, rien ne le demandait encore.
2. **Un seul anneau de focus.** Le kit pose un anneau double (`--c-focus-anneau`
   plus `--c-focus-halo`) ; le formulaire n'a qu'un contour (`outline`). Le halo
   n'est pas rendu.
3. **Un seul gris de bordure.** `--kit-bord` sert aux cartes comme aux champs ;
   `--c-bord-champ` (contraste plus fort, `#767676`) n'a pas de variable propre.
4. **Mode sombre.** Les surcharges sombres de ce fichier (`--grey-975`,
   `--blue-france`… sous `data-grist-theme="dark"` et `prefers-color-scheme`) restent
   les replis ; un hôte qui pose `--kit-*` les remplace, mode sombre compris, et
   doit donc poser des valeurs adaptées au mode actif.
5. **Les états restent ceux du kit.** Ils ne dépendent pas du domaine : les mapper
   une fois pour toutes, pas par thème.

## Ce qui n'est pas thématisé

Les variables `--texte`, `--cible`, `--ecart`, `--radius`, `--font` (tailles, cibles
tactiles, rayons, police) ne sont pas des couleurs et n'entrent pas dans ce lot.
Le kit a ses propres jetons (`--fs-*`, `--cible-*`, `--rayon-*`, `--ff-texte`) ;
les brancher se fera quand le besoin sera posé.

## Test

`tests/theme.test.js` lit la feuille : aucune couleur hors d'un `var(--kit-…, repli)`
en dehors des définitions de variables ; aucune variable `--kit-*` définie par la
feuille elle-même (une définition écraserait le repli) ; chaque variable utilisée
est documentée ici, et chaque variable documentée est utilisée.

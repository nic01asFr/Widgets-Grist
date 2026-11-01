# Le thème de l'instance Grist devient un ThemeDef : contrat unique (BROUILLON)

Statut : proposition de Form Builder, 01/11/2026, à arbitrer avec Atlas-BI et appkit-architecte (le kit porte le contrat et les vecteurs, voir
[THEMEDEF-ALIGNEMENT.md](THEMEDEF-ALIGNEMENT.md) E1). Décisions de l'auteur déjà prises : le thème de Grist est le repli **par défaut dans Grist** (D-A) et il donne aussi
**fond, texte et police** (D-B). Rien n'est codé ; l'ordre est : contrat, vecteurs, puis chaque lecteur les rejoue.

## 1. Ce que fait le contrat

Une fonction pure, la même dans tous les widgets : `themeInstance(entree) -> { themedef | null, mode, notes[], refus? }`.
La sortie est un ThemeDef 1.0 réduit à ses graines (`principal`, `fond`, `encre`, `police`), plus une `pile` facultative (règle 6), que la dérivation du kit et le lecteur (22 paires) traitent comme
n'importe quel thème : aucune règle de couleur n'est réécrite dans le contrat. Il ne lit rien lui-même (l'appelant lui donne ce que Grist a donné).

## 2. Entrée

```
{
  apparence: 'clair' | 'sombre',          // grist.onThemeChange().appearance, ou data-grist-appearance sur <html>
  vars: { '<nom sans préfixe>': '<valeur CSS>' }   // les --grist-theme-* posés par grist-plugin-api.js, sans le préfixe
}
```

Clés lues (mesurées sur docs.getgrist.com, GristLight : 497 variables) : `control-primary-bg`, `primary-muted`, `primary-dim`, `accent-text`, `control-fg`, `link`, `primary`
(pour l'action), `page-bg` (fond), `text` (texte), `font-family` (police). Toute autre clé est ignorée.

## 3. Règles (proposition)

1. **Valeurs acceptées.** Seule une couleur `#rgb` ou `#rrggbb` est reprise (`#rgb` développé en `#rrggbb`). `rgba(...)`, nom de couleur, `var(...)`, dégradé ou image
   (`--grist-theme-bg` en est une) sont écartés et dits dans `notes`. Une valeur écartée ne fait pas échouer le thème : la graine correspondante est dérivée.
2. **Mode.** `apparence` fait foi. Valeur autre que `clair`/`sombre` : le contrat refuse (`apparence-inconnue`), l'appelant garde ses valeurs d'origine.
3. **Fond.** `page-bg` s'il est une couleur acceptée, sinon le fond dérivé du mode. Un fond ne se lit jamais comme une image.
4. **Texte (graine `encre`).** `text` s'il est accepté **et** à 4,5:1 sur le fond ; sinon redressé vers le noir (fond clair) ou le blanc (fond sombre), et dit.
5. **Action (graine `principal`).** On prend la **première couleur de la liste** `control-primary-bg`, `primary-muted`, `primary-dim`, `accent-text`, `control-fg`, `link`, `primary` (**ordre figé**) qui
   tient **4,5:1** sur le fond ET sur la surface. **La surface est la variable `surface` rendue par la dérivation du kit** pour le mode et la graine `fond` (elle ne dépend pas de la couleur
   d'action) ; chaque vecteur donne la surface attendue, pour que chaque lecteur contrôle sa propre dérivation avant le 4,5:1. Si aucune ne tient, `control-primary-bg` est **redressé** à 4,5:1 (vers le noir ou le blanc, selon le fond), et
   dit. Le thème n'est refusé que si le redressement est impossible. (Raison : les couleurs propres de Grist restent d'abord reconnaissables ; le repli sur les valeurs
   d'origine est le dernier recours, pas le premier.)
6. **Police.** `font-family` n'est reprise que si elle ne contient que des noms de polices (lettres, chiffres, espaces, virgules, guillemets, point, tiret) ; elle devient la
   police `systeme` du ThemeDef. La sortie porte aussi la **`pile`** : la valeur de `font-family` nettoyée (espaces et sauts de ligne réduits à un espace), pour les widgets qui posent la vraie
   pile de Grist (Atlas) ; un widget qui ne sait pas l'utiliser l'ignore. Toute autre forme est écartée et dite. Aucune police n'est téléchargée.
7. **Sombre.** Le contrat rend le thème sombre tel quel ; c'est le widget qui décide ce qu'il sait afficher. Un widget qui ne suivrait pas le sombre le dit et ne garde que ce qui reste
   lisible (aucun des quatre widgets actuels n'est dans ce cas : Atlas suit le sombre depuis la 1.37.0).
8. **Garde-fou final.** Le ThemeDef produit passe par le lecteur (22 paires). S'il échoue, le widget garde ses valeurs d'origine et dit la raison ; il n'applique jamais un thème à moitié.
9. **Source.** Le thème porte `source: 'instance'`, et n'est jamais écrit dans `Theme_document` (seul le geste d'activation écrit).
10. **Priorité.** Toujours en dessous du thème du document et d'un choix explicite du widget (y compris « sans thème »).

## 4. Vecteurs (à construire avec le kit)

Chaque vecteur = une entrée, la sortie attendue (graines, mode, notes, refus), et le verdict du lecteur. Jeu de départ :

| # | Entrée | Attendu |
|---|--------|---------|
| V1 | GristLight, mesuré en réel sur docs.getgrist.com (control-primary-bg #16b378, primary-muted #009058, primary-dim #007548, link et control-fg #16b378, page-bg #f7f7f7, text #262633) | action = première candidate à 4,5:1 (ou redressée), fond `page-bg`, texte `text` |
| V2 | GristDark (source : grist-core `GristDark.ts` + `Base.ts`, relevé par Atlas-BI : control-primary-bg #157a54, primary #17b378, primary-muted #1da270, link et control-fg #17b378, page-bg #262633, text #efefef) | mode sombre, première candidate d'action à 4,5:1 sur le fond et la surface dérivée, texte clair |
| V3 | Instance à palette propre, **mesurée en réel le 01/11/2026 sur un document Grist de l'instance numerique.gouv** (data-grist-appearance=light, data-grist-theme=GristLight) : control-primary-bg #3E5DE7, primary-muted #2845C1, primary-dim #223E9E, accent-text/control-fg/link/primary #3E5DE7, control-primary-fg #EDF0FF, page-bg #F6F8F9, widget-bg #ffffff, text #222631, bg = **image** (`url("img/gplaypattern.png")`), font-family `Marianne,-apple-system,BlinkMacSystemFont,Liberation Sans, Helvetica,Arial,sans-serif,…` (commence par une police NOMMÉE, avec espace et saut de ligne) ; clair | action de l'instance (redressée si besoin), notes dites |
| V4 | Idem, sombre (**non mesuré** : demande de changer le thème du compte ; à relever avec l'accord de la personne, sinon dérivé de GristDark avec l'accent de l'instance) | idem |
| V5 | `page-bg` en image | fond dérivé, valeur écartée dite |
| V6 | `control-primary-bg` en `rgba(...)` | candidate suivante, valeur écartée dite |
| V7 | Aucune candidate d'action lisible | `control-primary-bg` redressé, dit |
| V8 | `font-family` avec un `;` ou une `url(` | police écartée, dite, le reste appliqué |
| V8b | `font-family` de GristLight avec saut de ligne et espaces dans la valeur (relevé réel) | `police: systeme`, `pile` nettoyée sur une ligne |
| V9 | `apparence` absente ou inconnue | refus `apparence-inconnue` |
| V10 | `text` illisible sur `page-bg` | texte redressé, dit |
| V11 | Entrée vide | aucun thème, sans bruit (le widget garde ses valeurs d'origine) |

Chaque lecteur (Form Builder, Atlas, appkit) rejoue ces vecteurs et doit donner **exactement** les mêmes graines. Un écart se nomme et se tranche, comme les 15 écarts
du lecteur de `Theme_document`.

## 5. Ce que ce contrat change chez chacun (à confirmer par son propriétaire)

- **Form Builder :** `themeHote` reprend aujourd'hui l'action seule (redressée) et le mode ; il devra lire aussi fond, texte et police, et appliquer la liste de candidates de la règle 5.
  Les formulaires publiés sans réglage d'apparence suivent aujourd'hui `document` : ils passent au thème de l'instance par défaut dans Grist (D-A), avec la même garde de lisibilité.
- **Atlas :** `theme-instance.js` est l'ancêtre de ce contrat ; seuil des candidates passé de 3:1 à 4,5:1 (accepté par Atlas-BI : GristLight #009058 devient #007548), redressement du texte à ajouter, `apparence` absente = refus (aujourd'hui `clair`).
- **appkit :** le pont `hote` passe du repli au redressement (règle 5), et gagne fond, texte, police ; le chaînage `document` puis `hote` est un ajout séparé.
- **TaskFlow :** n'a pas de lecteur ; il peut recevoir les 26 variables posées par un hôte, ou, plus tard, appeler le contrat dans un module partagé, avec le réglage « sans thème ».

## 6. Ce qui reste ouvert

- Où vit le fichier : `kit/jetons/themedef` (proposition d'appkit) ; copie mécanique dans chaque widget, comme `lotActivation`.
- La règle 5 (4,5:1, redressement) change le choix d'Atlas : à lui d'accepter ou de proposer 3:1 avec son argument.
- Les variables `--grist-theme-*` varient d'une instance à l'autre ; le jeu de vecteurs doit être complété par des mesures réelles, pas seulement par des valeurs écrites à la main.

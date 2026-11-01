# Le thème de l'instance Grist devient un ThemeDef : contrat unique (BROUILLON)

Statut : proposition de Form Builder, 01/11/2026, à arbitrer avec Atlas-BI et appkit-architecte (le kit porte le contrat et les vecteurs, voir
[THEMEDEF-ALIGNEMENT.md](THEMEDEF-ALIGNEMENT.md) E1). Décisions de l'auteur déjà prises : le thème de Grist est le repli **par défaut dans Grist** (D-A) et il donne aussi
**fond, texte et police** (D-B). Rien n'est codé ; l'ordre est : contrat, vecteurs, puis chaque lecteur les rejoue.

## 1. Ce que fait le contrat

Une fonction pure, la même dans tous les widgets : `themeInstance(entree) -> { themedef | null, mode, notes[], refus? }`.
La sortie est un ThemeDef 1.0 réduit à ses graines (`principal`, `fond`, `encre`, `police`), que la dérivation du kit et le lecteur (22 paires) traitent comme
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
5. **Action (graine `principal`).** On prend la **première couleur de la liste** `control-primary-bg`, `primary-muted`, `primary-dim`, `accent-text`, `control-fg`, `link`, `primary` qui
   tient **4,5:1** sur le fond ET sur la surface dérivée. Si aucune ne tient, `control-primary-bg` est **redressé** à 4,5:1 (vers le noir ou le blanc, selon le fond), et
   dit. Le thème n'est refusé que si le redressement est impossible. (Raison : les couleurs propres de Grist restent d'abord reconnaissables ; le repli sur les valeurs
   d'origine est le dernier recours, pas le premier.)
6. **Police.** `font-family` n'est reprise que si elle ne contient que des noms de polices (lettres, chiffres, espaces, virgules, guillemets, point, tiret) ; elle devient la
   police `systeme` du ThemeDef. Toute autre forme est écartée et dite. Aucune police n'est téléchargée.
7. **Sombre.** Un widget qui ne suit pas le sombre (par exemple Atlas, application complète) le dit (`fond-sombre-non-suivi`) et ne garde que ce qui reste lisible : le contrat
   rend le thème sombre, c'est le widget qui décide ce qu'il sait afficher.
8. **Garde-fou final.** Le ThemeDef produit passe par le lecteur (22 paires). S'il échoue, le widget garde ses valeurs d'origine et dit la raison ; il n'applique jamais un thème à moitié.
9. **Source.** Le thème porte `source: 'instance'`, et n'est jamais écrit dans `Theme_document` (seul le geste d'activation écrit).
10. **Priorité.** Toujours en dessous du thème du document et d'un choix explicite du widget (y compris « sans thème »).

## 4. Vecteurs (à construire avec le kit)

Chaque vecteur = une entrée, la sortie attendue (graines, mode, notes, refus), et le verdict du lecteur. Jeu de départ :

| # | Entrée | Attendu |
|---|--------|---------|
| V1 | GristLight, valeurs mesurées | action = première candidate à 4,5:1 (ou redressée), fond `page-bg`, texte `text` |
| V2 | GristDark | mode sombre, action lisible sur fond sombre, texte clair |
| V3 | Instance à palette propre (numerique.gouv, #3E5DE7), clair | action de l'instance (redressée si besoin), notes dites |
| V4 | Idem, sombre | idem |
| V5 | `page-bg` en image | fond dérivé, valeur écartée dite |
| V6 | `control-primary-bg` en `rgba(...)` | candidate suivante, valeur écartée dite |
| V7 | Aucune candidate d'action lisible | `control-primary-bg` redressé, dit |
| V8 | `font-family` avec un `;` ou une `url(` | police écartée, dite, le reste appliqué |
| V9 | `apparence` absente ou inconnue | refus `apparence-inconnue` |
| V10 | `text` illisible sur `page-bg` | texte redressé, dit |
| V11 | Entrée vide | aucun thème, sans bruit (le widget garde ses valeurs d'origine) |

Chaque lecteur (Form Builder, Atlas, appkit) rejoue ces vecteurs et doit donner **exactement** les mêmes graines. Un écart se nomme et se tranche, comme les 15 écarts
du lecteur de `Theme_document`.

## 5. Ce que ce contrat change chez chacun (à confirmer par son propriétaire)

- **Form Builder :** `themeHote` reprend aujourd'hui l'action seule (redressée) et le mode ; il devra lire aussi fond, texte et police, et appliquer la liste de candidates de la règle 5.
  Les formulaires publiés sans réglage d'apparence suivent aujourd'hui `document` : ils passent au thème de l'instance par défaut dans Grist (D-A), avec la même garde de lisibilité.
- **Atlas :** `theme-instance.js` est l'ancêtre de ce contrat ; seuil des candidates 3:1 à passer à 4,5:1 (règle 5), redressement à ajouter.
- **appkit :** le pont `hote` passe du repli au redressement (règle 5), et gagne fond, texte, police ; le chaînage `document` puis `hote` est un ajout séparé.
- **TaskFlow :** n'a pas de lecteur ; il peut recevoir les 26 variables posées par un hôte, ou, plus tard, appeler le contrat dans un module partagé, avec le réglage « sans thème ».

## 6. Ce qui reste ouvert

- Où vit le fichier : `kit/jetons/themedef` (proposition d'appkit) ; copie mécanique dans chaque widget, comme `lotActivation`.
- La règle 5 (4,5:1, redressement) change le choix d'Atlas : à lui d'accepter ou de proposer 3:1 avec son argument.
- Les variables `--grist-theme-*` varient d'une instance à l'autre ; le jeu de vecteurs doit être complété par des mesures réelles, pas seulement par des valeurs écrites à la main.

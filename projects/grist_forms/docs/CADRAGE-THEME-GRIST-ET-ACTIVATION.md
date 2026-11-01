# Cadrage : repli sur le thème de Grist, et geste d'activation du thème du document

Statut : cadré le 01/11/2026 sur demande de l'auteur (« cadre tout et procède, optimal, complet, fiable »). Deux chantiers, un ordre, des
décisions écrites pour qu'elles ne se rediscutent pas en cours de route.

## 1. Ce qui existe déjà (à reprendre, pas à refaire)

| Besoin | Déjà fait où | Ce qu'on en prend |
|---|---|---|
| Lire le thème que Grist pousse dans un widget | appkit, lot T5 : `kit/runtime/hote-apparence.mjs`, `kit/jetons/lib/pont-hote.mjs` | la lecture (`data-grist-appearance`, `--grist-theme-control-primary-{bg,fg,hover-bg}`), les portes H1 H2 H3, la règle « jamais une couleur non mesurée » |
| Activer un ThemeDef dans `Theme_document` | kit, TD-3a : `kit/jetons/themedef/lib/activation.mjs` (`lotActivation`) + 57 vecteurs | la fonction, **copiée**, et ses vecteurs rejoués |
| Lire / valider un ThemeDef | `shared/themedef.js` (déjà aligné sur les vecteurs TD-1) | tel quel |

Mesuré par le kit (étude 19, instance numerique.gouv, Grist réel) : l'instance DINUM n'est **pas** en DSFR ; son `custom.css` surcharge
`--grist-theme-*` avec la palette La Suite UI Kit (marque `#3E5DE7`). Le thème « de l'instance » est donc réel et lisible depuis le widget.

## 2. Chantier A : le repli sur le thème de Grist

### Chaîne d'apparence (formulaires publiés et compositeur)

1. `apparence.mode = 'formulaire'` : le ThemeDef donné avec le formulaire ;
2. `Theme_document` actif (si le document en porte un) ;
3. **le thème de Grist, dans Grist seulement** (nouveau) ;
4. l'apparence d'origine.

Le contraste forcé ou renforcé de la personne (étage « personne ») passe avant tout, comme avant.

### Décisions

- **A1. Nouveau mode `grist` de `apparence`**, opt-in : « Celle du document, sinon celle de Grist ». Les formulaires existants n'ont pas
  d'`apparence` (ou `document`) : **rien ne change pour eux**, même si la personne utilise Grist en sombre. C'est la contrainte de
  compatibilité de production.
- **A2. Les nouveaux formulaires créés dans le compositeur prennent `grist` par défaut.** Un formulaire rouvert n'est jamais réécrit : son
  `apparence` ne change que si la personne la change.
- **A3. On reprend du thème de Grist le MODE et la couleur d'ACTION seulement**, comme le kit. Le reste (fonds, textes, états) est dérivé par
  `deriver` à partir de cette couleur, avec les mêmes garde-fous de lisibilité que pour tout autre thème. Une couleur lue qui n'est pas un
  hexadécimal, un `rgb()` opaque, `white` ou `black` est refusée (pas de devinette).
- **A4. Portes.** H1 (texte d'action sur l'action >= 4,5:1) et H2 (action sur le fond, la surface et la surface douce >= 4,5:1) sont
  bloquantes : si la couleur de l'hôte ne les passe pas, elle est assombrie ou éclaircie jusqu'à les passer et la remarque le dit (le kit,
  lui, retombe sur son repli ; ici le thème dérivé garde la teinte). H3 (écart d'identité avec les couleurs d'état) est mesurée, jamais
  bloquante, comme la décision du 10/10/2026 du kit.
- **A5. Le mode de Grist prime sur `prefers-color-scheme`** dans un widget : c'est ce que la personne a choisi dans Grist.
- **A6. Suivi à chaud.** Le thème de Grist peut changer dans le même document : un observateur sur `<html>` (attributs et feuille
  `#grist-theme`) ré-applique. Pas de rechargement, pas de saut.
- **A7. Attente bornée.** Le thème arrive de Grist par message après `grist.ready` : on attend au plus 400 ms avant de monter le formulaire,
  et seulement quand une API de document est présente. Hors de Grist, aucune attente.
- **A8. Page autonome (hors Grist).** Il n'y a pas d'hôte : `grist` retombe sur le thème actif du document, figé à la génération (copie, jamais
  une adresse), sinon sur l'origine. Rien de plus.
- **A9. Compositeur.** L'outil suit : essai de session, puis thème du document, puis thème de Grist, puis origine. La case « Suivre » vaut pour
  les deux étages. Hors de Grist (mode démo), pas d'hôte, rien ne change.
- **A10. Les bundles déjà publiés ne bougent pas** : un formulaire publié embarque son propre `themedef.js`. Seuls les formulaires
  (re)publiés après cette version peuvent demander `grist`.

## 3. Chantier B : le geste d'activation

### Décisions

- **B1. Règle 6 de THEMEDEF-SPEC amendée** : « écrivains reconnus, qui passent par la même fonction d'activation » (accord du kit, qui l'a
  proposé comme condition ; validé par l'auteur le 01/11/2026 en demandant de procéder).
- **B2. Une seule fonction.** `shared/activation.js` est une COPIE de `lotActivation` du kit (même contrat : `{ ok, actions, erreurs,
  avertissements, ignore }`), rejouée sur les 57 vecteurs du kit (copiés dans `tests/fixtures/`). Aucune bascule réécrite.
- **B3. Refus prioritaire.** Un document que le validateur refuse n'ouvre aucune action : jamais d'activation d'un thème invalide, jamais de
  désactivation de l'ancien thème si le nouveau est refusé.
- **B4. Confirmation.** Le bouton « Appliquer ce thème au document » affiche d'abord ce qui va changer (nom, thème remplacé, widgets
  concernés, remarques de lisibilité) et ne fait rien avant un clic de confirmation. **La table `Theme_document` n'est créée qu'après une
  confirmation explicite de la création**, jamais au chargement ni en passant.
- **B5. Droits.** Le geste suppose le droit d'écriture du document (Grist l'impose) ; en lecture seule, le bouton est remplacé par une phrase.
- **B6. Atomicité.** Un seul lot d'actions (`ApplyUserActions`). Non garantie par Grist pour deux écrivains simultanés (point ouvert §6 de la
  spec) : le résultat sûr, dit par la spec, est que les lecteurs n'appliquent rien (`plusieurs-actifs`). Mesurée en Grist réel (§5).
- **B7. Retrait.** « Retirer le thème du document » met `actif` à faux (une seule action, jamais de suppression de ligne).
- **B8. `Design_system` reste la source modifiable.** L'activation recopie le ThemeDef, elle ne déplace rien.

## 4. Ordre de réalisation (une étape = tests verts + commit)

1. Cadrage (ce fichier).
2. Lecteur de l'hôte et thème dérivé : `themedef.js` (`lireCouleur`, `lireHote`, `themeHote`, `suivreHote`, `attendreHote`), tests purs.
3. Mode `grist` : `apparenceDe`, `charger`, schéma (copie publiée synchronisée), amorces `publish.js` et `externe.js`.
4. Compositeur : 4e choix « Celle de Grist », défaut des nouveaux formulaires, outil qui suit Grist, suivi à chaud.
5. `activation.js` + vecteurs du kit, rejeu complet.
6. Bouton d'activation dans `design-system.html` (confirmation, création de table confirmée, retrait).
7. Spec et docs : règle 6, `apparence`, étage Grist ; CLAUDE.md.
8. Essais en Grist réel (document de test, jamais celui de la collègue) : repli clair/sombre, suivi à chaud, activation, bascule, refus,
   deux écrivains.
9. Prévenir le kit et Atlas-BI (amendement de la règle 6, étage Grist).

Rien n'est publié : la 1.6.0 reste à la décision de l'auteur.

## 5. Ce qui sera mesuré et dit tel quel

- Le repli : couleurs lues réellement dans Grist (instance de test), clair et sombre, contrastes recalculés.
- L'atomicité de la bascule : deux activations quasi simultanées, état final relu par le lecteur.
- Ce qu'on n'aura pas pu mesurer (autre instance, contraste forcé en navigateur) sera nommé comme tel dans le compte rendu.

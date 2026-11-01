# ThemeDef : tests communs et publication commune

Statut : plan de travail, 01/11/2026, coordonné par Form Builder (décision D-C de l'auteur). Complète [THEMEDEF-ALIGNEMENT.md](THEMEDEF-ALIGNEMENT.md) et
[THEMEDEF-INSTANCE-GRIST.md](THEMEDEF-INSTANCE-GRIST.md). **Rien ne part (push, release, forum) sans un go explicite de l'auteur au moment de publier.**

## 1. Qui publie quoi

| Widget | Quoi | Où |
|--------|------|----|
| Form Builder | 1.6.0 : lecteur corrigé, mode `grist`, activation, thème du visiteur, vitrine | dépôt public, branche de publication depuis `origin/main` |
| Atlas | 1.42.0 : lecteur aligné, thème de l'instance par défaut, « sans thème », refus dit | idem, hôtes prévenus avant |
| TaskFlow | version à nommer par son agent : lecteur, thème de l'instance par défaut, « sans thème » | idem |
| appkit (kit) | **rien n'est publié ni poussé** : appkit reste 100 % local ; il fournit les deux modules purs, déjà copiés mécaniquement dans les trois autres | n/a |

## 2. Les tests communs (à jouer par CHAQUE widget concerné, résultat posté dans le fil)

Document de test : celui de l'auteur sur numerique.gouv (thème d'instance mesuré), l'auteur se connecte si besoin. Clair et sombre par émulation
(`prefers-color-scheme`) **et**, quand c'est possible, en changeant le thème du compte. Pour chaque cas : capture, et la valeur mesurée des variables posées.

| # | Cas | Attendu |
|---|-----|---------|
| T1 | Hors Grist, aucun réglage | aucun thème : rendu identique à celui d'avant (test « identique à l'octet » quand le widget produit des pages) |
| T2 | Dans Grist, pas de `Theme_document`, thème clair | thème de l'instance appliqué, 22 paires tenues |
| T3 | Idem en sombre : au chargement, puis changement à chaud | sombre lisible ; le changement à chaud est dit s'il n'est pas suivi |
| T4 | Réglage « sans thème » actif | valeurs d'origine, ni document ni instance |
| T5 | `Theme_document` valide, une ligne active | le document l'emporte sur l'instance |
| T6 | Thème de document refusé (JSON invalide, `resolu` incomplet, contraste insuffisant, version inconnue) | le refus est **dit** à l'écran, puis le thème de l'instance prend le relais |
| T7 | Plusieurs lignes actives | refus dit (`plusieurs-actifs`), puis instance |
| T8 | `forced-colors: active` et `prefers-contrast: more` | aucun thème posé |
| T9 | Copie mécanique du kit | empreintes de l'en-tête exactes, 32 vecteurs de l'instance et 126 de la dérivation rejoués à l'identique (test automatique) |
| T10 | Mesure des 22 paires sur ce qui est réellement posé, clair et sombre | zéro paire en échec |
| T11 | Documents et widgets existants sans rien changer | rendu et comportement inchangés |
| T12 | Écriture | aucun widget ne crée ni n'écrit `Theme_document` hors du geste d'activation |

Instances à couvrir : numerique.gouv (mesuré) ; une instance Grist standard (GristLight) si accessible sans compte, sinon les vecteurs.
Chaque propriétaire écrit « fait / pas fait / écart » par cas, avec la preuve (fichier de test ou capture). Un cas non joué est dit « non joué », jamais passé sous silence.

## 3. Verrous avant de demander le go à l'auteur

1. Les tests T1 à T12 sont posés dans le fil par les trois widgets, sans cas rouge. Les écarts connus sont nommés et acceptés (exemple : E7, E10).
2. La suite de tests de chaque widget est verte sur sa branche de publication (Form Builder : `DSDEF_DIR=… node --test "projects/grist_forms/tests/*.test.js" scripts/*.test.js`).
3. Une **vérification croisée** : les trois widgets dans UN même document de test, clair et sombre, sur la même instance, couleur d'identité comparée (même famille de couleur) et aucun état illisible. Faite par Form Builder, captures dans le fil.
4. Les trois widgets sont prêts **le même jour** : un document ne doit jamais montrer un widget thème de l'instance et un autre non.
5. Le contenu de chaque publication est relu pour : aucun nom d'organisation, aucune clé, aucun essai (`essais-*`, captures, brouillons), aucun fichier généré d'un autre widget.

## 4. Comment se passe la publication commune (après le go)

Chaque widget garde sa procédure habituelle (`CLAUDE.md` racine : promote, `npm run manifest`, `node scripts/generate-vitrine.js`, restauration des pages des autres widgets, commit descriptif). La coordination ajoute :

1. **Gel.** Après le go, plus aucun changement hors correctif de publication sur les trois branches.
2. **Ordre, un à la fois**, pour éviter les conflits sur les fichiers communs (`published/manifest.json`, `published/index.html`, `sitemap.xml`) : Form Builder, puis Atlas, puis TaskFlow. Chacun rebase sur `origin/main` à jour avant sa pull request ; le suivant ne commence qu'après la fusion et la fin de l'exécution de la CI du précédent.
3. Pour chaque widget : branche depuis `origin/main`, fusion de la branche de travail, promote, manifest, vitrine, restauration des autres pages, `gh pr create`, fusion, suivi de la CI, **vérification en ligne** (la page déployée, un document de test).
4. **Hôtes prévenus avant** pour Atlas (convention déjà en place) ; TaskFlow prévient ses utilisateurs que les documents prendront le thème de leur instance, avec le réglage « sans thème » pour y échapper.
5. **Brouillons de forum** : générés (`generate-post.js`), jamais publiés sans accord explicite (règle du dépôt).
6. **Retour arrière** : chaque widget garde sa version précédente publiée ; en cas de problème, la version d'avant est republiée seule. Le réglage « sans thème » est le correctif immédiat côté personne.
7. **Après** : chacun poste « en ligne et vérifié » avec l'adresse ; Form Builder consigne la date et l'état final dans la mémoire du chantier.

## 5. Ce qui n'est PAS dans cette publication

Le thème maison de la vitrine ([CADRAGE-THEME-MAISON.md](CADRAGE-THEME-MAISON.md), en attente des décisions D1 à D3), le thème du visiteur étendu à d'autres pages que Form Builder, et la prise en compte de la police de l'instance (aucune variable du kit n'est une police).

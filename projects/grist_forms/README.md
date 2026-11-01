# Form Builder — des formulaires qui vivent dans votre document Grist

Composer un questionnaire, le mettre en ligne, voir ce que les réponses disent :
le tout dans un document Grist, sans service tiers entre la réponse et votre
table (le seul appel extérieur est celui du champ d’adresse, s’il en pose un) et
sans recopier quoi que ce soit. Les réponses arrivent directement dans vos tables, dans les colonnes que
vous avez choisies.

---

## Ce que ça fait

**Un formulaire branché sur vos colonnes.** Chaque question vise une colonne
existante — ou crée celles qui manquent, si vous le demandez. Il n'y a pas de
base intermédiaire : ce qui est répondu est dans votre table à la seconde près.

**Un parcours, pas une liste.** Les questions se regroupent en étapes. Une
question peut n'apparaître que selon une réponse précédente, une étape entière
peut être épargnée à qui n'est pas concerné, et la progression s'affiche en haut.

**Une page d'accueil en bonne et due forme.** Qui publie, pourquoi, pour combien
de temps, et ce qu'il advient des réponses — c'est ce qu'on lit pour décider de
répondre. Un bandeau reste à l'écran du début à la fin.

**Une mise en ligne qui fige.** Publier crée une page dédiée dans le document,
avec une copie figée du formulaire : vous pouvez continuer à travailler sur la
version suivante pendant que le public répond à celle d'avant.

**Une synthèse qui relit les réponses.** Une table de réponses n'est pas lisible
seule : une échelle y écrit « 4 », un classement est éclaté en trois colonnes.
La synthèse remet le sens que la définition du formulaire porte.

---

## Les formes de question

| Question | Ce que la personne fait | Où ça atterrit |
|---|---|---|
| Texte, paragraphe, nombre | saisit | `Text`, `Int`, `Numeric` |
| Oui / Non | choisit entre deux mots que vous écrivez | `Bool` |
| Liste, cases à cocher | choisit, avec un plafond si besoin | `Choice`, `ChoiceList` |
| « Autre : … » | choisit *Autre* puis précise | la liste + une colonne de précision |
| Échelle | place un curseur entre deux extrêmes nommés | `Int` |
| Étiquettes libres | tape des mots-clés, ajoute, retire | `ChoiceList` |
| Pastilles colorées | touche un choix coloré (priorité, statut) | `Choice` |
| Classement | range des propositions dans une grille | une colonne par rang |
| Date, date et heure | choisit | `Date`, `DateTime` |
| Référence | choisit une ligne d'une autre table | `Ref`, `RefList` |
| Fichier, photo | joint, ou photographie sur son téléphone | `Attachments` |
| **Lieu** | pose un point, trace un trajet ou un contour sur une carte | `Text` (WKT) |
| **Adresse** | tape, puis choisit l’adresse qui existe dans la liste | `Text` + colonnes annexes |
| **Dessin, signature** | dessine, annote une image, signe | `Attachments` |

**Toutes les tailles d'écran** : chaque saisie tient de 320 px à un grand écran, sans défilement horizontal de la page, et chaque cible tactile fait au moins 44 px. La règle et la recette de mesure sont dans `docs/ECRANS.md`.

Les échelles qui se suivent se regroupent en matrice : l'échelle n'est annoncée
qu'une fois, pas sous chaque ligne.

### Un lieu : la carte, une adresse, ou les deux

Une question de lieu (un point) se renseigne en touchant la carte, en choisissant une adresse de la Base adresse nationale, ou l'un ou l'autre au choix (`options.saisieLieu` : `carte` par défaut, `adresse`, `les-deux`). Les deux donnent le même point, dans la même colonne, avec le même complément (commune, bâtiment, altitude, risques) ; la carte se recentre sur l'adresse choisie, et un toucher sur la carte efface l'adresse choisie, qui n'est plus celle du point. Le texte `POINT(…)` n'est pas montré quand une adresse est proposée. Une ligne ou une surface reste à la carte ; sans le service d'adresses, la carte seule.

### Le champ d’adresse

La personne tape une adresse, valide (Entrée ou bouton), et choisit dans la liste
des adresses qui existent. La source est la Base adresse nationale, servie par la
Géoplateforme (service de l’État) ; aucun compte ni clé n’est nécessaire.

- **Ce qui part** : les caractères tapés, à la validation seulement (réglage par
  défaut). On peut demander la recherche à la frappe (`declenchement: "frappe"`),
  avec une requête par seconde au plus. Une mention le dit sous le champ.
- **Ce qui est écrit** : l’adresse complète dans la colonne de la question ; et,
  dans des colonnes annexes que vous nommez, le code postal, la commune, le code
  INSEE, la latitude, la longitude, l’identifiant de l’adresse
  (`options.colonnes.annexes`, par sens : `codePostal`, `commune`, `insee`,
  `latitude`, `longitude`, `identifiant`).
- **Garde-fou** : les annexes ne valent que pour une adresse choisie dans la liste.
  Un texte libre, ou modifié après le choix, laisse les annexes vides.
- **Si le service ne répond pas** : la saisie libre reste possible.
- **Mode « créer le schéma »** : les colonnes annexes sont créées avec le bon type
  (texte pour les codes, nombre pour les coordonnées).

```json
{ "colId": "Adresse", "kind": "referentiel", "type": "Text",
  "options": { "referentiel": { "source": "ban" },
               "colonnes": { "annexes": { "codePostal": "AdresseCP",
                                          "latitude": "AdresseLat",
                                          "longitude": "AdresseLon" } } } }
```

---

### Un format qu'on contrôle

Une question de texte peut exiger un **IBAN**, un **SIREN**, un **SIRET**, un **code postal**, un **code INSEE**, un **courriel** ou un **téléphone français** (`options.validation.format`).
Le contrôle est un calcul ou un motif, jamais un appel à un service : la valeur ne quitte pas la page. Une valeur fausse reste sous la question avec son message ;
une valeur juste est enregistrée sous sa forme normalisée (un IBAN sans espaces, un téléphone à dix chiffres).

La règle existe **en JavaScript et en Python** (`shared/formats.js`) : le navigateur guide la personne, et la colonne de conformité d'un envoi hors de Grist refait le même contrôle
côté Grist, parce que le serveur d'un formulaire natif accepte tout. Les essais exécutent les deux et exigent le même verdict.

### Nombres, dates, heures : bornes, départ, curseur, compteur

- **Bornes** (`options.min`, `max`) : un nombre hors bornes, une date trop tôt ou trop tard est refusé avec un message qui dit les bornes. Une date accepte `aujourdhui`.
- **Curseur** (`widget: curseur`) : une valeur entre deux bornes, avec des valeurs d'appui (`presets`) ; **il n'écrit rien tant qu'on n'y a pas touché**, et l'écran le dit (« Pas de réponse »).
- **Compteur** (`widget: compteur`) : un nombre qu'on monte et qu'on descend d'un pas, sans sortir des bornes. `unite` affiche une unité sans l'écrire.
- **Heure** (`widget: heure`) : « HH:MM », rangée en texte (Grist n'a pas de type heure) ; le sélecteur est celui du système.
- **Étiquettes** (`widget: etiquettes`) : des mots libres ajoutés en puces, sans doublon (la casse ne distingue pas), 40 caractères et 20 mots au plus ; un mot tapé mais pas encore ajouté n'est pas perdu à l'envoi. La liste de choix sert de suggestions, elle n'est pas obligatoire.
- **Pastilles** (`widget: pastilles`) : des choix en boutons colorés ; `options.couleurs` donne une couleur par choix (`#rgb` ou `#rrggbb`, rien d'autre : la couleur finit dans un style).
- **Ordre** (`options.apres`) : une fin qui ne peut pas précéder son début, pour des dates, des heures ou des nombres.
- **Valeur de départ** (`options.depart`) : la date du jour, maintenant, le courriel de la personne connectée, la dernière saisie sur l'appareil, ou une valeur fixe. Elle ne passe jamais devant une valeur déjà donnée et ne s'applique pas quand on modifie une ligne.

### Une valeur donnée par l'adresse de la page

Un code collé sur un équipement ouvre le formulaire **avec cet équipement déjà désigné** : `…/page.html?objet=LAMP-0012&objet_nom=Lampadaire%2012`.
Une question le déclare (`options.prefill` : `param`, `verrouille`, `libelleParam`) ; rien n'est repris sans cette déclaration. Verrouillée, la valeur se lit sans se saisir
et part avec la réponse. C'est une commodité, pas une protection : une adresse se fabrique à la main, la table doit contrôler ce qu'elle reçoit.

### Un lieu qui complète d'autres colonnes

Sur une question de lieu (un point), `options.enrichir.colonnes` désigne les colonnes que les services publics peuvent remplir à partir du point posé :
l'**adresse** la plus proche, la **commune** (code INSEE, code postal, département), le **bâtiment** (identifiant du Référentiel national des bâtiments),
l'**altitude**, les **risques** connus. Un service qui ne répond pas laisse ses colonnes vides (jamais `0`), et la position choisie est conservée.
Le formulaire dit sous la carte ce qui part et vers qui. Les services sont appelés depuis le navigateur, sans clé.

## Illustrer une question

Une question ne se comprend pas toujours avec des mots. « Classez ces cinq
lieux » suppose qu'on sache où ils sont.

- **une image**, par son adresse ou déposée depuis l'appareil ;
- **une carte** avec des repères posés au clic, qui situe ce dont on parle ;
- **une page entière** : une vue publiée, un tableau de bord, un autre widget.

La page intégrée est isolée dans un bac à sable et n'est acceptée qu'en `https`.
Elle ne partage ni l'origine ni les cookies du formulaire, et ne peut pas écrire
dans le document.

---

## La carte

La saisie d'un lieu utilise la même pile cartographique que les autres outils
carto du dépôt : MapLibre, fonds IGN Géoplateforme, tracé par terra-draw. Un
point se pose au doigt et s'enlève en le retouchant ; une ligne ou une surface
se trace sommet par sommet, et chaque sommet posé est enregistré — pas besoin de
trouver le geste qui termine.

Les coordonnées sont normalisées à sept décimales, soit environ un centimètre :
au-delà, c'est du volume sans information.

---

## Qui voit quoi

Le formulaire peut reconnaître la personne qui l'ouvre — connectée ou non, son
adresse, son groupe — et réserver des questions en conséquence. La table
d'audience se déclare dans l'écran d'accueil.

> Ce mécanisme sert le confort, pas la sécurité. **Les droits Grist restent la
> seule barrière réelle.** Ce qu'une personne ne doit pas lire ne doit pas être
> dans un document auquel elle a accès.

---

## Mettre en service

1. Ajoutez un widget personnalisé à une page, pointez-le sur `builder.html`,
   donnez-lui l'accès complet au document.
2. **1. Mes formulaires** → *Nouveau formulaire*. Choisissez une table existante
   ou laissez-en créer une.
3. **2. Questions** : composez. La colonne du milieu montre ce que le public
   verra, celle de droite règle la question choisie.
4. **3. Aperçu** : parcourez le formulaire comme un répondant, en téléphone ou
   en ordinateur. Rien n'est enregistré.
5. **4. Mettre en ligne** : une page dédiée est créée dans le document.
6. **5. Synthèse** : ce que les réponses disent, en lecture seule.

Le formulaire publié vit dans le document : partagez la page comme vous
partagez n'importe quelle page Grist, avec les droits que vous voulez.

---

## Envoyer depuis une page hors de Grist

Le formulaire peut aussi être servi **hors de Grist**, sur n'importe quelle page, et écrire dans votre document par la clé d'un **formulaire natif** de Grist.
L'étape « Mettre en ligne » du compositeur prépare la table, vous collez le lien du formulaire publié, et une page autonome est générée.

Ce que ce mode **n'est pas** : une protection. Toute personne qui a la page peut envoyer, sans limite, et Grist accepte la ligne avant qu'une colonne ne la juge.
Les pièces jointes, dessins et signatures ne peuvent pas partir depuis une page hors de Grist. Tout est mesuré et expliqué dans `docs/ENVOI-EXTERNE.md`.

## L'apparence : le thème du document, ou celui de Grist

Un formulaire peut prendre trois apparences, au choix du compositeur (réglage « L'apparence ») :

- **Celle du document, sinon celle de Grist** (le choix des formulaires neufs) : le thème actif du document s'il y en
  a un ; sinon, dans Grist, celui de la personne — clair ou sombre, avec la couleur des boutons de l'instance —, suivi
  quand elle en change. Hors de Grist, le thème du document est figé dans la page.
- **Celle du document seulement**, ou **un thème pour ce formulaire** (un fichier ThemeDef, déposé ou collé), ou
  **l'apparence d'origine**.

Les formulaires déjà composés ne changent pas : sans choix, ils suivent le document seulement, comme avant. La
préférence de la personne (contraste renforcé ou forcé) passe toujours avant. Le compositeur s'habille du même thème.

**Un thème pour le document.** La page `design-system.html` saisit l'identité d'une organisation, mesure les
contrastes, et son bouton « Appliquer ce thème au document » l'inscrit dans la table `Theme_document` : un panneau dit
ce qui change, la table n'est créée qu'après une confirmation, un thème refusé n'écrit rien, « Retirer » désactive sans
supprimer. Voir `docs/DESIGN-SYSTEM.md` et `docs/THEMEDEF-SPEC.md`.

## Ce que ça ne fait pas

- **Pas de tableaux de bord.** La synthèse rend le sens que seule la définition
  du formulaire porte ; pour croiser, agréger et tracer des courbes, les widgets
  de résumé et de graphique de Grist font mieux.
- **Pas d'hébergement externe.** Tout vit dans votre document. Un formulaire
  destiné à des personnes sans accès au document demande un partage de page
  explicite.
- **Pas de clavier sur un canevas.** Une question qui demande un dessin ou une
  signature ne peut pas être remplie autrement : ne la rendez obligatoire que si
  la réponse peut aussi se donner d'une autre manière.

---

## Pour aller plus loin

- `docs/matrice-types.html` — les types Grist, les formes de question et les
  gestes correspondants, en une page.
- `docs/PUBLICATION.md` — ce que la mise en ligne fabrique exactement.
- `docs/MANUAL_TEST.md` — la liste des vérifications faites à la main.
- `runtime/formdef.schema.json` — la définition d'un formulaire, en JSON Schema.
- `docs/DESIGN-SYSTEM.md`, `docs/THEMEDEF-SPEC.md` — le thème du document : saisie, format, activation.

Licence et conditions : voir le dépôt.

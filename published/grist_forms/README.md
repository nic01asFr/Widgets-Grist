# Form Builder — des formulaires qui vivent dans votre document Grist

Composer un questionnaire, le mettre en ligne, voir ce que les réponses disent :
le tout dans un document Grist, sans service tiers et sans recopier quoi que ce
soit. Les réponses arrivent directement dans vos tables, dans les colonnes que
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
| Classement | range des propositions dans une grille | une colonne par rang |
| Date, date et heure | choisit | `Date`, `DateTime` |
| Référence | choisit une ligne d'une autre table | `Ref`, `RefList` |
| Fichier, photo | joint, ou photographie sur son téléphone | `Attachments` |
| **Lieu** | pose un point, trace un trajet ou un contour sur une carte | `Text` (WKT) |
| **Dessin, signature** | dessine, annote une image, signe | `Attachments` |

Les échelles qui se suivent se regroupent en matrice : l'échelle n'est annoncée
qu'une fois, pas sous chaque ligne.

---

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

Licence et conditions : voir le dépôt.

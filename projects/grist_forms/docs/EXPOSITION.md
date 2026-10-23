# Exposer le formulaire sans exposer les réponses

*Retours d'usage : « les personnes qui s'inscrivent ne doivent pas avoir accès aux réponses des autres », et « on a perdu la portabilité du formulaire ». Le premier se règle ; le second est un choix de mode, expliqué ici.*

## Le constat

Un formulaire publié **dans le document** est une page de ce document. Qui la remplit doit pouvoir **écrire** dans la table des réponses, donc être éditeur du document (ou arriver par un lien public en édition). Un éditeur voit tout ce que les règles d'accès ne lui cachent pas : les réponses des autres, mais aussi les autres tables et pages. C'est ce que les personnes inscrites ont pu constater.

Deux faits de Grist, mesurés, à ne pas perdre de vue :

- **Une règle d'accès ne peut que retirer des droits.** Elle ne donne pas le droit d'écrire. Les participants doivent déjà être éditeurs ; les règles disent ce qu'ils ne peuvent pas faire.
- **Les règles ne protègent pas la clé d'un formulaire natif.** Les envois par clé (page hors de Grist) ne sont pas filtrés par elles : voir `docs/ENVOI-EXTERNE.md`.

## Trois façons de partager, et ce que chacune expose

| | Dans le document | Lien d'un formulaire natif Grist | Page hors de Grist (Form Builder) |
|---|---|---|---|
| Où vit la page | une page du document Grist | une adresse Grist publique | un fichier HTML, déposé où l'on veut |
| Qui peut répondre | un éditeur du document, ou un lien public en édition | n'importe qui, sans compte | n'importe qui, sans compte |
| **Peut lire les réponses des autres** | oui, **sauf si des règles d'accès le cachent** (écran « Qui voit les réponses ? ») | non : la clé n'écrit que | non : la clé n'écrit que |
| Peut voir le reste du document | oui, sauf règles | non | non |
| Étapes, conditions, carte, adresse, formats | oui | non (formulaire simple) | oui |
| Pièces jointes, photo, dessin, signature | oui | oui | **non** (limite de Grist hors de son origine) |
| Places restantes affichées | oui, si la colonne comptée reste lisible | non | non (la clé ne lit rien) |
| Limite tenue par | le formulaire + la colonne « Place » | rien | la colonne « Place » (après coup) |
| Arrêter les réponses | dépublier la page, ou retirer le droit d'écriture | dépublier | dépublier le formulaire natif |

**La portabilité n'a pas disparu : elle est dans la troisième colonne.** Un formulaire qu'on peut donner à n'importe qui, par un simple lien, sans compte et sans rien lui montrer des autres réponses, c'est la page hors de Grist. Elle coûte une chose : ni pièce jointe, ni lecture (donc pas de « places restantes »). Le mode « dans le document » garde toutes les fonctions, au prix d'un travail de règles d'accès.

> **Pour un public qui n'a pas de compte (une inscription ouverte), préférez la page hors de Grist.** Pour des personnes qui ont un compte et qu'on connaît (un service, une équipe), le mode « dans le document » avec les règles ci-dessous est le plus complet.

## Ce que règle « Qui voit les réponses ? »

L'étape « Mettre en ligne » propose trois réglages pour le mode « dans le document » :

| Réglage | Les participants… | Règles posées |
|---|---|---|
| **Ajouter, sans rien lire** (par défaut) | ajoutent une réponse ; ne lisent aucune réponse, pas même la leur ; ne modifient ni ne suppriment | table des réponses : propriétaires tout, les autres `+C-RUDS` ; colonnes servant à compter les places : lisibles ; tables liées : lecture seule |
| **Chacun voit sa propre réponse** | ajoutent, et relisent les leurs (reconnues à leur courriel, connexion Grist requise) | idem, plus `+R` si la ligne porte leur courriel |
| **Tout le monde voit tout** | tout lisent | aucune règle ; à éviter dès qu'on recueille des noms |

Deux options : **qui garde tous les droits** en plus des propriétaires (par courriel : un gestionnaire éditeur sans être propriétaire serait sinon traité comme un participant), et **cacher aussi le reste du document** (un refus par défaut : à cocher si le document n'est partagé qu'avec les participants).

Form Builder **n'applique rien sans votre confirmation**, ne **modifie jamais** une règle existante, et marque les siennes (`form-builder:<identifiant>`) pour pouvoir les **retirer d'un geste**. S'il trouve déjà des règles sur la même table, il s'arrête et propose les règles à poser à la main. Les propriétaires gardent toujours tous les droits.

### Changer le formulaire après avoir posé les règles

Les règles se posent une fois. Si le formulaire change ensuite — un maximum par choix ajouté, par exemple — il demande à lire de nouvelles colonnes (celles qui servent à compter), et les règles posées n'en laissent plus lire assez : le formulaire annonce alors des places qui ne tiennent pas compte des réponses des autres.

« Poser » est refusé tant que des règles du formulaire existent, et « Retirer » laisserait le document sans protection le temps de reposer. L'écran propose donc **« Mettre à jour les règles »** : après lecture des règles du document, il change **en place la seule liste des colonnes lisibles**, sans retirer ni ajouter aucune règle (le document n'est jamais sans protection). Si autre chose diffère (réglage, accès public, tables liées, reste du document), ou si une règle étrangère vise les mêmes colonnes, il le dit et laisse le chemin « retirer puis reposer ».

### Un document partagé avec le public (personnes sans compte)

Case « Le document est partagé avec le public, sans compte » de l'écran. Le partage public lui-même (rôle Éditeur) se règle dans « Partager » de Grist **par un propriétaire** ; Form Builder n'y touche pas. Ce que la case change :

- **« Tout le reste caché » devient obligatoire.** Un éditeur anonyme, sans cette règle, pourrait aussi modifier la structure (colonnes, tables, pages) des autres tables : le droit de schéma se retire par la règle posée sur tout le reste du document.
- **Personne n'est identifié** : le courriel ou le nom qu'on tape est déclaratif. Une règle « une seule réponse par personne » écarte les doublons d'une même adresse, pas une adresse inventée.
- **Pièces jointes** : un anonyme peut téléverser un fichier sans que les règles s'appliquent (mesuré le 18/10/2026, limite d'instance 10 Mo) ; l'écran le dit si le formulaire en comporte.
- **Le formulaire compte les places à partir de la colonne « Place »**, la seule lisible quand tout le reste est caché : elle ne dit rien d'une personne (Confirmé, Liste d'attente, Doublon). Une réponse en liste d'attente ou en doublon ne ferme donc pas le formulaire à tort.

### Ce qui est mesuré, ce qui ne l'est pas

Mesuré sur une instance Grist de service public (document d'essai) :

- les règles posées par actions sur `_grist_ACLResources` et `_grist_ACLRules` sont **analysées par le serveur** (la formule est comprise, un jeu invalide est refusé en bloc, sans écriture partielle) ;
- **Grist refuse une règle placée après une règle sans condition** dans la même ressource (« listed after default rule ») : la règle finale doit dire à la fois ce qui est permis et ce qui est refusé (`+C-RUDS`). Le planificateur le vérifie avant de proposer quoi que ce soit ;
- les anciennes mesures de la clé de lien (règles évaluées par l'API REST et par l'interface, clé à valider par un attribut d'utilisateur, lecture anonyme limitée aux lignes autorisées, mise à jour refusée sur les colonnes protégées) restent valables.

**Non mesuré, et à vérifier avec un compte de participant avant de s'y fier** :

- le comportement d'un éditeur **non propriétaire** devant ce jeu de règles : la forme est celle que Grist documente (colonnes précises, puis la table, puis le défaut ; un droit posé par la première règle qui le dit), mais je n'ai pas pu l'éprouver avec une autre identité ;
- qu'une lecture de la table par un participant (`fetchTable`) rende bien **seulement** les colonnes comptées, sans lever d'erreur ;
- le combiné `+C-RUDS` comme texte de droits (la forme est celle que l'interface de Grist écrit, non éprouvée ici) ;
- les règles lues par `loadTable('_grist_ACLRules')` depuis le widget en accès « complet » : si la lecture échoue, l'écran le dit et propose de poser les règles à la main.

## Ce qui n'est pas fait

- Le statut après l'envoi (« retenue », « liste d'attente », « doublon ») est livré : voir `LIMITES.md`. Il ne vaut que pour l'instant de l'envoi et aucun courriel n'est envoyé.
- Une table de « places » en lecture publique, qui permettrait d'afficher les places restantes sur une page hors de Grist, n'est pas livrée.
- Les pièces jointes restent impossibles hors de l'origine de Grist.

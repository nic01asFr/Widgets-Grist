# Où vit le formulaire, qui y répond, qui lit quoi

*Étude du 23/10/2026 pour le cas d'une inscription à des créneaux (places limitées, une seule réponse par personne, réponses des autres invisibles, statut visible par la personne). Sources : mesures des 18 et 23/10/2026 sur une instance Grist de service public avec des documents d'essai, et les notes `ENVOI-EXTERNE.md`, `EXPOSITION.md`, `SIGNALEMENT-PUBLIC.md`. Chaque ligne dit si c'est **livré**, **mesuré** ou **à mesurer**.*

## Les cinq façons de proposer le formulaire

| | **A. Page du document, personnes connectées** | **B. Page du document, accès public** | **C. Page du document embarquée dans un site tiers** | **D. Page hors Grist, par clé de formulaire** | **E. Hybride : écrire par clé, lire par un document public** |
|---|---|---|---|---|---|
| Qui répond | des comptes du même Grist, éditeurs du document | n'importe qui, sans compte (rôle Éditeur du public) | n'importe qui, si B | n'importe qui, sans compte | n'importe qui, sans compte |
| Identité de la personne | **fiable** : le courriel du compte (`meta.emailCol`, livré) | **déclarative** : ce que la personne tape | déclarative | déclarative | déclarative |
| Comment on écrit | l'éditeur ajoute une ligne | idem, filtré par règles d'accès | idem B | ajout par la clé, rien d'autre | idem D |
| Comment on empêche le reste | règles d'accès « ajout seul » (livré, **non mesuré avec un participant**) | règles d'accès avec **attribut utilisateur sur la clé de lien** (mesuré 18/10) | idem B | la clé n'écrit que des lignes, rien ne se lit ni se modifie (mesuré 18/10) | idem D |
| Places restantes affichées | oui, si les colonnes comptées sont lisibles par les participants | oui, si on laisse leur lecture à l'anonyme (restreinte aux lignes voulues, mesuré) | idem B | **non** : la clé ne lit rien | **oui** : une table de compteurs, sans aucun nom, lisible par tous *(à mesurer)* |
| Le formulaire se ferme seul quand c'est plein | oui | oui | oui | **non** : seule la table trie (« Liste d'attente ») | oui, lu dans les compteurs |
| La personne voit son statut (confirmé / liste d'attente) | oui avec « chacun voit sa ligne » (règle sur le courriel du compte) | **oui, mesuré** : l'ajout renvoie l'identifiant de la ligne et « Place » est lisible (reste à l'afficher) | idem B | non | idem B *(à mesurer)* |
| Voit les réponses des autres | **non si les règles tiennent** | non si les règles tiennent ; une erreur de règle ouvre un document en écriture publique | idem B | **jamais** (la clé ne lit pas) | non : seuls des compteurs sont publics |
| Pièces jointes, photo | oui | oui (10 Mo ; un anonyme peut téléverser **sans clé**, vecteur d'abus, mesuré) | idem B | **impossible** hors de l'origine Grist | impossible |
| Doublons | fiable (compte) ; la formule d'unicité tranche | déclaratif : la formule d'unicité tranche, une adresse inventée la contourne | idem B | idem B | idem B |
| Protection contre l'inondation | droits du compte | aucune limite d'envoi mesurée | idem B | **aucune** : seule la dépublication arrête (mesuré) | idem D |
| Mise en place | livrée | **livrée** : case « partagé avec le public » + règles posées par le bouton (mesuré le 23/10) ; le partage public reste au propriétaire | à mesurer | **livrée** (étape « Mettre en ligne ») | non livrée |

### À retenir de chaque mode

**A. Personnes connectées (le cas d'une équipe, d'un service).** C'est le seul mode où la personne est identifiée sans effort et sans possibilité de mentir : son courriel de compte. Il donne aussi toutes les fonctions (places restantes, statut, pièces jointes). Sa fragilité : les participants sont **éditeurs du document**. Tout repose sur les règles « ajout seul », qui n'ont pas été éprouvées avec un vrai compte participant (c'est l'essai qui manque le plus). Si une règle est mal posée, ils lisent tout.

**B. Accès public.** Le document est partagé en écriture avec « tout le monde », et **seules les règles d'accès** empêchent le reste. Mesuré : avec un attribut utilisateur sur la clé de lien, une clé inventée est refusée, une clé valide crée une ligne, modification et suppression sont refusées, et l'anonyme ne lit que les lignes autorisées. Mais : aucune identité de la personne ; une clé valide permet un envoi massif (aucune limite d'envoi mesurée) ; et un téléversement de pièce jointe n'est pas gardé par les règles. À réserver à un lien diffusé à un public maîtrisé (QR code, courriel).

**C. Embarquée dans un site tiers.** Mesuré : la page du document n'envoie **ni `X-Frame-Options` ni `frame-ancestors`**, donc rien ne l'empêche d'être placée dans une iframe. À mesurer : les cookies de session de Grist sont vraisemblablement ignorés dans une iframe d'un autre site (cookies tiers bloqués par les navigateurs), ce qui ferait voir la personne comme **anonyme** même si elle a un compte. Conséquence probable : l'embarquement ne vaut que pour le mode B, pas pour le mode A.

**D. Hors Grist, par clé.** La vraie portabilité : un fichier HTML déposé où l'on veut, une personne sans compte, aucune lecture possible. Prix : pas de places restantes, pas de fermeture automatique, pas de statut, pas de pièce jointe, et la clé n'est pas un secret.

**E. Hybride.** Écrire par la clé du formulaire (comme D) et **lire** les compteurs dans une table publique en lecture seule qui ne contient aucun nom : une formule qui compte les réponses par créneau et rien d'autre. La page peut alors afficher les places restantes et se fermer. Rien n'est livré ; à mesurer : la lecture anonyme d'une seule table (mesurée en B pour des lignes, pas pour ce schéma) et le statut de la personne par un jeton propre.

## Ce que chaque mode produit comme usages

| Besoin | Mode conseillé | Pourquoi |
|---|---|---|
| Inscription interne à un service, identité sûre, statut visible | **A** | seul mode où le courriel ne se falsifie pas |
| Public large sans compte, aucune lecture, aucun statut | **D** | le plus simple et le plus sûr ; on accepte la liste d'attente décidée après coup |
| Public sans compte qui doit voir les places restantes | **E** (ou B encadré) | la lecture publique se limite à des compteurs |
| Dépôt de photo ou de pièce jointe par le public | **B** | seule voie qui l'autorise, au prix des règles et du risque d'abus |
| Intégration dans un site existant | **B** en iframe, **D** en page | l'iframe d'une page du document ne marche vraisemblablement que sans compte |

## Les trois questions de la collègue, mode par mode

1. **« 10 places au total »** : tenu dans tous les modes par la formule « Place » (mesuré) ; la fermeture visible n'existe que si la page peut lire les comptes (A, B, E), pas en D.
2. **« Les gens ne voient pas les réponses des autres »** : D et E par construction ; A et B par les règles d'accès. **A est le mode demandé le plus probable (collègues du même Grist) et celui dont la garantie n'est pas mesurée.**
3. **« Une seule réponse par personne »** : tenu dans tous les modes par la formule d'unicité (mesuré). Fiable en A (courriel du compte), contournable ailleurs par une adresse inventée.

## Mesuré en réel le 23/10/2026 : mode B (document public en rôle Éditeur)

Document d'essai, formulaire d'inscription (10 réponses au plus, une seule réponse par courriel), règles posées par le bouton « Poser ces règles dans le document » avec la case « partagé avec le public », partage public en Éditeur, puis essais depuis une fenêtre **sans compte** (@Guest).

| Essai en anonyme | Résultat |
|---|---|
| Ouvrir la page du formulaire | s'affiche ; **« Complet » déjà annoncé** : le formulaire compte à partir de la colonne « Place », lisible |
| Lire la table des réponses | 200, **une seule colonne : « Place »** (aucun nom, aucun courriel, aucun choix) |
| Lire les autres tables | 403 « Blocked by table read access rules » (sauf les lignes qu'une ancienne règle d'un autre essai laissait lire) |
| Ajouter une réponse | **200** (la ligne est créée) |
| Modifier une réponse existante | **403** « Blocked by table update access rules » |
| Supprimer une réponse | **403** |
| Ajouter une colonne, une table, supprimer une autre table | **403** « Blocked by table structure access rules » |
| Écrire dans une autre table | **403** |
| Écrire une règle d'accès | **500** « Only owners can modify access rules » |
| Après le plafond : la 12e réponse | « **Liste d'attente** » (les 10 premières confirmées) |
| Même adresse en autre casse et avec des espaces | « **Doublon** », sans prendre de place |
| Lire le statut de sa propre ligne | **possible** : l'ajout renvoie l'identifiant de la ligne, et « Place » est lisible |

Ce que cela change à l'étude :
- Le statut visible après l'envoi (« confirmé » ou « liste d'attente ») **ne demande aucune règle de plus** en mode B : le formulaire relit « Place » de la ligne qu'il vient d'ajouter. Il reste à l'afficher.
- Le droit de modifier la structure est bien retiré par la règle posée sur tout le reste du document : c'est l'élément que la case « partagé avec le public » rend obligatoire.
- Une règle de document **déjà présente** qui ferme le reste aux non-propriétaires n'empêche plus de poser les règles du formulaire : elle est gardée telle quelle.
- **Reste vrai** : un anonyme peut ajouter autant de lignes qu'il le veut (aucune limite d'envoi) ; l'unicité par courriel ne retient pas une adresse inventée ; l'accès public a été remis à « Désactivé » après l'essai.

## Ce qu'il reste à mesurer, par ordre d'utilité
1. Un compte participant **connecté** (éditeur non propriétaire) sous les mêmes règles : le mode B est mesuré en anonyme, pas le mode A. Les règles étant les mêmes, le résultat devrait l'être aussi, mais ce n'est pas mesuré.
2. Une iframe de la page du document dans un site tiers, avec et sans compte (cookies).
3. Une table de compteurs lue par un anonyme, et le statut par jeton dans l'adresse (**E**, et statut en **B**).
4. L'écriture d'une ligne par la clé du formulaire depuis une page qui annonce le créneau choisi (aller-retour sans lecture).

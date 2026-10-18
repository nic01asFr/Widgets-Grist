# Envoyer un formulaire depuis une page hors de Grist

*Note de référence, 18/10/2026. Mesurée sur une instance Grist de service public, avec un document d'essai et des données fictives. Le mode décrit ici est livré (étape « Mettre en ligne » du compositeur, `shared/externe.js`) ; les mesures valent pour l'instance testée.*

## L'idée

Form Builder crée un formulaire **natif** de Grist sur une table de réception. La clé de ce formulaire, publiée dans une page, est le seul moyen d'y **ajouter** des lignes. Le moteur de Form Builder sert l'interface (étapes, conditions, adresse, carte) ; Grist garde les données ; des formules dérivent le reste. Une personne sans compte peut répondre ; personne ne peut rien modifier d'autre.

## Ce que la clé permet, et interdit (mesuré)

| Action | Résultat |
|---|---|
| Ajouter une ligne dans la table du formulaire, depuis une autre origine | accepté |
| Écrire une colonne **absente** de la mise en page du formulaire | accepté |
| Écrire une colonne à formule | refusé (400) |
| Écrire dans une autre table | refusé (403) |
| Lire la table, lire une autre table, SQL | rien / refusé |
| Modifier ou supprimer une ligne (`/apply`) | refusé (403) ; seuls les ajouts passent |
| Valeur hors liste, hors bornes, champ obligatoire vide | **accepté** |
| 20 envois en rafale ; corps jusqu'à 900 Ko | acceptés ; 1,2 Mo refusé (413) |
| Pièce jointe depuis une autre origine | **impossible** : l'envoi du fichier est lié à une session par cookie, bloqué hors de l'origine Grist |

Une colonne absente d'un envoi prend sa valeur par défaut (0 pour un nombre) ; un `null` explicite est conservé.

## Ce qu'on en tire

1. **La table de réception ne contient que ce que la personne peut remplir.** La clé écrit toute colonne non formule, même hors formulaire. Statut, réponse et notes internes vivent dans une autre table, liée par référence.
2. **Le serveur ne contrôle rien : les formules trient.** Une colonne `Motifs` liste ce qui ne va pas (adresse absente, commune hors périmètre, valeur hors liste, reçu déjà utilisé), une colonne `Conforme` en découle. L'envoi invalide est enregistré mais écarté.
3. **Les règles d'accès ne protègent pas ce chemin.** Les règles de l'utilisateur ne s'appliquent pas aux envois par clé de formulaire, et une règle par défaut posée sur la ressource vide d'un document neuf est ignorée en silence. Ne rien faire reposer dessus pour l'écriture.
4. **La clé n'est pas un secret.** Elle est dans la page qui l'utilise ; la chiffrer n'apporte rien. On l'invalide en supprimant le partage, ce qui coupe tous les clients. Il n'y a aucun quota : seule la dépublication arrête une inondation.

## Le cas « signalement »

Une personne tape une adresse et choisit dans la liste de la Base adresse nationale. Le moteur envoie l'adresse, son **code INSEE** et ses coordonnées. Dans la table, des formules font le reste :

```python
# CommuneRetenue (Ref:Communes)
Communes.lookupOne(Code=$CodeInsee) if $CodeInsee else Communes.lookupOne(id=$Commune)
# Agent (Ref:Acces), routé par la commune
Acces.lookupOne(Commune=$CommuneRetenue, Role='agent', Actif=True)
# Premier (Bool), doublon de reçu
bool($Recu) and $id == min(r.id for r in Signalements.lookupRecords(Recu=$Recu))
```

Mesuré avec trois envois : un habitant d'Abbeville et un d'Amiens arrivent chez le bon agent, conformes ; une adresse tapée sans être choisie n'a pas de code INSEE et reste marquée « commune hors périmètre ».

C'est ce que ni le formulaire natif (pas d'adresse certifiée, pas de code) ni le widget dans Grist (exige un accès au document) ne permettent.

## Ce qui est livré

- **`shared/externe.js`** — `planExterne` (le schéma), `buildExternalDocument` (la page autonome), `lireAdresseFormulaire` (la clé, lue dans le lien du formulaire publié).
- **La table de réception** ne contient que ce que la personne remplit, plus `Recu`, `Premier` (premier envoi de ce reçu), `Motifs` (ce qui ne va pas) et `Conforme`.
- **La table `<table>_Traitements`**, privée : `Reception` (référence), `Statut`, `Reponse`, `Interne`. La réception affiche `StatutAffiche` et `ReponseAffichee` : la personne qui a son reçu
  peut les lire, jamais les notes internes.
- **La page** envoie par la clé avec un reçu aléatoire, lit l'adresse de la page (`shared/prefill.js`), contrôle les formats (`shared/formats.js`) et peut compléter un lieu (`shared/enrichir.js`).

Épreuve en Grist réel : un envoi en règle est conforme ; un objet inventé, une valeur hors liste, une gravité hors bornes et un IBAN faux sont démasqués, y compris par un client qui contourne
l'interface ; un reçu rejoué est signalé ; la clé ne peut pas écrire dans la table de traitement (403) ; le statut posé par un agent remonte sur la ligne reçue.

## À savoir

- Parcourir une relation dans une règle d'accès (`rec.Commune.Zone`) échoue en silence ; une colonne à formule scalaire (`Zone = $Commune.Zone`) contourne.
- La lecture en retour (suivre son signalement par son reçu) demande de rendre le document public en lecture, avec des règles par clé de lien. Mesuré possible, non livré.

### Règles par clé de lien : la clé doit être validée

Mesuré par une autre session sur un document jetable (accès public remis à Désactivé ensuite). Une clé de lien (`?cle_=`) est lue par les règles d'accès (`user.LinkKey`), en REST comme dans l'interface.

- **Une règle qui compare seulement `newRec.cle_lien == user.LinkKey.cle` accepte une clé inventée** : la clé fournie est égale à elle-même. Il faut vérifier qu'elle existe.
- **Ce qui marche** : un attribut utilisateur déclaré sur la ressource `*` / `*` (pas la ressource vide, ignorée), qui retrouve la ligne de clé : `{"name": "Cle", "tableId": "Cles", "lookupColId": "cle", "charId": "LinkKey.cle"}` (le champ s'appelle `lookupColId`), puis une règle de création : `user.Cle.Actif and newRec.cle_lien == user.Cle.cle and newRec.Statut != "valide"`.
- **Résultats** : clé inventée refusée (403), clé valide acceptée (200), `cle_lien` d'un autre arrêt refusé, `Statut` « valide » forcé refusé, appel sans clé refusé, modification et suppression refusées, lecture anonyme limitée aux lignes validées, table des clés illisible, révocation (`Actif = false`) qui coupe la clé aussitôt.
- **Une clé imprimée sur un QR est publique de fait.** La règle écarte l'usage maladroit et la requête forgée sans clé ; elle n'arrête pas quelqu'un qui scanne le QR puis automatise ses envois. La protection réelle est la modération par statut, les colonnes de contrôle par formule, le plafond de photo de l'instance et la révocation d'une clé par arrêt.
- **Photos** : la limite d'instance est de 10 Mo, mais le téléversement d'une pièce jointe (`POST /attachments`) n'évalue pas les règles, seulement le droit d'écriture : un anonyme peut téléverser sans clé, d'où des pièces orphelines. Une ligne qui porte une photo n'est acceptée que depuis la session qui l'a téléversée ; la photo d'une ligne non validée n'est lisible par personne.
- **Non testé** : le niveau « exploiter », le widget dans une page Grist (websocket), une rafale de téléversements.
- Une référence **inventée** est vraie pour Grist mais n'a pas d'identifiant ; une référence vide est fausse. La formule le distingue.
- Les services qui complètent un lieu (adresse, commune, bâtiment, altitude, risques) répondent depuis une page d'une autre origine ; leur licence n'est pas relevée ici.
- Le résultat vaut pour l'instance testée.

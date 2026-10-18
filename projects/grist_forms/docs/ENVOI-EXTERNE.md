# Envoyer un formulaire depuis une page hors de Grist

*Note d'étude, 18/10/2026. Mesurée sur une instance Grist de service public, avec un document d'essai et des données fictives. Rien de ce qui suit n'est livré : c'est ce qui a été constaté, et ce qu'on en conclut pour un éventuel mode « externe » de Form Builder.*

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

## À savoir

- Parcourir une relation dans une règle d'accès (`rec.Commune.Zone`) échoue en silence ; une colonne à formule scalaire (`Zone = $Commune.Zone`) contourne.
- La lecture en retour (suivre son signalement par son reçu) demande de rendre le document public en lecture, avec des règles par clé de lien. Mesuré possible, non livré.
- Le résultat vaut pour l'instance testée.

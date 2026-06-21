# GENCI — Formulaire de décisions (avant implémentation)

> But : trancher de façon **fiable** les derniers choix, en langage d'usage.
> **Comment répondre** : pour chaque question, **entoure une option**. En cas de doute, **prends la reco (en gras)** : l'ensemble des recos forme une base **cohérente, générique et sûre**.
> Colonne « Qui » : 🟢 = tu peux décider seul · 🔵 = à valider avec JPP.

---

## ✅ RÉPONSES RETENUES (nic01asfr, 2026-06-18)

| Q | Choix | Détail |
|---|---|---|
| Q1 | **A** | Unités nommées multi-niveaux (`Entites`) |
| Q2 | **A** | Niveaux configurables / libres |
| Q3 | **A** | Action = dernier niveau de tâche (type) |
| Q4 | **A** | Portefeuille = regroupement simple de projets |
| Q5 | **A** | Un seul chef par personne (arbre). *NB : l'autorité projet reste gérée à part (`Projects.responsable`) → cas hiérarchie+projet déjà couvert. Bascule en B seulement si double affectation ORGANIQUE (membre de 2 unités à la fois).* |
| Q6 | **B** | Organigramme = **widget dédié** (pas le mode Whiteboard) — pilier « Org/pilotage » autonome |
| Q7 | **A → B → C** | Respect des droits → schéma annuaire + import → règles ACL ; maquette org-chart (D) en parallèle |

🔵 À confirmer avec JPP : Q1, Q3, Q4, Q5 (les choix ci-dessus = direction de travail retenue en attendant).

---

## Q1 — Décrire l'organisation : unités nommées ou juste « qui est le chef de qui » ? 🔵
*Veux-tu modéliser des **unités** (Direction › Service › Équipe…) comme objets nommés, ou seulement la **chaîne de management** ?*

- **A) Unités nommées multi-niveaux** *(table `Entites`)* — permet organigramme, **charge par équipe**, portefeuilles. ✅ **Reco** (GENCI veut charge par équipe + portefeuilles).
- B) Juste la chaîne de management *(une colonne « responsable » sur les personnes)* — plus simple, suffit pour les **droits** seuls.

**Réponse : ____**

---

## Q2 — Niveaux de hiérarchie : libres ou fixes ? 🟢
*Veux-tu **nommer/ajouter librement** tes niveaux (direction, service, brigade, cellule…) ?*

- **A) Configurables / libres** — s'adapte à toute structure, **aucun coût**. ✅ **Reco**.
- B) Jeu fixe imposé — plus rigide, aucun intérêt ici.

**Réponse : ____**

---

## Q3 — Une « action », c'est quoi ? 🔵
*L'« action » est-elle simplement le **dernier niveau de tâche** (une mini-tâche), ou un **objet vraiment différent** d'une tâche ?*

- **A) Dernier niveau de tâche** *(type « action » dans la même mécanique)* — simple, générique, n'importe quelle profondeur. ✅ **Reco**.
- B) Objet séparé *(table `Actions` distincte)* — plus rigide, casse plus facilement « la logique pour le plus grand nombre ».

**Réponse : ____**

---

## Q4 — Le « portefeuille », comment le ranger ? 🔵
*Le portefeuille = un **regroupement de projets** au-dessus des projets.*

- **A) Regroupement simple de projets** *(chaque projet pointe vers son portefeuille)* — léger, lisible. ✅ **Reco**.
- B) Niveau supplémentaire dans la grande hiérarchie de travail — plus intégré, mais plus lourd.

**Réponse : ____**

---

## Q5 — Double rattachement (matrice) ? 🔵
*Une personne peut-elle dépendre de **deux chefs en même temps** (hiérarchique **et** fonctionnel/projet) ?*

- **A) Un seul chef par personne** *(arbre)* — simple, couvre l'immense majorité des cas. ✅ **Reco** (on garde la porte ouverte pour la matrice plus tard, sans la coder).
- B) Plusieurs chefs *(matrice)* — nécessaire seulement si c'est un vrai besoin GENCI maintenant.

**Réponse : ____**

---

## Q6 — Vue organigramme ? 🔵
*Veux-tu une **vue organigramme** orientée **pilotage de la répartition** (voir où est la charge dans l'organisation, par équipe, avec drill vers le Plan) ?*

- **A) Oui — on la prototype d'abord** *(en réutilisant le moteur Whiteboard : rapide)*. ✅ **Reco** (on juge la valeur sur une maquette avant d'investir).
- B) Oui — mais widget dédié séparé *(plus de travail)*.
- C) Non / plus tard — la gestion en table native + le Plan suffisent.

**Réponse : ____**

---

## Q7 — On commence par quoi ? 🔵
*Périmètre du **1ᵉʳ incrément** livrable.*

- **A) « Respect des droits » d'abord** *(les widgets gèrent proprement lecture seule + refus d'écriture)* — fondation robuste, **utile à tout le monde**, indépendante des autres choix. ✅ **Reco (étape 1)**.
- B) Schéma annuaire + import *(créer la hiérarchie, importer la liste agents)* — **Reco (étape 2)**.
- C) Les règles de droits *(ACL)* — **Reco (étape 3)**.
- D) Maquette organigramme *(exploratoire)* — en parallèle, sans rien engager.

**Réponse (ordre souhaité) : ____**

---

## Tests préalables (pas une décision — info)
- 🔬 **Sonde « utilisateur connecté »** : vérifier ce que Grist expose au widget sur l'utilisateur connecté (conditionne « afficher MES tâches / ce que JE peux modifier »). Lecture seule, sans risque. → **je peux la lancer dès que tu veux.**

---

## Raccourci « je fais confiance aux recos »
Si tu coches **toutes les recos** : `Entites` nommées + niveaux libres + action = type + portefeuille = regroupement simple + arbre (pas matrice) + org-chart prototypé via Whiteboard + démarrage par le respect des droits. → **base cohérente, générique, non destructive**, prête à dérouler.

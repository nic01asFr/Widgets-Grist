# Consignes — resynchroniser et publier TaskFlow

> Document autonome. Tu n'as pas besoin d'historique de conversation : tout le
> contexte nécessaire est ici. Les chiffres ont été vérifiés le 2026-08-04.

## 1. Situation

TaskFlow a **deux lignées divergentes** depuis le 7 juin 2026 : du travail existe
des deux côtés, et aucun des deux ne connaît l'autre.

| | Commits | Contenu |
|---|---|---|
| **Local** (`draft`), non publié | 16 | Lot 3 GENCI (organigramme, annuaire, ACL dérivée), CRA feuille de temps, Plan réalisé daté, filtre de niveau, respect ACL sur les 7 widgets, passe UX/UI |
| **Distant** (`origin/main`), absent du local | 4 | merge du 07/06, checklist éditable, publications **v1.1.1** et **v1.1.2** (whiteboard harmonisé) |

Le dossier `published/taskflow/` diffère aussi :

```
kanban     : DIFFÉRENT      dashboard : identique
gantt      : DIFFÉRENT      plan      : identique
calendar   : DIFFÉRENT
whiteboard : DIFFÉRENT
```

**Enjeu** : le travail local relève d'une prestation financée (GENCI). Il n'est ni
sauvegardé, ni partagé, ni déployé — il n'existe que sur ce poste.

## 2. Le piège à éviter — leçon vécue sur Atlas

Atlas a connu **exactement** cette divergence, née le même jour et par le même
mécanisme (une publication faite via un worktree, jamais resynchronisée : on
reconnaît des **commits jumeaux**, même message, empreinte différente, à une ou
deux minutes d'écart).

Résultat : une refonte locale a été publiée en écrasant la version en ligne, et
**deux fonctionnalités livrées ont disparu sans que personne ne s'en aperçoive**
(export QGIS, pièce jointe `model_glb`). Personne ne l'a vu pendant trois mois.

**Donc : le diagnostic passe avant la fusion.** Il faut savoir ce que la version
en ligne sait faire et que le local ne sait pas, *avant* d'écraser quoi que ce soit.

## 3. Méthode imposée

**Travaille dans un worktree isolé, jamais dans le working tree local.**

Le dépôt local porte des modifications non commitées sur `tasks_app`,
`qgis2grist`, `whiteboard`, `package.json`, et des dossiers entiers jamais
versionnés (`projects/budget_app`, `projects/girabase`, `projects/zebra`,
`docs/`, `backups/`…). Y basculer de branche est risqué.

```bash
git fetch origin
git worktree add <chemin_hors_repo> -b resynchro/taskflow origin/main
```

## 4. Étapes

### Étape 1 — Diagnostic (obligatoire, avant toute fusion)

Produis un tableau comparatif **fonctionnalité par fonctionnalité** entre la
version en ligne et la version locale, pour les 6 widgets (kanban, gantt,
calendar, dashboard, plan, whiteboard).

Cherche en priorité **ce que la version en ligne a et que le local n'a pas** —
c'est le seul cas qui provoque une régression invisible. Méthode qui a marché :
compter les occurrences de marqueurs fonctionnels dans les deux versions
(`grep -c` sur des noms de fonctions ou de champs caractéristiques), puis
vérifier manuellement chaque écart.

Identifie aussi les **commits jumeaux** — même intitulé des deux côtés. Ils ne
doivent pas être rejoués deux fois.

**Livrable** : un tableau des écarts, et pour chacun une décision explicite —
conservé, porté, ou abandonné en connaissance de cause.

### Étape 2 — Fusion

Rejoue le travail local par-dessus `origin/main` (cherry-pick des commits
utiles). Attention :

- `published/taskflow/` sur `origin/main` contient les versions **v1.1.1 / v1.1.2**
  déployées : ne les écrase pas sans avoir vérifié l'étape 1 ;
- `HARMONIZATION.md` n'existe que localement ;
- si un conflit porte sur `published/`, régénère plutôt que de résoudre à la main :
  la source fait foi (`npm run build:taskflow` puis promotion).

### Étape 3 — Vérifications avant publication

1. **Tests** : `node --test projects/Atlas/tests/*.test.js` doit rester vert
   (153 tests) — TaskFlow n'a pas de harnais propre, ne casse pas celui d'Atlas.
2. **Build** : `npm run check:taskflow` (le core commun est inliné dans les
   6 fichiers ; ils doivent rester en phase).
3. **Grist réel** : ouvre les widgets dans un document et vérifie au minimum
   kanban, plan, et l'organigramme/CRA du Lot 3. Les tests unitaires ne voient
   pas les défauts de rendu — sur Atlas, cinq bugs n'ont été trouvés qu'à l'écran.

### Étape 4 — Publication

Circuit éprouvé : branche `publish/*` → PR → `main` → CI → GitHub Pages.

```bash
git push -u origin publish/taskflow-<version>
# puis ouvrir la PR sur GitHub (gh n'est pas authentifié sur ce poste)
```

## 5. Interdits et pièges

- **Ne jamais** `git push --force` : `origin/main` porte du travail publié.
- **Ne pas régénérer `published/manifest.json`** sans nécessité. Sans la variable
  d'environnement, le script réécrit toutes les URLs en `VOTRE_USER` :
  utiliser `GITHUB_USER=nic01asfr npm run manifest`. Et vérifier que la
  régénération n'embarque pas des modifications d'autres projets non commitées
  (c'est le cas aujourd'hui pour `published/qgis2grist/package.json`, passé en
  v2.0.0 sans être commité).
- **Ne pas embarquer les autres projets** dans les commits : le working tree est
  sale sur `qgis2grist`, `whiteboard`, `budget_app`. `git add` sélectif, toujours.
- **Ne pas supposer qu'un test vert suffit.** Vérifie à l'écran.

## 6. Livrables attendus

1. Le tableau de diagnostic de l'étape 1, avec les décisions.
2. Une branche `publish/taskflow-<version>` poussée, prête à PR.
3. Un compte rendu disant explicitement : ce qui a été publié, ce qui a été
   abandonné et pourquoi, ce qui n'a pas pu être vérifié.

## 7. Après la publication

Resynchroniser le dépôt **local** avec `origin/main`, sinon la divergence
repartira immédiatement. C'est la cause racine : deux publications par worktree
(7 juin, 30 juillet) sans rapatriement.

Mettre à jour `projects/tasks_app/ROADMAP_GENCI.md` (document maître de l'état
par chantier) et la note WikiChat du projet « Widgets Grist ».

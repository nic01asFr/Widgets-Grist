# Tests manuels — grist_forms (Form Builder v1 + phase 2 + audience)

> **Statut** : produit terminé en repo ; validations live filtres A/B/C + audience/publish sur `grist.numerique` (2026-07-28).
> Scénarios ci-dessous = checklist de non-régression manuelle, avec parcours détaillé **audience + publish + republish**.

---

## 1. Ouvrir le builder

| Mode | URL / commande | Notes |
|------|----------------|-------|
| **serve-dev** (recommandé) | `npm run serve:dev` → `http://localhost:3001/grist_forms/builder.html` | Publish peut bundler `shared/` |
| **Widget Grist** | URL serve-dev ci-dessus, accès widget **full** | Ex. doc test `grist.numerique` |
| **file://** | `projects/grist_forms/builder.html` | Démo OK ; publish échoue au `fetch` |
| **GH Pages** | après promote explicite vers `published/` | Pas encore promu par défaut |

Badge attendu dans Grist : **Connecté à Grist** (pas « Mode démo »).

---

## 2. Checklist mode démo (hors Grist)

- [ ] Badge **Mode démo**
- [ ] Wizard Créer / Brancher + templates
- [ ] Bool, ChoiceList, gate section
- [ ] Aperçu : navigation multi-étapes
- [ ] Publication simulée sans erreur console

---

## 3. Préparation document Grist (`grist.numerique`)

### Tables minimales

| Table | Colonnes | Rôle |
|-------|----------|------|
| **Formulaires** | auto (widget builder) | Stockage FormDef |
| **Contacts** | `Nom` (Text), `Email` (Text), `Groupe` (Choice) | Audience |
| **Reponses_…** | via ensureSchema ou manuel | Réponses du questionnaire |

### Données audience (`Contacts`)

| Nom | Email | Groupe |
|-----|-------|--------|
| Vous (compte Grist) | *votre email réel* | `Agents` |
| Alice | `alice@example.com` | `Public` |
| Bob | `bob@example.com` | `Internes` |

> **Important** : pour tester la reconnaissance automatique, une ligne doit porter **votre** email Grist.

---

## 4. Parcours audience (Accueil + conditions)

### 4.1 Configuration Accueil

1. **Questions** → section **Accueil**
2. Cocher **Réserver des questions à certaines personnes ou groupes**
3. Vérifier détection auto : table `Contacts`, colonnes `Email` / `Groupe`
4. Survoler les `?` → infobulles lisibles
5. Cocher **Reconnaître la personne connectée**
   - [ ] Toast : formule appliquée sur `Contacts.Email`
   - [ ] Message : « Colonne email prête… »
   - [ ] Dans Grist (Raw data → `_grist_Tables_column` ou UI colonne) : formule `user.Email`, trigger **nouvelles lignes uniquement**

### 4.2 Conditions sur questions

6. Sur une question réservée aux agents :
   - Cocher **Afficher cette question seulement si…**
   - Source **Audience → Groupe** ; opérateur **dans** ; valeur `Agents`
   - [ ] Infobulle source / opérateur / valeur au survol `?`
7. Sur une question publique (inverse) :
   - Source **Audience → Groupe** ; opérateur **pas dans** ; valeur `Agents`
8. Sur la 1ʳᵉ question (optionnel) :
   - Source **Contexte → Dans le widget Grist** = **Oui**

### 4.3 Aperçu builder (étape 3)

9. **Actualiser** l’aperçu
   - [ ] Connecté dans Grist : question « Agents » visible si votre ligne Contacts a `Groupe=Agents`
   - [ ] Question exclue si groupe différent
10. **Enregistrer** → `Formulaires.Def` contient `audience` + conditions

---

## 5. Publish + fill + republish (`grist.numerique`)

### 5.1 Première publication

1. **Mettre en ligne** (étape 4)
2. [ ] Log sans erreur ; page **Remplir …** créée
3. [ ] Ligne `Formulaires` : `Statut=publie`, `Version` incrémentée
4. Ouvrir la page publiée (pas le builder)
5. Remplir et **Envoyer**
   - [ ] Ligne créée dans la table réponses
   - [ ] Types OK (Bool, ChoiceList `['L',…]`, Date en secondes, Ref ids)

### 5.2 Republish après modification

6. Retour builder → modifier titre Accueil ou ajouter une question
7. **Enregistrer** puis **Remettre en ligne**
   - [x] Alerte « version déjà en ligne » affichée
   - [x] `Version++` dans `Formulaires`
   - [x] **Aucune page de plus** : `PublishedSectionRef` inchangé (vérifié 04/10/2026, section 15 réutilisée)
   - [x] La page porte le titre du formulaire, pas « New page »
8. Rouvrir la page **Remplir …**
   - [x] Modifications visibles (titre, nouvelle question)
   - [ ] Conditions audience toujours actives

### 5.4 Ajout vs correction de ligne (04/10/2026)

Table cible avec des lignes existantes, curseur sur la ligne 1.

9. Par défaut (case « Corriger la ligne sélectionnée » décochée)
   - [x] Le bouton dit **Envoyer** et aucune mention de ligne n'apparaît
   - [x] Envoyer **ajoute** une ligne ; les lignes existantes sont intactes
10. Case cochée, **Enregistrer** puis **Remettre en ligne**
   - [x] La page affiche « Modification de la ligne #1 » et les champs sont **préremplis**
   - [x] Enregistrer met à jour cette ligne, et les colonnes absentes du formulaire gardent leur valeur
   - [ ] Sur la ligne vierge (bas de la table), le formulaire revient à la création (`onNewRecord`)

### 5.3 Non-régression publish

- [ ] Bundle runtime inclut `session-context.js`
- [ ] Pas d’erreur console sur la page publiée
- [ ] Soumission OK après republish

---

## 6. Autres scénarios (régression)

### Composition / chemins

- [ ] Gate / **condition d’étape** : étape suivante sautée si condition fausse
- [ ] Condition champ ET/OU (infobulles combinaison)
- [x] Cascade Ref → liste enfant filtrée (cas B live : Bretagne → Rennes/Paris, PACA → Marseille)
- [x] Filtre dynamique Choice/Text → colonne table liée (cas A live : Groupe Agents → Contacts 1,2)
- [x] Filtre dynamique cas C : Ref Contacts → lit `Groupe` → filtre Contacts sur `Groupe` (Nicolas Agents → ids 1,2 ; Bob Internes → id 3)
- [x] Config **manuelle UI** cas C (clics builder : checkbox filtre + 3 selects, badge « Filtre ← Contact.Groupe ») — E2E `live-ui-case-c`
- [x] Config **manuelle UI** cas A (Choice Groupe + filtre Ref) — E2E `live-ui-case-a`
- [x] **Publish + fill** cas C via UI (bouton « Mettre en ligne », runtime bundle, AddRecord Grist) — E2E `live-ui-case-c`
- [ ] `visibleCol` sur Ref après save

### Attachments

- Widget fichier + colonne `Attachments` : OK schéma / UI
- Upload vue custom cross-origin : **CORS** (différé — voir `CLAUDE.md`)

---

## 7. Points de vigilance

| Sujet | Statut |
|-------|--------|
| Audience + probe auto | `audience-setup.js` pose formule à la coche |
| Conditions = UX seulement | ACL Grist = sécurité réelle |
| Cascade runtime | Câblée dans `Engine.mount` |
| Publish `file://` | Échec attendu (fetch bundle) |
| Tests auto | `node --test projects/grist_forms/tests/*.test.js` → **87 tests** |

---

## 8. Critères de succès

- [x] Save FormDef → table Formulaires
- [x] ensureSchema crée table/colonnes
- [x] Publish vue custom intra-doc
- [x] Fill AddRecord (types de base)
- [x] Cascade + visibleCol méta
- [x] Projection Survey Manifest
- [x] Audience bind + conditions (code + doc)
- [x] Structure `published/grist_forms/` + `npm run promote:grist-forms`
- [x] Audience + publish + republish validés live (`grist.numerique`, 2026-07-28 — E2E `live-audience`)
- [ ] Upload PJ custom cross-origin (différé)

Guide opérateur : `docs/PUBLICATION.md`.

---

## 9. Prochaine étude (hors ce repo — cadré)

Spec **binding BlockNote formulaires** : `docs/superpowers/specs/2026-07-29-form-binding-blocknote-cerema-design.md`  
Parallèle carto (Scene Manifest) ; blocs BlockNote dans **cerema-offre-de-service** / qgis-sspcloud.  
Référence technique ici : FormDef, ensureSchema, engine, publish, survey-project.js, pont QGIS.

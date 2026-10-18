# Audit d'ergonomie et d'accessibilité

Un audit se refait à chaque nouvelle saisie. Il ne remplace ni un essai avec de vraies personnes, ni un lecteur d'écran réel : il attrape ce qui se mesure.

## Méthode

1. Servir `projects/grist_forms`, ouvrir `demo/index.html`.
2. Monter **tous les composants dans un seul formulaire** : réunir les champs des six cas de la démonstration, ajouter ceux qu'ils n'emploient pas (`number`, `checkbox`, `date`, `heure`, `likert`), retirer les conditions, monter avec `FormEngine.mount(hote, def, { skipProbe: true })` dans un `div` sans fond forcé.
3. Charger **axe-core** (4.10.0, cdnjs) dans la page et lancer `axe.run('#hote')`, en clair puis en sombre (émulation de `prefers-color-scheme`).
4. Mesurer ce qu'axe ne voit pas :
   - le **contraste du texte** calculé sur le fond composé de tous les ancêtres ;
   - le **focus visible** : `outline` ou `box-shadow` qui change à `focus()` ; un bouton désactivé n'est pas fautif ;
   - les **attributs de clavier** (`inputmode`, `autocomplete`) des champs de saisie ;
   - le **comportement des erreurs** : envoyer un formulaire incomplet, vérifier `aria-invalid`, `aria-describedby`, le résumé annoncé, la place du focus et la visibilité du résumé sous la barre de progression collante.
5. Refaire aux largeurs de `docs/ECRANS.md`.

## État (18/10/2026, 44 champs, 6 cas de la démonstration)

| Point | Avant | Après |
|---|---|---|
| axe-core, règles d'accessibilité | 1 anomalie (repère de la bibliothèque de carte, hors de notre code) | idem |
| Contraste du texte, mode clair | 0 insuffisant | 0 |
| Contraste du texte, mode sombre | **19** insuffisants (rouge d'erreur 2,95:1 ; boutons à fond clair sous texte clair 2,3:1) | **0** |
| Focus visible | tous les contrôles actifs | idem |
| Clavier du téléphone | courriel et téléphone en clavier de texte | clavier du courriel, du téléphone, du code postal, pavé numérique ou décimal selon le format et le type |
| Erreurs | message affiché mais ni `aria-invalid`, ni message relié, ni résumé, focus inchangé, première erreur à 8 000 px | champ invalide et relié à son message, résumé annoncé (`role="alert"`), focus dessus, un lien par question qui amène au champ |

Les tests de ces points sont dans `tests/ux-finition.test.js`. Ils lisent le HTML produit et la feuille de style ; les contrastes réels et le focus se mesurent dans un navigateur.

## Ce que l'audit ne couvre pas

- **Un essai avec de vraies personnes**, en particulier des agents non experts : le libellé des erreurs, l'ordre des questions, la lisibilité d'une grille de classement ou d'une matrice d'échelles.
- **Un lecteur d'écran réel** (NVDA, VoiceOver, TalkBack) : axe vérifie les règles, pas l'écoute.
- **Un parcours complet au clavier**, étape par étape.
- **Tailles de texte** : plusieurs textes secondaires font 12 à 13 px, sous les 14 px du plancher du kit.
- **Position, caméra et micro** dans l'iframe d'un widget Grist.
- **Le cache du navigateur** : la démonstration lit ses cas par `fetch` ; après une modification d'un cas, recharger en vidant le cache, sinon on mesure l'ancien.

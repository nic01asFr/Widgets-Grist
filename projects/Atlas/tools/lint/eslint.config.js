// Configuration ESLint minimale d'Atlas (outillage isole : voir package.json de ce dossier).
// Objectif : un ETAT DE REFERENCE chiffre, pas une reecriture. Les regles
// "erreur" sont celles qui attrapent de vrais bugs ; le reste est en avertissement.
//
// Dependances de developpement a ajouter au package.json si adoptee :
//   (deja declarees dans ce dossier : `npm install` ici)
//
// Usage (depuis la racine du depot) : npm run lint:atlas
//   ou, dans ce dossier : npm run lint
import js from '@eslint/js';
import globals from 'globals';

export default [
  // Fichiers qu'on ne lint jamais : vendus, generes, a octets exacts.
  {
    ignores: [
      '**/vendor/**',
      '**/node_modules/**',
      'published/**',
      '**/client-hote.js', // genere, octets exacts (empreinte)
      '**/essais-*/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, grist: 'readonly', maplibregl: 'readonly', SunCalc: 'readonly' },
    },
    rules: {
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      eqeqeq: ['warn', 'always', { null: 'ignore' }],
      // Dette connue : tolere en etat de reference, resserrer ensuite.
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  // pont.js ET client.js alimentent le client hote en un seul fichier, dont l'empreinte est epinglee par les hotes (le generateur
  // en inscrit les empreintes dans l'en-tete) : ces deux fichiers ne se modifient pas pour une regle de style, seulement avec une nouvelle
  // VERSION_CLIENT annoncee aux hotes. On y desactive les regles de nettoyage, jamais celles qui attrapent de vrais bugs.
  {
    files: ['**/lib/bi/pont.js', '**/lib/bi/client.js'],
    rules: { 'no-useless-assignment': 'off', 'preserve-caught-error': 'off' },
  },
  // Les tests tournent sous Node uniquement.
  {
    files: ['**/tests/**'],
    languageOptions: { globals: { ...globals.node } },
  },
];

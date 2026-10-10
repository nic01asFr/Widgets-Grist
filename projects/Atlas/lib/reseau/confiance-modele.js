/**
 * Modèle de confiance appris par tools/calibrer-confiance.mjs (ne pas éditer à la main).
 * Appris sur 167035 tronçons de 20 départements, contre une vérité de routage (voir docs/DONNEES-IGN.md).
 */
export const MODELE_CONFIANCE = {
  "version": "confiance-2026-10-09",
  "caracteristiques": [
    "postMoy",
    "espObs",
    "nChoisi",
    "dMoy",
    "voisines",
    "marge",
    "longueur",
    "part",
    "parcouru",
    "continuite",
    "couverture",
    "ruptures"
  ],
  "moyenne": [
    0.46739,
    1.776129,
    1.765455,
    0.446314,
    0.719881,
    0.021936,
    0.652143,
    0.959425,
    0.644493,
    0.973455,
    0.978356,
    0.949928
  ],
  "ecartType": [
    0.258153,
    0.963153,
    0.996131,
    0.166443,
    0.395321,
    0.330235,
    0.193131,
    0.162746,
    0.186299,
    0.127909,
    0.042787,
    0.983754
  ],
  "intercept": 2.481756,
  "poids": [
    -1.593957,
    2.353429,
    -0.422368,
    0.199743,
    -0.711959,
    0.979401,
    -0.582672,
    0.289818,
    -0.204719,
    0.4345,
    0.0631,
    -0.484473
  ],
  "isotonique": null,
  "seuils": {
    "haute": 0.95,
    "moyenne": 0.8
  },
  "appris": {
    "echantillons": 167035,
    "departements": 20
  }
};

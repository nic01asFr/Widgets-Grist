/*
 * Règle Atlas pour le document de démonstration (éclairage du Palais Longchamp et faune nocturne).
 *
 * Module à charger dans une page qui exécute Atlas (la page d'essai `essais-controles/index-vitrine-bulle.html?longchamp=1`,
 * scène « Suivi des ouvrages ») :
 *     (await import('/projects/Atlas/vitrine-longchamp/regler-atlas.js')).default()
 * Il pilote `window.A` comme le ferait l'auteur dans l'interface, étape par étape, et ne touche à aucune donnée.
 * Chaque étape est indépendante et reprend les identifiants de couche depuis le panneau « Couches ».
 */
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Les identifiants de couche, dans l'ordre d'affichage du panneau (la plus haute d'abord). */
function idsDesCouches() {
  return [...document.querySelectorAll('[onclick*="A.selectLayer"]')]
    .map((e) => (e.getAttribute('onclick').match(/selectLayer\('([^']+)'/) || [])[1])
    .filter(Boolean);
}

/** Le nom d'une couche, lu dans sa ligne du panneau. */
function idDeLaCouche(nom) {
  const ligne = [...document.querySelectorAll('[onclick*="A.selectLayer"]')].find((e) => (e.closest('[class*="layer"]') || e.parentElement)?.textContent.includes(nom));
  return ligne ? (ligne.getAttribute('onclick').match(/selectLayer\('([^']+)'/) || [])[1] : null;
}

export const MODELES_3D = {
  'Lanterne LED blanc neutre': 'objet:mat_crosse',
  'Lanterne LED blanc chaud': 'objet:mat_crosse',
  'Lanterne LED ambre': 'objet:mat_crosse',
  'Sodium haute pression': 'objet:mat_crosse',
  'Applique de façade LED': 'objet:applique_facade',
  'Encastré de sol LED': 'objet:encastre_sol',
  'Boule opaline': 'lampball',
  'Projecteur LED de monument': 'objet:projecteur_facade',
};

/** 1. Les deux couches du document et leur apparence. */
export async function couches(A = window.A) {
  A.openModule?.('layers');
  await dormir(300);
  A.showGeoTable('Luminaires');
  await dormir(2500);
  A.showGeoTable('Pieges');
  await dormir(2500);
  const [pieges, luminaires] = idsDesCouches(); // Pieges ajoutée en dernier, donc en haut
  // Luminaires : la couleur est celle de la lumière (table de référence des classes), le modèle 3D est celui du modèle de luminaire.
  A.setSymMode(luminaires, 'color', 'categorized');
  await dormir(300);
  A.setSymField(luminaires, 'color', 'Classe');
  await dormir(1000);
  await A.appliquerReferenceCouleur(luminaires);
  await dormir(1000);
  A.setRepresentation(luminaires, 'library');
  await dormir(500);
  A.setSymMode(luminaires, 'model', 'categorized');
  await dormir(300);
  A.setSymField(luminaires, 'model', 'Nom_modele');
  await dormir(800);
  for (const [valeur, modele] of Object.entries(MODELES_3D)) {
    A.setModelCategory(luminaires, valeur, modele);
    await dormir(120);
  }
  await dormir(1500);
  return { pieges, luminaires };
}

export default async function regler() {
  return { couches: await couches() };
}

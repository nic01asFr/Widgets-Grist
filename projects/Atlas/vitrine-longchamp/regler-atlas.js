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

/** Les identifiants de couche, par nom, lus dans le panneau « Couches » (ordre d'affichage : le plus haut d'abord). */
function idsParNom() {
  const sortie = {};
  for (const ligne of document.querySelectorAll('.layer-item')) {
    const cible = ligne.matches('[onclick*="A.selectLayer"]') ? ligne : ligne.querySelector('[onclick*="A.selectLayer"]');
    const id = cible && (cible.getAttribute('onclick').match(/selectLayer\('([^']+)'/) || [])[1];
    const nom = ligne.textContent.replace('⠿', '').trim().split(/\s+/)[0];
    if (id && nom) sortie[nom] = id;
  }
  return sortie;
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
  const { Pieges: pieges, Luminaires: luminaires } = idsParNom();
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

/** 2. Les pièges : la couleur est celle de la lumière au-dessus d'eux, la taille suit le nombre moyen d'insectes par nuit. */
export async function pieges(id, A = window.A) {
  A.setSymMode(id, 'color', 'categorized');
  await dormir(300);
  A.setSymField(id, 'color', 'Classe');
  await dormir(1000);
  await A.appliquerReferenceCouleur(id);
  await dormir(800);
  A.setSymMode(id, 'size', 'graduated');
  await dormir(300);
  A.setSymField(id, 'size', 'Total_moyen');
  await dormir(500);
  A.setSymOutput(id, 'size', 0, 9);
  A.setSymOutput(id, 'size', 1, 22);
  await dormir(500);
  A.setSymField(id, 'label', 'Nom');
  A.toggleLabel(id);
  await dormir(500);
}

/** 3. Les résultats en volume : un plot par relevé (trois nuits côte à côte), une maille de 50 m par tranche de lumière installée. */
export async function restitution(A = window.A) {
  A.showGeoTable('Releves');
  await dormir(2500);
  A.showGeoTable('Grille');
  await dormir(2500);
  const { Grille: grille, Releves: releves } = idsParNom();
  A.setPolygonMode(releves, 'extruded');
  A.setSymMode(releves, 'color', 'categorized');
  A.setSymField(releves, 'color', 'Mois');
  await dormir(600);
  A.setSymPalette(releves, 'color', 'Set2');
  A.setSymMode(releves, 'size', 'graduated');
  A.setSymField(releves, 'size', 'Total');
  await dormir(400);
  A.setSymOutput(releves, 'size', 0, 4);
  A.setSymOutput(releves, 'size', 1, 42);
  await dormir(600);
  A.setPolygonMode(grille, 'extruded');
  A.setSymMode(grille, 'color', 'graduated');
  A.setSymField(grille, 'color', 'K_moyen');
  await dormir(600);
  A.setSymPalette(grille, 'color', 'YlOrRd');
  A.setSymMode(grille, 'size', 'graduated');
  A.setSymField(grille, 'size', 'Flux_total_lm');
  await dormir(400);
  A.setSymOutput(grille, 'size', 0, 2);
  A.setSymOutput(grille, 'size', 1, 55);
  await dormir(800);
  // La ronde de nuit : une ligne rouge brique, assez épaisse pour se lire de loin.
  A.showGeoTable('Tournees');
  await dormir(2500);
  const { Tournees: tournee } = idsParNom();
  A.setSymColorValue(tournee, '#C44536');
  A.setSymSizeValue(tournee, 4);
  await dormir(500);
  return { grille, releves, tournee };
}

/** 4. Ce que le lecteur manipule : un contrôle par question que pose l'étude, avec des mots de naturaliste. */
export async function controles(ids, A = window.A) {
  const lot = [
    [ids.luminaires, 'Teinte', 'select', 'Teinte de la lumière'],
    [ids.luminaires, 'temperatureCouleur', 'range', 'Température de couleur (K)'],
    [ids.luminaires, 'Zone', 'select', 'Secteur'],
    [ids.luminaires, 'Etat', 'select', 'État du luminaire'],
    [ids.pieges, 'Type', 'select', 'Type de piège'],
    [ids.pieges, 'Total_moyen', 'range', 'Insectes par nuit (moyenne)'],
    [ids.releves, 'Mois', 'select', 'Nuit de relevé'],
  ];
  for (const [couche, champ, type, libelle] of lot) {
    A.toggleControl(couche, champ, type);
    await dormir(250);
    A.setControlLabel(couche, champ, libelle);
    await dormir(150);
  }
}

/** 5. La bulle de l'objet touché : ce qu'il faut savoir d'un coup d'œil, et la dernière visite de la table liée. */
export async function bulles(ids, A = window.A) {
  for (const couche of [ids.luminaires, ids.pieges]) {
    A.activerBulle(couche);
    await dormir(400);
  }
  A.reglerBulle(ids.luminaires, 'titre', 'Code');
  for (const c of ['Nom_modele', 'temperatureCouleur', 'hauteur_feu', 'Annee_pose', 'Dist_eau_m']) A.reglerBulle(ids.luminaires, 'champs', c, true);
  for (const c of ['Classe', 'Etat']) A.reglerBulle(ids.luminaires, 'pastilles', c, true);
  A.reglerBulle(ids.pieges, 'titre', 'Nom');
  for (const c of ['Type', 'Total_moyen', 'Dist_luminaire_m', 'Dist_eau_m']) A.reglerBulle(ids.pieges, 'champs', c, true);
  A.reglerBulle(ids.pieges, 'pastilles', 'Classe', true);
  await dormir(500);
}

/** 6. Le soleil : une belle soirée de juin, à l'heure où les luminaires s'allument. */
export async function soleil(A = window.A) {
  A.setSunDate('2026-06-11');
  await dormir(300);
  A.setTime(22 * 60);
  await dormir(500);
}

/** 7. Ce qu'on propose hors édition : relever une nuit sur un piège, poser un piège à côté d'un luminaire, et en ajouter en Exploiter. */
export async function formulaires(ids, A = window.A) {
  await A.exposerFormulaire(ids.pieges, 'grist-form:31');
  await dormir(400);
  await A.exposerFormulaire(ids.luminaires, 'grist-form:32');
  await dormir(400);
  A.setCreationExploiter(ids.pieges, true);
  await dormir(300);
}

/** Passe dans la posture voulue (le choix est mémorisé par document : on ne suppose pas celle d'où l'on part). */
export async function posture(nom) {
  const bouton = document.querySelector('[aria-label^="Changer de posture"]');
  if (bouton.getAttribute('aria-label').includes('en cours : ' + { preparer: 'Préparer', exploiter: 'Exploiter', lecture: 'Lecture' }[nom])) return;
  bouton.click();
  await dormir(400);
  document.querySelector(`[data-posture="${nom}"]`).click();
  await dormir(1500);
}

export default async function regler() {
  await posture('preparer');
  const c = await couches();
  await pieges(c.pieges);
  const r = await restitution();
  const ids = { ...c, ...r };
  await controles(ids);
  await bulles(ids);
  await formulaires(ids);
  await soleil();
  return ids;
}

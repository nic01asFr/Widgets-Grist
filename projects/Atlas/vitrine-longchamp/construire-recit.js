/*
 * Compose le récit et les contextes du document de démonstration, en capturant des étapes comme le ferait l'auteur :
 * on règle la carte (couches visibles, filtres, heure, cadrage), puis « Capturer l'étape ».
 *
 * À charger après regler-atlas.js, dans la même page :
 *     (await import('/projects/Atlas/vitrine-longchamp/construire-recit.js')).default()
 *
 * Six étapes de récit racontent l'étude ; cinq contextes servent à l'exploitant. Tout ce qui est dit de la donnée l'est
 * honnêtement : positions, codes et catégories de luminaires réels (Ville de Marseille, Licence Ouverte 2.0) ; modèle, état,
 * pièges et comptages fictifs.
 */
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const sansEvenement = { stopPropagation() {} };

const CENTRE = [5.3946, 43.3044];
const JOUR = '2026-06-11';

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

/** Les étapes : ce qu'il faut régler avant de capturer, puis le titre, le texte et, pour un contexte, ses réglages. */
export const ETAPES = [
  {
    titre: 'Le Palais Longchamp et son parc, de jour',
    pastilles: ['Teinte', 'temperatureCouleur', 'sun'],
    texte: 'Marseille, 4e arrondissement. Le parc, les bassins et les rues autour portent 643 points lumineux recensés par la Ville (positions, codes et catégories réels). Le modèle de chaque luminaire est ici un exemple fictif.',
    couches: ['Luminaires'], heure: 14 * 60, camera: { center: [5.3946, 43.3047], zoom: 16.3, pitch: 52, bearing: -18 },
  },
  {
    titre: 'À 22 h, les luminaires s’allument',
    pastilles: ['Teinte', 'temperatureCouleur', 'sun'],
    texte: 'Au coucher du soleil, chaque luminaire s’allume selon son profil. Les 24 points défectueux restent éteints, et la légende le dit.',
    couches: ['Luminaires'], heure: 22 * 60, camera: { center: [5.3946, 43.3047], zoom: 16.6, pitch: 58, bearing: -18 },
  },
  {
    titre: 'Une teinte par type de lumière',
    pastilles: ['Teinte', 'temperatureCouleur', 'Zone'],
    texte: 'Le blanc chaud domine, mais l’ancien parc au sodium et les projecteurs de monument en blanc froid ne se valent pas. La couleur est celle de la lumière, lue dans la table des classes.',
    couches: ['Luminaires'], heure: 22 * 60, camera: { center: [5.3957, 43.3052], zoom: 17.2, pitch: 60, bearing: 20 },
  },
  {
    titre: 'Dix-neuf pièges, sous les luminaires et à l’écart',
    pastilles: ['Type', 'Total_moyen'],
    texte: 'Quinze pièges sont posés sous un luminaire, quatre en zone sombre pour servir de témoins. La taille d’un rond suit le nombre moyen d’insectes par nuit.',
    couches: ['Luminaires', 'Pieges'], heure: 22 * 60, camera: { center: [5.3951, 43.3050], zoom: 16.9, pitch: 55, bearing: 8 },
  },
  {
    titre: 'Une ronde de nuit de 3,2 km',
    pastilles: ['Type', 'Total_moyen'],
    texte: 'La ronde suit les chemins et les rues du réseau BD TOPO et passe par les dix-neuf pièges. Le tracé est réel, l’ordre de passage est un exemple.',
    couches: ['Pieges', 'Tournees'], heure: 22 * 60, camera: { center: [5.3949, 43.3048], zoom: 16.3, pitch: 40, bearing: 0 },
  },
  {
    titre: 'Ce que les pièges ont compté',
    pastilles: ['Mois', 'Total_moyen'],
    texte: 'Trois nuits, juin, juillet et septembre, côte à côte au pied de chaque piège. Les comptages sont fictifs : ils montrent comment l’étude se lit, pas ce que serait son résultat.',
    couches: ['Releves', 'Pieges'], heure: 21 * 60, camera: { center: [5.3951, 43.3050], zoom: 17.4, pitch: 62, bearing: 18 },
  },
  // ---- les contextes de l'exploitant
  {
    contexte: true, cle: 'ctx-ensemble',
    titre: 'Vue d’ensemble',
    pastilles: ['Teinte', 'Type', 'sun', 'basemap'],
    texte: 'Tous les luminaires et tous les pièges du parc. Touchez un objet pour voir son état et, pour un piège, ses dernières nuits.',
    couches: ['Luminaires', 'Pieges'], heure: 14 * 60, camera: { center: [5.3946, 43.3047], zoom: 16.2, pitch: 0, bearing: 0 }, releves: ['Pieges'],
  },
  {
    contexte: true, cle: 'ctx-campagne-juin', tournee: true,
    titre: 'Campagne de juin — ronde de nuit',
    pastilles: ['Type', 'Total_moyen', 'sun'],
    texte: 'Les dix-neuf pièges dans l’ordre de la ronde. Ouvrez « Tournée » pour les prendre un à un, ou choisissez-en un dans la liste.',
    couches: ['Luminaires', 'Pieges', 'Tournees'], heure: 22 * 60, camera: { center: [5.3949, 43.3048], zoom: 16.4, pitch: 0, bearing: 0 }, releves: ['Pieges'],
  },
  {
    contexte: true, cle: 'ctx-zone-sombre',
    titre: 'Zone sombre de référence',
    pastilles: ['Type'],
    texte: 'Les quatre pièges témoins, loin de toute lumière : c’est avec eux que l’on compare les autres.',
    couches: ['Pieges'], heure: 22 * 60, camera: { center: [5.3951, 43.3050], zoom: 16.9, pitch: 0, bearing: 0 }, releves: ['Pieges'],
    filtres: [['Pieges', 'Type', 'Sous un luminaire']],
  },
  {
    contexte: true, cle: 'ctx-resultats',
    titre: 'Résultats de la campagne',
    pastilles: ['Mois', 'Total_moyen', 'basemap'],
    texte: 'Un plot par nuit et par piège : sa hauteur suit le nombre d’insectes comptés. Les valeurs sont fictives.',
    couches: ['Releves', 'Pieges'], heure: 21 * 60, camera: { center: [5.3951, 43.3050], zoom: 17.3, pitch: 62, bearing: 18 },
  },
  {
    contexte: true, cle: 'ctx-a-remplacer',
    titre: 'Luminaires à remplacer',
    pastilles: ['Teinte', 'Zone', 'temperatureCouleur', 'sun'],
    texte: 'Les luminaires blanc froid et blanc neutre du parc : ceux dont on gagnerait le plus à changer la lumière.',
    couches: ['Luminaires'], heure: 22 * 60, camera: { center: [5.3951, 43.3050], zoom: 17.0, pitch: 55, bearing: 10 }, releves: [],
    filtres: [['Luminaires', 'Teinte', 'Ambre (≤ 2 200 K)'], ['Luminaires', 'Teinte', 'Sodium (≈ 2 000 K)'], ['Luminaires', 'Teinte', 'Blanc chaud (≈ 3 000 K)'], ['Luminaires', 'Zone', 'Quartier']],
  },
];

/** Ce que le lecteur peut manipuler dans le dock : un contrôle par champ, et trois réglages de la scène. */
const CONTROLES = { Teinte: 'Luminaires', temperatureCouleur: 'Luminaires', Zone: 'Luminaires', Etat: 'Luminaires', Type: 'Pieges', Total_moyen: 'Pieges', Mois: 'Releves' };
const REGLAGES = ['sun', 'view3d', 'basemap'];
const publies = { controles: Object.fromEntries(Object.keys(CONTROLES).map((c) => [c, true])), reglages: Object.fromEntries(REGLAGES.map((r) => [r, false])) };

/** Les pastilles d'une étape sont celles que l'auteur voit dans son dock au moment de capturer : on n'en laisse que les utiles. */
async function poserPastilles(liste, ids, A = window.A) {
  for (const [champ, couche] of Object.entries(CONTROLES)) {
    const voulu = liste.includes(champ);
    if (publies.controles[champ] !== voulu) {
      A.toggleControl(ids[couche], champ);
      publies.controles[champ] = voulu;
      await dormir(200);
    }
  }
  for (const id of REGLAGES) {
    const voulu = liste.includes(id);
    if (publies.reglages[id] !== voulu) {
      A.setViewerExposed(id, voulu);
      publies.reglages[id] = voulu;
      await dormir(150);
    }
  }
}

async function regler(etape, ids, A = window.A) {
  await poserPastilles(etape.pastilles || [], ids, A);
  // couches visibles : on masque tout, on réaffiche celles de l'étape
  A.toggleAllLayers(false);
  await dormir(300);
  for (const nom of etape.couches) {
    A.toggleLayer(ids[nom], sansEvenement);
    await dormir(150);
  }
  // filtres : décocher une valeur l'écarte seule
  for (const [nom, champ, valeur] of etape.filtres || []) {
    A.toggleControlValue(ids[nom], champ, valeur);
    await dormir(200);
  }
  A.setSunDate(JOUR);
  A.setTime(etape.heure);
  window.__atlasMap.jumpTo({ ...etape.camera, bearing: etape.camera.bearing || 0 });
  await dormir(2500);
}

async function remettre(etape, ids, A = window.A) {
  for (const [nom, champ, valeur] of etape.filtres || []) {
    A.toggleControlValue(ids[nom], champ, valeur);
    await dormir(150);
  }
}

/**
 * Ce que l'on laisse en place à la fin : les couches du cas visibles, la scène qui s'ouvre sur « Vue d'ensemble », l'heure du jour,
 * et ce que le lecteur peut régler lui-même (le fond de plan, la vue 2D / 3D, le soleil).
 */
export async function finitions(ids, A = window.A) {
  A.toggleAllLayers(false);
  await dormir(300);
  for (const nom of ['Luminaires', 'Pieges']) {
    A.toggleLayer(ids[nom], sansEvenement);
    await dormir(150);
  }
  await poserPastilles(['Teinte', 'temperatureCouleur', 'Type', 'Total_moyen', 'sun', 'basemap'], ids, A);
  A.setSunDate(JOUR);
  A.setTime(14 * 60);
  for (const fond of ['liberty', 'plan-ign', 'ortho-ign']) {
    A.toggleViewerBasemapAllowed(fond);
    await dormir(150);
  }
  // régler le soleil ouvre son panneau : on revient sur le Récit pour choisir l'ouverture
  A.openModule('recit');
  await dormir(900);
  // l'ouverture : le contexte « Vue d'ensemble » (le choix se lit dans la liste du panneau Récit)
  const liste = document.getElementById('ouverture-select');
  const option = liste && [...liste.options].find((o) => /Vue d.ensemble/.test(o.textContent));
  if (option) {
    liste.value = option.value;
    liste.dispatchEvent(new Event('change', { bubbles: true }));
  }
  await dormir(1500);
  return { ouverture: option ? option.textContent.trim() : null };
}

export default async function construire(A = window.A) {
  // Le panneau « Couches » est fermé pendant le récit : les identifiants viennent du réglage fait juste avant.
  const memo = window.__ids || {};
  const ids = { Luminaires: memo.luminaires, Pieges: memo.pieges, Releves: memo.releves, Grille: memo.grille, Tournees: memo.tournee, ...idsParNom() };
  const avant = (document.body.innerText.match(/(\d+) étape/) || [])[1];
  let i = 0;
  for (const e of ETAPES) {
    await regler(e, ids, A);
    A.storyCapture();
    await dormir(600);
    const n = document.querySelectorAll('[onchange*="A.storySet("][onchange*="\'title\'"]').length;
    A.storySet(n - 1, 'title', e.titre);
    A.storySet(n - 1, 'text', e.texte);
    if (e.contexte) {
      A.storyContexte(n - 1, true);
      if (e.releves) for (const cle of e.releves) A.storyReleve(n - 1, cle, true);
    }
    await remettre(e, ids, A);
    i += 1;
  }
  const fin = await finitions(ids, A);
  return { etapes: i, avant, ...fin };
}

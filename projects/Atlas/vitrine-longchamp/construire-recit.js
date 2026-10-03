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

/**
 * Les étapes sont décrites dans recit.json (titre, texte, couches visibles, heure, cadrage, pastilles, filtres) : le même fichier
 * sert à composer le récit du document et à fabriquer la scène publiée (fabriquer-scene.py).
 */
async function lireRecit() {
  const r = await fetch('/projects/Atlas/vitrine-longchamp/recit.json?v=' + Date.now());
  return r.json();
}

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
  const { etapes: ETAPES } = await lireRecit();
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

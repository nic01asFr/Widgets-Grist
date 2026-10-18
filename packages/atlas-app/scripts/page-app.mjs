/**
 * La page de l'application : ce que le rassemblement en retire.
 *
 * Module pur (du texte en entree, du texte en sortie), pour pouvoir le verifier sans reseau ni Capacitor.
 */

/** La marque que laisse le chargeur : app_v7.js attend `window.__gristApi` avant de demarrer, `null` veut dire « rien a attendre ». */
export const STUB_API_GRIST = '<script>window.__gristApi = null;</script>';

/**
 * Retire de la page tout ce qui charge l'API de plugin de Grist.
 *
 * Elle n'a aucun sens dans l'application, et sa presence fait croire a Atlas qu'un document Grist l'encadre : il demande alors des
 * tables a un hote qui n'existe pas (« Unknown forward destination: grist ») et aucune donnee ne se charge. Depuis la 1.16.8 la page
 * ne la declare plus par une balise `<script src>` mais par un petit script qui la charge a l'analyse de la page : les deux formes
 * sont retirees, et `window.__gristApi` est mis a `null` pour que l'application ne l'attende pas.
 *
 * @param {string} html
 * @returns {string}
 */
export function retirerPluginGrist(html) {
  let pose = false;
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, (bloc) => {
    if (!/grist-plugin-api\.js/.test(bloc)) return bloc;
    if (pose) return '';
    pose = true;
    return STUB_API_GRIST;
  });
}

/**
 * Ce qui ne doit jamais rester dans la page de l'application : une adresse qui irait chercher l'API de Grist. Leve une erreur qui
 * dit laquelle, plutot que de laisser l'APK s'ouvrir sur un ecran sans donnees.
 */
export function verifierPageApp(html) {
  const restes = [...new Set(html.match(/https:\/\/docs\.getgrist\.com\/[^"'\s)]*/g) || [])];
  if (restes.length) throw new Error('la page de l\'application charge encore l\'API de Grist : ' + restes.join(', '));
  if (!html.includes(STUB_API_GRIST)) throw new Error('la page de l\'application ne declare pas `window.__gristApi = null`');
}

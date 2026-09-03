/**
 * La scène qui vient d'ailleurs — `?scene=<url>`.
 *
 * Atlas sait lire un Scene Manifest depuis une table du document. Ce module lui
 * apprend à en lire un depuis une adresse, ce qui change une chose et une
 * seule, mais elle change tout : **le manifeste n'est plus écrit par quelqu'un
 * qui a déjà les droits sur le document**.
 *
 * Une scène lue dans le document est de confiance, au même titre qu'une formule
 * Grist : pour l'y mettre, il fallait pouvoir écrire dans le document. Une scène
 * chargée par URL ne l'est pas — n'importe qui peut fabriquer l'adresse et la
 * faire ouvrir. La conséquence est dans `sceneEstDeConfiance` ci-dessous et
 * dans le cadrage : Atlas ne lui donne pas le document.
 *
 * Cadrage : docs/CADRAGE-SCENE-EXTERNE-ET-DECOUPLAGE.md §A
 */

/** Versions du contrat qu'Atlas sait lire. Doit suivre le schéma publié. */
export const VERSIONS_LUES = ['0.2.1', '0.2.2'];

/**
 * L'adresse de la scène, si l'URL en demande une.
 *
 * Seul `https:` est admis, **plus `http://localhost`**. `data:` et `blob:`
 * porteraient un contenu sans origine — donc impossible à attribuer, à révoquer
 * ou à recouper —, et `http:` distant laisserait un tiers réécrire la scène en
 * chemin.
 *
 * L'exception locale n'en est pas une : les navigateurs classent `localhost`
 * parmi les contextes sécurisés, précisément parce que rien ne s'interpose. La
 * refuser n'ajouterait aucune sûreté et rendrait impossible la mise au point
 * d'une scène avant sa publication — ce qui pousserait à publier pour essayer.
 *
 * Le refus est **explicite** plutôt que silencieux : quelqu'un qui a écrit une
 * adresse doit apprendre pourquoi elle n'est pas prise, sinon il croira à un
 * bug d'Atlas.
 *
 * @param {string} [search] location.search, avec ou sans « ? »
 * @returns {{ url: string|null, refus: string|null }}
 */
export function urlSceneDepuisParam(search = '') {
  const brut = new URLSearchParams(String(search || '').replace(/^\?/, '')).get('scene');
  if (!brut || !brut.trim()) return { url: null, refus: null };
  const val = brut.trim();
  let u;
  try {
    u = new URL(val);
  } catch {
    return { url: null, refus: `adresse de scène illisible : « ${val} »` };
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) {
    return { url: null,
      refus: `scène refusée : ${u.protocol}//${u.hostname || ''} — https est requis `
           + `(http n'est admis que sur localhost)` };
  }
  return { url: u.href, refus: null };
}

/**
 * Une scène externe n'est jamais de confiance.
 *
 * Écrit comme une fonction plutôt qu'un booléen en dur pour que la règle ait un
 * nom et un seul endroit. Si un jour une liste d'origines admises apparaît,
 * c'est ici qu'elle vivra — et nulle part ailleurs.
 *
 * @param {{externe?: boolean}} scene
 */
export function sceneEstDeConfiance(scene) {
  return !scene?.externe;
}

/**
 * Ce qu'il faut pour qu'un objet soit une scène, et rien de plus.
 *
 * C'est une **garde**, pas une validation : elle est certaine, elle ne dépend de
 * rien, et elle ne peut pas échouer pour une mauvaise raison — refuser une
 * scène faute d'avoir su charger un schéma serait un refus qui imite une règle.
 *
 * La conformité fine au contrat 0.2.2 se vérifie ailleurs, et volontairement :
 * `node scripts/valider-schema.js <schema> <scene>`, entre les mains de qui
 * **écrit** la scène. Un diagnostic ici s'afficherait chez qui la **regarde**,
 * qui n'y peut rien.
 *
 * @param {any} obj
 * @returns {string[]} écarts, vide si la forme tient
 */
export function verifierFormeScene(obj) {
  const ecarts = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return ['la scène n’est pas un objet JSON'];
  }
  if (!obj.version) ecarts.push('« version » manquante');
  else if (!VERSIONS_LUES.includes(String(obj.version))) {
    ecarts.push(`version « ${obj.version} » non lue par cet Atlas (lues : ${VERSIONS_LUES.join(', ')})`);
  }
  if (!Array.isArray(obj.layers)) ecarts.push('« layers » manquant ou n’est pas une liste');
  else if (!obj.layers.length) ecarts.push('« layers » est vide — la scène n’a rien à montrer');
  else {
    obj.layers.forEach((l, i) => {
      if (!l || typeof l !== 'object') ecarts.push(`couche ${i} : n’est pas un objet`);
      else if (!l.name && !l.id) ecarts.push(`couche ${i} : ni « name » ni « id »`);
    });
  }
  return ecarts;
}

/**
 * L'enveloppe éventuelle autour du manifeste.
 *
 * Les producteurs sérialisent tantôt la scène nue, tantôt `{scene: …}` ou
 * `{manifest: …}` — les trois formes existent dans les fixtures attestées. Les
 * accepter coûte une ligne ; les refuser coûterait un aller-retour avec chaque
 * producteur.
 */
export function deballerScene(brut) {
  return brut?.scene || brut?.manifest || brut;
}

/**
 * Adresses de couches relatives → absolues, ancrées sur l'URL de la scène.
 *
 * Un pack portable pose souvent `geojson: "./bati.geojson"`. Sans résolution,
 * MapLibre interprète le chemin par rapport à la page Atlas, pas au manifeste.
 */
export function resoudreAdressesCouches(manifest, baseUrl) {
  if (!manifest?.layers?.length || !baseUrl) return manifest;
  let base;
  try { base = new URL(baseUrl); } catch { return manifest; }
  for (const ml of manifest.layers) {
    for (const cle of ['geojson', 'data_url', 'gltf_url', 'gltfUrl']) {
      const v = ml[cle];
      if (typeof v === 'string' && v && !/^(https?:|data:|blob:)/i.test(v)) {
        try { ml[cle] = new URL(v, base).href; } catch { /* laisser tel quel */ }
      }
    }
    // GLB custom : même règle — sinon le loader cherche ./chapelle.glb sous index_v7.
    const customUrl = ml.style?.custom?.url;
    if (typeof customUrl === 'string' && customUrl && !/^(https?:|data:|blob:)/i.test(customUrl)) {
      try {
        ml.style.custom.url = new URL(customUrl, base).href;
      } catch { /* laisser tel quel */ }
    }
  }
  return manifest;
}

/**
 * Charger la scène désignée par l'URL.
 *
 * @param {string} url
 * @param {{fetch?: Function, signal?: AbortSignal}} [deps]
 * @returns {Promise<{manifest: object|null, echec: string|null}>}
 */
export async function chargerSceneExterne(url, deps = {}) {
  const f = deps.fetch || (typeof fetch === 'function' ? fetch : null);
  if (!f) return { manifest: null, echec: 'aucun moyen de récupérer la scène (fetch absent)' };

  let rep;
  try {
    rep = await f(url, { signal: deps.signal });
  } catch (e) {
    // Le navigateur ne détaille pas ce qui a échoué : serveur absent, adresse
    // fausse, ou en-tête CORS manquant rendent tous « Failed to fetch ». Il
    // faut donc nommer **les deux** pistes — un message qui n'en donne qu'une
    // envoie chercher le CORS d'un serveur qui ne répond même pas.
    return { manifest: null,
      echec: `scène injoignable — ${e.message}. Deux causes possibles : le serveur `
           + `ne répond pas (adresse, réseau), ou il refuse la lecture depuis une `
           + `autre origine (en-tête Access-Control-Allow-Origin absent).` };
  }
  if (!rep.ok) {
    return { manifest: null, echec: `scène refusée par le serveur : HTTP ${rep.status}` };
  }

  let brut;
  try {
    brut = await rep.json();
  } catch (e) {
    return { manifest: null, echec: `la scène n’est pas du JSON valide : ${e.message}` };
  }

  const manifest = deballerScene(brut);
  const ecarts = verifierFormeScene(manifest);
  if (ecarts.length) {
    return { manifest: null, echec: `scène invalide — ${ecarts.join(' · ')}` };
  }

  // Le drapeau voyage avec la scène : tout ce qui décide d'un droit en aval le
  // lit là, plutôt que de relire l'URL. Une seule source pour une seule règle.
  manifest.externe = true;
  manifest._origine = url;
  resoudreAdressesCouches(manifest, url);
  return { manifest, echec: null };
}

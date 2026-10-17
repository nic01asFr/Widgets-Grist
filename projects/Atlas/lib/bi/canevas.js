/**
 * Le canevas d'Atlas piloté par la page hôte (profil `complet` du composant : `?bi=1&profil=complet`).
 *
 * Dans ce profil, l'application complète tourne avec le pont. `setScene` reçoit alors DEUX formes de scène :
 *  - un manifeste BI (sans `version`) : monté par le runtime BI, comme dans le composant nu ;
 *  - une scène Atlas, Scene Manifest 0.2.x (avec `version`) : montée par l'application elle-même (`monterSceneExterne`), avec
 *    tout ce qu'elle sait faire (relief, 3D, éclairage, récit, couches d'objets).
 * Une scène remplace la précédente, quelle que soit sa forme. Aucune commande n'est ajoutée au contrat 0.3 : seuls `setScene`,
 * `setLayerVisibility`, `fitTo` et `ping` reconnaissent aussi les couches de la scène Atlas, et `ready` porte `canevas: true`.
 *
 * Module chargé À LA DEMANDE par `montage.js`, seulement quand la page a posé `window.__atlasCanevas` (profil complet).
 * Le composant nu ne le télécharge jamais.
 *
 * SÉCURITÉ. La scène vient de la page hôte, une origine déclarée mais pas la propriétaire d'Atlas : elle est traitée comme
 * toute scène externe (`externe: true`, aucun accès au document). Avant le montage : forme vérifiée, taille et nombre de couches
 * plafonnés, et toute adresse de donnée doit être absolue en https (http seulement sur localhost) : jamais `data:`, `blob:`,
 * ni adresse relative (relative à quoi ? à la page d'Atlas, pas à celle de l'hôte).
 */
/**
 * Les trois fonctions de `lib/scene-externe.js` dont ce module a besoin ne sont PAS importées ici : la page maigre (`bi.html`) ne doit contenir aucun
 * module de l'application dans sa fermeture d'imports, et celle-ci passe par `montage.js`. `app_v7.js`, qui les importe déjà, les remet dans la
 * façade (`canevas.outils`) ; les tests passent les vraies.
 * @typedef {{VERSIONS_LUES: string[], deballerScene: Function, verifierFormeScene: Function, adresseAdmise: Function}} OutilsScene
 */

export const PLAFOND_OCTETS = 4 * 1024 * 1024;
export const PLAFOND_COUCHES = 64;
/** Le type d'une couche qui désigne une maquette en dalles 3D servies par adresse (voir `lib/dalles3d-geo.js`). */
export const TYPE_DALLES = 'dalles3d';
export const PLAFOND_COUCHES_DALLES = 4;
/** Champs d'une couche de scène qui désignent une donnée à aller chercher. */
const CLES_ADRESSE = ['geojson', 'data_url', 'gltf_url', 'gltfUrl', 'tiles_url'];

/** Vrai quand l'objet est une scène Atlas (Scene Manifest 0.2.x) : un manifeste BI ne porte pas de `version`. */
/** @param {OutilsScene} outils */
export function estSceneAtlas(manifest, outils) {
  const m = manifest && typeof manifest === 'object' ? outils.deballerScene(manifest) : null;
  return !!m && typeof m === 'object' && outils.VERSIONS_LUES.includes(String(m.version));
}

/** Vrai quand la couche désigne des dalles 3D : `{ type: 'dalles3d', dalles3d: { grille: <adresse https du manifeste grille3d.json> } }`. */
export const estCoucheDalles = (def) => !!def && typeof def === 'object' && def.type === TYPE_DALLES;

/**
 * Contrôle une scène venue de l'hôte et la rend prête à monter.
 * @param {OutilsScene} outils
 * @returns {{scene: object|null, ecarts: string[]}}  `scene` est une copie marquée `externe`, jamais l'objet reçu
 */
export function verifierSceneHote(manifest, outils) {
  let taille;
  try { taille = JSON.stringify(manifest).length; } catch (e) { return { scene: null, ecarts: ['la scène n\'est pas sérialisable'] }; }
  const ecarts = [];
  if (taille > PLAFOND_OCTETS) ecarts.push('scène trop volumineuse (' + Math.round(taille / 1024) + ' Ko pour un plafond de ' + PLAFOND_OCTETS / 1024 + ' Ko) : servir les données par adresse');
  const scene = outils.deballerScene(manifest);
  ecarts.push(...outils.verifierFormeScene(scene));
  if (Array.isArray(scene && scene.layers)) {
    if (scene.layers.filter(estCoucheDalles).length > PLAFOND_COUCHES_DALLES) ecarts.push('trop de couches de dalles 3D (plafond ' + PLAFOND_COUCHES_DALLES + ')');
    if (scene.layers.length > PLAFOND_COUCHES) ecarts.push('trop de couches (' + scene.layers.length + ' pour un plafond de ' + PLAFOND_COUCHES + ')');
    scene.layers.forEach((def, i) => {
      if (!def || typeof def !== 'object') return;
      const nom = def.id || def.name || ('couche ' + i);
      if (estCoucheDalles(def)) {   // des dalles 3D : une seule adresse, celle du manifeste de grille
        const g = def.dalles3d && def.dalles3d.grille;
        if (typeof g !== 'string' || !g) ecarts.push('couche « ' + nom + ' » : dalles3d.grille (adresse du manifeste de grille) manquante');
        else { const refus = outils.adresseAdmise(g); if (refus) ecarts.push('couche « ' + nom + ' » : dalles3d.grille : ' + refus); }
        return;
      }
      const adresses = CLES_ADRESSE.map((c) => [c, def[c]]);
      adresses.push(['style.custom.url', def.style && def.style.custom && def.style.custom.url], ['source.url', def.source && def.source.url]);
      for (const [cle, valeur] of adresses) {
        if (typeof valeur !== 'string' || !valeur) continue;
        const refus = outils.adresseAdmise(valeur); if (refus) ecarts.push('couche « ' + nom + ' » : ' + cle + ' : ' + refus);
      }
    });
  }
  if (ecarts.length) return { scene: null, ecarts };
  const copie = structuredClone(scene); copie.externe = true; copie._origine = 'hote';
  return { scene: copie, ecarts: [] };
}

/**
 * Identifiant d'application de chaque couche de la scène : `{ idScene: idCouche }`. Le chargeur dérive l'identifiant interne de celui du
 * manifeste (préfixe `layer-scene-` et caractères assainis, ou l'identifiant tel quel pour une couche matricielle).
 * @param {object[]} defs  couches du manifeste
 * @param {{id:string}[]} couches  couches nouvellement montées dans l'application
 */
export function correspondanceCouches(defs, couches) {
  const ids = new Set((couches || []).map((l) => l.id)); const rendu = {};
  for (const d of defs || []) {
    const brut = String((d && (d.id || d.name)) || ''); if (!brut) continue;
    const candidats = [brut, 'layer-scene-' + brut.replace(/[^a-zA-Z0-9_-]/g, '_')];
    const trouve = candidats.find((c) => ids.has(c)); if (trouve) rendu[brut] = trouve;
  }
  return rendu;
}

/**
 * Sépare ce que le chargeur a signalé : une couche qui ne s'est pas montée est une erreur ; une couche montée mais signalée (distante sans
 * `bbox` : elle s'affiche sans pouvoir être cadrée) est un avertissement. Clés : identifiant du manifeste.
 * @param {{nom?:string, raison?:string, origine?:string}[]} echecs
 * @param {object[]} defs  couches du manifeste
 * @param {Record<string,string>} correspondance  idScene -> idCouche des couches montées
 */
export function classerEchecs(echecs, defs, correspondance) {
  const erreurs = {}, avertissements = {};
  for (const e of echecs || []) {
    const def = (defs || []).find((d) => d && [d.name, d.displayName, d.id].includes(e.nom));
    const cle = (def && (def.id || def.name)) || e.nom || '?';
    const texte = String(e.raison || e.origine || 'non chargée');
    if (Object.prototype.hasOwnProperty.call(correspondance, cle)) (avertissements[cle] = avertissements[cle] || []).push(texte);
    else erreurs[cle] = texte;
  }
  return { erreurs, avertissements };
}

/**
 * Branche le canevas sur le runtime du pont : `setScene`, `setLayerVisibility`, `fitTo` et `ping` reconnaissent aussi la scène Atlas.
 * @param {object} rt  retour de `attacher`
 * @param {{monterScene:Function, monterDalles:Function, retirerScene:Function, visibilite:Function, cadrer:Function, outils:OutilsScene}} canevas  façade posée par `app_v7.js`
 * @returns {{couches: () => Record<string,string>}}
 */
export function brancher(rt, canevas) {
  const api = rt.api; const avant = { setScene: api.setScene, setLayerVisibility: api.setLayerVisibility, fitTo: api.fitTo, ping: api.ping };
  let correspondance = {};   // idScene -> idCouche de l'application

  api.setScene = async (manifest, donnees) => {
    if (!estSceneAtlas(manifest, canevas.outils)) {   // un manifeste BI remplace une éventuelle scène Atlas
      if (Object.keys(correspondance).length) { canevas.retirerScene(); correspondance = {}; }
      return avant.setScene(manifest, donnees);
    }
    const { scene, ecarts } = verifierSceneHote(manifest, canevas.outils);
    if (ecarts.length) throw new Error('scène Atlas refusée : ' + ecarts.join(' | '));
    await avant.setScene({ layers: [] });   // vide la scène BI : une scène en remplace une autre
    canevas.retirerScene();                  // et la scène Atlas précédente (couches de l'application et dalles 3D)
    const dalles = scene.layers.filter(estCoucheDalles), autres = scene.layers.filter((d) => !estCoucheDalles(d));
    const r = autres.length ? await canevas.monterScene({ ...scene, layers: autres }) : { couches: [], echecs: [], erreur: null };
    correspondance = correspondanceCouches(autres, r.couches || []);
    // un compte inconnu (couche distante : ses entités arrivent à l'affichage) est `null`, jamais un faux zéro
    const compte = {}, erreursDalles = {};
    for (const [idScene, idCouche] of Object.entries(correspondance)) { const c = (r.couches || []).find((x) => x.id === idCouche); compte[idScene] = c && Number.isFinite(c.n) ? c.n : null; }
    for (const def of dalles) {   // chaque couche de dalles 3D se monte seule : l'échec de l'une ne retire pas les autres
      const id = String(def.id || def.name);
      try { const d = await canevas.monterDalles({ id, nom: def.name || id, grille: def.dalles3d.grille, options: def.dalles3d }); correspondance[id] = d.id; compte[id] = Number.isFinite(d.n) ? d.n : null; }
      catch (e) { erreursDalles[id] = String((e && e.message) || e); }
    }
    const { erreurs, avertissements } = classerEchecs(r.echecs, autres, correspondance);
    Object.assign(erreurs, erreursDalles);
    if (r.erreur) erreurs._scene = String(r.erreur);
    const dites = { ...(Object.keys(erreurs).length ? { erreurs } : {}), ...(Object.keys(avertissements).length ? { avertissements } : {}) };
    rt._interne.emettre('ready', { layers: compte, canevas: true, ...dites }, 'api');
    return { ...compte, ...(dites.erreurs ? { _erreurs: erreurs } : {}), ...(dites.avertissements ? { _avertissements: avertissements } : {}) };
  };
  api.setLayerVisibility = (id, visible) => {
    if (Object.prototype.hasOwnProperty.call(correspondance, id)) return canevas.visibilite(correspondance[id], !!visible);
    return avant.setLayerVisibility(id, visible);
  };
  api.fitTo = (arg) => {
    const ids = Object.values(correspondance);
    if (!ids.length) return avant.fitTo(arg);
    const cible = typeof arg === 'string' && Object.prototype.hasOwnProperty.call(correspondance, arg) ? [correspondance[arg]] : (typeof arg === 'string' ? null : ids);
    return cible ? canevas.cadrer(cible) : avant.fitTo(arg);
  };
  api.ping = () => ({ ...avant.ping(), canevas: true, couches_scene: Object.keys(correspondance) });
  return { couches: () => ({ ...correspondance }) };
}

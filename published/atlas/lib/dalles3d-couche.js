/**
 * Une maquette en dalles 3D sur la carte : la couche MapLibre personnalisée (three.js) qui charge les dalles de la vue, niveau par niveau.
 *
 * Tout ce qui touche au navigateur (three.js, le chargeur glTF, la carte, le réseau) est INJECTÉ : le module ne l'importe pas, il se teste sous Node avec
 * des doubles, et `app_v7.js`, qui possède déjà three.js, lui passe les vraies pièces. La géométrie, les adresses et le choix du niveau sont dans
 * `lib/dalles3d-geo.js` (pur, testé).
 *
 * Ce que fait la couche :
 *  - lit le manifeste de grille, puis, à chaque fin de mouvement de la carte, la liste des dalles livrées dans la fenêtre (`disponibilite.json?bbox=`) ;
 *  - pour chaque dalle proche, lit son ancrage et choisit le niveau selon la distance de la caméra (D3 loin, D2 près) ;
 *  - charge les GLB demandés dans une file à priorité (les plus proches d'abord), trois à la fois, en abandonnant ce qui n'est plus voulu ;
 *  - ne montre jamais de trou : tant que le niveau voulu n'est pas là, le niveau déjà chargé reste affiché ;
 *  - garde les GLB dans un cache à budget d'octets (le moins récent part), clé = identifiant + niveau + empreinte : un GLB qui change se recharge seul ;
 *  - repose tout quand le manifeste change de `version` (la Fabrique a republié).
 *
 * Précision : toutes les dalles sont posées relativement à l'ORIGINE COMMUNE (la première dalle chargée), les matrices se composent en double précision côté
 * JavaScript, et seule la matrice finale part au GPU. Sans cela, les coordonnées Mercator (≈ 0,5, pour des objets de 1e-8) perdraient le mètre.
 */
import {
  lireGrille, urlGabarit, urlDisponibilite, lireDisponibilite, lireAncrage, matriceDalle, produit4, inverse4, niveauPourDistance, niveauAffiche,
  distanceM, mercator, metreEnMercator, creerCacheLRU, PLAFOND_DALLES_VUE, PLAFOND_OCTETS_GLB,
} from './dalles3d-geo.js?v=1.37.0';

export const BUDGET_OCTETS_DEFAUT = 320 * 1024 * 1024;
export const PARALLELISME_DEFAUT = 3;
const DELAI_FIN_DE_MOUVEMENT_MS = 250;
/** La fenêtre de lecture déborde de la vue : on charge un peu au-delà, pour que le déplacement ne découvre pas un vide. */
export const MARGE_FENETRE = 0.25;

/**
 * @param {object} o
 * @param {string} o.id  identifiant de la couche (celui de la scène)
 * @param {string} o.urlGrille  adresse du manifeste de grille
 * @param {object} o.THREE  three.js
 * @param {(renderer: object) => object} o.creerChargeur  un GLTFLoader prêt (décodeurs compris, dont le KTX2 : il reçoit le moteur de rendu) ; `liberer()` facultatif
 * @param {object} o.carte  la carte MapLibre
 * @param {(ancrage:object) => number} o.altitudeBase  altitude (m) du plan `y = 0` de la dalle selon le relief de la carte
 * @param {(url:string) => Promise<any>} o.fetchJson
 * @param {(url:string, max:number) => Promise<ArrayBuffer>} o.fetchOctets
 * @param {(texte:string) => string} [o.attributionSure]
 * @param {{warn:Function}} [o.journal]
 */
export function creerCoucheDalles({
  id, urlGrille, THREE, creerChargeur, carte, altitudeBase, fetchJson, fetchOctets, attributionSure = (t) => t, journal = console,
  budgetOctets = BUDGET_OCTETS_DEFAUT, parallelisme = PARALLELISME_DEFAUT, planifier = setTimeout, annuler = clearTimeout,
}) {
  const idCouche = 'dalles3d-' + id, idAttribution = 'dalles3d-attribution-' + id;
  let grille = null, scene = null, camera = null, renderer = null, chargeur = null;
  let visible = true, retire = false, enMarche = 0, minuterie = null, versionVue = '', origine = null, generation = 0, dernierBbox = null;
  const dispo = new Map();         // identifiant -> dalle disponible (lireDisponibilite)
  const ancrages = new Map();      // identifiant -> { empreinte, ancrage }
  const chargesPar = new Map();    // identifiant -> Set des niveaux chargés
  const affiche = new Map();       // identifiant -> clé du groupe visible
  const attente = new Map();       // clé -> { cle, url, identifiant, niveau, empreinte, octets, priorite }
  const enCours = new Set();       // clés en téléchargement
  const echecs = new Map();        // clé -> raison (un GLB en échec n'est pas redemandé à chaque mouvement)
  const cache = creerCacheLRU(budgetOctets, (cle, groupe) => liberer(cle, groupe));
  const cleDe = (identifiant, niveau, empreinte) => identifiant + '|' + niveau + '|' + empreinte;

  function liberer(cle, groupe) {
    if (scene && groupe) scene.remove(groupe);
    if (groupe) groupe.traverse((o) => {
      if (o.geometry && o.geometry.dispose) o.geometry.dispose();
      for (const m of (Array.isArray(o.material) ? o.material : o.material ? [o.material] : [])) { for (const k of Object.keys(m)) if (m[k] && m[k].isTexture) m[k].dispose(); if (m.dispose) m.dispose(); }
    });
    const [identifiant, niveau] = cle.split('|');
    const s = chargesPar.get(identifiant); if (s) { s.delete(niveau); if (!s.size) chargesPar.delete(identifiant); }
    for (const [i, c] of affiche) if (c === cle) affiche.delete(i);
  }

  /**
   * La position de l’œil de la caméra, en unités Mercator. MapLibre 5 n’a pas de `getFreeCameraOptions` : sa caméra est `transform.cameraPosition`, en pixels-monde
   * (x, y et altitude), qu’on ramène en Mercator par `transform.worldSize`. Sans elle (carte simulée), le centre de la carte au sol : la distance est alors celle du point visé,
   * pas de l’œil, et le niveau de détail choisi est un peu trop grossier de près.
   */
  function positionCamera() {
    try {
      const t = carte.transform, c = t && t.cameraPosition, ws = t && t.worldSize;
      if (c && c.length >= 3 && Number.isFinite(ws) && ws > 0 && [c[0], c[1], c[2]].every(Number.isFinite)) return [c[0] / ws, c[1] / ws, c[2] / ws];
    } catch (e) { /* caméra illisible : repli ci-dessous */ }
    const c = carte.getCenter(); const [x, y] = mercator(c.lng, c.lat); return [x, y, 0];
  }

  function bboxFenetre() {
    const b = carte.getBounds(); const w = b.getWest(), s = b.getSouth(), e = b.getEast(), n = b.getNorth(), dx = (e - w) * MARGE_FENETRE, dy = (n - s) * MARGE_FENETRE;
    return [Math.max(-180, w - dx), Math.max(-85, s - dy), Math.min(180, e + dx), Math.min(85, n + dy)];
  }

  async function lireAncrageDe(dalle) {
    const connu = ancrages.get(dalle.identifiant);
    if (connu && connu.empreinte === dalle.empreinteAncrage) return connu.ancrage;
    const json = await fetchJson(urlGabarit(grille.gabarits.ancrage, { E: dalle.E, N: dalle.N }, grille.base));
    const ancrage = lireAncrage(json); ancrages.set(dalle.identifiant, { empreinte: dalle.empreinteAncrage, ancrage });
    if (!origine) origine = { ancrage };   // l'origine commune : la première dalle posée, stable pour toute la session de la couche
    return ancrage;
  }

  /** Recalcule ce qu'il faut demander et ce qu'il faut montrer. À rappeler à chaque changement de la liste, de la vue ou d'un chargement. */
  async function programmer() {
    if (retire || !grille) return;
    const maGeneration = ++generation, cam = positionCamera();
    const proches = [...dispo.values()].map((d) => {
      const a = ancrages.get(d.identifiant)?.ancrage;
      return { d, a, dist: a ? distanceM(cam, [...mercator(...a.origine), (a.altitudeOrigine * metreEnMercator(a.origine[1]))], a.origine[1]) : Infinity };
    }).sort((p, q) => p.dist - q.dist).slice(0, PLAFOND_DALLES_VUE);
    // les ancrages manquants d'abord (petits fichiers) : sans eux, ni distance ni pose
    await Promise.all(proches.filter((p) => !p.a).map(async (p) => {
      try { p.a = await lireAncrageDe(p.d); p.dist = distanceM(cam, [...mercator(...p.a.origine), p.a.altitudeOrigine * metreEnMercator(p.a.origine[1])], p.a.origine[1]); }
      catch (e) { journal.warn('[Atlas dalles3d] ancrage illisible pour ' + p.d.identifiant + ' : ' + (e && e.message)); }
    }));
    if (retire || maGeneration !== generation) return;   // une programmation plus récente a pris la main
    attente.clear();
    for (const { d, a, dist } of proches) {
      if (!a) continue;
      const voulu = niveauPourDistance(grille.niveaux, d.niveaux.map((n) => n.niveau), dist);
      if (!voulu) { affiche.delete(d.identifiant); continue; }
      const n = d.niveaux.find((x) => x.niveau === voulu), cle = cleDe(d.identifiant, voulu, n.empreinte);
      if (!cache.has(cle) && !enCours.has(cle) && !echecs.has(cle)) {
        try { attente.set(cle, { cle, url: urlGabarit(grille.gabarits.glb, { E: d.E, N: d.N, niveau: voulu }, grille.base), identifiant: d.identifiant, niveau: voulu, empreinte: n.empreinte, octets: n.octets, priorite: dist }); }
        catch (e) { echecs.set(cle, String(e.message)); journal.warn('[Atlas dalles3d] ' + e.message); }
      }
      const chargesDalle = [...(chargesPar.get(d.identifiant) || [])];
      const montre = niveauAffiche(voulu, chargesDalle);
      const empreinteMontre = montre && d.niveaux.find((x) => x.niveau === montre)?.empreinte;
      if (montre && empreinteMontre) { affiche.set(d.identifiant, cleDe(d.identifiant, montre, empreinteMontre)); cache.get(affiche.get(d.identifiant)); } else affiche.delete(d.identifiant);
    }
    majVisibilite(); pomper(); carte.triggerRepaint();
  }

  function pomper() {
    while (enMarche < parallelisme && attente.size && !retire) {
      const [cle, t] = [...attente.entries()].sort((a, b) => a[1].priorite - b[1].priorite)[0];
      attente.delete(cle); enCours.add(cle); enMarche++;
      telecharger(t).catch((e) => { echecs.set(cle, String((e && e.message) || e)); journal.warn('[Atlas dalles3d] ' + t.identifiant + ' ' + t.niveau + ' : ' + ((e && e.message) || e)); })
        .finally(() => { enCours.delete(cle); enMarche--; if (!retire) { programmer(); } });
    }
  }

  async function telecharger(t) {
    const octets = await fetchOctets(t.url, PLAFOND_OCTETS_GLB);
    if (retire) return;
    const gltf = await new Promise((ok, ko) => chargeur.parse(octets, '', ok, ko));
    if (retire) { return; }
    const groupe = new THREE.Group(); groupe.add(gltf.scene); groupe.matrixAutoUpdate = false; groupe.visible = false; groupe.userData.cle = t.cle;
    groupe.traverse((o) => { o.frustumCulled = false; });   // la matrice de projection est posée à la main : le test de pyramide de vue de three.js ne vaut rien ici
    scene.add(groupe); cache.set(t.cle, groupe, octets.byteLength || t.octets);
    let s = chargesPar.get(t.identifiant); if (!s) chargesPar.set(t.identifiant, (s = new Set())); s.add(t.niveau);
  }

  function majVisibilite() {
    const montres = new Set(affiche.values());
    for (const [cle, groupe] of groupes()) groupe.visible = visible && montres.has(cle);
  }
  /** Les groupes du cache, sans changer leur rang d'usage. */
  function groupes() { return scene ? scene.children.filter((c) => c.userData && c.userData.cle).map((c) => [c.userData.cle, c]) : []; }

  async function rafraichir() {
    if (retire || !grille) return;
    const bbox = bboxFenetre(); dernierBbox = bbox;
    const json = await fetchJson(urlDisponibilite(grille, bbox));
    const d = lireDisponibilite(json);
    if (versionVue && d.version && d.version !== versionVue) { viderTout(); }   // la Fabrique a republié : tout se relit
    versionVue = d.version || versionVue;
    dispo.clear(); for (const x of d.dalles) dispo.set(x.identifiant, x);
    await programmer();
  }

  function viderTout() {
    for (const cle of cache.cles()) { const g = cache.get(cle); cache.delete(cle); liberer(cle, g); }
    ancrages.clear(); chargesPar.clear(); affiche.clear(); attente.clear(); echecs.clear(); origine = null;
  }

  const surMouvement = () => { if (minuterie) annuler(minuterie); minuterie = planifier(() => { minuterie = null; rafraichir().catch((e) => journal.warn('[Atlas dalles3d] ' + (e && e.message))); }, DELAI_FIN_DE_MOUVEMENT_MS); };

  /** La couche MapLibre personnalisée. */
  const specification = {
    id: idCouche, type: 'custom', renderingMode: '3d',
    onAdd(m, gl) {
      scene = new THREE.Scene(); camera = new THREE.Camera();
      scene.add(new THREE.HemisphereLight(0xffffff, 0xb4b8c0, 2.1));
      const soleil = new THREE.DirectionalLight(0xffffff, 2.8); soleil.position.set(0.45, 1, 0.3); scene.add(soleil);
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true }); renderer.autoClear = false;
      // les couleurs de sommet du glTF sont LINÉAIRES : sans encodage de sortie sRGB, tout sortirait trop sombre (explicite, même si c'est le défaut de three.js)
      if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
      chargeur = creerChargeur(renderer);   // le moteur de rendu : KTX2Loader en a besoin pour choisir le format de texture du GPU
    },
    render(gl, matrice) {
      if (!renderer || !visible || !origine) return;
      let arr = null;
      if (matrice) {
        if (Array.isArray(matrice) || ArrayBuffer.isView(matrice)) arr = matrice;
        else arr = (matrice.defaultProjectionData && matrice.defaultProjectionData.mainMatrix) || matrice.modelViewProjectionMatrix || matrice.mainMatrix || matrice.matrix || null;
      }
      if (!arr || !(arr.length >= 16)) return;
      const commun = matriceDalle(origine.ancrage, altitudeBase(origine.ancrage)), inv = inverse4(commun);
      if (!inv) return;
      for (const [cle, g] of groupes()) {
        if (!g.visible) continue;
        const a = ancrages.get(cle.split('|')[0])?.ancrage; if (!a) { g.visible = false; continue; }
        g.matrix.fromArray(produit4(inv, matriceDalle(a, altitudeBase(a)))); g.matrixWorldNeedsUpdate = true;
      }
      camera.projectionMatrix.fromArray(arr).multiply(new THREE.Matrix4().fromArray(commun));
      const cv = carte.getCanvas(); renderer.setViewport(0, 0, cv.width, cv.height);
      renderer.resetState(); renderer.render(scene, camera);
    },
    onRemove() { retirer(); },
  };

  /** Lit le manifeste puis la première liste de dalles ; la couche est ajoutée à la carte. @returns {{n:number, version:string}} */
  async function charger() {
    const json = await fetchJson(urlGrille);
    grille = lireGrille(json, urlGrille); versionVue = '';
    if (grille.mention) {
      try { carte.addSource(idAttribution, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: attributionSure(grille.mention) }); } catch (e) { /* une carte sans source géojson ne perd que la mention */ }
    }
    carte.addLayer(specification);
    carte.on('moveend', surMouvement);
    await rafraichir();
    return { n: dispo.size, version: versionVue };
  }

  function retirer() {
    if (retire) return; retire = true;
    if (minuterie) annuler(minuterie);
    try { carte.off('moveend', surMouvement); } catch (e) { /* carte déjà détruite */ }
    try { if (carte.getLayer(idCouche)) carte.removeLayer(idCouche); if (carte.getSource(idAttribution)) carte.removeSource(idAttribution); } catch (e) { /* idem */ }
    viderTout();
    if (chargeur && typeof chargeur.liberer === 'function') chargeur.liberer();
    chargeur = null;
    if (renderer && renderer.dispose) renderer.dispose();
    renderer = null; scene = null;
  }

  return {
    id: idCouche, specification, charger, retirer,
    montrer(v) { visible = !!v; majVisibilite(); carte.triggerRepaint(); return visible; },
    estVisible: () => visible,
    /** Emprise des dalles connues, `[[ouest, sud], [est, nord]]`, ou null tant qu'aucun ancrage n'est lu. */
    bornes() {
      let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
      for (const { ancrage } of ancrages.values()) { const [lng, lat] = ancrage.origine, dl = 100 / (111320 * Math.cos(lat * Math.PI / 180)), dp = 100 / 110540; w = Math.min(w, lng - dl); e = Math.max(e, lng + dl); s = Math.min(s, lat - dp); n = Math.max(n, lat + dp); }
      return Number.isFinite(w) ? [[w, s], [e, n]] : null;
    },
    etat: () => ({ version: versionVue, disponibles: dispo.size, ancrages: ancrages.size, enCache: cache.taille, octets: cache.octets, enAttente: attente.size, enCours: enCours.size, affiches: [...affiche.values()], echecs: Object.fromEntries(echecs), dernierBbox }),
    /** Pour les tests : relance une lecture complète. */
    rafraichir,
  };
}

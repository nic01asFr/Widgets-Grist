/**
 * Une table PostgreSQL en TUILES VECTORIELLES (PBF) : le mode des gros volumes.
 *
 * ## Pourquoi
 * Le GeoJSON (`pg-direct.js`) charge toutes les entités de la zone dans la page : 4,8 Mo pour 27 750 points, 743 ms côté base, et le plafond du contrat
 * (10 000 par défaut) coupe au-delà. Une tuile PBF (`/rpc/tuile` du contrat SQL) ne porte que ce qui tient dans un carré de la carte : 0,12 Mo compressé à z12 pour
 * 5 000 points, 23 ms. MapLibre les lit nativement, ne garde rien en JSON, et ne demande que les tuiles de la zone visible.
 *
 * ## Ce que ce mode est, et n'est pas
 *  - même interface que `creerCoucheDirecte` (`demarrer`, `arreter`, `relire`, `entites`, `ids`, `etat`) : la liste, l'œil, le zoom, le menu et l'édition marchent sans changement ;
 *  - lecture et dessin : couleur unie, pas de symbologie par classes (elle demande les données entières) ;
 *  - les coordonnées sont quantifiées (4 096 par tuile) : parfait pour dessiner, pas pour mesurer ;
 *  - une tuile est PLAFONNÉE côté base (`limite` par tuile) : le zoom minimal (`zoomMinimal`) empêche de demander des tuiles trop denses, et en dessous la couche dit « zoomez » au lieu
 *    de montrer un résultat qui se ferait passer pour complet.
 *
 * ## Le jeton
 * MapLibre lit lui-même les tuiles : l'en-tête `Authorization: Bearer` est posé par `transformRequest`, de façon SYNCHRONE, avec le jeton que le client détient. Un minuteur le
 * renouvelle avant son expiration ; un 401 le renouvelle aussi, et relit la source. Le jeton n'est envoyé qu'à l'adresse de PostgREST, jamais à une autre.
 *
 * Module sans DOM : la carte, le client et le minuteur sont injectés ; il se teste sous Node.
 */

export const SEUIL_TUILES = 20000;
export const TYPE_MEDIA_TUILE = 'application/vnd.mapbox-vector-tile';
export const RENOUVELLEMENT_MS = 20000;
export const ZOOM_MAX = 22;

const typeIn = (types) => ['in', ['geometry-type'], ['literal', types]];

/**
 * Les tuiles conviennent-elles à cette table ? Oui si le contrat les annonce ET que la table est grande (au-delà, le GeoJSON serait tronqué ou lourd).
 * @param {{lignesEstimees?: number|null, capacites?: string[]}} p
 * @returns {'tuiles'|'geojson'}
 */
export function modeDe({ lignesEstimees, capacites = [] } = {}) {
  return capacites.includes('tuiles') && Number.isFinite(lignesEstimees) && lignesEstimees > SEUIL_TUILES ? 'tuiles' : 'geojson';
}

/** Le zoom en dessous duquel on ne demande pas de tuiles : plus la table est grande, plus il faut s'approcher (sinon une tuile dépasserait son plafond). */
export function zoomMinimal(lignesEstimees) {
  if (!Number.isFinite(lignesEstimees) || lignesEstimees < 0) return 10;
  if (lignesEstimees <= 50000) return 9;
  if (lignesEstimees <= 200000) return 11;
  if (lignesEstimees <= 1000000) return 12;
  return 13;
}

/**
 * Le gabarit d'adresse des tuiles (`{z}`, `{x}`, `{y}` sont ceux de MapLibre).
 * @param {string} racine  l'adresse de PostgREST
 * @param {{schema:string, table:string, colonnes?: string[]}} t
 */
export function gabaritTuiles(racine, { schema, table, colonnes } = {}) {
  const base = String(racine || '').replace(/\/+$/, '');
  const q = [`schema_nom=${encodeURIComponent(schema)}`, `table_nom=${encodeURIComponent(table)}`];
  if (Array.isArray(colonnes) && colonnes.length) q.push(`colonnes=${encodeURIComponent('{' + colonnes.join(',') + '}')}`);
  return `${base}/rpc/tuile?${q.join('&')}&z={z}&x={x}&y={y}`;
}

/** Les en-têtes d'une requête de tuile (le jeton : seul ce qui doit voyager). */
export function entetesTuile(jeton) {
  return jeton ? { Authorization: 'Bearer ' + jeton, Accept: TYPE_MEDIA_TUILE, 'Accept-Profile': 'atlas' } : { Accept: TYPE_MEDIA_TUILE, 'Accept-Profile': 'atlas' };
}

/**
 * Pose UNE transformation de requêtes sur la carte, partagée par toutes les couches en tuiles : chacune enregistre l'adresse de ses tuiles et la façon d'en lire le jeton.
 * Une requête de tuile vers une autre adresse ne reçoit jamais rien.
 * @returns {(prefixe:string, entetes:()=>object) => () => void}  `enregistrer(prefixe, entetes)` rend de quoi se désinscrire
 */
export function registreTransformation(carte) {
  if (!carte.__pgTuiles) {
    const registre = new Map();
    carte.__pgTuiles = registre;
    carte.setTransformRequest((url, type) => {
      if (type === 'Tile') {
        for (const [prefixe, entetes] of registre) if (String(url).startsWith(prefixe)) return { url, headers: entetes() };
      }
      return { url };
    });
  }
  return (prefixe, entetes) => {
    carte.__pgTuiles.set(prefixe, entetes);
    return () => { if (carte.__pgTuiles.get(prefixe) === entetes) carte.__pgTuiles.delete(prefixe); };
  };
}

/** Les identifiants MapLibre d'une couche en tuiles (la même forme que `identifiantsDirects`). */
export function identifiantsTuiles(id) {
  const base = `pg-tuiles-${id}`;
  return { source: base, surface: `${base}-surface`, ligne: `${base}-ligne`, point: `${base}-point` };
}

/**
 * @param {object} o
 * @param {object} o.carte  carte MapLibre (`setTransformRequest`, `addSource`, `addLayer`, `getLayer`, `getSource`, `removeLayer`, `removeSource`, `getZoom`, `on`, `off`, `queryRenderedFeatures`, `querySourceFeatures`)
 * @param {{tuiles: () => Promise<{racine:string}>, jetonCourant: () => string|null, garantirJeton: () => Promise<string>, renouveler: () => Promise<string>}} o.client
 * @param {{connexion:string, schema:string, table:string}} o.params
 * @param {string} o.id
 * @param {string} [o.couleur]
 * @param {number} [o.lignesEstimees]
 * @param {string[]} [o.colonnes]  les attributs à embarquer (par défaut : tous, ce que l'édition demande)
 * @param {(etat:object)=>void} [o.surEtat]
 * @param {{set:Function, clear:Function}} [o.minuteur]  `set(f, ms)` répété ; `clear(t)`
 * @param {{ids: object, poser: (gabarit:string, zoomMin:number)=>void}} [o.rendu]  l'hôte porte une VRAIE couche (liste, ordre, légende, style : `pg-couche-atlas.js`) :
 *   `poser` lui donne l'adresse des tuiles et le zoom minimal, et c'est lui qui pose la source et les couches MapLibre et qui les retire
 */
export function creerCoucheTuiles({
  carte, client, params, id, couleur = '#d62728', lignesEstimees = null, colonnes,
  minuteur = { set: (f, ms) => setInterval(f, ms), clear: (t) => clearInterval(t) }, surEtat = () => {}, rendu = null,
}) {
  const ids = rendu ? rendu.ids : identifiantsTuiles(id);
  const zoomMin = zoomMinimal(lignesEstimees);
  const etat = { phase: 'repos', nb: 0, tronque: false, avertissements: [], erreur: '', message: '' };
  let actif = false;
  let desinscrire = null;
  let veille = null;
  let racine = '';
  let gabarit = '';
  let derniereVue = null; // la dernière vue où des entités étaient affichées : de quoi « zoomer sur la couche » quand rien n'est chargé

  const publier = () => surEtat({ ...etat, avertissements: [...etat.avertissements] });

  function entitesVisibles() {
    const couches = [ids.surface, ids.ligne, ids.point].filter((c) => carte.getLayer(c));
    if (!couches.length) return 0;
    const vus = new Set();
    let sans = 0;
    for (const f of carte.queryRenderedFeatures({ layers: couches })) {
      const cle = f.properties && f.properties[(params.cle || 'id')];
      if (cle === undefined || cle === null) sans += 1; else vus.add(cle);
    }
    return vus.size + sans;
  }

  function majEtat() {
    if (!actif) return;
    if (carte.getZoom() < zoomMin) {
      etat.phase = 'ok'; etat.nb = 0; etat.message = `zoomez (niveau ${zoomMin} au moins) : table de ${Number(lignesEstimees || 0).toLocaleString('fr-FR')} lignes`;
    } else {
      etat.phase = 'ok'; etat.nb = entitesVisibles();
      if (etat.nb > 0 && typeof carte.getCenter === 'function') derniereVue = { centre: carte.getCenter(), zoom: carte.getZoom() };
      etat.message = `${Number(etat.nb).toLocaleString('fr-FR')} entité${etat.nb > 1 ? 's' : ''} affichée${etat.nb > 1 ? 's' : ''} (tuiles)`;
    }
    publier();
  }

  function monter() {
    if (rendu) { rendu.poser(gabarit, zoomMin); return; }
    if (!carte.getSource(ids.source)) {
      carte.addSource(ids.source, { type: 'vector', tiles: [gabarit], minzoom: 0, maxzoom: ZOOM_MAX });
    }
    const commun = { source: ids.source, 'source-layer': params.table, minzoom: zoomMin };
    if (!carte.getLayer(ids.surface)) carte.addLayer({ id: ids.surface, type: 'fill', ...commun, filter: typeIn(['Polygon']), paint: { 'fill-color': couleur, 'fill-opacity': 0.3 } });
    if (!carte.getLayer(ids.ligne)) carte.addLayer({ id: ids.ligne, type: 'line', ...commun, filter: typeIn(['Polygon', 'LineString']), paint: { 'line-color': couleur, 'line-width': 1.5 } });
    if (!carte.getLayer(ids.point)) {
      carte.addLayer({ id: ids.point, type: 'circle', ...commun, filter: typeIn(['Point']), paint: { 'circle-color': couleur, 'circle-radius': 4, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 } });
    }
  }

  // Un 401 de PostgREST (jeton expiré entre deux renouvellements) : un nouveau jeton, et la source relit ses tuiles.
  async function surErreurCarte(e) {
    if (!actif || !e || e.sourceId !== ids.source) return;
    const statut = e.error && (e.error.status || e.status);
    if (statut === 401) {
      try {
        await client.renouveler();
        const s = carte.getSource(ids.source);
        if (s && typeof s.setTiles === 'function') s.setTiles([gabarit]);
      } catch (err) {
        etat.phase = 'erreur'; etat.erreur = `Tuiles : jeton non renouvelé (${(err && err.message) || err})`; publier();
      }
    } else if (statut && statut !== 404) {
      etat.phase = 'erreur'; etat.erreur = `Tuiles : erreur ${statut} de PostgREST`; publier();
    }
  }

  return {
    id, params, etat, ids, mode: 'tuiles', zoomMinimal: zoomMin,
    /** Pose la source et les couches, enregistre le jeton et lit l'état de la carte. */
    async demarrer() {
      if (actif) { majEtat(); return; }
      actif = true;
      etat.phase = 'lecture'; etat.message = ''; publier();
      try {
        ({ racine } = await client.tuiles());
        gabarit = gabaritTuiles(racine, { schema: params.schema, table: params.table, colonnes });
        const enregistrer = registreTransformation(carte);
        desinscrire = enregistrer(`${String(racine).replace(/\/+$/, '')}/rpc/tuile`, () => entetesTuile(client.jetonCourant()));
        monter();
        carte.on('moveend', majEtat);
        carte.on('idle', majEtat);
        carte.on('error', surErreurCarte);
        veille = minuteur.set(() => { client.garantirJeton().catch(() => {}); }, RENOUVELLEMENT_MS);
        etat.avertissements = ['Mode tuiles : lecture seule, couleur unie ; jusqu’à une limite d’entités par tuile fixée par la base.'];
        majEtat();
      } catch (e) {
        actif = false;
        etat.phase = 'erreur'; etat.erreur = (e && e.message) || String(e); publier();
        throw e;
      }
    },
    relire() {
      const s = carte.getSource(ids.source);
      if (s && typeof s.setTiles === 'function') s.setTiles([gabarit]);
      majEtat();
    },
    /** La dernière vue où la couche montrait des entités (ou `null`). */
    derniereVue: () => derniereVue,
    /** Les entités des tuiles déjà chargées (pour cadrer la couche) : rien de plus. */
    entites: () => {
      try { return carte.querySourceFeatures(ids.source, { sourceLayer: params.table }); } catch { return []; }
    },
    arreter() {
      actif = false;
      if (veille !== null) { minuteur.clear(veille); veille = null; }
      if (desinscrire) { desinscrire(); desinscrire = null; }
      carte.off('moveend', majEtat);
      carte.off('idle', majEtat);
      carte.off('error', surErreurCarte);
      if (rendu) return; // la couche est celle de l'hôte : c'est lui qui la retire
      for (const c of [ids.point, ids.ligne, ids.surface]) if (carte.getLayer(c)) carte.removeLayer(c);
      if (carte.getSource(ids.source)) carte.removeSource(ids.source);
    },
  };
}

/**
 * Q2GAtlasHost : adaptateur entre qgis2grist et le composant Atlas (<atlas-bi> / client BI, contrat 0.3).
 *
 * Module pur : aucun acces DOM, window ni reseau. Le client Atlas est INJECTE (client cree par
 * `creerClient` d'Atlas, ou `depuisElement(<atlas-bi>)`, ou un faux client dans les tests).
 * Atlas n'est jamais modifie : ce module ne fait que parler son contrat (CONTRAT-CARTE-BI.md,
 * EXPLOITATION-EXTERNE-BI.md), en lecture seule.
 *
 * Ce que fait le module :
 *  1. construit le manifeste BI et les Features envoyes a `setScene` a partir des couches importees
 *     et des lignes lues dans Grist (reutilise scene-manifest.js, controls-from-layer.js via
 *     scene-manifest.js, et rowToFeature de maplibre-bridge.js, sans les modifier) ;
 *  2. synchronise de facon incrementale : une empreinte par couche, et seulement
 *     `setScene({ fusion: true, layers: [couches modifiees] })` pour les couches changees,
 *     jamais `updateFeature` en boucle ; suspension possible ;
 *  3. transforme `select` / `hover` / `filter` / `action` d'Atlas en rappels du widget
 *     (couche + identifiant de ligne Grist) ;
 *  4. cadrage (fitTo / flyTo), visibilite de couche, filtres par controle, legende, theme, fond ;
 *  5. erreurs typees (`ErreurHoteAtlas`, propriete `repli`) pour retomber sur l'ancienne carte.
 *
 * Dependances injectees (toutes facultatives sauf `client`) : { client, sceneManifest, carte }.
 *   - sceneManifest : module de lib/scene-manifest.js (`buildSceneManifest`) ;
 *   - carte : module de lib/maplibre-bridge.js (`rowToFeature`).
 * Resolution, dans l'ordre : injection, require('./...'), puis globaux (Q2G, Q2GMap).
 *
 * Identifiants. Une Feature BI porte un `id` entier UNIQUE DANS TOUTE LA SCENE (contrat, section 5) ;
 * or deux tables Grist ont des ids de ligne qui se recouvrent. Le module attribue donc un entier de
 * scene par (couche, ligne), stable d'un envoi a l'autre, et declare `cle: '_row_id'` : l'evenement
 * `select` rend la ligne Grist dans `key`. L'identifiant de ligne Grist reste la verite cote widget.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Q2GAtlasHost = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  /** Au-dela, Atlas avertit et conseille d'agreger (diagnostic-donnees.js, SEUIL_VOLUME). Information, jamais un refus. */
  const SEUIL_VOLUME = 50000;

  const VERSION_MINIMALE = '0.3';

  /** Propriete portant l'id de ligne Grist dans chaque Feature, et cle metier declaree au manifeste. */
  const CLE_LIGNE = '_row_id';

  // ---------------------------------------------------------------------------
  // Erreurs typees
  // ---------------------------------------------------------------------------

  /**
   * Codes : client_absent, connexion_refusee, version_non_negociee, capacite_absente, delai, deconnecte,
   * scene_refusee, fusion_absente, commande.
   * `repli` vaut true quand l'appelant doit retomber sur l'ancienne carte (Atlas inutilisable).
   */
  class ErreurHoteAtlas extends Error {
    constructor(code, message, options) {
      super(message);
      this.name = 'ErreurHoteAtlas';
      this.code = code;
      const o = options || {};
      this.repli = o.repli === true;
      if (o.cause !== undefined) this.cause = o.cause;
      if (o.details !== undefined) this.details = o.details;
    }
  }

  /**
   * Classe une erreur du client Atlas (ErreurBi : propriete `code`) en erreur typee.
   * @param {*} e
   * @param {{connexion?: boolean, commande?: string}} [contexte] connexion : erreur survenue a la connexion
   */
  function classerErreur(e, contexte) {
    if (e instanceof ErreurHoteAtlas) return e;
    const ctx = contexte || {};
    const code = e && e.code ? String(e.code) : '';
    const texte = String((e && e.message) || e || 'erreur inconnue');
    const options = { cause: e, details: e && e.details };
    const prefixe = ctx.commande ? ctx.commande + ' : ' : '';
    if (code === 'origine' || code === 'composant') {
      return new ErreurHoteAtlas('connexion_refusee', prefixe + texte, { ...options, repli: true });
    }
    if (code === 'version') {
      return new ErreurHoteAtlas('version_non_negociee', prefixe + texte, { ...options, repli: true });
    }
    if (code === 'capacite_absente') {
      const err = new ErreurHoteAtlas('capacite_absente', prefixe + texte, { ...options, repli: true });
      if (e && e.capacite !== undefined) err.capacite = e.capacite;
      return err;
    }
    if (code === 'deconnecte') {
      return new ErreurHoteAtlas('deconnecte', prefixe + texte, { ...options, repli: true });
    }
    if (code === 'delai') {
      return new ErreurHoteAtlas('delai', prefixe + texte, { ...options, repli: ctx.connexion === true });
    }
    return new ErreurHoteAtlas('commande', prefixe + texte, { ...options, repli: ctx.connexion === true });
  }

  // ---------------------------------------------------------------------------
  // Dependances
  // ---------------------------------------------------------------------------

  function resoudreDependances(inj) {
    const d = inj || {};
    let sceneManifest = d.sceneManifest || null;
    let carte = d.carte || null;
    if (!sceneManifest) {
      try { if (typeof require === 'function') sceneManifest = require('./scene-manifest.js'); } catch (_) { sceneManifest = null; }
      if (!sceneManifest && root && root.Q2G && typeof root.Q2G.buildSceneManifest === 'function') sceneManifest = root.Q2G;
    }
    if (!carte) {
      try { if (typeof require === 'function') carte = require('./maplibre-bridge.js'); } catch (_) { carte = null; }
      if (!carte && root && root.Q2GMap) carte = root.Q2GMap;
    }
    if (!sceneManifest || typeof sceneManifest.buildSceneManifest !== 'function') {
      throw new Error('Q2GAtlasHost : module scene-manifest (buildSceneManifest) introuvable');
    }
    if (!carte || typeof carte.rowToFeature !== 'function') {
      throw new Error('Q2GAtlasHost : module maplibre-bridge (rowToFeature) introuvable');
    }
    return { sceneManifest, carte };
  }

  // ---------------------------------------------------------------------------
  // Empreintes (detection de changement par couche)
  // ---------------------------------------------------------------------------

  function fnv1a(str, graine) {
    let h = graine === undefined ? 0x811c9dc5 : graine >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function melanger(h) {
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  function texteValeur(v) {
    if (v === null || v === undefined) return '';
    const t = typeof v;
    if (t === 'string') return v;
    if (t === 'number' || t === 'boolean') return String(v);
    if (t === 'function') return null;
    try { return JSON.stringify(v); } catch (_) { return String(v); }
  }

  /** Empreinte 32 bits d'une ligne, independante de l'ordre des colonnes. */
  function empreinteLigne(row) {
    let acc = 0;
    for (const k of Object.keys(row)) {
      const s = texteValeur(row[k]);
      if (s === null) continue;
      acc = (acc + fnv1a(s, fnv1a(k))) >>> 0;
    }
    return melanger(acc);
  }

  /**
   * Empreinte d'un ensemble de lignes : independante de l'ordre des lignes et des colonnes.
   * Forme `n:somme:xor` (hexadecimal). Deux jeux differents d'une valeur dans une cellule donnent
   * deux empreintes differentes (probabilite de collision negligeable).
   * @param {object[]} rows
   * @returns {string}
   */
  function empreinteLignes(rows) {
    let somme = 0;
    let xor = 0;
    let n = 0;
    for (const row of (rows || [])) {
      if (!row || typeof row !== 'object') continue;
      const r = empreinteLigne(row);
      somme = (somme + r) >>> 0;
      xor = (xor ^ ((r << 13) | (r >>> 19))) >>> 0;
      n++;
    }
    return n + ':' + somme.toString(16) + ':' + xor.toString(16);
  }

  // ---------------------------------------------------------------------------
  // Identifiants de scene
  // ---------------------------------------------------------------------------

  /**
   * Alloue un entier unique dans toute la scene par (couche, ligne), stable tant que la ligne existe.
   * @param {number} [depart]
   */
  function creerAllocateurIds(depart) {
    let suivant = depart === undefined ? 1 : depart;
    const directs = new Map();   // couche -> Map(String(cle) -> id)
    const inverses = new Map();  // id -> { couche, ligne }
    return {
      /** Id de scene de (couche, ligne) ; l'attribue au besoin. `ligne` garde son type d'origine. */
      id(couche, cle, ligne) {
        let m = directs.get(couche);
        if (!m) { m = new Map(); directs.set(couche, m); }
        const k = String(cle);
        let id = m.get(k);
        if (id === undefined) {
          id = suivant++;
          m.set(k, id);
          inverses.set(id, { couche, ligne: ligne === undefined ? cle : ligne });
        }
        return id;
      },
      /** Id deja attribue, sinon null. */
      chercher(couche, cle) {
        const m = directs.get(couche);
        const id = m ? m.get(String(cle)) : undefined;
        return id === undefined ? null : id;
      },
      /** { couche, ligne } d'un id de scene, sinon null. */
      inverse(id) { return inverses.get(id) || null; },
      /** Oublie les lignes de la couche qui ne sont plus dans `gardees` (ensemble de String(cle)). */
      retenir(couche, gardees) {
        const m = directs.get(couche);
        if (!m) return;
        for (const [k, id] of m) {
          if (!gardees.has(k)) { m.delete(k); inverses.delete(id); }
        }
      },
      oublierCouche(couche) {
        const m = directs.get(couche);
        if (!m) return;
        for (const id of m.values()) inverses.delete(id);
        directs.delete(couche);
      },
      taille() { return inverses.size; },
    };
  }

  // ---------------------------------------------------------------------------
  // Manifeste et donnees
  // ---------------------------------------------------------------------------

  /** Identifiant de controle unique dans la scene (setFilter designe un controle par `id`). */
  function idControle(couche, controle) {
    const c = controle || {};
    let id = 'f-' + couche + '-' + c.field;
    if (c.type && c.type !== 'select') id += '-' + c.type;
    if (c.mode) id += '-' + c.mode;
    return id;
  }

  /** Vrai si l'import porte le panneau BigQgisMCP (curseur d'inondation), propre a un cas : ancienne carte (decision D2). */
  function necessiteCarteHeritee(meta) {
    if (!meta || typeof meta !== 'object') return { heritee: false, raison: null };
    if (meta.interactiveMap === 'flood' || meta.interactiveMap === 'temporal') {
      return { heritee: true, raison: 'bigqgismcp_' + meta.interactiveMap };
    }
    const inf = meta.inferredStyles;
    if (inf && (inf.floodStyle || inf.buildingStyle)) return { heritee: true, raison: 'bigqgismcp_styles' };
    if (meta.sliderMax != null && meta.sliderMax !== meta.sliderMin) return { heritee: true, raison: 'bigqgismcp_curseur' };
    return { heritee: false, raison: null };
  }

  const CHAMPS_TITRE = /^(nom|name|libelle|label|titre|title)$/i;
  const CHAMPS_GEOMETRIE = new Set(['geometry_json', 'centroid_lat', 'centroid_lon', 'latitude', 'longitude', 'fill_color']);

  /** Nombre de champs de la bulle : trois ; la fiche d'entite du widget porte tout le reste (plus de doublon bulle / fiche). */
  const BULLE_CHAMPS_MAX = 3;

  /** Bulle d'objet par defaut : titre = champ nom si present, jusqu'a 3 champs. Texte seulement (contrat 6 ter). */
  function bulleDepuisCouche(layer, lisibles) {
    const champs = (layer && layer.fields ? layer.fields : [])
      .filter((f) => f && f.name && !CHAMPS_GEOMETRIE.has(f.name) && f.name[0] !== '_');
    if (!champs.length) return null;
    const titreChamp = champs.find((f) => CHAMPS_TITRE.test(f.name));
    const liste = champs.filter((f) => f !== titreChamp).slice(0, BULLE_CHAMPS_MAX).map((f) => {
      const item = { champ: f.name };
      if (f.label && f.label !== f.name) item.libelle = f.label;
      if (f.gType === 'Numeric' || f.gType === 'Int') item.format = 'nombre';
      else if ((f.gType === 'Date' || f.gType === 'DateTime') && !(lisibles && lisibles.has(f.name))) item.format = 'date';   // une date deja mise en forme n'a plus de format
      return item;
    });
    const bulle = { titre: titreChamp ? '{' + titreChamp.name + '}' : (layer.displayName || 'Objet') };
    if (liste.length) bulle.champs = liste;
    return bulle;
  }

  // ---------------------------------------------------------------- pastille de volume

  function formaterNombre(n) {
    try { return n.toLocaleString('fr-FR'); } catch (_) { return String(n); }
  }

  /** « a l'instant », « il y a 12 s », « il y a 3 min » (maintenant : horodatage en ms, injectable). */
  function formaterDepuis(t, maintenant) {
    const sec = Math.max(0, Math.round(((Number.isFinite(maintenant) ? maintenant : Date.now()) - t) / 1000));
    if (sec < 5) return 'à l’instant';
    if (sec < 60) return 'il y a ' + sec + ' s';
    return 'il y a ' + Math.floor(sec / 60) + ' min';
  }

  /**
   * Les trois morceaux de la pastille de volume, separes pour que l'interface ne reecrive que celui qui change avec le temps
   * (l'age de la synchronisation) : { total: '6 565 entités', filtre: '1 704 après filtre' | '', age: 'à jour il y a 3 s' | '' }.
   * Un total illisible donne trois chaines vides.
   * @param {{total:number, filtre?:number, filtreActif?:boolean, derniereSync?:number, direct?:boolean, maintenant?:number}} e
   */
  function partiesVolume(e) {
    const o = e || {};
    if (!Number.isFinite(o.total) || o.total < 0) return { total: '', filtre: '', age: '' };
    return {
      total: formaterNombre(o.total) + (o.total > 1 ? ' entités' : ' entité'),
      filtre: o.filtreActif && Number.isFinite(o.filtre) ? formaterNombre(o.filtre) + ' après filtre' : '',
      age: o.direct && Number.isFinite(o.derniereSync) ? 'à jour ' + formaterDepuis(o.derniereSync, o.maintenant) : '',
    };
  }

  /**
   * Texte de la pastille de volume : « 6 565 entités · 1 704 après filtre · à jour il y a 3 s ».
   * @param {{total:number, filtre?:number, filtreActif?:boolean, derniereSync?:number, direct?:boolean, maintenant?:number}} e
   */
  function texteVolume(e) {
    const p = partiesVolume(e);
    return [p.total, p.filtre, p.age].filter(Boolean).join(' · ');
  }

  /** Camera annoncee par Atlas : { center: [lng, lat], zoom, pitch, bearing } bornee, ou null si elle est inexploitable. */
  function camerasure(charge) {
    if (!charge || typeof charge !== 'object' || !Array.isArray(charge.center) || charge.center.length < 2) return null;
    const [lng, lat] = charge.center;
    const zoom = charge.zoom;
    const fini = (v) => typeof v === 'number' && Number.isFinite(v);
    if (!fini(lng) || !fini(lat) || !fini(zoom) || Math.abs(lng) > 360 || Math.abs(lat) > 90 || zoom < 0 || zoom > 24) return null;
    return {
      center: [lng, lat],
      zoom,
      pitch: fini(charge.pitch) && charge.pitch >= 0 && charge.pitch <= 85 ? charge.pitch : 0,
      bearing: fini(charge.bearing) && Math.abs(charge.bearing) <= 360 ? charge.bearing : 0,
    };
  }

  /** Une couche n'est pas montee par Atlas si ses entites ne sont pas des lignes Grist (profil C, source externe). */
  function raisonIgnoree(def) {
    if (def.profile === 'C') return 'profil_c';
    const t = def.source && def.source.type;
    if (t && t !== 'grist') return 'source_externe';
    return null;
  }

  /** Definition BI d'une couche : definition du manifeste + cle de ligne, ids de controles, bulle. */
  function definitionCouche(defBase, layer, options) {
    const o = options || {};
    const def = {
      ...defBase,
      cle: CLE_LIGNE,
      style: { declarative: defBase.style ? defBase.style.declarative : undefined },
      controls: (defBase.controls || []).map((c) => ({ ...c, id: idControle(defBase.id, c) })),
    };
    if (def.style.declarative === undefined) delete def.style;
    // Surface a couleur unique : l'ancienne carte la remplit a 55 % (_fill_opacity) ; sans opacite, le manifeste
    // (opacity: 1) la rend pleine et une limite administrative noire masque tout ce qui est dessous.
    else if (/polygon/i.test(String((layer && layer.geomType) || defBase.geometry_type || ''))
      && def.style.declarative && def.style.declarative.kind === 'single'
      && (def.style.declarative.opacity === undefined || def.style.declarative.opacity === 1)) {
      def.style = { ...def.style, declarative: { ...def.style.declarative, opacity: OPACITE_SURFACE_UNIE } };
    }
    const lisibles = champsLisibles(layer, defBase, o);
    // Un controle temporel lit la valeur brute (secondes) : il suit la copie `_brut_<champ>` quand le champ est mis en forme.
    // L'identifiant du controle ne change pas (calcule plus haut sur le champ d'origine).
    if (lisibles.size) def.controls = def.controls.map((c) => (c.type === 'time' && lisibles.has(c.field) ? { ...c, field: '_brut_' + c.field } : c));
    if (o.bulle !== false && !def.bulle) {
      const b = bulleDepuisCouche(layer, lisibles);
      if (b) def.bulle = b;
    }
    return def;
  }

  /** Reporte l'etat de filtre connu dans les controles d'une definition (un setScene remonte la couche). */
  function appliquerFiltres(def, filtres) {
    if (!filtres || !filtres.size || !def.controls || !def.controls.length) return def;
    let change = false;
    const controls = def.controls.map((c) => {
      if (!filtres.has(c.id)) return c;
      const v = filtres.get(c.id);
      let r = c;
      if (c.type === 'select' && Array.isArray(v)) r = { ...c, active: true, values: v.map(String) };
      else if ((c.type === 'range' || c.type === 'time') && v && typeof v === 'object') {
        r = { ...c, active: true };
        if (v.min != null) r.min = v.min;
        if (v.max != null) r.max = v.max;
      } else if (c.type === 'text') {
        const t = typeof v === 'string' ? v : (v && v.texte);
        if (t) r = { ...c, active: true, texte: t };
      }
      if (r !== c) change = true;
      return r;
    });
    return change ? { ...def, controls } : def;
  }

  // ---- Couleurs de donnees : le style QML de l'import reste la verite (decision D4) ----
  // Atlas colore par style declaratif (single / categorized / graduated sur un champ). Un style a regles
  // (ruleRenderer) ou une classification sur une valeur transformee n'a pas de forme declarative : la
  // couleur est alors portee par la propriete _fill_color de chaque Feature (calculee comme dans l'ancienne
  // carte) et le style devient une categorisation sur cette propriete. Le style natif est garde chaque fois
  // qu'il redonne les memes couleurs que la carte d'origine (echantillon de 300 entites, 98 % d'accord).

  const SEUIL_ACCORD_STYLE = 0.98;
  const OPACITE_SURFACE_UNIE = 0.55;
  const COULEURS_DISTINCTES_MAX = 200;

  function hexMin(c) { return typeof c === 'string' ? c.trim().toLowerCase() : ''; }

  /** Couleur que donnerait un style declaratif a une Feature, ou null (aucune classe ne correspond), ou undefined (non evaluable). */
  function couleurDeclarative(decl, props) {
    if (!decl || typeof decl !== 'object') return undefined;
    if (decl.kind === 'single') return decl.color || null;
    if (decl.kind === 'categorized') {
      if (!decl.field) return undefined;
      const v = props[decl.field];
      const s = v === null || v === undefined ? '' : String(v);
      const st = (decl.stops || []).find((x) => String(x.value) === s);
      return st ? (st.color || null) : null;
    }
    if (decl.kind === 'graduated') {
      if (!decl.field) return undefined;
      const stops = decl.stops || [];
      if (!stops.length) return undefined;
      const n = parseFloat(props[decl.field]);
      if (Number.isNaN(n)) return null;
      const hit = stops.find((r) => n >= r.lower && n <= r.upper);
      return (hit || stops[stops.length - 1]).color || null;
    }
    return undefined;
  }

  /**
   * Garde le style declaratif natif s'il redonne les couleurs des Features ; sinon le remplace par une
   * categorisation sur _fill_color (libelles repris des paliers du style d'origine quand leur couleur est la meme).
   * Pur : rend la definition (inchangee ou copiee).
   */
  function ajusterStyleDeclaratif(def, features) {
    const decl = def && def.style && def.style.declarative;
    const liste = features || [];
    if (!liste.length) return def;
    const pas = Math.max(1, Math.floor(liste.length / 300));
    let total = 0;
    let accord = 0;
    for (let i = 0; i < liste.length; i += pas) {
      const p = liste[i].properties || {};
      const attendu = hexMin(p._fill_color);
      const obtenu = couleurDeclarative(decl, p);
      total++;
      if (obtenu === undefined) { accord = 0; total = 1; break; }
      if (hexMin(obtenu) === attendu) accord++;
    }
    if (total && accord / total >= SEUIL_ACCORD_STYLE) return def;

    const compte = new Map();
    for (const f of liste) {
      const c = hexMin((f.properties || {})._fill_color);
      if (c) compte.set(c, (compte.get(c) || 0) + 1);
    }
    if (!compte.size) return def;
    const couleurs = [...compte.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    if (couleurs.length === 1) {
      return { ...def, style: { ...def.style, declarative: { kind: 'single', color: couleurs[0] } } };
    }
    const libelles = new Map();
    for (const st of ((decl && decl.stops) || [])) {
      const c = hexMin(st.color);
      const lib = String(st.label === undefined || st.label === null ? st.value : st.label);
      if (!c || !lib) continue;
      if (!libelles.has(c)) libelles.set(c, lib);
    }
    const retenues = couleurs.slice(0, COULEURS_DISTINCTES_MAX);
    const stops = retenues.map((c) => ({ value: c, label: libelles.get(c) || c, color: c }));
    return { ...def, style: { ...def.style, declarative: { kind: 'categorized', field: '_fill_color', stops } } };
  }

  /**
   * Couleur d'une ligne pour la carte Atlas. Comme l'ancienne carte (applyWaterLevel), une entite PONCTUELLE
   * prend la couleur ecrite dans la colonne fill_color de Grist, calculee a l'import sur les valeurs brutes du
   * QML (les listes de choix de Grist portent des libelles : refaire le calcul depuis le style donnerait la
   * couleur par defaut a toutes les classes). Les lignes et surfaces gardent la couleur du style.
   * @param {{geomType?: string, _color?: string}} layer
   * @param {object} row
   * @param {(row: object) => string|null} [calculer]  couleur selon le style de la couche
   */
  function couleurDeLigne(layer, row, calculer) {
    const fc = row && typeof row.fill_color === 'string' ? row.fill_color.trim() : '';
    const valide = /^#[0-9a-fA-F]{6}$/.test(fc);
    const ponctuel = /point/i.test(String((layer && layer.geomType) || ''));
    if (ponctuel && valide) return fc;
    const c = typeof calculer === 'function' ? calculer(row) : null;
    return c || (valide ? fc : ((layer && layer._color) || '#808080'));
  }

  // ---------------------------------------------------------------------------
  // Valeurs lisibles : dates (secondes Unix Grist) et references (numero de ligne -> libelle de la ligne cible)
  // ---------------------------------------------------------------------------

  /** Colonnes de la table cible, dans l'ordre de preference, pour libeller une reference (comparaison sans casse). */
  const COLONNES_LIBELLE = ['value_fr', 'value_en', 'name', 'nom', 'label', 'libelle', 'title', 'titre', 'description'];
  const COLONNE_TECHNIQUE = /^(id|manualsort|gristhelper_.*|geometry_json|centroid_lat|centroid_lon|latitude|longitude|fill_color|_.*)$/i;
  const SECONDES_MAX = 4e10;   // l'an 3200 : au-dela, ce n'est pas une date en secondes

  function typeAffichage(champ) {
    const t = champ && typeof champ.gType === 'string' ? champ.gType.split(':')[0] : '';
    if (t === 'Date' || t === 'DateTime') return 'date';
    if (t === 'Ref' || t === 'RefList') return 'ref';
    return null;
  }

  function deuxChiffres(n) { return (n < 10 ? '0' : '') + n; }

  /**
   * Une date Grist (secondes Unix) en jj/mm/aaaa, avec l'heure (hh:mm, et :ss si non nulles) pour un DateTime.
   * Une Date est lue en UTC (c'est ainsi que Grist la stocke) ; un DateTime dans `fuseau` (nom IANA, defaut UTC).
   * @returns {string|null} null si la valeur n'est pas une date en secondes
   */
  function formaterDate(valeur, avecHeure, fuseau) {
    const n = typeof valeur === 'number' ? valeur : (typeof valeur === 'string' && /^-?\d+(\.\d+)?$/.test(valeur.trim()) ? Number(valeur) : NaN);
    if (!Number.isFinite(n) || Math.abs(n) > SECONDES_MAX) return null;
    const d = new Date(n * 1000);
    if (Number.isNaN(d.getTime())) return null;
    if (!avecHeure) return deuxChiffres(d.getUTCDate()) + '/' + deuxChiffres(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
    let p = { j: d.getUTCDate(), m: d.getUTCMonth() + 1, a: d.getUTCFullYear(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
    if (fuseau && fuseau !== 'UTC' && typeof Intl !== 'undefined') {
      try {
        const parts = {};
        new Intl.DateTimeFormat('en-GB', { timeZone: fuseau, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
          .formatToParts(d).forEach((x) => { parts[x.type] = Number(x.value); });
        p = { j: parts.day, m: parts.month, a: parts.year, h: parts.hour % 24, mi: parts.minute, s: parts.second };
      } catch (_) { /* fuseau inconnu : UTC */ }
    }
    return deuxChiffres(p.j) + '/' + deuxChiffres(p.m) + '/' + p.a + ' ' + deuxChiffres(p.h) + ':' + deuxChiffres(p.mi) + (p.s ? ':' + deuxChiffres(p.s) : '');
  }

  /** La colonne qui sert de libelle dans une table cible (contenu colonaire de fetchTable) : nom prefere, sinon la premiere colonne de texte non technique. */
  function choisirColonneLibelle(colonnes) {
    if (!colonnes || typeof colonnes !== 'object') return null;
    const noms = Object.keys(colonnes).filter((k) => Array.isArray(colonnes[k]));
    for (const prefere of COLONNES_LIBELLE) {
      const hit = noms.find((k) => k.toLowerCase() === prefere);
      if (hit) return hit;
    }
    const estTexte = (k) => {
      let vu = 0;
      for (const v of colonnes[k]) {
        if (v === null || v === undefined || v === '') continue;
        if (typeof v !== 'string') return false;
        vu++;
      }
      return vu > 0;
    };
    return noms.find((k) => !COLONNE_TECHNIQUE.test(k) && estTexte(k)) || null;
  }

  /**
   * Libelles d'une table cible : Map(id de ligne -> texte). Table sans colonne de libelle ou vide : Map vide.
   * @param {object} colonnes contenu colonaire de fetchTable de la table cible
   * @returns {Map<number, string>}
   */
  function libellesDeTable(colonnes) {
    const sortie = new Map();
    const col = choisirColonneLibelle(colonnes);
    if (!col || !Array.isArray(colonnes.id)) return sortie;
    const valeurs = colonnes[col];
    for (let i = 0; i < colonnes.id.length; i++) {
      const v = valeurs[i];
      if (typeof v === 'string' && v.trim()) sortie.set(colonnes.id[i], v.trim().slice(0, 200));
    }
    return sortie;
  }

  function lireLibelle(libelles, id) {
    if (!libelles) return undefined;
    return typeof libelles.get === 'function' ? libelles.get(id) : libelles[id];
  }

  /** Une reference (numero de ligne) ou une liste de references ('L', 1, 2) en libelle(s) ; null si rien n'est resolu. */
  function formaterReference(valeur, libelles) {
    if (Array.isArray(valeur)) {
      const ids = valeur[0] === 'L' ? valeur.slice(1) : valeur;
      if (!ids.length) return null;
      let resolus = 0;
      const textes = ids.map((id) => {
        const l = lireLibelle(libelles, id);
        if (typeof l === 'string' && l) { resolus++; return l; }
        return String(id);
      });
      return resolus ? textes.join(', ') : null;
    }
    if (typeof valeur !== 'number' || !valeur) return null;
    const l = lireLibelle(libelles, valeur);
    return typeof l === 'string' && l ? l : null;
  }

  /**
   * La valeur lisible d'un champ, ou undefined quand il n'y a rien a changer (type ordinaire, valeur illisible, libelle inconnu).
   * @param {{name?:string, gType?:string}} champ
   * @param {*} valeur  valeur brute (secondes Unix, numero de ligne, liste de numeros)
   * @param {{libelles?: function(string):(Map|object|null), fuseau?: string}} [contexte]
   */
  function valeurLisible(champ, valeur, contexte) {
    const c = contexte || {};
    const type = typeAffichage(champ);
    if (!type || valeur === null || valeur === undefined || valeur === '') return undefined;
    if (type === 'date') {
      const t = formaterDate(valeur, String(champ.gType).split(':')[0] === 'DateTime', c.fuseau);
      return t === null ? undefined : t;
    }
    // Une reference vide vaut 0 dans Grist : on n'affiche pas un « 0 » qui ressemblerait a une valeur.
    if (valeur === 0) return '';
    const libelles = typeof c.libelles === 'function' ? c.libelles(champ.name) : null;
    const t = formaterReference(valeur, libelles);
    return t === null ? undefined : t;
  }

  /**
   * Les champs d'une couche dont la propriete envoyee a Atlas sera remplacee par une valeur lisible : types Date/DateTime/Ref/RefList,
   * hors champs dont la VALEUR BRUTE sert au style ou aux controles (comparaisons, plages, categories) : ceux-la restent bruts.
   * `options.lisibilite` absent : aucun champ (comportement d'origine).
   */
  function champsLisibles(layer, def, options) {
    const sortie = new Set();
    const o = options || {};
    if (!o.lisibilite || !layer || !Array.isArray(layer.fields)) return sortie;
    let utilises = '';
    // un controle temporel est redirige vers la valeur brute (`_brut_<champ>`, voir definitionCouche) : il ne protege pas le champ
    const controles = ((def && def.controls) || []).filter((c) => !c || c.type !== 'time');
    try { utilises = JSON.stringify({ s: def && def.style, c: controles, cle: def && def.cle }); } catch (_) { utilises = ''; }
    for (const f of layer.fields) {
      if (!f || !f.name || !typeAffichage(f)) continue;
      const noms = [f.name, f._rawKey, f.label].filter((x) => typeof x === 'string' && x);
      if (noms.some((n) => utilises.indexOf(JSON.stringify(n)) !== -1)) continue;
      sortie.add(f.name);
    }
    return sortie;
  }

  /**
   * Remplace dans `props` (proprietes d'une Feature) les valeurs des champs `lisibles` par leur forme lisible.
   * Les cles ne changent pas ; la valeur brute est gardee dans `_brut_<champ>` (jamais affichee : prefixe `_`).
   */
  function rendreProprietesLisibles(props, layer, lisibles, lisibilite) {
    if (!props || !lisibles || !lisibles.size || !layer) return props;
    const contexte = { libelles: (champ) => (typeof lisibilite.libelles === 'function' ? lisibilite.libelles(champ, layer) : null), fuseau: lisibilite.fuseau };
    for (const f of layer.fields) {
      if (!lisibles.has(f.name) || !(f.name in props)) continue;
      const brut = props[f.name];
      const lisible = valeurLisible(f, brut, contexte);
      if (lisible === undefined) continue;
      props['_brut_' + f.name] = brut;
      props[f.name] = lisible;
    }
    return props;
  }

  function cleLigne(row, index) {
    if (row.id !== undefined && row.id !== null && row.id !== '') return row.id;
    if (row._localId !== undefined && row._localId !== null) return row._localId;
    return 'i' + index;
  }

  /**
   * Features BI d'une couche a partir des lignes Grist. Une ligne sans geometrie lisible est comptee a part ;
   * une ligne masquee par le widget (`_map_visible === false`) n'est pas envoyee (Atlas n'a pas de filtre `_visible`).
   * @returns {{features: object[], masquees: number, sansGeometrie: number}}
   */
  function construireFeatures(couche, layer, rows, ids, carte, options) {
    const o = options || {};
    const features = [];
    const presentes = new Set();
    let masquees = 0;
    let sansGeometrie = 0;
    const liste = rows || [];
    for (let i = 0; i < liste.length; i++) {
      const row = liste[i];
      if (!row) continue;
      if (row._map_visible === false && !o.inclureMasquees) { masquees++; continue; }
      const couleur = o.couleurLigne ? o.couleurLigne(couche, row) : (row.fill_color || layer._color || '#808080');
      const f = carte.rowToFeature(row, layer, couleur, true);
      if (!f) { sansGeometrie++; continue; }
      const cle = cleLigne(row, i);
      f.id = ids.id(couche, cle, cle);
      f.properties[CLE_LIGNE] = cle;
      if (o.lisibles && o.lisibles.size) rendreProprietesLisibles(f.properties, layer, o.lisibles, o.lisibilite || {});
      presentes.add(String(cle));
      features.push(f);
    }
    ids.retenir(couche, presentes);
    return { features, masquees, sansGeometrie };
  }

  /**
   * Construit la scene BI complete (manifeste + donnees) d'un import. Pur.
   * @param {object} entree
   * @param {Record<string, object>} entree.couches  importedLayerData : tableName -> couche
   * @param {Record<string, object[]>} entree.lignes  tableName -> lignes lues dans Grist
   * @param {object|null} [entree.meta]
   * @param {string} [entree.nomFichier]
   * @param {string[]} [entree.palette]
   * @param {(couche: string, row: object) => string} [entree.couleurLigne]
   * @param {object} [entree.options]  { bulle, inclureMasquees, garderVersion, garderMeta, lisibilite }
   *   lisibilite : { libelles(champ, couche) -> Map|objet id->texte|null, fuseau } ; dates et references envoyees en texte lisible (cles inchangees)
   * @param {object} [deps]  { sceneManifest, carte }
   * @param {object} [ids]   allocateur (sinon un neuf)
   */
  function construireScene(entree, deps, ids) {
    const e = entree || {};
    const d = resoudreDependances(deps);
    const alloc = ids || creerAllocateurIds();
    const options = e.options || {};
    const couches = e.couches || {};
    const lignes = e.lignes || {};
    const base = d.sceneManifest.buildSceneManifest(couches, e.meta || null, e.nomFichier || '', e.palette);

    const definitions = {};
    const defsPubliees = [];
    const donnees = {};
    const comptes = {};
    const ignorees = [];
    const masquees = {};
    const sansGeometrie = {};
    const controles = [];
    const stylesBase = {};

    for (const defBase of base.layers) {
      const raison = raisonIgnoree(defBase);
      if (raison) { ignorees.push({ couche: defBase.id, raison }); continue; }
      const layer = couches[defBase.id];
      const defInitiale = definitionCouche(defBase, layer, options);
      const r = construireFeatures(defBase.id, layer, lignes[defBase.id] || [], alloc, d.carte, {
        inclureMasquees: options.inclureMasquees === true,
        couleurLigne: e.couleurLigne,
        lisibles: champsLisibles(layer, defInitiale, options),
        lisibilite: options.lisibilite,
      });
      const def = options.ajusterStyle === false ? defInitiale : ajusterStyleDeclaratif(defInitiale, r.features);
      stylesBase[def.id] = defInitiale.style;
      definitions[def.id] = def;
      defsPubliees.push(def);
      donnees[def.id] = r.features;
      comptes[def.id] = r.features.length;
      masquees[def.id] = r.masquees;
      sansGeometrie[def.id] = r.sansGeometrie;
      for (const c of def.controls) {
        controles.push({ id: c.id, couche: def.id, champ: c.field, type: c.type, mode: c.mode || null, label: c.label || c.field });
      }
    }

    const metaBase = base.meta || {};
    const manifeste = {
      title: base.title,
      subtitle: base.subtitle,
      classification: base.classification,
      layers: defsPubliees,
      meta: options.garderMeta === true ? metaBase : {
        widget: metaBase.widget,
        source_file: metaBase.source_file,
        imported_at: metaBase.imported_at,
        classification: metaBase.classification,
      },
    };
    if (options.garderVersion === true) manifeste.version = base.version;
    if (manifeste.subtitle == null) delete manifeste.subtitle;

    return { manifeste, donnees, definitions, stylesBase, comptes, ignorees, masquees, sansGeometrie, controles, ids: alloc };
  }

  // ---------------------------------------------------------------------------
  // Adresse du composant et element web
  // ---------------------------------------------------------------------------

  /**
   * Adresse de l'iframe Atlas en mode composant : bi=1, navbar=false, mode=view, hote=<origine de la page>.
   * Pure ; l'adresse d'Atlas est un parametre (decision D1 : l'Atlas publie, sans copie vendorisee).
   * @param {string} adresse  adresse d'Atlas (http(s))
   * @param {{hote: string, fond?: string, base?: string}} options  hote : origine EXACTE de la page qui embarque
   */
  function construireUrlAtlas(adresse, options) {
    const o = options || {};
    let u;
    try { u = new URL(adresse); } catch (_) { throw new ErreurHoteAtlas('client_absent', 'adresse d\'Atlas illisible : ' + String(adresse), { repli: true }); }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
      throw new ErreurHoteAtlas('client_absent', 'adresse d\'Atlas : http(s) seulement', { repli: true });
    }
    if (!o.hote || o.hote === 'null' || o.hote === '*') {
      throw new ErreurHoteAtlas('connexion_refusee', 'l\'origine de la page hote est obligatoire et exacte (pas de joker, pas d\'origine opaque)', { repli: true });
    }
    if (!u.searchParams.has('bi')) u.searchParams.set('bi', '1');
    if (!u.searchParams.has('navbar')) u.searchParams.set('navbar', 'false');
    if (!u.searchParams.has('mode')) u.searchParams.set('mode', 'view');
    if (o.base === 'aucune' && !u.searchParams.has('base')) u.searchParams.set('base', 'aucune');
    if (!u.searchParams.getAll('hote').includes(o.hote)) u.searchParams.append('hote', o.hote);
    return u.href;
  }

  /**
   * Liste blanche des origines d'ou le widget accepte de charger le composant Atlas (`?atlas=`). Le widget importe du CODE
   * (client.js, theme-document.js) depuis cette adresse et lui confie les donnees du document : une adresse arbitraire
   * serait une execution de code tiers. Constante MODIFIABLE : ajouter ici une origine https exacte (sans chemin).
   */
  const ORIGINES_ATLAS_AUTORISEES = Object.freeze(['https://nic01asfr.github.io']);
  /** Noms d'hote acceptes pour le developpement local (tout port, http ou https). */
  const HOTES_DEVELOPPEMENT_ATLAS = Object.freeze(['localhost', '127.0.0.1']);

  /**
   * Valide l'adresse d'Atlas demandee (`?atlas=`). Pure.
   * Acceptee : une origine de la liste blanche (https), ou localhost / 127.0.0.1 (developpement). Toute autre adresse
   * (autre origine, protocole http hors local, identifiants dans l'adresse, adresse illisible) est refusee : l'adresse par defaut
   * est rendue avec `refusee: true` et un message clair. Un chemin se terminant par `/` recoit `bi.html`.
   *
   * @param {string|null|undefined} demande  valeur de `?atlas=` (absente : adresse par defaut, sans refus)
   * @param {{defaut: string, origines?: string[], hotesDev?: string[]}} options
   * @returns {{adresse: string, refusee: boolean, message: string|null}}
   */
  function validerAdresseAtlas(demande, options) {
    const o = options || {};
    const defaut = o.defaut;
    const origines = o.origines || ORIGINES_ATLAS_AUTORISEES;
    const hotesDev = o.hotesDev || HOTES_DEVELOPPEMENT_ATLAS;
    if (demande === null || demande === undefined || demande === '') return { adresse: defaut, refusee: false, message: null };
    const refus = (raison) => ({
      adresse: defaut,
      refusee: true,
      message: "Adresse d'Atlas refusée (" + raison + ") : " + String(demande).slice(0, 120) + ". L'adresse par défaut est utilisée.",
    });
    let u;
    try { u = new URL(String(demande)); } catch (_) { return refus('adresse illisible'); }
    if (u.username || u.password) return refus("identifiants dans l'adresse");
    const dev = hotesDev.indexOf(u.hostname) !== -1 && (u.protocol === 'http:' || u.protocol === 'https:');
    if (!dev) {
      if (u.protocol !== 'https:') return refus('https obligatoire');
      if (origines.indexOf(u.origin) === -1) return refus('origine non autorisée ' + u.origin);
    }
    if (u.pathname.endsWith('/')) u.pathname += 'bi.html';
    return { adresse: u.href, refusee: false, message: null };
  }

  /** Presente un element <atlas-bi> comme un client (connecter / appeler / on / deconnecter). */
  function depuisElement(el) {
    if (!el) throw new ErreurHoteAtlas('client_absent', 'element <atlas-bi> absent', { repli: true });
    const client = () => {
      if (!el.client) throw new ErreurHoteAtlas('client_absent', 'l\'element <atlas-bi> n\'a pas de client (src manquant ?)', { repli: true });
      return el.client;
    };
    return {
      connecter: () => el.pret,
      appeler: (cmd, ...args) => client().appeler(cmd, ...args),
      on: (type, cb, opts) => client().on(type, cb, opts),
      deconnecter: () => { if (el.client && typeof el.client.deconnecter === 'function') el.client.deconnecter(); },
    };
  }

  // ---------------------------------------------------------------------------
  // Utilitaires de compte rendu
  // ---------------------------------------------------------------------------

  function normaliserMessages(obj) {
    const out = [];
    if (!obj || typeof obj !== 'object') return out;
    for (const [couche, v] of Object.entries(obj)) {
      const liste = Array.isArray(v) ? v : [v];
      for (const m of liste) {
        if (m === null || m === undefined || m === '') continue;
        out.push({ couche, message: typeof m === 'string' ? m : JSON.stringify(m) });
      }
    }
    return out;
  }

  function comptesAtlas(resultat) {
    const out = {};
    if (!resultat || typeof resultat !== 'object') return out;
    for (const [k, v] of Object.entries(resultat)) if (k[0] !== '_') out[k] = v;
    return out;
  }

  function versionAuMoins(v, min) {
    const a = String(v).split('.').map(Number);
    const b = String(min).split('.').map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] || 0;
      const y = b[i] || 0;
      if (x !== y) return x > y;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Hote
  // ---------------------------------------------------------------------------

  /**
   * Cree l'hote : un controleur par import affiche.
   * @param {object} config
   * @param {object} config.client  client Atlas : { connecter?, appeler(cmd, ...args) | <commande>(...), on?, deconnecter? }
   * @param {object} [config.sceneManifest]  injection
   * @param {object} [config.carte]          injection
   * @param {object} [config.options]  { versionMinimale, bulle, inclureMasquees, garderVersion, garderMeta, rejouerAuPret, couleurLigne }
   * @param {Function} [config.surSelection]  ({ couche, ligneId, cle, proprietes, brut }) ; couche null = selection effacee
   * @param {Function} [config.surSurvol]     ({ couche, ligneId, cle, brut }) ; couche null = sortie
   * @param {Function} [config.surCamera]     ({ center: [lng, lat], zoom, pitch, bearing }) fin d'un mouvement de camera
   * @param {Function} [config.surFiltre]     ({ couche, controleId, champ, type, valeur, compte, total, origine })
   * @param {Function} [config.surAction]     ({ couche, ligneId, actionId, brut })
   * @param {Function} [config.surAvertissement]  ({ couche, message }) un par avertissement d'Atlas
   * @param {Function} [config.surErreur]     (ErreurHoteAtlas) erreurs d'arriere-plan (rejeu, reapplication)
   */
  function creerHote(config) {
    const cfg = config || {};
    const client = cfg.client || null;
    const options = {
      versionMinimale: VERSION_MINIMALE,
      bulle: true,
      inclureMasquees: false,
      garderVersion: false,
      garderMeta: false,
      rejouerAuPret: true,
      ...(cfg.options || {}),
    };
    const deps = { sceneManifest: cfg.sceneManifest, carte: cfg.carte };
    const resolues = resoudreDependances(deps);

    const etat = {
      connecte: false,
      info: null,
      scenePosee: false,
      suspendu: false,
      entree: null,            // derniere entree de poserScene (couches, meta, ...)
      couches: {},
      definitions: {},
      stylesBase: {},          // style declaratif d'origine par couche (avant ajustement aux couleurs de lignes)
      controles: new Map(),    // id -> { id, couche, champ, type, mode, label }
      empreintes: new Map(),
      lignes: new Map(),
      comptes: {},
      refusees: new Set(),
      filtres: new Map(),
      masquees: new Set(),     // couches cachees par l'utilisateur
      selection: null,         // { couche, ligneId }
      camera: null,            // derniere camera annoncee par Atlas ({ center, zoom, pitch, bearing })
      theme: null,             // { charte, options }
      fond: null,              // { mode, jetons }
      fusion: null,            // null = inconnu, true = confirmee, false = non respectee par Atlas
      rejeu: false,
    };
    const ids = creerAllocateurIds();
    const desinscriptions = [];
    const file = new Map();
    let enCours = null;

    function signaler(err) {
      if (typeof cfg.surErreur === 'function') {
        try { cfg.surErreur(err); } catch (_) { /* un rappel defaillant ne doit pas casser la synchronisation */ }
      }
    }

    function relayer(avertissements) {
      if (typeof cfg.surAvertissement !== 'function') return;
      for (const a of avertissements) {
        try { cfg.surAvertissement(a); } catch (_) { /* idem */ }
      }
    }

    async function appeler(cmd, ...args) {
      if (!client) throw new ErreurHoteAtlas('client_absent', 'aucun client Atlas fourni', { repli: true });
      try {
        if (typeof client.appeler === 'function') return await client.appeler(cmd, ...args);
        if (typeof client[cmd] === 'function') return await client[cmd](...args);
      } catch (e) {
        throw classerErreur(e, { commande: cmd });
      }
      throw new ErreurHoteAtlas('commande', 'commande non disponible sur le client : ' + cmd, { repli: false });
    }

    function exigerScene() {
      if (!etat.scenePosee) throw new ErreurHoteAtlas('commande', 'aucune scene posee : appeler poserScene d\'abord');
    }

    function exigerCouche(couche) {
      if (!etat.definitions[couche]) throw new ErreurHoteAtlas('commande', 'couche inconnue ou non montee dans Atlas : ' + couche);
    }

    function definitionsAvecEtat(liste) {
      return liste.map((def) => appliquerFiltres(def, etat.filtres));
    }

    function memoriserControles(controles) {
      etat.controles.clear();
      for (const c of controles) etat.controles.set(c.id, c);
    }

    // -- evenements ----------------------------------------------------------

    function entiteDe(charge) {
      if (!charge || charge.featureId === null || charge.featureId === undefined || charge.layer === null || charge.layer === undefined) return null;
      const inv = ids.inverse(charge.featureId);
      if (inv && inv.couche === charge.layer) return { couche: inv.couche, ligneId: inv.ligne };
      if (charge.key !== undefined && charge.key !== null) {
        const n = Number(charge.key);
        return { couche: charge.layer, ligneId: Number.isFinite(n) && String(n) === String(charge.key) ? n : charge.key };
      }
      return { couche: charge.layer, ligneId: null };
    }

    function gererSelect(charge) {
      const ent = entiteDe(charge);
      etat.selection = ent ? { couche: ent.couche, ligneId: ent.ligneId } : null;
      if (typeof cfg.surSelection !== 'function') return;
      cfg.surSelection({
        couche: ent ? ent.couche : null,
        ligneId: ent ? ent.ligneId : null,
        cle: charge && charge.key !== undefined ? charge.key : null,
        proprietes: (charge && charge.properties) || null,
        brut: charge,
      });
    }

    function gererCamera(charge) {
      const c = camerasure(charge);
      if (!c) return;
      etat.camera = c;
      if (typeof cfg.surCamera === 'function') {
        try { cfg.surCamera({ ...c, center: c.center.slice() }); } catch (_) { /* un rappel defaillant ne doit pas casser l'ecoute */ }
      }
    }

    function gererHover(charge) {
      if (typeof cfg.surSurvol !== 'function') return;
      const ent = entiteDe(charge);
      cfg.surSurvol({
        couche: ent ? ent.couche : null,
        ligneId: ent ? ent.ligneId : null,
        cle: charge && charge.key !== undefined ? charge.key : null,
        brut: charge,
      });
    }

    function gererFiltre(charge, meta) {
      if (!charge || !charge.controlId) return;
      const c = etat.controles.get(charge.controlId);
      if (!c) return;
      if (charge.value === null || charge.value === undefined) etat.filtres.delete(c.id);
      else etat.filtres.set(c.id, charge.value);
      if (typeof cfg.surFiltre !== 'function') return;
      cfg.surFiltre({
        couche: charge.layer || c.couche,
        controleId: c.id,
        champ: c.champ,
        type: c.type,
        valeur: charge.value === undefined ? null : charge.value,
        compte: charge.compte,
        total: charge.total,
        origine: (meta && meta.origine) || 'utilisateur',
      });
    }

    function gererAction(charge) {
      if (typeof cfg.surAction !== 'function') return;
      const ent = entiteDe(charge);
      cfg.surAction({
        couche: ent ? ent.couche : (charge && charge.layer) || null,
        ligneId: ent ? ent.ligneId : null,
        actionId: charge ? charge.actionId : null,
        brut: charge,
      });
    }

    function gererPret(charge) {
      if (!options.rejouerAuPret) return;
      if (!charge || charge.runtime !== true) return;   // l'autre `ready` (scene montee) ne se rejoue pas : pas de boucle
      if (!etat.scenePosee || etat.rejeu) return;
      rejouer().catch((e) => signaler(classerErreur(e)));
    }

    function abonner() {
      if (!client || typeof client.on !== 'function' || desinscriptions.length) return;
      const reg = (type, cb, opts) => {
        const off = client.on(type, cb, opts);
        if (typeof off === 'function') desinscriptions.push(off);
      };
      reg('select', gererSelect);
      reg('hover', gererHover);
      reg('camera', gererCamera, { origine: 'tout' });   // aussi les mouvements demandes par l'API (cadrage, vue appliquee)
      reg('filter', gererFiltre);
      reg('action', gererAction);
      reg('ready', gererPret, { origine: 'tout' });
    }

    // -- scene -----------------------------------------------------------------

    /** Envoie la scene complete connue (theme, fond, scene, visibilites, selection). */
    async function envoyerSceneComplete() {
      const e = etat.entree;
      const scene = construireScene({
        couches: e.couches,
        lignes: Object.fromEntries(etat.lignes),
        meta: e.meta,
        nomFichier: e.nomFichier,
        palette: e.palette,
        couleurLigne: options.couleurLigne,
        options,
      }, resolues, ids);
      // couches ignorees ou non gardees : leurs ids ne servent plus
      for (const couche of Object.keys(etat.definitions)) if (!scene.definitions[couche]) ids.oublierCouche(couche);
      etat.definitions = scene.definitions;
      etat.stylesBase = scene.stylesBase;
      memoriserControles(scene.controles);
      for (const id of [...etat.filtres.keys()]) if (!etat.controles.has(id)) etat.filtres.delete(id);

      if (etat.theme) await appeler('setTheme', etat.theme.charte, ...(etat.theme.options ? [etat.theme.options] : []));
      if (etat.fond) await appeler('setFond', etat.fond.mode, ...(etat.fond.jetons ? [etat.fond.jetons] : []));

      const manifeste = { ...scene.manifeste, layers: definitionsAvecEtat(scene.manifeste.layers) };
      const resultat = await appeler('setScene', manifeste, scene.donnees);

      const erreurs = normaliserMessages(resultat && resultat._erreurs);
      const avertissements = normaliserMessages(resultat && resultat._avertissements);
      etat.refusees = new Set(erreurs.map((x) => x.couche));
      etat.empreintes.clear();
      for (const id of Object.keys(scene.definitions)) {
        if (etat.refusees.has(id)) continue;
        etat.empreintes.set(id, empreinteLignes(etat.lignes.get(id) || []));
      }
      etat.comptes = { ...scene.comptes };
      etat.scenePosee = true;

      await reappliquer(Object.keys(scene.definitions).filter((id) => !etat.refusees.has(id)));
      relayer(avertissements);
      return { scene, resultat, erreurs, avertissements };
    }

    /** Apres un setScene : visibilites cachees et selection, que la remontee de couche a remises a zero. */
    async function reappliquer(couchesRemontees) {
      for (const couche of couchesRemontees) {
        if (!etat.masquees.has(couche)) continue;
        try { await appeler('setLayerVisibility', couche, false); } catch (e) { signaler(classerErreur(e)); }
      }
      const sel = etat.selection;
      if (sel && couchesRemontees.includes(sel.couche)) {
        const id = ids.chercher(sel.couche, sel.ligneId);
        try {
          if (id !== null) await appeler('select', id);
          else etat.selection = null;
        } catch (e) { signaler(classerErreur(e)); }
      }
    }

    function compteRendu(scene, erreurs, avertissements) {
      const depasse = Object.entries(scene.comptes).filter(([, n]) => n > SEUIL_VOLUME).map(([c]) => c);
      return {
        comptes: { ...scene.comptes },
        ignorees: scene.ignorees.slice(),
        masquees: { ...scene.masquees },
        sansGeometrie: { ...scene.sansGeometrie },
        erreurs,
        avertissements,
        depasseSeuil: depasse,
        controles: scene.controles.slice(),
      };
    }

    async function rejouer() {
      exigerScene();
      etat.rejeu = true;
      try {
        const r = await envoyerSceneComplete();
        return compteRendu(r.scene, r.erreurs, r.avertissements);
      } finally {
        etat.rejeu = false;
      }
    }

    // -- synchronisation incrementale -----------------------------------------

    async function synchroniserLot(lot) {
      const aEnvoyer = [];
      const inchangees = [];
      const inconnues = [];
      for (const [id, rows] of lot) {
        if (!etat.definitions[id] || etat.refusees.has(id)) { inconnues.push(id); continue; }
        const emp = empreinteLignes(rows);
        if (emp === etat.empreintes.get(id)) { inchangees.push(id); etat.lignes.set(id, rows); continue; }
        aEnvoyer.push({ id, rows, emp });
      }
      const sortie = { envoyees: [], inchangees, inconnues, erreurs: [], avertissements: [], comptes: {} };
      if (!aEnvoyer.length) return sortie;

      for (const x of aEnvoyer) etat.lignes.set(x.id, x.rows);

      if (etat.fusion === false) {
        // Atlas ne respecte pas `fusion` : on rejoue la scene entiere
        const r = await envoyerSceneComplete();
        sortie.envoyees = aEnvoyer.map((x) => x.id);
        sortie.erreurs = r.erreurs;
        sortie.avertissements = r.avertissements;
        sortie.comptes = { ...etat.comptes };
        return sortie;
      }

      const defs = [];
      const donnees = {};
      const comptes = {};
      for (const x of aEnvoyer) {
        const layer = etat.couches[x.id];
        const r = construireFeatures(x.id, layer, x.rows, ids, resolues.carte, {
          inclureMasquees: options.inclureMasquees === true,
          couleurLigne: options.couleurLigne,
          lisibles: champsLisibles(layer, { ...etat.definitions[x.id], style: etat.stylesBase[x.id] }, options),
          lisibilite: options.lisibilite,
        });
        // les couleurs des lignes ont pu changer : le style est ajuste de nouveau, a partir du style d'origine
        if (options.ajusterStyle !== false) {
          const origine = { ...etat.definitions[x.id], style: etat.stylesBase[x.id] };
          etat.definitions[x.id] = ajusterStyleDeclaratif(origine, r.features);
        }
        defs.push(appliquerFiltres(etat.definitions[x.id], etat.filtres));
        donnees[x.id] = r.features;
        comptes[x.id] = r.features.length;
      }

      // en cas d'echec, aucune empreinte n'est mise a jour : la prochaine synchronisation reessaie
      const resultat = await appeler('setScene', { fusion: true, layers: defs }, donnees);

      // Un Atlas qui ignorerait `fusion` remplacerait toute la scene : les autres couches disparaitraient du compte
      const presentes = comptesAtlas(resultat);
      const attendues = [...etat.empreintes.keys()];
      const manquantes = attendues.filter((c) => !(c in presentes));
      if (resultat && typeof resultat === 'object' && manquantes.length) {
        etat.fusion = false;
        const r = await envoyerSceneComplete();
        sortie.envoyees = aEnvoyer.map((x) => x.id);
        sortie.erreurs = r.erreurs;
        sortie.avertissements = r.avertissements;
        sortie.comptes = { ...etat.comptes };
        signaler(new ErreurHoteAtlas('fusion_absente', 'Atlas n\'a pas conserve les autres couches (fusion ignoree) : scene rejouee en entier, synchronisation par scene complete desormais', { repli: false }));
        return sortie;
      }
      if (etat.fusion === null) etat.fusion = true;

      const erreurs = normaliserMessages(resultat && resultat._erreurs);
      const avertissements = normaliserMessages(resultat && resultat._avertissements);
      const refus = new Set(erreurs.map((x) => x.couche));
      const reussies = [];
      for (const x of aEnvoyer) {
        if (refus.has(x.id)) { etat.empreintes.delete(x.id); etat.refusees.add(x.id); continue; }
        etat.empreintes.set(x.id, x.emp);
        etat.comptes[x.id] = comptes[x.id];
        reussies.push(x.id);
      }
      await reappliquer(reussies);
      relayer(avertissements);
      sortie.envoyees = reussies;
      sortie.erreurs = erreurs;
      sortie.avertissements = avertissements;
      sortie.comptes = comptes;
      return sortie;
    }

    async function vider() {
      const cumul = { envoyees: [], inchangees: [], inconnues: [], erreurs: [], avertissements: [], comptes: {}, suspendu: false };
      while (file.size && !etat.suspendu) {
        const lot = new Map(file);
        file.clear();
        let r;
        try {
          r = await synchroniserLot(lot);
        } catch (e) {
          for (const [id, rows] of lot) if (!file.has(id)) file.set(id, rows);   // a reessayer
          throw e;
        }
        cumul.envoyees.push(...r.envoyees);
        cumul.inchangees.push(...r.inchangees);
        cumul.inconnues.push(...r.inconnues);
        cumul.erreurs.push(...r.erreurs);
        cumul.avertissements.push(...r.avertissements);
        Object.assign(cumul.comptes, r.comptes);
      }
      cumul.suspendu = etat.suspendu && file.size > 0;
      return cumul;
    }

    // -- API publique ------------------------------------------------------------

    const hote = {
      /**
       * Connecte le client et ecoute les evenements. Erreurs typees (repli: true) si le client manque, refuse,
       * ne negocie aucune version >= versionMinimale, ou s'il manque la capacite socle/points.
       */
      async connecter() {
        if (!client) throw new ErreurHoteAtlas('client_absent', 'aucun client Atlas fourni', { repli: true });
        let info = {};
        try {
          if (typeof client.connecter === 'function') info = (await client.connecter()) || {};
        } catch (e) {
          throw classerErreur(e, { connexion: true });
        }
        if (info.version !== undefined && !versionAuMoins(info.version, options.versionMinimale)) {
          throw new ErreurHoteAtlas('version_non_negociee', 'version du contrat negociee ' + info.version + ' < ' + options.versionMinimale, { repli: true, details: info });
        }
        if (Array.isArray(info.capacites)) {
          for (const cap of ['socle', 'points']) {
            if (!info.capacites.includes(cap)) {
              const err = new ErreurHoteAtlas('capacite_absente', 'le chargement d\'Atlas n\'a pas la capacite « ' + cap + ' »', { repli: true, details: info });
              err.capacite = cap;
              throw err;
            }
          }
        }
        etat.connecte = true;
        etat.info = info;
        abonner();
        return info;
      },

      /**
       * Pose la scene (setScene complet). Retourne le compte rendu :
       * { comptes, ignorees, masquees, sansGeometrie, erreurs, avertissements, depasseSeuil, controles }.
       * Leve ErreurHoteAtlas('scene_refusee', repli) si Atlas refuse toutes les couches envoyees.
       */
      async poserScene(entree) {
        if (!etat.connecte && client && typeof client.connecter === 'function') {
          throw new ErreurHoteAtlas('commande', 'client non connecte : appeler connecter() d\'abord');
        }
        const e = entree || {};
        etat.entree = { couches: e.couches || {}, meta: e.meta || null, nomFichier: e.nomFichier || '', palette: e.palette };
        etat.couches = etat.entree.couches;
        etat.lignes = new Map(Object.entries(e.lignes || {}));
        etat.filtres.clear();
        etat.masquees.clear();
        etat.selection = null;
        etat.fusion = null;
        const r = await envoyerSceneComplete();
        const envoyees = Object.keys(r.scene.definitions);
        if (envoyees.length && envoyees.every((c) => etat.refusees.has(c))) {
          etat.scenePosee = false;
          throw new ErreurHoteAtlas('scene_refusee', 'Atlas a refuse toutes les couches : ' + r.erreurs.map((x) => x.couche + ' : ' + x.message).join(' ; '), { repli: true, details: r.erreurs });
        }
        return compteRendu(r.scene, r.erreurs, r.avertissements);
      },

      /**
       * Synchronisation incrementale. `lignesParCouche` : { couche: lignes lues dans Grist } (les couches absentes ne
       * sont pas touchees). Seules les couches dont l'empreinte change sont envoyees, en UN setScene fusion.
       * Appels concurrents regroupes. Suspendu : retient les lignes sans rien envoyer.
       */
      synchroniser(lignesParCouche) {
        exigerScene();
        for (const [id, rows] of Object.entries(lignesParCouche || {})) file.set(id, rows);
        if (etat.suspendu) return Promise.resolve({ suspendu: true, enAttente: [...file.keys()], envoyees: [], inchangees: [], inconnues: [], erreurs: [], avertissements: [], comptes: {} });
        if (!enCours) {
          enCours = vider().finally(() => { enCours = null; });
        }
        return enCours;
      },

      /** Suspend l'envoi (onglet masque). Les lignes recues pendant la suspension sont retenues (la derniere version l'emporte). */
      suspendre() { etat.suspendu = true; },
      /** Reprend ; envoie ce qui a ete retenu. */
      async reprendre() {
        etat.suspendu = false;
        if (!etat.scenePosee || !file.size) return { envoyees: [], inchangees: [], inconnues: [], erreurs: [], avertissements: [], comptes: {}, suspendu: false };
        if (!enCours) enCours = vider().finally(() => { enCours = null; });
        return enCours;
      },
      estSuspendu() { return etat.suspendu; },

      /** Rejoue theme, fond, scene, visibilites et selection (apres rechargement de l'iframe). */
      rejouer,

      // cadrage -----------------------------------------------------------------

      /** cible : absente (toute la scene), id de couche, ou { couche, lignes: [ids de ligne Grist] }. */
      async cadrer(cible) {
        exigerScene();
        if (cible === undefined || cible === null) return appeler('fitTo');
        if (typeof cible === 'string') { exigerCouche(cible); return appeler('fitTo', cible); }
        if (cible && typeof cible === 'object' && cible.couche && Array.isArray(cible.lignes)) {
          exigerCouche(cible.couche);
          const feats = cible.lignes.map((l) => ids.chercher(cible.couche, l)).filter((x) => x !== null);
          if (!feats.length) throw new ErreurHoteAtlas('commande', 'aucune des lignes demandees n\'est sur la carte');
          return appeler('fitTo', feats);
        }
        throw new ErreurHoteAtlas('commande', 'cible de cadrage invalide');
      },

      /** Deplacement de camera : { center: [lon, lat], zoom, pitch, bearing, marges, ... } (flyTo d'Atlas). */
      voler(camera) {
        if (!camera || typeof camera !== 'object') return Promise.reject(new ErreurHoteAtlas('commande', 'camera invalide'));
        return appeler('flyTo', camera);
      },

      /** Selection d'une ligne Grist ({couche, ligneId}) ou effacement (null). */
      async selectionner(couche, ligneId) {
        exigerScene();
        if (couche === null || couche === undefined) {
          etat.selection = null;
          return appeler('select', null);
        }
        exigerCouche(couche);
        const id = ids.chercher(couche, ligneId);
        if (id === null) throw new ErreurHoteAtlas('commande', 'ligne inconnue sur la carte : ' + couche + '#' + ligneId);
        etat.selection = { couche, ligneId };
        return appeler('select', id);
      },

      /** Contour de plusieurs lignes d'une couche ; liste vide : efface. */
      async surligner(couche, ligneIds) {
        exigerScene();
        if (!ligneIds || !ligneIds.length) return appeler('highlight', []);
        exigerCouche(couche);
        const feats = ligneIds.map((l) => ids.chercher(couche, l)).filter((x) => x !== null);
        return appeler('highlight', feats);
      },

      async definirVisibilite(couche, visible) {
        exigerScene();
        exigerCouche(couche);
        const r = await appeler('setLayerVisibility', couche, !!visible);
        if (visible) etat.masquees.delete(couche); else etat.masquees.add(couche);
        return r;
      },

      // filtres -----------------------------------------------------------------

      /** Controles disponibles : [{ id, couche, champ, type, mode, label }]. */
      listerControles() { return [...etat.controles.values()]; },

      /**
       * Filtre par controle. `controle` : id, ou { couche, champ, type? }.
       * valeur : select = liste ; range/time = { min, max } ; text = { texte } ; null = retire.
       */
      async filtrer(controle, valeur) {
        exigerScene();
        const c = hote.chercherControle(controle);
        if (!c) throw new ErreurHoteAtlas('commande', 'controle inconnu : ' + JSON.stringify(controle));
        const r = await appeler('setFilter', c.id, valeur === undefined ? null : valeur);
        if (valeur === null || valeur === undefined) etat.filtres.delete(c.id); else etat.filtres.set(c.id, valeur);
        return r;
      },
      retirerFiltre(controle) { return hote.filtrer(controle, null); },
      chercherControle(controle) {
        if (typeof controle === 'string') return etat.controles.get(controle) || null;
        if (controle && controle.couche && controle.champ) {
          for (const c of etat.controles.values()) {
            if (c.couche === controle.couche && c.champ === controle.champ && (!controle.type || c.type === controle.type)) return c;
          }
        }
        return null;
      },

      // apparence ---------------------------------------------------------------

      legende(couche) { return couche ? appeler('getLegend', couche) : appeler('getLegend'); },

      /** Charte `atlas-charte/0.1` deja convertie par l'appelant (voir ThemeDef). Retenue pour le rejeu. */
      async appliquerTheme(charte, opts) {
        const r = await appeler('setTheme', charte, ...(opts ? [opts] : []));
        etat.theme = { charte, options: opts || null };
        return r;
      },

      async definirFond(mode, jetons) {
        const r = await appeler('setFond', mode, ...(jetons ? [jetons] : []));
        etat.fond = { mode, jetons: jetons || null };
        return r;
      },

      redimensionner() { return appeler('resize'); },

      // etat --------------------------------------------------------------------

      etat() {
        return {
          connecte: etat.connecte,
          scenePosee: etat.scenePosee,
          suspendu: etat.suspendu,
          fusion: etat.fusion,
          comptes: { ...etat.comptes },
          enAttente: [...file.keys()],
          empreintes: Object.fromEntries(etat.empreintes),
          refusees: [...etat.refusees],
          selection: etat.selection ? { ...etat.selection } : null,
          info: etat.info,
        };
      },

      /**
       * Ce qu'il faut pour enregistrer une vue : couches masquees, filtres actifs (id de controle -> valeur), derniere camera
       * annoncee par Atlas (null tant qu'aucun mouvement n'a eu lieu) et selection. Copies : l'appelant ne touche pas a l'etat.
       */
      vue() {
        return {
          masquees: [...etat.masquees],
          filtres: Object.fromEntries([...etat.filtres.entries()].map(([k, v]) => [k, JSON.parse(JSON.stringify(v))])),
          camera: etat.camera ? { ...etat.camera, center: etat.camera.center.slice() } : null,
          selection: etat.selection ? { ...etat.selection } : null,
        };
      },

      /** Couche et ligne Grist d'un id de scene (pour un appelant qui lit directement les evenements bruts). */
      entiteDeScene(idScene) { return ids.inverse(idScene); },

      /** Coupe les abonnements ; deconnecte le client si demande. */
      fermer(opts) {
        for (const off of desinscriptions.splice(0)) { try { off(); } catch (_) { /* deja retire */ } }
        file.clear();
        etat.connecte = false;
        etat.scenePosee = false;
        if (opts && opts.deconnecter && client && typeof client.deconnecter === 'function') client.deconnecter();
      },
    };
    return hote;
  }

  return {
    SEUIL_VOLUME,
    VERSION_MINIMALE,
    CLE_LIGNE,
    ErreurHoteAtlas,
    classerErreur,
    empreinteLignes,
    creerAllocateurIds,
    idControle,
    necessiteCarteHeritee,
    bulleDepuisCouche,
    camerasure,
    BULLE_CHAMPS_MAX,
    texteVolume,
    partiesVolume,
    formaterDepuis,
    definitionCouche,
    appliquerFiltres,
    construireFeatures,
    formaterDate,
    choisirColonneLibelle,
    libellesDeTable,
    formaterReference,
    valeurLisible,
    champsLisibles,
    rendreProprietesLisibles,
    construireScene,
    ajusterStyleDeclaratif,
    couleurDeclarative,
    couleurDeLigne,
    construireUrlAtlas,
    ORIGINES_ATLAS_AUTORISEES,
    HOTES_DEVELOPPEMENT_ATLAS,
    validerAdresseAtlas,
    depuisElement,
    creerHote,
  };
});

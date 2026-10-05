/*
 * carte-geometrie.js — poser un lieu sur une carte, dans un formulaire.
 *
 * > **La carte et ses règles viennent d'Atlas.** Atlas sait déjà lire,
 * > normaliser, valider et écrire une géométrie (`lib/geometrie-saisie.js`,
 * > `lib/wkt.js` : des modules purs, sans carte ni DOM), et il dessine avec
 * > MapLibre + terra-draw. Refaire cela ici aurait donné deux façons d'écrire
 * > un WKT dans une colonne Grist, et elles auraient divergé.
 *
 * Ce module ne réimplémente donc que ce qu'Atlas ne peut pas prêter : la mise
 * en place d'une carte **dans une question de formulaire** — petite, tactile,
 * sans panneau ni outil, où l'on touche pour poser un point et où l'on retouche
 * pour l'enlever. Les lignes et les surfaces passent par terra-draw, comme dans
 * Atlas et avec les mêmes versions.
 *
 * ## Rien ne se charge tant qu'on ne demande pas de carte
 *
 * MapLibre pèse plus que tout le reste du formulaire. Un questionnaire sans
 * question de lieu ne le charge pas ; un questionnaire qui en a une ne le
 * charge qu'à l'étape où elle est posée. Si le réseau manque, la question
 * reste répondable : le champ texte sous la carte accepte le WKT, et la
 * position du téléphone suffit à poser un point.
 *
 * ## Ce que la question déclare
 *
 *     options.geometrie   'Point' | 'MultiPoint' | 'LineString' | 'Polygon'…
 *     options.carte       { centre: [lon, lat], zoom, fond: 'plan' | 'ortho' }
 *
 * Le centre et le zoom cadrent la carte là où la question se pose : un
 * questionnaire de quartier n'ouvre pas sur le monde.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.FormCarte = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  /** Les mêmes versions qu'Atlas : une carte qui diverge est une carte de plus. */
  var MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js';
  var MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css';
  var BLANCS = '\\s*';
  var TERRA_DRAW = 'https://cdn.jsdelivr.net/npm/terra-draw@1.35.0/dist/terra-draw.module.js';
  var TERRA_ADAPTER = 'https://cdn.jsdelivr.net/npm/terra-draw-maplibre-gl-adapter@1.4.1/dist/terra-draw-maplibre-gl-adapter.module.js';

  /** Les fonds de l'IGN, ceux d'Atlas. */
  var FONDS = {
    plan: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    ortho: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'
  };
  var ATTRIBUTION = '© IGN — Géoplateforme';

  /**
   * Ou trouver les modules d'Atlas.
   *
   * > **Un `import()` dans un script classique se resout par rapport au
   * > script, pas a la page.** Ecrit `../Atlas/lib/` depuis `shared/`, il
   * > cherchait `grist_forms/Atlas/lib/`, qui n'existe pas — et la carte
   * > annoncait une panne en ayant tout sous la main. On part donc de l'URL de
   * > ce fichier, relevee au chargement.
   *
   * Trois cas, essayes dans cet ordre :
   *  1. ce qu'on nous dit (`window.FORM_ATLAS_BASE`) ;
   *  2. Atlas a cote de nous — les deux projets voisinent, en developpement
   *     (`projects/Atlas`) comme une fois publies (`atlas`) ;
   *  3. Atlas publie, pour un formulaire fige dans un document Grist : son
   *     code n'y a plus de voisin, et GitHub Pages autorise les autres
   *     origines (`Access-Control-Allow-Origin: *`, verifie le 04/10/2026).
   */
  var ATLAS_PUBLIE = 'https://nic01asfr.github.io/Widgets-Grist/atlas/lib/';

  /** L'URL de ce fichier, qui sert de point de depart aux chemins relatifs. */
  var MOI = (function () {
    try {
      if (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) {
        return document.currentScript.src;
      }
    } catch (e) { /* un hote peut l'interdire */ }
    return typeof location !== 'undefined' ? String(location.href) : '';
  }());

  function cheminsAtlas() {
    var bases = [];
    if (typeof window !== 'undefined' && window.FORM_ATLAS_BASE) bases.push(window.FORM_ATLAS_BASE);
    if (MOI) {
      // `shared/` est dans `grist_forms/`, qui est a cote d'`Atlas`.
      bases.push(new URL('../../Atlas/lib/', MOI).href);
      bases.push(new URL('../../atlas/lib/', MOI).href);
      bases.push(new URL('../atlas/lib/', MOI).href);
    }
    bases.push(ATLAS_PUBLIE);
    return bases;
  }

  var _atlas = null;
  function chargerAtlas() {
    if (_atlas) return _atlas;
    // Deux modules : les regles de geometrie, et la lecture/ecriture du WKT.
    // `geometrie-saisie.js` se sert du second sans le reexporter, comme Atlas.
    var chemins = cheminsAtlas();
    _atlas = (function suivant(i) {
      if (i >= chemins.length) {
        return Promise.reject(new Error(
          'Modules de géométrie d’Atlas introuvables (essayé : ' + chemins.join(', ') + ')'));
      }
      var base = chemins[i];
      return Promise.all([
        import(/* @vite-ignore */ base + 'geometrie-saisie.js'),
        import(/* @vite-ignore */ base + 'wkt.js')
      ]).then(function (mods) {
        return Object.assign({}, mods[0], mods[1]);
      }).catch(function () { return suivant(i + 1); });
    }(0));
    _atlas.catch(function () { _atlas = null; });
    return _atlas;
  }

  var _maplibre = null;
  function chargerMapLibre() {
    if (_maplibre) return _maplibre;
    _maplibre = new Promise(function (resolve, reject) {
      if (typeof window !== 'undefined' && window.maplibregl) return resolve(window.maplibregl);
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = MAPLIBRE_CSS;
      document.head.appendChild(css);
      var s = document.createElement('script');
      s.src = MAPLIBRE_JS;
      s.onload = function () { resolve(window.maplibregl); };
      s.onerror = function () { reject(new Error('MapLibre n’a pas pu être chargé')); };
      document.head.appendChild(s);
    });
    _maplibre.catch(function () { _maplibre = null; });
    return _maplibre;
  }

  var _traceur = null;
  /**
   * L'adaptateur de terra-draw publie un import nu, que le navigateur ne sait
   * pas resoudre.
   *
   * > Son fichier commence par `import{TerraDrawExtend}from"terra-draw"` : un
   * > nom de paquet, pas une adresse. **Atlas le resout par un `importmap`
   * > pose dans sa page** — il est maitre de sa page. Le formulaire, lui, vit
   * > dans une page qu'il n'a pas ecrite : widget Grist, compositeur, page
   * > publiee. Il ne peut ni poser un `importmap` a temps, ni ecraser celui de
   * > son hote.
   *
   * On pointe donc l'import sur le module qu'on vient de charger. Le `+esm` de
   * jsDelivr resoudrait aussi, mais vers terra-draw 1.30 : deux copies, deux
   * versions, et un adaptateur qui etend une base qui n'est pas celle des
   * modes. Ici, une seule copie, la meme version qu'Atlas.
   */
  function resoudreImportNu(source, nom, adresse) {
    var motif = new RegExp('(from' + BLANCS + '["' + "'" + '])' + nom + '(["' + "'" + '])', 'g');
    return String(source).replace(motif, '$1' + adresse + '$2');
  }

  function chargerTraceur() {
    if (!_traceur) {
      _traceur = import(/* @vite-ignore */ TERRA_DRAW).then(function (td) {
        return fetch(TERRA_ADAPTER).then(function (r) {
          if (!r.ok) throw new Error('adaptateur : ' + r.status);
          return r.text();
        }).then(function (source) {
          var patche = resoudreImportNu(source, 'terra-draw', TERRA_DRAW);
          var url = URL.createObjectURL(new Blob([patche], { type: 'text/javascript' }));
          return import(/* @vite-ignore */ url).then(function (mod) {
            URL.revokeObjectURL(url);
            return { td: td, Adapter: mod.TerraDrawMapLibreGLAdapter };
          }, function (e) {
            URL.revokeObjectURL(url);
            throw e;
          });
        });
      });
      _traceur.catch(function () { _traceur = null; });
    }
    return _traceur;
  }

  /** Le style MapLibre d'un fond raster de l'IGN. */
  function styleDuFond(nom) {
    var url = FONDS[nom] || FONDS.plan;
    return {
      version: 8,
      sources: { fond: { type: 'raster', tiles: [url], tileSize: 256, attribution: ATTRIBUTION } },
      layers: [{ id: 'fond', type: 'raster', source: 'fond' }]
    };
  }

  /**
   * Monte une carte de saisie dans un conteneur.
   *
   * @param {HTMLElement} hote      où la carte s'installe
   * @param {object} opts
   *   - `type`      type de géométrie attendu (Point, MultiPoint, LineString…)
   *   - `valeur`    WKT déjà saisi, ou vide
   *   - `centre`    [lon, lat] du cadrage initial
   *   - `zoom`      niveau de départ
   *   - `fond`      'plan' | 'ortho'
   *   - `onChange`  reçoit le WKT à chaque modification
   * @returns {Promise<{detruire: Function}>}
   */
  function monter(hote, opts) {
    opts = opts || {};
    var type = opts.type || 'Point';
    var onChange = typeof opts.onChange === 'function' ? opts.onChange : function () {};

    return Promise.all([chargerMapLibre(), chargerAtlas()]).then(function (res) {
      var maplibregl = res[0];
      var geo = res[1];
      var famille = geo.familleGeometrie(type) || 'Point';
      var multiple = /^Multi/.test(type);

      var carte = new maplibregl.Map({
        container: hote,
        style: styleDuFond(opts.fond),
        center: opts.centre || [2.35, 46.6],
        zoom: opts.zoom == null ? 5 : opts.zoom,
        attributionControl: { compact: true }
      });
      carte.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

      var etat = { sommets: lireValeur(geo, opts.valeur, famille) };

      /**
       * Ecrire une geometrie dans la colonne.
       *
       * La normalisation d'Atlas d'abord : 7 decimales (≈ 1 cm, la ou un GPS
       * de terrain en fait 3 a 5 m) et les sommets en double retires. Sans
       * elle, la colonne recevait quinze chiffres apres la virgule, soit du
       * volume sans information.
       */
      function ecrireGeometrie(g) {
        if (g && geo.normaliserGeometrie) g = geo.normaliserGeometrie(g);
        // Rien a ecrire : la personne a tout efface, la colonne se vide.
        if (!g) { onChange(''); return; }
        // Une forme en cours de trace n'est pas une forme. Terra-draw tient un
        // sommet fantome sous le curseur : au premier clic, sa « ligne » a deux
        // sommets confondus, que la normalisation d'Atlas ramene a un seul.
        // Ecrite telle quelle, elle donnait `LINESTRING (5.39 43.30)` — que
        // rien ne sait relire. On garde alors ce qui etait deja la.
        if (!geometrieFormee(g)) return;
        onChange(geo.ecrireWkt ? geo.ecrireWkt(g) : '');
      }

      /** Les points posés au doigt : la geometrie se recalcule depuis l'etat. */
      function publierPoints() {
        ecrireGeometrie(versGeometrie(etat.sommets, type, multiple));
      }

      if (famille === 'Point') {
        installerPoints(carte, maplibregl, etat, multiple, publierPoints);
      } else {
        // > **Le trace ecrit sa geometrie directement.** Il passait par la
        // > fonction des points, qui ignore son argument et relit l'etat des
        // > sommets — etat que le trace venait de vider. Resultat : une ligne
        // > bien dessinee sur la carte, et une colonne vide. Mesure le
        // > 05/10/2026, au premier essai de la saisie ligne/surface.
        installerTrace(carte, geo, type, etat, ecrireGeometrie, hote);
      }

      return {
        carte: carte,
        detruire: function () { try { carte.remove(); } catch (e) { /* déjà partie */ } }
      };
    });
  }

  /**
   * Poser des points au doigt, et les retirer de même.
   *
   * Un point n'a pas besoin de terra-draw — Atlas le dit aussi : on touche, le
   * point se pose ; on retouche le point, il s'enlève. C'est tout le geste que
   * demande « pointez les endroits concernés ».
   */
  function installerPoints(carte, maplibregl, etat, multiple, publier) {
    var marqueurs = [];

    function redessiner() {
      marqueurs.forEach(function (m) { m.remove(); });
      marqueurs = etat.sommets.map(function (p, i) {
        var el = document.createElement('button');
        el.type = 'button';
        el.className = 'fr-carte__point';
        el.setAttribute('aria-label', 'Retirer le point ' + (i + 1));
        el.addEventListener('click', function (ev) {
          ev.stopPropagation();
          etat.sommets.splice(i, 1);
          redessiner();
          publier();
        });
        return new maplibregl.Marker({ element: el }).setLngLat(p).addTo(carte);
      });
    }

    carte.on('click', function (ev) {
      var p = [ev.lngLat.lng, ev.lngLat.lat];
      if (multiple) etat.sommets.push(p);
      else etat.sommets = [p];
      redessiner();
      publier();
    });

    carte.on('load', redessiner);
  }

  /**
   * Tracer une ligne ou une surface, avec le moteur d'Atlas.
   *
   * Si terra-draw ne se charge pas, la carte reste : elle montre ce qui a été
   * saisi, et la saisie à la main sous la carte prend le relais. Une question
   * ne devient pas impossible parce qu'un CDN est lent.
   */
  /**
   * Une geometrie en cours de trace n'est pas encore une geometrie.
   *
   * Au premier sommet, terra-draw tient deja une « ligne » d'un seul point :
   * ecrite telle quelle, elle donne `LINESTRING (5.39 43.30)`, que rien ne sait
   * relire. On attend donc qu'il y ait de quoi faire une forme — deux sommets
   * pour une ligne, un anneau ferme pour une surface.
   */
  function geometrieFormee(g) {
    if (!g) return false;
    if (g.type === 'LineString') return (g.coordinates || []).length >= 2;
    if (g.type === 'Polygon') {
      var anneau = (g.coordinates || [])[0] || [];
      return anneau.length >= 4;
    }
    return true;
  }

  function installerTrace(carte, geo, type, etat, ecrireGeometrie, hote) {
    chargerTraceur().then(function (t) {
      var draw = new t.td.TerraDraw({
        adapter: new t.Adapter({ map: carte, lib: window.maplibregl }),
        modes: [
          type.indexOf('Line') >= 0 ? new t.td.TerraDrawLineStringMode() : new t.td.TerraDrawPolygonMode(),
          new t.td.TerraDrawSelectMode()
        ]
      });
      var attendu = type.indexOf('Line') >= 0 ? 'LineString' : 'Polygon';
      draw.start();
      draw.setMode(type.indexOf('Line') >= 0 ? 'linestring' : 'polygon');
      // La session de trace reste attachee a sa carte : c'est par la qu'on
      // l'efface, et par la qu'un banc d'essai la regarde.
      hote.__trace = draw;

      // > **On ecoute `change`, et pas seulement `finish`.** Un trace se
      // > termine par un geste qu'il faut connaitre — recliquer le dernier
      // > sommet, double-toucher. Qui ne le trouve pas croit avoir repondu et
      // > n'a rien ecrit : mesure du 05/10/2026, la ligne etait bien tracee sur
      // > la carte, la colonne restait vide. Chaque sommet pose s'inscrit donc,
      // > comme pour les points, et `finish` ne fait que confirmer.
      function recolter() {
        // `getSnapshot` rend aussi les sommets de guidage que terra-draw
        // affiche pendant le trace : prendre la derniere feature venue, c'est
        // ecrire un POINT la ou l'on attend une ligne. On ne retient donc que
        // la forme demandee.
        var fc = draw.getSnapshot() || [];
        var f = null;
        for (var i = fc.length - 1; i >= 0; i--) {
          var g = fc[i] && fc[i].geometry;
          if (g && g.type === attendu) { f = fc[i]; break; }
        }
        if (!f) return;
        etat.sommets = [];
        ecrireGeometrie(f.geometry);
      }
      draw.on('change', recolter);
      draw.on('finish', recolter);
    }).catch(function () {
      var note = document.createElement('p');
      note.className = 'fr-hint-text fr-carte__panne';
      note.textContent = 'Le tracé n’a pas pu être chargé. Vous pouvez décrire le lieu ou saisir sa géométrie ci-dessous.';
      hote.parentNode.appendChild(note);
    });
  }

  /** Les sommets déjà saisis, relus depuis le WKT de la colonne. */
  function lireValeur(geo, valeur, famille) {
    if (!valeur || !geo.lireWkt) return [];
    try {
      var g = geo.lireWkt(String(valeur));
      if (!g) return [];
      if (g.type === 'Point') return [g.coordinates];
      if (g.type === 'MultiPoint') return g.coordinates.slice();
      return [];
    } catch (e) {
      return [];
    }
  }

  /** Les sommets, remis en géométrie GeoJSON du type attendu. */
  function versGeometrie(sommets, type, multiple) {
    if (!sommets || !sommets.length) return null;
    if (multiple) return { type: 'MultiPoint', coordinates: sommets.slice() };
    return { type: 'Point', coordinates: sommets[0] };
  }

  /**
   * Une carte qui montre, et ou l'on ne repond pas.
   *
   * Illustrer une question — « voici ou sont ces cinq lieux » — n'est pas y
   * repondre : aucun clic n'ecrit, et les reperes portent l'etiquette qu'ils
   * ont dans la liste, pour qu'on puisse passer de l'un a l'autre des yeux.
   */
  function montrer(hote, opts) {
    opts = opts || {};
    var reperes = opts.reperes || [];
    return chargerMapLibre().then(function (maplibregl) {
      var centre = opts.centre;
      if (!centre && reperes.length) {
        // Sans cadrage donne, on se place sur les reperes.
        var lon = 0, lat = 0;
        reperes.forEach(function (r) { lon += Number(r.lon); lat += Number(r.lat); });
        centre = [lon / reperes.length, lat / reperes.length];
      }
      var carte = new maplibregl.Map({
        container: hote,
        style: styleDuFond(opts.fond),
        center: centre || [2.35, 46.6],
        zoom: opts.zoom == null ? (reperes.length ? 13 : 5) : opts.zoom,
        attributionControl: { compact: true },
        interactive: opts.interactive !== false
      });
      carte.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
      carte.on('load', function () {
        reperes.forEach(function (r) {
          var lon = Number(r.lon), lat = Number(r.lat);
          if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
          var el = document.createElement('span');
          el.className = 'fr-carte__repere';
          el.textContent = r.etiquette == null ? '' : String(r.etiquette);
          if (r.titre) el.title = String(r.titre);
          new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(carte);
        });
      });
      return {
        carte: carte,
        detruire: function () { try { carte.remove(); } catch (e) { /* deja partie */ } }
      };
    });
  }

  return {
    VERSION: VERSION,
    montrer: montrer,
    FONDS: Object.keys(FONDS),
    monter: monter,
    // Exposés pour les essais : ce que la carte calcule sans carte.
    versGeometrie: versGeometrie,
    resoudreImportNu: resoudreImportNu,
    geometrieFormee: geometrieFormee,
    styleDuFond: styleDuFond
  };
}));

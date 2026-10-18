/*
 * enrichir.js — ce qu'un point choisi sur la carte permet de savoir.
 *
 * Une personne pose un point : l'adresse la plus proche, la commune, le bâtiment,
 * l'altitude s'inscrivent dans les colonnes que le formulaire désigne, sans
 * qu'elle ait rien à taper. Chaque service est un appel public, sans clé, mesuré
 * le 18/10/2026 depuis une page d'une autre origine (CORS ouvert).
 *
 * > **Ce qui part, c'est la position.** Un point est souvent celui d'une
 * > personne (chez elle, sur son trajet). Le formulaire le dit sous la carte
 * > (`mention`), et rien ne part tant qu'un point n'est pas posé.
 *
 * > **Un service qui ne répond pas ne bloque pas.** Le point reste, les colonnes
 * > de ce service restent vides (jamais `0` : un nombre absent vaut 0 dans Grist,
 * > on écrit `null`), et la personne en est informée.
 *
 * Le module ne touche à aucun écran. `enrichir` reçoit son `fetch` : les essais
 * n'appellent aucun service réel.
 */
(function (root, factory) {
  'use strict';
  var asNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  if (asNode && typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.FormEnrichir = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var DELAI_MS = 6000;

  // Ce que chaque sens est dans une colonne Grist.
  var SENS = {
    adresse: 'Text', codePostal: 'Text', commune: 'Text', insee: 'Text', departement: 'Text',
    batiment: 'Text', altitude: 'Numeric', risques: 'Text', latitude: 'Numeric', longitude: 'Numeric'
  };

  function arrondi(n, d) { var p = Math.pow(10, d); return Math.round(n * p) / p; }

  // ── les services : une adresse, ce qu'ils rendent ──
  var SERVICES = {
    adresse: {
      id: 'adresse',
      libelle: 'Adresse la plus proche',
      mention: 'la Géoplateforme (IGN)',
      fournit: ['adresse'],
      url: function (p) { return 'https://data.geopf.fr/geocodage/reverse?lon=' + p.lon + '&lat=' + p.lat + '&limit=1'; },
      normaliser: function (json) {
        var f = json && json.features && json.features[0];
        var pr = f && f.properties;
        return pr && pr.label ? { adresse: String(pr.label) } : {};
      }
    },
    commune: {
      id: 'commune',
      libelle: 'Commune',
      mention: 'l’API Géo (État)',
      fournit: ['commune', 'insee', 'codePostal', 'departement'],
      url: function (p) {
        return 'https://geo.api.gouv.fr/communes?lat=' + p.lat + '&lon=' + p.lon + '&fields=nom,code,codesPostaux,departement&format=json';
      },
      normaliser: function (json) {
        var c = Array.isArray(json) ? json[0] : null;
        if (!c || !c.code) return {};
        return {
          commune: c.nom ? String(c.nom) : null,
          insee: String(c.code),
          codePostal: Array.isArray(c.codesPostaux) && c.codesPostaux.length ? String(c.codesPostaux[0]) : null,
          departement: c.departement && c.departement.code ? String(c.departement.code) : null
        };
      }
    },
    batiment: {
      id: 'batiment',
      libelle: 'Bâtiment le plus proche',
      mention: 'le Référentiel national des bâtiments',
      fournit: ['batiment'],
      // L'ordre est latitude, longitude ici — l'inverse de la Géoplateforme.
      url: function (p) { return 'https://rnb-api.beta.gouv.fr/api/alpha/buildings/closest/?point=' + p.lat + ',' + p.lon + '&radius=50'; },
      normaliser: function (json) {
        var r = json && json.results && json.results[0];
        return r && r.rnb_id ? { batiment: String(r.rnb_id) } : {};
      }
    },
    altitude: {
      id: 'altitude',
      libelle: 'Altitude',
      mention: 'la Géoplateforme (IGN)',
      fournit: ['altitude'],
      url: function (p) {
        return 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=' + p.lon + '&lat=' + p.lat +
          '&resource=ign_rge_alti_wld&zonly=false';
      },
      normaliser: function (json) {
        var e = json && json.elevations && json.elevations[0];
        // -99999 : pas de donnée ; ce n'est pas une altitude.
        return e && typeof e.z === 'number' && e.z > -1000 ? { altitude: arrondi(e.z, 1) } : {};
      }
    },
    risques: {
      id: 'risques',
      libelle: 'Risques connus',
      mention: 'Géorisques (État)',
      fournit: ['risques'],
      url: function (p) { return 'https://georisques.gouv.fr/api/v1/gaspar/risques?latlon=' + p.lon + ',' + p.lat + '&rayon=100'; },
      normaliser: function (json) {
        var d = json && json.data && json.data[0];
        var liste = d && Array.isArray(d.risques_detail) ? d.risques_detail : [];
        var noms = liste.map(function (r) { return r && r.libelle_risque_long; }).filter(Boolean);
        return noms.length ? { risques: noms.join(' ; ') } : {};
      }
    }
  };

  // Le service qui répond à chaque sens (latitude et longitude viennent du point lui-même).
  var SERVICE_DU_SENS = {
    adresse: 'adresse', commune: 'commune', insee: 'commune', codePostal: 'commune', departement: 'commune',
    batiment: 'batiment', altitude: 'altitude', risques: 'risques'
  };

  function sensConnu(sens) { return Object.prototype.hasOwnProperty.call(SENS, sens); }
  function typeDuSens(sens) { return SENS[sens] || null; }

  /** Les colonnes que la question remplit à partir d'un point, par sens. */
  function colonnesDe(field) {
    var e = field && field.options && field.options.enrichir;
    var c = e && e.colonnes;
    var out = {};
    if (c && typeof c === 'object') {
      Object.keys(c).forEach(function (sens) { if (sensConnu(sens) && c[sens]) out[sens] = c[sens]; });
    }
    return out;
  }

  /** Les services à appeler pour remplir ces sens, sans doublon. */
  function servicesPour(colonnes) {
    var vus = {};
    var out = [];
    Object.keys(colonnes || {}).forEach(function (sens) {
      var id = SERVICE_DU_SENS[sens];
      if (id && !vus[id]) { vus[id] = true; out.push(id); }
    });
    return out;
  }

  /** La mention à montrer sous la carte : ce qui part, et vers qui. */
  function mention(colonnes) {
    var ids = servicesPour(colonnes);
    if (!ids.length) return '';
    // Deux services d'un même opérateur ne se nomment qu'une fois.
    var qui = ids.map(function (id) { return SERVICES[id].mention; })
      .filter(function (m, i, tous) { return tous.indexOf(m) === i; });
    return 'Pour compléter le lieu, la position choisie est envoyée à ' + qui.join(', ').replace(/, ([^,]*)$/, ' et $1') + '.';
  }

  /**
   * Un point depuis du WKT : `POINT(lon lat)`, avec ou sans espace, avec un
   * éventuel `SRID=4326;`. Rien d'autre qu'un point simple, en degrés.
   */
  function pointDe(wkt) {
    if (typeof wkt !== 'string') return null;
    var m = wkt.trim().replace(/^SRID=\d+;/i, '').match(/^POINT\s*(?:Z\s*)?\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)(?:\s+-?\d+(?:\.\d+)?)?\s*\)$/i);
    if (!m) return null;
    var lon = Number(m[1]);
    var lat = Number(m[2]);
    if (!(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90)) return null;
    return { lon: arrondi(lon, 6), lat: arrondi(lat, 6) };
  }

  function appeler(service, point, deps) {
    var appel = deps.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!appel) return Promise.reject(new Error('reseau'));
    var controleur = typeof AbortController === 'function' ? new AbortController() : null;
    var minuteur = setTimeout(function () { if (controleur) controleur.abort(); }, deps.delaiMs || DELAI_MS);
    var attente = new Promise(function (_, rejeter) {
      // Un fetch qui ignore le signal ne doit pas suspendre la saisie.
      setTimeout(function () { rejeter(new Error('delai')); }, (deps.delaiMs || DELAI_MS) + 50);
    });
    var requete = appel(service.url(point), controleur ? { signal: controleur.signal } : undefined)
      .then(function (r) {
        if (!r || !r.ok) throw new Error('http');
        return r.json();
      })
      .then(function (json) { return service.normaliser(json); });
    return Promise.race([requete, attente]).then(
      function (v) { clearTimeout(minuteur); return v; },
      function (e) { clearTimeout(minuteur); throw e; }
    );
  }

  /**
   * Remplir les colonnes d'un point.
   *
   * @param {{lon:number, lat:number}} point
   * @param {object} colonnes  { <sens>: <colId> }
   * @param {object} [deps]    { fetch, delaiMs }
   * @returns {Promise<{ valeurs: object, echecs: string[], vides: string[] }>}
   *   `valeurs` : { <colId>: valeur | null } pour CHAQUE colonne demandée.
   */
  function enrichir(point, colonnes, deps) {
    deps = deps || {};
    var ids = servicesPour(colonnes);
    var obtenu = {};
    var echecs = [];
    var vides = [];
    var travaux = ids.map(function (id) {
      return appeler(SERVICES[id], point, deps).then(function (res) {
        var rendu = false;
        Object.keys(res).forEach(function (sens) { if (res[sens] !== null && res[sens] !== undefined) { obtenu[sens] = res[sens]; rendu = true; } });
        if (!rendu) vides.push(id);
      }, function () { echecs.push(id); });
    });
    return Promise.all(travaux).then(function () {
      var valeurs = {};
      Object.keys(colonnes || {}).forEach(function (sens) {
        var col = colonnes[sens];
        if (sens === 'latitude') valeurs[col] = point.lat;
        else if (sens === 'longitude') valeurs[col] = point.lon;
        else valeurs[col] = Object.prototype.hasOwnProperty.call(obtenu, sens) ? obtenu[sens] : null;
      });
      return { valeurs: valeurs, echecs: echecs, vides: vides };
    });
  }

  /** Ce qu'on dit à la personne une fois la réponse reçue. */
  function phrase(resultat, colonnes) {
    var n = resultat.echecs.length;
    if (n && n === servicesPour(colonnes).length) return 'Les informations du lieu n’ont pas pu être complétées ; votre position est conservée.';
    var rendu = Object.keys(resultat.valeurs).filter(function (c) { return resultat.valeurs[c] !== null; });
    var morceaux = [];
    if (colonnes.adresse && resultat.valeurs[colonnes.adresse]) morceaux.push(resultat.valeurs[colonnes.adresse]);
    else if (colonnes.commune && resultat.valeurs[colonnes.commune]) morceaux.push(resultat.valeurs[colonnes.commune]);
    if (!rendu.length) return 'Aucune information trouvée pour ce lieu.';
    var base = morceaux.length ? 'Lieu repéré : ' + morceaux[0] + '.' : 'Lieu complété.';
    return n ? base + ' Certaines informations n’ont pas pu être obtenues.' : base;
  }

  return {
    VERSION: VERSION,
    SENS: SENS,
    SERVICES: SERVICES,
    sensConnu: sensConnu,
    typeDuSens: typeDuSens,
    colonnesDe: colonnesDe,
    servicesPour: servicesPour,
    mention: mention,
    pointDe: pointDe,
    enrichir: enrichir,
    phrase: phrase
  };
}));

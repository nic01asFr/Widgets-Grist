/**
 * referentiel.js — désigner une chose qui existe déjà, plutôt que la décrire.
 *
 * > **Une adresse tapée à la main est une adresse approximative.** « 8 bd du
 * > port amiens », « 8 boulevard du Port, 80000 » et « 8 bld Port Amiens »
 * > sont la même porte, et trois valeurs différentes dans la colonne : aucune
 * > statistique, aucun regroupement, aucune carte n'en sort sans nettoyage.
 * > Un référentiel propose l'adresse qui existe, avec son code postal, son
 * > code INSEE et ses coordonnées — et la personne la choisit au lieu de
 * > l'inventer.
 *
 * Ce module ne dessine pas le formulaire et ne connaît pas Grist. Il sait
 * trois choses : interroger une source, normaliser sa réponse, et brancher une
 * liste de suggestions accessible sur un champ texte qui existe déjà.
 *
 * **Une seule source aujourd'hui : la BAN**, par le service de géocodage de la
 * Géoplateforme. C'est la seule dont le format de réponse a été relevé. Une
 * source que le moteur ne connaît pas laisse le champ texte tel quel — c'est ce
 * qui permet d'en ajouter sans changer le contrat du FormDef.
 *
 * Mesuré le 18/10/2026, avec `curl`, depuis un poste — PAS depuis une iframe
 * Grist ni une page publiée :
 *  - `data.geopf.fr/geocodage/search` répond 200 en environ 0,15 s, en GeoJSON,
 *    avec `access-control-allow-origin: *` ;
 *  - l'ancienne adresse `api-adresse.data.gouv.fr` porte les en-têtes
 *    `Deprecation` et `Sunset` au 31/01/2026 : elle répondait encore, mais elle
 *    est au-delà de son extinction annoncée. On vise le service qui la remplace ;
 *  - l'en-tête `x-ratelimit-limit-second: 1` annonce une requête par seconde ;
 *    la fenêtre de l'autre en-tête, `ratelimit-limit: 50`, n'est pas lue ;
 *  - une saisie d'un seul caractère donne HTTP 400.
 * Non mesuré : le refus réel au-delà de la limite (HTTP 429 supposé), et le
 * comportement depuis une page publiée.
 *
 * Les `properties.x` et `properties.y` de la réponse sont des coordonnées
 * PROJETÉES (Lambert-93), pas des degrés : les coordonnées géographiques sont
 * celles de la géométrie, `[longitude, latitude]`.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.FormReferentiel = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  /**
   * Ce que chaque source sait donner, sous un nom qui dit le sens et non la
   * colonne : le FormDef associe ensuite chaque sens à la colonne de son choix
   * (`options.colonnes.annexes`).
   */
  var SOURCES = {
    ban: {
      nom: 'Base Adresse Nationale',
      url: 'https://data.geopf.fr/geocodage/search',
      // Un seul caractère donne HTTP 400 (mesuré) : on n'envoie rien en dessous.
      minimum: 3,
      limite: 5,
      // `x-ratelimit-limit-second: 1` (en-tête mesuré) : jamais deux appels à
      // moins d'une seconde l'un de l'autre.
      intervalleMs: 1000,
      attenteFrappeMs: 500,
      delaiMs: 6000,
      mention: 'Pour proposer des adresses, les caractères saisis sont envoyés à la Géoplateforme, ' +
        'service de l’État.',
      annexes: {
        codePostal: { type: 'Text', label: 'Code postal' },
        commune: { type: 'Text', label: 'Commune' },
        insee: { type: 'Text', label: 'Code INSEE' },
        latitude: { type: 'Numeric', label: 'Latitude' },
        longitude: { type: 'Numeric', label: 'Longitude' },
        identifiant: { type: 'Text', label: 'Identifiant BAN' }
      }
    }
  };

  /** Une source connue du moteur ? Sinon, le champ reste un champ texte. */
  function sourceConnue(nom) {
    return Object.prototype.hasOwnProperty.call(SOURCES, String(nom));
  }

  /** Les sens qu'une source peut donner, avec leur type Grist. */
  function annexesDe(nom) {
    return sourceConnue(nom) ? SOURCES[nom].annexes : {};
  }

  /**
   * Une erreur qui dit de quel côté elle vient : le réseau, la limite, ou la
   * réponse. Le champ ne se bloque jamais pour l'une d'elles.
   */
  function ErreurReferentiel(code, message, statut) {
    this.name = 'ErreurReferentiel';
    this.code = code;
    this.message = message;
    this.statut = statut;
  }
  ErreurReferentiel.prototype = Object.create(Error.prototype);
  ErreurReferentiel.prototype.constructor = ErreurReferentiel;

  /** Les blancs superflus ne comptent ni pour la longueur ni pour la requête. */
  function nettoyer(texte) {
    return String(texte == null ? '' : texte).replace(/\s+/g, ' ').trim();
  }

  /**
   * Une proposition de la BAN, ramenée aux sens qu'on sait écrire.
   *
   * Les coordonnées viennent de la géométrie, jamais de `properties.x` et
   * `properties.y`, qui sont en Lambert-93.
   */
  function normaliserSuggestion(feature) {
    if (!feature || typeof feature !== 'object') return null;
    var p = feature.properties || {};
    var libelle = nettoyer(p.label);
    if (!libelle) return null;
    var c = (feature.geometry && feature.geometry.coordinates) || [];
    var lon = Number(c[0]);
    var lat = Number(c[1]);
    var aCoordonnees = isFinite(lon) && isFinite(lat) && c.length >= 2;
    return {
      libelle: libelle,
      codePostal: p.postcode ? String(p.postcode) : null,
      commune: p.city ? String(p.city) : null,
      insee: p.citycode ? String(p.citycode) : null,
      latitude: aCoordonnees ? Number(lat.toFixed(6)) : null,
      longitude: aCoordonnees ? Number(lon.toFixed(6)) : null,
      identifiant: p.banId ? String(p.banId) : (p.id ? String(p.id) : null),
      type: p.type ? String(p.type) : null
    };
  }

  /** L'adresse de la requête : ce qu'on envoie, et rien d'autre. */
  function construireUrl(nom, texte, options) {
    var src = SOURCES[nom];
    var u = new URL(src.url);
    u.searchParams.set('q', nettoyer(texte));
    u.searchParams.set('limit', String((options && options.limite) || src.limite));
    u.searchParams.set('autocomplete', '1');
    return u.toString();
  }

  /**
   * Combien attendre avant le prochain appel.
   *
   * Pure, pour s'éprouver sans horloge : la limite annoncée est d'une requête
   * par seconde, et un champ qui l'ignore se fait refuser dès qu'on tape vite.
   */
  function delaiAvantAppel(dernier, maintenant, intervalle) {
    if (!dernier) return 0;
    var ecoule = maintenant - dernier;
    return ecoule >= intervalle ? 0 : intervalle - ecoule;
  }

  /** L'index suivant dans une liste, qui reboucle au début. */
  function indexSuivant(actif, n) {
    if (!n) return -1;
    return actif + 1 >= n ? 0 : actif + 1;
  }

  /** L'index précédent, qui reboucle à la fin. */
  function indexPrecedent(actif, n) {
    if (!n) return -1;
    return actif <= 0 ? n - 1 : actif - 1;
  }

  /** Ce que lit un lecteur d'écran quand la liste change. */
  function phraseResultats(n) {
    if (!n) {
      return 'Aucune adresse proposée : elle sera enregistrée telle que vous l’avez saisie.';
    }
    if (n === 1) return '1 adresse proposée. Flèche bas puis Entrée pour la choisir.';
    return n + ' adresses proposées. Flèches haut et bas pour parcourir, Entrée pour choisir.';
  }

  /** Quand le service ne répond pas, la saisie reste possible — et le dit. */
  function phraseErreur(erreur) {
    if (erreur && erreur.code === 'limite') {
      return 'Trop de recherches d’affilée : patientez une seconde, puis recommencez.';
    }
    return 'La recherche d’adresse ne répond pas : saisissez l’adresse en entier, ' +
      'elle sera enregistrée telle quelle.';
  }

  /**
   * Interroger la source.
   *
   * `opts.fetch` et `opts.controleur` se passent de l'extérieur : le premier
   * pour s'éprouver sans réseau, le second pour qu'une recherche plus récente
   * puisse annuler celle qui est en vol.
   */
  function rechercher(texte, opts) {
    opts = opts || {};
    var nom = opts.source || 'ban';
    if (!sourceConnue(nom)) {
      return Promise.reject(new ErreurReferentiel('source', 'Source inconnue : ' + nom));
    }
    var src = SOURCES[nom];
    var q = nettoyer(texte);
    // Rien à chercher : on ne dérange pas le service pour moins que son minimum.
    if (q.length < src.minimum) return Promise.resolve([]);

    var appel = opts.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!appel) {
      return Promise.reject(new ErreurReferentiel('reseau', 'Aucun moyen d’interroger le réseau.'));
    }
    var controleur = opts.controleur ||
      (typeof AbortController === 'function' ? new AbortController() : null);
    var delai = setTimeout(function () {
      if (controleur) controleur.abort();
    }, opts.delaiMs || src.delaiMs);

    var init = controleur ? { signal: controleur.signal } : {};
    return Promise.resolve()
      .then(function () { return appel(construireUrl(nom, q, opts), init); })
      .then(function (reponse) {
        clearTimeout(delai);
        if (reponse.status === 429) {
          throw new ErreurReferentiel('limite', 'Trop de requêtes.', 429);
        }
        if (!reponse.ok) {
          throw new ErreurReferentiel('http', 'Réponse ' + reponse.status, reponse.status);
        }
        return reponse.json();
      })
      .then(function (donnees) {
        var liste = (donnees && donnees.features) || [];
        return liste.map(normaliserSuggestion).filter(Boolean).slice(0, src.limite);
      })
      .catch(function (e) {
        clearTimeout(delai);
        if (e instanceof ErreurReferentiel) throw e;
        throw new ErreurReferentiel('reseau', (e && e.message) || 'Réseau indisponible.');
      });
  }

  /**
   * Brancher la liste de suggestions sur un champ texte existant.
   *
   * La liste suit le motif d'une zone de saisie à liste (rôles `combobox` et
   * `listbox`, `aria-activedescendant`) : le focus ne quitte jamais le champ,
   * c'est lui qui désigne l'option courante. Les flèches parcourent, Entrée
   * choisit, Échap ferme.
   *
   * Deux déclenchements :
   *  - `validation` (par défaut) : la recherche part sur Entrée ou sur le
   *    bouton, jamais à la frappe. Rien n'est envoyé que la personne n'ait
   *    demandé — c'est le choix le plus prudent pour les données personnelles
   *    (une adresse est souvent celle d'une personne physique) ;
   *  - `frappe` : la recherche part 500 ms après la dernière touche. Plus
   *    fluide, mais chaque pause envoie un préfixe de l'adresse au service.
   *
   * Dans les deux cas, le champ reste un champ texte : si le service ne répond
   * pas, ce qui est tapé est enregistré tel quel. Une question ne devient pas
   * impossible parce qu'un service est lent.
   */
  function monter(champ, opts) {
    opts = opts || {};
    var nom = opts.source || 'ban';
    var src = SOURCES[nom];
    if (!src || !champ) return { detruire: function () {}, chercher: function () {} };

    var doc = champ.ownerDocument || document;
    var declenchement = opts.declenchement === 'frappe' ? 'frappe' : 'validation';
    var etat = opts.etat || null;
    var hote = opts.hote || champ.parentNode;
    var bouton = opts.bouton || null;
    var idListe = (champ.id || 'referentiel') + '-liste';

    var options = [];
    var actif = -1;
    var jeton = 0;
    var controleur = null;
    var minuteur = null;
    var attente = null;
    var dernierAppel = 0;
    var detruit = false;

    champ.setAttribute('role', 'combobox');
    champ.setAttribute('aria-autocomplete', 'list');
    champ.setAttribute('aria-haspopup', 'listbox');
    champ.setAttribute('aria-expanded', 'false');
    champ.setAttribute('aria-controls', idListe);
    champ.setAttribute('autocomplete', 'off');

    var liste = doc.createElement('ul');
    liste.id = idListe;
    liste.className = 'fr-referentiel__liste';
    liste.setAttribute('role', 'listbox');
    liste.setAttribute('aria-label', 'Adresses proposées');
    liste.hidden = true;
    // Juste sous la ligne de saisie : la liste se pose en absolu depuis là.
    var ligne = champ.parentNode;
    if (ligne && ligne.parentNode === hote && ligne.nextSibling) {
      hote.insertBefore(liste, ligne.nextSibling);
    } else {
      hote.appendChild(liste);
    }

    function annoncer(texte) {
      if (etat) etat.textContent = texte || '';
    }

    function fermer() {
      liste.hidden = true;
      champ.setAttribute('aria-expanded', 'false');
      champ.removeAttribute('aria-activedescendant');
      actif = -1;
      for (var i = 0; i < liste.children.length; i++) {
        liste.children[i].setAttribute('aria-selected', 'false');
      }
    }

    function designer(index) {
      actif = index;
      for (var i = 0; i < liste.children.length; i++) {
        var estActif = i === index;
        liste.children[i].setAttribute('aria-selected', estActif ? 'true' : 'false');
        if (estActif) {
          champ.setAttribute('aria-activedescendant', liste.children[i].id);
          if (typeof liste.children[i].scrollIntoView === 'function') {
            liste.children[i].scrollIntoView({ block: 'nearest' });
          }
        }
      }
      if (index < 0) champ.removeAttribute('aria-activedescendant');
    }

    function ouvrir() {
      if (!options.length) return;
      liste.hidden = false;
      champ.setAttribute('aria-expanded', 'true');
    }

    function afficher(propositions) {
      options = propositions;
      liste.innerHTML = '';
      propositions.forEach(function (s, i) {
        var li = doc.createElement('li');
        li.id = idListe + '-' + i;
        li.className = 'fr-referentiel__option';
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        li.textContent = s.libelle;
        // Deux gestes, deux rôles. `mousedown` ne choisit pas : il empêche
        // seulement le champ de perdre le focus, ce qui fermerait la liste avant
        // que le choix ne soit pris. Le choix se prend au `click`, que les
        // lecteurs d'écran et l'activation au clavier émettent seul, sans
        // `mousedown` (et que le tactile émet aussi).
        li.addEventListener('mousedown', function (ev) {
          ev.preventDefault();
        });
        li.addEventListener('click', function () {
          choisir(i);
        });
        liste.appendChild(li);
      });
      if (propositions.length) {
        ouvrir();
        designer(-1);
      } else {
        fermer();
      }
      annoncer(phraseResultats(propositions.length));
    }

    function choisir(index) {
      var s = options[index];
      if (!s) return;
      champ.value = s.libelle;
      fermer();
      annoncer('Adresse choisie : ' + s.libelle + '.');
      if (typeof opts.onChoisir === 'function') opts.onChoisir(s);
    }

    function chercher() {
      if (detruit) return;
      clearTimeout(minuteur);
      var q = nettoyer(champ.value);
      if (q.length < src.minimum) {
        fermer();
        annoncer('Saisissez au moins ' + src.minimum + ' caractères pour chercher.');
        return;
      }
      var mien = ++jeton;
      if (controleur) controleur.abort();
      controleur = typeof AbortController === 'function' ? new AbortController() : null;
      var courant = controleur;
      annoncer('Recherche en cours…');
      clearTimeout(attente);
      attente = setTimeout(function () {
        if (mien !== jeton || detruit) return;
        dernierAppel = Date.now();
        rechercher(q, { source: nom, fetch: opts.fetch, controleur: courant })
          .then(function (propositions) {
            // Une réponse arrivée après une saisie plus récente n'est plus la bonne.
            if (mien !== jeton || detruit) return;
            afficher(propositions);
          }, function (e) {
            if (mien !== jeton || detruit) return;
            fermer();
            annoncer(phraseErreur(e));
          });
      }, delaiAvantAppel(dernierAppel, Date.now(), src.intervalleMs));
    }

    function surSaisie() {
      var texte = champ.value;
      if (typeof opts.onTexte === 'function') opts.onTexte(texte);
      // La liste affichée parle d'un texte qui n'est plus le sien.
      fermer();
      jeton++;
      if (controleur) controleur.abort();
      clearTimeout(attente);
      clearTimeout(minuteur);
      // « Adresse choisie : … » ne dit plus vrai dès que le texte change.
      annoncer('');
      if (declenchement === 'frappe' && nettoyer(texte).length >= src.minimum) {
        minuteur = setTimeout(chercher, src.attenteFrappeMs);
      }
    }

    function surTouche(ev) {
      var touche = ev.key;
      var ouverte = !liste.hidden;
      if (touche === 'ArrowDown') {
        ev.preventDefault();
        if (!ouverte) ouvrir();
        designer(indexSuivant(actif, options.length));
      } else if (touche === 'ArrowUp') {
        ev.preventDefault();
        if (!ouverte) ouvrir();
        designer(indexPrecedent(actif, options.length));
      } else if (touche === 'Enter') {
        // Toujours retenu : une validation ne doit pas envoyer le formulaire
        // entier pendant qu'on cherche une adresse.
        ev.preventDefault();
        if (ouverte && actif >= 0) choisir(actif);
        else if (declenchement === 'validation') chercher();
      } else if (touche === 'Escape') {
        if (ouverte) {
          ev.preventDefault();
          fermer();
        }
      }
    }

    function surDepart() {
      fermer();
    }

    function surBouton() {
      chercher();
    }

    champ.addEventListener('input', surSaisie);
    champ.addEventListener('keydown', surTouche);
    champ.addEventListener('blur', surDepart);
    if (bouton) bouton.addEventListener('click', surBouton);

    return {
      chercher: chercher,
      detruire: function () {
        detruit = true;
        jeton++;
        clearTimeout(minuteur);
        clearTimeout(attente);
        if (controleur) controleur.abort();
        champ.removeEventListener('input', surSaisie);
        champ.removeEventListener('keydown', surTouche);
        champ.removeEventListener('blur', surDepart);
        if (bouton) bouton.removeEventListener('click', surBouton);
        if (liste.parentNode) liste.parentNode.removeChild(liste);
      }
    };
  }

  return {
    VERSION: VERSION,
    SOURCES: SOURCES,
    ErreurReferentiel: ErreurReferentiel,
    sourceConnue: sourceConnue,
    annexesDe: annexesDe,
    normaliserSuggestion: normaliserSuggestion,
    construireUrl: construireUrl,
    rechercher: rechercher,
    monter: monter,
    // Exposés pour les essais : ce que le module décide sans réseau ni écran.
    delaiAvantAppel: delaiAvantAppel,
    indexSuivant: indexSuivant,
    indexPrecedent: indexPrecedent,
    phraseResultats: phraseResultats,
    phraseErreur: phraseErreur
  };
}));

/**
 * dessin.js — un canevas qu'on compose au doigt.
 *
 * > **Ce n'est pas une illustration, c'est une réponse.** On demande d'entourer
 * > le désordre sur une photo, de croquer l'implantation d'un carrefour, de
 * > signer un constat. Dans les trois cas la personne produit quelque chose,
 * > et ce quelque chose doit arriver dans la base.
 *
 * Le dessin est gardé comme une **liste de traits en coordonnées 0–1**, jamais
 * comme des pixels. Trois raisons, et elles comptent toutes :
 *
 * - une annotation faite sur un téléphone de 360 px doit se retrouver au bon
 *   endroit sur l'image exportée, qui en fait 1200 ;
 * - le formulaire se redessine à chaque réponse (conditions, cascades) : sans
 *   un modèle, le dessin disparaîtrait au premier changement d'avis ;
 * - « annuler » ne s'improvise pas sur des pixels — on retire le dernier trait
 *   et on repeint.
 *
 * À l'envoi, les traits sont peints une dernière fois sur un canevas hors écran
 * à taille fixe, et le résultat part en pièce jointe PNG : c'est le pipeline de
 * `attachments.js`, inchangé.
 *
 *     options.dessin = {
 *       fond:     'https://…/plan.png'   // facultatif : la photo à annoter
 *       hauteur:  320,                    // hauteur affichée, en pixels
 *       couleurs: ['#c9191e', '#161616', '#000091'],
 *       trait:    3,
 *       usage:    'croquis' | 'signature'
 *     }
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.FormDessin = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  /** La largeur de l'image produite. La hauteur suit les proportions à l'écran. */
  var LARGEUR_EXPORT = 1200;

  var COULEURS = ['#c9191e', '#161616', '#000091'];

  /**
   * La signature n'est pas un croquis.
   *
   * Elle se fait d'un seul trait, en noir, sur un fond vide, dans un cadre plus
   * large que haut. Proposer une palette et une gomme ne sert personne et
   * encombre un geste que tout le monde connaît déjà.
   */
  var USAGES = {
    signature: { couleurs: ['#161616'], trait: 2, hauteur: 180, fondBlanc: true },
    croquis: { couleurs: COULEURS, trait: 3, hauteur: 320, fondBlanc: false }
  };

  function reglages(opts) {
    var base = USAGES[opts && opts.usage] || USAGES.croquis;
    return {
      fond: (opts && opts.fond) || '',
      hauteur: Number(opts && opts.hauteur) > 0 ? Number(opts.hauteur) : base.hauteur,
      couleurs: (opts && opts.couleurs && opts.couleurs.length) ? opts.couleurs : base.couleurs,
      trait: Number(opts && opts.trait) > 0 ? Number(opts.trait) : base.trait,
      fondBlanc: base.fondBlanc,
      usage: (opts && opts.usage) || 'croquis'
    };
  }

  /**
   * Peindre les traits sur un contexte, aux dimensions qu'on lui donne.
   *
   * Les coordonnées sont des fractions : la même liste peint correctement un
   * aperçu de 300 px de large et une image de 1200.
   */
  function peindre(ctx, traits, largeur, hauteur, echelleTrait) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (var i = 0; i < traits.length; i++) {
      var t = traits[i];
      var pts = t.points || [];
      if (!pts.length) continue;
      ctx.strokeStyle = t.couleur;
      ctx.lineWidth = Math.max(1, t.largeur * echelleTrait);
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * largeur, pts[0][1] * hauteur);
      if (pts.length === 1) {
        // Un point posé sans glisser : une croix vaut mieux qu'un trait de
        // longueur nulle, que le navigateur ne dessine pas.
        ctx.lineTo(pts[0][0] * largeur + 0.5, pts[0][1] * hauteur + 0.5);
      } else {
        for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0] * largeur, pts[j][1] * hauteur);
      }
      ctx.stroke();
    }
  }

  /** Le fond, chargé une fois ; son absence n'empêche pas de dessiner. */
  function chargerFond(url) {
    return new Promise(function (resolve) {
      if (!url) { resolve(null); return; }
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  /**
   * Monter le canevas dans son hôte.
   *
   * `onChange(file, dataUrl)` est appelé quand le dessin change : à la fin d'un
   * trait, pas pendant. Produire une image à chaque mouvement du doigt ferait
   * cent fichiers par seconde pour rien.
   */
  function monter(hote, opts) {
    opts = opts || {};
    var cfg = reglages(opts);
    var traits = (opts.traits || []).slice();
    var annules = [];
    var couleur = cfg.couleurs[0];

    hote.innerHTML = '';
    hote.classList.add('fr-dessin');
    if (cfg.usage === 'signature') hote.classList.add('fr-dessin--signature');

    var planche = document.createElement('div');
    planche.className = 'fr-dessin__planche';
    planche.style.height = cfg.hauteur + 'px';

    var canevas = document.createElement('canvas');
    canevas.className = 'fr-dessin__toile';
    canevas.setAttribute('role', 'img');
    canevas.setAttribute('aria-label', opts.libelle || 'Zone de dessin');
    planche.appendChild(canevas);
    hote.appendChild(planche);

    var barre = document.createElement('div');
    barre.className = 'fr-dessin__barre';
    hote.appendChild(barre);

    // ── la palette, seulement s'il y a un choix à faire ──
    if (cfg.couleurs.length > 1) {
      var palette = document.createElement('div');
      palette.className = 'fr-dessin__palette';
      palette.setAttribute('role', 'radiogroup');
      palette.setAttribute('aria-label', 'Couleur du trait');
      cfg.couleurs.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'fr-dessin__couleur';
        b.style.background = c;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-label', 'Couleur ' + c);
        b.setAttribute('aria-checked', c === couleur ? 'true' : 'false');
        b.addEventListener('click', function () {
          couleur = c;
          Array.prototype.forEach.call(palette.children, function (x) {
            x.setAttribute('aria-checked', x === b ? 'true' : 'false');
          });
        });
        palette.appendChild(b);
      });
      barre.appendChild(palette);
    }

    function bouton(libelle, action) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'fr-btn fr-btn--tertiary fr-btn--sm';
      b.textContent = libelle;
      b.addEventListener('click', action);
      barre.appendChild(b);
      return b;
    }

    /**
     * Ce qu'on offre de defaire.
     *
     * > **Une signature n'a pas besoin de trois commandes.** On la rate, on
     * > efface, on recommence : c'est le seul geste. Annuler trait par trait,
     * > refaire, choisir une couleur — tout cela encombre un cadre que tout le
     * > monde sait deja remplir. Le croquis, lui, se construit : il merite son
     * > annulation.
     */
    var btnAnnuler = null;
    var btnRefaire = null;
    if (cfg.usage !== 'signature') {
      btnAnnuler = bouton('Annuler', function () {
        if (!traits.length) return;
        annules.push(traits.pop());
        repeindre();
        publier();
      });
      btnRefaire = bouton('Refaire', function () {
        if (!annules.length) return;
        traits.push(annules.pop());
        repeindre();
        publier();
      });
    }
    var btnEffacer = bouton(cfg.usage === 'signature' ? 'Effacer' : 'Tout effacer', function () {
      if (!traits.length) return;
      annules = traits.slice().reverse().concat(annules);
      traits = [];
      repeindre();
      publier();
    });

    function majBoutons() {
      if (btnAnnuler) btnAnnuler.disabled = !traits.length;
      if (btnRefaire) btnRefaire.disabled = !annules.length;
      btnEffacer.disabled = !traits.length;
    }

    var fond = null;
    var ctx = canevas.getContext('2d');

    /** Le canevas suit la taille réelle de son cadre, écran dense compris. */
    function dimensionner() {
      var r = planche.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      canevas.width = Math.max(1, Math.round(r.width * dpr));
      canevas.height = Math.max(1, Math.round(r.height * dpr));
      canevas.style.width = r.width + 'px';
      canevas.style.height = r.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      repeindre();
    }

    function repeindre() {
      var r = planche.getBoundingClientRect();
      ctx.clearRect(0, 0, r.width, r.height);
      if (cfg.fondBlanc || !fond) {
        ctx.fillStyle = cfg.fondBlanc ? '#fff' : 'transparent';
        if (cfg.fondBlanc) ctx.fillRect(0, 0, r.width, r.height);
      }
      if (fond) dessinerFond(ctx, fond, r.width, r.height);
      peindre(ctx, traits, r.width, r.height, 1);
      majBoutons();
    }

    /** Le fond entre entier dans le cadre : on n'annote pas ce qu'on ne voit pas. */
    function dessinerFond(c, img, L, H) {
      var k = Math.min(L / img.width, H / img.height);
      var l = img.width * k;
      var h = img.height * k;
      c.drawImage(img, (L - l) / 2, (H - h) / 2, l, h);
    }

    // ── le geste ──
    var enCours = null;

    function position(ev) {
      var r = canevas.getBoundingClientRect();
      return [(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height];
    }

    canevas.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      if (canevas.setPointerCapture) { try { canevas.setPointerCapture(ev.pointerId); } catch (e) { /* ignoré */ } }
      enCours = { couleur: couleur, largeur: cfg.trait, points: [position(ev)] };
      traits.push(enCours);
      annules = [];
      repeindre();
    });

    canevas.addEventListener('pointermove', function (ev) {
      if (!enCours) return;
      ev.preventDefault();
      enCours.points.push(position(ev));
      repeindre();
    });

    function finir() {
      if (!enCours) return;
      enCours = null;
      publier();
    }
    canevas.addEventListener('pointerup', finir);
    canevas.addEventListener('pointercancel', finir);
    canevas.addEventListener('pointerleave', finir);

    /**
     * Produire l'image : une seule fois par trait fini.
     *
     * Le fond en fait partie — ce qui arrive dans la base est ce que la
     * personne a vu, pas un calque d'annotations illisible sans son support.
     */
    function publier() {
      majBoutons();
      if (typeof opts.onChange !== 'function') return;
      if (!traits.length) { opts.onChange(null, '', traits); return; }
      exporter().then(function (res) {
        opts.onChange(res.file, res.dataUrl, traits);
      });
    }

    function exporter() {
      var r = planche.getBoundingClientRect();
      var proportions = r.height / Math.max(1, r.width);
      var L = LARGEUR_EXPORT;
      var H = Math.round(L * proportions);
      var hors = document.createElement('canvas');
      hors.width = L;
      hors.height = H;
      var c = hors.getContext('2d');
      c.fillStyle = '#fff';
      c.fillRect(0, 0, L, H);
      if (fond) dessinerFond(c, fond, L, H);
      peindre(c, traits, L, H, L / Math.max(1, r.width));
      var dataUrl = hors.toDataURL('image/png');
      return new Promise(function (resolve) {
        if (!hors.toBlob) { resolve({ file: null, dataUrl: dataUrl }); return; }
        hors.toBlob(function (blob) {
          var nom = (opts.nom || 'dessin') + '.png';
          var file = blob ? new File([blob], nom, { type: 'image/png' }) : null;
          resolve({ file: file, dataUrl: dataUrl });
        }, 'image/png');
      });
    }

    var observateur = null;
    if (typeof ResizeObserver === 'function') {
      observateur = new ResizeObserver(function () { dimensionner(); });
      observateur.observe(planche);
    } else {
      window.addEventListener('resize', dimensionner);
    }

    return chargerFond(cfg.fond).then(function (img) {
      fond = img;
      dimensionner();
      return {
        traits: function () { return traits; },
        exporter: exporter,
        detruire: function () {
          if (observateur) observateur.disconnect();
          else window.removeEventListener('resize', dimensionner);
        }
      };
    });
  }

  return {
    VERSION: VERSION,
    monter: monter,
    // Exposés pour les essais : ce que le dessin calcule sans écran.
    reglages: reglages,
    peindre: peindre
  };
}));

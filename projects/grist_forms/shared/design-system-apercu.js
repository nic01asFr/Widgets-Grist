/*
 * design-system-apercu.js — montrer ce que dit un design system pendant qu'on le saisit.
 *
 * Deux choses, sans écran propre (des chaînes et des objets) :
 *
 *   - `themeVars` : de quoi habiller le formulaire LUI-MÊME avec le thème en construction. Un jeu de variables `--kit-*`
 *     (le contrat `kit-theme/0.1`) tiré des graines du document. C'est un APERÇU : le compilateur du kit reste seul juge du
 *     thème, et ce calcul ne le remplace pas. Il garde la personne lisible (un texte sous 3:1 est redressé et dit) tout
 *     en lui laissant voir la couleur qu'elle a choisie.
 *   - `apercuHtml` : une illustration du module dont on remplit l'étape (couleurs, formes, espacements, types…), rendue
 *     avec les valeurs du document.
 *
 * > **Rien de ce que la personne tape n'arrive tel quel dans une page.** Une couleur n'est admise que sous la forme
 * > `#RRGGBB`, une longueur que sous une forme bornée, un nom de police que fait de lettres, et tout texte est échappé.
 */
(function (root, factory) {
  'use strict';
  var asNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  if (asNode && typeof module === 'object' && module.exports) {
    module.exports = factory(require('./design-system.js'), require('./themedef.js'));
  } else if (typeof define === 'function' && define.amd) {
    define(['./design-system', './themedef'], factory);
  } else {
    root.FormDesignSystemApercu = factory(root.FormDesignSystem, root.FormThemeDef);
  }
}(typeof self !== 'undefined' ? self : this, function (DS, TD) {
  'use strict';

  var HEX = /^#[0-9a-fA-F]{6}$/;
  var LONGUEUR = /^\d{1,3}(\.\d{1,2})?(px|rem|em|%)$/;
  var POLICE = /^[A-Za-z0-9][A-Za-z0-9 \-]{0,39}$/;
  var REPLI = /^[A-Za-z0-9 ,\-]{1,80}$/;
  var OMBRE = /^-?\d{1,3}(?:px)? -?\d{1,3}(?:px)? \d{1,3}(?:px)?(?: \d{1,3}(?:px)?)? (?:#[0-9a-fA-F]{3,8}|rgba\(\d{1,3}, ?\d{1,3}, ?\d{1,3}, ?[0-9.]{1,4}\))$/;

  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function couleurSure(v) { return typeof v === 'string' && HEX.test(v.trim()) ? v.trim().toLowerCase() : ''; }
  function longueurSure(v) { return typeof v === 'string' && LONGUEUR.test(v.trim()) ? v.trim() : ''; }
  function ombreSure(v) { return typeof v === 'string' && v.length <= 80 && OMBRE.test(v.trim()) ? v.trim() : ''; }
  function nombreSur(v, min, max) { return typeof v === 'number' && isFinite(v) && v >= min && v <= max ? v : null; }
  function lire(doc, chemin) {
    var c = doc;
    for (var i = 0; i < chemin.length; i++) {
      if (!c || typeof c !== 'object' || !Object.prototype.hasOwnProperty.call(c, chemin[i])) return undefined;
      c = c[chemin[i]];
    }
    return c;
  }

  // ── Couleurs ────────────────────────────────────────────────────────────────

  function rgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hexDe(c) {
    return '#' + c.map(function (v) { var s = Math.max(0, Math.min(255, Math.round(v))).toString(16); return s.length < 2 ? '0' + s : s; }).join('');
  }
  /** `t` de b dans a : 0 donne a, 1 donne b. */
  function melanger(a, b, t) {
    var x = rgb(a); var y = rgb(b);
    return hexDe([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
  }
  function rapport(a, b) { return DS.contraste(a, b) || 1; }

  /** Rapproche `couleur` de `vers` (noir ou blanc) jusqu'à `seuil`:1 sur `fond`. */
  function redresser(couleur, fond, seuil, vers) {
    var c = couleur;
    for (var i = 0; i < 24 && rapport(c, fond) < seuil; i++) c = melanger(c, vers, 0.12);
    return c;
  }

  function meilleurTexte(sur) { return rapport('#ffffff', sur) >= rapport('#161616', sur) ? '#ffffff' : '#161616'; }
  function clair(h) { return rapport(h, '#ffffff') < rapport(h, '#000000'); }

  var ETATS = { ok: ['succes', '#18753c'], attention: ['attention', '#b34000'], alerte: ['erreur', '#ce0500'], info: ['information', '#0063cb'] };

  /** Les modes qu'un document propose : le clair, et le sombre sauf s'il dit « aucun ». */
  function modesDisponibles(doc) {
    return lire(doc, ['modes', 'sombre']) === 'aucun' ? ['clair'] : ['clair', 'sombre'];
  }

  /**
   * Le thème d'aperçu d'un document, pour un mode : les graines du design system, passées à la dérivation que tout widget de Form
   * Builder partage (`shared/themedef.js`).
   *
   * @returns {{vars:Object<string,string>, remarques:string[]}} `vars` : variables `--kit-*` (sans le préfixe) ; `remarques` : ce qui a été redressé
   */
  function themeVars(doc, mode) {
    doc = doc || {};
    var c = lire(doc, ['couleurs']) || {};
    return TD.deriver({
      principal: c.principal, secondaire: c.secondaire, encre: c.encre, fond: c.fond, etats: c.etats,
      sombre: lire(doc, ['modes', 'sombre']), sombreCouleurs: c.sombre
    }, mode);
  }

  /**
   * Les réglages de forme et de taille que le document sait dire, sous leurs noms CSS : le rayon, la cible tactile, la taille
   * du texte. Rien n'est posé que le document n'ait dit, et chaque valeur reste bornée.
   */
  function reglagesForme(doc) {
    var out = {};
    var rayons = lire(doc, ['forme', 'rayons']);
    if (Array.isArray(rayons)) {
      var r = rayons.map(function (x) { return x && longueurSure(x.valeur); }).filter(Boolean)[0];
      if (r) out['--radius'] = r;
    }
    var cible = nombreSur(lire(doc, ['interaction', 'cibleMinPx']), 24, 96);
    if (cible !== null) out['--cible'] = cible + 'px';
    var base = nombreSur(lire(doc, ['typographie', 'echelle', 'base']), 14, 24);
    if (base !== null) out['--texte'] = (base / 16) + 'rem';
    return out;
  }

  // ── Illustrations ───────────────────────────────────────────────────────────

  function ratio2(r) { return String(Math.round(r * 100) / 100).replace('.', ',') + ':1'; }

  function pastille(libelle, hex) {
    var h = couleurSure(hex);
    if (!h) return '';
    return '<span class="ds-sw" style="background:' + h + ';color:' + meilleurTexte(h) + '"><span class="ds-sw__l">' + esc(libelle) + '</span><span class="ds-sw__h">' + esc(h.toUpperCase()) + '</span></span>';
  }

  function rangee(titre, pastilles) {
    var h = pastilles.filter(Boolean).join('');
    return h ? '<div class="ds-ap__bloc"><p class="ds-ap__titre">' + esc(titre) + '</p><div class="ds-ap__rang">' + h + '</div></div>' : '';
  }

  function paire(libelle, texteHex, fondHex, seuil) {
    var t = couleurSure(texteHex); var f = couleurSure(fondHex);
    if (!t || !f) return '';
    var r = rapport(t, f);
    var ok = r >= seuil;
    return '<div class="ds-paire" style="background:' + f + ';color:' + t + '"><b>Aa</b><span>' + esc(libelle) + '</span><span class="ds-paire__r">' + ratio2(r) +
      (ok ? ' · suffisant' : ' · sous le seuil de ' + ratio2(seuil)) + '</span></div>';
  }

  function fabCouleurs(doc) {
    var c = lire(doc, ['couleurs']) || {};
    var seuilT = nombreSur(lire(doc, ['exigences', 'contrasteTexte']), 1, 21) || 4.5;
    var seuilG = nombreSur(lire(doc, ['exigences', 'contrasteMinimal']), 1, 21) || 3;
    var h = rangee('Graines', [pastille('Principale', c.principal), pastille('Secondaire', c.secondaire), pastille('Texte', c.encre), pastille('Fond', c.fond)]);
    var etats = c.etats || {};
    h += rangee('États', Object.keys(etats).map(function (k) { return pastille(k, etats[k]); }));
    h += rangee('Neutres', (Array.isArray(c.neutres) ? c.neutres : []).slice(0, 12).map(function (n) { return n && pastille(n.nom || 'neutre', n.valeur); }));
    (Array.isArray(c.identites) ? c.identites : []).slice(0, 12).forEach(function (i) {
      if (!i) return;
      h += rangee(i.nom || i.id || 'Identité', [pastille('Plein', i.plein), pastille('Intermédiaire', i.intermediaire), pastille('Clair', i.clair), pastille('Secondaire', i.secondaire)]);
    });
    var paires = paire('texte sur le fond', c.encre, c.fond, seuilT) + paire('principale sur le fond', c.principal, c.fond, seuilG);
    Object.keys(etats).forEach(function (k) { paires += paire('état « ' + k + ' » sur le fond', etats[k], c.fond, seuilT); });
    if (paires) h += '<div class="ds-ap__bloc"><p class="ds-ap__titre">Contrastes</p><div class="ds-ap__paires">' + paires + '</div></div>';
    return h;
  }

  function miniCarte(mode, doc) {
    var t = themeVars(doc, mode).vars;
    var style = Object.keys(t).map(function (k) { return '--kit-' + k + ':' + t[k]; }).join(';');
    return '<div class="ds-mini" style="' + style + '"><p class="ds-mini__t">Mode ' + esc(mode) + '</p><p class="ds-mini__p">Un texte courant, un <span class="ds-mini__lien">lien</span>.</p>' +
      '<span class="ds-mini__b">Bouton</span><span class="ds-mini__e">Erreur</span></div>';
  }

  function fabModes(doc) {
    var choix = lire(doc, ['modes', 'sombre']);
    var dispo = modesDisponibles(doc);
    return '<div class="ds-ap__bloc"><div class="ds-ap__minis">' + dispo.map(function (m) { return miniCarte(m, doc); }).join('') + '</div>' +
      (choix === 'aucun' ? '<p class="ds-ap__note">Pas de mode sombre : le thème clair reste seul.</p>' : '') + '</div>';
  }

  function fabExigences(doc) {
    var c = lire(doc, ['couleurs']) || {};
    var seuilT = nombreSur(lire(doc, ['exigences', 'contrasteTexte']), 1, 21) || 4.5;
    var seuilG = nombreSur(lire(doc, ['exigences', 'contrasteMinimal']), 1, 21) || 3;
    var h = paire('texte sur le fond (seuil ' + ratio2(seuilT) + ')', c.encre, c.fond, seuilT) +
      paire('principale sur le fond (seuil ' + ratio2(seuilG) + ')', c.principal, c.fond, seuilG);
    return h ? '<div class="ds-ap__bloc"><div class="ds-ap__paires">' + h + '</div></div>'
      : '<p class="ds-ap__note">Donnez les couleurs du texte et du fond pour voir ces seuils s’appliquer.</p>';
  }

  function fabTypographie(doc) {
    var fam = lire(doc, ['typographie', 'familles']);
    var h = '';
    (Array.isArray(fam) ? fam : []).slice(0, 6).forEach(function (f) {
      if (!f || typeof f.nom !== 'string' || !POLICE.test(f.nom)) return;
      var repli = typeof f.repli === 'string' && REPLI.test(f.repli) ? f.repli : 'sans-serif';
      h += '<div class="ds-spec" style="font-family:\'' + f.nom + '\',' + repli + '"><span class="ds-spec__r">' + esc(f.role || 'texte') + ' · ' + esc(f.nom) + '</span>' +
        '<span class="ds-spec__a">Aa Bb Cc 0123</span><span class="ds-spec__p">Voyez comme cette phrase se lit sur une ligne.</span></div>';
    });
    var base = nombreSur(lire(doc, ['typographie', 'echelle', 'base']), 8, 40);
    var ratio = nombreSur(lire(doc, ['typographie', 'echelle', 'ratio']), 1, 3) || 1.25;
    if (base !== null) {
      var lignes = '';
      for (var i = 2; i >= 0; i--) {
        var px = Math.round(base * Math.pow(ratio, i) * 10) / 10;
        lignes += '<span class="ds-ech" style="font-size:' + Math.min(px, 48) + 'px">' + (i === 0 ? 'Texte' : 'Titre ' + i) + ' · ' + px + ' px</span>';
      }
      h += '<div class="ds-ap__bloc"><p class="ds-ap__titre">Échelle (base × ' + String(ratio).replace('.', ',') + ')</p>' + lignes + '</div>';
    }
    return h;
  }

  function fabForme(doc) {
    var h = '';
    var rayons = lire(doc, ['forme', 'rayons']);
    var rs = (Array.isArray(rayons) ? rayons : []).slice(0, 8).map(function (r) {
      var v = r && longueurSure(r.valeur);
      return v ? '<span class="ds-bloc" style="border-radius:' + v + '"><span>' + esc(r.nom || 'rayon') + '</span><span>' + esc(v) + '</span></span>' : '';
    }).join('');
    if (rs) h += '<div class="ds-ap__bloc"><p class="ds-ap__titre">Rayons</p><div class="ds-ap__rang">' + rs + '</div></div>';
    var ombres = lire(doc, ['forme', 'ombres']);
    var os = (Array.isArray(ombres) ? ombres : []).slice(0, 8).map(function (o) {
      var v = o && ombreSure(o.valeur);
      return v ? '<span class="ds-bloc ds-bloc--ombre" style="box-shadow:' + v + '"><span>' + esc(o.nom || 'ombre') + '</span></span>' : '';
    }).join('');
    if (os) h += '<div class="ds-ap__bloc"><p class="ds-ap__titre">Ombres</p><div class="ds-ap__rang">' + os + '</div></div>';
    var trait = nombreSur(lire(doc, ['forme', 'traits', 'epaisseur']), 0.5, 8);
    if (trait !== null) h += '<div class="ds-ap__bloc"><p class="ds-ap__titre">Trait</p><span class="ds-trait" style="border-top-width:' + trait + 'px"></span></div>';
    return h;
  }

  function fabEspacement(doc) {
    var unite = nombreSur(lire(doc, ['espacement', 'unite']), 1, 32);
    var ech = lire(doc, ['espacement', 'echelle']);
    if (unite === null || !Array.isArray(ech)) return '';
    var barres = ech.filter(function (m) { return typeof m === 'number' && isFinite(m) && m >= 0 && m <= 64; }).slice(0, 14).map(function (m) {
      var px = Math.min(Math.round(m * unite * 10) / 10, 400);
      return '<span class="ds-esp"><span class="ds-esp__b" style="width:' + px + 'px"></span><span class="ds-esp__l">' + String(m).replace('.', ',') + ' × ' + unite + ' = ' + px + ' px</span></span>';
    }).join('');
    return barres ? '<div class="ds-ap__bloc">' + barres + '</div>' : '';
  }

  function fabGrille(doc) {
    var n = nombreSur(lire(doc, ['grille', 'colonnes']), 1, 24);
    var g = nombreSur(lire(doc, ['grille', 'gouttiere']), 0, 64) || 0;
    var h = '';
    if (n !== null) {
      var cols = '';
      for (var i = 0; i < n; i++) cols += '<span class="ds-col"></span>';
      h += '<div class="ds-ap__bloc"><p class="ds-ap__titre">' + n + ' colonnes, gouttière ' + g + ' px</p><div class="ds-grille" style="gap:' + Math.min(g, 24) + 'px">' + cols + '</div></div>';
    }
    var pts = lire(doc, ['grille', 'pointsRupture']);
    var ps = (Array.isArray(pts) ? pts : []).filter(function (p) { return p && typeof p.largeur === 'number' && p.largeur >= 240 && p.largeur <= 3840; }).slice(0, 8)
      .map(function (p) { return '<span class="ds-rupt"><span class="ds-rupt__b" style="width:' + Math.round(p.largeur / 12) + 'px"></span><span>' + esc(p.nom || '') + ' · ' + p.largeur + ' px</span></span>'; }).join('');
    if (ps) h += '<div class="ds-ap__bloc"><p class="ds-ap__titre">Points de rupture</p>' + ps + '</div>';
    return h;
  }

  var MM = { mm: 1, cm: 10, in: 25.4, px: 0.2646 };
  function enMm(v) {
    var m = /^(\d{1,4}(?:\.\d{1,2})?)(mm|cm|px|in)$/.exec(String(v || '').trim());
    return m ? parseFloat(m[1]) * MM[m[2]] : null;
  }

  function fabSupports(doc) {
    var fs = lire(doc, ['supports', 'formats']);
    var h = (Array.isArray(fs) ? fs : []).slice(0, 8).map(function (f) {
      var w = f && enMm(f.largeur); var hh = f && enMm(f.hauteur);
      if (!w || !hh) return '';
      var k = 90 / Math.max(w, hh);
      return '<span class="ds-fmt"><span class="ds-fmt__r" style="width:' + Math.max(8, Math.round(w * k)) + 'px;height:' + Math.max(8, Math.round(hh * k)) + 'px"></span><span>' + esc(f.nom || '') + '</span></span>';
    }).join('');
    return h ? '<div class="ds-ap__bloc"><div class="ds-ap__rang">' + h + '</div></div>' : '';
  }

  function fabInteraction(doc) {
    var cible = nombreSur(lire(doc, ['interaction', 'cibleMinPx']), 24, 96);
    var epaisseur = nombreSur(lire(doc, ['interaction', 'focus', 'epaisseurPx']), 1, 6) || 2;
    var h = '';
    if (cible !== null) h += '<div class="ds-ap__bloc"><p class="ds-ap__titre">Cible tactile : ' + cible + ' px</p><span class="ds-cible" style="width:' + cible + 'px;height:' + cible + 'px"></span></div>';
    h += '<div class="ds-ap__bloc"><p class="ds-ap__titre">Anneau de focus : ' + epaisseur + ' px</p><span class="ds-focus" style="outline-width:' + epaisseur + 'px">Bouton</span></div>';
    var etats = lire(doc, ['interaction', 'etats']);
    if (Array.isArray(etats) && etats.length) h += '<div class="ds-ap__bloc"><p class="ds-ap__titre">États décrits</p><div class="ds-ap__rang">' + etats.slice(0, 8).map(function (e) { return '<span class="ds-puce">' + esc(e) + '</span>'; }).join('') + '</div></div>';
    var courte = nombreSur(lire(doc, ['interaction', 'mouvement', 'dureeCourteMs']), 50, 600);
    var longue = nombreSur(lire(doc, ['interaction', 'mouvement', 'dureeLongueMs']), 150, 2000);
    if (courte !== null || longue !== null) {
      h += '<div class="ds-ap__bloc"><p class="ds-ap__titre">Durées d’animation</p>' +
        (courte !== null ? '<span class="ds-dur"><span class="ds-dur__b" style="width:' + Math.round(courte / 4) + 'px"></span>courte · ' + courte + ' ms</span>' : '') +
        (longue !== null ? '<span class="ds-dur"><span class="ds-dur__b" style="width:' + Math.round(longue / 4) + 'px"></span>longue · ' + longue + ' ms</span>' : '') + '</div>';
    }
    return h;
  }

  function serie(titre, liste) {
    var l = (Array.isArray(liste) ? liste : []).filter(couleurSure).slice(0, 12);
    if (!l.length) return '';
    return '<div class="ds-ap__bloc"><p class="ds-ap__titre">' + esc(titre) + ' (' + l.length + ')</p><div class="ds-serie">' +
      l.map(function (c) { return '<span class="ds-serie__c" style="background:' + couleurSure(c) + '" title="' + esc(couleurSure(c).toUpperCase()) + '"></span>'; }).join('') + '</div></div>';
  }

  function fabVisualisation(doc) {
    var v = lire(doc, ['visualisation']) || {};
    return serie('Séries distinctes', v.categorielle) + serie('Rampe séquentielle', v.sequentielle) + serie('Rampe divergente', v.divergente);
  }

  function fabComposants(doc) {
    var cs = lire(doc, ['composants']);
    var h = (Array.isArray(cs) ? cs : []).slice(0, 10).map(function (c) {
      if (!c || !c.nom) return '';
      return '<span class="ds-comp"><b>' + esc(c.nom) + '</b>' + (Array.isArray(c.variantes) && c.variantes.length ? '<span>' + esc(c.variantes.slice(0, 6).join(', ')) + '</span>' : '') + '</span>';
    }).join('');
    return h ? '<div class="ds-ap__bloc"><div class="ds-ap__rang">' + h + '</div></div>' : '';
  }

  function fabEditorial(doc) {
    var e = lire(doc, ['editorial']) || {};
    var h = '';
    if (typeof e.slogan === 'string' && e.slogan) h += '<p class="ds-slogan">« ' + esc(e.slogan.slice(0, 160)) + ' »</p>';
    if (typeof e.voix === 'string' && e.voix) h += '<p class="ds-ap__note">' + esc(e.voix.slice(0, 400)) + '</p>';
    return h;
  }

  function fabAccessibilite(doc) {
    var a = lire(doc, ['accessibilite']) || {};
    var puces = [];
    if (typeof a.niveauCible === 'string') puces.push(a.niveauCible);
    (Array.isArray(a.respectPreferences) ? a.respectPreferences : []).slice(0, 6).forEach(function (p) { puces.push(p); });
    return puces.length ? '<div class="ds-ap__bloc"><div class="ds-ap__rang">' + puces.map(function (p) { return '<span class="ds-puce">' + esc(p) + '</span>'; }).join('') + '</div></div>' : '';
  }

  function fabIdentite(doc) {
    var i = lire(doc, ['identite']) || {};
    if (!i.nom && !i.id) return '';
    return '<div class="ds-ap__bloc"><p class="ds-ap__nom">' + esc(String(i.nom || i.id).slice(0, 80)) + '</p><p class="ds-ap__note">' +
      esc([i.id, i.version && 'version ' + i.version, i.statut].filter(Boolean).join(' · ')) + '</p></div>';
  }

  function fabGouvernance(doc) {
    var ec = lire(doc, ['gouvernance', 'ecarts']);
    var h = (Array.isArray(ec) ? ec : []).slice(0, 8).map(function (e) {
      return e ? '<li><b>' + esc(e.regle || '?') + '</b> · ' + esc(String(e.raison || e.id || '').slice(0, 160)) + '</li>' : '';
    }).join('');
    return h ? '<div class="ds-ap__bloc"><p class="ds-ap__titre">Écarts déclarés</p><ul class="ds-ap__liste">' + h + '</ul></div>' : '';
  }

  var FABRIQUES = {
    identite: fabIdentite, couleurs: fabCouleurs, modes: fabModes, exigences: fabExigences, typographie: fabTypographie, forme: fabForme,
    espacement: fabEspacement, grille: fabGrille, supports: fabSupports, interaction: fabInteraction, visualisation: fabVisualisation,
    composants: fabComposants, editorial: fabEditorial, accessibilite: fabAccessibilite, gouvernance: fabGouvernance
  };

  /** L'illustration d'un module, avec les valeurs du document ; une chaîne vide quand il n'y a rien à montrer encore. */
  function apercuHtml(moduleId, doc) {
    var f = Object.prototype.hasOwnProperty.call(FABRIQUES, moduleId) ? FABRIQUES[moduleId] : null;
    if (!f) return '';
    var h = f(doc || {});
    return h ? '<div class="ds-ap" data-module="' + esc(moduleId) + '">' + h + '</div>' : '';
  }

  return {
    themeVars: themeVars,
    modesDisponibles: modesDisponibles,
    reglagesForme: reglagesForme,
    apercuHtml: apercuHtml,
    MODULES: Object.keys(FABRIQUES)
  };
}));

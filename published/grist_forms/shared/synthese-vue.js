/**
 * synthese-vue.js — montrer ce que les réponses disent.
 *
 * Le calcul est ailleurs (`synthese.js`), et il ne connaît ni HTML ni Grist.
 * Ici on ne fait que le mettre en page, dans les mêmes classes que le
 * formulaire : une enquête et sa restitution ne doivent pas avoir l'air de
 * venir de deux maisons différentes.
 *
 * > **Le `n` est toujours écrit à côté du résultat.** « 70 % » sur quatre
 * > réponses et « 70 % » sur deux cents ne disent pas la même chose, et une
 * > synthèse qui cache son effectif ment par omission. C'est la seule règle
 * > non négociable de ce fichier.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.FormSyntheseVue = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function pourcent(x) { return Math.round((x || 0) * 100); }

  /** Un temps de remplissage se lit en minutes et secondes, pas en secondes. */
  function duree(secondes) {
    if (secondes == null) return '—';
    var m = Math.floor(secondes / 60);
    var s = Math.round(secondes % 60);
    return m + '′' + (s < 10 ? '0' : '') + s + '″';
  }

  /** Un chiffre qu'on lit d'un coup d'œil, et ce qu'il recouvre. */
  function chiffre(libelle, valeur, precision) {
    return '<div class="fr-chiffre">' +
      '<p class="fr-chiffre__libelle">' + escapeHtml(libelle) + '</p>' +
      '<p class="fr-chiffre__valeur">' + escapeHtml(valeur) + '</p>' +
      (precision ? '<p class="fr-chiffre__precision">' + escapeHtml(precision) + '</p>' : '') +
      '</div>';
  }

  /**
   * Une barre, son libellé, sa part et son effectif.
   *
   * La couleur dit la polarité : on ne lit pas de la même façon « 80 % trouvent
   * les espaces agréables » et « 80 % demandent des places ».
   */
  function barre(libelle, part, ton, n, note, valeur) {
    // > **Un classement n'est pas un pourcentage.** Un score pondere se lit en
    // > points ; afficher « 100 % » pour le premier laisse croire que tout le
    // > monde l'a cite. La barre reste relative au plus fort, mais le chiffre
    // > ecrit a cote est celui qu'on peut citer dans un rapport.
    var ecrit = valeur != null ? String(valeur) : pourcent(part) + ' %';
    return '<div class="fr-barre">' +
      '<div class="fr-barre__corps">' +
      '<p class="fr-barre__libelle">' + escapeHtml(libelle) +
      (note ? ' <span class="fr-barre__note">' + escapeHtml(note) + '</span>' : '') + '</p>' +
      '<div class="fr-barre__piste fr-barre__piste--' + ton + '">' +
      '<span style="width:' + pourcent(part) + '%"></span></div>' +
      (n != null ? '<p class="fr-barre__n">n = ' + n + '</p>' : '') +
      '</div>' +
      '<p class="fr-barre__valeur">' + escapeHtml(ecrit) + '</p>' +
      '</div>';
  }

  var TONS = { besoin: 'besoin', satisfaction: 'satisfaction', preference: 'preference' };

  function mesureEnBarre(m) {
    var note = m.moyenne != null ? 'moy. ' + m.moyenne.toFixed(1) + ' / ' + m.max : '';
    return barre(m.label, m.haut || 0, TONS[m.polarite] || 'neutre', m.n, note);
  }

  function vide(texte) {
    return '<p class="fr-hint-text fr-synthese__vide">' + escapeHtml(texte) + '</p>';
  }

  function section(titre, sous, corps) {
    return '<section class="fr-synthese__bloc">' +
      '<h2 class="fr-synthese__titre">' + escapeHtml(titre) + '</h2>' +
      (sous ? '<p class="fr-hint-text">' + escapeHtml(sous) + '</p>' : '') +
      corps + '</section>';
  }

  /**
   * La synthèse entière, en HTML.
   *
   * `modele` vient de `FormSynthese.construire`. Rien n'est calculé ici : si un
   * chiffre est faux, il l'était déjà avant d'arriver.
   */
  function rendre(modele, formDef) {
    if (!modele) return '';
    var html = '';

    var titre = (formDef && (formDef.title || formDef.id)) || 'Synthèse';
    html += '<header class="fr-synthese__entete">' +
      '<h1 class="fr-synthese__h1">Synthèse — ' + escapeHtml(titre) + '</h1></header>';

    // ── les chiffres d'abord : combien, et à quel prix pour les répondants ──
    html += '<div class="fr-chiffres">' +
      chiffre('Réponses', String(modele.reponses), '') +
      chiffre('Temps médian', duree(modele.duree && modele.duree.mediane),
        modele.duree && modele.duree.n ? 'sur ' + modele.duree.n + ' réponses' : '—') +
      chiffre('Lieux signalés', String(compterLieux(modele)), 'contributions situées') +
      chiffre('Réponses libres', String(compterVerbatims(modele)), 'à relire') +
      '</div>';

    if (!modele.reponses) {
      return html + vide('Aucune réponse pour l’instant : la synthèse se remplira d’elle-même.');
    }

    // ── ce qui ressort : le cœur de la lecture ──
    var r = modele.ressort || {};
    var colonnes = '';
    if ((r.besoins || []).length) {
      colonnes += '<div class="fr-ressort__colonne"><h3 class="fr-ressort__h3 fr-ressort__h3--besoin">' +
        'Ce qui est demandé</h3>' + r.besoins.slice(0, 6).map(mesureEnBarre).join('') + '</div>';
    }
    if ((r.satisfactions || []).length) {
      colonnes += '<div class="fr-ressort__colonne"><h3 class="fr-ressort__h3 fr-ressort__h3--satisfaction">' +
        'Ce qui va bien</h3>' + r.satisfactions.slice(0, 6).map(mesureEnBarre).join('') + '</div>';
    }
    if ((r.preferences || []).length) {
      colonnes += '<div class="fr-ressort__colonne"><h3 class="fr-ressort__h3 fr-ressort__h3--preference">' +
        'Ce qui est préféré</h3>' + r.preferences.slice(0, 6).map(mesureEnBarre).join('') + '</div>';
    }
    html += section('Ce qui ressort',
      'Part des deux crans hauts de chaque échelle. Les questions sans indication de sens n’y figurent pas.',
      colonnes ? '<div class="fr-ressort">' + colonnes + '</div>'
        : vide('Aucune échelle ne porte d’indication de sens : précisez, sur chaque échelle, ce que « haut » veut dire.'));

    // ── les classements, ramenés à un score ──
    (modele.classements || []).forEach(function (c) {
      var max = c.scores.length ? c.scores[0].points : 1;
      var corps = c.scores.length
        ? c.scores.map(function (s) {
          return barre(s.option, s.points / Math.max(1, max), 'preference', null,
            s.citations + ' citation' + (s.citations > 1 ? 's' : '') +
            ', ' + s.premier + ' fois en tête',
            s.points + ' pts');
        }).join('')
        : vide('Pas encore de classement.');
      html += section(c.label, 'Score pondéré : la première place vaut le plus de points.', corps);
    });

    // ── les listes de choix ──
    (modele.listes || []).forEach(function (l) {
      if (!l.items.length && !(l.autres || []).length) return;
      var max = l.items.length ? l.items[0].n : 1;
      var corps = l.items.map(function (it) {
        // Pour une liste, le chiffre qui parle est le nombre de citations, et
        // la part se dit en repondants — pas en part du plus cite.
        var part = modele.reponses ? it.n / modele.reponses : 0;
        return barre(it.valeur, it.n / Math.max(1, max), 'neutre', null,
          pourcent(part) + ' % des répondants', String(it.n));
      }).join('');
      if ((l.autres || []).length) {
        corps += '<div class="fr-synthese__autres"><p class="fr-hint-text">Autres réponses :</p>' +
          l.autres.map(function (a) {
            return '<p class="fr-verbatim">' + escapeHtml(a) + '</p>';
          }).join('') + '</div>';
      }
      html += section(l.label, '', corps);
    });

    // ── le détail, étape par étape : l'ordre du questionnaire ──
    var detail = (modele.sections || []).map(function (s) {
      var mes = (s.mesures || []).filter(function (m) { return m.n > 0 && m.moyenne !== undefined; });
      if (!mes.length) return '';
      return '<div class="fr-synthese__etape"><h3 class="fr-synthese__h3">' + escapeHtml(s.label) + '</h3>' +
        mes.map(mesureEnBarre).join('') + '</div>';
    }).join('');
    if (detail) {
      html += section('Le détail, étape par étape',
        'Dans l’ordre où les questions ont été posées.', detail);
    }

    // ── ce que les gens ont écrit, sans le résumer ──
    var verbs = '';
    (modele.verbatims || []).forEach(function (v) {
      if (!v.textes.length) return;
      verbs += '<div class="fr-synthese__verbats"><p class="fr-synthese__source">' +
        escapeHtml(v.label) + ' — ' + v.textes.length + '</p>' +
        v.textes.slice(0, 40).map(function (t) {
          return '<p class="fr-verbatim">' + escapeHtml(t) + '</p>';
        }).join('') + '</div>';
    });
    if (verbs) {
      html += section('Ce qui a été écrit',
        'Les réponses libres, telles quelles. Elles se lisent, elles ne se comptent pas.', verbs);
    }

    return html;
  }

  function compterLieux(modele) {
    return (modele.lieux || []).reduce(function (a, l) { return a + l.wkts.length; }, 0);
  }

  function compterVerbatims(modele) {
    return (modele.verbatims || []).reduce(function (a, v) { return a + v.textes.length; }, 0);
  }

  return {
    VERSION: VERSION,
    rendre: rendre,
    // Exposés pour les essais, et parce qu'ils servent seuls.
    duree: duree,
    barre: barre
  };
}));

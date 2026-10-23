/*
 * externe.js — un formulaire servi hors de Grist, qui écrit par la clé d'un
 * formulaire natif.
 *
 * Voir docs/ENVOI-EXTERNE.md pour ce qui a été mesuré. En deux mots : la clé
 * d'un formulaire natif ne sait qu'AJOUTER une ligne dans une table, depuis
 * n'importe quelle page ; elle écrit toute colonne qui n'est pas une formule ;
 * et le serveur ne contrôle rien. Ce module en tire trois choses :
 *
 *   1. `planExterne`  — le schéma : une table de RÉCEPTION qui ne contient que ce
 *      que la personne peut remplir, des colonnes à formule qui jugent chaque
 *      envoi (`Motifs`, `Conforme`), et une table de TRAITEMENT privée où
 *      vivent statut, réponse et notes internes.
 *   2. `buildExternalDocument` — la page autonome qui monte le moteur et envoie
 *      par la clé.
 *   3. `lireAdresseFormulaire` — la clé, lue dans le lien du formulaire publié.
 *
 * > **Un envoi invalide est enregistré, pas refusé.** C'est la seule chose que
 * > ce chemin sait faire : Grist accepte la ligne, puis la formule `Conforme`
 * > l'écarte. Rien ici ne doit donc être pris pour une protection ; c'est un tri.
 *
 * > **Une formule doit tomber juste ou se taire.** Une condition que le
 * > générateur ne sait pas traduire en Python n'est pas devinée : la règle de la
 * > question concernée n'est pas écrite, et le plan le dit dans `avertissements`.
 */
(function (root, factory) {
  'use strict';
  var asNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  if (asNode && typeof module === 'object' && module.exports) {
    module.exports = factory(require('./ensure-schema.js'), require('./formats.js'), require('./limites.js'));
  } else if (typeof define === 'function' && define.amd) {
    define(['./ensure-schema', './formats', './limites'], factory);
  } else {
    root.FormExterne = factory(root.EnsureSchema, root.FormFormats, root.FormLimites);
  }
}(typeof self !== 'undefined' ? self : this, function (Ensure, Formats, Limites) {
  'use strict';

  var VERSION = '1.0.0';

  // Les colonnes que ce module ajoute : un formulaire ne peut pas en porter le nom.
  var RESERVEES = ['Recu', 'Premier', 'Motifs', 'Conforme', 'StatutAffiche', 'ReponseAffichee'];
  var STATUTS = ['recu', 'en_cours', 'traite', 'rejete'];

  // ── Python ──

  function py(valeur) {
    if (valeur === true) return 'True';
    if (valeur === false) return 'False';
    if (valeur === null || valeur === undefined) return 'None';
    if (typeof valeur === 'number') return String(valeur);
    return JSON.stringify(String(valeur));
  }

  function libelleDe(field) {
    return String((field && (field.label || field.colId)) || '').replace(/\s+/g, ' ').trim();
  }

  function champsDe(formDef) {
    var out = [];
    ((formDef && formDef.sections) || []).forEach(function (s) {
      (s.fields || []).forEach(function (f) { out.push({ section: s, field: f }); });
    });
    return out;
  }

  function typeBase(field) {
    var t = Ensure.fieldToGristType(field);
    return t.indexOf('Ref:') === 0 ? 'Ref' : t.split(':')[0];
  }

  function tableCible(field) {
    var t = Ensure.fieldToGristType(field);
    return t.indexOf('Ref:') === 0 ? t.slice(4) : null;
  }

  function choixDe(formDef, field) {
    var o = field.options || {};
    var cle = o.choicesKey || field.colId;
    if (formDef.choices && Array.isArray(formDef.choices[cle])) return formDef.choices[cle];
    return Array.isArray(o.choices) ? o.choices : null;
  }

  /**
   * Une condition simple (une question, `==` ou `!=`) en Python, ou null.
   * Tout le reste — composés, contexte, audience — n'est pas traduit.
   */
  function conditionPython(cond, formDef) {
    if (!cond) return '';
    if (typeof cond !== 'object' || cond.rules || cond.op) return null;
    var source = cond.source || 'field';
    if (source !== 'field') return null;
    var nom = cond.field || cond.path;
    if (!nom || /^(context|audience)\./.test(nom)) return null;
    var op = cond.operator || '==';
    if (op !== '==' && op !== '!=') return null;
    var cible = champsDe(formDef).filter(function (c) { return c.field.colId === nom; })[0];
    if (!cible) return null;
    var liste = typeBase(cible.field) === 'ChoiceList';
    var v = py(cond.value);
    if (liste) return (op === '==' ? '' : 'not ') + '(' + v + ' in ($' + nom + ' or []))';
    return '$' + nom + ' ' + op + ' ' + v;
  }

  /** Les règles d'une question, en lignes de Python (sans l'indentation de la condition). */
  function reglesDeQuestion(formDef, field, out) {
    var col = '$' + field.colId;
    var lib = libelleDe(field);
    var base = typeBase(field);
    var o = field.options || {};
    var cols = o.colonnes || {};
    var vide;

    if (base === 'Text') vide = 'not (' + col + " or '').strip()";
    // Une référence vide est fausse pour Grist ; une référence inventée est « vraie »
    // sans identifiant (mesuré) : « absente » et « inconnue » ne se confondent pas.
    else if (base === 'Ref') vide = 'not ' + col;
    else if (base === 'Int' || base === 'Numeric') vide = col + ' is None';
    else if (base === 'Bool') vide = null;
    else vide = 'not ' + col;

    if (field.required && vide) {
      out.push('if ' + vide + ':');
      out.push('  m.append(' + py(lib + ' : réponse absente') + ')');
      if (field.kind === 'referentiel' && cols.annexes && cols.annexes.insee) {
        // Une adresse tapée sans être choisie dans la liste n'apporte aucun code.
        out.push('elif not $' + cols.annexes.insee + ':');
        out.push('  m.append(' + py(lib + ' : adresse non choisie dans la liste') + ')');
      }
    }

    if (base === 'Choice' && field.kind !== 'choix_autre' && !o.autreLibre) {
      var liste = choixDe(formDef, field);
      if (liste && liste.length) {
        out.push('if ' + col + ' and ' + col + ' not in (' + liste.map(py).join(', ') + ',):');
        out.push('  m.append(' + py(lib + ' : valeur hors de la liste') + ')');
      }
    }
    if (base === 'ChoiceList' && field.kind !== 'choix_autre' && !o.autreLibre && field.widget !== 'etiquettes') {
      var liste2 = choixDe(formDef, field);
      if (liste2 && liste2.length) {
        out.push('if any(c not in (' + liste2.map(py).join(', ') + ',) for c in (' + col + ' or [])):');
        out.push('  m.append(' + py(lib + ' : valeur hors de la liste') + ')');
      }
    }
    if (base === 'Ref') {
      var cible = tableCible(field);
      if (cible) {
        // Une référence inventée (un identifiant qui n'existe pas) est « vraie »
        // pour Grist mais n'a pas d'identifiant : seul `.id` la démasque.
        out.push('if ' + col + ' and not ' + col + '.id:');
        out.push('  m.append(' + py(lib + ' : élément inconnu') + ')');
      }
    }
    if ((base === 'Int' || base === 'Numeric') && (typeof o.min === 'number' || typeof o.max === 'number')) {
      var bornes = [];
      if (typeof o.min === 'number') bornes.push(py(o.min) + ' <= ' + col);
      if (typeof o.max === 'number') bornes.push(col + ' <= ' + py(o.max));
      // Une colonne numérique absente d'un envoi vaut 0 : sous un minimum
      // positif, 0 veut dire « pas répondu », pas « hors bornes ».
      var exclut = typeof o.min === 'number' && o.min > 0 ? col + ' not in (None, 0) and ' : col + ' is not None and ';
      out.push('if ' + exclut + 'not (' + bornes.join(' and ') + '):');
      out.push('  m.append(' + py(lib + ' : hors des bornes') + ')');
    }
    if (field.kind === 'geometrie' || field.widget === 'geo') {
      var typeGeo = (o.geometrie || 'Point');
      // Ce que la page envoie est du WKT ; un texte libre ne situe rien.
      var motif = /Point/.test(typeGeo) ? 'POINT' : (/Line/.test(typeGeo) ? 'LINESTRING' : 'POLYGON');
      out.push('if ' + col + " and not re.match(r'^(SRID=[0-9]+;)?(MULTI)?" + motif + "\\s*Z?\\s*\\(', " + col + '.strip().upper()):');
      out.push('  m.append(' + py(lib + ' : lieu illisible') + ')');
    }
    var apres = o.apres;
    if (typeof apres === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(apres)) {
      // Une des deux valeurs vide ne contredit rien ; les dates, heures (« HH:MM ») et nombres se comparent.
      out.push('if ' + col + ' and $' + apres + ' and ' + col + ' < $' + apres + ':');
      out.push('  m.append(' + py(lib + ' : avant « ' + apres + ' »') + ')');
    }
    var fmt = Formats && Formats.formatDeChamp(field);
    if (fmt) {
      out.push('if ' + col + ' and not fmt_' + fmt + '(' + col + '):');
      out.push('  m.append(' + py(lib + ' : ' + Formats.message(fmt).replace(/\.$/, '').replace(/^Ce n’est pas /, 'ce n’est pas ')) + ')');
    }
  }

  function indenter(lignes, niveau) {
    var pad = new Array(niveau + 1).join('  ');
    return lignes.map(function (l) { return pad + l; });
  }

  /** La formule de `Motifs`, et ce qu'elle n'a pas pu traduire. */
  function formuleMotifs(formDef, tableId) {
    var avertissements = [];
    var formats = [];
    var corps = ['m = []', "if not ($Recu or '').strip():", "  m.append('reçu absent')",
      'if $Recu and not $Premier:', "  m.append('reçu déjà utilisé')"];

    champsDe(formDef).forEach(function (c) {
      var f = c.field;
      var sectionCond = conditionPython(c.section.condition, formDef);
      var champCond = conditionPython(f.condition, formDef);
      if (sectionCond === null || champCond === null) {
        avertissements.push('« ' + libelleDe(f) + ' » : sa condition d’affichage ne se traduit pas en Python ; ses règles ne sont pas écrites dans la table.');
        return;
      }
      var regles = [];
      reglesDeQuestion(formDef, f, regles);
      if (!regles.length) return;
      var fmt = Formats && Formats.formatDeChamp(f);
      if (fmt) formats.push(fmt);
      var conds = [];
      if (sectionCond) conds.push('(' + sectionCond + ')');
      if (champCond) conds.push('(' + champCond + ')');
      if (conds.length) {
        corps.push('if ' + conds.join(' and ') + ':');
        Array.prototype.push.apply(corps, indenter(regles, 1));
      } else {
        Array.prototype.push.apply(corps, regles);
      }
    });
    corps.push("return ', '.join(m)");
    // Un contrôle de motif a besoin de `re` ; les formats l'importent dans leur propre fonction.
    if (corps.join('\n').indexOf('re.match(') !== -1) corps.unshift('import re');

    var defs = Formats ? Formats.definitionsPython(formats) : '';
    return { formule: (defs ? defs + '\n' : '') + corps.join('\n'), avertissements: avertissements };
  }

  function colonnesAvecFormules(formDef, base, motifs) {
    var t = formDef.tableId;
    var trait = t + '_Traitements';
    var cols = base.slice();
    cols.push({ id: 'Recu', type: 'Text', label: 'Reçu' });
    cols.push({ id: 'Premier', type: 'Bool', isFormula: true, label: 'Premier envoi de ce reçu',
      formula: "bool($Recu) and $id == min(r.id for r in " + t + ".lookupRecords(Recu=$Recu))" });
    cols.push({ id: 'Motifs', type: 'Text', isFormula: true, label: 'Motifs de non-conformité', formula: motifs });
    cols.push({ id: 'Conforme', type: 'Bool', isFormula: true, label: 'Conforme', formula: 'not $Motifs' });
    // Une page hors de Grist ne peut rien refuser : si le formulaire a des places, la table tranche par ordre d'arrivée.
    var lim = formDef.limites;
    var nomPlace = lim && typeof lim.placeCol === 'string' ? lim.placeCol : '';
    var retenu = nomPlace && Limites && /^[A-Za-z_][A-Za-z0-9_]*$/.test(nomPlace) && RESERVEES.indexOf(nomPlace) === -1 ? Limites.normaliser(lim).limites : null;
    var formulePlace = retenu ? Limites.formulePlace(retenu, t) : null;
    if (formulePlace) cols.push({ id: nomPlace, type: 'Text', isFormula: true, label: 'Place', formula: formulePlace });
    cols.push({ id: 'StatutAffiche', type: 'Text', isFormula: true, label: 'Statut',
      formula: 't = ' + trait + ".lookupOne(Reception=$id)\nreturn t.Statut if t and t.Statut else 'recu'" });
    cols.push({ id: 'ReponseAffichee', type: 'Text', isFormula: true, label: 'Réponse',
      formula: 't = ' + trait + ".lookupOne(Reception=$id)\nreturn t.Reponse if t else ''" });
    return cols;
  }

  function colonnesTraitement(formDef) {
    return [
      { id: 'Reception', type: 'Ref:' + formDef.tableId, label: 'Envoi reçu' },
      { id: 'Statut', type: 'Choice', label: 'Statut', widgetOptions: JSON.stringify({ choices: STATUTS }) },
      { id: 'Reponse', type: 'Text', label: 'Réponse à la personne' },
      { id: 'Interne', type: 'Text', label: 'Notes internes' }
    ];
  }

  /**
   * Le plan de schéma d'un formulaire servi hors de Grist.
   *
   * @param {object} formDef
   * @param {object} [existant]  { tables: { <tableId>: [{ id, type, formula? }] } } ; une table absente sera créée
   * @returns {{ ok, errors, avertissements, incompatibles, actions, tableTraitement }}
   */
  function planExterne(formDef, existant) {
    existant = existant || {};
    var errors = [];
    var avertissements = [];
    var incompatibles = [];

    var bind = Ensure.bindingIsComplete(formDef);
    if (!bind.ok) return { ok: false, errors: bind.errors, avertissements: [], incompatibles: [], actions: [] };

    var t = formDef.tableId;
    var trait = t + '_Traitements';
    var base = Ensure.columnsFromFormDef(formDef);

    base.forEach(function (c) {
      if (RESERVEES.indexOf(c.id) !== -1) {
        errors.push('La colonne « ' + c.id + ' » est réservée à l’envoi externe : renommez la question.');
      }
    });
    champsDe(formDef).forEach(function (c) {
      var f = c.field;
      if (f.type === 'Attachments' || f.widget === 'file' || f.widget === 'dessin' || f.kind === 'dessin') {
        incompatibles.push(f.colId);
        avertissements.push('« ' + libelleDe(f) + ' » : une pièce jointe ne peut pas être envoyée depuis une page hors de Grist ; cette question ne fonctionnera pas.');
      }
    });
    if (errors.length) return { ok: false, errors: errors, avertissements: avertissements, incompatibles: incompatibles, actions: [] };

    var m = formuleMotifs(formDef, t);
    Array.prototype.push.apply(avertissements, m.avertissements);
    var colsReception = colonnesAvecFormules(formDef, base, m.formule);
    var colsTrait = colonnesTraitement(formDef);

    var actions = [];
    var tables = existant.tables || {};

    function ajouterOuMettreAJour(tableId, colonnes, existantes) {
      var parId = {};
      (existantes || []).forEach(function (c) { parId[c.id] = c; });
      colonnes.forEach(function (c) {
        var ex = parId[c.id];
        var def = { type: c.type };
        if (c.label) def.label = c.label;
        if (c.widgetOptions) def.widgetOptions = c.widgetOptions;
        if (c.isFormula) { def.isFormula = true; def.formula = c.formula; }
        if (!ex) actions.push(['AddColumn', tableId, c.id, def]);
        else if (c.isFormula) actions.push(['ModifyColumn', tableId, c.id, { formula: c.formula }]);
        else if (String(ex.type).split(':')[0] !== String(c.type).split(':')[0]) {
          errors.push('Colonne « ' + tableId + '.' + c.id + ' » : type incompatible (existant : ' + ex.type + ', attendu : ' + c.type + ').');
        }
      });
    }

    function creerTable(tableId, colonnes) {
      actions.push(['AddTable', tableId, colonnes.map(function (c) {
        var d = { id: c.id, type: c.type };
        if (c.label) d.label = c.label;
        if (c.widgetOptions) d.widgetOptions = c.widgetOptions;
        if (c.isFormula) { d.isFormula = true; d.formula = c.formula; }
        return d;
      })]);
    }

    // La réception d'abord, avec ses colonnes de données seulement ; les formules
    // qui lisent la table de traitement viennent après elle.
    var sansTraitement = colsReception.filter(function (c) { return c.id !== 'StatutAffiche' && c.id !== 'ReponseAffichee'; });
    var duTraitement = colsReception.filter(function (c) { return c.id === 'StatutAffiche' || c.id === 'ReponseAffichee'; });

    if (!tables[t]) creerTable(t, sansTraitement); else ajouterOuMettreAJour(t, sansTraitement, tables[t]);
    if (!tables[trait]) creerTable(trait, colsTrait); else ajouterOuMettreAJour(trait, colsTrait, tables[trait]);
    ajouterOuMettreAJour(t, duTraitement, tables[t] || []);

    return { ok: errors.length === 0, errors: errors, avertissements: avertissements, incompatibles: incompatibles, actions: actions, tableTraitement: trait };
  }

  /** Une fois la table créée : la page de formulaire natif dont on publiera la clé. */
  function actionsFormulaireNatif(tableRef) {
    return [['CreateViewSection', tableRef, 0, 'form', null, null]];
  }

  // ── l'adresse du formulaire publié ──

  /**
   * `https://hote/o/org/forms/<clé>/<section>` ou `https://hote/forms/<clé>/<section>`.
   * La clé n'est pas un secret : elle est dans la page qui l'utilise.
   */
  function lireAdresseFormulaire(adresse) {
    var m = String(adresse || '').trim().match(/^(https?:\/\/[^/]+)((?:\/o\/[^/]+)?)\/forms\/([A-Za-z0-9]+)\/(\d+)/);
    if (!m) return null;
    var racine = m[1] + m[2];
    return { racine: racine, cle: m[3], section: Number(m[4]), base: racine + '/api/s/' + m[3] };
  }

  // ── la page ──

  function echapperHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Du JSON qu'on peut poser dans un <script> sans qu'il le referme. */
  function jsonPourScript(valeur) {
    return JSON.stringify(valeur)
      .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  }

  /**
   * La page autonome : le moteur, le formulaire figé, et l'envoi par la clé.
   *
   * @param {object} formDef
   * @param {object} bundles  { typesJs, sessionContextJs, carteJs, referentielJs, formatsJs, enrichirJs, saisiesJs, prefillJs, conditionsJs, limitesJs, engineJs, cssText }
   * @param {object} opts     { adresse: <lien du formulaire publié> }
   */
  function buildExternalDocument(formDef, bundles, opts) {
    bundles = bundles || {};
    opts = opts || {};
    var guichet = lireAdresseFormulaire(opts.adresse);
    if (!guichet) throw new Error('Adresse de formulaire publié invalide : attendu https://hôte/forms/<clé>/<section>.');
    var titre = (formDef && (formDef.title || formDef.id)) || 'Formulaire';

    var script = [
      bundles.typesJs || '', bundles.sessionContextJs || '', bundles.carteJs || '',
      bundles.referentielJs || '', bundles.formatsJs || '', bundles.enrichirJs || '', bundles.saisiesJs || '', bundles.prefillJs || '', bundles.conditionsJs || '', bundles.limitesJs || '', bundles.engineJs || '',
      '(function () {',
      '  var DEF = ' + jsonPourScript(formDef || {}) + ';',
      '  var GUICHET = ' + jsonPourScript(guichet.base) + ';',
      '  function nouveauRecu() {',
      '    var a = new Uint8Array(6); crypto.getRandomValues(a);',
      "    return 'R-' + Array.prototype.map.call(a, function (b) { return b.toString(16).padStart(2, '0'); }).join('').toUpperCase();",
      '  }',
      '  function montrerRecu(recu) {',
      "    var z = document.getElementById('recu');",
      '    if (!z) return;',
      "    z.hidden = false;",
      "    z.textContent = 'Conservez votre reçu : ' + recu;",
      '  }',
      '  function envoyer(data) {',
      '    var recu = nouveauRecu();',
      '    var champs = Object.assign({}, data, { Recu: recu });',
      "    return fetch(GUICHET + '/tables/' + encodeURIComponent(DEF.tableId) + '/records', {",
      "      method: 'POST',",
      "      headers: { 'Content-Type': 'application/json' },",
      '      body: JSON.stringify({ records: [{ fields: champs }] })',
      '    }).then(function (r) {',
      "      if (!r.ok) throw new Error('Envoi refusé (' + r.status + '). Réessayez dans un moment.');",
      '      montrerRecu(recu);',
      '    });',
      '  }',
      '  function demarrer() {',
      "    var zone = document.getElementById('app');",
      "    if (!window.FormEngine) { zone.textContent = 'Le formulaire n’a pas pu se charger.'; return; }",
      '    var pre = window.FormPrefill ? window.FormPrefill.lire(DEF, location.search)',
      '      : { values: {}, verrouilles: [], libelles: {} };',
      '    window.FormEngine.mount(zone, DEF, {',
      '      skipProbe: true, submit: envoyer,',
      '      values: pre.values, verrouilles: pre.verrouilles, libelles: pre.libelles',
      '    });',
      '  }',
      "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();",
      '})();'
    ].join('\n');

    return [
      '<!DOCTYPE html>',
      '<html lang="fr">',
      '<head>',
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>' + echapperHtml(titre) + '</title>',
      '<style>',
      bundles.cssText || '',
      '</style>',
      '</head>',
      '<body>',
      '<div class="fr-container" id="app">Chargement…</div>',
      '<p class="fr-hint-text fr-container" id="recu" role="status" hidden></p>',
      '<script>',
      script,
      '</script>',
      '</body>',
      '</html>'
    ].join('\n');
  }

  return {
    VERSION: VERSION,
    RESERVEES: RESERVEES,
    planExterne: planExterne,
    actionsFormulaireNatif: actionsFormulaireNatif,
    lireAdresseFormulaire: lireAdresseFormulaire,
    buildExternalDocument: buildExternalDocument,
    formuleMotifs: formuleMotifs,
    conditionPython: conditionPython
  };
}));

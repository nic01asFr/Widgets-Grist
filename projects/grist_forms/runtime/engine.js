(function (root, factory) {
  'use strict';
  // Ne pas prendre la branche CommonJS dans l'iframe custom-widget-builder
  // (certains hôtes exposent `module` sans `require` résolvable).
  var asNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  if (asNode && typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../shared/types.js'),
      require('../shared/attachments.js'),
      require('../shared/session-context.js'),
      require('../shared/referentiel.js'),
      require('../shared/formats.js'),
      require('../shared/enrichir.js'),
      require('../shared/saisies.js')
    );
  } else if (typeof define === 'function' && define.amd) {
    define(['../shared/types', '../shared/attachments', '../shared/session-context', '../shared/referentiel', '../shared/formats', '../shared/enrichir', '../shared/saisies'], factory);
  } else {
    root.FormEngine = factory(root.FormTypes, root.FormAttachments, root.SessionContext, root.FormReferentiel, root.FormFormats, root.FormEnrichir, root.FormSaisies);
  }
}(typeof self !== 'undefined' ? self : this, function (Types, Attachments, SessionContext, Referentiel, Formats, Enrichir, Saisies) {
  'use strict';

  Attachments = Attachments || {};
  SessionContext = SessionContext || {};

  /**
   * Le module des référentiels, s'il est là.
   *
   * Un hôte peut ne pas l'embarquer (un formulaire publié avant son arrivée,
   * une copie du moteur qui n'en a jamais eu) : le champ reste alors un champ
   * texte, qui enregistre ce qu'on y tape. Il est cherché à l'appel et pas
   * seulement au chargement, parce que l'ordre des scripts n'est pas toujours
   * celui qu'on croit.
   */
  function referentielApi() {
    if (Referentiel && Referentiel.sourceConnue) return Referentiel;
    var global = typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : null);
    return global && global.FormReferentiel && global.FormReferentiel.sourceConnue
      ? global.FormReferentiel : null;
  }

  /**
   * Le catalogue de formats, s'il est là. Sans lui, un format déclaré ne
   * contrôle rien : le champ reste un champ ordinaire.
   */
  function formatsApi() {
    if (Formats && Formats.valide) return Formats;
    var global = typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : null);
    return global && global.FormFormats && global.FormFormats.valide ? global.FormFormats : null;
  }

  /** Départs, bornes et ordre entre deux questions, s'ils sont là. Sans eux, ces réglages ne font rien. */
  function saisiesApi() {
    if (Saisies && Saisies.valeurDepart) return Saisies;
    var global = typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : null);
    return global && global.FormSaisies && global.FormSaisies.valeurDepart ? global.FormSaisies : null;
  }

  /** Le module d'enrichissement par un point, s'il est là. Sans lui, le point reste un point. */
  function enrichirApi() {
    if (Enrichir && Enrichir.enrichir) return Enrichir;
    var global = typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : null);
    return global && global.FormEnrichir && global.FormEnrichir.enrichir ? global.FormEnrichir : null;
  }

  /**
   * Ce qu'un point apporte aux colonnes d'une question de lieu.
   *
   * Rend `null` quand la question n'enrichit rien ou que le WKT n'est pas un
   * point ; sinon une promesse de `{ valeurs, phrase }` où `valeurs` couvre
   * CHAQUE colonne désignée (`null` quand le service n'a rien rendu).
   */
  function enrichirChamp(field, wkt, deps) {
    var api = enrichirApi();
    if (!api) return null;
    var colonnes = api.colonnesDe(field);
    if (!Object.keys(colonnes).length) return null;
    var point = api.pointDe(wkt);
    if (!point) return null;
    return api.enrichir(point, colonnes, deps || {}).then(function (r) {
      return { valeurs: r.valeurs, phrase: api.phrase(r, colonnes) };
    });
  }

  function normalizeEmail(v) {
    if (SessionContext.normalizeEmail) return SessionContext.normalizeEmail(v);
    if (v == null || v === '') return '';
    return String(v).trim().toLowerCase();
  }

  function resolveRuleSource(rule) {
    var source = rule.source || 'field';
    var path = rule.path != null && rule.path !== '' ? rule.path : (rule.field || '');
    if ((!rule.source || rule.source === 'field') && path.indexOf('context.') === 0) {
      return { source: 'context', path: path.slice(8) };
    }
    if ((!rule.source || rule.source === 'field') && path.indexOf('audience.') === 0) {
      return { source: 'audience', path: path.slice(9) };
    }
    return { source: source, path: path };
  }

  function compareValues(actual, operator, expected) {
    switch (operator) {
      case '==': return actual == expected;
      case '!=': return actual != expected;
      case '>': return Number(actual) > Number(expected);
      case '>=': return Number(actual) >= Number(expected);
      case '<': return Number(actual) < Number(expected);
      case '<=': return Number(actual) <= Number(expected);
      case 'contains':
        if (Array.isArray(actual)) return actual.indexOf(expected) !== -1;
        if (actual == null) return false;
        return String(actual).indexOf(String(expected)) !== -1;
      case 'in': {
        var list = Array.isArray(expected) ? expected : (expected != null && expected !== '' ? [expected] : []);
        if (Array.isArray(actual)) {
          return actual.some(function (a) {
            return list.some(function (e) { return String(a) === String(e); });
          });
        }
        return list.some(function (e) { return String(actual) === String(e); });
      }
      case 'notIn': {
        var listN = Array.isArray(expected) ? expected : (expected != null && expected !== '' ? [expected] : []);
        if (Array.isArray(actual)) {
          return !actual.some(function (a) {
            return listN.some(function (e) { return String(a) === String(e); });
          });
        }
        return !listN.some(function (e) { return String(actual) === String(e); });
      }
      case 'truthy': return !!actual;
      default: return true;
    }
  }

  function resolveAudienceActual(path, rule, context) {
    context = context || {};
    if (path === 'email' || path === 'userEmail') {
      return normalizeEmail(context.userEmail);
    }
    if (path === 'group' || path === 'groups') {
      return context.groups || [];
    }
    if (path === 'member') {
      return !!normalizeEmail(context.userEmail);
    }
    return context[path];
  }

  /** Règle atomique { field|path, operator, value, source?, bind? }. */
  function evaluateRule(rule, values, context) {
    if (!rule) return true;
    var resolved = resolveRuleSource(rule);
    var source = resolved.source;
    var path = resolved.path;
    if (source === 'field' && !path) return true;

    var actual;
    var expected = rule.value;
    if (source === 'context') {
      actual = context ? context[path] : undefined;
    } else if (source === 'audience') {
      actual = resolveAudienceActual(path, rule, context);
      if ((path === 'group' || path === 'groups') && rule.bind && Array.isArray(rule.bind.groups) && expected == null) {
        expected = rule.bind.groups;
      }
      if ((path === 'email' || path === 'userEmail') && expected != null) {
        if (Array.isArray(expected)) expected = expected.map(normalizeEmail);
        else expected = normalizeEmail(expected);
      }
    } else {
      actual = values[path];
    }
    return compareValues(actual, rule.operator || '==', expected);
  }

  /**
   * Condition simple ou composé { op, rules }.
   * @param {object|null} condition
   * @param {object} values réponses
   * @param {object} [context] SessionContext
   */
  function evaluateCondition(condition, values, context) {
    if (!condition) return true;
    if (condition.op && Array.isArray(condition.rules)) {
      var rules = condition.rules;
      if (!rules.length) return true;
      if (condition.op === 'or') {
        for (var i = 0; i < rules.length; i++) {
          if (evaluateCondition(rules[i], values, context)) return true;
        }
        return false;
      }
      for (var j = 0; j < rules.length; j++) {
        if (!evaluateCondition(rules[j], values, context)) return false;
      }
      return true;
    }
    return evaluateRule(condition, values, context);
  }

  /** gate Bool (legacy) ou condition complète (parité v3 / chemins). */
  function isSectionVisible(section, values, context) {
    if (!section) return true;
    if (section.condition) return evaluateCondition(section.condition, values, context);
    if (!section.gate) return true;
    return !!values[section.gate];
  }

  function isFieldVisible(field, values, context) {
    if (!field || !field.condition) return true;
    return evaluateCondition(field.condition, values, context);
  }

  /** Les types où omettre la colonne revient à y écrire 0 (mesuré en Grist réel). */
  var TYPES_A_VIDER = { Int: true, Numeric: true, Date: true, DateTime: true, Ref: true };

  /**
   * Ce qui part dans Grist.
   *
   * > **Omettre une colonne numérique, c'est y écrire 0.** Mesuré sur les deux
   * > instances : une colonne `Int` absente de l'action vaut 0, et `AVERAGE`
   * > ignore le vide mais compte les zéros. Une question jamais posée tirait
   * > donc les moyennes vers le bas, sans que rien ne le signale — on l'a vu
   * > dans les réponses de l'enquête du 4ᵉ.
   *
   * À la **création**, une question masquée ou sans réponse s'écrit donc
   * `null` explicitement. À la **correction** d'une ligne, non : le formulaire
   * ne montre pas tout, et vider ce qu'il ne montre pas effacerait des données
   * qu'il n'a jamais eu à connaître.
   *
   * @param {object} [opts] `{ creation: true }` pour écrire les vides
   */
  /**
   * Le classement s'ecrit rang par rang.
   *
   * `options.colonnes.rangs` nomme les colonnes du 1er, du 2e, du 3e choix.
   * Les propositions au-dela du dernier rang ne sont pas des reponses : elles
   * n'ont pas ete classees, et les colonnes correspondantes restent vides —
   * sinon une personne qui a classe deux lieux en verrait apparaitre un
   * troisieme qu'elle n'a pas choisi.
   */
  function ecrireRangs(out, field, brut, opts) {
    var rangs = colonnesDe(field).rangs || [];
    var choisis = Array.isArray(brut) ? brut : (brut == null ? [] : [brut]);
    for (var i = 0; i < rangs.length; i++) {
      var v = choisis[i];
      out[rangs[i]] = (v == null || v === '' || v === VALEUR_NON_CONCERNE) ? null : String(v);
    }
    return out;
  }

  /**
   * Les colonnes annexes d'un référentiel : écrites pour l'adresse CHOISIE.
   *
   * Si le texte du champ n'est plus celui de l'adresse choisie, ou s'il n'y en
   * a jamais eu, les annexes valent `null` : elles videraient sinon, dans la
   * ligne, ce qu'une adresse précédente y avait posé, ou lui feraient dire le
   * contraire de ce que le texte annonce.
   */
  function ecrireAnnexes(out, field, values) {
    var annexes = colonnesDe(field).annexes || {};
    var choisi = values[field.colId + SUFFIXE_CHOISI];
    var valide = choisi != null && choisi !== '' &&
      espacesNormalises(values[field.colId]) === choisi;
    Object.keys(annexes).forEach(function (cle) {
      var col = annexes[cle];
      if (!col) return;
      var v = valide ? values[col] : null;
      out[col] = (v === undefined || v === '') ? null : v;
    });
  }

  function collectSubmitData(formDef, values, context, opts) {
    opts = opts || {};
    var out = {};
    var sections = (formDef && formDef.sections) || [];
    for (var i = 0; i < sections.length; i++) {
      var section = sections[i];
      var sectionVisible = isSectionVisible(section, values, context);
      var fields = section.fields || [];
      for (var j = 0; j < fields.length; j++) {
        var field = fields[j];
        var visible = sectionVisible && isFieldVisible(field, values, context);
        if (!visible) {
          // Une question cachee ne laisse pas la valeur d'une autre personne
          // dans la ligne : ses colonnes sont vidées, y compris celles qu'elle
          // ne nomme pas par son `colId`.
          var caches = colonnesDe(field);
          if (opts.creation && TYPES_A_VIDER[Types.normalizeGristType(field.type)] && !caches.rangs) {
            out[(caches.valeur) || field.colId] = null;
          }
          (caches.rangs || []).forEach(function (c) { out[c] = null; });
          if (caches.autre) out[caches.autre] = null;
          // Seulement pour un référentiel : des annexes que rien ne remplit ne
          // sont pas à vider (un champ qui a changé de type en garderait la trace).
          if (field.kind === 'referentiel') {
            Object.keys(caches.annexes || {}).forEach(function (cle) {
              if (caches.annexes[cle]) out[caches.annexes[cle]] = null;
            });
          }
          var apiCache = enrichirApi();
          if (apiCache) {
            var colsCache = apiCache.colonnesDe(field);
            Object.keys(colsCache).forEach(function (sens) { out[colsCache[sens]] = null; });
          }
          continue;
        }
        var brut = values[field.colId];
        var cols = colonnesDe(field);
        if (field.kind === 'classement') {
          // Les rangs retenus vont chacun dans leur colonne ; la question
          // elle-même n'en a pas, et n'écrit nulle part.
          ecrireRangs(out, field, brut, opts);
        } else if (cols.valeur && cols.valeur !== field.colId) {
          out[cols.valeur] = brut === VALEUR_NON_CONCERNE ? null : Types.coerceForWrite(field, brut);
        } else {
          // « Non concerné » est une réponse ; la colonne, elle, reste vide.
          out[field.colId] = brut === VALEUR_NON_CONCERNE ? null : Types.coerceForWrite(field, brut);
          // La forme qu'on enregistre : un IBAN sans espaces, un téléphone à 10 chiffres.
          var fmt = formatsApi();
          var idFormat = fmt && fmt.formatDeChamp(field);
          if (idFormat && typeof out[field.colId] === 'string') out[field.colId] = fmt.normalise(idFormat, out[field.colId]);
        }
        // Le texte libre de « Autre » a sa propre colonne : écrit dans la liste,
        // Grist le garderait mais l'encadrerait en rouge (mesuré).
        if (cols.autre) {
          var libre = values[cols.autre];
          out[cols.autre] = (valeurAutreChoisie(field, values) && libre) ? String(libre) : null;
        }
        // Une adresse choisie dans la liste apporte ses annexes ; une adresse
        // tapee, ou corrigee apres le choix, n'en apporte aucune.
        if (field.kind === 'referentiel') ecrireAnnexes(out, field, values);
        // Un lieu apporte ce que les services en ont su ; une colonne que rien
        // n'a remplie part vide (jamais 0 : un nombre absent vaut 0 dans Grist).
        ecrireEnrichies(out, field, values);
      }
    }

    // Deux colonnes que personne ne remplit a la main. L'horodatage dit quand
    // la reponse est arrivee ; la duree dit combien de temps elle a coute, et
    // c'est elle qui permet de verifier l'estimation annoncee en accueil au
    // lieu de la reconduire d'une enquete a l'autre. Grist compte les dates en
    // secondes, pas en millisecondes.
    var meta = (formDef && formDef.meta) || {};
    if (opts.creation !== false) {
      if (meta.timestampCol) out[meta.timestampCol] = Math.round(Date.now() / 1000);
      if (meta.durationCol && Number(opts.demarreA) > 0) {
        out[meta.durationCol] = Math.round((Date.now() - Number(opts.demarreA)) / 1000);
      }
    }
    return out;
  }

  function ecrireEnrichies(out, field, values) {
    var api = enrichirApi();
    if (!api) return;
    var colonnes = api.colonnesDe(field);
    Object.keys(colonnes).forEach(function (sens) {
      var col = colonnes[sens];
      var v = values[col];
      out[col] = v === undefined || v === '' ? null : v;
    });
  }

  function sameRefValue(a, b) {
    if (a == null || b == null || a === '' || b === '') return false;
    return String(a) === String(b);
  }

  function filterCascadeOptions(choices, refRecords, parentRefCol, parentValue) {
    if (!choices || !choices.length) return [];
    if (parentValue == null || parentValue === '') return [];
    if (!refRecords || !refRecords.id) return choices.slice();
    var ids = refRecords.id;
    var parentCol = refRecords[parentRefCol];
    if (!parentCol) return choices.slice();
    var parentById = {};
    for (var i = 0; i < ids.length; i++) {
      parentById[String(ids[i])] = parentCol[i];
    }
    return choices.filter(function (choice) {
      return sameRefValue(parentById[String(choice.value)], parentValue);
    });
  }

  /** Filtre dynamique : colonne de la table liée == valeur du champ parent. */
  function filterDynamicOptions(choices, refRecords, filterColumn, parentValue) {
    if (!choices || !choices.length) return [];
    if (parentValue == null || parentValue === '') return [];
    if (!refRecords || !refRecords.id || !filterColumn) return choices.slice();
    var col = refRecords[filterColumn];
    if (!col) return choices.slice();
    var byId = {};
    for (var i = 0; i < refRecords.id.length; i++) {
      byId[String(refRecords.id[i])] = col[i];
    }
    return choices.filter(function (choice) {
      return sameRefValue(byId[String(choice.value)], parentValue);
    });
  }

  function findFieldInFormDef(formDef, colId) {
    if (!formDef || !colId) return null;
    var sections = formDef.sections || [];
    for (var s = 0; s < sections.length; s++) {
      var fields = sections[s].fields || [];
      for (var i = 0; i < fields.length; i++) {
        if (fields[i].colId === colId) return fields[i];
      }
    }
    return null;
  }

  /**
   * Valeur utilisée pour filtrer les options Ref (cas A / cas C).
   * - parentResolve absent ou "value" → values[parentField] (Choice/Texte/Bool)
   * - parentResolve "refRow" → lit parentValueColumn sur la ligne Ref parent
   */
  function resolveParentFilterValue(field, values, formDef, refRecords) {
    var df = field && field.dynamicFilter;
    if (!df || !df.parentField) return null;
    values = values || {};
    var raw = values[df.parentField];
    if (raw == null || raw === '') return null;

    var resolve = df.parentResolve || 'value';
    if (resolve !== 'refRow') return raw;

    var parentCol = df.parentValueColumn;
    if (!parentCol) return null;

    var parentMeta = findFieldInFormDef(formDef, df.parentField);
    var parentTable = resolveRefTable(parentMeta);
    if (!parentTable || !refRecords || !refRecords[parentTable]) return null;

    var records = refRecords[parentTable];
    if (!records.id || !records[parentCol]) return null;
    for (var i = 0; i < records.id.length; i++) {
      if (sameRefValue(records.id[i], raw)) {
        var v = records[parentCol][i];
        return v == null || v === '' ? null : v;
      }
    }
    return null;
  }

  // ── Rendu DOM DSFR (runtime UI) ──────────────────────────────────────────
  // Échappement XSS sans littéraux « < » / entités HTML dans le source
  // (évite la casse si le JS est réinjecté via innerHTML / srcdoc).
  function escapeHtml(value) {
    if (value == null) return '';
    var s = String(value);
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === '&') out += '&' + 'amp;';
      else if (c === '\x3c') out += '&' + 'lt;';
      else if (c === '\x3e') out += '&' + 'gt;';
      else if (c === '"') out += '&' + 'quot;';
      else if (c === "'") out += '&#' + '39;';
      else out += c;
    }
    return out;
  }

  function normalizeOption(o) {
    if (o && typeof o === 'object') {
      return { value: o.value, label: o.label != null ? o.label : o.value };
    }
    return { value: o, label: o };
  }

  function resolveOptions(field, optionsList) {
    if (Array.isArray(optionsList)) return optionsList.map(normalizeOption);
    var raw = field && field.options && field.options.choices;
    if (Array.isArray(raw)) return raw.map(normalizeOption);
    return [];
  }

  function sameValue(a, b) {
    if (a == null || b == null) return false;
    return String(a) === String(b);
  }

  function fieldId(field) { return 'field-' + field.colId; }

  /**
   * « Obligatoire » se lit dans la ligne du libellé.
   *
   * C'était une aide (`fr-hint-text`), donc un bloc sous la question : chaque
   * champ requis prenait une ligne pour un seul mot, et la page s'allongeait
   * d'autant.
   */
  function requiredHint(field) {
    // > **Une asterisque rouge, pas le mot « obligatoire ».** Le mot repete
    // > vingt fois sur une page devient du bruit qu'on cesse de voir ; une
    // > marque, elle, se retrouve d'un coup d'oeil quand l'envoi est refuse et
    // > qu'il faut trouver ce qui manque. Le mot reste pour qui ne voit pas
    // > l'ecran : il est lu, pas affiche.
    if (!field.required) return '';
    return ' <span class="fr-obligatoire" aria-hidden="true">*</span>' +
      '<span class="fr-sr-only"> obligatoire</span>';
  }

  /**
   * L'aide d'un champ, sous son libellé : une consigne que l'auteur du
   * formulaire a écrite (« photos légères de préférence »). Dans le libellé,
   * comme le veut le DSFR, pour être lue avec lui par un lecteur d'écran.
   */
  function descriptionHint(field) {
    var d = field && typeof field.description === 'string' ? field.description.trim() : '';
    return d ? '<span class="fr-hint-text">' + escapeHtml(d).replace(/\n/g, '<br>') + '</span>' : '';
  }

  function renderLabel(field, forId) {
    return '<label class="fr-label" for="' + escapeHtml(forId) + '">' +
      escapeHtml(field.label) + requiredHint(field) + descriptionHint(field) + '</label>';
  }

  function renderLegend(field) {
    return '<legend class="fr-fieldset__legend">' + escapeHtml(field.label) + requiredHint(field) +
      descriptionHint(field) + '</legend>';
  }

  function safeImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    var u = url.trim();
    if (/^https?:\/\//i.test(u) || /^data:image\//i.test(u)) return u;
    return '';
  }

  /**
   * Une adresse qu'on accepte d'integrer dans la page.
   *
   * > **Seulement `https:`.** Une page integree s'execute chez la personne qui
   * > repond ; `javascript:` executerait n'importe quoi dans le formulaire, et
   * > `http:` ferait tomber la page entiere en contenu mixte. Le bac a sable
   * > (`sandbox`) fait le reste : la page ne partage ni l'origine, ni les
   * > cookies, et ne peut pas emmener le repondant ailleurs sans son geste.
   */
  function safeFrameUrl(url) {
    if (!url || typeof url !== 'string') return '';
    var u = url.trim();
    return /^https:\/\//i.test(u) ? u : '';
  }

  function renderBrandImg(url, alt, cssClass) {
    var safe = safeImageUrl(url);
    if (!safe) return '';
    return '<div class="' + (cssClass || 'fr-form__brand') + '">' +
      '<img src="' + escapeHtml(safe) + '" alt="' + escapeHtml(alt || '') + '" />' +
      '</div>';
  }

  /**
   * Le gras, et rien d'autre.
   *
   * > Un texte d'accueil sans gras se lit mal : le nom des quartiers, le mot
   * > « anonyme », la duree sont ce qu'on cherche des yeux. Mais ouvrir le HTML
   * > a qui compose un formulaire, c'est ouvrir le formulaire a qui saurait s'en
   * > servir. On echappe donc tout, puis on rend `**ceci**` seul.
   */
  function enrichirTexte(texte) {
    var sur = escapeHtml(String(texte == null ? '' : texte));
    return sur.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  /** Les paragraphes se separent par une ligne vide, comme partout ailleurs. */
  function paragraphes(texte, cssClass) {
    var blocs = String(texte == null ? '' : texte).split(/\n\s*\n/);
    var out = '';
    for (var i = 0; i < blocs.length; i++) {
      var t = blocs[i].trim();
      if (t) out += '<p' + (cssClass ? ' class="' + cssClass + '"' : '') + '>' + enrichirTexte(t) + '</p>';
    }
    return out;
  }

  /**
   * Le bandeau : qui demande, et sur quoi.
   *
   * > **Il reste a l'ecran du debut a la fin.** Une personne qui arrive par un
   * > lien partage ne sait pas qui l'interroge ; a la septieme etape, elle ne
   * > s'en souvient plus. Le questionnaire ecrit a la main portait cette barre
   * > sur chaque ecran — le moteur n'affichait son en-tete qu'a la premiere
   * > etape, et le melangeait avec la presentation.
   */
  function renderBandeauHtml(formDef) {
    var brand = (formDef && formDef.branding) || {};
    var logoHtml = renderBrandImg(brand.logoUrl, brand.logoAlt, 'fr-bandeau__logo');
    var orga = brand.organisation
      ? '<p class="fr-bandeau__orga">' + escapeHtml(brand.organisation) +
        (brand.organisationDetail ? '<small>' + escapeHtml(brand.organisationDetail) + '</small>' : '') +
        '</p>'
      : '';
    var titre = formDef && formDef.title
      ? '<h1 class="fr-bandeau__titre">' + escapeHtml(formDef.title) + '</h1>' : '';
    if (!logoHtml && !orga && !titre) return '';
    return '<header class="fr-bandeau"><div class="fr-bandeau__inner">' +
      logoHtml + orga + titre + '</div></header>';
  }

  /**
   * La page d'accueil.
   *
   * > **Un questionnaire ne commence pas par sa premiere question.** Il commence
   * > par ce qui permet de decider d'y repondre : qui le publie, pourquoi, pour
   * > combien de temps, et ce qu'il advient des reponses. L'enquete ecrite a la
   * > main consacrait un ecran entier a cela ; le moteur l'avait reduit a un
   * > en-tete pose au-dessus de la premiere etape, ou il se lisait comme un
   * > titre de section parmi d'autres.
   *
   * La duree annoncee n'est pas decorative : c'est la premiere question que se
   * pose quelqu'un a qui l'on demande son avis, et la raison la plus frequente
   * d'abandonner avant la fin.
   */
  function renderAccueilHtml(formDef) {
    var a = (formDef && formDef.accueil) || {};
    var titre = a.titre || (formDef && formDef.title) || '';
    var texte = a.texte || (formDef && formDef.description) || '';

    var encarts = '';
    if (Number(a.dureeMinutes) > 0) {
      encarts += '<div class="fr-encart fr-encart--attention">' +
        '<strong>⏱ Environ ' + escapeHtml(String(a.dureeMinutes)) + ' minutes.</strong>' +
        (a.dureeTexte ? ' ' + enrichirTexte(a.dureeTexte) : '') + '</div>';
    }
    var liste = a.encarts || [];
    for (var i = 0; i < liste.length; i++) {
      var e = liste[i] || {};
      var ton = e.ton === 'attention' ? 'attention' : 'discret';
      encarts += '<div class="fr-encart fr-encart--' + ton + '">' +
        (e.titre ? '<strong>' + escapeHtml(e.titre) + '</strong> ' : '') +
        enrichirTexte(e.texte || '') + '</div>';
    }

    return '<section class="fr-accueil">' +
      (titre ? '<h2 class="fr-accueil__titre" tabindex="-1">' + escapeHtml(titre) + '</h2>' : '') +
      paragraphes(texte) + encarts +
      '<div class="fr-form__actions fr-form__actions--fin">' +
      '<button type="button" class="fr-btn" data-action="commencer">' +
      escapeHtml(a.bouton || 'Commencer') + ' →</button></div></section>';
  }

  /** Y a-t-il une page d'accueil a franchir avant la premiere question ? */
  function aUnAccueil(formDef) {
    var a = formDef && formDef.accueil;
    if (!a) return false;
    return !!(a.titre || a.texte || a.dureeMinutes || (a.encarts && a.encarts.length));
  }

  /**
   * La couverture du questionnaire : logo, titre, intention.
   *
   * Le compositeur montrait ici ses propres champs de saisie, les mêmes que
   * ceux de son panneau de réglages — on réglait donc deux fois la même chose
   * sans jamais voir ce que le public lirait. Le rendu sort du moteur, comme
   * celui des champs, pour qu'il n'en existe qu'un.
   */
  function renderHeaderHtml(formDef) {
    var brand = (formDef && formDef.branding) || {};
    var logoHtml = renderBrandImg(brand.logoUrl, brand.logoAlt, 'fr-form__brand fr-form__brand--logo');
    if (!logoHtml && !(formDef && formDef.title) && !(formDef && formDef.description)) return '';
    return '<header class="fr-form__header">' +
      logoHtml +
      (formDef.title ? '<h1 class="fr-h4">' + escapeHtml(formDef.title) + '</h1>' : '') +
      (formDef.description ? '<p class="fr-text--sm">' + escapeHtml(formDef.description) + '</p>' : '') +
      '</header>';
  }

  /** Ce qui s'affiche une fois la réponse envoyée. */
  function renderSuccessHtml(formDef) {
    var brand = (formDef && formDef.branding) || {};
    var successImg = renderBrandImg(
      brand.successImageUrl,
      brand.successImageAlt,
      'fr-form__brand fr-form__brand--success'
    );
    return '<div class="fr-form__success" role="status">' +
      successImg +
      (formDef && formDef.title ? '<p class="fr-text--sm">' + escapeHtml(formDef.title) + '</p>' : '') +
      '<div class="fr-alert fr-alert--success"><p>' +
      escapeHtml((formDef && formDef.successMessage) || 'Formulaire envoyé avec succès.') +
      '</p></div></div>';
  }

  function placeholderAttr(field) {
    var ph = field && field.options && field.options.placeholder;
    if (ph == null || ph === '') return '';
    return ' placeholder="' + escapeHtml(String(ph)) + '"';
  }

  /** Les blancs superflus ne font pas une autre adresse. */
  function espacesNormalises(texte) {
    return String(texte == null ? '' : texte).replace(/\s+/g, ' ').trim();
  }

  /**
   * La clé où le moteur retient quelle adresse a été CHOISIE dans la liste.
   *
   * > **Les colonnes annexes ne valent que pour l'adresse choisie.** Après
   * > « 8 Boulevard du Port 80000 Amiens », on peut corriger le numéro : le
   * > code postal et les coordonnées qui restent seraient ceux d'une autre
   * > porte. La valeur retenue ici sert à reconnaître ce cas — si le texte du
   * > champ n'est plus celui de l'adresse choisie, les annexes ne sont pas
   * > écrites. Mieux vaut des annexes vides qu'une adresse et des coordonnées
   * > qui se contredisent.
   *
   * Ce n'est pas une colonne : `collectSubmitData` parcourt les champs, pas les
   * valeurs, et cette clé n'est donc jamais écrite.
   */
  var SUFFIXE_CHOISI = '__choisi';

  /**
   * Une saisie qui propose des adresses qui existent, sur un champ texte.
   *
   * Le champ reste un champ texte : sans le module, ou pour une source qu'il ne
   * connaît pas, c'est exactement celui d'avant, et la saisie s'enregistre
   * telle quelle. Rien n'est promis qu'on ne sait pas tenir.
   *
   * Par défaut la recherche part sur validation (Entrée ou bouton) : rien
   * n'est envoyé au service que la personne n'ait demandé. La frappe est une
   * option, qui assume d'envoyer un préfixe de l'adresse à chaque pause.
   */
  function renderReferentiel(field, value) {
    var o = (field && field.options && field.options.referentiel) || {};
    var api = referentielApi();
    var source = String(o.source || '');
    if (!api || !api.sourceConnue(source)) return renderTextLike(field, value, false);

    var id = fieldId(field);
    var frappe = o.declenchement === 'frappe';
    var reqAttr = field.required ? ' required' : '';
    var val = value == null ? '' : value;
    var mention = api.SOURCES[source].mention + (frappe ? '' : ' La recherche ne part que lorsque vous la lancez.');

    return '<div class="fr-input-group fr-referentiel" data-colid="' + escapeHtml(field.colId) + '" ' +
      'data-referentiel-de="' + escapeHtml(field.colId) + '" data-source="' + escapeHtml(source) + '" ' +
      'data-declenchement="' + (frappe ? 'frappe' : 'validation') + '">' +
      renderLabel(field, id) +
      '<div class="fr-referentiel__ligne">' +
      '<input class="fr-input" type="text" id="' + id + '" name="' + escapeHtml(field.colId) + '" ' +
      'value="' + escapeHtml(val) + '" autocomplete="off" data-referentiel-champ' + reqAttr + placeholderAttr(field) + ' />' +
      (frappe ? '' : '<button type="button" class="fr-btn fr-btn--secondary fr-referentiel__bouton">Rechercher</button>') +
      '</div>' +
      '<p class="fr-hint-text fr-referentiel__etat" role="status" aria-live="polite"></p>' +
      '<p class="fr-hint-text fr-referentiel__mention">' + escapeHtml(mention) + '</p>' +
      '</div>';
  }

  /** Le clavier que la question demande ou que son format laisse entendre ; rien sans le module des saisies. */
  function clavierAttrs(field) {
    var api = saisiesApi();
    if (!api || !api.attributsClavier) return '';
    var f = formatsApi();
    return api.attributsClavier(field, f && f.formatDeChamp ? f.formatDeChamp(field) : null);
  }

  function renderTextLike(field, value, multiline) {
    var id = fieldId(field);
    var val = value == null ? '' : value;
    var reqAttr = field.required ? ' required' : '';
    var phAttr = placeholderAttr(field);
    var control = multiline
      ? '<textarea class="fr-input" id="' + id + '" name="' + escapeHtml(field.colId) + '"' + reqAttr + phAttr + '>' +
        escapeHtml(val) + '</textarea>'
      : '<input class="fr-input" type="text" id="' + id + '" name="' + escapeHtml(field.colId) +
        '" value="' + escapeHtml(val) + '"' + clavierAttrs(field) + reqAttr + phAttr + ' />';
    return '<div class="fr-input-group" data-colid="' + escapeHtml(field.colId) + '">' +
      renderLabel(field, id) + control + '</div>';
  }

  function attrBorne(o, cle) {
    return typeof o[cle] === 'number' ? ' ' + cle + '="' + o[cle] + '"' : '';
  }

  function renderNumber(field, value) {
    var id = fieldId(field);
    var val = value == null ? '' : value;
    var o = field.options || {};
    var step = o.step || 'any';
    var reqAttr = field.required ? ' required' : '';
    var phAttr = placeholderAttr(field);
    var unite = o.unite ? '<span class="fr-unite">' + escapeHtml(o.unite) + '</span>' : '';
    return '<div class="fr-input-group" data-colid="' + escapeHtml(field.colId) + '">' +
      renderLabel(field, id) +
      '<div class="fr-nombre__ligne">' +
      '<input class="fr-input" type="number" id="' + id + '" name="' + escapeHtml(field.colId) +
      '" value="' + escapeHtml(val) + '" step="' + escapeHtml(step) + '"' + attrBorne(o, 'min') + attrBorne(o, 'max') +
      clavierAttrs(field) + reqAttr + phAttr + ' />' + unite + '</div>' +
      '</div>';
  }

  /**
   * Un curseur : une valeur entre deux bornes, avec des valeurs d'appui.
   *
   * > **Un curseur a toujours une position ; une réponse, non.** Tant que la
   * > personne n'y a pas touché, rien n'est écrit — et l'écran le dit (« Pas de
   * > réponse ») au lieu de laisser croire que le milieu est un choix.
   */
  function renderCurseur(field, value) {
    var id = fieldId(field);
    var o = field.options || {};
    var min = typeof o.min === 'number' ? o.min : 0;
    var max = typeof o.max === 'number' ? o.max : 100;
    var pas = Number(o.step) > 0 ? Number(o.step) : 1;
    var touche = value !== null && value !== undefined && value !== '';
    var position = touche ? value : Math.round((min + max) / 2);
    var unite = o.unite ? ' ' + o.unite : '';
    var appuis = (Array.isArray(o.presets) ? o.presets : []).filter(function (p) { return Number.isFinite(Number(p)); })
      .map(function (p) {
        return '<button type="button" class="fr-btn fr-btn--secondary fr-curseur__preset" data-valeur="' + escapeHtml(p) + '">' +
          escapeHtml(p) + escapeHtml(unite) + '</button>';
      }).join('');
    return '<div class="fr-input-group fr-curseur" data-colid="' + escapeHtml(field.colId) + '" data-widget="curseur" ' +
      'data-unite="' + escapeHtml(o.unite || '') + '">' +
      renderLabel(field, id) +
      '<div class="fr-curseur__ligne">' +
      '<input type="range" id="' + id + '" name="' + escapeHtml(field.colId) + '" min="' + min + '" max="' + max +
      '" step="' + pas + '" value="' + escapeHtml(position) + '" data-touche="' + (touche ? '1' : '0') + '" />' +
      '<output class="fr-curseur__valeur" for="' + id + '" aria-live="polite">' +
      (touche ? escapeHtml(value) + escapeHtml(unite) : 'Pas de réponse') + '</output>' +
      '</div>' + (appuis ? '<div class="fr-curseur__appuis">' + appuis + '</div>' : '') + '</div>';
  }

  /** Un compteur : un nombre qu'on monte et qu'on descend d'un pas, entre ses bornes. */
  function renderCompteur(field, value) {
    var id = fieldId(field);
    var o = field.options || {};
    var val = value == null ? '' : value;
    var pas = Number(o.step) > 0 ? Number(o.step) : 1;
    var unite = o.unite ? '<span class="fr-unite">' + escapeHtml(o.unite) + '</span>' : '';
    return '<div class="fr-input-group fr-compteur" data-colid="' + escapeHtml(field.colId) + '" data-widget="compteur" data-pas="' + pas + '">' +
      renderLabel(field, id) +
      '<div class="fr-compteur__ligne">' +
      '<button type="button" class="fr-btn fr-btn--secondary fr-compteur__moins" data-delta="-1" aria-label="Moins">\u2212</button>' +
      '<input class="fr-input" type="number" inputmode="numeric" id="' + id + '" name="' + escapeHtml(field.colId) + '" value="' + escapeHtml(val) +
      '" step="' + pas + '"' + attrBorne(o, 'min') + attrBorne(o, 'max') + (field.required ? ' required' : '') + ' />' +
      '<button type="button" class="fr-btn fr-btn--secondary fr-compteur__plus" data-delta="1" aria-label="Plus">+</button>' +
      unite + '</div></div>';
  }

  function renderCheckbox(field, value) {
    var id = fieldId(field);
    var checked = value ? ' checked' : '';
    return '<div class="fr-checkbox-group" data-colid="' + escapeHtml(field.colId) + '">' +
      '<input type="checkbox" id="' + id + '" name="' + escapeHtml(field.colId) + '"' + checked + ' />' +
      '<label class="fr-label" for="' + id + '">' + escapeHtml(field.label) + '</label>' +
      '</div>';
  }

  function renderDateLike(field, value, inputType) {
    var id = fieldId(field);
    var val = value == null ? '' : value;
    var reqAttr = field.required ? ' required' : '';
    return '<div class="fr-input-group" data-colid="' + escapeHtml(field.colId) + '">' +
      renderLabel(field, id) +
      '<input class="fr-input" type="' + inputType + '" id="' + id + '" name="' + escapeHtml(field.colId) +
      '" value="' + escapeHtml(val) + '"' + reqAttr + ' />' +
      '</div>';
  }

  function renderSelect(field, value, optionsList) {
    var id = fieldId(field);
    var options = resolveOptions(field, optionsList);
    var reqAttr = field.required ? ' required' : '';
    var placeholder = '<option value="">' + (field.required ? 'Choisir…' : '(aucun)') + '</option>';
    var optsHtml = placeholder + options.map(function (o) {
      var sel = sameValue(value, o.value) ? ' selected' : '';
      return '<option value="' + escapeHtml(o.value) + '"' + sel + '>' + escapeHtml(o.label) + '</option>';
    }).join('');
    return '<div class="fr-select-group" data-colid="' + escapeHtml(field.colId) + '">' +
      renderLabel(field, id) +
      '<select class="fr-select" id="' + id + '" name="' + escapeHtml(field.colId) + '"' + reqAttr + '>' +
      optsHtml + '</select>' +
      '</div>';
  }

  /** Une couleur d'une question : `#rgb` ou `#rrggbb` seulement (elle finit dans un attribut de style). */
  function couleurSure(c) {
    return typeof c === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c) ? c : '';
  }

  function chipsEtiquettes(liste) {
    return liste.map(function (t) {
      return '<li class="fr-etiquette" data-etiquette="' + escapeHtml(t) + '"><span>' + escapeHtml(t) + '</span>' +
        '<button type="button" class="fr-etiquette__retirer" data-etiquette-retirer="' + escapeHtml(t) +
        '" aria-label="Retirer ' + escapeHtml(t) + '">\u00d7</button></li>';
    }).join('');
  }

  /**
   * Des étiquettes libres : on tape, on valide (Entrée, virgule ou « Ajouter »), et chaque
   * mot devient une puce qu'on retire. Les choix déclarés sont des suggestions, pas des limites.
   */
  function renderEtiquettes(field, value, optionsList) {
    var id = fieldId(field);
    var liste = Array.isArray(value) ? value.map(String) : [];
    var sugg = resolveOptions(field, optionsList);
    var dl = sugg.length
      ? '<datalist id="' + id + '-suggestions">' + sugg.map(function (s) { return '<option value="' + escapeHtml(s.value) + '"></option>'; }).join('') + '</datalist>'
      : '';
    return '<div class="fr-input-group fr-etiquettes" data-colid="' + escapeHtml(field.colId) + '" data-widget="etiquettes">' +
      renderLabel(field, id) +
      '<ul class="fr-etiquettes__liste" aria-label="Étiquettes choisies">' + chipsEtiquettes(liste) + '</ul>' +
      '<div class="fr-etiquettes__ligne">' +
      '<input class="fr-input" type="text" id="' + id + '" name="' + escapeHtml(field.colId) + '__saisie" autocomplete="off" maxlength="40"' +
      (dl ? ' list="' + id + '-suggestions"' : '') + placeholderAttr(field) + ' />' +
      '<button type="button" class="fr-btn fr-btn--secondary" data-etiquette-ajouter="' + escapeHtml(field.colId) + '">Ajouter</button>' +
      '</div>' + dl + '</div>';
  }

  function renderRadio(field, value, optionsList) {
    var options = resolveOptions(field, optionsList);
    var etiquettes = etiquettesDesReperes(field);
    var pastilles = field && field.widget === 'pastilles';
    var couleurs = (field && field.options && field.options.couleurs) || {};
    var itemsHtml = options.map(function (o, i) {
      var oid = fieldId(field) + '-' + i;
      var checked = sameValue(value, o.value) ? ' checked' : '';
      var teinte = pastilles && couleurSure(couleurs[o.value]) ? ' style="--pastille:' + couleurSure(couleurs[o.value]) + '"' : '';
      // > **La carte EST l'etiquette.** Un `<label for>` pose a cote de la
      // > coche ne rend cliquable que le texte : le reste de la carte — la
      // > marge, l'espace a droite du mot — ne repond pas, et sur un telephone
      // > on vise une cible de quelques millimetres. En enveloppant la coche
      // > et le texte dans le `<label>`, tout l'interieur de la carte coche.
      return '<label class="fr-radio-group" for="' + oid + '" data-option="' + escapeHtml(o.value) + '"' + teinte + '>' +
        '<input type="radio" id="' + oid + '" name="' + escapeHtml(field.colId) + '" value="' + escapeHtml(o.value) + '"' + checked + ' />' +
        '<span class="fr-label">' + libelleRepere(etiquettes, o) + '</span>' +
        '</label>';
    }).join('');
    return '<fieldset class="fr-fieldset' + (pastilles ? ' fr-fieldset--pastilles' : '') + '" data-colid="' + escapeHtml(field.colId) + '" data-widget="radio">' +
      renderLegend(field) + '<div class="fr-fieldset__content">' + itemsHtml + '</div></fieldset>';
  }

  function renderMultiselect(field, value, optionsList) {
    var options = resolveOptions(field, optionsList);
    var selected = Array.isArray(value) ? value.map(String) : [];
    var etiquettes = etiquettesDesReperes(field);
    var itemsHtml = options.map(function (o, i) {
      var oid = fieldId(field) + '-' + i;
      var checked = selected.indexOf(String(o.value)) !== -1 ? ' checked' : '';
      return '<label class="fr-checkbox-group" for="' + oid + '" data-option="' + escapeHtml(o.value) + '">' +
        '<input type="checkbox" id="' + oid + '" name="' + escapeHtml(field.colId) + '" value="' + escapeHtml(o.value) + '"' + checked + ' />' +
        '<span class="fr-label">' + libelleRepere(etiquettes, o) + '</span>' +
        '</label>';
    }).join('');
    // Un plafond annonce avant de choisir, pas un refus apres coup.
    var max = field.options && field.options.maxSelected;
    var plafond = max
      ? '<p class="fr-hint-text fr-plafond" data-max="' + max + '">' +
        selected.length + ' sur ' + max + ' maximum</p>'
      : '';
    return '<fieldset class="fr-fieldset" data-colid="' + escapeHtml(field.colId) + '" data-widget="multiselect"' +
      (max ? ' data-max="' + max + '"' : '') + '>' +
      renderLegend(field) + plafond + '<div class="fr-fieldset__content">' + itemsHtml + '</div></fieldset>';
  }

  /**
   * « Non concerné » : une réponse, pas une absence de réponse.
   *
   * Elle s'écrit vide dans la colonne — un entier ne sait pas porter ce sens —
   * mais elle vaut réponse à la validation, et elle se distingue d'une question
   * jamais posée tant que le formulaire déclare une colonne pour la recueillir
   * (`meta.nspCol`). Sans elle, les deux se confondent dans le vide, ce qui
   * reste préférable au 0 que Grist écrirait si on omettait la colonne.
   */
  var VALEUR_NON_CONCERNE = 'NSP';

  /** L'échelle d'un champ, telle que le formulaire la déclare, avec ses défauts. */
  function echelleDe(formDef, field) {
    var id = field && field.options && field.options.echelle;
    var e = (formDef && formDef.echelles && formDef.echelles[id]) || {};
    var min = Number.isFinite(e.min) ? e.min : 1;
    var max = Number.isFinite(e.max) ? e.max : 5;
    return {
      min: min,
      max: max > min ? max : min + 4,
      libelles: Array.isArray(e.libelles) && e.libelles.length === 2 ? e.libelles : null,
      nonConcerne: !!e.nonConcerne
    };
  }

  /** Les boutons d'une échelle — partagés par le champ seul et la matrice. */
  /**
   * Les crans, et rien qu'eux, sur la rangee.
   *
   * > **« Non concerné » occupait une place dans la rangee**, et poussait les
   * > crans vers la gauche : le « 5 » ne tombait plus sous « Tout à fait
   * > d'accord · 5 », et l'echelle ne correspondait plus a ses propres mots.
   * > Ce n'est pas un degre de l'echelle : c'est la sortie de l'echelle.
   *
   * Il va donc sous les ancrages, ou il se lit pour ce qu'il est.
   */
  function boutonsEchelle(field, value, e) {
    var html = '';
    for (var n = e.min; n <= e.max; n++) {
      var oid = fieldId(field) + '-' + n;
      var coche = sameValue(value, n) ? ' checked' : '';
      html += '<div class="fr-radio-group fr-echelle__cran">' +
        '<input type="radio" id="' + oid + '" name="' + escapeHtml(field.colId) + '" value="' + n + '"' + coche + ' />' +
        '<label class="fr-label" for="' + oid + '">' + n + '</label></div>';
    }
    return '<div class="fr-echelle__crans">' + html + '</div>';
  }

  /** La sortie de l'echelle, posee sous elle. */
  function sortieEchelle(field, value, e) {
    if (!e.nonConcerne) return '';
    var nid = fieldId(field) + '-nsp';
    var coche = value === VALEUR_NON_CONCERNE ? ' checked' : '';
    return '<div class="fr-radio-group fr-echelle__nsp">' +
      '<input type="radio" id="' + nid + '" name="' + escapeHtml(field.colId) + '" value="' +
      VALEUR_NON_CONCERNE + '"' + coche + ' />' +
      '<label class="fr-label" for="' + nid + '">Non concerné</label></div>';
  }

  /** Les deux libellés d'extrémité : ce qui dit ce que « 1 » et « 5 » veulent dire. */
  function ancresEchelle(e) {
    if (!e.libelles) return '';
    return '<div class="fr-echelle__ancres">' +
      '<span>' + e.min + ' · ' + escapeHtml(e.libelles[0]) + '</span>' +
      '<span>' + escapeHtml(e.libelles[1]) + ' · ' + e.max + '</span></div>';
  }

  function renderEchelle(field, value, optionsList, formDef) {
    var e = echelleDe(formDef, field);
    return '<fieldset class="fr-fieldset fr-echelle" data-colid="' + escapeHtml(field.colId) + '" data-widget="echelle">' +
      renderLegend(field) +
      '<div class="fr-fieldset__content">' + boutonsEchelle(field, value, e) + ancresEchelle(e) +
      sortieEchelle(field, value, e) + '</div>' +
      '</fieldset>';
  }

  /**
   * Une matrice : plusieurs affirmations qui partagent une échelle.
   *
   * Ce n'est pas un type, c'est une mise en page — les champs restent des
   * échelles ordinaires, chacun dans sa colonne. L'échelle n'est annoncée
   * qu'une fois, en tête, au lieu d'être répétée sous chaque ligne.
   */
  /**
   * Ce que la matrice demande, en une phrase.
   *
   * Sans elle, le public lisait cinq intitulés sans savoir ce qu'on lui
   * demandait d'en faire. La question se déclare une fois, à côté de l'échelle
   * qu'elle partage (`formDef.matrices`), et non sur chacun de ses champs.
   */
  /** L'identifiant du message d'erreur d'une question : c'est par lui que le champ s'y relie. */
  function erreurId(colId) { return 'erreur-' + escapeHtml(colId); }

  /**
   * Marque une question comme en défaut pour les technologies d'assistance :
   * le champ (ou son groupe) devient « invalide » et se décrit par son message.
   *
   * > **Un message qu'on ne relie pas à son champ reste un texte parmi d'autres.**
   * > Un lecteur d'écran annonce le champ sans dire ce qui ne va pas.
   */
  function signalerErreurHtml(html, colId) {
    var attrs = ' aria-invalid="true" aria-describedby="' + erreurId(colId) + '"';
    if (html.indexOf('<fieldset') !== -1) return html.replace('<fieldset', '<fieldset' + attrs);
    return html.replace(/<(input|select|textarea)\b/, '<$1' + attrs);
  }

  /** Le résumé des erreurs : une liste de liens vers les questions à corriger. */
  function resumeErreursHtml(colIds, libelleDe) {
    var items = colIds.map(function (c) {
      return '<li><a href="#" data-aller-a="' + escapeHtml(c) + '">' + escapeHtml(libelleDe(c)) + '</a></li>';
    }).join('');
    var n = colIds.length;
    return '<div class="fr-alert fr-alert--error fr-resume-erreurs" id="resume-erreurs" role="alert" tabindex="-1">' +
      '<p><strong>' + (n === 1 ? 'Une question est à corriger' : n + ' questions sont à corriger') + '</strong></p>' +
      '<ul>' + items + '</ul></div>';
  }

  function matriceDe(formDef, id) {
    var m = (formDef && formDef.matrices && formDef.matrices[id]) || {};
    return { titre: m.titre || '', consigne: m.consigne || '' };
  }

  function renderMatrice(groupe, values, formDef, champsEnErreur) {
    var e = echelleDe(formDef, groupe.fields[0]);
    var entete = matriceDe(formDef, groupe.matrice);
    var lignes = groupe.fields.map(function (f) {
      var erreur = champsEnErreur && champsEnErreur.indexOf(f.colId) !== -1
        ? '<p class="fr-error-text" id="' + erreurId(f.colId) + '" data-error-for="' + escapeHtml(f.colId) + '">Ce champ est obligatoire.</p>'
        : '';
      return '<div class="fr-matrice__ligne" data-colid="' + escapeHtml(f.colId) + '">' +
        '<span class="fr-matrice__intitule">' + escapeHtml(f.label) + requiredHint(f) + '</span>' +
        boutonsEchelle(f, values[f.colId], e) + erreur + '</div>';
    }).join('');
    return '<fieldset class="fr-fieldset fr-matrice" data-matrice="' + escapeHtml(groupe.matrice) + '">' +
      (entete.titre ? '<legend class="fr-fieldset__legend fr-matrice__question">' + escapeHtml(entete.titre) + '</legend>' : '') +
      (entete.consigne ? '<p class="fr-hint-text">' + escapeHtml(entete.consigne) + '</p>' : '') +
      ancresEchelle(e) + '<div class="fr-fieldset__content">' + lignes + '</div></fieldset>';
  }

  /**
   * Les champs d'une étape, regroupés : les échelles qui se suivent et partagent
   * une matrice forment un bloc, le reste va seul.
   */
  function grouperParMatrice(fields) {
    var groupes = [];
    var courant = null;
    (fields || []).forEach(function (f) {
      var m = f.options && f.options.matrice;
      if (m && courant && courant.matrice === m) { courant.fields.push(f); return; }
      if (m) { courant = { matrice: m, fields: [f] }; groupes.push(courant); return; }
      courant = null;
      groupes.push({ fields: [f] });
    });
    return groupes;
  }

  function renderLikert(field, value) {
    var itemsHtml = '';
    for (var i = 1; i <= 5; i++) {
      var oid = fieldId(field) + '-' + i;
      var checked = sameValue(value, i) ? ' checked' : '';
      itemsHtml += '<div class="fr-radio-group fr-radio-rich">' +
        '<input type="radio" id="' + oid + '" name="' + escapeHtml(field.colId) + '" value="' + i + '"' + checked + ' />' +
        '<label class="fr-label" for="' + oid + '">' + i + '</label>' +
        '</div>';
    }
    return '<fieldset class="fr-fieldset fr-likert" data-colid="' + escapeHtml(field.colId) + '" data-widget="likert">' +
      renderLegend(field) + '<div class="fr-fieldset__content fr-likert__scale">' + itemsHtml + '</div></fieldset>';
  }

  /** Un appareil a doigt, donc probablement un appareil photo sous la main. */
  function prefereAppareilPhoto() {
    try {
      return typeof window !== 'undefined' && !!window.matchMedia &&
        window.matchMedia('(pointer: coarse)').matches;
    } catch (e) { return false; }
  }

  /**
   * Un canevas qu'on compose : annoter une photo, croquer, signer.
   *
   * > **Ce n'est pas une illustration, c'est une reponse.** Le dessin part en
   * > piece jointe, comme une photo prise sur le terrain — le composant
   * > (`shared/dessin.js`) produit un PNG, qu'on depose dans un champ fichier
   * > cache. Tout le reste du chemin existe deja : `attachments.js` televerse
   * > a l'envoi, et `readFieldValue` lit ce champ comme n'importe quel autre.
   *
   * Sans le composant, le champ fichier reste : on peut toujours joindre une
   * photo annotee a la main. Une question ne devient pas impossible parce qu'un
   * canevas ne s'est pas monte.
   */
  function renderDessin(field, value) {
    var id = fieldId(field);
    var o = (field && field.options) || {};
    var d = o.dessin || {};
    var noms = [];
    if (Attachments.filesFromValue) {
      noms = Attachments.filesFromValue(value).map(function (f) { return f.name; });
    }
    if (!noms.length && Attachments.idsFromValue) {
      var ids = Attachments.idsFromValue(value);
      if (ids.length) noms = ids.map(function (x) { return 'dessin #' + x; });
    }
    var etat = noms.length
      ? '<p class="fr-hint-text fr-dessin__etat">' + escapeHtml(noms.join(', ')) + '</p>'
      : '<p class="fr-hint-text fr-dessin__etat">' + escapeHtml(consigneDessin(d)) + '</p>';
    return '<div class="fr-input-group fr-dessin-groupe" data-colid="' + escapeHtml(field.colId) +
      '" data-widget="dessin">' +
      renderLabel(field, id) +
      '<div class="fr-dessin-hote" data-dessin-de="' + escapeHtml(field.colId) + '" ' +
      'data-usage="' + escapeHtml(d.usage || 'croquis') + '" ' +
      'data-fond="' + escapeHtml(d.fond || '') + '" ' +
      'data-hauteur="' + escapeHtml(String(d.hauteur || '')) + '" ' +
      'data-trait="' + escapeHtml(String(d.trait || '')) + '" ' +
      'data-couleurs="' + escapeHtml(JSON.stringify(d.couleurs || null)) + '">' +
      '<p class="fr-hint-text fr-dessin__attente">La zone de dessin s’affiche ici.</p></div>' +
      '<input type="file" class="fr-dessin__fichier" id="' + id + '" name="' + escapeHtml(field.colId) +
      '" accept="image/png" hidden />' +
      etat + '</div>';
  }

  /** Ce qu'on attend de la personne, selon l'usage du canevas. */
  function consigneDessin(d) {
    if (d && d.usage === 'signature') return 'Signez dans le cadre, au doigt ou à la souris.';
    if (d && d.fond) return 'Dessinez sur l’image pour montrer ce dont vous parlez.';
    return 'Dessinez dans le cadre.';
  }

  function renderFile(field, value) {
    var id = fieldId(field);
    var reqAttr = field.required ? ' required' : '';
    var accept = (field.options && field.options.accept) || '';
    var maxFiles = (field.options && field.options.maxFiles) || 5;
    var acceptAttr = accept ? ' accept="' + escapeHtml(accept) + '"' : '';
    var names = [];
    if (Attachments.filesFromValue) {
      names = Attachments.filesFromValue(value).map(function (f) { return f.name; });
    }
    if (!names.length && Attachments.idsFromValue) {
      var ids = Attachments.idsFromValue(value);
      if (ids.length) names = ids.map(function (x) { return 'fichier #' + x; });
    }
    var hint = names.length
      ? '<p class="fr-hint-text">' + escapeHtml(names.join(', ')) + '</p>'
      : '<p class="fr-hint-text">Jusqu\'à ' + maxFiles + ' fichier(s)</p>';
    // Sur un appareil tactile, un champ qui accepte des images propose aussi la
    // prise de vue. Sans l'attribut `capture`, le telephone n'ouvre qu'un
    // selecteur de fichiers : on devait photographier ailleurs, puis retrouver
    // la photo dans la galerie. Les deux champs portent le meme nom et se lisent
    // ensemble (`readFieldValue`). Sur ordinateur, `capture` n'a pas d'effet :
    // le second bouton n'y serait qu'un doublon, il n'est pas rendu.
    var accepteImages = !accept || /image/i.test(accept);
    var camera = accepteImages && prefereAppareilPhoto()
      ? '<input class="fr-upload fr-upload--camera" type="file" id="' + id + '-camera" name="' +
        escapeHtml(field.colId) + '" accept="image/*" capture="environment" />' +
        '<label class="fr-btn fr-btn--secondary fr-btn--sm fr-upload-camera" for="' + id + '-camera">' +
        'Prendre une photo</label>'
      : '';
    return '<div class="fr-upload-group" data-colid="' + escapeHtml(field.colId) + '" data-widget="file">' +
      renderLabel(field, id) +
      '<input class="fr-upload" type="file" id="' + id + '" name="' + escapeHtml(field.colId) +
      '" multiple' + acceptAttr + reqAttr + ' />' + camera + hint + '</div>';
  }

  /**
   * Les colonnes ou une saisie range sa reponse.
   *
   * Une question du formulaire n'est pas toujours une colonne : « vos trois
   * lieux prioritaires » se range dans trois colonnes de rang, et « Autre :
   * … » demande une colonne de texte a cote de la liste. `options.colonnes`
   * dit lesquelles ; le `colId` reste le nom de la question.
   */
  function colonnesDe(field) {
    return (field && field.options && field.options.colonnes) || {};
  }

  /**
   * Oui / Non en deux boutons plutot qu'une case a cocher.
   *
   * > **Une case a cocher ne pose pas de question, elle affirme.** « Possedez-
   * > vous un velo ? » avec une case vide se lit « non » aussi bien que « pas
   * > encore repondu ». Deux boutons obligent a choisir, et la personne voit
   * > ce qu'elle a repondu.
   *
   * Grist ne sait pas vider un `Bool` (mesure) : sans reponse, la colonne
   * recevra `false`. Une question qui doit distinguer « non » de « sans
   * reponse » se pose en liste de choix, pas en oui/non.
   */
  function renderOuiNon(field, value) {
    var o = (field && field.options) || {};
    var opts = [{ value: 'true', label: o.libelleOui || 'Oui' },
                { value: 'false', label: o.libelleNon || 'Non' }];
    var coche = (value === true || value === 'true') ? 'true'
      : ((value === false || value === 'false') ? 'false' : null);
    var itemsHtml = opts.map(function (op, i) {
      var oid = fieldId(field) + '-' + i;
      return '<label class="fr-radio-group" for="' + oid + '">' +
        '<input type="radio" id="' + oid + '" name="' + escapeHtml(field.colId) + '" value="' + op.value + '"' +
        (coche === op.value ? ' checked' : '') + ' />' +
        '<span class="fr-label">' + escapeHtml(op.label) + '</span>' +
        '</label>';
    }).join('');
    return '<fieldset class="fr-fieldset" data-colid="' + escapeHtml(field.colId) + '" data-widget="ouinon">' +
      renderLegend(field) + '<div class="fr-fieldset__content fr-fieldset__content--ligne">' + itemsHtml + '</div></fieldset>';
  }

  /**
   * Classer : une ligne par proposition, une colonne par rang.
   *
   * > **Monter et descendre ne dit pas ce qu'on attribue.** Avec six
   * > propositions et trois places a donner, la personne ne classe pas une
   * > liste : elle designe un premier, un deuxieme, un troisieme. La grille le
   * > montre — c'est la forme qu'avait le questionnaire ecrit a la main, et
   * > c'est aussi celle des colonnes qui recoivent la reponse : une par rang.
   *
   * Une place ne se donne qu'une fois, et une proposition n'en prend qu'une :
   * les deux regles se tiennent a la saisie. Recliquer une case la libere,
   * puisqu'un bouton radio ne se decoche pas tout seul.
   */
  /**
   * L'etiquette qu'une carte d'illustration donne a une option.
   *
   * > **Un « A » sur la carte doit se retrouver dans la question.** Sans cela,
   * > le repere ne designe rien : on regarde une carte qui pointe cinq
   * > endroits, puis une liste de cinq propositions, et c'est a soi de deviner
   * > laquelle est laquelle. La correspondance existe pourtant deja dans la
   * > definition — `reperes[].option` nomme l'option — elle n'etait simplement
   * > pas montree.
   */
  function etiquettesDesReperes(field) {
    var ill = field && field.options && field.options.illustration;
    if (!ill || ill.type !== 'carte') return null;
    var liste = ill.reperes || [];
    var table = {};
    var trouve = false;
    for (var i = 0; i < liste.length; i++) {
      var r = liste[i];
      if (r && r.option != null && r.etiquette != null && r.etiquette !== '') {
        table[String(r.option)] = String(r.etiquette);
        trouve = true;
      }
    }
    return trouve ? table : null;
  }

  /** Le libelle d'une option, precede de son repere quand il y en a un. */
  function libelleRepere(etiquettes, o) {
    var e = etiquettes && etiquettes[String(o.value)];
    return e
      ? '<span class="fr-repere-lie" aria-hidden="true">' + escapeHtml(e) + '</span> ' + escapeHtml(o.label)
      : escapeHtml(o.label);
  }

  function renderClassement(field, value, optionsList) {
    var options = resolveOptions(field, optionsList);
    var rangs = (field.options && field.options.rangs) || Math.min(3, options.length);
    var choisis = Array.isArray(value) ? value.map(function (v) { return v == null ? '' : String(v); }) : [];
    var id = fieldId(field);

    var entetes = '';
    for (var r = 0; r < rangs; r++) {
      entetes += '<th scope="col">' + rangLibelle(r) + '</th>';
    }
    var etiquettes = etiquettesDesReperes(field);
    var lignes = options.map(function (o, i) {
      var cases = '';
      for (var r2 = 0; r2 < rangs; r2++) {
        var coche = choisis[r2] === String(o.value) ? ' checked' : '';
        var cid = id + '-r' + r2 + '-o' + i;
        // La case entiere coche : viser un rond de 20 px au doigt, dans une
        // grille de cinq lignes sur trois colonnes, demande une precision que
        // personne n'a en marchant.
        cases += '<td class="fr-rangs__case">' +
          '<label class="fr-rangs__cible" for="' + cid + '" data-rang="' + (r2 + 1) + '">' +
          '<input type="radio" id="' + cid + '" name="' + escapeHtml(field.colId) + '__rang' + r2 + '" ' +
          'value="' + escapeHtml(o.value) + '"' + coche + ' />' +
          '<span class="fr-rangs__lu">' + rangLibelle(r2) + ' : ' + escapeHtml(o.label) + '</span></label></td>';
      }
      return '<tr data-option="' + escapeHtml(o.value) + '">' +
        '<th scope="row" class="fr-rangs__intitule">' + libelleRepere(etiquettes, o) + '</th>' +
        cases + '</tr>';
    }).join('');

    return '<fieldset class="fr-fieldset fr-classement" data-colid="' + escapeHtml(field.colId) + '" ' +
      'data-widget="classement" data-rangs="' + rangs + '">' +
      renderLegend(field) +
      '<p class="fr-hint-text">Cochez la place voulue pour chaque proposition. Une proposition = une place ; ' +
      'recliquez une case pour l\u2019enlever.</p>' +
      '<div class="fr-rangs__cadre"><table class="fr-rangs">' +
      '<thead><tr><th scope="col">Proposition</th>' + entetes + '</tr></thead>' +
      '<tbody>' + lignes + '</tbody></table></div></fieldset>';
  }

  /** « 1ʳᵉ place », « 2ᵉ place »… — ce que la colonne du tableau annonce. */
  function rangLibelle(i) {
    return i === 0 ? '1<sup>re</sup> place' : (i + 1) + '<sup>e</sup> place';
  }

  /**
   * Un lieu : sur la carte, au doigt — ou a la main si tout le reste manque.
   *
   * > **La carte et ses regles viennent d'Atlas** (`shared/carte-geometrie.js`
   * > monte MapLibre et appelle les modules purs d'Atlas). Elle ne se charge
   * > que si la question demande une carte, et son absence ne rend pas la
   * > question impossible : le champ sous la carte accepte le WKT, et la
   * > position du telephone pose un point.
   */
  function renderGeo(field, value, values) {
    var id = fieldId(field);
    var v = value == null ? '' : String(value);
    var o = (field && field.options) || {};
    var avecCarte = o.carte !== false;
    var type = o.geometrie || 'Point';
    var carte = avecCarte
      ? '<div class="fr-carte" data-carte-de="' + escapeHtml(field.colId) + '" ' +
        'data-type="' + escapeHtml(type) + '" ' +
        'data-centre="' + escapeHtml(JSON.stringify((o.carte && o.carte.centre) || null)) + '" ' +
        'data-zoom="' + escapeHtml(String((o.carte && o.carte.zoom) || '')) + '" ' +
        'data-fond="' + escapeHtml((o.carte && o.carte.fond) || 'plan') + '">' +
        '<p class="fr-hint-text fr-carte__attente">La carte s\u2019affiche ici.</p></div>' +
        '<p class="fr-hint-text fr-carte__mode">' + consigneCarte(type) + '</p>'
      : '';
    return '<div class="fr-input-group fr-geo" data-colid="' + escapeHtml(field.colId) + '" data-widget="geo">' +
      renderLabel(field, id) + carte +
      '<div class="fr-geo__ligne">' +
      '<input class="fr-input" type="text" id="' + id + '" name="' + escapeHtml(field.colId) + '" ' +
      'value="' + escapeHtml(v) + '" placeholder="POINT(5.37 43.29)" />' +
      '<button type="button" class="fr-btn fr-btn--secondary fr-geo__ici">Utiliser ma position</button>' +
      '</div>' +
      '<p class="fr-hint-text fr-geo__etat" role="status" aria-live="polite">' +
      escapeHtml((values && values['__enrichi_' + field.colId]) || '') + '</p>' +
      mentionEnrichissement(field) +
      '</div>';
  }

  /** Ce qui part, et vers qui, quand un lieu complète d'autres colonnes. */
  function mentionEnrichissement(field) {
    var api = enrichirApi();
    if (!api) return '';
    var m = api.mention(api.colonnesDe(field));
    return m ? '<p class="fr-hint-text fr-geo__mention">' + escapeHtml(m) + '</p>' : '';
  }

  /** Ce qu'on attend de la personne, selon ce qu'on lui demande de poser. */
  function consigneCarte(type) {
    if (/^Multi/.test(type) && /Point/.test(type)) {
      return 'Touchez la carte pour poser un point \u00e0 chaque endroit concern\u00e9. Touchez un point pour l\u2019enlever.';
    }
    if (/Point/.test(type)) return 'Touchez la carte pour poser le point. Touchez-le pour l\u2019enlever.';
    if (/Line/.test(type)) return 'Tracez le trajet, point par point. Double-touchez pour terminer.';
    return 'Tracez le contour, point par point. Double-touchez pour fermer.';
  }

  /**
   * « Autre : … » — une reponse qu'on n'avait pas prevue, dans sa colonne.
   *
   * > **La reponse libre ne va pas dans la colonne de choix.** Grist l'y garde,
   * > mais l'encadre en rouge : elle n'est pas dans la liste (mesure le
   * > 04/10/2026). La liste recoit « Autre », qui est une option comme les
   * > autres ; le texte va dans `options.colonnes.autre`.
   *
   * Le bloc s'ajoute **par-dessus** la saisie habituelle, quelle qu'elle soit :
   * une liste deroulante, des cases, des boutons. Un `kind` est une couche, pas
   * un widget de plus.
   */
  function blocAutre(field, values) {
    var o = (field && field.options) || {};
    var col = colonnesDe(field).autre;
    if (!col) return '';
    var id = fieldId(field) + '-autre-texte';
    var libre = values && values[col] != null ? String(values[col]) : '';
    var choisi = valeurAutreChoisie(field, values);
    return '<div class="fr-autre' + (choisi ? '' : ' fr-autre--repliee') + '" data-autre-de="' + escapeHtml(field.colId) + '">' +
      '<label class="fr-label" for="' + id + '">' + escapeHtml(o.consigneAutre || 'Précisez') + '</label>' +
      '<input class="fr-input" type="text" id="' + id + '" name="' + escapeHtml(col) + '" value="' + escapeHtml(libre) + '" />' +
      '</div>';
  }

  /** La valeur « Autre » est-elle retenue dans la reponse courante ? */
  function valeurAutreChoisie(field, values) {
    var o = (field && field.options) || {};
    var cible = String(o.valeurAutre || 'Autre');
    var v = values ? values[field.colId] : null;
    if (Array.isArray(v)) return v.map(String).indexOf(cible) !== -1;
    return v != null && String(v) === cible;
  }

  var WIDGET_RENDERERS = {
    text: function (f, v) { return renderTextLike(f, v, false); },
    textarea: function (f, v) { return renderTextLike(f, v, true); },
    number: renderNumber,
    checkbox: renderCheckbox,
    date: function (f, v) { return renderDateLike(f, v, 'date'); },
    datetime: function (f, v) { return renderDateLike(f, v, 'datetime-local'); },
    select: function (f, v, opts) { return renderSelect(f, v, opts); },
    radio: function (f, v, opts) { return renderRadio(f, v, opts); },
    multiselect: function (f, v, opts) { return renderMultiselect(f, v, opts); },
    likert: function (f, v) { return renderLikert(f, v); },
    echelle: function (f, v, opts, def) { return renderEchelle(f, v, opts, def); },
    file: function (f, v) { return renderFile(f, v); },
    ouinon: function (f, v) { return renderOuiNon(f, v); },
    classement: function (f, v, opts) { return renderClassement(f, v, opts); },
    geo: function (f, v, o, d, values) { return renderGeo(f, v, values); },
    dessin: function (f, v) { return renderDessin(f, v); },
    pastilles: function (f, v, opts) { return renderRadio(f, v, opts); },
    etiquettes: function (f, v, opts) { return renderEtiquettes(f, v, opts); },
    curseur: function (f, v) { return renderCurseur(f, v); },
    compteur: function (f, v) { return renderCompteur(f, v); },
    heure: function (f, v) { return renderDateLike(f, v, 'time'); }
  };

  // renderFieldHtml : field → chaîne HTML échappée, DSFR (fr-input, fr-select, ...).
  /**
   * Un widget inconnu retombe sur celui que son type Grist appelle, pas sur du
   * texte.
   *
   * C'est la règle de dégradation : un formulaire composé avec une saisie que
   * ce moteur ne connaît pas encore — une copie figée, embarquée ailleurs —
   * doit rendre une question utilisable. Un `Bool` devient une case, pas un
   * champ texte où la personne écrirait « oui ».
   */
  /**
   * Ce qui se montre avant qu'on reponde.
   *
   * > **Une question ne se comprend pas toujours avec des mots.** « Classez ces
   * > cinq lieux » suppose qu'on sache ou ils sont ; « reconnaissez-vous cet
   * > amenagement ? » suppose qu'on l'ait vu. Le questionnaire ecrit a la main
   * > posait une carte au-dessus du classement — c'est cette place-la qu'on
   * > rend ici, pour n'importe quelle question.
   *
   * Trois sources, declarees dans `options.illustration` :
   *
   *     { type: 'image', url, alt, legende }
   *     { type: 'carte', centre, zoom, fond, reperes: [{ etiquette, lon, lat }] }
   *
   * L'image accepte une URL ou un fichier depose (une `data:` URL) ; `alt` est
   * ce que lira quelqu'un qui ne voit pas l'image, et il n'est pas facultatif
   * quand l'image porte l'information.
   */
  function renderIllustration(field) {
    var ill = field && field.options && field.options.illustration;
    if (!ill || !ill.type) return '';
    var legende = ill.legende
      ? '<figcaption class="fr-hint-text fr-illustration__legende">' + escapeHtml(ill.legende) + '</figcaption>'
      : '';
    if (ill.type === 'image') {
      var img = renderBrandImg(ill.url, ill.alt, 'fr-illustration__image');
      if (!img) return '';
      return '<figure class="fr-illustration">' + img + legende + '</figure>';
    }
    if (ill.type === 'inclusion') {
      // Une page integree : une vue Grist, un tableau de bord, un plan, un
      // widget. Le formulaire devient le cadre d'un contexte, pas seulement
      // une suite de questions.
      var src = safeFrameUrl(ill.url);
      if (!src) {
        return ill.url
          ? '<p class="fr-hint-text fr-illustration__refus">La page \u00e0 int\u00e9grer doit \u00eatre en <code>https</code>.</p>'
          : '';
      }
      var hauteur = Number(ill.hauteur) > 0 ? Math.min(900, Number(ill.hauteur)) : 320;
      return '<figure class="fr-illustration">' +
        '<iframe class="fr-illustration__cadre" src="' + escapeHtml(src) + '" ' +
        'title="' + escapeHtml(ill.titre || ill.legende || 'Contenu illustrant la question') + '" ' +
        'style="height:' + hauteur + 'px" loading="lazy" referrerpolicy="no-referrer" ' +
        'sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"></iframe>' +
        legende + '</figure>';
    }
    if (ill.type === 'carte') {
      // La carte d'illustration ne recoit pas de reponse : elle montre ou sont
      // les choses. Les reperes portent la meme etiquette que dans la liste.
      return '<figure class="fr-illustration">' +
        '<div class="fr-carte fr-carte--montre" data-carte-illustre="' + escapeHtml(field.colId) + '" ' +
        'data-centre="' + escapeHtml(JSON.stringify(ill.centre || null)) + '" ' +
        'data-zoom="' + escapeHtml(String(ill.zoom || '')) + '" ' +
        'data-fond="' + escapeHtml(ill.fond || 'plan') + '" ' +
        'data-reperes="' + escapeHtml(JSON.stringify(ill.reperes || [])) + '">' +
        '<p class="fr-hint-text fr-carte__attente">La carte s\u2019affiche ici.</p></div>' +
        legende + '</figure>';
    }
    return '';
  }

  function renderFieldHtml(field, values, optionsList, formDef) {
    values = values || {};
    var value = values[field.colId];
    var parDefaut = Types && Types.defaultWidget ? Types.defaultWidget(field && field.type) : 'text';
    var renderer = WIDGET_RENDERERS[field && field.widget] ||
      WIDGET_RENDERERS[parDefaut] || WIDGET_RENDERERS.text;
    // Un référentiel remplace la saisie texte plutôt que de s'y superposer : la
    // liste de suggestions vit dans le champ lui-même.
    if (field && field.kind === 'referentiel') renderer = renderReferentiel;
    var html = renderIllustration(field) + renderer(field, value, optionsList, formDef, values);
    // Un `kind` est une couche posee sur la saisie, pas un widget de plus :
    // « Autre : … » s'ajoute a la liste deroulante comme aux cases a cocher.
    if (field && (field.kind === 'choix_autre' || field.kind === 'classement')) {
      html += blocAutre(field, values);
    }
    return html;
  }

  /**
   * Une question dont la valeur est donnée par l'adresse de la page.
   *
   * La personne la voit, elle ne la change pas : un QR code désigne un objet,
   * pas une liste à choisir dedans. La valeur reste dans `values`, donc dans la
   * ligne envoyée — ce n'est qu'un affichage, pas une protection (voir
   * `shared/prefill.js`).
   */
  function renderVerrouille(field, value, libelle) {
    var affiche = libelle ||
      (typeof value === 'number' ? 'n° ' + value : (value === null || value === undefined ? '' : String(value)));
    return '<div class="fr-input-group fr-verrouille" data-colid="' + escapeHtml(field.colId) +
      '" data-verrouille="1">' +
      '<p class="fr-label">' + escapeHtml(field.label || field.colId) + '</p>' +
      '<p class="fr-verrouille__valeur">' + escapeHtml(affiche) + '</p></div>';
  }

  // ── mount : runtime navigateur — étapes visibles, validation requise, submit ──
  function getVisibleSections(formDef, values, context) {
    var sections = (formDef && formDef.sections) || [];
    var out = [];
    for (var i = 0; i < sections.length; i++) {
      if (isSectionVisible(sections[i], values, context)) out.push(sections[i]);
    }
    return out;
  }

  function getVisibleFields(section, values, context) {
    var fields = (section && section.fields) || [];
    var out = [];
    for (var i = 0; i < fields.length; i++) {
      if (isFieldVisible(fields[i], values, context)) out.push(fields[i]);
    }
    return out;
  }

  function optionsForField(field, formDef) {
    var key = (field.options && field.options.choicesKey) || field.colId;
    var fromDef = formDef && formDef.choices && formDef.choices[key];
    if (Array.isArray(fromDef)) return fromDef;
    if (field.options && Array.isArray(field.options.choices)) return field.options.choices;
    return null;
  }

  function readFieldValue(rootEl, field, previous) {
    if (field.widget === 'curseur') {
      // Un curseur non touché n'a pas répondu : sa position de départ n'est pas un choix.
      var curs = rootEl.querySelector('input[name="' + field.colId + '"]');
      return curs && curs.getAttribute('data-touche') === '1' ? curs.value : (previous != null ? previous : null);
    }
    if (field.widget === 'checkbox') {
      var cb = rootEl.querySelector('[name="' + field.colId + '"]');
      return cb ? !!cb.checked : false;
    }
    if (field.widget === 'etiquettes') {
      // Un mot tapé et pas encore ajouté se compte : le perdre en silence serait pire que l'ajouter.
      var api = saisiesApi();
      var courant = Array.isArray(previous) ? previous.slice() : [];
      var tape = rootEl.querySelector('input[name="' + field.colId + '__saisie"]');
      if (api && tape && String(tape.value || '').trim()) {
        courant = api.ajouterEtiquette(courant, tape.value, { max: field.options && field.options.maxSelected });
      }
      return courant.length ? courant : null;
    }
    if (field.widget === 'radio' || field.widget === 'likert' || field.widget === 'echelle' ||
        field.widget === 'ouinon' || field.widget === 'pastilles') {
      var checkedRadio = rootEl.querySelector('input[name="' + field.colId + '"]:checked');
      return checkedRadio ? checkedRadio.value : null;
    }
    if (field.widget === 'classement') {
      var bloc = rootEl.querySelector('[data-colid="' + field.colId + '"]');
      if (!bloc) return previous != null ? previous : null;
      var combien = parseInt(bloc.getAttribute('data-rangs'), 10) || 0;
      var ordre = [];
      var rempli = false;
      for (var k = 0; k < combien; k++) {
        var coche = bloc.querySelector('input[name="' + field.colId + '__rang' + k + '"]:checked');
        ordre.push(coche ? coche.value : null);
        if (coche) rempli = true;
      }
      return rempli ? ordre : null;
    }
    if (field.widget === 'multiselect') {
      var checkedBoxes = rootEl.querySelectorAll('input[name="' + field.colId + '"]:checked');
      var arr = [];
      for (var i = 0; i < checkedBoxes.length; i++) arr.push(checkedBoxes[i].value);
      return arr;
    }
    if (field.widget === 'file' || field.widget === 'dessin') {
      // Deux champs peuvent porter ce nom : la selection de fichiers et la
      // prise de vue. On lit les deux.
      var selecteur = 'input[type="file"][name="' + field.colId + '"]';
      var champs = typeof rootEl.querySelectorAll === 'function'
        ? Array.prototype.slice.call(rootEl.querySelectorAll(selecteur))
        : [rootEl.querySelector(selecteur)];
      var choisis = [];
      champs.forEach(function (c) {
        if (c && c.files && c.files.length) choisis = choisis.concat(Array.prototype.slice.call(c.files));
      });
      if (choisis.length) return choisis;
      // Re-render recrée l'input vide : conserver la sélection précédente
      return previous != null ? previous : null;
    }
    var el = rootEl.querySelector('[name="' + field.colId + '"]');
    return el ? el.value : null;
  }

  function readSectionValues(rootEl, fields, values, verrouilles) {
    for (var i = 0; i < fields.length; i++) {
      // Une question verrouillée n'a pas de zone de saisie : la relire depuis
      // l'écran effacerait la valeur que l'adresse de la page lui a donnée.
      if (verrouilles && verrouilles.indexOf(fields[i].colId) !== -1) continue;
      values[fields[i].colId] = readFieldValue(rootEl, fields[i], values[fields[i].colId]);
      // Le texte de « Autre » vit dans sa colonne, pas dans le colId de la
      // question : sans cette lecture, il se perdait au premier re-rendu.
      var autre = colonnesDe(fields[i]).autre;
      if (autre && typeof rootEl.querySelector === 'function') {
        var champ = rootEl.querySelector('[name="' + autre + '"]');
        if (champ) values[autre] = champ.value;
      }
    }
    return values;
  }

  /**
   * Les réponses dont le format est faux : IBAN, SIRET, code postal…
   *
   * Une réponse vide n'est pas ici : l'obligation est une autre règle. Les
   * questions cachées ne se contrôlent pas — personne ne les a vues.
   */
  function validerFormats(fields, values) {
    var api = formatsApi();
    var out = [];
    if (!api) return out;
    for (var i = 0; i < fields.length; i++) {
      var id = api.formatDeChamp(fields[i]);
      if (!id) continue;
      if (!api.valide(id, values[fields[i].colId])) out.push({ colId: fields[i].colId, message: api.message(id) });
    }
    return out;
  }

  function validateRequired(fields, values) {
    var missing = [];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (!f.required) continue;
      var v = values[f.colId];
      var empty;
      if (f.widget === 'checkbox') empty = v !== true;
      else empty = v == null || v === '' || (Array.isArray(v) && v.length === 0);
      if (empty) missing.push(f.colId);
    }
    return missing;
  }

  // defaultSubmit : bridge.submit | updateRow si editRowId | addRow | BulkAddRecord
  function defaultSubmit(bridge, formDef, data) {
    var editId = (bridge && bridge.editRowId) || (formDef && formDef.editRowId) || null;
    if (editId != null && bridge && typeof bridge.updateRow === 'function') {
      return Promise.resolve(bridge.updateRow(formDef.tableId, editId, data));
    }
    if (bridge && typeof bridge.submit === 'function') {
      return Promise.resolve(bridge.submit(data));
    }
    if (bridge && typeof bridge.addRow === 'function') {
      return Promise.resolve(bridge.addRow(formDef.tableId, data));
    }
    if (typeof window !== 'undefined' && window.grist && window.grist.docApi && window.grist.docApi.applyUserActions) {
      if (editId != null) {
        return Promise.resolve(window.grist.docApi.applyUserActions([
          ['UpdateRecord', formDef.tableId, editId, data]
        ]));
      }
      var cols = {};
      for (var k in data) { if (Object.prototype.hasOwnProperty.call(data, k)) cols[k] = [data[k]]; }
      return Promise.resolve(window.grist.docApi.applyUserActions([
        ['BulkAddRecord', formDef.tableId, [null], cols]
      ]));
    }
    return Promise.reject(new Error('[Engine.mount] aucun mécanisme de soumission (bridge.submit / bridge.addRow / grist.docApi)'));
  }

  /**
   * `Ref` ou `RefList`, que le type soit nu ou complet (`Ref:Domaines`).
   *
   * Un formulaire déduit d'une table porte le type complet de Grist. Le moteur
   * ne reconnaissait que le type nu : il ne chargeait pas la table visée, et la
   * liste n'offrait que « (aucun) » — constaté le 01/10/2026 dans la fiche
   * d'Atlas, en Grist réel, sur une colonne remplie. Enregistrer aurait vidé
   * la référence.
   */
  function typeRef(type) {
    var t = Types && Types.normalizeGristType ? Types.normalizeGristType(type) : type;
    return (t === 'Ref' || t === 'RefList') ? t : '';
  }

  function resolveRefTable(field) {
    if (!field) return '';
    if (field.refTable) return field.refTable;
    if (field.options && field.options.refTable) return field.options.refTable;
    var m = /^Ref(?:List)?:(.+)$/.exec(String(field.type || ''));
    return m ? m[1] : '';
  }

  /**
   * La colonne qui nomme une ligne de la table visée, quand le formulaire ne la
   * déclare pas : `Nom` si elle existe, sinon la première colonne dont les
   * valeurs sont du texte non vide, sinon aucune (les choix montrent l'id).
   */
  function colonneLibelle(records) {
    if (!records) return null;
    var n = (records.id || []).length;
    var cles = Object.keys(records).filter(function (k) {
      return k !== 'id' && k !== 'manualSort' && k.indexOf('gristHelper_') !== 0 && Array.isArray(records[k]);
    });
    // Un nom qui dit « libellé » prime sur l'ordre des colonnes : avec `Code`
    // avant `Libelle`, la liste affichait les codes.
    var nommee = cles.filter(function (k) { return /^(nom|name|libell?e|titre|label)(_|$)/i.test(k); });
    var candidates = nommee.concat(cles.filter(function (k) { return nommee.indexOf(k) === -1; }));
    for (var i = 0; i < candidates.length; i++) {
      var col = records[candidates[i]];
      var textes = 0;
      for (var j = 0; j < n; j++) {
        var v = col[j];
        // Du texte à lire : ni adresse web, ni courriel, ni suite de chiffres (un code).
        if (typeof v === 'string' && v.trim() && v.indexOf('://') === -1 &&
            !/^\S+@\S+$/.test(v.trim()) && !/^\d+$/.test(v.trim())) textes++;
      }
      if (n && textes / n >= 0.8) return candidates[i];
    }
    return null;
  }

  function rowsToColumnar(rows) {
    var out = { id: [] };
    if (!rows || !rows.length) return out;
    Object.keys(rows[0]).forEach(function (k) { out[k] = []; });
    rows.forEach(function (row) {
      Object.keys(out).forEach(function (k) { out[k].push(row[k]); });
    });
    return out;
  }

  function choicesFromRefRecords(records, visibleCol) {
    if (!records || !records.id) return [];
    var col = visibleCol && records[visibleCol] ? visibleCol : colonneLibelle(records);
    var labels = col ? records[col] : null;
    var out = [];
    for (var i = 0; i < records.id.length; i++) {
      out.push({ value: records.id[i], label: labels ? labels[i] : String(records.id[i]) });
    }
    return out;
  }

  function collectRefTableIds(formDef) {
    var seen = {};
    var out = [];
    (formDef.sections || []).forEach(function (sec) {
      (sec.fields || []).forEach(function (f) {
        if (!typeRef(f.type)) return;
        var t = resolveRefTable(f);
        if (t && !seen[t]) { seen[t] = true; out.push(t); }
      });
    });
    return out;
  }

  // mount : multi-étapes + cascade Ref (loadTable) + editRowId (UpdateRecord) + context.
  /**
   * Valeurs de depart, filtrees par ce que le formulaire declare.
   *
   * `mount` ouvrait sur `{}` en dur : `editRowId` faisait ECRIRE dans une ligne
   * existante, jamais LIRE la sienne. Et `collectSubmitData` emet TOUS les
   * champs visibles — ouvrir un objet, cocher une case et enregistrer effacait
   * donc son nom et sa hauteur. Le chemin etait cable depuis toujours et jamais
   * exerce : son seul consommateur, l'app terrain, ne fait que de la creation.
   *
   * Un consommateur qui edite avait tente d'amorcer le DOM apres le montage.
   * Cela ne tient pas : un formulaire multi-etapes ne rend que l'etape
   * courante, et les champs des suivantes n'existent pas encore. Les valeurs
   * doivent donc entrer ICI, avant le premier rendu.
   *
   * On ne retient que ce que le formulaire declare — une valeur qu'il ignore
   * n'a rien a faire dans `values`.
   */
  function initialValues(formDef, fournies) {
    var out = {};
    if (!fournies) return out;
    var sections = (formDef && formDef.sections) || [];
    for (var i = 0; i < sections.length; i++) {
      var fields = sections[i].fields || [];
      for (var j = 0; j < fields.length; j++) {
        var colId = fields[j].colId;
        if (Object.prototype.hasOwnProperty.call(fournies, colId)) out[colId] = fournies[colId];
        if (fields[j].kind === 'referentiel') amorcerAnnexes(fields[j], fournies, out);
        var apiInit = enrichirApi();
        if (apiInit) {
          var colsInit = apiInit.colonnesDe(fields[j]);
          Object.keys(colsInit).forEach(function (sens) {
            if (Object.prototype.hasOwnProperty.call(fournies, colsInit[sens])) out[colsInit[sens]] = fournies[colsInit[sens]];
          });
        }
      }
    }
    return out;
  }

  /**
   * Modifier une ligne qui porte déjà une adresse choisie.
   *
   * Les colonnes annexes ne sont pas des champs : `initialValues` ne les
   * recopiait pas, et la première modification d'une AUTRE question de la ligne
   * aurait effacé le code postal et les coordonnées. On les ramène, et on tient
   * l'adresse pour choisie tant que son texte ne change pas — c'est ce que dit
   * la présence d'annexes à côté d'un texte.
   */
  function amorcerAnnexes(field, fournies, out) {
    var annexes = colonnesDe(field).annexes || {};
    var presentes = false;
    Object.keys(annexes).forEach(function (cle) {
      var col = annexes[cle];
      if (!col || !Object.prototype.hasOwnProperty.call(fournies, col)) return;
      var v = fournies[col];
      out[col] = v;
      if (v !== null && v !== undefined && v !== '' && v !== 0) presentes = true;
    });
    var texte = espacesNormalises(out[field.colId]);
    if (presentes && texte) out[field.colId + SUFFIXE_CHOISI] = texte;
  }

  /**
   * Le sens inverse de `Types.coerceForWrite` : une ligne Grist telle qu'elle
   * arrive (`onRecord`, `fetchTable`) vers les valeurs que les champs rendent.
   *
   * > **L'écriture existait, la lecture non.** Chaque hôte qui ouvrait un
   * > formulaire sur une ligne existante la réécrivait pour lui : Atlas en a
   * > fait `valeurPourFormulaire`, la vue publiée ne l'a jamais fait — et
   * > montrait donc des champs vides sur une ligne pleine. Enregistrer vidait
   * > la ligne.
   *
   * Les dates sont le point délicat : Grist les garde en **secondes**. Une
   * `Date` est minuit UTC et se rend telle quelle (`AAAA-MM-JJ` en UTC) ; un
   * `DateTime` est un instant, qui se rend dans l'heure de la personne —
   * c'est ainsi que `coerceForWrite` le relira.
   */
  function valuesFromRecord(formDef, record) {
    var out = {};
    if (!record) return out;
    var sections = (formDef && formDef.sections) || [];
    for (var i = 0; i < sections.length; i++) {
      var fields = sections[i].fields || [];
      for (var j = 0; j < fields.length; j++) {
        var field = fields[j];
        if (!Object.prototype.hasOwnProperty.call(record, field.colId)) continue;
        var v = valueFromCell(field, record[field.colId]);
        if (v !== undefined) out[field.colId] = v;
      }
    }
    return out;
  }

  function deuxChiffres(n) { return (n < 10 ? '0' : '') + n; }

  /** Secondes Unix, millisecondes ou `Date` → `Date`, sinon `null`. */
  function versDate(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v === 'number' && isFinite(v)) {
      // 1e11 secondes tombe en l'an 5138, 1e11 millisecondes en 1973 : le seuil sépare sans ambiguïté.
      return new Date(Math.abs(v) < 1e11 ? v * 1000 : v);
    }
    var d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d;
  }

  function valueFromCell(field, raw) {
    if (raw === undefined || raw === null || raw === '') return undefined;
    var t = Types && Types.normalizeGristType ? Types.normalizeGristType(field.type) : field.type;
    if (t === 'Date' || t === 'DateTime') {
      var d = versDate(raw);
      if (!d) return undefined;
      if (t === 'Date') return d.toISOString().slice(0, 10);
      return d.getFullYear() + '-' + deuxChiffres(d.getMonth() + 1) + '-' + deuxChiffres(d.getDate()) +
        'T' + deuxChiffres(d.getHours()) + ':' + deuxChiffres(d.getMinutes());
    }
    if (t === 'Attachments') return raw;
    if (Array.isArray(raw)) {
      var items = (raw[0] === 'L' ? raw.slice(1) : raw);
      return items.length ? items.map(String) : undefined;
    }
    if (t === 'Bool') return raw === true || raw === 1 || String(raw).toLowerCase() === 'true';
    // Une référence vide vaut 0 côté Grist : ce n'est pas une ligne.
    if (t === 'Ref') return Number(raw) > 0 ? raw : undefined;
    return raw;
  }

  function mount(rootEl, formDef, bridge) {
    if (!rootEl) return null;
    bridge = bridge || {};
    var values = initialValues(formDef, bridge.values);
    // L'hôte peut demander d'ouvrir sur une étape : le compositeur montre
    // celle qu'on travaille, pas la première.
    var stepIndex = Number.isFinite(bridge.etapeDepart) ? Math.max(0, bridge.etapeDepart) : 0;
    // L'accueil n'est pas une etape : c'est l'ecran qu'on franchit pour entrer.
    // Le compositeur, lui, demande une etape precise — il a deja decide.
    var surAccueil = aUnAccueil(formDef) && !Number.isFinite(bridge.etapeDepart);
    // Le chrono part quand on commence vraiment, pas quand la page s'ouvre :
    // lire la presentation n'est pas repondre.
    var demarreA = surAccueil ? 0 : Date.now();
    var errorFields = [];
    // Vrai quand la personne vient d'essayer d'avancer ou d'envoyer : le focus va au résumé des erreurs.
    var aSignaler = false;
    var messagesErreur = {};
    var submitting = false;
    var submitError = '';
    var refRecords = bridge.refRecords || {};
    var jetonsEnrichi = {};
    // Questions dont la valeur vient de l'adresse de la page (shared/prefill.js).
    var verrouilles = Array.isArray(bridge.verrouilles) ? bridge.verrouilles : [];
    var libellesVerrou = bridge.libelles || {};
    // Un changement de champ redessine le formulaire : conditions, cascades et
    // filtres dynamiques en dependent. Mais pour un champ texte, `change` part
    // quand on le quitte — c'est-a-dire a l'instant ou l'on appuie sur
    // « Enregistrer ». Redessiner a ce moment remplacait le bouton entre
    // l'appui et le relachement : le navigateur n'emettait pas de clic, et il
    // fallait cliquer deux fois. Constate le 11/09/2026 dans la fiche d'Atlas,
    // en Grist reel. Au clavier, Tab perdait le focus pour la meme raison.
    //
    // Le rendu attend donc que le pointeur soit relache, passe au tour suivant
    // sinon, et rend le focus au champ qui l'avait.
    var renduEnAttente = false;
    var pointeurEnfonce = false;
    if (typeof rootEl.addEventListener === 'function') {
      rootEl.addEventListener('pointerdown', function () {
        var doc = rootEl.ownerDocument || (typeof document !== 'undefined' ? document : null);
        if (!doc || typeof doc.addEventListener !== 'function') return;
        pointeurEnfonce = true;
        // Sur le document : le doigt peut se lever hors du formulaire.
        doc.addEventListener('pointerup', relacherPointeur, { capture: true, once: true });
        doc.addEventListener('pointercancel', relacherPointeur, { capture: true, once: true });
      }, true);
    }
    var context = (SessionContext.emptyContext && SessionContext.emptyContext()) || {
      inGristWidget: false, canWriteNative: false, isLoggedIn: false, userEmail: '', groups: []
    };
    if (bridge.context) {
      Object.keys(bridge.context).forEach(function (k) { context[k] = bridge.context[k]; });
    }

    function loader() {
      if (typeof bridge.loadTable === 'function') return bridge.loadTable.bind(bridge);
      if (typeof window !== 'undefined' && window.GristBridge && window.GristBridge.loadTable) {
        return window.GristBridge.loadTable;
      }
      return null;
    }

    function resolveOptionsForField(field) {
      var base = optionsForField(field, formDef);
      var refTable = resolveRefTable(field);
      if (typeRef(field.type) && refTable && refRecords[refTable]) {
        var vis = field.options && field.options.visibleCol;
        base = choicesFromRefRecords(refRecords[refTable], vis);
      }
      var normalized = Array.isArray(base) ? base.map(normalizeOption) : [];
      if (field.cascade && field.cascade.parentField && field.cascade.parentRefCol && refTable && refRecords[refTable]) {
        normalized = filterCascadeOptions(
          normalized, refRecords[refTable], field.cascade.parentRefCol, values[field.cascade.parentField]
        );
      } else if (field.dynamicFilter && field.dynamicFilter.parentField && field.dynamicFilter.filterColumn &&
                 refTable && refRecords[refTable]) {
        var resolvedParent = resolveParentFilterValue(field, values, formDef, refRecords);
        normalized = filterDynamicOptions(
          normalized, refRecords[refTable], field.dynamicFilter.filterColumn, resolvedParent
        );
      }
      // L'ordre des choix que l'auteur a demandé — alphabétique pour une liste
      // de personnes, par exemple. Sans demande, l'ordre de la table.
      var ordre = field.options && field.options.sortOrder;
      if ((ordre === 'ascending' || ordre === 'descending') && normalized.length > 1) {
        normalized = normalized.slice().sort(function (a, b) {
          var c = String(a.label).localeCompare(String(b.label), 'fr', { sensitivity: 'base', numeric: true });
          return ordre === 'descending' ? -c : c;
        });
      }
      return normalized.length ? normalized : (optionsForField(field, formDef) || null);
    }

    /** Invalide valeurs Ref hors liste filtrée (cascade ou dynamicFilter). */
    function pruneInvalidFilteredValues() {
      (formDef.sections || []).forEach(function (sec) {
        (sec.fields || []).forEach(function (field) {
          if (!(field.cascade && field.cascade.parentField) &&
              !(field.dynamicFilter && field.dynamicFilter.parentField)) return;
          var cur = values[field.colId];
          if (cur == null || cur === '') return;
          var opts = resolveOptionsForField(field) || [];
          var ok = opts.some(function (o) { return sameRefValue(o.value, cur); });
          if (!ok) {
            values[field.colId] = typeRef(field.type) === 'RefList' ? [] : null;
          }
        });
      });
    }

    function planifierRendu() {
      renduEnAttente = true;
      if (!pointeurEnfonce) setTimeout(rendreEnAttente, 0);
    }

    function relacherPointeur() {
      pointeurEnfonce = false;
      // Apres le tour courant : le clic suit le relachement dans la meme tache.
      if (renduEnAttente) setTimeout(rendreEnAttente, 0);
    }

    function rendreEnAttente() {
      if (!renduEnAttente) return;
      renduEnAttente = false;
      // Le clic a lance l'envoi : son propre rendu fait foi.
      if (submitting) return;
      var doc = rootEl.ownerDocument || (typeof document !== 'undefined' ? document : null);
      var actif = doc && doc.activeElement;
      var idActif = actif && typeof rootEl.contains === 'function' && rootEl.contains(actif)
        ? actif.id : '';
      render();
      if (idActif && doc && typeof doc.getElementById === 'function') {
        var cible = doc.getElementById(idActif);
        if (cible && typeof cible.focus === 'function') cible.focus();
      }
    }

    /**
     * Arriver en haut de l'etape suivante.
     *
     * > **On passait a l'etape suivante en restant ou l'on etait** : au bas
     * > d'un ecran, devant la fin d'une liste de questions qu'on n'avait pas
     * > posees. Sur une enquete de quatorze etapes, chaque « Suivant »
     * > demandait de remonter a la main pour lire la premiere question.
     *
     * Le focus va au titre de l'etape : le defilement suit, et un lecteur
     * d'ecran annonce ou l'on vient d'arriver. `preventScroll` puis
     * `scrollIntoView` plutot qu'un `window.scrollTo` : le formulaire vit
     * tantot dans la page, tantot dans un cadre qui defile tout seul — c'est
     * au navigateur de trouver lequel remonter.
     */
    /**
     * Après un essai raté, le focus va au résumé des erreurs : un lecteur d'écran
     * l'annonce, et l'œil n'a pas à chercher la question fautive à des écrans de là.
     * Chaque lien du résumé amène à la question, et la met au focus.
     */
    function allerAuResume() {
      var resume = rootEl.querySelector('#resume-erreurs');
      if (!resume) return;
      var liens = resume.querySelectorAll('[data-aller-a]');
      for (var i = 0; i < liens.length; i++) (function (lien) {
        if (typeof lien.addEventListener !== 'function') return;
        lien.addEventListener('click', function (ev) {
          if (ev && ev.preventDefault) ev.preventDefault();
          var colId = lien.getAttribute('data-aller-a');
          var bloc = rootEl.querySelector('[data-colid="' + colId + '"]');
          var cible = bloc && bloc.querySelector('input:not([type="hidden"]), select, textarea, button');
          if (cible && cible.focus) cible.focus();
          if (bloc && bloc.scrollIntoView) bloc.scrollIntoView({ block: 'center', behavior: 'auto' });
        });
      }(liens[i]));
      try { resume.focus({ preventScroll: true }); } catch (e) { /* vieux navigateur */ }
      if (resume.scrollIntoView) resume.scrollIntoView({ block: 'start', behavior: 'auto' });
    }

    function remonterEnHaut() {
      var titre = rootEl.querySelector('.fr-accueil__titre') ||
        rootEl.querySelector('.fr-progression__titre') ||
        rootEl.querySelector('.fr-form__header') || rootEl.firstElementChild;
      if (!titre) return;
      // Le focus va au titre de l'etape : c'est lui qu'un lecteur d'ecran doit
      // annoncer. Mais l'oeil, lui, remonte jusqu'au bandeau : s'arreter au
      // titre poussait hors de l'ecran l'enseigne et l'avancement, c'est-a-dire
      // qui demande et combien il reste.
      try { titre.focus({ preventScroll: true }); } catch (e) { /* vieux navigateur */ }
      var haut = rootEl.querySelector('.fr-bandeau') || titre;
      if (typeof haut.scrollIntoView === 'function') {
        haut.scrollIntoView({ block: 'start', behavior: 'auto' });
      }
    }

    /**
     * Ce qui empeche de continuer : une reponse manquante, ou un format faux.
     * Chaque question en defaut garde son propre message.
     */
    function libelleDe(colId) {
      var sections = (formDef && formDef.sections) || [];
      for (var i = 0; i < sections.length; i++) {
        var fs = sections[i].fields || [];
        for (var j = 0; j < fs.length; j++) if (fs[j].colId === colId) return fs[j].label || colId;
      }
      return colId;
    }

    function erreursDeSaisie(fields, values) {
      messagesErreur = {};
      var colIds = validateRequired(fields, values);
      var api = saisiesApi();
      if (api) {
        fields.forEach(function (f) {
          var msg = api.validerBornes(f, values[f.colId], new Date());
          if (!msg) {
            var autre = api.apresDe(f);
            if (autre) msg = api.validerApres(f, values[f.colId], values[autre], libelleDe(autre));
          }
          if (msg) {
            messagesErreur[f.colId] = msg;
            if (colIds.indexOf(f.colId) === -1) colIds.push(f.colId);
          }
        });
      }
      validerFormats(fields, values).forEach(function (e) {
        messagesErreur[e.colId] = e.message;
        if (colIds.indexOf(e.colId) === -1) colIds.push(e.colId);
      });
      return colIds;
    }

    function render() {
      var sections = getVisibleSections(formDef, values, context);
      if (!sections.length) {
        rootEl.innerHTML = '<div class="fr-alert fr-alert--info"><p>Aucune section visible.</p></div>';
        return;
      }
      if (stepIndex >= sections.length) stepIndex = sections.length - 1;
      if (stepIndex < 0) stepIndex = 0;
      var section = sections[stepIndex];
      var fields = getVisibleFields(section, values, context);
      var isLast = stepIndex === sections.length - 1;
      var editId = bridge.editRowId || formDef.editRowId;
      var editHint = editId
        ? '<p class="fr-text--sm">Modification de la ligne #' + escapeHtml(editId) + '</p>'
        : '';

      // Avec une page d'accueil, c'est le bandeau qui porte le titre, sur tous
      // les ecrans ; sans elle, l'en-tete d'origine reste pose sur la premiere
      // etape, et les formulaires deja en service ne bougent pas.
      var avecAccueil = aUnAccueil(formDef);
      var bandeauHtml = avecAccueil ? renderBandeauHtml(formDef) : '';
      var headerHtml = (!avecAccueil && stepIndex === 0) ? renderHeaderHtml(formDef) : '';

      // Où j'en suis, et combien il reste : la première chose qu'on cherche en
      // ouvrant un questionnaire, et ce que l'enquête écrite à la main offrait
      // alors que le moteur ne le disait qu'en toutes lettres.
      var avancement = Math.round(((stepIndex + 1) / sections.length) * 100);
      var stepperHtml = '<nav class="fr-progression" aria-label="Progression">' +
        '<div class="fr-progression__piste"><span style="width:' + avancement + '%"></span></div>' +
        '<p class="fr-progression__etat">' +
        '<span>Étape ' + (stepIndex + 1) + ' sur ' + sections.length + '</span>' +
        '<span>' + avancement + ' %</span></p>' +
        '<h2 class="fr-progression__titre" tabindex="-1">' + escapeHtml(section.label) + '</h2>' +
        (section.description ? '<p class="fr-hint-text">' + escapeHtml(section.description) + '</p>' : '') +
        '</nav>';

      // Les échelles qui se suivent et partagent une matrice sont rendues
      // ensemble : l'échelle n'est annoncée qu'une fois, pas sous chaque ligne.
      var fieldsHtml = grouperParMatrice(fields).map(function (groupe) {
        if (groupe.matrice && groupe.fields.length > 1) {
          return renderMatrice(groupe, values, formDef, errorFields);
        }
        var f = groupe.fields[0];
        var opts = resolveOptionsForField(f);
        var html = verrouilles.indexOf(f.colId) !== -1
          ? renderVerrouille(f, values[f.colId], libellesVerrou[f.colId])
          : renderFieldHtml(f, values, opts, formDef);
        if (errorFields.indexOf(f.colId) !== -1) {
          // > **Le message doit tenir a sa question.** Pose seul entre deux
          // > blocs, il flotte : on le lit au-dessus de la question suivante et
          // > l'on corrige la mauvaise. La question en defaut et son message
          // > sont donc enfermes ensemble, et le bloc porte un filet rouge.
          html = '<div class="fr-champ--erreur">' + signalerErreurHtml(html, f.colId) +
            '<p class="fr-error-text" id="' + erreurId(f.colId) + '" data-error-for="' + escapeHtml(f.colId) + '">' +
            escapeHtml(messagesErreur[f.colId] || 'Ce champ est obligatoire.') + '</p></div>';
        }
        return html;
      }).join('');

      var errorHtml = submitError
        ? '<div class="fr-alert fr-alert--error" role="alert"><p>' + escapeHtml(submitError) + '</p></div>'
        : '';
      if (errorFields.length) errorHtml += resumeErreursHtml(errorFields, libelleDe);

      // La barre d'action reste sous les yeux, et le message d'erreur s'affiche
      // à côté du bouton : en haut d'un écran long, personne ne le voit.
      var navHtml = '<div class="fr-form__actions">' +
        ((stepIndex > 0 || avecAccueil)
          ? '<button type="button" class="fr-btn fr-btn--secondary" data-action="prev">Précédent</button>'
          : '<span></span>') +
        (isLast
          ? '<button type="button" class="fr-btn" data-action="submit"' + (submitting ? ' disabled' : '') + '>' +
            (submitting ? 'Envoi…' : (editId ? 'Enregistrer' : 'Envoyer')) + '</button>'
          : '<button type="button" class="fr-btn" data-action="next">Suivant</button>') +
        '</div>';

      if (surAccueil) {
        rootEl.innerHTML = '<form class="fr-form fr-form--accueil" novalidate>' +
          bandeauHtml + renderAccueilHtml(formDef) + '</form>';
        var cmd = rootEl.querySelector('[data-action="commencer"]');
        if (cmd && typeof cmd.addEventListener === 'function') {
          cmd.addEventListener('click', function () {
            surAccueil = false;
            demarreA = Date.now();
            render();
            remonterEnHaut();
          });
        }
        return;
      }

      rootEl.innerHTML = '<form class="fr-form" novalidate>' +
        bandeauHtml + editHint + headerHtml + stepperHtml + errorHtml + fieldsHtml + navHtml + '</form>';
      wireEvents(fields);
      if (aSignaler) { aSignaler = false; allerAuResume(); }
    }

    // Les cartes vivantes, par colonne : une carte ne se redessine pas.
    var cartes = {};
    // Les dessins, par colonne : le modele survit au re-rendu, pas le canevas.
    var dessins = {};
    // Les listes d'adresses vivantes, par colonne : on les detruit avant chaque
    // re-rendu, qui remplace le champ qu'elles habitent.
    var referentiels = {};

    /** Un curseur touché a répondu ; sa valeur s'affiche et se garde au redessin. */
    function brancherCurseurs() {
      var blocs = rootEl.querySelectorAll('[data-widget="curseur"]');
      for (var i = 0; i < blocs.length; i++) (function (bloc) {
        var curs = bloc.querySelector('input[type="range"]');
        var sortie = bloc.querySelector('.fr-curseur__valeur');
        var unite = bloc.getAttribute('data-unite') || '';
        var colId = bloc.getAttribute('data-colid');
        if (!curs || typeof curs.addEventListener !== 'function') return;
        function toucher() {
          curs.setAttribute('data-touche', '1');
          if (sortie) sortie.textContent = curs.value + (unite ? ' ' + unite : '');
          values[colId] = curs.value;
        }
        curs.addEventListener('input', toucher);
        var appuis = bloc.querySelectorAll('.fr-curseur__preset');
        for (var k = 0; k < appuis.length; k++) (function (b) {
          b.addEventListener('click', function () { curs.value = b.getAttribute('data-valeur'); toucher(); });
        }(appuis[k]));
      }(blocs[i]));
    }

    /** Des étiquettes libres : ajouter (Entrée, virgule, bouton), retirer (la croix de la puce). */
    function brancherEtiquettes(champsPage) {
      var blocs = rootEl.querySelectorAll('[data-widget="etiquettes"]');
      for (var i = 0; i < blocs.length; i++) (function (bloc) {
        var colId = bloc.getAttribute('data-colid');
        var champ = (champsPage || []).filter(function (f) { return f.colId === colId; })[0];
        var saisie = bloc.querySelector('input[name="' + colId + '__saisie"]');
        var liste = bloc.querySelector('ul');
        var ajouter = bloc.querySelector('[data-etiquette-ajouter]');
        var api = saisiesApi();
        if (!champ || !saisie || !api) return;
        function maj(nouvelle) {
          values[colId] = nouvelle;
          if (liste) liste.innerHTML = chipsEtiquettes(nouvelle);
        }
        function valider() {
          var plafond = champ.options && champ.options.maxSelected;
          maj(api.ajouterEtiquette(Array.isArray(values[colId]) ? values[colId] : [], saisie.value, { max: plafond }));
          saisie.value = '';
        }
        if (ajouter && typeof ajouter.addEventListener === 'function') ajouter.addEventListener('click', valider);
        if (typeof saisie.addEventListener === 'function') {
          saisie.addEventListener('keydown', function (ev) {
            if (ev && (ev.key === 'Enter' || ev.key === ',')) { ev.preventDefault(); valider(); }
          });
        }
        if (liste && typeof liste.addEventListener === 'function') {
          liste.addEventListener('click', function (ev) {
            var cible = ev && ev.target;
            var retirer = cible && typeof cible.getAttribute === 'function' ? cible.getAttribute('data-etiquette-retirer') : null;
            if (retirer !== null && retirer !== undefined) maj(api.retirerEtiquette(Array.isArray(values[colId]) ? values[colId] : [], retirer));
          });
        }
      }(blocs[i]));
    }

    /** Un compteur monte et descend d'un pas, sans sortir de ses bornes. */
    function brancherCompteurs() {
      var blocs = rootEl.querySelectorAll('[data-widget="compteur"]');
      for (var i = 0; i < blocs.length; i++) (function (bloc) {
        var champ = bloc.querySelector('input[type="number"]');
        var pas = Number(bloc.getAttribute('data-pas')) || 1;
        var boutons = bloc.querySelectorAll('[data-delta]');
        if (!champ) return;
        for (var k = 0; k < boutons.length; k++) (function (b) {
          if (typeof b.addEventListener !== 'function') return;
          b.addEventListener('click', function () {
            var delta = Number(b.getAttribute('data-delta')) || 0;
            var courant = Number(champ.value);
            var suivant = (Number.isFinite(courant) && champ.value !== '' ? courant : 0) + delta * pas;
            var min = champ.getAttribute('min');
            var max = champ.getAttribute('max');
            if (min !== null && min !== '' && suivant < Number(min)) suivant = Number(min);
            if (max !== null && max !== '' && suivant > Number(max)) suivant = Number(max);
            champ.value = String(Math.round(suivant * 1e6) / 1e6);
            values[bloc.getAttribute('data-colid')] = champ.value;
            if (typeof champ.dispatchEvent === 'function' && typeof Event === 'function') {
              champ.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });
        }(boutons[k]));
      }(blocs[i]));
    }

    function wireEvents(fields) {
      if (typeof rootEl.querySelectorAll !== 'function') return;
      brancherPlafonds();
      brancherCurseurs();
      brancherCompteurs();
      brancherEtiquettes(fields);
      brancherClassements(fields);
      brancherPositions(fields);
      brancherCartes(fields);
      brancherDessins();
      brancherReferentiels();
      var inputs = rootEl.querySelectorAll('input, select, textarea');
      for (var i = 0; i < inputs.length; i++) {
        // > **Un `change` redessine le formulaire, et le formulaire redessiné
        // > n'a plus la liste.** Sur un champ texte, `change` part quand on
        // > valide — c'est-à-dire sur Entrée, l'instant même où la recherche
        // > d'adresse se lance : la liste serait détruite avant d'arriver. Le
        // > champ gère sa propre valeur ; elle se relit au changement d'étape.
        if (typeof inputs[i].getAttribute === 'function' &&
            inputs[i].getAttribute('data-referentiel-champ') !== null) continue;
        if (typeof inputs[i].addEventListener === 'function') {
          inputs[i].addEventListener('change', function () {
            readSectionValues(rootEl, fields, values, verrouilles);
            pruneInvalidFilteredValues();
            planifierRendu();
          });
        }
      }
      var prevBtn = rootEl.querySelector('[data-action="prev"]');
      if (prevBtn && typeof prevBtn.addEventListener === 'function') {
        prevBtn.addEventListener('click', function () {
          readSectionValues(rootEl, fields, values, verrouilles);
          if (stepIndex === 0) surAccueil = true; else stepIndex -= 1;
          errorFields = []; render(); remonterEnHaut();
        });
      }
      var nextBtn = rootEl.querySelector('[data-action="next"]');
      if (nextBtn && typeof nextBtn.addEventListener === 'function') {
        nextBtn.addEventListener('click', function () {
          readSectionValues(rootEl, fields, values, verrouilles);
          var missing = erreursDeSaisie(fields, values);
          // Une reponse manquante ne fait pas changer d'etape : on remonte
          // quand meme, sinon le message reste hors de l'ecran.
          if (missing.length) { errorFields = missing; aSignaler = true; render(); return; }
          errorFields = []; stepIndex += 1; render(); remonterEnHaut();
        });
      }
      var submitBtn = rootEl.querySelector('[data-action="submit"]');
      if (submitBtn && typeof submitBtn.addEventListener === 'function') {
        submitBtn.addEventListener('click', function () {
          readSectionValues(rootEl, fields, values, verrouilles);
          var missing = erreursDeSaisie(fields, values);
          if (missing.length) { errorFields = missing; aSignaler = true; render(); return; }
          errorFields = []; submitting = true; submitError = ''; render();
          var resolveAtt = Attachments.resolveAttachmentFields
            ? Attachments.resolveAttachmentFields(formDef, values, {
                // Un hôte qui sait envoyer lui-même le fait : c'est le seul
                // chemin possible hors du navigateur (application empaquetée).
                uploadFile: bridge.uploadFile,
                getAccessToken: bridge.getAccessToken ||
                  (typeof window !== 'undefined' && window.grist && window.grist.docApi
                    ? function (opts) { return window.grist.docApi.getAccessToken(opts); }
                    : null),
                fetch: bridge.fetch
              })
            : Promise.resolve(values);
          Promise.resolve(resolveAtt).then(function () {
            var enCreation = !(bridge.editRowId || formDef.editRowId);
            var data = collectSubmitData(formDef, values, context,
              { creation: enCreation, demarreA: demarreA });
            return defaultSubmit(bridge, formDef, data);
          }).then(function () {
            memoriserDernieres();
            submitting = false;
            rootEl.innerHTML = renderSuccessHtml(formDef);
          }, function (err) {
            submitting = false;
            submitError = (err && err.message) || 'Erreur lors de l\'envoi.';
            render();
          });
        });
      }
    }

    /**
     * Le plafond se voit, et se tient.
     *
     * « Choisissez jusqu'a 5 propositions » : laisser cocher la sixieme pour
     * refuser ensuite serait un piege. Les cases non cochees se grisent quand
     * le compte y est, et le compteur dit ou l'on en est.
     */
    function brancherPlafonds() {
      var groupes = rootEl.querySelectorAll('[data-widget="multiselect"][data-max]');
      for (var i = 0; i < groupes.length; i++) (function (groupe) {
        var max = parseInt(groupe.getAttribute('data-max'), 10);
        var cases = groupe.querySelectorAll('input[type="checkbox"]');
        var compteur = groupe.querySelector('.fr-plafond');
        function tenir() {
          var n = 0, j;
          for (j = 0; j < cases.length; j++) if (cases[j].checked) n++;
          for (j = 0; j < cases.length; j++) {
            if (!cases[j].checked) cases[j].disabled = n >= max;
          }
          if (compteur) compteur.textContent = n + ' sur ' + max + ' maximum';
        }
        for (var k = 0; k < cases.length; k++) {
          if (typeof cases[k].addEventListener === 'function') cases[k].addEventListener('change', tenir);
        }
        tenir();
      }(groupes[i]));
    }

    /**
     * Les deux regles d'un classement, tenues a la saisie.
     *
     * Une place ne se donne qu'une fois — c'est le propre d'un groupe de
     * boutons radio. Une proposition n'en prend qu'une : cocher sa deuxieme
     * place lui retire la premiere, au lieu de la laisser deux fois classee.
     * Et recliquer une case la libere, ce qu'un radio ne fait pas tout seul.
     */
    function brancherClassements(fields) {
      var blocs = rootEl.querySelectorAll('[data-widget="classement"]');
      for (var i = 0; i < blocs.length; i++) (function (bloc) {
        var colId = bloc.getAttribute('data-colid');
        var cases = bloc.querySelectorAll('input[type="radio"]');
        for (var k = 0; k < cases.length; k++) {
          if (typeof cases[k].addEventListener !== 'function') continue;
          // `click` et non `change` : il faut voir le clic sur une case deja cochee.
          cases[k].addEventListener('click', function () {
            var moi = this;
            if (moi.getAttribute('data-etait-coche') === 'oui') {
              moi.checked = false;
              moi.removeAttribute('data-etait-coche');
            } else {
              for (var j = 0; j < cases.length; j++) {
                // la meme proposition ailleurs : elle quitte son autre place
                if (cases[j] !== moi && cases[j].value === moi.value) cases[j].checked = false;
                cases[j].removeAttribute('data-etait-coche');
              }
              moi.setAttribute('data-etait-coche', 'oui');
            }
            readSectionValues(rootEl, fields, values, verrouilles);
            planifierRendu();
          });
          if (cases[k].checked) cases[k].setAttribute('data-etait-coche', 'oui');
        }
      }(blocs[i]));
    }

    /**
     * Les cartes de l'etape, montees une fois chacune.
     *
     * Le moteur redessine l'etape a chaque reponse ; une carte, elle, ne se
     * redessine pas : on la garde par colonne tant que la question est a
     * l'ecran, et on la jette en quittant l'etape. Sans cela, chaque clic en
     * aurait recree une, et la position se serait perdue a chaque fois.
     */
    /**
     * Les canevas de dessin.
     *
     * > **Le formulaire se redessine a chaque reponse** — conditions, cascades,
     * > filtres. Un canevas monte a l'instant d'avant est alors remplace par un
     * > canevas vierge. Les traits sont donc gardes ici, dans leur modele
     * > (fractions de 0 a 1), et remis au nouveau canevas : on ne perd pas son
     * > croquis parce qu'on a change d'avis sur une case a cocher.
     *
     * Le fichier produit est depose dans le champ fichier cache par un
     * `DataTransfer` : la lecture, le plafond du nombre de pieces jointes et le
     * televersement a l'envoi restent ceux des fichiers, sans un cas de plus.
     */
    function brancherDessins() {
      var hotes = rootEl.querySelectorAll('.fr-dessin-hote[data-dessin-de]');
      for (var i = 0; i < hotes.length; i++) (function (hote) {
        var colId = hote.getAttribute('data-dessin-de');
        if (dessins[colId] && dessins[colId].hote === hote) return;
        if (dessins[colId] && dessins[colId].vue) dessins[colId].vue.detruire();
        var api = typeof window !== 'undefined' ? window.FormDessin : null;
        if (!api || typeof api.monter !== 'function') return;
        var couleurs = null;
        try { couleurs = JSON.parse(hote.getAttribute('data-couleurs')); } catch (e) { couleurs = null; }
        var garde = dessins[colId] || {};
        api.monter(hote, {
          usage: hote.getAttribute('data-usage'),
          fond: hote.getAttribute('data-fond') || '',
          hauteur: parseFloat(hote.getAttribute('data-hauteur')) || 0,
          trait: parseFloat(hote.getAttribute('data-trait')) || 0,
          couleurs: couleurs || null,
          traits: garde.traits || [],
          nom: colId,
          libelle: 'Zone de dessin',
          onChange: function (file, dataUrl, traits) {
            var entree = dessins[colId] || {};
            entree.traits = traits;
            dessins[colId] = entree;
            deposerFichier(colId, file);
          }
        }).then(function (vue) {
          var attente = hote.querySelector('.fr-dessin__attente');
          if (attente) attente.remove();
          dessins[colId] = { hote: hote, vue: vue, traits: garde.traits || [] };
          // Un dessin repris apres un re-rendu doit redeposer son fichier :
          // le champ cache, lui, a bien ete recree vide.
          if (garde.traits && garde.traits.length && vue.exporter) {
            vue.exporter().then(function (res) { deposerFichier(colId, res.file); });
          }
        }).catch(function () {
          var attente = hote.querySelector('.fr-dessin__attente');
          if (attente) attente.textContent = 'La zone de dessin n’a pas pu être chargée.';
        });
      }(hotes[i]));
    }

    /**
     * Les champs d'adresse : brancher la liste de suggestions.
     *
     * Le champ est détruit et recréé à chaque rendu ; la liste, ses minuteurs et
     * sa requête en vol, eux, ne le sont pas d'eux-mêmes. On les détruit donc
     * tous avant de rebrancher ceux que le rendu a remis à l'écran — sans cela,
     * une réponse arrivée trop tard écrirait dans un champ qui n'existe plus.
     *
     * Sans module (hôte qui ne l'embarque pas) ou hors navigateur, rien n'est
     * branché : le champ reste un champ texte.
     */
    function brancherReferentiels() {
      Object.keys(referentiels).forEach(function (cle) {
        referentiels[cle].detruire();
        delete referentiels[cle];
      });
      var api = referentielApi();
      if (!api || typeof api.monter !== 'function' || typeof document === 'undefined') return;
      var hotes = rootEl.querySelectorAll('.fr-referentiel[data-referentiel-de]');
      for (var i = 0; i < hotes.length; i++) (function (hote) {
        var colId = hote.getAttribute('data-referentiel-de');
        var champ = hote.querySelector('input[data-referentiel-champ]');
        var def = trouverChamp(colId);
        if (!champ || !def) return;
        var annexes = colonnesDe(def).annexes || {};
        referentiels[colId] = api.monter(champ, {
          source: hote.getAttribute('data-source'),
          declenchement: hote.getAttribute('data-declenchement'),
          hote: hote,
          etat: hote.querySelector('.fr-referentiel__etat'),
          bouton: hote.querySelector('.fr-referentiel__bouton'),
          onTexte: function (texte) {
            values[colId] = texte;
            // Le texte a bougé : l'adresse choisie n'est plus celle qu'il dit.
            var choisi = values[colId + SUFFIXE_CHOISI];
            if (choisi !== undefined && espacesNormalises(texte) !== choisi) {
              delete values[colId + SUFFIXE_CHOISI];
              Object.keys(annexes).forEach(function (cle) {
                if (annexes[cle]) delete values[annexes[cle]];
              });
            }
          },
          onChoisir: function (s) {
            values[colId] = s.libelle;
            values[colId + SUFFIXE_CHOISI] = espacesNormalises(s.libelle);
            Object.keys(annexes).forEach(function (cle) {
              if (annexes[cle]) values[annexes[cle]] = s[cle] === undefined ? null : s[cle];
            });
          }
        });
      }(hotes[i]));
    }

    /** Un champ du formulaire, par sa colonne. */
    function trouverChamp(colId) {
      var sections = (formDef && formDef.sections) || [];
      for (var i = 0; i < sections.length; i++) {
        var fields = sections[i].fields || [];
        for (var j = 0; j < fields.length; j++) {
          if (fields[j].colId === colId) return fields[j];
        }
      }
      return null;
    }

    /** Poser un fichier produit dans le champ cache, comme s'il avait ete choisi. */
    function deposerFichier(colId, file) {
      var champ = rootEl.querySelector('input[type="file"][name="' + colId + '"]');
      if (!champ) return;
      try {
        var dt = new DataTransfer();
        if (file) dt.items.add(file);
        champ.files = dt.files;
      } catch (e) {
        // Vieux navigateur sans DataTransfer : la valeur passe par l'etat.
        values[colId] = file ? [file] : null;
      }
      values[colId] = file ? [file] : null;
    }

    function brancherCartes(fields) {
      brancherCartesIllustrees();
      var hotes = rootEl.querySelectorAll('.fr-carte[data-carte-de]');
      for (var i = 0; i < hotes.length; i++) (function (hote) {
        var colId = hote.getAttribute('data-carte-de');
        if (cartes[colId] && cartes[colId].hote === hote) return;
        if (cartes[colId]) { cartes[colId].vue.detruire(); delete cartes[colId]; }
        var carteApi = typeof window !== 'undefined' ? window.FormCarte : null;
        if (!carteApi || typeof carteApi.monter !== 'function') return;
        var centre = null;
        try { centre = JSON.parse(hote.getAttribute('data-centre')); } catch (e) { centre = null; }
        var zoom = parseFloat(hote.getAttribute('data-zoom'));
        carteApi.monter(hote, {
          type: hote.getAttribute('data-type'),
          valeur: values[colId],
          centre: centre || undefined,
          zoom: Number.isFinite(zoom) ? zoom : undefined,
          fond: hote.getAttribute('data-fond'),
          onChange: function (wkt) {
            values[colId] = wkt;
            var champ = rootEl.querySelector('input[name="' + colId + '"]');
            if (champ) champ.value = wkt;
            var champGeo = fields.filter(function (f) { return f.colId === colId; })[0];
            if (champGeo) declencherEnrichissement(champGeo, wkt);
          }
        }).then(function (vue) {
          var attente = hote.querySelector('.fr-carte__attente');
          if (attente) attente.remove();
          cartes[colId] = { hote: hote, vue: vue };
        }).catch(function (e) {
          var attente = hote.querySelector('.fr-carte__attente');
          if (attente) {
            attente.textContent = 'La carte n\u2019a pas pu \u00eatre charg\u00e9e. ' +
              'Vous pouvez relever votre position ou saisir le lieu ci-dessous.';
          }
        });
      }(hotes[i]));
    }

    /**
     * Montrer, dans la question, la proposition qu'un repere designe.
     *
     * On ne coche pas a sa place : un repere situe, il ne decide pas. La ligne
     * se signale le temps qu'on la trouve, et defile dans l'ecran si elle en
     * etait sortie — une liste de cinq propositions sous une carte ne tient pas
     * toujours dans un telephone.
     */
    function montrerOption(hoteCarte, option) {
      var groupe = hoteCarte.closest ? hoteCarte.closest('.fr-input-group, .fr-fieldset') : null;
      var portee = groupe && groupe.parentNode ? groupe.parentNode : rootEl;
      var cibles = portee.querySelectorAll('[data-option]');
      var vise = null;
      for (var i = 0; i < cibles.length; i++) {
        var est = cibles[i].getAttribute('data-option') === String(option);
        cibles[i].classList.toggle('est-designe', est);
        if (est) vise = cibles[i];
      }
      if (vise && typeof vise.scrollIntoView === 'function') {
        vise.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }

    /**
     * Les cartes qui illustrent, et ou l'on ne repond pas.
     *
     * Meme carte, meme fond, memes reperes qu'Atlas — mais aucun clic n'y
     * ecrit : elle est la pour qu'on sache de quoi parle la question.
     */
    function brancherCartesIllustrees() {
      var hotes = rootEl.querySelectorAll('.fr-carte[data-carte-illustre]');
      for (var i = 0; i < hotes.length; i++) (function (hote) {
        var cle = 'illustration:' + hote.getAttribute('data-carte-illustre');
        if (cartes[cle] && cartes[cle].hote === hote) return;
        if (cartes[cle]) { cartes[cle].vue.detruire(); delete cartes[cle]; }
        var carteApi = typeof window !== 'undefined' ? window.FormCarte : null;
        if (!carteApi || typeof carteApi.montrer !== 'function') return;
        var centre = null, reperes = [];
        try { centre = JSON.parse(hote.getAttribute('data-centre')); } catch (e) { centre = null; }
        try { reperes = JSON.parse(hote.getAttribute('data-reperes')) || []; } catch (e) { reperes = []; }
        var zoom = parseFloat(hote.getAttribute('data-zoom'));
        carteApi.montrer(hote, {
          centre: centre || undefined,
          zoom: Number.isFinite(zoom) ? zoom : undefined,
          fond: hote.getAttribute('data-fond'),
          reperes: reperes,
          // Toucher un repere montre la proposition qu'il designe : sans cela,
          // on a une carte d'un cote, une liste de l'autre, et c'est au
          // repondant de faire le lien.
          onRepere: function (option) { montrerOption(hote, option); }
        }).then(function (vue) {
          var attente = hote.querySelector('.fr-carte__attente');
          if (attente) attente.remove();
          cartes[cle] = { hote: hote, vue: vue };
        }).catch(function () {
          var attente = hote.querySelector('.fr-carte__attente');
          if (attente) attente.textContent = 'La carte n\u2019a pas pu \u00eatre charg\u00e9e.';
        });
      }(hotes[i]));
    }

    /**
     * « Utiliser ma position » : le geste attendu sur un telephone.
     *
     * Le navigateur demande l'autorisation ; un refus n'est pas une panne, on
     * le dit et la saisie a la main reste possible. La geometrie est ecrite en
     * WKT, qui est ce qu'Atlas et QGIS lisent d'une colonne texte.
     */
    /**
     * Un point a été posé (carte, position du navigateur, saisie à la main) :
     * compléter les colonnes que la question désigne.
     *
     * Les anciennes valeurs partent d'abord — celles d'un autre point ne
     * décrivent pas celui-ci — puis la réponse la plus récente gagne : une
     * réponse arrivée après un autre point n'est plus la bonne.
     */
    function declencherEnrichissement(field, wkt) {
      var api = enrichirApi();
      if (!api) return;
      var colonnes = api.colonnesDe(field);
      var cles = Object.keys(colonnes);
      if (!cles.length) return;
      var clef = '__enrichi_' + field.colId;
      var jeton = (jetonsEnrichi[field.colId] || 0) + 1;
      jetonsEnrichi[field.colId] = jeton;
      cles.forEach(function (sens) { values[colonnes[sens]] = null; });
      var promesse = enrichirChamp(field, wkt, { fetch: bridge.fetch });
      if (!promesse) { values[clef] = ''; afficherEtatLieu(field.colId, ''); return; }
      values[clef] = 'Recherche des informations du lieu\u2026';
      afficherEtatLieu(field.colId, values[clef]);
      promesse.then(function (r) {
        if (jetonsEnrichi[field.colId] !== jeton) return;
        Object.keys(r.valeurs).forEach(function (col) { values[col] = r.valeurs[col]; });
        values[clef] = r.phrase;
        afficherEtatLieu(field.colId, r.phrase);
      }, function () {
        if (jetonsEnrichi[field.colId] !== jeton) return;
        values[clef] = 'Les informations du lieu n\u2019ont pas pu \u00eatre compl\u00e9t\u00e9es.';
        afficherEtatLieu(field.colId, values[clef]);
      });
    }

    function afficherEtatLieu(colId, texte) {
      var bloc = rootEl.querySelector('[data-widget="geo"][data-colid="' + colId + '"]');
      var etat = bloc && bloc.querySelector('.fr-geo__etat');
      if (etat) etat.textContent = texte;
    }

    function brancherPositions(champsPage) {
      var blocs = rootEl.querySelectorAll('[data-widget="geo"]');
      for (var i = 0; i < blocs.length; i++) (function (bloc) {
        var bouton = bloc.querySelector('.fr-geo__ici');
        var champ = bloc.querySelector('input[type="text"]');
        var etat = bloc.querySelector('.fr-geo__etat');
        var champGeo = (champsPage || []).filter(function (f) { return f.colId === bloc.getAttribute('data-colid'); })[0];
        if (champGeo && champ && typeof champ.addEventListener === 'function') {
          champ.addEventListener('change', function () { declencherEnrichissement(champGeo, champ.value); });
        }
        if (!bouton || typeof bouton.addEventListener !== 'function') return;
        bouton.addEventListener('click', function () {
          var geo = typeof navigator !== 'undefined' && navigator.geolocation;
          if (!geo) { if (etat) etat.textContent = 'Ce navigateur ne sait pas donner votre position.'; return; }
          if (etat) etat.textContent = 'Recherche de votre position\u2026';
          geo.getCurrentPosition(function (pos) {
            var lon = Math.round(pos.coords.longitude * 1e6) / 1e6;
            var lat = Math.round(pos.coords.latitude * 1e6) / 1e6;
            champ.value = 'POINT(' + lon + ' ' + lat + ')';
            if (etat) etat.textContent = 'Position relev\u00e9e \u00e0 ' + Math.round(pos.coords.accuracy) + ' m pr\u00e8s.';
            if (typeof champ.dispatchEvent === 'function' && typeof Event === 'function') {
              champ.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, function () {
            if (etat) etat.textContent = 'Position refus\u00e9e ou indisponible \u2014 vous pouvez la saisir \u00e0 la main.';
          }, { enableHighAccuracy: true, timeout: 15000 });
        });
      }(blocs[i]));
    }

    /**
     * Les valeurs de départ : ce qu'une question montre avant que la personne n'y
     * touche. Elles ne passent jamais devant une valeur déjà donnée (adresse de la
     * page, ligne qu'on modifie), et ne s'appliquent pas en modification.
     */
    var departsAppliques = false;
    function cleDerniere(field) { return 'fr-forms:' + (formDef.id || '') + ':' + field.colId; }
    function derniereSaisie(field) {
      try {
        if (typeof localStorage === 'undefined') return undefined;
        var v = localStorage.getItem(cleDerniere(field));
        return v === null ? undefined : JSON.parse(v);
      } catch (e) { return undefined; }
    }
    function memoriserDernieres() {
      var api = saisiesApi();
      if (!api) return;
      (formDef.sections || []).forEach(function (s) {
        (s.fields || []).forEach(function (f) {
          var d = api.departDe(f);
          if (!d || d.source !== 'derniere') return;
          var v = values[f.colId];
          if (v === undefined || v === null || v === '') return;
          try { if (typeof localStorage !== 'undefined') localStorage.setItem(cleDerniere(f), JSON.stringify(v)); } catch (e) { /* stockage refusé */ }
        });
      });
    }
    function appliquerDeparts(tardif) {
      var api = saisiesApi();
      if (!api || bridge.editRowId || formDef.editRowId) return;
      (formDef.sections || []).forEach(function (s) {
        (s.fields || []).forEach(function (f) {
          if (!api.departDe(f) || api.departTardif(f) !== tardif) return;
          var courant = values[f.colId];
          if (courant !== undefined && courant !== null && courant !== '') return;
          var v = api.valeurDepart(f, { now: new Date(), email: context.userEmail, derniere: derniereSaisie });
          if (v !== undefined) values[f.colId] = v;
        });
      });
    }

    function boot() {
      appliquerDeparts(false);
      var load = loader();
      var tables = collectRefTableIds(formDef);
      var aud = SessionContext.audienceConfig ? SessionContext.audienceConfig(formDef) : { mode: 'none', probe: false };
      if (SessionContext.detectInGristWidget) {
        context.inGristWidget = SessionContext.detectInGristWidget();
        if (context.inGristWidget && !context.userEmail) context.isLoggedIn = true;
      }

      function afterContext(ctx) {
        if (ctx) {
          Object.keys(ctx).forEach(function (k) { context[k] = ctx[k]; });
        }
        appliquerDeparts(true);
        if (!load || !tables.length) { render(); return; }
        Promise.all(tables.map(function (t) {
          if (refRecords[t]) return Promise.resolve();
          return Promise.resolve(load(t)).then(function (rows) {
            refRecords[t] = Array.isArray(rows) ? rowsToColumnar(rows) : rows;
          }, function () {});
        })).then(function () {
          bridge.refRecords = refRecords;
          render();
        });
      }

      var needsAsyncProbe = !bridge.skipProbe && (
        !!bridge.getUserEmail ||
        aud.mode === 'bind' ||
        aud.probe ||
        !!bridge.forceProbe
      );

      if (!needsAsyncProbe) {
        afterContext(bridge.context || context);
        return;
      }

      var probeFn = SessionContext.probe || function () { return Promise.resolve(context); };
      var probeBridge = {
        loadTable: load,
        listTables: bridge.listTables ||
          (typeof window !== 'undefined' && window.grist && window.grist.docApi
            ? function () { return window.grist.docApi.listTables(); } : null),
        addRow: bridge.addRow || (typeof window !== 'undefined' && window.GristBridge && window.GristBridge.addRow
          ? window.GristBridge.addRow : null),
        deleteRow: bridge.deleteRow || (typeof window !== 'undefined' && window.GristBridge && window.GristBridge.deleteRow
          ? window.GristBridge.deleteRow : null),
        getUserEmail: bridge.getUserEmail || null
      };
      Promise.resolve(probeFn(probeBridge, formDef, bridge.context ? { forceContext: Object.assign({}, context, bridge.context) } : {}))
        .then(afterContext, function () { afterContext(context); });
    }

    boot();
    return { getValues: function () { return values; }, getContext: function () { return context; }, render: render };
  }

  return {
    evaluateCondition: evaluateCondition,
    evaluateRule: evaluateRule,
    isSectionVisible: isSectionVisible,
    isFieldVisible: isFieldVisible,
    collectSubmitData: collectSubmitData,
    filterCascadeOptions: filterCascadeOptions,
    filterDynamicOptions: filterDynamicOptions,
    resolveParentFilterValue: resolveParentFilterValue,
    escapeHtml: escapeHtml,
    renderFieldHtml: renderFieldHtml,
    renderHeaderHtml: renderHeaderHtml,
    renderBandeauHtml: renderBandeauHtml,
    renderAccueilHtml: renderAccueilHtml,
    aUnAccueil: aUnAccueil,
    renderSuccessHtml: renderSuccessHtml,
    valuesFromRecord: valuesFromRecord,
    // Ce que le moteur sait rendre, dit par lui-même : une page de couverture
    // ou un compositeur n'ont pas à en tenir une copie, qui vieillirait.
    WIDGETS: Object.keys(WIDGET_RENDERERS),
    KINDS: ['echelle', 'choix_autre', 'classement', 'geometrie', 'referentiel'],
    VALEUR_NON_CONCERNE: VALEUR_NON_CONCERNE,
    echelleDe: echelleDe,
    grouperParMatrice: grouperParMatrice,
    enrichirChamp: enrichirChamp,
    mount: mount
  };
}));

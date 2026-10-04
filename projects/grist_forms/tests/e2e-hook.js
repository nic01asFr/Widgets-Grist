/*
 * e2e-hook.js — le harnais d'essai du compositeur.
 *
 * > **Il ne part pas avec le widget.** Il ecoute les messages du parent et
 * > execute des actions qui ecrivent dans le document : embarque dans
 * > `builder.html`, il pesait mille cent lignes sur chaque chargement et
 * > offrait cette prise a n'importe quelle page qui enchasse le widget.
 *
 * `builder.html` ne le charge que sur `?e2e=1`. Il s'appuie sur les fonctions
 * du compositeur, qui vivent dans la portee globale de la page : ce fichier se
 * charge donc apres elles, et pas comme un module.
 */
/** Hook E2E : ?e2e=1 ou widget connecté à Grist (postMessage parent). */
(function installE2EHook() {
  var e2eByUrl = false;
  try { e2eByUrl = /([?&])e2e=1(?:&|$)/.test(location.search || ''); } catch (e) { /* ignore */ }

  async function runE2ECreateGrist() {
    try {
      if (S.isDemo) return { ok: false, error: 'Mode démo — pas de Grist' };
      applyTemplate('satisfaction');
      await saveForm();
      const tableId = S.currentDef && S.currentDef.tableId;
      const cols = (S.columnsByTable[tableId] || []).map(c => c.colId + ':' + c.type);
      const formRow = S.forms.find(f => f.FormId === S.currentDef.id);
      return {
        ok: true,
        tableId,
        columns: cols,
        formId: S.currentDef.id,
        formRowId: formRow && formRow.id,
        formsCount: S.forms.length,
        statut: formRow && formRow.Statut
      };
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err) };
    }
  }

  /** Contact + champ Fichier(s) → ensureSchema Attachments. */
  async function runE2ECreateWithFile() {
    try {
      if (S.isDemo) return { ok: false, error: 'Mode démo — pas de Grist' };
      applyTemplate('contact');
      addField(0);
      const fi = (S.currentDef.sections[0].fields || []).length - 1;
      onFieldTypeKeyChange(0, fi, 'file');
      onFieldInput(0, fi, 'label', 'Piece jointe');
      onFieldLabelBlur(0, fi);
      await saveForm();
      const tableId = S.currentDef && S.currentDef.tableId;
      const cols = (S.columnsByTable[tableId] || []).map(c => c.colId + ':' + c.type);
      const sm = SurveyProject.formDefToSurveyManifest(S.currentDef);
      const smTypes = ((sm.sections[0] || {}).questions || []).map(q => q.colId + ':' + q.type);
      return {
        ok: true,
        tableId,
        columns: cols,
        smTypes: smTypes,
        hasAttachmentsCol: cols.some(c => /Attachments/.test(c)),
        formId: S.currentDef.id
      };
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err) };
    }
  }

  /** Parcours MANUAL_TEST §4–5 : audience + publish + republish + fill. */
  async function runE2ELiveAudiencePublish() {
    const report = { steps: [] };
    function note(name, data) { report.steps.push(Object.assign({ name: name }, data || {})); }
    try {
      if (S.isDemo) return { ok: false, error: 'Mode démo — pas de Grist', report };

      applyTemplate('satisfaction');
      const def = S.currentDef;
      def.title = 'Validation live audience ' + new Date().toISOString().slice(0, 16).replace('T', ' ');
      note('template', { title: def.title, tableId: def.tableId });

      const aud = ensureAudience(def);
      onAudienceInput('mode', 'bind');
      onAudienceInput('tableId', 'Contacts');
      applyAudienceColumnDefaults(aud, true);
      aud.probe = true;
      await applyProbeEmailSetup(aud);
      const probeCol = (S.columnsByTable.Contacts || []).find(c => c.colId === aud.emailCol);
      note('audience', {
        audience: Object.assign({}, aud),
        probeConfigured: !!(probeCol && AudienceSetup && AudienceSetup.isProbeTriggerConfigured(probeCol))
      });

      addField(0);
      const fi = def.sections[0].fields.length - 1;
      onFieldInput(0, fi, 'label', 'Bloc réservé Agents');
      onFieldLabelBlur(0, fi);
      onFieldConditionToggle(0, fi, true);
      onFieldRule(0, fi, 0, 'field', 'audience:group');
      onFieldRule(0, fi, 0, 'operator', 'in');
      onFieldRule(0, fi, 0, 'value', 'Agents');
      note('condition', { field: def.sections[0].fields[fi].colId, condition: def.sections[0].fields[fi].condition });

      await saveForm();
      const row = S.forms.find(f => f.FormId === def.id);
      let parsed = null;
      try { parsed = JSON.parse(row && row.Def); } catch (e) { /* ignore */ }
      note('save', {
        formRowId: row && row.id,
        hasAudience: parsed && parsed.audience && parsed.audience.mode === 'bind',
        hasAgentCondition: !!(parsed && parsed.sections && parsed.sections[0] && parsed.sections[0].fields &&
          parsed.sections[0].fields.some(f => f.condition && (f.condition.source === 'audience' ||
            String(f.condition.field || '').indexOf('audience.') === 0 ||
            (f.condition.rules || []).some(r => r.source === 'audience'))))
      });

      S.publishLog = [];
      await publishForm();
      const row1 = S.forms.find(f => f.FormId === def.id);
      note('publish1', {
        version: row1 && row1.Version,
        statut: row1 && row1.Statut,
        sectionRef: row1 && row1.PublishedSectionRef,
        log: S.publishLog.slice()
      });

      const titleV1 = def.title;
      def.title = titleV1 + ' — republish';
      await saveForm();
      S.publishLog = [];
      await publishForm();
      const row2 = S.forms.find(f => f.FormId === def.id);
      note('publish2', {
        version: row2 && row2.Version,
        title: def.title,
        log: S.publishLog.slice()
      });

      const values = { Note: 'Satisfait', Commentaire: 'Test live validation', Recontact: false };
      const data = FormEngine.collectSubmitData(def, values, SessionContext.emptyContext ? SessionContext.emptyContext() : {});
      await GristBridge.addRow(def.tableId, data);
      const rows = await GristBridge.loadTable(def.tableId);
      const last = rows && rows.length ? rows[rows.length - 1] : null;
      note('fill', { tableId: def.tableId, rowsCount: (rows || []).length, lastRow: last });

      const bundleHasSession = (S.publishLog.join('\n') + ' ' + (row2 && row2.Def || '')).indexOf('session-context') !== -1 ||
        document.documentElement.innerHTML.indexOf('SessionContext') !== -1;

      return {
        ok: true,
        report,
        formId: def.id,
        tableId: def.tableId,
        version: row2 && row2.Version,
        publishedSectionRef: row2 && row2.PublishedSectionRef,
        bundleHasSession: bundleHasSession
      };
    } catch (err) {
      return {
        ok: false,
        error: (err && err.message) || String(err),
        report,
        log: S.publishLog.slice()
      };
    }
  }

  function e2eRowsToColumnar(rows, cols) {
    var columnar = { id: [] };
    (cols || []).forEach(function (c) { columnar[c] = []; });
    (rows || []).forEach(function (r) {
      columnar.id.push(r.id);
      (cols || []).forEach(function (c) { columnar[c].push(r[c]); });
    });
    return columnar;
  }

  function e2eGetSelectOptions(mountEl, fieldName) {
    var sel = mountEl.querySelector('[name="' + fieldName + '"]');
    if (!sel) return [];
    return [...sel.querySelectorAll('option')].map(function (o) { return o.value; }).filter(Boolean);
  }

  async function e2eMountPreview(def, refRecords, interactions) {
    goStep('preview');
    await new Promise(function (r) { setTimeout(r, 400); });
    var mountEl = document.getElementById('preview-mount');
    if (!mountEl) throw new Error('preview-mount introuvable');
    FormEngine.mount(mountEl, def, {
      refRecords: refRecords,
      submit: function () { return Promise.resolve(); },
      skipProbe: true
    });
    await new Promise(function (r) { setTimeout(r, 200); });
    var results = [];
    for (var i = 0; i < (interactions || []).length; i++) {
      var step = interactions[i];
      Object.keys(step.set || {}).forEach(function (name) {
        var sel = mountEl.querySelector('[name="' + name + '"]');
        if (sel) {
          sel.value = String(step.set[name]);
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await new Promise(function (r) { setTimeout(r, 220); });
      var got = e2eGetSelectOptions(mountEl, step.expectField).slice().sort();
      var expected = (step.expectIds || []).map(String).sort();
      var match = expected.join(',') === got.join(',');
      results.push({
        label: step.label || step.expectField,
        expected: expected,
        got: got,
        match: match
      });
      if (!match) {
        return { ok: false, error: 'Options « ' + step.expectField + ' » ≠ attendu (' + (step.label || '') + ')', results: results };
      }
    }
    return { ok: true, results: results };
  }

  /** Tables Régions/Villes pour cascade cas B (créées une fois, données rechargées). */
  async function ensureCascadeFixture(note) {
    var regionsTable = 'E2E_Regions';
    var villesTable = 'E2E_Villes';
    await loadTablesAndColumns();
    if (!S.tables.some(function (t) { return t.tableId === regionsTable; })) {
      await GristBridge.applyUserActions([
        ['AddTable', regionsTable, [{ id: 'Nom', type: 'Text', label: 'Nom' }]],
        ['AddTable', villesTable, [
          { id: 'Nom', type: 'Text', label: 'Nom' },
          { id: 'Region', type: 'Ref:' + regionsTable, label: 'Région' }
        ]]
      ]);
      await loadTablesAndColumns();
      note('fixture_create', { regionsTable: regionsTable, villesTable: villesTable });
    }
    var regions = await GristBridge.loadTable(regionsTable);
    var villes = await GristBridge.loadTable(villesTable);
    if (!(regions || []).length) {
      await GristBridge.addRow(regionsTable, { Nom: 'Bretagne' });
      await GristBridge.addRow(regionsTable, { Nom: 'PACA' });
      regions = await GristBridge.loadTable(regionsTable);
    }
    if ((villes || []).length < 3) {
      var bre = regions.find(function (r) { return r.Nom === 'Bretagne'; }) || regions[0];
      var paca = regions.find(function (r) { return r.Nom === 'PACA'; }) || regions[1];
      if (bre) {
        await GristBridge.addRow(villesTable, { Nom: 'Rennes', Region: bre.id });
        await GristBridge.addRow(villesTable, { Nom: 'Paris', Region: bre.id });
      }
      if (paca) {
        await GristBridge.addRow(villesTable, { Nom: 'Marseille', Region: paca.id });
      }
      villes = await GristBridge.loadTable(villesTable);
    }
    note('fixture_data', {
      regions: (regions || []).map(function (r) { return { id: r.id, Nom: r.Nom }; }),
      villes: (villes || []).map(function (v) { return { id: v.id, Nom: v.Nom, Region: v.Region }; })
    });
    return { regionsTable: regionsTable, villesTable: villesTable, regions: regions, villes: villes };
  }

  /** Filtre dynamique cas A : Choice Groupe → Ref Contacts sur colonne Groupe. */
  async function runE2ELiveCaseA() {
    var report = { steps: [] };
    function note(name, data) { report.steps.push(Object.assign({ name: name }, data || {})); }
    try {
      if (S.isDemo) return { ok: false, error: 'Mode démo — pas de Grist', report: report };
      await loadTablesAndColumns();
      var contacts = await GristBridge.loadTable('Contacts');
      note('contacts', { count: (contacts || []).length });
      if (!(contacts || []).some(function (r) { return r.Groupe; })) {
        return { ok: false, error: 'Contacts sans Groupe — voir MANUAL_TEST §3', report: report };
      }

      var groupes = ['Agents', 'Public', 'Internes'];
      var def = newFormDef();
      def.title = 'Validation filtre cas A ' + new Date().toISOString().slice(0, 16).replace('T', ' ');
      def.tableId = FormUx.tableNameFromTitle(def.title);
      def.composeMode = 'ensureSchema';
      def.choices = { Groupe: groupes };
      def.sections = [{
        id: 's1', label: 'Filtre Groupe', gate: null, condition: null,
        fields: [
          {
            colId: 'Groupe', label: 'Groupe', type: 'Choice', widget: 'select', required: true,
            options: { choices: groupes }, condition: null, cascade: null, dynamicFilter: null
          },
          {
            colId: 'Contact', label: 'Contact', type: 'Ref', widget: 'select', required: true,
            options: { refTable: 'Contacts', visibleCol: 'Nom' },
            condition: null, cascade: null,
            dynamicFilter: { parentField: 'Groupe', filterColumn: 'Groupe' }
          }
        ]
      }];
      S.currentDef = def;
      S.currentRowId = null;
      S.autoTable = true;
      await saveForm();
      note('save', { formId: def.id, tableId: def.tableId });

      var columnar = e2eRowsToColumnar(contacts, ['Nom', 'Email', 'Groupe']);
      var refRecords = { Contacts: columnar };
      var agentsIds = (contacts || []).filter(function (r) { return String(r.Groupe) === 'Agents'; })
        .map(function (r) { return r.id; });
      var publicIds = (contacts || []).filter(function (r) { return String(r.Groupe) === 'Public'; })
        .map(function (r) { return r.id; });
      if (!agentsIds.length) {
        return { ok: false, error: 'Aucun contact Groupe=Agents pour cas A', report: report };
      }

      var mount = await e2eMountPreview(def, refRecords, [
        { label: 'sans parent', set: {}, expectField: 'Contact', expectIds: [] },
        { label: 'Groupe Agents', set: { Groupe: 'Agents' }, expectField: 'Contact', expectIds: agentsIds }
      ]);
      note('mount', mount.results);
      if (!mount.ok) return Object.assign({ report: report }, mount);

      if (publicIds.length) {
        var mount2 = await e2eMountPreview(def, refRecords, [
          { label: 'Groupe Public', set: { Groupe: 'Public' }, expectField: 'Contact', expectIds: publicIds }
        ]);
        note('mount_public', mount2.results);
        if (!mount2.ok) return Object.assign({ report: report, formId: def.id }, mount2);
      }

      return { ok: true, report: report, formId: def.id, tableId: def.tableId };
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err), report: report };
    }
  }

  /** Cascade cas B : Ref Région → Ref Ville (parentRefCol Region). */
  async function runE2ELiveCaseB() {
    var report = { steps: [] };
    function note(name, data) { report.steps.push(Object.assign({ name: name }, data || {})); }
    try {
      if (S.isDemo) return { ok: false, error: 'Mode démo — pas de Grist', report: report };
      var fx = await ensureCascadeFixture(note);
      var bre = fx.regions.find(function (r) { return r.Nom === 'Bretagne'; }) || fx.regions[0];
      var paca = fx.regions.find(function (r) { return r.Nom === 'PACA'; }) || fx.regions[1];
      var breVilles = fx.villes.filter(function (v) { return v.Region === bre.id; }).map(function (v) { return v.id; });
      var pacaVilles = fx.villes.filter(function (v) { return v.Region === paca.id; }).map(function (v) { return v.id; });
      if (!breVilles.length || !pacaVilles.length) {
        return { ok: false, error: 'Données cascade incomplètes (Bretagne/PACA)', report: report };
      }

      var def = newFormDef();
      def.title = 'Validation cascade cas B ' + new Date().toISOString().slice(0, 16).replace('T', ' ');
      def.tableId = FormUx.tableNameFromTitle(def.title);
      def.composeMode = 'ensureSchema';
      def.sections = [{
        id: 's1', label: 'Lieu', gate: null, condition: null,
        fields: [
          {
            colId: 'Region', label: 'Région', type: 'Ref', widget: 'select', required: true,
            options: { refTable: fx.regionsTable, visibleCol: 'Nom' },
            condition: null, cascade: null, dynamicFilter: null
          },
          {
            colId: 'Ville', label: 'Ville', type: 'Ref', widget: 'select', required: true,
            options: { refTable: fx.villesTable, visibleCol: 'Nom' },
            condition: null,
            cascade: { parentField: 'Region', parentRefCol: 'Region' },
            dynamicFilter: null
          }
        ]
      }];
      S.currentDef = def;
      S.currentRowId = null;
      S.autoTable = true;
      await saveForm();
      note('save', { formId: def.id, tableId: def.tableId });

      var refRecords = {};
      refRecords[fx.regionsTable] = e2eRowsToColumnar(fx.regions, ['Nom']);
      refRecords[fx.villesTable] = e2eRowsToColumnar(fx.villes, ['Nom', 'Region']);

      var mount = await e2eMountPreview(def, refRecords, [
        { label: 'sans région', set: {}, expectField: 'Ville', expectIds: [] },
        { label: 'Bretagne', set: { Region: bre.id }, expectField: 'Ville', expectIds: breVilles },
        { label: 'PACA', set: { Region: paca.id }, expectField: 'Ville', expectIds: pacaVilles }
      ]);
      note('mount', mount.results);
      if (!mount.ok) return Object.assign({ report: report, formId: def.id }, mount);

      return { ok: true, report: report, formId: def.id, tableId: def.tableId };
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err), report: report };
    }
  }

  /** Filtre dynamique cas C : Ref Contacts → lit Groupe → filtre Contacts. */
  async function runE2ELiveCaseC() {
    const report = { steps: [] };
    function note(name, data) { report.steps.push(Object.assign({ name: name }, data || {})); }
    try {
      if (S.isDemo) return { ok: false, error: 'Mode démo — pas de Grist', report };
      if (typeof FormEngine.resolveParentFilterValue !== 'function') {
        return { ok: false, error: 'resolveParentFilterValue absent — recharger le widget (cache)', report };
      }

      await loadTablesAndColumns();
      let contacts = await GristBridge.loadTable('Contacts');
      note('contacts', {
        count: (contacts || []).length,
        sample: (contacts || []).slice(0, 5).map(function (r) {
          return { id: r.id, Nom: r.Nom, Groupe: r.Groupe, Email: r.Email };
        }),
        cols: ((S.columnsByTable && S.columnsByTable.Contacts) || []).map(function (c) {
          return c.colId + ':' + c.type;
        })
      });

      if (!(contacts || []).length) {
        return { ok: false, error: 'Table Contacts vide — ajoutez Alice/Bob/Carol avec Groupe', report };
      }
      if (!(contacts || []).some(function (r) { return r.Groupe; })) {
        return { ok: false, error: 'Colonne Groupe absente ou vide sur Contacts', report };
      }

      // Assurer ≥2 lignes même Groupe pour éprouver le filtre multi
      var byGroupe = {};
      (contacts || []).forEach(function (r) {
        var g = String(r.Groupe || '');
        if (!g) return;
        byGroupe[g] = byGroupe[g] || [];
        byGroupe[g].push(r);
      });
      var multiGroupe = Object.keys(byGroupe).find(function (g) { return byGroupe[g].length >= 2; });
      if (!multiGroupe) {
        var first = contacts[0];
        var second = contacts[1];
        if (first && second && first.Groupe) {
          await GristBridge.applyUserActions([
            ['UpdateRecord', 'Contacts', second.id, { Groupe: first.Groupe }]
          ]);
          contacts = await GristBridge.loadTable('Contacts');
          note('contacts_align', {
            updatedId: second.id,
            groupe: first.Groupe,
            sample: (contacts || []).map(function (r) {
              return { id: r.id, Nom: r.Nom, Groupe: r.Groupe };
            })
          });
        }
      }

      // FormDef minimal cas C
      const def = newFormDef();
      def.title = 'Validation filtre cas C ' + new Date().toISOString().slice(0, 16).replace('T', ' ');
      def.tableId = FormUx.tableNameFromTitle(def.title);
      def.composeMode = 'ensureSchema';
      def.sections = [{
        id: 's1', label: 'Contacts liés', gate: null, condition: null,
        fields: [
          {
            colId: 'Contact', label: 'Contact', type: 'Ref', widget: 'select', required: true,
            options: { refTable: 'Contacts', visibleCol: 'Nom' },
            condition: null, cascade: null, dynamicFilter: null
          },
          {
            colId: 'Autre', label: 'Autre contact', type: 'Ref', widget: 'select', required: true,
            options: { refTable: 'Contacts', visibleCol: 'Email' },
            condition: null, cascade: null,
            dynamicFilter: {
              parentField: 'Contact',
              filterColumn: 'Groupe',
              parentResolve: 'refRow',
              parentValueColumn: 'Groupe'
            }
          }
        ]
      }];
      S.currentDef = def;
      S.currentRowId = null;
      S.autoTable = true;
      await saveForm();
      note('save', { formId: def.id, tableId: def.tableId, dynamicFilter: def.sections[0].fields[1].dynamicFilter });

      // Unit resolve sur données live
      const columnar = { id: [], Nom: [], Email: [], Groupe: [] };
      (contacts || []).forEach(function (r) {
        columnar.id.push(r.id);
        columnar.Nom.push(r.Nom);
        columnar.Email.push(r.Email);
        columnar.Groupe.push(r.Groupe);
      });
      const refRecords = { Contacts: columnar };
      const fieldAutre = def.sections[0].fields[1];
      const alice = (contacts || []).find(function (r) {
        return String(r.Groupe || '').toLowerCase() === 'agents';
      }) || (contacts || []).find(function (r) {
        return !!r.Groupe;
      }) || contacts[0];
      const resolved = FormEngine.resolveParentFilterValue(
        fieldAutre, { Contact: alice.id }, def, refRecords
      );
      const filtered = FormEngine.filterDynamicOptions(
        columnar.id.map(function (id, i) { return { value: id, label: columnar.Email[i] || columnar.Nom[i] }; }),
        columnar,
        'Groupe',
        resolved
      );
      const sameGroupeCount = (contacts || []).filter(function (r) {
        return String(r.Groupe) === String(resolved);
      }).length;
      note('resolve', {
        aliceId: alice.id,
        aliceNom: alice.Nom,
        aliceGroupe: alice.Groupe,
        resolved: resolved,
        sameGroupeCount: sameGroupeCount,
        filteredIds: filtered.map(function (o) { return o.value; }),
        filteredLabels: filtered.map(function (o) { return o.label; })
      });
      if (sameGroupeCount < 2) {
        return { ok: false, error: 'Attendu ≥2 contacts même Groupe après alignement', report };
      }

      // Mount preview réel
      goStep('preview');
      await new Promise(function (r) { setTimeout(r, 400); });
      const mountEl = document.getElementById('preview-mount');
      if (!mountEl) return { ok: false, error: 'preview-mount introuvable', report };

      const bridge = {
        refRecords: refRecords,
        submit: function () { return Promise.resolve(); },
        skipProbe: true
      };
      FormEngine.mount(mountEl, def, bridge);
      await new Promise(function (r) { setTimeout(r, 200); });

      const contactSel = mountEl.querySelector('[name="Contact"]');
      const autreBefore = mountEl.querySelector('[name="Autre"]');
      const optsBefore = autreBefore
        ? [...autreBefore.querySelectorAll('option')].map(function (o) { return o.value; }).filter(Boolean)
        : [];
      note('preview_before', { optsBefore: optsBefore });

      if (contactSel) {
        contactSel.value = String(alice.id);
        contactSel.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(function (r) { setTimeout(r, 200); });
      }
      const autreAfter = mountEl.querySelector('[name="Autre"]');
      const optsAfter = autreAfter
        ? [...autreAfter.querySelectorAll('option')].map(function (o) { return o.value; }).filter(Boolean)
        : [];
      const expected = filtered.map(function (o) { return String(o.value); }).sort();
      const got = optsAfter.slice().sort();
      const match = expected.length > 0 && expected.join(',') === got.join(',');
      note('preview_after', {
        contactValue: contactSel && contactSel.value,
        optsAfter: optsAfter,
        expected: expected,
        match: match
      });

      // Changement parent : Bob (autre Groupe) → options différentes
      var bob = (contacts || []).find(function (r) {
        return String(r.Groupe) !== String(alice.Groupe);
      });
      var parentSwitchOk = true;
      if (bob) {
        var contactSelBob = mountEl.querySelector('[name="Contact"]');
        if (contactSelBob) {
          contactSelBob.value = String(bob.id);
          contactSelBob.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise(function (r) { setTimeout(r, 220); });
        }
        var filteredBob = FormEngine.filterDynamicOptions(
          columnar.id.map(function (id, i) { return { value: id, label: columnar.Email[i] || columnar.Nom[i] }; }),
          columnar,
          'Groupe',
          FormEngine.resolveParentFilterValue(fieldAutre, { Contact: bob.id }, def, refRecords)
        );
        var optsBob = e2eGetSelectOptions(mountEl, 'Autre').slice().sort();
        var expectedBob = filteredBob.map(function (o) { return String(o.value); }).sort();
        parentSwitchOk = expectedBob.length > 0 && expectedBob.join(',') === optsBob.join(',')
          && expectedBob.join(',') !== expected.join(',');
        note('parent_switch', {
          bobId: bob.id,
          bobNom: bob.Nom,
          bobGroupe: bob.Groupe,
          optsBob: optsBob,
          expectedBob: expectedBob,
          differFromAlice: expectedBob.join(',') !== expected.join(','),
          match: parentSwitchOk
        });
      } else {
        note('parent_switch', { skipped: true, reason: 'Pas de contact autre Groupe' });
      }

      var allOk = match && parentSwitchOk;
      return {
        ok: allOk,
        error: allOk ? null : (!match
          ? 'Options Autre après sélection ≠ attendu (filtre Groupe)'
          : 'Changement parent (Bob) ne met pas à jour les options'),
        report: report,
        formId: def.id,
        tableId: def.tableId
      };
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err), report: report };
    }
  }

  /** Helpers clics DOM (simule l’utilisateur dans le builder). */
  function uiTick(ms) { return new Promise(function (r) { setTimeout(r, ms || 180); }); }
  function uiChange(el, value) {
    if (!el) throw new Error('élément UI absent');
    if (value !== undefined && 'value' in el) el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function uiBlur(el) {
    if (!el) throw new Error('élément UI absent');
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  function uiFieldEditor(fi) {
    var editors = document.querySelectorAll('.field-editor');
    if (!editors[fi]) throw new Error('field-editor[' + fi + '] absent');
    return editors[fi];
  }
  async function uiConfigureRefField(fi, label, refTable, visibleCol) {
    var ed = uiFieldEditor(fi);
    uiChange(ed.querySelector('.field-props select.fr-select'), 'ref');
    await uiTick();
    ed = uiFieldEditor(fi);
    var refSelects = ed.querySelectorAll('.fr-grid-row select.fr-select');
    if (refSelects.length < 2) throw new Error('selects Ref absents field ' + fi);
    uiChange(refSelects[0], refTable);
    await uiTick();
    ed = uiFieldEditor(fi);
    refSelects = ed.querySelectorAll('.fr-grid-row select.fr-select');
    uiChange(refSelects[1], visibleCol);
    var labelInput = ed.querySelector('.inline-label');
    labelInput.value = label;
    labelInput.dispatchEvent(new Event('input', { bubbles: true }));
    uiBlur(labelInput);
    await uiTick();
  }

  /** Config cas C entièrement via clics UI (checkbox + selects), puis publish + fill runtime. */
  async function runE2ELiveUiCaseC() {
    var report = { steps: [], uiClicks: [] };
    function note(name, data) { report.steps.push(Object.assign({ name: name }, data || {})); }
    function clickLog(desc) { report.uiClicks.push(desc); }
    try {
      if (S.isDemo) return { ok: false, error: 'Mode démo — pas de Grist', report: report };
      await loadTablesAndColumns();

      startWizardCreate();
      var title = 'UI clic cas C ' + new Date().toISOString().slice(0, 16).replace('T', ' ');
      onDefInput('title', title);
      renderBuilder();
      note('wizard', { title: title, step: S.step });

      var addBtn = document.querySelector('.add-field-btn');
      if (!addBtn) return { ok: false, error: 'Bouton « + Ajouter une question » introuvable', report: report };
      addBtn.click();
      clickLog('click add-field #1');
      await uiTick();
      addBtn.click();
      clickLog('click add-field #2');
      await uiTick();

      await uiConfigureRefField(0, 'Contact', 'Contacts', 'Nom');
      clickLog('field0: type Ref, table Contacts, visibleCol Nom, label Contact');
      await uiConfigureRefField(1, 'Autre contact', 'Contacts', 'Email');
      clickLog('field1: type Ref, table Contacts, visibleCol Email, label Autre contact');

      var dynCheck = document.getElementById('dyn-0-1');
      if (!dynCheck) return { ok: false, error: 'Checkbox filtre dynamique #dyn-0-1 absente', report: report };
      dynCheck.checked = true;
      dynCheck.dispatchEvent(new Event('change', { bubbles: true }));
      clickLog('check dyn-0-1 filtre dynamique');
      await uiTick();

      var ed1 = uiFieldEditor(1);
      var dynSelects = ed1.querySelectorAll('.behavior-panel.dynamic select.fr-select');
      if (dynSelects.length < 2) {
        return { ok: false, error: 'Selects filtre dynamique absents (' + dynSelects.length + ')', report: report };
      }
      var contactColId = S.currentDef.sections[0].fields[0].colId;
      uiChange(dynSelects[0], contactColId);
      clickLog('select parentField=' + contactColId);
      await uiTick();

      ed1 = uiFieldEditor(1);
      dynSelects = ed1.querySelectorAll('.behavior-panel.dynamic select.fr-select');
      if (dynSelects.length < 3) {
        return { ok: false, error: 'Select parentValueColumn absent (parent Ref ?)', report: report };
      }
      uiChange(dynSelects[1], 'Groupe');
      clickLog('select parentValueColumn=Groupe');
      await uiTick();
      uiChange(dynSelects[2], 'Groupe');
      clickLog('select filterColumn=Groupe');

      var badge = ed1.querySelector('.cfg-badge.dynamic');
      var df = S.currentDef.sections[0].fields[1].dynamicFilter;
      note('ui_config', {
        badgeText: badge ? badge.textContent.trim() : null,
        dynamicFilter: df,
        contactColId: contactColId
      });
      var okConfig = df && df.parentField === contactColId && df.parentResolve === 'refRow' &&
        df.parentValueColumn === 'Groupe' && df.filterColumn === 'Groupe';
      if (!okConfig) return { ok: false, error: 'Config UI cas C incorrecte après clics', report: report };

      goStep('publish');
      await uiTick(300);
      var pubBtn = Array.prototype.find.call(
        document.querySelectorAll('#publish-log button.fr-btn, .builder-step button.fr-btn'),
        function (b) { return /Mettre en ligne|Remettre en ligne/.test(b.textContent || ''); }
      );
      if (!pubBtn) return { ok: false, error: 'Bouton Mettre en ligne introuvable', report: report };
      note('publish_btn', { label: pubBtn.textContent.trim(), visible: !pubBtn.hidden });
      clickLog('visible publish button: ' + pubBtn.textContent.trim());

      S.publishLog = [];
      await publishForm();
      var row = S.forms.find(function (f) { return f.FormId === S.currentDef.id; });
      note('publish', {
        version: row && row.Version,
        statut: row && row.Statut,
        sectionRef: row && row.PublishedSectionRef,
        log: S.publishLog.slice()
      });
      if (!row || row.Statut !== 'publie') {
        return { ok: false, error: 'Publication échouée', report: report, log: S.publishLog.slice() };
      }

      var contacts = await GristBridge.loadTable('Contacts');
      var columnar = e2eRowsToColumnar(contacts, ['Nom', 'Email', 'Groupe']);
      var fillRoot = document.createElement('div');
      fillRoot.id = 'e2e-fill-mount';
      fillRoot.style.cssText = 'position:absolute;left:-9999px;';
      document.body.appendChild(fillRoot);
      FormEngine.mount(fillRoot, S.currentDef, {
        refRecords: { Contacts: columnar },
        addRow: function (table, data) { return GristBridge.addRow(table, data); }
      });
      await uiTick(300);
      var contactSel = fillRoot.querySelector('[name="' + contactColId + '"]');
      var autreColId = S.currentDef.sections[0].fields[1].colId;
      var autreSel = fillRoot.querySelector('[name="' + autreColId + '"]');
      var alice = (contacts || []).find(function (r) { return String(r.Groupe) === 'Agents'; }) || contacts[0];
      if (contactSel) {
        contactSel.value = String(alice.id);
        contactSel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await uiTick(300);
      autreSel = fillRoot.querySelector('[name="' + autreColId + '"]');
      var opts = e2eGetSelectOptions(fillRoot, autreColId);
      var agentsIds = (contacts || []).filter(function (r) { return String(r.Groupe) === String(alice.Groupe); })
        .map(function (r) { return String(r.id); }).sort();
      var optsSorted = opts.slice().sort();
      var filterOk = agentsIds.join(',') === optsSorted.join(',');
      note('fill_preview', { aliceId: alice.id, opts: optsSorted, expected: agentsIds, filterOk: filterOk });

      if (autreSel && opts.length) autreSel.value = opts[0];
      var submitBtn = fillRoot.querySelector('[data-action="submit"]');
      if (submitBtn) submitBtn.click();
      await uiTick(500);
      var rows = await GristBridge.loadTable(S.currentDef.tableId);
      var written = (rows || []).slice(-1)[0];
      note('fill_submit', { tableId: S.currentDef.tableId, rowsCount: (rows || []).length, lastRow: written });
      fillRoot.remove();

      var submitOk = written && String(written[contactColId]) === String(alice.id);
      var allOk = okConfig && filterOk && submitOk && row.Statut === 'publie';
      return {
        ok: allOk,
        error: allOk ? null : (!filterOk ? 'Fill: filtre incorrect' : (!submitOk ? 'Fill: ligne non écrite' : 'Échec')),
        report: report,
        title: title,
        formId: S.currentDef.id,
        tableId: S.currentDef.tableId,
        sectionRef: row.PublishedSectionRef,
        pageName: title
      };
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err), report: report };
    }
  }

  /** Config cas A via clics UI : Choice Groupe → Ref Contact filtré. */
  async function runE2ELiveUiCaseA() {
    var report = { steps: [], uiClicks: [] };
    function note(name, data) { report.steps.push(Object.assign({ name: name }, data || {})); }
    function clickLog(desc) { report.uiClicks.push(desc); }
    try {
      if (S.isDemo) return { ok: false, error: 'Mode démo — pas de Grist', report: report };
      await loadTablesAndColumns();
      startWizardCreate();
      var title = 'UI clic cas A ' + new Date().toISOString().slice(0, 16).replace('T', ' ');
      onDefInput('title', title);
      S.currentDef.choices = { Groupe: ['Agents', 'Public', 'Internes'] };
      renderBuilder();

      var addBtn = document.querySelector('.add-field-btn');
      addBtn.click(); await uiTick();
      addBtn.click(); await uiTick();

      var ed0 = uiFieldEditor(0);
      uiChange(ed0.querySelector('.field-props select.fr-select'), 'choice');
      await uiTick();
      ed0 = uiFieldEditor(0);
      var label0 = ed0.querySelector('.inline-label');
      label0.value = 'Groupe';
      label0.dispatchEvent(new Event('input', { bubbles: true }));
      uiBlur(label0);
      var ta = ed0.querySelector('textarea.fr-input');
      ta.value = 'Agents\nPublic\nInternes';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      clickLog('field0 Choice Groupe');
      await uiTick();

      await uiConfigureRefField(1, 'Contact', 'Contacts', 'Nom');
      clickLog('field1 Ref Contacts');

      var dynCheck = document.getElementById('dyn-0-1');
      dynCheck.checked = true;
      dynCheck.dispatchEvent(new Event('change', { bubbles: true }));
      await uiTick();
      var ed1 = uiFieldEditor(1);
      var dynSelects = ed1.querySelectorAll('.behavior-panel.dynamic select.fr-select');
      var groupeColId = S.currentDef.sections[0].fields[0].colId;
      uiChange(dynSelects[0], groupeColId);
      await uiTick();
      ed1 = uiFieldEditor(1);
      dynSelects = ed1.querySelectorAll('.behavior-panel.dynamic select.fr-select');
      uiChange(dynSelects[1], 'Groupe');
      clickLog('filtre parent Groupe → colonne Groupe');

      var df = S.currentDef.sections[0].fields[1].dynamicFilter;
      note('ui_config', { dynamicFilter: df, groupeColId: groupeColId });
      if (!df || df.parentField !== groupeColId || df.filterColumn !== 'Groupe') {
        return { ok: false, error: 'Config UI cas A incorrecte', report: report };
      }

      await saveForm();
      goStep('publish');
      await uiTick(300);
      S.publishLog = [];
      await publishForm();
      var row = S.forms.find(function (f) { return f.FormId === S.currentDef.id; });
      note('publish', { statut: row && row.Statut, version: row && row.Version });

      return {
        ok: row && row.Statut === 'publie',
        error: row && row.Statut === 'publie' ? null : 'Publish cas A échoué',
        report: report,
        title: title,
        pageName: title
      };
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err), report: report };
    }
  }

  /** Suite complète : cas A, B, C (+ audience/publish optionnel). */
  async function runE2ELiveAll() {
    var report = { cases: {}, startedAt: new Date().toISOString() };
    var caseA = await runE2ELiveCaseA();
    report.cases.A = caseA;
    var caseB = await runE2ELiveCaseB();
    report.cases.B = caseB;
    var caseC = await runE2ELiveCaseC();
    report.cases.C = caseC;
    report.finishedAt = new Date().toISOString();
    var ok = caseA.ok && caseB.ok && caseC.ok;
    var errors = [];
    if (!caseA.ok) errors.push('A: ' + (caseA.error || 'échec'));
    if (!caseB.ok) errors.push('B: ' + (caseB.error || 'échec'));
    if (!caseC.ok) errors.push('C: ' + (caseC.error || 'échec'));
    return { ok: ok, error: ok ? null : errors.join(' ; '), report: report };
  }

  /** Publie la vue fill (CreateViewSection + bundle). */
  async function runE2EPublish() {
    try {
      if (S.isDemo) return { ok: false, error: 'Mode démo — pas de Grist' };
      if (!S.currentDef) return { ok: false, error: 'Aucun FormDef courant' };
      S.publishLog = [];
      await publishForm();
      const row = S.forms.find(f => f.FormId === S.currentDef.id);
      return {
        ok: true,
        formId: S.currentDef.id,
        tableId: S.currentDef.tableId,
        title: S.currentDef.title,
        statut: row && row.Statut,
        version: row && row.Version,
        sectionRef: row && row.PublishedSectionRef,
        log: S.publishLog.slice()
      };
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err), log: S.publishLog.slice() };
    }
  }

  /** Setup + publish formulaire contact+fichier pour test upload vue publiée. */
  async function runE2ELiveUploadPublished() {
    var report = { steps: [] };
    function note(name, data) { report.steps.push(Object.assign({ name: name }, data || {})); }
    try {
      if (S.isDemo) return { ok: false, error: 'Mode démo', report: report };
      await runE2ECreateWithFile();
      note('create', { formId: S.currentDef && S.currentDef.id, tableId: S.currentDef && S.currentDef.tableId });
      var pub = await runE2EPublish();
      note('publish', pub);
      if (!pub.ok) return { ok: false, error: pub.error || 'Publish échoué', report: report, publish: pub };
      var secRows = await GristBridge.loadTable('_grist_Views_section');
      var sec = (secRows || []).find(function (r) { return r.id === pub.sectionRef; });
      var bundleInfo = { sectionRef: pub.sectionRef, found: !!sec };
      if (sec && sec.options) {
        try {
          var outer = JSON.parse(sec.options);
          var inner = JSON.parse(outer.customView || '{}');
          var js = (inner.widgetOptions && inner.widgetOptions._js) || '';
          bundleInfo.hasRuntimeE2E = js.indexOf('grist-forms-runtime-e2e') >= 0;
          bundleInfo.widgetUrl = inner.widgetDef && inner.widgetDef.url;
          bundleInfo.jsLen = js.length;
        } catch (eParse) {
          bundleInfo.parseError = eParse.message;
        }
      }
      note('bundle', bundleInfo);
      return {
        ok: true,
        publish: pub,
        bundleInfo: bundleInfo,
        hint: 'Sur la page publiée : postMessage iframe {type:"grist-forms-runtime-e2e", action:"upload-file"}',
        report: report
      };
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err), report: report };
    }
  }

  /**
   * Test option H : POST /attachments sans X-Requested-With vs baseline (avec header).
   * Crée un formulaire contact+fichier si besoin.
   */
  async function runE2ELiveUploadH() {
    var report = { steps: [] };
    function note(name, data) { report.steps.push(Object.assign({ name: name }, data || {})); }
    try {
      if (S.isDemo) return { ok: false, error: 'Mode démo — pas de Grist', report: report };

      if (!S.currentDef || !(S.currentDef.sections || []).some(function (s) {
        return (s.fields || []).some(function (f) { return f.type === 'Attachments' || f.widget === 'file'; });
      })) {
        await runE2ECreateWithFile();
        note('setup', { formId: S.currentDef && S.currentDef.id, tableId: S.currentDef && S.currentDef.tableId });
      }

      var tok = await grist.docApi.getAccessToken({ readOnly: false });
      note('token', {
        ok: !!(tok && tok.token && tok.baseUrl),
        baseUrl: tok && tok.baseUrl,
        widgetOrigin: location.origin
      });
      if (!tok || !tok.token) return { ok: false, error: 'Token indisponible', report: report };

      var file = new File(
        ['test option H ' + new Date().toISOString()],
        'test-option-h.txt',
        { type: 'text/plain' }
      );
      var getToken = function () { return Promise.resolve(tok); };

      async function tryMode(label, simpleUpload) {
        var deps = {
          getAccessToken: getToken,
          simpleUpload: simpleUpload
        };
        var t0 = Date.now();
        try {
          var ids = await FormAttachments.uploadFiles([file], deps);
          return {
            label: label,
            ok: true,
            ids: ids,
            simpleUpload: simpleUpload,
            ms: Date.now() - t0,
            usedXRequestedWith: simpleUpload === false
          };
        } catch (e) {
          return {
            label: label,
            ok: false,
            error: (e && e.message) || String(e),
            simpleUpload: simpleUpload,
            ms: Date.now() - t0,
            usedXRequestedWith: simpleUpload === false
          };
        }
      }

      var baseline = await tryMode('baseline (X-Requested-With)', false);
      note('baseline', baseline);
      var optionH = await tryMode('option H (sans X-Requested-With)', true);
      note('optionH', optionH);

      var hWins = optionH.ok && !baseline.ok;
      var bothOk = optionH.ok && baseline.ok;
      var hOnly = optionH.ok;
      return {
        ok: hOnly,
        hWins: hWins,
        bothOk: bothOk,
        conclusion: hWins
          ? 'Option H débloque CORS (baseline KO, H OK)'
          : (bothOk
            ? 'Les deux modes fonctionnent — preflight non bloquant ici'
            : (optionH.ok ? 'H OK' : 'Option H ne contourne pas CORS : ' + (optionH.error || 'échec'))),
        baseline: baseline,
        optionH: optionH,
        report: report
      };
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err), report: report };
    }
  }

  /**
   * Upload réel + AddRecord (même chemin que le runtime publié).
   * Prérequis : FormDef courant avec champ Attachments (ex. create-with-file).
   */
  async function runE2EUploadFile() {
    try {
      if (S.isDemo) return { ok: false, error: 'Mode démo — pas de Grist' };
      if (!S.currentDef || !S.currentDef.tableId) {
        return { ok: false, error: 'Aucun FormDef / tableId — lancez create-with-file d’abord' };
      }
      const attField = (S.currentDef.sections || []).flatMap(s => s.fields || [])
        .find(f => f.type === 'Attachments' || f.widget === 'file');
      if (!attField) return { ok: false, error: 'Pas de champ Attachments sur le FormDef courant' };

      const file = new File(
        ['preuve upload chrome ' + new Date().toISOString()],
        'preuve-chrome.txt',
        { type: 'text/plain' }
      );
      const values = {
        Nom: 'E2E Upload Chrome',
        Email: 'e2e-upload@test.local',
        Message: 'Validation upload PJ live',
        Piece_jointe: [file]
      };
      // Aligner colId du champ fichier
      values[attField.colId] = [file];

      await FormAttachments.resolveAttachmentFields(S.currentDef, values, {
        getAccessToken: function (opts) { return grist.docApi.getAccessToken(opts); }
      });
      const data = FormEngine.collectSubmitData(S.currentDef, values);
      await GristBridge.addRow(S.currentDef.tableId, data);

      const rows = await GristBridge.loadTable(S.currentDef.tableId);
      const last = (rows || []).slice().reverse().find(r => r.Nom === 'E2E Upload Chrome') ||
        (rows && rows[rows.length - 1]);
      const cell = last && last[attField.colId];
      return {
        ok: true,
        tableId: S.currentDef.tableId,
        written: data,
        attachmentCell: cell,
        rowId: last && last.id,
        rowsCount: (rows || []).length
      };
    } catch (err) {
      var diag = { message: (err && err.message) || String(err) };
      try {
        const tok = await grist.docApi.getAccessToken({ readOnly: false });
        diag.tokenOk = !!(tok && tok.token && tok.baseUrl);
        diag.baseUrl = tok && tok.baseUrl;
      } catch (e2) {
        diag.tokenError = (e2 && e2.message) || String(e2);
      }
      return { ok: false, error: diag.message, diag: diag };
    }
  }

  window.App.runE2ECreateGrist = runE2ECreateGrist;
  window.App.runE2ECreateWithFile = runE2ECreateWithFile;
  window.App.runE2EPublish = runE2EPublish;
  window.App.runE2ELiveUploadPublished = runE2ELiveUploadPublished;
  window.App.runE2ELiveUploadH = runE2ELiveUploadH;
  window.App.runE2EUploadFile = runE2EUploadFile;
  window.App.runE2ELiveAudiencePublish = runE2ELiveAudiencePublish;
  window.App.runE2ELiveCaseA = runE2ELiveCaseA;
  window.App.runE2ELiveCaseB = runE2ELiveCaseB;
  window.App.runE2ELiveCaseC = runE2ELiveCaseC;
  window.App.runE2ELiveUiCaseA = runE2ELiveUiCaseA;
  window.App.runE2ELiveUiCaseC = runE2ELiveUiCaseC;
  window.App.runE2ELiveAll = runE2ELiveAll;
  window.addEventListener('message', function (ev) {
    const data = ev && ev.data;
    if (!data || data.type !== 'grist-forms-e2e') return;
    var runner = null;
    if (data.action === 'create') runner = runE2ECreateGrist;
    if (data.action === 'create-with-file') runner = runE2ECreateWithFile;
    if (data.action === 'publish') runner = runE2EPublish;
    if (data.action === 'upload-file') runner = runE2EUploadFile;
    if (data.action === 'live-upload-published') runner = runE2ELiveUploadPublished;
    if (data.action === 'live-upload-h') runner = runE2ELiveUploadH;
    if (data.action === 'live-audience') runner = runE2ELiveAudiencePublish;
    if (data.action === 'live-case-a') runner = runE2ELiveCaseA;
    if (data.action === 'live-case-b') runner = runE2ELiveCaseB;
    if (data.action === 'live-case-c') runner = runE2ELiveCaseC;
    if (data.action === 'live-ui-case-a') runner = runE2ELiveUiCaseA;
    if (data.action === 'live-ui-case-c') runner = runE2ELiveUiCaseC;
    if (data.action === 'live-all') runner = runE2ELiveAll;
    if (!runner) return;
    if (!e2eByUrl && S.isDemo) return;
    Promise.resolve(runner()).then(function (result) {
      try { ev.source && ev.source.postMessage({ type: 'grist-forms-e2e-result', result: result }, '*'); } catch (e2) { /* ignore */ }
      console.log('[e2e]', result);
    });
  });
})();

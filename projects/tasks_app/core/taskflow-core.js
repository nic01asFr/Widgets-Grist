/* ============================================================================
 * taskflow-core.js — Module commun aux widgets TaskFlow
 * ----------------------------------------------------------------------------
 * SOURCE UNIQUE. Inline dans chaque widget par scripts/build-taskflow.js entre
 * les marqueurs de generation prevus a cet effet.
 * NE PAS editer la copie inlinee dans les .html : editer CE fichier puis lancer
 *   npm run build:taskflow
 *
 * Expose un objet `TF` (namespace) pour ne jamais entrer en collision avec les
 * helpers locaux existants des widgets. Toutes les fonctions qui ecrivent dans
 * Grist sont DEFENSIVES : en cas d'echec elles n'interrompent jamais le widget
 * (au pire, comportement actuel inchange).
 * ========================================================================== */
const TF = (function () {
    'use strict';

    /* ----- Statuts ---------------------------------------------------------
     * Convention : l'ORDRE fait foi. Le DERNIER statut de la liste est l'etat
     * terminal ("termine") utilise par la logique de completion des widgets.
     * Les statuts reels proviennent de la colonne Choice `statut` (editable par
     * l'utilisateur dans Grist). DEFAULT_STATUSES n'est qu'un repli.
     * --------------------------------------------------------------------- */
    const DEFAULT_STATUSES = [
        { value: 'todo',       label: 'À faire',  fillColor: '#94a3b8', textColor: '#ffffff' },
        { value: 'inprogress', label: 'En cours', fillColor: '#f59e0b', textColor: '#ffffff' },
        { value: 'review',     label: 'En revue', fillColor: '#3b82f6', textColor: '#ffffff' },
        { value: 'done',       label: 'Terminé',  fillColor: '#10b981', textColor: '#ffffff' }
    ];
    // Repli libelle + couleur pour les CODES par defaut. Permet d'afficher un libelle
    // FR (et la bonne couleur) meme quand la colonne Choice stocke le code brut
    // (todo/inprogress/...). Une valeur renommee par l'utilisateur garde SON libelle.
    const DEFAULTS_BY_VALUE = {};
    for (var _i = 0; _i < DEFAULT_STATUSES.length; _i++) DEFAULTS_BY_VALUE[DEFAULT_STATUSES[_i].value] = DEFAULT_STATUSES[_i];

    // Convertit un tableau Grist colonnaire en tableau d'objets lignes.
    function columnarToRows(data) {
        if (!data || Array.isArray(data)) return data || [];
        const cols = Object.keys(data);
        if (!cols.length) return [];
        const n = (data[cols[0]] && data[cols[0]].length) || 0;
        const rows = [];
        for (let i = 0; i < n; i++) {
            const rec = {};
            for (const k of cols) rec[k] = data[k][i];
            rows.push(rec);
        }
        return rows;
    }

    // Resout le rowId d'une table depuis son tableId via _grist_Tables.
    async function tableRowId(grist, tableId) {
        const meta = columnarToRows(await grist.docApi.fetchTable('_grist_Tables'));
        const row = meta.find(r => r.tableId === tableId);
        return row ? row.id : null;
    }

    // Construit une config de statuts normalisee depuis une liste brute.
    function buildStatusConfig(list, source) {
        const clean = (list || []).filter(s => s && s.value != null).map(s => {
            const v = String(s.value);
            const d = DEFAULTS_BY_VALUE[v];
            const hasExplicitLabel = s.label != null && s.label !== '' && String(s.label) !== v;
            return {
                value: v,
                label: hasExplicitLabel ? String(s.label) : (d ? d.label : v),
                fillColor: s.fillColor || (d ? d.fillColor : '#94a3b8'),
                textColor: s.textColor || (d ? d.textColor : '#ffffff')
            };
        });
        const final = clean.length ? clean : DEFAULT_STATUSES.slice();
        const byValue = {};
        for (const s of final) byValue[s.value] = s;
        return {
            list: final,
            byValue,
            values: final.map(s => s.value),
            terminalValue: final[final.length - 1].value, // convention "dernier = termine"
            firstValue: final[0].value,
            source: clean.length ? source : 'default'
        };
    }

    /* Lit les statuts (libelles + couleurs + ordre) depuis la colonne Choice
     * indiquee, via les metadonnees Grist. Repli en cascade :
     *   1. options de la colonne Choice (cas ideal)
     *   2. valeurs distinctes presentes dans les donnees (colonne Text)
     *   3. DEFAULT_STATUSES
     * Ne jette jamais : retourne toujours une config exploitable.
     */
    async function loadStatusConfig(grist, table, column, distinctFallback) {
        try {
            const tid = await tableRowId(grist, table);
            if (tid != null) {
                const cols = columnarToRows(await grist.docApi.fetchTable('_grist_Tables_column'));
                const col = cols.find(c => c.parentId === tid && c.colId === column);
                if (col && col.widgetOptions) {
                    let opt = {};
                    try { opt = JSON.parse(col.widgetOptions) || {}; } catch (e) { opt = {}; }
                    const choices = Array.isArray(opt.choices) ? opt.choices : [];
                    const co = opt.choiceOptions || {};
                    if (choices.length) {
                        return buildStatusConfig(choices.map(ch => ({
                            value: ch,
                            label: ch,
                            fillColor: co[ch] && co[ch].fillColor,
                            textColor: co[ch] && co[ch].textColor
                        })), 'choice');
                    }
                }
            }
        } catch (e) { /* repli silencieux */ }

        if (Array.isArray(distinctFallback) && distinctFallback.length) {
            const seen = [];
            for (const v of distinctFallback) { if (v != null && v !== '' && seen.indexOf(v) === -1) seen.push(v); }
            if (seen.length) return buildStatusConfig(seen.map(v => ({ value: v, label: v })), 'data');
        }
        return buildStatusConfig(DEFAULT_STATUSES.slice(), 'default');
    }

    function getStatus(cfg, value) {
        if (cfg && cfg.byValue && cfg.byValue[value]) return cfg.byValue[value];
        return { value: value, label: value || '', fillColor: '#94a3b8', textColor: '#ffffff' };
    }
    function isTerminal(cfg, value) { return !!cfg && value === cfg.terminalValue; }

    /* Seme les options (choix + couleurs) sur une colonne Choice si elle n'en a
     * pas encore. Defensif. A appeler depuis ensureSchema apres creation.
     */
    async function seedStatusChoices(grist, table, column, statuses) {
        try {
            const tid = await tableRowId(grist, table);
            if (tid == null) return;
            const cols = columnarToRows(await grist.docApi.fetchTable('_grist_Tables_column'));
            const col = cols.find(c => c.parentId === tid && c.colId === column);
            if (!col) return;
            let opt = {};
            try { opt = JSON.parse(col.widgetOptions || '{}') || {}; } catch (e) { opt = {}; }
            if (Array.isArray(opt.choices) && opt.choices.length) return; // deja configure : on respecte
            const list = statuses && statuses.length ? statuses : DEFAULT_STATUSES;
            const choiceOptions = {};
            for (const s of list) choiceOptions[s.value] = { fillColor: s.fillColor, textColor: s.textColor };
            const widgetOptions = JSON.stringify({ choices: list.map(s => s.value), choiceOptions: choiceOptions });
            await grist.docApi.applyUserActions([['ModifyColumn', table, column, { widgetOptions: widgetOptions }]]);
        } catch (e) { console.warn('TF.seedStatusChoices:', e && e.message); }
    }

    /* ----- #2 : colonnes d'affichage des Ref (noms au lieu des IDs) ---------
     * Pose le visibleCol + la display formula sur des colonnes Ref pour que les
     * VUES NATIVES Grist affichent un libelle plutot que l'ID de ligne.
     * specs : [{ table:'Tasks', column:'projet', visibleColId:'nom' }, ...]
     * DEFENSIF : si Grist refuse une action, on log et on continue ; au pire
     * l'affichage reste en IDs (comportement actuel), jamais de casse.
     * --------------------------------------------------------------------- */
    async function setRefDisplayColumns(grist, specs) {
        if (!Array.isArray(specs) || !specs.length) return;
        try {
            const tables = columnarToRows(await grist.docApi.fetchTable('_grist_Tables'));
            const cols = columnarToRows(await grist.docApi.fetchTable('_grist_Tables_column'));
            const tidOf = (tableId) => { const r = tables.find(t => t.tableId === tableId); return r ? r.id : null; };
            const colOf = (tableRow, colId) => cols.find(c => c.parentId === tableRow && c.colId === colId);

            const actions = [];
            for (const s of specs) {
                const srcTid = tidOf(s.table);
                if (srcTid == null) continue;
                const refCol = colOf(srcTid, s.column);
                if (!refCol) continue;
                // Table cible deduite du type "Ref:Target" / "RefList:Target".
                const m = /^(?:Ref|RefList):(.+)$/.exec(refCol.type || '');
                if (!m) continue;
                const targetTid = tidOf(m[1]);
                if (targetTid == null) continue;
                const visCol = colOf(targetTid, s.visibleColId);
                if (!visCol) continue;
                // Eviter de re-poser si deja correct.
                if (refCol.visibleCol === visCol.id) continue;
                actions.push(['SetDisplayFormula', s.table, null, refCol.id, '$' + s.column + '.' + s.visibleColId]);
                actions.push(['UpdateRecord', '_grist_Tables_column', refCol.id, { visibleCol: visCol.id }]);
            }
            if (actions.length) await grist.docApi.applyUserActions(actions);
        } catch (e) { console.warn('TF.setRefDisplayColumns:', e && e.message); }
    }

    /* ----- #3 : plan de charge (heures par personne) ------------------------
     * Stockage : colonne Text `charges` sur Tasks, JSON [{teamId, heures}].
     * Parse defensif identique au pattern subtasks.
     * --------------------------------------------------------------------- */
    function parseCharges(v) {
        try {
            const a = JSON.parse(v || '[]');
            if (!Array.isArray(a)) return [];
            return a.filter(x => x && x.teamId != null)
                    .map(x => ({ teamId: Number(x.teamId), heures: Number(x.heures) || 0 }))
                    .filter(x => !isNaN(x.teamId));
        } catch (e) { return []; }
    }
    function chargesToJson(arr) {
        return JSON.stringify((arr || [])
            .filter(x => x && x.teamId != null)
            .map(x => ({ teamId: Number(x.teamId), heures: Number(x.heures) || 0 }))
            .filter(x => !isNaN(x.teamId)));
    }
    // Heures totales d'une tache (somme des charges par personne).
    function chargeTotal(charges) { return parseCharges(typeof charges === 'string' ? charges : JSON.stringify(charges || [])).reduce((s, c) => s + c.heures, 0); }
    // Agrege la charge par membre sur une liste de taches (chaque tache expose .charges).
    function chargeByMember(tasks) {
        const by = {};
        for (const t of (tasks || [])) {
            for (const c of parseCharges(t && t.charges)) {
                by[c.teamId] = (by[c.teamId] || 0) + c.heures;
            }
        }
        return by;
    }

    // Cle de periode : semaine ISO 'YYYY-Www' ou mois 'YYYY-MM'.
    function periodKey(date, granularity) {
        if (granularity === 'month') {
            return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
        }
        const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const day = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - day);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return d.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
    }

    // #3 plan de charge temporel : etale les charges PROPRES de chaque tache sur sa
    // duree (jours calendaires), agrege par personne et par periode.
    // dateDebut/dateEcheance = timestamps Unix SECONDES (Grist). Tache sans dates ou
    // sans charge = ignoree. Retourne { teamId: { periodKey: heures } }.
    function chargeByMemberPeriod(tasks, granularity) {
        const g = granularity === 'month' ? 'month' : 'week';
        const out = {};
        for (const t of (tasks || [])) {
            const charges = parseCharges(t && t.charges);
            if (!charges.length) continue;
            const s = t.dateDebut, e = t.dateEcheance;
            if (s == null || e == null) continue;
            const day0 = Math.floor((s * 1000) / 86400000);
            const day1 = Math.floor((e * 1000) / 86400000);
            const nDays = Math.max(day1 - day0 + 1, 1);
            for (const c of charges) {
                const perDay = (Number(c.heures) || 0) / nDays;
                if (!perDay) continue;
                if (!out[c.teamId]) out[c.teamId] = {};
                for (let dd = day0; dd <= day1; dd++) {
                    const key = periodKey(new Date(dd * 86400000), g);
                    out[c.teamId][key] = (out[c.teamId][key] || 0) + perDay;
                }
            }
        }
        return out;
    }

    // Decale une date de n periodes (semaine = 7 jours, mois = 1 mois).
    function shiftPeriods(date, granularity, n) {
        const d = new Date(date.getTime());
        if (granularity === 'month') d.setUTCMonth(d.getUTCMonth() + n);
        else d.setUTCDate(d.getUTCDate() + n * 7);
        return d;
    }

    // Liste contigue de cles de periode (semaine ISO ou mois) a partir d'une date,
    // alignee sur le debut de periode (lundi / 1er du mois). Inclut les periodes vides.
    function periodRange(startDate, granularity, count) {
        const g = granularity === 'month' ? 'month' : 'week';
        let d = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
        if (g === 'week') { const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() - day + 1); }
        else { d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); }
        const out = [];
        for (let i = 0; i < count; i++) {
            out.push(periodKey(d, g));
            if (g === 'week') d.setUTCDate(d.getUTCDate() + 7);
            else d.setUTCMonth(d.getUTCMonth() + 1);
        }
        return out;
    }

    // chargeMatrix : generalise chargeByMemberPeriod. Etale les charges (via getCharges,
    // defaut parseCharges) sur la duree, agrege par cle keyFn(t, charge) et periode.
    function chargeMatrix(tasks, keyFn, granularity, getCharges, workdays) {
        const g = granularity === 'month' ? 'month' : 'week';
        const out = {};
        for (const t of (tasks || [])) {
            const charges = getCharges ? getCharges(t) : parseCharges(t && t.charges);
            if (!charges.length || t.dateDebut == null || t.dateEcheance == null) continue;
            const d0 = Math.floor((t.dateDebut * 1000) / 86400000), d1 = Math.floor((t.dateEcheance * 1000) / 86400000);
            const days = [];
            for (let dd = d0; dd <= d1; dd++) { if (workdays) { const wd = new Date(dd * 86400000).getUTCDay(); if (wd < 1 || wd > 5) continue; } days.push(dd); }
            if (!days.length) days.push(d0);
            for (const c of charges) {
                const key = keyFn(t, c); if (key == null) continue;
                const perDay = c.heures / days.length; if (!perDay) continue;
                if (!out[key]) out[key] = {};
                for (const dd of days) { const pk = periodKey(new Date(dd * 86400000), g); out[key][pk] = (out[key][pk] || 0) + perDay; }
            }
        }
        return out;
    }

    /* ----- #7 : respect des droits (ACL) ------------------------------------
     * Deux niveaux : (a) acces document lecture seule -> Grist passe
     * `readonly=true` dans l'URL de l'iframe ; (b) ACL au niveau ligne ->
     * l'acces widget peut etre `full` mais une ecriture sur une ligne donnee
     * est refusee par le serveur. safeApply absorbe ce refus proprement.
     * --------------------------------------------------------------------- */
    function _qp(name) { try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; } }
    // Vrai si Grist a ouvert le widget en lecture seule (acces doc restreint).
    function isReadOnly() { return _qp('readonly') === 'true'; }
    // Niveau d'acces accorde au widget : 'full' | 'read table' | 'none' (defaut 'full').
    function accessLevel() { return _qp('access') || 'full'; }
    // Detecte un message d'erreur Grist correspondant a un refus de droits.
    function isAccessError(e) {
        const msg = (e && (e.message || e.toString())) || '';
        return /access denied|not allowed|permission|forbidden|read[- ]?only|cannot (modify|add|remove)|acl/i.test(msg);
    }
    // Applique des actions en absorbant un refus de droits.
    // Retourne { ok:true } ou { ok:false, denied:bool, message }. Ne fait PAS d'UI
    // (chaque widget affiche son propre toast et recharge pour annuler l'optimiste).
    async function safeApply(grist, actions) {
        if (isReadOnly()) return { ok: false, denied: true, message: 'Document en lecture seule' };
        try { const r = await grist.docApi.applyUserActions(actions); return { ok: true, ret: r }; }
        catch (e) { return { ok: false, denied: isAccessError(e), message: (e && (e.message || e.toString())) || 'Erreur' }; }
    }
    // Garde transverse : enrobe grist.docApi.applyUserActions une seule fois pour
    // respecter les droits sur TOUS les sites d'ecriture sans les modifier un a un.
    // - lecture seule -> bloque + opts.onReadOnly()
    // - refus ACL au niveau ligne -> opts.onDenied(err) (le widget toast + recharge)
    // Les erreurs continuent d'etre levees (les try/catch existants les absorbent).
    function guardWrites(grist, opts) {
        opts = opts || {};
        if (!grist || !grist.docApi || grist.docApi._tfGuarded) return;
        const raw = grist.docApi.applyUserActions.bind(grist.docApi);
        grist.docApi._tfGuarded = true;
        grist.docApi.applyUserActions = async function (actions) {
            if (isReadOnly()) { try { opts.onReadOnly && opts.onReadOnly(); } catch (e) {} const err = new Error('Document en lecture seule'); err.tfReadOnly = true; throw err; }
            try { return await raw(actions); }
            catch (e) { if (isAccessError(e)) { try { opts.onDenied && opts.onDenied(e); } catch (e2) {} } throw e; }
        };
    }
    // Bandeau "lecture seule" auto-contenu (aucun markup widget requis).
    // Pousse le contenu vers le bas (padding-top sur body) pour NE PAS recouvrir l'en-tete du widget.
    function readOnlyBanner() {
        if (!isReadOnly() || (typeof document === 'undefined') || document.getElementById('tf-ro-banner')) return;
        const b = document.createElement('div');
        b.id = 'tf-ro-banner';
        b.textContent = 'Lecture seule — vos droits ne permettent pas la modification';
        b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#b45309;color:#fff;font:600 12px/1.4 system-ui,-apple-system,sans-serif;text-align:center;padding:6px 10px;letter-spacing:.2px;box-sizing:border-box';
        document.body.appendChild(b);
        const h = b.offsetHeight || 28;
        const prev = parseFloat(getComputedStyle(document.body).paddingTop) || 0;
        document.body.style.paddingTop = (prev + h) + 'px';
    }

    return {
        DEFAULT_STATUSES: DEFAULT_STATUSES,
        columnarToRows: columnarToRows,
        loadStatusConfig: loadStatusConfig,
        buildStatusConfig: buildStatusConfig,
        getStatus: getStatus,
        isTerminal: isTerminal,
        seedStatusChoices: seedStatusChoices,
        setRefDisplayColumns: setRefDisplayColumns,
        parseCharges: parseCharges,
        chargesToJson: chargesToJson,
        chargeTotal: chargeTotal,
        chargeByMember: chargeByMember,
        periodKey: periodKey,
        chargeByMemberPeriod: chargeByMemberPeriod,
        shiftPeriods: shiftPeriods,
        periodRange: periodRange,
        chargeMatrix: chargeMatrix,
        isReadOnly: isReadOnly,
        accessLevel: accessLevel,
        isAccessError: isAccessError,
        safeApply: safeApply,
        guardWrites: guardWrites,
        readOnlyBanner: readOnlyBanner
    };
})();

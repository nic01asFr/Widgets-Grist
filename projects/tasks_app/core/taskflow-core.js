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

    /* ----- Sémantique statut : terminé / annulé / actif ---------------------
     * On NE se fie plus a "le dernier = termine" (faux pour des statuts de
     * gouvernance ou le dernier est "Annule"). On distingue 3 notions :
     *   - DONE  : cloture POSITIVE (Valide/Termine/Clos) -> compte comme fait
     *   - DEAD  : cloture NEGATIVE (Annule/Abandonne/Rejete) -> exclu des "actives"/"en retard"
     *   - LIVE  : ni fait ni annule (En attente / En suspens ...)
     * Detection par libelle (heuristique), surchargeable via cfg.doneValue /
     * cfg.deadValues. isTerminal reste dispo (retro-compat) mais ne doit plus
     * piloter la completion.
     * Les motifs sont ANCRES au debut du libelle et limites aux formes de
     * participe/adjectif (Valide, Termine, Livre...) : une phase active comme
     * "Realisation", "A valider", "En cours de validation" ou "Non termine"
     * ne doit jamais etre prise pour une cloture. ------------------------------ */
    const DONE_HINT = /^\s*(?:termin[ée]e?s?|clos(?:e|es)?|cl[oô]tur[ée]e?s?|fini(?:e|s|es)?|achev[ée]e?s?|livr[ée]e?s?|r[ée]alis[ée]e?s?|compl[eè]t(?:e|es|[ée]e?s?)?|valid[ée]e?s?|done|closed|finished|completed?|delivered)(?![a-zà-ÿ])/i;
    const DEAD_HINT = /^\s*(?:annul[ée]e?s?|abandonn[ée]e?s?|rejet[ée]e?s?|cancel(?:l?ed)?|caduc(?:que|s|ques)?|rejected|abandoned)(?![a-zà-ÿ])/i;

    /* ----- Dates --------------------------------------------------------------
     * Une colonne Date de Grist stocke des SECONDES a MINUIT UTC. Les widgets
     * ecrivaient minuit LOCAL (22:00 UTC la veille en France : la table Grist
     * affichait un jour de moins) et la fiche lisait en UTC (un jour de moins
     * aussi). Convention unique ici :
     *   - ecriture canonique : minuit UTC du jour calendaire local choisi ;
     *   - lecture tolerante : une valeur multiple de 86400 est un jour UTC
     *     (canonique) ; toute autre valeur est un ancien instant ecrit par les
     *     widgets, lu comme avant en jour calendaire LOCAL. Aucune migration
     *     n'est necessaire et les documents existants s'affichent a l'identique. */
    function gristToDate(ts) {
        if (ts == null || ts === '') return null;
        const n = Number(ts);
        if (!isFinite(n) || !n) return null;
        if (n % 86400 === 0) { const u = new Date(n * 1000); return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()); }
        const l = new Date(n * 1000);
        return new Date(l.getFullYear(), l.getMonth(), l.getDate());
    }
    function dateToGrist(d) {
        if (!d || isNaN(d.getTime())) return null;
        return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 1000;
    }
    // Numero de jour (depuis 1970) du jour calendaire d'une valeur Grist, quelle que soit sa convention.
    function dayNum(ts) {
        const d = gristToDate(ts);
        return d ? Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000) : null;
    }
    function todayGrist() { return dateToGrist(new Date()); }
    // 'AAAA-MM-JJ' <-> Date locale (valeur des <input type="date">), sans decalage de fuseau.
    function isoDate(d) {
        if (!d || isNaN(d.getTime())) return '';
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    function parseISODate(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
        return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
    }

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
        // done = dernier statut dont le libelle/valeur evoque une cloture positive ;
        // repli = dernier statut NON annule (ancienne convention "dernier = fait",
        // corrigee quand le dernier est "Annule"), a defaut le dernier de la liste.
        const isDeadHint = s => DEAD_HINT.test(s.label) || DEAD_HINT.test(s.value);
        let doneValue = null;
        for (const s of final) { if (!isDeadHint(s) && (DONE_HINT.test(s.label) || DONE_HINT.test(s.value))) doneValue = s.value; }
        if (doneValue == null) {
            for (const s of final) { if (!isDeadHint(s)) doneValue = s.value; }
        }
        if (doneValue == null) doneValue = final[final.length - 1].value;
        const deadValues = final.filter(s => isDeadHint(s) && s.value !== doneValue).map(s => s.value);
        return {
            list: final,
            byValue,
            values: final.map(s => s.value),
            terminalValue: final[final.length - 1].value, // retro-compat ("dernier"), NE PAS utiliser pour la completion
            doneValue: doneValue,      // statut = "fait" (cloture positive)
            deadValues: deadValues,    // statuts = "annule" (exclus des actives / en retard)
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
    // Completion "positive" (remplace l'usage de isTerminal pour "fait").
    function isDone(cfg, value) { return !!cfg && value === (cfg.doneValue != null ? cfg.doneValue : cfg.terminalValue); }
    // Cloture "negative" (annule/abandonne/rejete).
    function isDead(cfg, value) { return !!cfg && Array.isArray(cfg.deadValues) && cfg.deadValues.indexOf(value) !== -1; }
    // Ni fait ni annule = actif.
    // Statut d'une tache tel que les widgets le traitent : sa valeur si elle figure dans la configuration,
    // sinon le PREMIER statut configure. Une tache au statut vide (ou supprime de la colonne Choice) reste
    // ainsi visible, rangee dans la premiere colonne, au lieu de disparaitre du Kanban.
    function statusKnown(cfg, value) { return !!cfg && !!cfg.list && cfg.list.some(function (s) { return s.value === value; }); }
    function statusOf(cfg, t) {
        const v = t ? t.statut : null;
        if (statusKnown(cfg, v)) return v;
        return cfg && cfg.firstValue != null ? cfg.firstValue : 'todo';
    }
    // Statut de reouverture quand une tache terminee repasse sous 100 % : le premier statut actif, ou le
    // suivant si de l'avancement existe deja (« En cours » plutot que « A faire »).
    function reopenValue(cfg, progression) {
        const live = cfg.list.filter(function (s) { return isLive(cfg, s.value); });
        if (!live.length) return cfg.firstValue;
        return (Number(progression) > 0 && live.length > 1) ? live[1].value : live[0].value;
    }
    // Cloture coherente : statut terminé <-> 100 % <-> dateCloture. Renvoie les champs DERIVES a ecrire en
    // plus de ce qui change (changes = { statut } ou { progression }) ; ne modifie pas la tache.
    //   - passer au statut terminé : 100 % et date de cloture (si elle n'etait pas deja posee) ;
    //   - atteindre 100 % : statut terminé et date de cloture ;
    //   - repasser sous 100 % ou quitter le statut terminé : date de cloture effacee (et statut rouvert).
    function completionPatch(cfg, task, changes) {
        const out = {};
        if (!cfg || !task || !changes) return out;
        const was = isDone(cfg, task.statut);
        if ('statut' in changes) {
            const now = isDone(cfg, changes.statut);
            if (now) { if (Number(task.progression) !== 100) out.progression = 100; if (!was) out.dateCloture = todayGrist(); }
            else if (was) out.dateCloture = null;
        } else if ('progression' in changes) {
            const p = Number(changes.progression);
            if (p >= 100 && !was) { out.statut = cfg.doneValue; out.dateCloture = todayGrist(); }
            else if (p < 100 && was) { out.statut = reopenValue(cfg, p); out.dateCloture = null; }
        }
        return out;
    }
    function isLive(cfg, value) { return !isDone(cfg, value) && !isDead(cfg, value); }

    // Coherence debut / echeance dans la fiche : une echeance ne precede jamais le debut. A appeler AVANT d'ecrire la
    // nouvelle valeur (data = tache en cours d'edition, value = nouvelle date Grist). Retourne null si rien a corriger,
    // sinon { patch, message } : changer le debut au-dela de l'echeance decale l'echeance (duree conservee) ; ramener
    // l'echeance avant le debut l'aligne sur le debut.
    function datesPatch(data, field, value) {
        if (!data || (field !== 'dateDebut' && field !== 'dateEcheance')) return null;
        const d = Number(field === 'dateDebut' ? value : data.dateDebut), e = Number(field === 'dateEcheance' ? value : data.dateEcheance);
        if (!(d > 0) || !(e > 0) || e >= d) return null;
        if (field === 'dateEcheance') return { patch: { dateEcheance: d }, message: 'L’échéance ne peut pas précéder le début : elle est alignée sur le début.' };
        const od = Number(data.dateDebut), oe = Number(data.dateEcheance);
        const span = od > 0 && oe >= od ? oe - od : 0;
        return { patch: { dateEcheance: d + span }, message: 'Échéance décalée pour conserver la durée.' };
    }
    // Une tache parente suit ses sous-taches. Apres le changement de dates de la tache `changedId`, retourne les mises a
    // jour [{ id, dateDebut, dateEcheance }] a ecrire sur ses ascendantes (de proche en proche) :
    // Chaque borne se traite a part :
    //   - la sous-tache portait la borne de sa parente (debut ou fin identique) : la parente SUIT la nouvelle borne,
    //     dans les deux sens ;
    //   - sinon (plage volontairement plus large de ce cote) : elle ne s'agrandit que si une sous-tache la depasse.
    // list = taches APRES le changement ; prev = { dateDebut, dateEcheance } de la tache avant le changement
    // (a defaut, la parente est traitee comme large). Ne modifie pas list.
    function parentSpanUpdates(list, changedId, prev) {
        const after = (list || []).map(t => Object.assign({}, t));
        const before = (list || []).map(t => Object.assign({}, t));
        const byA = new Map(after.map(t => [t.id, t]));
        const cb = before.find(t => t.id === changedId);
        if (cb && prev) { cb.dateDebut = prev.dateDebut; cb.dateEcheance = prev.dateEcheance; }
        const byB = new Map(before.map(t => [t.id, t]));
        const num = (v) => (Number(v) > 0 ? Number(v) : 0);
        const span = (arr, pid) => {
            let s = 0, e = 0;
            arr.forEach(k => {
                if (k.parentTask !== pid) return;
                const ks = num(k.dateDebut) || num(k.dateEcheance), ke = num(k.dateEcheance) || ks;
                if (!ks) return;
                if (!s || ks < s) s = ks;
                if (!e || ke > e) e = ke;
            });
            return s ? { start: s, end: e } : null;
        };
        const out = [];
        let cur = byA.get(changedId), guard = 0;
        while (cur && cur.parentTask && guard++ < 64) {
            const p = byA.get(cur.parentTask);
            if (!p) break;
            const sa = span(after, p.id);
            if (!sa) break;
            const sb = span(before, p.id);
            const pb = byB.get(p.id) || p;
            const ps = num(p.dateDebut), pe = num(p.dateEcheance);
            const tightS = !!sb && !!prev && num(pb.dateDebut) === sb.start;   // une sous-tache portait le debut
            const tightE = !!sb && !!prev && num(pb.dateEcheance) === sb.end;  // une sous-tache portait la fin
            const ns = (tightS || !ps) ? sa.start : Math.min(ps, sa.start);
            const ne = (tightE || !pe) ? sa.end : Math.max(pe, sa.end);
            if (ns !== ps || ne !== pe) { p.dateDebut = ns; p.dateEcheance = ne; out.push({ id: p.id, dateDebut: ns, dateEcheance: ne }); }
            cur = p;
        }
        return out;
    }
    // Libelle francais d'un mode de couleur (colorMode : priority / project / assignee / status).
    const COLOR_MODE_LABELS = { priority: 'priorité', project: 'projet', assignee: 'assigné', status: 'statut' };
    function colorModeLabel(mode) { return COLOR_MODE_LABELS[mode] || String(mode || ''); }

    /* ----- Interface commune : bandeau, info-bulles, clavier et lanceur ----------
     * Les boutons [data-tray-toggle] ouvrent / ferment le bandeau de saisie sous la barre
     * (voir trayToggle) ; Echap le ferme. Dans le lanceur (?shell=1) le titre du widget est
     * masque : l'onglet l'affiche deja. A appeler une fois, en fin de script du widget. */
    function initUi() {
        if (typeof document === 'undefined' || initUi.done) return;
        initUi.done = true;
        try { if (/[?&]shell/.test(location.search)) document.documentElement.classList.add('in-shell'); } catch (e) {}
        // Bandeau (recherche / filtres / affichage) : un clic sur le bouton l'ouvre ou le referme, Echap le referme.
        // Il reste ouvert pendant la manipulation du widget : les filtres s'appliquent en direct.
        document.addEventListener('click', (e) => {
            const toggle = e.target.closest ? e.target.closest('[data-tray-toggle]') : null;
            if (toggle) trayToggle(toggle.getAttribute('data-tray-toggle'));
            const host = document.getElementById('tfHeader');
            if (host) syncSearchState(host);
        });
        document.addEventListener('input', () => { const host = document.getElementById('tfHeader'); if (host) syncSearchState(host); });
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            const tray = document.getElementById('tfTray');
            if (tray && tray.classList.contains('open')) trayToggle('', false);
        });
        // Info-bulles « i » : une bulle flottante unique, centree sous le « i » puis recadree dans la fenetre
        // (retournee au-dessus si elle sortirait en bas). Placee sur le body : aucun conteneur ne la coupe.
        let tipEl = null;
        const hideTip = () => { if (tipEl) tipEl.style.display = 'none'; };
        const showTip = (e) => {
            const tip = e.target && e.target.closest ? e.target.closest('.tf-info') : null;
            if (!tip) return;
            if (!tipEl) {
                tipEl = document.createElement('div');
                tipEl.className = 'tf-tip-float';
                tipEl.setAttribute('role', 'tooltip');
                document.body.appendChild(tipEl);
            }
            tipEl.textContent = tip.getAttribute('data-tip') || '';
            tipEl.style.left = '0px'; tipEl.style.top = '0px'; tipEl.style.display = 'block';
            const r = tip.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight, m = 8, vw = window.innerWidth, vh = window.innerHeight;
            const left = Math.max(m, Math.min(r.left + r.width / 2 - w / 2, vw - w - m));
            let top = r.bottom + 8;
            if (top + h > vh - m) top = Math.max(m, r.top - h - 8);
            tipEl.style.left = left + 'px'; tipEl.style.top = top + 'px';
        };
        const leaveTip = (e) => { if (e.target && e.target.closest && e.target.closest('.tf-info')) hideTip(); };
        document.addEventListener('mouseover', showTip);
        document.addEventListener('focusin', showTip);
        document.addEventListener('mouseout', leaveTip);
        document.addEventListener('focusout', leaveTip);
        document.addEventListener('scroll', hideTip, true);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
        // Controles segmentes defilants : l'element actif est toujours ramene dans le champ.
        const revealActive = () => document.querySelectorAll('.tf-seg .btn.active').forEach(b => { if (b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
        document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.tf-seg .btn')) setTimeout(revealActive, 60); });
        setTimeout(revealActive, 300);
        // Clavier : cartes, lignes et barres sont atteignables par Tab et s'ouvrent avec Entree ou Espace.
        // Les widgets les creent chacun a leur facon (HTML ou DOM) : on les repere une fois rendus.
        const ACTIVABLES = '.task-card, .task-row, .gantt-bar, .gantt-milestone, .event-bar, .week-event-bar';
        const rendreActivables = () => {
            document.querySelectorAll(ACTIVABLES).forEach(el => {
                if (el.hasAttribute('tabindex')) return;
                el.setAttribute('tabindex', '0');
                el.setAttribute('role', 'button');
                const titre = el.querySelector('.card-title, .task-name, .gantt-bar-label, .milestone-label');
                const nom = ((titre && titre.textContent) || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90);
                if (nom) el.setAttribute('aria-label', nom);
            });
        };
        let planifie = false;
        const planifier = () => { if (planifie) return; planifie = true; requestAnimationFrame(() => { planifie = false; rendreActivables(); }); };
        if (typeof MutationObserver !== 'undefined' && document.body) new MutationObserver(planifier).observe(document.body, { childList: true, subtree: true });
        planifier();
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const el = e.target;
            if (!el || el.getAttribute('role') !== 'button' || !el.matches || !el.matches(ACTIVABLES)) return;
            e.preventDefault();
            el.click();
        });
    }

    /* ----- Composants de la barre du haut (tous les widgets) ----------------------
     * Un meme composant a le meme balisage, la meme place et le meme comportement dans
     * kanban, gantt, calendar et dashboard : chaque widget les COMPOSE (voir ui.header)
     * au lieu de recopier du HTML. Les ids et les gestionnaires restent ceux du widget
     * (ils sont passes en parametres). Disposition : titre | vue / navigation |
     * outils (recherche, filtres, affichage) | actions. Le style est dans
     * core/taskflow-ui.css. */
    const escAttr = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const UI_ICONS = {
        search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
        filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
        sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
        chevL: '<polyline points="15 18 9 12 15 6"/>',
        chevR: '<polyline points="9 18 15 12 9 6"/>',
        chevD: '<polyline points="6 9 12 15 18 9"/>',
        dots: '<circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
        download: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
        refresh: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>',
        edit: '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>',
        print: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
        image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
        plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
        today: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="16" r="1.4" fill="currentColor" stroke="none"/>',
        pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'
    };
    const uiIcon = (name, size) => '<svg width="' + (size || 14) + '" height="' + (size || 14) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (UI_ICONS[name] || '') + '</svg>';

    // Aide discrete : petite icone « i » dont le texte s'affiche au survol (ou au focus clavier).
    function uiInfo(text) {
        return '<span class="tf-info" tabindex="0" role="img" aria-label="' + escAttr(text) + '" data-tip="' + escAttr(text) + '">i</span>';
    }
    // Les donnees d'exemple ne s'affichent d'elles-memes que sur une page ouverte directement (essai, apercu),
    // ou sur demande (?demo). Dans un document Grist (iframe), une table vide reste vide : montrer des
    // taches fictives laissait croire qu'elles existaient et faisait ecrire sur des lignes inexistantes.
    // ?demo demande explicitement les donnees d'exemple : le widget n'attend alors aucune reponse de Grist (hors
    // document, derriere le lanceur, elle ne vient jamais et le squelette restait affiche).
    function isExplicitDemo() {
        try { return /[?&]demo(=|&|$)/.test(location.search); } catch (e) { return false; }
    }
    function shouldAutoDemo() {
        try {
            if (isExplicitDemo()) return true;
            return window.self === window.top;
        } catch (e) { return false; }
    }
    // Boite de dialogue interne (remplace confirm() natif, bloque dans les iframes de Grist et hors charte).
    // o = { title, message, confirmLabel, cancelLabel, danger, actions: [{ label, value, danger }] }
    // Resout avec la valeur de l'action choisie (true par defaut), ou false si annule (bouton, Echap, clic dehors).
    function uiConfirm(o) {
        o = o || {};
        const actions = o.actions || [{ label: o.confirmLabel || 'Confirmer', value: true, danger: !!o.danger }];
        return new Promise(function (resolve) {
            const prev = document.activeElement;
            const ov = document.createElement('div');
            ov.className = 'tf-modal-overlay';
            ov.innerHTML = '<div class="tf-modal" role="alertdialog" aria-modal="true" aria-labelledby="tfModalTitle">' +
                '<div class="tf-modal-title" id="tfModalTitle">' + escAttr(o.title || '') + '</div>' +
                (o.message ? '<div class="tf-modal-msg">' + escAttr(o.message) + '</div>' : '') +
                '<div class="tf-modal-actions"><button type="button" class="btn" data-i="-1">' + escAttr(o.cancelLabel || 'Annuler') + '</button>' +
                actions.map(function (a, i) { return '<button type="button" class="btn ' + (a.danger ? 'danger' : 'primary') + '" data-i="' + i + '">' + escAttr(a.label) + '</button>'; }).join('') +
                '</div></div>';
            function close(v) {
                document.removeEventListener('keydown', onKey, true);
                if (ov.parentNode) ov.parentNode.removeChild(ov);
                try { if (prev && prev.focus) prev.focus(); } catch (e) { /* focus perdu : sans consequence */ }
                resolve(v);
            }
            function onKey(e) {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
            }
            // Echap en phase de capture : la fiche situee derriere ne doit pas reagir au meme appui.
            document.addEventListener('keydown', onKey, true);
            ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(false); });
            ov.addEventListener('click', function (e) {
                const b = e.target.closest && e.target.closest('button[data-i]');
                if (!b) return;
                const i = Number(b.getAttribute('data-i'));
                close(i < 0 ? false : actions[i].value);
            });
            document.body.appendChild(ov);
            // Un geste destructeur n'est jamais le bouton par defaut.
            const focusSel = actions.some(function (a) { return a.danger; }) ? 'button[data-i="-1"]' : 'button.primary';
            const f = ov.querySelector(focusSel); if (f) f.focus();
        });
    }
    // Plan de suppression d'une tache : tasks = liste des taches (avec parentTask), mode = 'detach' (les
    // sous-taches deviennent des taches principales) ou 'cascade' (tout est supprime). Renvoie les actions
    // Grist et ce qu'il faut changer localement (mode demo).
    function deletePlan(tasks, taskId, mode) {
        const kids = {};
        (tasks || []).forEach(function (t) { if (t && t.parentTask) (kids[t.parentTask] = kids[t.parentTask] || []).push(t.id); });
        const removed = [taskId], detached = [];
        if (mode === 'cascade') {
            const seen = {}; seen[taskId] = true;
            for (let i = 0; i < removed.length; i++) (kids[removed[i]] || []).forEach(function (k) { if (!seen[k]) { seen[k] = true; removed.push(k); } });
        } else {
            (kids[taskId] || []).forEach(function (k) { detached.push(k); });
        }
        const actions = detached.map(function (k) { return ['UpdateRecord', 'Tasks', k, { parentTask: null }]; })
            .concat(removed.map(function (id) { return ['RemoveRecord', 'Tasks', id]; }));
        return { actions: actions, removed: removed, detached: detached };
    }
    // Contenu de la confirmation de suppression dans la fiche : simple, ou a trois issues si la tache a
    // des sous-taches. Les boutons appellent confirmDelete(mode) / hideDeleteConfirm() du widget.
    function deleteConfirmHtml(nKids) {
        const btn = function (cls, onclick, label) { return '<button type="button" class="delete-confirm-btn ' + cls + '" onclick="' + onclick + '">' + label + '</button>'; };
        if (!nKids) {
            return '<div class="delete-confirm-text">Supprimer cette tâche ?</div><div class="delete-confirm-actions">' +
                btn('cancel', 'hideDeleteConfirm()', 'Annuler') + btn('confirm', "confirmDelete('detach')", 'Supprimer') + '</div>';
        }
        const n = nKids === 1 ? '1 sous-tâche' : nKids + ' sous-tâches';
        return '<div class="delete-confirm-text">Cette tâche a ' + n + '. Que faire ?</div><div class="delete-confirm-actions delete-confirm-col">' +
            btn('keep', "confirmDelete('detach')", 'La supprimer seule (les sous-tâches deviennent des tâches)') +
            btn('confirm', "confirmDelete('cascade')", 'Tout supprimer (' + (nKids === 1 ? 'avec sa sous-tâche' : 'avec ses ' + nKids + ' sous-tâches') + ')') +
            btn('cancel', 'hideDeleteConfirm()', 'Annuler') + '</div>';
    }
    // Recherche commune aux quatre widgets : titre, description, tags, projet, assignes ; insensible a la
    // casse et aux accents ; plusieurs mots = tous doivent etre presents. ctx = { projects, team }.
    const searchNorm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    function searchMatch(t, query, ctx) {
        const q = searchNorm(query).trim();
        if (!q) return true;
        if (!t) return false;
        ctx = ctx || {};
        const list = (v) => (Array.isArray(v) && v[0] === 'L') ? v.slice(1) : [];
        const proj = (ctx.projects || []).find(p => p && p.id === t.projet);
        const names = list(t.assignees).map(id => { const m = (ctx.team || []).find(x => x && x.id === id); return m ? m.nom : ''; });
        const hay = searchNorm([t.titre, t.description, list(t.tags).join(' '), proj ? proj.nom : '', names.join(' ')].join(' '));
        return q.split(/\s+/).every(w => hay.indexOf(w) !== -1);
    }
    // Tri commun (affichage seulement, rien n'est ecrit dans les donnees). Modes :
    //   manual   : ordre de la table, inchange ;
    //   date     : echeance. Les taches en cours d'abord, de la plus proche a la plus lointaine ; puis les taches
    //              closees (terminees / abandonnees), de la plus recente a la plus ancienne. Sans echeance : en dernier ;
    //   priority : priorite (1 = critique) puis echeance.
    // Retourne une NOUVELLE liste ; le tri est stable (a criteres egaux, l'ordre de la table est conserve).
    function sortTasks(list, mode, cfg) {
        const arr = (list || []).slice();
        if (mode !== 'date' && mode !== 'priority') return arr;
        const echeance = (t) => { const v = Number(t && t.dateEcheance); return v > 0 ? v : null; };
        const prio = (t) => parseInt(t && t.priorite, 10) || 3;
        const fermee = (t) => !!cfg && !isLive(cfg, statusOf(cfg, t));
        const parDate = (a, b, desc) => {
            const da = echeance(a), db = echeance(b);
            if (da === null || db === null) return da === db ? 0 : (da === null ? 1 : -1);
            return desc ? db - da : da - db;
        };
        arr.sort((a, b) => {
            if (mode === 'priority') return (prio(a) - prio(b)) || parDate(a, b, false);
            const fa = fermee(a), fb = fermee(b);
            if (fa !== fb) return fa ? 1 : -1;
            return parDate(a, b, fa) || (prio(a) - prio(b));
        });
        return arr;
    }
    // Titre du widget (+ information secondaire, ex. « Mis a jour »). t = { icon (svg), text, meta (html) }
    function uiTitle(t) {
        t = t || {};
        return '<div class="hz-title"><h1>' + (t.icon || '') + '<span class="hz-title-text">' + escAttr(t.text) + '</span></h1>' + (t.meta || '') + '</div>';
    }
    // Controle segmente (Grouper, vues du Gantt / Calendrier). o = { label, cls, items: [{ label, id, view, title, onclick, active }] }
    function uiSegmented(o) {
        const items = (o.items || []).map(i =>
            '<button type="button" class="btn' + (i.active ? ' active' : '') + '"' + (i.id ? ' id="' + escAttr(i.id) + '"' : '') +
            (i.view ? ' data-view="' + escAttr(i.view) + '"' : '') + (i.title ? ' title="' + escAttr(i.title) + '"' : '') +
            ' onclick="' + escAttr(i.onclick) + '">' + escAttr(i.label) + '</button>').join('');
        return '<div class="hdr-group">' + (o.label ? '<span class="hdr-glabel">' + escAttr(o.label) + '</span>' : '') +
            '<div class="tf-seg ' + escAttr(o.cls || '') + '" role="group"' + (o.label ? ' aria-label="' + escAttr(o.label) + '"' : '') + '>' + items + '</div></div>';
    }
    // Libelle de periode a deux formes : complete (« Octobre 2026 ») et courte (« Oct. 26 »). Le CSS
    // bascule sur la courte quand la place manque ; l'info-bulle garde toujours la forme complete.
    const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    function monthShort(d) { const m = MOIS_COURTS[d.getMonth()]; return m.charAt(0).toUpperCase() + m.slice(1); }
    function monthYearShort(d) { return monthShort(d) + ' ' + String(d.getFullYear()).slice(-2); }
    function setPeriodLabel(long, short, id) {
        const el = document.getElementById(id || 'currentPeriod');
        if (!el) return;
        el.title = String(long);
        el.innerHTML = '<span class="pl-long">' + escAttr(long) + '</span><span class="pl-short">' + escAttr(short == null ? long : short) + '</span>';
    }
    // Navigation de periode, IDENTIQUE dans le Gantt et le Calendrier : ‹ periode › puis « Aujourd'hui ».
    // o = { prev, next, today, id, text }
    function uiPeriodNav(o) {
        const nav = (fn, ic, label) => '<button type="button" class="btn btn-icon btn-nav" onclick="' + escAttr(fn) + '" title="' + label + '" aria-label="' + label + '">' + uiIcon(ic, 16) + '</button>';
        return '<div class="period-nav"><div class="nav-group">' + nav(o.prev, 'chevL', 'Période précédente') +
            '<span class="current-period" id="' + escAttr(o.id || 'currentPeriod') + '" aria-live="polite">' + escAttr(o.text) + '</span>' +
            nav(o.next, 'chevR', 'Période suivante') + '</div>' +
            '<button type="button" class="btn" onclick="' + escAttr(o.today) + '" title="Aujourd\'hui" aria-label="Aujourd\'hui">' + uiIcon('today') + '<span class="btn-label">Aujourd\'hui</span></button></div>';
    }
    // Recherche. o = { id, oninput }. Champ en ligne quand la place le permet ; sinon (barre compacte) le champ
    // est deplace dans le bandeau et un bouton loupe l'ouvre (voir placeSearch).
    function uiSearch(o) {
        return '<div class="tf-search">' +
            '<button type="button" class="btn icon-btn tf-search-toggle" data-tray-toggle="search" aria-expanded="false" title="Rechercher" aria-label="Rechercher">' + uiIcon('search', 16) + '</button>' +
            '<div class="search-box"><input type="text" id="' + escAttr(o.id || 'searchInput') + '" placeholder="Rechercher..." oninput="' + escAttr(o.oninput) + '" aria-label="Rechercher"></div></div>';
    }
    // Bouton « Filtres » + panneau. Le panneau s'ouvre dans le bandeau sous la barre (il y est deplace au montage).
    // o = { containerId, buttonId, menuId, countId } (le gestionnaire de clic est celui du bandeau)
    function uiFilters(o) {
        return '<div class="filter-dropdown"' + (o.containerId ? ' id="' + escAttr(o.containerId) + '"' : '') + '>' +
            '<button type="button" class="filter-btn"' + (o.buttonId ? ' id="' + escAttr(o.buttonId) + '"' : '') + ' data-tray-toggle="filters" aria-expanded="false" title="Filtres" aria-label="Filtres">' + uiIcon('filter') + '<span class="btn-label">Filtres</span>' +
            '<span class="filter-count" id="' + escAttr(o.countId || 'filterCount') + '" style="display:none">0</span></button>' +
            '<div class="tf-panel" data-panel="filters" id="' + escAttr(o.menuId || 'filterAllMenu') + '"></div></div>';
    }
    // Selecteurs de l'affichage : memes options partout. Les ids sont ceux lus par les widgets.
    function uiSelect(o) {
        return '<select id="' + escAttr(o.id) + '" onchange="' + escAttr(o.onchange) + '"' + (o.title ? ' title="' + escAttr(o.title) + '"' : '') + '>' +
            o.options.map(p => '<option value="' + escAttr(p[0]) + '">' + escAttr(p[1]) + '</option>').join('') + '</select>';
    }
    const UI_COLOR_OPTIONS = [['priority', 'Priorité'], ['project', 'Projet'], ['assignee', 'Assigné'], ['status', 'Statut']];
    const UI_LEVEL_OPTIONS = [['all', 'Tous'], ['actions', 'Actions'], ['parents', 'Synthèses']];
    const UI_SORT_OPTIONS = [['priority', 'Priorité'], ['date', 'Date'], ['manual', 'Manuel']];
    const UI_LEVEL_TITLE = 'Niveau affiché — Tous = arbre ; Actions = tâches sans sous-tâche (feuilles) ; Synthèses = tâches qui regroupent des sous-tâches (parents)';
    const uiColorField = (title) => ({ label: 'Couleur', html: uiSelect({ id: 'colorSelect', onchange: 'changeColorMode(this.value)', title: title, options: UI_COLOR_OPTIONS }) });
    const uiLevelField = () => ({ label: 'Niveau', html: uiSelect({ id: 'levelSelect', onchange: 'changeWorkLevel(this.value)', title: UI_LEVEL_TITLE, options: UI_LEVEL_OPTIONS }) });
    const uiSortField = (options) => ({ label: 'Tri', html: uiSelect({ id: 'sortSelect', onchange: 'changeSortMode(this.value)', options: options || UI_SORT_OPTIONS }) });
    // Vues enregistrees (contexte commun) : le contenu est rendu par TF.ctx a chaque changement.
    const uiViewsField = () => ({ label: 'Vue', html: '<div class="tf-views"></div>' });
    // Menu « Affichage » : regroupe couleur, niveau, tri et les actions de vue. o = { fields: [{ label, html }], actions: [{ label, onclick, title }] }
    function uiDisplayMenu(o) {
        const fields = (o.fields || []).map(f => '<label class="tf-field"><span class="tf-field-label">' + escAttr(f.label) + '</span>' + f.html + '</label>').join('');
        const acts = (o.actions || []).map(a => '<button type="button" class="btn tf-menu-action"' + (a.id ? ' id="' + escAttr(a.id) + '"' : '') + ' onclick="' + escAttr(a.onclick) + '"' + (a.title ? ' title="' + escAttr(a.title) + '"' : '') + '>' + escAttr(a.label) + '</button>').join('');
        return '<div class="view-menu"><button type="button" class="btn" data-tray-toggle="display" aria-expanded="false" title="Options d\'affichage" aria-label="Affichage">' +
            uiIcon('sliders') + '<span class="btn-label">Affichage</span><span class="btn-label btn-chev">' + uiIcon('chevD', 12) + '</span></button>' +
            '<div class="tf-panel" data-panel="display" role="group" aria-label="Options d\'affichage">' + fields + acts + '</div></div>';
    }
    // Menu d'actions (« ⋯ », export). o = { toggle, containerId, menuId, icon, title, items: [{ label, icon, html, id, onclick } | { sep: true }] }
    function uiMoreMenu(o) {
        const items = (o.items || []).map(i => i.sep ? '<div class="filter-sep"></div>' :
            '<div class="filter-option"' + (i.id ? ' id="' + escAttr(i.id) + '"' : '') + ' onclick="' + escAttr(i.onclick) + '">' + (i.html || (i.icon ? uiIcon(i.icon) : '')) + ' ' + escAttr(i.label) + '</div>').join('');
        const title = o.title || 'Plus d\'actions';
        return '<div class="filter-dropdown"' + (o.containerId ? ' id="' + escAttr(o.containerId) + '"' : '') + '>' +
            '<button type="button" class="btn icon-btn" onclick="' + escAttr(o.toggle) + '" title="' + escAttr(title) + '" aria-label="' + escAttr(title) + '">' + uiIcon(o.icon || 'dots', 16) + '</button>' +
            '<div class="filter-menu filter-menu-right"' + (o.menuId ? ' id="' + escAttr(o.menuId) + '"' : '') + '>' + items + '</div></div>';
    }
    // Bouton generique. o = { id, label, icon, title, onclick, cls, primary, iconOnly, count }
    function uiButton(o) {
        const cls = o.cls || (o.primary ? 'btn primary' : (o.iconOnly ? 'btn icon-btn' : 'btn'));
        return '<button type="button" class="' + escAttr(cls) + '"' + (o.id ? ' id="' + escAttr(o.id) + '"' : '') + ' onclick="' + escAttr(o.onclick) + '"' +
            ((o.title || (o.icon && o.label)) ? ' title="' + escAttr(o.title || o.label) + '"' : '') + ((o.iconOnly || o.icon) ? ' aria-label="' + escAttr(o.title || o.label) + '"' : '') + '>' +
            (o.icon ? uiIcon(o.icon, o.iconOnly ? 16 : 14) : '') + (o.label && !o.iconOnly ? (o.icon ? '<span class="btn-label">' + escAttr(o.label) + '</span>' : escAttr(o.label)) : '') +
            (o.count ? '<span class="filter-count" id="' + escAttr(o.count) + '" style="display:none">0</span>' : '') + '</button>';
    }
    // Barre complete. o = { title, view: [html], tools: [html], actions: [html] }
    function uiHeader(o) {
        return uiTitle(o.title) +
            ((o.view && o.view.length) ? '<div class="hz-view">' + o.view.join('') + '</div>' : '') +
            '<div class="hz-tools">' + (o.tools || []).join('') + '</div>' +
            '<div class="hz-actions">' + (o.actions || []).join('') + '</div>' +
            '<div class="tf-tray" id="tfTray"><div class="tf-panel" data-panel="search"></div></div>';
    }

    /* ----- Bandeau de saisie temporaire et ajustement de la barre ---------------------
     * Recherche, filtres et affichage s'ouvrent dans un meme bandeau sous la barre (qui pousse le
     * contenu, comme un volet) : on y saisit, puis on le referme. La barre tient sur UNE ligne quand
     * la place le permet ; sinon elle se compacte (libelles en icones, recherche dans le bandeau), puis
     * seulement en dernier recours passe sur deux lignes. L'ajustement mesure le debordement reel. */
    function trayToggle(name, force) {
        const tray = document.getElementById('tfTray');
        if (!tray) return;
        const panel = name ? tray.querySelector('.tf-panel[data-panel="' + name + '"]') : null;
        if (name && !panel) return;
        const open = !!panel && (typeof force === 'boolean' ? force : !panel.classList.contains('open'));
        tray.querySelectorAll('.tf-panel.open').forEach(p => p.classList.remove('open'));
        if (open) panel.classList.add('open');
        tray.classList.toggle('open', open);
        document.querySelectorAll('[data-tray-toggle]').forEach(b => {
            const on = open && b.getAttribute('data-tray-toggle') === name;
            b.classList.toggle('is-open', on);
            b.setAttribute('aria-expanded', String(on));
        });
        if (open && name === 'search') { const i = panel.querySelector('input'); if (i) i.focus(); }
    }
    function syncSearchState(host) {
        const input = host.querySelector('.search-box input');
        const btn = host.querySelector('.tf-search-toggle');
        if (input && btn) btn.classList.toggle('has-filter', !!input.value);
    }
    function placeSearch(host, compact) {
        const box = host.querySelector('.search-box');
        const slot = host.querySelector('.tf-search');
        const panel = host.querySelector('.tf-panel[data-panel="search"]');
        if (!box || !slot || !panel) return;
        if (compact && box.parentNode !== panel) panel.appendChild(box);
        if (!compact && box.parentNode !== slot) {
            slot.appendChild(box);
            if (panel.classList.contains('open')) trayToggle('search', false);
        }
    }
    // Liste deroulante d'un champ de la fiche (.multi-select) : elle s'ouvre vers le bas, sauf si la fiche defile et
    // qu'elle serait coupee par le bord de la zone visible alors qu'il y a plus de place au-dessus.
    function placeDropdown(ms) {
        if (!ms || !ms.querySelector) return;
        ms.classList.remove('up');
        const dd = ms.querySelector('.multi-select-dropdown');
        if (!dd || !ms.classList.contains('open')) return;
        const zone = ms.closest('.panel-content') || ms.closest('.panel');
        const zr = zone ? zone.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
        const bas = Math.min(zr.bottom, window.innerHeight) - 4, haut = Math.max(zr.top, 0) + 4;
        const t = ms.getBoundingClientRect(), r = dd.getBoundingClientRect();
        if (r.bottom > bas && (t.top - haut) > (bas - t.bottom)) ms.classList.add('up');
    }
    // Diagnostic : la barre deborde-t-elle ? (utilise par les controles de largeur, pas par la mise en page)
    function headerOverflow(host) {
        host = host || document.getElementById('tfHeader');
        if (!host) return false;
        const zones = ['.hz-view', '.hz-tools'].map(q => host.querySelector(q)).filter(Boolean);
        return host.scrollWidth > host.clientWidth + 1 || zones.some(z => z.scrollWidth > z.clientWidth + 1) ||
            Array.prototype.some.call(host.querySelectorAll('.hz-view .tf-seg'), g => g.scrollWidth > g.clientWidth + 1);
    }
    // Etat de la barre : { top: actions et navigation en icones, search: recherche en loupe, tools: Filtres / Affichage aussi en icones,
    // bare: titre sans texte, two: deux lignes }.
    function applyMode(host, m) {
        host.classList.toggle('hz-search', !!(m.search || m.tools));   // recherche en loupe (champ dans le bandeau)
        host.classList.toggle('hz-compact', !!m.tools);                // Filtres / Affichage aussi en icones
        host.classList.toggle('hz-top', !!m.top);
        host.classList.toggle('hz-bare', !!m.bare);
        host.classList.toggle('hz-two', !!m.two);
    }
    // La disposition ne depend QUE de la largeur du widget : a largeur egale, les quatre widgets se comportent
    // exactement de la meme facon (une mesure du contenu donnait des barres differentes d'un widget a l'autre).
    // Priorite a UNE seule ligne : on prefere des icones aux grands boutons, et la zone « vue » (periodes) defile
    // au besoin. Deux lignes seulement sur un ecran etroit (telephone). Seuils cales sur le contenu le plus large
    // (Calendrier : navigation + six periodes) ; le controle de largeur verifie qu'aucun widget ne deborde.
    const HEADER_STEPS = [
        [1480, {}],                                         // libelles complets
        [1360, { top: true }],                              // actions et navigation en icones
        [1240, { top: true, search: true }],                // + recherche en loupe
        [1120, { top: true, tools: true }],                 // + Filtres / Affichage en icones
        [720, { top: true, tools: true, bare: true }]       // + titre sans texte
    ];
    function modeForWidth(w) {
        for (const [min, m] of HEADER_STEPS) if (w >= min) return Object.assign({}, m);
        // Deux lignes : les libelles des outils (Rechercher, Filtres, Affichage) ne s'affichent que sur la
        // premiere ligne quand la place y est ; sur la 2e ligne, des icones seulement.
        return { two: true, top: true, tools: true, bare: true };
    }
    function chooseMode(host) {
        const m = modeForWidth(host.clientWidth);
        placeSearch(host, !!(m.search || m.tools));
        applyMode(host, m);
        return m;
    }
    function fitHeader(host) {
        host = host || (typeof document !== 'undefined' ? document.getElementById('tfHeader') : null);
        if (!host || fitHeader.busy) return;
        // Pendant la saisie dans le champ de recherche, la disposition ne bouge pas (le deplacer ferait perdre le focus).
        const actif = document.activeElement;
        if (actif && actif.matches && actif.matches('.search-box input') && host.contains(actif)) return;
        fitHeader.busy = true;
        try {
            chooseMode(host);
            syncSearchState(host);
        } finally {
            fitHeader.busy = false;
            // nos propres deplacements ne doivent pas declencher une nouvelle mesure
            if (fitHeader.observer) fitHeader.observer.takeRecords();
        }
    }
    function setupHeader(host) {
        const tray = host.querySelector('.tf-tray');
        if (!tray) return;
        host.querySelectorAll('.hz-view .tf-panel, .hz-tools .tf-panel, .hz-actions .tf-panel').forEach(p => tray.appendChild(p));
        let attente = false;
        const refit = () => { if (attente) return; attente = true; requestAnimationFrame(() => { attente = false; fitHeader(host); }); };
        window.addEventListener('resize', refit);
        if (typeof ResizeObserver !== 'undefined') {
            let largeur = -1;
            new ResizeObserver(() => { const w = host.clientWidth; if (w !== largeur) { largeur = w; refit(); } }).observe(host);
        }
        // Le texte de la periode change la largeur du contenu : on remesure (hors bandeau, qui n'y change rien).
        if (typeof MutationObserver !== 'undefined') {
            fitHeader.observer = new MutationObserver((muts) => {
                if (fitHeader.busy) return;
                if (muts.some(m => { const n = m.target.nodeType === 1 ? m.target : m.target.parentElement; return n && !n.closest('.tf-tray'); })) refit();
            });
            fitHeader.observer.observe(host, { childList: true, characterData: true, subtree: true });
        }
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
        fitHeader(host);
        setTimeout(() => fitHeader(host), 300);
    }
    function mountHeader(o, el) {
        const host = el || (typeof document !== 'undefined' ? document.getElementById('tfHeader') : null);
        if (host) { host.innerHTML = uiHeader(o); setupHeader(host); }
        initUi();
    }
    const ui = {
        icon: uiIcon, info: uiInfo, title: uiTitle, segmented: uiSegmented, periodNav: uiPeriodNav, search: uiSearch, filters: uiFilters,
        select: uiSelect, colorField: uiColorField, levelField: uiLevelField, sortField: uiSortField, viewsField: uiViewsField, placeDropdown: placeDropdown,
        displayMenu: uiDisplayMenu, moreMenu: uiMoreMenu, button: uiButton, header: uiHeader, mount: mountHeader,
        tray: trayToggle, refit: fitHeader, overflow: headerOverflow, modeForWidth: modeForWidth
    };

    /* ----- En-tete de la fiche de tache ---------------------------------------
     * Le titre editable (#taskTitle) EST l'en-tete ; la navigation "n/m" entre les
     * taches est integree a cote (fleches + compteur), puis la fermeture. Le
     * handler oninput de #taskTitle est celui de chaque widget (updateField) :
     * oninput (noSave=true) pour l'affichage immediat sans sauver a chaque frappe ;
     * onchange (noSave par defaut = false) pour sauver une fois a la perte du focus
     * (bug corrige le 01/11/2026 : sans onchange, un titre seul jamais touche par
     * un autre champ n'etait jamais envoye a Grist — signale sur le forum).
     * o = { title, placeholder, index, total, isNew, back, dotColor, dotTitle } */
    function panelHeaderHtml(o) {
        o = o || {};
        const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const chevron = (pts) => '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="' + pts + '"/></svg>';
        const hasNav = !o.isNew && Number(o.total) > 1;
        const nav = hasNav
            ? '<div class="panel-nav" role="group" aria-label="Navigation entre les tâches">' +
                '<button type="button" class="panel-nav-btn" onclick="navigatePanelTask(-1)" title="Tâche précédente" aria-label="Tâche précédente">' + chevron('15 18 9 12 15 6') + '</button>' +
                '<span class="panel-count" aria-live="polite">' + (Number(o.index) + 1) + '/' + Number(o.total) + '</span>' +
                '<button type="button" class="panel-nav-btn" onclick="navigatePanelTask(1)" title="Tâche suivante" aria-label="Tâche suivante">' + chevron('9 18 15 12 9 6') + '</button>' +
              '</div>'
            : '';
        const back = o.back
            ? '<button type="button" class="panel-nav-btn panel-back" onclick="backToPeriod()" title="Retour" aria-label="Retour">' + chevron('15 18 9 12 15 6') + '</button>'
            : '';
        const dot = o.dotColor ? '<span class="panel-dot" style="background:' + esc(o.dotColor) + '" title="' + esc(o.dotTitle || '') + '"></span>' : '';
        return back + dot +
            '<input type="text" class="panel-title-edit" id="taskTitle" placeholder="' + esc(o.placeholder) + '" value="' + esc(o.title) + '" oninput="updateField(\'titre\', this.value, true)" onchange="updateField(\'titre\', this.value)" aria-label="Titre">' +
            nav +
            '<button type="button" class="panel-close" onclick="confirmClosePanel()" title="Fermer" aria-label="Fermer">×</button>';
    }

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
            const day0 = dayNum(s);
            const day1 = dayNum(e);
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
            const d0 = dayNum(t.dateDebut), d1 = dayNum(t.dateEcheance);
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
    /* ----- Contexte commun de consultation --------------------------------------------
     * Un seul etat par document et par navigateur, lu et ecrit par tous les widgets : filtres (projet, priorite,
     * assigne, statut), couleur, tri, niveau, sous-taches. Un filtre pose dans le Kanban s'applique donc aussi
     * au Gantt, au Calendrier et au Dashboard. Il vit dans le stockage local du navigateur (jamais dans les
     * options Grist, sinon le bouton « Enregistrer » de la section s'allume a chaque manipulation) ; les widgets
     * d'une meme page se previennent par l'evenement « storage ». Une valeur nulle = defaut propre au widget.
     * Vues nommees : instantanes du contexte, personnels, dans le meme stockage. Position (date affichee) du
     * Gantt et du Calendrier : memorisee quelques heures, puis on revient sur aujourd'hui. */
    const CTX_COLORS = ['priority', 'project', 'assignee', 'status'];
    const CTX_SORTS = ['manual', 'date', 'priority'];
    const CTX_LEVELS = ['all', 'actions', 'parents'];
    const CTX_POS_MAX_AGE = 12 * 3600 * 1000;
    function ctxBlank() {
        return { filters: { project: [], priority: [], assignee: [], status: [] }, color: null, sort: null, level: null, subs: null, view: null };
    }
    function ctxList(arr, conv) {
        const out = [];
        (Array.isArray(arr) ? arr : []).forEach(v => {
            const x = conv(v);
            if (conv === Number ? isFinite(x) : x !== '') { if (out.indexOf(x) === -1) out.push(x); }
        });
        return out;
    }
    // Normalise un contexte lu du stockage (ou venu d'un autre widget) : types fixes, valeurs inconnues ecartees.
    function ctxClean(raw) {
        const out = ctxBlank();
        if (!raw || typeof raw !== 'object') return out;
        const f = raw.filters && typeof raw.filters === 'object' ? raw.filters : {};
        out.filters.project = ctxList(f.project, Number);
        out.filters.priority = ctxList(f.priority, Number);
        out.filters.assignee = ctxList(f.assignee, Number);
        out.filters.status = ctxList(f.status, String);
        out.color = CTX_COLORS.indexOf(raw.color) !== -1 ? raw.color : null;
        out.sort = CTX_SORTS.indexOf(raw.sort) !== -1 ? raw.sort : null;
        out.level = CTX_LEVELS.indexOf(raw.level) !== -1 ? raw.level : null;
        out.subs = typeof raw.subs === 'boolean' ? raw.subs : null;
        out.view = typeof raw.view === 'string' && raw.view ? raw.view : null;
        return out;
    }
    // Ce qu'une vue memorise : tout le contexte sauf le nom de la vue elle-meme.
    function ctxData(s) { return { filters: s.filters, color: s.color, sort: s.sort, level: s.level, subs: s.subs }; }
    function createCtx(env) {
        env = env || {};
        const store = env.storage || null;
        const now = env.now || Date.now;
        let ns = null, state = ctxBlank(), views = [];
        const listeners = [];
        const keyCtx = () => 'taskflow_ctx_' + ns;
        const keyViews = () => 'taskflow_views_' + ns;
        const keyPos = (w) => 'taskflow_pos_' + ns + '_' + w;
        const rd = (k) => { try { return store ? store.getItem(k) : null; } catch (e) { return null; } };
        const wr = (k, v) => { try { if (store) store.setItem(k, v); } catch (e) { /* stockage indisponible */ } };
        const copy = (o) => JSON.parse(JSON.stringify(o));
        const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
        const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
        // Reglages memorises par widget avant le contexte commun : repris une fois, a la premiere ouverture du document.
        function legacy(w) {
            const s = ctxBlank();
            if (!w) return s;
            const f = parse(rd('taskflow_' + w + '_filters'));
            if (f) s.filters = f;
            s.color = rd('taskflow_' + w + '_colormode');
            s.sort = rd('taskflow_' + w + '_sort');
            s.level = rd('taskflow_' + w + '_worklevel');
            const sub = rd('taskflow_' + w + '_showsubs');
            s.subs = sub === null ? null : sub === '1';
            return ctxClean(s);
        }
        function loadViews() {
            const l = parse(rd(keyViews()));
            return (Array.isArray(l) ? l : []).filter(v => v && typeof v.name === 'string' && v.name).map(v => ({ name: v.name, data: ctxData(ctxClean(v.data)) }));
        }
        function modified() {
            if (!state.view) return false;
            const v = views.find(x => x.name === state.view);
            return !v || !same(ctxData(state), v.data);
        }
        // --- Selecteur de vues (menu Affichage) : rendu a chaque changement de contexte ou de liste de vues.
        function viewsHtml() {
            const mod = modified();
            const opts = '<option value="">Aucune vue</option>' + views.map(v =>
                '<option value="' + escAttr(v.name) + '"' + (v.name === state.view ? ' selected' : '') + '>' + escAttr(v.name) + (v.name === state.view && mod ? ' (modifiée)' : '') + '</option>').join('');
            return '<select id="tfViewSelect" onchange="TF.ctx.pickView(this.value)" aria-label="Vue enregistrée">' + opts + '</select>' +
                '<span class="tf-views-save"><input type="text" id="tfViewName" maxlength="40" placeholder="Nom de la vue" aria-label="Nom de la vue" value="' + escAttr(state.view || '') + '" ' +
                'onkeydown="if(event.key===\'Enter\'){TF.ctx.saveViewFromUi();event.preventDefault();}">' +
                '<button type="button" class="btn" onclick="TF.ctx.saveViewFromUi()" title="Enregistrer les filtres, le tri, la couleur et le niveau actuels sous ce nom">Enregistrer</button>' +
                (state.view ? '<button type="button" class="btn" onclick="TF.ctx.removeViewFromUi()" title="Supprimer cette vue">Supprimer</button>' : '') + '</span>';
        }
        // Une vue supprimee ailleurs ne doit plus rester « active ».
        function dropGhostView() {
            if (state.view && !views.some(v => v.name === state.view)) { state = ctxClean(Object.assign(copy(state), { view: null })); wr(keyCtx(), JSON.stringify(state)); }
        }
        function renderViews() {
            if (typeof document === 'undefined') return;
            const a = document.activeElement;
            if (a && a.id === 'tfViewName') return;   // ne pas effacer un nom en cours de saisie
            document.querySelectorAll('.tf-views').forEach(el => { el.innerHTML = viewsHtml(); });
        }
        function commit(next, source) {
            if (same(next, state)) return false;
            state = next;
            wr(keyCtx(), JSON.stringify(state));
            renderViews();
            // Le widget qui agit se met a jour lui-meme ; les autres, et lui-meme apres le choix d'une vue, sont prevenus.
            if (source === 'external' || source === 'view') listeners.forEach(fn => { try { fn(copy(state), source); } catch (e) { /* un ecouteur ne bloque pas les autres */ } });
            return true;
        }
        function refresh() {
            if (ns === null) return;
            const raw = parse(rd(keyCtx()));
            const nv = loadViews();
            const viewsChanged = !same(nv, views);
            views = nv;
            if (raw) {
                const next = ctxClean(raw);
                if (!same(next, state)) { state = next; dropGhostView(); renderViews(); listeners.forEach(fn => { try { fn(copy(state), 'external'); } catch (e) {} }); return; }
            }
            if (viewsChanged) { dropGhostView(); renderViews(); }
        }
        const api = {
            // Associe le contexte a un document. widget = nom du widget, pour reprendre ses anciens reglages.
            bind: function (docId, widget) {
                ns = String(docId || 'doc');
                const raw = parse(rd(keyCtx()));
                state = raw ? ctxClean(raw) : legacy(widget);
                if (!raw) wr(keyCtx(), JSON.stringify(state));
                views = loadViews();
                dropGhostView();
                if (typeof window !== 'undefined' && !api._wired) {
                    api._wired = true;
                    window.addEventListener('storage', e => { if (e.key === keyCtx() || e.key === keyViews()) refresh(); });
                    window.addEventListener('focus', refresh);
                    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
                }
                renderViews();
                return copy(state);
            },
            init: async function (grist, widget) {
                let id = null;
                try {
                    if (grist && grist.docApi && grist.docApi.getDocName) id = await Promise.race([grist.docApi.getDocName(), new Promise(r => setTimeout(() => r(null), 2000))]);
                } catch (e) { /* identifiant indisponible : contexte commun a tous les documents du navigateur */ }
                return api.bind(id, widget);
            },
            get: function () { return copy(state); },
            // patch = { filters: { project: [..] }, color, sort, level, subs, view } ; seules les cles presentes changent.
            set: function (patch) {
                const next = copy(state);
                patch = patch || {};
                if (patch.filters) Object.keys(next.filters).forEach(k => { if (patch.filters[k] !== undefined) next.filters[k] = patch.filters[k]; });
                ['color', 'sort', 'level', 'subs', 'view'].forEach(k => { if (k in patch) next[k] = patch[k]; });
                return commit(ctxClean(next), 'local');
            },
            // fn(contexte, source) quand le contexte change SANS que ce widget en soit l'auteur : source = 'external' ou 'view'.
            onChange: function (fn) { listeners.push(fn); },
            // Ecarte les filtres devenus sans objet (projet supprime, membre retire, statut renomme) : ils masqueraient
            // tout sans qu'on puisse les retirer. valid = { project: [ids], assignee: [ids], status: [valeurs] } ;
            // une liste vide n'est pas appliquee (donnees pas encore lues). Retourne le nombre de filtres retires.
            prune: function (valid) {
                const next = copy(state);
                let removed = 0;
                ['project', 'assignee', 'status'].forEach(k => {
                    const ok = valid && valid[k];
                    if (!ok || !ok.length) return;
                    const keep = new Set(ok.map(k === 'status' ? String : Number));
                    const kept = next.filters[k].filter(v => keep.has(v));
                    removed += next.filters[k].length - kept.length;
                    next.filters[k] = kept;
                });
                if (removed) commit(next, 'prune');
                return removed;
            },
            views: {
                list: function () { return views.map(v => v.name); },
                current: function () { return state.view; },
                modified: modified,
                save: function (name) {
                    name = String(name == null ? '' : name).trim().slice(0, 40);
                    if (!name) return false;
                    const data = copy(ctxData(state));
                    const i = views.findIndex(v => v.name === name);
                    if (i >= 0) views[i].data = data; else views.push({ name: name, data: data });
                    wr(keyViews(), JSON.stringify(views));
                    if (!commit(ctxClean(Object.assign(copy(state), { view: name })), 'local')) renderViews();
                    return true;
                },
                apply: function (name) {
                    const v = views.find(x => x.name === name);
                    if (!v) return false;
                    commit(ctxClean(Object.assign(copy(v.data), { view: name })), 'view');
                    return true;
                },
                clear: function () { return commit(ctxClean(Object.assign(copy(state), { view: null })), 'local'); },
                remove: function (name) {
                    const n = views.length;
                    views = views.filter(v => v.name !== name);
                    if (views.length === n) return false;
                    wr(keyViews(), JSON.stringify(views));
                    if (state.view === name) commit(ctxClean(Object.assign(copy(state), { view: null })), 'local'); else renderViews();
                    return true;
                }
            },
            // Appels des controles du menu Affichage.
            pickView: function (name) { if (name) api.views.apply(name); else api.views.clear(); },
            saveViewFromUi: function () {
                const input = typeof document !== 'undefined' ? document.getElementById('tfViewName') : null;
                const name = input ? input.value : '';
                if (!api.views.save(name) && input) input.focus();
                else if (input) input.blur();
            },
            removeViewFromUi: function () { if (state.view) api.views.remove(state.view); },
            // Position affichee (Gantt, Calendrier) : { iso, fit, ... } memorisee 12 h au plus.
            pos: {
                get: function (widget) {
                    if (ns === null) return null;
                    const p = parse(rd(keyPos(widget)));
                    return p && typeof p.t === 'number' && now() - p.t < CTX_POS_MAX_AGE ? p : null;
                },
                set: function (widget, value) { if (ns !== null) wr(keyPos(widget), JSON.stringify(Object.assign({}, value, { t: now() }))); }
            },
            renderViews: renderViews,
            // Relit le stockage (appele sur l'evenement « storage », au retour de focus ; expose pour les tests).
            refresh: refresh
        };
        return api;
    }
    let ctxStorage = null;
    try { ctxStorage = typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { ctxStorage = null; }
    const ctx = createCtx({ storage: ctxStorage });

    // Un widget cree la table Tasks dans un document neuf alors qu'il est lie a la table par defaut de Grist
    // (« Table1 ») : onRecords ne se declenche alors jamais pour Tasks. On rattache la section a Tasks, une seule
    // fois, seulement si c'est sans ambiguite (une seule section personnalisee sur la table liee) et si la table
    // liee est vide ou porte le nom par defaut. Grist recree alors l'iframe ; un avis s'affiche au redemarrage.
    // Annulable (Ctrl+Z) dans Grist. Appeler juste apres la creation de Tasks, en fin de schema.
    async function relinkToTasks(grist) {
        try {
            if (isReadOnly() || !grist || !grist.selectedTable) return false;
            const liee = await grist.selectedTable.getTableId();
            if (!liee || liee === 'Tasks') return false;
            const tables = columnarToRows(await grist.docApi.fetchTable('_grist_Tables'));
            const from = tables.find(t => t.tableId === liee), to = tables.find(t => t.tableId === 'Tasks');
            if (!from || !to) return false;
            const sections = columnarToRows(await grist.docApi.fetchTable('_grist_Views_section')).filter(s => s.parentKey === 'custom' && s.tableRef === from.id);
            if (sections.length !== 1) return false;
            const data = await grist.docApi.fetchTable(liee);
            const vide = !data || !data.id || data.id.length === 0;
            if (!vide && !/^Table\d+$/.test(liee)) return false;
            try { localStorage.setItem('taskflow_relinked', '1'); } catch (e) {}
            await grist.docApi.applyUserActions([['UpdateRecord', '_grist_Views_section', sections[0].id, { tableRef: to.id }]]);
            return true;
        } catch (e) { return false; }
    }
    // Vrai une seule fois, au demarrage qui suit un rattachement a Tasks (pour l'annoncer).
    function consumeRelinkNotice() {
        try { if (localStorage.getItem('taskflow_relinked')) { localStorage.removeItem('taskflow_relinked'); return true; } } catch (e) {}
        return false;
    }
    // Garde transverse : enrobe grist.docApi.applyUserActions une seule fois pour
    // respecter les droits sur TOUS les sites d'ecriture sans les modifier un a un.
    // - lecture seule -> bloque + opts.onReadOnly()
    // - refus ACL au niveau ligne -> opts.onDenied(err) (le widget toast + recharge)
    // Les erreurs continuent d'etre levees (les try/catch existants les absorbent).
    // Rafraichissement de secours. grist.onRecords ne se declenche que pour la table LIEE a la section : un widget lie a
    // une autre table (cas courant : la table proposee par defaut a l'ajout du widget) ne voyait pas les saisies faites
    // dans Tasks. Si la table liee n'est pas Tasks, on la relit toutes les 15 s (page visible) et au retour sur la page,
    // et on recharge seulement si elle a change, sans interrompre une saisie en cours. opts = { table, every, busy }.
    const watchState = { baseline: null, on: false };
    function watchTasks(grist, reload, opts) {
        opts = opts || {};
        if (!grist || !grist.docApi || typeof document === 'undefined' || watchState.on) return;
        watchState.on = true;
        const table = opts.table || 'Tasks';
        const occupe = () => {
            const a = document.activeElement;
            if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true;
            if (document.querySelector('.panel.open, .tf-modal-overlay')) return true;
            return !!(opts.busy && opts.busy());
        };
        let enCours = false;
        const verifier = async () => {
            if (enCours || document.visibilityState === 'hidden') return;
            enCours = true;
            try {
                const signature = JSON.stringify(await grist.docApi.fetchTable(table));
                if (watchState.baseline === null) watchState.baseline = signature;
                else if (signature !== watchState.baseline && !occupe()) { watchState.baseline = signature; await reload(); }
            } catch (e) { /* lecture impossible : on reessaiera */ }
            finally { enCours = false; }
        };
        (async () => {
            let liee = null;
            try { liee = await grist.selectedTable.getTableId(); } catch (e) { /* aucune table liee */ }
            if (liee === table) return;   // onRecords suffit
            setInterval(verifier, opts.every || 15000);
            document.addEventListener('visibilitychange', verifier);
            window.addEventListener('focus', verifier);
            verifier();
        })();
    }
    function guardWrites(grist, opts) {
        opts = opts || {};
        if (!grist || !grist.docApi || grist.docApi._tfGuarded) return;
        const raw = grist.docApi.applyUserActions.bind(grist.docApi);
        grist.docApi._tfGuarded = true;
        grist.docApi.applyUserActions = async function (actions) {
            if (isReadOnly()) { try { opts.onReadOnly && opts.onReadOnly(); } catch (e) {} const err = new Error('Document en lecture seule'); err.tfReadOnly = true; throw err; }
            try { const r = await raw(actions); watchState.baseline = null; return r; }   // nos propres ecritures ne doivent pas declencher un rechargement de secours
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

    /* ============================================================================
     * ThemeDef — thème de l'instance / du document, posé en variables --kit-*
     * ----------------------------------------------------------------------------
     * Les widgets portent deja `--primary: var(--kit-accent, #3e5de7)` etc. (repli =
     * valeur d'avant, zero changement tant que rien ne pose ces variables). Ce bloc
     * est le LECTEUR : Theme_document du document > thème de l'instance Grist >
     * rien (reglage "sans theme" opt-out par widget, toujours prioritaire).
     *
     * Deux modules PURS sont vendorises ici tels quels (copie mecanique, empreinte
     * sha256 en tete) depuis projects/appkit/kit/jetons/themedef/lib/ : la couleur
     * d'action qu'ils rendent peut encore changer (Nicolas doit trancher AAA/AA,
     * cf. WikiChat #publication-commune, 01/11/2026) — ce lecteur ne la fige pas,
     * il consomme simplement ce que la derivation renvoie a chaque appel.
     * ========================================================================== */
    const ThemeVendor = (function () {
        'use strict';

        /* ---- theme-instance.mjs — sha256 c61f40f6b86f34757243dac21dbba577d8c501de7917835f397f56f86a6f006b ---- */
        const VERSION_THEMEDEF_INSTANCE = 'themedef-1.0';
        const CANDIDATS_ACTION = Object.freeze(['control-primary-bg', 'primary-muted', 'primary-dim', 'accent-text', 'control-fg', 'link', 'primary']);
        const CLES_INSTANCE = Object.freeze([...CANDIDATS_ACTION, 'page-bg', 'text', 'font-family']);
        const SEUIL_INSTANCE = 4.5;
        const hexDeI = (canaux) => `#${canaux.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
        const NOIR_I = hexDeI([0, 0, 0]);
        const BLANC_I = hexDeI([255, 255, 255]);
        const SURFACE_SOMBRE = hexDeI([30, 30, 30]);
        const FONDS_DERIVES = Object.freeze({ clair: BLANC_I, sombre: hexDeI([22, 22, 22]) });
        const LONGUEUR_PILE = 300;
        const objetI = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
        const HEX3_I = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
        const HEX6_I = /^#[0-9a-f]{6}$/i;
        function hexSur(v) {
            if (typeof v !== 'string') return null;
            const t = v.trim();
            if (HEX6_I.test(t)) return t.toLowerCase();
            const m = HEX3_I.exec(t);
            return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toLowerCase() : null;
        }
        function pileSure(v) {
            if (typeof v !== 'string') return null;
            const t = v.replace(/\s+/g, ' ').trim();
            return t.length <= LONGUEUR_PILE && /^[A-Za-z0-9 ,"'.-]+$/.test(t) ? t : null;
        }
        const canauxI = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
        const luminanceI = (h) => {
            const [r, g, b] = canauxI(h).map((v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        function contrasteInstance(a, b) {
            const x = luminanceI(a), y = luminanceI(b);
            return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
        }
        const poleI = (fond) => (contrasteInstance(NOIR_I, fond) >= contrasteInstance(BLANC_I, fond) ? NOIR_I : BLANC_I);
        function melangeI(couleur, vers, pct) {
            const a = canauxI(couleur), b = canauxI(vers);
            return `#${a.map((c, i) => Math.round(c + (b[i] - c) * pct / 100).toString(16).padStart(2, '0')).join('')}`;
        }
        function redresserI(couleur, fonds) {
            const vers = poleI(fonds[0]);
            for (let pct = 1; pct <= 100; pct++) {
                const c = melangeI(couleur, vers, pct);
                if (fonds.every((f) => contrasteInstance(c, f) >= SEUIL_INSTANCE)) return c;
            }
            return null;
        }
        const lineaireI = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        const gammaI = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
        function versOklchI(h) {
            const [r, g, b] = canauxI(h).map((v) => lineaireI(v / 255));
            const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
            const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
            return { L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, C: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
        }
        function depuisOklchI(L, C, h) {
            const t = (h * Math.PI) / 180;
            const rgb = (c) => {
                const a = c * Math.cos(t), b = c * Math.sin(t);
                const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
                return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
            };
            let v = rgb(0);
            for (let c = C; c >= 0; c -= 0.002) { const w = rgb(c); if (w.every((x) => x >= -0.0005 && x <= 1.0005)) { v = w; break; } }
            return `#${v.map((x) => Math.round(Math.min(1, Math.max(0, gammaI(x))) * 255).toString(16).padStart(2, '0')).join('')}`;
        }
        const DOUCE = Object.freeze({ decalage: 0.04, clarteMin: 0.95, clarteMax: 0.975, chroma: 0.22, chromaMax: 0.05, recul: 0.02, sombreClarte: 0.27, sombreChroma: 0.3, sombreChromaMax: 0.045 });
        function surfaceDouce(principal, mode) {
            const c = versOklchI(principal);
            if (mode === 'sombre') return depuisOklchI(DOUCE.sombreClarte, Math.min(DOUCE.sombreChromaMax, c.C * DOUCE.sombreChroma), c.h);
            let L = Math.min(DOUCE.clarteMax, Math.max(DOUCE.clarteMin, c.L + DOUCE.decalage));
            const C = Math.min(DOUCE.chromaMax, c.C * DOUCE.chroma);
            let pale = depuisOklchI(L, C, c.h);
            for (let i = 0; pale === principal && i < 20; i++) { L -= DOUCE.recul; pale = depuisOklchI(L, C, c.h); }
            return pale;
        }
        function themeInstance(entree) {
            const e = objetI(entree) ? entree : {};
            const vars = objetI(e.vars) ? e.vars : {};
            const rien = (mode = null, extra = {}) => ({ themedef: null, mode, notes: [], fond: null, texte: null, pile: null, surface: null, surfaceDouce: null, ...extra });
            if ((e.apparence === undefined || e.apparence === null) && Object.keys(vars).length === 0) return rien();
            if (e.apparence !== 'clair' && e.apparence !== 'sombre') return rien(null, { refus: 'apparence-inconnue' });
            const mode = e.apparence;
            const notes = [];
            const presente = (cle) => vars[cle] !== undefined && vars[cle] !== null && !(typeof vars[cle] === 'string' && vars[cle].trim() === '');
            const couleur = (cle) => {
                if (!presente(cle)) return null;
                const h = hexSur(vars[cle]);
                if (!h) notes.push({ cle, code: 'valeur-ecartee' });
                return h;
            };
            const fondRepris = couleur('page-bg');
            const fond = fondRepris ?? FONDS_DERIVES[mode];
            const surface = mode === 'sombre' ? SURFACE_SOMBRE : fond;
            let encre = couleur('text');
            const reprises = [];
            let principal = null;
            for (const cle of CANDIDATS_ACTION) {
                const c = couleur(cle);
                if (!c) continue;
                reprises.push([cle, c]);
                if (contrasteInstance(c, fond) >= SEUIL_INSTANCE && contrasteInstance(c, surface) >= SEUIL_INSTANCE) { principal = c; break; }
            }
            if (principal === null && reprises.length) {
                const [cle, c] = reprises[0];
                principal = redresserI(c, [fond, surface]);
                if (principal === null) return rien(mode, { notes, refus: 'action-impossible' });
                notes.push({ cle, code: 'action-redressee' });
            }
            let pile = null;
            if (presente('font-family')) {
                pile = pileSure(vars['font-family']);
                if (pile === null) notes.push({ cle: 'font-family', code: 'valeur-ecartee' });
            }
            if (principal === null) return rien(mode, { notes });
            const douce = surfaceDouce(principal, mode);
            if (encre && !(contrasteInstance(encre, fond) >= SEUIL_INSTANCE && contrasteInstance(encre, douce) >= SEUIL_INSTANCE)) {
                const redresse = redresserI(encre, [fond, douce]);
                notes.push({ cle: 'text', code: redresse ? 'texte-redresse' : 'valeur-ecartee' });
                encre = redresse;
            }
            const graines = mode === 'sombre' ? { principal } : { principal, ...(fondRepris ? { fond } : {}), ...(encre ? { encre } : {}) };
            return { themedef: { version: VERSION_THEMEDEF_INSTANCE, graines, police: 'systeme', source: 'instance' }, mode, notes, fond: fondRepris, texte: encre, pile, surface, surfaceDouce: douce };
        }

        /* ---- derivation-valeurs.mjs — sha256 a1ab777475df5d76a85b363332e74a3388c6708822df87dee5157447e7ca55a5 (regle action : identite si texte 4,5:1 + deltaE 0,03, 01/11/2026) ---- */
        const HEX_D = /^#[0-9A-Fa-f]{6}$/;
        const HEX_COURT_D = /^#[0-9A-Fa-f]{3}$/;
        const estHexD = (v) => typeof v === 'string' && HEX_D.test(v);
        const normaliserD = (hex) => {
            if (estHexD(hex)) return hex.toUpperCase();
            if (typeof hex === 'string' && HEX_COURT_D.test(hex)) return ('#' + [...hex.slice(1)].map((c) => c + c).join('')).toUpperCase();
            throw new TypeError('Couleur invalide : ' + JSON.stringify(hex));
        };
        const hexVersRgbD = (hex) => { const h = normaliserD(hex).slice(1); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); };
        const rgbVersHexD = (c) => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
        const BLANC_D = rgbVersHexD([1, 1, 1]), NOIR_D = rgbVersHexD([0, 0, 0]);
        const arrondir3 = (x) => Math.round(x * 1000) / 1000;
        const versLineaireD = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
        const depuisLineaireD = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
        const luminanceD = (hex) => { const [r, g, b] = hexVersRgbD(hex).map(versLineaireD); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const contrasteD = (a, b) => { const la = luminanceD(a), lb = luminanceD(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
        const meilleurTexteSurD = (fond, claire, sombre) => (contrasteD(sombre, fond) >= contrasteD(claire, fond) ? sombre : claire);
        const versOklabD = (hex) => {
            const [r, g, b] = hexVersRgbD(hex).map(versLineaireD);
            const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
            const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
            const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
            return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
        };
        const lineaireDepuisOklabD = ([L, a, b]) => {
            const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
            const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
            const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
            return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
        };
        const versOklchD = (hex) => { const [L, a, b] = versOklabD(hex); return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 }; };
        const depuisOklchD = (L, C, h) => {
            const t = (h * Math.PI) / 180;
            for (let c = C; c >= 0; c -= 0.002) {
                const v = lineaireDepuisOklabD([L, c * Math.cos(t), c * Math.sin(t)]);
                if (v.every((x) => x >= -0.0005 && x <= 1.0005)) return rgbVersHexD(v.map(depuisLineaireD));
            }
            return rgbVersHexD(lineaireDepuisOklabD([L, 0, 0]).map(depuisLineaireD));
        };
        const deltaE = (a, b) => { const p = versOklabD(a), q = versOklabD(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
        const CLES_D = ['accent', 'accent-fond', 'accent-texte', 'action', 'action-actif', 'action-survol', 'action-texte', 'alerte', 'alerte-fond', 'attention', 'attention-filet', 'attention-fond', 'bord', 'bord-champ', 'focus', 'fond', 'info', 'info-fond', 'ok', 'ok-fond', 'ombre', 'papier', 'surface', 'surface-2', 'texte', 'texte-2'];
        const diezeD = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, '#' + v]));
        const NEUTRES_BRUTS = {
            clair: { blanc: 'FFFFFF', noir: '000000', texte2: '3A3A3A', texte3: '595959', bordChamp: '767676', trait: 'C6C6C6', fondGris: 'F4F4F4' },
            sombre: { page: '161616', surface: '1E1E1E', fondGris: '242424', encre: 'F0F0F0', texte2: 'CECECE', texte3: 'A8A8A8', bordChamp: '929292', trait: '353535', surCouleurClaire: 'FFFFFF', surCouleurSombre: '000000' }
        };
        const ETATS_BRUTS = {
            ok: [1, '18753C', 'E0F7E5', '27A658', '19271D'],
            attention: [1, 'B34000', 'FFECE4', 'FC5D00', '361E19'],
            alerte: [1, 'CE0500', 'FEEBE8', 'FF5655', '391C1C'],
            info: [1, '0063CB', 'E7F1FF', '518FFF', '1D2437'],
            neutre: [0, '666666', 'F0F0F0', '929292', '242424'],
            'non-cote': [0, '595959', 'FFFFFF', 'A8A8A8', '161616'],
            'sans-objet': [0, '595959', 'FFFFFF', 'A8A8A8', '161616']
        };
        const NEUTRES = { clair: diezeD(NEUTRES_BRUTS.clair), sombre: diezeD(NEUTRES_BRUTS.sombre) };
        const ETATS = Object.fromEntries(Object.entries(ETATS_BRUTS).map(([k, [c, ...v]]) => [k, [c, ...v.map((x) => '#' + x)]]));
        const alphaNoirD = (a) => 'rg' + 'ba(' + [0, 0, 0, a].join(', ') + ')';
        const OMBRE = { clair: alphaNoirD(0.35), sombre: alphaNoirD(0.6) };
        const SEUILS = { texte: 4.5, nonTexte: 3, actionAAA: 4.5, actionDeltaE: 0.03, actionAAAStricte: 7, actionDeltaEStricte: 0.12, survolPas: 0.06, focus: 3, corpsSombre: 7, profonde: 4.5, paleSombreClarte: 0.27, paleSombreChroma: 0.045 };
        const PAIRES = [
            ['texte', 'fond', 4.5], ['texte', 'surface', 4.5], ['texte-2', 'fond', 4.5], ['texte-2', 'surface', 4.5], ['accent', 'fond', 4.5], ['accent', 'surface', 4.5],
            ['accent-texte', 'accent', 4.5], ['action-texte', 'action', 4.5], ['action-texte', 'action-survol', 4.5], ['action-texte', 'action-actif', 4.5],
            ['bord-champ', 'surface', 3], ['focus', 'fond', 3], ['focus', 'surface', 3],
            ...['ok', 'attention', 'alerte', 'info'].flatMap((e) => [[e, e + '-fond', 4.5], [e, 'surface', 4.5]]), ['attention-filet', 'surface', 3]
        ];
        const bornerD = (x, a, b) => Math.min(b, Math.max(a, x));
        function deriverTeintes(principale) {
            const P = normaliserD(principale), c = versOklchD(P);
            let clartePale = bornerD(c.L + 0.04, 0.95, 0.975);
            const chromaPale = Math.min(0.05, c.C * 0.22);
            let pale = depuisOklchD(clartePale, chromaPale, c.h);
            for (let i = 0; pale === P && i < 20; i++) { clartePale -= 0.02; pale = depuisOklchD(clartePale, chromaPale, c.h); }
            const milieu = c.L + (clartePale - c.L) / 2;
            const clarteMoyenne = Math.min(clartePale - 0.01, Math.max(c.L + 0.03, milieu));
            let moyenne = depuisOklchD(clarteMoyenne, c.C * 0.75, c.h);
            for (let i = 0; (moyenne === P || moyenne === pale) && i < 20; i++) moyenne = depuisOklchD(clarteMoyenne + (i % 2 ? -1 : 1) * 0.01 * (1 + (i >> 1)), c.C * 0.75, c.h);
            return { principale: P, moyenne, pale };
        }
        function deriverEncres(source) {
            const c = versOklchD(normaliserD(source));
            return { encre: depuisOklchD(0.36, Math.min(0.04, c.C * 0.5), c.h), encreMoyenne: depuisOklchD(0.7, Math.min(0.03, c.C * 0.4), c.h) };
        }
        function deriverFondGris(fond) { const c = versOklchD(normaliserD(fond)); return depuisOklchD(Math.max(0, c.L - 0.04), c.C, c.h); }
        function deriverProfonde(principale, pale, M) {
            const c = versOklchD(principale);
            const passe = (h) => contrasteD(h, M.page) >= SEUILS.profonde && contrasteD(h, pale) >= SEUILS.profonde;
            if (passe(principale)) return principale;
            if (M.assombrit) {
                for (let L = c.L; L > 0.15; L -= 0.0025) { const h = depuisOklchD(L, c.C, c.h); if (passe(h)) return h; }
                return M.extremeSombre;
            }
            for (let L = c.L; L < 0.99; L += 0.0025) { const h = depuisOklchD(L, c.C, c.h); if (passe(h)) return h; }
            return M.extremeClaire;
        }
        function deriverSurvol(fond, texte, moyenne, pasMin = 0) {
            const c = versOklchD(fond);
            if (moyenne !== fond && contrasteD(texte, moyenne) >= SEUILS.texte && (!pasMin || Math.abs(versOklchD(moyenne).L - c.L) >= pasMin)) return moyenne;
            const sens = luminanceD(texte) > luminanceD(fond) ? -1 : 1;
            for (let pas = Math.max(0.04, pasMin); pas <= 0.3; pas += 0.02) {
                const h = depuisOklchD(Math.min(0.98, Math.max(0.05, c.L + sens * pas)), c.C, c.h);
                if (h !== fond && contrasteD(texte, h) >= SEUILS.texte) return h;
            }
            return fond;
        }
        function choisirAction(M, repli, principale, profonde, moyenne) {
            const teintes = Object.values(M.etats).filter((e) => e.chromatique);
            const dEtats = (fond) => Math.min(...teintes.map((e) => arrondir3(deltaE(fond, e.fort))));
            const texteDe = (fond) => meilleurTexteSurD(fond, M.extremeClaire, M.extremeSombre);
            const tx = texteDe(principale);
            if (contrasteD(tx, principale) >= SEUILS.actionAAA && dEtats(principale) >= SEUILS.actionDeltaE) {
                // le decalage de survol ne vaut que pour une identite que la porte stricte du noyau (7:1, deltaE 0,12) aurait refusee
                const stricte = contrasteD(tx, principale) >= SEUILS.actionAAAStricte && dEtats(principale) >= SEUILS.actionDeltaEStricte;
                return { fond: principale, texte: tx, contour: profonde, survol: deriverSurvol(principale, tx, moyenne, stricte ? 0 : SEUILS.survolPas), deltaEMin: dEtats(principale) };
            }
            const txr = texteDe(repli.fond);
            if (dEtats(repli.fond) >= SEUILS.actionDeltaE) return { fond: repli.fond, texte: txr, contour: repli.fond, survol: deriverSurvol(repli.fond, txr, repli.survol), deltaEMin: dEtats(repli.fond) };
            return { fond: M.encre, texte: M.page, contour: M.encre, survol: deriverSurvol(M.encre, M.page, M.texte2), deltaEMin: dEtats(M.encre) };
        }
        function calculerMode(mode, G) {
            const sombre = mode === 'sombre';
            const N = NEUTRES[sombre ? 'sombre' : 'clair'];
            const etats = Object.fromEntries(Object.entries(ETATS).map(([k, e]) => [k, { chromatique: !!e[0], fort: e[sombre ? 3 : 1], fond: e[sombre ? 4 : 2] }]));
            const M = sombre
                ? { page: N.page, surface: N.surface, fondGris: N.fondGris, encre: N.encre, texte2: N.texte2, texte3: N.texte3, bordChamp: N.bordChamp, trait: N.trait, extremeClaire: N.surCouleurClaire, extremeSombre: N.surCouleurSombre, assombrit: false, etats }
                : { page: G.fond || N.blanc, surface: G.fond || N.blanc, fondGris: G.fond ? deriverFondGris(G.fond) : N.fondGris, encre: G.encre || N.noir, texte2: N.texte2, texte3: N.texte3, bordChamp: N.bordChamp, trait: N.trait, extremeClaire: G.fond || N.blanc, extremeSombre: G.encre || N.noir, assombrit: true, etats };
            const { principale, moyenne, pale } = G.teintes;
            const portes = [];
            const p = (id, regle, mesure, seuil) => portes.push({ id, regle, ok: mesure >= seuil, mesure: arrondir3(mesure), seuil });
            const pc = (id, regle, fg, bg, seuil) => p(id, regle, contrasteD(fg, bg), seuil);
            const pire = (fg, fonds) => Math.min(...fonds.map((bg) => contrasteD(fg, bg)));
            const t = versOklchD(principale);
            const paleMode = sombre ? depuisOklchD(SEUILS.paleSombreClarte, Math.min(SEUILS.paleSombreChroma, t.C * 0.3), t.h) : pale;
            const repli = { fond: M.assombrit ? G.encre0 : deriverProfonde(G.encre0, paleMode, M), survol: G.encreMoyenne };
            const profonde = deriverProfonde(principale, paleMode, M);
            if (!sombre) portes.push({ id: 'SRC-trois-hex', regle: 'SRC', ok: new Set([principale, moyenne, pale]).size === 3, mesure: new Set([principale, moyenne, pale]).size, seuil: 3 });
            pc(sombre ? 'D3-profonde-page' : 'R5-profonde-blanc', sombre ? 'D3' : 'R5', profonde, M.page, SEUILS.profonde);
            pc(sombre ? 'D3-profonde-pale' : 'R5-profonde-pale', sombre ? 'D3' : 'R5', profonde, paleMode, SEUILS.profonde);
            const a = choisirAction(M, repli, principale, profonde, moyenne);
            const alerte = etats.alerte;
            const dangerTexte = meilleurTexteSurD(alerte.fort, M.extremeClaire, M.extremeSombre);
            const fondsFocus = sombre ? [M.page, M.surface, principale, moyenne, paleMode, profonde] : [M.page, principale, moyenne, paleMode, profonde];
            const focus = Math.min(...fondsFocus.map((f) => Math.max(contrasteD(M.encre, f), contrasteD(M.page, f))));
            const RA = sombre ? 'D5' : 'R6';
            p(RA + '-action-etats', RA, a.deltaEMin, SEUILS.actionDeltaE);
            const tous = Object.values(etats);
            if (sombre) {
                const fonds = [M.page, M.surface, paleMode, M.fondGris];
                p('D1-texte-courant', 'D1', pire(M.encre, fonds), SEUILS.corpsSombre);
                p('D2-texte-secondaire', 'D2', pire(M.texte2, fonds), SEUILS.texte);
                p('D2-texte-discret', 'D2', pire(M.texte3, fonds), SEUILS.texte);
                const couples = tous.flatMap((e) => [contrasteD(e.fort, e.fond), contrasteD(e.fort, M.page), ...(e.chromatique ? [contrasteD(e.fort, paleMode)] : [])]);
                p('D4-etats-texte', 'D4', Math.min(...couples), SEUILS.texte);
                pc('D4-danger-texte', 'D4', dangerTexte, alerte.fort, SEUILS.texte);
                p('D5-action-texte', 'D5', Math.min(contrasteD(a.texte, a.fond), contrasteD(a.texte, a.survol)), SEUILS.texte);
                p('D5-action-contour', 'D5', pire(a.contour, [M.page, paleMode]), SEUILS.texte);
                p('D6-bord-champ', 'D6', pire(M.bordChamp, [M.page, M.surface, paleMode]), SEUILS.nonTexte);
                pc('D6-bord-domaine', 'D6', profonde, M.page, SEUILS.nonTexte);
                p('D10-focus', 'D10', focus, SEUILS.focus);
            } else {
                const T = SEUILS.texte;
                const R4 = (id, fg, bg, s = T) => pc('R4-' + id, 'R4', fg, bg, s);
                R4('texte.corps-sur-fond.page', M.encre, M.page); R4('texte.corps-sur-fond.surface-douce', M.encre, paleMode); R4('texte.corps-sur-fond.neutre', M.encre, M.fondGris);
                R4('texte.secondaire-sur-fond.page', M.texte2, M.page); R4('texte.secondaire-sur-fond.surface-douce', M.texte2, paleMode);
                R4('texte.discret-sur-fond.page', M.texte3, M.page); R4('texte.discret-sur-fond.surface-douce', M.texte3, paleMode); R4('texte.discret-sur-fond.neutre', M.texte3, M.fondGris);
                R4('action.texte-sur-action.fond', a.texte, a.fond); R4('action.texte-sur-action.survol', a.texte, a.survol);
                R4('action.contour-sur-fond.page', a.contour, M.page); R4('action.contour-sur-fond.surface-douce', a.contour, paleMode);
                R4('danger.texte-sur-danger.fond', dangerTexte, alerte.fort); R4('desactive.texte-sur-desactive.fond', M.texte3, M.fondGris);
                p('R4-etats-texte', 'R4', Math.min(...tous.flatMap((e) => [contrasteD(e.fort, e.fond), contrasteD(e.fort, M.page)])), T);
                R4('bord.champ-sur-fond.page', M.bordChamp, M.page, SEUILS.nonTexte); R4('bord.champ-sur-fond.surface-douce', M.bordChamp, paleMode, SEUILS.nonTexte); R4('bord.domaine-sur-fond.page', profonde, M.page, SEUILS.nonTexte);
                p('R9-focus', 'R9', focus, SEUILS.focus);
            }
            const jetons = { fond: M.page, surface: M.surface, 'surface-2': paleMode, texte: M.encre, 'texte-2': M.texte2, bord: M.trait, 'bord-champ': M.bordChamp, accent: profonde, 'accent-texte': M.surface, 'accent-fond': paleMode, action: a.fond, 'action-texte': a.texte, 'action-survol': a.survol, focus: M.encre, ombre: OMBRE[mode], papier: sombre ? BLANC_D : M.surface };
            for (const e of ['ok', 'attention', 'alerte', 'info']) { jetons[e] = etats[e].fort; jetons[e + '-fond'] = etats[e].fond; }
            jetons['attention-filet'] = etats.attention.fort;
            return { jetons, portes };
        }
        const PAS = 0.0025, PAS_ACTIF = 0.01, CL_MIN = 0.02, CL_MAX = 0.99;
        const sensLoin = (c, fonds) => (luminanceD(c) >= fonds.reduce((s, f) => s + luminanceD(f), 0) / fonds.length ? 1 : -1);
        function ajuster(couleur, exigences, sens) {
            const c = versOklchD(couleur);
            for (let i = 1; ; i++) {
                const L = c.L + sens * PAS * i;
                if (L < CL_MIN || L > CL_MAX) return null;
                const h = depuisOklchD(L, c.C, c.h);
                if (exigences.every((e) => contrasteD(h, e.fond) >= e.seuil)) return h;
            }
        }
        function resoudreJetons(jetons) {
            const v = { ...jetons }, derive = new Set();
            const corriger = (cle) => {
                const portes = PAIRES.filter((q) => q[0] === cle);
                if (!portes.length || portes.every(([, b, s]) => contrasteD(v[cle], v[b]) >= s)) return;
                const ex = portes.map(([, b, s]) => ({ fond: v[b], seuil: s }));
                const n = ajuster(v[cle], ex, sensLoin(v[cle], ex.map((e) => e.fond)));
                if (!n) throw new Error('aucune valeur conforme pour « ' + cle + ' »');
                v[cle] = n; derive.add(cle);
            };
            for (const cle of ['accent', 'texte', 'texte-2', 'accent-texte']) corriger(cle);
            const sens = (c, texte) => (luminanceD(texte) > luminanceD(c) ? -1 : 1);
            if (contrasteD(v['action-texte'], v.action) < SEUILS.texte) {
                const m = contrasteD(NOIR_D, v.action) >= contrasteD(BLANC_D, v.action) ? NOIR_D : BLANC_D;
                if (contrasteD(m, v.action) < SEUILS.texte) throw new Error('aucun texte lisible sur l\'action ' + v.action);
                v['action-texte'] = m; derive.add('action-texte');
            }
            if (contrasteD(v['action-texte'], v['action-survol']) < SEUILS.texte) {
                const n = ajuster(v['action-survol'], [{ fond: v['action-texte'], seuil: SEUILS.texte }], sens(v['action-survol'], v['action-texte']));
                if (!n) throw new Error('aucune valeur conforme pour « action-survol »');
                v['action-survol'] = n; derive.add('action-survol');
            }
            const base = versOklchD(v['action-survol']), sa = sens(v['action-survol'], v['action-texte']);
            let trouve = null;
            for (let i = Math.round(0.03 / PAS_ACTIF); ; i++) {
                const L = base.L + sa * PAS_ACTIF * i;
                if (L < CL_MIN || L > CL_MAX) break;
                const h = depuisOklchD(L, base.C, base.h);
                if (h !== v['action-survol'] && h !== v.action && contrasteD(v['action-texte'], h) >= SEUILS.texte) { trouve = h; break; }
            }
            if (!trouve) throw new Error('aucune valeur conforme pour « action-actif »');
            v['action-actif'] = trouve; derive.add('action-actif');
            for (const cle of ['bord-champ', 'focus', 'ok', 'attention', 'alerte', 'info', 'attention-filet']) corriger(cle);
            const echecs = PAIRES.filter(([a, b, s]) => contrasteD(v[a], v[b]) < s);
            if (echecs.length) throw new Error('porte(s) en échec après correction : ' + echecs.map(([a, b]) => a + ' sur ' + b).join(', '));
            return { valeurs: Object.fromEntries(CLES_D.map((c) => [c, v[c]])), derive: CLES_D.filter((c) => derive.has(c)) };
        }
        const echecD = (code, chemin, message, extra) => ({ code, chemin, message, ...extra });
        function deriverValeurs(graines) {
            const g = graines || {};
            const sortie = { ok: false, valeurs: null, derive: [], echecs: [] };
            if (g.mode !== 'clair' && g.mode !== 'sombre') { sortie.echecs.push(echecD('mode-inconnu', '/mode', 'Le mode vaut « clair » ou « sombre ».')); return sortie; }
            for (const k of ['principal', 'secondaire', 'encre', 'fond']) {
                if (g[k] === undefined || g[k] === null) { if (k === 'principal') sortie.echecs.push(echecD('graine-invalide', '/graines/principal', 'La graine « principal » est obligatoire.')); continue; }
                if (typeof g[k] !== 'string' || !(HEX_D.test(g[k]) || HEX_COURT_D.test(g[k]))) sortie.echecs.push(echecD('graine-invalide', '/graines/' + k, 'La graine « ' + k + ' » doit être une couleur #RRGGBB.'));
            }
            if (sortie.echecs.length) return sortie;
            const teintes = deriverTeintes(g.principal);
            const encre = g.encre ? normaliserD(g.encre) : null;
            const e = encre ? { encre, encreMoyenne: deriverEncres(encre).encreMoyenne } : deriverEncres(g.principal);
            const G = { teintes, fond: g.fond ? normaliserD(g.fond) : null, encre, encre0: e.encre, encreMoyenne: e.encreMoyenne };
            const { jetons, portes } = calculerMode(g.mode, G);
            const tombees = portes.filter((q) => !q.ok);
            if (tombees.length) {
                sortie.echecs = tombees.map((q) => echecD('porte-bloquante', '/portes/' + g.mode + '/' + q.id, 'Porte d\'interface en échec : thème refusé (' + g.mode + ', ' + q.id + ', ' + q.mesure + ' pour un seuil de ' + q.seuil + ')', { porte: q.id, regle: q.regle, mode: g.mode, mesure: q.mesure, seuil: q.seuil }));
                return sortie;
            }
            try {
                const r = resoudreJetons(jetons);
                return { ok: true, valeurs: r.valeurs, derive: r.derive, echecs: [] };
            } catch (err) {
                sortie.echecs.push(echecD('resolution-impossible', '/resolu/modes/' + g.mode + '/valeurs', 'Aucune valeur conforme pour une variable : thème refusé : ' + err.message, { mode: g.mode }));
                return sortie;
            }
        }

        return { themeInstance, deriverValeurs, CLES_INSTANCE, CLES: CLES_D, PAIRES, contraste: contrasteD };
    })();

    /* ---- Lecteur TaskFlow : Theme_document du document > thème de l'instance > rien ---- */
    const ThemeReader = (function () {
        'use strict';
        const TABLE = 'Theme_document';
        const HEXDOC = /^#[0-9a-fA-F]{6}$/;
        const OFF_PREFIX = 'tf-theme-off:';

        function sansThemeCle(widget) { return OFF_PREFIX + (widget || 'tous'); }
        // ?sansTheme desactive le theme pour CETTE session (meme convention que ?demo), sans toucher au reglage persiste.
        function sansThemeURL() {
            try { return /[?&]sansTheme(=|&|$)/.test(location.search); } catch (e) { return false; }
        }
        /** Réglage "sans thème" (opt-out par widget, le réglage "tous" transverse, ou ?sansTheme dans l'URL). */
        function sansTheme(widget) {
            if (sansThemeURL()) return true;
            try { return localStorage.getItem(sansThemeCle(widget)) === '1' || localStorage.getItem(sansThemeCle('tous')) === '1'; }
            catch (e) { return false; }
        }
        function setSansTheme(widget, actif) {
            try { localStorage.setItem(sansThemeCle(widget), actif ? '1' : '0'); } catch (e) {}
        }

        function mesurerPaires(valeurs) {
            return ThemeVendor.PAIRES.filter(([a, b, s]) => {
                const va = valeurs[a], vb = valeurs[b];
                if (!HEXDOC.test(va || '') || !HEXDOC.test(vb || '')) return false;
                return ThemeVendor.contraste(va, vb) < s;
            });
        }

        const NOIR = '#000000', BLANC = '#ffffff';
        /** Celle des couleurs qui lit le mieux (pire contraste le plus haut) sur tous les fonds donnes. */
        function meilleurDe(candidats, fonds) {
            let meilleur = candidats[0], pire = -1;
            candidats.forEach((c) => {
                const m = Math.min(...fonds.map((f) => ThemeVendor.contraste(c, f)));
                if (m > pire) { pire = m; meilleur = c; }
            });
            return meilleur;
        }
        /** Melange lineaire (RGB) de `hex` vers `cible`, `part` dans [0,1]. */
        function melanger(hex, cible, part) {
            const h = hex.replace('#', ''), t = cible.replace('#', '');
            const n = (s) => parseInt(s, 16);
            const canal = (i) => { const a = n(h.slice(i, i + 2)), b = n(t.slice(i, i + 2)); return Math.round(a + (b - a) * part).toString(16).padStart(2, '0'); };
            return ('#' + canal(0) + canal(2) + canal(4)).toLowerCase();
        }
        /**
         * Remplace fond/texte par les valeurs REELLES mesurees sur l'instance (le contrat ne derive que
         * l'accent des graines en sombre : E7/86), derive les surfaces du fond reel, et REDRESSE (jamais
         * ne rejette) tout jeton dont une paire echouerait avec ce fond reel : bascule vers noir/blanc,
         * le pole qui lit le mieux, meme logique que `redresserI` du kit pour la couleur d'identite.
         * Exposee (TF.theme.redresserAvecFondReel) pour un test direct, independant du DOM.
         */
        /**
         * Point du melange fond->blanc (elevation « carte plus claire », pas de 2% a partir de `depart`)
         * ou `texte` reste lisible ; sinon le symetrique fond->noir ; sinon le pole oppose a `texte`
         * (toujours lisible par definition). L'eclaircissement n'est pas toujours la bonne direction :
         * si `texte` est lui-meme tres clair sur un fond de luminance moyenne, eclaircir la surface
         * REDUIT le contraste au lieu de l'augmenter — essayer les deux sens plutot que d'en supposer un.
         */
        function construireSurface(fond, texte, depart) {
            for (const pole of [BLANC, NOIR]) {
                for (let p = depart; p <= 1; p += 0.02) {
                    const s = melanger(fond, pole, p);
                    if (ThemeVendor.contraste(texte, s) >= 4.5) return s;
                }
            }
            return meilleurDe([NOIR, BLANC], [texte]);
        }
        function redresserAvecFondReel(valeurs, reel, mode) {
            if (!reel || !HEXDOC.test(reel.fond || '') || !HEXDOC.test(reel.texte || '')) return valeurs;
            valeurs.fond = reel.fond.toLowerCase();
            valeurs.texte = reel.texte.toLowerCase();
            if (mode === 'sombre') {
                // Elevation des surfaces a partir du fond reel : garantit, par construction, que `texte`
                // reste lisible sur `surface`/`surface-2` (pas seulement un pourcentage fixe qui peut
                // rester trop proche d'un fond de luminance moyenne).
                valeurs.surface = construireSurface(valeurs.fond, valeurs.texte, 0.08);
                valeurs['surface-2'] = construireSurface(valeurs.fond, valeurs.texte, 0.16);
            }
            const parRole = {};
            ThemeVendor.PAIRES.forEach(([role, fondCle, seuil]) => { (parRole[role] = parRole[role] || []).push([fondCle, seuil]); });
            for (let passe = 0; passe < 2; passe++) {
                Object.keys(parRole).forEach((role) => {
                    const exigences = parRole[role].filter(([fondCle]) => HEXDOC.test(valeurs[fondCle] || ''));
                    if (!exigences.length) return;
                    const ok = exigences.every(([fondCle, seuil]) => ThemeVendor.contraste(valeurs[role], valeurs[fondCle]) >= seuil);
                    if (ok) return;
                    valeurs[role] = meilleurDe([NOIR, BLANC, valeurs[role]], exigences.map(([fondCle]) => valeurs[fondCle]));
                });
            }
            return valeurs;
        }
        function deriverEtMesurer(graines, mode, reel) {
            const d = ThemeVendor.deriverValeurs(Object.assign({}, graines, { mode }));
            if (!d.ok) return null;
            const valeurs = {};
            Object.keys(d.valeurs).forEach((k) => { valeurs[k] = String(d.valeurs[k]).toLowerCase(); });
            if (reel) redresserAvecFondReel(valeurs, reel, mode);
            return mesurerPaires(valeurs).length ? null : valeurs;
        }

        function mediaVrai(requete) {
            try { return typeof matchMedia === 'function' && matchMedia(requete).matches; } catch (e) { return false; }
        }
        function personneImpose() { return mediaVrai('(forced-colors: active)') || mediaVrai('(prefers-contrast: more)'); }
        function modeSysteme() { return mediaVrai('(prefers-color-scheme: dark)') ? 'sombre' : 'clair'; }

        /** Lit le ThemeDef de la ligne active de Theme_document (JSON §1.0 réduit : graines.principal/secondaire/encre/fond + modes.sombre). */
        function ligneActive(colonnes) {
            if (!colonnes || typeof colonnes !== 'object') return null;
            const n = (colonnes.id || []).length;
            const actives = [];
            for (let i = 0; i < n; i++) if (colonnes.actif && colonnes.actif[i] === true) actives.push(i);
            if (actives.length !== 1) return actives.length > 1 ? { refus: 'plusieurs-actifs' } : null;
            const i = actives[0];
            let brut = colonnes.themedef ? colonnes.themedef[i] : null;
            if (brut === null || brut === undefined || brut === '') return null;
            let td = brut;
            if (typeof brut === 'string') { try { td = JSON.parse(brut); } catch (e) { return { refus: 'json' }; } }
            if (!td || typeof td !== 'object' || Array.isArray(td)) return { refus: 'type' };
            const principal = td.graines && td.graines.principal;
            if (typeof principal !== 'string' || !HEXDOC.test(principal)) return { refus: 'principal' };
            return { td };
        }

        /** Résout le ThemeDef de Theme_document pour un mode ; `null` si absent, `{refus}` si invalide/refusé. */
        function resoudreDocument(td, mode) {
            const sansSombre = td.modes && td.modes.sombre === 'aucun';
            if (mode === 'sombre' && sansSombre) return { refus: 'sans-mode-sombre' };
            const g = td.graines || {};
            const graines = { principal: g.principal };
            if (mode === 'clair') {
                if (typeof g.fond === 'string' && HEXDOC.test(g.fond)) graines.fond = g.fond;
                if (typeof g.encre === 'string' && HEXDOC.test(g.encre)) graines.encre = g.encre;
            }
            const valeurs = deriverEtMesurer(graines, mode);
            if (!valeurs) return { refus: 'contraste-insuffisant' };
            return { valeurs };
        }

        /** Thème de l'instance Grist (mode + couleur d'action de la personne), lu sur <html>. */
        function lireInstance() {
            if (typeof document === 'undefined' || !document.documentElement) return null;
            const h = document.documentElement;
            const apparenceBrute = (h.getAttribute('data-grist-appearance') || '').trim().toLowerCase();
            const apparence = apparenceBrute === 'dark' ? 'sombre' : apparenceBrute === 'light' ? 'clair' : null;
            if (!apparence) return null;
            const cs = getComputedStyle(h);
            const vars = {};
            ThemeVendor.CLES_INSTANCE.forEach((cle) => {
                const v = (cs.getPropertyValue('--grist-theme-' + cle) || '').trim();
                if (v) vars[cle] = v;
            });
            const r = ThemeVendor.themeInstance({ apparence, vars });
            if (r.refus || !r.themedef) return null;
            const graines = { principal: r.themedef.graines.principal };
            if (apparence === 'clair') {
                if (r.themedef.graines.fond) graines.fond = r.themedef.graines.fond;
                if (r.themedef.graines.encre) graines.encre = r.themedef.graines.encre;
            }
            // fond/texte REELS de l'instance (r.fond/r.texte), pas seulement les graines derivees : en
            // sombre le contrat ne porte que l'accent dans les graines (E7/86), le fond/texte reel vient
            // d'ici dans les deux modes.
            const valeurs = deriverEtMesurer(graines, apparence, { fond: r.fond, texte: r.texte });
            if (!valeurs) return null;
            return { valeurs, mode: apparence };
        }

        /** Pose les 26 variables `--kit-*` sur <html>. Rend les noms poses (pour les retirer). */
        function appliquer(valeurs) {
            if (typeof document === 'undefined') return [];
            const h = document.documentElement;
            const noms = [];
            Object.keys(valeurs).forEach((cle) => { const nom = '--kit-' + cle; h.style.setProperty(nom, valeurs[cle]); noms.push(nom); });
            return noms;
        }
        function retirer(noms) {
            if (typeof document === 'undefined') return;
            const h = document.documentElement;
            (noms || []).forEach((n) => h.style.removeProperty(n));
        }

        /**
         * Le geste complet : "sans theme" > Theme_document (si l'API est fournie) > theme de l'instance Grist > rien.
         * @param {{grist?: object, widget?: string, mode?: string}} [opts]
         * @returns {Promise<{applique:boolean, source?:string, mode?:string, refus?:string}>}
         */
        async function initialiser(opts) {
            opts = opts || {};
            if (sansTheme(opts.widget)) return { applique: false, source: 'sans-theme' };
            if (personneImpose()) return { applique: false, source: 'preference-personne' };
            const mode = opts.mode || modeSysteme();
            const grist = opts.grist;
            let documentRefus = null;
            if (grist && grist.docApi && typeof grist.docApi.listTables === 'function') {
                try {
                    const tables = await grist.docApi.listTables();
                    const noms = (tables || []).map((t) => (typeof t === 'string' ? t : t && t.id));
                    if (noms.indexOf(TABLE) !== -1) {
                        const colonnes = await grist.docApi.fetchTable(TABLE);
                        const ligne = ligneActive(colonnes);
                        if (ligne && !ligne.refus) {
                            const r = resoudreDocument(ligne.td, mode);
                            if (!r.refus) { appliquer(r.valeurs); return { applique: true, source: 'document', mode }; }
                            documentRefus = r.refus;
                        } else if (ligne && ligne.refus) {
                            documentRefus = ligne.refus;
                        }
                        // document refuse/invalide (documentRefus porte la raison) : jamais d'application partielle, on retombe sur l'instance.
                    }
                } catch (e) { /* lecture impossible : on retombe sur l'instance, sans bruit */ }
            }
            const instance = lireInstance();
            if (instance) {
                appliquer(instance.valeurs);
                return Object.assign({ applique: true, source: 'instance', mode: instance.mode }, documentRefus ? { documentRefuse: documentRefus } : {});
            }
            return Object.assign({ applique: false, source: 'origine' }, documentRefus ? { documentRefuse: documentRefus } : {});
        }

        /**
         * Rejoue `initialiser(opts)` quand le thème de l'instance Grist change à chaud (mode ou couleur d'action),
         * dans le même document (pas de rechargement de page). Pose nos propres variables ne redéclenche jamais
         * cette fonction (on ne surveille que data-grist-appearance/data-grist-theme, jamais le style qu'on pose).
         * @returns {function} arrête le suivi.
         */
        function suivreInstance(opts) {
            if (typeof document === 'undefined' || typeof MutationObserver !== 'function' || !document.documentElement) return function () {};
            let derniere = document.documentElement.getAttribute('data-grist-appearance') + '|' + document.documentElement.getAttribute('data-grist-theme');
            const o = new MutationObserver(() => {
                const s = document.documentElement.getAttribute('data-grist-appearance') + '|' + document.documentElement.getAttribute('data-grist-theme');
                if (s === derniere) return;
                derniere = s;
                initialiser(opts).catch(() => {});
            });
            o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-grist-appearance', 'data-grist-theme'] });
            return function () { o.disconnect(); };
        }

        return { sansTheme, setSansTheme, ligneActive, resoudreDocument, lireInstance, mesurerPaires, appliquer, retirer, initialiser, suivreInstance, modeSysteme, personneImpose, redresserAvecFondReel };
    })();

    return {
        DEFAULT_STATUSES: DEFAULT_STATUSES,
        columnarToRows: columnarToRows,
        loadStatusConfig: loadStatusConfig,
        buildStatusConfig: buildStatusConfig,
        getStatus: getStatus,
        isTerminal: isTerminal,
        isDone: isDone,
        isDead: isDead,
        isLive: isLive,
        statusOf: statusOf,
        shouldAutoDemo: shouldAutoDemo,
        isExplicitDemo: isExplicitDemo,
        confirm: uiConfirm,
        deletePlan: deletePlan,
        deleteConfirmHtml: deleteConfirmHtml,
        completionPatch: completionPatch,
        datesPatch: datesPatch,
        parentSpanUpdates: parentSpanUpdates,
        reopenValue: reopenValue,
        statusKnown: statusKnown,
        gristToDate: gristToDate,
        dateToGrist: dateToGrist,
        dayNum: dayNum,
        todayGrist: todayGrist,
        isoDate: isoDate,
        parseISODate: parseISODate,
        colorModeLabel: colorModeLabel,
        panelHeaderHtml: panelHeaderHtml,
        initUi: initUi,
        searchMatch: searchMatch,
        watchTasks: watchTasks,
        ctx: ctx,
        createCtx: createCtx,
        relinkToTasks: relinkToTasks,
        consumeRelinkNotice: consumeRelinkNotice,
        sortTasks: sortTasks,
        setPeriodLabel: setPeriodLabel,
        monthYearShort: monthYearShort,
        monthShort: monthShort,
        ui: ui,
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
        readOnlyBanner: readOnlyBanner,
        theme: ThemeReader,
        themeVendor: ThemeVendor
    };
})();

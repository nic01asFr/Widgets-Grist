'use strict';
// Tests du contexte commun de consultation (TF.createCtx) : persistance par document, partage entre widgets,
// anciens reglages, filtres sans objet, vues nommees, position, rattachement a Tasks.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'taskflow-core.js'), 'utf8');
const TF = new Function(src + '\nreturn TF;')();

// Stockage local factice, partage entre instances (= plusieurs widgets d'une meme origine).
function stockage(init) {
    const m = new Map(Object.entries(init || {}));
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}
function widget(store, doc, nom, now) {
    const c = TF.createCtx({ storage: store, now: now });
    c.bind(doc, nom);
    return c;
}

describe('contexte commun : etat et persistance', () => {
    it('demarre vide, avec des valeurs nulles = defaut du widget', () => {
        const c = widget(stockage(), 'docA', 'kanban');
        const s = c.get();
        assert.deepEqual(s.filters, { project: [], priority: [], assignee: [], status: [] });
        assert.equal(s.color, null); assert.equal(s.sort, null); assert.equal(s.level, null); assert.equal(s.subs, null);
    });
    it('set fusionne les cles presentes et ecarte les valeurs inconnues', () => {
        const c = widget(stockage(), 'docA', 'kanban');
        c.set({ filters: { project: [2, '3', 'x', 2] }, color: 'status', sort: 'inconnu', level: 'actions' });
        const s = c.get();
        assert.deepEqual(s.filters.project, [2, 3]);
        assert.equal(s.color, 'status'); assert.equal(s.sort, null); assert.equal(s.level, 'actions');
        c.set({ filters: { status: ['todo', ''] } });
        assert.deepEqual(c.get().filters.project, [2, 3], 'les autres filtres sont conserves');
        assert.deepEqual(c.get().filters.status, ['todo']);
    });
    it('un autre widget du meme document lit ce qui a ete ecrit', () => {
        const store = stockage();
        const k = widget(store, 'docA', 'kanban');
        k.set({ filters: { project: [5] }, sort: 'date' });
        const g = widget(store, 'docA', 'gantt');
        assert.deepEqual(g.get().filters.project, [5]);
        assert.equal(g.get().sort, 'date');
    });
    it('un autre document ne partage rien', () => {
        const store = stockage();
        widget(store, 'docA', 'kanban').set({ filters: { project: [5] } });
        assert.deepEqual(widget(store, 'docB', 'kanban').get().filters.project, []);
    });
});

describe('contexte commun : synchronisation entre widgets', () => {
    it('refresh previent les autres widgets (source external), pas celui qui agit', () => {
        const store = stockage();
        const k = widget(store, 'docA', 'kanban'), g = widget(store, 'docA', 'gantt');
        const recus = { k: [], g: [] };
        k.onChange((s, src) => recus.k.push(src)); g.onChange((s, src) => recus.g.push(src));
        k.set({ filters: { assignee: [7] } });
        assert.deepEqual(recus.k, [], 'le widget auteur ne se rappelle pas lui-meme');
        g.refresh();
        assert.deepEqual(recus.g, ['external']);
        assert.deepEqual(g.get().filters.assignee, [7]);
        g.refresh();
        assert.deepEqual(recus.g, ['external'], 'pas de notification sans changement');
    });
});

describe('contexte commun : anciens reglages', () => {
    it('reprend les cles propres au widget a la premiere ouverture du document', () => {
        const store = stockage({
            taskflow_kanban_filters: JSON.stringify({ project: [1], priority: [2], assignee: [], status: ['done'] }),
            taskflow_kanban_colormode: 'project', taskflow_kanban_sort: 'date', taskflow_kanban_worklevel: 'actions', taskflow_kanban_showsubs: '1'
        });
        const s = widget(store, 'docA', 'kanban').get();
        assert.deepEqual(s.filters, { project: [1], priority: [2], assignee: [], status: ['done'] });
        assert.equal(s.color, 'project'); assert.equal(s.sort, 'date'); assert.equal(s.level, 'actions'); assert.equal(s.subs, true);
    });
    it('ne reprend plus les anciennes cles une fois le contexte cree', () => {
        const store = stockage({ taskflow_gantt_colormode: 'status' });
        widget(store, 'docA', 'gantt');
        store.setItem('taskflow_kanban_colormode', 'project');
        assert.equal(widget(store, 'docA', 'kanban').get().color, 'status');
    });
});

describe('contexte commun : filtres sans objet', () => {
    it('ecarte les identifiants disparus et compte', () => {
        const c = widget(stockage(), 'docA', 'kanban');
        c.set({ filters: { project: [1, 2, 3], assignee: [4, 5], status: ['todo', 'ancien'], priority: [1] } });
        const retires = c.prune({ project: [1, 3], assignee: [4, 5], status: ['todo', 'done'] });
        assert.equal(retires, 2);
        const f = c.get().filters;
        assert.deepEqual(f.project, [1, 3]); assert.deepEqual(f.status, ['todo']); assert.deepEqual(f.priority, [1]);
    });
    it('ne fait rien si la liste de reference est vide (donnees pas encore lues)', () => {
        const c = widget(stockage(), 'docA', 'kanban');
        c.set({ filters: { project: [1] } });
        assert.equal(c.prune({ project: [], assignee: [], status: [] }), 0);
        assert.deepEqual(c.get().filters.project, [1]);
    });
});

describe('contexte commun : vues nommees', () => {
    function pret() {
        const c = widget(stockage(), 'docA', 'kanban');
        c.set({ filters: { project: [1], status: ['todo'] }, color: 'status', sort: 'date' });
        return c;
    }
    it('enregistre l\'etat courant sous un nom et rend la vue active', () => {
        const c = pret();
        assert.equal(c.views.save('  Mes retards  '), true);
        assert.deepEqual(c.views.list(), ['Mes retards']);
        assert.equal(c.views.current(), 'Mes retards');
        assert.equal(c.views.modified(), false);
    });
    it('refuse un nom vide', () => { assert.equal(pret().views.save('   '), false); });
    it('signale une vue modifiee quand le contexte s\'en ecarte', () => {
        const c = pret(); c.views.save('V');
        c.set({ filters: { project: [1, 2] } });
        assert.equal(c.views.modified(), true);
    });
    it('appliquer une vue remplace tout le contexte et previent les ecouteurs (source view)', () => {
        const c = pret(); c.views.save('V');
        c.set({ filters: { project: [], status: [] }, color: 'priority', sort: 'manual' });
        const recus = []; c.onChange((s, src) => recus.push(src));
        assert.equal(c.views.apply('V'), true);
        assert.deepEqual(recus, ['view']);
        assert.deepEqual(c.get().filters.project, [1]); assert.equal(c.get().color, 'status'); assert.equal(c.get().sort, 'date');
        assert.equal(c.views.apply('inconnue'), false);
    });
    it('enregistrer sous un nom existant met la vue a jour', () => {
        const c = pret(); c.views.save('V');
        c.set({ filters: { project: [9] } }); c.views.save('V');
        assert.deepEqual(c.views.list(), ['V']);
        assert.equal(c.views.modified(), false);
    });
    it('supprimer la vue active la desactive sans toucher aux filtres', () => {
        const c = pret(); c.views.save('V');
        assert.equal(c.views.remove('V'), true);
        assert.equal(c.views.current(), null);
        assert.deepEqual(c.get().filters.project, [1]);
    });
    it('les vues sont partagees entre widgets du document, et une vue supprimee ailleurs n\'est plus active', () => {
        const store = stockage();
        const k = widget(store, 'docA', 'kanban'); k.set({ filters: { project: [1] } }); k.views.save('V');
        const g = widget(store, 'docA', 'gantt');
        assert.deepEqual(g.views.list(), ['V']); assert.equal(g.views.current(), 'V');
        g.views.remove('V');
        k.refresh();
        assert.deepEqual(k.views.list(), []); assert.equal(k.views.current(), null);
    });
});

describe('contexte commun : position memorisee', () => {
    it('retrouve la position avant 12 h, puis l\'oublie', () => {
        let t = 1000000;
        const c = widget(stockage(), 'docA', 'gantt', () => t);
        c.pos.set('gantt', { start: 123, view: 'month' });
        assert.equal(c.pos.get('gantt').start, 123);
        t += 11 * 3600 * 1000;
        assert.equal(c.pos.get('gantt').view, 'month');
        t += 2 * 3600 * 1000;
        assert.equal(c.pos.get('gantt'), null);
    });
    it('une position est propre au widget et au document', () => {
        const store = stockage();
        widget(store, 'docA', 'gantt').pos.set('gantt', { start: 1 });
        assert.equal(widget(store, 'docA', 'gantt').pos.get('calendar'), null);
        assert.equal(widget(store, 'docB', 'gantt').pos.get('gantt'), null);
    });
});

describe('rattachement a Tasks', () => {
    // Faux Grist : tables, sections personnalisees et donnees de la table liee.
    function faux(opts) {
        const actions = [];
        const tables = { id: [1, 2], tableId: [opts.liee, 'Tasks'] };
        const sections = { id: opts.sections.map(s => s.id), parentKey: opts.sections.map(() => 'custom'), tableRef: opts.sections.map(s => s.tableRef) };
        return {
            actions,
            selectedTable: { getTableId: async () => opts.liee },
            docApi: {
                fetchTable: async (n) => (n === '_grist_Tables' ? tables : n === '_grist_Views_section' ? sections : { id: opts.lignes || [] }),
                applyUserActions: async (a) => { actions.push(a); return {}; }
            }
        };
    }
    it('rattache l\'unique section personnelle liee a la table par defaut vide', async () => {
        const g = faux({ liee: 'Table1', sections: [{ id: 29, tableRef: 1 }] });
        assert.equal(await TF.relinkToTasks(g), true);
        assert.deepEqual(g.actions[0], [['UpdateRecord', '_grist_Views_section', 29, { tableRef: 2 }]]);
    });
    it('ne fait rien si plusieurs sections sont candidates (ambigu)', async () => {
        const g = faux({ liee: 'Table1', sections: [{ id: 29, tableRef: 1 }, { id: 30, tableRef: 1 }] });
        assert.equal(await TF.relinkToTasks(g), false); assert.equal(g.actions.length, 0);
    });
    it('ne fait rien si le widget est deja lie a Tasks', async () => {
        const g = faux({ liee: 'Tasks', sections: [{ id: 29, tableRef: 2 }] });
        assert.equal(await TF.relinkToTasks(g), false); assert.equal(g.actions.length, 0);
    });
    it('ne touche pas a une table liee qui porte des donnees et un nom choisi', async () => {
        const g = faux({ liee: 'Chantiers', sections: [{ id: 29, tableRef: 1 }], lignes: [1, 2, 3] });
        assert.equal(await TF.relinkToTasks(g), false); assert.equal(g.actions.length, 0);
    });
});

describe('coherence debut / echeance de la fiche', () => {
    const J = 86400;
    it('rien a corriger quand l\'ordre est respecte ou qu\'une date manque', () => {
        assert.equal(TF.datesPatch({ dateDebut: 100 * J, dateEcheance: 110 * J }, 'dateEcheance', 120 * J), null);
        assert.equal(TF.datesPatch({ dateDebut: 100 * J, dateEcheance: null }, 'dateDebut', 130 * J), null);
        assert.equal(TF.datesPatch({ dateDebut: 100 * J, dateEcheance: 110 * J }, 'titre', 5), null);
    });
    it('une echeance avant le debut est alignee sur le debut', () => {
        const r = TF.datesPatch({ dateDebut: 100 * J, dateEcheance: 110 * J }, 'dateEcheance', 90 * J);
        assert.deepEqual(r.patch, { dateEcheance: 100 * J });
        assert.match(r.message, /ne peut pas précéder/);
    });
    it('un debut apres l\'echeance decale l\'echeance en gardant la duree', () => {
        const r = TF.datesPatch({ dateDebut: 100 * J, dateEcheance: 110 * J }, 'dateDebut', 150 * J);
        assert.deepEqual(r.patch, { dateEcheance: 160 * J });
    });
    it('sans debut precedent, le nouveau debut au-dela de l\'echeance donne une tache d\'un jour', () => {
        const r = TF.datesPatch({ dateDebut: null, dateEcheance: 110 * J }, 'dateDebut', 150 * J);
        assert.deepEqual(r.patch, { dateEcheance: 150 * J });
    });
});

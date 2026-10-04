'use strict';
// Tests de la semantique des statuts du core TaskFlow (DONE / DEAD / LIVE).
// Le core est un script navigateur (const TF = ...) : on le charge via Function.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'taskflow-core.js'), 'utf8');
const TF = new Function(src + '\nreturn TF;')();

function cfgDepuis(libelles) {
    return TF.buildStatusConfig(libelles.map(l => ({ value: l, label: l })), 'test');
}

describe('statuts par defaut', () => {
    const cfg = TF.buildStatusConfig([
        { value: 'todo' }, { value: 'inprogress' }, { value: 'review' }, { value: 'done' }
    ], 'test');

    it('le dernier statut est la cloture positive', () => {
        assert.equal(cfg.doneValue, 'done');
        assert.deepEqual(cfg.deadValues, []);
        assert.equal(cfg.terminalValue, 'done');
    });
    it('isDone / isLive coherents', () => {
        assert.equal(TF.isDone(cfg, 'done'), true);
        assert.equal(TF.isDone(cfg, 'review'), false);
        assert.equal(TF.isLive(cfg, 'inprogress'), true);
        assert.equal(TF.isDead(cfg, 'done'), false);
    });
});

describe('equivalence avec l ancienne convention (dernier = termine)', () => {
    const listes = [
        ['todo', 'inprogress', 'review', 'done'],
        ['A faire', 'En cours', 'Terminé'],
        ['Idée', 'Cadrage', 'Chantier', 'Reception'],
        ['Ouvert', 'Fermé']
    ];
    for (const valeurs of listes) {
        it('isDone === isTerminal et isLive === !isTerminal : ' + valeurs.join(' / '), () => {
            const cfg = TF.buildStatusConfig(valeurs.map(v => ({ value: v, label: v })), 'test');
            for (const v of valeurs) {
                assert.equal(TF.isDone(cfg, v), TF.isTerminal(cfg, v), v);
                assert.equal(TF.isLive(cfg, v), !TF.isTerminal(cfg, v), v);
                assert.equal(TF.isDead(cfg, v), false, v);
            }
        });
    }
});

describe('detection de la cloture positive', () => {
    const cas = [
        ['liste de gouvernance avec Annule en dernier', ['A faire', 'En cours', 'A valider', 'Validé', 'Annulé'], 'Validé', ['Annulé']],
        ['A valider apres Validé n est pas une cloture', ['Brouillon', 'Validé', 'À valider', 'Annulé'], 'Validé', ['Annulé']],
        ['Réalisation est une phase active, Livré clot', ['Backlog', 'Réalisation', 'Livré'], 'Livré', []],
        ['En cours de validation reste actif', ['Idée', 'En cours de validation', 'Terminé'], 'Terminé', []],
        ['Non terminé n est pas une cloture', ['Nouveau', 'Non terminé', 'Clos'], 'Clos', []],
        ['Définitif et Incomplet ne sont pas des clotures', ['Incomplet', 'Définitif', 'Fini'], 'Fini', []],
        ['formes feminines et pluriel', ['Ouverte', 'Terminée', 'Abandonnée'], 'Terminée', ['Abandonnée']],
        ['libelles anglais', ['Open', 'In progress', 'Done', 'Cancelled'], 'Done', ['Cancelled']],
        ['sans indice : dernier non annule', ['Nouveau', 'Chantier', 'Reception', 'Rejeté'], 'Reception', ['Rejeté']],
        ['sans indice ni annule : le dernier (ancienne convention)', ['Idée', 'Cadrage', 'Chantier'], 'Chantier', []]
    ];
    for (const [nom, liste, done, dead] of cas) {
        it(nom, () => {
            const cfg = cfgDepuis(liste);
            assert.equal(cfg.doneValue, done);
            assert.deepEqual(cfg.deadValues, dead);
        });
    }
    it('le statut de cloture n est jamais classe annule', () => {
        const cfg = TF.buildStatusConfig([{ value: 'done', label: 'Annulé ou terminé' }, { value: 'x', label: 'Annulé' }], 'test');
        assert.equal(TF.isDead(cfg, cfg.doneValue), false);
    });
    it('retro-compat : isTerminal vaut toujours le dernier', () => {
        const cfg = cfgDepuis(['A faire', 'Validé', 'Annulé']);
        assert.equal(TF.isTerminal(cfg, 'Annulé'), true);
        assert.equal(TF.isTerminal(cfg, 'Validé'), false);
    });
});

describe('libelle des modes de couleur', () => {
    it('traduit les modes connus et laisse passer les autres', () => {
        assert.equal(TF.colorModeLabel('priority'), 'priorité');
        assert.equal(TF.colorModeLabel('project'), 'projet');
        assert.equal(TF.colorModeLabel('assignee'), 'assigné');
        assert.equal(TF.colorModeLabel('status'), 'statut');
        assert.equal(TF.colorModeLabel('autre'), 'autre');
        assert.equal(TF.colorModeLabel(undefined), '');
    });
});

describe('en-tete de la fiche de tache', () => {
    it('le titre editable est l en-tete, echappe, avec fermeture', () => {
        const h = TF.panelHeaderHtml({ title: 'A "citer" <b>', placeholder: 'Titre...', index: 0, total: 1, isNew: false });
        assert.match(h, /id="taskTitle"/);
        assert.match(h, /value="A &quot;citer&quot; &lt;b&gt;"/);
        assert.match(h, /confirmClosePanel\(\)/);
        assert.doesNotMatch(h, /<b>/);
    });
    it('la navigation n/m n apparait que s il y a plusieurs taches et que ce n est pas une creation', () => {
        assert.match(TF.panelHeaderHtml({ title: 'x', index: 1, total: 5 }), />2\/5</);
        assert.doesNotMatch(TF.panelHeaderHtml({ title: 'x', index: 0, total: 1 }), /panel-nav/);
        assert.doesNotMatch(TF.panelHeaderHtml({ title: 'x', index: 0, total: 5, isNew: true }), /panel-nav/);
    });
    it('le bouton retour est optionnel (Calendrier)', () => {
        assert.match(TF.panelHeaderHtml({ title: 'x', back: true }), /backToPeriod\(\)/);
        assert.doesNotMatch(TF.panelHeaderHtml({ title: 'x' }), /backToPeriod/);
    });
    it('le point de couleur est optionnel et echappe', () => {
        assert.match(TF.panelHeaderHtml({ title: 'x', dotColor: '#e5484d', dotTitle: 'Priorité' }), /class="panel-dot" style="background:#e5484d"/);
        assert.doesNotMatch(TF.panelHeaderHtml({ title: 'x' }), /panel-dot/);
        assert.doesNotMatch(TF.panelHeaderHtml({ title: 'x', dotColor: '"><script>' }), /<script>/);
    });
});

describe('composants de la barre du haut', () => {
    const ui = TF.ui;
    it('la navigation de periode est identique pour le Gantt et le Calendrier', () => {
        const g = ui.periodNav({ prev: 'navigate(-1)', next: 'navigate(1)', today: 'goToToday()' });
        const c = ui.periodNav({ prev: 'navigate(-1)', next: 'navigate(1)', today: 'goToday()' });
        assert.equal(g.replace('goToToday', 'X'), c.replace('goToday', 'X'));
        assert.match(g, /id="currentPeriod"/);
        assert.ok(g.indexOf('navigate(-1)') < g.indexOf('currentPeriod') && g.indexOf('currentPeriod') < g.indexOf('navigate(1)') && g.indexOf('navigate(1)') < g.indexOf('goToToday'));
    });
    it('le segmente garde ids, data-view, onclick et la classe active', () => {
        const h = ui.segmented({ label: 'Grouper', cls: 'group-selector', items: [{ label: 'Statut', id: 'groupStatut', onclick: "setGroupBy('statut')", active: true }, { label: 'Mois', view: 'month', onclick: "setView('month')", title: 'Vue' }] });
        assert.match(h, /class="tf-seg group-selector"/);
        assert.match(h, /class="btn active" id="groupStatut" onclick="setGroupBy\('statut'\)"/);
        assert.match(h, /data-view="month"/);
        assert.match(h, /hdr-glabel">Grouper</);
    });
    it('le menu Affichage reprend les selects avec leurs ids et sans prefixe redondant', () => {
        const h = ui.displayMenu({ fields: [ui.sortField(), ui.colorField('Couleur des barres'), ui.levelField()], actions: [{ label: 'Ajuster', onclick: 'fitToTasks()' }] });
        for (const id of ['sortSelect', 'colorSelect', 'levelSelect']) assert.match(h, new RegExp('<select id="' + id + '"'));
        assert.match(h, /data-tray-toggle="display"/);
        assert.match(h, /data-panel="display"/);
        assert.match(h, />Priorité</);
        assert.doesNotMatch(h, /Couleur :|Niveau :|Tri:/);
        assert.match(h, /fitToTasks\(\)/);
    });
    it('les options de niveau et de couleur sont les memes partout', () => {
        assert.deepEqual([...ui.levelField().html.matchAll(/value="(\w+)"/g)].map(m => m[1]), ['all', 'actions', 'parents']);
        assert.deepEqual([...ui.colorField('x').html.matchAll(/value="(\w+)"/g)].map(m => m[1]), ['priority', 'project', 'assignee', 'status']);
    });
    it('l entete assemble les zones dans l ordre titre, vue, outils, actions', () => {
        const h = ui.header({ title: { icon: '<svg/>', text: 'Kanban' }, view: ['<i id="v"></i>'], tools: ['<i id="t"></i>'], actions: ['<i id="a"></i>'] });
        const pos = ['hz-title', 'hz-view', 'hz-tools', 'hz-actions'].map(z => h.indexOf(z));
        assert.deepEqual([...pos].sort((a, b) => a - b), pos);
        assert.ok(pos.every(p => p >= 0));
        assert.doesNotMatch(ui.header({ title: { text: 'Dashboard' } }), /hz-view/);
    });
    it('la disposition de la barre ne depend que de la largeur : une ligne d abord, deux lignes sur ecran etroit', () => {
        const m = ui.modeForWidth;
        assert.deepEqual(m(1600), {});
        assert.deepEqual(m(1400), { top: true });
        assert.deepEqual(m(1300), { top: true, search: true });
        assert.deepEqual(m(1200), { top: true, tools: true });
        assert.deepEqual(m(900), { top: true, tools: true, bare: true });
        assert.ok(!m(740).two, 'une seule ligne jusqu a 720 px');
        const etroit = m(600);
        assert.ok(etroit.two && etroit.top && etroit.bare);
        assert.ok(!m(380).tools && m(340).search && m(300).tools, 'les outils de la 2e ligne gardent leurs libelles tant qu ils tiennent');
        // jamais plus de compaction a une plus grande largeur
        const rang = (x) => (x.two ? 10 : 0) + (x.top ? 1 : 0) + (x.search ? 1 : 0) + (x.tools ? 1 : 0) + (x.bare ? 1 : 0);
        for (let w = 1700; w > 300; w -= 10) assert.ok(rang(m(w)) <= rang(m(w - 10)), 'monotone a ' + w);
    });
    it('le menu d actions ne porte plus de style en ligne et echappe ses libelles', () => {
        const h = ui.moreMenu({ toggle: "toggleFilterMenu('more')", containerId: 'moreDropdown', menuId: 'filterMoreMenu', items: [{ label: 'A <b>', onclick: 'x()' }, { sep: true }] });
        assert.doesNotMatch(h, /style=/);
        assert.match(h, /filter-menu-right/);
        assert.match(h, /A &lt;b&gt;/);
        assert.match(h, /filter-sep/);
    });
});

describe('aide discrete « i »', () => {
    it('porte le texte en info-bulle et pour les lecteurs d ecran, echappe', () => {
        const h = TF.ui.info('Aucune sous-tâche. "Décomposez" <ici>');
        assert.ok(h.includes('class="tf-info"'));
        assert.ok(h.includes('data-tip="Aucune sous-tâche. &quot;Décomposez&quot; &lt;ici&gt;"'));
        assert.ok(h.includes('aria-label="Aucune sous-tâche.'));
        assert.ok(h.includes('tabindex="0"'));
        assert.ok(!h.includes('<ici>'));
    });
});

describe('recherche commune', () => {
    const ctx = { projects: [{ id: 1, nom: 'Refonte Portail' }], team: [{ id: 1, nom: 'Alice Martin' }, { id: 2, nom: 'Bob Durant' }] };
    const t = { titre: 'Réunion client', description: 'Préparer la démo', tags: ['L', 'qa', 'tests'], projet: 1, assignees: ['L', 1] };
    it('requete vide = tout passe', () => {
        assert.equal(TF.searchMatch(t, '', ctx), true);
        assert.equal(TF.searchMatch(t, '   ', ctx), true);
    });
    it('insensible a la casse et aux accents', () => {
        assert.equal(TF.searchMatch(t, 'REUNION', ctx), true);
        assert.equal(TF.searchMatch(t, 'preparer la demo', ctx), true);
    });
    it('cherche dans les tags, le projet et les assignes', () => {
        assert.equal(TF.searchMatch(t, 'qa', ctx), true);
        assert.equal(TF.searchMatch(t, 'portail', ctx), true);
        assert.equal(TF.searchMatch(t, 'alice', ctx), true);
        assert.equal(TF.searchMatch(t, 'bob', ctx), false);
    });
    it('plusieurs mots : tous doivent etre presents', () => {
        assert.equal(TF.searchMatch(t, 'client alice', ctx), true);
        assert.equal(TF.searchMatch(t, 'client bob', ctx), false);
    });
    it('tolere une tache sans champs et un contexte absent', () => {
        assert.equal(TF.searchMatch({}, 'x'), false);
        assert.equal(TF.searchMatch(null, 'x'), false);
        assert.equal(TF.searchMatch({ titre: 'x' }, 'x'), true);
    });
});

describe('libelles de boutons repliables', () => {
    it('Filtres, Affichage, Aujourd hui et le bouton de creation portent un libelle masquable et une info-bulle', () => {
        const f = TF.ui.filters({ toggle: 'x()' });
        assert.ok(f.includes('<span class="btn-label">Filtres</span>') && f.includes('title="Filtres"'));
        const d = TF.ui.displayMenu({ fields: [] });
        assert.ok(d.includes('<span class="btn-label">Affichage</span>') && d.includes('aria-label="Affichage"'));
        const n = TF.ui.periodNav({ prev: 'a()', next: 'b()', today: 'c()' });
        assert.ok(n.includes('<span class="btn-label">Aujourd\'hui</span>'));
        const b = TF.ui.button({ icon: 'plus', label: 'Tâche', title: 'Nouvelle tâche', onclick: 'x()', primary: true });
        assert.ok(b.includes('<span class="btn-label">Tâche</span>') && b.includes('title="Nouvelle tâche"') && b.includes('class="btn primary"'));
    });
    it('un bouton sans icone garde son libelle en clair', () => {
        const b = TF.ui.button({ label: 'Modifier', onclick: 'x()' });
        assert.ok(!b.includes('btn-label') && b.includes('>Modifier<'));
    });
});

describe('libelle de periode court', () => {
  it('abrege le mois et l\'annee', () => {
    assert.equal(TF.monthYearShort(new Date(2026, 9, 4)), 'Oct. 26');
    assert.equal(TF.monthYearShort(new Date(2026, 4, 4)), 'Mai 26');
    assert.equal(TF.monthYearShort(new Date(2027, 1, 1)), 'Févr. 27');
    assert.equal(TF.monthYearShort(new Date(2026, 7, 1)), 'Août 26');
  });
  it('rend les deux formes dans le libelle', () => {
    const el = { title: '', innerHTML: '' };
    global.document = { getElementById: () => el };
    try {
      TF.setPeriodLabel('Octobre 2026', 'Oct. 26');
      assert.equal(el.title, 'Octobre 2026');
      assert.match(el.innerHTML, /pl-long">Octobre 2026</);
      assert.match(el.innerHTML, /pl-short">Oct\. 26</);
      TF.setPeriodLabel('2026');
      assert.match(el.innerHTML, /pl-short">2026</);
    } finally { delete global.document; }
  });
});

describe('statut d\'une tache (statusOf)', () => {
  const cfg = TF.buildStatusConfig([
    { value: 'a_cadrer', label: 'A cadrer' }, { value: 'en_cours', label: 'En cours' }, { value: 'clos', label: 'Clos' }
  ], 'test');
  it('garde un statut connu', () => assert.equal(TF.statusOf(cfg, { statut: 'en_cours' }), 'en_cours'));
  it('range un statut vide dans le premier statut configure', () => {
    assert.equal(TF.statusOf(cfg, { statut: '' }), 'a_cadrer');
    assert.equal(TF.statusOf(cfg, { statut: null }), 'a_cadrer');
    assert.equal(TF.statusOf(cfg, {}), 'a_cadrer');
  });
  it('range un statut supprime de la colonne dans le premier statut', () => assert.equal(TF.statusOf(cfg, { statut: 'todo' }), 'a_cadrer'));
  it('ne depend plus du code todo en dur', () => assert.notEqual(TF.statusOf(cfg, {}), 'todo'));
});

describe('cloture coherente (completionPatch)', () => {
  const cfg = TF.buildStatusConfig(TF.DEFAULT_STATUSES, 'test');
  const auj = TF.todayGrist();
  it('statut terminé -> 100 % et date de cloture', () => {
    assert.deepEqual(TF.completionPatch(cfg, { statut: 'inprogress', progression: 40 }, { statut: 'done' }), { progression: 100, dateCloture: auj });
  });
  it('statut terminé deja a 100 % -> seulement la date', () => {
    assert.deepEqual(TF.completionPatch(cfg, { statut: 'review', progression: 100 }, { statut: 'done' }), { dateCloture: auj });
  });
  it('atteindre 100 % -> statut terminé et date', () => {
    assert.deepEqual(TF.completionPatch(cfg, { statut: 'inprogress', progression: 60 }, { progression: 100 }), { statut: 'done', dateCloture: auj });
  });
  it('repasser sous 100 % -> reouverture et date effacee', () => {
    assert.deepEqual(TF.completionPatch(cfg, { statut: 'done', progression: 100, dateCloture: 1 }, { progression: 50 }), { statut: 'inprogress', dateCloture: null });
    assert.deepEqual(TF.completionPatch(cfg, { statut: 'done', progression: 100, dateCloture: 1 }, { progression: 0 }), { statut: 'todo', dateCloture: null });
  });
  it('quitter le statut terminé -> date effacee', () => {
    assert.deepEqual(TF.completionPatch(cfg, { statut: 'done', progression: 100 }, { statut: 'review' }), { dateCloture: null });
  });
  it('ne fait rien quand rien ne change de cloture', () => {
    assert.deepEqual(TF.completionPatch(cfg, { statut: 'inprogress', progression: 10 }, { progression: 80 }), {});
    assert.deepEqual(TF.completionPatch(cfg, { statut: 'todo' }, { statut: 'inprogress' }), {});
    assert.deepEqual(TF.completionPatch(cfg, { statut: 'todo' }, { titre: 'x' }), {});
  });
});

describe('suppression d\'une tache (deletePlan)', () => {
  const tasks = [{ id: 1 }, { id: 2, parentTask: 1 }, { id: 3, parentTask: 2 }, { id: 4, parentTask: 1 }, { id: 5 }];
  it('detach : le parent seul est supprime, ses enfants directs deviennent racines', () => {
    const p = TF.deletePlan(tasks, 1, 'detach');
    assert.deepEqual(p.removed, [1]);
    assert.deepEqual(p.detached, [2, 4]);
    assert.deepEqual(p.actions, [['UpdateRecord', 'Tasks', 2, { parentTask: null }], ['UpdateRecord', 'Tasks', 4, { parentTask: null }], ['RemoveRecord', 'Tasks', 1]]);
  });
  it('cascade : toute la descendance est supprimee, rien n\'est detache', () => {
    const p = TF.deletePlan(tasks, 1, 'cascade');
    assert.deepEqual(p.removed.sort(), [1, 2, 3, 4]);
    assert.deepEqual(p.detached, []);
    assert.equal(p.actions.length, 4);
    assert.ok(p.actions.every(a => a[0] === 'RemoveRecord'));
  });
  it('une tache sans enfant n\'a qu\'une action', () => {
    assert.deepEqual(TF.deletePlan(tasks, 5, 'detach').actions, [['RemoveRecord', 'Tasks', 5]]);
  });
  it('ne boucle pas sur un cycle parent/enfant', () => {
    const cyc = [{ id: 1, parentTask: 2 }, { id: 2, parentTask: 1 }];
    assert.deepEqual(TF.deletePlan(cyc, 1, 'cascade').removed.sort(), [1, 2]);
  });
});

describe('confirmation de suppression', () => {
  it('simple sans sous-tache', () => {
    const h = TF.deleteConfirmHtml(0);
    assert.match(h, /Supprimer cette tâche \?/);
    assert.doesNotMatch(h, /cascade/);
  });
  it('a trois issues avec sous-taches', () => {
    const h = TF.deleteConfirmHtml(3);
    assert.match(h, /3 sous-tâches/);
    assert.match(h, /confirmDelete\('detach'\)/);
    assert.match(h, /confirmDelete\('cascade'\)/);
    assert.match(h, /hideDeleteConfirm\(\)/);
  });
});

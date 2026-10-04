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

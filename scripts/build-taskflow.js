#!/usr/bin/env node
/*
 * build-taskflow.js — Inline les modules communs TaskFlow dans chaque widget.
 *
 * Architecture : sources DRY, livrables autonomes. Chaque widget reste un fichier
 * HTML autonome (collable dans le custom widget builder de Grist, resilient).
 *
 *   1. Core JavaScript (tous les widgets, Plan et Whiteboard compris)
 *      - source unique : projects/tasks_app/core/taskflow-core.js
 *      - inline entre deux lignes de commentaire JS "// <taskflow-core>" et
 *        "// </taskflow-core>".
 *
 *   2. Interface CSS commune (kanban, gantt, calendar, dashboard uniquement ;
 *      le Plan et le Whiteboard gardent leur propre identite visuelle)
 *      - source unique : projects/tasks_app/core/taskflow-ui.css
 *      - inline entre deux commentaires CSS ouvrant et fermant dont le texte est
 *        "taskflow-ui" (voir BLOCKS ci-dessous ; ils ne sont pas ecrits ici car
 *        une fermeture de commentaire fermerait cet en-tete).
 *
 * Le script remplace tout ce qui se trouve entre les marqueurs par le contenu de
 * la source, en respectant l'indentation du marqueur d'ouverture. Idempotent.
 *
 * Un widget sans marqueurs est ignore (avertissement), jamais modifie.
 *
 * Usage : node scripts/build-taskflow.js [--check]
 *   --check : ne reecrit rien, sort en code 1 si un widget est desynchronise (CI).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CORE_PATH = path.join(ROOT, 'projects', 'tasks_app', 'core', 'taskflow-core.js');
const UI_PATH = path.join(ROOT, 'projects', 'tasks_app', 'core', 'taskflow-ui.css');

// Widgets cibles. Le Whiteboard n'adopte qu'un sous-ensemble mais partage les memes
// marqueurs : le core est concu pour etre inerte si ses fonctions ne sont pas appelees.
const TARGETS = [
    path.join(ROOT, 'projects', 'tasks_app', 'kanban.html'),
    path.join(ROOT, 'projects', 'tasks_app', 'gantt.html'),
    path.join(ROOT, 'projects', 'tasks_app', 'calendar.html'),
    path.join(ROOT, 'projects', 'tasks_app', 'dashboard.html'),
    path.join(ROOT, 'projects', 'tasks_app', 'plan.html'),
    path.join(ROOT, 'projects', 'whiteboard', 'index.html')
];
// Le CSS commun ne concerne que les 4 widgets principaux.
const UI_TARGETS = TARGETS.slice(0, 4);

const NOTE = ' -- GENERE par scripts/build-taskflow.js, NE PAS EDITER ICI';
const BLOCKS = [
    {
        nom: 'core',
        source: CORE_PATH,
        targets: TARGETS,
        open: '// <taskflow-core>',
        close: '// </taskflow-core>',
        openLine: (indent) => indent + '// <taskflow-core>' + NOTE,
        closeLine: (indent) => indent + '// </taskflow-core>'
    },
    {
        nom: 'ui',
        source: UI_PATH,
        targets: UI_TARGETS,
        open: '/* <taskflow-ui>',
        close: '/* </taskflow-ui>',
        openLine: (indent) => indent + '/* <taskflow-ui>' + NOTE + ' */',
        closeLine: (indent) => indent + '/* </taskflow-ui> */'
    }
];

function readSource(block) {
    if (!fs.existsSync(block.source)) {
        console.error('ERREUR: source ' + block.nom + ' introuvable: ' + block.source);
        process.exit(1);
    }
    // La source est ecrite pour etre inlinable telle quelle : on la prend integralement.
    return fs.readFileSync(block.source, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');
}

// Remplace le bloc balise dans `lines`. Retourne { lines } ou { skipped } ou { error }.
function inlineBlock(lines, block, content, name) {
    // Matching LIGNE PAR LIGNE : un marqueur n'est reconnu que s'il est SEUL sur sa
    // ligne (apres trim, la ligne COMMENCE par le marqueur). Cela evite toute
    // collision avec une occurrence du texte du marqueur a l'interieur du contenu.
    const isOpen = (l) => l.trim().indexOf(block.open) === 0;
    const isClose = (l) => l.trim().indexOf(block.close) === 0;

    const openLine = lines.findIndex(isOpen);
    if (openLine === -1) {
        console.warn('IGNORE (pas de marqueurs ' + block.nom + '): ' + name);
        return { skipped: true };
    }
    let closeLine = -1;
    for (let i = openLine + 1; i < lines.length; i++) { if (isClose(lines[i])) { closeLine = i; break; } }
    if (closeLine === -1) {
        console.error('ERREUR (marqueur fermant ' + block.nom + ' absent): ' + name);
        return { error: true };
    }
    const indent = (lines[openLine].match(/^[ \t]*/) || [''])[0];
    const body = content.split('\n').map(line => (line.length ? indent + line : line));
    return {
        lines: [].concat(lines.slice(0, openLine), [block.openLine(indent)], body, [block.closeLine(indent)], lines.slice(closeLine + 1))
    };
}

function buildFile(filePath, sources, check) {
    const name = path.relative(ROOT, filePath);
    if (!fs.existsSync(filePath)) {
        console.warn('IGNORE (absent): ' + name);
        return { changed: false, skipped: true };
    }
    const original = fs.readFileSync(filePath, 'utf8');
    const eol = original.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
    let lines = original.replace(/\r\n/g, '\n').split('\n');

    for (const block of BLOCKS) {
        if (block.targets.indexOf(filePath) === -1 || sources[block.nom] == null) continue;
        const r = inlineBlock(lines, block, sources[block.nom], name);
        if (r.error) return { changed: false, error: true };
        if (r.lines) lines = r.lines;
    }
    const next = lines.join(eol);

    if (next === original) {
        console.log('OK (a jour): ' + name);
        return { changed: false };
    }
    if (check) {
        console.error('DESYNC: ' + name + ' (lancer: npm run build:taskflow)');
        return { changed: true, desync: true };
    }
    fs.writeFileSync(filePath, next, 'utf8');
    console.log('MAJ: ' + name);
    return { changed: true };
}

function main() {
    const check = process.argv.includes('--check');
    const sources = {};
    for (const block of BLOCKS) {
        // La source CSS est optionnelle tant qu'aucun widget n'en porte les marqueurs.
        if (block.nom === 'ui' && !fs.existsSync(block.source)) { sources.ui = null; continue; }
        sources[block.nom] = readSource(block);
    }
    let desync = false, error = false;
    for (const f of TARGETS) {
        const r = buildFile(f, sources, check);
        if (r.desync) desync = true;
        if (r.error) error = true;
    }
    if (error) process.exit(1);
    if (check && desync) process.exit(1);
}

main();

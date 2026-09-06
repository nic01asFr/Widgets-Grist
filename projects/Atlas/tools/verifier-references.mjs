#!/usr/bin/env node
/**
 * Vérifie que `app_v7.js` n'appelle aucune fonction qu'il ne définit pas.
 *
 * ## Pourquoi cet outil existe
 *
 * Le 06/09/2026, un commit qui réécrivait `boutonRevueObjets` a emporté la
 * fonction voisine, `renderSymbologyInspector`, et sa variable d'onglet.
 * Sélectionner une couche levait dès lors un `ReferenceError` **depuis un
 * `onclick`** — donc dans l'iframe du widget, invisible depuis la console de
 * la page Grist hôte, qui est d'une autre origine.
 *
 * Le symptôme : le panneau de droite ne s'ouvre plus. Rien d'autre. On cherche
 * du côté de l'état, du CSS, des droits — partout sauf là où c'est.
 *
 * Ni `node --check` (la syntaxe est valide) ni `verifier-imports.mjs` (qui ne
 * regarde que les imports) ne voient ce défaut. D'où ce troisième garde.
 *
 *     node tools/verifier-references.mjs
 *
 * ## Ce qu'il vérifie, et ce qu'il ne vérifie pas
 *
 * Deux passes, l'une et l'autre volontairement grossières mais sans faux
 * négatif sur la faute visée — une définition entièrement disparue :
 *
 * 1. **Les appels nus** `nom(...)` dont le `nom` n'est déclaré nulle part dans
 *    le fichier, ni importé, ni connu comme global.
 * 2. **Les gestionnaires en ligne** `A.nom(` écrits dans les gabarits HTML,
 *    dont le `nom` n'est pas une clé de l'objet `A`. Ceux-là échouent au clic,
 *    des semaines après, et aucun outil de construction ne les voit.
 *
 * Il ne fait **pas** d'analyse de portée : une variable locale qui masque un
 * nom global, ou une fonction déclarée dans un bloc, sont acceptées telles
 * quelles. C'est un détecteur de disparition, pas un vérificateur de types.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Ce que la plateforme fournit. La liste est courte exprès : un nom oublié ici
 * produit un faux positif bruyant, qu'on corrige en l'ajoutant — un nom en trop
 * masquerait une vraie disparition, ce qui est le seul risque à éviter.
 */
const GLOBAUX = new Set([
  // Langage
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt', 'Math',
  'JSON', 'Date', 'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError',
  'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect', 'Function',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'eval', 'Intl', 'structuredClone',
  'Uint8Array', 'Uint8ClampedArray', 'Int32Array', 'Float32Array', 'Float64Array',
  'ArrayBuffer', 'DataView', 'queueMicrotask',
  // Navigateur
  'window', 'document', 'console', 'navigator', 'location', 'history', 'screen',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'fetch',
  'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
  'alert', 'confirm', 'prompt', 'atob', 'btoa', 'getComputedStyle', 'matchMedia',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'Blob', 'File', 'FileReader', 'FormData', 'URL', 'URLSearchParams', 'Image',
  'Event', 'CustomEvent', 'AbortController', 'Headers', 'Request', 'Response',
  'ResizeObserver', 'IntersectionObserver', 'MutationObserver', 'DOMParser',
  'TextEncoder', 'TextDecoder', 'Worker', 'localStorage', 'sessionStorage',
  'Node', 'Element', 'HTMLElement', 'XMLHttpRequest', 'CSS', 'AudioContext',
  'OffscreenCanvas', 'ImageData', 'Path2D', 'WebGLRenderingContext',
  // Fournis par la page
  'maplibregl', 'grist', 'THREE', 'FormEngine', 'GristForms',
]);

/** Les mots-clés qui, suivis d'une parenthèse, ressemblent à un appel. */
const MOTS_CLES = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function',
  'await', 'new', 'else', 'do', 'super', 'import', 'yield', 'delete', 'void',
  'in', 'of', 'case', 'throw', 'instanceof', 'this', 'class', 'try', 'finally',
  'const', 'let', 'var', 'export', 'default', 'extends', 'get', 'set', 'static',
]);

/**
 * Neutralise ce qui n'est pas du code exécutable, pour ne pas prendre un mot
 * de commentaire pour un appel. Les gabarits ne sont PAS neutralisés : c'est
 * là que vivent les `onclick`, et la passe 2 en a besoin.
 */
function sansCommentaires(source) {
  // Les sauts de ligne sont CONSERVÉS. Le rapport donne un numéro de ligne, et
  // un outil qui pointe à côté envoie lire le mauvais endroit — ce qui coûte
  // plus cher que de ne rien signaler du tout.
  const vider = (bloc) => bloc.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, vider)
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (tout, avant) => avant + ' '.repeat(tout.length - avant.length));
}

/**
 * Efface le contenu des chaînes, en gardant le code des interpolations.
 *
 * > **Sans cela, l'outil ne sert à rien.** Le fichier est fait de gabarits, et
 * > le français y écrit « 3 couche(s) », « objet(s) enregistré(s) » ; le CSS y
 * > écrit `translateX(-50%)` et `linear-gradient(90deg, …)`. Un mot suivi d'une
 * > parenthèse ressemble à un appel, et neuf faux positifs sur neuf noient le
 * > seul vrai qu'on cherche.
 *
 * Les `${…}` d'un gabarit sont du code, eux, et restent lisibles : c'est là que
 * vivent la moitié des appels du fichier.
 */
function sansChaines(source) {
  let out = '';
  let i = 0;
  const n = source.length;
  let profondeur = 0; // imbrication des `${ }` dans un gabarit
  // Ce qui, juste avant un `/`, en fait un début d'expression régulière plutôt
  // qu'une division. Sans cette distinction, `.replace(/'/g, …)` ouvre une
  // fausse chaîne sur son apostrophe et avale le code jusqu'à la suivante —
  // des dizaines de fonctions bien réelles passent alors pour disparues.
  const AVANT_REGEX = new Set([...'(,=:[!&|?{};+-*%~^<>', '\n', '\t', ' ', '']);
  const dernierUtile = () => {
    for (let k = out.length - 1; k >= 0; k--) {
      if (!/\s/.test(out[k])) return out[k];
    }
    return '';
  };
  while (i < n) {
    const c = source[i];
    if (c === '/' && AVANT_REGEX.has(dernierUtile())) {
      // Un littéral regex : on le vide, il peut contenir `foo(`.
      let j = i + 1;
      let classe = false;
      let ferme = false;
      while (j < n && source[j] !== '\n') {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === '[') classe = true;
        else if (source[j] === ']') classe = false;
        else if (source[j] === '/' && !classe) { ferme = true; break; }
        j++;
      }
      if (ferme) {
        out += '/' + ' '.repeat(j - i - 1) + '/';
        i = j + 1;
        while (i < n && /[a-z]/.test(source[i])) { out += source[i]; i++; }
        continue;
      }
    }
    if (c === "'" || c === '"') {
      const fin = c;
      out += c;
      i++;
      while (i < n && source[i] !== fin) {
        if (source[i] === '\\') { out += '  '; i += 2; continue; }
        out += source[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < n) { out += fin; i++; }
      continue;
    }
    if (c === '`') {
      out += c;
      i++;
      while (i < n) {
        if (source[i] === '\\') { out += '  '; i += 2; continue; }
        if (source[i] === '`') { out += '`'; i++; break; }
        if (source[i] === '$' && source[i + 1] === '{') {
          // Une interpolation : on recopie le code jusqu'à son accolade jumelle.
          out += '${';
          i += 2;
          profondeur = 1;
          while (i < n && profondeur > 0) {
            if (source[i] === '{') profondeur++;
            else if (source[i] === '}') profondeur--;
            if (profondeur === 0) break;
            out += source[i];
            i++;
          }
          out += '}';
          i++;
          continue;
        }
        out += source[i] === '\n' ? '\n' : ' ';
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Tout ce que le fichier déclare, à n'importe quelle profondeur. */
function declarations(source) {
  const noms = new Set();
  const ajouter = (re, groupe = 1) => {
    for (const m of source.matchAll(re)) noms.add(m[groupe]);
  };
  ajouter(/(?:^|[\s(,=[{;!])(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g);
  ajouter(/(?:^|[\s(,;])(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g);
  ajouter(/(?:^|[\s(,;])class\s+([A-Za-z_$][\w$]*)/g);
  // import { a, b as c } / import x from
  for (const m of source.matchAll(/import\s*\{([^}]+)\}/g)) {
    for (const brut of m[1].split(',')) {
      const nom = brut.trim().split(/\s+as\s+/).pop().trim();
      if (nom) noms.add(nom);
    }
  }
  ajouter(/import\s+([A-Za-z_$][\w$]*)\s+from/g);
  // Déstructuration : const { a, b } = ... et const [a, b] = ...
  for (const m of source.matchAll(/(?:const|let|var)\s*[{[]([^}\]]*)[}\]]\s*=/g)) {
    for (const brut of m[1].split(',')) {
      const nom = brut.trim().split(/[:=]/).pop().trim().replace(/^\.\.\./, '');
      if (/^[A-Za-z_$][\w$]*$/.test(nom)) noms.add(nom);
    }
  }
  // Paramètres de fonction, y compris les flèches
  for (const m of source.matchAll(/\(([^()]*)\)\s*(?:=>|\{)/g)) {
    for (const brut of m[1].split(',')) {
      const nom = brut.trim().split(/[:=]/)[0].trim().replace(/^\.\.\./, '');
      if (/^[A-Za-z_$][\w$]*$/.test(nom)) noms.add(nom);
    }
  }
  for (const m of source.matchAll(/(?:^|[\s(,=])([A-Za-z_$][\w$]*)\s*=>/g)) noms.add(m[1]);
  // Méthodes abrégées d'objet — et les accesseurs `get baseUrl() { … }`, dont
  // le nom ressemble sinon à un appel qu'on ne trouve nulle part.
  ajouter(/(?:^|[{,\n]\s*)(?:async\s+|get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*\{/g);
  return noms;
}

/** Les appels nus — `nom(`, non précédés d'un point ni d'un mot-clé. */
function appels(source) {
  const out = new Map();
  const lignes = source.split('\n');
  lignes.forEach((ligne, i) => {
    for (const m of ligne.matchAll(/(^|[^.\w$'"`?])([A-Za-z_$][\w$]*)\(/g)) {
      const nom = m[2];
      if (MOTS_CLES.has(nom)) continue;
      if (!out.has(nom)) out.set(nom, i + 1);
    }
  });
  return out;
}

/** Les clés de l'objet `A` — celui que les `onclick` interrogent. */
function clesDeA(source) {
  const debut = source.indexOf('const A = {');
  if (debut < 0) return null;
  // On s'arrête au premier `};` en colonne 0 : l'objet est écrit à plat.
  const fin = source.indexOf('\n};', debut);
  const corps = source.slice(debut, fin < 0 ? source.length : fin);
  const cles = new Set();
  for (const m of corps.matchAll(/(?:^|[\n,{]\s*)(?:async\s+)?([A-Za-z_$][\w$]*)\s*[:(]/g)) {
    cles.add(m[1]);
  }
  // Les raccourcis — et il y en a plusieurs par ligne : `openOSM, runOSM,`.
  // N'en lire qu'un signalait `A.runOSM()` comme inexistant, ce qui est faux.
  for (const ligne of corps.split('\n')) {
    if (!/^\s{4}[A-Za-z_$][\w$]*(\s*,\s*[A-Za-z_$][\w$]*)*\s*,\s*$/.test(ligne)) continue;
    for (const nom of ligne.split(',')) if (nom.trim()) cles.add(nom.trim());
  }
  return cles;
}

/** Les `A.nom(` écrits dans les gabarits, et la ligne où ils apparaissent. */
function appelsInline(source) {
  const out = new Map();
  source.split('\n').forEach((ligne, i) => {
    for (const m of ligne.matchAll(/\bA\.([A-Za-z_$][\w$]*)\s*[(?]/g)) {
      if (!out.has(m[1])) out.set(m[1], i + 1);
    }
  });
  return out;
}

const fichiers = process.argv.slice(2).length ? process.argv.slice(2) : ['app_v7.js'];
let fautes = 0;

for (const fichier of fichiers) {
  const brut = readFileSync(resolve(RACINE, fichier), 'utf8');
  const code = sansChaines(sansCommentaires(brut));
  const connus = declarations(code);

  for (const [nom, ligne] of appels(code)) {
    if (connus.has(nom) || GLOBAUX.has(nom)) continue;
    console.error(`  appelée mais jamais définie  ${nom}()  —  ${fichier}:${ligne}`);
    fautes++;
  }

  const cles = clesDeA(code);
  if (cles) {
    for (const [nom, ligne] of appelsInline(brut)) {
      if (cles.has(nom)) continue;
      console.error(`  A.${nom}() n'existe pas sur l'objet A  —  ${fichier}:${ligne}`);
      fautes++;
    }
  }
}

if (fautes) {
  console.error(`\n${fautes} référence(s) sans définition. La page se chargera, et cassera au clic.`);
  process.exit(1);
}
console.log(`références vérifiées — ${fichiers.join(', ')} : tout appel a sa définition.`);

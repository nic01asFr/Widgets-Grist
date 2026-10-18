/**
 * Les schémas publiés valident-ils les données réelles ?
 *
 * Un contrat qui rejette ce que ses propres producteurs émettent ne contraint
 * rien : il ment. On le vérifie donc contre les fixtures attestées — celles qui
 * viennent de vrais imports — plutôt que contre des exemples écrits pour lui.
 *
 * Le validateur est minimal et fait maison : le dépôt tient à n'avoir aucune
 * dépendance de build, et on n'utilise qu'une part réduite de draft-07 —
 * type, required, enum, const, properties, items, oneOf, $ref local.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { valider } = require('./valider-schema.js');

const RACINE = path.join(__dirname, '..');
const SCHEMAS = path.join(RACINE, 'published', 'schemas');

const lire = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/* ------------------------------------------------------------------ */

test('chaque schéma publié est un JSON valide et se désigne par une adresse atteignable', () => {
  const fichiers = fs.readdirSync(SCHEMAS).filter((f) => f.endsWith('.schema.json'));
  assert.ok(fichiers.length >= 2, 'au moins deux contrats publiés');

  for (const f of fichiers) {
    const s = lire(path.join(SCHEMAS, f));
    assert.ok(s.$schema, `${f} : doit déclarer sa version de JSON Schema`);
    // Un $id qui pointe dans le vide interdit toute résolution de référence,
    // et c'est précisément ce qu'on corrige ici.
    assert.match(s.$id || '', /^https:\/\/[a-z0-9.-]+\.(io|org|fr|com|net)\//,
      `${f} : $id doit être une adresse réelle, pas un domaine fictif`);
    assert.ok(s.$id.endsWith(f), `${f} : le $id doit finir par le nom du fichier servi`);
    assert.match(s.$id, /-\d+\.\d+(\.\d+)?\.schema\.json$/,
      `${f} : le $id doit porter une version, pour qu'un agent puisse la cibler`);
    assert.ok(s.description, `${f} : un agent lit la description avant le schéma`);
  }
});

test('le Scene Manifest valide les scènes réellement produites', () => {
  const schema = lire(path.join(SCHEMAS, 'scene-manifest-0.2.2.schema.json'));
  const dossier = path.join(RACINE, 'projects', 'Atlas', 'tests', 'fixtures');
  const fixtures = fs.readdirSync(dossier).filter((f) => /^scene-manifest.*\.json$/.test(f));

  assert.ok(fixtures.length >= 2, 'des scènes attestées doivent exister');

  for (const f of fixtures) {
    let scene = lire(path.join(dossier, f));
    scene = scene.scene || scene.manifest || scene;
    const ecarts = valider(scene, schema, schema);
    assert.deepEqual(ecarts, [], `${f} rejetée par le schéma :\n  ${ecarts.join('\n  ')}`);
  }
});

test('le schéma refuse ce qui n’est pas une scène', () => {
  const schema = lire(path.join(SCHEMAS, 'scene-manifest-0.2.2.schema.json'));
  // Sans cette vérification, un schéma tout permissif passerait le test
  // précédent sans rien garantir.
  assert.ok(valider({}, schema, schema).length > 0, 'un objet vide doit être refusé');
  assert.ok(valider({ version: '9.9', layers: [] }, schema, schema).length > 0,
    'une version inconnue doit être refusée');
  assert.ok(valider({ version: '0.2.2', layers: [{}] }, schema, schema).length > 0,
    'une couche sans nom doit être refusée');
  assert.ok(
    valider({ version: '0.2.2', layers: [{ name: 'x', controls: [{ field: 'f', type: 'zigzag' }] }] },
      schema, schema).length > 0,
    'un type de contrôle inconnu doit être refusé');
});

/* ------------------------------------------------------------------ *
 * Source et copie publiée : un seul contrat, pas deux.
 *
 * `projects/grist_forms/runtime/*.schema.json` est ce que lit le widget ;
 * `published/schemas/*-X.Y.schema.json` est ce que le monde lit. La seule
 * différence permise est l'`$id` : la copie servie porte son adresse, la
 * source n'en porte pas (deux fichiers qui se réclament de la même adresse,
 * c'est un `$id` en doublon pour tout validateur qui les charge ensemble).
 *
 * Cette dérive a existé : la copie publiée du FormDef avait 9 056 octets quand
 * la source en avait 15 279 (accueil, matrices, meta, échelles, kind…), et
 * rejetait donc ce que le compositeur produit. L'index en portait pourtant
 * une empreinte « juste » du fichier servi.
 * ------------------------------------------------------------------ */

const SOURCES = path.join(RACINE, 'projects', 'grist_forms', 'runtime');
const CONTRATS_AVEC_SOURCE = [
  { source: 'formdef.schema.json', publie: 'formdef-1.0.schema.json' },
  { source: 'conditions.schema.json', publie: 'conditions-1.0.schema.json' },
  { source: 'kit-theme.schema.json', publie: 'kit-theme-0.1.schema.json' }
];
const sansId = (o) => { const c = { ...o }; delete c.$id; return c; };

for (const { source, publie } of CONTRATS_AVEC_SOURCE) {
  test(`${publie} reste identique à la source que lit le widget (${source})`, () => {
    const pub = lire(path.join(SCHEMAS, publie));
    const src = lire(path.join(SOURCES, source));
    assert.equal(src.$id, undefined,
      `${source} : la source ne porte pas d'$id — seule la copie publiée a une adresse`);
    assert.deepEqual(sansId(pub), sansId(src),
      `${publie} diverge de ${source} : re-publier la source (seul l'$id peut différer)`);
  });
}

test('chaque $id est unique, sources et copies publiées confondues', () => {
  const dossiers = [SCHEMAS, SOURCES];
  const vus = new Map();
  for (const d of dossiers) {
    for (const f of fs.readdirSync(d).filter((n) => n.endsWith('.schema.json'))) {
      const id = lire(path.join(d, f)).$id;
      if (!id) continue;
      assert.ok(!vus.has(id), `$id en doublon : ${id} dans ${f} et ${vus.get(id)}`);
      vus.set(id, f);
    }
  }
});

test('le FormDef publié accepte ce que le compositeur produit', () => {
  // Le test d'égalité ci-dessus protège la copie ; celui-ci protège le contrat
  // lui-même contre ce que ses producteurs écrivent vraiment. Avec l'ancienne
  // copie publiée, l'enquête du 4e donnait 48 écarts.
  const schema = lire(path.join(SCHEMAS, 'formdef-1.0.schema.json'));
  const dossier = path.join(RACINE, 'projects', 'grist_forms', 'tests', 'fixtures');
  for (const f of ['enquete-4e.formdef.json', 'formdef-minimal.json']) {
    const ecarts = valider(lire(path.join(dossier, f)), schema, schema);
    assert.deepEqual(ecarts, [], `${f} rejeté par le schéma publié :\n  ${ecarts.join('\n  ')}`);
  }
});

/* ------------------------------------------------------------------ *
 * conditions-1.0 : une grammaire, un contrat, une définition.
 * ------------------------------------------------------------------ */

test('FormDef et conditions-1.0 partagent la MÊME définition de condition', () => {
  // Le validateur maison ne sait pas suivre un `$ref` d'un fichier à l'autre :
  // la définition est donc recopiée dans le FormDef, et ce test garantit
  // qu'elle ne peut pas diverger. Un FormDef qui accepterait une condition que
  // conditions-1.0 refuse (ou l'inverse) ferait deux grammaires.
  const cond = lire(path.join(SCHEMAS, 'conditions-1.0.schema.json')).definitions.condition;
  for (const chemin of [
    path.join(SCHEMAS, 'formdef-1.0.schema.json'),
    path.join(SOURCES, 'formdef.schema.json')
  ]) {
    assert.deepEqual(lire(chemin).definitions.condition, cond,
      `${path.basename(chemin)} : definitions.condition diverge de conditions-1.0`);
  }
});

test('conditions-1.0 n’emploie que des mots-clés communs à draft-07 et 2020-12', () => {
  // Le kit visera la 2020-12 ; FormDef reste en draft-07. Tant que les deux
  // coexistent, le contrat commun ne doit rien utiliser qu'une seule des deux
  // versions comprend.
  const interdits = ['prefixItems', '$dynamicRef', '$dynamicAnchor', '$defs', '$anchor',
    'unevaluatedProperties', 'unevaluatedItems', 'dependentSchemas', 'dependentRequired',
    'minContains', 'maxContains', '$vocabulary', '$recursiveRef', 'additionalItems', 'dependencies'];
  const trouves = [];
  (function marcher(o, chemin) {
    if (Array.isArray(o)) return o.forEach((v, i) => marcher(v, `${chemin}[${i}]`));
    if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) {
        // Un nom de propriété décrit n'est pas un mot-clé.
        const estNomDePropriete = chemin.endsWith('.properties');
        if (!estNomDePropriete && interdits.includes(k)) trouves.push(`${chemin}.${k}`);
        marcher(v, `${chemin}.${k}`);
      }
    }
  }(lire(path.join(SOURCES, 'conditions.schema.json')), ''));
  assert.deepEqual(trouves, [], 'mots-clés propres à une seule version du JSON Schema');
});

test('conditions-1.0 accepte les deux formes et refuse la grammaire hors liste', () => {
  const schema = lire(path.join(SCHEMAS, 'conditions-1.0.schema.json'));
  const ok = [
    { field: 'A', operator: '==', value: 'x' },
    { field: 'A' },
    { source: 'context', path: 'site', operator: 'in', value: ['a', 'b'] },
    { source: 'audience', path: 'group', operator: 'in', bind: { groups: ['g'] } },
    { source: 'audience', path: 'member', operator: 'truthy', bind: null },
    { field: 'A', operator: 'empty' },
    { field: 'A', operator: 'notEmpty' },
    { op: 'and', rules: [{ field: 'A' }, { field: 'B', operator: '!=', value: 1 }] },
    { op: 'or', rules: [] },
    { op: 'not', rules: [{ field: 'A', operator: 'contains', value: 'z' }] },
    { op: 'and', rules: [{ op: 'not', rules: [{ op: 'or', rules: [{ field: 'A' }] }] }] }
  ];
  for (const c of ok) {
    assert.deepEqual(valider(c, schema, schema), [], `devrait être valide : ${JSON.stringify(c)}`);
  }
  const ko = [
    { field: 'A', operator: 'contain' },
    { field: 'A', operator: '===' },
    { field: 'A', source: 'filtre' },
    { op: 'xor', rules: [] },
    { op: 'not', rules: [] },
    { op: 'not', rules: [{ field: 'A' }, { field: 'B' }] },
    { op: 'and' },
    { rules: [{ field: 'A' }] },
    { field: 'A', operater: '==' },
    { op: 'and', rules: [{ field: 'A', operator: 'nope' }] },
    'A == 1',
    null
  ];
  for (const c of ko) {
    assert.ok(valider(c, schema, schema).length > 0, `devrait être refusé : ${JSON.stringify(c)}`);
  }
});

test('l’index porte une empreinte juste de chaque contrat', () => {
  // Un consommateur qui garde une copie locale n'a pas d'autre moyen de savoir
  // qu'elle a divergé — sauf à rapatrier le schéma entier à chaque usage.
  // L'empreinte doit donc suivre le fichier servi, sinon elle ment.
  const crypto = require('crypto');
  const idx = lire(path.join(SCHEMAS, 'index.json'));
  assert.ok(idx.contrats?.length, 'l’index doit lister des contrats');

  for (const c of idx.contrats) {
    const nom = c.schema.split('/').pop();
    const chemin = path.join(SCHEMAS, nom);
    assert.ok(fs.existsSync(chemin), `${nom} : cité par l’index mais absent`);

    // Ce que sert GitHub Pages est le blob git, en LF. Une copie de travail
    // Windows (autocrlf) est en CRLF : on empreinte la forme servie, pas la
    // forme locale, sinon le test dépend de la machine qui l'exécute.
    const contenu = Buffer.from(fs.readFileSync(chemin, 'utf8').replace(/\r\n/g, '\n'), 'utf8');
    const attendu = 'sha256:' + crypto.createHash('sha256').update(contenu).digest('hex').slice(0, 16);
    assert.equal(c.empreinte, attendu,
      `${nom} : empreinte périmée — l’index n’a pas été régénéré après modification`);
    assert.equal(c.octets, contenu.length, `${nom} : taille périmée`);
  }
});

// Le contrat de thème : le schéma, le module qui juge et le document disent la même chose.
test('kit-theme-0.1 : les clés du schéma sont les 26 variables du module, nues et préfixées', () => {
  const Theme = require('../projects/grist_forms/shared/theme.js');
  const s = lire(path.join(SCHEMAS, 'kit-theme-0.1.schema.json'));
  const attendues = [...Theme.CLES, ...Theme.CLES.map((c) => Theme.PREFIXE + c)].sort();
  assert.deepEqual(Object.keys(s.properties).sort(), attendues);
  assert.equal(s.additionalProperties, false, 'liste fermée');
  assert.equal(s.definitions.valeur.maxLength, Theme.LONGUEUR_MAX);
});

test('kit-theme-0.1 : le motif du schéma juge comme le module (le validateur maison ne lit pas `pattern`)', () => {
  const Theme = require('../projects/grist_forms/shared/theme.js');
  const v = lire(path.join(SCHEMAS, 'kit-theme-0.1.schema.json')).definitions.valeur;
  const motif = new RegExp(v.pattern);
  const corpus = ['#fff', '#FFFFFF', '#ffffff80', 'rgb(0, 0, 0)', 'rgba(0,0,0,0.35)', 'hsl(210 50% 40%)', 'rgb(0 0 0 / 50%)',
    'var(--c-identite-profonde)', 'var(--_x-1)', 'url(x)', 'var(--x, red)', 'calc(1px)', 'red', '#12', '#fff;color:red',
    'rgb(0,0,0);background:url(x)', 'var(--x', 'var(--)', '#' + 'a'.repeat(47), 'var(--' + 'a'.repeat(64) + ')'];
  for (const c of corpus) {
    const accepte = motif.test(c) && c.length <= v.maxLength;
    assert.equal(accepte, Theme.valeurSure(c), JSON.stringify(c));
  }
});

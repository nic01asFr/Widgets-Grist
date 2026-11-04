/** La fiche et la parité : un cas juste, puis une faute par règle. */

const test = require('node:test');
const assert = require('node:assert/strict');
const { validerFiche, VERBES } = require('./valider-fiche.js');
const { verifierParite } = require('./parite-interfaces.js');

const CATALOGUE = [{ nom: 'FormDef', version: '1.0' }];
const juste = () => ({
  contrat: 'fiche-capacites-0.1', widget: 'demo', version: '1.0.0',
  presentation: { titre: 'Démo', resume: 'Un widget de démonstration.' },
  verbes: { presenter: ['demo_capacites'], creer: ['demo_creer'] },
  non_couverts: VERBES.filter((v) => !['presenter', 'creer'].includes(v)),
  contrats: { produit: [{ nom: 'FormDef', version: '1.0', catalogue: true }], lit: [{ nom: 'ThemeDef', version: '1.0', catalogue: false, empreinte: 'sha256:a1ab777475df5d76' }] }
});
const ecarts = (f) => validerFiche(f, { catalogue: CATALOGUE });

test('une fiche juste passe', () => assert.deepEqual(ecarts(juste()), []));

test('chaque règle de la spécification a sa faute', () => {
  const cas = [
    ['verbe sous silence', (f) => { f.non_couverts.pop(); }, /passé sous silence/],
    ['verbe couvert et non couvert', (f) => { f.non_couverts.push('creer'); }, /couvert et déclaré/],
    ['préfixe absent', (f) => { f.verbes.creer = ['autre_creer']; }, /préfixe/],
    ['commande en double', (f) => { f.verbes.presenter = ['demo_creer']; }, /listée sous/],
    ['verbe vide', (f) => { f.verbes.editer = []; }, /liste vide/],
    ['contrat absent du catalogue', (f) => { f.contrats.produit[0].version = '9.9'; }, /absent de published/],
    ['hors catalogue sans empreinte', (f) => { delete f.contrats.lit[0].empreinte; }, /empreinte est obligatoire/],
    ['hors catalogue alors qu\'il y figure', (f) => { f.contrats.lit.push({ nom: 'FormDef', version: '1.0', catalogue: false, empreinte: 'sha256:00000000' }); }, /alors qu'il y figure/],
    ['version illisible', (f) => { f.version = '1.0'; }, /x\.y\.z/],
    ['forme (propriété inconnue)', (f) => { f.extra = 1; }, /non déclarée/]
  ];
  for (const [nom, mute, motif] of cas) {
    const f = juste(); mute(f);
    assert.ok(ecarts(f).some((e) => motif.test(e)), `${nom} : attendu ${motif}, reçu ${JSON.stringify(ecarts(f))}`);
  }
});

test('la parité compare le registre, la fiche et le CLI', () => {
  const registre = {
    commandes: [{ nom: 'demo_creer', nature: 'pure', exemples: [{ entree: { a: 1 } }] }, { nom: 'demo_rendre', nature: 'exige-la-page', exemples: [] }],
    appeler: (n, e) => ({ ok: true, sortie: { n, e } })
  };
  const fiche = { verbes: { creer: ['demo_creer'], exploiter: ['demo_rendre'] } };
  const cli = (n, e) => (n === 'demo_creer' ? { code: 0, sortie: { n, e } } : { code: 1, sortie: null });
  const base = { registre, cli, listeCli: () => ['demo_creer'], fiche };
  assert.deepEqual(verifierParite(base), []);
  assert.match(verifierParite({ ...base, cli: () => ({ code: 0, sortie: {} }) }).join(), /ne rend pas la sortie|code/);
  assert.match(verifierParite({ ...base, listeCli: () => ['demo_creer', 'demo_rendre'] }).join(), /commandes pures/);
  assert.match(verifierParite({ ...base, fiche: { verbes: { creer: ['demo_creer'] } } }).join(), /pas les mêmes commandes/);
});

const schemaFiche = require('../docs/fiche-capacites-0.1.schema.json');
const baseWebmcp = {
  contrat: 'fiche-capacites-0.1', widget: 'demo', version: '1.0.0',
  presentation: { titre: 'D', resume: 'R' },
  verbes: { presenter: ['demo_capacites'] }, non_couverts: [], contrats: { produit: [], lit: [] },
  prerequis: { acces_grist: 'none' }, limites: ['x'], exemples: ['demo_capacites'],
  interfaces: { skill: true, cli: true, mcp: true, webmcp: true, vitrine: true },
};
const ecartsWebmcp = (f) => validerFiche(f, { schema: schemaFiche, catalogue: { schemas: [] } }).filter((e) => e.includes('entree_webmcp'));

test('entree_webmcp : un chemin relatif propre est accepté', () => assert.deepEqual(ecartsWebmcp({ ...baseWebmcp, entree_webmcp: 'demo-registre/webmcp-entree.js' }), []));
test('entree_webmcp : un chemin qui remonte est refusé', () => assert.equal(ecartsWebmcp({ ...baseWebmcp, entree_webmcp: '../x.js' }).length, 1));
test('entree_webmcp : exige interfaces.webmcp', () => assert.equal(ecartsWebmcp({ ...baseWebmcp, interfaces: { ...baseWebmcp.interfaces, webmcp: false }, entree_webmcp: 'a.js' }).length, 1));

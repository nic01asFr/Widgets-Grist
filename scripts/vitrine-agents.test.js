'use strict';

/**
 * La page « Pour un agent » : déduite de deux fichiers générés par le widget (fiche-capacites.json et commandes.json), jamais écrite à la main.
 * Sans ces fichiers, rien ne change ; avec deux fichiers qui se contredisent, la génération s'arrête ; avec une paire cohérente, la page liste
 * TOUTES les commandes et rien d'autre. Les essais utilisent un dossier de fiche factice, hors de published/.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const V = require('./generate-vitrine.js');

const REGISTRE = path.join(__dirname, '..', 'projects', 'grist_forms', 'forms-registre');
const FICHE = JSON.parse(fs.readFileSync(path.join(REGISTRE, 'fiche-capacites.json'), 'utf8'));
const COMMANDES = JSON.parse(fs.readFileSync(path.join(REGISTRE, 'commandes.json'), 'utf8'));

const W = (id, url) => ({ widgetId: id, name: id, url });
const T = Date.parse('2026-11-03T12:00:00Z');
const BASE = 'https://s.io/r/';
const projet = () => ({ id: 'essai', widgets: [W('essai', BASE + 'essai/')], presentation: { nom: 'Essai', pitch: 'Un widget d’essai.', depot: 'https://example.org/depot', produit: { contextes: [{ titre: 'Un cas', texte: 't' }] } } });

/** Un dossier de publication factice : <racine>/essai/{fiche-capacites,commandes}.json. */
function dossier({ fiche = FICHE, commandes = COMMANDES, sansFiche = false, sansCommandes = false } = {}) {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'vitrine-agents-'));
  fs.mkdirSync(path.join(racine, 'essai'));
  if (!sansFiche) fs.writeFileSync(path.join(racine, 'essai', 'fiche-capacites.json'), JSON.stringify(fiche));
  if (!sansCommandes) fs.writeFileSync(path.join(racine, 'essai', 'commandes.json'), JSON.stringify(commandes));
  return racine;
}

const avecEcart = (f) => {
  const c = JSON.parse(JSON.stringify(COMMANDES));
  f(c);
  return c;
};

test('sans fiche ni commandes, aucune page : le projet n’a pas d’agents', () => {
  const racine = dossier({ sansFiche: true, sansCommandes: true });
  assert.equal(V.agentsDe(projet(), racine), null);
});

test('sans fiche, la page du produit est identique à l’octet, avec ou sans la clé agents', () => {
  const a = projet();
  const b = Object.assign(projet(), { agents: null });
  assert.equal(V.rendreProjet(a, T, BASE), V.rendreProjet(b, T, BASE));
  assert.doesNotMatch(V.rendreProjet(a, T, BASE), /Pour un agent/);
  assert.deepEqual(V.annexesDe(a), []);
});

test('une fiche sans commandes, ou des commandes sans fiche, arrête la génération', () => {
  assert.throws(() => V.agentsDe(projet(), dossier({ sansCommandes: true })), /commandes\.json manque/);
  assert.throws(() => V.agentsDe(projet(), dossier({ sansFiche: true })), /fiche-capacites\.json manque/);
});

test('une paire cohérente donne une annexe « agents » et un bouton sur la page du produit', () => {
  const p = projet();
  p.agents = V.agentsDe(p, dossier());
  assert.ok(p.agents);
  assert.deepEqual(V.annexesDe(p).map((a) => [a.id, a.titre]), [['agents', 'Pour un agent']]);
  assert.match(V.rendreProjet(p, T, BASE), /<a class="bouton creux" href="agents\/">Pour un agent<\/a>/);
});

test('la page liste toutes les commandes du fichier, et seulement elles', () => {
  const p = projet();
  p.agents = V.agentsDe(p, dossier());
  const html = V.rendreAnnexe(p, V.annexesDe(p)[0], BASE);
  const noms = COMMANDES.commandes.map((c) => c.nom);
  for (const n of noms) assert.ok(html.includes('<h2>' + n + '</h2>'), n + ' a sa section');
  const titres = [...html.matchAll(/<h2>(forms_[a-z0-9_]+)<\/h2>/g)].map((m) => m[1]);
  assert.deepEqual(titres.sort(), [...noms].sort(), 'aucune commande de plus, aucune de moins');
  assert.equal(titres.length, new Set(titres).size, 'chaque commande une seule fois');
});

test('la page dit ce qui n’est pas couvert, les contrats, les limites, et que rien n’y est écrit à la main', () => {
  const p = projet();
  p.agents = V.agentsDe(p, dossier());
  const html = V.rendreAnnexe(p, V.annexesDe(p)[0], BASE);
  assert.match(html, /Ce qui n’est pas encore couvert/);
  for (const v of ['Modifier', 'Exploiter', 'Récolter']) assert.ok(html.includes(v), v);
  assert.match(html, /hors catalogue, empreinte sha256:[0-9a-f]{16}/);
  assert.match(html, /au catalogue des contrats du dépôt/);
  assert.match(html, /<h2>Limites<\/h2>/);
  assert.match(html, new RegExp('version ' + FICHE.version.replace(/\./g, '\\.')));
});

test('chaque commande montre un exemple, entrée et sortie, échappé', () => {
  const p = projet();
  p.agents = V.agentsDe(p, dossier());
  const html = V.rendreAnnexe(p, V.annexesDe(p)[0], BASE);
  assert.ok((html.match(/class="bloc-code"/g) || []).length >= COMMANDES.commandes.length);
  assert.match(html, /\/\/ entrée/);
  assert.match(html, /\/\/ sortie/);
  assert.doesNotMatch(html, /<script>\s*alert/);
});

test('une page de très longue sortie est coupée, et le dit', () => {
  const grosse = avecEcart((c) => { c.commandes[0].exemples[0].sortie = { x: 'a'.repeat(5000).split('').map((v, i) => ({ i, v })) }; });
  const p = projet();
  p.agents = V.agentsDe(p, dossier({ commandes: grosse }));
  assert.match(V.rendreAnnexe(p, V.annexesDe(p)[0], BASE), /la suite est omise ici/);
});

test('deux fichiers qui se contredisent arrêtent la génération : version, commande, verbe, contrat', () => {
  assert.throws(() => V.agentsDe(projet(), dossier({ commandes: avecEcart((c) => { c.version = '9.9.9'; }) })), /pas de la même version/);
  assert.throws(() => V.agentsDe(projet(), dossier({ commandes: avecEcart((c) => { c.commandes.pop(); }) })), /divergent/);
  assert.throws(() => V.agentsDe(projet(), dossier({ commandes: avecEcart((c) => { c.commandes[1].nom = 'forms_autre'; }) })), /divergent/);
  assert.throws(() => V.agentsDe(projet(), dossier({ commandes: avecEcart((c) => { c.commandes[1].verbe = 'publier'; }) })), /divergent/);
  assert.throws(() => V.agentsDe(projet(), dossier({ commandes: avecEcart((c) => { c.contrat = 'autre-0.1'; }) })), /contrat des commandes inconnu/);
  assert.throws(() => V.agentsDe(projet(), dossier({ fiche: Object.assign({}, FICHE, { contrat: 'autre-0.1' }) })), /contrat de la fiche inconnu/);
});

test('un fichier illisible arrête la génération avec le nom du fichier', () => {
  const racine = dossier();
  fs.writeFileSync(path.join(racine, 'essai', 'commandes.json'), '{pas du json');
  assert.throws(() => V.agentsDe(projet(), racine), /commandes\.json illisible/);
});

test('la page ne contient ni jeton ni clé, et le générateur ne cite aucun widget en particulier', () => {
  const p = projet();
  p.agents = V.agentsDe(p, dossier());
  const html = V.rendreAnnexe(p, V.annexesDe(p)[0], BASE);
  assert.doesNotMatch(html, /api[_-]?key|token|secret|password|bearer/i);
  assert.ok(!/[A-Za-z0-9]{40,}/.test(html.replace(/sha256:[0-9a-f]{16}/g, '').replace(/https?:\/\/\S+/g, '')), 'pas de longue chaîne opaque');
  const src = fs.readFileSync(path.join(__dirname, 'generate-vitrine.js'), 'utf8');
  const bloc = src.slice(src.indexOf('function agentsDe'), src.indexOf('/** L’annexe « Pour un agent »') > 0 ? src.indexOf('/** L’annexe « Pour un agent »') : src.indexOf('function annexeAgents'));
  assert.ok(!/forms|atlas|taskflow|grist_forms/i.test(bloc), 'rien de propre à un widget dans agentsDe');
});

test('l’annexe entre au plan du site', () => {
  const p = projet();
  p.agents = V.agentsDe(p, dossier());
  const plan = V.rendreSitemap([p], BASE);
  assert.match(plan, /\/w\/essai\/agents\//);
});

test('la page agents charge le module WebMCP nomme par la fiche, et rien sinon', () => {
  const avec = dossier({ fiche: { ...FICHE, interfaces: { skill: true, cli: true, mcp: true, webmcp: true, vitrine: true }, entree_webmcp: 'forms-registre/webmcp-entree.js' } });
  fs.mkdirSync(path.join(avec, 'essai', 'forms-registre'));
  fs.writeFileSync(path.join(avec, 'essai', 'forms-registre', 'webmcp-entree.js'), 'export function installer() {}');
  fs.writeFileSync(path.join(avec, 'essai', 'llms.txt'), '# essai');
  const p = projet();
  p.agents = V.agentsDe(p, avec);
  const html = V.rendreAnnexe(p, V.annexesDe(p).find((a) => a.id === 'agents'), BASE);
  assert.match(html, /<script src="\.\.\/\.\.\/\.\.\/essai\/forms-registre\/webmcp-entree\.js"><\/script>/);
  assert.match(html, /EntreeWebMCP/);
  assert.match(html, /<link rel="alternate" type="text\/plain" href="\.\.\/\.\.\/\.\.\/essai\/llms\.txt"/);
  assert.match(html, /application\/ld\+json/);

  const sans = dossier();
  const q = projet();
  q.agents = V.agentsDe(q, sans);
  const h2 = V.rendreAnnexe(q, V.annexesDe(q).find((a) => a.id === 'agents'), BASE);
  assert.doesNotMatch(h2, /EntreeWebMCP/);
  assert.doesNotMatch(h2, /llms\.txt/);
});

test('un module nomme mais absent du dossier n’est pas injecte', () => {
  const racine = dossier({ fiche: { ...FICHE, interfaces: { skill: true, cli: true, mcp: true, webmcp: true, vitrine: true }, entree_webmcp: 'forms-registre/absent.js' } });
  assert.equal(V.agentsDe(projet(), racine).entree, null);
});

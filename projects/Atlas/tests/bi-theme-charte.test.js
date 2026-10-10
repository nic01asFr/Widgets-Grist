// Thème du composant BI = charte résolue : setTheme, getTheme, setFond, événement `theme`, pont, thème 0.3 converti.
// node --test tests/bi-theme-charte.test.js   (aucun accès réseau, aucune dépendance)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { attacher } from '../lib/bi/bi-runtime.js';
import { creerGestionnaire, themeRuntime, normaliserEntree, preferencesDepuisFenetre } from '../lib/bi/theme-charte.js';
import { creerPont, validerCommande, validerArguments, commande, COMMANDES, COMMANDES_0_3, EVENEMENTS, VERSION } from '../lib/bi/pont.js';
import { couleursClasses } from '../lib/bi/choroplethe.js';
import { estCharte, depuisThemeAncien, familleDepuisPile } from '../lib/charte/compat.js';
import { CHARTE_ATLAS as ATLAS, CHARTE_CONTRASTE_ELEVE as ELEVE, OKABE_ITO } from '../lib/charte/defauts.js';
import { FAMILLES_POLICE, VERSION_CHARTE } from '../lib/charte/schema.js';
import { carteSimulee, point } from './aide-carte-bi.js';
import * as V from '../lib/charte/verification.js';
import { echantillonner } from '../lib/charte/couleurs.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const fixture = (n) => JSON.parse(readFileSync(join(ICI, 'fixtures/charte/' + n + '.json'), 'utf8'));
const MANIFESTE = (couleur, id = 'a', style = {}) => ({ layers: [{ id, name: id, geometry_type: 'Point', style: { declarative: { kind: 'single', color: couleur }, ...style } }] });
const DONNEES = (id = 'a') => ({ [id]: [point(5.1, 43.2, {}, 1), point(5.2, 43.3, {}, 2)] });
const couleurDe = (carte, id = 'a') => { const l = carte.calques.find((c) => c.id === 'bi-pts-' + id); return l && l.paint['circle-color']; };
const nu = () => { const carte = carteSimulee(); return { carte, rt: attacher(carte, { preferences: { contrasteEleve: false } }) }; };

// ---------------------------------------------------------------------------------------------------------------- compatibilité du thème 0.3
test('compat : une charte se reconnaît à sa version ou à ses sections ; un thème 0.3 non', () => {
  assert.equal(estCharte({ version: 'atlas-charte/0.1' }), true); assert.equal(estCharte({ graines: {} }), true); assert.equal(estCharte({ base: 'atlas' }), true); assert.equal(estCharte({ texte: { famille: 'sans' } }), true);
  assert.equal(estCharte(fixture('theme-03')), false); assert.equal(estCharte({ sequentielle: ['#fff', '#000'] }), false); assert.equal(estCharte({ texte: '#222222' }), false);
  for (const v of [null, [], 'x', 3, undefined]) assert.equal(estCharte(v), false);
});

test('compat : chaque clé du thème 0.3 va à son endroit de la charte, les métadonnées d\'hôte sont ignorées sans bruit', () => {
  const t = fixture('theme-03'), { charte, ignore } = depuisThemeAncien(t);
  assert.deepEqual(ignore, []);
  assert.equal(charte.nom, t.nom); assert.deepEqual(charte.jetons, t.jetons); assert.deepEqual(charte.donnees.qualitative, t.categories);
  assert.deepEqual(charte.donnees.sequentielles, { principale: t.sequentielle }); assert.equal(charte.donnees.sequentielleDefaut, 'principale'); assert.deepEqual(charte.donnees.divergente, t.divergente);
  for (const k of ['selection', 'survol', 'contour', 'sansDonnee']) assert.equal(charte.donnees[k], t[k], k);
  assert.deepEqual(charte.fond.lavis, t.lavis); assert.equal(charte.fond.plan.eau, t.plan.eau); assert.equal(charte.fond.plan.fond, '#f4f7fc'); assert.equal(charte.graines.encre, t.texte); assert.equal(charte.texte.famille, 'serif');
  for (const k of ['version', 'statut', 'source', 'avertissements', 'variantes']) assert.ok(!(k in charte), k);
});

test('compat : fondCarte ne remplace jamais plan.fond ; une clé inconnue est signalée ; une pile de police inconnue est écartée', () => {
  assert.equal(depuisThemeAncien({ fondCarte: '#111111', plan: { fond: '#222222' } }).charte.fond.plan.fond, '#222222');
  assert.equal(depuisThemeAncien({ fondCarte: '#111111' }).charte.fond.plan.fond, '#111111');
  const r = depuisThemeAncien({ bidule: 1, police: "Papyrus, url(https://evil.example/f.woff)" });
  assert.deepEqual(r.ignore.map((i) => [i.chemin, i.code]), [['bidule', 'cle-inconnue'], ['police', 'police-non-listee']]); assert.ok(!r.charte.texte);
  assert.equal(familleDepuisPile('system-ui, sans-serif'), 'systeme'); assert.equal(familleDepuisPile('Arial, sans-serif'), 'sans'); assert.equal(familleDepuisPile("Georgia, 'Times New Roman', serif"), 'serif');
  assert.equal(familleDepuisPile('Consolas, monospace'), 'mono'); assert.equal(familleDepuisPile('Verdana'), 'lisible'); assert.equal(familleDepuisPile(12), undefined);
});

// ---------------------------------------------------------------------------------------------------------------- gestionnaire
test('gestionnaire : sans thème, la charte « atlas » ; thème d\'exécution aux clés du contrat 0.3', () => {
  const g = creerGestionnaire(), t = g.theme;
  for (const k of ['jetons', 'categories', 'sequentielle', 'divergente', 'selection', 'survol', 'contour', 'lavis', 'plan', 'texte', 'police', 'sansDonnee', 'fondCarte', 'halo']) assert.ok(k in t, k);
  assert.deepEqual(t.categories, ATLAS.donnees.qualitative); assert.deepEqual(t.sequentielle, ATLAS.donnees.sequentielles.principale); assert.deepEqual(t.divergente, ATLAS.donnees.divergente);
  assert.equal(t.police, FAMILLES_POLICE.systeme); assert.equal(t.lavis, null); assert.equal(t.fondCarte, '#ffffff'); assert.equal(t.jetons.principal, '#c44536');
  assert.deepEqual(themeRuntime(g.charte), t);
});

test('gestionnaire : les thèmes s\'additionnent, `remplacer` repart de zéro', () => {
  const g = creerGestionnaire();
  g.appliquer({ jetons: { a: '#111111' } }); g.appliquer({ jetons: { b: '#222222' } }); assert.equal(g.theme.jetons.a, '#111111'); assert.equal(g.theme.jetons.b, '#222222');
  g.appliquer({ jetons: { b: '#333333' } }); assert.equal(g.theme.jetons.b, '#333333');
  g.appliquer({ jetons: { c: '#444444' } }, { remplacer: true }); assert.equal(g.theme.jetons.a, undefined); assert.equal(g.theme.jetons.c, '#444444');
});

test('gestionnaire : retour { version, entree, applique, derive, ignore, avertissements, a11y }', () => {
  const g = creerGestionnaire(), r = g.appliquer({ graines: { principal: '#1b6b7a', fond: 'rouge' } });
  assert.deepEqual(Object.keys(r), ['version', 'entree', 'applique', 'derive', 'ignore', 'avertissements', 'a11y']); assert.equal(r.version, VERSION_CHARTE); assert.equal(r.entree, 'charte');
  assert.deepEqual(r.applique, ['graines.principal']); assert.ok(r.derive.includes('donnees.sequentielles.principale')); assert.deepEqual(r.ignore, [{ chemin: 'graines.fond', code: 'couleur-invalide', valeur: 'rouge' }]);
  assert.ok(r.avertissements.some((a) => a.code === 'valeur-ignoree' && a.chemin === 'graines.fond')); assert.equal(typeof r.a11y.encreSurFond, 'number'); assert.equal(r.a11y.preference.appliquee, false);
  const e = g.appliquer(fixture('theme-03')); assert.equal(e.entree, 'theme-0.3'); assert.ok(e.applique.includes('donnees.qualitative'));
});

test('gestionnaire : un thème 0.3 reproduit ses valeurs dans le thème d\'exécution, et le reste vient d\'Atlas', () => {
  const t = fixture('theme-03'), g = creerGestionnaire({ theme: t }), r = g.theme;
  assert.deepEqual(r.categories, t.categories); assert.deepEqual(r.sequentielle, t.sequentielle); assert.deepEqual(r.divergente, t.divergente); assert.equal(r.selection, t.selection); assert.equal(r.sansDonnee, '#8a8f94');
  assert.equal(r.plan.eau, '#d8e3f3'); assert.equal(r.fondCarte, '#f4f7fc'); assert.deepEqual(r.lavis, t.lavis); assert.equal(r.police, FAMILLES_POLICE.serif); assert.equal(r.jetons.alerte, '#a8421f'); assert.equal(r.jetons.fond, '#ffffff');
});

test('gestionnaire : entrées qui ne sont pas des objets, normalisation', () => {
  for (const v of [null, 'x', 12, [], undefined]) { const n = normaliserEntree(v); assert.deepEqual(n.charte, {}); assert.ok(n.ignore.length === 1 || v === undefined || v === null, String(v)); }
  const g = creerGestionnaire(); const r = g.appliquer('pas un objet'); assert.deepEqual(r.applique, []); assert.equal(r.ignore[0].code, 'type'); assert.equal(g.theme.categories.length, 8);
});

test('gestionnaire : la préférence de contraste élevé remplace les données de l\'hôte, et le dit', () => {
  const g = creerGestionnaire({ theme: fixture('theme-03'), preferences: { contrasteEleve: true } });
  assert.deepEqual(g.theme.categories, ELEVE.donnees.qualitative); assert.equal(g.lire().a11y.preference.appliquee, true);
  g.definirPreferences({ contrasteEleve: false }); assert.deepEqual(g.theme.categories, fixture('theme-03').categories); assert.equal(g.lire().a11y.preference.appliquee, false);
});

test('gestionnaire : lire() = charte résolue, ce que l\'hôte a donné, ce qui a été écarté ; copies indépendantes', () => {
  const g = creerGestionnaire(); g.appliquer({ graines: { principal: '#1b6b7a' }, jetons: { x: 'url(x)' } });
  const l = g.lire(); assert.deepEqual(Object.keys(l), ['version', 'charte', 'hote', 'applique', 'derive', 'ignore', 'avertissements', 'a11y']);
  assert.deepEqual(l.hote, { graines: { principal: '#1b6b7a' } }); assert.deepEqual(l.applique, ['graines.principal']); assert.equal(l.ignore[0].chemin, 'jetons.x');
  l.charte.graines.principal = '#000000'; l.hote.graines.principal = '#000000'; assert.equal(g.lire().charte.graines.principal, '#1b6b7a'); assert.deepEqual(g.lire().hote, { graines: { principal: '#1b6b7a' } });
});

test('préférences : lues dans le navigateur (prefers-contrast: more), faux sans navigateur ou si la requête échoue', () => {
  assert.deepEqual(preferencesDepuisFenetre(undefined), { contrasteEleve: false });
  assert.deepEqual(preferencesDepuisFenetre({ matchMedia: (q) => ({ matches: q === '(prefers-contrast: more)' }) }), { contrasteEleve: true });
  assert.deepEqual(preferencesDepuisFenetre({ matchMedia: () => { throw new Error('non'); } }), { contrasteEleve: false });
});

// ---------------------------------------------------------------------------------------------------------------- runtime : setTheme, getTheme, événement
test('runtime : sans thème, la charte « atlas » (plus de THEME_DEFAUT) ; getTheme la rend', () => {
  const { rt } = nu(), t = rt.api.getTheme();
  assert.equal(t.charte.nom, 'Atlas'); assert.deepEqual(t.charte.donnees.qualitative, ATLAS.donnees.qualitative); assert.equal(t.version, VERSION_CHARTE); assert.deepEqual(t.hote, {}); assert.equal(t.a11y.attention, 0);
  assert.ok(typeof rt.api.setTheme === 'function' && typeof rt.api.getTheme === 'function');
});

test('runtime : setTheme renvoie { version, applique, derive, ignore, avertissements, a11y } et un thème 0.3 reste accepté', async () => {
  const { carte, rt } = nu(); await rt.api.setScene(MANIFESTE('jeton:alerte'), DONNEES());
  const r = rt.api.setTheme(fixture('theme-03'));
  for (const k of ['version', 'applique', 'derive', 'ignore', 'avertissements', 'a11y']) assert.ok(k in r, k);
  assert.equal(r.entree, 'theme-0.3'); assert.deepEqual(r.ignore, []); assert.equal(couleurDe(carte), '#a8421f', 'le jeton du thème 0.3 est résolu et la couche remontée');
  assert.equal(rt.api.setTheme({ sequentielle: ['#ffffff', '#000000'] }).entree, 'theme-0.3');
});

test('runtime : les jetons de la charte (graines et jetons propres) se résolvent dans le style déclaratif ; un jeton inconnu ou mal formé donne un gris', async () => {
  const { carte, rt } = nu();
  rt.api.setTheme({ graines: { principal: '#1b6b7a' }, jetons: { site: '#336699' } });
  for (const [jeton, attendu] of [['jeton:principal', '#1b6b7a'], ['jeton:site', '#336699'], ['jeton:fond', '#ffffff'], ['jeton:succes', ATLAS.graines.succes], ['jeton:inconnu', '#808080'], ['jeton:<b>', '#808080'], ['#123456', '#123456']]) {
    await rt.api.setScene(MANIFESTE(jeton), DONNEES()); assert.equal(couleurDe(carte), attendu, jeton);
  }
});

test('runtime : une couche par défaut prend la première couleur de la qualitative d\'Atlas (Okabe-Ito), plus l\'ancien bleu de Tableau', async () => {
  const { carte, rt } = nu(); await rt.api.setScene({ layers: [{ id: 'a', name: 'a', geometry_type: 'Point' }] }, DONNEES());
  assert.equal(couleurDe(carte), OKABE_ITO.bleu);
});

test('runtime : setTheme est cumulatif (comme avant) ; `{ remplacer: true }` repart d\'Atlas', async () => {
  const { carte, rt } = nu();
  rt.api.setTheme({ jetons: { a: '#111111' } }); rt.api.setTheme({ jetons: { b: '#222222' } });
  await rt.api.setScene(MANIFESTE('jeton:a'), DONNEES()); assert.equal(couleurDe(carte), '#111111');
  rt.api.setTheme({ jetons: { c: '#333333' } }, { remplacer: true }); assert.equal(couleurDe(carte), '#808080', 'la couche est remontée : a n\'existe plus');
  assert.deepEqual(Object.keys(rt.api.getTheme().hote.jetons), ['c']);
});

test('runtime : l\'événement `theme` porte le retour, origine « api » ; l\'émetteur et les abonnés le reçoivent', () => {
  const { rt } = nu(), recus = [], sortie = []; rt.on('theme', (c) => recus.push(c)); rt.brancherEmetteur((type, charge, origine) => sortie.push({ type, charge, origine }));
  const r = rt.api.setTheme({ graines: { principal: '#1b6b7a' } });
  assert.equal(recus.length, 1); assert.deepEqual(recus[0], r); assert.deepEqual(sortie.map((s) => [s.type, s.origine]), [['theme', 'api']]);
  assert.ok(EVENEMENTS.includes('theme'));
});

test('runtime : une charte hostile ne laisse rien de dangereux dans le thème, les calques ni le retour ; les cartes restent dessinées', async () => {
  const { carte, rt } = nu(), hostile = fixture('hostile');
  assert.doesNotThrow(() => rt.api.setTheme(hostile)); const t = rt.api.getTheme(), tout = JSON.stringify(t.charte);
  assert.ok(!/url\(|var\(|expression|javascript|<script|calc\(/i.test(tout), tout.slice(0, 200)); assert.ok(t.ignore.length > 20); assert.ok(t.avertissements.some((a) => a.code === 'valeur-ignoree'));
  for (const jeton of ['jeton:image', 'jeton:javascript', 'jeton:mauvais nom', 'jeton:__proto__', 'jeton:constructor']) { await rt.api.setScene(MANIFESTE(jeton), DONNEES()); assert.equal(couleurDe(carte), '#808080', jeton); }
  await rt.api.setScene(MANIFESTE('jeton:bon'), DONNEES()); assert.equal(couleurDe(carte), '#336699'); assert.equal(({}).polluee, undefined);
});

test('runtime : surcharge de couche (style.charte) : ses jetons ne valent que pour elle', async () => {
  const { carte, rt } = nu();
  const m = { layers: [
    { id: 'a', name: 'a', geometry_type: 'Point', style: { declarative: { kind: 'single', color: 'jeton:x' }, charte: { jetons: { x: '#123456' } } } },
    { id: 'b', name: 'b', geometry_type: 'Point', style: { declarative: { kind: 'single', color: 'jeton:x' } } },
  ] };
  await rt.api.setScene(m, { ...DONNEES('a'), ...DONNEES('b') }); assert.equal(couleurDe(carte, 'a'), '#123456'); assert.equal(couleurDe(carte, 'b'), '#808080');
  rt.api.setTheme({ jetons: { x: '#654321' } }); assert.equal(couleurDe(carte, 'a'), '#123456', 'la couche l\'emporte sur l\'hôte'); assert.equal(couleurDe(carte, 'b'), '#654321');
  await rt.api.setScene({ layers: [{ ...m.layers[0], style: { declarative: m.layers[0].style.declarative, charte: { jetons: { x: 'url(javascript:1)' } } } }] }, DONNEES('a'));
  assert.equal(couleurDe(carte, 'a'), '#654321', 'une surcharge de couche hostile est écartée comme le reste');
});

test('runtime : la préférence de contraste élevé de la personne l\'emporte sur la charte de l\'hôte et l\'indicateur le dit', async () => {
  const carte = carteSimulee(), rt = attacher(carte, { preferences: { contrasteEleve: true } });
  const r = rt.api.setTheme({ graines: { principal: '#7a3e9d', encre: '#888888' }, donnees: { qualitative: ['#ffff00', '#ffffaa'] } });
  assert.equal(r.a11y.preference.contrasteEleve, true); assert.equal(r.a11y.preference.appliquee, true); assert.ok(r.a11y.preference.remplace.includes('donnees')); assert.ok(!r.applique.includes('donnees.qualitative'));
  assert.deepEqual(rt.api.getTheme().charte.donnees.qualitative, ELEVE.donnees.qualitative); assert.equal(rt.api.getTheme().charte.graines.encre, '#000000');
  await rt.api.setScene({ layers: [{ id: 'a', name: 'a', geometry_type: 'Point' }] }, DONNEES()); assert.equal(couleurDe(carte), ELEVE.donnees.qualitative[0]);
});

test('runtime : le thème passé à attacher() peut être une charte ou un thème 0.3', () => {
  assert.equal(attacher(carteSimulee(), { theme: { graines: { principal: '#1b6b7a' } }, preferences: {} }).api.getTheme().charte.graines.principal, '#1b6b7a');
  assert.deepEqual(attacher(carteSimulee(), { theme: fixture('theme-03'), preferences: {} }).api.getTheme().charte.donnees.qualitative, fixture('theme-03').categories);
});

// ---------------------------------------------------------------------------------------------------------------- setFond
test('setFond : les jetons sont validés (une couleur invalide est ignorée et signalée), le plan monochrome suit l\'encre de la charte', async () => {
  const { carte, rt } = nu(), peint = []; carte.calques.push({ id: 'background', type: 'background', paint: {} }); carte.setPaintProperty = (id, k, v) => peint.push([id, k, v]);
  const r = await rt.api.setFond('uni', { fond: '#abcdef', eau: 'url(x)', bidule: '#000000' });
  assert.equal(r.mode, 'uni'); assert.deepEqual(r.ignore.map((i) => i.chemin).sort(), ['bidule', 'eau']); assert.ok(r.avertissements.some((a) => a.code === 'valeur-ignoree'));
  assert.ok(peint.some(([, k, v]) => k === 'background-color' && v === '#abcdef'), JSON.stringify(peint));
  peint.length = 0; await rt.api.setFond('uni', { fond: 'rouge' }); assert.ok(peint.some(([, k, v]) => k === 'background-color' && v === ATLAS.graines.fond), 'repli sur le fond de la charte : ' + JSON.stringify(peint));
});

test('setFond : `principal` donne un plan monochrome (intensités de la charte), un fond sombre se signale', async () => {
  const { rt } = nu(); const r = await rt.api.setFond('plan', { principal: '#1b6b7a' }); assert.equal(r.mode, 'plan'); assert.deepEqual(r.ignore, []);
  const cl = await rt.api.setFond('uni', { principal: '#ffffff', fondUni: '#fafafa' }); assert.ok(cl.avertissements.some((a) => a.code === 'contraste-plan'), 'limites à peine visibles : signalé');
  await assert.rejects(() => rt.api.setFond('inconnu'), /fond inconnu/);
});

test('setFond : le fond souhaité par la charte n\'est JAMAIS appliqué par setTheme (aucun changement de fond, aucun réseau)', async () => {
  const { carte, rt } = nu(); const ajouts = []; const add = carte.addSource; carte.addSource = (id, s) => { ajouts.push(id); return add(id, s); };
  rt.api.setTheme({ fond: { mode: 'plan-ign' } }); await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(ajouts, []); assert.equal(rt.api.getTheme().charte.fond.mode, 'plan-ign');
});

// ---------------------------------------------------------------------------------------------------------------- pont
test('pont : getTheme est une commande 0.3 sans argument ; setTheme accepte des options ; l\'événement `theme` est déclaré', () => {
  assert.deepEqual(COMMANDES.getTheme, []); assert.ok(COMMANDES_0_3.includes('getTheme')); assert.deepEqual(COMMANDES.setTheme, [['object', true], ['object', false]]);
  assert.equal(validerArguments('getTheme', []), null); assert.match(validerArguments('getTheme', [1]), /trop d'arguments/);
  assert.equal(validerArguments('setTheme', [{}, { remplacer: true }]), null); assert.match(validerArguments('setTheme', ['x']), /attendu object/); assert.match(validerArguments('setTheme', [{}, 'x']), /attendu object/);
  const o = { origine: 'https://h.example', autorisees: ['https://h.example'] };
  assert.equal(validerCommande({ source: 'hote-bi', version: VERSION, id: '1', cmd: 'getTheme', args: [] }, o).ok, true);
  const vieux = validerCommande({ source: 'hote-bi', version: '0.2', id: '1', cmd: 'getTheme', args: [] }, o); assert.equal(vieux.ok, false); assert.equal(vieux.code, 'version');
});

test('pont : la taille d\'une charte est bornée avant tout traitement (éléments, profondeur, longueur, cycle)', () => {
  const gros = { jetons: Object.fromEntries(Array.from({ length: 300 }, (_, i) => ['j' + i, '#000000'])) };
  assert.match(validerArguments('setTheme', [gros]), /setTheme : objet trop large/);
  const profond = {}; let p = profond; for (let i = 0; i < 30; i++) { p.a = {}; p = p.a; } assert.match(validerArguments('setTheme', [profond]), /trop profonde/);
  assert.match(validerArguments('setTheme', [{ nom: 'x'.repeat(5000) }]), /chaîne trop longue/);
  const cycle = { a: {} }; cycle.a.b = cycle; assert.match(validerArguments('setTheme', [cycle]), /trop profonde/);
  assert.match(validerArguments('setTheme', [{ liste: Array(5000).fill(0) }]), /liste trop longue/);
  assert.match(validerArguments('setFond', ['plan', gros]), /setFond : objet trop large/); assert.equal(validerArguments('setFond', ['plan']), null); assert.equal(validerArguments('setFond', ['plan', { principal: '#1b6b7a' }]), null);
  assert.equal(validerArguments('setTheme', [fixture('complete')]), null); assert.equal(validerArguments('setTheme', [fixture('hostile')]), null);
});

test('pont : de bout en bout, setTheme hostile reçu par le pont répond ok avec les ignorés, getTheme répond avec la charte', async () => {
  const { rt } = nu(), reponses = [];
  const pont = creerPont({ api: rt.api, envoyer: (m) => reponses.push(m), autorisees: ['https://h.example'] }); rt.brancherEmetteur((t, c, o) => pont.emettre(t, c, o));
  await pont.recevoir(commande('setTheme', [fixture('hostile')], '1'), 'https://h.example');
  const r1 = reponses.find((m) => m.type === 'resultat' && m.id === '1'); assert.equal(r1.ok, true); assert.ok(r1.valeur.ignore.length > 20); assert.ok(reponses.some((m) => m.type === 'theme' && m.origine === 'api'));
  await pont.recevoir(commande('getTheme', [], '2'), 'https://h.example'); const r2 = reponses.find((m) => m.id === '2'); assert.equal(r2.ok, true); assert.equal(r2.valeur.charte.version, VERSION_CHARTE);
  const trop = { jetons: Object.fromEntries(Array.from({ length: 300 }, (_, i) => ['j' + i, '#000000'])) };
  await pont.recevoir(commande('setTheme', [trop], '3'), 'https://h.example'); const r3 = reponses.find((m) => m.id === '3'); assert.equal(r3.ok, false); assert.match(r3.erreur, /objet trop large/);
});

// ---------------------------------------------------------------------------------------------------------------- choroplèthe : la divergente de la charte
test('choroplèthe : la divergente d\'Atlas (7 couleurs) sert à 3, 5, 7 et 9 classes — plus de retour au rouge-bleu par défaut', () => {
  const theme = new (class { })(); void theme;
  const t = creerGestionnaire().theme, seuils = (n) => Array.from({ length: n - 1 }, (_, i) => -100 + (200 * (i + 1)) / n);
  assert.deepEqual(couleursClasses('divergente', seuils(7), [-100, 0, 100], t, 0), ATLAS.donnees.divergente, '7 classes : les 7 couleurs');
  for (const n of [3, 4, 5, 6, 8, 9]) {
    const c = couleursClasses('divergente', seuils(n), [-100, 0, 100], t, 0); assert.equal(c.length, n); for (const x of c) assert.notEqual(x.toLowerCase(), '#b2182b', 'jamais l\'ancien rouge');
    const e = V.ecartsVoisins(c); assert.ok(e.pire >= 6, `n=${n} : pire écart ${e.pire}`);
  }
  assert.ok(V.ecartsVoisins(couleursClasses('divergente', seuils(5), [-100, 0, 100], t, 0)).pire >= 10); assert.ok(V.ecartsVoisins(couleursClasses('divergente', seuils(3), [-100, 0, 100], t, 0)).pire >= 10);
});

test('choroplèthe : une liste impaire de 5 couleurs est parcourue de bout en bout ; trois couleurs restent interpolées comme avant ; liste paire ou invalide : défaut', () => {
  const cinq = ['#a8421f', '#d98a6b', '#f1f1ef', '#8fa3d1', '#4f5ea4'], s = [-60, -20, 20, 60];
  const c = couleursClasses('divergente', s, [-100, 0, 100], { divergente: cinq }, 0); assert.equal(c.length, 5); assert.equal(c[2].toLowerCase(), '#f1f1ef'); assert.deepEqual(c, cinq, '5 classes : les 5 couleurs');
  const sept = couleursClasses('divergente', [-71.4, -42.9, -14.3, 14.3, 42.9, 71.4], [-100, 0, 100], { divergente: cinq }, 0); assert.equal(sept.length, 7); assert.equal(sept[3].toLowerCase(), '#f1f1ef');
  const L = (h) => parseInt(h.slice(1, 3), 16); assert.ok(L(sept[0]) < L(sept[2]) && L(sept[2]) < L(sept[3]), 'du pôle au neutre');
  for (const mauvaise of [['#a8421f', '#f1f1ef', '#4f5ea4', '#000000'], ['#a8421f', 'x', '#4f5ea4'], undefined]) { const d = couleursClasses('divergente', [-50, 0, 50], [-100, 0, 100], { divergente: mauvaise }, 0); assert.equal(d.length, 4); }
  assert.equal(echantillonner(ATLAS.donnees.sequentielles.principale, 5)[0], ATLAS.donnees.sequentielles.principale[0]);
});

// ---------------------------------------------------------------------------------------------------------------- configuration de page
test('configuration de page : window.ATLAS_BI.charte est lue, assainie, et passe avant les chartes de l\'hôte ; jamais d\'adresse', async () => {
  const { configurationPage, monter } = await import('../lib/bi/liaison.js');
  const charte = { graines: { principal: '#1b6b7a', fond: 'url(x)' }, jetons: { a: '#111111' } };
  assert.deepEqual(configurationPage({ ATLAS_BI: { hotes: ['https://h.example'], charte } }, { querySelector: () => null }), { hotes: ['https://h.example'], charte });
  assert.equal(configurationPage({}, { querySelector: () => null }).charte, null);
  for (const mauvais of ['https://evil.example/charte.json', 12, true]) assert.equal(configurationPage({ ATLAS_BI: { charte: mauvais } }, { querySelector: () => null }).charte, null, 'une adresse ou un type inattendu n\'est pas une charte');
  const { reseau } = await import('./aide-carte-bi.js'); const r = reseau(); r.atlas.ATLAS_BI = { hotes: ['https://hote.test'], charte };
  const m = monter({ carte: carteSimulee(), fenetre: r.atlas, document: null, search: '?bi=1', journal: { warn() {} } });
  const t = m.rt.api.getTheme(); assert.equal(t.charte.graines.principal, '#1b6b7a'); assert.equal(t.charte.graines.fond, '#ffffff'); assert.equal(t.ignore[0].chemin, 'graines.fond');
  m.rt.api.setTheme({ jetons: { b: '#222222' } }); assert.equal(m.rt.api.getTheme().charte.graines.principal, '#1b6b7a', 'la charte de la page reste, l\'hôte s\'y ajoute');
});

test('manifeste de scène : sa charte s\'ajoute à celle de l\'hôte (niveau « hôte »), assainie, avec l\'événement `theme`', async () => {
  const { carte, rt } = nu(), recus = []; rt.on('theme', (c) => recus.push(c));
  await rt.api.setScene({ ...MANIFESTE('jeton:marque'), charte: { jetons: { marque: '#336699', pirate: 'url(x)' }, palettes: [{ id: 'cat-equipe', type: 'qualitative', couleurs: ['#111', '#eee'] }] } }, DONNEES());
  assert.equal(couleurDe(carte), '#336699'); assert.equal(recus.length, 1); assert.equal(recus[0].ignore[0].chemin, 'jetons.pirate');
  assert.deepEqual(rt.api.getTheme().charte.palettes, [{ id: 'cat-equipe', nom: 'cat-equipe', type: 'qualitative', couleurs: ['#111111', '#eeeeee'] }], 'palette personnalisée conservée par valeur');
  await rt.api.setScene(MANIFESTE('jeton:marque'), DONNEES()); assert.equal(couleurDe(carte), '#336699', 'une scène sans charte garde ce que l\'hôte a donné');
});

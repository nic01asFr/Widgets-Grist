/**
 * 3.1b : une couche de texte dont la police n'est pas joignable disparaissait ENTIÈREMENT (points compris, sans erreur : mesuré le 02/11/2026). La police est vérifiée AVANT d'ajouter le
 * texte ; si elle ne répond pas, la couche est montée sans texte et l'hôte est averti (`_avertissements`, événement `error` code `police`).
 * node --test projects/Atlas/tests/bi-police.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { adresseGlyphes, verifierPolice, plageDe, plagesDesTextes } from '../lib/bi/police.js';
import { attacher } from '../lib/bi/bi-runtime.js';
import { carteSimulee } from './aide-carte-bi.js';

const GABARIT = 'https://fonts.example/{fontstack}/{range}.pbf';
const reponse = (status) => ({ ok: status >= 200 && status < 300, status });

test('adresseGlyphes : la pile jointe par des virgules, encodée, comme la demande MapLibre ; une police seule, ou une pile', () => {
  assert.equal(adresseGlyphes(GABARIT, ['Noto Sans Regular']), 'https://fonts.example/Noto%20Sans%20Regular/0-255.pbf');
  assert.equal(adresseGlyphes(GABARIT, ['Open Sans', 'Arial Unicode MS'], '256-511'), 'https://fonts.example/Open%20Sans%2CArial%20Unicode%20MS/256-511.pbf');
  assert.equal(adresseGlyphes(GABARIT, 'Marianne Regular'), 'https://fonts.example/Marianne%20Regular/0-255.pbf', 'un nom seul est une pile d\'un nom');
});

test('verifierPolice : une réponse 200 à HEAD est un succès, vérifié', async () => {
  const appels = [];
  const r = await verifierPolice({ gabarit: GABARIT, police: ['Noto Sans Regular'], chercher: async (u, o) => { appels.push([u, o.method]); return reponse(200); } });
  assert.deepEqual(r, { ok: true, verifie: true });
  assert.deepEqual(appels, [['https://fonts.example/Noto%20Sans%20Regular/0-255.pbf', 'HEAD']]);
});

test('verifierPolice : 404 (police inconnue), 5xx et panne réseau (coupure, politique de sécurité de contenu) sont des échecs, dits', async () => {
  const essayer = (chercher) => verifierPolice({ gabarit: GABARIT, police: ['Marianne Regular'], chercher });
  assert.deepEqual(await essayer(async () => reponse(404)), { ok: false, verifie: true, raison: 'HTTP 404', plage: '0-255' });
  assert.deepEqual(await essayer(async () => reponse(503)), { ok: false, verifie: true, raison: 'HTTP 503', plage: '0-255' });
  const panne = await essayer(async () => { throw new TypeError('Failed to fetch'); });
  assert.equal(panne.ok, false); assert.match(panne.raison, /réseau coupé, politique de sécurité de contenu ou serveur arrêté/);
});

test('plageDe et plagesDesTextes : la tranche de 256 caractères de chacun, 0-255 toujours, trois exemples par plage, rien au-delà du plan de base', () => {
  assert.equal(plageDe('a'), '0-255'); assert.equal(plageDe('œ'), '256-511'); assert.equal(plageDe('’'), '8192-8447'); assert.equal(plageDe('ʻ'), '512-767');
  assert.equal(plageDe('Ж'), '1024-1279'); assert.equal(plageDe('😀'), null, 'au-delà de U+FFFF : MapLibre ne le sert pas');
  const { plages, exemples } = plagesDesTextes([{ properties: { nom: 'Évreux', zone: 'Cœur d’Alène' } }, { properties: { nom: 'Hawaʻi ʻā ʻī ʻū' } }, { properties: { nom: null } }, {}, { properties: { nom: 42 } }], ['nom']);
  assert.deepEqual(plages, ['0-255', '256-511', '512-767'], 'zone n\'est pas un champ affiché ; ’ n\'est pas dans nom');
  assert.equal(exemples.get('512-767'), 'ʻ'); assert.equal(exemples.get('256-511'), 'āīū', 'trois exemples au plus, dans l’ordre où ils apparaissent');
  assert.deepEqual(plagesDesTextes([], ['nom']).plages, ['0-255']); assert.deepEqual(plagesDesTextes(null, ['nom']).plages, ['0-255']);
  assert.deepEqual(plagesDesTextes([{ properties: { nom: 'Cœur d’Alène' } }], ['nom']).plages, ['0-255', '256-511', '8192-8447']);
});

test('verifierPolice : plusieurs plages sont vérifiées, une seule en échec suffit à échouer et la nomme', async () => {
  const demandees = [];
  const chercher = async (u) => { demandees.push(u.split('/').pop()); return reponse(u.endsWith('/512-767.pbf') ? 404 : 200); };
  const r = await verifierPolice({ gabarit: GABARIT, police: ['X'], plages: ['0-255', '256-511', '512-767'], chercher });
  assert.deepEqual(r, { ok: false, verifie: true, raison: 'HTTP 404', plage: '512-767' });
  assert.deepEqual(demandees.sort(), ['0-255.pbf', '256-511.pbf', '512-767.pbf']);
  assert.deepEqual(await verifierPolice({ gabarit: GABARIT, police: ['X'], plages: ['0-255', '256-511'], chercher }), { ok: true, verifie: true });
});

test('verifierPolice : un serveur qui refuse HEAD (405, 501) est réinterrogé par GET', async () => {
  const methodes = [];
  const r = await verifierPolice({ gabarit: GABARIT, police: ['X'], chercher: async (u, o) => { methodes.push(o.method); return reponse(o.method === 'HEAD' ? 405 : 200); } });
  assert.deepEqual(methodes, ['HEAD', 'GET']); assert.equal(r.ok, true);
});

test('verifierPolice : réseau trop lent pour conclure (délai dépassé) = on ne retire pas les étiquettes dans le doute ; la minuterie est nettoyée', async () => {
  const minuteries = [];
  const minuterie = { setTimeout: (f, ms) => { minuteries.push({ f, ms, annulee: false }); return minuteries.length - 1; }, clearTimeout: (i) => { minuteries[i].annulee = true; } };
  const r = await verifierPolice({ gabarit: GABARIT, police: ['X'], delai: 1234, minuterie, chercher: async (u, o) => { const e = new Error('annulé'); e.name = 'AbortError'; throw e; } });
  assert.deepEqual(r, { ok: true, verifie: false });
  assert.equal(minuteries.length, 1); assert.equal(minuteries[0].ms, 1234); assert.equal(minuteries[0].annulee, true);
});

test('verifierPolice : rien à vérifier (pas d\'adresse de glyphes, pas de fetch) = ok sans vérification, et aucun appel', async () => {
  let appels = 0; const chercher = async () => { appels++; return reponse(200); };
  for (const gabarit of [undefined, null, '', 'https://sans-jetons.example/x.pbf']) assert.deepEqual(await verifierPolice({ gabarit, police: ['X'], chercher }), { ok: true, verifie: false });
  assert.deepEqual(await verifierPolice({ gabarit: GABARIT, police: ['X'], chercher: null }), { ok: true, verifie: false });
  assert.equal(appels, 0);
});

test('verifierPolice : un succès est gardé en mémoire, une panne se revérifie (le réseau peut être revenu)', async () => {
  const memo = new Map(); let n = 0; let etat = 200;
  const chercher = async () => { n++; return reponse(etat); };
  const a = () => verifierPolice({ gabarit: GABARIT, police: ['X'], chercher, memo });
  assert.equal((await a()).ok, true); assert.equal((await a()).ok, true); assert.equal(n, 1, 'succès : un seul appel');
  const memo2 = new Map(); n = 0; etat = 404;
  const b = () => verifierPolice({ gabarit: GABARIT, police: ['X'], chercher, memo: memo2 });
  assert.equal((await b()).ok, false); await new Promise((r) => setImmediate(r)); assert.equal(memo2.size, 0, 'panne : rien gardé');
  etat = 200; assert.equal((await b()).ok, true); assert.equal(n, 2, 'la panne a été revérifiée');
});

// ---- dans le runtime : la couche est montée sans texte, et l'hôte le sait -----------------------------------------------------------------------------------------------------

const carteAvecGlyphes = () => { const c = carteSimulee(); c.getStyle = () => ({ layers: c.calques, glyphs: GABARIT }); return c; };
const points = [1, 2, 3].map((i) => ({ type: 'Feature', id: i, properties: { ref: 'S' + i, nom: 'Site ' + i }, geometry: { type: 'Point', coordinates: [5.2 + i * 0.01, 43.3] } }));
const manifeste = (visuel) => ({ layers: [{ id: 'sites', name: 'Sites', geometry_type: 'point', cle: 'ref', visuel }] });
const ids = (map) => map.calques.map((l) => l.id);

test('police injoignable : la couche de points est montée SANS la couche d\'étiquettes, avec un avertissement, et l\'événement error (code police, niveau avertissement) part vers l\'hôte', async () => {
  const map = carteAvecGlyphes(); const evenements = [];
  const verifs = []; const rt = attacher(map, { verifierPolice: async (o) => { verifs.push(o); return { ok: false, verifie: true, raison: 'HTTP 404' }; } });
  rt.brancherEmetteur((type, charge, origine) => evenements.push({ type, charge, origine }));
  const r = await rt.api.setScene(manifeste({ type: 'cercles', rayon: 6, etiquette: { champ: 'nom' } }), { sites: points });
  assert.ok(ids(map).includes('bi-pts-sites'), 'les points sont montés'); assert.ok(!ids(map).includes('bi-etiq-sites'), 'sans la couche de texte');
  assert.equal(verifs.length, 1); assert.equal(verifs[0].gabarit, GABARIT); assert.deepEqual(verifs[0].police, ['Noto Sans Regular']);
  const avert = (r._avertissements || r.avertissements || {}).sites || [];
  assert.ok(avert.some((m) => /police « Noto Sans Regular » ne peut pas dessiner ce texte : elle est inaccessible \(HTTP 404\)/.test(m) && /sans texte/.test(m)), JSON.stringify(r));
  const e = evenements.find((x) => x.type === 'error' && x.charge.code === 'police');
  assert.ok(e, 'événement error'); assert.equal(e.charge.niveau, 'avertissement'); assert.equal(e.origine, 'api'); assert.match(e.charge.message, /Noto Sans Regular/);
});

test('police joignable : la couche d\'étiquettes est montée comme avant, sans avertissement', async () => {
  const map = carteAvecGlyphes(); const rt = attacher(map, { verifierPolice: async () => ({ ok: true, verifie: true }) });
  const r = await rt.api.setScene(manifeste({ type: 'cercles', rayon: 6, etiquette: { champ: 'nom' } }), { sites: points });
  assert.ok(ids(map).includes('bi-pts-sites') && ids(map).includes('bi-etiq-sites'));
  assert.deepEqual((r._avertissements || r.avertissements || {}).sites || [], []);
});

test('un texte hors des plages embarquées (ʻokina, grec…) : la plage manquante est vérifiée, nommée dans l\'avertissement avec un exemple, et la couche est montée sans texte', async () => {
  const map = carteAvecGlyphes(); const demandes = [];
  const rt = attacher(map, { verifierPolice: async (o) => { demandes.push(o.plages); return o.plages.includes('512-767') ? { ok: false, verifie: true, raison: 'HTTP 404', plage: '512-767' } : { ok: true, verifie: true }; } });
  const sites = [{ type: 'Feature', id: 1, properties: { ref: 'T1', nom: 'Hawaʻi' }, geometry: { type: 'Point', coordinates: [-155.5, 19.6] } }, { type: 'Feature', id: 2, properties: { ref: 'T2', nom: 'Cœur d’Alène' }, geometry: { type: 'Point', coordinates: [-116.7, 47.6] } }];
  const r = await rt.api.setScene(manifeste({ type: 'cercles', rayon: 6, etiquette: { champ: 'nom' } }), { sites });
  assert.deepEqual(demandes, [['0-255', '256-511', '512-767', '8192-8447']], 'toutes les plages exigées par les textes, et seulement elles');
  assert.ok(ids(map).includes('bi-pts-sites') && !ids(map).includes('bi-etiq-sites'));
  const avert = (r._avertissements || {}).sites || [];
  assert.ok(avert.some((m) => /n’a pas les glyphes de la plage 512-767 \(par exemple « ʻ »\)/.test(m)), JSON.stringify(avert));
});

test('sans texte déclaré, la police n\'est JAMAIS vérifiée (aucune requête de plus pour une carte de cercles)', async () => {
  const map = carteAvecGlyphes(); let appels = 0; const rt = attacher(map, { verifierPolice: async () => { appels++; return { ok: true }; } });
  await rt.api.setScene(manifeste({ type: 'cercles', rayon: 6 }), { sites: points });
  assert.equal(appels, 0);
});

test('la police vérifiée est celle que la carte utilisera : la police des étiquettes du fond de plan s’il en a une, sinon Noto Sans Regular (embarquée)', async () => {
  const avecFond = carteAvecGlyphes(); avecFond.addLayer({ id: 'label_city', type: 'symbol', layout: { 'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'] } });
  const vues = [];
  const rt = attacher(avecFond, { verifierPolice: async (o) => { vues.push(o.police); return { ok: true, verifie: true }; } });
  await rt.api.setScene(manifeste({ type: 'cercles', rayon: 6, etiquette: { champ: 'nom' } }), { sites: points });
  const sans = carteAvecGlyphes(); const rt2 = attacher(sans, { verifierPolice: async (o) => { vues.push(o.police); return { ok: true, verifie: true }; } });
  await rt2.api.setScene(manifeste({ type: 'cercles', rayon: 6, etiquette: { champ: 'nom' } }), { sites: points });
  assert.deepEqual(vues, [['Open Sans Regular', 'Arial Unicode MS Regular'], ['Noto Sans Regular']]);
});

test('sans adresse de glyphes dans le style (carte simulée sans glyphes) : rien n\'est bloqué, la couche de texte est montée comme avant', async () => {
  const map = carteSimulee(); const rt = attacher(map);   // `verifierPolice` par défaut : gabarit vide, aucune requête
  await rt.api.setScene(manifeste({ type: 'cercles', rayon: 6, etiquette: { champ: 'nom' } }), { sites: points });
  assert.ok(ids(map).includes('bi-etiq-sites'));
});

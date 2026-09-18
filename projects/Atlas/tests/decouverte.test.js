import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TABLES_SIGNATURE, PARALLELISME, DELAI_MS, estSceneAtlas, listerTousDocs, listerScenesAtlas,
} from '../lib/decouverte.js';

/** Faux serveur : orgs → espaces → documents, et tables par document. */
function serveur({ orgs = [], espaces = {}, tables = {}, lent = new Set() } = {}) {
  const appels = [];
  let simultanes = 0, pic = 0;
  const fetchFn = async (url) => {
    appels.push(url);
    simultanes++; pic = Math.max(pic, simultanes);
    const fin = (data) => { simultanes--; return { ok: true, json: async () => data }; };
    const m = url.match(/\/api\/docs\/([^/]+)\/tables$/);
    if (m) {
      if (lent.has(m[1])) await new Promise((r) => setTimeout(r, 8));
      const t = tables[m[1]];
      if (t === undefined) { simultanes--; return { ok: false, status: 404, text: async () => '' }; }
      return fin({ tables: t.map((id) => ({ id })) });
    }
    const w = url.match(/\/api\/orgs\/([^/]+)\/workspaces$/);
    if (w) return fin(espaces[w[1]] || []);
    if (/\/api\/orgs$/.test(url)) return fin(orgs);
    simultanes--; return { ok: false, status: 404, text: async () => '' };
  };
  return { fetchFn, appels, pic: () => pic };
}

/* ---------- la signature ---------- */

test('UNE seule table de signature suffit', async () => {
  // La difference avec SURFAC²E, qui exige ses trois tables. Une scene Atlas
  // peut n'avoir qu'un manifeste, ou qu'un recit : avec « toutes », la
  // recherche ne ramenerait presque rien.
  for (const t of TABLES_SIGNATURE) {
    const s = serveur({ tables: { D: [t, 'AutreChose'] } });
    assert.equal(await estSceneAtlas('D', 'https://x.fr', 'K', s.fetchFn), true, t);
  }
});

test('un document sans aucune table de signature est ecarte', async () => {
  const s = serveur({ tables: { D: ['Contacts', 'Factures'] } });
  assert.equal(await estSceneAtlas('D', 'https://x.fr', 'K', s.fetchFn), false);
});

test('un document illisible est ecarte, sans lever', async () => {
  // Droits refuses, document supprime entre-temps : l'exploration continue.
  const s = serveur({ tables: {} });
  assert.equal(await estSceneAtlas('INCONNU', 'https://x.fr', 'K', s.fetchFn), false);
});

/* ---------- le balayage ---------- */

test('les documents sont mis a plat depuis les organisations', async () => {
  const s = serveur({
    orgs: [{ id: 1, name: 'Cerema' }, { id: 2, name: 'Perso' }],
    espaces: {
      1: [{ name: 'Etudes', docs: [{ id: 'a', name: 'Marseille', updatedAt: '2026-08-01' }] }],
      2: [{ name: 'Bac', docs: [{ id: 'b', name: 'Essai', updatedAt: '2026-08-10' }] }],
    },
  });
  const docs = await listerTousDocs('https://x.fr', 'K', s.fetchFn);
  assert.equal(docs.length, 2);
  assert.deepEqual(docs.map((d) => [d.id, d.org, d.espace]), [['a', 'Cerema', 'Etudes'], ['b', 'Perso', 'Bac']]);
});

test('une organisation illisible n interrompt pas les autres', async () => {
  const s = serveur({
    orgs: [{ id: 9, name: 'Interdite' }, { id: 1, name: 'Cerema' }],
    espaces: { 1: [{ name: 'E', docs: [{ id: 'a', name: 'A' }] }] },   // 9 absent → 404
  });
  const docs = await listerTousDocs('https://x.fr', 'K', s.fetchFn);
  assert.deepEqual(docs.map((d) => d.id), ['a']);
});

test('les scenes sortent de la plus recente a la plus ancienne', async () => {
  const s = serveur({
    orgs: [{ id: 1, name: 'O' }],
    espaces: { 1: [{ name: 'E', docs: [
      { id: 'vieux', name: 'V', updatedAt: '2026-01-01' },
      { id: 'neuf', name: 'N', updatedAt: '2026-08-20' },
      { id: 'moyen', name: 'M', updatedAt: '2026-05-05' },
    ] }] },
    tables: { vieux: ['Atlas_Story'], neuf: ['SceneManifest'], moyen: ['Atlas_LayerPrefs'] },
  });
  const r = await listerScenesAtlas('https://x.fr', 'K', { fetchFn: s.fetchFn });
  assert.deepEqual(r.map((d) => d.id), ['neuf', 'moyen', 'vieux']);
});

test('seules les scenes Atlas sont retenues', async () => {
  const s = serveur({
    orgs: [{ id: 1, name: 'O' }],
    espaces: { 1: [{ name: 'E', docs: [
      { id: 'scene', name: 'S' }, { id: 'compta', name: 'C' }, { id: 'perdu', name: 'P' },
    ] }] },
    tables: { scene: ['Atlas_Story'], compta: ['Factures'] },   // « perdu » → 404
  });
  const r = await listerScenesAtlas('https://x.fr', 'K', { fetchFn: s.fetchFn });
  assert.deepEqual(r.map((d) => d.id), ['scene']);
});

/* ---------- l affichage pendant l exploration ---------- */

test('chaque scene est annoncee des qu elle est reconnue', async () => {
  // La liste se remplit pendant le balayage : sur un compte fourni, attendre la
  // fin donnerait une page vide pendant plusieurs secondes.
  const docs = Array.from({ length: 6 }, (_, i) => ({ id: 'd' + i, name: 'D' + i }));
  const tables = {}; docs.forEach((d, i) => { tables[d.id] = i % 2 ? ['Atlas_Story'] : ['Autre']; });
  const s = serveur({ orgs: [{ id: 1, name: 'O' }], espaces: { 1: [{ name: 'E', docs }] }, tables });
  const trouves = [], progres = [];
  const r = await listerScenesAtlas('https://x.fr', 'K', {
    fetchFn: s.fetchFn,
    onTrouve: (d) => trouves.push(d.id),
    onProgres: (fait, total) => progres.push([fait, total]),
  });
  assert.equal(trouves.length, r.length);
  assert.equal(progres.length, 6, 'l avancement se compte en documents sondes');
  assert.deepEqual(progres.at(-1), [6, 6]);
});

test('le sondage reste borne en simultane', async () => {
  // Sans borne, un compte de 300 documents lancerait 300 requetes d un coup.
  const docs = Array.from({ length: 30 }, (_, i) => ({ id: 'd' + i, name: 'D' + i }));
  const tables = {}; docs.forEach((d) => { tables[d.id] = ['Atlas_Story']; });
  const s = serveur({
    orgs: [{ id: 1, name: 'O' }], espaces: { 1: [{ name: 'E', docs }] }, tables,
    lent: new Set(docs.map((d) => d.id)),
  });
  await listerScenesAtlas('https://x.fr', 'K', { fetchFn: s.fetchFn });
  assert.ok(s.pic() <= PARALLELISME, `pic de ${s.pic()} requetes simultanees`);
});

test('compte vide : aucune scene, aucune erreur', async () => {
  const s = serveur({ orgs: [] });
  assert.deepEqual(await listerScenesAtlas('https://x.fr', 'K', { fetchFn: s.fetchFn }), []);
});

/* ---------- ne jamais rester suspendu sans rien dire ---------- */

test('une requete qui ne revient jamais finit par rendre la main', async () => {
  // C'est le defaut vu sur le telephone : l'ecran restait sur « Recherche… »,
  // sans fin et sans cause. Une attente bornee transforme ce silence en message.
  const jamais = () => new Promise(() => {});
  const debut = Date.now();
  await assert.rejects(
    listerTousDocs('https://g', 'cle', jamais, undefined, 40),
    /Pas de reponse en/,
  );
  assert.ok(Date.now() - debut < 2000, 'on ne doit pas attendre le delai par defaut');
  assert.equal(DELAI_MS, 20000, 'le delai par defaut reste annonce');
});

test('chaque etape de l inventaire s annonce, avant meme le sondage', async () => {
  // Sur un compte a plusieurs organisations, l'inventaire precede le sondage et
  // peut durer. Sans ces etapes, l'ecran est muet pendant tout ce temps.
  const { fetchFn } = serveur({
    orgs: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
    espaces: {
      1: [{ name: 'E1', docs: [{ id: 'd1', name: 'Un', updatedAt: '2026-01-02' }] }],
      2: [{ name: 'E2', docs: [{ id: 'd2', name: 'Deux', updatedAt: '2026-01-01' }] }],
    },
    tables: { d1: ['Atlas_Story'], d2: ['Autre'] },
  });
  const etapes = [];
  const scenes = await listerScenesAtlas('https://g', 'cle', {
    fetchFn, onEtape: (e) => etapes.push(e),
  });
  assert.deepEqual(scenes.map((s) => s.id), ['d1']);
  assert.deepEqual(etapes[0], { phase: 'organisations' }, 'on dit qu on se connecte AVANT la reponse');
  assert.deepEqual(etapes[1], { phase: 'organisations', total: 2 });
  assert.deepEqual(etapes[2], { phase: 'espaces', fait: 1, total: 2, docs: 1 });
  assert.deepEqual(etapes[3], { phase: 'espaces', fait: 2, total: 2, docs: 2 });
  assert.deepEqual(etapes[4], { phase: 'documents', total: 2 });
});

test('un rappel d affichage qui echoue ne fait pas disparaitre la scene trouvee', async () => {
  // Defaut constate sur le telephone : aucune scene a l'ecran pendant tout le
  // balayage, toutes presentes a la reouverture. `enParallele` avale les
  // exceptions — voulu pour le reseau — et une exception venue du code
  // d'affichage retirait donc du RESULTAT une scene pourtant reconnue.
  const { fetchFn } = serveur({
    orgs: [{ id: 1, name: 'A' }],
    espaces: { 1: [{ name: 'E', docs: [
      { id: 'd1', name: 'Un', updatedAt: '2026-01-02' },
      { id: 'd2', name: 'Deux', updatedAt: '2026-01-01' },
    ] }] },
    tables: { d1: ['Atlas_Story'], d2: ['SceneManifest'] },
  });
  const vues = [];
  const scenes = await listerScenesAtlas('https://g', 'cle', {
    fetchFn,
    onTrouve: (s) => { vues.push(s.id); throw new TypeError('CSS.escape is not a function'); },
    onProgres: () => { throw new Error('affichage casse'); },
  });
  assert.deepEqual(vues, ['d1', 'd2'], 'les deux scenes ont bien ete signalees');
  assert.deepEqual(scenes.map((s) => s.id), ['d1', 'd2'], 'et le resultat les porte toujours');
});


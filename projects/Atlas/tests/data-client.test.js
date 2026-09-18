import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estVitrine, detecterMode, peutSAuthentifier, capacites, recordsVersColonnes, creerClient, estEncadre,
  posterPieceJointe, televerserPieceJointe,
} from '../lib/data-client.js';

/** Une fenetre de widget : encadree, avec l'API plugin. */
const widget = (extra = {}) => {
  const top = {};
  const w = { grist: { docApi: {} }, top, ...extra };
  w.self = w;
  return w;
};
/** Une fenetre d'application : au premier plan. Le script plugin peut y etre. */
const appli = (extra = {}) => {
  const w = { grist: { docApi: {} }, ...extra };
  w.self = w; w.top = w;
  return w;
};

/* ---------- ou tourne-t-on ---------- */

test('sans API plugin, c est une application', () => {
  assert.equal(detecterMode({}), 'rest');
  // Un `grist` sans `docApi` n'est pas davantage un widget.
  assert.equal(detecterMode({ grist: {} }), 'rest');
});

test('l API plugin seule ne prouve rien : Atlas la charge partout', () => {
  // Constate en ouvrant Atlas dans un onglet : `grist-plugin-api.js` installe
  // `window.grist` meme hors document, et ses appels echouent ensuite en
  // « RPC_UNKNOWN_FORWARD_DEST ». S'y fier faisait croire a un widget partout,
  // et l'accueil ne s'affichait jamais.
  assert.equal(detecterMode(appli()), 'rest');
  assert.equal(detecterMode(widget()), 'grist');
});

test('l encadrement tranche, et le doute penche vers le widget', () => {
  assert.equal(estEncadre(appli()), false);
  assert.equal(estEncadre(widget()), true);
  // Une fenetre parente inaccessible : on se sait encadre.
  const piege = { grist: { docApi: {} } };
  Object.defineProperty(piege, 'top', { get() { throw new Error('cross-origin'); } });
  piege.self = piege;
  assert.equal(estEncadre(piege), true);
  assert.equal(detecterMode(piege), 'grist');
});

/* ---------- ce que l environnement autorise ---------- */

test('en navigateur, l ecriture est impossible et il faut le dire', () => {
  // CORS mesure : `Authorization` n'est pas dans Access-Control-Allow-Headers.
  const c = capacites({});
  assert.equal(c.ecriture, false);
  assert.equal(c.decouverte, false);
  assert.ok(c.raison, 'une capacite refusee doit etre expliquee');
});

test('dans l application installee, tout redevient possible', () => {
  // CapacitorHttp emet les requetes hors du moteur web : plus de controle prealable.
  const natif = { Capacitor: { isNativePlatform: () => true } };
  assert.equal(peutSAuthentifier(natif), true);
  const c = capacites(natif);
  assert.equal(c.ecriture, true);
  assert.equal(c.decouverte, true);
  assert.equal(c.raison, null);
});

test('Capacitor en mode web ne suffit pas', () => {
  // Le piege de l'empaquetage : sans plateforme native, `fetch` reste dans la
  // WebView et CORS s'applique malgre la presence de Capacitor.
  assert.equal(peutSAuthentifier({ Capacitor: { isNativePlatform: () => false } }), false);
});

test('dans Grist, l ecriture est permise et la decouverte sans objet', () => {
  const c = capacites(widget());
  assert.equal(c.mode, 'grist');
  assert.equal(c.ecriture, true);
  assert.equal(c.decouverte, false, 'un widget ne voit qu un document, le sien');
});

/* ---------- conversion REST -> format plugin ---------- */

test('les enregistrements REST prennent la forme colonnaire du plugin', () => {
  // Sans cette conversion, tout le code de lecture d'Atlas serait a doubler.
  const col = recordsVersColonnes([
    { id: 3, fields: { nom: 'Nord', surface: 12 } },
    { id: 7, fields: { nom: 'Sud', surface: 40 } },
  ]);
  assert.deepEqual(col.id, [3, 7]);
  assert.deepEqual(col.nom, ['Nord', 'Sud']);
  assert.deepEqual(col.surface, [12, 40]);
});

test('un champ absent devient null, il ne decale pas la colonne', () => {
  // Le decalage serait pire que l'absence : les lignes ne correspondraient plus.
  const col = recordsVersColonnes([
    { id: 1, fields: { a: 'x' } },
    { id: 2, fields: { a: 'y', b: 'z' } },
  ]);
  assert.deepEqual(col.id, [1, 2]);
  assert.deepEqual(col.a, ['x', 'y']);
  assert.deepEqual(col.b, [null, 'z']);
});

test('table vide', () => {
  assert.deepEqual(recordsVersColonnes([]), { id: [] });
});

/* ---------- le client REST ---------- */

test('le jeton n est envoye que s il existe', async () => {
  const vus = [];
  const faux = async (url, opt) => {
    vus.push({ url, auth: opt?.headers?.Authorization || null });
    return { ok: true, json: async () => ({ records: [] }) };
  };
  const anonyme = await creerClient({ mode: 'rest', baseUrl: 'https://x.fr/', docId: 'D1', fetch: faux });
  await anonyme.fetchTable('Atlas_Story');
  assert.equal(vus[0].auth, null, 'sans jeton, la requete doit rester simple');

  const signe = await creerClient({ mode: 'rest', baseUrl: 'https://x.fr', docId: 'D1', jeton: 'K', fetch: faux });
  await signe.fetchTable('Atlas_Story');
  assert.equal(vus[1].auth, 'Bearer K');
});

test('l adresse est construite sans double barre', async () => {
  let vue = '';
  const faux = async (url) => { vue = url; return { ok: true, json: async () => ({ tables: [] }) }; };
  const c = await creerClient({ mode: 'rest', baseUrl: 'https://x.fr///', docId: 'D1', fetch: faux });
  await c.listTables();
  assert.equal(vue, 'https://x.fr/api/docs/D1/tables');
});

test('une erreur HTTP porte le code et le message', async () => {
  const faux = async () => ({ ok: false, status: 403, text: async () => '{"error":"Blocked by table update access rules"}' });
  const c = await creerClient({ mode: 'rest', baseUrl: 'https://x.fr', docId: 'D1', fetch: faux });
  await assert.rejects(() => c.listTables(), /403.*access rules/);
});

test('le mode widget delegue a l API plugin', async () => {
  const appels = [];
  const portee = widget(); portee.grist = { docApi: {
    listTables: async () => { appels.push('listTables'); return ['A']; },
    fetchTable: async (t) => { appels.push('fetch:' + t); return { id: [] }; },
    applyUserActions: async (a) => { appels.push('apply:' + a.length); return {}; },
  } };
  const c = await creerClient({ portee });
  await c.listTables();
  await c.fetchTable('Atlas_Story');
  await c.applyUserActions([['AddRecord', 'T', null, {}]]);
  assert.deepEqual(appels, ['listTables', 'fetch:Atlas_Story', 'apply:1']);
});

test('une vitrine qui encadre le widget n’est pas un document', () => {
  // La page de presentation charge le widget dans une iframe, comme Grist. Le
  // widget n'a aucun moyen de les distinguer — meme encadrement, meme script de
  // plugin charge — et partirait interroger un document inexistant.
  const portee = {
    grist: { docApi: {} },
    self: {}, top: {},                      // encadre
    location: { search: '?vitrine=1' },
  };
  assert.equal(detecterMode(portee), 'rest');
  assert.equal(estVitrine(portee), true);
});

test('sans le parametre, un widget encadre reste un widget', () => {
  const portee = { grist: { docApi: {} }, self: {}, top: {}, location: { search: '' } };
  assert.equal(detecterMode(portee), 'grist');
  assert.equal(estVitrine(portee), false);
  assert.equal(estVitrine({}), false, 'une portee sans location ne fait pas echouer');
});

test('les capacites disent aussi si l’on est dans une vitrine', () => {
  // C'est `ecranInitial` qui en a besoin, et il ne connait pas la page.
  const enVitrine = { grist: { docApi: {} }, self: {}, top: {}, location: { search: '?vitrine=1' } };
  assert.equal(capacites(enVitrine).vitrine, true);
  assert.equal(capacites(widget()).vitrine, false);
});

/* ---------------------------------------------------------------- */
/* Pieces jointes — verser une photo prise sur le terrain            */
/* ---------------------------------------------------------------- */

/** Un vrai `File` : `FormData` n'accepte rien d'autre, ici comme au navigateur. */
const fichierFactice = (nom = 'photo.jpg') => new File(['img'], nom, { type: 'image/jpeg' });

test('posterPieceJointe n ajoute aucun en-tete de lui-meme — surtout pas Content-Type', async () => {
  // Le corps est un FormData : le navigateur pose la frontiere de lot. Un
  // `Content-Type` ecrit a la main la perdrait, et l'instance ne lirait rien.
  // Ce qui identifie la requete vient de l'appelant.
  let vu = null;
  const ids = await posterPieceJointe('https://g/doc/attachments?auth=t', fichierFactice(), {
    fetch: async (url, o) => { vu = { url, o }; return { ok: true, json: async () => [7] }; },
  });
  assert.deepEqual(ids, [7]);
  assert.equal(vu.o.method, 'POST');
  assert.equal(vu.o.headers, undefined);
  assert.ok(vu.o.body, 'le fichier part dans le corps');
});

test('un refus d envoi se nomme, avec le code et le motif', async () => {
  await assert.rejects(
    posterPieceJointe('https://g/doc/attachments', fichierFactice(), {
      fetch: async () => ({ ok: false, status: 403, text: async () => 'Blocked by access rules' }),
    }),
    /Envoi de la photo refusé \(HTTP 403\) — Blocked by access rules/,
  );
});

test('dans un widget, l envoi passe par le jeton du document', async () => {
  let url = null;
  const docApi = {
    getAccessToken: async (o) => {
      assert.equal(o.readOnly, false, 'un jeton en lecture seule ne peut rien verser');
      return { baseUrl: 'https://g/o/docs/api/docs/abc', token: 'je+ton' };
    },
  };
  let entetes = null;
  globalThis.fetch = async (u, o) => { url = u; entetes = o.headers; return { ok: true, json: async () => [12] }; };
  const ids = await televerserPieceJointe(docApi, fichierFactice());
  assert.deepEqual(ids, [12]);
  assert.equal(url, 'https://g/o/docs/api/docs/abc/attachments?auth=je%2Bton');
  // Sans cet en-tete, la protection CSRF de Grist rend un 401 que le navigateur
  // masque en `net::ERR_FAILED` : on avait conclu, a tort, a un refus d'origine.
  assert.equal(entetes['X-Requested-With'], 'XMLHttpRequest');
  assert.equal(entetes['Content-Type'], undefined);
});

test('sans jeton, on le dit — au lieu d envoyer dans le vide', async () => {
  await assert.rejects(
    televerserPieceJointe({ getAccessToken: async () => null }, fichierFactice()),
    /jeton de document indisponible/,
  );
  await assert.rejects(televerserPieceJointe({}, fichierFactice()), /pas d.accès au document/);
});

test('dans l application, c est la cle qui se presente', async () => {
  // L'en-tete `Authorization` ne franchit pas un moteur web : cette requete
  // n'aboutit que depuis le client HTTP natif de l'application.
  let vu = null;
  const client = await creerClient({
    mode: 'rest', baseUrl: 'https://g/', docId: 'doc1', jeton: 'cle',
    fetch: async (u, o) => { vu = { u, o }; return { ok: true, json: async () => [9] }; },
  });
  const ids = await client.televerserPieceJointe(fichierFactice());
  assert.deepEqual(ids, [9]);
  assert.equal(vu.u, 'https://g/api/docs/doc1/attachments');
  assert.equal(vu.o.headers.Authorization, 'Bearer cle');
  assert.equal(vu.o.headers['Content-Type'], undefined, 'le corps est multipart, pas du JSON');
});

test('sans cle, l envoi est refuse avant de partir', async () => {
  const client = await creerClient({ mode: 'rest', baseUrl: 'https://g', docId: 'd' });
  await assert.rejects(client.televerserPieceJointe(fichierFactice()), /sans clé d.accès/);
});

test('une requete sans reponse se dit, au lieu de « Failed to fetch »', async () => {
  // C'est ce que le moteur affiche sous le bouton. « Failed to fetch » envoie
  // chercher une panne de reseau alors que le reseau va bien.
  await assert.rejects(
    posterPieceJointe('https://g/doc/attachments', fichierFactice(), {
      fetch: async () => { throw new TypeError('Failed to fetch'); },
    }),
    /pas abouti.*pas de réponse/s,
  );
  // Hors navigateur, la meme panne n'a pas cette cause : le message change.
  await assert.rejects(
    posterPieceJointe('https://g/doc/attachments', fichierFactice(), {
      natif: true, fetch: async () => { throw new TypeError('fetch failed'); },
    }),
    /injoignable/,
  );
});

/* ---------------------------------------------------------------- */
/* Le schema du document, dans l'application                         */
/* ---------------------------------------------------------------- */

test('les tables de metadonnees passent par /sql, pas par /records', async () => {
  // L'API REST ne sert pas `_grist_Tables` sur son point `/records`. Sans ce
  // detour, le schema est vide dans l'application : plus de formulaire deduit,
  // plus de formulaire lie, et la fiche parait n'en proposer aucun.
  const vues = [];
  const client = await creerClient({
    mode: 'rest', baseUrl: 'https://g', docId: 'doc1', jeton: 'cle',
    fetch: async (u) => {
      vues.push(u);
      return { ok: true, json: async () => ({ records: [
        { fields: { id: 1, tableId: 'Batiments' } },
        { fields: { id: 2, tableId: 'Visites' } },
      ] }) };
    },
  });
  const t = await client.fetchTable('_grist_Tables');
  assert.match(vues[0], /\/sql\?q=/);
  assert.match(decodeURIComponent(vues[0]), /select \* from _grist_Tables/);
  assert.deepEqual(t, { id: [1, 2], tableId: ['Batiments', 'Visites'] });
});

test('une table ordinaire garde la porte des enregistrements', async () => {
  const vues = [];
  const client = await creerClient({
    mode: 'rest', baseUrl: 'https://g', docId: 'doc1', jeton: 'cle',
    fetch: async (u) => {
      vues.push(u);
      return { ok: true, json: async () => ({ records: [{ id: 3, fields: { nom: 'Mairie' } }] }) };
    },
  });
  const t = await client.fetchTable('Batiments');
  assert.match(vues[0], /\/tables\/Batiments\/records$/);
  assert.deepEqual(t, { id: [3], nom: ['Mairie'] });
});

test('un nom de table systeme fantaisiste est refuse', async () => {
  const client = await creerClient({ mode: 'rest', baseUrl: 'https://g', docId: 'd', jeton: 'c',
    fetch: async () => { throw new Error('ne doit pas partir'); } });
  await assert.rejects(client.fetchTable('_grist_Tables; drop'), /Table système inattendue/);
});


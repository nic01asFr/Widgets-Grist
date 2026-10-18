/*
 * FormEngine.monter — le moteur monté sur le contrat de données du gabarit.
 *
 * Banc : un faux client en mémoire (colonnaire en lecture, UserActions en
 * écriture, file hors ligne rejouée dans l'ordre) et le faux DOM des autres
 * tests de montage. Ce que ce banc ne peut pas dire — le rendu réel, les
 * cartes et dessins, les variables CSS résolues par un navigateur — est noté
 * dans docs/THEME-KIT.md et dans le rapport de livraison.
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../runtime/engine.js');
const { createRoot } = require('./helpers/fake-dom.js');

function flush() {
  return new Promise((resolve) => setTimeout(() => setImmediate(resolve), 2));
}

/** Un client du contrat, en mémoire, avec file hors ligne ordonnée. */
function fauxClient(tablesInitiales, opts) {
  opts = opts || {};
  const tables = JSON.parse(JSON.stringify(tablesInitiales));
  const etat = { enLigne: true, seq: 1000 };
  const lectures = [];
  const ecritures = [];
  const file = [];

  function ecrire(actions) {
    const retValues = [];
    for (const a of actions) {
      const [nom, table, ids, champs] = a;
      const t = tables[table];
      if (nom === 'BulkAddRecord') {
        const n = champs[Object.keys(champs)[0]].length;
        const nouveaux = [];
        for (let k = 0; k < n; k++) {
          const id = ++etat.seq;
          nouveaux.push(id);
          Object.keys(t).forEach((c) => t[c].push(c === 'id' ? id : (champs[c] ? champs[c][k] : null)));
        }
        retValues.push(nouveaux);
      } else if (nom === 'UpdateRecord') {
        const i = t.id.indexOf(ids);
        Object.keys(champs).forEach((c) => { if (t[c]) t[c][i] = champs[c]; });
        retValues.push(ids);
      } else {
        throw new Error('action inconnue : ' + nom);
      }
    }
    return { retValues };
  }

  const client = {
    tables, etat, lectures, ecritures, file,
    async lireTable(table) {
      lectures.push(Array.prototype.slice.call(arguments));
      if (!tables[table]) throw new Error('table inconnue : ' + table);
      return JSON.parse(JSON.stringify(tables[table]));
    },
    async appliquer(actions, etiquette) {
      ecritures.push({ actions, etiquette });
      if (!etat.enLigne) { file.push({ actions, etiquette }); return { enfile: true }; }
      return ecrire(actions);
    },
    async synchroniser() {
      let envoyes = 0;
      while (file.length) { ecrire(file.shift().actions); envoyes++; }
      return { envoyes, restants: 0 };
    },
    async tailleFile() { return file.length; },
    async listerTables() { return Object.keys(tables); }
  };
  if (opts.identite !== null) client.identite = async () => opts.identite || { email: 'Jean@Exemple.fr', role: 'terrain' };
  return client;
}

const TABLES = () => ({
  Sites: { id: [1, 2], Nom: ['Marseille', 'Lyon'] },
  Visites: { id: [], Nom: [], Site: [], Note: [] },
  Equipe: { id: [1, 2], Email: ['jean@exemple.fr', 'autre@exemple.fr'], Groupe: ['terrain', 'bureau'] }
});

function formdef(extra) {
  return Object.assign({
    manifest_version: '1.0.0', id: 'visite', title: 'Visite', tableId: 'Visites', composeMode: 'bind',
    successMessage: 'Merci !', choices: {},
    sections: [{
      id: 's1', label: 'Visite', gate: null,
      fields: [
        { colId: 'Nom', label: 'Nom', type: 'Text', widget: 'text', required: true },
        { colId: 'Site', label: 'Site', type: 'Ref:Sites', widget: 'select', required: false,
          options: { refTable: 'Sites', visibleCol: 'Nom' } },
        { colId: 'Note', label: 'Note', type: 'Text', widget: 'text', required: false,
          condition: { source: 'context', path: 'role', operator: 'in', value: ['admin', 'chef'] } }
      ]
    }]
  }, extra || {});
}

function remplirEtEnvoyer(root, nom) {
  root.querySelector('[name="Nom"]').value = nom;
  root.querySelector('[data-action="submit"]').dispatchEvent('click');
}

/** Une page qui interdit à `window.grist` d'être lu : toute touche est notée. */
function interdireGrist() {
  const acces = [];
  const grist = new Proxy({}, { get(_, p) { acces.push(String(p)); return undefined; } });
  const avant = globalThis.window;
  globalThis.window = { grist };
  return {
    acces,
    restaurer() { if (avant === undefined) delete globalThis.window; else globalThis.window = avant; }
  };
}

describe('FormEngine.monter — avec un client du contrat', () => {
  let garde;
  beforeEach(() => { garde = interdireGrist(); });
  afterEach(() => { garde.restaurer(); });

  it('lit les tables liées par lireTable(table), un seul argument, et en colonnaire', async () => {
    const client = fauxClient(TABLES());
    const root = createRoot();
    Engine.monter(root, formdef(), { client, contexte: { role: 'agent' } });
    await flush();
    assert.deepEqual(client.lectures, [['Sites']], 'une lecture, un argument');
    assert.ok(root.innerHTML.includes('Marseille') && root.innerHTML.includes('Lyon'), 'les choix viennent du client');
    assert.ok(root.innerHTML.includes('<option value="2">Lyon</option>'));
  });

  it('la confirmation n’est pas remplacée par le formulaire quand on envoie aussitôt après une saisie', async () => {
    // Une saisie planifie un rendu (minuterie). L’envoi réussit avant qu’elle ne sonne : sans correctif,
    // elle remettait le formulaire à la place du « Merci » alors que la réponse était partie.
    const client = fauxClient(TABLES());
    const root = createRoot();
    Engine.monter(root, formdef(), { client, contexte: { role: 'agent' } });
    await flush();
    root.querySelector('[name="Nom"]').value = 'Dupont';
    root.querySelector('[name="Nom"]').dispatchEvent('change');
    root.querySelector('[data-action="submit"]').dispatchEvent('click');
    await flush(); await flush(); await flush();
    assert.ok(root.innerHTML.includes('Merci !'), 'la confirmation reste affichée');
    assert.ok(!root.innerHTML.includes('name="Nom"'), 'le formulaire n’est pas revenu');
    assert.equal(client.ecritures.length, 1, 'une seule réponse partie');
  });

  it('écrit par appliquer(actions, etiquette) en UserActions Grist', async () => {
    const client = fauxClient(TABLES());
    const root = createRoot();
    let envoi = null;
    Engine.monter(root, formdef(), { client, contexte: { role: 'agent' }, surEnvoi: (r) => { envoi = r; } });
    await flush();
    root.querySelector('[name="Site"]').value = '2';
    remplirEtEnvoyer(root, 'Dupont');
    await flush(); await flush();

    assert.equal(client.ecritures.length, 1);
    const { actions, etiquette } = client.ecritures[0];
    assert.equal(actions.length, 1);
    assert.equal(actions[0][0], 'BulkAddRecord');
    assert.equal(actions[0][1], 'Visites');
    assert.deepEqual(actions[0][2], [null]);
    assert.deepEqual(actions[0][3].Nom, ['Dupont']);
    assert.deepEqual(actions[0][3].Site, [2]);
    assert.ok(/Visite/.test(etiquette), 'l’écriture est nommée pour la file : ' + etiquette);
    assert.deepEqual(client.tables.Visites.Nom, ['Dupont']);
    assert.ok(root.innerHTML.includes('Merci'));
    assert.ok(!root.innerHTML.includes('data-enfile'), 'envoyé : pas de mention de file');
    assert.deepEqual(envoi && envoi.enfile, false);
  });

  it('corrige une ligne : UpdateRecord sur l’id donné, valeurs de départ reprises', async () => {
    const client = fauxClient(TABLES());
    client.tables.Visites = { id: [7], Nom: ['Ancien'], Site: [1], Note: [null] };
    const root = createRoot();
    Engine.monter(root, formdef(), { client, contexte: { role: 'agent' }, ligne: 7, valeurs: { Nom: 'Ancien' } });
    await flush();
    assert.equal(root.querySelector('[name="Nom"]').value, 'Ancien');
    remplirEtEnvoyer(root, 'Nouveau');
    await flush(); await flush();
    assert.equal(client.ecritures[0].actions[0][0], 'UpdateRecord');
    assert.equal(client.ecritures[0].actions[0][2], 7);
    assert.deepEqual(client.tables.Visites.Nom, ['Nouveau']);
  });

  it('hors ligne : l’écriture est mise en file, l’écran le dit, et la file est rejouée dans l’ordre', async () => {
    const client = fauxClient(TABLES());
    client.etat.enLigne = false;

    const un = createRoot();
    Engine.monter(un, formdef(), { client, contexte: { role: 'agent' } });
    await flush();
    remplirEtEnvoyer(un, 'Premier');
    await flush(); await flush();
    assert.ok(un.innerHTML.includes('Merci'));
    assert.ok(un.innerHTML.includes('data-enfile'), 'la réponse est gardée, pas partie : on le dit');
    assert.ok(/connexion/.test(un.innerHTML));

    const deux = createRoot();
    let enfile = null;
    Engine.monter(deux, formdef(), { client, contexte: { role: 'agent' }, surEnvoi: (r) => { enfile = r.enfile; } });
    await flush();
    remplirEtEnvoyer(deux, 'Second');
    await flush(); await flush();
    assert.equal(enfile, true);

    assert.equal(await client.tailleFile(), 2);
    assert.deepEqual(client.tables.Visites.Nom, [], 'rien n’est parti');

    client.etat.enLigne = true;
    const sync = await client.synchroniser();
    assert.equal(sync.envoyes, 2);
    assert.deepEqual(client.tables.Visites.Nom, ['Premier', 'Second'], 'l’ordre d’écriture est l’ordre de saisie');
  });

  it('un refus d’écriture s’affiche et le formulaire reste ouvert', async () => {
    const client = fauxClient(TABLES());
    client.appliquer = async () => { throw new Error('Refusé : action de schéma'); };
    const root = createRoot();
    Engine.monter(root, formdef(), { client, contexte: { role: 'agent' } });
    await flush();
    remplirEtEnvoyer(root, 'X');
    await flush(); await flush();
    assert.ok(root.innerHTML.includes('Refusé : action de schéma'));
    assert.ok(root.querySelector('[data-action="submit"]'), 'on peut réessayer');
  });

  it('n’accède jamais à window.grist, ni pour lire ni pour écrire', async () => {
    const client = fauxClient(TABLES());
    const root = createRoot();
    const m = Engine.monter(root, formdef(), { client });
    await flush();
    remplirEtEnvoyer(root, 'Dupont');
    await flush(); await flush();
    m.valider();
    m.demonter();
    assert.deepEqual(garde.acces, [], 'accès à window.grist : ' + garde.acces.join(', '));
  });

  it('les clés de contexte pilotent les conditions source: context, et le contexte vivant les relit', async () => {
    const client = fauxClient(TABLES());
    const agent = createRoot();
    const m = Engine.monter(agent, formdef(), { client, contexte: { role: 'agent' } });
    await flush();
    assert.equal(agent.querySelector('[name="Note"]'), null, 'role agent : Note cachée');

    m.contexte().role = 'admin';
    m.rendre();
    assert.ok(agent.querySelector('[name="Note"]'), 'role admin : Note visible');

    const admin = createRoot();
    Engine.monter(admin, formdef(), { client, contexte: { role: 'chef' } });
    await flush();
    assert.ok(admin.querySelector('[name="Note"]'));
  });

  it('le contexte de l’hôte n’est pas modifié par le moteur', async () => {
    const client = fauxClient(TABLES());
    const contexte = { role: 'agent' };
    Engine.monter(createRoot(), formdef(), { client, contexte });
    await flush();
    assert.deepEqual(contexte, { role: 'agent' });
  });

  it('l’identité vient de client.identite() quand l’hôte ne la donne pas (sonde)', async () => {
    const client = fauxClient(TABLES());
    const def = formdef();
    def.sections[0].fields.push({
      colId: 'Perso', label: 'Perso', type: 'Text', widget: 'text',
      condition: { source: 'audience', path: 'email', value: 'jean@exemple.fr' }
    });
    const root = createRoot();
    const m = Engine.monter(root, def, { client });
    await flush();
    assert.equal(m.contexte().userEmail, 'jean@exemple.fr', 'normalisé');
    assert.equal(m.contexte().isLoggedIn, true);
    assert.ok(root.querySelector('[name="Perso"]'), 'la condition d’audience se vérifie sur l’identité du client');
  });

  it('avec un contexte fourni, l’identité du client s’ajoute sans écraser l’hôte', async () => {
    const client = fauxClient(TABLES());
    const def = formdef({ audience: { mode: 'bind', tableId: 'Equipe', emailCol: 'Email', groupCol: 'Groupe' } });
    def.sections[0].fields.push({
      colId: 'Terrain', label: 'Terrain', type: 'Text', widget: 'text',
      condition: { source: 'audience', path: 'group', operator: 'in', value: ['terrain'] }
    });
    const root = createRoot();
    const m = Engine.monter(root, def, { client, contexte: { role: 'agent' } });
    await flush(); await flush();
    assert.equal(m.contexte().role, 'agent', 'ce que l’hôte a dit fait foi');
    assert.equal(m.contexte().userEmail, 'jean@exemple.fr');
    assert.deepEqual(m.contexte().groups, ['terrain']);
    assert.ok(root.querySelector('[name="Terrain"]'));

    const impose = Engine.monter(createRoot(), formdef(), { client, contexte: { userEmail: 'autre@exemple.fr' } });
    await flush();
    assert.equal(impose.contexte().userEmail, 'autre@exemple.fr');
  });

  it('un client sans identite() monte quand même', async () => {
    const client = fauxClient(TABLES(), { identite: null });
    const root = createRoot();
    const m = Engine.monter(root, formdef(), { client });
    await flush();
    assert.ok(root.querySelector('[name="Nom"]'));
    assert.equal(m.contexte().userEmail, '');
  });

  it('un client dont identite() échoue monte quand même', async () => {
    const client = fauxClient(TABLES());
    client.identite = async () => { throw new Error('jeton expiré'); };
    const root = createRoot();
    Engine.monter(root, formdef(), { client, contexte: { role: 'agent' } });
    await flush();
    assert.ok(root.querySelector('[name="Nom"]'));
  });

  it('sans listerTables, la sonde ne retombe pas sur window.grist', async () => {
    const client = fauxClient(TABLES());
    delete client.listerTables;
    const root = createRoot();
    Engine.monter(root, formdef(), { client });
    await flush();
    assert.deepEqual(garde.acces, []);
  });
});

describe('FormEngine.monter — thème', () => {
  it('pose des variables CSS sur le conteneur, avec ou sans « -- », et les retire au démontage', async () => {
    const root = createRoot();
    root.style.setProperty('--kit-existant', 'garde');
    const m = Engine.monter(root, formdef(), {
      client: fauxClient(TABLES()),
      theme: { accent: '#7a4b00', '--kit-fond': '#fff8ee', 'accent-texte': '', vide: null }
    });
    await flush();
    assert.equal(root.style.getPropertyValue('--kit-accent'), '#7a4b00');
    assert.equal(root.style.getPropertyValue('--kit-fond'), '#fff8ee');
    assert.equal(root.style.getPropertyValue('--kit-accent-texte'), '', 'valeur vide ignorée');
    assert.equal(root.style.getPropertyValue('--kit-vide'), '');
    m.demonter();
    assert.equal(root.style.getPropertyValue('--kit-accent'), '');
    assert.equal(root.style.getPropertyValue('--kit-fond'), '');
    assert.equal(root.style.getPropertyValue('--kit-existant'), 'garde', 'ce que l’hôte a posé reste');
  });

  it('sans thème, le conteneur n’est pas touché', () => {
    const root = createRoot();
    const m = Engine.monter(root, formdef(), { client: fauxClient(TABLES()) });
    assert.deepEqual(root.style.props, {});
    m.demonter();
  });

  it('un conteneur sans style n’est pas un obstacle', () => {
    const root = createRoot();
    delete root.style;
    assert.doesNotThrow(() => Engine.monter(root, formdef(), { client: fauxClient(TABLES()), theme: { accent: 'red' } }));
  });
});

describe('FormEngine.monter — démontage', () => {
  it('rend le conteneur : vide, sans écouteur, et plus aucun rendu ne le repeuple', async () => {
    const client = fauxClient(TABLES());
    const root = createRoot();
    const doc = {
      listeners: {},
      addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
      removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter((x) => x !== f); },
      nb() { return Object.keys(this.listeners).reduce((n, t) => n + this.listeners[t].length, 0); }
    };
    root.ownerDocument = doc;
    const m = Engine.monter(root, formdef(), { client, contexte: { role: 'agent' } });
    await flush();
    assert.equal(root.nbEcouteurs(), 1, 'l’écouteur de pointeur du moteur');

    // Un doigt posé : le moteur écoute le relâchement sur le document.
    root.listeners.pointerdown[0]();
    assert.equal(doc.nb(), 2);
    // Un changement : un rendu est planifié (minuterie).
    root.querySelector('[name="Nom"]').dispatchEvent('change');

    m.demonter();
    assert.equal(root.innerHTML, '');
    assert.equal(root.children.length, 0);
    assert.equal(root.nbEcouteurs(), 0, 'aucun écouteur ne reste sur le conteneur');
    assert.equal(doc.nb(), 0, 'ni sur le document');

    await flush(); await flush();
    assert.equal(root.innerHTML, '', 'la minuterie planifiée n’a rien redessiné');
  });

  it('une lecture de table qui arrive après le démontage ne redessine rien', async () => {
    const client = fauxClient(TABLES());
    let rendre;
    client.lireTable = () => new Promise((resolve) => { rendre = () => resolve(TABLES().Sites); });
    const root = createRoot();
    const m = Engine.monter(root, formdef(), { client, contexte: { role: 'agent' } });
    m.demonter();
    rendre();
    await flush(); await flush();
    assert.equal(root.innerHTML, '');
  });

  it('un envoi qui aboutit après le démontage n’écrit plus dans le conteneur', async () => {
    const client = fauxClient(TABLES());
    let finir;
    client.appliquer = () => new Promise((resolve) => { finir = () => resolve({ retValues: [[1]] }); });
    const root = createRoot();
    const m = Engine.monter(root, formdef(), { client, contexte: { role: 'agent' } });
    await flush();
    remplirEtEnvoyer(root, 'Dupont');
    await flush();
    m.demonter();
    finir();
    await flush(); await flush();
    assert.equal(root.innerHTML, '');
  });

  it('démonter deux fois est sans danger', () => {
    const m = Engine.monter(createRoot(), formdef(), { client: fauxClient(TABLES()) });
    m.demonter();
    assert.doesNotThrow(() => m.demonter());
  });

  it('monter, démonter, remonter sur le même conteneur : l’état précédent ne fuit pas', async () => {
    const client = fauxClient(TABLES());
    const root = createRoot();
    const a = Engine.monter(root, formdef(), { client, contexte: { role: 'agent' } });
    await flush();
    root.querySelector('[name="Nom"]').value = 'Ancien';
    a.valider();
    a.demonter();
    const b = Engine.monter(root, formdef(), { client, contexte: { role: 'agent' } });
    await flush();
    assert.equal(root.querySelector('[name="Nom"]').value, '', 'un formulaire neuf');
    assert.equal(root.nbEcouteurs(), 1);
    assert.equal(b.valeurs().Nom, undefined);
    b.demonter();
    assert.equal(root.nbEcouteurs(), 0);
  });
});

describe('FormEngine.monter — valeurs() et valider()', () => {
  it('valeurs() rend une copie de ce qui est saisi', async () => {
    const root = createRoot();
    const m = Engine.monter(root, formdef(), { client: fauxClient(TABLES()), contexte: { role: 'agent' } });
    await flush();
    root.querySelector('[name="Nom"]').value = 'Dupont';
    m.valider(); // relit l'écran
    const v = m.valeurs();
    assert.equal(v.Nom, 'Dupont');
    v.Nom = 'changé';
    assert.equal(m.valeurs().Nom, 'Dupont', 'copie : l’appelant ne modifie pas l’état du moteur');
  });

  it('valider() liste les obligatoires manquants, sur toutes les étapes', async () => {
    const def = formdef();
    def.sections.push({
      id: 's2', label: 'Suite', gate: null,
      fields: [{ colId: 'Avis', label: 'Avis', type: 'Text', widget: 'text', required: true }]
    });
    const root = createRoot();
    const m = Engine.monter(root, def, { client: fauxClient(TABLES()), contexte: { role: 'agent' } });
    await flush();
    let r = m.valider();
    assert.equal(r.ok, false);
    assert.deepEqual(r.manquants, ['Nom', 'Avis']);

    root.querySelector('[name="Nom"]').value = 'Dupont';
    r = m.valider();
    assert.deepEqual(r.manquants, ['Avis'], 'l’étape affichée est relue, l’autre reste à remplir');
  });

  it('valider() ne réclame pas ce qui est caché par une condition', async () => {
    const def = formdef();
    def.sections[0].fields[2].required = true; // Note, cachée hors rôle admin
    const root = createRoot();
    const m = Engine.monter(root, def, { client: fauxClient(TABLES()), contexte: { role: 'agent' } });
    await flush();
    root.querySelector('[name="Nom"]').value = 'Dupont';
    assert.deepEqual(m.valider(), { ok: true, manquants: [], conditionsInvalides: [] });
  });

  it('valider() relève les conditions invalides, qui rendent le formulaire non conforme', async () => {
    const def = formdef();
    def.sections[0].fields[2].condition = { field: 'Nom', operator: 'egale', value: 'x' };
    const root = createRoot();
    Engine.definirJournal(() => {});
    try {
      const m = Engine.monter(root, def, { client: fauxClient(TABLES()), contexte: { role: 'agent' } });
      await flush();
      root.querySelector('[name="Nom"]').value = 'Dupont';
      const r = m.valider();
      assert.equal(r.ok, false);
      assert.equal(r.conditionsInvalides.length, 1);
      assert.equal(r.conditionsInvalides[0].chemin, '/sections/0/fields/2/condition/operator');
    } finally { Engine.definirJournal(null); }
  });
});

describe('FormEngine.monter — erreurs d’appel', () => {
  it('conteneur ou formdef manquant : message net', () => {
    assert.throws(() => Engine.monter(null, formdef(), {}), /conteneur manquant/);
    assert.throws(() => Engine.monter(createRoot(), null, {}), /formdef manquant/);
  });

  it('un client incomplet est refusé en disant ce qui manque', () => {
    assert.throws(() => Engine.monter(createRoot(), formdef(), { client: { lireTable() {} } }),
      (e) => e instanceof TypeError && /il manque appliquer/.test(e.message) && /contrat de données/.test(e.message));
    assert.throws(() => Engine.monter(createRoot(), formdef(), { client: {} }), /lireTable et appliquer/);
  });
});

describe('FormEngine.monter — sans client : le pont de la page, comme mount', () => {
  let garde;
  afterEach(() => { if (garde) garde.restaurer(); garde = null; });

  it('écrit par window.grist.docApi.applyUserActions, comme avant', async () => {
    const appels = [];
    const avant = globalThis.window;
    globalThis.window = { grist: { docApi: { applyUserActions: async (a) => { appels.push(a); return {}; } } } };
    garde = { restaurer() { if (avant === undefined) delete globalThis.window; else globalThis.window = avant; } };
    const root = createRoot();
    const sansRef = formdef();
    sansRef.sections[0].fields.splice(1, 1);
    Engine.monter(root, sansRef, { contexte: { role: 'agent' } });
    await flush();
    remplirEtEnvoyer(root, 'Dupont');
    await flush(); await flush();
    assert.equal(appels.length, 1);
    assert.deepEqual(appels[0], [['BulkAddRecord', 'Visites', [null], { Nom: ['Dupont'] }]]);
    assert.ok(root.innerHTML.includes('Merci'));
  });

  it('mount reste inchangé : mêmes entrées, même retour, plus demonter et valider', () => {
    const root = createRoot();
    const h = Engine.mount(root, formdef(), { skipProbe: true });
    assert.deepEqual(Object.keys(h).sort(), ['demonter', 'getContext', 'getValues', 'render', 'valider']);
    assert.equal(typeof Engine.mount, 'function');
    h.demonter();
  });
});

'use strict';

/**
 * Le serveur MCP de Form Builder : il rend les commandes du registre, rien que celles qui ne font que lire, avec les mêmes noms, schémas et sorties
 * que le registre et le CLI. Une écriture n'y est ni listée ni appelable sans autorisation de l'hôte.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { monter } = require('../forms-registre/index.js');
const { creerServeur, ERR } = require('../forms-registre/mcp.js');

const registre = monter();
const serveur = creerServeur(registre);
const MCP = path.join(__dirname, '..', 'forms-registre', 'mcp.js');

const appel = (method, params, id = 1) => serveur.traiter({ jsonrpc: '2.0', id, method, params });
const lire = (r) => JSON.parse(r.result.content[0].text);

describe('Serveur MCP Form Builder : le protocole', () => {
  it('initialize annonce les outils et la version du widget', () => {
    const r = appel('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'essai', version: '0' } });
    assert.equal(r.result.protocolVersion, '2024-11-05');
    assert.deepEqual(r.result.capabilities, { tools: {} });
    assert.equal(r.result.serverInfo.version, registre.fiche().version);
  });

  it('une notification ne reçoit pas de réponse', () => {
    assert.equal(serveur.traiter({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  });

  it('ping répond', () => {
    assert.deepEqual(appel('ping').result, {});
  });

  it('une méthode inconnue est une erreur JSON-RPC', () => {
    assert.equal(appel('resources/list').error.code, ERR.METHODE);
  });

  it('un message qui n’est pas du JSON-RPC est refusé, du JSON illisible aussi', () => {
    assert.equal(serveur.traiter({ method: 'ping', id: 1 }).error.code, ERR.REQUETE);
    assert.equal(JSON.parse(serveur.traiterLigne('{pas du json')).error.code, ERR.PARSE);
    assert.equal(JSON.parse(serveur.traiterLigne('[]')).error.code, ERR.REQUETE);
  });
});

describe('Serveur MCP Form Builder : les outils', () => {
  it('tools/list rend exactement les commandes du registre, avec leur description et leur schéma d’entrée', () => {
    const { tools } = appel('tools/list').result;
    assert.deepEqual(tools.map((t) => t.name).sort(), registre.commandes.map((c) => c.nom).sort());
    for (const t of tools) {
      const c = registre.commandes.find((k) => k.nom === t.name);
      assert.equal(t.description, c.description);
      assert.deepEqual(t.inputSchema, c.entree);
      assert.equal(t.annotations.readOnlyHint, true);
    }
  });

  it('tools/call rend la sortie du registre, sans erreur', () => {
    const ex = registre.decrire('forms_verifier_format').exemples[0];
    const r = appel('tools/call', { name: 'forms_verifier_format', arguments: ex.entree });
    assert.equal(r.result.isError, false);
    assert.deepEqual(lire(r), ex.sortie);
  });

  it('un appel sans arguments passe par le schéma d’entrée, qui refuse', () => {
    const r = appel('tools/call', { name: 'forms_verifier_format' });
    assert.equal(r.result.isError, true);
    assert.equal(lire(r).code, 'entree-invalide');
  });

  it('une commande inconnue est un échec de commande, pas une erreur de protocole', () => {
    const r = appel('tools/call', { name: 'forms_nexiste_pas', arguments: {} });
    assert.equal(r.result.isError, true);
    assert.equal(lire(r).code, 'commande-indisponible');
  });

  it('tools/call sans nom est une erreur de paramètres', () => {
    assert.equal(appel('tools/call', {}).error.code, ERR.PARAMS);
  });

  it('chaque exemple du registre donne la même sortie par le MCP que par le registre', () => {
    for (const d of registre.lister()) for (const x of d.exemples) {
      const r = appel('tools/call', { name: d.nom, arguments: x.entree });
      assert.equal(r.result.isError, false, d.nom);
      assert.deepEqual(lire(r), JSON.parse(JSON.stringify(x.sortie)), d.nom);
    }
  });
});

describe('Serveur MCP Form Builder : lecture seule imposée', () => {
  const faux = {
    commandes: [
      { nom: 'forms_lire', nature: 'pure', ecrit: 'rien', description: 'lit', entree: { type: 'object' } },
      { nom: 'forms_ecrire', nature: 'pure', ecrit: 'une table', description: 'écrit', entree: { type: 'object' } },
      { nom: 'forms_rendre', nature: 'exige-la-page', ecrit: 'rien', description: 'page', entree: { type: 'object' } }
    ],
    appeler: (nom) => ({ ok: true, sortie: { nom } }),
    fiche: () => ({ version: '0.0.1' })
  };

  it('une commande qui écrit n’est ni listée ni appelable par défaut ; une commande de page non plus', () => {
    const s = creerServeur(faux);
    assert.deepEqual(s.outils().map((t) => t.name), ['forms_lire']);
    const r = s.traiter({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'forms_ecrire', arguments: {} } });
    assert.equal(r.result.isError, true);
    assert.equal(JSON.parse(r.result.content[0].text).code, 'commande-indisponible');
    const p = s.traiter({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'forms_rendre', arguments: {} } });
    assert.equal(p.result.isError, true);
  });

  it('l’hôte peut autoriser l’écriture, et alors seulement elle apparaît (avec readOnlyHint faux)', () => {
    const s = creerServeur(faux, { ecriture: true });
    assert.deepEqual(s.outils().map((t) => t.name), ['forms_lire', 'forms_ecrire']);
    assert.equal(s.outils().find((t) => t.name === 'forms_ecrire').annotations.readOnlyHint, false);
  });
});

describe('Serveur MCP Form Builder : le processus', () => {
  it('un client qui parle sur l’entrée standard reçoit les réponses ligne par ligne', async () => {
    const enfant = spawn(process.execPath, [MCP], { stdio: ['pipe', 'pipe', 'pipe'] });
    const recu = [];
    let reste = '';
    const fini = new Promise((ok) => {
      enfant.stdout.on('data', (b) => {
        reste += b.toString('utf8');
        const lignes = reste.split('\n');
        reste = lignes.pop();
        for (const l of lignes) if (l.trim()) recu.push(JSON.parse(l));
        if (recu.length >= 3) ok();
      });
    });
    enfant.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } }) + '\n');
    enfant.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    enfant.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
    enfant.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'forms_verifier_format', arguments: { format: 'codePostal', valeur: '13001' } } }) + '\n');
    await fini;
    enfant.stdin.end();
    assert.deepEqual(recu.map((r) => r.id), [1, 2, 3], 'la notification ne produit aucune réponse');
    assert.equal(recu[1].result.tools.length, registre.commandes.length);
    assert.equal(JSON.parse(recu[2].result.content[0].text).valide, true);
  });
});

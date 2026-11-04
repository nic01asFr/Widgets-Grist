#!/usr/bin/env node
'use strict';

/**
 * Le serveur MCP de Form Builder : les commandes du registre, appelables par tout client MCP (Claude, un éditeur, un agent).
 *
 * Transport stdio, JSON-RPC 2.0, un message par ligne. Aucune dépendance : le protocole utilisé ici tient en quatre méthodes
 * (initialize, ping, tools/list, tools/call). Il lit le même registre que le CLI : mêmes noms, mêmes schémas, mêmes sorties.
 *
 * Lecture seule : une commande qui écrit (`ecrit` différent de `rien`) n'est ni listée ni appelable, sauf si l'hôte l'autorise explicitement
 * (`--autoriser-ecriture`). Le serveur ne se connecte à aucun document et ne lit aucun jeton : ce qu'une commande doit lire lui est donné en entrée.
 *
 *   node mcp.js            # attend des messages sur l'entrée standard
 */

const readline = require('node:readline');
const { monter } = require('./index.js');

const PROTOCOLE = '2024-11-05';

/** Les erreurs JSON-RPC (le protocole), à ne pas confondre avec l'échec d'une commande (`isError`, dans le résultat). */
const ERR = { PARSE: -32700, REQUETE: -32600, METHODE: -32601, PARAMS: -32602 };

function creerServeur(registre, { ecriture = false } = {}) {
  const visibles = registre.commandes.filter((c) => c.nature === 'pure' && (c.ecrit === 'rien' || ecriture));
  const parNom = new Map(visibles.map((c) => [c.nom, c]));

  const reponse = (id, result) => ({ jsonrpc: '2.0', id, result });
  const echec = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

  function outils() {
    return visibles.map((c) => ({
      name: c.nom,
      description: c.description,
      inputSchema: c.entree,
      annotations: { readOnlyHint: c.ecrit === 'rien', destructiveHint: false }
    }));
  }

  function appeler(params) {
    if (!params || typeof params.name !== 'string') return null;
    const c = parNom.get(params.name);
    if (!c) {
      const texte = registre.commandes.some((k) => k.nom === params.name)
        ? 'Cette commande n’est pas disponible ici (écriture non autorisée, ou elle ne s’exécute que dans une page).'
        : 'Commande inconnue : ' + params.name;
      return { content: [{ type: 'text', text: JSON.stringify({ code: 'commande-indisponible', message: texte }) }], isError: true };
    }
    const r = registre.appeler(c.nom, params.arguments === undefined ? {} : params.arguments);
    return { content: [{ type: 'text', text: JSON.stringify(r.ok ? r.sortie : r.erreur) }], isError: !r.ok };
  }

  /** Un message reçu -> la réponse à envoyer, ou `null` (notification : on ne répond pas). */
  function traiter(message) {
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return echec(message && message.id !== undefined ? message.id : null, ERR.REQUETE, 'Requête JSON-RPC invalide.');
    const { id, method, params } = message;
    if (id === undefined) return null;
    switch (method) {
      case 'initialize':
        return reponse(id, {
          protocolVersion: params && typeof params.protocolVersion === 'string' ? params.protocolVersion : PROTOCOLE,
          capabilities: { tools: {} },
          serverInfo: { name: 'forms-registre', version: registre.fiche().version }
        });
      case 'ping':
        return reponse(id, {});
      case 'tools/list':
        return reponse(id, { tools: outils() });
      case 'tools/call': {
        const r = appeler(params);
        return r ? reponse(id, r) : echec(id, ERR.PARAMS, 'tools/call demande un nom de commande (name).');
      }
      default:
        return echec(id, ERR.METHODE, 'Méthode inconnue : ' + method);
    }
  }

  /** Une ligne reçue -> la ligne à envoyer (ou `null`). */
  function traiterLigne(ligne) {
    let message;
    try { message = JSON.parse(ligne); } catch (e) { return JSON.stringify(echec(null, ERR.PARSE, 'JSON illisible.')); }
    const r = Array.isArray(message) ? echec(null, ERR.REQUETE, 'Les lots ne sont pas gérés.') : traiter(message);
    return r ? JSON.stringify(r) : null;
  }

  return { outils, traiter, traiterLigne };
}

function main(argv, entree, sortie) {
  const serveur = creerServeur(monter(), { ecriture: argv.includes('--autoriser-ecriture') });
  const lecteur = readline.createInterface({ input: entree });
  lecteur.on('line', (ligne) => {
    if (!ligne.trim()) return;
    const r = serveur.traiterLigne(ligne);
    if (r) sortie.write(r + '\n');
  });
}

if (require.main === module) main(process.argv.slice(2), process.stdin, process.stdout);

module.exports = { creerServeur, PROTOCOLE, ERR };

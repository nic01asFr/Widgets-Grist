// Client hôte : un fil bloqué plus longtemps que le délai ne transforme pas en « délai » une commande dont la réponse est déjà arrivée.
// Mesuré dans Chromium : fil de l'hôte bloqué 4 s, délai 2,5 s, résultat déjà arrivé : la minuterie échue passait avant le message.
// Le test rejoue cet ordre avec une minuterie et un transport pilotés à la main.
// node --test tests/bi-client-fil-bloque.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { creerClient } from '../lib/bi/client.js';

/** Un « fil » d'hôte simulé : les minuteries échues passent AVANT les messages en attente, comme observé dans le navigateur. */
function filSimule() {
  const minuteries = []; const messages = []; const ecouteurs = new Set(); let n = 0;
  const minuterie = {
    setTimeout(fn) { const id = ++n; minuteries.push({ id, fn }); return id; },
    clearTimeout(id) { const i = minuteries.findIndex((m) => m.id === id); if (i >= 0) minuteries.splice(i, 1); },
    setInterval() { return ++n; }, clearInterval() {},
  };
  const transport = {
    envoyer(msg) { messages.push({ source: 'atlas-bi', version: msg.version, type: 'resultat', id: msg.id, ok: true, valeur: 42 }); },
    ecouter(f) { ecouteurs.add(f); return () => ecouteurs.delete(f); },
  };
  /** Le fil se libère : minuteries échues d'abord, puis messages, puis les minuteries posées entre-temps. */
  function liberer() {
    for (const m of minuteries.splice(0)) m.fn();
    for (const msg of messages.splice(0)) for (const f of ecouteurs) f(msg);
    for (const m of minuteries.splice(0)) m.fn();
  }
  return { minuterie, transport, liberer };
}

test('une réponse arrivée pendant un blocage du fil de l\'hôte l\'emporte sur la minuterie échue', async () => {
  const { minuterie, transport, liberer } = filSimule();
  const client = creerClient({ transport, delai: 40, minuterie });
  client.on('x', () => {});
  const promesse = client.getRows('pts');
  liberer();
  assert.equal(await promesse, 42);
});

test('sans réponse, le délai se déclare toujours', async () => {
  const { minuterie, liberer } = filSimule();
  const muet = { envoyer() {}, ecouter() { return () => {}; } };
  const client = creerClient({ transport: muet, delai: 30, minuterie });
  client.on('x', () => {});
  const promesse = client.getRows('pts');
  liberer();
  await assert.rejects(promesse, (e) => e.code === 'delai' && /30 ms/.test(e.message));
  assert.equal(client.enAttente(), 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { decider, saisieAvecContenu, creerRetour, estApplicationNative, DELAI_QUITTER_MS } from '../lib/retour.js';

/* ---------- la decision ---------- */

test('un retour ferme la couche du DESSUS, une seule', () => {
  const fermables = [
    { id: 'menu-posture', ouvert: false },
    { id: 'saisie', ouvert: true },
    { id: 'fiche', ouvert: true },
  ];
  assert.deepEqual(decider({ fermables, maintenant: 0 }), { type: 'fermer', id: 'saisie' });
});

test('sans rien a fermer, le premier retour avertit', () => {
  assert.deepEqual(decider({ fermables: [{ id: 'fiche', ouvert: false }], maintenant: 5000 }), { type: 'avertir' });
  assert.deepEqual(decider({ fermables: [], maintenant: 5000 }), { type: 'avertir' });
});

test('un second retour dans le delai quitte ; passe le delai, il avertit de nouveau', () => {
  assert.deepEqual(decider({ fermables: [], maintenant: 6000, avertiA: 5000 }), { type: 'quitter' });
  assert.deepEqual(decider({ fermables: [], maintenant: 5000 + DELAI_QUITTER_MS, avertiA: 5000 }), { type: 'quitter' }, 'pile au delai');
  assert.deepEqual(decider({ fermables: [], maintenant: 5000 + DELAI_QUITTER_MS + 1, avertiA: 5000 }), { type: 'avertir' });
});

test("ce qui s'ouvre apres l'avertissement se ferme avant de quitter", () => {
  const fermables = [{ id: 'menu', ouvert: true }];
  assert.deepEqual(decider({ fermables, maintenant: 5500, avertiA: 5000 }), { type: 'fermer', id: 'menu' });
});

/* ---------- une saisie qui a quelque chose a perdre ---------- */

test('une saisie vide se ferme sans question ; un point, une forme ou un champ rempli, non', () => {
  assert.equal(saisieAvecContenu({}), false);
  assert.equal(saisieAvecContenu({ valeurs: ['', '  ', null, undefined] }), false);
  assert.equal(saisieAvecContenu({ geometrie: true }), true);
  assert.equal(saisieAvecContenu({ formeEnCours: true }), true);
  assert.equal(saisieAvecContenu({ valeurs: ['', 'Mairie'] }), true);
});

/* ---------- le gestionnaire ---------- */

function banc({ ouverts = [], refus = false } = {}) {
  const etat = { ouverts: new Set(ouverts), pousses: 0, avertissements: 0, sorties: 0, ferme: [], horloge: 1000, taches: [] };
  const r = creerRetour({
    fermables: () => ['menu', 'saisie', 'fiche'].map((id) => ({ id, ouvert: etat.ouverts.has(id) })),
    fermer: async (id) => { etat.ferme.push(id); if (refus && id === 'saisie') return false; etat.ouverts.delete(id); return true; },
    avertir: () => { etat.avertissements += 1; },
    pousserSentinelle: () => { etat.pousses += 1; },
    quitter: () => { etat.sorties += 1; },
    maintenant: () => etat.horloge,
    planifier: (f, ms) => etat.taches.push({ f, ms }),
  });
  return { etat, r };
}

test("la sentinelle ne s'accumule pas : une seule, quels que soient les retours", async () => {
  const { etat, r } = banc({ ouverts: ['menu', 'fiche'] });
  r.armer(); r.armer(); r.armer();
  assert.equal(etat.pousses, 1, "poser trois fois n'en pose qu'une");
  await r.surRetour();                       // ferme le menu, repose la sentinelle
  await r.surRetour();                       // ferme la fiche, repose la sentinelle
  assert.deepEqual(etat.ferme, ['menu', 'fiche']);
  assert.equal(etat.pousses, 3, 'une pose initiale + une apres chaque retour consomme, pas plus');
  assert.equal(r.sentinelle, true);
});

test('rien a fermer : avertit, ne repose PAS la sentinelle, puis se remet en garde apres le delai', async () => {
  const { etat, r } = banc();
  r.armer();
  const d = await r.surRetour();
  assert.equal(d.type, 'avertir');
  assert.equal(etat.avertissements, 1);
  assert.equal(r.sentinelle, false, "le prochain retour n'a plus d'historique : il quitte par le chemin natif");
  assert.equal(etat.taches.length, 1);
  assert.equal(etat.taches[0].ms, DELAI_QUITTER_MS);
  etat.taches[0].f();                        // le delai passe
  assert.equal(r.sentinelle, true, 'remise en garde');
  assert.equal(etat.pousses, 2);
});

test('un retour qui arrive encore dans le delai quitte', async () => {
  const { etat, r } = banc();
  r.armer();
  await r.surRetour();                       // avertit a t = 1000
  etat.horloge = 1500;
  const d = await r.surRetour();
  assert.equal(d.type, 'quitter');
  assert.equal(etat.sorties, 1);
});

test('une saisie refusee reste ouverte, et la sentinelle est quand meme reposee', async () => {
  const { etat, r } = banc({ ouverts: ['saisie'], refus: true });
  r.armer();
  const d = await r.surRetour();
  assert.equal(d.type, 'fermer');
  assert.equal(etat.ouverts.has('saisie'), true, 'refusee : toujours ouverte');
  assert.equal(r.sentinelle, true);
  assert.equal(etat.avertissements, 0);
});

test("une erreur pendant la fermeture ne laisse pas l'application sans sentinelle", async () => {
  let pousses = 0;
  const r = creerRetour({
    fermables: () => [{ id: 'x', ouvert: true }],
    fermer: async () => { throw new Error('boum'); },
    avertir() {}, pousserSentinelle: () => { pousses += 1; },
  });
  r.armer();
  await assert.rejects(r.surRetour(), /boum/);
  assert.equal(r.sentinelle, true);
  assert.equal(pousses, 2);
});

/* ---------- natif seulement ---------- */

test("seule l'enveloppe native active le retour : ni navigateur, ni Grist", () => {
  assert.equal(estApplicationNative({}), false);
  assert.equal(estApplicationNative({ Capacitor: { isNativePlatform: () => false } }), false);
  assert.equal(estApplicationNative({ Capacitor: { isNativePlatform: () => true } }), true);
  assert.equal(estApplicationNative({ Capacitor: { isNative: true } }), true);
});

/* ---------- le branchement dans app_v7.js ---------- */

import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../app_v7.js', import.meta.url), 'utf8');

test("le retour n'est branché que dans l'application native, une seule fois", () => {
  assert.match(app, /function brancherRetourAndroid\(\) \{\s*if \(_retour \|\| !estApplicationNative\(\)\) return;/);
  assert.match(app, /wireMobileNav\(\);\s*brancherRetourAndroid\(\);/);
});

test("une saisie qui a du contenu demande avant de se fermer", () => {
  assert.match(app, /saisieAvecContenu\(\{ geometrie: !!s\.geometrie, formeEnCours: !!formeEnCours\(s\), valeurs \}\)\s*&& !window\.confirm\(/);
});

test("les menus se ferment avant les panneaux, et la fiche en dernier", () => {
  const ordre = [...app.matchAll(/\{ id: '([a-z-]+)', ouvert: /g)].map((m) => m[1]);
  assert.ok(ordre.indexOf('menu-posture') < ordre.indexOf('saisie'));
  assert.ok(ordre.indexOf('plus') < ordre.indexOf('saisie'));
  assert.ok(ordre.indexOf('saisie') < ordre.indexOf('module'));
  assert.equal(ordre.at(-1), 'fiche');
});

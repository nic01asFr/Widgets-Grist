import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lireHeureEclext, instantLocal, heureLocale, decalageFuseau, reperesDeNuit,
  resoudreHeure, nuitDe, etatPointLumineux,
} from '../lib/eclairage-profil.js';

const PARIS = 'Europe/Paris';
const MARSEILLE = { lat: 43.33, lon: 5.44 };

/** Soleil factice : coucher à 18 h, lever à 7 h, heure du site. Déterministe. */
const soleilFixe = (midiMs) => {
  const { date } = heureLocale(midiMs, PARIS);
  return { coucher: instantLocal(date, 18 * 60, PARIS), lever: instantLocal(date, 7 * 60, PARIS) };
};
const ctx = { ...MARSEILLE, fuseau: PARIS, soleil: soleilFixe };
const a = (date, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return instantLocal(date, h * 60 + m, PARIS);
};

test('les exemples du standard se lisent (§3.5)', () => {
  assert.deepEqual(lireHeureEclext('21:36HL'), { ok: true, reference: 'HL', minutes: 21 * 60 + 36 });
  assert.deepEqual(lireHeureEclext('20:36TU'), { ok: true, reference: 'TU', minutes: 20 * 60 + 36 });
  assert.deepEqual(lireHeureEclext('-196MN'), { ok: true, reference: 'MN', minutes: -196 });
  assert.deepEqual(lireHeureEclext('-15CS'), { ok: true, reference: 'CS', minutes: -15 });
  assert.deepEqual(lireHeureEclext('+15LS'), { ok: true, reference: 'LS', minutes: 15 });
  assert.deepEqual(lireHeureEclext('+0CS'), { ok: true, reference: 'CS', minutes: 0 });
  // Sans référence : heure locale, la référence par défaut.
  assert.deepEqual(lireHeureEclext('01:00'), { ok: true, reference: 'HL', minutes: 60 });
});

test('une heure illisible est refusée avec son motif', () => {
  for (const s of ['', '25:00HL', '12:60HL', '21h36', 'CS', '12:00CS', '+15XX', null]) {
    const r = lireHeureEclext(s);
    assert.equal(r.ok, false, `${s} devait être refusé`);
    assert.ok(r.erreur);
  }
});

test('l’heure locale est celle du site, changements d’heure compris', () => {
  // Hiver : UTC+1 ; été : UTC+2.
  assert.equal(new Date(instantLocal('2026-01-15', 22 * 60, PARIS)).toISOString(), '2026-01-15T21:00:00.000Z');
  assert.equal(new Date(instantLocal('2026-07-15', 22 * 60, PARIS)).toISOString(), '2026-07-15T20:00:00.000Z');
  // 29/03/2026 : 2 h 30 n'existe pas, on glisse après le saut.
  const saut = instantLocal('2026-03-29', 2 * 60 + 30, PARIS);
  assert.equal(new Date(saut).toISOString(), '2026-03-29T01:30:00.000Z');
  // 25/10/2026 : 2 h 30 existe deux fois, on prend la première (heure d'été).
  assert.equal(new Date(instantLocal('2026-10-25', 2 * 60 + 30, PARIS)).toISOString(), '2026-10-25T00:30:00.000Z');
  // Un autre fuseau : La Réunion, UTC+4 toute l'année.
  assert.equal(new Date(instantLocal('2026-01-15', 22 * 60, 'Indian/Reunion')).toISOString(), '2026-01-15T18:00:00.000Z');
  assert.equal(decalageFuseau(Date.UTC(2026, 0, 15, 12), PARIS), 3600 * 1000);
});

test('une nuit commence le soir : les heures du matin appartiennent au lendemain', () => {
  assert.equal(nuitDe(a('2026-01-15', '22:00'), PARIS), '2026-01-15');
  assert.equal(nuitDe(a('2026-01-16', '02:00'), PARIS), '2026-01-15');
  assert.equal(nuitDe(a('2026-01-16', '12:00'), PARIS), '2026-01-16');
  const r = reperesDeNuit('2026-01-15', ctx);
  assert.equal(resoudreHeure('23:30HL', r, PARIS), a('2026-01-15', '23:30'));
  assert.equal(resoudreHeure('05:30HL', r, PARIS), a('2026-01-16', '05:30'));
  assert.equal(resoudreHeure('-15CS', r, PARIS), a('2026-01-15', '17:45'));
  assert.equal(resoudreHeure('+15LS', r, PARIS), a('2026-01-16', '07:15'));
  // Milieu de nuit, défaut : milieu entre 18 h et 7 h le lendemain = 0 h 30.
  assert.equal(resoudreHeure('+0MN', r, PARIS), a('2026-01-16', '00:30'));
  assert.equal(resoudreHeure('-196MN', r, PARIS), a('2026-01-15', '21:14'));
  assert.equal(resoudreHeure('pas une heure', r, PARIS), null);
});

test('le milieu de nuit est un paramètre, en attendant le contrat commun', () => {
  const r = reperesDeNuit('2026-01-15', { ...ctx, milieuDeNuit: ({ lendemain }) => instantLocal(lendemain, 0, PARIS) });
  assert.equal(resoudreHeure('+0MN', r, PARIS), a('2026-01-16', '00:00'));
});

// Profils de pix2hdr (experiments/eclairage/generation/out/photometrie.json).
const VOIRIE = { profil: { nomProfil: 'voirie_A', allumageSoir: '+0CS', extinctionMatin: '+0LS' },
  plages: [{ nomPlage: 'abaissement_milieu_de_nuit', grandeurVariation: 'F', heureDebut: '23:30HL', heureFin: '05:30HL', formatVariation: '%', valeur: 50 }] };
const MEL_B1 = { profil: { nomProfil: 'mise_en_lumiere_B1', allumageSoir: '+0CS', extinctionMatin: '01:00HL' },
  plages: [{ nomPlage: 'extinction_apres_1h', grandeurVariation: 'EX', heureDebut: '01:00HL', heureFin: '+0LS' }] };
const point = { statut: 'functional', temperatureCouleur: 3000, puissance: 40, fluxSource: 4400, valideDe: '20200101', extinctionNuit: false };

const etat = (p, instant) => etatPointLumineux(point, p.profil, p.plages, instant, ctx);

test('voirie : éteinte le jour, pleine le soir, abaissée à 50 % en cœur de nuit', () => {
  assert.equal(etat(VOIRIE, a('2026-01-15', '15:00')).allume, false);
  const soir = etat(VOIRIE, a('2026-01-15', '22:00'));
  assert.equal(soir.allume, true);
  assert.equal(soir.facteurFlux, 1);
  const creux = etat(VOIRIE, a('2026-01-16', '02:00'));
  assert.equal(creux.allume, true);
  assert.equal(creux.facteurFlux, 0.5);
  assert.deepEqual(creux.plages, ['abaissement_milieu_de_nuit']);
  // Bornes : allumée pile au coucher, éteinte pile au lever.
  assert.equal(etat(VOIRIE, a('2026-01-15', '18:00')).allume, true);
  assert.equal(etat(VOIRIE, a('2026-01-15', '17:59')).allume, false);
  assert.equal(etat(VOIRIE, a('2026-01-16', '07:00')).allume, false);
});

test('mise en lumière du patrimoine : éteinte après 1 h (arrêté du 27/12/2018)', () => {
  assert.equal(etat(MEL_B1, a('2026-01-15', '23:00')).allume, true);
  assert.equal(etat(MEL_B1, a('2026-01-16', '00:59')).allume, true);
  const apres = etat(MEL_B1, a('2026-01-16', '01:00'));
  assert.equal(apres.allume, false);
});

test('variations : valeur absolue, température de couleur, extinction', () => {
  const plages = [
    { nomPlage: 'flux_absolu', grandeurVariation: 'F', heureDebut: '22:00HL', heureFin: '23:00HL', formatVariation: 'VA', valeur: 2200 },
    { nomPlage: 'tc', grandeurVariation: 'TC', heureDebut: '22:00HL', heureFin: '23:00HL', formatVariation: 'VA', valeur: 2200 },
  ];
  const e = etatPointLumineux(point, VOIRIE.profil, plages, a('2026-01-15', '22:30'), ctx);
  assert.equal(e.facteurFlux, 0.5);
  assert.equal(e.temperatureCouleur, 2200);
  // Valeur absolue sans référence : ignorée, et dit.
  const sansRef = etatPointLumineux({ ...point, fluxSource: null }, VOIRIE.profil, plages.slice(0, 1), a('2026-01-15', '22:30'), ctx);
  assert.equal(sansRef.facteurFlux, 1);
  assert.ok(sansRef.hypotheses.some((h) => h.includes('valeur absolue')));
});

test('statut, validité du matériel et des plages', () => {
  const nuit = a('2026-01-15', '22:00');
  assert.equal(etatPointLumineux({ ...point, statut: 'decommissioned' }, VOIRIE.profil, [], nuit, ctx).allume, false);
  assert.equal(etatPointLumineux({ ...point, valideDe: '20270101' }, VOIRIE.profil, [], nuit, ctx).allume, false);
  assert.equal(etatPointLumineux({ ...point, valideJusque: '2025-12-31' }, VOIRIE.profil, [], nuit, ctx).allume, false);
  const plageEte = [{ ...VOIRIE.plages[0], valideDe: '20260601', valideJusque: '20260831' }];
  assert.equal(etatPointLumineux(point, VOIRIE.profil, plageEte, a('2026-01-16', '02:00'), ctx).facteurFlux, 1);
});

test('sans profil : allumage au coucher, extinction au lever, dits comme hypothèses', () => {
  const e = etatPointLumineux({ ...point, extinctionNuit: true }, null, [], a('2026-01-15', '22:00'), ctx);
  assert.equal(e.allume, true);
  assert.equal(e.hypotheses.length, 3);
});

test('le lecteur de fuseau est construit une fois par fuseau, pas à chaque appel', async () => {
  // 59 ms pour 95 luminaires à chaque cran du curseur d'heure (24/09/2026) :
  // l'essentiel était la construction d'un Intl.DateTimeFormat par appel.
  const { heureLocale: hl, instantLocal: il } = await import('../lib/eclairage-profil.js');
  const Orig = Intl.DateTimeFormat;
  let n = 0;
  Intl.DateTimeFormat = function (...a) { n++; return new Orig(...a); };
  try {
    for (let i = 0; i < 50; i++) {
      hl(Date.UTC(2026, 0, 15, 12, i), 'Asia/Tokyo');
      il('2026-03-29', 150 + i, 'Asia/Tokyo');
    }
  } finally {
    Intl.DateTimeFormat = Orig;
  }
  assert.ok(n <= 1, `${n} constructions pour 100 appels`);
  // Et les mêmes réponses qu'un formateur neuf.
  assert.deepEqual(hl(Date.UTC(2026, 9, 25, 0, 30), 'Europe/Paris'), { date: '2026-10-25', minutes: 150 });
});

'use strict';
// Tests des dates du core TaskFlow. Une colonne Date de Grist stocke des secondes a minuit UTC ;
// les widgets ecrivaient minuit LOCAL (donc le jour precedent dans la table pour l'Europe) et
// la fiche affichait un jour de moins. Chaque cas est execute dans plusieurs fuseaux horaires
// (TZ doit etre fixe avant le demarrage de Node : on lance un processus par fuseau).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const corePath = path.join(__dirname, '..', 'core', 'taskflow-core.js');

// Script execute dans le processus enfant : charge le core et rend les resultats en JSON.
const script = `
const fs = require('fs');
const TF = new Function(fs.readFileSync(process.argv[1], 'utf8') + '\\nreturn TF;')();
const ymd = (d) => d && [d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-');
const out = {};
const canon = Date.UTC(2026, 9, 16) / 1000;                       // 16 oct 2026, convention Grist
const localMinuit = new Date(2026, 9, 16).getTime() / 1000;       // ancienne ecriture des widgets
const localJournee = new Date(2026, 9, 16, 14, 30).getTime() / 1000; // instant "maintenant" (ancienne creation)
out.canon = ymd(TF.gristToDate(canon));
out.localMinuit = ymd(TF.gristToDate(localMinuit));
out.localJournee = ymd(TF.gristToDate(localJournee));
out.tard = ymd(TF.gristToDate(new Date(2026, 9, 16, 23, 50).getTime() / 1000));
out.vides = [TF.gristToDate(null), TF.gristToDate(''), TF.gristToDate(0), TF.gristToDate(undefined), TF.gristToDate('abc')];
out.ecriture = TF.dateToGrist(new Date(2026, 9, 16, 14, 30)) === canon;
out.ecritureMinuit = TF.dateToGrist(new Date(2026, 9, 16)) === canon;
out.aller_retour = ymd(TF.gristToDate(TF.dateToGrist(new Date(2026, 2, 29, 12)))) ;
out.ecritureVide = [TF.dateToGrist(null), TF.dateToGrist(undefined)];
out.jours = [TF.dayNum(canon), TF.dayNum(localMinuit), TF.dayNum(localJournee)];
out.jourAttendu = Date.UTC(2026, 9, 16) / 86400000;
out.iso = [TF.isoDate(new Date(2026, 0, 5)), TF.isoDate(null)];
out.parse = ymd(TF.parseISODate('2026-10-16'));
out.parseKo = TF.parseISODate('n importe quoi');
out.aujourdhui = TF.todayGrist() % 86400 === 0;
console.log(JSON.stringify(out));
`;

function executer(tz) {
    const sortie = execFileSync(process.execPath, ['-e', script, corePath], { env: Object.assign({}, process.env, { TZ: tz }), encoding: 'utf8' });
    return JSON.parse(sortie.trim().split('\n').pop());
}

// UTC, Europe, Antilles / Guyane (ouest), Polynesie (tres a l'ouest), Reunion / Nouvelle-Caledonie (est)
const fuseaux = ['UTC', 'Europe/Paris', 'America/Martinique', 'Pacific/Tahiti', 'Indian/Reunion', 'Pacific/Noumea'];

for (const tz of fuseaux) {
    describe('dates - fuseau ' + tz, () => {
        const r = executer(tz);
        it('une valeur Grist canonique (minuit UTC) donne le bon jour', () => assert.equal(r.canon, '2026-10-16'));
        it('une ancienne valeur "minuit local" donne le meme jour', () => assert.equal(r.localMinuit, '2026-10-16'));
        it('un ancien instant en journee donne le jour local, meme tard le soir', () => {
            assert.equal(r.localJournee, '2026-10-16');
            assert.equal(r.tard, '2026-10-16');
        });
        it('valeurs vides = null', () => assert.deepEqual(r.vides, [null, null, null, null, null]));
        it('l ecriture est toujours minuit UTC du jour local', () => {
            assert.equal(r.ecriture, true);
            assert.equal(r.ecritureMinuit, true);
            assert.deepEqual(r.ecritureVide, [null, null]);
            assert.equal(r.aller_retour, '2026-3-29');
        });
        it('dayNum identique quelle que soit la convention de la valeur lue', () => {
            assert.deepEqual(r.jours, [r.jourAttendu, r.jourAttendu, r.jourAttendu]);
        });
        it('isoDate / parseISODate : jour local, sans decalage', () => {
            assert.deepEqual(r.iso, ['2026-01-05', '']);
            assert.equal(r.parse, '2026-10-16');
            assert.equal(r.parseKo, null);
        });
        it('todayGrist est un minuit UTC', () => assert.equal(r.aujourdhui, true));
    });
}

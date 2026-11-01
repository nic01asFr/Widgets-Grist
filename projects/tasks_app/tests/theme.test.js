'use strict';
// Tests du module ThemeDef de taskflow-core.js : rejeu des vecteurs appkit (T9),
// mesure des 22 paires sur des graines realistes (T10), et comportement du lecteur
// (sans-theme, document actif/refuse/plusieurs-actifs, instance Grist, repli).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'taskflow-core.js'), 'utf8');
const TF = new Function(src + '\nreturn TF;')();
const V = TF.themeVendor;

function vecteurs(nom) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', nom), 'utf8'));
}

describe('T9 — fingerprints et vecteurs rejoues (modules vendorises)', () => {
    it('theme-instance.mjs : les 32 vecteurs rendent exactement la sortie attendue', () => {
        const data = vecteurs('themedef-instance.vecteurs.json');
        assert.equal(data.cas.length, 32);
        for (const cas of data.cas) {
            assert.deepEqual(V.themeInstance(cas.entree), cas.attendu, cas.id);
        }
    });

    it('derivation-valeurs.mjs : les 126 vecteurs rendent les memes 26 valeurs (ou le meme refus)', () => {
        const data = vecteurs('themedef-derivation.vecteurs.json');
        assert.equal(data.cas.length, 126);
        for (const cas of data.cas) {
            const rendu = V.deriverValeurs(Object.assign({}, cas.graines, { mode: cas.mode }));
            if (cas.attendu.ok === false) {
                const portesAttendues = (cas.attendu.portes || []).slice().sort();
                const portesRendues = (rendu.echecs || []).map(e => e.porte || e.code).sort();
                assert.equal(rendu.ok, false, cas.id);
                assert.deepEqual(portesRendues, portesAttendues, cas.id + ' (gate-set)');
            } else {
                assert.equal(rendu.ok, true, cas.id);
                assert.deepEqual(rendu.valeurs, cas.attendu.valeurs, cas.id);
            }
        }
    });
});

describe('T10 — 22 paires de contraste mesurees sur des graines realistes', () => {
    // Un echantillon de couleurs d'identite plausibles pour un document TaskFlow
    // (dont le bleu de marque #3e5de7 lui-meme), dans les deux modes.
    const PRINCIPALES = ['#3e5de7', '#15a06b', '#e5484d', '#0063cb', '#6b5b95', '#1f2738'];

    for (const principal of PRINCIPALES) {
        for (const mode of ['clair', 'sombre']) {
            it(`${principal} en ${mode} : derive sans porte en echec, et les 22 paires tiennent`, () => {
                const d = V.deriverValeurs({ principal, mode });
                assert.equal(d.ok, true, `${principal}/${mode} : ${JSON.stringify(d.echecs)}`);
                const echecs = V.PAIRES.filter(([a, b, s]) => V.contraste(d.valeurs[a], d.valeurs[b]) < s);
                assert.deepEqual(echecs, [], `${principal}/${mode} : paires en echec`);
            });
        }
    }
});

describe('Lecteur TaskFlow — fond/texte REELS de l\'instance en sombre (E7)', () => {
    // Cas numerique.gouv releve par Form Builder (01/11) : le contrat ne derive que l'accent des
    // graines en sombre (E7/86) ; fond/texte reels doivent etre consommes tels quels, jamais
    // remplaces par la palette sombre generique (#161616/#f0f0f0). control-primary-bg EN SOMBRE
    // est #2845C1 sur cette instance (#3e5de7 est la valeur CLAIRE, une autre variable) : mesure
    // corrigee par Form Builder le 01/11, qui donne le principal redresse #a2b6ff, pas #6e86ed.
    it('fond #222631 / texte #eef1f4 : poses tels quels, les 22 paires tiennent', () => {
        const r = V.themeInstance({ apparence: 'sombre', vars: { 'page-bg': '#222631', text: '#eef1f4', 'control-primary-bg': '#2845c1' } });
        assert.ok(r.themedef, JSON.stringify(r));
        const d = V.deriverValeurs({ principal: r.themedef.graines.principal, mode: 'sombre' });
        assert.equal(d.ok, true, JSON.stringify(d.echecs));
        const valeurs = {};
        Object.keys(d.valeurs).forEach((k) => { valeurs[k] = String(d.valeurs[k]).toLowerCase(); });
        TF.theme.redresserAvecFondReel(valeurs, { fond: r.fond, texte: r.texte }, 'sombre');
        assert.equal(valeurs.fond, '#222631');
        assert.equal(valeurs.texte, '#eef1f4');
        assert.deepEqual(TF.theme.mesurerPaires(valeurs), []);
    });

    it('fond reel qui ferait echouer une paire generique : redresse au lieu de rejeter', () => {
        // Fond gris moyen (luminance intermediaire) : le texte-2 generique (#cecece) ne tient plus forcement.
        const d = V.deriverValeurs({ principal: '#3e5de7', mode: 'sombre' });
        assert.equal(d.ok, true);
        const valeurs = {};
        Object.keys(d.valeurs).forEach((k) => { valeurs[k] = String(d.valeurs[k]).toLowerCase(); });
        TF.theme.redresserAvecFondReel(valeurs, { fond: '#6b6f76', texte: '#f5f5f5' }, 'sombre');
        assert.equal(valeurs.fond, '#6b6f76');
        assert.deepEqual(TF.theme.mesurerPaires(valeurs), []);
    });
});

describe('Lecteur TaskFlow — reglage « sans theme »', () => {
    function fakeStorage() {
        const m = new Map();
        return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
    }

    it('aucun reglage : le thème n\'est pas desactive', () => {
        global.localStorage = fakeStorage();
        try { assert.equal(TF.theme.sansTheme('kanban'), false); }
        finally { delete global.localStorage; }
    });

    it('reglage par widget : desactive seulement ce widget', () => {
        global.localStorage = fakeStorage();
        try {
            TF.theme.setSansTheme('kanban', true);
            assert.equal(TF.theme.sansTheme('kanban'), true);
            assert.equal(TF.theme.sansTheme('gantt'), false);
        } finally { delete global.localStorage; }
    });

    it('reglage « tous » : desactive tous les widgets', () => {
        global.localStorage = fakeStorage();
        try {
            TF.theme.setSansTheme('tous', true);
            assert.equal(TF.theme.sansTheme('kanban'), true);
            assert.equal(TF.theme.sansTheme('gantt'), true);
        } finally { delete global.localStorage; }
    });
});

describe('Lecteur TaskFlow — Theme_document (ligne active)', () => {
    function colonnesDe(lignes) {
        const col = { id: [], cle: [], themedef: [], actif: [] };
        lignes.forEach((l, i) => { col.id.push(i + 1); col.cle.push(l.cle); col.themedef.push(l.themedef); col.actif.push(l.actif); });
        return col;
    }
    const THEME_VALIDE = JSON.stringify({ version: 'themedef-1.0', graines: { principal: '#3e5de7' } });

    it('aucune ligne active : rien (silencieux)', () => {
        const col = colonnesDe([{ cle: 'a', themedef: THEME_VALIDE, actif: false }]);
        assert.equal(TF.theme.ligneActive(col), null);
    });

    it('une ligne active valide : rendue', () => {
        const col = colonnesDe([{ cle: 'a', themedef: THEME_VALIDE, actif: true }]);
        const r = TF.theme.ligneActive(col);
        assert.ok(r && r.td && r.td.graines.principal === '#3e5de7');
    });

    it('plusieurs lignes actives (T7) : refus explicite, rien n\'est applique', () => {
        const col = colonnesDe([{ cle: 'a', themedef: THEME_VALIDE, actif: true }, { cle: 'b', themedef: THEME_VALIDE, actif: true }]);
        const r = TF.theme.ligneActive(col);
        assert.equal(r.refus, 'plusieurs-actifs');
    });

    it('ligne active sans graine principal valide (T6) : refus « principal »', () => {
        const col = colonnesDe([{ cle: 'a', themedef: JSON.stringify({ version: 'themedef-1.0', graines: {} }), actif: true }]);
        const r = TF.theme.ligneActive(col);
        assert.equal(r.refus, 'principal');
    });

    it('document valide resolu en clair : les 26 variables sont mesurees et appliquees', () => {
        const td = { version: 'themedef-1.0', graines: { principal: '#3e5de7' } };
        const r = TF.theme.resoudreDocument(td, 'clair');
        assert.ok(!r.refus, JSON.stringify(r));
        assert.equal(TF.theme.mesurerPaires(r.valeurs).length, 0);
    });

    it('document sans mode sombre (modes.sombre = "aucun") : refus "sans-mode-sombre" en sombre', () => {
        const td = { version: 'themedef-1.0', graines: { principal: '#3e5de7' }, modes: { sombre: 'aucun' } };
        const r = TF.theme.resoudreDocument(td, 'sombre');
        assert.equal(r.refus, 'sans-mode-sombre');
    });
});

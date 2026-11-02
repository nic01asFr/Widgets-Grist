/**
 * Le garde d'amorçage de la page maigre du composant (index_bi.html, publiée sous le nom bi.html) : une carte qui ne démarre pas le DIT (voile) et
 * l'hôte en est averti par un événement `error`, aux seules origines qu'il a déclarées. Script CLASSIQUE (pas un module), chargé EN TÊTE de page :
 * il doit écouter avant MapLibre, dont l'échec survient avant que le voile n'existe.
 *
 * C'est un FICHIER, et non un script en ligne, pour que la page se charge sous une politique de sécurité de contenu `script-src 'self'` : aucune
 * empreinte à recalculer à chaque version. Même code que le garde en ligne d'index_v7.html (hors le test de ?bi=1, inutile ici), égalité gardée par
 * tests/bi-page-maigre.test.js ; comportement gardé par tests/amorcage-garde.test.js. `window.__biPret` est posé par lib/bi/montage.js.
 */
(function () {
    var sp; try { sp = new URLSearchParams(location.search); } catch (e) { return; }
    /* cette page est TOUJOURS le composant : pas de test de ?bi=1 */
    var causes = [], alerte = false;
    function voile(t) { var v = document.getElementById('bi-voile'); if (v) v.textContent = t; }
    function hote(u) { try { return new URL(u, location.href).host; } catch (e) { return String(u).slice(0, 60); } }
    /* Les origines à prévenir sont celles que le composant écoute (lireHotes, lib/bi/liaison.js) : la configuration de la page (window.ATLAS_BI.hotes ou
       <meta name="atlas-bi-hotes">) fait seule autorité si elle déclare au moins une origine valide ; sinon, les ?hote= de l'adresse. Même règle d'origine que normaliserOrigine. */
    function origine(b) {
        try {
            if (typeof b !== 'string' || b.indexOf('*') >= 0) return null;
            var u = new URL(b.trim());
            return ((u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password && !u.search && !u.hash && (!u.pathname || u.pathname === '/')) ? u.origin : null;
        } catch (e) { return null; }
    }
    function hotes() {
        var conf = [];
        try { if (window.ATLAS_BI && Array.isArray(window.ATLAS_BI.hotes)) conf = conf.concat(window.ATLAS_BI.hotes); } catch (e) { /* configuration illisible */ }
        try { var m = document.querySelector && document.querySelector('meta[name="atlas-bi-hotes"]'); if (m && m.content) conf = conf.concat(m.content.split(/[\s,]+/)); } catch (e) { /* pas de meta */ }
        var liste = conf.map(origine).filter(Boolean);
        if (!liste.length) liste = sp.getAll('hote').map(origine).filter(Boolean);
        return liste.filter(function (o, i) { return liste.indexOf(o) === i; });
    }
    function prevenir(code, message, niveau) {
        if (alerte) return; alerte = true;
        console.error('[Atlas BI] ' + message);
        try {
            if (window.parent && window.parent !== window) hotes().forEach(function (o) {
                try { window.parent.postMessage({ source: 'atlas-bi', version: '0.3', type: 'error', charge: { code: code, message: message, niveau: niveau || 'fatal' }, origine: 'utilisateur' }, o); } catch (e) { /* origine invalide */ }
            });
        } catch (e) { /* pas d'hote */ }
    }
    addEventListener('error', function (e) {
        var t = e && e.target;
        if (!t || t.tagName !== 'SCRIPT' || window.__biPret) return;
        causes.push(hote(t.src));
        montrer();
    }, true);
    function montrer() { if (causes.length) voile('Une dépendance de la carte ne se charge pas : ' + causes.join(', ') + ' (réseau ou accès bloqué).'); }
    setTimeout(function () { if (!window.__biPret) montrer(); }, 1500);   // le voile n'existait pas encore au moment d'une erreur du head
    setTimeout(function () { if (!window.__biPret && !causes.length) voile('Chargement lent… (réseau ou dépendance)'); }, 6000);
    setTimeout(function () {
        if (window.__biPret) return;
        var m = causes.length ? 'La carte n’a pas démarré : ' + causes.join(', ') + ' ne se charge pas.' : 'La carte n’a pas démarré après 20 s (réseau lent ou dépendance bloquée).';
        voile(m); prevenir(causes.length ? 'dependance' : 'delai', m, causes.length ? 'fatal' : 'avertissement');
    }, 20000);
})();

/**
 * La classe du voile, posée AVANT le premier affichage (script classique, placé au début de <body> de la page maigre). Même règle que `voileDemande`
 * (lib/bi/voile.js), gardée par tests/bi-premier-affichage.test.js. Un FICHIER plutôt qu'un script en ligne : la page se charge sous `script-src 'self'`.
 */
try { var sp = new URLSearchParams(location.search), vv = sp.get('voile'); if (!(vv === '0' || vv === 'false' || vv === 'non')) { document.body.classList.add('voile-bi'); document.body.setAttribute('aria-busy', 'true'); } } catch (e) { /* sans classe : pas de voile */ }

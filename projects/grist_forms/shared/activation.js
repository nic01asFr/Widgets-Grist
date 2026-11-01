/*
 * activation.js — activer un ThemeDef 1.0 dans la table `Theme_document` : COPIE du kit, jamais une bascule réécrite ici.
 *
 * Ce fichier est généré mécaniquement à partir de quatre modules PURS du kit (lot TD-3a du ThemeDef 1.0, 01/11/2026) :
 *   - modele/lib/sha256.mjs sha256:cb25599ba3cfd3d2
 *   - jetons/themedef/lib/validateur.mjs sha256:d62c7c7f1fe3dd70
 *   - jetons/themedef/lib/canonique-themedef.mjs sha256:cbb1cd62e791f129
 *   - jetons/themedef/lib/activation.mjs sha256:956eb970089374b2
 * Seules les lignes `import` / `export` sont réécrites ; chaque module garde sa portée. Ne pas le modifier à la main : le comportement
 * est gardé par les 57 vecteurs d'activation du kit (tests/activation.test.js). Pour le mettre à jour, recopier le kit et rejouer les vecteurs.
 *
 * `lotActivation(lignesExistantes, ligneNouvelle, { maintenant, hash })` rend `{ ok, actions, erreurs, avertissements, ignore }` : la liste
 * d'actions Grist à appliquer en UN lot par l'écrivain qui a confirmé. Un document refusé n'ouvre AUCUNE action (l'ancien thème actif n'est
 * pas désactivé). La table n'est jamais créée ici : table absente = refus, à l'appelant de la déclarer après une confirmation explicite.
 * Convention (docs/THEMEDEF-SPEC.md §3, règle 6) : les écrivains reconnus de `Theme_document` passent tous par cette même fonction.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FormThemeDefActivation = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── modele/lib/sha256.mjs ─────────────────────────────────────────────────
  const mod_sha256 = (function () {
    /* SHA-256 en JavaScript pur : synchrone, sans dépendance, sans `node:crypto`, identique dans Node et dans un navigateur.

       Pourquoi : l'empreinte d'un jeu de données (`JeuDeDonnees.empreinte()`) est SYNCHRONE depuis le jalon 2a ; `SubtleCrypto.digest` est
       asynchrone et n'existe qu'en contexte sécurisé (https, localhost) : l'employer aurait changé la signature publique. L'algorithme
       (FIPS 180-4) est déterministe : la sortie est celle de `crypto.createHash('sha256')` pour le même flux d'octets (UTF-8), et un test
       le compare à la référence de Node sur des vecteurs connus et sur des entrées tirées au sort.

       Interface en flux, comme `createHash` : `const h = creerSha256(); h.update('texte'); h.digest()` -> 64 caractères hexadécimaux.
       Les blocs de 64 octets sont consommés au fil de l'eau : la mémoire reste constante quelle que soit la taille du contenu. */

    /** Valeurs initiales : parties fractionnaires des racines carrées des 8 premiers nombres premiers. */
    const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

    /** Constantes de ronde : parties fractionnaires des racines cubiques des 64 premiers nombres premiers. */
    const K = new Uint32Array([
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);

    const encodeur = new TextEncoder();
    const rot = (x, n) => (x >>> n) | (x << (32 - n));

    /**
     * Crée un calcul d'empreinte SHA-256 en flux.
     * @returns {{update: (texte: string) => object, digest: () => string}} `update` encode en UTF-8 ; `digest` rend l'hexadécimal et clôt le calcul
     */
    function creerSha256() {
      const h = Uint32Array.from(H0);
      const w = new Uint32Array(64);
      const tampon = new Uint8Array(64);
      let rempli = 0;
      let octets = 0;
      let clos = false;

      function bloc(source, debut) {
        for (let i = 0; i < 16; i++) {
          const j = debut + i * 4;
          w[i] = ((source[j] << 24) | (source[j + 1] << 16) | (source[j + 2] << 8) | source[j + 3]) >>> 0;
        }
        for (let i = 16; i < 64; i++) {
          const s0 = rot(w[i - 15], 7) ^ rot(w[i - 15], 18) ^ (w[i - 15] >>> 3);
          const s1 = rot(w[i - 2], 17) ^ rot(w[i - 2], 19) ^ (w[i - 2] >>> 10);
          w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i++) {
          const S1 = rot(e, 6) ^ rot(e, 11) ^ rot(e, 25);
          const ch = (e & f) ^ (~e & g);
          const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
          const S0 = rot(a, 2) ^ rot(a, 13) ^ rot(a, 22);
          const maj = (a & b) ^ (a & c) ^ (b & c);
          const t2 = (S0 + maj) >>> 0;
          hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
        h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
      }

      function ajouter(octetsEntree) {
        octets += octetsEntree.length;
        let i = 0;
        if (rempli > 0) {
          const n = Math.min(64 - rempli, octetsEntree.length);
          tampon.set(octetsEntree.subarray(0, n), rempli);
          rempli += n; i = n;
          if (rempli === 64) { bloc(tampon, 0); rempli = 0; }
        }
        for (; i + 64 <= octetsEntree.length; i += 64) bloc(octetsEntree, i);
        if (i < octetsEntree.length) { tampon.set(octetsEntree.subarray(i), 0); rempli = octetsEntree.length - i; }
      }

      const calcul = {
        update(texte) {
          if (clos) throw new Error('creerSha256 : le calcul est clos (digest déjà appelé).');
          ajouter(encodeur.encode(String(texte)));
          return calcul;
        },
        digest() {
          if (clos) throw new Error('creerSha256 : digest déjà appelé.');
          clos = true;
          const bits = octets * 8;
          const rembourrage = new Uint8Array(Math.ceil((octets + 9) / 64) * 64 - octets);
          rembourrage[0] = 0x80;
          const vue = new DataView(rembourrage.buffer);
          vue.setUint32(rembourrage.length - 8, Math.floor(bits / 0x100000000));
          vue.setUint32(rembourrage.length - 4, bits >>> 0);
          ajouter(rembourrage);
          return [...h].map((x) => x.toString(16).padStart(8, '0')).join('');
        }
      };
      return calcul;
    }

    /** Empreinte SHA-256 d'un texte (UTF-8), en hexadécimal. */
    const sha256Hex = (texte) => creerSha256().update(texte).digest();

    return { creerSha256, sha256Hex };
  })();

  // ── jetons/themedef/lib/validateur.mjs ────────────────────────────────────
  const mod_validateur = (function () {
    /* Validateur du ThemeDef 1.0 (étage B du contrat de thème) : module PUR, sans import, sans DOM, sans `process`.
       Il peut être copié tel quel dans un widget. Il juge un document (texte JSON ou objet), choisit la ligne active d'une table `Theme_document`
       et juge une valeur de l'étage A. Il ne calcule pas le mode sombre, ne mesure aucun contraste et ne compile rien (TD-2 et TD-3).

       Le contenu est une donnée NON FIABLE : taille, version, profondeur et clés interdites sont vérifiées d'abord ; `resolu` n'est jamais cru.

       Règle de refus (spécification, §2, §3 et §5) :
       - le document est REFUSÉ (`ok: false`, `themedef: null`) quand sa forme ou un engagement est faux : JSON, taille, version, profondeur,
         clé interdite, graine `principal`, type d'une section, mode sombre, exigence plus lâche que le seuil, mode sombre explicite incomplet ;
       - le reste est IGNORÉ et dit dans `ignore` (jamais corrigé, jamais interprété) : clés inconnues, graines d'état, valeur de surcharge refusée,
         graine facultative, police ou nom invalides, `resolu`.
       Sortie : { ok, themedef, erreurs[], avertissements[], ignore[] }. Une erreur ou un avertissement suit le format du kit
       { niveau, code, chemin (pointeur JSON), message, correctif (JSON Patch ou null), gravite } ; une entrée de `ignore` est { chemin, code, valeur }. */

    const VERSION_THEMEDEF = 'themedef-1.0';
    const LIMITES = Object.freeze({ octets: 16384, profondeur: 6, lignes: 50, valeur: 48, nom: 80 });
    /** Les 26 variables de `kit-theme/0.1`, triées. */
    const CLES = Object.freeze('accent accent-fond accent-texte action action-actif action-survol action-texte alerte alerte-fond attention attention-filet attention-fond bord bord-champ focus fond info info-fond ok ok-fond ombre papier surface surface-2 texte texte-2'.split(' '));
    /** Seuils du compilateur : une exigence du document ne peut que les renforcer. */
    const SEUILS = Object.freeze({ contrasteTexte: 4.5, contrasteComposant: 3 });
    const POLICES = Object.freeze(['systeme', 'sans', 'serif', 'mono', 'lisible']);
    const MODES_SOMBRE = Object.freeze(['derive', 'explicite', 'aucun']);

    const CHAMPS = ['version', 'nom', 'graines', 'police', 'modes', 'surcharges', 'exigences', 'resolu'];
    const FACULTATIVES = ['secondaire', 'encre', 'fond'];
    const ETATS = ['ok', 'attention', 'alerte', 'info'];
    const INTERDITES = ['__proto__', 'constructor', 'prototype'];
    const HEX = /^#[0-9A-Fa-f]{6}$/;
    /* Même motif que le schéma publié de `kit-theme/0.1` : hex (3, 4, 6, 8), rgb/rgba/hsl/hsla numériques, `var(--nom)` sans repli. */
    const MOTIF = /^(?:#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(?:rgb|rgba|hsl|hsla)\(\s*[0-9.%]{1,8}(?:\s*[ ,/]\s*[0-9.%]{1,8}){2,3}\s*\)|var\(--[A-Za-z_][A-Za-z0-9_-]{0,63}\))$/;
    const CLE_LIGNE = /^[a-z][a-z0-9-]{0,39}$/;

    /** Les codes, stables (ils ne changent jamais de sens) : { code: [niveau, titre] }, niveau 1 forme, niveau 2 engagement. */
    const T = {
      'json-illisible': [1, 'JSON illisible'],
      taille: [1, 'Document de plus de 16384 octets'],
      type: [1, 'Le document doit être un objet'],
      'version-inconnue': [1, 'Version inconnue'],
      profondeur: [1, 'Plus de 6 niveaux de profondeur'],
      'cle-interdite': [1, 'Clé interdite'],
      'principal-absent': [1, 'La graine « principal » est obligatoire'],
      'couleur-invalide': [1, 'Graine : #RRGGBB attendu'],
      'section-type': [1, 'Un objet est attendu'],
      'mode-sombre-invalide': [2, 'Mode sombre hors liste'],
      'sombre-incomplet': [2, 'Sombre explicite : 26 valeurs exigées'],
      'exigence-trop-lache': [2, 'Exigence plus lâche que le seuil'],
      'exigence-invalide': [2, 'Une exigence est un nombre'],
      'cle-inconnue': [1, 'Clé inconnue, jamais interprétée'],
      'etat-ignore': [1, 'Graine d\'état ignorée'],
      'resolu-ignore': [1, '« resolu » est ignoré, jamais cru'],
      'valeur-invalide': [1, 'Valeur non admise'],
      'valeur-trop-longue': [1, 'Valeur de plus de 48 caractères'],
      'police-non-listee': [1, 'Police hors de la liste fermée'],
      'nom-invalide': [1, 'Nom : 80 caractères au plus'],
      'plusieurs-actifs': [2, 'Plusieurs lignes actives : rien n\'est appliqué'],
      'lignes-ignorees': [2, 'Seules les 50 premières lignes sont lues']
    };
    const CODES = Object.freeze(T);

    const objet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    const octets = (t) => new TextEncoder().encode(t).length;
    const ptr = (k) => String(k).replace(/~/g, '~0').replace(/\//g, '~1');
    const fab = (code, chemin, gravite, detail, correctif) => ({ niveau: T[code][0], code, chemin, message: T[code][1] + (detail ? ' : ' + detail : ''), correctif: correctif || null, gravite });
    const genre = (v) => (Array.isArray(v) ? 'tableau' : v === null ? 'null' : typeof v);
    const court = (v) => String(v).slice(0, 30);

    function parcourir(v, chemin, n, e) {
      if (n > LIMITES.profondeur) { e.profondeur = true; return; }
      if (Array.isArray(v)) v.forEach((x, i) => parcourir(x, chemin + '/' + i, n + 1, e));
      else if (objet(v)) {
        for (const k of Object.keys(v)) {
          const c = chemin + '/' + ptr(k);
          if (INTERDITES.includes(k) && !e.cle) e.cle = c;
          parcourir(v[k], c, n + 1, e);
        }
      }
    }

    /**
     * Une valeur de l'étage A (surcharge) : couleur en syntaxe connue ou `var(--nom)` sans repli, 48 caractères au plus, sans espace autour.
     * @returns {{ ok: boolean, code?: 'valeur-invalide'|'valeur-trop-longue' }}
     */
    function validerValeurEtageA(valeur) {
      if (typeof valeur !== 'string') return { ok: false, code: 'valeur-invalide' };
      if (valeur.length > LIMITES.valeur) return { ok: false, code: 'valeur-trop-longue' };
      return MOTIF.test(valeur) ? { ok: true } : { ok: false, code: 'valeur-invalide' };
    }

    /**
     * Juge un ThemeDef.
     * @param {string|object} brut  le contenu de la colonne `themedef` (texte JSON) ou le document déjà lu
     * @returns {{ ok: boolean, themedef: object|null, erreurs: object[], avertissements: object[], ignore: {chemin: string, code: string, valeur: string}[] }}
     *   `themedef` : le document retenu (sans `resolu`, sans ce qui est ignoré), ou null si le document est refusé.
     */
    function validerThemeDef(brut) {
      const erreurs = [], avertissements = [], ignore = [];
      const fin = (themedef) => ({ ok: !erreurs.length, themedef: erreurs.length ? null : themedef, erreurs, avertissements, ignore });
      const err = (code, chemin, detail, correctif) => erreurs.push(fab(code, chemin, 'erreur', detail, correctif));
      const ecarter = (code, chemin, v) => ignore.push({ chemin, code, valeur: court(v) });
      const refuser = (code, chemin, detail) => { err(code, chemin, detail); return fin(); };
      const hex = (v) => typeof v === 'string' && HEX.test(v);
      const section = (chemin, v) => { if (objet(v)) return true; err('section-type', chemin, genre(v)); return false; };

      let doc = brut;
      if (typeof brut === 'string') {
        if (octets(brut) > LIMITES.octets) return refuser('taille', '', octets(brut) + ' octets');
        try { doc = JSON.parse(brut); } catch { return refuser('json-illisible', ''); }
      } else if (brut !== null && typeof brut === 'object') {
        let t = Infinity;
        try { t = octets(JSON.stringify(brut)); } catch { /* cyclique ou non sérialisable : refusé comme trop gros */ }
        if (t > LIMITES.octets) return refuser('taille', '', t + ' octets');
      }
      if (!objet(doc)) return refuser('type', '', genre(doc));
      if (doc.version !== VERSION_THEMEDEF) return refuser('version-inconnue', '/version', court(doc.version));
      const etat = {};
      parcourir(doc, '', 1, etat);
      if (etat.profondeur) err('profondeur', '');
      if (etat.cle) err('cle-interdite', etat.cle);
      if (erreurs.length) return fin();

      const sortie = { version: VERSION_THEMEDEF };
      const cles = Object.keys(doc);
      for (const k of cles) if (!CHAMPS.includes(k)) ecarter('cle-inconnue', '/' + ptr(k), '');
      if (cles.includes('nom')) {
        if (typeof doc.nom === 'string' && [...doc.nom].length <= LIMITES.nom) sortie.nom = doc.nom;
        else ecarter('nom-invalide', '/nom', doc.nom);
      }
      if (cles.includes('resolu')) ecarter(objet(doc.resolu) ? 'resolu-ignore' : 'valeur-invalide', '/resolu', '');
      if (cles.includes('police')) {
        if (POLICES.includes(doc.police)) sortie.police = doc.police;
        else ecarter('police-non-listee', '/police', doc.police);
      }

      // graines : `principal` obligatoire, trois facultatives, quatre états acceptés puis ignorés avec avertissement
      const g = objet(doc.graines) ? doc.graines : {};
      if (g.principal === undefined) err('principal-absent', '/graines/principal');
      else if (!hex(g.principal)) err('couleur-invalide', '/graines/principal', court(g.principal));
      sortie.graines = { principal: g.principal };
      for (const k of Object.keys(g)) {
        const c = '/graines/' + ptr(k);
        if (k === 'principal') continue;
        if (!FACULTATIVES.includes(k) && !ETATS.includes(k)) ecarter('cle-inconnue', c, '');
        else if (!hex(g[k])) ecarter('couleur-invalide', c, g[k]);
        else if (FACULTATIVES.includes(k)) sortie.graines[k] = g[k];
        else { ecarter('etat-ignore', c, g[k]); avertissements.push(fab('etat-ignore', c, 'avertissement', k, [{ op: 'remove', path: c }])); }
      }

      if (cles.includes('modes') && section('/modes', doc.modes)) {
        for (const k of Object.keys(doc.modes)) {
          if (k !== 'sombre') ecarter('cle-inconnue', '/modes/' + ptr(k), '');
          else if (MODES_SOMBRE.includes(doc.modes.sombre)) sortie.modes = { sombre: doc.modes.sombre };
          else err('mode-sombre-invalide', '/modes/sombre', court(doc.modes.sombre));
        }
      }

      // surcharges : valeurs de l'étage A seulement, 26 clés seulement ; le reste est ignoré et dit, jamais corrigé
      const acceptees = {};
      if (cles.includes('surcharges') && section('/surcharges', doc.surcharges)) {
        sortie.surcharges = {};
        for (const mode of Object.keys(doc.surcharges)) {
          const cm = '/surcharges/' + ptr(mode);
          if (mode !== 'clair' && mode !== 'sombre') ecarter('cle-inconnue', cm, '');
          else if (section(cm, doc.surcharges[mode])) {
            sortie.surcharges[mode] = acceptees[mode] = {};
            for (const k of Object.keys(doc.surcharges[mode])) {
              const v = doc.surcharges[mode][k], r = validerValeurEtageA(v);
              if (!CLES.includes(k)) ecarter('cle-inconnue', cm + '/' + ptr(k), '');
              else if (r.ok) acceptees[mode][k] = v;
              else ecarter(r.code, cm + '/' + k, v);
            }
          }
        }
      }
      if (sortie.modes && sortie.modes.sombre === 'explicite') {
        const manque = CLES.filter((k) => !(acceptees.sombre && k in acceptees.sombre));
        if (manque.length) err('sombre-incomplet', '/surcharges/sombre', 'manquent ' + manque.join(', '));
      }

      if (cles.includes('exigences') && section('/exigences', doc.exigences)) {
        sortie.exigences = {};
        for (const k of Object.keys(doc.exigences)) {
          const c = '/exigences/' + ptr(k), v = doc.exigences[k];
          if (!Object.keys(SEUILS).includes(k)) ecarter('cle-inconnue', c, '');
          else if (!Number.isFinite(v)) err('exigence-invalide', c, court(v));
          else if (v < SEUILS[k]) err('exigence-trop-lache', c, v + ' pour un seuil de ' + SEUILS[k], [{ op: 'replace', path: c, value: SEUILS[k] }]);
          else sortie.exigences[k] = v;
        }
      }
      return fin(sortie);
    }

    /**
     * Parmi les lignes de la table `Theme_document`, celle qui s'applique. Règle de lecture identique pour tous les lecteurs : table absente ou vide ou sans
     * ligne active, aucun thème et pas de bruit ; plusieurs lignes actives, rien n'est appliqué et `plusieurs-actifs` est dit ; 50 lignes examinées au plus.
     * @param {object[]|null|undefined} lignes  { cle, themedef, actif, ... }
     * @returns {{ ligne: object|null, avertissements: object[] }}
     */
    function choisirLigneActive(lignes) {
      const avertissements = [];
      if (!Array.isArray(lignes)) return { ligne: null, avertissements };
      const vues = lignes.slice(0, LIMITES.lignes);
      const dire = (code, nombre) => avertissements.push({ ...fab(code, '', 'avertissement', nombre + ''), nombre });
      if (lignes.length > vues.length) dire('lignes-ignorees', lignes.length - vues.length);
      const actives = vues.filter((l) => objet(l) && l.actif === true && typeof l.cle === 'string' && CLE_LIGNE.test(l.cle));
      if (actives.length > 1) { dire('plusieurs-actifs', actives.length); return { ligne: null, avertissements }; }
      return { ligne: actives[0] || null, avertissements };
    }

    return { VERSION_THEMEDEF, LIMITES, CLES, SEUILS, POLICES, MODES_SOMBRE, CODES, validerValeurEtageA, validerThemeDef, choisirLigneActive };
  })();

  // ── jetons/themedef/lib/canonique-themedef.mjs ────────────────────────────
  const mod_canonique = (function () {
    /* JSON canonique du ThemeDef 1.0 (spécification, §4) : module PUR, sans import, sans `node:crypto`.

       Forme canonique : UTF-8, clés triées récursivement par ordre d'unités de code (UTF-16), aucun espace hors des chaînes, nombres écrits comme
       `JSON.stringify` les écrit (sans zéro inutile), UN SEUL saut de ligne « \n » final. L'empreinte s'écrit `sha256-<base64>`.

       Ce module ne calcule AUCUNE empreinte lui-même : il reçoit la fonction `hash(texte)` (point d'injection). Elle prend le texte canonique, l'encode en
       UTF-8 et rend le SHA-256 en 64 caractères hexadécimaux minuscules (par exemple `crypto.createHash('sha256').update(texte, 'utf8').digest('hex')` côté Node,
       ou le SHA-256 synchrone en JavaScript pur du kit, `kit/modele/lib/sha256.mjs`, côté navigateur). Aucun arrondi n'est fait ici : les contrastes
       arrondis à deux décimales (`resolu.mesures`) sont arrondis par celui qui les écrit. */

    const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

    /** Copie profonde dont les clés d'objet sont triées par unités de code ; refuse tout ce que JSON ne sait pas écrire (undefined, fonction, NaN, objet non simple). */
    function trierCles(valeur, chemin = '') {
      if (Array.isArray(valeur)) return valeur.map((x, i) => trierCles(x, chemin + '/' + i));
      if (valeur !== null && typeof valeur === 'object') {
        const proto = Object.getPrototypeOf(valeur);
        if (proto !== Object.prototype && proto !== null) throw new TypeError('Objet non simple en ' + (chemin || '/') + ' : le JSON canonique ne lit que des objets JSON.');
        return Object.fromEntries(Object.keys(valeur).sort().map((k) => [k, trierCles(valeur[k], chemin + '/' + k)]));
      }
      if (valeur === null || typeof valeur === 'string' || typeof valeur === 'boolean' || (typeof valeur === 'number' && Number.isFinite(valeur))) return valeur;
      throw new TypeError('Valeur non écrivable en JSON en ' + (chemin || '/') + ' : ' + typeof valeur + '.');
    }

    /** Le JSON canonique d'une valeur, avec son saut de ligne final. */
    const canonique = (valeur) => JSON.stringify(trierCles(valeur)) + '\n';

    /** Le document sans `resolu` (copie superficielle) : c'est lui qu'on empreinte, `resolu` est calculé et jamais cru. */
    function sansResolu(themedef) {
      const copie = { ...themedef };
      delete copie.resolu;
      return copie;
    }

    /** Le document sans `resolu` ni `hash` (copie superficielle) : le document n'entre pas dans sa propre empreinte, `hash` serait circulaire. */
    function sansResoluNiHash(themedef) {
      const copie = sansResolu(themedef);
      delete copie.hash;
      return copie;
    }

    /** JSON canonique du document HORS `resolu` et hors `hash`. */
    const canoniqueDocument = (themedef) => canonique(sansResoluNiHash(themedef));

    /** JSON canonique de ce qui fonde `resolu.hash` : `{ modes, police }` d'un `resolu`. */
    const canoniqueResolu = (resolu) => canonique({ modes: resolu.modes, police: resolu.police });

    /** SHA-256 hexadécimal (64 caractères) vers base64 avec bourrage, sans `btoa` ni `Buffer`. */
    function hexVersBase64(hex) {
      if (typeof hex !== 'string' || !/^[0-9a-f]{64}$/.test(hex)) throw new TypeError('`hash` doit rendre un SHA-256 en 64 caractères hexadécimaux minuscules.');
      const o = hex.match(/../g).map((h) => parseInt(h, 16));
      let s = '';
      for (let i = 0; i < o.length; i += 3) {
        const n = (o[i] << 16) | ((o[i + 1] || 0) << 8) | (o[i + 2] || 0);
        s += BASE64[n >> 18] + BASE64[(n >> 12) & 63] + (i + 1 < o.length ? BASE64[(n >> 6) & 63] : '=') + (i + 2 < o.length ? BASE64[n & 63] : '=');
      }
      return s;
    }

    /** `sha256-<base64>` du texte donné, avec la fonction `hash` injectée. */
    const empreinte = (texte, hash) => 'sha256-' + hexVersBase64(hash(texte));

    /** `hash` du document (colonne `hash` de `Theme_document`) : empreinte du JSON canonique hors `resolu` et hors `hash`. */
    const hashDocument = (themedef, hash) => empreinte(canoniqueDocument(themedef), hash);

    /** `resolu.hash` : empreinte du JSON canonique de `{ modes, police }`. */
    const hashResolu = (resolu, hash) => empreinte(canoniqueResolu(resolu), hash);

    return { trierCles, canonique, sansResolu, sansResoluNiHash, canoniqueDocument, canoniqueResolu, hexVersBase64, empreinte, hashDocument, hashResolu };
  })();

  // ── jetons/themedef/lib/activation.mjs ────────────────────────────────────
  const mod_activation = (function () {
    /* Activation d'un ThemeDef dans la table `Theme_document` (lot TD-3a) : module PUR, sans réseau, sans Grist, sans DOM, sans `process`, sans `node:`.
       Il dépend de `./validateur.mjs` et de `./canonique-themedef.mjs`. Il ne fait RIEN : il RETOURNE la liste d'UserActions Grist à appliquer, en UN SEUL lot
       (`applyUserActions`), par l'écrivain qui a confirmé. Il ne crée jamais la table : table absente, c'est à l'appelant de la déclarer, après confirmation explicite.

       `lotActivation(lignesExistantes, ligneNouvelle, { maintenant, hash })` -> { ok, actions, erreurs, avertissements, ignore }
       - `lignesExistantes` : les lignes de la table, avec leur `id` Grist (`null` ou `undefined` : table absente, refusé) ;
       - `ligneNouvelle` : { cle, themedef } ; `themedef` est le texte JSON de la colonne, ou le document ;
       - `maintenant` : l'instant en millisecondes (`Date.now()`), écrit dans `maj` en SECONDES Unix ;
       - `hash(texte)` : le SHA-256 hexadécimal (64 caractères minuscules) de l'UTF-8 du texte, fourni par l'appelant (point d'injection du canonique).

       Règles dures : le document est d'abord jugé par `validerThemeDef`, et refusé = AUCUNE action (l'ancienne ligne active n'est pas désactivée) ; la clé est
       `^[a-z][a-z0-9-]{0,39}$` ; une clé qui existe déjà est mise à jour (jamais de doublon) ; toutes les lignes actives sont désactivées dans le même lot ; une seule ligne
       est active à l'arrivée ; les lecteurs ne lisent que les 50 premières lignes : une ligne qu'ils ne liraient pas est refusée.
       Colonnes écrites : `themedef` (le texte tel que donné, ou `JSON.stringify` du document), `actif`, `maj`, `version`, `hash` (empreinte `sha256-<base64>` du JSON
       canonique du document sans `resolu` ni `hash`) et, pour une nouvelle ligne, `cle`. */

    const { LIMITES, VERSION_THEMEDEF, validerThemeDef } = mod_validateur;
    const { canonique, empreinte, sansResoluNiHash } = mod_canonique;

    const TABLE = 'Theme_document';
    const CLE_LIGNE = /^[a-z][a-z0-9-]{0,39}$/;

    const T = {
      'option-invalide': [1, 'Option invalide'],
      'table-absente': [2, 'La table « Theme_document » n\'existe pas : à créer d\'abord, après confirmation'],
      'cle-invalide': [1, 'Clé de ligne invalide : lettres minuscules, chiffres et tirets, 40 caractères au plus, une lettre en premier'],
      'cle-en-double': [2, 'Plusieurs lignes portent déjà cette clé : rien n\'est écrit'],
      'ligne-sans-id': [2, 'Une ligne à modifier n\'a pas d\'identifiant de ligne'],
      'ligne-hors-lecture': [2, 'Cette ligne est au-delà des 50 premières : les lecteurs ne la liraient pas'],
      'table-pleine': [2, 'La table a déjà 50 lignes : une nouvelle ligne ne serait pas lue'],
      'hash-invalide': [1, 'La fonction hash ne rend pas un SHA-256 hexadécimal']
    };
    const CODES_ACTIVATION = Object.freeze(T);

    const objet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    const fab = (code, chemin, detail) => ({ niveau: T[code][0], code, chemin, message: T[code][1] + (detail ? ' : ' + detail : ''), correctif: null, gravite: 'erreur' });
    const identifiant = (l) => Number.isInteger(l.id) && l.id > 0;

    /**
     * Le lot d'actions qui active `ligneNouvelle`.
     * @returns {{ ok: boolean, actions: Array, erreurs: object[], avertissements: object[], ignore: object[] }}
     *   `actions` est vide quand `ok` est faux. Un lot : désactiver les lignes actives (autres que la cible), puis mettre à jour ou ajouter la ligne cible.
     */
    function lotActivation(lignesExistantes, ligneNouvelle, options) {
      const erreurs = [];
      const err = (code, chemin, detail) => erreurs.push(fab(code, chemin, detail));
      const { maintenant, hash } = options || {};
      if (typeof maintenant !== 'number' || !Number.isFinite(maintenant) || maintenant < 0) err('option-invalide', '/maintenant', 'un nombre de millisecondes positif est attendu');
      if (typeof hash !== 'function') err('option-invalide', '/hash', 'une fonction est attendue');
      if (!Array.isArray(lignesExistantes)) err('table-absente', '');
      const nouvelle = objet(ligneNouvelle) ? ligneNouvelle : {};
      const cle = nouvelle.cle;
      if (typeof cle !== 'string' || !CLE_LIGNE.test(cle)) err('cle-invalide', '/cle', String(cle).slice(0, 30));

      let texte;
      try { texte = typeof nouvelle.themedef === 'string' ? nouvelle.themedef : JSON.stringify(nouvelle.themedef); } catch { /* document non sérialisable : refusé par le validateur */ }
      const v = validerThemeDef(texte);
      erreurs.push(...v.erreurs);

      const table = Array.isArray(lignesExistantes) ? lignesExistantes.filter(objet) : [];
      const memes = typeof cle === 'string' ? table.filter((l) => l.cle === cle) : [];
      if (memes.length > 1) err('cle-en-double', '/cle', cle);
      const cible = memes[0];
      const autres = table.filter((l) => l.actif === true && l !== cible);
      for (const l of cible ? [cible, ...autres] : autres) if (!identifiant(l)) err('ligne-sans-id', '/lignes', String(l.cle).slice(0, 30));
      if (Array.isArray(lignesExistantes)) {
        if (cible && lignesExistantes.indexOf(cible) >= LIMITES.lignes) err('ligne-hors-lecture', '/cle', cle);
        if (!cible && lignesExistantes.length >= LIMITES.lignes) err('table-pleine', '');
      }

      let empreinteDocument;
      if (v.ok && typeof hash === 'function') {
        try { empreinteDocument = empreinte(canonique(sansResoluNiHash(JSON.parse(texte))), hash); } catch { err('hash-invalide', '/hash'); }
      }
      if (erreurs.length) return { ok: false, actions: [], erreurs, avertissements: [], ignore: [] };

      const champs = { themedef: texte, actif: true, maj: Math.floor(maintenant / 1000), version: VERSION_THEMEDEF, hash: empreinteDocument };
      const desactivations = autres.map((l) => ['UpdateRecord', TABLE, l.id, { actif: false }]);
      const activation = cible ? ['UpdateRecord', TABLE, cible.id, champs] : ['AddRecord', TABLE, null, { cle, ...champs }];
      const actions = [...desactivations, activation];
      return { ok: true, actions, erreurs, avertissements: v.avertissements, ignore: v.ignore };
    }

    return { TABLE, CODES_ACTIVATION, lotActivation };
  })();

  return {
    TABLE: mod_activation.TABLE,
    lotActivation: mod_activation.lotActivation,
    CODES_ACTIVATION: mod_activation.CODES_ACTIVATION,
    validerThemeDef: mod_validateur.validerThemeDef,
    VERSION_THEMEDEF: mod_validateur.VERSION_THEMEDEF,
    LIMITES: mod_validateur.LIMITES,
    hashSha256: mod_sha256.sha256Hex,
    hashDocument: mod_canonique.hashDocument
  };
}));

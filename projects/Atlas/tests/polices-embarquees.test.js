/**
 * Les polices de carte embarquées (lib/bi/polices/) : sans glyphes, MapLibre ne dessine plus une couche étiquetée (les points disparaissent avec leurs étiquettes : mesuré le 02/11/2026).
 * Les fonds sans polices propres (`base=aucune`, repli hors réseau) les demandent à la copie d'Atlas, jamais à un serveur tiers.
 * node --test projects/Atlas/tests/polices-embarquees.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { GLYPHES_EMBARQUES, STYLE_AUCUN_FOND, STYLE_HORS_RESEAU, STYLE_BASE_URL } from '../lib/fonds-base.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const ATLAS = path.join(ICI, '..');
const POLICES = path.join(ATLAS, 'lib', 'bi', 'polices');
const STACK = 'Noto Sans Regular';
const PLAGES = ['0-255', '256-511', '8192-8447'];

/** Décodeur minimal d'un fichier de glyphes MapLibre (glyphs.proto) : le nom de la police, la plage et les identifiants (points de code) des glyphes. */
function lireVarint(o, pos) { let r = 0, d = 0, b; do { b = o[pos++]; r += (b & 0x7f) * 2 ** d; d += 7; } while (b & 0x80); return [r, pos]; }
function decoderGlyphes(octets) {
  const sortie = { nom: null, plage: null, ids: new Set() };
  const lireChamps = (o, debut, fin, f) => {
    let pos = debut;
    while (pos < fin) {
      let tag; [tag, pos] = lireVarint(o, pos);
      const champ = tag >> 3, type = tag & 7;
      if (type === 0) { let v; [v, pos] = lireVarint(o, pos); f(champ, v, null); }
      else if (type === 2) { let n; [n, pos] = lireVarint(o, pos); f(champ, null, [pos, pos + n]); pos += n; }
      else throw new Error('type protobuf inattendu : ' + type);
    }
  };
  lireChamps(octets, 0, octets.length, (champ, v, bloc) => {
    if (champ !== 1) return;                       // un `fontstack`
    lireChamps(octets, bloc[0], bloc[1], (c, w, b) => {
      if (c === 1) sortie.nom = Buffer.from(octets.subarray(b[0], b[1])).toString('utf8');
      else if (c === 2) sortie.plage = Buffer.from(octets.subarray(b[0], b[1])).toString('utf8');
      else if (c === 3) lireChamps(octets, b[0], b[1], (g, id) => { if (g === 1) sortie.ids.add(id); });   // un `glyph` : son id
    });
  });
  return sortie;
}
const glyphes = (plage) => decoderGlyphes(fs.readFileSync(path.join(POLICES, STACK, plage + '.pbf')));

test('chaque fichier de glyphes est celui qu\'il dit être : police, plage, et il contient des glyphes', () => {
  for (const plage of PLAGES) {
    const g = glyphes(plage);
    // le nom écrit dans le fichier est une pile composée : Noto Sans en tête, puis d'autres polices Noto (voir verrou.json)
    assert.ok(g.nom.startsWith(STACK + ', Noto '), plage + ' : ' + g.nom.slice(0, 60)); assert.ok(g.nom.split(', ').every((n) => n.startsWith('Noto ')), plage + ' : une police hors Noto dans la pile'); assert.equal(g.plage, plage);
    assert.ok(g.ids.size > 50, plage + ' : ' + g.ids.size + ' glyphes');
  }
});

test('les caractères du français courant sont dans les trois plages : accents, œ, apostrophe et tirets typographiques', () => {
  const dans = (plage, texte) => { const g = glyphes(plage); for (const ch of texte) assert.ok(g.ids.has(ch.codePointAt(0)), plage + ' : « ' + ch + ' » (U+' + ch.codePointAt(0).toString(16) + ')'); };
  dans('0-255', 'éèêëàâäôöîïûùüçÉÈÊÀÂÔÎÇ abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.,;:!?()/&\'"«»°');
  dans('256-511', 'œŒ');
  dans('8192-8447', '’‘–—…');
});

test('les noms des données embarquées (pays, régions, départements) n\'utilisent que des caractères de la plage 0-255, qu\'elle porte', () => {
  const g = glyphes('0-255'); const dossier = path.join(ATLAS, 'lib', 'bi', 'donnees'); const manques = new Set(); let textes = 0;
  const parcourir = (o, cle) => {
    if (typeof o === 'string') { if (/^(nom|name|libelle|label)/i.test(cle || '')) { textes++; for (const ch of o) { const c = ch.codePointAt(0); if (c > 255 || !g.ids.has(c)) manques.add(ch); } } }
    else if (Array.isArray(o)) o.forEach((x) => parcourir(x, cle));
    else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) parcourir(v, k);
  };
  for (const f of fs.readdirSync(dossier).filter((x) => x.endsWith('.json'))) parcourir(JSON.parse(fs.readFileSync(path.join(dossier, f), 'utf8')), '');
  assert.ok(textes > 300, 'des noms ont été examinés : ' + textes);
  assert.deepEqual([...manques], [], 'caractères sans glyphe');
});

test('le verrou donne la taille et l\'empreinte SHA-384 de chaque fichier, et la licence accompagne la police', () => {
  const v = JSON.parse(fs.readFileSync(path.join(POLICES, 'verrou.json'), 'utf8'));
  assert.equal(v.police, STACK); assert.match(v.licence, /SIL Open Font License 1\.1 ou Apache License 2\.0/);
  assert.deepEqual(v.pile, glyphes('0-255').nom.split(', '), 'la pile notée est celle que les fichiers annoncent'); assert.equal(v.pile[0], STACK);
  assert.deepEqual(Object.keys(v.fichiers).sort(), PLAGES.map((p) => STACK + '/' + p + '.pbf').sort(), 'toutes les plages, et seulement elles');
  for (const [f, e] of Object.entries(v.fichiers)) {
    const o = fs.readFileSync(path.join(POLICES, f));
    assert.equal(o.length, e.octets, f); assert.equal('sha384-' + crypto.createHash('sha384').update(o).digest('base64'), e.integrite, f);
    assert.match(e.origine, /^https:\/\/tiles\.openfreemap\.org\/fonts\//, f + ' : origine notée');
  }
  const ofl = fs.readFileSync(path.join(POLICES, 'LICENCE-OFL.txt'), 'utf8');
  assert.match(ofl, /SIL OPEN FONT LICENSE Version 1\.1/); assert.match(ofl, /Copyright 2022 The Noto Project Authors/);
  assert.ok(!/Reserved Font Name[^\n]*Noto/i.test(ofl.split('PREAMBLE')[0]), 'aucun nom réservé déclaré dans l\'avis de copyright');
  const apache = fs.readFileSync(path.join(POLICES, 'LICENCE-APACHE-2.0.txt'), 'utf8'); assert.match(apache, /Apache License\s+Version 2\.0, January 2004/);
  const lisezmoi = fs.readFileSync(path.join(POLICES, 'LISEZMOI.md'), 'utf8'); assert.match(lisezmoi, /LICENCE-OFL\.txt/); assert.match(lisezmoi, /LICENCE-APACHE-2\.0\.txt/); assert.match(lisezmoi, /Non vérifié/);
});

test('l\'adresse des glyphes des fonds sans polices propres est celle de la copie : absolue, avec {fontstack} et {range} intacts, et chaque fichier visé existe', () => {
  assert.equal(STYLE_AUCUN_FOND.glyphs, GLYPHES_EMBARQUES); assert.equal(STYLE_HORS_RESEAU.glyphs, GLYPHES_EMBARQUES);
  assert.match(GLYPHES_EMBARQUES, /^(file|https?):\/\/.*\/lib\/bi\/polices\/\{fontstack\}\/\{range\}\.pbf$/, 'absolue, jetons non encodés');
  for (const plage of PLAGES) {
    const url = GLYPHES_EMBARQUES.replace('{fontstack}', encodeURIComponent(STACK)).replace('{range}', plage);   // comme le fait MapLibre
    assert.ok(fs.existsSync(fileURLToPath(new URL(url))), url);
  }
});

test('plus aucune adresse de serveur de démonstration pour les polices : ni dans les modules, ni dans l\'application, ni dans les pages', () => {
  const lister = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'polices' || e.name === 'donnees' ? [] : lister(path.join(d, e.name))) : [path.join(d, e.name)]));
  const fichiers = [...lister(path.join(ATLAS, 'lib')).filter((f) => /\.(js|css)$/.test(f)), ...['app_v7.js', 'index_v7.html', 'index_bi.html'].map((f) => path.join(ATLAS, f))];
  for (const f of fichiers) assert.ok(!/demotiles\.maplibre\.org/.test(fs.readFileSync(f, 'utf8')), path.relative(ATLAS, f));
});

test('le fond par défaut garde les polices de son fournisseur : seul le fond sans polices propres passe par les glyphes embarqués', () => {
  assert.match(STYLE_BASE_URL, /^https:\/\/tiles\.openfreemap\.org\/styles\//);
  assert.ok(!('glyphs' in { url: STYLE_BASE_URL }), 'le style de base est une adresse : ses polices viennent de lui');
});

/**
 * unlit -> PBR, et l'attribution inscrite dans le fichier.
 *
 * Un materiau `KHR_materials_unlit` ignore toute lumiere : three.js le charge en
 * MeshBasicMaterial, qui ne recoit ni ne projette d'ombre. Le modele garderait
 * le meme aspect a midi et a minuit — or c'est le soleil que la demo montre.
 *
 * L'attribution va dans `asset.copyright` plutot que dans un README seul : elle
 * voyage alors avec le fichier, y compris si quelqu'un le recupere isolement.
 * C'est une condition de la licence CC BY, pas une politesse.
 */
import fs from 'fs';

const [, , entree, sortie] = process.argv;
const buf = fs.readFileSync(entree);

const lgJson = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + lgJson).toString('utf8'));
const binOffset = 20 + lgJson;
const bin = buf.slice(binOffset + 8); // saute l'en-tete du chunk BIN

json.asset = json.asset || {};
json.asset.copyright =
  'La Cascade (cascade des Aygalades, Marseille) par M.Dailly — '
  + 'https://sketchfab.com/3d-models/la-cascade-820f7441157546949d07e3ce52b2287a — '
  + 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). '
  + 'Modifie : materiau unlit converti en PBR pour recevoir l\'eclairage.';

let convertis = 0;
for (const mat of json.materials || []) {
  if (mat.extensions?.KHR_materials_unlit) {
    delete mat.extensions.KHR_materials_unlit;
    if (!Object.keys(mat.extensions).length) delete mat.extensions;
    mat.pbrMetallicRoughness = mat.pbrMetallicRoughness || {};
    // Roche et eau : aucun metal, surface tres diffuse. La texture porte deja
    // l'ombrage cuit par la photogrammetrie ; un roughness bas y ajouterait des
    // reflets speculaires que la pierre n'a pas.
    mat.pbrMetallicRoughness.metallicFactor = 0;
    mat.pbrMetallicRoughness.roughnessFactor = 0.95;
    mat.doubleSided = true; // un scan a des trous ; sans cela on voit au travers
    convertis++;
  }
}
json.extensionsUsed = (json.extensionsUsed || []).filter((e) => e !== 'KHR_materials_unlit');
if (!json.extensionsUsed.length) delete json.extensionsUsed;

// Reassemblage : chaque chunk est aligne sur 4 octets — JSON complete par des
// espaces, BIN par des zeros. Un padding faux rend le fichier illisible.
const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
const padJson = (4 - (jsonBuf.length % 4)) % 4;
const jsonPad = Buffer.concat([jsonBuf, Buffer.alloc(padJson, 0x20)]);
const padBin = (4 - (bin.length % 4)) % 4;
const binPad = Buffer.concat([bin, Buffer.alloc(padBin, 0)]);

const total = 12 + 8 + jsonPad.length + 8 + binPad.length;
const out = Buffer.alloc(total);
out.write('glTF', 0, 'ascii');
out.writeUInt32LE(2, 4);
out.writeUInt32LE(total, 8);
out.writeUInt32LE(jsonPad.length, 12);
out.write('JSON', 16, 'ascii');
jsonPad.copy(out, 20);
const o = 20 + jsonPad.length;
out.writeUInt32LE(binPad.length, o);
out.write('BIN\0', o + 4, 'ascii');
binPad.copy(out, o + 8);

fs.writeFileSync(sortie, out);
console.log(`  materiaux convertis : ${convertis}`);
console.log(`  ${(buf.length / 1048576).toFixed(2)} Mo -> ${(out.length / 1048576).toFixed(2)} Mo`);

/**
 * Rejoue, hors telephone, l'envoi d'une photo tel que l'application le fait.
 *
 * Dans l'APK, `fetch` est remplace par le client HTTP natif de Capacitor : le
 * corps multipart n'est pas celui du navigateur, il est reconstruit en Java
 * (`CapacitorHttpUrlConnection.writeFormDataRequestBody`, Capacitor 6.2). Quand
 * l'instance repond 500, on ne sait pas si c'est ce corps-la, le fichier, ou
 * l'instance. Ce script envoie la MEME photo de trois facons et affiche chaque
 * reponse en entier :
 *
 *   1. comme l'application — octet pour octet, en-tetes compris ;
 *   2. comme un navigateur — multipart standard, pour comparaison ;
 *   3. comme l'application, mais sans type de fichier — certains selecteurs
 *      Android rendent un `File` dont `type` est vide.
 *
 * Usage (la cle se lit dans l'environnement, pour ne pas finir dans
 * l'historique du terminal) :
 *
 *   ATLAS_CLE=... node scripts/essai-piece-jointe.mjs \
 *       --instance https://grist.numerique.gouv.fr --doc <docId> --photo photo.jpg
 *
 * Chaque essai qui reussit ajoute une piece jointe au document, non rattachee
 * a une ligne : Grist retire d'elle-meme les pieces jointes orphelines.
 */
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

function arg(nom) {
  const i = process.argv.indexOf(`--${nom}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const instance = String(arg('instance') || '').replace(/\/+$/, '');
const doc = arg('doc');
const chemin = arg('photo');
const cle = process.env.ATLAS_CLE;
if (!instance || !doc || !chemin || !cle) {
  console.error('Usage : ATLAS_CLE=... node essai-piece-jointe.mjs --instance <url> --doc <docId> --photo <fichier>');
  process.exit(2);
}

const octets = await readFile(chemin);
const nom = basename(chemin);
const type = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic' }[extname(chemin).toLowerCase()] || 'application/octet-stream';
const url = `${instance}/api/docs/${doc}/attachments`;
console.log(`Photo : ${nom} — ${octets.length} octets, ${type}\nCible : ${url}\n`);

/** Le corps tel que l'ecrit Capacitor 6.2 cote Android. */
function corpsCommeCapacitor(frontiere, typeFichier) {
  const fin = '\r\n';
  const tete = `--${frontiere}${fin}`
    + `Content-Disposition: form-data; name="upload"; filename="${nom}"${fin}`
    + `Content-Type: ${typeFichier}${fin}`
    + `Content-Transfer-Encoding: binary${fin}`
    + fin;
  // `DataOutputStream.writeBytes` ne garde que l'octet bas de chaque caractere :
  // on reproduit ce comportement, accents du nom de fichier compris.
  const latin = (t) => Buffer.from([...t].map((c) => c.charCodeAt(0) & 0xff));
  return Buffer.concat([latin(tete), octets, latin(`${fin}--${frontiere}--${fin}`)]);
}

async function essai(titre, init) {
  try {
    const r = await fetch(url, { method: 'POST', ...init });
    const texte = await r.text();
    console.log(`${titre}\n  HTTP ${r.status}\n  ${texte.slice(0, 600) || '(corps vide)'}\n`);
  } catch (e) {
    console.log(`${titre}\n  echec reseau : ${e.message}\n`);
  }
}

const frontiere = '----WebKitFormBoundary' + Math.random().toString(36).slice(2, 18);
const entetesApp = (f) => ({
  authorization: `Bearer ${cle}`,
  'content-type': `multipart/form-data; boundary=${f}`,
});

await essai('1. Comme l\'application (Capacitor)', {
  headers: entetesApp(frontiere), body: corpsCommeCapacitor(frontiere, type),
});

const fd = new FormData();
fd.append('upload', new Blob([octets], { type }), nom);
await essai('2. Comme un navigateur (multipart standard)', {
  headers: { authorization: `Bearer ${cle}` }, body: fd,
});

await essai('3. Comme l\'application, sans type de fichier', {
  headers: entetesApp(frontiere), body: corpsCommeCapacitor(frontiere, ''),
});

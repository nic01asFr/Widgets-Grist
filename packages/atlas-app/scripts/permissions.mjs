/**
 * Declare dans l'APK ce dont le releve de terrain a besoin.
 *
 * `cap add android` ne declare que l'acces a Internet. Or Capacitor relaie les
 * demandes de la page — position, prise de vue, micro — vers Android, qui
 * REFUSE d'office une permission que le manifeste ne declare pas. Resultat
 * mesure sur l'APK du 18/09/2026 : « Me localiser » et « Le plus proche » ne
 * pouvaient pas marcher, et la prise de vue n'etait pas proposee.
 *
 * | Permission              | Pour                                              |
 * |-------------------------|---------------------------------------------------|
 * | position (fine, approx.)| « Me localiser », l'objet le plus proche          |
 * | appareil photo          | « Prendre une photo » dans une fiche              |
 * | micro (+ reglages audio)| l'enregistrement de notes vocales, a venir        |
 *
 * Declarer n'est pas demander : Android pose la question a la PREMIERE
 * utilisation — quand on touche « Me localiser », « Prendre une photo » — et
 * pas au lancement. C'est la regle de la plateforme, et une demande groupee au
 * demarrage, sans contexte, se voit surtout refusee.
 *
 * Les materiels sont declares `required="false"` : une tablette sans GPS ni
 * appareil photo doit pouvoir installer l'application et s'en servir sans.
 *
 * Le dossier `android/` est regenere a chaque construction : ce script passe
 * apres `cap add` / `cap sync`, et ne cree jamais de doublon.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PERMISSIONS = Object.freeze([
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
]);

export const MATERIELS = Object.freeze([
  'android.hardware.location.gps',
  'android.hardware.camera',
  'android.hardware.microphone',
]);

/**
 * Le manifeste, complete de ce qui manque. Rien n'est retire, rien n'est
 * double : relancer le script sur son propre resultat ne change rien.
 */
export function ajouterPermissions(xml) {
  if (typeof xml !== 'string' || !xml.includes('</manifest>')) {
    throw new Error('Manifeste Android illisible : balise </manifest> absente');
  }
  const deja = (motif) => new RegExp(`android:name="${motif.replace(/\./g, '\\.')}"`).test(xml);
  const lignes = [];
  for (const p of PERMISSIONS) {
    if (!deja(p)) lignes.push(`    <uses-permission android:name="${p}" />`);
  }
  for (const m of MATERIELS) {
    if (!deja(m)) lignes.push(`    <uses-feature android:name="${m}" android:required="false" />`);
  }
  if (!lignes.length) return xml;
  const bloc = `    <!-- Releve de terrain : position, prise de vue, micro (scripts/permissions.mjs) -->\n${lignes.join('\n')}\n`;
  return xml.replace('</manifest>', `${bloc}</manifest>`);
}

async function main() {
  const ici = dirname(fileURLToPath(import.meta.url));
  const chemin = join(ici, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  if (!existsSync(chemin)) {
    throw new Error(`${chemin} introuvable — lancer d'abord « npx cap add android »`);
  }
  const avant = await readFile(chemin, 'utf8');
  const apres = ajouterPermissions(avant);
  if (apres === avant) {
    console.log('Permissions deja declarees.');
    return;
  }
  await writeFile(chemin, apres);
  console.log('Permissions declarees :', [...PERMISSIONS, ...MATERIELS].filter((n) => !avant.includes(n)).join(', '));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('Permissions :', e.message); process.exit(1); });
}

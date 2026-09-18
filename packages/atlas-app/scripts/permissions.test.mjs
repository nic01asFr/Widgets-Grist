import test from 'node:test';
import assert from 'node:assert/strict';
import { ajouterPermissions, PERMISSIONS, MATERIELS } from './permissions.mjs';

/** Le manifeste tel que `cap add android` le produit (Capacitor 6). */
const GABARIT = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="@string/app_name">
    </application>

    <!-- Permissions -->

    <uses-permission android:name="android.permission.INTERNET" />
</manifest>
`;

test('le manifeste recoit position, appareil photo et micro', () => {
  const xml = ajouterPermissions(GABARIT);
  for (const p of PERMISSIONS) assert.ok(xml.includes(`android:name="${p}"`), p);
  assert.ok(xml.includes('android.permission.INTERNET'), 'rien n est retire');
});

test('les materiels sont facultatifs : un appareil sans GPS s installe quand meme', () => {
  const xml = ajouterPermissions(GABARIT);
  for (const m of MATERIELS) {
    assert.match(xml, new RegExp(`<uses-feature android:name="${m.replace(/\./g, '\\.')}" android:required="false" />`));
  }
});

test('relancer le script ne double rien', () => {
  const une = ajouterPermissions(GABARIT);
  assert.equal(ajouterPermissions(une), une);
  assert.equal(une.split('android.permission.CAMERA').length - 1, 1);
});

test('une permission deja declaree n est pas repetee', () => {
  const avecCamera = GABARIT.replace('</manifest>',
    '    <uses-permission android:name="android.permission.CAMERA" />\n</manifest>');
  const xml = ajouterPermissions(avecCamera);
  assert.equal(xml.split('android.permission.CAMERA').length - 1, 1);
  assert.ok(xml.includes('android.permission.RECORD_AUDIO'));
});

test('un manifeste illisible leve, au lieu d un APK sans permissions', () => {
  assert.throws(() => ajouterPermissions('<pas-un-manifeste/>'), /illisible/);
});

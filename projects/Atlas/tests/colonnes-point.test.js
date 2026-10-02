import test from 'node:test';
import assert from 'node:assert/strict';
import { colonnesPointDepuisSchema, geoTablesDepuisSchema } from '../lib/geo-tables.js';

test('un point prend les colonnes de donnees, pas les formules qui les recopient', () => {
  // Forme reelle : Latitude_WGS84 (donnees), latitude = $Latitude_WGS84 (formule).
  const cols = [
    { colId: 'Nom' }, { colId: 'Coordonnees' },
    { colId: 'Latitude_WGS84' }, { colId: 'Longitude_WGS84' },
    { colId: 'latitude', isFormula: true }, { colId: 'longitude', isFormula: true },
  ];
  assert.deepEqual(colonnesPointDepuisSchema(cols), { lat: 'Latitude_WGS84', lng: 'Longitude_WGS84' });
  const [t] = geoTablesDepuisSchema({ Ouvrages: cols });
  assert.deepEqual(t.geometryColumn, { lat: 'Latitude_WGS84', lng: 'Longitude_WGS84' });
});

test('noms exacts d’abord ; formules seulement faute de mieux ; une colonne unique garde la priorite', () => {
  assert.deepEqual(colonnesPointDepuisSchema([{ colId: 'latitude' }, { colId: 'longitude' }, { colId: 'lat_gps' }, { colId: 'lon_gps' }]),
    { lat: 'latitude', lng: 'longitude' });
  assert.deepEqual(colonnesPointDepuisSchema([{ colId: 'latitude', isFormula: true }, { colId: 'longitude', isFormula: true }]),
    { lat: 'latitude', lng: 'longitude' }, 'lisible a defaut d’etre ecrivable');
  assert.equal(colonnesPointDepuisSchema([{ colId: 'Nom' }, { colId: 'Plateforme' }]), null, 'plateforme n’est pas une latitude');
  const [t] = geoTablesDepuisSchema({ Domaines: [{ colId: 'WKT' }, { colId: 'latitude' }, { colId: 'longitude' }] });
  assert.equal(t.geometryColumn, 'WKT');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dbBadgeText, dbBadgeClass, moduleDatabases, resultsCount, engineName } from '../public/js/format.js';

test('odznaka bazy: silnik i wersja', () => {
  assert.equal(dbBadgeText({ engine: 'oracle', version: '19c' }), 'Oracle 19c');
  assert.equal(dbBadgeText({ engine: 'postgres', version: '16' }), 'PostgreSQL 16');
  assert.equal(dbBadgeText({ engine: 'postgres', version: null }), 'PostgreSQL');
  assert.equal(engineName('inny'), 'inny');
});

test('klasa odznaki wg silnika', () => {
  assert.equal(dbBadgeClass({ engine: 'oracle' }), 'badge-oracle');
  assert.equal(dbBadgeClass({ engine: 'postgres' }), 'badge-postgres');
  assert.equal(dbBadgeClass({ engine: 'x' }), '');
});

test('bazy modułu wg database_ids', () => {
  const client = { databases: [{ id: 1, engine: 'oracle', version: '19c' }, { id: 2, engine: 'postgres', version: '16' }] };
  assert.deepEqual(moduleDatabases(client, { database_ids: [2] }).map((d) => d.id), [2]);
  assert.deepEqual(moduleDatabases(client, { database_ids: [] }), []);
  assert.deepEqual(moduleDatabases(client, {}), []);
});

test('licznik wyników po polsku', () => {
  assert.equal(resultsCount(0), '0 wyników');
  assert.equal(resultsCount(1), '1 wynik');
  assert.equal(resultsCount(3), '3 wyniki');
  assert.equal(resultsCount(5), '5 wyników');
  assert.equal(resultsCount(12), '12 wyników');
  assert.equal(resultsCount(22), '22 wyniki');
});

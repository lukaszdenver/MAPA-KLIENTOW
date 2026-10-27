import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState, stateFromClient, addDatabase, removeDatabase, setModuleSelected,
  setModuleDatabase, setModuleFeature, validate, toPayload,
} from '../public/js/client-form-model.js';

test('walidacja: nazwa i wersja bazy wymagane', () => {
  const s = emptyState();
  assert.deepEqual(validate(s), ['Podaj nazwę klienta.']);
  s.name = '  Klient ';
  addDatabase(s);
  assert.deepEqual(validate(s), ['Baza 1: podaj wersję.']);
  s.databases[0].version = '19c';
  assert.deepEqual(validate(s), []);
});

test('duplikat silnik+wersja w jednym kliencie jest dozwolony', () => {
  const s = emptyState();
  s.name = 'K';
  addDatabase(s, { version: '19c' });
  addDatabase(s, { version: '19c' });
  assert.deepEqual(validate(s), []);
});

test('nowe bazy mapują się na new:<indeks>', () => {
  const s = emptyState();
  s.name = ' K ';
  const a = addDatabase(s, { engine: 'oracle', version: '19c', label: ' prod ' });
  const b = addDatabase(s, { engine: 'postgres', version: '16' });
  setModuleSelected(s, 5, true);
  setModuleDatabase(s, 5, a, true);
  setModuleDatabase(s, 5, b, true);
  setModuleFeature(s, 5, 9, true);
  const p = toPayload(s);
  assert.equal(p.id, undefined);
  assert.equal(p.name, 'K');
  assert.deepEqual(p.databases, [
    { engine: 'oracle', version: '19c', label: 'prod' },
    { engine: 'postgres', version: '16', label: '' },
  ]);
  assert.deepEqual(p.modules, [{ module_id: 5, database_refs: ['new:0', 'new:1'], feature_ids: [9] }]);
});

test('usunięcie bazy usuwa ją z modułów; istniejące -> id, nowe -> new:<indeks po usunięciu>', () => {
  const client = {
    id: 7, name: 'K', notes: null,
    databases: [{ id: 100, engine: 'oracle', version: '19c', label: null }, { id: 101, engine: 'postgres', version: '16', label: 'x' }],
    modules: [{ id: 1, module: { id: 5, code: 'FK', name: 'FK' }, database_ids: [100, 101], features: [{ id: 3, name: 'f' }] }],
  };
  const s = stateFromClient(client);
  const n1 = addDatabase(s, { version: '15', engine: 'postgres' });
  setModuleDatabase(s, 5, n1, true);
  removeDatabase(s, s.databases[0].key);
  const p = toPayload(s);
  assert.equal(p.id, 7);
  assert.deepEqual(p.databases.map((d) => d.id), [101, undefined]);
  assert.deepEqual(p.modules[0].database_refs, [101, 'new:1']);
  assert.deepEqual(p.modules[0].feature_ids, [3]);
});

test('usunięcie nowej bazy ze środka przesuwa indeksy kolejnych', () => {
  const s = emptyState();
  s.name = 'K';
  const a = addDatabase(s, { version: '1' });
  const b = addDatabase(s, { version: '2' });
  const c = addDatabase(s, { version: '3' });
  setModuleSelected(s, 1, true);
  [a, b, c].forEach((k) => setModuleDatabase(s, 1, k, true));
  removeDatabase(s, b);
  assert.deepEqual(toPayload(s).modules[0].database_refs, ['new:0', 'new:1']);
});

test('toggle jest idempotentny, odznaczenie modułu go usuwa', () => {
  const s = emptyState();
  const a = addDatabase(s);
  setModuleSelected(s, 2, true);
  setModuleSelected(s, 2, true);
  setModuleDatabase(s, 2, a, true);
  setModuleDatabase(s, 2, a, true);
  setModuleFeature(s, 2, 4, true);
  setModuleFeature(s, 2, 4, true);
  assert.equal(s.modules.length, 1);
  assert.deepEqual(s.modules[0].db_keys, [a]);
  assert.deepEqual(s.modules[0].feature_ids, [4]);
  setModuleFeature(s, 2, 4, false);
  assert.deepEqual(s.modules[0].feature_ids, []);
  setModuleSelected(s, 2, false);
  assert.equal(s.modules.length, 0);
});

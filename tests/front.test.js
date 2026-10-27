import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterClients, sortClients } from '../public/js/filter.js';
import { changedSections } from '../public/js/diff.js';

const PLZ = { id: 1, code: 'PLZ', name: 'Planowanie budżetu zadaniowego' };
const FK = { id: 2, code: 'FK', name: 'Finansowo-Księgowy' };
const KP = { id: 3, code: 'KP', name: 'Kadry i Płace' };

const fixtures = [
  {
    id: 10, name: 'Miasto Łódź Demo', notes: 'Klient testowy',
    databases: [
      { id: 100, engine: 'oracle', version: '19c', label: 'produkcja' },
      { id: 101, engine: 'postgres', version: '16', label: null },
    ],
    modules: [
      { id: 1000, module: PLZ, database_ids: [100], features: [{ id: 1, name: 'Eksport do Bestii' }] },
      { id: 1001, module: FK, database_ids: [101], features: [] },
    ],
  },
  {
    id: 11, name: 'Gmina Alfa', notes: '',
    databases: [{ id: 110, engine: 'oracle', version: '12c', label: null }],
    modules: [{ id: 1100, module: KP, database_ids: [110], features: [] }],
  },
  {
    id: 12, name: 'Powiat Zeta', notes: null,
    databases: [{ id: 120, engine: 'oracle', version: '19c', label: 'test' }],
    modules: [{ id: 1200, module: PLZ, database_ids: [120], features: [] }],
  },
  {
    id: 13, name: 'Starostwo Beta', notes: '',
    databases: [{ id: 130, engine: 'postgres', version: '15', label: null }],
    modules: [],
  },
];

const names = (list) => list.map((c) => c.name);
const clone = (o) => structuredClone(o);

// ---- filterClients ----

test('filterClients: „łódź” znajduje „Miasto Łódź Demo”', () => {
  assert.deepEqual(names(filterClients(fixtures, 'łódź')), ['Miasto Łódź Demo']);
});

test('filterClients: „LODZ” (bez polskich znaków, wielkie litery) też znajduje', () => {
  assert.deepEqual(names(filterClients(fixtures, 'LODZ')), ['Miasto Łódź Demo']);
});

test('filterClients: „plz” znajduje klientów z modułem PLZ', () => {
  assert.deepEqual(names(filterClients(fixtures, 'plz')), ['Miasto Łódź Demo', 'Powiat Zeta']);
});

test('filterClients: dopasowanie po nazwie modułu („kadry”)', () => {
  assert.deepEqual(names(filterClients(fixtures, 'kadry')), ['Gmina Alfa']);
});

test('filterClients: „oracle 19c” znajduje tylko klientów z tą wersją', () => {
  assert.deepEqual(names(filterClients(fixtures, 'oracle 19c')), ['Miasto Łódź Demo', 'Powiat Zeta']);
});

test('filterClients: „oracle 19c” nie łapie klienta z Oracle 12c + PostgreSQL 19c (słowa w różnych bazach)', () => {
  const mixed = {
    id: 14, name: 'Gmina Mieszana', notes: '',
    databases: [
      { id: 140, engine: 'oracle', version: '12c', label: null },
      { id: 141, engine: 'postgres', version: '19c', label: null },
    ],
    modules: [],
  };
  assert.deepEqual(names(filterClients([...fixtures, mixed], 'oracle 19c')), ['Miasto Łódź Demo', 'Powiat Zeta']);
  assert.deepEqual(names(filterClients([...fixtures, mixed], 'oracle 12c')), ['Gmina Alfa', 'Gmina Mieszana']);
});

test('filterClients: słowa w dowolnej kolejności w obrębie jednego pola („demo łódź”, „19c oracle”)', () => {
  assert.deepEqual(names(filterClients(fixtures, 'demo łódź')), ['Miasto Łódź Demo']);
  assert.deepEqual(names(filterClients(fixtures, '19c oracle')), ['Miasto Łódź Demo', 'Powiat Zeta']);
});

test('filterClients: zapytania mieszane — „łódź plz” i „plz oracle 19c”', () => {
  const mixed = {
    id: 14, name: 'Gmina Mieszana', notes: '',
    databases: [
      { id: 140, engine: 'oracle', version: '12c', label: null },
      { id: 141, engine: 'postgres', version: '19c', label: null },
    ],
    modules: [{ id: 1400, module: PLZ, database_ids: [140], features: [] }],
  };
  const all = [...fixtures, mixed];
  assert.deepEqual(names(filterClients(all, 'łódź plz')), ['Miasto Łódź Demo']);
  assert.deepEqual(names(filterClients(all, 'plz oracle 19c')), ['Miasto Łódź Demo', 'Powiat Zeta']);
  assert.deepEqual(names(filterClients(all, 'oracle 19c')), ['Miasto Łódź Demo', 'Powiat Zeta']);
});

test('filterClients: klient bez baz nadal znajdowany po nazwie/module', () => {
  const noDb = { id: 15, name: 'Urząd Bez Baz', notes: '', databases: [], modules: [{ id: 1500, module: KP, database_ids: [], features: [] }] };
  assert.deepEqual(names(filterClients([noDb], 'urząd kp')), ['Urząd Bez Baz']);
  assert.deepEqual(names(filterClients([noDb], 'oracle')), []);
});

test('filterClients: kod i nazwa modułu to jedno pole („plz budżet”)', () => {
  assert.deepEqual(names(filterClients(fixtures, 'plz budżet')), ['Miasto Łódź Demo', 'Powiat Zeta']);
});

test('filterClients: „postgresql 15” dopasowuje engine postgres', () => {
  assert.deepEqual(names(filterClients(fixtures, 'postgresql 15')), ['Starostwo Beta']);
});

test('filterClients: pusty query zwraca wszystkich', () => {
  assert.equal(filterClients(fixtures, '').length, fixtures.length);
  assert.equal(filterClients(fixtures, '   ').length, fixtures.length);
});

test('filterClients: brak dopasowań → pusta lista', () => {
  assert.deepEqual(filterClients(fixtures, 'xyz-nie-ma'), []);
});

// ---- sortClients ----

test('sortClients: ulubiony „Zeta” przed „Alfa”, reszta alfabetycznie', () => {
  const sorted = names(sortClients(fixtures, [12]));
  assert.equal(sorted[0], 'Powiat Zeta');
  assert.ok(sorted.indexOf('Powiat Zeta') < sorted.indexOf('Gmina Alfa'));
  assert.deepEqual(sorted, ['Powiat Zeta', 'Gmina Alfa', 'Miasto Łódź Demo', 'Starostwo Beta']);
});

test('sortClients: nie modyfikuje wejściowej tablicy', () => {
  const input = clone(fixtures);
  sortClients(input, [12]);
  assert.deepEqual(names(input), names(fixtures));
});

// ---- changedSections ----

test('changedSections: before === null → created', () => {
  assert.deepEqual(changedSections(null, fixtures[0]), { event: 'created', sections: [] });
});

test('changedSections: zmiana wersji bazy → [databases]', () => {
  const after = clone(fixtures[0]);
  after.databases[0].version = '21c';
  assert.deepEqual(changedSections(fixtures[0], after), { event: 'updated', sections: ['databases'] });
});

test('changedSections: dodanie funkcji → [features]', () => {
  const after = clone(fixtures[0]);
  after.modules[1].features.push({ id: 7, name: 'Nowa funkcja' });
  assert.deepEqual(changedSections(fixtures[0], after), { event: 'updated', sections: ['features'] });
});

test('changedSections: bez zmian → []', () => {
  assert.deepEqual(changedSections(fixtures[0], clone(fixtures[0])), { event: 'updated', sections: [] });
});

test('changedSections: zmiana nazwy → [details]', () => {
  const after = clone(fixtures[0]);
  after.name = 'Miasto Łódź';
  assert.deepEqual(changedSections(fixtures[0], after).sections, ['details']);
});

test('changedSections: przepięcie modułu na inną bazę → [modules]', () => {
  const after = clone(fixtures[0]);
  after.modules[0].database_ids = [101];
  assert.deepEqual(changedSections(fixtures[0], after).sections, ['modules']);
});

test('changedSections: kolejność baz/modułów i nowe id po zapisie nie są zmianą', () => {
  const after = clone(fixtures[0]);
  after.databases.reverse();
  after.modules.reverse();
  // zapis „zastąp zestaw” nadaje nowe id client_module — treść ta sama
  after.modules.forEach((m, i) => { m.id = 9000 + i; });
  assert.deepEqual(changedSections(fixtures[0], after).sections, []);
});

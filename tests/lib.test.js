import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError, sendError } from '../lib/http.js';
import { assertAdmin } from '../lib/auth.js';
import { validateQuestion, validateNotify } from '../lib/validate.js';
import { buildChangeEmail, buildWaitlistEmail } from '../lib/emails.js';
import { buildSnapshot } from '../lib/snapshot.js';
import { mapClientRow } from '../lib/data.js';

const client = {
  id: 1, name: 'Gmina Test', notes: '',
  databases: [
    { id: 10, engine: 'oracle', version: '19c', label: '' },
    { id: 11, engine: 'postgres', version: '15', label: '' },
  ],
  modules: [{
    id: 100, module: { id: 1, code: 'PLZ', name: 'Planowanie budżetu' },
    database_ids: [10, 11], features: [{ id: 5, name: 'Integracja API' }],
  }],
};

const status = (fn) => { try { fn(); } catch (e) { return e.status; } return null; };

test('assertAdmin', () => {
  assert.equal(status(() => assertAdmin({ role: 'viewer' })), 403);
  assert.equal(status(() => assertAdmin({ role: 'admin' })), null);
});

test('validateQuestion', () => {
  assert.equal(status(() => validateQuestion('')), 400);
  assert.equal(status(() => validateQuestion('a'.repeat(501))), 400);
  assert.equal(validateQuestion('  ok  '), 'ok');
});

test('validateNotify', () => {
  assert.equal(status(() => validateNotify({ event: 'updated', sections: [] })), 400);
  assert.equal(status(() => validateNotify({ clientId: 1, event: 'updated', sections: ['x'] })), 400);
  assert.deepEqual(validateNotify({ clientId: 1, event: 'created', sections: ['modules'] }),
    { clientId: 1, event: 'created', sections: ['modules'] });
});

test('buildChangeEmail', () => {
  const m = buildChangeEmail({ event: 'updated', sections: ['databases', 'modules'], client });
  assert.equal(m.subject, 'Zmiana u klienta: Gmina Test');
  for (const s of ['Bazy danych', 'Oracle 19c', 'PostgreSQL 15', 'Integracja API'])
    assert.ok(m.text.includes(s), s);
  assert.ok(m.text.includes('PLZ – Planowanie budżetu [Oracle 19c, PostgreSQL 15]: funkcje: Integracja API'));
  const h = buildChangeEmail({ event: 'created', sections: [], client: { ...client, name: '<b>x</b>' } });
  assert.equal(h.subject, 'Nowy klient: <b>x</b>');
  assert.ok(!h.html.includes('<b>x</b>'));
  assert.ok(h.html.includes('&lt;b&gt;x&lt;/b&gt;'));
});

test('buildWaitlistEmail', () => {
  const m = buildWaitlistEmail({ email: 'a@b.pl' });
  assert.equal(m.subject, 'Nowa prośba o konto: a@b.pl');
  assert.ok(m.text.includes('Waitlist'));
});

test('buildSnapshot', () => {
  const s = buildSnapshot([client]);
  assert.ok(s.includes('Klient: Gmina Test'));
  assert.ok(s.includes('PLZ(Oracle 19c, PostgreSQL 15)'));
  assert.ok(s.includes('{funkcje: Integracja API}'));
});

test('sendError', () => {
  const res = { status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  sendError(res, new HttpError(403, 'Tylko admin'));
  assert.equal(res.code, 403);
  assert.deepEqual(res.body, { error: 'Tylko admin' });
  sendError(res, new Error('boom'));
  assert.equal(res.code, 500);
  assert.equal(res.body.error, 'Błąd serwera');
});

test('mapClientRow', () => {
  const row = {
    id: 1, name: 'Gmina Test', notes: null,
    client_databases: [{ id: 10, engine: 'oracle', version: '19c', label: null }],
    client_modules: [{
      id: 100, modules: { id: 1, code: 'PLZ', name: 'Planowanie budżetu' },
      client_module_databases: [{ client_database_id: 10 }],
      client_module_features: [{ paid_features: { id: 5, name: 'A' } }],
    }],
  };
  const c = mapClientRow(row);
  assert.equal(c.notes, '');
  assert.deepEqual(c.databases[0], { id: 10, engine: 'oracle', version: '19c', label: '' });
  assert.deepEqual(c.modules[0], { id: 100, module: { id: 1, code: 'PLZ', name: 'Planowanie budżetu' },
    database_ids: [10], features: [{ id: 5, name: 'A' }] });
});

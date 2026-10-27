import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const sql = (f) => readFileSync(new URL(`../supabase/${f}`, import.meta.url), 'utf8');
let db;

before(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth; create role authenticated; create role anon;
    grant usage on schema auth to authenticated, anon;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema public to authenticated, anon;
  `);
  await db.exec(sql('schema.sql'));
  await db.exec(sql('rls.sql'));
  await db.exec(sql('seed.sql'));
});

beforeEach(async () => { await db.exec('reset role'); });

async function asUser(claims) {
  await db.exec('set role authenticated');
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)]);
}
const count = async (t) => Number((await db.query(`select count(*) c from ${t}`)).rows[0].c);

test('seed ładuje się', async () => {
  assert.equal(await count('clients'), 6);
  assert.equal(await count('modules'), 12);
  const r = await db.query(`select 1 from clients where name = 'Miasto Łódź Demo'`);
  assert.equal(r.rows.length, 1);
  const both = await db.query(`
    select c.id from clients c
    join client_databases o on o.client_id=c.id and o.engine='oracle'
    join client_databases p on p.client_id=c.id and p.engine='postgres'
    join client_modules cm on cm.client_id=c.id
    join client_module_databases a on a.client_module_id=cm.id and a.client_database_id=o.id
    join client_module_databases b on b.client_module_id=cm.id and b.client_database_id=p.id`);
  assert.ok(both.rows.length > 0);
});

test('podgląd czyta, nie zapisuje', async () => {
  await asUser({ sub: 'user_v', app_role: 'viewer' });
  assert.ok(await count('clients') > 0);
  await assert.rejects(db.query(`insert into clients(name) values('X')`), /row-level security/i);
  const d = await db.query('delete from clients');
  assert.equal(d.affectedRows, 0);
  assert.equal(await count('clients'), 6);
});

test('admin zapisuje', async () => {
  await asUser({ sub: 'user_a', app_role: 'admin' });
  await db.query(`insert into clients(name) values('Nowy')`);
  const r = await db.query(`select name from clients where name='Nowy'`);
  assert.equal(r.rows.length, 1);
});

test('anon nic nie widzi', async () => {
  await db.exec('set role anon');
  let n = 0;
  try { n = await count('clients'); } catch (e) { assert.match(e.message, /permission denied/i); return; }
  assert.equal(n, 0);
});

test('usunięcie bazy usuwa powiązanie, nie moduł', async () => {
  const link = (await db.query('select * from client_module_databases limit 1')).rows[0];
  const before = await count('client_modules');
  await db.query('delete from client_databases where id = $1', [link.client_database_id]);
  const left = await db.query('select 1 from client_module_databases where client_database_id=$1', [link.client_database_id]);
  assert.equal(left.rows.length, 0);
  assert.equal(await count('client_modules'), before);
});

test('user_prefs tylko z własnym e-mailem', async () => {
  await asUser({ sub: 'user_v', email: 'v@x.pl' });
  await db.query(`insert into user_prefs(clerk_user_id,email) values('user_v','v@x.pl')`);
  await assert.rejects(db.query(`insert into user_prefs(clerk_user_id,email) values('user_v','inny@x.pl')`));
  await assert.rejects(db.query(`insert into user_prefs(clerk_user_id,email) values('user_x','v@x.pl')`));
  await asUser({ sub: 'user_w', email: 'w@x.pl' });
  assert.equal(await count('user_prefs'), 0);
});

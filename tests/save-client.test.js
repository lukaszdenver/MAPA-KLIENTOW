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
  await db.exec('grant all on all tables in schema public to anon');
  await db.exec(sql('rls.sql'));
  await db.exec(sql('seed.sql'));
  await db.exec(sql('save_client.sql'));
});

beforeEach(async () => { await db.exec('reset role'); });

async function asUser(claims) {
  await db.exec('set role authenticated');
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)]);
}
const asAdmin = () => asUser({ sub: 'user_a', app_role: 'admin' });
const asViewer = () => asUser({ sub: 'user_v', app_role: 'viewer' });

const save = async (form) => (await db.query('select public.save_client($1::jsonb) as id', [JSON.stringify(form)])).rows[0].id;
const count = async (t) => Number((await db.query(`select count(*) c from ${t}`)).rows[0].c);
const moduleId = async (code) => (await db.query('select id from modules where code=$1', [code])).rows[0].id;
const featureId = async (code) => (await db.query(
  'select f.id from paid_features f join modules m on m.id=f.module_id where m.code=$1 order by f.id limit 1', [code])).rows[0].id;

/** Stan modułów klienta: kod -> {bazy (engine version), funkcje} */
async function modulesOf(clientId) {
  const r = await db.query(`
    select m.code,
           array(select d.engine || ' ' || d.version from client_module_databases l
                   join client_databases d on d.id = l.client_database_id
                  where l.client_module_id = cm.id order by 1) as dbs,
           array(select paid_feature_id from client_module_features where client_module_id = cm.id order by 1) as features
      from client_modules cm join modules m on m.id = cm.module_id
     where cm.client_id = $1 order by m.code`, [clientId]);
  return r.rows;
}

test('admin tworzy klienta z dwiema nowymi bazami i modułem na obu (new:0, new:1)', async () => {
  await asAdmin();
  const plz = await moduleId('PLZ');
  const feat = await featureId('PLZ');
  const id = await save({
    name: 'Klient RPC', notes: 'test',
    databases: [
      { engine: 'oracle', version: '19c', label: 'prod' },
      { engine: 'postgres', version: '16', label: '' },
    ],
    modules: [{ module_id: plz, database_refs: ['new:0', 'new:1'], feature_ids: [feat] }],
  });
  assert.ok(id > 0);
  const dbs = (await db.query('select engine, version, label from client_databases where client_id=$1 order by engine', [id])).rows;
  assert.deepEqual(dbs, [
    { engine: 'oracle', version: '19c', label: 'prod' },
    { engine: 'postgres', version: '16', label: null },
  ]);
  assert.deepEqual(await modulesOf(id), [{ code: 'PLZ', dbs: ['oracle 19c', 'postgres 16'], features: [feat] }]);
});

test('admin aktualizuje: zmiana wersji bazy, istniejące id zachowane', async () => {
  await asAdmin();
  const plz = await moduleId('PLZ');
  const id = await save({
    name: 'Klient Wersja', databases: [{ engine: 'oracle', version: '12c' }],
    modules: [{ module_id: plz, database_refs: ['new:0'], feature_ids: [] }],
  });
  const dbId = (await db.query('select id from client_databases where client_id=$1', [id])).rows[0].id;
  const again = await save({
    id, name: 'Klient Wersja', databases: [{ id: dbId, engine: 'oracle', version: '19c' }],
    modules: [{ module_id: plz, database_refs: [dbId], feature_ids: [] }],
  });
  assert.equal(again, id);
  const rows = (await db.query('select id, version from client_databases where client_id=$1', [id])).rows;
  assert.deepEqual(rows, [{ id: dbId, version: '19c' }]);
  assert.deepEqual(await modulesOf(id), [{ code: 'PLZ', dbs: ['oracle 19c'], features: [] }]);
});

test('usunięcie bazy wciąż wskazywanej przez moduł → wyjątek, moduły klienta bez zmian', async () => {
  await asAdmin();
  const plz = await moduleId('PLZ');
  const fk = await moduleId('FK');
  const id = await save({
    name: 'Klient Atomowy',
    databases: [{ engine: 'oracle', version: '19c' }, { engine: 'postgres', version: '15' }],
    modules: [
      { module_id: plz, database_refs: ['new:0'], feature_ids: [] },
      { module_id: fk, database_refs: ['new:1'], feature_ids: [] },
    ],
  });
  const dbs = (await db.query('select id, engine from client_databases where client_id=$1 order by engine', [id])).rows;
  const oracleId = dbs[0].id;
  const pgId = dbs[1].id;
  const beforeMods = await modulesOf(id);

  await assert.rejects(
    save({
      id, name: 'Klient Atomowy — zmieniony',
      databases: [{ id: oracleId, engine: 'oracle', version: '21c' }], // usuwa postgres
      modules: [
        { module_id: plz, database_refs: [oracleId], feature_ids: [] },
        { module_id: fk, database_refs: [pgId], feature_ids: [] },  // wciąż wskazuje usuwaną bazę
      ],
    }),
    /nie ma na liście baz klienta/);

  assert.deepEqual(await modulesOf(id), beforeMods);
  assert.equal((await db.query('select name from clients where id=$1', [id])).rows[0].name, 'Klient Atomowy');
  assert.equal(await count(`client_databases where client_id=${Number(id)}`), 2);
});

test('podgląd (viewer) nie może zapisać — ani nowego, ani istniejącego klienta', async () => {
  await asAdmin();
  const existing = (await db.query(`select id from clients where name='Miasto Łódź Demo'`)).rows[0].id;
  const clientsBefore = await count('clients');
  await asViewer();
  await assert.rejects(save({ name: 'Nielegalny', databases: [], modules: [] }), /row-level security/i);
  await assert.rejects(save({ id: existing, name: 'Zmiana', databases: [], modules: [] }), /brak uprawnień/);
  await asAdmin();
  assert.equal(await count('clients'), clientsBefore);
  assert.equal((await db.query('select name from clients where id=$1', [existing])).rows[0].name, 'Miasto Łódź Demo');
});

test('anon nie może wywołać funkcji', async () => {
  await db.exec('set role anon');
  await assert.rejects(save({ name: 'Anon', databases: [], modules: [] }), /permission denied/i);
});

test('błędne odwołania → wyjątek, nic nie zapisane', async () => {
  await asAdmin();
  const plz = await moduleId('PLZ');
  const fkFeature = await featureId('FK');
  const clientsBefore = await count('clients');
  const dbsBefore = await count('client_databases');
  const cases = [
    [{ module_id: plz, database_refs: ['new:5'], feature_ids: [] }],              // indeks poza zakresem
    [{ module_id: plz, database_refs: ['abc'], feature_ids: [] }],                // śmieci
    [{ module_id: plz, database_refs: [999999], feature_ids: [] }],               // nieznane id
    [{ module_id: plz, database_refs: [], feature_ids: [] },
     { module_id: plz, database_refs: [], feature_ids: [] }],                    // duplikat modułu
    [{ module_id: plz, database_refs: ['new:0'], feature_ids: [fkFeature] }],     // funkcja innego modułu
  ];
  for (const modules of cases) {
    await assert.rejects(save({ name: 'Zły', databases: [{ engine: 'oracle', version: '19c' }], modules }));
  }
  await assert.rejects(save({ name: 'Zły', databases: [{ engine: 'mysql', version: '8' }], modules: [] }), /silnik/);
  await assert.rejects(save({ name: '  ', databases: [], modules: [] }), /nazwę/);
  assert.equal(await count('clients'), clientsBefore);
  assert.equal(await count('client_databases'), dbsBefore);
});

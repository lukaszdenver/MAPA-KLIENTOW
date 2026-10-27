// Dostęp do danych (Supabase + RLS). Wszystkie funkcje async, błędy jako Error z polskim komunikatem.
// Kształt Client / Catalog — patrz shared-context (databases, modules[{id, module, database_ids, features}]).
import { getSupabase, getUser } from './app-init.js';

const CLIENT_SELECT = `
  id, name, notes,
  client_databases ( id, engine, version, label ),
  client_modules (
    id,
    module:modules ( id, code, name ),
    client_module_databases ( client_database_id ),
    client_module_features ( paid_feature:paid_features ( id, name ) )
  )`;

const byName = (a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'pl');

/** Zamienia błąd Supabase/PostgREST na Error z czytelnym komunikatem. */
function fail(error, what) {
  const code = error?.code;
  let reason;
  if (code === '42501' || /row-level security|permission denied/i.test(error?.message ?? '')) {
    reason = 'brak uprawnień (wymagana rola admin)';
  } else if (code === '23505') {
    reason = 'taki wpis już istnieje';
  } else if (code === '23503') {
    reason = 'wpis jest powiązany z innymi danymi';
  } else if (code === 'PGRST116') {
    reason = 'nie znaleziono';
  } else if (code === 'PGRST301' || /jwt/i.test(error?.message ?? '')) {
    reason = 'sesja wygasła — zaloguj się ponownie';
  } else {
    // np. komunikat z save_client (raise exception, kod P0001) — już po polsku
    reason = (error?.message || 'nieznany błąd').replace(/\.$/, '');
  }
  const err = new Error(`${what}: ${reason}.`);
  err.cause = error;
  return err;
}

async function run(promise, what) {
  const { data, error } = await promise;
  if (error) throw fail(error, what);
  return data;
}

// UPDATE/DELETE zablokowane przez RLS nie zwraca błędu, tylko 0 wierszy — traktujemy to jako błąd.
async function runOne(promise, what) {
  const rows = await run(promise, what);
  if (!rows?.length) throw new Error(`${what}: nie znaleziono wpisu albo brak uprawnień.`);
  return rows;
}

function userId() {
  const u = getUser();
  if (!u) throw new Error('Nie jesteś zalogowany.');
  return u.id;
}

function toClient(row) {
  const databases = (row.client_databases ?? [])
    .map(({ id, engine, version, label }) => ({ id, engine, version, label }))
    .sort((a, b) => a.engine.localeCompare(b.engine) || String(a.version).localeCompare(String(b.version), 'pl', { numeric: true }) || a.id - b.id);
  const modules = (row.client_modules ?? [])
    .map((cm) => ({
      id: cm.id,
      module: cm.module,
      database_ids: (cm.client_module_databases ?? []).map((l) => l.client_database_id).sort((a, b) => a - b),
      features: (cm.client_module_features ?? []).map((l) => l.paid_feature).filter(Boolean).sort(byName),
    }))
    .sort((a, b) => String(a.module?.code ?? '').localeCompare(String(b.module?.code ?? ''), 'pl'));
  return { id: row.id, name: row.name, notes: row.notes ?? '', databases, modules };
}

// ---------- Klienci ----------

/** @returns {Promise<Client[]>} alfabetycznie */
export async function listClients() {
  const rows = await run(getSupabase().from('clients').select(CLIENT_SELECT).order('name'), 'Nie udało się pobrać listy klientów');
  return rows.map(toClient).sort(byName);
}

/** @returns {Promise<Client>} */
export async function getClient(id) {
  const row = await run(
    getSupabase().from('clients').select(CLIENT_SELECT).eq('id', id).maybeSingle(),
    'Nie udało się pobrać klienta',
  );
  if (!row) throw new Error('Nie znaleziono klienta (mógł zostać usunięty).');
  return toClient(row);
}

/**
 * Zapis „zastąp zestaw” — atomowo, funkcją Postgres `save_client` (supabase/save_client.sql).
 * form = { id?, name, notes,
 *          databases: [{ id?, engine, version, label }],
 *          modules:   [{ module_id, database_refs: (number|string)[], feature_ids: number[] }] }
 * database_refs: id istniejącej bazy (liczba) albo `'new:<i>'` — gdzie i to indeks w form.databases
 * (działa dla nowych baz, które nie mają jeszcze id; dla bazy z id też zwraca jej id).
 * Funkcja waliduje odwołania i przy dowolnym błędzie cofa całość (nic nie zostaje zapisane).
 * @returns {Promise<number>} id klienta
 */
export async function saveClient(form) {
  if (!String(form?.name ?? '').trim()) throw new Error('Podaj nazwę klienta.');
  const id = await run(getSupabase().rpc('save_client', { p: form }), 'Nie udało się zapisać klienta');
  return Number(id);
}

export async function deleteClient(id) {
  await runOne(getSupabase().from('clients').delete().eq('id', id).select('id'), 'Nie udało się usunąć klienta');
}

// ---------- Katalog ----------

/** @returns {Promise<Catalog>} moduły wg kodu, funkcje alfabetycznie */
export async function listCatalog() {
  const rows = await run(
    getSupabase().from('modules').select('id, code, name, paid_features ( id, name )').order('code'),
    'Nie udało się pobrać katalogu modułów',
  );
  return rows.map((m) => ({ id: m.id, code: m.code, name: m.name, features: [...(m.paid_features ?? [])].sort(byName) }));
}

export async function saveModule({ id, code, name }) {
  const values = { code: String(code ?? '').trim().toUpperCase(), name: String(name ?? '').trim() };
  if (!values.code || !values.name) throw new Error('Podaj kod i nazwę modułu.');
  const what = 'Nie udało się zapisać modułu';
  const q = id
    ? getSupabase().from('modules').update(values).eq('id', id).select('id').single()
    : getSupabase().from('modules').insert(values).select('id').single();
  return (await run(q, what)).id;
}

export async function deleteModule(id) {
  await runOne(getSupabase().from('modules').delete().eq('id', id).select('id'), 'Nie udało się usunąć modułu');
}

export async function saveFeature({ id, module_id, name }) {
  const values = { module_id, name: String(name ?? '').trim() };
  if (!values.name) throw new Error('Podaj nazwę funkcji płatnej.');
  const what = 'Nie udało się zapisać funkcji płatnej';
  const q = id
    ? getSupabase().from('paid_features').update(values).eq('id', id).select('id').single()
    : getSupabase().from('paid_features').insert(values).select('id').single();
  return (await run(q, what)).id;
}

export async function deleteFeature(id) {
  await runOne(getSupabase().from('paid_features').delete().eq('id', id).select('id'), 'Nie udało się usunąć funkcji płatnej');
}

// ---------- Preferencje i ulubieni (tylko własne wiersze — RLS po sub) ----------

/**
 * Tworzy rekord user_prefs przy pierwszym logowaniu i odświeża e-mail (RLS wymaga zgodności z JWT).
 * Wysyłamy tylko clerk_user_id + email, więc notify_changes / last_client_id pozostają nietknięte.
 */
export async function ensurePrefs(email) {
  await run(
    getSupabase().from('user_prefs')
      .upsert({ clerk_user_id: userId(), email }, { onConflict: 'clerk_user_id' }),
    'Nie udało się zapisać ustawień użytkownika',
  );
}

/** @returns {Promise<{notify_changes: boolean, last_client_id: number|null}>} */
export async function getPrefs() {
  const row = await run(
    getSupabase().from('user_prefs').select('notify_changes, last_client_id').eq('clerk_user_id', userId()).maybeSingle(),
    'Nie udało się pobrać ustawień',
  );
  return { notify_changes: row?.notify_changes ?? true, last_client_id: row?.last_client_id ?? null };
}

export async function setNotify(on) {
  await runOne(
    getSupabase().from('user_prefs').update({ notify_changes: Boolean(on) }).eq('clerk_user_id', userId()).select('clerk_user_id'),
    'Nie udało się zmienić ustawienia powiadomień',
  );
}

export async function setLastClient(id) {
  await runOne(
    getSupabase().from('user_prefs').update({ last_client_id: id ?? null }).eq('clerk_user_id', userId()).select('clerk_user_id'),
    'Nie udało się zapamiętać ostatniego klienta',
  );
}

/** @returns {Promise<number[]>} id ulubionych klientów */
export async function listFavorites() {
  const rows = await run(
    getSupabase().from('user_favorites').select('client_id').eq('clerk_user_id', userId()),
    'Nie udało się pobrać ulubionych',
  );
  return rows.map((r) => Number(r.client_id));
}

export async function setFavorite(clientId, on) {
  const sb = getSupabase();
  const uid = userId();
  if (on) {
    await run(
      sb.from('user_favorites').upsert({ clerk_user_id: uid, client_id: clientId }, { onConflict: 'clerk_user_id,client_id', ignoreDuplicates: true }),
      'Nie udało się dodać do ulubionych',
    );
  } else {
    await run(
      sb.from('user_favorites').delete().eq('clerk_user_id', uid).eq('client_id', clientId),
      'Nie udało się usunąć z ulubionych',
    );
  }
}

// Model formularza klienta (bez DOM — testowany w Node).
// Stan: { id?, name, notes,
//         databases: [{ key, id?, engine, version, label }],      // key = stabilny identyfikator wiersza w formularzu
//         modules:   [{ module_id, db_keys: string[], feature_ids: number[] }] }
// toPayload(state) → kształt dla saveClient (db.js): database_refs = id istniejącej bazy albo 'new:<indeks>'.

export const ENGINES = [
  { value: 'oracle', label: 'Oracle' },
  { value: 'postgres', label: 'PostgreSQL' },
];

let seq = 0;
const nextKey = () => `k${++seq}`;

export function emptyState() {
  return { id: undefined, name: '', notes: '', databases: [], modules: [] };
}

/** Client (kształt z db.js) → stan formularza. */
export function stateFromClient(client) {
  if (!client) return emptyState();
  const keyById = new Map();
  const databases = (client.databases ?? []).map((d) => {
    const key = nextKey();
    keyById.set(Number(d.id), key);
    return { key, id: d.id, engine: d.engine, version: d.version ?? '', label: d.label ?? '' };
  });
  const modules = (client.modules ?? []).map((cm) => ({
    module_id: cm.module.id,
    db_keys: (cm.database_ids ?? []).map((id) => keyById.get(Number(id))).filter(Boolean),
    feature_ids: (cm.features ?? []).map((f) => f.id),
  }));
  return { id: client.id, name: client.name ?? '', notes: client.notes ?? '', databases, modules };
}

/** Dodaje pustą bazę (domyślnie Oracle); zwraca jej klucz. */
export function addDatabase(state, values = {}) {
  const key = nextKey();
  state.databases.push({ key, engine: 'oracle', version: '', label: '', ...values });
  return key;
}

/** Usuwa bazę i jej odwołania ze wszystkich modułów. */
export function removeDatabase(state, key) {
  state.databases = state.databases.filter((d) => d.key !== key);
  for (const m of state.modules) m.db_keys = m.db_keys.filter((k) => k !== key);
}

export function findModule(state, moduleId) {
  return state.modules.find((m) => Number(m.module_id) === Number(moduleId));
}

/** Zaznacza moduł (domyślnie bez baz i funkcji) albo go odznacza. */
export function setModuleSelected(state, moduleId, selected) {
  const existing = findModule(state, moduleId);
  if (selected && !existing) {
    state.modules.push({ module_id: Number(moduleId), db_keys: [], feature_ids: [] });
  } else if (!selected && existing) {
    state.modules = state.modules.filter((m) => m !== existing);
  }
}

function toggle(list, value, on) {
  const has = list.includes(value);
  if (on && !has) return [...list, value];
  if (!on && has) return list.filter((v) => v !== value);
  return list;
}

export function setModuleDatabase(state, moduleId, dbKey, on) {
  const m = findModule(state, moduleId);
  if (m && state.databases.some((d) => d.key === dbKey)) m.db_keys = toggle(m.db_keys, dbKey, on);
}

export function setModuleFeature(state, moduleId, featureId, on) {
  const m = findModule(state, moduleId);
  if (m) m.feature_ids = toggle(m.feature_ids, Number(featureId), on);
}

/** @returns {string[]} komunikaty błędów (pusta tablica = poprawny). */
export function validate(state) {
  const errors = [];
  if (!String(state.name ?? '').trim()) errors.push('Podaj nazwę klienta.');
  state.databases.forEach((d, i) => {
    if (!String(d.version ?? '').trim()) errors.push(`Baza ${i + 1}: podaj wersję.`);
    if (!ENGINES.some((e) => e.value === d.engine)) errors.push(`Baza ${i + 1}: wybierz silnik.`);
  });
  return errors;
}

/** Stan formularza → argument saveClient(form). */
export function toPayload(state) {
  const indexByKey = new Map(state.databases.map((d, i) => [d.key, i]));
  const databases = state.databases.map((d) => {
    const out = {
      engine: d.engine,
      version: String(d.version ?? '').trim(),
      label: String(d.label ?? '').trim(),
    };
    if (d.id) out.id = d.id;
    return out;
  });
  const modules = state.modules.map((m) => ({
    module_id: m.module_id,
    database_refs: m.db_keys
      .filter((k) => indexByKey.has(k))
      .map((k) => {
        const i = indexByKey.get(k);
        return state.databases[i].id ?? `new:${i}`;
      }),
    feature_ids: [...m.feature_ids],
  }));
  const payload = { name: String(state.name ?? '').trim(), notes: String(state.notes ?? '').trim(), databases, modules };
  if (state.id) payload.id = state.id;
  return payload;
}

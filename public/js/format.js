// Czyste funkcje formatowania dla listy i karty (bez DOM — testowane w Node).

const ENGINE_NAME = { oracle: 'Oracle', postgres: 'PostgreSQL' };

export function engineName(engine) {
  return ENGINE_NAME[engine] ?? String(engine ?? '');
}

/** „Oracle 19c”, „PostgreSQL 16”. */
export function dbBadgeText(db) {
  return `${engineName(db.engine)} ${db.version ?? ''}`.trim();
}

/** Klasa CSS odznaki wg silnika (zdefiniowane w app.css). */
export function dbBadgeClass(db) {
  return db.engine === 'oracle' ? 'badge-oracle' : db.engine === 'postgres' ? 'badge-postgres' : '';
}

/** Bazy klienta przypisane do modułu (wg database_ids), w kolejności bazy klienta. */
export function moduleDatabases(client, clientModule) {
  const ids = new Set((clientModule.database_ids ?? []).map(Number));
  return (client.databases ?? []).filter((db) => ids.has(Number(db.id)));
}

/** „3 wyniki” z poprawną polską odmianą. */
export function resultsCount(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return '1 wynik';
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return `${n} wyniki`;
  return `${n} wyników`;
}

// Czyste funkcje wyszukiwania i sortowania klientów (bez DOM — testowane w Node).

const ENGINE_LABEL = { oracle: 'oracle', postgres: 'postgresql' };

/** Małe litery (pl), bez diakrytyków. „ł” nie rozkłada się w NFD — mapujemy ręcznie. */
export function normalize(text) {
  return String(text ?? '')
    .toLocaleLowerCase('pl')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pola niezwiązane z bazami: nazwa klienta, kod i nazwa każdego modułu. */
function otherFields(client) {
  const fields = [client.name];
  for (const cm of client.modules ?? []) {
    if (cm.module) fields.push(cm.module.code, cm.module.name);
  }
  return fields.map(normalize).filter(Boolean);
}

/** „<oracle|postgresql> <version>” dla każdej bazy osobno. */
function databaseFields(client) {
  return (client.databases ?? []).map((db) =>
    normalize(`${ENGINE_LABEL[db.engine] ?? db.engine} ${db.version ?? ''}`));
}

/**
 * Filtruje klientów po nazwie, kodzie/nazwie modułu i „<engine> <version>”.
 * Klient pasuje, jeśli istnieje JEDNA jego baza D (albo klient nie ma baz), dla której każde słowo
 * zapytania pasuje do nazwy / dowolnego modułu albo do „<engine> <version>” bazy D.
 * Dzięki temu „oracle 19c” nie łapie Oracle 12c + PostgreSQL 19c, a „łódź plz” i „plz oracle 19c” działają.
 * Pusty query → wszyscy.
 */
export function filterClients(clients, query) {
  const q = normalize(query);
  if (!q) return [...clients];
  const tokens = q.split(' ');
  return clients.filter((client) => {
    const other = otherFields(client);
    const dbs = databaseFields(client);
    const candidates = dbs.length ? dbs : [''];
    return candidates.some((d) =>
      tokens.every((t) => d.includes(t) || other.some((f) => f.includes(t))));
  });
}

/** Ulubieni na górze, potem alfabetycznie (pl). Zwraca nową tablicę. */
export function sortClients(clients, favoriteIds = []) {
  const fav = new Set((favoriteIds ?? []).map(Number));
  return [...clients].sort((a, b) => {
    const fa = fav.has(Number(a.id)) ? 0 : 1;
    const fb = fav.has(Number(b.id)) ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'pl');
  });
}

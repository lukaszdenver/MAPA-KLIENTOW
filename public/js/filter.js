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

/** Pola wyszukiwania klienta: nazwa, każda baza osobno, każdy moduł (kod + nazwa) osobno. */
function searchFields(client) {
  const fields = [client.name];
  for (const db of client.databases ?? []) {
    const engine = ENGINE_LABEL[db.engine] ?? db.engine;
    fields.push(`${engine} ${db.version ?? ''}`);
  }
  for (const cm of client.modules ?? []) {
    if (cm.module) fields.push(`${cm.module.code ?? ''} ${cm.module.name ?? ''}`);
  }
  return fields.map(normalize).filter(Boolean);
}

/**
 * Filtruje klientów po nazwie, kodzie/nazwie modułu i „<engine> <version>”.
 * Wszystkie słowa zapytania muszą pasować w obrębie JEDNEGO pola (np. „oracle 19c” — ta sama baza),
 * w dowolnej kolejności. Pusty query → wszyscy.
 */
export function filterClients(clients, query) {
  const q = normalize(query);
  if (!q) return [...clients];
  const tokens = q.split(' ');
  return clients.filter((client) =>
    searchFields(client).some((field) => tokens.every((t) => field.includes(t))));
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

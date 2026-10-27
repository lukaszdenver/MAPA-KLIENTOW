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

/** Teksty, po których można znaleźć klienta. */
function searchFields(client) {
  const fields = [client.name];
  for (const db of client.databases ?? []) {
    const engine = ENGINE_LABEL[db.engine] ?? db.engine;
    fields.push(`${engine} ${db.version ?? ''}`);
  }
  for (const cm of client.modules ?? []) {
    if (cm.module) fields.push(cm.module.code, cm.module.name);
  }
  return fields.map(normalize).filter(Boolean);
}

/**
 * Filtruje klientów po nazwie, kodzie/nazwie modułu i „<engine> <version>”.
 * Pełna fraza pasuje, gdy jest fragmentem jednego pola (np. „oracle 19c”);
 * w przeciwnym razie każde słowo musi pasować do któregoś pola (np. „łódź plz”).
 */
export function filterClients(clients, query) {
  const q = normalize(query);
  if (!q) return [...clients];
  const tokens = q.split(' ');
  return clients.filter((client) => {
    const fields = searchFields(client);
    if (fields.some((f) => f.includes(q))) return true;
    return tokens.every((t) => fields.some((f) => f.includes(t)));
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

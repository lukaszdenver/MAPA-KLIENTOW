// Lista klientów: wyszukiwanie, ulubieni (gwiazdka), sortowanie, licznik, ostatnio otwarty klient.
import { listClients, listFavorites, setFavorite, setLastClient, getPrefs } from './db.js';
import { filterClients, sortClients } from './filter.js';
import { dbBadgeText, dbBadgeClass, resultsCount } from './format.js';

/**
 * @param {HTMLElement} el
 * @param {{ onSelect: (id:number)=>void }} opts
 * @returns {Promise<{ refresh(): Promise<void>, select(id:number): void }>}
 */
export async function mountList(el, { onSelect } = {}) {
  let clients = [];
  let favorites = new Set();
  const pendingFav = new Set(); // id klientów z trwającym żądaniem ulubionego
  let query = '';
  let selectedId = null;

  el.innerHTML = '';
  el.classList.add('client-list');

  const title = document.createElement('div');
  title.className = 'panel-title';
  const h = document.createElement('h2');
  h.textContent = 'Klienci';
  const count = document.createElement('span');
  count.className = 'muted small';
  count.setAttribute('aria-live', 'polite');
  title.append(h, count);

  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Szukaj: klient, moduł, Oracle 19c…';
  search.setAttribute('aria-label', 'Szukaj klienta');
  search.autocomplete = 'off';

  const notice = document.createElement('div');
  notice.setAttribute('role', 'alert');

  const ul = document.createElement('ul');
  ul.className = 'list';

  el.append(title, search, notice, ul);

  function showNotice(message) {
    notice.innerHTML = '';
    if (!message) return;
    const box = document.createElement('div');
    box.className = 'alert alert-error';
    box.textContent = message;
    notice.append(box);
  }

  function render() {
    const visible = sortClients(filterClients(clients, query), [...favorites]);
    count.textContent = resultsCount(visible.length);
    ul.innerHTML = '';
    if (!visible.length) {
      const li = document.createElement('li');
      li.className = 'placeholder';
      li.textContent = clients.length ? 'Brak klientów pasujących do wyszukiwania.' : 'Brak klientów.';
      ul.append(li);
      return;
    }
    for (const c of visible) ul.append(renderItem(c));
  }

  function renderItem(c) {
    const li = document.createElement('li');
    li.className = 'list-item';
    if (c.id === selectedId) li.setAttribute('aria-current', 'true');

    const isFav = favorites.has(Number(c.id));
    const star = document.createElement('button');
    star.type = 'button';
    star.className = 'star';
    star.textContent = isFav ? '★' : '☆';
    star.setAttribute('aria-pressed', String(isFav));
    star.setAttribute('aria-label', isFav ? `Usuń z ulubionych: ${c.name}` : `Dodaj do ulubionych: ${c.name}`);
    star.addEventListener('click', () => toggleFavorite(c.id));

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'list-open';
    const name = document.createElement('span');
    name.className = 'list-name';
    name.textContent = c.name;
    const badges = document.createElement('span');
    badges.className = 'badges';
    for (const db of c.databases) {
      const b = document.createElement('span');
      b.className = `badge ${dbBadgeClass(db)}`.trim();
      b.textContent = dbBadgeText(db);
      badges.append(b);
    }
    open.append(name, badges);
    open.addEventListener('click', () => select(c.id));
    // Cały wiersz klikalny (przycisk wewnątrz zapewnia obsługę klawiaturą).
    li.addEventListener('click', (e) => {
      if (e.target === li) select(c.id);
    });

    li.append(star, open);
    return li;
  }

  async function toggleFavorite(id) {
    const key = Number(id);
    if (pendingFav.has(key)) return;
    pendingFav.add(key);
    const wasFav = favorites.has(key);
    if (wasFav) favorites.delete(key); else favorites.add(key);
    showNotice('');
    render();
    try {
      await setFavorite(id, !wasFav);
    } catch (err) {
      if (wasFav) favorites.add(key); else favorites.delete(key);
      render();
      showNotice(err.message);
    } finally {
      pendingFav.delete(key);
    }
  }

  function select(id) {
    selectedId = id;
    render();
    onSelect?.(id);
    setLastClient(id).catch((err) => console.warn(err.message));
  }

  async function load() {
    const [list, favs] = await Promise.all([listClients(), listFavorites()]);
    clients = list;
    favorites = new Set(favs);
    render();
  }

  async function refresh() {
    showNotice('');
    try {
      await load();
    } catch (err) {
      showNotice(err.message);
    }
  }

  search.addEventListener('input', () => {
    query = search.value;
    render();
  });

  // Pierwsze wczytanie: błąd wyjątkiem → index.html pokaże komunikat w tym panelu.
  await load();

  // Po starcie otwiera ostatnio oglądanego klienta (jeśli nadal istnieje).
  try {
    const { last_client_id: last } = await getPrefs();
    if (last != null && clients.some((c) => c.id === last)) {
      selectedId = last;
      render();
      onSelect?.(last);
    }
  } catch (err) {
    console.warn(err.message);
  }

  return { refresh, select };
}

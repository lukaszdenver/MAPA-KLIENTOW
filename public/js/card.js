// Karta klienta: nagłówek z notatką, bazy danych, moduły z funkcjami płatnymi; akcje admina.
import { getClient, deleteClient } from './db.js';
import { getUser } from './app-init.js';
import { dbBadgeText, dbBadgeClass, moduleDatabases } from './format.js';

function h(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function badge(db) {
  return h('span', `badge ${dbBadgeClass(db)}`.trim(), dbBadgeText(db));
}

/**
 * @param {HTMLElement} el
 * @param {{ onSaved?: (id:number)=>void, onDeleted?: (id:number)=>void }} [opts]
 *   onSaved: po zapisie formularza (lista ma się odświeżyć i pokazać klienta);
 *   onDeleted: po usunięciu klienta (lista ma się odświeżyć).
 */
export function mountCard(el, { onSaved, onDeleted } = {}) {
  let currentId = null;
  let token = 0; // ignoruje spóźnione odpowiedzi po zmianie klienta

  const isAdmin = () => Boolean(getUser()?.isAdmin);

  function alertBox(message) {
    el.querySelector('.card-alert')?.remove();
    const box = h('div', 'alert alert-error card-alert', message);
    box.setAttribute('role', 'alert');
    el.prepend(box);
  }

  async function openForm(clientId) {
    let mod;
    try {
      mod = await import('./client-form.js');
    } catch (err) {
      console.info('client-form.js niedostępny:', err?.message ?? err);
      alertBox('Formularz niedostępny');
      return;
    }
    token += 1; // formularz przejmuje kontener
    mod.openClientForm(
      el,
      clientId,
      async (id) => {
        if (onSaved) await onSaved(id);
        else await showClient(id);
      },
      () => (currentId != null ? showClient(currentId) : showEmpty()),
    );
  }

  function toolbar(client) {
    const bar = h('div', 'card-actions row');
    if (!isAdmin()) return bar;
    const add = h('button', 'btn', 'Nowy klient');
    add.type = 'button';
    add.addEventListener('click', () => openForm(null));
    bar.append(add);
    if (client) {
      const edit = h('button', 'btn', 'Edytuj');
      edit.type = 'button';
      edit.addEventListener('click', () => openForm(client.id));
      const del = h('button', 'btn btn-danger', 'Usuń');
      del.type = 'button';
      del.addEventListener('click', () => remove(client, del));
      bar.append(edit, del);
    }
    return bar;
  }

  async function remove(client, btn) {
    if (!window.confirm(`Usunąć klienta „${client.name}” wraz z jego bazami i modułami? Tej operacji nie można cofnąć.`)) return;
    btn.disabled = true;
    try {
      await deleteClient(client.id);
    } catch (err) {
      btn.disabled = false;
      alertBox(err.message);
      return;
    }
    showEmpty();
    await onDeleted?.(client.id);
  }

  function showEmpty() {
    token += 1;
    currentId = null;
    el.innerHTML = '';
    el.classList.add('client-card');
    const bar = toolbar(null);
    if (bar.childElementCount) el.append(bar);
    el.append(h('p', 'placeholder', 'Wybierz klienta z listy.'));
  }

  function renderClient(c) {
    el.innerHTML = '';
    el.classList.add('client-card');

    const head = h('div', 'card-head');
    const titles = h('div', 'card-titles');
    titles.append(h('h2', null, c.name));
    if (c.notes) titles.append(h('p', 'card-notes', c.notes));
    head.append(titles, toolbar(c));
    el.append(head);

    const dbSection = h('section', 'section');
    dbSection.append(h('h3', null, 'Bazy danych'));
    if (c.databases.length) {
      const wrap = h('div', 'badges');
      for (const db of c.databases) {
        wrap.append(badge(db));
        if (db.label) wrap.append(h('span', 'muted small', db.label));
      }
      dbSection.append(wrap);
    } else {
      dbSection.append(h('p', 'muted', 'Brak baz danych.'));
    }
    el.append(dbSection);

    const modSection = h('section', 'section');
    modSection.append(h('h3', null, 'Moduły'));
    if (c.modules.length) {
      const ul = h('ul', 'module-list');
      for (const cm of c.modules) {
        const li = h('li', 'module');
        const top = h('div', 'module-head');
        top.append(h('span', 'module-code mono', cm.module.code), h('span', 'module-name', cm.module.name));
        const dbs = moduleDatabases(c, cm);
        if (dbs.length) {
          const wrap = h('span', 'badges');
          for (const db of dbs) wrap.append(badge(db));
          top.append(wrap);
        }
        li.append(top);
        if (cm.features.length) {
          const f = h('ul', 'feature-list');
          for (const feat of cm.features) f.append(h('li', null, feat.name));
          li.append(h('div', 'muted small', 'Funkcje płatne:'), f);
        }
        ul.append(li);
      }
      modSection.append(ul);
    } else {
      modSection.append(h('p', 'muted', 'Brak modułów.'));
    }
    el.append(modSection);
  }

  async function showClient(id) {
    const mine = ++token;
    currentId = id;
    el.classList.add('client-card');
    el.innerHTML = '';
    el.append(h('p', 'loading', 'Ładowanie…'));
    try {
      const client = await getClient(id);
      if (mine !== token) return;
      renderClient(client);
    } catch (err) {
      if (mine !== token) return;
      el.innerHTML = '';
      const box = h('div', 'alert alert-error', err.message);
      box.setAttribute('role', 'alert');
      el.append(box);
    }
  }

  showEmpty();
  return { showClient, showEmpty };
}

// Formularz klienta (nowy / edycja) renderowany w podanym elemencie (zwykle #card). Tylko admin.
import { getClient, saveClient, listCatalog } from './db.js';
import { authFetch } from './app-init.js';
import { changedSections } from './diff.js';
import {
  ENGINES, stateFromClient, addDatabase, removeDatabase, findModule,
  setModuleSelected, setModuleDatabase, setModuleFeature, validate, toPayload,
} from './client-form-model.js';

function ensureCss() {
  if (document.querySelector('link[data-form-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/css/form.css';
  link.dataset.formCss = '1';
  document.head.appendChild(link);
}

/** Mały helper do budowania DOM (bez innerHTML — dane użytkownika trafiają przez textContent). */
function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in node && k !== 'list') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...children.flat().filter((c) => c != null && c !== false));
  return node;
}

const dbTitle = (d) => {
  const engine = ENGINES.find((e) => e.value === d.engine)?.label ?? d.engine;
  return `${engine} ${String(d.version ?? '').trim() || '(bez wersji)'}${String(d.label ?? '').trim() ? ` — ${d.label.trim()}` : ''}`;
};

/**
 * @param {HTMLElement} el
 * @param {number|null} clientId  null = nowy klient
 * @param {(id:number)=>void} onSaved
 * @param {()=>void} [onCancel]
 */
export async function openClientForm(el, clientId, onSaved, onCancel) {
  ensureCss();
  el.innerHTML = '<p class="loading">Ładowanie formularza…</p>';

  let catalog;
  let state;
  try {
    const [cat, current] = await Promise.all([listCatalog(), clientId ? getClient(clientId) : null]);
    catalog = cat;
    state = stateFromClient(current);
  } catch (err) {
    el.innerHTML = '';
    el.append(h('div', { class: 'alert alert-error', role: 'alert' }, err.message || 'Nie udało się wczytać formularza.'));
    el.append(h('button', { type: 'button', class: 'btn', onClick: () => (onCancel ? onCancel() : null) }, 'Wróć'));
    return;
  }

  let busy = false;
  let messages = []; // [{kind:'error'|'ok', text}]

  function render() {
    el.innerHTML = '';
    const form = h('form', { class: 'client-form', noValidate: true, 'aria-label': clientId ? 'Edycja klienta' : 'Nowy klient' });
    form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });

    form.append(h('h2', {}, clientId ? 'Edytuj klienta' : 'Nowy klient'));

    form.append(
      h('div', { class: 'field' },
        h('label', { for: 'cf-name' }, 'Nazwa klienta *'),
        h('input', { id: 'cf-name', type: 'text', required: true, value: state.name, autocomplete: 'off',
          onInput: (e) => { state.name = e.target.value; } })),
      h('div', { class: 'field' },
        h('label', { for: 'cf-notes' }, 'Notatki'),
        h('textarea', { id: 'cf-notes', value: state.notes, onInput: (e) => { state.notes = e.target.value; } })),
    );

    // ---- Bazy ----
    const dbSection = h('fieldset', { class: 'section form-section' }, h('legend', {}, 'Bazy danych'));
    if (!state.databases.length) dbSection.append(h('p', { class: 'muted small' }, 'Brak baz — dodaj pierwszą.'));
    state.databases.forEach((d, i) => {
      const row = h('div', { class: 'db-row' },
        h('div', { class: 'field' },
          h('label', { for: `cf-eng-${d.key}` }, 'Silnik'),
          h('select', { id: `cf-eng-${d.key}`, onChange: (e) => { d.engine = e.target.value; refreshModules(); } },
            ENGINES.map((e) => h('option', { value: e.value, selected: e.value === d.engine }, e.label)))),
        h('div', { class: 'field' },
          h('label', { for: `cf-ver-${d.key}` }, 'Wersja *'),
          h('input', { id: `cf-ver-${d.key}`, type: 'text', value: d.version, placeholder: 'np. 19c', autocomplete: 'off',
            onInput: (e) => { d.version = e.target.value; }, onChange: refreshModules })),
        h('div', { class: 'field' },
          h('label', { for: `cf-lab-${d.key}` }, 'Etykieta'),
          h('input', { id: `cf-lab-${d.key}`, type: 'text', value: d.label, placeholder: 'np. produkcja', autocomplete: 'off',
            onInput: (e) => { d.label = e.target.value; }, onChange: refreshModules })),
        h('button', { type: 'button', class: 'btn btn-danger db-remove', 'aria-label': `Usuń bazę ${i + 1}`,
          onClick: () => { removeDatabase(state, d.key); render(); } }, 'Usuń'));
      dbSection.append(row);
    });
    dbSection.append(h('button', { type: 'button', class: 'btn', onClick: () => { addDatabase(state); render(); } }, 'Dodaj bazę'));
    form.append(dbSection);

    // ---- Moduły ----
    const modSection = h('fieldset', { class: 'section form-section' }, h('legend', {}, 'Moduły'));
    const modulesBox = h('div', { class: 'module-list', id: 'cf-modules' });
    modSection.append(modulesBox);
    form.append(modSection);

    // ---- Komunikaty i akcje ----
    const msgBox = h('div', { id: 'cf-messages', 'aria-live': 'polite' });
    for (const m of messages) {
      msgBox.append(h('div', { class: `alert ${m.kind === 'ok' ? 'alert-ok' : 'alert-error'}`, role: m.kind === 'ok' ? 'status' : 'alert' }, m.text));
    }
    form.append(msgBox);
    form.append(h('div', { class: 'row form-actions' },
      h('button', { type: 'submit', class: 'btn btn-primary', disabled: busy }, busy ? 'Zapisywanie…' : 'Zapisz'),
      h('button', { type: 'button', class: 'btn', disabled: busy, onClick: () => (onCancel ? onCancel() : clientId ? onSaved(clientId) : null) }, 'Anuluj')));

    el.append(form);
    refreshModules();
  }

  /** Przerysowuje tylko listę modułów (zmiana wersji/etykiety/silnika bazy wpływa na ich checkboxy). */
  function refreshModules() {
    const box = el.querySelector('#cf-modules');
    if (!box) return;
    box.innerHTML = '';
    if (!catalog.length) {
      box.append(h('p', { class: 'muted small' }, 'Katalog modułów jest pusty — dodaj moduły w katalogu.'));
      return;
    }
    for (const mod of catalog) {
      const sel = findModule(state, mod.id);
      const item = h('div', { class: 'module-item' },
        h('label', { class: 'check module-head' },
          h('input', { type: 'checkbox', checked: Boolean(sel),
            onChange: (e) => { setModuleSelected(state, mod.id, e.target.checked); refreshModules(); } }),
          h('span', { class: 'mono' }, mod.code), ' ', h('span', {}, mod.name)));
      if (sel) {
        const sub = h('div', { class: 'module-sub' });
        const dbs = h('div', { class: 'sub-group' }, h('span', { class: 'sub-title small muted' }, 'Bazy tego klienta'));
        if (!state.databases.length) dbs.append(h('span', { class: 'muted small' }, 'Dodaj najpierw bazę klienta.'));
        for (const d of state.databases) {
          dbs.append(h('label', { class: 'check' },
            h('input', { type: 'checkbox', checked: sel.db_keys.includes(d.key),
              onChange: (e) => setModuleDatabase(state, mod.id, d.key, e.target.checked) }),
            dbTitle(d)));
        }
        sub.append(dbs);
        const feats = h('div', { class: 'sub-group' }, h('span', { class: 'sub-title small muted' }, 'Funkcje płatne'));
        if (!mod.features.length) feats.append(h('span', { class: 'muted small' }, 'Moduł nie ma funkcji płatnych.'));
        for (const f of mod.features) {
          feats.append(h('label', { class: 'check' },
            h('input', { type: 'checkbox', checked: sel.feature_ids.includes(Number(f.id)),
              onChange: (e) => setModuleFeature(state, mod.id, f.id, e.target.checked) }),
            f.name));
        }
        sub.append(feats);
        item.append(sub);
      }
      box.append(item);
    }
  }

  async function submit() {
    if (busy) return;
    const errors = validate(state);
    if (errors.length) {
      messages = errors.map((text) => ({ kind: 'error', text }));
      render();
      return;
    }
    busy = true;
    messages = [];
    render();

    let id;
    let after;
    let before;
    try {
      before = clientId ? await getClient(clientId) : null;
      id = await saveClient(toPayload(state));
      after = await getClient(id);
    } catch (err) {
      busy = false;
      messages = [{ kind: 'error', text: err.message || 'Nie udało się zapisać klienta.' }];
      render();
      return;
    }

    // before == null → nowy klient (event 'created').
    const { event, sections } = changedSections(before, after);
    let notifyFailed = false;
    if (event === 'created' || sections.length) {
      try {
        await authFetch('/api/notify', { clientId: id, event, sections });
      } catch (err) {
        console.warn('notify:', err.message);
        notifyFailed = true;
      }
    }
    busy = false;
    if (notifyFailed) {
      // Pokaż komunikat i dopiero po kliknięciu przejdź dalej — inaczej onSaved przerysuje kartę i komunikat zniknie.
      el.innerHTML = '';
      el.append(
        h('div', { class: 'alert alert-error', role: 'alert' }, 'Zapisano, ale nie udało się wysłać e-maila.'),
        h('button', { type: 'button', class: 'btn btn-primary', onClick: () => onSaved(id) }, 'OK'),
      );
      return;
    }
    onSaved(id);
  }

  render();
}

// Katalog modułów i funkcji płatnych (tylko admin; RLS i tak egzekwuje rolę po stronie bazy).
import { listCatalog, saveModule, deleteModule, saveFeature, deleteFeature } from './db.js';

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...children.flat().filter((c) => c != null && c !== false));
  return node;
}

export async function mountCatalog(root) {
  let catalog = [];
  let message = null; // { kind, text }
  let editingModule = null; // id modułu, 0 = nowy
  let editingFeature = null; // id funkcji
  let addingFeatureTo = null; // id modułu

  async function reload() {
    try {
      catalog = await listCatalog();
    } catch (err) {
      message = { kind: 'error', text: err.message };
    }
    render();
  }

  /** Wykonuje akcję, po niej odświeża katalog; błąd → komunikat, bez zamykania edycji. */
  async function act(fn, okText) {
    try {
      await fn();
      message = okText ? { kind: 'ok', text: okText } : null;
      editingModule = editingFeature = addingFeatureTo = null;
      await reload();
    } catch (err) {
      message = { kind: 'error', text: err.message };
      render();
    }
  }

  function moduleForm(mod) {
    const code = h('input', { type: 'text', value: mod?.code ?? '', placeholder: 'Kod (np. FK)', 'aria-label': 'Kod modułu', required: true });
    const name = h('input', { type: 'text', value: mod?.name ?? '', placeholder: 'Nazwa modułu', 'aria-label': 'Nazwa modułu', required: true });
    const form = h('form', { class: 'cat-inline' }, code, name,
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Zapisz'),
      h('button', { type: 'button', class: 'btn', onClick: () => { editingModule = null; render(); } }, 'Anuluj'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      act(() => saveModule({ id: mod?.id, code: code.value, name: name.value }), 'Zapisano moduł.');
    });
    return form;
  }

  function featureForm(feat, moduleId) {
    const name = h('input', { type: 'text', value: feat?.name ?? '', placeholder: 'Nazwa funkcji płatnej', 'aria-label': 'Nazwa funkcji płatnej', required: true });
    const form = h('form', { class: 'cat-inline' }, name,
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Zapisz'),
      h('button', { type: 'button', class: 'btn', onClick: () => { editingFeature = addingFeatureTo = null; render(); } }, 'Anuluj'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      act(() => saveFeature({ id: feat?.id, module_id: moduleId, name: name.value }), 'Zapisano funkcję płatną.');
    });
    return form;
  }

  function confirmDeleteModule(mod) {
    if (!confirm(`Usunąć moduł ${mod.code} „${mod.name}”? To usunie też jego funkcje płatne i powiązania u klientów.`)) return;
    act(() => deleteModule(mod.id), 'Usunięto moduł.');
  }

  function confirmDeleteFeature(f) {
    if (!confirm(`Usunąć funkcję płatną „${f.name}”? To usunie też powiązania u klientów.`)) return;
    act(() => deleteFeature(f.id), 'Usunięto funkcję płatną.');
  }

  function render() {
    root.innerHTML = '';
    root.append(h('div', { class: 'panel-title' }, h('h1', {}, 'Katalog modułów'),
      h('button', { type: 'button', class: 'btn btn-primary', onClick: () => { editingModule = 0; render(); } }, 'Dodaj moduł')));
    if (message) {
      root.append(h('div', { class: `alert ${message.kind === 'ok' ? 'alert-ok' : 'alert-error'}`, role: message.kind === 'ok' ? 'status' : 'alert' }, message.text));
    }
    if (editingModule === 0) root.append(h('div', { class: 'cat-module' }, moduleForm(null)));
    if (!catalog.length && editingModule !== 0) root.append(h('p', { class: 'placeholder' }, 'Katalog jest pusty.'));

    for (const mod of catalog) {
      const card = h('section', { class: 'cat-module' });
      if (editingModule === mod.id) {
        card.append(moduleForm(mod));
      } else {
        card.append(h('div', { class: 'cat-head' },
          h('h3', {}, h('span', { class: 'mono' }, mod.code), ' — ', mod.name),
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'btn', onClick: () => { editingModule = mod.id; render(); } }, 'Edytuj'),
            h('button', { type: 'button', class: 'btn btn-danger', onClick: () => confirmDeleteModule(mod) }, 'Usuń'))));
      }
      const list = h('ul', { class: 'cat-features' });
      if (!mod.features.length) list.append(h('li', { class: 'muted small' }, 'Brak funkcji płatnych.'));
      for (const f of mod.features) {
        if (editingFeature === f.id) {
          list.append(h('li', {}, featureForm(f, mod.id)));
        } else {
          list.append(h('li', {}, h('span', {}, f.name),
            h('span', { class: 'row' },
              h('button', { type: 'button', class: 'btn', onClick: () => { editingFeature = f.id; addingFeatureTo = null; render(); } }, 'Edytuj'),
              h('button', { type: 'button', class: 'btn btn-danger', onClick: () => confirmDeleteFeature(f) }, 'Usuń'))));
        }
      }
      card.append(list);
      card.append(addingFeatureTo === mod.id
        ? featureForm(null, mod.id)
        : h('button', { type: 'button', class: 'btn', onClick: () => { addingFeatureTo = mod.id; editingFeature = null; render(); } }, 'Dodaj funkcję płatną'));
      root.append(card);
    }
  }

  root.innerHTML = '<p class="loading">Ładowanie…</p>';
  await reload();
}

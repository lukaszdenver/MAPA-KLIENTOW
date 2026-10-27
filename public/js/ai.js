// Panel „Zapytaj AI”: pytanie → POST /api/ask → odpowiedź (czysty tekst).
import { authFetch } from './app-init.js';

const MAX_LEN = 500;

function ensureCss() {
  const href = '/css/ai.css';
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Montuje czat w el. Historia żyje tylko w pamięci strony (sesja). */
export function mountAi(el) {
  ensureCss();
  el.innerHTML = '';
  el.classList.add('ai');

  const title = h('h2', null, 'Zapytaj AI');
  const history = h('div', 'ai-history');
  history.setAttribute('aria-live', 'polite');
  history.hidden = true;

  const form = h('form', 'ai-form');
  const field = h('div', 'field');
  const label = h('label', null, 'Twoje pytanie');
  const input = h('input');
  input.type = 'text';
  input.id = 'ai-question';
  input.name = 'question';
  input.maxLength = MAX_LEN;
  input.autocomplete = 'off';
  input.placeholder = 'np. którzy klienci mają Oracle 19c i moduł PLZ?';
  label.htmlFor = input.id;
  field.append(label, input);

  const row = h('div', 'row');
  const btn = h('button', 'btn btn-primary', 'Zapytaj');
  btn.type = 'submit';
  const counter = h('span', 'muted ai-counter', `0/${MAX_LEN}`);
  row.append(btn, counter);

  const error = h('div', 'alert alert-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;

  const note = h('p', 'muted ai-note', 'AI tylko czyta dane — nic nie zmienia');
  form.append(field, row, error);
  el.append(title, history, form, note);

  let busy = false;

  input.addEventListener('input', () => { counter.textContent = `${input.value.length}/${MAX_LEN}`; });

  function addEntry(question) {
    history.hidden = false;
    const entry = h('div', 'ai-entry');
    const q = h('p', 'ai-q', question);
    const a = h('p', 'ai-a muted', 'Myślę…');
    entry.append(q, a);
    history.append(entry);
    history.scrollTop = history.scrollHeight;
    return a;
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (busy) return;
    const question = input.value.trim();
    error.hidden = true;
    if (!question) {
      error.textContent = 'Wpisz pytanie.';
      error.hidden = false;
      return;
    }
    busy = true;
    btn.disabled = true;
    const answerEl = addEntry(question);
    try {
      const data = await authFetch('/api/ask', { question });
      answerEl.classList.remove('muted');
      answerEl.textContent = data?.answer || 'Brak odpowiedzi.'; // tekst, nie HTML
      input.value = '';
      counter.textContent = `0/${MAX_LEN}`;
    } catch (err) {
      answerEl.closest('.ai-entry').remove();
      if (!history.childElementCount) history.hidden = true;
      error.textContent = err?.message || 'Nie udało się uzyskać odpowiedzi.';
      error.hidden = false;
    } finally {
      busy = false;
      btn.disabled = false;
      history.scrollTop = history.scrollHeight;
      input.focus();
    }
  });
}

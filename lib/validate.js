import { HttpError } from './http.js';

const SECTIONS = ['databases', 'modules', 'features', 'details'];
const EVENTS = ['created', 'updated'];

export function validateQuestion(q) {
  const s = typeof q === 'string' ? q.trim() : '';
  if (!s) throw new HttpError(400, 'Wpisz pytanie');
  if (s.length > 500) throw new HttpError(400, 'Pytanie może mieć maksymalnie 500 znaków');
  return s;
}

export function validateNotify(body) {
  const { clientId, event, sections } = body ?? {};
  if (!Number.isInteger(clientId) || clientId <= 0) throw new HttpError(400, 'Nieprawidłowy clientId');
  if (!EVENTS.includes(event)) throw new HttpError(400, 'Nieprawidłowe zdarzenie');
  if (!Array.isArray(sections) || sections.some((s) => !SECTIONS.includes(s))) {
    throw new HttpError(400, 'Nieprawidłowe sekcje');
  }
  return { clientId, event, sections };
}

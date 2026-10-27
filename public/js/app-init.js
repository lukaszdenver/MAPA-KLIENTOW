// Start aplikacji w przeglądarce: konfiguracja, Clerk, klient Supabase, wywołania /api.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';

// Przypięte wersje z jednego wydania Clerk (2026-10-26). Od clerk-js v6 komponenty UI
// (SignIn, SignUp, Waitlist, UserButton) są w osobnym pakiecie @clerk/ui — bez niego
// mountSignIn() rzuca „Clerk was not loaded with Ui components”.
const CLERK_JS_URL = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6.41.0/dist/clerk.browser.js';
const CLERK_UI_URL = 'https://cdn.jsdelivr.net/npm/@clerk/ui@1.42.0/dist/ui.browser.js';
const CLERK_PL_URL = 'https://cdn.jsdelivr.net/npm/@clerk/localizations@4.24.2/dist/pl-PL.mjs';

export const URLS = {
  home: '/',
  signUp: '/rejestracja.html',
  waitlist: '/?konto=prosba',
};

let config = null;
let configPromise = null;
let clerkPromise = null;
let supabase = null;

/** GET /api/config → { clerkPublishableKey, supabaseUrl, supabaseAnonKey } (raz na stronę). */
export function loadConfig() {
  if (!configPromise) {
    configPromise = (async () => {
      let res;
      try {
        res = await fetch('/api/config', { headers: { Accept: 'application/json' } });
      } catch {
        throw new Error('Brak połączenia z serwerem — nie udało się pobrać konfiguracji.');
      }
      if (!res.ok) throw new Error(`Nie udało się pobrać konfiguracji aplikacji (HTTP ${res.status}).`);
      const cfg = await res.json();
      if (!cfg.clerkPublishableKey || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
        throw new Error('Niepełna konfiguracja aplikacji — sprawdź zmienne środowiskowe na serwerze.');
      }
      config = cfg;
      return cfg;
    })();
    configPromise.catch(() => { configPromise = null; });
  }
  return configPromise;
}

function injectScript(src, attrs = {}) {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error('Nie udało się wczytać modułu logowania (Clerk). Sprawdź połączenie z internetem.'));
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded) return resolve();
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', fail, { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.addEventListener('load', () => { s.dataset.loaded = '1'; resolve(); }, { once: true });
    s.addEventListener('error', fail, { once: true });
    document.head.appendChild(s);
  });
}

async function loadPolish() {
  try {
    return (await import(CLERK_PL_URL)).plPL;
  } catch {
    return undefined; // brak tłumaczenia nie blokuje logowania
  }
}

/** Wczytuje Clerk (skrypt z data-clerk-publishable-key + UI), czeka na Clerk.load(). */
export function initClerk() {
  if (!clerkPromise) {
    clerkPromise = (async () => {
      const cfg = await loadConfig();
      const [, , localization] = await Promise.all([
        injectScript(CLERK_UI_URL),
        injectScript(CLERK_JS_URL, { 'data-clerk-publishable-key': cfg.clerkPublishableKey }),
        loadPolish(),
      ]);
      const clerk = window.Clerk;
      if (!clerk || !window.__internal_ClerkUICtor) {
        throw new Error('Nie udało się uruchomić logowania (Clerk).');
      }
      await clerk.load({
        ui: { ClerkUI: window.__internal_ClerkUICtor },
        localization,
        signInUrl: URLS.home,
        signUpUrl: URLS.signUp,
        waitlistUrl: URLS.waitlist,
        afterSignOutUrl: URLS.home,
        signInFallbackRedirectUrl: URLS.home,
        signUpFallbackRedirectUrl: URLS.home,
      });
      return clerk;
    })();
    clerkPromise.catch(() => { clerkPromise = null; });
  }
  return clerkPromise;
}

/** Token sesji Clerk (null, gdy niezalogowany). */
export async function getToken() {
  return (await window.Clerk?.session?.getToken()) ?? null;
}

/**
 * Singleton klienta Supabase z tokenem sesji Clerk (natywna integracja third-party auth).
 * Wymaga wczytanej konfiguracji (`await initClerk()` lub `await loadConfig()`).
 */
export function getSupabase() {
  if (supabase) return supabase;
  if (!config) throw new Error('Konfiguracja nie jest wczytana — najpierw wywołaj initClerk().');
  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    accessToken: getToken,
  });
  return supabase;
}

/** Zalogowany użytkownik: { id, email, isAdmin } albo null. */
export function getUser() {
  const u = window.Clerk?.user;
  if (!u) return null;
  return {
    id: u.id,
    email: u.primaryEmailAddress?.emailAddress ?? u.emailAddresses?.[0]?.emailAddress ?? '',
    isAdmin: u.publicMetadata?.role === 'admin',
  };
}

/** POST JSON do /api/* z tokenem Clerk. Przy błędzie rzuca Error z komunikatem serwera. */
export async function authFetch(path, body) {
  const token = await getToken();
  if (!token) throw new Error('Sesja wygasła — zaloguj się ponownie.');
  let res;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new Error('Brak połączenia z serwerem.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* odpowiedź bez JSON */ }
  if (!res.ok) throw new Error(data?.error || `Błąd serwera (HTTP ${res.status}).`);
  return data;
}

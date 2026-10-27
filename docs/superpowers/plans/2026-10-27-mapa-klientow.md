# Mapa Klientów Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplikacja webowa „Mapa Klientów” — szybki podgląd, który klient ma jakie moduły, bazy (Oracle/PostgreSQL + wersja) i funkcje płatne; dane wpisuje ręcznie admin.

**Architecture:** Statyczne strony HTML/CSS/JS (moduły ES, bez frameworka i bez builda) w `public/`, biblioteki Clerk i Supabase z CDN. Dane w Supabase z RLS opartym o token sesji Clerk (third-party auth). Funkcje serverless Vercel w `api/` (Node, ESM) dla konfiguracji, e-maili (Nodemailer/Gmail), czatu AI (Claude, bez narzędzi) i webhooka Clerk.

**Tech Stack:** HTML/CSS/JS, `@clerk/clerk-js` (CDN), `@supabase/supabase-js` v2 (CDN + npm), `@clerk/backend`, `svix`, `nodemailer`, `@anthropic-ai/sdk`, Vercel, `node:test`, `@electric-sql/pglite` (tylko testy SQL).

**Spec:** `docs/superpowers/specs/2026-10-27-mapa-klientow-design.md` — wykonawcy czytają spec i plan.

## Global Constraints

- Katalog repo: `C:\PROGRAMOWANIE\Dzien 6\mapa-klientow` (Windows 11, Node ≥ 20).
- Bez frameworka frontendowego i bez kroku budowania; skrypty CDN tylko z `cdn.jsdelivr.net/npm/` z **dokładną przypiętą wersją** (sprawdź aktualną na npm).
- `package.json`: `"type": "module"`; testy: `node --test tests/`.
- Sekrety tylko w env Vercel: `ANTHROPIC_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `ADMIN_EMAIL`. Nigdy w `public/` ani w repo; `.env*` w `.gitignore` (poza `.env.example`).
- Identyfikator użytkownika = Clerk `sub` (tekst `user_…`); w SQL zawsze `auth.jwt()->>'sub'`, nigdy `auth.uid()`.
- Rola: claim `app_role` w tokenie (`"admin"` = admin, cokolwiek innego = podgląd). E-mail: claim `email`.
- Cały interfejs, komunikaty błędów i e-maile po polsku.
- Model AI: `claude-sonnet-5-5`, `max_tokens: 1024`, bez narzędzi.
- Dane startowe: prawdziwe kody modułów, fikcyjne funkcje płatne i fikcyjni klienci.
- Commit po każdym tasku; wiadomość kończy się linią `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Użytkownik podgląd wywołuje zapis bezpośrednio przez Supabase JS → RLS odrzuca (test w Task 1).
2. Zapytanie bez tokenu (sam klucz anon) → zero wierszy (test w Task 1).
3. Usunięcie bazy klienta, do której przypięty jest moduł → powiązanie znika, moduł zostaje (test w Task 1).
4. Wyszukiwanie bez rozróżniania wielkości liter i z polskimi znakami („łódź” znajduje „Łódź”), także po kodzie modułu i „oracle 19c” (test w Task 4).
5. Puste / za długie (> 500 znaków) pytanie do AI albo błąd Claude API → czytelny komunikat 400/502, nie biały ekran (test w Task 2).

---

## Struktura plików

```
mapa-klientow/
  package.json  vercel.json  .gitignore  .env.example  README.md
  supabase/schema.sql  supabase/rls.sql  supabase/seed.sql
  lib/http.js        # HttpError, sendError(res, err)
  lib/auth.js        # verifyRequest(req), assertAdmin(user)
  lib/supabaseAdmin.js  lib/data.js  lib/emails.js  lib/snapshot.js  lib/mailer.js  lib/validate.js
  api/config.js  api/notify.js  api/ask.js  api/clerk-webhook.js
  public/index.html  public/rejestracja.html  public/katalog.html
  public/css/app.css
  public/js/app-init.js   # loadConfig, initClerk, getSupabase
  public/js/db.js         # dostęp do danych (interfejs niżej)
  public/js/filter.js  public/js/diff.js   # czyste funkcje (testowane w node)
  public/js/list.js  public/js/card.js  public/js/client-form.js  public/js/catalog.js  public/js/ai.js  public/js/prefs.js
  tests/sql.test.js  tests/lib.test.js  tests/front.test.js
```

## Wspólny kształt danych (używany przez front i serwer)

```js
// Client
{ id, name, notes,
  databases: [{ id, engine: 'oracle'|'postgres', version, label }],
  modules:   [{ id /*client_module id*/, module: { id, code, name },
                database_ids: [/*client_database ids*/],
                features: [{ id, name }] }] }
// Catalog
[{ id, code, name, features: [{ id, name }] }]
```

---

### Task 0: Szkielet repo

**Files:** Create `package.json`, `vercel.json`, `.gitignore`, `.env.example`, `tests/` (pusty plik `tests/smoke.test.js` z jednym `assert.ok(true)`).

- [ ] **Step 1:** `git init`, utwórz pliki. `package.json`: `"type":"module"`, `"scripts":{"test":"node --test tests/"}`, dependencies: `@clerk/backend`, `@supabase/supabase-js`, `nodemailer`, `@anthropic-ai/sdk`, `svix`; devDependencies: `@electric-sql/pglite`. `vercel.json`: `{"outputDirectory":"public"}` (funkcje z `api/` działają obok). `.env.example`: wszystkie zmienne z Global Constraints z pustymi wartościami.
- [ ] **Step 2:** `npm install` i `npm test` → PASS.
- [ ] **Step 3:** Commit (spec + plan + szkielet): `chore: szkielet projektu Mapa Klientów`.

### Task 1: Baza danych (schema, RLS, seed) — równolegle z Task 2 i 3

**Files:** Create `supabase/schema.sql`, `supabase/rls.sql`, `supabase/seed.sql`, `tests/sql.test.js`

**Interfaces — Produces:** tabele dokładnie jak w spec §7.3: `clients`, `client_databases(engine check in ('oracle','postgres'))`, `modules(code unique)`, `paid_features`, `client_modules(unique(client_id,module_id))`, `client_module_databases(pk(client_module_id, client_database_id))`, `client_module_features(pk(client_module_id, paid_feature_id))`, `user_prefs(clerk_user_id text pk, email text not null, notify_changes bool default true, last_client_id → clients on delete set null)`, `user_favorites(clerk_user_id text, client_id → clients, pk obu)`. Klucze `bigint generated always as identity`. Wszystkie FK `on delete cascade` (poza `last_client_id`). `clients.updated_at` z triggerem.

RLS (`rls.sql`): `enable row level security` na wszystkich tabelach; `grant select, insert, update, delete … to authenticated`; dla tabel danych i katalogu: polityka `for select to authenticated using (true)` + polityka zapisu (insert/update/delete) `to authenticated` z `auth.jwt()->>'app_role' = 'admin'`; `user_prefs` i `user_favorites`: tylko własne wiersze (`clerk_user_id = auth.jwt()->>'sub'`), `user_prefs` insert/update dodatkowo `with check (email = auth.jwt()->>'email')`. Żadnej polityki dla `anon`.

Seed: moduły `PLZ, WPBUD, WYBUD, FK, KP, GRU, WIND, OFA, SWR, EON, ENIER, MKO` (nazwy pełne wg wiedzy domenowej, np. PLZ = Planowanie budżetu), 2–3 fikcyjne funkcje płatne na moduł (np. „Eksport rozszerzony XLSX”, „Integracja API”, „Raporty zarządcze”), 6 fikcyjnych klientów (np. „Gmina Przykładowo”, „Miasto Testowice”, „Powiat Wzorcowy”, „Gmina Nibylandia”, „Miasto Łódź Demo”, „Gmina Fikcyjna”) z bazami z zakresu Oracle 10g/11g/12c/19c i PostgreSQL 15/16, co najmniej jeden klient z Oracle + PostgreSQL i modułem przypiętym do obu.

- [ ] **Step 1: Napisz testy** `tests/sql.test.js` (pglite). Setup przed wczytaniem plików: `create schema auth; create role authenticated; create role anon; create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;`. Helper `asUser(claims)` = `set role authenticated; select set_config('request.jwt.claims', $1, false)`. Testy:
  - `seed ładuje się` → `count(*) from clients` = 6, `modules` = 12.
  - `podgląd czyta, nie zapisuje` → claims `{"sub":"user_v","app_role":"viewer"}`: select clients > 0; `insert into clients(name) values('X')` rzuca błąd RLS; `delete from clients` usuwa 0 wierszy.
  - `admin zapisuje` → claims `{"sub":"user_a","app_role":"admin"}`: insert klienta działa.
  - `anon nic nie widzi` → `set role anon`: select z `clients` rzuca błąd uprawnień lub zwraca 0.
  - `usunięcie bazy usuwa powiązanie, nie moduł` → (jako superuser) usuń bazę z `client_module_databases`; wiersz w `client_modules` dalej istnieje.
  - `user_prefs tylko z własnym e-mailem` → claims `{"sub":"user_v","email":"v@x.pl"}`: insert z `email='v@x.pl'` OK, z `email='inny@x.pl'` błąd; drugi użytkownik nie widzi wiersza.
- [ ] **Step 2:** `node --test tests/sql.test.js` → FAIL (brak plików).
- [ ] **Step 3:** Napisz trzy pliki SQL (idempotentne nie są wymagane; kolejność wczytania: schema → rls → seed).
- [ ] **Step 4:** `node --test tests/sql.test.js` → PASS. Jeśli pglite nie obsługuje ról — opisz w raporcie, testy ról oznacz `skip` i dopisz je do ręcznej listy w README (Task 8).
- [ ] **Step 5:** Commit `feat: schemat bazy, RLS i dane przykładowe`.

### Task 2: Biblioteki serwera (`lib/`) — równolegle z Task 1

**Files:** Create `lib/http.js`, `lib/auth.js`, `lib/supabaseAdmin.js`, `lib/data.js`, `lib/emails.js`, `lib/snapshot.js`, `lib/mailer.js`, `lib/validate.js`; Test `tests/lib.test.js`

**Interfaces — Produces:**
- `class HttpError extends Error { constructor(status: number, message: string) }`; `sendError(res, err)` → JSON `{error: message}` ze statusem (nieznany błąd → 500 „Błąd serwera”).
- `verifyRequest(req) -> Promise<{userId: string, role: 'admin'|'viewer', email: string|null}>` — Bearer z nagłówka `Authorization`, `verifyToken` z `@clerk/backend` (`secretKey: CLERK_SECRET_KEY`); brak/zły token → `HttpError(401,'Brak autoryzacji')`.
- `assertAdmin(user)` → `HttpError(403,'Tylko admin')` gdy `role !== 'admin'`.
- `getAdminClient() -> SupabaseClient` (service role, `auth: {persistSession:false}`).
- `fetchClient(sb, id) -> Client|null`, `fetchAllClients(sb) -> Client[]` (kształt wspólny; jedno zapytanie z zagnieżdżonym `select`), `fetchRecipients(sb) -> string[]` (e-maile z `user_prefs` gdzie `notify_changes`).
- `buildChangeEmail({event: 'created'|'updated', sections: ('databases'|'modules'|'features'|'details')[], client: Client}) -> {subject, text, html}` — temat `Nowy klient: <name>` lub `Zmiana u klienta: <name>`; treść: lista zmienionych sekcji po polsku (`Bazy danych`, `Moduły`, `Funkcje płatne`, `Dane podstawowe`) + aktualny stan (bazy `Oracle 19c`, moduły `PLZ – Planowanie budżetu [Oracle 19c, PostgreSQL 15]: funkcje: A, B`). HTML escapowany.
- `buildWaitlistEmail({email}) -> {subject, text}` — temat `Nowa prośba o konto: <email>`, treść z instrukcją „zaakceptuj w panelu Clerk → Waitlist”.
- `buildSnapshot(clients: Client[]) -> string` — zwarty tekst, jedna linia na klienta: `Klient: <name> | Bazy: Oracle 19c; PostgreSQL 15 | Moduły: PLZ(Oracle 19c){funkcje: A, B}; FK(...)`.
- `validateQuestion(q) -> string` (trim) — pusty → `HttpError(400,'Wpisz pytanie')`, > 500 znaków → `HttpError(400,'Pytanie może mieć maksymalnie 500 znaków')`.
- `validateNotify(body) -> {clientId: number, event, sections}` — złe dane → `HttpError(400, …)`.
- `sendMail({to: string[], subject, text, html?}) -> Promise<number>` — Nodemailer `service:'gmail'`, odbiorcy w `bcc`, `to` = `GMAIL_USER`; pusta lista → 0 bez wysyłki.

- [ ] **Step 1: Testy** w `tests/lib.test.js` (bez sieci): `assertAdmin` (viewer → 403, admin OK); `validateQuestion('')` → 400, `'a'.repeat(501)` → 400, `'  ok  '` → `'ok'`; `validateNotify` (brak `clientId` → 400, nieznana sekcja → 400); `buildChangeEmail` dla klienta z fixture (Oracle 19c + PostgreSQL 15, PLZ na obu z funkcją „Integracja API”) — `subject === 'Zmiana u klienta: Gmina Test'`, `text` zawiera `Bazy danych`, `Oracle 19c`, `PostgreSQL 15`, `Integracja API`; nazwa klienta `<b>` jest escapowana w `html`; `buildSnapshot` zawiera `Klient: Gmina Test` i `PLZ(Oracle 19c, PostgreSQL 15)`; `sendError` z `HttpError(403)` ustawia status 403 (mock `res`).
- [ ] **Step 2:** `node --test tests/lib.test.js` → FAIL.
- [ ] **Step 3:** Implementuj moduły wg Interfaces.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: biblioteki serwera (auth, e-maile, snapshot, walidacja)`.

### Task 3: Funkcje `/api` — po Task 2

**Files:** Create `api/config.js`, `api/notify.js`, `api/ask.js`, `api/clerk-webhook.js`

**Interfaces — Consumes:** wszystko z Task 2. **Produces (dla frontu):**
- `GET /api/config` → `{clerkPublishableKey, supabaseUrl, supabaseAnonKey}`.
- `POST /api/notify` (Bearer, admin) body `{clientId, event, sections}` → `{sent: number}`.
- `POST /api/ask` (Bearer, dowolny zalogowany) body `{question}` → `{answer: string}`; błąd Claude → 502 `'Asystent AI jest chwilowo niedostępny'`.
- `POST /api/clerk-webhook` — weryfikacja `svix` (`CLERK_WEBHOOK_SECRET`) na **surowym** body (wyłącz parsowanie / czytaj strumień); `type === 'waitlistEntry.created'` → `sendMail` do `ADMIN_EMAIL`; inne typy → 200 ignoruj; zły podpis → 400.

Prompt systemowy `/api/ask`: „Jesteś asystentem aplikacji Mapa Klientów. Odpowiadasz po polsku, zwięźle, wyłącznie na podstawie danych poniżej. Jeśli danych brak — powiedz to. Nie wymyślaj klientów.” + `buildSnapshot`.

- [ ] **Step 1:** Każdy handler: `export default async function handler(req, res)`, metoda inna niż oczekiwana → 405, błędy przez `sendError`.
- [ ] **Step 2:** `npm test` → PASS (bez regresji); `node -e "import('./api/ask.js')"` dla każdego pliku → brak błędów importu.
- [ ] **Step 3:** Commit `feat: funkcje api (config, notify, ask, webhook)`.

### Task 4: Fundament frontu — równolegle z Task 1–3

**Files:** Create `public/index.html`, `public/rejestracja.html`, `public/css/app.css`, `public/js/app-init.js`, `public/js/db.js`, `public/js/filter.js`, `public/js/diff.js`; Test `tests/front.test.js`

**Interfaces — Produces:**
- `app-init.js`: `loadConfig() -> Promise<Config>`; `initClerk() -> Promise<Clerk>` (dynamicznie wstrzykuje skrypt `clerk.browser.js` z jsDelivr z `data-clerk-publishable-key`, czeka na `window.Clerk.load()`); `getSupabase() -> SupabaseClient` (singleton, `createClient(url, anon, { accessToken: async () => (await window.Clerk.session?.getToken()) ?? null })`); `getUser() -> {id, email, isAdmin}` (z `Clerk.user`, `isAdmin = publicMetadata.role === 'admin'`); `authFetch(path, body) -> Promise<any>` (POST JSON z Bearer, rzuca `Error(error)` przy !ok).
- `db.js` (wszystko async, rzuca `Error` z polskim komunikatem): `listClients() -> Client[]`, `getClient(id) -> Client`, `listCatalog() -> Catalog`, `saveClient(form: {id?, name, notes, databases: [{id?, engine, version, label}], modules: [{module_id, database_refs: (number|string)[], feature_ids: number[]}]}) -> number` (zapis „zastąp zestaw”: upsert klienta, sync baz — `database_refs` mogą wskazywać nowe bazy po indeksie tymczasowym `'new:0'`, przebuduj `client_modules` + powiązania), `deleteClient(id)`, `saveModule({id?, code, name})`, `deleteModule(id)`, `saveFeature({id?, module_id, name})`, `deleteFeature(id)`, `ensurePrefs(email)`, `getPrefs() -> {notify_changes, last_client_id}`, `setNotify(on: boolean)`, `setLastClient(id)`, `listFavorites() -> number[]`, `setFavorite(clientId, on: boolean)`.
- `filter.js`: `filterClients(clients: Client[], query: string) -> Client[]` — normalizacja `toLocaleLowerCase('pl')` + `normalize('NFD')` bez diakrytyków; dopasowanie do nazwy, kodu/nazwy modułu, `"<engine> <version>"` (engine jako `oracle`/`postgresql`); pusty query → wszyscy. `sortClients(clients, favoriteIds) -> Client[]` — ulubieni na górze, potem alfabetycznie (`localeCompare('pl')`).
- `diff.js`: `changedSections(before: Client|null, after: Client) -> {event, sections}` — `before === null` → `{event:'created', sections:[]}`; inaczej porównuje `name/notes` → `details`, zestaw `engine+version+label` → `databases`, zestaw kodów modułów i ich baz → `modules`, zestaw funkcji → `features`.
- `index.html`: niezalogowany → `Clerk.mountSignIn` + przycisk „Poproś o konto” (`mountWaitlist`); zalogowany → nagłówek z `mountUserButton`, link „Katalog” (tylko admin), układ: lewa kolumna lista (`#list`), prawa karta (`#card`), panel AI (`#ai`). Moduły stron z Task 5–7 montują się do tych kontenerów: `mountList(el, {onSelect})`, `mountCard(el)` z `showClient(id)`, `mountAi(el)`.
- `rejestracja.html`: `Clerk.mountSignUp` (obsługuje `__clerk_ticket` z zaproszenia), po rejestracji → `/`.
- `app.css`: tokeny kolorów na `:root`, tryb ciemny przez `prefers-color-scheme`, responsywność do 360 px.

- [ ] **Step 1: Testy** `tests/front.test.js` (import czystych modułów z `public/js/`): `filterClients(fixtures,'łódź')` znajduje „Miasto Łódź Demo”; `'LODZ'` też; `'plz'` znajduje klientów z PLZ; `'oracle 19c'` znajduje tylko klientów z tą wersją; `''` zwraca wszystkich. `sortClients` – ulubiony „Zeta” przed „Alfa”. `changedSections(null, c)` → `created`; zmiana wersji bazy → `['databases']`; dodanie funkcji → `['features']`; bez zmian → `[]`.
- [ ] **Step 2:** `node --test tests/front.test.js` → FAIL.
- [ ] **Step 3:** Implementuj `filter.js`, `diff.js` → PASS; potem `app-init.js`, `db.js`, HTML, CSS.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: fundament frontu (Clerk, Supabase, filtr, diff)`.

### Task 5: Lista, karta klienta, preferencje — po Task 4

**Files:** Create `public/js/list.js`, `public/js/card.js`, `public/js/prefs.js`; Modify `public/index.html` (podpięcie)

- Lista: pole wyszukiwania (`filterClients`), gwiazdka przypina (`setFavorite`), sortowanie `sortClients`, licznik wyników, kliknięcie → `showClient(id)` + `setLastClient(id)`. Po starcie otwiera `last_client_id`.
- Karta: nagłówek z nazwą i notatką; sekcja „Bazy danych” (odznaki `Oracle 19c`); „Moduły” — kod, nazwa, odznaki baz, lista funkcji płatnych; admin widzi „Edytuj” i „Usuń” (potwierdzenie).
- Prefs: po zalogowaniu `ensurePrefs(user.email)`; przełącznik „Powiadomienia e-mail o zmianach” (`setNotify`).
- [ ] **Step 1:** Implementacja. **Step 2:** Ręczny test lokalnie (`npx vercel dev`) na danych z seeda: wyszukiwanie, ulubiony na górze po odświeżeniu, ostatni klient po odświeżeniu. **Step 3:** Commit `feat: lista i karta klienta, preferencje`.

### Task 6: Formularze admina i katalog — po Task 4 (równolegle z 5 i 7)

**Files:** Create `public/js/client-form.js`, `public/js/catalog.js`, `public/katalog.html`

- Formularz klienta (nowy/edycja, w `#card`): nazwa (wymagana), notatki; lista baz (silnik select Oracle/PostgreSQL, wersja tekst wymagana, etykieta opcjonalna, dodaj/usuń); lista modułów z katalogu (checkbox) → po zaznaczeniu checkboxy baz tego klienta i checkboxy funkcji płatnych modułu. Zapis: `before = getClient`, `saveClient`, `after = getClient`, `changedSections` → jeśli `created` lub `sections.length` → `authFetch('/api/notify', …)`; błąd notify → komunikat „Zapisano, ale nie udało się wysłać e-maila”.
- `katalog.html` (dla nie-admina komunikat „Brak dostępu”): moduły (kod, nazwa) i ich funkcje — dodaj/edytuj/usuń (potwierdzenie usunięcia: „usunie też powiązania u klientów”).
- [ ] **Step 1:** Implementacja. **Step 2:** Ręczny test: nowy klient z dwiema bazami i modułem na obu → karta pokazuje poprawnie; zmiana wersji → zapis OK. **Step 3:** Commit `feat: formularze admina i katalog`.

### Task 7: Czat „Zapytaj AI” — po Task 4 (równolegle z 5 i 6)

**Files:** Create `public/js/ai.js`

- `mountAi(el)`: pole tekstowe (maxlength 500), przycisk „Zapytaj”, historia pytań/odpowiedzi w sesji, stan „Myślę…”, błąd pokazany pod polem; `authFetch('/api/ask', {question})`. Podpis: „AI tylko czyta dane — nic nie zmienia”.
- [ ] **Step 1:** Implementacja. **Step 2:** Ręczny test: „którzy klienci mają Oracle 19c i moduł PLZ?” zgodnie z seedem. **Step 3:** Commit `feat: czat Zapytaj AI`.

### Task 8: Przegląd bezpieczeństwa, README, GitHub, wdrożenie

**Files:** Create `README.md`

- [ ] **Step 1: Przegląd** (osobny agent-recenzent): `grep` po `public/` i historii git na `sk-ant`, `service_role`, `sk_`, `whsec_`, hasła → brak; RLS zgodne z Task 1; każdy `/api` (poza config/webhook) woła `verifyRequest`; `/api/notify` woła `assertAdmin`.
- [ ] **Step 2: README** po polsku: opis, zrzut funkcji, konfiguracja krok po kroku — Supabase (SQL Editor: schema → rls → seed; Third-party auth → Clerk), Clerk (aplikacja, tryb Waitlist, integracja Supabase, customize session token: `{"app_role":"{{user.public_metadata.role}}","email":"{{user.primary_email_address}}"}`, nadanie sobie `publicMetadata {"role":"admin"}`, webhook `waitlistEntry.created` → `https://<app>.vercel.app/api/clerk-webhook`, ścieżki sign-up `/rejestracja.html`), Gmail (2FA + hasło aplikacji), Anthropic (limit wydatków), Vercel (import repo, env), konto demo podgląd, lista smoke testów.
- [ ] **Step 3:** Commit, utworzenie repo na GitHub (`gh repo create mapa-klientow --private --source . --push` — **widoczność potwierdza użytkownik**).
- [ ] **Step 4:** Wdrożenie z użytkownikiem: import w Vercel, env, ustawienie webhooka i domeny w Clerk.
- [ ] **Step 5: Smoke test** na produkcji: prośba o konto → e-mail do admina; akceptacja → rejestracja; podgląd nie widzi „Edytuj”, a próba zapisu z konsoli (`getSupabase().from('clients').insert({name:'X'})`) zwraca błąd; zmiana wersji bazy → e-mail; pytanie AI → poprawna odpowiedź.

---

## Kolejność i równoległość

`Task 0` → równolegle **[Task 1 | Task 2→3 | Task 4]** → równolegle **[Task 5 | Task 6 | Task 7]** → `Task 8`.
W tym czasie użytkownik zakłada Clerk/Vercel/Gmail i wkleja SQL do Supabase po Task 1.

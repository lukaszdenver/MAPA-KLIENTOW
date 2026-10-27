# Mapa Klientów

Szybki podgląd „kto co ma": u każdego klienta widać **bazy danych** (Oracle / PostgreSQL + wersja), **moduły** (z oznaczeniem, na której bazie działają) i **funkcje płatne** włączone w modułach. Dane wprowadza ręcznie admin w formularzach — to nie jest monitoring na żywo.

> **Dane przykładowe — nie wpisuj prawdziwych danych klientów.** Aplikacja jest publiczna w internecie. Nazwy modułów w seedzie są prawdziwe, ale klienci i funkcje płatne są fikcyjne.

## Funkcje i role

| Funkcja | admin | podgląd |
|---|---|---|
| Lista klientów, wyszukiwarka (nazwa, moduł, baza), karta klienta | tak | tak |
| Ulubieni klienci (gwiazdka), przełącznik e-maili o zmianach, pamiętanie ostatniego klienta | tak | tak |
| „Zapytaj AI" (Claude tylko czyta dane, nie ma żadnych narzędzi do zapisu) | tak | tak |
| Dodawanie / edycja / usuwanie klientów, baz, modułów, funkcji płatnych | tak | **nie** |
| Katalog modułów i funkcji płatnych (`katalog.html`) | tak | **nie** |
| E-mail o prośbie o konto (Waitlist) | tak (na `ADMIN_EMAIL`) | – |

Rola to `publicMetadata.role` użytkownika w Clerk: `"admin"` = admin, brak = podgląd. Uprawnienia egzekwuje baza (RLS), nie tylko interfejs.

## Architektura

1. **Frontend** — statyczne HTML/CSS/JS (bez frameworka i bez budowania) w `public/`; Clerk i Supabase ładowane z CDN.
2. **Logowanie** — Clerk (SignIn, Waitlist, SignUp, UserButton); token sesji zawiera claimy `app_role` i `email`.
3. **Dane** — Supabase (Postgres). Przeglądarka łączy się z nim tokenem Clerk (Third-Party Auth); **RLS**: odczyt dla zalogowanych, zapis tylko `app_role = admin`.
4. **API** — funkcje serverless Vercel w `api/` (`/api/config`, `/api/notify`, `/api/ask`, `/api/clerk-webhook`); sekrety tylko w zmiennych środowiskowych.
5. **E-mail** — Nodemailer + Gmail (hasło aplikacji); **AI** — Claude (Anthropic API) z zrzutem danych wczytanym kluczem `service_role` wyłącznie SELECT-em.
6. Hosting: Vercel (preset „Other", bez builda), kod: GitHub.

### Mapa plików

| Ścieżka | Zawartość |
|---|---|
| `public/` | strony: `index.html` (logowanie, lista, karta, czat AI), `katalog.html` (admin), `rejestracja.html` (SignUp z zaproszenia); `js/`, `css/` |
| `api/` | `config.js` (klucze publiczne dla przeglądarki), `notify.js` (e-mail o zmianie, tylko admin), `ask.js` (Zapytaj AI), `clerk-webhook.js` (e-mail o nowej prośbie o konto) |
| `lib/` | wspólna logika serwera: weryfikacja tokenu Clerk, e-maile, snapshot dla AI, walidacja, klient Supabase admin |
| `supabase/` | `schema.sql`, `rls.sql`, `save_client.sql`, `seed.sql` |
| `tests/` | testy `node:test` |
| `docs/superpowers/` | specyfikacja i plan projektu |
| `vercel.json` | `outputDirectory: public` |
| `.env.example` | lista zmiennych środowiskowych (bez wartości) |

## Konfiguracja krok po kroku

Kolejność: **Supabase → Clerk → Gmail → Anthropic → Vercel → powrót do Clerk**. Adres aplikacji `https://<app>.vercel.app` poznasz dopiero po pierwszym wdrożeniu na Vercel — wtedy dokończ kroki Clerk oznaczone „po wdrożeniu".

### 1. Supabase

1. Otwórz projekt w Supabase → **SQL Editor** → **New query**.
2. Wklej i uruchom (**Run**) po kolei, każdy plik osobno, **w tej kolejności**:
   1. `supabase/schema.sql`
   2. `supabase/rls.sql`
   3. `supabase/save_client.sql`
   4. `supabase/seed.sql` (moduły + fikcyjni klienci)
3. **Authentication → Sign In / Providers → Third-Party Auth → Add provider → Clerk** i wpisz **Clerk domain** (Frontend API URL z Clerk, np. `xxxx.clerk.accounts.dev`; w Clerk: **Configure → Developers → API Keys → Show API URLs**). Zrób to po założeniu aplikacji w Clerk (krok 2).
4. Klucze (**Project Settings → API**; w nowszych panelach także **API Keys**):
   - `SUPABASE_URL` — Project URL,
   - `SUPABASE_ANON_KEY` — klucz `anon` / public (jawny, ale bez uprawnień bez logowania),
   - `SUPABASE_SERVICE_ROLE_KEY` — klucz `service_role` (**tajny**, omija RLS).

### 2. Clerk

1. Załóż konto na clerk.com (możesz przez GitHub) → **Create application**; wybierz metody logowania (np. e-mail). Powstaje instancja **Development** — baner „Development mode" jest na szkoleniu akceptowalny.
2. **Configure → User & authentication → Restrictions → Sign-up mode → Waitlist** (rejestracja tylko po zatwierdzeniu prośby).
3. **Integrations → Supabase → Activate** (dodaje do tokenu claim `role: authenticated`). Domenę Clerk wpisz w Supabase (krok 1.3).
4. **Configure → Sessions → Customize session token** → wklej i zapisz:
   ```json
   {"app_role":"{{user.public_metadata.role}}","email":"{{user.primary_email_address}}"}
   ```
5. **Twoje konto admina:** zaloguj się raz do aplikacji (lub utwórz użytkownika w **Users → Create user**), następnie **Users →** swój użytkownik → **Public metadata → Edit** → wpisz:
   ```json
   {"role":"admin"}
   ```
   Zmiana roli działa po odświeżeniu tokenu (**ok. 60 sekund**) lub po ponownym zalogowaniu.
6. **API Keys:** skopiuj `CLERK_PUBLISHABLE_KEY` (`pk_test_…`, publiczny) i `CLERK_SECRET_KEY` (`sk_test_…`, **tajny**).
7. **Po wdrożeniu — Paths:** **Configure → Developers → Paths** → *Sign-up URL* ustaw na `https://<app>.vercel.app/rejestracja.html` (tu ląduje link z zaproszenia).
8. **Po wdrożeniu — Webhook:** **Configure → Developers → Webhooks → Add Endpoint**: URL `https://<app>.vercel.app/api/clerk-webhook`, zdarzenie **`waitlistEntry.created`**. Po zapisaniu skopiuj **Signing Secret** (`whsec_…`) → `CLERK_WEBHOOK_SECRET` w Vercel (**tajny**), potem zrób redeploy.

### 3. Gmail (wysyłka e-maili)

1. Użyj (lub załóż) konta Gmail. Włącz **weryfikację dwuetapową (2FA)**: myaccount.google.com → Bezpieczeństwo.
2. Wejdź na myaccount.google.com/apppasswords, utwórz **hasło aplikacji** (np. nazwa „Mapa Klientow") i skopiuj 16 znaków.
3. `GMAIL_USER` = adres Gmail, `GMAIL_APP_PASSWORD` = to hasło (**tajne**; to nie jest zwykłe hasło do konta).

### 4. Anthropic (Zapytaj AI)

1. console.anthropic.com → **API Keys → Create Key** → `ANTHROPIC_API_KEY` (**tajny**, `sk-ant-…`).
2. **Ustaw limit wydatków** (w konsoli: **Settings → Limits → Spend limit**), żeby nikt nie wygenerował rachunku. Aplikacja używa modelu `claude-sonnet-5-5`.

### 5. Vercel (wdrożenie)

1. vercel.com → logowanie przez GitHub → **Add New → Project → Import** repozytorium `mapa-klientow`.
2. **Framework Preset: Other**. **Build Command:** puste (bez builda). **Output Directory:** `public` (ustawia to `vercel.json`; nie zmieniaj). Install Command: domyślne (`npm install`).
3. W **Environment Variables** dodaj wszystkie zmienne z tabeli poniżej → **Deploy**.
4. Po wdrożeniu zanotuj adres `https://<app>.vercel.app` i dokończ kroki „po wdrożeniu" w Clerk (2.7, 2.8).
5. **Każda zmiana zmiennych wymaga redeployu:** Deployments → ostatni → **⋯ → Redeploy**.

### Zmienne środowiskowe

| Zmienna | Skąd | Sekret? |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic Console → API Keys | **tak** |
| `GMAIL_USER` | adres konta Gmail | nie |
| `GMAIL_APP_PASSWORD` | Google → Hasła aplikacji (wymaga 2FA) | **tak** |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL | nie (trafia do przeglądarki) |
| `SUPABASE_ANON_KEY` | Supabase → API → klucz `anon` | nie (trafia do przeglądarki) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → klucz `service_role` | **tak** |
| `CLERK_PUBLISHABLE_KEY` | Clerk → API Keys (`pk_…`) | nie (trafia do przeglądarki) |
| `CLERK_SECRET_KEY` | Clerk → API Keys (`sk_…`) | **tak** |
| `CLERK_WEBHOOK_SECRET` | Clerk → Webhooks → Signing Secret (`whsec_…`) | **tak** |
| `ADMIN_EMAIL` | Twój adres — tu przychodzą prośby o konto | nie |

Przeglądarka dostaje tylko trzy wartości oznaczone „trafia do przeglądarki", przez `GET /api/config`.

## Uruchomienie lokalne

Wymagany Node.js 20+ (Vercel CLI pobierze `npx`).

```bash
npm install
copy .env.example .env      # PowerShell/cmd; w Git Bash: cp .env.example .env
# uzupełnij .env wartościami z tabeli powyżej
npx vercel dev
```

Przy pierwszym uruchomieniu `vercel dev` poprosi o zalogowanie i powiązanie projektu. Aplikacja działa na `http://localhost:3000`. Webhook Clerk nie dotrze na localhost (potrzebny publiczny adres) — e-mail o prośbie o konto sprawdzaj na Vercelu.

## Testy

```bash
npm test
```

Pokrywają: **SQL i RLS** (schemat, polityki i `save_client` uruchamiane w `pglite` — podgląd nie zapisze, anon nie czyta), **biblioteki serwerowe** (`lib/`: weryfikacja roli, walidacja, e-maile, snapshot dla AI) oraz **czyste funkcje frontendu** (filtrowanie, diff, model formularza, lista). Nie wymagają kluczy ani sieci.

## Konto demo dla prowadzącego (rola podgląd)

Prowadzący dostaje konto **bez roli admin** — może wszystko czytać, ale nie edytować:

- **Przez Waitlist:** prowadzący wchodzi na aplikację → „Poproś o konto" i podaje e-mail → Ty dostajesz e-mail → w Clerk (**Waitlist**) zatwierdzasz wpis (**Invite**) → prowadzący klika link z zaproszenia (trafia na `rejestracja.html`).
- **Albo zaproszenie bezpośrednie:** Clerk → **Users → Invite** → e-mail prowadzącego.

Nie ustawiaj mu `publicMetadata.role`.

## Smoke test po wdrożeniu

- [ ] Prośba o konto (Waitlist) → do `ADMIN_EMAIL` przychodzi e-mail.
- [ ] Akceptacja wpisu w Clerk → link z zaproszenia otwiera `rejestracja.html` → rejestracja kończy się zalogowaniem.
- [ ] Admin widzi „Edytuj" i katalog; zapis klienta / zmiana wersji bazy → e-mail do użytkowników z włączonymi powiadomieniami.
- [ ] Podgląd **nie widzi** „Edytuj" ani katalogu.
- [ ] Podgląd, w konsoli DevTools (moduły ES nie są globalne): `const { getSupabase } = await import('/js/app-init.js'); await getSupabase().from('clients').insert({ name: 'X' })` zwraca **błąd** RLS (`error` w odpowiedzi).
- [ ] „Zapytaj AI", np. „którzy klienci mają Oracle i moduł PLZ?" → poprawna odpowiedź po polsku.
- [ ] Ulubione (gwiazdka) i przełącznik e-maili zapamiętują się po odświeżeniu.

Przy problemach z rolą: odczekaj ok. 60 s albo wyloguj się i zaloguj ponownie.

## Bezpieczeństwo

- Klucze (`ANTHROPIC_API_KEY`, `GMAIL_APP_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`) żyją **wyłącznie w zmiennych środowiskowych Vercel**; nie ma ich w kodzie ani w `public/`.
- **Nigdy nie commituj `.env`** (jest w `.gitignore`; w repo jest tylko `.env.example` bez wartości). Jeśli klucz kiedyś trafi do repo — unieważnij go i wygeneruj nowy.
- Baza: `anon` nie ma żadnych uprawnień; zapis tylko dla roli admin (RLS); Claude nie ma narzędzi zapisu.
- Ustaw limit wydatków w Anthropic; używaj wyłącznie danych przykładowych.

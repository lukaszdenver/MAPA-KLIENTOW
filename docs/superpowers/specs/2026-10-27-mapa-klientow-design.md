# Mapa Klientów — projekt (design)

Data: 2026-10-27 · Autor wymagań: Łukasz Seryca · Źródło bazowe: `Materiały pomocnicze/mapa-klientow-karta-technologii.html`

## 1. Po co to jest

Informacje o tym, **co ma dany klient** (jakie podsystemy/moduły, jakie funkcje płatne w ramach modułów, na jakich bazach danych i w jakich wersjach) są dziś rozproszone po różnych miejscach w firmie. Automatyczne ich zbieranie jest na teraz zbyt skomplikowane. Aplikacja ma być **szybkim podglądem „kto co ma”**, zasilanym **ręcznie przez admina w formularzach** — nie monitoringiem na żywo.

Kontekst: projekt końcowy kursu Claude Code — aplikacja musi powstać w **~4 godziny** i trafić na GitHub + publiczny hosting.

## 2. Cele

1. Logowanie przez **Clerk** (gotowe komponenty: logowanie, prośba o konto, menu użytkownika). Członek zespołu prosi o konto podając e-mail, admin je akceptuje w panelu Clerk.
2. Role: **admin** (kierownik produktu — edytuje) i **podgląd** (wszyscy pozostali — tylko czytają).
3. **Lista klientów** z wyszukiwarką → **karta klienta**.
4. Karta klienta pokazuje:
   - **bazy danych klienta** — może być kilka, każda = silnik (`Oracle` / `PostgreSQL`) + wersja (np. `19c`, `15`);
   - **moduły** klienta, a przy każdym module **znacznik, na której/których bazach klienta działa** (tylko Oracle, tylko Postgres albo obie);
   - **funkcje płatne** włączone u klienta — osobno dla każdego modułu.
5. **Stały katalog** modułów i funkcji płatnych (każda funkcja płatna należy do jednego modułu). Admin definiuje katalog raz na osobnym ekranie, a u klienta tylko zaznacza (checkboxy).
6. Admin dodaje/edytuje/usuwa klientów, ich bazy, moduły, powiązania modułów z bazami i funkcje płatne — w formularzach. Dane w **Supabase (Postgres)**.
7. **Preferencje użytkownika**: przypięci ulubieni klienci na górze listy; włącz/wyłącz e-maile o zmianach; aplikacja pamięta ostatnio otwartego klienta.
8. **Powiadomienia e-mail** (Gmail + Nodemailer): nowy klient, nowy moduł u klienta, zmiana bazy/wersji bazy u klienta, zmiana funkcji płatnych → e-mail do użytkowników, którzy mają włączone e-maile. Admin dostaje e-mail o nowej prośbie o konto.
9. **„Zapytaj AI”** — czat odpowiadający na pytania o dane (np. „którzy klienci mają Oracle 10g i moduł PLZ?”). Claude **tylko czyta** — nigdy nie zmienia ani nie usuwa danych.
10. Kod na **GitHub**, aplikacja na **Vercel**.

## 3. Nie-cele

- Brak importu z systemów firmowych, brak monitoringu na żywo, brak importu z Excela.
- Brak historii zmian / audytu (poza e-mailami).
- Brak więcej niż dwóch ról.
- Brak frameworka frontendowego (React itp.) i kroku budowania.

## 4. Anty-cele (porażka, nawet jeśli „działa”)

- Klucz Anthropic API, hasło Gmail albo klucz `service_role` Supabase widoczne w kodzie strony / w repo.
- Użytkownik „podgląd” (lub czat AI) jest w stanie zmienić dane.
- Prawdziwe dane klientów w publicznej aplikacji — **tylko dane przykładowe** (fikcyjni klienci).
- Nie zdążyć w 4 h, bo utknęliśmy na „ładnościach” — działający przepływ ma pierwszeństwo przed wyglądem.

## 5. Ograniczenia

- Czas: ~4 h łącznie (projekt + plan + budowa + wdrożenie).
- Stos z karty technologii: **HTML + JavaScript + CSS bez frameworka**, Supabase, Clerk, Claude API, Vercel (statyczne strony + funkcje `/api`), Gmail + Nodemailer, GitHub.
- Konta: Supabase, GitHub, klucz Anthropic — są. **Clerk i Vercel — do założenia** (logowanie przez GitHub). **Gmail — użytkownik zakłada konto** i generuje hasło aplikacji (wymaga 2FA).
- Połączenie MCP z Supabase w tej sesji nie jest autoryzowane → schemat bazy dostarczamy jako pliki `.sql` do wklejenia w SQL Editor Supabase.
- Środowisko dewelopera: Windows 11.

## 6. Decyzje użytkownika

- Dane wprowadzane **formularzem w aplikacji** (nie Excel).
- **Kilka baz na klienta**; przy module klienta znacznik, na których bazach działa.
- **Stały katalog** modułów i funkcji płatnych.
- Logowanie: **Clerk** (świadomie, mimo dodatkowej konfiguracji integracji z Supabase) — ze względu na **gotowe komponenty**.
- E-mail o zmianie: **co zmieniono (sekcja) + aktualny stan klienta**, bez różnicy stare→nowe; **jeden e-mail na zapis formularza**.
- Dane startowe: **prawdziwe nazwy modułów** (PLZ, WPBUD, WYBUD, FK, KP, …), **fikcyjne funkcje płatne i fikcyjni klienci**; prawdziwe funkcje użytkownik dopisze ręcznie.

## 7. Decyzje projektowe (moje — do sprawdzenia)

### 7.1 Architektura
- Statyczne strony w `public/` (HTML/CSS/JS, moduły ES), biblioteki z CDN: `@clerk/clerk-js`, `@supabase/supabase-js` (jsDelivr, przypięte wersje).
- Funkcje serverless Vercel w `api/` (Node.js): `/api/notify`, `/api/ask`, `/api/clerk-webhook`.
- Sekrety wyłącznie w zmiennych środowiskowych Vercel: `ANTHROPIC_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `ADMIN_EMAIL`. Do przeglądarki trafiają tylko klucze publiczne: Clerk publishable key, Supabase URL + anon key — przez `GET /api/config` (bez kroku budowania).
- Vercel preset „Other”: `public/` + `api/` bez builda; `package.json` z `"type": "module"` i zależnościami funkcji (`nodemailer`, `@anthropic-ai/sdk`, `@supabase/supabase-js`, `@clerk/backend`, `svix`).
- Znane ograniczenie: e-mail o zmianie wysyła drugie wywołanie z przeglądarki po zapisie — jeśli się nie uda, e-mail przepada (akceptowalne w tym zakresie; frontend pokazuje ostrzeżenie).

### 7.2 Logowanie i role (Clerk ↔ Supabase)
- Clerk w trybie **Waitlist** (Restricted/waitlist): użytkownik zgłasza się gotowym komponentem `Waitlist` podając e-mail, admin zatwierdza w panelu Clerk → Clerk wysyła zaproszenie. Link z zaproszenia prowadzi na **rejestrację** — aplikacja musi mieć gotowy komponent `SignUp` obsługujący parametr `__clerk_ticket` (np. `rejestracja.html`). Logowanie gotowym `SignIn`, menu `UserButton`.
- *Moja decyzja:* instancja Clerk **Development** na domenie `*.vercel.app` (produkcyjna wymaga własnej domeny) — baner „Development mode” akceptowalny na szkoleniu.
- *Moja decyzja:* do pokazania szkolącemu admin zaprasza z panelu Clerk jedno konto demo z rolą podgląd; opis w README.
- Rola w Clerk: `publicMetadata.role = "admin"` ustawiana ręcznie w panelu Clerk; brak = podgląd.
- **Natywna integracja Clerk jako „third-party auth” w Supabase** (włączona z panelu Clerk „Supabase integration” — dodaje claim `role: authenticated`): klient Supabase dostaje token sesji Clerk (`accessToken: () => Clerk.session.getToken()`). Token sesji Clerk dostaje dodatkowe claimy `app_role` = `{{user.public_metadata.role}}` i `email` = `{{user.primary_email_address}}`.
- Identyfikatory Clerk to tekst (`user_…`) — wszędzie kolumny `text` i `auth.jwt()->>'sub'`, **nigdy `auth.uid()`**.
- **RLS**: polityki odczytu na rolę `authenticated` (nie `public` — klucz anon jest jawny); zapis tylko gdy `auth.jwt()->>'app_role' = 'admin'`; preferencje/ulubione — tylko własne wiersze (`sub`). E-mail w `user_prefs` brany z claimu tokenu (np. `default auth.jwt()->>'email'` / sprawdzenie w polityce), nie z formularza.
- Zmiana roli działa po odświeżeniu tokenu (~60 s) — uwzględnić w teście.
- Webhook Clerk `waitlistEntry.created` → `/api/clerk-webhook` (weryfikacja podpisu Svix) → e-mail do `ADMIN_EMAIL`. Przy implementacji sprawdzić, że to zdarzenie istnieje w katalogu webhooków Clerk; jeśli nie — pominąć ten e-mail i opisać w README.

### 7.3 Model danych (Supabase)
- `clients` (id, name, notes, created_at, updated_at)
- `client_databases` (id, client_id → clients, engine `oracle|postgres`, version text, label text null)
- `modules` (id, code unique, name) — katalog
- `paid_features` (id, module_id → modules, name) — katalog
- `client_modules` (id, client_id, module_id, unique(client_id, module_id))
- `client_module_databases` (client_module_id, client_database_id) — znacznik „moduł działa na bazie”
- `client_module_features` (client_module_id, paid_feature_id)
- `user_prefs` (clerk_user_id pk, email, notify_changes bool default true, last_client_id null)
- `user_favorites` (clerk_user_id, client_id, pk obu)
- Usuwanie kaskadowe w dół (klient → jego bazy/moduły/powiązania).
- Pliki: `supabase/schema.sql`, `supabase/rls.sql`, `supabase/seed.sql` (katalog modułów + 5–8 fikcyjnych klientów).

### 7.4 Ekrany (`public/`)
- `index.html` — niezalogowany: `SignIn` + link „Poproś o konto” (`Waitlist`); zalogowany: lista klientów (wyszukiwarka po nazwie, module, bazie; ulubieni na górze, gwiazdka do przypinania), po prawej/poniżej karta klienta. Po wejściu otwiera ostatnio oglądanego klienta.
- Karta klienta: sekcje Bazy / Moduły (z odznakami baz) / Funkcje płatne per moduł. Admin widzi przycisk „Edytuj” → formularz w tym samym widoku.
- `katalog.html` (tylko admin) — moduły i ich funkcje płatne.
- `ai.html` (lub panel na stronie głównej) — czat „Zapytaj AI”.
- Ustawienia użytkownika (przełącznik e-maili) — w małym panelu / w menu.
- Wygląd: prosty, czytelny, responsywny; własny CSS z tokenami kolorów, tryb jasny/ciemny.

### 7.5 Powiadomienia e-mail
- Po udanym zapisie admina frontend woła `POST /api/notify` z typem zdarzenia i identyfikatorem klienta. Funkcja **weryfikuje token Clerk i rolę admin**, odczytuje (kluczem service role) adresy z `user_prefs` gdzie `notify_changes = true`, buduje treść z aktualnych danych z bazy i wysyła przez Nodemailer (Gmail SMTP, hasło aplikacji).
- Rekord `user_prefs` (z e-mailem) tworzy się przy pierwszym logowaniu użytkownika.

### 7.6 Zapytaj AI
- `POST /api/ask` weryfikuje token Clerk, pobiera **pełny zrzut danych tylko SELECT-ami** (dane są małe — dziesiątki klientów), przekazuje go jako kontekst do Claude razem z pytaniem. **Claude nie dostaje żadnych narzędzi** → nie ma fizycznej możliwości zmiany danych. Odpowiedź po polsku.
- Model: aktualny Claude Sonnet (szybki, tani) — dokładny identyfikator do sprawdzenia przy implementacji (skill `claude-api`). Limit długości pytania; w konsoli Anthropic użytkownik ustawia limit wydatków.

### 7.7 Testy i jakość
- Testy jednostkowe (`node:test`) dla czystych funkcji: budowanie zrzutu danych dla AI, budowanie treści e-maili, walidacja wejścia `/api`.
- Ręczna lista kontrolna smoke testu po wdrożeniu (logowanie, rola podgląd nie może zapisać — sprawdzone też bezpośrednio wywołaniem Supabase, e-mail, AI).

### 7.8 Repo i publikacja
- Repo `mapa-klientow` na GitHub (README po polsku: opis, konfiguracja kont, zmienne środowiskowe, uruchomienie lokalne `vercel dev`, wdrożenie). `.env.example`, `.gitignore` z `.env*`.

## 8. Organizacja pracy (drużyna agentów)

Orkiestrator (Opus) prowadzi plan i przegląda wyniki; równolegle podagenci:
1. **Baza** — `schema.sql`, `rls.sql`, `seed.sql`.
2. **Frontend** — strony, CSS, integracja Clerk + Supabase w przeglądarce.
3. **API** — `/api/notify`, `/api/ask`, `/api/clerk-webhook` + testy.
4. **Recenzent** — przegląd bezpieczeństwa (sekrety, RLS) i spójności przed wdrożeniem.

Równolegle użytkownik zakłada Clerk, Vercel, Gmail (hasło aplikacji) wg instrukcji krok po kroku.

Orientacyjny podział czasu: 0:00–0:30 projekt + plan + zakładanie kont · 0:30–2:30 budowa · 2:30–3:15 konfiguracja Clerk/Supabase/Vercel i wdrożenie · 3:15–4:00 testy, poprawki, README.

## 9. Pozostawione builderowi

Dokładny układ ekranów i styl, nazwy plików JS, sposób podania kluczy publicznych do przeglądarki, treść e-maili, prompt systemowy czatu, szczegóły walidacji formularzy.

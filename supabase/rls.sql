-- Mapa Klientów — RLS. Identyfikator użytkownika = Clerk `sub` (tekst), rola = claim `app_role`.
-- Wymaga schema.sql. Brak jakichkolwiek uprawnień i polityk dla `anon`.

-- Tabele danych i katalogu: odczyt dla zalogowanych, zapis tylko admin.
do $$
declare t text;
begin
  foreach t in array array[
    'clients', 'client_databases', 'modules', 'paid_features',
    'client_modules', 'client_module_databases', 'client_module_features'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_select', t);
    execute format($p$create policy %I on %I for insert to authenticated
      with check (auth.jwt()->>'app_role' = 'admin')$p$, t || '_admin_insert', t);
    execute format($p$create policy %I on %I for update to authenticated
      using (auth.jwt()->>'app_role' = 'admin')
      with check (auth.jwt()->>'app_role' = 'admin')$p$, t || '_admin_update', t);
    execute format($p$create policy %I on %I for delete to authenticated
      using (auth.jwt()->>'app_role' = 'admin')$p$, t || '_admin_delete', t);
  end loop;
end $$;

-- Dane osobiste: tylko własne wiersze.
alter table user_prefs enable row level security;
grant select, insert, update, delete on user_prefs to authenticated;

create policy user_prefs_select on user_prefs for select to authenticated
  using (clerk_user_id = auth.jwt()->>'sub');
create policy user_prefs_insert on user_prefs for insert to authenticated
  with check (clerk_user_id = auth.jwt()->>'sub' and email = auth.jwt()->>'email');
create policy user_prefs_update on user_prefs for update to authenticated
  using (clerk_user_id = auth.jwt()->>'sub')
  with check (clerk_user_id = auth.jwt()->>'sub' and email = auth.jwt()->>'email');
create policy user_prefs_delete on user_prefs for delete to authenticated
  using (clerk_user_id = auth.jwt()->>'sub');

alter table user_favorites enable row level security;
grant select, insert, update, delete on user_favorites to authenticated;

create policy user_favorites_select on user_favorites for select to authenticated
  using (clerk_user_id = auth.jwt()->>'sub');
create policy user_favorites_insert on user_favorites for insert to authenticated
  with check (clerk_user_id = auth.jwt()->>'sub');
create policy user_favorites_update on user_favorites for update to authenticated
  using (clerk_user_id = auth.jwt()->>'sub')
  with check (clerk_user_id = auth.jwt()->>'sub');
create policy user_favorites_delete on user_favorites for delete to authenticated
  using (clerk_user_id = auth.jwt()->>'sub');

-- Mapa Klientów — atomowy zapis klienta („zastąp zestaw”) jako funkcja RPC.
-- Wczytać po schema.sql i rls.sql. Wywołanie z przeglądarki: supabase.rpc('save_client', { p: form }).
--
-- p = { id?, name, notes,
--       databases: [{ id?, engine: 'oracle'|'postgres', version, label }],
--       modules:   [{ module_id, database_refs: (id | 'new:<i>')[], feature_ids: [] }] }
-- 'new:<i>' = indeks i (od 0) w p.databases (działa też dla bazy z id).
-- SECURITY INVOKER: obowiązuje RLS wywołującego — zapisuje tylko admin.
-- Cała funkcja wykonuje się w jednej transakcji: każdy błąd cofa wszystkie zmiany.

create or replace function public.save_client(p jsonb) returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id     bigint;
  v_name   text := btrim(coalesce(p->>'name', ''));
  v_notes  text := nullif(btrim(coalesce(p->>'notes', '')), '');
  v_dbs    jsonb := coalesce(p->'databases', '[]'::jsonb);
  v_mods   jsonb := coalesce(p->'modules', '[]'::jsonb);
  v_n_dbs  int;
  v_keep   bigint[];
  v_db_ids bigint[] := '{}';   -- pozycja w p.databases (od 1) -> id bazy
  v_db     jsonb;
  v_ord    int;
  v_db_id  bigint;
  v_engine text;
  v_ver    text;
  v_mod    jsonb;
  v_mod_id bigint;
  v_cm_id  bigint;
  v_ref    text;
  v_idx    int;
  v_feat   bigint;
begin
  -- ---------- Walidacja (przed jakimkolwiek zapisem) ----------
  if v_name = '' then
    raise exception 'Podaj nazwę klienta.';
  end if;
  if jsonb_typeof(v_dbs) <> 'array' or jsonb_typeof(v_mods) <> 'array' then
    raise exception 'Nieprawidłowe dane formularza (bazy i moduły muszą być listami).';
  end if;
  if nullif(p->>'id', '') is not null then
    v_id := (p->>'id')::bigint;
  end if;
  v_n_dbs := jsonb_array_length(v_dbs);

  for v_db in select value from jsonb_array_elements(v_dbs) loop
    v_engine := v_db->>'engine';
    v_ver := btrim(coalesce(v_db->>'version', ''));
    if v_engine is null or v_engine not in ('oracle', 'postgres') then
      raise exception 'Nieprawidłowy silnik bazy: % (dozwolone: oracle, postgres).', coalesce(v_engine, 'brak');
    end if;
    if v_ver = '' then
      raise exception 'Podaj wersję bazy danych.';
    end if;
    if nullif(v_db->>'id', '') is not null and v_id is null then
      raise exception 'Nowy klient nie może mieć istniejących baz (id %).', v_db->>'id';
    end if;
  end loop;

  select coalesce(array_agg((value->>'id')::bigint), '{}')
    into v_keep
    from jsonb_array_elements(v_dbs)
   where nullif(value->>'id', '') is not null;

  if (select count(*) <> count(distinct value->>'module_id') from jsonb_array_elements(v_mods)) then
    raise exception 'Ten sam moduł został wybrany więcej niż raz.';
  end if;

  for v_mod in select value from jsonb_array_elements(v_mods) loop
    if nullif(v_mod->>'module_id', '') is null then
      raise exception 'Brak identyfikatora modułu.';
    end if;
    v_mod_id := (v_mod->>'module_id')::bigint;
    if not exists (select 1 from modules where id = v_mod_id) then
      raise exception 'Nie ma modułu o id % w katalogu.', v_mod_id;
    end if;
    for v_ref in select value from jsonb_array_elements_text(coalesce(v_mod->'database_refs', '[]'::jsonb)) loop
      if v_ref like 'new:%' then
        v_idx := nullif(substr(v_ref, 5), '')::int;
        if v_idx is null or v_idx < 0 or v_idx >= v_n_dbs then
          raise exception 'Moduł wskazuje nieistniejącą bazę (%).', v_ref;
        end if;
      elsif v_ref ~ '^[0-9]+$' then
        if not (v_ref::bigint = any (v_keep)) then
          raise exception 'Moduł wskazuje bazę %, której nie ma na liście baz klienta (usunięta?).', v_ref;
        end if;
      else
        raise exception 'Nieprawidłowe odwołanie do bazy: %.', v_ref;
      end if;
    end loop;
    for v_feat in select value::bigint from jsonb_array_elements_text(coalesce(v_mod->'feature_ids', '[]'::jsonb)) loop
      if not exists (select 1 from paid_features where id = v_feat and module_id = v_mod_id) then
        raise exception 'Funkcja płatna % nie należy do wybranego modułu.', v_feat;
      end if;
    end loop;
  end loop;

  -- ---------- Klient ----------
  if v_id is null then
    insert into clients (name, notes) values (v_name, v_notes) returning id into v_id;
  else
    update clients set name = v_name, notes = v_notes where id = v_id;
    if not found then
      raise exception 'Nie znaleziono klienta albo brak uprawnień (wymagana rola admin).';
    end if;
  end if;

  -- ---------- Bazy: usuń brakujące, zaktualizuj istniejące, dodaj nowe ----------
  delete from client_modules where client_id = v_id;  -- kaskada usuwa powiązania z bazami i funkcjami
  delete from client_databases where client_id = v_id and not (id = any (v_keep));

  for v_db, v_ord in select value, ordinality from jsonb_array_elements(v_dbs) with ordinality loop
    if nullif(v_db->>'id', '') is not null then
      update client_databases
         set engine = v_db->>'engine',
             version = btrim(v_db->>'version'),
             label = nullif(btrim(coalesce(v_db->>'label', '')), '')
       where id = (v_db->>'id')::bigint and client_id = v_id
       returning id into v_db_id;
      if v_db_id is null then
        raise exception 'Baza % nie należy do tego klienta.', v_db->>'id';
      end if;
    else
      insert into client_databases (client_id, engine, version, label)
      values (v_id, v_db->>'engine', btrim(v_db->>'version'), nullif(btrim(coalesce(v_db->>'label', '')), ''))
      returning id into v_db_id;
    end if;
    v_db_ids[v_ord] := v_db_id;
    v_db_id := null;
  end loop;

  -- ---------- Moduły i powiązania ----------
  for v_mod in select value from jsonb_array_elements(v_mods) loop
    v_mod_id := (v_mod->>'module_id')::bigint;
    insert into client_modules (client_id, module_id) values (v_id, v_mod_id) returning id into v_cm_id;

    insert into client_module_databases (client_module_id, client_database_id)
    select distinct v_cm_id,
           case when r like 'new:%' then v_db_ids[substr(r, 5)::int + 1] else r::bigint end
      from jsonb_array_elements_text(coalesce(v_mod->'database_refs', '[]'::jsonb)) as t(r);

    insert into client_module_features (client_module_id, paid_feature_id)
    select distinct v_cm_id, f::bigint
      from jsonb_array_elements_text(coalesce(v_mod->'feature_ids', '[]'::jsonb)) as t(f);
  end loop;

  return v_id;
end
$$;

revoke execute on function public.save_client(jsonb) from public, anon;
grant execute on function public.save_client(jsonb) to authenticated;

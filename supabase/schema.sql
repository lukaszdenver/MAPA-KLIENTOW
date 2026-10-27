-- Mapa Klientów — schemat bazy (Supabase / Postgres 15+).
-- Kolejność wczytania: schema.sql -> rls.sql -> seed.sql

create table clients (
  id         bigint generated always as identity primary key,
  name       text not null,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table client_databases (
  id        bigint generated always as identity primary key,
  client_id bigint not null references clients(id) on delete cascade,
  engine    text not null check (engine in ('oracle', 'postgres')),
  version   text not null,
  label     text
);
create index client_databases_client_idx on client_databases(client_id);

create table modules (
  id   bigint generated always as identity primary key,
  code text not null unique,
  name text not null
);

create table paid_features (
  id        bigint generated always as identity primary key,
  module_id bigint not null references modules(id) on delete cascade,
  name      text not null
);
create index paid_features_module_idx on paid_features(module_id);

create table client_modules (
  id        bigint generated always as identity primary key,
  client_id bigint not null references clients(id) on delete cascade,
  module_id bigint not null references modules(id) on delete cascade,
  unique (client_id, module_id)
);

create table client_module_databases (
  client_module_id   bigint not null references client_modules(id) on delete cascade,
  client_database_id bigint not null references client_databases(id) on delete cascade,
  primary key (client_module_id, client_database_id)
);
create index client_module_databases_db_idx on client_module_databases(client_database_id);

create table client_module_features (
  client_module_id bigint not null references client_modules(id) on delete cascade,
  paid_feature_id  bigint not null references paid_features(id) on delete cascade,
  primary key (client_module_id, paid_feature_id)
);
create index client_module_features_feature_idx on client_module_features(paid_feature_id);

create table user_prefs (
  clerk_user_id  text primary key,
  email          text not null,
  notify_changes boolean not null default true,
  last_client_id bigint references clients(id) on delete set null
);

create table user_favorites (
  clerk_user_id text not null,
  client_id     bigint not null references clients(id) on delete cascade,
  primary key (clerk_user_id, client_id)
);

create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger clients_set_updated_at
  before update on clients
  for each row execute function set_updated_at();

-- Mapa Klientów — dane startowe: prawdziwe kody modułów, fikcyjne funkcje płatne i fikcyjni klienci.
-- Wymaga schema.sql i rls.sql (wczytać jako rola z pominięciem RLS, np. SQL Editor).

insert into modules (code, name) values
  ('PLZ',   'Planowanie budżetu'),
  ('WPBUD', 'Wpływy budżetowe'),
  ('WYBUD', 'Wydatki budżetowe'),
  ('FK',    'Finansowo-Księgowy'),
  ('KP',    'Kadry i Płace'),
  ('GRU',   'Generalny Rejestr Umów'),
  ('WIND',  'Windykacja'),
  ('OFA',   'Fundusz Alimentacyjny'),
  ('SWR',   'Świadczenia rodzinne'),
  ('EON',   'Opłata śmieciowa (ewidencja odpadów)'),
  ('ENIER', 'Ewidencja nieruchomości'),
  ('MKO',   'Masowa korespondencja i obsługa wpłat');

-- Fikcyjne funkcje płatne (po 3 na moduł).
insert into paid_features (module_id, name)
select m.id, f.name
from modules m
cross join (values
  ('Eksport rozszerzony XLSX'),
  ('Integracja API'),
  ('Raporty zarządcze')
) as f(name);

insert into clients (name, notes) values
  ('Gmina Przykładowo', 'Fikcyjny klient demonstracyjny.'),
  ('Miasto Testowice',  'W trakcie migracji części modułów na PostgreSQL.'),
  ('Powiat Wzorcowy',   'Fikcyjny klient demonstracyjny.'),
  ('Gmina Nibylandia',  'Starsza instalacja, planowana aktualizacja bazy.'),
  ('Miasto Łódź Demo',  'Środowisko pokazowe; część modułów na dwóch bazach.'),
  ('Gmina Fikcyjna',    null);

insert into client_databases (client_id, engine, version, label)
select c.id, d.engine, d.version, d.label
from (values
  ('Gmina Przykładowo', 'oracle',   '19c', 'Produkcja'),
  ('Miasto Testowice',  'oracle',   '12c', 'Główna'),
  ('Miasto Testowice',  'postgres', '15',  'Nowa (PG)'),
  ('Powiat Wzorcowy',   'oracle',   '11g', 'Główna'),
  ('Gmina Nibylandia',  'oracle',   '10g', 'Stara'),
  ('Miasto Łódź Demo',  'oracle',   '19c', 'Produkcja'),
  ('Miasto Łódź Demo',  'postgres', '16',  'Raporty'),
  ('Gmina Fikcyjna',    'postgres', '16',  'Główna')
) as d(client, engine, version, label)
join clients c on c.name = d.client;

-- Moduły klientów.
insert into client_modules (client_id, module_id)
select c.id, m.id
from (values
  ('Gmina Przykładowo', 'PLZ'), ('Gmina Przykładowo', 'WPBUD'), ('Gmina Przykładowo', 'FK'),
  ('Miasto Testowice', 'WYBUD'), ('Miasto Testowice', 'GRU'), ('Miasto Testowice', 'WIND'), ('Miasto Testowice', 'PLZ'),
  ('Powiat Wzorcowy', 'FK'), ('Powiat Wzorcowy', 'KP'), ('Powiat Wzorcowy', 'OFA'), ('Powiat Wzorcowy', 'SWR'),
  ('Gmina Nibylandia', 'WPBUD'), ('Gmina Nibylandia', 'EON'), ('Gmina Nibylandia', 'ENIER'),
  ('Miasto Łódź Demo', 'PLZ'), ('Miasto Łódź Demo', 'GRU'), ('Miasto Łódź Demo', 'MKO'),
  ('Miasto Łódź Demo', 'WIND'), ('Miasto Łódź Demo', 'FK'),
  ('Gmina Fikcyjna', 'GRU'), ('Gmina Fikcyjna', 'MKO'), ('Gmina Fikcyjna', 'EON')
) as x(client, code)
join clients c on c.name = x.client
join modules m on m.code = x.code;

-- Na której bazie działa moduł (etykiety baz są unikalne w obrębie klienta).
insert into client_module_databases (client_module_id, client_database_id)
select cm.id, d.id
from (values
  ('Gmina Przykładowo', 'PLZ', 'Produkcja'), ('Gmina Przykładowo', 'WPBUD', 'Produkcja'), ('Gmina Przykładowo', 'FK', 'Produkcja'),
  ('Miasto Testowice', 'WYBUD', 'Główna'),
  ('Miasto Testowice', 'GRU', 'Główna'), ('Miasto Testowice', 'GRU', 'Nowa (PG)'),
  ('Miasto Testowice', 'WIND', 'Główna'), ('Miasto Testowice', 'PLZ', 'Nowa (PG)'),
  ('Powiat Wzorcowy', 'FK', 'Główna'), ('Powiat Wzorcowy', 'KP', 'Główna'),
  ('Powiat Wzorcowy', 'OFA', 'Główna'), ('Powiat Wzorcowy', 'SWR', 'Główna'),
  ('Gmina Nibylandia', 'WPBUD', 'Stara'), ('Gmina Nibylandia', 'EON', 'Stara'), ('Gmina Nibylandia', 'ENIER', 'Stara'),
  ('Miasto Łódź Demo', 'PLZ', 'Produkcja'), ('Miasto Łódź Demo', 'PLZ', 'Raporty'),
  ('Miasto Łódź Demo', 'GRU', 'Raporty'), ('Miasto Łódź Demo', 'MKO', 'Raporty'),
  ('Miasto Łódź Demo', 'WIND', 'Produkcja'), ('Miasto Łódź Demo', 'FK', 'Produkcja'),
  ('Gmina Fikcyjna', 'GRU', 'Główna'), ('Gmina Fikcyjna', 'MKO', 'Główna'), ('Gmina Fikcyjna', 'EON', 'Główna')
) as x(client, code, label)
join clients c on c.name = x.client
join modules m on m.code = x.code
join client_modules cm on cm.client_id = c.id and cm.module_id = m.id
join client_databases d on d.client_id = c.id and d.label = x.label;

-- Wykupione funkcje płatne.
insert into client_module_features (client_module_id, paid_feature_id)
select cm.id, pf.id
from (values
  ('Gmina Przykładowo', 'PLZ', 'Eksport rozszerzony XLSX'),
  ('Gmina Przykładowo', 'FK', 'Raporty zarządcze'),
  ('Miasto Testowice', 'GRU', 'Integracja API'),
  ('Miasto Testowice', 'WIND', 'Raporty zarządcze'),
  ('Powiat Wzorcowy', 'FK', 'Eksport rozszerzony XLSX'),
  ('Powiat Wzorcowy', 'FK', 'Integracja API'),
  ('Powiat Wzorcowy', 'OFA', 'Raporty zarządcze'),
  ('Gmina Nibylandia', 'EON', 'Eksport rozszerzony XLSX'),
  ('Miasto Łódź Demo', 'PLZ', 'Eksport rozszerzony XLSX'),
  ('Miasto Łódź Demo', 'PLZ', 'Raporty zarządcze'),
  ('Miasto Łódź Demo', 'GRU', 'Integracja API'),
  ('Miasto Łódź Demo', 'MKO', 'Integracja API'),
  ('Gmina Fikcyjna', 'GRU', 'Raporty zarządcze')
) as x(client, code, feature)
join clients c on c.name = x.client
join modules m on m.code = x.code
join client_modules cm on cm.client_id = c.id and cm.module_id = m.id
join paid_features pf on pf.module_id = m.id and pf.name = x.feature;

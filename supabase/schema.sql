-- Confirmation Statement Mailer: cs_mailer_clients table
-- This file is safe to re-run — every statement uses "if not exists" or
-- "or replace" so running it again after an update just applies whatever
-- is new, without touching data you already have.

create table if not exists cs_mailer_clients (
  id uuid primary key default gen_random_uuid(),
  client_code text,
  client_name text not null,
  email text,
  forename text,
  surname text,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cs_mailer_clients_name_idx on cs_mailer_clients using gin (to_tsvector('english', client_name));
create unique index if not exists cs_mailer_clients_code_unique on cs_mailer_clients (client_code) where client_code is not null and client_code <> '';

-- keep updated_at current
create or replace function cs_mailer_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists cs_mailer_clients_updated_at on cs_mailer_clients;
create trigger cs_mailer_clients_updated_at
  before update on cs_mailer_clients
  for each row execute function cs_mailer_set_updated_at();

-- Confirmation statement period-end date, and the statutory filing
-- deadline computed automatically as 14 days after it.
alter table cs_mailer_clients add column if not exists confirmation_statement_date date;
alter table cs_mailer_clients add column if not exists due_date date
  generated always as (confirmation_statement_date + 14) stored;

-- Year End tracking: company number (for Companies House lookups), the
-- year end date you enter or sync, the accounts filing deadline (9 months
-- after year end, calculated automatically), what Companies House last
-- reported as filed, when we last checked, and when this cycle was ticked
-- off as done.
alter table cs_mailer_clients add column if not exists company_number text;
alter table cs_mailer_clients add column if not exists year_end_date date;
alter table cs_mailer_clients add column if not exists accounts_due_date date
  generated always as ((year_end_date + interval '9 months')::date) stored;
alter table cs_mailer_clients add column if not exists accounts_last_filed_ch date;
alter table cs_mailer_clients add column if not exists accounts_last_synced_at timestamptz;
alter table cs_mailer_clients add column if not exists year_end_completed_at timestamptz;

create index if not exists cs_mailer_clients_company_number_idx on cs_mailer_clients (company_number) where company_number is not null and company_number <> '';

-- Archiving: a client is hidden from the Confirmation Statements, Year End
-- and Tasks views once archived, but never deleted — you can always find
-- and restore it. company_status stores the last status Companies House
-- reported (active, dissolved, liquidation, etc.), so the "check for
-- dissolved companies" sweep has something to compare against without
-- re-querying every client.
alter table cs_mailer_clients add column if not exists archived boolean not null default false;
alter table cs_mailer_clients add column if not exists archived_at timestamptz;
alter table cs_mailer_clients add column if not exists archived_reason text;
alter table cs_mailer_clients add column if not exists company_status text;

create index if not exists cs_mailer_clients_archived_idx on cs_mailer_clients (archived);

-- A simple history log so "Mark completed" can be undone, and so you have
-- a record of when each year's accounts were actually signed off.
create table if not exists cs_mailer_year_end_history (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references cs_mailer_clients(id) on delete cascade,
  year_end_date date not null,
  accounts_due_date date,
  completed_at timestamptz not null default now()
);

create index if not exists cs_mailer_year_end_history_client_idx on cs_mailer_year_end_history (client_id);

-- Row Level Security: only signed-in sessions (i.e. you, logged into the
-- app) may read or write. The anon key alone, without a login, gets nothing.
alter table cs_mailer_clients enable row level security;

drop policy if exists "allow all to anon on cs_mailer_clients" on cs_mailer_clients;
drop policy if exists "allow authenticated on cs_mailer_clients" on cs_mailer_clients;
create policy "allow authenticated on cs_mailer_clients" on cs_mailer_clients
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

alter table cs_mailer_year_end_history enable row level security;

drop policy if exists "allow authenticated on cs_mailer_year_end_history" on cs_mailer_year_end_history;
create policy "allow authenticated on cs_mailer_year_end_history" on cs_mailer_year_end_history
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

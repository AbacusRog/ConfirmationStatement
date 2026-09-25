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

-- Merging in the engagement letter / AML review tool (previously its own
-- app, with its own "doc_generator_clients" table): every client — company
-- or individual — now lives in this one table. client_kind tells the two
-- apart; the postal address and contact fields below were specific to that
-- tool and didn't exist here before. An individual client just leaves the
-- confirmation-statement and year-end columns null.
alter table cs_mailer_clients add column if not exists client_kind text not null default 'company';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cs_mailer_clients_kind_check'
  ) then
    alter table cs_mailer_clients add constraint cs_mailer_clients_kind_check
      check (client_kind in ('company', 'individual'));
  end if;
end $$;

alter table cs_mailer_clients add column if not exists client_type text; -- free text, e.g. "Limited Company (By Shares)" or "Sole Trader"
alter table cs_mailer_clients add column if not exists addr1 text;
alter table cs_mailer_clients add column if not exists addr2 text;
alter table cs_mailer_clients add column if not exists town text;
alter table cs_mailer_clients add column if not exists county text;
alter table cs_mailer_clients add column if not exists postcode text;
alter table cs_mailer_clients add column if not exists contact_number text;

create index if not exists cs_mailer_clients_kind_idx on cs_mailer_clients (client_kind);

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

-- Directors, pulled from Companies House's officers list for a company.
-- Keyed on company_number (not client_id) as the source of truth, so this
-- table can be shared by any app in this Supabase project that knows a
-- company number — the engagement letter tool included, once it's merged
-- in. client_id is kept alongside purely as a convenience for this app's
-- own queries (find this client's directors without a join on
-- company_number) and is nulled rather than dropped if that client record
-- is ever deleted.
create table if not exists cs_mailer_directors (
  id uuid primary key default gen_random_uuid(),
  company_number text not null,
  client_id uuid references cs_mailer_clients(id) on delete set null,
  ch_appointment_id text, -- officer's appointment id within this company, per Companies House — lets us tell one officer from another and detect resignations on re-sync
  full_name text not null,
  officer_role text, -- e.g. "director", "secretary"
  appointed_on date,
  resigned_on date,
  nationality text,
  occupation text,
  date_of_birth_month int,
  date_of_birth_year int,
  address text, -- Companies House's own officer address, refreshed on every sync
  letter_address text, -- your own override for what prints on a letter, if CH's address isn't right for that — leave blank to just use "address" above
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cs_mailer_directors_company_number_idx on cs_mailer_directors (company_number);
create index if not exists cs_mailer_directors_client_id_idx on cs_mailer_directors (client_id);
create unique index if not exists cs_mailer_directors_appointment_unique
  on cs_mailer_directors (company_number, ch_appointment_id)
  where ch_appointment_id is not null and ch_appointment_id <> '';

drop trigger if exists cs_mailer_directors_updated_at on cs_mailer_directors;
create trigger cs_mailer_directors_updated_at
  before update on cs_mailer_directors
  for each row execute function cs_mailer_set_updated_at();

alter table cs_mailer_directors enable row level security;

drop policy if exists "allow authenticated on cs_mailer_directors" on cs_mailer_directors;
create policy "allow authenticated on cs_mailer_directors" on cs_mailer_directors
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Accounts Pack emails scheduled to send later via Resend's own scheduling
-- (resend_id is the id Resend gave the email when it was created — that's
-- what /api/scheduled-packs uses to reschedule or cancel it there). This
-- table is just our own record of what's outstanding so it can be listed;
-- Resend is what's actually holding and sending the email. A row is
-- removed once /api/scheduled-packs notices, via Resend's own status for
-- that id, that the email is no longer scheduled (sent or cancelled).
create table if not exists cs_mailer_scheduled_packs (
  id uuid primary key default gen_random_uuid(),
  resend_id text not null unique,
  client_id uuid references cs_mailer_clients(id) on delete set null,
  client_name text not null,
  to_email text not null,
  subject text not null,
  scheduled_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists cs_mailer_scheduled_packs_scheduled_at_idx on cs_mailer_scheduled_packs (scheduled_at);

alter table cs_mailer_scheduled_packs enable row level security;

drop policy if exists "allow authenticated on cs_mailer_scheduled_packs" on cs_mailer_scheduled_packs;
create policy "allow authenticated on cs_mailer_scheduled_packs" on cs_mailer_scheduled_packs
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

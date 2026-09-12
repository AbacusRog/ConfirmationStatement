-- Confirmation Statement Mailer: cs_mailer_clients table
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

-- Row Level Security: only signed-in sessions (i.e. you, logged into the
-- app) may read or write. The anon key alone, without a login, gets nothing.
alter table cs_mailer_clients enable row level security;

drop policy if exists "allow all to anon on cs_mailer_clients" on cs_mailer_clients;
drop policy if exists "allow authenticated on cs_mailer_clients" on cs_mailer_clients;
create policy "allow authenticated on cs_mailer_clients" on cs_mailer_clients
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Confirmation statement period-end date, and the statutory filing
-- deadline computed automatically as 14 days after it.
alter table cs_mailer_clients add column if not exists confirmation_statement_date date;
alter table cs_mailer_clients add column if not exists due_date date
  generated always as (confirmation_statement_date + 14) stored;


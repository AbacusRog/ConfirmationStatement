-- Confirmation Statement Mailer: clients table
create table if not exists clients (
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

create index if not exists clients_name_idx on clients using gin (to_tsvector('english', client_name));
create unique index if not exists clients_code_unique on clients (client_code) where client_code is not null and client_code <> '';

-- keep updated_at current
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists clients_updated_at on clients;
create trigger clients_updated_at
  before update on clients
  for each row execute function set_updated_at();

-- Row Level Security: single-user internal tool, so allow the anon key
-- (used only by your own app, never public) full access.
alter table clients enable row level security;

drop policy if exists "allow all to anon" on clients;
create policy "allow all to anon" on clients
  for all
  using (true)
  with check (true);

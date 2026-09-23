-- Migrates client data from the old, now-merged Client Document Generator
-- app's doc_generator_clients table into cs_mailer_clients. Run this once,
-- after schema.sql, in the same Supabase project — both tables already
-- live there together, so this is a straight SQL migration, not an
-- export/import.
--
-- Matching: both apps' client lists were built from the same practice
-- client-code scheme, so this matches on client_code where one is set,
-- falling back to matching by name for the (mostly individual) rows that
-- were never given a code. A code already in cs_mailer_clients gets its
-- address/type/contact fields filled in — only where blank, so nothing
-- already on file is overwritten. Anything only in doc_generator_clients
-- becomes a new cs_mailer_clients row, kind set from its old "type" field
-- (anything with "Individual" in the type becomes an individual client,
-- everything else a company).
--
-- Not migrated: doc_generator_company_directors, the old manual
-- "link this director to this company" table. That step is dropped by
-- design now that a company's directors come from syncing Companies
-- House directly (Year End tab, or the Documents tab's "Sync from
-- Companies House") — see cs_mailer_directors instead.
--
-- Safe to re-run: matched rows only fill blanks, and rows are only
-- inserted where nothing already matches.

-- 1) Fill in address/type/contact details on clients that already exist
--    in cs_mailer_clients, matched by client_code.
update cs_mailer_clients c
set
  client_type = coalesce(nullif(c.client_type, ''), nullif(d.type, '')),
  addr1 = coalesce(nullif(c.addr1, ''), nullif(d.addr1, '')),
  addr2 = coalesce(nullif(c.addr2, ''), nullif(d.addr2, '')),
  town = coalesce(nullif(c.town, ''), nullif(d.town, '')),
  county = coalesce(nullif(c.county, ''), nullif(d.county, '')),
  postcode = coalesce(nullif(c.postcode, ''), nullif(d.postcode, '')),
  contact_number = coalesce(nullif(c.contact_number, ''), nullif(d.contact_number, '')),
  company_number = coalesce(nullif(c.company_number, ''), nullif(d.company_number, '')),
  email = coalesce(nullif(c.email, ''), nullif(d.email, ''))
from doc_generator_clients d
where d.code is not null
  and d.code <> ''
  and c.client_code = d.code;

-- 2) Insert clients that only exist in doc_generator_clients — mostly
--    individuals (personal tax clients, directors added by hand) that
--    were never part of the confirmation-statement/year-end client list.
insert into cs_mailer_clients (
  client_kind, client_code, client_name, client_type,
  addr1, addr2, town, county, postcode, contact_number, email, company_number
)
select
  case when lower(coalesce(d.type, '')) like '%individual%' then 'individual' else 'company' end,
  nullif(d.code, ''),
  d.name,
  nullif(d.type, ''),
  nullif(d.addr1, ''),
  nullif(d.addr2, ''),
  nullif(d.town, ''),
  nullif(d.county, ''),
  nullif(d.postcode, ''),
  nullif(d.contact_number, ''),
  nullif(d.email, ''),
  nullif(d.company_number, '')
from doc_generator_clients d
where d.name is not null and d.name <> ''
  and not exists (
    select 1 from cs_mailer_clients c
    where (d.code is not null and d.code <> '' and c.client_code = d.code)
       or (
         (d.code is null or d.code = '')
         and lower(c.client_name) = lower(d.name)
       )
  );

-- Once you've checked the results in the app and are happy, you can retire
-- the old tables (this is NOT run automatically — do it only when ready,
-- and only if nothing else still points at the old doc-generator app):
--
--   drop table if exists doc_generator_company_directors;
--   drop table if exists doc_generator_clients;

-- One-off: bulk-load company numbers and/or year end dates into
-- cs_mailer_clients, the same staging-table pattern used for confirmation
-- statement dates. Only useful if you already have a spreadsheet with
-- these — otherwise just use the Year End tab in the app to search
-- Companies House and match/sync clients one at a time.
--
-- Run each step separately — the CSV import in the middle happens in
-- Table Editor, not SQL.

-- STEP 1: Create a temporary staging table. Run this on its own.
create table if not exists cs_mailer_year_end_staging (
  client_code text,
  company_number text,
  year_end_date date
);

-- STEP 2 (not SQL): go to Table Editor -> cs_mailer_year_end_staging ->
-- Insert -> Import data from CSV, and upload your spreadsheet. It needs a
-- client_code column matching your existing client codes, plus whichever
-- of company_number / year_end_date you have (leave the other blank).

-- STEP 3: Copy the data across. Run this on its own.
update cs_mailer_clients c
set
  company_number = coalesce(nullif(s.company_number, ''), c.company_number),
  year_end_date = coalesce(s.year_end_date, c.year_end_date)
from cs_mailer_year_end_staging s
where c.client_code = s.client_code
  and c.client_code is not null
  and c.client_code <> '';

-- STEP 4: Clean up. Run this on its own.
drop table cs_mailer_year_end_staging;

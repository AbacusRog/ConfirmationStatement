-- One-off: bulk-load confirmation statement dates into cs_mailer_clients.
-- Run this AFTER re-running schema.sql (so the new date columns exist).
-- Run each step separately — do not paste the whole file into SQL Editor
-- at once, since the CSV import step in the middle has to happen in
-- Table Editor, not SQL.

-- STEP 1: Create a temporary staging table. Run this on its own.
create table if not exists cs_mailer_dates_staging (
  client_code text,
  confirmation_statement_date date
);

-- STEP 2 (not SQL): go to Table Editor -> cs_mailer_dates_staging ->
-- Insert -> Import data from CSV, and upload your dates CSV
-- (client_code, confirmation_statement_date columns).

-- STEP 3: Once the import is done, run this on its own to copy the dates
-- across:
update cs_mailer_clients c
set confirmation_statement_date = s.confirmation_statement_date
from cs_mailer_dates_staging s
where c.client_code = s.client_code
  and c.client_code is not null
  and c.client_code <> '';

-- STEP 4: Clean up the staging table. Run this on its own.
drop table cs_mailer_dates_staging;

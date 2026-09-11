-- One-off: bulk-load confirmation statement dates into cs_mailer_clients.
-- Run this AFTER re-running schema.sql (so the new date columns exist).

-- 1. Create a temporary staging table.
create table if not exists cs_mailer_dates_staging (
  client_code text,
  confirmation_statement_date date
);

-- 2. Now go to Table Editor -> cs_mailer_dates_staging -> Insert ->
--    Import data from CSV, and upload cs_dates_update.csv.
--    (338 clients have a date; 7 didn't have one in the spreadsheet you
--    gave me, and one client with no client_code couldn't be matched —
--    see the list below. Those will just show as "add a date" in the app
--    next time you use them, same as a missing email.)

-- 3. Once the import is done, run this to copy the dates across:
update cs_mailer_clients c
set confirmation_statement_date = s.confirmation_statement_date
from cs_mailer_dates_staging s
where c.client_code = s.client_code
  and c.client_code is not null
  and c.client_code <> '';

-- 4. Clean up the staging table.
drop table cs_mailer_dates_staging;

-- Clients that had no date in the spreadsheet — add these manually in the
-- app when you next use them:
--   FA008  Faiza Jesrai Limited
--   HA027  Harry Jenkins Limited
--   JU002  Just Coach UK Limited
--   ME005  Metron Surveying Ltd
--   ME009  Metalla UK Limited
--   SH011  Shiro-T Limited
--   UN001  Unparalleled Services Limited
--
-- Also: "Darcy Willow Holdings Limited" has no client_code in your source
-- spreadsheet, so it couldn't be matched automatically either — its date
-- (01/12/2026) will need adding by hand in the app too.

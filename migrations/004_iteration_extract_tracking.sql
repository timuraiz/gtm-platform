-- 004_iteration_extract_tracking.sql
--
-- Track which domains we've already asked Apollo about per iteration, so a
-- second click on "Extract from all" doesn't burn credits re-querying companies
-- that were already attempted (regardless of whether they returned people).
--
-- A separate filter hash invalidates the cache when the user changes seniority
-- or titles in the ICP — different filter, different ask, must re-query.

begin;

alter table iterations
  add column if not exists extracted_domains   text[] not null default '{}',
  add column if not exists extract_filter_hash text;

commit;

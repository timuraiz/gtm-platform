-- 007_iteration_accounts_m2m.sql
--
-- One LinkedIn iteration is often physically run from several operator
-- accounts (e.g. Tim + Elvira splitting the same segment). The previous
-- single-FK column on iterations can't express that.
--
-- Replace iterations.linkedin_account_id with a M2M linking table. Backfill
-- the existing values, then drop the column.

begin;

create table if not exists iteration_accounts (
    iteration_id        uuid not null references iterations(id) on delete cascade,
    linkedin_account_id uuid not null references linkedin_accounts(id) on delete cascade,
    created_at          timestamptz not null default now(),
    primary key (iteration_id, linkedin_account_id)
);

create index if not exists iteration_accounts_account_idx on iteration_accounts(linkedin_account_id);

-- Backfill from the legacy single-FK column.
insert into iteration_accounts (iteration_id, linkedin_account_id)
  select id, linkedin_account_id
    from iterations
   where linkedin_account_id is not null
on conflict do nothing;

alter table iterations
  drop column if exists linkedin_account_id;

alter table iteration_accounts disable row level security;

commit;

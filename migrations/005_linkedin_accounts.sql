-- 005_linkedin_accounts.sql
--
-- LinkedIn-iterations are physically run from concrete operator accounts. We
-- want to (a) tag an iteration with the account that ran it so we can build a
-- "best performers" leaderboard, and (b) optionally split the per-iteration
-- stats across multiple accounts when one iteration was actually a split
-- (e.g. two senders doing the same segment).
--
-- Two sources of truth on purpose:
--   * iterations.linkedin_account_id — the simple case ("Account A ran this").
--     Whole iterations.stats is attributed here.
--   * iteration_account_stats — the explicit breakdown. When ANY row exists
--     for an iteration, it overrides iterations.stats for leaderboard math.

begin;

create table if not exists linkedin_accounts (
    id          uuid primary key default gen_random_uuid(),
    client_id   uuid not null references clients(id) on delete cascade,
    name        text not null,
    profile_url text,
    archived_at timestamptz,
    created_at  timestamptz not null default now(),
    unique (client_id, name)
);

create index if not exists linkedin_accounts_client_idx on linkedin_accounts(client_id) where archived_at is null;

alter table iterations
  add column if not exists linkedin_account_id uuid references linkedin_accounts(id);

create index if not exists iterations_linkedin_account_idx on iterations(linkedin_account_id) where linkedin_account_id is not null;

create table if not exists iteration_account_stats (
    iteration_id          uuid not null references iterations(id) on delete cascade,
    linkedin_account_id   uuid not null references linkedin_accounts(id) on delete restrict,
    leads_sent            int,
    connections_accepted  int,
    replies               int,
    positive_replies      int,
    meetings_booked       int,
    uploaded_at           timestamptz not null default now(),
    primary key (iteration_id, linkedin_account_id)
);

create index if not exists iteration_account_stats_account_idx on iteration_account_stats(linkedin_account_id);

commit;

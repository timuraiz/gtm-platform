-- 003_split_companies.sql
--
-- Splits `companies` into a global table (one row per domain, shared across the
-- whole team space) and a `project_companies` join table holding per-project
-- qualification state. Adds staleness tracking so scraping/Apollo enrichment
-- can be force-refreshed.
--
-- Verified before running: zero duplicate domains in current `companies`
-- (811 rows, 811 unique domains), so the (project_id, domain) → domain
-- collapse is a 1:1 move with no merge logic needed.

begin;

-- ─── 1. project_companies join (per-project qualification) ────────────────────

create table if not exists project_companies (
    id                   uuid primary key default gen_random_uuid(),
    project_id           uuid not null references projects(id) on delete cascade,
    company_id           uuid not null,  -- FK added in step 6 once companies is reshaped
    pipeline_run_id      uuid references pipeline_runs(id) on delete set null,
    qualification_status text check (qualification_status in ('qualified','rejected','unknown')) default 'unknown',
    is_target            boolean default false,
    confidence           int,
    segment              text,
    reasoning            text,
    found_by             text[],
    source               text not null default 'pipeline' check (source in ('pipeline','manual','csv')),
    created_at           timestamptz not null default now(),
    unique (project_id, company_id)
);

-- ─── 2. companies: add staleness columns ──────────────────────────────────────

alter table companies add column if not exists scraped_at        timestamptz;
alter table companies add column if not exists apollo_fetched_at timestamptz;

-- Backfill: rows that have scraped_text get scraped_at = updated_at
update companies
set scraped_at = updated_at
where scraped_text is not null and length(scraped_text) > 0 and scraped_at is null;

-- Backfill: rows with apollo_data get apollo_fetched_at = updated_at
update companies
set apollo_fetched_at = updated_at
where apollo_data is not null and apollo_fetched_at is null;

-- ─── 3. Move per-project qualification rows into project_companies ────────────

insert into project_companies (
    project_id, company_id, pipeline_run_id, qualification_status,
    is_target, confidence, segment, reasoning, found_by, source, created_at
)
select
    project_id, id, pipeline_run_id, coalesce(qualification_status, 'unknown'),
    coalesce(is_target, false), confidence, segment, reasoning, found_by,
    'pipeline', created_at
from companies
where project_id is not null
on conflict (project_id, company_id) do nothing;

-- ─── 4. Drop FKs that reference soon-to-be-dropped columns ────────────────────

alter table companies drop constraint if exists companies_project_id_fkey;
alter table companies drop constraint if exists companies_pipeline_run_id_fkey;

-- ─── 5. Drop per-project columns from companies ──────────────────────────────

alter table companies drop column if exists project_id;
alter table companies drop column if exists qualification_status;
alter table companies drop column if exists rejection_reason;
alter table companies drop column if exists pipeline_run_id;
alter table companies drop column if exists is_target;
alter table companies drop column if exists confidence;
alter table companies drop column if exists segment;
alter table companies drop column if exists reasoning;
alter table companies drop column if exists found_by;

-- companies is now: id, domain, name, scraped_text, apollo_data,
-- created_at, updated_at, logo_url, scraped_at, apollo_fetched_at

-- ─── 6. Enforce unique(domain) globally + add FK from project_companies ──────

alter table companies add constraint companies_domain_key unique (domain);

alter table project_companies
    add constraint project_companies_company_id_fkey
    foreign key (company_id) references companies(id) on delete cascade;

-- ─── 7. Indexes ──────────────────────────────────────────────────────────────

create index if not exists project_companies_project_id_idx on project_companies (project_id);
create index if not exists project_companies_company_id_idx on project_companies (company_id);
create index if not exists project_companies_qualified_idx
    on project_companies (project_id) where qualification_status = 'qualified';
create index if not exists companies_scraped_at_idx on companies (scraped_at);

-- ─── 8. RLS ──────────────────────────────────────────────────────────────────
-- Match the rest of the schema (no RLS in this team-space-only deployment)
alter table project_companies disable row level security;

commit;

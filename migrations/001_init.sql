-- projects: one per client / campaign group
create table if not exists projects (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    client      text not null,
    icp_json    jsonb,
    created_at  timestamptz not null default now()
);

-- companies: deduplicated by domain
create table if not exists companies (
    id                   uuid primary key default gen_random_uuid(),
    project_id           uuid references projects(id),
    domain               text not null,
    name                 text,
    scraped_text         text,
    qualification_status text check (qualification_status in ('qualified','rejected','unknown')) default 'unknown',
    rejection_reason     text,
    apollo_data          jsonb,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now(),
    unique (project_id, domain)
);

-- contacts: deduplicated by linkedin_url
create table if not exists contacts (
    id           uuid primary key default gen_random_uuid(),
    project_id   uuid references projects(id),
    company_id   uuid references companies(id),
    linkedin_url text not null,
    email        text,
    first_name   text,
    last_name    text,
    title        text,
    apollo_data  jsonb,
    created_at   timestamptz not null default now(),
    unique (project_id, linkedin_url)
);

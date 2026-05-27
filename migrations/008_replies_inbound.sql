-- 008_replies_inbound.sql
--
-- Stores LinkedIn reply notifications coming in from the user's automation
-- tool (via n8n → /api/replies/inbound). Each row is one reply message in
-- a thread. The same prospect can send multiple messages across a
-- conversation — we keep every message, deduped by (iteration, contact,
-- sent_at), and count "positive_replies" as DISTINCT contacts whose
-- conversation has at least one message classified as positive.
--
-- Sentiment is set asynchronously by Claude using the per-project
-- positive_reply_criteria (a freeform description of what counts as
-- positive for that project).

begin;

-- Where to ping the user on Telegram when a reply lands.
alter table clients
  add column if not exists telegram_chat_id text;

-- Per-project description of what a "positive" reply looks like (used as
-- the AI rubric). Free-form text written by the user when setting up the
-- project.
alter table projects
  add column if not exists positive_reply_criteria text;

-- The campaign name as labelled in the external LinkedIn automation tool.
-- We match incoming webhooks by this string + the operator account.
alter table iterations
  add column if not exists external_campaign_name text;

create index if not exists iterations_external_campaign_idx
  on iterations(external_campaign_name)
  where external_campaign_name is not null;

create table if not exists replies (
    id                       uuid primary key default gen_random_uuid(),
    iteration_id             uuid not null references iterations(id) on delete cascade,
    linkedin_account_id      uuid references linkedin_accounts(id) on delete set null,
    contact_li_url           text not null,
    contact_name             text,
    contact_headline         text,
    contact_company          text,
    contact_avatar_url       text,
    contact_email            text,
    our_last_message_text    text,    -- the message we sent before this reply, for AI context
    message_text             text not null,
    message_sent_at          timestamptz not null,
    sentiment                text check (sentiment in ('positive','negative','neutral')),
    sentiment_confidence     real,
    sentiment_reason         text,
    sentiment_evaluated_at   timestamptz,
    raw_payload              jsonb,
    created_at               timestamptz not null default now(),
    unique (iteration_id, contact_li_url, message_sent_at)
);

create index if not exists replies_iteration_idx on replies(iteration_id, message_sent_at desc);
create index if not exists replies_account_idx on replies(linkedin_account_id) where linkedin_account_id is not null;
create index if not exists replies_contact_idx on replies(iteration_id, contact_li_url);
create index if not exists replies_sentiment_idx on replies(iteration_id, sentiment) where sentiment is not null;

alter table replies disable row level security;

commit;

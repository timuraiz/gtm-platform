'use server'

import { revalidatePath } from 'next/cache'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/utils/supabase/server'
import { fetchAll } from '@/lib/supabase-pagination'

export type ProjectCompany = {
  id: string                       // project_companies.id
  company_id: string
  domain: string
  name: string | null
  logo_url: string | null
  scraped_at: string | null
  apollo_fetched_at: string | null
  qualification_status: 'qualified' | 'rejected' | 'unknown'
  is_target: boolean
  confidence: number | null
  segment: string | null
  reasoning: string | null
  source: 'pipeline' | 'manual' | 'csv'
  created_at: string
  // Iteration-scoped extraction state (only populated when iterationId is passed)
  contacts_in_iteration: number   // contacts pulled into the active iteration for this company
  extracted_in_iteration: boolean // we already asked Apollo for this domain under the current filter
}

export async function getProjectCompanies(
  projectId: string,
  iterationId?: string | null,
): Promise<ProjectCompany[]> {
  const supabase = await createClient()

  const data = await fetchAll<Record<string, unknown>>((from, to) =>
    supabase
      .from('project_companies')
      .select('id, company_id, qualification_status, is_target, confidence, segment, reasoning, source, created_at, companies(domain, name, logo_url, scraped_at, apollo_fetched_at)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .range(from, to),
  )

  // Per-iteration: contacts already in DB, plus the Apollo-asked domain set
  const contactCountByCompany = new Map<string, number>()
  let extractedDomains = new Set<string>()
  if (iterationId) {
    const [contactRows, iterRes] = await Promise.all([
      fetchAll<{ company_id: string | null }>((from, to) =>
        supabase
          .from('contacts')
          .select('company_id')
          .eq('iteration_id', iterationId)
          .range(from, to),
      ),
      supabase
        .from('iterations')
        .select('extracted_domains')
        .eq('id', iterationId)
        .single(),
    ])
    for (const row of contactRows) {
      if (!row.company_id) continue
      contactCountByCompany.set(row.company_id, (contactCountByCompany.get(row.company_id) ?? 0) + 1)
    }
    extractedDomains = new Set(((iterRes.data?.extracted_domains as string[] | null) ?? []))
  }

  return ((data ?? []) as unknown[]).map((row) => {
    const r = row as Record<string, unknown>
    const co = r.companies as Record<string, unknown> | null
    const companyId = r.company_id as string
    const domain = (co?.domain as string) ?? ''
    return {
      id: r.id as string,
      company_id: companyId,
      domain,
      name: (co?.name as string) ?? null,
      logo_url: (co?.logo_url as string) ?? null,
      scraped_at: (co?.scraped_at as string) ?? null,
      apollo_fetched_at: (co?.apollo_fetched_at as string) ?? null,
      qualification_status: (r.qualification_status as ProjectCompany['qualification_status']) ?? 'unknown',
      is_target: (r.is_target as boolean) ?? false,
      confidence: (r.confidence as number) ?? null,
      segment: (r.segment as string) ?? null,
      reasoning: (r.reasoning as string) ?? null,
      source: (r.source as ProjectCompany['source']) ?? 'pipeline',
      created_at: r.created_at as string,
      contacts_in_iteration: contactCountByCompany.get(companyId) ?? 0,
      extracted_in_iteration: extractedDomains.has(domain),
    }
  })
}

export type UploadedCompanyRow = {
  domain: string
  name?: string | null
  linkedin_url?: string | null
}

export async function uploadCompanies(
  projectId: string,
  rows: UploadedCompanyRow[],
): Promise<{ inserted: number; attached: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, attached: 0, skipped: 0 }
  const supabase = await createClient()

  // Normalize + dedupe domains within the batch
  const cleanRows = rows
    .map(r => ({
      domain: r.domain?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0],
      name: r.name?.trim() || null,
    }))
    .filter(r => !!r.domain) as { domain: string; name: string | null }[]

  const seen = new Set<string>()
  const uniq: typeof cleanRows = []
  let skipped = 0
  for (const r of cleanRows) {
    if (seen.has(r.domain)) { skipped++; continue }
    seen.add(r.domain)
    uniq.push(r)
  }
  if (uniq.length === 0) return { inserted: 0, attached: 0, skipped }

  // Upsert into global companies (preserve existing metadata; only set name if missing)
  const { data: existing } = await supabase
    .from('companies')
    .select('id, domain, name')
    .in('domain', uniq.map(r => r.domain))
  const existingByDomain = new Map((existing ?? []).map((c: { id: string; domain: string; name: string | null }) => [c.domain, c]))

  const toInsert = uniq.filter(r => !existingByDomain.has(r.domain))
  let inserted = 0
  if (toInsert.length > 0) {
    const { error } = await supabase
      .from('companies')
      .insert(toInsert.map(r => ({ domain: r.domain, name: r.name ?? r.domain })))
    if (error) throw new Error(error.message)
    inserted = toInsert.length
  }

  // Re-fetch to get IDs for both newly-inserted and pre-existing
  const { data: resolved } = await supabase
    .from('companies')
    .select('id, domain')
    .in('domain', uniq.map(r => r.domain))
  const domainToId = Object.fromEntries((resolved ?? []).map((c: { id: string; domain: string }) => [c.domain, c.id]))

  // Attach to project — qualified by default for CSV uploads (user-curated)
  const attachRows = uniq
    .filter(r => domainToId[r.domain])
    .map(r => ({
      project_id: projectId,
      company_id: domainToId[r.domain],
      qualification_status: 'qualified' as const,
      is_target: true,
      source: 'csv' as const,
    }))

  let attached = 0
  if (attachRows.length > 0) {
    const { error, count } = await supabase
      .from('project_companies')
      .upsert(attachRows, { onConflict: 'project_id,company_id', ignoreDuplicates: true, count: 'exact' })
    if (error) throw new Error(`Failed to attach companies to project: ${error.message}`)
    attached = count ?? attachRows.length
  }

  revalidatePath('.')
  return { inserted, attached, skipped }
}

export async function detachCompany(projectId: string, projectCompanyId: string): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('project_companies')
    .delete()
    .eq('id', projectCompanyId)
    .eq('project_id', projectId)
  revalidatePath('.')
}

export async function detachCompanies(projectId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const supabase = await createClient()
  await supabase
    .from('project_companies')
    .delete()
    .eq('project_id', projectId)
    .in('id', ids)
  revalidatePath('.')
}

async function scrapeOne(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GTMBot/1.0)' },
      signal: AbortSignal.timeout(10_000),
    })
    const html = await res.text()
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 6000)
  } catch { return '' }
}

// Cap how many sites we hit in parallel. The previous Promise.all over 359
// domains exhausted Node's connection pool and silently failed the bulk of
// them — most "ok" returns were empty strings.
const SCRAPE_CONCURRENCY = 20

export async function rescrapeNow(domains: string[]): Promise<{ ok: number; failed: number }> {
  if (domains.length === 0) return { ok: 0, failed: 0 }
  const supabase = await createClient()
  const now = new Date().toISOString()

  const results = await pMap(domains, SCRAPE_CONCURRENCY, async (d) => {
    const text = await scrapeOne(`https://${d}`)
    return { domain: d, text, ok: text.length > 100 }
  })

  // Persist all attempts (even short/empty results bump scraped_at — explicit "we tried")
  await supabase.from('companies').upsert(
    results.map(r => ({
      domain: r.domain,
      scraped_text: r.text,
      scraped_at: now,
      updated_at: now,
    })),
    { onConflict: 'domain' },
  )

  revalidatePath('.')
  return { ok: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length }
}

// ─── Classify companies (Claude) ─────────────────────────────────────────────

async function callClaude(system: string, user: string): Promise<string> {
  const msg = await new Anthropic().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: user }],
  })
  const block = msg.content[0]
  if (block.type !== 'text') throw new Error('Non-text Claude response')
  return block.text.replace(/^```(?:json)?\n?/m, '').replace(/```\s*$/m, '').trim()
}

// Retry only on rate limits (429 / overloaded). Everything else throws immediately.
async function callClaudeWithRetry(system: string, user: string, maxAttempts = 4): Promise<string> {
  let attempt = 0
  while (true) {
    try { return await callClaude(system, user) }
    catch (e) {
      attempt++
      const msg = e instanceof Error ? e.message : String(e)
      const isRateLimited = /429|rate.?limit|overloaded|529/i.test(msg)
      if (!isRateLimited || attempt >= maxAttempts) throw e
      // Exponential backoff with jitter: 1s, 2s, 4s, 8s
      const wait = 1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250)
      console.warn(`[classify] rate-limited (attempt ${attempt}/${maxAttempts}), retrying in ${wait}ms`)
      await new Promise(r => setTimeout(r, wait))
    }
  }
}

// Bounded-concurrency parallel map. Keeps order, capped at `concurrency` in-flight.
async function pMap<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

const CLASSIFY_BATCH_SIZE = 15
const CLASSIFY_CONCURRENCY = 5

export async function classifyCompanies(
  projectId: string,
  projectCompanyIds: string[],
): Promise<{ qualified: number; rejected: number; failed: number }> {
  if (projectCompanyIds.length === 0) return { qualified: 0, rejected: 0, failed: 0 }
  const supabase = await createClient()

  const [{ data: project }, { data: skill }, { data: rows }] = await Promise.all([
    supabase.from('projects').select('icp_json, offer_text').eq('id', projectId).single(),
    supabase.from('skills').select('content').eq('name', 'company-qualification').single(),
    supabase
      .from('project_companies')
      .select('id, company_id, companies(domain, name, scraped_text, apollo_data)')
      .in('id', projectCompanyIds),
  ])
  if (!project) throw new Error('Project not found')
  if (!skill) throw new Error('Skill "company-qualification" not found in DB')
  if (!rows || rows.length === 0) return { qualified: 0, rejected: 0, failed: 0 }

  type Row = { id: string; company_id: string; companies: { domain: string; name: string | null; scraped_text: string | null; apollo_data: Record<string, unknown> | null } | null }
  const candidates = (rows as unknown as Row[])
    .filter(r => r.companies?.domain)
    .map(r => ({
      pc_id: r.id,
      domain: r.companies!.domain,
      name: r.companies!.name ?? r.companies!.domain,
      scraped_text: r.companies!.scraped_text ?? '',
      apollo_data: r.companies!.apollo_data ?? null,
    }))

  // Auto-scrape rows that have no scraped_text — quality classification needs context
  const needScrape = candidates.filter(c => c.scraped_text.length < 100)
  if (needScrape.length > 0) {
    const now = new Date().toISOString()
    const fresh = await Promise.all(
      needScrape.map(async c => ({ domain: c.domain, text: await scrapeOne(`https://${c.domain}`) }))
    )
    const byDomain = Object.fromEntries(fresh.map(f => [f.domain, f.text]))
    for (const c of candidates) if (byDomain[c.domain]) c.scraped_text = byDomain[c.domain]
    await supabase.from('companies').upsert(
      fresh.filter(f => f.text.length > 0).map(f => ({ domain: f.domain, scraped_text: f.text, scraped_at: now, updated_at: now })),
      { onConflict: 'domain' },
    )
  }

  const offerText = (project.offer_text as string | null) ?? ''
  const icp = project.icp_json as Record<string, unknown> | null

  // Split into batches up-front, then run them in parallel with bounded concurrency
  const batches: typeof candidates[] = []
  for (let i = 0; i < candidates.length; i += CLASSIFY_BATCH_SIZE) {
    batches.push(candidates.slice(i, i + CLASSIFY_BATCH_SIZE))
  }

  type BatchOutcome = {
    qualified: number; rejected: number; failed: number;
    updates: Array<{ id: string; qualification_status: 'qualified' | 'rejected'; is_target: boolean; confidence: number; segment: string; reasoning: string }>
  }

  const outcomes = await pMap(batches, CLASSIFY_CONCURRENCY, async (batch): Promise<BatchOutcome> => {
    const payload = batch.map(c => ({
      domain: c.domain,
      name: c.name,
      description: (c.apollo_data?.short_description as string) ?? '',
      scraped: c.scraped_text.slice(0, 1500),
    }))
    const prompt = `Offer: ${offerText}
ICP: ${JSON.stringify(icp ?? {})}

Classify each company as is_target=true (matches ICP) or false. Return ONLY a JSON array:
[{"domain":"...","is_target":bool,"confidence":0-100,"segment":"LABEL","reasoning":"..."}]

Companies:
${JSON.stringify(payload, null, 2)}`

    let parsed: Array<{ domain: string; is_target: boolean; confidence: number; segment: string; reasoning: string }>
    try {
      const raw = await callClaudeWithRetry(skill.content as string, prompt)
      parsed = JSON.parse(raw)
    } catch (e) {
      console.error('[classify] batch failed:', e instanceof Error ? e.message : e)
      return { qualified: 0, rejected: 0, failed: batch.length, updates: [] }
    }

    const byDomain = Object.fromEntries(parsed.map(r => [r.domain, r]))
    let q = 0, r = 0
    const updates: BatchOutcome['updates'] = []
    for (const c of batch) {
      const v = byDomain[c.domain]
      if (!v) continue
      if (v.is_target) q++; else r++
      updates.push({
        id: c.pc_id,
        qualification_status: v.is_target ? 'qualified' : 'rejected',
        is_target: v.is_target,
        confidence: v.confidence,
        segment: v.segment,
        reasoning: v.reasoning,
      })
    }
    return { qualified: q, rejected: r, failed: 0, updates }
  })

  // Aggregate + persist. Updates run in parallel across batches but capped to avoid overwhelming Supabase.
  const allUpdates = outcomes.flatMap(o => o.updates)
  await pMap(allUpdates, 10, async (u) => {
    await supabase.from('project_companies').update({
      qualification_status: u.qualification_status,
      is_target: u.is_target,
      confidence: u.confidence,
      segment: u.segment,
      reasoning: u.reasoning,
    }).eq('id', u.id)
  })

  const qualified = outcomes.reduce((s, o) => s + o.qualified, 0)
  const rejected = outcomes.reduce((s, o) => s + o.rejected, 0)
  const failed = outcomes.reduce((s, o) => s + o.failed, 0)

  revalidatePath('.')
  return { qualified, rejected, failed }
}

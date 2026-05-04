import { createServerClient } from '@supabase/ssr'
import Anthropic from '@anthropic-ai/sdk'
import { FatalError, RetryableError } from 'workflow'

const APOLLO_BASE = 'https://api.apollo.io/api/v1'

const CONFERENCE_NOISE = new Set([
  'exhibition booth', 'trade show', 'industry conference', 'expo participation',
  'conference sponsor', 'trade fair', 'event marketing', 'conference exhibitor',
  'expo marketing', 'conference marketing', 'exhibition marketing', 'event sponsorship',
  'booth design', 'event presence', 'brand activation', 'trade show strategy',
  'exhibition strategy', 'event lead generation', 'trade show roi', 'booth traffic',
  'exhibition roi', 'conference lead generation', 'expo roi', 'trade show presence',
  'conference presence', 'conference differentiation', 'exhibition stand',
  'trade show exhibitor', 'expo exhibitor', 'conference booth', 'trade show booth',
  'exhibition presence', 'event exhibitor', 'expo booth', 'conference roi',
  'lead generation events', 'trade show marketing', 'booth engagement', 'event brand activation',
])

const FUNDING_STAGE_MAP: Record<string, string> = {
  'Pre-Seed': 'pre_seed',
  'Seed': 'seed',
  'Series A': 'series_a',
  'Series B': 'series_b',
  'Series C': 'series_c',
  'Series C+': 'series_c',
}

const SCRAPE_TTL_DAYS = Number(process.env.COMPANY_SCRAPE_TTL_DAYS ?? 30)
const CLASSIFY_TEST_LIMIT = 50
const CLASSIFY_BATCH_SIZE = 10
const CLASSIFY_CONCURRENCY = 5

type ApolloCompany = {
  domain: string; name: string; apollo_id?: string
  description: string; keywords: string[]; industry: string
  funding_stage: string; employee_count: number
  logo_url: string | null
}

type ScrapeRow = ApolloCompany & { scraped_text?: string; scraped_ok?: boolean; from_cache?: boolean }

// ─── Shared helpers (NOT workflow steps — used inside steps only) ──────────────

function db() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

async function claude(system: string, user: string): Promise<string> {
  const msg = await new Anthropic().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: user }],
  })
  const block = msg.content[0]
  if (block.type !== 'text') throw new FatalError('Non-text Claude response')
  return block.text.replace(/^```(?:json)?\n?/m, '').replace(/```\s*$/m, '').trim()
}

async function claudeWithRetry(system: string, user: string, maxAttempts = 4): Promise<string> {
  let attempt = 0
  while (true) {
    try { return await claude(system, user) }
    catch (e) {
      attempt++
      const msg = e instanceof Error ? e.message : String(e)
      const isRateLimited = /429|rate.?limit|overloaded|529/i.test(msg)
      if (!isRateLimited || attempt >= maxAttempts) throw e
      const wait = 1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250)
      await new Promise(r => setTimeout(r, wait))
    }
  }
}

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

async function scrapeUrl(url: string): Promise<string> {
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

async function fetchSkill(name: string): Promise<string> {
  const { data } = await db().from('skills').select('content').eq('name', name).single()
  if (!data) throw new FatalError(`Skill "${name}" not found`)
  return data.content as string
}

async function persistStep(runId: string, name: string, artifact: unknown, status: 'done' | 'error' = 'done') {
  const supabase = db()
  const { data: run } = await supabase.from('pipeline_runs').select('steps').eq('id', runId).single()
  const existing = (run?.steps ?? []) as Array<{ name: string; status: string; artifact: unknown }>
  const updated = [...existing.filter(s => s.name !== name), { name, status, artifact }]
  await supabase.from('pipeline_runs').update({
    steps: updated,
    status: status === 'error' ? 'error' : 'running',
    updated_at: new Date().toISOString(),
  }).eq('id', runId)
}

// ─── STEP: generate_filters ────────────────────────────────────────────────────

async function stepGenerateFilters(runId: string, projectIcp: Record<string, unknown>) {
  'use step'
  if (!projectIcp || Object.keys(projectIcp).length === 0) {
    throw new FatalError('ICP is empty — fill it in the ICP editor first')
  }
  const skill = await fetchSkill('apollo-filter-mapping')
  const raw = await claudeWithRetry(skill, `Generate Apollo search filters for this ICP:\n${JSON.stringify(projectIcp, null, 2)}\n\nReturn ONLY valid JSON.`)
  const filters = JSON.parse(raw)
  const apolloFilters = (projectIcp.apollo_filters ?? {}) as Record<string, unknown>
  if (!filters.locations?.length && apolloFilters.locations) filters.locations = apolloFilters.locations
  if (!filters.employee_ranges?.length && apolloFilters.employee_range) filters.employee_ranges = [apolloFilters.employee_range]
  await persistStep(runId, 'generate_filters', filters)
  return filters
}

// ─── STEP: apollo_search ───────────────────────────────────────────────────────

async function stepApolloSearch(
  runId: string,
  filters: Record<string, unknown>,
  icp: Record<string, unknown>,
  page = 1,
  seenDomains: string[] = [],
  overrideKeywords?: string[],
) {
  'use step'
  const key = process.env.APOLLO_API_KEY
  if (!key) throw new FatalError('APOLLO_API_KEY not set')

  const seen = new Set<string>(seenDomains)
  const companies: ApolloCompany[] = []
  const title_hits: Record<string, number> = {}
  const keyword_hits: Record<string, number> = {}

  const roles = icp.target_roles as Record<string, string[]> | undefined
  const titles = [...(roles?.primary ?? []), ...(roles?.secondary ?? [])].slice(0, 6)

  const locations: unknown = (icp.apollo_filters as Record<string, unknown> | undefined)?.locations ?? filters.locations
  const employeeRanges: unknown = (icp.employee_ranges as string[] | undefined)?.length
    ? icp.employee_ranges
    : filters.employee_ranges

  const fundingRounds = icp.funding_rounds as string[] | undefined
  const fundingStages = fundingRounds?.map(r => FUNDING_STAGE_MAP[r]).filter(Boolean) ?? []

  const segments = icp.segments as Array<{ name: string; keywords: string[] }> | undefined
  const industryKeywords = overrideKeywords?.length
    ? overrideKeywords
    : segments
      ? segments.flatMap(s => s.keywords.filter(k => !CONFERENCE_NOISE.has(k.toLowerCase())).slice(0, 3)).slice(0, 10)
      : (filters.keywords as string[] ?? []).filter(k => !CONFERENCE_NOISE.has(k.toLowerCase())).slice(0, 10)

  for (const title of titles) title_hits[title] = 0

  await Promise.allSettled(industryKeywords.map(async (kw) => {
    try {
      const res = await fetch(`${APOLLO_BASE}/mixed_companies/search`, {
        method: 'POST',
        headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q_organization_keyword_tags: [kw],
          organization_locations: locations,
          organization_num_employees_ranges: employeeRanges,
          ...(fundingStages.length ? { organization_latest_funding_stage_cd: fundingStages } : {}),
          page, per_page: 50,
        }),
      })
      if (!res.ok) {
        const err = await res.text().catch(() => '')
        if (res.status === 402 || res.status === 429 || err.toLowerCase().includes('credit') || err.toLowerCase().includes('limit')) {
          throw new RetryableError(`Apollo rate-limited or out of credits (${res.status})`)
        }
        keyword_hits[kw] = -1; return
      }
      const data = await res.json()
      let hits = 0
      for (const org of (data.organizations ?? []) as Record<string, unknown>[]) {
        const domain = (org.primary_domain ?? '') as string
        if (!domain || seen.has(domain)) continue
        seen.add(domain)
        companies.push({
          domain,
          name: (org.name ?? domain) as string,
          apollo_id: org.id as string | undefined,
          description: (org.short_description ?? org.seo_description ?? '') as string,
          keywords: (org.keywords ?? []) as string[],
          industry: (org.industry ?? '') as string,
          funding_stage: (org.latest_funding_stage ?? '') as string,
          employee_count: (org.estimated_num_employees ?? 0) as number,
          logo_url: (org.logo_url ?? null) as string | null,
        })
        hits++
      }
      keyword_hits[kw] = hits
    } catch (e) {
      if (e instanceof RetryableError) throw e
      keyword_hits[kw] = -1
    }
  }))

  const artifact = { companies_found: companies.length, title_hits, keyword_hits, companies }
  await persistStep(runId, 'apollo_search', artifact)
  // Save snapshot back to pipeline_runs.companies_found
  await db().from('pipeline_runs').update({ companies_found: companies.length }).eq('id', runId)
  return artifact
}

// ─── STEP: scrape ──────────────────────────────────────────────────────────────

async function stepScrape(runId: string, companies: ApolloCompany[]) {
  'use step'
  const supabase = db()
  const domains = companies.map(c => c.domain)
  const { data: cached } = await supabase
    .from('companies')
    .select('domain, scraped_text, scraped_at')
    .in('domain', domains)
  const cachedByDomain = new Map(
    (cached ?? []).map((r: { domain: string; scraped_text: string | null; scraped_at: string | null }) => [r.domain, r]),
  )
  const cutoff = Date.now() - SCRAPE_TTL_DAYS * 86_400_000
  const isFresh = (scrapedAt: string | null) => !!scrapedAt && new Date(scrapedAt).getTime() > cutoff

  const weak = companies.filter(c => (c.description?.length ?? 0) < 80)
  const strong = companies.filter(c => (c.description?.length ?? 0) >= 80)
  const toScrape = [...weak, ...strong].slice(0, 50)

  let cacheHits = 0
  const scraped = await Promise.all(
    toScrape.map(async (c): Promise<ScrapeRow> => {
      const cachedRow = cachedByDomain.get(c.domain)
      if (cachedRow && isFresh(cachedRow.scraped_at) && (cachedRow.scraped_text?.length ?? 0) > 100) {
        cacheHits++
        return { ...c, scraped_text: cachedRow.scraped_text!, scraped_ok: true, from_cache: true }
      }
      const text = await scrapeUrl(`https://${c.domain}`)
      return { ...c, scraped_text: text, scraped_ok: text.length > 100, from_cache: false }
    })
  )

  const freshlyScraped = scraped.filter(r => !r.from_cache && r.scraped_ok)
  if (freshlyScraped.length > 0) {
    const now = new Date().toISOString()
    await supabase.from('companies').upsert(
      freshlyScraped.map(r => ({
        domain: r.domain,
        name: r.name,
        logo_url: r.logo_url,
        scraped_text: r.scraped_text,
        scraped_at: now,
        updated_at: now,
      })),
      { onConflict: 'domain' },
    )
  }

  const rest: ScrapeRow[] = companies.slice(50).map(c => ({ ...c, scraped_text: '', scraped_ok: false, from_cache: false }))
  const all = [...scraped, ...rest]

  const artifact = {
    total: all.length,
    scraped: scraped.length,
    ok: scraped.filter(r => r.scraped_ok).length,
    cache_hits: cacheHits,
    companies: all.map(({ scraped_text: _t, from_cache: _c, ...rest }) => rest),
    _texts: all,
  }
  await persistStep(runId, 'scrape', artifact)
  return artifact
}

// ─── STEP: classify ────────────────────────────────────────────────────────────

async function stepClassify(
  runId: string,
  projectId: string,
  scrapeResults: ScrapeRow[],
  icp: Record<string, unknown>,
  offerText: string,
) {
  'use step'
  const supabase = db()
  const toClassify = scrapeResults.slice(0, CLASSIFY_TEST_LIMIT)
  const autoRejected = scrapeResults.slice(CLASSIFY_TEST_LIMIT)

  type ClassifyResult = {
    domain: string; name: string;
    is_target: boolean; confidence: number;
    segment: string; reasoning: string;
    logo_url: string | null
  }
  const results: ClassifyResult[] = []

  if (toClassify.length > 0) {
    const skill = await fetchSkill('company-qualification')

    const batches: typeof toClassify[] = []
    for (let i = 0; i < toClassify.length; i += CLASSIFY_BATCH_SIZE) {
      batches.push(toClassify.slice(i, i + CLASSIFY_BATCH_SIZE))
    }

    const batchOutputs = await pMap(batches, CLASSIFY_CONCURRENCY, async (batch) => {
      const payload = batch.map(c => ({
        domain: c.domain,
        name: c.name,
        description: c.description ?? '',
        scraped: (c.scraped_text ?? '').slice(0, 1500),
      }))
      const prompt = `Offer: ${offerText}
ICP: ${JSON.stringify(icp ?? {})}

Classify each company as is_target=true (matches ICP) or false. Return ONLY a JSON array:
[{"domain":"...","is_target":bool,"confidence":0-100,"segment":"LABEL","reasoning":"..."}]

Companies:
${JSON.stringify(payload, null, 2)}`

      try {
        const raw = await claudeWithRetry(skill, prompt)
        const parsed = JSON.parse(raw) as Array<{ domain: string; is_target: boolean; confidence: number; segment: string; reasoning: string }>
        return { batch, parsed, error: null as string | null }
      } catch (e) {
        return { batch, parsed: [] as Array<{ domain: string; is_target: boolean; confidence: number; segment: string; reasoning: string }>, error: e instanceof Error ? e.message : String(e) }
      }
    })

    for (const { batch, parsed, error } of batchOutputs) {
      const byDomain = Object.fromEntries(parsed.map(r => [r.domain, r]))
      for (const c of batch) {
        const r = byDomain[c.domain]
        if (r) {
          results.push({
            domain: c.domain, name: c.name,
            is_target: r.is_target, confidence: r.confidence,
            segment: r.segment, reasoning: r.reasoning,
            logo_url: c.logo_url,
          })
        } else {
          results.push({
            domain: c.domain, name: c.name,
            is_target: false, confidence: 0,
            segment: 'CLASSIFY_FAILED',
            reasoning: error ? `Claude call failed: ${error}` : 'No verdict returned for this domain',
            logo_url: c.logo_url,
          })
        }
      }
    }
  }

  for (const c of autoRejected) {
    results.push({
      domain: c.domain, name: c.name,
      is_target: false, confidence: 0,
      segment: 'AUTO_REJECTED',
      reasoning: `Skipped — only first ${CLASSIFY_TEST_LIMIT} companies are classified in test mode`,
      logo_url: c.logo_url,
    })
  }

  // Persist to companies + project_companies (mirrors step/route.ts:540 logic)
  if (results.length > 0) {
    const now = new Date().toISOString()
    await supabase.from('companies').upsert(
      results.map(r => ({
        domain: r.domain,
        name: r.name,
        logo_url: r.logo_url ?? null,
        updated_at: now,
      })),
      { onConflict: 'domain' },
    )
    const { data: rows } = await supabase
      .from('companies')
      .select('id, domain')
      .in('domain', results.map(r => r.domain))
    const domainToId = Object.fromEntries((rows ?? []).map((r: { id: string; domain: string }) => [r.domain, r.id]))
    await supabase.from('project_companies').upsert(
      results
        .filter(r => domainToId[r.domain])
        .map(r => ({
          project_id: projectId,
          company_id: domainToId[r.domain],
          pipeline_run_id: runId,
          qualification_status: r.is_target ? 'qualified' : 'rejected',
          is_target: r.is_target,
          confidence: r.confidence,
          segment: r.segment,
          reasoning: r.reasoning,
          source: 'pipeline',
        })),
      { onConflict: 'project_id,company_id' },
    )
  }

  const artifact = {
    total: scrapeResults.length,
    pre_filtered: autoRejected.length,
    candidates: toClassify.length,
    targets: results.filter(r => r.is_target).length,
    results,
  }
  await persistStep(runId, 'classify', artifact)
  return artifact
}

// ─── STEP: extract_people ──────────────────────────────────────────────────────

async function stepExtractPeople(
  runId: string,
  projectId: string,
  iterationId: string | null,
  targetDomains: string[],
  icp: Record<string, unknown>,
) {
  'use step'
  const key = process.env.APOLLO_API_KEY
  if (!key) throw new FatalError('APOLLO_API_KEY not set')
  const supabase = db()

  const flatTitles = icp.titles as string[] | undefined
  const roles = icp.target_roles as Record<string, string[]> | undefined
  const titles = (flatTitles?.length ? flatTitles : [...(roles?.primary ?? []), ...(roles?.secondary ?? [])]).slice(0, 5)
  if (titles.length === 0) {
    throw new FatalError('ICP has no target titles — set "Target roles" in the IcpEditor before extracting people')
  }

  const domainsSlice = targetDomains.slice(0, 25)
  const searchErrors: string[] = []
  const candidates: Array<{ id: string; domain: string }> = []

  await Promise.allSettled(domainsSlice.map(async (domain) => {
    try {
      const params = new URLSearchParams()
      params.set('q_organization_domains_list[]', domain)
      titles.forEach(t => params.append('person_titles[]', t))
      params.set('page', '1')
      params.set('per_page', '10')

      const res = await fetch(`${APOLLO_BASE}/mixed_people/api_search?${params}`, {
        method: 'POST',
        headers: { 'x-api-key': key },
      })
      if (!res.ok) {
        searchErrors.push(`${domain}: ${res.status}`)
        return
      }
      const data = await res.json()
      const people = (data.people ?? []) as Record<string, unknown>[]
      for (const p of people) {
        if (p.id) candidates.push({ id: p.id as string, domain })
      }
    } catch { /* ignore individual domain errors */ }
  }))

  const domainById = Object.fromEntries(candidates.map(c => [c.id, c.domain]))
  const contacts: Array<Record<string, unknown>> = []

  for (let i = 0; i < candidates.length; i += 10) {
    const batch = candidates.slice(i, i + 10)
    try {
      const res = await fetch(`${APOLLO_BASE}/people/bulk_match`, {
        method: 'POST',
        headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ details: batch.map(c => ({ id: c.id })) }),
      })
      if (!res.ok) continue
      const data = await res.json()
      for (const match of (data.matches ?? []) as Record<string, unknown>[]) {
        if (!match.id) continue
        contacts.push({
          first_name: match.first_name,
          last_name: match.last_name,
          email: match.email,
          title: match.title,
          linkedin_url: match.linkedin_url ?? `apollo-${match.id}`,
          domain: domainById[match.id as string] ?? '',
        })
      }
    } catch { /* batch failure is non-fatal */ }
  }

  // Persist contacts (mirrors step/route.ts:580 logic)
  let persistedTotal = 0
  if (contacts.length > 0) {
    const domains = [...new Set(contacts.map(c => c.domain as string))]
    const { data: dbCompanies } = await supabase.from('companies').select('id, domain').in('domain', domains)
    const domainToId = Object.fromEntries((dbCompanies ?? []).map((c: { id: string; domain: string }) => [c.domain, c.id]))

    const attachRows = Object.values(domainToId).map(company_id => ({
      project_id: projectId, company_id, source: 'pipeline',
    }))
    if (attachRows.length > 0) {
      await supabase.from('project_companies').upsert(attachRows, { onConflict: 'project_id,company_id', ignoreDuplicates: true })
    }

    const seenLinkedin = new Set<string>()
    const seenEmail = new Set<string>()
    const rows: Record<string, unknown>[] = []
    for (const c of contacts) {
      const domain = c.domain as string
      if (!domainToId[domain] || !c.linkedin_url) continue
      const li = String(c.linkedin_url)
      const em = c.email ? String(c.email) : null
      if (seenLinkedin.has(li)) continue
      if (em && seenEmail.has(em)) continue
      seenLinkedin.add(li)
      if (em) seenEmail.add(em)
      const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ')
      rows.push({
        project_id: projectId,
        iteration_id: iterationId ?? null,
        company_id: domainToId[domain],
        linkedin_url: li,
        email: em,
        first_name: (fullName.split(' ')[0] ?? c.first_name) as string ?? null,
        last_name: (fullName.split(' ').slice(1).join(' ') ?? c.last_name) as string ?? null,
        title: c.title ? String(c.title) : null,
      })
    }

    if (rows.length > 0) {
      const emailsToCheck = rows.map(r => r.email).filter(Boolean) as string[]
      const existingEmails = new Set<string>()
      if (emailsToCheck.length > 0) {
        const { data: existing } = await supabase.from('contacts').select('email').eq('project_id', projectId).in('email', emailsToCheck)
        for (const r of existing ?? []) if (r.email) existingEmails.add(r.email)
      }
      const deduped = rows.filter(r => !r.email || !existingEmails.has(r.email as string))
      if (deduped.length > 0) {
        await supabase.from('contacts').upsert(deduped, { onConflict: 'project_id,linkedin_url', ignoreDuplicates: true })
      }
    }
    const { count } = await supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('project_id', projectId)
    persistedTotal = count ?? 0
    await supabase.from('pipeline_runs').update({ contacts_found: persistedTotal }).eq('id', runId)
  }

  const artifact = {
    total: contacts.length,
    contacts: contacts.map(c => ({
      name: [c.first_name, c.last_name].filter(Boolean).join(' ') || '—',
      email: c.email, title: c.title, domain: c.domain, linkedin_url: c.linkedin_url,
    })),
    domains_processed: Math.min(25, targetDomains.length),
    domains_total: targetDomains.length,
    has_more: false,
    next_offset: 25,
    contacts_total_in_db: persistedTotal,
    ...(searchErrors.length ? { search_errors: searchErrors } : {}),
  }
  await persistStep(runId, 'extract_people', artifact)
  return artifact
}

// ─── STEP: load_project (read project state for the workflow) ─────────────────

async function stepLoadProject(projectId: string) {
  'use step'
  const supabase = db()
  const { data: project } = await supabase
    .from('projects')
    .select('*, clients(id, name, website_url)')
    .eq('id', projectId)
    .single()
  if (!project) throw new FatalError(`Project ${projectId} not found`)
  return project as Record<string, unknown>
}

async function stepFinalizeRun(runId: string) {
  'use step'
  await db().from('pipeline_runs').update({
    status: 'done',
    updated_at: new Date().toISOString(),
  }).eq('id', runId)
}

// ─── WORKFLOW: full pipeline ───────────────────────────────────────────────────

export async function runPipeline(
  projectId: string,
  iterationId: string,
  runId: string,
) {
  'use workflow'

  const project = await stepLoadProject(projectId)
  const projectIcp = (project.icp_json as Record<string, unknown> | null) ?? {}
  const offerText = (project.offer_text as string | null) ?? (project.clients as Record<string, string> | null)?.website_url ?? (project.name as string)
  const overrideKeywords = (project.run_config_json as { keywords?: string[] } | null)?.keywords

  const filters = await stepGenerateFilters(runId, projectIcp)
  const apollo = await stepApolloSearch(runId, filters, projectIcp, 1, [], overrideKeywords)

  if (apollo.companies.length === 0) {
    await stepFinalizeRun(runId)
    return { runId, contactsFound: 0, message: 'No companies returned by Apollo' }
  }

  const scrape = await stepScrape(runId, apollo.companies)
  const classify = await stepClassify(runId, projectId, scrape._texts, projectIcp, offerText)
  const targetDomains = classify.results.filter(r => r.is_target).map(r => r.domain)

  if (targetDomains.length === 0) {
    await stepFinalizeRun(runId)
    return { runId, contactsFound: 0, message: 'No companies passed classification' }
  }

  const people = await stepExtractPeople(runId, projectId, iterationId, targetDomains, projectIcp)
  await stepFinalizeRun(runId)
  return { runId, contactsFound: people.contacts_total_in_db ?? people.total, qualifiedDomains: targetDomains.length }
}

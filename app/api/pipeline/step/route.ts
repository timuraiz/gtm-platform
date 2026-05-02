import { createServerClient } from '@supabase/ssr'
import Anthropic from '@anthropic-ai/sdk'

const APOLLO_BASE = 'https://api.apollo.io/api/v1'

export const maxDuration = 60

function db() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

async function fetchSkill(name: string) {
  const { data } = await db().from('skills').select('content').eq('name', name).single()
  if (!data) throw new Error(`Skill "${name}" not found`)
  return data.content as string
}

async function claude(system: string, user: string) {
  const msg = await new Anthropic().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: user }],
  })
  const block = msg.content[0]
  if (block.type !== 'text') throw new Error('Non-text response')
  return block.text.replace(/^```(?:json)?\n?/m, '').replace(/```\s*$/m, '').trim()
}

async function scrape(url: string) {
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

function isUrl(s: string) {
  try { new URL(s); return true } catch { return false }
}

// ─── Step handlers ────────────────────────────────────────────────────────────

async function runExtractIcp(project: Record<string, unknown>) {
  const skill = await fetchSkill('offer-extraction')

  // Build rich context from existing project data
  const offerText = project.offer_text as string | null
  let offerContext = ''

  if (offerText && isUrl(offerText)) {
    const scraped = await scrape(offerText)
    offerContext = scraped.length > 200
      ? `Website content (${offerText}):\n${scraped}`
      : `Website URL: ${offerText} (could not scrape)`
  } else if (offerText) {
    offerContext = `Offer description:\n${offerText}`
  }

  const existingIcp = project.icp_json as Record<string, unknown> | null
  const icpContext = existingIcp && Object.keys(existingIcp).length > 0
    ? `\n\nExisting ICP (already extracted, use as primary source):\n${JSON.stringify(existingIcp, null, 2)}`
    : ''

  const prompt = `Project name: ${project.name as string}
${offerContext}${icpContext}

Extract a complete ICP. If existing ICP is provided, enrich and expand it — don't ignore it.
Return ONLY valid JSON, no markdown.`

  const raw = await claude(skill, prompt)
  return JSON.parse(raw)
}

async function runGenerateFilters(icp: unknown) {
  const skill = await fetchSkill('apollo-filter-mapping')
  const raw = await claude(skill, `Generate Apollo search filters for this ICP:\n${JSON.stringify(icp, null, 2)}\n\nReturn ONLY valid JSON.`)
  const filters = JSON.parse(raw)
  // Fallback geo/size from ICP if missing
  const icpData = icp as Record<string, unknown>
  const apolloFilters = (icpData.apollo_filters ?? {}) as Record<string, unknown>
  if (!filters.locations?.length && apolloFilters.locations) filters.locations = apolloFilters.locations
  if (!filters.employee_ranges?.length && apolloFilters.employee_range) filters.employee_ranges = [apolloFilters.employee_range]
  return filters
}

// Keywords that describe conference/event industry itself — using these finds organizers, not exhibitors
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


async function runApolloSearch(filters: Record<string, unknown>, icp: Record<string, unknown>, page = 1, seenDomains: string[] = [], overrideKeywords?: string[]) {
  const key = process.env.APOLLO_API_KEY
  if (!key) throw new Error('APOLLO_API_KEY not set')

  const seen = new Set<string>(seenDomains)
  const companies: Array<{
    domain: string; name: string; apollo_id?: string
    description: string; keywords: string[]; industry: string
    funding_stage: string; employee_count: number
  }> = []
  const title_hits: Record<string, number> = {}
  const keyword_hits: Record<string, number> = {}

  // Titles from ICP (manual overrides take priority)
  const roles = icp.target_roles as Record<string, string[]> | undefined
  const titles = [...(roles?.primary ?? []), ...(roles?.secondary ?? [])].slice(0, 6)

  // Locations — prefer manual ICP override
  const locations: unknown = (icp.apollo_filters as Record<string, unknown> | undefined)?.locations ?? filters.locations

  // Employee ranges — prefer manual override
  const employeeRanges: unknown = (icp.employee_ranges as string[] | undefined)?.length
    ? icp.employee_ranges
    : filters.employee_ranges

  // Funding stage filter from manual ICP
  const fundingRounds = icp.funding_rounds as string[] | undefined
  const fundingStages = fundingRounds?.map(r => FUNDING_STAGE_MAP[r]).filter(Boolean) ?? []

  // Industry keywords — run_config overrides take priority, then ICP segments, then filter keywords
  const segments = icp.segments as Array<{ name: string; keywords: string[] }> | undefined
  const industryKeywords = overrideKeywords?.length
    ? overrideKeywords
    : segments
      ? segments.flatMap(s => s.keywords.filter(k => !CONFERENCE_NOISE.has(k.toLowerCase())).slice(0, 3)).slice(0, 10)
      : (filters.keywords as string[] ?? []).filter(k => !CONFERENCE_NOISE.has(k.toLowerCase())).slice(0, 10)

  let apolloError: string | null = null

  // Strategy 1: disabled — /mixed_people/api_search does not return org domains,
  // so title-based company discovery is not possible with the current API.
  for (const title of titles) title_hits[title] = 0

  // Strategy 2: company keyword search using industry keywords (not conference keywords)
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
        console.error(`[Apollo keyword] "${kw}" → ${res.status}: ${err}`)
        if (res.status === 402 || res.status === 429 || err.toLowerCase().includes('credit') || err.toLowerCase().includes('limit')) {
          apolloError = `Apollo credits exhausted (${res.status}) — top up at app.apollo.io`
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
        })
        hits++
      }
      keyword_hits[kw] = hits
    } catch { keyword_hits[kw] = -1 }
  }))

  if (apolloError) throw new Error(apolloError)

  return { companies_found: companies.length, title_hits, keyword_hits, companies }
}

type ApolloCompany = {
  domain: string; name: string; apollo_id?: string
  description: string; keywords: string[]; industry: string
  funding_stage: string; employee_count: number
}

async function runScrape(companies: ApolloCompany[]) {
  // Prioritize companies with weak Apollo metadata — those benefit most from scraping
  const weak = companies.filter(c => (c.description?.length ?? 0) < 80)
  const strong = companies.filter(c => (c.description?.length ?? 0) >= 80)
  const toScrape = [...weak, ...strong].slice(0, 50)
  const scraped = await Promise.all(
    toScrape.map(async (c) => {
      const text = await scrape(`https://${c.domain}`)
      return { ...c, scraped_text: text, scraped_ok: text.length > 100 }
    })
  )
  // Attach empty scraped_text to remaining companies so classify sees everything
  const rest = companies.slice(50).map(c => ({ ...c, scraped_text: '', scraped_ok: false }))
  const all = [...scraped, ...rest]

  return {
    total: all.length,
    scraped: scraped.length,
    ok: scraped.filter(r => r.scraped_ok).length,
    companies: all.map(({ scraped_text: _t, ...rest }) => rest),
    _texts: all,
  }
}

async function runClassify(
  scrapeResults: Array<ApolloCompany & { scraped_text?: string; scraped_ok?: boolean }>,
  _icp: unknown,
  _offerText: string,
) {
  // TEMP: skip classification — pass all companies through as targets
  const results = scrapeResults.map(c => ({
    domain: c.domain, name: c.name,
    is_target: true, confidence: 100,
    segment: 'UNCLASSIFIED', reasoning: 'Classification skipped',
  }))
  return {
    total: scrapeResults.length,
    pre_filtered: 0,
    candidates: scrapeResults.length,
    targets: results.length,
    results,
  }
}

async function runExtractPeople(
  targetDomains: string[],
  icp: unknown,
  scout = false,
  domainOffset = 0,
) {
  const key = process.env.APOLLO_API_KEY!
  const icpData = icp as Record<string, unknown>
  const roles = icpData.target_roles as Record<string, string[]> | undefined
  const titles = [...(roles?.primary ?? []), ...(roles?.secondary ?? [])].slice(0, 5)

  const domainLimit = scout ? 3 : 25
  const domainsSlice = targetDomains.slice(domainOffset, domainOffset + domainLimit)
  const nextOffset = domainOffset + domainLimit
  const searchErrors: string[] = []

  // Step 1: collect Apollo IDs via api_search — no credits consumed
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
        const errText = await res.text().catch(() => '')
        console.error(`[extract_people] ${domain} → ${res.status}: ${errText}`)
        searchErrors.push(`${domain}: ${res.status}`)
        return
      }

      const data = await res.json()
      let people = (data.people ?? []) as Record<string, unknown>[]

      // Fallback: retry without title filter if no results
      if (people.length === 0 && titles.length > 0) {
        const fallbackParams = new URLSearchParams()
        fallbackParams.set('q_organization_domains_list[]', domain)
        fallbackParams.set('page', '1')
        fallbackParams.set('per_page', '5')
        people = await fetch(`${APOLLO_BASE}/mixed_people/api_search?${fallbackParams}`, {
          method: 'POST',
          headers: { 'x-api-key': key },
        }).then(r => r.ok ? r.json().then((d: Record<string, unknown>) => (d.people ?? []) as Record<string, unknown>[]) : []).catch(() => [])
      }

      for (const p of people) {
        if (p.id) candidates.push({ id: p.id as string, domain })
      }
    } catch (e) {
      console.error(`[extract_people] ${domain} threw:`, e)
    }
  }))

  // Step 2: enrich in batches of 10 via bulk_match — consumes credits, returns email + linkedin_url
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
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        console.error(`[enrich_people] batch ${i} → ${res.status}: ${errText}`)
        continue
      }
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
    } catch (e) {
      console.error(`[enrich_people] batch ${i} threw:`, e)
    }
  }

  return {
    total: contacts.length,
    contacts: contacts.map(c => ({
      name: [c.first_name, c.last_name].filter(Boolean).join(' ') || '—',
      email: c.email, title: c.title, domain: c.domain, linkedin_url: c.linkedin_url,
    })),
    domains_processed: Math.min(nextOffset, targetDomains.length),
    domains_total: targetDomains.length,
    has_more: nextOffset < targetDomains.length,
    next_offset: nextOffset,
    ...(searchErrors.length ? { search_errors: searchErrors } : {}),
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

const STEP_ORDER = ['extract_icp', 'generate_filters', 'apollo_search', 'scrape', 'classify', 'extract_people'] as const
type StepName = typeof STEP_ORDER[number]

export async function POST(req: Request) {
  try {
    const body = await req.json() as { projectId: string; step: StepName; runId?: string; page?: number; seenDomains?: string[]; domainOffset?: number; domainsOverride?: string[] }
    const { projectId, step, runId: existingRunId, page = 1, seenDomains = [], domainOffset = 0, domainsOverride } = body
    const supabase = db()

    // Load project + client
    const { data: project } = await supabase
      .from('projects')
      .select('*, clients(id, name, website_url)')
      .eq('id', projectId)
      .single()
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })

    // Get or create run
    let runId = existingRunId
    let existingSteps: Array<{ name: string; status: string; artifact: unknown }> = []

    if (runId) {
      const { data: run } = await supabase.from('pipeline_runs').select('steps').eq('id', runId).single()
      existingSteps = (run?.steps ?? []) as typeof existingSteps
    } else {
      const { data: run } = await supabase
        .from('pipeline_runs')
        .insert({ project_id: projectId, status: 'running' })
        .select('id').single()
      runId = run!.id
    }

    // Get previous step artifacts for context
    const getArtifact = (name: string) => existingSteps.find(s => s.name === name)?.artifact

    // Run the requested step
    let artifact: unknown
    const offerText = (project.offer_text as string | null) ?? (project.clients as Record<string, string> | null)?.website_url ?? project.name as string

    switch (step) {
      case 'extract_icp':
        artifact = await runExtractIcp(project as Record<string, unknown>)
        break
      case 'generate_filters': {
        const icp = getArtifact('extract_icp')
        if (!icp) throw new Error('Run extract_icp first')
        artifact = await runGenerateFilters(icp)
        break
      }
      case 'apollo_search': {
        const filters = getArtifact('generate_filters') as Record<string, unknown>
        const icp = getArtifact('extract_icp') as Record<string, unknown> ?? {}
        if (!filters) throw new Error('Run generate_filters first')
        const overrideKeywords = (project.run_config_json as { keywords?: string[] } | null)?.keywords
        artifact = await runApolloSearch(filters, icp, page, seenDomains, overrideKeywords)
        break
      }
      case 'scrape': {
        const apolloResult = getArtifact('apollo_search') as { companies: ApolloCompany[] }
        if (!apolloResult) throw new Error('Run apollo_search first')
        artifact = await runScrape(apolloResult.companies)
        break
      }
      case 'classify': {
        const scrapeResult = getArtifact('scrape') as { _texts?: Array<ApolloCompany & { scraped_text?: string; scraped_ok?: boolean }> }
        const icp = getArtifact('extract_icp')
        if (!scrapeResult) throw new Error('Run scrape first')
        const texts = scrapeResult._texts ?? []
        artifact = await runClassify(texts, icp, offerText)
        break
      }
      case 'extract_people': {
        const classifyResult = getArtifact('classify') as { results: Array<{ domain: string; is_target: boolean }> }
        const icp = getArtifact('extract_icp')
        if (!classifyResult) throw new Error('Run classify first')
        const targetDomains = domainsOverride?.length
          ? domainsOverride
          : classifyResult.results.filter(r => r.is_target).map(r => r.domain)
        const offset = domainsOverride?.length ? 0 : domainOffset
        artifact = await runExtractPeople(targetDomains, icp, false, offset)
        break
      }
      default:
        return Response.json({ error: `Unknown step: ${step}` }, { status: 400 })
    }

    // For extract_people load-more calls, merge artifact totals with existing step data
    if (step === 'extract_people' && domainsOverride?.length) {
      const prev = existingSteps.find(s => s.name === 'extract_people')?.artifact as Record<string, unknown> | undefined
      if (prev) {
        const cur = artifact as Record<string, unknown>
        artifact = {
          ...cur,
          total: ((prev.total as number) ?? 0) + ((cur.total as number) ?? 0),
          domains_processed: ((prev.domains_processed as number) ?? 0) + domainsOverride.length,
          domains_total: prev.domains_total,
          has_more: cur.has_more,
        }
      }
    }

    // Save step to run
    const newStep = { name: step, status: 'done', artifact }
    const updatedSteps = [...existingSteps.filter(s => s.name !== step), newStep]
    const isExtractPeople = step === 'extract_people'
    const hasMore = isExtractPeople && (artifact as { has_more: boolean }).has_more

    await supabase.from('pipeline_runs').update({
      steps: updatedSteps,
      status: isExtractPeople && !hasMore ? 'done' : isExtractPeople ? 'running' : 'running',
      updated_at: new Date().toISOString(),
      ...(isExtractPeople ? {
        companies_found: (getArtifact('apollo_search') as { companies_found: number } | undefined)?.companies_found ?? 0,
      } : {}),
    }).eq('id', runId)

    // Persist companies + contacts on relevant steps
    if (step === 'classify') {
      const result = artifact as { results: Array<{ domain: string; name: string; is_target: boolean; confidence: number; segment: string; reasoning: string }> }
      if (result.results.length > 0) {
        await supabase.from('companies').upsert(
          result.results.map(r => ({
            project_id: projectId,
            pipeline_run_id: runId,
            domain: r.domain,
            name: r.name,
            scraped_text: '',
            is_target: r.is_target,
            confidence: r.confidence,
            segment: r.segment,
            reasoning: r.reasoning,
            qualification_status: r.is_target ? 'qualified' : 'rejected',
          })),
          { onConflict: 'project_id,domain' },
        )
      }
    }

    let actualContactsCount: number | undefined
    if (step === 'extract_people') {
      const result = artifact as { contacts: Array<{ name: string; email?: unknown; title?: unknown; domain: string; linkedin_url?: unknown }> }
      if (result.contacts.length > 0) {
        const domains = [...new Set(result.contacts.map(c => c.domain))]
        const { data: dbCompanies } = await supabase.from('companies').select('id, domain').eq('project_id', projectId).in('domain', domains)
        const domainToId = Object.fromEntries((dbCompanies ?? []).map((c: { id: string; domain: string }) => [c.domain, c.id]))

        // Deduplicate within batch by linkedin_url then by email
        const seenLinkedin = new Set<string>()
        const seenEmail = new Set<string>()
        const rows = []
        for (const c of result.contacts) {
          if (!domainToId[c.domain] || !c.linkedin_url) continue
          const li = String(c.linkedin_url)
          const em = c.email ? String(c.email) : null
          if (seenLinkedin.has(li)) continue
          if (em && seenEmail.has(em)) continue
          seenLinkedin.add(li)
          if (em) seenEmail.add(em)
          rows.push({
            project_id: projectId,
            company_id: domainToId[c.domain],
            linkedin_url: li,
            email: em,
            first_name: c.name.split(' ')[0] || null,
            last_name: c.name.split(' ').slice(1).join(' ') || null,
            title: c.title ? String(c.title) : null,
          })
        }

        if (rows.length > 0) {
          // Filter out emails already in DB for this project
          const emailsToCheck = rows.map(r => r.email).filter(Boolean) as string[]
          const existingEmails = new Set<string>()
          if (emailsToCheck.length > 0) {
            const { data: existing } = await supabase.from('contacts').select('email').eq('project_id', projectId).in('email', emailsToCheck)
            for (const r of existing ?? []) if (r.email) existingEmails.add(r.email)
          }
          const deduped = rows.filter(r => !r.email || !existingEmails.has(r.email))
          if (deduped.length > 0) {
            await supabase.from('contacts').upsert(deduped, { onConflict: 'project_id,linkedin_url', ignoreDuplicates: true })
          }
        }
      }
      const { count } = await supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('project_id', projectId)
      actualContactsCount = count ?? 0

      // Update contacts_found with real deduplicated count
      await supabase.from('pipeline_runs').update({ contacts_found: actualContactsCount }).eq('id', runId)
    }

    return Response.json({ runId, step, artifact, ...(actualContactsCount !== undefined ? { contactsTotal: actualContactsCount } : {}) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Try to persist the error state to the run so the UI reflects it
    try {
      const body = await req.clone().json().catch(() => null) as { runId?: string; step?: string } | null
      if (body?.runId && body?.step) {
        const supabase = db()
        const { data: run } = await supabase.from('pipeline_runs').select('steps').eq('id', body.runId).single()
        const existingSteps = (run?.steps ?? []) as Array<{ name: string; status: string; artifact: unknown }>
        const errorStep = { name: body.step, status: 'error', artifact: { error: message } }
        const updatedSteps = [...existingSteps.filter(s => s.name !== body.step), errorStep]
        await supabase.from('pipeline_runs').update({ steps: updatedSteps, status: 'error' }).eq('id', body.runId)
      }
    } catch { /* best-effort */ }

    return Response.json({ error: message }, { status: 500 })
  }
}

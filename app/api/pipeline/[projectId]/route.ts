import { createServerClient } from '@supabase/ssr'
import Anthropic from '@anthropic-ai/sdk'

const APOLLO_BASE = 'https://api.apollo.io/api/v1'

function supabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

async function fetchSkill(name: string): Promise<string> {
  const { data } = await supabase().from('skills').select('content').eq('name', name).single()
  if (!data) throw new Error(`Skill "${name}" not found in DB`)
  return data.content
}

async function callClaude(system: string, user: string): Promise<string> {
  const client = new Anthropic()
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: user }],
  })
  const block = msg.content[0]
  if (block.type !== 'text') throw new Error('Non-text Claude response')
  return block.text.replace(/^```(?:json)?\n?/m, '').replace(/```\s*$/m, '').trim()
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
      .slice(0, 5000)
  } catch { return '' }
}

async function apolloCompanySearch(filters: ApolloFilters, keyword: string) {
  const key = process.env.APOLLO_API_KEY
  if (!key) throw new Error('APOLLO_API_KEY is not set')
  const res = await fetch(`${APOLLO_BASE}/mixed_companies/search`, {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q_organization_keyword_tags: [keyword],
      organization_locations: filters.locations,
      organization_num_employees_ranges: filters.employee_ranges,
      page: 1,
      per_page: 100,
    }),
  })
  if (!res.ok) throw new Error(`Apollo ${res.status}`)
  return res.json()
}

async function apolloPeopleSearch(domain: string, seniorities: string[]) {
  const key = process.env.APOLLO_API_KEY!
  const res = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q_organization_domains: [domain],
      person_seniorities: seniorities,
      page: 1,
      per_page: 10,
    }),
  })
  if (!res.ok) return { people: [] }
  return res.json()
}

type ApolloFilters = { keywords: string[]; locations: string[]; employee_ranges: string[] }
type IcpResult = {
  primary_offer?: string
  target_roles?: { primary?: string[]; secondary?: string[]; seniorities?: string[] }
  segments?: { name: string; keywords: string[] }[]
  apollo_filters?: { combined_keywords?: string[]; locations?: string[]; employee_range?: string }
}
type Company = {
  domain: string; name: string; apollo_id?: string
  scraped_text?: string; scrape_ok?: boolean
  is_target?: boolean; confidence?: number; segment?: string; reasoning?: string
}
type Contact = {
  first_name?: string; last_name?: string; email?: string
  title?: string; linkedin_url?: string; domain: string; apollo_data?: unknown
}
type StepRecord = { name: string; status: 'done' | 'error'; artifact: unknown }

function makeEmitter(controller: ReadableStreamDefaultController<Uint8Array>) {
  const enc = new TextEncoder()
  return (data: object) => controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))
}

async function saveStep(db: ReturnType<typeof supabase>, runId: string, steps: StepRecord[]) {
  await db.from('pipeline_runs').update({ steps, updated_at: new Date().toISOString() }).eq('id', runId)
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const url = new URL(_req.url)
  const iterationId = url.searchParams.get('iterationId')

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = makeEmitter(controller)
      const db = supabase()
      const steps: StepRecord[] = []

      try {
        const { data: project } = await db.from('projects').select('*').eq('id', projectId).single()
        if (!project) throw new Error('Project not found')

        // Load iteration's target_segment if provided
        type TargetSegment = { industry: string; geo: string; seniority: string }
        let targetSegment: TargetSegment | null = null
        if (iterationId) {
          const { data: iter } = await db.from('iterations').select('target_segment').eq('id', iterationId).single()
          targetSegment = (iter?.target_segment as TargetSegment | null) ?? null
        }

        const { data: run } = await db
          .from('pipeline_runs').insert({ project_id: projectId, status: 'running' }).select('id').single()
        const runId = run?.id as string
        emit({ step: 'run_created', runId })

        // ── Step 1: Extract ICP ────────────────────────────────────────────
        emit({ step: 'extract_icp', status: 'running' })
        const offerSkill = await fetchSkill('offer-extraction')
        const segmentContext = targetSegment
          ? `\nTarget segment for this run: industry="${targetSegment.industry}", geo="${targetSegment.geo}", seniority="${targetSegment.seniority}". Narrow the ICP to this segment.`
          : ''
        const icpRaw = await callClaude(
          offerSkill,
          `Extract ICP for this offer/project:\nName: ${project.name}\nOffer: ${project.offer_text ?? ''}\nExisting ICP: ${JSON.stringify(project.icp_json ?? {})}${segmentContext}`,
        )
        const icp: IcpResult = JSON.parse(icpRaw)
        steps.push({ name: 'extract_icp', status: 'done', artifact: icp })
        await saveStep(db, runId, steps)
        emit({ step: 'extract_icp', status: 'done', artifact: icp })

        // ── Step 2: Generate filters ───────────────────────────────────────
        emit({ step: 'generate_filters', status: 'running' })
        const filterSkill = await fetchSkill('apollo-filter-mapping')
        const filtersRaw = await callClaude(filterSkill, `Generate Apollo search filters for this ICP:\n${JSON.stringify(icp)}`)
        const generatedFilters: ApolloFilters = JSON.parse(filtersRaw)
        if (!generatedFilters.employee_ranges?.length && icp.apollo_filters?.employee_range)
          generatedFilters.employee_ranges = [icp.apollo_filters.employee_range]
        if (!generatedFilters.locations?.length && icp.apollo_filters?.locations?.length)
          generatedFilters.locations = icp.apollo_filters.locations
        // Segment overrides: narrow to exact geo + add industry as keyword
        if (targetSegment?.geo) generatedFilters.locations = [targetSegment.geo]
        if (targetSegment?.industry && !generatedFilters.keywords?.includes(targetSegment.industry))
          generatedFilters.keywords = [targetSegment.industry, ...(generatedFilters.keywords ?? [])]
        steps.push({ name: 'generate_filters', status: 'done', artifact: generatedFilters })
        await saveStep(db, runId, steps)
        emit({ step: 'generate_filters', status: 'done', artifact: generatedFilters })
        await db.from('pipeline_runs').update({ filters: generatedFilters }).eq('id', runId)

        // ── Step 3: Apollo search ──────────────────────────────────────────
        emit({ step: 'apollo_search', status: 'running' })
        const keywords = (generatedFilters.keywords ?? []).slice(0, 8)
        const seenDomains = new Set<string>()
        const allOrgs: Company[] = []
        const keywordHits: Record<string, number> = {}

        await Promise.allSettled(keywords.map(async (kw) => {
          try {
            const data = await apolloCompanySearch(generatedFilters, kw)
            let hits = 0
            for (const org of (data.organizations ?? []) as Record<string, string>[]) {
              const domain = org.primary_domain ?? ''
              if (!domain || seenDomains.has(domain)) continue
              seenDomains.add(domain)
              allOrgs.push({ domain, name: org.name ?? domain, apollo_id: org.id })
              hits++
            }
            keywordHits[kw] = hits
          } catch { keywordHits[kw] = -1 }
        }))

        const apolloArtifact = { companies_found: allOrgs.length, keyword_hits: keywordHits, companies: allOrgs.map(c => ({ domain: c.domain, name: c.name })) }
        steps.push({ name: 'apollo_search', status: 'done', artifact: apolloArtifact })
        await saveStep(db, runId, steps)
        emit({ step: 'apollo_search', status: 'done', count: allOrgs.length, artifact: apolloArtifact })

        // ── Step 4: Scrape ─────────────────────────────────────────────────
        emit({ step: 'scrape', status: 'running', total: allOrgs.length })
        const toScrape = allOrgs.slice(0, 20)
        await Promise.allSettled(toScrape.map(async (c) => {
          c.scraped_text = await scrapeUrl(`https://${c.domain}`)
          c.scrape_ok = (c.scraped_text?.length ?? 0) > 100
        }))
        const scrapeArtifact = {
          total: toScrape.length,
          ok: toScrape.filter(c => c.scrape_ok).length,
          companies: toScrape.map(c => ({ domain: c.domain, name: c.name, chars: c.scraped_text?.length ?? 0, ok: c.scrape_ok }))
        }
        steps.push({ name: 'scrape', status: 'done', artifact: scrapeArtifact })
        await saveStep(db, runId, steps)
        emit({ step: 'scrape', status: 'done', artifact: scrapeArtifact })

        // ── Step 5: Classify ───────────────────────────────────────────────
        emit({ step: 'classify', status: 'running', total: toScrape.length })
        const qualSkill = await fetchSkill('company-qualification')
        const targets: Company[] = []
        const classifyResults: Array<{ domain: string; name: string; is_target: boolean; confidence: number; segment: string; reasoning: string }> = []

        const BATCH = 10
        for (let i = 0; i < toScrape.length; i += BATCH) {
          const batch = toScrape.slice(i, i + BATCH)
          const payload = batch.map(c => ({ domain: c.domain, name: c.name, website_text: (c.scraped_text ?? '').slice(0, 2000) }))
          try {
            const classifyContext = targetSegment
              ? `Offer: ${icp.primary_offer ?? project.offer_text ?? ''}\nTarget segment: industry="${targetSegment.industry}", geo="${targetSegment.geo}", seniority="${targetSegment.seniority}"`
              : `Offer: ${icp.primary_offer ?? project.offer_text ?? ''}\nICP: ${JSON.stringify(icp.target_roles ?? {})}`
            const raw = await callClaude(qualSkill, `${classifyContext}\n\nClassify each company. Return JSON array:\n[{"domain":"...","is_target":bool,"confidence":0-100,"segment":"LABEL","reasoning":"..."}]\n\nCompanies:\n${JSON.stringify(payload)}`)
            const results = JSON.parse(raw) as typeof classifyResults
            for (const r of results) {
              const company = batch.find(c => c.domain === r.domain)
              if (!company) continue
              company.is_target = r.is_target
              company.confidence = r.confidence
              company.segment = r.segment
              company.reasoning = r.reasoning
              classifyResults.push({ domain: r.domain, name: company.name, is_target: r.is_target, confidence: r.confidence, segment: r.segment, reasoning: r.reasoning })
              if (r.is_target) targets.push(company)
            }
          } catch { /* skip failed batch */ }
          emit({ step: 'classify', status: 'progress', done: Math.min(i + BATCH, toScrape.length) })
        }

        const classifyArtifact = { total: toScrape.length, targets: targets.length, results: classifyResults }
        steps.push({ name: 'classify', status: 'done', artifact: classifyArtifact })
        await saveStep(db, runId, steps)
        emit({ step: 'classify', status: 'done', artifact: classifyArtifact })

        // save companies to DB
        if (toScrape.length > 0) {
          await db.from('companies').upsert(
            toScrape.map(c => ({
              project_id: projectId, pipeline_run_id: runId, domain: c.domain, name: c.name,
              scraped_text: c.scraped_text, is_target: c.is_target ?? false,
              confidence: c.confidence, segment: c.segment, reasoning: c.reasoning,
              qualification_status: c.is_target ? 'qualified' : 'rejected',
              apollo_data: { apollo_id: c.apollo_id },
            })),
            { onConflict: 'project_id,domain' },
          )
        }

        // ── Step 6: Extract people ─────────────────────────────────────────
        emit({ step: 'extract_people', status: 'running', total: targets.length })
        const allContacts: Contact[] = []
        // People search uses Apollo seniority filter from ICP
        const icpSeniorities = (project.icp_json as Record<string, unknown> | null)?.apollo_filters as Record<string, unknown> | undefined
        const searchSeniorities: string[] = (icpSeniorities?.person_seniorities as string[] | undefined) ?? []

        await Promise.allSettled(targets.slice(0, 15).map(async (company) => {
          try {
            const data = await apolloPeopleSearch(company.domain, searchSeniorities)
            for (const p of (data.people ?? []) as Record<string, unknown>[]) {
              const linkedin = (p.linkedin_url as string | null) ?? ''
              if (!linkedin && !p.email) continue
              allContacts.push({
                first_name: p.first_name as string | undefined,
                last_name: p.last_name as string | undefined,
                email: p.email as string | undefined,
                title: (p.title ?? (p as Record<string, unknown>).headline) as string | undefined,
                linkedin_url: linkedin || `person-${p.id}`,
                domain: company.domain, apollo_data: p,
              })
            }
          } catch { /* skip */ }
        }))

        const peopleArtifact = {
          total: allContacts.length,
          contacts: allContacts.map(c => ({
            name: [c.first_name, c.last_name].filter(Boolean).join(' ') || '—',
            email: c.email, title: c.title, domain: c.domain, linkedin_url: c.linkedin_url,
          }))
        }
        steps.push({ name: 'extract_people', status: 'done', artifact: peopleArtifact })
        await saveStep(db, runId, steps)
        emit({ step: 'extract_people', status: 'done', artifact: peopleArtifact })

        // save contacts
        if (allContacts.length > 0) {
          const domains = [...new Set(allContacts.map(c => c.domain))]
          const { data: dbCompanies } = await db.from('companies').select('id, domain').eq('project_id', projectId).in('domain', domains)
          const domainToId = Object.fromEntries((dbCompanies ?? []).map((c: { id: string; domain: string }) => [c.domain, c.id]))
          await db.from('contacts').upsert(
            allContacts.filter(c => domainToId[c.domain]).map(c => ({
              project_id: projectId, company_id: domainToId[c.domain],
              linkedin_url: c.linkedin_url!, email: c.email,
              first_name: c.first_name, last_name: c.last_name, title: c.title, apollo_data: c.apollo_data,
            })),
            { onConflict: 'project_id,linkedin_url' },
          )
        }

        await db.from('pipeline_runs').update({
          status: 'done', companies_found: toScrape.length, contacts_found: allContacts.length,
          updated_at: new Date().toISOString(),
        }).eq('id', runId)

        emit({ step: 'done', companies: toScrape.length, targets: targets.length, contacts: allContacts.length, runId })
      } catch (err) {
        emit({ step: 'error', message: String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  })
}

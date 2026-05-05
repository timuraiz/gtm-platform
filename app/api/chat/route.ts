import { anthropic } from '@ai-sdk/anthropic'
import { streamText, tool, stepCountIs, convertToModelMessages, type UIMessage } from 'ai'
import { z } from 'zod'
import { createClient as createSupabase } from '@/utils/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

function bumpCache() {
  revalidatePath('/', 'layout')
}

const SYSTEM = `You are a GTM (Go-to-Market) assistant inside a B2B outbound platform.

Always respond in the same language the user writes in.

Use tools immediately when the intent is clear. Chain tools across steps when needed (e.g. find_client → list_iterations → list_sequences).

App data model:
- A workspace has multiple clients (companies you do outreach for).
- Each client has projects (campaigns).
- A project has iterations (rounds of outreach), each on a single channel: linkedin or email.
- An iteration has contacts (uploaded or pipeline-extracted) and sequences (multi-step messaging templates with versions; one approved version per channel).
- Iterations have status: draft → running → finished, or discarded.
- After running, users upload campaign stats (leads_sent, connections_accepted, replies, positive_replies, meetings_booked) per iteration.
- A team is a flat allow-list — anyone on it can see everything.

When the user asks to do something, just do it via tools. Don't ask for confirmation on safe actions.

Pipeline = companies pipe only (generate_filters → apollo_search → scrape → classify). Extract people happens separately in the Companies tab on selected qualified companies. Don't suggest "extract people" as a pipeline step — direct the user to the Companies tab.

When the user asks about pipeline / company-quality / ICP refinement (e.g. "почему эти компании в результатах?", "improve ICP", "filter out X", "посмотри последний run"):
1. If they reference a "run" or "запуск" — call list_pipeline_runs to see recent runs, then get_run_details(run_id) for the specific one. This is per-run analysis: which keywords were used, what Apollo returned, why classifier rejected/qualified specific domains.
2. If they ask in general (no specific run) — call get_project_icp + get_classify_summary for the project-wide picture.
3. Read specific examples with list_classified_companies (status='rejected' or 'qualified') for cross-run aggregate.
4. Spot patterns in reasoning + segments + apollo_keyword_hits — what makes companies fit/not fit and which keywords actually returned hits.
5. Propose ICP refinements with a concrete diff (which fields you'll change and why).
6. Apply via update_project_icp — pass the FULL new icp_json, not a patch. ICP is the single source of truth visible to the user in the IcpEditor on the project page.
7. Validate: reclassify_project_companies on a sample to check new ICP catches the bad ones.
8. Tell the user to click "Start Pipeline" → Run on each step to discover new companies. The pipeline auto-skips domains already attached to this project, so re-runs only return NEW companies.

Pagination: Apollo returns 50 companies per keyword per page. The current pipeline only fetches page 1. If a run shows apollo_page=N and the user wants more candidates with the same filters, tell them to use the "Load page N+1" button under the run's CTA in the Pipeline tab. That button prepares the panel — the user still clicks Run on apollo_search / scrape / classify themselves. Don't claim you fetched another page; only recommend the action.

ICP fields you can modify (all live under icp_json) — every field below is rendered visibly in the IcpEditor on the project page, so use these:
- segments — Apollo keyword search phrases. Format: [{"name":"main","keywords":["fintech app","developer tools","B2B SaaS"]}]. Use product/industry words. AVOID fundraising-language ("recently funded", "seed raised") — those phrases live on VC websites and pull VC firms. The IcpEditor surfaces these as "Apollo keywords" chips.
- titles — flat array of target roles ["CEO","Founder","Head of Marketing"]. Shown as "Target roles" in the editor.
- industries — list of broad industry labels ["SaaS","Fintech","HealthTech"].
- funding_rounds — list like ["seed","series_a","series_b"] (lowercase, underscore). Maps to Apollo structured filter.
- employee_ranges — list of "min,max" strings: ["1,10","11,50","51,200","201,500","501,1000","1001,10000"]. CRITICAL: use comma not dash. The editor maps these to "Company size" chips and Apollo expects this format.
- geo — list of locations ["United States","United Kingdom"]. Shown as "Geography".
- apollo_filters.locations — mirror of geo for downstream code; set both to the same values.
- exclusions — phrases the classifier uses to reject (e.g. "VC funds", "Branding studios", "Accelerators"). Strong signal for classify step.
- trigger — single string for trigger signal.

CRITICAL — you CANNOT run the pipeline. There is no tool to trigger apollo_search / scrape / extract_people.
Your tools only let you (a) read project state, (b) mutate ICP/qualification, (c) reclassify existing companies. New companies from Apollo come ONLY when the user clicks "Start Pipeline" in the UI.

After applying ICP changes, NEVER claim "pipeline started" or "🚀 running". Instead say:
- "ICP updated. Reclassified existing companies — N qualified, M rejected. To find NEW companies matching the updated ICP, click Start Pipeline in the UI."

Do NOT call set_iteration_status('running') as a substitute for running the pipeline.

CRITICAL: After calling a tool, do NOT repeat or summarize the tool results in text — the UI renders them automatically as visual cards. Only add a short follow-up question if needed (e.g. "Want to launch the pipeline now?"). Never output tables, lists, or JSON of the tool data.`

async function resolveLogo(domain: string): Promise<string | null> {
  try {
    const url = `https://logo.clearbit.com/${domain}`
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    const ct = res.headers.get('content-type') ?? ''
    if (res.ok && ct.startsWith('image/')) {
      const buf = await res.arrayBuffer()
      if (buf.byteLength > 2048) return url
    }
  } catch { /* fall through */ }
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
}

async function extractIcp(context: string) {
  const sdk = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const msg = await sdk.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: 'Extract B2B ICP. Return only valid JSON, no markdown.',
    messages: [{ role: 'user', content: `Extract ICP from:\n---\n${context}\n---\nReturn: {"industries":[],"titles":[],"geo":[],"pain_points":[]}` }],
  })
  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const raw = text.replace(/^```(?:json)?\n?/m, '').replace(/```\s*$/m, '').trim()
  return JSON.parse(raw)
}

async function scrapeUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GTMBot/1.0)' },
    signal: AbortSignal.timeout(10_000),
  })
  return (await res.text())
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 8000)
}

type RouteContext =
  | { kind: 'home' }
  | { kind: 'client'; client_id: string }
  | { kind: 'project'; client_id: string; project_id: string; tab?: string; iter?: string }
  | { kind: 'team' }
  | { kind: 'chat' }
  | { kind: 'other'; path: string }

async function describeContext(ctx: RouteContext, supabase: Awaited<ReturnType<typeof createSupabase>>): Promise<string | null> {
  if (ctx.kind === 'client') {
    const { data: c } = await supabase.from('clients').select('id, name').eq('id', ctx.client_id).single()
    if (c) return `User is on the client page for "${c.name}" (client_id=${c.id}). Default to using this client_id when they say "this client".`
  }
  if (ctx.kind === 'project') {
    const { data: p } = await supabase.from('projects').select('id, name, client_id, clients(name)').eq('id', ctx.project_id).single()
    const clientName = (p?.clients as unknown as { name?: string } | null)?.name ?? null
    if (p) {
      let s = `User is on the project page for "${p.name}" (project_id=${p.id}, client_id=${p.client_id}${clientName ? `, client_name="${clientName}"` : ''}).`
      if (ctx.tab) s += ` Active tab: ${ctx.tab}.`
      if (ctx.iter) s += ` Active iteration_id=${ctx.iter}.`
      s += ' Default to using these IDs when they refer to "this project" / "this iteration".'
      return s
    }
  }
  if (ctx.kind === 'team') return 'User is on the Team management page.'
  return null
}

export async function POST(req: Request) {
  const body = await req.json()
  const { messages, context } = body as { messages: UIMessage[]; context?: RouteContext }
  const supabase = await createSupabase()
  const modelMessages = await convertToModelMessages(messages)
  const contextDescription = context ? await describeContext(context, supabase) : null
  const systemWithContext = contextDescription ? `${SYSTEM}\n\nCURRENT CONTEXT:\n${contextDescription}` : SYSTEM

  // Build absolute origin so we can call the existing generate-sequence route from inside a tool
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const host = h.get('host') ?? 'localhost:3000'
  const origin = `${proto}://${host}`

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: systemWithContext,
    messages: modelMessages,
    stopWhen: stepCountIs(8),
    providerOptions: {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 8000 },
      },
    },
    tools: {
      // ─── CLIENTS ─────────────────────────────────────────────────────────────
      list_clients: tool({
        description: 'List all clients in the workspace',
        inputSchema: z.object({}),
        execute: async () => {
          const { data } = await supabase.from('clients').select('id, name, website_url, logo_url').order('created_at', { ascending: false })
          return { clients: data ?? [] }
        },
      }),

      find_client: tool({
        description: 'Find a client by name (fuzzy match)',
        inputSchema: z.object({ name: z.string() }),
        execute: async ({ name }) => {
          const { data } = await supabase.from('clients').select('id, name, website_url, logo_url').ilike('name', `%${name}%`).limit(5)
          return { clients: data ?? [] }
        },
      }),

      create_client: tool({
        description: 'Create a new client/company',
        inputSchema: z.object({
          name: z.string().describe('Company name'),
          website_url: z.string().optional().describe('Company website URL'),
        }),
        execute: async ({ name, website_url }) => {
          const { data, error } = await supabase.from('clients').insert({ name, website_url: website_url ?? null }).select('id, name, website_url').single()
          if (error) return { error: error.message }
          let logo_url: string | null = null
          if (website_url) {
            try {
              const domain = new URL(website_url).hostname.replace(/^www\./, '')
              logo_url = await resolveLogo(domain)
              if (logo_url) await supabase.from('clients').update({ logo_url }).eq('id', data.id)
            } catch { /* non-critical */ }
          }
          bumpCache()
          return { client: { ...data, logo_url } }
        },
      }),

      delete_client: tool({
        description: 'Delete a client and all their projects by ID',
        inputSchema: z.object({ client_id: z.string() }),
        execute: async ({ client_id }) => {
          const { error } = await supabase.from('clients').delete().eq('id', client_id)
          if (error) return { error: error.message }
          bumpCache()
          return { success: true }
        },
      }),

      // ─── CASE STUDIES (social proof) ─────────────────────────────────────────
      list_case_studies: tool({
        description: 'List a client\'s case studies / social proofs (used as references in generated sequences)',
        inputSchema: z.object({ client_id: z.string() }),
        execute: async ({ client_id }) => {
          const { data } = await supabase.from('clients').select('id, name, case_studies').eq('id', client_id).single()
          if (!data) return { error: 'Client not found' }
          return {
            client_id: data.id,
            client_name: data.name,
            case_studies: (data.case_studies as unknown[]) ?? [],
          }
        },
      }),

      add_case_study: tool({
        description: 'Add a new case study to a client',
        inputSchema: z.object({
          client_id: z.string(),
          company: z.string().describe('Company name from the case study'),
          result: z.string().describe('Key result / outcome (one line)'),
          industry: z.string().optional(),
          description: z.string().optional().describe('Longer description / context'),
        }),
        execute: async ({ client_id, company, result, industry, description }) => {
          const { data: cur } = await supabase.from('clients').select('case_studies').eq('id', client_id).single()
          const list = (Array.isArray(cur?.case_studies) ? cur!.case_studies : []) as Array<Record<string, unknown>>
          const newEntry = {
            company, result,
            ...(industry ? { industry } : {}),
            ...(description ? { description } : {}),
            manual: true,
          }
          const { error } = await supabase.from('clients').update({ case_studies: [...list, newEntry] }).eq('id', client_id)
          if (error) return { error: error.message }
          bumpCache()
          return { case_study: newEntry }
        },
      }),

      remove_case_study: tool({
        description: 'Remove a case study from a client by company name (or case study index)',
        inputSchema: z.object({
          client_id: z.string(),
          company: z.string().optional().describe('Company name to remove'),
          index: z.number().int().optional().describe('Zero-based index to remove'),
        }),
        execute: async ({ client_id, company, index }) => {
          const { data: cur } = await supabase.from('clients').select('case_studies').eq('id', client_id).single()
          const list = (Array.isArray(cur?.case_studies) ? cur!.case_studies : []) as Array<Record<string, unknown>>
          const next = list.filter((cs, i) => {
            if (typeof index === 'number') return i !== index
            if (company) return (cs.company as string)?.toLowerCase() !== company.toLowerCase()
            return true
          })
          if (next.length === list.length) return { error: 'No matching case study' }
          const { error } = await supabase.from('clients').update({ case_studies: next }).eq('id', client_id)
          if (error) return { error: error.message }
          bumpCache()
          return { success: true, removed: list.length - next.length }
        },
      }),

      // ─── PROJECTS ────────────────────────────────────────────────────────────
      get_client_projects: tool({
        description: 'List projects for a specific client',
        inputSchema: z.object({ client_id: z.string() }),
        execute: async ({ client_id }) => {
          const { data } = await supabase.from('projects').select('id, name, offer_text, icp_json, created_at, client_id, share_token').eq('client_id', client_id).order('created_at', { ascending: false })
          return { projects: data ?? [] }
        },
      }),

      list_all_projects: tool({
        description: 'List all projects across every client (with client name)',
        inputSchema: z.object({}),
        execute: async () => {
          const { data } = await supabase
            .from('projects')
            .select('id, name, offer_text, icp_json, created_at, client_id, share_token, clients(name, logo_url)')
            .order('created_at', { ascending: false })
            .limit(50)
          return {
            projects: (data ?? []).map(p => {
              const client = p.clients as unknown as { name: string; logo_url: string | null } | null
              return { ...p, client_name: client?.name ?? null, client_logo_url: client?.logo_url ?? null }
            }),
          }
        },
      }),

      create_project: tool({
        description: 'Create a project for a client. Extracts ICP automatically from website or text.',
        inputSchema: z.object({
          client_id: z.string(),
          name: z.string(),
          website_url: z.string().optional(),
          offer_text: z.string().optional(),
        }),
        execute: async ({ client_id, name, website_url, offer_text }) => {
          let context = ''
          if (website_url) {
            try { context += `Website (${website_url}):\n${await scrapeUrl(website_url)}\n\n` }
            catch { context += `(Could not fetch ${website_url})\n\n` }
          }
          if (offer_text) context += `Description:\n${offer_text}`
          if (!context.trim()) return { error: 'Provide website_url or offer_text' }
          let icp_json
          try { icp_json = await extractIcp(context) }
          catch { return { error: 'Failed to extract ICP' } }
          const { data, error } = await supabase.from('projects').insert({ client_id, name, offer_text: offer_text ?? website_url ?? null, icp_json }).select('id, name, icp_json, share_token, client_id').single()
          if (error) return { error: error.message }
          bumpCache()
          return { project: data }
        },
      }),

      delete_project: tool({
        description: 'Delete a project by ID',
        inputSchema: z.object({ project_id: z.string() }),
        execute: async ({ project_id }) => {
          const { error } = await supabase.from('projects').delete().eq('id', project_id)
          if (error) return { error: error.message }
          bumpCache()
          return { success: true }
        },
      }),

      // ─── ITERATIONS ──────────────────────────────────────────────────────────
      list_iterations: tool({
        description: 'List iterations for a project (with channel, status, stats)',
        inputSchema: z.object({ project_id: z.string() }),
        execute: async ({ project_id }) => {
          const { data } = await supabase
            .from('iterations')
            .select('id, project_id, name, channel, status, started_at, finished_at, stats, created_at')
            .eq('project_id', project_id)
            .order('created_at', { ascending: true })
          return { iterations: data ?? [] }
        },
      }),

      create_iteration: tool({
        description: 'Create a new iteration in a project, choosing the channel',
        inputSchema: z.object({
          project_id: z.string(),
          channel: z.enum(['linkedin', 'email']).describe('Iteration channel — sequences inside will all be on this channel'),
        }),
        execute: async ({ project_id, channel }) => {
          const { count } = await supabase.from('iterations').select('id', { count: 'exact', head: true }).eq('project_id', project_id)
          const name = `Iteration #${(count ?? 0) + 1}`
          const { data, error } = await supabase.from('iterations').insert({ project_id, name, channel }).select('*').single()
          if (error) return { error: error.message }
          bumpCache()
          return { iteration: data }
        },
      }),

      set_iteration_status: tool({
        description: 'Change an iteration status. Use "running" when the campaign launches, "finished" when wrapped, "discarded" if abandoned.',
        inputSchema: z.object({
          iteration_id: z.string(),
          status: z.enum(['draft', 'running', 'finished', 'discarded']),
        }),
        execute: async ({ iteration_id, status }) => {
          const { data: cur } = await supabase.from('iterations').select('started_at, finished_at').eq('id', iteration_id).single()
          const updates: Record<string, unknown> = { status }
          const now = new Date().toISOString()
          if (status === 'running' && !cur?.started_at) updates.started_at = now
          if (status === 'finished' && !cur?.finished_at) updates.finished_at = now
          const { error } = await supabase.from('iterations').update(updates).eq('id', iteration_id)
          if (error) return { error: error.message }
          bumpCache()
          return { success: true, status }
        },
      }),

      // ─── SEQUENCES ───────────────────────────────────────────────────────────
      list_sequences: tool({
        description: 'List sequence versions in an iteration',
        inputSchema: z.object({ iteration_id: z.string() }),
        execute: async ({ iteration_id }) => {
          const { data } = await supabase
            .from('sequences')
            .select('id, name, channel, status, share_token, steps, created_at, project_id')
            .eq('iteration_id', iteration_id)
            .order('created_at', { ascending: true })
          return { sequences: data ?? [] }
        },
      }),

      generate_sequence: tool({
        description: 'AI-generate an outreach sequence for an iteration. Pulls offer/ICP/case-studies from the project automatically.',
        inputSchema: z.object({
          project_id: z.string(),
          iteration_id: z.string(),
          name: z.string().describe('Sequence version name'),
          channel: z.enum(['linkedin', 'email']),
          steps_count: z.number().int().min(2).max(7).default(4),
          tone: z.enum(['professional', 'casual', 'direct']).default('professional'),
          language: z.string().default('English'),
          include_connection_note: z.boolean().default(true),
          user_notes: z.string().optional().describe('Free-form instructions for Claude — angles, things to avoid, custom variable hints'),
        }),
        execute: async ({ project_id, iteration_id, name, channel, steps_count, tone, language, include_connection_note, user_notes }) => {
          // Pull project case studies and custom columns to feed into the existing API route
          const [{ data: project }, { data: customRows }] = await Promise.all([
            supabase.from('projects').select('clients(case_studies)').eq('id', project_id).single(),
            supabase.from('contacts').select('custom_data').eq('iteration_id', iteration_id).not('custom_data', 'is', null),
          ])
          const caseStudies = (project?.clients as { case_studies?: unknown[] } | null)?.case_studies ?? []
          const customSet = new Set<string>()
          for (const r of customRows ?? []) {
            const obj = r.custom_data as Record<string, unknown> | null
            if (obj) Object.keys(obj).forEach(k => customSet.add(k))
          }

          const cookieHeader = h.get('cookie') ?? ''
          const res = await fetch(`${origin}/api/projects/${project_id}/generate-sequence`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
            body: JSON.stringify({
              config: { channel, steps_count, tone, include_connection_note, language, user_notes: user_notes ?? '' },
              caseStudies,
              customColumns: Array.from(customSet),
            }),
          })
          const data = await res.json()
          if (!res.ok || !data.steps) return { error: data.error ?? 'Generation failed' }

          const { data: saved, error } = await supabase
            .from('sequences')
            .insert({
              project_id,
              iteration_id,
              name,
              channel,
              config: { channel, steps_count, tone, include_connection_note, language, user_notes },
              steps: data.steps,
              used_case_studies: caseStudies,
            })
            .select('id, name, channel, share_token, steps, status')
            .single()
          if (error) return { error: error.message }
          bumpCache()
          return { sequence: saved }
        },
      }),

      approve_sequence: tool({
        description: 'Approve a sequence version. Only one version per channel per project can be approved at a time — others on the same channel are demoted to draft.',
        inputSchema: z.object({ sequence_id: z.string() }),
        execute: async ({ sequence_id }) => {
          const { data: seq } = await supabase.from('sequences').select('project_id, channel').eq('id', sequence_id).single()
          if (seq?.project_id && seq?.channel) {
            await supabase.from('sequences').update({ status: 'draft' }).eq('project_id', seq.project_id).eq('channel', seq.channel).neq('id', sequence_id)
          }
          const { error } = await supabase.from('sequences').update({ status: 'approved' }).eq('id', sequence_id)
          if (error) return { error: error.message }
          bumpCache()
          return { success: true }
        },
      }),

      // ─── CONTACTS ────────────────────────────────────────────────────────────
      list_contacts: tool({
        description: 'List contacts in an iteration. Returns up to 25 with a total count.',
        inputSchema: z.object({
          iteration_id: z.string(),
          filter: z.enum(['all', 'with_email', 'with_linkedin']).default('all'),
        }),
        execute: async ({ iteration_id, filter }) => {
          let q = supabase
            .from('contacts')
            .select('id, first_name, last_name, title, email, linkedin_url, custom_data, companies(name, domain, logo_url)', { count: 'exact' })
            .eq('iteration_id', iteration_id)
            .limit(25)
          if (filter === 'with_email') q = q.not('email', 'is', null)
          if (filter === 'with_linkedin') q = q.not('linkedin_url', 'like', 'apollo-%')
          const { data, count } = await q
          return {
            contacts: (data ?? []).map(c => {
              const co = c.companies as unknown as { name: string; domain: string; logo_url: string | null } | null
              return {
                id: c.id, first_name: c.first_name, last_name: c.last_name, title: c.title, email: c.email, linkedin_url: c.linkedin_url,
                company_name: co?.name ?? null, company_domain: co?.domain ?? null, company_logo_url: co?.logo_url ?? null,
                custom_data: c.custom_data,
              }
            }),
            total: count ?? 0,
          }
        },
      }),

      get_custom_columns: tool({
        description: 'List custom column names that exist in the contacts of an iteration (for use as message placeholders)',
        inputSchema: z.object({ iteration_id: z.string() }),
        execute: async ({ iteration_id }) => {
          const { data } = await supabase.from('contacts').select('custom_data').eq('iteration_id', iteration_id).not('custom_data', 'is', null)
          const keys = new Set<string>()
          for (const r of data ?? []) {
            const obj = r.custom_data as Record<string, unknown> | null
            if (obj) Object.keys(obj).forEach(k => keys.add(k))
          }
          return { columns: Array.from(keys).sort() }
        },
      }),

      // ─── STATS ───────────────────────────────────────────────────────────────
      get_client_stats: tool({
        description: 'Aggregated outreach stats for a client across all projects and iterations (LinkedIn + Email funnels, top sequences, totals)',
        inputSchema: z.object({
          client_id: z.string(),
          from: z.string().optional().describe('Optional ISO date YYYY-MM-DD lower bound on iteration.started_at'),
          to: z.string().optional().describe('Optional ISO date YYYY-MM-DD upper bound on iteration.started_at'),
        }),
        execute: async ({ client_id, from, to }) => {
          const { getClientStats } = await import('@/app/actions/iterations')
          const stats = await getClientStats(client_id, from ?? null, to ?? null)
          return { stats }
        },
      }),

      // ─── SHARE LINKS ─────────────────────────────────────────────────────────
      get_share_link: tool({
        description: 'Get a shareable URL. kind=client returns the outreach report; kind=project returns the project review (sequences + contacts); kind=sequence returns a single sequence with version history.',
        inputSchema: z.object({
          kind: z.enum(['client', 'project', 'sequence']),
          id: z.string().describe('Client / project / sequence ID'),
        }),
        execute: async ({ kind, id }) => {
          if (kind === 'client') {
            const { data } = await supabase.from('clients').select('name, share_token').eq('id', id).single()
            if (!data?.share_token) return { error: 'Client not found' }
            return { kind, label: data.name, url: `${origin}/share/c/${data.share_token}` }
          }
          if (kind === 'project') {
            const { data } = await supabase.from('projects').select('name, share_token').eq('id', id).single()
            if (!data?.share_token) return { error: 'Project not found' }
            return { kind, label: data.name, url: `${origin}/share/p/${data.share_token}` }
          }
          const { data } = await supabase.from('sequences').select('name, share_token').eq('id', id).single()
          if (!data?.share_token) return { error: 'Sequence not found' }
          return { kind, label: data.name, url: `${origin}/share/${data.share_token}` }
        },
      }),

      // ─── ICP / PIPELINE TUNING ───────────────────────────────────────────────
      get_project_icp: tool({
        description: 'Read the ICP (icp_json) and Apollo keyword overrides (run_config_json.keywords) for a project. Use before suggesting ICP refinements.',
        inputSchema: z.object({ project_id: z.string() }),
        execute: async ({ project_id }) => {
          const { data } = await supabase.from('projects').select('id, name, offer_text, icp_json, run_config_json').eq('id', project_id).single()
          if (!data) return { error: 'Project not found' }
          return {
            project_id: data.id,
            name: data.name,
            offer_text: data.offer_text,
            icp: data.icp_json,
            keyword_overrides: (data.run_config_json as { keywords?: string[] } | null)?.keywords ?? [],
          }
        },
      }),

      update_project_icp: tool({
        description: 'Replace the project ICP (icp_json) with a new object. Pass the FULL new ICP, not a patch. Use after reading the current ICP and deciding what to change.',
        inputSchema: z.object({
          project_id: z.string(),
          icp: z.record(z.string(), z.unknown()).describe('Full new icp_json — typically a merged version of the current ICP plus your refinements'),
        }),
        execute: async ({ project_id, icp }) => {
          const { error } = await supabase.from('projects').update({ icp_json: icp }).eq('id', project_id)
          if (error) return { error: error.message }
          bumpCache()
          return { success: true, icp }
        },
      }),

get_classify_summary: tool({
        description: 'Aggregated classification summary for a project: counts per status, segment frequencies, sample rejection reasons. Use to spot patterns in why companies got rejected.',
        inputSchema: z.object({ project_id: z.string() }),
        execute: async ({ project_id }) => {
          const { data: rows } = await supabase
            .from('project_companies')
            .select('qualification_status, segment, reasoning, source, companies(domain, name)')
            .eq('project_id', project_id)
          const list = (rows ?? []) as unknown as Array<{
            qualification_status: string | null
            segment: string | null
            reasoning: string | null
            source: string
            companies: { domain: string; name: string | null } | null
          }>
          const counts = { qualified: 0, rejected: 0, unknown: 0 }
          const segments: Record<string, number> = {}
          const rejection_samples: Array<{ domain: string; name: string | null; segment: string | null; reasoning: string | null }> = []
          for (const r of list) {
            const s = r.qualification_status ?? 'unknown'
            counts[s as keyof typeof counts] = (counts[s as keyof typeof counts] ?? 0) + 1
            if (r.segment) segments[r.segment] = (segments[r.segment] ?? 0) + 1
            if (s === 'rejected' && rejection_samples.length < 12 && r.companies) {
              rejection_samples.push({ domain: r.companies.domain, name: r.companies.name, segment: r.segment, reasoning: r.reasoning })
            }
          }
          return { total: list.length, counts, segments, rejection_samples }
        },
      }),

      list_classified_companies: tool({
        description: 'List companies in a project filtered by qualification status. Returns up to 30 with segment + reasoning. Use to inspect specific patterns.',
        inputSchema: z.object({
          project_id: z.string(),
          status: z.enum(['qualified', 'rejected', 'unknown', 'all']).default('all'),
          source: z.enum(['pipeline', 'csv', 'manual', 'all']).default('all'),
        }),
        execute: async ({ project_id, status, source }) => {
          let q = supabase
            .from('project_companies')
            .select('id, qualification_status, is_target, confidence, segment, reasoning, source, companies(domain, name, logo_url)')
            .eq('project_id', project_id)
            .limit(30)
          if (status !== 'all') q = q.eq('qualification_status', status)
          if (source !== 'all') q = q.eq('source', source)
          const { data } = await q
          const list = (data ?? []) as unknown as Array<{
            id: string; qualification_status: string; is_target: boolean; confidence: number | null;
            segment: string | null; reasoning: string | null; source: string;
            companies: { domain: string; name: string | null; logo_url: string | null } | null
          }>
          return {
            companies: list.map(r => ({
              id: r.id, domain: r.companies?.domain, name: r.companies?.name,
              status: r.qualification_status, confidence: r.confidence, segment: r.segment, reasoning: r.reasoning, source: r.source,
            })),
          }
        },
      }),

      reclassify_project_companies: tool({
        description: 'Re-run Claude classification on selected project_companies. Use after updating the ICP to validate the new criteria. Pass project_company IDs (from list_classified_companies) — not company IDs.',
        inputSchema: z.object({
          project_id: z.string(),
          project_company_ids: z.array(z.string()).describe('IDs from project_companies (the join table), not companies.id'),
        }),
        execute: async ({ project_id, project_company_ids }) => {
          const { classifyCompanies } = await import('@/app/actions/companies')
          const result = await classifyCompanies(project_id, project_company_ids)
          bumpCache()
          return result
        },
      }),

      list_pipeline_runs: tool({
        description: 'List recent companies-pipeline runs for a project with derived counts (found, qualified) and timing. Use to pick which run to inspect or compare runs.',
        inputSchema: z.object({ project_id: z.string(), limit: z.number().min(1).max(20).default(10) }),
        execute: async ({ project_id, limit }) => {
          const { data } = await supabase
            .from('pipeline_runs')
            .select('id, status, steps, created_at, updated_at')
            .eq('project_id', project_id)
            .order('created_at', { ascending: false })
            .limit(limit)
          const runs = ((data ?? []) as Array<{ id: string; status: string; steps: Array<{ name: string; artifact: unknown }>; created_at: string; updated_at: string }>).map(r => {
            const apollo = r.steps.find(s => s.name === 'apollo_search')?.artifact as { companies_found?: number; page?: number } | undefined
            const classify = r.steps.find(s => s.name === 'classify')?.artifact as { targets?: number; pre_filtered?: number; total?: number } | undefined
            const filters = r.steps.find(s => s.name === 'generate_filters')?.artifact as { keywords?: string[] } | undefined
            return {
              run_id: r.id,
              status: r.status,
              created_at: r.created_at,
              updated_at: r.updated_at,
              found: apollo?.companies_found ?? 0,
              qualified: classify?.targets ?? 0,
              auto_rejected: classify?.pre_filtered ?? 0,
              classified_total: classify?.total ?? 0,
              keyword_count: filters?.keywords?.length ?? 0,
              apollo_page: apollo?.page ?? 1,
              steps_completed: r.steps.map(s => s.name),
            }
          })
          return { runs }
        },
      }),

      get_run_details: tool({
        description: 'Get the full artifact bundle of one pipeline run: keywords used, locations, employee ranges, Apollo keyword hits, classification verdicts (with reasoning, segment, confidence). Use to spot why specific companies were rejected/qualified in this particular run before suggesting ICP refinements.',
        inputSchema: z.object({ run_id: z.string() }),
        execute: async ({ run_id }) => {
          const { data } = await supabase
            .from('pipeline_runs')
            .select('id, status, steps, created_at, updated_at')
            .eq('id', run_id)
            .single()
          if (!data) return { error: 'Run not found' }
          const r = data as { id: string; status: string; steps: Array<{ name: string; artifact: unknown }>; created_at: string; updated_at: string }
          const filters = r.steps.find(s => s.name === 'generate_filters')?.artifact as Record<string, unknown> | undefined
          const apollo = r.steps.find(s => s.name === 'apollo_search')?.artifact as Record<string, unknown> | undefined
          const classify = r.steps.find(s => s.name === 'classify')?.artifact as { results?: Array<{ domain: string; name: string; is_target: boolean; confidence: number; segment: string; reasoning: string }>; targets?: number; pre_filtered?: number; total?: number } | undefined

          // Trim classify results to keep tool response compact: take samples per status
          const allResults = classify?.results ?? []
          const qualified = allResults.filter(r => r.is_target).slice(0, 12)
          const rejected = allResults.filter(r => !r.is_target && r.segment !== 'AUTO_REJECTED').slice(0, 12)
          return {
            run_id: r.id,
            status: r.status,
            created_at: r.created_at,
            keywords_used: (filters?.keywords as string[] | undefined)?.slice(0, 30) ?? [],
            locations: (filters?.locations as string[] | undefined) ?? [],
            employee_ranges: (filters?.employee_ranges as string[] | undefined) ?? [],
            apollo_keyword_hits: apollo?.keyword_hits ?? {},
            apollo_companies_found: apollo?.companies_found ?? 0,
            apollo_page: (apollo?.page as number | undefined) ?? 1,
            classify_summary: {
              total: classify?.total ?? 0,
              targets: classify?.targets ?? 0,
              pre_filtered_count: classify?.pre_filtered ?? 0,
            },
            qualified_samples: qualified.map(q => ({ domain: q.domain, name: q.name, segment: q.segment, confidence: q.confidence, reasoning: q.reasoning })),
            rejected_samples: rejected.map(q => ({ domain: q.domain, name: q.name, segment: q.segment, confidence: q.confidence, reasoning: q.reasoning })),
          }
        },
      }),

      // ─── TEAM ────────────────────────────────────────────────────────────────
      list_team_members: tool({
        description: 'List team members who can access this workspace',
        inputSchema: z.object({}),
        execute: async () => {
          const { data } = await supabase.from('team_members').select('*').order('created_at', { ascending: true })
          return { members: data ?? [] }
        },
      }),

      invite_team_member: tool({
        description: 'Invite a teammate by email — they can sign in and see all clients, projects, and chats',
        inputSchema: z.object({ email: z.string() }),
        execute: async ({ email }) => {
          const trimmed = email.trim().toLowerCase()
          if (!trimmed.includes('@')) return { error: 'Invalid email' }
          const { data: { user } } = await supabase.auth.getUser()
          const { error } = await supabase.from('team_members').insert({ email: trimmed, invited_by_email: user?.email ?? null })
          if (error) {
            if (error.code === '23505') return { error: 'Already invited' }
            return { error: error.message }
          }
          bumpCache()
          return { success: true, email: trimmed }
        },
      }),
    },
  })

  return result.toUIMessageStreamResponse()
}

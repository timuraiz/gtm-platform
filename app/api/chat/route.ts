import { anthropic } from '@ai-sdk/anthropic'
import { streamText, tool, stepCountIs, convertToModelMessages } from 'ai'
import { z } from 'zod'
import { createClient as createSupabase } from '@/utils/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM = `You are a GTM (Go-to-Market) assistant inside a B2B outbound platform.
Help users manage clients and projects. Use tools immediately when the intent is clear.
Always respond in the same language the user writes in.

CRITICAL: After calling a tool, do NOT repeat or summarize the tool results in text — the UI renders them automatically as visual cards. Only add a short follow-up question if needed (e.g. "Want to create a project?"). Never output tables, lists, or JSON of the tool data.`

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

export async function POST(req: Request) {
  const { messages } = await req.json()
  const supabase = await createSupabase()
  const modelMessages = await convertToModelMessages(messages)

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: SYSTEM,
    messages: modelMessages,
    stopWhen: stepCountIs(5),
    providerOptions: {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 8000 },
      },
    },
    tools: {
      list_clients: tool({
        description: 'List all clients in the workspace',
        inputSchema: z.object({}),
        execute: async () => {
          const { data } = await supabase.from('clients').select('id, name, website_url, logo_url').order('created_at', { ascending: false })
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
          return { client: { ...data, logo_url } }
        },
      }),

      find_client: tool({
        description: 'Find a client by name',
        inputSchema: z.object({ name: z.string() }),
        execute: async ({ name }) => {
          const { data } = await supabase.from('clients').select('id, name, website_url, logo_url').ilike('name', `%${name}%`).limit(5)
          return { clients: data ?? [] }
        },
      }),

      create_project: tool({
        description: 'Create a project for a client. Extracts ICP automatically.',
        inputSchema: z.object({
          client_id: z.string().describe('Client ID'),
          name: z.string().describe('Project name'),
          website_url: z.string().optional().describe('Offer page URL to scrape'),
          offer_text: z.string().optional().describe('Offer description text'),
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
          const { data, error } = await supabase.from('projects').insert({ client_id, name, offer_text: offer_text ?? website_url ?? null, icp_json }).select('id, name, icp_json').single()
          if (error) return { error: error.message }
          return { project: data }
        },
      }),

      get_client_projects: tool({
        description: 'Get all projects for a client',
        inputSchema: z.object({ client_id: z.string() }),
        execute: async ({ client_id }) => {
          const { data } = await supabase.from('projects').select('id, name, offer_text, icp_json, created_at').eq('client_id', client_id).order('created_at', { ascending: false })
          return { projects: data ?? [] }
        },
      }),

      delete_project: tool({
        description: 'Delete a project by ID',
        inputSchema: z.object({
          project_id: z.string().describe('Project ID to delete'),
        }),
        execute: async ({ project_id }) => {
          const { error } = await supabase.from('projects').delete().eq('id', project_id)
          if (error) return { error: error.message }
          return { success: true }
        },
      }),

      delete_client: tool({
        description: 'Delete a client and all their projects by ID',
        inputSchema: z.object({
          client_id: z.string().describe('Client ID to delete'),
        }),
        execute: async ({ client_id }) => {
          const { error } = await supabase.from('clients').delete().eq('id', client_id)
          if (error) return { error: error.message }
          return { success: true }
        },
      }),
    },
  })

  return result.toUIMessageStreamResponse()
}

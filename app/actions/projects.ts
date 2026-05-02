'use server'

import Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'
import { createClient as createSupabase } from '@/utils/supabase/server'

export type IcpJson = {
  industries: string[]
  titles: string[]
  geo: string[]
  pain_points: string[]
}

export type Project = {
  id: string
  client_id: string
  name: string
  offer_text: string | null
  icp_json: IcpJson | null
  created_at: string
}

async function scrapeUrl(url: string): Promise<string> {
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
    .slice(0, 8000)
}

export async function updateProjectIcp(projectId: string, icp: Record<string, unknown>): Promise<void> {
  const supabase = await createSupabase()
  const { error } = await supabase.from('projects').update({ icp_json: icp }).eq('id', projectId)
  if (error) throw new Error(error.message)
  revalidatePath('/', 'layout')
}

export async function updateProjectOffer(projectId: string, offerText: string): Promise<void> {
  const supabase = await createSupabase()
  const { error } = await supabase.from('projects').update({ offer_text: offerText }).eq('id', projectId)
  if (error) throw new Error(error.message)
  revalidatePath('/', 'layout')
}

export async function getProjects(clientId: string): Promise<Project[]> {
  const supabase = await createSupabase()
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data as Project[]
}

export async function createProject(clientId: string, formData: FormData): Promise<void> {
  const name = (formData.get('name') as string).trim()
  const websiteUrl = (formData.get('website_url') as string | null)?.trim()
  const offerText = (formData.get('offer_text') as string | null)?.trim()

  if (!name) throw new Error('Project name is required')
  if (!websiteUrl && !offerText) throw new Error('Provide a website URL or offer description')

  let context = ''

  if (websiteUrl) {
    try {
      const scraped = await scrapeUrl(websiteUrl)
      context += `Website (${websiteUrl}):\n${scraped}\n\n`
    } catch {
      context += `(Could not fetch ${websiteUrl})\n\n`
    }
  }

  if (offerText) {
    context += `Offer description:\n${offerText}`
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: 'You are a B2B GTM expert. Extract structured ICP data. Return only valid JSON, no markdown.',
    messages: [
      {
        role: 'user',
        content: `Extract ICP from:

---
${context}
---

Return JSON:
{
  "industries": ["..."],
  "titles": ["..."],
  "geo": ["..."],
  "pain_points": ["..."]
}`,
      },
    ],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected Claude response')

  let icp_json: IcpJson
  try {
    const raw = content.text.replace(/^```(?:json)?\n?/m, '').replace(/```\s*$/m, '').trim()
    icp_json = JSON.parse(raw)
  } catch {
    throw new Error(`Failed to parse ICP: ${content.text.slice(0, 200)}`)
  }

  const supabase = await createSupabase()
  const { error } = await supabase.from('projects').insert({
    client_id: clientId,
    name,
    offer_text: offerText || websiteUrl || null,
    icp_json,
  })
  if (error) throw new Error(error.message)

  revalidatePath(`/clients/${clientId}`)
}

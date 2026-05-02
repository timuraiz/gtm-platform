'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabase } from '@/utils/supabase/server'

export type CaseStudy = {
  company: string
  industry?: string
  result: string
  description?: string
  manual?: boolean
}

export type Client = {
  id: string
  name: string
  website_url: string | null
  logo_url: string | null
  case_studies: CaseStudy[]
  case_studies_scraped_at: string | null
  created_at: string
  projects?: { id: string }[]
}

export async function getClients(): Promise<Client[]> {
  const supabase = await createSupabase()
  const { data, error } = await supabase
    .from('clients')
    .select('*, projects(id)')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data as Client[]
}

export async function getClient(id: string): Promise<Client> {
  const supabase = await createSupabase()
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw new Error(error.message)
  return data as Client
}

async function resolveLogo(domain: string): Promise<string | null> {
  // Clearbit first — but verify it's a real logo (not their tiny placeholder)
  try {
    const clearbitUrl = `https://logo.clearbit.com/${domain}`
    const res = await fetch(clearbitUrl, { signal: AbortSignal.timeout(6_000) })
    const contentType = res.headers.get('content-type') ?? ''
    if (res.ok && contentType.startsWith('image/')) {
      const buf = await res.arrayBuffer()
      if (buf.byteLength > 2048) return clearbitUrl  // real logo
    }
  } catch { /* fall through */ }

  // Google favicon — always returns something real
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
}

export async function createClient(formData: FormData): Promise<void> {
  const name = (formData.get('name') as string).trim()
  const website_url = (formData.get('website_url') as string).trim() || null

  if (!name) throw new Error('Name is required')

  const supabase = await createSupabase()

  // insert first to get the id
  const { data, error } = await supabase
    .from('clients')
    .insert({ name, website_url })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  if (website_url) {
    try {
      const domain = new URL(website_url).hostname.replace(/^www\./, '')
      const logo_url = await resolveLogo(domain)
      if (logo_url) {
        await supabase.from('clients').update({ logo_url }).eq('id', data.id)
      }
    } catch {
      // logo is non-critical
    }
  }

  revalidatePath('/')
}

export async function saveCaseStudies(clientId: string, caseStudies: CaseStudy[]): Promise<void> {
  const supabase = await createSupabase()
  await supabase.from('clients').update({ case_studies: caseStudies }).eq('id', clientId)
  revalidatePath(`/clients/${clientId}`)
}

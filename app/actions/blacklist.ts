'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabase } from '@/utils/supabase/server'
import {
  type BlacklistMatchSets,
  normalizeBlacklistEmail,
  normalizeBlacklistLinkedin,
} from '@/lib/blacklist'

export type BlacklistEntry = {
  id: string
  client_id: string
  email: string | null
  linkedin_url: string | null
  reason: string | null
  created_at: string
}

export type BlacklistInput = {
  email?: string | null
  linkedin_url?: string | null
  reason?: string | null
}

export async function getBlacklist(clientId: string): Promise<BlacklistEntry[]> {
  const supabase = await createSupabase()
  const { data, error } = await supabase
    .from('contact_blacklist')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as BlacklistEntry[]
}

export async function addBlacklistEntries(
  clientId: string,
  entries: BlacklistInput[],
): Promise<{ added: number; skipped: number }> {
  if (entries.length === 0) return { added: 0, skipped: 0 }
  const supabase = await createSupabase()

  const rows = entries
    .map((e) => ({
      client_id: clientId,
      email: normalizeBlacklistEmail(e.email),
      linkedin_url: normalizeBlacklistLinkedin(e.linkedin_url),
      reason: e.reason?.trim() || null,
    }))
    .filter((r) => r.email || r.linkedin_url)

  if (rows.length === 0) return { added: 0, skipped: entries.length }

  let added = 0
  const emailOnly = rows.filter((r) => r.email && !r.linkedin_url)
  const linkedinOnly = rows.filter((r) => r.linkedin_url && !r.email)
  const both = rows.filter((r) => r.email && r.linkedin_url)

  // Rows with both fields don't have a single conflict target, so insert
  // individually and tolerate dup-key errors (already-blacklisted match).
  for (const r of both) {
    const { error } = await supabase.from('contact_blacklist').insert(r)
    if (!error) added++
  }
  if (emailOnly.length > 0) {
    const { count, error } = await supabase
      .from('contact_blacklist')
      .upsert(emailOnly, { onConflict: 'client_id,email', ignoreDuplicates: true, count: 'exact' })
    if (error) throw new Error(error.message)
    added += count ?? 0
  }
  if (linkedinOnly.length > 0) {
    const { count, error } = await supabase
      .from('contact_blacklist')
      .upsert(linkedinOnly, { onConflict: 'client_id,linkedin_url', ignoreDuplicates: true, count: 'exact' })
    if (error) throw new Error(error.message)
    added += count ?? 0
  }

  revalidatePath(`/clients/${clientId}`)
  return { added, skipped: entries.length - added }
}

export async function removeBlacklistEntry(id: string, clientId: string): Promise<void> {
  const supabase = await createSupabase()
  const { error } = await supabase.from('contact_blacklist').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/clients/${clientId}`)
}

export async function getBlacklistMatchSets(clientId: string): Promise<BlacklistMatchSets> {
  const supabase = await createSupabase()
  const { data } = await supabase
    .from('contact_blacklist')
    .select('email, linkedin_url')
    .eq('client_id', clientId)
  const emails = new Set<string>()
  const linkedinUrls = new Set<string>()
  for (const row of data ?? []) {
    const e = normalizeBlacklistEmail(row.email as string | null)
    const l = normalizeBlacklistLinkedin(row.linkedin_url as string | null)
    if (e) emails.add(e)
    if (l) linkedinUrls.add(l)
  }
  return { emails, linkedinUrls }
}

export async function getClientIdForProject(projectId: string): Promise<string | null> {
  const supabase = await createSupabase()
  const { data } = await supabase
    .from('projects')
    .select('client_id')
    .eq('id', projectId)
    .single()
  return (data?.client_id as string | null) ?? null
}

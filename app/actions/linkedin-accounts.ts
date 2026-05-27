'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabase } from '@/utils/supabase/server'

export type LinkedinAccount = {
  id: string
  client_id: string
  name: string
  profile_url: string | null
  archived_at: string | null
  created_at: string
}

export type AccountStats = {
  leads_sent: number | null
  connections_accepted: number | null
  replies: number | null
  positive_replies: number | null
  meetings_booked: number | null
}

export type IterationAccountStats = AccountStats & {
  iteration_id: string
  linkedin_account_id: string
  uploaded_at: string
}

export async function getLinkedinAccounts(
  clientId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<LinkedinAccount[]> {
  const supabase = await createSupabase()
  let q = supabase
    .from('linkedin_accounts')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })
  if (!opts.includeArchived) q = q.is('archived_at', null)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as LinkedinAccount[]
}

export async function createLinkedinAccount(
  clientId: string,
  input: { name: string; profile_url?: string | null },
): Promise<LinkedinAccount> {
  const name = input.name.trim()
  if (!name) throw new Error('Account name is required')
  const profileUrl = input.profile_url?.trim() || null

  const supabase = await createSupabase()
  const { data, error } = await supabase
    .from('linkedin_accounts')
    .insert({ client_id: clientId, name, profile_url: profileUrl })
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error(`Account "${name}" already exists for this client`)
    throw new Error(error.message)
  }
  revalidatePath(`/clients/${clientId}`)
  return data as LinkedinAccount
}

export async function updateLinkedinAccount(
  id: string,
  clientId: string,
  patch: { name?: string; profile_url?: string | null },
): Promise<void> {
  const supabase = await createSupabase()
  const updates: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) throw new Error('Account name cannot be empty')
    updates.name = name
  }
  if (patch.profile_url !== undefined) updates.profile_url = patch.profile_url?.trim() || null
  if (Object.keys(updates).length === 0) return
  const { error } = await supabase.from('linkedin_accounts').update(updates).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/clients/${clientId}`)
}

export async function archiveLinkedinAccount(id: string, clientId: string): Promise<void> {
  const supabase = await createSupabase()
  const { error } = await supabase
    .from('linkedin_accounts')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/clients/${clientId}`)
}

export async function unarchiveLinkedinAccount(id: string, clientId: string): Promise<void> {
  const supabase = await createSupabase()
  const { error } = await supabase
    .from('linkedin_accounts')
    .update({ archived_at: null })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/clients/${clientId}`)
}

export async function getIterationAccountStats(iterationId: string): Promise<IterationAccountStats[]> {
  const supabase = await createSupabase()
  const { data, error } = await supabase
    .from('iteration_account_stats')
    .select('*')
    .eq('iteration_id', iterationId)
  if (error) throw new Error(error.message)
  return (data ?? []) as IterationAccountStats[]
}

// Replace the per-account breakdown for an iteration. Rows with all-null
// metrics are deleted (no signal). When the resulting set is empty, the
// iteration falls back to iterations.stats for leaderboard math.
export async function setIterationAccountStats(
  iterationId: string,
  rows: Array<{ linkedin_account_id: string } & AccountStats>,
): Promise<void> {
  const supabase = await createSupabase()
  const nonEmpty = rows.filter(r =>
    r.leads_sent !== null
    || r.connections_accepted !== null
    || r.replies !== null
    || r.positive_replies !== null
    || r.meetings_booked !== null,
  )

  // Wipe-and-replace — simpler than diffing, and the row count is small (one
  // per account per iteration).
  const { error: delErr } = await supabase
    .from('iteration_account_stats')
    .delete()
    .eq('iteration_id', iterationId)
  if (delErr) throw new Error(delErr.message)

  if (nonEmpty.length > 0) {
    const now = new Date().toISOString()
    const { error: insErr } = await supabase
      .from('iteration_account_stats')
      .insert(nonEmpty.map(r => ({
        iteration_id: iterationId,
        linkedin_account_id: r.linkedin_account_id,
        leads_sent: r.leads_sent,
        connections_accepted: r.connections_accepted,
        replies: r.replies,
        positive_replies: r.positive_replies,
        meetings_booked: r.meetings_booked,
        uploaded_at: now,
      })))
    if (insErr) throw new Error(insErr.message)
  }

  revalidatePath('.')
}

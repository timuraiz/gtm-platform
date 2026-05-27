'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabase } from '@/utils/supabase/server'

export type Sentiment = 'positive' | 'negative' | 'neutral'

export type Reply = {
  id: string
  iteration_id: string
  linkedin_account_id: string | null
  contact_li_url: string
  contact_name: string | null
  contact_headline: string | null
  contact_company: string | null
  contact_avatar_url: string | null
  contact_email: string | null
  our_last_message_text: string | null
  message_text: string
  message_sent_at: string
  sentiment: Sentiment | null
  sentiment_confidence: number | null
  sentiment_reason: string | null
  sentiment_evaluated_at: string | null
  created_at: string
}

export async function getIterationReplies(iterationId: string): Promise<Reply[]> {
  const supabase = await createSupabase()
  const { data, error } = await supabase
    .from('replies')
    .select('id, iteration_id, linkedin_account_id, contact_li_url, contact_name, contact_headline, contact_company, contact_avatar_url, contact_email, our_last_message_text, message_text, message_sent_at, sentiment, sentiment_confidence, sentiment_reason, sentiment_evaluated_at, created_at')
    .eq('iteration_id', iterationId)
    .order('message_sent_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Reply[]
}

// Counts used to roll up replies → iteration metrics in getClientStats. We
// count DISTINCT contacts: each prospect counts once even if they sent
// multiple messages. A contact counts as a positive_reply if AT LEAST ONE
// of their messages was classified positive.
export type IterationReplyCounts = {
  iteration_id: string
  replies_contacts: number
  positive_contacts: number
}

export async function getReplyCountsForClient(clientId: string): Promise<IterationReplyCounts[]> {
  const supabase = await createSupabase()
  // Fetch all replies for iterations under this client via FK chain.
  const { data, error } = await supabase
    .from('replies')
    .select('iteration_id, contact_li_url, sentiment, iterations!inner(project_id, projects!inner(client_id))')
    .eq('iterations.projects.client_id', clientId)
  if (error) throw new Error(error.message)

  type Row = { iteration_id: string; contact_li_url: string; sentiment: Sentiment | null }
  const rows = (data ?? []) as unknown as Row[]
  // Group: iteration → contact → has-positive flag
  const byIter = new Map<string, Map<string, boolean>>()
  for (const r of rows) {
    let contacts = byIter.get(r.iteration_id)
    if (!contacts) { contacts = new Map(); byIter.set(r.iteration_id, contacts) }
    const isPos = r.sentiment === 'positive'
    contacts.set(r.contact_li_url, (contacts.get(r.contact_li_url) ?? false) || isPos)
  }
  const out: IterationReplyCounts[] = []
  for (const [iter, contacts] of byIter) {
    let positive = 0
    for (const hasPos of contacts.values()) if (hasPos) positive += 1
    out.push({
      iteration_id: iter,
      replies_contacts: contacts.size,
      positive_contacts: positive,
    })
  }
  return out
}

export async function deleteReply(id: string, projectIdToRevalidate?: string): Promise<void> {
  const supabase = await createSupabase()
  const { error } = await supabase.from('replies').delete().eq('id', id)
  if (error) throw new Error(error.message)
  if (projectIdToRevalidate) revalidatePath(`/clients/[id]/projects/${projectIdToRevalidate}`, 'page')
  revalidatePath('.')
}

// Manual sentiment override — used when AI is wrong and the user wants
// to fix the classification.
export async function setReplySentiment(id: string, sentiment: Sentiment | null): Promise<void> {
  const supabase = await createSupabase()
  await supabase
    .from('replies')
    .update({
      sentiment,
      sentiment_reason: sentiment ? 'manual override' : null,
      sentiment_confidence: sentiment ? 1 : null,
      sentiment_evaluated_at: new Date().toISOString(),
    })
    .eq('id', id)
  revalidatePath('.')
}

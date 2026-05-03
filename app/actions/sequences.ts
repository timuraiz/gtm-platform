'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

export type SequenceStep = {
  type: 'connection_note' | 'message' | 'email'
  day: number
  subject?: string  // email only
  content: string
}

export type SequenceConfig = {
  channel: 'linkedin' | 'email'
  steps_count: number
  include_connection_note: boolean
  tone: 'professional' | 'casual' | 'direct'
  language?: string
  user_notes?: string
}

export type CaseStudy = {
  company: string
  result: string
  industry?: string
  description?: string
}

export type Sequence = {
  id: string
  project_id: string
  iteration_id: string | null
  name: string
  channel: 'linkedin' | 'email'
  config: SequenceConfig
  steps: SequenceStep[]
  used_case_studies: CaseStudy[]
  share_token: string
  share_mode: 'view' | 'comment' | 'edit'
  status: 'draft' | 'review' | 'approved'
  created_at: string
  updated_at: string
}

export async function getSequences(projectId: string, iterationId?: string): Promise<Sequence[]> {
  const supabase = await createClient()
  let query = supabase
    .from('sequences')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (iterationId) query = query.eq('iteration_id', iterationId)
  const { data } = await query
  return (data ?? []) as Sequence[]
}

export async function saveSequence(
  projectId: string,
  name: string,
  channel: 'linkedin' | 'email',
  config: SequenceConfig,
  steps: SequenceStep[],
  usedCaseStudies: CaseStudy[],
  iterationId: string,
): Promise<Sequence> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sequences')
    .insert({ project_id: projectId, name, channel, config, steps, used_case_studies: usedCaseStudies, iteration_id: iterationId })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('.')
  return data as Sequence
}

export async function getProjectCaseStudies(projectId: string): Promise<CaseStudy[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('projects')
    .select('clients(case_studies)')
    .eq('id', projectId)
    .single()
  return ((data?.clients as { case_studies?: CaseStudy[] } | null)?.case_studies ?? []) as CaseStudy[]
}

export async function updateSequenceSteps(id: string, steps: SequenceStep[]): Promise<void> {
  const supabase = await createClient()
  await supabase.from('sequences').update({ steps, updated_at: new Date().toISOString() }).eq('id', id)
}

export type SequenceComment = {
  id: string
  sequence_id: string
  step_index: number | null
  author_name: string
  content: string
  quote: string | null
  created_at: string
}

export async function getComments(sequenceId: string): Promise<SequenceComment[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('sequence_comments')
    .select('*')
    .eq('sequence_id', sequenceId)
    .order('created_at', { ascending: true })
  return (data ?? []) as SequenceComment[]
}

export async function addComment(
  sequenceId: string,
  content: string,
  stepIndex: number | null,
  quote: string | null,
): Promise<SequenceComment> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sequence_comments')
    .insert({ sequence_id: sequenceId, content, step_index: stepIndex, quote })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as SequenceComment
}

export async function updateComment(id: string, content: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('sequence_comments').update({ content }).eq('id', id)
}

export async function deleteComment(id: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('sequence_comments').delete().eq('id', id)
}

export async function getSequenceByToken(token: string): Promise<Sequence | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('sequences')
    .select('*')
    .eq('share_token', token)
    .single()
  return (data ?? null) as Sequence | null
}

export type SequenceVersionInfo = {
  id: string
  name: string
  share_token: string
  created_at: string
}

export type ProjectShareInfo = {
  id: string
  name: string
  share_token: string
  contacts_approved: boolean
}

export async function getProjectByShareToken(token: string): Promise<ProjectShareInfo | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('projects')
    .select('id, name, share_token, contacts_approved')
    .eq('share_token', token)
    .single()
  return (data ?? null) as ProjectShareInfo | null
}

export async function setProjectContactsApproval(projectId: string, approved: boolean): Promise<void> {
  const supabase = await createClient()
  await supabase.from('projects').update({ contacts_approved: approved }).eq('id', projectId)
  revalidatePath('.')
}

export async function getProjectShareToken(projectId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('projects')
    .select('share_token')
    .eq('id', projectId)
    .single()
  return (data?.share_token as string | null) ?? null
}

export async function getProjectSequenceVersions(projectId: string): Promise<SequenceVersionInfo[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('sequences')
    .select('id, name, share_token, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  return (data ?? []) as SequenceVersionInfo[]
}

export type SequenceContext = {
  project_name: string | null
  offer_text: string | null
  icp_json: Record<string, unknown> | null
  client_name: string | null
  client_logo_url: string | null
}

export async function getSequenceContext(projectId: string): Promise<SequenceContext> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('projects')
    .select('name, offer_text, icp_json, clients(name, logo_url)')
    .eq('id', projectId)
    .single()
  const client = data?.clients as { name?: string; logo_url?: string } | null
  return {
    project_name: (data?.name as string | null) ?? null,
    offer_text: (data?.offer_text as string | null) ?? null,
    icp_json: (data?.icp_json as Record<string, unknown> | null) ?? null,
    client_name: client?.name ?? null,
    client_logo_url: client?.logo_url ?? null,
  }
}

export async function deleteSequence(id: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('sequences').delete().eq('id', id)
  revalidatePath('.')
}

export async function setSequenceApproval(id: string, approved: boolean): Promise<void> {
  const supabase = await createClient()
  if (approved) {
    const { data: seq } = await supabase
      .from('sequences')
      .select('project_id, channel')
      .eq('id', id)
      .single()
    if (seq?.project_id && seq?.channel) {
      await supabase
        .from('sequences')
        .update({ status: 'draft' })
        .eq('project_id', seq.project_id)
        .eq('channel', seq.channel)
        .neq('id', id)
    }
    await supabase.from('sequences').update({ status: 'approved' }).eq('id', id)
  } else {
    await supabase.from('sequences').update({ status: 'draft' }).eq('id', id)
  }
  revalidatePath('.')
}

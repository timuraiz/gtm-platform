'use server'

import { createClient } from '@/utils/supabase/server'

export type StepRecord = {
  name: string
  status: 'done' | 'error'
  artifact: unknown
}

export type PipelineRun = {
  id: string
  project_id: string
  status: 'pending' | 'running' | 'done' | 'error'
  steps: StepRecord[]
  filters: unknown
  companies_found: number
  contacts_found: number
  error: string | null
  created_at: string
  updated_at: string
}

export async function getRun(runId: string): Promise<PipelineRun | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pipeline_runs')
    .select('*')
    .eq('id', runId)
    .single()
  return data as PipelineRun | null
}

export async function getPipelineRuns(projectId: string): Promise<PipelineRun[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pipeline_runs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(10)
  return (data ?? []) as PipelineRun[]
}

export type Contact = {
  id: string
  first_name: string | null
  last_name: string | null
  title: string | null
  email: string | null
  linkedin_url: string
  created_at: string
  company_name: string | null
  company_domain: string | null
}

export async function getContacts(projectId: string): Promise<Contact[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, title, email, linkedin_url, created_at, companies(name, domain)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  return (data ?? []).map((c: Record<string, unknown>) => {
    const co = c.companies as { name: string; domain: string } | null
    return {
      id: c.id as string,
      first_name: c.first_name as string | null,
      last_name: c.last_name as string | null,
      title: c.title as string | null,
      email: c.email as string | null,
      linkedin_url: c.linkedin_url as string,
      created_at: c.created_at as string,
      company_name: co?.name ?? null,
      company_domain: co?.domain ?? null,
    }
  })
}

export async function forkPipelineRun(runId: string): Promise<string> {
  const supabase = await createClient()
  const { data: source } = await supabase
    .from('pipeline_runs')
    .select('project_id, steps, companies_found, contacts_found')
    .eq('id', runId)
    .single()
  if (!source) throw new Error('Run not found')
  const { data: newRun } = await supabase
    .from('pipeline_runs')
    .insert({
      project_id: source.project_id,
      status: 'done',
      steps: source.steps,
      companies_found: source.companies_found,
      contacts_found: source.contacts_found,
    })
    .select('id')
    .single()
  return newRun!.id
}

export async function getProject(projectId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('projects')
    .select('*, clients(id, name, logo_url, website_url)')
    .eq('id', projectId)
    .single()
  return data
}

'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { getBlacklistMatchSets, getClientIdForProject } from './blacklist'
import { isBlacklisted } from '@/lib/blacklist'

export type StepRecord = {
  name: string
  status: 'done' | 'error'
  artifact: unknown
}

export type PipelineRun = {
  id: string
  project_id: string
  status: 'pending' | 'running' | 'idle' | 'done' | 'error'
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
  company_logo_url: string | null
  custom_data: Record<string, string> | null
}

export async function getContacts(projectId: string, iterationId?: string): Promise<Contact[]> {
  const supabase = await createClient()
  let query = supabase
    .from('contacts')
    .select('id, first_name, last_name, title, email, linkedin_url, created_at, custom_data, companies(name, domain, logo_url)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .range(0, 49999)
  if (iterationId) query = query.eq('iteration_id', iterationId)
  const { data } = await query
  return (data ?? []).map((c: Record<string, unknown>) => {
    const co = c.companies as { name: string; domain: string; logo_url: string | null } | null
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
      company_logo_url: co?.logo_url ?? null,
      custom_data: (c.custom_data as Record<string, string> | null) ?? null,
    }
  })
}

export async function deleteContact(id: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('contacts').delete().eq('id', id)
  revalidatePath('.')
}

export async function getIterationCustomColumns(projectId: string, iterationId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('contacts')
    .select('custom_data')
    .eq('project_id', projectId)
    .eq('iteration_id', iterationId)
    .not('custom_data', 'is', null)
  const keys = new Set<string>()
  for (const row of data ?? []) {
    const obj = row.custom_data as Record<string, unknown> | null
    if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach(k => keys.add(k))
    }
  }
  return Array.from(keys).sort()
}

export async function deleteContacts(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const supabase = await createClient()
  await supabase.from('contacts').delete().in('id', ids)
  revalidatePath('.')
}

export type UploadedContactRow = {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  linkedin_url?: string | null
  title?: string | null
  company_name?: string | null
  company_domain?: string | null
  custom_data?: Record<string, string>
}

export async function uploadContacts(
  projectId: string,
  iterationId: string,
  rows: UploadedContactRow[],
): Promise<{ inserted: number; skipped: number; blacklisted: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0, blacklisted: 0 }
  const supabase = await createClient()

  // Filter out blacklisted contacts up-front so they never hit `contacts`.
  const clientId = await getClientIdForProject(projectId)
  let working = rows
  let blacklisted = 0
  if (clientId) {
    const sets = await getBlacklistMatchSets(clientId)
    if (sets.emails.size > 0 || sets.linkedinUrls.size > 0) {
      working = rows.filter((r) => !isBlacklisted(sets, r.email, r.linkedin_url))
      blacklisted = rows.length - working.length
    }
  }
  if (working.length === 0) return { inserted: 0, skipped: 0, blacklisted }

  // Resolve / create companies by domain (global) + attach to project
  const domains = [...new Set(working.map(r => r.company_domain?.trim()).filter(Boolean) as string[])]
  const domainToCompanyId: Record<string, string> = {}
  if (domains.length > 0) {
    // Upsert into global companies — preserves existing metadata if present
    const newCompanies = domains.map(d => {
      const sample = working.find(r => r.company_domain?.trim() === d)
      return { domain: d, name: sample?.company_name ?? d }
    })
    await supabase
      .from('companies')
      .upsert(newCompanies, { onConflict: 'domain', ignoreDuplicates: true })

    const { data: resolved } = await supabase
      .from('companies')
      .select('id, domain')
      .in('domain', domains)
    for (const c of resolved ?? []) domainToCompanyId[c.domain as string] = c.id as string

    // Attach to project via project_companies (source='csv' marks origin)
    const attachRows = Object.values(domainToCompanyId).map(company_id => ({
      project_id: projectId,
      company_id,
      source: 'csv',
    }))
    if (attachRows.length > 0) {
      await supabase
        .from('project_companies')
        .upsert(attachRows, { onConflict: 'project_id,company_id', ignoreDuplicates: true })
    }
  }

  let inserted = 0
  let skipped = 0
  const seenLinkedin = new Set<string>()
  const toInsert: Record<string, unknown>[] = []
  for (const r of working) {
    const li = r.linkedin_url?.trim() || `manual-${crypto.randomUUID()}`
    if (seenLinkedin.has(li)) { skipped++; continue }
    seenLinkedin.add(li)
    toInsert.push({
      project_id: projectId,
      iteration_id: iterationId,
      company_id: r.company_domain ? domainToCompanyId[r.company_domain.trim()] ?? null : null,
      linkedin_url: li,
      email: r.email?.trim() || null,
      first_name: r.first_name?.trim() || null,
      last_name: r.last_name?.trim() || null,
      title: r.title?.trim() || null,
      custom_data: r.custom_data && Object.keys(r.custom_data).length > 0 ? r.custom_data : null,
    })
  }

  if (toInsert.length > 0) {
    const { error, count } = await supabase
      .from('contacts')
      .upsert(toInsert, { onConflict: 'iteration_id,linkedin_url', ignoreDuplicates: true, count: 'exact' })
    if (error) throw new Error(error.message)
    inserted = count ?? toInsert.length
    skipped += toInsert.length - inserted
  }

  revalidatePath('.')
  return { inserted, skipped, blacklisted }
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

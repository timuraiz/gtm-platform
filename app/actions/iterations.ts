'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

export type IterationStatus = 'draft' | 'running' | 'finished' | 'discarded'

export type IterationChannel = 'linkedin' | 'email'

export type Iteration = {
  id: string
  project_id: string
  name: string
  status: IterationStatus
  channel: IterationChannel
  created_at: string
  started_at: string | null
  finished_at: string | null
  stats: IterationMetrics | null
  stats_uploaded_at: string | null
}

export type IterationMetrics = {
  leads_sent: number | null
  connections_accepted: number | null
  replies: number | null
  positive_replies: number | null
  meetings_booked: number | null
}

export async function getIterations(projectId: string): Promise<Iteration[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('iterations')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  return (data ?? []) as Iteration[]
}

export async function createIteration(projectId: string, channel: IterationChannel = 'linkedin'): Promise<Iteration> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('iterations')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
  const finalName = `Iteration #${(count ?? 0) + 1}`

  const { data, error } = await supabase
    .from('iterations')
    .insert({ project_id: projectId, name: finalName, channel })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('.')
  return data as Iteration
}

export async function deleteIteration(id: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('iterations').delete().eq('id', id)
  revalidatePath('.')
}

export async function setIterationChannel(id: string, channel: IterationChannel): Promise<void> {
  const supabase = await createClient()
  await supabase.from('iterations').update({ channel }).eq('id', id)
  revalidatePath('.')
}

export async function setIterationStatus(id: string, status: IterationStatus): Promise<void> {
  const supabase = await createClient()
  const { data: current } = await supabase
    .from('iterations')
    .select('started_at, finished_at')
    .eq('id', id)
    .single()

  const updates: Record<string, unknown> = { status }
  const now = new Date().toISOString()
  if (status === 'running' && !current?.started_at) updates.started_at = now
  if (status === 'finished' && !current?.finished_at) updates.finished_at = now

  await supabase.from('iterations').update(updates).eq('id', id)
  revalidatePath('.')
}

export async function uploadIterationStats(
  iterationId: string,
  metrics: IterationMetrics,
): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('iterations')
    .update({ stats: metrics, stats_uploaded_at: new Date().toISOString() })
    .eq('id', iterationId)
  revalidatePath('.')
}

export async function clearIterationStats(iterationId: string): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('iterations')
    .update({ stats: null, stats_uploaded_at: null })
    .eq('id', iterationId)
  revalidatePath('.')
}

export type ChannelTotals = {
  iterations: number
  iterations_with_stats: number
  leads_sent: number
  connections_accepted: number
  replies: number
  positive_replies: number
  meetings_booked: number
}

export type ClientStats = {
  linkedin: ChannelTotals
  email: ChannelTotals
  by_project: Array<{
    project_id: string
    project_name: string
    linkedin: ChannelTotals
    email: ChannelTotals
  }>
  status_counts: { draft: number; running: number; finished: number; discarded: number }
  launched_this_week: number
  weekly_launches: Array<{ week_start: string; count: number }>
  top_sequences: Array<{
    sequence_id: string
    sequence_name: string
    share_token: string
    project_name: string
    channel: IterationChannel
    iterations: number
    leads_sent: number
    replies: number
    meetings_booked: number
    steps: SequenceStepLite[]
  }>
  top_industries: { linkedin: GroupRow[]; email: GroupRow[] }
  top_roles: { linkedin: GroupRow[]; email: GroupRow[] }
}

export type GroupRow = { name: string; iterations: number; replies: number; meetings_booked: number }

export type SequenceStepLite = {
  type: 'connection_note' | 'message' | 'email'
  day: number
  subject?: string
  content: string
}

function emptyTotals(): ChannelTotals {
  return {
    iterations: 0, iterations_with_stats: 0,
    leads_sent: 0, connections_accepted: 0, replies: 0, positive_replies: 0, meetings_booked: 0,
  }
}

function addToTotals(t: ChannelTotals, m: IterationMetrics) {
  t.iterations_with_stats += 1
  t.leads_sent += m.leads_sent ?? 0
  t.connections_accepted += m.connections_accepted ?? 0
  t.replies += m.replies ?? 0
  t.positive_replies += m.positive_replies ?? 0
  t.meetings_booked += m.meetings_booked ?? 0
}

export async function getClientStats(
  clientId: string,
  from?: string | null,
  to?: string | null,
  projectIds?: string[] | null,
): Promise<ClientStats> {
  const supabase = await createClient()
  let query = supabase
    .from('projects')
    .select(`
      id, name, icp_json,
      iterations(
        id, channel, status, started_at, stats,
        sequences(id, name, share_token, channel, status, steps)
      )
    `)
    .eq('client_id', clientId)
  if (projectIds && projectIds.length > 0) query = query.in('id', projectIds)
  const { data: projects } = await query

  // Date range filter on iteration.started_at — inclusive bounds
  const fromMs = from ? new Date(from).getTime() : null
  // Make 'to' end-of-day inclusive
  const toMs = to ? new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1 : null
  const inRange = (started: string | null) => {
    if (!fromMs && !toMs) return true
    if (!started) return false
    const t = new Date(started).getTime()
    if (fromMs !== null && t < fromMs) return false
    if (toMs !== null && t > toMs) return false
    return true
  }

  const result: ClientStats = {
    linkedin: emptyTotals(),
    email: emptyTotals(),
    by_project: [],
    status_counts: { draft: 0, running: 0, finished: 0, discarded: 0 },
    launched_this_week: 0,
    weekly_launches: [],
    top_sequences: [],
    top_industries: { linkedin: [], email: [] },
    top_roles: { linkedin: [], email: [] },
  }

  type GroupAccum = { iterations: number; replies: number; meetings_booked: number }
  const industryMap = { linkedin: new Map<string, GroupAccum>(), email: new Map<string, GroupAccum>() }
  const roleMap = { linkedin: new Map<string, GroupAccum>(), email: new Map<string, GroupAccum>() }
  const accumGroup = (map: Map<string, GroupAccum>, key: string, m: IterationMetrics | null) => {
    let acc = map.get(key)
    if (!acc) { acc = { iterations: 0, replies: 0, meetings_booked: 0 }; map.set(key, acc) }
    acc.iterations += 1
    acc.replies += m?.replies ?? 0
    acc.meetings_booked += m?.meetings_booked ?? 0
  }

  // Track iteration data for advanced aggregations
  type SeqAccum = {
    sequence_id: string
    sequence_name: string
    share_token: string
    project_name: string
    channel: IterationChannel
    steps: SequenceStepLite[]
    iterations: number
    leads_sent: number
    replies: number
    meetings_booked: number
  }
  const seqMap = new Map<string, SeqAccum>()
  const launchTimestamps: Date[] = []

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  for (const p of projects ?? []) {
    const proj = p as {
      id: string; name: string
      icp_json: Record<string, unknown> | null
      iterations: Array<{
        id: string
        channel: IterationChannel
        status: IterationStatus
        started_at: string | null
        stats: IterationMetrics | null
        sequences: Array<{ id: string; name: string; share_token: string; channel: IterationChannel; status: string; steps: Array<{ subject?: string; content: string }> }>
      }>
    }
    // Pull industries and roles from project's ICP (handle both flat + apollo_filters shapes)
    const icp = proj.icp_json ?? {}
    const projIndustries: string[] = (
      Array.isArray((icp as Record<string, unknown>).industries) ? (icp as Record<string, unknown>).industries as string[] :
      Array.isArray(((icp as Record<string, unknown>).apollo_filters as Record<string, unknown> | undefined)?.industries) ? (((icp as Record<string, unknown>).apollo_filters as Record<string, unknown>).industries as string[]) :
      []
    ).filter(Boolean)
    const targetRoles = (icp as Record<string, unknown>).target_roles as Record<string, string[]> | undefined
    const projRoles: string[] = (
      targetRoles ? [...(targetRoles.primary ?? []), ...(targetRoles.secondary ?? [])] :
      Array.isArray((icp as Record<string, unknown>).titles) ? (icp as Record<string, unknown>).titles as string[] :
      []
    ).filter(Boolean)

    const projTotals = { project_id: proj.id, project_name: proj.name, linkedin: emptyTotals(), email: emptyTotals() }
    for (const it of proj.iterations ?? []) {
      // When a range is active, only include iterations launched within it
      if ((fromMs || toMs) && !inRange(it.started_at)) continue

      // Industry / role aggregation per channel (each iteration credited to all targeted industries/roles)
      const ch: 'linkedin' | 'email' = it.channel === 'email' ? 'email' : 'linkedin'
      for (const ind of projIndustries) accumGroup(industryMap[ch], ind, it.stats)
      for (const role of projRoles) accumGroup(roleMap[ch], role, it.stats)

      // Aggregate channel + project totals
      const channelBucket: 'linkedin' | 'email' = it.channel === 'email' ? 'email' : 'linkedin'
      result[channelBucket].iterations += 1
      projTotals[channelBucket].iterations += 1
      if (it.stats) {
        addToTotals(result[channelBucket], it.stats)
        addToTotals(projTotals[channelBucket], it.stats)
      }

      // Status counts
      if (it.status in result.status_counts) result.status_counts[it.status as IterationStatus] += 1

      // Launch tracking
      if (it.started_at) {
        const d = new Date(it.started_at)
        launchTimestamps.push(d)
        if (d >= oneWeekAgo) result.launched_this_week += 1
      }

      // Best sequence tracking — credit the approved sequence(s) with the iteration's metrics
      if (it.stats) {
        const approved = (it.sequences ?? []).filter(s => s.status === 'approved' && s.channel === it.channel)
        for (const seq of approved) {
          const key = seq.id
          let acc = seqMap.get(key)
          if (!acc) {
            acc = {
              sequence_id: seq.id,
              sequence_name: seq.name,
              share_token: seq.share_token,
              project_name: proj.name,
              channel: seq.channel,
              steps: (seq.steps ?? []) as SequenceStepLite[],
              iterations: 0, leads_sent: 0, replies: 0, meetings_booked: 0,
            }
            seqMap.set(key, acc)
          }
          acc.iterations += 1
          acc.leads_sent += it.stats.leads_sent ?? 0
          acc.replies += it.stats.replies ?? 0
          acc.meetings_booked += it.stats.meetings_booked ?? 0
        }
      }
    }
    if (projTotals.linkedin.iterations > 0 || projTotals.email.iterations > 0) {
      result.by_project.push(projTotals)
    }
  }

  // Top sequences by meetings → replies
  result.top_sequences = Array.from(seqMap.values())
    .filter(s => s.iterations > 0)
    .sort((a, b) => (b.meetings_booked - a.meetings_booked) || (b.replies - a.replies) || (b.leads_sent - a.leads_sent))
    .slice(0, 5)

  // Weekly launches — last 8 weeks
  const weekly = new Map<string, number>()
  for (let i = 7; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - d.getDay() - i * 7) // start of week (Sunday)
    const key = d.toISOString().slice(0, 10)
    weekly.set(key, 0)
  }
  for (const ts of launchTimestamps) {
    const d = new Date(ts)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - d.getDay())
    const key = d.toISOString().slice(0, 10)
    if (weekly.has(key)) weekly.set(key, (weekly.get(key) ?? 0) + 1)
  }
  result.weekly_launches = Array.from(weekly.entries()).map(([week_start, count]) => ({ week_start, count }))

  // Top industries / roles — sort by iterations desc, then meetings, then replies
  const sortGroup = (m: Map<string, GroupAccum>) => Array.from(m.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => (b.iterations - a.iterations) || (b.meetings_booked - a.meetings_booked) || (b.replies - a.replies))
    .slice(0, 6)

  result.top_industries = { linkedin: sortGroup(industryMap.linkedin), email: sortGroup(industryMap.email) }
  result.top_roles = { linkedin: sortGroup(roleMap.linkedin), email: sortGroup(roleMap.email) }

  return result
}

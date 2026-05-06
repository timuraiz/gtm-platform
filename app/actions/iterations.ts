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
    status_counts: { draft: number; running: number; finished: number; discarded: number }
    launched_this_week: number
  }>
  status_counts: { draft: number; running: number; finished: number; discarded: number }
  launched_this_week: number
  weekly_launches: Array<{ week_start: string; count: number; projects: Array<{ project_id: string; project_name: string; channel: IterationChannel }> }>
  launch_cadence: {
    granularity: 'day' | 'week' | 'month' | 'year'
    buckets: Array<{ bucket_start: string; label: string; count: number; projects: Array<{ project_id: string; project_name: string; channel: IterationChannel }> }>
  }
  top_sequences: Array<{
    sequence_id: string
    sequence_name: string
    share_token: string
    project_id: string
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

export type GroupRow = { name: string; iterations: number; leads_sent: number; replies: number; meetings_booked: number }

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
    launch_cadence: { granularity: 'week', buckets: [] },
    top_sequences: [],
    top_industries: { linkedin: [], email: [] },
    top_roles: { linkedin: [], email: [] },
  }

  type GroupAccum = { iterations: number; leads_sent: number; replies: number; meetings_booked: number }
  const industryMap = { linkedin: new Map<string, GroupAccum>(), email: new Map<string, GroupAccum>() }
  const roleMap = { linkedin: new Map<string, GroupAccum>(), email: new Map<string, GroupAccum>() }
  const accumGroup = (map: Map<string, GroupAccum>, key: string, m: IterationMetrics | null) => {
    let acc = map.get(key)
    if (!acc) { acc = { iterations: 0, leads_sent: 0, replies: 0, meetings_booked: 0 }; map.set(key, acc) }
    acc.iterations += 1
    acc.leads_sent += m?.leads_sent ?? 0
    acc.replies += m?.replies ?? 0
    acc.meetings_booked += m?.meetings_booked ?? 0
  }

  // Track iteration data for advanced aggregations
  type SeqAccum = {
    sequence_id: string
    sequence_name: string
    share_token: string
    project_id: string
    project_name: string
    channel: IterationChannel
    steps: SequenceStepLite[]
    iterations: number
    leads_sent: number
    replies: number
    meetings_booked: number
  }
  const seqMap = new Map<string, SeqAccum>()
  const launches: Array<{ at: Date; project_id: string; project_name: string; channel: IterationChannel }> = []

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

    const projTotals = {
      project_id: proj.id, project_name: proj.name,
      linkedin: emptyTotals(), email: emptyTotals(),
      status_counts: { draft: 0, running: 0, finished: 0, discarded: 0 },
      launched_this_week: 0,
    }
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

      // Status counts (global + per-project)
      if (it.status in result.status_counts) {
        result.status_counts[it.status as IterationStatus] += 1
        projTotals.status_counts[it.status as IterationStatus] += 1
      }

      // Launch tracking (global + per-project)
      if (it.started_at) {
        const d = new Date(it.started_at)
        launches.push({ at: d, project_id: proj.id, project_name: proj.name, channel: it.channel })
        if (d >= oneWeekAgo) {
          result.launched_this_week += 1
          projTotals.launched_this_week += 1
        }
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
              project_id: proj.id,
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

  // Top sequences — all sequences returned; client slices to top 5 after project filtering
  result.top_sequences = Array.from(seqMap.values())
    .filter(s => s.iterations > 0)
    .sort((a, b) => (b.meetings_booked - a.meetings_booked) || (b.replies - a.replies) || (b.leads_sent - a.leads_sent))

  // Launch cadence — granularity picked from the active date range:
  //   no range → last 8 weeks
  //   ≤ 30 days → daily buckets
  //   ≤ 24 months → monthly buckets
  //   > 24 months → yearly buckets
  type Bucket = { count: number; projects: Array<{ project_id: string; project_name: string; channel: IterationChannel }> }
  type Gran = 'day' | 'week' | 'month' | 'year'
  const startOfWeek = (d: Date) => {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    x.setDate(x.getDate() - x.getDay())
    return x
  }
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
  const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
  const startOfYear = (d: Date) => new Date(d.getFullYear(), 0, 1)

  const monthShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const labelFor = (d: Date, gran: Gran) => {
    if (gran === 'day') return `${monthShort[d.getMonth()]} ${d.getDate()}`
    if (gran === 'week') return `${monthShort[d.getMonth()]} ${d.getDate()}`
    if (gran === 'month') return `${monthShort[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
    return String(d.getFullYear())
  }
  const truncFor = (d: Date, gran: Gran) =>
    gran === 'day' ? startOfDay(d)
    : gran === 'week' ? startOfWeek(d)
    : gran === 'month' ? startOfMonth(d)
    : startOfYear(d)
  const advance = (d: Date, gran: Gran, by = 1) => {
    const x = new Date(d)
    if (gran === 'day') x.setDate(x.getDate() + by)
    else if (gran === 'week') x.setDate(x.getDate() + 7 * by)
    else if (gran === 'month') x.setMonth(x.getMonth() + by)
    else x.setFullYear(x.getFullYear() + by)
    return x
  }

  let granularity: Gran = 'week'
  let firstBucket: Date
  let lastBucket: Date
  if (fromMs && toMs) {
    const days = Math.round((toMs - fromMs) / 86_400_000)
    if (days <= 30) granularity = 'day'
    else if (days <= 730) granularity = 'month'
    else granularity = 'year'
    firstBucket = truncFor(new Date(fromMs), granularity)
    lastBucket = truncFor(new Date(toMs), granularity)
  } else {
    granularity = 'week'
    firstBucket = startOfWeek(advance(new Date(), 'week', -7))
    lastBucket = startOfWeek(new Date())
  }

  const cadence = new Map<string, Bucket>()
  for (let cur = new Date(firstBucket); cur.getTime() <= lastBucket.getTime(); cur = advance(cur, granularity, 1)) {
    cadence.set(cur.toISOString(), { count: 0, projects: [] })
  }
  for (const launch of launches) {
    const key = truncFor(launch.at, granularity).toISOString()
    const bucket = cadence.get(key)
    if (bucket) {
      bucket.count += 1
      bucket.projects.push({ project_id: launch.project_id, project_name: launch.project_name, channel: launch.channel })
    }
  }
  result.launch_cadence = {
    granularity,
    buckets: Array.from(cadence.entries()).map(([iso, bucket]) => ({
      bucket_start: iso,
      label: labelFor(new Date(iso), granularity),
      count: bucket.count,
      projects: bucket.projects,
    })),
  }
  // Legacy: keep weekly_launches populated when granularity is week so existing chart consumers don't break
  result.weekly_launches = granularity === 'week'
    ? result.launch_cadence.buckets.map(b => ({ week_start: b.bucket_start.slice(0, 10), count: b.count, projects: b.projects }))
    : []

  // Top industries / roles — sort by iterations desc, then meetings, then replies
  const sortGroup = (m: Map<string, GroupAccum>) => Array.from(m.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => (b.iterations - a.iterations) || (b.meetings_booked - a.meetings_booked) || (b.replies - a.replies))
    .slice(0, 6)

  result.top_industries = { linkedin: sortGroup(industryMap.linkedin), email: sortGroup(industryMap.email) }
  result.top_roles = { linkedin: sortGroup(roleMap.linkedin), email: sortGroup(roleMap.email) }

  return result
}

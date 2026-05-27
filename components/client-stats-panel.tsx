'use client'

import { useState, useEffect, useRef, useMemo, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, BarChart3, X, ExternalLink, ChevronDown, UserCircle2 } from 'lucide-react'
import type { ClientStats, ChannelTotals, IterationChannel, AccountLeaderboardRow } from '@/app/actions/iterations'
import { ChannelIcon } from './channel-icon'

type FunnelStep = { key: keyof ChannelTotals; label: string }

const LI_FUNNEL: FunnelStep[] = [
  { key: 'leads_sent', label: 'Leads sent' },
  { key: 'connections_accepted', label: 'Connections accepted' },
  { key: 'replies', label: 'Replies' },
  { key: 'positive_replies', label: 'Positive replies' },
  { key: 'meetings_booked', label: 'Meetings booked' },
]
const EMAIL_FUNNEL: FunnelStep[] = [
  { key: 'leads_sent', label: 'Emails sent' },
  { key: 'replies', label: 'Replies' },
  { key: 'positive_replies', label: 'Positive replies' },
  { key: 'meetings_booked', label: 'Meetings booked' },
]

function pct(num: number, denom: number): string {
  if (!denom || denom === 0) return '—'
  const p = (num / denom) * 100
  if (p < 0.1 && p > 0) return '<0.1%'
  return `${p.toFixed(p < 10 ? 1 : 0)}%`
}

function ChannelBadge({ channel, size = 'sm' }: { channel: IterationChannel; size?: 'sm' | 'xs' }) {
  const cls = channel === 'linkedin' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'
  const iconSize = size === 'xs' ? 9 : 10
  const px = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${cls} ${px}`}>
      {channel === 'linkedin' ? <ChannelIcon channel="linkedin" size={iconSize} /> : <Mail size={iconSize} />}
      {channel === 'linkedin' ? 'LinkedIn' : 'Email'}
    </span>
  )
}

function Funnel({
  totals,
  steps,
  channel,
}: {
  totals: ChannelTotals
  steps: FunnelStep[]
  channel: 'linkedin' | 'email'
}) {
  const top = totals[steps[0].key] as number
  const noData = totals.iterations_with_stats === 0

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-zinc-50">
        <div className="flex items-center gap-2">
          <span className="text-zinc-500">
            {channel === 'linkedin' ? <ChannelIcon channel="linkedin" size={13} /> : <Mail size={13} />}
          </span>
          <span className="text-xs font-semibold text-zinc-700 uppercase tracking-widest">
            {channel === 'linkedin' ? 'LinkedIn' : 'Email'}
          </span>
        </div>
        <span className="text-[11px] text-zinc-400 tabular-nums">
          {totals.iterations} iteration{totals.iterations === 1 ? '' : 's'}
        </span>
      </div>

      {noData ? (
        <div className="flex flex-col items-center justify-center py-12 text-zinc-300">
          <BarChart3 size={20} />
          <p className="text-xs mt-2">No stats uploaded</p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-50">
          {steps.map((s, i) => {
            const value = totals[s.key] as number
            const widthPct = top > 0 ? Math.max(1, (value / top) * 100) : 0
            const prev = i > 0 ? (totals[steps[i - 1].key] as number) : null
            const convRate = prev !== null ? pct(value, prev) : null
            const isLast = i === steps.length - 1
            return (
              <div key={s.key} className="px-5 py-3.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm text-zinc-500">{s.label}</span>
                    {convRate && convRate !== '—' && (
                      <span className="text-[11px] text-zinc-300 tabular-nums">{convRate}</span>
                    )}
                  </div>
                  <span className={`text-base font-semibold tabular-nums leading-none ${isLast && value > 0 ? 'text-emerald-600' : value === 0 ? 'text-zinc-300' : 'text-zinc-900'}`}>
                    {value.toLocaleString()}
                  </span>
                </div>
                <div className="h-1 bg-zinc-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${isLast && value > 0 ? 'bg-emerald-400' : 'bg-zinc-800'}`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>
            )
          })}
          <div className="px-5 py-3 flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">Overall conversion to meeting</span>
            <span className="text-[11px] tabular-nums font-semibold text-zinc-500">
              {pct(totals.meetings_booked, top)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-5">
      <p className="text-[11px] uppercase tracking-widest font-medium text-zinc-400">{label}</p>
      <p className="text-3xl font-semibold text-zinc-900 tabular-nums mt-2 leading-none">{value}</p>
      {hint && <p className="text-xs text-zinc-400 mt-2">{hint}</p>}
    </div>
  )
}

function WeeklyChart({ cadence }: { cadence: ClientStats['launch_cadence'] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const buckets = cadence.buckets
  const max = Math.max(1, ...buckets.map(b => b.count))
  const total = buckets.reduce((s, b) => s + b.count, 0)
  const granLabel = cadence.granularity === 'day' ? 'day'
    : cadence.granularity === 'month' ? 'month'
    : cadence.granularity === 'year' ? 'year'
    : 'week'
  const subtitle = buckets.length === 0
    ? `Iterations started per ${granLabel}`
    : `Iterations started per ${granLabel} · ${buckets.length}`
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Launch cadence</p>
          <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>
        </div>
        <span className="text-xs text-zinc-400 tabular-nums">{total} total</span>
      </div>
      <div className="relative">
        <div className="flex items-end gap-1 h-28" style={{ minHeight: '7rem' }}>
          {buckets.map((b, idx) => {
            const ratio = b.count / max
            const heightPct = b.count > 0 ? Math.max(14, ratio * 100) : 4
            const isHovered = hoverIdx === idx
            return (
              <div
                key={b.bucket_start}
                className="group h-full flex-1 flex flex-col items-center justify-end relative"
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
              >
                <motion.div
                  className={`w-full max-w-[18px] rounded-full ${
                    b.count > 0
                      ? isHovered
                        ? 'bg-gradient-to-t from-zinc-900 to-zinc-700 shadow-md shadow-zinc-900/15'
                        : 'bg-gradient-to-t from-zinc-800 to-zinc-600'
                      : 'bg-zinc-100'
                  }`}
                  initial={false}
                  animate={{
                    height: `${heightPct}%`,
                    scaleY: isHovered ? 1.04 : 1,
                  }}
                  transition={{
                    height: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
                    scaleY: { duration: 0.18, ease: 'easeOut' },
                  }}
                  style={{ transformOrigin: 'bottom' }}
                />
              </div>
            )
          })}
        </div>

        {/* Bucket labels */}
        <div className="flex gap-1 mt-2.5">
          {buckets.map((b, idx) => (
            <span
              key={b.bucket_start}
              className={`flex-1 text-[10px] tabular-nums text-center transition-colors ${
                hoverIdx === idx ? 'text-zinc-900 font-medium' : 'text-zinc-400'
              }`}
            >
              {b.label}
            </span>
          ))}
        </div>

        {/* Hover tooltip — shows project names for that bucket */}
        <AnimatePresence>
          {hoverIdx !== null && buckets[hoverIdx]?.count > 0 && (
            <motion.div
              key={`tooltip-${hoverIdx}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="absolute -top-2 -translate-y-full left-0 right-0 pointer-events-none flex justify-center"
              style={{ left: `${(hoverIdx / Math.max(1, buckets.length)) * 100}%`, width: `${100 / Math.max(1, buckets.length)}%` }}
            >
              <div className="bg-zinc-900 text-white rounded-lg px-3 py-2 shadow-xl shadow-zinc-900/15 min-w-max max-w-[260px]">
                <p className="text-xs font-semibold mb-1">
                  {buckets[hoverIdx].count} iteration{buckets[hoverIdx].count === 1 ? '' : 's'}
                </p>
                <ul className="space-y-0.5">
                  {buckets[hoverIdx].projects.slice(0, 5).map((p, i) => (
                    <li key={i} className="text-[11px] text-zinc-300 flex items-center gap-1.5">
                      <span className={`size-1.5 rounded-full ${p.channel === 'linkedin' ? 'bg-blue-400' : 'bg-orange-400'}`} />
                      <span className="truncate">{p.project_name}</span>
                    </li>
                  ))}
                  {buckets[hoverIdx].projects.length > 5 && (
                    <li className="text-[10px] text-zinc-500 mt-0.5">+{buckets[hoverIdx].projects.length - 5} more</li>
                  )}
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function TopSequencesCard({ sequences }: { sequences: ClientStats['top_sequences'] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  if (sequences.length === 0) return null
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white overflow-hidden">
      <div className="px-5 py-3.5 border-b border-zinc-50">
        <p className="text-sm font-semibold text-zinc-900">Top sequences</p>
        <p className="text-xs text-zinc-400 mt-0.5">Approved versions ranked by meetings booked · click a row to view all steps</p>
      </div>
      <div className="divide-y divide-zinc-50">
        {sequences.map((s, i) => {
          const expanded = expandedId === s.sequence_id
          return (
            <div key={s.sequence_id}>
              <button
                onClick={() => setExpandedId(expanded ? null : s.sequence_id)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-zinc-50/60 transition-colors text-left"
              >
                <span className="size-6 rounded-full bg-zinc-100 flex items-center justify-center text-[11px] font-semibold text-zinc-500 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-zinc-800 truncate">{s.sequence_name}</span>
                    <ChannelBadge channel={s.channel} size="xs" />
                  </div>
                  <p className="text-[11px] text-zinc-400 truncate">{s.project_name} · used in {s.iterations} iter{s.iterations === 1 ? '' : 's'}</p>
                </div>
                <div className="flex items-center gap-4 text-xs shrink-0">
                  <Stat label="sent" value={s.leads_sent} />
                  <Stat label="replies" value={s.replies} />
                  <Stat label="meetings" value={s.meetings_booked} highlight={s.meetings_booked > 0} />
                </div>
                <ChevronDown
                  size={14}
                  className={`text-zinc-300 shrink-0 ml-1 transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
              </button>

              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden bg-zinc-50/40"
                  >
                    <div className="px-5 py-4 border-t border-zinc-50 space-y-3">
                      {s.steps.map((step, idx) => (
                        <div key={idx} className="flex gap-3">
                          <div className="flex flex-col items-center shrink-0 pt-0.5">
                            <div className="flex items-center justify-center size-5 rounded-full bg-zinc-200 text-[10px] font-semibold text-zinc-600">{idx + 1}</div>
                            {idx < s.steps.length - 1 && <div className="w-px flex-1 bg-zinc-200 mt-1" />}
                          </div>
                          <div className="flex-1 min-w-0 pb-2">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] uppercase tracking-wider font-semibold ${stepTypeColor(step.type)}`}>
                                {stepTypeLabel(step.type)}
                              </span>
                              <span className="text-[11px] text-zinc-400">Day {step.day}</span>
                            </div>
                            {step.subject && <p className="text-xs font-medium text-zinc-800 mb-1">{step.subject}</p>}
                            <p className="text-xs text-zinc-600 leading-relaxed whitespace-pre-wrap">{step.content}</p>
                          </div>
                        </div>
                      ))}
                      <div className="pt-2 border-t border-zinc-100">
                        <a
                          href={`/share/${s.share_token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-800 transition-colors"
                        >
                          <ExternalLink size={11} />
                          Open full sequence with version history
                        </a>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function stepTypeLabel(t: 'connection_note' | 'message' | 'email'): string {
  return t === 'connection_note' ? 'Connection' : t === 'email' ? 'Email' : 'Message'
}
function stepTypeColor(t: 'connection_note' | 'message' | 'email'): string {
  return t === 'connection_note' ? 'text-violet-600' : t === 'email' ? 'text-orange-600' : 'text-blue-600'
}

function Stat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="text-right">
      <p className={`text-sm font-semibold tabular-nums ${value === 0 ? 'text-zinc-300' : highlight ? 'text-emerald-700' : 'text-zinc-700'}`}>{value}</p>
      <p className="text-[10px] text-zinc-400 uppercase tracking-wide">{label}</p>
    </div>
  )
}

function TopAccountsCard({ accounts, unattributed }: { accounts: AccountLeaderboardRow[]; unattributed: number }) {
  if (accounts.length === 0 && unattributed === 0) return null
  const maxReplies = Math.max(1, ...accounts.map(a => a.replies))
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white overflow-hidden">
      <div className="px-5 py-3.5 border-b border-zinc-50">
        <p className="text-sm font-semibold text-zinc-900">Top LinkedIn accounts</p>
        <p className="text-xs text-zinc-400 mt-0.5">
          Ranked by meetings booked · counts only iterations with a single operator or an explicit per-account breakdown
        </p>
      </div>
      {unattributed > 0 && (
        <div className="px-5 py-2.5 border-b border-amber-100 bg-amber-50/50 text-xs text-amber-800 flex items-start gap-2">
          <span className="size-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
          <span>
            <span className="font-medium">{unattributed} iteration{unattributed === 1 ? '' : 's'}</span> ran from multiple accounts without a per-account breakdown — excluded from the leaderboard. Open the iteration&apos;s Stats tab and use <span className="font-medium">Split by account</span> to count them.
          </span>
        </div>
      )}
      {accounts.length === 0 && (
        <div className="px-5 py-8 text-center text-xs text-zinc-400">
          No attributable iterations yet.
        </div>
      )}
      <div className="divide-y divide-zinc-50">
        {accounts.map((a, i) => {
          const replyRate = a.leads_sent > 0 ? Math.round((a.replies / a.leads_sent) * 100) : null
          const acceptRate = a.leads_sent > 0 ? Math.round((a.connections_accepted / a.leads_sent) * 100) : null
          const widthPct = (a.replies / maxReplies) * 100
          return (
            <div key={a.account_id} className="px-5 py-3">
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="size-6 rounded-full bg-zinc-100 flex items-center justify-center text-[11px] font-semibold text-zinc-500 shrink-0">{i + 1}</span>
                  <UserCircle2 size={14} className="text-zinc-400 shrink-0" />
                  <span className={`text-sm truncate ${a.archived ? 'text-zinc-400 italic' : 'text-zinc-800'}`}>
                    {a.name}
                    {a.archived && <span className="text-[10px] uppercase tracking-wider text-zinc-400 ml-1.5">(archived)</span>}
                  </span>
                  {a.profile_url && (
                    <a
                      href={a.profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-300 hover:text-zinc-600 transition-colors shrink-0"
                      title="Open LinkedIn profile"
                    >
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
                <span className="flex items-baseline gap-3 text-xs shrink-0">
                  <span className="text-zinc-400 tabular-nums">{a.iterations} iter</span>
                  <span className="text-zinc-400 tabular-nums">{a.leads_sent} sent</span>
                  {acceptRate !== null && (
                    <span className="tabular-nums text-zinc-500" title="Accept rate">{acceptRate}% acc</span>
                  )}
                  <span className={`tabular-nums ${a.replies === 0 ? 'text-zinc-300' : 'text-zinc-700'}`}>{a.replies} replies</span>
                  {replyRate !== null && (
                    <span className={`tabular-nums font-semibold ${replyRate === 0 ? 'text-zinc-300' : 'text-zinc-700'}`}>{replyRate}%</span>
                  )}
                  {a.meetings_booked > 0 && (
                    <span className="tabular-nums font-semibold text-emerald-700">{a.meetings_booked} mtg</span>
                  )}
                </span>
              </div>
              <div className="h-1 bg-zinc-100 rounded-full overflow-hidden">
                <div className="h-full bg-zinc-800 rounded-full transition-all duration-500 ease-out" style={{ width: `${widthPct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TopGroupCard({
  title,
  subtitle,
  rows,
}: {
  title: string
  subtitle: string
  rows: Array<{ name: string; iterations: number; leads_sent: number; replies: number; meetings_booked: number }>
}) {
  if (rows.length === 0) return null
  const maxReplies = Math.max(1, ...rows.map(r => r.replies))
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white overflow-hidden">
      <div className="px-5 py-3.5 border-b border-zinc-50">
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>
      </div>
      <div className="divide-y divide-zinc-50">
        {rows.map(r => {
          const replyRate = r.leads_sent > 0 ? Math.round((r.replies / r.leads_sent) * 100) : null
          const widthPct = (r.replies / maxReplies) * 100
          return (
            <div key={r.name} className="px-5 py-3">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-sm text-zinc-800 truncate">{r.name}</span>
                <span className="flex items-baseline gap-3 text-xs shrink-0">
                  <span className="text-zinc-400 tabular-nums">{r.leads_sent} sent</span>
                  <span className={`tabular-nums ${r.replies === 0 ? 'text-zinc-300' : 'text-zinc-700'}`}>{r.replies} replies</span>
                  {replyRate !== null && (
                    <span className={`tabular-nums font-semibold ${replyRate === 0 ? 'text-zinc-300' : 'text-zinc-700'}`}>{replyRate}%</span>
                  )}
                  {r.meetings_booked > 0 && (
                    <span className="tabular-nums font-semibold text-emerald-700">{r.meetings_booked} mtg</span>
                  )}
                </span>
              </div>
              <div className="h-1 bg-zinc-100 rounded-full overflow-hidden">
                <div className="h-full bg-zinc-800 rounded-full transition-all duration-500 ease-out" style={{ width: `${widthPct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function filterStats(stats: ClientStats, selectedIds: string[]): ClientStats {
  const sel = new Set(selectedIds)
  if (sel.size === 0 || sel.size >= stats.by_project.length) return { ...stats, top_sequences: stats.top_sequences.slice(0, 5) }

  const filtered = stats.by_project.filter(p => sel.has(p.project_id))

  const linkedin: ClientStats['linkedin'] = { iterations: 0, iterations_with_stats: 0, leads_sent: 0, connections_accepted: 0, replies: 0, positive_replies: 0, meetings_booked: 0 }
  const email: ClientStats['email'] = { iterations: 0, iterations_with_stats: 0, leads_sent: 0, connections_accepted: 0, replies: 0, positive_replies: 0, meetings_booked: 0 }
  const status_counts = { draft: 0, running: 0, finished: 0, discarded: 0 }
  let launched_this_week = 0

  for (const p of filtered) {
    for (const k of Object.keys(linkedin) as (keyof typeof linkedin)[]) {
      linkedin[k] += p.linkedin[k]
      email[k] += p.email[k]
    }
    status_counts.draft += p.status_counts.draft
    status_counts.running += p.status_counts.running
    status_counts.finished += p.status_counts.finished
    status_counts.discarded += p.status_counts.discarded
    launched_this_week += p.launched_this_week
  }

  const top_sequences = stats.top_sequences
    .filter(s => sel.has(s.project_id))
    .slice(0, 5)

  const launch_cadence = {
    granularity: stats.launch_cadence.granularity,
    buckets: stats.launch_cadence.buckets.map(b => {
      const projects = b.projects.filter(p => sel.has(p.project_id))
      return { ...b, count: projects.length, projects }
    }),
  }

  // Merge per-project top_industries from filtered projects
  type IndAcc = { iterations: number; leads_sent: number; replies: number; meetings_booked: number }
  function mergeIndustries(channel: 'linkedin' | 'email') {
    const map = new Map<string, IndAcc>()
    for (const p of filtered) {
      for (const row of p.top_industries[channel]) {
        const acc = map.get(row.name) ?? { iterations: 0, leads_sent: 0, replies: 0, meetings_booked: 0 }
        acc.iterations += row.iterations; acc.leads_sent += row.leads_sent
        acc.replies += row.replies; acc.meetings_booked += row.meetings_booked
        map.set(row.name, acc)
      }
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => (b.iterations - a.iterations) || (b.meetings_booked - a.meetings_booked))
      .slice(0, 6)
  }
  const top_industries = { linkedin: mergeIndustries('linkedin'), email: mergeIndustries('email') }

  return {
    ...stats,
    linkedin, email,
    by_project: filtered,
    status_counts, launched_this_week,
    top_sequences, launch_cadence, top_industries,
  }
}

export function ClientStatsPanel({
  stats,
  range,
  allProjects,
  selectedProjectIds,
}: {
  stats: ClientStats
  range: { from: string | null; to: string | null }
  allProjects: Array<{ id: string; name: string }>
  selectedProjectIds: string[]
}) {
  const [isPending, startTransition] = useTransition()
  // [] from URL means "all" — expand to all IDs so local state is always explicit
  const expandIds = (ids: string[]) => ids.length === 0 ? allProjects.map(p => p.id) : ids
  const [localSelectedIds, setLocalSelectedIds] = useState<string[]>(() => expandIds(selectedProjectIds))

  // Reset local selection when server sends new stats (e.g. date range changed)
  useEffect(() => { setLocalSelectedIds(expandIds(selectedProjectIds)) }, [stats])

  const filteredStats = useMemo(
    () => filterStats(stats, localSelectedIds),
    [stats, localSelectedIds],
  )

  const totalIterations = filteredStats.linkedin.iterations + filteredStats.email.iterations
  const empty = totalIterations === 0
  const totalMeetings = filteredStats.linkedin.meetings_booked + filteredStats.email.meetings_booked

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-x-2 gap-y-3 flex-wrap">
        <DateRangePicker range={range} isPending={isPending} startTransition={startTransition} />
        <ProjectsPicker
          allProjects={allProjects}
          selectedIds={localSelectedIds}
          onChange={setLocalSelectedIds}
        />
      </div>
      <div className={`space-y-6 transition-opacity duration-150 ${isPending ? 'opacity-40 pointer-events-none' : ''}`}>
        {empty ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-2">
            <BarChart3 size={28} className="text-zinc-300" />
            <p className="text-sm">No campaign data yet</p>
            <p className="text-xs">Run iterations under projects to see aggregated stats here</p>
          </div>
        ) : (
          <>
            {/* Quick stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                label="Launched this week"
                value={filteredStats.launched_this_week}
                hint={`${filteredStats.status_counts.running} running · ${filteredStats.status_counts.finished} finished`}
              />
              <StatCard
                label="Total iterations"
                value={totalIterations}
                hint={`${filteredStats.status_counts.draft} draft · ${filteredStats.status_counts.discarded} discarded`}
              />
              <StatCard
                label="Total meetings"
                value={totalMeetings}
                hint={`${filteredStats.linkedin.meetings_booked} LI · ${filteredStats.email.meetings_booked} Email`}
              />
              <StatCard
                label="Total replies"
                value={filteredStats.linkedin.replies + filteredStats.email.replies}
                hint={`${filteredStats.linkedin.positive_replies + filteredStats.email.positive_replies} positive`}
              />
            </div>

            {/* Weekly launches */}
            <WeeklyChart cadence={filteredStats.launch_cadence} />

            {/* Channel sub-tabs */}
            <ChannelReport stats={filteredStats} />
          </>
        )}
      </div>
    </div>
  )
}

function ChannelReport({ stats }: { stats: ClientStats }) {
  const [channel, setChannel] = useState<IterationChannel>(
    stats.linkedin.iterations >= stats.email.iterations ? 'linkedin' : 'email',
  )

  const sub = [
    { key: 'linkedin' as const, label: 'LinkedIn', count: stats.linkedin.iterations },
    { key: 'email' as const, label: 'Email', count: stats.email.iterations },
  ]

  const totals = stats[channel]
  const steps = channel === 'linkedin' ? LI_FUNNEL : EMAIL_FUNNEL
  const sequences = stats.top_sequences.filter(s => s.channel === channel)
  const industries = stats.top_industries[channel]

  return (
    <div className="space-y-4">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 border-b border-zinc-100">
        {sub.map(t => {
          const active = channel === t.key
          return (
            <button
              key={t.key}
              onClick={() => setChannel(t.key)}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                active ? 'text-zinc-900' : 'text-zinc-400 hover:text-zinc-600'
              }`}
            >
              {t.key === 'linkedin' ? <ChannelIcon channel="linkedin" size={13} /> : <Mail size={13} />}
              {t.label}
              <span className={`text-[11px] tabular-nums ${active ? 'text-zinc-400' : 'text-zinc-300'}`}>{t.count}</span>
              {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-zinc-900" />}
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={channel}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-4"
        >
      {/* Funnel */}
      <Funnel totals={totals} steps={steps} channel={channel} />

      {/* Top sequences — channel-filtered, full width with expandable rows */}
      <TopSequencesCard sequences={sequences} />

      {/* Top LinkedIn accounts — only for the LinkedIn sub-tab */}
      {channel === 'linkedin' && (
        <TopAccountsCard
          accounts={stats.top_linkedin_accounts}
          unattributed={stats.linkedin_unattributed_iterations}
        />
      )}

      {/* Industries for this channel */}
      {industries.length > 0 && (
        <TopGroupCard
          title="Top industries"
          subtitle={`Iterations targeting each industry · ${channel === 'linkedin' ? 'LinkedIn' : 'Email'} only`}
          rows={industries}
        />
      )}

      {/* By project — only this channel */}
      {stats.by_project.length > 0 && (
        <div className="rounded-2xl border border-zinc-100 bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-zinc-50">
            <p className="text-sm font-semibold text-zinc-900">By project</p>
            <p className="text-xs text-zinc-400 mt-0.5">{channel === 'linkedin' ? 'LinkedIn' : 'Email'} stats per project</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50/50 border-b border-zinc-50">
                  <th className="text-left px-5 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wide">Project</th>
                  <th className="text-right px-3 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wide">Iterations</th>
                  <th className="text-right px-3 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wide">Sent</th>
                  {channel === 'linkedin' && (
                    <th className="text-right px-3 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wide">Accepted</th>
                  )}
                  <th className="text-right px-3 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wide">Replies</th>
                  <th className="text-right px-3 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wide">Positive</th>
                  <th className="text-right px-5 py-2.5 text-[11px] font-medium text-emerald-600 uppercase tracking-wide">Meetings</th>
                </tr>
              </thead>
              <tbody>
                {stats.by_project
                  .filter(p => p[channel].iterations > 0)
                  .map(p => {
                    const t = p[channel]
                    const muted = (n: number) => n === 0 ? 'text-zinc-300' : 'text-zinc-700'
                    return (
                      <tr key={p.project_id} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/60 transition-colors">
                        <td className="px-5 py-3 text-zinc-800 font-medium">{p.project_name}</td>
                        <td className={`px-3 py-3 text-right tabular-nums ${muted(t.iterations)}`}>{t.iterations || '—'}</td>
                        <td className={`px-3 py-3 text-right tabular-nums ${muted(t.leads_sent)}`}>{t.leads_sent || '—'}</td>
                        {channel === 'linkedin' && (
                          <td className={`px-3 py-3 text-right tabular-nums ${muted(t.connections_accepted)}`}>{t.connections_accepted || '—'}</td>
                        )}
                        <td className={`px-3 py-3 text-right tabular-nums ${muted(t.replies)}`}>{t.replies || '—'}</td>
                        <td className={`px-3 py-3 text-right tabular-nums ${muted(t.positive_replies)}`}>{t.positive_replies || '—'}</td>
                        <td className={`px-5 py-3 text-right tabular-nums font-semibold ${t.meetings_booked ? 'text-emerald-700' : 'text-zinc-300'}`}>{t.meetings_booked || '—'}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function DateRangePicker({
  range,
  isPending,
  startTransition,
}: {
  range: { from: string | null; to: string | null }
  isPending: boolean
  startTransition: (fn: () => void) => void
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pending = isPending
  const [open, setOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState(range.from ?? '')
  const [draftTo, setDraftTo] = useState(range.to ?? '')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setDraftFrom(range.from ?? ''); setDraftTo(range.to ?? '') }, [range.from, range.to])

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  function applyRange(from: string | null, to: string | null) {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    if (from) params.set('from', from); else params.delete('from')
    if (to) params.set('to', to); else params.delete('to')
    startTransition(() => {
      router.push(`?${params.toString()}`, { scroll: false })
    })
    setOpen(false)
  }

  function applyPreset(days: number) {
    const to = new Date()
    const from = new Date()
    from.setDate(to.getDate() - days)
    applyRange(from.toISOString().slice(0, 10), to.toISOString().slice(0, 10))
  }

  function clearRange() { applyRange(null, null) }

  function fmt(iso: string | null) {
    if (!iso) return null
    return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const label = range.from || range.to
    ? `${fmt(range.from) ?? '…'} – ${fmt(range.to) ?? '…'}`
    : 'All time'

  return (
    <div className="flex items-center gap-2 flex-wrap" ref={ref}>
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          disabled={pending}
          className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50"
        >
          {label}
        </button>
        {open && (
          <div className="absolute left-0 top-full mt-1.5 z-30 w-72 rounded-xl border border-zinc-100 bg-white shadow-lg p-3 space-y-3">
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: '7 days', days: 7 },
                { label: '30 days', days: 30 },
                { label: '90 days', days: 90 },
                { label: '12 months', days: 365 },
              ].map(p => (
                <button
                  key={p.days}
                  onClick={() => applyPreset(p.days)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 border border-zinc-100 transition-colors"
                >
                  Last {p.label}
                </button>
              ))}
            </div>
            <div className="border-t border-zinc-100 pt-3 space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-zinc-400 w-8">From</label>
                <input
                  type="date"
                  value={draftFrom}
                  onChange={e => setDraftFrom(e.target.value)}
                  className="flex-1 text-xs px-2.5 py-1.5 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-zinc-400 w-8">To</label>
                <input
                  type="date"
                  value={draftTo}
                  onChange={e => setDraftTo(e.target.value)}
                  className="flex-1 text-xs px-2.5 py-1.5 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400"
                />
              </div>
              <button
                onClick={() => applyRange(draftFrom || null, draftTo || null)}
                className="w-full rounded-lg bg-zinc-900 text-white text-xs font-medium py-1.5 hover:bg-zinc-700 transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>
      {(range.from || range.to) && (
        <button
          onClick={clearRange}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          <X size={12} />
          Clear
        </button>
      )}
    </div>
  )
}

function ProjectsPicker({
  allProjects,
  selectedIds,
  onChange,
}: {
  allProjects: Array<{ id: string; name: string }>
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  function toggle(id: string) {
    const set = new Set(selectedIds)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    onChange(Array.from(set))
  }

  function selectAll() { onChange(allProjects.map(p => p.id)) }

  const allSelected = selectedIds.length === allProjects.length
  const label = allSelected
    ? `All projects (${allProjects.length})`
    : selectedIds.length === 1
      ? allProjects.find(p => p.id === selectedIds[0])?.name ?? '1 project'
      : selectedIds.length === 0
        ? 'No projects'
        : `${selectedIds.length} projects`

  return (
    <div className="flex items-center gap-2 flex-wrap" ref={ref}>
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors max-w-[280px] truncate"
        >
          {label}
        </button>
        {open && (
          <div className="absolute left-0 top-full mt-1.5 z-30 w-72 rounded-xl border border-zinc-100 bg-white shadow-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-zinc-100 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-widest text-zinc-400 font-medium">Filter</span>
              {!allSelected && (
                <button
                  onClick={selectAll}
                  className="text-[11px] text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  Select all
                </button>
              )}
              {allSelected && <span className="text-[11px] text-zinc-400">All selected</span>}
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {allProjects.length === 0 ? (
                <p className="px-3 py-3 text-xs text-zinc-400">No projects yet</p>
              ) : allProjects.map(p => {
                const checked = selectedIds.includes(p.id)
                return (
                  <label key={p.id} className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(p.id)}
                      className="size-3.5 rounded accent-zinc-900 cursor-pointer"
                    />
                    <span className="truncate">{p.name}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )}
      </div>
      {!allSelected && selectedIds.length > 0 && (
        <button
          onClick={selectAll}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          <X size={12} />
          Reset
        </button>
      )}
    </div>
  )
}

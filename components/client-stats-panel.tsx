'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, BarChart3, X, ExternalLink, ChevronDown } from 'lucide-react'
import type { ClientStats, ChannelTotals, IterationChannel } from '@/app/actions/iterations'
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

function formatWeek(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
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
  const accent =
    channel === 'linkedin'
      ? { bar: 'bg-blue-500', barSoft: 'bg-blue-100', text: 'text-blue-700', ring: 'ring-blue-100' }
      : { bar: 'bg-orange-500', barSoft: 'bg-orange-100', text: 'text-orange-700', ring: 'ring-orange-100' }

  const noData = totals.iterations_with_stats === 0

  return (
    <div className={`rounded-2xl border border-zinc-100 bg-white p-5 ring-1 ${accent.ring}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={accent.text}>
          {channel === 'linkedin' ? <ChannelIcon channel="linkedin" size={14} /> : <Mail size={14} />}
        </span>
        <p className={`text-xs uppercase tracking-widest font-semibold ${accent.text}`}>{channel === 'linkedin' ? 'LinkedIn' : 'Email'}</p>
      </div>
      <p className="text-xs text-zinc-400">
        {totals.iterations} iteration{totals.iterations === 1 ? '' : 's'}
        {totals.iterations_with_stats < totals.iterations && ` · ${totals.iterations_with_stats} with stats`}
      </p>

      {noData ? (
        <div className="mt-6 flex flex-col items-center justify-center py-10 text-zinc-300">
          <BarChart3 size={20} />
          <p className="text-xs mt-2">No stats uploaded</p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {steps.map((s, i) => {
            const value = totals[s.key] as number
            const widthPct = top > 0 ? Math.max(2, (value / top) * 100) : 0
            const prev = i > 0 ? (totals[steps[i - 1].key] as number) : null
            return (
              <div key={s.key}>
                <div className="flex items-baseline justify-between text-xs mb-1">
                  <span className="text-zinc-500">{s.label}</span>
                  <span className="flex items-baseline gap-2">
                    {prev !== null && (
                      <span className="text-[10px] text-zinc-300 tabular-nums">{pct(value, prev)}</span>
                    )}
                    <span className="text-sm font-semibold text-zinc-900 tabular-nums">{value}</span>
                  </span>
                </div>
                <div className={`h-1.5 ${accent.barSoft} rounded-full overflow-hidden`}>
                  <div
                    className={`h-full ${accent.bar} rounded-full transition-all duration-500 ease-out`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>
            )
          })}
          <div className="pt-2 mt-2 border-t border-zinc-50 flex items-baseline justify-between text-[11px] text-zinc-400">
            <span>Overall conversion to meeting</span>
            <span className="tabular-nums font-medium text-zinc-700">
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

function WeeklyChart({ weekly }: { weekly: ClientStats['weekly_launches'] }) {
  const max = Math.max(1, ...weekly.map(w => w.count))
  const total = weekly.reduce((s, w) => s + w.count, 0)
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Launch cadence</p>
          <p className="text-xs text-zinc-400 mt-0.5">Iterations started per week · last 8 weeks</p>
        </div>
        <span className="text-xs text-zinc-400 tabular-nums">{total} total</span>
      </div>
      <div className="flex items-end gap-1.5 h-24">
        {weekly.map(w => {
          const h = Math.max(2, (w.count / max) * 100)
          return (
            <div key={w.week_start} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="flex-1 w-full flex items-end">
                <div
                  className={`w-full rounded-md transition-all duration-500 ease-out ${w.count > 0 ? 'bg-zinc-800' : 'bg-zinc-100'}`}
                  style={{ height: `${h}%` }}
                  title={`${w.count} iteration${w.count === 1 ? '' : 's'}`}
                />
              </div>
              <span className="text-[10px] text-zinc-400 tabular-nums">{formatWeek(w.week_start)}</span>
              <span className="text-[10px] text-zinc-700 font-semibold tabular-nums">{w.count > 0 ? w.count : ''}</span>
            </div>
          )
        })}
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

function TopGroupCard({
  title,
  subtitle,
  rows,
}: {
  title: string
  subtitle: string
  rows: Array<{ name: string; iterations: number; replies: number; meetings_booked: number }>
}) {
  if (rows.length === 0) return null
  const maxIter = Math.max(1, ...rows.map(r => r.iterations))
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white overflow-hidden">
      <div className="px-5 py-3.5 border-b border-zinc-50">
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>
      </div>
      <div className="divide-y divide-zinc-50">
        {rows.map(r => {
          const widthPct = (r.iterations / maxIter) * 100
          return (
            <div key={r.name} className="px-5 py-3">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-sm text-zinc-800 truncate">{r.name}</span>
                <span className="flex items-baseline gap-3 text-xs shrink-0">
                  <span className="text-zinc-400 tabular-nums">{r.iterations} iter</span>
                  <span className={`tabular-nums ${r.replies === 0 ? 'text-zinc-300' : 'text-zinc-700'}`}>{r.replies} replies</span>
                  <span className={`tabular-nums font-semibold ${r.meetings_booked === 0 ? 'text-zinc-300' : 'text-emerald-700'}`}>{r.meetings_booked}</span>
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
  const totalIterations = stats.linkedin.iterations + stats.email.iterations
  const empty = totalIterations === 0
  const totalMeetings = stats.linkedin.meetings_booked + stats.email.meetings_booked

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-x-2 gap-y-3 flex-wrap">
        <DateRangePicker range={range} />
        <ProjectsPicker allProjects={allProjects} selectedIds={selectedProjectIds} />
      </div>
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
              value={stats.launched_this_week}
              hint={`${stats.status_counts.running} running · ${stats.status_counts.finished} finished`}
            />
            <StatCard
              label="Total iterations"
              value={totalIterations}
              hint={`${stats.status_counts.draft} draft · ${stats.status_counts.discarded} discarded`}
            />
            <StatCard
              label="Total meetings"
              value={totalMeetings}
              hint={`${stats.linkedin.meetings_booked} LI · ${stats.email.meetings_booked} Email`}
            />
            <StatCard
              label="Total replies"
              value={stats.linkedin.replies + stats.email.replies}
              hint={`${stats.linkedin.positive_replies + stats.email.positive_replies} positive`}
            />
          </div>

          {/* Weekly launches */}
          <WeeklyChart weekly={stats.weekly_launches} />

          {/* Channel sub-tabs */}
          <ChannelReport stats={stats} />
        </>
      )}
    </div>
  )
}

function ChannelReport({ stats }: { stats: ClientStats }) {
  const [channel, setChannel] = useState<IterationChannel>(
    stats.linkedin.iterations >= stats.email.iterations ? 'linkedin' : 'email',
  )

  const sub = [
    { key: 'linkedin' as const, label: 'LinkedIn', count: stats.linkedin.iterations, accent: 'text-blue-700', under: 'bg-blue-500' },
    { key: 'email' as const, label: 'Email', count: stats.email.iterations, accent: 'text-orange-700', under: 'bg-orange-500' },
  ]

  const totals = stats[channel]
  const steps = channel === 'linkedin' ? LI_FUNNEL : EMAIL_FUNNEL
  const sequences = stats.top_sequences.filter(s => s.channel === channel)
  const industries = stats.top_industries[channel]
  const roles = stats.top_roles[channel]

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
                active ? t.accent : 'text-zinc-400 hover:text-zinc-600'
              }`}
            >
              {t.key === 'linkedin' ? <ChannelIcon channel="linkedin" size={13} /> : <Mail size={13} />}
              {t.label}
              <span className={`text-[11px] tabular-nums ${active ? 'text-zinc-400' : 'text-zinc-300'}`}>{t.count}</span>
              {active && <span className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-full ${t.under}`} />}
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

      {/* Industries + roles for this channel */}
      {(industries.length > 0 || roles.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TopGroupCard
            title="Top industries"
            subtitle={`Iterations targeting each industry · ${channel === 'linkedin' ? 'LinkedIn' : 'Email'} only`}
            rows={industries}
          />
          <TopGroupCard
            title="Top ICP roles"
            subtitle={`Iterations targeting each role · ${channel === 'linkedin' ? 'LinkedIn' : 'Email'} only`}
            rows={roles}
          />
        </div>
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

function DateRangePicker({ range }: { range: { from: string | null; to: string | null } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
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
}: {
  allProjects: Array<{ id: string; name: string }>
  selectedIds: string[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  function applyIds(ids: string[]) {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    if (ids.length > 0) params.set('projects', ids.join(','))
    else params.delete('projects')
    startTransition(() => {
      router.push(`?${params.toString()}`, { scroll: false })
    })
  }

  function toggle(id: string) {
    const set = new Set(selectedIds)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    applyIds(Array.from(set))
  }

  function clearAll() { applyIds([]) }

  const allSelected = selectedIds.length === 0 || selectedIds.length === allProjects.length
  const label = allSelected
    ? `All projects (${allProjects.length})`
    : selectedIds.length === 1
      ? allProjects.find(p => p.id === selectedIds[0])?.name ?? '1 project'
      : `${selectedIds.length} projects`

  return (
    <div className="flex items-center gap-2 flex-wrap" ref={ref}>
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          disabled={pending}
          className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50 max-w-[280px] truncate"
        >
          {label}
        </button>
        {open && (
          <div className="absolute left-0 top-full mt-1.5 z-30 w-72 rounded-xl border border-zinc-100 bg-white shadow-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-zinc-100 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-widest text-zinc-400 font-medium">Filter</span>
              <button
                onClick={clearAll}
                className="text-[11px] text-zinc-400 hover:text-zinc-700 transition-colors"
              >
                {selectedIds.length === 0 ? 'All selected' : 'Select all'}
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {allProjects.length === 0 ? (
                <p className="px-3 py-3 text-xs text-zinc-400">No projects yet</p>
              ) : allProjects.map(p => {
                const checked = selectedIds.length === 0 || selectedIds.includes(p.id)
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
      {selectedIds.length > 0 && selectedIds.length < allProjects.length && (
        <button
          onClick={clearAll}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          <X size={12} />
          Clear
        </button>
      )}
    </div>
  )
}

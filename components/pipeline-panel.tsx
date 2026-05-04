'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, SlidersHorizontal, Radar, Globe, ListChecks, Users, Play, Check, X, ChevronDown, RotateCcw, Plus, Search as SearchIcon } from 'lucide-react'
import { scaleIn, springGentle } from '@/lib/animations'
import { renderArtifact } from './pipeline-artifacts'
import { getRun } from '@/app/actions/pipeline'

const STEPS = [
  { id: 'generate_filters', label: 'Generate Filters',   sub: 'Apollo search parameters',  Icon: SlidersHorizontal, stage: 'companies' },
  { id: 'apollo_search',    label: 'Apollo Search',      sub: 'Company discovery',         Icon: Radar,             stage: 'companies' },
  { id: 'scrape',           label: 'Scrape Websites',    sub: 'Enrich with website text',  Icon: Globe,             stage: 'companies' },
  { id: 'classify',         label: 'Classify Companies', sub: 'Qualify / reject',          Icon: ListChecks,        stage: 'companies' },
  { id: 'extract_people',   label: 'Extract People',     sub: 'Decision makers',           Icon: Users,             stage: 'people' },
] as const

const STAGES = [
  { id: 'companies', label: 'Find Companies', sub: 'Discover · scrape · qualify', Icon: Radar },
  { id: 'people',    label: 'Extract People', sub: 'Enrich decision makers',      Icon: Users },
] as const

type StepId = typeof STEPS[number]['id']

const ROUND_STEPS: StepId[] = ['apollo_search', 'scrape', 'classify', 'extract_people']

const STEP_DURATION_EST: Record<StepId, number> = {
  generate_filters: 8,
  apollo_search:    20,
  scrape:           12,
  classify:         30,
  extract_people:   20,
}

type StepState = { status: 'idle' | 'running' | 'done' | 'error'; artifact?: unknown; error?: string }
type Company = { domain: string; name: string }

// ─── Step progress bar ────────────────────────────────────────────────────────

function StepProgress({ startedAt, estimatedSeconds }: { startedAt: number; estimatedSeconds: number }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500)
    return () => clearInterval(t)
  }, [startedAt])
  const pct = Math.min(95, (elapsed / estimatedSeconds) * 100)
  const remaining = Math.max(0, estimatedSeconds - elapsed)
  return (
    <div className="mt-1.5 space-y-1">
      <div className="h-1 bg-blue-100 rounded-full overflow-hidden">
        <motion.div className="h-full bg-blue-400 rounded-full" animate={{ width: `${pct}%` }} transition={{ duration: 0.5, ease: 'linear' }} />
      </div>
      <p className="text-[10px] text-blue-400">{remaining > 0 ? `~${remaining}s remaining` : `${elapsed}s (finishing up…)`}</p>
    </div>
  )
}

// ─── Step summary ─────────────────────────────────────────────────────────────

function stepSummary(id: StepId, artifact: unknown): string {
  const a = artifact as Record<string, unknown>
  switch (id) {
    case 'generate_filters': return `${(a.keywords as string[] ?? []).length} keywords`
    case 'apollo_search':    return `${a.companies_found ?? 0} companies found`
    case 'scrape':           return `${a.ok ?? 0} scraped · ${(a.total as number ?? 0) - (a.scraped as number ?? 0)} Apollo-only`
    case 'classify':         return `${a.targets ?? 0} targets · ${a.pre_filtered ?? 0} pre-filtered`
    case 'extract_people': {
      const prog = a.domains_total ? ` · ${a.domains_processed}/${a.domains_total} domains` : ''
      return `${a.total ?? 0} contacts${prog}`
    }
    default: return 'Done'
  }
}

// ─── Load More Panel ──────────────────────────────────────────────────────────

function LoadMorePanel({
  allCompanies,
  prospectedDomains,
  totalContacts,
  running,
  lastLoadResult,
  apolloKeywordHits,
  inline = false,
  onLoadMore,
  onLoadUntilKpi,
  onNewRound,
}: {
  allCompanies: Company[]
  prospectedDomains: Set<string>
  totalContacts: number
  running: boolean
  lastLoadResult: { count: number; domains: number } | null
  apolloKeywordHits: Record<string, number>
  inline?: boolean
  onLoadMore: (domains: string[]) => void
  onLoadUntilKpi: (target: number) => void
  onNewRound: (keywords: string[]) => void
}) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [showFindMore, setShowFindMore] = useState(false)
  const [keywords, setKeywords] = useState(() => Object.keys(apolloKeywordHits))
  const [customKw, setCustomKw] = useState('')
  const [kpiTarget, setKpiTarget] = useState(200)

  const remaining = allCompanies.filter(c => !prospectedDomains.has(c.domain))
  const filtered = query
    ? remaining.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.domain.toLowerCase().includes(query.toLowerCase())
      )
    : remaining
  const included = filtered.filter(c => !excluded.has(c.domain))
  const nextBatch = included.slice(0, 25)

  // Credit estimates: 1 credit per enriched contact via bulk_match
  const avgPerDomain = prospectedDomains.size > 0 ? totalContacts / prospectedDomains.size : 2
  const batchCredits = Math.ceil(nextBatch.length * avgPerDomain)
  const kpiNeeded = Math.max(0, kpiTarget - totalContacts)
  const kpiDomains = avgPerDomain > 0 ? Math.ceil(kpiNeeded / avgPerDomain) : remaining.length
  // Until KPI: credits = contacts still needed (bulk_match only enriches what's required)
  const kpiCredits = kpiNeeded

  function toggleExclude(domain: string) {
    setExcluded(prev => { const n = new Set(prev); n.has(domain) ? n.delete(domain) : n.add(domain); return n })
  }

  function addKeyword(kw: string) {
    const t = kw.trim()
    if (!t || keywords.some(k => k.toLowerCase() === t.toLowerCase())) return
    setKeywords(prev => [...prev, t])
  }

  const inner = (
    <>
      {/* Header */}
      {!inline && (
        <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-zinc-800">Load More Contacts</p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {prospectedDomains.size} / {allCompanies.length} companies searched · {totalContacts} contacts found
            </p>
          </div>
          <div className="h-1.5 w-28 bg-zinc-100 rounded-full overflow-hidden shrink-0">
            <div
              className="h-full bg-zinc-900 rounded-full transition-all"
              style={{ width: `${(prospectedDomains.size / Math.max(allCompanies.length, 1)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {inline && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-zinc-400">
            {prospectedDomains.size} / {allCompanies.length} companies searched
          </p>
          <div className="h-1 w-24 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-400 rounded-full transition-all"
              style={{ width: `${(prospectedDomains.size / Math.max(allCompanies.length, 1)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {remaining.length === 0 ? (
        <div className={`${inline ? '' : 'px-4 py-8'} text-center`}>
          <p className="text-sm text-zinc-500">All {allCompanies.length} companies searched</p>
          <p className="text-xs text-zinc-400 mt-1">{totalContacts} contacts found total</p>
        </div>
      ) : (
        <div className={`${inline ? '' : 'p-4'} space-y-3`}>
          {/* Search */}
          <div className="relative">
            <SearchIcon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Filter companies…"
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          {/* Select/deselect all */}
          <div className="flex items-center justify-between text-[10px] text-zinc-400 px-1">
            <span>{included.length} of {filtered.length} selected</span>
            <div className="flex gap-2">
              <button onClick={() => setExcluded(new Set())} className="hover:text-zinc-600 transition-colors">Select all</button>
              <span>·</span>
              <button onClick={() => setExcluded(new Set(filtered.map(c => c.domain)))} className="hover:text-zinc-600 transition-colors">Deselect all</button>
            </div>
          </div>

          {/* Company list */}
          <div className="space-y-0.5 max-h-56 overflow-y-auto pr-1">
            {filtered.map(c => (
              <label key={c.domain} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-zinc-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!excluded.has(c.domain)}
                  onChange={() => toggleExclude(c.domain)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-0 shrink-0"
                />
                <span className="flex-1 text-xs text-zinc-700 font-medium truncate">{c.name}</span>
                <span className="text-[10px] text-zinc-400 font-mono shrink-0">{c.domain}</span>
              </label>
            ))}
          </div>

          {/* Load buttons */}
          <div className="pt-1 space-y-1.5">
            {lastLoadResult && !running && (
              <p className="text-xs text-green-600 mb-2">✓ +{lastLoadResult.count} contacts from {lastLoadResult.domains} companies</p>
            )}

            <div className="flex items-center justify-end gap-3 flex-wrap">
              {/* Single batch */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onLoadMore(nextBatch.map(c => c.domain))}
                  disabled={running || nextBatch.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                >
                  {running
                    ? <><span className="size-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Loading…</>
                    : <><Users size={11} /> Load next {nextBatch.length}</>}
                </button>
                <span className="text-[11px] text-zinc-400 shrink-0">~{batchCredits} people · ~{batchCredits} cr</span>
              </div>

              <span className="text-zinc-200 text-xs">|</span>

              {/* Load until KPI */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onLoadUntilKpi(kpiTarget)}
                  disabled={running || remaining.length === 0 || kpiNeeded <= 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 text-xs font-medium text-white hover:bg-orange-400 disabled:opacity-50 transition-colors"
                >
                  <Users size={11} />
                  Until
                </button>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={kpiTarget}
                    onChange={e => setKpiTarget(Math.max(1, Number(e.target.value)))}
                    className="w-14 text-xs px-2 py-1.5 border border-zinc-200 rounded-lg text-center focus:outline-none focus:border-zinc-400"
                    min={1}
                  />
                  <span className="text-[11px] text-zinc-400">people</span>
                </div>
                <span className="text-[11px] text-zinc-400 shrink-0">
                  {kpiNeeded <= 0 ? '✓ met' : `~${kpiCredits} cr`}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Find more companies */}
      <div className="border-t border-zinc-100">
        <button
          onClick={() => setShowFindMore(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-50 transition-colors"
        >
          <span className="text-xs font-medium text-zinc-600">Find more companies</span>
          <ChevronDown size={13} className={`text-zinc-400 transition-transform ${showFindMore ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence initial={false}>
          {showFindMore && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
              transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="px-4 pb-4 space-y-3">
                <p className="text-[10px] text-zinc-400">Edit keywords and run a new Apollo search — new companies will be appended</p>

                {/* Active keywords */}
                <div className="flex flex-wrap gap-1.5">
                  {keywords.map(kw => (
                    <span key={kw} className="inline-flex items-center gap-1.5 text-xs bg-zinc-100 text-zinc-700 rounded-full pl-2.5 pr-1.5 py-1">
                      {kw}
                      <button
                        onClick={() => setKeywords(prev => prev.filter(k => k !== kw))}
                        className="size-3.5 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 transition-colors"
                      >
                        <X size={9} />
                      </button>
                    </span>
                  ))}
                </div>

                {/* Add keyword */}
                <div className="flex gap-2">
                  <input
                    value={customKw}
                    onChange={e => setCustomKw(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { addKeyword(customKw); setCustomKw('') } }}
                    placeholder="Add keyword…"
                    className="flex-1 text-xs px-3 py-1.5 border border-zinc-200 rounded-lg outline-none focus:border-zinc-400 placeholder:text-zinc-300"
                  />
                  <button
                    onClick={() => { addKeyword(customKw); setCustomKw('') }}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition-colors text-zinc-600"
                  >
                    <Plus size={11} /> Add
                  </button>
                </div>

                <button
                  onClick={() => onNewRound(keywords)}
                  disabled={keywords.length === 0}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-900 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                >
                  <Radar size={11} />
                  Search with updated keywords
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )

  if (inline) return <div className="space-y-3">{inner}</div>

  return (
    <motion.div variants={scaleIn} initial="hidden" animate="show" transition={springGentle}
      className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      {inner}
    </motion.div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PipelinePanel({
  projectId, iterationId, icp, latestRunId, onRunCreated, onDone,
}: {
  projectId: string
  iterationId: string
  icp?: Record<string, unknown> | null
  latestRunId?: string | null
  onRunCreated?: (runId: string) => void
  onDone?: () => void
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [runId, setRunId] = useState<string | null>(null)
  const [states, setStates] = useState<Partial<Record<StepId, StepState>>>({})
  const [expanded, setExpanded] = useState<Set<StepId>>(new Set())
  const [loading, setLoading] = useState(false)
  const [pipelineStarted, setPipelineStarted] = useState(false)
  const [startTimes, setStartTimes] = useState<Partial<Record<StepId, number>>>({})
  const [totalContacts, setTotalContacts] = useState(0)
  const [seenDomains, setSeenDomains] = useState<string[]>([])
  const [prospectedDomains, setProspectedDomains] = useState<Set<string>>(new Set())
  const [loadMoreRunning, setLoadMoreRunning] = useState(false)
  const [lastLoadResult, setLastLoadResult] = useState<{ count: number; domains: number } | null>(null)

  // Resume from URL or auto-pick the latest project run
  useEffect(() => {
    const urlRunId = searchParams.get('runId') ?? latestRunId
    if (!urlRunId) return
    setLoading(true)
    getRun(urlRunId).then(run => {
      if (!run) return
      setRunId(urlRunId)
      const newStates: Partial<Record<StepId, StepState>> = {}
      for (const step of run.steps) {
        newStates[step.name as StepId] = { status: step.status, artifact: step.artifact }
      }
      setStates(newStates)
      const last = run.steps.at(-1)
      if (last) setExpanded(new Set([last.name as StepId]))
      setPipelineStarted(true)
      const peopleStep = run.steps.find(s => s.name === 'extract_people')
      if (peopleStep) {
        const a = peopleStep.artifact as Record<string, unknown>
        setTotalContacts((a?.total as number) ?? 0)
        const classifyStep = run.steps.find(s => s.name === 'classify')
        if (classifyStep && a?.domains_processed) {
          const results = (classifyStep.artifact as Record<string, unknown>)?.results as Array<{ domain: string; is_target: boolean }> ?? []
          const allTargets = results.filter(r => r.is_target).map(r => r.domain)
          setProspectedDomains(new Set(allTargets.slice(0, a.domains_processed as number)))
        }
      }
    }).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const completedIds = STEPS.filter(s => states[s.id]?.status === 'done').map(s => s.id)
  const nextStep = STEPS.find(s => !completedIds.includes(s.id))?.id ?? null
  const allDone = completedIds.length === STEPS.length
  const hasStarted = Object.keys(states).length > 0

  function toggleExpand(id: StepId) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function setUrl(id: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (id) { params.set('runId', id) } else { params.delete('runId') }
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  async function runStep(stepId: StepId, opts: { page?: number; seenDomains?: string[]; domainsOverride?: string[] } = {}) {
    setStartTimes(prev => ({ ...prev, [stepId]: Date.now() }))
    setStates(prev => ({ ...prev, [stepId]: { status: 'running' } }))
    try {
      const res = await fetch('/api/pipeline/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId, iterationId, step: stepId, runId,
          page: opts.page ?? 1,
          seenDomains: opts.seenDomains ?? [],
          domainsOverride: opts.domainsOverride,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Step failed')

      if (!runId && data.runId) {
        setRunId(data.runId)
        setUrl(data.runId)
        onRunCreated?.(data.runId)
      }

      setStates(prev => ({ ...prev, [stepId]: { status: 'done', artifact: data.artifact } }))
      setExpanded(prev => new Set([...prev, stepId]))

      if (stepId === 'extract_people') {
        const newContacts = data.contactsTotal as number ?? (data.artifact as Record<string, unknown>)?.total as number ?? 0
        setTotalContacts(newContacts)

        if (opts.domainsOverride?.length) {
          setProspectedDomains(prev => new Set([...prev, ...opts.domainsOverride!]))
        } else {
          // First run — mark offset-based slice as prospected
          const classifyResults = (states['classify']?.artifact as Record<string, unknown>)?.results as Array<{ domain: string; is_target: boolean }> ?? []
          const allTargets = classifyResults.filter(r => r.is_target).map(r => r.domain)
          const processed = (data.artifact as Record<string, unknown>)?.domains_processed as number ?? 25
          setProspectedDomains(prev => new Set([...prev, ...allTargets.slice(0, processed)]))
        }

        const apolloArtifact = states['apollo_search']?.artifact as Record<string, unknown> | undefined
        const newDomains = (apolloArtifact?.companies as Array<{ domain: string }> ?? []).map(c => c.domain)
        setSeenDomains(prev => [...new Set([...prev, ...newDomains])])
        if (newContacts > 0) onDone?.()
      }
    } catch (err) {
      setStates(prev => ({ ...prev, [stepId]: { status: 'error', error: String(err) } }))
    }
  }

  async function fetchPeopleBatch(domains: string[]): Promise<number> {
    const res = await fetch('/api/pipeline/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, iterationId, step: 'extract_people', runId, seenDomains, domainsOverride: domains }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Step failed')
    return data.contactsTotal as number ?? 0
  }

  async function handleLoadMore(domains: string[]) {
    setLoadMoreRunning(true)
    setLastLoadResult(null)
    try {
      const newTotal = await fetchPeopleBatch(domains)
      setTotalContacts(newTotal)
      setProspectedDomains(prev => new Set([...prev, ...domains]))
      setLastLoadResult({ count: newTotal, domains: domains.length })
      if (newTotal > 0) onDone?.()
    } finally {
      setLoadMoreRunning(false)
    }
  }

  async function handleLoadUntilKpi(target: number) {
    setLoadMoreRunning(true)
    setLastLoadResult(null)
    const currentProspected = new Set(prospectedDomains)
    let currentTotal = totalContacts
    try {
      while (currentTotal < target) {
        const remaining = allCompanies.filter(c => !currentProspected.has(c.domain))
        if (remaining.length === 0) break
        const batch = remaining.slice(0, 25).map(c => c.domain)
        currentTotal = await fetchPeopleBatch(batch)
        batch.forEach(d => currentProspected.add(d))
        setTotalContacts(currentTotal)
        setProspectedDomains(new Set(currentProspected))
      }
      if (currentTotal > 0) onDone?.()
    } finally {
      setLoadMoreRunning(false)
    }
  }

  function handleNewRound(keywords: string[]) {
    fetch(`/api/projects/${projectId}/run-config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords }),
    })
    setStates(prev => {
      const next = { ...prev }
      for (const id of ROUND_STEPS) delete next[id]
      return next
    })
    setExpanded(new Set())
  }

  function reset() {
    setRunId(null)
    setStates({})
    setExpanded(new Set())
    setPipelineStarted(false)
    setTotalContacts(0)
    setSeenDomains([])
    setProspectedDomains(new Set())
    setUrl(null)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400 py-2">
        <span className="size-4 rounded-full border-2 border-zinc-300 border-t-transparent animate-spin" />
        Resuming run…
      </div>
    )
  }

  const classifyArtifact = states['classify']?.artifact as Record<string, unknown> | undefined
  const allCompanies: Company[] = (
    classifyArtifact?.results as Array<{ domain: string; name: string; is_target: boolean }> ?? []
  ).filter(r => r.is_target).map(r => ({ domain: r.domain, name: r.name }))

  const apolloArtifact = states['apollo_search']?.artifact as Record<string, unknown> | undefined
  const apolloKeywordHits = (apolloArtifact?.keyword_hits as Record<string, number>) ?? {}

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Find Contacts</h2>
          <p className="text-sm text-zinc-400 mt-0.5">
            {hasStarted ? `${totalContacts} contacts found` : 'Run the pipeline to find contacts'}
          </p>
        </div>
        {pipelineStarted && (
          <button onClick={reset} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 transition-colors">
            <RotateCcw size={12} />
            New run
          </button>
        )}
      </div>

      {/* Start button */}
      {!pipelineStarted && (
        <motion.div variants={scaleIn} initial="hidden" animate="show" transition={springGentle}>
          <button
            onClick={() => setPipelineStarted(true)}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
          >
            <Play size={13} />
            Start Pipeline
          </button>
        </motion.div>
      )}

      {/* Steps */}
      {pipelineStarted && (
        <div className="space-y-5">
          {STAGES.map(stage => {
            const stageSteps = STEPS.filter(s => s.stage === stage.id)
            const stageDone = stageSteps.every(s => states[s.id]?.status === 'done')
            const stageRunning = stageSteps.some(s => states[s.id]?.status === 'running')
            const StageIcon = stage.Icon
            return (
              <div key={stage.id}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <StageIcon size={12} className={
                    stageDone ? 'text-emerald-600' :
                    stageRunning ? 'text-blue-500' :
                    'text-zinc-400'
                  } />
                  <p className={`text-xs font-semibold uppercase tracking-wider ${
                    stageDone ? 'text-emerald-700' :
                    stageRunning ? 'text-blue-600' :
                    'text-zinc-500'
                  }`}>
                    {stage.label}
                  </p>
                  <span className="text-[10px] text-zinc-400">· {stage.sub}</span>
                  {stageDone && <Check size={11} className="text-emerald-500" />}
                </div>
                <div className="space-y-2">
                  {stageSteps.map((step) => {
                    const state = states[step.id] ?? { status: 'idle' }
                    const isNext = step.id === nextStep
                    const isDone = state.status === 'done'
                    const isRunning = state.status === 'running'
                    const isError = state.status === 'error'
                    const isOpen = expanded.has(step.id)
                    const { Icon } = step
                    const estimatedSeconds = step.id === 'classify'
                      ? (() => {
                          const total = (states['scrape']?.artifact as Record<string, unknown> | undefined)?.total as number ?? 100
                          return Math.max(10, Math.ceil(Math.ceil(total * 0.35) / 10 / 3) * 6)
                        })()
                      : STEP_DURATION_EST[step.id]

                    return (
                      <div key={step.id} className={`rounded-xl border overflow-hidden transition-all ${
                        isDone    ? 'border-zinc-100 bg-white' :
                        isRunning ? 'border-blue-100 bg-blue-50' :
                        isError   ? 'border-red-100 bg-red-50' :
                        isNext    ? 'border-zinc-200 bg-white shadow-sm' :
                                    'border-zinc-100 bg-zinc-50/60'
                      }`}>
                        <div className="flex items-center gap-3 px-4 py-3">
                          <div className="w-5 flex justify-center shrink-0">
                            {isRunning ? <span className="size-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin inline-block" />
                            : isDone   ? <Check size={15} className="text-green-500" />
                            : isError  ? <X size={15} className="text-red-400" />
                            : <Icon size={15} className={isNext ? 'text-zinc-500' : 'text-zinc-300'} />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium leading-none ${
                              isDone    ? 'text-zinc-800' :
                              isRunning ? 'text-blue-700' :
                              isError   ? 'text-red-600' :
                              isNext    ? 'text-zinc-800' : 'text-zinc-400'
                            }`}>{step.label}</p>
                            <p className="text-xs text-zinc-400 mt-0.5 truncate">
                              {isDone && state.artifact ? stepSummary(step.id, state.artifact)
                              : isError ? (state.error ?? 'Error')
                              : step.sub}
                            </p>
                            {isRunning && startTimes[step.id] && (
                              <StepProgress startedAt={startTimes[step.id]!} estimatedSeconds={estimatedSeconds} />
                            )}
                          </div>

                          {isDone ? (
                            <button onClick={() => toggleExpand(step.id)} className="text-zinc-300 hover:text-zinc-500 transition-colors p-1 shrink-0">
                              <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                            </button>
                          ) : isNext && !isRunning ? (
                            <button
                              onClick={() => runStep(step.id, { seenDomains })}
                              className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 transition-colors shrink-0"
                            >
                              <Play size={11} />
                              Run
                            </button>
                          ) : isError ? (
                            <button onClick={() => runStep(step.id, { seenDomains })} className="text-xs text-red-500 hover:text-red-700 shrink-0">
                              Retry
                            </button>
                          ) : null}
                        </div>

                        <AnimatePresence initial={false}>
                          {isDone && isOpen && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                              <div className="px-4 pb-4 pt-2 border-t border-zinc-100">
                                {step.id === 'extract_people' && allDone && allCompanies.length > 0 ? (
                                  <LoadMorePanel
                                    inline
                                    allCompanies={allCompanies}
                                    prospectedDomains={prospectedDomains}
                                    totalContacts={totalContacts}
                                    running={loadMoreRunning}
                                    lastLoadResult={lastLoadResult}
                                    apolloKeywordHits={apolloKeywordHits}
                                    onLoadMore={handleLoadMore}
                                    onLoadUntilKpi={handleLoadUntilKpi}
                                    onNewRound={handleNewRound}
                                  />
                                ) : (
                                  renderArtifact(step.id, state.artifact)
                                )}
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
          })}
        </div>
      )}

    </div>
  )
}

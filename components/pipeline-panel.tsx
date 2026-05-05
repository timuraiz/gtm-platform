'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, SlidersHorizontal, Radar, Globe, Users, Play, Check, X, ChevronDown, RotateCcw, Plus, Search as SearchIcon } from 'lucide-react'
import { scaleIn, springGentle } from '@/lib/animations'
import { renderArtifact } from './pipeline-artifacts'
import { getRun } from '@/app/actions/pipeline'

// Pipeline only discovers + scrapes companies. Classification and Extract people both happen in the
// Companies tab on user demand (cost control — Claude isn't auto-called on every Apollo response).
const STEPS = [
  { id: 'generate_filters', label: 'Generate Filters',   sub: 'Apollo search parameters',  Icon: SlidersHorizontal },
  { id: 'apollo_search',    label: 'Apollo Search',      sub: 'Company discovery',         Icon: Radar },
  { id: 'scrape',           label: 'Scrape Websites',    sub: 'Enrich with website text',  Icon: Globe },
] as const

type StepId = typeof STEPS[number]['id']

const STEP_DURATION_EST: Record<StepId, number> = {
  generate_filters: 8,
  apollo_search:    20,
  scrape:           12,
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
    default: return 'Done'
  }
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
  const [seenDomains, setSeenDomains] = useState<string[]>([])
  const [polling, setPolling] = useState(false)

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
      // Hydrate seenDomains from apollo_search artifact so re-runs skip already-found companies
      const apolloStep = run.steps.find(s => s.name === 'apollo_search')
      if (apolloStep) {
        const apolloDomains = ((apolloStep.artifact as Record<string, unknown>)?.companies as Array<{ domain: string }> ?? []).map(c => c.domain)
        if (apolloDomains.length > 0) setSeenDomains(apolloDomains)
      }
      // If the run is still running, resume polling so the user sees progress live
      if (run.status === 'running') setPolling(true)
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

  // Poll workflow run state from pipeline_runs.steps every 3s while polling=true
  useEffect(() => {
    if (!polling || !runId) return
    let cancelled = false
    const tick = async () => {
      const run = await getRun(runId)
      if (cancelled || !run) return
      const newStates: Partial<Record<StepId, StepState>> = {}
      for (const step of run.steps) {
        newStates[step.name as StepId] = { status: step.status, artifact: step.artifact }
      }
      // Mark in-flight step
      const completed = STEPS.filter(s => newStates[s.id]?.status === 'done').map(s => s.id)
      const next = STEPS.find(s => !completed.includes(s.id))?.id
      if (next && run.status === 'running') {
        newStates[next] = newStates[next] ?? { status: 'running' }
        setStartTimes(prev => prev[next] ? prev : { ...prev, [next]: Date.now() })
      }
      setStates(newStates)
      const last = run.steps.at(-1)
      if (last) setExpanded(prev => prev.has(last.name as StepId) ? prev : new Set([...prev, last.name as StepId]))

      if (run.status === 'done' || run.status === 'error') {
        setPolling(false)
        onDone?.()
      }
    }
    void tick()
    const id = setInterval(tick, 3000)
    return () => { cancelled = true; clearInterval(id) }
  }, [polling, runId, onDone])

  async function startPipeline() {
    setPipelineStarted(true)
    setStates({})
    setExpanded(new Set())
    try {
      const res = await fetch('/api/pipeline/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, iterationId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start pipeline')
      setRunId(data.runId)
      setUrl(data.runId)
      onRunCreated?.(data.runId)
      setPolling(true)
    } catch (err) {
      console.error('[startPipeline]', err)
      alert(err instanceof Error ? err.message : 'Failed to start pipeline')
      setPipelineStarted(false)
    }
  }

  async function runStep(
    stepId: StepId,
    opts: { page?: number; seenDomains?: string[]; domainsOverride?: string[]; runIdOverride?: string | null } = {},
  ): Promise<{ ok: boolean; artifact?: unknown; runId?: string }> {
    setStartTimes(prev => ({ ...prev, [stepId]: Date.now() }))
    setStates(prev => ({ ...prev, [stepId]: { status: 'running' } }))
    try {
      const res = await fetch('/api/pipeline/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId, iterationId, step: stepId,
          runId: opts.runIdOverride !== undefined ? opts.runIdOverride : runId,
          page: opts.page ?? 1,
          seenDomains: opts.seenDomains ?? [],
          domainsOverride: opts.domainsOverride,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Step failed')

      if ((!runId || opts.runIdOverride === null) && data.runId) {
        setRunId(data.runId)
        setUrl(data.runId)
        onRunCreated?.(data.runId)
      }

      setStates(prev => ({ ...prev, [stepId]: { status: 'done', artifact: data.artifact } }))
      setExpanded(prev => new Set([...prev, stepId]))

      // Track domains we've already pulled from Apollo this session — extra defense in addition to the DB-side filter
      if (stepId === 'apollo_search') {
        const apolloArtifact = data.artifact as Record<string, unknown>
        const newDomains = (apolloArtifact?.companies as Array<{ domain: string }> ?? []).map(c => c.domain)
        setSeenDomains(prev => [...new Set([...prev, ...newDomains])])
      }

      // Refresh project page state after the final step (scrape) so Companies tab shows new rows
      if (stepId === 'scrape') onDone?.()
      return { ok: true, artifact: data.artifact, runId: data.runId }
    } catch (err) {
      setStates(prev => ({ ...prev, [stepId]: { status: 'error', error: String(err) } }))
      return { ok: false }
    }
  }

  // Track how many Apollo pages we've fetched in the current run (visible to user via the "Load next page" button)
  const [pendingApolloPage, setPendingApolloPage] = useState<number | null>(null)
  const apolloArtifactPage = (states['apollo_search']?.artifact as { page?: number } | undefined)?.page ?? 1
  const nextApolloPage = pendingApolloPage ?? (apolloArtifactPage + 1)

  function prepareNextApolloPage() {
    // Reset apollo/scrape so the UI shows them ready to Run again. User clicks Run on each step manually.
    setStates(prev => {
      const next = { ...prev }
      delete next['apollo_search']
      delete next['scrape']
      return next
    })
    setExpanded(new Set())
    setPendingApolloPage(apolloArtifactPage + 1)
  }

  function reset() {
    setRunId(null)
    setStates({})
    setExpanded(new Set())
    setPipelineStarted(false)
    setSeenDomains([])
    setUrl(null)
  }

  const apolloArtifact = states['apollo_search']?.artifact as Record<string, unknown> | undefined
  const foundCount = (apolloArtifact?.companies_found as number | undefined) ?? 0

  if (loading) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="flex items-center gap-2 text-sm text-zinc-400 py-2"
        >
          <span className="size-4 rounded-full border-2 border-zinc-300 border-t-transparent animate-spin" />
          Resuming run…
        </motion.div>
      </AnimatePresence>
    )
  }

  return (
    <motion.div
      key="loaded"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Find Companies</h2>
          <p className="text-sm text-zinc-400 mt-0.5">
            {hasStarted
              ? (foundCount > 0 ? `${foundCount} companies found` : 'Run the pipeline to discover companies')
              : 'Run the pipeline to discover companies'}
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
        <div className="space-y-2">
          {STEPS.map((step) => {
            const state = states[step.id] ?? { status: 'idle' }
            const isNext = step.id === nextStep
            const isDone = state.status === 'done'
            const isRunning = state.status === 'running'
            const isError = state.status === 'error'
            const isOpen = expanded.has(step.id)
            const { Icon } = step
            const estimatedSeconds = STEP_DURATION_EST[step.id]

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
                      onClick={() => {
                        const opts: { seenDomains: string[]; page?: number } = { seenDomains }
                        if (step.id === 'apollo_search' && pendingApolloPage) opts.page = pendingApolloPage
                        runStep(step.id, opts).then(() => {
                          if (step.id === 'apollo_search') setPendingApolloPage(null)
                        })
                      }}
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
                        {renderArtifact(step.id, state.artifact)}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}

          {/* CTA after pipeline completes — direct user to Companies tab to extract people */}
          {allDone && (
            <motion.div variants={scaleIn} initial="hidden" animate="show" transition={springGentle}
              className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 mt-3 space-y-3">
              <div>
                <p className="text-sm font-medium text-emerald-800">Pipeline finished. Next step:</p>
                <p className="text-xs text-emerald-700 mt-1">
                  Open the <span className="font-semibold">Companies</span> tab → filter <span className="font-semibold">Pending</span> → run <span className="font-semibold">Classify</span> on the ones you want to qualify, then <span className="font-semibold">Extract people</span> on qualified.
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-emerald-100">
                <div className="text-xs text-emerald-700">
                  Need more candidates? Apollo has more pages of results for the same filters.
                </div>
                <button
                  onClick={prepareNextApolloPage}
                  className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 transition-colors shrink-0"
                >
                  <Radar size={11} />
                  Load page {nextApolloPage}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      )}

    </motion.div>
  )
}

'use client'

import { useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, SlidersHorizontal, Radar, Globe, ListChecks, Users, Check, X, ChevronDown } from 'lucide-react'
import { type PipelineRun, type StepRecord } from '@/app/actions/pipeline'
import { PipelinePanel } from './pipeline-panel'
import { renderArtifact } from './pipeline-artifacts'
import { fadeUp, staggerContainer, springGentle } from '@/lib/animations'

// ─── Step metadata ────────────────────────────────────────────────────────────

type StepMeta = { label: string; sub: string; Icon: React.FC<{ size?: number; className?: string }> }
const STEP_META: Record<string, StepMeta> = {
  generate_filters: { label: 'Generate Filters',   sub: 'Apollo search parameters', Icon: SlidersHorizontal },
  apollo_search:    { label: 'Apollo Search',      sub: 'Company discovery',        Icon: Radar },
  scrape:           { label: 'Scrape Websites',    sub: 'Enrich with website text', Icon: Globe },
  classify:         { label: 'Classify Companies', sub: 'Qualify / reject',         Icon: ListChecks },
  extract_people:   { label: 'Extract People',     sub: 'Decision makers',          Icon: Users },
}
const STEP_ORDER = ['generate_filters', 'apollo_search', 'scrape', 'classify', 'extract_people']
const stepOrderIndex = (name: string) => {
  const i = STEP_ORDER.indexOf(name)
  return i === -1 ? STEP_ORDER.length : i
}

function stepSummary(name: string, artifact: unknown): string {
  const a = artifact as Record<string, unknown>
  switch (name) {
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

// ─── Step card ────────────────────────────────────────────────────────────────

function StepCard({ step }: { step: StepRecord }) {
  const [open, setOpen] = useState(false)
  const meta = STEP_META[step.name] ?? { label: step.name, sub: '', Icon: Sparkles }
  const { Icon } = meta
  const isDone = step.status === 'done'
  const isError = step.status === 'error'

  return (
    <div className={`rounded-xl border overflow-hidden transition-colors ${
      isDone  ? 'border-zinc-100 bg-white' : 'border-red-100 bg-red-50'
    }`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-5 flex justify-center shrink-0">
          {isDone  ? <Check size={15} className="text-green-500" />
          : isError ? <X size={15} className="text-red-400" />
          : <Icon size={15} className="text-zinc-300" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-800 leading-none">{meta.label}</p>
          <p className="text-xs text-zinc-400 mt-0.5 truncate">
            {isDone && step.artifact ? stepSummary(step.name, step.artifact) : meta.sub}
          </p>
        </div>
        <button onClick={() => setOpen(o => !o)} className="text-zinc-300 hover:text-zinc-500 transition-colors p-1 shrink-0">
          <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 border-t border-zinc-100">
              {renderArtifact(step.name, step.artifact)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Run card ─────────────────────────────────────────────────────────────────

function RunCard({ run }: { run: PipelineRun }) {
  const [open, setOpen] = useState(run.status === 'running')
  const date = new Date(run.created_at).toLocaleString('en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  // Derive counts straight from step artifacts so we don't depend on the legacy companies_found column
  const apolloArtifact = run.steps.find(s => s.name === 'apollo_search')?.artifact as { companies_found?: number } | undefined
  const classifyArtifact = run.steps.find(s => s.name === 'classify')?.artifact as { targets?: number } | undefined
  const foundCount = apolloArtifact?.companies_found ?? 0
  const qualifiedCount = classifyArtifact?.targets ?? 0

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={() => setOpen(o => !o)} className="flex-1 flex items-center gap-3 text-left hover:opacity-70 transition-opacity">
          <span className={`size-2.5 rounded-full shrink-0 ${
            run.status === 'done' ? 'bg-green-400' :
            run.status === 'running' ? 'bg-blue-400 animate-pulse' :
            run.status === 'error' ? 'bg-red-400' : 'bg-zinc-300'
          }`} />
          <span className="flex-1 text-sm font-medium text-zinc-800">{date}</span>
          {run.status === 'done' && foundCount > 0 && (
            <span className="text-xs text-zinc-400">{qualifiedCount} qualified · {foundCount} found</span>
          )}
        </button>
        <button onClick={() => setOpen(o => !o)} className="text-zinc-300 hover:text-zinc-500 transition-colors p-1">
          <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-zinc-50 space-y-2 pt-3">
              {run.steps.length === 0 && run.status === 'running' && (
                <p className="text-sm text-zinc-400">Pipeline is running…</p>
              )}
              {[...run.steps].sort((a, b) => stepOrderIndex(a.name) - stepOrderIndex(b.name)).map((step, i) => (
                <StepCard key={`${step.name}-${i}`} step={step} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function ProjectPipelineView({ projectId, iterationId, initialRuns, icp }: { projectId: string; iterationId: string; initialRuns: PipelineRun[]; icp?: Record<string, unknown> | null }) {
  const router = useRouter()
  const [runs, setRuns] = useState(initialRuns)
  const [liveRunId, setLiveRunId] = useState<string | null>(null)

  async function onRunStarted(runId: string) {
    setLiveRunId(runId)
  }

  async function refreshRuns() {
    const { getPipelineRuns } = await import('@/app/actions/pipeline')
    const fresh = await getPipelineRuns(projectId)
    setRuns(fresh)
    setLiveRunId(null)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Launch panel */}
      <div className="rounded-2xl border border-zinc-100 bg-white p-5">
        <Suspense fallback={<div className="h-10 flex items-center text-sm text-zinc-400">Loading…</div>}>
          <PipelinePanel
            projectId={projectId}
            iterationId={iterationId}
            icp={icp}
            latestRunId={runs.find(r => r.status === 'running' || r.status === 'done')?.id ?? null}
            onRunCreated={onRunStarted}
            onDone={refreshRuns}
          />
        </Suspense>
      </div>

      {/* Run history */}
      {runs.length > 0 && (
        <div>
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Run history</p>
          <motion.div className="space-y-3" variants={staggerContainer} initial="hidden" animate="show">
            {runs.map(run => (
              <motion.div key={run.id} variants={fadeUp} transition={springGentle}>
                <RunCard run={run} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}
    </div>
  )
}

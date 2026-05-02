'use client'

import { useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, SlidersHorizontal, Radar, Globe, ListChecks, Users, Check, X, ChevronDown, GitFork } from 'lucide-react'
import { type PipelineRun, type StepRecord, forkPipelineRun } from '@/app/actions/pipeline'
import { PipelinePanel } from './pipeline-panel'
import { renderArtifact } from './pipeline-artifacts'
import { fadeUp, staggerContainer, springGentle } from '@/lib/animations'

// ─── Step metadata ────────────────────────────────────────────────────────────

type StepMeta = { label: string; sub: string; Icon: React.FC<{ size?: number; className?: string }> }
const STEP_META: Record<string, StepMeta> = {
  extract_icp:      { label: 'Extract ICP',        sub: 'Claude reads your offer',  Icon: Sparkles },
  generate_filters: { label: 'Generate Filters',   sub: 'Apollo search parameters', Icon: SlidersHorizontal },
  apollo_search:    { label: 'Apollo Search',      sub: 'Company discovery',        Icon: Radar },
  scrape:           { label: 'Scrape Websites',    sub: 'Enrich with website text', Icon: Globe },
  classify:         { label: 'Classify Companies', sub: 'Qualify / reject',         Icon: ListChecks },
  extract_people:   { label: 'Extract People',     sub: 'Decision makers',          Icon: Users },
}

function stepSummary(name: string, artifact: unknown): string {
  const a = artifact as Record<string, unknown>
  switch (name) {
    case 'extract_icp': {
      const roles = a.target_roles as Record<string, string[]> | undefined
      const count = [...(roles?.primary ?? []), ...(roles?.secondary ?? [])].length
      return `${count} roles · ${(a.segments as unknown[] ?? []).length} segments`
    }
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

function RunCard({ run, onFork }: { run: PipelineRun; onFork: (runId: string) => void }) {
  const [open, setOpen] = useState(run.status === 'running')
  const [forking, setForking] = useState(false)
  const date = new Date(run.created_at).toLocaleString('en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  async function handleFork(e: React.MouseEvent) {
    e.stopPropagation()
    setForking(true)
    try {
      const newId = await forkPipelineRun(run.id)
      onFork(newId)
    } finally {
      setForking(false)
    }
  }

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
          {run.status === 'done' && (
            <span className="text-xs text-zinc-400">{run.companies_found} companies · {run.contacts_found} contacts</span>
          )}
        </button>
        {run.status === 'done' && (
          <button
            onClick={handleFork}
            disabled={forking}
            title="Fork this run to continue or modify"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors disabled:opacity-50"
          >
            {forking
              ? <span className="size-3 rounded-full border-2 border-zinc-300 border-t-zinc-600 animate-spin" />
              : <GitFork size={13} />}
          </button>
        )}
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
              {run.steps.map((step, i) => (
                <StepCard key={i} step={step} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function ProjectPipelineView({ projectId, initialRuns, icp }: { projectId: string; initialRuns: PipelineRun[]; icp?: Record<string, unknown> | null }) {
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

  async function handleFork(newRunId: string) {
    await refreshRuns()
    const params = new URLSearchParams(window.location.search)
    params.set('runId', newRunId)
    params.set('tab', 'pipeline')
    router.push(`?${params.toString()}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-6">
      {/* Launch panel */}
      <div className="rounded-2xl border border-zinc-100 bg-white p-5">
        <Suspense fallback={<div className="h-10 flex items-center text-sm text-zinc-400">Loading…</div>}>
          <PipelinePanel
            projectId={projectId}
            icp={icp}
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
                <RunCard run={run} onFork={handleFork} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}
    </div>
  )
}

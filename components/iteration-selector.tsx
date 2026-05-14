'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Layers, ChevronDown, Check, Circle, Play, CircleCheck, CircleSlash, Mail } from 'lucide-react'
import { createIteration, setIterationStatus, type Iteration, type IterationStatus, type IterationChannel, type TargetSegment } from '@/app/actions/iterations'
import { ChannelIcon } from './channel-icon'

const STATUSES: { key: IterationStatus; label: string; tone: string; dot: string; icon: typeof Circle }[] = [
  { key: 'draft', label: 'Draft', tone: 'text-zinc-500', dot: 'bg-zinc-300', icon: Circle },
  { key: 'running', label: 'Running', tone: 'text-blue-700', dot: 'bg-blue-500', icon: Play },
  { key: 'finished', label: 'Finished', tone: 'text-emerald-700', dot: 'bg-emerald-500', icon: CircleCheck },
  { key: 'discarded', label: 'Discarded', tone: 'text-rose-600', dot: 'bg-rose-400', icon: CircleSlash },
]

function statusMeta(s: IterationStatus) {
  return STATUSES.find(x => x.key === s)!
}

// ─── ICP helpers ─────────────────────────────────────────────────────────────

type IcpRaw = Record<string, unknown>

function icpGeo(icp: IcpRaw): string[] {
  if (Array.isArray(icp.geo) && icp.geo.length) return icp.geo as string[]
  const af = icp.apollo_filters as IcpRaw | undefined
  if (Array.isArray(af?.locations)) return af!.locations as string[]
  return []
}
function icpIndustries(icp: IcpRaw): string[] {
  if (Array.isArray(icp.industries) && icp.industries.length) return icp.industries as string[]
  const af = icp.apollo_filters as IcpRaw | undefined
  if (Array.isArray(af?.industries)) return af!.industries as string[]
  return []
}
// Mirrors SENIORITY_LABEL_TO_APOLLO in app/api/pipeline/step/route.ts. We
// always need a seniority on the iteration — Apollo extract_people refuses
// to run without one — so when the ICP is missing the field (e.g. AI
// rewrote it and dropped seniority_levels), fall back to this canonical
// list rather than letting the user create an incomplete iteration.
const DEFAULT_SENIORITIES = ['C-Suite', 'VP', 'Director', 'Head of', 'Manager', 'Senior IC', 'Self-Employed']

function icpSeniorities(icp: IcpRaw): string[] {
  if (Array.isArray(icp.seniority_levels) && (icp.seniority_levels as string[]).length)
    return icp.seniority_levels as string[]
  // legacy fallback
  const tr = icp.target_roles as Record<string, string[]> | undefined
  if (Array.isArray(tr?.seniorities) && tr!.seniorities.length) return tr!.seniorities
  return DEFAULT_SENIORITIES
}

// ─── Segment form ─────────────────────────────────────────────────────────────

function SegmentForm({
  icp,
  channel,
  onChannelChange,
  segment,
  onSegmentChange,
}: {
  icp: IcpRaw
  channel: IterationChannel
  onChannelChange: (c: IterationChannel) => void
  segment: Partial<TargetSegment>
  onSegmentChange: (s: Partial<TargetSegment>) => void
}) {
  const industries = icpIndustries(icp)
  const geos = icpGeo(icp)
  const seniorities = icpSeniorities(icp)
  const hasSegmentData = industries.length > 0 || geos.length > 0 || seniorities.length > 0

  return (
    <div className="space-y-3">
      {/* Channel */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-zinc-400 font-medium mb-1.5">Channel</p>
        <div className="flex gap-1.5">
          <button
            onClick={() => onChannelChange('linkedin')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${channel === 'linkedin' ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
          >
            <ChannelIcon channel="linkedin" size={11} />
            LinkedIn
          </button>
          <button
            onClick={() => onChannelChange('email')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${channel === 'email' ? 'bg-orange-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
          >
            <Mail size={11} />
            Email
          </button>
        </div>
      </div>

      {hasSegmentData && (
        <>
          {industries.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-400 font-medium mb-1.5">Industry</p>
              <div className="flex flex-wrap gap-1">
                {industries.map(ind => (
                  <button
                    key={ind}
                    onClick={() => onSegmentChange({ ...segment, industry: segment.industry === ind ? undefined : ind })}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${segment.industry === ind ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
                  >
                    {ind}
                  </button>
                ))}
              </div>
            </div>
          )}

          {geos.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-400 font-medium mb-1.5">Region</p>
              <div className="flex flex-wrap gap-1">
                {geos.map(geo => (
                  <button
                    key={geo}
                    onClick={() => onSegmentChange({ ...segment, geo: segment.geo === geo ? undefined : geo })}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${segment.geo === geo ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
                  >
                    {geo}
                  </button>
                ))}
              </div>
            </div>
          )}

          {seniorities.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-400 font-medium mb-1.5">Seniority</p>
              <div className="flex flex-wrap gap-1">
                {seniorities.map(s => (
                  <button
                    key={s}
                    onClick={() => onSegmentChange({ ...segment, seniority: segment.seniority === s ? undefined : s })}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${segment.seniority === s ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function isSegmentComplete(icp: IcpRaw, segment: Partial<TargetSegment>): boolean {
  if (icpIndustries(icp).length > 0 && !segment.industry) return false
  if (icpGeo(icp).length > 0 && !segment.geo) return false
  if (icpSeniorities(icp).length > 0 && !segment.seniority) return false
  return true
}

// ─── IterationSelector ────────────────────────────────────────────────────────

export function IterationSelector({
  iterations,
  activeId,
  projectId,
  icp,
}: {
  iterations: Iteration[]
  activeId: string
  projectId: string
  icp: IcpRaw | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const active = iterations.find(i => i.id === activeId)

  function switchTo(id: string) {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.set('iter', id)
    startTransition(() => {
      router.push(`?${params.toString()}`, { scroll: false })
    })
  }

  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-zinc-400 font-semibold pr-1">
        <Layers size={12} strokeWidth={2.5} />
      </span>
      <div className="flex items-center gap-1 flex-wrap">
        {iterations.map(it => {
          const isActive = it.id === activeId
          const meta = statusMeta(it.status)
          const channelTone = it.channel === 'linkedin' ? 'text-blue-200' : 'text-orange-200'
          return (
            <button
              key={it.id}
              onClick={() => switchTo(it.id)}
              title={`${it.channel === 'linkedin' ? 'LinkedIn' : 'Email'} · ${meta.label}${it.target_segment ? ` · ${it.target_segment.industry ?? ''} ${it.target_segment.geo ?? ''}`.trim() : ''}`}
              className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${isActive
                  ? 'bg-zinc-900 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                } ${it.status === 'discarded' ? 'opacity-60' : ''}`}
            >
              <span className={`size-2 rounded-full ${meta.dot} ${it.status === 'running' ? 'animate-pulse' : ''}`} />
              <span className={isActive ? channelTone : it.channel === 'linkedin' ? 'text-blue-600' : 'text-orange-600'}>
                {it.channel === 'linkedin' ? <ChannelIcon channel="linkedin" size={10} /> : <Mail size={10} />}
              </span>
              <span className={it.status === 'discarded' ? 'line-through decoration-rose-300' : ''}>{it.name}</span>
              {it.target_segment && (
                <span className="text-[10px] text-zinc-400">
                  {[it.target_segment.industry, it.target_segment.geo, it.target_segment.seniority].filter(Boolean).join(' · ')}
                </span>
              )}
            </button>
          )
        })}
        <NewIterationButton projectId={projectId} icp={icp} onCreated={switchTo} disabled={pending} />
      </div>
      {active && <StatusDropdown iteration={active} />}
    </div>
  )
}

// ─── FirstIterationPrompt ─────────────────────────────────────────────────────

export function FirstIterationPrompt({ projectId, icp }: { projectId: string; icp: IcpRaw | null }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [channel, setChannel] = useState<IterationChannel>('linkedin')
  const [segment, setSegment] = useState<Partial<TargetSegment>>({})

  const raw = icp ?? {}
  const ready = !icp || isSegmentComplete(raw, segment)

  function create() {
    const seg = icp && isSegmentComplete(raw, segment)
      ? { industry: segment.industry!, geo: segment.geo!, seniority: segment.seniority! }
      : undefined
    startTransition(async () => {
      const created = await createIteration(projectId, channel, seg)
      const params = new URLSearchParams(Array.from(searchParams.entries()))
      params.set('iter', created.id)
      router.push(`?${params.toString()}`, { scroll: false })
    })
  }

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-8 max-w-lg mx-auto">
      <div className="flex items-center justify-center mb-4">
        <span className="size-8 rounded-xl bg-zinc-100 flex items-center justify-center">
          <Layers size={14} className="text-zinc-500" strokeWidth={2.25} />
        </span>
      </div>
      <h2 className="text-base font-semibold text-zinc-900 text-center mb-1">Create your first iteration</h2>
      <p className="text-xs text-zinc-500 text-center mb-6">Pick a channel and define the target segment for clean analytics.</p>

      <SegmentForm
        icp={raw}
        channel={channel}
        onChannelChange={setChannel}
        segment={segment}
        onSegmentChange={setSegment}
      />

      <button
        onClick={create}
        disabled={pending || !ready}
        className="mt-5 w-full flex items-center justify-center gap-2 rounded-full bg-zinc-900 text-white text-xs font-medium px-4 py-2.5 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
      >
        {pending ? 'Creating…' : 'Create iteration'}
      </button>
    </div>
  )
}

// ─── NewIterationButton ───────────────────────────────────────────────────────

function NewIterationButton({
  projectId,
  icp,
  onCreated,
  disabled,
}: {
  projectId: string
  icp: IcpRaw | null
  onCreated: (id: string) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [channel, setChannel] = useState<IterationChannel>('linkedin')
  const [segment, setSegment] = useState<Partial<TargetSegment>>({})
  const ref = useRef<HTMLDivElement>(null)

  const raw = icp ?? {}
  const ready = !icp || isSegmentComplete(raw, segment)

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  function create() {
    const seg = icp && isSegmentComplete(raw, segment)
      ? { industry: segment.industry!, geo: segment.geo!, seniority: segment.seniority! }
      : undefined
    setOpen(false)
    startTransition(async () => {
      const created = await createIteration(projectId, channel, seg)
      onCreated(created.id)
    })
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(o => !o); setSegment({}) }}
        disabled={disabled || pending}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border border-dashed border-zinc-200 text-zinc-400 hover:border-zinc-300 hover:text-zinc-600 transition-colors disabled:opacity-50"
      >
        <Plus size={11} strokeWidth={2.5} />
        New
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-30 w-72 rounded-xl border border-zinc-100 bg-white shadow-lg p-3 space-y-3">
          <SegmentForm
            icp={raw}
            channel={channel}
            onChannelChange={setChannel}
            segment={segment}
            onSegmentChange={setSegment}
          />
          <button
            onClick={create}
            disabled={!ready || pending}
            className="w-full flex items-center justify-center rounded-lg bg-zinc-900 text-white text-xs font-medium py-2 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
          >
            {pending ? 'Creating…' : 'Create iteration'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── StatusDropdown ───────────────────────────────────────────────────────────

function StatusDropdown({ iteration }: { iteration: Iteration }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)
  const meta = statusMeta(iteration.status)
  const Icon = meta.icon

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  async function pick(s: IterationStatus) {
    setOpen(false)
    if (s === iteration.status) return
    startTransition(async () => {
      await setIterationStatus(iteration.id, s)
      router.refresh()
    })
  }

  return (
    <div ref={ref} className="relative ml-2">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={pending}
        className={`flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 transition-colors disabled:opacity-50 ${meta.tone}`}
      >
        <Icon size={12} strokeWidth={2.5} />
        {meta.label}
        <ChevronDown size={11} className="text-zinc-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-30 w-44 rounded-xl border border-zinc-100 bg-white shadow-lg overflow-hidden">
          {STATUSES.map(s => {
            const SIcon = s.icon
            const selected = s.key === iteration.status
            return (
              <button
                key={s.key}
                onClick={() => pick(s.key)}
                className={`flex items-center gap-2.5 w-full px-3 py-2 text-xs hover:bg-zinc-50 transition-colors ${s.tone}`}
              >
                <SIcon size={12} strokeWidth={2.5} />
                <span className="flex-1 text-left">{s.label}</span>
                {selected && <Check size={11} strokeWidth={3} className="text-zinc-400" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

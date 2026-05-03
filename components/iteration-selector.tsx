'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Layers, ChevronDown, Check, Circle, Play, CircleCheck, CircleSlash, Mail } from 'lucide-react'
import { createIteration, setIterationStatus, type Iteration, type IterationStatus, type IterationChannel } from '@/app/actions/iterations'
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

export function IterationSelector({
  iterations,
  activeId,
  projectId,
}: {
  iterations: Iteration[]
  activeId: string
  projectId: string
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
              title={`${it.channel === 'linkedin' ? 'LinkedIn' : 'Email'} · ${meta.label}`}
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
            </button>
          )
        })}
        <NewIterationButton projectId={projectId} onCreated={switchTo} disabled={pending} />
      </div>
      {active && <StatusDropdown iteration={active} />}
    </div>
  )
}

export function FirstIterationPrompt({ projectId }: { projectId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  function pick(channel: IterationChannel) {
    startTransition(async () => {
      const created = await createIteration(projectId, channel)
      const params = new URLSearchParams(Array.from(searchParams.entries()))
      params.set('iter', created.id)
      router.push(`?${params.toString()}`, { scroll: false })
    })
  }

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-10 text-center max-w-xl mx-auto">
      <div className="flex items-center justify-center mb-3">
        <span className="size-8 rounded-xl bg-zinc-100 flex items-center justify-center">
          <Layers size={14} className="text-zinc-500" strokeWidth={2.25} />
        </span>
      </div>
      <h2 className="text-base font-semibold text-zinc-900">Pick a channel for your first iteration</h2>
      <p className="text-xs text-zinc-500 mt-1">Each iteration runs on a single channel — LinkedIn or Email. Stats and sequences inside stay on that channel.</p>
      <div className="mt-5 flex items-center justify-center gap-2">
        <button
          onClick={() => pick('linkedin')}
          disabled={pending}
          className="flex items-center gap-2 rounded-full bg-blue-600 text-white text-xs font-medium px-4 py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <ChannelIcon channel="linkedin" size={12} />
          Start LinkedIn iteration
        </button>
        <button
          onClick={() => pick('email')}
          disabled={pending}
          className="flex items-center gap-2 rounded-full bg-orange-600 text-white text-xs font-medium px-4 py-2 hover:bg-orange-700 disabled:opacity-50 transition-colors"
        >
          <Mail size={12} />
          Start Email iteration
        </button>
      </div>
    </div>
  )
}

function NewIterationButton({
  projectId,
  onCreated,
  disabled,
}: {
  projectId: string
  onCreated: (id: string) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  function pick(channel: IterationChannel) {
    setOpen(false)
    startTransition(async () => {
      const created = await createIteration(projectId, channel)
      onCreated(created.id)
    })
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={disabled || pending}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border border-dashed border-zinc-200 text-zinc-400 hover:border-zinc-300 hover:text-zinc-600 transition-colors disabled:opacity-50"
      >
        <Plus size={11} strokeWidth={2.5} />
        New
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-30 w-52 rounded-xl border border-zinc-100 bg-white shadow-lg overflow-hidden">
          <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-zinc-400 font-medium">Pick a channel</p>
          <button
            onClick={() => pick('linkedin')}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-blue-700 hover:bg-blue-50 transition-colors"
          >
            <ChannelIcon channel="linkedin" size={12} />
            <span className="flex-1 text-left">LinkedIn iteration</span>
          </button>
          <button
            onClick={() => pick('email')}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-orange-700 hover:bg-orange-50 transition-colors"
          >
            <Mail size={12} />
            <span className="flex-1 text-left">Email iteration</span>
          </button>
        </div>
      )}
    </div>
  )
}

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

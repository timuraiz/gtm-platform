'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Pencil, Check, X, ChevronDown, ChevronUp, Save, Trash2, Link, ExternalLink, Plus, CircleCheck } from 'lucide-react'
import { ChannelIcon } from './channel-icon'
import type { SequenceConfig, SequenceStep, Sequence, CaseStudy } from '@/app/actions/sequences'
import { saveSequence, deleteSequence } from '@/app/actions/sequences'

const BUILTIN_PLACEHOLDERS = new Set([
  'firstName', 'lastName', 'company', 'position', 'industry', 'mutualFirstFullName',
])

// Highlight LinkedHelper placeholders in message content. Built-in vars stay blue,
// custom (uploaded with contacts) get violet so the difference is obvious.
function HighlightedContent({ text }: { text: string }) {
  const parts = text.split(/(\{[^}]+\})/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('{') && part.endsWith('}')) {
          const name = part.slice(1, -1).trim()
          const isBuiltin = BUILTIN_PLACEHOLDERS.has(name)
          const cls = isBuiltin
            ? 'bg-blue-50 text-blue-600'
            : 'bg-violet-50 text-violet-700'
          return <span key={i} className={`${cls} rounded px-0.5 font-mono text-[11px]`}>{part}</span>
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function StepCard({
  step,
  index,
  onEdit,
  onDelete,
}: {
  step: SequenceStep
  index: number
  onEdit: (updated: SequenceStep) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(step)
  const [expanded, setExpanded] = useState(true)

  function save() {
    onEdit(draft)
    setEditing(false)
  }

  const typeLabel: Record<SequenceStep['type'], string> = {
    connection_note: 'Connection Note',
    message: 'Message',
    email: 'Email',
  }
  const typeBadge: Record<SequenceStep['type'], string> = {
    connection_note: 'bg-violet-50 text-violet-600',
    message: 'bg-blue-50 text-blue-600',
    email: 'bg-orange-50 text-orange-600',
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${typeBadge[draft.type]}`}>
            {typeLabel[draft.type]}
          </span>
          <span className="text-xs text-zinc-400">Day {draft.day}</span>
        </div>
        {draft.type === 'email' && (
          <input
            value={draft.subject ?? ''}
            onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))}
            placeholder="Subject line"
            className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 font-medium"
          />
        )}
        <textarea
          value={draft.content}
          onChange={e => setDraft(d => ({ ...d, content: e.target.value }))}
          rows={6}
          className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 font-mono resize-none"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={() => { setDraft(step); setEditing(false) }} className="text-xs text-zinc-400 hover:text-zinc-600 px-2 py-1">
            Cancel
          </button>
          <button onClick={save} className="flex items-center gap-1 text-xs bg-zinc-900 text-white px-2.5 py-1 rounded-lg hover:bg-zinc-700">
            <Check size={11} /> Save
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-100 bg-white hover:border-zinc-200 transition-colors group">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-zinc-100 text-xs font-semibold text-zinc-500 shrink-0">
          {index + 1}
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${typeBadge[step.type]}`}>
          {typeLabel[step.type]}
        </span>
        <span className="text-xs text-zinc-400">Day {step.day}</span>
        {step.subject && (
          <span className="text-xs text-zinc-600 font-medium truncate flex-1">{step.subject}</span>
        )}
        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setEditing(true)} className="p-1 rounded text-zinc-300 hover:text-zinc-600">
            <Pencil size={12} />
          </button>
          <button onClick={onDelete} className="p-1 rounded text-zinc-300 hover:text-red-500">
            <X size={12} />
          </button>
        </div>
        <button onClick={() => setExpanded(e => !e)} className="p-1 rounded text-zinc-300 hover:text-zinc-600 shrink-0">
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>
      {expanded && (
        <div className="px-4 pb-3 text-xs text-zinc-600 leading-relaxed whitespace-pre-wrap border-t border-zinc-50 pt-3">
          <HighlightedContent text={step.content} />
        </div>
      )}
    </div>
  )
}

function StepsSlider({ min, max, value, onChange }: { min: number; max: number; value: number; onChange: (v: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100

  return (
    <div className="relative flex-1 h-5 flex items-center">
      {/* Track */}
      <div className="absolute inset-x-0 h-1.5 rounded-full bg-zinc-200 overflow-hidden">
        <div
          className="h-full bg-zinc-900 rounded-full"
          style={{
            width: `${pct}%`,
            transition: 'width 220ms cubic-bezier(0.34, 1.4, 0.64, 1)',
          }}
        />
      </div>
      {/* Thumb */}
      <div
        className="absolute size-4 rounded-full bg-zinc-900 shadow-sm pointer-events-none"
        style={{
          left: `calc(${pct}% - 8px)`,
          transition: 'left 220ms cubic-bezier(0.34, 1.4, 0.64, 1)',
        }}
      />
      {/* Invisible native input for interaction */}
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="absolute inset-0 w-full opacity-0 cursor-pointer"
      />
    </div>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderInitialHtml(text: string): string {
  // Convert {placeholder} tokens into styled non-editable spans
  return escapeHtml(text).replace(
    /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,
    (_m, name) =>
      `<span contenteditable="false" class="placeholder-chip inline-block rounded-md px-1.5 py-0.5 text-[11px] font-mono bg-violet-50 text-violet-700 mx-px align-baseline">{${escapeHtml(name)}}</span>`,
  )
}

function NotesField({
  value,
  onChange,
  customColumns,
}: {
  value: string
  onChange: (v: string) => void
  customColumns: string[]
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [hasContent, setHasContent] = useState(value.length > 0)
  const isFirstRender = useRef(true)

  // Initialize content once. Don't reset on every value change —
  // the contentEditable div is the source of truth during editing.
  useEffect(() => {
    if (isFirstRender.current && ref.current) {
      ref.current.innerHTML = renderInitialHtml(value)
      setHasContent(value.length > 0)
      isFirstRender.current = false
    }
  }, [value])

  function readText(): string {
    return ref.current?.innerText.replace(/​/g, '') ?? ''
  }

  function syncToState() {
    const text = readText()
    setHasContent(text.length > 0)
    onChange(text)
  }

  function insertChipAtCursor(name: string) {
    const span = document.createElement('span')
    span.contentEditable = 'false'
    span.className = 'placeholder-chip inline-block rounded-md px-1.5 py-0.5 text-[11px] font-mono bg-violet-50 text-violet-700 mx-px align-baseline'
    span.textContent = `{${name}}`

    const sel = window.getSelection()
    let range: Range
    if (sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)) {
      range = sel.getRangeAt(0)
      range.deleteContents()
    } else {
      range = document.createRange()
      range.selectNodeContents(ref.current!)
      range.collapse(false)
    }
    range.insertNode(span)
    // Add a zero-width space after so the caret can land outside the chip
    const after = document.createTextNode('​')
    span.after(after)
    range.setStartAfter(after)
    range.setEndAfter(after)
    sel?.removeAllRanges()
    sel?.addRange(range)
    ref.current?.focus()
    syncToState()
  }

  return (
    <div className="space-y-1 col-span-2">
      <label className="text-xs text-zinc-500">Custom instructions <span className="text-zinc-400 font-normal">(optional)</span></label>
      <div className="relative">
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={syncToState}
          onBlur={syncToState}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault()
            setDragOver(false)
            const text = e.dataTransfer.getData('text/plain')
            const m = text.match(/^\{([a-zA-Z_][a-zA-Z0-9_]*)\}$/)
            if (m) {
              insertChipAtCursor(m[1])
              return
            }
            if (text && ref.current) {
              const sel = window.getSelection()
              const node = document.createTextNode(text)
              if (sel && sel.rangeCount && ref.current.contains(sel.anchorNode)) {
                const range = sel.getRangeAt(0)
                range.deleteContents()
                range.insertNode(node)
                range.setStartAfter(node)
                range.setEndAfter(node)
                sel.removeAllRanges()
                sel.addRange(range)
              } else {
                ref.current.appendChild(node)
              }
              ref.current.focus()
              syncToState()
            }
          }}
          className={`w-full text-xs px-2.5 py-1.5 border rounded-lg bg-white focus:outline-none leading-relaxed min-h-[68px] transition-colors whitespace-pre-wrap break-words ${
            dragOver ? 'border-violet-400 bg-violet-50/40' : 'border-zinc-200 focus-within:border-zinc-400'
          }`}
        />
        {!hasContent && !dragOver && (
          <div className="absolute inset-0 px-2.5 py-1.5 text-xs text-zinc-400 pointer-events-none leading-relaxed">
            {customColumns.length > 0
              ? `Drag a variable in or type — e.g. "Reference {${customColumns[0]}} in step 1"`
              : 'Anything specific you want — angles to use, things to avoid, references, voice cues…'}
          </div>
        )}
      </div>
    </div>
  )
}

function PlaceholderChip({ name, accent = false }: { name: string; accent?: boolean }) {
  const [copied, setCopied] = useState(false)
  const text = `{${name}}`
  function copy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  function onDragStart(e: React.DragEvent<HTMLButtonElement>) {
    e.dataTransfer.setData('text/plain', text)
    e.dataTransfer.effectAllowed = 'copy'
  }
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={copy}
      title="Click to copy · drag into instructions"
      className={`rounded-md px-2 py-0.5 text-[11px] font-mono cursor-grab active:cursor-grabbing transition-colors select-none ${
        accent
          ? 'bg-violet-50 text-violet-700 hover:bg-violet-100'
          : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
      }`}
    >
      {copied ? '✓ copied' : text}
    </button>
  )
}

function ConfigForm({
  onGenerate,
  loading,
  caseStudies,
  iterationChannel,
  customColumns,
  defaultName,
}: {
  onGenerate: (config: SequenceConfig, name: string, selectedCaseStudies: CaseStudy[]) => void
  loading: boolean
  caseStudies: CaseStudy[]
  iterationChannel: 'linkedin' | 'email'
  customColumns: string[]
  defaultName?: string
}) {
  const [config, setConfig] = useState<SequenceConfig>({
    channel: iterationChannel,
    steps_count: 4,
    include_connection_note: iterationChannel === 'linkedin',
    tone: 'professional',
    language: 'English',
    user_notes: '',
  })
  const [name, setName] = useState(defaultName ?? '')
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(() => new Set(caseStudies.map((_, i) => i)))

  function toggleCaseStudy(i: number) {
    setSelectedIdx(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const selectedCaseStudies = caseStudies.filter((_, i) => selectedIdx.has(i))

  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-5 space-y-4">
      <p className="text-sm font-medium text-zinc-700">New sequence</p>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Sequence name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. LinkedIn — SaaS CTOs"
            className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Channel</label>
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium ${
            iterationChannel === 'linkedin'
              ? 'border-blue-100 bg-blue-50/40 text-blue-700'
              : 'border-orange-100 bg-orange-50/40 text-orange-700'
          }`}>
            <ChannelIcon channel={iterationChannel} size={11} />
            {iterationChannel === 'linkedin' ? 'LinkedIn' : 'Email'}
            <span className="ml-auto text-[10px] text-zinc-400 font-normal">from iteration</span>
            {/* hidden buttons preserved to keep mapping unchanged */}
            {(['linkedin', 'email'] as const).map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setConfig(cfg => ({
                  ...cfg,
                  channel: c,
                  include_connection_note: c === 'linkedin' ? cfg.include_connection_note : false,
                }))}
                className="hidden"
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Number of steps</label>
          <div className="flex items-center gap-3">
            <StepsSlider
              min={2}
              max={7}
              value={config.steps_count}
              onChange={v => setConfig(cfg => ({ ...cfg, steps_count: v }))}
            />
            <span className="text-xs font-medium text-zinc-700 w-4 text-right">{config.steps_count}</span>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Tone</label>
          <div className="flex rounded-lg border border-zinc-200 bg-white overflow-hidden">
            {(['professional', 'casual', 'direct'] as const).map(t => (
              <button
                key={t}
                onClick={() => setConfig(cfg => ({ ...cfg, tone: t }))}
                className={`flex-1 text-xs py-1.5 capitalize transition-colors ${config.tone === t ? 'bg-zinc-900 text-white font-medium' : 'text-zinc-500 hover:text-zinc-700'
                  }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Language</label>
          <select
            value={config.language ?? 'English'}
            onChange={e => setConfig(cfg => ({ ...cfg, language: e.target.value }))}
            className="w-full text-xs pl-2.5 pr-8 py-1.5 border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400 appearance-none bg-no-repeat bg-[right_0.625rem_center] bg-[length:0.75rem_0.75rem]"
            style={{
              backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 8 10 12 14 8'/%3E%3C/svg%3E\")",
            }}
          >
            {['English', 'Russian', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Polish', 'Dutch', 'Ukrainian'].map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        {config.channel === 'linkedin' && (
          <div className="flex items-center gap-2 col-span-2">
            <button
              onClick={() => setConfig(cfg => ({ ...cfg, include_connection_note: !cfg.include_connection_note }))}
              className={`w-9 h-5 rounded-full transition-colors duration-200 flex items-center px-0.5 shrink-0 ${config.include_connection_note ? 'bg-zinc-900' : 'bg-zinc-200'}`}
            >
              <span
                className="size-4 rounded-full bg-white shadow-sm transition-transform duration-200"
                style={{ transform: config.include_connection_note ? 'translateX(16px)' : 'translateX(0px)' }}
              />
            </button>
            <span className="text-xs text-zinc-600">Include connection request note</span>
          </div>
        )}

        <div className="space-y-2 col-span-2">
          <label className="text-xs text-zinc-500">Available variables</label>
          <div className="rounded-lg border border-zinc-200 bg-white p-2.5 space-y-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-400 font-medium mb-1.5">Built-in</p>
              <div className="flex flex-wrap gap-1">
                {['firstName', 'lastName', 'company', 'position', 'industry'].map(p => (
                  <PlaceholderChip key={p} name={p} />
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-zinc-50">
              <p className="text-[10px] uppercase tracking-wide text-zinc-400 font-medium mb-1.5">
                From your contacts
                {customColumns.length > 0 && <span className="text-zinc-300 font-normal ml-1">({customColumns.length})</span>}
              </p>
              {customColumns.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {customColumns.map(c => <PlaceholderChip key={c} name={c} accent />)}
                </div>
              ) : (
                <p className="text-[11px] text-zinc-400 italic">No custom columns uploaded yet — upload a CSV with extra columns and they&apos;ll appear here</p>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 pt-1 border-t border-zinc-50">
              Use these in the message text or the instructions below — Claude will keep them as <span className="font-mono text-zinc-500">{'{name}'}</span>, and we replace per contact at send time.
            </p>
          </div>
        </div>

        <NotesField
          value={config.user_notes ?? ''}
          onChange={v => setConfig(cfg => ({ ...cfg, user_notes: v }))}
          customColumns={customColumns}
        />
      </div>

      {caseStudies.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <label className="text-xs text-zinc-500">Case studies to reference</label>
            <button
              type="button"
              onClick={() => setSelectedIdx(prev => prev.size === caseStudies.length ? new Set() : new Set(caseStudies.map((_, i) => i)))}
              className="text-[11px] text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              {selectedIdx.size === caseStudies.length ? 'Clear all' : 'Select all'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {caseStudies.map((cs, i) => {
              const active = selectedIdx.has(i)
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => toggleCaseStudy(i)}
                  className={`text-left rounded-lg border p-2.5 transition-all ${
                    active
                      ? 'border-zinc-900 bg-white shadow-sm'
                      : 'border-zinc-200 bg-white/40 hover:border-zinc-300 opacity-70'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`size-3.5 rounded-full flex items-center justify-center transition-colors shrink-0 ${active ? 'bg-zinc-900' : 'border border-zinc-300'}`}>
                      {active && <Check size={9} strokeWidth={3} className="text-white" />}
                    </span>
                    <span className="text-xs font-medium text-zinc-800 truncate">{cs.company}</span>
                    {cs.industry && <span className="text-[10px] text-zinc-400 truncate">· {cs.industry}</span>}
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-snug line-clamp-2 ml-5">{cs.result}</p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <button
        onClick={() => onGenerate(config, name || `${config.channel === 'linkedin' ? 'LinkedIn' : 'Email'} sequence`, selectedCaseStudies)}
        disabled={loading}
        className="flex items-center gap-2 text-sm bg-zinc-900 text-white px-4 py-2 rounded-lg hover:bg-zinc-700 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Generating…' : 'Generate sequence'}
      </button>
    </div>
  )
}

function SavedSequenceCard({
  seq,
  onDelete,
}: {
  seq: Sequence
  onDelete: () => void
}) {
  const [copied, setCopied] = useState(false)

  function handleCopyLink() {
    const url = `${window.location.origin}/share/${seq.share_token}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const typeLabel: Record<SequenceStep['type'], string> = {
    connection_note: 'Connection',
    message: 'Message',
    email: 'Email',
  }
  const typeBadge: Record<SequenceStep['type'], string> = {
    connection_note: 'bg-violet-50 text-violet-600',
    message: 'bg-blue-50 text-blue-600',
    email: 'bg-orange-50 text-orange-600',
  }

  return (
    <div className="rounded-xl border border-zinc-100 bg-white">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-50">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold text-zinc-900 truncate">{seq.name}</span>
            {seq.status === 'approved' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium">
                <CircleCheck size={10} strokeWidth={2.5} />
                Approved
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            {seq.channel === 'linkedin' ? 'LinkedIn' : 'Email'} · {seq.steps.length} steps · {seq.config.tone}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <a
            href={`/share/${seq.share_token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 px-2 py-1 transition-colors"
          >
            <ExternalLink size={12} />
            Open
          </a>
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 px-2 py-1 transition-colors"
          >
            <Link size={12} />
            {copied ? 'Copied!' : 'Share'}
          </button>
          <button onClick={onDelete} className="p-1 rounded text-zinc-300 hover:text-red-500 transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-3">
        {seq.steps.map((step, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center shrink-0 pt-1">
              <div className="flex items-center justify-center size-6 rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-500">{i + 1}</div>
              {i < seq.steps.length - 1 && <div className="w-px flex-1 bg-zinc-100 mt-1.5" />}
            </div>
            <div className="flex-1 min-w-0 pb-2">
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${typeBadge[step.type]}`}>{typeLabel[step.type]}</span>
                <span className="text-[11px] text-zinc-400">Day {step.day}</span>
              </div>
              {step.subject && <p className="text-sm font-medium text-zinc-800 mb-1">{step.subject}</p>}
              <p className="text-xs text-zinc-500 leading-relaxed line-clamp-3">
                <HighlightedContent text={step.content} />
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SequenceBuilder({
  projectId,
  initialSequences,
  caseStudies,
  iterationId,
  iterationChannel,
  iterationSegment,
  customColumns = [],
}: {
  projectId: string
  initialSequences: Sequence[]
  caseStudies: CaseStudy[]
  iterationId: string
  iterationChannel: 'linkedin' | 'email'
  iterationSegment?: { industry?: string | null; geo?: string | null; seniority?: string | null } | null
  customColumns?: string[]
}) {
  // Auto-fill the sequence name from the iteration's target_segment so the
  // user doesn't retype "Design agencies · Europe · C-Suite" every time.
  // They can still rename in the input.
  const defaultSequenceName = [iterationSegment?.industry, iterationSegment?.geo, iterationSegment?.seniority]
    .filter(Boolean)
    .join(' · ')
  // Order ASC so v1 is the oldest version
  const [sequences, setSequences] = useState<Sequence[]>(
    [...initialSequences].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)),
  )
  const [activeIdx, setActiveIdx] = useState(sequences.length ? sequences.length - 1 : 0)
  const [creatingNew, setCreatingNew] = useState(sequences.length === 0)
  const [generating, setGenerating] = useState(false)
  const [pendingSteps, setPendingSteps] = useState<SequenceStep[] | null>(null)
  const [pendingConfig, setPendingConfig] = useState<{ config: SequenceConfig; name: string; caseStudies: CaseStudy[] } | null>(null)
  const [saving, setSaving] = useState(false)

  // Sync when parent passes a new initialSequences list (e.g., iteration switch)
  useEffect(() => {
    const sorted = [...initialSequences].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
    setSequences(sorted)
    setActiveIdx(sorted.length ? sorted.length - 1 : 0)
    setCreatingNew(sorted.length === 0)
    setPendingSteps(null)
    setPendingConfig(null)
  }, [initialSequences, iterationId])

  async function handleGenerate(config: SequenceConfig, name: string, selectedCaseStudies: CaseStudy[]) {
    setGenerating(true)
    setPendingSteps(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, caseStudies: selectedCaseStudies, customColumns }),
      })
      const data = await res.json()
      if (data.steps) {
        setPendingSteps(data.steps)
        setPendingConfig({ config, name, caseStudies: selectedCaseStudies })
      }
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    if (!pendingSteps || !pendingConfig) return
    setSaving(true)
    try {
      const seq = await saveSequence(
        projectId,
        pendingConfig.name,
        pendingConfig.config.channel,
        pendingConfig.config,
        pendingSteps,
        pendingConfig.caseStudies,
        iterationId,
      )
      setSequences(prev => {
        const next = [...prev, seq]
        setActiveIdx(next.length - 1)
        return next
      })
      setCreatingNew(false)
      setPendingSteps(null)
      setPendingConfig(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    await deleteSequence(id)
    setSequences(prev => {
      const next = prev.filter(s => s.id !== id)
      setActiveIdx(idx => Math.max(0, Math.min(idx, next.length - 1)))
      if (next.length === 0) setCreatingNew(true)
      return next
    })
  }

  return (
    <div className="flex gap-8">
      {/* Vertical version list */}
      {(sequences.length > 0 || creatingNew) && (
        <div className="flex flex-col gap-1 shrink-0 w-44">
          {sequences.map((s, i) => {
            const active = !creatingNew && activeIdx === i
            const approved = s.status === 'approved'
            return (
              <button
                key={s.id}
                onClick={() => { setActiveIdx(i); setCreatingNew(false); setPendingSteps(null); setPendingConfig(null) }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-left transition-colors ${
                  active
                    ? 'bg-zinc-100 text-zinc-900'
                    : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700'
                }`}
              >
                <ChannelIcon
                  channel={s.channel}
                  size={12}
                  className={`shrink-0 ${s.channel === 'linkedin' ? 'text-blue-600' : 'text-orange-600'} ${active ? '' : 'opacity-70'}`}
                />
                <span className={`text-[11px] font-mono shrink-0 ${active ? 'text-zinc-500' : 'text-zinc-300'}`}>v{i + 1}</span>
                <span className="text-sm font-medium truncate flex-1">{s.name}</span>
                {approved && <CircleCheck size={13} className="text-emerald-500 shrink-0" fill="#ecfdf5" strokeWidth={2} />}
              </button>
            )
          })}
          <button
            onClick={() => { setCreatingNew(true); setPendingSteps(null); setPendingConfig(null) }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-left transition-colors ${
              creatingNew
                ? 'bg-zinc-100 text-zinc-900'
                : 'text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600'
            }`}
          >
            <Plus size={12} className="shrink-0" />
            <span className="text-sm">New version</span>
          </button>
        </div>
      )}

      {/* Content column */}
      <div className="flex-1 min-w-0">
        <AnimatePresence mode="wait">
          {creatingNew ? (
            <motion.div
              key="create-new"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-6"
            >
              <ConfigForm onGenerate={handleGenerate} loading={generating} caseStudies={caseStudies} iterationChannel={iterationChannel} customColumns={customColumns} defaultName={defaultSequenceName} />

              {pendingSteps && pendingConfig && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-zinc-700">
                      Preview — {pendingConfig.name}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setPendingSteps(null); setPendingConfig(null) }}
                        className="text-xs text-zinc-400 hover:text-zinc-600 px-2 py-1"
                      >
                        Discard
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-1.5 text-xs bg-zinc-900 text-white px-3 py-1.5 rounded-lg hover:bg-zinc-700 disabled:opacity-50"
                      >
                        <Save size={12} />
                        {saving ? 'Saving…' : 'Save sequence'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {pendingSteps.map((step, i) => (
                      <StepCard
                        key={i}
                        step={step}
                        index={i}
                        onEdit={updated => setPendingSteps(prev => prev!.map((s, idx) => idx === i ? updated : s))}
                        onDelete={() => setPendingSteps(prev => prev!.filter((_, idx) => idx !== i))}
                      />
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          ) : sequences[activeIdx] ? (
            <motion.div
              key={sequences[activeIdx].id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <SavedSequenceCard
                seq={sequences[activeIdx]}
                onDelete={() => handleDelete(sequences[activeIdx].id)}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}

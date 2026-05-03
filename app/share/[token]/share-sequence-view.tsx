'use client'

import { useState, useRef, useEffect, useCallback, Fragment } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, Pencil, X, Send, Check, Copy } from 'lucide-react'
import { ChannelIcon } from '@/components/channel-icon'
import { addComment, updateComment, deleteComment, setSequenceApproval } from '@/app/actions/sequences'
import type { Sequence, SequenceStep, SequenceComment, SequenceContext, CaseStudy } from '@/app/actions/sequences'
import type { Contact } from '@/app/actions/pipeline'
import { ClientLogo } from '@/components/client-logo'

const typeLabel: Record<SequenceStep['type'], string> = {
  connection_note: 'Connection Note',
  message: 'Message',
  email: 'Email',
}

// ── text rendering ────────────────────────────────────────────────────────────

type Segment = { text: string; depth: number; placeholder: boolean; start: number; end: number }

function buildSegments(text: string, quotes: string[]): Segment[] {
  let chunks: { text: string; depth: number; start: number }[] = [{ text, depth: 0, start: 0 }]

  for (const quote of quotes) {
    if (!quote) continue
    const next: typeof chunks = []
    for (const chunk of chunks) {
      const idx = chunk.text.indexOf(quote)
      if (idx === -1) { next.push(chunk); continue }
      if (idx > 0) next.push({ text: chunk.text.slice(0, idx), depth: chunk.depth, start: chunk.start })
      next.push({ text: quote, depth: chunk.depth + 1, start: chunk.start + idx })
      const rest = chunk.text.slice(idx + quote.length)
      if (rest) next.push({ text: rest, depth: chunk.depth, start: chunk.start + idx + quote.length })
    }
    chunks = next
  }

  const result: Segment[] = []
  for (const chunk of chunks) {
    let offset = chunk.start
    for (const part of chunk.text.split(/(\{[^}]+\})/g)) {
      if (!part) continue
      const start = offset
      const end = offset + part.length
      result.push({ text: part, depth: chunk.depth, placeholder: part.startsWith('{') && part.endsWith('}'), start, end })
      offset = end
    }
  }
  return result
}

function sliceSegments(segs: Segment[], from: number, to: number): Segment[] {
  const out: Segment[] = []
  for (const s of segs) {
    if (s.end <= from || s.start >= to) continue
    const sliceFrom = Math.max(from, s.start)
    const sliceTo = Math.min(to, s.end)
    out.push({
      text: s.text.slice(sliceFrom - s.start, sliceTo - s.start),
      depth: s.depth,
      placeholder: s.placeholder,
      start: sliceFrom,
      end: sliceTo,
    })
  }
  return out
}

const highlightColors = [
  '',
  'bg-yellow-200/60',
  'bg-yellow-300/70',
  'bg-orange-300/70',
]

const BUILTIN_PLACEHOLDERS = new Set([
  'firstName', 'lastName', 'company', 'position', 'industry', 'mutualFirstFullName',
])

function resolvePlaceholder(name: string, contact: Contact, contextIndustry?: string | null): string | null {
  switch (name) {
    case 'firstName': return contact.first_name?.trim() || null
    case 'lastName': return contact.last_name?.trim() || null
    case 'company': return contact.company_name?.trim() || null
    case 'position': return contact.title?.trim() || null
    case 'industry': return contextIndustry?.trim() || null
    case 'mutualFirstFullName': return null
  }
  return contact.custom_data?.[name]?.trim() || null
}

function CopyStepButton({ step }: { step: SequenceStep }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    const text = step.subject ? `Subject: ${step.subject}\n\n${step.content}` : step.content
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={copy}
      title="Copy raw text with placeholders"
      className="ml-auto flex items-center gap-1 text-[11px] text-zinc-300 hover:text-zinc-700 transition-colors"
    >
      {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function PreviewContent({ text, contact, industry }: { text: string; contact: Contact; industry: string | null }) {
  const parts = text.split(/(\{[a-zA-Z_][a-zA-Z0-9_]*\})/g)
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\{([a-zA-Z_][a-zA-Z0-9_]*)\}$/)
        if (!m) return <span key={i}>{part}</span>
        const name = m[1]
        const resolved = resolvePlaceholder(name, contact, industry)
        const isBuiltin = BUILTIN_PLACEHOLDERS.has(name)
        const cls = isBuiltin ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'
        // Resolved → show real value with placeholder color (still readable as substitution)
        if (resolved) {
          return (
            <span key={i} className={`${cls} rounded px-1`} title={`{${name}}`}>{resolved}</span>
          )
        }
        // Unresolved → keep raw {name} mono so the gap is obvious
        return (
          <span key={i} className={`${cls} rounded px-0.5 font-mono text-[11px]`}>{part}</span>
        )
      })}
    </>
  )
}

function StepContent({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((seg, i) => {
        const hl = highlightColors[Math.min(seg.depth, highlightColors.length - 1)]
        if (seg.placeholder) {
          const name = seg.text.slice(1, -1).trim()
          const isBuiltin = BUILTIN_PLACEHOLDERS.has(name)
          const tone = isBuiltin
            ? { text: 'text-blue-600', bg: 'bg-blue-50' }
            : { text: 'text-violet-700', bg: 'bg-violet-50' }
          return (
            <span
              key={i}
              className={`rounded px-0.5 font-mono text-[11px] ${seg.depth > 0 ? `${hl} ${tone.text}` : `${tone.bg} ${tone.text}`}`}
            >
              {seg.text}
            </span>
          )
        }
        if (seg.depth > 0) return (
          <mark key={i} className={`${hl} text-inherit rounded-sm`}>{seg.text}</mark>
        )
        return <span key={i}>{seg.text}</span>
      })}
    </>
  )
}

// ── context card (offer + ICP) ────────────────────────────────────────────────

const EMPLOYEE_LABELS: Record<string, string> = {
  '1,10': '1–10',
  '11,50': '11–50',
  '51,200': '51–200',
  '201,500': '201–500',
  '501,1000': '501–1000',
  '1001,10000': '1000+',
}

function readArr(icp: Record<string, unknown> | null, ...keys: string[]): string[] {
  if (!icp) return []
  for (const k of keys) {
    const parts = k.split('.')
    let cur: unknown = icp
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[p]
      else { cur = undefined; break }
    }
    if (Array.isArray(cur) && cur.length) return cur as string[]
  }
  return []
}

function ContextCard({ projectName, offerText, icp }: { projectName: string | null; offerText: string | null; icp: Record<string, unknown> | null }) {
  const geo = readArr(icp, 'geo', 'apollo_filters.locations')
  const industries = readArr(icp, 'industries', 'apollo_filters.industries')
  const titlesPrimary = readArr(icp, 'target_roles.primary')
  const titlesSecondary = readArr(icp, 'target_roles.secondary')
  const titles = titlesPrimary.length || titlesSecondary.length ? [...titlesPrimary, ...titlesSecondary] : readArr(icp, 'titles')
  const fundingRounds = readArr(icp, 'funding_rounds')
  const employeeRanges = readArr(icp, 'employee_ranges', 'apollo_filters.employee_ranges')
  const trigger = (icp?.trigger as string | undefined) ?? ''

  const hasIcp = geo.length || industries.length || titles.length || fundingRounds.length || employeeRanges.length || trigger
  if (!offerText && !hasIcp) return null

  return (
    <div className="mt-6 rounded-2xl border border-zinc-100 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-50">
        <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-widest">Campaign</p>
        <p className="text-sm font-semibold text-zinc-900 mt-1">{projectName ?? 'Campaign context'}</p>
        <p className="text-xs text-zinc-400 mt-0.5">Offer and ICP this sequence is targeting</p>
      </div>
      <div className="px-5 py-4 space-y-3">
        {offerText && (
          <div>
            <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Offer</p>
            <p className="text-xs text-zinc-700 leading-relaxed whitespace-pre-wrap">{offerText}</p>
          </div>
        )}
        {geo.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Geography</p>
            <div className="flex flex-wrap gap-1">
              {geo.map(g => <span key={g} className="rounded-full bg-green-50 text-green-700 px-2.5 py-0.5 text-xs">{g}</span>)}
            </div>
          </div>
        )}
        {industries.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Industries</p>
            <div className="flex flex-wrap gap-1">
              {industries.map(i => <span key={i} className="rounded-full bg-blue-50 text-blue-700 px-2.5 py-0.5 text-xs">{i}</span>)}
            </div>
          </div>
        )}
        {titles.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Target roles</p>
            <div className="flex flex-wrap gap-1">
              {titles.map(t => <span key={t} className="rounded-full bg-purple-50 text-purple-700 px-2.5 py-0.5 text-xs">{t}</span>)}
            </div>
          </div>
        )}
        {fundingRounds.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Funding rounds</p>
            <div className="flex flex-wrap gap-1">
              {fundingRounds.map(r => <span key={r} className="rounded-full bg-zinc-900 text-white px-2.5 py-0.5 text-xs">{r}</span>)}
            </div>
          </div>
        )}
        {employeeRanges.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Company size</p>
            <div className="flex flex-wrap gap-1">
              {employeeRanges.map(r => (
                <span key={r} className="rounded-full bg-orange-50 text-orange-700 px-2.5 py-0.5 text-xs">{EMPLOYEE_LABELS[r] ?? r}</span>
              ))}
            </div>
          </div>
        )}
        {trigger && (
          <div>
            <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">Trigger</p>
            <p className="text-xs text-zinc-600">{trigger}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── case studies card ────────────────────────────────────────────────────────

function CaseStudiesCard({ caseStudies }: { caseStudies: CaseStudy[] }) {
  if (!caseStudies || caseStudies.length === 0) return null
  return (
    <div className="mt-4 rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/60 via-orange-50/40 to-white overflow-hidden">
      <div className="px-5 py-4 border-b border-amber-100/60">
        <p className="text-[10px] font-medium text-amber-700/80 uppercase tracking-widest">Proof points</p>
        <p className="text-sm font-semibold text-zinc-900 mt-1">{caseStudies.length} case stud{caseStudies.length === 1 ? 'y' : 'ies'} referenced</p>
        <p className="text-xs text-zinc-500 mt-0.5">Real results powering this outreach</p>
      </div>
      <div className="divide-y divide-amber-100/50">
        {caseStudies.map((cs, i) => (
          <div key={i} className="px-5 py-3.5">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-sm font-semibold text-zinc-900">{cs.company}</span>
              {cs.industry && (
                <span className="text-[10px] font-medium text-amber-700 bg-amber-100/70 rounded-full px-2 py-0.5">{cs.industry}</span>
              )}
            </div>
            <p className="text-sm text-zinc-800 leading-relaxed font-medium">{cs.result}</p>
            {cs.description && (
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{cs.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── comment card ──────────────────────────────────────────────────────────────

function CommentCardItem({
  comment,
  onUpdate,
  onDelete,
}: {
  comment: SequenceComment
  onUpdate: (id: string, content: string) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.content)
  const [saving, setSaving] = useState(false)
  const editRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (editing) setTimeout(() => editRef.current?.focus(), 30) }, [editing])

  async function save() {
    if (!draft.trim()) return
    setSaving(true)
    try {
      await updateComment(comment.id, draft.trim())
      onUpdate(comment.id, draft.trim())
      setEditing(false)
    } finally { setSaving(false) }
  }

  async function remove() {
    await deleteComment(comment.id)
    onDelete(comment.id)
  }

  return (
    <div
      className="group relative bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.07)] overflow-hidden"
      style={{ animation: 'commentSlideIn 180ms cubic-bezier(0.16,1,0.3,1) both' }}
    >
      {!editing && (
        <div className="absolute top-2 right-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg text-zinc-300 hover:text-zinc-600 hover:bg-zinc-50 transition-colors"><Pencil size={11} /></button>
          <button onClick={remove} className="p-1.5 rounded-lg text-zinc-300 hover:text-red-500 hover:bg-zinc-50 transition-colors"><X size={11} /></button>
        </div>
      )}
      <div className="px-4 py-3">
        {editing ? (
          <div className="space-y-2">
            <textarea
              ref={editRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save() }}
              rows={3}
              className="w-full text-xs text-zinc-800 bg-zinc-50 px-2.5 py-2 rounded-lg focus:outline-none focus:bg-zinc-100 resize-none transition-colors"
            />
            <div className="flex justify-end gap-1">
              <button onClick={() => { setEditing(false); setDraft(comment.content) }} className="p-1.5 rounded-lg text-zinc-300 hover:text-zinc-600 hover:bg-zinc-50 transition-colors"><X size={12} /></button>
              <button onClick={save} disabled={!draft.trim() || saving} className="p-1.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-40 transition-colors"><Send size={12} /></button>
            </div>
          </div>
        ) : (
          <>
            {comment.quote && (
              <blockquote className="text-[11px] text-zinc-500 italic border-l-2 border-yellow-300 bg-yellow-50/50 pl-2.5 py-1 mb-2 line-clamp-2">
                {comment.quote}
              </blockquote>
            )}
            <p className="text-xs text-zinc-700 leading-relaxed">{comment.content}</p>
            <p className="text-[10px] text-zinc-300 mt-1.5">
              {new Date(comment.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ── main view ─────────────────────────────────────────────────────────────────

export function ShareSequenceView({
  versions,
  initialActiveId,
  initialCommentsBySeq,
  context,
  previewContact = null,
  embedded = false,
  activeIdControlled,
  onActiveIdChange,
  approvedByChannelControlled,
  onApprovedByChannelChange,
}: {
  versions: Sequence[]
  initialActiveId: string
  initialCommentsBySeq: Record<string, SequenceComment[]>
  context: SequenceContext
  previewContact?: Contact | null
  embedded?: boolean
  activeIdControlled?: string
  onActiveIdChange?: (id: string) => void
  approvedByChannelControlled?: Record<'linkedin' | 'email', string | null>
  onApprovedByChannelChange?: (next: Record<'linkedin' | 'email', string | null>) => void
}) {
  const [activeIdInternal, setActiveIdInternal] = useState(initialActiveId)
  const activeId = activeIdControlled ?? activeIdInternal
  const setActiveId = (id: string) => {
    if (onActiveIdChange) onActiveIdChange(id)
    else setActiveIdInternal(id)
  }
  const [commentsBySeq, setCommentsBySeq] = useState<Record<string, SequenceComment[]>>(initialCommentsBySeq)
  useEffect(() => { setCommentsBySeq(initialCommentsBySeq) }, [initialCommentsBySeq])
  const [pendingStep, setPendingStep] = useState<{ stepIndex: number; quote: string } | null>(null)
  const [draftText, setDraftText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [floatingBtn, setFloatingBtn] = useState<{ quote: string; x: number; y: number; stepIndex: number } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [approvedByChannelInternal, setApprovedByChannelInternal] = useState<Record<'linkedin' | 'email', string | null>>(() => ({
    linkedin: versions.find(v => v.channel === 'linkedin' && v.status === 'approved')?.id ?? null,
    email: versions.find(v => v.channel === 'email' && v.status === 'approved')?.id ?? null,
  }))
  const approvedByChannel = approvedByChannelControlled ?? approvedByChannelInternal
  const setApprovedByChannel = (next: Record<'linkedin' | 'email', string | null>) => {
    if (onApprovedByChannelChange) onApprovedByChannelChange(next)
    else setApprovedByChannelInternal(next)
  }
  const [approving, setApproving] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)

  async function toggleApprove() {
    if (approving) return
    const channel = sequence.channel
    const isApprovedHere = approvedByChannel[channel] === activeId
    const willApprove = !isApprovedHere
    setApproving(true)
    try {
      await setSequenceApproval(activeId, willApprove)
      setApprovedByChannel({
        ...approvedByChannel,
        [channel]: willApprove ? activeId : null,
      })
    } finally { setApproving(false) }
  }

  const sequence = versions.find(v => v.id === activeId) ?? versions[0]
  const comments = commentsBySeq[activeId] ?? []
  const setComments = useCallback((updater: SequenceComment[] | ((prev: SequenceComment[]) => SequenceComment[])) => {
    setCommentsBySeq(prev => ({
      ...prev,
      [activeId]: typeof updater === 'function' ? updater(prev[activeId] ?? []) : updater,
    }))
  }, [activeId])

  function switchVersion(id: string) {
    if (id === activeId) return
    setActiveId(id)
    setPendingStep(null)
    setDraftText('')
    setFloatingBtn(null)
    window.getSelection()?.removeAllRanges()
  }

  useEffect(() => { if (pendingStep) setTimeout(() => textareaRef.current?.focus(), 50) }, [pendingStep])

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('[data-comment-ui]')) {
        setPendingStep(null)
        setDraftText('')
        setFloatingBtn(null)
        window.getSelection()?.removeAllRanges()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  const handleMouseUp = useCallback((stepIndex: number) => {
    setTimeout(() => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) return
      const quote = sel.toString().trim()
      if (!quote) return
      const range = sel.getRangeAt(0)
      const rects = range.getClientRects()
      const last = rects[rects.length - 1] ?? range.getBoundingClientRect()
      setFloatingBtn({
        quote,
        x: last.right + window.scrollX,
        y: last.top + last.height / 2 + window.scrollY,
        stepIndex,
      })
    }, 10)
  }, [])

  async function submit() {
    if (!pendingStep || !draftText.trim()) return
    setSubmitting(true)
    try {
      const c = await addComment(sequence.id, draftText.trim(), pendingStep.stepIndex, pendingStep.quote)
      setComments(prev => [...prev, c])
      setPendingStep(null)
      setDraftText('')
      window.getSelection()?.removeAllRanges()
    } finally { setSubmitting(false) }
  }

  return (
    <>
      <style>{`
        @keyframes commentSlideIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className={embedded ? '' : 'min-h-screen bg-white'}>
        <div className={embedded ? '' : 'max-w-5xl mx-auto px-8 py-14'}>
          <div className={embedded ? 'mb-6 max-w-[560px] mx-auto' : 'mb-10 max-w-[560px] mx-auto'}>
            {!embedded && context.client_name && (
              <div className="flex items-center gap-2.5 mb-4">
                <ClientLogo name={context.client_name} logoUrl={context.client_logo_url} size="md" />
                <span className="text-sm font-medium text-zinc-700">{context.client_name}</span>
              </div>
            )}

            <AnimatePresence mode="wait">
              <motion.div
                key={`title-${activeId}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold text-zinc-900">{sequence.name}</h1>
                  <p className="text-sm text-zinc-400 mt-0.5">
                    {sequence.channel === 'linkedin' ? 'LinkedIn' : 'Email'} · {sequence.steps.length} steps
                  </p>
                  {previewContact && (
                    <button
                      onClick={() => setPreviewMode(p => !p)}
                      className="mt-2 inline-flex items-center gap-2 text-xs"
                    >
                      <span className={`relative inline-block w-8 h-4 rounded-full transition-colors ${previewMode ? 'bg-zinc-900' : 'bg-zinc-200'}`}>
                        <span
                          className="absolute top-0.5 left-0.5 size-3 rounded-full bg-white shadow-sm transition-transform"
                          style={{ transform: previewMode ? 'translateX(16px)' : 'translateX(0)' }}
                        />
                      </span>
                      <span className={previewMode ? 'text-zinc-700' : 'text-zinc-400 hover:text-zinc-600 transition-colors'}>
                        {previewMode
                          ? `Previewing as ${[previewContact.first_name, previewContact.last_name].filter(Boolean).join(' ') || previewContact.email || 'contact'}`
                          : 'Preview with real contact data'}
                      </span>
                    </button>
                  )}
                </div>
                {!embedded && (() => {
                  const channel = sequence.channel
                  const approvedInChannel = approvedByChannel[channel]
                  const isApprovedHere = approvedInChannel === activeId
                  const otherApproved = approvedInChannel !== null && approvedInChannel !== activeId
                  const channelLabel = channel === 'linkedin' ? 'LinkedIn' : 'Email'
                  return (
                    <button
                      onClick={toggleApprove}
                      disabled={approving || otherApproved}
                      title={otherApproved ? `Revoke the approved ${channelLabel} version first` : undefined}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all shrink-0 ${
                        isApprovedHere
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                          : otherApproved
                            ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed border border-zinc-200'
                            : 'bg-zinc-900 text-white hover:bg-zinc-700'
                      } disabled:opacity-60`}
                    >
                      <Check size={12} strokeWidth={3} />
                      {isApprovedHere ? `Approved` : `Approve ${channelLabel}`}
                    </button>
                  )
                })()}
              </motion.div>
            </AnimatePresence>

            {versions.length > 1 && (
              <div className="mt-5 flex items-center gap-2 flex-wrap">
                {versions.map((v, i) => {
                  const active = v.id === activeId
                  const isApproved = approvedByChannel[v.channel] === v.id
                  const accent = v.channel === 'linkedin'
                    ? { active: 'bg-blue-600 text-white', inactive: 'bg-blue-50 text-blue-700 hover:bg-blue-100' }
                    : { active: 'bg-orange-600 text-white', inactive: 'bg-orange-50 text-orange-700 hover:bg-orange-100' }
                  return (
                    <button
                      key={v.id}
                      onClick={() => switchVersion(v.id)}
                      title={`${v.channel === 'linkedin' ? 'LinkedIn' : 'Email'} · ${v.name}${isApproved ? ' · approved' : ''}`}
                      className={`relative size-8 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                        active ? `${accent.active} shadow-sm` : accent.inactive
                      }`}
                    >
                      {i + 1}
                      <span className={`absolute -bottom-0.5 -left-0.5 size-3.5 rounded-full bg-white flex items-center justify-center ${v.channel === 'linkedin' ? 'text-blue-600' : 'text-orange-600'}`}>
                        <ChannelIcon channel={v.channel} size={8} />
                      </span>
                      {isApproved && (
                        <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-emerald-500 ring-2 ring-white flex items-center justify-center">
                          <Check size={7} strokeWidth={4} className="text-white" />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {!embedded && <ContextCard projectName={context.project_name} offerText={context.offer_text} icp={context.icp_json} />}

            <AnimatePresence mode="wait">
              <motion.div
                key={`cases-${activeId}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <CaseStudiesCard caseStudies={sequence.used_case_studies ?? []} />
              </motion.div>
            </AnimatePresence>
          </div>

          <AnimatePresence mode="wait">
          <motion.div
            key={`steps-${activeId}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className={`space-y-10 transition-shadow duration-300 ${
              approvedByChannel[sequence.channel] === activeId
                ? 'rounded-2xl ring-1 ring-emerald-200 shadow-[0_0_0_4px_rgba(16,185,129,0.05)] p-6 bg-emerald-50/20'
                : ''
            }`}
          >
            {sequence.steps.map((step, i) => {
              // Preview mode: render replaced text with preserved placeholder colors so
              // reviewers see what was dynamically substituted. Comments are still listed
              // below each step (selection/floating button disabled).
              if (previewMode && previewContact) {
                const industry = (context.icp_json?.industries as string[] | undefined)?.[0] ?? null
                const previewStepComments = comments.filter(c => c.step_index === i)
                return (
                  <div key={i} className="max-w-[560px] mx-auto">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">{typeLabel[step.type]}</span>
                      <span className="text-xs text-zinc-300">Day {step.day}</span>
                      <CopyStepButton step={step} />
                    </div>
                    {step.subject && (
                      <p className="text-base font-semibold text-zinc-800 mb-2">
                        <PreviewContent text={step.subject} contact={previewContact} industry={industry} />
                      </p>
                    )}
                    <p className="text-[15px] text-zinc-700 leading-8 whitespace-pre-wrap">
                      <PreviewContent text={step.content} contact={previewContact} industry={industry} />
                    </p>
                    {previewStepComments.length > 0 && (
                      <div className="mt-4 border-l-2 border-zinc-100 pl-4 space-y-2">
                        {previewStepComments.map(c => (
                          <CommentCardItem
                            key={c.id}
                            comment={c}
                            onUpdate={(id, content) => setComments(prev => prev.map(x => x.id === id ? { ...x, content } : x))}
                            onDelete={id => setComments(prev => prev.filter(x => x.id !== id))}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              }

              const stepComments = comments.filter(c => c.step_index === i)
              const isPending = pendingStep?.stepIndex === i
              const allQuotes = [
                ...stepComments.filter(c => c.quote).map(c => c.quote!),
                ...(isPending && pendingStep?.quote ? [pendingStep.quote] : []),
              ]

              // Group comments by their quote-end offset in the text
              type Anchor = { end: number; comments: SequenceComment[]; pending: boolean }
              const anchorMap = new Map<number, Anchor>()
              for (const c of stepComments) {
                if (!c.quote) continue
                const idx = step.content.indexOf(c.quote)
                if (idx === -1) continue
                const end = idx + c.quote.length
                const a = anchorMap.get(end) ?? { end, comments: [], pending: false }
                a.comments.push(c)
                anchorMap.set(end, a)
              }
              if (isPending && pendingStep?.quote) {
                const idx = step.content.indexOf(pendingStep.quote)
                if (idx !== -1) {
                  const end = idx + pendingStep.quote.length
                  const a = anchorMap.get(end) ?? { end, comments: [], pending: false }
                  a.pending = true
                  anchorMap.set(end, a)
                }
              }
              // Within each anchor: shorter quotes (more precise) first, then by creation order
              for (const a of anchorMap.values()) {
                a.comments.sort((x, y) => {
                  const lenX = x.quote?.length ?? Infinity
                  const lenY = y.quote?.length ?? Infinity
                  if (lenX !== lenY) return lenX - lenY
                  return new Date(x.created_at).getTime() - new Date(y.created_at).getTime()
                })
              }
              const anchors = Array.from(anchorMap.values()).sort((a, b) => a.end - b.end)

              // Build segments once for the whole step so highlights survive section splits
              const allSegments = buildSegments(step.content, allQuotes)

              // Slice text into sections that end at each anchor
              type Section = { from: number; to: number; anchor?: Anchor }
              const sections: Section[] = []
              let cursor = 0
              for (const a of anchors) {
                sections.push({ from: cursor, to: a.end, anchor: a })
                cursor = a.end
              }
              if (cursor < step.content.length || sections.length === 0) {
                sections.push({ from: cursor, to: step.content.length })
              }

              // Orphans: comments whose quote wasn't found, or have no quote
              const orphanComments = stepComments.filter(c => !c.quote || step.content.indexOf(c.quote) === -1)
              const orphanPending = isPending && (!pendingStep?.quote || step.content.indexOf(pendingStep.quote) === -1)

              const renderPendingForm = () => (
                <div data-comment-ui className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.10)] overflow-hidden" style={{ animation: 'commentSlideIn 180ms cubic-bezier(0.16,1,0.3,1) both' }}>
                  <div className="px-4 pt-4 pb-4 space-y-2">
                    {pendingStep?.quote && (
                      <blockquote className="text-[11px] text-zinc-500 italic border-l-2 border-yellow-300 bg-yellow-50/50 pl-2.5 py-1 line-clamp-2">
                        {pendingStep.quote}
                      </blockquote>
                    )}
                    <textarea
                      ref={textareaRef}
                      value={draftText}
                      onChange={e => setDraftText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }}
                      placeholder="Add a comment…"
                      rows={3}
                      className="w-full text-sm text-zinc-800 placeholder:text-zinc-300 bg-zinc-50 px-3 py-2.5 rounded-xl focus:outline-none focus:bg-zinc-100 resize-none transition-colors"
                    />
                    <div className="flex justify-end gap-1">
                      <button onClick={() => { setPendingStep(null); setDraftText('') }} className="p-2 rounded-lg text-zinc-300 hover:text-zinc-600 hover:bg-zinc-50 transition-colors"><X size={13} /></button>
                      <button onClick={submit} disabled={!draftText.trim() || submitting} className="p-2 rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-30 transition-colors">
                        {submitting ? <span className="text-xs px-0.5">…</span> : <Send size={13} />}
                      </button>
                    </div>
                  </div>
                </div>
              )

              return (
                <div key={i} className="max-w-[560px] mx-auto">
                  {/* Step header */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">{typeLabel[step.type]}</span>
                    <span className="text-xs text-zinc-300">Day {step.day}</span>
                    <CopyStepButton step={step} />
                  </div>
                  {step.subject && <p className="text-base font-semibold text-zinc-800 mb-2">{step.subject}</p>}

                  {/* Interleaved text and comments */}
                  {sections.map((section, si) => (
                    <Fragment key={si}>
                      <div
                        onMouseUp={() => handleMouseUp(i)}
                        className="text-[15px] text-zinc-700 leading-8 whitespace-pre-wrap select-text cursor-text"
                      >
                        <StepContent segments={sliceSegments(allSegments, section.from, section.to)} />
                      </div>
                      {section.anchor && (
                        <div className="my-3 border-l-2 border-yellow-200 pl-4 space-y-2">
                          {section.anchor.comments.map(c => (
                            <CommentCardItem
                              key={c.id}
                              comment={c}
                              onUpdate={(id, content) => setComments(prev => prev.map(x => x.id === id ? { ...x, content } : x))}
                              onDelete={id => setComments(prev => prev.filter(x => x.id !== id))}
                            />
                          ))}
                          {section.anchor.pending && renderPendingForm()}
                        </div>
                      )}
                    </Fragment>
                  ))}

                  {/* Orphan comments at the bottom */}
                  {(orphanComments.length > 0 || orphanPending) && (
                    <div className="mt-4 border-l-2 border-zinc-100 pl-4 space-y-2">
                      {orphanComments.map(c => (
                        <CommentCardItem
                          key={c.id}
                          comment={c}
                          onUpdate={(id, content) => setComments(prev => prev.map(x => x.id === id ? { ...x, content } : x))}
                          onDelete={id => setComments(prev => prev.filter(x => x.id !== id))}
                        />
                      ))}
                      {orphanPending && renderPendingForm()}
                    </div>
                  )}
                </div>
              )
            })}
          </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Floating comment button */}
      {floatingBtn && (
        <div
          data-comment-ui
          className="absolute z-50 -translate-y-1/2"
          style={{ left: floatingBtn.x + 8, top: floatingBtn.y }}
        >
          <button
            onMouseDown={e => { e.preventDefault(); setPendingStep({ stepIndex: floatingBtn.stepIndex, quote: floatingBtn.quote }); setFloatingBtn(null) }}
            className="transition-transform hover:scale-110"
            style={{
              animation: 'commentSlideIn 150ms cubic-bezier(0.16,1,0.3,1) both',
              color: '#ea580c',
              filter: 'drop-shadow(0 0 2px white) drop-shadow(0 0 6px rgba(255,255,255,0.9)) drop-shadow(0 4px 10px rgba(234,88,12,0.3))',
            }}
          >
            <MessageCircle size={20} fill="#fff7ed" strokeWidth={1.75} />
          </button>
        </div>
      )}
    </>
  )
}

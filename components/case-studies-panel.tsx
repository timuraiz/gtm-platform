'use client'

import { useState, useEffect } from 'react'
import { Plus, RotateCcw, X, Pencil, Check } from 'lucide-react'
import { type CaseStudy } from '@/app/actions/clients'
import { saveCaseStudies } from '@/app/actions/clients'

function CaseStudyCard({
  cs,
  onEdit,
  onDelete,
}: {
  cs: CaseStudy
  onEdit: (updated: CaseStudy) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(cs)

  function save() {
    onEdit(draft)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-3 space-y-2">
        <input
          value={draft.company}
          onChange={e => setDraft(d => ({ ...d, company: e.target.value }))}
          placeholder="Company"
          className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400"
        />
        <input
          value={draft.industry ?? ''}
          onChange={e => setDraft(d => ({ ...d, industry: e.target.value }))}
          placeholder="Industry (optional)"
          className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400"
        />
        <input
          value={draft.result}
          onChange={e => setDraft(d => ({ ...d, result: e.target.value }))}
          placeholder="Key result — e.g. 3× revenue in 6 months"
          className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400"
        />
        <textarea
          value={draft.description ?? ''}
          onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
          placeholder="Context (optional)"
          rows={2}
          className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 resize-none"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={() => setEditing(false)} className="text-xs text-zinc-400 hover:text-zinc-600 px-2 py-1">Cancel</button>
          <button onClick={save} className="flex items-center gap-1 text-xs bg-zinc-900 text-white px-2.5 py-1 rounded-lg hover:bg-zinc-700">
            <Check size={11} /> Save
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group rounded-xl border border-zinc-100 bg-white p-3 hover:border-zinc-200 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-zinc-800">{cs.company}</span>
            {cs.industry && (
              <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">{cs.industry}</span>
            )}
            {cs.manual && (
              <span className="text-[10px] bg-zinc-100 text-zinc-400 px-1.5 py-0.5 rounded-full">manual</span>
            )}
          </div>
          <p className="text-xs font-medium text-green-700 mt-1">{cs.result}</p>
          {cs.description && <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{cs.description}</p>}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => setEditing(true)} className="p-1 rounded text-zinc-300 hover:text-zinc-600">
            <Pencil size={12} />
          </button>
          <button onClick={onDelete} className="p-1 rounded text-zinc-300 hover:text-red-500">
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}

function AddCaseStudyForm({ onAdd }: { onAdd: (cs: CaseStudy) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<CaseStudy>({ company: '', result: '' })

  function submit() {
    if (!draft.company.trim() || !draft.result.trim()) return
    onAdd({ ...draft, manual: true })
    setDraft({ company: '', result: '' })
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors py-1"
      >
        <Plus size={13} /> Add manually
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-2">
      <p className="text-xs font-medium text-zinc-600">New case study</p>
      <input
        value={draft.company}
        onChange={e => setDraft(d => ({ ...d, company: e.target.value }))}
        placeholder="Company name"
        className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400"
      />
      <input
        value={draft.industry ?? ''}
        onChange={e => setDraft(d => ({ ...d, industry: e.target.value }))}
        placeholder="Industry (optional)"
        className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400"
      />
      <input
        value={draft.result}
        onChange={e => setDraft(d => ({ ...d, result: e.target.value }))}
        placeholder="Key result — e.g. 3× revenue in 6 months"
        className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400"
      />
      <textarea
        value={draft.description ?? ''}
        onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
        placeholder="Context (optional)"
        rows={2}
        className="w-full text-xs px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400 resize-none"
      />
      <div className="flex gap-2 justify-end">
        <button onClick={() => setOpen(false)} className="text-xs text-zinc-400 hover:text-zinc-600 px-2 py-1">Cancel</button>
        <button
          onClick={submit}
          disabled={!draft.company.trim() || !draft.result.trim()}
          className="flex items-center gap-1 text-xs bg-zinc-900 text-white px-2.5 py-1 rounded-lg hover:bg-zinc-700 disabled:opacity-50"
        >
          <Plus size={11} /> Add
        </button>
      </div>
    </div>
  )
}

export function CaseStudiesPanel({
  clientId,
  websiteUrl,
  initialCaseStudies,
  scrapedAt,
}: {
  clientId: string
  websiteUrl: string | null
  initialCaseStudies: CaseStudy[]
  scrapedAt: string | null
}) {
  const [caseStudies, setCaseStudies] = useState<CaseStudy[]>(initialCaseStudies)
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)

  // Auto-scan on first load if never scraped and has website
  useEffect(() => {
    if (!scrapedAt && websiteUrl) scan()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function scan() {
    if (!websiteUrl) return
    setScanning(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/scrape-case-studies`, { method: 'POST' })
      const data = await res.json()
      if (data.case_studies) setCaseStudies(data.case_studies)
    } finally {
      setScanning(false)
    }
  }

  async function persist(updated: CaseStudy[]) {
    setCaseStudies(updated)
    setSaving(true)
    try {
      await saveCaseStudies(clientId, updated)
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(idx: number, updated: CaseStudy) {
    persist(caseStudies.map((cs, i) => i === idx ? updated : cs))
  }

  function handleDelete(idx: number) {
    persist(caseStudies.filter((_, i) => i !== idx))
  }

  function handleAdd(cs: CaseStudy) {
    persist([...caseStudies, cs])
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-500">
            {scanning
              ? 'Scanning website for case studies…'
              : scrapedAt && !scanning
              ? `${caseStudies.length} found · last scanned ${new Date(scrapedAt).toLocaleDateString('en', { day: 'numeric', month: 'short' })}`
              : 'Not scanned yet'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saving && <span className="text-xs text-zinc-400">Saving…</span>}
          {websiteUrl && (
            <button
              onClick={scan}
              disabled={scanning}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 disabled:opacity-50 transition-colors"
            >
              <RotateCcw size={12} className={scanning ? 'animate-spin' : ''} />
              {scanning ? 'Scanning…' : 'Re-scan'}
            </button>
          )}
        </div>
      </div>

      {/* Scanning skeleton */}
      {scanning && caseStudies.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 h-16 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!scanning && caseStudies.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-zinc-400">No case studies found</p>
          {!websiteUrl && <p className="text-xs text-zinc-300 mt-1">Add a website URL to the client to enable auto-scan</p>}
        </div>
      )}

      {/* Case study cards */}
      {caseStudies.length > 0 && (
        <div className="space-y-2">
          {caseStudies.map((cs, i) => (
            <CaseStudyCard
              key={i}
              cs={cs}
              onEdit={updated => handleEdit(i, updated)}
              onDelete={() => handleDelete(i)}
            />
          ))}
        </div>
      )}

      <AddCaseStudyForm onAdd={handleAdd} />
    </div>
  )
}

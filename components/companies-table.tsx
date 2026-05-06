'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { Search, Upload, Trash2, RefreshCw, Users, ListChecks, ChevronLeft, ChevronRight } from 'lucide-react'
import { type ProjectCompany, detachCompanies, rescrapeNow, classifyCompanies } from '@/app/actions/companies'
import { UploadCompaniesModal } from './upload-companies-modal'
import { CompanyAvatar } from './company-avatar'

const PAGE_SIZE = 25

type FilterKey = 'all' | 'pending' | 'qualified' | 'rejected' | 'csv' | 'pipeline'

export function CompaniesTable({
  companies: initial,
  projectId,
  iterationId,
}: {
  companies: ProjectCompany[]
  projectId: string
  iterationId: string | null
}) {
  const router = useRouter()
  const [companies, setCompanies] = useState<ProjectCompany[]>(initial)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [page, setPage] = useState(1)
  const [extractRunning, setExtractRunning] = useState(false)
  const [extractResult, setExtractResult] = useState<{ contacts: number; domains: number } | null>(null)
  const [classifyRunning, setClassifyRunning] = useState(false)
  const [classifyResult, setClassifyResult] = useState<{ qualified: number; rejected: number; failed: number } | null>(null)

  useEffect(() => { setCompanies(initial); setSelected(new Set()); setPage(1) }, [initial])

  const counts = useMemo(() => ({
    all: companies.length,
    pending: companies.filter(c => c.qualification_status === 'unknown').length,
    qualified: companies.filter(c => c.qualification_status === 'qualified').length,
    rejected: companies.filter(c => c.qualification_status === 'rejected').length,
    csv: companies.filter(c => c.source === 'csv').length,
    pipeline: companies.filter(c => c.source === 'pipeline').length,
  }), [companies])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return companies.filter(c => {
      if (filter === 'pending' && c.qualification_status !== 'unknown') return false
      if (filter === 'qualified' && c.qualification_status !== 'qualified') return false
      if (filter === 'rejected' && c.qualification_status !== 'rejected') return false
      if (filter === 'csv' && c.source !== 'csv') return false
      if (filter === 'pipeline' && c.source !== 'pipeline') return false
      if (q && ![c.name, c.domain, c.segment].some(v => v?.toLowerCase().includes(q))) return false
      return true
    })
  }, [companies, query, filter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  useEffect(() => { if (page > totalPages) setPage(1) }, [totalPages, page])
  useEffect(() => { setPage(1) }, [query, filter])
  const pageStart = (page - 1) * PAGE_SIZE
  const visible = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  function toggleRow(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleAll() {
    const visibleIds = visible.map(c => c.id)
    const allSelected = visible.length > 0 && visible.every(c => selected.has(c.id))
    setSelected(prev => {
      const n = new Set(prev)
      if (allSelected) visibleIds.forEach(id => n.delete(id))
      else visibleIds.forEach(id => n.add(id))
      return n
    })
  }

  async function handleDetach(idsArg?: string[]) {
    const ids = idsArg ?? Array.from(selected)
    if (ids.length === 0) return
    setBusy(true)
    try {
      const idSet = new Set(ids)
      await detachCompanies(projectId, ids)
      setCompanies(prev => prev.filter(c => !idSet.has(c.id)))
      setSelected(new Set())
      router.refresh()
    } finally { setBusy(false) }
  }

  async function handleRescrape(idsArg?: string[]) {
    const ids = idsArg ?? Array.from(selected)
    if (ids.length === 0) return
    setBusy(true)
    try {
      const idSet = new Set(ids)
      const domains = companies.filter(c => idSet.has(c.id)).map(c => c.domain)
      await rescrapeNow(domains)
      const now = new Date().toISOString()
      setCompanies(prev => prev.map(c => idSet.has(c.id) ? { ...c, scraped_at: now } : c))
      setSelected(new Set())
      router.refresh()
    } finally { setBusy(false) }
  }

  async function handleClassify(idsArg?: string[]) {
    const ids = idsArg ?? Array.from(selected)
    if (ids.length === 0) return
    setClassifyRunning(true)
    setClassifyResult(null)
    try {
      const res = await classifyCompanies(projectId, ids)
      setClassifyResult(res)
      setSelected(new Set())
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Classify failed')
    } finally { setClassifyRunning(false) }
  }

  async function handleExtractPeople(idsArg?: string[]) {
    if (!iterationId) return
    const ids = idsArg ?? Array.from(selected)
    if (ids.length === 0) return
    const idSet = new Set(ids)
    const domains = companies.filter(c => idSet.has(c.id)).map(c => c.domain)
    setExtractRunning(true)
    setExtractResult(null)
    try {
      const res = await fetch('/api/pipeline/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, iterationId, step: 'extract_people', domainsOverride: domains }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Extract failed')
      const total = (data.artifact as { total: number })?.total ?? 0
      setExtractResult({ contacts: total, domains: domains.length })
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Extract failed')
    } finally {
      setExtractRunning(false)
    }
  }

  // Operate on the entire current filtered set (uses the filter tabs to scope).
  function bulkIds(): string[] {
    return filtered.map(c => c.id)
  }
  async function bulkDelete() {
    const ids = bulkIds()
    if (ids.length === 0) return
    if (!confirm(`Remove ${ids.length} companies from this project?`)) return
    await handleDetach(ids)
  }
  async function bulkScrape() {
    await handleRescrape(bulkIds())
  }
  async function bulkExtract() {
    if (!iterationId) { alert('Select an iteration first'); return }
    await handleExtractPeople(bulkIds())
  }

  if (companies.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
          <p className="text-sm">No companies yet</p>
          <p className="text-xs">Run the pipeline to discover companies, or upload a CSV</p>
          <button
            onClick={() => setShowUpload(true)}
            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 transition-colors"
          >
            <Upload size={12} />
            Upload CSV
          </button>
        </div>
        {showUpload && <UploadCompaniesModal projectId={projectId} onClose={() => setShowUpload(false)} />}
      </>
    )
  }

  const allSelected = visible.length > 0 && visible.every(c => selected.has(c.id))

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {([
          { key: 'all', label: 'All' },
          { key: 'pending', label: 'Pending' },
          { key: 'qualified', label: 'Qualified' },
          { key: 'rejected', label: 'Rejected' },
          { key: 'csv', label: 'CSV' },
          { key: 'pipeline', label: 'Pipeline' },
        ] as const).map(t => {
          const active = filter === t.key
          return (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`flex items-baseline gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'
              }`}
            >
              <span>{t.label}</span>
              <span className={`text-[10px] tabular-nums ${active ? 'text-zinc-300' : 'text-zinc-400'}`}>{counts[t.key]}</span>
            </button>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search companies…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
          />
        </div>
        <span className="text-sm text-zinc-400">{filtered.length} of {companies.length}</span>

        {selected.size > 0 && (
          <>
            <button
              onClick={() => handleExtractPeople()}
              disabled={extractRunning || !iterationId}
              title={!iterationId ? 'Create or select an iteration first' : `Extract people from ${selected.size} companies`}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              {extractRunning
                ? <span className="size-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                : <Users size={13} />}
              Extract people ({selected.size})
            </button>
            <button
              onClick={() => handleClassify()}
              disabled={classifyRunning || busy}
              title="Run Claude classifier against the project ICP"
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
            >
              {classifyRunning
                ? <span className="size-3.5 rounded-full border-2 border-zinc-300 border-t-zinc-600 animate-spin" />
                : <ListChecks size={13} />}
              Classify ({selected.size})
            </button>
            <button
              onClick={() => handleRescrape()}
              disabled={busy}
              title="Scrape websites now and update scraped_at"
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={13} />
              Re-scrape
            </button>
            <button
              onClick={() => handleDetach()}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              <Trash2 size={13} />
              Remove ({selected.size})
            </button>
          </>
        )}

        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          {filtered.length > 0 && selected.size === 0 && (
            <>
              <button
                onClick={bulkScrape}
                disabled={busy}
                title={`Re-scrape ${filtered.length} ${filter === 'all' ? '' : filter} compan${filtered.length === 1 ? 'y' : 'ies'}`}
                className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
              >
                {busy
                  ? <span className="size-3.5 rounded-full border-2 border-zinc-300 border-t-zinc-600 animate-spin" />
                  : <RefreshCw size={13} />}
                Scrape all ({filtered.length})
              </button>
              <button
                onClick={bulkExtract}
                disabled={extractRunning || !iterationId}
                title={!iterationId ? 'Select an iteration first' : `Extract people from ${filtered.length} ${filter === 'all' ? '' : filter} compan${filtered.length === 1 ? 'y' : 'ies'}`}
                className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
              >
                {extractRunning
                  ? <span className="size-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  : <Users size={13} />}
                Extract from all ({filtered.length})
              </button>
              <button
                onClick={bulkDelete}
                disabled={busy}
                title={`Remove ${filtered.length} ${filter === 'all' ? '' : filter} compan${filtered.length === 1 ? 'y' : 'ies'} from this project`}
                className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
              >
                <Trash2 size={13} />
                Delete all ({filtered.length})
              </button>
            </>
          )}
          <button
            onClick={() => setShowUpload(true)}
            title="Append rows from a CSV. Duplicates (same domain in this project) are skipped."
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            <Upload size={13} />
            Append CSV
          </button>
        </div>
      </div>

      {extractResult && (
        <div className="rounded-lg bg-emerald-50 text-emerald-700 px-3 py-2 text-xs">
          ✓ Extracted {extractResult.contacts} contacts from {extractResult.domains} companies. Switch to Contacts tab to view.
        </div>
      )}
      {classifyResult && (
        <div className="rounded-lg bg-blue-50 text-blue-700 px-3 py-2 text-xs">
          ✓ Classified · {classifyResult.qualified} qualified · {classifyResult.rejected} rejected{classifyResult.failed > 0 ? ` · ${classifyResult.failed} failed` : ''}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-zinc-100 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50">
              <th className="px-4 py-2.5 w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="size-3.5 rounded accent-zinc-900 cursor-pointer" />
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500 w-8">#</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">Company</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">Status</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">Source</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">Segment</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">Scraped</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c, i) => {
              const isSelected = selected.has(c.id)
              return (
                <tr key={c.id} className={`group border-b border-zinc-50 last:border-0 transition-colors ${isSelected ? 'bg-zinc-50' : 'hover:bg-zinc-50'}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={isSelected} onChange={() => toggleRow(c.id)} className="size-3.5 rounded accent-zinc-900 cursor-pointer" />
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-300 tabular-nums">{pageStart + i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CompanyAvatar name={c.name} domain={c.domain} logoUrl={c.logo_url} size={20} />
                      <div className="min-w-0">
                        <p className="text-zinc-700 font-medium truncate">{c.name ?? c.domain}</p>
                        <p className="text-xs text-zinc-400 font-mono truncate">{c.domain}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={c.qualification_status}
                      reasoning={c.reasoning}
                      segment={c.segment}
                      confidence={c.confidence}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      c.source === 'csv' ? 'bg-blue-50 text-blue-700' :
                      c.source === 'manual' ? 'bg-purple-50 text-purple-700' :
                      'bg-zinc-100 text-zinc-600'
                    }`}>
                      {c.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs max-w-[160px] truncate">{c.segment ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {c.scraped_at
                      ? new Date(c.scraped_at).toLocaleDateString('en', { day: 'numeric', month: 'short' })
                      : <span className="text-zinc-300">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-xs text-zinc-400 tabular-nums">
            {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="size-8 flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-zinc-500 tabular-nums px-2">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="size-8 flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {showUpload && <UploadCompaniesModal projectId={projectId} onClose={() => setShowUpload(false)} />}
    </div>
  )
}

function StatusBadge({
  status,
  reasoning,
  segment,
  confidence,
}: {
  status: 'qualified' | 'rejected' | 'unknown'
  reasoning?: string | null
  segment?: string | null
  confidence?: number | null
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function show() {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
    setOpen(true)
  }
  function hide() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), 120)
  }

  const label =
    status === 'qualified' ? '✓ Qualified' :
    status === 'rejected' ? '✗ Rejected' : 'Unknown'
  const cls =
    status === 'qualified' ? 'bg-emerald-50 text-emerald-700' :
    status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-zinc-100 text-zinc-500'

  const hasContext = !!(reasoning || segment || (confidence != null))

  return (
    <span
      ref={wrapRef}
      className="relative inline-block"
      onMouseEnter={hasContext ? show : undefined}
      onMouseLeave={hasContext ? hide : undefined}
    >
      <span
        className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls} ${hasContext ? 'cursor-help' : ''}`}
      >
        {label}
      </span>

      <AnimatePresence>
        {open && hasContext && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            onMouseEnter={show}
            onMouseLeave={hide}
            className="absolute left-0 top-full mt-1.5 z-30 w-80 rounded-xl border border-zinc-100 bg-white shadow-lg p-3 text-left"
          >
            {(segment || confidence != null) && (
              <div className="flex items-center gap-2 mb-2">
                {segment && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 bg-zinc-100 rounded px-1.5 py-0.5">
                    {segment}
                  </span>
                )}
                {confidence != null && (
                  <span className="text-[10px] text-zinc-400 tabular-nums">
                    confidence {confidence}%
                  </span>
                )}
              </div>
            )}
            {reasoning ? (
              <p className="text-xs text-zinc-600 leading-relaxed whitespace-pre-line">
                {reasoning}
              </p>
            ) : (
              <p className="text-xs text-zinc-400 italic">No classifier note recorded.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  )
}

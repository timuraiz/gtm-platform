'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Download, Mail, Trash2, ExternalLink, ChevronLeft, ChevronRight, Upload } from 'lucide-react'
import { type Contact, deleteContact, deleteContacts } from '@/app/actions/pipeline'
import { UploadContactsModal } from './upload-contacts-modal'
import { CompanyAvatar } from './company-avatar'

const PAGE_SIZE = 20

function Avatar({ name }: { name: string }) {
  return (
    <div className="size-7 rounded-full bg-zinc-100 flex items-center justify-center text-[11px] font-semibold text-zinc-500 shrink-0">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-zinc-400 hover:text-zinc-600 px-1.5 py-0.5 rounded bg-zinc-100"
    >
      {copied ? 'copied' : 'copy'}
    </button>
  )
}

type FilterKey = 'all' | 'email' | 'linkedin'

export function ContactsTable({
  contacts: initialContacts,
  readOnly = false,
  projectId,
  iterationId,
}: {
  contacts: Contact[]
  readOnly?: boolean
  projectId?: string
  iterationId?: string
}) {
  const router = useRouter()
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const [showUpload, setShowUpload] = useState(false)

  // Sync when parent passes a new contacts list (e.g., iteration switch)
  useEffect(() => {
    setContacts(initialContacts)
    setSelected(new Set())
    setPage(1)
  }, [initialContacts])

  const counts = useMemo(() => ({
    all: contacts.length,
    email: contacts.filter(c => !!c.email).length,
    linkedin: contacts.filter(c => !c.linkedin_url?.startsWith('apollo-')).length,
  }), [contacts])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return contacts.filter(c => {
      if (filter === 'email' && !c.email) return false
      if (filter === 'linkedin' && c.linkedin_url?.startsWith('apollo-')) return false
      if (q && ![c.first_name, c.last_name, c.title, c.email, c.company_name, c.company_domain].some(v => v?.toLowerCase().includes(q))) return false
      return true
    })
  }, [contacts, query, filter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  useEffect(() => { if (page > totalPages) setPage(1) }, [totalPages, page])
  useEffect(() => { setPage(1) }, [query, filter])
  const pageStart = (page - 1) * PAGE_SIZE
  const visible = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  function exportCsv() {
    const header = 'First Name,Last Name,Title,Email,LinkedIn,Company,Domain'
    const rows = filtered.map(c =>
      [c.first_name, c.last_name, c.title, c.email, c.linkedin_url, c.company_name, c.company_domain]
        .map(v => `"${(v ?? '').replace(/"/g, '""')}"`)
        .join(',')
    )
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'contacts.csv'
    a.click()
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    try {
      await deleteContact(id)
      setContacts(prev => prev.filter(c => c.id !== id))
      setSelected(prev => { const next = new Set(prev); next.delete(id); return next })
      router.refresh()
    } finally { setDeleting(false) }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return
    setDeleting(true)
    try {
      const ids = Array.from(selected)
      await deleteContacts(ids)
      setContacts(prev => prev.filter(c => !selected.has(c.id)))
      setSelected(new Set())
      router.refresh()
    } finally { setDeleting(false) }
  }

  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    const visibleIds = new Set(visible.map(c => c.id))
    const allVisibleSelected = visible.length > 0 && visible.every(c => selected.has(c.id))
    if (allVisibleSelected) {
      setSelected(prev => {
        const next = new Set(prev)
        visibleIds.forEach(id => next.delete(id))
        return next
      })
    } else {
      setSelected(prev => {
        const next = new Set(prev)
        visibleIds.forEach(id => next.add(id))
        return next
      })
    }
  }

  const canUpload = !readOnly && projectId && iterationId

  if (contacts.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
          <p className="text-sm">No contacts yet</p>
          <p className="text-xs">Run the pipeline or upload a CSV</p>
          {canUpload && (
            <button
              onClick={() => setShowUpload(true)}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 transition-colors"
            >
              <Upload size={12} />
              Upload CSV
            </button>
          )}
        </div>
        {showUpload && projectId && iterationId && (
          <UploadContactsModal projectId={projectId} iterationId={iterationId} onClose={() => setShowUpload(false)} />
        )}
      </>
    )
  }

  const allSelected = visible.length > 0 && visible.every(c => selected.has(c.id))

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex items-center gap-1">
        {([
          { key: 'all', label: 'All' },
          { key: 'email', label: 'With email' },
          { key: 'linkedin', label: 'With LinkedIn' },
        ] as const).map(t => {
          const active = filter === t.key
          return (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`flex items-baseline gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'
              }`}
            >
              <span>{t.label}</span>
              <span className={`text-[10px] tabular-nums ${active ? 'text-zinc-300' : 'text-zinc-400'}`}>{counts[t.key]}</span>
            </button>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search contacts…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
          />
        </div>
        <span className="text-sm text-zinc-400">{filtered.length} of {contacts.length}</span>
        {!readOnly && selected.size > 0 && (
          <button
            onClick={handleBulkDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            <Trash2 size={13} />
            Delete {selected.size}
          </button>
        )}
        {!readOnly && (
          <div className="ml-auto flex items-center gap-1.5">
            {canUpload && (
              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                <Upload size={13} />
                Upload CSV
              </button>
            )}
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              <Download size={13} />
              Export CSV
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-100 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50">
              {!readOnly && (
                <th className="px-4 py-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="size-3.5 rounded accent-zinc-900 cursor-pointer"
                  />
                </th>
              )}
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500 w-8">#</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">Name</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">Title</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">Company</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">Email</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500 w-24">Links</th>
              {!readOnly && <th className="px-4 py-2.5 w-10"></th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((c, i) => {
              const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || '—'
              const isApolloId = c.linkedin_url?.startsWith('apollo-')
              const isSelected = selected.has(c.id)
              return (
                <tr
                  key={c.id}
                  className={`group border-b border-zinc-50 last:border-0 transition-colors ${isSelected ? 'bg-zinc-50' : 'hover:bg-zinc-50'}`}
                >
                  {!readOnly && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(c.id)}
                        className="size-3.5 rounded accent-zinc-900 cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 text-xs text-zinc-300 tabular-nums">{pageStart + i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={name} />
                      <span className="font-medium text-zinc-800">{name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 max-w-[200px] truncate">{c.title ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      <CompanyAvatar name={c.company_name} domain={c.company_domain} logoUrl={c.company_logo_url} size={20} />
                      <div className="min-w-0">
                        <p className="text-zinc-700 truncate">{c.company_name ?? '—'}</p>
                        {c.company_domain && (
                          <p className="text-xs text-zinc-400 font-mono truncate">{c.company_domain}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {c.email ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-zinc-600 font-mono text-xs">{c.email}</span>
                        <CopyButton text={c.email} />
                      </div>
                    ) : (
                      <span className="text-zinc-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {c.email && (
                        <a
                          href={`mailto:${c.email}`}
                          title="Send email"
                          className="text-zinc-400 hover:text-zinc-700 transition-colors"
                        >
                          <Mail size={14} />
                        </a>
                      )}
                      {!isApolloId && (
                        <a
                          href={c.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open LinkedIn profile"
                          className="text-zinc-400 hover:text-blue-600 transition-colors"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  </td>
                  {!readOnly && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(c.id)}
                        disabled={deleting}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-300 hover:text-red-500 disabled:opacity-30"
                        title="Delete contact"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-xs text-zinc-400 tabular-nums">
            {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="size-8 flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            {pageButtons(page, totalPages).map((p, i) =>
              p === '…' ? (
                <span key={`gap-${i}`} className="size-8 flex items-center justify-center text-xs text-zinc-300">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`size-8 flex items-center justify-center rounded-lg text-xs font-medium tabular-nums transition-colors ${
                    p === page
                      ? 'bg-zinc-900 text-white'
                      : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
                  }`}
                >
                  {p}
                </button>
              )
            )}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="size-8 flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {showUpload && projectId && iterationId && (
        <UploadContactsModal projectId={projectId} iterationId={iterationId} onClose={() => setShowUpload(false)} />
      )}
    </div>
  )
}

// Compact pagination strip: 1 … (cur-1) cur (cur+1) … last
function pageButtons(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const out: (number | '…')[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) out.push('…')
  for (let p = start; p <= end; p++) out.push(p)
  if (end < total - 1) out.push('…')
  out.push(total)
  return out
}

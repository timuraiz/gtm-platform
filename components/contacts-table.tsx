'use client'

import { useState, useMemo } from 'react'
import { Search, Download, ExternalLink, Mail } from 'lucide-react'
import { type Contact } from '@/app/actions/pipeline'

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

export function ContactsTable({ contacts }: { contacts: Contact[] }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    if (!q) return contacts
    return contacts.filter(c =>
      [c.first_name, c.last_name, c.title, c.email, c.company_name, c.company_domain]
        .some(v => v?.toLowerCase().includes(q))
    )
  }, [contacts, query])

  function exportCsv() {
    const header = 'First Name,Last Name,Title,Email,LinkedIn,Company,Domain'
    const rows = contacts.map(c =>
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

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
        <p className="text-sm">No contacts yet</p>
        <p className="text-xs mt-1">Run the pipeline to extract contacts</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
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
        <button
          onClick={exportCsv}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition-colors"
        >
          <Download size={13} />
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500 w-8">#</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">Name</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">Title</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">Company</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">Email</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500 w-20">Links</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => {
              const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || '—'
              const isApolloId = c.linkedin_url.startsWith('apollo-')
              return (
                <tr key={c.id} className="group border-b border-zinc-50 last:border-0 hover:bg-zinc-50 transition-colors">
                  <td className="px-4 py-3 text-xs text-zinc-300 tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={name} />
                      <span className="font-medium text-zinc-800">{name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 max-w-[200px] truncate">{c.title ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-zinc-700">{c.company_name ?? '—'}</p>
                      {c.company_domain && (
                        <p className="text-xs text-zinc-400 font-mono">{c.company_domain}</p>
                      )}
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
                    <div className="flex items-center gap-2">
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                          <Mail size={13} />
                        </a>
                      )}
                      {!isApolloId && (
                        <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-blue-600 transition-colors">
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

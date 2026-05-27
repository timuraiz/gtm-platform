'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ArchiveRestore, Pencil, Check, ExternalLink, Archive, X } from 'lucide-react'
import {
  type LinkedinAccount,
  createLinkedinAccount,
  updateLinkedinAccount,
  archiveLinkedinAccount,
  unarchiveLinkedinAccount,
} from '@/app/actions/linkedin-accounts'

export function LinkedinAccountsPanel({
  clientId,
  initialAccounts,
}: {
  clientId: string
  initialAccounts: LinkedinAccount[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftUrl, setDraftUrl] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const active = initialAccounts.filter(a => !a.archived_at)
  const archived = initialAccounts.filter(a => a.archived_at)
  const visible = showArchived ? initialAccounts : active

  function submitNew() {
    setError(null)
    if (!draftName.trim()) {
      setError('Name is required')
      return
    }
    startTransition(async () => {
      try {
        await createLinkedinAccount(clientId, { name: draftName, profile_url: draftUrl || null })
        setDraftName('')
        setDraftUrl('')
        setCreating(false)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to add account')
      }
    })
  }

  function startEdit(a: LinkedinAccount) {
    setEditId(a.id)
    setEditName(a.name)
    setEditUrl(a.profile_url ?? '')
    setError(null)
  }

  function submitEdit() {
    if (!editId) return
    setError(null)
    if (!editName.trim()) {
      setError('Name is required')
      return
    }
    startTransition(async () => {
      try {
        await updateLinkedinAccount(editId, clientId, { name: editName, profile_url: editUrl || null })
        setEditId(null)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to update account')
      }
    })
  }

  function archive(id: string) {
    startTransition(async () => {
      await archiveLinkedinAccount(id, clientId)
      router.refresh()
    })
  }

  function unarchive(id: string) {
    startTransition(async () => {
      await unarchiveLinkedinAccount(id, clientId)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-zinc-900">LinkedIn accounts</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Operators who run LinkedIn iterations for this client. Used for the best-performers leaderboard in Stats.
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => { setCreating(true); setError(null) }}
            className="shrink-0 flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 transition-colors"
          >
            <Plus size={12} strokeWidth={2.5} />
            Add account
          </button>
        )}
      </div>

      {creating && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-2">
          <input
            autoFocus
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            placeholder="Account name (e.g. Tim, Sender #2)"
            className="w-full text-sm px-3 py-2 border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400"
          />
          <input
            value={draftUrl}
            onChange={e => setDraftUrl(e.target.value)}
            placeholder="LinkedIn profile URL (optional)"
            className="w-full text-xs px-3 py-2 border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400"
          />
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => { setCreating(false); setDraftName(''); setDraftUrl(''); setError(null) }}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
            >
              <X size={12} />
              Cancel
            </button>
            <button
              onClick={submitNew}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-900 text-white text-xs font-medium px-3 py-1.5 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              <Check size={12} />
              Save
            </button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-zinc-400">No accounts yet.</p>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500 uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">Profile URL</th>
                <th className="px-4 py-2 w-20" />
              </tr>
            </thead>
            <tbody>
              {visible.map(a => {
                const isEdit = editId === a.id
                return (
                  <tr key={a.id} className={`border-t border-zinc-100 ${a.archived_at ? 'opacity-50' : ''}`}>
                    {isEdit ? (
                      <td colSpan={3} className="px-4 py-3">
                        <div className="space-y-2">
                          <input
                            autoFocus
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            className="w-full text-sm px-3 py-1.5 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400"
                          />
                          <input
                            value={editUrl}
                            onChange={e => setEditUrl(e.target.value)}
                            placeholder="LinkedIn profile URL (optional)"
                            className="w-full text-xs px-3 py-1.5 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400"
                          />
                          {error && <p className="text-xs text-rose-600">{error}</p>}
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => { setEditId(null); setError(null) }}
                              className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={submitEdit}
                              disabled={pending}
                              className="flex items-center gap-1.5 rounded-lg bg-zinc-900 text-white text-xs font-medium px-3 py-1 hover:bg-zinc-700 disabled:opacity-50"
                            >
                              <Check size={12} />
                              Save
                            </button>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-2 text-zinc-800">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{a.name}</span>
                            {a.archived_at && (
                              <span className="text-[10px] uppercase tracking-wider text-zinc-400 border border-zinc-200 rounded px-1.5 py-0.5 shrink-0">
                                Archived
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-zinc-500 truncate max-w-xs">
                          {a.profile_url ? (
                            <a
                              href={a.profile_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 hover:underline hover:text-zinc-700 transition-colors"
                            >
                              <ExternalLink size={11} />
                              {a.profile_url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                            </a>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          {!a.archived_at && (
                            <button
                              onClick={() => startEdit(a)}
                              className="p-1 text-zinc-300 hover:text-zinc-700 transition-colors mr-1"
                              aria-label="Edit account"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          {a.archived_at ? (
                            <button
                              onClick={() => unarchive(a.id)}
                              disabled={pending}
                              className="p-1 text-zinc-300 hover:text-emerald-600 transition-colors disabled:opacity-50"
                              aria-label="Unarchive account"
                            >
                              <ArchiveRestore size={14} />
                            </button>
                          ) : (
                            <button
                              onClick={() => archive(a.id)}
                              disabled={pending}
                              className="p-1 text-zinc-300 hover:text-rose-500 transition-colors disabled:opacity-50"
                              aria-label="Archive account"
                            >
                              <Archive size={14} />
                            </button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {archived.length > 0 && (
        <button
          onClick={() => setShowArchived(s => !s)}
          className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          {showArchived ? 'Hide archived' : `Show ${archived.length} archived account${archived.length === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  )
}

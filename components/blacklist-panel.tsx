'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, AlertCircle } from 'lucide-react'
import {
  type BlacklistEntry,
  type BlacklistInput,
  addBlacklistEntries,
  removeBlacklistEntry,
} from '@/app/actions/blacklist'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LINKEDIN_RE = /linkedin\.com\//i

function parseEntries(text: string): { entries: BlacklistInput[]; invalid: string[] } {
  const entries: BlacklistInput[] = []
  const invalid: string[] = []
  for (const raw of text.split(/[\n,;]/)) {
    const line = raw.trim()
    if (!line) continue
    if (EMAIL_RE.test(line)) {
      entries.push({ email: line })
    } else if (LINKEDIN_RE.test(line)) {
      entries.push({ linkedin_url: line })
    } else {
      invalid.push(line)
    }
  }
  return { entries, invalid }
}

export function BlacklistPanel({
  clientId,
  initialEntries,
}: {
  clientId: string
  initialEntries: BlacklistEntry[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [text, setText] = useState('')
  const [reason, setReason] = useState('')
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  function submit() {
    const { entries, invalid } = parseEntries(text)
    if (entries.length === 0) {
      setFeedback({ kind: 'err', msg: 'Enter at least one email or LinkedIn URL.' })
      return
    }
    const trimmedReason = reason.trim() || null
    const payload = entries.map((e) => ({ ...e, reason: trimmedReason }))
    startTransition(async () => {
      const res = await addBlacklistEntries(clientId, payload)
      const parts = [`${res.added} added`]
      if (res.skipped > 0) parts.push(`${res.skipped} duplicate${res.skipped === 1 ? '' : 's'}`)
      if (invalid.length > 0) parts.push(`${invalid.length} unrecognized line${invalid.length === 1 ? '' : 's'}`)
      setFeedback({ kind: 'ok', msg: parts.join(' · ') })
      setText('')
      setReason('')
      router.refresh()
    })
  }

  function remove(id: string) {
    startTransition(async () => {
      await removeBlacklistEntry(id, clientId)
      setFeedback(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3">
        <div>
          <h3 className="text-sm font-medium text-zinc-900">Add to blacklist</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Paste emails or LinkedIn URLs — one per line, or comma-separated. These contacts are
            automatically excluded from CSV uploads and Apollo extractions for this client.
          </p>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="jane@example.com&#10;https://linkedin.com/in/jane-doe"
          rows={4}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-400 focus:outline-none font-mono"
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional) — e.g. unsubscribed, asked to stop"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-400 focus:outline-none"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={pending || text.trim().length === 0}
            className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            {pending ? 'Adding…' : 'Add'}
          </button>
          {feedback && (
            <span
              className={`flex items-center gap-1.5 text-xs ${
                feedback.kind === 'ok' ? 'text-zinc-500' : 'text-red-600'
              }`}
            >
              {feedback.kind === 'err' && <AlertCircle size={12} />}
              {feedback.msg}
            </span>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-zinc-900">
            Blacklisted contacts <span className="text-zinc-400 font-normal">({initialEntries.length})</span>
          </h3>
        </div>
        {initialEntries.length === 0 ? (
          <p className="text-sm text-zinc-400">No blacklisted contacts yet.</p>
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Email</th>
                  <th className="text-left px-4 py-2 font-medium">LinkedIn</th>
                  <th className="text-left px-4 py-2 font-medium">Reason</th>
                  <th className="px-4 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {initialEntries.map((entry) => (
                  <tr key={entry.id} className="border-t border-zinc-100">
                    <td className="px-4 py-2 text-zinc-700 truncate max-w-xs">{entry.email ?? '—'}</td>
                    <td className="px-4 py-2 text-zinc-700 truncate max-w-xs">
                      {entry.linkedin_url ? (
                        <a
                          href={entry.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {entry.linkedin_url.replace(/^https?:\/\/(www\.)?/, '')}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2 text-zinc-500 truncate max-w-xs">{entry.reason ?? '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => remove(entry.id)}
                        disabled={pending}
                        className="p-1 text-zinc-300 hover:text-red-500 transition-colors disabled:opacity-50"
                        aria-label="Remove from blacklist"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X } from 'lucide-react'
import { updateProjectPositiveReplyCriteria } from '@/app/actions/projects'

// Per-project description of what counts as a positive reply. Fed to
// Claude in /api/replies/inbound to auto-classify incoming messages.

export function PositiveReplyCriteriaEditor({
  projectId,
  value,
}: {
  projectId: string
  value: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  function save() {
    startTransition(async () => {
      await updateProjectPositiveReplyCriteria(projectId, draft)
      setEditing(false)
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-sm font-semibold text-zinc-900">Positive-reply criteria</p>
        {!editing ? (
          <button
            onClick={() => { setDraft(value ?? ''); setEditing(true) }}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            <Pencil size={11} />
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { setDraft(value ?? ''); setEditing(false) }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
            >
              <X size={11} />
              Cancel
            </button>
            <button
              onClick={save}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-900 text-white text-xs font-medium px-2.5 py-1 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              <Check size={11} />
              Save
            </button>
          </div>
        )}
      </div>
      <p className="text-[11px] text-zinc-400 mb-3">
        Plain English. Claude uses this to classify each LinkedIn reply as positive / neutral / negative.
        Example: &ldquo;Positive means the prospect agrees to a call, asks specific questions about pricing/integration, or names a current pain we solve. Generic &lsquo;thanks for reaching out&rsquo; is neutral.&rdquo;
      </p>
      {editing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={5}
          placeholder="Describe what a positive reply looks like for this campaign…"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-400 focus:outline-none"
        />
      ) : value ? (
        <p className="text-sm text-zinc-700 whitespace-pre-wrap">{value}</p>
      ) : (
        <p className="text-sm text-zinc-400 italic">No criteria yet — AI will fall back to a generic interpretation.</p>
      )}
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Check, X, Pencil } from 'lucide-react'
import { setClientTelegramChatId } from '@/app/actions/clients'

// Compact editable field that lives in the client header. The TG chat id
// is what /api/replies/inbound returns to n8n so it knows where to dispatch
// the reply notification.

export function ClientTelegramChatField({ clientId, value }: { clientId: string; value: string | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  function save() {
    const next = draft.trim() || null
    startTransition(async () => {
      await setClientTelegramChatId(clientId, next)
      setEditing(false)
      router.refresh()
    })
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) } }}
          placeholder="-1001234567890"
          className="text-xs px-2.5 py-1.5 border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 w-44 font-mono"
        />
        <button
          onClick={save}
          disabled={pending}
          className="p-1.5 text-zinc-400 hover:text-emerald-600 transition-colors disabled:opacity-50"
          title="Save"
        >
          <Check size={14} />
        </button>
        <button
          onClick={() => { setDraft(value ?? ''); setEditing(false) }}
          className="p-1.5 text-zinc-400 hover:text-zinc-700 transition-colors"
          title="Cancel"
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${value ? 'border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100/60' : 'border-dashed border-zinc-200 text-zinc-400 hover:border-zinc-300 hover:text-zinc-600'}`}
      title={value ? `Reply notifications go to chat ${value}` : 'Set Telegram chat id to receive reply notifications'}
    >
      <Send size={11} strokeWidth={2.25} />
      {value ? <span className="font-mono">{value}</span> : 'Set TG chat'}
      <Pencil size={10} className="opacity-50" />
    </button>
  )
}

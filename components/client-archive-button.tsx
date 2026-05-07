'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore } from 'lucide-react'
import { archiveClient, unarchiveClient } from '@/app/actions/clients'

export function ClientArchiveButton({
  clientId,
  archived,
}: {
  clientId: string
  archived: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function run() {
    startTransition(async () => {
      if (archived) {
        await unarchiveClient(clientId)
      } else {
        await archiveClient(clientId)
      }
      setConfirming(false)
      router.refresh()
    })
  }

  if (archived) {
    return (
      <button
        onClick={run}
        disabled={pending}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-50"
      >
        <ArchiveRestore size={12} />
        {pending ? 'Restoring…' : 'Unarchive'}
      </button>
    )
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={run}
          disabled={pending}
          className="px-3 py-1.5 text-xs rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
        >
          {pending ? 'Archiving…' : 'Confirm archive'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition-colors"
    >
      <Archive size={12} />
      Archive
    </button>
  )
}

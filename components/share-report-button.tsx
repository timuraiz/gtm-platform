'use client'

import { useState } from 'react'
import { Link as LinkIcon, ExternalLink, Check } from 'lucide-react'

export function ShareReportButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false)
  const url = typeof window !== 'undefined' ? `${window.location.origin}/share/c/${token}` : `/share/c/${token}`

  function copy() {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        onClick={copy}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition-colors"
      >
        {copied ? <Check size={12} className="text-emerald-500" /> : <LinkIcon size={12} />}
        {copied ? 'Copied!' : 'Share report'}
      </button>
      <a
        href={`/share/c/${token}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition-colors"
      >
        <ExternalLink size={12} />
        Open
      </a>
    </div>
  )
}

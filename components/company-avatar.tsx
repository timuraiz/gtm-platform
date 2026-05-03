'use client'

import { useState } from 'react'

export function CompanyAvatar({
  name,
  domain,
  logoUrl,
  size = 18,
}: {
  name: string | null
  domain: string | null
  logoUrl: string | null
  size?: number
}) {
  // Fall back to Google's favicon service when no Apollo logo is stored
  const candidate = logoUrl || (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null)
  const [failed, setFailed] = useState(false)

  if (!candidate || failed) {
    const initial = (name ?? domain ?? '?').trim().charAt(0).toUpperCase() || '?'
    return (
      <span
        style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}
        className="rounded-md bg-zinc-100 flex items-center justify-center font-semibold text-zinc-500 shrink-0 select-none"
      >
        {initial}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={candidate}
      alt={name ?? domain ?? ''}
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className="rounded-md object-contain bg-white shrink-0 ring-1 ring-zinc-100"
    />
  )
}

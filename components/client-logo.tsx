'use client'

import { useState } from 'react'

export function ClientLogo({
  name,
  logoUrl,
  size = 'md',
}: {
  name: string
  logoUrl: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const [failed, setFailed] = useState(false)

  const sizeClass = {
    sm: 'size-5 text-[10px]',
    md: 'size-8 text-sm',
    lg: 'size-12 text-lg',
  }[size]

  if (!logoUrl || failed) {
    return (
      <span className={`${sizeClass} rounded-lg bg-zinc-200 flex items-center justify-center font-semibold text-zinc-600 shrink-0 select-none`}>
        {name[0].toUpperCase()}
      </span>
    )
  }

  return (
    <img
      src={logoUrl}
      alt={name}
      onError={() => setFailed(true)}
      className={`${sizeClass} rounded-lg object-contain bg-white shrink-0`}
    />
  )
}

'use client'

import { useEffect, useState } from 'react'

type DetailEvent = CustomEvent<{ kind: string; id?: string; toolName: string }>

/**
 * Tracks entity IDs that were just created/updated by the chat assistant.
 * Pages call `useFreshlyCreated('project')` and pass the entity id; receive a
 * boolean for whether to play a stronger entry animation.
 *
 * IDs auto-clear after 4s so the highlight is one-shot.
 */
export function useFreshlyCreated(kind: string): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as DetailEvent).detail
      if (detail?.kind !== kind || !detail.id) return
      setIds(prev => {
        const next = new Set(prev)
        next.add(detail.id!)
        return next
      })
      const timer = setTimeout(() => {
        setIds(prev => {
          const next = new Set(prev)
          next.delete(detail.id!)
          return next
        })
      }, 4000)
      return () => clearTimeout(timer)
    }
    window.addEventListener('chat-data-changed', onChange)
    return () => window.removeEventListener('chat-data-changed', onChange)
  }, [kind])

  return ids
}

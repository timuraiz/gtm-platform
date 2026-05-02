'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/app/actions/clients'
import { modalOverlay, modalContent, springGentle } from '@/lib/animations'

function LogoPreview({ url, name }: { url: string; name: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [stage, setStage] = useState(0)

  useEffect(() => {
    if (!url) { setSrc(null); setStage(0); return }
    try {
      const domain = new URL(url).hostname.replace(/^www\./, '')
      setStage(0)
      setSrc(`https://logo.clearbit.com/${domain}`)
    } catch {
      setSrc(null)
    }
  }, [url])

  const advance = () => {
    if (!url) return
    try {
      const domain = new URL(url).hostname.replace(/^www\./, '')
      if (stage === 0) { setStage(1); setSrc(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`) }
      else setSrc(null)
    } catch { setSrc(null) }
  }

  if (!src) {
    return (
      <div className="size-16 rounded-2xl bg-zinc-100 flex items-center justify-center text-2xl font-bold text-zinc-400 select-none">
        {name ? name[0].toUpperCase() : '?'}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt=""
      onError={advance}
      className="size-16 rounded-2xl object-contain bg-white border border-zinc-100 p-1"
    />
  )
}

export function CreateClientModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError('')
    try {
      const fd = new FormData(e.currentTarget)
      await createClient(fd)
      router.refresh()
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setPending(false)
    }
  }

  return (
    <motion.div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      variants={modalOverlay}
      initial="hidden"
      animate="show"
      exit="hidden"
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl shadow-black/10 p-6 mx-4"
        variants={modalContent}
        initial="hidden"
        animate="show"
        exit="hidden"
        transition={springGentle}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">New client</h2>
            <p className="text-sm text-zinc-400 mt-0.5">Add a company to your workspace</p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 transition-colors text-lg leading-none mt-0.5"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Logo preview */}
          <div className="flex items-center gap-4">
            <LogoPreview url={url} name={name} />
            <div className="flex-1 space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1 block">Company name</label>
                <input
                  name="name"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-400 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1 block">Website</label>
                <input
                  name="website_url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://acme.com"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-400 focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-zinc-200 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !name}
              className="flex-1 rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 transition-colors"
            >
              {pending ? 'Creating…' : 'Create client'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}

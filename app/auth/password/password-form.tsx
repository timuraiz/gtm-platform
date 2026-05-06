'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mail, AlertCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

const ALLOWED_DOMAIN = 'leadsmore.agency'

export function PasswordForm({ next }: { next: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmed = email.trim()
    if (!trimmed.toLowerCase().endsWith('@' + ALLOWED_DOMAIN)) {
      setError(`Access is restricted to @${ALLOWED_DOMAIN} emails. DM @timuraizatvafin on Telegram to request access.`)
      return
    }
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmed,
        password,
      })
      if (error) {
        setError(error.message)
        return
      }
      router.push(next)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-5">
      <div className="flex items-center gap-2">
        <span className="size-8 rounded-xl bg-zinc-900 flex items-center justify-center">
          <Mail size={15} className="text-white" />
        </span>
        <span className="text-sm font-semibold text-zinc-900">Leadsmore</span>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-zinc-900 tracking-tight">Sign in with password</h1>
        <p className="text-sm text-zinc-500 mt-1">Bypass for when email rate limit blocks OTP</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Email</label>
        <input
          type="email"
          autoFocus
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={pending}
          className="w-full px-3.5 py-2.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 transition-colors disabled:opacity-50"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Password</label>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          disabled={pending}
          className="w-full px-3.5 py-2.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 transition-colors disabled:opacity-50"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 text-red-700 px-3 py-2 text-xs">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-zinc-900 text-white text-sm font-medium py-2.5 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
      >
        {pending && <Loader2 size={14} className="animate-spin" />}
        Sign in
      </button>

      <Link
        href="/auth/sign-in"
        className="block text-center text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
      >
        Use email code instead
      </Link>
    </form>
  )
}

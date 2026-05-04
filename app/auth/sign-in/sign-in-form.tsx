'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, ArrowLeft, AlertCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

const COOLDOWN_KEY = 'gtm_otp_cooldown'
const COOLDOWN_MS = 60_000
const ALLOWED_DOMAIN = 'leadsmore.agency'

type StoredCooldown = { email: string; until: number }
function readCooldown(): StoredCooldown | null {
  if (typeof window === 'undefined') return null
  try {
    const s = window.localStorage.getItem(COOLDOWN_KEY)
    return s ? JSON.parse(s) as StoredCooldown : null
  } catch { return null }
}
function saveCooldown(email: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(COOLDOWN_KEY, JSON.stringify({ email, until: Date.now() + COOLDOWN_MS }))
}

export function SignInForm({ next }: { next: string }) {
  const router = useRouter()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [resendCooldown, setResendCooldown] = useState(0)
  const codeInputRef = useRef<HTMLInputElement | null>(null)

  // Restore cooldown across page reloads / step navigation
  useEffect(() => {
    const stored = readCooldown()
    if (stored && stored.until > Date.now()) {
      const remaining = Math.ceil((stored.until - Date.now()) / 1000)
      setEmail(stored.email)
      setResendCooldown(remaining)
      setStep('code')
    }
  }, [])

  useEffect(() => {
    if (step === 'code') setTimeout(() => codeInputRef.current?.focus(), 100)
  }, [step])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  async function sendOtp(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    const trimmed = email.trim()
    if (!trimmed.includes('@')) { setError('Enter a valid email'); return }
    if (!trimmed.toLowerCase().endsWith('@' + ALLOWED_DOMAIN)) {
      setError(`Access is restricted to @${ALLOWED_DOMAIN} emails. DM @timuraizatvafin on Telegram to request access.`)
      return
    }

    // If we already sent to this email recently, skip the API call — code is still valid
    const stored = readCooldown()
    if (stored && stored.email.toLowerCase() === trimmed.toLowerCase() && stored.until > Date.now()) {
      setStep('code')
      setResendCooldown(Math.ceil((stored.until - Date.now()) / 1000))
      return
    }

    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { shouldCreateUser: true },
      })
      if (error) {
        const msg = error.message.toLowerCase()
        if (msg.includes('rate limit')) {
          setError('Too many requests. Wait a minute and try again — if you already received a code, just enter it.')
        } else {
          setError(error.message)
        }
        return
      }
      saveCooldown(trimmed)
      setStep('code')
      setResendCooldown(Math.floor(COOLDOWN_MS / 1000))
    })
  }

  async function verifyOtp(fullCode: string) {
    setError(null)
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: fullCode,
        type: 'email',
      })
      if (error) {
        setError('Invalid or expired code. Try again.')
        setCode('')
        codeInputRef.current?.focus()
        return
      }
      if (typeof window !== 'undefined') window.localStorage.removeItem(COOLDOWN_KEY)
      router.push(next)
      router.refresh()
    })
  }

  function handleCodeChange(val: string) {
    const sanitized = val.replace(/\D/g, '').slice(0, 10)
    setCode(sanitized)
  }

  function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (code.length >= 6) verifyOtp(code)
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex items-center gap-2 mb-8">
        <span className="size-8 rounded-xl bg-zinc-900 flex items-center justify-center">
          <Mail size={15} className="text-white" />
        </span>
        <span className="text-sm font-semibold text-zinc-900">GTM Platform</span>
      </div>

      <AnimatePresence mode="wait">
        {step === 'email' ? (
          <motion.form
            key="email"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onSubmit={sendOtp}
            className="space-y-5"
          >
            <div>
              <h1 className="text-xl font-semibold text-zinc-900 tracking-tight">Sign in or sign up</h1>
              <p className="text-sm text-zinc-500 mt-1">We&apos;ll send a 6-digit code to your email</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Email</label>
              <input
                type="email"
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
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
              disabled={pending || resendCooldown > 0}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-zinc-900 text-white text-sm font-medium py-2.5 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              {pending && <Loader2 size={14} className="animate-spin" />}
              {resendCooldown > 0 ? `Wait ${resendCooldown}s` : 'Send code'}
            </button>
            {resendCooldown > 0 && (
              <p className="text-[11px] text-zinc-400 text-center">
                Code already sent. Check your inbox or wait to retry.
              </p>
            )}

            <Link
              href="/auth/password"
              className="block text-center text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              Sign in with password instead
            </Link>
          </motion.form>
        ) : (
          <motion.form
            key="code"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onSubmit={handleCodeSubmit}
            className="space-y-5"
          >
            <button
              type="button"
              onClick={() => { setStep('email'); setError(null); setCode('') }}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 transition-colors"
            >
              <ArrowLeft size={12} />
              Use a different email
            </button>

            <div>
              <h1 className="text-xl font-semibold text-zinc-900 tracking-tight">Enter the code</h1>
              <p className="text-sm text-zinc-500 mt-1">
                Sent to <span className="text-zinc-700 font-medium">{email}</span>
              </p>
            </div>

            <input
              ref={codeInputRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={e => handleCodeChange(e.target.value)}
              placeholder="••••••"
              disabled={pending}
              className="w-full text-center text-2xl font-semibold tracking-[0.4em] text-zinc-900 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-900 disabled:opacity-50 transition-colors tabular-nums py-3 placeholder:tracking-normal placeholder:text-zinc-300"
            />

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 text-red-700 px-3 py-2 text-xs">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={pending || code.length < 6}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-zinc-900 text-white text-sm font-medium py-2.5 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              {pending && <Loader2 size={14} className="animate-spin" />}
              Verify
            </button>

            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">
                {pending ? 'Verifying…' : 'Code expires in 60 minutes'}
              </span>
              <button
                type="button"
                onClick={() => sendOtp()}
                disabled={resendCooldown > 0 || pending}
                className="text-zinc-500 hover:text-zinc-800 disabled:text-zinc-300 transition-colors font-medium"
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  )
}

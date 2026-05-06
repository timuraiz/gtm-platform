'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, AlertCircle, Loader2 } from 'lucide-react'
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
  const [digits, setDigits] = useState<string[]>(Array(8).fill(''))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [resendCooldown, setResendCooldown] = useState(0)
  const digitRefs = useRef<Array<HTMLInputElement | null>>(Array(8).fill(null))
  const code = digits.join('')

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
    if (step === 'code') setTimeout(() => digitRefs.current[0]?.focus(), 100)
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
        setDigits(Array(8).fill(''))
        setTimeout(() => digitRefs.current[0]?.focus(), 50)
        return
      }
      if (typeof window !== 'undefined') window.localStorage.removeItem(COOLDOWN_KEY)
      router.push(next)
      router.refresh()
    })
  }

  // Auto-submit when all 6 digits filled — useEffect ensures verifyOtp captures fresh email state
  useEffect(() => {
    const full = digits.join('')
    if (full.length === 8 && digits.every(d => d !== '')) {
      verifyOtp(full)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits])

  function handleDigitChange(index: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    if (digit && index < 7) digitRefs.current[index + 1]?.focus()
  }

  function handleDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) digitRefs.current[index - 1]?.focus()
    if (e.key === 'ArrowLeft' && index > 0) digitRefs.current[index - 1]?.focus()
    if (e.key === 'ArrowRight' && index < 7) digitRefs.current[index + 1]?.focus()
  }

  function handleDigitPaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 8)
    if (!pasted) return
    const next = Array(8).fill('')
    pasted.split('').forEach((ch, i) => { next[i] = ch })
    setDigits(next)
    digitRefs.current[Math.min(pasted.length, 7)]?.focus()
  }

  function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (code.length >= 8) verifyOtp(code)
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-10">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2 lg:hidden">Leadsmore</p>
        <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">Welcome back</h1>
        <p className="text-sm text-zinc-400 mt-1">Sign in to your workspace</p>
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
              <h1 className="sr-only">Sign in</h1>
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
              onClick={() => { setStep('email'); setError(null); setDigits(Array(8).fill('')) }}
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

            <div className="flex gap-2 justify-between" onPaste={handleDigitPaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={el => { digitRefs.current[i] = el }}
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  maxLength={1}
                  value={d}
                  disabled={pending}
                  onChange={e => handleDigitChange(i, e.target.value)}
                  onKeyDown={e => handleDigitKeyDown(i, e)}
                  className="w-11 h-12 text-center text-lg font-semibold text-zinc-900 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 disabled:opacity-50 transition-all tabular-nums caret-transparent"
                />
              ))}
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 text-red-700 px-3 py-2 text-xs">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={pending || code.length < 8}
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

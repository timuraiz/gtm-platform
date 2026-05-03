'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { UserPlus, X, AlertCircle, Trash2 } from 'lucide-react'
import { inviteMember, removeMember, type TeamMember } from '@/app/actions/team'

export function TeamPanel({
  members,
  currentEmail,
}: {
  members: TeamMember[]
  currentEmail: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [showInvite, setShowInvite] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const res = await inviteMember(email)
      if (!res.ok) {
        setError(res.error ?? 'Invite failed')
        return
      }
      setSuccess(`${email.trim().toLowerCase()} can now sign in`)
      setEmail('')
      router.refresh()
      setTimeout(() => setSuccess(null), 4000)
    })
  }

  function handleRemove(id: string, memberEmail: string) {
    if (!confirm(`Remove ${memberEmail} from the team?`)) return
    startTransition(async () => {
      await removeMember(id)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-400">{members.length} member{members.length === 1 ? '' : 's'}</p>
        <button
          onClick={() => setShowInvite(s => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 transition-colors"
        >
          <UserPlus size={12} />
          Invite member
        </button>
      </div>

      <AnimatePresence initial={false}>
        {showInvite && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onSubmit={handleInvite}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-zinc-100 bg-white p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  autoFocus
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="teammate@example.com"
                  disabled={pending}
                  className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 transition-colors disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-zinc-900 text-white text-xs font-medium px-3 py-2 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                >
                  {pending ? 'Adding…' : 'Invite'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowInvite(false); setError(null); setEmail('') }}
                  className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 text-red-700 px-3 py-2 text-xs">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}
              <p className="text-[11px] text-zinc-400">
                They&apos;ll need to sign in at <span className="font-mono text-zinc-600">/auth/sign-in</span> with this email.
              </p>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {success && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg bg-emerald-50 text-emerald-700 px-3 py-2 text-xs"
        >
          {success}
        </motion.div>
      )}

      <div className="rounded-2xl border border-zinc-100 bg-white overflow-hidden">
        {members.map(m => {
          const isYou = currentEmail && m.email.toLowerCase() === currentEmail.toLowerCase()
          const initial = m.email[0]?.toUpperCase() ?? '?'
          return (
            <div key={m.id} className="group flex items-center gap-3 px-5 py-3 border-b border-zinc-50 last:border-0 hover:bg-zinc-50/60 transition-colors">
              <span className="size-8 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                {initial}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-800 truncate">{m.email}</span>
                  {isYou && <span className="text-[10px] text-zinc-400 uppercase tracking-wide">You</span>}
                </div>
                <p className="text-[11px] text-zinc-400">
                  Added {new Date(m.created_at).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {m.invited_by_email && ` · invited by ${m.invited_by_email}`}
                </p>
              </div>
              {!isYou && (
                <button
                  onClick={() => handleRemove(m.id, m.email)}
                  disabled={pending}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-zinc-300 hover:text-red-500 hover:bg-zinc-50 disabled:opacity-30"
                  title="Remove from team"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

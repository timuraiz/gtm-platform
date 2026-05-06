'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

const FEATURES = [
  {
    title: 'Smart pipeline',
    body: 'Apollo-powered company discovery with AI qualification against your ICP.',
  },
  {
    title: 'AI sequences',
    body: 'Multi-step messages generated from your offer, case studies, and segment.',
  },
  {
    title: 'Iteration analytics',
    body: 'Track every campaign axis — industry × region × seniority — and learn fast.',
  },
]

const ease = [0.16, 1, 0.3, 1] as const

export default function LandingPage() {
  return (
    <div
      className="min-h-screen flex flex-col text-white"
      style={{
        background: 'radial-gradient(ellipse 80% 50% at 50% -5%, rgba(255,255,255,0.06) 0%, transparent 70%), #09090b',
      }}
    >
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-6 max-w-6xl mx-auto w-full">
        <span className="text-sm font-semibold tracking-tight">Leadsmore</span>
        <Link
          href="/auth/sign-in"
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          Sign in <ArrowRight size={13} />
        </Link>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 pt-16 pb-32">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease }}
          className="max-w-3xl space-y-8"
        >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease, delay: 0.05 }}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3.5 py-1 text-xs text-zinc-400"
          >
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Invite-only · leadsmore.agency
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease, delay: 0.1 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.08]"
          >
            B2B outreach,
            <br />
            <span className="text-zinc-500">done right.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.2 }}
            className="text-lg text-zinc-400 max-w-lg mx-auto leading-relaxed"
          >
            Run structured campaigns, generate AI-powered sequences, and track what actually
            converts — across every client, project, and iteration.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease, delay: 0.3 }}
          >
            <Link
              href="/auth/sign-in"
              className="inline-flex items-center gap-2 rounded-xl bg-white text-zinc-950 px-7 py-3.5 text-sm font-semibold hover:bg-zinc-100 transition-colors shadow-lg shadow-black/20"
            >
              Get access
              <ArrowRight size={14} />
            </Link>
          </motion.div>
        </motion.div>
      </div>

      {/* Feature strip */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease, delay: 0.5 }}
        className="border-t border-zinc-800/60 bg-zinc-950/40 backdrop-blur"
      >
        <div className="max-w-4xl mx-auto px-8 py-12 grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-12">
          {FEATURES.map((f) => (
            <div key={f.title} className="space-y-2">
              <p className="text-sm font-semibold text-white">{f.title}</p>
              <p className="text-sm text-zinc-500 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

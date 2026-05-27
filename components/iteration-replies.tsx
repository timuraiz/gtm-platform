'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ExternalLink, MessageSquareText, Sparkles, Check, ChevronDown, Inbox } from 'lucide-react'
import { setReplySentiment, type Reply, type Sentiment } from '@/app/actions/replies'
import { type LinkedinAccount } from '@/app/actions/linkedin-accounts'

const SENTIMENT_META: Record<Sentiment, { label: string; chip: string; dot: string }> = {
  positive: { label: 'Positive', chip: 'bg-emerald-50 text-emerald-700 border-emerald-100', dot: 'bg-emerald-500' },
  neutral:  { label: 'Neutral',  chip: 'bg-zinc-50 text-zinc-600 border-zinc-100',         dot: 'bg-zinc-300' },
  negative: { label: 'Negative', chip: 'bg-rose-50 text-rose-700 border-rose-100',         dot: 'bg-rose-500' },
}

type Filter = 'all' | Sentiment

export function IterationReplies({
  replies,
  accounts,
}: {
  replies: Reply[]
  accounts: LinkedinAccount[]
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const accountById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts])

  // Group consecutive messages by contact so threads read top-down. We keep
  // chronological order across contacts (newest message first), and within
  // a contact's group we sort messages chronologically (oldest first) so
  // the conversation reads naturally.
  const grouped = useMemo(() => {
    const filtered = filter === 'all'
      ? replies
      : replies.filter(r => r.sentiment === filter)

    const byContact = new Map<string, Reply[]>()
    for (const r of filtered) {
      const arr = byContact.get(r.contact_li_url) ?? []
      arr.push(r)
      byContact.set(r.contact_li_url, arr)
    }
    const groups = Array.from(byContact.entries()).map(([li, msgs]) => {
      const sorted = [...msgs].sort((a, b) => new Date(a.message_sent_at).getTime() - new Date(b.message_sent_at).getTime())
      const latest = sorted[sorted.length - 1]
      const hasPositive = msgs.some(m => m.sentiment === 'positive')
      return { contact_li_url: li, messages: sorted, latest, hasPositive }
    })
    // Newest thread first (by latest message timestamp).
    groups.sort((a, b) => new Date(b.latest.message_sent_at).getTime() - new Date(a.latest.message_sent_at).getTime())
    return groups
  }, [replies, filter])

  const counts = useMemo(() => {
    const seenContacts = new Set<string>()
    const positiveContacts = new Set<string>()
    const negativeContacts = new Set<string>()
    const neutralContacts = new Set<string>()
    for (const r of replies) {
      seenContacts.add(r.contact_li_url)
      if (r.sentiment === 'positive') positiveContacts.add(r.contact_li_url)
      else if (r.sentiment === 'negative') negativeContacts.add(r.contact_li_url)
      else if (r.sentiment === 'neutral') neutralContacts.add(r.contact_li_url)
    }
    return {
      all: seenContacts.size,
      positive: positiveContacts.size,
      neutral: neutralContacts.size,
      negative: negativeContacts.size,
    }
  }, [replies])

  if (replies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3 max-w-2xl mx-auto">
        <Inbox size={28} className="text-zinc-300" />
        <p className="text-sm">No replies yet</p>
        <p className="text-xs text-center max-w-md">
          Replies show up here once n8n forwards them to <span className="font-mono text-zinc-500">/api/replies/inbound</span>.
          Make sure this iteration has an external campaign name and the operator account is registered.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-1 flex-wrap">
        <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} count={counts.all} tone="zinc" />
        <FilterChip label="Positive" active={filter === 'positive'} onClick={() => setFilter('positive')} count={counts.positive} tone="emerald" />
        <FilterChip label="Neutral"  active={filter === 'neutral'}  onClick={() => setFilter('neutral')}  count={counts.neutral}  tone="zinc" />
        <FilterChip label="Negative" active={filter === 'negative'} onClick={() => setFilter('negative')} count={counts.negative} tone="rose" />
      </div>

      <div className="space-y-3">
        {grouped.map(g => (
          <ThreadCard
            key={g.contact_li_url}
            messages={g.messages}
            accountById={accountById}
          />
        ))}
        {grouped.length === 0 && (
          <p className="text-sm text-zinc-400">No replies match this filter.</p>
        )}
      </div>
    </div>
  )
}

function FilterChip({
  label, active, onClick, count, tone,
}: { label: string; active: boolean; onClick: () => void; count: number; tone: 'zinc' | 'emerald' | 'rose' }) {
  const activeCls = tone === 'emerald'
    ? 'bg-emerald-600 text-white'
    : tone === 'rose' ? 'bg-rose-600 text-white' : 'bg-zinc-900 text-white'
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${active ? activeCls : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
    >
      {label}
      <span className={`text-[10px] tabular-nums ${active ? 'opacity-70' : 'text-zinc-400'}`}>{count}</span>
    </button>
  )
}

function ThreadCard({
  messages,
  accountById,
}: {
  messages: Reply[]
  accountById: Map<string, LinkedinAccount>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [expandedAll, setExpandedAll] = useState(false)
  const first = messages[0]
  const latest = messages[messages.length - 1]
  const account = latest.linkedin_account_id ? accountById.get(latest.linkedin_account_id) : null
  const visible = expandedAll || messages.length <= 1 ? messages : [latest]
  const sentimentMeta = latest.sentiment ? SENTIMENT_META[latest.sentiment] : null

  function setSentiment(replyId: string, next: Sentiment | null) {
    startTransition(async () => {
      await setReplySentiment(replyId, next)
      router.refresh()
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border border-zinc-100 bg-white overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-zinc-50 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {first.contact_avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={first.contact_avatar_url} alt="" className="size-9 rounded-full object-cover shrink-0" />
          ) : (
            <div className="size-9 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-medium text-zinc-500 shrink-0">
              {(first.contact_name ?? '?').slice(0, 1)}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <a
                href={first.contact_li_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-zinc-900 hover:underline truncate"
              >
                {first.contact_name ?? 'Unknown'}
              </a>
              <ExternalLink size={11} className="text-zinc-300 shrink-0" />
            </div>
            <p className="text-[11px] text-zinc-400 truncate">
              {[first.contact_headline, first.contact_company].filter(Boolean).join(' · ') || '—'}
            </p>
            {account && (
              <p className="text-[10px] uppercase tracking-wider text-zinc-400 mt-0.5">
                Replying to {account.name}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {sentimentMeta && (
            <SentimentMenu
              currentSentiment={latest.sentiment}
              onPick={s => setSentiment(latest.id, s)}
              confidence={latest.sentiment_confidence}
              reason={latest.sentiment_reason}
              pending={pending}
            />
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="px-5 py-4 space-y-3">
        {messages.length > 1 && !expandedAll && (
          <button
            onClick={() => setExpandedAll(true)}
            className="text-[11px] text-zinc-400 hover:text-zinc-700 transition-colors flex items-center gap-1"
          >
            <ChevronDown size={11} />
            Show {messages.length - 1} earlier message{messages.length === 2 ? '' : 's'}
          </button>
        )}
        {visible.map(m => (
          <MessageRow key={m.id} reply={m} />
        ))}
      </div>
    </motion.div>
  )
}

function MessageRow({ reply }: { reply: Reply }) {
  const sentimentMeta = reply.sentiment ? SENTIMENT_META[reply.sentiment] : null
  return (
    <div className="flex gap-3">
      <span className={`size-1.5 rounded-full mt-2 shrink-0 ${sentimentMeta?.dot ?? 'bg-zinc-200'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] text-zinc-400">
            {new Date(reply.message_sent_at).toLocaleString('en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
          {sentimentMeta && (
            <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${sentimentMeta.chip}`}>
              {sentimentMeta.label}
              {reply.sentiment_confidence !== null && reply.sentiment_confidence < 0.85 && (
                <span className="opacity-60">{Math.round(reply.sentiment_confidence * 100)}%</span>
              )}
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed">{reply.message_text}</p>
        {reply.sentiment_reason && reply.sentiment_reason !== 'manual override' && (
          <p className="mt-1.5 text-[11px] text-zinc-400 flex items-start gap-1">
            <Sparkles size={10} className="text-amber-500 mt-0.5 shrink-0" />
            {reply.sentiment_reason}
          </p>
        )}
      </div>
    </div>
  )
}

function SentimentMenu({
  currentSentiment,
  onPick,
  confidence,
  reason,
  pending,
}: {
  currentSentiment: Sentiment | null
  onPick: (s: Sentiment | null) => void
  confidence: number | null
  reason: string | null
  pending: boolean
}) {
  const [open, setOpen] = useState(false)
  const meta = currentSentiment ? SENTIMENT_META[currentSentiment] : null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={pending}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${meta?.chip ?? 'bg-zinc-50 text-zinc-500 border-zinc-100'}`}
        title={reason ?? undefined}
      >
        {currentSentiment ? <MessageSquareText size={10} /> : <Sparkles size={10} />}
        {meta?.label ?? 'No verdict'}
        {confidence !== null && currentSentiment && confidence < 0.85 && (
          <span className="opacity-60">{Math.round(confidence * 100)}%</span>
        )}
        <ChevronDown size={9} className="opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-20 w-44 rounded-xl border border-zinc-100 bg-white shadow-lg overflow-hidden">
            {(['positive', 'neutral', 'negative'] as Sentiment[]).map(s => {
              const sm = SENTIMENT_META[s]
              return (
                <button
                  key={s}
                  onClick={() => { onPick(s); setOpen(false) }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-zinc-50 transition-colors text-left"
                >
                  <span className={`size-1.5 rounded-full ${sm.dot}`} />
                  <span className="flex-1">{sm.label}</span>
                  {currentSentiment === s && <Check size={11} strokeWidth={3} className="text-zinc-400" />}
                </button>
              )
            })}
            {currentSentiment && (
              <button
                onClick={() => { onPick(null); setOpen(false) }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-50 border-t border-zinc-50 transition-colors text-left"
              >
                Clear verdict
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, MessageSquareQuote, Check, Clock, Layers } from 'lucide-react'
import type { Sequence, SequenceComment, SequenceContext } from '@/app/actions/sequences'
import type { Contact } from '@/app/actions/pipeline'
import type { Iteration } from '@/app/actions/iterations'
import { setProjectContactsApproval, setSequenceApproval } from '@/app/actions/sequences'
import { ShareSequenceView } from '@/app/share/[token]/share-sequence-view'
import { ContactsTable } from '@/components/contacts-table'
import { ClientLogo } from '@/components/client-logo'

type TabKey = 'sequences' | 'contacts'

export function ShareProjectView({
  projectId,
  projectName,
  versions,
  initialCommentsBySeq,
  context,
  contacts,
  previewContact,
  initialContactsApproved,
  initialTab,
  iterations,
  activeIterationId,
}: {
  projectId: string
  projectName: string
  versions: Sequence[]
  initialCommentsBySeq: Record<string, SequenceComment[]>
  context: SequenceContext
  contacts: Contact[]
  previewContact: Contact | null
  initialContactsApproved: boolean
  initialTab: TabKey
  iterations: Iteration[]
  activeIterationId: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<TabKey>(initialTab)

  // Re-sync iteration-scoped state when iteration switches (server passes new props)
  useEffect(() => {
    setContactsApproved(initialContactsApproved)
  }, [initialContactsApproved, activeIterationId])

  useEffect(() => {
    const newActive =
      versions.find(v => v.status === 'approved')?.id ??
      versions[versions.length - 1]?.id ??
      ''
    setActiveSeqId(newActive)
    setApprovedByChannel({
      linkedin: versions.find(v => v.channel === 'linkedin' && v.status === 'approved')?.id ?? null,
      email: versions.find(v => v.channel === 'email' && v.status === 'approved')?.id ?? null,
    })
  }, [versions, activeIterationId])

  function switchIteration(id: string) {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.set('iter', id)
    router.push(`?${params.toString()}`, { scroll: false })
  }
  const [contactsApproved, setContactsApproved] = useState(initialContactsApproved)
  const [approvingContacts, setApprovingContacts] = useState(false)

  // Lifted from ShareSequenceView so the approve button can live in the tab bar
  const initialActiveId =
    versions.find(v => v.status === 'approved')?.id ??
    versions[versions.length - 1]?.id ??
    ''
  const [activeSeqId, setActiveSeqId] = useState(initialActiveId)
  const [approvedByChannel, setApprovedByChannel] = useState<Record<'linkedin' | 'email', string | null>>(() => ({
    linkedin: versions.find(v => v.channel === 'linkedin' && v.status === 'approved')?.id ?? null,
    email: versions.find(v => v.channel === 'email' && v.status === 'approved')?.id ?? null,
  }))
  const [approvingSeq, setApprovingSeq] = useState(false)

  const activeSeq = versions.find(v => v.id === activeSeqId) ?? versions[0]
  const sequencesApproved = approvedByChannel.linkedin !== null || approvedByChannel.email !== null

  async function toggleContactsApproval() {
    if (approvingContacts) return
    const next = !contactsApproved
    setApprovingContacts(true)
    try {
      await setProjectContactsApproval(projectId, next)
      setContactsApproved(next)
    } finally { setApprovingContacts(false) }
  }

  async function toggleSeqApproval() {
    if (!activeSeq || approvingSeq) return
    const channel = activeSeq.channel
    const isApprovedHere = approvedByChannel[channel] === activeSeqId
    const willApprove = !isApprovedHere
    setApprovingSeq(true)
    try {
      await setSequenceApproval(activeSeqId, willApprove)
      setApprovedByChannel({
        ...approvedByChannel,
        [channel]: willApprove ? activeSeqId : null,
      })
    } finally { setApprovingSeq(false) }
  }

  const channelsPresent = (['linkedin', 'email'] as const).filter(ch => versions.some(v => v.channel === ch))

  type StatusItem = { kind: 'contacts' | 'channel'; channel?: 'linkedin' | 'email'; approved: boolean }
  const contactsStatuses: StatusItem[] = contacts.length > 0 ? [{ kind: 'contacts', approved: contactsApproved }] : []
  const sequencesStatuses: StatusItem[] = channelsPresent.map(ch => ({
    kind: 'channel',
    channel: ch,
    approved: approvedByChannel[ch] !== null,
  }))

  const tabs = [
    {
      key: 'contacts' as const,
      label: 'Contacts',
      icon: Users,
      count: contacts.length,
      statuses: contactsStatuses,
      allApproved: contacts.length > 0 && contactsApproved,
    },
    {
      key: 'sequences' as const,
      label: 'Sequences',
      icon: MessageSquareQuote,
      count: versions.length,
      statuses: sequencesStatuses,
      allApproved: sequencesStatuses.length > 0 && sequencesStatuses.every(s => s.approved),
    },
  ]

  // Approve button shown in the tab bar (height aligned with tabs)
  function renderApproveButton() {
    if (tab === 'contacts') {
      if (contacts.length === 0) return null
      return (
        <button
          onClick={toggleContactsApproval}
          disabled={approvingContacts}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all shrink-0 ${contactsApproved
            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
            : 'bg-zinc-900 text-white hover:bg-zinc-700'
            } disabled:opacity-60`}
        >
          <Check size={12} strokeWidth={3} />
          {contactsApproved ? 'Approved' : 'Approve contacts'}
        </button>
      )
    }
    if (tab === 'sequences' && activeSeq) {
      const channel = activeSeq.channel
      const approvedInChannel = approvedByChannel[channel]
      const isApprovedHere = approvedInChannel === activeSeqId
      const otherApproved = approvedInChannel !== null && approvedInChannel !== activeSeqId
      const channelLabel = channel === 'linkedin' ? 'LinkedIn' : 'Email'
      return (
        <button
          onClick={toggleSeqApproval}
          disabled={approvingSeq || otherApproved}
          title={otherApproved ? `Revoke the approved ${channelLabel} version first` : undefined}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all shrink-0 ${isApprovedHere
            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
            : otherApproved
              ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed border border-zinc-200'
              : 'bg-zinc-900 text-white hover:bg-zinc-700'
            } disabled:opacity-60`}
        >
          <Check size={12} strokeWidth={3} />
          {isApprovedHere ? 'Approved' : `Approve ${channelLabel}`}
        </button>
      )
    }
    return null
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-8 pt-14 pb-20">
        {/* Project header */}
        <div className="max-w-[560px] mx-auto mb-8">
          {context.client_name && (
            <div className="flex items-center gap-2.5 mb-4">
              <ClientLogo name={context.client_name} logoUrl={context.client_logo_url} size="md" />
              <span className="text-sm font-medium text-zinc-700">{context.client_name}</span>
            </div>
          )}
          <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">{projectName}</h1>
          <p className="text-sm text-zinc-400 mt-1">Campaign overview</p>

          {iterations.length > 1 && (
            <div className="mt-5 flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-zinc-400 font-semibold pr-1">
                <Layers size={12} strokeWidth={2.5} />
              </span>
              {iterations.map(it => {
                const active = it.id === activeIterationId
                const dot = it.status === 'running' ? 'bg-blue-500' : it.status === 'finished' ? 'bg-emerald-500' : it.status === 'discarded' ? 'bg-rose-400' : 'bg-zinc-300'
                return (
                  <button
                    key={it.id}
                    onClick={() => switchIteration(it.id)}
                    title={`${it.name} · ${it.status}`}
                    className={`relative flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${active
                      ? 'bg-zinc-900 text-white shadow-sm'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      } ${it.status === 'discarded' ? 'opacity-60' : ''}`}
                  >
                    <span className={`size-2 rounded-full ${dot} ${it.status === 'running' ? 'animate-pulse' : ''}`} />
                    <span className={it.status === 'discarded' ? 'line-through decoration-rose-300' : ''}>{it.name}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Tabs — sticky, with approve button at same height */}
        <div className="sticky top-0 z-20 -mx-8 px-8 bg-white/80 backdrop-blur-md border-b border-zinc-100">
          <div className="max-w-[760px] mx-auto flex items-center justify-between gap-3">
            <div className="flex gap-1">
              {tabs.map(t => {
                const active = tab === t.key
                const Icon = t.icon
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${active ? 'text-zinc-900' : t.allApproved ? 'text-emerald-700 hover:text-emerald-800' : 'text-zinc-400 hover:text-zinc-600'
                      }`}
                  >
                    <Icon size={14} strokeWidth={active ? 2.25 : 2} />
                    {t.label}
                    <span className={`text-[10px] tabular-nums ${active ? 'text-zinc-400' : t.allApproved ? 'text-emerald-500' : 'text-zinc-300'}`}>{t.count}</span>
                    {t.statuses.length > 0 && (
                      <span className="flex items-center gap-1 ml-0.5">
                        {t.statuses.map((s, i) => <StatusDot key={i} status={s} />)}
                      </span>
                    )}
                    {active && (
                      <motion.span
                        layoutId="share-tab-underline"
                        className={`absolute bottom-0 left-0 right-0 h-0.5 ${t.allApproved ? 'bg-emerald-500' : 'bg-zinc-900'}`}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                      />
                    )}
                  </button>
                )
              })}
            </div>
            {renderApproveButton()}
          </div>
        </div>

        {/* Tab content */}
        <div className="mt-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              {tab === 'sequences' ? (
                versions.length > 0 ? (
                  <ShareSequenceView
                    versions={versions}
                    initialActiveId={initialActiveId}
                    initialCommentsBySeq={initialCommentsBySeq}
                    context={context}
                    previewContact={previewContact}
                    embedded
                    activeIdControlled={activeSeqId}
                    onActiveIdChange={setActiveSeqId}
                    approvedByChannelControlled={approvedByChannel}
                    onApprovedByChannelChange={setApprovedByChannel}
                  />
                ) : (
                  <EmptyState title="No sequences yet" subtitle="Sequences will appear here once generated" />
                )
              ) : (
                contacts.length > 0 ? (
                  <div className={`transition-shadow duration-300 ${contactsApproved ? 'rounded-2xl ring-1 ring-emerald-200 shadow-[0_0_0_4px_rgba(16,185,129,0.05)] p-4 bg-emerald-50/20' : ''}`}>
                    <ContactsTable contacts={contacts} readOnly />
                  </div>
                ) : (
                  <EmptyState title="No contacts yet" subtitle="Contacts will appear here once the pipeline runs" />
                )
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
      <p className="text-sm">{title}</p>
      <p className="text-xs mt-1">{subtitle}</p>
    </div>
  )
}

function StatusDot({ status }: { status: { kind: 'contacts' | 'channel'; channel?: 'linkedin' | 'email'; approved: boolean } }) {
  const channelLabel = status.channel === 'linkedin' ? 'LinkedIn' : status.channel === 'email' ? 'Email' : 'Contacts'
  const title = status.approved ? `${channelLabel} approved` : `${channelLabel} awaiting review`

  if (status.approved) {
    return (
      <span className="size-3.5 rounded-full bg-emerald-500 flex items-center justify-center" title={title}>
        <Check size={9} strokeWidth={4} className="text-white" />
      </span>
    )
  }
  return (
    <span className="text-zinc-300" title={title}>
      <Clock size={12} strokeWidth={2} />
    </span>
  )
}

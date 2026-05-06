'use client'

import { useRef, useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useChat } from '@ai-sdk/react'
import { isToolUIPart, isReasoningUIPart, getToolName, DefaultChatTransport, type UIMessage } from 'ai'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, Link as LinkIcon, Check, Copy, Mail, Play, CircleCheck, CircleSlash, Circle, UserCheck } from 'lucide-react'
import { ChannelIcon } from './channel-icon'
import { fadeUp, blurIn, scaleIn, staggerContainer, springGentle, spring } from '@/lib/animations'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TEXTAREA_MIN = 42
const TEXTAREA_MAX = 240

export function autosize(el: HTMLTextAreaElement) {
  // Measure natural content height without disturbing the visible height
  // (saves current inline style, briefly clears it to read scrollHeight, restores)
  const prev = el.style.height
  el.style.transition = 'none'
  el.style.height = '0px'
  const measured = el.scrollHeight
  el.style.height = prev
  // Force a reflow so the browser commits the restored height before re-enabling transition
  void el.offsetHeight
  el.style.transition = ''
  const next = Math.min(Math.max(measured, TEXTAREA_MIN), TEXTAREA_MAX)
  el.style.height = next + 'px'
}

// ─── Tool result renderers ───────────────────────────────────────────────────

type ClientData = { id: string; name: string; website_url?: string; logo_url?: string }
type ProjectData = { id: string; name: string; offer_text?: string; icp_json?: Record<string, string[]> }

function ClientCard({ client }: { client: ClientData }) {
  const router = useRouter()
  return (
    <button
      onClick={() => router.push(`/clients/${client.id}`)}
      className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left hover:border-zinc-300 hover:shadow-sm transition-all w-full"
    >
      {client.logo_url ? (
        <img src={client.logo_url} alt={client.name} className="size-8 rounded-lg object-contain" />
      ) : (
        <span className="size-8 rounded-lg bg-zinc-100 flex items-center justify-center text-sm font-bold text-zinc-500 shrink-0">
          {client.name[0].toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-900 truncate">{client.name}</p>
        {client.website_url && <p className="text-xs text-zinc-400 truncate">{client.website_url}</p>}
      </div>
      <span className="ml-auto text-zinc-300 shrink-0">→</span>
    </button>
  )
}

function IcpChips({ label, items, color }: { label: string; items: string[]; color: string }) {
  if (!items?.length) return null
  return (
    <div className="flex flex-wrap gap-1 items-center">
      <span className="text-[10px] text-zinc-400 mr-0.5 uppercase tracking-wide">{label}</span>
      {items.map((i) => (
        <span key={i} className={`rounded-full px-2 py-0.5 text-xs ${color}`}>{i}</span>
      ))}
    </div>
  )
}

function ProjectCard({ project }: { project: ProjectData }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 space-y-2">
      <p className="text-sm font-medium text-zinc-900">{project.name}</p>
      {project.icp_json && (
        <div className="space-y-1.5">
          <IcpChips label="Industries" items={project.icp_json.industries} color="bg-blue-50 text-blue-700" />
          <IcpChips label="Titles" items={project.icp_json.titles} color="bg-purple-50 text-purple-700" />
          <IcpChips label="Geo" items={project.icp_json.geo} color="bg-green-50 text-green-700" />
        </div>
      )}
    </div>
  )
}

type IterationData = {
  id: string; project_id: string; name: string
  channel: 'linkedin' | 'email'
  status: 'draft' | 'running' | 'finished' | 'discarded'
  started_at: string | null; finished_at: string | null
  stats: Record<string, number | null> | null
}
type SequenceData = {
  id: string; name: string; channel: 'linkedin' | 'email'
  status: 'draft' | 'review' | 'approved'
  share_token: string
  steps?: Array<{ type: string; day: number; subject?: string; content: string }>
  project_id?: string
}
type ContactData = {
  id: string; first_name: string | null; last_name: string | null
  title: string | null; email: string | null; linkedin_url: string
  company_name: string | null; company_domain: string | null; company_logo_url: string | null
  custom_data: Record<string, string> | null
}
type ProjectFull = ProjectData & { client_id?: string; client_name?: string | null; client_logo_url?: string | null; share_token?: string }

function ProjectFullCard({ project }: { project: ProjectFull }) {
  const router = useRouter()
  return (
    <button
      onClick={() => project.client_id && router.push(`/clients/${project.client_id}/projects/${project.id}`)}
      className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left hover:border-zinc-300 hover:shadow-sm transition-all w-full"
    >
      {project.client_logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={project.client_logo_url} alt={project.client_name ?? ''} className="size-8 rounded-lg object-contain" />
      ) : (
        <span className="size-8 rounded-lg bg-zinc-100 flex items-center justify-center text-sm font-semibold text-zinc-500 shrink-0">
          {(project.client_name ?? project.name)[0]?.toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-900 truncate">{project.name}</p>
        {project.client_name && <p className="text-xs text-zinc-400 truncate">{project.client_name}</p>}
      </div>
      <span className="ml-auto text-zinc-300 shrink-0">→</span>
    </button>
  )
}

function StatusDotCard({ status }: { status: IterationData['status'] }) {
  const meta = {
    draft: { Icon: Circle, color: 'text-zinc-500', bg: 'bg-zinc-100', label: 'Draft' },
    running: { Icon: Play, color: 'text-blue-700', bg: 'bg-blue-50', label: 'Running' },
    finished: { Icon: CircleCheck, color: 'text-emerald-700', bg: 'bg-emerald-50', label: 'Finished' },
    discarded: { Icon: CircleSlash, color: 'text-rose-600', bg: 'bg-rose-50', label: 'Discarded' },
  }[status]
  const Icon = meta.Icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.bg} ${meta.color}`}>
      <Icon size={10} strokeWidth={2.5} />
      {meta.label}
    </span>
  )
}

function IterationCard({ iter }: { iter: IterationData }) {
  const channelTone = iter.channel === 'linkedin' ? 'text-blue-600' : 'text-orange-600'
  const stats = iter.stats
  const summary = stats ? [
    stats.leads_sent ? `${stats.leads_sent} sent` : null,
    stats.replies ? `${stats.replies} replies` : null,
    stats.meetings_booked ? `${stats.meetings_booked} meetings` : null,
  ].filter(Boolean).join(' · ') : null
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <span className={channelTone}>
        {iter.channel === 'linkedin' ? <ChannelIcon channel="linkedin" size={14} /> : <Mail size={14} />}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-900">{iter.name}</span>
          <StatusDotCard status={iter.status} />
        </div>
        {summary && <p className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">{summary}</p>}
      </div>
    </div>
  )
}

function SequenceCard({ seq }: { seq: SequenceData }) {
  const channelTone = seq.channel === 'linkedin' ? 'text-blue-700 bg-blue-50' : 'text-orange-700 bg-orange-50'
  const open = `/share/${seq.share_token}`
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${channelTone}`}>
          {seq.channel === 'linkedin' ? <ChannelIcon channel="linkedin" size={10} /> : <Mail size={10} />}
          {seq.channel === 'linkedin' ? 'LinkedIn' : 'Email'}
        </span>
        <span className="text-sm font-medium text-zinc-900">{seq.name}</span>
        {seq.status === 'approved' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] font-medium">
            <Check size={9} strokeWidth={3} />
            Approved
          </span>
        )}
        <a
          href={open}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          <ExternalLink size={11} />
          Open
        </a>
      </div>
      {seq.steps && seq.steps.length > 0 && (
        <div className="space-y-1.5 pt-1.5 border-t border-zinc-50">
          {seq.steps.slice(0, 2).map((s, i) => (
            <div key={i} className="text-[11px] text-zinc-500 leading-relaxed">
              <span className="text-zinc-400 uppercase tracking-wide mr-1.5">Step {i + 1} · Day {s.day}</span>
              {s.subject && <span className="text-zinc-700 font-medium">{s.subject} — </span>}
              <span className="text-zinc-500 line-clamp-2">{s.content}</span>
            </div>
          ))}
          {seq.steps.length > 2 && <p className="text-[10px] text-zinc-300">+ {seq.steps.length - 2} more step{seq.steps.length - 2 === 1 ? '' : 's'}</p>}
        </div>
      )}
    </div>
  )
}

function ContactsList({ contacts, total }: { contacts: ContactData[]; total: number }) {
  if (!contacts.length) return <p className="text-sm text-zinc-400">No contacts in this iteration.</p>
  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      <div className="px-4 py-2.5 border-b border-zinc-100 flex items-center justify-between">
        <p className="text-xs text-zinc-500">{contacts.length} of {total} contacts</p>
      </div>
      <div className="divide-y divide-zinc-50 max-h-80 overflow-y-auto">
        {contacts.map(c => {
          const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || '—'
          return (
            <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              {c.company_logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.company_logo_url} alt={c.company_name ?? ''} className="size-6 rounded-md object-contain ring-1 ring-zinc-100" />
              ) : (
                <span className="size-6 rounded-md bg-zinc-100 flex items-center justify-center text-[10px] font-semibold text-zinc-500 shrink-0">
                  {(c.company_name ?? '?')[0]?.toUpperCase()}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-800 truncate">{name}</p>
                <p className="text-[11px] text-zinc-400 truncate">{[c.title, c.company_name].filter(Boolean).join(' · ') || '—'}</p>
              </div>
              {c.email && <span className="text-[11px] text-zinc-400 font-mono truncate max-w-[180px]">{c.email}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ShareLinkCard({ url, label, kind }: { url: string; label: string; kind: 'client' | 'project' | 'sequence' }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold">{kind} share link</span>
        <span className="text-sm font-medium text-zinc-900 truncate">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs text-zinc-600 font-mono bg-zinc-50 px-2.5 py-1.5 rounded-lg truncate">{url}</code>
        <button
          onClick={copy}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors"
        >
          {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors"
        >
          <ExternalLink size={11} />
          Open
        </a>
      </div>
    </div>
  )
}

function StatsSummary({ stats }: { stats: { linkedin: { iterations: number; leads_sent: number; replies: number; meetings_booked: number }; email: { iterations: number; leads_sent: number; replies: number; meetings_booked: number }; launched_this_week: number; status_counts: { draft: number; running: number; finished: number; discarded: number } } }) {
  const totalMeetings = stats.linkedin.meetings_booked + stats.email.meetings_booked
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-400">Launched this week</p>
          <p className="text-lg font-semibold text-zinc-900 tabular-nums">{stats.launched_this_week}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-400">Meetings</p>
          <p className="text-lg font-semibold text-zinc-900 tabular-nums">{totalMeetings}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-400">Running</p>
          <p className="text-lg font-semibold text-zinc-900 tabular-nums">{stats.status_counts.running}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-zinc-50">
        <div className="space-y-0.5">
          <p className="flex items-center gap-1.5 text-blue-700 font-medium"><ChannelIcon channel="linkedin" size={11} /> LinkedIn</p>
          <p className="text-zinc-500 tabular-nums">{stats.linkedin.leads_sent} sent · {stats.linkedin.replies} replies · {stats.linkedin.meetings_booked} meetings</p>
        </div>
        <div className="space-y-0.5">
          <p className="flex items-center gap-1.5 text-orange-700 font-medium"><Mail size={11} /> Email</p>
          <p className="text-zinc-500 tabular-nums">{stats.email.leads_sent} sent · {stats.email.replies} replies · {stats.email.meetings_booked} meetings</p>
        </div>
      </div>
    </div>
  )
}

type CaseStudyData = { company: string; result: string; industry?: string; description?: string; manual?: boolean }

function CaseStudyCard({ cs }: { cs: CaseStudyData }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-zinc-900">{cs.company}</span>
        {cs.industry && (
          <span className="text-[10px] font-medium text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">{cs.industry}</span>
        )}
        {cs.manual && (
          <span className="text-[10px] font-medium text-zinc-500 bg-zinc-100 rounded-full px-2 py-0.5">manual</span>
        )}
      </div>
      <p className="text-sm text-zinc-800 font-medium leading-relaxed">{cs.result}</p>
      {cs.description && <p className="text-xs text-zinc-500 leading-relaxed">{cs.description}</p>}
    </div>
  )
}

function TeamMemberCard({ email, invitedByEmail }: { email: string; invitedByEmail: string | null }) {
  const initial = email[0]?.toUpperCase() || '?'
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-2.5">
      <span className="size-7 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-semibold shrink-0">{initial}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-800 truncate">{email}</p>
        {invitedByEmail && <p className="text-[11px] text-zinc-400 truncate">invited by {invitedByEmail}</p>}
      </div>
    </div>
  )
}

function SimpleStatus({ icon: Icon, text }: { icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>; text: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1.5 text-xs font-medium">
      <Icon size={12} strokeWidth={2.5} />
      {text}
    </div>
  )
}

function ToolResult({ toolName, output }: { toolName: string; output: unknown }) {
  const data = output as Record<string, unknown>
  if (!data) return null
  if (data.error) return <p className="text-sm text-red-500">{String(data.error)}</p>

  if (toolName === 'list_clients' || toolName === 'find_client') {
    const clients = (data.clients ?? []) as ClientData[]
    if (!clients.length) return <p className="text-sm text-zinc-400">No clients found.</p>
    return (
      <motion.div className="space-y-2" variants={staggerContainer} initial="hidden" animate="show">
        {clients.map((c) => (
          <motion.div key={c.id} variants={fadeUp} transition={springGentle}>
            <ClientCard client={c} />
          </motion.div>
        ))}
      </motion.div>
    )
  }
  if (toolName === 'create_client') {
    const client = data.client as ClientData | undefined
    return client ? <ClientCard client={client} /> : null
  }
  if (toolName === 'create_project') {
    const project = data.project as ProjectData | undefined
    return project ? <ProjectCard project={project} /> : null
  }
  if (toolName === 'get_client_projects') {
    const projects = (data.projects ?? []) as ProjectData[]
    if (!projects.length) return <p className="text-sm text-zinc-400">No projects yet.</p>
    return (
      <motion.div className="space-y-2" variants={staggerContainer} initial="hidden" animate="show">
        {projects.map((p) => (
          <motion.div key={p.id} variants={fadeUp} transition={springGentle}><ProjectCard project={p} /></motion.div>
        ))}
      </motion.div>
    )
  }
  if (toolName === 'list_all_projects') {
    const projects = (data.projects ?? []) as ProjectFull[]
    if (!projects.length) return <p className="text-sm text-zinc-400">No projects yet.</p>
    return (
      <motion.div className="space-y-2" variants={staggerContainer} initial="hidden" animate="show">
        {projects.map(p => (
          <motion.div key={p.id} variants={fadeUp} transition={springGentle}><ProjectFullCard project={p} /></motion.div>
        ))}
      </motion.div>
    )
  }
  if (toolName === 'list_iterations') {
    const iters = (data.iterations ?? []) as IterationData[]
    if (!iters.length) return <p className="text-sm text-zinc-400">No iterations yet.</p>
    return (
      <motion.div className="space-y-2" variants={staggerContainer} initial="hidden" animate="show">
        {iters.map(it => (
          <motion.div key={it.id} variants={fadeUp} transition={springGentle}><IterationCard iter={it} /></motion.div>
        ))}
      </motion.div>
    )
  }
  if (toolName === 'create_iteration') {
    const iter = data.iteration as IterationData | undefined
    return iter ? <IterationCard iter={iter} /> : null
  }
  if (toolName === 'set_iteration_status') {
    return <SimpleStatus icon={Check} text={`Status set to ${String(data.status)}`} />
  }
  if (toolName === 'list_sequences') {
    const seqs = (data.sequences ?? []) as SequenceData[]
    if (!seqs.length) return <p className="text-sm text-zinc-400">No sequences yet in this iteration.</p>
    return (
      <motion.div className="space-y-2" variants={staggerContainer} initial="hidden" animate="show">
        {seqs.map(s => (
          <motion.div key={s.id} variants={fadeUp} transition={springGentle}><SequenceCard seq={s} /></motion.div>
        ))}
      </motion.div>
    )
  }
  if (toolName === 'generate_sequence') {
    const seq = data.sequence as SequenceData | undefined
    return seq ? <SequenceCard seq={seq} /> : null
  }
  if (toolName === 'approve_sequence') {
    return <SimpleStatus icon={Check} text="Sequence approved" />
  }
  if (toolName === 'list_contacts') {
    const contacts = (data.contacts ?? []) as ContactData[]
    const total = (data.total as number) ?? contacts.length
    return <ContactsList contacts={contacts} total={total} />
  }
  if (toolName === 'get_custom_columns') {
    const cols = (data.columns ?? []) as string[]
    if (!cols.length) return <p className="text-sm text-zinc-400">No custom columns — upload contacts with extra fields to add some.</p>
    return (
      <div className="flex flex-wrap gap-1.5">
        {cols.map(c => (
          <span key={c} className="rounded-md bg-violet-50 text-violet-700 px-2 py-0.5 text-[11px] font-mono">{`{${c}}`}</span>
        ))}
      </div>
    )
  }
  if (toolName === 'get_client_stats') {
    const stats = data.stats as Parameters<typeof StatsSummary>[0]['stats']
    return <StatsSummary stats={stats} />
  }
  if (toolName === 'get_share_link') {
    return <ShareLinkCard url={String(data.url)} label={String(data.label)} kind={data.kind as 'client' | 'project' | 'sequence'} />
  }
  if (toolName === 'list_team_members') {
    const members = (data.members ?? []) as Array<{ id: string; email: string; invited_by_email: string | null }>
    if (!members.length) return <p className="text-sm text-zinc-400">No team members.</p>
    return (
      <motion.div className="space-y-2" variants={staggerContainer} initial="hidden" animate="show">
        {members.map(m => (
          <motion.div key={m.id} variants={fadeUp} transition={springGentle}><TeamMemberCard email={m.email} invitedByEmail={m.invited_by_email} /></motion.div>
        ))}
      </motion.div>
    )
  }
  if (toolName === 'invite_team_member') {
    return <SimpleStatus icon={UserCheck} text={`Invited ${String(data.email)}`} />
  }
  if (toolName === 'list_case_studies') {
    const cs = (data.case_studies ?? []) as CaseStudyData[]
    if (!cs.length) return <p className="text-sm text-zinc-400">No case studies yet for this client.</p>
    return (
      <motion.div className="space-y-2" variants={staggerContainer} initial="hidden" animate="show">
        {cs.map((c, i) => (
          <motion.div key={`${c.company}-${i}`} variants={fadeUp} transition={springGentle}><CaseStudyCard cs={c} /></motion.div>
        ))}
      </motion.div>
    )
  }
  if (toolName === 'add_case_study') {
    const cs = data.case_study as CaseStudyData | undefined
    return cs ? <CaseStudyCard cs={cs} /> : null
  }
  if (toolName === 'remove_case_study') {
    return <SimpleStatus icon={Check} text="Case study removed" />
  }
  if (toolName === 'delete_project' || toolName === 'delete_client') {
    return <SimpleStatus icon={Check} text="Deleted" />
  }
  return null
}

// ─── Thinking block ─────────────────────────────────────────────────────────

function ThinkingBlock({ text, streaming }: { text: string; streaming?: boolean }) {
  const [open, setOpen] = useState(false)
  const words = text.trim().split(/\s+/).length
  const label = streaming ? 'Thinking…' : `Thought (${words} words)`

  return (
    <motion.div
      variants={blurIn}
      initial="hidden"
      animate="show"
      transition={springGentle}
      className="rounded-xl border border-violet-100 bg-violet-50 text-xs w-full max-w-xl overflow-hidden"
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 text-violet-500 hover:text-violet-700 transition-colors text-left"
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        <span className="font-medium">{label}</span>
        {streaming && (
          <span className="flex gap-0.5 ml-auto">
            {[0,1,2].map(i => (
              <span key={i} className="size-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 text-violet-700 whitespace-pre-wrap leading-relaxed border-t border-violet-100 pt-2 max-h-64 overflow-y-auto">
              {text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Message renderer ────────────────────────────────────────────────────────

function Avatar({ kind, email }: { kind: 'user' | 'assistant'; email?: string | null }) {
  if (kind === 'assistant') {
    return (
      <span className="size-6 rounded-full bg-white flex items-center justify-center shrink-0 ring-1 ring-zinc-200">
        <span className="size-1.5 rounded-full bg-zinc-900" />
      </span>
    )
  }
  const initial = email?.[0]?.toUpperCase() || 'U'
  return (
    <span className="size-6 rounded-full bg-zinc-900 text-white flex items-center justify-center text-[10px] font-semibold shrink-0">
      {initial}
    </span>
  )
}

export function Message({ message, userEmail }: { message: UIMessage; userEmail?: string | null }) {
  const isUser = message.role === 'user'

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      transition={springGentle}
      className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && <Avatar kind="assistant" />}
      <div className={`flex flex-col gap-2 max-w-xl ${isUser ? 'items-end' : 'items-start'}`}>
        {message.parts.map((part, i) => {
          if (part.type === 'text' && part.text) {
            return (
              <div
                key={i}
                className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  isUser
                    ? 'bg-zinc-900 text-white rounded-br-sm'
                    : 'bg-white border border-zinc-200 text-zinc-800 rounded-bl-sm'
                }`}
              >
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                    hr: () => <hr className="my-2 border-zinc-200" />,
                    ul: ({ children }) => <ul className="list-disc pl-4 space-y-0.5 mb-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-4 space-y-0.5 mb-1">{children}</ol>,
                    li: ({ children }) => <li>{children}</li>,
                    code: ({ children }) => <code className="bg-black/10 rounded px-1 font-mono text-xs">{children}</code>,
                    table: ({ children }) => (
                      <div className="my-2 -mx-1 overflow-x-auto">
                        <table className="w-full text-xs border-collapse rounded-xl overflow-hidden border border-zinc-200">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => <thead className="bg-zinc-50">{children}</thead>,
                    tbody: ({ children }) => <tbody className="divide-y divide-zinc-100">{children}</tbody>,
                    tr: ({ children }) => <tr className="hover:bg-zinc-50/60 transition-colors">{children}</tr>,
                    th: ({ children }) => <th className="px-3 py-2 text-left font-medium text-zinc-500 uppercase tracking-wide text-[10px] border-b border-zinc-200 whitespace-nowrap">{children}</th>,
                    td: ({ children }) => <td className="px-3 py-2 text-zinc-800 tabular-nums whitespace-nowrap">{children}</td>,
                  }}
                >
                  {part.text}
                </Markdown>
              </div>
            )
          }

          if (isReasoningUIPart(part) && part.text) {
            return <ThinkingBlock key={i} text={part.text} streaming={part.state === 'streaming'} />
          }

          if (isToolUIPart(part) && part.state === 'output-available') {
            const name = getToolName(part)
            const result = <ToolResult key={i} toolName={name} output={part.output} />
            return result ? (
              <motion.div
                key={i}
                variants={scaleIn}
                initial="hidden"
                animate="show"
                transition={springGentle}
                className="w-full max-w-sm"
              >
                {result}
              </motion.div>
            ) : null
          }

          return null
        })}
      </div>
      {isUser && <Avatar kind="user" email={userEmail} />}
    </motion.div>
  )
}

// ─── Main chat ───────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Show all clients',
  'Create a client Acme Corp with website https://acme.com',
  'Create a project for Busy Studio targeting EU SaaS outbound',
]

export function Chat({
  conversationId: initialConvId,
  initialMessages = [],
  userEmail = null,
}: {
  conversationId?: string
  initialMessages?: unknown[]
  userEmail?: string | null
}) {
  const router = useRouter()
  const convIdRef = useRef<string | null>(initialConvId ?? null)
  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    messages: initialMessages as UIMessage[],
  })
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isLoading = status === 'streaming' || status === 'submitted'

  // Auto-save when a response finishes
  useEffect(() => {
    if (status !== 'ready' || messages.length === 0) return
    const save = async () => {
      if (!convIdRef.current) {
        const firstUser = messages.find((m) => m.role === 'user')
        const text = firstUser?.parts.find((p) => p.type === 'text')
        const title = text?.type === 'text' ? text.text.slice(0, 60) : 'New chat'
        const { createConversation, saveConversation } = await import('@/app/actions/conversations')
        const id = await createConversation(title)
        convIdRef.current = id
        // Optimistic update — sidebar updates instantly via event
        window.dispatchEvent(new CustomEvent('conversation-created', { detail: { id, title } }))
        await saveConversation(id, messages)
        router.replace(`/chat/${id}`)
      } else {
        const { saveConversation } = await import('@/app/actions/conversations')
        await saveConversation(convIdRef.current, messages)
      }
    }
    save()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function submit() {
    const text = inputRef.current?.value.trim()
    if (!text || isLoading) return
    inputRef.current!.value = ''
    autosize(inputRef.current!)
    sendMessage({ text })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        <AnimatePresence initial={false}>
          {messages.length === 0 && (
            <motion.div
              key="empty"
              variants={fadeUp}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={springGentle}
              className="flex flex-col items-center justify-center h-full gap-6 text-center"
            >
              <div>
                <h2 className="text-xl font-semibold text-zinc-900">GTM Assistant</h2>
                <p className="text-sm text-zinc-400 mt-1">Manage clients and projects through chat</p>
              </div>
              <motion.div
                className="flex flex-col gap-2 w-full max-w-sm"
                variants={staggerContainer}
                initial="hidden"
                animate="show"
              >
                {SUGGESTIONS.map((s) => (
                  <motion.button
                    key={s}
                    variants={fadeUp}
                    transition={springGentle}
                    onClick={() => {
                      if (inputRef.current) {
                        inputRef.current.value = s
                        autosize(inputRef.current)
                      }
                      inputRef.current?.focus()
                    }}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 transition-all text-left"
                  >
                    {s}
                  </motion.button>
                ))}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {messages.map((m) => <Message key={m.id} message={m} userEmail={userEmail} />)}

        <AnimatePresence>
          {isLoading && messages[messages.length - 1]?.role === 'user' && (
            <motion.div
              key="typing"
              variants={fadeUp}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={spring}
              className="flex justify-start"
            >
              <div className="flex gap-1 px-4 py-3 rounded-2xl bg-white border border-zinc-200 rounded-bl-sm">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-1.5 rounded-full bg-zinc-300 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-zinc-100 bg-white px-6 py-4">
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            onInput={(e) => autosize(e.currentTarget)}
            onKeyDown={onKeyDown}
            placeholder="What do you need done…"
            rows={1}
            className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:outline-none resize-none leading-relaxed"
            style={{
              minHeight: '42px',
              maxHeight: '240px',
              overflow: 'auto',
              transition: 'height 140ms cubic-bezier(0.16, 1, 0.3, 1), border-color 150ms, background-color 150ms',
            }}
          />
          <button
            onClick={submit}
            disabled={isLoading}
            className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 transition-colors shrink-0"
          >
            {isLoading ? '…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useRef, useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import { useChat } from '@ai-sdk/react'
import { isToolUIPart, isReasoningUIPart, getToolName, DefaultChatTransport, type UIMessage } from 'ai'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, blurIn, scaleIn, staggerContainer, springGentle, spring } from '@/lib/animations'

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

function ToolResult({ toolName, output }: { toolName: string; output: unknown }) {
  const data = output as Record<string, unknown>
  if (!data) return null
  if (data.error) return <p className="text-sm text-red-500">{String(data.error)}</p>

  if (toolName === 'list_clients' || toolName === 'find_client') {
    const clients = (data.clients ?? []) as ClientData[]
    if (!clients.length) return <p className="text-sm text-zinc-400">No clients found.</p>
    return (
      <motion.div
        className="space-y-2"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
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
      <motion.div
        className="space-y-2"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {projects.map((p) => (
          <motion.div key={p.id} variants={fadeUp} transition={springGentle}>
            <ProjectCard project={p} />
          </motion.div>
        ))}
      </motion.div>
    )
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

function Message({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user'

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      transition={springGentle}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
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
                  components={{
                    p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                    hr: () => <hr className="my-2 border-zinc-200 dark:border-zinc-700" />,
                    ul: ({ children }) => <ul className="list-disc pl-4 space-y-0.5 mb-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-4 space-y-0.5 mb-1">{children}</ol>,
                    li: ({ children }) => <li>{children}</li>,
                    code: ({ children }) => <code className="bg-black/10 rounded px-1 font-mono text-xs">{children}</code>,
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
}: {
  conversationId?: string
  initialMessages?: unknown[]
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
                      if (inputRef.current) inputRef.current.value = s
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

        {messages.map((m) => <Message key={m.id} message={m} />)}

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
            onKeyDown={onKeyDown}
            placeholder="What do you need done…"
            rows={1}
            className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:outline-none resize-none transition-colors"
            style={{ minHeight: '42px', maxHeight: '120px' }}
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

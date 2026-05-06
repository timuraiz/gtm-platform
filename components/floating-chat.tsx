'use client'

import { useRef, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X, Minus, Maximize2, Plus } from 'lucide-react'
import { Message, autosize } from './chat'

const POS_KEY = 'gtm_floating_chat_pos'
const CONV_KEY = 'gtm_floating_chat_conv_id'
const DEFAULT_WIDTH = 380
const DEFAULT_HEIGHT = 520

type RouteContext =
  | { kind: 'home' }
  | { kind: 'client'; client_id: string }
  | { kind: 'project'; client_id: string; project_id: string; tab?: string; iter?: string }
  | { kind: 'team' }
  | { kind: 'chat' }
  | { kind: 'other'; path: string }

function parsePath(path: string, search: string): RouteContext {
  const params = new URLSearchParams(search)
  const m1 = path.match(/^\/clients\/([^/]+)\/projects\/([^/]+)\/?$/)
  if (m1) {
    return {
      kind: 'project',
      client_id: m1[1],
      project_id: m1[2],
      tab: params.get('tab') ?? undefined,
      iter: params.get('iter') ?? undefined,
    }
  }
  const m2 = path.match(/^\/clients\/([^/]+)\/?$/)
  if (m2) return { kind: 'client', client_id: m2[1] }
  if (path === '/team') return { kind: 'team' }
  if (path.startsWith('/chat/')) return { kind: 'chat' }
  if (path === '/') return { kind: 'home' }
  return { kind: 'other', path }
}

function readPos(): { x: number; y: number } | null {
  if (typeof window === 'undefined') return null
  try {
    const s = window.localStorage.getItem(POS_KEY)
    return s ? JSON.parse(s) : null
  } catch { return null }
}
function savePos(p: { x: number; y: number }) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(POS_KEY, JSON.stringify(p))
}
function readConvId(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(CONV_KEY)
}
function saveConvId(id: string | null) {
  if (typeof window === 'undefined') return
  if (id) window.localStorage.setItem(CONV_KEY, id)
  else window.localStorage.removeItem(CONV_KEY)
}

export function FloatingChat({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname() ?? '/'
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null)
  const [convId, setConvId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [chatKey, setChatKey] = useState(0)

  // Restore saved position on mount
  useEffect(() => {
    const saved = readPos()
    if (saved) setPos(saved)
    else {
      const x = window.innerWidth - DEFAULT_WIDTH - 24
      const y = window.innerHeight - DEFAULT_HEIGHT - 24
      setPos({ x: Math.max(16, x), y: Math.max(16, y) })
    }
  }, [])

  // When the panel opens, load the persisted conversation if any
  useEffect(() => {
    if (!open) return
    const id = readConvId()
    if (!id) {
      setConvId(null)
      setInitialMessages([])
      return
    }
    setLoading(true)
    setConvId(id)
    import('@/app/actions/conversations').then(async ({ getConversation }) => {
      const conv = await getConversation(id)
      if (conv) {
        setInitialMessages(conv.messages as UIMessage[])
      } else {
        // Conversation no longer exists — start fresh
        saveConvId(null)
        setConvId(null)
        setInitialMessages([])
      }
      setLoading(false)
    })
  }, [open])

  function startFresh() {
    saveConvId(null)
    setConvId(null)
    setInitialMessages([])
    setChatKey(k => k + 1)
  }

  // Don't render the bubble on home / chat (full-page chat already there)
  if (pathname === '/' || pathname.startsWith('/chat/')) return null

  return (
    <AnimatePresence>
      {!open && (
        <motion.button
          key="bubble"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 size-12 rounded-full bg-zinc-900 text-white shadow-lg hover:bg-zinc-700 transition-colors flex items-center justify-center"
          aria-label="Open assistant"
        >
          <MessageCircle size={18} fill="white" strokeWidth={1.75} />
        </motion.button>
      )}

      {open && pos && initialMessages !== null && (
        <FloatingPanel
          key={chatKey}
          pathname={pathname}
          search={typeof window !== 'undefined' ? window.location.search : ''}
          userEmail={userEmail}
          initialPos={pos}
          initialMessages={initialMessages}
          initialConvId={convId}
          loading={loading}
          onPosChange={p => { setPos(p); savePos(p) }}
          onMinimize={() => setOpen(false)}
          onConvIdChange={(id) => { setConvId(id); saveConvId(id) }}
          onStartFresh={startFresh}
        />
      )}
    </AnimatePresence>
  )
}

function FloatingPanel({
  pathname,
  search,
  userEmail,
  initialPos,
  initialMessages,
  initialConvId,
  loading,
  onPosChange,
  onMinimize,
  onConvIdChange,
  onStartFresh,
}: {
  pathname: string
  search: string
  userEmail: string | null
  initialPos: { x: number; y: number }
  initialMessages: UIMessage[]
  initialConvId: string | null
  loading: boolean
  onPosChange: (p: { x: number; y: number }) => void
  onMinimize: () => void
  onConvIdChange: (id: string | null) => void
  onStartFresh: () => void
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const dragStart = useRef<{ mouseX: number; mouseY: number; panelX: number; panelY: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const convIdRef = useRef<string | null>(initialConvId)
  const lastDispatchedToolPart = useRef<string | null>(null)

  const context = parsePath(pathname, search)

  const { messages, sendMessage, status, error, regenerate } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { context },
    }),
    messages: initialMessages,
  })
  const isLoading = status === 'submitted' || status === 'streaming'

  // Friendly description for the most common backend failures (Anthropic overload, rate limit, network)
  const errorBanner = (() => {
    if (!error) return null
    const msg = (error.message ?? '').toLowerCase()
    if (msg.includes('overload')) return 'Anthropic is overloaded right now. This usually clears in under a minute.'
    if (msg.includes('rate limit') || msg.includes('429')) return 'Rate limit hit. Wait a few seconds and retry.'
    if (msg.includes('fetch') || msg.includes('network')) return 'Network error talking to the model. Check your connection.'
    return error.message || 'Something went wrong reaching the model.'
  })()

  // Watch for completed tool calls that mutated data → dispatch a global event + refresh server data
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant') return

    type ToolEvent = { kind: string; id?: string; toolName: string }
    const events: ToolEvent[] = []
    let mutated = false

    for (const part of last.parts) {
      // AI SDK tool parts have shape { type: 'tool-<name>', state, output, toolCallId }
      const p = part as unknown as { type: string; state?: string; output?: unknown; toolCallId?: string }
      if (!p.type?.startsWith('tool-') || p.state !== 'output-available') continue
      // Build a stable key per tool result so we don't redispatch the same one
      const sigKey = `${last.id}:${p.toolCallId ?? p.type}`
      if (lastDispatchedToolPart.current && lastDispatchedToolPart.current.includes(sigKey)) continue
      const toolName = p.type.slice('tool-'.length)
      const out = p.output as Record<string, unknown> | undefined
      const id = (out?.client as { id?: string } | undefined)?.id
        ?? (out?.project as { id?: string } | undefined)?.id
        ?? (out?.iteration as { id?: string } | undefined)?.id
        ?? (out?.sequence as { id?: string } | undefined)?.id

      const mutating: Record<string, string> = {
        create_client: 'client', create_project: 'project', create_iteration: 'iteration',
        generate_sequence: 'sequence', approve_sequence: 'sequence',
        set_iteration_status: 'iteration', invite_team_member: 'team',
        delete_project: 'project', delete_client: 'client',
        update_project_icp: 'project', update_project_offer: 'project',
        update_iteration_segment: 'iteration',
      }
      if (toolName in mutating) {
        events.push({ kind: mutating[toolName], id, toolName })
        mutated = true
      }
      // Mark this part as processed
      lastDispatchedToolPart.current = (lastDispatchedToolPart.current ?? '') + ' ' + sigKey
    }

    if (events.length > 0 && typeof window !== 'undefined') {
      for (const e of events) {
        window.dispatchEvent(new CustomEvent('chat-data-changed', { detail: e }))
      }
    }
    if (mutated) router.refresh()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  // Auto-save when a turn finishes — mirrors the main chat behavior, but never navigates away
  useEffect(() => {
    if (status !== 'ready' || messages.length === 0) return
    const save = async () => {
      const { createConversation, saveConversation } = await import('@/app/actions/conversations')
      if (!convIdRef.current) {
        const firstUser = messages.find(m => m.role === 'user')
        const text = firstUser?.parts.find(p => p.type === 'text')
        const title = text?.type === 'text' ? text.text.slice(0, 60) : 'Floating chat'
        const id = await createConversation(title)
        convIdRef.current = id
        onConvIdChange(id)
        // If we have client context (on a client or project page), auto-bucket the conversation under that client
        const clientId = context.kind === 'client' ? context.client_id
          : context.kind === 'project' ? context.client_id
          : null
        if (clientId) {
          const { linkConversationToClient } = await import('@/app/actions/conversations')
          try { await linkConversationToClient(id, clientId) } catch { /* non-blocking */ }
        }
        window.dispatchEvent(new CustomEvent('conversation-created', { detail: { id, title, client_id: clientId } }))
        await saveConversation(id, messages)
      } else {
        await saveConversation(convIdRef.current, messages)
      }
    }
    save()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

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

  // Drag the whole panel by its header
  function onHeaderMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button')) return
    dragging.current = true
    dragStart.current = {
      mouseX: e.clientX, mouseY: e.clientY,
      panelX: initialPosRef.current.x, panelY: initialPosRef.current.y,
    }
    document.body.style.userSelect = 'none'
  }

  // Use a ref for "live" position to avoid re-renders during drag
  const initialPosRef = useRef(initialPos)
  useEffect(() => { initialPosRef.current = initialPos }, [initialPos])

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current || !dragStart.current) return
      const dx = e.clientX - dragStart.current.mouseX
      const dy = e.clientY - dragStart.current.mouseY
      const next = {
        x: Math.max(8, Math.min(window.innerWidth - DEFAULT_WIDTH - 8, dragStart.current.panelX + dx)),
        y: Math.max(8, Math.min(window.innerHeight - DEFAULT_HEIGHT - 8, dragStart.current.panelY + dy)),
      }
      if (panelRef.current) {
        panelRef.current.style.left = next.x + 'px'
        panelRef.current.style.top = next.y + 'px'
      }
      initialPosRef.current = next
    }
    function onUp() {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.userSelect = ''
      onPosChange(initialPosRef.current)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [onPosChange])

  const contextLabel = describeContext(context)

  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.97 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'fixed',
        left: initialPos.x,
        top: initialPos.y,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        zIndex: 50,
      }}
      className="bg-white rounded-2xl shadow-2xl border border-zinc-200 flex flex-col overflow-hidden"
    >
      {/* Header — drag handle */}
      <div
        onMouseDown={onHeaderMouseDown}
        className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-100 bg-zinc-50/60 cursor-grab active:cursor-grabbing select-none"
      >
        <span className="size-6 rounded-full bg-zinc-900 text-white flex items-center justify-center">
          <MessageCircle size={11} fill="white" strokeWidth={1.75} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-zinc-900">Assistant</p>
          {contextLabel && <p className="text-[10px] text-zinc-400 truncate">{contextLabel}</p>}
        </div>
        <button
          onClick={onStartFresh}
          title="Start a new chat"
          className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          <Plus size={12} />
        </button>
        <button
          onClick={async () => {
            if (convIdRef.current) {
              router.push(`/chat/${convIdRef.current}`)
              return
            }
            if (messages.length === 0) {
              router.push('/')
              return
            }
            // No convId yet but messages exist — save first, then navigate
            const { createConversation, saveConversation } = await import('@/app/actions/conversations')
            const firstUser = messages.find(m => m.role === 'user')
            const text = firstUser?.parts.find(p => p.type === 'text')
            const title = text?.type === 'text' ? text.text.slice(0, 60) : 'Chat'
            const id = await createConversation(title)
            await saveConversation(id, messages)
            convIdRef.current = id
            onConvIdChange(id)
            router.push(`/chat/${id}`)
          }}
          title="Open full chat"
          className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          <Maximize2 size={11} />
        </button>
        <button
          onClick={onMinimize}
          title="Minimize"
          className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          <Minus size={12} />
        </button>
        <button
          onClick={onMinimize}
          title="Close"
          className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          <X size={12} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-6 text-xs text-zinc-400">Loading conversation…</div>
        )}
        {!loading && messages.length === 0 && (
          <div className="text-center py-8 px-3">
            <p className="text-sm text-zinc-700 font-medium">Need a hand?</p>
            <p className="text-xs text-zinc-400 mt-1">
              I know what&apos;s on screen and can run things for you — generate a sequence, invite a teammate, share a report…
            </p>
          </div>
        )}
        {messages.map((m: UIMessage) => <Message key={m.id} message={m} userEmail={userEmail} />)}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="size-1 rounded-full bg-zinc-400 animate-pulse" />
            Thinking…
          </div>
        )}
        {errorBanner && !isLoading && (
          <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50/60 px-3 py-2 text-xs text-red-700">
            <span className="mt-0.5 size-1.5 rounded-full bg-red-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="leading-snug">{errorBanner}</p>
              <button
                onClick={() => regenerate()}
                className="mt-1 text-[11px] font-medium text-red-600 hover:text-red-800 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-zinc-100 bg-white px-3 py-2.5">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            onInput={(e) => autosize(e.currentTarget)}
            onKeyDown={onKeyDown}
            placeholder="Ask anything…"
            rows={1}
            className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:outline-none resize-none leading-relaxed"
            style={{
              minHeight: '36px',
              maxHeight: '160px',
              overflow: 'auto',
              transition: 'height 140ms cubic-bezier(0.16, 1, 0.3, 1), border-color 150ms, background-color 150ms',
            }}
          />
          <button
            onClick={submit}
            disabled={isLoading}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-40 transition-colors shrink-0"
          >
            Send
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function describeContext(ctx: RouteContext): string | null {
  switch (ctx.kind) {
    case 'project': return `Viewing a project${ctx.tab ? ` · ${ctx.tab}` : ''}${ctx.iter ? ` · iteration` : ''}`
    case 'client': return 'Viewing a client'
    case 'team': return 'Team page'
    case 'chat': return 'Conversation'
    case 'home': return null
    case 'other': return null
  }
}

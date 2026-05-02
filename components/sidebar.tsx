'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { type Client } from '@/app/actions/clients'
import { type Conversation, deleteConversation, linkConversationToClient } from '@/app/actions/conversations'
import { ClientLogo } from './client-logo'
import { CreateClientModal } from './create-client-modal'
import { fadeUp, staggerContainer, springGentle } from '@/lib/animations'

export type ConversationCreatedEvent = { id: string; title: string }

// ─── Draggable conversation item ─────────────────────────────────────────────

function ConvItem({
  conv,
  active,
  onDelete,
  overlay = false,
}: {
  conv: Conversation
  active: boolean
  onDelete: (id: string, e: React.MouseEvent) => void
  overlay?: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: conv.id })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`group flex items-center rounded-md transition-colors select-none ${
        isDragging && !overlay ? 'opacity-30' : ''
      } ${overlay ? 'shadow-lg bg-white border border-zinc-200 rounded-md px-2 py-1.5' : ''}`}
    >
      <Link
        href={`/chat/${conv.id}`}
        onClick={(e) => isDragging && e.preventDefault()}
        className={`flex-1 min-w-0 rounded-md px-2 py-1.5 text-sm transition-colors truncate ${
          active
            ? 'bg-zinc-100 text-zinc-900 font-medium'
            : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
        }`}
      >
        {conv.title}
      </Link>
      {!overlay && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => onDelete(conv.id, e)}
          className="opacity-0 group-hover:opacity-100 shrink-0 p-1 text-zinc-300 hover:text-red-400 transition-all"
        >
          ✕
        </button>
      )}
    </div>
  )
}

// ─── Droppable client drop zone ───────────────────────────────────────────────

function ClientDropZone({
  client,
  conversations,
  pathname,
  onDelete,
  isOver,
}: {
  client: Client
  conversations: Conversation[]
  pathname: string
  onDelete: (id: string, e: React.MouseEvent) => void
  isOver: boolean
}) {
  const { setNodeRef } = useDroppable({ id: `client:${client.id}` })
  const active = pathname.startsWith(`/clients/${client.id}`)
  const [open, setOpen] = useState(conversations.length > 0)

  useEffect(() => {
    if (conversations.length > 0) setOpen(true)
  }, [conversations.length])

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg transition-colors ${isOver ? 'bg-blue-50 ring-1 ring-blue-200' : ''}`}
    >
      <Link
        href={`/clients/${client.id}`}
        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
          active
            ? 'bg-zinc-100 text-zinc-900 font-medium'
            : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
        }`}
      >
        <ClientLogo name={client.name} logoUrl={client.logo_url ?? null} size="sm" />
        <span className="truncate flex-1">{client.name}</span>
        {conversations.length > 0 && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.preventDefault(); setOpen((o) => !o) }}
            className="text-zinc-300 hover:text-zinc-500 text-[10px] shrink-0"
          >
            {open ? '▾' : '▸'}
          </button>
        )}
      </Link>

      <AnimatePresence initial={false}>
        {open && conversations.length > 0 && (
          <motion.div
            key="linked"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden pl-6"
          >
            {conversations.map((conv) => (
              <ConvItem
                key={conv.id}
                conv={conv}
                active={pathname === `/chat/${conv.id}`}
                onDelete={onDelete}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {isOver && (
        <div className="px-2 py-1 text-[11px] text-blue-400 text-center">Drop here</div>
      )}
    </div>
  )
}

// ─── Droppable "unlinked" zone ────────────────────────────────────────────────

function UnlinkedDropZone({
  isOver,
  children,
}: {
  isOver: boolean
  children: React.ReactNode
}) {
  const { setNodeRef } = useDroppable({ id: 'unlinked' })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg transition-colors ${isOver ? 'bg-zinc-50 ring-1 ring-zinc-200' : ''}`}
    >
      {children}
    </div>
  )
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export function Sidebar({
  clients,
  conversations: initialConversations,
}: {
  clients: Client[]
  conversations: Conversation[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [conversations, setConversations] = useState(initialConversations)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  useEffect(() => {
    const handler = (e: Event) => {
      const { id, title } = (e as CustomEvent<ConversationCreatedEvent>).detail
      setConversations((prev) => {
        if (prev.some((c) => c.id === id)) return prev
        return [{ id, title, client_id: null, messages: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ...prev]
      })
    }
    window.addEventListener('conversation-created', handler)
    return () => window.removeEventListener('conversation-created', handler)
  }, [])

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    await deleteConversation(id)
    router.refresh()
    if (pathname === `/chat/${id}`) router.push('/')
  }

  function onDragStart(e: DragStartEvent) {
    setDraggingId(String(e.active.id))
  }

  function onDragOver(e: { over: { id: string } | null }) {
    setOverId(e.over ? String(e.over.id) : null)
  }

  async function onDragEnd(e: DragEndEvent) {
    setDraggingId(null)
    setOverId(null)
    const convId = String(e.active.id)
    if (!e.over) return

    const target = String(e.over.id)
    const clientId = target.startsWith('client:') ? target.slice(7) : null

    // optimistic update
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, client_id: clientId } : c))
    )
    await linkConversationToClient(convId, clientId)
  }

  const draggingConv = conversations.find((c) => c.id === draggingId)
  const unlinked = conversations.filter((c) => !c.client_id)

  return (
    <>
      <DndContext
        id="sidebar-dnd"
        sensors={sensors}
        onDragStart={onDragStart}
        onDragOver={onDragOver as never}
        onDragEnd={onDragEnd}
      >
        <aside className="w-56 shrink-0 flex flex-col">
          <div className="flex flex-col flex-1 bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
            <div className="px-4 py-4 border-b border-zinc-100">
              <span className="text-sm font-semibold text-zinc-900">GTM Platform</span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Unlinked conversations */}
              <div className="px-2 pt-3 pb-1">
                <div className="flex items-center justify-between px-2 mb-1">
                  <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Chats</p>
                  <Link href="/" className="text-[11px] text-zinc-400 hover:text-zinc-600 transition-colors">
                    + New
                  </Link>
                </div>

                <UnlinkedDropZone isOver={overId === 'unlinked'}>
                  <motion.div className="space-y-0.5" variants={staggerContainer} initial="hidden" animate="show">
                    {unlinked.length === 0 && (
                      <p className="px-2 py-1 text-xs text-zinc-300">No conversations yet</p>
                    )}
                    <AnimatePresence initial={false}>
                      {unlinked.map((conv) => (
                        <motion.div
                          key={conv.id}
                          variants={fadeUp}
                          exit={{ opacity: 0, x: -8, transition: { duration: 0.15 } }}
                          transition={springGentle}
                        >
                          <ConvItem
                            conv={conv}
                            active={pathname === `/chat/${conv.id}`}
                            onDelete={handleDelete}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                </UnlinkedDropZone>
              </div>

              {/* Clients with drop zones */}
              <div className="px-2 pt-3 pb-3">
                <div className="flex items-center justify-between px-2 mb-1">
                  <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Clients</p>
                  <button
                    onClick={() => setShowModal(true)}
                    className="text-[11px] text-zinc-400 hover:text-zinc-600 transition-colors"
                  >
                    + New
                  </button>
                </div>

                <motion.div className="space-y-0.5" variants={staggerContainer} initial="hidden" animate="show">
                  {clients.map((client) => {
                    const linked = conversations.filter((c) => c.client_id === client.id)
                    return (
                      <motion.div key={client.id} variants={fadeUp} transition={springGentle}>
                        <ClientDropZone
                          client={client}
                          conversations={linked}
                          pathname={pathname}
                          onDelete={handleDelete}
                          isOver={overId === `client:${client.id}`}
                        />
                      </motion.div>
                    )
                  })}
                </motion.div>
              </div>
            </div>
          </div>
        </aside>

        <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
          {draggingConv && (
            <ConvItem
              conv={draggingConv}
              active={false}
              onDelete={() => {}}
              overlay
            />
          )}
        </DragOverlay>
      </DndContext>

      <AnimatePresence>
        {showModal && <CreateClientModal onClose={() => { setShowModal(false); router.refresh() }} />}
      </AnimatePresence>
    </>
  )
}

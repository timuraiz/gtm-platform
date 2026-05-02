'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { type Client } from '@/app/actions/clients'
import { CreateClientForm } from './create-client-form'
import { fadeUp, scaleIn, staggerContainer, springGentle } from '@/lib/animations'

export function Dashboard({ clients }: { clients: Client[] }) {
  const [showForm, setShowForm] = useState(false)
  const router = useRouter()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Clients</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          {showForm ? 'Cancel' : '+ New client'}
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            key="form"
            variants={scaleIn}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
            transition={springGentle}
            className="rounded-xl border border-zinc-200 bg-white p-5"
          >
            <CreateClientForm onSuccess={() => { setShowForm(false); router.refresh() }} />
          </motion.div>
        )}
      </AnimatePresence>

      {clients.length === 0 && !showForm && (
        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={springGentle}
          className="text-sm text-zinc-400"
        >
          No clients yet. Create your first one.
        </motion.p>
      )}

      <motion.div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {clients.map((client) => (
          <motion.div key={client.id} variants={fadeUp} transition={springGentle}>
            <Link
              href={`/clients/${client.id}`}
              className="block rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-300 hover:shadow-sm transition-all"
            >
              <p className="font-medium text-zinc-900">{client.name}</p>
              {client.website_url && (
                <p className="mt-0.5 text-xs text-zinc-400 truncate">{client.website_url}</p>
              )}
              <p className="mt-3 text-xs text-zinc-500">
                {client.projects?.length ?? 0} project{client.projects?.length !== 1 ? 's' : ''}
              </p>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}

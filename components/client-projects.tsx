'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { type Project } from '@/app/actions/projects'
import { CreateProjectForm } from './create-project-form'
import { fadeUp, scaleIn, staggerContainer, springGentle } from '@/lib/animations'
import { useFreshlyCreated } from '@/lib/use-freshly-created'

function IcpTags({ items, color }: { items: string[]; color: string }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.slice(0, 3).map((item) => (
        <span key={item} className={`rounded-full px-2 py-0.5 text-xs ${color}`}>{item}</span>
      ))}
      {items.length > 3 && (
        <span className="rounded-full px-2 py-0.5 text-xs bg-zinc-100 text-zinc-400">+{items.length - 3}</span>
      )}
    </div>
  )
}

function ProjectCard({ project, clientId, fresh }: { project: Project; clientId: string; fresh: boolean }) {
  return (
    <motion.div variants={fadeUp} transition={springGentle} className="h-full relative">
      {fresh && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-[3px] rounded-[14px] ring-2 ring-emerald-300"
          style={{ animation: 'freshPulse 1.6s ease-out 2' }}
        />
      )}
      <Link
        href={`/clients/${clientId}/projects/${project.id}`}
        className="flex flex-col h-full rounded-xl border border-zinc-200 bg-white p-4 space-y-3 hover:border-zinc-300 hover:shadow-sm transition-all"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-zinc-900">{project.name}</p>
            {project.offer_text && (
              <p className="mt-0.5 text-xs text-zinc-400 line-clamp-2">{project.offer_text}</p>
            )}
          </div>
          <span className="shrink-0 rounded-lg bg-zinc-50 border border-zinc-100 px-2.5 py-1 text-xs text-zinc-400">
            ▶ Pipeline
          </span>
        </div>

        {project.icp_json && (
          <div className="space-y-2">
            <IcpTags items={project.icp_json.industries ?? []} color="bg-blue-50 text-blue-700" />
            <IcpTags items={project.icp_json.titles ?? []} color="bg-purple-50 text-purple-700" />
            <IcpTags items={project.icp_json.geo ?? []} color="bg-green-50 text-green-700" />
          </div>
        )}
      </Link>
    </motion.div>
  )
}

export function ClientProjects({ clientId, projects }: { clientId: string; projects: Project[] }) {
  const [showForm, setShowForm] = useState(false)
  const router = useRouter()
  const fresh = useFreshlyCreated('project')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Projects</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          {showForm ? 'Cancel' : '+ New project'}
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
            <CreateProjectForm
              clientId={clientId}
              onSuccess={() => { setShowForm(false); router.refresh() }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {projects.length === 0 && !showForm && (
        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={springGentle}
          className="text-sm text-zinc-400"
        >
          No projects yet. Create one with an offer or ICP description.
        </motion.p>
      )}

      <motion.div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 items-stretch"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} clientId={clientId} fresh={fresh.has(project.id)} />
        ))}
      </motion.div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { type Project } from '@/app/actions/projects'
import { type Contact } from '@/app/actions/contacts'
import { type CaseStudy } from '@/app/actions/clients'
import { ClientProjects } from './client-projects'
import { CaseStudiesPanel } from './case-studies-panel'
import { fadeUp, springGentle } from '@/lib/animations'

type Tab = 'projects' | 'contacts' | 'social_proof'

function ContactRow({ contact }: { contact: Contact }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-xl border border-zinc-100 bg-white hover:border-zinc-200 transition-colors">
      <div className="size-8 rounded-lg bg-zinc-100 flex items-center justify-center text-sm font-bold text-zinc-500 shrink-0">
        {(contact.first_name?.[0] ?? contact.email?.[0] ?? '?').toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-900 truncate">
          {[contact.first_name, contact.last_name].filter(Boolean).join(' ') || '—'}
        </p>
        <p className="text-xs text-zinc-400 truncate">{contact.title ?? contact.company_name ?? ''}</p>
      </div>
      <div className="text-right shrink-0">
        {contact.email && (
          <p className="text-xs text-zinc-500 font-mono">{contact.email}</p>
        )}
        {contact.company_domain && (
          <p className="text-xs text-zinc-300">{contact.company_domain}</p>
        )}
      </div>
      {contact.linkedin_url && !contact.linkedin_url.startsWith('person-') && (
        <a
          href={contact.linkedin_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-300 hover:text-blue-500 transition-colors shrink-0 text-sm"
        >
          in
        </a>
      )}
    </div>
  )
}

export function ClientPageTabs({
  clientId,
  websiteUrl,
  projects,
  contacts,
  caseStudies,
  caseStudiesScrapedAt,
}: {
  clientId: string
  websiteUrl: string | null
  projects: Project[]
  contacts: Contact[]
  caseStudies: CaseStudy[]
  caseStudiesScrapedAt: string | null
}) {
  const [tab, setTab] = useState<Tab>('projects')

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'projects', label: 'Projects', count: projects.length },
    { id: 'contacts', label: 'Contacts', count: contacts.length },
    { id: 'social_proof', label: 'Social Proof', count: caseStudies.length || undefined },
  ]

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-zinc-100 pb-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? 'text-zinc-900' : 'text-zinc-400 hover:text-zinc-600'
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="ml-1.5 text-xs text-zinc-400">{t.count}</span>
            )}
            {tab === t.id && (
              <motion.div
                layoutId="tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900 rounded-full"
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {tab === 'projects' && (
          <motion.div
            key="projects"
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={springGentle}
          >
            <ClientProjects clientId={clientId} projects={projects} />
          </motion.div>
        )}

        {tab === 'social_proof' && (
          <motion.div
            key="social_proof"
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={springGentle}
          >
            <CaseStudiesPanel
              clientId={clientId}
              websiteUrl={websiteUrl}
              initialCaseStudies={caseStudies}
              scrapedAt={caseStudiesScrapedAt}
            />
          </motion.div>
        )}

        {tab === 'contacts' && (
          <motion.div
            key="contacts"
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={springGentle}
          >
            {contacts.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-sm text-zinc-400">No contacts yet.</p>
                <p className="mt-1 text-xs text-zinc-300">Open a project and click "Find contacts"</p>
              </div>
            ) : (
              <div className="space-y-2">
                {contacts.map((c) => (
                  <ContactRow key={c.id} contact={c} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

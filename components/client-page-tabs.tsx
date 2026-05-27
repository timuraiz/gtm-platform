'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { type Project } from '@/app/actions/projects'
import { type CaseStudy } from '@/app/actions/clients'
import { type ClientStats } from '@/app/actions/iterations'
import { type BlacklistEntry } from '@/app/actions/blacklist'
import { type LinkedinAccount } from '@/app/actions/linkedin-accounts'
import { ClientProjects } from './client-projects'
import { CaseStudiesPanel } from './case-studies-panel'
import { ClientStatsPanel } from './client-stats-panel'
import { BlacklistPanel } from './blacklist-panel'
import { LinkedinAccountsPanel } from './linkedin-accounts-panel'
import { fadeUp, springGentle } from '@/lib/animations'

type Tab = 'projects' | 'stats' | 'social_proof' | 'blacklist' | 'accounts'

export function ClientPageTabs({
  clientId,
  websiteUrl,
  projects,
  caseStudies,
  caseStudiesScrapedAt,
  stats,
  statsRange,
  statsProjectIds,
  blacklist,
  linkedinAccounts,
}: {
  clientId: string
  websiteUrl: string | null
  projects: Project[]
  caseStudies: CaseStudy[]
  caseStudiesScrapedAt: string | null
  stats: ClientStats
  statsRange: { from: string | null; to: string | null }
  statsProjectIds: string[]
  blacklist: BlacklistEntry[]
  linkedinAccounts: LinkedinAccount[]
}) {
  const [tab, setTab] = useState<Tab>('projects')

  const totalIterations = stats.linkedin.iterations + stats.email.iterations
  const activeAccountsCount = linkedinAccounts.filter(a => !a.archived_at).length

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'projects', label: 'Projects', count: projects.length },
    { id: 'stats', label: 'Stats', count: totalIterations || undefined },
    { id: 'accounts', label: 'LinkedIn Accounts', count: activeAccountsCount || undefined },
    { id: 'social_proof', label: 'Social Proof', count: caseStudies.length || undefined },
    { id: 'blacklist', label: 'Blacklist', count: blacklist.length || undefined },
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

        {tab === 'stats' && (
          <motion.div
            key="stats"
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={springGentle}
          >
            <ClientStatsPanel
              stats={stats}
              range={statsRange}
              allProjects={projects.map(p => ({ id: p.id, name: p.name }))}
              selectedProjectIds={statsProjectIds}
            />
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

        {tab === 'accounts' && (
          <motion.div
            key="accounts"
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={springGentle}
          >
            <LinkedinAccountsPanel clientId={clientId} initialAccounts={linkedinAccounts} />
          </motion.div>
        )}

        {tab === 'blacklist' && (
          <motion.div
            key="blacklist"
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={springGentle}
          >
            <BlacklistPanel clientId={clientId} initialEntries={blacklist} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getProject, getPipelineRuns, getContacts } from '@/app/actions/pipeline'
import { getSequences, getProjectCaseStudies } from '@/app/actions/sequences'
import { ProjectPipelineView } from '@/components/project-pipeline-view'
import { ClientLogo } from '@/components/client-logo'
import { IcpEditor } from '@/components/icp-editor'
import { ContactsTable } from '@/components/contacts-table'
import { SequenceBuilder } from '@/components/sequence-builder'

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; projectId: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id: clientId, projectId } = await params
  const { tab = 'pipeline' } = await searchParams

  const [project, runs, contacts, sequences, caseStudies] = await Promise.all([
    getProject(projectId),
    getPipelineRuns(projectId),
    getContacts(projectId),
    getSequences(projectId),
    getProjectCaseStudies(projectId),
  ])

  if (!project) redirect(`/clients/${clientId}`)

  const client = project.clients as { id: string; name: string; logo_url?: string; website_url?: string } | null

  return (
    <div className="px-8 py-8 w-full">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-400 mb-6">
        <Link href={`/clients/${clientId}`} className="flex items-center gap-1.5 hover:text-zinc-600 transition-colors">
          {client && (
            <ClientLogo name={client.name} logoUrl={client.logo_url ?? null} size="sm" />
          )}
          <span>{client?.name ?? 'Client'}</span>
        </Link>
        <span>/</span>
        <span className="text-zinc-700 font-medium">{project.name}</span>
      </div>

      {/* Project header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">{project.name}</h1>
        {project.offer_text && (
          <p className="mt-1 text-sm text-zinc-500 max-w-2xl">{project.offer_text}</p>
        )}
      </div>

      {/* ICP editor */}
      <div className="mb-6">
        <IcpEditor
          projectId={projectId}
          icp={project.icp_json as Record<string, unknown> | null}
          offerText={project.offer_text as string | null}
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-100 mb-6 flex gap-1">
        {([
          { key: 'pipeline', label: 'Pipeline' },
          { key: 'contacts', label: `Contacts${contacts.length ? ` (${contacts.length})` : ''}` },
          { key: 'sequences', label: `Sequences${sequences.length ? ` (${sequences.length})` : ''}` },
        ] as const).map(t => (
          <Link
            key={t.key}
            href={`?tab=${t.key}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-zinc-900 text-zinc-900'
                : 'border-transparent text-zinc-400 hover:text-zinc-600'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'contacts' ? (
        <ContactsTable contacts={contacts} />
      ) : tab === 'sequences' ? (
        <SequenceBuilder projectId={projectId} initialSequences={sequences} caseStudies={caseStudies} />
      ) : (
        <ProjectPipelineView projectId={projectId} initialRuns={runs} icp={project.icp_json as Record<string, unknown> | null} />
      )}
    </div>
  )
}

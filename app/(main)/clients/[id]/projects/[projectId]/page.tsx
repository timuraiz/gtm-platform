import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getProject, getPipelineRuns, getContacts, getIterationCustomColumns } from '@/app/actions/pipeline'
import { getProjectCompanies } from '@/app/actions/companies'
import { getSequences, getProjectCaseStudies, getProjectShareToken } from '@/app/actions/sequences'
import { getIterations } from '@/app/actions/iterations'
import { ProjectPipelineView } from '@/components/project-pipeline-view'
import { ClientLogo } from '@/components/client-logo'
import { IcpEditor } from '@/components/icp-editor'
import { ContactsTable } from '@/components/contacts-table'
import { CompaniesTable } from '@/components/companies-table'
import { TabFade } from '@/components/tab-fade'
import { SequenceBuilder } from '@/components/sequence-builder'
import { ProjectShareButton } from '@/components/project-share-button'
import { IterationSelector, FirstIterationPrompt } from '@/components/iteration-selector'
import { IterationStats } from '@/components/iteration-stats'

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; projectId: string }>
  searchParams: Promise<{ tab?: string; iter?: string }>
}) {
  const { id: clientId, projectId } = await params
  const { tab = 'pipeline', iter } = await searchParams

  const iterations = await getIterations(projectId)
  const activeIteration = iterations.find(i => i.id === iter) ?? iterations[0] ?? null

  const [project, runs, contacts, sequences, caseStudies, shareToken, customColumns, projectCompanies] = await Promise.all([
    getProject(projectId),
    getPipelineRuns(projectId),
    activeIteration ? getContacts(projectId, activeIteration.id) : Promise.resolve([]),
    activeIteration ? getSequences(projectId, activeIteration.id) : Promise.resolve([]),
    getProjectCaseStudies(projectId),
    getProjectShareToken(projectId),
    activeIteration ? getIterationCustomColumns(projectId, activeIteration.id) : Promise.resolve([] as string[]),
    getProjectCompanies(projectId),
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
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-zinc-900">{project.name}</h1>
          {project.offer_text && (
            <p className="mt-1 text-sm text-zinc-500 max-w-2xl">{project.offer_text}</p>
          )}
        </div>
        {shareToken && <ProjectShareButton token={shareToken} />}
      </div>

      {/* ICP editor */}
      <div className="mb-6">
        <IcpEditor
          projectId={projectId}
          icp={project.icp_json as Record<string, unknown> | null}
          offerText={project.offer_text as string | null}
        />
      </div>

      {!activeIteration ? (
        <FirstIterationPrompt projectId={projectId} />
      ) : (
        <>
          {/* Iterations + tabs — fixed in document position, no sticky */}
          <IterationSelector iterations={iterations} activeId={activeIteration.id} projectId={projectId} />
          <div className="border-b border-zinc-100 mb-6 flex gap-1">
            {([
              { key: 'pipeline', label: 'Pipeline' },
              { key: 'companies', label: `Companies${projectCompanies.length ? ` (${projectCompanies.length})` : ''}` },
              { key: 'contacts', label: `Contacts${contacts.length ? ` (${contacts.length})` : ''}` },
              { key: 'sequences', label: `Sequences${sequences.length ? ` (${sequences.length})` : ''}` },
              { key: 'stats', label: 'Stats' },
            ] as const).map(t => (
              <Link
                key={t.key}
                href={`?tab=${t.key}&iter=${activeIteration.id}`}
                scroll={false}
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

          <TabFade tabKey={tab}>
            {tab === 'companies' ? (
              <CompaniesTable companies={projectCompanies} projectId={projectId} iterationId={activeIteration.id} />
            ) : tab === 'contacts' ? (
              <ContactsTable contacts={contacts} projectId={projectId} iterationId={activeIteration.id} />
            ) : tab === 'sequences' ? (
              <SequenceBuilder projectId={projectId} initialSequences={sequences} caseStudies={caseStudies} iterationId={activeIteration.id} iterationChannel={activeIteration.channel} customColumns={customColumns} />
            ) : tab === 'stats' ? (
              <IterationStats iterationId={activeIteration.id} initialStats={activeIteration.stats ?? null} uploadedAt={activeIteration.stats_uploaded_at ?? null} />
            ) : (
              <ProjectPipelineView projectId={projectId} iterationId={activeIteration.id} initialRuns={runs} icp={project.icp_json as Record<string, unknown> | null} />
            )}
          </TabFade>
        </>
      )}
    </div>
  )
}

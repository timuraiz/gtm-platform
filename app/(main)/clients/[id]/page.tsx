import { redirect } from 'next/navigation'
import { getClient, getClientShareToken } from '@/app/actions/clients'
import { getProjects } from '@/app/actions/projects'
import { getClientStats } from '@/app/actions/iterations'
import { getBlacklist } from '@/app/actions/blacklist'
import { getLinkedinAccounts } from '@/app/actions/linkedin-accounts'
import { ClientLogo } from '@/components/client-logo'
import { ClientPageTabs } from '@/components/client-page-tabs'
import { ShareReportButton } from '@/components/share-report-button'
import { ClientArchiveButton } from '@/components/client-archive-button'

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string; to?: string; projects?: string }>
}) {
  const { id } = await params
  const { from, to, projects: projectsParam } = await searchParams
  const selectedProjectIds = projectsParam ? projectsParam.split(',').filter(Boolean) : null
  let client, projects, stats, shareToken, blacklist, linkedinAccounts
  try {
    ;[client, projects, stats, shareToken, blacklist, linkedinAccounts] = await Promise.all([
      getClient(id),
      getProjects(id),
      getClientStats(id, from ?? null, to ?? null, selectedProjectIds),
      getClientShareToken(id),
      getBlacklist(id),
      getLinkedinAccounts(id, { includeArchived: true }),
    ])
  } catch {
    redirect('/')
  }

  return (
    <div className="px-8 py-8 w-full">
      <div className="mb-8 flex items-center gap-3">
        <ClientLogo name={client!.name} logoUrl={client!.logo_url ?? null} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-zinc-900">{client!.name}</h1>
            {client!.archived_at && (
              <span className="text-[11px] uppercase tracking-wider text-zinc-400 border border-zinc-200 rounded px-1.5 py-0.5">
                Archived
              </span>
            )}
          </div>
          {client!.website_url && (
            <a
              href={client!.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              {client!.website_url}
            </a>
          )}
        </div>
        {shareToken && <ShareReportButton token={shareToken} />}
        <ClientArchiveButton clientId={id} archived={!!client!.archived_at} />
      </div>

      <ClientPageTabs
        clientId={id}
        websiteUrl={client!.website_url ?? null}
        projects={projects!}
        caseStudies={(client!.case_studies as import('@/app/actions/clients').CaseStudy[]) ?? []}
        caseStudiesScrapedAt={client!.case_studies_scraped_at ?? null}
        stats={stats!}
        statsRange={{ from: from ?? null, to: to ?? null }}
        statsProjectIds={selectedProjectIds ?? []}
        blacklist={blacklist!}
        linkedinAccounts={linkedinAccounts!}
      />
    </div>
  )
}

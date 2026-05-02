import { redirect } from 'next/navigation'
import { getClient } from '@/app/actions/clients'
import { getProjects } from '@/app/actions/projects'
import { getContacts } from '@/app/actions/contacts'
import { ClientProjects } from '@/components/client-projects'
import { ClientLogo } from '@/components/client-logo'
import { ClientPageTabs } from '@/components/client-page-tabs'

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let client, projects, contacts
  try {
    ;[client, projects, contacts] = await Promise.all([
      getClient(id),
      getProjects(id),
      getContacts(id),
    ])
  } catch {
    redirect('/')
  }

  return (
    <div className="px-8 py-8 w-full">
      <div className="mb-8 flex items-center gap-3">
        <ClientLogo name={client!.name} logoUrl={client!.logo_url ?? null} size="lg" />
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">{client!.name}</h1>
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
      </div>

      <ClientPageTabs
        clientId={id}
        websiteUrl={client!.website_url ?? null}
        projects={projects!}
        contacts={contacts!}
        caseStudies={(client!.case_studies as import('@/app/actions/clients').CaseStudy[]) ?? []}
        caseStudiesScrapedAt={client!.case_studies_scraped_at ?? null}
      />
    </div>
  )
}

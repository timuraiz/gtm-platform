import { notFound } from 'next/navigation'
import { getClientByShareToken } from '@/app/actions/clients'
import { getProjects } from '@/app/actions/projects'
import { getClientStats } from '@/app/actions/iterations'
import { ClientLogo } from '@/components/client-logo'
import { ClientStatsPanel } from '@/components/client-stats-panel'

export default async function ShareClientReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ from?: string; to?: string; projects?: string }>
}) {
  const { token } = await params
  const { from, to, projects: projectsParam } = await searchParams

  const client = await getClientByShareToken(token)
  if (!client) notFound()

  const selectedProjectIds = projectsParam ? projectsParam.split(',').filter(Boolean) : null
  const [projects, stats] = await Promise.all([
    getProjects(client.id),
    getClientStats(client.id, from ?? null, to ?? null, selectedProjectIds),
  ])

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-8 pt-14 pb-20">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <ClientLogo name={client.name} logoUrl={client.logo_url ?? null} size="lg" />
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-zinc-400 font-semibold">Outreach report</p>
            <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">{client.name}</h1>
          </div>
        </div>

        <ClientStatsPanel
          stats={stats}
          range={{ from: from ?? null, to: to ?? null }}
          allProjects={projects.map(p => ({ id: p.id, name: p.name }))}
          selectedProjectIds={selectedProjectIds ?? []}
        />
      </div>
    </div>
  )
}

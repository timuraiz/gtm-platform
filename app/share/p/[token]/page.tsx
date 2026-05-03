import { notFound } from 'next/navigation'
import {
  getProjectByShareToken,
  getSequenceContext,
  getSequences,
  getComments,
} from '@/app/actions/sequences'
import { getContacts } from '@/app/actions/pipeline'
import { getIterations } from '@/app/actions/iterations'
import type { SequenceComment } from '@/app/actions/sequences'
import { ShareProjectView } from './share-project-view'

export default async function ShareProjectPage({ params, searchParams }: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ tab?: string; iter?: string }>
}) {
  const { token } = await params
  const { tab, iter } = await searchParams
  const project = await getProjectByShareToken(token)
  if (!project) notFound()

  const iterations = await getIterations(project.id)
  const activeIteration = iterations.find(i => i.id === iter) ?? iterations[0]

  const [allSequences, context, contacts] = await Promise.all([
    activeIteration ? getSequences(project.id, activeIteration.id) : Promise.resolve([]),
    getSequenceContext(project.id),
    activeIteration ? getContacts(project.id, activeIteration.id) : Promise.resolve([]),
  ])

  const versions = [...allSequences].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))

  const commentArrays = await Promise.all(versions.map(s => getComments(s.id)))
  const commentsBySeq: Record<string, SequenceComment[]> = {}
  versions.forEach((s, i) => { commentsBySeq[s.id] = commentArrays[i] })

  return (
    <ShareProjectView
      projectId={project.id}
      projectName={project.name}
      versions={versions}
      initialCommentsBySeq={commentsBySeq}
      context={context}
      contacts={contacts}
      previewContact={contacts[0] ?? null}
      initialContactsApproved={project.contacts_approved}
      initialTab={tab === 'sequences' ? 'sequences' : 'contacts'}
      iterations={iterations}
      activeIterationId={activeIteration?.id ?? ''}
    />
  )
}

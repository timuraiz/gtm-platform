import { notFound } from 'next/navigation'
import { getSequenceByToken, getComments, getSequenceContext, getSequences } from '@/app/actions/sequences'
import { ShareSequenceView } from './share-sequence-view'
import type { SequenceComment } from '@/app/actions/sequences'

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const sequence = await getSequenceByToken(token)
  if (!sequence) notFound()

  const [allSequences, context] = await Promise.all([
    getSequences(sequence.project_id),
    getSequenceContext(sequence.project_id),
  ])

  // Order ASC so v1 is the oldest
  const versions = [...allSequences].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))

  // Pre-load comments for every version so version switching is instant
  const commentArrays = await Promise.all(versions.map(s => getComments(s.id)))
  const commentsBySeq: Record<string, SequenceComment[]> = {}
  versions.forEach((s, i) => { commentsBySeq[s.id] = commentArrays[i] })

  return (
    <ShareSequenceView
      versions={versions}
      initialActiveId={sequence.id}
      initialCommentsBySeq={commentsBySeq}
      context={context}
    />
  )
}

import { redirect } from 'next/navigation'
import { getConversation } from '@/app/actions/conversations'
import { Chat } from '@/components/chat'

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const conversation = await getConversation(id)
  if (!conversation) redirect('/')

  return <Chat conversationId={id} initialMessages={conversation.messages} />
}

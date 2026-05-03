import { redirect } from 'next/navigation'
import { getConversation } from '@/app/actions/conversations'
import { Chat } from '@/components/chat'
import { createClient } from '@/utils/supabase/server'

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [conversation, { data: { user } }] = await Promise.all([
    getConversation(id),
    supabase.auth.getUser(),
  ])
  if (!conversation) redirect('/')

  return <Chat conversationId={id} initialMessages={conversation.messages} userEmail={user?.email ?? null} />
}

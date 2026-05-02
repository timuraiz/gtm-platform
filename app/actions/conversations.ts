'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

export type Conversation = {
  id: string
  title: string
  messages: unknown[]
  client_id: string | null
  created_at: string
  updated_at: string
}

export async function getConversations(): Promise<Conversation[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('conversations')
    .select('id, title, client_id, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(50)
  return (data ?? []) as Conversation[]
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', id)
    .single()
  return data as Conversation | null
}

export async function createConversation(firstMessage: string): Promise<string> {
  const supabase = await createClient()
  const title = firstMessage.slice(0, 60) + (firstMessage.length > 60 ? '…' : '')
  const { data, error } = await supabase
    .from('conversations')
    .insert({ title })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/')
  return data.id
}

export async function saveConversation(id: string, messages: unknown[]): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('conversations')
    .update({ messages, updated_at: new Date().toISOString() })
    .eq('id', id)
}

export async function linkConversationToClient(
  conversationId: string,
  clientId: string | null,
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('conversations')
    .update({ client_id: clientId })
    .eq('id', conversationId)
  if (error) throw new Error(error.message)
  revalidatePath('/')
}

export async function deleteConversation(id: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('conversations').delete().eq('id', id)
  revalidatePath('/')
}

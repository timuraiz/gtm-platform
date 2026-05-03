'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

export type TeamMember = {
  id: string
  email: string
  invited_by_email: string | null
  created_at: string
}

export async function getMembers(): Promise<TeamMember[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('team_members')
    .select('*')
    .order('created_at', { ascending: true })
  return (data ?? []) as TeamMember[]
}

export async function inviteMember(email: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const trimmed = email.trim().toLowerCase()
  if (!trimmed.includes('@')) return { ok: false, error: 'Enter a valid email' }

  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('team_members')
    .insert({ email: trimmed, invited_by_email: user?.email ?? null })

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'This email is already invited' }
    return { ok: false, error: error.message }
  }
  revalidatePath('.')
  return { ok: true }
}

export async function removeMember(id: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('team_members').delete().eq('id', id)
  revalidatePath('.')
}

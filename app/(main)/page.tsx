import { Chat } from '@/components/chat'
import { createClient } from '@/utils/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return <Chat userEmail={user?.email ?? null} />
}

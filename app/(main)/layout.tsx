import { getClients } from '@/app/actions/clients'
import { getConversations } from '@/app/actions/conversations'
import { Sidebar } from '@/components/sidebar'
import { FloatingChat } from '@/components/floating-chat'
import { createClient } from '@/utils/supabase/server'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const [clients, conversations] = await Promise.all([
    getClients({ includeArchived: true }),
    getConversations(),
  ])

  return (
    <div className="flex h-screen bg-zinc-50 p-3 gap-3">
      <Sidebar clients={clients} conversations={conversations} userEmail={user?.email ?? null} />
      <main className="flex-1 min-h-0 rounded-2xl bg-white border border-zinc-100 shadow-sm overflow-y-auto">
        {children}
      </main>
      <FloatingChat userEmail={user?.email ?? null} />
    </div>
  )
}

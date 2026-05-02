import { getClients } from '@/app/actions/clients'
import { getConversations } from '@/app/actions/conversations'
import { Sidebar } from '@/components/sidebar'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const [clients, conversations] = await Promise.all([getClients(), getConversations()])

  return (
    <div className="flex h-screen bg-zinc-50 p-3 gap-3">
      <Sidebar clients={clients} conversations={conversations} />
      <main className="flex-1 min-h-0 rounded-2xl bg-white border border-zinc-100 shadow-sm overflow-y-auto">
        {children}
      </main>
    </div>
  )
}

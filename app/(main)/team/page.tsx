import { getMembers } from '@/app/actions/team'
import { createClient } from '@/utils/supabase/server'
import { TeamPanel } from '@/components/team-panel'

export default async function TeamPage() {
  const supabase = await createClient()
  const [{ data: { user } }, members] = await Promise.all([
    supabase.auth.getUser(),
    getMembers(),
  ])
  return (
    <div className="px-8 py-8 w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">Team</h1>
        <p className="text-sm text-zinc-500 mt-1">Anyone on this list can sign in and see all clients, projects, and chats</p>
      </div>
      <TeamPanel members={members} currentEmail={user?.email ?? null} />
    </div>
  )
}

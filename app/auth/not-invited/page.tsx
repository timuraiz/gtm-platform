import Link from 'next/link'
import { Mail, ShieldOff } from 'lucide-react'

export default function NotInvitedPage() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="flex items-center gap-2 justify-center mb-6">
          <span className="size-8 rounded-xl bg-zinc-900 flex items-center justify-center">
            <Mail size={15} className="text-white" />
          </span>
          <span className="text-sm font-semibold text-zinc-900">Leadsmore</span>
        </div>
        <ShieldOff size={28} className="text-zinc-300 mx-auto" strokeWidth={1.5} />
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 tracking-tight">Not invited yet</h1>
          <p className="text-sm text-zinc-500 mt-2">
            This email isn&apos;t on the team. Ask a teammate to invite you, then sign in.
          </p>
        </div>
        <Link
          href="/auth/sign-in"
          className="inline-block text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          Use a different email
        </Link>
      </div>
    </div>
  )
}

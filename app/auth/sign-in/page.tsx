import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { SignInForm } from './sign-in-form'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) redirect(next && next.startsWith('/') ? next : '/')

  return (
    <div className="min-h-screen flex">
      {/* Left — branding panel */}
      <div
        className="hidden lg:flex w-[420px] shrink-0 flex-col px-12 py-10"
        style={{
          background: 'radial-gradient(ellipse 100% 60% at 30% 20%, rgba(255,255,255,0.04) 0%, transparent 60%), #09090b',
        }}
      >
        <a href="/landing" className="text-sm font-semibold text-white tracking-tight">
          GTM Platform
        </a>

        <div className="flex-1 flex flex-col justify-center gap-10">
          <div className="space-y-4">
            <p className="text-2xl font-semibold text-white leading-snug tracking-tight">
              Your B2B pipeline,<br />
              from first signal<br />
              to booked meeting.
            </p>
            <p className="text-sm text-zinc-500 leading-relaxed max-w-xs">
              Structured campaigns, AI sequences, and analytics
              that show what actually converts.
            </p>
          </div>

          <div className="space-y-3">
            {[
              'Apollo-powered company discovery',
              'Segment-driven iteration tracking',
              'AI sequences from your real offer',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm text-zinc-400">
                <span className="size-1 rounded-full bg-zinc-600 shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-zinc-700">© 2025 GTM Platform</p>
      </div>

      {/* Right — auth form */}
      <div className="flex-1 flex items-center justify-center bg-white px-6 py-12">
        <SignInForm next={next ?? '/'} />
      </div>
    </div>
  )
}

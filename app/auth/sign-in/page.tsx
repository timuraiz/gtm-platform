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
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <SignInForm next={next ?? '/'} />
    </div>
  )
}

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { PasswordForm } from './password-form'

export default async function PasswordSignInPage({
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
      <PasswordForm next={next ?? '/'} />
    </div>
  )
}

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PREFIXES = [
  '/auth',           // sign-in flow
  '/share',          // public review pages
  '/_next',
  '/favicon.ico',
  '/.well-known/workflow', // Workflow DevKit internal endpoints
]

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_PREFIXES.some(p => path === p || path.startsWith(p + '/'))

  if (!user && !isPublic) {
    const signInUrl = new URL('/auth/sign-in', request.url)
    if (path !== '/') signInUrl.searchParams.set('next', path + request.nextUrl.search)
    return NextResponse.redirect(signInUrl)
  }

  // Logged-in but not on the team allow-list → sign out + redirect
  if (user && user.email && !isPublic) {
    const { data: member } = await supabase
      .from('team_members')
      .select('email')
      .eq('email', user.email.toLowerCase())
      .maybeSingle()
    if (!member) {
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL('/auth/not-invited', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|\\.well-known/workflow/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}

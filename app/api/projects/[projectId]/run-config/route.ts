import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

function db() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params
  const body = await req.json() as { keywords?: string[]; excluded_domains?: string[] }

  const { error } = await db()
    .from('projects')
    .update({ run_config_json: body })
    .eq('id', projectId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

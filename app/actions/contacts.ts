'use server'

import { createClient } from '@/utils/supabase/server'

export type Contact = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  title: string | null
  linkedin_url: string
  company_domain?: string
  company_name?: string
}

export async function getContacts(projectId: string): Promise<Contact[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, email, title, linkedin_url, companies(domain, name)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(200)

  return ((data ?? []) as unknown[]).map((row) => {
    const r = row as Record<string, unknown>
    const company = r.companies as Record<string, string> | null
    return {
      id: r.id as string,
      first_name: r.first_name as string | null,
      last_name: r.last_name as string | null,
      email: r.email as string | null,
      title: r.title as string | null,
      linkedin_url: r.linkedin_url as string,
      company_domain: company?.domain,
      company_name: company?.name,
    }
  })
}

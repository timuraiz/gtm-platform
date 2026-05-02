import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/utils/supabase/server'

const anthropic = new Anthropic()

async function fetchPage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GTMBot/1.0)' },
      signal: AbortSignal.timeout(10_000),
    })
    const html = await res.text()
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 8000)
  } catch { return '' }
}

function findCaseStudyLinks(html: string, baseUrl: string): string[] {
  const patterns = [/case.stud/i, /customer/i, /success.stor/i, /testimonial/i, /\/results/i, /\/clients/i, /portfolio/i, /reference/i]
  const linkRegex = /href="([^"]+)"/g
  const links = new Set<string>()
  let match
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1]
    if (href.startsWith('#') || href.startsWith('mailto:')) continue
    if (patterns.some(p => p.test(href))) {
      try {
        const url = new URL(href, baseUrl)
        if (url.hostname === new URL(baseUrl).hostname) links.add(url.href)
      } catch { /* skip */ }
    }
  }
  return Array.from(links).slice(0, 5)
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: client } = await supabase.from('clients').select('website_url').eq('id', id).single()
  if (!client?.website_url) return NextResponse.json({ error: 'No website URL' }, { status: 400 })

  const mainHtml = await fetchPage(client.website_url)
  const caseLinks = findCaseStudyLinks(mainHtml, client.website_url)

  const extraPages = await Promise.all(caseLinks.map(url => fetchPage(url)))
  const combined = [mainHtml, ...extraPages].filter(Boolean).join('\n\n---\n\n').slice(0, 24000)

  if (!combined.trim()) {
    await supabase.from('clients').update({ case_studies: [], case_studies_scraped_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ case_studies: [] })
  }

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `Extract all case studies, customer success stories, and testimonials from this website content.

Return a JSON array. Each item:
- "company": client company name
- "industry": industry or niche (optional)
- "result": key metric or outcome, concise — e.g. "Reduced CAC by 40%", "3× revenue in 6 months"
- "description": 1–2 sentence context on what was done (optional)

Rules:
- Only include entries with a real company name AND a concrete result/quote
- If nothing concrete found, return []
- Return only the JSON array, no markdown, no explanation

Content:
${combined}`,
    }],
  })

  let caseStudies: unknown[] = []
  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    caseStudies = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? '[]')
  } catch { caseStudies = [] }

  await supabase.from('clients').update({
    case_studies: caseStudies,
    case_studies_scraped_at: new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ case_studies: caseStudies })
}

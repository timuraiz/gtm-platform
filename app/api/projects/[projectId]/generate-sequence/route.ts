import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/utils/supabase/server'
import type { SequenceConfig, SequenceStep, CaseStudy } from '@/app/actions/sequences'

const anthropic = new Anthropic()

const LINKEDIN_PLACEHOLDERS = `Available placeholders for personalization:
- {firstName} — prospect's first name
- {lastName} — prospect's last name
- {company} — prospect's company name
- {position} — prospect's job title
- {industry} — prospect's industry
- {mutualFirstFullName} — mutual connection's full name (LinkedIn only)`

function buildPrompt(
  config: SequenceConfig,
  offerText: string | null,
  icpJson: Record<string, unknown> | null,
  caseStudies: CaseStudy[],
  customColumns: string[],
): string {
  const toneMap = {
    professional: 'formal, polished, business-like',
    casual: 'friendly, conversational, approachable',
    direct: 'concise, no fluff, straight to the point',
  }

  const caseStudiesText = caseStudies.length > 0
    ? `\nProven results to reference (use 1–2 selectively, not all):\n${caseStudies.map(cs =>
        `- ${cs.company}${cs.industry ? ` (${cs.industry})` : ''}: ${cs.result}${cs.description ? ` — ${cs.description}` : ''}`
      ).join('\n')}`
    : '\nNo case studies / customer references are available for this client.'

  const icpText = icpJson
    ? `\nTarget ICP:\n- Industries: ${(icpJson.industries as string[] ?? []).join(', ')}\n- Titles: ${(icpJson.titles as string[] ?? []).join(', ')}\n- Pain points: ${(icpJson.pain_points as string[] ?? []).join(', ')}`
    : ''

  const channelInstructions = config.channel === 'linkedin'
    ? `Channel: LinkedIn outreach
${config.include_connection_note
  ? `Step types allowed:
- "connection_note": LinkedIn connection request note (max 300 chars, no subject) — use as step 1 on Day 0
- "message": LinkedIn direct message (after connection accepted)`
  : `Step types allowed:
- "message" ONLY — do NOT use "connection_note" under any circumstances

Rules for LinkedIn:
- Connection note: FORBIDDEN. Every step must have type "message".`}

Rules for LinkedIn:
${config.include_connection_note ? '- Connection note: ultra-short, personalized hook, no pitch yet' : ''}
- Messages: build rapport first, pitch later in the sequence
- Keep messages under 500 characters each
- Day 0: first step; subsequent steps spaced 3–5 days apart`
    : `Channel: Email outreach
Step types allowed:
- "email": cold email with subject line

Rules for Email:
- Every step has a "subject" field
- First email: compelling subject, value proposition, soft CTA
- Follow-ups: reference previous email, add new angle
- Keep emails under 200 words each
- Day 0: first email; follow-ups spaced 3–5 days apart`

  const language = (config.language ?? 'English').trim()
  const userNotes = config.user_notes?.trim()

  return `You are a B2B outreach copywriter. Write a ${config.steps_count}-step outreach sequence.

CRITICAL — social proof rules:
- NEVER invent customer names, testimonials, metrics, results, percentages, ROI numbers, or case studies. Hallucinated proof destroys trust the moment a reply asks "wait, who said that?".
- Only use social proof from the "Proven results to reference" list below. If the list is empty, write the sequence WITHOUT any social proof — pure value proposition, problem framing, and curiosity-based hooks instead.
- Do not paraphrase real case studies into vaguer claims (e.g. "we've helped many SaaS companies grow 10x") if those numbers aren't in the list. Either cite a specific result from the list verbatim-ish, or skip social proof entirely.

Offer:
${offerText ?? 'No offer description provided.'}
${icpText}
${caseStudiesText}

${LINKEDIN_PLACEHOLDERS}
${customColumns.length > 0 ? `\nCustom variables (uploaded with the contact list — use them naturally for personalization, only when they fit the message):\n${customColumns.map(c => `- {${c}}`).join('\n')}\n` : ''}
${channelInstructions}

Tone: ${toneMap[config.tone]}

Language: ${language} — write all subject lines and message content in ${language}. Keep placeholders like {firstName}, {company} unchanged regardless of language.
${userNotes ? `\nUser instructions (high priority — follow these closely):\n${userNotes}\n` : ''}
${config.channel === 'linkedin' && !config.include_connection_note ? 'CRITICAL: type must be "message" for every single step. Never use "connection_note".\n\n' : ''}Generate exactly ${config.steps_count} steps. Return only a JSON array:
[
  {
    "type": "connection_note" | "message" | "email",
    "day": <number>,
    "subject": "<string, email only>",
    "content": "<message text with {placeholders}>"
  }
]

No markdown, no explanation, just the JSON array.`
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params
  const body = await req.json() as { config: SequenceConfig; caseStudies?: CaseStudy[]; customColumns?: string[] }
  const { config, caseStudies = [], customColumns = [] } = body

  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('offer_text, icp_json')
    .eq('id', projectId)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const prompt = buildPrompt(
    config,
    project.offer_text,
    project.icp_json as Record<string, unknown> | null,
    caseStudies,
    customColumns,
  )

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  })

  let steps: SequenceStep[] = []
  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    steps = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? '[]')
  } catch {
    return NextResponse.json({ error: 'Failed to parse Claude response' }, { status: 500 })
  }

  return NextResponse.json({ steps })
}

// POST /api/replies/inbound
//
// Receives a LinkedIn reply notification from the user's n8n workflow and
// records it in the `replies` table. Idempotent on (iteration, contact,
// sent_at). Also runs sentiment classification (Claude Haiku) using the
// project's positive_reply_criteria, and returns the client's
// telegram_chat_id so the caller can dispatch a Telegram alert.
//
// Auth: header `X-Webhook-Token` must match env `INBOUND_WEBHOOK_SECRET`.

import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@supabase/ssr'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

function db() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

type Body = {
  // What the n8n webhook gives us. We tolerate every other field being
  // present in the payload but only consume what we need.
  full_name?: string | null
  profile_url?: string | null
  headline?: string | null
  current_company?: string | null
  avatar?: string | null
  email?: string | null
  campaign_name?: string | null
  my_full_name?: string | null
  is_last_message_incoming?: string | boolean
  // The actual reply message from the prospect.
  last_sent_message_text?: string | null
  last_sent_message_send_at_iso?: string | null
  // The last thing WE sent — useful as AI context.
  last_received_message_text?: string | null
}

type Sentiment = 'positive' | 'negative' | 'neutral'

function isIncoming(v: Body['is_last_message_incoming']): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return v.toLowerCase() === 'true'
  return false
}

export async function POST(req: NextRequest) {
  // ── auth ───────────────────────────────────────────────────────────────
  const token = req.headers.get('x-webhook-token')
  const expected = process.env.INBOUND_WEBHOOK_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'INBOUND_WEBHOOK_SECRET not configured' }, { status: 500 })
  }
  if (token !== expected) {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 })
  }

  // ── parse ──────────────────────────────────────────────────────────────
  let payload: Body
  try {
    payload = await req.json() as Body
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  // Only act on actual incoming replies. The webhook can fire for our own
  // outbound messages too in some configurations.
  if (!isIncoming(payload.is_last_message_incoming)) {
    return NextResponse.json({ ok: true, skipped: 'not incoming' })
  }

  const myFullName = payload.my_full_name?.trim()
  const campaignName = payload.campaign_name?.trim()
  const contactLi = payload.profile_url?.trim()
  const messageText = payload.last_sent_message_text?.trim()
  const messageSentAt = payload.last_sent_message_send_at_iso?.trim()

  if (!myFullName || !campaignName || !contactLi || !messageText || !messageSentAt) {
    return NextResponse.json({
      error: 'missing required fields',
      need: ['my_full_name', 'campaign_name', 'profile_url', 'last_sent_message_text', 'last_sent_message_send_at_iso'],
    }, { status: 400 })
  }

  const supabase = db()

  // ── lookup operator account ───────────────────────────────────────────
  // Match by exact name. Restrict to non-archived accounts to avoid
  // resurrecting old aliases.
  const { data: accountRows } = await supabase
    .from('linkedin_accounts')
    .select('id, client_id, archived_at')
    .eq('name', myFullName)
    .is('archived_at', null)
  if (!accountRows || accountRows.length === 0) {
    return NextResponse.json({
      ok: false,
      error: 'unknown linkedin account',
      hint: `Create a LinkedIn account named "${myFullName}" on the client page`,
    }, { status: 404 })
  }
  // It's possible for the same operator name to exist under different
  // clients. Use the campaign_name to disambiguate — iteration lookup will
  // narrow to one of these accounts' clients.
  const accountIds = accountRows.map(a => a.id)
  const candidateClientIds = Array.from(new Set(accountRows.map(a => a.client_id)))

  // ── lookup iteration ──────────────────────────────────────────────────
  // Match iteration where external_campaign_name === campaign_name AND
  // the iteration is under one of the candidate clients (via project).
  const { data: iterRows } = await supabase
    .from('iterations')
    .select('id, project_id, projects!inner(id, client_id, positive_reply_criteria)')
    .eq('external_campaign_name', campaignName)
    .in('projects.client_id', candidateClientIds)
  if (!iterRows || iterRows.length === 0) {
    return NextResponse.json({
      ok: false,
      error: 'no iteration matches campaign_name',
      hint: `Set external_campaign_name="${campaignName}" on the right iteration`,
    }, { status: 404 })
  }
  if (iterRows.length > 1) {
    return NextResponse.json({
      ok: false,
      error: 'ambiguous campaign_name across iterations',
      candidates: iterRows.map(r => r.id),
    }, { status: 409 })
  }
  const iter = iterRows[0] as unknown as {
    id: string
    project_id: string
    projects: { id: string; client_id: string; positive_reply_criteria: string | null }
  }
  const clientId = iter.projects.client_id
  // Pick the account that lives under the matched iteration's client.
  const account = accountRows.find(a => a.client_id === clientId)
  const accountId = account?.id ?? accountIds[0]

  // ── idempotent insert ─────────────────────────────────────────────────
  const ourLast = payload.last_received_message_text?.trim() || null
  const { data: existing } = await supabase
    .from('replies')
    .select('id, sentiment, sentiment_confidence, sentiment_reason')
    .eq('iteration_id', iter.id)
    .eq('contact_li_url', contactLi)
    .eq('message_sent_at', messageSentAt)
    .maybeSingle()

  let replyId: string
  let isNew = false
  if (existing) {
    replyId = existing.id as string
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from('replies')
      .insert({
        iteration_id: iter.id,
        linkedin_account_id: accountId,
        contact_li_url: contactLi,
        contact_name: payload.full_name?.trim() || null,
        contact_headline: payload.headline?.trim() || null,
        contact_company: payload.current_company?.trim() || null,
        contact_avatar_url: payload.avatar?.trim() || null,
        contact_email: payload.email?.trim() || null,
        our_last_message_text: ourLast,
        message_text: messageText,
        message_sent_at: messageSentAt,
        raw_payload: payload,
      })
      .select('id')
      .single()
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
    replyId = inserted.id as string
    isNew = true
  }

  // ── sentiment (only on new rows, or if existing has no sentiment yet) ─
  let sentiment: Sentiment | null = existing?.sentiment as Sentiment | null ?? null
  let sentimentConfidence: number | null = existing?.sentiment_confidence ?? null
  let sentimentReason: string | null = existing?.sentiment_reason ?? null

  if (isNew || sentiment === null) {
    try {
      const res = await classifyReply({
        criteria: iter.projects.positive_reply_criteria,
        ourMessage: ourLast,
        replyText: messageText,
      })
      sentiment = res.sentiment
      sentimentConfidence = res.confidence
      sentimentReason = res.reason
      await supabase
        .from('replies')
        .update({
          sentiment,
          sentiment_confidence: sentimentConfidence,
          sentiment_reason: sentimentReason,
          sentiment_evaluated_at: new Date().toISOString(),
        })
        .eq('id', replyId)
    } catch (e) {
      // Don't fail the whole webhook if AI is down — the reply is recorded,
      // sentiment can be backfilled later.
      console.error('[replies/inbound] sentiment error', e)
    }
  }

  // ── telegram lookup ───────────────────────────────────────────────────
  const { data: clientRow } = await supabase
    .from('clients')
    .select('telegram_chat_id, name')
    .eq('id', clientId)
    .single()

  // Invalidate cached pages that read from replies / getClientStats so
  // the funnel and Replies tab pick up this row on the next render.
  revalidatePath(`/clients/${clientId}`)
  revalidatePath(`/clients/${clientId}/projects/${iter.project_id}`)

  return NextResponse.json({
    ok: true,
    is_new: isNew,
    reply_id: replyId,
    iteration_id: iter.id,
    client_id: clientId,
    client_name: clientRow?.name ?? null,
    telegram_chat_id: clientRow?.telegram_chat_id ?? null,
    sentiment,
    sentiment_confidence: sentimentConfidence,
    sentiment_reason: sentimentReason,
  })
}

// ── sentiment classifier ─────────────────────────────────────────────────
//
// Haiku — needs to be fast (this is in the webhook path) and cheap. The
// prompt is deliberately tight: criteria text from the project + the reply
// + the previous message. We force JSON output.

async function classifyReply({
  criteria,
  ourMessage,
  replyText,
}: {
  criteria: string | null
  ourMessage: string | null
  replyText: string
}): Promise<{ sentiment: Sentiment; confidence: number; reason: string }> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const system = [
    'You classify replies to B2B LinkedIn outreach.',
    'Output a JSON object: {"sentiment": "positive" | "neutral" | "negative", "confidence": <0..1>, "reason": "<one short sentence>"}.',
    'A reply is POSITIVE if it matches the project-specific criteria below.',
    'A reply is NEGATIVE if the prospect declines, asks to stop, or expresses clear disinterest.',
    'Everything else — generic acknowledgements, vague responses, clarifying questions — is NEUTRAL.',
    'Use only what the prospect wrote. Do not invent context.',
    '',
    criteria
      ? `POSITIVE CRITERIA for this project:\n${criteria}`
      : 'POSITIVE CRITERIA: general interest, willingness to schedule a call, asking for more info about the offer.',
  ].join('\n')

  const userText = [
    ourMessage ? `Our previous message:\n"""${ourMessage}"""\n` : '',
    `Prospect reply:\n"""${replyText}"""`,
  ].join('\n')

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system,
    messages: [{ role: 'user', content: userText }],
  })
  const block = msg.content[0]
  if (block.type !== 'text') throw new Error('non-text response')
  const raw = block.text
    .replace(/^```(?:json)?\n?/m, '')
    .replace(/```\s*$/m, '')
    .trim()
  const parsed = JSON.parse(raw) as { sentiment: string; confidence: number; reason: string }
  const s = parsed.sentiment?.toLowerCase()
  const sentiment: Sentiment = s === 'positive' ? 'positive'
    : s === 'negative' ? 'negative'
    : 'neutral'
  const confidence = typeof parsed.confidence === 'number'
    ? Math.max(0, Math.min(1, parsed.confidence))
    : 0.5
  const reason = (parsed.reason ?? '').toString().slice(0, 280)
  return { sentiment, confidence, reason }
}

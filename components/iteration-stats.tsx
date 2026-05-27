'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, X, FileText, Trash2, AlertCircle, BarChart3, Pencil, Check, Sparkles, Users } from 'lucide-react'
import { uploadIterationStats, clearIterationStats, type IterationMetrics, type IterationChannel } from '@/app/actions/iterations'
import {
  setIterationAccountStats,
  type LinkedinAccount,
  type IterationAccountStats,
} from '@/app/actions/linkedin-accounts'

type MetricKey = keyof IterationMetrics

const METRICS: { key: MetricKey; label: string; description: string }[] = [
  { key: 'leads_sent', label: 'Leads sent', description: 'Invites/messages actually sent' },
  { key: 'connections_accepted', label: 'Connections accepted', description: 'LinkedIn only' },
  { key: 'replies', label: 'Replies', description: 'Total replies received' },
  { key: 'positive_replies', label: 'Positive replies', description: 'Replies showing interest' },
  { key: 'meetings_booked', label: 'Meetings booked', description: 'Calls / demos scheduled' },
]

// CSV parser
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') inQuotes = false
      else cell += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { cur.push(cell); cell = '' }
      else if (c === '\n') { cur.push(cell); rows.push(cur); cur = []; cell = '' }
      else if (c === '\r') { /* skip */ }
      else cell += c
    }
  }
  if (cell.length > 0 || cur.length > 0) { cur.push(cell); rows.push(cur) }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].length > 0))
}

type ParsedRow = Record<string, string>
type Suggestion = { value: number; rowIndex: number; column: string; rowAction: string } | null

function autoSuggest(rows: ParsedRow[]): Record<MetricKey, Suggestion> {
  const out: Record<MetricKey, Suggestion> = {
    leads_sent: null, connections_accepted: null, replies: null, positive_replies: null, meetings_booked: null,
  }
  if (rows.length === 0) return out

  const findRow = (...keywords: string[]) => {
    for (let i = 0; i < rows.length; i++) {
      const action = (rows[i].action ?? '').toLowerCase()
      if (keywords.some(k => action.includes(k))) return i
    }
    return -1
  }
  const num = (v: string | undefined) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : NaN
  }

  // leads_sent ← successful from "Invite..." action
  const inviteIdx = findRow('invite')
  if (inviteIdx >= 0) {
    const v = num(rows[inviteIdx].successful)
    if (Number.isFinite(v)) out.leads_sent = { value: v, rowIndex: inviteIdx, column: 'successful', rowAction: rows[inviteIdx].action }
  }

  // connections_accepted ← target of "Message to 1st connections"
  const msgIdx = findRow('1st connection', 'message to 1st')
  if (msgIdx >= 0) {
    const v = num(rows[msgIdx].target)
    if (Number.isFinite(v)) out.connections_accepted = { value: v, rowIndex: msgIdx, column: 'target', rowAction: rows[msgIdx].action }
  }

  // replies ← replied of "Check for replies" (sum across all such rows)
  const replyRows = rows.map((r, i) => ({ r, i })).filter(({ r }) => (r.action ?? '').toLowerCase().includes('repl'))
  if (replyRows.length > 0) {
    let total = 0
    let firstIdx = -1
    for (const { r, i } of replyRows) {
      const v = num(r.replied)
      if (Number.isFinite(v)) { total += v; if (firstIdx === -1) firstIdx = i }
    }
    if (firstIdx >= 0) out.replies = { value: total, rowIndex: firstIdx, column: 'replied', rowAction: replyRows.length > 1 ? `${replyRows.length} reply rows summed` : rows[firstIdx].action }
  }

  return out
}

export function IterationStats({
  iterationId,
  channel,
  initialStats,
  uploadedAt,
  linkedinAccounts,
  assignedAccountIds,
  initialAccountStats,
}: {
  iterationId: string
  channel: IterationChannel
  initialStats: IterationMetrics | null
  uploadedAt: string | null
  linkedinAccounts: LinkedinAccount[]
  assignedAccountIds: string[]
  initialAccountStats: IterationAccountStats[]
}) {
  const router = useRouter()
  const [showUpload, setShowUpload] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<IterationMetrics>(initialStats ?? emptyMetrics())
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)

  // Split-by-account only makes sense for LinkedIn iterations that have at
  // least one account assigned in the selector. Default-on when a breakdown
  // already exists so the user lands on the right view.
  const splitAvailable = channel === 'linkedin' && assignedAccountIds.length > 0
  const [splitMode, setSplitMode] = useState(initialAccountStats.length > 0)

  async function handleSaveManual() {
    setSaving(true)
    try {
      await uploadIterationStats(iterationId, draft)
      setEditing(false)
      router.refresh()
    } finally { setSaving(false) }
  }

  async function handleClear() {
    if (!confirm('Remove uploaded stats?')) return
    setClearing(true)
    try {
      await clearIterationStats(iterationId)
      setDraft(emptyMetrics())
      router.refresh()
    } finally { setClearing(false) }
  }

  const hasAny = initialStats && METRICS.some(m => initialStats[m.key] !== null)

  if (splitMode) {
    return (
      <AccountSplitStats
        iterationId={iterationId}
        accounts={linkedinAccounts}
        assignedAccountIds={assignedAccountIds}
        initialRows={initialAccountStats}
        onLeaveSplitMode={() => setSplitMode(false)}
      />
    )
  }

  if (!hasAny && !editing) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
          <BarChart3 size={28} className="text-zinc-300" />
          <div className="text-center">
            <p className="text-sm">No stats yet</p>
            <p className="text-xs mt-1">Upload a CSV or enter metrics manually</p>
          </div>
          <div className="mt-2 flex gap-2 flex-wrap justify-center">
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 transition-colors"
            >
              <Upload size={12} />
              Upload CSV
            </button>
            <button
              onClick={() => { setDraft(emptyMetrics()); setEditing(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              <Pencil size={12} />
              Enter manually
            </button>
            {splitAvailable && (
              <button
                onClick={() => setSplitMode(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                <Users size={12} />
                Split by account
              </button>
            )}
          </div>
        </div>
        {showUpload && (
          <UploadStatsModal iterationId={iterationId} currentStats={null} onClose={() => setShowUpload(false)} />
        )}
      </>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-400">
          {uploadedAt && `Updated ${new Date(uploadedAt).toLocaleString('en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
        </p>
        <div className="flex items-center gap-1.5">
          {!editing && (
            <>
              {splitAvailable && (
                <button
                  onClick={() => setSplitMode(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition-colors"
                >
                  <Users size={12} />
                  Split by account
                </button>
              )}
              <button
                onClick={() => { setDraft(initialStats ?? emptyMetrics()); setEditing(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                <Pencil size={12} />
                Edit
              </button>
              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                <Upload size={12} />
                Replace CSV
              </button>
              {hasAny && (
                <button
                  onClick={handleClear}
                  disabled={clearing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={12} />
                  Clear
                </button>
              )}
            </>
          )}
          {editing && (
            <>
              <button
                onClick={() => { setEditing(false); setDraft(initialStats ?? emptyMetrics()) }}
                className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveManual}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-zinc-900 text-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-700 disabled:opacity-50 transition-colors"
              >
                <Check size={12} />
                Save
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {METRICS.map(m => {
          const val = (initialStats?.[m.key] ?? null) as number | null
          if (editing) {
            return (
              <div key={m.key} className="rounded-xl border border-zinc-200 bg-white p-4">
                <p className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">{m.label}</p>
                <input
                  type="number"
                  min={0}
                  value={draft[m.key] ?? ''}
                  onChange={e => setDraft(prev => ({ ...prev, [m.key]: e.target.value === '' ? null : Number(e.target.value) }))}
                  placeholder="—"
                  className="mt-2 w-full text-2xl font-semibold text-zinc-900 bg-transparent focus:outline-none placeholder:text-zinc-300"
                />
                <p className="text-[11px] text-zinc-400 mt-1">{m.description}</p>
              </div>
            )
          }
          return (
            <div key={m.key} className="rounded-xl border border-zinc-100 bg-white p-4">
              <p className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">{m.label}</p>
              <p className={`mt-2 text-2xl font-semibold tabular-nums ${val === null ? 'text-zinc-300' : 'text-zinc-900'}`}>
                {val === null ? '—' : val}
              </p>
              <p className="text-[11px] text-zinc-400 mt-1">{m.description}</p>
            </div>
          )
        })}
      </div>

      {showUpload && (
        <UploadStatsModal iterationId={iterationId} currentStats={initialStats} onClose={() => setShowUpload(false)} />
      )}
    </div>
  )
}

function emptyMetrics(): IterationMetrics {
  return {
    leads_sent: null, connections_accepted: null, replies: null, positive_replies: null, meetings_booked: null,
  }
}

function UploadStatsModal({ iterationId, currentStats, onClose }: { iterationId: string; currentStats: IterationMetrics | null; onClose: () => void }) {
  const router = useRouter()
  const hasExisting = currentStats && METRICS.some(m => currentStats[m.key] !== null)
  const [mode, setMode] = useState<'replace' | 'append'>(hasExisting ? 'append' : 'replace')
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsed, setParsed] = useState<{ headers: string[]; rows: ParsedRow[] } | null>(null)
  const [metrics, setMetrics] = useState<IterationMetrics>(emptyMetrics())
  const [suggestions, setSuggestions] = useState<Record<MetricKey, Suggestion>>(() => ({
    leads_sent: null, connections_accepted: null, replies: null, positive_replies: null, meetings_booked: null,
  }))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const finalMetrics: IterationMetrics = useMemo(() => {
    if (mode === 'replace') return metrics
    return Object.fromEntries(
      METRICS.map(m => {
        const existing = currentStats?.[m.key] ?? 0
        const added = metrics[m.key] ?? 0
        return [m.key, existing + added]
      })
    ) as IterationMetrics
  }, [mode, metrics, currentStats])

  async function handleFile(file: File) {
    setError(null)
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Only CSV files are supported.')
      return
    }
    const text = await file.text()
    const raw = parseCsv(text)
    if (raw.length < 2) { setError('CSV is empty.'); return }
    const headers = raw[0].map(h => h.trim().toLowerCase())
    const dataRows: ParsedRow[] = raw.slice(1).map(row => {
      const obj: ParsedRow = {}
      headers.forEach((h, i) => { obj[h] = row[i] ?? '' })
      return obj
    }).filter(r => Object.values(r).some(v => v.length > 0))

    setFileName(file.name)
    setParsed({ headers, rows: dataRows })
    const sug = autoSuggest(dataRows)
    setSuggestions(sug)
    // Apply suggestions to metrics
    setMetrics({
      leads_sent: sug.leads_sent?.value ?? null,
      connections_accepted: sug.connections_accepted?.value ?? null,
      replies: sug.replies?.value ?? null,
      positive_replies: null,
      meetings_booked: null,
    })
  }

  const unmappedColumns = useMemo(() => {
    if (!parsed) return []
    const matched = new Set(Object.values(suggestions).filter(Boolean).map(s => s!.column))
    return parsed.headers.filter(h => h !== 'action' && !matched.has(h))
  }, [parsed, suggestions])

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      await uploadIterationStats(iterationId, finalMetrics)
      router.refresh()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          onClick={e => e.stopPropagation()}
          className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
            <div>
              <h2 className="text-base font-semibold text-zinc-900">Upload campaign stats</h2>
              <p className="text-xs text-zinc-400 mt-0.5">CSV will be parsed and mapped to system metrics</p>
            </div>
            <div className="flex items-center gap-2">
              {hasExisting && (
                <div className="flex items-center rounded-lg border border-zinc-200 overflow-hidden text-xs font-medium">
                  <button
                    onClick={() => setMode('append')}
                    className={`px-3 py-1.5 transition-colors ${mode === 'append' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
                  >
                    Append
                  </button>
                  <button
                    onClick={() => setMode('replace')}
                    className={`px-3 py-1.5 transition-colors ${mode === 'replace' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
                  >
                    Replace
                  </button>
                </div>
              )}
              <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {!parsed && (
              <label className="flex flex-col items-center justify-center gap-3 py-12 border-2 border-dashed border-zinc-200 rounded-2xl bg-zinc-50/50 hover:bg-zinc-50 hover:border-zinc-300 transition-colors cursor-pointer">
                <Upload size={28} className="text-zinc-400" />
                <div className="text-center">
                  <p className="text-sm font-medium text-zinc-700">Click to upload CSV</p>
                  <p className="text-xs text-zinc-400 mt-1">Header row required · arbitrary column names ok</p>
                </div>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </label>
            )}

            {parsed && (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <FileText size={13} className="text-zinc-400" />
                  <span className="text-zinc-700 font-medium">{fileName}</span>
                  <span className="text-zinc-400">·</span>
                  <span className="text-zinc-500">{parsed.rows.length} rows · {parsed.headers.length} columns</span>
                  <button
                    onClick={() => { setParsed(null); setFileName(null); setMetrics(emptyMetrics()) }}
                    className="ml-auto text-zinc-400 hover:text-zinc-700"
                  >
                    Change file
                  </button>
                </div>

                {/* Detected columns */}
                <div>
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">Detected columns</p>
                  <div className="flex flex-wrap gap-1">
                    {parsed.headers.map(h => (
                      <span key={h} className="rounded-full bg-zinc-100 text-zinc-600 px-2.5 py-0.5 text-[11px] font-mono">{h}</span>
                    ))}
                  </div>
                  {unmappedColumns.length > 0 && (
                    <p className="text-[11px] text-zinc-400 mt-2">
                      {unmappedColumns.length} column{unmappedColumns.length === 1 ? '' : 's'} weren&apos;t auto-matched — fill metrics manually below if needed
                    </p>
                  )}
                </div>

                {/* Metric mapping */}
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">Map to system metrics</p>
                  <div className="rounded-xl border border-zinc-100 divide-y divide-zinc-50">
                    {METRICS.map(m => {
                      const sug = suggestions[m.key]
                      const isAuto = sug && metrics[m.key] === sug.value
                      const existing = currentStats?.[m.key] ?? null
                      const added = metrics[m.key] ?? 0
                      const total = (existing ?? 0) + added
                      return (
                        <div key={m.key} className="flex items-center gap-3 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-800">{m.label}</p>
                            {sug ? (
                              <p className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1">
                                {isAuto && <Sparkles size={10} className="text-amber-500" />}
                                from <span className="font-mono text-zinc-500">{sug.column}</span> in &ldquo;{sug.rowAction}&rdquo;
                              </p>
                            ) : (
                              <p className="text-[11px] text-zinc-400 mt-0.5">No auto-match · enter manually</p>
                            )}
                          </div>
                          {mode === 'append' && existing !== null && (
                            <div className="flex items-baseline gap-1 text-xs text-zinc-400 tabular-nums shrink-0">
                              <span>{existing}</span>
                              <span>+</span>
                              <span className="text-zinc-600">{added}</span>
                              <span>=</span>
                              <span className="font-semibold text-zinc-900">{total}</span>
                            </div>
                          )}
                          <input
                            type="number"
                            min={0}
                            value={metrics[m.key] ?? ''}
                            onChange={e => setMetrics(prev => ({ ...prev, [m.key]: e.target.value === '' ? null : Number(e.target.value) }))}
                            placeholder="—"
                            className="w-24 text-right text-sm font-medium text-zinc-900 placeholder:text-zinc-300 px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400"
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Preview */}
                <details className="text-xs">
                  <summary className="cursor-pointer text-zinc-400 hover:text-zinc-600">Show parsed rows ({parsed.rows.length})</summary>
                  <div className="mt-2 rounded-xl border border-zinc-100 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-zinc-50">
                        <tr>
                          {parsed.headers.map(h => (
                            <th key={h} className="text-left px-3 py-1.5 text-[10px] font-medium text-zinc-500 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.rows.map((row, i) => (
                          <tr key={i} className="border-t border-zinc-50">
                            {parsed.headers.map(h => (
                              <td key={h} className="px-3 py-1.5 text-zinc-600 whitespace-nowrap">{row[h]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 text-red-700 px-3 py-2 text-xs">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}
          </div>

          {parsed && (
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-zinc-100">
              <button onClick={onClose} className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 transition-colors">Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-lg bg-zinc-900 text-white px-4 py-1.5 text-xs font-medium hover:bg-zinc-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Saving…' : 'Save metrics'}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── AccountSplitStats ────────────────────────────────────────────────────────
//
// Per-account breakdown editor for a single iteration. When the user saves
// rows with any non-null metric, getClientStats attributes them to the
// account; the iteration-level stats blob is ignored for the leaderboard.
// Saving an empty grid clears the breakdown — iteration falls back to the
// flat stats path.

type SplitRow = Record<string, IterationMetrics & { _changed?: boolean }>

function AccountSplitStats({
  iterationId,
  accounts,
  assignedAccountIds,
  initialRows,
  onLeaveSplitMode,
}: {
  iterationId: string
  accounts: LinkedinAccount[]
  assignedAccountIds: string[]
  initialRows: IterationAccountStats[]
  onLeaveSplitMode: () => void
}) {
  const router = useRouter()
  // Show only accounts assigned to this iteration via the picker, plus any
  // account that already carries data for this iteration (otherwise we'd
  // silently drop pre-existing numbers when an account gets unassigned).
  const activeAccounts = useMemo(() => {
    const assigned = new Set(assignedAccountIds)
    const haveData = new Set(initialRows.map(r => r.linkedin_account_id))
    return accounts.filter(a => assigned.has(a.id) || haveData.has(a.id))
  }, [accounts, assignedAccountIds, initialRows])

  const initial: SplitRow = useMemo(() => {
    const out: SplitRow = {}
    for (const a of activeAccounts) {
      const row = initialRows.find(r => r.linkedin_account_id === a.id)
      out[a.id] = {
        leads_sent: row?.leads_sent ?? null,
        connections_accepted: row?.connections_accepted ?? null,
        replies: row?.replies ?? null,
        positive_replies: row?.positive_replies ?? null,
        meetings_booked: row?.meetings_booked ?? null,
      }
    }
    return out
  }, [activeAccounts, initialRows])

  const [rows, setRows] = useState<SplitRow>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update(accountId: string, key: keyof IterationMetrics, value: string) {
    const num = value === '' ? null : Number(value)
    setRows(prev => ({
      ...prev,
      [accountId]: { ...prev[accountId], [key]: Number.isFinite(num as number) ? num : null },
    }))
  }

  const totals = useMemo(() => {
    const t: Record<keyof IterationMetrics, number> = { leads_sent: 0, connections_accepted: 0, replies: 0, positive_replies: 0, meetings_booked: 0 }
    for (const a of activeAccounts) {
      const r = rows[a.id]
      if (!r) continue
      for (const m of METRICS) t[m.key] += r[m.key] ?? 0
    }
    return t
  }, [rows, activeAccounts])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const payload = activeAccounts.map(a => ({
        linkedin_account_id: a.id,
        ...rows[a.id],
      }))
      await setIterationAccountStats(iterationId, payload)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (activeAccounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
        <Users size={28} className="text-zinc-300" />
        <p className="text-sm">No accounts assigned to this iteration</p>
        <p className="text-xs">Pick the operator accounts from the iteration header first.</p>
        <button
          onClick={onLeaveSplitMode}
          className="mt-2 text-xs text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          Back to aggregate view
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users size={14} className="text-zinc-500" />
          <p className="text-sm font-medium text-zinc-700">Stats by account</p>
          <p className="text-xs text-zinc-400">Iteration-level stats are ignored when a breakdown is set</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onLeaveSplitMode}
            className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
          >
            Back to aggregate
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 text-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-700 disabled:opacity-50 transition-colors"
          >
            <Check size={12} />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50/50 border-b border-zinc-100">
              <th className="text-left px-4 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wide sticky left-0 bg-zinc-50/50">Account</th>
              {METRICS.map(m => (
                <th key={m.key} className="text-right px-3 py-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeAccounts.map(a => (
              <tr key={a.id} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/30 transition-colors">
                <td className="px-4 py-2.5 text-zinc-800 sticky left-0 bg-white">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{a.name}</span>
                    {a.archived_at && (
                      <span className="text-[10px] uppercase tracking-wider text-zinc-400 border border-zinc-200 rounded px-1.5 py-0.5">
                        Archived
                      </span>
                    )}
                  </div>
                </td>
                {METRICS.map(m => (
                  <td key={m.key} className="px-2 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      value={rows[a.id]?.[m.key] ?? ''}
                      onChange={e => update(a.id, m.key, e.target.value)}
                      placeholder="—"
                      className="w-20 text-right text-sm tabular-nums text-zinc-900 placeholder:text-zinc-300 px-2 py-1 border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400"
                    />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-zinc-50/40 font-medium">
              <td className="px-4 py-2.5 text-zinc-500 text-xs uppercase tracking-wider sticky left-0 bg-zinc-50/40">Total</td>
              {METRICS.map(m => (
                <td key={m.key} className="px-3 py-2.5 text-right text-sm tabular-nums text-zinc-700">
                  {totals[m.key] || '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 text-red-700 px-3 py-2 text-xs">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <p className="text-[11px] text-zinc-400">
        Leave every cell empty for an account to remove its row. Save with all cells empty to wipe the breakdown.
      </p>
    </div>
  )
}

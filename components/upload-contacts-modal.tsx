'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, X, Check, FileText, AlertCircle } from 'lucide-react'
import { uploadContacts, type UploadedContactRow } from '@/app/actions/pipeline'

type FieldKey = 'first_name' | 'last_name' | 'email' | 'linkedin_url' | 'title' | 'company_name' | 'company_domain'

const FIELDS: { key: FieldKey; label: string; hints: string[] }[] = [
  { key: 'first_name', label: 'First name', hints: ['first', 'firstname', 'first_name', 'given'] },
  { key: 'last_name', label: 'Last name', hints: ['last', 'lastname', 'last_name', 'surname', 'family'] },
  { key: 'email', label: 'Email', hints: ['email', 'mail', 'e-mail'] },
  { key: 'linkedin_url', label: 'LinkedIn URL', hints: ['linkedin', 'linkedin_url', 'profile'] },
  { key: 'title', label: 'Title', hints: ['title', 'position', 'role', 'job'] },
  { key: 'company_name', label: 'Company', hints: ['company', 'organization', 'employer'] },
  { key: 'company_domain', label: 'Company domain', hints: ['domain', 'website', 'site', 'url'] },
]

// Minimal CSV parser supporting quoted values with commas/newlines
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

function autoDetect(headers: string[]): Record<FieldKey, number | null> {
  const map: Record<FieldKey, number | null> = {
    first_name: null, last_name: null, email: null, linkedin_url: null,
    title: null, company_name: null, company_domain: null,
  }
  for (const f of FIELDS) {
    const idx = headers.findIndex(h => f.hints.some(hint => h.toLowerCase().trim() === hint || h.toLowerCase().includes(hint)))
    if (idx !== -1) map[f.key] = idx
  }
  return map
}

export function UploadContactsModal({
  projectId,
  iterationId,
  onClose,
}: {
  projectId: string
  iterationId: string
  onClose: () => void
}) {
  const router = useRouter()
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsed, setParsed] = useState<{ headers: string[]; rows: string[][] } | null>(null)
  const [mapping, setMapping] = useState<Record<FieldKey, number | null> | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null)

  const customColumns = useMemo(() => {
    if (!parsed || !mapping) return []
    const mappedIndices = new Set(Object.values(mapping).filter((v): v is number => v !== null))
    return parsed.headers
      .map((h, i) => ({ header: h, index: i }))
      .filter(c => !mappedIndices.has(c.index) && c.header.trim().length > 0)
  }, [parsed, mapping])

  async function handleFile(file: File) {
    setError(null)
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Only CSV files are supported.')
      return
    }
    const text = await file.text()
    const rows = parseCsv(text)
    if (rows.length < 2) {
      setError('CSV is empty or has no data rows.')
      return
    }
    const headers = rows[0].map(h => h.trim())
    const dataRows = rows.slice(1)
    setFileName(file.name)
    setParsed({ headers, rows: dataRows })
    setMapping(autoDetect(headers))
  }

  function setMap(field: FieldKey, idx: number | null) {
    setMapping(prev => prev ? { ...prev, [field]: idx } : prev)
  }

  async function handleSubmit() {
    if (!parsed || !mapping) return
    setSubmitting(true)
    setError(null)
    try {
      const uploadRows: UploadedContactRow[] = parsed.rows.map(row => {
        const get = (k: FieldKey) => {
          const i = mapping[k]
          return i !== null ? row[i]?.trim() : undefined
        }
        const custom: Record<string, string> = {}
        for (const c of customColumns) {
          const v = row[c.index]?.trim()
          if (v) custom[c.header] = v
        }
        return {
          first_name: get('first_name'),
          last_name: get('last_name'),
          email: get('email'),
          linkedin_url: get('linkedin_url'),
          title: get('title'),
          company_name: get('company_name'),
          company_domain: get('company_domain'),
          custom_data: custom,
        }
      })
      const res = await uploadContacts(projectId, iterationId, uploadRows)
      setResult(res)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
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
          className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
            <div>
              <h2 className="text-base font-semibold text-zinc-900">Upload contacts</h2>
              <p className="text-xs text-zinc-400 mt-0.5">CSV with header row · appended to the active iteration · duplicates (same LinkedIn URL) skipped</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50">
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {!parsed && (
              <label className="flex flex-col items-center justify-center gap-3 py-12 border-2 border-dashed border-zinc-200 rounded-2xl bg-zinc-50/50 hover:bg-zinc-50 hover:border-zinc-300 transition-colors cursor-pointer">
                <Upload size={28} className="text-zinc-400" />
                <div className="text-center">
                  <p className="text-sm font-medium text-zinc-700">Click to upload a CSV</p>
                  <p className="text-xs text-zinc-400 mt-1">First row should contain column headers</p>
                </div>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </label>
            )}

            {parsed && mapping && !result && (
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-xs">
                  <FileText size={13} className="text-zinc-400" />
                  <span className="text-zinc-700 font-medium">{fileName}</span>
                  <span className="text-zinc-400">·</span>
                  <span className="text-zinc-500">{parsed.rows.length} rows · {parsed.headers.length} columns</span>
                  <button
                    onClick={() => { setParsed(null); setMapping(null); setFileName(null) }}
                    className="ml-auto text-zinc-400 hover:text-zinc-700"
                  >
                    Change file
                  </button>
                </div>

                <div>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Map columns</p>
                  <div className="grid grid-cols-2 gap-3">
                    {FIELDS.map(f => (
                      <div key={f.key} className="space-y-1">
                        <label className="text-xs text-zinc-500">{f.label}</label>
                        <select
                          value={mapping[f.key] ?? ''}
                          onChange={e => setMap(f.key, e.target.value === '' ? null : Number(e.target.value))}
                          className="w-full text-xs pl-2.5 pr-8 py-1.5 border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400 appearance-none bg-no-repeat bg-[right_0.625rem_center] bg-[length:0.75rem_0.75rem]"
                          style={{
                            backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 8 10 12 14 8'/%3E%3C/svg%3E\")",
                          }}
                        >
                          <option value="">— skip —</option>
                          {parsed.headers.map((h, i) => (
                            <option key={i} value={i}>{h}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                {customColumns.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Custom columns ({customColumns.length})</p>
                    <p className="text-xs text-zinc-400 mb-2">Stored as extra fields per contact:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {customColumns.map(c => (
                        <span key={c.index} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 text-zinc-600 px-2.5 py-0.5 text-xs">
                          {c.header}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Preview</p>
                  <div className="rounded-xl border border-zinc-100 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-zinc-50">
                        <tr>
                          {parsed.headers.map((h, i) => (
                            <th key={i} className="text-left px-3 py-1.5 text-[10px] font-medium text-zinc-500 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.rows.slice(0, 3).map((row, i) => (
                          <tr key={i} className="border-t border-zinc-50">
                            {row.map((cell, j) => (
                              <td key={j} className="px-3 py-1.5 text-zinc-600 whitespace-nowrap max-w-[160px] truncate">{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {result && (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <span className="size-12 rounded-full bg-emerald-50 flex items-center justify-center">
                  <Check size={22} strokeWidth={3} className="text-emerald-600" />
                </span>
                <p className="text-sm font-medium text-zinc-900">
                  {result.inserted} contact{result.inserted === 1 ? '' : 's'} added
                </p>
                {result.skipped > 0 && (
                  <p className="text-xs text-zinc-400">{result.skipped} skipped (duplicates)</p>
                )}
              </div>
            )}

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 text-red-700 px-3 py-2 text-xs">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          {parsed && !result && (
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-zinc-100">
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-1.5 rounded-lg bg-zinc-900 text-white px-4 py-1.5 text-xs font-medium hover:bg-zinc-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Importing…' : `Import ${parsed.rows.length} contacts`}
              </button>
            </div>
          )}
          {result && (
            <div className="flex items-center justify-end px-6 py-4 border-t border-zinc-100">
              <button
                onClick={onClose}
                className="rounded-lg bg-zinc-900 text-white px-4 py-1.5 text-xs font-medium hover:bg-zinc-700 transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

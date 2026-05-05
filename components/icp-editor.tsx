'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Pencil, Check, X, Plus } from 'lucide-react'
import { updateProjectIcp, updateProjectOffer } from '@/app/actions/projects'
import { scaleIn, springGentle } from '@/lib/animations'

const FUNDING_ROUNDS = ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Series C+']
const EMPLOYEE_RANGES = [
  { label: '1–10', value: '1,10' },
  { label: '11–50', value: '11,50' },
  { label: '51–200', value: '51,200' },
  { label: '201–500', value: '201,500' },
  { label: '501–1000', value: '501,1000' },
  { label: '1000+', value: '1001,10000' },
]

// ─── Tag input ────────────────────────────────────────────────────────────────

function TagInput({
  label,
  values,
  onChange,
  placeholder,
  color = 'zinc',
}: {
  label: string
  values: string[]
  onChange: (v: string[]) => void
  placeholder: string
  color?: 'zinc' | 'blue' | 'purple' | 'green' | 'orange'
}) {
  const [input, setInput] = useState('')

  const colorMap = {
    zinc:   'bg-zinc-100 text-zinc-700',
    blue:   'bg-blue-50 text-blue-700',
    purple: 'bg-purple-50 text-purple-700',
    green:  'bg-green-50 text-green-700',
    orange: 'bg-orange-50 text-orange-700',
  }

  function add() {
    const val = input.trim()
    if (!val || values.includes(val)) { setInput(''); return }
    onChange([...values, val])
    setInput('')
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</p>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map(v => (
            <span key={v} className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[color]}`}>
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter(x => x !== v))}
                className="opacity-50 hover:opacity-100 transition-opacity ml-0.5"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:outline-none transition-colors"
        />
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50 transition-colors"
        >
          <Plus size={11} />
          Add
        </button>
      </div>
    </div>
  )
}

// ─── Pill selector ────────────────────────────────────────────────────────────

function PillSelector({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  function toggle(opt: string) {
    onChange(selected.includes(opt) ? selected.filter(x => x !== opt) : [...selected, opt])
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => {
          const active = selected.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                active
                  ? 'bg-zinc-900 text-white'
                  : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Helpers to read from either schema ──────────────────────────────────────

type IcpRaw = Record<string, unknown>

function readGeo(icp: IcpRaw): string[] {
  if (Array.isArray(icp.geo) && icp.geo.length) return icp.geo as string[]
  const af = icp.apollo_filters as IcpRaw | undefined
  if (Array.isArray(af?.locations)) return af!.locations as string[]
  return []
}

function readIndustries(icp: IcpRaw): string[] {
  if (Array.isArray(icp.industries) && icp.industries.length) return icp.industries as string[]
  const af = icp.apollo_filters as IcpRaw | undefined
  if (Array.isArray(af?.industries)) return af!.industries as string[]
  return []
}

function readTitles(icp: IcpRaw): string[] {
  if (Array.isArray(icp.titles) && icp.titles.length) return icp.titles as string[]
  const tr = icp.target_roles as Record<string, string[]> | undefined
  if (tr) return [...(tr.primary ?? []), ...(tr.secondary ?? [])]
  return []
}

function readKeywords(icp: IcpRaw): string[] {
  const segs = icp.segments as Array<{ keywords?: string[] }> | undefined
  if (Array.isArray(segs)) return [...new Set(segs.flatMap(s => s.keywords ?? []))]
  return []
}

// Apollo expects employee_ranges as "min,max" (e.g. "1,10"). Normalize legacy "1-10" form.
function normalizeEmployeeRanges(values: string[]): string[] {
  return values.map(v => v.includes(',') ? v : v.replace(/-/g, ','))
}

// ─── Main editor ──────────────────────────────────────────────────────────────

export function IcpEditor({
  projectId,
  icp,
  offerText,
}: {
  projectId: string
  icp: IcpRaw | null
  offerText: string | null
}) {
  const raw = icp ?? {}

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const [offer, setOffer] = useState(offerText ?? '')
  const [geo, setGeo] = useState<string[]>(readGeo(raw))
  const [industries, setIndustries] = useState<string[]>(readIndustries(raw))
  const [titles, setTitles] = useState<string[]>(readTitles(raw))
  const [keywords, setKeywords] = useState<string[]>(readKeywords(raw))
  const [exclusions, setExclusions] = useState<string[]>((raw.exclusions as string[]) ?? [])
  const [fundingRounds, setFundingRounds] = useState<string[]>((raw.funding_rounds as string[]) ?? [])
  const [employeeRanges, setEmployeeRanges] = useState<string[]>(normalizeEmployeeRanges((raw.employee_ranges as string[]) ?? []))
  const [trigger, setTrigger] = useState<string>((raw.trigger as string) ?? '')

  function cancel() {
    setOffer(offerText ?? '')
    setGeo(readGeo(raw))
    setIndustries(readIndustries(raw))
    setTitles(readTitles(raw))
    setKeywords(readKeywords(raw))
    setExclusions((raw.exclusions as string[]) ?? [])
    setFundingRounds((raw.funding_rounds as string[]) ?? [])
    setEmployeeRanges(normalizeEmployeeRanges((raw.employee_ranges as string[]) ?? []))
    setTrigger((raw.trigger as string) ?? '')
    setEditing(false)
  }

  async function save() {
    setSaving(true)
    try {
      const merged: IcpRaw = {
        ...raw,
        geo,
        industries,
        titles,
        funding_rounds: fundingRounds,
        employee_ranges: employeeRanges,
        trigger: trigger || undefined,
        target_roles: {
          ...(raw.target_roles as object ?? {}),
          primary: titles.slice(0, 3),
          secondary: titles.slice(3),
        },
        segments: keywords.length > 0 ? [{ name: 'main', keywords }] : [],
        exclusions,
        apollo_filters: {
          ...(raw.apollo_filters as object ?? {}),
          locations: geo,
          industries,
          employee_ranges: employeeRanges,
        },
      }
      await updateProjectIcp(projectId, merged)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const hasContent = geo.length || industries.length || titles.length || keywords.length || fundingRounds.length || trigger

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-50">
        <div>
          <p className="text-sm font-semibold text-zinc-900">ICP Filters</p>
          <p className="text-xs text-zinc-400 mt-0.5">Override what the pipeline targets</p>
        </div>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50 transition-colors"
          >
            <Pencil size={12} />
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={cancel}
              className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-50 transition-colors"
            >
              <X size={12} />
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <span className="size-3 rounded-full border-2 border-white border-t-transparent animate-spin" /> : <Check size={12} />}
              Save
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-5 py-4">
        {editing ? (
          <motion.div
            variants={scaleIn}
            initial="hidden"
            animate="show"
            transition={springGentle}
            className="space-y-5"
          >
            {/* Offer */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Offer description</p>
              <textarea
                value={offer}
                onChange={e => setOffer(e.target.value)}
                rows={2}
                placeholder="What does your client offer?"
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:outline-none resize-none transition-colors"
              />
            </div>

            <TagInput label="Geography" values={geo} onChange={setGeo} placeholder="United States" color="green" />
            <TagInput label="Industries" values={industries} onChange={setIndustries} placeholder="B2B SaaS" color="blue" />
            <TagInput label="Target roles" values={titles} onChange={setTitles} placeholder="CEO, Founder, CMO…" color="purple" />
            <div>
              <TagInput label="Apollo keywords" values={keywords} onChange={setKeywords} placeholder="fintech app, developer tools" color="orange" />
              <p className="text-[10px] text-zinc-400 mt-1">Search phrases used by Apollo. Pick product/industry words ("fintech app", "B2B SaaS"), avoid fundraising language.</p>
            </div>
            <div>
              <TagInput label="Exclusions" values={exclusions} onChange={setExclusions} placeholder="VC funds, accelerators, branding studios" color="zinc" />
              <p className="text-[10px] text-zinc-400 mt-1">Phrases the classifier uses to reject companies (e.g. "VC funds", "Branding studios", "Accelerators").</p>
            </div>

            <PillSelector
              label="Funding rounds"
              options={FUNDING_ROUNDS}
              selected={fundingRounds}
              onChange={setFundingRounds}
            />

            <PillSelector
              label="Company size"
              options={EMPLOYEE_RANGES.map(r => r.label)}
              selected={EMPLOYEE_RANGES.filter(r => employeeRanges.includes(r.value)).map(r => r.label)}
              onChange={labels => setEmployeeRanges(EMPLOYEE_RANGES.filter(r => labels.includes(r.label)).map(r => r.value))}
            />

            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Trigger signal</p>
              <input
                value={trigger}
                onChange={e => setTrigger(e.target.value)}
                placeholder="e.g. funding announcement in last 3–6 months"
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:outline-none transition-colors"
              />
            </div>

          </motion.div>
        ) : hasContent ? (
          <div className="space-y-3">
            {geo.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Geography</p>
                <div className="flex flex-wrap gap-1">
                  {geo.map(g => <span key={g} className="rounded-full bg-green-50 text-green-700 px-2.5 py-0.5 text-xs">{g}</span>)}
                </div>
              </div>
            )}
            {industries.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Industries</p>
                <div className="flex flex-wrap gap-1">
                  {industries.map(i => <span key={i} className="rounded-full bg-blue-50 text-blue-700 px-2.5 py-0.5 text-xs">{i}</span>)}
                </div>
              </div>
            )}
            {keywords.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Apollo keywords</p>
                <div className="flex flex-wrap gap-1">
                  {keywords.map(k => <span key={k} className="rounded-full bg-orange-50 text-orange-700 px-2.5 py-0.5 text-xs">{k}</span>)}
                </div>
              </div>
            )}
            {exclusions.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Exclusions</p>
                <div className="flex flex-wrap gap-1">
                  {exclusions.map(e => <span key={e} className="rounded-full bg-zinc-100 text-zinc-600 px-2.5 py-0.5 text-xs">{e}</span>)}
                </div>
              </div>
            )}
            {titles.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Target roles</p>
                <div className="flex flex-wrap gap-1">
                  {titles.map(t => <span key={t} className="rounded-full bg-purple-50 text-purple-700 px-2.5 py-0.5 text-xs">{t}</span>)}
                </div>
              </div>
            )}
            {fundingRounds.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Funding rounds</p>
                <div className="flex flex-wrap gap-1">
                  {fundingRounds.map(r => <span key={r} className="rounded-full bg-zinc-900 text-white px-2.5 py-0.5 text-xs">{r}</span>)}
                </div>
              </div>
            )}
            {employeeRanges.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Company size</p>
                <div className="flex flex-wrap gap-1">
                  {EMPLOYEE_RANGES.filter(r => employeeRanges.includes(r.value)).map(r => (
                    <span key={r.value} className="rounded-full bg-orange-50 text-orange-700 px-2.5 py-0.5 text-xs">{r.label}</span>
                  ))}
                </div>
              </div>
            )}
            {trigger && (
              <div>
                <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">Trigger</p>
                <p className="text-xs text-zinc-600">{trigger}</p>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            + Set ICP filters manually
          </button>
        )}
      </div>
    </div>
  )
}

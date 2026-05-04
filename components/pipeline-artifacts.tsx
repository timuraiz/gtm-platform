'use client'

import { useState } from 'react'

// ─── Filters ──────────────────────────────────────────────────────────────────

export function FiltersArtifact({ artifact }: { artifact: unknown }) {
  const f = artifact as Record<string, unknown>
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
          Keywords ({(f.keywords as string[])?.length ?? 0})
        </p>
        <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
          {(f.keywords as string[] ?? []).map(k => (
            <span key={k} className="rounded bg-zinc-100 text-zinc-600 px-1.5 py-0.5 text-[11px]">{k}</span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">Locations</p>
          <div className="flex flex-wrap gap-1">
            {(f.locations as string[] ?? []).map(l => (
              <span key={l} className="rounded-full bg-green-50 text-green-700 px-2 py-0.5 text-xs">{l}</span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">Employee ranges</p>
          <div className="flex flex-wrap gap-1">
            {(f.employee_ranges as string[] ?? []).map(r => (
              <span key={r} className="rounded-full bg-orange-50 text-orange-700 px-2 py-0.5 text-xs">{r}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Apollo ───────────────────────────────────────────────────────────────────

function HitsBar({ hits }: { hits: Record<string, number> }) {
  const max = Math.max(...Object.values(hits).filter(v => v > 0), 1)
  return (
    <div className="space-y-1">
      {Object.entries(hits).map(([label, count]) => (
        <div key={label} className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.min(100, (count / max) * 100)}%` }} />
          </div>
          <span className="text-xs text-zinc-500 w-5 text-right">{count < 0 ? '✗' : count}</span>
          <span className="text-xs text-zinc-400 w-40 truncate">{label}</span>
        </div>
      ))}
    </div>
  )
}

export function ApolloArtifact({ artifact }: { artifact: unknown }) {
  const a = artifact as Record<string, unknown>
  const companies = a.companies as Array<{ domain: string; name: string }> ?? []
  const titleHits = a.title_hits as Record<string, number> | undefined
  const keywordHits = a.keyword_hits as Record<string, number> | undefined

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">{a.companies_found as number} unique companies found</p>

      {titleHits && Object.keys(titleHits).length > 0 && (
        <div>
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">By title</p>
          <HitsBar hits={titleHits} />
        </div>
      )}

      {keywordHits && Object.keys(keywordHits).length > 0 && (
        <div>
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">By keyword</p>
          <HitsBar hits={keywordHits} />
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Companies</p>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {companies.map(c => (
            <div key={c.domain} className="flex items-center gap-2 text-xs">
              <span className="text-zinc-400 font-mono w-36 truncate">{c.domain}</span>
              <span className="text-zinc-600">{c.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Scrape ───────────────────────────────────────────────────────────────────

export function ScrapeArtifact({ artifact }: { artifact: unknown }) {
  const a = artifact as Record<string, unknown>
  const companies = a.companies as Array<{ domain: string; name: string; scraped_ok?: boolean; industry?: string }> ?? []
  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-sm">
        <span className="text-green-600">✓ {a.ok as number} scraped</span>
        <span className="text-zinc-400">{(a.scraped as number ?? 0) - (a.ok as number)} failed</span>
        <span className="text-zinc-300">{(a.total as number) - (a.scraped as number ?? 0)} Apollo-only</span>
      </div>
      <div className="space-y-0.5 max-h-64 overflow-y-auto">
        {companies.map(c => (
          <div key={c.domain} className="flex items-center gap-2 text-xs py-1.5 border-b border-zinc-50 last:border-0">
            <span className={`size-1.5 rounded-full shrink-0 ${c.scraped_ok ? 'bg-green-400' : 'bg-zinc-200'}`} />
            <span className="flex-1 text-zinc-600 font-mono truncate">{c.domain}</span>
            {c.industry && <span className="text-zinc-300 truncate max-w-[120px]">{c.industry}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Classify ─────────────────────────────────────────────────────────────────

export function ClassifyArtifact({ artifact }: { artifact: unknown }) {
  const a = artifact as Record<string, unknown>
  const results = a.results as Array<{
    domain: string; name: string; is_target: boolean
    confidence: number; segment: string; reasoning: string
  }> ?? []
  const [selected, setSelected] = useState<string | null>(null)
  const sel = results.find(r => r.domain === selected)

  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-sm">
        <span className="text-green-600">✓ {a.targets as number} targets</span>
        <span className="text-zinc-400">{(a.total as number) - (a.targets as number)} rejected</span>
      </div>
      <div className={`gap-3 ${sel ? 'grid grid-cols-2' : 'block'}`}>
        <div className="space-y-0.5 max-h-72 overflow-y-auto">
          {results.map(r => (
            <button
              key={r.domain}
              onClick={() => setSelected(r.domain === selected ? null : r.domain)}
              className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                r.domain === selected ? 'bg-zinc-100' : 'hover:bg-zinc-50'
              }`}
            >
              <span className={`size-1.5 rounded-full shrink-0 ${r.is_target ? 'bg-green-400' : 'bg-red-300'}`} />
              <span className="flex-1 truncate text-zinc-700">{r.name || r.domain}</span>
              <span className="text-zinc-300 text-[10px] truncate max-w-[80px] hidden sm:block">{r.segment}</span>
              <span className={`text-[10px] font-medium tabular-nums ${r.confidence >= 70 ? 'text-green-600' : 'text-zinc-400'}`}>
                {r.confidence}%
              </span>
            </button>
          ))}
        </div>
        {sel && (
          <div className="rounded-xl border border-zinc-100 bg-white p-3 space-y-2 self-start sticky top-0">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sel.is_target ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                {sel.is_target ? '✓ Target' : '✗ Rejected'}
              </span>
              <span className="text-xs text-zinc-400">{sel.segment}</span>
            </div>
            <p className="text-xs font-medium text-zinc-700">{sel.name || sel.domain}</p>
            <p className="text-xs text-zinc-500 leading-relaxed">{sel.reasoning}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── People ───────────────────────────────────────────────────────────────────

export function PeopleArtifact({ artifact }: { artifact: unknown }) {
  const a = artifact as Record<string, unknown>
  const contacts = a.contacts as Array<{
    name: string; email?: string; title?: string; domain: string; linkedin_url?: string
  }> ?? []
  const domainsTotal = a.domains_total as number | undefined
  const domainsProcessed = a.domains_processed as number | undefined
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-600">{a.total as number} contacts found</p>
        {domainsTotal && (
          <p className="text-xs text-zinc-400">{domainsProcessed} / {domainsTotal} domains searched</p>
        )}
      </div>
      {domainsTotal && (
        <div className="h-1 bg-zinc-100 rounded-full overflow-hidden">
          <div className="h-full bg-zinc-300 rounded-full" style={{ width: `${((domainsProcessed ?? 0) / domainsTotal) * 100}%` }} />
        </div>
      )}
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {contacts.map((c, i) => (
          <div key={i} className="flex items-center gap-3 text-xs py-2 border-b border-zinc-50 last:border-0">
            <div className="size-7 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 font-medium shrink-0">
              {(c.name?.[0] ?? '?').toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-zinc-800 font-medium truncate">{c.name}</p>
              <p className="text-zinc-400 truncate">{c.title}</p>
            </div>
            <div className="text-right shrink-0">
              {c.email && <p className="text-zinc-500 font-mono">{c.email}</p>}
              <p className="text-zinc-300">{c.domain}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function renderArtifact(name: string, artifact: unknown) {
  switch (name) {
    case 'generate_filters': return <FiltersArtifact artifact={artifact} />
    case 'apollo_search':    return <ApolloArtifact artifact={artifact} />
    case 'scrape':           return <ScrapeArtifact artifact={artifact} />
    case 'classify':         return <ClassifyArtifact artifact={artifact} />
    case 'extract_people':   return <PeopleArtifact artifact={artifact} />
    default:
      return <pre className="text-xs text-zinc-500 overflow-auto">{JSON.stringify(artifact, null, 2)}</pre>
  }
}

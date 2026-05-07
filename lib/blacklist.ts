export type BlacklistMatchSets = {
  emails: Set<string>
  linkedinUrls: Set<string>
}

export function normalizeBlacklistEmail(s: string | null | undefined): string | null {
  const v = s?.trim().toLowerCase()
  return v ? v : null
}

export function normalizeBlacklistLinkedin(s: string | null | undefined): string | null {
  const v = s?.trim()
  return v ? v : null
}

export function isBlacklisted(
  sets: BlacklistMatchSets,
  email: string | null | undefined,
  linkedinUrl: string | null | undefined,
): boolean {
  const e = normalizeBlacklistEmail(email)
  const l = normalizeBlacklistLinkedin(linkedinUrl)
  if (e && sets.emails.has(e)) return true
  if (l && sets.linkedinUrls.has(l)) return true
  return false
}

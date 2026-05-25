const SALES_NAV_RE = /^https?:\/\/(?:www\.)?linkedin\.com\/sales\/(?:people|lead)\/([^,/?#]+)/i

export function toPublicLinkedinUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(SALES_NAV_RE)
  if (m) return `https://www.linkedin.com/in/${m[1]}/`
  return url
}

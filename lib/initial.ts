/**
 * First letter of a name, uppercased, for avatar / logo fallbacks.
 *
 * Spreading the string iterates by Unicode code point, so a name that starts
 * with an astral-plane character (emoji, math/fraktur fonts) does not get its
 * surrogate pair sliced in half. A lone surrogate renders as U+FFFD and
 * serializes differently on the server vs the client, which breaks React
 * hydration. Returns '?' for empty / nullish input.
 */
export function getInitial(name: string | null | undefined): string {
  return [...(name ?? '').trim()][0]?.toUpperCase() || '?'
}

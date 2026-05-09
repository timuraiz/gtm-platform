// Hosted Supabase clamps any single PostgREST select to db-max-rows (1000 by
// default). To pull more we have to issue successive .range() calls until the
// returned chunk is shorter than the page size.

export const SUPABASE_PAGE_SIZE = 1000

export async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await query(from, from + SUPABASE_PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < SUPABASE_PAGE_SIZE) break
  }
  return all
}

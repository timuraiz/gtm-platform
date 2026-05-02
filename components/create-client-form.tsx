'use client'

import { useActionState } from 'react'
import { createClient } from '@/app/actions/clients'

type State = { error?: string }

async function action(_prev: State, formData: FormData): Promise<State> {
  try {
    await createClient(formData)
    return {}
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export function CreateClientForm({ onSuccess }: { onSuccess?: () => void }) {
  const [state, dispatch, isPending] = useActionState(async (prev: State, fd: FormData) => {
    const result = await action(prev, fd)
    if (!result.error) onSuccess?.()
    return result
  }, {})

  return (
    <form action={dispatch} className="space-y-3">
      <div className="space-y-1">
        <label className="text-sm font-medium text-zinc-700" htmlFor="c-name">Company name</label>
        <input
          id="c-name"
          name="name"
          required
          placeholder="Acme Corp"
          className="w-full rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm focus:border-zinc-400 focus:outline-none"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-zinc-700" htmlFor="c-url">
          Website <span className="text-zinc-400 font-normal">(optional)</span>
        </label>
        <input
          id="c-url"
          name="website_url"
          type="url"
          placeholder="https://acme.com"
          className="w-full rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm focus:border-zinc-400 focus:outline-none"
        />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? 'Creating…' : 'Create client'}
      </button>
    </form>
  )
}

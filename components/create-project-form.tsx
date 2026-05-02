'use client'

import { useActionState } from 'react'
import { createProject } from '@/app/actions/projects'

type State = { error?: string }

export function CreateProjectForm({ clientId, onSuccess }: { clientId: string; onSuccess?: () => void }) {
  const [state, dispatch, isPending] = useActionState(async (_prev: State, fd: FormData) => {
    try {
      await createProject(clientId, fd)
      onSuccess?.()
      return {}
    } catch (e) {
      return { error: (e as Error).message }
    }
  }, {})

  return (
    <form action={dispatch} className="space-y-3">
      <div className="space-y-1">
        <label className="text-sm font-medium text-zinc-700" htmlFor="p-name">Project name</label>
        <input
          id="p-name"
          name="name"
          required
          placeholder="Q3 EU Outbound"
          className="w-full rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm focus:border-zinc-400 focus:outline-none"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-zinc-700" htmlFor="p-url">
          Offer website <span className="text-zinc-400 font-normal">(optional)</span>
        </label>
        <input
          id="p-url"
          name="website_url"
          type="url"
          placeholder="https://acme.com/product"
        className="w-full rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm focus:border-zinc-400 focus:outline-none"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-zinc-700" htmlFor="p-offer">
          Offer description <span className="text-zinc-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="p-offer"
          name="offer_text"
          rows={4}
          placeholder="We help B2B SaaS companies automate outbound sales..."
          className="w-full rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm focus:border-zinc-400 focus:outline-none resize-none"
        />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? 'Extracting ICP…' : 'Create project'}
      </button>
    </form>
  )
}

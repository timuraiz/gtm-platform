import { start } from 'workflow/api'
import { createServerClient } from '@supabase/ssr'
import { runPipeline } from '@/workflows/pipeline'

function db() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

export async function POST(req: Request) {
  try {
    const { projectId, iterationId } = await req.json() as { projectId: string; iterationId: string }
    if (!projectId || !iterationId) {
      return Response.json({ error: 'projectId and iterationId required' }, { status: 400 })
    }

    // Create the pipeline_runs row up-front so the workflow can write step artifacts into it
    const supabase = db()
    const { data: run, error } = await supabase
      .from('pipeline_runs')
      .insert({ project_id: projectId, status: 'running' })
      .select('id')
      .single()
    if (error || !run) {
      return Response.json({ error: error?.message ?? 'Failed to create run' }, { status: 500 })
    }

    // Fire-and-forget: workflow takes over from here and survives request termination
    const wf = await start(runPipeline, [projectId, iterationId, run.id])

    return Response.json({ runId: run.id, workflowRunId: wf.runId })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return Response.json({ error: message }, { status: 500 })
  }
}

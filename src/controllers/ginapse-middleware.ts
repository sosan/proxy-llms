import type { HonoRequest } from 'hono'
import { Env } from '../interfaces/general'

// ─────────────────────────────────────────────
// applyGinapseContext — called by chat controller
// Fetches memory context from Ginapse via service binding
// and injects it as a system message into the payload.
// Fail-open: if Ginapse is unavailable, logs and returns silently.
// ─────────────────────────────────────────────

export async function applyGinapseContextAndGetSession(
  request: HonoRequest,
  body: Record<string, unknown>,
  env: Env,
): Promise<GinapseContext | null> {
  // ── Extract session context from headers ──────
  const gctx = extractGinapseContext(request.raw.headers, env)
  if (!gctx) return null

  // ── Fire session/start if needed ─────────────
  if (gctx.doStart && env.GINAPSE_BINDING) {
    env.GINAPSE_BINDING.fetch(
      new Request('http://internal/mem/session/start', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ project: gctx.project, session_id: gctx.session_id }),
      }),
    ).catch((err: unknown) => console.error('[ginapse] session/start failed:', err))
  }

  // ── Fetch memory context ────────────────────
  if (!env.GINAPSE_BINDING) return null

  let observations: ContextObservation[] = []
  try {
    const url = `http://internal/mem/context?project=${encodeURIComponent(gctx.project)}&limit=${MAX_CONTEXT_OBS}`
    const resp = await env.GINAPSE_BINDING.fetch(new Request(url))
    if (resp.ok) {
      observations = await resp.json() as ContextObservation[]
    }
  } catch (err) {
    console.error('[ginapse] context fetch failed:', err)
    return null // fail-open
  }

  if (observations.length === 0) return null

  // ── Format and inject ───────────────────────
  const systemMessage = formatContextSystemMessage(gctx.project, observations)
  const newBody = injectSystemMessage(body, systemMessage)
  Object.assign(body, newBody)

  return gctx
}


// ─────────────────────────────────────────────
// Session state — in-memory per Worker isolate
// Keyed by project name
// ─────────────────────────────────────────────

interface SessionEntry {
  session_id:    string
  last_activity: number
}

const _sessions = new Map<string, SessionEntry>()

const SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

// ─────────────────────────────────────────────
// Header names
// ─────────────────────────────────────────────

const HDR_SESSION        = 'X-Ginapse-Session'
const HDR_PROJECT        = 'X-Ginapse-Project'
const HDR_SESSION_START  = 'X-Ginapse-Session-Start'
const HDR_SESSION_END    = 'X-Ginapse-Session-End'
const HDR_SESSION_KEEPALIVE = 'X-Ginapse-Session-Keep-Alive'

// ─────────────────────────────────────────────
// Context formatting
// ─────────────────────────────────────────────

const MAX_CONTEXT_OBS     = 20
const MAX_TOKEN_CHARS      = 2048 * 4 // ~2048 tokens at 4 chars/token

export function formatContextSystemMessage(
  project: string,
  observations: ContextObservation[],
): string {
  if (observations.length === 0) return ''

  const lines = observations.map((o, i) =>
    `${i + 1}. [${o.type}] ${o.room ?? 'general'}: ${o.content}`
  )

  let body = lines.join('\n')

  // Rough token cap
  if (body.length > MAX_TOKEN_CHARS) {
    const truncated = observations.reduce<string[]>((acc, o) => {
      const line = `[${o.type}] ${o.room ?? 'general'}: ${o.content}`
      if ((acc.join('\n').length + line.length + 50) > MAX_TOKEN_CHARS) return acc
      acc.push(line)
      return acc
    }, [])

    body = truncated.join('\n')
    const cut = observations.length - truncated.length
    if (cut > 0) body += `\n[... ${cut} more observations truncated]`
  }

  return `[Ginapse Memory — project: ${project}, ${observations.length} observation${observations.length === 1 ? '' : 's'}]\n\n${body}`
}

export interface ContextObservation {
  id:         string
  title:      string
  type:       string
  room:       string | null
  content:    string
  created_at: number
}

// ─────────────────────────────────────────────
// Ginapse middleware result
// ─────────────────────────────────────────────

export interface GinapseContext {
  project:    string
  session_id: string
  systemMessage: string
  doStart:    boolean
  doEnd:      boolean
}

// ─────────────────────────────────────────────
// extractGinapseContext — parses headers, manages session lifecycle
// Call BEFORE upstream fetch.
// ─────────────────────────────────────────────

export function extractGinapseContext(
  headers: Headers,
  env: Env,
): GinapseContext | null {
  // Feature flag — skip entirely if not configured
  if (!env.GINAPSE_BINDING || env.GINAPSE_ENABLED === 'false') {
    return null
  }

  const project = headers.get(HDR_PROJECT)
  if (!project) return null // no project = no memory context

  const sessionHeader = headers.get(HDR_SESSION)
  const isNew       = headers.get(HDR_SESSION_START) === 'true'
  const isEnd       = headers.get(HDR_SESSION_END) === 'true'
  const isKeepAlive = headers.get(HDR_SESSION_KEEPALIVE) === 'true'

  const now = Date.now()
  let session_id: string
  let doStart = false
  let doEnd   = false

  if (isNew) {
    // Explicit new session
    session_id = sessionHeader ?? crypto.randomUUID()
    _sessions.set(project, { session_id, last_activity: now })
    doStart = true
  } else if (isEnd) {
    // Explicit end
    const entry = _sessions.get(project)
    session_id = sessionHeader ?? entry?.session_id ?? crypto.randomUUID()
    _sessions.delete(project)
    doEnd = true
  } else if (isKeepAlive) {
    // Keep-alive extends timeout
    const entry = _sessions.get(project)
    if (entry) {
      entry.last_activity = now
      session_id = entry.session_id
    } else {
      // No session, treat as new
      session_id = sessionHeader ?? crypto.randomUUID()
      _sessions.set(project, { session_id, last_activity: now })
      doStart = true
    }
  } else {
    // Check for expired session
    const entry = _sessions.get(project)
    if (entry) {
      if (now - entry.last_activity > SESSION_TIMEOUT_MS) {
        // Expired — end old, start new
        doEnd   = true
        doStart = true
        session_id = crypto.randomUUID()
        _sessions.set(project, { session_id, last_activity: now })
      } else {
        session_id = entry.session_id
        entry.last_activity = now
      }
    } else {
      // No session, start one lazily
      session_id = sessionHeader ?? crypto.randomUUID()
      _sessions.set(project, { session_id, last_activity: now })
      doStart = true
    }
  }

  return { project, session_id, systemMessage: '', doStart, doEnd }
}

// ─────────────────────────────────────────────
// injectSystemMessage — prepends context to messages array
// ─────────────────────────────────────────────

export function injectSystemMessage(
  body: Record<string, unknown>,
  systemMessage: string,
): Record<string, unknown> {
  if (!systemMessage) return body

  const messages: unknown[] = Array.isArray(body.messages) ? [...body.messages] : []

  // Find where to insert — after existing system messages
  const firstNonSystem = messages.findIndex(
    (m: unknown) => (m as Record<string, unknown>)?.role !== 'system'
  )

  const systemMsg = { role: 'system', content: systemMessage }

  if (firstNonSystem === -1) {
    // No non-system messages, append
    messages.push(systemMsg)
  } else {
    messages.splice(firstNonSystem, 0, systemMsg)
  }

  return { ...body, messages }
}

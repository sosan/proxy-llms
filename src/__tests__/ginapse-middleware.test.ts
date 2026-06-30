import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  formatContextSystemMessage,
  injectSystemMessage,
  extractGinapseContext,
  applyGinapseContextAndGetSession,
  type ContextObservation,
} from '../controllers/ginapse-middleware'

// ── Helpers ─────────────────────────────────────────────

function makeEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    GINAPSE_BINDING: undefined,
    GINAPSE_ENABLED: undefined,
    ...overrides,
  } as Record<string, unknown>
}

function makeHeaders(overrides: Record<string, string> = {}): Headers {
  const defaults: Record<string, string> = {}
  return new Headers({ ...defaults, ...overrides })
}

const SAMPLE_OBS: ContextObservation[] = [
  { id: '1', title: 'Auth migration', type: 'decision', room: 'auth', content: 'Decided to use Clerk over Auth0', created_at: 1 },
  { id: '2', title: 'CI bug', type: 'bugfix', room: 'ci', content: 'Fixed secrets not available in workflow_dispatch', created_at: 2 },
  { id: '3', title: 'Cache perf', type: 'discovery', room: 'cache', content: 'Cache invalidation on session end', created_at: 3 },
]

// ── formatContextSystemMessage ───────────────────────────

describe('formatContextSystemMessage', () => {
  it('returns empty string for no observations', () => {
    expect(formatContextSystemMessage('myapp', [])).toBe('')
  })

  it('formats observations correctly', () => {
    const msg = formatContextSystemMessage('myapp', SAMPLE_OBS)
    expect(msg).toContain('[Ginapse Memory')
    expect(msg).toContain('project: myapp')
    expect(msg).toContain('3 observations')
    expect(msg).toContain('[decision] auth: Decided to use Clerk over Auth0')
    expect(msg).toContain('[bugfix] ci: Fixed secrets not available')
  })

  it('handles null room as general', () => {
    const obs = [{ id: '1', title: 't', type: 't', room: null, content: 'x', created_at: 1 }]
    const msg = formatContextSystemMessage('p', obs)
    expect(msg).toContain('general')
  })

  it('truncates to single observation when very long', () => {
    const longContent = 'a'.repeat(10_000)
    const obs = [
      { id: '1', title: 't', type: 't', room: 'r', content: longContent, created_at: 1 },
      { id: '2', title: 't2', type: 't2', room: 'r2', content: longContent, created_at: 2 },
    ]
    const msg = formatContextSystemMessage('p', obs)
    expect(msg).toContain('truncated')
  })
})

// ── injectSystemMessage ─────────────────────────────────

describe('injectSystemMessage', () => {
  it('injects at first non-system position', () => {
    const body = {
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ],
    }
    const result = injectSystemMessage(body, 'MEMORY CONTENT') as Record<string, unknown>
    const msgs = result.messages as unknown[]
    expect(msgs[0]).toEqual({ role: 'system', content: 'MEMORY CONTENT' })
    expect(msgs[1]).toEqual({ role: 'user', content: 'hello' })
  })

  it('appends if only system messages exist', () => {
    const body = {
      messages: [
        { role: 'system', content: 'existing system' },
      ],
    }
    const result = injectSystemMessage(body, 'MEMORY') as Record<string, unknown>
    const msgs = result.messages as unknown[]
    expect(msgs[0]).toEqual({ role: 'system', content: 'existing system' })
    expect(msgs[1]).toEqual({ role: 'system', content: 'MEMORY' })
  })

  it('returns body unchanged if no system message', () => {
    const body = { messages: [] }
    const result = injectSystemMessage(body, '') as Record<string, unknown>
    expect(result).toEqual(body)
  })
})

// ── extractGinapseContext ────────────────────────────────

describe('extractGinapseContext', () => {
  beforeEach(() => {
    // reset module-level session store between tests
  })

  it('returns null when GINAPSE_ENABLED is false', () => {
    const env = makeEnv({ GINAPSE_BINDING: {}, GINAPSE_ENABLED: 'false' })
    const headers = makeHeaders({ 'X-Ginapse-Project': 'myapp' })
    expect(extractGinapseContext(headers, env as any)).toBeNull()
  })

  it('returns null when no project header', () => {
    const env = makeEnv({ GINAPSE_BINDING: {} })
    const headers = makeHeaders({})
    expect(extractGinapseContext(headers, env as any)).toBeNull()
  })

  it('starts new session on X-Ginapse-Session-Start', () => {
    const env = makeEnv({ GINAPSE_BINDING: {} })
    const headers = makeHeaders({ 'X-Ginapse-Project': 'myapp', 'X-Ginapse-Session-Start': 'true' })
    const result = extractGinapseContext(headers, env as any)
    expect(result?.project).toBe('myapp')
    expect(result?.doStart).toBe(true)
    expect(result?.session_id).toBeDefined()
  })

  it('reuses provided session_id from header', () => {
    const env = makeEnv({ GINAPSE_BINDING: {} })
    const headers = makeHeaders({
      'X-Ginapse-Project': 'myapp',
      'X-Ginapse-Session': 'session-abc',
      'X-Ginapse-Session-Start': 'true',
    })
    const result = extractGinapseContext(headers, env as any)
    expect(result?.session_id).toBe('session-abc')
  })

  it('ends session on X-Ginapse-Session-End', () => {
    const env = makeEnv({ GINAPSE_BINDING: {} })
    const headers = makeHeaders({
      'X-Ginapse-Project': 'myapp',
      'X-Ginapse-Session': 'session-abc',
      'X-Ginapse-Session-End': 'true',
    })
    const result = extractGinapseContext(headers, env as any)
    expect(result?.doEnd).toBe(true)
    expect(result?.session_id).toBe('session-abc')
  })

  it('returns null context without binding when no project', () => {
    const env = makeEnv({})
    const headers = makeHeaders({})
    expect(extractGinapseContext(headers, env as any)).toBeNull()
  })
})

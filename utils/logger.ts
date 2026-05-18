/**
 * Conditional logger that respects the DEBUG environment variable.
 * - debug / info / warn: only emitted when DEBUG=true
 * - error: always emitted (critical for production)
 */
const isDebug = () => (globalThis as any).ENV?.DEBUG === 'true'
const isLogPayload = () => (globalThis as any).ENV?.LOG_PAYLOAD === 'true'

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDebug()) console.log('[DEBUG]', ...args)
  },

  info: (...args: unknown[]) => {
    if (isDebug()) console.log('[INFO]', ...args)
  },

  warn: (...args: unknown[]) => {
    if (isDebug()) console.warn('[WARN]', ...args)
  },

  /** Always visible — never suppress errors */
  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...args)
  },

  /** Log upstream request config (sanitized) — only in debug mode */
  logUpstreamConfig: (requestId: string, payload: unknown) => {
    if (isLogPayload()) {
      const payloadRecord = payload as Record<string, unknown>
      const { messages: _messages, ...safePayload } = payloadRecord
      console.log(`[${requestId}] config`, {
        ...safePayload,
        messages_count: Array.isArray(payloadRecord.messages) ? payloadRecord.messages.length : 0,
      })
    }
  },
}

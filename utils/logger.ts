/**
 * Conditional logger that respects the DEBUG environment variable.
 * - debug / info / warn: only emitted when DEBUG=true
 * - error: always emitted (critical for production)
 */

type LoggerEnv = {
  DEBUG?: string
  LOG_PAYLOAD?: string
  LOG_METRICS?: string
}
type Logger = {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  logUpstreamConfig: (requestId: string, payload: unknown) => void
}

let defaultLoggerEnv: LoggerEnv | undefined

export const setLoggerEnv = (env: LoggerEnv) => {
  defaultLoggerEnv = env
}

export const resetLoggerEnv = () => {
  defaultLoggerEnv = undefined
}

const isEnabled = (value?: string) => value === 'true'

const isDebug = (env?: LoggerEnv, useExplicitEnv = false) => {
  if (useExplicitEnv) return isEnabled(env?.DEBUG)
  if (isEnabled(defaultLoggerEnv?.DEBUG)) return true
  // Fallback for Node.js test environment
  return typeof process !== 'undefined' && isEnabled(process.env?.DEBUG)
}

const isLogPayload = (env?: LoggerEnv, useExplicitEnv = false) => {
  if (useExplicitEnv) return isEnabled(env?.LOG_PAYLOAD)
  if (isEnabled(defaultLoggerEnv?.LOG_PAYLOAD)) return true
  // Fallback for Node.js test environment
  return typeof process !== 'undefined' && isEnabled(process.env?.LOG_PAYLOAD)
}

const createLogger = (env?: LoggerEnv): Logger => {
  const useExplicitEnv = env !== undefined

  return {
    debug: (...args: unknown[]) => {
      if (isDebug(env, useExplicitEnv)) console.log('[DEBUG]', ...args)
    },

    info: (...args: unknown[]) => {
      if (isDebug(env, useExplicitEnv)) console.log('[INFO]', ...args)
    },

    warn: (...args: unknown[]) => {
      if (isDebug(env, useExplicitEnv)) console.warn('[WARN]', ...args)
    },

    /** Always visible; never suppress errors. */
    error: (...args: unknown[]) => {
      console.error('[ERROR]', ...args)
    },

    /** Log upstream request config (sanitized); only when LOG_PAYLOAD=true. */
    logUpstreamConfig: (requestId: string, payload: unknown) => {
      if (!isLogPayload(env, useExplicitEnv)) return

      const payloadRecord = payload as Record<string, unknown>
      const { messages: _messages, ...safePayload } = payloadRecord
      console.log(`[${requestId}] config`, {
        ...safePayload,
        messages_count: Array.isArray(payloadRecord.messages) ? payloadRecord.messages.length : 0,
      })
    },
  }
}

export const logger = {
  ...createLogger(),
  withEnv: (env: LoggerEnv): Logger => createLogger(env),
}

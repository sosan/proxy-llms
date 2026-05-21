import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger, resetLoggerEnv, setLoggerEnv } from '../../utils/logger'

describe('logger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    resetLoggerEnv()
    delete process.env.DEBUG
    delete process.env.LOG_PAYLOAD
  })

  describe('when DEBUG is not set', () => {
    it('should suppress debug messages', () => {
      logger.debug('test debug')
      expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it('should suppress info messages', () => {
      logger.info('test info')
      expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it('should suppress warn messages', () => {
      logger.warn('test warn')
      expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it('should always show error messages', () => {
      logger.error('test error')
      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })

  describe('when DEBUG=true', () => {
    beforeEach(() => {
      process.env.DEBUG = 'true'
    })

    it('should log debug messages', () => {
      logger.debug('test debug')
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should log info messages', () => {
      logger.info('test info')
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should log warn messages', () => {
      logger.warn('test warn')
      expect(consoleWarnSpy).toHaveBeenCalled()
    })

    it('should still show error messages', () => {
      logger.error('test error')
      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })

  describe('withEnv', () => {
    it('should log when DEBUG=true is passed explicitly', () => {
      const envLogger = logger.withEnv({ DEBUG: 'true' })

      envLogger.info('test info')

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO]', 'test info')
    })

    it('should prefer explicit env over the default logger env', () => {
      setLoggerEnv({ DEBUG: 'true' })
      const envLogger = logger.withEnv({ DEBUG: 'false' })

      envLogger.info('test info')

      expect(consoleLogSpy).not.toHaveBeenCalled()
    })
  })

  describe('logUpstreamConfig', () => {
    it('should suppress when DEBUG is not set', () => {
      logger.logUpstreamConfig('req-123', { model: 'test', messages: [{ role: 'user', content: 'hello' }] })
      expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it('should log sanitized payload when LOG_PAYLOAD=true', () => {
      process.env.LOG_PAYLOAD = 'true'
      logger.logUpstreamConfig('req-123', { model: 'test', messages: [{ role: 'user', content: 'hello' }] })
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should log sanitized payload when LOG_PAYLOAD=true is passed explicitly', () => {
      const envLogger = logger.withEnv({ LOG_PAYLOAD: 'true' })

      envLogger.logUpstreamConfig('req-123', { model: 'test', messages: [{ role: 'user', content: 'hello' }] })

      expect(consoleLogSpy).toHaveBeenCalledWith('[req-123] config', {
        model: 'test',
        messages_count: 1,
      })
    })
  })
})

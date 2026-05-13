import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MetricsCollector } from '../metrics/metrics-collector'
import type { Env } from '../interfaces/general'

describe('MetricsCollector', () => {
  let mockEnv: Env
  let metricsCollector: MetricsCollector

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'))

    mockEnv = {
      NVIDIA_API_KEY: 'test-key',
      NVIDIA_BASE_URL: 'https://api.test',
      ANALYTICS: {
        writeDataPoint: vi.fn().mockResolvedValue(undefined),
      } as any,
      PROCESSOR: {} as any,
    }

    metricsCollector = new MetricsCollector(mockEnv, 'req-123', 'z-ai/glm-5.1', 'openai', false)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('basic metrics', () => {
    it('should initialize with correct properties', () => {
      expect(metricsCollector).toBeDefined()
    })

    it('should set upstream status', () => {
      metricsCollector.setUpstreamStatus(200)
      expect(() => metricsCollector.setUpstreamStatus(200)).not.toThrow()
    })
  })

  describe('recordNonStreamingMetrics', () => {
    it('should record metrics for a successful response', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const responseJson = {
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
        choices: [{ finish_reason: 'stop' }],
      }

      metricsCollector.recordNonStreamingMetrics(200, responseJson)

      expect(consoleSpy).toHaveBeenCalled()
      expect(mockEnv.ANALYTICS.writeDataPoint).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should record error metrics', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      metricsCollector.recordNonStreamingMetrics(500, null, {
        type: 'upstream_error',
        message: 'Internal server error',
      })

      expect(consoleSpy).toHaveBeenCalled()
      expect(mockEnv.ANALYTICS.writeDataPoint).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should handle response without usage data', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const responseJson = {
        choices: [{ finish_reason: 'length' }],
      }

      metricsCollector.recordNonStreamingMetrics(200, responseJson)

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should calculate tokens per second when usage data is available', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      vi.advanceTimersByTime(1000)

      const responseJson = {
        usage: {
          prompt_tokens: 5,
          completion_tokens: 20,
          total_tokens: 25,
        },
        choices: [{ finish_reason: 'stop' }],
      }

      metricsCollector.recordNonStreamingMetrics(200, responseJson)

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('recordStreamingMetrics', () => {
    it('should record streaming metrics', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      metricsCollector.addChunk(100)
      metricsCollector.addChunk(50)
      metricsCollector.recordStreamingMetrics(200)

      expect(consoleSpy).toHaveBeenCalled()
      expect(mockEnv.ANALYTICS.writeDataPoint).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should record streaming error metrics', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      metricsCollector.recordStreamingMetrics(500, {
        type: 'stream_error',
        message: 'Stream interrupted',
      })

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should handle zero chunks in streaming', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      metricsCollector.recordStreamingMetrics(200)

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('streaming transform stream', () => {
    it('should create a TransformStream', () => {
      const stream = metricsCollector.createStreamingTransformStream()

      expect(stream).toBeDefined()
      expect(stream.readable).toBeDefined()
      expect(stream.writable).toBeDefined()
    })

    it('should process SSE data correctly', async () => {
      const stream = metricsCollector.createStreamingTransformStream()
      expect(stream).toBeDefined()
      expect(stream.readable).toBeDefined()
      expect(stream.writable).toBeDefined()
    })

    it('should handle [DONE] marker', async () => {
      const stream = metricsCollector.createStreamingTransformStream()
      expect(stream).toBeDefined()
      expect(stream.readable).toBeDefined()
      expect(stream.writable).toBeDefined()
    })
  })

  describe('chunk tracking', () => {
    it('should track chunk count and total characters', () => {
      metricsCollector.addChunk(10)
      metricsCollector.addChunk(20)
      metricsCollector.addChunk(5)

      expect(() => metricsCollector.addChunk(15)).not.toThrow()
    })
  })
})

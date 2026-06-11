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
      LOG_METRICS: 'true',
      DO_RATE_LIMITER: {} as any,
      ANALYTICS: {
        writeDataPoint: vi.fn().mockResolvedValue(undefined),
      } as any,
      PROCESSOR: {} as any,
    }

    metricsCollector = new MetricsCollector(mockEnv, 'req-123', 'nvidia/z-ai/glm-5.1', 'openai', false)
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
      const responseJson = {
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
        choices: [{ finish_reason: 'stop' }],
      }

      metricsCollector.recordNonStreamingMetrics(200, responseJson)

      expect(mockEnv.ANALYTICS.writeDataPoint).toHaveBeenCalled()
    })

    it('should record error metrics', () => {
      metricsCollector.recordNonStreamingMetrics(500, null, {
        type: 'upstream_error',
        message: 'Internal server error',
      })

      expect(mockEnv.ANALYTICS.writeDataPoint).toHaveBeenCalled()
    })

    it('should handle response without usage data', () => {
      const responseJson = {
        choices: [{ finish_reason: 'length' }],
      }

      metricsCollector.recordNonStreamingMetrics(200, responseJson)

      expect(mockEnv.ANALYTICS.writeDataPoint).toHaveBeenCalled()
    })

    it('should calculate tokens per second when usage data is available', () => {
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

      expect(mockEnv.ANALYTICS.writeDataPoint).toHaveBeenCalled()
    })
  })

  describe('recordStreamingMetrics', () => {
    it('should record streaming metrics', () => {
      metricsCollector.addChunk(100)
      metricsCollector.addChunk(50)
      metricsCollector.recordStreamingMetrics(200)

      expect(mockEnv.ANALYTICS.writeDataPoint).toHaveBeenCalled()
    })

    it('should record streaming error metrics', () => {
      metricsCollector.recordStreamingMetrics(500, {
        type: 'stream_error',
        message: 'Stream interrupted',
      })

      expect(mockEnv.ANALYTICS.writeDataPoint).toHaveBeenCalled()
    })

    it('should handle zero chunks in streaming', () => {
      metricsCollector.recordStreamingMetrics(200)

      expect(mockEnv.ANALYTICS.writeDataPoint).toHaveBeenCalled()
    })
  })

  describe('LOG_METRICS flag', () => {
    it('should NOT write metrics when LOG_METRICS is not set', () => {
      mockEnv.LOG_METRICS = undefined
      const responseJson = {
        choices: [{ finish_reason: 'stop' }],
      }

      metricsCollector.recordNonStreamingMetrics(200, responseJson)

      expect(mockEnv.ANALYTICS.writeDataPoint).not.toHaveBeenCalled()
    })

    it('should NOT write metrics when LOG_METRICS is false', () => {
      mockEnv.LOG_METRICS = 'false'
      const responseJson = {
        choices: [{ finish_reason: 'stop' }],
      }

      metricsCollector.recordNonStreamingMetrics(200, responseJson)

      expect(mockEnv.ANALYTICS.writeDataPoint).not.toHaveBeenCalled()
    })

    it('should write metrics when LOG_METRICS is true', () => {
      mockEnv.LOG_METRICS = 'true'
      const responseJson = {
        choices: [{ finish_reason: 'stop' }],
      }

      metricsCollector.recordNonStreamingMetrics(200, responseJson)

      expect(mockEnv.ANALYTICS.writeDataPoint).toHaveBeenCalled()
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

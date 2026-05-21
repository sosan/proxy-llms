import type { RequestMetrics } from '../interfaces/metrics'
import type { Env } from '../interfaces/general'
import { logger } from '../utils/logger'

export class MetricsCollector {
  private env: Env
  private requestId: string
  private model: string
  private provider: string
  private isStream: boolean
  private startTime: number
  private upstreamStartTime: number
  private upstreamStatus: number = 0
  private firstChunkTime: number | null = null
  private generationStartTime: number | null = null
  private generationEndTime: number | null = null
  private chunkCount = 0
  private totalChars = 0

  constructor(env: Env, requestId: string, model: string, provider: string, isStream: boolean) {
    this.env = env
    this.requestId = requestId
    this.model = model
    this.provider = provider
    this.isStream = isStream
    this.startTime = Date.now()
    this.upstreamStartTime = Date.now()
  }

  markUpstreamResponse(): void {
    // Time to First Byte (TTFB) from upstream
    this.upstreamStartTime = Date.now()
  }

  markFirstChunk(): void {
    if (this.firstChunkTime === null) {
      this.firstChunkTime = Date.now()
      this.generationStartTime = Date.now()
    }
  }

  markGenerationEnd(): void {
    if (this.generationEndTime === null) {
      this.generationEndTime = Date.now()
    }
  }

  setUpstreamStatus(status: number): void {
    this.upstreamStatus = status
  }

  addChunk(chars: number): void {
    this.chunkCount++
    this.totalChars += chars
  }

  private calculateMetrics(upstreamStatus: number, error?: { type?: string; message?: string }): RequestMetrics {
    const now = Date.now()
    const totalProxyMs = now - this.startTime
    const upstreamLatencyMs = this.firstChunkTime ? this.firstChunkTime - this.startTime : totalProxyMs

    const metrics: RequestMetrics = {
      requestId: this.requestId,
      model: this.model,
      provider: this.provider,
      isStream: this.isStream,
      upstreamLatencyMs,
      totalProxyMs,
      upstreamStatus,
      timestamp: new Date(),
    }

    // Streaming-specific metrics
    if (this.isStream) {
      if (this.firstChunkTime) {
        metrics.ttftMs = this.firstChunkTime - this.startTime
      }
      if (this.generationStartTime && this.generationEndTime) {
        metrics.generationTimeMs = this.generationEndTime - this.generationStartTime
      }
    }

    // Error tracking
    if (error) {
      metrics.errorType = error.type
      metrics.errorMessage = error.message
    }

    return metrics
  }

  recordNonStreamingMetrics(
    upstreamStatus: number,
    responseJson: unknown,
    error?: { type?: string; message?: string }
  ): void {
    const metrics = this.calculateMetrics(upstreamStatus, error)

    // Extract token usage from NVIDIA response
    const json = responseJson && typeof responseJson === 'object'
      ? responseJson as Record<string, unknown>
      : {}
    if (json.usage) {
      const usage = json.usage as Record<string, number>
      metrics.promptTokens = usage.prompt_tokens
      metrics.completionTokens = usage.completion_tokens
      metrics.totalTokens = usage.total_tokens

      // Calculate tokens per second
      if (metrics.completionTokens) {
        const tokenDurationMs = metrics.generationTimeMs || metrics.totalProxyMs
        if (tokenDurationMs > 0) {
          metrics.tokensPerSecond = (metrics.completionTokens / tokenDurationMs) * 1000
        }
      }
    }

    // Extract finish reason
    if (json.choices && Array.isArray(json.choices) && json.choices[0]) {
      const choice = json.choices[0] as Record<string, unknown>
      metrics.finishReason = choice.finish_reason as string
    }

    this.writeMetrics(metrics)
  }

  recordStreamingMetrics(upstreamStatus: number, error?: { type?: string; message?: string }): void {
    this.markGenerationEnd()
    const metrics = this.calculateMetrics(upstreamStatus, error)

    // Approximate tokens from character count (rough estimate: ~4 chars per token)
    if (this.totalChars > 0) {
      metrics.completionTokens = Math.floor(this.totalChars / 4)
      if (metrics.generationTimeMs) {
        metrics.tokensPerSecond = (metrics.completionTokens / metrics.generationTimeMs) * 1000
      }
    }

    this.writeMetrics(metrics)
  }

  private writeMetrics(metrics: RequestMetrics): void {
    // Emit a debug copy when DEBUG=true; LOG_METRICS only controls Analytics persistence.
    logger.withEnv(this.env).debug('[METRICS]', metrics)

    if (this.env.LOG_METRICS !== 'true') {
      return
    }

    // Analytics Engine writes are non-blocking. The runtime flushes them in the background.
    this.env.ANALYTICS.writeDataPoint({
      blobs: [
        metrics.requestId,
        metrics.model,
        metrics.provider,
        metrics.finishReason ?? '',
        metrics.errorType ?? '',
        metrics.errorMessage ?? '',
        metrics.isStream ? 'stream' : 'non_stream',
        metrics.upstreamStatus.toString(),
      ],
      doubles: [
        metrics.upstreamLatencyMs,
        metrics.totalProxyMs,
        metrics.ttftMs ?? 0,
        metrics.generationTimeMs ?? 0,
        metrics.tokensPerSecond ?? 0,
        metrics.promptTokens ?? 0,
        metrics.completionTokens ?? 0,
        metrics.totalTokens ?? 0,
      ],
      indexes: [`${metrics.provider}:${metrics.model}`],
    })
  }

  createStreamingTransformStream(): TransformStream<Uint8Array, Uint8Array> {
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()
    let pendingLine = ''

    return new TransformStream({
      transform: (chunk, controller) => {
        const text = decoder.decode(chunk, { stream: true })
        const lines = (pendingLine + text).split('\n')
        pendingLine = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()

            // Mark first chunk with content
            if (data !== '[DONE]' && this.firstChunkTime === null) {
              this.markFirstChunk()
            }

            // Parse SSE data to extract content for token approximation
            if (data !== '[DONE]') {
              try {
                const json = JSON.parse(data)
                const delta = json.choices?.[0]?.delta?.content
                if (delta && typeof delta === 'string') {
                  this.addChunk(delta.length)
                }

                // Check for finish reason
                if (json.choices?.[0]?.finish_reason) {
                  this.markGenerationEnd()
                }
              } catch {
                // Ignore parse errors
              }
            } else {
              // Stream finished
              this.markGenerationEnd()
            }
          }
        }

        controller.enqueue(chunk)
      },
      flush: (controller) => {
        const line = pendingLine.trim()
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()

          if (data !== '[DONE]' && this.firstChunkTime === null) {
            this.markFirstChunk()
          }

          if (data !== '[DONE]') {
            try {
              const json = JSON.parse(data)
              const delta = json.choices?.[0]?.delta?.content
              if (delta && typeof delta === 'string') {
                this.addChunk(delta.length)
              }
            } catch {
              // Ignore parse errors
            }
          }
        }

        // Re-emit the pending line so downstream consumers receive it
        if (pendingLine) {
          controller.enqueue(encoder.encode(pendingLine + '\n\n'))
        }

        // Stream ended, record metrics
        this.markGenerationEnd()
        this.recordStreamingMetrics(this.upstreamStatus || 200)
      },
    })
  }
}

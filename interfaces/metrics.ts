export interface RequestMetrics {
  requestId: string
  model: string
  provider: string
  isStream: boolean
  
  // Timing
  upstreamLatencyMs: number
  totalProxyMs: number
  ttftMs?: number
  generationTimeMs?: number
  
  // Token usage (only available for non-streaming)
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  tokensPerSecond?: number
  
  // Response details
  finishReason?: string
  upstreamStatus: number
  
  // Error tracking
  errorType?: string
  errorMessage?: string
  
  timestamp: Date
}

export interface MetricsSummary {
  totalRequests: number
  streamingRequests: number
  nonStreamingRequests: number
  avgLatencyMs: number
  avgTtftMs: number
  avgTokensPerSecond: number
}

export interface ModelMetrics {
  model: string
  requests: number
  avgLatencyMs: number
  avgTtftMs: number
  avgTokensPerSecond: number
}

export interface StatusMetrics {
  status: number
  count: number
}

export interface ErrorMetrics {
  errorType: string
  count: number
}

export interface AggregatedMetrics {
  summary: MetricsSummary
  byModel: ModelMetrics[]
  byStatus: StatusMetrics[]
  errors: ErrorMetrics[]
}

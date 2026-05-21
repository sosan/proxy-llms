# Metrics

## Brief overview

The proxy collects per-request metrics using Cloudflare Analytics Engine. Metrics collection is gated by the `LOG_METRICS` environment variable.

## Enabling metrics

Set `LOG_METRICS = "true"` in `wrangler.toml` or via environment variable. When disabled (default), no metrics are collected or written.

```toml
[vars]
LOG_METRICS = "true"
```

## Collected metrics

| Metric | Type | Description |
|--------|------|-------------|
| `requestId` | string | Unique request identifier |
| `model` | string | Resolved model ID |
| `provider` | string | Provider name (nvidia, openrouter, etc.) |
| `isStream` | boolean | Whether the request was streaming |
| `upstreamLatencyMs` | number | Time to first byte from upstream |
| `totalProxyMs` | number | Total time spent in the proxy |
| `ttftMs` | number | Time to first token (streaming only) |
| `generationTimeMs` | number | Generation time in ms (streaming only) |
| `tokensPerSecond` | number | Estimated tokens per second |
| `promptTokens` | number | Prompt tokens (non-streaming only) |
| `completionTokens` | number | Completion tokens (non-streaming only) |
| `totalTokens` | number | Total tokens (non-streaming only) |
| `finishReason` | string | Finish reason from upstream |
| `upstreamStatus` | number | HTTP status from upstream |
| `errorType` | string | Error type if the request failed |
| `errorMessage` | string | Error message if the request failed |

## Implementation

Metrics are collected via the `MetricsCollector` class in `metrics/metrics-collector.ts`. The `writeMetrics()` method checks `LOG_METRICS === 'true'` before writing to Analytics Engine.

```typescript
// metrics/metrics-collector.ts
private writeMetrics(metrics: RequestMetrics): void {
  if (this.env.LOG_METRICS !== 'true') {
    return
  }

  logger.info('[METRICS]', JSON.stringify(metrics))

  this.env.ANALYTICS.writeDataPoint({
    // ... Analytics Engine data point
  })
}
```

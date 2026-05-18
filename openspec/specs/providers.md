# Providers

## Overview

The proxy supports multiple upstream LLM providers. Each provider is configured in `config/providers.ts` and has a dedicated provider class in `providers/`.

## Supported Providers

| Provider | Class | Description |
|----------|-------|-------------|
| NVIDIA NIM | `NVIDIAProvider` | Primary provider for hosted models |
| OpenRouter | `OpenRouterProvider` | Aggregator for multiple model backends |
| LMStudio | `LocalProvider` | Local desktop inference |
| LlamaCPP | `LocalProvider` | Local llama.cpp server |
| Ollama | `LocalProvider` | Local Ollama instance |
| Claude | `AnthropicProvider` | Anthropic API (future) |
| Google | `GoogleProvider` | Google AI (future) |

## Provider Configuration

All provider configuration lives in `config/providers.ts`:

```typescript
export const ProviderConfigs = {
  nvidia: {
    endpoint: '/chat/completions',
    models: {
      'glm4.7': 'z-ai/glm4.7',
      'kimi-k2.6': 'moonshotai/kimi-k2.6',
      // ...
    },
    format: 'openai',
  },
  openrouter: {
    endpoint: '/chat/completions',
    models: {},
    format: 'openai',
  },
  // ...
}
```

### Configuration Fields

| Field | Description | Example |
|-------|-------------|---------|
| `endpoint` | API path for chat completions | `/chat/completions`, `/messages` |
| `models` | Map of aliases to full upstream model IDs | `{ 'glm4.7': 'z-ai/glm4.7' }` |
| `format` | API format: `openai`, `anthropic`, or `google` | `openai` |

## Model Aliases

### Principles

- Keep client-facing aliases short, stable, and intuitive.
- Maintain backward compatibility — never remove or change existing aliases.
- Document new aliases in comments and related documentation.

### Alias Resolution

`resolveModel(config, payloadModel)` in `config/providers.ts`:

1. If `payloadModel` is an alias (e.g., `"glm4.7"`), resolve to full ID (`"z-ai/glm4.7"`).
2. If `payloadModel` is already a full ID (e.g., `"z-ai/glm4.7"`), pass it through.
3. If no model is specified, use the first alias's resolved ID as the default.

### Adding a New Alias

1. Add the alias → full ID mapping in `ProviderConfigs[<provider>].models`.
2. Run `npm run typecheck` to verify TypeScript.
3. Test resolution with both alias and full ID.
4. Document the alias in comments.

## Model Defaults

Default parameters for specific models live in `ModelDefaultsById` in `config/providers.ts`:

```typescript
export const ModelDefaultsById: Record<string, ModelDefaults> = {
  'z-ai/glm4.7': {
    temperature: 0.9,
    top_p: 0.95,
    max_tokens: 32768,
    stream: true,
    extra: {
      chat_template_kwargs: { enable_thinking: true },
    },
  },
}
```

Defaults are merged with the client-provided payload. Client-provided values always override defaults.

## Provider Factory

`providers/provider-factory.ts` creates provider instances by name:

```typescript
export function createProvider(name: string, env: Env): AIProvider {
  switch (name) {
    case 'nvidia': return new NVIDIAProvider(env)
    case 'openrouter': return new OpenRouterProvider(env)
    case 'lmstudio':
    case 'llamacpp':
    case 'ollama': return new LocalProvider(name, env)
    default: throw new Error(`Unknown provider: ${name}`)
  }
}
```

## Provider Classes

### BaseProvider (`providers/base-provider.ts`)

Shared logic for all providers:
- Streaming response handling
- Error status code preservation
- Logging via `utils/logger.ts`
- Metrics collection

### NVIDIAProvider (`providers/nvidia-provider.ts`)

- Forwards requests to NVIDIA NIM API
- Handles NVIDIA-specific authentication
- Supports both streaming and non-streaming

### OpenRouterProvider (`providers/openrouter-provider.ts`)

- Forwards requests to OpenRouter API
- Supports multiple backend models through OpenRouter

### LocalProvider (`providers/local-provider.ts`)

- Handles LMStudio, LlamaCPP, and Ollama local servers
- Configurable base URL per provider
- Supports local inference without cloud dependency

## Adding a New Provider

1. **Add config** in `config/providers.ts`:
   ```typescript
   myprovider: {
     endpoint: '/chat/completions',
     models: { ... },
     format: 'openai',
   }
   ```

2. **Create provider class** in `providers/myprovider-provider.ts` extending `BaseProvider`.

3. **Add factory case** in `providers/provider-factory.ts`.

4. **Add credentials** to `Env` in `interfaces/general.ts` if needed.

5. **`ProviderType`** is derived automatically from `ProviderConfigs` keys — no need to edit `interfaces/provider.ts`.

6. Run `npm run typecheck` and `npm run test`.

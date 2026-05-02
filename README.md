# Multi-Provider AI Proxy with Async Processing

Este proxy permite usar múltiples proveedores de AI (DeepSeek, Claude, OpenAI) a través de NVIDIA NIM, con capacidades de procesamiento asíncrono usando Cloudflare Durable Objects.

## Endpoints

### Proveedores AI Síncronos
- `POST /deepseek/v1/chat/completions` - Compatible con DeepSeek API
- `POST /claude/v1/messages` - Compatible con Anthropic API  
- `POST /openai/v1/chat/completions` - Compatible con OpenAI API

### Procesamiento Asíncrono
- `POST /api/process` - Iniciar procesamiento asíncrono
- `GET /api/status/:processId` - Obtener estado (polling)
- `GET /api/stream/:processId` - SSE stream para updates en tiempo real
- `GET /api/websocket/:processId` - WebSocket para updates en tiempo real

## Uso con Cline/Claude Code

### Procesamiento Asíncrono

1. **Iniciar proceso:**
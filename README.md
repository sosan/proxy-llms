# Multi-Provider AI Proxy with Async Processing

Este proxy permite usar múltiples proveedores de AI compatibles con la API de OpenAI a través de NVIDIA NIM, con capacidades de procesamiento asíncrono usando Cloudflare Durable Objects.

## Endpoints

### Proveedores AI Síncronos
- `POST /claude/v1/messages` - Compatible con Anthropic API (soon)
- `POST /nvidia/v1/chat/completions` - Compatible con OpenAI API

### Procesamiento Asíncrono
- `POST /api/process` - Iniciar procesamiento asíncrono
- `GET /api/status/:processId` - Obtener estado (polling)
- `GET /api/stream/:processId` - SSE stream para updates en tiempo real
- `GET /api/websocket/:processId` - WebSocket para updates en tiempo real

## Uso con Cline/Claude Code

### Procesamiento Asíncrono

1. **Iniciar proceso:**
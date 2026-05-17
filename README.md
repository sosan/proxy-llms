# Multi-Provider AI Proxy with Async Processing

Este proxy permite usar múltiples proveedores de AI compatibles con la API de OpenAI a través de NVIDIA NIM, con capacidades de procesamiento asíncrono usando Cloudflare Durable Objects.

## Security

This repository follows [npm Security Best Practices](https://github.com/lirantal/npm-security-best-practices) to harden the supply chain and reduce the attack surface of the dependency tree.

### Implemented hardening controls

| Control | File | Description |
|---|---|---|
| Ignore lifecycle scripts | `.npmrc` | `ignore-scripts=true` prevents arbitrary code execution during install |
| Block git deps | `.npmrc` | `allow-git=none` rejects git-source dependencies |
| Install cooldown | `.npmrc` | `min-release-age=30` blocks packages newer than 30 days |
| pnpm trust policy | `.pnpm-workspace.yaml` | `trustPolicy: no-downgrade` refuses versions with weaker trust signals |
| Strict dep builds | `.pnpm-workspace.yaml` | `strictDepBuilds: true` fails install on unapproved build scripts |
| Block exotic subdeps | `.pnpm-workspace.yaml` | `blockExoticSubdeps: true` blocks git/tarball in transitive deps |
| Lockfile lint | `package.json` | `lockfile-lint` validates integrity, host, HTTPS on every install |
| Dependabot cooldown | `.github/dependabot.yml` | 7-day cooldown before auto-upgrading dependencies |
| CODEOWNERS | `.github/CODEOWNERS` | Mandatory review for lockfiles and package manager config |
| CI hardening | `.github/workflows/ci.yml` | Deterministic install (`npm ci --ignore-scripts`) + lockfile validation |
| Dev container | `.devcontainer/devcontainer.json` | Isolated environment with `--cap-drop=ALL` and `--no-new-privileges` |

### Pre-install audit tools (recommended)

Install [npq](https://github.com/lirantal/npq) to audit packages before installation:

```bash
npm install -g npq
npq install <package>
```

Or use [Socket Firewall](https://socket.dev/blog/introducing-socket-firewall) (`sfw`) to block malicious packages in real time:

```bash
npm install -g sfw
sfw npm install <package>
```

### No plaintext secrets

Do not store plaintext secrets in `.env` or `.env.dev` files. Use a secrets manager (Infisical, 1Password, etc.) and reference secrets by URI:

```bash
# .env
DATABASE_PASSWORD=infisical://project/env/database/password
API_KEY=infisical://project/env/api-key
```

Inject secrets at runtime with Infisical CLI:

```bash
# Basic usage
infisical run -- npm start

# Watch for secret changes (development only)
infisical run --watch -- npm run dev
```

> **Tip:** Use `infisical login` to authenticate once, then `infisical run` injects secrets without plaintext files.

**Alternatives:** If you use 1Password, you can do the same with `op run -- npm start`.

### Local development

Open the project in the provided [Dev Container](.devcontainer/devcontainer.json) to keep dependency execution isolated from your host system.

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

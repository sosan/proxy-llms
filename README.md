# Multi-Provider AI Proxy with Async Processing

This proxy allows using multiple AI providers compatible with the OpenAI API through NVIDIA NIM, with async processing capabilities using Cloudflare Durable Objects.

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

Do not store plaintext secrets in `.env` or `.env.dev` files. Use a secrets manager (Infisical, 1Password, etc.) and inject secrets at runtime with Infisical CLI, example:

```bash
# Basic usage
infisical run -- npm run dev

# Watch for secret changes (development only)
infisical run --watch -- npm run dev
```

> **Tip:** Use `infisical login` to authenticate once, then `infisical run` injects secrets without plaintext files.

**Alternatives:** If you use 1Password, you can do the same with `op run -- npm start`.

### Local development

Open the project in the provided [Dev Container](.devcontainer/devcontainer.json) to keep dependency execution isolated from your host system.

## Endpoints

### Synchronous AI Providers
- `POST /claude/v1/messages` - Compatible with Anthropic API (soon)
- `POST /nvidia/v1/chat/completions` - Compatible with OpenAI API

### Async Processing
- `POST /api/process` - Start async processing
- `GET /api/status/:processId` - Get status (polling)
- `GET /api/stream/:processId` - SSE stream for real-time updates
- `GET /api/websocket/:processId` - WebSocket for real-time updates

## Usage with Cline/Claude Code

### Async Processing

1. **Start process:**

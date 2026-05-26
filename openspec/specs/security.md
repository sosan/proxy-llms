# Security

## Supply-Chain Hardening

This repository follows [npm Security Best Practices](https://github.com/lirantal/npm-security-best-practices) to harden the supply chain and reduce the attack surface of the dependency tree.

### Implemented Controls

| Control | File | Description |
|---|---|---|
| Ignore lifecycle scripts | `.npmrc` | `ignore-scripts=true` prevents arbitrary code execution during install |
| Block git deps | `.npmrc` | `allow-git=none` rejects git-source dependencies |
| Install cooldown | `.npmrc` | `min-release-age=30` blocks packages newer than 30 days |
| pnpm trust policy | `pnpm-workspace.yaml` | `trustPolicy: no-downgrade` refuses versions with weaker trust signals |
| Strict dep builds | `pnpm-workspace.yaml` | `strictDepBuilds: true` fails install on unapproved build scripts |
| Block exotic subdeps | `pnpm-workspace.yaml` | `blockExoticSubdeps: true` blocks git/tarball in transitive deps |
| Frozen lockfile check | `package.json` | `corepack pnpm install --lockfile-only --frozen-lockfile --ignore-scripts --optimistic-repeat-install` validates lockfile consistency |
| Dependabot cooldown | `.github/dependabot.yml` | 7-day cooldown before auto-upgrading dependencies |
| CODEOWNERS | `.github/CODEOWNERS` | Mandatory review for lockfiles and package manager config |
| CI hardening | `.github/workflows/ci-cd.yaml` | Deterministic install (`pnpm install --frozen-lockfile --prefer-offline`) + lockfile validation |
| Dev container | `.devcontainer/devcontainer.json` | Isolated environment with `--cap-drop=ALL` and `--no-new-privileges` |

### Pre-Install Security Audit

Before installing new packages, audit them with:

```bash
# npq — pre-install security auditor
pnpm install -g npq
pnpq install <package>

# Socket Firewall — real-time malicious package blocker
pnpm install -g sfw
sfw pnpm install <package>
```

### Secure Local Development

- Use the provided [Dev Container](.devcontainer/devcontainer.json) for isolated development.
- The container drops all capabilities, disables proto pollution, and enforces `ignore-scripts` and `allow-git=none`.
- Run `pnpm install --frozen-lockfile --prefer-offline` instead of `pnpm install` for deterministic installs.

### CI/CD Security

- CI uses `pnpm install --frozen-lockfile --prefer-offline` for deterministic installs.
- Lockfile consistency is validated with pnpm before the rest of `validate`.
- Dependabot PRs have a 7-day cooldown to avoid compromised fresh releases.
- CODEOWNERS requires explicit review for lockfiles and package manager config.

## Secret Management

- **Never store plaintext secrets in `.env` or `.env.dev` files** — use secret references like `infisical://project/env/api-key`.
- Use a secrets manager (Infisical, 1Password) and inject at runtime:
  ```bash
  infisical run -- pnpm run dev
  op run -- pnpm run dev
  ```
- Sensitive files (`.env`, `.local`, `wrangler.toml`) must never be committed or exposed.
- Environment variables only, never hardcoded.

## Logging

- Use the centralized `logger` from `utils/logger.ts` for all logging.
- `debug()`, `info()`, `warn()` are suppressed when `DEBUG=false` (default in production).
- `error()` is always visible.
- `logUpstreamConfig()` strips `messages` from payload before logging.
- Never log API keys, request bodies with secrets, or `.env` values.
- Never use raw `console.log` or `console.error` directly.

## Input Validation

- Validate all user inputs before processing.
- Sanitize data to prevent injection attacks.
- Implement proper authentication and authorization.
- Check for malicious input patterns.

## Network Security

- Use HTTPS for all upstream requests.
- Implement proper CORS configuration.
- Consider rate limiting and abuse prevention.
- Validate upstream URLs and responses.
- Do not expose internal implementation details in client-facing errors.

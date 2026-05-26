# Security

## Brief overview

This repository follows pnpm Security Best Practices to harden the supply chain and reduce the attack surface of the dependency tree.

## Supply-chain hardening controls

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
| CI hardening | `.github/workflows/ci.yml` | Deterministic install (`pnpm ci --ignore-scripts`) + lockfile validation |
| Dev container | `.devcontainer/devcontainer.json` | Isolated environment with `--cap-drop=ALL` and `--no-new-privileges` |

## Secret management

- Never store plaintext secrets in `.env`, `.env.dev`, or any committed file
- Use a secrets manager (Infisical, 1Password) and inject at runtime:
  - `infisical run -- pnpm run dev`
  - `op run -- pnpm start`
- Never commit `wrangler.toml` with real credentials

## Pre-install audit tools (recommended)

```bash
# npq — pre-install security auditor
pnpm install -g npq
pnpq install <package>

# Socket Firewall — real-time malicious package blocker
pnpm install -g sfw
sfw pnpm install <package>
```

## Secure local development

- Use the provided Dev Container (`.devcontainer/devcontainer.json`) for isolated development
- The container drops all capabilities, disables proto pollution, and enforces `ignore-scripts` and `allow-git=none`
- Run `pnpm ci --ignore-scripts --prefer-offline` instead of `pnpm install` for deterministic installs

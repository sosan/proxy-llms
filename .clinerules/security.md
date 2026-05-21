# Security

## Brief overview

This repository follows npm Security Best Practices to harden the supply chain and reduce the attack surface of the dependency tree.

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
| CI hardening | `.github/workflows/ci.yml` | Deterministic install (`npm ci --ignore-scripts`) + lockfile validation |
| Dev container | `.devcontainer/devcontainer.json` | Isolated environment with `--cap-drop=ALL` and `--no-new-privileges` |

## Secret management

- Never store plaintext secrets in `.env`, `.env.dev`, or any committed file
- Use a secrets manager (Infisical, 1Password) and inject at runtime:
  - `infisical run -- npm run dev`
  - `op run -- npm start`
- Never commit `wrangler.toml` with real credentials

## Pre-install audit tools (recommended)

```bash
# npq — pre-install security auditor
npm install -g npq
npq install <package>

# Socket Firewall — real-time malicious package blocker
npm install -g sfw
sfw npm install <package>
```

## Secure local development

- Use the provided Dev Container (`.devcontainer/devcontainer.json`) for isolated development
- The container drops all capabilities, disables proto pollution, and enforces `ignore-scripts` and `allow-git=none`
- Run `npm ci --ignore-scripts --prefer-offline` instead of `npm install` for deterministic installs

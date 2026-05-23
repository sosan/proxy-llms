# Security Policy

## Supported Versions

This project follows a rolling release model from the `main` branch. Security updates are applied only to the latest state of `main`.

| Branch / Tag | Supported |
|--------------|-----------|
| `main`       | :white_check_mark: |
| Any other branch or tag | :x: |

> **Note:** The project does not yet maintain semantic-versioned releases. If you need a stable target, pin to a specific commit and monitor `main` for security fixes.

## Reporting a Vulnerability

We take security seriously. If you discover a vulnerability in this proxy or its dependencies, please follow the steps below.

### 1. Do not open a public issue

Public issues may expose the vulnerability before a fix is available.

### 2. Report privately

**Preferred channel:** GitHub Security Advisories
- Go to the repository → **Security** → **Advisories** → **Report a vulnerability**
- Fill in the advisory form with as much detail as possible (steps to reproduce, impact, affected components).

**Alternative channel:** Email the maintainers directly at the contact address listed in the repository's `.github/CODEOWNERS` or author metadata.

### 3. What to include

- A clear description of the vulnerability
- Steps to reproduce (requests, configuration, etc.)
- Impact assessment (what data or behavior is at risk)
- Any suggested fixes or mitigations

### 4. Response timeline

| Phase | Expected Time |
|-------|---------------|
| Acknowledgment | Within 48 hours |
| Initial assessment | Within 5 business days |
| Fix or mitigation | Within 14–30 days depending on severity |
| Public disclosure | After fix is released and users have had time to update |

We follow a **coordinated disclosure** policy: we will work with you to validate, fix, and disclose the issue responsibly. If the vulnerability is accepted, you will be credited in the advisory (unless you prefer to remain anonymous). If declined, we will explain why.

## Security Hardening

This repository implements several supply-chain and runtime hardening controls. If you report a vulnerability, please indicate which of these controls may be bypassed or insufficient.

### Supply-chain controls

| Control | File | Description |
|---|---|---|
| Ignore lifecycle scripts | `.npmrc` | Prevents arbitrary code execution during install |
| Block git deps | `.npmrc` | Rejects git-source dependencies |
| Install cooldown | `.npmrc` | Blocks packages newer than 30 days |
| pnpm trust policy | `pnpm-workspace.yaml` | Refuses versions with weaker trust signals |
| Strict dep builds | `pnpm-workspace.yaml` | Fails install on unapproved build scripts |
| Block exotic subdeps | `pnpm-workspace.yaml` | Blocks git/tarball in transitive deps |
| Frozen lockfile check | `package.json` | Validates lockfile consistency with pnpm |
| Dependabot cooldown | `.github/dependabot.yml` | 7-day cooldown before auto-upgrading dependencies |
| CODEOWNERS | `.github/CODEOWNERS` | Mandatory review for lockfiles and package manager config |
| CI hardening | `.github/workflows/ci-cd.yaml` | Deterministic install + lockfile validation |

### Runtime controls

- **No plaintext secrets:** Secrets are injected at runtime via a secrets manager (e.g., Infisical, 1Password). Never commit credentials.
- **Cloudflare Workers sandbox:** The proxy runs inside the Cloudflare Workers V8 isolate, which provides memory and CPU isolation.
- **Durable Objects:** Async processing uses Cloudflare Durable Objects for stateful isolation.

## Scope

The following components are in scope for security reports:

- `src/server.ts` and route handlers
- `src/controllers/` — request/response handling logic
- `src/providers/` — upstream provider implementations and credential handling
- `src/durable-objects/` — async processing logic
- `src/metrics/` — metrics collection and data sanitization
- `wrangler.toml` and deployment configuration

The following are **out of scope** unless they directly affect the above:

- Upstream LLM provider APIs (NVIDIA, OpenRouter, etc.)
- Cloudflare platform vulnerabilities (report to Cloudflare instead)

## Acknowledgments

We thank security researchers and contributors who help keep this project safe. Previous acknowledgments will be listed here as they occur.

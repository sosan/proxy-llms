# Setup and Deployment

This guide covers the operational setup for deploying the Cloudflare Worker from this repository.

## Prerequisites

- Node.js managed through the version declared in `package.json`.
- Corepack enabled so the pinned pnpm version is used.
- A Cloudflare account with permission to deploy Workers.
- Access to this GitHub repository settings.

Install dependencies with:

```bash
corepack pnpm install --frozen-lockfile
```

## Cloudflare API Token

Create `CLOUDFLARE_API_TOKEN` in Cloudflare:

1. Go to **Cloudflare Dashboard** -> **My Profile** -> **API Tokens**.
2. Select **Create Token**.
3. Select **Custom token**.
4. Add the following permissions **exactly** (Wrangler needs all of them to deploy):

   | Resource | Level | Permission |
   |---|---|---|
   | `Account` | `Cloudflare Workers` | **Edit** |
   | `User` | `User Details` | **Read** |
   | `User` | `Memberships` | **Read** |

5. Under **Account Resources**, select **Include** and choose the Cloudflare account that owns this Worker.
6. Select **Continue to summary**, review the permissions, then select **Create Token**.
7. Copy the token immediately; Cloudflare only shows it once.

**Important**: `CLOUDFLARE_API_TOKEN` must be an **API Token**, not the **Global API Key**. Wrangler does not accept the Global API Key for deployment. Do not commit it to the repository.

## Cloudflare Account ID

Get `CLOUDFLARE_ACCOUNT_ID` from the Cloudflare dashboard sidebar for the account that owns the Worker.

## Secret Management Strategy

This repository supports a **hybrid model** for secret management. You can choose between:

1. **GitHub Actions only** (default): All secrets live in GitHub Environment/Repository secrets.
2. **Hybrid (recommended)**: Use **Infisical** for Worker runtime secrets and **GitHub** only for pipeline authentication.

### Recommended hybrid split

| Secret / Variable | Recommended location | Reason |
|-------------------|---------------------|--------|
| `CLOUDFLARE_API_TOKEN` | GitHub | Pipeline auth (Wrangler → Cloudflare) |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub | Pipeline auth (Wrangler → Cloudflare) |
| `NVIDIA_API_KEY` | Infisical | Worker runtime secret; easier rotation and audit |
| `OPENCODE_API_KEY` | Infisical | Worker runtime secret; easier rotation and audit |
| `ANALYTICS_ACCOUNT_ID` | Infisical | Worker runtime secret; easier rotation and audit |
| `ANALYTICS_API_TOKEN` | Infisical | Worker runtime secret; easier rotation and audit |
| `LOG_METRICS` | GitHub Variables | Non-sensitive environment config |

### Why Infisical for runtime secrets?

- Centralized secret rotation without touching GitHub.
- Fine-grained access control and audit logs.
- Machine Identity tokens scoped per environment (`staging` / `production`).
- Injects secrets at build/deploy time, keeping them out of source code.

---

## GitHub Actions Secrets

Create two GitHub environments named exactly:

- `staging`
- `production`

For each environment, go to **Settings** -> **Environments** -> `<environment>` -> **Environment secrets** and add at minimum:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

If you are **not** using Infisical, also add these to the same GitHub Environment secrets:

- `NVIDIA_API_KEY`
- `OPENCODE_API_KEY`
- `ANALYTICS_ACCOUNT_ID`
- `ANALYTICS_API_TOKEN`

Prefer **Environment secrets** for this repository because the deploy job selects `staging` or `production` with GitHub Actions `environment.name`. Environment secrets are scoped to that deployment environment and can be protected by approvals.

**Repository secrets** are available repo-wide to workflows that can access them. They still work if the same Cloudflare credentials are intentionally shared across environments and no production approval gate is needed.

For `production`, add protection rules such as required reviewers before deploys.

Do not commit `.env` files with real values. Keep only an `.env.example` with variable names and placeholders.

## Releasing with release-it and Infisical

This repository uses [`release-it`](https://github.com/release-it/release-it) to automate versioning, changelogs, and GitHub Releases. To keep secrets out of local `.env` files, **Infisical** is the recommended way to inject the `GITHUB_TOKEN` required for creating GitHub Releases.

### Prerequisites

- Infisical CLI installed and authenticated (`infisical login`)
- A GitHub Personal Access Token with `repo` scope

### 1. Store `GITHUB_TOKEN` in Infisical

1. In your Infisical project (e.g., `proxy-llms`), create an environment for releases (e.g., `release` or reuse `production`).
2. Add the secret:
   - `GITHUB_TOKEN` — your GitHub Personal Access Token (must have `repo` scope).

### 2. Run the release through Infisical

```bash
infisical run --env=release -- pnpm run release
```

This injects `GITHUB_TOKEN` into the environment so `release-it` can create the GitHub Release automatically.

### Why Infisical for `GITHUB_TOKEN`?

- **No plaintext secrets** in `.env` or shell history.
- **Centralized rotation** — rotate the token in Infisical without touching local files.
- **Audit trail** — Infisical logs who accessed the secret and when.

---

## Infisical Setup (Optional)

If you choose the hybrid model, follow these steps to configure Infisical for this repository.

### 1. Create the Infisical project and environments

1. Log in to your Infisical dashboard.
2. Create a new project (e.g., `proxy-llms`).
3. Inside the project, create two environments named exactly:
   - `staging`
   - `production`
4. In each environment, add the following secrets:
   - `NVIDIA_API_KEY`
   - `OPENCODE_API_KEY`
   - `ANALYTICS_ACCOUNT_ID`
   - `ANALYTICS_API_TOKEN`

### 2. Create a Machine Identity for GitHub Actions

1. In Infisical, go to **Project Settings** -> **Machine Identities**.
2. Create a new Machine Identity (e.g., `github-actions-proxy-llms`).
3. Generate a token (`INFISICAL_TOKEN`) scoped to the project and the environments `staging` and `production`.
4. Copy the token; Infisical only shows it once.

### 3. Store the Infisical token in GitHub

For each GitHub environment (`staging` and `production`), add:

- `INFISICAL_TOKEN` — the token generated in the previous step.

### 4. How the CI/CD workflow uses Infisical (reference)

Below is a commented snippet showing how the deploy step in `.github/workflows/ci-cd.yaml` would consume Infisical secrets. It is **not active** in the current workflow and serves as a reference for future adoption.

```yaml
# Example: Deploy step using Infisical (for reference only)
# - name: Install Infisical CLI
#   run: |
#     curl -1sLf 'https://cli.infisical.com/install.sh' | bash
#
# - name: Fetch secrets from Infisical and deploy
#   env:
#     INFISICAL_TOKEN: ${{ secrets.INFISICAL_TOKEN }}
#   run: |
#     infisical secrets sync --env=${{ github.event.inputs.environment || 'staging' }} --path=/
#     # This generates a .env file or injects vars into the environment
#     # Then run the deploy step as usual
#     pnpm exec wrangler deploy --env ${{ github.event.inputs.environment || 'staging' }} --secrets-file .worker-secrets
```

### 5. Local development with Infisical

You can also inject secrets locally using the Infisical CLI:

```bash
infisical login
infisical run --env=staging -- pnpm run deploy:cloudflare
```

Or export the required variables manually after fetching them from Infisical:

```bash
eval $(infisical secrets --env=staging --format=dotenv-export)
pnpm run deploy:cloudflare
```

---

## Worker Runtime Secrets

The deploy workflow generates a temporary `.worker-secrets` file from GitHub Environment or Repository secrets (or from Infisical if configured) and passes it to Wrangler with `--secrets-file`. Values in that file become Worker runtime secret bindings during deploy.

When using **Infisical**, the workflow fetches secrets dynamically before creating `.worker-secrets`, ensuring the latest values are always deployed.

The generated file contains at minimum:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `ANALYTICS_ACCOUNT_ID`
- `ANALYTICS_API_TOKEN`
- `NVIDIA_API_KEY`
- `OPENCODE_API_KEY`

The file is removed after the deploy step and is ignored by git as `.worker-secrets`.

You can still set runtime secrets manually for each Cloudflare environment:

```bash
# staging
pnpm exec wrangler secret put CLOUDFLARE_API_TOKEN --env staging
pnpm exec wrangler secret put CLOUDFLARE_ACCOUNT_ID --env staging
pnpm exec wrangler secret put ANALYTICS_ACCOUNT_ID --env staging
pnpm exec wrangler secret put ANALYTICS_API_TOKEN --env staging
pnpm exec wrangler secret put NVIDIA_API_KEY --env staging
pnpm exec wrangler secret put OPENCODE_API_KEY --env staging

# production
pnpm exec wrangler secret put CLOUDFLARE_API_TOKEN --env production
pnpm exec wrangler secret put CLOUDFLARE_ACCOUNT_ID --env production
pnpm exec wrangler secret put ANALYTICS_ACCOUNT_ID --env production
pnpm exec wrangler secret put ANALYTICS_API_TOKEN --env production
pnpm exec wrangler secret put NVIDIA_API_KEY --env production
pnpm exec wrangler secret put OPENCODE_API_KEY --env production
```

## Local Deployment

The convenience script validates the project and then deploys with Wrangler.

```bash
# Deploy to staging (default)
pnpm run deploy:cloudflare

# Deploy to production
pnpm run deploy:cloudflare -- production
```

Local deploys require these environment variables in your shell or injected by a secrets manager:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Example with a shell:

```bash
export CLOUDFLARE_API_TOKEN="..."
export CLOUDFLARE_ACCOUNT_ID="..."
pnpm run deploy:cloudflare
```

## CI/CD Deployment

GitHub Actions deploys through `.github/workflows/ci-cd.yaml`.

The workflow:

1. Runs dependency install, lockfile validation, lint, typecheck, and tests.
2. Selects the deployment environment from the workflow input, defaulting to `staging`.
3. Creates `.worker-secrets` from GitHub secrets without printing values.
4. Uses `secrets.CLOUDFLARE_API_TOKEN` and `secrets.CLOUDFLARE_ACCOUNT_ID` to authenticate Wrangler.
5. Runs `wrangler deploy --env <environment> --secrets-file .worker-secrets` through `cloudflare/wrangler-action`.
6. Removes `.worker-secrets` after the deploy step.

Manual workflow dispatch supports:

- `staging`
- `production`

Pushes to `main` deploy to `staging` by default.

## Troubleshooting

### `CLOUDFLARE_API_TOKEN is not set`

For local deploys, export `CLOUDFLARE_API_TOKEN` before running the script or inject it through a secrets manager.

For GitHub Actions, confirm the selected environment (`staging` or `production`) has an Environment secret named `CLOUDFLARE_API_TOKEN`.

### `Authentication error [code: 10000]` or `Invalid access token [code: 9109]`

Wrangler rejected the API token during deploy. This usually means the token exists but lacks the required permissions.

**Checklist:**

1. Verify the token is an **API Token** (created in **My Profile > API Tokens**), not the **Global API Key**.
2. Confirm the token has these exact permissions:
   | Resource | Level | Permission |
   |---|---|---|
   | `Account` | `Cloudflare Workers` | **Edit** |
   | `User` | `User Details` | **Read** |
   | `User` | `Memberships` | **Read** |
3. Ensure the token is scoped to the correct **Account** (not just a zone).
4. Regenerate the token in Cloudflare and update the value in the GitHub Environment secret.
5. Re-run the workflow.

### `CLOUDFLARE_ACCOUNT_ID is not set`

Set `CLOUDFLARE_ACCOUNT_ID` locally or add it to the selected GitHub Environment secrets.

### Wrangler warns that bindings are not inherited

Wrangler does not inherit some top-level bindings into named environments. `wrangler.toml` repeats Durable Object and Analytics Engine bindings under both `env.staging` and `env.production` to avoid this warning.

### Runtime secret is missing after deploy

Run the `wrangler secret put` commands for the target environment. Worker runtime secrets are separate from GitHub Actions secrets used to authenticate the deploy.

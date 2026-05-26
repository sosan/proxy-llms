#!/usr/bin/env bash
# init.sh — Verificación e inicialización del entorno Cloudflare Workers + Hono.js
#
# Este script lo ejecuta el agente al COMENZAR una sesión y antes de
# declarar cualquier tarea como `done`. Si falla, la sesión no debe avanzar.
#
# Salida esperada: códigos de salida claros y bloques marcados con [OK]/[FAIL].

set -u

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

ok()   { printf "${GREEN}[OK]${NC}    %s\n" "$1"; }
warn() { printf "${YELLOW}[WARN]${NC}  %s\n" "$1"; }
fail() { printf "${RED}[FAIL]${NC}  %s\n" "$1"; }

EXIT_CODE=0

echo "── 1. Verificando entorno Node.js ─────────────────────"

# Node.js disponible
if ! command -v node >/dev/null 2>&1; then
  fail "node no está instalado"
  exit 1
fi

NODE_VERSION=$(node --version)
ok "node -> ${NODE_VERSION}"

# Versión mínima de Node.js (>= 18 para Cloudflare Workers)
NODE_MAJOR=$(node --version | sed 's/^v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Se requiere Node.js >= 18 (Cloudflare Workers)"
  exit 1
fi
ok "Versión de Node.js compatible (>= 18)"

# pnpm disponible
if ! command -v pnpm >/dev/null 2>&1; then
  fail "pnpm no está instalado"
  exit 1
fi
ok "pnpm -> $(pnpm --version)"

# npx disponible (para wrangler)
if ! command -v npx >/dev/null 2>&1; then
  warn "npx no está disponible (wrangler no funcionará)"
  EXIT_CODE=1
else
  ok "npx disponible"
fi

echo ""
echo "── 2. Verificando dependencias instaladas ─────────────"

if [ ! -d "node_modules" ]; then
  fail "node_modules/ no existe. Ejecuta: pnpm install"
  EXIT_CODE=1
else
  ok "node_modules/ existe"
fi

echo ""
echo "── 3. Verificando archivos base del proyecto ──────────"

for f in package.json server.ts tsconfig.json wrangler.toml vitest.config.ts config/providers.ts; do
  if [ ! -f "$f" ]; then
    fail "Falta archivo base: $f"
    EXIT_CODE=1
  else
    ok "Existe $f"
  fi
done

echo ""
echo "── 4. Validando package.json ─────────────────────────"

node - <<'JS'
const fs = require('fs');

const requiredScripts = ['dev', 'test', 'typecheck'];
const requiredDeps = ['hono'];
const requiredDevDeps = ['vitest', 'wrangler', 'typescript'];

try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

  for (const script of requiredScripts) {
    if (!pkg.scripts || !pkg.scripts[script]) {
      console.log(`[FAIL]  Falta script "${script}" en package.json`);
      process.exit(1);
    }
  }

  for (const dep of requiredDeps) {
    if (!pkg.dependencies || !pkg.dependencies[dep]) {
      console.log(`[WARN]  Falta dependencia "${dep}" en package.json`);
    }
  }

  for (const dep of requiredDevDeps) {
    if (!pkg.devDependencies || !pkg.devDependencies[dep]) {
      console.log(`[WARN]  Falta devDependency "${dep}" en package.json`);
    }
  }

  console.log(`[OK]    package.json válido`);
} catch (e) {
  console.log(`[FAIL]  package.json inválido: ${e.message}`);
  process.exit(1);
}
JS

if [ $? -ne 0 ]; then EXIT_CODE=1; fi

echo ""
echo "── 5. Verificando wrangler CLI ────────────────────────"

if npx wrangler --version >/dev/null 2>&1; then
  ok "wrangler CLI disponible -> $(npx wrangler --version 2>/dev/null | head -1)"
else
  warn "wrangler CLI no disponible (pnpm install -D wrangler)"
  EXIT_CODE=1
fi

echo ""
echo "── 6. Ejecutando typecheck ────────────────────────────"

if pnpm run typecheck 2>&1; then
  ok "TypeScript typecheck pasa"
else
  fail "TypeScript typecheck falló"
  EXIT_CODE=1
fi

echo ""
echo "── 7. Ejecutando tests ────────────────────────────────"

if pnpm run test 2>&1; then
  ok "Todos los tests pasan"
else
  fail "Hay tests rotos"
  EXIT_CODE=1
fi

echo ""
echo "── 8. Resumen ─────────────────────────────────────────"

if [ $EXIT_CODE -eq 0 ]; then
  ok "Entorno listo. Puedes empezar a trabajar."
else
  fail "Entorno NO está listo. Resuelve los errores antes de avanzar."
fi

exit $EXIT_CODE

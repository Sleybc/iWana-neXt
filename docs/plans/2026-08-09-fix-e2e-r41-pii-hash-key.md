# Fix E2E R4.1 — PII_HASH_KEY ausente en CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Estado ejecución (2026-08-09):** Tasks 1–4 DONE por AI-PLAT-OPS (`d14a9b9b`…`ca1cbaf9`). AI-SR-QA: SPEC COMPLIANT. AI-SEC-ENG: PASS WITH NOTES (GO). Pendiente: push + CI verde (G6.5 evidencia remota).

**Goal:** Restaurar el job `execution-orders-e2e` (E2E operativo R4.1) haciendo que la API arranque con `PII_HASH_KEY` efímera, tras el fail-fast SEC-P1.

**Architecture:** SEC-P1 exige `PII_HASH_KEY` (64 hex) en el bootstrap Joi de la API. El job E2E ya genera `MFA_ENCRYPTION_KEY` y `EXECUTION_ORDER_IDEMPOTENCY_SECRET`, pero no `PII_HASH_KEY`. La corrección es dual: (1) inyectar la clave en CI con el mismo patrón de mask/`GITHUB_ENV`; (2) default efímero en el provisioner para que local/CI no dependan solo del workflow. Opcionalmente cablear la misma variable al `worker-e2e`.

**Tech Stack:** GitHub Actions, Node provisioner (`scripts/e2e-provision-operational.mjs`), NestJS Joi (`apps/api/src/app.config.ts`), Docker Compose E2E overlay.

---

## Diagnóstico (evidencia)

| Ítem | Valor |
| --- | --- |
| Runs fallidos | [31287316024](https://github.com/Sleybc/iWana-neXt/actions/runs/31287316024), [31311560193](https://github.com/Sleybc/iWana-neXt/actions/runs/31311560193) |
| Jobs verdes | `adr-citations`, `production-images`, `ci` (lint/typecheck/build/unit) |
| Job rojo | `E2E operativo R4.1 — API + storage + BullMQ reales` |
| Síntoma en gate | `E2E_SETUP no está OK (FAILED\|API E2E terminó antes del healthcheck (código 1).)` |
| Causa raíz (cola API) | `Config validation error: PII_HASH_KEY es obligatoria: sin ella la API no puede calcular HMAC de documento/email/teléfono. Genera una con: openssl rand -hex 32` |
| Contexto | Introducido por SEC-P1 (HMAC + Joi fail-fast). El workflow E2E quedó desalineado al cablear solo MFA/idempotency. |

Cadena de fallo:

```text
compose healthy → migraciones OK → worker-e2e healthy
  → startApi (apps/api/dist/main.js, NODE_ENV=development)
  → Joi rechaza bootstrap sin PII_HASH_KEY → exit 1
  → waitForApiHealth lanza "API E2E terminó antes del healthcheck"
  → E2E_SETUP=FAILED → gate Verify E2E R4.1 falla
```

**No es:** flaky Playwright, Docker unhealthy, lockfile, billing, ni fallo de tests (nunca llega a Playwright).

## Mapa de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `.github/workflows/ci.yml` | Generar/maskear `PII_HASH_KEY` en el paso de credenciales E2E (y documentar en comentario). |
| `scripts/e2e-provision-operational.mjs` | `setRuntimeDefault('PII_HASH_KEY', …)` si falta (defensa en profundidad, como JWT). |
| `docker-compose.e2e.yml` | Pasar `PII_HASH_KEY` a `worker-e2e` para jobs BullMQ que hasheen PII. |
| `docs/runbooks/RUNBOOK-E2E-R41-OPERATIONS-v1.0.md` | Mencionar `PII_HASH_KEY` junto a MFA/idempotency. |

---

### Task 1: Inyectar `PII_HASH_KEY` efímera en el job E2E de CI

**Files:**
- Modify: `.github/workflows/ci.yml` (paso `Generate ephemeral E2E credentials`, ~L672–701)

- [ ] **Step 1: Ampliar el comentario del paso**

Actualizar el bloque de comentario para listar las tres claves Joi requeridas en runner limpio:

```yaml
      # El provisioner exige PLATFORM_SUPER_ADMIN_EMAIL/PASSWORD (fallback
      # E2E_PLATFORM_*) y la API exige EXECUTION_ORDER_IDEMPOTENCY_SECRET
      # (Joi min 32), MFA_ENCRYPTION_KEY (64 hex) y PII_HASH_KEY (64 hex,
      # SEC-P1 / apps/api/src/app.config.ts + pii-hash-key.util.ts).
```

- [ ] **Step 2: Generar, enmascarar y exportar `PII_HASH_KEY`**

En el `run:` del mismo paso, junto a `MFA_KEY`:

```bash
          PII_HASH_KEY="$(openssl rand -hex 32)"

          echo "::add-mask::${PLATFORM_EMAIL}"
          echo "::add-mask::${PLATFORM_PASSWORD}"
          echo "::add-mask::${IDEMPOTENCY_SECRET}"
          echo "::add-mask::${MFA_KEY}"
          echo "::add-mask::${PII_HASH_KEY}"

          echo "PLATFORM_SUPER_ADMIN_EMAIL=${PLATFORM_EMAIL}" >> "$GITHUB_ENV"
          echo "PLATFORM_SUPER_ADMIN_PASSWORD=${PLATFORM_PASSWORD}" >> "$GITHUB_ENV"
          echo "EXECUTION_ORDER_IDEMPOTENCY_SECRET=${IDEMPOTENCY_SECRET}" >> "$GITHUB_ENV"
          echo "MFA_ENCRYPTION_KEY=${MFA_KEY}" >> "$GITHUB_ENV"
          echo "PII_HASH_KEY=${PII_HASH_KEY}" >> "$GITHUB_ENV"
```

Reglas: nunca `echo` del valor; mask **antes** de `$GITHUB_ENV`; 64 hex vía `openssl rand -hex 32`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
fix(ci): inyectar PII_HASH_KEY efímera en E2E R4.1

Sin la clave SEC-P1 la API falla en bootstrap Joi y el gate
E2E_SETUP nunca llega a OK.
EOF
)"
```

---

### Task 2: Default efímero de `PII_HASH_KEY` en el provisioner

**Files:**
- Modify: `scripts/e2e-provision-operational.mjs` (~L216–271, bloque `setRuntimeDefault` / JWT)

- [ ] **Step 1: Añadir default solo si está vacío**

Inmediatamente después del bloque JWT (o junto a los otros `setRuntimeDefault` de secretos), añadir:

```javascript
// SEC-P1: la API (NODE_ENV≠test) exige PII_HASH_KEY en Joi fail-fast.
// CI debe inyectarla; este default cubre runners locales sin .env.
setRuntimeDefault('PII_HASH_KEY', crypto.randomBytes(32).toString('hex'));
```

No imprimir el valor. No sobrescribir si ya viene de CI/`GITHUB_ENV`/`.env` (`setRuntimeDefault` ya protege).

- [ ] **Step 2: (Opcional recomendado) Defaults espejo para MFA e idempotency**

Si en local aún se depende solo del workflow, añadir en el mismo bloque:

```javascript
setRuntimeDefault('MFA_ENCRYPTION_KEY', crypto.randomBytes(32).toString('hex'));
setRuntimeDefault(
  'EXECUTION_ORDER_IDEMPOTENCY_SECRET',
  crypto.randomBytes(24).toString('hex'),
);
```

Solo si faltan; no cambiar valores ya presentes.

- [ ] **Step 3: Commit**

```bash
git add scripts/e2e-provision-operational.mjs
git commit -m "$(cat <<'EOF'
fix(e2e): default efímero de PII_HASH_KEY en provisioner R4.1

Evita que la API muera en healthcheck cuando el runner no trae
la clave SEC-P1 desde el workflow o .env.
EOF
)"
```

---

### Task 3: Cablear `PII_HASH_KEY` en `worker-e2e`

**Files:**
- Modify: `docker-compose.e2e.yml` (servicio `worker-e2e.environment`)

- [ ] **Step 1: Pasar la variable al worker**

El healthcheck actual solo verifica proceso vivo (`node -e "process.kill(1, 0)"`), así que el worker puede marcarse healthy sin la clave. Los jobs que hasheen PII fallarían más adelante. Añadir:

```yaml
      MFA_ENCRYPTION_KEY: ${MFA_ENCRYPTION_KEY:-}
      PII_HASH_KEY: ${PII_HASH_KEY:?PII_HASH_KEY is required}
      EXECUTION_ORDER_IDEMPOTENCY_SECRET: ${EXECUTION_ORDER_IDEMPOTENCY_SECRET:-}
```

Usar `:?` en `PII_HASH_KEY` para fallar en `compose up` con mensaje claro si el provisioner/CI no la exportó (mejor que un worker “healthy” a medias).

- [ ] **Step 2: Commit**

```bash
git add docker-compose.e2e.yml
git commit -m "$(cat <<'EOF'
fix(e2e): pasar PII_HASH_KEY al worker-e2e de R4.1

Alinea el consumidor BullMQ con el fail-fast SEC-P1 de la API.
EOF
)"
```

---

### Task 4: Actualizar runbook E2E R4.1

**Files:**
- Modify: `docs/runbooks/RUNBOOK-E2E-R41-OPERATIONS-v1.0.md`

- [ ] **Step 1: Documentar prerequisito de entorno**

En la sección de variables/prerrequisitos (o “Credenciales”), añadir que CI y local requieren:

- `PII_HASH_KEY` — 64 hex (`openssl rand -hex 32`), independiente de `MFA_ENCRYPTION_KEY`
- Ya existentes: `MFA_ENCRYPTION_KEY`, `EXECUTION_ORDER_IDEMPOTENCY_SECRET`, `PLATFORM_SUPER_ADMIN_*`

Nota de diagnóstico: si el log muestra `API E2E terminó antes del healthcheck` + cola con `PII_HASH_KEY es obligatoria`, la causa es configuración, no Playwright.

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/RUNBOOK-E2E-R41-OPERATIONS-v1.0.md
git commit -m "$(cat <<'EOF'
docs(e2e): documentar PII_HASH_KEY en runbook R4.1

EOF
)"
```

---

### Task 5: Verificar

**Files:**
- Test: gate local del provisioner + CI en verde

- [ ] **Step 1: Validar parser de markers (sin Docker)**

```bash
node scripts/e2e-provision-operational.mjs --validate-playwright-markers
```

Esperado: exit 0 (sin cambios de comportamiento del parser).

- [ ] **Step 2: Smoke local del bootstrap de env (sin levantar todo el stack)**

En PowerShell/bash, con un env mínimo, comprobar que el default se aplica:

```bash
node -e "process.env={...process.env, PII_HASH_KEY:''}; require('child_process').execSync('node -e \"import(\\"./scripts/e2e-provision-operational.mjs\\")\"',{stdio:'ignore'})"
```

Preferible: inspección estática + corrida CI. Si se puede correr R4.1 local:

```bash
# Puerto 3000 libre; Docker disponible
node scripts/e2e-provision-operational.mjs
```

Esperado en stdout (marcadores no secretos):

```text
E2E_API_HEALTH=OK
E2E_SETUP=OK|tenants=...
E2E_PLAYWRIGHT_PASSED=29
E2E_PLAYWRIGHT_FAILED=0
E2E_PLAYWRIGHT_SKIPPED=0
E2E_PLAYWRIGHT_DID_NOT_RUN=0
E2E_PLAYWRIGHT_FLAKY=0
E2E_PLAYWRIGHT_EXIT=0
E2E_CLEANUP=OK
```

- [ ] **Step 3: Empujar y confirmar CI**

Tras push a la rama/PR o `main`:

```bash
gh run list --workflow=ci.yml --limit 3
gh run view <RUN_ID> --json conclusion,jobs --jq '{conclusion, jobs:[.jobs[]|{name,conclusion}]}'
```

Criterio de cierre: job `E2E operativo R4.1` = `success`; artefacto `e2e-r41-summary` con `E2E_SETUP=OK` y conteos 29/0/0/0/0.

- [ ] **Step 4: Si falla de nuevo, leer cola API primero**

```bash
gh run view <RUN_ID> --log-failed | rg "PII_HASH_KEY|E2E_SETUP|Config validation|API E2E"
```

Si aparece otra clave Joi faltante, repetir el mismo patrón (CI + `setRuntimeDefault`), no relajar el gate.

---

## Fuera de alcance

- Rotación de `PII_HASH_KEY` en staging/prod (runbook cifrado §6bis / ventanas SEC-P1).
- Cambiar el esquema Joi o debilitar el fail-fast.
- Reescribir tests Playwright o bajar el piso de 29 passed.
- Regenerar lockfile (no relacionado).

## Criterio de aceptación

1. Logs de CI ya no muestran `PII_HASH_KEY es obligatoria` en el arranque de la API E2E.
2. `E2E_SETUP=OK` y gates R4.1 en verde (29/0/0/0/0, cleanup OK).
3. Ningún secreto `PII_HASH_KEY` aparece sin mask en logs de Actions.
4. Runbook R4.1 menciona la variable.

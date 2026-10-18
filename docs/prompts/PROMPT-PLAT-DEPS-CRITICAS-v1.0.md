# PROMPT — PLAT · Dependencias críticas · Encargo de ejecución (v1.0)

**Plan:** `docs/plans/2026-10-18-plat-deps-criticas.md` v1.0 · **Launcher:** `docs/prompts/PROMPT-PLAT-DEPS-CRITICAS-LAUNCH-v1.0.md`
**Precondición:** G1 aprobado por el CTO el 2026-10-18 (plan §1: D1-A, D2-A, D3-A y D4-A). Sin esa aprobación no se ejecuta ningún bloque que escriba.

## 0. Reglas comunes

1. **Gobernanza:** `AGENTS.md` manda; `.github/copilot-instructions.md` es el bootstrap. Usar **solo `pnpm`**. Trabajar sobre `main`: sin ramas, worktrees, `git stash`, `git reset` ni `git checkout --` sobre archivos ajenos.
2. **Propiedad:** solo `plat-ops` escribe en el repo, y solo en `apps/portal/package.json`, `apps/web/package.json`, `apps/api/package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`, `apps/portal/next.config.ts` y `apps/web/next.config.ts` (D4-A), y los documentos de la fase. Los demás agentes emiten dictamen o evidencia; no editan archivos del repo.
3. **Fuera de alcance:** no tocar ni incluir en ningún commit `.gitignore`, `apps/portal/next-env.d.ts`, `apps/portal/src/components/crm/subscribers/**`, `e2e/tests/portal-crm-suscriptores-ux-qw-live.spec.ts`, ni los documentos MOD05 del 2026-10-17 y 2026-10-18.
4. **Comandos largos** (build, suites, dev) corren en background con log en el scratchpad de la sesión. No volcar variables de entorno, tokens ni cookies a logs ni a documentos.
5. **Evidencia:** cada gate se reporta con comando, código de salida y las líneas literales `Cached:` y `Tests:` (skill `iwana-test-evidence`). Usar `--force` en Turbo. Un verde sin esas líneas no es evidencia.
6. **Escalación:** ante un fallo fuera de su alcance, el agente emite `[BLOQUEO]` con causa y propuesta, y para. No amplía alcance ni cambia D1, D2 ni D3.
7. **Sin PII ni credenciales** en ningún archivo. Texto visible en español.

## 1. Hechos de partida (verificados 2026-10-18)

- `main` en `d9018071`. Audit: 4 críticas, 17 altas, 16 moderadas, 5 bajas (plan §2.1).
- `next` 16.2.12 en portal y web. `proxy-addr` 2.0.7 vía `express` 5.2.1 (`apps/api > @nestjs/platform-express@11.1.16`).
- `apps/api/src/main.ts:89` fija `trust proxy` = 1.
- Aviso de Next.js del 2026-10-14: parches en 16.4.1 y 15.5.28; `sharp` ≥ 0.35.5 para Image Optimization.

## 2. Bloques

### B0 · Línea base · `gate-verifier`
- Antes de tocar nada, sobre el árbol actual (con el WIP de MOD05), ejecutar con `--force`:
  - `pnpm audit --prod --audit-level critical` (se espera código ≠ 0 con 4 críticas; registrar el conteo).
  - `pnpm exec turbo run lint --force --ui=stream`, luego `typecheck` y `build` con la misma forma.
  - `pnpm exec turbo run test --force --ui=stream --concurrency=1 --only -- --coverage --coverageReporters=text-summary --coverageReporters=json-summary`, con `MFA_ENCRYPTION_KEY` efímera (`openssl rand -hex 32`, como R-6.2 de CI).
- Entrega: tabla por paquete (suites, tests, fallidos, `Cached:`) como anexo B0 del informe. Un fallo previo al cambio se registra como preexistente.
- No modifica archivos.

### B1 · Triaje y overrides · `sec-eng` (solo lectura)
- Verificar cada fila del plan §2.2 contra el JSON de `pnpm audit --prod --json`.
- Revisar el diseño de overrides (plan §3.1–3.2) y el efecto de `trust proxy` = 1 con el parche de `proxy-addr`.
- Entrega: dictamen GO, GO con ajustes o NO-GO, con los ajustes numerados. Un NO-GO bloquea B2.

### B1b · Factibilidad de Next · `fe-platform` (solo lectura)
- Leer las notas completas (no solo el primer tramo) de v16.3.0, v16.4.0, v16.4.1 y v16.4.2, y el post de 16.4.
- Identificar cambios que toquen: `cacheComponents` (ambas apps), `output: 'standalone'`, Server Actions, `next/image` y su configuración, CSP y rewrites de `next.config.ts`, y la build con Turbopack.
- Entrega: viable, viable con ajustes o inviable. Si declara breaking changes que toquen el repo, propone un ADR corto en `docs/adrs/` en estado Propuesto, con el siguiente número libre (el último existente es ADR-095), y se detiene hasta que el CTO decida.

### B2 · Manifiestos, overrides y lockfile · `plat-ops`
En este orden:
1. `apps/portal/package.json` y `apps/web/package.json`: `next` a `^16.4.2` (D1 = A; si D1 cambia, la versión aprobada).
2. `apps/api/package.json`: `image-size` a `^2.0.3`, `joi` a `^18.2.9`, `multer` a `^2.4.0`; `nodemailer` a `^9.1.1` (D2 = A) o `^10.0.6` (D2 = B, solo si sr-backend entró al roster aprobado).
3. `pnpm-workspace.yaml`, bloque `overrides`: añadir `proxy-addr@<2.0.8: '>=2.0.8'`, `sharp@<0.35.5: '>=0.35.5'`, `browserslist@<=4.28.6: '>=4.28.7'`, `nanoid@<3.3.18: '>=3.3.18'`, `source-map-js@<1.2.2: '>=1.2.2'`. Reemplazar las seis líneas `next@…` por `next@<16.4.2: '>=16.4.2'`. Ajustar `brace-expansion` según plan §3.2: no tocar las líneas que cubran 1.x o 2.x.
4. `pnpm install` (regenera `pnpm-lock.yaml`). Después, `pnpm install --frozen-lockfile` debe salir con código 0.
5. Verificar: `pnpm why proxy-addr -r`, `pnpm why sharp -r`, `pnpm why next -r`, `pnpm why brace-expansion -r`, `pnpm why nanoid -r`, `pnpm why browserslist -r`. Retirar cualquier override que no cambie nada.
6. `pnpm audit --prod --audit-level critical` debe salir con código 0; `pnpm audit --prod --audit-level high` se registra como conteo.
- Entrega: diff de manifiestos y overrides, salida de `pnpm why` y los dos audits.
- Si `pnpm install` cambia una versión fuera de estos archivos, o aparece una crítica nueva: `[BLOQUEO]`.

### B2c · Configuración de Next (D4-A) · `plat-ops`

Solo después de que B2 termine, porque necesita next 16.4.2 instalado.
1. `apps/web/next.config.ts`: dentro del objeto `nextConfig`, añade `partialPrefetching: false,` y `agentRules: false,`. No cambies `cacheComponents` (ya es `true`), los headers CSP, los rewrites ni el resto de claves.
2. `apps/portal/next.config.ts`: extrae `cacheComponents` a una constante antes de `const nextConfig`, con la misma expresión que hoy (`process.env.IWANA_DISABLE_CACHE_COMPONENTS !== '1'`). En el objeto usa `cacheComponents,` y añade `...(cacheComponents ? { partialPrefetching: false } : {}),` y `agentRules: false,`. Partial Prefetching exige Cache Components: con `IWANA_DISABLE_CACHE_COMPONENTS=1` la clave no se define.
3. No ejecutes `next dev` ni `next build` en este bloque: lo hace B4.
- Entrega: diff de los dos archivos. Si el tipo `NextConfig` de next 16.4.2 no admite alguna clave, `[BLOQUEO]` con la línea del error.

### B3 · Paso de CI · `plat-ops`
En `.github/workflows/ci.yml`, job `ci`, justo después del paso `Install dependencies` y antes de `Validate development tooling`:

```yaml
      # Gate «No critical vulnerabilities» (AGENTS.md → Gates Before Merge).
      # Solo dependencias de producción. Una advisoría crítica deja el job en rojo.
      - name: Auditar dependencias de producción (critical)
        run: pnpm audit --prod --audit-level critical
```

- No renombrar el job `ci` ni los pasos existentes (el nombre puede estar en branch protection). No añadir `continue-on-error`.
- Entrega: diff del workflow. La corrida real se verifica en G6.5.

### B4 · Build y dev de portal/web · `fe-platform` (sin código)
1. `pnpm --filter @iwana/portal build` y `pnpm --filter @iwana/web build`: código 0. Anotar la versión de Next que imprimen.
2. `pnpm --filter @iwana/portal dev` (3002) y `pnpm --filter @iwana/web dev` (3001), en background. `GET /` debe responder sin 5xx. Revisar el log: sin errores ni advertencias nuevas frente a B0.
3. Si el GET no basta, smoke de navegador con `playwright-skill` sobre `/`.
- Entrega: versiones, códigos y líneas relevantes del log. `apps/portal/next-env.d.ts` y `.next` pueden cambiar: no se incluyen en el commit.
- Un fallo que exija cambiar código se reporta como `[BLOQUEO]`. fe-platform no edita.
- Tras `next dev`, `git status` debe mostrar `AGENTS.md` y `CLAUDE.md` sin cambios. Si cambian, restaura su contenido de HEAD y repórtalo. El aviso de `partialPrefetching` no debe aparecer ni en build ni en dev.

### B5 · Gates · `gate-verifier`
Ejecutar:
1. Lint, typecheck, build y tests con cobertura (comandos de B0).
2. `pnpm sync:agents:check`, `pnpm sync:skills:check`, `pnpm sync:mcp:check`, `pnpm test:tooling`.
3. `pnpm audit:adr-citations`, `pnpm audit:doc-locations`.
4. Arranque real de la API: `pnpm --filter @iwana/api build` y `pnpm --filter @iwana/api start` con entorno de desarrollo (Joi activo, `NODE_ENV=development`); `GET /api/v1/health` debe dar 200. Si la infraestructura de desarrollo no responde: `[BLOQUEO]` de infraestructura. El gate lo cubre G6.5 y el informe lo declara no ejecutado localmente.
5. Comparar con B0: ningún test que pasaba ahora falla; los conteos no bajan.
- Trampa a vigilar: en cada paquete, la línea `Tests: N passed` debe tener N > 0. `No tests found` o `Tests: 0 total` cuenta como fallo (`passWithNoTests`).
- Entrega: tabla por paquete con suites, tests, fallidos, `Cached:`, umbrales de cobertura y código de cada comando.

### B6 · Dictamen final · `sec-eng` (solo lectura)
- Revisar el diff de manifiestos, overrides y workflow; la evidencia de B5; y el efecto del parche de `proxy-addr` en `trust proxy` (throttling y logs de auditoría).
- Confirmar: 0 críticas; altas restantes las dos de nodemailer (GHSA-v53p-9fqp-m79j y GHSA-prgh-xp8r-p3m5) si D2 = A; cero PII en logs nuevos.
- Entrega: dictamen GO o NO-GO. Un NO-GO detiene B7.

### B7 · Informe, documentación y commit · padre + `docs-governance`
1. Verificar con `ls` que `docs/informes/INFORME-PLAT-DEPS-CRITICAS-CIERRE-v1.0.md` no exista antes de escribirlo.
2. Informe con: alcance y decisiones D1–D3; línea base (B0); triaje de altas (plan §2.2); overrides y manifiestos; gates con evidencia (plan §4.1); dictámenes B1, B1b y B6; riesgos residuales (plan §6); pendientes (plan §7).
3. Si D1 = A: actualizar la fila de Next.js y el baseline de `docs/prds/Stack_Tecnologico.md` a 16.4.x. No reescribir el histórico de sprints.
4. `docs-governance` audita en solo lectura: nombres, carpetas, citas, límite de 40 líneas del launcher. `pnpm audit:doc-locations` debe salir con código 0.
5. Commit: `git add -- <rutas de plan §8>`. `git diff --cached --name-only` debe ser exactamente esa lista. Si hay algo más en el índice, quitar solo esas rutas ajenas con `git restore --staged -- <ruta>`; nunca `reset --hard`. Commit en `main` con el mensaje de plan §8.
6. No hacer push. El push se pide al CTO (D3).

### G6.5 · CI en main · `plat-ops` (solo tras push autorizado)
1. Con la confirmación del CTO: `git push origin main`.
2. `gh run list --branch main --limit 5`; localizar la corrida del SHA del commit y esperarla.
3. Verificar en verde los jobs `ci` (con el paso nuevo), `production-images` y `execution-orders-e2e`. `e2e-portal-debt-counter` es informativo: su conteo debe ser ≤ 100 (baseline de CI).
4. Anotar en el informe el SHA, el run id y el resultado por job. Sin tokens ni payloads.
- Si un job falla: `[BLOQUEO]` al padre con el job y el paso. No hay commits de corrección sin nueva aprobación.

## 3. Formato de reporte (todos los bloques)
- Cada entregable: ruta, comandos con código de salida, líneas literales de conteo y deuda nueva por severidad.
- Un verde sin `Cached:` y `Tests:` no se reporta como verde.

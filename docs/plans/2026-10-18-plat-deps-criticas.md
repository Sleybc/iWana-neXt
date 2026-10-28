# PLAT · Dependencias críticas · Plan de orquestación

**Versión:** 1.0 · **Fecha:** 2026-10-18 · **Emitido por:** AI-EM-ARCH (modo Orquestador)
**Estado:** **Aprobado por CTO el 2026-10-18 (D1-A, D2-A, D3-A y D4-A).** Cierre técnico completo; commit `a6ca8e3f` en `origin/main`. G6.5 parcial: el contador E2E da 125 fallos frente a ≤ 100 y falta la decisión del CTO (ver el informe, §11).
**Encargo de ejecución:** `docs/prompts/PROMPT-PLAT-DEPS-CRITICAS-v1.0.md` · **Launcher:** `docs/prompts/PROMPT-PLAT-DEPS-CRITICAS-LAUNCH-v1.0.md` (fuente; prevalece si diverge de la sección `## Lanzamiento`).
**Base verificada:** `main` en `d9018071`. Hay WIP de MOD05 Suscriptores UX sin commitear: fuera de alcance (§0.4).

## 0. Definición de fase

### 0.1 Objetivo
Cerrar las cuatro vulnerabilidades **críticas** que `pnpm audit --prod --audit-level critical` reporta sobre `main` (medidas el 2026-10-18), y dejar ese control en CI para que una crítica nueva bloquee el pipeline en vez de pasar sin que nadie la vea.

### 0.2 Alcance
1. Subir `next` en `apps/portal` y `apps/web` a la versión que decida D1 (§1). Recomendación: **16.4.2**.
2. Corregir `proxy-addr` (`apps/api > @nestjs/platform-express > express > proxy-addr`) con un override justificado (§3.1).
3. Triar las 17 altas y decidir cuáles entran (§2.2). Resultado: 16 entran; la 15 queda residual por D2-A.
4. Añadir `pnpm audit --prod --audit-level critical` al job `ci` de `.github/workflows/ci.yml`.
5. Informe de cierre en `docs/informes/` y, si D1 = A, la línea de Next.js del baseline en `docs/prds/Stack_Tecnologico.md`.

### 0.3 Fuera de alcance
- Las 16 moderadas y 5 bajas, salvo los cierres incidentales de §2.3, que se registran en el informe.
- Subir NestJS a 12 (mayor) o forzar express 5.3 por override.
- Cualquier cambio de código de producto, de UI, de API o de esquema de datos.
- G7 y despliegue productivo: diferidos hasta la beta mínima (ADR-095).

### 0.4 Restricciones del checkout compartido
- Todo sobre `main`: sin ramas, worktrees, `git stash` ni `reset`.
- Estos archivos **no** entran en ningún commit de la fase: `.gitignore`; `apps/portal/next-env.d.ts`; `apps/portal/src/components/crm/subscribers/**`; `e2e/tests/portal-crm-suscriptores-ux-qw-live.spec.ts`; `docs/informes/INFORME-MOD05-DEUDA-CIERRE-G6-v1.0.md`; `docs/plans/2026-10-17-mod05-deuda-codigo.md`; y los documentos MOD05 UX del 2026-10-18 (plan, informe, spec y prompts).
- El commit usa pathspec explícito (§8). Antes de commitear, `git diff --cached --name-only` debe coincidir con esa lista.

### 0.5 Criterios de cierre
- `pnpm audit --prod --audit-level critical` sale con código 0.
- G5 con evidencia: cada gate del §4.1 con `Cached: 0` y conteo real.
- Dictámenes: B1 y B6 (sec-eng, GO con ajustes) y B1b (fe-platform, viable con ajustes).
- Informe `docs/informes/INFORME-PLAT-DEPS-CRITICAS-CIERRE-v1.0.md` con línea base, resultado y riesgos residuales.
- Commit en `main` con solo manifiestos, lockfile, CI y documentos de la fase.
- G6.5, si D3 = A: corrida verde de `ci`, `production-images` y `execution-orders-e2e` sobre el SHA del commit.

## 1. Decisiones del CTO antes de lanzar (G1 aprobado el 2026-10-18: D1-A, D2-A, D3-A y D4-A; D2-A confirmada con las dos altas residuales de nodemailer)

| Decisión | Opciones | Recomendación |
| --- | --- | --- |
| **D1 · Versión de Next.js** (portal y web) | **A** `16.4.2` (última estable). **B** `16.4.1` (la que nombra el aviso). **C** `16.3.8`. | **A.** Si las notas completas declaran breaking changes (B1b), ADR corto propuesto antes de tocar manifiestos. |
| **D2 · nodemailer 10** (alta GHSA-v53p) | **A** diferir: `^9.1.1` ahora y bloque propio con sr-backend. **B** `^10.0.6` ahora; sr-backend entra al roster. | **A.** Con D2 = A quedan dos altas (GHSA-v53p-9fqp-m79j y GHSA-prgh-xp8r-p3m5) y tres moderadas (6vj9, 8vvx y g57g) en nodemailer, con dueño y condición de cierre. |
| **D3 · Push a origin/main** | **A** push tras G5/G6 para ejecutar la CI y cerrar G6.5. **B** solo commit local: la fase queda en G6, sin G6.5. | **A**, con confirmación explícita en el momento del push (es una acción hacia afuera). |

¿Por qué no C (16.3.8)? Cierra las ocho advisorías de `next` que el audit lista hoy, pero el aviso de seguridad del 2026-10-14 publica parches solo en 16.4.1 y 15.5.28 y no anuncia nada para la línea 16.3 (§2.1).

**D4 · Configuración de Next (aprobada el 2026-10-18, opción A):** amplía el alcance de escritura de plat-ops a `apps/portal/next.config.ts` y `apps/web/next.config.ts` (`partialPrefetching: false`, en portal condicionado a `cacheComponents`; `agentRules: false`). ADR-096 (propuesto) queda pendiente de aprobación del CTO.

## 2. Diagnóstico verificado (2026-10-18)

### 2.1 Línea base y fuentes
- `pnpm audit --prod`: 42 entradas (4 críticas, 17 altas, 16 moderadas, 5 bajas) sobre 593 dependencias de producción.
- Críticas de `next` (16.2.12 en portal y web; rango `^16.2.11`): GHSA-p293-qw3h-jr36 y GHSA-2xp9-vwfh-vxw4 (corrige ≥16.3.3); GHSA-vcvr-r3jv-pc5j (corrige ≥16.3.6).
- Crítica de `proxy-addr` 2.0.7: GHSA-jqcg-44mw-7w3h (corrige ≥2.0.8). Ruta: `apps/api > @nestjs/platform-express@11.1.16 > express@5.2.1 > proxy-addr`.
- Aviso oficial de Next.js del 2026-10-14 ([nextjs-security-update-october-14-2026](https://nextjs.org/blog/nextjs-security-update-october-14-2026)): parches en **16.4.1** (LTS activa) y **15.5.28**. Incluye una RCE crítica en Image Optimization con SVG en Linux glibc, que exige `sharp` ≥ 0.35.5; una RCE crítica en `use cache` con typed arrays; y una DoS alta en Server Actions. No anuncia parche para la línea 16.3.x.
- Registro npm (consultado el 2026-10-18): `next@16.3.8` publicada el 2026-09-30; `next@16.4.1` el 2026-10-14; `next@16.4.2` el 2026-10-15 (`latest`). Ambas 16.4.x declaran `sharp ^0.35.5`; `sharp` `latest` es 0.35.5.
- El audit de hoy **no lista** las advisorías del aviso de octubre para la versión bloqueada (16.2.12). Eso no prueba que la línea 16.2 esté limpia: el criterio de cierre es la versión objetivo, verificada con `pnpm audit` después de la subida.
- Uso en el repo: `cacheComponents` activo en `apps/web/next.config.ts` y en `apps/portal/next.config.ts` (salvo `IWANA_DISABLE_CACHE_COMPONENTS=1`); `output: 'standalone'` en ambas; cero coincidencias de `next/og` o `ImageResponse` en `apps/`; `apps/api/src/main.ts:89` fija `trust proxy` = 1.
- Notas de release de v16.3.0 y v16.4.0: solo se leyeron los primeros 6.000 caracteres, sin sección de breaking changes visible. La lectura completa es el entregable de B1b.

### 2.2 Triaje de las 17 altas

| # | GHSA | Paquete | Ruta (audit) | Corrige | Decisión | Mecanismo |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | GHSA-cjq9-62q9-8jv4 | next | portal > next | ≥16.3.8 | **Entra** | Subir next (D1) |
| 2 | GHSA-2v37-7h3g-55p8 | nanoid | portal > next > postcss > nanoid | ≥3.3.18 | **Entra** | Override si el lock queda por debajo |
| 3 | GHSA-68fv-2mgg-jv7q | source-map-js | portal > next > postcss > source-map-js | ≥1.2.2 | **Entra** | Override |
| 4 | GHSA-c83g-rgw3-j3cx | browserslist | portal > next > styled-jsx > … > browserslist | ≥4.28.7 | **Entra** | Override |
| 5 | GHSA-73wf-gq98-2v4g | browserslist | (igual que 4) | ≥4.28.7 | **Entra** | Override |
| 6 | GHSA-qhr7-859c-m2p7 | brace-expansion | api > typeorm > glob > minimatch > brace-expansion | ≥5.0.11 | **Entra** | Override unificado ≥5.0.12 |
| 7 | GHSA-6j4f-fj2g-mc7p | brace-expansion | (igual que 6) | ≥5.0.10 | **Entra** | Mismo override |
| 8 | GHSA-5p2g-fcmc-qvqq | image-size | api > image-size | ≥2.0.3 | **Entra** | `^2.0.3` directo |
| 9 | GHSA-w3rx-r6r6-pgpr | image-size | api > image-size | ≥2.0.3 | **Entra** | Mismo bump |
| 10 | GHSA-6h2x-m376-mqjq | joi | api > joi | ≥18.2.6 | **Entra** | `^18.2.9` |
| 11 | GHSA-wc9g-mqfw-jrwm | multer | api > multer | ≥2.3.0 | **Entra** | `^2.4.0` + override transitivo `multer@<2.4.0` |
| 12 | GHSA-qfvm-cv95-jqjf | multer | api > multer | ≥2.3.0 | **Entra** | Mismo bump |
| 13 | GHSA-535w-7cp7-47q4 | multer | api > multer | ≥2.3.0 | **Entra** | Mismo bump |
| 14 | GHSA-2x7j-588g-ccc2 | nodemailer | api > nodemailer | ≥9.1.0 | **Entra** | `^9.1.1` |
| 15 | GHSA-v53p-9fqp-m79j | nodemailer | api > nodemailer | ≥10.0.6 | **Residual (D2-A)** | Corrige en 10.0.6 (major 10.x); PLAT-DEPS-NODEMAILER |
| 16 | GHSA-rgj7-g3m4-5g8c | sharp | portal > next > sharp | ≥0.35.4 | **Entra** | Lo resuelve next ≥16.4.1 |
| 17 | GHSA-wq5f-xc86-pv6w | sharp | (igual que 16) | ≥0.35.5 | **Entra** | Igual, con salvaguarda `sharp@<0.35.5` |

Nota (dictamen B1): las filas 1 a 5, 16 y 17 también afectan a `apps/web` (next 16.2.12). Resultado: **16 de 17 entran** en esta fase. La 15 depende de D2.

### 2.3 Moderadas y bajas (fuera de alcance, se registran)
- **Cierran incidentalmente** con D1 = A y D2 = A: 10 moderadas (`next` 4jqv, f87g, mcj8; `joi` wr44; `multer` 3pph; `nodemailer` 8m3c, wmmp, cc9r; `brace-expansion` q2hr; `baseline-browser-mapping` w5vr) y 4 bajas (`next` 39w2; `joi` 6w3j, gg4h; `multer` qvfw).
- **Restan** y se registran en el informe: 7 moderadas (`nodemailer` 6vj9 y 8vvx, corrigen en 10.0.2 y quedan residuales con D2-A; `js-yaml` r3ph vía `@nestjs/swagger`; `csv-parse` 8cw4 en portal, que corrige en la major 7; `qs` x5fp y 4mjr vía express, con override posible `qs@<6.16.0`; `nodemailer` g57g, nueva con 9.1.1, que no estaba en HEAD) y 1 baja (`@hapi/joi` 6w3j, sin parche publicado).

## 3. Overrides y manifiestos

### 3.1 proxy-addr: override, no actualización upstream
- `express@5.3.0` exige `proxy-addr ^2.0.8`, pero `@nestjs/platform-express` fija `express` **5.2.1** exacto en todas las líneas 11.x consultadas (11.1.16, 11.1.17, 11.1.20, 11.2.0, 11.2.5, 11.2.7). `express@5.2.x` solo publica 5.2.0 y 5.2.1. **No hay corrección upstream dentro de NestJS 11.**
- Descartado: forzar express 5.3.0 por override (cambia el framework HTTP por un parche de 2.0.x) y NestJS 12 (mayor, fuera de stack).
- Elegido: `proxy-addr@<2.0.8: '>=2.0.8'` en `pnpm-workspace.yaml`. Es un parche dentro de `^2.0.7`, el rango que pide express 5.2.1, así que no rompe la resolución.
- Riesgo: con `trust proxy` = 1 (`apps/api/src/main.ts:89`) el parche no cambia `req.ip` en la rama numérica (dictamen B1; la matriz de B2 y B6 lo confirma). Lo revisa sec-eng en B6 por el efecto en throttling y logs de auditoría.

### 3.2 Overrides de pnpm (`pnpm-workspace.yaml`)

| Override | Motivo | Riesgo y control |
| --- | --- | --- |
| `proxy-addr@<2.0.8: '>=2.0.8'` | Crítica GHSA-jqcg | Parche dentro de 2.x |
| `next@<16.4.2: '>=16.4.2'` | Retirado: sustituía las seis líneas `next@…` de HEAD y no tiene efecto con next 16.4.2 | Solo portal y web dependen de next (`pnpm why next -r`) |
| `sharp@<0.35.5: '>=0.35.5'` | Aviso de Next (Image Optimization) y alta 17 | Retirado: 16.4.x ya pide `^0.35.5` y el lock lo resuelve a 0.35.5 |
| `brace-expansion@>=4.0.0 <5.0.12: '>=5.0.12'` | Altas 6 y 7, moderada q2hr | Hoy el lock solo tiene 5.0.9, así que no cruza major. Afecta a todo el árbol, incluidas devDependencies: tests completos de api. Las líneas existentes de brace-expansion no se retiran salvo que `pnpm why` demuestre que quedan absorbidas, y nunca las que cubren 1.x o 2.x |
| `browserslist@<=4.28.6: '>=4.28.7 <4.29.0'` | Altas 4 y 5 | Vía styled-jsx de Next |
| `nanoid@<3.3.18: '>=3.3.18 <4.0.0'` | Alta 2 | Vía postcss de Next; solo ramas 3.x |
| `source-map-js@<1.2.2: '>=1.2.2'` | Alta 3 | Vía postcss de Next |
| `baseline-browser-mapping@<2.11.0: '>=2.11.0 <3.0.0'` (opcional) | Moderada w5vr | Solo si B2 lo confirma necesario |

Lista final aplicada (B2, 2026-10-18): `proxy-addr@<2.0.8: '>=2.0.8'`; `brace-expansion@>=4.0.0 <5.0.12: '>=5.0.12'` (las líneas de HEAD de brace-expansion no se tocaron); `browserslist@<=4.28.6: '>=4.28.7 <4.29.0'`; `nanoid@<3.3.18: '>=3.3.18 <4.0.0'`; `source-map-js@<1.2.2: '>=1.2.2'`; `baseline-browser-mapping@<2.11.0: '>=2.11.0 <3.0.0'` (opcional, confirmado); y `multer@<2.4.0: '>=2.4.0 <3.0.0'`, que no estaba en la tabla: cubre la copia de @nestjs/platform-express@11.1.16. Retirados por no tener efecto: `next@<16.4.2` y `sharp@<0.35.5`. Regla: tras `pnpm install`, cada override se verifica con `pnpm why <paquete> -r`. Un override que no cambie nada se retira; no se acumulan líneas muertas.

### 3.3 Manifiestos y archivos tocados

| Archivo | Cambio | Condición |
| --- | --- | --- |
| `apps/portal/package.json` | `next` `^16.2.11` → `^16.4.2` | D1 = A |
| `apps/web/package.json` | `next` `^16.2.11` → `^16.4.2` | D1 = A |
| `apps/api/package.json` | `image-size` `^2.0.2` → `^2.0.3`; `joi` `^18.2.1` → `^18.2.9`; `multer` `^2.2.0` → `^2.4.0`; `nodemailer` `^9.0.1` → `^9.1.1` | nodemailer: D2 = A |
| `pnpm-workspace.yaml` | Overrides de §3.2 | Siempre |
| `pnpm-lock.yaml` | Regenerado con `pnpm install`; debe pasar `pnpm install --frozen-lockfile` | Siempre |
| `.github/workflows/ci.yml` | Paso nuevo en el job `ci` (B3) | Siempre |
| `docs/prds/Stack_Tecnologico.md` | Fila de Next.js y baseline: 16.1.x → 16.4.x | D1 = A |

Configuración de Next (D4-A, bloque B2c): `apps/portal/next.config.ts` y `apps/web/next.config.ts` entran en el alcance de escritura de plat-ops. Los cambios exactos están en el encargo, sección B2c.

## 4. Bloques, dependencias y olas

```
G1 (CTO: D1, D2, D3)
 ├─ B0 línea base ........ gate-verifier  ┐
 ├─ B1 triaje/overrides .. sec-eng        ├─ ola 0: solo lectura, en paralelo
 └─ B1b factibilidad ..... fe-platform    ┘
      ↓
 B2 manifiestos + overrides + lock ... plat-ops ─► B3 paso CI y B2c config Next ... plat-ops (mismo escritor)
      ↓
 B4 build y dev portal/web ........... fe-platform
      ↓
 B5 gates con conteo real ............ gate-verifier
      ↓
 B6 dictamen final de seguridad ...... sec-eng
      ↓
 B7 informe, auditoría docs, commit .. padre + docs-governance
      ↓  (solo si D3 = A y confirmación de push)
 G6.5 CI en main por SHA ............. plat-ops
```

- **Ruta crítica:** G1 → B2 → B3 → B2c → B4 → B5 → B6 → B7 → G6.5.
- **Escritor único:** plat-ops es el único que escribe en el repo. fe-platform, sec-eng y gate-verifier emiten evidencia o dictamen; no editan. Los builds de portal y web van en serie (B4 antes de B5) para no pisar `.next` ni la caché de turbo.
- **Bloqueos:** un `[BLOQUEO]` detiene el bloque y vuelve al padre con causa y propuesta. Cambiar D1 o D2 reabre G1.

## 5. Matriz de dispatch (agente × skill)

Cada skill se verificó contra disco (`.agents/skills/<nombre>/SKILL.md`, 2026-10-18). Claude Code las lee como documentación antes de actuar; no las invoca como tool.

| Bloque | Subagente | Skills obligatorias | Apoyo (condición) | Descartadas (motivo) | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| B0 Línea base | `gate-verifier` | `iwana-test-evidence`, `verification-before-completion` | `turborepo-caching` si un log no trae `Cached:` | `systematic-debugging` (aún no hay fallo); `testing-patterns` (no se escriben tests) | §4.1, gates 1 y 4–7, con `--force` |
| B1 Triaje y overrides | `sec-eng` | `security-auditor`, `codebase-cleanup-deps-audit` | `backend-security-coder` si toca `trust proxy`, multer o nodemailer; `frontend-security-coder` si toca Image Optimization o Server Actions | `auth-implementation-patterns` (sin cambio de auth); `postgresql` (sin cambio de datos) | `pnpm audit --prod --json` (registro) |
| B1b Factibilidad Next | `fe-platform` | `nextjs-app-router-patterns`, `frontend-dev-guidelines` | `architecture-decision-records` si las notas completas declaran breaking changes | `tailwind-patterns`, `core-components`, `iwana-identity-ui-review` (sin cambio visual); `e2e-testing-patterns` (no se escriben E2E) | Dictamen escrito (sin comando) |
| B2 Manifiestos, overrides, lock | `plat-ops` | `codebase-cleanup-deps-audit`, `monorepo-architect` | `nestjs-expert` si multer, joi o nodemailer exigen código en `apps/api` (escalar a sr-backend; no implementar); `turborepo-caching` si el lock invalida caché | `database-migration`, `bullmq-specialist` (sin esquema ni colas); `docker-expert` (las imágenes las valida CI) | §4.1, gates 1–3 |
| B2c Configuración de Next (D4-A) | `plat-ops` | `nextjs-app-router-patterns`, `architecture-decision-records` | — | `frontend-dev-guidelines`, `tailwind-patterns` (sin cambio de UI); `docker-expert` (sin cambio de imágenes) | §4.1, gate 15 |
| B3 Paso de CI | `plat-ops` | `codebase-cleanup-deps-audit` | `verification-before-completion` al cerrar | `observability-engineer` (no cambia logs); `docker-expert` (sin cambio de imágenes) | Revisión del diff; corrida real en G6.5 |
| B4 Build y dev | `fe-platform` | `nextjs-app-router-patterns`, `frontend-dev-guidelines` | `playwright-skill` si el GET de `/` no basta para el smoke | `iwana-identity-ui-review`, `tailwind-patterns` (sin cambio visual); `e2e-testing-patterns` (no se escriben E2E) | §4.1, gate 11 |
| B5 Gates | `gate-verifier` | `iwana-test-evidence`, `verification-before-completion` | `turborepo-caching` para leer `Cached:`; subagente `e2e-triage` (no es skill) si una corrida E2E local queda roja | `test-driven-development`, `testing-patterns` (sin tests nuevos); `sr-qa` (sin criterios de UX) | §4.1, completo |
| B6 Dictamen final | `sec-eng` | `security-auditor`, `backend-security-coder` (trust proxy, throttling y logs cambian con el parche) | `frontend-security-coder` (si B1b señala cambios de CSP, SVG o Server Actions); `codebase-cleanup-deps-audit` | `openapi-spec-generation` (sin cambio de API); `auth-implementation-patterns` | §4.1, gates 1, 2 y 13 |
| B7 Informe, docs, commit | Padre + `docs-governance` (auditor, solo lectura) | `iwana-cierre-fase`, `docs-architect` | `architecture-decision-records` si D1 exige ADR | `writing-plans` (el plan ya existe) | §4.1, gate 9; launcher ≤ 40 líneas |
| G6.5 CI en main | `plat-ops` | `verification-before-completion` | subagente `e2e-triage` (no es skill) si `execution-orders-e2e` queda roja | `docker-expert` (las imágenes se validan en CI, no localmente) | `gh run list --branch main` y `gh run view` por SHA |

## 4.1 Gates y comandos (G5 y G6)

| # | Gate | Comando | Evidencia exigida |
| --- | --- | --- | --- |
| 1 | Sin críticas | `pnpm audit --prod --audit-level critical` | Código 0 |
| 2 | Altas tras el cambio | `pnpm audit --prod --audit-level high` | Conteo; con D2 = A quedan las altas de nodemailer (GHSA-v53p-9fqp-m79j y GHSA-prgh-xp8r-p3m5) |
| 3 | Lockfile sincronizado | `pnpm install --frozen-lockfile` | Código 0 |
| 4 | Lint | `pnpm exec turbo run lint --force --ui=stream` | `Cached: 0 cached, N total` y código 0 |
| 5 | Typecheck | `pnpm exec turbo run typecheck --force --ui=stream` | Igual |
| 6 | Build | `pnpm exec turbo run build --force --ui=stream` | Igual; genera `.next` de portal y web |
| 7 | Tests y cobertura (paridad con CI) | `pnpm exec turbo run test --force --ui=stream --concurrency=1 --only -- --coverage --coverageReporters=text-summary --coverageReporters=json-summary`, con `MFA_ENCRYPTION_KEY` efímera (R-6.2) | `Cached: 0`; `Tests: N passed` con N > 0 en cada paquete con suite (`No tests found` o `Tests: 0 total` = fallo); umbrales de jest cumplidos (api path-specific 80; web 36/29/32/37; portal 55/47/49/57) |
| 8 | Sincronía de superficies | `pnpm sync:agents:check`, `pnpm sync:skills:check`, `pnpm sync:mcp:check`, `pnpm test:tooling` | Código 0 |
| 9 | Citas ADR y ubicación documental | `pnpm audit:adr-citations`, `pnpm audit:doc-locations` | Código 0 |
| 10 | Arranque real de la API (Joi activo) | `pnpm --filter @iwana/api build`, luego `pnpm --filter @iwana/api start` con entorno de desarrollo; `GET /api/v1/health` | 200. Si la infraestructura de dev no responde: `[BLOQUEO]` de infraestructura; el gate pasa a G6.5 (`execution-orders-e2e`) y el informe lo declara no ejecutado localmente |
| 11 | Build y dev de portal/web | `pnpm --filter @iwana/portal dev` (3002) y `pnpm --filter @iwana/web dev` (3001); `GET /` | Sin 5xx; log sin errores ni advertencias nuevas de cacheComponents o standalone, salvo la validación instant de dev (excepción C, R9) |
| 12 | Sin regresiones frente a la línea base | Comparar B0 con B5 por paquete | Ningún test que pasaba en B0 falla en B5; los conteos no bajan |
| 13 | Dictámenes | B1, B1b y B6 | Escritos: GO, o GO con ajustes cerrados |
| 14 | CI en main (G6.5, si D3 = A) | Jobs `ci` (con el paso nuevo), `production-images` y `execution-orders-e2e` | Verdes sobre el SHA; `e2e-portal-debt-counter` es informativo, ≤ 100 fallos |
| 15 | Configuración de Next (B2c) | `next build` y `next dev` sin aviso de `partialPrefetching`; `git status` sin cambios en `AGENTS.md` ni `CLAUDE.md` tras `next dev` | Sin aviso nuevo; cero cambios en archivos de gobierno |

## 6. Riesgos

| # | Riesgo | Mitigación |
| --- | --- | --- |
| R1 | Next 16.2 → 16.4 cruza dos minors con Cache Components activo en ambas apps: regresión de render o de Server Actions | B1b; B4; B5; sin aumento del conteo de fallos E2E frente a la deuda de CI (baseline 100, informativo) |
| R2 | El override de `brace-expansion` deja minimatch 3 en 5.0.12: frente a HEAD (5.0.9) no cruza major, pero afecta a todo el árbol, incluidas devDependencies | Tests completos de `@iwana/api`; `pnpm why`; retirar el override si no hace falta |
| R3 | El WIP de MOD05 puede romper gates ajenos | B0 como línea base; comparar en B5; sin stash ni commit del WIP |
| R4 | `pnpm audit` depende del endpoint de auditoría del registro: una caída da falso rojo | Aceptado. Sin `continue-on-error`; reintentar el job |
| R5 | Una crítica nueva pone rojo el paso | Es el comportamiento buscado. Decisión explícita: corregir, o excepción documentada con dueño y fecha. No silenciar |
| R6 | next 16.4.2 tiene tres días de publicada | Repetir el audit justo antes del commit; si aparece otra advisoría de la línea, reabrir G1 |
| R7 | Con D2 = A (confirmada el 2026-10-18) quedan dos altas (GHSA-v53p-9fqp-m79j y GHSA-prgh-xp8r-p3m5) y tres moderadas (6vj9, 8vvx y GHSA-g57g-f23g-4646) en nodemailer | Bloque propio con sr-backend (§7), registrado en el informe con dueño y condición de cierre |
| R8 | `trust proxy` = 1: la rama numérica no cambia `req.ip` con el parche (dictamen B1; la matriz de B2 y B6 lo confirma) | B6 revisa throttling y logs de auditoría |
| R9 | Validación instant de Next 16.4 en dev: errores nuevos en `/` (portal y web), `/dashboard` (web) y `/auth/login` (web) | Excepción C aprobada por el CTO el 2026-10-18: deuda de dev con dueño fe-platform y fecha antes de la beta; no afecta al build ni a las respuestas HTTP |

## 7. Siguiente fase (no lanzada)
- **PLAT-DEPS-NODEMAILER** (D2 = A confirmada): bloque de sr-backend para nodemailer 10.x (GHSA-v53p-9fqp-m79j, GHSA-prgh-xp8r-p3m5, 6vj9, 8vvx y GHSA-g57g-f23g-4646; hace falta 10.0.9 o superior), con revisión de cambios en la API de envío y pruebas de correo.
- **Moderadas restantes** (§2.3): lote propio con dueño por paquete.
- **MOD05 Suscriptores UX**: reabrir V4 y G6 cuando cierre G6 de esta fase. Su WIP se commitea en su propio encargo, no en este.

## 8. Entregables y commit (B7)
- Archivos del commit (pathspec explícito): `apps/portal/package.json`, `apps/web/package.json`, `apps/api/package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`, `apps/portal/next.config.ts`, `apps/web/next.config.ts`, `docs/adrs/ADR-096-Configuracion-Next-16-4-Partial-Prefetching-y-Agent-Rules.md` (propuesto), `docs/plans/2026-10-18-plat-deps-criticas.md`, `docs/prompts/PROMPT-PLAT-DEPS-CRITICAS-v1.0.md`, `docs/prompts/PROMPT-PLAT-DEPS-CRITICAS-LAUNCH-v1.0.md`, `docs/informes/INFORME-PLAT-DEPS-CRITICAS-CIERRE-v1.0.md`, y `docs/prds/Stack_Tecnologico.md` si D1 = A.
- Mensaje en inglés, estilo convencional, como los commits recientes de `main`: `fix(deps): patch critical next and proxy-addr advisories and gate critical audit in CI`. Termina con la línea de atribución que indique el entorno de la sesión.
- Antes de commitear, `git diff --cached --name-only` debe ser igual a esa lista. Si no lo es, se detiene y se reporta.

## Lanzamiento
La fuente es `docs/prompts/PROMPT-PLAT-DEPS-CRITICAS-LAUNCH-v1.0.md`, que prevalece si divergen. Bloque idéntico al del archivo:

```text
# LAUNCH — PLAT · Dependencias críticas · Remediación

**Plan:** `docs/plans/2026-10-18-plat-deps-criticas.md` v1.0 · **Encargo:** `docs/prompts/PROMPT-PLAT-DEPS-CRITICAS-v1.0.md` v1.0
**Orden:** filas 0 y 1 en paralelo (solo lectura); luego filas 2, 2c y 3 a 6 en serie · **Gates verificados:** G1 aprobado (2026-10-18) · G4 emitido (encargo y launcher)
**Estado al arrancar:** `main` en `d9018071`, sin cambios de la fase. WIP de MOD05 sin commitear: no tocar ni commitear.
**Bloqueos abiertos:** ninguno. G1 aprobado por el CTO el 2026-10-18 (D1-A, D2-A, D3-A y D4-A; plan §1).

| # | Subagente | Encargo (bloque) | Skills a leer antes de actuar | Contrato |
| --- | --- | --- | --- | --- |
| 0 | `gate-verifier` | B0 línea base | `iwana-test-evidence`, `verification-before-completion` | — |
| 1 | `sec-eng` | B1 triaje y overrides (solo lectura) | `security-auditor`, `codebase-cleanup-deps-audit` | plan §2.2, §3 |
| 1 | `fe-platform` | B1b factibilidad Next (solo lectura) | `nextjs-app-router-patterns`, `frontend-dev-guidelines` | plan §3.3 |
| 2 | `plat-ops` | B2 + B3 manifiestos, overrides, lock y paso CI | `codebase-cleanup-deps-audit`, `monorepo-architect` | plan §3 |
| 2c | `plat-ops` | B2c configuración de Next en portal y web (D4-A) | `nextjs-app-router-patterns`, `architecture-decision-records` | plan §3.3, ADR-096 (propuesto) |
| 3 | `fe-platform` | B4 build y dev portal/web | `nextjs-app-router-patterns`, `frontend-dev-guidelines` | plan §4.1 |
| 4 | `gate-verifier` | B5 gates con conteo real | `iwana-test-evidence`, `verification-before-completion` | plan §4.1 |
| 5 | `sec-eng` | B6 dictamen final (solo lectura) | `security-auditor`, `backend-security-coder` | plan §6 |
| 6 | `docs-governance` | B7 informe y auditoría documental previa al commit | `iwana-cierre-fase`, `docs-architect` | plan §8 |

**Paralelo:** filas 0 y 1 (ambas) a la vez; son solo lectura. Después, 2 → 2c → 3 → 4 → 5 → 6 en serie: un solo escritor y builds no simultáneos.
**Cierre de ola:** G5 con `Cached: 0` y conteos reales; `pnpm audit --prod --audit-level critical` con código 0; dictámenes GO; informe en `docs/informes/`.
**Fuera de la ola:** push y G6.5 solo tras G5/G6 y con confirmación del CTO en ese momento (D3-A).

### Bloque copiar-pegar

> Actúa como ejecutor de la fase PLAT · Dependencias críticas y padre de consolidación.
> Lee `AGENTS.md`, el plan y el encargo indicados arriba. Antes de cualquier cambio, verifica en el plan §1 que el CTO aprobó D1, D2 y D3; si no, detente y no ejecutes nada.
> Despacha las filas de la tabla en ese orden, con el subagente de cada fila, un escritor a la vez, sobre `main` y sin ramas, worktrees ni stash.
> Cada gate se entrega con comando, código de salida y las líneas `Cached:` y `Tests:` literales. Un verde sin esas líneas no es evidencia.
> Commit solo con la lista de §8 del plan. Push y G6.5 solo con confirmación explícita del CTO.
```

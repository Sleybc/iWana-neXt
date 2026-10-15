# MOD05/MOD03 — Soporte de estrato en PDF (D-PDF) · Plan de orquestación

**Fecha:** 2026-10-12 (v1.1: 2026-10-13) · **Versión:** 1.4 · **Emisor:** AI-EM-ARCH (modo EM + Orchestrator)
**Aprobación:** fase D-PDF aprobada por el CTO el 2026-10-12
**Prompt G4:** [PROMPT-MOD05-IVA-PDF-v1.0.md](../prompts/PROMPT-MOD05-IVA-PDF-v1.0.md) — contratos C-MEDIA-1, C-DDL-3 y C-API-4 v1.0
**Launcher vigente (cierre: P4 + gate delta):** [PROMPT-MOD05-IVA-PDF-LAUNCH-v1.3.md](../prompts/PROMPT-MOD05-IVA-PDF-LAUNCH-v1.3.md) · Ola 3: [LAUNCH-v1.2](../prompts/PROMPT-MOD05-IVA-PDF-LAUNCH-v1.2.md) (superado) · Ola 2: [LAUNCH-v1.1](../prompts/PROMPT-MOD05-IVA-PDF-LAUNCH-v1.1.md) (superado) · Ola 1: [LAUNCH-v1.0](../prompts/PROMPT-MOD05-IVA-PDF-LAUNCH-v1.0.md) (superado)
**Fase hermana:** [IVA por punto de servicio](2026-10-12-mod05-iva-punto-servicio.md), que comparte `crm/contracts/**` con P2

**Goal:**
- Aceptar el soporte del estrato en PDF, JPG, PNG o WEBP.
- Verificar que el soporte pertenece al contrato (cierra S-T7-02).
- Retirar del portal los tipos de archivo sin sentido (cierra S-T7-03).

## Estado al 2026-10-14 (v1.4): **G6 de D-PDF — GO**

[Informe de cierre](../informes/INFORME-MOD05-IVA-PDF-CIERRE-G6-v1.0.md). P4 cerró el OpenAPI y el gate delta dio GO. Commit ✅ (`4a1b437a`, `9d227eaf`) · G6.5 ✅ (CI `38735918857`, 2026-10-15: P2, 026 y 145 en PASS; adenda del informe de cierre) · pendiente: G7.

## Estado al 2026-10-14 (v1.3, histórico): disposición de la Ola 3

| Revisión | Veredicto | Disposición AI-EM-ARCH |
| --- | --- | --- |
| `sec-eng` | **GO** | Antivirus de PDF = deuda **Media (P2)**, no bloquea G6 ni G7; condición de G7: MinIO privado |
| `sr-qa` | NO-GO (cobertura OK: `media` 93,33/80,00 %, `crm/contracts` 93,48/94,17 % sin integración) | NO-GO **solo** por la integración, ver la fila siguiente |
| `gate-verifier` | NO-GO por dos causas | (a) integración y (b) OpenAPI |
| (a) Integración P2 en `dbiw`: 7/19 fallan con SQLSTATE 23514 | **Precondición de entorno, no defecto de código.** Esos 7 casos necesitan la migración 026, y `dbiw` quedó sin ella por decisión del CTO (aplicación temporal y revertida). Con la 026 aplicada, la misma suite pasó **19/19** (informe P2). **Decisión:** la evidencia de integración de G6 es esa corrida de P2, más la obligación de que **G6.5** (CI, `DB_NAME=test`, todas las migraciones aplicadas) muestre la suite de P2 **ejecutada, sin omisiones y en verde**. No se exige alterar `dbiw` antes del commit. Tras el commit, aplicar las migraciones pendientes en `dbiw` es el paso normal de desarrollo, y lo decide el CTO | 
| (b) `ApiBody` de `POST /crm/contracts/:id/stratum-evidence` desactualizado | **Confirmado** (`contracts.controller.ts:241-242`: dice «PNG, WebP, JPEG, GIF o icono… no admite PDF»). Falla el gate OpenAPI | **P4** `sr-backend`: corregir la descripción y documentar el 422 `STRATUM_EVIDENCE_TYPE_NOT_ALLOWED` |
| Suites omitidas en la corrida amplia (2 suites, 14 tests) | Pendiente de confirmar | El `gate-verifier` delta confirma que son las opt-in de la línea base (`EV1_REAL_DB`, `TENANT_MIGRATIONS_REAL_DB`) y no las de esta fase |

**Ámbito del commit:** 116 rutas de código y 41 de documentación (lista exacta en el [informe de gates](../informes/INFORME-MOD05-IVA-PDF-GATES-v1.0.md)). `adr065-ola7-sin-cota.spec.ts` entra: sus mocks se adaptaron a las dependencias nuevas.

## Estado al 2026-10-13 (v1.2, histórico)

| Bloque | Estado | Verificación AI-EM-ARCH |
| --- | --- | --- |
| P2 `sr-backend` | ✅ Cerrado ([informe](../informes/INFORME-MOD05-IVA-PDF-P2-v1.0.md)). `tsc` en verde; API `--force` con 338 suites / 4.783 tests; integración en `dbiw` 1 suite / 19 tests, sin omisiones | En el código: `MEDIA_CONSTRAINTS[STRATUM_EVIDENCE]` (`media.service.ts:56`); el upload genérico lo rechaza (`:141`); el `signed-url` genérico lo trata como inexistente (`:314`); máximo 300 s (`:321`); verificación por uso (`contracts.service.ts:905`) más `@Index` único (`contract.entity.ts:18`) |
| Aplicación temporal de la 026 en `dbiw` | Autorizada por el CTO para la integración de P2 y revertida | **Comprobado en la base:** `chk_media_assets_usage` sin `stratum_evidence`, 0 assets de ese uso y 0 registros de la migración en `typeorm_migrations` |
| Ámbito del commit | ~150 rutas sin commitear, todas de las fases IVA y D-PDF (API: crm, commercial, taxation, media, audit; portal: crm/subscribers, commercial/catalog, una spec de expedientes; shared; database; `scripts/audit-contract-fiscal-pii-readonly.sql`; `docs/**`) | Sin rutas ajenas detectadas en el agrupamiento por área; `gate-verifier` entrega la lista exacta |
| Ola 3 | **Lanzada:** `gate-verifier` ∥ `sec-eng` ∥ `sr-qa` | — |

## Estado al 2026-10-13 (v1.1, histórico)

| Bloque | Estado | Disposición AI-EM-ARCH |
| --- | --- | --- |
| P1 `data-eng` | Código y specs escritos, sin commitear. La integración no corrió: los specs de 026 y 145 exigen una base `test` o `iwana_it_*` | Guarda **correcta**: la 026 altera `public.media_assets` y no puede probarse en `dbiw`. La evidencia sale de **CI** (`DB_NAME=test`, `ci.yml:207`) en G6.5; crear `iwana_it_p1` en local es opcional |
| P3 `fe-platform` | Listo, sin commitear; tests del portal en verde según su informe | Depende de exports de `@iwana/shared` que no están en HEAD: va en el commit de ola, no suelto |
| P2 `sr-backend` | **Se lanza ya** | La precondición cambia de «P1 en `main`» a «P1 en el árbol y ninguna sesión de T11 activa». T11 terminó su código; lo único pendiente es verificación |
| `tsc` de API | Rojo (TS2741) | Lo cierra P2. **No** se autoriza un parche aislado de una línea en `media.service.ts`: añadir el uso al mapa sin bloquear los endpoints genéricos dejaría `stratum_evidence` subible por `/media/upload` (ADMIN), contra C-MEDIA-1 |

## Secuencia hasta el commit

1. **P2** (este launcher).
2. **Verificación consolidada en paralelo:**
   - `gate-verifier`: API, portal, shared y db con `turbo --force` y `tsc` en todos los paquetes; integración de contratos en `dbiw` con `E2E_TENANT_SLUG=iwana`.
   - `sec-eng`: cierre de D-PDF (C-MEDIA-1, S-T7-02, S-T7-03).
   - `sr-qa`: matriz D-PDF y cobertura.
3. **Commit:** lo ejecuta el CTO o lo autoriza explícitamente. Ver §Commit.
4. **G6.5:** corrida de CI Linux por SHA, que además ejecuta las integraciones de P1 (`DB_NAME=test`) y de contratos (`E2E_TENANT_SLUG=test`).

## Commit

**Recomendación:** dos commits, cada uno compilable por sí solo.
- **Código:** las fases IVA (T1–T12) y D-PDF (P1–P3), juntas. Comparten `crm/contracts/**`, `@iwana/shared` y el enum de Media, así que separarlas por fase obligaría a commits intermedios que no compilan.
- **Documentación:** `docs/**`.

Se descarta la secuencia de cinco commits propuesta por las sesiones (P2 con el enum → 144/145/runner → 026 → T11 → P3): el commit «P2 con el enum» sin los cambios de T1–T10 de los que depende `crm/contracts` no compila, y G6.5 se mide por SHA. Las rutas van explícitas, sin `git add -A`. El árbol tiene unas 146 rutas: el commit debe excluir lo ajeno a estas dos fases, y `gate-verifier` lista lo que entra.

## 0. Gates y secuencia

| Gate / restricción | Estado |
| --- | --- |
| G1–G3 | Decisión del CTO D-PDF, dentro de ADR-093 D5; sin ADR nuevo (el uso de Media es implementación) |
| G4 | Se firma al lanzar la Ola 1 |
| **Secuencia con la fase IVA** | P2 toca `crm/contracts/**`, que T11 tiene en propiedad exclusiva → **P2 no arranca hasta que T11 cierre**. P1 y P3 no comparten archivos con T11 y corren en paralelo con él |
| G6 de la fase IVA | No depende de D-PDF |

## 1. Olas y ruta crítica

```
Ola 1:  P1 data-eng (migraciones 026 + 145)  ∥  P3 fe-platform (portal)   ∥  [fase IVA: T11 sr-backend]
                 │ en main                                                    │ cerrado
                 └───────────────────────────────┬───────────────────────────┘
Ola 2:                                   P2 sr-backend (media + contratos)
Ola 3:                     sec-eng ∥ sr-qa → gate-verifier · docs-governance → G6 D-PDF
```

**Ruta crítica:** T11 (fase IVA) → P2 → cierre. P1 y P3 corren a su sombra.

## 2. Matriz de dispatch

Skills verificadas en disco (`ls .agents/skills/<nombre>/SKILL.md`, 2026-10-11/12). Se leen como documentación antes de escribir.

| Bloque | Subagente | Obligatorias | Apoyo (condición) | Descartadas y por qué | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| P1 Migraciones | `data-eng` | `postgresql`, `database-migration` | — | `nestjs-expert`: solo el enum de la entidad; `bullmq-specialist`: sin colas | integración `up/down/up` de 026 y 145 contra Postgres real |
| P3 Portal | `fe-platform` | `frontend-dev-guidelines`, `frontend-security-coder`, `testing-patterns`, `system-vocabulary-review` | `playwright-skill` (flujo de carga de PDF) | `ui-ux-pro-max`, `iwana-identity-ui-review` como diseño: no hay cambio visual (sí corre `audit-ui.mjs`) | turbo portal `--force` + `audit-ui.mjs` |
| P2 Media y contratos | `sr-backend` | `nestjs-expert`, `backend-security-coder`, `test-driven-development`, `postgresql` | `auth-implementation-patterns` (bloqueo del uso en los endpoints genéricos) | `database-migration`: el DDL es de P1; `bullmq-specialist`: sin colas | turbo API `--force` + integración del stop/go P2 |
| Cierre seguridad | `sec-eng` | `security-auditor`, `backend-security-coder` | `frontend-security-coder` (`accept` y mensajes) | `test-driven-development`: no escribe código | informe GO/NO-GO |
| Cierre calidad | `sr-qa` | `testing-patterns`, `iwana-test-evidence`, `verification-before-completion` | `e2e-testing-patterns` (si P3 añade E2E) | `ui-ux-pro-max`: no evalúa diseño | matriz stop/go ↔ test + cobertura ≥ 80 % en stmts y branches de `media` y `crm/contracts` |

## 3. Deuda que esta fase cierra y deuda que registra

- **Cierra:** S-T7-02 (Media), S-T7-03 (Baja) y el menor de deriva del helper `contractsApi.create`, heredado del bloqueo de T11.
- **Registra:** escaneo antivirus de PDF subidos (no existe hoy en Media); `sec-eng` decide la severidad.

## Lanzamiento

> Espejo de [PROMPT-MOD05-IVA-PDF-LAUNCH-v1.3.md](../prompts/PROMPT-MOD05-IVA-PDF-LAUNCH-v1.3.md). **El archivo es la fuente y prevalece si divergen.**

Cierre: P4 `sr-backend` (corrección del OpenAPI) → `gate-verifier` delta (OpenAPI, API sin caché, suites omitidas, Adenda 2 del G6 de IVA) → G6 de D-PDF → commit del CTO → G6.5.

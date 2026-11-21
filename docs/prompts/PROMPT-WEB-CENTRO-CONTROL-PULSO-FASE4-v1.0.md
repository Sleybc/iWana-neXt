# PROMPT — WEB-CENTRO-CONTROL · Pulso de plataforma · Fase 4 (P4, uso por empresa)

**Versión:** 1.0 · **Fecha:** 2026-11-21 · **Emisor:** AI-EM-ARCH · **Etapa:** 4 (G4 con contrafirma pendiente del receptor)
**Precondición:** ADR-114 aprobado por el CTO el 2026-11-21 con D3 y la visibilidad (§6). G6 de la Fase 3 (9294ff3c).
**Fuentes:** [ADR-114](../adrs/ADR-114-Uso-por-Empresa-en-la-Consola-de-Plataforma.md) D1–D6 y condiciones 1–7 de §7 · [dirección](../specs/2026-11-21-web-centro-control-pulso-plataforma-direccion.md) §4 B3 · [prototipo](../prototipo/prototipo_web_centro_control.html) bloque «Uso por empresa»

## Contrato congelado (`packages/shared/src/dto/tenant-usage.dto.ts`)

`TenantUsage` v1.0 en `GET /api/v1/tenants/usage`, `{ data }`. `activeSubscribers` y `measuredAt` en `null` = sin dato. Roles autorizados: `PLATFORM_TENANT_USAGE_ROLES` (hoy solo `SYSTEM_ADMIN`); endpoint y consola leen esa constante.

## §A — sr-backend

1. Migración `public`: `tenant_usage_snapshots` (`tenant_id` PK y FK a `tenants` con `ON DELETE CASCADE`, `active_subscribers integer not null`, `measured_at timestamptz not null`). Comprobar que la purga R7 (ADR-108) la borra.
2. CRM expone el conteo de suscriptores activos con su definición vigente (primera activación o contrato activado) como puerto o función de su módulo; el job no copia el SQL ni lee tablas de CRM (condición 1).
3. Job repetible en `apps/worker` cada hora: empresas `ACTIVE` leídas de `public.tenants`, `runInTenantSchema`, `SET LOCAL statement_timeout`, fallo aislado por empresa (no detiene a las demás ni escribe 0), upsert por empresa. Nunca `DB_MIGRATOR_USER` ni `DB_PURGER_USER`. Logs: `tenantId`, duración, resultado (condiciones 2–4).
4. Endpoint en el módulo `tenant` con `@Roles(...PLATFORM_TENANT_USAGE_ROLES)` y guards de plataforma; incluye las empresas `ACTIVE` sin medición con `null`. Auditoría `LIST_ACCESS`, `entityType = 'TenantUsage'`, con `actorId`, `ip` y cantidad devuelta (condiciones 5–6).
5. Pruebas: unitarias y de integración (`DB_NAME=test`): `IWANA_SUPPORT` → 403, JWT de empresa incluido `ADMIN` → 403, anónimo → 401, empresa sin medición → `null`, fallo de una empresa aislado, cascada al borrar la empresa, respuesta sin campos fuera del contrato.

## §B — fe-platform

Área **Uso por empresa** en B3: una fila por empresa con barra `activeSubscribers / maxSubscribers` (sin cupo: solo la cifra), «sin dato» si `null`, marca de desactualizada si `measuredAt` > 2 h. Solo se monta si el rol del usuario está en `PLATFORM_TENANT_USAGE_ROLES`; para otro rol no se pide ni se pinta. Degrada sola con Reintentar.

## §C — sr-qa

Mocks `tenants/usage`, E2E de la portada CA-PP4-01…04 y axe `wcag22aa`.

## Criterios de aceptación

| ID | Criterio |
| --- | --- |
| CA-PP4-01 | `SYSTEM_ADMIN` ve el área; `IWANA_SUPPORT` no la ve ni la pide |
| CA-PP4-02 | Empresa sin medición se pinta «sin dato», nunca 0 |
| CA-PP4-03 | Medición de más de 2 h se marca desactualizada |
| CA-PP4-04 | En error, solo el área degrada, con Reintentar |
| CA-PP4-05 | Integración: 401, 403 de `IWANA_SUPPORT` y de empresa, cascada, aislamiento de fallos |

- **Detenerse si:** CRM no puede exponer el conteo sin romper su boundary, o una condición de §7 no se puede cumplir: `[BLOQUEO]`.

## Paso de cierre

Typecheck, lint y jest de `@iwana/shared`, `@iwana/db`, `@iwana/api`, `@iwana/worker`, `@iwana/web` con conteo real; integración `DB_NAME=test`; `e2e/playwright.web.config.ts`; `boundary-reviewer`, `contract-drift-reviewer`, `test-change-reviewer`; `sec-eng` verifica las condiciones 1–7; revisión en vivo; G6 y commit local sin push.
